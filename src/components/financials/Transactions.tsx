import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../AppContext';
import { decryptPayload, encryptPayload } from '../../lib/encryption';
import { formatCurrency, cn } from '../../lib/utils';
import { db } from '../../lib/firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { logEvent } from '../../lib/audit';
import { 
  Calendar as CalendarIcon, 
  Search, 
  Filter, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X,
  ArrowUpDown,
  Download,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  History,
  ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ExpenseUpload from './ExpenseUpload';
import HistoryModal from './HistoryModal';

export default function Transactions() {
  const { finData, encryptionKey, user } = useApp();
  
  // Date range state - default to current month
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  
  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<'date' | 'amount' | 'category' | 'description'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // CRUD state
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyResourceId, setHistoryResourceId] = useState<string | null>(null);
  const [historyTitle, setHistoryTitle] = useState('');
  
  useEffect(() => {
    if (user) {
      logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'VIEW',
        resourceType: 'expense'
      });
    }
  }, [user]);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    category: '',
    description: '',
    notes: '',
    audited: false
  });

  const decryptedExpenses = useMemo(() => {
    if (!encryptionKey) return [];
    return finData.expenses.map(e => ({
      ...e,
      ...decryptPayload(e.encryptedData, encryptionKey)
    }));
  }, [finData.expenses, encryptionKey]);

  const filteredExpenses = useMemo(() => {
    const filtered = decryptedExpenses.filter(e => {
      const expDate = e.date.split('T')[0];
      const matchesDate = expDate >= startDate && expDate <= endDate;
      const matchesSearch = e.description?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           e.category?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesDate && matchesSearch;
    });

    return filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'date':
          comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
          break;
        case 'amount':
          comparison = a.amount - b.amount;
          break;
        case 'category':
          comparison = a.category.localeCompare(b.category);
          break;
        case 'description':
          comparison = a.description.localeCompare(b.description);
          break;
        default:
          comparison = 0;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [decryptedExpenses, startDate, endDate, searchTerm, sortField, sortDirection]);

  const toggleSort = (field: 'date' | 'amount' | 'category' | 'description') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !encryptionKey) return;
    
    try {
      const payload = {
        description: formData.description,
        notes: formData.notes,
        metadata: { manualEntry: true }
      };
      
      const encryptedData = encryptPayload(payload, encryptionKey);
      
      const newDoc = await addDoc(collection(db, 'users', user.uid, 'expenses'), {
        amount: parseFloat(formData.amount),
        category: formData.category.toLowerCase().trim(),
        date: new Date(formData.date).toISOString(),
        accountId: 'default',
        encryptedData,
        userId: user.uid,
        audited: formData.audited,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      await logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'CREATE',
        resourceType: 'expense',
        resourceId: newDoc.id,
        resourceName: formData.description,
        details: `Created transaction for ${formatCurrency(parseFloat(formData.amount))} in ${formData.category}${formData.audited ? ' (PRE-AUDITED)' : ''}`
      });
      
      setIsAdding(false);
      resetForm();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !encryptionKey || !editingId) return;
    
    try {
      const payload = {
        description: formData.description,
        notes: formData.notes,
        metadata: { updated: true }
      };
      
      const encryptedData = encryptPayload(payload, encryptionKey);
      
      await updateDoc(doc(db, 'users', user.uid, 'expenses', editingId), {
        amount: parseFloat(formData.amount),
        category: formData.category.toLowerCase().trim(),
        date: new Date(formData.date).toISOString(),
        encryptedData,
        audited: formData.audited,
        updatedAt: new Date().toISOString()
      });

      await logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'UPDATE',
        resourceType: 'expense',
        resourceId: editingId,
        resourceName: formData.description,
        details: `Updated entry. Status: ${formData.audited ? 'AUDITED' : 'PENDING'}. Amount: ${formatCurrency(parseFloat(formData.amount))}`
      });
      
      setEditingId(null);
      resetForm();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string, description: string) => {
    if (!user || !window.confirm(`Are you sure you want to delete "${description}"?`)) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'expenses', id));
      await logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'DELETE',
        resourceType: 'expense',
        resourceId: id,
        resourceName: description
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleAudited = async (exp: any) => {
    if (!user) return;
    const newStatus = !exp.audited;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'expenses', exp.id), {
        audited: newStatus,
        updatedAt: new Date().toISOString()
      });

      await logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'UPDATE',
        resourceType: 'expense',
        resourceId: exp.id,
        resourceName: exp.description,
        details: `Toggled audit status to ${newStatus ? 'AUDITED' : 'UNAUDITED'}`
      });
    } catch (err) {
      console.error(err);
    }
  };

  const startEdit = (exp: any) => {
    setEditingId(exp.id);
    setFormData({
      date: exp.date.split('T')[0],
      amount: exp.amount.toString(),
      category: exp.category,
      description: exp.description,
      notes: exp.notes || '',
      audited: !!exp.audited
    });
  };

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      amount: '',
      category: '',
      description: '',
      notes: '',
      audited: false
    });
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Transactions</h1>
          <p className="text-slate-500 text-sm italic">Manage and audit your encrypted financial ledger.</p>
        </div>
        <div className="flex items-center gap-3">
          <ExpenseUpload />
          <button 
            onClick={() => setIsAdding(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={18} />
            Add Transaction
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="space-y-1 md:col-span-2">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text"
              placeholder="Filter by description or category..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#86BC24] transition-colors"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">From</label>
          <input 
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#86BC24] transition-colors"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">To</label>
          <input 
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#86BC24] transition-colors"
          />
        </div>
      </div>

      <AnimatePresence>
        {(isAdding || editingId) && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-md"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                {editingId ? 'Edit Transaction' : 'New Transaction'}
              </h2>
              <button 
                onClick={() => { setIsAdding(false); setEditingId(null); resetForm(); }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={editingId ? handleUpdate : handleCreate} className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Date</label>
                <input 
                  type="date" required value={formData.date}
                  onChange={e => setFormData({...formData, date: e.target.value})}
                  className="w-full p-2.5 bg-slate-50 border border-[#E2E8F0] rounded-lg outline-none focus:border-[#86BC24] transition-colors text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Amount</label>
                <input 
                  type="number" step="0.01" required value={formData.amount}
                  onChange={e => setFormData({...formData, amount: e.target.value})}
                  placeholder="0.00"
                  className="w-full p-2.5 bg-slate-50 border border-[#E2E8F0] rounded-lg outline-none focus:border-[#86BC24] transition-colors text-sm font-mono"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Category</label>
                <select 
                  required value={formData.category}
                  onChange={e => setFormData({...formData, category: e.target.value})}
                  className="w-full p-2.5 bg-slate-50 border border-[#E2E8F0] rounded-lg outline-none focus:border-[#86BC24] transition-colors text-sm"
                >
                  <option value="">Select Category</option>
                  {finData.budgets.map(b => (
                    <option key={b.id} value={b.category}>{b.category}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Description</label>
                <input 
                   required value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  placeholder="e.g. Amazon Office Supplies"
                  className="w-full p-2.5 bg-slate-50 border border-[#E2E8F0] rounded-lg outline-none focus:border-[#86BC24] transition-colors text-sm"
                />
              </div>
              <div className="md:col-span-3 space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Notes (Optional)</label>
                <input 
                  value={formData.notes}
                  onChange={e => setFormData({...formData, notes: e.target.value})}
                  placeholder="Add context or tags..."
                  className="w-full p-2.5 bg-slate-50 border border-[#E2E8F0] rounded-lg outline-none focus:border-[#86BC24] transition-colors text-sm"
                />
              </div>
                <div className="flex items-center gap-2 pt-6">
                  <input 
                    type="checkbox"
                    id="audited"
                    checked={formData.audited}
                    onChange={e => setFormData({...formData, audited: e.target.checked})}
                    className="w-4 h-4 text-[#86BC24] border-slate-300 rounded focus:ring-[#86BC24]"
                  />
                  <label htmlFor="audited" className="text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer">
                     Audited
                  </label>
                </div>
                <div className="flex items-end">
                  <button type="submit" className="w-full btn-primary py-2.5 font-bold uppercase text-[10px] tracking-widest h-[42px]">
                    {editingId ? 'Update Ledger' : 'Commit Entry'}
                  </button>
                </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200">
                <th 
                  className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer hover:text-[#86BC24] transition-colors"
                  onClick={() => toggleSort('date')}
                >
                  <div className="flex items-center gap-1">
                    Date
                    <ArrowUpDown size={12} className={cn(sortField === 'date' ? "text-[#86BC24]" : "text-slate-300")} />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer hover:text-[#86BC24] transition-colors"
                  onClick={() => toggleSort('description')}
                >
                  <div className="flex items-center gap-1">
                    Description
                    <ArrowUpDown size={12} className={cn(sortField === 'description' ? "text-[#86BC24]" : "text-slate-300")} />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer hover:text-[#86BC24] transition-colors"
                  onClick={() => toggleSort('category')}
                >
                  <div className="flex items-center gap-1">
                    Category
                    <ArrowUpDown size={12} className={cn(sortField === 'category' ? "text-[#86BC24]" : "text-slate-300")} />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer hover:text-[#86BC24] transition-colors"
                  onClick={() => toggleSort('amount')}
                >
                  <div className="flex items-center gap-1">
                    Amount
                    <ArrowUpDown size={12} className={cn(sortField === 'amount' ? "text-[#86BC24]" : "text-slate-300")} />
                  </div>
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpenses.map((exp) => (
                <tr key={exp.id} className="group hover:bg-slate-50/80 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-xs font-mono text-slate-500">
                      {new Date(exp.date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-bold text-slate-900 leading-tight">{exp.description}</p>
                      {exp.notes && <p className="text-[10px] text-slate-400 mt-0.5">{exp.notes}</p>}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                      {exp.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-bold text-slate-900">
                      {formatCurrency(exp.amount)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button 
                      onClick={() => handleToggleAudited(exp)}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1 rounded text-[10px] font-bold uppercase transition-all border",
                        exp.audited 
                          ? "bg-green-50 text-green-700 border-green-100" 
                          : "bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-200"
                      )}
                    >
                      {exp.audited ? (
                        <>
                          <ShieldCheck size={12} className="text-[#86BC24]" />
                          Audited
                        </>
                      ) : (
                        <>
                          <div className="w-3 h-3 rounded-full border border-slate-300" />
                          Pending
                        </>
                      )}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => { setHistoryResourceId(exp.id); setHistoryTitle(exp.description); }}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        title="View History"
                      >
                        <History size={14} />
                      </button>
                      <button 
                        onClick={() => startEdit(exp)}
                        className="p-1.5 text-slate-400 hover:text-[#86BC24] hover:bg-green-50 rounded transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        onClick={() => handleDelete(exp.id, exp.description)}
                        className="p-1.5 text-slate-400 hover:text-[#EF4444] hover:bg-red-50 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredExpenses.length === 0 && (
          <div className="py-20 text-center space-y-4">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-300">
              <CalendarIcon size={32} />
            </div>
            <div className="max-w-xs mx-auto">
              <p className="text-slate-900 font-bold">No transactions found</p>
              <p className="text-slate-500 text-xs">Adjust your date filters or add a new entry to your ledger.</p>
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
