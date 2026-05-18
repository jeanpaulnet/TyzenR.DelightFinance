import React, { useState, useEffect, useMemo } from 'react';
import { useApp, getBusinessSettings } from '../../AppContext';
import { categoryApi } from '../../lib/api';
import { logEvent } from '../../lib/audit';
import { 
  TrendingUp, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X, 
  Building2, 
  ShieldAlert, 
  ChevronRight, 
  Loader2,
  ArrowRight
} from 'lucide-react';
import { formatCurrency, getCurrencySymbol, cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function NetWorthManager() {
  const { finData, user, activeBusinessId, businesses, refreshData } = useApp();
  const activeBusiness = useMemo(() => businesses.find(b => b.id === activeBusinessId), [businesses, activeBusinessId]);
  const settings = activeBusiness ? getBusinessSettings(activeBusiness) : null;
  const currencyCode = settings?.currency || 'USD';

  const [isAdding, setIsAdding] = useState(false);
  const [newBudget, setNewBudget] = useState({ name: '', amount: 0, type: 'Asset', year: new Date().getFullYear(), month: 12 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBudget, setEditBudget] = useState({ name: '', amount: 0, type: 'Asset', year: new Date().getFullYear(), month: 12 });
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string | null, category: string } | null>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsAdding(false);
        setEditingId(null);
        setDeleteConfirm(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  useEffect(() => {
    if (user) {
      logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'VIEW',
        resourceType: 'networth'
      });
    }
  }, [user]);

  // Unique years found in budgets, sorted descending
  const years = useMemo(() => {
    const y = new Set<number>();
    finData.budgets.forEach(b => {
      if (b.year) y.add(b.year);
    });
    y.add(new Date().getFullYear());
    return Array.from(y).sort((a, b) => b - a);
  }, [finData.budgets]);

  // Filter for Assets and Liabilities
  const netWorthItems = useMemo(() => {
    const categories = new Set<string>();
    finData.budgets.forEach(b => {
      if (b.type === 'Asset' || b.type === 'Liability') {
        categories.add(b.name);
      }
    });

    return Array.from(categories).map(catName => {
      const allForCategory = finData.budgets.filter(b => b.name === catName);
      const firstFound = allForCategory[0];
      
      const yearlyValues: Record<number, any> = {};
      years.forEach(year => {
        // Find the record for this year for this category
        // If multiple records exist (different months), we take the latest month
        const yearRecords = allForCategory.filter(b => b.year === year);
        if (yearRecords.length > 0) {
          yearlyValues[year] = yearRecords.reduce((prev, curr) => (curr.month > prev.month ? curr : prev));
        } else {
          yearlyValues[year] = null;
        }
      });

      return {
        name: catName,
        type: firstFound?.type || 'Asset',
        yearlyValues
      };
    }).sort((a, b) => {
        if (a.type !== b.type) return a.type === 'Asset' ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
  }, [finData.budgets, years]);

  // Calculate totals for the bottom row
  const yearTotals = useMemo(() => {
    const totals: Record<number, number> = {};
    years.forEach(year => {
      let sum = 0;
      netWorthItems.forEach(item => {
        const record = item.yearlyValues[year];
        if (record) {
          if (item.type === 'Asset') sum += record.amount || 0;
          else sum -= record.amount || 0;
        }
      });
      totals[year] = sum;
    });
    return totals;
  }, [netWorthItems, years]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeBusinessId) return;

    try {
      const res = await categoryApi.create(activeBusinessId, {
        name: newBudget.name,
        type: newBudget.type,
        amount: newBudget.amount,
        month: newBudget.month,
        year: newBudget.year
      });

      await logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'CREATE',
        resourceType: 'budget',
        resourceId: res.data.id,
        resourceName: newBudget.name,
        details: `Added ${newBudget.name} (${newBudget.type}) for ${newBudget.year} at ${formatCurrency(newBudget.amount, currencyCode)}`
      });

      await refreshData({ skipRules: true });
      setNewBudget({ name: '', amount: 0, type: 'Asset', year: new Date().getFullYear(), month: 12 });
      setIsAdding(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeBusinessId || !editingId) return;

    try {
      await categoryApi.update(activeBusinessId, editingId, {
        name: editBudget.name,
        type: editBudget.type,
        amount: editBudget.amount,
        month: editBudget.month,
        year: editBudget.year
      });

      await logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'UPDATE',
        resourceType: 'budget',
        resourceId: editingId,
        resourceName: editBudget.name,
        details: `Updated ${editBudget.name} for ${editBudget.year}`
      });

      await refreshData({ skipRules: true });
      setEditingId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (catName: string) => {
    if (!user || !activeBusinessId) return;
    setIsDeleting(true);
    try {
      const related = finData.budgets.filter(b => b.name === catName && (b.type === 'Asset' || b.type === 'Liability'));
      await Promise.all(related.map(b => categoryApi.delete(b.id)));

      await logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'DELETE',
        resourceType: 'budget',
        resourceName: catName,
        details: `Deleted net worth item ${catName} and all its records`
      });

      await refreshData({ skipRules: true });
      setDeleteConfirm(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  const startEdit = (item: any, year: number) => {
    const record = item.yearlyValues[year];
    if (record) {
      setEditingId(record.id);
      setEditBudget({
        name: item.name,
        amount: record.amount,
        type: item.type,
        year: record.year,
        month: record.month
      });
    } else {
        // Prepare to add for this year
        setEditingId(`add-${item.name}-${year}`);
        setEditBudget({
            name: item.name,
            amount: 0,
            type: item.type,
            year: year,
            month: 12
        });
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId?.startsWith('add-')) {
        // Create new
        if (!user || !activeBusinessId) return;
        try {
            await categoryApi.create(activeBusinessId, {
                name: editBudget.name,
                type: editBudget.type,
                amount: editBudget.amount,
                month: editBudget.month,
                year: editBudget.year
            });
            await refreshData({ skipRules: true });
            setEditingId(null);
        } catch (err) { console.error(err); }
    } else {
        handleUpdate(e);
    }
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-[#1E293B] tracking-tight">Net Worth</h1>
          <p className="text-[#64748B] text-sm italic">Track your assets & liabilities over time</p>
        </div>

        {!isAdding && (
          <button 
            onClick={() => setIsAdding(true)} 
            className="bg-slate-900 text-white rounded-xl flex items-center gap-2 h-[42px] px-6 font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-md"
          >
            <Plus size={18} />
            Add Item
          </button>
        )}
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.form 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onSubmit={handleAdd} 
            className="bg-[#86BC24] rounded-xl p-6 shadow-lg border-none grid grid-cols-1 md:grid-cols-5 gap-4"
          >
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-white uppercase tracking-widest">Description</label>
              <input 
                value={newBudget.name} 
                onChange={e => setNewBudget({...newBudget, name: e.target.value})}
                placeholder="e.g. Savings Account" 
                required 
                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900/10 text-slate-900 transition-all text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-white uppercase tracking-widest">Type</label>
              <select 
                value={newBudget.type} 
                onChange={e => setNewBudget({...newBudget, type: e.target.value as any})}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900/10 text-slate-900 transition-all text-sm font-bold"
              >
                <option value="Asset">Asset</option>
                <option value="Liability">Liability</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-white uppercase tracking-widest">Year</label>
              <input 
                type="number"
                value={newBudget.year}
                onChange={e => setNewBudget({...newBudget, year: parseInt(e.target.value)})}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900/10 text-slate-900 transition-all text-sm font-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-white uppercase tracking-widest">Value</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono italic text-xs">
                  {getCurrencySymbol(currencyCode)}
                </span>
                <input 
                  type="number" 
                  step="0.01" 
                  value={newBudget.amount} 
                  onChange={e => setNewBudget({...newBudget, amount: parseFloat(e.target.value) || 0})}
                  placeholder="0.00" 
                  required 
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900/10 text-slate-900 transition-all text-sm font-mono"
                />
              </div>
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" className="flex-1 bg-slate-900 text-white rounded-lg font-bold uppercase text-[10px] tracking-widest h-[42px] hover:bg-slate-800 transition-all shadow-md">
                Add
              </button>
              <button 
                type="button" 
                onClick={() => setIsAdding(false)} 
                className="px-3 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-all h-[42px]"
              >
                <X size={18} />
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-700 border-b border-slate-600">
                <th className="px-6 py-4 text-[10px] font-bold text-white uppercase tracking-widest min-w-[200px]">Item</th>
                <th className="px-6 py-4 text-[10px] font-bold text-white uppercase tracking-widest w-24">Type</th>
                {years.map(year => (
                  <th key={year} className="px-6 py-4 text-[10px] font-bold text-white uppercase tracking-widest text-right">
                    {year}
                  </th>
                ))}
                <th className="px-6 py-4 text-[10px] font-bold text-white uppercase tracking-widest text-right w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {netWorthItems.map((item) => (
                <tr key={item.name} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        item.type === 'Asset' ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"
                      )}>
                        {item.type === 'Asset' ? <Building2 size={16} /> : <ShieldAlert size={16} />}
                      </div>
                      <span className="font-semibold text-slate-900">{item.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border",
                      item.type === 'Asset' ? "bg-blue-50 text-blue-600 border-blue-100" : "bg-orange-50 text-orange-600 border-orange-100"
                    )}>
                      {item.type}
                    </span>
                  </td>
                  {years.map(year => {
                    const record = item.yearlyValues[year];
                    const isEditing = editingId === record?.id || editingId === `add-${item.name}-${year}`;
                    
                    return (
                      <td key={year} className="px-6 py-4 text-right">
                        {isEditing ? (
                          <form onSubmit={handleEditSubmit} className="flex items-center justify-end gap-1">
                            <input 
                              type="number"
                              autoFocus
                              value={editBudget.amount}
                              onChange={e => setEditBudget({...editBudget, amount: parseFloat(e.target.value) || 0})}
                              className="w-24 p-1 text-right text-xs bg-white border border-[#86BC24] rounded-md outline-none"
                            />
                            <button type="submit" className="p-1 text-green-600 hover:bg-green-50 rounded">
                              <Check size={14} />
                            </button>
                            <button type="button" onClick={() => setEditingId(null)} className="p-1 text-slate-400 hover:bg-slate-50 rounded">
                              <X size={14} />
                            </button>
                          </form>
                        ) : (
                          <button 
                            onClick={() => startEdit(item, year)}
                            className={cn(
                              "font-mono text-xs transition-colors hover:text-[#86BC24]",
                              record ? "text-slate-700" : "text-slate-300 italic"
                            )}
                          >
                            {record ? formatCurrency(record.amount, currencyCode) : "—"}
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => setDeleteConfirm({ id: 'dummy', category: item.name })}
                      className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 shadow-sm"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {netWorthItems.length === 0 && (
                <tr>
                   <td colSpan={years.length + 3} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center gap-3 text-slate-400">
                         <div className="p-4 bg-slate-50 rounded-full">
                            <TrendingUp size={32} />
                         </div>
                         <p className="font-bold uppercase text-[10px] tracking-widest">No net worth items found</p>
                         <p className="text-sm italic">Add assets and liabilities to track your net worth over time.</p>
                      </div>
                   </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
               <tr>
                  <td colSpan={2} className="px-6 py-6 text-slate-900 uppercase tracking-[0.2em] text-xs">
                     Net Worth
                  </td>
                  {years.map(year => (
                    <td key={year} className="px-6 py-6 text-right">
                       <span className={cn(
                         "font-mono text-sm px-4 py-2 rounded-xl border shadow-sm",
                         yearTotals[year] >= 0 ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
                       )}>
                         {formatCurrency(yearTotals[year], currencyCode)}
                       </span>
                    </td>
                  ))}
                  <td></td>
               </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 text-left">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setDeleteConfirm(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl space-y-6"
            >
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
                  <Trash2 size={32} />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Delete Item?</h3>
                  <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                    This will remove <span className="font-bold text-slate-900">"{deleteConfirm.category}"</span> and all its historical values from all years.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => handleDelete(deleteConfirm.category)}
                  disabled={isDeleting}
                  className="w-full py-4 bg-red-600 text-white rounded-xl text-xs font-bold uppercase tracking-[0.2em] shadow-lg shadow-red-500/20 hover:bg-red-700 transition-all flex items-center justify-center gap-2 group"
                >
                  {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  Confirm Permanent Delete
                </button>
                <button 
                  onClick={() => setDeleteConfirm(null)}
                  disabled={isDeleting}
                  className="w-full py-4 text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
                >
                  Cancel Action
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
