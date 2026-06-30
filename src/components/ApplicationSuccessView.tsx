import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, MapPin, CreditCard, Calendar, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { JobPost } from '../types';

interface ApplicationSuccessViewProps {
  job: JobPost | null;
  onClose: () => void;
  onGoToDashboard: () => void;
}

export function ApplicationSuccessView({ job, onClose, onGoToDashboard }: ApplicationSuccessViewProps) {
  if (!job) return null;

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const modalAnimation = isMobile ? {
    initial: { y: "100%" },
    animate: { y: 0 },
    exit: { y: "100%" },
    transition: {  damping: 25, stiffness: 220 }
  } : {
    initial: { scale: 0.95, y: 20 },
    animate: { scale: 1, y: 0 },
    exit: { scale: 0.95, y: 20 }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[200] flex items-end sm:items-center justify-center sm:p-4 overflow-y-auto"
    >
      <motion.div 
        {...modalAnimation}
        className="bg-white max-w-lg w-full rounded-t-[32px] sm:rounded-[32px] overflow-hidden shadow-2xl border border-slate-100 p-6 sm:p-8 md:p-10 relative font-sans my-0 sm:my-8 max-h-[85vh] sm:max-h-[90vh] overflow-y-auto"
      >
        {isMobile && (
          <div className="pt-1 pb-4 shrink-0 flex justify-center">
            <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
          </div>
        )}
        {/* Decorative corner sparkles */}
        <div className="absolute top-6 right-6 text-emerald-500 animate-pulse">
          <Sparkles className="h-6 w-6" />
        </div>

        {/* Dynamic Success Checkmark with subtle scale pulsing */}
        <div className="flex flex-col items-center text-center mb-8">
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.2, 1] }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 mb-6 shadow-sm border border-emerald-100/50"
          >
            <CheckCircle2 className="h-10 w-10 text-emerald-600 stroke-[2.5]" />
          </motion.div>
          
          <span className="text-[10px] font-black tracking-[0.2em] text-emerald-600 uppercase mb-2">FÉLICITATIONS</span>
          <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight leading-tight">
            Candidature Envoyée !
          </h2>
          <p className="text-xs text-slate-400 mt-2 max-w-xs font-medium">
            Votre profil a été transmis avec succès à l'employeur.
          </p>
        </div>

        {/* Job Details Card */}
        <div className="bg-slate-50 border border-slate-100 rounded-3xl p-5 mb-8">
          <div className="flex gap-4 items-start mb-4">
            <div className="w-10 h-10 bg-emerald-600 text-white flex items-center justify-center rounded-xl font-black text-lg shadow-sm">
              {job.title ? job.title[0].toUpperCase() : 'J'}
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[9px] font-black text-emerald-600 tracking-wider uppercase bg-emerald-50 px-2 py-0.5 rounded">
                {job.category || "Emploi"}
              </span>
              <h4 className="font-bold text-slate-800 text-md mt-1 truncate leading-tight">
                {job.title}
              </h4>
              <p className="text-xs text-slate-400 font-semibold mt-0.5 truncate">
                {job.location}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-3 text-xs">
            <div className="flex items-center gap-2 text-slate-500 font-medium">
              <CreditCard className="h-3.5 w-3.5 text-slate-400" />
              <span>{job.salaryRange} FCFA / mois</span>
            </div>
            <div className="flex items-center gap-2 text-slate-500 font-medium justify-end">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span>Aujourd'hui</span>
            </div>
          </div>
        </div>

        {/* Timeline Next Steps */}
        <div className="mb-8 space-y-5">
          <h3 className="text-[10px] uppercase font-black text-slate-400 tracking-wider mb-2">
            Prochaines étapes :
          </h3>

          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px] shrink-0">
                1
              </div>
              <div className="w-0.5 h-10 bg-slate-100 mt-1"></div>
            </div>
            <div>
              <h5 className="font-bold text-slate-800 text-xs leading-none">Transmission du dossier</h5>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Votre CV, photo de profil et historique d'avis ont été envoyés de manière sécurisée.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-[10px] shrink-0">
                2
              </div>
              <div className="w-0.5 h-10 bg-slate-100 mt-1"></div>
            </div>
            <div>
              <h5 className="font-bold text-slate-800 text-xs leading-none">Examen par le recruteur</h5>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Le recruteur étudie votre candidature. S'il est intéressé, il vous contactera par email ou téléphone.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-[10px] shrink-0">
                3
              </div>
            </div>
            <div>
              <h5 className="font-bold text-slate-800 text-xs leading-none">Entretien et Embauche</h5>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Si votre profil est retenu, préparez vos questions et vos documents pour finaliser l'entretien.
              </p>
            </div>
          </div>
        </div>

        {/* Tips box */}
        <div className="p-4 bg-emerald-50/50 border border-emerald-100/40 rounded-2xl mb-8 flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-[11px] text-emerald-800 leading-relaxed font-medium">
            <p className="font-bold">Conseil de sécurité</p>
            <p className="mt-0.5 text-emerald-700/85">
              Ne versez jamais d'argent pour un entretien d'embauche ou des frais de dossier. Signalez tout recruteur suspect à notre équipe administrative.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button 
            type="button"
            onClick={onClose}
            className="flex-1 py-3.5 px-4 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all font-sans text-center"
          >
            Continuer la recherche
          </button>
          <button 
            type="button"
            onClick={onGoToDashboard}
            className="flex-1 py-3.5 px-4 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-all font-sans flex items-center justify-center gap-2 shadow-lg shadow-emerald-100"
          >
            Suivre ma candidature
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
