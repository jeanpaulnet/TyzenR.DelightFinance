import React, { useState, useEffect } from 'react';
import { useApp } from '../../AppContext';
import { db } from '../../lib/firebase';
import { collection, query, onSnapshot, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { 
  Users as UsersIcon, 
  Search, 
  Plus, 
  Trash2, 
  Shield, 
  User as UserIcon,
  Check,
  X,
  Lock,
  Unlock,
  Monitor
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

interface UserConfigData {
  id: string;
  email: string;
  name: string;
  role: 'Admin' | 'User';
  menuAccess: {
    dashboard: boolean;
    transactions: boolean;
    budgets: boolean;
    ai: boolean;
    users: boolean;
  };
}

export default function Users() {
  const { userRole } = useApp();
  const [users, setUsers] = useState<UserConfigData[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');

  useEffect(() => {
    if (userRole !== 'Admin') return;

    const q = query(collection(db, 'users_config'));
    const unsub = onSnapshot(q, (snapshot) => {
      const userData = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as UserConfigData[];
      setUsers(userData);
    });

    return unsub;
  }, [userRole]);

  const handleToggleAccess = async (userId: string, menuKey: keyof UserConfigData['menuAccess'], currentVal: boolean) => {
    try {
      const userRef = doc(db, 'users_config', userId);
      await updateDoc(userRef, {
        [`menuAccess.${menuKey}`]: !currentVal
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleChangeRole = async (userId: string, currentRole: 'Admin' | 'User') => {
    try {
      const userRef = doc(db, 'users_config', userId);
      const newRole = currentRole === 'Admin' ? 'User' : 'Admin';
      
      // If promoting to admin, give full access by default. 
      // If demoting, keep current or reset? Let's just switch role for now.
      await updateDoc(userRef, {
        role: newRole
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail || !newUserName) return;

    try {
      const docId = newUserEmail.toLowerCase().replace(/[^a-z0-9]/g, '_'); // Safe ID
      const userRef = doc(db, 'users_config', docId);
      
      await setDoc(userRef, {
        email: newUserEmail.toLowerCase(),
        name: newUserName,
        role: 'User',
        menuAccess: {
          dashboard: true,
          transactions: true,
          budgets: true,
          ai: true,
          users: false
        },
        isInvited: true,
        updatedAt: new Date().toISOString()
      });

      setIsAdding(false);
      setNewUserEmail('');
      setNewUserName('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteConfig = async (id: string, email: string) => {
    if (email === 'jeanpaulva@gmail.com') {
      alert("Cannot delete the primary admin.");
      return;
    }
    if (!window.confirm(`Are you sure you want to remove access for ${email}?`)) return;
    try {
      await deleteDoc(doc(db, 'users_config', id));
    } catch (err) {
      console.error(err);
    }
  };

  const filteredUsers = users;

  if (userRole !== 'Admin') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Lock size={48} className="text-slate-300 mb-4" />
        <h2 className="text-xl font-bold text-slate-900">Access Restricted</h2>
        <p className="text-slate-500 text-sm max-w-xs mx-auto">
          You do not have administrative privileges to view this section.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Users</h1>
          <p className="text-slate-500 text-sm italic">Configure roles and granular menu visibility.</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} />
          Invite User
        </button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-md"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Invite New User</h2>
              <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input 
                type="text" required placeholder="User Name"
                value={newUserName}
                onChange={e => setNewUserName(e.target.value)}
                className="p-2.5 bg-slate-50 border border-[#E2E8F0] rounded-lg outline-none focus:border-[#86BC24] transition-colors text-sm"
              />
              <input 
                type="email" required placeholder="user@example.com"
                value={newUserEmail}
                onChange={e => setNewUserEmail(e.target.value)}
                className="p-2.5 bg-slate-50 border border-[#E2E8F0] rounded-lg outline-none focus:border-[#86BC24] transition-colors text-sm"
              />
              <button type="submit" className="btn-primary py-2.5 px-6 font-bold uppercase text-[10px] tracking-widest h-full">
                Create Config
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">User Identity</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">System Role</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Menu Visibility</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((u) => (
                <tr key={u.id} className="group hover:bg-slate-50/80 transition-colors">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                        {u.role === 'Admin' ? <Shield size={18} className="text-[#86BC24]" /> : <UserIcon size={18} />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{u.name || 'Unknown User'}</p>
                        <p className="text-[10px] text-slate-500 font-medium truncate">{u.email}</p>
                        <p className="text-[10px] text-slate-500 font-mono italic opacity-60">ID: {u.id.slice(0, 8)}...</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-center">
                    <button 
                      onClick={() => handleChangeRole(u.id, u.role)}
                      className={cn(
                        "inline-flex items-center px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors",
                        u.role === 'Admin' 
                          ? "bg-indigo-50 text-indigo-600 border border-indigo-100" 
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                      )}
                    >
                      {u.role}
                    </button>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center justify-center gap-2">
                       {(Object.keys(u.menuAccess) as Array<keyof UserConfigData['menuAccess']>).map((menu) => (
                         <button
                           key={menu}
                           onClick={() => handleToggleAccess(u.id, menu, u.menuAccess[menu])}
                           title={menu.charAt(0).toUpperCase() + menu.slice(1)}
                           className={cn(
                             "w-7 h-7 rounded flex items-center justify-center border transition-all",
                             u.menuAccess[menu] 
                              ? "bg-green-50 border-green-200 text-[#86BC24]" 
                              : "bg-slate-50 border-slate-200 text-slate-300"
                           )}
                         >
                           {menu === 'dashboard' && <Monitor size={14} />}
                           {menu === 'transactions' && <Activity size={14} />}
                           {menu === 'budgets' && <Wallet size={14} />}
                           {menu === 'ai' && <MessageSquare size={14} />}
                           {menu === 'users' && <Shield size={14} />}
                         </button>
                       ))}
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <button 
                      onClick={() => handleDeleteConfig(u.id, u.email)}
                      className="p-2 text-slate-300 hover:text-[#EF4444] hover:bg-red-50 rounded transition-colors"
                      title="De-authorize User"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Icons helper
function Activity({ size, className }: { size: number, className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>;
}
function Wallet({ size, className }: { size: number, className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>;
}
function MessageSquare({ size, className }: { size: number, className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
}
