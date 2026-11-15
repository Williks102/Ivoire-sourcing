// src/services/sourcingService.ts
import { Query } from 'appwrite';
import { databases, APPWRITE_CONFIG } from '../lib/appwrite';

export const sourcingService = {
  /** Missions ouvertes aux offres (validées), de la plus récente à la plus ancienne. */
  async getApprovedJobs() {
    try {
      const response = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, 'jobs', [
        Query.equal('status', 'approved'),
        Query.orderDesc('$createdAt'),
        Query.limit(100),
      ]);
      return response.documents;
    } catch (error: any) {
      console.error('[SourcingService] Erreur récupération des missions:', error);
      throw new Error('Impossible de charger les missions.');
    }
  },
};
