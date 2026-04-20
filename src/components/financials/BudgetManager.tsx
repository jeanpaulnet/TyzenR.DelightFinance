import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../AppContext';
import { db } from '../../lib/firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { logEvent } from '../../lib/audit';
import { Wallet, Plus, Trash2, Edit2, Check, X, Target, Info, Activity, ChevronLeft, ChevronRight, Copy, Loader2, TrendingUp, Receipt, Building2, ShieldAlert } from 'lucide-react';
import { formatCurrency, getCurrencySymbol, cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function BudgetManager() {
  const { finData, user, activeBusinessId, businesses } = useApp();
  const activeBusiness = useMemo(() => businesses.find(b => b.id === activeBusinessId), [businesses, activeBusinessId]);
  const currencyCode = activeBusiness?.currency || 'USD';

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [newBudget, setNewBudget] = useState({ category: '', amount: 0, type: 'Expense' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBudget, setEditBudget] = useState({ category: '', amount: 0, type: 'Expense' });
  const [isAdding, setIsAdding] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string | null, category: string, isActive: boolean } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [transactionAction, setTransactionAction] = useState<'delete' | 'reassign'>('reassign');
  const [targetCategory, setTargetCategory] = useState('');

  useEffect(() => {
    if (user) {
      logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'VIEW',
        resourceType: 'budget'
      });
    }
  }, [user]);

  // Derived list of all unique categories ever used across any year
  const allCategories = useMemo(() => {
    const categories = new Set<string>();
    finData.budgets.forEach(b => categories.add(b.category));
    return Array.from(categories).sort((a, b) => a.localeCompare(b));
  }, [finData.budgets]);

  // Map each unique category to its budget in the selected year, 
  // or a fallback to its most recent budget amount
  const categoryStats = useMemo(() => {
    return allCategories.map(catName => {
      const yearBudget = finData.budgets.find(b => 
        b.year === selectedYear && b.category.toLowerCase() === catName.toLowerCase()
      );

      // Find most recent amount for this specific category as a default
      const allForCategory = finData.budgets.filter(b => b.category.toLowerCase() === catName.toLowerCase());
      const mostRecent = allForCategory.reduce((prev, curr) => {
        if (!prev) return curr;
        if (curr.year > prev.year) return curr;
        if (curr.year === prev.year && curr.month > prev.month) return curr;
        return prev;
      }, null as any);

      return {
        name: catName,
        isActive: !!yearBudget,
        data: yearBudget || { 
          category: catName, 
          amount: mostRecent?.amount || 0,
          id: `new-${catName}` 
        },
        fallbackAmount: mostRecent?.amount || 0
      };
    });
  }, [allCategories, finData.budgets, selectedYear]);

  // Find most recent year with ANY data for bulk copy
  const recentYearWithData = useMemo(() => {
    if (finData.budgets.length === 0) return null;
    return Math.max(...finData.budgets.map(b => b.year));
  }, [finData.budgets]);

  const handleCreateForYear = async (category: string, amount: number, type: string = 'Expense') => {
    if (!user || !activeBusinessId) return;
    try {
      const budgetDoc = await addDoc(collection(db, 'users', user.uid, 'budgets'), {
        category,
        amount,
        type,
        month: selectedYear === new Date().getFullYear() ? new Date().getMonth() + 1 : 1,
        year: selectedYear,
        businessId: activeBusinessId,
        userId: user.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      await logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'CREATE',
        resourceType: 'budget',
        resourceId: budgetDoc.id,
        resourceName: category,
        details: `Set ${selectedYear} budget for existing category ${category} at ${formatCurrency(amount, currencyCode)}`
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopyFromRecent = async () => {
    if (!user || !activeBusinessId || !recentYearWithData) return;
    setCopying(true);
    try {
      const recentBudgets = finData.budgets.filter(b => b.year === recentYearWithData);
      const uniqueSource = new Map();
      recentBudgets.forEach(b => {
        const key = b.category.toLowerCase();
        if (!uniqueSource.has(key) || b.month > uniqueSource.get(key).month) {
          uniqueSource.set(key, b);
        }
      });

      const batch: any[] = [];
      uniqueSource.forEach(b => {
        batch.push(addDoc(collection(db, 'users', user.uid, 'budgets'), {
          category: b.category,
          amount: b.amount,
          type: b.type || 'Expense',
          month: 1, // Start of year
          year: selectedYear,
          businessId: activeBusinessId,
          userId: user.uid,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }));
      });
      await Promise.all(batch);
      
      await logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'CREATE',
        resourceType: 'budget',
        details: `Copied budgets from ${recentYearWithData} to ${selectedYear}`
      });
    } catch (err) {
      console.error(err);
    } finally {
      setCopying(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeBusinessId) return;
    
    // Check for duplicate
    const isDuplicate = allCategories.some(c => c.toLowerCase() === newBudget.category.trim().toLowerCase());
    if (isDuplicate) {
      setDuplicateError(`Category "${newBudget.category}" already exists.`);
      return;
    }
    setDuplicateError(null);

    try {
      const budgetDoc = await addDoc(collection(db, 'users', user.uid, 'budgets'), {
        category: newBudget.category,
        amount: newBudget.amount,
        type: newBudget.type,
        month: selectedYear === new Date().getFullYear() ? new Date().getMonth() + 1 : 1,
        year: selectedYear,
        businessId: activeBusinessId,
        userId: user.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      await logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'CREATE',
        resourceType: 'budget',
        resourceId: budgetDoc.id,
        resourceName: newBudget.category,
        details: `Created ${newBudget.type} budget for ${newBudget.category} with target ${formatCurrency(newBudget.amount, currencyCode)}`
      });

      setNewBudget({ category: '', amount: 0, type: 'Expense' });
      setIsAdding(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingId) return;

    // Check for duplicate (if name changed)
    const originalBudget = finData.budgets.find(b => b.id === editingId);
    if (originalBudget && originalBudget.category.toLowerCase() !== editBudget.category.toLowerCase()) {
      const isDuplicate = allCategories.some(c => c.toLowerCase() === editBudget.category.trim().toLowerCase());
      if (isDuplicate) {
        setDuplicateError(`Category "${editBudget.category}" already exists.`);
        return;
      }
    }
    setDuplicateError(null);

    try {
      await updateDoc(doc(db, 'users', user.uid, 'budgets', editingId), {
        category: editBudget.category,
        amount: editBudget.amount,
        type: editBudget.type,
        updatedAt: new Date().toISOString()
      });

      await logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'UPDATE',
        resourceType: 'budget',
        resourceId: editingId,
        resourceName: editBudget.category,
        details: `Updated budget for ${editBudget.category} to ${formatCurrency(editBudget.amount, currencyCode)}`
      });

      setEditingId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (deleteType: 'year' | 'all') => {
    if (!user || !deleteConfirm) return;
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);

      if (deleteType === 'year' && deleteConfirm.id) {
        batch.delete(doc(db, 'users', user.uid, 'budgets', deleteConfirm.id));
      } else if (deleteType === 'all') {
        // Delete all budgets for this category
        const relatedBudgets = finData.budgets.filter(b => 
          b.category.toLowerCase() === deleteConfirm.category.toLowerCase()
        );
        relatedBudgets.forEach(b => {
          batch.delete(doc(db, 'users', user.uid, 'budgets', b.id));
        });

        // Handle associated transactions if requested
        if (transactionAction === 'delete') {
          const relatedExpenses = finData.expenses.filter(e => 
            e.category.toLowerCase() === deleteConfirm.category.toLowerCase()
          );
          relatedExpenses.forEach(e => {
            batch.delete(doc(db, 'users', user.uid, 'expenses', e.id));
          });
        } else if (transactionAction === 'reassign' && targetCategory) {
          const relatedExpenses = finData.expenses.filter(e => 
            e.category.toLowerCase() === deleteConfirm.category.toLowerCase()
          );
          relatedExpenses.forEach(e => {
            batch.update(doc(db, 'users', user.uid, 'expenses', e.id), {
              category: targetCategory,
              updatedAt: new Date().toISOString()
            });
          });
        }
      }

      await batch.commit();

      await logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'DELETE',
        resourceType: 'budget',
        resourceId: deleteConfirm.id || 'bulk',
        resourceName: deleteConfirm.category,
        details: deleteType === 'all' 
          ? `Purged category ${deleteConfirm.category} from all years. Transactions: ${transactionAction}` 
          : `Deleted ${deleteConfirm.category} budget for ${selectedYear}`
      });
      
      setDeleteConfirm(null);
      setTransactionAction('reassign');
      setTargetCategory('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  const startEdit = (b: any) => {
    setEditingId(b.id);
    setEditBudget({
      category: b.category,
      amount: b.amount,
      type: b.type || 'Expense'
    });
    setDuplicateError(null);
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-[#1E293B] tracking-tight">Categories</h1>
          <p className="text-[#64748B] text-sm italic">Define categories & monthly budgets</p>
        </div>
        
        <div className="flex items-center gap-4 bg-white border border-slate-200 p-1.5 rounded-xl shadow-sm">
          <div className="flex items-center">
            <button 
              onClick={() => setSelectedYear(y => y - 1)}
              className="p-2 text-slate-400 hover:text-[#86BC24] hover:bg-slate-50 rounded-lg transition-all"
            >
              <ChevronLeft size={20} />
            </button>
            <input 
              type="number"
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value) || new Date().getFullYear())}
              className="w-20 py-1 text-base font-bold text-slate-700 text-center bg-slate-50 rounded-lg mx-1 border border-slate-100 outline-none focus:border-[#86BC24] transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button 
              onClick={() => setSelectedYear(y => y + 1)}
              className="p-2 text-slate-400 hover:text-[#86BC24] hover:bg-slate-50 rounded-lg transition-all"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {!isAdding && (
          <button 
            onClick={() => {
              setIsAdding(true);
              setDuplicateError(null);
            }} 
            className="btn-primary flex items-center gap-2 h-10 px-4"
          >
            <Plus size={18} />
            Add Category
          </button>
        )}
      </div>

      {isAdding && (
        <motion.form 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleAdd} 
          className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-6 shadow-sm max-w-4xl grid grid-cols-1 md:grid-cols-4 gap-6"
        >
          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Name</label>
            <input 
              value={newBudget.category} onChange={e => {
                setNewBudget({...newBudget, category: e.target.value});
                setDuplicateError(null);
              }}
              placeholder="e.g. Travel" required className="w-full p-2.5 bg-white border border-[#E2E8F0] rounded-lg outline-none focus:border-[#86BC24] transition-all text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Type</label>
            <select 
              value={newBudget.type} 
              onChange={e => setNewBudget({...newBudget, type: e.target.value})}
              className="w-full p-2.5 bg-white border border-[#E2E8F0] rounded-lg outline-none focus:border-[#86BC24] transition-all text-sm font-bold"
              style={{ 
                color: 
                  newBudget.type === 'Income' ? '#16A34A' : 
                  newBudget.type === 'Asset' ? '#2563EB' : 
                  newBudget.type === 'Liability' ? '#D97706' : '#DC2626' 
              }}
            >
              <option value="Income" style={{ color: '#16A34A' }}>Income</option>
              <option value="Expense" style={{ color: '#DC2626' }}>Expense</option>
              <option value="Asset" style={{ color: '#2563EB' }}>Asset</option>
              <option value="Liability" style={{ color: '#D97706' }}>Liability</option>
            </select>
          </div>
          {newBudget.type === 'Expense' && (
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Target Budget</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono italic">
                  {getCurrencySymbol(currencyCode)}
                </span>
                <input 
                  type="number" value={newBudget.amount} onChange={e => setNewBudget({...newBudget, amount: parseFloat(e.target.value)})}
                  placeholder="0.00" required className="w-full pl-12 pr-4 py-2.5 bg-white border border-[#E2E8F0] rounded-lg outline-none focus:border-[#86BC24] transition-all text-sm font-mono"
                />
              </div>
            </div>
          )}
          <div className="flex items-end gap-2">
            <button type="submit" className="flex-1 btn-primary py-2.5 font-bold uppercase text-[10px] tracking-widest h-[42px]">
              Create
            </button>
            <button type="button" onClick={() => setIsAdding(false)} className="px-3 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 h-[42px]">
              <X size={18} />
            </button>
          </div>
          {duplicateError && (
            <motion.p 
              initial={{ opacity: 0, y: -5 }} 
              animate={{ opacity: 1, y: 0 }} 
              className="mt-2 text-[10px] font-bold text-red-500 uppercase tracking-widest ml-1"
            >
              {duplicateError}
            </motion.p>
          )}
        </motion.form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {categoryStats.map((stat) => (
          <div key={stat.data.id} className={cn(
            "bg-white border rounded-lg p-5 shadow-sm group transition-all relative overflow-hidden flex flex-col justify-between min-h-[180px]",
            stat.isActive ? "border-[#E2E8F0] hover:border-[#86BC24]" : "border-dashed border-slate-200 opacity-60 grayscale hover:grayscale-0 hover:opacity-100 bg-slate-50/50"
          )}>
            {editingId === stat.data.id ? (
              <form onSubmit={handleUpdate} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#86BC24] uppercase tracking-widest">Editing Name</label>
                  <input 
                    value={editBudget.category} onChange={e => {
                      setEditBudget({...editBudget, category: e.target.value});
                      setDuplicateError(null);
                    }}
                    className="w-full p-2 bg-slate-50 border border-[#E2E8F0] rounded-md text-sm outline-none focus:border-[#86BC24]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#86BC24] uppercase tracking-widest">Type</label>
                    <select 
                      value={editBudget.type} 
                      onChange={e => setEditBudget({...editBudget, type: e.target.value})}
                      className="w-full p-2 bg-slate-50 border border-[#E2E8F0] rounded-md text-sm outline-none focus:border-[#86BC24] font-bold"
                      style={{ 
                        color: 
                          editBudget.type === 'Income' ? '#16A34A' : 
                          editBudget.type === 'Asset' ? '#2563EB' : 
                          editBudget.type === 'Liability' ? '#D97706' : '#DC2626' 
                      }}
                    >
                      <option value="Income" style={{ color: '#16A34A' }}>Income</option>
                      <option value="Expense" style={{ color: '#DC2626' }}>Expense</option>
                      <option value="Asset" style={{ color: '#2563EB' }}>Asset</option>
                      <option value="Liability" style={{ color: '#D97706' }}>Liability</option>
                    </select>
                  </div>
                  {editBudget.type === 'Expense' && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-[#86BC24] uppercase tracking-widest">Amount</label>
                      <input 
                        type="number" value={editBudget.amount} onChange={e => setEditBudget({...editBudget, amount: parseFloat(e.target.value)})}
                        className="w-full p-2 bg-slate-50 border border-[#E2E8F0] rounded-md text-sm font-mono outline-none focus:border-[#86BC24]"
                      />
                    </div>
                  )}
                </div>
                {duplicateError && (
                  <motion.p 
                    initial={{ opacity: 0, x: -10 }} 
                    animate={{ opacity: 1, x: 0 }} 
                    className="text-[10px] font-bold text-red-500 uppercase tracking-wider"
                  >
                    {duplicateError}
                  </motion.p>
                )}
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 bg-[#86BC24] text-white py-1.5 rounded-md text-xs font-bold uppercase tracking-widest hover:bg-[#75A51F]">Save</button>
                  <button type="button" onClick={() => setEditingId(null)} className="flex-1 bg-slate-100 text-slate-500 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest hover:bg-slate-200">Cancel</button>
                </div>
              </form>
            ) : (
              <>
                <div className="absolute top-0 right-0 p-2 flex gap-1 transition-opacity">
                    {stat.isActive ? (
                      <>
                        <button 
                          onClick={() => startEdit(stat.data)} 
                          className="p-1 text-slate-300 hover:text-[#86BC24] hover:bg-green-50 rounded transition-all"
                          title="Edit Category"
                        >
                            <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={() => setDeleteConfirm({ id: stat.data.id, category: stat.name, isActive: true })} 
                          className="p-1 text-slate-300 hover:text-[#EF4444] hover:bg-red-50 rounded transition-all"
                          title="Delete Category"
                        >
                            <Trash2 size={14} />
                        </button>
                      </>
                    ) : (
                      <div className="flex gap-2 items-center">
                        <button 
                          onClick={() => setDeleteConfirm({ id: null, category: stat.name, isActive: false })}
                          className="p-1 text-slate-300 hover:text-[#EF4444] hover:bg-red-50 rounded transition-all"
                          title="Purge Category"
                        >
                          <Trash2 size={12} />
                        </button>
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter px-2 py-0.5 bg-slate-100 rounded">Not Set for {selectedYear}</div>
                      </div>
                    )}
                </div>
                <div className="flex items-center gap-3 mb-4">
                   <div className={cn(
                     "w-8 h-8 rounded bg-[#F8FAFC] border flex items-center justify-center transition-colors",
                     stat.isActive ? (
                       stat.data.type === 'Income' ? "text-green-600 border-green-100 bg-green-50/50" :
                       stat.data.type === 'Asset' ? "text-blue-600 border-blue-100 bg-blue-50/50" :
                       stat.data.type === 'Liability' ? "text-amber-600 border-orange-100 bg-orange-50/50" :
                       "text-[#86BC24] border-[#E2E8F0] bg-slate-50/50"
                     ) : "text-slate-300 border-slate-200"
                   )}>
                      {(() => {
                        if (!stat.isActive) return <Target size={18} />;
                        switch(stat.data.type) {
                          case 'Income': return <TrendingUp size={18} />;
                          case 'Asset': return <Building2 size={18} />;
                          case 'Liability': return <ShieldAlert size={18} />;
                          default: return <Receipt size={18} />;
                        }
                      })()}
                   </div>
                   <div className="flex-1">
                      <p className="text-lg font-bold text-[#1E293B] tracking-tight leading-none">{stat.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn(
                          "text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border leading-none bg-transparent",
                          stat.isActive ? (
                            stat.data.type === 'Income' ? "text-green-600 border-green-200" :
                            stat.data.type === 'Asset' ? "text-blue-600 border-blue-200" :
                            stat.data.type === 'Liability' ? "text-amber-600 border-orange-200" :
                            "text-red-600 border-red-200"
                          ) : "text-slate-300 border-slate-100"
                        )}>
                          {stat.isActive ? (stat.data.type || 'Expense') : 'General'}
                        </span>
                      </div>
                   </div>
                </div>
                
                {stat.isActive && stat.data.type === 'Expense' ? (
                  <div className="bg-slate-50/80 rounded p-3 mb-4">
                     <div className="flex justify-between items-center text-[10px] font-bold text-[#64748B] uppercase tracking-widest mb-1">
                        <span>Monthly Budget</span>
                        <span className="text-[#86BC24] font-mono">{formatCurrency(stat.data.amount, currencyCode)}</span>
                     </div>
                     <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
                        <div className="w-3/4 h-full bg-[#86BC24]"></div>
                     </div>
                  </div>
                ) : (stat.isActive && stat.data.type === 'Income') ? (
                  <div className="flex-1 flex flex-col justify-center mb-4 italic text-[11px] text-slate-400">
                    No target amount for Income
                  </div>
                ) : stat.isActive ? (
                  <div className="flex-1 mb-4" />
                ) : (
                  <div className="flex-1 flex flex-col justify-end">
                    <button 
                      onClick={() => handleCreateForYear(stat.name, stat.fallbackAmount, stat.data.type || 'Expense')}
                      className="w-full py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:border-[#86BC24] hover:text-[#86BC24] transition-all flex items-center justify-center gap-2 group/btn"
                    >
                      <Plus size={12} className="group-hover/btn:scale-125 transition-transform" />
                      Set as {stat.data.type || 'Expense'} {stat.fallbackAmount > 0 ? `(${formatCurrency(stat.fallbackAmount, currencyCode)})` : ""}
                    </button>
                  </div>
                )}

                {stat.isActive && (
                  <div className="flex items-center justify-end text-[10px] font-bold uppercase tracking-widest text-[#64748B] pt-4 border-t border-slate-50">
                    <span className="font-mono italic text-[9px] lowercase">approx {formatCurrency(stat.data.amount / 30, currencyCode)}/day</span>
                  </div>
                )}
              </>
            )}
          </div>
        ))}

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
                className="relative bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-6"
              >
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Trash2 size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 leading-tight">Delete Category?</h3>
                  <p className="text-sm text-slate-500">How should we handle "{deleteConfirm.category}" and its data?</p>
                </div>

                <div className="space-y-4">
                  {deleteConfirm.isActive && (
                    <button 
                      onClick={() => {
                        setTransactionAction('reassign');
                        handleDelete('year');
                      }}
                      disabled={isDeleting}
                      className="w-full py-3 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold uppercase tracking-widest hover:border-[#86BC24] transition-all flex items-center justify-center gap-3 group"
                    >
                      <span>Remove budget for {selectedYear} only</span>
                      <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                  )}

                  <div className="bg-slate-50 rounded-xl p-4 space-y-4">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Transactions Strategy</p>
                    
                    <div className="space-y-2">
                      <label className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg cursor-pointer hover:border-slate-300 transition-colors">
                        <input 
                          type="radio" 
                          name="txAction" 
                          checked={transactionAction === 'delete'} 
                          onChange={() => setTransactionAction('delete')}
                          className="w-4 h-4 text-red-600 focus:ring-red-600"
                        />
                        <div className="text-xs">
                          <p className="font-bold text-red-600">Delete Associated Transactions</p>
                          <p className="text-slate-500 text-[10px]">All expenses in this category will be PERMANENTLY deleted</p>
                        </div>
                      </label>

                      <label className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg cursor-pointer hover:border-slate-300 transition-colors">
                        <input 
                          type="radio" 
                          name="txAction" 
                          checked={transactionAction === 'reassign'} 
                          onChange={() => setTransactionAction('reassign')}
                          className="w-4 h-4 text-blue-600 focus:ring-blue-600"
                        />
                        <div className="text-xs flex-1">
                          <p className="font-bold text-blue-600">Reassign to another category</p>
                          {transactionAction === 'reassign' && (
                            <select 
                              value={targetCategory}
                              onChange={(e) => setTargetCategory(e.target.value)}
                              className="mt-2 w-full p-2 bg-slate-50 border border-slate-200 rounded text-[10px] outline-none"
                            >
                              <option value="">Select Target...</option>
                              {allCategories.filter(c => c !== deleteConfirm.category).map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </label>
                    </div>

                    <button 
                      onClick={() => handleDelete('all')}
                      disabled={isDeleting || (transactionAction === 'reassign' && !targetCategory)}
                      className="w-full py-4 bg-red-600 text-white rounded-xl text-xs font-bold uppercase tracking-[0.2em] shadow-lg shadow-red-500/20 hover:bg-red-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale"
                    >
                      {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      Confirm Global Purge
                    </button>
                  </div>

                  <button 
                    onClick={() => {
                      setDeleteConfirm(null);
                      setTransactionAction('reassign');
                      setTargetCategory('');
                    }}
                    disabled={isDeleting}
                    className="w-full py-2 text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] hover:text-slate-600"
                  >
                    Cancel Action
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        {categoryStats.length === 0 && !isAdding && (
          <div className="col-span-full py-20 text-center space-y-6">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
              <Wallet size={32} />
            </div>
            <div>
              <p className="text-slate-900 font-bold">No categories for {selectedYear}</p>
              <p className="text-slate-500 text-sm">Create budgets for this year or copy from a previous period.</p>
            </div>
            {recentYearWithData && recentYearWithData !== selectedYear && (
              <button 
                onClick={handleCopyFromRecent}
                disabled={copying}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-white border border-[#86BC24] text-[#86BC24] rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-[#86BC24] hover:text-white transition-all shadow-sm disabled:opacity-50"
              >
                {copying ? <Activity size={16} className="animate-spin" /> : <Copy size={16} />}
                Copy from {recentYearWithData}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
