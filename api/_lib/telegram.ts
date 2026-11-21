import { createHmac } from 'node:crypto';
import { HttpError, db, safeEqual } from './server.js';
import { CATEGORY_LABELS, type ArtisanRow, type MissionLite } from './outreach.js';
import { forPrompt, stripContacts } from './ai.js';

/**
 * Notifications Telegram (bot créé avec @BotFather). Jamais bloquant : une panne Telegram ne doit pas faire échouer
 * la publication d'une mission ou l'envoi d'une offre.
 *
 * Variable Vercel : TELEGRAM_BOT_TOKEN (secret). Le secret du webhook et les jetons de liaison en sont dérivés (HMAC),
 * il n'y a donc rien d'autre à configurer. Le jeton n'apparaît jamais dans les journaux ni dans les erreurs.
 */

export const MAX_RECIPIENTS = 40;
const TIMEOUT_MS = 4000;

const token = () => process.env.TELEGRAM_BOT_TOKEN || '';
export const telegramConfigured = () => !!token();

const hmac = (label: string) => createHmac('sha256', token()).update(label).digest('hex');
/** Secret attendu dans l'en-tête X-Telegram-Bot-Api-Secret-Token (caractères autorisés par Telegram : hexadécimal). */
export const webhookSecret = () => hmac('webhook').slice(0, 48);
export const isTelegramSecret = (value: unknown) => telegramConfigured() && safeEqual(value, webhookSecret());

export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function appUrl(): string {
  const base = process.env.APP_URL || (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) || '';
  return base.replace(/\/$/, '');
}

async function call(method: string, body: Record<string, unknown>): Promise<any> {
  if (!telegramConfigured()) throw new HttpError(503, 'Telegram non configuré.');
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new HttpError(502, 'Telegram injoignable.');
  }
  const data: any = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    const err = new HttpError(response.status === 403 ? 403 : 502, `Telegram ${method} -> ${response.status} ${String(data?.description || '').slice(0, 120)}`);
    throw err;
  }
  return data.result;
}

// --- Liaison d'un compte : jeton signé, valable 24 h, sans état côté serveur -------------------------------------

const b64 = (s: string) => Buffer.from(s).toString('base64url');
const fromB64 = (s: string) => Buffer.from(s, 'base64url').toString();

/** Paramètre `start` du lien t.me : base64url(uid|expiration) + 16 caractères de signature (64 caractères maximum). */
export function makeLinkToken(uid: string, now = Date.now()): string {
  const payload = b64(`${uid}|${(now + 24 * 3600 * 1000).toString(36)}`);
  const sig = hmac('link:' + payload).slice(0, 16);
  const out = payload + sig;
  if (out.length > 64) throw new HttpError(500, 'Identifiant trop long pour le lien Telegram.');
  return out;
}

export function readLinkToken(value: unknown, now = Date.now()): string | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{20,64}$/.test(value) || !telegramConfigured()) return null;
  const payload = value.slice(0, -16);
  if (!safeEqual(value.slice(-16), hmac('link:' + payload).slice(0, 16))) return null;
  const [uid, exp] = fromB64(payload).split('|');
  if (!uid || !exp || parseInt(exp, 36) < now) return null;
  return uid;
}

let usernameCache = '';
export async function botUsername(): Promise<string> {
  if (process.env.TELEGRAM_BOT_USERNAME) return process.env.TELEGRAM_BOT_USERNAME.replace(/^@/, '');
  if (!usernameCache) usernameCache = (await call('getMe', {})).username || '';
  if (!usernameCache) throw new HttpError(502, 'Nom du bot Telegram introuvable.');
  return usernameCache;
}

let webhookChecked = '';
/** Enregistre le webhook auprès de Telegram s'il ne l'est pas déjà (appelé quand quelqu'un demande un lien de liaison). */
export async function ensureWebhook(): Promise<void> {
  const url = `${appUrl()}/api/webhook`;
  if (!appUrl() || webhookChecked === url) return;
  const info = await call('getWebhookInfo', {});
  if (info?.url !== url) await call('setWebhook', { url, secret_token: webhookSecret(), allowed_updates: ['message'], max_connections: 10 });
  webhookChecked = url;
}

// --- Envoi ---------------------------------------------------------------------------------------------------------

export interface Button { text: string; url: string }

