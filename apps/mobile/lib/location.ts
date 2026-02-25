import * as Location from "expo-location";

export interface Coords {
  latitude: number;
  longitude: number;
}

export async function getCurrentLocation(): Promise<{
  coords: Coords | null;
  error: string | null;
}> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      return { coords: null, error: "Location permission denied" };
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      coords: {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      },
      error: null,
    };
  } catch (err) {
    return { coords: null, error: "Failed to get current location" };
  }
}

/**
 * Calculate the distance between two coordinates using the Haversine formula.
 * Returns distance in miles.
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
