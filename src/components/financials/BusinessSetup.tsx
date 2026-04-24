import React, { useState } from 'react';
import { useApp } from '../../AppContext';
import { businessApi, categoryApi, transactionApi } from '../../lib/api';
import { motion } from 'motion/react';
import { Building2, Wallet, TrendingUp, MessageSquare, ChevronRight, Loader2, X, User, PieChart, HelpCircle, LogOut } from 'lucide-react';
import { cn } from '../../lib/utils';
import { auth } from '../../lib/firebase';
import { signOut } from 'firebase/auth';

export default function BusinessSetup({ onClose }: { onClose?: () => void }) {
  const { user, businesses, refreshData, setActiveTab, setActiveBusinessId } = useApp();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.displayName ? `${user.displayName}'s Finance` : '',
    currency: 'USD',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    isBudgetingEnabled: true,
    isGstEnabled: false,
    type: 'Personal' as 'Personal' | 'Business'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || loading) return;

    setLoading(true);
    try {
      const bizRes = await businessApi.create({
        Name: formData.name,
        IsDefault: true,
        Settings: {
          Currency: formData.currency,
          Timezone: formData.timezone,
          IsBudgetingEnabled: formData.isBudgetingEnabled,
          IsGstEnabled: formData.isGstEnabled,
          FiscalYearStart: '01-01',
          FiscalYearEnd: '12-31',
          Type: formData.type
        }
      });
      // Success return is the Id guid from api (might be the whole object or just the string)
      const bizId = bizRes.data.Id || bizRes.data.id || bizRes.data;
      
      // Set the active business ID immediately so subsequent refreshes work
      setActiveBusinessId(bizId);

      await refreshData();
      setActiveTab('dashboard');
      if (onClose) {
        onClose();
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
                   Delight Finance supports multiple business. Let's start by defining your primary business.
                 </p>
              </div>
           </div>

           <div className="space-y-4 pt-10">
              <div className="flex items-start gap-3">
                 <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-[#86BC24] shrink-0 border border-white/5">
                    <Wallet size={16} />
                 </div>
                 <div>
                    <p className="text-xs font-bold text-slate-200 uppercase tracking-widest">BUDGETING</p>
                    <p className="text-[10px] text-slate-500">Enable category targets & variance monitoring.</p>
                 </div>
              </div>
              <div className="flex items-start gap-3">
                 <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-[#86BC24] shrink-0 border border-white/5">
                    <TrendingUp size={16} />
                 </div>
                 <div>
                    <p className="text-xs font-bold text-slate-200 uppercase tracking-widest">KPIs</p>
                    <p className="text-[10px] text-slate-500">Real-time performance metrics and health scores.</p>
                 </div>
              </div>
              <div className="flex items-start gap-3">
                 <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-[#86BC24] shrink-0 border border-white/5">
                    <MessageSquare size={16} />
                 </div>
                 <div>
                    <p className="text-xs font-bold text-slate-200 uppercase tracking-widest">AI CHAT</p>
                    <p className="text-[10px] text-slate-500">Intelligent insights powered by advanced logic.</p>
                 </div>
              </div>
           </div>
        </div>

        <div className="md:col-span-3 p-10 bg-white relative">
           {!businesses.length && (
             <button 
               onClick={() => signOut(auth)}
               className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider"
               title="Log Out"
             >
               <LogOut size={14} />
               <span>Logout</span>
             </button>
           )}
           <form onSubmit={handleSubmit} className="space-y-6">
               <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                     <Building2 size={12} />
                     {formData.type === 'Business' ? 'Business Name' : 'Profile Name'}
                  </label>
                  <input 
                     required
                     value={formData.name}
                     onChange={e => setFormData({...formData, name: e.target.value})}
                     placeholder={formData.type === 'Business' ? "e.g. Acme Corporation LLC" : "e.g. Personal Finances"}
                     className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#86BC24] focus:ring-4 focus:ring-[#86BC24]/5 transition-all"
                  />
               </div>

               <div className="space-y-4">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                     <User size={12} />
                     Business Type
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
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                     <TrendingUp size={12} />
                     Features
                  </label>
                  <div className="space-y-3">
                     <label className="flex items-center gap-3 cursor-pointer group">
                       <input 
                         type="checkbox"
                         checked={formData.isBudgetingEnabled}
                         onChange={e => setFormData({...formData, isBudgetingEnabled: e.target.checked})}
                         className="w-4 h-4 rounded border-slate-300 text-[#86BC24] focus:ring-[#86BC24]/20 transition-all cursor-pointer"
                       />
                       <div className="flex items-center gap-2">
                         <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900 transition-colors">
                           Budgeting
                         </span>
                         <div className="group/help relative">
                           <HelpCircle size={14} className="text-slate-400 group-hover/help:text-[#86BC24] transition-colors" />
                           <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-3 bg-slate-900 text-white text-[10px] rounded-xl opacity-0 group-hover/help:opacity-100 transition-opacity pointer-events-none shadow-xl z-20 text-center">
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
                           <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900 transition-colors">
                             GST
                           </span>
                           <div className="group/help relative">
                             <HelpCircle size={14} className="text-slate-400 group-hover/help:text-[#86BC24] transition-colors" />
                             <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-3 bg-slate-900 text-white text-[10px] rounded-xl opacity-0 group-hover/help:opacity-100 transition-opacity pointer-events-none shadow-xl z-20 text-center">
                               If GST, Income category will have GST % field configurable & will be adjusted in Transactions
                               <div className="absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent border-t-slate-900" />
                             </div>
                           </div>
                         </div>
                       </label>
                     )}
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
