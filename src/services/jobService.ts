// src/services/jobService.ts
import { ID, Query, Permission, Role } from 'appwrite';
import { databases, APPWRITE_CONFIG } from '../lib/appwrite';
import { JobPost } from '../types';

const JOBS_COLLECTION_ID = 'jobs';

function toJobPost(document: any): JobPost {
  const { $id, $collectionId, $databaseId, $createdAt, $updatedAt, $permissions, ...rest } = document;
  return { ...rest, id: $id } as JobPost;
}

function stripMetaFields(data: Partial<JobPost>) {
  const { id, ...safeData } = data as any;
  return safeData;
}

export const jobService = {
  async getJob(jobId: string): Promise<JobPost | null> {
    try {
      const document = await databases.getDocument(APPWRITE_CONFIG.DATABASE_ID, JOBS_COLLECTION_ID, jobId);
      return toJobPost(document);
    } catch (error: any) {
      if (error.code === 404) return null;
      console.error("[JobService] Erreur récupération de l'offre:", error);
      throw new Error("Impossible de charger cette offre d'emploi.");
    }
  },

  async listAllJobs(limitCount = 100): Promise<JobPost[]> {
    try {
      const response = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, JOBS_COLLECTION_ID, [
        Query.limit(limitCount)
      ]);
      return response.documents.map(toJobPost);
    } catch (error: any) {
      console.error("[JobService] Erreur listage des offres:", error);
      throw new Error("Impossible de charger les offres d'emploi.");
    }
  },

  async listJobsByEmployer(employerId: string): Promise<JobPost[]> {
    try {
      const response = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, JOBS_COLLECTION_ID, [
        Query.equal('employerId', employerId)
      ]);
      return response.documents.map(toJobPost);
    } catch (error: any) {
      console.error("[JobService] Erreur listage de vos offres:", error);
      throw new Error("Impossible de charger vos offres d'emploi.");
    }
  },

  /**
   * @param grantOwnerAccess À laisser `true` quand l'employeur crée sa propre offre (employerId =
   *   sa propre session). Mettre `false` quand un admin crée une offre pour un employerId qui n'est
   *   pas sa session actuelle (ex: 'system') — Appwrite refuse sinon d'accorder update/delete à un
   *   user qui n'est pas l'appelant (401). `label:admin` (permissions de collection) suffit alors.
   */
  async createJob(data: Omit<JobPost, 'id'>, grantOwnerAccess = true): Promise<JobPost> {
    try {
      const permissions = grantOwnerAccess
        ? [Permission.read(Role.any()), Permission.update(Role.user(data.employerId)), Permission.delete(Role.user(data.employerId))]
        : [Permission.read(Role.any())];
      const document = await databases.createDocument(APPWRITE_CONFIG.DATABASE_ID, JOBS_COLLECTION_ID, ID.unique(), data, permissions);
      return toJobPost(document);
    } catch (error: any) {
      console.error("[JobService] Erreur création de l'offre:", error);
      throw new Error("Impossible de créer l'offre d'emploi.");
    }
  },

  async updateJob(jobId: string, data: Partial<Omit<JobPost, 'id'>>): Promise<JobPost> {
    try {
      const document = await databases.updateDocument(APPWRITE_CONFIG.DATABASE_ID, JOBS_COLLECTION_ID, jobId, stripMetaFields(data));
      return toJobPost(document);
    } catch (error: any) {
      console.error("[JobService] Erreur mise à jour de l'offre:", error);
      throw new Error("Impossible de mettre à jour l'offre d'emploi.");
    }
  },

  async deleteJob(jobId: string): Promise<void> {
    try {
      await databases.deleteDocument(APPWRITE_CONFIG.DATABASE_ID, JOBS_COLLECTION_ID, jobId);
    } catch (error: any) {
      console.error("[JobService] Erreur suppression de l'offre:", error);
      throw new Error("Impossible de supprimer l'offre d'emploi.");
    }
  }
};
