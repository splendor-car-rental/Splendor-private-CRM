import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '../types';

interface AuthContextType {
  currentUser: User;
  setCurrentUser: (user: User) => void;
  users: User[];
  hasPermission: (permission: 'read' | 'create' | 'edit' | 'delete' | 'approve' | 'export') => boolean;
  switchRole: (role: UserRole) => void;
}

const defaultUser: User = {
  id: 'USR-001',
  name: 'Tariq Al-Mansoor',
  nameAr: 'طارق المنصور',
  email: 'ceo@splendor-rental.ae',
  role: 'ceo',
  avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  phone: '+971 50 111 2233',
  branch: 'Dubai Downtown Flagship',
  status: 'active',
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<User[]>([
    defaultUser,
    {
      id: 'USR-002',
      name: 'Ahmed Morsy',
      nameAr: 'أحمد مرسي',
      email: 'ahmed.morsy@splendor-rental.ae',
      role: 'operations',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
      phone: '+971 52 444 5566',
      branch: 'Dubai Downtown Flagship',
      status: 'active',
    },
    {
      id: 'USR-003',
      name: 'Elena Rostova',
      nameAr: 'إيلينا روستوفا',
      email: 'elena.r@splendor-rental.ae',
      role: 'sales',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      phone: '+971 55 777 8899',
      branch: 'Palm Jumeirah Executive Suite',
      status: 'active',
    },
    {
      id: 'USR-004',
      name: 'Faisal Al-Hashimi',
      nameAr: 'فيصل الهاشمي',
      email: 'faisal.h@splendor-rental.ae',
      role: 'finance',
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
      phone: '+971 54 999 0011',
      branch: 'Dubai Downtown Flagship',
      status: 'active',
    },
    {
      id: 'USR-005',
      name: 'Khalid Ben-Zayed',
      nameAr: 'خالد بن زايد',
      email: 'khalid.b@splendor-rental.ae',
      role: 'fleet',
      avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
      phone: '+971 50 333 4455',
      branch: 'Dubai International Airport VIP Terminal',
      status: 'active',
    }
  ]);

  const [currentUser, setCurrentUser] = useState<User>(() => {
    const saved = localStorage.getItem('splendor_user');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return defaultUser;
  });

  useEffect(() => {
    localStorage.setItem('splendor_user', JSON.stringify(currentUser));
  }, [currentUser]);

  const switchRole = (role: UserRole) => {
    const target = users.find(u => u.role === role) || {
      ...currentUser,
      role,
      name: `${role.toUpperCase()} Officer`
    };
    setCurrentUser(target);
  };

  const hasPermission = (permission: 'read' | 'create' | 'edit' | 'delete' | 'approve' | 'export'): boolean => {
    if (currentUser.role === 'ceo' || currentUser.role === 'admin') return true;
    if (permission === 'read') return true;
    if (permission === 'approve') {
      return currentUser.role === 'ceo' || currentUser.role === 'finance';
    }
    if (permission === 'delete') {
      return currentUser.role === 'ceo' || currentUser.role === 'admin';
    }
    if (permission === 'export') {
      return currentUser.role === 'ceo' || currentUser.role === 'finance' || currentUser.role === 'admin';
    }
    return true;
  };

  return (
    <AuthContext.Provider value={{ currentUser, setCurrentUser, users, hasPermission, switchRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
