/**
 * Deal detail screen.
 *
 * Displays a single deal with its venue location on a map, discount info,
 * a ride-credit callout, and a "Claim" button. The deal is fetched via
 * `fetchDealDetail` which returns a `DealWithVenue` (no slot or expiry data).
 */
import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import MapView, { Marker } from "react-native-maps";
import { fetchDealDetail, claimDeal } from "../../lib/api";
import type { DealWithVenue } from "@pullup/shared";

/** Format a deal's discount as a human-readable badge string. */
function formatDiscount(deal: DealWithVenue): string {
  if (deal.discount_type === "percentage") {
    return `${deal.discount_value}% OFF`;
  }
  return `$${deal.discount_value} OFF`;
}

export default function DealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [deal, setDeal] = useState<DealWithVenue | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDeal();
  }, [id]);

  const loadDeal = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    const { data, error: err } = await fetchDealDetail(id);
    if (err) {
      setError(err);
    } else if (data) {
      setDeal(data);
    }
    setLoading(false);
  };

  const handleClaim = async () => {
    if (!deal) return;

    Alert.alert(
      "Claim This Deal",
      `Claim "${deal.title}" at ${deal.venue.name}? You'll have a limited time to visit and redeem.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Claim",
          onPress: async () => {
            setClaiming(true);
            const { data, error: err } = await claimDeal(deal.id);
            setClaiming(false);

            if (err) {
              Alert.alert("Error", err);
            } else if (data) {
              Alert.alert("Deal Claimed!", "Head to the venue to redeem.", [
                {
                  text: "View Claim",
                  onPress: () => router.replace(`/claim/${data.id}`),
                },
              ]);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator
          size="large"
          color="#6C63FF"
          accessibilityLabel="Loading deal details"
        />
      </View>
    );
  }

  if (error || !deal) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorIcon}>!</Text>
        <Text style={styles.errorTitle}>Could not load deal</Text>
        <Text style={styles.errorMessage}>{error ?? "Deal not found"}</Text>
        <Pressable
          style={styles.retryButton}
          onPress={loadDeal}
          accessibilityLabel="Retry loading deal"
          accessibilityRole="button"
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: deal.venue.latitude,
            longitude: deal.venue.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          scrollEnabled={false}
          zoomEnabled={false}
        >
          <Marker
            coordinate={{
              latitude: deal.venue.latitude,
              longitude: deal.venue.longitude,
            }}
            pinColor="#6C63FF"
          />
        </MapView>

        <View style={styles.content}>
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>{formatDiscount(deal)}</Text>
          </View>

          <Text style={styles.title}>{deal.title}</Text>

          <View style={styles.venueSection}>
            <Text style={styles.venueName}>{deal.venue.name}</Text>
            <Text style={styles.venueAddress}>{deal.venue.address}</Text>
          </View>

          <Text style={styles.description}>{deal.description}</Text>

          {deal.ride_credit_amount > 0 && (
            <View style={styles.rideCreditCallout}>
              <Text style={styles.rideCreditText}>
                Get ${deal.ride_credit_amount} ride credit!
              </Text>
            </View>
          )}

          <View style={styles.detailsGrid}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Daily Cap</Text>
              <Text style={styles.detailValue}>{deal.daily_cap}</Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Hold Time</Text>
              <Text style={styles.detailValue}>
                {deal.hold_duration_minutes} min
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <Pressable
          style={[
            styles.claimButton,
            claiming && styles.claimButtonDisabled,
          ]}
          onPress={handleClaim}
          disabled={claiming}
          accessibilityLabel={claiming ? "Claiming deal" : "Claim this deal"}
          accessibilityRole="button"
        >
          {claiming ? (
            <ActivityIndicator
              color="#FFFFFF"
              accessibilityLabel="Claiming in progress"
            />
          ) : (
            <Text style={styles.claimButtonText}>Claim This Deal</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  scrollContent: {
    paddingBottom: 100,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8F9FA",
    padding: 32,
    gap: 8,
  },
  errorIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FEE2E2",
    color: "#DC2626",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 48,
    marginBottom: 8,
    overflow: "hidden",
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1A1A2E",
  },
  errorMessage: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: "#6C63FF",
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 14,
  },
  map: {
    height: 200,
    width: "100%",
  },
  content: {
    padding: 20,
  },
  discountBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#F0EFFF",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 12,
  },
  discountText: {
    color: "#6C63FF",
    fontSize: 15,
    fontWeight: "700",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 12,
  },
  venueSection: {
    marginBottom: 16,
  },
  venueName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6C63FF",
    marginBottom: 4,
  },
  venueAddress: {
    fontSize: 14,
    color: "#6B7280",
  },
  description: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 22,
    marginBottom: 20,
  },
  rideCreditCallout: {
    backgroundColor: "#ECFDF5",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
  },
  rideCreditText: {
    color: "#059669",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  detailsGrid: {
    flexDirection: "row",
    gap: 12,
  },
  detailItem: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "500",
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A2E",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  claimButton: {
    backgroundColor: "#6C63FF",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: "#6C63FF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  claimButtonDisabled: {
    backgroundColor: "#9CA3AF",
    shadowOpacity: 0,
  },
  claimButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
});
