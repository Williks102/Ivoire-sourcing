// src/lib/appwrite.ts
import { Client, Account, Databases, Storage } from 'appwrite';

// Configuration centrale d'Appwrite
// Idéale avec les variables d'environnement Vite pour ne pas exposer tes IDs publiquement
export const APPWRITE_CONFIG = {
  ENDPOINT: import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1',
  PROJECT_ID: import.meta.env.VITE_APPWRITE_PROJECT_ID || 'ton_project_id_ici',
  DATABASE_ID: import.meta.env.VITE_APPWRITE_DATABASE_ID || 'ton_database_id_ici',
};

// Initialisation unique du client Appwrite
const client = new Client()
  .setEndpoint(APPWRITE_CONFIG.ENDPOINT)
  .setProject(APPWRITE_CONFIG.PROJECT_ID);

// Instanciation et export des services requis
export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);

// On exporte le client par défaut pour les futurs besoins (comme Appwrite Realtime)
export default client;
