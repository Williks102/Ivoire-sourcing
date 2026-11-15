import React, { useCallback, useEffect, useState } from 'react';
import { Application } from '../types';
import { CATEGORIES, formatFcfa } from '../constants';
import { currentPrice } from '../lib/negotiation';
import { Quote, quoteNumber, quoteProblem } from '../lib/quote';
import { missionService, QuoteTemplate } from '../services/missionService';
import { QuoteEditor, QuoteDraft, draftToQuote, emptyDraft, quoteToDraft } from './QuoteEditor';
import { QuoteSummary } from './QuoteSummary';
import { PdfButton } from './PdfButton';

type View = 'models' | 'form' | 'sent';

const statusBadge = (status: string) =>
  status === 'accepted' || status === 'approved' ? { text: 'Retenu', cls: 'bg-emerald-50 text-emerald-600' }
  : status === 'rejected' ? { text: 'Refusé', cls: 'bg-rose-50 text-rose-600' }
  : status === 'withdrawn' ? { text: 'Retiré', cls: 'bg-slate-100 text-slate-500' }
  : { text: 'En discussion', cls: 'bg-amber-50 text-amber-600' };

/**
 * Onglet « Mes devis » de l'artisan :
 *  - Mes modèles : devis enregistrés (lignes, remise, validité, conditions), réutilisables à chaque offre ;
 *  - Nouveau devis : formulaire pour composer un devis ligne par ligne, avec aperçu PDF ;
 *  - Devis envoyés : les devis joints à mes offres, avec leur état et leur PDF.
 */
