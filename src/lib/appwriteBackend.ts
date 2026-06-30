import { ID, Query } from 'appwrite';
import { account, databases, APPWRITE_CONFIG } from './appwrite';

export const auth: any = { currentUser: null };
export const isBackendAvailable = true;
export const getIsBackendAvailable = () => true;
export const disableBackend = () => {};
export const rawConfig = APPWRITE_CONFIG;
export const googleProvider = {};

export const db: any = { databaseId: APPWRITE_CONFIG.DATABASE_ID };

export type CompatDocRef = { collectionId: string; id: string };
export type CompatCollectionRef = { collectionId: string };
export type CompatQuery = { collectionId: string; queries: string[] };

export const doc = (_db: any, collectionId: string, id: string): CompatDocRef => ({ collectionId, id });
export const collection = (_db: any, collectionId: string): CompatCollectionRef => ({ collectionId });
export const where = (field: string, op: string, value: any): string => {
  switch (op) {
    case '==': return Query.equal(field, value);
    case '!=': return Query.notEqual(field, value);
    case '<': return Query.lessThan(field, value);
    case '<=': return Query.lessThanEqual(field, value);
    case '>': return Query.greaterThan(field, value);
    case '>=': return Query.greaterThanEqual(field, value);
    default: return Query.equal(field, value);
  }
};
export const limit = (count: number): string => Query.limit(count);
export const query = (ref: CompatCollectionRef, ...queries: string[]): CompatQuery => ({ collectionId: ref.collectionId, queries });

const normalizeData = (document: any) => ({ id: document.$id, uid: document.uid || document.$id, ...document });
const snapFromDocument = (document: any) => ({ id: document.$id, exists: () => true, data: () => normalizeData(document) });

export const getDoc = async (ref: CompatDocRef) => {
  try {
    const document = await databases.getDocument(APPWRITE_CONFIG.DATABASE_ID, ref.collectionId, ref.id);
    return snapFromDocument(document);
  } catch (error: any) {
    if (error?.code === 404) return { id: ref.id, exists: () => false, data: () => null };
    throw error;
  }
};

export const getDocs = async (q: CompatQuery | CompatCollectionRef) => {
  const collectionId = q.collectionId;
  const queries = 'queries' in q ? q.queries : [];
  const result = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, collectionId, queries);
  const docs = result.documents.map(snapFromDocument);
  return { docs, empty: docs.length === 0, forEach: (cb: (doc: any) => void) => docs.forEach(cb) };
};

export const setDoc = async (ref: CompatDocRef, data: any, options?: { merge?: boolean }) => {
  const payload = { ...data };
  delete payload.id;
  if (ref.collectionId === 'users' && !payload.uid) payload.uid = ref.id;
  if (options?.merge) {
    try {
      return await databases.updateDocument(APPWRITE_CONFIG.DATABASE_ID, ref.collectionId, ref.id, payload);
    } catch (error: any) {
      if (error?.code !== 404) throw error;
    }
  }
  try {
    return await databases.createDocument(APPWRITE_CONFIG.DATABASE_ID, ref.collectionId, ref.id || ID.unique(), payload);
  } catch (error: any) {
    if (error?.code === 409) return databases.updateDocument(APPWRITE_CONFIG.DATABASE_ID, ref.collectionId, ref.id, payload);
    throw error;
  }
};

export const addDoc = async (ref: CompatCollectionRef, data: any) => {
  const document = await databases.createDocument(APPWRITE_CONFIG.DATABASE_ID, ref.collectionId, ID.unique(), data);
  return { id: document.$id, ...document };
};

export const deleteDoc = async (ref: CompatDocRef) => databases.deleteDocument(APPWRITE_CONFIG.DATABASE_ID, ref.collectionId, ref.id);
export const signOut = async (_auth?: any) => account.deleteSession('current');
