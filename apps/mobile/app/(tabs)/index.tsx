/**
 * Deals map screen (home tab).
 *
 * Renders a full-screen map centered on the user's location with markers for
 * each nearby deal (`DealWithSlots`). Tapping a marker's callout navigates to
 * the deal detail screen.
 */
import { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from "react-native";
import MapView, { Marker, Region } from "react-native-maps";
import { useRouter } from "expo-router";
import { useAppStore } from "../../lib/store";
import type { DealWithSlots } from "@pullup/shared";
import { fetchNearbyDeals } from "../../lib/api";
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
      }
    } else {
      setDealsError(locError ?? "Could not determine location");
    }

    setDealsLoading(false);
    setInitialLoaded(true);
  };

  const handleMarkerPress = (deal: DealWithSlots) => {
    router.push(`/deal/${deal.id}`);
  };

  if (!initialLoaded) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator
          size="large"
          color="#6C63FF"
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
        {deals.map((deal) => (
          <Marker
            key={deal.id}
            coordinate={{
              latitude: deal.venue.latitude,
              longitude: deal.venue.longitude,
            }}
            title={deal.venue.name}
            description={`${formatDiscount(deal)} - ${deal.slots_remaining} slots left`}
            onCalloutPress={() => handleMarkerPress(deal)}
            pinColor="#6C63FF"
          />
        ))}
      </MapView>

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
            color="#6C63FF"
            accessibilityLabel="Refreshing deals"
          />
        </View>
      )}

      <View style={styles.dealCount}>
        <Text style={styles.dealCountText}>
          {deals.length} deal{deals.length !== 1 ? "s" : ""} nearby
        </Text>
      </View>
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
    color: "#6B7280",
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
    color: "#DC2626",
    fontSize: 14,
    flex: 1,
  },
  retryText: {
    color: "#6C63FF",
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
  dealCountText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1A1A2E",
  },
});
