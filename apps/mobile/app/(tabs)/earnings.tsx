import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useAppStore } from "../../lib/store";
import { useAuth } from "../../lib/auth";
import { fetchDriverPayouts, fetchDriverStats, type PayoutAccount } from "../../lib/api";
import { PayoutHistory, PayoutsCard } from "../../components/PayoutsCard";

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function EarningsScreen() {
  const { driverStats, setDriverStats } = useAppStore();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [payouts, setPayouts] = useState<PayoutAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [{ data, error: err }, payoutResult] = await Promise.all([
      fetchDriverStats(),
      userId ? fetchDriverPayouts(userId) : Promise.resolve(null),
    ]);
    if (err) {
      setError(err);
    } else if (data) {
      setDriverStats(data);
    }
    if (payoutResult?.data) setPayouts(payoutResult.data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (loading && !driverStats) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#5B53EE" />
      </View>
    );
  }

  const stats = driverStats ?? {
    total_referrals: 0,
    total_earnings: 0,
    payout_balance: 0,
    completed_claims: 0,
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={loadStats}
          tintColor="#5B53EE"
          colors={["#5B53EE"]}
        />
      }
    >
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.earningsHero} accessible accessibilityLabel={`Total earned ${stats.total_earnings.toFixed(2)} dollars`}>
        <Text style={styles.heroLabel}>Total earned</Text>
        <Text style={styles.heroValue}>
          ${stats.total_earnings.toFixed(2)}
        </Text>
      </View>

      {payouts && (
        <View style={styles.payoutsBlock}>
          <PayoutsCard kind="driver" account={payouts} onChanged={loadStats} />
        </View>
      )}

      <View style={styles.statsGrid}>
        <StatCard
          label="Riders brought"
          value={stats.total_referrals.toString()}
          color="#5B53EE"
        />
        <StatCard
          label="Completed Claims"
          value={stats.completed_claims.toString()}
          color="#047857"
        />
      </View>

      {payouts && (
        <View style={styles.payoutsBlock}>
          <PayoutHistory account={payouts} emptyText="Bonuses you earn and cash-outs will show here." />
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>How Earnings Work</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoStep} maxFontSizeMultiplier={1.4}>1</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Show your driver code</Text>
              <Text style={styles.infoDescription}>
                When you drive someone to a PullUp deal, they scan or type your code on their claim.
              </Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoStep} maxFontSizeMultiplier={1.4}>2</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Rider completes the visit</Text>
              <Text style={styles.infoDescription}>
                Once they check in at the venue, you earn 20% of what the venue pays for that visit.
              </Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoStep} maxFontSizeMultiplier={1.4}>3</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Get paid</Text>
              <Text style={styles.infoDescription}>
                Earnings are tracked in real-time and paid out weekly.
              </Text>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8F9FA",
  },
  errorBanner: {
    backgroundColor: "#FEE2E2",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 14,
  },
  earningsHero: {
    backgroundColor: "#5B53EE",
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    marginBottom: 20,
    shadowColor: "#5B53EE",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 8,
  },
  heroLabel: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "500",
    marginBottom: 4,
  },
  heroValue: {
    color: "#FFFFFF",
    fontSize: 44,
    fontWeight: "800",
    marginBottom: 8,
  },
  payoutsBlock: {
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A2E",
  },
  infoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    gap: 20,
  },
  infoRow: {
    flexDirection: "row",
    gap: 14,
  },
  infoStep: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F0EFFF",
    color: "#5B53EE",
    fontWeight: "700",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 28,
    overflow: "hidden",
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1A1A2E",
    marginBottom: 2,
  },
  infoDescription: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
});
