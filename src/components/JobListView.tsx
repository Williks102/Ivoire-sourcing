import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Filter, Search as SearchIcon, X, PlusCircle, MapPin, CreditCard, ShieldCheck, ArrowUpDown } from 'lucide-react';
import { JobPost } from '../types';
import { CATEGORIES, CITIES } from '../constants';

interface JobListViewProps {
  jobs: JobPost[];
  selectedCategory: string;
  setSelectedCategory: (c: string) => void;
  selectedCity: string;
  setSelectedCity: (c: string) => void;
  onApply: (jobId: string, empId: string) => void;
  canApply: boolean;
  onPostJob: () => void;
  isEmployer?: boolean;
  onSeed: () => void;
  onSelectJob: (job: JobPost) => void;
}

export function JobListView({
  jobs,
  selectedCategory,
  setSelectedCategory,
  selectedCity,
  setSelectedCity,
  onApply,
  canApply,
  onPostJob,
  isEmployer,
  onSeed,
  onSelectJob
}: JobListViewProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');

  const sortedJobs = [...jobs].sort((a, b) => {
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    return sortBy === 'newest' ? timeB - timeA : timeA - timeB;
  });

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
      {/* Sidebar Filters - Desktop */}
      <aside className="hidden md:flex w-64 bg-white border-r border-slate-200 p-6 flex-col gap-10 shrink-0 overflow-y-auto">
        <FilterContent 
          selectedCategory={selectedCategory} 
          setSelectedCategory={setSelectedCategory} 
          selectedCity={selectedCity} 
          setSelectedCity={setSelectedCity} 
        />
        <aside className="mt-auto">
          <div className="bg-slate-900 rounded-2xl p-5 text-white shadow-lg">
            <p className="text-[10px] text-slate-400 font-bold uppercase mb-2">Offres Premium</p>
            <p className="text-sm font-bold mb-4 leading-tight">Mettez en avant vos annonces</p>
            <button className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold text-xs rounded-lg transition-colors">
              DEVENEZ PREMIUM
            </button>
          </div>
        </aside>
      </aside>

      {/* List Area */}
      <section className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 md:px-8 py-6 flex-1 overflow-y-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
            <h2 className="text-2xl font-bold text-slate-800">Candidats & Offres</h2>
            <div className="flex flex-wrap items-center gap-3 sm:justify-end">
              {/* Sort Dropdown */}
              <div className="relative flex items-center bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 shadow-xxs">
                <ArrowUpDown className="h-3.5 w-3.5 text-emerald-500 mr-2 shrink-0" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest')}
                  className="bg-transparent border-none pr-6 focus:ring-0 outline-none font-bold text-slate-700 cursor-pointer appearance-none text-xs"
                >
                  <option value="newest">Date : Les plus récents</option>
                  <option value="oldest">Date : Les plus anciens</option>
                </select>
                <div className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none text-slate-400 text-[10px]">▼</div>
              </div>

              <button 
                onClick={() => setShowFilters(!showFilters)} 
                className="md:hidden bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
              >
                <Filter className="h-4 w-4" /> Filtres
              </button>
              
              <div className="flex gap-2">
                {jobs.length === 0 && (
                  <button 
                    onClick={onSeed} 
                    className="bg-emerald-50 text-emerald-700 px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all border border-emerald-100 whitespace-nowrap"
                  >
                    Exemples
                  </button>
                )}
                {isEmployer && (
                  <button onClick={onPostJob} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 hover:scale-105 transition-all whitespace-nowrap">
                    <PlusCircle className="h-4 w-4" /> Publier
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Active Mobile Filters Indicator */}
          {(selectedCategory || selectedCity) && (
            <div className="flex flex-wrap gap-2 mb-6 md:hidden">
              {selectedCategory && (
                <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1">
                  Catégorie: {CATEGORIES.find(c => c.id === selectedCategory)?.label}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => setSelectedCategory('')} />
                </span>
              )}
              {selectedCity && (
                <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1">
                  Ville: {selectedCity}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => setSelectedCity('')} />
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            {sortedJobs.length === 0 ? (
              <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-200 rounded-3xl">
                <SearchIcon className="h-10 w-10 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-400 font-medium">Aucune offre disponible pour le moment.</p>
              </div>
            ) : (
              sortedJobs.map(job => (
                <div key={job.id} onClick={() => onSelectJob(job)} className={`bg-white border p-6 rounded-2xl transition-all hover:border-emerald-500/30 job-card-shadow relative cursor-pointer group ${job.isPremium ? 'border-emerald-500/20' : 'border-slate-100'}`}>
                   {job.isPremium && <div className="absolute top-4 right-4 bg-emerald-100 text-emerald-700 text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest">Premium</div>}
                   <div className="flex gap-4 mb-4">
                     <div className="w-12 h-12 bg-slate-50 flex items-center justify-center rounded-xl text-emerald-600 font-black text-xl border border-slate-100 shrink-0">
                        {job.category[0].toUpperCase()}
                     </div>
                     <div className="min-w-0">
                       <h4 className="font-bold text-slate-800 text-lg leading-tight mb-0.5 truncate">{job.title}</h4>
                       <p className="text-xs text-slate-400 font-medium truncate">{job.location} • {new Date(job.createdAt).toLocaleDateString()} </p>
                     </div>
                   </div>
                   <p className="text-sm text-slate-500 line-clamp-2 mb-6 font-medium leading-relaxed">
                     {job.description}
                   </p>
                   <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-4 border-t border-slate-50 gap-4">
                     <span className="text-xl font-black text-emerald-600 whitespace-nowrap">{job.salaryRange} <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter">FCFA / Mois</span></span>
                     <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectJob(job);
                      }}
                      className="w-full sm:w-auto px-5 py-2.5 rounded-lg text-xs font-bold transition-all bg-slate-900 text-white hover:bg-emerald-600"
                    >
                      Détails
                    </button>
                   </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Mobile Filters Modal */}
      <AnimatePresence>
        {showFilters && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowFilters(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] md:hidden"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="fixed inset-x-0 bottom-0 bg-white rounded-t-3xl z-[70] p-6 pb-10 md:hidden flex flex-col gap-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-lg">Filtres</h3>
                <button onClick={() => setShowFilters(false)} className="p-2 -mr-2 bg-slate-100 rounded-full"><X className="h-4 w-4" /></button>
              </div>
              <FilterContent 
                selectedCategory={selectedCategory} 
                setSelectedCategory={(c) => { setSelectedCategory(c); setShowFilters(false); }} 
                selectedCity={selectedCity} 
                setSelectedCity={(c) => { setSelectedCity(c); setShowFilters(false); }} 
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FilterContent({ 
  selectedCategory, 
  setSelectedCategory, 
  selectedCity, 
  setSelectedCity 
}: {
  selectedCategory: string,
  setSelectedCategory: (c: string) => void,
  selectedCity: string,
  setSelectedCity: (c: string) => void
}) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-4">Catégories</h3>
        <div className="space-y-1">
          <button 
            onClick={() => setSelectedCategory('')}
            className={`w-full flex items-center justify-between p-2.5 rounded-xl text-sm transition-all focus:outline-none ${!selectedCategory ? 'bg-emerald-50 text-emerald-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <span>Toutes les offres</span>
          </button>
          {CATEGORIES.map(cat => (
            <button 
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`w-full flex items-center justify-between p-2.5 rounded-xl text-sm transition-all focus:outline-none ${selectedCategory === cat.id ? 'bg-emerald-50 text-emerald-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-4">Localisation</h3>
        <select 
          value={selectedCity}
          onChange={(e) => setSelectedCity(e.target.value)}
          className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-1 focus:ring-emerald-500 outline-none appearance-none"
        >
          <option value="">Toute la CI</option>
          {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
    </div>
  );
}

interface JobDetailViewProps {
  job: JobPost;
  onClose: () => void;
  onApply: () => void;
  canApply: boolean;
}

export function JobDetailView({ job, onClose, onApply, canApply }: JobDetailViewProps) {
  return (
    <motion.div 
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      className="fixed inset-0 md:inset-y-0 md:right-0 md:left-auto md:w-[450px] bg-white shadow-2xl z-[100] flex flex-col border-l border-slate-100"
    >
      <header className="p-6 md:p-8 border-b border-slate-50 flex items-center justify-between">
        <button onClick={onClose} className="p-2 -ml-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors">
          <X className="h-5 w-5 text-slate-600" />
        </button>
        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{job.category}</span>
      </header>

      <div className="flex-1 overflow-y-auto px-6 md:px-8 py-8 md:py-10">
        <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-6">
          {job.isPremium ? 'Offre Premium' : 'Annonce Vérifiée'}
        </div>
        
        <h2 className="text-3xl font-black text-slate-900 tracking-tight leading-tight mb-4">{job.title}</h2>
        
        <div className="flex flex-wrap gap-4 mb-10">
          <div className="flex items-center gap-2 text-slate-500">
            <MapPin className="h-4 w-4" />
            <span className="text-sm font-medium">{job.location}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            <CreditCard className="h-4 w-4" />
            <span className="text-sm font-bold text-emerald-600">{job.salaryRange} FCFA</span>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <h4 className="text-[10px] uppercase font-black text-slate-300 tracking-widest mb-4">Description du poste</h4>
            <div className="text-slate-600 leading-relaxed space-y-4 whitespace-pre-wrap">
              {job.description}
            </div>
          </div>

          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="flex items-center gap-4 mb-4">
               <div className="w-10 h-10 bg-white rounded-xl border border-slate-200 flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-6 w-6 text-emerald-500" />
               </div>
               <div>
                  <p className="text-xs font-bold text-slate-800">Recrutement Sûr</p>
                  <p className="text-[10px] text-slate-400">Identité du recruteur validée.</p>
               </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="p-6 md:p-8 bg-white border-t border-slate-100">
        <button 
          onClick={onApply}
          className={`w-full py-4 rounded-xl font-bold transition-all shadow-lg text-sm ${canApply ? 'bg-emerald-600 text-white hover:scale-[1.02] active:scale-95 shadow-emerald-100' : 'bg-slate-900 text-white hover:bg-emerald-600'}`}
        >
          {canApply ? 'POSTULER MAINTENANT' : 'CONNECTEZ-VOUS COMME CANDIDAT'}
        </button>
        {!canApply && (
           <p className="text-center text-[10px] text-slate-400 mt-4 uppercase font-bold tracking-tight">Postulation réservée aux candidats vérifiés</p>
        )}
      </footer>
    </motion.div>
  );
}
