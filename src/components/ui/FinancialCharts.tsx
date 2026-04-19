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

const COLORS = ['#002776', '#00a1de', '#86BC24', '#75A51F', '#ec4899', '#f43f5e', '#f97316', '#eab308'];
const CATEGORY_COLORS = ['#EC4899', '#84CC16', '#06B6D4', '#22C55E', '#1D4ED8', '#F97316', '#8B5CF6', '#EAB308'];

interface ChartProps {
  data: any[];
  height?: number | string;
  colors?: string[];
  currencySymbol?: string;
  currencyCode?: string;
}

interface VarianceChartProps extends ChartProps {
  type?: 'bars' | 'lines';
}

/**
 * Chart for showing budget vs actual trends over time (Bars or Lines)
 */
export const VarianceTrendChart: React.FC<VarianceChartProps> = ({ data, height = 300, type = 'bars', currencyCode = 'USD' }) => {
  if (type === 'lines') {
    return (
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
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
              tickFormatter={(value) => formatCurrency(value, currencyCode)}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px' }}
              formatter={(value: number) => formatCurrency(value, currencyCode)}
            />
            <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', paddingBottom: '20px' }} />
            <Line type="monotone" dataKey="budget" stroke="#002776" name="Budget" strokeWidth={2} dot={false} strokeDasharray="5 5" />
            <Line type="monotone" dataKey="actual" stroke="#86BC24" name="Actual" strokeWidth={3} dot={{ fill: '#86BC24', r: 4 }} activeDot={{ r: 6 }} />
            <Line type="monotone" dataKey="forecast" stroke="#00a1de" name="Forecast" strokeWidth={2} dot={false} strokeDasharray="3 3" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 20 }} barGap={2}>
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
            tickFormatter={(value) => formatCurrency(value, currencyCode)}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px' }}
            formatter={(value: number) => formatCurrency(value, currencyCode)}
          />
          <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', paddingBottom: '20px' }} />
          <Bar dataKey="budget" fill="#002776" name="Budget" radius={[4, 4, 0, 0]} />
          <Bar dataKey="actual" fill="#86BC24" name="Actual" radius={[4, 4, 0, 0]} />
          <Bar dataKey="forecast" fill="#00a1de" name="Forecast" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

/**
 * Composed chart for COMPUTE analysis: Variances, Trends, and Overruns
 */
export const ComputeChart: React.FC<ChartProps> = ({ data, height = 300, currencyCode = 'USD' }) => {
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
            tickFormatter={(value) => formatCurrency(value, currencyCode)}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px' }}
            formatter={(value: number) => formatCurrency(value, currencyCode)}
          />
          <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', paddingBottom: '20px' }} />
          
          <Area type="monotone" dataKey="actual" fill="url(#colorTrend)" stroke="#6366F1" name="Spending Trend" strokeWidth={2} />
          <Line type="monotone" dataKey="overrun" stroke="#F43F5E" name="Budget Overrun" strokeWidth={3} dot={{ fill: '#F43F5E', r: 4 }} activeDot={{ r: 6 }} />
          <Line type="monotone" dataKey="variance" stroke="#F59E0B" name="Target Variance" strokeWidth={2} dot={true} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

/**
 * Line chart for displaying expenses or values over time
 */
export const ExpenseLineChart: React.FC<ChartProps> = ({ data, height = 300, currencyCode = 'USD' }) => {
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
            tickFormatter={(value) => formatCurrency(value, currencyCode)}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px' }}
            formatter={(value: number) => [formatCurrency(value, currencyCode), 'Amount']}
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
export const BudgetBarChart: React.FC<ChartProps> = ({ data, height = 300, currencyCode = 'USD' }) => {
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
            tickFormatter={(value) => formatCurrency(value, currencyCode)}
          />
          <Tooltip 
             contentStyle={{ backgroundColor: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px' }}
             formatter={(value: number) => formatCurrency(value, currencyCode)}
          />
          <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', paddingBottom: '20px' }} />
          <Bar dataKey="budget" fill="#002776" radius={[4, 4, 0, 0]} name="Budget" barSize={32} />
          <Bar dataKey="actual" radius={[4, 4, 0, 0]} name="Actual" barSize={32}>
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.actual > entry.budget ? '#EF4444' : '#10B981'} 
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

/**
 * Pie chart for Portfolio Allocation
 */
export const PortfolioPieChart: React.FC<ChartProps> = ({ data, height = 300, colors = CATEGORY_COLORS, currencyCode = 'USD' }) => {
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
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px' }}
            formatter={(value: number) => formatCurrency(value, currencyCode)}
          />
          <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '11px', paddingTop: '20px' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};
