import React, { useEffect, useState } from 'react';
import { DollarSign, TrendingUp, CreditCard, Package } from 'lucide-react';
import { api } from '@/services/api';

interface FinancialData {
  revenue: number;
  subscriptions: number;
  mrr: number;
  plans: Array<{
    name: string;
    count: number;
    revenue: number;
  }>;
}

const SuperAdminFinancial: React.FC = () => {
  const [data, setData] = useState<FinancialData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFinancial = async () => {
      try {
        setIsLoading(true);
        const response = await api.getSuperAdminFinancial();
        setData(response);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to load financial data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchFinancial();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/30 border border-red-600 text-red-200 px-4 py-3 rounded-lg">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Financial Reports</h1>
        <p className="text-slate-400">Revenue and subscription metrics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-slate-800 to-slate-700 rounded-lg p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-300 text-sm font-semibold">Total Revenue</h3>
            <DollarSign className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-3xl font-bold text-white mb-2">
            ${data?.revenue?.toLocaleString() || '0'}
          </p>
          <p className="text-xs text-slate-400">All-time revenue</p>
        </div>

        <div className="bg-gradient-to-br from-slate-800 to-slate-700 rounded-lg p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-300 text-sm font-semibold">Monthly Recurring</h3>
            <TrendingUp className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-3xl font-bold text-white mb-2">
            ${data?.mrr?.toLocaleString() || '0'}
          </p>
          <p className="text-xs text-slate-400">MRR (Monthly)</p>
        </div>

        <div className="bg-gradient-to-br from-slate-800 to-slate-700 rounded-lg p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-300 text-sm font-semibold">Active Plans</h3>
            <CreditCard className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-3xl font-bold text-white mb-2">{data?.subscriptions || '0'}</p>
          <p className="text-xs text-slate-400">Active subscriptions</p>
        </div>

        <div className="bg-gradient-to-br from-slate-800 to-slate-700 rounded-lg p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-300 text-sm font-semibold">Plans</h3>
            <Package className="w-5 h-5 text-orange-500" />
          </div>
          <p className="text-3xl font-bold text-white mb-2">
            {data?.plans?.length || '0'}
          </p>
          <p className="text-xs text-slate-400">Subscription plans</p>
        </div>
      </div>

      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-6">Plans Breakdown</h3>

        {!data?.plans || data.plans.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">No billing plans configured yet</p>
            <p className="text-slate-500 text-sm mt-2">Billing will be available when integrated</p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.plans.map((plan, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg border border-slate-700"
              >
                <div>
                  <h4 className="text-white font-semibold">{plan.name}</h4>
                  <p className="text-sm text-slate-400">{plan.count} active subscribers</p>
                </div>
                <div className="text-right">
                  <p className="text-white font-semibold">
                    ${plan.revenue?.toLocaleString() || '0'}
                  </p>
                  <p className="text-xs text-slate-400">Total revenue</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-6">
        <h3 className="text-blue-300 font-semibold mb-2">Billing Integration Coming Soon</h3>
        <p className="text-blue-200/80 text-sm">
          Detailed financial reports, invoicing, and subscription management will be available
          once billing integration is implemented. Currently showing placeholder data.
        </p>
      </div>
    </div>
  );
};

export default SuperAdminFinancial;
