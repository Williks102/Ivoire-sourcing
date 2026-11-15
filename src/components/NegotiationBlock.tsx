import React, { useState } from 'react';
import { Application } from '../types';
import { formatFcfa } from '../constants';
import { missionService } from '../services/missionService';
import { MAX_PROPOSALS, Party, counterError, currentPrice, readHistory, roundsOf, suggestedPrice, whoseTurn } from '../lib/negotiation';

interface Props {
  offer: Application;
  /** Qui regarde : le client de la mission ou l'artisan qui a fait l'offre. */
  viewer: Party;
  /** Budget indiqué par le client (rappel affiché à l'artisan et au client). */
  budget?: number;
  /** Appelé après chaque action (accepter, contre-proposer, refuser) pour recharger les données. */
  onChanged: () => void | Promise<void>;
}

const who = (by: Party, viewer: Party) => (by === viewer ? 'Vous' : by === 'artisan' ? 'Artisan' : 'Client');

/**
 * Négociation du prix d'une offre, façon inDrive : à tour de rôle, on accepte le dernier prix de l'autre,
 * on contre-propose, ou on refuse. Les règles sont vérifiées par le serveur ; ici on n'affiche que ce qui est permis.
 */
export function NegotiationBlock({ offer, viewer, budget, onChanged }: Props) {
  const history = readHistory(offer);
  const price = currentPrice(offer);
  const myTurn = whoseTurn(offer) === viewer;
  const capped = roundsOf(offer) >= MAX_PROPOSALS;
  const other = viewer === 'client' ? "l'artisan" : 'le client';
  const suggestion = myTurn && !capped ? suggestedPrice(offer, viewer) : null;

  const [countering, setCountering] = useState(false);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      setCountering(false);
      setValue('');
      setNote('');
      await onChanged();
    } catch (e: any) {
      setError(e?.message || 'Une erreur est survenue.');
      // Le prix a peut-être changé : on recharge pour afficher la dernière proposition.
      if (/vient de changer|tour/i.test(e?.message || '')) await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const sendCounter = (amount: number) => {
    const problem = counterError(offer, viewer, amount);
    if (problem) { setError(problem); return; }
    run(() => missionService.counterOffer(offer.id, amount, note.trim() || undefined, price));
  };

  const parsed = Math.round(Number(value.replace(/\s/g, '')));

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            {myTurn ? `Dernier prix proposé par ${other}` : 'Votre dernière proposition'}
          </p>
          <p className="text-2xl font-black text-emerald-600 leading-tight">{formatFcfa(price)}</p>
        </div>
        {!!budget && <p className="text-[11px] text-slate-400">Budget du client : {formatFcfa(budget)}</p>}
      </div>

      {history.length > 1 && (
        <div className="bg-slate-50 rounded-xl p-3 space-y-1.5" aria-label="Historique des prix">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Historique ({history.length} propositions)</p>
          <ol className="space-y-1">
            {history.map((e, i) => (
              <li key={i} className="text-xs text-slate-600 flex flex-wrap items-baseline gap-x-2">
                <span className={`font-bold ${e.by === viewer ? 'text-slate-900' : 'text-slate-500'}`}>{who(e.by, viewer)}</span>
                <span className="font-black text-slate-800">{formatFcfa(e.price)}</span>
                {e.note && <span className="italic text-slate-400">« {e.note} »</span>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {myTurn ? (
        <div className="space-y-2">
          <p className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            À vous de répondre : acceptez ce prix, proposez-en un autre ou refusez.
          </p>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => run(() => missionService.acceptPrice(offer.id, price))}
              className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
              Accepter {formatFcfa(price)}
            </button>
            {!capped && (
              <button disabled={busy} onClick={() => setCountering(!countering)} aria-expanded={countering}
                className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50">
                Contre-proposer
              </button>
            )}
            <button disabled={busy} onClick={() => run(() => missionService.declineOffer(offer.id))}
              className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 disabled:opacity-50">
              {viewer === 'client' ? 'Refuser' : 'Me retirer'}
            </button>
          </div>
          {capped && <p className="text-[11px] text-slate-400">Nombre maximal de propositions atteint ({MAX_PROPOSALS}) : acceptez ou refusez.</p>}

          {countering && !capped && (
            <form onSubmit={(e) => { e.preventDefault(); sendCounter(parsed); }} className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2">
              <p className="text-[11px] text-slate-400">
                {viewer === 'client' ? `Proposez un prix inférieur à ${formatFcfa(price)}.` : `Proposez un prix supérieur à ${formatFcfa(price)}.`}
              </p>
              <div className="flex flex-wrap gap-2">
                <input aria-label="Votre prix en FCFA" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Votre prix (FCFA)"
                  className="flex-1 min-w-[140px] bg-slate-50 px-3 py-2.5 rounded-xl text-sm font-bold outline-none focus:ring-1 focus:ring-emerald-500" />
                {suggestion !== null && (
                  <button type="button" onClick={() => setValue(String(suggestion))}
                    className="px-3 rounded-xl text-[11px] font-bold bg-violet-50 text-violet-700 hover:bg-violet-100">
                    {history.some(e => e.by === viewer) ? 'Milieu' : 'Suggestion'} : {formatFcfa(suggestion)}
                  </button>
                )}
              </div>
              <input aria-label="Message (facultatif)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Message (facultatif)"
                className="w-full bg-slate-50 px-3 py-2.5 rounded-xl text-xs outline-none focus:ring-1 focus:ring-emerald-500" />
              <button type="submit" disabled={busy || !parsed}
                className="w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                {busy ? 'Envoi…' : `Envoyer ${parsed ? formatFcfa(parsed) : 'ma proposition'}`}
              </button>
            </form>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-bold text-sky-700 bg-sky-50 border border-sky-100 rounded-xl px-3 py-2">
            En attente de la réponse {viewer === 'client' ? "de l'artisan" : 'du client'}.
          </p>
          <button disabled={busy} onClick={() => run(() => missionService.declineOffer(offer.id))}
            className="px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-50">
            {viewer === 'client' ? "Refuser l'offre" : 'Retirer mon offre'}
          </button>
        </div>
      )}

      {error && <p role="alert" className="text-xs font-bold text-rose-600">{error}</p>}
    </div>
  );
}
