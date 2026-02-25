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
import { fetchDriverStats } from "../../lib/api";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchDriverStats();
    if (err) {
      setError(err);
    } else if (data) {
      setDriverStats(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStats();
  }, []);

  if (loading && !driverStats) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6C63FF" />
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
          tintColor="#6C63FF"
          colors={["#6C63FF"]}
        />
      }
    >
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.earningsHero}>
        <Text style={styles.heroLabel}>Total Earnings</Text>
        <Text style={styles.heroValue}>
          ${stats.total_earnings.toFixed(2)}
        </Text>
        <View style={styles.pendingRow}>
          <View style={styles.pendingDot} />
          <Text style={styles.pendingText}>
            ${stats.payout_balance.toFixed(2)} pending
          </Text>
        </View>
      </View>

      <View style={styles.statsGrid}>
        <StatCard
          label="Total Referrals"
          value={stats.total_referrals.toString()}
          color="#6C63FF"
        />
        <StatCard
          label="Completed Claims"
          value={stats.completed_claims.toString()}
          color="#10B981"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>How Earnings Work</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoStep}>1</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Share your referral code</Text>
              <Text style={styles.infoDescription}>
                Give your unique code to riders heading to partner venues.
              </Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoStep}>2</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Rider claims a deal</Text>
              <Text style={styles.infoDescription}>
                When a rider uses your code and claims a deal, you earn a
                commission.
              </Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoStep}>3</Text>
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
    color: "#DC2626",
    fontSize: 14,
  },
  earningsHero: {
    backgroundColor: "#6C63FF",
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    marginBottom: 20,
    shadowColor: "#6C63FF",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 8,
  },
  heroLabel: {
    color: "rgba(255,255,255,0.8)",
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
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pendingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F59E0B",
  },
  pendingText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    fontWeight: "500",
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
    color: "#6C63FF",
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
