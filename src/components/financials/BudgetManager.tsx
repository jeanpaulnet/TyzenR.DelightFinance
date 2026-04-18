import React, { useState, useEffect } from 'react';
import { useApp } from '../../AppContext';
import { db } from '../../lib/firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { logEvent } from '../../lib/audit';
import { Wallet, Plus, Trash2, Edit2, Check, X, Target, Info, Activity, History } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';
import { motion } from 'motion/react';
import HistoryModal from './HistoryModal';

export default function BudgetManager() {
  const { finData, user } = useApp();
  const [newBudget, setNewBudget] = useState({ category: '', amount: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBudget, setEditBudget] = useState({ category: '', amount: 0 });
  const [isAdding, setIsAdding] = useState(false);
  const [historyResourceId, setHistoryResourceId] = useState<string | null>(null);
  const [historyTitle, setHistoryTitle] = useState('');

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

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const budgetDoc = await addDoc(collection(db, 'users', user.uid, 'budgets'), {
        category: newBudget.category,
        amount: newBudget.amount,
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
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
        details: `Created budget for ${newBudget.category} with target ${formatCurrency(newBudget.amount)}`
      });

      setNewBudget({ category: '', amount: 0 });
      setIsAdding(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingId) return;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'budgets', editingId), {
        category: editBudget.category,
        amount: editBudget.amount,
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
        details: `Updated budget for ${editBudget.category} to ${formatCurrency(editBudget.amount)}`
      });

      setEditingId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string, category: string) => {
    if (!user || !window.confirm(`Delete budget category "${category}"?`)) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'budgets', id));
      await logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'DELETE',
        resourceType: 'budget',
        resourceId: id,
        resourceName: category
      });
    } catch (err) {
      console.error(err);
    }
  };

  const startEdit = (b: any) => {
    setEditingId(b.id);
    setEditBudget({ category: b.category, amount: b.amount });
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-[#1E293B] tracking-tight text-indigo-900">Categories</h1>
          <p className="text-[#64748B] text-sm italic">Define categories & monthly budgets</p>
        </div>
        {!isAdding && (
          <button onClick={() => setIsAdding(true)} className="btn-primary flex items-center gap-2 h-10 px-4">
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
          className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-6 shadow-sm max-w-2xl grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Name</label>
            <input 
              value={newBudget.category} onChange={e => setNewBudget({...newBudget, category: e.target.value})}
              placeholder="e.g. Travel" required className="w-full p-2.5 bg-white border border-[#E2E8F0] rounded-lg outline-none focus:border-[#86BC24] transition-colors text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Target Budget</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono italic">$</span>
              <input 
                type="number" value={newBudget.amount} onChange={e => setNewBudget({...newBudget, amount: parseFloat(e.target.value)})}
                placeholder="0.00" required className="w-full pl-8 pr-4 py-2.5 bg-white border border-[#E2E8F0] rounded-lg outline-none focus:border-[#86BC24] transition-colors text-sm font-mono"
              />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="flex-1 btn-primary py-2.5 font-bold uppercase text-[10px] tracking-widest h-[42px]">
              Create
            </button>
            <button type="button" onClick={() => setIsAdding(false)} className="px-3 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 h-[42px]">
              <X size={18} />
            </button>
          </div>
        </motion.form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {finData.budgets.map((b) => (
          <div key={b.id} className="bg-white border border-[#E2E8F0] rounded-lg p-5 shadow-sm group hover:border-[#86BC24] transition-all relative overflow-hidden">
            {editingId === b.id ? (
              <form onSubmit={handleUpdate} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#86BC24] uppercase tracking-widest">Editing Name</label>
                  <input 
                    value={editBudget.category} onChange={e => setEditBudget({...editBudget, category: e.target.value})}
                    className="w-full p-2 bg-slate-50 border border-[#E2E8F0] rounded-md text-sm outline-none focus:border-[#86BC24]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#86BC24] uppercase tracking-widest">Editing Budget</label>
                  <input 
                    type="number" value={editBudget.amount} onChange={e => setEditBudget({...editBudget, amount: parseFloat(e.target.value)})}
                    className="w-full p-2 bg-slate-50 border border-[#E2E8F0] rounded-md text-sm font-mono outline-none focus:border-[#86BC24]"
                  />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 bg-[#86BC24] text-white py-1.5 rounded-md text-xs font-bold uppercase tracking-widest hover:bg-[#75A51F]">Save</button>
                  <button type="button" onClick={() => setEditingId(null)} className="flex-1 bg-slate-100 text-slate-500 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest hover:bg-slate-200">Cancel</button>
                </div>
              </form>
            ) : (
              <>
                <div className="absolute top-0 right-0 p-2 flex gap-1">
                   <button 
                     onClick={() => { setHistoryResourceId(b.id); setHistoryTitle(b.category); }}
                     className="p-1 text-slate-300 hover:text-indigo-600 transition-colors opacity-0 group-hover:opacity-100"
                     title="View History"
                   >
                      <History size={14} />
                   </button>
                   <button onClick={() => startEdit(b)} className="p-1 text-slate-300 hover:text-[#86BC24] transition-colors opacity-0 group-hover:opacity-100">
                      <Edit2 size={14} />
                   </button>
                   <button onClick={() => handleDelete(b.id, b.category)} className="p-1 text-slate-300 hover:text-[#EF4444] transition-colors opacity-0 group-hover:opacity-100">
                      <Trash2 size={14} />
                   </button>
                </div>
                <div className="flex items-center gap-3 mb-4">
                   <div className="w-8 h-8 rounded bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-center text-[#86BC24]">
                      <Target size={18} />
                   </div>
                   <div>
                      <h3 className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest leading-none mb-1">Category Definition</h3>
                      <p className="text-lg font-bold text-[#1E293B] tracking-tight leading-none">{b.category}</p>
                   </div>
                </div>
                
                <div className="bg-slate-50 rounded p-3 mb-4">
                   <div className="flex justify-between items-center text-[10px] font-bold text-[#64748B] uppercase tracking-widest mb-1">
                      <span>Monthly Budget</span>
                      <span className="text-[#86BC24] font-mono">{formatCurrency(b.amount)}</span>
                   </div>
                   <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
                      <div className="w-3/4 h-full bg-[#86BC24]"></div>
                   </div>
                </div>

                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-[#64748B] pt-4 border-t border-slate-50">
                   <div className="flex items-center gap-1.5">
                      <Activity size={12} className="text-[#10B981]" />
                      <span className="text-[#10B981]">Managed Asset</span>
                   </div>
                   <span className="font-mono italic text-[9px] lowercase">approx {formatCurrency(b.amount / 30)}/day</span>
                </div>
              </>
            )}
          </div>
        ))}
        {finData.budgets.length === 0 && !isAdding && (
          <div className="col-span-full py-20 text-center space-y-4">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
              <Wallet size={32} />
            </div>
            <div>
              <p className="text-slate-900 font-bold">No budgets found</p>
              <p className="text-slate-500 text-sm">Create categories to track your spending limits.</p>
            </div>
          </div>
        )}
      </div>
      <HistoryModal 
        isOpen={!!historyResourceId}
        onClose={() => setHistoryResourceId(null)}
        title={historyTitle}
        resourceId={historyResourceId || undefined}
      />
    </div>
  );
}
