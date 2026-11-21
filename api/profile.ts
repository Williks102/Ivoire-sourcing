import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { db, readBody, sanitizeText } from './_lib/server.js';
import { audit, protect, sendError } from './_lib/security.js';
import { notifyUser } from './_lib/telegram.js';
import { botUsername, ensureWebhook, makeLinkToken, telegramConfigured } from './_lib/telegram.js';

/**
 * Création et mise à jour du profil — commandements #2 et #3 du guide (« ne jamais faire confiance au client »).
 *
 * Le navigateur n'écrit PLUS dans la table des profils : il ne peut donc pas se déclarer certifié, premium,
 * administrateur ou bien noté. Seuls les champs de la liste blanche ci-dessous sont modifiables (schéma strict :
 * un champ inconnu est refusé). L'e-mail, l'identité et le rôle de départ sont fixés ici, à partir de la session.
 *
 *   ensure  -> renvoie le profil, le crée à la première connexion (rôle de départ : client ou artisan, jamais admin)
 *   update  -> modifie les champs de la liste blanche
 */

const CITIES = ['Abidjan', 'Bouaké', 'Daloa', 'Yamoussoukro', 'San-Pédro', 'Korhogo', 'Man'] as const;
const CATEGORIES = ['plomberie', 'electricite', 'climatisation', 'peinture', 'menage', 'autre'] as const;
const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200&auto=format&fit=crop';

const Fields = z.object({
  displayName: z.string().trim().min(1).max(80),
  bio: z.string().trim().max(1000),
  location: z.union([z.enum(CITIES), z.literal('')]),
  phone: z.string().trim().max(30).regex(/^[0-9 +().-]*$/, 'Numéro invalide'),
  skills: z.array(z.string().trim().min(1).max(60)).max(30),
  trades: z.array(z.enum(CATEGORIES)).max(6),
  experienceYears: z.number().int().min(0).max(60),
  serviceCities: z.array(z.enum(CITIES)).max(7),
  whatsappConsent: z.boolean(),
  payoutOperator: z.enum(['wave', 'orange', 'mtn', 'moov', '']),
  payoutPhone: z.string().trim().max(30).regex(/^[0-9 +().-]*$/, 'Numéro invalide'),
  businessName: z.string().trim().max(120),
  businessRegistration: z.string().trim().max(60),
}).partial().strict();

const Schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ensure'), role: z.enum(['employer', 'candidate']).default('candidate'), displayName: z.string().trim().min(1).max(80).optional() }).strict(),
  z.object({ action: z.literal('update'), fields: Fields }).strict(),
  z.object({ action: z.literal('telegramLink') }).strict(),
  z.object({ action: z.literal('telegramUnlink') }).strict(),
]);

