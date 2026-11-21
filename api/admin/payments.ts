import type { VercelRequest, VercelResponse } from '@vercel/node';
import { audit, protect, sendError } from '../_lib/security.js';
import { z } from 'zod';
import { esc, fcfa, notifyUser } from '../_lib/telegram.js';
import { HttpError, MISSION_STATUS, db, readBody, requireAdmin, sanitizeText } from '../_lib/server.js';

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
    const user = await protect(req, { name: 'admin-payments', max: 60, windowSec: 60 });
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
        payoutOperator: p.payoutOperator || '',
        payoutPhone: p.payoutPhone || '',
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
    await audit(req, user.$id, 'admin.payout.sent', mission.$id, { reference: sanitizeText(input.reference, 64) });
    const paid = mission.paymentReference ? await db.get('payments', mission.paymentReference).catch(() => null) : null;
    await notifyUser(mission.assignedArtisanId, `💸 <b>Reversement effectué</b>\nMission « ${esc(String(mission.title).slice(0, 80))} » : ${fcfa(mission.artisanPayout)} envoyés${paid?.payoutOperator ? ` sur votre compte ${esc(paid.payoutOperator)}` : ''}.`);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    return sendError(res, error, '[admin/payments]');
  }
}
