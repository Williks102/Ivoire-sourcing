import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { HttpError, MISSION_STATUS, authenticate, db, readBody, requireAdmin, sanitizeText } from '../_lib/server.js';

/**
 * Suivi des paiements et des reversements — réservé à l'administration.
 * La table `payments` n'a aucune permission côté navigateur : tout passe par ici.
 *
 *   list              -> paiements (les plus récents d'abord), avec pagination
 *   markPayoutSent    -> marque « reversement effectué » sur une mission payée
 */

const Schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list'), offset: z.number().int().min(0).max(100000).default(0) }),
  z.object({
    action: z.literal('markPayoutSent'),
    missionId: z.string().min(1).max(64),
    reference: z.string().trim().max(64).optional(),
  }),
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const user = await authenticate(req);
    requireAdmin(user);
    const parsed = Schema.safeParse(readBody(req));
    if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });
    const input = parsed.data;

    if (input.action === 'list') {
      const { rows, total } = await db.listRecent('payments', 100, input.offset);
      const payments = rows.map((p) => ({
        id: p.$id,
        reference: p.reference,
        jobId: p.jobId,
        employerId: p.employerId,
        artisanId: p.artisanId,
        amount: p.amount,
        commission: p.commission,
        payout: p.payout,
        channel: p.channel,
        status: p.status,
        createdAt: p.createdAt,
        paidAt: p.paidAt,
      }));
      return res.status(200).json({ success: true, payments, total });
    }

    const mission = await db.get('jobs', input.missionId);
    if (mission.status !== MISSION_STATUS.PAID) throw new HttpError(409, "Cette mission n'est pas payée : rien à reverser.");
    if (mission.payoutStatus === 'sent') throw new HttpError(409, 'Le reversement est déjà marqué comme effectué.');

    await db.update('jobs', mission.$id, {
      payoutStatus: 'sent',
      payoutSentAt: new Date().toISOString(),
      payoutReference: sanitizeText(input.reference, 64),
    });
    return res.status(200).json({ success: true });
  } catch (error: any) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    console.error('[admin/payments]', error?.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
}