export function QuotesPanel({ artisanId }: { artisanId: string }) {
  const [view, setView] = useState<View>('models');
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [max, setMax] = useState(30);
  const [offers, setOffers] = useState<Application[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // formulaire
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [draft, setDraft] = useState<QuoteDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirmId, setConfirmId] = useState('');

  const load = useCallback(async () => {
    try {
      const [t, o] = await Promise.all([missionService.listQuoteTemplates(), missionService.listArtisanOffers(artisanId)]);
      setTemplates(t.templates);
      setMax(t.max);
      setOffers(o);
      const known: Record<string, string> = {};
      await Promise.all(Array.from(new Set(o.map(x => x.jobId))).map(async id => {
        try { known[id] = (await missionService.getMission(id)).title; } catch { known[id] = 'Mission'; }
      }));
      setTitles(known);
      setError('');
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Impossible de charger vos devis.');
    } finally {
      setLoading(false);
    }
  }, [artisanId]);

  useEffect(() => { load(); }, [load]);

  const quote: Quote = draftToQuote(draft);
  const problem = quoteProblem(quote);
  const canSave = !!name.trim() && !problem;

  const startNew = () => { setEditingId(null); setName(''); setDraft(emptyDraft()); setNotice(''); setError(''); setView('form'); };
  const startEdit = (t: QuoteTemplate) => {
    if (!t.quote) return;
    setEditingId(t.id); setName(t.name); setDraft(quoteToDraft(t.quote)); setNotice(''); setError(''); setView('form');
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      await missionService.saveQuoteTemplate(name.trim(), quote, editingId || undefined);
      setNotice(editingId ? 'Modèle mis à jour.' : 'Modèle enregistré.');
      await load();
      setView('models');
      setEditingId(null);
    } catch (e: any) {
      setError(e?.message || "Le modèle n'a pas pu être enregistré.");
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async (t: QuoteTemplate) => {
    if (!t.quote) return;
    setError('');
    try {
      await missionService.saveQuoteTemplate(`${t.name} (copie)`.slice(0, 80), t.quote);
      setNotice('Modèle dupliqué.');
      await load();
    } catch (e: any) { setError(e?.message || 'Duplication impossible.'); }
  };

  const remove = async (t: QuoteTemplate) => {
    setError('');
    try { await missionService.deleteQuoteTemplate(t.id); setConfirmId(''); setNotice('Modèle supprimé.'); await load(); }
    catch (e: any) { setError(e?.message || 'Suppression impossible.'); }
  };

  const tab = (id: View, label: string) => (
    <button key={id} type="button" onClick={() => (id === 'form' ? (editingId ? setView('form') : startNew()) : setView(id))}
      aria-pressed={view === id}
      className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${view === id ? 'bg-white text-slate-800 shadow-md' : 'text-slate-500 hover:text-slate-800'}`}>
      {label}
    </button>
  );

  if (loading) return <div className="animate-pulse space-y-3">{[1, 2].map(i => <div key={i} className="h-24 bg-slate-100 rounded-2xl" />)}</div>;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-black text-slate-800 tracking-tight">Mes devis</h2>
        <p className="text-xs text-slate-400">Composez vos devis ligne par ligne, enregistrez-les comme modèles et joignez-les à vos offres.</p>
      </header>

      <div className="flex flex-wrap bg-slate-100 p-1 rounded-2xl w-fit gap-1" role="group" aria-label="Sections">
        {tab('models', `Mes modèles (${templates.length})`)}
        {tab('form', editingId ? 'Modifier le modèle' : 'Nouveau devis')}
        {tab('sent', `Devis envoyés (${offers.length})`)}
      </div>

      {notice && <p role="status" className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">✅ {notice}</p>}
      {error && <p role="alert" className="text-xs font-bold text-rose-600">{error}</p>}

      {view === 'models' && (
        <section className="space-y-3">
          {templates.length === 0 ? (
            <div className="text-center py-12 px-6 bg-slate-50 border border-dashed border-slate-200 rounded-[24px] space-y-3">
              <p className="font-bold text-slate-700 text-sm">Aucun modèle pour le moment</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">Un modèle regroupe vos lignes habituelles (main d'œuvre, matériel, déplacement…) : vous le chargez en un clic quand vous répondez à une mission.</p>
              <button type="button" onClick={startNew} className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-700">Créer mon premier modèle</button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-slate-400">{templates.length} sur {max} modèles</p>
                <button type="button" onClick={startNew} className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-700">Nouveau devis</button>
              </div>
              <ul className="space-y-3">
                {templates.map(t => (
                  <li key={t.id} className="bg-white border border-slate-100 rounded-2xl p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 truncate">{t.name}</p>
                        <p className="text-[11px] text-slate-400">{t.quote?.lines.length || 0} ligne(s) • valable {t.quote?.validityDays || 15} jours • modifié le {new Date(t.updatedAt).toLocaleDateString('fr-FR')}</p>
                        {t.quote && <p className="text-[11px] text-slate-500 mt-1 truncate">{t.quote.lines.map(l => l.label).join(' • ')}</p>}
                      </div>
                      <p className="font-black text-emerald-700 shrink-0">{formatFcfa(t.total)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => startEdit(t)} className="px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-slate-900 text-white hover:bg-slate-700">Modifier</button>
                      <button type="button" onClick={() => duplicate(t)} className="px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 hover:bg-slate-200">Dupliquer</button>
                      {t.quote && <PdfButton label="Aperçu PDF" load={() => missionService.draftPdf(t.name, t.quote!)} />}
                      {confirmId === t.id ? (
                        <span className="inline-flex items-center gap-2 text-[11px]">
                          <span className="font-bold text-rose-600">Supprimer ce modèle ?</span>
                          <button type="button" onClick={() => remove(t)} className="px-3 py-2 rounded-xl text-[10px] font-bold uppercase bg-red-600 text-white hover:bg-red-700">Oui, supprimer</button>
                          <button type="button" onClick={() => setConfirmId('')} className="px-3 py-2 rounded-xl text-[10px] font-bold uppercase bg-slate-100 text-slate-600">Annuler</button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setConfirmId(t.id)} className="px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-red-50 text-red-600 hover:bg-red-100 border border-red-100">Supprimer</button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {view === 'form' && (
        <form onSubmit={(e) => { e.preventDefault(); save(); }} className="bg-white border border-slate-100 rounded-3xl p-5 md:p-6 space-y-5" aria-label="Formulaire de devis">
          <div>
            <label className="text-[10px] uppercase font-black text-slate-400 block mb-2" htmlFor="quote-name">Nom du modèle</label>
            <input id="quote-name" required maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="Ex : Fuite d'eau standard"
              className="w-full bg-slate-50 px-4 py-3 rounded-xl border-none focus:ring-1 focus:ring-emerald-500 outline-none font-bold text-slate-800 text-sm" />
            <p className="text-[11px] text-slate-400 mt-1">Seul vous le voyez : il sert à retrouver ce devis quand vous répondez à une mission.</p>
          </div>

          <div>
            <p className="text-[10px] uppercase font-black text-slate-400 mb-2">Lignes du devis</p>
            <QuoteEditor value={draft} onChange={setDraft} />
          </div>

          {problem && name.trim() && <p role="status" className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">{problem}</p>}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="submit" disabled={!canSave || saving} className="px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
              {saving ? 'Enregistrement…' : editingId ? 'Enregistrer les modifications' : 'Enregistrer le modèle'}
            </button>
            {!problem && <PdfButton label="Aperçu PDF" load={() => missionService.draftPdf(name.trim(), quote)} />}
            <button type="button" onClick={() => { setView('models'); setEditingId(null); setError(''); }} className="px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-600 hover:bg-slate-200">Annuler</button>
          </div>
        </form>
      )}

      {view === 'sent' && (
        <section className="space-y-3">
          {offers.length === 0 ? (
            <p className="text-xs text-slate-400 bg-slate-50 rounded-2xl p-4">Vous n'avez pas encore envoyé d'offre. Ouvrez une mission, puis « Proposer mon offre » : ajoutez un devis détaillé ou chargez l'un de vos modèles.</p>
          ) : offers.map(o => {
            const badge = statusBadge(o.status);
            return (
              <div key={o.id} className="bg-white border border-slate-100 rounded-2xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-slate-800 truncate">{titles[o.jobId] || 'Mission'}</p>
                    <p className="text-[11px] text-slate-400 font-mono">{quoteNumber(o)} • {new Date(o.createdAt).toLocaleDateString('fr-FR')}</p>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="font-black text-emerald-700">{formatFcfa(currentPrice(o))}</p>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${badge.cls}`}>{badge.text}</span>
                  </div>
                </div>
                <QuoteSummary offer={o} />
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
