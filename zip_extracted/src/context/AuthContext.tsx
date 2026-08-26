import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { User, UserRole } from '../types';
import { AuthLoadingScreen, LoginScreen, AccessPendingScreen } from '../components/auth/AuthScreens';

interface AuthContextType {
  currentUser: User;
  hasPermission: (permission: 'read' | 'create' | 'edit' | 'delete' | 'approve' | 'export') => boolean;
  logout: () => Promise<void>;
  /** Read-only directory of provisioned staff accounts (for admin/settings screens). */
  staffDirectory: User[];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * One-time bootstrap allowlist: the first time one of these emails signs in
 * with Firebase Authentication, their Firestore `users/{uid}` profile is
 * created automatically from this seed data. Any email NOT in this list that
 * successfully authenticates gets NO profile and NO access until an
 * administrator creates their `users/{uid}` document (see Settings).
 *
 * This replaces the previous "switch role" simulator, which let anyone
 * viewing the app become CEO/Admin with a single click and no login.
 */
const SEED_STAFF: Record<string, Omit<User, 'id' | 'status'>> = {
  'ceo@splendor-rental.ae': {
    name: 'Ahmed Morsy', nameAr: 'أحمد مرسي', email: 'ceo@splendor-rental.ae',
    role: 'ceo', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    phone: '+971 50 111 2233', branch: 'Dubai Downtown Flagship'
  },
  'operations@splendor-rental.ae': {
    name: 'Tariq Al-Mansoor', nameAr: 'طارق المنصور', email: 'operations@splendor-rental.ae',
    role: 'operations', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    phone: '+971 52 444 5566', branch: 'Dubai Downtown Flagship'
  },
  'elena.r@splendor-rental.ae': {
    name: 'Elena Rostova', nameAr: 'إيلينا روستوفا', email: 'elena.r@splendor-rental.ae',
    role: 'sales', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    phone: '+971 55 777 8899', branch: 'Palm Jumeirah Executive Suite'
  },
  'faisal.h@splendor-rental.ae': {
    name: 'Faisal Al-Hashimi', nameAr: 'فيصل الهاشمي', email: 'faisal.h@splendor-rental.ae',
    role: 'finance', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
    phone: '+971 54 999 0011', branch: 'Dubai Downtown Flagship'
  },
  'khalid.b@splendor-rental.ae': {
    name: 'Khalid Ben-Zayed', nameAr: 'خالد بن زايد', email: 'khalid.b@splendor-rental.ae',
    role: 'fleet', avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
    phone: '+971 50 333 4455', branch: 'Dubai International Airport VIP Terminal'
  }
};

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
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);

      if (!fbUser) {
        setProfile(null);
        setAuthLoading(false);
        return;
      }

      try {
        const profileRef = doc(db, 'users', fbUser.uid);
        const snap = await getDoc(profileRef);

        if (snap.exists()) {
          setProfile({ id: fbUser.uid, ...(snap.data() as Omit<User, 'id'>) });
        } else {
          const seed = fbUser.email ? SEED_STAFF[fbUser.email.toLowerCase()] : undefined;
          if (seed) {
            const newProfile: Omit<User, 'id'> = { ...seed, status: 'active' };
            await setDoc(profileRef, newProfile, { merge: true });
            setProfile({ id: fbUser.uid, ...newProfile });
          } else {
            // Authenticated, but no administrator has provisioned this account yet.
            setProfile(null);
          }
        }
      } catch (error) {
        console.warn('Failed to load/bootstrap user profile:', error);
        setProfile(null);
      } finally {
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Read-only staff directory, once signed in.
  useEffect(() => {
    if (!firebaseUser) {
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
  }, [firebaseUser]);

  const login = useCallback(async (email: string, password: string) => {
    setAuthErrorKey(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      setAuthErrorKey(mapAuthErrorToKey(error?.code));
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  const hasPermission = useCallback(
    (permission: 'read' | 'create' | 'edit' | 'delete' | 'approve' | 'export'): boolean => {
      if (!profile) return false;
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

  if (!profile) {
    return <AccessPendingScreen email={firebaseUser.email} onSignOut={logout} />;
  }

  return (
    <AuthContext.Provider value={{ currentUser: profile, hasPermission, logout, staffDirectory }}>
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
