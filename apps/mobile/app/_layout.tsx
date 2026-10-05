import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "../lib/auth";

function RootLayoutNav() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";

    // Reset works signed in or out, and verifying the emailed code signs the
    // user in mid-flow, so never redirect away from it.
    if (segments[0] === "reset-password") return;

    if (!session && !inAuthGroup) {
      router.replace("/(auth)/welcome");
    } else if (session && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [session, isLoading, segments]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#F8F9FA" },
          // iOS otherwise shows the previous route's name, e.g. "(tabs)".
          headerBackTitle: "Back",
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="deal/[id]"
          options={{
            headerShown: true,
            headerTitle: "Deal details",
            headerTintColor: "#5B53EE",
            headerStyle: { backgroundColor: "#FFFFFF" },
          }}
        />
        <Stack.Screen
          name="claim/[id]"
          options={{
            headerShown: true,
            headerTitle: "Your claim",
            headerTintColor: "#5B53EE",
            headerStyle: { backgroundColor: "#FFFFFF" },
          }}
        />
        <Stack.Screen name="reset-password" options={{ headerShown: false }} />
        <Stack.Screen
          name="scan"
          options={{
            headerShown: true,
            headerTitle: "Scan QR code",
            headerTintColor: "#FFFFFF",
            headerStyle: { backgroundColor: "#000000" },
            presentation: "fullScreenModal",
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
