import { useState, useMemo, useEffect } from 'react';
import { AppProvider, useApp } from './AppContext';
import { signInWithGoogle, signOut } from './lib/firebase';
import { 
  LayoutDashboard, 
  Wallet, 
  TrendingUp, 
  MessageSquare, 
  LogOut, 
  Menu, 
  X, 
  ShieldCheck,
  Plus,
  Upload,
  ChevronRight,
  PieChart,
  BarChart,
  Activity,
  User
} from 'lucide-react';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import Dashboard from './components/financials/Dashboard';
import BudgetManager from './components/financials/BudgetManager';
import AIChat from './components/financials/AIChat';
import Transactions from './components/financials/Transactions';
import BusinessSetup from './components/financials/BusinessSetup';
import BusinessSettings from './components/financials/BusinessSettings';
import Header from './components/financials/Header';

function MainApp() {
  const { user, loading: authLoading, userRole, menuAccess, businesses, activeTab, setActiveTab } = useApp();
  const [isAddingBusiness, setIsAddingBusiness] = useState(false);
  const [hasLanded, setHasLanded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const APP_VERSION = '2.0';

  const allTabs = useMemo(() => [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, visible: !!menuAccess?.dashboard },
    { id: 'transactions', label: 'Transactions', icon: Activity, visible: !!menuAccess?.transactions },
    { id: 'budgets', label: 'Categories', icon: Wallet, visible: !!menuAccess?.budgets },
    { id: 'ai', label: 'AI Chat', icon: MessageSquare, visible: !!menuAccess?.ai },
  ], [menuAccess]);

  const visibleTabs = useMemo(() => allTabs.filter(t => t.visible), [allTabs]);

  // Initial landing: Redirect to first available tab once config is loaded
  useEffect(() => {
    if (menuAccess && !hasLanded && visibleTabs.length > 0) {
      setActiveTab(visibleTabs[0].id);
      setHasLanded(true);
    }
  }, [menuAccess, visibleTabs, hasLanded]);

  // Secondary guard: Ensure active tab remains valid if permissions shift
  useEffect(() => {
    if (!menuAccess) return;
    
    const isCurrentTabVisible = visibleTabs.some(t => t.id === activeTab) || activeTab === 'business-settings';
    if (activeTab && !isCurrentTabVisible && visibleTabs.length > 0) {
       setActiveTab(visibleTabs[0].id);
    }
  }, [menuAccess, activeTab, visibleTabs]);

  if (authLoading || (user && !menuAccess)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-[#86BC24] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Securing Session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F1F5F9] flex flex-col items-center justify-center p-6 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-2 bg-white rounded-2xl overflow-hidden shadow-2xl border border-[#E2E8F0]"
        >
          {/* Brand/Marketing Side */}
          <div className="bg-[#0F172A] p-12 flex flex-col justify-between text-white relative overflow-hidden">
             <div className="absolute top-0 right-0 w-64 h-64 bg-[#86BC24]/10 blur-[100px] -mr-32 -mt-32 rounded-full" />
             <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 blur-[100px] -ml-32 -mb-32 rounded-full" />
             
             <div className="relative z-10 flex items-center gap-3">
                <div className="w-10 h-10 bg-[#86BC24] rounded flex items-center justify-center font-bold text-xl tracking-tighter shadow-lg shadow-green-500/20">D</div>
                <div className="flex flex-col">
                  <span className="font-bold text-2xl tracking-tighter uppercase">Delight <span className="font-light text-slate-400">Finance</span></span>
                  <span className="text-[10px] text-slate-500 font-medium tracking-widest -mt-1 uppercase">v{APP_VERSION}</span>
                </div>
             </div>

             <div className="relative z-10 space-y-6">
                <h1 className="text-4xl lg:text-5xl font-bold tracking-tight leading-[1.1]">
                   Professional Health <span className="text-[#86BC24]">AI Engine</span>.
                </h1>
                <p className="text-slate-400 text-lg leading-relaxed max-w-sm">
                  The most secure way to track expenses, manage budgets, and analyze financials.
                </p>
                <div className="flex flex-col gap-4 pt-4">
                   <div className="flex items-center gap-3 text-sm font-medium text-slate-300">
                      <ShieldCheck size={18} className="text-[#86BC24]" />
                      Real-time Financial Tracking
                   </div>
                   <div className="flex items-center gap-3 text-sm font-medium text-slate-300">
                      <Activity size={18} className="text-[#86BC24]" />
                      AI-Powered Risk Analysis
                   </div>
                   <div className="flex items-center gap-3 text-sm font-medium text-slate-300">
                      <Wallet size={18} className="text-[#86BC24]" />
                      Manage budgets
                   </div>
                   <div className="flex items-center gap-3 text-sm font-medium text-slate-300">
                      <TrendingUp size={18} className="text-[#86BC24]" />
                      Improve savings
                   </div>
                </div>
             </div>

             <div className="relative z-10 pt-12 text-[10px] text-slate-500 uppercase tracking-widest font-bold flex items-center justify-between">
                <span>Trusted by Financial Professionals &mdash; &copy; 2026</span>
                <span className="bg-[#86BC24]/20 text-[#86BC24] px-2 py-0.5 rounded">v{APP_VERSION}</span>
             </div>
          </div>

          {/* Auth Side */}
          <div className="p-12 flex flex-col justify-center bg-white">
            <div className="max-w-sm mx-auto w-full space-y-8">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-[#1E293B] tracking-tight">Access Financial Dashboard</h2>
                <p className="text-[#64748B] text-sm">Sign in to sync your financial records.</p>
              </div>

              <div className="space-y-4">
                <button 
                  onClick={signInWithGoogle}
                  className="w-full h-12 flex items-center justify-center gap-3 bg-white border border-[#E2E8F0] text-[#1E293B] rounded-lg font-semibold text-sm hover:bg-slate-50 transition-all shadow-sm active:scale-[0.98]"
                >
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="w-5 h-5" />
                  Continue with Google
                </button>
                
                <div className="relative my-8">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-[#E2E8F0]"></span></div>
                  <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-bold text-slate-400"><span className="bg-white px-2">Managed Session</span></div>
                </div>

                <div className="text-center">
                  <p className="text-xs text-[#64748B]">
                    By signing in, you agree to our 
                    <button className="text-[#86BC24] font-bold mx-1 hover:underline">Terms of Service</button> 
                    and 
                    <button className="text-[#86BC24] font-bold mx-1 hover:underline">Security Protocols</button>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (user && businesses.length === 0) {
    return <BusinessSetup />;
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`fixed lg:sticky top-0 h-screen w-64 bg-[#0F172A] text-white transition-transform z-50 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col h-full py-8">
          <div className="px-6 mb-10 overflow-hidden">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 min-w-[32px] bg-[#86BC24] text-white rounded flex items-center justify-center font-bold text-lg leading-none">D</div>
              <div className="flex flex-col">
                <span className="font-bold text-xl tracking-tighter uppercase whitespace-nowrap">Delight <span className="font-light text-slate-400">Finance</span></span>
                <span className="text-[9px] font-bold text-slate-400 tracking-[0.2em] -mt-1 uppercase">Version {APP_VERSION}</span>
              </div>
            </div>
          </div>

          <nav className="flex-1">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSidebarOpen(false);
                  }}
                  className={cn(
                    "sidebar-nav-item w-full",
                    activeTab === tab.id && "sidebar-nav-item-active"
                  )}
                >
                  <Icon size={18} className={cn(activeTab === tab.id ? "text-[#86BC24]" : "text-slate-400")} />
                  <span className="font-medium tracking-tight">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          <nav className="mt-auto px-6 py-4 border-t border-white/5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 border border-white/5">
                {user.photoURL ? <img src={user.photoURL} alt="" className="rounded-full" /> : <User size={16} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate leading-tight">{user.displayName || 'Delight User'}</p>
                <p className="text-[10px] text-slate-500 truncate mt-0.5">{user.email}</p>
              </div>
            </div>
            <button 
              onClick={() => signOut()}
              className="w-full flex items-center gap-2 py-2 text-xs font-semibold text-slate-500 hover:text-red-400 transition-colors uppercase tracking-widest"
            >
              <LogOut size={14} />
              Logout
            </button>
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden">
        <Header 
          onOpenSidebar={() => setSidebarOpen(true)} 
          onSettingsClick={() => setActiveTab('business-settings')}
          onAddBusinessClick={() => setIsAddingBusiness(true)}
        />

        <section className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'dashboard' && <Dashboard />}
              {activeTab === 'transactions' && <Transactions />}
              {activeTab === 'budgets' && <BudgetManager />}
              {activeTab === 'ai' && <AIChat />}
              {activeTab === 'business-settings' && <BusinessSettings />}
            </motion.div>
          </AnimatePresence>
        </section>

        {/* New Business Modal */}
        <AnimatePresence>
          {isAddingBusiness && (
            <BusinessSetup onClose={() => setIsAddingBusiness(false)} />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}
