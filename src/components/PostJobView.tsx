import React, { useState } from 'react';
import { motion } from 'motion/react';
import { UserProfile } from '../types';
import { CITIES, CATEGORIES, COMMISSION_RATE } from '../constants';
import { missionService } from '../services/missionService';

interface PostJobViewProps {
  onPosted: () => void;
  profile: UserProfile | null;
}

/** Publication d'une mission par un client. Aucun paiement à la publication : on paie à la fin. */
export function PostJobView({ onPosted, profile }: PostJobViewProps) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: CATEGORIES[0].id,
    location: CITIES[0],
    address: '',
    scheduledDate: '',
    budget: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');

  if (!profile) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const budget = Math.round(Number(formData.budget.replace(/\s/g, '')));
    if (!Number.isFinite(budget) || budget <= 0) {
      setNotice('Indiquez un budget valide en FCFA.');
      return;
    }
    setSubmitting(true);
    setNotice('');
    try {
      // Modération : en cas d'échec ou d'indisponibilité, la mission part en revue manuelle (jamais validée d'office).
      let status: 'approved' | 'pending' = 'pending';
      try {
        const modRes = await fetch('/api/moderation/check-job', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: formData.title, description: formData.description }),
        });
        if (modRes.ok) {
          const mod = await modRes.json();
          if (mod.approved) status = 'approved';
          else if (!mod.review) {
            setNotice('Annonce refusée par la modération : ' + (mod.reason || 'contenu non conforme.'));
            return;
          }
        }
      } catch (apiErr) {
        console.warn('Modération indisponible, passage en revue manuelle:', apiErr);
      }

      await missionService.createMission({
        employerId: profile.uid,
        title: formData.title.trim(),
        description: formData.description.trim(),
        category: formData.category,
        location: formData.location,
        address: formData.address.trim(),
        scheduledDate: formData.scheduledDate || undefined,
        budget,
        status,
      } as any);

      if (status === 'pending') {
        alert("Votre mission est en cours de vérification. Elle sera publiée dès validation.");
      }
      onPosted();
    } catch (err: any) {
      console.error('Publication de la mission impossible:', err);
      setNotice("La mission n'a pas pu être publiée. Vérifiez votre connexion et réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  const field = 'w-full bg-slate-50 px-4 py-3 rounded-xl border-none focus:ring-1 focus:ring-emerald-500 outline-none font-medium text-sm';
  const label = 'text-[10px] uppercase font-bold text-slate-400 mb-1.5 block tracking-widest';

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="flex-1 overflow-y-auto px-4 md:px-8 pt-6 md:pt-12 pb-20 bg-slate-50">
      <div className="max-w-xl mx-auto bg-white p-6 md:p-10 rounded-3xl border border-slate-100 shadow-xl">
        <h2 className="text-2xl md:text-3xl font-black mb-2 text-slate-900 tracking-tight">Publier une mission</h2>
        <p className="text-xs text-slate-400 mb-8">Gratuit. Vous recevez des offres d'artisans et vous ne payez qu'à la fin de la mission.</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className={label}>Que faut-il faire ?</label>
            <input required className={field} placeholder="ex: Réparer une fuite sous l'évier" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Métier</label>
              <select className={field + ' h-12'} value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Ville</label>
              <select className={field + ' h-12'} value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })}>
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={label}>Quartier</label>
            <input className={field} placeholder="ex: Cocody, Riviera 3" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Budget (FCFA)</label>
              <input required inputMode="numeric" className={field + ' h-12'} placeholder="ex: 30000" value={formData.budget} onChange={e => setFormData({ ...formData, budget: e.target.value })} />
            </div>
            <div>
              <label className={label}>Date souhaitée</label>
              <input type="date" className={field + ' h-12'} value={formData.scheduledDate} onChange={e => setFormData({ ...formData, scheduledDate: e.target.value })} />
            </div>
          </div>

          <div>
            <label className={label}>Détails de la mission</label>
            <textarea required rows={4} className={field} placeholder="Décrivez le travail, l'état actuel, le matériel disponible…" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
          </div>

          <p className="text-[11px] text-slate-400 bg-slate-50 rounded-xl p-3">
            Paiement sécurisé en fin de mission via Mobile Money. Une commission de {Math.round(COMMISSION_RATE * 100)} % est incluse dans le prix convenu : vous ne payez jamais plus que ce prix.
          </p>

          {notice && <p className="text-xs font-bold text-rose-600">{notice}</p>}

          <button type="submit" disabled={submitting}
            className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-black transition-all flex items-center justify-center shadow-lg shadow-slate-200 disabled:opacity-60">
            {submitting ? <div className="animate-spin h-5 w-5 border-t-2 border-white rounded-full"></div> : 'Publier ma mission'}
          </button>
        </form>
      </div>
    </motion.div>
  );
}
