import React, { useState, useRef, useMemo } from 'react';
import Papa from 'papaparse';
import { useApp, getBusinessSettings } from '../../AppContext';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { logEvent } from '../../lib/audit';
import { 
  ArrowDown, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  HelpCircle, 
  ChevronRight, 
  ChevronLeft,
  FileText,
  Table,
  UploadCloud,
  ArrowRight,
  Zap,
  Loader2,
  RefreshCw,
  Settings2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency } from '../../lib/utils';
import { categoryApi, transactionApi, businessApi } from '../../lib/api';
import ImportRules from './ImportRules';

interface ParsedTransaction {
  date: string;
  amount: number;
  category: string;
  description: string;
  reference: string;
  type: string;
  id: string;
  srcIncome?: string;
  srcExpense?: string;
}

const HEADER_KEYWORDS = {
  date: ['date', 'timestamp', 'time', 'occured', 'day', 'period'],
  amount: ['amount', 'value', 'price', 'total', 'sum', 'cost', 'charge', 'rate'],
  income: ['credit', 'deposit', 'in', 'income', 'gain', 'plus', 'received'],
  expense: ['debit', 'payment', 'withdrawal', 'out', 'expense', 'loss', 'minus', 'spent'],
  description: ['description', 'desc', 'memo', 'details', 'payee', 'narrative', 'comment', 'name', 'item', 'vendor'],
  category: ['category', 'cat', 'type', 'tag', 'group', 'label', 'class'],
  reference: ['reference', 'ref', 'notes', 'id', 'transaction id', 'receipt', 'code', 'txid', 'voucher']
};

