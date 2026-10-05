/**
 * Driver code screen.
 *
 * Shows the driver's code as a QR code for riders to scan (or type) on their
 * active claim. Each completed visit on a claim with this code earns the
 * driver a bonus. Below, the riders who have added the code.
 */
import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Share,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { generateDriverQRContent } from "@pullup/shared";
import { useAuth } from "../../lib/auth";
import { fetchDriverRiders, type DriverRider } from "../../lib/api";

export default function DriverCodeScreen() {
  const { driverProfile } = useAuth();
  const code = driverProfile?.referral_code;
  const [riders, setRiders] = useState<DriverRider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRiders = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchDriverRiders();
    if (err) setError(err);
    else if (data) setRiders(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRiders();
  }, [loadRiders]);

  const handleShare = async () => {
    if (!code) return;
    try {
      await Share.share({
        message: `Riding with me to a PullUp deal? Add my driver code ${code} to your claim in the PullUp app.`,
      });
    } catch {
      // User cancelled share
    }
  };

  const header = (
    <>
      <View style={styles.codeCard}>
        <Text style={styles.codeLabel} accessibilityRole="header">
          Show this to your rider
        </Text>
        {code ? (
          <View
            style={styles.qrWrap}
            accessible
            accessibilityRole="image"
            accessibilityLabel={`QR code for driver code ${code.split("").join(" ")}`}
          >
            <QRCode value={generateDriverQRContent(code)} size={180} backgroundColor="#FFFFFF" color="#1A1A2E" />
          </View>
        ) : (
          <ActivityIndicator color="#FFFFFF" accessibilityLabel="Loading your code" />
        )}
        <Text style={styles.codeValue} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.6} accessibilityLabel={code ? `Code ${code.split("").join(" ")}` : undefined}>
          {code ?? "--------"}
        </Text>
        <Text style={styles.codeHint}>
          When a rider going to a PullUp deal scans or types this code on their claim, you earn a bonus once they
          complete the visit.
        </Text>
        <Pressable
          style={styles.shareButton}
          onPress={handleShare}
          disabled={!code}
          accessibilityRole="button"
          accessibilityLabel="Share your driver code"
        >
          <Text style={styles.shareButtonText}>Share code</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle} accessibilityRole="header">
        Riders who added your code ({riders.length})
      </Text>

      {error && (
        <View style={styles.errorBanner} accessibilityRole="alert">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </>
  );

  if (loading && riders.length === 0 && !code) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#5B53EE" accessibilityLabel="Loading" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={riders}
        keyExtractor={(item) => item.rider_id}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <View
            style={styles.riderCard}
            accessible
            accessibilityLabel={`${item.rider_display_name}, ${item.completed_visits} visits, earned ${item.earned.toFixed(2)}`}
          >
            <View style={styles.riderAvatar} importantForAccessibility="no-hide-descendants">
              <Text style={styles.riderAvatarText} maxFontSizeMultiplier={1.4}>
                {item.rider_display_name
                  .replace(".", "")
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()}
              </Text>
            </View>
            <View style={styles.riderInfo}>
              <Text style={styles.riderName}>{item.rider_display_name}</Text>
              <Text style={styles.riderMeta}>
                {item.completed_visits} visit{item.completed_visits === 1 ? "" : "s"} · last{" "}
                {new Date(item.last_ride_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </Text>
            </View>
            <View style={styles.earnedBadge}>
              <Text style={styles.earnedValue}>${item.earned.toFixed(2)}</Text>
              <Text style={styles.earnedLabel}>earned</Text>
            </View>
          </View>
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadRiders} tintColor="#5B53EE" colors={["#5B53EE"]} />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No riders yet</Text>
              <Text style={styles.emptySubtitle}>
                When a rider adds your code to a claim, they&apos;ll show up here.
              </Text>
            </View>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8F9FA",
  },
  codeCard: {
    backgroundColor: "#5B53EE",
    marginVertical: 16,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
  },
  codeLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 16,
  },
  qrWrap: {
    backgroundColor: "#FFFFFF",
    padding: 12,
    borderRadius: 12,
  },
  codeValue: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 4,
    marginTop: 16,
    marginBottom: 8,
  },
  codeHint: {
    color: "#FFFFFF",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  shareButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 32,
    minHeight: 44,
    justifyContent: "center",
  },
  shareButtonText: {
    color: "#5B53EE",
    fontSize: 15,
    fontWeight: "700",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 8,
  },
  errorBanner: {
    backgroundColor: "#FEE2E2",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  riderCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  riderAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F0EFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  riderAvatarText: {
    color: "#5B53EE",
    fontWeight: "700",
    fontSize: 16,
  },
  riderInfo: {
    flex: 1,
  },
  riderName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1A1A2E",
  },
  riderMeta: {
    fontSize: 12,
    color: "#4B5563",
    marginTop: 2,
  },
  earnedBadge: {
    alignItems: "flex-end",
  },
  earnedValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#047857",
  },
  earnedLabel: {
    fontSize: 11,
    color: "#4B5563",
  },
  separator: {
    height: 8,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1A1A2E",
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#4B5563",
    textAlign: "center",
  },
});
