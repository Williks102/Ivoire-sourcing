// src/services/sourcingService.ts
import { ID, Query } from 'appwrite';
import { databases, storage, APPWRITE_CONFIG } from '../lib/appwrite';

// ID du Bucket pour les CV (à créer dans la section Storage de votre console Appwrite)
const BUCKET_CV_ID = 'cv_bucket_id'; 

export const sourcingService = {
  
  /**
   * Récupère la liste des offres d'emploi validées/approuvées
   */
  async getApprovedJobs() {
    try {
      const response = await databases.listDocuments(
        APPWRITE_CONFIG.DATABASE_ID,
        'jobs', // ID de votre collection jobs
        [
          Query.equal('status', 'approved'),
          Query.orderDesc('$createdAt') // Trie du plus récent au plus ancien
        ]
      );
      return response.documents;
    } catch (error: any) {
      console.error("[SourcingService] Erreur récupération des offres:", error);
      throw new Error("Impossible de charger les offres d'emploi.");
    }
  },

  /**
   * Soumet une candidature : Upload le CV puis crée le document en base de données
   * @param jobId ID de l'offre d'emploi
   * @param candidateId ID de l'utilisateur connecté
   * @param cvFile Fichier PDF récupéré depuis un input <input type="file" />
   */
  async submitApplication(jobId: string, candidateId: string, cvFile: File) {
    try {
      // 1. Envoyer le fichier du CV dans le Storage d'Appwrite
      // ID.unique() permet à Appwrite de générer un identifiant de fichier unique
      const uploadedFile = await storage.createFile(BUCKET_CV_ID, ID.unique(), cvFile);
      
      // 2. Créer l'historique du profil ou de la candidature liée
      const applicationData = {
        jobId: jobId,
        candidateId: candidateId,
        status: 'applied',
        cvFileId: uploadedFile.$id // On stocke la référence du fichier ici
      };

      const document = await databases.createDocument(
        APPWRITE_CONFIG.DATABASE_ID,
        'applications', // ID de la collection applications
        ID.unique(),
        applicationData
      );

      return document;
    } catch (error: any) {
      console.error("[SourcingService] Échec du dépôt de candidature:", error);
      throw new Error("Une erreur est survenue lors de l'envoi de votre candidature.");
    }
  },

  /**
   * Récupérer l'URL de téléchargement ou de prévisualisation du CV
   */
  getCVPreviewUrl(fileId: string): string {
    return storage.getFileView(BUCKET_CV_ID, fileId).toString();
  }
};
