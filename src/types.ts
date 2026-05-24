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
  createdAt: string;
  verificationDocs?: VerificationDoc[];
}

export interface JobPost {
  id: string;
  employerId: string;
  title: string;
  description: string;
  category: 'nounou' | 'chauffeur' | 'boy' | 'cuisinier' | 'autre';
  location: string;
  salaryRange: string;
  status: 'pending' | 'approved' | 'rejected' | 'closed';
  isPremium: boolean;
  createdAt: string;
}

export interface Application {
  id: string;
  jobId: string;
  candidateId: string;
  employerId: string;
  status: 'pending' | 'accepted' | 'rejected' | 'approved'; // supporting both agreed/approved as used in UI/auth
  message: string;
  createdAt: string;
  candidateName?: string;
  photoURL?: string;
  experienceYears?: number;
  cvName?: string;
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
