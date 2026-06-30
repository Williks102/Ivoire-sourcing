// src/services/authService.ts
import { ID } from 'appwrite';
import { account } from '../lib/appwrite';
import { LoginCredentials, RegisterCredentials, UserSession } from '../types/auth.types';

export const authService = {
  /**
   * Inscription d'un nouvel utilisateur et connexion automatique
   */
  async register({ email, password, name }: RegisterCredentials): Promise<UserSession> {
    try {
      // 1. Création du compte dans le système d'authentification Appwrite
      await account.create(ID.unique(), email, password, name);
      
      // 2. Connexion immédiate après création pour ouvrir la session
      return await this.login({ email, password });
    } catch (error: any) {
      console.error("[AuthService] Échec de l'inscription:", error);
      
      // Gestion explicite des erreurs classiques d'Appwrite
      if (error.code === 409) {
        throw new Error("Cette adresse email est déjà associée à un compte.");
      }
      if (error.code === 400) {
        throw new Error("Le mot de passe doit contenir au moins 8 caractères.");
      }
      throw new Error(error.message || "Une erreur est survenue lors de l'inscription.");
    }
  },

  /**
   * Connexion classique par Email / Mot de passe
   */
  async login({ email, password }: LoginCredentials): Promise<UserSession> {
    try {
      // Appwrite utilise 'createEmailPasswordSession' pour l'authentification standard
      const session = await account.createEmailPasswordSession(email, password);
      
      // Récupération immédiate du profil de l'utilisateur connecté
      const user = await account.get();
      
      return { session, user };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error("[AuthService] Échec de la connexion:", error);
      
      if (error.code === 401 || error.code === 400) {
        throw new Error("Identifiants incorrects. Veuillez vérifier votre email et votre mot de passe.");
      }
      throw new Error(error.message || "Impossible de se connecter. Veuillez réessayer plus tard.");
    }
  },

  /**
   * Authentification Single Sign-On (SSO) via Google OAuth2
   */
  async loginWithGoogle(): Promise<void> {
    try {
      // Les URLs de redirection configurées dans ton tableau de bord Appwrite
      const successUrl = `${window.location.origin}/dashboard`;
      const failureUrl = `${window.location.origin}/login`;
      
      // Crée la session OAuth2 (Appwrite gère la redirection automatiquement)
      await account.createOAuth2Session('google' as any, successUrl, failureUrl);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error("[AuthService] Échec Google OAuth2:", error);
      throw new Error("La connexion avec Google a échoué.");
    }
  },

  /**
   * Récupère l'utilisateur actuellement connecté (à lancer au chargement de l'app)
   */
  async getCurrentUser() {
    try {
      return await account.get();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      // Une erreur 401 signifie simplement qu'il n'y a pas de session active, ce n'est pas un crash
      if (error.code === 401) return null;
      console.error("[AuthService] Erreur lors de la récupération de la session:", error);
      return null;
    }
  },

  /**
   * Déconnexion complète de l'utilisateur
   */
  async logout(): Promise<void> {
    try {
      // 'current' détruit uniquement la session du navigateur actuel
      await account.deleteSession('current');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error("[AuthService] Échec de la déconnexion:", error);
      throw new Error("Impossible de fermer la session proprement.");
    }
  }
};
