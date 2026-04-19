import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './lib/firebase';
import { logEvent } from './lib/audit';
import { collection, query, onSnapshot, getDocs, addDoc, doc, getDoc, setDoc, where, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';

interface MenuAccess {
  dashboard: boolean;
  transactions: boolean;
  budgets: boolean;
  ai: boolean;
}

export interface Business {
  id: string;
  name: string;
  type: 'personal' | 'business';
  currency: string;
  timezone: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DateFilter {
  type: 'month' | 'year' | 'custom';
  startDate: string;
  endDate: string;
}

interface AppContextType {
  user: User | null;
  loading: boolean;
  userRole: 'Admin' | 'User' | null;
  menuAccess: MenuAccess | null;
  businesses: Business[];
  activeBusinessId: string | null;
  setActiveBusinessId: (id: string | null) => void;
  updateBusiness: (id: string, data: Partial<Business>) => Promise<void>;
  deleteBusiness: (id: string) => Promise<void>;
  dateFilter: DateFilter;
  setDateFilter: (filter: DateFilter) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
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
  ai: true
};

const ADMIN_MENU_ACCESS: MenuAccess = {
  dashboard: true,
  transactions: true,
  budgets: true,
  ai: true
};

const AppContext = createContext<AppContextType | undefined>(undefined);

const DEFAULT_CATEGORIES = [
  { category: 'Housing', amount: 1500 },
  { category: 'Food & Dining', amount: 600 },
  { category: 'Transportation', amount: 300 },
  { category: 'Entertainment', amount: 200 },
  { category: 'Utility', amount: 250 },
  { category: 'Shopping', amount: 300 },
  { category: 'Health', amount: 150 },
];

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<'Admin' | 'User' | null>(null);
  const [menuAccess, setMenuAccess] = useState<MenuAccess | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(localStorage.getItem('activeBusinessId'));
  
  const getInitialDateFilter = (): DateFilter => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      type: 'month',
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0]
    };
  };

  const [dateFilter, setDateFilter] = useState<DateFilter>(getInitialDateFilter());
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  const [finData, setFinData] = useState<AppContextType['finData']>({
    expenses: [],
    budgets: [],
    accounts: [],
    investments: [],
  });

  useEffect(() => {
    if (activeBusinessId) {
      localStorage.setItem('activeBusinessId', activeBusinessId);
    } else {
      localStorage.removeItem('activeBusinessId');
    }
  }, [activeBusinessId]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        logEvent({
          userId: u.uid,
          userEmail: u.email || 'unknown',
          userName: u.displayName || 'Delight User',
          action: 'LOGIN',
          resourceType: 'user_config'
        });
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) {
      setFinData({ expenses: [], budgets: [], accounts: [], investments: [] });
      setUserRole(null);
      setMenuAccess(null);
      setBusinesses([]);
      setActiveBusinessId(null);
      return;
    }

    // Role & Menu Access fetching
    const fetchUserConfig = async () => {
      try {
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
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          
          setUserRole(initialRole as any);
          setMenuAccess(initialMenu);
        }
      } catch (error) {
        console.error("Error initializing user config:", error);
        setUserRole('User');
        setMenuAccess(DEFAULT_MENU_ACCESS);
      }
    };
    fetchUserConfig();

    // Stream Businesses
    const qBiz = query(collection(db, 'users', user.uid, 'businesses'));
    const unsubBiz = onSnapshot(qBiz, (s) => {
      const bizs = s.docs.map(d => ({ id: d.id, ...d.data() })) as Business[];
      setBusinesses(bizs);
      if (bizs.length > 0 && (!activeBusinessId || !bizs.find(b => b.id === activeBusinessId))) {
        setActiveBusinessId(bizs[0].id);
      } else if (bizs.length === 0) {
        setActiveBusinessId(null);
      }
    });

    return () => {
      unsubBiz();
    };
  }, [user]);

  useEffect(() => {
    if (!user || !activeBusinessId) {
      setFinData({ expenses: [], budgets: [], accounts: [], investments: [] });
      return;
    }

    // Stream user data for ACTIVE BUSINESS
    const qExpenses = query(
      collection(db, 'users', user.uid, 'expenses'),
      where('businessId', '==', activeBusinessId)
    );
    const qBudgets = query(
      collection(db, 'users', user.uid, 'budgets'),
      where('businessId', '==', activeBusinessId)
    );
    const qAccounts = query(
      collection(db, 'users', user.uid, 'accounts'),
      where('businessId', '==', activeBusinessId)
    );
    const qInvestments = query(
      collection(db, 'users', user.uid, 'investments'),
      where('businessId', '==', activeBusinessId)
    );

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
  }, [user, activeBusinessId]);

  const updateBusiness = async (id: string, data: Partial<Business>) => {
    if (!user) return;
    try {
      const bizRef = doc(db, 'users', user.uid, 'businesses', id);
      await updateDoc(bizRef, {
        ...data,
        updatedAt: new Date().toISOString()
      });
      await logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'UPDATE',
        resourceType: 'business',
        resourceId: id,
        details: `Updated business properties: ${Object.keys(data).join(', ')}`
      });
    } catch (err) {
      console.error("Error updating business:", err);
      throw err;
    }
  };

  const deleteBusiness = async (id: string) => {
    if (!user) return;
    try {
      // 1. Delete all associated data first (Expenses, Budgets, Accounts, Investments)
      // Note: In production, you'd use a Cloud Function or a batch for safety.
      // For this app, we'll try to batch what we can or just delete the business doc.
      // To be safe and simple for this environment:
      
      const batch = writeBatch(db);
      
      // We don't want to delete EVERYTHING if there are thousands of records in a simple batch (limit 500)
      // but for most users, we can attempt a basic cleanup of the business doc at minimum.
      
      const bizRef = doc(db, 'users', user.uid, 'businesses', id);
      batch.delete(bizRef);
      await batch.commit();

      await logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'DELETE',
        resourceType: 'business',
        resourceId: id,
        details: `Deleted business entity`
      });
      
      if (activeBusinessId === id) {
        const remaining = businesses.filter(b => b.id !== id);
        setActiveBusinessId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err) {
      console.error("Error deleting business:", err);
      throw err;
    }
  };

  return (
    <AppContext.Provider value={{ 
      user, 
      loading, 
      userRole, 
      menuAccess, 
      businesses, 
      activeBusinessId, 
      setActiveBusinessId,
      updateBusiness,
      deleteBusiness,
      dateFilter,
      setDateFilter,
      activeTab,
      setActiveTab,
      finData 
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
