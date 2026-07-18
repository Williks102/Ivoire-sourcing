// src/services/applicationService.ts
import { Query } from 'appwrite';
import { databases, APPWRITE_CONFIG } from '../lib/appwrite';
import { Application } from '../types';

const APPLICATIONS_COLLECTION_ID = 'applications';

function toApplication(document: any): Application {
  const { $id, $collectionId, $databaseId, $createdAt, $updatedAt, $permissions, ...rest } = document;
  return { ...rest, id: $id } as Application;
}

export const applicationService = {
  async listAllApplications(limitCount = 100): Promise<Application[]> {
    try {
      const response = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, APPLICATIONS_COLLECTION_ID, [
        Query.limit(limitCount)
      ]);
      return response.documents.map(toApplication);
    } catch (error: any) {
      console.error("[ApplicationService] Erreur listage des candidatures:", error);
      throw new Error("Impossible de charger les candidatures.");
    }
  },

  async listApplicationsByEmployer(employerId: string): Promise<Application[]> {
    try {
      const response = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, APPLICATIONS_COLLECTION_ID, [
        Query.equal('employerId', employerId)
      ]);
      return response.documents.map(toApplication);
    } catch (error: any) {
      console.error("[ApplicationService] Erreur listage des candidatures reçues:", error);
      throw new Error("Impossible de charger les candidatures reçues.");
    }
  },

  async listApplicationsByCandidate(candidateId: string): Promise<Application[]> {
    try {
      const response = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, APPLICATIONS_COLLECTION_ID, [
        Query.equal('candidateId', candidateId)
      ]);
      return response.documents.map(toApplication);
    } catch (error: any) {
      console.error("[ApplicationService] Erreur listage de vos candidatures:", error);
      throw new Error("Impossible de charger vos candidatures.");
    }
  },

  async updateApplicationStatus(applicationId: string, status: Application['status']): Promise<void> {
    try {
      await databases.updateDocument(APPWRITE_CONFIG.DATABASE_ID, APPLICATIONS_COLLECTION_ID, applicationId, { status });
    } catch (error: any) {
      console.error("[ApplicationService] Erreur mise à jour du statut:", error);
      throw new Error("Impossible de mettre à jour le statut de la candidature.");
    }
  },

  async deleteApplication(applicationId: string): Promise<void> {
    try {
      await databases.deleteDocument(APPWRITE_CONFIG.DATABASE_ID, APPLICATIONS_COLLECTION_ID, applicationId);
    } catch (error: any) {
      console.error("[ApplicationService] Erreur suppression de la candidature:", error);
      throw new Error("Impossible de supprimer cette candidature.");
    }
  }
};
