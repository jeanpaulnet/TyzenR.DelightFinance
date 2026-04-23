import axios from 'axios';
import { auth } from './firebase';

const BASE_URL = 'https://webapi.tyzenr.com/delight/';

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Always send User context headers if available
api.interceptors.request.use((config) => {
  const user = auth.currentUser;
  if (user) {
    config.headers['X-User-Email'] = user.email || '';
    config.headers['X-User-Id'] = user.uid;
    config.headers['X-User-Name'] = user.displayName || 'Delight User';
  }
  return config;
});

export interface BusinessEntity {
  id: string;
  name: string;
  isDefault: boolean;
  businessSettingsJson: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
}

export interface TransactionEntity {
  id: string;
  amount: number;
  deductions: number;
  finalAmount: number;
  categoryId: string;
  description: string;
  date: string;
  notes: string;
  businessId: string;
}

export interface CategoryEntity {
  id: string;
  name: string;
  amount: number;
  type: string;
  gstRate: number;
  month: number;
  year: number;
  businessId: string;
  userId: string;
}

export interface ImportRuleEntity {
  id: string;
  keyword: string;
  category: string;
  businessId: string;
  userId: string;
}

export const categoryApi = {
  create: async (businessId: string, data: { name: string; type: string; month: number; year: number }) => 
    await api.post(`category/${businessId}`, data),
  update: async (id: string, data: any) => await api.put(`category/${id}`, data),
  delete: async (id: string) => await api.delete(`category/${id}`),
};

export const businessApi = {
  create: async (data: any, config?: any) => await api.post('business', data, config),
  get: async (id: string) => await api.get(`business/${id}`),
  list: async () => await api.get('businesses'),
  update: async (id: string, data: any) => await api.put(`business/${id}`, data),
  delete: async (id: string) => await api.delete(`business/${id}`),
  listCategories: async (businessId: string) => await api.get(`business/${businessId}/categories`),
};

export const transactionApi = {
  create: async (data: any) => await api.post('transaction', data),
  // Note: Controller didn't have list/get for transactions, but we assume default REST pattern
  list: async (businessId: string) => await api.get(`business/${businessId}/transactions`),
};

export const ruleApi = {
  create: async (data: any) => await api.post('rule', data),
  list: async (businessId: string) => await api.get(`business/${businessId}/rules`),
};

export const aiApi = {
  chat: async (prompt: string) => await api.post('chat', { prompt }),
};

export default api;
