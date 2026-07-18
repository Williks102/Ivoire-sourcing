// src/services/documentService.ts
import { ID } from 'appwrite';
import { storage } from '../lib/appwrite';

// Bucket unique pour tous les fichiers utilisateurs (CV de candidature, CV de profil, pièces de vérification)
const BUCKET_DOCUMENTS_ID = import.meta.env.VITE_APPWRITE_BUCKET_CV_ID || '';

export const documentService = {
  /**
   * Envoie un fichier vers Appwrite Storage et retourne son identifiant.
   */
  async uploadFile(file: File): Promise<string> {
    try {
      const uploaded = await storage.createFile(BUCKET_DOCUMENTS_ID, ID.unique(), file);
      return uploaded.$id;
    } catch (error: any) {
      console.error("[DocumentService] Erreur envoi du fichier:", error);
      throw new Error("Impossible d'envoyer ce fichier. Vérifiez le format et la taille (5 Mo max).");
    }
  },

  /**
   * URL de prévisualisation/téléchargement d'un fichier déjà envoyé.
   */
  getFileUrl(fileId: string): string {
    return storage.getFileView(BUCKET_DOCUMENTS_ID, fileId).toString();
  },

  async deleteFile(fileId: string): Promise<void> {
    try {
      await storage.deleteFile(BUCKET_DOCUMENTS_ID, fileId);
    } catch (error: any) {
      console.error("[DocumentService] Erreur suppression du fichier:", error);
    }
  }
};
