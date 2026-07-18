// src/services/unlockService.ts
import { Query, Permission, Role } from 'appwrite';
import { databases, APPWRITE_CONFIG } from '../lib/appwrite';

const UNLOCKS_COLLECTION_ID = 'unlocks';

export const unlockService = {
  /**
   * Enregistre le déblocage d'un profil candidat par un employeur.
   * ID déterministe (employerId_candidateId) pour éviter les doublons.
   */
  async unlockCandidate(employerId: string, candidateId: string): Promise<void> {
    try {
      const unlockId = `${employerId}_${candidateId}`;
      await databases.createDocument(APPWRITE_CONFIG.DATABASE_ID, UNLOCKS_COLLECTION_ID, unlockId, {
        employerId,
        candidateId,
        createdAt: new Date().toISOString()
      }, [
        Permission.read(Role.user(employerId))
      ]);
    } catch (error: any) {
      if (error.code === 409) return; // déjà débloqué, pas une erreur
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
