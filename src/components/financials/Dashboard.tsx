import React, { useMemo, useState, useEffect } from 'react';
import { useApp, getBusinessSettings } from '../../AppContext';
import { transactionApi } from '../../lib/api';
import { formatCurrency, cn } from '../../lib/utils';
import { logEvent } from '../../lib/audit';
import { 
  ArrowUpRight, 
  ArrowDownRight,
  Activity,
  Clock,
  ArrowRight,
  TrendingUp,
  Settings,
  PieChart as PieChartIcon
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer 
} from 'recharts';
import { PortfolioPieChart } from '../ui/FinancialCharts';
import FinancialFreedomModal from './FinancialFreedomModal';

export default function Dashboard() {
  const { finData, user, dateFilter, activeBusinessId, businesses, setActiveTab } = useApp();
  const [isFFModalOpen, setIsFFModalOpen] = useState(false);
  const [chartType, setChartType] = useState<'bars' | 'lines'>('bars');
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const activeBusiness = useMemo(() => 
    businesses.find(b => b.id === activeBusinessId), 
  [businesses, activeBusinessId]);

  useEffect(() => {
    if (user) {
      logEvent({
        userId: user.uid,
        userEmail: user.email || 'unknown',
        userName: user.displayName || 'Delight User',
        action: 'VIEW',
        resourceType: 'dashboard'
      });
    }
  }, [user]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!activeBusinessId) return;
      setLoading(true);
      try {
        // Fetch ALL transactions up to the end date for Net Worth calculation
        const res = await transactionApi.listPaged(activeBusinessId, {
          startDate: '', // Beginning of time
          endDate: dateFilter.endDate,
          page: 1,
          pageSize: 5000 // Large enough for historical analysis
        });
        setExpenses(res.data.items || []);
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboardData();
  }, [activeBusinessId, dateFilter.endDate]);

  const filteredExpenses = useMemo(() => {
    // Period filter: Strictly between start and end date
    const start = new Date(dateFilter.startDate).getTime();
    const end = new Date(dateFilter.endDate).getTime();
    
    return expenses.filter(e => {
      const d = new Date(e.date).getTime();
      return d >= start && d <= end;
    });
  }, [expenses, dateFilter]);

  const cumulativeExpenses = useMemo(() => {
    // All-time up to the end date
    return expenses;
  }, [expenses]);

  // Map of category names to their types for color coding
  const categoryMap = useMemo(() => {
    const map = new Map<string, { id: string; type: string; name: string }>();
    finData.budgets.forEach(b => {
      const catName = b.name || b.category || 'Uncategorized';
      const catInfo = { id: b.id, type: b.type || 'Expense', name: catName };
      
      if (b.id) map.set(b.id, catInfo);
      map.set(catName.toLowerCase(), catInfo);
    });
    return map;
  }, [finData.budgets]);

  const summary = useMemo(() => {
    const settings = activeBusiness ? getBusinessSettings(activeBusiness) : null;
    const currency = settings?.currency || 'USD';
    const totalSpent = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
    const totalBudget = finData.budgets.reduce((sum, b) => sum + b.budget, 0);
    const investmentValue = finData.investments.reduce((sum, i) => sum + (i.quantity * i.purchasePrice), 0);

    const totalIncome = filteredExpenses
      .filter(e => {
        const catInfo = categoryMap.get(e.categoryId) || categoryMap.get((e.category || '').toLowerCase());
        return catInfo?.type === 'Income';
      })
      .reduce((sum, e) => sum + e.amount, 0);
    
    const totalExpenses = filteredExpenses
      .filter(e => {
        const catInfo = categoryMap.get(e.categoryId) || categoryMap.get((e.category || '').toLowerCase());
        const type = catInfo?.type;
        return type === 'Expense' || !type;
      })
      .reduce((sum, e) => sum + e.amount, 0);

    const passiveIncomeCategoryIds = (() => {
      try {
        const s = activeBusiness ? JSON.parse(activeBusiness.businessSettingsJson) : {};
        return (s.passiveIncomeCategoryIds || []) as string[];
      } catch { return []; }
    })();

    const essentialExpenseCategoryIds = (() => {
      try {
        const s = activeBusiness ? JSON.parse(activeBusiness.businessSettingsJson) : {};
        return (s.essentialExpenseCategoryIds || []) as string[];
      } catch { return []; }
    })();

    const passiveIncome = filteredExpenses
      .filter(e => {
        const catInfo = categoryMap.get(e.categoryId) || categoryMap.get((e.category || '').toLowerCase());
        const type = catInfo?.type;
        
        // If user has defined specific passive categories, use them
        if (passiveIncomeCategoryIds.length > 0) {
           return passiveIncomeCategoryIds.includes(e.categoryId);
        }

        const title = (e.description || '').toLowerCase();
        const catName = (catInfo?.name || '').toLowerCase();
        
        return type === 'Income' && (
          title.includes('passive') || 
          title.includes('dividend') || 
          title.includes('interest') || 
          title.includes('rent') ||
          catName.includes('passive') ||
          catName.includes('dividend') ||
          catName.includes('rent') ||
          catName.includes('interest')
        );
      })
      .reduce((sum, e) => sum + e.amount, 0);

    const essentialExpenses = filteredExpenses
      .filter(e => {
        // Only use specific essential categories if defined
        if (essentialExpenseCategoryIds.length > 0) {
           return essentialExpenseCategoryIds.includes(e.categoryId);
        }
        return false; // Default to 0 if not configured
      })
      .reduce((sum, e) => sum + e.amount, 0);

    const totalAssets = investmentValue; // Based on portfolio
    const totalLiabilities = cumulativeExpenses
      .filter(e => {
        const catInfo = categoryMap.get(e.categoryId) || categoryMap.get((e.category || '').toLowerCase());
        return catInfo?.type === 'Liability';
      })
      .reduce((sum, e) => sum + e.amount, 0);

    const netWorth = totalAssets - totalLiabilities;
    
    // Group Income by category
    const incomeByCategory = filteredExpenses
      .filter(e => {
        const catInfo = categoryMap.get(e.categoryId) || categoryMap.get((e.category || '').toLowerCase());
        return catInfo?.type === 'Income';
      })
      .reduce((acc: any, e) => {
        const catInfo = categoryMap.get(e.categoryId) || categoryMap.get((e.category || '').toLowerCase());
        const cat = (catInfo?.name || e.category || 'Uncategorized').toLowerCase().trim();
        acc[cat] = (acc[cat] || 0) + e.amount;
        return acc;
      }, {});

    // Group Expense by category
    const expenseByCategory = filteredExpenses
      .filter(e => {
        const catInfo = categoryMap.get(e.categoryId) || categoryMap.get((e.category || '').toLowerCase());
        const type = catInfo?.type;
        return type === 'Expense' || !type;
      })
      .reduce((acc: any, e) => {
        const catInfo = categoryMap.get(e.categoryId) || categoryMap.get((e.category || '').toLowerCase());
        const cat = (catInfo?.name || e.category || 'Uncategorized').toLowerCase().trim();
        acc[cat] = (acc[cat] || 0) + e.amount;
        return acc;
      }, {});

    const incomeChartData = Object.entries(incomeByCategory).map(([name, value]) => ({ 
      name: name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '), 
      value 
    }));
    const chartData = Object.entries(expenseByCategory).map(([name, value]) => ({ 
      name: name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '), 
      value 
    }));

    // Budget variance
    const budgetByCategory = finData.budgets.reduce((acc: any, b) => {
      const catName = b.name || b.category || 'Uncategorized';
      const catKey = catName.toLowerCase().trim();
      acc[catKey] = {
        budget: (acc[catKey]?.budget || 0) + b.budget,
        originalName: catName // Keep name for display
      };
      return acc;
    }, {});

    const varianceData = Object.entries(budgetByCategory).map(([catKey, budgetInfo]: [string, any]) => {
      const actual = (incomeByCategory[catKey] || 0) + (expenseByCategory[catKey] || 0);
      return {
        category: budgetInfo.originalName,
        budget: budgetInfo.budget,
        actual,
        variance: budgetInfo.budget - actual,
        percent: budgetInfo.budget > 0 ? (actual / budgetInfo.budget) * 100 : 0
      };
    }).sort((a, b) => b.budget - a.budget);

    // Time-series data
    const sortedExpenses = [...filteredExpenses].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const timeSeries = sortedExpenses.reduce((acc: any, exp) => {
      const dateObj = new Date(exp.date);
      if (isNaN(dateObj.getTime())) return acc;
      const month = dateObj.toLocaleDateString('en-US', { month: 'short' });
      acc[month] = (acc[month] || 0) + exp.amount;
      return acc;
    }, {});
    
    const lineChartData = Object.keys(timeSeries).map(month => ({ date: month, amount: timeSeries[month] }));
    
    // Dedicated Income and Expense trends
    const incomeTrendData = Object.keys(timeSeries).map(month => {
      const amount = filteredExpenses
        .filter(e => {
          const m = new Date(e.date).toLocaleDateString('en-US', { month: 'short' });
          const catInfo = categoryMap.get(e.categoryId) || categoryMap.get((e.category || '').toLowerCase());
          return m === month && catInfo?.type === 'Income';
        })
        .reduce((sum, e) => sum + e.amount, 0);
      return { date: month, amount };
    });

    const expenseTrendData = Object.keys(timeSeries).map(month => {
      const amount = filteredExpenses
        .filter(e => {
          const m = new Date(e.date).toLocaleDateString('en-US', { month: 'short' });
          const catInfo = categoryMap.get(e.categoryId) || categoryMap.get((e.category || '').toLowerCase());
          const type = catInfo?.type;
          return m === month && (type === 'Expense' || !type);
        })
        .reduce((sum, e) => sum + e.amount, 0);
      return { date: month, amount };
    });

    // Period trends (Budget vs Actual by month)
    const periodData = Object.keys(timeSeries).map(month => {
      const actual = timeSeries[month];
      const budget = totalBudget;
      return {
        date: month,
        actual,
        budget,
        variance: budget - actual,
        overrun: Math.max(0, actual - budget),
        forecast: budget // Simple forecast based on current budget targets
      };
    });

    const bizType = activeBusiness ? getBusinessSettings(activeBusiness).type : 'Personal';
    const isPersonal = bizType === 'Personal';

    const recentTransactions = [...filteredExpenses]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 7);

    const recentIncomeTransactions = [...filteredExpenses]
      .filter(tx => {
        const catInfo = categoryMap.get(tx.categoryId) || categoryMap.get((tx.category || '').toLowerCase());
        return catInfo?.type === 'Income';
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);

    const recentExpenseTransactions = [...filteredExpenses]
      .filter(tx => {
        const catInfo = categoryMap.get(tx.categoryId) || categoryMap.get((tx.category || '').toLowerCase());
        const type = catInfo?.type;
        return type === 'Expense' || !type;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);

    const passiveIncomeTarget = finData.budgets
      .filter(b => b.type === 'Income' && passiveIncomeCategoryIds.includes(b.id))
      .reduce((sum, b) => sum + (b.amount || 0), 0);

    const essentialExpensesTarget = finData.budgets
      .filter(b => (b.type === 'Expense' || !b.type) && essentialExpenseCategoryIds.includes(b.id))
      .reduce((sum, b) => sum + (b.amount || 0), 0);

    return { 
      totalSpent, 
      totalBudget, 
      investmentValue, 
      totalIncome,
      totalExpenses,
      passiveIncome,
      essentialExpenses,
      passiveIncomeTarget,
      essentialExpensesTarget,
      totalAssets,
      totalLiabilities,
      netWorth,
      chartData, 
      incomeChartData,
      varianceData, 
      lineChartData,
      incomeTrendData,
      expenseTrendData,
      periodData, 
      currency, 
      recentTransactions, 
      recentIncomeTransactions, 
      recentExpenseTransactions, 
      isPersonal 
    };
  }, [filteredExpenses, cumulativeExpenses, finData.budgets, finData.investments, activeBusiness, categoryMap]);

  const renderTransactionRow = (tx: any) => (
    <div key={tx.id} className="py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors px-2 rounded-lg -mx-2">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400">
          <Clock size={16} />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900 truncate max-w-[200px] md:max-w-md">{tx.description || 'No Description'}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-slate-500 font-mono">
              {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <span className="w-1 h-1 rounded-full bg-slate-300" />
            <span className={cn(
              "text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border bg-transparent",
              (() => {
                const catInfo = categoryMap.get(tx.categoryId) || categoryMap.get((tx.category || '').toLowerCase());
                const type = catInfo?.type || 'Expense';
                switch (type) {
                  case 'Income': return "text-green-600 border-green-200";
                  case 'Asset': return "text-blue-600 border-blue-200";
                  case 'Liability': return "text-amber-600 border-orange-200";
                  default: return "text-red-600 border-red-200";
                }
              })()
            )}>
              {(categoryMap.get(tx.categoryId) || categoryMap.get((tx.category || '').toLowerCase()))?.name || tx.category || 'Uncategorized'}
            </span>
          </div>
        </div>
      </div>
      <div className="text-right">
        <p className={cn(
          "text-sm font-bold",
          (() => {
            const catInfo = categoryMap.get(tx.categoryId) || categoryMap.get((tx.category || '').toLowerCase());
            const type = catInfo?.type || 'Expense';
            return type === 'Income' ? "text-green-600" : "text-slate-900";
          })()
        )}>
          {formatCurrency(tx.amount, summary.currency)}
        </p>
        <p className={cn(
          "text-[9px] font-mono mt-0.5 uppercase font-bold",
          (() => {
            const catInfo = categoryMap.get(tx.categoryId) || categoryMap.get((tx.category || '').toLowerCase());
            const type = catInfo?.type || 'Expense';
            switch (type) {
              case 'Income': return "text-green-500";
              case 'Asset': return "text-blue-500";
              case 'Liability': return "text-amber-500";
              default: return "text-red-500";
            }
          })()
        )}>
          {(categoryMap.get(tx.categoryId) || categoryMap.get((tx.category || '').toLowerCase()))?.type || 'Expense'}
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 pb-20">


      {/* KPI SNAPSHOT */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {(() => {
          const isPersonal = summary.isPersonal;
          
          const netSavings = summary.totalIncome - summary.totalExpenses;
          const savingsRate = summary.totalIncome > 0 ? (netSavings / summary.totalIncome) * 100 : 0;
          const isPositiveSavings = netSavings >= 0;
          
          // Financial Freedom: % based on Budgeted Targets of Checked Categories
          const targetPassive = summary.passiveIncomeTarget;
          const targetEssential = summary.essentialExpensesTarget;
          
          const ffPercent = targetEssential > 0 
            ? (targetPassive / targetEssential) * 100 
            : (targetPassive > 0 ? 100 : 0);
          const ffAchieved = isPersonal && ffPercent >= 100;
          
          // Use targets for the display
          const displayPassive = targetPassive;
          const displayEssential = targetEssential;

          const budgetingProgress = summary.totalBudget > 0 ? Math.min(100, (summary.totalSpent / summary.totalBudget) * 100) : 0;
          const withinBudget = summary.totalSpent <= summary.totalBudget;

          const personalKpis = [
            { 
              label: 'Financial Freedom', 
              value: ffAchieved ? 'Achieved' : `${ffPercent.toFixed(0)}%`, 
              sub: `${formatCurrency(displayPassive, summary.currency)} / ${formatCurrency(displayEssential, summary.currency)}`, 
              icon: TrendingUp, 
              color: 'text-white', 
              bg: 'bg-white/20',
              cardBg: 'bg-gradient-to-br from-purple-600 to-indigo-700',
              labelColor: 'text-white/70',
              valueColor: 'text-white',
              subColor: 'text-white/60',
              tooltip: "Financial Freedom achieved when Passive Income exceeds Essential Expenses",
              hasSettings: true
            },
            { 
              label: 'Budgeting', 
              value: formatCurrency(summary.totalSpent, summary.currency), 
              sub: `${budgetingProgress.toFixed(0)}% of ${formatCurrency(summary.totalBudget, summary.currency)}`, 
              icon: PieChartIcon, 
              color: 'text-white', 
              bg: 'bg-white/20',
              cardBg: 'bg-gradient-to-br from-rose-500 to-red-700',
              labelColor: 'text-white/70',
              valueColor: 'text-white',
              subColor: 'text-white/60',
              progressBar: budgetingProgress
            },
            { 
              label: 'Savings', 
              value: formatCurrency(netSavings, summary.currency), 
              sub: `${savingsRate.toFixed(1)}% Savings Rate`, 
              icon: isPositiveSavings ? ArrowUpRight : ArrowDownRight, 
              color: 'text-white', 
              bg: 'bg-white/20',
              cardBg: 'bg-gradient-to-br from-[#86BC24] to-[#6DA31A]',
              labelColor: 'text-white/70',
              valueColor: 'text-white',
              subColor: 'text-white/60'
            },
            { 
              label: 'Net Worth', 
              value: formatCurrency(summary.netWorth, summary.currency), 
              sub: 'Assets - Liabilities', 
              icon: Activity, 
              color: 'text-white', 
              bg: 'bg-white/20',
              cardBg: 'bg-gradient-to-br from-blue-600 to-blue-800',
              labelColor: 'text-white/70',
              valueColor: 'text-white',
              subColor: 'text-white/60'
            },
          ];

          const businessKpis = [
            { 
              label: 'Budgeting', 
              value: formatCurrency(summary.totalSpent, summary.currency), 
              sub: `${budgetingProgress.toFixed(0)}% of limit`, 
              icon: PieChartIcon, 
              color: 'text-white', 
              bg: 'bg-white/20',
              cardBg: 'bg-gradient-to-br from-rose-500 to-red-700',
              labelColor: 'text-white/70',
              valueColor: 'text-white',
              subColor: 'text-white/60',
              progressBar: budgetingProgress
            },
            { 
              label: 'Profit', 
              value: formatCurrency(netSavings, summary.currency), 
              sub: `${(summary.totalIncome > 0 ? (netSavings / summary.totalIncome) * 100 : 0).toFixed(1)}% Margin`, 
              icon: isPositiveSavings ? ArrowUpRight : ArrowDownRight, 
              color: 'text-white', 
              bg: 'bg-white/20',
              cardBg: 'bg-gradient-to-br from-[#86BC24] to-[#6DA31A]',
              labelColor: 'text-white/70',
              valueColor: 'text-white',
              subColor: 'text-white/60'
            },
            { 
              label: 'Revenue', 
              value: formatCurrency(summary.totalIncome, summary.currency), 
              sub: 'Total Inflow', 
              icon: TrendingUp, 
              color: 'text-white', 
              bg: 'bg-white/20',
              cardBg: 'bg-gradient-to-br from-indigo-600 to-indigo-800',
              labelColor: 'text-white/70',
              valueColor: 'text-white',
              subColor: 'text-white/60'
            },
            { 
              label: 'Net Worth', 
              value: formatCurrency(summary.netWorth, summary.currency), 
              sub: 'Asset Position', 
              icon: Activity, 
              color: 'text-white', 
              bg: 'bg-white/20',
              cardBg: 'bg-gradient-to-br from-blue-600 to-blue-800',
              labelColor: 'text-white/70',
              valueColor: 'text-white',
              subColor: 'text-white/60'
            },
          ];

          const kpis = isPersonal ? personalKpis : businessKpis;

          return kpis.map((kpi: any, idx) => (
            <div 
              key={idx} 
              title={kpi.tooltip}
              className={cn(
                "dashboard-card shadow-sm p-6 flex flex-col justify-between hover:shadow-md transition-all group",
                kpi.cardBg
              )}
            >
              <div className="flex items-center justify-between mb-4">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", kpi.bg, kpi.color)}>
                  <kpi.icon size={20} />
                </div>
                <div className="flex items-center gap-2">
                  {kpi.hasSettings && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); setIsFFModalOpen(true); }}
                      className={cn(
                        "p-2 rounded-lg transition-all",
                        kpi.cardBg?.includes('bg-[#86BC24]') ? "text-white/60 hover:text-white hover:bg-white/10" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                      )}
                      title="Financial Freedom Settings"
                    >
                      <Settings size={16} />
                    </button>
                  )}
                  {idx === 0 && (
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider",
                      kpi.cardBg?.includes('bg-[#86BC24]') ? "bg-white/20 text-white" : "bg-slate-900 text-white"
                    )}>Live</span>
                  )}
                </div>
              </div>
              <div>
                <p className={cn("text-[10px] font-bold uppercase tracking-widest", kpi.labelColor || "text-slate-400")}>{kpi.label}</p>
                <h3 className={cn("text-2xl font-bold mt-1 tracking-tight", kpi.valueColor || "text-slate-900")}>{kpi.value}</h3>
                
                {kpi.progressBar !== undefined ? (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-tighter">
                      <span className="text-slate-400">Usage</span>
                      <span className={cn(kpi.progressBar > 90 ? "text-red-500" : "text-slate-600")}>{kpi.progressBar.toFixed(0)}%</span>
                    </div>
                    <div className="w-full h-1 bg-slate-200/50 rounded-full overflow-hidden">
                      <div 
                        className={cn("h-full transition-all duration-1000", kpi.color.replace('text-', 'bg-'))}
                        style={{ width: `${kpi.progressBar}%` }}
                      />
                    </div>
                    <p className="text-[9px] text-slate-400 mt-1 italic">{kpi.sub}</p>
                  </div>
                ) : (
                  <p className={cn(
                    "text-[10px] mt-2 font-medium inline-block px-2 py-1 rounded border italic",
                    kpi.subColor ? (kpi.cardBg?.includes('bg-[#86BC24]') ? "bg-white/10 text-white/90 border-white/20" : "bg-white/50 text-slate-500 border-slate-100") : "bg-slate-50 text-slate-500 border-slate-100"
                  )}>{kpi.sub}</p>
                )}
              </div>
            </div>
          ));
        })()}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income Trend Chart */}
        <div className="dashboard-card shadow-sm h-full flex flex-col">
          <div className="mb-6 shrink-0 flex items-center justify-between">
            <div>
              <p className="stat-label m-0 text-emerald-900">Income</p>
              <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-bold">Inflow distribution by category</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
              <PieChartIcon size={16} />
            </div>
          </div>
          <div className="flex-1 min-h-[300px]">
             <PortfolioPieChart 
               data={summary.incomeChartData} 
               height="100%" 
               currencyCode={summary.currency}
             />
          </div>
        </div>

        {/* Expense Pie Chart */}
        <div className="dashboard-card shadow-sm h-full flex flex-col">
          <div className="mb-6 shrink-0 flex items-center justify-between">
            <div>
              <p className="stat-label m-0 text-rose-900">Expense</p>
              <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-bold">Outflow distribution by category</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
              <PieChartIcon size={16} />
            </div>
          </div>
          <div className="flex-1 min-h-[300px]">
            <PortfolioPieChart 
              data={summary.chartData} 
              height="100%" 
              currencyCode={summary.currency}
            />
          </div>
        </div>

        {/* Budget Overview Bar Chart - Full Width */}
        <div className="dashboard-card shadow-sm h-full flex flex-col lg:col-span-2">
          <div className="mb-6 shrink-0 flex items-center justify-between">
            <div>
              <p className="stat-label m-0 text-slate-900">Budget</p>
              <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-bold">Budget vs Expense vs Variance comparison</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-600">
              <Activity size={16} />
            </div>
          </div>
          <div className="flex-1 min-h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart 
                data={summary.varianceData} 
                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis 
                  dataKey="category" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748B', fontSize: 10 }}
                  interval={0}
                  angle={-45}
                  textAnchor="end"
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748B', fontSize: 10 }}
                  tickFormatter={(value) => formatCurrency(value, summary.currency)}
                />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(value: number) => [formatCurrency(value, summary.currency), '']}
                />
                <Legend 
                  verticalAlign="top" 
                  align="right"
                  wrapperStyle={{ paddingBottom: '20px', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold' }}
                />
                <Line name="Budget" type="monotone" dataKey="budget" stroke="#1E293B" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line name="Expense" type="monotone" dataKey="actual" stroke="#F43F5E" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line name="Variance" type="monotone" dataKey="variance" stroke="#86BC24" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* RISKS at the bottom, full width */}
      <div className="grid grid-cols-1 gap-6">
        <div className="dashboard-card shadow-sm">
          <p className="stat-label mb-6">RISKS</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex gap-4 items-start p-4 bg-red-50/30 rounded-xl border border-red-100/50">
              <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444] mt-1.5 shrink-0" />
              <div>
                <p className="font-bold text-slate-900 tracking-tight">High Variance</p>
                <p className="text-slate-500 text-xs mt-1 leading-relaxed">Utility bill is 40% higher than historical average based on seasonal trends.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start p-4 bg-amber-50/30 rounded-xl border border-amber-100/50">
              <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] mt-1.5 shrink-0" />
              <div>
                <p className="font-bold text-slate-900 tracking-tight">Subscription Bloat</p>
                <p className="text-slate-500 text-xs mt-1 leading-relaxed">3 overlapping streaming services detected in recent transaction history.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start p-4 bg-emerald-50/30 rounded-xl border border-emerald-100/50">
              <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] mt-1.5 shrink-0" />
              <div>
                <p className="font-bold text-slate-900 tracking-tight">Investment Opportunity</p>
                <p className="text-slate-500 text-xs mt-1 leading-relaxed">Excess cash reserves detected above your defined liquidity safety buffer.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <FinancialFreedomModal 
        isOpen={isFFModalOpen}
        onClose={() => setIsFFModalOpen(false)}
      />
    </div>
  );
}