/** Ce que le navigateur reçoit : jamais de champ système Appwrite, rôle admin uniquement d'après le label. */
function present(row: any, isAdmin: boolean) {
  const clean: Record<string, unknown> = Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith('$') && k !== 'telegramChatId'));
  let verificationDocs: unknown = clean.verificationDocs;
  if (typeof verificationDocs === 'string') { try { verificationDocs = JSON.parse(verificationDocs); } catch { verificationDocs = []; } }
  return { ...clean, uid: row.$id, telegramLinked: !!row.telegramChatId, verificationDocs, role: isAdmin ? 'admin' : row.role === 'admin' ? 'candidate' : row.role };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const user = await protect(req, { name: 'profile', max: 30, windowSec: 60 });
    const parsed = Schema.safeParse(readBody(req));
    if (!parsed.success) return res.status(400).json({ error: 'Données invalides : ' + (parsed.error.issues[0]?.message || 'vérifiez les champs.') });
    const input = parsed.data;
    const isAdmin = user.labels.includes('admin');

    let row: any = null;
    try { row = await db.get('users', user.$id); } catch { /* profil absent */ }

    if (input.action === 'ensure') {
      if (!row) {
        const data = {
          uid: user.$id,
          role: input.role,
          displayName: sanitizeText(input.displayName || user.name || user.email.split('@')[0] || 'Utilisateur', 80),
          email: user.email,
          photoURL: DEFAULT_AVATAR,
          skills: [],
          isVerified: false,
          isPremium: false,
          averageRating: 0,
          reviewCount: 0,
          createdAt: new Date().toISOString(),
        };
        // Lecture réservée au propriétaire ; AUCUNE permission d'écriture : seul le serveur (et les admins) modifie un profil.
        row = await db.create('users', user.$id, data, [`read("user:${user.$id}")`]);
        await audit(req, user.$id, 'profile.create', user.$id, { role: input.role });
      } else {
        // Remise en ordre des profils créés avant ce durcissement (droits d'écriture du propriétaire, faux rôle admin).
        const perms: string[] = row.$permissions || [];
        const writable = perms.some((p) => /^(update|delete|write)\("user:/.test(p));
        const fakeAdmin = row.role === 'admin' && !isAdmin;
        if (writable || fakeAdmin) {
          row = await db.update('users', user.$id, fakeAdmin ? { role: 'candidate' } : {}, [`read("user:${user.$id}")`]);
          await audit(req, user.$id, 'profile.lockdown', user.$id, { writable, fakeAdmin });
        }
      }
      return res.status(200).json({ success: true, profile: present(row, isAdmin) });
    }

    if (input.action === 'telegramLink' || input.action === 'telegramUnlink') {
      if (!row) return res.status(404).json({ error: 'Profil introuvable.' });
      if (input.action === 'telegramUnlink') {
        const updated = await db.update('users', user.$id, { telegramChatId: '' });
        await audit(req, user.$id, 'telegram.unlink', user.$id);
        return res.status(200).json({ success: true, profile: present(updated, isAdmin) });
      }
      if (!telegramConfigured()) return res.status(503).json({ error: "Les notifications Telegram ne sont pas encore activées sur ce site." });
      await ensureWebhook();
      const url = `https://t.me/${await botUsername()}?start=${makeLinkToken(user.$id)}`;
      return res.status(200).json({ success: true, url });
    }

    // update
    if (!row) return res.status(404).json({ error: 'Profil introuvable.' });
    const f = input.fields;
    const data: Record<string, unknown> = {};
    if (f.displayName !== undefined) data.displayName = sanitizeText(f.displayName, 80);
    if (f.bio !== undefined) data.bio = sanitizeText(f.bio, 1000);
    if (f.location !== undefined) data.location = f.location;
    if (f.phone !== undefined) data.phone = f.phone;
    if (f.skills !== undefined) data.skills = f.skills.map((s) => sanitizeText(s, 60)).filter(Boolean);
    if (f.trades !== undefined) data.trades = f.trades;
    if (f.experienceYears !== undefined) data.experienceYears = f.experienceYears;
    if (f.serviceCities !== undefined) data.serviceCities = f.serviceCities;
    if (f.businessName !== undefined) data.businessName = sanitizeText(f.businessName, 120);
    if (f.businessRegistration !== undefined) data.businessRegistration = sanitizeText(f.businessRegistration, 60);
    if (f.whatsappConsent !== undefined) {
      data.whatsappConsent = f.whatsappConsent;
      // La date du consentement est fixée par le serveur (preuve), pas par le navigateur.
      if (f.whatsappConsent && !row.whatsappConsent) data.whatsappConsentAt = new Date().toISOString();
      if (!f.whatsappConsent) data.whatsappConsentAt = null;
    }
    if (f.payoutOperator !== undefined) data.payoutOperator = f.payoutOperator;
    if (f.payoutPhone !== undefined) data.payoutPhone = f.payoutPhone.replace(/\s+/g, '');
    const payoutChanged = ('payoutOperator' in data && data.payoutOperator !== (row.payoutOperator || '')) || ('payoutPhone' in data && data.payoutPhone !== (row.payoutPhone || ''));
    const updated = await db.update('users', user.$id, data);
    await audit(req, user.$id, 'profile.update', user.$id, { fields: Object.keys(data) });
    if (payoutChanged) {
      // Le numéro de reversement est sensible (détournement de fonds en cas de piratage) : tracé et signalé à l'artisan.
      await audit(req, user.$id, 'profile.payout.change', user.$id, { operator: String(data.payoutOperator ?? row.payoutOperator ?? ''), phoneEnd: String(data.payoutPhone ?? row.payoutPhone ?? '').slice(-3) });
      await notifyUser(user.$id, '🔐 Votre numéro de reversement vient d’être modifié. Si ce n’est pas vous, changez votre mot de passe et contactez-nous.');
    }
    return res.status(200).json({ success: true, profile: present(updated, isAdmin) });
  } catch (error: any) {
    return sendError(res, error, '[profile]');
  }
}