/** true = envoyé ; 'blocked' = l'utilisateur a bloqué le bot ; false = échec. Ne lève jamais d'exception. */
export async function sendTelegram(chatId: string, html: string, button?: Button): Promise<true | 'blocked' | false> {
  try {
    await call('sendMessage', {
      chat_id: chatId,
      text: html.slice(0, 3500),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(button ? { reply_markup: { inline_keyboard: [[{ text: button.text, url: button.url }]] } } : {}),
    });
    return true;
  } catch (error: any) {
    if (error?.status === 403) return 'blocked';
    console.error('[telegram] envoi impossible:', String(error?.message || error).slice(0, 160));
    return false;
  }
}

/** Notifie un utilisateur s'il a relié Telegram. Un compte qui a bloqué le bot est délié automatiquement. */
export async function notifyUser(userId: string, html: string, button?: Button): Promise<boolean> {
  if (!telegramConfigured() || !userId) return false;
  try {
    const row = await db.get('users', userId);
    const chatId = typeof row.telegramChatId === 'string' ? row.telegramChatId : '';
    if (!chatId) return false;
    const result = await sendTelegram(chatId, html, button);
    if (result === 'blocked') await db.update('users', userId, { telegramChatId: '' }).catch(() => {});
    return result === true;
  } catch {
    return false;
  }
}

export const missionButton = (missionId: string, text = 'Voir la mission'): Button | undefined =>
  appUrl() ? { text, url: `${appUrl()}/?mission=${encodeURIComponent(missionId)}` } : undefined;

const fcfa = (n: unknown) => `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} FCFA`;

// --- Nouvelle mission -> artisans concernés ------------------------------------------------------------------------

/** Artisans à prévenir : même métier, zone couverte, Telegram relié, pas déjà prévenus pour cette mission. */
export function matchTelegram(mission: MissionLite, artisans: (ArtisanRow & { telegramChatId?: string })[], already: Set<string>) {
  const out: { id: string; chatId: string }[] = [];
  for (const a of artisans) {
    if (a.role !== 'candidate' || !a.telegramChatId || already.has(a.$id)) continue;
    if (!(a.trades || []).includes(mission.category)) continue;
    const cities = a.serviceCities?.length ? a.serviceCities : a.location ? [a.location] : [];
    if (cities.length > 0 && !cities.includes(mission.location)) continue;
    out.push({ id: a.$id, chatId: a.telegramChatId });
  }
  return out;
}

export function missionMessage(m: MissionLite & { description?: string }): string {
  const lines = [
    '🔔 <b>Nouvelle mission</b>',
    `🔧 ${esc(CATEGORY_LABELS[m.category] || m.category)} — ${esc(forPrompt(m.title, 90))}`,
    `📍 ${esc(m.location)}${m.address ? `, ${esc(forPrompt(m.address, 60))}` : ''}`,
    `💰 Budget : ${fcfa(m.budget)}`,
  ];
  if (m.scheduledDate) {
    const d = new Date(m.scheduledDate);
    if (!isNaN(d.getTime())) lines.push(`📅 ${d.toLocaleDateString('fr-FR')}`);
  }
  const summary = stripContacts(forPrompt(m.aiSummary || m.description, 160));
  if (summary) lines.push('', esc(summary));
  lines.push('', 'Les réponses rapides ont plus de chances d’être retenues.');
  return lines.join('\n');
}

/** Envoie la mission aux artisans concernés (une seule fois par artisan). Renvoie le nombre de messages envoyés. */
export async function notifyMissionArtisans(mission: any): Promise<number> {
  if (!telegramConfigured()) return 0;
  try {
    const [artisans, log] = await Promise.all([db.listAllEqual('users', 'role', 'candidate'), db.listAllEqual('outreach', 'missionId', mission.$id)]);
    const already = new Set<string>(log.filter((r: any) => r.channel === 'telegram').map((r: any) => r.artisanId));
    const targets = matchTelegram(mission, artisans, already).slice(0, MAX_RECIPIENTS);
    if (targets.length === 0) return 0;

    const text = missionMessage(mission);
    const button = missionButton(mission.$id, 'Proposer mon offre');
    let sent = 0;
    await Promise.all(targets.map(async (t) => {
      const result = await sendTelegram(t.chatId, text, button);
      if (result === 'blocked') await db.update('users', t.id, { telegramChatId: '' }).catch(() => {});
      if (result !== true) return;
      sent++;
      await db.create('outreach', 'unique()', { missionId: mission.$id, artisanId: t.id, channel: 'telegram', adminId: 'auto', createdAt: new Date().toISOString() }).catch(() => {});
    }));
    return sent;
  } catch (error: any) {
    console.error('[telegram] diffusion impossible:', String(error?.message || error).slice(0, 160));
    return 0;
  }
}

export { fcfa };