export default function ExpenseUpload() {
  const { user, finData, activeBusinessId, businesses, setActiveTab } = useApp();
  const activeBusiness = businesses.find(b => b.id === activeBusinessId);
  const settings = activeBusiness ? getBusinessSettings(activeBusiness) : null;
  const currencyCode = settings?.currency || 'USD';
  
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [isSaving, setIsSaving] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [wasDualColumnAmount, setWasDualColumnAmount] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [parsedData, setParsedData] = useState<ParsedTransaction[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Map of category names to their types
  const categoryTypeMap = useMemo(() => {
    const map = new Map<string, string>();
    finData.budgets.forEach(b => {
      if (b.name) {
        map.set(b.name.toLowerCase().trim(), b.type || 'Expense');
      }
    });
    return map;
  }, [finData.budgets]);

  const findBestHeader = (headers: string[], keywords: string[]) => {
    return headers.find(h => {
      const lower = h.toLowerCase().trim();
      return keywords.some(k => lower.includes(k) || k.includes(lower));
    });
  };

  const processRawRows = async (rows: any[], headers: string[]) => {
    setFeedback({ type: 'success', message: 'Analyzing file structure...' });
    
    try {
      const dateHeader = findBestHeader(headers, HEADER_KEYWORDS.date);
      const descHeader = findBestHeader(headers, HEADER_KEYWORDS.description);
      const catHeader = findBestHeader(headers, HEADER_KEYWORDS.category);
      const refHeader = findBestHeader(headers, HEADER_KEYWORDS.reference);
      
      const amountHeader = findBestHeader(headers, HEADER_KEYWORDS.amount);
      const incomeHeader = findBestHeader(headers, HEADER_KEYWORDS.income);
      const expenseHeader = findBestHeader(headers, HEADER_KEYWORDS.expense);

      setWasDualColumnAmount(!!(incomeHeader && expenseHeader));

      const activeRules = [...(finData.rules || [])].sort((a, b) => a.order - b.order).filter(r => r.active);

      const transactions: ParsedTransaction[] = rows.map((row, idx) => {
        let amount = 0;
        let type = 'Expense';
        let srcIn = '';
        let srcOut = '';

        if (incomeHeader && expenseHeader) {
           srcIn = String(row[incomeHeader] || '');
           srcOut = String(row[expenseHeader] || '');
           const valIn = parseFloat(srcIn.replace(/[^0-9.-]+/g, ""));
           const valOut = parseFloat(srcOut.replace(/[^0-9.-]+/g, ""));
           
           if (!isNaN(valIn) && valIn !== 0) {
             amount = Math.abs(valIn);
             type = 'Income';
           } else if (!isNaN(valOut) && valOut !== 0) {
             amount = Math.abs(valOut);
             type = 'Expense';
           }
        } else if (amountHeader) {
           const rawVal = parseFloat(String(row[amountHeader] || '0').replace(/[^0-9.-]+/g, ""));
           amount = Math.abs(rawVal);
           type = rawVal >= 0 ? 'Income' : 'Expense';
        }

        const rawCategory = (catHeader ? String(row[catHeader] || '') : '').trim();
        const description = descHeader ? String(row[descHeader] || 'No description') : 'No description';
        
        let category = rawCategory;
        let matchedByRule = false;

        // Apply rules
        for (const rule of activeRules) {
          const isMatch = rule.conditions.every((cond: any) => {
            const fieldVal = String(description || '').toLowerCase();
            const searchVal = String(cond.value || '').toLowerCase();
            if (cond.field !== 'description') return false; // Simple matching for now

            switch (cond.operator) {
              case 'contains': return fieldVal.includes(searchVal);
              case 'equals': return fieldVal === searchVal;
              default: return false;
            }
          });

          if (isMatch) {
            const action = rule.actions.find((a: any) => a.type === 'setCategory');
            if (action) {
              category = action.value;
              matchedByRule = true;
              break;
            }
          }
        }

        // If no rules matched and no category in file, use Income/Expense fallback
        if (!matchedByRule && !category) {
          category = type; // 'Income' or 'Expense' derived from amount
        }

        const detectedType = categoryTypeMap.get((category || '').toLowerCase()) || type;

        let tx: ParsedTransaction = {
          id: `row-${idx}`,
          date: dateHeader && row[dateHeader] ? new Date(row[dateHeader]).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          amount,
          description,
          category,
          reference: refHeader ? String(row[refHeader] || '') : '',
          type: detectedType,
          srcIncome: srcIn,
          srcExpense: srcOut
        };

        return tx;
      }).filter(t => t.amount !== 0);

      if (transactions.length === 0) {
        setFeedback({ type: 'error', message: 'No valid transaction rows found in file.' });
        return;
      }

      setParsedData(transactions);
      setSelectedRows(new Set(transactions.map(t => t.id)));
      setStep('preview');
      setFeedback(null);
    } catch (err) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Failed to process file records.' });
    }
  };

  const applyRulesToData = () => {
    const activeRules = [...(finData.rules || [])].sort((a, b) => a.order - b.order).filter(r => r.active);
    
    setParsedData(prev => prev.map(tx => {
      let updatedTx = { ...tx };
      
      for (const rule of activeRules) {
        const isMatch = rule.conditions.every((cond: any) => {
          const fieldVal = String((updatedTx as any)[cond.field] || '').toLowerCase();
          const searchVal = String(cond.value || '').toLowerCase();

          switch (cond.operator) {
            case 'contains': return fieldVal.includes(searchVal);
            case 'equals': return fieldVal === searchVal;
            case 'greaterThan': return parseFloat(fieldVal) > parseFloat(searchVal);
            case 'lessThan': return parseFloat(fieldVal) < parseFloat(searchVal);
            default: return false;
          }
        });

        if (isMatch) {
          for (const action of rule.actions) {
            if (action.type === 'setCategory') {
              updatedTx.category = action.value;
              const newType = categoryTypeMap.get((action.value || '').toLowerCase());
              if (!wasDualColumnAmount && newType) {
                updatedTx.type = newType;
              }
            } else if (action.type === 'setDescription') {
              updatedTx.description = action.value;
            }
          }
        }
      }
      return updatedTx;
    }));
    
    setFeedback({ type: 'success', message: 'Rules applied successfully.' });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleCreateRuleFromRow = async (row: ParsedTransaction) => {
    if (!user || !activeBusinessId) return;
    if (!row.category) {
      setFeedback({ type: 'error', message: 'Please select a category first to create a rule.' });
      return;
    }
    
    try {
      const newRule = {
        name: `${row.description.slice(0, 20)} → ${row.category}`,
        active: true,
        order: finData.rules.length,
        businessId: activeBusinessId,
        userId: user.uid,
        conditions: [
          { field: 'description', operator: 'contains', value: row.description }
        ],
        actions: [
          { type: 'setCategory', value: row.category }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'users', user.uid, 'import_rules'), newRule);
      
      await logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'CREATE',
        resourceType: 'import_rule',
        details: `Created new import rule from transaction row`
      });

      setFeedback({ type: 'success', message: 'Rule created! Click "Refresh Rules" to apply.' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Failed to create rule.' });
    }
  };

  const setManualCategory = (id: string, category: string) => {
    setParsedData(prev => prev.map(t => {
      if (t.id === id) {
        const newType = categoryTypeMap.get((category || '').toLowerCase());
        // If dual column, we don't allow changing the type derived from file columns
        const finalType = wasDualColumnAmount ? t.type : (newType || t.type);
        return { 
          ...t, 
          category,
          type: finalType
        };
      }
      return t;
    }));
  };

  const createQuickRule = async (tx: ParsedTransaction) => {
    if (!user || !activeBusinessId) return;
    try {
      await addDoc(collection(db, 'users', user.uid, 'import_rules'), {
        name: `Auto ${tx.category} for ${tx.description.slice(0, 20)}...`,
        conditions: [{ field: 'description', operator: 'contains', value: tx.description }],
        actions: [{ type: 'setCategory', value: tx.category }],
        active: true,
        order: finData.rules.length,
        businessId: activeBusinessId,
        userId: user.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      setFeedback({ type: 'success', message: 'Rule created! Click Refresh Rules to apply.' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !activeBusinessId) return;

    setFeedback(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        await processRawRows(results.data, results.meta.fields || []);
      }
    });
  };

  const handleImport = async () => {
    if (!user || !activeBusinessId) return;
    setIsSaving(true);
    
    try {
      const rowsToSave = parsedData.filter(t => selectedRows.has(t.id));
      let count = 0;

      // Track existing categories to avoid redundant lookups or creations
      const existingCats = new Set(finData.budgets.map(b => (b.name || '').toLowerCase()));
      const createdThisTurn = new Set<string>();

      for (const row of rowsToSave) {
        const catKey = (row.category || '').toLowerCase();
        const categoryInfo = finData.budgets.find(b => (b.name || '').toLowerCase() === catKey);
        
        // Auto-create category if it doesn't exist
        if (catKey && !existingCats.has(catKey) && !createdThisTurn.has(catKey)) {
          const txDate = new Date(row.date);
          await categoryApi.create(activeBusinessId, {
            name: row.category,
            type: row.type,
            month: txDate.getMonth() + 1,
            year: txDate.getFullYear()
          });
          createdThisTurn.add(catKey);
        }

        // Logic: Apply GST extraction for imported income
        const isIncome = (categoryInfo?.type === 'Income') || (row.type === 'Income');
        const gstRate = (settings?.isGstEnabled && isIncome) ? (categoryInfo?.gstRate || 0) : 0;
        
        const amount = row.amount;
        let finalAmount = amount;
        let deductions = 0;
        if (gstRate > 0) {
          finalAmount = amount / (1 + (gstRate / 100));
          deductions = amount - finalAmount;
        }

        // We need the ID. If we just created it or it existed, we find it.
        const catId = categoryInfo?.id || (await businessApi.listCategories(activeBusinessId)).data.find((c: any) => (c.name || '').toLowerCase() === catKey)?.id;

        if (catId) {
          await transactionApi.create({
            amount: amount,
            deductions: deductions,
            finalAmount: finalAmount,
            categoryId: catId,
            date: new Date(row.date).toISOString(),
            description: row.description,
            notes: row.reference,
            businessId: activeBusinessId
          });
          count++;
        }
      }

      await logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'IMPORT',
        resourceType: 'expense',
        details: `Imported ${count} transactions from preview`
      });

      setFeedback({ type: 'success', message: `Successfully imported ${count} transactions.` });
      setStep('upload');
      setParsedData([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setIsOpen(false), 2000);
    } catch (err) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Error saving transactions to database.' });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleAll = () => {
    if (selectedRows.size === parsedData.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(parsedData.map(t => t.id)));
    }
  };

  const toggleRow = (id: string) => {
    const next = new Set(selectedRows);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedRows(next);
  };

  const downloadSampleCSV = () => {
    const categories = finData.budgets.length > 0 
      ? finData.budgets.map(b => b.category)
      : ['Food', 'Rent', 'Travel'];
    
    const data = [['date', 'amount', 'category', 'description', 'reference']];
    const now = new Date();
    
    for (let i = 0; i < 5; i++) {
        const dateStr = new Date(now.getFullYear(), now.getMonth(), i + 1).toISOString().split('T')[0];
        const category = categories[Math.floor(Math.random() * categories.length)];
        const amount = (Math.random() * 100 + 20).toFixed(2);
        const description = `Sample ${category} Transaction`;
        const reference = `REF-${1000 + i}`;
        data.push([dateStr, amount, category, description, reference]);
    }

    const csvContent = data.map(e => e.map(val => `"${val}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "delight_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <button 
        onClick={() => { setIsOpen(true); setStep('upload'); setFeedback(null); }} 
        className="flex items-center gap-2 h-[42px] px-6 bg-[#86BC24] hover:bg-[#75A51F] text-white rounded-lg font-bold uppercase text-[10px] tracking-widest transition-all shadow-sm"
      >
        <ArrowDown size={18} />
        Import
      </button>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isSaving && setIsOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-[1400px] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white">
                    <Table size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">IMPORT TRANSACTIONS</h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                        {step === 'upload' ? 'Step 1: Upload Data' : `Step 2: Preview records`}
                      </p>
                      {step === 'preview' && (
                        <>
                          <div className="w-1 h-1 rounded-full bg-slate-300" />
                          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                            Selected: <span className="text-slate-900">{selectedRows.size}</span> / {parsedData.length} records
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setIsOpen(false)} 
                  disabled={isSaving}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Content Area */}
              <div className="flex-1 overflow-y-auto p-8">
                {step === 'upload' ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="p-4 bg-[#F8FAFC] border border-slate-100 rounded-xl">
                          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <HelpCircle size={14} className="text-[#86BC24]" />
                            Instructions
                          </h3>
                          <ul className="space-y-2">
                             {[
                               'Upload any CSV or Text file from your bank or ERP.',
                               'Columns are automatically mapped by keywords.',
                               'Handles dual columns (Credits/Debits or In/Out).',
                               'Existing categories are automatically detected.'
                             ].map((text, i) => (
                               <li key={i} className="text-[11px] text-slate-500 flex gap-2">
                                 <span className="text-[#86BC24]">•</span>
                                 {text}
                               </li>
                             ))}
                          </ul>
                          <div className="mt-4 pt-4 border-t border-slate-100">
                             <button 
                               onClick={downloadSampleCSV}
                               className="text-[10px] font-bold uppercase tracking-widest text-[#86BC24] hover:underline flex items-center gap-2"
                             >
                               <FileText size={12} />
                               Download Sample Template
                             </button>
                          </div>
                        </div>
                      </div>

                      <div 
                        className="border-2 border-dashed rounded-2xl p-12 text-center transition-all flex flex-col items-center justify-center relative overflow-hidden border-slate-200"
                      >
                        <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 transition-all duration-300 bg-slate-50 text-slate-400">
                          <UploadCloud size={32} />
                        </div>
                        
                        <div className="space-y-4">
                          <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="px-8 py-3 bg-[#86BC24] text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-[#75a61f] transition-all shadow-lg shadow-[#86BC24]/20 flex items-center gap-2 mx-auto"
                          >
                            <UploadCloud size={16} />
                            Select File
                          </button>
                          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">
                            or drag and drop here
                          </p>
                        </div>

                        <input 
                          type="file" accept=".csv, .txt" className="hidden" ref={fileInputRef} 
                          onChange={handleFileUpload}
                        />
                      </div>
                    </div>

                    {feedback && (
                      <div className={cn(
                        "p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2",
                        feedback.type === 'success' ? "bg-green-50 text-green-700 border border-green-100" : "bg-red-50 text-red-700 border border-red-100"
                      )}>
                        {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                        <p className="text-sm font-medium">{feedback.message}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                     <div className="overflow-x-auto border border-slate-100 rounded-xl shadow-sm">
                       <table className="w-full text-left border-collapse min-w-[700px]">
                         <thead>
                           <tr className="bg-slate-50/80 border-b border-slate-100">
                             <th className="px-4 py-3 w-10">
                               <input 
                                 type="checkbox" 
                                 checked={selectedRows.size === parsedData.length}
                                 onChange={toggleAll}
                                 className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                               />
                             </th>
                             <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Date</th>
                             <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Description</th>
                             <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ref</th>
                             <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Category</th>
                             {wasDualColumnAmount && (
                               <>
                                 <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Income (Src)</th>
                                 <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Expense (Src)</th>
                               </>
                             )}
                             <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Amount</th>
                             <th className="px-2 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Rule</th>
                           </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-50">
                            {parsedData.map((row) => (
                              <tr key={row.id} className={cn(
                                "group transition-colors",
                                selectedRows.has(row.id) ? "bg-white" : "bg-slate-50/30 opacity-60"
                              )}>
                                <td className="px-4 py-3">
                                  <input 
                                    type="checkbox" 
                                    checked={selectedRows.has(row.id)}
                                    onChange={() => toggleRow(row.id)}
                                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                                  />
                                </td>
                                <td className="px-4 py-3 text-[11px] font-mono text-slate-600 whitespace-nowrap">
                                  {row.date}
                                </td>
                                <td className="px-4 py-3 min-w-[200px]">
                                  <p className="text-[11px] font-bold text-slate-900 truncate">{row.description}</p>
                                </td>
                                <td className="px-4 py-3 text-[10px] font-mono text-slate-400">
                                  {row.reference || '-'}
                                </td>
                                <td className="px-4 py-3 min-w-[150px]">
                                   <div className="relative group/cat">
                                     <select 
                                       value={row.category}
                                       onChange={(e) => {
                                         const nextData = [...parsedData];
                                         const idx = nextData.findIndex(t => t.id === row.id);
                                         if (idx !== -1) {
                                           const newCat = e.target.value;
                                           nextData[idx].category = newCat;
                                           const newType = categoryTypeMap.get((newCat || '').toLowerCase()) || 'Expense';
                                           if (!wasDualColumnAmount) {
                                             nextData[idx].type = newType;
                                           }
                                           setParsedData(nextData);
                                         }
                                       }}
                                       className={cn(
                                         "w-full p-1.5 bg-white border rounded-lg text-[10px] font-bold outline-none transition-all appearance-none pr-8",
                                         !row.category ? "text-red-500 border-red-100 italic" : (
                                           row.type === 'Income' ? "text-green-700 border-green-200 bg-green-50/30" : 
                                           row.type === 'Asset' ? "text-blue-700 border-blue-200 bg-blue-50/30" : 
                                           row.type === 'Liability' ? "text-amber-700 border-amber-200 bg-amber-50/30" : 
                                           "text-slate-700 border-slate-200"
                                         ),
                                         "focus:border-[#86BC24]"
                                       )}
                                     >
                                        <option value="">Select Category...</option>
                                        {finData.budgets.map(b => (
                                          <option key={b.id} value={b.name} className="text-slate-900 bg-white">
                                            {b.name}
                                          </option>
                                        ))}
                                     </select>
                                     <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                       <ArrowDown size={10} />
                                     </div>
                                   </div>
                                </td>
                                {wasDualColumnAmount && (
                                  <>
                                    <td className="px-4 py-3 text-right">
                                      <span className="text-[10px] font-mono text-slate-400">{row.srcIncome || '-'}</span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      <span className="text-[10px] font-mono text-slate-400">{row.srcExpense || '-'}</span>
                                    </td>
                                  </>
                                )}
                                <td className="px-4 py-3 text-right">
                                  <span className={cn(
                                    "text-xs font-bold font-mono",
                                    row.type === 'Income' ? "text-green-600" : (
                                      row.type === 'Asset' ? "text-blue-600" :
                                      row.type === 'Liability' ? "text-amber-600" :
                                      "text-red-600"
                                    )
                                  )}>
                                    {row.type === 'Income' ? '+' : ''}
                                    {formatCurrency(row.amount, currencyCode)}
                                  </span>
                                </td>
                                <td className="px-2 py-3 text-center">
                                   <button 
                                      onClick={() => handleCreateRuleFromRow(row)}
                                      title="Create rule from this row"
                                      className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-white rounded-lg border border-transparent hover:border-indigo-100 transition-all"
                                   >
                                      <Zap size={14} />
                                   </button>
                                </td>
                              </tr>
                            ))}
                         </tbody>
                       </table>
                     </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-8 py-6 border-t border-slate-100 bg-slate-50 shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-6">
                   {step === 'preview' && (
                     <div className="flex items-center gap-3">
                        <button 
                          onClick={() => setShowRulesModal(true)}
                          className="h-10 px-4 bg-slate-100 text-slate-600 rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center gap-2"
                        >
                          <Settings2 size={14} />
                          Manage Rules
                        </button>
                        <button 
                          onClick={applyRulesToData}
                          className="h-10 px-4 bg-indigo-50 text-indigo-600 rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-indigo-100 transition-all flex items-center gap-2"
                        >
                          <RefreshCw size={14} />
                          Refresh Rules
                        </button>
                     </div>
                   )}
                </div>
                <div className="flex items-center gap-3">
                  {step === 'preview' && (
                    <button 
                      onClick={() => setStep('upload')}
                      className="px-6 py-2.5 h-10 bg-orange-50 text-orange-600 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-orange-100 transition-all flex items-center gap-2"
                    >
                      <ChevronLeft size={16} />
                      Back
                    </button>
                  )}
                  {step === 'preview' ? (
                    <button 
                      onClick={handleImport}
                      disabled={isSaving || selectedRows.size === 0}
                      className="btn-primary flex items-center gap-2 px-8 h-10 bg-[#86BC24] hover:bg-[#75A51F] text-white"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 size={16} className="animate-spin text-white" />
                          Saving...
                        </>
                      ) : (
                        <>
                          Complete Import
                          <ArrowRight size={16} />
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="bg-slate-200 h-10 w-px mx-2" />
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <RulesModal 
        show={showRulesModal} 
        onClose={() => setShowRulesModal(false)} 
        rules={finData.rules} 
      />
    </>
  );
}

{/* Rules Modal Overlay */}
function RulesModal({ show, onClose, rules }: { show: boolean, onClose: () => void, rules: any[] }) {
  return (
      <AnimatePresence>
        {show && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={onClose}
               className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="relative w-full max-w-5xl bg-slate-50 rounded-[40px] shadow-2xl overflow-hidden flex flex-col h-[85vh]"
             >
                <div className="px-8 py-6 bg-white border-b border-slate-100 flex items-center justify-between shrink-0">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                         <Zap size={20} fill="currentColor" />
                      </div>
                      <div>
                         <h3 className="text-lg font-bold text-slate-900">Automation Engine</h3>
                         <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-0.5">Rules Administration</p>
                      </div>
                   </div>
                   <button 
                     onClick={onClose}
                     className="w-10 h-10 rounded-full hover:bg-slate-50 flex items-center justify-center text-slate-400 transition-colors"
                   >
                      <X size={20} />
                   </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                   <ImportRules isModal={true} />
                </div>

                <div className="px-8 py-6 bg-white border-t border-slate-100 flex items-center justify-end shrink-0">
                   <button 
                     onClick={onClose}
                     className="h-12 px-8 bg-slate-900 text-white rounded-xl font-bold text-sm shadow-xl shadow-slate-900/10 hover:bg-slate-800 transition-all active:scale-95"
                   >
                     Done
                   </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
  );
}
