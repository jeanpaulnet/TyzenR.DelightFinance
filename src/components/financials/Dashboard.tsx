import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../../AppContext';
import { formatCurrency, cn } from '../../lib/utils';
import { logEvent } from '../../lib/audit';
import { 
  ArrowUpRight, 
  ArrowDownRight,
  Activity,
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { VarianceTrendChart, PortfolioPieChart } from '../ui/FinancialCharts';

export default function Dashboard() {
  const { finData, user, dateFilter, activeBusinessId, businesses } = useApp();
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

  const summary = useMemo(() => {
    const currency = activeBusiness?.currency || 'USD';
    const totalSpent = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
    const totalBudget = finData.budgets.reduce((sum, b) => sum + b.amount, 0);
    const investmentValue = finData.investments.reduce((sum, i) => sum + (i.quantity * i.purchasePrice), 0);
    
    // Group by category
    const byCategory = filteredExpenses.reduce((acc: any, e) => {
      const cat = e.category.toLowerCase().trim();
      acc[cat] = (acc[cat] || 0) + e.amount;
      return acc;
    }, {});

    const chartData = Object.entries(byCategory).map(([name, value]) => ({ name, value }));

    // Budget variance
    const budgetByCategory = finData.budgets.reduce((acc: any, b) => {
      const cat = b.category.toLowerCase().trim();
      acc[cat] = {
        amount: (acc[cat]?.amount || 0) + b.amount,
        originalName: b.category // Keep name for display
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

    return { totalSpent, totalBudget, investmentValue, chartData, varianceData, lineChartData, periodData, currency };
  }, [filteredExpenses, finData.budgets, finData.investments, activeBusiness]);

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{activeBusiness?.name || 'Overview'}</h1>
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
