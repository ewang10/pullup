/**
 * Deals map screen (home tab).
 *
 * Renders a full-screen map centered on the user's location with one marker
 * per venue (a venue can have several deals at the same spot). Tapping a
 * marker opens a panel listing that venue's deals; each opens the deal page.
 */
import { useEffect, useMemo, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, Region } from "react-native-maps";
import { useRouter } from "expo-router";
import { useAppStore } from "../../lib/store";
import type { DealWithSlots } from "@pullup/shared";
import { fetchDemoDeals, fetchNearbyDeals } from "../../lib/api";
import { getCurrentLocation } from "../../lib/location";

const DEFAULT_REGION: Region = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

/** Format a deal's discount as a human-readable string. */
function formatDiscount(deal: DealWithSlots): string {
  if (deal.discount_type === "percentage") {
    return `${deal.discount_value}% off`;
  }
  return `$${deal.discount_value} off`;
}

export default function DealsMapScreen() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
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

  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

  // One entry per venue, with its deals.
  const venues = useMemo(() => {
    const byVenue = new Map<string, { venue: DealWithSlots["venue"]; deals: DealWithSlots[] }>();
    for (const d of deals) {
      const entry = byVenue.get(d.venue.id) ?? { venue: d.venue, deals: [] };
      entry.deals.push(d);
      byVenue.set(d.venue.id, entry);
    }
    return [...byVenue.values()];
  }, [deals]);
  const selected = venues.find((v) => v.venue.id === selectedVenueId) ?? null;

  useEffect(() => {
    loadLocationAndDeals();
  }, []);

  const loadLocationAndDeals = async () => {
    setDealsLoading(true);
    setDealsError(null);

    const { coords, error: locError } = await getCurrentLocation();

    if (coords) {
      setLocation(coords);
      const newRegion: Region = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
      setRegion(newRegion);

      const { data, error } = await fetchNearbyDeals(
        coords.latitude,
        coords.longitude,
        10
      );

      if (error) {
        setDealsError(error);
      } else if (data) {
        setDeals(data);
        if (data.length > 0 && data.every((d) => d.is_demo)) {
          focusOn(data[0]);
        }
      }
    } else {
      // Without a location, still show the demo venue when one is configured.
      const { data } = await fetchDemoDeals();
      if (data && data.length > 0) {
        setDeals(data);
        focusOn(data[0]);
      } else {
        setDealsError(locError ?? "Could not determine location");
      }
    }

    setDealsLoading(false);
    setInitialLoaded(true);
  };

  const focusOn = (deal: DealWithSlots) => {
    const target: Region = {
      latitude: deal.venue.latitude,
      longitude: deal.venue.longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    };
    setRegion(target);
    mapRef.current?.animateToRegion(target, 600);
  };

  const showingDemo = deals.length > 0 && deals.every((d) => d.is_demo);

  const handleMarkerPress = (deal: DealWithSlots) => {
    router.push(`/deal/${deal.id}`);
  };

  if (!initialLoaded) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator
          size="large"
          color="#5B53EE"
          accessibilityLabel="Loading nearby deals"
        />
        <Text style={styles.loadingText}>Finding nearby deals...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton
      >
        {venues.map(({ venue, deals: venueDeals }) => (
          <Marker
            key={venue.id}
            coordinate={{ latitude: venue.latitude, longitude: venue.longitude }}
            onPress={() => setSelectedVenueId(venue.id)}
            pinColor="#5B53EE"
            accessibilityLabel={`${venue.name}, ${venueDeals.length} deal${venueDeals.length === 1 ? "" : "s"}`}
          />
        ))}
      </MapView>

      {selected && (
        <View style={styles.venuePanel} accessibilityViewIsModal={false}>
          <View style={styles.venuePanelHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.venuePanelTitle} maxFontSizeMultiplier={1.5} accessibilityRole="header">
                {selected.venue.name}
              </Text>
              <Text style={styles.venuePanelAddress} maxFontSizeMultiplier={1.5}>{selected.venue.address}</Text>
            </View>
            <Pressable
              onPress={() => setSelectedVenueId(null)}
              style={styles.venuePanelClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
            >
              <Ionicons name="close" size={22} color="#4B5563" />
            </Pressable>
          </View>
          <ScrollView style={styles.venuePanelList}>
            {selected.deals.map((deal) => (
              <Pressable
                key={deal.id}
                onPress={() => handleMarkerPress(deal)}
                style={styles.venueDealRow}
                accessibilityRole="button"
                accessibilityLabel={`${deal.title}, ${formatDiscount(deal)}, ${deal.slots_remaining} spots left today`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.venueDealTitle} maxFontSizeMultiplier={1.5}>{deal.title}</Text>
                  <Text style={styles.venueDealMeta} maxFontSizeMultiplier={1.5}>
                    {formatDiscount(deal)} · {deal.slots_remaining} spots left today
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {dealsError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{dealsError}</Text>
          <Pressable
            onPress={loadLocationAndDeals}
            accessibilityLabel="Retry loading deals"
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {dealsLoading && (
        <View style={styles.refreshIndicator}>
          <ActivityIndicator
            size="small"
            color="#5B53EE"
            accessibilityLabel="Refreshing deals"
          />
        </View>
      )}

      {showingDemo && !dealsError && (
        <View style={styles.demoBanner} accessibilityRole="summary">
          <Text style={styles.demoBannerTitle} maxFontSizeMultiplier={1.5}>No PullUp venues near you yet</Text>
          <Text style={styles.demoBannerText} maxFontSizeMultiplier={1.5}>
            Showing {deals[0].venue.name}, a demo venue in Sacramento.
          </Text>
        </View>
      )}

      {!selected && (
      <View style={styles.dealCount}>
        <Text style={styles.dealCountText} maxFontSizeMultiplier={1.5}>
          {deals.length} {showingDemo ? "demo " : ""}deal{deals.length !== 1 ? "s" : ""}
          {showingDemo ? "" : " nearby"}
        </Text>
      </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8F9FA",
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: "#4B5563",
    textAlign: "center",
    paddingHorizontal: 24,
  },
  demoBanner: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: "#EEF2FF",
    borderColor: "#C7D2FE",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
  errorBanner: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: "#FEE2E2",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 14,
    flex: 1,
  },
  retryText: {
    color: "#5B53EE",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 12,
  },
  refreshIndicator: {
    position: "absolute",
    top: 16,
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dealCount: {
    position: "absolute",
    bottom: 24,
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  venuePanel: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    maxHeight: "70%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingTop: 16,
    paddingBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  venuePanelHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  venuePanelTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1A1A2E",
  },
  venuePanelAddress: {
    fontSize: 14,
    color: "#4B5563",
    marginTop: 2,
  },
  venuePanelClose: {
    width: 44,
    height: 44,
    marginTop: -10,
    marginRight: -10,
    alignItems: "center",
    justifyContent: "center",
  },
  venuePanelList: {
    flexGrow: 0,
  },
  venueDealRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  venueDealTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1A1A2E",
  },
  venueDealMeta: {
    fontSize: 13,
    color: "#4B5563",
    marginTop: 2,
  },
  dealCountText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1A1A2E",
  },
});
