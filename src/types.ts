// Rôles techniques conservés pour compatibilité avec les données existantes :
//   'employer'  = Client (publie des missions et paie en fin de mission)
//   'candidate' = Artisan / prestataire (propose des offres et réalise les missions)
export type UserRole = 'employer' | 'candidate' | 'admin';

export interface VerificationDoc {
  name: string;
  type: 'cni_passport' | 'casier_judiciaire' | 'justificatif_domicile';
  status: 'pending' | 'approved' | 'rejected';
  uploadedAt: string;
  /** Fichier dans le stockage privé (téléversé via le serveur) ; lu par /api/files. */
  fileId?: string;
  mime?: string;
  size?: number;
  /** @deprecated ancien stockage en base64, lu seulement s'il s'agit d'une image. */
  url?: string;
}

export interface UserProfile {
  uid: string;
  role: UserRole;
  displayName: string;
  email: string;
  photoURL?: string;
  location?: string;
  bio?: string;
  /** Spécialités libres (ex: « Débouchage »). */
  skills: string[];
  /** Métiers exercés : identifiants de CATEGORIES (ex: « plomberie »). Artisans uniquement. */
  trades?: string[];
  experienceYears?: number;
  /** Villes où l'artisan accepte d'intervenir. */
  serviceCities?: string[];
  /** L'artisan accepte d'être contacté par WhatsApp pour des missions (explicite, jamais coché par défaut). */
  whatsappConsent?: boolean;
  /** Notifications Telegram reliées (l'identifiant de conversation reste côté serveur). */
  telegramLinked?: boolean;
  whatsappConsentAt?: string;
  /** Informations d'entreprise facultatives (devis et reçus). */
  businessName?: string;
  businessRegistration?: string;
  isVerified: boolean;
  isPremium: boolean;
  averageRating: number;
  reviewCount: number;
  phone?: string;
  cvName?: string;
  cvUrl?: string;
  createdAt: string;
  verificationDocs?: VerificationDoc[];
}

// Cycle de vie d'une mission (le paiement n'intervient qu'à la fin) :
//   pending -> approved (ouverte) -> assigned -> completed -> paid
export type MissionStatus =
  | 'pending'   // en attente de modération
  | 'approved'  // ouverte : reçoit des offres
  | 'assigned'  // une offre acceptée, mission en cours
  | 'completed' // terminée par l'artisan, en attente de validation + paiement du client
  | 'paid'      // payée par le client
  | 'rejected'
  | 'closed';

/** Une mission = une annonce publiée par un client (collection Appwrite `jobs`). */
export interface JobPost {
  id: string;
  employerId: string;
  title: string;
  description: string;
  category: string;
  location: string;
  address?: string;
  scheduledDate?: string;
  /** Budget indicatif du client, en FCFA. */
  budget: number;
  /** @deprecated ancien champ texte (recrutement) conservé pour lire les anciennes annonces. */
  salaryRange?: string;
  status: MissionStatus;
  isPremium?: boolean;
  createdAt: string;
  // Renseignés côté serveur uniquement :
  assignedArtisanId?: string;
  assignedApplicationId?: string;
  agreedPrice?: number;
  assignedAt?: string;
  completedAt?: string;
  paidAt?: string;
  paymentReference?: string;
  commissionAmount?: number;
  artisanPayout?: number;
  payoutStatus?: 'pending' | 'sent';
  payoutSentAt?: string;
  payoutReference?: string;
  // Analyse IA faite à la publication (facultative) :
  aiSummary?: string;
  aiTags?: string[];
  aiMissing?: string[];
  aiCategory?: string;
}

export interface Application {
  id: string;
  jobId: string;
  candidateId: string;
  employerId: string;
  // 'pending' = en discussion ; 'rejected' = refusée par le client ; 'withdrawn' = retirée par l'artisan ; 'approved' = ancien libellé de 'accepted'
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'approved';
  message: string;
  /** Prix proposé par l'artisan, en FCFA. Devient le prix convenu si l'offre est acceptée. */
  proposedPrice?: number;
  /** Délai / disponibilité annoncé (texte libre). */
  delay?: string;
  /** Négociation : qui a fait la dernière proposition, nombre de propositions, historique (JSON). */
  lastProposedBy?: 'artisan' | 'client';
  rounds?: number;
  history?: string;
  /** Devis détaillé facultatif (JSON). */
  quote?: string;
  /** Métiers de l'artisan au moment de l'offre (copiés de son profil par le serveur). */
  trades?: string[];
  createdAt: string;
  candidateName?: string;
  photoURL?: string;
  experienceYears?: number;
  cvName?: string;
  cvUrl?: string;
}

export interface Review {
  id: string;
  targetUserId: string;
  authorId: string;
  jobId: string;
  rating: number;
  comment: string;
  createdAt: string;
}
