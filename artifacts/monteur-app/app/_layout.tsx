import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { Stack, usePathname, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Modal, Pressable, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, getHuidigToken, useAuth } from "@/context/auth";
import { SyncProvider } from "@/context/sync";
import { OfflineProvider } from "@/context/offline";
import { AchievementProvider } from "@/context/achievement";
import { useListChatGesprekken, useGetMijnLmraOpenstaand } from "@workspace/api-client-react";
import { useMeldingGeluid } from "@/hooks/useMeldingGeluid";

setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
setAuthTokenGetter(() => getHuidigToken());

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function LmraBewaker() {
  const { token } = useAuth();
  const router = useRouter();
  const { data: openstaand, refetch } = useGetMijnLmraOpenstaand();

  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => void refetch(), 60000);
    return () => clearInterval(timer);
  }, [token, refetch]);

  const dwingendItems = (openstaand ?? []).filter((item) => item.dwingend);
  if (!token || dwingendItems.length === 0) return null;

  const eerste = dwingendItems[0];

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent>
      <View style={{
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.88)",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}>
        <View style={{
          backgroundColor: "#1c1c1e",
          borderRadius: 16,
          padding: 24,
          width: "100%",
          maxWidth: 360,
        }}>
          <View style={{ alignItems: "center", marginBottom: 16 }}>
            <View style={{
              width: 56, height: 56, borderRadius: 28,
              backgroundColor: "#fee2e2",
              alignItems: "center", justifyContent: "center",
              marginBottom: 12,
            }}>
              <Ionicons name="warning" size={28} color="#dc2626" />
            </View>
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700", textAlign: "center" }}>
              LMRA vereist
            </Text>
          </View>
          <Text style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", marginBottom: 6, lineHeight: 20 }}>
            {`Je werkt ${eerste.dagen_openstaand} dag${eerste.dagen_openstaand !== 1 ? "en" : ""} op`}
          </Text>
          <Text style={{ color: "#f3f4f6", fontWeight: "600", fontSize: 15, textAlign: "center", marginBottom: 6 }}>
            {eerste.opdracht_naam}
          </Text>
          <Text style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", marginBottom: 20, lineHeight: 20 }}>
            zonder geregistreerde LMRA.{"\n"}Vul je LMRA in voor aanvang van werkzaamheden.
          </Text>
          {dwingendItems.length > 1 && (
            <Text style={{ color: "#6b7280", fontSize: 12, textAlign: "center", marginBottom: 16 }}>
              {`+ ${dwingendItems.length - 1} ander${dwingendItems.length - 1 !== 1 ? "e" : ""} project${dwingendItems.length - 1 !== 1 ? "en" : ""}`}
            </Text>
          )}
          <Pressable
            onPress={() => router.push("/lmra")}
            style={{
              backgroundColor: "#f97316",
              borderRadius: 10,
              padding: 14,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>LMRA invullen</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function BerichtMeldingMonitor() {
  const { token } = useAuth();
  const { speel } = useMeldingGeluid();
  const geinitialiseerd = useRef(false);
  const vorigeOngelezen = useRef(new Map<number, number>());

  const { data: gesprekken, refetch } = useListChatGesprekken();

  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => void refetch(), 15000);
    return () => clearInterval(timer);
  }, [token, refetch]);

  useEffect(() => {
    if (!gesprekken || !token) return;
    if (!geinitialiseerd.current) {
      gesprekken.forEach((g) =>
        vorigeOngelezen.current.set(g.id, g.ongelezen_aantal),
      );
      geinitialiseerd.current = true;
      return;
    }
    const heeftNieuw = gesprekken.some(
      (g) => g.ongelezen_aantal > (vorigeOngelezen.current.get(g.id) ?? 0),
    );
    if (heeftNieuw) void speel();
    gesprekken.forEach((g) =>
      vorigeOngelezen.current.set(g.id, g.ongelezen_aantal),
    );
  }, [gesprekken, token, speel]);

  return null;
}

function RootLayoutNav() {
  const { bezigLaden, vergrendeld, token } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (bezigLaden) return;
    if (vergrendeld) {
      if (pathname !== "/vergrendeld") router.replace("/vergrendeld");
      return;
    }
    if (pathname === "/vergrendeld") {
      router.replace(token ? "/menu" : "/login");
      return;
    }
    const openbaar = pathname === "/login" || pathname === "/";
    if (!token && !openbaar) {
      router.replace("/login");
    }
  }, [bezigLaden, vergrendeld, token, pathname, router]);

  return (
    <>
      <BerichtMeldingMonitor />
      <LmraBewaker />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="vergrendeld" />
        <Stack.Screen name="menu" />
        <Stack.Screen name="binnenkort" />
        <Stack.Screen name="fabrikanten" />
        <Stack.Screen name="gebouwen" />
        <Stack.Screen name="documenten" />
        <Stack.Screen name="documenten/[id]" />
        <Stack.Screen name="gebouw/[id]" />
        <Stack.Screen name="plattegrond/[verdiepingId]" />
        <Stack.Screen name="document/[tekeningId]" />
        <Stack.Screen name="hrm/index" />
        <Stack.Screen name="hrm/verlof" />
        <Stack.Screen name="hrm/opleidingen" />
        <Stack.Screen name="hrm/kennisbank" />
        <Stack.Screen name="uren" />
        <Stack.Screen name="toolboxen" />
        <Stack.Screen name="info" />
        <Stack.Screen name="opname/index" />
        <Stack.Screen name="opname/[id]" />
        <Stack.Screen name="opname/item/[itemId]" />
        <Stack.Screen name="werkdag/index" />
        <Stack.Screen name="werkdag/[id]" />
        <Stack.Screen name="lmra" />
        <Stack.Screen name="incidenten" />
        <Stack.Screen name="veiligheid-melding" />
        <Stack.Screen name="veiligheid/index" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SyncProvider>
              <OfflineProvider>
                <AchievementProvider>
                  <GestureHandlerRootView style={{ flex: 1 }}>
                    <RootLayoutNav />
                  </GestureHandlerRootView>
                </AchievementProvider>
              </OfflineProvider>
            </SyncProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
