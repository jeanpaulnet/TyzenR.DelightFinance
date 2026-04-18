import React, { useState, useMemo } from 'react';
import { useApp } from '../../AppContext';
import { formatCurrency, cn } from '../../lib/utils';
import { db } from '../../lib/firebase';
import { collection, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { 
  TrendingUp, 
  Trash2, 
  Plus, 
  BarChart3, 
  Layers, 
  DollarSign,
  PieChart as PieIcon
} from 'lucide-react';
import { PortfolioPieChart } from '../ui/FinancialCharts';
import { motion } from 'motion/react';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4'];

export default function InvestmentTracker() {
  const { finData, user } = useApp();
  const [newInv, setNewInv] = useState({ symbol: '', quantity: 0, purchasePrice: 0, assetClass: 'Stock' });
  const [showAdd, setShowAdd] = useState(false);

  const stats = useMemo(() => {
    const totalBasis = finData.investments.reduce((sum, i) => sum + (i.quantity * i.purchasePrice), 0);
    
    // Allocation by asset class
    const allocation = finData.investments.reduce((acc: any, i) => {
      acc[i.assetClass] = (acc[i.assetClass] || 0) + (i.quantity * i.purchasePrice);
      return acc;
    }, {});

    const chartData = Object.entries(allocation).map(([name, value]) => ({ name, value }));
    return { totalBasis, chartData };
  }, [finData.investments]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      await addDoc(collection(db, 'users', user.uid, 'investments'), {
        ...newInv,
        userId: user.uid,
        createdAt: new Date().toISOString()
      });
      setNewInv({ symbol: '', quantity: 0, purchasePrice: 0, assetClass: 'Stock' });
      setShowAdd(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'investments', id));
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight text-indigo-900">Investment Portfolio</h1>
          <p className="text-slate-500 italic">As-is analysis of your financial health assets.</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary flex items-center gap-2">
          <Plus size={18} />
          Add Asset
        </button>
      </div>

      {showAdd && (
        <motion.form 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          onSubmit={handleAdd} 
          className="dashboard-card grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end"
        >
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Symbol</label>
            <input 
              value={newInv.symbol} onChange={e => setNewInv({...newInv, symbol: e.target.value})}
              placeholder="AAPL" required className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Quantity</label>
            <input 
              type="number" step="any" value={newInv.quantity} onChange={e => setNewInv({...newInv, quantity: parseFloat(e.target.value)})}
              required className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Avg. Cost</label>
            <input 
              type="number" step="any" value={newInv.purchasePrice} onChange={e => setNewInv({...newInv, purchasePrice: parseFloat(e.target.value)})}
              required className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Class</label>
            <select 
              value={newInv.assetClass} onChange={e => setNewInv({...newInv, assetClass: e.target.value})}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
            >
              <option>Stock</option>
              <option>Bond</option>
              <option>ETF</option>
              <option>Crypto</option>
              <option>Real Estate</option>
            </select>
          </div>
          <button type="submit" className="btn-primary py-2 h-[42px]">Save Asset</button>
        </motion.form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 dashboard-card overflow-hidden flex flex-col">
          <h3 className="text-lg font-bold text-indigo-900 mb-6 flex items-center gap-2">
            <Layers size={18} />
            Holdings Summary
          </h3>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-slate-400 font-medium border-b border-slate-100">
                  <th className="pb-4">Asset</th>
                  <th className="pb-4">Quantity</th>
                  <th className="pb-4">Avg Cost</th>
                  <th className="pb-4">Total Basis</th>
                  <th className="pb-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {finData.investments.map((inv) => (
                  <tr key={inv.id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="py-4">
                      <p className="font-bold text-slate-900">{inv.symbol}</p>
                      <p className="text-xs text-slate-400">{inv.assetClass}</p>
                    </td>
                    <td className="py-4 font-mono">{inv.quantity}</td>
                    <td className="py-4 font-mono">{formatCurrency(inv.purchasePrice)}</td>
                    <td className="py-4 font-mono font-bold">{formatCurrency(inv.quantity * inv.purchasePrice)}</td>
                    <td className="py-4 text-right">
                      <button 
                        onClick={() => handleDelete(inv.id)}
                        className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {finData.investments.length === 0 && (
                  <tr><td colSpan={5} className="py-10 text-center text-slate-400">No assets tracked yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="dashboard-card flex flex-col">
          <h3 className="text-lg font-bold text-indigo-900 mb-6 flex items-center gap-2">
            <PieIcon size={18} />
            Asset Allocation
          </h3>
          <div className="flex-1 min-h-[300px]">
            <PortfolioPieChart data={stats.chartData} height={300} />
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-sm text-slate-500">Total Portfolio Value (Basis)</p>
            <p className="text-2xl font-bold text-indigo-600">{formatCurrency(stats.totalBasis)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
