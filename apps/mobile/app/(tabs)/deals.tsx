/**
 * Deals list screen.
 *
 * Fetches nearby deals (as `DealWithSlots`) based on the user's location and
 * renders them in a scrollable, pull-to-refresh FlatList. Each card shows the
 * discount badge, venue info, distance, and remaining slot count.
 */
import { useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useAppStore } from "../../lib/store";
import type { DealWithSlots } from "@pullup/shared";
import { fetchDemoDeals, fetchNearbyDeals } from "../../lib/api";
import { getCurrentLocation } from "../../lib/location";

/** Format a deal's discount as a human-readable badge string. */
function formatDiscount(deal: DealWithSlots): string {
  if (deal.discount_type === "percentage") {
    return `${deal.discount_value}% OFF`;
  }
  return `$${deal.discount_value} OFF`;
}

function DealCard({ deal, onPress }: { deal: DealWithSlots; onPress: () => void }) {
  const slotsLow = deal.slots_remaining <= 3;
  const discountLabel = formatDiscount(deal);

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      accessibilityLabel={`${deal.title} at ${deal.venue.name}, ${discountLabel}`}
      accessibilityRole="button"
    >
      <View style={styles.cardHeader}>
        <View style={styles.discountBadge}>
          <Text style={styles.discountText}>{discountLabel}</Text>
        </View>
        {deal.is_demo ? (
          <Text style={styles.demoTag}>DEMO</Text>
        ) : (
          deal.distance_miles !== undefined && (
            <Text style={styles.distanceText}>
              {deal.distance_miles.toFixed(1)} mi
            </Text>
          )
        )}
      </View>

      <Text style={styles.cardTitle}>{deal.title}</Text>
      <Text style={styles.venueName}>{deal.venue.name}</Text>
      <Text style={styles.venueAddress} numberOfLines={1}>
        {deal.venue.address}
      </Text>

      <View style={styles.cardFooter}>
        <View style={styles.slotsContainer}>
          <View
            style={[styles.slotsDot, slotsLow && styles.slotsDotWarning]}
          />
          <Text
            style={[styles.slotsText, slotsLow && styles.slotsTextWarning]}
          >
            {deal.slots_remaining} slot{deal.slots_remaining !== 1 ? "s" : ""}{" "}
            left
          </Text>
        </View>
        <Text style={styles.viewText}>View Deal</Text>
      </View>
    </Pressable>
  );
}

export default function DealsListScreen() {
  const router = useRouter();
  const {
    deals,
    setDeals,
    dealsLoading,
    setDealsLoading,
    dealsError,
    setDealsError,
    location,
    setLocation,
  } = useAppStore();

  const loadDeals = useCallback(async () => {
    setDealsLoading(true);
    setDealsError(null);

    let lat = location?.latitude;
    let lng = location?.longitude;

    if (!lat || !lng) {
      const { coords } = await getCurrentLocation();
      if (coords) {
        lat = coords.latitude;
        lng = coords.longitude;
        setLocation(coords);
      }
    }

    if (lat && lng) {
      const { data, error } = await fetchNearbyDeals(lat, lng, 10);
      if (error) {
        setDealsError(error);
      } else if (data) {
        setDeals(data);
      }
    } else {
      // Without a location, still show the demo venue when one is configured.
      const { data } = await fetchDemoDeals();
      if (data && data.length > 0) {
        setDeals(data);
      } else {
        setDealsError("Could not determine location");
      }
    }

    setDealsLoading(false);
  }, [location]);

  useEffect(() => {
    if (deals.length === 0) {
      loadDeals();
    }
  }, []);

  const renderEmpty = () => {
    if (dealsLoading) return null;

    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>🏷</Text>
        <Text style={styles.emptyTitle}>No deals nearby</Text>
        <Text style={styles.emptySubtitle}>
          Check back later or expand your search radius.
        </Text>
        <Pressable
          style={styles.retryButton}
          onPress={loadDeals}
          accessibilityLabel="Refresh deals list"
          accessibilityRole="button"
        >
          <Text style={styles.retryButtonText}>Refresh</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {dealsError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{dealsError}</Text>
        </View>
      )}

      <FlatList
        data={deals}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <DealCard
            deal={item}
            onPress={() => router.push(`/deal/${item.id}`)}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmpty}
        ListHeaderComponent={
          deals.length > 0 && deals.every((d) => d.is_demo) ? (
            <View style={styles.demoBanner}>
              <Text style={styles.demoBannerTitle}>No PullUp venues near you yet</Text>
              <Text style={styles.demoBannerText}>
                These deals are from {deals[0].venue.name}, a demo venue in Sacramento, so
                you can explore the app.
              </Text>
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={dealsLoading}
            onRefresh={loadDeals}
            tintColor="#5B53EE"
            colors={["#5B53EE"]}
          />
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
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  discountBadge: {
    backgroundColor: "#F0EFFF",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  discountText: {
    color: "#5B53EE",
    fontSize: 13,
    fontWeight: "700",
  },
  demoTag: {
    color: "#4F46E5",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  demoBanner: {
    backgroundColor: "#EEF2FF",
    borderColor: "#C7D2FE",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 2,
    marginBottom: 12,
  },
  demoBannerTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1A1A2E",
  },
  demoBannerText: {
    fontSize: 13,
    color: "#4B5563",
  },
  distanceText: {
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "500",
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1A1A2E",
    marginBottom: 4,
  },
  venueName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#5B53EE",
    marginBottom: 2,
  },
  venueAddress: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 12,
  },
  slotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  slotsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#047857",
  },
  slotsDotWarning: {
    backgroundColor: "#B45309",
  },
  slotsText: {
    fontSize: 13,
    color: "#047857",
    fontWeight: "500",
  },
  slotsTextWarning: {
    color: "#B45309",
  },
  viewText: {
    fontSize: 14,
    color: "#5B53EE",
    fontWeight: "600",
  },
  separator: {
    height: 12,
  },
  errorBanner: {
    backgroundColor: "#FEE2E2",
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 64,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1A1A2E",
  },
  emptySubtitle: {
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
});
