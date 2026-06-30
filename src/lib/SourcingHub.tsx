import React, { useEffect, useState, createContext, useContext, useMemo } from 'react';
type Unsubscribe = () => void;
import { db, auth, doc, setDoc, getDoc, deleteDoc, collection, query, where, limit, getDocs, addDoc, signOut, onSnapshot, isBackendAvailable, getIsBackendAvailable, disableBackend, rawConfig, googleProvider } from './backend';
import { UserProfile, JobPost, Application } from '../types';

// ==========================================
// 1. DÉFINITION DES TYPES ET ACTIONS
// ==========================================

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface SourcingHubError {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  };
}

// Fonction centralisée de gestion d'erreurs respectant la politique de sécurité d'IvoireSource
function handleHubError(error: unknown, operation: OperationType, path: string | null) {
  const errInfo: SourcingHubError = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid || 'anonymous',
      email: auth?.currentUser?.email || null,
    },
    operationType: operation,
    path
  };
  console.error('[SOURCING_HUB ERROR] ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Métriques consolidées en temps réel (communes aux 3 dashboards)
export interface SourcingMetrics {
  totalCandidates: number;
  availableCandidates: number;      // Candidats disponibles immédiatement
  activeJobs: number;               // Missions en cours / approuvées
  pendingVerifications: number;      // Dossiers admin en attente de vérification
  ongoingRecruitments: number;       // Candidatures acceptées d'une mission en cours
  popularCategory: string;           // Catégorie la plus demandée (nounou, chauffeur etc.)
}

// État global du Hub local réactif
interface HubState {
  candidates: UserProfile[];
  jobs: JobPost[];
  applications: Application[];
  metrics: SourcingMetrics;
  loading: boolean;
}

// ==========================================
// 2. LE CONTEXTE ARCHITECTURAL SOURCING HUB
// ==========================================

const SourcingHubContext = createContext<HubState | null>(null);

/**
 * SourcingHubProvider : Composant conteneur unique qui gère l'orchestration des écouteurs
 * temps réel de Backend de manière unifiée pour l'ensemble de l'application.
 * 
 * Il élimine la duplication de code et garantit que les candidats, employeurs, 
 * et administrateurs voient exactement les mêmes données synchronisées en temps réel.
 */
export function SourcingHubProvider({ children, currentUser }: { children: React.ReactNode; currentUser: any }) {
  const [candidates, setCandidates] = useState<UserProfile[]>([]);
  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Si Backend n'est pas disponible ou aucun utilisateur n'est connecté, on arrête l'écoute en direct
    if (!isBackendAvailable || !currentUser) {
      setLoading(false);
      return;
    }

    const unsubscribes: Unsubscribe[] = [];
    setLoading(true);

    try {
      // Écouteur 1 : Collection des utilisateurs (Candidats dispos)
      // On optimise en écoutant uniquement les candidats pour minimiser le coût réseau
      const candidatesQuery = query(
        collection(db, 'users'), 
        where('role', '==', 'candidate')
      );
      const unsubCandidates = onSnapshot(candidatesQuery, (snapshot) => {
        const list: UserProfile[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ uid: docSnap.id, ...docSnap.data() } as UserProfile);
        });
        setCandidates(list);
      }, (error) => {
        handleHubError(error, OperationType.LIST, 'users');
      });
      unsubscribes.push(unsubCandidates);

      // Écouteur 2 : Collection des Missions (Jobs) en cours
      const jobsQuery = collection(db, 'jobs');
      const unsubJobs = onSnapshot(jobsQuery, (snapshot) => {
        const list: JobPost[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as JobPost);
        });
        setJobs(list);
      }, (error) => {
        handleHubError(error, OperationType.LIST, 'jobs');
      });
      unsubscribes.push(unsubJobs);

      // Écouteur 3 : Collection des candidatures (Applications)
      const appsQuery = collection(db, 'applications');
      const unsubApps = onSnapshot(appsQuery, (snapshot) => {
        const list: Application[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as Application);
        });
        setApplications(list);
        setLoading(false);
      }, (error) => {
        handleHubError(error, OperationType.LIST, 'applications');
      });
      unsubscribes.push(unsubApps);

    } catch (e) {
      console.error('[SOURCING_HUB] Erreur lors du montage des écouteurs réactifs:', e);
      setLoading(false);
    }

    // Nettoyage automatique des écouteurs lors du démontage ou changement d'utilisateur
    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [currentUser]);

  // ==========================================
  // 3. PROJECTIONS ET CALCUL DES MÉTRIQUES (DRY & MEMOIZED)
  // ==========================================
  
  // Les métriques globales sont calculées dynamiquement à partir du store local synchronisé.
  // Aucun appel API redondant n'est fait. Si une candidature ou un profil change sur le réseau,
  // la métrique se recalcule instantanément en local avec un coût de rendu O(1).
  const metrics = useMemo<SourcingMetrics>(() => {
    // 1. Calcul du nombre de candidats disponibles
    // En Côte d'Ivoire Sourcing, "disponible" signifie être vérifié et ne pas être engagé actuellement
    const available = candidates.filter(c => c.isVerified);

    // 2. Jobs actifs
    const activeJobsList = jobs.filter(j => j.status === 'approved');

    // 3. Demandes admin en attente (Justificatifs d'identité transmis à valider)
    // Nous cherchons les utilisateurs qui ont des pièces d'identité en status 'pending'
    const pendingSec = candidates.filter(c => {
      if (!c.verificationDocs) return false;
      return c.verificationDocs.some(docItem => docItem.status === 'pending');
    }).length;

    // 4. Recrutements en cours (Candidatures acceptées pour une mission approved)
    const ongoing = applications.filter(a => a.status === 'accepted' || a.status === 'approved').length;

    // 5. Catégories les plus populaires
    const categoryCounts: Record<string, number> = {};
    jobs.forEach(j => {
      categoryCounts[j.category] = (categoryCounts[j.category] || 0) + 1;
    });
    let bestCat = 'Aucune';
    let maxCount = 0;
    Object.entries(categoryCounts).forEach(([cat, count]) => {
      if (count > maxCount) {
        maxCount = count;
        bestCat = cat;
      }
    });

    return {
      totalCandidates: candidates.length,
      availableCandidates: available.length,
      activeJobs: activeJobsList.length,
      pendingVerifications: pendingSec,
      ongoingRecruitments: ongoing,
      popularCategory: bestCat.charAt(0).toUpperCase() + bestCat.slice(1)
    };
  }, [candidates, jobs, applications]);

  const value = useMemo(() => ({
    candidates,
    jobs,
    applications,
    metrics,
    loading
  }), [candidates, jobs, applications, metrics, loading]);

  return (
    <SourcingHubContext.Provider value={value}>
      {children}
    </SourcingHubContext.Provider>
  );
}

