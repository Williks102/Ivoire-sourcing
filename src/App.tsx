import React, { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  setDoc, 
  doc, 
  getDoc,
  addDoc
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  PlusCircle, 
  LogOut, 
  Menu, 
  X, 
  AlertCircle,
  Search as SearchIcon,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Calendar,
  MapPin,
  Briefcase,
  FileCheck
} from 'lucide-react';
import { auth, db, googleProvider, rawConfig, isFirebaseAvailableByConfig, disableFirebase } from './lib/firebase';
import { UserProfile, JobPost, UserRole } from './types';
import { LandingView } from './components/LandingView';
import { JobListView, JobDetailView } from './components/JobListView';
import { PostJobView } from './components/PostJobView';
import { DashboardView } from './components/DashboardView';
import { ApplicationSuccessView } from './components/ApplicationSuccessView';
import { ApplicationFormModal } from './components/ApplicationFormModal';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [view, setView] = useState<'landing' | 'jobs' | 'dashboard' | 'post-job'>('landing');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobPost | null>(null);
  const [dashboardTab, setDashboardTab] = useState<'overview' | 'verification' | 'my-jobs' | 'applications' | 'admin' | 'browse-candidates' | 'profile'>('overview');
  
  // Real-time toast notifications state
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'info' | 'error' }[]>([]);

  // Toast creation helper
  const addToast = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    const id = Math.random().toString(36).substring(7);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 6000);
  };

  // Register Toast trigger Globally
  useEffect(() => {
    (window as any).addToast = addToast;
  }, []);

  // Sockets Listener Setup
  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimer: any;

    function connect() {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('[WS CLIENT] WebSocket connection successfully authorized.');
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'action_validated') {
              if (data.action === 'job_moderation_approved') {
                addToast(`⚡ Annonce validée : "${data.payload.title}" est maintenant en ligne !`, 'success');
                fetchJobs();
              } else if (data.action === 'job_moderation_rejected') {
                addToast(`⚠️ Annonce refusée par l'administrateur : ${data.payload.reason}`, 'error');
              } else if (data.action === 'premium_payment_success') {
                addToast(`💳 Boost Premium activé pour le recruteur !`, 'success');
              } else if (data.action === 'certificate_approved') {
                addToast(`🏆 Nouveau document de certification validé par l'admin !`, 'success');
              } else if (data.action === 'candidate_certified') {
                addToast(`🌟 Le profil candidat est maintenant certifié !`, 'success');
              } else if (data.action === 'dashboard_action') {
                addToast(`⚡ Action approuvée : ${data.payload.name}`, 'success');
                fetchJobs();
              }
              
              // Trigger a global custom event to allow nested views to react or sync lists
              window.dispatchEvent(new CustomEvent('ws-action-validated', { detail: data }));
            }
          } catch (err) {
            console.error('[WS CLIENT] Parse Error:', err);
          }
        };

        ws.onclose = () => {
          console.log('[WS CLIENT] Disconnected, reconnecting in 5s...');
          reconnectTimer = setTimeout(connect, 5000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (err) {
        console.error('[WS CLIENT] Connection failed:', err);
      }
    }

    connect();

    // Attach static trigger for anywhere in the application
    (window as any).triggerSocketAction = (action: string, payload: any) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'action_validated',
          action,
          payload
        }));
      }
    };

    return () => {
      if (ws) ws.close();
      clearTimeout(reconnectTimer);
    };
  }, []);

  // States for application confirmation
  const [showApplySuccess, setShowApplySuccess] = useState(false);
  const [successJob, setSuccessJob] = useState<JobPost | null>(null);
  const [applyingJob, setApplyingJob] = useState<JobPost | null>(null);
  const [authError, setAuthError] = useState<{ code: string; message: string } | null>(null);
  const [attemptedRole, setAttemptedRole] = useState<UserRole>('candidate');

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 8000);

    // Auto-login of saved demo/bypass connections for smooth offline testing
    const savedDemoUser = localStorage.getItem('demo_user');
    const savedDemoProfile = localStorage.getItem('demo_profile');
    if (savedDemoUser && savedDemoProfile) {
      setUser(JSON.parse(savedDemoUser));
      setProfile(JSON.parse(savedDemoProfile));
      setLoading(false);
      clearTimeout(timer);
      fetchJobs().catch(() => {});
      return;
    }

    // Proactive check: if Firebase config is blank/missing (as on Vercel before env setup), we run in quiet offline demo mode rather than crashing
    if (!isFirebaseAvailableByConfig || !rawConfig || !rawConfig.apiKey || rawConfig.apiKey === '') {
      console.warn("[FIREBASE] Unconfigured or missing keys. Running in local simulation mode.");
      setLoading(false);
      clearTimeout(timer);
      fetchJobs().catch(() => {});
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      try {
        if (u) {
          const docRef = doc(db, 'users', u.uid);
          let profileData: UserProfile | null = null;
          try {
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              profileData = docSnap.data() as UserProfile;
              localStorage.setItem(`profile_${u.uid}`, JSON.stringify(profileData));
            }
          } catch (getDocErr: any) {
            console.warn("[FIREBASE] getDoc failed or client offline. Proceeding to local storage fallback:", getDocErr);
            const cached = localStorage.getItem(`profile_${u.uid}`);
            if (cached) {
              profileData = JSON.parse(cached);
            } else {
              // Graceful real-time fallback profile
              profileData = {
                uid: u.uid,
                role: 'candidate',
                displayName: u.displayName || 'Utilisateur Source',
                email: u.email || '',
                photoURL: u.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop',
                skills: [],
                isVerified: false,
                isPremium: false,
                averageRating: 0,
                reviewCount: 0,
                createdAt: new Date().toISOString()
              };
            }
            setIsOffline(true);
          }
          if (profileData) {
            setProfile(profileData);
          }
        } else {
          setProfile(null);
        }
      } catch (err) {
        console.error("Auth init/Profile fetch error:", err);
        setIsOffline(true);
      } finally {
        setLoading(false);
        clearTimeout(timer);
      }
    }, (err: any) => {
      console.error("[FIREBASE] Initial auth state error callback triggered:", err);
      const isApiKeyErr = err.code === 'auth/api-key-not-valid' || 
                          err.code === 'auth/invalid-api-key' ||
                          (err.message && (
                            err.message.toLowerCase().includes('api-key-not-valid') || 
                            err.message.toLowerCase().includes('invalid-api-key') || 
                            err.message.toLowerCase().includes('api key')
                          ));
      if (isApiKeyErr) {
        console.warn("[FIREBASE] Invalid API Key detected on startup. Dynamic fallback to local simulation mode activated.");
        disableFirebase();
        addToast("⚠️ Clé API Firebase non valide configurée. Utilisation automatique du mode Simulation.", "info");
      }
      setLoading(false);
      clearTimeout(timer);
    });
    return () => {
      if (unsubscribe) unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!loading && !user && (view === 'dashboard' || view === 'post-job')) {
      setView('landing');
    }
  }, [user, view, loading]);

  useEffect(() => {
    fetchJobs();
  }, [selectedCategory, selectedCity, view]);

  const fetchJobs = async () => {
    try {
      if (!isFirebaseAvailableByConfig) {
        throw new Error("Local Demo Mode Active");
      }
      let q = query(collection(db, 'jobs'), where('status', '==', 'approved'));
      
      if (selectedCategory) {
        q = query(collection(db, 'jobs'), where('status', '==', 'approved'), where('category', '==', selectedCategory));
      }
      
      const snap = await getDocs(q);
      const fetchedJobs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as JobPost));
      
      fetchedJobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      if (selectedCity) {
        setJobs(fetchedJobs.filter(j => j.location === selectedCity));
      } else {
        setJobs(fetchedJobs);
      }
      setIsOffline(false);
    } catch (err: any) {
      console.warn("Running in local simulation mode for jobs list:", err);
      let allLocalJobs: JobPost[] = [];
      const localJobsStr = localStorage.getItem('offline_jobs');
      
      if (localJobsStr) {
        allLocalJobs = JSON.parse(localJobsStr);
      } else {
        const demoJobs: JobPost[] = [
          {
            id: 'demo-0',
            employerId: 'system',
            title: 'Nounou Plein Temps (Cocody)',
            description: 'Recherche nounou expérimentée pour garde de deux jumeaux de 2 ans. Logée ou non-logée. Références exigées.',
            category: 'nounou',
            location: 'Abidjan',
            salaryRange: '120 000 FCFA',
            status: 'approved',
            isPremium: true,
            createdAt: new Date().toISOString()
          },
          {
             id: 'demo-1',
             employerId: 'system',
             title: 'Chauffeur Professionnel VTC',
             description: 'Besoin d un chauffeur maitrisant la zone de Marcory et Plateau. Conduite défensive exigée.',
             category: 'chauffeur',
             location: 'Abidjan',
             salaryRange: '150 000 FCFA',
             status: 'approved',
             isPremium: false,
             createdAt: new Date().toISOString()
          }
        ];
        allLocalJobs = demoJobs;
        localStorage.setItem('offline_jobs', JSON.stringify(demoJobs));
      }

      // Filter local simulation jobs by category and city to match firebase logic
      let filtered = [...allLocalJobs];
      if (selectedCategory) {
        filtered = filtered.filter(j => j.category === selectedCategory);
      }
      if (selectedCity) {
        filtered = filtered.filter(j => j.location === selectedCity);
      }

      // Sort by newest created
      filtered.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setJobs(filtered);
      setIsOffline(true);
    }
  };

  const handleDemoLogin = (role: UserRole) => {
    const mockUid = 'demo-' + role + '-uid-' + Math.random().toString(36).substring(7);
    const mockUser = {
      uid: mockUid,
      displayName: role === 'candidate' ? 'Marie Kouassi' : role === 'employer' ? 'Société Sourcing CI' : 'Administrateur Sourcing',
      email: `${role}@ivoiresource.ci`,
      photoURL: role === 'candidate' 
        ? 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=200&auto=format&fit=crop'
        : 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=200&auto=format&fit=crop'
    };

    const mockProfile: UserProfile = {
      uid: mockUid,
      role,
      displayName: mockUser.displayName,
      email: mockUser.email,
      photoURL: mockUser.photoURL,
      skills: role === 'candidate' ? ["Garde d'enfants", "Ménage", "Cuisine africaine"] : [],
      isVerified: role === 'candidate', // candidate pre-certified for easy simulator use
      isPremium: role === 'employer',
      averageRating: role === 'candidate' ? 4.9 : 0,
      reviewCount: role === 'candidate' ? 3 : 0,
      createdAt: new Date().toISOString()
    };

    localStorage.setItem('demo_user', JSON.stringify(mockUser));
    localStorage.setItem('demo_profile', JSON.stringify(mockProfile));

    setUser(mockUser as any);
    setProfile(mockProfile);
    setAuthError(null);
    setView('dashboard');
    addToast(`🚀 Connexion de simulation réussie en tant que ${role === 'employer' ? 'Recruteur' : role === 'admin' ? 'Administrateur' : 'Candidat'} !`, 'success');
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem('demo_user');
      localStorage.removeItem('demo_profile');
      if (isFirebaseAvailableByConfig) {
        await signOut(auth);
      }
    } catch (err) {
      console.error("Logout error:", err);
    }
    setUser(null);
    setProfile(null);
    setView('landing');
    addToast('🚪 Vous avez été déconnecté.', 'info');
  };

  const handleLogin = async (role: UserRole) => {
    setAttemptedRole(role);
    if (!isFirebaseAvailableByConfig || !rawConfig || !rawConfig.apiKey || rawConfig.apiKey === '') {
      // Automatic safety redirect to Demo Login if Firebase is empty/fails
      handleDemoLogin(role);
      return;
    }

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const u = result.user;
      
      const docRef = doc(db, 'users', u.uid);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        const newProfile: UserProfile = {
          uid: u.uid,
          role,
          displayName: u.displayName || 'Utilisateur',
          email: u.email || '',
          photoURL: u.photoURL || '',
          skills: [],
          isVerified: false,
          isPremium: false,
          averageRating: 0,
          reviewCount: 0,
          createdAt: new Date().toISOString()
        };
        await setDoc(docRef, newProfile);
        setProfile(newProfile);
      } else {
        const existingProfile = docSnap.data() as UserProfile;
        if (existingProfile.role !== role) {
          const updatedProfile = { ...existingProfile, role: role };
          await setDoc(docRef, updatedProfile);
          setProfile(updatedProfile);
        } else {
          setProfile(existingProfile);
        }
      }
      setView('dashboard');
    } catch (err: any) {
      const isApiKeyErr = err.code === 'auth/api-key-not-valid' || 
                          err.code === 'auth/invalid-api-key' ||
                          (err.message && (
                            err.message.toLowerCase().includes('api-key-not-valid') || 
                            err.message.toLowerCase().includes('invalid-api-key') || 
                            err.message.toLowerCase().includes('api key')
                          ));

      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        console.log("Connexion annulée ou demande popup de connexion interrompue :", err);
        addToast("Connexion annulée ou fermée par l'utilisateur.", 'info');
      } else if (err.code === 'auth/popup-blocked') {
        console.warn("Le popup de connexion a été bloqué par le navigateur :", err);
        addToast("Le popup de connexion a été bloqué par votre navigateur. Veuillez autoriser les fenêtres contextuelles ou utiliser les accès rapides de test.", 'error');
      } else if (isApiKeyErr) {
        console.warn("Clé API Firebase invalide détectée. Redirection vers le mode Démo d'évaluation.");
        addToast("⚠️ Clé API Firebase non valide ou incomplète. Bascule automatique sur le mode Démo / Simulation.", "info");
        handleDemoLogin(role);
      } else {
        console.error("Erreur de connexion:", err);
        setAuthError({
          code: err.code || 'unknown',
          message: err.message || JSON.stringify(err)
        });
      }
    }
  };

  const seedData = async () => {
    if (jobs.length > 0) return;
    const demoJobs: Omit<JobPost, 'id'>[] = [
      {
        employerId: 'system',
        title: 'Nounou Plein Temps (Cocody)',
        description: 'Recherche nounou expérimentée pour garde de deux jumeaux de 2 ans. Logée ou non-logée. Références exigées.',
        category: 'nounou',
        location: 'Abidjan',
        salaryRange: '120 000',
        status: 'approved',
        isPremium: true,
        createdAt: new Date().toISOString()
      },
      {
         employerId: 'system',
         title: 'Chauffeur Professionnel VTC',
         description: 'Besoin d un chauffeur maitrisant la zone de Marcory et Plateau. Conduite défensive exigée.',
         category: 'chauffeur',
         location: 'Abidjan',
         salaryRange: '150 000',
         status: 'approved',
         isPremium: false,
         createdAt: new Date().toISOString()
      }
    ];
    
    if (!user) {
      setJobs(demoJobs.map((j, i) => ({ id: `demo-${i}`, ...j } as JobPost)));
      return;
    }

    try {
      for (const job of demoJobs) {
        await addDoc(collection(db, 'jobs'), job);
      }
      await fetchJobs();
    } catch (err) {
      console.error("Seeding failed (permissions?), showing local data:", err);
      setJobs(demoJobs.map((j, i) => ({ id: `demo-${i}`, ...j } as JobPost)));
    }
  };

  const handleApply = async (jobId: string, employerId: string) => {
    if (!user) {
      handleLogin('candidate');
      return;
    }
    if (profile?.role !== 'candidate') {
      alert("Seuls les candidats peuvent postuler aux offres.");
      return;
    }
    const targetJob = jobs.find(j => j.id === jobId) || selectedJob;
    if (targetJob) {
      setApplyingJob(targetJob);
    }
  };

  const submitApplication = async (data: {
    candidateName: string;
    photoURL: string;
    experienceYears: number;
    phone: string;
    cvName?: string;
    cvUrl?: string;
    message: string;
  }) => {
    if (!user || !applyingJob) return;
    try {
      await addDoc(collection(db, 'applications'), {
        jobId: applyingJob.id,
        employerId: applyingJob.employerId,
        candidateId: user.uid,
        status: 'pending',
        message: data.message,
        candidateName: data.candidateName,
        photoURL: data.photoURL,
        experienceYears: Number(data.experienceYears),
        cvName: data.cvName || '',
        cvUrl: data.cvUrl || '',
        createdAt: new Date().toISOString()
      });

      // Sync user profile in real-time
      if (profile) {
        const updatedProfile = {
          ...profile,
          displayName: data.candidateName,
          photoURL: data.photoURL,
          phone: data.phone,
          ...(data.cvName ? { cvName: data.cvName, cvUrl: data.cvUrl } : {})
        };
        await setDoc(doc(db, 'users', user.uid), updatedProfile);
        setProfile(updatedProfile);
      }

      setSuccessJob(applyingJob);
      setApplyingJob(null);
      setShowApplySuccess(true);
    } catch (err) {
      console.error("Submitting application failed:", err);
    }
  };

  if (loading) return (
    <div className="h-screen w-full flex items-center justify-center bg-slate-50">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-emerald-600"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      {/* Offline Banner */}
      {isOffline && (
        <div className="bg-amber-500 text-white px-4 py-2 text-center text-xs font-bold flex items-center justify-center gap-2">
          <AlertCircle className="h-4 w-4" />
          Note: Connexion à la base de données limitée. Certaines fonctions peuvent ne pas fonctionner.
          <button onClick={() => fetchJobs()} className="underline ml-2">Réessayer</button>
        </div>
      )}
      {/* Navigation */}
      {view !== 'dashboard' && (
        <nav className="sticky top-0 z-50 bg-white border-b border-slate-200 px-4 md:px-8 flex items-center justify-between h-16 shrink-0">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setView('landing'); setIsMenuOpen(false); }}>
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">I</div>
            <span className="text-xl font-bold tracking-tight text-slate-800">Ivoire<span className="text-emerald-600">Source</span></span>
          </div>
          
          <div className="hidden md:flex flex-1 max-w-xl px-12">
            <div className="relative flex items-center bg-slate-100 rounded-full px-4 py-1.5 border border-transparent focus-within:border-emerald-500 focus-within:bg-white transition-all w-full">
              <SearchIcon className="w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Rechercher un service..." 
                className="bg-transparent border-none focus:ring-0 text-sm w-full px-2 outline-none" 
              />
            </div>
          </div>

          <div className="hidden md:flex items-center gap-6">
            <button onClick={() => setView('jobs')} className="text-slate-600 text-sm font-medium hover:text-emerald-600 transition-colors">Offres</button>
            {user && (
              <button onClick={() => setView('dashboard')} className="text-slate-600 text-sm font-medium hover:text-emerald-600 transition-colors">Tableau de bord</button>
            )}
            {profile?.role === 'employer' && (
              <button onClick={() => setView('post-job')} className="text-slate-900 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-all">Publier une offre</button>
            )}
            
            {user ? (
              <div className="flex items-center gap-4">
                {profile?.role === 'admin' && (
                  <span className="text-[10px] font-extrabold text-[#e11d48] border border-rose-300 bg-rose-50 px-2 py-0.5 rounded-full uppercase tracking-wider">ADMIN</span>
                )}
                <button onClick={() => setView('dashboard')} className="w-10 h-10 bg-slate-200 rounded-full border-2 border-white shadow-sm overflow-hidden">
                  <img src={profile?.photoURL || 'https://via.placeholder.com/40'} alt="Profile" className="w-full h-full object-cover" />
                </button>
                <button onClick={handleLogout} className="text-slate-400 hover:text-red-600 transition-colors">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <button onClick={() => handleLogin('admin')} className="text-rose-500 text-xs font-bold hover:text-rose-600 transition-colors border border-rose-100 bg-rose-50/40 px-3 py-1.5 rounded-xl uppercase tracking-wider">Admin</button>
                <button onClick={() => handleLogin('candidate')} className="text-slate-600 text-sm font-medium hover:text-emerald-600">Postuler</button>
                <button onClick={() => handleLogin('employer')} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-800 transition-all shadow-md">Recruter</button>
              </div>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="md:hidden p-2 text-slate-600">
            {isMenuOpen ? <X /> : <Menu />}
          </button>
        </nav>
      )}

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed inset-0 top-16 z-40 bg-white md:hidden p-6 flex flex-col gap-6"
          >
            <button onClick={() => { setView('jobs'); setIsMenuOpen(false); }} className="text-left text-lg font-bold text-slate-800 border-b border-slate-50 pb-4">Trouver des offres</button>
            {profile?.role === 'employer' && (
               <button onClick={() => { setView('post-job'); setIsMenuOpen(false); }} className="text-left text-lg font-bold text-slate-800 border-b border-slate-50 pb-4">Publier une annonce</button>
            )}
            {profile?.role === 'admin' && (
               <button onClick={() => { setView('dashboard'); setDashboardTab('admin'); setIsMenuOpen(false); }} className="text-left text-lg font-bold text-emerald-600 border-b border-slate-50 pb-4">Panel Admin</button>
            )}
            {user ? (
              <div className="flex flex-col gap-4">
                <button onClick={() => { setView('dashboard'); setIsMenuOpen(false); }} className="text-left text-lg font-bold text-slate-800 border-b border-slate-50 pb-4">Tableau de bord</button>
                <button onClick={() => { handleLogout(); setIsMenuOpen(false); }} className="text-left text-lg font-bold text-red-600">Déconnexion</button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <button onClick={() => { handleLogin('candidate'); setIsMenuOpen(false); }} className="w-full py-4 text-center font-bold text-slate-700 bg-slate-100 rounded-xl">Je cherche un job</button>
                <button onClick={() => { handleLogin('employer'); setIsMenuOpen(false); }} className="w-full py-4 text-center font-bold text-white bg-slate-900 rounded-xl">Je recrute</button>
                <button onClick={() => { handleLogin('admin'); setIsMenuOpen(false); }} className="w-full py-3 text-center text-xs font-bold text-rose-500 bg-rose-50 border border-rose-100 rounded-xl">Accès Admin</button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">
          {view === 'landing' && (
            <LandingView 
              onSearch={(category) => {
                if (category) {
                  setSelectedCategory(category);
                } else {
                  setSelectedCategory('');
                }
                setView('jobs');
              }}
              jobs={jobs}
              onSelectJob={(job) => {
                setSelectedJob(job);
                setView('jobs');
              }}
              onViewAllJobs={() => {
                setSelectedCategory('');
                setView('jobs');
              }}
              onLogin={handleLogin}
              onDemoLogin={handleDemoLogin}
              user={user}
              profile={profile}
            />
          )}
          {view === 'jobs' && (
            <div className="flex-1 flex overflow-hidden relative w-full">
              <JobListView 
                jobs={jobs} 
                selectedCategory={selectedCategory} 
                setSelectedCategory={setSelectedCategory}
                selectedCity={selectedCity}
                setSelectedCity={setSelectedCity}
                onApply={handleApply}
                canApply={profile?.role === 'candidate'}
                onPostJob={() => setView('post-job')}
                isEmployer={profile?.role === 'employer' || profile?.role === 'admin'}
                onSeed={seedData}
                onSelectJob={setSelectedJob}
              />
              
              <AnimatePresence>
                {selectedJob && (
                  <JobDetailView 
                    job={selectedJob} 
                    onClose={() => setSelectedJob(null)} 
                    onApply={() => {
                      if (profile?.role === 'candidate' && user) {
                        handleApply(selectedJob.id, selectedJob.employerId);
                        setSelectedJob(null);
                      } else {
                        handleLogin('candidate');
                      }
                    }}
                    canApply={profile?.role === 'candidate'}
                  />
                )}
              </AnimatePresence>
            </div>
          )}
          {view === 'post-job' && profile && <PostJobView onPosted={() => { setView('jobs'); fetchJobs(); }} profile={profile} />}
          {view === 'dashboard' && user && (
            <DashboardView 
              profile={profile} 
              user={user} 
              activeTab={dashboardTab} 
              setActiveTab={setDashboardTab} 
              onProfileUpdate={(p) => setProfile(p)}
              setView={setView}
            />
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {applyingJob && (
          <ApplicationFormModal 
            job={applyingJob}
            profile={profile}
            onClose={() => setApplyingJob(null)}
            onSubmit={submitApplication}
          />
        )}
        
        {showApplySuccess && (
          <ApplicationSuccessView 
            job={successJob} 
            onClose={() => {
              setShowApplySuccess(false);
              setSuccessJob(null);
            }} 
            onGoToDashboard={() => {
              setShowApplySuccess(false);
              setSuccessJob(null);
              setDashboardTab('applications');
              setView('dashboard');
            }}
          />
        )}

        {authError && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 text-slate-800"
            >
              <div className="bg-rose-600 text-white p-6 relative">
                <button 
                  onClick={() => setAuthError(null)}
                  className="absolute top-4 right-4 bg-white/15 hover:bg-white/25 rounded-full p-2.5 transition-colors cursor-pointer text-xs"
                >
                  ✕
                </button>
                <div className="flex items-center gap-3">
                  <span className="text-3xl">⚠️</span>
                  <div className="text-left">
                    <h3 className="text-base font-black leading-tight">Problème d'authentification</h3>
                    <p className="text-xs text-rose-100 mt-1 font-medium">Code d'erreur : {authError.code}</p>
                  </div>
                </div>
              </div>

              <div className="p-6 md:p-8 space-y-6 text-left">
                {(() => {
                  const isApiKeyError = authError.code === 'auth/api-key-not-valid' || 
                                        authError.code === 'auth/invalid-api-key' ||
                                        (authError.message && (
                                          authError.message.includes('api-key-not-valid') || 
                                          authError.message.includes('invalid-api-key') || 
                                          authError.message.includes('API key')
                                        ));
                  
                  if (authError.code === 'auth/unauthorized-domain') {
                    return (
                      <div className="space-y-4">
                        <p className="text-xs text-slate-600 font-medium leading-relaxed">
                          Cette erreur se produit lorsque l'adresse de votre site (le domaine Vercel ou l'URL de prévisualisation) n'est pas répertoriée comme autorisée dans la console d'administration de votre projet Firebase.
                        </p>

                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
                          <p className="text-[10px] font-bold text-amber-800 uppercase tracking-widest">Le domaine à ajouter à Firebase :</p>
                          <div className="flex items-center justify-between bg-white border border-amber-100 rounded-xl p-3 font-mono text-xs text-slate-850">
                            <span>{typeof window !== 'undefined' ? window.location.hostname : 'votre-domaine.vercel.app'}</span>
                            <span className="text-[9px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 uppercase">À copier</span>
                          </div>
                        </div>

                        <div className="space-y-3 pt-2">
                          <p className="text-xs font-black text-slate-900 uppercase tracking-wider">Comment corriger cela en 2 minutes :</p>
                          
                          <div className="space-y-2.5 text-xs text-slate-500 font-medium">
                            <div className="flex gap-2.5">
                              <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold shrink-0 text-[10px]">1</span>
                              <p>Allez sur votre <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" className="text-emerald-600 font-bold underline">Console Firebase</a> et sélectionnez votre projet.</p>
                            </div>
                            <div className="flex gap-2.5">
                              <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold shrink-0 text-[10px]">2</span>
                              <p>Dans la barre latérale gauche, cliquez sur <strong>Authentication</strong> (rubrique Build).</p>
                            </div>
                            <div className="flex gap-2.5">
                              <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold shrink-0 text-[10px]">3</span>
                              <p>Cliquez sur l'onglet <strong>Settings</strong> (Paramètres) tout en haut.</p>
                            </div>
                            <div className="flex gap-2.5">
                              <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold shrink-0 text-[10px]">4</span>
                              <p>Cliquez sur <strong>Authorized domains</strong> (Domaines autorisés) dans le mini-menu de gauche.</p>
                            </div>
                            <div className="flex gap-2.5">
                              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold shrink-0 text-[10px]">5</span>
                              <p>Cliquez sur <strong>Add domain</strong> (Ajouter un domaine), collez <strong className="text-slate-900 font-bold">{typeof window !== 'undefined' ? window.location.hostname : 'votre-domaine.vercel.app'}</strong> et enregistrez !</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (isApiKeyError) {
                    return (
                      <div className="space-y-4">
                        <p className="text-xs text-slate-600 font-medium leading-relaxed">
                          Cette erreur se produit car votre déploiement Vercel n'a pas accès aux clés de configuration Firebase. Comme le fichier <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-rose-600 text-[11px]">firebase-applet-config.json</code> est ignoré par Git pour des raisons de sécurité, vous devez renseigner ces informations en tant que <strong>variables d'environnement</strong> sur Vercel.
                        </p>

                        <div className="space-y-3 pt-2">
                          <p className="text-xs font-black text-slate-900 uppercase tracking-wider">Comment configurer Vercel en 2 minutes :</p>
                          
                          <div className="space-y-2.5 text-xs text-slate-500 font-medium">
                            <div className="flex gap-2.5">
                              <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold shrink-0 text-[10px]">1</span>
                              <p>Allez sur votre tableau de bord <a href="https://vercel.com" target="_blank" rel="noreferrer" className="text-emerald-600 font-bold underline">Vercel</a> et ouvrez votre projet.</p>
                            </div>
                            <div className="flex gap-2.5">
                              <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold shrink-0 text-[10px]">2</span>
                              <p>Accédez à l'onglet <strong>Settings</strong> (Paramètres), puis cliquez sur <strong>Environment Variables</strong> dans le menu de gauche.</p>
                            </div>
                            <div className="flex gap-2.5">
                              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold shrink-0 text-[10px]">3</span>
                              <p>Copiez le bloc de configuration d'environnement que l'assistant vient de vous écrire dans la discussion de chat d'AI Studio, et <strong>collez-le directement</strong> dans le premier champ sur Vercel : il va générer toutes les clés d'un coup de manière magique !</p>
                            </div>
                            <div className="flex gap-2.5">
                              <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold shrink-0 text-[10px]">4</span>
                              <p>Cliquez sur <strong>Save</strong> pour valider.</p>
                            </div>
                            <div className="flex gap-2.5">
                              <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold shrink-0 text-[10px]">5</span>
                              <p>Faites un <strong>Redeploy</strong> (Nouveau déploiement) de votre projet sur Vercel pour que le site puisse charger les clés.</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-4">
                      <p className="text-xs text-slate-600 font-bold">Détails techniques de l'erreur brute :</p>
                      <pre className="bg-slate-50 border border-slate-100 text-[10px] p-3.5 rounded-xl overflow-x-auto font-mono text-slate-700 whitespace-pre-wrap max-h-32">
                        {authError.message}
                      </pre>
                      <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                        <strong>Recommandation :</strong> Assurez-vous d'avoir bien activé la connexion avec Google comme fournisseur dans l'onglet "Sign-in method" de votre console d'authentification Firebase.
                      </p>
                    </div>
                  );
                })()}

                <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-2.5">
                  <button
                    onClick={() => {
                      setAuthError(null);
                      handleDemoLogin(attemptedRole);
                    }}
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-md shadow-emerald-50 flex items-center justify-center gap-1.5"
                  >
                    🛡️ Continuer en Mode Démo
                  </button>
                  <button
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        navigator.clipboard.writeText(window.location.hostname);
                        addToast("Nom de domaine '" + window.location.hostname + "' copié dans le presse-papier !", 'info');
                      }
                    }}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold uppercase tracking-wider rounded-xl transition-colors cursor-pointer animate-none"
                  >
                    📋 Copier le domaine
                  </button>
                  <button
                    onClick={() => setAuthError(null)}
                    className="py-3 px-5 bg-slate-900 hover:bg-black text-white text-xs font-extrabold uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Real-time Sockets Toast Notification Panel */}
      <div className="fixed bottom-6 right-6 z-[250] flex flex-col gap-3 max-w-sm w-full pointer-events-none font-sans">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -25, scale: 0.9, transition: { duration: 0.2 } }}
              className={`p-4 rounded-2xl shadow-xl flex items-center gap-3 text-white border select-none pointer-events-auto ${
                toast.type === 'success' 
                  ? 'bg-emerald-600 border-emerald-500' 
                  : toast.type === 'error' 
                    ? 'bg-rose-600 border-rose-500' 
                    : 'bg-slate-900 border-slate-800'
              }`}
            >
              <div className="text-xl shrink-0">
                {toast.type === 'success' ? '⚡' : toast.type === 'error' ? '⚠️' : '🔔'}
              </div>
              <div className="text-xs font-black tracking-tight flex-1">
                {toast.message}
              </div>
              <button 
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                className="text-white/60 hover:text-white bg-white/10 hover:bg-white/20 p-1 rounded-lg text-[10px] w-5 h-5 flex items-center justify-center font-bold shrink-0 cursor-pointer"
              >
                ✕
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
