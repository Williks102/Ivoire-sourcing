import React, { useState } from 'react';
import { CATEGORIES, CITIES, SPECIALTIES } from '../constants';

interface Props {
  trades: string[];
  setTrades: (v: string[]) => void;
  skills: string[];
  setSkills: (v: string[]) => void;
  experience: number;
  setExperience: (v: number) => void;
  serviceCities: string[];
  setServiceCities: (v: string[]) => void;
  whatsappConsent: boolean;
  setWhatsappConsent: (v: boolean) => void;
  businessName: string;
  setBusinessName: (v: string) => void;
  businessRegistration: string;
  setBusinessRegistration: (v: string) => void;
}

const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter(v => v !== value) : [...list, value]);

const chip = (active: boolean) =>
  `px-3 py-1.5 rounded-full text-[11px] font-bold transition-all cursor-pointer ${active ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`;

const label = 'text-[10px] uppercase font-black text-slate-400 block mb-2';

/** Champs propres au profil artisan : métiers, spécialités, expérience, zones d'intervention. */
export function ArtisanProfileFields({ trades, setTrades, skills, setSkills, experience, setExperience, serviceCities, setServiceCities, whatsappConsent, setWhatsappConsent, businessName, setBusinessName, businessRegistration, setBusinessRegistration }: Props) {
  const [custom, setCustom] = useState('');

  // Suggestions = spécialités des métiers choisis (ou de tous si aucun métier n'est encore choisi).
  const suggestionTrades = trades.length ? trades : CATEGORIES.map(c => c.id);
  const suggestions = Array.from(new Set(suggestionTrades.flatMap(t => SPECIALTIES[t] || [])));
  const extra = skills.filter(s => !suggestions.includes(s));

  const addCustom = () => {
    const value = custom.trim().slice(0, 60);
    if (value && !skills.includes(value)) setSkills([...skills, value]);
    setCustom('');
  };

  return (
    <div className="space-y-6 border-t border-slate-50 pt-6">
      <div>
        <label className={label}>Vos métiers <span className="text-red-500">*</span></label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(c => (
            <button type="button" key={c.id} onClick={() => setTrades(toggle(trades, c.id))} className={chip(trades.includes(c.id))} aria-pressed={trades.includes(c.id)}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>
        {trades.length === 0 && <p className="text-[10px] text-amber-600 mt-2">Choisissez au moins un métier pour pouvoir proposer des offres.</p>}
      </div>

      <div>
        <label className={label}>Spécialités</label>
        <div className="flex flex-wrap gap-1.5">
          {[...suggestions, ...extra].map(skill => (
            <button type="button" key={skill} onClick={() => setSkills(toggle(skills, skill))} className={chip(skills.includes(skill))} aria-pressed={skills.includes(skill)}>
              {skill}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <input
            value={custom}
            onChange={e => setCustom(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
            placeholder="Ajouter une autre spécialité…"
            className="flex-1 bg-slate-50 px-4 py-2.5 rounded-xl border-none focus:ring-1 focus:ring-emerald-500 outline-none text-xs font-medium"
          />
          <button type="button" onClick={addCustom} className="px-4 rounded-xl bg-slate-900 text-white text-xs font-bold">Ajouter</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <label className={label}>Années d'expérience</label>
          <input
            type="number" min={0} max={60} value={experience}
            onChange={e => setExperience(Math.max(0, Math.min(60, Number(e.target.value) || 0)))}
            className="w-full bg-slate-50 px-4 py-3 rounded-xl border-none focus:ring-1 focus:ring-emerald-500 outline-none font-bold text-slate-800 text-xs h-11"
          />
        </div>
      </div>

      <div>
        <label className={label}>Zones d'intervention</label>
        <div className="flex flex-wrap gap-2">
          {CITIES.map(city => (
            <button type="button" key={city} onClick={() => setServiceCities(toggle(serviceCities, city))} className={chip(serviceCities.includes(city))} aria-pressed={serviceCities.includes(city)}>
              {city}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className={label}>Informations d'entreprise <span className="normal-case font-medium text-slate-300">(facultatif)</span></label>
          <p className="text-[11px] text-slate-400 mb-2">Reprises sur vos devis et reçus. Laissez vide si vous travaillez à titre individuel.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input aria-label="Nom de l'entreprise" maxLength={120} value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Nom de l'entreprise"
            className="w-full bg-slate-50 px-4 py-3 rounded-xl border-none focus:ring-1 focus:ring-emerald-500 outline-none font-bold text-slate-800 text-xs h-11" />
          <input aria-label="Numéro de contribuable ou RCCM" maxLength={60} value={businessRegistration} onChange={e => setBusinessRegistration(e.target.value)} placeholder="N° contribuable / RCCM"
            className="w-full bg-slate-50 px-4 py-3 rounded-xl border-none focus:ring-1 focus:ring-emerald-500 outline-none font-bold text-slate-800 text-xs h-11" />
        </div>
      </div>

      <label className="flex items-start gap-3 bg-emerald-50/60 border border-emerald-100 rounded-2xl p-4 cursor-pointer">
        <input
          type="checkbox"
          checked={whatsappConsent}
          onChange={e => setWhatsappConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
        />
        <span className="text-xs text-slate-700 leading-relaxed">
          <b>Recevoir les missions par WhatsApp.</b> J'accepte que l'équipe IvoireSource me contacte sur le numéro de mon profil
          pour me proposer des missions correspondant à mes métiers et à mes zones. Je peux retirer mon accord à tout moment ici.
        </span>
      </label>
    </div>
  );
}
