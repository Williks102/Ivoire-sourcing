import { Query } from 'appwrite';
import { databases, APPWRITE_CONFIG } from '../lib/appwrite';
import { authFetch } from '../lib/api';
import { Application, JobPost, UserProfile, VerificationDoc } from '../types';
import { Quote } from '../lib/quote';

const DB = APPWRITE_CONFIG.DATABASE_ID;

export interface PdfDoc { filename: string; pdfBase64: string }

/** Modèle de devis enregistré par un artisan (réutilisable lors d'une offre). */
export interface QuoteTemplate { id: string; name: string; quote: Quote | null; total: number; createdAt: string; updatedAt: string }

export interface OutreachCandidate {
  id: string;
  name: string;
  firstName: string;
  trades: string[];
  specialties: string[];
  rating: number;
  reviewCount: number;
  isVerified: boolean;
  experienceYears: number;
  whatsapp: string;
  zoneUnknown: boolean;
  contactedAt: string | null;
}

export interface AdminPayment {
  id: string;
  reference: string;
  jobId: string;
  employerId: string;
  artisanId: string;
  amount: number;
  commission: number;
  payout: number;
  channel: string;
  status: 'initiated' | 'success' | 'failed' | 'mismatch';
  createdAt: string;
  paidAt?: string;
}
const withId = <T,>(doc: any) => ({ id: doc.$id, ...doc }) as T;

