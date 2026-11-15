import { Query } from 'appwrite';
import { databases, APPWRITE_CONFIG } from '../lib/appwrite';
import { authFetch } from '../lib/api';
import { Application, JobPost } from '../types';

const DB = APPWRITE_CONFIG.DATABASE_ID;
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
  }) => authFetch<{ id: string; status: 'approved' | 'pending' }>('/api/missions/create', input),

  /** Envoie une offre (devis) sur une mission, via le serveur. */
  submitOffer: (input: {
    mission: JobPost;
    artisanName: string;
    experienceYears: number;
    proposedPrice: number;
    delay: string;
    message: string;
  }) =>
    authFetch('/api/missions/offer', {
      missionId: input.mission.id,
      artisanName: input.artisanName,
      experienceYears: input.experienceYears,
      proposedPrice: input.proposedPrice,
      delay: input.delay,
      message: input.message,
    }),

  // --- Transitions contrôlées par le serveur ---
  acceptOffer: (missionId: string, applicationId: string) =>
    authFetch('/api/missions/transition', { action: 'accept', missionId, applicationId }),

  markCompleted: (missionId: string) => authFetch('/api/missions/transition', { action: 'complete', missionId }),

  /** Paiement de fin de mission : renvoie l'URL de la passerelle. Le montant est décidé par le serveur. */
  startPayment: (missionId: string, channel: string, phoneNumber?: string) =>
    authFetch<{ paymentUrl: string; amount: number; commission: number; payout: number }>('/api/pay', {
      missionId,
      channel,
      phoneNumber,
    }),
};
