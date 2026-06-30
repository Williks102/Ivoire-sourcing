import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  Users, 
  BarChart3, 
  Briefcase, 
  ShieldCheck, 
  Settings, 
  X, 
  LogOut, 
  Menu, 
  PlusCircle, 
  Star, 
  User as UserIcon, 
  CheckCircle2, 
  Clock, 
  ChevronRight, 
  Search,
  Trash2,
  AlertTriangle,
  Phone,
  Mail,
  UploadCloud,
  FileText,
  Eye,
  Paperclip
} from 'lucide-react';
import { db, auth, doc, setDoc, getDoc, deleteDoc, collection, query, where, limit, getDocs, signOut, getIsBackendAvailable } from '../lib/appwriteBackend';
import { UserProfile, JobPost, Application, UserRole } from '../types';
import { CITIES, CATEGORIES } from '../constants';
import { OPERATORS_MAP, loadPaiementProScript } from './LandingView';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface AppwriteErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

function handleAppwriteError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: AppwriteErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Appwrite Error Details: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface DashboardViewProps {
  profile: UserProfile | null;
  user: any | null;
  activeTab: 'overview' | 'verification' | 'my-jobs' | 'applications' | 'admin' | 'browse-candidates' | 'profile';
  setActiveTab: (tab: any) => void;
  onProfileUpdate: (p: UserProfile) => void;
  setView: (v: any) => void;
}

