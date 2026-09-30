/**
 * Dashboard overview page for venue administrators.
 *
 * Shows the last 30 days at a glance: completed visits, what the venue spent
 * on PullUp, active deals and today's claims, each compared with the previous
 * 30 days. Also charts claims vs. completed visits and lists recent claims.
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';
import StatCard from '@/components/StatCard';
import ClaimsTable, { type ClaimRow } from '@/components/ClaimsTable';
import { CHART_COLORS, CHART_AXIS, chartTooltipStyle } from '@/lib/chart';
import { costPerVisit, formatCurrency, isChargeableVisit, percentChange, type ClaimStatus } from '@/lib/claims';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface Stats {
  completedVisits: number;
  completedVisitsPrev: number;
  spent: number;
  spentPrev: number;
  activeDeals: number;
  todayClaims: number;
}

interface ChartDataPoint {
  date: string;
  claims: number;
  completed: number;
}

interface ClaimWithDeal {
  id: string;
  status: ClaimStatus;
  reserved_at: string;
  completed_at: string | null;
  unverified_at: string | null;
  deal: { title: string; ride_credit_amount: number; driver_kickback_amount: number; platform_fee_amount: number } | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// Use real spend once this many venue receipts (last 90 days) have bill totals.
const MIN_RECEIPTS_FOR_AVERAGE = 5;

function changeLabel(current: number, previous: number): { text: string; type: 'positive' | 'negative' | 'neutral' } | undefined {
  const pct = percentChange(current, previous);
  if (pct === null) return undefined;
  const rounded = Math.round(pct);
  if (rounded === 0) return { text: 'Same as previous 30 days', type: 'neutral' };
  return {
    text: `${rounded > 0 ? '+' : ''}${rounded}% vs. previous 30 days`,
    type: rounded > 0 ? 'positive' : 'negative',
  };
}

export default function DashboardPage() {
  const supabase = createSupabaseBrowserClient();
  const [stats, setStats] = useState<Stats>({
    completedVisits: 0,
    completedVisitsPrev: 0,
    spent: 0,
    spentPrev: 0,
    activeDeals: 0,
    todayClaims: 0,
  });
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [recentClaims, setRecentClaims] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [avgCheck, setAvgCheck] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [live, setLive] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');
  const [receiptSpend, setReceiptSpend] = useState<{ average: number; count: number } | null>(null);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: venue } = await supabase
          .from('venues')
          .select('id')
          .eq('owner_user_id', user.id)
          .single();
        if (!venue) return;
        // Private to the owner, so read through an RPC rather than the venues table.
        const { data: privateRows } = await supabase.rpc('get_my_venue_private');
        const avg = (privateRows as { avg_check_amount: number | null }[] | null)?.[0]?.avg_check_amount;
        setAvgCheck(avg != null ? Number(avg) : null);

        const { data: venueDeals } = await supabase
          .from('deals')
          .select('id, is_active')
          .eq('venue_id', venue.id);
        const dealIds = (venueDeals || []).map((d) => d.id);
        const activeDeals = (venueDeals || []).filter((d) => d.is_active).length;

        if (dealIds.length === 0) {
          setStats((s) => ({ ...s, activeDeals }));
          return;
        }

        // Last 60 days of claims: 30 for the current period, 30 for comparison.
        const now = Date.now();
        const periodStart = new Date(now - 30 * DAY_MS);
        const prevStart = new Date(now - 60 * DAY_MS);

        const { data: claimRows } = await supabase
          .from('deal_claims')
          .select('id, status, reserved_at, completed_at, unverified_at, deal:deals(title, ride_credit_amount, driver_kickback_amount, platform_fee_amount)')
          .in('deal_id', dealIds)
          .gte('reserved_at', prevStart.toISOString())
          .order('reserved_at', { ascending: false });
        const claims = (claimRows || []) as unknown as ClaimWithDeal[];

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const next: Stats = { completedVisits: 0, completedVisitsPrev: 0, spent: 0, spentPrev: 0, activeDeals, todayClaims: 0 };
        const daily = new Map<string, ChartDataPoint>();
        for (let i = 29; i >= 0; i--) {
          const d = new Date(now - i * DAY_MS);
          const key = d.toISOString().split('T')[0];
          daily.set(key, { date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), claims: 0, completed: 0 });
        }

        for (const c of claims) {
          const reserved = new Date(c.reserved_at);
          const inCurrent = reserved >= periodStart;
          if (reserved >= todayStart) next.todayClaims += 1;
          if (isChargeableVisit(c)) {
            const cost = costPerVisit(c.deal);
            if (inCurrent) {
              next.completedVisits += 1;
              next.spent += cost;
            } else {
              next.completedVisitsPrev += 1;
              next.spentPrev += cost;
            }
          }
          const point = daily.get(c.reserved_at.split('T')[0]);
          if (point) {
            point.claims += 1;
            if (isChargeableVisit(c)) point.completed += 1;
          }
        }

        setStats(next);
        setChartData(Array.from(daily.values()));

        // Real spend: bill totals staff recorded from approved venue receipts.
        const { data: bills } = await supabase
          .from('deal_claims')
          .select('venue_bill_amount')
          .in('deal_id', dealIds)
          .eq('venue_receipt_status', 'approved')
          .not('venue_bill_amount', 'is', null)
          .gte('reserved_at', new Date(now - 90 * DAY_MS).toISOString());
        const amounts = (bills || []).map((b) => Number(b.venue_bill_amount)).filter((n) => n > 0);
        setReceiptSpend(
          amounts.length ? { average: amounts.reduce((a, b) => a + b, 0) / amounts.length, count: amounts.length } : null
        );

        // Recent claims, with rider display names from a venue-scoped RPC
        // (venue admins cannot read rider profiles directly).
        const recent = claims.slice(0, 10);
        const { data: names } = await supabase.rpc('get_venue_claim_rider_names', {
          claim_ids: recent.map((c) => c.id),
        });
        const nameById = new Map(
          ((names || []) as { claim_id: string; rider_display_name: string }[]).map((n) => [n.claim_id, n.rider_display_name])
        );

        setRecentClaims(
          recent.map((c) => ({
            id: c.id,
            deal_title: c.deal?.title || 'Deleted deal',
            rider_name: nameById.get(c.id) || 'Rider',
            status: c.status,
            reserved_at: c.reserved_at,
            completed_at: c.completed_at,
            cost: costPerVisit(c.deal),
            unverified: Boolean(c.unverified_at),
          }))
        );
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [supabase, refreshKey]);

  // Live updates: refresh when a claim on this venue changes. Realtime applies
  // RLS, so a venue only receives events for its own claims.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel('venue-claims')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deal_claims' }, (payload) => {
        if (payload.eventType === 'INSERT') setLiveMessage('New claim received.');
        clearTimeout(timer);
        timer = setTimeout(() => setRefreshKey((k) => k + 1), 1000);
      })
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Clear the announcement so repeated events are announced again.
  useEffect(() => {
    if (!liveMessage) return;
    const t = setTimeout(() => setLiveMessage(''), 4000);
    return () => clearTimeout(t);
  }, [liveMessage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" role="status">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-hidden="true" />
        <span className="sr-only">Loading dashboard data...</span>
      </div>
    );
  }

  const totalClaims30 = chartData.reduce((s, d) => s + d.claims, 0);
  const totalCompleted30 = chartData.reduce((s, d) => s + d.completed, 0);
  const busiest = chartData.reduce<ChartDataPoint | null>((b, d) => (!b || d.claims > b.claims ? d : b), null);
  const visitsChange = changeLabel(stats.completedVisits, stats.completedVisitsPrev);
  const spentChange = changeLabel(stats.spent, stats.spentPrev);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        {live && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-900">
            <span className="h-2 w-2 rounded-full bg-green-700" aria-hidden="true" />
            Live
            <span className="sr-only">: updates automatically when riders claim your deals</span>
          </span>
        )}
      </div>
      <p className="sr-only" aria-live="polite">{liveMessage}</p>
      <p className="text-gray-600 mt-1 mb-6">Your last 30 days on PullUp.</p>

      <EstimatedSalesCard
        avgCheck={avgCheck}
        receiptSpend={receiptSpend}
        completedVisits={stats.completedVisits}
        spent={stats.spent}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Completed visits"
          value={stats.completedVisits.toLocaleString()}
          description="Riders who claimed a deal and showed up"
          change={visitsChange?.text}
          changeType={visitsChange?.type}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
        <StatCard
          title="Spent on PullUp"
          value={formatCurrency(stats.spent)}
          description={
            stats.completedVisits > 0
              ? `${formatCurrency(stats.spent / stats.completedVisits)} per completed visit`
              : 'You pay only for completed visits'
          }
          change={spentChange?.text}
          // More spend is neither good nor bad on its own.
          changeType="neutral"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="Active deals"
          value={stats.activeDeals}
          description="Visible to riders right now"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
          }
        />
        <StatCard
          title="Claims today"
          value={stats.todayClaims}
          description="Deals reserved by riders since midnight"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          }
        />
      </div>

      <div className="card mb-8">
        <h2 className="text-lg font-semibold text-gray-900">Claims vs. completed visits</h2>
        <p className="text-sm text-gray-600 mt-1 mb-4">
          A claim is when a rider reserves a deal. It becomes a completed visit when they show up.
        </p>
        <p className="sr-only">
          Over the last 30 days: {totalClaims30} claims and {totalCompleted30} completed visits.
          {busiest && busiest.claims > 0 ? ` Busiest day was ${busiest.date} with ${busiest.claims} claims.` : ''}
          {' '}Daily figures are in the Analytics page table.
        </p>
        <div className="h-72" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_AXIS.grid} />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: CHART_AXIS.text }} stroke={CHART_AXIS.line} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: CHART_AXIS.text }} stroke={CHART_AXIS.line} />
              <Tooltip {...chartTooltipStyle} />
              <Legend />
              <Area
                type="monotone"
                dataKey="claims"
                name="Claims"
                stroke={CHART_COLORS.primary}
                fill={CHART_COLORS.primary}
                fillOpacity={0.1}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="completed"
                name="Completed visits"
                stroke={CHART_COLORS.secondary}
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent claims</h2>
          <Link href="/billing" className="text-sm font-medium text-primary hover:text-primary-600 underline-offset-2 hover:underline">
            See all charges
          </Link>
        </div>
        <ClaimsTable claims={recentClaims} />
      </div>
    </div>
  );
}

/**
 * Headline value card: estimated sales from PullUp visits (completed visits x
 * average bill) next to what those visits cost. The average comes from real
 * venue receipts once there are enough, otherwise from the venue's estimate.
 */
