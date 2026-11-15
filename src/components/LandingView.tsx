import React from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Wallet, UserCheck, ArrowRight, MapPin, Clock, Check } from 'lucide-react';
import { CATEGORIES, COMMISSION_RATE, formatFcfa } from '../constants';
import { JobPost, UserRole } from '../types';

interface LandingViewProps {
  onSearch: (category?: string) => void;
  jobs: JobPost[];
  onSelectJob: (job: JobPost) => void;
  onViewAllJobs: () => void;
  onLogin: (role: UserRole) => Promise<void>;
  onDemoLogin?: (role: UserRole) => void;
  user: any;
  profile: any;
}

const STEPS = [
  { n: '1', title: 'Décrivez votre besoin', text: 'Publiez une mission en 2 minutes : métier, quartier, budget. C’est gratuit.' },
  { n: '2', title: 'Comparez les offres', text: 'Des artisans vérifiés vous envoient un prix et un délai. Vous choisissez.' },
  { n: '3', title: 'Payez à la fin', text: 'Vous réglez par Mobile Money uniquement quand le travail est terminé.' },
];

export function LandingView({ onSearch, jobs, onSelectJob, onViewAllJobs, onLogin, user, profile }: LandingViewProps) {
  const isArtisan = profile?.role === 'candidate';
  const isClient = profile?.role === 'employer';
  const latest = jobs.slice(0, 6);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      {/* Hero */}
      <section className="bg-slate-900 text-white px-4 md:px-8 py-16 md:py-24">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto text-center space-y-6">
          <span className="inline-block text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300 bg-emerald-500/10 px-3 py-1 rounded-full">
            Artisans & services à la mission • Côte d'Ivoire
          </span>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-tight">
            Le bon artisan, pour la bonne mission.<br className="hidden md:block" /> Vous ne payez qu'à la fin.
          </h1>
          <p className="text-slate-300 max-w-2xl mx-auto text-sm md:text-base">
            Plomberie, électricité, climatisation, peinture, ménage… Recevez des offres d'artisans vérifiés et réglez par Mobile Money une fois le travail terminé.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <button
              onClick={() => (user && isClient ? onViewAllJobs() : onLogin('employer'))}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-black px-7 py-4 rounded-2xl text-sm flex items-center justify-center gap-2"
            >
              Publier une mission <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => (user && isArtisan ? onViewAllJobs() : onLogin('candidate'))}
              className="bg-white/10 hover:bg-white/15 border border-white/20 text-white font-bold px-7 py-4 rounded-2xl text-sm"
            >
              Je suis artisan : trouver des missions
            </button>
          </div>
        </motion.div>
      </section>

      {/* Métiers */}
      <section className="px-4 md:px-8 py-12 max-w-6xl mx-auto">
        <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight mb-6">Métiers disponibles</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => onSearch(cat.id)}
              className="bg-white border border-slate-100 hover:border-emerald-300 rounded-2xl p-5 text-left transition-all hover:shadow-md">
              <div className="text-2xl mb-2">{cat.icon}</div>
              <p className="font-bold text-slate-800">{cat.label}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Voir les missions</p>
            </button>
          ))}
        </div>
      </section>

      {/* Comment ça marche */}
      <section className="px-4 md:px-8 pb-12 max-w-6xl mx-auto">
        <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight mb-6">Comment ça marche</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STEPS.map(s => (
            <div key={s.n} className="bg-white border border-slate-100 rounded-2xl p-6">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white font-black flex items-center justify-center mb-4">{s.n}</div>
              <p className="font-bold text-slate-800 mb-1">{s.title}</p>
              <p className="text-sm text-slate-500">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Missions récentes */}
      <section className="px-4 md:px-8 pb-12 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Missions récentes</h2>
          <button onClick={onViewAllJobs} className="text-sm font-bold text-emerald-600 hover:text-emerald-700">Tout voir →</button>
        </div>
        {latest.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-400">
            Aucune mission publiée pour le moment. Soyez le premier à en publier une.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {latest.map(job => (
              <button key={job.id} onClick={() => onSelectJob(job)}
                className="bg-white border border-slate-100 hover:border-emerald-300 rounded-2xl p-5 text-left transition-all hover:shadow-md">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">
                  {CATEGORIES.find(c => c.id === job.category)?.label || job.category}
                </p>
                <p className="font-bold text-slate-800 line-clamp-1">{job.title}</p>
                <p className="text-xs text-slate-400 flex items-center gap-1 mt-1"><MapPin className="h-3 w-3" />{job.location}
                  {job.scheduledDate && <><Clock className="h-3 w-3 ml-2" />{new Date(job.scheduledDate).toLocaleDateString('fr-FR')}</>}
                </p>
                <p className="font-black text-emerald-600 mt-3">{formatFcfa(job.budget)}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Garanties */}
      <section className="px-4 md:px-8 pb-16 max-w-6xl mx-auto">
        <div className="bg-slate-900 text-white rounded-3xl p-8 md:p-12 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-2">
            <Wallet className="h-6 w-6 text-emerald-400" />
            <p className="font-bold">Paiement en fin de mission</p>
            <p className="text-sm text-slate-300">Aucun frais à la publication. Vous réglez le prix convenu une fois le travail terminé, via Wave, Orange, MTN ou Moov.</p>
          </div>
          <div className="space-y-2">
            <UserCheck className="h-6 w-6 text-emerald-400" />
            <p className="font-bold">Artisans vérifiés</p>
            <p className="text-sm text-slate-300">Pièce d'identité contrôlée, avis laissés après chaque mission.</p>
          </div>
          <div className="space-y-2">
            <ShieldCheck className="h-6 w-6 text-emerald-400" />
            <p className="font-bold">Tarif transparent</p>
            <p className="text-sm text-slate-300">IvoireSource prélève {Math.round(COMMISSION_RATE * 100)} % sur le prix convenu, uniquement quand la mission est payée. Vous ne payez jamais plus que ce prix.</p>
          </div>
        </div>
        <ul className="mt-6 text-xs text-slate-400 space-y-1">
          <li className="flex items-center gap-2"><Check className="h-3 w-3 text-emerald-500" /> Pour votre sécurité, ne payez ni n'acceptez jamais de paiement en dehors de la plateforme.</li>
        </ul>
      </section>
    </div>
  );
}
