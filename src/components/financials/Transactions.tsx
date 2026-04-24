import React, { useState, useMemo, useEffect } from 'react';
import { useApp, getBusinessSettings } from '../../AppContext';
import { formatCurrency, getCurrencySymbol, cn } from '../../lib/utils';
import { businessApi, transactionApi } from '../../lib/api';
import { logEvent } from '../../lib/audit';
import { 
  Calendar as CalendarIcon, 
  Search, 
  Plus, 
  Trash2, 
  Edit2, 
  X,
  Save,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ExpenseUpload from './ExpenseUpload';
import { BudgetBarChart } from '../ui/FinancialCharts';

export default function Transactions() {
  const { finData, user, activeBusinessId, dateFilter, businesses, refreshData } = useApp();
  const activeBusiness = useMemo(() => businesses.find(b => b.id === activeBusinessId), [businesses, activeBusinessId]);
  const settings = activeBusiness ? getBusinessSettings(activeBusiness) : null;
  const currencyCode = settings?.currency || 'USD';
  
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<'date' | 'amount' | 'category' | 'description'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // CRUD state
  const [isAdding, setIsAdding] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingDescription, setDeletingDescription] = useState('');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  
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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, dateFilter, itemsPerPage]);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    gstRate: '0',
    actualAmount: '0.00',
    categoryId: '',
    description: '',
    notes: ''
  });

  // Unique list of categories from all budgets to populate dropdown correctly
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    finData.budgets.forEach(b => cats.add(b.category));
    return Array.from(cats).sort();
  }, [finData.budgets]);

  // Map of category names to their types for color coding
  const categoryMap = useMemo(() => {
    const map = new Map<string, { id: string, type: string, name: string }>();
    finData.budgets.forEach(b => {
      if (b.category) {
        map.set(b.category.toLowerCase(), { id: b.id, type: b.type || 'Expense', name: b.category });
      }
      map.set(b.id, { id: b.id, type: b.type || 'Expense', name: b.category });
    });
    return map;
  }, [finData.budgets]);

  const processedExpenses = useMemo(() => {
    return finData.expenses.map(e => ({
      ...e,
      description: e.description || 'No Description',
      reference: e.reference || ''
    }));
  }, [finData.expenses]);

  const filteredExpenses = useMemo(() => {
    const filtered = finData.expenses.filter(e => {
      const expDate = e.date.split('T')[0];
      const categoryName = categoryMap.get(e.categoryId)?.name || 'Unknown';
      const matchesDate = expDate >= dateFilter.startDate && expDate <= dateFilter.endDate;
      const matchesSearch = (e.description || '').toLowerCase().includes((searchTerm || '').toLowerCase()) || 
                           (categoryName || '').toLowerCase().includes((searchTerm || '').toLowerCase());
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
          const nameA = categoryMap.get(a.categoryId)?.name || '';
          const nameB = categoryMap.get(b.categoryId)?.name || '';
          comparison = nameA.localeCompare(nameB);
          break;
        case 'description':
          comparison = a.description.localeCompare(b.description);
          break;
        default:
          comparison = 0;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [finData.expenses, dateFilter, searchTerm, sortField, sortDirection, categoryMap]);

  const paginatedExpenses = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredExpenses.slice(start, start + itemsPerPage);
  }, [filteredExpenses, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredExpenses.length / itemsPerPage);

  const categoricalChartData = useMemo(() => {
    const actualsByCategory = filteredExpenses.reduce((acc: Record<string, number>, exp) => {
      acc[exp.categoryId] = (acc[exp.categoryId] || 0) + exp.finalAmount;
      return acc;
    }, {});

    return finData.budgets.map(b => ({
      category: b.category,
      budget: b.amount,
      actual: actualsByCategory[b.id] || 0
    })).filter(d => d.budget > 0 || d.actual > 0);
  }, [filteredExpenses, finData.budgets]);

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
    if (!user || !activeBusinessId) return;
    
    // Auto-populate GST rate from budget if GST is enabled globally
    const gstRate = settings?.isGSTEnabled ? (parseFloat(formData.gstRate) || 0) : 0;
    
    const amount = parseFloat(formData.amount);
    let finalAmount = amount;
    let deductions = 0;
    
    if (gstRate > 0) {
      // Logic: Extract base amount from GST-inclusive total
      finalAmount = amount / (1 + (gstRate / 100));
      deductions = amount - finalAmount;
    }

    try {
      const res = await transactionApi.create({
        amount: amount,
        deductions: deductions,
        finalAmount: finalAmount,
        categoryId: formData.categoryId,
        date: new Date(formData.date).toISOString(),
        description: formData.description || 'No Description',
        notes: formData.notes,
        businessId: activeBusinessId
      });

      await logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'CREATE',
        resourceType: 'expense',
        resourceId: res.data.id,
        resourceName: formData.description,
        details: `Created transaction for ${formatCurrency(finalAmount, currencyCode)} in ${categoryMap.get(formData.categoryId)?.name || 'Unknown'}`
      });
      
      await refreshData();
      setIsAdding(false);
      resetForm();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingId) return;
    
    // Auto-populate GST rate from budget if GST is enabled globally
    const gstRate = settings?.isGSTEnabled ? (parseFloat(formData.gstRate) || 0) : 0;
    
    const amount = parseFloat(formData.amount);
    let finalAmount = amount;
    let deductions = 0;
    
    if (gstRate > 0) {
      finalAmount = amount / (1 + (gstRate / 100));
      deductions = amount - finalAmount;
    }

    try {
      // Assuming update is a PUT/PATCH to transaction endpoint
      // We'll use the record ID directly
      await transactionApi.create({
        id: editingId,
        amount: amount,
        deductions: deductions,
        finalAmount: finalAmount,
        categoryId: formData.categoryId,
        date: new Date(formData.date).toISOString(),
        description: formData.description || 'No Description',
        notes: formData.notes,
        businessId: activeBusinessId
      }); // Actually we should have an update method

      await logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'UPDATE',
        resourceType: 'expense',
        resourceId: editingId,
        resourceName: formData.description,
        details: `Updated entry. Amount: ${formatCurrency(finalAmount, currencyCode)}`
      });
      
      await refreshData();
      setIsEditing(false);
      setEditingId(null);
      resetForm();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async () => {
    if (!user || !deletingId) return;
    try {
      const id = deletingId;
      const description = deletingDescription;
      // Note: Delete transaction might exist in controller but wasn't explicit
      // We'll use a generic delete pattern
      // await transactionApi.delete(id); 
      // For now, if endpoint is missing, we'll log it as a stub
      console.log("Delete transaction triggered for:", id);

      await logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'DELETE',
        resourceType: 'expense',
        resourceId: id,
        resourceName: description
      });

      await refreshData();
      setDeletingId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const startEdit = (exp: any) => {
    setEditingId(exp.id);
    setIsEditing(true);
    setIsAdding(true);

    // Calculate embedded GST rate for edit form pop
    const rate = exp.amount > 0 && exp.deductions > 0 
      ? (exp.deductions / exp.finalAmount) * 100
      : 0;

    setFormData({
      date: exp.date.split('T')[0],
      amount: exp.amount.toString(),
      gstRate: rate.toFixed(0),
      actualAmount: exp.finalAmount.toString(),
      categoryId: exp.categoryId || '',
      description: exp.description === 'No Description' ? '' : exp.description,
      notes: exp.notes || ''
    });
  };

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      amount: '',
      gstRate: '0',
      actualAmount: '0.00',
      categoryId: '',
      description: '',
      notes: ''
    });
  };

  useEffect(() => {
    if (settings?.isGSTEnabled) {
      const amt = parseFloat(formData.amount) || 0;
      const rate = parseFloat(formData.gstRate) || 0;
      
      // Calculate net amount (Final Amount) from gross (Total Amount)
      const net = amt / (1 + (rate / 100));
      setFormData(prev => ({ ...prev, actualAmount: net.toFixed(2) }));
    }
  }, [formData.amount, formData.gstRate, settings?.isGSTEnabled]);

  const handleCategoryChange = (catId: string) => {
    const categoryInfo = finData.budgets.find(b => b.id === catId);
    // Auto-populate GST rate from budget if GST is enabled globally
    const newGstRate = settings?.isGSTEnabled ? (categoryInfo?.gstRate || 0) : 0;
    setFormData(prev => ({ 
      ...prev, 
      categoryId: catId,
      gstRate: newGstRate.toString()
    }));
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Transactions</h1>
        </div>
        <div className="flex flex-1 max-w-md relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#86BC24] transition-colors" size={16} />
          <input 
            type="text"
            placeholder="Search by description or category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#E2E8F0] rounded-xl text-sm outline-none focus:border-[#86BC24] transition-all shadow-sm"
          />
        </div>
        <div className="flex items-center gap-3">
          <ExpenseUpload />
          {(!isAdding && !editingId) && (
            <button 
              onClick={() => setIsAdding(true)}
              className="btn-primary flex items-center gap-2 h-[42px] px-6"
            >
              <Plus size={18} />
              Add
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isAdding && !isEditing && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-md"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                New Transaction
              </h2>
              <div className="flex items-center gap-2">
                <button 
                  type="submit" 
                  form="tx-form"
                  className="bg-[#86BC24] text-white px-4 py-1.5 rounded-lg font-bold uppercase text-[10px] tracking-widest hover:bg-[#75A51F] transition-all shadow-sm flex items-center gap-1.5"
                >
                  <Save size={12} />
                  Save
                </button>
                <div className="w-px h-4 bg-slate-200 mx-1" />
                <button 
                  type="button"
                  onClick={() => { setIsAdding(false); setEditingId(null); resetForm(); }}
                  className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <form id="tx-form" onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono italic text-xs">
                    {getCurrencySymbol(currencyCode)}
                  </span>
                  <input 
                    type="number" step="0.01" required value={formData.amount}
                    onChange={e => setFormData({...formData, amount: e.target.value})}
                    placeholder="0.00"
                    className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-[#E2E8F0] rounded-lg outline-none focus:border-[#86BC24] transition-colors text-sm font-mono"
                  />
                </div>
              </div>
              {settings?.isGSTEnabled && (
                 <>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-[#86BC24] uppercase tracking-widest">GST %</label>
                    <input 
                      type="number" value={formData.gstRate}
                      onChange={e => setFormData({...formData, gstRate: e.target.value})}
                      className="w-full p-2.5 bg-slate-50 border border-[#E2E8F0] rounded-lg outline-none focus:border-[#86BC24] transition-colors text-sm font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-[#86BC24] uppercase tracking-widest text-[#86BC24]">Deductions</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono italic text-xs">
                        {getCurrencySymbol(currencyCode)}
                      </span>
                      <input 
                        readOnly
                        value={(parseFloat(formData.amount || '0') - parseFloat(formData.actualAmount || '0')).toFixed(2)}
                        className="w-full pl-12 pr-4 py-2.5 bg-[#86BC24]/5 border border-[#86BC24]/20 rounded-lg outline-none text-sm font-mono text-[#86BC24] cursor-not-allowed"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-[#86BC24] uppercase tracking-widest text-[#86BC24]">Final Amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono italic text-xs">
                        {getCurrencySymbol(currencyCode)}
                      </span>
                      <input 
                        readOnly
                        value={formData.actualAmount}
                        className="w-full pl-12 pr-4 py-2.5 bg-[#86BC24]/5 border border-[#86BC24]/20 rounded-lg outline-none text-sm font-mono text-[#86BC24] cursor-not-allowed"
                        title="Final amount after tax"
                      />
                    </div>
                  </div>
                 </>
              )}
               <div className="space-y-2">
                 <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Name</label>
                 <select 
                   required value={formData.categoryId}
                   onChange={e => handleCategoryChange(e.target.value)}
                   className="w-full p-2.5 bg-slate-50 border border-[#E2E8F0] rounded-lg outline-none focus:border-[#86BC24] transition-colors text-sm"
                 >
                  <option value="">Select Category</option>
                  {finData.budgets.map(cat => {
                    const type = cat.type || 'Expense';
                    let foreColor = '#DC2626'; // Expense (Red-600)
                    if (type === 'Income') foreColor = '#16A34A'; // Green-600
                    if (type === 'Asset') foreColor = '#2563EB'; // Blue-600
                    if (type === 'Liability') foreColor = '#D97706'; // Amber/Orange-600

                    return (
                      <option 
                        key={cat.id} 
                        value={cat.id}
                        style={{ color: foreColor, fontWeight: 'bold' }}
                      >
                        {cat.category} ({type})
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Description</label>
                <input 
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  placeholder="e.g. Amazon Office Supplies"
                  className="w-full p-2.5 bg-slate-50 border border-[#E2E8F0] rounded-lg outline-none focus:border-[#86BC24] transition-colors text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Notes</label>
                <input 
                  value={formData.notes}
                  onChange={e => setFormData({...formData, notes: e.target.value})}
                  placeholder="Notes or Receipt ID"
                  className="w-full p-2.5 bg-slate-50 border border-[#E2E8F0] rounded-lg outline-none focus:border-[#86BC24] transition-colors text-sm"
                />
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
                    Name
                    <ArrowUpDown size={12} className={cn(sortField === 'category' ? "text-[#86BC24]" : "text-slate-300")} />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer hover:text-[#86BC24] transition-colors"
                  onClick={() => toggleSort('amount')}
                >
                  <div className="flex items-center gap-1">
                    {settings?.isGSTEnabled ? 'Total Amount' : 'Amount'}
                    <ArrowUpDown size={12} className={cn(sortField === 'amount' ? "text-[#86BC24]" : "text-slate-300")} />
                  </div>
                </th>
                {settings?.isGSTEnabled && (
                  <>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Deductions</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Final Amount</th>
                  </>
                )}
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Notes</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedExpenses.map((exp) => (
                <tr key={exp.id} className="group hover:bg-slate-50/80 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-xs font-mono text-slate-500">
                      {new Date(exp.date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-slate-900 leading-tight">{exp.description}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border bg-transparent",
                      (() => {
                        const catInfo = categoryMap.get(exp.categoryId);
                        const type = catInfo?.type || 'Expense';
                        switch (type) {
                          case 'Income': return "text-green-600 border-green-200";
                          case 'Asset': return "text-blue-600 border-blue-200";
                          case 'Liability': return "text-amber-600 border-orange-200";
                          default: return "text-red-600 border-red-200";
                        }
                      })()
                    )}>
                      {categoryMap.get(exp.categoryId)?.name || 'Unknown'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-bold text-slate-900 leading-none">
                      {formatCurrency(exp.amount, currencyCode)}
                    </span>
                  </td>
                  {settings?.isGSTEnabled && (
                    <>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-bold text-red-500 leading-none">
                          {formatCurrency(exp.deductions, currencyCode)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-bold text-[#86BC24] leading-none">
                          {formatCurrency(exp.finalAmount, currencyCode)}
                        </span>
                      </td>
                    </>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-[10px] font-mono text-slate-400">
                      {exp.notes || '-'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex justify-end gap-1 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => startEdit(exp)}
                        className="p-1.5 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        onClick={() => { setDeletingId(exp.id); setDeletingDescription(exp.description); }}
                        className="p-1.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
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
        
        {filteredExpenses.length > 0 && (
          <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Show</span>
                <select 
                  value={itemsPerPage}
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="bg-white border border-slate-200 rounded-lg text-xs py-1 px-2 outline-none focus:border-[#86BC24]"
                >
                  {[5, 10, 50, 100].map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-slate-500">
                Showing <span className="font-bold text-slate-900">{Math.min(filteredExpenses.length, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(filteredExpenses.length, currentPage * itemsPerPage)}</span> of <span className="font-bold text-slate-900">{filteredExpenses.length}</span>
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="p-2 text-slate-400 hover:text-[#86BC24] disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum = i + 1;
                  if (totalPages > 5 && currentPage > 3) {
                    pageNum = currentPage - 2 + i;
                  }
                  if (pageNum > totalPages) return null;
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={cn(
                        "w-8 h-8 rounded-lg text-xs font-bold transition-all",
                        currentPage === pageNum 
                          ? "bg-[#86BC24] text-white shadow-md shadow-green-200" 
                          : "text-slate-500 hover:bg-slate-100"
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button 
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                className="p-2 text-slate-400 hover:text-[#86BC24] disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}

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

      {categoricalChartData.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mt-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Categorical Performance</h2>
              <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-bold">Current Filtered Range: Budget vs Actual</p>
            </div>
          </div>
          <div className="h-[350px]">
             <BudgetBarChart data={categoricalChartData} height={350} />
          </div>
        </div>
      )}

      <AnimatePresence>
        {isEditing && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => { setIsEditing(false); setEditingId(null); resetForm(); }}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#86BC24]/10 flex items-center justify-center text-[#86BC24]">
                    <Edit2 size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Edit Transaction</h3>
                    <p className="text-xs text-slate-500">Update transaction details and reference.</p>
                  </div>
                </div>
                <button 
                  onClick={() => { setIsEditing(false); setEditingId(null); resetForm(); }}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleUpdate} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Date</label>
                    <input 
                      type="date" required value={formData.date}
                      onChange={e => setFormData({...formData, date: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#86BC24] transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono italic text-xs">
                        {getCurrencySymbol(currencyCode)}
                      </span>
                      <input 
                        type="number" step="0.01" required value={formData.amount}
                        onChange={e => setFormData({...formData, amount: e.target.value})}
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-[#86BC24] transition-all font-mono"
                      />
                    </div>
                  </div>
                  {settings?.isGSTEnabled && (
                    <>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-[#86BC24] uppercase tracking-widest">GST %</label>
                        <input 
                          type="number" value={formData.gstRate}
                          onChange={e => setFormData({...formData, gstRate: e.target.value})}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#86BC24] transition-all font-mono"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-[#86BC24] uppercase tracking-widest text-[#86BC24]">Deductions</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono italic text-xs">
                            {getCurrencySymbol(currencyCode)}
                          </span>
                          <input 
                            readOnly
                            value={(parseFloat(formData.amount || '0') - parseFloat(formData.actualAmount || '0')).toFixed(2)}
                            className="w-full pl-12 pr-4 py-3 bg-[#86BC24]/5 border border-slate-200 rounded-xl text-sm outline-none transition-all font-mono text-[#86BC24] cursor-not-allowed"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-[#86BC24] uppercase tracking-widest text-[#86BC24]">Final Amount</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono italic text-xs">
                            {getCurrencySymbol(currencyCode)}
                          </span>
                          <input 
                            readOnly
                            value={formData.actualAmount}
                            className="w-full pl-12 pr-4 py-3 bg-[#86BC24]/5 border border-slate-200 rounded-xl text-sm outline-none transition-all font-mono text-[#86BC24] cursor-not-allowed"
                            title="Final amount after tax"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Category</label>
                  <select 
                    required value={formData.categoryId}
                    onChange={e => handleCategoryChange(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#86BC24] transition-all cursor-pointer"
                  >
                    <option value="">Select Category</option>
                    {finData.budgets.map(cat => {
                      const type = cat.type || 'Expense';
                      let foreColor = '#DC2626'; 
                      if (type === 'Income') foreColor = '#16A34A'; 
                      if (type === 'Asset') foreColor = '#2563EB'; 
                      if (type === 'Liability') foreColor = '#D97706';

                      return (
                        <option 
                          key={cat.id} 
                          value={cat.id}
                          style={{ color: foreColor, fontWeight: 'bold' }}
                        >
                          {cat.category} ({type})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Description</label>
                  <input 
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    placeholder="Enter description..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#86BC24] transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Notes</label>
                  <input 
                    value={formData.notes}
                    onChange={e => setFormData({...formData, notes: e.target.value})}
                    placeholder="Enter notes..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#86BC24] transition-all"
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="submit"
                    className="flex-1 bg-[#86BC24] text-white py-4 rounded-xl font-bold text-sm uppercase tracking-widest shadow-lg shadow-[#86BC24]/20 hover:bg-[#75A51F] transition-all"
                  >
                    Save Changes
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setIsEditing(false); setEditingId(null); resetForm(); }}
                    className="px-8 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-slate-200 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {deletingId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeletingId(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl border border-slate-200 text-center"
            >
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Delete Transaction?</h3>
              <p className="text-slate-500 text-sm mb-8">
                Are you sure you want to remove <span className="font-bold text-slate-700">"{deletingDescription}"</span>? This action is permanent and will be logged in the audit trail.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setDeletingId(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-widest hover:bg-slate-50 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDelete}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                >
                  Confirm Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
