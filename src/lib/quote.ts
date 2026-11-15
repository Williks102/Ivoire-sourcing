/**
 * Devis professionnel : mêmes calculs que api/_lib/quote.ts (un test vérifie qu'ils restent identiques).
 * Le serveur recalcule toujours le total ; l'écran sert à l'aperçu pendant la saisie et à l'affichage.
 */

export const MAX_QUOTE_LINES = 30;
export const MIN_TOTAL = 500;
export const MAX_TOTAL = 10_000_000;

export interface QuoteLine { label: string; qty: number; unit: string; unitPrice: number }
export interface Quote { lines: QuoteLine[]; discount: number; validityDays: number; conditions: string }

export const lineTotal = (l: Pick<QuoteLine, 'qty' | 'unitPrice'>) => Math.round((Number(l.qty) || 0) * (Number(l.unitPrice) || 0));
export const quoteSubtotal = (q: Pick<Quote, 'lines'>) => q.lines.reduce((n, l) => n + lineTotal(l), 0);
export const quoteTotal = (q: Pick<Quote, 'lines' | 'discount'>) => quoteSubtotal(q) - Math.round(Number(q.discount) || 0);

/** Lit le devis d'une offre (JSON stocké) ; null si absent ou illisible. */
export function readQuote(raw: unknown): Quote | null {
  try {
    const q: any = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!q || !Array.isArray(q.lines) || q.lines.length === 0) return null;
    return {
      lines: q.lines.map((l: any) => ({ label: String(l.label || ''), qty: Number(l.qty) || 0, unit: String(l.unit || ''), unitPrice: Math.round(Number(l.unitPrice) || 0) })),
      discount: Math.max(Math.round(Number(q.discount) || 0), 0),
      validityDays: Math.round(Number(q.validityDays) || 15),
      conditions: String(q.conditions || ''),
    };
  } catch {
    return null;
  }
}

/** Raison pour laquelle le devis saisi est invalide, ou null (le serveur revérifie). */
export function quoteProblem(q: Quote): string | null {
  const lines = q.lines.filter((l) => l.label.trim() && l.qty > 0);
  if (lines.length === 0) return 'Ajoutez au moins une ligne avec une désignation et une quantité.';
  const sub = quoteSubtotal({ lines });
  if (q.discount > sub) return 'La remise dépasse le montant des lignes.';
  const total = sub - q.discount;
  if (total < MIN_TOTAL || total > MAX_TOTAL) return `Le total du devis doit être compris entre ${MIN_TOTAL} et ${MAX_TOTAL} FCFA.`;
  return null;
}

export function quoteNumber(offer: { id?: string; $id?: string; createdAt?: string }): string {
  const id = String(offer.id || offer.$id || '0000');
  const d = offer.createdAt ? new Date(offer.createdAt) : new Date(0);
  const ymd = isNaN(d.getTime()) ? '00000000' : d.toISOString().slice(0, 10).replace(/-/g, '');
  return `DEV-${ymd}-${id.slice(-4).toUpperCase()}`;
}
