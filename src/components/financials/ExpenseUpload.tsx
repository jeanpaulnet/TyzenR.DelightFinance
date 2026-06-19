import React, { useState, useRef, useMemo, useEffect } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useApp, getBusinessSettings } from '../../AppContext';
import { collection, addDoc, query, where, onSnapshot, doc, deleteDoc, setDoc } from 'firebase/firestore';
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
  date: [
    'date', 'timestamp', 'time', 'occured', 'day', 'period', 'txn date', 'booking date', 'value date', 
    'tran. date', 'tran date', 'post date', 'transaction date', 'dt', 'txn_date', 'val_date', 'booking_date'
  ],
  amount: [
    'amount', 'value', 'price', 'total', 'sum', 'cost', 'charge', 'rate', 'txn amount', 'amount (inr)', 
    'amount(usd)', 'balance', 'closing balance', 'amt', 'amount (local)', 'amount (usd)', 'inr', 'usd', 
    'rupees', 'euros', 'gbp', 'cad', 'aud', 'amount_inr', 'amount_usd'
  ],
  income: [
    'credit', 'deposit', 'in', 'income', 'gain', 'plus', 'received', 'cr', 'deposit amount', 'credit amount', 
    'cr amt', 'credits', 'deposit_amt', 'credit_amt', 'dep'
  ],
  expense: [
    'debit', 'payment', 'withdrawal', 'out', 'expense', 'loss', 'minus', 'spent', 'dr', 'withdrawal amount', 
    'debit amount', 'dr amt', 'debits', 'withdrawal_amt', 'debit_amt', 'withdrwl', 'wd'
  ],
  description: [
    'description', 'desc', 'memo', 'details', 'payee', 'narrative', 'narration', 'particulars', 'remarks', 
    'comment', 'name', 'item', 'vendor', 'reference', 'txn remarks', 'txn description', 'remark', 'party', 
    'beneficiary', 'remitter', 'payee name'
  ],
  category: [
    'category', 'cat', 'type', 'tag', 'group', 'label', 'class', 'industry'
  ],
  reference: [
    'reference', 'ref', 'notes', 'id', 'transaction id', 'receipt', 'code', 'txid', 'voucher', 'cheque', 
    'ref.', 'ref number', 'reference number', 'cheque/dd no.', 'ref_no', 'reference_no', 'chq'
  ]
};

