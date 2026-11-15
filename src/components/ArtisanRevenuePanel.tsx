import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Application, JobPost } from '../types';
import { CATEGORIES, COMMISSION_RATE, formatFcfa } from '../constants';
import { missionService } from '../services/missionService';
import { computeRevenue, revenueCsv } from '../lib/revenue';
import { saveCsv } from '../lib/download';
import { PdfButton } from './PdfButton';

const categoryName = (id: string) => CATEGORIES.find(c => c.id === id)?.label || id;
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' });
const monthLong = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Revenus de l'artisan : gagné, à recevoir, en attente, par mois et par métier, export CSV et relevé PDF. */
export function ArtisanRevenuePanel({ artisanId }: { artisanId: string }) {
  const [missions, setMissions] = useState<JobPost[]>([]);
  const [offers, setOffers] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);

  const load = useCallback(async () => {
    try {
      const [m, o] = await Promise.all([missionService.listArtisanMissions(artisanId), missionService.listArtisanOffers(artisanId)]);
      setMissions(m);
      setOffers(o);
      setError('');
    } catch (e) {
      console.error(e);
      setError('Impossible de charger vos revenus.');
    } finally {
      setLoading(false);
    }
  }, [artisanId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const refresh = () => { load(); };
    window.addEventListener('ivoire:refresh', refresh);
    return () => window.removeEventListener('ivoire:refresh', refresh);
  }, [load]);

  const rev = useMemo(() => computeRevenue(missions, offers, COMMISSION_RATE), [missions, offers]);
  const maxMonth = Math.max(1, ...rev.byMonth.map(m => m.net));
  const maxTrade = Math.max(1, ...rev.byTrade.map(t => t.net));
  const pendingNet = rev.awaitingPayment.net + rev.inProgress.net;

  if (loading) return <div className="animate-pulse grid grid-cols-2 gap-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-slate-100 rounded-2xl" />)}</div>;

  const card = (label: string, value: string, hint: string, tone = 'text-slate-900') => (
    <div className="bg-white border border-slate-100 rounded-2xl p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`text-xl font-black mt-1 ${tone}`}>{value}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>
    </div>
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Mes revenus</h2>
          <p className="text-xs text-slate-400">Calculés à partir de vos missions payées sur IvoireSource (net de commission).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={rev.rows.length === 0}
            onClick={() => saveCsv(revenueCsv(rev.rows, categoryName), `revenus-ivoiresource-${thisYear}.csv`)}
            className="px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40">
            Exporter en CSV
          </button>
          <select aria-label="Année du relevé" value={year} onChange={e => setYear(Number(e.target.value))} className="bg-slate-50 rounded-xl px-2 py-2 text-xs font-bold">
            {[thisYear, thisYear - 1, thisYear - 2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <PdfButton label={`Relevé ${year} (PDF)`} load={() => missionService.statementPdf(year)} />
        </div>
      </header>

      {error && <p className="text-xs font-bold text-rose-600">{error}</p>}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-label="Synthèse des revenus">
        {card('Gagné (net)', formatFcfa(rev.earned), `${rev.paidCount} mission(s) payée(s)`, 'text-emerald-600')}
        {card('Déjà reçu', formatFcfa(rev.received.amount), `${rev.received.count} reversement(s) effectué(s)`)}
        {card('À recevoir', formatFcfa(rev.toReceive.amount), `${rev.toReceive.count} payée(s) par le client, reversement en cours`, 'text-amber-600')}
        {card('À venir (estimé)', formatFcfa(pendingNet), `${rev.awaitingPayment.count} à payer par le client • ${rev.inProgress.count} en cours`, 'text-violet-600')}
      </section>
      <p className="text-[11px] text-slate-400 -mt-4">« À venir » est une estimation au taux de commission de {Math.round(COMMISSION_RATE * 100)} % ; les montants des missions payées sont les montants réels.</p>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {card('Prix cumulé', formatFcfa(rev.grossPaid), 'avant commission')}
        {card('Commission payée', formatFcfa(rev.commissionPaid), 'à IvoireSource')}
        {card('Panier moyen', formatFcfa(rev.averageBasket), 'par mission payée')}
        {card('Offres retenues', `${rev.offers.successRate} %`, `${rev.offers.retained} sur ${rev.offers.sent} envoyée(s)`)}
      </section>

      <section className="bg-white border border-slate-100 rounded-2xl p-4 space-y-3">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Revenus nets par mois (12 derniers mois)</h3>
        <div role="img" aria-label={`Revenus nets par mois : ${rev.byMonth.map(m => `${monthLong(m.month)} ${formatFcfa(m.net)}`).join(', ')}`} className="flex items-end gap-1.5 h-36">
          {rev.byMonth.map(m => (
            <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full gap-1" title={`${monthLong(m.month)} : ${formatFcfa(m.net)}`}>
              <div className={`w-full rounded-t-md ${m.net > 0 ? 'bg-emerald-500' : 'bg-slate-100'}`} style={{ height: `${Math.max(m.net > 0 ? 6 : 3, (m.net / maxMonth) * 100)}%` }} />
              <span className="text-[9px] text-slate-400">{monthLabel(m.month)}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-100 rounded-2xl p-4 space-y-3">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Par métier</h3>
          {rev.byTrade.length === 0 ? <p className="text-xs text-slate-400">Aucune mission payée pour le moment.</p> : rev.byTrade.map(t => (
            <div key={t.category} className="space-y-1">
              <div className="flex justify-between text-xs"><span className="font-bold text-slate-700">{categoryName(t.category)} <span className="text-slate-400 font-normal">• {t.count}</span></span><b>{formatFcfa(t.net)}</b></div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${(t.net / maxTrade) * 100}%` }} /></div>
            </div>
          ))}
        </section>
        <section className="bg-white border border-slate-100 rounded-2xl p-4 space-y-2">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Mes offres</h3>
          {[['Envoyées', rev.offers.sent], ['Retenues', rev.offers.retained], ['En discussion', rev.offers.inDiscussion], ['Non retenues ou retirées', rev.offers.declined]].map(([l, v]) => (
            <div key={l as string} className="flex justify-between text-sm border-b border-slate-50 py-1.5"><span className="text-slate-500">{l}</span><b className="text-slate-800">{v}</b></div>
          ))}
        </section>
      </div>

      <section className="space-y-3">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Missions payées</h3>
        {rev.rows.length === 0 ? (
          <p className="text-xs text-slate-400 bg-slate-50 rounded-2xl p-4">Vos missions payées apparaîtront ici dès qu'un client aura réglé une mission terminée.</p>
        ) : (
          <div className="bg-white border border-slate-100 rounded-2xl overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400">
                <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Mission</th><th className="px-4 py-3">Prix</th><th className="px-4 py-3">Commission</th><th className="px-4 py-3">Net</th><th className="px-4 py-3">Reversement</th><th className="px-4 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rev.rows.map(r => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 text-slate-500">{r.paidAt ? new Date(r.paidAt).toLocaleDateString('fr-FR') : '—'}</td>
                    <td className="px-4 py-3 font-bold text-slate-800">{r.title}<span className="block text-[10px] font-normal text-slate-400">{categoryName(r.category)}</span></td>
                    <td className="px-4 py-3">{formatFcfa(r.gross)}</td>
                    <td className="px-4 py-3 text-slate-500">− {formatFcfa(r.commission)}</td>
                    <td className="px-4 py-3 font-black text-emerald-700">{formatFcfa(r.net)}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${r.payoutSent ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-600'}`}>{r.payoutSent ? 'Effectué' : 'À recevoir'}</span></td>
                    <td className="px-4 py-3"><PdfButton label="Reçu" load={() => missionService.receiptPdf(r.id)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
