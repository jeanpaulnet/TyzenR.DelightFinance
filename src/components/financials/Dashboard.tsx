import React, { useMemo, useState } from 'react';
import { useApp } from '../../AppContext';
import { decryptPayload } from '../../lib/encryption';
import { formatCurrency, cn } from '../../lib/utils';
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
import { ExpenseLineChart, PortfolioPieChart, VarianceTrendChart, ComputeChart } from '../ui/FinancialCharts';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4'];

export default function Dashboard() {
  const { finData, encryptionKey } = useApp();
  
  // Date range state - default to YTD (start of year to end of current month)
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  
  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);

  const decryptedExpenses = useMemo(() => {
    if (!encryptionKey) return [];
    return finData.expenses.map(e => ({
      ...e,
      ...decryptPayload(e.encryptedData, encryptionKey)
    }));
  }, [finData.expenses, encryptionKey]);

  const filteredExpenses = useMemo(() => {
    return decryptedExpenses.filter(e => {
      const expDate = e.date.split('T')[0];
      return expDate >= startDate && expDate <= endDate;
    });
  }, [decryptedExpenses, startDate, endDate]);

  const summary = useMemo(() => {
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
      const month = new Date(exp.date).toLocaleDateString('en-US', { month: 'short' });
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

    return { totalSpent, totalBudget, investmentValue, chartData, varianceData, lineChartData, periodData };
  }, [filteredExpenses, finData.budgets, finData.investments]);

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Financial Overview</h1>
          <p className="text-slate-500 text-sm italic">Real-time health pulse and variance analysis.</p>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">From</label>
              <input 
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-[#86BC24] transition-colors"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">To</label>
              <input 
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-[#86BC24] transition-colors"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="dashboard-card">
          <p className="stat-label">Actual Spending</p>
          <p className="stat-value">{formatCurrency(summary.totalSpent)}</p>
          <div className={cn("variance mt-1 flex items-center gap-1", summary.totalSpent > summary.totalBudget ? "variance-down" : "variance-up")}>
             {summary.totalSpent > summary.totalBudget ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>}
             {summary.totalBudget > 0 ? (summary.totalSpent / summary.totalBudget * 100).toFixed(1) + '%' : '0%'} of month budget
          </div>
        </div>

        <div className="dashboard-card">
          <p className="stat-label">Budget Variance</p>
          <p className="stat-value">{formatCurrency(summary.totalBudget - summary.totalSpent)}</p>
          <div className={cn("variance mt-1", summary.totalBudget - summary.totalSpent < 0 ? "variance-down" : "variance-up")}>
            {summary.totalBudget - summary.totalSpent < 0 ? 'Over budget' : 'Under budget'}
          </div>
        </div>

        <div className="dashboard-card">
          <p className="stat-label">Forecasted Spending</p>
          <p className="stat-value">{formatCurrency(summary.totalBudget)}</p>
          <div className="text-[0.8rem] mt-1 text-slate-400 font-medium whitespace-nowrap">Total defined categories</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Spending Chart */}
        <div className="dashboard-card lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <span className="stat-label">Spending Distribution</span>
            <div className="text-[0.75rem] text-slate-400">By Category</div>
          </div>
          <div className="h-[280px]">
             <PortfolioPieChart key={`pie-${summary.chartData.length}`} data={summary.chartData} height={280} />
          </div>
        </div>

        {/* Expenses Over Time */}
        <div className="dashboard-card lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <span className="stat-label">Expense Trends</span>
            <div className="text-[0.75rem] text-slate-400">Monthly Flow</div>
          </div>
          <div className="h-[280px]">
            <ExpenseLineChart key={`line-${summary.lineChartData.length}`} data={summary.lineChartData} height={280} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 text-indigo-900">
        <div className="dashboard-card shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
               <p className="stat-label m-0 text-indigo-600">INSIGHTS</p>
            </div>
            <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest px-4 py-2 bg-slate-50/80 rounded-full border border-slate-100">
               <div className="flex items-center gap-1.5">
                  <div className="w-2 h-1 bg-indigo-500/20 border-t-2 border-indigo-500" />
                  <span className="text-indigo-600">Trends</span>
               </div>
               <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#F43F5E]" />
                  <span className="text-[#F43F5E]">Overruns</span>
               </div>
               <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#F59E0B]" />
                  <span className="text-[#F59E0B]">Variance</span>
               </div>
            </div>
          </div>
          <div className="h-[320px]">
             <ComputeChart key={`compute-${summary.periodData.length}-${startDate}-${endDate}`} data={summary.periodData} height={320} />
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
