import { Application } from '../types';

/**
 * Négociation de prix (client ↔ artisan), côté écran : mêmes règles que api/_lib/negotiation.ts
 * (un test vérifie qu'elles restent identiques). Le serveur reste seul juge ; ces règles servent à
 * afficher les bons boutons et à prévenir les erreurs avant l'envoi.
 */

export const MAX_PROPOSALS = 8;
export const MIN_PRICE = 500;
export const MAX_PRICE = 10_000_000;

export type Party = 'client' | 'artisan';
export interface HistoryEntry { by: Party; price: number; at: string; note?: string }

const validEntry = (e: any): e is HistoryEntry =>
  e && (e.by === 'client' || e.by === 'artisan') && Number.isFinite(Number(e.price)) && typeof e.at === 'string';

export function readHistory(offer: Partial<Application>): HistoryEntry[] {
  try {
    const raw = typeof offer?.history === 'string' ? JSON.parse(offer.history) : (offer as any)?.history;
    if (Array.isArray(raw) && raw.length > 0) return raw.filter(validEntry).map((e) => ({ ...e, price: Math.round(Number(e.price)) }));
  } catch { /* historique illisible : on repart de l'offre */ }
  return [{ by: 'artisan', price: Math.round(Number(offer?.proposedPrice) || 0), at: offer?.createdAt || '' }];
}

export const lastParty = (offer: Partial<Application>): Party => (offer?.lastProposedBy === 'client' ? 'client' : 'artisan');
/** Celui qui doit répondre à la dernière proposition. */
export const whoseTurn = (offer: Partial<Application>): Party => (lastParty(offer) === 'client' ? 'artisan' : 'client');
export const roundsOf = (offer: Partial<Application>) => Math.max(Number(offer?.rounds) || 0, readHistory(offer).length);
export const currentPrice = (offer: Partial<Application>) => Math.round(Number(offer?.proposedPrice) || 0);

/** Raison pour laquelle une contre-proposition serait refusée, ou null. */
export function counterError(offer: Partial<Application>, by: Party, price: number): string | null {
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

/** Prix suggéré en un clic : le milieu entre votre dernier prix et celui de l'autre (ou −15 % pour un premier contre-prix du client). */
export function suggestedPrice(offer: Partial<Application>, by: Party): number | null {
  const current = currentPrice(offer);
  const mine = [...readHistory(offer)].reverse().find((e) => e.by === by)?.price;
  const raw = mine !== undefined ? (mine + current) / 2 : by === 'client' ? current * 0.85 : null;
  if (raw === null) return null;
  const rounded = Math.round(raw / 500) * 500;
  return counterError(offer, by, rounded) === null ? rounded : null;
}
