/// <reference types="vite/client" />

export const db: any = {};
export const auth: any = { currentUser: null, onAuthStateChanged: () => {} };
export const doc: any = (...args: any[]) => ({ id: 'mock', path: 'mock' });
export const setDoc: any = async (...args: any[]) => {};
export const getDoc: any = async (...args: any[]) => ({ exists: () => false, data: () => null });
export const deleteDoc: any = async (...args: any[]) => {};
export const collection: any = (...args: any[]) => ({ id: 'mock', path: 'mock' });
export const query: any = (...args: any[]) => ({});
export const where: any = (...args: any[]) => ({});
export const limit: any = (...args: any[]) => ({});
export const getDocs: any = async (...args: any[]) => ({ docs: [], empty: true, forEach: () => {} });
export const addDoc: any = async (...args: any[]) => ({ id: 'mock' });
export const signOut: any = async (...args: any[]) => {};
export const onSnapshot: any = (...args: any[]) => (() => {});

export const isBackendAvailable = false;
export const getIsBackendAvailable = () => false;
export const disableBackend = () => {};
export const rawConfig = {};
export const googleProvider = {};