const parseRobustFloat = (val: any): number => {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  // Replace weird spaces (including non-breaking spaces) with standard spaces
  let str = String(val).replace(/[\u00A0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/g, ' ').trim();
  if (!str) return 0;

  // Check for parenthesis representation of negative numbers, e.g., (1,234.50)
  const isParenthesisNegative = /^\s*\(.+\)\s*$/.test(str);
  
  // Check if string ends with minus sign, e.g., 1,234.50-
  const isTrailingNegative = str.endsWith('-');

  // Standardize European vs US format before removing non-numeric chars
  // Strip spaces and currency symbols first
  let temp = str.replace(/[^0-9.,\-]/g, '');

  const lastComma = temp.lastIndexOf(',');
  const lastPeriod = temp.lastIndexOf('.');
  
  if (lastComma !== -1 && lastPeriod !== -1) {
    if (lastComma > lastPeriod) {
      // European: 1.234,56 -> 1234.56
      temp = temp.replace(/\./g, '').replace(/,/g, '.');
    } else {
      // US: 1,234.56 -> 1234.56
      temp = temp.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    // Only comma present: if it is followed by exactly 2 digits (or is decimal), replace with period
    const match = temp.match(/,(\d{2})$/);
    if (match || temp.indexOf(',') === temp.length - 3) {
      temp = temp.replace(/,/g, '.');
    } else {
      temp = temp.replace(/,/g, '');
    }
  }

  // Double check if we have any other non-numeric chars to strip out
  let cleaned = temp.replace(/[^0-9.\-]/g, '');

  let num = parseFloat(cleaned);
  if (isNaN(num)) return 0;

  if (isParenthesisNegative || isTrailingNegative) {
    num = -Math.abs(num);
  }

  return num;
};

const parseRobustDate = (val: any): string => {
  if (val === undefined || val === null) return new Date().toISOString().split('T')[0];
  if (val instanceof Date) {
    if (!isNaN(val.getTime())) {
      return val.toISOString().split('T')[0];
    }
  }

  if (typeof val === 'number') {
    // Excel date serial number check (years 1990 to 2050 -> 32874 to 54786)
    if (val > 30000 && val < 60000) {
      try {
        const utc_days  = Math.floor(val - 25569);
        const utc_value = utc_days * 86400;                                        
        const date_info = new Date(utc_value * 1000);
        if (!isNaN(date_info.getTime())) {
          const y = date_info.getFullYear();
          const m = String(date_info.getMonth() + 1).padStart(2, '0');
          const d = String(date_info.getDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        }
      } catch (err) {}
    }
  }

  // Replace non-breaking spaces or other spaces
  let str = String(val).replace(/[\u00A0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/g, ' ').trim();
  if (!str) return new Date().toISOString().split('T')[0];

  // Raw serial string format check
  if (/^\d{5}(\.\d+)?$/.test(str)) {
    const num = parseFloat(str);
    if (num > 30000 && num < 60000) {
      try {
        const utc_days  = Math.floor(num - 25569);
        const utc_value = utc_days * 86400;                                        
        const date_info = new Date(utc_value * 1000);
        if (!isNaN(date_info.getTime())) {
          const y = date_info.getFullYear();
          const m = String(date_info.getMonth() + 1).padStart(2, '0');
          const d = String(date_info.getDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        }
      } catch (err) {}
    }
  }

  // Try standard Date parsing
  let d = new Date(str);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    if (y > 1900 && y < 2100) {
      return d.toISOString().split('T')[0];
    }
  }

  // Try parsing DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1; // 0-indexed
    const year = parseInt(dmyMatch[3], 10);
    const customDate = new Date(year, month, day);
    if (!isNaN(customDate.getTime())) {
      return customDate.toISOString().split('T')[0];
    }
  }

  // Try parsing YYYY/MM/DD or YYYY-MM-DD
  const ymdMatch = str.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const customDate = new Date(year, month, day);
    if (!isNaN(customDate.getTime())) {
      return customDate.toISOString().split('T')[0];
    }
  }

  // Try DD-MMM-YYYY or DD/MMM/YYYY (e.g., 15-May-2026 or 15/May/2026 or 15 May 2026)
  const dMmmYMatch = str.match(/^(\d{1,2})[/\-. ]([a-zA-Z]{3,10})[/\-. ](\d{4})$/);
  if (dMmmYMatch) {
    const day = parseInt(dMmmYMatch[1], 10);
    const mStr = dMmmYMatch[2].toLowerCase().slice(0, 3);
    const year = parseInt(dMmmYMatch[3], 10);
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const month = months.indexOf(mStr);
    if (month !== -1) {
      const customDate = new Date(year, month, day);
      if (!isNaN(customDate.getTime())) {
        return customDate.toISOString().split('T')[0];
      }
    }
  }

  return new Date().toISOString().split('T')[0];
};

const findHeaderRowIndex = (allRows: any[][]): number => {
  let bestRowIdx = 0;
  let maxScore = 0;

  // Check the first 25 rows
  const rowsToCheck = Math.min(allRows.length, 25);
  for (let i = 0; i < rowsToCheck; i++) {
    const row = allRows[i];
    if (!row || !Array.isArray(row)) continue;

    let score = 0;
    const lowerCells = row.map(c => String(c || '').toLowerCase().trim());
    
    const matchesDate = lowerCells.some(c => HEADER_KEYWORDS.date.some(k => c === k || c.includes(k) || k.includes(c)));
    const matchesDesc = lowerCells.some(c => HEADER_KEYWORDS.description.some(k => c === k || c.includes(k) || k.includes(c)));
    const matchesAmount = lowerCells.some(c => HEADER_KEYWORDS.amount.some(k => c === k || c.includes(k) || k.includes(c)));
    const matchesIncome = lowerCells.some(c => HEADER_KEYWORDS.income.some(k => c === k || c.includes(k) || k.includes(c)));
    const matchesExpense = lowerCells.some(c => HEADER_KEYWORDS.expense.some(k => c === k || c.includes(k) || k.includes(c)));

    if (matchesDate) score += 3.0;
    if (matchesDesc) score += 3.0;
    if (matchesAmount) score += 2.0;
    if (matchesIncome) score += 1.5;
    if (matchesExpense) score += 1.5;

    const matchesCat = lowerCells.some(c => HEADER_KEYWORDS.category.some(k => c === k || c.includes(k) || k.includes(c)));
    const matchesRef = lowerCells.some(c => HEADER_KEYWORDS.reference.some(k => c === k || c.includes(k) || k.includes(c)));
    if (matchesCat) score += 1.0;
    if (matchesRef) score += 1.0;

    if (score > maxScore && score >= 2.0) {
      maxScore = score;
      bestRowIdx = i;
    }
  }

  return maxScore >= 2.0 ? bestRowIdx : 0;
};

export default function ExpenseUpload() {
  const { user, finData, activeBusinessId, businesses, setActiveTab, refreshData } = useApp();
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
  const [newCategorySettings, setNewCategorySettings] = useState<Record<string, { type: 'Income' | 'Expense' | 'Asset' | 'Liability', create: boolean }>>({});
  const [resolutions, setResolutions] = useState<Record<string, { type: 'create' | 'map', target?: string }>>({});
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Import options state (Standard CSV vs Bank Statement Excel with WD split)
  const [importOption, setImportOption] = useState<'csv' | 'bank_excel'>('csv');
  const [showRulesEditor, setShowRulesEditor] = useState(false);
  const [firestoreRules, setFirestoreRules] = useState<any[]>([]);

  // Editing Rule Form States
  const [editingRule, setEditingRule] = useState<any | null>(null);
  const [ruleDescKeyword, setRuleDescKeyword] = useState('');
  const [ruleDescOperator, setRuleDescOperator] = useState<'contains' | 'equals'>('contains');
  const [ruleRefKeyword, setRuleRefKeyword] = useState('');
  const [ruleRefOperator, setRuleRefOperator] = useState<'contains' | 'equals'>('contains');
  const [ruleFlow, setRuleFlow] = useState<'any' | 'withdrawal' | 'deposit'>('any');
  const [ruleCategory, setRuleCategory] = useState('');

  // Local/Firestore rules sync effect
  useEffect(() => {
    if (!user?.uid || !activeBusinessId) {
      setFirestoreRules([]);
      return;
    }
    const q = query(
      collection(db, 'users', user.uid, 'import_rules'),
      where('businessId', '==', activeBusinessId)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setFirestoreRules(list);
    }, (error) => {
      console.warn("Error listening to import rules:", error);
    });
    return () => unsub();
  }, [user?.uid, activeBusinessId]);

  // Combined rule set to evaluate
  const combinedRules = useMemo(() => {
    const list = [...firestoreRules];
    const firestoreIds = new Set(list.map(r => r.id));
    (finData.rules || []).forEach(r => {
      if (!firestoreIds.has(r.id)) {
        list.push(r);
      }
    });
    return list;
  }, [firestoreRules, finData.rules]);

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

  // Income/Expense budgets sorted by Income first, then Expense, then alphabetically.
  const incomeExpenseBudgets = useMemo(() => {
    return finData.budgets
      .filter(b => {
        const type = (b.type || '').toLowerCase();
        return type === 'income' || type === 'expense';
      })
      .sort((a, b) => {
        const typeA = (a.type || '').toLowerCase();
        const typeB = (b.type || '').toLowerCase();
        if (typeA === 'income' && typeB !== 'income') return -1;
        if (typeA !== 'income' && typeB === 'income') return 1;
        const nameA = a.name || '';
        const nameB = b.name || '';
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      });
  }, [finData.budgets]);

  // Calculate high-fidelity totals for user double-checking during bulk transaction reviews
  const previewTotals = useMemo(() => {
    let totalAmountAll = 0;
    let totalAmountSelected = 0;

    let totalIncomeAll = 0;
    let totalIncomeSelected = 0;

    let totalExpenseAll = 0;
    let totalExpenseSelected = 0;

    parsedData.forEach(row => {
      const isSelected = selectedRows.has(row.id);

      // Total Volume is the sum of raw transaction magnitudes
      totalAmountAll += row.amount || 0;
      if (isSelected) {
        totalAmountSelected += row.amount || 0;
      }

      if (wasDualColumnAmount) {
        const valIn = Math.abs(parseRobustFloat(row.srcIncome));
        const valOut = Math.abs(parseRobustFloat(row.srcExpense));

        totalIncomeAll += valIn;
        totalExpenseAll += valOut;

        if (isSelected) {
          totalIncomeSelected += valIn;
          totalExpenseSelected += valOut;
        }
      } else {
        // Single column Mode
        if (row.type === 'Income') {
          totalIncomeAll += row.amount || 0;
          if (isSelected) {
            totalIncomeSelected += row.amount || 0;
          }
        } else {
          totalExpenseAll += row.amount || 0;
          if (isSelected) {
            totalExpenseSelected += row.amount || 0;
          }
        }
      }
    });

    return {
      totalAmountAll,
      totalAmountSelected,
      totalIncomeAll,
      totalIncomeSelected,
      totalExpenseAll,
      totalExpenseSelected
    };
  }, [parsedData, selectedRows, wasDualColumnAmount]);

  const findBestHeader = (headers: string[], keywords: string[]) => {
    return headers.find(h => {
      const lower = h.toLowerCase().trim();
      return keywords.some(k => lower.includes(k) || k.includes(lower));
    });
  };

  const processRawRows = async (rows: any[], headers: string[], aiMappings?: any) => {
    setIsProcessing(true);
    setFeedback({ type: 'success', message: 'Identifying columns with AI...' });
    
    try {
      let dateHeader: string | undefined = undefined;
      let descHeader: string | undefined = undefined;
      let catHeader: string | undefined = undefined;
      let amountHeader: string | undefined = undefined;
      let notesHeader: string | undefined = undefined;
      
      let incomeHeader: string | undefined = undefined;
      let expenseHeader: string | undefined = undefined;

      if (aiMappings) {
        const mapping = aiMappings;
        if (mapping.date) dateHeader = headers.find(h => h === mapping.date || h.toLowerCase().trim() === mapping.date.toLowerCase().trim());
        if (mapping.description) descHeader = headers.find(h => h === mapping.description || h.toLowerCase().trim() === mapping.description.toLowerCase().trim());
        if (mapping.category) catHeader = headers.find(h => h === mapping.category || h.toLowerCase().trim() === mapping.category.toLowerCase().trim());
        if (mapping.amount) amountHeader = headers.find(h => h === mapping.amount || h.toLowerCase().trim() === mapping.amount.toLowerCase().trim());
        if (mapping.reference) notesHeader = headers.find(h => h === mapping.reference || h.toLowerCase().trim() === mapping.reference.toLowerCase().trim());
        if (!notesHeader && mapping.notes) notesHeader = headers.find(h => h === mapping.notes || h.toLowerCase().trim() === mapping.notes.toLowerCase().trim());
        
        if (mapping.withdrawal) expenseHeader = headers.find(h => h === mapping.withdrawal || h.toLowerCase().trim() === mapping.withdrawal.toLowerCase().trim());
        if (mapping.deposit) incomeHeader = headers.find(h => h === mapping.deposit || h.toLowerCase().trim() === mapping.deposit.toLowerCase().trim());
      } else {
        try {
          const sampleRows = rows.slice(0, 4).map(rowObj => {
            return headers.map(h => rowObj[h] !== undefined && rowObj[h] !== null ? String(rowObj[h]) : '');
          });

          const mappingRes = await fetch('/api/delight/mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ headers, sampleRows })
          });

          if (mappingRes.ok) {
            const mapping = await mappingRes.json();
            if (mapping.date) dateHeader = headers.find(h => h === mapping.date || h.toLowerCase().trim() === mapping.date.toLowerCase().trim());
            if (mapping.description) descHeader = headers.find(h => h === mapping.description || h.toLowerCase().trim() === mapping.description.toLowerCase().trim());
            if (mapping.category) catHeader = headers.find(h => h === mapping.category || h.toLowerCase().trim() === mapping.category.toLowerCase().trim());
            if (mapping.amount) amountHeader = headers.find(h => h === mapping.amount || h.toLowerCase().trim() === mapping.amount.toLowerCase().trim());
            if (mapping.notes) notesHeader = headers.find(h => h === mapping.notes || h.toLowerCase().trim() === mapping.notes.toLowerCase().trim());
          }
        } catch (aiErr) {
          console.warn("AI Mapping failed, using keyword fallback", aiErr);
        }
      }

      // Keyword heuristic fallback for unmapped fields
      if (!dateHeader) dateHeader = findBestHeader(headers, HEADER_KEYWORDS.date);
      if (!descHeader) descHeader = findBestHeader(headers, HEADER_KEYWORDS.description);
      if (!catHeader) catHeader = findBestHeader(headers, HEADER_KEYWORDS.category);
      
      if (importOption === 'bank_excel') {
        // Bias explicitly matching Withdrawal & Deposit columns
        expenseHeader = headers.find(h => {
          const l = h.toLowerCase().trim();
          return l === 'withdrawal' || l.includes('withdrawal') || l === 'withdrawal amount' || l === 'withdrwl' || l === 'debit' || l === 'dr';
        });
        incomeHeader = headers.find(h => {
          const l = h.toLowerCase().trim();
          return l === 'deposit' || l.includes('deposit') || l === 'deposit amount' || l === 'credit' || l === 'cr';
        });
        if (incomeHeader || expenseHeader) {
          amountHeader = undefined;
        }
      }

      if (!amountHeader && !incomeHeader && !expenseHeader) {
        amountHeader = findBestHeader(headers, HEADER_KEYWORDS.amount);
        incomeHeader = findBestHeader(headers, HEADER_KEYWORDS.income);
        expenseHeader = findBestHeader(headers, HEADER_KEYWORDS.expense);
      }
      if (!notesHeader) {
        notesHeader = findBestHeader(headers, HEADER_KEYWORDS.reference);
      }

      // Fallback auto-detection if columns are still missing
      const requiredMatches = Math.max(1, Math.min(2, rows.length));

      if (!dateHeader && headers.length > 0) {
        for (const h of headers) {
          const sample = rows.slice(0, 5).map(r => String(r[h] || ''));
          const isDateLike = sample.filter(s => {
            if (!s) return false;
            const d = new Date(s);
            return !isNaN(d.getTime()) && s.length >= 6 && /\d/.test(s);
          }).length >= requiredMatches;
          if (isDateLike) {
            dateHeader = h;
            break;
          }
        }
      }

      if (!amountHeader && !incomeHeader && !expenseHeader && headers.length > 0) {
        for (const h of headers) {
          const sample = rows.slice(0, 5).map(r => parseRobustFloat(r[h]));
          const numericCount = sample.filter(n => n !== 0).length;
          if (numericCount >= requiredMatches) {
            amountHeader = h;
            break;
          }
        }
      }

      if (!descHeader && headers.length > 0) {
        const leftover = headers.filter(h => h !== dateHeader && h !== amountHeader && h !== incomeHeader && h !== expenseHeader);
        if (leftover.length > 0) {
          descHeader = leftover[0];
        }
      }

      setWasDualColumnAmount(!!(incomeHeader && expenseHeader));

      const activeRules = [...combinedRules].sort((a, b) => (a.order || 0) - (b.order || 0)).filter(r => r.active);

      const transactions: ParsedTransaction[] = rows.map((row, idx) => {
        let amount = 0;
        let type = 'Expense';
        let srcIn = '';
        let srcOut = '';

        if (incomeHeader && expenseHeader) {
           srcIn = String(row[incomeHeader] || '');
           srcOut = String(row[expenseHeader] || '');
           const valIn = parseRobustFloat(row[incomeHeader]);
           const valOut = parseRobustFloat(row[expenseHeader]);
           
           if (valIn !== 0) {
             amount = Math.abs(valIn);
             type = 'Income';
           } else if (valOut !== 0) {
             amount = Math.abs(valOut);
             type = 'Expense';
           }
        } else if (amountHeader) {
           const rawVal = parseRobustFloat(row[amountHeader]);
           if (rawVal !== 0) {
             amount = Math.abs(rawVal);
             type = rawVal >= 0 ? 'Income' : 'Expense';
           }
        }

        const rawCategory = (catHeader ? String(row[catHeader] || '') : '').trim();
        const description = (descHeader ? String(row[descHeader] || '') : '').trim() || 'No description';
        
        // Robust date parsing
        const formattedDate = parseRobustDate(dateHeader ? row[dateHeader] : null);

        // Map Notes and collect extra columns
        const notesParts: string[] = [];
        if (notesHeader && row[notesHeader] !== undefined) {
          const notesVal = String(row[notesHeader] || '').trim();
          if (notesVal) {
            notesParts.push(notesVal);
          }
        }

        const mappedHeaders = [
          dateHeader,
          descHeader,
          catHeader,
          amountHeader,
          incomeHeader,
          expenseHeader,
          notesHeader
        ].filter(Boolean) as string[];

        // Add extra columns with column: prefix
        headers.forEach(h => {
          if (!mappedHeaders.includes(h)) {
            const val = String(row[h] || '').trim();
            if (val) {
              notesParts.push(`${h}: ${val}`);
            }
          }
        });

        const finalNotes = notesParts.join(" | ");
        
        let category = '';
        let matchedByRule = false;

        // Apply rules
        for (const rule of activeRules) {
          const isMatch = rule.conditions?.every((cond: any) => {
            if (cond.field === 'description') {
              const fieldVal = String(description || '').toLowerCase();
              const searchVal = String(cond.value || '').toLowerCase();
              return cond.operator === 'equals' ? (fieldVal === searchVal) : fieldVal.includes(searchVal);
            }
            if (cond.field === 'reference') {
              const fieldVal = String(finalNotes || '').toLowerCase();
              const searchVal = String(cond.value || '').toLowerCase();
              return cond.operator === 'equals' ? (fieldVal === searchVal) : fieldVal.includes(searchVal);
            }
            if (cond.field === 'flow') {
              if (cond.value === 'withdrawal') return type === 'Expense';
              if (cond.value === 'deposit') return type === 'Income';
              return true;
            }
            const rawFieldVal = cond.field === 'amount' ? amount : (cond.field === 'description' ? description : '');
            const fieldVal = String(rawFieldVal || '').toLowerCase();
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
            const action = rule.actions?.find((a: any) => a.type === 'setCategory');
            if (action) {
              category = action.value;
              matchedByRule = true;
              break;
            }
          }
        }

        if (!matchedByRule) {
          // If no rules matched, check if rawCategory is a valid existing category
          const catLower = rawCategory.toLowerCase().trim();
          const exists = finData.budgets.some(b => b.name?.toLowerCase().trim() === catLower);
          if (rawCategory && exists) {
            category = rawCategory;
          } else {
            // Categorize as "Income" if deposit & "Expense" if withdrawal
            category = type === 'Income' ? 'Income' : 'Expense';
          }
        }

        const detectedType = categoryTypeMap.get((category || '').toLowerCase()) || type;

        let tx: ParsedTransaction = {
          id: `row-${idx}`,
          date: formattedDate,
          amount,
          description,
          category,
          reference: finalNotes,
          type: detectedType,
          srcIncome: srcIn,
          srcExpense: srcOut
        };

        return tx;
      }).filter(t => !isNaN(t.amount) && t.amount !== 0);

      if (transactions.length === 0) {
        setFeedback({ type: 'error', message: 'No valid transaction rows found in file. Make sure columns contain dates and numeric amounts.' });
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
        const initialSettings: Record<string, { type: 'Income' | 'Expense' | 'Asset' | 'Liability', create: boolean }> = {};
        const initialResolutions: Record<string, { type: 'create' | 'map', target?: string }> = {};
        missing.forEach(name => {
          // Guess type based on data if possible
          const firstTx = transactions.find(t => t.category === name);
          const type = (firstTx?.type === 'Income' || firstTx?.type === 'Asset' || firstTx?.type === 'Liability') 
            ? firstTx.type as any 
            : 'Expense';
          initialSettings[name] = { 
            type,
            create: true 
          };
          initialResolutions[name] = { type: 'create' };
        });
        setNewCategorySettings(initialSettings);
        setResolutions(initialResolutions);
        setStep('resolve');
      } else {
        setSelectedRows(new Set(transactions.map(t => t.id)));
        setStep('preview');
      }
      setFeedback(null);
    } catch (err) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Failed to process file records.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const finalizeResolution = async () => {
    if (!activeBusinessId) return;
    
    // Check if any mapped items don't have a target selected
    const missingMaps: string[] = [];
    unresolvedNames.forEach(name => {
      const res = resolutions[name];
      if (res?.type === 'map' && !res.target) {
        missingMaps.push(name);
      }
    });

    if (missingMaps.length > 0) {
      setFeedback({ type: 'error', message: `Please select an existing category for: ${missingMaps.join(', ')}` });
      return;
    }

    setIsProcessing(true);
    setFeedback({ type: 'success', message: 'Finalizing resolutions and creating categories...' });
    
    try {
      const now = new Date();
      // Find which categories we need to create
      const toCreate: string[] = [];
      Object.entries(resolutions).forEach(([name, res]) => {
        if (res.type === 'create') {
          toCreate.push(name);
        }
      });

      for (const name of toCreate) {
        const type = newCategorySettings[name]?.type || 'Expense';

        try {
          await categoryApi.create(activeBusinessId, {
            name,
            type,
            budget: 0,
            month: now.getMonth() + 1,
            year: now.getFullYear()
          });
        } catch (err) {
          console.error("Failed to create category during mapping finalization:", name, err);
        }
      }

      // Refresh context data so newly created categories appear
      if (typeof refreshData === 'function') {
        await refreshData({ skipRules: true });
      }

      const updated = parsedData.map(tx => {
        const res = resolutions[tx.category];
        if (res) {
          if (res.type === 'map' && res.target) {
            const newType = categoryTypeMap.get((res.target || '').toLowerCase());
            return {
              ...tx,
              category: res.target,
              type: wasDualColumnAmount ? tx.type : (newType || tx.type)
            };
          }
          // If 'create', the parsed transaction category stays the same, as it has now been created in DB
        }
        return tx;
      });

      setParsedData(updated);
      setSelectedRows(new Set(updated.map(t => t.id)));
      setStep('preview');
      setFeedback(null);
    } catch (err) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Failed to finalize resolutions.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const applyRulesToData = () => {
    const activeRules = [...combinedRules].sort((a, b) => (a.order || 0) - (b.order || 0)).filter(r => r.active);
    
    setParsedData(prev => prev.map(tx => {
      let updatedTx = { ...tx };
      
      for (const rule of activeRules) {
        const isMatch = rule.conditions?.every((cond: any) => {
          if (cond.field === 'description') {
            const fieldVal = String(updatedTx.description || '').toLowerCase();
            const searchVal = String(cond.value || '').toLowerCase();
            return cond.operator === 'equals' ? (fieldVal === searchVal) : fieldVal.includes(searchVal);
          }
          if (cond.field === 'reference') {
            const fieldVal = String(updatedTx.reference || '').toLowerCase();
            const searchVal = String(cond.value || '').toLowerCase();
            return cond.operator === 'equals' ? (fieldVal === searchVal) : fieldVal.includes(searchVal);
          }
          if (cond.field === 'flow') {
            if (cond.value === 'withdrawal') return (updatedTx.type || '').toLowerCase() === 'expense';
            if (cond.value === 'deposit') return (updatedTx.type || '').toLowerCase() === 'income';
            return true;
          }
          const rawFieldVal = cond.field === 'amount' ? updatedTx.amount : (cond.field === 'description' ? updatedTx.description : '');
          const fieldVal = String(rawFieldVal || '').toLowerCase();
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
          for (const action of rule.actions || []) {
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
    
    setFeedback({ type: 'success', message: 'Rules applied successfully to pre-import data.' });
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

  const parseTwoDimensionalArray = async (allRows: any[][]) => {
    if (!allRows || allRows.length === 0) {
      throw new Error('No data found in the file.');
    }

    let headerIdx = 0;
    let columnMappings: any = null;
    let dataRowIndices: number[] = [];
    let usedAi = false;

    try {
      setFeedback({ type: 'success', message: 'Identifying columns and rows with AI...' });
      const response = await fetch('/api/delight/bank-statement-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allRows: allRows.slice(0, 60) })
      });

      if (response.ok) {
        const aiResult = await response.json();
        headerIdx = aiResult.headerRowIndex;
        columnMappings = aiResult.columnMappings;
        dataRowIndices = aiResult.dataRowIndices;
        usedAi = true;
      }
    } catch (aiErr) {
      console.warn("AI Bank Statement Mapping failed, falling back to heuristic", aiErr);
    }

    if (!usedAi) {
      headerIdx = findHeaderRowIndex(allRows);
    }

    const headersRow = allRows[headerIdx] || [];
    
    // Assign unique column names to empty or duplicate columns
    const seen = new Set<string>();
    const headers = headersRow.map((h, colIdx) => {
      let name = String(h || '').trim();
      if (!name) {
        name = `Column_${colIdx + 1}`;
      }
      if (seen.has(name)) {
        name = `${name}_${colIdx + 1}`;
      }
      seen.add(name);
      return name;
    });

    if (headers.filter(Boolean).length === 0) {
      throw new Error('Could not automatically determine column headers in the file.');
    }

    // Filter and construct rows from spreadsheet data
    const jsonData = allRows.map((r, rowIndex) => {
      if (rowIndex <= headerIdx) return null;

      if (usedAi && rowIndex < 60) {
        if (!dataRowIndices.includes(rowIndex)) return null;
      }

      // Filter out completely blank rows
      const hasContent = r.some(c => c !== undefined && c !== null && String(c).trim() !== "");
      if (!hasContent) return null;

      const obj: Record<string, any> = {};
      headers.forEach((h, colIdx) => {
        if (h) {
          obj[h] = r[colIdx];
        }
      });
      return obj;
    }).filter(Boolean) as Record<string, any>[];

    if (jsonData.length === 0) {
      throw new Error('No transaction rows were parsed. Ensure rows under the headers have transactions.');
    }

    await processRawRows(jsonData, headers.filter(Boolean), usedAi ? columnMappings : undefined);
  };

  const parseExcel = (file: File) => {
    setIsProcessing(true);
    setFeedback({ type: 'success', message: 'Reading Excel file...' });
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          throw new Error('Failed to read file data.');
        }
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        
        let worksheet = null;
        let selectedSheetName = "";
        
        // Loop through worksheets to find the first one that is NOT blank
        for (const sheetName of workbook.SheetNames) {
          const ws = workbook.Sheets[sheetName];
          const sheetRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" });
          const nonBlank = sheetRows.filter(r => r && r.some(c => String(c || '').trim() !== ""));
          if (nonBlank.length > 0) {
            worksheet = ws;
            selectedSheetName = sheetName;
            break;
          }
        }

        if (!worksheet) {
          throw new Error('Workbook contains no worksheet with records.');
        }
        
        // Retrieve the entire sheet as a raw 2D array of cells
        const sheetRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: "" });

        if (sheetRows.length === 0) {
          throw new Error(`No records found in active Excel worksheet "${selectedSheetName}".`);
        }

        await parseTwoDimensionalArray(sheetRows);
      } catch (err: any) {
        console.error(err);
        setFeedback({ type: 'error', message: err.message || 'Failed to parse Excel file.' });
        setIsProcessing(false);
      }
    };
    reader.onerror = () => {
      setFeedback({ type: 'error', message: 'FileReader error occurred.' });
      setIsProcessing(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileProcess = (file: File) => {
    const fileName = file.name.toLowerCase();
    const isExcelFile = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    const isCsvFile = fileName.endsWith('.csv') || fileName.endsWith('.txt') || fileName.endsWith('.tsv');

    if (!isExcelFile && !isCsvFile) {
      setFeedback({ type: 'error', message: 'Invalid file style! Please select a valid Excel or CSV/Text file.' });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (isExcelFile) {
      parseExcel(file);
    } else {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: async (results) => {
          try {
            let data = results.data as any[][];
            // Check if it appears to have parsed as single column with semicolons or tabs
            if (data.length > 0 && data[0].length === 1) {
              const firstCell = String(data[0][0] || '');
              if (firstCell.includes(';') && !firstCell.includes(',')) {
                Papa.parse(file, {
                  header: false,
                  delimiter: ';',
                  skipEmptyLines: 'greedy',
                  complete: async (retryResults) => {
                    try {
                      await parseTwoDimensionalArray(retryResults.data as any[][]);
                    } catch (err: any) {
                      setFeedback({ type: 'error', message: err.message || 'Failed to parse CSV file with semicolon delimiter.' });
                      setIsProcessing(false);
                    }
                  }
                });
                return;
              } else if (firstCell.includes('\t')) {
                Papa.parse(file, {
                  header: false,
                  delimiter: '\t',
                  skipEmptyLines: 'greedy',
                  complete: async (retryResults) => {
                    try {
                      await parseTwoDimensionalArray(retryResults.data as any[][]);
                    } catch (err: any) {
                      setFeedback({ type: 'error', message: err.message || 'Failed to parse tab-delimited file.' });
                      setIsProcessing(false);
                    }
                  }
                });
                return;
              }
            }
            await parseTwoDimensionalArray(data);
          } catch (err: any) {
            console.error(err);
            setFeedback({ type: 'error', message: err.message || 'Failed to parse CSV file.' });
            setIsProcessing(false);
          }
        }
      });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !activeBusinessId) return;

    setFeedback(null);
    handleFileProcess(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (!file || !user || !activeBusinessId) return;

    setFeedback(null);
    handleFileProcess(file);
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
      
      // Refresh context data so new categories are in finData.budgets list
      if (typeof refreshData === 'function') {
        await refreshData({ skipRules: true });
      }

      setFeedback({ type: 'success', message: `Created ${entries.length} categories.` });
      
      const remainingToMap = unresolvedNames.filter(name => !newCategorySettings[name]?.create);
      if (remainingToMap.length === 0) {
         setSelectedRows(new Set(parsedData.map(t => t.id)));
         setStep('preview');
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

  const downloadBankExcelTemplate = () => {
    const headers = ['Date', 'Description', 'Withdrawal', 'Deposit', 'Reference'];
    const now = new Date();
    const data = [
      { Date: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0], Description: 'Uber Ride Taxi', Withdrawal: 25.50, Deposit: '', Reference: 'TXN-101' },
      { Date: new Date(now.getFullYear(), now.getMonth(), 2).toISOString().split('T')[0], Description: 'Salary Paycheck', Withdrawal: '', Deposit: 3200.00, Reference: 'TXN-102' },
      { Date: new Date(now.getFullYear(), now.getMonth(), 3).toISOString().split('T')[0], Description: 'Starbucks Store Cafe', Withdrawal: 6.80, Deposit: '', Reference: 'TXN-103' },
      { Date: new Date(now.getFullYear(), now.getMonth(), 4).toISOString().split('T')[0], Description: 'Invoice Consulting Fee Received', Withdrawal: '', Deposit: 450.00, Reference: 'TXN-104' },
      { Date: new Date(now.getFullYear(), now.getMonth(), 5).toISOString().split('T')[0], Description: 'Office Supplies Web Store', Withdrawal: 75.00, Deposit: '', Reference: 'TXN-105' }
    ];
    
    const worksheet = XLSX.utils.json_to_sheet(data, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Bank Template");
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "bank_excel_template.xlsx");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!ruleId || !user?.uid) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'import_rules', ruleId));
      setFeedback({ type: 'success', message: 'Rule deleted successfully.' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      console.error("Failed to delete rule:", err);
      setFeedback({ type: 'error', message: 'Failed to delete rule.' });
    }
  };

  const handleSaveRule = async (rule: any) => {
    if (!user?.uid || !activeBusinessId) return;
    try {
      const ruleData = {
        name: rule.name || `${rule.conditions[0]?.value || 'Rule'} → ${rule.actions[0]?.value}`,
        active: true,
        businessId: activeBusinessId,
        userId: user.uid,
        conditions: rule.conditions || [
          { field: 'description', operator: 'contains', value: '' }
        ],
        actions: rule.actions || [
          { type: 'setCategory', value: '' }
        ],
        updatedAt: new Date().toISOString()
      };

      if (rule.id) {
        await setDoc(doc(db, 'users', user.uid, 'import_rules', rule.id), ruleData, { merge: true });
        
        await logEvent({
          userId: user.uid,
          userEmail: user.email || 'unknown',
          userName: user.displayName || 'Delight User',
          action: 'UPDATE',
          resourceType: 'import_rule',
          details: `Updated import rule: ${ruleData.name}`
        });
      } else {
        await addDoc(collection(db, 'users', user.uid, 'import_rules'), {
          ...ruleData,
          order: combinedRules.length,
          createdAt: new Date().toISOString()
        });

        await logEvent({
          userId: user.uid,
          userEmail: user.email || 'unknown',
          userName: user.displayName || 'Delight User',
          action: 'CREATE',
          resourceType: 'import_rule',
          details: `Created import rule: ${ruleData.name}`
        });
      }
      setFeedback({ type: 'success', message: 'Rule saved successfully.' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      console.error("Failed to save rule:", err);
      setFeedback({ type: 'error', message: 'Failed to save rule in Firestore.' });
    }
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
                         step === 'resolve' ? 'Step 2: Map or Create Categories' : 'Step 3: Preview records'}
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
                    {/* Option Selector */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Option 1: Standard CSV Import */}
                      <button
                        type="button"
                        onClick={() => {
                          setImportOption('csv');
                          setFeedback(null);
                        }}
                        className={cn(
                          "p-4 rounded-xl border-2 text-left transition-all flex items-start gap-3 outline-none cursor-pointer",
                          importOption === 'csv'
                            ? "border-[#86BC24] bg-green-50/10 shadow-sm"
                            : "border-slate-100 hover:border-slate-200 bg-white"
                        )}
                      >
                        <div className={cn(
                          "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                          importOption === 'csv' ? "bg-[#86BC24] text-white" : "bg-slate-100 text-slate-500"
                        )}>
                          <FileText size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900 font-sans tracking-tight">Standard CSV Import</p>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">Import generic CSV file with Date, Category, and single Amount column.</p>
                        </div>
                      </button>

                      {/* Option 2: Bank Statement Excel Import */}
                      <button
                        type="button"
                        onClick={() => {
                          setImportOption('bank_excel');
                          setFeedback(null);
                        }}
                        className={cn(
                          "p-4 rounded-xl border-2 text-left transition-all flex items-start gap-3 outline-none cursor-pointer",
                          importOption === 'bank_excel'
                            ? "border-[#86BC24] bg-green-50/10 shadow-sm"
                            : "border-slate-100 hover:border-slate-200 bg-white"
                        )}
                      >
                        <div className={cn(
                          "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                          importOption === 'bank_excel' ? "bg-[#86BC24] text-white" : "bg-slate-100 text-slate-500"
                        )}>
                          <Table size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900 font-sans tracking-tight">Bank Statement Import</p>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">Import bank statements with separate Withdrawal & Deposit columns.</p>
                        </div>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="p-4 bg-[#F8FAFC] border border-slate-100 rounded-xl space-y-4">
                          <div>
                            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest mb-3 flex items-center gap-2">
                              <HelpCircle size={14} className="text-[#86BC24]" />
                              Instructions
                            </h3>
                            <ul className="space-y-2">
                              {importOption === 'csv' ? (
                                [
                                  'Upload any CSV or Text file containing list of expenses.',
                                  'Columns are automatically mapped (Date, Amount, Category, Description).',
                                  'Ideal for standard transaction logs and basic sheets.',
                                  'Existing categories are automatically detected and matched.'
                                ].map((text, i) => (
                                  <li key={i} className="text-[11px] text-slate-500 flex gap-2">
                                    <span className="text-[#86BC24]">•</span>
                                    {text}
                                  </li>
                                ))
                              ) : (
                                [
                                  'Upload a bank statement spreadsheet (.xlsx, .xls) or dual-column CSV.',
                                  'Supports separate Withdrawal and Deposit / Debit and Credit columns.',
                                  'Configure automated rules to auto-categorize based on details & amounts.',
                                  'Manage with Rules Manager next to template download.'
                                ].map((text, i) => (
                                  <li key={i} className="text-[11px] text-slate-500 flex gap-2">
                                    <span className="text-[#86BC24]">•</span>
                                    {text}
                                  </li>
                                ))
                              )}
                            </ul>
                          </div>

                          <div className="pt-3 border-t border-slate-150 flex flex-wrap items-center gap-4">
                            {importOption === 'csv' ? (
                              <button 
                                type="button"
                                onClick={downloadSampleCSV}
                                className="text-[10px] font-bold uppercase tracking-widest text-[#86BC24] hover:underline flex items-center gap-2"
                              >
                                <FileText size={12} />
                                Download Sample CSV
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={downloadBankExcelTemplate}
                                  className="text-[10px] font-bold uppercase tracking-widest text-[#86BC24] hover:underline flex items-center gap-2"
                                >
                                  <Table size={12} />
                                  Download Bank Statement Template
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setShowRulesEditor(true)}
                                  className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 hover:underline flex items-center gap-1.5"
                                >
                                  <Settings2 size={12} />
                                  Rules Manager
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Sample Column Structure Preview */}
                        <div className="border border-slate-150 rounded-xl p-4 bg-white/60 space-y-3 shadow-xs">
                          <div className="flex items-center justify-between">
                            <h4 className="text-[10px] items-center gap-1.5 font-bold uppercase tracking-widest text-slate-500 font-mono flex">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#86BC24]" />
                              Sample {importOption === 'csv' ? 'CSV' : 'Excel'} Column Structure
                            </h4>
                            <span className="text-[9px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider font-mono">
                              {importOption === 'csv' ? 'Single Amount' : 'Dual Amount'}
                            </span>
                          </div>

                          <div className="overflow-x-auto rounded-lg border border-slate-150 bg-white">
                            <table className="w-full text-left border-collapse text-[10px] font-mono">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-150">
                                  {importOption === 'csv' ? (
                                    <>
                                      <th className="px-2.5 py-1.5 text-slate-600 font-bold whitespace-nowrap">Date</th>
                                      <th className="px-2.5 py-1.5 text-slate-600 font-bold whitespace-nowrap">Category</th>
                                      <th className="px-2.5 py-1.5 text-slate-600 font-bold whitespace-nowrap">Amount</th>
                                      <th className="px-2.5 py-1.5 text-slate-600 font-bold whitespace-nowrap">Description</th>
                                    </>
                                  ) : (
                                    <>
                                      <th className="px-2.5 py-1.5 text-slate-600 font-bold whitespace-nowrap">Date</th>
                                      <th className="px-2.5 py-1.5 text-slate-600 font-bold whitespace-nowrap">Description</th>
                                      <th className="px-2.5 py-1.5 text-[#f43f5e] font-bold whitespace-nowrap">Withdrawal</th>
                                      <th className="px-2.5 py-1.5 text-[#10b981] font-bold whitespace-nowrap">Deposit</th>
                                      <th className="px-2.5 py-1.5 text-slate-600 font-bold whitespace-nowrap">Category</th>
                                    </>
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {importOption === 'csv' ? (
                                  <>
                                    <tr className="border-b border-slate-100 text-slate-500 hover:bg-slate-50/50">
                                      <td className="px-2.5 py-1.5 whitespace-nowrap">2026-06-05</td>
                                      <td className="px-2.5 py-1.5 whitespace-nowrap">Food & Dining</td>
                                      <td className="px-2.5 py-1.5 font-bold text-slate-700 whitespace-nowrap">-14.50</td>
                                      <td className="px-2.5 py-1.5 whitespace-nowrap">Bistro Lunch</td>
                                    </tr>
                                    <tr className="text-slate-500 hover:bg-slate-50/50">
                                      <td className="px-2.5 py-1.5 whitespace-nowrap">2026-06-04</td>
                                      <td className="px-2.5 py-1.5 whitespace-nowrap">Software</td>
                                      <td className="px-2.5 py-1.5 font-bold text-slate-700 whitespace-nowrap">-29.00</td>
                                      <td className="px-2.5 py-1.5 whitespace-nowrap">SaaS Cloud</td>
                                    </tr>
                                  </>
                                ) : (
                                  <>
                                    <tr className="border-b border-slate-100 text-slate-500 hover:bg-slate-50/50">
                                      <td className="px-2.5 py-1.5 whitespace-nowrap">2026-06-05</td>
                                      <td className="px-2.5 py-1.5 whitespace-nowrap">Payroll Direct</td>
                                      <td className="px-2.5 py-1.5 text-slate-300">-</td>
                                      <td className="px-2.5 py-1.5 font-bold text-[#10b981] whitespace-nowrap">+2500.00</td>
                                      <td className="px-2.5 py-1.5 whitespace-nowrap">Income</td>
                                    </tr>
                                    <tr className="text-slate-500 hover:bg-slate-50/50">
                                      <td className="px-2.5 py-1.5 whitespace-nowrap">2026-06-04</td>
                                      <td className="px-2.5 py-1.5 whitespace-nowrap">Grocery Store</td>
                                      <td className="px-2.5 py-1.5 font-bold text-[#f43f5e] whitespace-nowrap">85.20</td>
                                      <td className="px-2.5 py-1.5 text-slate-300">-</td>
                                      <td className="px-2.5 py-1.5 whitespace-nowrap">Groceries</td>
                                    </tr>
                                  </>
                                )}
                              </tbody>
                            </table>
                          </div>
                          <p className="text-[10px] text-slate-400 italic">
                            💡 {importOption === 'csv' 
                              ? "Smart mapping matches various header variants (e.g. 'Amt', 'Tx Date')."
                              : "Dual column mode automatically map Debit/Withdrawal as expenses & Credit/Deposit as income."}
                          </p>
                        </div>
                      </div>

                      <div 
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={cn(
                          "border-2 border-dashed rounded-2xl p-12 text-center transition-all flex flex-col items-center justify-center relative overflow-hidden",
                          isDragging 
                            ? "border-[#86BC24] bg-green-50/30 scale-[1.01] shadow-md shadow-[#86BC24]/5" 
                            : "border-slate-200 hover:border-slate-350"
                        )}
                      >
                        <div className={cn(
                          "w-16 h-16 rounded-2xl flex items-center justify-center mb-6 transition-all duration-300",
                          isDragging ? "bg-white text-[#86BC24] shadow-sm animate-pulse" : "bg-slate-50 text-slate-400"
                        )}>
                          <UploadCloud size={28} />
                        </div>
                        
                        <div className="space-y-4">
                          <button 
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-8 py-3 bg-[#86BC24] text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-[#75a61f] transition-all shadow-lg shadow-[#86BC24]/20 flex items-center gap-2 mx-auto"
                          >
                            <UploadCloud size={16} />
                            Select File
                          </button>

                          <p className={cn(
                            "text-[10px] uppercase font-bold tracking-widest transition-colors pt-2",
                            isDragging ? "text-[#86BC24]" : "text-slate-400"
                          )}>
                            {isDragging ? 'Drop file now' : `or drag and drop ${importOption === 'csv' ? 'CSV' : 'Excel statement'} here`}
                          </p>
                        </div>

                        <input 
                          type="file" 
                          accept={importOption === 'csv' ? '.csv, .txt' : '.xlsx, .xls, .csv'} 
                          className="hidden" 
                          ref={fileInputRef} 
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
                ) : step === 'resolve' ? (
                  <div className="space-y-6 animate-in fade-in duration-200">
                    <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-3">
                      <Settings2 size={20} className="text-indigo-600" />
                      <div>
                        <h4 className="text-sm font-bold text-indigo-900 font-sans tracking-tight">Resolve Unresolved Categories</h4>
                        <p className="text-xs text-indigo-700">We found categories in your file that do not exist in your books. For each, choose whether to create a new category or map it to an existing one.</p>
                      </div>
                    </div>

                    <div className="border border-slate-100 rounded-xl shadow-sm overflow-hidden bg-white">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-100">
                          <tr>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-1/4">Category in File</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-1/3 text-center">Resolution Action</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-5/12">Configuration</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {unresolvedNames.map(name => {
                            const currentRes = resolutions[name] || { type: 'create' };
                            const isCreate = currentRes.type === 'create';
                            const targetVal = currentRes.target || '';
                            const selectedType = newCategorySettings[name]?.type || 'Expense';
                            
                            return (
                              <tr key={name} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-6 py-4">
                                  <span className="text-sm font-bold text-slate-900">{name}</span>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center justify-center gap-2 bg-slate-100 p-1 rounded-lg w-fit mx-auto">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setResolutions(prev => ({ ...prev, [name]: { type: 'create' } }));
                                        setNewCategorySettings(prev => ({ ...prev, [name]: { ...prev[name], create: true } }));
                                      }}
                                      className={cn(
                                        "px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                                        isCreate
                                          ? "bg-white text-slate-900 shadow-sm font-bold"
                                          : "text-slate-500 hover:text-slate-800"
                                      )}
                                    >
                                      Create New
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setResolutions(prev => ({ ...prev, [name]: { type: 'map', target: targetVal } }));
                                        setNewCategorySettings(prev => ({ ...prev, [name]: { ...prev[name], create: false } }));
                                      }}
                                      className={cn(
                                        "px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                                        !isCreate
                                          ? "bg-white text-slate-900 shadow-sm font-bold"
                                          : "text-slate-500 hover:text-slate-800"
                                      )}
                                    >
                                      Map to Existing
                                    </button>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  {isCreate ? (
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button 
                                        type="button"
                                        onClick={() => setNewCategorySettings(prev => ({ ...prev, [name]: { ...prev[name], type: 'Income' } }))}
                                        className={cn(
                                          "px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider border transition-all",
                                          selectedType === 'Income'
                                            ? "bg-green-600 text-white border-green-600 shadow-sm"
                                            : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"
                                        )}
                                      >
                                        Income
                                      </button>
                                      <button 
                                        type="button"
                                        onClick={() => setNewCategorySettings(prev => ({ ...prev, [name]: { ...prev[name], type: 'Expense' } }))}
                                        className={cn(
                                          "px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider border transition-all",
                                          selectedType === 'Expense'
                                            ? "bg-red-600 text-white border-red-600 shadow-sm"
                                            : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"
                                        )}
                                      >
                                        Expense
                                      </button>
                                      <button 
                                        type="button"
                                        onClick={() => setNewCategorySettings(prev => ({ ...prev, [name]: { ...prev[name], type: 'Asset' } }))}
                                        className={cn(
                                          "px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider border transition-all",
                                          selectedType === 'Asset'
                                            ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                            : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"
                                        )}
                                      >
                                        Asset
                                      </button>
                                      <button 
                                        type="button"
                                        onClick={() => setNewCategorySettings(prev => ({ ...prev, [name]: { ...prev[name], type: 'Liability' } }))}
                                        className={cn(
                                          "px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider border transition-all",
                                          selectedType === 'Liability'
                                            ? "bg-orange-600 text-white border-orange-600 shadow-sm"
                                            : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"
                                        )}
                                      >
                                        Liability
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="relative w-full max-w-[280px]">
                                      {(() => {
                                        const resolvedType = (incomeExpenseBudgets.find(b => (b.category || b.name) === targetVal)?.type || 'Expense').toLowerCase();
                                        const isInc = resolvedType === 'income';
                                        return (
                                          <select 
                                            value={targetVal}
                                            onChange={(e) => setResolutions(prev => ({ ...prev, [name]: { type: 'map', target: e.target.value } }))}
                                            className={cn(
                                              "w-full px-3 py-1.5 bg-white border rounded-lg text-xs font-bold outline-none appearance-none pr-8 transition-all",
                                              targetVal ? (isInc ? "border-green-300 text-green-700 bg-green-50/20" : "border-red-300 text-red-700 bg-red-50/20") : "border-slate-200 text-slate-500"
                                            )}
                                          >
                                            <option value="">Choose matching budget...</option>
                                            {incomeExpenseBudgets.map(b => {
                                              const bIsInc = (b.type || '').toLowerCase() === 'income';
                                              return (
                                                <option 
                                                  key={b.id} 
                                                  value={b.category || b.name}
                                                  style={{ color: bIsInc ? '#10b981' : '#f43f5e' }}
                                                >
                                                  {bIsInc ? '🟢' : '🔴'} {b.category || b.name} ({b.type || 'Expense'})
                                                </option>
                                              );
                                            })}
                                          </select>
                                        );
                                      })()}
                                      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                        <ArrowDown size={10} />
                                      </div>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {feedback && step === 'resolve' && (
                      <div className={cn(
                        "p-4 rounded-xl flex items-center gap-3 animate-in fade-in duration-200",
                        feedback.type === 'success' ? "bg-green-50 text-green-700 border border-green-100" : "bg-red-50 text-red-700 border border-red-100"
                      )}>
                        {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                        <p className="text-sm font-medium">{feedback.message}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Pre-import Preview Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 border border-slate-150 p-4 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                          <Settings2 size={16} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">Pre-Import Automation Toolbar</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-0.5">Edit rules and test matches before finalizing import</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowRulesEditor(true)}
                          className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
                        >
                          <Settings2 size={14} className="text-[#86BC24]" />
                          Rules Manager
                        </button>
                        
                        <button
                          type="button"
                          onClick={applyRulesToData}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
                        >
                          <RefreshCw size={14} />
                          Apply Rules
                        </button>
                      </div>
                    </div>

                    {/* Pre-import Preview Totals Summary Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 bg-gradient-to-br from-slate-50 to-white border border-slate-150 p-5 rounded-2xl shadow-sm">
                      <div className="space-y-2 p-4 bg-slate-50/55 rounded-xl border border-slate-100/80 hover:shadow-sm transition-all duration-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Gross Transaction Volume</p>
                          </div>
                          <span className="text-[8px] bg-indigo-50 border border-indigo-100/50 text-indigo-600 px-1.5 py-0.5 rounded-md font-black uppercase">Vol</span>
                        </div>
                        <div className="flex items-end justify-between pt-1">
                          <div>
                            <p className="text-xl font-black text-slate-800 leading-none">
                              {formatCurrency(previewTotals.totalAmountSelected, currencyCode)}
                            </p>
                            <p className="text-[9px] text-slate-400 font-bold mt-1">
                              Selected ({selectedRows.size} of {parsedData.length} rows)
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold text-slate-500 font-mono">
                              {formatCurrency(previewTotals.totalAmountAll, currencyCode)}
                            </p>
                            <p className="text-[9px] text-slate-400 font-bold">Total in File</p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 p-4 bg-emerald-50/15 rounded-xl border border-emerald-100/30 hover:shadow-sm transition-all duration-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Total Deposits / Income</p>
                          </div>
                          <span className="text-[8px] bg-emerald-50 border border-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md font-black uppercase">Inflow</span>
                        </div>
                        <div className="flex items-end justify-between pt-1">
                          <div>
                            <p className="text-xl font-black text-emerald-800 leading-none">
                              {formatCurrency(previewTotals.totalIncomeSelected, currencyCode)}
                            </p>
                            <p className="text-[9px] text-emerald-600/80 font-bold mt-1">
                              Selected
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold text-emerald-600 font-mono/80">
                              {formatCurrency(previewTotals.totalIncomeAll, currencyCode)}
                            </p>
                            <p className="text-[9px] text-emerald-400 font-bold">Total in File</p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 p-4 bg-rose-50/15 rounded-xl border border-rose-100/30 hover:shadow-sm transition-all duration-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            <p className="text-[10px] font-bold text-rose-700 uppercase tracking-wider">Total Withdrawals / Expenses</p>
                          </div>
                          <span className="text-[8px] bg-rose-50 border border-rose-100 text-rose-700 px-1.5 py-0.5 rounded-md font-black uppercase">Outflow</span>
                        </div>
                        <div className="flex items-end justify-between pt-1">
                          <div>
                            <p className="text-xl font-black text-rose-800 leading-none">
                              {formatCurrency(previewTotals.totalExpenseSelected, currencyCode)}
                            </p>
                            <p className="text-[9px] text-rose-600/80 font-bold mt-1">
                              Selected
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold text-rose-600 font-mono/80">
                              {formatCurrency(previewTotals.totalExpenseAll, currencyCode)}
                            </p>
                            <p className="text-[9px] text-rose-400 font-bold">Total in File</p>
                          </div>
                        </div>
                      </div>
                    </div>
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
                                           "text-red-700 border-red-200 bg-red-50/30"
                                         ),
                                         "focus:border-[#86BC24]"
                                       )}
                                     >
                                        <option value="">Select Category...</option>
                                        {incomeExpenseBudgets.map(b => {
                                          const isInc = (b.type || '').toLowerCase() === 'income';
                                          return (
                                            <option key={b.id} value={b.category || b.name} style={{ color: isInc ? '#10b981' : '#f43f5e' }}>
                                              {isInc ? '🟢' : '🔴'} {b.category || b.name} ({b.type || 'Expense'})
                                            </option>
                                          );
                                        })}
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
                         <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-slate-800 text-xs shadow-[0_-2px_6px_rgba(0,0,0,0.02)] sticky bottom-0">
                           <tr>
                             <td className="px-4 py-3.5"></td>
                             <td className="px-4 py-3.5"></td>
                             <td className="px-4 py-3.5">
                               <div className="leading-tight">
                                 <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">selected / total in file</p>
                                 <p className="text-[9px] text-slate-400 font-bold">({selectedRows.size} of {parsedData.length} rows)</p>
                               </div>
                             </td>
                             <td className="px-4 py-3.5"></td>
                             <td className="px-4 py-3.5"></td>
                             {wasDualColumnAmount && (
                               <>
                                 <td className="px-4 py-3.5 text-right font-bold text-emerald-700 font-mono whitespace-nowrap bg-emerald-50/10">
                                   <div>{formatCurrency(previewTotals.totalIncomeSelected, currencyCode)}</div>
                                   <div className="text-[8px] text-slate-400 font-bold mt-0.5">File: {formatCurrency(previewTotals.totalIncomeAll, currencyCode)}</div>
                                 </td>
                                 <td className="px-4 py-3.5 text-right font-bold text-rose-700 font-mono whitespace-nowrap bg-rose-50/10">
                                   <div>{formatCurrency(previewTotals.totalExpenseSelected, currencyCode)}</div>
                                   <div className="text-[8px] text-slate-400 font-bold mt-0.5">File: {formatCurrency(previewTotals.totalExpenseAll, currencyCode)}</div>
                                 </td>
                               </>
                             )}
                             <td className="px-4 py-3.5 text-right font-bold text-indigo-700 font-mono whitespace-nowrap bg-indigo-50/10">
                               <div>{formatCurrency(previewTotals.totalAmountSelected, currencyCode)}</div>
                               <div className="text-[8px] text-slate-400 font-bold mt-0.5">File: {formatCurrency(previewTotals.totalAmountAll, currencyCode)}</div>
                             </td>
                             <td className="px-2 py-3.5"></td>
                           </tr>
                         </tfoot>
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
                        if (step === 'preview') {
                          if (unresolvedNames.length > 0) {
                            setStep('resolve');
                          } else {
                            setStep('upload');
                          }
                        } else {
                          setStep('upload');
                        }
                      }}
                      className="px-6 py-2.5 h-10 bg-orange-50 text-orange-600 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-orange-100 transition-all flex items-center gap-2"
                    >
                      <ChevronLeft size={16} />
                      Back
                    </button>
                  )}
                  {step === 'resolve' ? (
                     <button 
                      onClick={finalizeResolution}
                      disabled={isProcessing}
                      className="px-8 h-10 bg-[#86BC24] hover:bg-[#75A51F] text-white rounded-lg font-bold text-[10px] uppercase tracking-widest shadow-sm flex items-center gap-2"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          Continue to Preview
                          <ChevronRight size={16} />
                        </>
                      )}
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

      {/* Interactive Pre-Import Rules Manager Overlay */}
      {showRulesEditor && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-slate-100">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-150 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#86BC24]/10 flex items-center justify-center text-[#86BC24]">
                  <Settings2 size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Pre-Import Rules Manager</h3>
                  <p className="text-xs text-slate-500 font-medium">Create global rules to auto-categorize bank transactions by description and reference filters</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowRulesEditor(false);
                  setEditingRule(null);
                }}
                className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Split Screen Panel */}
            <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-slate-150">
              {/* Left Column: Rule list */}
              <div className="col-span-1 md:col-span-2 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Active Rules ({combinedRules.length})</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRule({
                        id: '',
                        name: '',
                        conditions: [],
                        actions: [{ type: 'setCategory', value: '' }]
                      });
                      setRuleDescKeyword('');
                      setRuleDescOperator('contains');
                      setRuleRefKeyword('');
                      setRuleRefOperator('contains');
                      setRuleFlow('any');
                      setRuleCategory('');
                    }}
                    className="text-[10px] bg-slate-900 text-white font-bold uppercase tracking-widest px-2.5 py-1 rounded hover:bg-[#86BC24] transition-colors cursor-pointer"
                  >
                    + Add New Rule
                  </button>
                </div>

                <div className="space-y-2">
                  {combinedRules.map((rule, index) => {
                    const descCond = rule.conditions?.find((c: any) => c.field === 'description');
                    const refCond = rule.conditions?.find((c: any) => c.field === 'reference');
                    const flowCond = rule.conditions?.find((c: any) => c.field === 'flow');
                    const amtCond = rule.conditions?.find((c: any) => c.field === 'amount'); // legacy fallback
                    const catAction = rule.actions?.find((a: any) => a.type === 'setCategory');
                    const isSystem = !rule.userId;

                    let subtitleParts: string[] = [];
                    if (descCond?.value) subtitleParts.push(`Desc: "${descCond.value}"`);
                    if (refCond?.value) subtitleParts.push(`Ref: "${refCond.value}"`);
                    if (flowCond?.value && flowCond.value !== 'any') {
                      subtitleParts.push(flowCond.value === 'withdrawal' ? 'Withdrawals' : 'Deposits');
                    }
                    if (amtCond?.value) subtitleParts.push(`Amt ${amtCond.operator} ${amtCond.value}`);

                    const displayName = rule.name || (subtitleParts.length > 0 ? subtitleParts.join(' & ') : 'General Rule');
                    
                    return (
                      <div 
                        key={rule.id || index}
                        onClick={() => {
                          setEditingRule(rule);
                          setRuleDescKeyword(descCond?.value || '');
                          setRuleDescOperator((descCond?.operator === 'equals' ? 'equals' : 'contains') as 'contains' | 'equals');
                          setRuleRefKeyword(refCond?.value || '');
                          setRuleRefOperator((refCond?.operator === 'equals' ? 'equals' : 'contains') as 'contains' | 'equals');
                          setRuleFlow((flowCond?.value || 'any') as 'any' | 'withdrawal' | 'deposit');
                          setRuleCategory(catAction?.value || '');
                        }}
                        className={cn(
                          "p-3 rounded-xl border text-left transition-all cursor-pointer group relative",
                          editingRule?.id === rule.id
                            ? "bg-white border-indigo-500 shadow-md shadow-indigo-500/5 ring-1 ring-indigo-500"
                            : "bg-white border-slate-200 hover:border-slate-350"
                        )}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <p className="text-xs font-bold text-slate-800 tracking-tight line-clamp-1">{displayName}</p>
                          {isSystem ? (
                            <span className="text-[8px] bg-sky-50 text-sky-600 font-bold uppercase tracking-wider px-1 py-0.5 rounded border border-sky-100 shrink-0">System</span>
                          ) : (
                            <span className="text-[8px] bg-indigo-50 text-indigo-600 font-bold uppercase tracking-wider px-1 py-0.5 rounded border border-indigo-100 shrink-0">Custom</span>
                          )}
                        </div>

                        <div className="mt-2 space-y-1 text-[10px] text-slate-500">
                          {descCond && descCond.value && (
                            <p className="flex items-center gap-1">
                              <span className="font-semibold text-slate-400">If description:</span> 
                              <span className="text-slate-800 font-mono bg-slate-100 px-1 rounded">{descCond.operator} "{descCond.value}"</span>
                            </p>
                          )}
                          {refCond && refCond.value && (
                            <p className="flex items-center gap-1">
                              <span className="font-semibold text-slate-400">If reference:</span> 
                              <span className="text-slate-800 font-mono bg-slate-100 px-1 rounded">{refCond.operator} "{refCond.value}"</span>
                            </p>
                          )}
                          {flowCond && flowCond.value && flowCond.value !== 'any' && (
                            <p className="flex items-center gap-1">
                              <span className="font-semibold text-slate-400">If type:</span> 
                              <span className="text-slate-800 font-bold bg-slate-100 px-1 rounded uppercase min-w-[50px] text-center text-[9px] text-[#86BC24]">
                                {flowCond.value === 'withdrawal' ? 'Withdrawal' : 'Deposit'}
                              </span>
                            </p>
                          )}
                          {amtCond && (
                            <p className="flex items-center gap-1">
                              <span className="font-semibold text-slate-400">If amount:</span> 
                              <span className="text-slate-800 font-mono bg-slate-100 px-1 rounded">{amtCond.operator} {amtCond.value}</span>
                            </p>
                          )}
                          <p className="flex items-center gap-1 pt-1 border-t border-slate-100/60 mt-1">
                            <span className="font-semibold text-[#86BC24]">Assign:</span> 
                            <span className="text-emerald-700 font-bold">{catAction?.value || '(none)'}</span>
                          </p>
                        </div>

                        {!isSystem && rule.id && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteRule(rule.id);
                              if (editingRule?.id === rule.id) setEditingRule(null);
                            }}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 w-5 h-5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 flex items-center justify-center transition-all bg-white shadow-sm border border-slate-100"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  
                  {combinedRules.length === 0 && (
                    <div className="text-center py-12 text-slate-400">
                      <Settings2 className="mx-auto text-slate-300 mb-2" size={24} />
                      <p className="text-xs">No active automation rules found.</p>
                      <p className="text-[10px] text-slate-400 mt-1">Click "+ Add New" to configure a mapping rule.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Add/Edit Panel */}
              <div className="col-span-1 md:col-span-3 p-6 overflow-y-auto space-y-4">
                {editingRule ? (() => {
                  const isSaveDisabled = ruleDescKeyword.trim() === '' && ruleRefKeyword.trim() === '' && ruleFlow === 'any';
                  
                  const ruleGeneratedName = (() => {
                    const parts: string[] = [];
                    if (ruleDescKeyword.trim() !== '') {
                      const opLabel = ruleDescOperator === 'equals' ? 'equals' : 'contains';
                      parts.push(`Desc ${opLabel} "${ruleDescKeyword.trim()}"`);
                    }
                    if (ruleRefKeyword.trim() !== '') {
                      const opLabel = ruleRefOperator === 'equals' ? 'equals' : 'contains';
                      parts.push(`Ref ${opLabel} "${ruleRefKeyword.trim()}"`);
                    }
                    if (ruleFlow === 'withdrawal') {
                      parts.push('is Withdrawal');
                    } else if (ruleFlow === 'deposit') {
                      parts.push('is Deposit');
                    }
                    return parts.join(' & ') || 'Custom Filter';
                  })();

                  return (
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      const conditions: any[] = [];
                      if (ruleDescKeyword.trim() !== '') {
                        conditions.push({ field: 'description', operator: ruleDescOperator, value: ruleDescKeyword.trim() });
                      }
                      if (ruleRefKeyword.trim() !== '') {
                        conditions.push({ field: 'reference', operator: ruleRefOperator, value: ruleRefKeyword.trim() });
                      }
                      if (ruleFlow !== 'any') {
                        conditions.push({ field: 'flow', operator: 'equals', value: ruleFlow });
                      }

                      if (conditions.length === 0) {
                        return;
                      }

                      const actions = [
                        { type: 'setCategory', value: ruleCategory }
                      ];

                      handleSaveRule({
                        id: editingRule.id,
                        name: ruleGeneratedName,
                        conditions,
                        actions
                      });
                      
                      setEditingRule(null);
                    }} className="space-y-4">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                        {editingRule.id ? 'Edit Auto-Mapping Rule' : 'Create New Auto-Mapping Rule'}
                      </p>

                      {/* Filter 1: Description text matching */}
                      <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-150 space-y-3">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block" />
                          Filter 1: Matches Description Text
                        </p>
                        
                        <div className="grid grid-cols-3 gap-2">
                          <select
                            value={ruleDescOperator}
                            onChange={(e: any) => setRuleDescOperator(e.target.value)}
                            className="col-span-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white outline-none focus:border-[#86BC24] cursor-pointer font-sans"
                          >
                            <option value="contains">Contains</option>
                            <option value="equals">Equals</option>
                          </select>

                          <input 
                            type="text"
                            value={ruleDescKeyword}
                            onChange={(e) => setRuleDescKeyword(e.target.value)}
                            placeholder="Optional keyword (e.g. uber, starbucks)"
                            className="col-span-2 px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white outline-none focus:border-[#86BC24]"
                          />
                        </div>
                      </div>

                      {/* Filter 2: Reference keyword matching */}
                      <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-150 space-y-3">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-505 bg-blue-500 inline-block" />
                          Filter 2: Matches Reference Text
                        </p>
                        
                        <div className="grid grid-cols-3 gap-2">
                          <select
                            value={ruleRefOperator}
                            onChange={(e: any) => setRuleRefOperator(e.target.value)}
                            className="col-span-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white outline-none focus:border-[#86BC24] cursor-pointer font-sans"
                          >
                            <option value="contains">Contains</option>
                            <option value="equals">Equals</option>
                          </select>

                          <input 
                            type="text"
                            value={ruleRefKeyword}
                            onChange={(e) => setRuleRefKeyword(e.target.value)}
                            placeholder="Optional keyword or ref ID"
                            className="col-span-2 px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white outline-none focus:border-[#86BC24]"
                          />
                        </div>
                      </div>

                      {/* Filter 3: Flow type chooser (radio buttons) */}
                      <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-150 space-y-3">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                          Filter 3: Transaction Type Flow
                        </p>

                        <div className="grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => setRuleFlow('any')}
                            className={cn(
                              "px-2 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer",
                              ruleFlow === 'any'
                                ? "bg-slate-900 text-white border-slate-900"
                                : "bg-white text-slate-600 border-slate-250 hover:border-slate-350"
                            )}
                          >
                            Either (Any)
                          </button>
                          <button
                            type="button"
                            onClick={() => setRuleFlow('withdrawal')}
                            className={cn(
                              "px-2 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer",
                              ruleFlow === 'withdrawal'
                                ? "bg-red-650 bg-red-600 text-white border-red-600"
                                : "bg-white text-slate-600 border-slate-250 hover:border-slate-350"
                            )}
                          >
                            Withdrawal
                          </button>
                          <button
                            type="button"
                            onClick={() => setRuleFlow('deposit')}
                            className={cn(
                              "px-2 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer",
                              ruleFlow === 'deposit'
                                ? "bg-emerald-650 bg-emerald-600 text-white border-emerald-600"
                                : "bg-white text-slate-600 border-slate-250 hover:border-slate-350"
                            )}
                          >
                            Deposit
                          </button>
                        </div>
                      </div>

                      {/* Action: Target Category */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 font-mono">Assign to Category</label>
                        <select
                          value={ruleCategory}
                          onChange={(e) => setRuleCategory(e.target.value)}
                          required
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white outline-none focus:border-[#86BC24] focus:ring-1 focus:ring-[#86BC24] cursor-pointer"
                        >
                          <option value="">-- Choose Category --</option>
                          {incomeExpenseBudgets.map(b => {
                            const isInc = (b.type || '').toLowerCase() === 'income';
                            return (
                              <option key={b.id} value={b.category}>
                                {isInc ? '🟢' : '🔴'} {b.category} ({b.type})
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      {/* Generated Unique Rule Name Label */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 font-mono">Generated Rule Name (Unique & Read-only)</label>
                        <div className="w-full px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-600 flex items-center justify-between select-all">
                          <span>{ruleGeneratedName}</span>
                          <span className="text-[8px] bg-slate-250 text-slate-500 font-extrabold uppercase tracking-widest px-1 py-0.5 rounded">Auto</span>
                        </div>
                      </div>

                      {/* Feedback error line */}
                      {isSaveDisabled && (
                        <p className="text-[10px] text-amber-600 font-semibold leading-normal bg-amber-50 p-2.5 rounded-lg border border-amber-100 flex items-center gap-2">
                          ⚠️ Please configure at least 1 of the 3 filters above before saving.
                        </p>
                      )}

                      {/* Submit Buttons */}
                      <div className="flex gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="submit"
                          disabled={isSaveDisabled}
                          className={cn(
                            "flex-1 py-2 text-white rounded-lg text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer",
                            isSaveDisabled 
                              ? "bg-slate-200 text-slate-400 cursor-not-allowed" 
                              : "bg-[#86BC24] hover:bg-[#75A51F]"
                          )}
                        >
                          Save Rule to Books
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRule(null);
                          }}
                          className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  );
                })() : (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-8">
                    <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3">
                      <Settings2 size={24} className="text-slate-300" />
                    </div>
                    <h4 className="text-xs font-bold text-slate-700">No Rule Selected</h4>
                    <p className="text-[10px] text-slate-500 max-w-xs mt-1">Select any existing rule from the left column to view/modify, or click custom add rule to create a new mapping matcher.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer feedback */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-150 flex justify-between items-center text-[10px] text-slate-400 font-medium">
              <span className="flex items-center gap-1 font-mono">
                <span className="w-2 h-2 rounded-full bg-[#86BC24] animate-pulse" />
                Live Rules Evaluating Engine Active
              </span>
              <button 
                onClick={() => {
                  setShowRulesEditor(false);
                  setEditingRule(null);
                }}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded font-bold uppercase tracking-wider cursor-pointer font-mono"
              >
                Close Manager
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
