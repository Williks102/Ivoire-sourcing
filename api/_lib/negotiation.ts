/**
 * Négociation de prix, façon inDrive : l'artisan propose un prix, le client peut accepter, refuser ou
 * contre-proposer, puis l'artisan peut accepter, refuser ou contre-proposer, et ainsi de suite jusqu'à
 * ce que l'un des deux accepte le dernier prix de l'autre. Fonctions pures (testables sans réseau).
 *
 * Champs de l'offre (`applications`) : proposedPrice (prix en cours), lastProposedBy ('artisan' | 'client'),
 * rounds (nombre de propositions), history (JSON : [{ by, price, at, note? }]).
 * Les offres créées avant cette fonction n'ont pas ces champs : elles sont lues comme « proposition de l'artisan ».
 */

/** Nombre maximal de propositions (offre initiale comprise) : au-delà, il ne reste qu'à accepter ou refuser. */
export const MAX_PROPOSALS = 8;
export const MIN_PRICE = 500;
export const MAX_PRICE = 10_000_000;

export type Party = 'client' | 'artisan';
export interface HistoryEntry { by: Party; price: number; at: string; note?: string }

const validEntry = (e: any): e is HistoryEntry =>
  e && (e.by === 'client' || e.by === 'artisan') && Number.isFinite(Number(e.price)) && typeof e.at === 'string';

export function readHistory(offer: any): HistoryEntry[] {
  try {
    const raw = typeof offer?.history === 'string' ? JSON.parse(offer.history) : offer?.history;
    if (Array.isArray(raw) && raw.length > 0) return raw.filter(validEntry).map((e) => ({ ...e, price: Math.round(Number(e.price)) }));
  } catch { /* historique illisible : on repart de l'offre */ }
  return [{ by: 'artisan', price: Math.round(Number(offer?.proposedPrice) || 0), at: offer?.createdAt || '' }];
}

export const lastParty = (offer: any): Party => (offer?.lastProposedBy === 'client' ? 'client' : 'artisan');
/** Celui qui doit répondre à la dernière proposition. */
export const whoseTurn = (offer: any): Party => (lastParty(offer) === 'client' ? 'artisan' : 'client');
export const roundsOf = (offer: any) => Math.max(Number(offer?.rounds) || 0, readHistory(offer).length);
export const currentPrice = (offer: any) => Math.round(Number(offer?.proposedPrice) || 0);

export function partyOf(userId: string, offer: any): Party | null {
  if (offer?.employerId === userId) return 'client';
  if (offer?.candidateId === userId) return 'artisan';
  return null;
}

/** Raison pour laquelle une contre-proposition est refusée, ou null si elle est valide. */
export function counterError(offer: any, by: Party, price: number): string | null {
  if (offer?.status !== 'pending') return "Cette offre n'est plus en discussion.";
  if (whoseTurn(offer) !== by) return "Ce n'est pas à votre tour de répondre.";
  if (roundsOf(offer) >= MAX_PROPOSALS) return 'Le nombre maximal de propositions est atteint : acceptez ou refusez le dernier prix.';
  if (!Number.isInteger(price) || price < MIN_PRICE || price > MAX_PRICE) return `Le prix doit être compris entre ${MIN_PRICE} et ${MAX_PRICE} FCFA.`;
  const current = currentPrice(offer);
  if (price === current) return "C'est déjà le prix proposé : acceptez-le plutôt.";
  if (by === 'client' && price > current) return "Votre proposition dépasse le prix demandé par l'artisan : acceptez-le plutôt.";
  if (by === 'artisan' && price < current) return "Votre proposition est inférieure à celle du client : acceptez-la plutôt.";
  return null;
}

/** Champs à écrire sur l'offre après une proposition. */
export function applyProposal(offer: any, by: Party, price: number, note: string, at: string) {
  const history = [...readHistory(offer), { by, price, at, ...(note ? { note } : {}) }].slice(-MAX_PROPOSALS);
  return { proposedPrice: price, lastProposedBy: by, rounds: roundsOf(offer) + 1, history: JSON.stringify(history) };
}

/** Champs initiaux d'une offre (première proposition de l'artisan). */
export function initialProposal(price: number, at: string) {
  return { proposedPrice: price, lastProposedBy: 'artisan' as Party, rounds: 1, history: JSON.stringify([{ by: 'artisan', price, at }]) };
}
