import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { X, History, User, Calendar, Tag, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userEmail: string;
  userName: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  resourceName?: string;
  details?: string;
}

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  resourceId?: string;
  userId?: string;
}

export default function HistoryModal({ isOpen, onClose, title, resourceId, userId }: HistoryModalProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    let q;
    if (resourceId) {
      q = query(
        collection(db, 'audit_logs'),
        where('resourceId', '==', resourceId),
        where('userId', '==', userId),
        orderBy('timestamp', 'desc')
      );
    } else if (userId) {
      q = query(
        collection(db, 'audit_logs'),
        where('userId', '==', userId),
        orderBy('timestamp', 'desc')
      );
    } else {
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(q, (snapshot) => {
      const logData = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as AuditLog[];
      setLogs(logData);
      setLoading(false);
    }, (err) => {
        console.error("History query failed:", err);
        setLoading(false);
    });

    return unsub;
  }, [isOpen, resourceId, userId]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl p-0 border border-slate-100 overflow-hidden"
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <History size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 leading-none">Audit History</h2>
                  <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest font-bold font-mono">{title}</p>
                </div>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-white rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="max-h-[500px] overflow-y-auto p-6">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                  <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Querying Audit Trail...</p>
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-20 space-y-4">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-200">
                    <History size={32} />
                  </div>
                  <div>
                    <p className="text-slate-900 font-bold">No history records found</p>
                    <p className="text-slate-500 text-xs">No audit events have been logged for this resource.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {logs.map((log) => (
                    <div key={log.id} className="p-4 rounded-xl border border-slate-100 hover:border-indigo-100 hover:bg-slate-50/30 transition-all flex gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                        log.action === 'CREATE' ? "bg-green-50 text-green-600" :
                        log.action === 'UPDATE' ? "bg-blue-50 text-blue-600" :
                        log.action === 'DELETE' ? "bg-red-50 text-red-600" :
                        log.action === 'IMPORT' ? "bg-purple-50 text-purple-600" :
                        "bg-slate-50 text-slate-600"
                      )}>
                        {log.action === 'CREATE' && <Plus size={18} />}
                        {log.action === 'UPDATE' && <Tag size={18} />}
                        {log.action === 'DELETE' && <Trash2 size={18} />}
                        {log.action === 'IMPORT' && <div className="font-bold text-xs">CSV</div>}
                        {log.action === 'VIEW' && <Calendar size={18} />}
                        {['INVITE', 'LOGIN'].includes(log.action) && <User size={18} />}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className={cn(
                            "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                            log.action === 'CREATE' ? "bg-green-100 text-green-700" :
                            log.action === 'UPDATE' ? "bg-blue-100 text-blue-700" :
                            log.action === 'DELETE' ? "bg-red-100 text-red-700" :
                            "bg-slate-100 text-slate-700"
                          )}>
                            {log.action}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                        </div>
                        
                        <p className="text-sm font-bold text-slate-900 mb-1">
                          {(log.action || '').toLowerCase().replace('_', ' ')}d {log.resourceType}
                          {log.resourceName && <span className="text-indigo-600 ml-1">"{log.resourceName}"</span>}
                        </p>
                        
                        <div className="flex items-center gap-3 text-[10px] text-slate-500">
                          <div className="flex items-center gap-1 font-medium">
                            <User size={10} />
                            {log.userName}
                          </div>
                          <div className="opacity-50">•</div>
                          <div className="italic truncate">{log.userEmail}</div>
                        </div>
                        
                        {log.details && (
                          <div className="mt-3 p-2 bg-slate-50 border-l-2 border-slate-200 rounded text-xs text-slate-600 font-medium">
                            {log.details}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center justify-center gap-2">
                <Info size={12} />
                Audit records are cryptographically timestamped and immutable
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function Trash2({ size, className }: { size: number, className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>;
}

function Plus({ size, className }: { size: number, className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>;
}
