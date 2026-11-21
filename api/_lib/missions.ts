import { HttpError, MISSION_STATUS, db } from './server.js';
import { esc, fcfa, missionButton, notifyUser } from './telegram.js';
import { currentPrice, partyOf, whoseTurn } from './negotiation.js';

/**
 * Accepter le dernier prix de l'autre partie : la mission est attribuée à l'artisan au prix convenu,
 * les autres offres sont refusées. C'est ici, côté serveur, que le prix facturé en fin de mission est figé.
 *
 * `expectedPrice` (prix affiché à l'écran de celui qui accepte) protège contre un changement de dernière minute :
 * si l'autre partie vient de modifier son prix, l'acceptation est refusée.
 */
export async function acceptOffer(userId: string, mission: any, offer: any, expectedPrice?: number) {
  if (mission.status !== MISSION_STATUS.OPEN) throw new HttpError(409, "Cette mission n'accepte plus d'offres.");
  if (offer.jobId !== mission.$id) throw new HttpError(400, "Cette offre ne correspond pas à la mission.");
  if (offer.status !== 'pending') throw new HttpError(409, "Cette offre n'est plus en discussion.");

  // Le client est celui de la mission (source de vérité), pas la copie stockée dans l'offre.
  const party = partyOf(userId, { employerId: mission.employerId, candidateId: offer.candidateId });
  if (!party) throw new HttpError(403, "Vous n'êtes pas concerné par cette offre.");
  if (whoseTurn(offer) !== party) throw new HttpError(409, "Vous ne pouvez accepter que le dernier prix proposé par l'autre partie.");

  const price = currentPrice(offer);
  if (!Number.isFinite(price) || price <= 0) throw new HttpError(400, "Le prix de l'offre est invalide.");
  if (expectedPrice !== undefined && Math.round(expectedPrice) !== price) throw new HttpError(409, 'Le prix vient de changer : vérifiez la nouvelle proposition.');

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
  const other = party === 'client' ? offer.candidateId : mission.employerId;
  await notifyUser(other, `✅ <b>Offre acceptée</b> sur « ${esc(String(mission.title).slice(0, 80))} » au prix de ${fcfa(price)}.\n${party === 'client' ? 'La mission vous est attribuée.' : 'L’artisan a accepté votre prix.'}`, missionButton(mission.$id));
  return { price, acceptedBy: party };
}
