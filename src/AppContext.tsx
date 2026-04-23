import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './lib/firebase';
import { logEvent } from './lib/audit';
import { businessApi, transactionApi, ruleApi } from './lib/api';
import { collection, query, onSnapshot, getDocs, addDoc, doc, getDoc, setDoc, where, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';

interface MenuAccess {
  dashboard: boolean;
  transactions: boolean;
  budgets: boolean;
  ai: boolean;
  rules?: boolean;
}

export interface BusinessSettings {
  currency: string;
  timezone: string;
  isBudgetingEnabled: boolean;
  isGSTEnabled: boolean;
  fiscalYearStart?: string;
  fiscalYearEnd?: string;
}

export interface Business {
  id: string;
  name: string;
  isDefault?: boolean;
  settingsJson: string; // Stored as JSON string
  userId: string;
  createdAt: string;
  updatedAt: string;
  IsDeleted?: boolean;
}

export function getBusinessSettings(business: Business): BusinessSettings {
  try {
    return JSON.parse(business.settingsJson);
  } catch (e) {
    return {
      currency: 'USD',
      timezone: 'UTC',
      isBudgetingEnabled: true,
      isGSTEnabled: false
    };
  }
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
  refreshData: () => Promise<void>;
  finData: {
    expenses: any[];
    budgets: any[];
    accounts: any[];
    investments: any[];
    rules: any[];
  };
}

const DEFAULT_MENU_ACCESS: MenuAccess = {
  dashboard: true,
  transactions: true,
  budgets: true,
  ai: true,
  rules: true
};

const ADMIN_MENU_ACCESS: MenuAccess = {
  dashboard: true,
  transactions: true,
  budgets: true,
  ai: true,
  rules: true
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
    rules: [],
  });

  const refreshData = async () => {
    if (!user) return;
    try {
      // 1. Refresh Business list first (critical if we just created one)
      const businessesRes = await businessApi.list().catch(() => ({ data: [] }));
      const currentBusinesses = businessesRes.data || [];
      setBusinesses(currentBusinesses);

      // If no active business but we have businesses, pick one (usually happens after first creation)
      let effectiveBizId = activeBusinessId;
      if (!effectiveBizId && currentBusinesses.length > 0) {
        const defaultBiz = currentBusinesses.find((b: any) => b.isDefault) || currentBusinesses[0];
        effectiveBizId = defaultBiz.id;
        setActiveBusinessId(effectiveBizId);
      }

      if (!effectiveBizId) return;

      // 2. Fetch specific business data
      const [catRes, ruleRes, txRes] = await Promise.all([
        businessApi.listCategories(effectiveBizId),
        ruleApi.list(effectiveBizId).catch(() => ({ data: [] })),
        transactionApi.list(effectiveBizId).catch(() => ({ data: [] }))
      ]);

      setFinData(prev => ({
        ...prev,
        budgets: catRes.data || [],
        rules: ruleRes.data || [],
        expenses: txRes.data || []
      }));
    } catch (err) {
      console.error("Error refreshing data:", err);
    }
  };

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
      setFinData({ expenses: [], budgets: [], accounts: [], investments: [], rules: [] });
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

    // Fetch Businesses via API instead of Firestore Stream
    const fetchBusinesses = async () => {
      try {
        const res = await businessApi.list();
        const bizs = (res.data || []) as Business[];
        setBusinesses(bizs);
        
        if (bizs.length > 0) {
          const currentActive = bizs.find(b => b.id === activeBusinessId);
          if (!currentActive) {
            const defaultBiz = bizs.find(b => b.isDefault);
            setActiveBusinessId(defaultBiz ? defaultBiz.id : bizs[0].id);
          }
        } else {
          setActiveBusinessId(null);
        }
      } catch (err) {
        console.error("Error fetching businesses:", err);
        setBusinesses([]);
      }
    };
    fetchBusinesses();

    return () => {};
  }, [user]);

  useEffect(() => {
    if (!user || !activeBusinessId) {
      setFinData({ expenses: [], budgets: [], accounts: [], investments: [], rules: [] });
      return;
    }

    refreshData();
  }, [user, activeBusinessId]);

  const updateBusiness = async (id: string, data: Partial<Business>) => {
    if (!user) return;
    try {
      await businessApi.update(id, data);
      await logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'UPDATE',
        resourceType: 'business',
        resourceId: id,
        details: `Updated business properties: ${Object.keys(data).join(', ')}`
      });
      // Logic: Manual refresh after write since we don't have streams anymore
      const res = await businessApi.list();
      setBusinesses(res.data || []);
    } catch (err) {
      console.error("Error updating business:", err);
      throw err;
    }
  };

  const deleteBusiness = async (id: string) => {
    if (!user) return;
    try {
      await businessApi.delete(id);

      await logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'SOFT_DELETE',
        resourceType: 'business',
        resourceId: id,
        details: `Deleted business entity via API`
      });
      
      const res = await businessApi.list();
      const bizs = res.data || [];
      setBusinesses(bizs);

      if (activeBusinessId === id) {
        setActiveBusinessId(bizs.length > 0 ? bizs[0].id : null);
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
      refreshData,
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
