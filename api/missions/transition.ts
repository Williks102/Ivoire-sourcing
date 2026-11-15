import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { HttpError, MISSION_STATUS, authenticate, db, readBody } from '../_lib/server.js';

/**
 * Transitions du cycle de vie d'une mission, avec contrôle des droits côté serveur :
 *
 *   approved (ouverte) --accept--> assigned --complete--> completed --(paiement, /api/pay)--> paid
 *
 * Aucun paiement n'est demandé avant la fin : le client paie une fois la mission terminée.
 */

const Schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('accept'), missionId: z.string().min(1).max(64), applicationId: z.string().min(1).max(64) }),
  z.object({ action: z.literal('complete'), missionId: z.string().min(1).max(64) }),
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const user = await authenticate(req);
    const parsed = Schema.safeParse(readBody(req));
    if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });
    const input = parsed.data;

    const mission = await db.get('jobs', input.missionId);

    if (input.action === 'accept') {
      if (mission.employerId !== user.$id) throw new HttpError(403, "Seul le client qui a publié la mission peut accepter une offre.");
      if (mission.status !== MISSION_STATUS.OPEN) throw new HttpError(409, "Cette mission n'accepte plus d'offres.");

      const offer = await db.get('applications', input.applicationId);
      if (offer.jobId !== mission.$id) throw new HttpError(400, "Cette offre ne correspond pas à la mission.");
      if (offer.status !== 'pending') throw new HttpError(409, "Cette offre n'est plus en attente.");

      const price = Math.round(Number(offer.proposedPrice));
      if (!Number.isFinite(price) || price <= 0) throw new HttpError(400, "Le prix de l'offre est invalide.");

      // Le prix convenu est figé ici, côté serveur : c'est lui qui sera facturé en fin de mission.
      await db.update('jobs', mission.$id, {
        status: MISSION_STATUS.ASSIGNED,
        assignedArtisanId: offer.candidateId,
        assignedApplicationId: offer.$id,
        agreedPrice: price,
        assignedAt: new Date().toISOString(),
      });
      await db.update('applications', offer.$id, { status: 'accepted' });

      const others = await db.listEqual('applications', 'jobId', mission.$id);
      await Promise.all(
        others
          .filter((o) => o.$id !== offer.$id && o.status === 'pending')
          .map((o) => db.update('applications', o.$id, { status: 'rejected' })),
      );
      return res.status(200).json({ success: true, status: MISSION_STATUS.ASSIGNED, agreedPrice: price });
    }

    // complete
    if (mission.assignedArtisanId !== user.$id) throw new HttpError(403, "Seul l'artisan choisi peut déclarer la mission terminée.");
    if (mission.status !== MISSION_STATUS.ASSIGNED) throw new HttpError(409, "Cette mission n'est pas en cours.");
    await db.update('jobs', mission.$id, { status: MISSION_STATUS.COMPLETED, completedAt: new Date().toISOString() });
    return res.status(200).json({ success: true, status: MISSION_STATUS.COMPLETED });
  } catch (error: any) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    console.error('[missions/transition]', error?.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
}
