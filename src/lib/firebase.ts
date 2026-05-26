/// <reference types="vite/client" />
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import localFirebaseConfig from '../../firebase-applet-config.json';

// Helper to sanitize environment variables and configuration parameters (stripping unwanted quotes or whitespace)
const cleanValue = (val: any): string => {
  if (typeof val !== 'string') return val || '';
  let trimmed = val.trim();
  
  // Handle double-quote-clumped values (e.g., 'ivoire-sourcing-db" VITE_FIREBASE_APP_ID="1:67...')
  if (trimmed.includes('VITE_FIREBASE_')) {
    const parts = trimmed.split(/VITE_FIREBASE_[A-Z_]+=/);
    trimmed = parts[0].trim();
  }
  
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed.replace(/["']/g, ''); // strip any raw quotes
};

// Access VITE_ environment variables statically so Vite's static analyzer replaces them during bundle
const envApiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const envAuthDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
const envProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const envAppId = import.meta.env.VITE_FIREBASE_APP_ID;
const envStorageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
const envMessagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID;
const envDatabaseId = import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID;

// Advanced parser to repair client environment variables if they were clumped with other variables in a single string
const parseClumpedEnvironment = () => {
  const finalEnv = {
    apiKey: cleanValue(envApiKey),
    authDomain: cleanValue(envAuthDomain),
    projectId: cleanValue(envProjectId),
    appId: cleanValue(envAppId),
    storageBucket: cleanValue(envStorageBucket),
    messagingSenderId: cleanValue(envMessagingSenderId),
    databaseId: cleanValue(envDatabaseId) || '(default)'
  };

  // Safe checks across environment keys to find if any contain parsed clumped data
  const rawMetaEnv = import.meta.env || {};
  for (const [key, val] of Object.entries(rawMetaEnv)) {
    if (typeof val === 'string' && val.includes('VITE_FIREBASE_')) {
      // Clumped string detected! Extract nested VITE_FIREBASE_ key-values
      const matches = val.matchAll(/VITE_FIREBASE_([A-Z_]+)=["']?([^"'\s]+)["']?/g);
      for (const match of matches) {
        const subKey = match[1];
        const subVal = match[2];
        if (subKey === 'API_KEY') finalEnv.apiKey = cleanValue(subVal);
        if (subKey === 'AUTH_DOMAIN') finalEnv.authDomain = cleanValue(subVal);
        if (subKey === 'PROJECT_ID') finalEnv.projectId = cleanValue(subVal);
        if (subKey === 'APP_ID') finalEnv.appId = cleanValue(subVal);
        if (subKey === 'STORAGE_BUCKET') finalEnv.storageBucket = cleanValue(subVal);
        if (subKey === 'MESSAGING_SENDER_ID') finalEnv.messagingSenderId = cleanValue(subVal);
        if (subKey === 'FIRESTORE_DATABASE_ID') finalEnv.databaseId = cleanValue(subVal);
      }
    }
  }
  return finalEnv;
};

const fixedEnv = parseClumpedEnvironment();

// Merge logic: Prioritize the local schema configuration (dynamic-superstate-85xj8) if it's available and has a valid projectId.
// This prevents malformed/production environment variables in local workspace from overriding the sandbox database.
const hasLocalConfig = localFirebaseConfig && localFirebaseConfig.projectId && localFirebaseConfig.projectId !== '';

const firebaseConfig = {
  apiKey: hasLocalConfig ? cleanValue(localFirebaseConfig.apiKey) : (fixedEnv.apiKey || ''),
  authDomain: hasLocalConfig ? cleanValue(localFirebaseConfig.authDomain) : (fixedEnv.authDomain || ''),
  projectId: hasLocalConfig ? cleanValue(localFirebaseConfig.projectId) : (fixedEnv.projectId || ''),
  appId: hasLocalConfig ? cleanValue(localFirebaseConfig.appId) : (fixedEnv.appId || ''),
  storageBucket: hasLocalConfig ? cleanValue(localFirebaseConfig.storageBucket) : (fixedEnv.storageBucket || ''),
  messagingSenderId: hasLocalConfig ? cleanValue(localFirebaseConfig.messagingSenderId) : (fixedEnv.messagingSenderId || ''),
};

const databaseId = hasLocalConfig 
  ? cleanValue(localFirebaseConfig.firestoreDatabaseId || '(default)') 
  : (fixedEnv.databaseId || '(default)');

// Robust initialization wrapper
let app;
let db: any;
let auth: any;
let googleProvider: any;
let isFirebaseAvailableByConfig = false;

if (firebaseConfig.apiKey && firebaseConfig.apiKey !== '') {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app, databaseId);
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
    isFirebaseAvailableByConfig = true;
    console.log("[FIREBASE] Initialized successfully with Project ID:", firebaseConfig.projectId, "Database ID:", databaseId);
  } catch (err) {
    console.error("[FIREBASE] Initialization failed during bootstrap:", err);
  }
} else {
  console.warn("[FIREBASE] No configuration keys loaded. Falling back to local offline mode.");
}

export { db, auth, googleProvider, isFirebaseAvailableByConfig };
export const rawConfig = {
  ...firebaseConfig,
  firestoreDatabaseId: databaseId
};

