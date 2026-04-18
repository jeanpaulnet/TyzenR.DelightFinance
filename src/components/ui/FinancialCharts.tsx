import React from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
  ComposedChart
} from 'recharts';
import { formatCurrency } from '../../lib/utils';

const COLORS = ['#86BC24', '#75A51F', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4'];

interface ChartProps {
  data: any[];
  height?: number;
}

/**
 * Composed chart for showing budget vs actual trends over time
 */
export const VarianceTrendChart: React.FC<ChartProps> = ({ data, height = 300 }) => {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
          <XAxis 
            dataKey="date" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#64748B', fontSize: 10 }}
            dy={10}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#64748B', fontSize: 10 }}
            tickFormatter={(value) => `$${value}`}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px' }}
            formatter={(value: number) => formatCurrency(value)}
          />
          <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', paddingBottom: '20px' }} />
          <Bar dataKey="budget" fill="aliceblue" name="Monthly Budget" radius={[4, 4, 0, 0]} barSize={40} />
          <Line type="monotone" dataKey="actual" stroke="#86BC24" name="Actual Spending" strokeWidth={3} dot={{ fill: '#86BC24', r: 4 }} activeDot={{ r: 6 }} />
          <Line type="monotone" dataKey="variance" stroke="#F43F5E" name="Variance" strokeWidth={2} strokeDasharray="5 5" dot={false} />
          <Line type="monotone" dataKey="forecast" stroke="#6366F1" name="Forecast" strokeWidth={2} strokeDasharray="3 3" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

/**
 * Composed chart for COMPUTE analysis: Variances, Trends, and Overruns
 */
export const ComputeChart: React.FC<ChartProps> = ({ data, height = 300 }) => {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <defs>
            <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366F1" stopOpacity={0.1}/>
              <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
          <XAxis 
            dataKey="date" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#64748B', fontSize: 10 }}
            dy={10}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#64748B', fontSize: 10 }}
            tickFormatter={(value) => `$${value}`}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px' }}
            formatter={(value: number) => formatCurrency(value)}
          />
          <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', paddingBottom: '20px' }} />
          
          <Area type="monotone" dataKey="actual" fill="url(#colorTrend)" stroke="#6366F1" name="Spending Trend" strokeWidth={2} />
          <Bar dataKey="overrun" fill="#F43F5E" name="Budget Overrun" radius={[4, 4, 0, 0]} barSize={24} />
          <Line type="monotone" dataKey="variance" stroke="#F59E0B" name="Target Variance" strokeWidth={2} dot={true} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

/**
 * Line chart for displaying expenses or values over time
 */
export const ExpenseLineChart: React.FC<ChartProps> = ({ data, height = 300 }) => {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorSpent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#86BC24" stopOpacity={0.1}/>
              <stop offset="95%" stopColor="#86BC24" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
          <XAxis 
            dataKey="date" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#64748B', fontSize: 10 }} 
            dy={10}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#64748B', fontSize: 10 }}
            tickFormatter={(value) => `$${value}`}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px' }}
            formatter={(value: number) => [formatCurrency(value), 'Amount']}
          />
          <Area 
            type="monotone" 
            dataKey="amount" 
            stroke="#86BC24" 
            strokeWidth={2}
            fillOpacity={1} 
            fill="url(#colorSpent)" 
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

/**
 * Bar chart for Budget vs Actual comparisons
 */
export const BudgetBarChart: React.FC<ChartProps> = ({ data, height = 300 }) => {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }} barGap={8}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
          <XAxis 
            dataKey="category" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#64748B', fontSize: 11 }}
            dy={10}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#64748B', fontSize: 11 }}
            tickFormatter={(value) => `$${value}`}
          />
          <Tooltip 
             contentStyle={{ backgroundColor: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px' }}
             formatter={(value: number) => formatCurrency(value)}
          />
          <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', paddingBottom: '20px' }} />
          <Bar dataKey="budget" fill="aliceblue" radius={[4, 4, 0, 0]} name="Budget" barSize={32} />
          <Bar dataKey="actual" fill="#86BC24" radius={[4, 4, 0, 0]} name="Actual" barSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

/**
 * Pie chart for Portfolio Allocation
 */
export const PortfolioPieChart: React.FC<ChartProps> = ({ data, height = 300 }) => {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={5}
            dataKey="value"
            animationBegin={0}
            animationDuration={1500}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px' }}
            formatter={(value: number) => formatCurrency(value)}
          />
          <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '11px', paddingTop: '20px' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};
