import React, { useState, useEffect } from 'react';
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
import { Models } from 'appwrite';
import { authService } from './services/authService';
import { sourcingService } from './services/sourcingService';
import { userService } from './services/userService';
import { UserProfile, JobPost, UserRole } from './types';
import { LandingView } from './components/LandingView';
import { JobListView, JobDetailView } from './components/JobListView';
import { PostJobView } from './components/PostJobView';
import { DashboardView } from './components/DashboardView';
import { ApplicationSuccessView } from './components/ApplicationSuccessView';
import { ApplicationFormModal } from './components/ApplicationFormModal';

export default function App() {
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const [view, setView] = useState<'landing' | 'jobs' | 'dashboard' | 'post-job'>('landing');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobPost | null>(null);
  const [dashboardTab, setDashboardTab] = useState<'overview' | 'verification' | 'my-jobs' | 'applications' | 'admin' | 'browse-candidates' | 'profile'>('overview');
  const [showGeneralLoginModal, setShowGeneralLoginModal] = useState(false);
  const [modalActiveTab, setModalActiveTab] = useState<'login' | 'signup'>('login');
  const [modalPreselectedRole, setModalPreselectedRole] = useState<'candidate' | 'employer'>('candidate');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupRole, setSignupRole] = useState<'candidate' | 'employer'>('candidate');

  // Mot de passe oublié
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [sendingReset, setSendingReset] = useState(false);

  // Finalisation de la réinitialisation (userId/secret reçus par email)
  const [resetRecoveryParams, setResetRecoveryParams] = useState<{ userId: string; secret: string } | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  // Redirection post-connexion Google (pas de routeur : on relit un marqueur en query param)
  const [pendingGoogleRedirect, setPendingGoogleRedirect] = useState(false);

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

  // Lit les query params une seule fois au chargement : lien de récupération de mot de passe
  // (userId + secret ajoutés par Appwrite) ou marqueur de retour de connexion Google.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const recoveryUserId = params.get('userId');
    const recoverySecret = params.get('secret');
    if (recoveryUserId && recoverySecret) {
      setResetRecoveryParams({ userId: recoveryUserId, secret: recoverySecret });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('auth') === 'dashboard') {
      setPendingGoogleRedirect(true);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('auth') === 'failed') {
      addToast("⚠️ La connexion Google a échoué.", 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Une fois la session Google résolue (profil chargé), on atterrit sur le dashboard.
  useEffect(() => {
    if (pendingGoogleRedirect && !loading && user) {
      setView('dashboard');
      setPendingGoogleRedirect(false);
    }
  }, [pendingGoogleRedirect, loading, user]);

  const handleForgotPassword = async () => {
    if (!forgotPasswordEmail.trim()) {
      addToast("Renseigne ton adresse e-mail d'abord.", 'error');
      return;
    }
    setSendingReset(true);
    try {
      await authService.requestPasswordReset(forgotPasswordEmail.trim());
    } catch (err: any) {
      // Ne jamais révéler si l'email correspond à un compte existant (énumération de comptes).
      // On log pour nous-mêmes, mais l'utilisateur voit toujours le même message générique.
      console.warn("[ForgotPassword]", err.message);
    } finally {
      addToast("📧 Si un compte existe avec cette adresse, un email de réinitialisation vient d'être envoyé.", 'success');
      setShowForgotPassword(false);
      setSendingReset(false);
    }
  };

  const handleConfirmPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetRecoveryParams) return;
    if (resetNewPassword.length < 8) {
      addToast("Le mot de passe doit contenir au moins 8 caractères.", 'error');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      addToast("Les deux mots de passe ne correspondent pas.", 'error');
      return;
    }
    setResettingPassword(true);
    try {
      await authService.confirmPasswordReset(resetRecoveryParams.userId, resetRecoveryParams.secret, resetNewPassword);
      setResetDone(true);
      addToast("✅ Mot de passe réinitialisé, tu peux te reconnecter.", 'success');
    } catch (err: any) {
      addToast(`⚠️ ${err.message}`, 'error');
    } finally {
      setResettingPassword(false);
    }
  };

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

    authService.getCurrentUser().then(async (u) => {
      setUser(u);
      try {
        if (u) {
          let profileData = await userService.getUserProfile(u.$id);
          if (!profileData) {
            profileData = await userService.createUserProfile(u.$id, {
              role: u.email === 'koffiw4@gmail.com' ? 'admin' : 'candidate',
              displayName: u.name || 'Utilisateur Source',
              email: u.email || '',
              photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop',
              skills: [],
              isVerified: false,
              isPremium: false,
              averageRating: 0,
              reviewCount: 0,
              createdAt: new Date().toISOString()
            });
          } else if (u.email === 'koffiw4@gmail.com' && profileData.role !== 'admin') {
            profileData = await userService.updateUserProfile(u.$id, { role: 'admin' });
          }
          setProfile(profileData);
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
    });
    return () => clearTimeout(timer);
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
      
      const docs = await sourcingService.getApprovedJobs();
      let fetchedJobs = docs.map(doc => ({ id: doc.$id, ...doc } as unknown as JobPost));
      if (selectedCategory) {
        fetchedJobs = fetchedJobs.filter(j => j.category === selectedCategory);
      }
      
      fetchedJobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      if (selectedCity) {
        setJobs(fetchedJobs.filter(j => j.location === selectedCity));
      } else {
        setJobs(fetchedJobs);
      }
      setIsOffline(false);
    } catch (err: any) {
      console.error("Erreur lors du chargement des offres d'emploi:", err);
      setJobs([]);
      setIsOffline(true);
    }
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch (err) {
      console.error("Logout error:", err);
    }
    setUser(null);
    setProfile(null);
    setView('landing');
    addToast('🚪 Vous avez été déconnecté.', 'info');
  };

  const openGeneralLogin = () => {
    setModalActiveTab('login');
    setShowGeneralLoginModal(true);
  };

  const executeConnexion = async (email: string, password?: string) => {
    if (!email || email.trim() === '') {
      addToast("Veuillez saisir votre adresse e-mail.", "error");
      return;
    }
    if (!password || password.trim() === '') {
      addToast("Veuillez saisir votre mot de passe.", "error");
      return;
    }
    const cleanedEmail = email.trim().toLowerCase();
    setAttemptedRole('candidate');

    

    try {
      addToast("🔑 Authentification Backend...", "info");
      let u: Models.User<Models.Preferences> | null = null;
      let isNewUser = false;

      try {
        // Attempt sign in
        const loginResult = await authService.login({ email: cleanedEmail, password });
        u = loginResult.user;
      } catch (loginErr: any) {
        console.warn("Connexion attempt failed, checking for auto-signup...", loginErr);
        if (loginErr.code === 'auth/user-not-found' || loginErr.code === 'auth/invalid-credential' || loginErr.message?.includes('user-not-found')) {
          try {
            // Auto inscription since user does not exist
            addToast("✨ Compte inexistant. Création automatique...", "info");
            const signupResult = await authService.register({ name: cleanedEmail.split("@")[0], email: cleanedEmail, password });
            u = signupResult.user;
            isNewUser = true;
          } catch (signupErr: any) {
            if (signupErr.code === 'auth/email-already-in-use') {
              throw new Error("Mot de passe incorrect ou informations de connexion invalides.");
            } else {
              throw signupErr;
            }
          }
        } else {
          throw loginErr;
        }
      }

      if (!u) {
        throw new Error("Authentification échouée.");
      }

      // Synchronise le profil dans Appwrite
      let profileData = isNewUser ? null : await userService.getUserProfile(u.$id);
      if (!profileData) {
        const defaultRole = u.email === 'koffiw4@gmail.com' ? 'admin' : 'candidate';
        profileData = await userService.createUserProfile(u.$id, {
          role: defaultRole,
          displayName: u.name || cleanedEmail.split('@')[0] || 'Utilisateur',
          email: u.email || cleanedEmail || '',
          photoURL: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200&auto=format&fit=crop',
          skills: [],
          isVerified: false,
          isPremium: false,
          averageRating: 0,
          reviewCount: 0,
          createdAt: new Date().toISOString()
        });
        addToast(`📝 Profil ${defaultRole === 'admin' ? 'Administrateur' : 'Candidat'} créé automatiquement !`, 'success');
      } else if (u.email === 'koffiw4@gmail.com' && profileData.role !== 'admin') {
        profileData = await userService.updateUserProfile(u.$id, { role: 'admin' });
      }
      setProfile(profileData);

      setShowGeneralLoginModal(false);
      setView('dashboard');
      addToast(isNewUser ? `🎉 Compte créé et connexion réussie !` : `🚀 Connexion réussie !`, 'success');
    } catch (err: any) {
      console.error("Backend Login Error", err);
      addToast(`⚠️ Identifiants incorrects ou Erreur : ${err.message || err.code}`, 'error');
    }
  };

  const executeGoogleLogin = async () => {
    

    try {
      addToast("🔑 Authentification Google...", "info");
      await authService.loginWithGoogle();
      const u = await authService.getCurrentUser();
      if (!u) {
        throw new Error("Authentification Google échouée.");
      }

      let profileData = await userService.getUserProfile(u.$id);
      if (!profileData) {
        const defaultRole = u.email === 'koffiw4@gmail.com' ? 'admin' : 'candidate';
        profileData = await userService.createUserProfile(u.$id, {
          role: defaultRole,
          displayName: u.name || 'Utilisateur Google',
          email: u.email || '',
          photoURL: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200&auto=format&fit=crop',
          skills: [],
          isVerified: false,
          isPremium: false,
          averageRating: 0,
          reviewCount: 0,
          createdAt: new Date().toISOString()
        });
        addToast(`📝 Profil ${defaultRole === 'admin' ? 'Administrateur' : 'Candidat'} créé automatiquement !`, 'success');
      } else if (u.email === 'koffiw4@gmail.com' && profileData.role !== 'admin') {
        profileData = await userService.updateUserProfile(u.$id, { role: 'admin' });
      }
      setProfile(profileData);
      setShowGeneralLoginModal(false);
      setView('dashboard');
      addToast(`🚀 Connexion Google réussie !`, 'success');
    } catch (err: any) {
      console.warn("[Backend] Google Sign-In connection check:", err.message || err);
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        addToast("Connexion annulée.", 'info');
      } else {
        addToast(`⚠️ La connexion Google a échoué : ${err.message || err.code}`, 'error');
      }
    }
  };

  const executeInscription = async (name: string, email: string, role: UserRole, password?: string) => {
    if (!name || name.trim() === '') {
      addToast("Veuillez saisir votre nom complet.", "error");
      return;
    }
    if (!email || email.trim() === '') {
      addToast("Veuillez saisir votre adresse e-mail.", "error");
      return;
    }
    if (!password || password.trim() === '') {
      addToast("Veuillez saisir votre mot de passe.", "error");
      return;
    }

    const cleanedEmail = email.trim().toLowerCase();
    const assignedRole = (role === 'admin' && cleanedEmail !== 'koffiw4@gmail.com') ? 'candidate' : role;

    

    try {
      addToast("🔑 Inscription via Backend Auth...", "info");
      let u: Models.User<Models.Preferences> | null = null;
      let shouldCreateProfile = false;

      try {
        const result = await authService.register({ name: name || cleanedEmail.split("@")[0], email: cleanedEmail, password });
        u = result.user;
        shouldCreateProfile = true;
      } catch (signupErr: any) {
        if (signupErr.code === 'auth/email-already-in-use') {
          addToast("💡 Cet e-mail est déjà inscrit. Connexion automatique...", "info");
          const loginResult = await authService.login({ email: cleanedEmail, password });
          u = loginResult.user;
        } else {
          throw signupErr;
        }
      }

      if (!u) {
        throw new Error("Authentification échouée.");
      }

      const defaultRole = u.email === 'koffiw4@gmail.com' ? 'admin' : assignedRole;
      let profileData: UserProfile;
      if (shouldCreateProfile) {
        profileData = await userService.createUserProfile(u.$id, {
          role: defaultRole,
          displayName: name || u.name || 'Utilisateur',
          email: u.email || cleanedEmail || '',
          photoURL: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200&auto=format&fit=crop',
          skills: [],
          isVerified: false,
          isPremium: false,
          averageRating: 0,
          reviewCount: 0,
          createdAt: new Date().toISOString()
        });
      } else {
        const existingProfile = await userService.getUserProfile(u.$id);
        profileData = existingProfile || await userService.createUserProfile(u.$id, {
          role: defaultRole,
          displayName: name || 'Utilisateur',
          email: u.email || cleanedEmail || '',
          photoURL: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200&auto=format&fit=crop',
          skills: [],
          isVerified: false,
          isPremium: false,
          averageRating: 0,
          reviewCount: 0,
          createdAt: new Date().toISOString()
        });
      }
      setProfile(profileData);

      setShowGeneralLoginModal(false);
      setView('dashboard');
      addToast(shouldCreateProfile ? `🎉 Compte créé en tant que ${defaultRole === 'employer' ? 'Recruteur' : 'Candidat'} !` : `🚀 Connexion réussie !`, 'success');
    } catch (err: any) {
      console.error("Backend Inscription Error:", err);
      addToast(`⚠️ Échec de l'inscription : ${err.message || err.code}`, 'error');
    }
  };

  const handleLogin = async (role: UserRole) => {
    setAttemptedRole(role);
    setSignupRole(role === 'admin' ? 'candidate' : role);
    setModalActiveTab('signup');
    setShowGeneralLoginModal(true);
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
    cvFile?: File;
    message: string;
  }) => {
    if (!user || !applyingJob || !profile) return;
    try {
      const applicationDoc: any = await sourcingService.submitApplication(
        applyingJob.id,
        user.$id,
        applyingJob.employerId,
        {
          candidateName: data.candidateName,
          photoURL: data.photoURL,
          experienceYears: data.experienceYears,
          message: data.message
        },
        data.cvFile
      );

      // Sync user profile in real-time
      const updatedProfile = await userService.updateUserProfile(user.$id, {
        displayName: data.candidateName,
        photoURL: data.photoURL,
        phone: data.phone,
        ...(applicationDoc.cvFileId ? {
          cvName: data.cvFile?.name,
          cvUrl: sourcingService.getCVPreviewUrl(applicationDoc.cvFileId)
        } : {})
      });
      setProfile(updatedProfile);

      setSuccessJob(applyingJob);
      setApplyingJob(null);
      setShowApplySuccess(true);
    } catch (err) {
      console.error("Submitting application failed:", err);
      addToast("⚠️ Erreur lors de l'envoi de votre candidature. Veuillez réessayer.", "error");
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
                <button 
                  onClick={() => openGeneralLogin()} 
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider px-5 py-2.5 rounded-xl cursor-pointer transition-all shadow-md shadow-emerald-600/10 flex items-center h-10 shrink-0"
                >
                  🚪 Se connecter / S'inscrire
                </button>
              </div>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="md:hidden p-2 text-slate-600 animate-none">
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
                <button 
                  onClick={() => { openGeneralLogin(); setIsMenuOpen(false); }} 
                  className="w-full py-4 text-center font-black uppercase text-xs tracking-wider text-white bg-emerald-600 rounded-xl shadow-md cursor-pointer hover:bg-emerald-500 transition-all"
                >
                  🚪 Connexion / Inscription
                </button>
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
              onLogout={handleLogout}
            />
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {showGeneralLoginModal && (
          <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs z-[200] flex items-end sm:items-center justify-center sm:p-4">
            <motion.div
              initial={isMobile ? { y: "100%" } : { scale: 0.95, opacity: 0 }}
              animate={isMobile ? { y: 0 } : { scale: 1, opacity: 1 }}
              exit={isMobile ? { y: "100%" } : { scale: 0.95, opacity: 0 }}
              transition={isMobile ? { type: "spring", damping: 25, stiffness: 220 } : undefined}
              className="bg-white rounded-t-[32px] sm:rounded-[32px] w-full max-w-md p-6 relative overflow-hidden shadow-2xl border border-slate-100 flex flex-col font-sans max-h-[90vh] overflow-y-auto"
            >
              {isMobile && (
                <div className="pt-1 pb-3 flex justify-center shrink-0">
                  <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
                </div>
              )}
              <button 
                onClick={() => setShowGeneralLoginModal(false)}
                className="absolute top-4 right-4 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full p-2 hover:scale-105 transition-all cursor-pointer text-xs w-8 h-8 flex items-center justify-center z-10"
              >
                ✕
              </button>

              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/15 text-emerald-600 flex items-center justify-center text-2xl mx-auto mb-3 font-bold">
                🔐
              </div>

              <h3 className="text-xl font-black text-slate-900 tracking-tight text-center mb-1">
                IvoireSource
              </h3>
              <p className="text-slate-400 text-[11px] text-center mb-6 leading-relaxed">
                Trouvez du travail ou recrutez des professionnels de confiance en Côte d'Ivoire.
              </p>

              {/* Tabs */}
              {!showForgotPassword && (
                <div className="grid grid-cols-2 bg-slate-100 p-1 rounded-xl mb-5">
                  <button
                    type="button"
                    onClick={() => setModalActiveTab('login')}
                    className={`py-2 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      modalActiveTab === 'login'
                        ? 'bg-white text-emerald-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    🔑 Connexion
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalActiveTab('signup')}
                    className={`py-2 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      modalActiveTab === 'signup'
                        ? 'bg-white text-emerald-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    ✨ Inscription
                  </button>
                </div>
              )}

              {showForgotPassword ? (
                /* Mot de passe oublié */
                <div className="space-y-4">
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Indique ton adresse e-mail, on t'envoie un lien pour choisir un nouveau mot de passe.
                  </p>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      Adresse e-mail
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="exemple@email.com"
                      value={forgotPasswordEmail}
                      onChange={(e) => setForgotPasswordEmail(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-xs outline-none transition-all font-medium"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={sendingReset}
                    onClick={handleForgotPassword}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-emerald-600/10 cursor-pointer disabled:opacity-60"
                  >
                    {sendingReset ? 'Envoi...' : 'Envoyer le lien'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(false)}
                    className="w-full text-[10px] text-slate-400 font-bold hover:text-slate-600 cursor-pointer"
                  >
                    ← Retour à la connexion
                  </button>
                </div>
              ) : modalActiveTab === 'login' ? (
                /* Connexion Form */
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    executeConnexion(loginEmail, loginPassword);
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      Adresse e-mail
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="exemple@email.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-xs outline-none transition-all font-medium"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      Mot de passe
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-xs outline-none transition-all font-medium"
                    />
                    <div className="text-right pt-0.5">
                      <button
                        type="button"
                        onClick={() => { setForgotPasswordEmail(loginEmail); setShowForgotPassword(true); }}
                        className="text-[10px] text-emerald-600 font-bold hover:underline cursor-pointer"
                      >
                        Mot de passe oublié ?
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-emerald-600/10 cursor-pointer flex items-center justify-center gap-2"
                  >
                    Se connecter <ArrowRight className="h-4.5 w-4.5" />
                  </button>

                  <p className="text-[9px] text-slate-400 text-center leading-normal">
                    * Si votre compte n'existe pas, il sera créé automatiquement avec ces identifiants.
                  </p>
                </form>
              ) : (
                /* Inscription Form */
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    executeInscription(signupName, signupEmail, signupRole, signupPassword);
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      Nom complet
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Marie Kouassi"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-xs outline-none transition-all font-medium"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      Adresse e-mail
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="marie@exemple.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-xs outline-none transition-all font-medium"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      Mot de passe
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-xs outline-none transition-all font-medium"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
                      Choisissez votre rôle
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setSignupRole('candidate')}
                        className={`p-3 rounded-xl border text-left transition-all relative cursor-pointer ${
                          signupRole === 'candidate'
                            ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/10'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <span className="text-xl block mb-1">👶</span>
                        <span className="font-extrabold text-[10px] uppercase tracking-wider block text-slate-800">
                          Candidat
                        </span>
                        <span className="text-[8px] text-slate-400 leading-normal block mt-0.5">
                          Cherche un emploi
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSignupRole('employer')}
                        className={`p-3 rounded-xl border text-left transition-all relative cursor-pointer ${
                          signupRole === 'employer'
                            ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/10'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <span className="text-xl block mb-1">💼</span>
                        <span className="font-extrabold text-[10px] uppercase tracking-wider block text-slate-800">
                          Employeur
                        </span>
                        <span className="text-[8px] text-slate-400 leading-normal block mt-0.5">
                          Veut recruter
                        </span>
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-emerald-700/10 cursor-pointer mt-2"
                  >
                    Créer mon compte
                  </button>
                </form>
              )}

              {/* Separators and Google Connection */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-slate-400 font-extrabold text-[9px] tracking-wider">OU</span>
                </div>
              </div>

              <button
                type="button"
                onClick={executeGoogleLogin}
                className="w-full bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold py-3 px-4 rounded-xl text-xs border border-slate-200 flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer focus:outline-none"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.51 14.98 1 12 1 7.35 1 3.37 3.67 1.39 7.56l3.85 2.99c1-2.98 3.77-5.51 6.76-5.51z"
                  />
                  <path
                    fill="#4285F4"
                    d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.51h6.46c-.29 1.48-1.14 2.73-2.4 3.58l3.73 2.89c2.18-2.01 3.7-4.99 3.7-8.62z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.24 14.55c-.25-.76-.39-1.57-.39-2.55s.14-1.79.39-2.55L1.39 6.46C.5 8.26 0 10.07 0 12s.5 3.74 1.39 5.54l3.85-2.99z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c3.24 0 5.97-1.09 7.96-2.96l-3.73-2.89c-1.14.77-2.6 1.25-4.23 1.25-2.99 0-5.76-2.53-6.76-5.51L1.39 15.9C3.37 19.79 7.35 23 12 23z"
                  />
                </svg>
                Se connecter avec Google
              </button>

              <p className="text-[8px] text-slate-400 mt-4 leading-normal text-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                💡 Note : Pour utiliser votre propre Backend, activez les options "Adresse e-mail/Mot de passe" et "Google" sous l'onglet <strong>Authentication &gt; Sign-in method</strong> de votre Console de Gestion.
              </p>

              <div className="mt-6 pt-4 border-t border-slate-100 text-center">
                <span className="text-[9px] uppercase font-black text-slate-400 tracking-widest block">
                  🛡️ Plateforme Certifiée & Sécurisée
                </span>
              </div>
            </motion.div>
          </div>
        )}

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
                          Cette erreur se produit lorsque l'adresse de votre site (le domaine Vercel ou l'URL de prévisualisation) n'est pas répertoriée comme autorisée dans la console d'administration de votre projet Backend.
                        </p>

                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
                          <p className="text-[10px] font-bold text-amber-800 uppercase tracking-widest">Le domaine à ajouter à Backend :</p>
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
                              <p>Allez sur votre <a href="#" target="_blank" rel="noreferrer" className="text-emerald-600 font-bold underline">Console de Gestion</a> et sélectionnez votre projet.</p>
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
                          Cette erreur se produit car votre déploiement Vercel n'a pas accès aux clés de configuration du Backend. Comme le fichier <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-rose-600 text-[11px]">backend-config.json</code> est ignoré par Git pour des raisons de sécurité, vous devez renseigner ces informations en tant que <strong>variables d'environnement</strong> sur Vercel.
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
                        <strong>Recommandation :</strong> Assurez-vous d'avoir bien activé la connexion avec Google comme fournisseur dans l'onglet "Sign-in method" de votre console d'authentification Backend.
                      </p>
                    </div>
                  );
                })()}

                <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-2.5">
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

      {/* Finalisation de la réinitialisation de mot de passe (lien reçu par email) */}
      <AnimatePresence>
        {resetRecoveryParams && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[220] flex items-end sm:items-center justify-center sm:p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-t-[32px] sm:rounded-[32px] w-full max-w-sm p-6 md:p-8 shadow-2xl"
            >
              {resetDone ? (
                <div className="text-center space-y-4">
                  <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center text-2xl mx-auto">✅</div>
                  <h3 className="text-lg font-black text-slate-900">Mot de passe mis à jour</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">Tu peux maintenant te reconnecter avec ton nouveau mot de passe.</p>
                  <button
                    type="button"
                    onClick={() => { setResetRecoveryParams(null); setResetDone(false); openGeneralLogin(); }}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Se connecter
                  </button>
                </div>
              ) : (
                <form onSubmit={handleConfirmPasswordReset} className="space-y-4">
                  <h3 className="text-lg font-black text-slate-900 text-center">Nouveau mot de passe</h3>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Nouveau mot de passe</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      placeholder="••••••••"
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-xs outline-none transition-all font-medium"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Confirme le mot de passe</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      placeholder="••••••••"
                      value={resetConfirmPassword}
                      onChange={(e) => setResetConfirmPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl text-xs outline-none transition-all font-medium"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={resettingPassword}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer disabled:opacity-60"
                  >
                    {resettingPassword ? 'Validation...' : 'Valider le nouveau mot de passe'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetRecoveryParams(null)}
                    className="w-full text-[10px] text-slate-400 font-bold hover:text-slate-600 cursor-pointer"
                  >
                    Annuler
                  </button>
                </form>
              )}
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
