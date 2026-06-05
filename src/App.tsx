import React, { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
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
import { auth, db, googleProvider, rawConfig, isFirebaseAvailableByConfig, disableFirebase, getIsFirebaseAvailable } from './lib/firebase';
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
    if (!getIsFirebaseAvailable() || !rawConfig || !rawConfig.apiKey || rawConfig.apiKey === '') {
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
            if (u.email === 'koffiw4@gmail.com') {
              profileData.role = 'admin';
            }
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
      if (!getIsFirebaseAvailable()) {
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
      if (getIsFirebaseAvailable()) {
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

  const openGeneralLogin = () => {
    setModalActiveTab('login');
    setShowGeneralLoginModal(true);
  };

  const handleLocalSimulationConnexion = (cleanedEmail: string, password?: string) => {
    const localUsersStr = localStorage.getItem('offline_users') || '[]';
    const localUsers = JSON.parse(localUsersStr);
    
    let existing = localUsers.find((u: any) => u.email.toLowerCase() === cleanedEmail.toLowerCase());
    
    if (existing) {
      if (password && existing.simulatedPassword && existing.simulatedPassword !== password) {
        addToast("⚠️ Mot de passe incorrect pour ce compte simulé.", "error");
        return;
      }
      
      const mockUser = {
        uid: existing.uid,
        displayName: existing.displayName,
        email: existing.email,
        photoURL: existing.photoURL
      };
      
      localStorage.setItem('demo_user', JSON.stringify(mockUser));
      localStorage.setItem('demo_profile', JSON.stringify(existing));
      
      setUser(mockUser as any);
      setProfile(existing);
      setAuthError(null);
      setShowGeneralLoginModal(false);
      setView('dashboard');
      addToast(`🚀 Connexion réussie (${cleanedEmail}) !`, 'success');
    } else {
      // Auto-inscription!
      let userRole: UserRole = 'candidate';
      let name = "Marie Kouassi";

      if (cleanedEmail === 'koffiw4@gmail.com') {
        userRole = 'admin';
        name = "Koffi Admin";
      } else if (cleanedEmail.includes('employer') || cleanedEmail.includes('recruteur') || cleanedEmail.includes('resto') || cleanedEmail.includes('entreprise') || cleanedEmail.includes('societe')) {
        userRole = 'employer';
        name = "Société Sourcing CI";
      }

      const mockUid = 'demo-' + userRole + '-uid-' + Math.random().toString(36).substring(7);
      const mockUser = {
        uid: mockUid,
        displayName: name,
        email: cleanedEmail,
        photoURL: userRole === 'candidate' 
          ? 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=200&auto=format&fit=crop'
          : 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=200&auto=format&fit=crop'
      };

      const mockProfile: UserProfile & { simulatedPassword?: string } = {
        uid: mockUid,
        role: userRole,
        displayName: mockUser.displayName,
        email: mockUser.email,
        photoURL: mockUser.photoURL,
        skills: userRole === 'candidate' ? ["Garde d'enfants", "Ménage", "Cuisine africaine"] : [],
        isVerified: userRole === 'candidate',
        isPremium: userRole === 'employer',
        averageRating: userRole === 'candidate' ? 4.9 : 0,
        reviewCount: userRole === 'candidate' ? 3 : 0,
        createdAt: new Date().toISOString(),
        simulatedPassword: password || ''
      };

      localUsers.push(mockProfile);
      localStorage.setItem('offline_users', JSON.stringify(localUsers));

      localStorage.setItem('demo_user', JSON.stringify(mockUser));
      localStorage.setItem('demo_profile', JSON.stringify(mockProfile));

      setUser(mockUser as any);
      setProfile(mockProfile);
      setAuthError(null);
      setShowGeneralLoginModal(false);
      setView('dashboard');
      addToast(`✨ Compte démo créé automatiquement (${cleanedEmail}) !`, 'success');
    }
  };

  const handleLocalSimulationInscription = (name: string, cleanedEmail: string, assignedRole: UserRole, password?: string) => {
    const localUsersStr = localStorage.getItem('offline_users') || '[]';
    const localUsers = JSON.parse(localUsersStr);
    
    let existing = localUsers.find((u: any) => u.email.toLowerCase() === cleanedEmail.toLowerCase());
    
    if (existing) {
      addToast(`💡 Cet e-mail est déjà enregistré. Connexion automatique...`, "info");
      handleLocalSimulationConnexion(cleanedEmail, password);
      return;
    }

    const mockUid = 'demo-' + assignedRole + '-uid-' + Math.random().toString(36).substring(7);
    const mockUser = {
      uid: mockUid,
      displayName: name,
      email: cleanedEmail,
      photoURL: assignedRole === 'candidate' 
        ? 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=200&auto=format&fit=crop'
        : 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=200&auto=format&fit=crop'
    };

    const mockProfile: UserProfile & { simulatedPassword?: string } = {
      uid: mockUid,
      role: assignedRole,
      displayName: name,
      email: cleanedEmail,
      photoURL: mockUser.photoURL,
      skills: assignedRole === 'candidate' ? ["Garde d'enfants", "Ménage"] : [],
      isVerified: false,
      isPremium: assignedRole === 'employer',
      averageRating: 0,
      reviewCount: 0,
      createdAt: new Date().toISOString(),
      simulatedPassword: password || ''
    };

    localUsers.push(mockProfile);
    localStorage.setItem('offline_users', JSON.stringify(localUsers));

    localStorage.setItem('demo_user', JSON.stringify(mockUser));
    localStorage.setItem('demo_profile', JSON.stringify(mockProfile));

    setUser(mockUser as any);
    setProfile(mockProfile);
    setAuthError(null);
    setShowGeneralLoginModal(false);
    setView('dashboard');
    addToast(`🎉 Inscription réussie (${cleanedEmail}) !`, 'success');
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

    if (!getIsFirebaseAvailable() || !rawConfig || !rawConfig.apiKey || rawConfig.apiKey === '') {
      handleLocalSimulationConnexion(cleanedEmail, password);
      return;
    }

    try {
      addToast("🔑 Authentification Firebase...", "info");
      let u: any = null;
      let isNewUser = false;
      
      try {
        // Attempt sign in
        const loginResult = await signInWithEmailAndPassword(auth, cleanedEmail, password);
        u = loginResult.user;
      } catch (loginErr: any) {
        console.warn("Connexion attempt failed, checking for auto-signup...", loginErr);
        if (loginErr.code === 'auth/user-not-found' || loginErr.code === 'auth/invalid-credential' || loginErr.message?.includes('user-not-found')) {
          try {
            // Auto inscription since user does not exist
            addToast("✨ Compte inexistant. Création automatique...", "info");
            const signupResult = await createUserWithEmailAndPassword(auth, cleanedEmail, password);
            u = signupResult.user;
            isNewUser = true;
          } catch (signupErr: any) {
            if (signupErr.code === 'auth/email-already-in-use') {
              throw new Error("Mot de passe incorrect ou informations de connexion invalides.");
            } else {
              throw signupErr;
            }
          }
        } else if (loginErr.message?.includes('api-key-not-valid')) {
          throw loginErr; // bubble up for the api-key fallback
        } else {
          throw loginErr;
        }
      }

      if (!u) {
        throw new Error("Authentification échouée.");
      }

      // Sync user profile in Firestore
      const docRef = doc(db, 'users', u.uid);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists() || isNewUser) {
        const defaultRole = u.email === 'koffiw4@gmail.com' ? 'admin' : 'candidate';
        const newProfile: UserProfile = {
          uid: u.uid,
          role: defaultRole,
          displayName: u.displayName || cleanedEmail.split('@')[0] || 'Utilisateur',
          email: u.email || cleanedEmail || '',
          photoURL: u.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200&auto=format&fit=crop',
          skills: [],
          isVerified: false,
          isPremium: false,
          averageRating: 0,
          reviewCount: 0,
          createdAt: new Date().toISOString()
        };
        await setDoc(docRef, newProfile);
        setProfile(newProfile);
        addToast(`📝 Profil ${defaultRole === 'admin' ? 'Administrateur' : 'Candidat'} créé automatiquement !`, 'success');
      } else {
        const existingProfile = docSnap.data() as UserProfile;
        if (u.email === 'koffiw4@gmail.com') {
          if (existingProfile.role !== 'admin') {
            const updated = { ...existingProfile, role: 'admin' as UserRole };
            await setDoc(docRef, updated);
            setProfile(updated);
          } else {
            setProfile(existingProfile);
          }
        } else {
          setProfile(existingProfile);
        }
      }
      
      setShowGeneralLoginModal(false);
      setView('dashboard');
      addToast(isNewUser ? `🎉 Compte créé et connexion réussie !` : `🚀 Connexion réussie !`, 'success');
    } catch (err: any) {
      console.error("Firebase Login Error", err);
      if (err.message && err.message.includes('api-key-not-valid')) {
        addToast("⚠️ Clé ou Configuration Firebase non opérationnelle. Connexion via simulation locale...", "info");
        handleLocalSimulationConnexion(cleanedEmail, password);
      } else {
        addToast(`⚠️ Identifiants incorrects ou Erreur : ${err.message || err.code}`, 'error');
      }
    }
  };

  const executeGoogleLogin = async () => {
    if (!getIsFirebaseAvailable() || !rawConfig || !rawConfig.apiKey || rawConfig.apiKey === '') {
      addToast("💡 Mode démo - SSO Google simulé.", "info");
      handleLocalSimulationConnexion("google-user@gmail.com");
      return;
    }

    try {
      addToast("🔑 Authentification Google...", "info");
      const result = await signInWithPopup(auth, googleProvider);
      const u = result.user;
      
      const docRef = doc(db, 'users', u.uid);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        const defaultRole = u.email === 'koffiw4@gmail.com' ? 'admin' : 'candidate';
        const newProfile: UserProfile = {
          uid: u.uid,
          role: defaultRole,
          displayName: u.displayName || 'Utilisateur Google',
          email: u.email || '',
          photoURL: u.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200&auto=format&fit=crop',
          skills: [],
          isVerified: false,
          isPremium: false,
          averageRating: 0,
          reviewCount: 0,
          createdAt: new Date().toISOString()
        };
        await setDoc(docRef, newProfile);
        setProfile(newProfile);
        addToast(`📝 Profil ${defaultRole === 'admin' ? 'Administrateur' : 'Candidat'} créé automatiquement !`, 'success');
      } else {
        const existingProfile = docSnap.data() as UserProfile;
        if (u.email === 'koffiw4@gmail.com') {
          if (existingProfile.role !== 'admin') {
            const updated = { ...existingProfile, role: 'admin' as UserRole };
            await setDoc(docRef, updated);
            setProfile(updated);
          } else {
            setProfile(existingProfile);
          }
        } else {
          setProfile(existingProfile);
        }
      }
      setShowGeneralLoginModal(false);
      setView('dashboard');
      addToast(`🚀 Connexion Google réussie !`, 'success');
    } catch (err: any) {
      console.warn("[FIREBASE] Google Sign-In connection check:", err.message || err);
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        addToast("Connexion annulée.", 'info');
      } else {
        addToast("⚠️ Firebase non opérationnel. Bascule sur la simulation locale...", "info");
        handleLocalSimulationConnexion("google-user@gmail.com");
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

    if (!getIsFirebaseAvailable() || !rawConfig || !rawConfig.apiKey || rawConfig.apiKey === '') {
      handleLocalSimulationInscription(name, cleanedEmail, assignedRole, password);
      return;
    }

    try {
      addToast("🔑 Inscription via Firebase Auth...", "info");
      let u: any = null;
      let shouldCreateProfile = false;

      try {
        const result = await createUserWithEmailAndPassword(auth, cleanedEmail, password);
        u = result.user;
        shouldCreateProfile = true;
      } catch (signupErr: any) {
        if (signupErr.code === 'auth/email-already-in-use') {
          addToast("💡 Cet e-mail est déjà inscrit. Connexion automatique...", "info");
          const loginResult = await signInWithEmailAndPassword(auth, cleanedEmail, password);
          u = loginResult.user;
        } else {
          throw signupErr;
        }
      }

      if (!u) {
        throw new Error("Authentification échouée.");
      }

      const docRef = doc(db, 'users', u.uid);
      const defaultRole = u.email === 'koffiw4@gmail.com' ? 'admin' : assignedRole;
      
      if (shouldCreateProfile) {
        const newProfile: UserProfile = {
          uid: u.uid,
          role: defaultRole,
          displayName: name || u.displayName || 'Utilisateur',
          email: u.email || cleanedEmail || '',
          photoURL: u.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200&auto=format&fit=crop',
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
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setProfile(docSnap.data() as UserProfile);
        } else {
          const newProfile: UserProfile = {
            uid: u.uid,
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
          };
          await setDoc(docRef, newProfile);
          setProfile(newProfile);
        }
      }

      setShowGeneralLoginModal(false);
      setView('dashboard');
      addToast(shouldCreateProfile ? `🎉 Compte créé en tant que ${defaultRole === 'employer' ? 'Recruteur' : 'Candidat'} !` : `🚀 Connexion réussie !`, 'success');
    } catch (err: any) {
      console.error("Firebase Inscription Error:", err);
      if (err.message && err.message.includes('api-key-not-valid')) {
        addToast("⚠️ Clé ou Configuration Firebase non opérationnelle. Inscription via simulation locale...", "info");
        handleLocalSimulationInscription(name, cleanedEmail, assignedRole, password);
      } else {
        addToast(`⚠️ Échec de l'inscription : ${err.message || err.code}`, 'error');
      }
    }
  };

  const handleLogin = async (role: UserRole) => {
    setAttemptedRole(role);
    setSignupRole(role === 'admin' ? 'candidate' : role);
    setModalActiveTab('signup');
    setShowGeneralLoginModal(true);
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

              {modalActiveTab === 'login' ? (
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
                💡 Note : Pour utiliser votre propre Firebase, activez les options "Adresse e-mail/Mot de passe" et "Google" sous l'onglet <strong>Authentication &gt; Sign-in method</strong> de votre console Firebase.
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
