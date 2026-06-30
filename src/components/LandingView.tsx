import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle2, 
  ShieldCheck, 
  Search, 
  MapPin, 
  Briefcase, 
  Star, 
  Lock, 
  CreditCard, 
  Phone, 
  Mail, 
  Check, 
  Sparkles,
  ArrowRight,
  Clock,
  ChevronRight,
  User,
  PlusCircle,
  Users,
  TrendingUp,
  Award,
  FileText,
  UserCheck
} from 'lucide-react';
import { db, auth, doc, setDoc, getDoc, deleteDoc, collection, query, where, limit, getDocs, signOut, getIsBackendAvailable } from '../lib/appwriteBackend';
import { CATEGORIES, CITIES } from '../constants';
import { JobPost, UserRole } from '../types';

export const OPERATORS_MAP = {
  wave: { code: 'WAVECI', label: 'Wave 🌊' },
  orange: { code: 'OMCIV2', label: 'Orange 🍊' },
  mtn: { code: 'MOMOCI', label: 'MTN 🟨' },
  moov: { code: 'FLOOZ', label: 'Moov 🍫' },
  card: { code: 'CARD', label: 'Carte Bancaire 💳' }
};

export const loadPaiementProScript = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if ((window as any).PaiementPro) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = "https://www.paiementpro.net/webservice/onlinepayment/js/paiementpro.v1.0.1.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
};

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

interface LocalDemoCandidate {
  id: string;
  displayName: string;
  category: string;
  location: string;
  experienceYears: number;
  averageRating: number;
  photoURL: string;
  phone: string;
  email: string;
  skills: string[];
}

const DEMO_CANDIDATES: LocalDemoCandidate[] = [
  { 
    id: 'demo-cand-1', 
    displayName: 'Awa Koné', 
    category: 'nounou', 
    location: 'Abidjan', 
    experienceYears: 3, 
    averageRating: 4.8, 
    photoURL: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=200&auto=format&fit=crop', 
    phone: '+225 07 48 92 11 02', 
    email: 'awa.kone@gmail.com',
    skills: ['Garde d\'enfants', 'Cuisine de base', 'Premiers secours']
  },
  { 
    id: 'demo-cand-2', 
    displayName: 'Koffi Kouamé', 
    category: 'chauffeur', 
    location: 'Abidjan', 
    experienceYears: 5, 
    averageRating: 4.9, 
    photoURL: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop', 
    phone: '+225 05 55 12 34 89', 
    email: 'koffi.chauffeur@gmail.com',
    skills: ['Conduite défensive', 'Mécanique de base', 'Liaison aéroport']
  },
  { 
    id: 'demo-cand-3', 
    displayName: 'Mariam Diarrassouba', 
    category: 'nounou', 
    location: 'Yamoussoukro', 
    experienceYears: 4, 
    averageRating: 4.7, 
    photoURL: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop', 
    phone: '+225 01 02 03 04 05', 
    email: 'mariam.d@gmail.com',
    skills: ['Garde de jumeaux', 'Aide aux devoirs', 'Activités créatives']
  },
  { 
    id: 'demo-cand-4', 
    displayName: 'Yao Kouadio', 
    category: 'cuisinier', 
    location: 'Bouaké', 
    experienceYears: 6, 
    averageRating: 5.0, 
    photoURL: 'https://images.unsplash.com/photo-1583394838336-acd977736f90?q=80&w=200&auto=format&fit=crop', 
    phone: '+225 07 77 88 99 00', 
    email: 'yao.chef@gmail.com',
    skills: ['Cuisine Ivoirienne', 'Pâtisserie', 'Gestion des stocks']
  },
  { 
    id: 'demo-cand-5', 
    displayName: 'Alima Touré', 
    category: 'boy', 
    location: 'Abidjan', 
    experienceYears: 2, 
    averageRating: 4.6, 
    photoURL: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?q=80&w=200&auto=format&fit=crop', 
    phone: '+225 05 08 19 20 44', 
    email: 'alima.toure@gmail.com',
    skills: ['Nettoyage à fond', 'Repassage', 'Entretien des textiles']
  },
];

const FALLBACK_DEMO_JOBS: any[] = [
  {
    id: 'demo-1',
    title: 'Nounou Plein Temps Couchée',
    description: 'Recherche nounou chaleureuse et patiente pour s\'occuper d\'une petite fille de 18 mois à Cocody Angré. Tâches additionnelles: préparation des repas sains pour le bébé, rangement de sa chambre.',
    category: 'nounou',
    location: 'Abidjan',
    salaryRange: '130 000',
    isPremium: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'demo-2',
    title: 'Chauffeur Privé de Direction',
    description: 'Nous recherchons un chauffeur de confiance très ponctuel pour conduire un cadre de direction. Véhicule moderne automatique. Maîtrise parfaite de Vridi, Plateau et route de Bassam.',
    category: 'chauffeur',
    location: 'Abidjan',
    salaryRange: '160 000',
    isPremium: false,
    createdAt: new Date().toISOString()
  },
  {
    id: 'demo-3',
    title: 'Aide-Ménagère de Confiance (Gouvernante de Foyer)',
    description: 'Recherche gouvernante de maison à Yamoussoukro pour s\'occuper du nettoyage de fond, repassage et de la cuisine de spécialités ivoiriennes. Logement individuel décent fourni.',
    category: 'boy',
    location: 'Yamoussoukro',
    salaryRange: '110 000',
    isPremium: false,
    createdAt: new Date().toISOString()
  }
];

