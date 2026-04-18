import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import { useApp } from '../../AppContext';
import { encryptPayload } from '../../lib/encryption';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Upload, X, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

export default function ExpenseUpload() {
  const { user, encryptionKey, finData } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !encryptionKey) return;

    setIsUploading(true);
    setFeedback(null);
    setValidationErrors([]);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const docs = results.data as any[];
          const errors: string[] = [];
          const validCategories = new Set(finData.budgets.map(b => b.category.toLowerCase()));

          // Validation Pass
          docs.forEach((row, index) => {
            const rowNum = index + 1;
            
            // Category validation
            const category = (row.category || '').toLowerCase().trim();
            if (!validCategories.has(category)) {
              errors.push(`Row ${rowNum}: Category "${category || '(empty)'}" not found in Master.`);
            }

            // Date validation
            const date = new Date(row.date);
            if (isNaN(date.getTime())) {
              errors.push(`Row ${rowNum}: Invalid date "${row.date || '(empty)'}".`);
            }

            // Amount validation
            const amountStr = String(row.amount || '').replace(/[^0-9.-]+/g, "");
            const amount = parseFloat(amountStr);
            if (isNaN(amount) || amount <= 0) {
              errors.push(`Row ${rowNum}: Invalid amount "${row.amount || '(empty)'}".`);
            }
          });

          if (errors.length > 0) {
            setValidationErrors(errors);
            setFeedback({ type: 'error', message: `Import aborted: ${errors.length} validation errors found.` });
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }

          let count = 0;
          for (const row of docs) {
            const amount = parseFloat(String(row.amount).replace(/[^0-9.-]+/g, ""));
            const date = new Date(row.date).toISOString();
            const category = row.category.toLowerCase().trim();
            const description = row.description || 'No description';
            const accountId = 'default';

            const payload = {
              description,
              notes: row.notes || '',
              metadata: { originalRow: row }
            };

            const encryptedData = encryptPayload(payload, encryptionKey);

            await addDoc(collection(db, 'users', user.uid, 'expenses'), {
              amount,
              category,
              date,
              accountId,
              encryptedData,
              userId: user.uid,
              createdAt: new Date().toISOString()
            });
            count++;
          }
          
          setFeedback({ type: 'success', message: `Successfully imported ${count} expenses.` });
          setIsUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (err) {
          console.error(err);
          setFeedback({ type: 'error', message: 'Fatal error during import. Check file structure.' });
          setIsUploading(false);
        }
      },
      error: (err) => {
        setFeedback({ type: 'error', message: 'CSV parsing error: ' + err.message });
        setIsUploading(false);
      }
    });
  };

  const downloadSampleCSV = () => {
    const categories = finData.budgets.length > 0 
      ? finData.budgets.map(b => b.category)
      : ['food', 'housing', 'transport'];
    const data = [['date', 'amount', 'category', 'description']];
    
    // Generate 12 months of data, 5 transactions per month
    const now = new Date();
    for (let m = 0; m < 12; m++) {
      const currentMonth = new Date(now.getFullYear(), now.getMonth() - (11 - m), 1);
      // Create a seasonal trend (higher in summer/winter)
      const seasonalTrend = 1 + (Math.sin((m / 11) * Math.PI) * 0.4);
      
      for (let i = 0; i < 5; i++) {
        const day = Math.floor(Math.random() * 28) + 1;
        const dateStr = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day).toISOString().split('T')[0];
        const category = categories[Math.floor(Math.random() * categories.length)];
        const baseAmount = Math.floor(Math.random() * 150) + 20;
        const amount = (baseAmount * seasonalTrend).toFixed(2);
        const description = `Sample ${category} purchase #${i + 1}`;
        data.push([dateStr, amount, category, description]);
      }
    }

    const csvContent = data.map(e => e.map(val => `"${val}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "veda_sample_expenses.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <button onClick={() => setIsOpen(true)} className="btn-primary flex items-center gap-2">
        <Upload size={18} />
        Upload CSV
      </button>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl p-8 border border-slate-100"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-900">Import Expenses</h2>
                <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-3">
                  <div className="flex gap-3 text-slate-600">
                    <HelpCircle size={20} className="text-[#86BC24] shrink-0 mt-0.5" />
                    <p className="text-xs leading-relaxed">
                      Expected headers: <span className="font-mono font-bold bg-white px-1 border border-slate-200">date, amount, category, description</span>. All data is AES-encrypted before storage.
                    </p>
                  </div>
                  <button 
                    onClick={downloadSampleCSV}
                    className="w-full flex items-center justify-center gap-2 py-2 text-[10px] font-bold uppercase tracking-widest text-[#86BC24] border border-[#86BC24]/20 bg-white rounded hover:bg-slate-50 transition-colors"
                  >
                    Download Sample Template (.csv)
                  </button>
                </div>

                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center hover:border-indigo-400 hover:bg-slate-50 transition-all cursor-pointer group"
                >
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-indigo-50 transition-colors">
                    <Upload size={32} className="text-slate-400 group-hover:text-indigo-500" />
                  </div>
                  <p className="font-bold text-slate-800">Click to upload CSV</p>
                  <p className="text-sm text-slate-500 mt-1">or drag and drop here</p>
                  <input 
                    type="file" 
                    accept=".csv" 
                    className="hidden" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload}
                    disabled={isUploading}
                  />
                </div>

                {isUploading && (
                  <div className="flex items-center justify-center gap-3 text-indigo-600 font-medium animate-pulse">
                    <Activity size={20} className="animate-spin" />
                    Processing and Encrypting...
                  </div>
                )}

                {feedback && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <div className={cn(
                      "p-4 rounded-xl flex items-center gap-3",
                      feedback.type === 'success' ? "bg-green-50 text-green-700 border border-green-100" : "bg-red-50 text-red-700 border border-red-100"
                    )}>
                      {feedback.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                      <p className="text-sm font-medium">{feedback.message}</p>
                    </div>

                    {validationErrors.length > 0 && (
                      <div className="bg-red-50/50 border border-red-100 rounded-xl p-4 max-h-[200px] overflow-y-auto">
                        <ul className="space-y-1.5">
                          {validationErrors.map((err, i) => (
                            <li key={i} className="text-[10px] font-mono text-red-600 flex gap-2">
                              <span className="opacity-50">[{i+1}]</span>
                              {err}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

function Activity({ size, className }: { size: number, className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>;
}
