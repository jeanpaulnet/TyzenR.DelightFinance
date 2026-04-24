import React, { useState, useEffect } from 'react';
import { useApp, getBusinessSettings } from '../../AppContext';
import { motion, AnimatePresence } from 'motion/react';
import { Building2, Coins, Clock, Trash2, Save, AlertTriangle, Loader2, CheckCircle2, HelpCircle, User } from 'lucide-react';
import { cn } from '../../lib/utils';

const CURRENCIES = [
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'JPY', name: 'Japanese Yen' },
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Asia/Tokyo',
];

export default function BusinessSettings() {
  const { businesses, activeBusinessId, updateBusiness, deleteBusiness, setActiveTab, finData } = useApp();
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [formData, setFormData] = useState<{
    name: string;
    currency: string;
    timezone: string;
    fiscalYearStart: string;
    fiscalYearEnd: string;
    isBudgetingEnabled: boolean;
    isGstEnabled: boolean;
    isDefault: boolean;
    type: 'Personal' | 'Business';
  } | null>(null);

  const activeBiz = businesses.find(b => b.id === activeBusinessId);

  useEffect(() => {
    if (activeBiz) {
      const settings = getBusinessSettings(activeBiz);
      setFormData({
        name: activeBiz.name,
        currency: settings.currency,
        timezone: settings.timezone,
        fiscalYearStart: settings.fiscalYearStart || '01-01',
        fiscalYearEnd: settings.fiscalYearEnd || '12-31',
        isBudgetingEnabled: settings.isBudgetingEnabled ?? true,
        isGstEnabled: settings.isGstEnabled ?? false,
        isDefault: activeBiz.isDefault ?? false,
        type: settings.type || 'Personal',
      });
    }
  }, [activeBiz]);

  if (!activeBiz || !formData) return null;

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const { name, isDefault, ...sv } = formData;
      
      // Map to PascalCase for backend compatibility with BusinessSettingsDto
      const settings = {
        Currency: sv.currency,
        Timezone: sv.timezone,
        IsBudgetingEnabled: sv.isBudgetingEnabled,
        IsGstEnabled: sv.isGstEnabled,
        FiscalYearStart: sv.fiscalYearStart,
        FiscalYearEnd: sv.fiscalYearEnd,
        Type: sv.type
      };

      // If setting this as default, unset others first (Logic: Client-side sequential batching)
      if (isDefault) {
        const others = businesses.filter(b => b.id !== activeBiz.id && b.isDefault);
        for (const other of others) {
           await updateBusiness(other.id, { IsDefault: false } as any);
        }
      }

      await updateBusiness(activeBiz.id, {
        Name: name,
        IsDefault: isDefault,
        Settings: settings 
      } as any);
      
      setLoading(false);
      setActiveTab('dashboard'); // Switch to dashboard tab after save
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await deleteBusiness(activeBiz.id);
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#86BC24]/10 flex items-center justify-center text-[#86BC24]">
            <Building2 size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Business Settings</h2>
            <p className="text-sm text-slate-500 mt-1">Manage core configuration for {activeBiz.name}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden"
          >
            <form onSubmit={handleUpdate} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">
                  {formData.type === 'Business' ? 'Business Name' : 'Profile Name'}
                </label>
                <input 
                  required
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#86BC24] focus:ring-4 focus:ring-[#86BC24]/5 transition-all"
                />
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                  <User size={12} /> Business Type
                </label>
                <div className="flex gap-3">
                  {[
                    { id: 'Personal', icon: User },
                    { id: 'Business', icon: Building2 }
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFormData({...formData, type: t.id as any})}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border text-[11px] font-bold transition-all uppercase tracking-wider",
                        formData.type === t.id 
                          ? "bg-[#86BC24]/10 border-[#86BC24] text-[#86BC24] shadow-sm shadow-green-500/10" 
                          : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                      )}
                    >
                      <t.icon size={14} />
                      {t.id}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Feature Configuration</label>
                <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input 
                      type="checkbox"
                      checked={formData.isBudgetingEnabled}
                      onChange={e => setFormData({...formData, isBudgetingEnabled: e.target.checked})}
                      className="w-4 h-4 rounded border-slate-300 text-[#86BC24] focus:ring-[#86BC24]/20 transition-all cursor-pointer"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">
                        Budgeting
                      </span>
                      <div className="group/help relative">
                        <HelpCircle size={14} className="text-slate-400 group-hover/help:text-[#86BC24] transition-colors" />
                        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-3 bg-slate-900 text-white text-[10px] rounded-xl opacity-0 group-hover/help:opacity-100 transition-opacity pointer-events-none shadow-xl z-20">
                          Set budget per month on categories & check transactions
                          <div className="absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent border-t-slate-900" />
                        </div>
                      </div>
                    </div>
                  </label>
                  {formData.type === 'Business' && (
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox"
                        checked={formData.isGstEnabled}
                        onChange={e => setFormData({...formData, isGstEnabled: e.target.checked})}
                        className="w-4 h-4 rounded border-slate-300 text-[#86BC24] focus:ring-[#86BC24]/20 transition-all cursor-pointer"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">
                          GST
                        </span>
                        <div className="group/help relative">
                          <HelpCircle size={14} className="text-slate-400 group-hover/help:text-[#86BC24] transition-colors" />
                          <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-3 bg-slate-900 text-white text-[10px] rounded-xl opacity-0 group-hover/help:opacity-100 transition-opacity pointer-events-none shadow-xl z-20">
                            If GST, Income category will have GST % field configurable & will be adjusted in Transactions
                            <div className="absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent border-t-slate-900" />
                          </div>
                        </div>
                      </div>
                    </label>
                  )}
                  {businesses.length > 1 && (
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox"
                        checked={formData.isDefault}
                        onChange={e => setFormData({...formData, isDefault: e.target.checked})}
                        className="w-4 h-4 rounded border-slate-300 text-[#86BC24] focus:ring-[#86BC24]/20 transition-all cursor-pointer"
                      />
                      <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">
                        Set as Default Business
                      </span>
                    </label>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Clock size={12} /> Accounting Year Start
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <select 
                      value={formData.fiscalYearStart.split('-')[0]}
                      onChange={e => {
                        const [m, d] = formData.fiscalYearStart.split('-');
                        setFormData({...formData, fiscalYearStart: `${e.target.value}-${d}`});
                      }}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#86BC24] transition-all"
                    >
                      {MONTHS.map((m, i) => (
                        <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
                      ))}
                    </select>
                    <select 
                      value={formData.fiscalYearStart.split('-')[1]}
                      onChange={e => {
                        const [m, d] = formData.fiscalYearStart.split('-');
                        setFormData({...formData, fiscalYearStart: `${m}-${e.target.value.padStart(2, '0')}`});
                      }}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#86BC24] transition-all"
                    >
                      {Array.from({ length: 31 }, (_, i) => (
                        <option key={i + 1} value={String(i + 1).padStart(2, '0')}>{i + 1}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Clock size={12} /> Accounting Year End
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <select 
                      value={formData.fiscalYearEnd.split('-')[0]}
                      onChange={e => {
                        const [m, d] = formData.fiscalYearEnd.split('-');
                        setFormData({...formData, fiscalYearEnd: `${e.target.value}-${d}`});
                      }}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#86BC24] transition-all"
                    >
                      {MONTHS.map((m, i) => (
                        <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
                      ))}
                    </select>
                    <select 
                      value={formData.fiscalYearEnd.split('-')[1]}
                      onChange={e => {
                        const [m, d] = formData.fiscalYearEnd.split('-');
                        setFormData({...formData, fiscalYearEnd: `${m}-${e.target.value.padStart(2, '0')}`});
                      }}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#86BC24] transition-all"
                    >
                      {Array.from({ length: 31 }, (_, i) => (
                        <option key={i + 1} value={String(i + 1).padStart(2, '0')}>{i + 1}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button 
                  type="submit"
                  disabled={loading}
                  className="bg-[#86BC24] text-white px-8 py-3 rounded-xl font-bold text-sm uppercase tracking-widest shadow-lg shadow-[#86BC24]/20 hover:bg-[#75A51F] transition-all flex items-center gap-2"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save Changes
                </button>
              </div>
            </form>
          </motion.div>
        </div>

        <div className="space-y-6">
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-red-50 border border-red-100 rounded-3xl p-8"
          >
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-600/10 flex items-center justify-center">
                <Trash2 size={20} />
              </div>
              <h3 className="text-sm font-bold uppercase tracking-wider">Danger Zone</h3>
            </div>
            
            <p className="text-xs text-red-600/70 leading-relaxed mb-6">
              Deleting this business will remove all associated transactions, budgets, and reporting data. This action is irreversible.
            </p>

            <button 
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full py-3 bg-white border border-red-200 text-red-600 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all shadow-sm"
            >
              Delete Business
            </button>
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setShowDeleteConfirm(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl overflow-hidden"
            >
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-red-600 mx-auto mb-6">
                <AlertTriangle size={32} />
              </div>
              
              <h3 className="text-xl font-bold text-center text-slate-900 mb-2">Delete Business?</h3>
              <p className="text-sm text-slate-500 text-center mb-6 px-4">
                Are you sure you want to delete <span className="font-bold text-slate-900">{activeBiz.name}</span>?
              </p>

              <div className="bg-slate-50 rounded-2xl p-4 mb-8 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Categories</span>
                  <span className="font-bold text-slate-900">{finData.budgets.length}</span>
                </div>
                <div className="flex items-center justify-between text-sm border-t border-slate-100 pt-3">
                  <span className="text-slate-500">Transactions</span>
                  <span className="font-bold text-slate-900">{finData.expenses.length}</span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={handleDelete}
                  disabled={loading}
                  className="w-full py-4 bg-red-600 text-white rounded-xl font-bold text-sm uppercase tracking-widest shadow-lg shadow-red-500/20 hover:bg-red-700 transition-all flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 size={18} className="animate-spin" />}
                  Confirm Permanent Deletion
                </button>
                <button 
                  onClick={() => setShowDeleteConfirm(false)}
                  className="w-full py-4 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
