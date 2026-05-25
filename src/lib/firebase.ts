import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import localFirebaseConfig from '../../firebase-applet-config.json';

// Detect if we are running on Vercel or production domain to load user's real Firebase configuration
const isProductionDomain = typeof window !== 'undefined' && (
  window.location.hostname === 'ivoire-sourcing.vercel.app' || 
  window.location.hostname.endsWith('.vercel.app')
);

const productionFirebaseConfig = {
  apiKey: "AIzaSyCVcrODxRk2OeIY-_44jctnLJkbjHc6RcQ",
  authDomain: "ivoire-sourcing-db.firebaseapp.com",
  projectId: "ivoire-sourcing-db",
  appId: "1:674825885011:web:a16c9eb5f4face2b91fda6",
  storageBucket: "ivoire-sourcing-db.firebasestorage.app",
  messagingSenderId: "674825885011",
};

const metaEnv = (import.meta as any).env || {};

// Merge fallback cascade: env vars > production config (if on Vercel) > AI Studio local sandbox
const firebaseConfig = {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || (isProductionDomain ? productionFirebaseConfig.apiKey : localFirebaseConfig.apiKey),
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || (isProductionDomain ? productionFirebaseConfig.authDomain : localFirebaseConfig.authDomain),
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || (isProductionDomain ? productionFirebaseConfig.projectId : localFirebaseConfig.projectId),
  appId: metaEnv.VITE_FIREBASE_APP_ID || (isProductionDomain ? productionFirebaseConfig.appId : localFirebaseConfig.appId),
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || (isProductionDomain ? productionFirebaseConfig.storageBucket : localFirebaseConfig.storageBucket),
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || (isProductionDomain ? productionFirebaseConfig.messagingSenderId : localFirebaseConfig.messagingSenderId),
};

const databaseId = metaEnv.VITE_FIREBASE_FIRESTORE_DATABASE_ID || (isProductionDomain ? "(default)" : localFirebaseConfig.firestoreDatabaseId);

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, databaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
