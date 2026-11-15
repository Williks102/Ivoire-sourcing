import React, { useEffect, useState } from 'react';
import { X, MessageCircle, Sparkles, Copy, CheckCircle2, ShieldCheck, Star, Info } from 'lucide-react';
import { JobPost } from '../types';
import { CATEGORIES, formatFcfa } from '../constants';
import { missionService, OutreachCandidate } from '../services/missionService';

interface Props {
  mission: JobPost;
  onClose: () => void;
}

const categoryName = (id?: string) => CATEGORIES.find(c => c.id === id)?.label || id || '';

/**
 * Diffusion d'une mission aux artisans concernés : l'administrateur envoie lui-même le message
 * depuis son WhatsApp (lien wa.me prérempli). Rien n'est envoyé automatiquement.
 */
export function OutreachModal({ mission, onClose }: Props) {
  const [candidates, setCandidates] = useState<OutreachCandidate[]>([]);
  const [excluded, setExcluded] = useState({ noConsent: 0, noPhone: 0 });
  const [aiAvailable, setAiAvailable] = useState(false);
  const [message, setMessage] = useState('');
  const [source, setSource] = useState<'ai' | 'template'>('template');
  const [loading, setLoading] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Message fixe au départ (rapide, sans quota IA) ; l'IA est proposée à la demande.
        const [list, draft] = await Promise.all([
          missionService.adminOutreachCandidates(mission.id),
          missionService.adminOutreachDraft(mission.id, false),
        ]);
        if (cancelled) return;
        setCandidates(list.candidates);
        setExcluded(list.excluded);
        setAiAvailable(list.aiAvailable);
        setMessage(draft.message);
        setSource(draft.source);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Chargement impossible.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mission.id]);

  const improveWithAi = async () => {
    setAiBusy(true);
    setError('');
    try {
      const draft = await missionService.adminOutreachDraft(mission.id, true);
      setMessage(draft.message);
      setSource(draft.source);
      if (draft.source === 'template') setError("L'IA n'a pas pu rédiger un message sûr : le modèle standard est conservé.");
    } catch (e: any) {
      setError(e?.message || "L'IA est indisponible.");
    } finally {
      setAiBusy(false);
    }
  };

  const personalize = (c: OutreachCandidate) => message.replace(/\{prenom\}/g, c.firstName);
  const waLink = (c: OutreachCandidate) => `https://wa.me/${c.whatsapp}?text=${encodeURIComponent(personalize(c))}`;

  const markContacted = (c: OutreachCandidate) => {
    setCandidates(prev => prev.map(x => (x.id === c.id ? { ...x, contactedAt: new Date().toISOString() } : x)));
    missionService.adminOutreachMark(mission.id, c.id).catch(() => setError("Le contact n'a pas pu être enregistré."));
  };

  const copyForGroup = async () => {
    const text = message.replace(/Bonjour \{prenom\}/g, 'Bonjour à tous').replace(/\{prenom\}/g, '');
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError('Copie impossible : sélectionnez le texte à la main.'); }
  };

  const suggestion = mission.aiCategory && mission.aiCategory !== mission.category ? categoryName(mission.aiCategory) : '';

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[200] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-label="Diffuser la mission">
      <div className="bg-white w-full max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <header className="p-5 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Diffuser aux artisans</p>
            <h3 className="font-bold text-slate-800 truncate">{mission.title}</h3>
            <p className="text-xs text-slate-400">{categoryName(mission.category)} • {mission.location} • {formatFcfa(mission.budget)}</p>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:bg-slate-100 rounded-full" aria-label="Fermer"><X className="h-5 w-5" /></button>
        </header>

        <div className="overflow-y-auto p-5 space-y-5">
          {(mission.aiSummary || mission.aiMissing?.length || suggestion) && (
            <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4 text-xs text-violet-900 space-y-1.5">
              <p className="font-black uppercase tracking-wider text-[10px] flex items-center gap-1.5"><Sparkles className="h-3 w-3" /> Analyse IA de la mission</p>
              {mission.aiSummary && <p>{mission.aiSummary}</p>}
              {suggestion && <p>⚠️ L'IA suggère plutôt le métier « {suggestion} » (le client a choisi « {categoryName(mission.category)} »).</p>}
              {!!mission.aiMissing?.length && <p className="text-violet-700">À préciser : {mission.aiMissing.join(' • ')}</p>}
            </div>
          )}

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Message ({source === 'ai' ? 'rédigé par IA' : 'modèle standard'})</h4>
              <div className="flex gap-2">
                {aiAvailable && (
                  <button onClick={improveWithAi} disabled={aiBusy || loading} className="px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-50 flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3" /> {aiBusy ? 'Rédaction…' : 'Améliorer avec l\'IA'}
                  </button>
                )}
                <button onClick={copyForGroup} disabled={!message} className="px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 flex items-center gap-1.5">
                  {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />} {copied ? 'Copié' : 'Copier (groupe)'}
                </button>
              </div>
            </div>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={9}
              aria-label="Message WhatsApp"
              className="w-full bg-slate-50 rounded-2xl p-4 text-sm leading-relaxed outline-none focus:ring-1 focus:ring-emerald-500 resize-y"
            />
            <p className="text-[11px] text-slate-400">« {'{prenom}'} » est remplacé par le prénom de chaque artisan. Relisez et modifiez avant d'envoyer.</p>
          </section>

          {!aiAvailable && !loading && (
            <p className="text-[11px] text-slate-400 flex items-start gap-1.5"><Info className="h-3 w-3 mt-0.5 shrink-0" /> L'IA n'est pas activée (clé Gemini absente) : le modèle standard est utilisé.</p>
          )}
          {error && <p className="text-xs font-bold text-rose-600">{error}</p>}

          <section className="space-y-2">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Artisans concernés ({candidates.length})</h4>
            {loading ? (
              <div className="animate-pulse space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-slate-100 rounded-2xl" />)}</div>
            ) : candidates.length === 0 ? (
              <p className="text-xs text-slate-400 bg-slate-50 rounded-2xl p-4">Aucun artisan correspondant (métier, ville, consentement WhatsApp et numéro valide).</p>
            ) : (
              <ul className="space-y-2">
                {candidates.map(c => (
                  <li key={c.id} className="border border-slate-100 rounded-2xl p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-slate-800 flex items-center gap-1.5 flex-wrap">
                        {c.name}
                        {c.isVerified && <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full"><ShieldCheck className="h-3 w-3" /> Certifié</span>}
                        {c.contactedAt && <span className="text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">Contacté le {new Date(c.contactedAt).toLocaleDateString('fr-FR')}</span>}
                      </p>
                      <p className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
                        {c.rating > 0 && <span className="inline-flex items-center gap-0.5"><Star className="h-3 w-3 text-amber-400 fill-amber-400" />{c.rating.toFixed(1)} ({c.reviewCount})</span>}
                        <span>{c.experienceYears} an(s)</span>
                        {c.specialties.length > 0 && <span className="truncate">{c.specialties.join(' • ')}</span>}
                        {c.zoneUnknown && <span className="text-amber-600">zone non précisée</span>}
                      </p>
                    </div>
                    <a
                      href={waLink(c)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => markContacted(c)}
                      className="shrink-0 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {(excluded.noConsent > 0 || excluded.noPhone > 0) && (
              <p className="text-[11px] text-slate-400 flex items-start gap-1.5">
                <Info className="h-3 w-3 mt-0.5 shrink-0" />
                Non listés : {excluded.noConsent} artisan(s) correspondant(s) sans consentement WhatsApp, {excluded.noPhone} sans numéro valide.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
