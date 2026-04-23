import React, { useMemo, useState, useEffect } from 'react';
import { useApp, getBusinessSettings } from '../../AppContext';
import { formatCurrency, cn } from '../../lib/utils';
import { logEvent } from '../../lib/audit';
import { 
  ArrowUpRight, 
  ArrowDownRight,
  Activity,
  Clock,
  ArrowRight,
  TrendingUp,
  PieChart as PieChartIcon
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { VarianceTrendChart, PortfolioPieChart } from '../ui/FinancialCharts';

export default function Dashboard() {
  const { finData, user, dateFilter, activeBusinessId, businesses, setActiveTab } = useApp();
  const [chartType, setChartType] = useState<'bars' | 'lines'>('bars');

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

  const filteredExpenses = useMemo(() => {
    return finData.expenses.filter(e => {
      const expDate = e.date.split('T')[0];
      return expDate >= dateFilter.startDate && expDate <= dateFilter.endDate;
    });
  }, [finData.expenses, dateFilter]);

  // Map of category names to their types for color coding
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    finData.budgets.forEach(b => {
      if (b.category) {
        map.set(b.category.toLowerCase(), b.type || 'Expense');
      }
    });
    return map;
  }, [finData.budgets]);

  const summary = useMemo(() => {
    const settings = activeBusiness ? getBusinessSettings(activeBusiness) : null;
    const currency = settings?.currency || 'USD';
    const totalSpent = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
    const totalBudget = finData.budgets.reduce((sum, b) => sum + b.amount, 0);
    const investmentValue = finData.investments.reduce((sum, i) => sum + (i.quantity * i.purchasePrice), 0);
    
    // Group by category
    const byCategory = filteredExpenses.reduce((acc: any, e) => {
      const cat = (e.category || 'Uncategorized').toLowerCase().trim();
      acc[cat] = (acc[cat] || 0) + e.amount;
      return acc;
    }, {});

    const chartData = Object.entries(byCategory).map(([name, value]) => ({ name, value }));

    // Budget variance
    const budgetByCategory = finData.budgets.reduce((acc: any, b) => {
      const cat = (b.category || 'Uncategorized').toLowerCase().trim();
      acc[cat] = {
        amount: (acc[cat]?.amount || 0) + b.amount,
        originalName: b.category || 'Uncategorized' // Keep name for display
      };
      return acc;
    }, {});

    const varianceData = Object.entries(budgetByCategory).map(([catKey, budgetInfo]: [string, any]) => {
      const actual = byCategory[catKey] || 0;
      return {
        category: budgetInfo.originalName,
        budget: budgetInfo.amount,
        actual,
        variance: budgetInfo.amount - actual,
        percent: budgetInfo.amount > 0 ? (actual / budgetInfo.amount) * 100 : 0
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

    const recentTransactions = [...filteredExpenses]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);

    return { totalSpent, totalBudget, investmentValue, chartData, varianceData, lineChartData, periodData, currency, recentTransactions };
  }, [filteredExpenses, finData.budgets, finData.investments, activeBusiness]);

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{activeBusiness?.name || 'Overview'}</h1>
          <p className="text-sm text-slate-500 mt-1">Unified Health KPIs & Performance Analytics</p>
        </div>
      </div>

      {/* KPI SNAPSHOT */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="dashboard-card shadow-sm p-6 bg-white border border-slate-100 flex flex-col justify-between">
           <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Burn Rate</p>
              <h3 className="text-2xl font-bold text-slate-900">{formatCurrency(summary.totalSpent / 30, summary.currency)}<span className="text-xs text-slate-400 font-medium ml-1">/ day</span></h3>
           </div>
           <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-red-500 uppercase">
              <ArrowUpRight size={14} />
              Avg lifecycle expenditure
           </div>
        </div>
        <div className="dashboard-card shadow-sm p-6 bg-white border border-slate-100 flex flex-col justify-between">
           <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Savings Rate</p>
              <h3 className="text-2xl font-bold text-slate-900">{Math.max(0, 100 - (summary.totalSpent / Math.max(1, summary.totalBudget) * 100)).toFixed(1)}%</h3>
           </div>
           <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-emerald-500 uppercase">
              <Activity size={14} />
              Post-expense liquidity
           </div>
        </div>
        <div className="dashboard-card shadow-sm p-6 bg-white border border-slate-100 flex flex-col justify-between">
           <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Budget Health</p>
              <h3 className="text-2xl font-bold text-slate-900">{(summary.totalSpent <= summary.totalBudget ? 100 : Math.max(0, 100 - ((summary.totalSpent - summary.totalBudget) / summary.totalBudget * 100))).toFixed(1)}%</h3>
           </div>
           <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-indigo-500 uppercase">
              <PieChartIcon size={14} />
              Compliance score
           </div>
        </div>
        <div className="dashboard-card shadow-sm p-6 bg-[#0F172A] border border-slate-800 flex flex-col justify-between">
           <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Portfolio Value</p>
              <h3 className="text-2xl font-bold text-white">{formatCurrency(summary.investmentValue, summary.currency)}</h3>
           </div>
           <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-[#86BC24] uppercase">
              <TrendingUp size={14} />
              Cumulative Assets
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="dashboard-card shadow-sm h-full flex flex-col">
          <div className="mb-6 shrink-0">
            <p className="stat-label m-0 text-slate-900">Spending By Category</p>
            <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-bold">Expense distribution across categories</p>
          </div>
          <div className="flex-1 min-h-[350px]">
            <PortfolioPieChart 
              data={summary.chartData} 
              height="100%" 
              currencyCode={summary.currency}
            />
          </div>
        </div>

        <div className="dashboard-card shadow-sm h-full flex flex-col">
          <div className="flex items-center justify-between mb-6 shrink-0">
            <div>
               <p className="stat-label m-0 text-slate-900">Financial Performance</p>
               <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-bold">Budget vs Actuals vs Forecast</p>
            </div>
            <div className="flex items-center bg-slate-100 p-1 rounded-lg">
              <button 
                onClick={() => setChartType('bars')}
                className={cn(
                  "px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all",
                  chartType === 'bars' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                Bars
              </button>
              <button 
                onClick={() => setChartType('lines')}
                className={cn(
                  "px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all",
                  chartType === 'lines' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                Lines
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-[350px]">
             <VarianceTrendChart 
               key={`variance-${summary.periodData.length}-${dateFilter.startDate}-${dateFilter.endDate}-${chartType}`} 
               data={summary.periodData} 
               height="100%" 
               type={chartType} 
               currencyCode={summary.currency}
             />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="dashboard-card shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="stat-label m-0 text-slate-900">Recent Transactions</p>
              <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-bold">Latest activity in this period</p>
            </div>
            <button 
              onClick={() => setActiveTab('transactions')}
              className="group flex items-center gap-1.5 text-[10px] font-bold text-[#86BC24] uppercase tracking-widest hover:text-[#75A51F] transition-colors"
            >
              View All <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
          
          <div className="divide-y divide-slate-100">
            {summary.recentTransactions.length > 0 ? (
              summary.recentTransactions.map((tx) => (
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
                            const catKey = (tx.category || 'Uncategorized').toLowerCase();
                            const type = categoryMap.get(catKey) || 'Expense';
                            switch (type) {
                              case 'Income': return "text-green-600 border-green-200";
                              case 'Asset': return "text-blue-600 border-blue-200";
                              case 'Liability': return "text-amber-600 border-orange-200";
                              default: return "text-red-600 border-red-200";
                            }
                          })()
                        )}>
                          {tx.category || 'Uncategorized'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      "text-sm font-bold",
                      (() => {
                        const catKey = (tx.category || 'Uncategorized').toLowerCase();
                        const type = categoryMap.get(catKey) || 'Expense';
                        return type === 'Income' ? "text-green-600" : "text-slate-900";
                      })()
                    )}>
                      {formatCurrency(tx.amount, summary.currency)}
                    </p>
                    <p className={cn(
                      "text-[9px] font-mono mt-0.5 uppercase font-bold",
                      (() => {
                        const catKey = (tx.category || 'Uncategorized').toLowerCase();
                        const type = categoryMap.get(catKey) || 'Expense';
                        switch (type) {
                          case 'Income': return "text-green-500";
                          case 'Asset': return "text-blue-500";
                          case 'Liability': return "text-amber-500";
                          default: return "text-red-500";
                        }
                      })()
                    )}>
                      {categoryMap.get((tx.category || 'Uncategorized').toLowerCase()) || 'Expense'}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-12 text-center">
                <p className="text-sm text-slate-400 font-medium italic">No transactions found for this period</p>
              </div>
            )}
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
    </div>
  );
}
