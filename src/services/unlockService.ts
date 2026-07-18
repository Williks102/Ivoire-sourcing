// src/services/unlockService.ts
import { ID, Query, Permission, Role } from 'appwrite';
import { databases, APPWRITE_CONFIG } from '../lib/appwrite';

const UNLOCKS_COLLECTION_ID = 'unlocks';

export const unlockService = {
  /**
   * Enregistre le déblocage d'un profil candidat par un employeur.
   * Un ID déterministe `${employerId}_${candidateId}` dépasserait la limite Appwrite de 36
   * caractères (deux IDs de 20 caractères) — on vérifie donc l'existence par requête avant
   * de créer, avec un ID généré.
   */
  async unlockCandidate(employerId: string, candidateId: string): Promise<void> {
    try {
      const existing = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, UNLOCKS_COLLECTION_ID, [
        Query.equal('employerId', employerId),
        Query.equal('candidateId', candidateId),
        Query.limit(1)
      ]);
      if (existing.documents.length > 0) return; // déjà débloqué, pas une erreur

      await databases.createDocument(APPWRITE_CONFIG.DATABASE_ID, UNLOCKS_COLLECTION_ID, ID.unique(), {
        employerId,
        candidateId,
        createdAt: new Date().toISOString()
      }, [
        Permission.read(Role.user(employerId))
      ]);
    } catch (error: any) {
      console.error("[UnlockService] Erreur déblocage du candidat:", error);
      throw new Error("Impossible d'enregistrer le déblocage de ce profil.");
    }
  },

  async listUnlockedCandidateIds(employerId: string): Promise<string[]> {
    try {
      const response = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, UNLOCKS_COLLECTION_ID, [
        Query.equal('employerId', employerId)
      ]);
      return response.documents.map((document: any) => document.candidateId as string);
    } catch (error: any) {
      console.error("[UnlockService] Erreur listage des déblocages:", error);
      throw new Error("Impossible de charger vos profils débloqués.");
    }
  }
};