function EstimatedSalesCard({
  avgCheck,
  receiptSpend,
  completedVisits,
  spent,
}: {
  avgCheck: number | null;
  receiptSpend: { average: number; count: number } | null;
  completedVisits: number;
  spent: number;
}) {
  const fromReceipts = receiptSpend !== null && receiptSpend.count >= MIN_RECEIPTS_FOR_AVERAGE;
  const averageBill = fromReceipts ? receiptSpend.average : avgCheck;

  if (averageBill == null || averageBill <= 0) {
    return (
      <section className="card mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4" aria-labelledby="est-sales-heading">
        <div>
          <h2 id="est-sales-heading" className="text-lg font-semibold text-gray-900">See what PullUp brings in</h2>
          <p className="text-gray-600 mt-1">
            Add your average bill per customer and we&apos;ll estimate the sales from your PullUp visits.
          </p>
        </div>
        <Link href="/settings" className="btn-primary text-center whitespace-nowrap">
          Add average bill
        </Link>
      </section>
    );
  }

  const estimatedSales = completedVisits * averageBill;
  const multiple = spent > 0 ? estimatedSales / spent : null;

  return (
    <section className="card mb-8 border-l-4 border-l-primary" aria-labelledby="est-sales-heading">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
        <div>
          <h2 id="est-sales-heading" className="text-sm font-medium text-gray-600">
            Estimated sales from PullUp visits
          </h2>
          <p className="text-4xl font-bold text-gray-900 mt-1">{formatCurrency(estimatedSales)}</p>
          <p className="text-sm text-gray-600 mt-1">
            {completedVisits.toLocaleString()} completed visit{completedVisits === 1 ? '' : 's'} ×{' '}
            {formatCurrency(averageBill)} average bill, last 30 days.
          </p>
          <p className="text-sm text-gray-600 mt-1">
            {fromReceipts ? (
              <>
                Average bill from {receiptSpend.count} PullUp customer receipts (last 90 days).
                {avgCheck ? ` Your own estimate is ${formatCurrency(avgCheck)}.` : ''}
              </>
            ) : (
              <>
                Using your estimate.{' '}
                {receiptSpend
                  ? `Switches to real receipts after ${MIN_RECEIPTS_FOR_AVERAGE - receiptSpend.count} more.`
                  : 'Deals that require a venue receipt replace this with real spend over time.'}{' '}
                <Link href="/settings" className="text-primary font-medium hover:text-primary-600 underline-offset-2 hover:underline">
                  Change estimate
                </Link>
              </>
            )}
          </p>
        </div>
        <dl className="flex gap-8">
          <div>
            <dt className="text-sm text-gray-600">You spent</dt>
            <dd className="text-2xl font-semibold text-gray-900">{formatCurrency(spent)}</dd>
          </div>
          {multiple !== null && (
            <div>
              <dt className="text-sm text-gray-600">Estimated return</dt>
              <dd className="text-2xl font-semibold text-green-800">
                {multiple.toFixed(1)}×<span className="sr-only"> your spend</span>
              </dd>
            </div>
          )}
        </dl>
      </div>
      <p className="text-xs text-gray-600 mt-4">
        An estimate, not a sales report. It assumes each PullUp customer spent the average bill above.
      </p>
    </section>
  );
}
