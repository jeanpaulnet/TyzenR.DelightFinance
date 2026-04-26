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
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    config.headers['UserId'] = user.uid;
    config.headers['UserName'] = user.displayName || 'Delight User';
    config.headers['UserEmail'] = user.email || '';
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
  budget: number;
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
  create: async (businessId: string, data: any) => 
    await api.post(`category`, { ...data, BusinessId: businessId }),
  update: async (businessId: string, id: string, data: any) => 
    await api.post(`category`, { ...data, Id: id, BusinessId: businessId }),
  delete: async (id: string) => await api.delete(`category/${id}`),
  list: async (businessId: string) => await api.get(`categories/${businessId}`),
};

export const businessApi = {
  save: async (data: any, config?: any) => await api.post('business', data, config),
  create: async (data: any, config?: any) => await api.post('business', data, config),
  get: async (id: string) => await api.get(`business/${id}`),
  list: async () => await api.get('businesses'),
  update: async (id: string, data: any) => await api.post('business', { ...data, Id: id }),
  delete: async (id: string) => await api.delete(`business/${id}`),
  listCategories: async (businessId: string) => await api.get(`categories/${businessId}`),
};

export const transactionApi = {
  create: async (data: any) => await api.post('transaction', data),
  update: async (id: string, data: any) => await api.post('transaction', { ...data, Id: id }),
  listPaged: async (businessId: string, params: { startDate?: string; endDate?: string; page?: number; pageSize?: number; searchText?: string }) => 
    await api.get(`business/${businessId}/transactions/paged`, { params }),
};

export const ruleApi = {
  create: async (data: any) => await api.post('rule', data),
  list: async (businessId: string) => await api.get(`business/${businessId}/rules`),
};

export const aiApi = {
  chat: async (prompt: string) => await api.post('chat', { prompt }),
};

export default api;
