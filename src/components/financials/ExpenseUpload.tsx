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
  const [step, setStep] = useState<'upload' | 'create-categories' | 'resolve' | 'preview'>('upload');
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCreatingCategories, setIsCreatingCategories] = useState(false);
  const [wasDualColumnAmount, setWasDualColumnAmount] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<ParsedTransaction[]>([]);
  const [unresolvedNames, setUnresolvedNames] = useState<string[]>([]);
  const [newCategorySettings, setNewCategorySettings] = useState<Record<string, { type: 'Income' | 'Expense', create: boolean }>>({});
  const [resolutions, setResolutions] = useState<Record<string, { type: 'create' | 'map', target?: string }>>({});
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setStep('upload');
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen]);

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
    setIsProcessing(true);
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
           if (!isNaN(rawVal)) {
             amount = Math.abs(rawVal);
             type = rawVal >= 0 ? 'Income' : 'Expense';
           }
        }

        const rawCategory = (catHeader ? String(row[catHeader] || '') : '').trim();
        const description = (descHeader ? String(row[descHeader] || '') : '').trim() || 'No description';
        
        let category = rawCategory;
        let matchedByRule = false;

        // Apply rules
        for (const rule of activeRules) {
          const isMatch = rule.conditions.every((cond: any) => {
            const fieldVal = String(description || '').toLowerCase();
            const searchVal = String(cond.value || '').toLowerCase();
            if (cond.field !== 'description') return false; 

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

        if (!matchedByRule && !category) {
          category = type; 
        }

        const detectedType = categoryTypeMap.get((category || '').toLowerCase()) || type;

        // Robust date parsing
        let formattedDate = new Date().toISOString().split('T')[0];
        if (dateHeader && row[dateHeader]) {
          try {
            const d = new Date(row[dateHeader]);
            if (!isNaN(d.getTime())) {
              formattedDate = d.toISOString().split('T')[0];
            }
          } catch(e) {}
        }

        let tx: ParsedTransaction = {
          id: `row-${idx}`,
          date: formattedDate,
          amount,
          description,
          category,
          reference: refHeader ? String(row[refHeader] || '') : '',
          type: detectedType,
          srcIncome: srcIn,
          srcExpense: srcOut
        };

        return tx;
      }).filter(t => !isNaN(t.amount) && t.amount !== 0);

      if (transactions.length === 0) {
        setFeedback({ type: 'error', message: 'No valid transaction rows found in file.' });
        return;
      }

      setParsedData(transactions);
      
      // Look for unresolved categories
      const missing = Array.from(new Set(transactions
        .map(t => t.category)
        .filter(c => c && !categoryTypeMap.has(c.toLowerCase().trim()))
      ));

      if (missing.length > 0) {
        setUnresolvedNames(missing);
        const initialSettings: Record<string, { type: 'Income' | 'Expense', create: boolean }> = {};
        missing.forEach(name => {
          // Guess type based on data if possible
          const firstTx = transactions.find(t => t.category === name);
          initialSettings[name] = { 
            type: firstTx?.type === 'Income' ? 'Income' : 'Expense',
            create: true 
          };
        });
        setNewCategorySettings(initialSettings);
        setStep('create-categories');
      } else {
        setSelectedRows(new Set(transactions.map(t => t.id)));
        executeImport(transactions);
      }
      setFeedback(null);
    } catch (err) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Failed to process file records.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const finalizeResolution = () => {
    const updated = parsedData.map(tx => {
      const res = resolutions[tx.category];
      if (res && res.type === 'map' && res.target) {
        const newType = categoryTypeMap.get((res.target || '').toLowerCase());
        return {
          ...tx,
          category: res.target,
          type: wasDualColumnAmount ? tx.type : (newType || tx.type)
        };
      }
      return tx;
    });
    
    setParsedData(updated);
    setSelectedRows(new Set(updated.map(t => t.id)));
    executeImport(updated);
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

  const handleCreateCategories = async () => {
    if (!activeBusinessId) return;
    setIsCreatingCategories(true);
    setFeedback({ type: 'success', message: 'Creating new categories...' });
    
    try {
      const entries = Object.entries(newCategorySettings).filter(([_, s]) => s.create);
      const now = new Date();
      
      for (const [name, setting] of entries) {
        await categoryApi.create(activeBusinessId, {
          name,
          type: setting.type,
          budget: 0,
          month: now.getMonth() + 1,
          year: now.getFullYear()
        });
      }
      
      // Initial resolutions for those we didn't create
      const initialRes: Record<string, { type: 'create' | 'map', target?: string }> = {};
      unresolvedNames.forEach(name => {
        if (!newCategorySettings[name]?.create) {
           initialRes[name] = { type: 'map' };
        }
      });
      setResolutions(initialRes);
      
      setFeedback({ type: 'success', message: `Created ${entries.length} categories.` });
      
      const remainingToMap = unresolvedNames.filter(name => !newCategorySettings[name]?.create);
      if (remainingToMap.length === 0) {
         setSelectedRows(new Set(parsedData.map(t => t.id)));
         executeImport(parsedData);
      } else {
         setStep('resolve');
      }
    } catch (err) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Failed to create categories.' });
    } finally {
      setIsCreatingCategories(false);
    }
  };

  const executeImport = async (dataToImport?: ParsedTransaction[]) => {
    if (!user || !activeBusinessId) return;
    setIsSaving(true);
    setImportResult(null);
    
    try {
      const rowsToSave = dataToImport || parsedData.filter(t => selectedRows.has(t.id));
      if (rowsToSave.length === 0) {
        setFeedback({ type: 'error', message: 'No transactions selected for import.' });
        setIsSaving(false);
        return;
      }

      // Filter and format the data to match the requested API schema
      const formattedTransactions = rowsToSave.map(t => ({
        date: t.date, 
        description: t.description.substring(0, 500),
        amount: Math.round(t.amount * 100) / 100,
        category: t.category.substring(0, 100),
        reference: (t.reference || '').substring(0, 500)
      }));

      const response = await transactionApi.import(activeBusinessId, formattedTransactions);
      
      // Prioritize success message from API if available
      const apiData = response.data;
      const apiMessage = typeof apiData === 'string' ? apiData : (apiData?.message || apiData?.detail || apiData?.title);
      const resultText = apiMessage || `Successfully imported ${rowsToSave.length} records.`;
      
      setImportResult(resultText);
      setFeedback({ type: 'success', message: resultText });

      await logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'IMPORT',
        resourceType: 'expense',
        details: `Imported ${rowsToSave.length} transactions: ${resultText}`
      });

      // Clear after success
      setTimeout(() => {
        if (isOpen) {
           setStep('upload');
           setParsedData([]);
           setUnresolvedNames([]);
           if (fileInputRef.current) fileInputRef.current.value = '';
           setIsOpen(false);
           setImportResult(null);
        }
      }, 3000);
    } catch (err: any) {
      console.error(err);
      let msg = 'Error saving transactions via API.';
      if (err.response?.data) {
        const data = err.response.data;
        if (data.errors) {
          const errorEntries = Object.entries(data.errors);
          if (errorEntries.length > 0) {
            const [field, messages]: [string, any] = errorEntries[0];
            const detail = Array.isArray(messages) ? messages[0] : String(messages);
            // If the field name is a complex path like Transactions[0].Date, just show the message
            msg = field.includes('.') ? detail : `${field}: ${detail}`;
          }
        } else if (data.detail) {
          msg = data.detail;
        } else if (data.message) {
          msg = data.message;
        } else if (data.title) {
          msg = data.title;
        }
      }
      setFeedback({ type: 'error', message: msg });
    } finally {
      setIsSaving(false);
    }
  };

  const handleImport = () => executeImport();

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
                        {step === 'upload' ? 'Step 1: Upload Data' : 
                         step === 'create-categories' ? 'Step 2: New Categories' :
                         step === 'resolve' ? 'Step 3: Map Categories' : `Step 4: Preview records`}
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
              <div className="flex-1 overflow-y-auto p-8 relative">
                {(isSaving || isProcessing) && (
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-50 flex flex-col items-center justify-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-white shadow-xl flex items-center justify-center border border-slate-100">
                      <Loader2 size={32} className="animate-spin text-[#86BC24]" />
                    </div>
                    <div className="flex flex-col items-center gap-1 text-center">
                      <p className="text-sm font-bold text-slate-900 uppercase tracking-widest">
                        {isSaving ? 'Importing Data' : 'Processing File'}
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest animate-pulse">
                        {isSaving ? 'Writing to database...' : 'Analyzing records...'}
                      </p>
                    </div>
                  </div>
                )}
                {importResult && (
                  <div className="absolute inset-x-8 top-8 z-[60] p-6 bg-[#86BC24] text-white rounded-2xl shadow-xl animate-in zoom-in-95 fade-in duration-300">
                    <div className="flex items-center gap-4">
                       <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                         <CheckCircle2 size={24} />
                       </div>
                       <div>
                         <h3 className="text-lg font-bold">Import Result</h3>
                         <p className="text-sm text-white/90 font-medium">{importResult}</p>
                       </div>
                    </div>
                  </div>
                )}
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

                    {feedback && step === 'upload' && (
                      <div className={cn(
                        "p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2",
                        feedback.type === 'success' ? "bg-green-50 text-green-700 border border-green-100" : "bg-red-50 text-red-700 border border-red-100"
                      )}>
                        {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                        <p className="text-sm font-medium">{feedback.message}</p>
                      </div>
                    )}
                  </div>
                ) : step === 'create-categories' ? (
                  <div className="space-y-6">
                    <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-3">
                      <Settings2 size={20} className="text-indigo-600" />
                      <div>
                        <h4 className="text-sm font-bold text-indigo-900">New Category Setup</h4>
                        <p className="text-xs text-indigo-700">We found new categories in your file. Define them now or skip to map them to existing ones.</p>
                      </div>
                    </div>

                    <div className="border border-slate-100 rounded-xl shadow-sm overflow-hidden bg-white">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-100">
                          <tr>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Category Name</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Solution: Create New?</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Type</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {unresolvedNames.map(name => (
                            <tr key={name} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4">
                                <span className={cn(
                                  "text-sm font-bold",
                                  newCategorySettings[name]?.create ? "text-slate-900" : "text-slate-300 line-through"
                                )}>{name}</span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <div className="flex items-center justify-center gap-3">
                                  <input 
                                   type="checkbox" 
                                   id={`create-${name}`}
                                   checked={newCategorySettings[name]?.create}
                                   onChange={(e) => setNewCategorySettings(prev => ({ ...prev, [name]: { ...prev[name], create: e.target.checked } }))}
                                   className="rounded border-slate-300 text-[#86BC24] focus:ring-[#86BC24] w-4 h-4 cursor-pointer"
                                  />
                                  <label htmlFor={`create-${name}`} className="text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer">
                                    {newCategorySettings[name]?.create ? 'Create' : 'Skip/Map'}
                                  </label>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <button 
                                    disabled={!newCategorySettings[name]?.create}
                                    onClick={() => setNewCategorySettings(prev => ({ ...prev, [name]: { ...prev[name], type: 'Income' } }))}
                                    className={cn(
                                      "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all",
                                      newCategorySettings[name]?.type === 'Income'
                                        ? "bg-green-500 text-white border-green-500"
                                        : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"
                                    )}
                                  >
                                    Income
                                  </button>
                                  <button 
                                    disabled={!newCategorySettings[name]?.create}
                                    onClick={() => setNewCategorySettings(prev => ({ ...prev, [name]: { ...prev[name], type: 'Expense' } }))}
                                    className={cn(
                                      "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all",
                                      newCategorySettings[name]?.type === 'Expense'
                                        ? "bg-red-500 text-white border-red-500"
                                        : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"
                                    )}
                                  >
                                    Expense
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {feedback && step === 'create-categories' && (
                      <div className={cn(
                        "p-4 rounded-xl flex items-center gap-3",
                        feedback.type === 'success' ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                      )}>
                        <p className="text-sm font-medium">{feedback.message}</p>
                      </div>
                    )}
                  </div>
                ) : step === 'resolve' ? (
                  <div className="space-y-6">
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
                      <AlertCircle size={20} className="text-amber-600" />
                      <div>
                        <h4 className="text-sm font-bold text-amber-900">Unresolved Categories Detected</h4>
                        <p className="text-xs text-amber-700">The following categories were found in your file but don't exist in your budget yet. Choose how to handle them.</p>
                      </div>
                    </div>
                    <div className="border border-slate-100 rounded-xl shadow-sm overflow-hidden bg-white">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-100">
                          <tr>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Found in File</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {unresolvedNames.filter(name => !newCategorySettings[name]?.create).map(name => (
                            <tr key={name} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4">
                                <span className="text-sm font-bold text-slate-900">{name}</span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-4">
                                  <button 
                                    onClick={() => setResolutions(prev => ({ ...prev, [name]: { type: 'create' } }))}
                                    className={cn(
                                      "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border",
                                      resolutions[name]?.type === 'create' 
                                        ? "bg-[#86BC24] text-white border-[#86BC24] shadow-sm" 
                                        : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                                    )}
                                  >
                                    Create New
                                  </button>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-slate-400 font-bold uppercase">or</span>
                                    <div className="relative">
                                      <select 
                                        value={resolutions[name]?.type === 'map' ? resolutions[name]?.target : ''}
                                        onChange={(e) => setResolutions(prev => ({ ...prev, [name]: { type: 'map', target: e.target.value } }))}
                                        className={cn(
                                          "p-2 bg-white border rounded-lg text-xs font-bold outline-none appearance-none pr-8 min-w-[200px]",
                                          resolutions[name]?.type === 'map' ? "border-[#86BC24] text-[#86BC24]" : "border-slate-200 text-slate-500"
                                        )}
                                      >
                                        <option value="">Map to Existing...</option>
                                        {finData.budgets.map(b => (
                                          <option key={b.id} value={b.name}>{b.name}</option>
                                        ))}
                                      </select>
                                      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                        <ArrowDown size={10} />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                     <div className="overflow-x-scroll border border-slate-100 rounded-xl shadow-sm">
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
                                !row.category ? "bg-red-50/80" : (selectedRows.has(row.id) ? "bg-white" : "bg-slate-50/30 opacity-60")
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
                                <td className="px-4 py-3 max-w-[200px]">
                                  <p className="text-[11px] font-bold text-slate-900 truncate" title={row.description}>{row.description}</p>
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
                </div>
                <div className="flex items-center gap-3">
                  {step !== 'upload' && !importResult && (
                    <button 
                      onClick={() => {
                        if (step === 'preview') setStep('resolve');
                        else if (step === 'resolve') setStep('create-categories');
                        else setStep('upload');
                      }}
                      className="px-6 py-2.5 h-10 bg-orange-50 text-orange-600 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-orange-100 transition-all flex items-center gap-2"
                    >
                      <ChevronLeft size={16} />
                      Back
                    </button>
                  )}
                  {step === 'create-categories' ? (
                     <button 
                      onClick={handleCreateCategories}
                      disabled={isCreatingCategories}
                      className="px-8 h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-[10px] uppercase tracking-widest shadow-sm flex items-center gap-2"
                    >
                      {isCreatingCategories ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          Create & Import
                          <ChevronRight size={16} />
                        </>
                      )}
                    </button>
                  ) : step === 'resolve' ? (
                     <button 
                      onClick={finalizeResolution}
                      className="px-8 h-10 bg-[#86BC24] hover:bg-[#75A51F] text-white rounded-lg font-bold text-[10px] uppercase tracking-widest shadow-sm flex items-center gap-2"
                    >
                      Complete Import
                      <ChevronRight size={16} />
                    </button>
                  ) : step === 'preview' ? (
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
    </>
  );
}

{/* Rules Modal Overlay removed per client request */}
function RulesModal({ show, onClose, rules }: { show: boolean, onClose: () => void, rules: any[] }) {
  return null;
}
