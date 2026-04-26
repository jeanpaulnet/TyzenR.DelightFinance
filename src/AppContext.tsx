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
  isGstEnabled: boolean;
  type?: 'Personal' | 'Business';
  fiscalYearStart?: string;
  fiscalYearEnd?: string;
}

export interface Business {
  id: string;
  name: string;
  isDefault?: boolean;
  businessSettingsJson: string; // Stored as JSON string
  userId: string;
  createdAt: string;
  updatedAt: string;
  IsDeleted?: boolean;
}

export function getBusinessSettings(business: Business): BusinessSettings {
  try {
    const s = JSON.parse(business.businessSettingsJson);
    return {
      currency: s.currency || s.Currency || 'USD',
      timezone: s.timezone || s.Timezone || 'UTC',
      isBudgetingEnabled: s.isBudgetingEnabled ?? s.IsBudgetingEnabled ?? true,
      isGstEnabled: s.isGstEnabled ?? s.IsGstEnabled ?? false,
      type: s.type || s.Type || 'Personal',
      fiscalYearStart: s.fiscalYearStart || s.FiscalYearStart || '01-01',
      fiscalYearEnd: s.fiscalYearEnd || s.FiscalYearEnd || '12-31'
    };
  } catch (e) {
    return {
      currency: 'USD',
      timezone: 'UTC',
      isBudgetingEnabled: true,
      isGstEnabled: false,
      type: 'Personal'
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
  updateBusiness: (id: string, data: Partial<Business>, options?: { skipRefresh?: boolean }) => Promise<void>;
  deleteBusiness: (id: string) => Promise<void>;
  dateFilter: DateFilter;
  setDateFilter: (filter: DateFilter) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  refreshData: (options?: { skipTransactions?: boolean; skipRules?: boolean }) => Promise<void>;
  refreshBusinesses: () => Promise<Business[]>;
  refreshFinData: (bizId: string, options?: { skipTransactions?: boolean; skipRules?: boolean }) => Promise<void>;
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

  const refreshBusinesses = async () => {
    try {
      const businessesRes = await businessApi.list().catch(() => ({ data: [] }));
      const rawBizs = (businessesRes.data || []) as any[];
      const currentBusinesses = rawBizs.map(b => ({
        id: b.id || b.Id,
        name: b.name || b.Name,
        isDefault: b.isDefault || b.IsDefault,
        businessSettingsJson: b.businessSettingsJson || b.BusinessSettingsJson,
        userId: b.userId || b.UserId,
        createdAt: b.createdAt || b.CreatedAt,
        updatedAt: b.updatedAt || b.UpdatedAt
      }));
      setBusinesses(currentBusinesses);
      return currentBusinesses;
    } catch (err) {
      console.error("Error refreshing businesses:", err);
      return businesses;
    }
  };

  const refreshFinData = async (bizId: string, options?: { skipTransactions?: boolean; skipRules?: boolean }) => {
    if (!user || !bizId) return;
    try {
      const promises: Promise<any>[] = [
        businessApi.listCategories(bizId)
      ];

      if (!options?.skipRules) {
        promises.push(ruleApi.list(bizId).catch(() => ({ data: [] })));
      }

      const results = await Promise.all(promises);
      const catRes = results[0];
      const ruleRes = options?.skipRules ? null : results[1];

      setFinData(prev => ({
        ...prev,
        budgets: (catRes.data || []).map((b: any) => ({
          ...b,
          id: b.id || b.Id,
          name: b.Name || b.name || b.category || b.CategoryName,
          category: b.Name || b.name || b.category || b.CategoryName,
          amount: b.Amount ?? b.amount ?? b.Budget ?? b.budget ?? 0
        })),
        rules: ruleRes ? (ruleRes.data || []) : prev.rules
      }));
    } catch (err) {
      console.error("Error refreshing financial data:", err);
    }
  };

  const refreshData = async (options?: { skipTransactions?: boolean; skipRules?: boolean }) => {
    if (!user) return;
    const currentBusinesses = await refreshBusinesses();

    // If no active business but we have businesses, pick one
    let effectiveBizId = activeBusinessId;
    if (!effectiveBizId && currentBusinesses.length > 0) {
      const defaultBiz = currentBusinesses.find((b: any) => b.isDefault) || currentBusinesses[0];
      effectiveBizId = defaultBiz.id;
      setActiveBusinessId(effectiveBizId);
    }

    if (effectiveBizId) {
      await refreshFinData(effectiveBizId, options);
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
        const rawBizs = (res.data || []) as any[];
        const bizs = rawBizs.map(b => ({
          id: b.id || b.Id,
          name: b.name || b.Name,
          isDefault: b.isDefault || b.IsDefault,
          businessSettingsJson: b.businessSettingsJson || b.BusinessSettingsJson,
          userId: b.userId || b.UserId,
          createdAt: b.createdAt || b.CreatedAt,
          updatedAt: b.updatedAt || b.UpdatedAt
        }));
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

  const updateBusiness = async (id: string, data: Partial<Business>, options?: { skipRefresh?: boolean }) => {
    if (!user) return;
    try {
      // Ensure we pass the Id in PascalCase as expected by SaveBusinessDto
      const payload = { ...data, Id: id };
      await businessApi.save(payload);
      
      await logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'UPDATE',
        resourceType: 'business',
        resourceId: id,
        details: `Updated business properties: ${Object.keys(data).join(', ')}`
      });
      
      if (options?.skipRefresh) return;

      await refreshBusinesses();
      // If we updated the active business, we might want to refresh categories at least (but not transactions)
      if (id === activeBusinessId) {
        const catRes = await businessApi.listCategories(id);
        setFinData(prev => ({
          ...prev,
          budgets: (catRes.data || []).map((b: any) => ({
            ...b,
            name: b.name || b.Name || b.category || b.CategoryName,
            category: b.name || b.Name || b.category || b.CategoryName,
            amount: b.amount ?? b.Amount ?? b.budget ?? b.Budget ?? 0
          }))
        }));
      }
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
      
      const bizs = await refreshBusinesses();

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
      refreshBusinesses,
      refreshFinData,
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
