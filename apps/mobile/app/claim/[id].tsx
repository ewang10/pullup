/**
 * @file claim/[id].tsx
 * Active claim detail screen.
 *
 * Displays the current status of a deal claim, a live countdown timer until
 * expiry, a step progress indicator (Claimed -> Checked in -> Credit paid), and
 * action buttons to scan the venue QR code, upload a ride receipt, or cancel
 * the claim.
 *
 * The claim is fetched via `fetchMyClaims` and filtered by the route `id`
 * parameter. Domain types come from `@pullup/shared`.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import {
  TextInput,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { fetchMyClaims, cancelClaim, uploadReceipt, linkDriver, completeClaimWithCode } from "../../lib/api";
import type { DealClaimWithDeal, ClaimStatus } from "@pullup/shared";
import { CLAIM_STATUSES, parseDriverCode, receiptDeadline, type ReceiptType } from "@pullup/shared";

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

/** The three steps a visit goes through, as the rider sees them. */
const STEPS = [
  { key: "claimed", label: "Claimed" },
  { key: "checked_in", label: "Checked in" },
  { key: "paid", label: "Credit paid" },
] as const;

/**
 * Zero-based index of the last finished step: claimed (0), checked in (1),
 * or credit paid (2, only once any required receipts are approved).
 */
function stepIndex(status: ClaimStatus, creditPaid: boolean): number {
  if (status !== CLAIM_STATUSES.COMPLETED) return 0;
  return creditPaid ? 2 : 1;
}

function StepProgress({ status, creditPaid }: { status: ClaimStatus; creditPaid: boolean }) {
  const currentStep = stepIndex(status, creditPaid);

  return (
    <View
      style={stepStyles.container}
      // One element for screen readers: the step number and its name.
      accessible
      accessibilityLabel={`Claim progress: step ${currentStep + 1} of ${STEPS.length}, ${STEPS[currentStep]?.label ?? ""}`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: STEPS.length, now: currentStep + 1 }}
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
                <Text style={stepStyles.checkText} maxFontSizeMultiplier={1.4}>{"\u2713"}</Text>
              ) : (
                <Text style={stepStyles.stepNumber} maxFontSizeMultiplier={1.4}>{index + 1}</Text>
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
    backgroundColor: "#5B53EE",
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
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "700",
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 6,
  },
  labelComplete: {
    color: "#5B53EE",
  },
  labelIncomplete: {
    color: "#6B7280",
  },
  connector: {
    width: 24,
    height: 3,
    borderRadius: 2,
    marginHorizontal: 6,
  },
  connectorComplete: {
    backgroundColor: "#5B53EE",
  },
  connectorIncomplete: {
    backgroundColor: "#E5E7EB",
  },
});

// ── Status badge helper ──────────────────────────────────────

