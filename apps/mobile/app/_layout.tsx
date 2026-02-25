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
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="deal/[id]"
          options={{
            headerShown: true,
            headerTitle: "Deal Details",
            headerTintColor: "#6C63FF",
            headerStyle: { backgroundColor: "#FFFFFF" },
          }}
        />
        <Stack.Screen
          name="claim/[id]"
          options={{
            headerShown: true,
            headerTitle: "Active Claim",
            headerTintColor: "#6C63FF",
            headerStyle: { backgroundColor: "#FFFFFF" },
          }}
        />
        <Stack.Screen
          name="scan"
          options={{
            headerShown: true,
            headerTitle: "Scan QR Code",
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