export const missionService = {
  /** Missions publiées par un client. */
  async listClientMissions(clientId: string): Promise<JobPost[]> {
    const res = await databases.listDocuments(DB, 'jobs', [
      Query.equal('employerId', clientId),
      Query.orderDesc('$createdAt'),
      Query.limit(100),
    ]);
    return res.documents.map((d) => withId<JobPost>(d));
  },

  /** Offres reçues sur une mission. */
  async listOffers(missionId: string): Promise<Application[]> {
    const res = await databases.listDocuments(DB, 'applications', [
      Query.equal('jobId', missionId),
      Query.limit(100),
    ]);
    return res.documents.map((d) => withId<Application>(d));
  },

  /** Offres envoyées par un artisan. */
  async listArtisanOffers(artisanId: string): Promise<Application[]> {
    const res = await databases.listDocuments(DB, 'applications', [
      Query.equal('candidateId', artisanId),
      Query.orderDesc('$createdAt'),
      Query.limit(100),
    ]);
    return res.documents.map((d) => withId<Application>(d));
  },

  /** Missions confiées à un artisan. */
  async listArtisanMissions(artisanId: string): Promise<JobPost[]> {
    const res = await databases.listDocuments(DB, 'jobs', [
      Query.equal('assignedArtisanId', artisanId),
      Query.orderDesc('$createdAt'),
      Query.limit(100),
    ]);
    return res.documents.map((d) => withId<JobPost>(d));
  },

  async getMission(id: string): Promise<JobPost> {
    return withId<JobPost>(await databases.getDocument(DB, 'jobs', id));
  },

  /** Publie une mission via le serveur (modération + identité vérifiées côté serveur). */
  createMission: (input: {
    title: string;
    description: string;
    category: string;
    location: string;
    address?: string;
    scheduledDate?: string;
    budget: number;
  }) =>
    authFetch<{ id: string; status: 'approved' | 'pending'; hints?: { missing: string[]; suggestedCategory: string | null } }>(
      '/api/missions/create',
      input,
    ),

  /** Envoie une offre (devis) sur une mission, via le serveur. */
  submitOffer: (input: {
    mission: JobPost;
    artisanName: string;
    experienceYears: number;
    proposedPrice: number;
    delay: string;
    message: string;
    /** Devis détaillé facultatif : le serveur recalcule le total, qui devient le prix de l'offre. */
    quote?: Quote;
  }) =>
    authFetch('/api/missions/offer', {
      missionId: input.mission.id,
      artisanName: input.artisanName,
      experienceYears: input.experienceYears,
      proposedPrice: input.proposedPrice,
      delay: input.delay,
      message: input.message,
      quote: input.quote,
    }),

  // --- Profil et pièces justificatives (écritures par le serveur uniquement) ---
  ensureProfile: (role: 'employer' | 'candidate', displayName?: string) =>
    authFetch<{ profile: UserProfile }>('/api/profile', { action: 'ensure', role, displayName }),
  updateProfile: (fields: Partial<Pick<UserProfile, 'displayName' | 'bio' | 'location' | 'phone' | 'skills' | 'trades' | 'experienceYears' | 'serviceCities' | 'whatsappConsent' | 'businessName' | 'businessRegistration'>>) =>
    authFetch<{ profile: UserProfile }>('/api/profile', { action: 'update', fields }),
  telegramLink: () => authFetch<{ url: string }>('/api/profile', { action: 'telegramLink' }),
  telegramUnlink: () => authFetch<{ profile: UserProfile }>('/api/profile', { action: 'telegramUnlink' }),
  /** Admin : prévient les artisans concernés après validation d'une mission. */
  notifyArtisans: (missionId: string) => authFetch<{ sent: number }>('/api/admin/outreach', { action: 'notifyTelegram', missionId }),
  uploadDoc: (type: VerificationDoc['type'], dataBase64: string) => authFetch<{ doc: VerificationDoc }>('/api/files', { type, dataBase64 }),
  fetchFile: (fileId: string) => authFetch<{ mime: string; ext: string; dataBase64: string }>('/api/files', { fileId }),

  // --- Modèles de devis de l'artisan (serveur : chacun ne voit que les siens) ---
  listQuoteTemplates: () => authFetch<{ templates: QuoteTemplate[]; max: number }>('/api/quotes', { action: 'list' }),
  saveQuoteTemplate: (name: string, quote: Quote, id?: string) => authFetch<{ template: QuoteTemplate }>('/api/quotes', { action: 'save', id, name, quote }),
  deleteQuoteTemplate: (id: string) => authFetch('/api/quotes', { action: 'delete', id }),

  // --- Documents PDF produits par le serveur ---
  quotePdf: (applicationId: string) => authFetch<PdfDoc>('/api/documents', { kind: 'quote', applicationId }),
  receiptPdf: (missionId: string) => authFetch<PdfDoc>('/api/documents', { kind: 'receipt', missionId }),
  statementPdf: (year: number) => authFetch<PdfDoc>('/api/documents', { kind: 'statement', year }),
  /** Aperçu PDF d'un devis en cours de rédaction (rien n'est enregistré). */
  draftPdf: (name: string, quote: Quote) => authFetch<PdfDoc>('/api/documents', { kind: 'draft', name: name || undefined, quote }),

  // --- Administration (réservé au label admin, vérifié côté serveur) ---
  adminListPayments: (offset = 0) =>
    authFetch<{ payments: AdminPayment[]; total: number }>('/api/admin/payments', { action: 'list', offset }),
  adminMarkPayoutSent: (missionId: string, reference?: string) =>
    authFetch('/api/admin/payments', { action: 'markPayoutSent', missionId, reference }),

  // --- Diffusion d'une mission aux artisans concernés (admin) ---
  adminOutreachCandidates: (missionId: string) =>
    authFetch<{ candidates: OutreachCandidate[]; excluded: { noConsent: number; noPhone: number }; aiAvailable: boolean }>('/api/admin/outreach', {
      action: 'candidates',
      missionId,
    }),
  adminOutreachDraft: (missionId: string, useAi: boolean) =>
    authFetch<{ message: string; source: 'ai' | 'template' }>('/api/admin/outreach', { action: 'draftMessage', missionId, useAi }),
  adminOutreachMark: (missionId: string, artisanId: string) =>
    authFetch('/api/admin/outreach', { action: 'markContacted', missionId, artisanId }),

  // --- Transitions contrôlées par le serveur ---
  /** Accepter le dernier prix de l'autre partie (le prix affiché protège contre un changement de dernière minute). */
  acceptPrice: (applicationId: string, expectedPrice: number) =>
    authFetch('/api/missions/negotiate', { action: 'accept', applicationId, expectedPrice }),
  counterOffer: (applicationId: string, price: number, note: string | undefined, expectedPrice: number) =>
    authFetch('/api/missions/negotiate', { action: 'counter', applicationId, price, note: note || undefined, expectedPrice }),
  /** Client : refuser l'offre. Artisan : retirer son offre. */
  declineOffer: (applicationId: string) => authFetch('/api/missions/negotiate', { action: 'decline', applicationId }),

  markCompleted: (missionId: string) => authFetch('/api/missions/transition', { action: 'complete', missionId }),

  /** Paiement de fin de mission : renvoie l'URL de la passerelle. Le montant est décidé par le serveur. */
  startPayment: (missionId: string, channel: string, phoneNumber?: string) =>
    authFetch<{ paymentUrl: string; amount: number; commission: number; payout: number }>('/api/pay', {
      missionId,
      channel,
      phoneNumber,
    }),
};
