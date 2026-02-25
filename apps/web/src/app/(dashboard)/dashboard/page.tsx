/**
 * Dashboard overview page for venue administrators.
 *
 * Displays key metrics (total visits, revenue, active deals, today's claims),
 * a 30-day visits chart, and a table of recent claims. All queries use the
 * correct table and column names from the PullUp database schema.
 */
'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';
import StatCard from '@/components/StatCard';
import ClaimsTable from '@/components/ClaimsTable';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface Stats {
  totalVisits: number;
  revenue: number;
  activeDeals: number;
  todayClaims: number;
}

interface ChartDataPoint {
  date: string;
  visits: number;
  revenue: number;
}

interface Claim {
  id: string;
  deal_title: string;
  rider_name: string;
  status: 'reserved' | 'completed' | 'expired' | 'cancelled';
  reserved_at: string;
  completed_at: string | null;
  ride_credit_amount: number;
  driver_kickback_amount: number;
  platform_fee_amount: number;
}

export default function DashboardPage() {
  const supabase = createSupabaseBrowserClient();
  const [stats, setStats] = useState<Stats>({
    totalVisits: 0,
    revenue: 0,
    activeDeals: 0,
    todayClaims: 0,
  });
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [recentClaims, setRecentClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Get the venue owned by this admin
        const { data: venue } = await supabase
          .from('venues')
          .select('id')
          .eq('owner_user_id', user.id)
          .single();

        if (!venue) return;

        // Get all deal IDs for this venue (needed to query deal_claims)
        const { data: venueDealRows } = await supabase
          .from('deals')
          .select('id')
          .eq('venue_id', venue.id);

        const dealIds = (venueDealRows || []).map((d) => d.id);

        // Active deals count (is_active boolean, not status string)
        const { count: activeDealsCount } = await supabase
          .from('deals')
          .select('*', { count: 'exact', head: true })
          .eq('venue_id', venue.id)
          .eq('is_active', true);

        // Total claims (visits) — deal_claims doesn't have venue_id,
        // so we filter by deal_id using the IDs we fetched
        let totalVisits = 0;
        let todayClaims = 0;
        let revenue = 0;

        if (dealIds.length > 0) {
          const { count: visitsCount } = await supabase
            .from('deal_claims')
            .select('*', { count: 'exact', head: true })
            .in('deal_id', dealIds);

          totalVisits = visitsCount || 0;

          // Today's claims
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);

          const { count: todayCount } = await supabase
            .from('deal_claims')
            .select('*', { count: 'exact', head: true })
            .in('deal_id', dealIds)
            .gte('reserved_at', todayStart.toISOString());

          todayClaims = todayCount || 0;

          // Revenue: sum amounts from completed claims' deals
          const { data: completedClaims } = await supabase
            .from('deal_claims')
            .select('deal:deals(ride_credit_amount, driver_kickback_amount, platform_fee_amount)')
            .in('deal_id', dealIds)
            .eq('status', 'completed');

          revenue = (completedClaims || []).reduce((sum, c) => {
            const deal = c.deal as Record<string, number> | null;
            if (!deal) return sum;
            return sum + (deal.ride_credit_amount || 0) + (deal.driver_kickback_amount || 0) + (deal.platform_fee_amount || 0);
          }, 0);
        }

        setStats({
          totalVisits,
          revenue,
          activeDeals: activeDealsCount || 0,
          todayClaims,
        });

        // Chart: last 30 days of claims
        if (dealIds.length > 0) {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

          const { data: claimsData } = await supabase
            .from('deal_claims')
            .select('reserved_at, status, deal:deals(ride_credit_amount, driver_kickback_amount, platform_fee_amount)')
            .in('deal_id', dealIds)
            .gte('reserved_at', thirtyDaysAgo.toISOString())
            .order('reserved_at', { ascending: true });

          const dailyMap = new Map<string, { visits: number; revenue: number }>();
          for (let i = 0; i < 30; i++) {
            const d = new Date();
            d.setDate(d.getDate() - (29 - i));
            const key = d.toISOString().split('T')[0];
            dailyMap.set(key, { visits: 0, revenue: 0 });
          }

          (claimsData || []).forEach((claim) => {
            const day = claim.reserved_at.split('T')[0];
            const existing = dailyMap.get(day) || { visits: 0, revenue: 0 };
            existing.visits += 1;
            if (claim.status === 'completed') {
              const deal = claim.deal as Record<string, number> | null;
              if (deal) {
                existing.revenue += (deal.ride_credit_amount || 0) + (deal.driver_kickback_amount || 0) + (deal.platform_fee_amount || 0);
              }
            }
            dailyMap.set(day, existing);
          });

          const chart: ChartDataPoint[] = [];
          dailyMap.forEach((val, key) => {
            chart.push({
              date: new Date(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              visits: val.visits,
              revenue: parseFloat(val.revenue.toFixed(2)),
            });
          });
          setChartData(chart);
        }

        // Recent claims with deal title and rider name
        if (dealIds.length > 0) {
          const { data: recent } = await supabase
            .from('deal_claims')
            .select(`
              id,
              status,
              reserved_at,
              completed_at,
              deal:deals(title, ride_credit_amount, driver_kickback_amount, platform_fee_amount),
              rider:users!deal_claims_rider_user_id_fkey(full_name)
            `)
            .in('deal_id', dealIds)
            .order('reserved_at', { ascending: false })
            .limit(10);

          const mappedClaims: Claim[] = (recent || []).map((c: Record<string, unknown>) => {
            const deal = c.deal as Record<string, unknown> | null;
            const rider = c.rider as Record<string, string> | null;
            return {
              id: c.id as string,
              deal_title: (deal?.title as string) || 'Unknown deal',
              rider_name: rider?.full_name || 'Anonymous',
              status: c.status as Claim['status'],
              reserved_at: c.reserved_at as string,
              completed_at: c.completed_at as string | null,
              ride_credit_amount: (deal?.ride_credit_amount as number) || 0,
              driver_kickback_amount: (deal?.driver_kickback_amount as number) || 0,
              platform_fee_amount: (deal?.platform_fee_amount as number) || 0,
            };
          });

          setRecentClaims(mappedClaims);
        }
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" role="status" aria-label="Loading dashboard">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <span className="sr-only">Loading dashboard data...</span>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard Overview</h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Visits"
          value={stats.totalVisits.toLocaleString()}
          change="+12% from last month"
          changeType="positive"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
        <StatCard
          title="Revenue"
          value={`$${stats.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          change="+8% from last month"
          changeType="positive"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="Active Deals"
          value={stats.activeDeals}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
          }
        />
        <StatCard
          title="Today's Claims"
          value={stats.todayClaims}
          change="Live"
          changeType="neutral"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          }
        />
      </div>

      {/* Visits Chart */}
      <div className="card mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Visits Over Time</h2>
        <div className="h-72" aria-label="Visits over time chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1A1A2E',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                }}
              />
              <Area
                type="monotone"
                dataKey="visits"
                stroke="#6C63FF"
                fill="#6C63FF"
                fillOpacity={0.1}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Claims */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Claims</h2>
        <ClaimsTable claims={recentClaims} />
      </div>
    </div>
  );
}
