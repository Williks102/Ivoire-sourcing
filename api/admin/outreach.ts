import type { VercelRequest, VercelResponse } from '@vercel/node';
import { audit, protect, rateLimit, sendError } from '../_lib/security.js';
import { z } from 'zod';
import { HttpError, MISSION_STATUS, db, readBody, requireAdmin } from '../_lib/server.js';
import { buildTemplateMessage, draftMessageWithAi, matchArtisans } from '../_lib/outreach.js';
import { aiAvailable } from '../_lib/ai.js';

/**
 * Diffusion d'une mission aux artisans concernés — réservé à l'administration.
 *
 *   candidates     -> artisans correspondants (métier, ville, consentement WhatsApp, numéro valide)
 *   draftMessage   -> message WhatsApp prêt à envoyer (IA si disponible, sinon modèle fixe)
 *   markContacted  -> enregistre qu'un artisan a été contacté pour cette mission
 *
 * L'envoi lui-même est manuel (lien wa.me depuis le WhatsApp de l'administrateur) : rien n'est envoyé d'ici.
 */

const Schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('candidates'), missionId: z.string().min(1).max(64) }),
  z.object({ action: z.literal('draftMessage'), missionId: z.string().min(1).max(64), useAi: z.boolean().default(true) }),
  z.object({ action: z.literal('markContacted'), missionId: z.string().min(1).max(64), artisanId: z.string().min(1).max(64) }),
]);

function missionLink(missionId: string) {
  const base = process.env.APP_URL || (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) || '';
  if (!base) throw new HttpError(500, 'APP_URL non configuré.');
  return `${base.replace(/\/$/, '')}/?mission=${encodeURIComponent(missionId)}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const user = await protect(req, { name: 'admin-outreach', max: 60, windowSec: 60 });
    requireAdmin(user);
    const parsed = Schema.safeParse(readBody(req));
    if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });
    const input = parsed.data;

    const mission = await db.get('jobs', input.missionId);
    if (mission.status !== MISSION_STATUS.OPEN) throw new HttpError(409, "Seules les missions ouvertes aux offres peuvent être diffusées.");

    if (input.action === 'candidates') {
      const [artisans, log] = await Promise.all([db.listAllEqual('users', 'role', 'candidate'), db.listAllEqual('outreach', 'missionId', mission.$id)]);
      const contactedAt: Record<string, string> = {};
      for (const row of log) if (!contactedAt[row.artisanId] || row.createdAt > contactedAt[row.artisanId]) contactedAt[row.artisanId] = row.createdAt;
      const { matches, excluded } = matchArtisans(mission, artisans, contactedAt);
      return res.status(200).json({ success: true, candidates: matches, excluded, aiAvailable: aiAvailable() });
    }

    if (input.action === 'draftMessage') {
      // L'IA a un quota à part (coût) : 10 brouillons par minute et par administrateur.
      if (input.useAi) await rateLimit(`u:outreach-ai:${user.$id}`, 10, 60);
      const link = missionLink(mission.$id);
      const ai = input.useAi ? await draftMessageWithAi(mission, link) : null;
      return res.status(200).json({ success: true, message: ai || buildTemplateMessage(mission, link), source: ai ? 'ai' : 'template' });
    }

    // markContacted : l'artisan doit être une personne de la liste (rôle artisan)
    const artisan = await db.get('users', input.artisanId);
    if (artisan.role !== 'candidate') throw new HttpError(400, "Ce compte n'est pas un artisan.");
    await db.create('outreach', 'unique()', {
      missionId: mission.$id,
      artisanId: artisan.$id,
      channel: 'whatsapp',
      adminId: user.$id,
      createdAt: new Date().toISOString(),
    });
    await audit(req, user.$id, 'admin.outreach.contact', mission.$id, { artisan: artisan.$id });
    return res.status(200).json({ success: true });
  } catch (error: any) {
    return sendError(res, error, '[admin/outreach]');
  }
}
