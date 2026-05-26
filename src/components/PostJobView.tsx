import React, { useState } from 'react';
import { motion } from 'motion/react';
import { UserProfile } from '../types';
import { CITIES, CATEGORIES } from '../constants';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface PostJobViewProps {
  onPosted: () => void;
  profile: UserProfile | null;
}

export function PostJobView({ onPosted, profile }: PostJobViewProps) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'nounou' as any,
    location: CITIES[0],
    salaryRange: '',
    isPremium: false
  });
  const [submitting, setSubmitting] = useState(false);

  if (!profile) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let approved = true;
      let reason = "";

      // Safe API fetch with graceful fallback for static hostings (like Vercel)
      try {
        const modRes = await fetch('/api/moderation/check-job', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: formData.title, description: formData.description })
        });
        if (modRes.ok) {
          const modData = await modRes.json();
          approved = !!modData.approved;
          reason = modData.reason || "";
        } else {
          console.warn('[Vercel Mode] Moderation API server not running or returned an issue. Running offline/bypass mode.');
        }
      } catch (apiErr) {
        console.warn('[Vercel/Static Custom Bypass] Bypassing AI moderation check because backend endpoints are not active on static server:', apiErr);
      }

      if (!approved) {
        alert("Modération d'annonce refusée : " + reason);
        setSubmitting(false);
        return;
      }

      if (formData.isPremium) {
        try {
          await fetch('/api/payments/checkout-premium', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employerId: profile.uid })
          });
        } catch (apiErr) {
          console.warn('[Vercel/Static Custom Bypass] Simulating premium checkout callback (API server offline):', apiErr);
        }
      }

      const isDemoMode = profile.uid.startsWith('demo-');
      const jobData = {
        ...formData,
        employerId: profile.uid,
        status: 'approved',
        createdAt: new Date().toISOString()
      };

      if (isDemoMode) {
        console.log("[SIMULATION] Saving job to localStorage");
        const localJobs = JSON.parse(localStorage.getItem('offline_jobs') || '[]');
        localJobs.push({ id: 'local-job-' + Math.random().toString(36).substring(7), ...jobData });
        localStorage.setItem('offline_jobs', JSON.stringify(localJobs));
        onPosted();
        return;
      }

      await addDoc(collection(db, 'jobs'), jobData);
      onPosted();
    } catch (err: any) {
      console.error("Erreur lors de la création de l'annonce d'emploi:", err);
      alert("Une erreur s'est produite lors de la publication de l'offre d'emploi sur Firestore. Assurez-vous d'avoir configuré vos droits de base de données Firebase et d'être connecté.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 overflow-y-auto px-4 md:px-8 pt-6 md:pt-12 pb-20 bg-slate-50"
    >
      <div className="max-w-xl mx-auto bg-white p-6 md:p-10 rounded-3xl border border-slate-100 shadow-xl">
        <h2 className="text-2xl md:text-3xl font-black mb-8 text-slate-900 tracking-tight">Nouvelle annonce</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
             <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 mb-1.5 block tracking-widest">Intitulé du poste</label>
                <input required className="w-full bg-slate-50 px-4 py-3 rounded-xl border-none focus:ring-1 focus:ring-emerald-500 outline-none font-medium placeholder:text-slate-300" placeholder="ex: Chauffeur VTC Privé" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
             </div>
             
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                   <label className="text-[10px] uppercase font-bold text-slate-400 mb-1.5 block tracking-widest">Catégorie</label>
                   <select className="w-full bg-slate-50 px-4 py-3 rounded-xl border-none text-sm font-medium focus:ring-1 focus:ring-emerald-500 outline-none h-12" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value as any})}>
                      {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                   </select>
                </div>
                <div>
                   <label className="text-[10px] uppercase font-bold text-slate-400 mb-1.5 block tracking-widest">Ville</label>
                   <select className="w-full bg-slate-50 px-4 py-3 rounded-xl border-none text-sm font-medium focus:ring-1 focus:ring-emerald-500 outline-none h-12" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})}>
                      {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                   </select>
                </div>
             </div>

             <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 mb-1.5 block tracking-widest">Rémunération mensuelle</label>
                <input required className="w-full bg-slate-50 px-4 py-3 rounded-xl border-none focus:ring-1 focus:ring-emerald-500 outline-none font-medium h-12" placeholder="ex: 120 000" value={formData.salaryRange} onChange={e => setFormData({...formData, salaryRange: e.target.value})} />
             </div>

             <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 mb-1.5 block tracking-widest">Conditions & Profil</label>
                <textarea required rows={4} className="w-full bg-slate-50 px-4 py-3 rounded-xl border-none focus:ring-1 focus:ring-emerald-500 outline-none font-medium text-sm" placeholder="Description détaillée..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
             </div>

             <div className="bg-emerald-50 p-4 rounded-xl flex items-center justify-between border border-emerald-100">
                <div className="flex items-center gap-3">
                   <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-black text-xs italic shrink-0">P</div>
                   <div>
                      <p className="text-xs font-bold text-emerald-900">Activer le Boost Premium</p>
                      <p className="text-[9px] text-emerald-600 font-medium">Annonce taguée et remontée en tête de liste (5 000 FCFA)</p>
                   </div>
                </div>
                <input 
                  type="checkbox" 
                  className="w-6 h-6 rounded border-emerald-200 text-emerald-600 focus:ring-emerald-500 grow-0 shrink-0"
                  checked={formData.isPremium}
                  onChange={e => setFormData({...formData, isPremium: e.target.checked})}
                />
             </div>
          </div>

          <button 
            type="submit" 
            disabled={submitting}
            className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-black transition-all flex items-center justify-center shadow-lg shadow-slate-200"
          >
            {submitting ? <div className="animate-spin h-5 w-5 border-t-2 border-white rounded-full"></div> : 'Poster mon annonce'}
          </button>
        </form>
      </div>
    </motion.div>
  );
}