// Same labels as the Claims list.
const STATUS_LABEL: Record<string, string> = {
  reserved: "Reserved",
  completed: "Visited",
  expired: "Expired",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  reserved: { bg: "#FEF3C7", text: "#92400E" },
  completed: { bg: "#ECFDF5", text: "#047857" },
  expired: { bg: "#FEE2E2", text: "#B91C1C" },
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
  const [driverCode, setDriverCode] = useState("");
  const [driverError, setDriverError] = useState<string | null>(null);
  const [linkingDriver, setLinkingDriver] = useState(false);
  const [linkedDriverName, setLinkedDriverName] = useState<string | null>(null);
  const [uploadingType, setUploadingType] = useState<ReceiptType | null>(null);
  // Typed check-in, for riders who can't scan the venue QR code.
  const [venueCode, setVenueCode] = useState("");
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkinError, setCheckinError] = useState<string | null>(null);

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

  // Reload when returning from the scanner (e.g. after adding a driver).
  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      loadClaim();
    }, [loadClaim])
  );

  const handleAddDriverCode = async () => {
    if (!claim) return;
    const code = parseDriverCode(driverCode);
    if (!code) {
      setDriverError("Driver codes are 8 letters and numbers, like 86YS23YR.");
      return;
    }
    setLinkingDriver(true);
    setDriverError(null);
    const { data, error: err } = await linkDriver(claim.id, code);
    setLinkingDriver(false);
    if (err) {
      setDriverError(err);
      return;
    }
    setLinkedDriverName(data?.driver_name ?? null);
    setDriverCode("");
    await loadClaim();
  };

  const handleCodeCheckIn = async () => {
    if (!claim) return;
    const code = venueCode.trim().toUpperCase().replace(/[\s-]/g, "");
    if (code.length !== 6) {
      setCheckinError("Venue codes are 6 letters and numbers.");
      return;
    }
    setCheckingIn(true);
    setCheckinError(null);
    const { error: err } = await completeClaimWithCode(claim.id, code);
    setCheckingIn(false);
    if (err) {
      setCheckinError(err);
      return;
    }
    setVenueCode("");
    Alert.alert("Checked in", "Your visit is confirmed. Enjoy your deal!");
    await loadClaim();
  };

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
  const handleUploadReceipt = async (type: ReceiptType) => {
    if (!claim) return;

    const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permResult.granted) {
      Alert.alert(
        "Permission needed",
        "PullUp needs access to your photos to upload a receipt."
      );
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      // No crop step: it forced a fixed frame that cut off long receipts.
      allowsEditing: false,
    });

    if (pickerResult.canceled || pickerResult.assets.length === 0) return;

    setUploadingType(type);
    const imageUri = pickerResult.assets[0].uri;
    const { error: err } = await uploadReceipt(claim.id, imageUri, type);
    setUploadingType(null);

    if (err) {
      Alert.alert("Upload failed", err);
    } else {
      Alert.alert("Receipt submitted", "Our team will review it, usually within a day.");
      await loadClaim();
    }
  };

  /** Cancel the claim after confirmation. */
  const handleCancel = () => {
    if (!claim) return;

    Alert.alert(
      "Cancel claim",
      "Are you sure you want to cancel this claim? This action cannot be undone.",
      [
        { text: "Keep claim", style: "cancel" },
        {
          text: "Cancel claim",
          style: "destructive",
          onPress: async () => {
            setActionLoading(true);
            const { error: err } = await cancelClaim(claim.id);
            setActionLoading(false);

            if (err) {
              Alert.alert("Error", err);
            } else {
              Alert.alert("Claim cancelled", "Your claim has been cancelled.", [
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
          color="#5B53EE"
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
          <Text style={styles.errorIconText} maxFontSizeMultiplier={1.4}>!</Text>
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
  const requiredReceipts: { type: ReceiptType; label: string; help: string; url: string | null; status: string | null }[] = [
    ...(claim.deal.requires_ride_receipt
      ? [{
          type: "ride" as const,
          label: "Ride receipt",
          help: "Your Uber or Lyft receipt for the trip here",
          url: claim.ride_receipt_url,
          status: claim.ride_receipt_status,
        }]
      : []),
    ...(claim.deal.requires_venue_receipt
      ? [{
          type: "venue" as const,
          label: "Venue receipt",
          help: "Your bill from the venue",
          url: claim.venue_receipt_url,
          status: claim.venue_receipt_status,
        }]
      : []),
  ];
  const allReceiptsApproved = requiredReceipts.every((r) => r.status === "approved");
  // One-word receipt summary for the details grid, shown only after check-in.
  const receiptSummary =
    requiredReceipts.length === 0
      ? "Not needed"
      : allReceiptsApproved
      ? "Approved"
      : claim.unverified_at
      ? "Missed"
      : requiredReceipts.some((r) => r.status === "rejected")
      ? "Re-upload"
      : requiredReceipts.some((r) => !r.url)
      ? "To upload"
      : "In review";

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#5B53EE"
            colors={["#5B53EE"]}
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
                {STATUS_LABEL[claim.status] ?? claim.status}
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

          {/* Step progress (not for claims that ended without a visit) */}
          {(isReserved || isCompleted) && (
            <StepProgress status={claim.status} creditPaid={claim.ride_credit_paid} />
          )}
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

        {/* Driver: riders add the code of the driver who brought them */}
        {(isReserved && !isExpired) || claim.referring_driver_id ? (
          <View style={styles.card}>
            {claim.referring_driver_id ? (
              <View accessibilityLiveRegion="polite">
                <Text style={styles.driverTitle}>✓ Driver added</Text>
                <Text style={styles.driverText}>
                  {!isCompleted
                    ? `${linkedDriverName ?? "Your driver"} will earn a bonus for bringing you here. Your deal stays the same.`
                    : claim.ride_credit_paid
                    ? `${linkedDriverName ?? "Your driver"} earned a bonus for bringing you here.`
                    : claim.unverified_at
                    ? "This visit closed without a receipt, so no bonus was paid."
                    : `${linkedDriverName ?? "Your driver"} earns a bonus once your visit is approved.`}
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.driverTitle}>Riding with a PullUp driver?</Text>
                <Text style={styles.driverText}>
                  Add their driver code so they earn a bonus for bringing you here. Your deal stays the same.
                </Text>
                <Pressable
                  style={styles.driverScanButton}
                  onPress={() => router.push(`/scan?claimId=${claim.id}&mode=driver`)}
                  accessibilityRole="button"
                  accessibilityLabel="Scan driver code"
                >
                  <Text style={styles.driverScanButtonText}>Scan driver code</Text>
                </Pressable>
                <Text style={styles.driverOr}>or type it</Text>
                <View style={styles.driverInputRow}>
                  <TextInput
                    style={styles.driverInput}
                    value={driverCode}
                    onChangeText={(t) => {
                      // Uppercased on submit: transforming here drops keystrokes on iOS.
                      setDriverCode(t);
                      setDriverError(null);
                    }}
                    placeholder="e.g. 86YS23YR"
                    placeholderTextColor="#6B7280"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={12}
                    clearButtonMode="while-editing"
                    editable={!linkingDriver}
                    accessibilityLabel="Driver code"
                    returnKeyType="done"
                    onSubmitEditing={handleAddDriverCode}
                  />
                  <Pressable
                    style={[styles.driverAddButton, (linkingDriver || !driverCode) && styles.buttonDisabled]}
                    onPress={handleAddDriverCode}
                    disabled={linkingDriver || !driverCode}
                    accessibilityRole="button"
                    accessibilityLabel="Add driver code"
                    accessibilityState={{ disabled: linkingDriver || !driverCode, busy: linkingDriver }}
                  >
                    {linkingDriver ? (
                      <ActivityIndicator color="#FFFFFF" accessibilityLabel="Adding driver" />
                    ) : (
                      <Text style={styles.driverAddButtonText}>Add</Text>
                    )}
                  </Pressable>
                </View>
                {driverError && (
                  <Text style={styles.driverError} accessibilityRole="alert" accessibilityLiveRegion="polite">
                    {driverError}
                  </Text>
                )}
              </>
            )}
          </View>
        ) : null}

        {/* Check in without the camera */}
        {isReserved && !isExpired && (
          <View style={styles.card}>
            <Text style={styles.driverTitle} accessibilityRole="header">Can&apos;t scan the QR code?</Text>
            <Text style={styles.driverText}>
              Ask the staff for the venue&apos;s 6-character check-in code and type it here.
            </Text>
            <View style={[styles.driverInputRow, { marginTop: 12 }]}>
              <TextInput
                style={styles.driverInput}
                value={venueCode}
                onChangeText={(t) => {
                  setVenueCode(t);
                  setCheckinError(null);
                }}
                placeholder="e.g. CAFE42"
                placeholderTextColor="#6B7280"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={8}
                clearButtonMode="while-editing"
                editable={!checkingIn}
                accessibilityLabel="Venue check-in code"
                returnKeyType="done"
                onSubmitEditing={handleCodeCheckIn}
              />
              <Pressable
                style={[styles.driverAddButton, (checkingIn || !venueCode) && styles.buttonDisabled]}
                onPress={handleCodeCheckIn}
                disabled={checkingIn || !venueCode}
                accessibilityRole="button"
                accessibilityLabel="Check in with code"
                accessibilityState={{ disabled: checkingIn || !venueCode, busy: checkingIn }}
              >
                {checkingIn ? (
                  <ActivityIndicator color="#FFFFFF" accessibilityLabel="Checking in" />
                ) : (
                  <Text style={styles.driverAddButtonText}>Check in</Text>
                )}
              </Pressable>
            </View>
            {checkinError && (
              <Text style={styles.driverError} accessibilityRole="alert" accessibilityLiveRegion="polite">
                {checkinError}
              </Text>
            )}
          </View>
        )}

        {/* Receipts: only after check-in, only what this deal requires */}
        {isCompleted && requiredReceipts.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.driverTitle} accessibilityRole="header">Receipts needed</Text>
            <Text style={styles.driverText}>
              {claim.unverified_at
                ? `This visit closed on ${new Date(claim.unverified_at).toLocaleDateString([], { month: "short", day: "numeric" })} because the receipts weren't approved in time, so no ride credit was added.`
                : allReceiptsApproved
                ? "All receipts approved. Your ride credit has been added."
                : `Upload ${requiredReceipts.length === 1 ? "this receipt" : "these receipts"} to get your $${Number(claim.deal.ride_credit_amount).toFixed(2)} ride credit. We release it once ${requiredReceipts.length === 1 ? "it's" : "they're"} approved.`}
            </Text>
            {!claim.unverified_at && !allReceiptsApproved && (
              <Text style={styles.receiptDeadline}>
                Upload by{" "}
                {receiptDeadline(claim.completed_at ?? claim.reserved_at, claim.receipt_due_at).toLocaleDateString([], {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </Text>
            )}
            {requiredReceipts.map((r) => {
              const status = r.status ?? (r.url ? "pending_review" : "missing");
              const meta = RECEIPT_STATUS[status];
              const canUpload = !claim.unverified_at && (status === "missing" || status === "rejected");
              return (
                <View key={r.type} style={styles.receiptRow}>
                  <View style={styles.receiptInfo}>
                    <Text style={styles.receiptName}>{r.label}</Text>
                    <Text style={styles.receiptHelp}>{r.help}</Text>
                    <View style={[styles.receiptBadge, { backgroundColor: meta.bg }]}>
                      <Text style={[styles.receiptBadgeText, { color: meta.text }]}>{meta.label}</Text>
                    </View>
                    {status === "rejected" && (
                      <Text style={styles.receiptRejected}>
                        We couldn&apos;t accept this photo. Please upload a clear photo showing the date and total.
                      </Text>
                    )}
                  </View>
                  {canUpload && (
                    <Pressable
                      style={[styles.receiptButton, uploadingType !== null && styles.buttonDisabled]}
                      onPress={() => handleUploadReceipt(r.type)}
                      disabled={uploadingType !== null}
                      accessibilityRole="button"
                      accessibilityLabel={`${status === "rejected" ? "Upload a new" : "Upload"} ${r.label.toLowerCase()}`}
                      accessibilityState={{ busy: uploadingType === r.type }}
                    >
                      {uploadingType === r.type ? (
                        <ActivityIndicator color="#FFFFFF" accessibilityLabel="Uploading" />
                      ) : (
                        <Text style={styles.receiptButtonText}>{status === "rejected" ? "Re-upload" : "Upload"}</Text>
                      )}
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Details grid */}
        <View style={styles.detailsGrid}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Claimed at</Text>
            <Text style={styles.detailValue}>
              {new Date(claim.reserved_at).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Ride credit</Text>
            <Text style={styles.detailValue}>
              ${Number(claim.deal.ride_credit_amount).toFixed(2)}
            </Text>
          </View>
          {/* Receipt and payment status only mean something after check-in. */}
          {isCompleted && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Receipts</Text>
              <Text style={styles.detailValue}>{receiptSummary}</Text>
            </View>
          )}
          {isCompleted && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Credit paid</Text>
              <Text style={styles.detailValue}>
                {claim.ride_credit_paid ? "Yes" : "Not yet"}
              </Text>
            </View>
          )}
        </View>

        {/* Room for the bottom bar, which only shows on active claims */}
        <View style={{ height: isReserved && !isExpired ? 140 : 24 }} />
      </ScrollView>

      {/* Action buttons - only for active reserved claims */}
      {isReserved && !isExpired && (
        <View style={styles.bottomBar}>
          {actionLoading ? (
            <ActivityIndicator
              size="large"
              color="#5B53EE"
              accessibilityLabel="Processing action"
            />
          ) : (
            <>
              <Pressable
                style={styles.primaryButtonFull}
                onPress={handleScanQR}
                accessibilityLabel="Check in by scanning the venue's QR code"
                accessibilityRole="button"
              >
                <Text style={styles.primaryButtonText}>Check in: scan venue QR</Text>
              </Pressable>
              <Pressable
                style={styles.cancelClaimButton}
                onPress={handleCancel}
                accessibilityLabel="Cancel this claim"
                accessibilityRole="button"
              >
                <Text style={styles.cancelClaimButtonText}>Cancel claim</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const RECEIPT_STATUS: Record<string, { label: string; bg: string; text: string }> = {
  missing: { label: "Not uploaded", bg: "#F3F4F6", text: "#1F2937" },
  pending_review: { label: "Waiting for review", bg: "#FEF3C7", text: "#92400E" },
  approved: { label: "Approved", bg: "#DCFCE7", text: "#166534" },
  rejected: { label: "Rejected", bg: "#FEE2E2", text: "#991B1B" },
};

const styles = StyleSheet.create({
  receiptDeadline: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "600",
    color: "#92400E",
  },
  receiptRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  receiptInfo: {
    flex: 1,
    gap: 4,
  },
  receiptName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A2E",
  },
  receiptHelp: {
    fontSize: 14,
    color: "#4B5563",
  },
  receiptBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    marginTop: 4,
  },
  receiptBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  receiptRejected: {
    fontSize: 14,
    color: "#991B1B",
    marginTop: 4,
  },
  receiptButton: {
    minHeight: 44,
    minWidth: 96,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#5B53EE",
    alignItems: "center",
    justifyContent: "center",
  },
  receiptButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  driverTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 4,
  },
  driverText: {
    fontSize: 14,
    color: "#4B5563",
    lineHeight: 20,
  },
  driverScanButton: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: "#5B53EE",
    alignItems: "center",
    justifyContent: "center",
  },
  driverScanButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  driverOr: {
    textAlign: "center",
    color: "#4B5563",
    fontSize: 13,
    marginVertical: 10,
  },
  driverInputRow: {
    flexDirection: "row",
    gap: 8,
  },
  driverInput: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#6B7280",
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    letterSpacing: 2,
    color: "#1A1A2E",
    backgroundColor: "#FFFFFF",
  },
  driverAddButton: {
    minWidth: 72,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: "#1A1A2E",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  driverAddButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  driverError: {
    marginTop: 8,
    color: "#B91C1C",
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
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
    color: "#B91C1C",
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
    color: "#B45309",
  },
  countdownExpired: {
    fontSize: 15,
    fontWeight: "700",
    color: "#B91C1C",
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
    color: "#5B53EE",
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
    color: "#5B53EE",
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
  primaryButton: {
    flex: 1,
    backgroundColor: "#5B53EE",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#5B53EE",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonFull: {
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
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  cancelClaimButton: {
    alignItems: "center",
    paddingVertical: 8,
  },
  cancelClaimButtonText: {
    color: "#B91C1C",
    fontSize: 15,
    fontWeight: "600",
  },
});
