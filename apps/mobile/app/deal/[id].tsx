/**
 * Deal detail screen.
 *
 * Displays a single deal with its venue location on a map, discount info,
 * a ride-credit callout, and a "Claim" button. The deal is fetched via
 * `fetchDealDetail` which returns a `DealWithVenue` (no slot or expiry data).
 *
 * Only riders claim deals (claim-deal enforces this too). Drivers see deals
 * so they can suggest them to passengers, with a note instead of the button.
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
  Image,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import MapView, { Marker } from "react-native-maps";
import { fetchDealDetail, claimDeal } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { DealWithVenue } from "@pullup/shared";

/** Format a deal's discount as a human-readable badge string. */
function formatDiscount(deal: DealWithVenue): string {
  if (deal.discount_type === "percentage") {
    return `${deal.discount_value}% OFF`;
  }
  return `$${deal.discount_value} OFF`;
}

/** "2 hours", "90 minutes", "1 hour 30 minutes". */
function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h ? `${h} hour${h === 1 ? "" : "s"}` : "";
  const mins = m ? `${m} minute${m === 1 ? "" : "s"}` : "";
  return [hours, mins].filter(Boolean).join(" ") || "0 minutes";
}

export default function DealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { role } = useAuth();
  const isRider = role === "rider";

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
      "Claim this deal",
      `Claim "${deal.title}" at ${deal.venue.name}? You'll have ${formatDuration(deal.hold_duration_minutes)} to get there and check in.`,
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
              Alert.alert("Deal claimed", `Get there within ${formatDuration(deal.hold_duration_minutes)}, then check in on the claim screen.`, [
                {
                  text: "View claim",
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
          color="#5B53EE"
          accessibilityLabel="Loading deal details"
        />
      </View>
    );
  }

  if (error || !deal) {
    return (
      <View style={styles.centered}>
        <Text maxFontSizeMultiplier={1.5} style={styles.errorIcon}>!</Text>
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
      <ScrollView contentContainerStyle={[styles.scrollContent, !isRider && styles.scrollContentNoBar]}>
        {deal.venue.image_url && (
          <Image
            source={{ uri: deal.venue.image_url }}
            style={styles.venuePhoto}
            accessible
            accessibilityRole="image"
            accessibilityLabel={`Photo of ${deal.venue.name}`}
            resizeMode="cover"
          />
        )}
        <MapView
          style={styles.map}
          accessible
          accessibilityLabel={`Map showing ${deal.venue.name} at ${deal.venue.address}`}
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
            pinColor="#5B53EE"
          />
        </MapView>

        <View style={styles.content}>
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>{formatDiscount(deal)}</Text>
          </View>

          <Text maxFontSizeMultiplier={1.5} style={styles.title}>{deal.title}</Text>

          <View style={styles.venueSection}>
            <Text style={styles.venueName}>{deal.venue.name}</Text>
            <Text style={styles.venueAddress}>
              {deal.venue.address}
              {deal.venue.city ? `, ${deal.venue.city}` : ""}
            </Text>
          </View>

          <Text style={styles.description}>{deal.description}</Text>

          {deal.ride_credit_amount > 0 && (
            <View style={styles.rideCreditCallout}>
              <Text style={styles.rideCreditText}>
                Get ${Number(deal.ride_credit_amount).toFixed(2)} in ride credit
              </Text>
              {(deal.requires_ride_receipt || deal.requires_venue_receipt) && (
                <Text style={styles.receiptNote}>
                  {deal.requires_ride_receipt && deal.requires_venue_receipt
                    ? "Keep your ride receipt and your bill. You'll upload both after you check in."
                    : deal.requires_ride_receipt
                    ? "Keep your Uber or Lyft receipt. You'll upload it after you check in."
                    : "Keep your bill. You'll upload it after you check in."}
                </Text>
              )}
            </View>
          )}

          <View style={styles.detailsGrid}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Spots per day</Text>
              <Text style={styles.detailValue}>{deal.daily_cap}</Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Time to get there</Text>
              <Text style={styles.detailValue}>{formatDuration(deal.hold_duration_minutes)}</Text>
            </View>
          </View>

          {!isRider && (
            <View style={styles.driverNote}>
              <Text style={styles.driverNoteTitle} accessibilityRole="header">
                Riders claim deals
              </Text>
              <Text style={styles.driverNoteText}>
                {role === "driver"
                  ? `Tell your passengers about this deal. When they claim it and add your driver code, you earn $${Number(deal.driver_kickback_amount).toFixed(2)} once the visit is complete.`
                  : "Sign in with a rider account to claim deals."}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {isRider && (
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
            <Text style={styles.claimButtonText}>Claim this deal</Text>
          )}
        </Pressable>
      </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  venuePhoto: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#E5E7EB",
  },
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  scrollContent: {
    paddingBottom: 120,
  },
  scrollContentNoBar: {
    paddingBottom: 32,
  },
  driverNote: {
    marginTop: 20,
    backgroundColor: "#F0EFFF",
    borderRadius: 12,
    padding: 16,
  },
  driverNoteTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 4,
  },
  driverNoteText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#374151",
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
    color: "#B91C1C",
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
    backgroundColor: "#5B53EE",
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
    color: "#5B53EE",
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
    color: "#5B53EE",
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
  receiptNote: {
    color: "#065F46",
    fontSize: 14,
    textAlign: "center",
    marginTop: 4,
  },
  rideCreditText: {
    color: "#047857",
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
    backgroundColor: "#5B53EE",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: "#5B53EE",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  claimButtonDisabled: {
    backgroundColor: "#6B7280",
    shadowOpacity: 0,
  },
  claimButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
});
