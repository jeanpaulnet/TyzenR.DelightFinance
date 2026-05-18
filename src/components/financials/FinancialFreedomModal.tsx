import React, { useMemo } from 'react';
import { X, Shield, Info, Zap, DollarSign, Wallet, Check } from 'lucide-react';
import { useApp, getBusinessSettings } from '../../AppContext';
import { cn, formatCurrency } from '../../lib/utils';

interface FinancialFreedomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FinancialFreedomModal({ isOpen, onClose }: FinancialFreedomModalProps) {
  const { finData, businesses, activeBusinessId, updateBusiness } = useApp();

  const activeBusiness = useMemo(() => 
    businesses.find(b => b.id === activeBusinessId), 
  [businesses, activeBusinessId]);

  const settings = useMemo(() => 
    activeBusiness ? getBusinessSettings(activeBusiness) : null
  , [activeBusiness]);

  const [localPassiveIds, setLocalPassiveIds] = React.useState<string[]>([]);
  const [localEssentialIds, setLocalEssentialIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (activeBusiness) {
      try {
        const s = JSON.parse(activeBusiness.businessSettingsJson || '{}');
        setLocalPassiveIds(s.passiveIncomeCategoryIds || []);
        setLocalEssentialIds(s.essentialExpenseCategoryIds || []);
      } catch (e) {
        setLocalPassiveIds([]);
        setLocalEssentialIds([]);
      }
    }
  }, [activeBusiness?.businessSettingsJson]);

  const incomeCategories = useMemo(() => 
    finData.budgets.filter(b => b.type === 'Income')
  , [finData.budgets]);

  const expenseCategories = useMemo(() => 
    finData.budgets.filter(b => b.type === 'Expense' || !b.type)
  , [finData.budgets]);

  const totals = useMemo(() => {
    const passiveTotal = incomeCategories
      .filter(c => localPassiveIds.includes(c.id))
      .reduce((sum, c) => sum + (c.amount || 0), 0);

    const essentialTotal = expenseCategories
      .filter(c => localEssentialIds.includes(c.id))
      .reduce((sum, c) => sum + (c.amount || 0), 0);

    return { passiveTotal, essentialTotal };
  }, [incomeCategories, expenseCategories, localPassiveIds, localEssentialIds]);

  const handleTogglePassive = async (id: string) => {
    if (!activeBusiness) return;
    
    // Optimistic update
    const newList = localPassiveIds.includes(id) 
      ? localPassiveIds.filter((cid) => cid !== id)
      : [...localPassiveIds, id];
    
    setLocalPassiveIds(newList);

    try {
      const currentSettings = JSON.parse(activeBusiness.businessSettingsJson || '{}');
      const updatedSettings = {
        ...currentSettings,
        passiveIncomeCategoryIds: newList
      };
      
      await updateBusiness(activeBusiness.id, {
        BusinessSettingsJson: JSON.stringify(updatedSettings)
      } as any);
    } catch (e) {
      console.error(e);
      // Revert on error
      setLocalPassiveIds(localPassiveIds);
    }
  };

  const handleToggleEssential = async (id: string) => {
    if (!activeBusiness) return;

    // Optimistic update
    const newList = localEssentialIds.includes(id) 
      ? localEssentialIds.filter((cid) => cid !== id)
      : [...localEssentialIds, id];
    
    setLocalEssentialIds(newList);

    try {
      const currentSettings = JSON.parse(activeBusiness.businessSettingsJson || '{}');
      const updatedSettings = {
        ...currentSettings,
        essentialExpenseCategoryIds: newList
      };
      
      await updateBusiness(activeBusiness.id, {
        BusinessSettingsJson: JSON.stringify(updatedSettings)
      } as any);
    } catch (e) {
      console.error(e);
      // Revert on error
      setLocalEssentialIds(localEssentialIds);
    }
  };

  React.useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-50 text-[#86BC24] flex items-center justify-center">
              <Zap size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">Financial Freedom</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">Configuration & Targets</p>
                {totals.essentialTotal > 0 && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-slate-300" />
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full",
                      (totals.passiveTotal / totals.essentialTotal) >= 1 
                        ? "bg-emerald-100 text-emerald-700" 
                        : "bg-indigo-100 text-indigo-700"
                    )}>
                      {((totals.passiveTotal / totals.essentialTotal) * 100).toFixed(0)}% Achieved
                    </span>
                  </>
                )}
                {totals.essentialTotal === 0 && totals.passiveTotal > 0 && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-slate-300" />
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                      100% Achieved
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[70vh]">
          <div className="bg-[#86BC24]/5 border border-[#86BC24]/20 rounded-2xl p-4 flex gap-4 mb-8">
            <div className="shrink-0 w-10 h-10 rounded-full bg-[#86BC24]/10 text-[#86BC24] flex items-center justify-center">
              <Info size={18} />
            </div>
            <div>
              <p className="text-sm font-bold text-[#1E293B]">What is Financial Freedom</p>
              <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                Financial Freedom is achieved when your <span className="font-bold text-[#86BC24]">Passive Income</span> (money earned without active labor) meets or exceeds your <span className="font-bold text-rose-500">Essential Expenses</span> (the minimum cost to live your life).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Passive Income Selection */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign size={16} className="text-emerald-500" />
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Passive Income</h3>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Total Monthly</p>
                  <p className="text-lg font-bold text-emerald-600">{formatCurrency(totals.passiveTotal, settings?.currency || 'USD')}</p>
                </div>
              </div>

              <div className="space-y-2 border border-slate-100 rounded-2xl p-2 max-h-64 overflow-y-auto">
                {incomeCategories.length === 0 ? (
                  <p className="text-xs text-slate-400 p-4 text-center">No income categories defined.</p>
                ) : (
                  incomeCategories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => handleTogglePassive(cat.id)}
                      className={cn(
                        "w-full flex items-center justify-between p-3 rounded-xl transition-all border",
                        localPassiveIds.includes(cat.id)
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm"
                          : "bg-white border-slate-100 text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-5 h-5 rounded border flex items-center justify-center transition-all",
                          localPassiveIds.includes(cat.id)
                            ? "bg-emerald-500 border-emerald-500"
                            : "bg-white border-slate-300"
                        )}>
                          {localPassiveIds.includes(cat.id) && <Check size={12} className="text-white" strokeWidth={4} />}
                        </div>
                        <span className="text-xs font-bold">{cat.name}</span>
                      </div>
                      <span className="text-[10px] font-mono opacity-60 text-right">{formatCurrency(cat.amount, settings?.currency || 'USD')}</span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Essential Expenses Selection */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet size={16} className="text-rose-500" />
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Essential Expenses</h3>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Total Monthly</p>
                  <p className="text-lg font-bold text-rose-600">{formatCurrency(totals.essentialTotal, settings?.currency || 'USD')}</p>
                </div>
              </div>

              <div className="space-y-2 border border-slate-100 rounded-2xl p-2 max-h-64 overflow-y-auto">
                {expenseCategories.length === 0 ? (
                  <p className="text-xs text-slate-400 p-4 text-center">No expense categories defined.</p>
                ) : (
                  expenseCategories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => handleToggleEssential(cat.id)}
                      className={cn(
                        "w-full flex items-center justify-between p-3 rounded-xl transition-all border",
                        localEssentialIds.includes(cat.id)
                          ? "bg-rose-50 border-rose-200 text-rose-700 shadow-sm"
                          : "bg-white border-slate-100 text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-5 h-5 rounded border flex items-center justify-center transition-all",
                          localEssentialIds.includes(cat.id)
                            ? "bg-rose-500 border-rose-500"
                            : "bg-white border-slate-300"
                        )}>
                          {localEssentialIds.includes(cat.id) && <Check size={12} className="text-white" strokeWidth={4} />}
                        </div>
                        <span className="text-xs font-bold">{cat.name}</span>
                      </div>
                      <span className="text-[10px] font-mono opacity-60 text-right">{formatCurrency(cat.amount, settings?.currency || 'USD')}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 bg-slate-50 flex items-center justify-between border-t border-slate-100">
           <div className="flex items-center gap-2 text-slate-400 italic">
              <Shield size={14} />
              <span className="text-[10px]">Data is automatically saved to your business preferences.</span>
           </div>
           <button 
             onClick={onClose}
             className="px-6 py-2 bg-[#86BC24] text-white rounded-xl font-bold text-sm hover:shadow-lg hover:bg-[#6DA31A] transition-all"
           >
              Done
           </button>
        </div>
      </div>
    </div>
  );
}
