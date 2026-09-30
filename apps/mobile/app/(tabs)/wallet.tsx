/**
 * Rider wallet: ride credit earned on approved visits, payout setup and cash
 * out to a bank account through Stripe.
 */
import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from "react-native";
import { useAuth } from "../../lib/auth";
import { fetchRiderWallet, type PayoutAccount } from "../../lib/api";
import { PayoutHistory, PayoutsCard } from "../../components/PayoutsCard";

export default function WalletScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [wallet, setWallet] = useState<PayoutAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchRiderWallet(userId);
    if (err) setError(err);
    else if (data) setWallet(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !wallet) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#5B53EE" accessibilityLabel="Loading wallet" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#5B53EE" colors={["#5B53EE"]} />}
    >
      {error && (
        <View style={styles.errorBanner} accessibilityRole="alert">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      {wallet && (
        <>
          <PayoutsCard kind="rider" account={wallet} onChanged={load} />
          <Text style={styles.explainer}>
            You earn ride credit when you complete a visit and any receipts the deal needs are approved. Cash it out to
            your bank any time.
          </Text>
          <PayoutHistory account={wallet} emptyText="Ride credit you earn and cash-outs will show here." />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA" },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F8F9FA" },
  explainer: { fontSize: 14, lineHeight: 20, color: "#374151", paddingHorizontal: 4 },
  errorBanner: { backgroundColor: "#FEE2E2", padding: 12, borderRadius: 8 },
  errorText: { color: "#991B1B", fontSize: 14 },
});
