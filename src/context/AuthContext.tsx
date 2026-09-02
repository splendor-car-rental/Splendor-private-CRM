import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  type User as FirebaseUser
} from 'firebase/auth';
import { doc, updateDoc, collection, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { User, UserRole } from '../types';
import { AuthLoadingScreen, LoginScreen, AccessPendingScreen } from '../components/auth/AuthScreens';

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  currentUser: User;
  hasPermission: (permission: 'read' | 'create' | 'edit' | 'delete' | 'approve' | 'export') => boolean;
  logout: () => Promise<void>;
  staffDirectory: User[];
  updateMyProfile: (data: Partial<Pick<User, 'avatar' | 'name' | 'nameAr' | 'phone'>>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapAuthErrorToKey(code: string | undefined): string {
  switch (code) {
    case 'auth/invalid-email':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'authErrorInvalidCredentials';
    case 'auth/too-many-requests':
      return 'authErrorTooManyAttempts';
    default:
      return 'authErrorGeneric';
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authErrorKey, setAuthErrorKey] = useState<string | null>(null);
  const [staffDirectory, setStaffDirectory] = useState<User[]>([]);

  useEffect(() => {
    let profileUnsubscribe: (() => void) | null = null;

    const authUnsubscribe = onAuthStateChanged(auth, (fbUser) => {
      setFirebaseUser(fbUser);

      if (profileUnsubscribe) {
        profileUnsubscribe();
        profileUnsubscribe = null;
      }

      if (!fbUser) {
        setProfile(null);
        setAuthLoading(false);
        return;
      }

      // Provisioning is server-authoritative. A valid Firebase identity alone
      // never creates a CRM staff profile in the browser and never grants a
      // role. The authenticated user may only observe their existing profile.
      const profileRef = doc(db, 'users', fbUser.uid);
      profileUnsubscribe = onSnapshot(
        profileRef,
        (snap) => {
          setProfile(snap.exists() ? { id: fbUser.uid, ...(snap.data() as Omit<User, 'id'>) } : null);
          setAuthLoading(false);
        },
        (error) => {
          console.warn('Failed to subscribe to own profile:', error);
          setProfile(null);
          setAuthLoading(false);
        }
      );
    });

    return () => {
      authUnsubscribe();
      if (profileUnsubscribe) profileUnsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!firebaseUser || profile?.status !== 'active') {
      setStaffDirectory([]);
      return;
    }
    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        setStaffDirectory(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<User, 'id'>) })));
      },
      (error) => console.warn('Failed to subscribe to staff directory:', error)
    );
    return () => unsubscribe();
  }, [firebaseUser, profile?.status]);

  const login = useCallback(async (email: string, password: string, rememberMe: boolean) => {
    setAuthErrorKey(null);
    try {
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      setAuthErrorKey(mapAuthErrorToKey(error?.code));
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  const updateMyProfile = useCallback(
    async (data: Partial<Pick<User, 'avatar' | 'name' | 'nameAr' | 'phone'>>) => {
      if (!firebaseUser || profile?.status !== 'active') return;
      await updateDoc(doc(db, 'users', firebaseUser.uid), data as Record<string, any>);
    },
    [firebaseUser, profile?.status]
  );

  const hasPermission = useCallback(
    (permission: 'read' | 'create' | 'edit' | 'delete' | 'approve' | 'export'): boolean => {
      if (!profile || profile.status !== 'active') return false;
      if (profile.role === 'ceo' || profile.role === 'admin') return true;
      if (permission === 'read') return true;
      if (permission === 'approve') return profile.role === 'finance';
      if (permission === 'delete') return false;
      if (permission === 'export') return profile.role === 'finance';
      return true;
    },
    [profile]
  );

  if (authLoading) {
    return <AuthLoadingScreen />;
  }

  if (!firebaseUser) {
    return <LoginScreen onLogin={login} errorKey={authErrorKey} />;
  }

  if (!profile || profile.status !== 'active') {
    return <AccessPendingScreen email={firebaseUser.email} onSignOut={logout} />;
  }

  return (
    <AuthContext.Provider value={{ firebaseUser, currentUser: profile, hasPermission, logout, staffDirectory, updateMyProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export type { UserRole };
