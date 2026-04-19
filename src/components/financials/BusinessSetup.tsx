import React, { useState } from 'react';
import { useApp } from '../../AppContext';
import { db } from '../../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { motion } from 'motion/react';
import { Building2, Globe, Coins, Clock, ChevronRight, Loader2, X } from 'lucide-react';
import { cn } from '../../lib/utils';

const CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
];

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Australia/Sydney',
];

const DEFAULT_CATEGORIES = [
  { category: 'Housing', amount: 0 },
  { category: 'Food', amount: 0 },
  { category: 'Health', amount: 0 },
  { category: 'Transportation', amount: 0 },
  { category: 'Utility', amount: 0 },
  { category: 'Education', amount: 0 },
  { category: 'Entertainment', amount: 0 },
  { category: 'Gifts', amount: 0 },
  { category: 'Loans', amount: 0 },
  { category: 'Business', amount: 0 },
  { category: 'Miscellaneous', amount: 0 },
];

export default function BusinessSetup({ onClose }: { onClose?: () => void }) {
  const { user, businesses } = useApp();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.displayName ? `${user.displayName}'s Finance` : '',
    type: 'personal' as 'personal' | 'business',
    currency: 'USD',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || loading) return;

    setLoading(true);
    try {
      const bizRef = collection(db, 'users', user.uid, 'businesses');
      const bizDoc = await addDoc(bizRef, {
        ...formData,
        userId: user.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Initialize default budgets for the new business
      const budgetRef = collection(db, 'users', user.uid, 'budgets');
      const now = new Date();
      for (const cat of DEFAULT_CATEGORIES) {
        await addDoc(budgetRef, {
          ...cat,
          businessId: bizDoc.id,
          month: now.getMonth() + 1,
          year: now.getFullYear(),
          userId: user.uid,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        });
      }
    } catch (err) {
      console.error("Error creating business:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0F172A] z-[100] flex items-center justify-center p-6 sm:p-10 overflow-y-auto">
      <div className="absolute inset-0 opacity-20 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed" />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-2xl w-full bg-white rounded-3xl overflow-hidden shadow-2xl relative z-10 grid grid-cols-1 md:grid-cols-5"
      >
        {onClose && businesses.length > 0 && (
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full z-20 transition-all"
          >
            <X size={20} />
          </button>
        )}
        <div className="md:col-span-2 bg-[#1E293B] p-10 text-white flex flex-col justify-between">
           <div className="space-y-6">
              <div className="w-12 h-12 bg-[#86BC24] rounded-xl flex items-center justify-center font-bold text-2xl shadow-lg shadow-green-500/20">D</div>
              <div className="space-y-4">
                 <h1 className="text-3xl font-bold tracking-tight leading-tight">Setup your <span className="text-[#86BC24]">Financial Profile</span></h1>
                 <p className="text-slate-400 text-sm leading-relaxed">
                   Delight Finance supports multi-entity management. Let's start by defining your primary account unit.
                 </p>
              </div>
           </div>

           <div className="space-y-4 pt-10">
              <div className="flex items-start gap-3">
                 <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-[#86BC24] shrink-0 border border-white/5">
                    <Coins size={16} />
                 </div>
                 <div>
                    <p className="text-xs font-bold text-slate-200 uppercase tracking-widest">Multi-Currency</p>
                    <p className="text-[10px] text-slate-500">Track and report in any global currency.</p>
                 </div>
              </div>
              <div className="flex items-start gap-3">
                 <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-[#86BC24] shrink-0 border border-white/5">
                    <Globe size={16} />
                 </div>
                 <div>
                    <p className="text-xs font-bold text-slate-200 uppercase tracking-widest">Timezone Aware</p>
                    <p className="text-[10px] text-slate-500">Accurate audit trails across global borders.</p>
                 </div>
              </div>
           </div>
        </div>

        <div className="md:col-span-3 p-10 bg-white">
           <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                 <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Building2 size={12} />
                    Business Name
                 </label>
                 <input 
                    required
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="e.g. Acme Corporation LLC"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#86BC24] focus:ring-4 focus:ring-[#86BC24]/5 transition-all"
                 />
              </div>

              <div className="space-y-3">
                 <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Profile Type</label>
                 <div className="grid grid-cols-1 gap-3">
                    <label className={cn(
                      "relative flex items-center gap-3 p-4 border rounded-2xl cursor-pointer transition-all",
                      formData.type === 'personal' ? "border-[#86BC24] bg-[#86BC24]/5" : "border-slate-100 hover:border-slate-200"
                    )}>
                       <input 
                        type="radio" 
                        name="type" 
                        className="sr-only"
                        checked={formData.type === 'personal'}
                        onChange={() => setFormData({...formData, type: 'personal'})}
                       />
                       <div className={cn(
                         "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all",
                         formData.type === 'personal' ? "border-[#86BC24]" : "border-slate-300"
                       )}>
                          {formData.type === 'personal' && <div className="w-2 h-2 rounded-full bg-[#86BC24]" />}
                       </div>
                       <div>
                          <p className="text-sm font-bold text-slate-900">Personal Finance</p>
                          <p className="text-[10px] text-slate-500 font-medium">Focused on Budgeting & Household expenses</p>
                       </div>
                    </label>

                    <label className={cn(
                      "relative flex items-center gap-3 p-4 border rounded-2xl cursor-pointer transition-all",
                      formData.type === 'business' ? "border-[#86BC24] bg-[#86BC24]/5" : "border-slate-100 hover:border-slate-200"
                    )}>
                       <input 
                        type="radio" 
                        name="type" 
                        className="sr-only"
                        checked={formData.type === 'business'}
                        onChange={() => setFormData({...formData, type: 'business'})}
                       />
                       <div className={cn(
                         "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all",
                         formData.type === 'business' ? "border-[#86BC24]" : "border-slate-300"
                       )}>
                          {formData.type === 'business' && <div className="w-2 h-2 rounded-full bg-[#86BC24]" />}
                       </div>
                       <div>
                          <p className="text-sm font-bold text-slate-900">Business Finance</p>
                          <p className="text-[10px] text-slate-500 font-medium">Focused on Accounting & Corporate ledgers</p>
                       </div>
                    </label>
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                       <Coins size={12} />
                       Reporting Currency
                    </label>
                    <select 
                       value={formData.currency}
                       onChange={e => setFormData({...formData, currency: e.target.value})}
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#86BC24] transition-all cursor-pointer"
                    >
                       {CURRENCIES.map(c => (
                          <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
                       ))}
                    </select>
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                       <Clock size={12} />
                       Reporting Timezone
                    </label>
                    <select 
                       value={formData.timezone}
                       onChange={e => setFormData({...formData, timezone: e.target.value})}
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#86BC24] transition-all cursor-pointer"
                    >
                       {TIMEZONES.map(t => (
                          <option key={t} value={t}>{t}</option>
                       ))}
                       {!TIMEZONES.includes(formData.timezone) && (
                         <option value={formData.timezone}>{formData.timezone}</option>
                       )}
                    </select>
                 </div>
              </div>

              <div className="pt-6">
                 <button 
                  disabled={loading}
                  className="w-full bg-[#86BC24] text-white rounded-xl py-4 font-bold text-sm uppercase tracking-widest shadow-xl shadow-green-500/20 hover:bg-[#75A51F] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                 >
                    {loading ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <>
                        Create
                        <ChevronRight size={18} />
                      </>
                    )}
                 </button>
              </div>
           </form>
        </div>
      </motion.div>
    </div>
  );
}
