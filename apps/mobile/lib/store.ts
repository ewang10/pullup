/**
 * @file store.ts
 * Global Zustand state store for the PullUp mobile app.
 *
 * Holds ephemeral client-side state for deals, claims, user location,
 * and driver statistics. All domain types are re-used from the shared
 * package so that the mobile layer stays in sync with the database schema.
 */

import { create } from "zustand";
import type {
  DealWithSlots,
  DealClaimWithDeal,
  DriverStats,
} from "@pullup/shared";

/** Simple latitude / longitude pair used for geolocation. */
export interface LocationCoords {
  latitude: number;
  longitude: number;
}

/** Shape of the global Zustand store. */
interface AppState {
  /** List of nearby deals with slot availability and distance info. */
  deals: DealWithSlots[];
  /** Whether the deals list is currently being fetched. */
  dealsLoading: boolean;
  /** Human-readable error message from the last deals fetch, if any. */
  dealsError: string | null;
  /** Replace the entire deals list. */
  setDeals: (deals: DealWithSlots[]) => void;
  /** Set the deals loading flag. */
  setDealsLoading: (loading: boolean) => void;
  /** Set or clear the deals error message. */
  setDealsError: (error: string | null) => void;

  /** List of the current user's deal claims, each joined with its deal and venue. */
  claims: DealClaimWithDeal[];
  /** Whether the claims list is currently being fetched. */
  claimsLoading: boolean;
  /** Human-readable error message from the last claims fetch, if any. */
  claimsError: string | null;
  /** Replace the entire claims list. */
  setClaims: (claims: DealClaimWithDeal[]) => void;
  /** Set the claims loading flag. */
  setClaimsLoading: (loading: boolean) => void;
  /** Set or clear the claims error message. */
  setClaimsError: (error: string | null) => void;

  /** User's current GPS coordinates, or null if not yet determined. */
  location: LocationCoords | null;
  /** Update the stored location. */
  setLocation: (location: LocationCoords | null) => void;

  /** Aggregated stats for the driver dashboard, or null if not loaded / not a driver. */
  driverStats: DriverStats | null;
  /** Replace the stored driver stats. */
  setDriverStats: (stats: DriverStats | null) => void;

  /** Reset every slice of state back to its initial value (e.g. on sign-out). */
  reset: () => void;
}

/** Default values used on first load and after reset. */
const initialState = {
  deals: [] as DealWithSlots[],
  dealsLoading: false,
  dealsError: null,
  claims: [] as DealClaimWithDeal[],
  claimsLoading: false,
  claimsError: null,
  location: null,
  driverStats: null,
};

/**
 * Primary Zustand store consumed by screens and hooks throughout the app.
 *
 * Usage:
 * ```ts
 * const deals = useAppStore((s) => s.deals);
 * ```
 */
export const useAppStore = create<AppState>((set) => ({
  ...initialState,

  setDeals: (deals) => set({ deals }),
  setDealsLoading: (dealsLoading) => set({ dealsLoading }),
  setDealsError: (dealsError) => set({ dealsError }),

  setClaims: (claims) => set({ claims }),
  setClaimsLoading: (claimsLoading) => set({ claimsLoading }),
  setClaimsError: (claimsError) => set({ claimsError }),

  setLocation: (location) => set({ location }),

  setDriverStats: (driverStats) => set({ driverStats }),

  reset: () => set(initialState),
}));
