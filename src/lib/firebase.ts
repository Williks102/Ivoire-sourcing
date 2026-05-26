import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import localFirebaseConfig from '../../firebase-applet-config.json';

const metaEnv = (import.meta as any).env || {};

// Merge fallback: use Vercel environment variables first, then default to AI Studio local sandbox config
const firebaseConfig = {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || localFirebaseConfig.apiKey,
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || localFirebaseConfig.authDomain,
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || localFirebaseConfig.projectId,
  appId: metaEnv.VITE_FIREBASE_APP_ID || localFirebaseConfig.appId,
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || localFirebaseConfig.storageBucket,
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || localFirebaseConfig.messagingSenderId,
};

const databaseId = metaEnv.VITE_FIREBASE_FIRESTORE_DATABASE_ID || localFirebaseConfig.firestoreDatabaseId;

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, databaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const rawConfig = firebaseConfig;
