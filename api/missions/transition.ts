import type { VercelRequest, VercelResponse } from '@vercel/node';
import { audit, protect, sendError } from '../_lib/security.js';
import { z } from 'zod';
import { HttpError, MISSION_STATUS, db, readBody } from '../_lib/server.js';
import { acceptOffer } from '../_lib/missions.js';
import { esc, missionButton, notifyUser } from '../_lib/telegram.js';

/**
 * Transitions du cycle de vie d'une mission, avec contrôle des droits côté serveur :
 *
 *   approved (ouverte) --accept--> assigned --complete--> completed --(paiement, /api/pay)--> paid
 *
 * Aucun paiement n'est demandé avant la fin : le client paie une fois la mission terminée.
 */

const Schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('accept'), missionId: z.string().min(1).max(64), applicationId: z.string().min(1).max(64), expectedPrice: z.number().int().optional() }),
  z.object({ action: z.literal('complete'), missionId: z.string().min(1).max(64) }),
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const user = await protect(req, { name: 'transition', max: 60, windowSec: 60 });
    const parsed = Schema.safeParse(readBody(req));
    if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });
    const input = parsed.data;

    const mission = await db.get('jobs', input.missionId);

    if (input.action === 'accept') {
      // Le client accepte le dernier prix de l'artisan (même règle que /api/missions/negotiate).
      if (mission.employerId !== user.$id) throw new HttpError(403, "Seul le client qui a publié la mission peut accepter une offre.");
      const offer = await db.get('applications', input.applicationId);
      const { price } = await acceptOffer(user.$id, mission, offer, input.expectedPrice);
      await audit(req, user.$id, 'mission.accept', mission.$id, { offer: offer.$id, price });
      return res.status(200).json({ success: true, status: MISSION_STATUS.ASSIGNED, agreedPrice: price });
    }

    // complete
    if (mission.assignedArtisanId !== user.$id) throw new HttpError(403, "Seul l'artisan choisi peut déclarer la mission terminée.");
    if (mission.status !== MISSION_STATUS.ASSIGNED) throw new HttpError(409, "Cette mission n'est pas en cours.");
    await db.update('jobs', mission.$id, { status: MISSION_STATUS.COMPLETED, completedAt: new Date().toISOString() });
    await notifyUser(mission.employerId, `🏁 <b>Mission terminée</b> : « ${esc(String(mission.title).slice(0, 80))} ».\nVérifiez le travail puis réglez la mission pour clôturer.`, missionButton(mission.$id, 'Payer la mission'));
    await audit(req, user.$id, 'mission.complete', mission.$id);
    return res.status(200).json({ success: true, status: MISSION_STATUS.COMPLETED });
  } catch (error: any) {
    return sendError(res, error, '[missions/transition]');
  }
}
