import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer, collection, getDocs, limit, query } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

export const firebaseConfig = {
  apiKey: "AIzaSyBai1Hc6IldBar2jDkiMmTzkx-I7X2o-wQ",
  authDomain: "splendor-private-crm.firebaseapp.com",
  projectId: "splendor-private-crm",
  storageBucket: "splendor-private-crm.firebasestorage.app",
  messagingSenderId: "481442924962",
  appId: "1:481442924962:web:575ab406b31f1ac4790afb",
  measurementId: "G-19CD1DM1BN"
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// NOTE: this file used to auto-sign-in an anonymous Firebase user on every
// page load ("Automatically ensure authenticated session"), left over from
// the pre-Phase-1a fake-auth system, where the open Firestore rules meant
// ANY authenticated session (even an anonymous one) was enough to read/write
// everything. Real email/password auth (see AuthContext.tsx) replaced that
// model, so this call was not just dead weight -- it silently created (or,
// once the Anonymous provider was disabled, silently failed to create, with
// a confusing "auth/admin-restricted-operation" console error on every page
// load) an unrelated auth session before the real login screen even
// rendered. Removed rather than fixed, since nothing in the app should ever
// authenticate a user who hasn't actually logged in with real credentials.

export interface FirebaseConnectionStatus {
  connected: boolean;
  projectId: string;
  latencyMs: number;
  lastChecked: string;
  errorMessage?: string;
  isOffline?: boolean;
}

export async function testFirebaseConnection(): Promise<FirebaseConnectionStatus> {
  const startTime = Date.now();
  try {
    // Attempt a lightweight server query on fleet or ping doc
    const testQuery = query(collection(db, 'vehicles'), limit(1));
    await getDocs(testQuery);
    const latency = Date.now() - startTime;
    return {
      connected: true,
      projectId: firebaseConfig.projectId,
      latencyMs: latency,
      lastChecked: new Date().toISOString()
    };
  } catch (error: any) {
    const latency = Date.now() - startTime;
    const isOffline = error?.message?.includes('offline') || error?.code === 'unavailable';
    console.warn('Firebase connection check result:', error);
    return {
      connected: !isOffline,
      projectId: firebaseConfig.projectId,
      latencyMs: latency,
      lastChecked: new Date().toISOString(),
      errorMessage: error?.message || 'Permission or network issue',
      isOffline
    };
  }
}
