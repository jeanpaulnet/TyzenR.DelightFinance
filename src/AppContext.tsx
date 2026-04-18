import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './lib/firebase';
import { collection, query, onSnapshot, getDocs, addDoc, doc, getDoc, setDoc } from 'firebase/firestore';

interface MenuAccess {
  dashboard: boolean;
  transactions: boolean;
  budgets: boolean;
  ai: boolean;
  users: boolean;
}

interface AppContextType {
  user: User | null;
  loading: boolean;
  encryptionKey: string | null;
  setEncryptionKey: (key: string | null) => void;
  userRole: 'Admin' | 'User' | null;
  menuAccess: MenuAccess | null;
  finData: {
    expenses: any[];
    budgets: any[];
    accounts: any[];
    investments: any[];
  };
}

const DEFAULT_MENU_ACCESS: MenuAccess = {
  dashboard: true,
  transactions: true,
  budgets: true,
  ai: true,
  users: false
};

const ADMIN_MENU_ACCESS: MenuAccess = {
  dashboard: true,
  transactions: true,
  budgets: true,
  ai: true,
  users: true
};

const AppContext = createContext<AppContextType | undefined>(undefined);

const DEFAULT_CATEGORIES = [
  { category: 'Housing', amount: 1500 },
  { category: 'Food & Dining', amount: 600 },
  { category: 'Transportation', amount: 300 },
  { category: 'Entertainment', amount: 200 },
  { category: 'Utilities', amount: 250 },
  { category: 'Shopping', amount: 300 },
  { category: 'Health', amount: 150 },
];

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<'Admin' | 'User' | null>(null);
  const [menuAccess, setMenuAccess] = useState<MenuAccess | null>(null);
  const [encryptionKey, setEncryptionKey] = useState<string | null>(localStorage.getItem('veda_enc_key'));
  const [finData, setFinData] = useState<AppContextType['finData']>({
    expenses: [],
    budgets: [],
    accounts: [],
    investments: [],
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) {
      setFinData({ expenses: [], budgets: [], accounts: [], investments: [] });
      setUserRole(null);
      setMenuAccess(null);
      return;
    }

    // Role & Menu Access fetching
    const fetchUserConfig = async () => {
      const configRef = doc(db, 'users_config', user.uid);
      const configSnap = await getDoc(configRef);
      
      if (configSnap.exists()) {
        const data = configSnap.data();
        setUserRole(data.role);
        setMenuAccess(data.menuAccess);
      } else {
        // Check if there was an invitation via email slug
        const emailSlug = user.email ? user.email.toLowerCase().replace(/[^a-z0-9]/g, '_') : null;
        let invitedData: any = null;
        
        if (emailSlug) {
           const invitedRef = doc(db, 'users_config', emailSlug);
           const invitedSnap = await getDoc(invitedRef);
           if (invitedSnap.exists()) {
              invitedData = invitedSnap.data();
           }
        }

        // Initial setup
        const isBootstrapAdmin = user.email === 'jeanpaulva@gmail.com';
        const initialRole = isBootstrapAdmin ? 'Admin' : (invitedData?.role || 'User');
        const initialMenu = isBootstrapAdmin ? ADMIN_MENU_ACCESS : (invitedData?.menuAccess || DEFAULT_MENU_ACCESS);
        const initialName = invitedData?.name || user.displayName || 'Delight User';
        
        await setDoc(configRef, {
          email: user.email,
          name: initialName,
          role: initialRole,
          menuAccess: initialMenu,
          updatedAt: new Date().toISOString()
        });
        
        setUserRole(initialRole as any);
        setMenuAccess(initialMenu);
      }
    };
    fetchUserConfig();

    // Initialize default categories if none exist
    const checkAndInitBudgets = async () => {
      const budgetRef = collection(db, 'users', user.uid, 'budgets');
      const snapshot = await getDocs(budgetRef);
      if (snapshot.empty) {
        for (const cat of DEFAULT_CATEGORIES) {
          await addDoc(budgetRef, {
            ...cat,
            month: new Date().getMonth() + 1,
            year: new Date().getFullYear(),
            userId: user.uid,
            createdAt: new Date().toISOString()
          });
        }
      }
    };
    checkAndInitBudgets();

    // Stream user data
    const qExpenses = query(collection(db, 'users', user.uid, 'expenses'));
    const qBudgets = query(collection(db, 'users', user.uid, 'budgets'));
    const qAccounts = query(collection(db, 'users', user.uid, 'accounts'));
    const qInvestments = query(collection(db, 'users', user.uid, 'investments'));

    const unsubExpenses = onSnapshot(qExpenses, (s) => 
      setFinData(prev => ({ ...prev, expenses: s.docs.map(d => ({ id: d.id, ...d.data() })) }))
    );
    const unsubBudgets = onSnapshot(qBudgets, (s) => 
      setFinData(prev => ({ ...prev, budgets: s.docs.map(d => ({ id: d.id, ...d.data() })) }))
    );
    const unsubAccounts = onSnapshot(qAccounts, (s) => 
      setFinData(prev => ({ ...prev, accounts: s.docs.map(d => ({ id: d.id, ...d.data() })) }))
    );
    const unsubInvestments = onSnapshot(qInvestments, (s) => 
      setFinData(prev => ({ ...prev, investments: s.docs.map(d => ({ id: d.id, ...d.data() })) }))
    );

    return () => {
      unsubExpenses();
      unsubBudgets();
      unsubAccounts();
      unsubInvestments();
    };
  }, [user]);

  useEffect(() => {
    if (encryptionKey) {
      localStorage.setItem('veda_enc_key', encryptionKey);
    } else {
      localStorage.removeItem('veda_enc_key');
    }
  }, [encryptionKey]);

  return (
    <AppContext.Provider value={{ user, loading, encryptionKey, setEncryptionKey, userRole, menuAccess, finData }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
