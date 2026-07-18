// src/services/userService.ts
import { Query, Permission, Role } from 'appwrite';
import { databases, APPWRITE_CONFIG } from '../lib/appwrite';
import { UserProfile } from '../types';

const USERS_COLLECTION_ID = 'users';

// Appwrite n'a pas de type d'attribut "tableau d'objets" : verificationDocs est donc
// stocké côté base comme une chaîne JSON, et désérialisé ici pour que le reste de
// l'app continue de manipuler un vrai tableau typé.
function toUserProfile(document: any): UserProfile {
  const { $id, $collectionId, $databaseId, $createdAt, $updatedAt, $permissions, ...rest } = document;
  if (typeof rest.verificationDocs === 'string') {
    try {
      rest.verificationDocs = JSON.parse(rest.verificationDocs);
    } catch {
      rest.verificationDocs = [];
    }
  }
  return { ...rest, uid: $id } as UserProfile;
}

function stripMetaFields(data: Partial<UserProfile>) {
  const { uid, ...safeData } = data as any;
  if (safeData.verificationDocs !== undefined) {
    safeData.verificationDocs = JSON.stringify(safeData.verificationDocs);
  }
  return safeData;
}

export const userService = {
  /**
   * Récupère le profil d'un utilisateur (document ID = uid Appwrite Auth)
   */
  async getUserProfile(uid: string): Promise<UserProfile | null> {
    try {
      const document = await databases.getDocument(APPWRITE_CONFIG.DATABASE_ID, USERS_COLLECTION_ID, uid);
      return toUserProfile(document);
    } catch (error: any) {
      if (error.code === 404) return null;
      console.error("[UserService] Erreur récupération du profil:", error);
      throw new Error("Impossible de charger le profil utilisateur.");
    }
  },

  /**
   * Crée le profil d'un utilisateur.
   * @param grantOwnerAccess À laisser `true` pour une auto-inscription (uid = compte Appwrite Auth
   *   de la session en cours, seul cas où Appwrite autorise le client à s'accorder update/delete).
   *   Mettre `false` quand un admin crée un profil pour un uid qui n'est pas la session actuelle
   *   (ex: compte "fantôme" sans compte Auth réel) — Appwrite rejette sinon la requête (401).
   *   Dans ce cas, seul `label:admin` (permissions de collection) garde le contrôle du document.
   */
  async createUserProfile(uid: string, data: Omit<UserProfile, 'uid'>, grantOwnerAccess = true): Promise<UserProfile> {
    try {
      const permissions = grantOwnerAccess
        ? [Permission.read(Role.any()), Permission.update(Role.user(uid)), Permission.delete(Role.user(uid))]
        : [Permission.read(Role.any())];
      const document = await databases.createDocument(APPWRITE_CONFIG.DATABASE_ID, USERS_COLLECTION_ID, uid, data, permissions);
      return toUserProfile(document);
    } catch (error: any) {
      console.error("[UserService] Erreur création du profil:", error);
      throw new Error("Impossible de créer le profil utilisateur.");
    }
  },

  /**
   * Met à jour partiellement le profil d'un utilisateur (équivalent merge:true)
   */
  async updateUserProfile(uid: string, data: Partial<UserProfile>): Promise<UserProfile> {
    try {
      const document = await databases.updateDocument(APPWRITE_CONFIG.DATABASE_ID, USERS_COLLECTION_ID, uid, stripMetaFields(data));
      return toUserProfile(document);
    } catch (error: any) {
      console.error("[UserService] Erreur mise à jour du profil:", error);
      throw new Error("Impossible de mettre à jour le profil utilisateur.");
    }
  },

  async deleteUserProfile(uid: string): Promise<void> {
    try {
      await databases.deleteDocument(APPWRITE_CONFIG.DATABASE_ID, USERS_COLLECTION_ID, uid);
    } catch (error: any) {
      console.error("[UserService] Erreur suppression du profil:", error);
      throw new Error("Impossible de supprimer ce compte utilisateur.");
    }
  },

  async listUsers(limitCount = 100): Promise<UserProfile[]> {
    try {
      const response = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, USERS_COLLECTION_ID, [
        Query.limit(limitCount)
      ]);
      return response.documents.map(toUserProfile);
    } catch (error: any) {
      console.error("[UserService] Erreur listage des utilisateurs:", error);
      throw new Error("Impossible de charger la liste des utilisateurs.");
    }
  },

  async listCandidates(limitCount = 50): Promise<UserProfile[]> {
    try {
      const response = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, USERS_COLLECTION_ID, [
        Query.equal('role', 'candidate'),
        Query.limit(limitCount)
      ]);
      return response.documents.map(toUserProfile);
    } catch (error: any) {
      console.error("[UserService] Erreur listage des candidats:", error);
      throw new Error("Impossible de charger la liste des candidats.");
    }
  },

  async listVerifiedCandidates(limitCount = 40): Promise<UserProfile[]> {
    try {
      const response = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, USERS_COLLECTION_ID, [
        Query.equal('role', 'candidate'),
        Query.equal('isVerified', true),
        Query.limit(limitCount)
      ]);
      return response.documents.map(toUserProfile);
    } catch (error: any) {
      console.error("[UserService] Erreur listage des candidats vérifiés:", error);
      throw new Error("Impossible de charger la liste des candidats.");
    }
  }
};
