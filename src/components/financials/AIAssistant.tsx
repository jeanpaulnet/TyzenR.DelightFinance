import ReactMarkdown from 'react-markdown';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useApp } from '../../AppContext';
import { analyzeFinancialHealth, generateSummaryReport } from '../../lib/gemini';
import { decryptPayload } from '../../lib/encryption';
import { MessageSquare, Send, Bot, User, Loader2, Download, Trash2, HelpCircle, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function AIAssistant() {
  const { finData, encryptionKey } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const decryptedExpenses = useMemo(() => {
    if (!encryptionKey) return [];
    return finData.expenses.map(e => ({
      ...e,
      ...decryptPayload(e.encryptedData, encryptionKey)
    }));
  }, [finData.expenses, encryptionKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      // Prepare context for Gemini
      const totalSpent = decryptedExpenses.reduce((sum, e) => sum + e.amount, 0);
      const totalBudget = finData.budgets.reduce((sum, b) => sum + b.amount, 0);
      const investmentValue = finData.investments.reduce((sum, i) => sum + (i.quantity * i.purchasePrice), 0);

      const aiResponse = await analyzeFinancialHealth({
        ...finData,
        expenses: decryptedExpenses,
        summary: {
          totalSpent,
          totalBudget,
          surplus: totalBudget - totalSpent,
          topCategory: 'Assorted', // can refine
          investmentValue
        }
      }, input);

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiResponse || "I encountered an error analyzing your data.",
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsTyping(false);
    }
  };

  const generateAutoSummary = async () => {
    if (isTyping) return;
    setIsTyping(true);

    try {
      const totalSpent = decryptedExpenses.reduce((sum, e) => sum + e.amount, 0);
      const totalBudget = finData.budgets.reduce((sum, b) => sum + b.amount, 0);
      const investmentValue = finData.investments.reduce((sum, i) => sum + (i.quantity * i.purchasePrice), 0);

      const aiResponse = await generateSummaryReport({
        ...finData,
        expenses: decryptedExpenses,
        summary: {
          totalSpent,
          totalBudget,
          surplus: totalBudget - totalSpent,
          topCategory: 'Global',
          investmentValue
        }
      });

      const assistantMsg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: aiResponse || "I couldn't generate a summary report at this time.",
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsTyping(false);
    }
  };

  const downloadTranscript = () => {
    const text = messages.map(m => `[${m.role.toUpperCase()}] ${m.timestamp.toLocaleString()}\n${m.content}\n`).join('\n---\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `veda-ai-transcript-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-w-4xl mx-auto bg-white border border-[#E2E8F0] rounded-lg p-0 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="p-4 border-b border-[#E2E8F0] bg-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#0F172A] text-white rounded flex items-center justify-center">
            <Bot size={20} />
          </div>
          <div>
            <h2 className="font-bold text-[#1E293B] uppercase text-xs tracking-wider">Delight AI Engine</h2>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-[#10B981] rounded-full" />
              <span className="text-[10px] text-[#86BC24] font-bold underline cursor-pointer">Source Traceability Enabled [2 Files]</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={generateAutoSummary}
            disabled={isTyping}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#86BC24]/10 text-[#86BC24] rounded-md hover:bg-[#86BC24]/20 transition-all text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
          >
            <FileText size={14} />
            Generate AI Summary
          </button>
          <div className="w-px h-6 bg-slate-100 mx-1" />
          <button 
            onClick={downloadTranscript}
            disabled={messages.length === 0}
            className="p-2 text-slate-400 hover:text-[#86BC24] transition-colors disabled:opacity-30"
          >
            <Download size={18} />
          </button>
          <button 
            onClick={() => setMessages([])}
            className="p-2 text-slate-400 hover:text-[#EF4444] transition-colors"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 bg-white"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-20">
            <div className="p-4 bg-slate-50 text-slate-300 rounded-full border border-slate-100">
              <MessageSquare size={48} />
            </div>
            <div className="max-w-xs">
              <p className="text-[#1E293B] font-bold text-sm">Delight Intelligence Engine</p>
              <p className="text-[#64748B] text-xs mt-1">Ready for encrypted financial analysis. Ask about variances, forecasts, or risks.</p>
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={cn(
                "flex gap-4",
                m.role === 'user' ? "flex-row-reverse" : "flex-row"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded flex items-center justify-center shrink-0 mt-1",
                m.role === 'user' ? "bg-slate-100 text-slate-600" : "bg-[#0F172A] text-white"
              )}>
                {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className={cn(
                "max-w-[85%] p-4 border relative",
                m.role === 'user' 
                  ? "bg-[#86BC24] text-white border-[#86BC24] rounded-lg rounded-tr-none shadow-sm" 
                  : "bg-white text-[#1E293B] border-[#E2E8F0] rounded-lg rounded-tl-none"
              )}>
                <div className="text-[13px] leading-relaxed prose prose-slate prose-sm max-w-none prose-invert">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
                <span className="text-[9px] opacity-60 block mt-2 font-mono uppercase">
                  {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isTyping && (
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded bg-[#0F172A] text-white flex items-center justify-center">
              <Bot size={16} />
            </div>
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] p-4 rounded-lg rounded-tl-none flex items-center gap-3">
              <Loader2 size={14} className="animate-spin text-[#86BC24]" />
              <span className="text-xs text-[#64748B] font-semibold uppercase tracking-wider">Processing Encrypted Data...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input - AI Chat Bar Style */}
      <div className="p-4 border-t border-[#E2E8F0] bg-white">
        <form onSubmit={handleSend} className="ai-container flex items-center gap-3">
          <div className="text-lg">✨</div>
          <input 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask AI: 'Why was my variance high in August?' or 'Show me my ROI'..."
            disabled={isTyping}
            className="flex-1 bg-white border border-[#E2E8F0] rounded-md px-4 py-2.5 text-sm outline-none focus:border-[#86BC24] transition-colors shadow-inner"
          />
          <button 
            type="submit"
            disabled={!input.trim() || isTyping}
            className="p-2.5 bg-[#86BC24] text-white rounded-md hover:bg-[#75A51F] transition-colors disabled:opacity-50 flex items-center justify-center shrink-0"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
