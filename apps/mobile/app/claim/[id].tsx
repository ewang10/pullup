/**
 * @file claim/[id].tsx
 * Active claim detail screen.
 *
 * Displays the current status of a deal claim, a live countdown timer until
 * expiry, a step progress indicator (Reserved -> Verified -> Complete), and
 * action buttons to scan the venue QR code, upload a ride receipt, or cancel
 * the claim.
 *
 * The claim is fetched via `fetchMyClaims` and filtered by the route `id`
 * parameter. Domain types come from `@pullup/shared`.
 */
import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { fetchMyClaims, cancelClaim, uploadReceipt } from "../../lib/api";
import type { DealClaimWithDeal, ClaimStatus } from "@pullup/shared";
import { CLAIM_STATUSES } from "@pullup/shared";

// ── Countdown hook ───────────────────────────────────────────

/** Returns a live human-readable countdown string for a given ISO-8601 expiry. */
function useCountdown(expiresAt: string | undefined) {
  const [timeLeft, setTimeLeft] = useState("");
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!expiresAt) {
      setTimeLeft("");
      return;
    }

    const update = () => {
      const now = Date.now();
      const expiry = new Date(expiresAt).getTime();
      const diff = expiry - now;

      if (diff <= 0) {
        setTimeLeft("Expired");
        setIsExpired(true);
        return;
      }

      setIsExpired(false);
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}m ${seconds}s`);
      } else {
        setTimeLeft(`${seconds}s`);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return { timeLeft, isExpired };
}

// ── Step progress indicator ──────────────────────────────────

/** The three logical steps a claim goes through. */
const STEPS = [
  { key: "reserved", label: "Reserved" },
  { key: "verified", label: "Verified" },
  { key: "completed", label: "Complete" },
] as const;

/**
 * Map a `ClaimStatus` to the zero-based step index.
 *
 * - `reserved` -> step 0
 * - `completed` -> step 2 (both verified and complete)
 * - `expired` / `cancelled` -> step 0 (no progress beyond reservation)
 */
function statusToStepIndex(status: ClaimStatus): number {
  switch (status) {
    case CLAIM_STATUSES.COMPLETED:
      return 2;
    case CLAIM_STATUSES.RESERVED:
      return 0;
    default:
      return 0;
  }
}

function StepProgress({ status }: { status: ClaimStatus }) {
  const currentStep = statusToStepIndex(status);

  return (
    <View
      style={stepStyles.container}
      accessibilityLabel={`Claim progress: step ${currentStep + 1} of ${STEPS.length}`}
      accessibilityRole="progressbar"
    >
      {STEPS.map((step, index) => {
        const isComplete = index <= currentStep;
        const isLast = index === STEPS.length - 1;

        return (
          <View key={step.key} style={stepStyles.stepRow}>
            {/* Circle */}
            <View
              style={[
                stepStyles.circle,
                isComplete ? stepStyles.circleComplete : stepStyles.circleIncomplete,
              ]}
            >
              {isComplete ? (
                <Text style={stepStyles.checkText}>{"\u2713"}</Text>
              ) : (
                <Text style={stepStyles.stepNumber}>{index + 1}</Text>
              )}
            </View>

            {/* Label */}
            <Text
              style={[
                stepStyles.label,
                isComplete ? stepStyles.labelComplete : stepStyles.labelIncomplete,
              ]}
            >
              {step.label}
            </Text>

            {/* Connector line */}
            {!isLast && (
              <View
                style={[
                  stepStyles.connector,
                  index < currentStep
                    ? stepStyles.connectorComplete
                    : stepStyles.connectorIncomplete,
                ]}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

const stepStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  circle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  circleComplete: {
    backgroundColor: "#6C63FF",
  },
  circleIncomplete: {
    backgroundColor: "#E5E7EB",
  },
  checkText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  stepNumber: {
    color: "#9CA3AF",
    fontSize: 14,
    fontWeight: "700",
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 6,
  },
  labelComplete: {
    color: "#6C63FF",
  },
  labelIncomplete: {
    color: "#9CA3AF",
  },
  connector: {
    width: 24,
    height: 3,
    borderRadius: 2,
    marginHorizontal: 6,
  },
  connectorComplete: {
    backgroundColor: "#6C63FF",
  },
  connectorIncomplete: {
    backgroundColor: "#E5E7EB",
  },
});

// ── Status badge helper ──────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  reserved: { bg: "#FEF3C7", text: "#D97706" },
  completed: { bg: "#ECFDF5", text: "#059669" },
  expired: { bg: "#FEE2E2", text: "#DC2626" },
  cancelled: { bg: "#F3F4F6", text: "#6B7280" },
};

function formatDiscount(claim: DealClaimWithDeal): string {
  const deal = claim.deal;
  if (deal.discount_type === "percentage") {
    return `${deal.discount_value}% OFF`;
  }
  return `$${deal.discount_value} OFF`;
}

// ── Main screen ──────────────────────────────────────────────

export default function ClaimDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [claim, setClaim] = useState<DealClaimWithDeal | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const { timeLeft, isExpired } = useCountdown(claim?.expires_at);

  /** Load the claim by fetching all claims and filtering by ID. */
  const loadClaim = useCallback(async () => {
    if (!id) return;

    const { data, error: err } = await fetchMyClaims();
    if (err) {
      setError(err);
    } else if (data) {
      const match = data.find((c) => c.id === id);
      if (match) {
        setClaim(match);
        setError(null);
      } else {
        setError("Claim not found");
      }
    }
  }, [id]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadClaim();
      setLoading(false);
    })();
  }, [loadClaim]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadClaim();
    setRefreshing(false);
  };

  /** Navigate to the QR scanner screen. */
  const handleScanQR = () => {
    if (!id) return;
    router.push(`/scan?claimId=${id}`);
  };

  /** Open the image picker and upload the selected receipt. */
  const handleUploadReceipt = async () => {
    if (!claim) return;

    const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permResult.granted) {
      Alert.alert(
        "Permission Required",
        "PullUp needs access to your photos to upload a ride receipt."
      );
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
    });

    if (pickerResult.canceled || pickerResult.assets.length === 0) return;

    setActionLoading(true);
    const imageUri = pickerResult.assets[0].uri;
    const { data, error: err } = await uploadReceipt(claim.id, imageUri);
    setActionLoading(false);

    if (err) {
      Alert.alert("Upload Failed", err);
    } else {
      Alert.alert("Receipt Uploaded", "Your ride receipt has been submitted for review.");
      await loadClaim();
    }
  };

  /** Cancel the claim after confirmation. */
  const handleCancel = () => {
    if (!claim) return;

    Alert.alert(
      "Cancel Claim",
      "Are you sure you want to cancel this claim? This action cannot be undone.",
      [
        { text: "Keep Claim", style: "cancel" },
        {
          text: "Cancel Claim",
          style: "destructive",
          onPress: async () => {
            setActionLoading(true);
            const { error: err } = await cancelClaim(claim.id);
            setActionLoading(false);

            if (err) {
              Alert.alert("Error", err);
            } else {
              Alert.alert("Claim Cancelled", "Your claim has been cancelled.", [
                { text: "OK", onPress: () => router.back() },
              ]);
            }
          },
        },
      ]
    );
  };

  // ── Loading state ──────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator
          size="large"
          color="#6C63FF"
          accessibilityLabel="Loading claim details"
        />
      </View>
    );
  }

  // ── Error state ────────────────────────────────────────────
  if (error || !claim) {
    return (
      <View style={styles.centered}>
        <View style={styles.errorIconContainer}>
          <Text style={styles.errorIconText}>!</Text>
        </View>
        <Text style={styles.errorTitle}>Could not load claim</Text>
        <Text style={styles.errorMessage}>{error ?? "Claim not found"}</Text>
        <Pressable
          style={styles.retryButton}
          onPress={async () => {
            setLoading(true);
            setError(null);
            await loadClaim();
            setLoading(false);
          }}
          accessibilityLabel="Retry loading claim"
          accessibilityRole="button"
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const statusColors = STATUS_COLORS[claim.status] ?? STATUS_COLORS.cancelled;
  const isReserved = claim.status === CLAIM_STATUSES.RESERVED;
  const isCompleted = claim.status === CLAIM_STATUSES.COMPLETED;
  const isCancelled = claim.status === CLAIM_STATUSES.CANCELLED;
  const hasReceipt = !!claim.ride_receipt_url;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#6C63FF"
            colors={["#6C63FF"]}
          />
        }
      >
        {/* Status card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View
              style={[styles.statusBadge, { backgroundColor: statusColors.bg }]}
            >
              <Text style={[styles.statusText, { color: statusColors.text }]}>
                {claim.status.charAt(0).toUpperCase() + claim.status.slice(1)}
              </Text>
            </View>
            {isReserved && !isExpired && (
              <Text
                style={styles.countdown}
                accessibilityLabel={`Time remaining: ${timeLeft}`}
                accessibilityRole="timer"
              >
                {timeLeft}
              </Text>
            )}
            {isReserved && isExpired && (
              <Text style={styles.countdownExpired}>Expired</Text>
            )}
          </View>

          {/* Step progress */}
          <StepProgress status={claim.status} />
        </View>

        {/* Deal info card */}
        <View style={styles.card}>
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>{formatDiscount(claim)}</Text>
          </View>
          <Text style={styles.dealTitle}>{claim.deal.title}</Text>
          <Text style={styles.dealDescription}>{claim.deal.description}</Text>

          <View style={styles.venueDivider} />

          <Text style={styles.venueName}>{claim.deal.venue.name}</Text>
          <Text style={styles.venueAddress}>{claim.deal.venue.address}</Text>
          <Text style={styles.venueCity}>
            {claim.deal.venue.city}, {claim.deal.venue.state}
          </Text>
        </View>

        {/* Details grid */}
        <View style={styles.detailsGrid}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Reserved At</Text>
            <Text style={styles.detailValue}>
              {new Date(claim.reserved_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Ride Credit</Text>
            <Text style={styles.detailValue}>
              ${claim.deal.ride_credit_amount}
            </Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Receipt</Text>
            <Text style={styles.detailValue}>
              {hasReceipt ? "Uploaded" : "Pending"}
            </Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Credit Paid</Text>
            <Text style={styles.detailValue}>
              {claim.ride_credit_paid ? "Yes" : "No"}
            </Text>
          </View>
        </View>

        {/* Spacer for bottom bar */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Action buttons - only for active reserved claims */}
      {isReserved && !isExpired && (
        <View style={styles.bottomBar}>
          {actionLoading ? (
            <ActivityIndicator
              size="large"
              color="#6C63FF"
              accessibilityLabel="Processing action"
            />
          ) : (
            <>
              <View style={styles.actionRow}>
                <Pressable
                  style={styles.primaryButton}
                  onPress={handleScanQR}
                  accessibilityLabel="Scan venue QR code to verify visit"
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryButtonText}>Scan QR</Text>
                </Pressable>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={handleUploadReceipt}
                  accessibilityLabel="Upload ride receipt image"
                  accessibilityRole="button"
                >
                  <Text style={styles.secondaryButtonText}>
                    Upload Receipt
                  </Text>
                </Pressable>
              </View>
              <Pressable
                style={styles.cancelClaimButton}
                onPress={handleCancel}
                accessibilityLabel="Cancel this claim"
                accessibilityRole="button"
              >
                <Text style={styles.cancelClaimButtonText}>Cancel Claim</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      {/* Upload receipt for completed claims that don't have one yet */}
      {isCompleted && !hasReceipt && (
        <View style={styles.bottomBar}>
          {actionLoading ? (
            <ActivityIndicator
              size="large"
              color="#6C63FF"
              accessibilityLabel="Uploading receipt"
            />
          ) : (
            <Pressable
              style={styles.primaryButtonFull}
              onPress={handleUploadReceipt}
              accessibilityLabel="Upload ride receipt image"
              accessibilityRole="button"
            >
              <Text style={styles.primaryButtonText}>Upload Receipt</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

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
    padding: 32,
    gap: 8,
  },

  // ── Error state ────────────────────────────────────────────
  errorIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FEE2E2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  errorIconText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#DC2626",
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

  // ── Cards ──────────────────────────────────────────────────
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
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
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "700",
  },
  countdown: {
    fontSize: 15,
    fontWeight: "700",
    color: "#F59E0B",
  },
  countdownExpired: {
    fontSize: 15,
    fontWeight: "700",
    color: "#DC2626",
  },

  // ── Deal info ──────────────────────────────────────────────
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
  dealTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 6,
  },
  dealDescription: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
    marginBottom: 12,
  },
  venueDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginBottom: 12,
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
    marginBottom: 2,
  },
  venueCity: {
    fontSize: 14,
    color: "#6B7280",
  },

  // ── Details grid ───────────────────────────────────────────
  detailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 12,
  },
  detailItem: {
    flex: 1,
    minWidth: "45%",
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
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A2E",
  },

  // ── Bottom action bar ──────────────────────────────────────
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
    gap: 10,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: "#6C63FF",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#6C63FF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonFull: {
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
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: "#F0EFFF",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#6C63FF",
    fontSize: 16,
    fontWeight: "700",
  },
  cancelClaimButton: {
    alignItems: "center",
    paddingVertical: 8,
  },
  cancelClaimButtonText: {
    color: "#DC2626",
    fontSize: 15,
    fontWeight: "600",
  },
});
