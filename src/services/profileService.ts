import { Models } from 'appwrite';
import { databases, APPWRITE_CONFIG } from '../lib/appwrite';
import { missionService } from './missionService';
import { UserProfile, UserRole } from '../types';

const DB = APPWRITE_CONFIG.DATABASE_ID;

/**
 * Le profil vit dans la collection `users`, avec pour identifiant l'id du compte Appwrite.
 *
 * Le rôle « admin » n'est JAMAIS lu depuis ce document : il vient du label Appwrite
 * `admin` posé dans la console, ce qui empêche de se promouvoir administrateur.
 */
/** `verificationDocs` est stocké en JSON (Appwrite n'a pas de champ objet) : on le reconvertit en liste. */
export function parseProfile(doc: any, uid?: string): UserProfile {
  let verificationDocs = doc.verificationDocs;
  if (typeof verificationDocs === 'string') {
    try { verificationDocs = JSON.parse(verificationDocs); } catch { verificationDocs = []; }
  }
  // Les champs système Appwrite ($id, $permissions…) ne doivent jamais être réécrits dans la base.
  const clean = Object.fromEntries(Object.entries(doc).filter(([k]) => !k.startsWith('$')));
  return { ...clean, uid: uid || doc.uid || doc.$id, verificationDocs } as UserProfile;
}

export const profileService = {
  isAdmin: (user: Models.User<Models.Preferences>) => (user.labels || []).includes('admin'),

  async get(uid: string): Promise<UserProfile | null> {
    try {
      const doc = await databases.getDocument(DB, 'users', uid);
      return parseProfile(doc, uid);
    } catch (error: any) {
      if (error?.code === 404) return null;
      throw error;
    }
  },

  /**
   * Charge le profil, ou le crée au premier passage. La création et la remise en ordre se font côté SERVEUR :
   * le navigateur n'écrit plus dans la table des profils (il ne peut donc pas se déclarer certifié ou administrateur).
   * `role` ne sert qu'à la création.
   */
  async ensure(user: Models.User<Models.Preferences>, role: UserRole = 'candidate', displayName?: string): Promise<UserProfile> {
    const { profile } = await missionService.ensureProfile(role === 'employer' ? 'employer' : 'candidate', displayName);
    // Le rôle admin vient UNIQUEMENT du label Appwrite (vérifié aussi par le serveur).
    if (this.isAdmin(user)) return { ...profile, role: 'admin' };
    return profile.role === 'admin' ? { ...profile, role: 'candidate' } : profile;
  },
};
