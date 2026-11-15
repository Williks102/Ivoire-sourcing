import { Models } from 'appwrite';
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
export const profileService = {
  isAdmin: (user: Models.User<Models.Preferences>) => (user.labels || []).includes('admin'),

  async get(uid: string): Promise<UserProfile | null> {
    try {
      const doc = await databases.getDocument(DB, 'users', uid);
      return { ...(doc as any), uid } as UserProfile;
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
      await databases.createDocument(DB, 'users', user.$id, data);
      profile = data as UserProfile;
    }
    return this.isAdmin(user) ? { ...profile, role: 'admin' } : profile;
  },
};