export function DashboardView({
  profile,
  user,
  activeTab,
  setActiveTab,
  onProfileUpdate,
  setView
}: DashboardViewProps) {
  const isBackendAvailable = getIsBackendAvailable();
  const [isMobile, setIsMobile] = useState<boolean>(false);
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const [myJobs, setMyJobs] = useState<JobPost[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [candidates, setCandidates] = useState<UserProfile[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<UserProfile | null>(null);
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [unlockedCandidateIds, setUnlockedCandidateIds] = useState<string[]>([]);

  // Job Management States
  const [selectedManageJob, setSelectedManageJob] = useState<JobPost | null>(null);
  const [isEditingJob, setIsEditingJob] = useState(false);
  const [editJobForm, setEditJobForm] = useState({
    title: '',
    category: 'nounou' as any,
    location: '',
    salaryRange: '',
    description: '',
  });
  const [checkoutStep, setCheckoutStep] = useState<'details' | 'plans' | 'payment-method' | 'processing' | 'success'>('details');
  const [chosenPlan, setChosenPlan] = useState<'one-time' | 'monthly'>('one-time');
  const [paymentOperator, setPaymentOperator] = useState<'wave' | 'orange' | 'mtn' | 'moov' | 'card'>('wave');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [paymentError, setPaymentError] = useState<string>('');
  const [paymentStatusMessage, setPaymentStatusMessage] = useState<string>('');
  const [previewCv, setPreviewCv] = useState<{ name: string; url: string } | null>(null);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Profile Form States
  const [editName, setEditName] = useState(profile?.displayName || '');
  const [editBio, setEditBio] = useState(profile?.bio || '');
  const [editLocation, setEditLocation] = useState(profile?.location || '');
  const [editSkills, setEditSkills] = useState<string[]>(profile?.skills || []);
  const [editPhone, setEditPhone] = useState(profile?.phone || '');
  const [profileCvFile, setProfileCvFile] = useState<{ name: string; content?: string } | null>(
    profile?.cvName ? { name: profile.cvName, content: profile.cvUrl } : null
  );
  const [isProfileCvDragging, setIsProfileCvDragging] = useState(false);
  const profileFileInputRef = React.useRef<HTMLInputElement>(null);
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const getJobStatusLabel = (status: string) => {
    switch (status) {
      case 'approved':
        return { text: 'Approuvée', color: 'bg-emerald-50 text-emerald-600 border border-emerald-100/30' };
      case 'rejected':
        return { text: 'Rejetée / En suspens', color: 'bg-red-50 text-red-650 border border-red-100/30' };
      case 'closed':
        return { text: 'Clôturée', color: 'bg-slate-100 text-slate-500 border border-slate-200/30' };
      case 'pending':
      default:
        return { text: 'En attente de validation', color: 'bg-amber-50 text-amber-600 border border-amber-100/30' };
    }
  };

  // Admin Sub-Tab State ('users' | 'jobs' | 'applications')
  const [adminTab, setAdminTab] = useState<'users' | 'jobs' | 'applications'>('users');

  // Admin creations states
  const [isAdminCreatingUser, setIsAdminCreatingUser] = useState(false);
  const [isAdminCreatingJob, setIsAdminCreatingJob] = useState(false);
  const [adminUserForm, setAdminUserForm] = useState({
    displayName: '',
    email: '',
    role: 'candidate' as UserRole,
    isVerified: false,
    isPremium: false,
    bio: '',
    location: ''
  });
  const [adminJobForm, setAdminJobForm] = useState({
    title: '',
    category: 'nounou',
    location: 'Abidjan',
    salaryRange: '',
    description: '',
    isPremium: false,
    employerId: 'system'
  });

  // ID Verification Upload Simulation State
  const [idNumber, setIdNumber] = useState('');
  const [isSubmittingID, setIsSubmittingID] = useState(false);
  const [verificationFeedback, setVerificationFeedback] = useState('');

  // Real document upload states for Côte d'Ivoire Certification
  const [cniFile, setCniFile] = useState<{ name: string; base64: string; size: string } | null>(null);
  const [casierFile, setCasierFile] = useState<{ name: string; base64: string; size: string } | null>(null);
  const [domicileFile, setDomicileFile] = useState<{ name: string; base64: string; size: string } | null>(null);

  const [uploadSteps, setUploadSteps] = useState<{
    cni: 'idle' | 'uploading' | 'success';
    casier: 'idle' | 'uploading' | 'success';
    domicile: 'idle' | 'uploading' | 'success';
  }>({ cni: 'idle', casier: 'idle', domicile: 'idle' });

  const [dragActive, setDragActive] = useState<{ [key: string]: boolean }>({});
  const [verificationSubmitFeedback, setVerificationSubmitFeedback] = useState('');
  const [submittingVerification, setSubmittingVerification] = useState(false);
  const [viewingDocsUser, setViewingDocsUser] = useState<UserProfile | null>(null);
  const [zoomedFileUrl, setZoomedFileUrl] = useState<string | null>(null);

  // Dynamic relational cache for display names and job titles
  const [resolvedJobs, setResolvedJobs] = useState<Record<string, string>>({
    'system-0': 'Nounou Plein Temps (Cocody)',
    'system-1': 'Chauffeur Professionnel VTC',
  });
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});

  // Dynamic resolution background effect for IDs to names & titles
  useEffect(() => {
    if (apps.length === 0) return;
    const resolveMissingInfo = async () => {
      const missingJobIds = apps.filter(app => app.jobId && !resolvedJobs[app.jobId]).map(app => app.jobId);
      const missingCandIds = apps.filter(app => app.candidateId && !resolvedNames[app.candidateId]).map(app => app.candidateId);

      const newJobs = { ...resolvedJobs };
      const newNames = { ...resolvedNames };
      let updated = false;

      // Local fallback collections
      const localJobs = JSON.parse(localStorage.getItem('offline_jobs') || '[]');
      const localUsers = JSON.parse(localStorage.getItem('offline_users') || '[]');

      for (const jId of missingJobIds) {
        try {
          const isDemo = !isBackendAvailable || (user?.uid?.startsWith('demo-') ?? true);
          if (isDemo) {
            throw new Error("Client Offline Mode");
          }
          const snap = await getDoc(doc(db, 'jobs', jId));
          if (snap.exists()) {
             newJobs[jId] = (snap.data() as JobPost).title;
             updated = true;
          } else {
             throw new Error("Job not found in Appwrite");
          }
        } catch (e) {
          // Resolve from offline storage / mock fallback
          const found = localJobs.find((j: any) => j.id === jId || j.jobId === jId);
          if (found) {
            newJobs[jId] = found.title;
          } else if (jId === 'demo-0') {
            newJobs[jId] = "Nounou Plein Temps (Cocody)";
          } else {
            newJobs[jId] = "Emploi de Maison Sourcing";
          }
          updated = true;
        }
      }

      for (const cId of missingCandIds) {
        try {
          const isDemo = !isBackendAvailable || (user?.uid?.startsWith('demo-') ?? true);
          if (isDemo) {
            throw new Error("Client Offline Mode");
          }
          const snap = await getDoc(doc(db, 'users', cId));
          if (snap.exists()) {
             newNames[cId] = (snap.data() as UserProfile).displayName;
             updated = true;
          } else {
             throw new Error("User not found in Appwrite");
          }
        } catch (e) {
          // Resolve from offline storage / application metadata / mock fallback
          const foundApp = apps.find(app => app.candidateId === cId);
          const foundUser = localUsers.find((u: any) => u.uid === cId);
          
          if (foundApp && foundApp.candidateName) {
            newNames[cId] = foundApp.candidateName;
          } else if (foundUser && foundUser.displayName) {
            newNames[cId] = foundUser.displayName;
          } else if (cId === 'demo-candidate-uid-123') {
            newNames[cId] = "Marie Kouassi";
          } else {
            newNames[cId] = "Candidat de Confiance";
          }
          updated = true;
        }
      }

      if (updated) {
         setResolvedJobs(newJobs);
         setResolvedNames(newNames);
      }
    };
    resolveMissingInfo();
  }, [apps]);

  // Initialize profile form on load
  useEffect(() => {
    if (profile) {
      setEditName(profile.displayName || '');
      setEditBio(profile.bio || '');
      setEditLocation(profile.location || '');
      setEditSkills(profile.skills || []);
      setEditPhone(profile.phone || '');
      setProfileCvFile(profile.cvName ? { name: profile.cvName, content: profile.cvUrl } : null);
    }
  }, [profile]);

  const updateAppStatus = async (appId: string, newStatus: string) => {
    try {
      const isDemoMode = !isBackendAvailable || (user?.uid?.startsWith('demo-') ?? true);
      if (isDemoMode) {
        const localApps = JSON.parse(localStorage.getItem('offline_applications') || '[]');
        const idx = localApps.findIndex((a: any) => a.id === appId);
        if (idx !== -1) {
          localApps[idx].status = newStatus;
          localStorage.setItem('offline_applications', JSON.stringify(localApps));
        }
        setApps(prev => prev.map(a => a.id === appId ? { ...a, status: newStatus as any } : a));
        if (typeof (window as any).triggerSocketAction === 'function') {
          (window as any).triggerSocketAction('dashboard_action', { name: `Candidature (Démo) mise à jour vers : ${newStatus}` });
        }
        return;
      }

      const path = `applications/${appId}`;
      await setDoc(doc(db, 'applications', appId), { status: newStatus }, { merge: true });
      setApps(prev => prev.map(a => a.id === appId ? { ...a, status: newStatus as any } : a));
      if (typeof (window as any).triggerSocketAction === 'function') {
        (window as any).triggerSocketAction('dashboard_action', { name: `Candidature mise à jour vers : ${newStatus}` });
      }
    } catch (err) {
      handleAppwriteError(err, OperationType.UPDATE, `applications/${appId}`);
    }
  };

  const handleProfileCvSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        setProfileCvFile({
          name: file.name,
          content: reader.result as string
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProfileCvDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsProfileCvDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        setProfileCvFile({
          name: file.name,
          content: reader.result as string
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerProfileCvSelect = () => {
    profileFileInputRef.current?.click();
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    setUpdatingProfile(true);
    setSuccessMsg('');
    try {
      const updated: UserProfile = {
        ...profile,
        displayName: editName,
        bio: editBio,
        location: editLocation,
        skills: editSkills,
        phone: editPhone,
        cvName: profileCvFile ? profileCvFile.name : '',
        cvUrl: profileCvFile ? profileCvFile.content : '',
      };
      const isDemoMode = !isBackendAvailable || (user?.uid?.startsWith('demo-') ?? true);
      if (isDemoMode) {
        localStorage.setItem('demo_profile', JSON.stringify(updated));
        onProfileUpdate(updated);
        setSuccessMsg('Votre profil (Démo) a été mis à jour de manière sécurisée !');
        setTimeout(() => setSuccessMsg(''), 4000);
        return;
      }
      await setDoc(doc(db, 'users', user.uid), updated);
      onProfileUpdate(updated);
      setSuccessMsg('Votre profil a été mis à jour de manière sécurisée !');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      handleAppwriteError(err, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    setIsSubmittingID(true);
    setVerificationFeedback('');
    try {
      // Simulate ID verification submission by setting a flag in Appwrite
      const updated: UserProfile = {
        ...profile,
        isVerified: false, // will require admin verification
        bio: (profile.bio || '') + `\n[ID Soumise pour CNI/Passeport: N° ${idNumber}]`
      };
      const isDemoMode = !isBackendAvailable || (user?.uid?.startsWith('demo-') ?? true);
      if (isDemoMode) {
        localStorage.setItem('demo_profile', JSON.stringify(updated));
        onProfileUpdate(updated);
        setVerificationFeedback('Votre demande de certification (Démo) a été transmise aux administrateurs !');
        setIdNumber('');
        return;
      }
      await setDoc(doc(db, 'users', user.uid), updated);
      onProfileUpdate(updated);
      setVerificationFeedback('Votre demande de certification a été transmise aux administrateurs avec succès !');
      setIdNumber('');
    } catch (err) {
      handleAppwriteError(err, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setIsSubmittingID(false);
    }
  };

  // Real Drag & Drop Document Processor Functions
  const handleDrag = (e: React.DragEvent, type: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(prev => ({ ...prev, [type]: true }));
    } else if (e.type === "dragleave") {
      setDragActive(prev => ({ ...prev, [type]: false }));
    }
  };

  const processSelectedFile = async (file: File, type: 'cni' | 'casier' | 'domicile') => {
    setUploadSteps(prev => ({ ...prev, [type]: 'uploading' }));
    
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const sizeStr = (file.size / (1024 * 1024)).toFixed(2) + " MB";
      
      setTimeout(() => {
        const fileData = { name: file.name, base64, size: sizeStr };
        if (type === 'cni') setCniFile(fileData);
        if (type === 'casier') setCasierFile(fileData);
        if (type === 'domicile') setDomicileFile(fileData);
        
        setUploadSteps(prev => ({ ...prev, [type]: 'success' }));
      }, 1000);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = async (e: React.DragEvent, type: 'cni' | 'casier' | 'domicile') => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(prev => ({ ...prev, [type]: false }));
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      await processSelectedFile(file, type);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'cni' | 'casier' | 'domicile') => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      await processSelectedFile(file, type);
    }
  };

  const removeUploadedFile = (type: 'cni' | 'casier' | 'domicile') => {
    if (type === 'cni') setCniFile(null);
    if (type === 'casier') setCasierFile(null);
    if (type === 'domicile') setDomicileFile(null);
    setUploadSteps(prev => ({ ...prev, [type]: 'idle' }));
  };

  const submitDocumentsForVerification = async () => {
    if (!profile || !user) return;
    if (!cniFile) {
      setVerificationSubmitFeedback('La pièce d’identité (CNI ou Passeport) est obligatoire pour valider la demande.');
      return;
    }
    setSubmittingVerification(true);
    setVerificationSubmitFeedback('');

    try {
      const docsToSave: any[] = [];
      if (cniFile) {
        docsToSave.push({
          name: cniFile.name,
          type: 'cni_passport',
          status: 'pending',
          uploadedAt: new Date().toISOString(),
          url: cniFile.base64
        });
      }
      if (casierFile) {
        docsToSave.push({
          name: casierFile.name,
          type: 'casier_judiciaire',
          status: 'pending',
          uploadedAt: new Date().toISOString(),
          url: casierFile.base64
        });
      }
      if (domicileFile) {
        docsToSave.push({
          name: domicileFile.name,
          type: 'justificatif_domicile',
          status: 'pending',
          uploadedAt: new Date().toISOString(),
          url: domicileFile.base64
        });
      }

      // Merge verified state / fields
      const updatedProfile = {
        ...profile,
        verificationDocs: docsToSave,
        isVerified: false
      };

      await setDoc(doc(db, 'users', user.uid), updatedProfile, { merge: true });
      onProfileUpdate(updatedProfile);
      setVerificationSubmitFeedback('Vos documents ont été transmis avec succès et sont en cours d’examen par l’équipe d’administration d’IvoireSource !');
    } catch (err) {
      console.error(err);
      setVerificationSubmitFeedback('Erreur lors de la transmission de vos pièces. Veuillez réessayer.');
    } finally {
      setSubmittingVerification(false);
    }
  };

  // ADMIN CONTROLS: Approve specific identity document
  const approveIndividualDoc = async (docType: string) => {
    if (!viewingDocsUser) return;
    try {
      const updatedDocs = (viewingDocsUser.verificationDocs || []).map(d =>
        d.type === docType ? { ...d, status: 'approved' as const } : d
      );
      const updatedUser = { ...viewingDocsUser, verificationDocs: updatedDocs };
      setViewingDocsUser(updatedUser);
      await setDoc(doc(db, 'users', viewingDocsUser.uid), { verificationDocs: updatedDocs }, { merge: true });
      setAllUsers(prev => prev.map(u => u.uid === viewingDocsUser.uid ? { ...u, verificationDocs: updatedDocs } : u));
      if (typeof (window as any).triggerSocketAction === 'function') {
        (window as any).triggerSocketAction('certificate_approved', { userId: viewingDocsUser.uid });
      }
    } catch (err) {
      handleAppwriteError(err, OperationType.UPDATE, `users/${viewingDocsUser.uid}`);
    }
  };

  // ADMIN CONTROLS: Reject specific identity document
  const rejectIndividualDoc = async (docType: string) => {
    if (!viewingDocsUser) return;
    try {
      const updatedDocs = (viewingDocsUser.verificationDocs || []).map(d =>
        d.type === docType ? { ...d, status: 'rejected' as const } : d
      );
      const updatedUser = { ...viewingDocsUser, verificationDocs: updatedDocs };
      setViewingDocsUser(updatedUser);
      await setDoc(doc(db, 'users', viewingDocsUser.uid), { verificationDocs: updatedDocs }, { merge: true });
      setAllUsers(prev => prev.map(u => u.uid === viewingDocsUser.uid ? { ...u, verificationDocs: updatedDocs } : u));
    } catch (err) {
      handleAppwriteError(err, OperationType.UPDATE, `users/${viewingDocsUser.uid}`);
    }
  };

  // ADMIN CONTROLS: Change user role in-review
  const changeUserRoleInReview = async (newRole: UserRole) => {
    if (!viewingDocsUser) return;
    try {
      const updatedUser = { ...viewingDocsUser, role: newRole };
      setViewingDocsUser(updatedUser);
      await setDoc(doc(db, 'users', viewingDocsUser.uid), { role: newRole }, { merge: true });
      setAllUsers(prev => prev.map(u => u.uid === viewingDocsUser.uid ? { ...u, role: newRole } : u));
    } catch (err) {
      handleAppwriteError(err, OperationType.UPDATE, `users/${viewingDocsUser.uid}`);
    }
  };

  // ADMIN CONTROLS: Toggle User Certification
  const toggleUserVerification = async (targetUser: UserProfile) => {
    try {
      const nextStatus = !targetUser.isVerified;
      await setDoc(doc(db, 'users', targetUser.uid), { isVerified: nextStatus }, { merge: true });
      setAllUsers(prev => prev.map(u => u.uid === targetUser.uid ? { ...u, isVerified: nextStatus } : u));
      if (nextStatus && typeof (window as any).triggerSocketAction === 'function') {
        (window as any).triggerSocketAction('candidate_certified', { userId: targetUser.uid });
      }
    } catch (err) {
      handleAppwriteError(err, OperationType.UPDATE, `users/${targetUser.uid}`);
    }
  };

  // ADMIN CONTROLS: Toggle User Premium Badging
  const toggleUserPremium = async (targetUser: UserProfile) => {
    try {
      const nextPremium = !targetUser.isPremium;
      await setDoc(doc(db, 'users', targetUser.uid), { isPremium: nextPremium }, { merge: true });
      setAllUsers(prev => prev.map(u => u.uid === targetUser.uid ? { ...u, isPremium: nextPremium } : u));
      if (nextPremium && typeof (window as any).triggerSocketAction === 'function') {
        (window as any).triggerSocketAction('premium_payment_success', { userId: targetUser.uid });
      }
    } catch (err) {
      handleAppwriteError(err, OperationType.UPDATE, `users/${targetUser.uid}`);
    }
  };

  // ADMIN CONTROLS: Moderate Job Post (Approve/Reject)
  const updateJobStatus = async (jobId: string, newStatus: 'approved' | 'rejected' | 'closed') => {
    const isDemoMode = !isBackendAvailable || (user?.uid?.startsWith('demo-') ?? true);
    try {
      if (isDemoMode) {
        const localJobs = JSON.parse(localStorage.getItem('offline_jobs') || '[]');
        const idx = localJobs.findIndex((j: any) => j.id === jobId);
        if (idx !== -1) {
          localJobs[idx].status = newStatus;
          localStorage.setItem('offline_jobs', JSON.stringify(localJobs));
        }
        setMyJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j));
        showNotification(`Le statut de l'offre a été mis à jour vers "${newStatus === 'approved' ? 'Approuvée' : 'Rejetée'}" (Démo)`, "success");
        return;
      }

      await setDoc(doc(db, 'jobs', jobId), { status: newStatus }, { merge: true });
      setMyJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j));
      showNotification(`Le statut de l'offre d'emploi a été mis à jour avec succès !`, "success");
      if (newStatus === 'approved' && typeof (window as any).triggerSocketAction === 'function') {
        (window as any).triggerSocketAction('job_moderation_approved', { title: 'Annonce Modérée' });
      } else if (newStatus === 'rejected' && typeof (window as any).triggerSocketAction === 'function') {
        (window as any).triggerSocketAction('job_moderation_rejected', { title: 'Annonce Modérée', reason: 'Non conforme' });
      }
    } catch (err) {
      handleAppwriteError(err, OperationType.UPDATE, `jobs/${jobId}`);
    }
  };

  // Helper to trigger toast alerts
  const showNotification = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    if (typeof (window as any).addToast === 'function') {
      (window as any).addToast(message, type);
    } else {
      console.log(`[Notification] ${type.toUpperCase()}: ${message}`);
    }
  };

  // ADMIN CONTROLS: Delete/Dismiss Job Post
  const deleteJobAction = async (jobId: string) => {
    setConfirmation({
      title: "Supprimer l'offre",
      message: "Êtes-vous sûr de vouloir supprimer cette annonce définitivement ?",
      onConfirm: async () => {
        const isDemoMode = !isBackendAvailable || (user?.uid?.startsWith('demo-') ?? true);
        try {
          if (isDemoMode) {
            const localJobs = JSON.parse(localStorage.getItem('offline_jobs') || '[]');
            const updatedJobs = localJobs.filter((j: any) => j.id !== jobId);
            localStorage.setItem('offline_jobs', JSON.stringify(updatedJobs));
            setMyJobs(prev => prev.filter(j => j.id !== jobId));
            showNotification("L'annonce d'emploi a été supprimée avec succès (Démo) !", "success");
            setConfirmation(null);
            return;
          }

          await deleteDoc(doc(db, 'jobs', jobId));
          setMyJobs(prev => prev.filter(j => j.id !== jobId));
          showNotification("L'offre d'emploi a été supprimée avec succès.", "success");
          setConfirmation(null);
        } catch (err) {
          showNotification("Attribution insuffisante ou erreur lors de la suppression de l'offre.", "error");
          handleAppwriteError(err, OperationType.DELETE, `jobs/${jobId}`);
        }
      }
    });
  };

  // ADMIN CONTROLS: Delete application record
  const deleteApplicationAction = async (appId: string) => {
    setConfirmation({
      title: "Supprimer la candidature",
      message: "Êtes-vous sûr de vouloir supprimer cette candidature de la plateforme ?",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'applications', appId));
          setApps(prev => prev.filter(a => a.id !== appId));
          showNotification("La candidature a été supprimée avec succès.", "success");
        } catch (err) {
          showNotification("Attribution insuffisante ou erreur lors de la suppression de la candidature.", "error");
          handleAppwriteError(err, OperationType.DELETE, `applications/${appId}`);
        }
      }
    });
  };

  // ADMIN CONTROLS: Delete User Profile
  const deleteUserAction = async (targetUid: string) => {
    setConfirmation({
      title: "Supprimer le membre",
      message: "Êtes-vous sûr de vouloir supprimer ce membre de la plateforme définitivement ?",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'users', targetUid));
          setAllUsers(prev => prev.filter(u => u.uid !== targetUid));
          showNotification("Le compte utilisateur a été supprimé avec succès.", "success");
        } catch (err) {
          showNotification("Attribution insuffisante ou erreur lors de la suppression de l'utilisateur.", "error");
          handleAppwriteError(err, OperationType.DELETE, `users/${targetUid}`);
        }
      }
    });
  };

  // ADMIN CONTROLS: Create User Profile
  const handleAdminCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUserForm.displayName || !adminUserForm.email) {
      alert("Veuillez remplir le nom et l'email !");
      return;
    }
    try {
      const fakeUid = 'admin-user-' + Math.random().toString(36).substring(2, 11);
      const newUserDoc: UserProfile = {
        uid: fakeUid,
        displayName: adminUserForm.displayName,
        email: adminUserForm.email,
        role: adminUserForm.role,
        isVerified: adminUserForm.isVerified,
        isPremium: adminUserForm.isPremium,
        bio: adminUserForm.bio || '',
        location: adminUserForm.location || '',
        skills: [],
        averageRating: 0,
        reviewCount: 0,
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'users', fakeUid), newUserDoc);
      setAllUsers(prev => [newUserDoc, ...prev]);
      setAdminUserForm({ displayName: '', email: '', role: 'candidate', isVerified: false, isPremium: false, bio: '', location: '' });
      setIsAdminCreatingUser(false);
      alert("Membre créé avec succès !");
    } catch (err) {
      handleAppwriteError(err, OperationType.CREATE, 'users');
    }
  };

  // ADMIN CONTROLS: Create Job Post
  const handleAdminCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminJobForm.title || !adminJobForm.salaryRange) {
      alert("Veuillez remplir le titre et la rémunération !");
      return;
    }
    try {
      const fakeJobId = 'admin-job-' + Math.random().toString(36).substring(2, 11);
      const newJobDoc: JobPost & { id: string } = {
        id: fakeJobId,
        employerId: adminJobForm.employerId || 'system',
        title: adminJobForm.title,
        description: adminJobForm.description,
        category: adminJobForm.category as any,
        location: adminJobForm.location,
        salaryRange: adminJobForm.salaryRange,
        status: 'approved',
        isPremium: adminJobForm.isPremium,
        createdAt: new Date().toISOString()
      };
      const { id, ...saveData } = newJobDoc;
      await setDoc(doc(db, 'jobs', fakeJobId), saveData);
      setMyJobs(prev => [newJobDoc, ...prev]);
      setAdminJobForm({ title: '', category: 'nounou', location: 'Abidjan', salaryRange: '', description: '', isPremium: false, employerId: 'system' });
      setIsAdminCreatingJob(false);
      alert("Offre d'emploi créée avec succès !");
    } catch (err) {
      handleAppwriteError(err, OperationType.CREATE, 'jobs');
    }
  };

  const handleOpenManageJob = (job: JobPost) => {
    setSelectedManageJob(job);
    setIsEditingJob(false);
    setEditJobForm({
      title: job.title || '',
      category: job.category || 'nounou',
      location: job.location || '',
      salaryRange: job.salaryRange || '',
      description: job.description || '',
    });
  };

  const handleUpdateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedManageJob || !user) return;
    try {
      const isDemoMode = !isBackendAvailable || (user?.uid?.startsWith('demo-') ?? true);
      const updatedJob: JobPost = {
        ...selectedManageJob,
        title: editJobForm.title,
        category: editJobForm.category as any,
        location: editJobForm.location,
        salaryRange: editJobForm.salaryRange,
        description: editJobForm.description,
      };

      if (isDemoMode) {
        const localJobs = JSON.parse(localStorage.getItem('offline_jobs') || '[]');
        const idx = localJobs.findIndex((j: any) => j.id === selectedManageJob.id);
        if (idx !== -1) {
          localJobs[idx] = updatedJob;
          localStorage.setItem('offline_jobs', JSON.stringify(localJobs));
        }
        setMyJobs(prev => prev.map(j => j.id === selectedManageJob.id ? updatedJob : j));
        setSelectedManageJob(null);
        setIsEditingJob(false);
        showNotification("L'annonce d'emploi (Démo) a été modifiée avec succès !", "success");
        return;
      }

      await setDoc(doc(db, 'jobs', selectedManageJob.id), updatedJob);
      setMyJobs(prev => prev.map(j => j.id === selectedManageJob.id ? updatedJob : j));
      setSelectedManageJob(null);
      setIsEditingJob(false);
      showNotification("L'annonce d'emploi a été modifiée avec succès !", "success");
    } catch (err) {
      showNotification("Erreur lors de la modification de l'annonce d'emploi.", "error");
      handleAppwriteError(err, OperationType.UPDATE, `jobs/${selectedManageJob.id}`);
    }
  };

  useEffect(() => {
    if (!user) return;
    const checkProfile = async () => {
      if (!profile) {
        try {
          const docRef = doc(db, 'users', user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const parsed = docSnap.data() as UserProfile;
            onProfileUpdate(parsed);
            localStorage.setItem(`profile_${user.uid}`, JSON.stringify(parsed));
          }
        } catch (err) {
          console.warn("Delayed profile fetch failed or offline, accessing caching:", err);
          const cached = localStorage.getItem(`profile_${user.uid}`);
          if (cached) {
            onProfileUpdate(JSON.parse(cached));
          }
        }
      }
    };
    checkProfile();
  }, [user, profile]);

  useEffect(() => {
    if (!user || !profile) return;
    
    const fetchData = async () => {
      setLoadingData(true);
      const isDemoMode = !isBackendAvailable || (user?.uid?.startsWith('demo-') ?? true);
      try {
        if (isDemoMode) {
          throw new Error("Local Demo Mode Active");
        }

        if (profile.role === 'admin') {
          const qUsers = query(collection(db, 'users'), limit(100));
          const snapUsers = await getDocs(qUsers);
          setAllUsers(snapUsers.docs.map(d => d.data() as UserProfile));

          const qJobs = query(collection(db, 'jobs'), limit(100));
          const snapJobs = await getDocs(qJobs);
          setMyJobs(snapJobs.docs.map(d => ({ id: d.id, ...d.data() } as JobPost)));

          const qApps = query(collection(db, 'applications'), limit(100));
          const snapApps = await getDocs(qApps);
          setApps(snapApps.docs.map(d => ({ id: d.id, ...d.data() } as Application)));
        }

        if (profile.role === 'employer' && activeTab === 'browse-candidates') {
          const qCand = query(collection(db, 'users'), where('role', '==', 'candidate'), limit(50));
          const snapCand = await getDocs(qCand);
          setCandidates(snapCand.docs.map(d => d.data() as UserProfile));
        }

        if (profile.role === 'employer') {
          const qJobs = query(collection(db, 'jobs'), where('employerId', '==', user.uid));
          const snapJobs = await getDocs(qJobs);
          setMyJobs(snapJobs.docs.map(d => ({ id: d.id, ...d.data() } as JobPost)));

          const qApps = query(collection(db, 'applications'), where('employerId', '==', user.uid));
          const snapApps = await getDocs(qApps);
          setApps(snapApps.docs.map(d => ({ id: d.id, ...d.data() } as Application)));

          const qUnlocks = query(collection(db, 'unlocks'), where('employerId', '==', user.uid));
          const snapUnlocks = await getDocs(qUnlocks);
          setUnlockedCandidateIds(snapUnlocks.docs.map(doc => doc.data().candidateId as string));
        }
        
        if (profile.role === 'candidate') {
          const qApps = query(collection(db, 'applications'), where('candidateId', '==', user.uid));
          const snapApps = await getDocs(qApps);
          setApps(snapApps.docs.map(d => ({ id: d.id, ...d.data() } as Application)));
        }
      } catch (err) {
        console.log("[DASHBOARD] Fetching offline/simulated simulation data", err);
        // Populating offline/simulated local data based on role
        if (profile.role === 'admin') {
          setAllUsers([
            {
              uid: 'demo-candidate-uid-123',
              role: 'candidate',
              displayName: 'Marie Kouassi',
              email: 'marie.k@gmail.com',
              photoURL: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=200&auto=format&fit=crop',
              skills: ["Garde d'enfants", "Cuisine africaine", "Ménage"],
              isVerified: true,
              isPremium: false,
              averageRating: 4.8,
              reviewCount: 3,
              createdAt: new Date().toISOString()
            },
            {
              uid: 'demo-employer-uid-456',
              role: 'employer',
              displayName: 'Société Ivoire Prestige',
              email: 'employer@ivoiresource.ci',
              photoURL: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=200&auto=format&fit=crop',
              skills: [],
              isVerified: true,
              isPremium: true,
              averageRating: 0,
              reviewCount: 0,
              createdAt: new Date().toISOString()
            }
          ]);
          
          const localJobs = JSON.parse(localStorage.getItem('offline_jobs') || '[]');
          const defaultDemoJobs = [
            {
              id: 'demo-0',
              employerId: 'system',
              title: 'Nounou Plein Temps (Cocody)',
              description: 'Recherche nounou expérimentée pour garde de deux jumeaux de 2 ans. Références exigées.',
              category: 'nounou',
              location: 'Abidjan',
              salaryRange: '120 000 FCFA',
              status: 'approved',
              isPremium: true,
              createdAt: new Date().toISOString()
            }
          ];
          setMyJobs(localJobs.length > 0 ? localJobs : defaultDemoJobs);

          const localApps = JSON.parse(localStorage.getItem('offline_applications') || '[]');
          const defaultDemoApps = [
            {
              id: 'local-app-1',
              jobId: 'demo-0',
              employerId: 'system',
              candidateId: 'demo-candidate-uid-123',
              status: 'pending',
              message: "Bonjour, j'ai 3 ans d'expérience dans la garde de très jeunes enfants et d'entretien de maison.",
              candidateName: 'Marie Kouassi',
              photoURL: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=200&auto=format&fit=crop',
              experienceYears: 3,
              cvName: 'Mon_CV.pdf',
              cvUrl: '#',
              createdAt: new Date().toISOString()
            }
          ];
          setApps(localApps.length > 0 ? localApps : defaultDemoApps);
        }

        if (profile.role === 'employer') {
          setCandidates([
            {
              uid: 'demo-candidate-uid-123',
              role: 'candidate',
              displayName: 'Marie Kouassi',
              email: 'marie.k@gmail.com',
              photoURL: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=200&auto=format&fit=crop',
              skills: ["Garde d'enfants", "Cuisine africaine", "Ménage familial"],
              isVerified: true,
              isPremium: false,
              averageRating: 4.8,
              reviewCount: 3,
              createdAt: new Date().toISOString(),
              verificationDocs: [
                { name: 'CNI_Marie_Kouassi.pdf', type: 'cni_passport', status: 'approved', uploadedAt: new Date().toISOString() }
              ]
            }
          ]);

          const localJobs = JSON.parse(localStorage.getItem('offline_jobs') || '[]');
          setMyJobs(localJobs.filter((j: any) => j.employerId === user.uid));

          const localApps = JSON.parse(localStorage.getItem('offline_applications') || '[]');
          setApps(localApps.filter((a: any) => a.employerId === user.uid));
          setUnlockedCandidateIds(['demo-candidate-uid-123']);
        }

        if (profile.role === 'candidate') {
          const localApps = JSON.parse(localStorage.getItem('offline_applications') || '[]');
          setApps(localApps.filter((a: any) => a.candidateId === user.uid));
        }
      } finally {
        setLoadingData(false);
      }
    };

    fetchData();
  }, [user, profile, activeTab]);

  const viewCandidate = async (candidateId: string, app?: Application) => {
    try {
      const isDemo = !isBackendAvailable || (user?.uid?.startsWith('demo-') ?? true);
      if (isDemo) {
        throw new Error("Client Offline Mode");
      }
      const snap = await getDoc(doc(db, 'users', candidateId));
      let candidateData: UserProfile;
      if (snap.exists()) {
        candidateData = snap.data() as UserProfile;
      } else {
        throw new Error("Candidate document not found");
      }
      setSelectedCandidate(candidateData);
      setSelectedApplication(app || null);
    } catch (err) {
      console.warn("Could not retrieve candidate document from real Appwrite, using local fallback profile:", err);
      // Fallback profile using application context or localstorage users
      const localUsers = JSON.parse(localStorage.getItem('offline_users') || '[]');
      const foundUser = localUsers.find((u: any) => u.uid === candidateId);
      
      const candidateData: UserProfile = {
        uid: candidateId,
        role: 'candidate',
        displayName: foundUser?.displayName || app?.candidateName || `Candidat ${candidateId.substring(0, 6)}...`,
        email: foundUser?.email || '',
        photoURL: foundUser?.photoURL || app?.photoURL || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop',
        skills: foundUser?.skills || ["Garde d'enfants", "Ménage", "Cuisine"],
        isVerified: foundUser?.isVerified ?? true,
        isPremium: foundUser?.isPremium ?? false,
        averageRating: foundUser?.averageRating || 4.8,
        reviewCount: foundUser?.reviewCount || 2,
        createdAt: foundUser?.createdAt || new Date().toISOString()
      };
      setSelectedCandidate(candidateData);
      setSelectedApplication(app || null);
    }
    
    // Clear checkout state
    setPhoneNumber('');
    setPaymentError('');
    setPaymentStatusMessage('');
    
    // Direct candidates are free, and jobs applications which are already accepted/approved are also free to email
    const isCandidateFree = profile?.role !== 'employer' || profile?.isPremium || unlockedCandidateIds.includes(candidateId) || (app && (app.status === 'accepted' || app.status === 'approved'));
    setCheckoutStep(isCandidateFree ? 'details' : 'plans');
  };

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
      ? `Déblocage Candidat Certifié: ${selectedCandidate?.displayName}`
      : 'Abonnement Mensuel Illimité - IvoireSource';

    const cleanPhone = phoneNumber ? phoneNumber.trim().replace(/\s+/g, '') : '0700000000';
    const emailVal = profile?.email || user?.email || 'employeur@ivoiresource.ci';
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
        paiementPro.countryCurrencyCode = '952'; // Code devise FCFA
        
        // Wait for SDK to contact the webservice API and generate the URL
        await paiementPro.getUrlPayment();
        
        if (paiementPro.success && paiementPro.url) {
          setPaymentStatusMessage('Redirection vers la passerelle partenaire officielle...');
          // Save a persistent unlock or state record in Appwrite first before redirecting so they have access
          if (user && selectedCandidate) {
            try {
              if (chosenPlan === 'one-time') {
                const unlockId = `${user.uid}_${selectedCandidate.uid}`;
                await setDoc(doc(db, 'unlocks', unlockId), {
                  id: unlockId,
                  employerId: user.uid,
                  candidateId: selectedCandidate.uid,
                  createdAt: new Date().toISOString()
                });
                setUnlockedCandidateIds(prev => [...prev, selectedCandidate.uid]);
              } else if (chosenPlan === 'monthly') {
                await setDoc(doc(db, 'users', user.uid), {
                  isPremium: true
                }, { merge: true });
                onProfileUpdate({
                  ...profile,
                  isPremium: true
                });
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
      if (user && selectedCandidate) {
        try {
          if (chosenPlan === 'one-time') {
            const unlockId = `${user.uid}_${selectedCandidate.uid}`;
            await setDoc(doc(db, 'unlocks', unlockId), {
              id: unlockId,
              employerId: user.uid,
              candidateId: selectedCandidate.uid,
              createdAt: new Date().toISOString()
            });
            setUnlockedCandidateIds(prev => [...prev, selectedCandidate.uid]);
          } else if (chosenPlan === 'monthly') {
            await setDoc(doc(db, 'users', user.uid), {
              isPremium: true
            }, { merge: true });
            onProfileUpdate({
              ...profile,
              isPremium: true
            });
          }
        } catch (error) {
          console.error("Failed to persist real unlock/subscription record:", error);
        }
      }
      setCheckoutStep('success');
    }, 4500);
  };

  if (!user) return null;

  if (!profile) return (
    <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
       <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-emerald-600 mb-4"></div>
       <p className="text-slate-500 font-medium">Chargement de votre profil...</p>
       <button onClick={() => window.location.reload()} className="mt-4 text-emerald-600 font-bold text-sm">Actualiser la page</button>
    </div>
  );

  const menuItems = [
    { id: 'overview', label: "Aperçu", icon: <LayoutDashboard className="h-4 w-4" />, roles: ['candidate', 'employer', 'admin'] },
    { id: 'profile', label: "Mon Profil", icon: <UserIcon className="h-4 w-4" />, roles: ['candidate', 'employer', 'admin'] },
    { id: 'browse-candidates', label: "Trouver du personnel", icon: <Users className="h-4 w-4" />, roles: ['employer'] },
    { id: 'my-jobs', label: "Gérer mes annonces", icon: <BarChart3 className="h-4 w-4" />, roles: ['employer'] },
    { id: 'applications', label: profile.role === 'employer' ? "Candidatures reçues" : "Mes postulations", icon: <Briefcase className="h-4 w-4" />, roles: ['candidate', 'employer'] },
    { id: 'verification', label: "Certification", icon: <ShieldCheck className="h-4 w-4" />, roles: ['candidate', 'employer'] },
    { id: 'admin', label: "Système Admin", icon: <Settings className="h-4 w-4" />, roles: ['admin'] },
  ];

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-50 relative group/dashboard">
      {/* Sidebar Overlay (Mobile Only) */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[55] md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Persistent Sidebar */}
      <motion.aside 
        className={`fixed inset-y-0 left-0 z-[60] w-72 bg-white border-r border-slate-200 flex flex-col transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="p-8 border-b border-slate-50 flex items-center justify-between shrink-0">
           <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('landing')}>
              <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-emerald-200">I</div>
              <span className="text-xl font-bold tracking-tight text-slate-800">Ivoire<span className="text-emerald-600">Source</span></span>
           </div>
           <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 bg-slate-50 rounded-full text-slate-400"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 p-4 space-y-2 overflow-y-auto mt-4">
          <p className="px-4 text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mb-4">Naviguez</p>
          {menuItems.filter(item => item.roles.includes(profile.role)).map(item => (
            <button 
              key={item.id}
              onClick={() => { setActiveTab(item.id as any); setIsSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-bold transition-all ${activeTab === item.id ? 'bg-slate-900 text-white shadow-xl shadow-slate-200' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <div className={`p-2 rounded-lg ${activeTab === item.id ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-white'}`}>
                {item.icon}
              </div>
              {item.label}
            </button>
          ))}
        </div>

        <div className="p-6 mt-auto border-t border-slate-50">
           <div className="bg-slate-50 p-4 rounded-2xl flex items-center gap-3 mb-6 border border-slate-100">
              <img src={profile.photoURL || 'https://via.placeholder.com/40'} className="h-10 w-10 rounded-full border-2 border-white shadow-sm" />
              <div className="min-w-0">
                 <p className="font-bold text-slate-800 truncate text-xs">{profile.displayName}</p>
                 <p className="text-[9px] text-emerald-600 font-black uppercase tracking-widest">{profile.role}</p>
              </div>
           </div>
           
           <div className="flex flex-col gap-2">
              <button onClick={() => signOut(auth)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold text-red-500 hover:bg-red-50 transition-all">
                <LogOut className="h-4 w-4" /> Déconnexion
              </button>
           </div>
        </div>
      </motion.aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Dashboard Top bar */}
        <header className="h-20 bg-white border-b border-slate-50 flex items-center justify-between px-6 md:px-10 shrink-0">
           <div className="flex items-center gap-4">
              <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2.5 bg-slate-50 rounded-xl text-slate-600"><Menu className="h-5 w-5" /></button>
              <div className="flex flex-col">
                 <h1 className="text-lg font-black text-slate-900 tracking-tight">{menuItems.find(m => m.id === activeTab)?.label}</h1>
                 <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
              </div>
           </div>
           
           <div className="flex items-center gap-4">
              {profile.role === 'employer' && (
                <button onClick={() => setView('post-job')} className="hidden sm:flex bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all gap-2 items-center shadow-lg shadow-emerald-100">
                   <PlusCircle className="h-4 w-4" /> Nouvelle offre
                </button>
              )}
              {false && (
               <button onClick={() => {}} className="flex items-center gap-2 text-[10px] bg-amber-500 text-slate-950 px-3 py-2 rounded-xl font-bold hover:bg-amber-400 transition-all uppercase tracking-widest shadow-md">
                  {/* Bouton de promotion supprimé par mesure de sécurité */}
               </button>
              )}
           </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 md:p-10">
           {activeTab === 'overview' && (
             <div className="space-y-8 max-w-6xl">
                {profile.role === 'admin' ? (
                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 animate-fade-in">
                      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
                         <div className="absolute -right-4 -top-4 w-20 h-20 bg-amber-50 rounded-full transition-transform group-hover:scale-125"></div>
                         <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.15em] mb-4 relative z-10 font-sans">Membres inscrits</p>
                         <h3 className="text-3xl font-black text-slate-900 relative z-10 font-sans">{allUsers.length}</h3>
                         <p className="text-[10px] text-slate-400 mt-2 font-medium">Candidats & Recruteurs</p>
                      </div>

                      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
                         <div className="absolute -right-4 -top-4 w-20 h-20 bg-emerald-50 rounded-full transition-transform group-hover:scale-125"></div>
                         <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.15em] mb-4 relative z-10 font-sans">Offres en ligne</p>
                         <h3 className="text-3xl font-black text-slate-900 relative z-10 font-sans">{myJobs.length}</h3>
                         <p className="text-[10px] text-slate-400 mt-2 font-medium">Annonces actives</p>
                      </div>

                      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
                         <div className="absolute -right-4 -top-4 w-20 h-20 bg-blue-50 rounded-full transition-transform group-hover:scale-125"></div>
                         <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.15em] mb-4 relative z-10 font-sans">Candidatures</p>
                         <h3 className="text-3xl font-black text-slate-900 relative z-10 font-sans">{apps.length}</h3>
                         <p className="text-[10px] text-slate-400 mt-2 font-medium">Mises en relation</p>
                      </div>

                      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
                         <div className="absolute -right-4 -top-4 w-20 h-20 bg-purple-50 rounded-full transition-transform group-hover:scale-125"></div>
                         <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.15em] mb-4 relative z-10 font-sans">Console système</p>
                         <div className="flex items-center gap-2 relative z-10">
                            <h3 className="text-lg font-black text-purple-600">ACTIVE</h3>
                            <CheckCircle2 className="h-4 w-4 text-purple-600" />
                          </div>
                          <p className="text-[10px] text-slate-400 mt-2 font-medium">Privilèges Administrateur</p>
                       </div>
                    </div>
                ) : (
                   <>
                {/* Original Statistics Grid */}
                {/* Statistics Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                   <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
                      <div className="absolute -right-4 -top-4 w-20 h-20 bg-emerald-50 rounded-full transition-transform group-hover:scale-125"></div>
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.15em] mb-4 relative z-10">Status profil</p>
                      <div className="flex items-center gap-2 relative z-10">
                         <h3 className={`text-xl font-black ${profile.isVerified ? 'text-emerald-600' : 'text-amber-500'}`}>{profile.isVerified ? 'CERTIFIÉ' : 'EN ATTENTE'}</h3>
                         {profile.isVerified ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Clock className="h-5 w-5 text-amber-500" />}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2 font-medium">Validé par IvoireSource</p>
                   </div>

                   <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
                      <div className="absolute -right-4 -top-4 w-20 h-20 bg-blue-50 rounded-full transition-transform group-hover:scale-125"></div>
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.15em] mb-4 relative z-10">{profile.role === 'candidate' ? 'Postulations' : 'Annonces'}</p>
                      <h3 className="text-3xl font-black text-slate-900 relative z-10">{profile.role === 'candidate' ? apps.length : myJobs.length}</h3>
                      <p className="text-[10px] text-slate-400 mt-2 font-medium">Activité totale</p>
                   </div>

                   <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
                      <div className="absolute -right-4 -top-4 w-20 h-20 bg-amber-50 rounded-full transition-transform group-hover:scale-125"></div>
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.15em] mb-4 relative z-10">Score Confiance</p>
                      <div className="flex items-center gap-1.5 relative z-10">
                        <h3 className="text-3xl font-black text-slate-900">{profile.averageRating || '4.8'}</h3>
                        <Star className="h-5 w-5 text-amber-400 fill-amber-400" />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2 font-medium">Basé sur {profile.reviewCount || 0} avis</p>
                   </div>

                   <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
                      <div className="absolute -right-4 -top-4 w-20 h-20 bg-purple-50 rounded-full transition-transform group-hover:scale-125"></div>
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.15em] mb-4 relative z-10">Nouveautés</p>
                      <h3 className="text-3xl font-black text-slate-900">
                        {apps.filter(a => a.status === 'pending').length}
                      </h3>
                      <p className="text-[10px] text-slate-400 mt-2 font-medium">Événements à traiter</p>
                   </div>
                </div>

                   </>
                )}

                {/* Dashboard Panels */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                   <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
                      <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                         <h3 className="font-bold text-slate-800 tracking-tight">Activités récentes</h3>
                         <button className="text-[10px] font-black text-emerald-600 uppercase tracking-widest hover:translate-x-1 transition-transform inline-flex items-center gap-1 cursor-pointer" onClick={() => setActiveTab('applications')}>Tout voir <ChevronRight className="h-3 w-3" /></button>
                      </div>
                      <div className="p-8 space-y-6">
                         {apps.length === 0 ? (
                           <div className="text-center py-12 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
                              <Search className="h-8 w-8 text-slate-200 mx-auto mb-3" />
                              <p className="text-xs text-slate-400 font-medium">Aucun mouvement récent détecté.</p>
                           </div>
                         ) : (
                           apps.slice(0, 4).map(app => (
                             <div key={app.id} className="flex gap-4 group/item">
                                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover/item:scale-110 ${app.status === 'approved' ? 'bg-emerald-50 text-emerald-600' : app.status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                                   {app.status === 'approved' ? <CheckCircle2 className="h-5 w-5" /> : app.status === 'rejected' ? <X className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                   <div className="flex justify-between items-start mb-1">
                                      <p 
                                        className={`text-sm font-bold text-slate-800 truncate ${profile?.role === 'employer' ? 'cursor-pointer hover:text-emerald-600 hover:underline' : ''}`}
                                        onClick={() => {
                                          if (profile?.role === 'employer') {
                                            viewCandidate(app.candidateId, app);
                                          }
                                        }}
                                      >
                                         {profile.role === 'candidate' 
                                           ? (resolvedJobs[app.jobId] || `Offre ${app.jobId.substring(0,8)}...`) 
                                           : (resolvedNames[app.candidateId] || `Candidat ID: ${app.candidateId.substring(0,6)}`)}
                                      </p>
                                      <span className="text-[9px] text-slate-300 font-bold uppercase">{new Date(app.createdAt).toLocaleDateString()}</span>
                                   </div>
                                   <p className="text-xs text-slate-500 font-medium leading-relaxed">Status mis à jour vers : <span className={`font-bold capitalize ${app.status === 'approved' ? 'text-emerald-600' : 'text-amber-500'}`}>{app.status}</span></p>
                                </div>
                             </div>
                           ))
                         )}
                      </div>
                   </div>

                   <div className="flex flex-col gap-8">
                      {profile.role === 'admin' ? (
                        <div className="bg-slate-900 rounded-[32px] p-8 text-white relative overflow-hidden flex-1 shadow-2xl shadow-slate-200 group">
                           <div className="relative z-10 flex flex-col h-full animate-fade-in">
                              <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-amber-500/20">
                                 <Settings className="h-6 w-6 text-slate-950" />
                              </div>
                              <h3 className="text-2xl font-black mb-4 tracking-tight leading-tight">Vous êtes connecté en tant qu'<span className="text-amber-400 underline decoration-2 underline-offset-4">Administrateur</span>.</h3>
                              <p className="text-slate-400 text-sm leading-relaxed mb-8 max-w-sm">Gérez l'ensemble de la plateforme, examinez les candidatures globales et supervisez la plateforme.</p>
                              <button onClick={() => setActiveTab('admin')} className="mt-auto w-fit bg-amber-500 text-slate-950 font-black text-[10px] px-8 py-3 rounded-2xl transition-all hover:scale-105 active:scale-95 uppercase tracking-widest shadow-xl shadow-black/20">
                                 Ouvrir Système Admin
                              </button>
                           </div>
                           <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl group-hover:bg-amber-500/20 transition-colors"></div>
                        </div>
                      ) : (
                        <div className="bg-slate-900 rounded-[32px] p-8 text-white relative overflow-hidden flex-1 shadow-2xl shadow-slate-200 group">
                         <div className="relative z-10 flex flex-col h-full">
                            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/20">
                               <ShieldCheck className="h-6 w-6 text-white" />
                            </div>
                            <h3 className="text-2xl font-black mb-4 tracking-tight leading-tight">Optimisez votre <span className="text-emerald-400 underline decoration-2 underline-offset-4">Crédibilité</span>.</h3>
                            <p className="text-slate-400 text-sm leading-relaxed mb-8 max-w-sm">Les profils certifiés reçoivent 3x plus d'offres et d'intérêt de la part des recruteurs.</p>
                            <button onClick={() => setActiveTab('verification')} className="mt-auto w-fit bg-white text-slate-900 font-black text-[10px] px-8 py-3 rounded-2xl transition-all hover:scale-105 active:scale-95 uppercase tracking-widest shadow-xl shadow-black/20">
                               Certification CI-Identity
                            </button>
                         </div>
                         <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-colors"></div>
                      </div>
                     )}

                      {profile.role === 'employer' && (
                        <div className="bg-emerald-50 rounded-[32px] p-8 border border-emerald-100 flex items-center justify-between group hover:border-emerald-200 transition-all cursor-pointer" onClick={() => setView('post-job')}>
                           <div>
                              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">Recrutement Express</p>
                              <h4 className="text-xl font-black text-emerald-900 tracking-tight">Nouvelle annonce ?</h4>
                              <p className="text-xs text-emerald-700/60 font-medium mt-1">Trouvez le personnel idéal en moins de 48h.</p>
                           </div>
                           <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-200 transition-transform group-hover:rotate-12">
                              <PlusCircle className="h-6 w-6" />
                           </div>
                        </div>
                      )}
                   </div>
                </div>
             </div>
           )}

           {activeTab === 'browse-candidates' && (
              <div className="space-y-6">
                 <header>
                    <h2 className="text-xl font-black text-slate-800 tracking-tight">Candidats Disponibles</h2>
                    <p className="text-sm text-slate-400 font-medium">Parcourez les profils vérifiés sur IvoireSource.</p>
                 </header>
                 {loadingData ? (
                   <div className="animate-pulse space-y-3">
                     {[1, 2, 3].map(i => <div key={i} className="h-24 bg-slate-50 rounded-2xl"></div>)}
                   </div>
                 ) : candidates.length === 0 ? (
                    <div className="text-center py-10 text-slate-300">Aucun candidat pour le moment.</div>
                 ) : (
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {candidates.map(cand => (
                        <div key={cand.uid} className="p-4 border border-slate-100 rounded-2xl flex flex-col gap-4 hover:border-emerald-200 transition-all bg-white">
                           <div className="flex items-center gap-3">
                              <img src={cand.photoURL || 'https://via.placeholder.com/60'} className="h-12 w-12 rounded-xl object-cover" />
                              <div className="min-w-0">
                                 <p className="font-bold text-slate-800 truncate">{cand.displayName}</p>
                                 <div className="flex items-center gap-1">
                                    <Star className="h-3 w-3 text-emerald-500 fill-emerald-500" />
                                    <span className="text-[10px] font-bold text-slate-400">{cand.averageRating || 'N/A'}</span>
                                    {cand.isVerified && <ShieldCheck className="h-3 w-3 text-emerald-600" />}
                                 </div>
                              </div>
                           </div>
                           <button onClick={() => viewCandidate(cand.uid)} className="w-full py-2 bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 text-[10px] font-bold rounded-lg transition-all uppercase tracking-widest">
                              Voir Profil
                           </button>
                        </div>
                      ))}
                   </div>
                 )}
              </div>
           )}

           {activeTab === 'my-jobs' && (
              <div className="space-y-6">
                 <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                       <h2 className="text-xl font-black text-slate-800 tracking-tight">Mes Offres Publiées</h2>
                       <p className="text-xs text-slate-400">Gérez, modifiez ou ajoutez de nouvelles offres d'emploi d'ici.</p>
                    </div>
                    <button
                       onClick={() => setView('post-job')}
                       className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-3 rounded-2xl shadow-lg shadow-emerald-100 hover:shadow-xl transition-all w-full sm:w-auto hover:scale-[1.02] active:scale-[0.98]"
                    >
                       <PlusCircle className="h-4 w-4" />
                       Publier une offre
                    </button>
                 </header>
                 {loadingData ? (
                   <div className="animate-pulse space-y-3">
                     {[1, 2].map(i => <div key={i} className="h-20 bg-slate-100 rounded-2xl"></div>)}
                   </div>
                 ) : myJobs.length === 0 ? (
                   <div className="text-center py-12 px-6 bg-slate-50 border border-dashed border-slate-200 rounded-[24px] space-y-4">
                     <Briefcase className="h-10 w-10 text-slate-300 mx-auto" />
                     <div className="space-y-1 font-sans">
                       <p className="font-bold text-slate-700 text-sm">Aucune offre publiée pour le moment</p>
                       <p className="text-xs text-slate-400 max-w-sm mx-auto">Créez votre première annonce d'emploi pour commencer à recevoir des candidatures qualifiées dès aujourd'hui.</p>
                     </div>
                     <button
                       onClick={() => setView('post-job')}
                       className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md shadow-emerald-100 hover:shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                     >
                       <PlusCircle className="h-4 w-4" />
                       Publier ma première offre
                     </button>
                   </div>
                 ) : (
                   <div className="space-y-3">
                     {myJobs.map(job => (
                       <div 
                         key={job.id} 
                         onClick={() => handleOpenManageJob(job)}
                         className="p-4 bg-white border border-slate-100 rounded-2xl flex items-center justify-between hover:border-emerald-200 hover:shadow-sm cursor-pointer transition-all"
                       >
                         <div>
                            <p className="font-bold text-slate-800">{job.title}</p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                               <span className="text-xs text-slate-400 font-medium">{job.location}</span>
                               <span className="text-xs text-slate-300">•</span>
                               <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${getJobStatusLabel(job.status).color}`}>
                                  {getJobStatusLabel(job.status).text}
                               </span>
                            </div>
                         </div>
                         <div className="flex items-center gap-2">
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleOpenManageJob(job); }}
                              className="text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-xl transition-all uppercase tracking-wider h-8 flex items-center cursor-pointer font-sans"
                            >
                              Gérer
                            </button>
                            <ChevronRight className="h-4 w-4 text-slate-200" />
                         </div>
                       </div>
                     ))}
                   </div>
                 )}
              </div>
           )}

           {activeTab === 'applications' && (
              <div className="space-y-6">
                 <header>
                    <h2 className="text-xl font-black text-slate-800 tracking-tight">{profile.role === 'candidate' ? 'Mes Candidatures' : 'Candidatures reçues'}</h2>
                 </header>
                 {loadingData ? (
                   <div className="animate-pulse space-y-3">
                     {[1, 2].map(i => <div key={i} className="h-20 bg-slate-100 rounded-2xl"></div>)}
                   </div>
                 ) : apps.length === 0 ? (
                   <div className="text-center py-10 text-slate-400">
                      <p>Aucune candidature à afficher.</p>
                   </div>
                 ) : (
                   <div className="space-y-3">
                     {apps.map(app => (
                       <div key={app.id} className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-4 font-sans text-left">
                         <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                               <img 
                                 src={app.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop'} 
                                 alt="Avatar" 
                                 className="h-12 w-12 rounded-full border-2 border-slate-50 object-cover shadow-sm shrink-0" 
                                 referrerPolicy="no-referrer"
                               />
                               <div className="min-w-0">
                                  <p className="font-bold text-slate-800 text-sm truncate">
                                     {profile.role === 'employer' 
                                       ? (app.candidateName || resolvedNames[app.candidateId] || `Candidat ${app.candidateId.substring(0,6)}...`)
                                       : (resolvedJobs[app.jobId] ? `Offre : ${resolvedJobs[app.jobId]}` : `Postulé pour l'offre ${app.jobId.substring(0,8)}`)}
                                  </p>
                                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                                     Postulé le : {new Date(app.createdAt).toLocaleDateString()} • État : <span className={`capitalize font-black ${app.status === 'approved' ? 'text-emerald-600' : app.status === 'rejected' ? 'text-red-500' : 'text-amber-500'}`}>{app.status === 'pending' ? 'En attente' : app.status === 'approved' ? 'Acceptée' : 'Refusée'}</span>
                                  </p>
                               </div>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                               {profile.role === 'employer' && app.status === 'pending' && (
                                 <>
                                   <button 
                                     onClick={() => updateAppStatus(app.id, 'approved')} 
                                     className="text-[10px] font-bold text-emerald-600 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-all border border-emerald-100/50 uppercase tracking-wider"
                                   >
                                     Approuver
                                   </button>
                                   <button 
                                     onClick={() => updateAppStatus(app.id, 'rejected')} 
                                     className="text-[10px] font-bold text-red-500 px-3 py-1.5 bg-red-50 hover:bg-red-100 rounded-xl transition-all border border-red-100/50 uppercase tracking-wider"
                                   >
                                     Refuser
                                   </button>
                                 </>
                               )}
                               <button 
                                 onClick={() => viewCandidate(app.candidateId, app)} 
                                 className="text-[10px] font-bold text-slate-600 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-xl transition-all border border-slate-200/50 uppercase tracking-wider"
                                >
                                 Voir Profil
                               </button>
                            </div>
                         </div>

                         {/* Extra Transmitted Candidate Form Information */}
                         {(app.experienceYears !== undefined || app.message || app.cvName) && (
                           <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100/40 text-xs space-y-3 font-sans">
                             <div className="flex flex-wrap gap-2 text-[10px] font-black tracking-wider uppercase">
                                {app.experienceYears !== undefined && (
                                  <div className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg flex items-center gap-1 border border-emerald-100/30">
                                     <span>💼</span> <span>{app.experienceYears} {app.experienceYears > 1 ? "ans d'expérience" : app.experienceYears === 0 ? "Débutant" : "an d'expérience"}</span>
                                  </div>
                                )}
                                {app.cvName && (
                                  <div className="bg-amber-50 text-amber-500 px-2.5 py-1 rounded-lg flex flex-wrap items-center gap-1.5 border border-amber-100/40 font-mono text-[10px]">
                                     <span>📄</span> <span>CV: {app.cvName}</span>
                                     {app.cvUrl && (
                                       <div className="flex items-center gap-1.5 ml-2">
                                         <button 
                                           onClick={(e) => { e.stopPropagation(); setPreviewCv({ name: app.cvName!, url: app.cvUrl! }); }}
                                           className="underline font-black text-amber-700 hover:text-amber-950 cursor-pointer"
                                         >
                                           [👁️ Visionner]
                                         </button>
                                         <a 
                                           href={app.cvUrl} 
                                           download={app.cvName}
                                           className="underline font-black text-amber-700 hover:text-amber-950 cursor-pointer"
                                           onClick={(e) => e.stopPropagation()}
                                         >
                                           [📥 Télécharger]
                                         </a>
                                       </div>
                                     )}
                                  </div>
                                )}
                             </div>
                             {app.message && (
                               <p className="text-slate-600 leading-relaxed text-xs pl-3 border-l-[3px] border-emerald-500/50 italic bg-white/40 py-1.5 rounded-r-xl font-sans">
                                  "{app.message}"
                                </p>
                             )}
                           </div>
                         )}
                       </div>
                     ))}
                   </div>
                 )}

                 <AnimatePresence>
                    {false && selectedCandidate && (
                      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                         <motion.div 
                           initial={{ scale: 0.9, opacity: 0 }}
                           animate={{ scale: 1, opacity: 1 }}
                           exit={{ scale: 0.9, opacity: 0 }}
                           className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl"
                         >
                            <div className="p-8 text-center relative">
                               <button onClick={() => { setSelectedCandidate(null); setSelectedApplication(null); }} className="absolute top-4 right-4 p-2 bg-slate-100 rounded-full hover:bg-slate-200"><X className="h-4 w-4" /></button>
                               
                               <img src={selectedApplication?.photoURL || selectedCandidate.photoURL || 'https://via.placeholder.com/150'} className="h-24 w-24 rounded-full mx-auto mb-4 border-4 border-slate-50 object-cover" />
                               <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">{selectedApplication?.candidateName || selectedCandidate.displayName}</h3>
                               <p className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-4">{selectedCandidate.role === 'candidate' ? 'CANDIDAT DE MAISON' : selectedCandidate.role}</p>

                               {/* Dynamic application detail overlays */}
                               {selectedApplication && (
                                 <div className="space-y-3 mb-6 font-sans">
                                   <div className="flex flex-wrap gap-2 justify-center text-[10px] font-bold uppercase">
                                     {selectedApplication.experienceYears !== undefined && (
                                       <span className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl">
                                         💼 {selectedApplication.experienceYears} {selectedApplication.experienceYears > 1 ? "ans d'expérience" : "an d'expérience"}
                                       </span>
                                     )}
                                     {selectedApplication.cvName && (
                                       <span className="bg-amber-50 text-amber-600 px-3 py-1.5 rounded-xl border border-amber-150">
                                         📄 CV: {selectedApplication.cvName}
                                       </span>
                                     )}
                                   </div>

                                   {selectedApplication.message && (
                                     <div className="bg-slate-50 text-xs italic text-slate-600 p-4 rounded-2xl border border-slate-100 text-left leading-relaxed">
                                       <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 not-italic mb-1">Message du candidat :</div>
                                       "{selectedApplication.message}"
                                     </div>
                                   )}
                                 </div>
                               )}

                               <div className="grid grid-cols-2 gap-4 text-left mb-8">
                                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                     <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Badge Confiance</p>
                                     <div className="flex items-center gap-2">
                                        <span className={`text-xs font-bold ${selectedCandidate.isVerified ? 'text-emerald-600' : 'text-slate-400'}`}>
                                           {selectedCandidate.isVerified ? 'CERTIFIÉ' : 'EN ATTENTE'}
                                        </span>
                                        {selectedCandidate.isVerified && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                                     </div>
                                  </div>
                                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                     <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Score</p>
                                     <div className="flex items-center gap-2">
                                        <Star className="h-3 w-3 text-emerald-500 fill-emerald-500" />
                                        <span className="text-xs font-bold text-slate-800">{selectedCandidate.averageRating || 'N/A'}</span>
                                     </div>
                                  </div>
                               </div>

                               <div className="flex gap-3">
                                  <a 
                                    href={`mailto:${selectedCandidate.email}?subject=Offre d'emploi sur IvoireSource&body=Bonjour ${selectedCandidate.displayName}, je reviens vers vous concernant votre candidature sur IvoireSource.`} 
                                    className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-bold text-sm hover:bg-black transition-all text-center"
                                  >
                                     Contacter par Email
                                  </a>
                                  <button onClick={() => setSelectedCandidate(null)} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold text-sm hover:bg-slate-200">Fermer</button>
                               </div>
                            </div>
                         </motion.div>
                      </div>
                    )}
                 </AnimatePresence>
              </div>
           )}

           {activeTab === 'admin' && profile.role === 'admin' && (
              <div className="space-y-8 animate-fade-in max-w-6xl">
                 <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-slate-50 pb-6">
                    <div>
                       <h2 className="text-2xl font-black text-slate-900 tracking-tight">Console d'Administration</h2>
                       <p className="text-sm text-slate-400 font-medium">Contrôle de sécurité, modération des offres d'emploi et validation de CNI.</p>
                    </div>
                    <div className="flex bg-slate-100 p-1 rounded-2xl shrink-0 self-start lg:self-center">
                       <button 
                         onClick={() => setAdminTab('users')}
                         className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${adminTab === 'users' ? 'bg-white text-slate-800 shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                       >
                          Membres ({allUsers.length})
                       </button>
                       <button 
                         onClick={() => setAdminTab('jobs')}
                         className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${adminTab === 'jobs' ? 'bg-white text-slate-800 shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                       >
                          Offres ({myJobs.length})
                       </button>
                       <button 
                         onClick={() => setAdminTab('applications')}
                         className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${adminTab === 'applications' ? 'bg-white text-slate-800 shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                       >
                          Candidatures ({apps.length})
                       </button>
                    </div>
                 </header>

                 {/* SUB TAB: USERS */}
                 {adminTab === 'users' && (
                    <div className="space-y-6">
                       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-5 rounded-3xl border border-slate-100 shadow-sm gap-4 font-sans">
                          <div>
                             <h3 className="font-bold text-slate-850 text-sm">Gestion des membres</h3>
                             <p className="text-xs text-slate-400">Ajouter, certifier, attribuer des statuts premium ou supprimer des comptes.</p>
                          </div>
                          <button 
                            onClick={() => setIsAdminCreatingUser(!isAdminCreatingUser)}
                            className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all flex items-center gap-2"
                          >
                             {isAdminCreatingUser ? 'Fermer le formulaire' : '+ Ajouter un membre'}
                          </button>
                       </div>

                       {isAdminCreatingUser && (
                          <motion.div 
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white border border-slate-100 p-6 rounded-3xl shadow-md space-y-4 font-sans"
                          >
                             <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Créer un nouveau profil de membre</h4>
                             <form onSubmit={handleAdminCreateUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                   <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Nom complet</label>
                                   <input 
                                     required 
                                     className="w-full bg-slate-50 px-3 py-2 text-xs rounded-lg border-none focus:ring-1 focus:ring-emerald-500 outline-none h-10 font-semibold" 
                                     placeholder="ex: Yao Koffi"
                                     value={adminUserForm.displayName} 
                                     onChange={e => setAdminUserForm({...adminUserForm, displayName: e.target.value})} 
                                   />
                                </div>
                                <div>
                                   <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Email</label>
                                   <input 
                                     required 
                                     type="email"
                                     className="w-full bg-slate-50 px-3 py-2 text-xs rounded-lg border-none focus:ring-1 focus:ring-emerald-500 outline-none h-10 font-semibold" 
                                     placeholder="ex: yao@domain.com"
                                     value={adminUserForm.email} 
                                     onChange={e => setAdminUserForm({...adminUserForm, email: e.target.value})} 
                                   />
                                </div>
                                <div>
                                   <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Rôle principal</label>
                                   <select 
                                     className="w-full bg-slate-50 px-3 py-2 text-xs rounded-lg border-none focus:ring-1 focus:ring-emerald-500 outline-none h-10 font-semibold"
                                     value={adminUserForm.role}
                                     onChange={e => setAdminUserForm({...adminUserForm, role: e.target.value as any})}
                                   >
                                      <option value="candidate">Candidat (Recherche d'emploi)</option>
                                      <option value="employer">Employeur (Recruteur)</option>
                                      <option value="admin">Administrateur</option>
                                   </select>
                                </div>
                                <div>
                                   <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Ville résidente</label>
                                   <select 
                                     className="w-full bg-slate-50 px-3 py-2 text-xs rounded-lg border-none focus:ring-1 focus:ring-emerald-500 outline-none h-10 font-semibold"
                                     value={adminUserForm.location}
                                     onChange={e => setAdminUserForm({...adminUserForm, location: e.target.value})}
                                   >
                                      <option value="">Sélectionner une ville (Optionnel)</option>
                                      {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                                   </select>
                                </div>
                                <div className="md:col-span-2">
                                   <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Présentation / Bio</label>
                                   <textarea 
                                     rows={2} 
                                     className="w-full bg-slate-50 px-3 py-2 text-xs rounded-lg border-none focus:ring-1 focus:ring-emerald-500 outline-none placeholder:text-slate-350" 
                                     placeholder="Bio ou profil professionnel..."
                                     value={adminUserForm.bio} 
                                     onChange={e => setAdminUserForm({...adminUserForm, bio: e.target.value})} 
                                   />
                                </div>
                                <div className="md:col-span-2 flex flex-wrap gap-6 items-center py-1">
                                   <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-650">
                                      <input 
                                        type="checkbox" 
                                        className="rounded text-emerald-650 border-slate-200 focus:ring-emerald-500 w-4 h-4"
                                        checked={adminUserForm.isVerified}
                                        onChange={e => setAdminUserForm({...adminUserForm, isVerified: e.target.checked})}
                                      />
                                      Certifier le profil d'office (Badge ★)
                                   </label>
                                   <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-655 font-sans">
                                      <input 
                                        type="checkbox" 
                                        className="rounded text-emerald-650 border-slate-200 focus:ring-emerald-500 w-4 h-4"
                                        checked={adminUserForm.isPremium}
                                        onChange={e => setAdminUserForm({...adminUserForm, isPremium: e.target.checked})}
                                      />
                                      Activer l'abonnement Premium
                                   </label>
                                </div>
                                <div className="md:col-span-2 flex justify-end gap-2 border-t border-slate-100 pt-4">
                                   <button 
                                     type="button" 
                                     onClick={() => setIsAdminCreatingUser(false)}
                                     className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all font-sans"
                                   >
                                      Annuler
                                   </button>
                                   <button 
                                     type="submit" 
                                     className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-all font-sans"
                                   >
                                      Créer le profil
                                   </button>
                                </div>
                             </form>
                          </motion.div>
                       )}
                       <div className="bg-white border border-slate-100 rounded-[32px] overflow-hidden shadow-sm">
                          <div className="overflow-x-auto">
                             <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-slate-50/75 border-b border-slate-100 text-[10px] uppercase font-bold text-slate-400">
                                   <tr>
                                      <th className="px-6 py-4">Nom & Email</th>
                                      <th className="px-6 py-4">Rôle</th>
                                      <th className="px-6 py-4">Status Certification</th>
                                      <th className="px-6 py-4">Aperçu Demande</th>
                                      <th className="px-6 py-4 text-right">Actions</th>
                                   </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                   {allUsers.length === 0 ? (
                                     <tr>
                                       <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-medium bg-slate-50/20">Aucun membre enregistré pour le moment.</td>
                                     </tr>
                                   ) : (
                                     allUsers.map(u => (
                                        <tr key={u.uid} className="hover:bg-slate-50/50 transition-colors">
                                           <td className="px-6 py-4">
                                              <div className="flex items-center gap-3">
                                                 <img src={u.photoURL || 'https://via.placeholder.com/32'} className="w-8 h-8 rounded-full border border-slate-100 shadow-sm" />
                                                 <div>
                                                    <p className="font-bold text-slate-800 text-xs">{u.displayName}</p>
                                                    <p className="text-[10px] text-slate-400">{u.email}</p>
                                                 </div>
                                              </div>
                                           </td>
                                           <td className="px-6 py-4">
                                              <span className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider ${u.role === 'admin' ? 'bg-purple-100 text-purple-750' : u.role === 'employer' ? 'bg-blue-105 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                                 {u.role}
                                              </span>
                                           </td>
                                           <td className="px-6 py-4">
                                              <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold ${u.isVerified ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                                                 {u.isVerified ? '★ Certifié' : 'Non certifié'}
                                              </span>
                                           </td>
                                           <td className="px-6 py-4 text-xs font-semibold text-slate-550 max-w-xs">
                                               {u.verificationDocs && u.verificationDocs.length > 0 ? (
                                                  (() => {
                                                     const pendingCount = u.verificationDocs.filter(d => d.status === 'pending').length;
                                                     const approvedCount = u.verificationDocs.filter(d => d.status === 'approved').length;
                                                     const rejectedCount = u.verificationDocs.filter(d => d.status === 'rejected').length;

                                                     if (pendingCount > 0) {
                                                        return (
                                                           <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase bg-amber-50 text-amber-805 border border-amber-100 animate-pulse">
                                                              ⌛ À Examiner ({pendingCount} en attente)
                                                           </span>
                                                        );
                                                     } else if (rejectedCount > 0 && approvedCount === 0) {
                                                        return (
                                                           <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase bg-red-50 text-red-750 border border-red-105">
                                                              ✗ Rejeté ({rejectedCount} pièces)
                                                           </span>
                                                        );
                                                     } else {
                                                        return (
                                                           <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-100">
                                                              ✓ Validé ({approvedCount}/{u.verificationDocs.length})
                                                           </span>
                                                        );
                                                     }
                                                  })()
                                               ) : u.bio?.includes('[ID Soumise') ? (
                                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase bg-amber-50 text-amber-700 font-sans">Demande reçue</span>
                                               ) : (
                                                  <span className="text-slate-350 text-[10px] font-medium font-sans">Aucun justificatif</span>
                                               )}
                                            </td>
                                            <td className="px-6 py-4 text-right justify-end flex items-center gap-2">
                                               {u.verificationDocs && u.verificationDocs.length > 0 && (
                                                  <button 
                                                    onClick={() => setViewingDocsUser(u)}
                                                    className="px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                                                  >
                                                     <Eye className="h-3.5 w-3.5" /> Examiner
                                                  </button>
                                               )}
                                               <button 
                                                 onClick={() => toggleUserVerification(u)}
                                                 className={`px-2.5 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors ${u.isVerified ? 'bg-red-50 text-red-650 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                                               >
                                                  {u.isVerified ? 'Révoquer' : 'Certifier'}
                                               </button>
                                               <button 
                                                 onClick={() => toggleUserPremium(u)}
                                                 className={`px-2.5 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors ${u.isPremium ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                                               >
                                                  {u.isPremium ? 'Premium Actif' : 'Donner Premium'}
                                               </button>
                                               <button 
                                                 onClick={() => deleteUserAction(u.uid)}
                                                 className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold uppercase bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-650 transition-colors"
                                               >
                                                  Supprimer
                                               </button>
                                            </td>
                                        </tr>
                                     ))
                                   )}
                                </tbody>
                             </table>
                          </div>
                       </div>
                    </div>
                 )}

                 {/* SUB TAB: JOBS */}
                 {adminTab === 'jobs' && (
                     <div className="space-y-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-5 rounded-3xl border border-slate-100 shadow-sm gap-4 font-sans">
                           <div>
                              <h3 className="font-bold text-slate-850 text-sm">Gestion des offres</h3>
                              <p className="text-xs text-slate-400">Publier des offres en direct, modérer ou supprimer les annonces.</p>
                           </div>
                           <button 
                             onClick={() => setIsAdminCreatingJob(!isAdminCreatingJob)}
                             className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all flex items-center gap-2"
                           >
                              {isAdminCreatingJob ? 'Fermer le formulaire' : '+ Publier une offre'}
                           </button>
                        </div>

                        {isAdminCreatingJob && (
                           <motion.div 
                             initial={{ opacity: 0, y: -10 }}
                             animate={{ opacity: 1, y: 0 }}
                             className="bg-white border border-slate-100 p-6 rounded-3xl shadow-md space-y-4 font-sans"
                           >
                              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Créer une nouvelle offre d'emploi</h4>
                              <form onSubmit={handleAdminCreateJob} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                 <div className="md:col-span-2">
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Titre de l'annonce</label>
                                    <input 
                                      required 
                                      className="w-full bg-slate-50 px-3 py-2 text-xs rounded-lg border-none focus:ring-1 focus:ring-emerald-500 outline-none h-10 font-semibold" 
                                      placeholder="ex: Nounou logée à domicile"
                                      value={adminJobForm.title} 
                                      onChange={e => setAdminJobForm({...adminJobForm, title: e.target.value})} 
                                    />
                                 </div>
                                 <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Catégorie</label>
                                    <select 
                                      className="w-full bg-slate-50 px-3 py-2 text-xs rounded-lg border-none focus:ring-1 focus:ring-emerald-500 outline-none h-10 font-semibold"
                                      value={adminJobForm.category}
                                      onChange={e => setAdminJobForm({...adminJobForm, category: e.target.value})}
                                    >
                                       {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                    </select>
                                 </div>
                                 <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Ville</label>
                                    <select 
                                      className="w-full bg-slate-50 px-3 py-2 text-xs rounded-lg border-none focus:ring-1 focus:ring-emerald-500 outline-none h-10 font-semibold"
                                      value={adminJobForm.location}
                                      onChange={e => setAdminJobForm({...adminJobForm, location: e.target.value})}
                                    >
                                       {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                 </div>
                                 <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Rémunération mensuelle (FCFA)</label>
                                    <input 
                                      required 
                                      className="w-full bg-slate-50 px-3 py-2 text-xs rounded-lg border-none focus:ring-1 focus:ring-emerald-500 outline-none h-10 font-semibold" 
                                      placeholder="ex: 130 000"
                                      value={adminJobForm.salaryRange} 
                                      onChange={e => setAdminJobForm({...adminJobForm, salaryRange: e.target.value})} 
                                    />
                                 </div>
                                 <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">ID Recruteur / Employeur</label>
                                    <input 
                                      required 
                                      className="w-full bg-slate-50 px-3 py-2 text-xs rounded-lg border-none focus:ring-1 focus:ring-emerald-500 outline-none h-10 font-semibold" 
                                      placeholder="Nom ou uid de l'employeur (ex: system)"
                                      value={adminJobForm.employerId} 
                                      onChange={e => setAdminJobForm({...adminJobForm, employerId: e.target.value})} 
                                    />
                                 </div>
                                 <div className="md:col-span-2">
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Description & Profil recherché</label>
                                    <textarea 
                                      required 
                                      rows={3} 
                                      className="w-full bg-slate-50 px-3 py-2 text-xs rounded-lg border-none focus:ring-1 focus:ring-emerald-500 outline-none text-sm placeholder:text-slate-350" 
                                      placeholder="Tâches, horaires, expérience, niveau requis..."
                                      value={adminJobForm.description} 
                                      onChange={e => setAdminJobForm({...adminJobForm, description: e.target.value})} 
                                    />
                                 </div>
                                 <div className="flex items-center py-2">
                                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-600 font-sans">
                                       <input 
                                         type="checkbox" 
                                         className="rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 w-4 h-4"
                                         checked={adminJobForm.isPremium}
                                         onChange={e => setAdminJobForm({...adminJobForm, isPremium: e.target.checked})}
                                       />
                                       Activer le Boost Premium (En tête de liste)
                                    </label>
                                 </div>
                                 <div className="md:col-span-2 flex justify-end gap-2 border-t border-slate-100 pt-4">
                                    <button 
                                      type="button" 
                                      onClick={() => setIsAdminCreatingJob(false)}
                                      className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all font-sans"
                                    >
                                       Annuler
                                    </button>
                                    <button 
                                      type="submit" 
                                      className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-all font-sans"
                                    >
                                       Poster l'offre
                                    </button>
                                 </div>
                              </form>
                           </motion.div>
                        )}

                       <div className="bg-white border border-slate-100 rounded-[32px] overflow-hidden shadow-sm">
                          <div className="overflow-x-auto">
                             <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-slate-50/75 border-b border-slate-100 text-[10px] uppercase font-bold text-slate-400">
                                   <tr>
                                      <th className="px-6 py-4">Titre de l'Offre</th>
                                      <th className="px-6 py-4">Ville</th>
                                      <th className="px-6 py-4">Catégorie</th>
                                      <th className="px-6 py-4">Salaire Mensuel</th>
                                      <th className="px-6 py-4">Statut</th>
                                      <th className="px-6 py-4 text-right">Actions</th>
                                   </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                   {myJobs.length === 0 ? (
                                     <tr>
                                       <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-medium bg-slate-50/20">Aucune annonce publiée pour le moment.</td>
                                     </tr>
                                   ) : (
                                     myJobs.map(job => (
                                        <tr key={job.id} className="hover:bg-slate-50/50 transition-colors">
                                           <td className="px-6 py-4">
                                              <div>
                                                 <p className="font-bold text-slate-800 text-xs">{job.title}</p>
                                                 <p className="text-[10px] text-slate-400 font-mono">ID: {job.id}</p>
                                              </div>
                                           </td>
                                           <td className="px-6 py-4 text-xs font-semibold text-slate-600">{job.location}</td>
                                           <td className="px-6 py-4">
                                              <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase bg-slate-100 text-slate-500">
                                                 {job.category}
                                              </span>
                                           </td>
                                           <td className="px-6 py-4 text-xs font-bold text-emerald-600">{job.salaryRange} FCFA</td>
                                           <td className="px-6 py-4">
                                              <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${getJobStatusLabel(job.status).color}`}>
                                                 {getJobStatusLabel(job.status).text}
                                              </span>
                                           </td>
                                           <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                                              {job.status !== 'approved' && (
                                                <button 
                                                  onClick={() => updateJobStatus(job.id, 'approved')}
                                                  className="px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all border border-emerald-100"
                                                >
                                                   Accepter
                                                </button>
                                              )}
                                              {job.status !== 'rejected' && (
                                                <button 
                                                  onClick={() => updateJobStatus(job.id, 'rejected')}
                                                  className="px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-red-50 text-red-600 hover:bg-red-100 transition-all border border-red-100"
                                                >
                                                   Bloquer
                                                </button>
                                              )}
                                              <button 
                                                onClick={() => deleteJobAction(job.id)}
                                                className="px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase bg-slate-50 text-slate-400 hover:bg-red-550 transition-all"
                                              >
                                                 Supprimer
                                              </button>
                                           </td>
                                        </tr>
                                     ))
                                   )}
                                </tbody>
                             </table>
                          </div>
                       </div>
                    </div>
                 )}

                 {/* SUB TAB: APPLICATIONS */}
                 {adminTab === 'applications' && (
                    <div className="space-y-6">
                       <div className="bg-white border border-slate-100 rounded-[32px] overflow-hidden shadow-sm">
                          <div className="overflow-x-auto">
                             <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-slate-50/75 border-b border-slate-100 text-[10px] uppercase font-bold text-slate-400">
                                   <tr>
                                      <th className="px-6 py-4">Candidat</th>
                                      <th className="px-6 py-4">Annonce Concernée</th>
                                      <th className="px-6 py-4">Message</th>
                                      <th className="px-6 py-4">État de la relation</th>
                                      <th className="px-6 py-4 text-right">Actions</th>
                                   </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                   {apps.length === 0 ? (
                                     <tr>
                                       <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-medium bg-slate-50/20">Aucune candidature globale à afficher.</td>
                                     </tr>
                                   ) : (
                                     apps.map(app => (
                                        <tr key={app.id} className="hover:bg-slate-50/50 transition-colors">
                                           <td className="px-6 py-4">
                                              <div className="font-bold text-slate-800 text-xs">
                                                 {app.candidateName || resolvedNames[app.candidateId] || `Utilisateur : ${app.candidateId.substring(0,8)}`}
                                              </div>
                                           </td>
                                           <td className="px-6 py-4 text-xs font-extrabold text-slate-600">
                                              {resolvedJobs[app.jobId] || `Offre : ${app.jobId.substring(0,8)}`}
                                           </td>
                                           <td className="px-6 py-4 text-xs max-w-sm truncate text-slate-500 font-medium font-sans">
                                              {app.message || '(Aucun message)'}{app.experienceYears !== undefined && <span className="ml-2 bg-emerald-50 text-emerald-600 text-[10px] px-1.5 py-0.5 rounded font-black">💼 {app.experienceYears} {app.experienceYears > 1 ? "ans" : "an"}</span>}{app.cvName && (
                                                <span className="ml-2 bg-amber-50 text-amber-500 font-mono text-[9px] px-1.5 py-0.5 rounded font-bold inline-flex items-center gap-1">
                                                  📄 CV: {app.cvName}
                                                  {app.cvUrl && (
                                                    <>
                                                      <button 
                                                        onClick={(e) => { e.stopPropagation(); setPreviewCv({ name: app.cvName!, url: app.cvUrl! }); }} 
                                                        className="text-amber-800 hover:text-amber-950 cursor-pointer underline font-extrabold ml-1 scale-95"
                                                      >
                                                        [Visionner]
                                                      </button>
                                                      <a 
                                                        href={app.cvUrl} 
                                                        download={app.cvName} 
                                                        onClick={(e) => e.stopPropagation()} 
                                                        className="text-amber-800 hover:text-amber-950 cursor-pointer underline font-extrabold ml-1 scale-95"
                                                      >
                                                        [Télécharger]
                                                      </a>
                                                    </>
                                                  )}
                                                </span>
                                              )}
                                           </td>
                                           <td className="px-6 py-4">
                                              <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${app.status === 'approved' || app.status === 'accepted' ? 'bg-emerald-50 text-emerald-600' : app.status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                                                 {app.status === 'pending' ? 'En attente' : app.status === 'approved' ? 'Acceptée' : 'Refusée'}
                                              </span>
                                           </td>
                                           <td className="px-6 py-4 text-right">
                                              <button onClick={() => viewCandidate(app.candidateId, app)} className="mr-2 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-all border border-emerald-100 shrink-0">Voir Profil</button>
                                              <button 
                                                onClick={() => deleteApplicationAction(app.id)}
                                                className="px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-red-50 text-red-650 hover:bg-red-100 transition-all border border-red-100"
                                              >
                                                 Supprimer
                                              </button>
                                           </td>
                                        </tr>
                                     ))
                                   )}
                                </tbody>
                             </table>
                          </div>
                       </div>
                    </div>
                 )}
              </div>
           )}

           {activeTab === 'profile' && (
              <div className="space-y-8 max-w-4xl animate-fade-in">
                 <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                       <h2 className="text-2xl font-black text-slate-900 tracking-tight">Mon Profil Professionnel</h2>
                       <p className="text-xs text-slate-400 font-bold uppercase tracking-wider font-sans mt-1">Gérez vos informations personnelles et votre CV pour postuler rapidement</p>
                    </div>
                    {successMsg && (
                       <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-sm animate-bounce">
                          <span>✅</span>
                          <span>{successMsg}</span>
                       </div>
                    )}
                 </header>

                 <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
                    {/* Left Column: Avatar & Mini Stats card */}
                    <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-6 text-center space-y-4">
                       <span className="text-[10px] uppercase font-black text-slate-400 tracking-widest block">Photo Pro</span>
                       <div className="relative w-28 h-28 mx-auto">
                          <img 
                            src={profile.photoURL || 'https://via.placeholder.com/150'} 
                            alt={profile.displayName} 
                            className="w-full h-full rounded-full border-4 border-slate-50 object-cover shadow-md"
                          />
                          <div className="absolute bottom-1 right-1 bg-emerald-600 border-2 border-white text-white p-1.5 rounded-full shadow-lg">
                             <UserIcon className="h-4 w-4" />
                          </div>
                       </div>
                       <div>
                          <h3 className="font-bold text-slate-800 uppercase tracking-tight text-md">{profile.displayName}</h3>
                          <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 bg-slate-100 rounded-full text-slate-500 inline-block mt-1">
                             {profile.role === 'candidate' ? 'Candidat' : profile.role === 'employer' ? 'Recruteur / Employeur' : 'Administrateur'}
                          </span>
                       </div>

                       <div className="border-t border-slate-50 pt-4 flex justify-around text-center">
                          <div>
                             <p className="text-xs font-black text-slate-800">{profile.role === 'candidate' ? apps.length : myJobs.length}</p>
                             <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">{profile.role === 'candidate' ? 'Postulations' : 'Offres créées'}</p>
                          </div>
                          <div className="border-r border-slate-100 h-8 self-center"></div>
                          <div>
                             <p className="text-xs font-black text-slate-800">{profile.isVerified ? 'Oui' : 'Non'}</p>
                             <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Certifié</p>
                          </div>
                       </div>
                    </div>

                    {/* Right Column: Edit Form */}
                    <div className="md:col-span-2 space-y-6">
                       <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-8">
                          <form onSubmit={handleSaveProfile} className="space-y-6">
                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div>
                                   <label className="text-[10px] uppercase font-black text-slate-400 block mb-1.5">Nom Complet <span className="text-red-500">*</span></label>
                                   <input 
                                     type="text" 
                                     required 
                                     value={editName} 
                                     onChange={e => setEditName(e.target.value)}
                                     placeholder="Marie-Laure Kacou"
                                     className="w-full bg-slate-50 px-4 py-3 rounded-xl border-none focus:ring-1 focus:ring-emerald-500 outline-none font-bold text-slate-800 text-xs h-11 transition-all" 
                                   />
                                </div>
                                
                                <div>
                                   <label className="text-[10px] uppercase font-black text-slate-400 block mb-1.5">Numéro de Téléphone Direct <span className="text-red-500">*</span></label>
                                   <input 
                                     type="tel" 
                                     required
                                     placeholder="Ex: +225 07 48 92 11 02"
                                     value={editPhone} 
                                     onChange={e => setEditPhone(e.target.value)}
                                     className="w-full bg-slate-50 px-4 py-3 rounded-xl border-none focus:ring-1 focus:ring-emerald-500 outline-none font-bold text-slate-800 text-xs h-11 transition-all" 
                                   />
                                </div>
                             </div>

                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div>
                                   <label className="text-[10px] uppercase font-black text-slate-400 block mb-1.5">Ville Principale</label>
                                   <select 
                                     value={editLocation} 
                                     onChange={e => setEditLocation(e.target.value)}
                                     className="w-full bg-slate-50 px-4 py-3 rounded-xl border-none focus:ring-1 focus:ring-emerald-500 outline-none font-bold text-slate-800 text-xs h-11 transition-all" 
                                   >
                                      <option value="">Sélectionner une ville...</option>
                                      {CITIES.map(city => (
                                        <option key={city} value={city}>{city}</option>
                                      ))}
                                   </select>
                                </div>

                                <div>
                                   <label className="text-[10px] uppercase font-black text-slate-400 block mb-1.5">Adresse Email</label>
                                   <input 
                                     type="email" 
                                     disabled 
                                     value={profile.email} 
                                     className="w-full bg-slate-100 cursor-not-allowed px-4 py-3 rounded-xl border-none outline-none font-bold text-slate-400 text-xs h-11" 
                                   />
                                </div>
                             </div>

                             <div>
                                <label className="text-[10px] uppercase font-black text-slate-400 block mb-1.5">Biographie & Description</label>
                                <textarea 
                                  value={editBio} 
                                  onChange={e => setEditBio(e.target.value)}
                                  rows={3}
                                  placeholder="Présentez brièvement vos atouts, horaires ou services..."
                                  className="w-full bg-slate-50 px-4 py-3 rounded-xl border-none focus:ring-1 focus:ring-emerald-500 outline-none font-medium text-slate-700 text-xs leading-relaxed" 
                                />
                             </div>

                             {profile.role === 'candidate' && (
                                <div className="space-y-3">
                                   <label className="text-[10px] uppercase font-black text-slate-400 block mb-2">Compétences Professionnelles</label>
                                   <div className="flex flex-wrap gap-1.5">
                                      {['Cuisine locale', 'Garde enfants', 'Chauffeur', 'Entretien de maison', 'Lavage & Repassage', 'Soin animaux', 'Aide devoirs', 'Secourisme'].map(skill => {
                                        const isSelected = editSkills.includes(skill);
                                        return (
                                          <button
                                            type="button"
                                            key={skill}
                                            onClick={() => {
                                              if (isSelected) {
                                                setEditSkills(prev => prev.filter(s => s !== skill));
                                              } else {
                                                setEditSkills(prev => [...prev, skill]);
                                              }
                                            }}
                                            className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase transition-all ${isSelected ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                                          >
                                            {skill}
                                          </button>
                                        );
                                      })}
                                   </div>
                                </div>
                             )}

                             {/* Candidate CV Section */}
                             {profile.role === 'candidate' && (
                                <div className="space-y-3 border-t border-slate-50 pt-6">
                                   <label className="text-[10px] uppercase font-black text-slate-400 block">
                                      Curriculum Vitae (CV) Officiel
                                   </label>

                                   {!profileCvFile ? (
                                      <div 
                                        onDragOver={(e) => { e.preventDefault(); setIsProfileCvDragging(true); }}
                                        onDragLeave={() => setIsProfileCvDragging(false)}
                                        onDrop={handleProfileCvDrop}
                                        onClick={triggerProfileCvSelect}
                                        className={`border-2 border-dashed rounded-3xl p-6 text-center cursor-pointer transition-all ${
                                          isProfileCvDragging 
                                            ? 'border-emerald-500 bg-emerald-50/20' 
                                            : 'border-slate-200 hover:border-emerald-400 hover:bg-slate-50/50'
                                        }`}
                                      >
                                         <input 
                                           type="file" 
                                           ref={profileFileInputRef} 
                                           onChange={handleProfileCvSelect} 
                                           accept=".pdf,.doc,.docx" 
                                           className="hidden" 
                                         />
                                         <UploadCloud className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                                         <p className="text-xs font-bold text-slate-750">Parcourez ou glissez votre CV ici</p>
                                         <p className="text-[10px] text-slate-400 mt-1">Sert de CV par défaut pour postuler en 1 clic</p>
                                      </div>
                                   ) : (
                                      <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 flex items-center justify-between">
                                         <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 bg-emerald-600 text-white rounded-xl flex items-center justify-center font-bold text-sm">
                                               📄
                                            </div>
                                            <div className="min-w-0">
                                               <p className="text-xs font-bold text-slate-800 truncate max-w-[200px]">{profileCvFile.name}</p>
                                               <div className="flex items-center gap-1.5 mt-0.5">
                                                  <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1 rounded font-black uppercase">ENREGISTRÉ</span>
                                                  {profileCvFile.content && (
                                                    <button 
                                                      type="button"
                                                      onClick={() => setPreviewCv({ name: profileCvFile.name, url: profileCvFile.content! })}
                                                      className="text-[9px] underline font-bold text-emerald-700 hover:text-emerald-900"
                                                    >
                                                      [👁️ Aperçu]
                                                    </button>
                                                  )}
                                               </div>
                                            </div>
                                         </div>
                                         <button 
                                           type="button" 
                                           onClick={() => setProfileCvFile(null)}
                                           className="p-1.5 hover:bg-emerald-100 rounded-lg text-emerald-800 transition-all font-semibold"
                                         >
                                            <Trash2 className="h-4 w-4 text-red-500" />
                                         </button>
                                      </div>
                                   )}
                                </div>
                             )}

                             <div className="border-t border-slate-55 pt-6 flex justify-end">
                                <button 
                                  type="submit" 
                                  disabled={updatingProfile}
                                  className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 hover:scale-[1.01] active:scale-[0.99] transition-all text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-50 flex items-center justify-center gap-2 h-11"
                                >
                                   {updatingProfile ? (
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                   ) : (
                                      <>Enregistrer les modifications</>
                                   )}
                                </button>
                             </div>
                          </form>
                       </div>
                    </div>
                 </div>
              </div>
           )}

           {activeTab === 'verification' && (
              <div className="space-y-8">
                 <header>
                   <h2 className="text-2xl font-black text-slate-850 tracking-tight mb-2">Certification IvoSource CI-Identity</h2>
                   <p className="text-sm text-slate-400 font-medium font-sans">Bénéficiez du badge officiel de certification verte et multipliez vos opportunités.</p>
                 </header>

                 {/* Verification Main Status Banner */}
                  <div className={`p-6 rounded-[24px] border flex flex-col md:flex-row items-start md:items-center justify-between gap-6 transition-all ${
                     profile.isVerified 
                       ? 'bg-emerald-50/70 border-emerald-100 text-emerald-950' 
                       : profile.verificationDocs && profile.verificationDocs.length > 0
                         ? 'bg-amber-50/70 border-amber-100 text-amber-950'
                         : 'bg-slate-50 border-slate-200/60 text-slate-700'
                  }`}>
                     <div className="flex gap-4 items-start">
                        <div className={`p-3 rounded-2xl shrink-0 ${
                           profile.isVerified 
                             ? 'bg-emerald-600 text-white' 
                             : profile.verificationDocs && profile.verificationDocs.length > 0
                               ? 'bg-amber-500 text-white animate-pulse'
                               : 'bg-slate-200 text-slate-600'
                        }`}>
                           <ShieldCheck className="h-6 w-6" />
                        </div>
                        <div>
                           <h4 className="text-base font-bold tracking-tight">
                             {profile.isVerified 
                               ? 'Profil Certifié & Authentifié' 
                               : profile.verificationDocs && profile.verificationDocs.length > 0
                                 ? 'Dossier en Cours d’Examen'
                                 : 'Certification non démarrée'}
                           </h4>
                           <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                             {profile.isVerified 
                               ? 'Votre identité a été validée par nos agents IvoSource. Vous bénéficiez désormais d’une priorité maximale dans les recherches de candidats.'
                               : profile.verificationDocs && profile.verificationDocs.length > 0
                                 ? 'Vos pièces justificatives sont en cours d’audit. Validation sous 24h ouvrées. Vous recevrez une notification par email.'
                                 : 'Pour obtenir le statut de candidat certifié, déposez vos documents officiels. Nos équipes valideront vos informations sous 24h.'}
                           </p>
                        </div>
                     </div>
                     {profile.isVerified && (
                        <div className="px-4 py-2 border border-emerald-250 bg-emerald-100/60 text-emerald-800 text-[10px] font-black uppercase tracking-wider rounded-xl">
                           ★ ACTIF
                        </div>
                      )}
                  </div>

                  {/* If already submitted showing current folder documents status */}
                  {profile.verificationDocs && profile.verificationDocs.length > 0 && (
                     <div className="bg-white border border-slate-100 p-6 rounded-[24px] shadow-sm">
                        <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-4">Pièces actuellement déposées</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                           {profile.verificationDocs.map((doc, idx) => (
                             <div key={idx} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 flex flex-col justify-between h-32 relative overflow-hidden group">
                               <div>
                                 <div className="flex items-center justify-between gap-2 mb-2">
                                   <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                                     doc.type === 'cni_passport' 
                                       ? 'bg-blue-50 text-blue-700' 
                                       : doc.type === 'casier_judiciaire'
                                         ? 'bg-purple-50 text-purple-700'
                                         : 'bg-amber-50 text-amber-700'
                                   }`}>
                                     {doc.type === 'cni_passport' ? 'CNI / Passeport' : doc.type === 'casier_judiciaire' ? 'Casier Judiciaire' : 'Domicile'}
                                   </span>
                                   <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                                     profile.isVerified 
                                       ? 'text-emerald-700 bg-emerald-50' 
                                       : 'text-amber-600 bg-amber-50'
                                   }`}>
                                     {profile.isVerified ? 'VALIDE' : doc.status === 'pending' ? 'EN AUDIT' : doc.status === 'approved' ? 'VALIDE' : 'REJETÉ'}
                                   </span>
                                 </div>
                                 <p className="text-xs font-bold text-slate-700 truncate mb-1">{doc.name}</p>
                                 <p className="text-[9px] text-slate-400 font-medium font-mono">Déposé le : {new Date(doc.uploadedAt).toLocaleDateString('fr-FR')}</p>
                               </div>

                               {/* View link if doc is image */}
                               {doc.url && (
                                 <button 
                                   onClick={() => {
                                     // Open raw base64 or preview in new tab
                                     const fileWin = window.open();
                                     if (fileWin) {
                                       fileWin.document.write(`<iframe src="${doc.url}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
                                     }
                                   }} 
                                   className="text-[10px] font-bold text-slate-400 hover:text-slate-850 flex items-center gap-1 mt-2 cursor-pointer border-0 bg-transparent self-start justify-start p-0 outline-none"
                                 >
                                   <Eye className="h-3.5 w-3.5" /> Voir le fichier
                                 </button>
                               )}
                             </div>
                           ))}
                        </div>
                     </div>
                  )}

                  {/* Submission form if not verified (or allows overwriting/updating documents) */}
                  {!profile.isVerified && (
                     <div className="space-y-6">
                        <div className="border border-slate-100 bg-white p-8 rounded-[32px] shadow-sm space-y-6">
                           <div>
                              <h3 className="text-base font-bold text-slate-800">Transmettre de nouveaux justificatifs</h3>
                              <p className="text-xs text-slate-400 font-medium mt-1">Glissez vos fichiers ou cliquez sur les zones ci-dessous pour choisir vos justificatifs et obtenir la pastille officielle d’IvoireSource.</p>
                           </div>

                           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                             
                             {/* 1. CNI/Passport Card */}
                             <div 
                               onDragEnter={(e) => handleDrag(e, 'cni')}
                               onDragOver={(e) => handleDrag(e, 'cni')}
                               onDragLeave={(e) => handleDrag(e, 'cni')}
                               onDrop={(e) => handleDrop(e, 'cni')}
                               className={`p-6 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center transition-all min-h-[220px] relative ${
                                 dragActive['cni'] 
                                   ? 'border-emerald-500 bg-emerald-50/40 scale-[1.02]' 
                                   : cniFile 
                                     ? 'border-emerald-250 bg-emerald-50/10' 
                                     : 'border-slate-200 hover:border-slate-300 bg-slate-50/30'
                               }`}
                             >
                               <input 
                                 id="cni-file-input" 
                                 type="file" 
                                 onChange={(e) => handleFileChange(e, 'cni')} 
                                 className="hidden" 
                                 accept="image/*,application/pdf" 
                               />

                               {uploadSteps.cni === 'uploading' ? (
                                 <div className="space-y-3">
                                    <div className="h-6 w-6 border-2 border-slate-305 border-t-slate-800 animate-spin rounded-full mx-auto" />
                                    <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Traitement du fichier...</p>
                                 </div>
                               ) : cniFile ? (
                                 <div className="space-y-4 w-full">
                                    {cniFile.base64.startsWith('data:image/') ? (
                                      <img src={cniFile.base64} className="w-16 h-12 object-cover rounded-md border border-emerald-100 mx-auto shadow-sm" />
                                    ) : (
                                      <FileText className="h-10 w-10 text-emerald-600 mx-auto" />
                                    )}
                                    <div className="text-center">
                                       <p className="text-xs font-black text-slate-850 truncate max-w-full px-2" title={cniFile.name}>{cniFile.name}</p>
                                       <p className="text-[10px] text-emerald-600 font-bold mt-0.5">{cniFile.size}</p>
                                    </div>
                                    <button 
                                      type="button"
                                      onClick={() => removeUploadedFile('cni')}
                                      className="mx-auto rounded-lg px-2.5 py-1 bg-red-50 text-red-655 hover:bg-red-100 transition-colors text-[9px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer border-0"
                                    >
                                       <Trash2 className="h-3 w-3" /> Supprimer
                                    </button>
                                 </div>
                               ) : (
                                 <label htmlFor="cni-file-input" className="cursor-pointer w-full h-full flex flex-col items-center justify-center p-2">
                                    <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mb-3">
                                       <UploadCloud className="h-6 w-6" />
                                    </div>
                                    <p className="text-xs font-bold text-slate-800">CNI / Passeport *</p>
                                    <p className="text-[10px] text-slate-400 mt-1 max-w-[150px] leading-relaxed">Glissez ou cliquez. (Obligatoire)</p>
                                 </label>
                               )}
                             </div>

                             {/* 2. Criminal Record / Casier Judiciaire Card */}
                             <div 
                               onDragEnter={(e) => handleDrag(e, 'casier')}
                               onDragOver={(e) => handleDrag(e, 'casier')}
                               onDragLeave={(e) => handleDrag(e, 'casier')}
                               onDrop={(e) => handleDrop(e, 'casier')}
                               className={`p-6 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center transition-all min-h-[220px] relative ${
                                 dragActive['casier'] 
                                   ? 'border-purple-500 bg-purple-50/40 scale-[1.02]' 
                                   : casierFile 
                                     ? 'border-purple-250 bg-purple-50/10' 
                                     : 'border-slate-200 hover:border-slate-300 bg-slate-50/30'
                               }`}
                             >
                               <input 
                                 id="casier-file-input" 
                                 type="file" 
                                 onChange={(e) => handleFileChange(e, 'casier')} 
                                 className="hidden" 
                                 accept="image/*,application/pdf" 
                               />

                               {uploadSteps.casier === 'uploading' ? (
                                 <div className="space-y-3">
                                    <div className="h-6 w-6 border-2 border-slate-305 border-t-slate-800 animate-spin rounded-full mx-auto" />
                                    <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Traitement du fichier...</p>
                                 </div>
                               ) : casierFile ? (
                                 <div className="space-y-4 w-full">
                                    {casierFile.base64.startsWith('data:image/') ? (
                                      <img src={casierFile.base64} className="w-16 h-12 object-cover rounded-md border border-purple-100 mx-auto shadow-sm" />
                                    ) : (
                                      <FileText className="h-10 w-10 text-purple-600 mx-auto" />
                                    )}
                                    <div className="text-center">
                                       <p className="text-xs font-black text-slate-850 truncate max-w-full px-2" title={casierFile.name}>{casierFile.name}</p>
                                       <p className="text-[10px] text-purple-600 font-bold mt-0.5">{casierFile.size}</p>
                                    </div>
                                    <button 
                                      type="button"
                                      onClick={() => removeUploadedFile('casier')}
                                      className="mx-auto rounded-lg px-2.5 py-1 bg-red-50 text-red-655 hover:bg-red-100 transition-colors text-[9px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer border-0"
                                    >
                                       <Trash2 className="h-3 w-3" /> Supprimer
                                    </button>
                                 </div>
                               ) : (
                                 <label htmlFor="casier-file-input" className="cursor-pointer w-full h-full flex flex-col items-center justify-center p-2">
                                    <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mb-3">
                                       <Paperclip className="h-6 w-6" />
                                    </div>
                                    <p className="text-xs font-bold text-slate-800">Casier Judiciaire</p>
                                    <p className="text-[10px] text-slate-400 mt-1 max-w-[150px] leading-relaxed">Extrait récent de moins de 3 mois. (Recommandé)</p>
                                 </label>
                               )}
                             </div>

                             {/* 3. Utility Bill / Justificatif de domicile Card */}
                             <div 
                               onDragEnter={(e) => handleDrag(e, 'domicile')}
                               onDragOver={(e) => handleDrag(e, 'domicile')}
                               onDragLeave={(e) => handleDrag(e, 'domicile')}
                               onDrop={(e) => handleDrop(e, 'domicile')}
                               className={`p-6 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center transition-all min-h-[220px] relative ${
                                 dragActive['domicile'] 
                                   ? 'border-amber-500 bg-amber-50/40 scale-[1.02]' 
                                   : domicileFile 
                                     ? 'border-amber-250 bg-amber-50/10' 
                                     : 'border-slate-200 hover:border-slate-300 bg-slate-50/30'
                               }`}
                             >
                               <input 
                                 id="domicile-file-input" 
                                 type="file" 
                                 onChange={(e) => handleFileChange(e, 'domicile')} 
                                 className="hidden" 
                                 accept="image/*,application/pdf" 
                               />

                               {uploadSteps.domicile === 'uploading' ? (
                                 <div className="space-y-3">
                                    <div className="h-6 w-6 border-2 border-slate-305 border-t-slate-800 animate-spin rounded-full mx-auto" />
                                    <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Traitement du fichier...</p>
                                 </div>
                               ) : domicileFile ? (
                                 <div className="space-y-4 w-full">
                                    {domicileFile.base64.startsWith('data:image/') ? (
                                      <img src={domicileFile.base64} className="w-16 h-12 object-cover rounded-md border border-amber-100 mx-auto shadow-sm" />
                                    ) : (
                                      <FileText className="h-10 w-10 text-amber-600 mx-auto" />
                                    )}
                                    <div className="text-center">
                                       <p className="text-xs font-black text-slate-850 truncate max-w-full px-2" title={domicileFile.name}>{domicileFile.name}</p>
                                       <p className="text-[10px] text-amber-600 font-bold mt-0.5">{domicileFile.size}</p>
                                    </div>
                                    <button 
                                      type="button"
                                      onClick={() => removeUploadedFile('domicile')}
                                      className="mx-auto rounded-lg px-2.5 py-1 bg-red-50 text-red-655 hover:bg-red-100 transition-colors text-[9px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer border-0"
                                    >
                                       <Trash2 className="h-3 w-3" /> Supprimer
                                    </button>
                                 </div>
                               ) : (
                                 <label htmlFor="domicile-file-input" className="cursor-pointer w-full h-full flex flex-col items-center justify-center p-2">
                                    <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mb-3">
                                       <FileText className="h-6 w-6" />
                                    </div>
                                    <p className="text-xs font-bold text-slate-800">CIE / SODECI</p>
                                    <p className="text-[10px] text-slate-400 mt-1 max-w-[150px] leading-relaxed">Facture d’électricité ou d’eau. (Optionnel)</p>
                                 </label>
                               )}
                             </div>
                             
                           </div>

                           {/* Submit Button & feedback area */}
                           <div className="pt-4 border-t border-slate-50 flex flex-col sm:flex-row items-center justify-between gap-4">
                              <p className="text-[11px] text-slate-400 font-medium font-sans">Les formats PDF, JPEG, et PNG sont acceptés. Max 10MB.</p>
                              <button
                                type="button"
                                onClick={submitDocumentsForVerification}
                                disabled={submittingVerification || !cniFile}
                                className={`w-full sm:w-auto px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${
                                  cniFile 
                                    ? 'bg-slate-950 text-white cursor-pointer hover:bg-emerald-600 hover:scale-105 shadow-md shadow-slate-205' 
                                    : 'bg-slate-100 text-slate-450 cursor-not-allowed'
                                }`}
                              >
                                {submittingVerification ? 'Transmission en cours...' : 'Soumettre le Dossier'}
                              </button>
                           </div>
                        </div>

                        {verificationSubmitFeedback && (
                           <div className={`p-4 rounded-xl border text-xs font-bold ${
                             verificationSubmitFeedback.includes('succès') 
                               ? 'bg-emerald-50 border-emerald-150 text-emerald-800 font-sans' 
                               : 'bg-red-50 border-red-150 text-red-800 font-sans'
                           }`}>
                             {verificationSubmitFeedback}
                           </div>
                        )}
                     </div>
                  )}

                  {/* Hidden old verification container */}
                  <div className="hidden">
                   <div className="flex items-center gap-4">
                     <ShieldCheck className={`h-8 w-8 shrink-0 ${profile.isVerified ? 'text-emerald-500' : 'text-slate-200'}`} />
                     <div>
                       <p className="font-bold">{profile.isVerified ? 'Profil Certifié' : 'Certification en attente'}</p>
                       <p className="text-xs opacity-80">{profile.isVerified ? 'Toutes vos annonces sont traitées en priorité.' : 'Téléchargez une pièce d\'identité (CNI, Passeport).'}</p>
                     </div>
                   </div>
                   {!profile.isVerified && <button className="w-full sm:w-auto bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-md shadow-slate-200">Vérifier</button>}
                 </div>
              </div>
           )}
        </div>
      </main>

      {/* GLOBAL MODALS */}
      <AnimatePresence>
         {selectedCandidate && (
           <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-end sm:items-center justify-center sm:p-4">
              <motion.div 
                initial={isMobile ? { y: "100%" } : { scale: 0.95, opacity: 0 }}
                animate={isMobile ? { y: 0 } : { scale: 1, opacity: 1 }}
                exit={isMobile ? { y: "100%" } : { scale: 0.95, opacity: 0 }}
                transition={isMobile ? { type: "spring", damping: 25, stiffness: 220 } : undefined}
                className="bg-white rounded-t-[32px] sm:rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-100/40 text-slate-800 max-h-[85vh] sm:max-h-[90vh] overflow-y-auto"
              >
                 {isMobile && (
                   <div className="pt-2 pb-1 shrink-0 flex justify-center bg-slate-900 border-b border-slate-850">
                     <div className="w-12 h-1.5 bg-slate-700 rounded-full" />
                   </div>
                 )}
                 {/* Modal header with candidate highlight */}
                 <div className="relative bg-gradient-to-r from-emerald-600 to-slate-900 text-white p-6 pb-8 text-left">
                    <button 
                      onClick={() => { setSelectedCandidate(null); setSelectedApplication(null); }}
                      className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors cursor-pointer text-white text-xs h-7 w-7 flex items-center justify-center"
                    >
                      ✕
                    </button>
                    <div className="flex gap-4 items-center">
                      <img 
                        src={selectedApplication?.photoURL || selectedCandidate.photoURL || 'https://via.placeholder.com/150'} 
                        alt={selectedCandidate.displayName} 
                        className="w-14 h-14 rounded-full border-2 border-white/20 object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div>
                        <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-widest block">Recrutement direct</span>
                        <h4 className="text-xl font-black tracking-tight">
                          {checkoutStep === 'details' || checkoutStep === 'success' 
                            ? (selectedApplication?.candidateName || selectedCandidate.displayName)
                            : ((selectedApplication?.candidateName || selectedCandidate.displayName).replace(/ .*/,'') + ' **')}
                        </h4>
                        <p className="text-xs text-white/85 capitalize font-medium">📍 {selectedCandidate.location || 'Abidjan'} • {selectedCandidate.skills?.[0] || 'Candidat de Maison'}</p>
                      </div>
                    </div>
                 </div>

                 {/* Modal Body */}
                 <div className="p-6 md:p-8 space-y-6">

                    {/* VIEW PLANS TO UNLOCK */}
                    {checkoutStep === 'plans' && (
                      <div className="space-y-6 text-center">
                        <div className="space-y-2">
                          <h5 className="font-extrabold text-slate-800 text-sm">Contacter ce candidat qualifié</h5>
                          <p className="text-xs text-slate-400">Pour accéder au numéro de téléphone direct, à son adresse email et à ses rapports de vérification CNI, veuillez sélectionner votre accès :</p>
                        </div>

                        <div className="grid grid-cols-1 gap-4 text-left">
                          {/* One time search - 15000 FCFA */}
                          <div 
                            onClick={() => startPaymentCheckout('one-time')}
                            className="bg-slate-50 hover:bg-emerald-50/45 border-2 border-slate-200 hover:border-emerald-500 rounded-2xl p-4 cursor-pointer transition-all flex justify-between items-center group relative overflow-hidden"
                          >
                            <div className="space-y-1">
                              <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider inline-block font-sans">Recherche Ponctuelle</span>
                              <p className="font-black text-slate-850 text-xs">Le Profil Unique</p>
                              <p className="text-[10px] text-slate-400 leading-tight">Accès direct illimité au numéro, mail et garant de ce profil uniquement.</p>
                            </div>
                            <div className="text-right shrink-0 ml-4 font-sans">
                              <span className="text-xs font-black text-slate-800 block">15 000 FCFA</span>
                              <span className="text-[8px] text-slate-400 font-bold block">Paiement unique</span>
                            </div>
                          </div>

                          {/* Unlimited access for 1 month - 30000 FCFA */}
                          <div 
                            onClick={() => startPaymentCheckout('monthly')}
                            className="bg-slate-50 hover:bg-emerald-50/45 border-2 border-emerald-100 hover:border-emerald-600 rounded-2xl p-4 cursor-pointer transition-all flex justify-between items-center group relative overflow-hidden bg-emerald-50/10"
                          >
                            <div className="space-y-1">
                              <span className="bg-amber-100 text-amber-800 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider inline-block font-sans">Best Value 🔥</span>
                              <p className="font-black text-slate-850 text-xs">Accès Illimité 1 Mois</p>
                              <p className="text-[10px] text-slate-400 leading-tight">Accédez à TOUS les profils d'employés et de nounous pendant 30 jours.</p>
                            </div>
                            <div className="text-right shrink-0 ml-4 font-sans">
                              <span className="text-xs font-black text-emerald-600 block">30 000 FCFA</span>
                              <span className="text-[8px] text-slate-400 font-bold block">Accès 1 mois</span>
                            </div>
                          </div>
                        </div>

                        <button 
                          onClick={() => { setSelectedCandidate(null); setSelectedApplication(null); }}
                          className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl font-bold text-xs uppercase transition-all"
                        >
                          Fermer
                        </button>
                      </div>
                    )}

                    {/* SELECT OPERATOR & MOBILE NUMBER */}
                    {checkoutStep === 'payment-method' && (
                      <form onSubmit={executeMobileMoneyPayment} className="space-y-5 text-left font-sans">
                        <div className="space-y-1">
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Option choisie :</span>
                          <div className="flex justify-between items-center bg-slate-50 border border-slate-100 p-3 rounded-xl text-xs">
                            <span className="font-bold text-slate-700">
                              {chosenPlan === 'one-time' ? "Recherche unique de ce candidat" : "Accès illimité Côte d'Ivoire (1 mois)"}
                            </span>
                            <span className="font-black text-emerald-600">
                              {chosenPlan === 'one-time' ? "15 000 fr" : "30 000 fr"}
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
                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block font-sans">Votre Numéro {paymentOperator.toUpperCase()}</label>
                            <div className="relative">
                              <span className="absolute left-3.5 inset-y-0 flex items-center text-xs text-slate-400 font-bold font-mono">+225</span>
                              <input 
                                type="tel"
                                placeholder="07 00 00 00 00"
                                value={phoneNumber}
                                required
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                className="w-full pl-16 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none focus:bg-white font-mono"
                              />
                            </div>
                            <p className="text-[9px] text-slate-400">Un message USSD de validation automatique sera lancé sur votre numéro.</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block font-sans">Coordonnées Carte Bancaire</label>
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-600 space-y-1">
                              <p className="font-bold text-slate-700">💳 Visa, Mastercard et Cartes Locales</p>
                              <p className="text-[10px] text-slate-500">Le formulaire de saisie de la carte hautement sécurisé sera affiché directement sur la passerelle partenaire Paiement Pro lors de la redirection.</p>
                            </div>
                          </div>
                        )}

                        {paymentError && <p className="text-red-500 font-bold text-[10px] bg-red-50 p-2.5 rounded-lg border border-red-100">{paymentError}</p>}

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
                            className="flex-1 py-3 text-xs font-bold text-white bg-slate-900 hover:bg-emerald-600 rounded-xl transition-all"
                          >
                            Valider et Payer
                          </button>
                        </div>
                      </form>
                    )}

                    {/* PROCESSING STATE BAR */}
                    {checkoutStep === 'processing' && (
                      <div className="py-12 text-center space-y-6">
                        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto bg-transparent"></div>
                        <div className="space-y-2">
                          <p className="font-bold text-slate-800 text-sm">Traitement de l'opération en cours...</p>
                          <p className="text-xs text-slate-400 animate-pulse">{paymentStatusMessage}</p>
                        </div>
                      </div>
                    )}

                    {/* DETAILS VIEW OR SUCCESS VIEW */}
                    {(checkoutStep === 'details' || checkoutStep === 'success') && (
                      <div className="space-y-6">
                        
                        {/* If checkout success trigger was active */}
                        {checkoutStep === 'success' && (
                          <div className="bg-emerald-50 text-emerald-800 p-4 rounded-2xl border border-emerald-100 flex items-center gap-3 text-left">
                            <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold shrink-0">✓</div>
                            <div>
                              <p className="font-black text-xs">Paiement Reçu ! Accès Débloqué !</p>
                              <p className="text-[10px] text-emerald-700/80">Merci pour votre confiance. Voici les coordonnées directes du personnel de maison.</p>
                            </div>
                          </div>
                        )}

                        {/* Dynamic application detail overlays */}
                        {selectedApplication && (
                          <div className="space-y-3 font-sans text-left">
                            <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase">
                              {selectedApplication.experienceYears !== undefined && (
                                <span className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl border border-emerald-100/30">
                                  💼 {selectedApplication.experienceYears} {selectedApplication.experienceYears > 1 ? "ans d'expérience" : "an d'expérience"}
                                </span>
                              )}
                              {selectedApplication.cvName && (
                                <span className="bg-amber-50 text-amber-600 px-3 py-1.5 rounded-xl border border-amber-150 inline-flex flex-wrap items-center gap-2">
                                  📄 CV : {selectedApplication.cvName}
                                  {selectedApplication.cvUrl && (
                                    <div className="flex gap-2 text-[10px] uppercase font-black tracking-wider">
                                      <button 
                                        onClick={() => setPreviewCv({ name: selectedApplication.cvName!, url: selectedApplication.cvUrl! })}
                                        className="underline font-black text-amber-800 hover:text-amber-950 cursor-pointer"
                                      >
                                        [👁️ Visionner]
                                      </button>
                                      <a 
                                        href={selectedApplication.cvUrl} 
                                        download={selectedApplication.cvName}
                                        className="underline font-black text-amber-800 hover:text-amber-950 cursor-pointer"
                                      >
                                        [📥 Télécharger]
                                      </a>
                                    </div>
                                  )}
                                </span>
                              )}
                            </div>

                            {selectedApplication.message && (
                              <div className="bg-slate-50 text-xs italic text-slate-600 p-4 rounded-2xl border border-slate-100 text-left leading-relaxed">
                                <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 not-italic mb-1">Message du candidat :</div>
                                "{selectedApplication.message}"
                              </div>
                            )}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-4 text-left">
                           <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Badge Confiance</p>
                              <div className="flex items-center gap-2">
                                 <span className={`text-xs font-bold ${selectedCandidate.isVerified ? 'text-emerald-600' : 'text-slate-400'}`}>
                                    {selectedCandidate.isVerified ? 'CERTIFIÉ' : 'EN ATTENTE'}
                                 </span>
                                 {selectedCandidate.isVerified && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                              </div>
                           </div>
                           <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Score</p>
                              <div className="flex items-center gap-2">
                                 <Star className="h-3 w-3 text-emerald-500 fill-emerald-500" />
                                 <span className="text-xs font-bold text-slate-800">{selectedCandidate.averageRating || 'N/A'}</span>
                              </div>
                           </div>
                        </div>

                        {/* Contacts / coordinates area */}
                        <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-4 text-xs text-left">
                           <div className="flex items-center justify-between">
                             <span className="text-slate-400 font-medium">Téléphone direct :</span>
                             <span className="font-mono font-black text-slate-900 bg-white border border-slate-150 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                               <Phone className="h-3.5 w-3.5 text-emerald-600" /> {selectedCandidate.phone || '+225 07 48 92 11 02'}
                             </span>
                           </div>

                           <div className="flex items-center justify-between">
                             <span className="text-slate-400 font-medium">Adresse email :</span>
                             <span className="font-mono font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                               <Mail className="h-3.5 w-3.5 shrink-0" /> {selectedCandidate.email || 'candidat@ivoiresource.ci'}
                             </span>
                           </div>
                        </div>

                        <div className="flex gap-2 text-xs">
                           <a 
                             href={`https://wa.me/${(selectedCandidate.phone || '0748921102').replace(/[^0-9]/g,'')}`}
                             target="_blank"
                             rel="noopener noreferrer"
                             className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 uppercase tracking-wide cursor-pointer transition-all"
                           >
                              <Phone className="h-4 w-4" /> Message WhatsApp
                           </a>
                           <button 
                             onClick={() => { setSelectedCandidate(null); setSelectedApplication(null); }} 
                             className="bg-slate-100 text-slate-600 px-5 py-3 rounded-xl font-bold hover:bg-slate-200 transition-all uppercase"
                           >
                             Fermer
                           </button>
                        </div>
                      </div>
                    )}

                 </div>
              </motion.div>
           </div>
         )}

         {viewingDocsUser && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[115] flex items-center justify-center p-4 overflow-y-auto">
               <motion.div 
                 initial={{ scale: 0.95, opacity: 0 }}
                 animate={{ scale: 1, opacity: 1 }}
                 exit={{ scale: 0.95, opacity: 0 }}
                 className="bg-white rounded-[32px] w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col md:flex-row border border-slate-100 font-sans my-8 max-h-[85vh]"
               >
                  {/* LEFT ACCOUNT SUMMARY SIDEBAR */}
                  <div className="w-full md:w-[35%] bg-slate-50 p-6 md:p-8 flex flex-col gap-6 border-b md:border-b-0 md:border-r border-slate-100 overflow-y-auto max-h-[85vh]">
                     <div className="text-center">
                        <img 
                          src={viewingDocsUser.photoURL || 'https://via.placeholder.com/100'} 
                          className="w-20 h-20 rounded-full border-4 border-white shadow-md mx-auto mb-3 object-cover" 
                        />
                        <h4 className="font-extrabold text-slate-800 text-sm leading-tight text-center">{viewingDocsUser.displayName}</h4>
                        <p className="text-[11px] text-slate-400 mt-1 block text-center truncate">{viewingDocsUser.email}</p>
                        
                        <div className="flex justify-center gap-1.5 mt-3">
                           <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${viewingDocsUser.isVerified ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-200/50 text-slate-400'}`}>
                              ★ {viewingDocsUser.isVerified ? 'Certifié' : 'Non Certifié'}
                           </span>
                           {viewingDocsUser.isPremium && (
                              <span className="bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider">
                                 👑 Premium
                              </span>
                           )}
                        </div>
                     </div>

                     <div className="h-px bg-slate-200/60 w-full" />

                     {/* ROLE DYNAMIC CHANGER */}
                     <div className="space-y-2 text-left">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Privilèges & Rôle</label>
                        <select 
                          value={viewingDocsUser.role} 
                          onChange={(e) => changeUserRoleInReview(e.target.value as UserRole)}
                          className="w-full bg-white border border-slate-200 text-slate-700 text-xs rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                        >
                           <option value="candidate">Candidat (Recherche d'Emploi)</option>
                           <option value="employer">Recruteur / Employeur</option>
                           <option value="admin">Administrateur Système</option>
                        </select>
                     </div>

                     {/* PREMIUM CONTROL */}
                     <div className="space-y-2 text-left">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Premium Badging</label>
                        <button
                          onClick={() => toggleUserPremium(viewingDocsUser)}
                          className={`w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all border flex items-center justify-center gap-2 cursor-pointer ${viewingDocsUser.isPremium ? 'bg-amber-100 border-amber-250 text-amber-800 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                        >
                          👑 {viewingDocsUser.isPremium ? 'Révoquer Premium' : 'Donner Premium'}
                        </button>
                     </div>

                     <div className="h-px bg-slate-200/60 w-full" />

                     {/* CERTIFICATION GENERAL DIRECT ACTIONS */}
                     <div className="space-y-3 mt-auto text-left">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Validation Globale</label>
                        <div className="flex flex-col gap-2">
                           {!viewingDocsUser.isVerified ? (
                              <button 
                                onClick={() => {
                                   toggleUserVerification(viewingDocsUser);
                                }}
                                className="w-full bg-emerald-600 hover:bg-emerald-500 hover:scale-[1.01] active:scale-[0.99] text-white py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                 <ShieldCheck className="h-4 w-4" /> Certifier le Profil
                              </button>
                           ) : (
                              <button 
                                onClick={() => {
                                   toggleUserVerification(viewingDocsUser);
                                }}
                                className="w-full bg-red-650 hover:bg-red-700 hover:scale-[1.01] active:scale-[0.99] text-white py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                 Révoquer la Certification
                              </button>
                           )}
                           
                           <button 
                             onClick={() => setViewingDocsUser(null)}
                             className="w-full bg-slate-200 hover:bg-slate-300 hover:scale-[1.01] active:scale-[0.99] text-slate-700 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center cursor-pointer"
                           >
                              Fermer le Dossier
                           </button>
                        </div>
                     </div>
                  </div>

                  {/* RIGHT UPLOADED DOCUMENTS DETAIL ZONE */}
                  <div className="w-full md:w-[65%] p-6 md:p-8 flex flex-col overflow-y-auto max-h-[85vh] gap-6 text-left">
                     <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                        <div>
                           <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">Pièces Justificatives Soumises</h3>
                           <p className="text-xs text-slate-400 mt-1">Examinez attentivement l'authenticité et la conformité des justificatifs transmis par le membre.</p>
                        </div>
                        <button 
                          onClick={() => setViewingDocsUser(null)}
                          className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors cursor-pointer"
                        >
                           <X className="h-4 w-4" />
                        </button>
                     </div>

                     <div className="space-y-6">
                        {(!viewingDocsUser.verificationDocs || viewingDocsUser.verificationDocs.length === 0) ? (
                           <div className="py-20 text-center text-slate-400 font-sans border-2 border-dashed border-slate-200 rounded-[24px]">
                              Ce membre n'a joint aucun document de validation pour le moment.
                           </div>
                        ) : (
                           viewingDocsUser.verificationDocs.map(doc => {
                              const isImage = doc.url.startsWith('data:image/');
                              const labelTranslation = 
                                 doc.type === 'cni_passport' ? "Carte Nationale d'Identité / Passeport" :
                                 doc.type === 'casier_judiciaire' ? "Casier Judiciaire (Bulletin N°3)" :
                                 doc.type === 'justificatif_domicile' ? "Justificatif de Domicile (CIE / SODECI)" : doc.type;

                              return (
                                 <div key={doc.type} className="bg-slate-50/50 p-5 rounded-3xl border border-slate-100 flex flex-col gap-4">
                                    <div className="flex justify-between items-start gap-3">
                                       <div className="flex items-start gap-2.5">
                                          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">
                                             <FileText className="h-5 w-5" />
                                          </div>
                                          <div>
                                             <h5 className="font-extrabold text-xs text-slate-800 uppercase tracking-tight leading-normal">{labelTranslation}</h5>
                                             <p className="text-[10px] text-slate-400 font-medium font-sans">Nommé: <span className="text-slate-500 font-mono font-bold">{doc.name}</span></p>
                                             <p className="text-[10px] text-slate-450 mt-0.5 font-sans">Transmis le: {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Date non disponible'}</p>
                                          </div>
                                       </div>
                                       
                                       {/* Badge states */}
                                       <div>
                                          {doc.status === 'pending' ? (
                                             <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider">
                                                ⌛ À Valider
                                             </span>
                                          ) : doc.status === 'approved' ? (
                                             <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                                                ✓ Approuvée
                                             </span>
                                          ) : (
                                             <span className="bg-red-100 text-red-00 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider">
                                                ✗ Rejetée
                                             </span>
                                          )}
                                       </div>
                                    </div>

                                    {/* Document Visual Panel */}
                                    <div className="relative group rounded-2xl overflow-hidden border border-slate-200/60 shadow-sm bg-white p-2">
                                       {isImage ? (
                                          <div className="relative max-h-56 overflow-hidden bg-slate-100 rounded-xl flex items-center justify-center">
                                             <img src={doc.url} alt={doc.name} className="max-h-56 object-contain w-full" />
                                             <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                <button 
                                                  onClick={() => setZoomedFileUrl(doc.url)}
                                                  className="bg-white hover:bg-slate-100 text-slate-800 px-4 py-2 rounded-xl text-xs font-bold uppercase transition-transform scale-95 group-hover:scale-100 flex items-center gap-1 cursor-pointer"
                                                >
                                                   <Eye className="h-3.5 w-3.5" /> Agrandir
                                                </button>
                                                <a 
                                                  href={doc.url} 
                                                  download={doc.name}
                                                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase transition-transform scale-95 group-hover:scale-100 flex items-center gap-1 cursor-pointer"
                                                >
                                                   Télécharger
                                                </a>
                                             </div>
                                          </div>
                                       ) : (
                                          <div className="py-6 px-4 bg-slate-50 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                                             <div className="flex items-center gap-3">
                                                <Paperclip className="h-5 w-5 text-slate-500" />
                                                <div className="text-left">
                                                   <p className="text-xs font-bold text-slate-700 font-mono truncate max-w-xs">{doc.name}</p>
                                                   <p className="text-[10px] text-slate-450">Fichier PDF ou Document de validation</p>
                                                </div>
                                             </div>
                                             <a 
                                               href={doc.url} 
                                               download={doc.name}
                                               className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2.5 rounded-xl text-xs font-bold uppercase flex items-center gap-1 cursor-pointer transition-colors"
                                             >
                                                Télécharger le PDF
                                             </a>
                                          </div>
                                       )}
                                    </div>

                                    {/* Decision Moderator Handles */}
                                    <div className="flex gap-2.5 border-t border-slate-100 pt-3 mt-1">
                                       <button 
                                         onClick={() => approveIndividualDoc(doc.type)}
                                         disabled={doc.status === 'approved'}
                                         className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer transition-all ${doc.status === 'approved' ? 'bg-emerald-50 text-emerald-500 border border-emerald-100/50 cursor-not-allowed opacity-80' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200/20'}`}
                                       >
                                          ✓ Approuver cette pièce
                                       </button>
                                       <button 
                                         onClick={() => rejectIndividualDoc(doc.type)}
                                         disabled={doc.status === 'rejected'}
                                         className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer transition-all ${doc.status === 'rejected' ? 'bg-red-50 text-red-100 border border-red-100/50 cursor-not-allowed opacity-80' : 'bg-red-50 text-red-650 hover:bg-red-100 border border-red-200/20'}`}
                                       >
                                          ✗ Rejeter cette pièce
                                       </button>
                                    </div>
                                 </div>
                              );
                           })
                        )}
                     </div>
                  </div>
               </motion.div>
            </div>
          )}

          {zoomedFileUrl && (
            <div 
              onClick={() => setZoomedFileUrl(null)}
              className="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-[200] flex items-center justify-center p-4 cursor-zoom-out"
            >
              <button 
                onClick={() => setZoomedFileUrl(null)}
                className="absolute top-6 right-6 w-12 h-12 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition-colors border border-white/20 cursor-pointer"
              >
                <X className="h-6 w-6" />
              </button>
              <motion.img 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                src={zoomedFileUrl} 
                className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl" 
              />
            </div>
          )}

          {previewCv && (
            <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[150] flex items-center justify-center p-4">
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-[32px] w-full max-w-4xl h-[85vh] overflow-hidden shadow-2xl flex flex-col border border-slate-100"
              >
                {/* Modal Header */}
                <div className="px-6 py-4 border-b border-slate-150 bg-slate-50/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center border border-amber-100 text-xl">
                      📄
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-800 truncate max-w-[200px] sm:max-w-md uppercase tracking-tight">
                        CV : {previewCv.name}
                      </h4>
                      <p className="text-[10px] font-medium text-slate-400">
                        Aperçu sécurisé du document candidat
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <a 
                      href={previewCv.url} 
                      download={previewCv.name}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 hover:scale-[1.02] active:scale-[0.98] transition-all text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm shadow-emerald-500/10 cursor-pointer"
                    >
                      <span>📥</span>
                      <span>Télécharger</span>
                    </a>
                    
                    <a 
                      href={previewCv.url} 
                      target="_blank" 
                      rel="noreferrer"
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 transition-colors text-slate-600 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>🗎</span>
                      <span className="hidden sm:inline">Nouvel Onglet</span>
                    </a>

                    <button 
                      onClick={() => setPreviewCv(null)} 
                      className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors cursor-pointer"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Modal Body / Viewport */}
                <div className="flex-1 bg-slate-100 flex flex-col p-4 overflow-hidden justify-center items-center">
                  {previewCv.url ? (
                    previewCv.url.startsWith('data:image/') ? (
                      <div className="overflow-auto max-w-full max-h-full flex justify-center items-center p-4">
                        <img 
                          src={previewCv.url} 
                          alt={previewCv.name} 
                          className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg border border-slate-200 bg-white" 
                        />
                      </div>
                    ) : (
                      <iframe 
                        src={previewCv.url} 
                        className="w-full h-full rounded-2xl border border-slate-200 bg-white shadow-inner" 
                        title="Aperçu du CV"
                      />
                    )
                  ) : (
                    <div className="text-center py-12 px-6">
                       <span className="text-5xl block mb-4">⚠️</span>
                       <p className="text-sm font-bold text-slate-700">Contenu indisponible</p>
                       <p className="text-xs text-slate-400 mt-1">Le format de ce fichier ne permet pas un aperçu direct. Veuillez le télécharger.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}

          {selectedManageJob && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[130] flex items-center justify-center p-4 overflow-y-auto">
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-[32px] w-full max-w-lg overflow-hidden shadow-2xl border border-slate-100 flex flex-col font-sans"
              >
                {/* Modal Header */}
                <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center border border-emerald-100 text-lg">
                      📋
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">
                        {isEditingJob ? "Modifier l'offre" : "Options de l'offre"}
                      </h4>
                      <p className="text-[10px] font-bold text-emerald-600 mt-0.5 tracking-wide">
                        {isEditingJob ? "Modification détaillée" : "Gestion de l'annonce"}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => { setSelectedManageJob(null); setIsEditingJob(false); }}
                    className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 overflow-y-auto max-h-[70vh]">
                  {isEditingJob ? (
                    <form onSubmit={handleUpdateJob} className="space-y-4 text-left">
                      <div>
                        <label className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">Intitulé du poste</label>
                        <input 
                          required 
                          className="w-full bg-slate-50 px-4 py-3 rounded-xl border-none focus:ring-1 focus:ring-emerald-500 outline-none h-12 font-semibold text-slate-800" 
                          value={editJobForm.title} 
                          onChange={e => setEditJobForm({...editJobForm, title: e.target.value})} 
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">Catégorie</label>
                          <select 
                            className="w-full bg-slate-50 px-4 py-3 rounded-xl border-none focus:ring-1 focus:ring-emerald-500 outline-none h-12 font-semibold text-slate-800 text-sm"
                            value={editJobForm.category}
                            onChange={e => setEditJobForm({...editJobForm, category: e.target.value as any})}
                          >
                            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">Ville</label>
                          <select 
                            className="w-full bg-slate-50 px-4 py-3 rounded-xl border-none focus:ring-1 focus:ring-emerald-500 outline-none h-12 font-semibold text-slate-800 text-sm"
                            value={editJobForm.location}
                            onChange={e => setEditJobForm({...editJobForm, location: e.target.value})}
                          >
                            {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">Rémunération mensuelle (FCFA)</label>
                        <input 
                          required 
                          className="w-full bg-slate-50 px-4 py-3 rounded-xl border-none focus:ring-1 focus:ring-emerald-500 outline-none h-12 font-semibold text-slate-800" 
                          value={editJobForm.salaryRange} 
                          onChange={e => setEditJobForm({...editJobForm, salaryRange: e.target.value})} 
                        />
                      </div>

                      <div>
                        <label className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">Description & Profil</label>
                        <textarea 
                          required 
                          rows={4} 
                          className="w-full bg-slate-50 px-4 py-3 rounded-xl border-none focus:ring-1 focus:ring-emerald-500 outline-none font-medium text-slate-700 text-sm" 
                          value={editJobForm.description} 
                          onChange={e => setEditJobForm({...editJobForm, description: e.target.value})} 
                        />
                      </div>

                      <div className="flex gap-3 justify-end pt-5 border-t border-slate-100">
                        <button 
                          type="button" 
                          onClick={() => setIsEditingJob(false)}
                          className="px-5 py-3 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all font-sans cursor-pointer"
                        >
                          Retour
                        </button>
                        <button 
                          type="submit" 
                          className="px-5 py-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all font-sans cursor-pointer"
                        >
                          Enregistrer
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-4 text-left">
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/40">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Intitulé du poste</p>
                        <p className="text-sm font-bold text-slate-800">{selectedManageJob.title}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/40">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Ville</p>
                          <p className="text-xs font-semibold text-slate-700">{selectedManageJob.location}</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/40">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Rémunération</p>
                          <p className="text-xs font-semibold text-slate-700">{selectedManageJob.salaryRange} FCFA</p>
                        </div>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/40">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">État de l'annonce</p>
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${getJobStatusLabel(selectedManageJob.status).color}`}>
                          {getJobStatusLabel(selectedManageJob.status).text}
                        </span>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/40">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Description de la mission</p>
                        <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed font-sans">{selectedManageJob.description}</p>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-slate-100">
                        <button 
                          onClick={() => setIsEditingJob(true)}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer text-center"
                        >
                          Modifier l'offre
                        </button>
                        <button 
                          onClick={() => {
                            const id = selectedManageJob.id;
                            setSelectedManageJob(null);
                            deleteJobAction(id);
                          }}
                          className="flex-1 bg-red-50 hover:bg-red-105 text-red-650 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer text-center"
                        >
                          Supprimer l'offre
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}

         {confirmation && (
           <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-[32px] w-full max-w-sm overflow-hidden shadow-2xl p-8 text-center font-sans border border-slate-100"
              >
                 <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-5 border border-red-100">
                    <AlertTriangle className="h-6 w-6" />
                 </div>
                 <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">{confirmation.title}</h4>
                 <p className="text-xs text-slate-400 font-medium mb-6 leading-relaxed px-2">{confirmation.message}</p>
                 <div className="flex gap-3">
                    <button 
                      onClick={() => {
                        confirmation.onConfirm();
                        setConfirmation(null);
                      }}
                      className="flex-1 bg-red-600 hover:bg-red-700 hover:scale-[1.02] active:scale-[0.98] text-white py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                    >
                       Confirmer
                    </button>
                    <button 
                      onClick={() => setConfirmation(null)}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 hover:scale-[1.02] active:scale-[0.98] text-slate-600 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
                    >
                       Annuler
                    </button>
                 </div>
              </motion.div>
           </div>
         )}
      </AnimatePresence>
    </div>
  );
}
