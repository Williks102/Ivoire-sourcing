/// <reference types="vite/client" />
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Nettoyage des chaînes de caractères (suppression des espaces et des guillemets éventuels)
function cleanVal(val: string | undefined | null): string {
  if (!val) return '';
  let str = val.trim();
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1);
  }
  return str.trim();
}

// Configuration Firebase chargée uniquement et explicitement via les variables d'environnement de Vite
const firebaseConfig = {
  apiKey: cleanVal(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: cleanVal(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: cleanVal(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: cleanVal(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: cleanVal(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: cleanVal(import.meta.env.VITE_FIREBASE_APP_ID),
};

const databaseId = cleanVal(import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID);

// Déclaration des variables d'instances
let app;
let db: any;
let auth: any;
let googleProvider: any;
let isFirebaseAvailableByConfig = false;

// DEBUG TEMPORAIRE - Chargement des variables d'environnement
console.log("[FIREBASE DEBUG] Environment variables loaded:");
console.log("  VITE_FIREBASE_API_KEY:", firebaseConfig.apiKey ? `✓ Présents (débute par ${firebaseConfig.apiKey.substring(0, 8)}... et finissait par ...${firebaseConfig.apiKey.slice(-4)})` : "✗ MANQUANT");
console.log("  VITE_FIREBASE_PROJECT_ID:", firebaseConfig.projectId ? `✓ Présent (${firebaseConfig.projectId})` : "✗ MANQUANT");
console.log("  VITE_FIREBASE_AUTH_DOMAIN:", firebaseConfig.authDomain ? `✓ Présent (${firebaseConfig.authDomain})` : "✗ MANQUANT");
console.log("  Validation Clé API (commence par AIza et > 20) ? :", !!(firebaseConfig.apiKey && firebaseConfig.apiKey.startsWith('AIza') && firebaseConfig.apiKey.length > 20));

// Tentative d'initialisation de Firebase de production si les clés requises sont définies et valides (non fakes/placeholders)
const isKeyValid = firebaseConfig.apiKey && 
                   firebaseConfig.projectId && 
                   firebaseConfig.apiKey.startsWith('AIza') &&
                   firebaseConfig.apiKey.length > 20 &&
                   !firebaseConfig.apiKey.toLowerCase().includes('placeholder') &&
                   !firebaseConfig.apiKey.toLowerCase().includes('votre') &&
                   !firebaseConfig.apiKey.toLowerCase().includes('your_');

if (isKeyValid) {
  try {
    app = initializeApp(firebaseConfig);
    
    // Initialisation de Firestore (avec la database ID spécifique ou la database par défaut)
    db = databaseId && databaseId !== '(default)' ? getFirestore(app, databaseId) : getFirestore(app);
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
    isFirebaseAvailableByConfig = true;
    
    console.log("[FIREBASE] Initialisation réussie uniquement avec les variables d'environnement de production !");
  } catch (err) {
    console.error("[FIREBASE] Échec de l'initialisation de l'instance Firebase :", err);
  }
} else {
  console.warn("[FIREBASE] Variables d'environnement de production non détectées (MODE DEMO/SIMULATION ACTIVÉ)");
}

// Export propre des instances et configurations pour le frontend
export function disableFirebase() {
  isFirebaseAvailableByConfig = false;
  console.warn("[FIREBASE] Firebase has been programmatically disabled (switching to local demo mode).");
}

export { app, db, auth, googleProvider, isFirebaseAvailableByConfig };

export const rawConfig = {
  ...firebaseConfig,
  firestoreDatabaseId: databaseId || '(default)'
};
