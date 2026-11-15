import React from 'react';
import { PlusCircle, Trash2 } from 'lucide-react';
import { formatFcfa } from '../constants';
import { MAX_QUOTE_LINES, Quote, lineTotal, quoteSubtotal } from '../lib/quote';

export interface QuoteDraftLine { label: string; qty: string; unit: string; unitPrice: string }
export interface QuoteDraft { lines: QuoteDraftLine[]; discount: string; validityDays: string; conditions: string }

export const emptyDraft = (): QuoteDraft => ({ lines: [{ label: '', qty: '1', unit: '', unitPrice: '' }], discount: '', validityDays: '15', conditions: '' });

const num = (v: string) => Number(String(v).replace(/\s/g, '').replace(',', '.')) || 0;

/** Convertit la saisie en devis (lignes vides ignorées). */
export function draftToQuote(d: QuoteDraft): Quote {
  return {
    lines: d.lines
      .map((l) => ({ label: l.label.trim(), qty: num(l.qty), unit: l.unit.trim(), unitPrice: Math.round(num(l.unitPrice)) }))
      .filter((l) => l.label && l.qty > 0),
    discount: Math.round(num(d.discount)),
    validityDays: Math.round(num(d.validityDays)) || 15,
    conditions: d.conditions.trim(),
  };
}

const field = 'bg-slate-50 px-3 py-2.5 rounded-xl text-sm outline-none focus:ring-1 focus:ring-emerald-500 w-full';

/** Saisie d'un devis détaillé : lignes (désignation, quantité, unité, prix unitaire), remise, validité, conditions. */
export function QuoteEditor({ value, onChange }: { value: QuoteDraft; onChange: (d: QuoteDraft) => void }) {
  const quote = draftToQuote(value);
  const sub = quoteSubtotal(quote);
  const total = sub - quote.discount;
  const setLine = (i: number, patch: Partial<QuoteDraftLine>) => onChange({ ...value, lines: value.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)) });

  return (
    <div className="space-y-3 bg-slate-50/60 border border-slate-100 rounded-2xl p-3" aria-label="Devis détaillé">
      {value.lines.map((l, i) => {
        const lt = lineTotal({ qty: num(l.qty), unitPrice: Math.round(num(l.unitPrice)) });
        return (
          <div key={i} className="bg-white rounded-xl border border-slate-100 p-3 space-y-2">
            <div className="flex gap-2 items-center">
              <input aria-label={`Désignation ligne ${i + 1}`} className={field} placeholder="Désignation (ex : Remplacement du siphon)" maxLength={120} value={l.label} onChange={(e) => setLine(i, { label: e.target.value })} />
              {value.lines.length > 1 && (
                <button type="button" aria-label={`Supprimer la ligne ${i + 1}`} onClick={() => onChange({ ...value, lines: value.lines.filter((_, k) => k !== i) })} className="p-2 text-slate-400 hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 items-end">
              <input aria-label={`Quantité ligne ${i + 1}`} inputMode="decimal" className={field} placeholder="Qté" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
              <input aria-label={`Unité ligne ${i + 1}`} className={field} placeholder="Unité (h, m, u…)" maxLength={12} value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} />
              <input aria-label={`Prix unitaire ligne ${i + 1}`} inputMode="numeric" className={field} placeholder="Prix unit." value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
            </div>
            <p className="text-right text-[11px] text-slate-400">Total ligne : <b className="text-slate-700">{formatFcfa(lt)}</b></p>
          </div>
        );
      })}

      {value.lines.length < MAX_QUOTE_LINES && (
        <button type="button" onClick={() => onChange({ ...value, lines: [...value.lines, { label: '', qty: '1', unit: '', unitPrice: '' }] })}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800">
          <PlusCircle className="h-4 w-4" /> Ajouter une ligne
        </button>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 space-y-1 block">Remise (FCFA)
          <input aria-label="Remise en FCFA" inputMode="numeric" className={field} placeholder="0" value={value.discount} onChange={(e) => onChange({ ...value, discount: e.target.value })} />
        </label>
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 space-y-1 block">Validité (jours)
          <input aria-label="Validité en jours" inputMode="numeric" className={field} value={value.validityDays} onChange={(e) => onChange({ ...value, validityDays: e.target.value })} />
        </label>
      </div>
      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 space-y-1 block">Conditions (facultatif)
        <textarea aria-label="Conditions du devis" rows={2} maxLength={600} className={field} placeholder="Ex : matériel fourni, garantie 30 jours…" value={value.conditions} onChange={(e) => onChange({ ...value, conditions: e.target.value })} />
      </label>

      <div className="flex justify-between items-baseline border-t border-slate-200 pt-2 text-sm">
        <span className="text-slate-500">Total du devis {quote.discount > 0 ? `(remise ${formatFcfa(quote.discount)} déduite)` : ''}</span>
        <b className="text-emerald-700 text-lg" aria-label="Total du devis">{formatFcfa(total)}</b>
      </div>
    </div>
  );
}