// ==========================================
// 4. HOOKS PERSONNALISÉS HAUTEMENT GÉNÉRIQUES
// ==========================================

export function useSourcingHub() {
  const context = useContext(SourcingHubContext);
  if (!context) {
    throw new Error("useSourcingHub doit être consommé à l'intérieur d'un SourcingHubProvider.");
  }
  return context;
}

/**
 * useSourcingMetrics : Récupère uniquement les KPI en temps réel de manière réactive.
 * Idéal pour l'affichage de compteurs lives sur les dashboards du Candidat, Recruteur et Admin.
 */
export function useSourcingMetrics() {
  const { metrics, loading } = useSourcingHub();
  return { metrics, loading };
}

/**
 * useSourcingUserContext : Récupère le contexte filtré d'un utilisateur spécifique.
 * Permet d'isoler la logique de chaque rôle sans dupliquer le code de requête.
 */
export function useSourcingUserContext(userId: string | undefined, role: 'candidate' | 'employer' | 'admin') {
  const { candidates, jobs, applications, loading } = useSourcingHub();

  return useMemo(() => {
    if (!userId) {
      return { 
        myProfile: null, 
        jobsAssociated: [], 
        applicationsAssociated: [], 
        loading 
      };
    }

    if (role === 'candidate') {
      const myProfile = candidates.find(c => c.uid === userId) || null;
      const apps = applications.filter(a => a.candidateId === userId);
      return {
        myProfile,
        jobsAssociated: jobs.filter(j => apps.some(a => a.jobId === j.id)),
        applicationsAssociated: apps,
        loading
      };
    }

    if (role === 'employer') {
      const employerJobs = jobs.filter(j => j.employerId === userId);
      return {
        myProfile: null,
        jobsAssociated: employerJobs,
        applicationsAssociated: applications.filter(a => a.employerId === userId),
        loading
      };
    }

    // Admin role got access to everything
    return {
      myProfile: null,
      jobsAssociated: jobs,
      applicationsAssociated: applications,
      allCandidates: candidates,
      loading
    };
  }, [userId, role, candidates, jobs, applications, loading]);
}
