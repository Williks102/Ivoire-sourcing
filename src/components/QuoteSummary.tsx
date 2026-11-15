import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Application } from '../types';
import { formatFcfa } from '../constants';
import { currentPrice } from '../lib/negotiation';
import { lineTotal, quoteSubtotal, readQuote } from '../lib/quote';
import { missionService } from '../services/missionService';
import { PdfButton } from './PdfButton';

/** Détail du devis d'une offre (si l'artisan en a joint un) et téléchargement du PDF. */
export function QuoteSummary({ offer }: { offer: Application }) {
  const quote = readQuote(offer.quote);
  const [open, setOpen] = useState(false);
  const price = currentPrice(offer);
  const sub = quote ? quoteSubtotal(quote) : 0;
  const computed = quote ? sub - quote.discount : price;

  return (
    <div className="space-y-2">
      {quote && (
        <>
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800">
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} Devis détaillé ({quote.lines.length} ligne{quote.lines.length > 1 ? 's' : ''})
          </button>
          {open && (
            <div className="bg-white border border-slate-100 rounded-xl p-3 space-y-2 text-xs" aria-label="Détail du devis">
              <ul className="divide-y divide-slate-50">
                {quote.lines.map((l, i) => (
                  <li key={i} className="py-1.5 flex justify-between gap-3">
                    <span className="min-w-0 text-slate-700">{l.label} <span className="text-slate-400">× {l.qty}{l.unit ? ` ${l.unit}` : ''} à {formatFcfa(l.unitPrice)}</span></span>
                    <b className="shrink-0 text-slate-800">{formatFcfa(lineTotal(l))}</b>
                  </li>
                ))}
              </ul>
              <div className="space-y-0.5 text-right">
                <p className="text-slate-500">Sous-total : {formatFcfa(sub)}</p>
                {quote.discount > 0 && <p className="text-slate-500">Remise : − {formatFcfa(quote.discount)}</p>}
                {price !== computed && <p className="text-violet-700 font-bold">Ajustement négocié : {price < computed ? '−' : '+'} {formatFcfa(Math.abs(price - computed))}</p>}
                <p className="font-black text-emerald-700">Prix en cours : {formatFcfa(price)}</p>
              </div>
              <p className="text-[10px] text-slate-400">Valable {quote.validityDays} jours{quote.conditions ? ` • ${quote.conditions}` : ''}</p>
            </div>
          )}
        </>
      )}
      <PdfButton label="Devis (PDF)" load={() => missionService.quotePdf(offer.id)} />
    </div>
  );
}