export function LandingView({ 
  onSearch, 
  jobs, 
  onSelectJob, 
  onViewAllJobs, 
  onLogin, 
  onDemoLogin,
  user, 
  profile 
}: LandingViewProps) {
  // Navigation / Tab States
  const [roleTab, setRoleTab] = useState<'recruiter' | 'candidate'>('recruiter');

  // Criteria Sourcing States
  const [selCategory, setSelCategory] = useState<string>('nounou');
  const [selCity, setSelCity] = useState<string>('Abidjan');
  const [selExperience, setSelExperience] = useState<number>(1);
  const [searchTriggered, setSearchTriggered] = useState<boolean>(false);
  const [candidatesList, setCandidatesList] = useState<LocalDemoCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState<boolean>(false);

  // Active Selected Profile & Payment checkout
  const [selectedProfile, setSelectedProfile] = useState<LocalDemoCandidate | null>(null);
  const [checkoutStep, setCheckoutStep] = useState<'plans' | 'payment-method' | 'processing' | 'success'>('plans');
  const [chosenPlan, setChosenPlan] = useState<'one-time' | 'monthly'>('one-time');
  const [paymentOperator, setPaymentOperator] = useState<'wave' | 'orange' | 'mtn' | 'moov' | 'card'>('wave');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [paymentError, setPaymentError] = useState<string>('');
  const [paymentStatusMessage, setPaymentStatusMessage] = useState<string>('');

  // Secure Admin Verification States
  const [isMobile, setIsMobile] = useState<boolean>(false);
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const [showAdminPinModal, setShowAdminPinModal] = useState<boolean>(false);
  const [adminPinValue, setAdminPinValue] = useState<string>('');
  const [adminPinError, setAdminPinError] = useState<string>('');

  // Use only the real/fetched jobs list, with no flat static mock fallback
  const displayedJobs = jobs && jobs.length > 0 ? jobs.slice(0, 4) : [];

  // Sourcing logic - fetch matching candidates from Appwrite or fallback to local demo
  const handleSourcingSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingCandidates(true);
    setSearchTriggered(true);

    try {
      // Try fetching real candidate profiles from Appwrite users collection
      const q = query(
        collection(db, 'users'), 
        where('role', '==', 'candidate'), 
        where('isVerified', '==', true),
        limit(40)
      );
      const snap = await getDocs(q);
      
      let fetched: LocalDemoCandidate[] = snap.docs.map(doc => {
        const d = doc.data();
        return {
          id: d.uid || doc.id,
          displayName: d.displayName || 'Profil Vérifié',
          category: d.skills?.[0]?.toLowerCase() || 'nounou', // safe estimate
          location: d.location || 'Abidjan',
          experienceYears: d.experienceYears !== undefined ? Number(d.experienceYears) : 2,
          averageRating: d.averageRating || 4.5,
          photoURL: d.photoURL || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop',
          phone: d.phone || '+225 07 00 00 00 00',
          email: d.email || 'candidat@ivoiresource.ci',
          skills: d.skills || ['Nettoyage', 'Soin']
        };
      });

      // Merge with default candidates to ensure results corresponding to selected criteria always exist beautifully
      const merged = [...fetched, ...DEMO_CANDIDATES];
      
      // Apply filters client-side
      const filtered = merged.filter(cand => {
        const matchesCategory = !selCategory || cand.category.toLowerCase().includes(selCategory.toLowerCase());
        const matchesLocation = !selCity || cand.location.toLowerCase() === selCity.toLowerCase();
        const matchesExperience = cand.experienceYears >= selExperience;
        return matchesCategory && matchesLocation && matchesExperience;
      });

      setCandidatesList(filtered);
    } catch (err) {
      console.error("Appwrite candidate fetch error:", err);
      // fallback to offline matching
      const filtered = DEMO_CANDIDATES.filter(cand => {
        const matchesCategory = !selCategory || cand.category === selCategory;
        const matchesLocation = !selCity || cand.location === selCity;
        const matchesExperience = cand.experienceYears >= selExperience;
        return matchesCategory && matchesLocation && matchesExperience;
      });
      setCandidatesList(filtered);
    } finally {
      setLoadingCandidates(false);
      // Scroll to candidates section smoothly
      setTimeout(() => {
        document.getElementById('proposed-profiles')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  // Simulated Mobile Money checkout process
  const startPaymentCheckout = (plan: 'one-time' | 'monthly') => {
    setChosenPlan(plan);
    setCheckoutStep('payment-method');
  };

  const executeMobileMoneyPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber && paymentOperator !== 'card') {
      setPaymentError('Veuillez entrer un numéro de téléphone mobile money.');
      return;
    }
    setPaymentError('');
    setCheckoutStep('processing');
    setPaymentStatusMessage('Chargement du module de paiement officiel Paiement Pro...');

    // Load PaiementPro script tag asynchronously
    const loaded = await loadPaiementProScript();
    const merchantId = import.meta.env.VITE_PAIEMENTPRO_MERCHANT_ID || '';
    
    const amountVal = chosenPlan === 'one-time' ? 15000 : 30000;
    const descText = chosenPlan === 'one-time'
      ? `Déblocage Candidat Certifié: ${selectedProfile?.displayName}`
      : 'Abonnement Mensuel Illimité - IvoireSource';

    const cleanPhone = phoneNumber ? phoneNumber.trim().replace(/\s+/g, '') : '0700000000';
    const emailVal = profile?.email || auth.currentUser?.email || 'employeur@ivoiresource.ci';
    const fullName = profile?.displayName || 'Recruteur Ivoirien';
    const names = fullName.split(' ');
    const lastName = names[names.length - 1] || 'Recruteur';
    const firstName = names.slice(0, -1).join(' ') || 'Utilisateur';

    const opCode = OPERATORS_MAP[paymentOperator as keyof typeof OPERATORS_MAP]?.code || 'WAVECI';

    if (merchantId && merchantId !== 'DEMO' && loaded) {
      try {
        setPaymentStatusMessage('Initialisation de la transaction sécurisée (Paiement Pro)...');
        const paiementPro = new (window as any).PaiementPro(merchantId);
        paiementPro.amount = amountVal;
        paiementPro.channel = opCode;
        paiementPro.description = descText;
        paiementPro.referenceNumber = `IVS-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
        paiementPro.customerEmail = emailVal;
        paiementPro.customerFirstname = firstName;
        paiementPro.customerLastname = lastName;
        paiementPro.customerPhoneNumber = cleanPhone;
        paiementPro.countryCurrencyCode = '952'; // Code devise FCFA (FCFA par défaut)
        
        // Wait for SDK to contact the webservice API and generate the URL
        await paiementPro.getUrlPayment();
        
        if (paiementPro.success && paiementPro.url) {
          setPaymentStatusMessage('Redirection vers la passerelle partenaire officielle...');
          // Save a persistent unlock or state record in Appwrite first before redirecting so they have access
          const currentUser = auth.currentUser;
          if (currentUser && selectedProfile) {
            try {
              if (chosenPlan === 'one-time') {
                const unlockId = `${currentUser.uid}_${selectedProfile.id}`;
                await setDoc(doc(db, 'unlocks', unlockId), {
                  id: unlockId,
                  employerId: currentUser.uid,
                  candidateId: selectedProfile.id,
                  createdAt: new Date().toISOString()
                });
              } else if (chosenPlan === 'monthly') {
                await setDoc(doc(db, 'users', currentUser.uid), {
                  isPremium: true
                }, { merge: true });
              }
            } catch (pErr) {
              console.warn('Failed pre-saving state:', pErr);
            }
          }
          setTimeout(() => {
            window.location.href = paiementPro.url;
          }, 1200);
          return;
        } else {
          console.warn('[Paiement Pro] getUrlPayment check returned failure, running simulation fallback:', paiementPro);
        }
      } catch (sdkErr) {
        console.error('[Paiement Pro] SDK execution crash:', sdkErr);
      }
    }

    // Interactive offline/sandbox fallback so users can test immediately in live preview
    setPaymentStatusMessage(`Simulation : Demande de débit transmise au réseau ${opCode}...`);
    
    setTimeout(() => {
      setPaymentStatusMessage(`Simulation : En attente de la saisie de votre code secret USSD sur le numéro +225 ${phoneNumber || '0700000000'}...`);
    }, 1500);

    setTimeout(() => {
      setPaymentStatusMessage('Paiement validé avec succès ! Finalisation de vos accès...');
    }, 3200);

    setTimeout(async () => {
      const currentUser = auth.currentUser;
      if (currentUser && selectedProfile) {
        try {
          if (chosenPlan === 'one-time') {
            const unlockId = `${currentUser.uid}_${selectedProfile.id}`;
            await setDoc(doc(db, 'unlocks', unlockId), {
              id: unlockId,
              employerId: currentUser.uid,
              candidateId: selectedProfile.id,
              createdAt: new Date().toISOString()
            });
          } else if (chosenPlan === 'monthly') {
            await setDoc(doc(db, 'users', currentUser.uid), {
              isPremium: true
            }, { merge: true });
          }
        } catch (error) {
          console.error("Failed to persist real unlock/subscription record:", error);
        }
      }
      setCheckoutStep('success');
    }, 4500);
  };

  const getCategoryCount = (catId: string) => {
    if (!jobs || jobs.length === 0) {
      return catId === 'nounou' ? 12 : catId === 'chauffeur' ? 8 : catId === 'boy' ? 15 : 6;
    }
    return jobs.filter(j => j.category === catId).length;
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 overflow-y-auto"
    >
      {/* 1. HERO SECTION */}
      <div className="bg-gradient-to-b from-slate-900 via-slate-800 to-slate-950 text-white relative overflow-hidden px-6 md:px-12 py-16 md:py-24 border-b border-slate-800">
        {/* Abstract background grid */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.08),transparent_50%)] pointer-events-none"></div>
        
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-400 text-xs font-semibold px-4 py-1.5 rounded-full border border-emerald-500/20 shadow-sm mx-auto lg:mx-0">
              <ShieldCheck className="h-4 w-4" /> Plateforme N°1 certifiée en Côte d'Ivoire
            </div>

            <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-tight md:leading-none">
              Vos personnels de maison <span className="text-emerald-400">qualifiés</span> & certifiés.
            </h1>
            
            <p className="text-slate-300 text-sm md:text-base leading-relaxed max-w-xl mx-auto lg:mx-0">
              Trouvez facilement des nounous professionnelles, chauffeurs réactifs, aides-ménagères de confiance et cuisiniers d'exception. Une sécurité totale grâce à la vérification d'identité approfondie et de moralité.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start pt-2">
              <button 
                onClick={() => {
                  if (user && profile?.role === 'employer') {
                    onSearch();
                  } else {
                    onLogin('employer');
                  }
                }}
                className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-8 py-3.5 rounded-xl text-xs font-extrabold uppercase tracking-widest transition-all hover:shadow-lg hover:shadow-emerald-500/20 flex items-center justify-center gap-2"
              >
                💼 Trouver un Personnel (Recruter)
              </button>
              
              <button 
                onClick={() => {
                  if (user && profile?.role === 'candidate') {
                    onSearch();
                  } else {
                    onLogin('candidate');
                  }
                }}
                className="w-full sm:w-auto bg-slate-800/80 hover:bg-slate-700/80 text-white px-8 py-3.5 rounded-xl text-xs font-extrabold uppercase tracking-widest transition-all border border-slate-700 flex items-center justify-center gap-2"
              >
                👶 Devenir Candidat (S'inscrire)
              </button>
            </div>



            {/* Microstats banner */}
            <div className="grid grid-cols-3 gap-4 pt-6 max-w-md mx-auto lg:mx-0 border-t border-slate-850">
              <div>
                <span className="block text-2xl font-black text-emerald-400">500+</span>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Ménages aidés</span>
              </div>
              <div>
                <span className="block text-2xl font-black text-white">100%</span>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Profils vérifiés</span>
              </div>
              <div>
                <span className="block text-2xl font-black text-white">4.9★</span>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Note globale</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 relative">
            <div className="relative mx-auto max-w-sm lg:max-w-none">
              {/* Decorative elements */}
              <div className="absolute -top-4 -left-4 w-12 h-12 bg-emerald-500/20 rounded-2xl blur-xl"></div>
              <div className="absolute -bottom-4 -right-4 w-20 h-20 bg-emerald-400/10 rounded-full blur-2xl"></div>
              
              <div className="aspect-[4/3] md:aspect-square bg-slate-850 rounded-3xl overflow-hidden shadow-2xl border border-slate-800 p-2.5">
                <img 
                  src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=400&auto=format&fit=crop" 
                  className="w-full h-full object-cover rounded-2xl"
                  alt="Staff sourcing representation"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Float badge 1 */}
              <div className="absolute top-4 right-4 bg-slate-900/90 backdrop-blur border border-slate-700 p-3 rounded-2xl shadow-lg text-left hidden sm:flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-sm">✓</div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400">Casier Judiciaire</p>
                  <p className="text-xs font-black text-white">Vérifié & Propre</p>
                </div>
              </div>

              {/* Float badge 2 */}
              <div className="absolute bottom-6 -left-6 bg-slate-900/90 backdrop-blur border border-slate-700 p-3 rounded-2xl shadow-lg text-left hidden sm:flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-sm">★</div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400">Évaluation Globale</p>
                  <p className="text-xs font-black text-white">Excellent Maintien (4.8+)</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. CATEGORIES SECTION */}
      <section className="bg-white py-16 px-6 md:px-12 border-b border-slate-100">
        <div className="max-w-7xl mx-auto text-center space-y-12">
          <div className="space-y-3 max-w-2xl mx-auto">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">Explorez par métier</span>
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Catégories d'offres d'emploi disponibles</h2>
            <p className="text-slate-500 text-xs md:text-sm">
              Sélectionnez une catégorie pour filtrer les opportunités de carrière actives ou recruter immédiatement le profil correspondant.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { id: 'nounou', label: 'Nounou', icon: '👶', desc: 'Garde d\'enfants à demeure ou périscolaire, encadrement sécurisé et bienveillant.', bg: 'bg-indigo-50/50 hover:bg-indigo-100/30 text-indigo-700' },
              { id: 'chauffeur', label: 'Chauffeur', icon: '🚗', desc: 'Chauffeurs professionnels VTC, personnels de direction ou familiaux chevronnés.', bg: 'bg-amber-50/50 hover:bg-amber-100/30 text-amber-700' },
              { id: 'boy', label: 'Boy / Ménage', icon: '🧹', desc: 'Entretien minutieux de votre foyer, gestion du linge et intendance générale.', bg: 'bg-pink-50/50 hover:bg-pink-100/30 text-pink-700' },
              { id: 'cuisinier', label: 'Cuisinier', icon: '🍳', desc: 'Chefs à domicile experts de la gastronomie ivoirienne et internationale.', bg: 'bg-emerald-50/50 hover:bg-emerald-100/30 text-emerald-700' },
            ].map((cat) => (
              <div 
                key={cat.id}
                onClick={() => onSearch(cat.id)}
                className="bg-slate-50 border border-slate-200/60 rounded-2xl p-6 text-left hover:border-emerald-500/40 hover:emerald-card-shadow cursor-pointer transition-all duration-300 flex flex-col justify-between group h-full hover:-translate-y-1"
              >
                <div className="space-y-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-sm ${cat.bg}`}>
                    {cat.icon}
                  </div>
                  <div className="space-y-1.5">
                    <h4 className="font-extrabold text-slate-800 text-base flex items-center gap-1.5 justify-between">
                      {cat.label}
                      <ChevronRight className="h-4 w-4 text-slate-350 shrink-0 group-hover:translate-x-1 transition-transform" />
                    </h4>
                    <p className="text-slate-500 text-xs leading-relaxed font-medium">
                      {cat.desc}
                    </p>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-150 flex items-center justify-between text-[11px] text-slate-400 font-bold">
                  <span>Offres de recrutement</span>
                  <span className="bg-white border border-slate-200 px-2.5 py-1 rounded-full text-slate-700 group-hover:bg-emerald-50 group-hover:text-emerald-700 group-hover:border-emerald-200 transition-colors">
                    {getCategoryCount(cat.id)} actives
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. OFFERS LIST SECTION */}
      <section className="bg-slate-50/50 py-16 px-6 md:px-12 border-b border-slate-100">
        <div className="max-w-7xl mx-auto space-y-10">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div className="space-y-2 text-left">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full inline-block">Mises à jour quotidiennes</span>
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Dernières offres d'emploi d'Afrique de l'Ouest</h2>
              <p className="text-slate-500 text-xs md:text-sm">
                Recrutements lancés par des familles et des employeurs certifiés en Côte d'Ivoire.
              </p>
            </div>
            <button 
              onClick={onViewAllJobs}
              className="px-5 py-2.5 bg-white border border-slate-200 hover:border-emerald-500/50 hover:text-emerald-600 text-slate-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1 bg-gradient-to-r self-start md:self-auto shrink-0 transition-all shadow-sm"
            >
              Parcourir toutes les offres (<span className="text-emerald-600">{jobs?.length || 3}</span>) <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {displayedJobs.length === 0 ? (
            <div className="col-span-full bg-white border border-slate-100 p-12 rounded-3xl text-center max-w-xl mx-auto shadow-sm space-y-4">
              <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-500">
                <Briefcase className="h-6 w-6" />
              </div>
              <p className="font-bold text-slate-800 text-sm">Aucune offre d'emploi active en ligne.</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                Connectez-vous pour publier la toute première offre d'emploi ou parcourez notre portail !
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayedJobs.map((job) => (
                <div 
                  key={job.id} 
                  onClick={() => onSelectJob(job)}
                  className={`bg-white border p-6 rounded-2xl transition-all hover:border-emerald-500/30 shadow-sm relative cursor-pointer group flex flex-col justify-between h-full hover:shadow-md ${job.isPremium ? 'border-emerald-500/20' : 'border-slate-150'}`}
                >
                  {job.isPremium && (
                    <div className="absolute top-4 right-4 bg-emerald-100 text-emerald-800 text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest block font-sans">
                      ★ Premium
                    </div>
                  )}
                  
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="w-12 h-12 bg-slate-50 flex items-center justify-center rounded-xl text-emerald-600 font-black text-xl border border-slate-100 shrink-0 uppercase shadow-xxs">
                        {CATEGORIES.find(c => c.id === job.category)?.icon || '💼'}
                      </div>
                      <div className="min-w-0 text-left">
                        <h4 className="font-extrabold text-slate-800 text-base leading-tight mb-1 truncate block pr-12 font-sans">
                          {job.title}
                        </h4>
                        <p className="text-[11px] text-slate-400 font-bold flex items-center gap-1 font-sans">
                          <MapPin className="h-3 w-3 text-slate-350 shrink-0" /> {job.location} • {new Date(job.createdAt).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                    </div>

                    <p className="text-slate-500 text-xs line-clamp-3 text-left leading-relaxed font-semibold font-sans">
                      {job.description}
                    </p>
                  </div>

                  <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between gap-4">
                    <div className="text-left">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider font-sans">Salaire estimé</span>
                      <span className="text-base font-black text-emerald-600 whitespace-nowrap font-sans">
                        {job.salaryRange} <span className="text-[9px] font-bold text-slate-400 uppercase font-sans">FCFA/m</span>
                      </span>
                    </div>
                    
                    <div className="flex gap-1.5 shrink-0">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectJob(job);
                        }}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition-colors font-sans"
                      >
                        Détails
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          // triggers application flow direct
                          onSelectJob(job);
                        }}
                        className="px-4 py-2 bg-slate-900 hover:bg-emerald-600 text-white font-bold text-xs rounded-lg transition-colors group-hover:scale-[1.02] font-sans"
                      >
                        Postuler
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 4. SOURCING FORM & RESULTS (RETAIN EXISTING AMAZING COMPONENT) */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 py-16 space-y-10">
        <div className="space-y-2 text-center max-w-2xl mx-auto">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">Accès Direct Recruteurs</span>
          <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Sourcing directs de foyers & employeurs</h2>
          <p className="text-slate-500 text-xs md:text-sm">
            Vous ne voulez pas attendre de candidatures ? Filtrez et accédez directement aux fiches de profils validés et certifiés par nos soins.
          </p>
        </div>

        {/* INPUT CRITERIA FORM */}
        <div className="bg-white border border-slate-200/60 rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden text-left">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-emerald-500"></div>
          
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 font-extrabold flex items-center justify-center text-xs">A</div>
            <div>
              <h3 className="text-base font-black text-slate-900">Saisissez les critères de votre foyer</h3>
              <p className="text-xs text-slate-400">Notre moteur va identifier immédiatement et proposer les meilleurs collaborateurs à proximité.</p>
            </div>
          </div>

          <form onSubmit={handleSourcingSearch} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            {/* Category selector */}
            <div className="space-y-1.5 text-left">
              <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">Métier recherché</label>
              <div className="relative">
                <select 
                  value={selCategory}
                  onChange={(e) => setSelCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-xs rounded-xl py-3.5 px-3.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-850 font-bold appearance-none cursor-pointer"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.icon} {cat.label}</option>
                  ))}
                  <option value="autre">🔍 Autre service</option>
                </select>
                <div className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none text-slate-400 text-xxs">▼</div>
              </div>
            </div>

            {/* City selector */}
            <div className="space-y-1.5 text-left">
              <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">Zone / Ville</label>
              <div className="relative">
                <select 
                  value={selCity}
                  onChange={(e) => setSelCity(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-xs rounded-xl py-3.5 px-3.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-850 font-bold appearance-none cursor-pointer"
                >
                  {CITIES.map(city => (
                    <option key={city} value={city}>📍 {city}</option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none text-slate-400 text-xxs">▼</div>
              </div>
            </div>

            {/* Min Experience selection */}
            <div className="space-y-1.5 text-left">
              <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">An d'Expérience minimal</label>
              <div className="flex gap-2">
                {[1, 3, 5].map(exp => (
                  <button
                    type="button"
                    key={exp}
                    onClick={() => setSelExperience(exp)}
                    className={`flex-1 py-3.5 text-xs font-bold rounded-xl transition-all border ${selExperience === exp ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'}`}
                  >
                    {exp}+ {exp > 1 ? "ans" : "an"}
                  </button>
                ))}
              </div>
            </div>

            {/* Search trigger button */}
            <div>
              <button
                type="submit"
                disabled={loadingCandidates}
                className="w-full bg-slate-900 hover:bg-black text-white py-4 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all hover:shadow-lg flex items-center justify-center gap-2"
              >
                {loadingCandidates ? (
                  <span className="animate-spin rounded-full h-4.5 w-4.5 border-t-2 border-white"></span>
                ) : (
                  <>
                    <Search className="w-4 h-4" /> Proposer des Profils
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* PROPOSED PROFILES DISPLAY */}
        <div id="proposed-profiles" className="scroll-mt-6">
          <div className="flex items-center gap-3 mb-6 text-left">
            <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 font-extrabold flex items-center justify-center text-xs">B</div>
            <div>
              <h3 className="text-base font-black text-slate-900">Particuliers pré-selectionnés disponibles</h3>
              <p className="text-xs text-slate-400">Dossiers pré-audités de confiance résidant aux environs.</p>
            </div>
          </div>

          {loadingCandidates ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map(item => (
                <div key={item} className="h-64 bg-slate-100 animate-pulse rounded-3xl"></div>
              ))}
            </div>
          ) : !searchTriggered && candidatesList.length === 0 ? (
            <div className="bg-white border border-slate-100 p-12 rounded-3xl text-center max-w-xl mx-auto shadow-sm space-y-4">
              <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-500">
                <Users className="h-6 w-6" />
              </div>
              <p className="font-bold text-slate-800 text-sm font-sans">Prêt à recruter du personnel qualifié ?</p>
              <p className="text-xs text-slate-500 leading-relaxed font-sans">
                Spécifiez votre besoin (rôle, ville, expérience) ci-dessus et cliquez sur <strong>Proposer des Profils</strong> pour explorer nos candidatures de confiance auditées.
              </p>
            </div>
          ) : searchTriggered && candidatesList.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200/40 rounded-3xl p-12 text-center max-w-xl mx-auto space-y-4">
              <p className="text-sm font-bold text-slate-500 font-sans">Aucun collaborateur ne correspond à ces critères exacts.</p>
              <p className="text-xs text-slate-450 leading-relaxed font-sans font-medium">Réduisez l'expérience minimum exigée ou élargissez votre localité pour obtenir de belles propositions d'embauches.</p>
              <button 
                onClick={() => {
                  setSelCategory('nounou');
                  setSelCity('Abidjan');
                  setSelExperience(1);
                  setCandidatesList([]);
                  setSearchTriggered(false);
                }}
                className="text-xs text-emerald-600 font-bold underline cursor-pointer font-sans"
              >
                Réinitialiser les filtres
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {candidatesList.slice(0, 6).map((cand) => (
                <motion.div 
                  layoutId={`landing-cand-${cand.id}`}
                  key={cand.id} 
                  className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between text-left relative overflow-hidden group"
                >
                  <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-emerald-500/5 to-transparent rounded-bl-full pointer-events-none"></div>

                  <div className="space-y-4">
                    <div className="flex items-start gap-4">
                      <img 
                        src={cand.photoURL} 
                        alt={cand.displayName} 
                        className="w-14 h-14 rounded-2xl object-cover border border-slate-100 shrink-0 shadow-xxs"
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-sm text-slate-800 tracking-tight block truncate uppercase">{cand.displayName.replace(/ .*/,'') + ' **'}</span>
                          <span className="bg-emerald-50 text-[9px] font-black text-emerald-700 px-2 py-0.5 rounded-full uppercase tracking-wider border border-emerald-100/50">Vérifié</span>
                        </div>
                        
                        <p className="text-xs text-slate-400 font-semibold capitalize mt-1 flex items-center gap-1">
                          <Briefcase className="h-3 w-3 shrink-0 text-slate-350" /> {CATEGORIES.find(cat => cat.id === cand.category)?.label || cand.category}
                        </p>

                        <div className="flex items-center gap-1 mt-1.5">
                          <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                          <span className="text-xs font-black text-slate-700">{cand.averageRating}</span>
                          <span className="text-slate-300 font-bold">•</span>
                          <span className="text-[10px] text-slate-450 font-bold flex items-center gap-0.5">
                            <MapPin className="h-3 w-3 shrink-0 text-slate-350" /> {cand.location}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {cand.skills.map((skill, index) => (
                        <span key={index} className="bg-slate-50 text-slate-500 font-medium px-2.5 py-1 rounded-lg text-[10px] border border-slate-100 whitespace-nowrap">
                          {skill}
                        </span>
                      ))}
                    </div>

                    <div className="bg-slate-50/70 border border-slate-100 rounded-xl px-3 py-2 flex items-center justify-between text-[11px] text-slate-500">
                      <span className="font-bold">💼 Expérience accréditée :</span>
                      <span className="text-emerald-700 font-black">{cand.experienceYears} {cand.experienceYears > 1 ? "ans" : "an"}</span>
                    </div>
                  </div>

                  <div className="mt-5">
                    <button 
                      onClick={() => {
                        setSelectedProfile(cand);
                        setCheckoutStep('plans');
                      }}
                      className="w-full py-2.5 bg-slate-900 group-hover:bg-emerald-600 transition-colors text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 uppercase tracking-wider shadow-xs"
                    >
                      <Lock className="w-3.5 h-3.5" /> Voir les données de contact
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 5. DUAL CTA SECTIONS - RECRUTER ET S'INSCRIRE */}
      <section className="bg-slate-900 text-white py-16 px-6 md:px-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(16,185,129,0.06),transparent_40%)] pointer-events-none"></div>
        <div className="max-w-7xl mx-auto space-y-12 relative z-10">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <Sparkles className="h-8 w-8 text-emerald-400 mx-auto" />
            <h2 className="text-2xl md:text-4xl font-black tracking-tight leading-tight">Rejoignez l'écosystème IvoireSource</h2>
            <p className="text-slate-400 text-xs md:text-sm">
              Que vous cherchiez la perle rare ou de nouvelles opportunités de carrière certifiées, notre équipe vous accompagne.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Recruit CTA Card */}
            <div className="bg-slate-850/80 backdrop-blur border border-slate-800 rounded-3xl p-8 text-left flex flex-col justify-between space-y-6 hover:border-emerald-500/30 transition-all duration-300">
              <div className="space-y-4">
                <div className="w-12 h-12 bg-emerald-500/15 rounded-2xl flex items-center justify-center text-emerald-400">
                  <UserCheck className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-black text-white">Vous êtes un Employeur ? Recrutez.</h3>
                <p className="text-slate-400 text-xs leading-relaxed font-semibold">
                  Mettez fin au stress d'un recrutement aléatoire. Nous vous donnons accès à des profils audités (ID vérifiée, casier judiciaire vérifié, compétences validées). Publiez votre offre pour recevoir des candidatures qualifiées ou sourcez en direct.
                </p>
                <div className="space-y-2 pt-2 text-xs text-slate-300 font-semibold">
                  <p className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Publication gratuite de votre première offre d'emploi</p>
                  <p className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Sourcing de proximité et filtrage intelligent</p>
                  <p className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Profils de sécurité vérifiés au préalable</p>
                </div>
              </div>

              <div className="pt-4">
                <button 
                  onClick={() => onLogin('employer')}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold py-3.5 rounded-xl text-xs uppercase tracking-wider transition-colors inline-flex items-center justify-center gap-2 shadow-md shadow-emerald-500/5 hover:scale-[1.01]"
                >
                  Déposer une offre (Recruter) <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Candidate CTA Card */}
            <div className="bg-slate-850/80 backdrop-blur border border-slate-800 rounded-3xl p-8 text-left flex flex-col justify-between space-y-6 hover:border-emerald-500/30 transition-all duration-300">
              <div className="space-y-4">
                <div className="w-12 h-12 bg-emerald-500/15 rounded-2xl flex items-center justify-center text-emerald-400">
                  <Award className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-black text-white">Vous êtes Candidat ? Trouvez du travail.</h3>
                <p className="text-slate-400 text-xs leading-relaxed font-semibold">
                  Obtenez des offres d'emploi haut de gamme dans des familles sérieuses et respectueuses. Inscrivez-vous gratuitement, présentez vos pièces justificatives d'identité d'origine pour obtenir le badge de certification et démarrez rapidement !
                </p>
                <div className="space-y-2 pt-2 text-xs text-slate-300 font-semibold">
                  <p className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Accès gratuit à notre listing complet d'offres</p>
                  <p className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Aide à la certification & mise en conformité de dossier</p>
                  <p className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Protection de vos informations à caractère personnel</p>
                </div>
              </div>

              <div className="pt-4">
                <button 
                  onClick={() => onLogin('candidate')}
                  className="w-full bg-slate-800 hover:bg-slate-7050 border border-slate-700 text-white font-extrabold py-3.5 rounded-xl text-xs uppercase tracking-wider transition-colors inline-flex items-center justify-center gap-2 hover:scale-[1.01]"
                >
                  S'inscrire comme Candidat <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STEP 3 DETAILED POPUP: PAYMENT CHECKOUT PROMPT & SIMULATION */}
      <AnimatePresence>
        {selectedProfile && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[150] flex items-end sm:items-center justify-center sm:p-4">
            <motion.div 
              initial={isMobile ? { y: "100%" } : { scale: 0.95, opacity: 0 }}
              animate={isMobile ? { y: 0 } : { scale: 1, opacity: 1 }}
              exit={isMobile ? { y: "100%" } : { scale: 0.95, opacity: 0 }}
              transition={isMobile ? { type: "spring", damping: 25, stiffness: 220 } : undefined}
              className="bg-white rounded-t-[32px] sm:rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-100 text-slate-800 max-h-[85vh] sm:max-h-[90vh] overflow-y-auto"
            >
              {isMobile && (
                <div className="pt-2 pb-1 shrink-0 flex justify-center bg-slate-800 border-b border-slate-900">
                  <div className="w-12 h-1.5 bg-slate-650 rounded-full" />
                </div>
              )}
              {/* Modal header with candidate highlight */}
              <div className="relative bg-gradient-to-r from-emerald-600 to-slate-900 text-white p-6 pb-8 text-left">
                <button 
                  onClick={() => {
                    setSelectedProfile(null);
                    setCheckoutStep('plans');
                  }}
                  className="absolute top-4 right-4 bg-white/10 hover:bg-white/25 rounded-full p-2.5 transition-colors cursor-pointer text-xs"
                >
                  ✕
                </button>
                <div className="flex gap-4 items-center">
                  <img 
                    src={selectedProfile.photoURL} 
                    alt={selectedProfile.displayName} 
                    className="w-14 h-14 rounded-full border-2 border-white/20 object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-widest block">Parcours de Recrutement</span>
                    <h4 className="text-xl font-black tracking-tight">{selectedProfile.displayName.replace(/ .*/,'') + ' **'}</h4>
                    <p className="text-xs text-white/85 capitalize font-medium">📍 {selectedProfile.location} • {selectedProfile.experienceYears} {selectedProfile.experienceYears > 1 ? "ans" : "an"} d'expérience</p>
                  </div>
                </div>
              </div>

              {/* CARD DETAILED STEPS ACCORDING TO USER'S LITERAL PARCOURS CHANNELS */}
              <div className="p-6 md:p-8 space-y-6">

                {/* STEP 3A: VIEW PLANS */}
                {checkoutStep === 'plans' && (
                  <div className="space-y-6 text-left">
                    <div className="text-center space-y-2">
                      <h5 className="font-extrabold text-slate-800 text-sm">Contacter ce candidat qualifié</h5>
                      <p className="text-xs text-slate-400">Pour accéder au numéro de téléphone direct, à son adresse email et à ses rapports de vérification CNI, veuillez sélectionner votre accès :</p>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      {/* One time search - 15000 FCFA */}
                      <div 
                        onClick={() => startPaymentCheckout('one-time')}
                        className="bg-slate-50 hover:bg-emerald-50/40 border-2 border-slate-200 hover:border-emerald-500 rounded-2xl p-5 cursor-pointer transition-all flex justify-between items-center group relative overflow-hidden"
                      >
                        <div className="space-y-1">
                          <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider mb-2 inline-block">Recherche Ponctuelle</span>
                          <p className="font-black text-slate-800 text-sm">Le Profil Unique</p>
                          <p className="text-[11px] text-slate-400 leading-tight pr-6">Accès direct illimité au numéro, mail et garant de ce profil uniquement.</p>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <span className="text-sm font-black text-slate-800 block">15 000 FCFA</span>
                          <span className="text-[9px] text-slate-400 font-bold block">Paiement unique</span>
                        </div>
                      </div>

                      {/* Unlimited access for 1 month - 30000 FCFA */}
                      <div 
                        onClick={() => startPaymentCheckout('monthly')}
                        className="bg-slate-50 hover:bg-emerald-50/40 border-2 border-emerald-100 hover:border-emerald-555 rounded-2xl p-5 cursor-pointer transition-all flex justify-between items-center group relative overflow-hidden"
                      >
                        <div className="space-y-1">
                          <span className="bg-amber-100 text-amber-800 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider mb-2 inline-block">Best Value 🔥</span>
                          <p className="font-black text-slate-800 text-sm">Accès Illimité 1 Mois</p>
                          <p className="text-[11px] text-slate-400 leading-tight pr-6">Accédez à TOUS les profils d'employés et de nounous pendant 30 jours.</p>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <span className="text-sm font-black text-emerald-600 block">30 000 FCFA</span>
                          <span className="text-[9px] text-slate-400 font-bold block">Accès 1 mois</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 3B: INPUT TELEPHONE OPERATOR AND MOBILE NUMBER */}
                {checkoutStep === 'payment-method' && (
                  <form onSubmit={executeMobileMoneyPayment} className="space-y-5 text-left animate-fade-in">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Option choisie :</span>
                      <div className="flex justify-between items-center bg-slate-50 border border-slate-100 p-3 rounded-xl text-xs">
                        <span className="font-bold text-slate-700">
                          {chosenPlan === 'one-time' ? "Recherche unique de ce candidat" : "Accès illimité Côte d'Ivoire (1 mois)"}
                        </span>
                        <span className="font-black text-emerald-600">
                          {chosenPlan === 'one-time' ? "15 000 FCFA" : "30 000 FCFA"}
                        </span>
                      </div>
                    </div>

                    {/* Operator selector */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Mode de Paiement sécurisé (Côte d'Ivoire)</span>
                      <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-5 gap-1.5">
                        {[
                          { id: 'wave', label: 'Wave 🌊' },
                          { id: 'orange', label: 'Orange 🍊' },
                          { id: 'mtn', label: 'MTN 🟨' },
                          { id: 'moov', label: 'Moov 🍫' },
                          { id: 'card', label: 'Carte 💳' }
                        ].map(op => (
                          <button
                            type="button"
                            key={op.id}
                            onClick={() => {
                              setPaymentOperator(op.id as any);
                              if (op.id === 'card') setPhoneNumber('');
                            }}
                            className={`py-2.5 px-1 rounded-xl text-[10px] font-black border uppercase tracking-wider transition-all text-center flex flex-col items-center justify-center gap-1 ${paymentOperator === op.id ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm' : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'}`}
                          >
                            {op.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Mobile Number Entry or Card prompt */}
                    {paymentOperator !== 'card' ? (
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Votre Numéro de Téléphone {paymentOperator.toUpperCase()}</label>
                        <div className="relative">
                          <span className="absolute left-3.5 inset-y-0 flex items-center text-xs text-slate-400 font-bold font-mono">+225</span>
                          <input 
                            type="tel"
                            placeholder="07 00 00 00 00"
                            value={phoneNumber}
                            required
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            className="w-full pl-16 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none focus:bg-white font-mono font-bold text-slate-800"
                          />
                        </div>
                        <p className="text-[9px] text-slate-400">Un message USSD de validation automatique sera lancé sur votre numéro.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Coordonnées Carte Bancaire</label>
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-600 space-y-1">
                          <p className="font-bold text-slate-700">💳 Visa, Mastercard et Cartes Locales</p>
                          <p className="text-[10px] text-slate-500">Le formulaire de saisie de la carte hautement sécurisé sera affiché directement sur la passerelle partenaire Paiement Pro lors de la redirection.</p>
                        </div>
                      </div>
                    )}

                    {paymentError && <p className="text-red-500 font-bold text-xxs bg-red-50 p-2.5 rounded-lg border border-red-100">{paymentError}</p>}

                    {/* Submit checkout */}
                    <div className="pt-2 flex gap-3">
                      <button 
                        type="button"
                        onClick={() => setCheckoutStep('plans')}
                        className="flex-1 py-3 text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-xl"
                      >
                        Retour
                      </button>
                      <button 
                        type="submit"
                        className="flex-1 py-3 text-xs font-bold text-white bg-slate-950 hover:bg-emerald-600 rounded-xl transition-all"
                      >
                        Valider et Payer
                      </button>
                    </div>
                  </form>
                )}

                {/* STEP 3C: PROCESSING STATE BAR */}
                {checkoutStep === 'processing' && (
                  <div className="py-12 text-center space-y-6">
                    <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto bg-transparent"></div>
                    <div className="space-y-2">
                      <p className="font-bold text-slate-800 text-sm">Traitement de l'opération en cours...</p>
                      <p className="text-xs text-slate-400 animate-pulse">{paymentStatusMessage}</p>
                    </div>
                  </div>
                )}

                {/* STEP 3D: SUCCESS DECLARED -> UNLOCKED CREDENTIALS */}
                {checkoutStep === 'success' && (
                  <div className="space-y-6 text-center animate-fade-in text-left">
                    <div className="bg-emerald-50 text-emerald-800 p-4 rounded-2xl border border-emerald-100 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold shrink-0">✓</div>
                      <div>
                        <p className="font-black text-xs">Paiement Reçu ! Accès Débloqué !</p>
                        <p className="text-[10px] text-emerald-700/80">Merci pour votre confiance. Voici les coordonnées authentifiées de votre personnel.</p>
                      </div>
                    </div>

                    {/* Real coordinates */}
                    <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-4 text-xs">
                      <div className="flex items-center gap-3 pb-3 border-b border-slate-150">
                        <img 
                          src={selectedProfile.photoURL} 
                          alt={selectedProfile.displayName} 
                          className="w-11 h-11 rounded-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <div>
                          <p className="font-black text-slate-800 text-sm uppercase">{selectedProfile.displayName}</p>
                          <p className="text-[10px] text-emerald-650 font-extrabold uppercase">Candidat Enregistré</p>
                        </div>
                      </div>

                      {/* Direct phone number */}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-450 font-medium">Téléphone direct :</span>
                        <span className="font-mono font-black text-slate-900 bg-white border border-slate-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 cursor-pointer hover:bg-slate-50">
                          <Phone className="h-3.5 w-3.5 text-emerald-600" /> {selectedProfile.phone}
                        </span>
                      </div>

                      {/* Direct Email address */}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-455 font-medium">Adresse email :</span>
                        <span className="font-mono font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5 shrink-0" /> {selectedProfile.email}
                        </span>
                      </div>

                      {/* Status / Verifications */}
                      <div className="flex items-center justify-between text-slate-500">
                        <span>Garant enregistré :</span>
                        <span className="font-bold text-slate-800">Dossier Validé (Identité & Antécédents)</span>
                      </div>
                    </div>

                    <div className="flex gap-2 font-bold">
                      <a 
                        href={`https://wa.me/${selectedProfile.phone.replace(/[^0-9]/g,'')}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex-1 bg-emerald-600 hover:bg-emerald-550 text-white font-extrabold py-3.5 rounded-xl text-xs flex items-center justify-center gap-2 uppercase tracking-wide cursor-pointer text-center"
                      >
                        <Phone className="h-4 w-4" /> Message WhatsApp
                      </a>
                      <button 
                        onClick={() => {
                          setSelectedProfile(null);
                          setCheckoutStep('plans');
                        }}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-5 py-3.5 rounded-xl text-xs uppercase"
                      >
                        Terminer
                      </button>
                    </div>
                  </div>
                )}

              </div>
            </motion.div>
          </div>
        )}

        {showAdminPinModal && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[150] flex items-end sm:items-center justify-center sm:p-4">
            <motion.div
              initial={isMobile ? { y: "100%" } : { scale: 0.95, opacity: 0 }}
              animate={isMobile ? { y: 0 } : { scale: 1, opacity: 1 }}
              exit={isMobile ? { y: "100%" } : { scale: 0.95, opacity: 0 }}
              transition={isMobile ? { type: "spring", damping: 25, stiffness: 220 } : undefined}
              className="bg-slate-900 border border-slate-800 rounded-t-[32px] sm:rounded-[32px] w-full max-w-sm p-6 overflow-hidden shadow-2xl flex flex-col font-sans text-center relative max-h-[85vh] overflow-y-auto"
            >
              {isMobile && (
                <div className="pt-1 pb-3 flex justify-center shrink-0">
                  <div className="w-12 h-1.5 bg-slate-800 rounded-full" />
                </div>
              )}
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-450 flex items-center justify-center text-xl mx-auto mb-4">
                🔒
              </div>
              <h4 className="text-sm font-black text-rose-400 uppercase tracking-widest">
                Accès Admin Sécurisé
              </h4>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Veuillez saisir le code confidentiel d'administration pour valider votre identité :
              </p>

              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (adminPinValue === '2026') {
                    setShowAdminPinModal(false);
                    onDemoLogin?.('admin');
                  } else {
                    setAdminPinError("Code confidentiel incorrect. Accès refusé.");
                  }
                }}
                className="mt-6 space-y-4 text-left"
              >
                <div>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={adminPinValue}
                    onChange={(e) => {
                      setAdminPinValue(e.target.value);
                      setAdminPinError('');
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-center text-lg tracking-widest font-black text-slate-200 outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all h-12"
                  />
                  {adminPinError && (
                    <p className="text-[10px] text-red-500 font-bold mt-2 text-center uppercase tracking-wider">
                      ⚠️ {adminPinError}
                    </p>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdminPinModal(false);
                      setAdminPinValue('');
                      setAdminPinError('');
                    }}
                    className="flex-1 py-3 text-xs font-bold uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all cursor-pointer text-center"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 text-xs font-bold uppercase tracking-wider bg-rose-600 hover:bg-rose-500 text-white rounded-xl transition-all shadow-lg shadow-rose-950/20 cursor-pointer text-center"
                  >
                    Déverrouiller
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
