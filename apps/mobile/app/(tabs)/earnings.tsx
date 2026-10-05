import { useState, useCallback } from "react";
import {
  useWindowDimensions,
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "expo-router";
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
      <Text style={[styles.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.6}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const STEPS = [
  {
    title: "Show your driver code",
    body: "When you drive someone to a PullUp deal, they scan or type your code on their claim.",
  },
  {
    title: "They complete the visit",
    body: "Once they check in, and any receipts the deal needs are approved, you earn 20% of what the venue pays for the visit.",
  },
  {
    title: "Cash out any time",
    body: "Bonuses add up under Available to cash out. Send them to your bank whenever you like.",
  },
];

export default function EarningsScreen() {
  const { driverStats, setDriverStats } = useAppStore();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [payouts, setPayouts] = useState<PayoutAccount | null>(null);
  const { fontScale } = useWindowDimensions();
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

  // Reload whenever the tab is shown, so new bonuses appear.
  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

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
      // Re-lay out from scratch when the system text size changes.
      key={fontScale}
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

      {payouts && (
        <View style={styles.block}>
          <PayoutsCard kind="driver" account={payouts} onChanged={loadStats} />
        </View>
      )}

      <View style={styles.statsGrid}>
        <StatCard label="Total earned" value={`$${stats.total_earnings.toFixed(2)}`} color="#1A1A2E" />
        <StatCard label="Riders" value={stats.total_referrals.toString()} color="#5B53EE" />
        <StatCard label="Visits" value={stats.completed_claims.toString()} color="#047857" />
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          How earnings work
        </Text>
        {STEPS.map((step, i) => (
          <View key={step.title} style={styles.infoRow}>
            <View style={styles.infoStep} accessible={false} importantForAccessibility="no-hide-descendants">
              <Text style={styles.infoStepText} maxFontSizeMultiplier={1.4}>
                {i + 1}
              </Text>
            </View>
            <View style={styles.infoContent} accessible accessibilityLabel={`Step ${i + 1}: ${step.title}. ${step.body}`}>
              <Text style={styles.infoTitle}>{step.title}</Text>
              <Text style={styles.infoDescription}>{step.body}</Text>
            </View>
          </View>
        ))}
      </View>

      {payouts && (
        <View style={styles.block}>
          <PayoutHistory account={payouts} emptyText="Bonuses you earn and cash-outs will show here." />
        </View>
      )}
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
  block: {
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 13,
    color: "#4B5563",
    fontWeight: "500",
    textAlign: "center",
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
    gap: 16,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  infoStep: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F0EFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  infoStepText: {
    color: "#5B53EE",
    fontWeight: "700",
    fontSize: 14,
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
    fontSize: 14,
    color: "#4B5563",
    lineHeight: 20,
  },
});
