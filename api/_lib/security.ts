import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { HttpError, authenticate, db } from './server.js';

/**
 * Garde commune à toutes les routes /api (guide du vibecoder sécurisé : commandements #6, #8, #10, #12).
 *
 *   1. Origine (anti-CSRF)        : seules les pages de l'application peuvent appeler l'API depuis un navigateur
 *   2. Limitation par adresse IP  : avant toute authentification, pour protéger aussi le service d'authentification
 *   3. Authentification (JWT)     : identité vérifiée auprès d'Appwrite
 *   4. Limitation par utilisateur : quotas propres à chaque route (ex : appels IA, paiements)
 *
 * L'API utilise un jeton `Authorization: Bearer` (jamais de cookie automatique) : le CSRF classique ne s'applique pas,
 * mais on vérifie quand même l'en-tête Origin, comme le recommande le guide.
 */

/** Première adresse de x-forwarded-for : fiable derrière le proxy de Vercel. */
export function clientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (raw || '').split(',')[0].trim() || 'inconnue';
}

/** Origines autorisées : APP_URL, ALLOWED_ORIGINS (liste séparée par des virgules) et les adresses du déploiement Vercel courant. */
export function allowedOrigins(): string[] {
  const list = new Set<string>();
  const add = (v?: string) => { if (v) list.add(v.replace(/\/$/, '')); };
  add(process.env.APP_URL);
  (process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean).forEach(add);
  if (process.env.VERCEL_URL) add(`https://${process.env.VERCEL_URL}`);
  if (process.env.VERCEL_BRANCH_URL) add(`https://${process.env.VERCEL_BRANCH_URL}`);
  if (process.env.VERCEL_ENV !== 'production') { add('http://localhost:3000'); add('http://localhost:5173'); }
  return [...list];
}

export function checkOrigin(req: VercelRequest) {
  const origin = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin;
  if (!origin || !allowedOrigins().includes(origin.replace(/\/$/, ''))) throw new HttpError(403, 'Origine non autorisée.');
}

// ---------------------------------------------------------------- limitation du nombre de requêtes

const memory = new Map<string, { count: number; resetAt: number }>();
let warned = false;

/** Vide les compteurs en mémoire (tests). */
export function resetRateLimits() { memory.clear(); }

function upstash() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

/** Compteur à fenêtre fixe. Upstash Redis (partagé entre toutes les instances) s'il est configuré, sinon mémoire de l'instance. */
async function hit(key: string, windowSec: number): Promise<{ count: number; retryAfter: number }> {
  const windowMs = windowSec * 1000;
  const bucket = Math.floor(Date.now() / windowMs);
  const retryAfter = Math.max(1, Math.ceil(((bucket + 1) * windowMs - Date.now()) / 1000));
  const store = upstash();
  if (store) {
    try {
      const response = await fetch(`${store.url}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${store.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([['INCR', `rl:${key}:${bucket}`], ['EXPIRE', `rl:${key}:${bucket}`, String(windowSec + 5)]]),
      });
      if (response.ok) {
        const out = await response.json();
        const count = Number(out?.[0]?.result);
        if (Number.isFinite(count)) return { count, retryAfter };
      }
    } catch { /* service indisponible : repli sur la mémoire ci-dessous (on ne bloque pas les utilisateurs) */ }
  }
  if (!store && !warned) { warned = true; console.warn('[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN absents : limitation en mémoire (par instance) seulement.'); }
  const now = Date.now();
  if (memory.size > 5000) for (const [k, v] of memory) if (v.resetAt < now) memory.delete(k);
  const memKey = `${key}:${bucket}`;
  const entry = memory.get(memKey) || { count: 0, resetAt: (bucket + 1) * windowMs };
  entry.count++;
  memory.set(memKey, entry);
  return { count: entry.count, retryAfter };
}

export async function rateLimit(key: string, max: number, windowSec: number) {
  const { count, retryAfter } = await hit(key, windowSec);
  if (count > max) throw new HttpError(429, 'Trop de requêtes : patientez un instant avant de réessayer.', { 'Retry-After': String(retryAfter) });
}

// ---------------------------------------------------------------- garde

export interface Quota { name: string; max: number; windowSec: number }

/** Origine, limitation par IP, authentification, limitation par utilisateur. Renvoie l'utilisateur authentifié. */
export async function protect(req: VercelRequest, quota: Quota) {
  checkOrigin(req);
  // Limite par IP volontairement large : plusieurs utilisateurs peuvent partager la même adresse (réseaux mobiles).
  await rateLimit(`ip:${quota.name}:${clientIp(req)}`, Math.max(quota.max * 10, 120), quota.windowSec);
  const user = await authenticate(req);
  await rateLimit(`u:${quota.name}:${user.$id}`, quota.max, quota.windowSec);
  return user;
}

// ---------------------------------------------------------------- journal d'audit

/**
 * Journal des actions sensibles (paiements, attributions, reversements, accès aux pièces d'identité…).
 * Ne lève jamais d'erreur : un journal indisponible ne doit pas bloquer l'action. Ne contient aucun secret.
 */
export async function audit(req: VercelRequest | null, actorId: string, action: string, targetId = '', meta: Record<string, unknown> = {}) {
  try {
    await db.create('audit_logs', randomUUID().replace(/-/g, '').slice(0, 30), {
      actorId: String(actorId).slice(0, 64),
      action: action.slice(0, 60),
      targetId: String(targetId).slice(0, 64),
      ip: req ? clientIp(req).slice(0, 64) : '',
      meta: JSON.stringify(meta).slice(0, 500),
      createdAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[audit] écriture impossible :', error?.message);
  }
}

// ---------------------------------------------------------------- réponse d'erreur uniforme

/** Erreurs métier (HttpError) renvoyées telles quelles ; toute autre erreur : message générique, détail dans les journaux. */
export function sendError(res: VercelResponse, error: unknown, tag: string) {
  if (error instanceof HttpError) {
    for (const [name, value] of Object.entries(error.headers)) res.setHeader?.(name, value);
    return res.status(error.status).json({ error: error.message });
  }
  console.error(tag, (error as any)?.message);
  return res.status(500).json({ error: 'Erreur serveur.' });
}
