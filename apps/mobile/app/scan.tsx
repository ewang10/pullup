/**
 * @file scan.tsx
 * QR code scanner screen for verifying a deal claim at a venue.
 *
 * Uses `CameraView` from `expo-camera` to scan QR codes displayed at
 * partner venues. The expected QR format is `pullup://venue/{venueId}/verify`.
 *
 * Flow:
 *   1. User navigates here from the claim detail screen with a `claimId` param.
 *   2. Camera opens and scans for a QR code.
 *   3. On successful scan, `parseQRContent` extracts the venue ID.
 *   4. `completeClaim(claimId, venueId)` is called to mark the claim as complete.
 *   5. A success or error overlay is shown before navigating back.
 */
import { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { completeClaim } from "../lib/api";
import { parseQRContent } from "@pullup/shared";
import type { DealClaim } from "@pullup/shared";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SCAN_FRAME_SIZE = SCREEN_WIDTH * 0.7;

/** Possible overlay states shown after a scan attempt. */
type ScanOverlay = "none" | "processing" | "success" | "error";

export default function ScanScreen() {
  const { claimId } = useLocalSearchParams<{ claimId: string }>();
  const router = useRouter();

  const [permission, requestPermission] = useCameraPermissions();
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [overlay, setOverlay] = useState<ScanOverlay>("none");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /** Guard to prevent processing multiple scans simultaneously. */
  const isProcessingRef = useRef(false);

  /**
   * Handle a barcode scan event from `CameraView`.
   * Parses the QR content and calls the `completeClaim` API.
   */
  const handleBarcodeScanned = async (scanResult: { data: string }) => {
    if (isProcessingRef.current) return;
    if (!claimId) {
      setErrorMessage("Missing claim ID. Please go back and try again.");
      setOverlay("error");
      return;
    }

    isProcessingRef.current = true;
    setOverlay("processing");

    const venueId = parseQRContent(scanResult.data);

    if (!venueId) {
      setErrorMessage(
        "Invalid QR code. Please scan the QR code displayed at the venue."
      );
      setOverlay("error");
      isProcessingRef.current = false;
      return;
    }

    const { data, error } = await completeClaim(claimId, venueId);

    if (error) {
      setErrorMessage(error);
      setOverlay("error");
      isProcessingRef.current = false;
      return;
    }

    setOverlay("success");

    // Navigate back after a brief delay so the user sees the success state.
    setTimeout(() => {
      router.back();
    }, 1500);
  };

  /** Reset the overlay so the user can try scanning again. */
  const handleDismissError = () => {
    setOverlay("none");
    setErrorMessage(null);
    isProcessingRef.current = false;
  };

  // ── Permission not yet determined ──────────────────────────
  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator
          size="large"
          color="#6C63FF"
          accessibilityLabel="Loading camera permissions"
        />
      </View>
    );
  }

  // ── Permission denied ──────────────────────────────────────
  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionMessage}>
          PullUp needs camera access to scan the venue QR code and verify your
          visit.
        </Text>
        <Pressable
          style={styles.permissionButton}
          onPress={requestPermission}
          accessibilityLabel="Grant camera permission"
          accessibilityRole="button"
        >
          <Text style={styles.permissionButtonText}>Allow Camera Access</Text>
        </Pressable>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // ── Camera view with overlays ──────────────────────────────
  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={flashEnabled}
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
        onBarcodeScanned={
          overlay === "none" ? handleBarcodeScanned : undefined
        }
      />

      {/* Dark overlay with transparent scan frame cutout */}
      <View style={styles.overlayContainer} pointerEvents="box-none">
        {/* Top dark region */}
        <View style={styles.overlayTop} />

        {/* Middle row: left dark | scan frame | right dark */}
        <View style={styles.overlayMiddle}>
          <View style={styles.overlaySide} />
          <View style={styles.scanFrame}>
            {/* Corner markers */}
            <View style={[styles.corner, styles.cornerTopLeft]} />
            <View style={[styles.corner, styles.cornerTopRight]} />
            <View style={[styles.corner, styles.cornerBottomLeft]} />
            <View style={[styles.corner, styles.cornerBottomRight]} />
          </View>
          <View style={styles.overlaySide} />
        </View>

        {/* Bottom dark region */}
        <View style={styles.overlayBottom}>
          <Text style={styles.instructionText}>
            Point your camera at the venue QR code
          </Text>

          {/* Flash toggle */}
          <Pressable
            style={[
              styles.flashButton,
              flashEnabled && styles.flashButtonActive,
            ]}
            onPress={() => setFlashEnabled((prev) => !prev)}
            accessibilityLabel={
              flashEnabled ? "Turn off flash" : "Turn on flash"
            }
            accessibilityRole="button"
          >
            <Text style={styles.flashButtonText}>
              {flashEnabled ? "Flash ON" : "Flash OFF"}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Processing overlay */}
      {overlay === "processing" && (
        <View style={styles.resultOverlay}>
          <View style={styles.resultCard}>
            <ActivityIndicator
              size="large"
              color="#6C63FF"
              accessibilityLabel="Verifying QR code"
            />
            <Text style={styles.resultTitle}>Verifying...</Text>
            <Text style={styles.resultMessage}>
              Confirming your visit with the venue.
            </Text>
          </View>
        </View>
      )}

      {/* Success overlay */}
      {overlay === "success" && (
        <View style={styles.resultOverlay}>
          <View style={styles.resultCard}>
            <View style={styles.successIcon}>
              <Text style={styles.successIconText}>{'checkmark' && '\u2713'}</Text>
            </View>
            <Text style={styles.resultTitle}>Verified!</Text>
            <Text style={styles.resultMessage}>
              Your visit has been confirmed. Enjoy your deal!
            </Text>
          </View>
        </View>
      )}

      {/* Error overlay */}
      {overlay === "error" && (
        <View style={styles.resultOverlay}>
          <View style={styles.resultCard}>
            <View style={styles.errorIcon}>
              <Text style={styles.errorIconText}>!</Text>
            </View>
            <Text style={styles.resultTitle}>Scan Failed</Text>
            <Text style={styles.resultMessage}>
              {errorMessage ?? "An unexpected error occurred."}
            </Text>
            <Pressable
              style={styles.retryButton}
              onPress={handleDismissError}
              accessibilityLabel="Try scanning again"
              accessibilityRole="button"
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
            </Pressable>
            <Pressable
              style={styles.cancelButton}
              onPress={() => router.back()}
              accessibilityLabel="Go back to claim"
              accessibilityRole="button"
            >
              <Text style={styles.cancelButtonText}>Go Back</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const CORNER_SIZE = 24;
const CORNER_THICKNESS = 4;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000000",
    padding: 32,
    gap: 12,
  },

  // ── Permission screen ──────────────────────────────────────
  permissionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 4,
  },
  permissionMessage: {
    fontSize: 15,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 8,
  },
  permissionButton: {
    backgroundColor: "#6C63FF",
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
    marginTop: 8,
  },
  permissionButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  backButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  backButtonText: {
    color: "#9CA3AF",
    fontSize: 15,
    fontWeight: "600",
  },

  // ── Dark overlay & scan frame ──────────────────────────────
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  overlayMiddle: {
    flexDirection: "row",
    height: SCAN_FRAME_SIZE,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  scanFrame: {
    width: SCAN_FRAME_SIZE,
    height: SCAN_FRAME_SIZE,
    borderRadius: 4,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    paddingTop: 32,
    gap: 20,
  },

  // ── Corner markers ─────────────────────────────────────────
  corner: {
    position: "absolute",
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderColor: "#6C63FF",
    borderTopLeftRadius: 4,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderColor: "#6C63FF",
    borderTopRightRadius: 4,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderColor: "#6C63FF",
    borderBottomLeftRadius: 4,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderColor: "#6C63FF",
    borderBottomRightRadius: 4,
  },

  // ── Instruction & flash ────────────────────────────────────
  instructionText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  flashButton: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  flashButtonActive: {
    backgroundColor: "#6C63FF",
  },
  flashButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },

  // ── Result overlays (processing / success / error) ─────────
  resultOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  resultCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
    gap: 8,
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1A1A2E",
    marginTop: 8,
  },
  resultMessage: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
  },

  // ── Success icon ───────────────────────────────────────────
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#ECFDF5",
    justifyContent: "center",
    alignItems: "center",
  },
  successIconText: {
    fontSize: 28,
    fontWeight: "700",
    color: "#059669",
  },

  // ── Error icon ─────────────────────────────────────────────
  errorIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FEE2E2",
    justifyContent: "center",
    alignItems: "center",
  },
  errorIconText: {
    fontSize: 28,
    fontWeight: "700",
    color: "#DC2626",
  },

  // ── Action buttons ─────────────────────────────────────────
  retryButton: {
    backgroundColor: "#6C63FF",
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
    marginTop: 8,
    width: "100%",
    alignItems: "center",
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  cancelButtonText: {
    color: "#6B7280",
    fontSize: 15,
    fontWeight: "600",
  },
});
