// Rôles techniques conservés pour compatibilité avec les données existantes :
//   'employer'  = Client (publie des missions et paie en fin de mission)
//   'candidate' = Artisan / prestataire (propose des offres et réalise les missions)
export type UserRole = 'employer' | 'candidate' | 'admin';

export interface VerificationDoc {
  name: string;
  type: 'cni_passport' | 'casier_judiciaire' | 'justificatif_domicile';
  status: 'pending' | 'approved' | 'rejected';
  uploadedAt: string;
  url?: string; // Storable base64
}

export interface UserProfile {
  uid: string;
  role: UserRole;
  displayName: string;
  email: string;
  photoURL?: string;
  location?: string;
  bio?: string;
  skills: string[];
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
}

export interface Application {
  id: string;
  jobId: string;
  candidateId: string;
  employerId: string;
  status: 'pending' | 'accepted' | 'rejected' | 'approved'; // 'approved' = ancien libellé de 'accepted'
  message: string;
  /** Prix proposé par l'artisan, en FCFA. Devient le prix convenu si l'offre est acceptée. */
  proposedPrice?: number;
  /** Délai / disponibilité annoncé (texte libre). */
  delay?: string;
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
