import { z } from 'zod';
import { forPrompt } from './ai.js';

/**
 * Devis professionnel d'un artisan (lignes facultatives rattachées à une offre).
 * Fonctions pures. Le total est TOUJOURS recalculé côté serveur : le navigateur ne décide pas du prix.
 * Même calcul côté écran (src/lib/quote.ts) : un test vérifie qu'ils restent identiques.
 */

export const MAX_QUOTE_LINES = 30;
export const MIN_TOTAL = 500;
export const MAX_TOTAL = 10_000_000;

export interface QuoteLine { label: string; qty: number; unit: string; unitPrice: number }
export interface Quote { lines: QuoteLine[]; discount: number; validityDays: number; conditions: string }

export const lineTotal = (l: Pick<QuoteLine, 'qty' | 'unitPrice'>) => Math.round((Number(l.qty) || 0) * (Number(l.unitPrice) || 0));
export const quoteSubtotal = (q: Pick<Quote, 'lines'>) => q.lines.reduce((n, l) => n + lineTotal(l), 0);
export const quoteTotal = (q: Pick<Quote, 'lines' | 'discount'>) => quoteSubtotal(q) - Math.round(Number(q.discount) || 0);

/** Nettoie un texte libre : une seule ligne, sans balises, longueur bornée. */
const text = (v: unknown, max: number) => forPrompt(v, max * 2).replace(/[`${}]/g, '').slice(0, max);

/**
 * Lit un devis (objet ou JSON) et le normalise ; renvoie null s'il est absent ou inutilisable.
 * Ne lève jamais d'exception : un devis illisible est simplement ignoré à l'affichage.
 */
export function parseQuote(raw: unknown): Quote | null {
  try {
    const q: any = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!q || !Array.isArray(q.lines) || q.lines.length === 0) return null;
    const lines: QuoteLine[] = q.lines.slice(0, MAX_QUOTE_LINES).map((l: any) => ({
      label: text(l?.label, 120),
      qty: Math.min(Math.max(Math.round((Number(l?.qty) || 0) * 100) / 100, 0), 100000),
      unit: text(l?.unit, 12),
      unitPrice: Math.min(Math.max(Math.round(Number(l?.unitPrice) || 0), 0), MAX_TOTAL),
    })).filter((l: QuoteLine) => l.label && l.qty > 0);
    if (lines.length === 0) return null;
    return {
      lines,
      discount: Math.max(Math.round(Number(q.discount) || 0), 0),
      validityDays: Math.min(Math.max(Math.round(Number(q.validityDays) || 15), 1), 90),
      conditions: text(q.conditions, 600),
    };
  } catch {
    return null;
  }
}

/** Raison pour laquelle un devis est refusé à la création d'une offre, ou null. */
export function quoteProblem(q: Quote | null): string | null {
  if (!q) return 'Le devis est vide ou illisible : ajoutez au moins une ligne avec une désignation et une quantité.';
  const total = quoteTotal(q);
  if (q.discount > quoteSubtotal(q)) return 'La remise dépasse le montant des lignes.';
  if (total < MIN_TOTAL || total > MAX_TOTAL) return `Le total du devis doit être compris entre ${MIN_TOTAL} et ${MAX_TOTAL} FCFA.`;
  return null;
}

/** Numéro de devis stable, dérivé de l'offre (pas de compteur à synchroniser) : DEV-20260215-A7K2. */
export function quoteNumber(offer: { $id?: string; id?: string; createdAt?: string }): string {
  const id = String(offer.$id || offer.id || '0000');
  const d = offer.createdAt ? new Date(offer.createdAt) : new Date(0);
  const ymd = isNaN(d.getTime()) ? '00000000' : d.toISOString().slice(0, 10).replace(/-/g, '');
  return `DEV-${ymd}-${id.slice(-4).toUpperCase()}`;
}

/** Montant lisible : « 25 000 FCFA » (espace insécable classique, compatible avec les polices PDF standard). */
export const money = (n: unknown) =>
  `${Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA`;

/** Forme attendue d'un devis envoyé par le navigateur (offre, modèle ou brouillon) ; le contenu est ensuite nettoyé par parseQuote. */
export const quoteInputSchema = z.object({
  lines: z.array(z.object({
    label: z.string().max(200),
    qty: z.number().min(0).max(100000),
    unit: z.string().max(20).optional(),
    unitPrice: z.number().min(0).max(10_000_000),
  })).min(1).max(MAX_QUOTE_LINES),
  discount: z.number().min(0).max(10_000_000).optional(),
  validityDays: z.number().min(1).max(90).optional(),
  conditions: z.string().max(1000).optional(),
});
