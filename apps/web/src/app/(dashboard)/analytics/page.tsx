/**
 * Analytics page for venue administrators.
 *
 * Displays time-range-selectable charts (claims vs. completed visits, daily
 * spend on PullUp) and a ranked list of top deals by completed visits. Queries deal_claims through the venue's
 * deals (since deal_claims has no direct venue_id column).
 */
'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';
import { CHART_AXIS, CHART_COLORS, chartTooltipStyle } from '@/lib/chart';
import { formatCurrency } from '@/lib/claims';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface DailyData {
  date: string;
  visits: number;
  completed: number;
  revenue: number;
}

interface TopDeal {
  id: string;
  title: string;
  claims: number;
  revenue: number;
}

export default function AnalyticsPage() {
  const supabase = createSupabaseBrowserClient();
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [topDeals, setTopDeals] = useState<TopDeal[]>([]);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnalytics() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: venue } = await supabase
        .from('venues')
        .select('id')
        .eq('owner_user_id', user.id)
        .single();

      if (!venue) return;

      // Get all deal IDs for this venue (deal_claims has no venue_id)
      const { data: venueDealRows } = await supabase
        .from('deals')
        .select('id, title')
        .eq('venue_id', venue.id);

      const dealRows = venueDealRows || [];
      const dealIds = dealRows.map((d) => d.id);

      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Initialize daily breakdown map
      const dailyMap = new Map<string, { visits: number; completed: number; revenue: number }>();
      for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() - (days - 1 - i));
        const key = d.toISOString().split('T')[0];
        dailyMap.set(key, { visits: 0, completed: 0, revenue: 0 });
      }

      const dealClaimsMap = new Map<string, { claims: number; revenue: number }>();

      if (dealIds.length > 0) {
        // Fetch claims in range, joining deal for amounts
        const { data: claimsData } = await supabase
          .from('deal_claims')
          .select('reserved_at, status, deal_id, deal:deals(ride_credit_amount, driver_kickback_amount, platform_fee_amount)')
          .in('deal_id', dealIds)
          .gte('reserved_at', startDate.toISOString())
          .order('reserved_at', { ascending: true });

        (claimsData || []).forEach((claim) => {
          const day = claim.reserved_at.split('T')[0];
          const existing = dailyMap.get(day) || { visits: 0, completed: 0, revenue: 0 };
          existing.visits += 1;

          if (claim.status === 'completed') {
            existing.completed += 1;
            const deal = claim.deal as unknown as Record<string, number> | null;
            const rev = deal
              ? (deal.ride_credit_amount || 0) + (deal.driver_kickback_amount || 0) + (deal.platform_fee_amount || 0)
              : 0;
            existing.revenue += rev;

            // Track per-deal stats for top deals ranking
            const dealStats = dealClaimsMap.get(claim.deal_id) || { claims: 0, revenue: 0 };
            dealStats.claims += 1;
            dealStats.revenue += rev;
            dealClaimsMap.set(claim.deal_id, dealStats);
          }
          dailyMap.set(day, existing);
        });
      }

      const daily: DailyData[] = [];
      dailyMap.forEach((val, key) => {
        daily.push({
          date: new Date(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          ...val,
          revenue: parseFloat(val.revenue.toFixed(2)),
        });
      });
      setDailyData(daily);

      // Build top deals list using deal titles we already fetched
      const dealTitleMap = new Map(dealRows.map((d) => [d.id, d.title]));
      const top: TopDeal[] = Array.from(dealClaimsMap.entries())
        .map(([id, stats]) => ({
          id,
          title: dealTitleMap.get(id) || 'Unknown',
          claims: stats.claims,
          revenue: parseFloat(stats.revenue.toFixed(2)),
        }))
        .sort((a, b) => b.claims - a.claims)
        .slice(0, 5);

      setTopDeals(top);
      setLoading(false);
    }

    fetchAnalytics();
  }, [timeRange, supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" role="status">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-hidden="true" />
        <span className="sr-only">Loading analytics data...</span>
      </div>
    );
  }

  const totals = dailyData.reduce(
    (t, d) => ({ claims: t.claims + d.visits, completed: t.completed + d.completed, spent: t.spent + d.revenue }),
    { claims: 0, completed: 0, spent: 0 }
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-600 mt-1">
            How riders respond to your deals, and what completed visits cost you.
          </p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1" role="group" aria-label="Time range selector">
          {(['7d', '30d', '90d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              aria-pressed={timeRange === range}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                timeRange === range
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-700 hover:text-gray-900'
              }`}
            >
              {range === '7d' ? '7 days' : range === '30d' ? '30 days' : '90 days'}
            </button>
          ))}
        </div>
      </div>

      {/* Visits Over Time */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Claims vs. completed visits</h2>
        <p className="text-sm text-gray-600 mt-1 mb-4">
          A claim is when a rider reserves a deal. It becomes a completed visit when they show up.
        </p>
        <p className="sr-only">
          {totals.claims} claims and {totals.completed} completed visits in this period.
          Daily figures are listed in the Daily breakdown table below.
        </p>
        <div className="h-72" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_AXIS.grid} />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: CHART_AXIS.text }} stroke={CHART_AXIS.line} />
              <YAxis tick={{ fontSize: 12, fill: CHART_AXIS.text }} stroke={CHART_AXIS.line} />
              <Tooltip
                  {...chartTooltipStyle}
              />
              <Legend />
              <Line type="monotone" dataKey="visits" stroke={CHART_COLORS.primary} strokeWidth={2} dot={false} name="Claims" />
              <Line type="monotone" dataKey="completed" stroke={CHART_COLORS.secondary} strokeWidth={2} strokeDasharray="6 3" dot={false} name="Completed visits" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Chart */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900">Daily spend on PullUp</h2>
          <p className="text-sm text-gray-600 mt-1 mb-4">
            What you paid for completed visits each day. {formatCurrency(totals.spent)} total in this period.
          </p>
          <div className="h-64" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_AXIS.grid} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: CHART_AXIS.text }} stroke={CHART_AXIS.line} />
                <YAxis tick={{ fontSize: 12, fill: CHART_AXIS.text }} stroke={CHART_AXIS.line} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  {...chartTooltipStyle}
                  formatter={(value: number) => [formatCurrency(value), 'Spent']}
                />
                <Bar dataKey="revenue" name="Spent" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Deals */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900">Top deals</h2>
          <p className="text-sm text-gray-600 mt-1 mb-4">Ranked by completed visits.</p>
          {topDeals.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              <p>No completed visits in this period.</p>
            </div>
          ) : (
            <ol className="space-y-4">
              {topDeals.map((deal, index) => (
                <li key={deal.id} className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-50 text-primary flex items-center justify-center text-sm font-bold" aria-hidden="true">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{deal.title}</p>
                    <p className="text-sm text-gray-600">
                      {deal.claims} completed visit{deal.claims === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">{formatCurrency(deal.revenue)}</p>
                    <p className="text-xs text-gray-600">spent</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* Daily Breakdown Table */}
      <div className="card mt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Daily breakdown</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Daily claims, completed visits, show-up rate and spend, most recent first</caption>
            <thead>
              <tr className="border-b border-gray-200">
                <th scope="col" className="text-left py-3 px-4 font-medium text-gray-600">Date</th>
                <th scope="col" className="text-right py-3 px-4 font-medium text-gray-600">Claims</th>
                <th scope="col" className="text-right py-3 px-4 font-medium text-gray-600">Completed visits</th>
                <th scope="col" className="text-right py-3 px-4 font-medium text-gray-600">Show-up rate</th>
                <th scope="col" className="text-right py-3 px-4 font-medium text-gray-600">Spent</th>
              </tr>
            </thead>
            <tbody>
              {[...dailyData].reverse().slice(0, 14).map((day) => (
                <tr key={day.date} className="border-b border-gray-100 hover:bg-gray-50">
                  <th scope="row" className="text-left py-3 px-4 font-medium text-gray-900">{day.date}</th>
                  <td className="py-3 px-4 text-right text-gray-700">{day.visits}</td>
                  <td className="py-3 px-4 text-right text-gray-700">{day.completed}</td>
                  <td className="py-3 px-4 text-right text-gray-700">
                    {day.visits > 0 ? `${((day.completed / day.visits) * 100).toFixed(1)}%` : '-'}
                  </td>
                  <td className="py-3 px-4 text-right font-medium text-gray-900">{formatCurrency(day.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
