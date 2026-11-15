import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { HttpError, MISSION_STATUS, authenticate, db, readBody, sanitizeText } from '../_lib/server.js';
import { acceptOffer } from '../_lib/missions.js';
import { MAX_PRICE, MIN_PRICE, applyProposal, counterError, currentPrice, partyOf } from '../_lib/negotiation.js';

/**
 * Négociation du prix d'une offre, façon inDrive, entre le client et l'artisan concernés :
 *
 *   counter  -> contre-proposition (à son tour uniquement, jusqu'à MAX_PROPOSALS propositions)
 *   accept   -> accepter le dernier prix de l'autre : la mission est attribuée à ce prix
 *   decline  -> refuser (client : offre « refusée ») ou se retirer (artisan : offre « retirée')
 *
 * Toutes les règles sont vérifiées ici ; le navigateur ne décide ni du prix convenu ni du tour de parole.
 */

const Id = z.string().min(1).max(64);
const Schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('counter'),
    applicationId: Id,
    price: z.number().int().min(MIN_PRICE).max(MAX_PRICE),
    note: z.string().trim().max(200).optional(),
    /** Prix affiché à l'écran au moment de répondre : refusé s'il a changé entre-temps. */
    expectedPrice: z.number().int().optional(),
  }),
  z.object({ action: z.literal('accept'), applicationId: Id, expectedPrice: z.number().int().optional() }),
  z.object({ action: z.literal('decline'), applicationId: Id }),
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const user = await authenticate(req);
    const parsed = Schema.safeParse(readBody(req));
    if (!parsed.success) return res.status(400).json({ error: 'Données invalides : vérifiez le prix proposé.' });
    const input = parsed.data;

    const offer = await db.get('applications', input.applicationId);
    const mission = await db.get('jobs', offer.jobId);
    // Le client est celui de la mission (source de vérité), pas la copie stockée dans l'offre.
    const party = partyOf(user.$id, { employerId: mission.employerId, candidateId: offer.candidateId });
    if (!party) throw new HttpError(403, "Vous n'êtes pas concerné par cette offre.");

    if (input.action === 'accept') {
      const { price } = await acceptOffer(user.$id, mission, offer, input.expectedPrice);
      return res.status(200).json({ success: true, status: MISSION_STATUS.ASSIGNED, agreedPrice: price });
    }

    if (mission.status !== MISSION_STATUS.OPEN) throw new HttpError(409, "Cette mission n'accepte plus d'offres.");
    if (offer.status !== 'pending') throw new HttpError(409, "Cette offre n'est plus en discussion.");

    if (input.action === 'decline') {
      await db.update('applications', offer.$id, { status: party === 'client' ? 'rejected' : 'withdrawn' });
      return res.status(200).json({ success: true });
    }

    // counter
    if (input.expectedPrice !== undefined && input.expectedPrice !== currentPrice(offer)) {
      throw new HttpError(409, 'Le prix vient de changer : vérifiez la nouvelle proposition.');
    }
    const problem = counterError(offer, party, input.price);
    if (problem) throw new HttpError(409, problem);

    const update = applyProposal(offer, party, input.price, sanitizeText(input.note, 200), new Date().toISOString());
    await db.update('applications', offer.$id, update);
    return res.status(200).json({ success: true, price: update.proposedPrice, rounds: update.rounds });
  } catch (error: any) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    console.error('[missions/negotiate]', error?.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
}
