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
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Modal, Pressable, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, getHuidigToken, useAuth } from "@/context/auth";
import { SyncProvider } from "@/context/sync";
import { OfflineProvider } from "@/context/offline";
import { AchievementProvider } from "@/context/achievement";
import {
  useListChatGesprekken,
  useGetMijnLmraOpenstaand,
  useGetMijnToolboxMaandopdracht,
  useUitstellenToolboxMaandopdracht,
  useGetAiDrempelStatus,
  type AiDrempelStatus,
} from "@workspace/api-client-react";
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

function ToolboxPopupBewaker() {
  const { token } = useAuth();
  const router = useRouter();
  const { data: opdracht, refetch } = useGetMijnToolboxMaandopdracht();
  const uitstellenMut = useUitstellenToolboxMaandopdracht();

  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => void refetch(), 120000);
    return () => clearInterval(timer);
  }, [token, refetch]);

  if (!token || !opdracht || (opdracht as any).voltooid === true) return null;

  const kanUitstellen = (opdracht as any).kan_uitstellen === true;
  const toolboxTitel = (opdracht as any).toolbox_titel ?? "Verplichte toolbox";
  const maand = (opdracht as any).maand;
  const jaar = (opdracht as any).jaar;
  const opdrachtId = (opdracht as any).id;

  const MAANDEN = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
  const maandLabel = maand ? MAANDEN[(maand as number) - 1] ?? "" : "";

  async function uitstellen() {
    try {
      await uitstellenMut.mutateAsync({ id: opdrachtId });
      void refetch();
    } catch {
      // stil falen — popup blijft zichtbaar
    }
  }

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent>
      <View style={{
        flex: 1,
        backgroundColor: kanUitstellen ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.92)",
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
              backgroundColor: "#fef3c7",
              alignItems: "center", justifyContent: "center",
              marginBottom: 12,
            }}>
              <Ionicons name="book-outline" size={28} color="#d97706" />
            </View>
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700", textAlign: "center" }}>
              Verplichte maandtoolbox
            </Text>
            {maand != null && (
              <Text style={{ color: "#6b7280", fontSize: 12, textAlign: "center", marginTop: 4 }}>
                {maandLabel} {jaar}
              </Text>
            )}
          </View>
          <Text style={{ color: "#f3f4f6", fontWeight: "600", fontSize: 15, textAlign: "center", marginBottom: 6 }}>
            {toolboxTitel}
          </Text>
          <Text style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", marginBottom: 20, lineHeight: 20 }}>
            {kanUitstellen
              ? "Rond deze toolbox zo snel mogelijk af. Je kunt hem nog een dag uitstellen."
              : "De uitstelperiode is verstreken. Voltooi deze toolbox om door te gaan."}
          </Text>
          <Pressable
            onPress={() => router.push("/toolboxen")}
            style={{ backgroundColor: "#d97706", borderRadius: 10, padding: 14, alignItems: "center", marginBottom: kanUitstellen ? 10 : 0 }}
          >
            <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>Toolbox nu doen</Text>
          </Pressable>
          {kanUitstellen && (
            <Pressable
              onPress={() => void uitstellen()}
              style={{ borderRadius: 10, padding: 12, alignItems: "center" }}
            >
              <Text style={{ color: "#6b7280", fontSize: 14 }}>Uitstellen tot morgen</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const DREMPEL_BANNER_SLEUTEL = "ai_drempel_banner_gesloten";

interface DrempelBannerOpslag {
  geslotenOp: string;
  jaarMaand: string;
}

function huidigeJaarMaand(): string {
  const nu = new Date();
  return `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, "0")}`;
}

function AiDrempelBanner() {
  const { token } = useAuth();
  const [gesloten, setGesloten] = useState(false);
  const { data, refetch } = useGetAiDrempelStatus();

  useEffect(() => {
    async function laadGeslotenStatus() {
      try {
        const raw = await AsyncStorage.getItem(DREMPEL_BANNER_SLEUTEL);
        if (!raw) return;
        const opgeslagen = JSON.parse(raw) as DrempelBannerOpslag;
        if (opgeslagen.jaarMaand === huidigeJaarMaand()) {
          setGesloten(true);
        } else {
          await AsyncStorage.removeItem(DREMPEL_BANNER_SLEUTEL);
        }
      } catch {
        // stil falen — banner tonen bij twijfel
      }
    }
    void laadGeslotenStatus();
  }, []);

  useEffect(() => {
    if (!token) return;
    void refetch();
    const timer = setInterval(() => {
      const jaarMaand = huidigeJaarMaand();
      AsyncStorage.getItem(DREMPEL_BANNER_SLEUTEL)
        .then((raw) => {
          if (!raw) return;
          const opgeslagen = JSON.parse(raw) as DrempelBannerOpslag;
          if (opgeslagen.jaarMaand !== jaarMaand) {
            void AsyncStorage.removeItem(DREMPEL_BANNER_SLEUTEL);
            setGesloten(false);
          }
        })
        .catch(() => undefined);
      void refetch();
    }, 30 * 60 * 1000);
    return () => clearInterval(timer);
  }, [token, refetch]);

  async function sluit() {
    try {
      const payload: DrempelBannerOpslag = {
        geslotenOp: new Date().toISOString(),
        jaarMaand: huidigeJaarMaand(),
      };
      await AsyncStorage.setItem(DREMPEL_BANNER_SLEUTEL, JSON.stringify(payload));
    } catch {
      // stil falen — sluiting werkt ook zonder persistentie
    }
    setGesloten(true);
  }

  const status = data as AiDrempelStatus | undefined;
  if (!status?.overschreden || gesloten) return null;

  const kosten = status.huidig_maand_kosten_eur;
  const drempel = status.drempel_eur;
  const kostenLabel = `\u20AC ${kosten.toFixed(2)}`;
  const drempelLabel = drempel != null ? `\u20AC ${drempel.toFixed(2)}` : "n.v.t.";

  return (
    <View style={{
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 999,
      backgroundColor: "#7c2d12",
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 10,
    }}>
      <Ionicons name="warning-outline" size={18} color="#fca5a5" style={{ marginRight: 8 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: "#fef2f2", fontSize: 13, fontWeight: "700" }}>
          AI-kostendrempel overschreden
        </Text>
        <Text style={{ color: "#fca5a5", fontSize: 12, marginTop: 2 }}>
          {`Maandkosten ${kostenLabel} (drempel ${drempelLabel})`}
        </Text>
      </View>
      <Pressable onPress={() => void sluit()} hitSlop={10}>
        <Ionicons name="close" size={20} color="#fca5a5" />
      </Pressable>
    </View>
  );
}

function AiDrempelBewaker() {
  const { token, gebruiker } = useAuth();
  if (!token || gebruiker?.rol !== "hoofdbeheerder") return null;
  return <AiDrempelBanner />;
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
      <AiDrempelBewaker />
      <LmraBewaker />
      <ToolboxPopupBewaker />
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
        <Stack.Screen name="pbm" />
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
