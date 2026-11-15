import { Models, Permission, Role } from 'appwrite';
import { databases, APPWRITE_CONFIG } from '../lib/appwrite';
import { UserProfile, UserRole } from '../types';

const DB = APPWRITE_CONFIG.DATABASE_ID;
const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200&auto=format&fit=crop';

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
  return { ...doc, uid: uid || doc.uid || doc.$id, verificationDocs } as UserProfile;
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

  /** Charge le profil, ou le crée au premier passage. `role` ne sert qu'à la création. */
  async ensure(user: Models.User<Models.Preferences>, role: UserRole = 'candidate', displayName?: string): Promise<UserProfile> {
    let profile = await this.get(user.$id);
    if (!profile) {
      const safeRole: UserRole = role === 'employer' ? 'employer' : 'candidate';
      const data = {
        uid: user.$id,
        role: safeRole,
        displayName: displayName || user.name || user.email?.split('@')[0] || 'Utilisateur',
        email: user.email || '',
        photoURL: DEFAULT_AVATAR,
        skills: [],
        isVerified: false,
        isPremium: false,
        averageRating: 0,
        reviewCount: 0,
        createdAt: new Date().toISOString(),
      };
      // Lecture/modification réservées au propriétaire (et aux admins via les permissions de collection).
      await databases.createDocument(DB, 'users', user.$id, data, [
        Permission.read(Role.user(user.$id)),
        Permission.update(Role.user(user.$id)),
      ]);
      profile = data as UserProfile;
    }
    // Le rôle admin vient UNIQUEMENT du label Appwrite : un « admin » écrit dans le document est ignoré.
    if (this.isAdmin(user)) return { ...profile, role: 'admin' };
    return profile.role === 'admin' ? { ...profile, role: 'candidate' } : profile;
  },
};
