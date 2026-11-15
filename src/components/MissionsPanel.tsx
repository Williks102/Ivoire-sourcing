import React, { useEffect, useState, useCallback } from 'react';
import { PlusCircle, ChevronDown, ChevronUp, CheckCircle2, Clock, Wallet, ShieldCheck } from 'lucide-react';
import { Application, JobPost } from '../types';
import { CATEGORIES, COMMISSION_RATE, MISSION_STATUS_LABELS, formatFcfa } from '../constants';
import { missionService } from '../services/missionService';

const OPERATORS = [
  { code: 'WAVECI', label: 'Wave' },
  { code: 'OMCIV2', label: 'Orange Money' },
  { code: 'MOMOCI', label: 'MTN MoMo' },
  { code: 'FLOOZ', label: 'Moov Money' },
  { code: 'CARD', label: 'Carte bancaire' },
];

const StatusBadge = ({ status }: { status: string }) => {
  const l = MISSION_STATUS_LABELS[status] || { text: status, color: 'bg-slate-100 text-slate-500' };
  return <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${l.color}`}>{l.text}</span>;
};

const categoryLabel = (id: string) => CATEGORIES.find(c => c.id === id)?.label || id;

/* ------------------------------------------------------------------ */
/*  CLIENT : mes missions, offres reçues, validation + paiement final  */
/* ------------------------------------------------------------------ */

export function ClientMissionsPanel({ clientId, onPublish }: { clientId: string; onPublish: () => void }) {
  const [missions, setMissions] = useState<JobPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setMissions(await missionService.listClientMissions(clientId));
      setError('');
    } catch (e) {
      console.error(e);
      setError('Impossible de charger vos missions.');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  // Retour de la passerelle de paiement : on recharge pour afficher l'état à jour.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('payment')) {
      const t = setTimeout(load, 2500);
      return () => clearTimeout(t);
    }
  }, [load]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Mes missions</h2>
          <p className="text-xs text-slate-400">Choisissez une offre, suivez la mission, payez une fois le travail terminé.</p>
        </div>
        <button onClick={onPublish} className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-3 rounded-2xl shadow-lg shadow-emerald-100 transition-all">
          <PlusCircle className="h-4 w-4" /> Publier une mission
        </button>
      </header>

      {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
      {loading ? (
        <div className="animate-pulse space-y-3">{[1, 2].map(i => <div key={i} className="h-20 bg-slate-100 rounded-2xl" />)}</div>
      ) : missions.length === 0 ? (
        <div className="text-center py-12 px-6 bg-slate-50 border border-dashed border-slate-200 rounded-[24px] space-y-2">
          <p className="font-bold text-slate-700 text-sm">Aucune mission pour le moment</p>
          <p className="text-xs text-slate-400">Publiez votre première mission : c'est gratuit.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {missions.map(m => <ClientMissionCard key={m.id} mission={m} onChanged={load} />)}
        </div>
      )}
    </div>
  );
}

function ClientMissionCard({ mission, onChanged }: { mission: JobPost; onChanged: () => void }) {
  const [open, setOpen] = useState(mission.status === 'completed');
  const [offers, setOffers] = useState<Application[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [channel, setChannel] = useState('WAVECI');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (open && mission.status === 'approved') {
      missionService.listOffers(mission.id).then(setOffers).catch(() => setError('Offres indisponibles.'));
    }
  }, [open, mission.id, mission.status]);

  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    setError('');
    try { await fn(); await onChanged(); } catch (e: any) { setError(e?.message || 'Une erreur est survenue.'); } finally { setBusy(false); }
  };

  const total = Math.round(Number(mission.agreedPrice) || 0);
  const commission = Math.round(total * COMMISSION_RATE);

  const pay = () => run(async () => {
    const res = await missionService.startPayment(mission.id, channel, phone || undefined);
    window.location.href = res.paymentUrl;
  });

  return (
    <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50/60">
        <div className="min-w-0">
          <p className="font-bold text-slate-800 truncate">{mission.title}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-slate-400">{categoryLabel(mission.category)} • {mission.location}</span>
            <StatusBadge status={mission.status} />
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-black text-emerald-600">{formatFcfa(total || mission.budget)}</span>
          {open ? <ChevronUp className="h-4 w-4 text-slate-300" /> : <ChevronDown className="h-4 w-4 text-slate-300" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-50 p-4 space-y-4 bg-slate-50/40">
          {mission.status === 'pending' && <p className="text-xs text-amber-600">Votre mission est en cours de vérification avant publication.</p>}

          {mission.status === 'approved' && (
            offers.length === 0 ? (
              <p className="text-xs text-slate-400">Aucune offre reçue pour l'instant.</p>
            ) : (
              <div className="space-y-2">
                {offers.filter(o => o.status === 'pending').map(o => (
                  <div key={o.id} className="bg-white border border-slate-100 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-slate-800">{o.candidateName || 'Artisan'} <span className="text-slate-400 font-medium text-xs">• {o.experienceYears ?? 0} an(s) d'expérience</span></p>
                      {!!o.trades?.length && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {o.trades.map(t => <span key={t} className="text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{categoryLabel(t)}</span>)}
                        </div>
                      )}
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><Clock className="h-3 w-3" /> {o.delay || 'Délai non précisé'}</p>
                      {o.message && <p className="text-xs italic text-slate-500 mt-1">« {o.message} »</p>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-black text-emerald-600">{formatFcfa(o.proposedPrice)}</span>
                      <button disabled={busy} onClick={() => run(() => missionService.acceptOffer(mission.id, o.id))}
                        className="text-[10px] font-bold text-white px-3 py-2 bg-slate-900 hover:bg-emerald-600 rounded-xl uppercase tracking-wider disabled:opacity-50">
                        Choisir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {mission.status === 'assigned' && (
            <div className="text-xs text-sky-700 bg-sky-50 border border-sky-100 rounded-xl p-3">
              Mission en cours au prix convenu de <b>{formatFcfa(total)}</b>. Vous paierez quand l'artisan l'aura déclarée terminée.
            </div>
          )}

          {mission.status === 'completed' && (
            <div className="space-y-3">
              <div className="bg-white border border-violet-100 rounded-xl p-4 space-y-2 text-sm">
                <p className="font-bold text-violet-700 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> L'artisan a terminé la mission</p>
                <p className="text-xs text-slate-500">Vérifiez le travail, puis réglez le prix convenu. Le paiement est sécurisé via Mobile Money.</p>
                <div className="flex justify-between text-sm pt-1"><span>Total à payer</span><b>{formatFcfa(total)}</b></div>
                <div className="flex justify-between text-[11px] text-slate-400"><span>dont commission IvoireSource ({Math.round(COMMISSION_RATE * 100)} %)</span><span>{formatFcfa(commission)}</span></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select value={channel} onChange={e => setChannel(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
                  {OPERATORS.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
                </select>
                {channel !== 'CARD' && (
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="N° Mobile Money" inputMode="tel" className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
                )}
              </div>
              <button disabled={busy || (channel !== 'CARD' && phone.trim().length < 8)} onClick={pay}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                <Wallet className="h-4 w-4" /> Valider et payer {formatFcfa(total)}
              </button>
            </div>
          )}

          {mission.status === 'paid' && (
            <p className="text-xs text-emerald-700 flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Payée le {mission.paidAt ? new Date(mission.paidAt).toLocaleDateString('fr-FR') : ''} — {formatFcfa(total)}. Merci !</p>
          )}

          {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ARTISAN : mes offres, missions confiées, déclaration de fin        */
/* ------------------------------------------------------------------ */

export function ArtisanMissionsPanel({ artisanId }: { artisanId: string }) {
  const [offers, setOffers] = useState<Application[]>([]);
  const [missions, setMissions] = useState<JobPost[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [o, m] = await Promise.all([missionService.listArtisanOffers(artisanId), missionService.listArtisanMissions(artisanId)]);
      setOffers(o);
      setMissions(m);
      // Titres des missions pour lesquelles on a fait une offre
      const known: Record<string, string> = Object.fromEntries(m.map(x => [x.id, x.title]));
      const missing = Array.from(new Set(o.map(x => x.jobId).filter(id => !known[id])));
      await Promise.all(missing.map(async id => {
        try { known[id] = (await missionService.getMission(id)).title; } catch { known[id] = 'Mission'; }
      }));
      setTitles(known);
      setError('');
    } catch (e) {
      console.error(e);
      setError('Impossible de charger vos missions.');
    } finally {
      setLoading(false);
    }
  }, [artisanId]);

  useEffect(() => { load(); }, [load]);

  const complete = async (id: string) => {
    setBusyId(id);
    setError('');
    try { await missionService.markCompleted(id); await load(); } catch (e: any) { setError(e?.message || 'Une erreur est survenue.'); } finally { setBusyId(''); }
  };

  const pendingOffers = offers.filter(o => o.status === 'pending');

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-xl font-black text-slate-800 tracking-tight">Mes missions</h2>
        <p className="text-xs text-slate-400">Vous êtes payé une fois la mission validée et réglée par le client.</p>
      </header>

      {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
      {loading ? (
        <div className="animate-pulse space-y-3">{[1, 2].map(i => <div key={i} className="h-20 bg-slate-100 rounded-2xl" />)}</div>
      ) : (
        <>
          <section className="space-y-3">
            <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Missions confiées</h3>
            {missions.length === 0 && <p className="text-xs text-slate-400">Aucune mission confiée pour l'instant.</p>}
            {missions.map(m => (
              <div key={m.id} className="bg-white border border-slate-100 rounded-2xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 truncate">{m.title}</p>
                    <p className="text-xs text-slate-400">{categoryLabel(m.category)} • {m.location}{m.scheduledDate ? ` • ${new Date(m.scheduledDate).toLocaleDateString('fr-FR')}` : ''}</p>
                    <div className="mt-1"><StatusBadge status={m.status} /></div>
                  </div>
                  <span className="font-black text-emerald-600 shrink-0">{formatFcfa(m.agreedPrice)}</span>
                </div>

                {m.status === 'assigned' && (
                  <button disabled={busyId === m.id} onClick={() => complete(m.id)}
                    className="w-full bg-slate-900 hover:bg-emerald-600 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider disabled:opacity-50">
                    {busyId === m.id ? 'Envoi…' : "J'ai terminé la mission"}
                  </button>
                )}
                {m.status === 'completed' && <p className="text-xs text-violet-700">En attente de validation et de paiement par le client.</p>}
                {m.status === 'paid' && (
                  <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl p-3 space-y-0.5">
                    <div className="flex justify-between"><span>Payé par le client</span><b>{formatFcfa(m.agreedPrice)}</b></div>
                    <div className="flex justify-between"><span>Commission IvoireSource</span><span>− {formatFcfa(m.commissionAmount)}</span></div>
                    <div className="flex justify-between border-t border-emerald-200 pt-1"><span>Vous recevez</span><b>{formatFcfa(m.artisanPayout)}</b></div>
                    <p className="text-[10px] text-emerald-700">Reversement : {m.payoutStatus === 'sent' ? 'effectué' : 'en cours de traitement'}</p>
                  </div>
                )}
              </div>
            ))}
          </section>

          <section className="space-y-3">
            <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Offres envoyées</h3>
            {offers.length === 0 && <p className="text-xs text-slate-400">Vous n'avez pas encore envoyé d'offre. Parcourez les missions disponibles.</p>}
            {offers.map(o => (
              <div key={o.id} className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-sm text-slate-800 truncate">{titles[o.jobId] || 'Mission'}</p>
                  <p className="text-xs text-slate-400">{formatFcfa(o.proposedPrice)} • {o.delay || '—'}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${o.status === 'pending' ? 'bg-amber-50 text-amber-600' : o.status === 'rejected' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  {o.status === 'pending' ? 'En attente' : o.status === 'rejected' ? 'Non retenue' : 'Retenue'}
                </span>
              </div>
            ))}
            {pendingOffers.length > 0 && <p className="text-[10px] text-slate-400">{pendingOffers.length} offre(s) en attente de réponse du client.</p>}
          </section>
        </>
      )}
    </div>
  );
}
