import { API_DOMEIN } from "@/lib/apiDomein";
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
import * as Updates from "expo-updates";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Alert, Modal, Platform, Pressable, Text, View } from "react-native";
import { isUitvoerendVeld } from "@/lib/buitendienst";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ruimte } from "@workspace/ontwerp";

import { useColors } from "@/hooks/useColors";

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
import { ToolboxDetailModal } from "@/components/ToolboxDetailModal";
import { useMeldingGeluid } from "@/hooks/useMeldingGeluid";
import { usePicklijstMelding } from "@/hooks/usePicklijstMelding";

setBaseUrl(`https://${API_DOMEIN}`);
setAuthTokenGetter(() => getHuidigToken());

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

const ROOT_ROUTES_ZONDER_TERUGKNOP = new Set([
  "/",
  "/login",
  "/menu",
  "/onboarding",
  "/vergrendeld",
]);

const ROUTES_MET_EIGEN_TERUGKNOP = [
  /^\/berichten$/,
  /^\/binnenkort$/,
  /^\/documenten(?:\/|$)/,
  /^\/document\//,
  /^\/fabrikanten$/,
  /^\/gebouw\//,
  /^\/gesprek\//,
  /^\/hrm(?:\/|$)/,
  /^\/info$/,
  /^\/kalender$/,
  /^\/kwartaalcontrole$/,
  /^\/magazijn(?:\/|$)/,
  /^\/materiaal-aanvraag\//,
  /^\/mijn-auto$/,
  /^\/mijn-werk$/,
  /^\/opname\/.+/,
  /^\/planning$/,
  /^\/plattegrond\//,
  /^\/privacy$/,
  /^\/projecten(?:\/|$)/,
  /^\/uitvoerder\//,
  /^\/uitvoering\//,
  /^\/uren$/,
  /^\/veiligheid$/,
  /^\/voertuig-melding$/,
  /^\/werkbak$/,
  /^\/werkdag\/.+/,
];

function AlgemeneTerugknop() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();

  const heeftEigenKnop = ROUTES_MET_EIGEN_TERUGKNOP.some((patroon) => patroon.test(pathname));
  if (ROOT_ROUTES_ZONDER_TERUGKNOP.has(pathname) || heeftEigenKnop) return null;

  return (
    <Pressable
      testID="algemene-terugknop"
      accessibilityRole="button"
      accessibilityLabel="Terug"
      hitSlop={10}
      onPress={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/menu");
      }}
      style={({ pressed }) => ({
        position: "absolute",
        top: insets.top + ruimte.s,
        left: ruimte.m,
        zIndex: 100,
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: c.card,
        borderWidth: 1,
        borderColor: c.border,
        opacity: pressed ? 0.72 : 1,
        shadowColor: c.foreground,
        shadowOpacity: 0.14,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 4,
      })}
    >
      <Ionicons name="arrow-back" size={24} color={c.foreground} />
    </Pressable>
  );
}

function LmraBewaker() {
  const c = useColors();
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
        backgroundColor: c.dark + "E0",
        alignItems: "center",
        justifyContent: "center",
        padding: ruimte.xl,
      }}>
        <View style={{
          backgroundColor: c.dark,
          borderRadius: c.radius,
          padding: ruimte.xl,
          width: "100%",
          maxWidth: 360,
        }}>
          <View style={{ alignItems: "center", marginBottom: ruimte.l }}>
            <View style={{
              width: 56, height: 56, borderRadius: 28,
              backgroundColor: c.destructive + "26",
              alignItems: "center", justifyContent: "center",
              marginBottom: ruimte.m,
            }}>
              <Ionicons name="warning" size={28} color={c.destructive} />
            </View>
            <Text style={{ color: c.darkForeground, fontSize: 18, fontWeight: "700", textAlign: "center" }}>
              LMRA vereist
            </Text>
          </View>
          <Text style={{ color: c.darkMuted, fontSize: 14, textAlign: "center", marginBottom: ruimte.xs + 2, lineHeight: 20 }}>
            {`Je werkt ${eerste.dagen_openstaand} dag${eerste.dagen_openstaand !== 1 ? "en" : ""} op`}
          </Text>
          <Text style={{ color: c.darkForeground, fontWeight: "600", fontSize: 15, textAlign: "center", marginBottom: ruimte.xs + 2 }}>
            {eerste.opdracht_naam}
          </Text>
          <Text style={{ color: c.darkMuted, fontSize: 14, textAlign: "center", marginBottom: ruimte.l + ruimte.xs, lineHeight: 20 }}>
            zonder geregistreerde LMRA.{"\n"}Vul je LMRA in voor aanvang van werkzaamheden.
          </Text>
          {dwingendItems.length > 1 && (
            <Text style={{ color: c.darkMuted, fontSize: 12, textAlign: "center", marginBottom: ruimte.l }}>
              {`+ ${dwingendItems.length - 1} ander${dwingendItems.length - 1 !== 1 ? "e" : ""} project${dwingendItems.length - 1 !== 1 ? "en" : ""}`}
            </Text>
          )}
          <Pressable
            onPress={() => router.push("/lmra")}
            style={{
              backgroundColor: c.primary,
              borderRadius: c.radius,
              padding: ruimte.m + 2,
              alignItems: "center",
            }}
          >
            <Text style={{ color: c.primaryForeground, fontWeight: "700", fontSize: 16 }}>LMRA invullen</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function ToolboxPopupBewaker() {
  const c = useColors();
  const { token } = useAuth();
  const { data: opdracht, refetch } = useGetMijnToolboxMaandopdracht();
  const uitstellenMut = useUitstellenToolboxMaandopdracht();
  // Terwijl de gebruiker de toolbox daadwerkelijk doet, mag de blokkerende
  // popup NIET over het scherm liggen — anders is de afrondflow onbereikbaar
  // (deadlock, gemeld 18-08-2026 met screenshot).
  const [doetToolbox, setDoetToolbox] = useState(false);

  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => void refetch(), 120000);
    return () => clearInterval(timer);
  }, [token, refetch]);

  if (!token || !opdracht) return null;

  const toolboxId = (opdracht as any).toolbox_id as number | undefined;

  // Toolbox-flow open: toon de detailmodal in plaats van de blokkade. Deze
  // branch staat vóór de voltooid-check, anders unmount een geslaagde
  // afronding (refetch → voltooid=true) de modal midden in het succes-scherm.
  if (doetToolbox && toolboxId != null) {
    return (
      <ToolboxDetailModal
        toolboxId={toolboxId}
        visible
        onSluit={() => {
          setDoetToolbox(false);
          // Bij een geslaagde afronding heeft de server de maandopdracht
          // voltooid — verse status ophalen zodat de popup verdwijnt.
          void refetch();
        }}
        onAfgerond={() => void refetch()}
      />
    );
  }

  if ((opdracht as any).voltooid === true) return null;

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
      Alert.alert("Uitstellen mislukt", "Het uitstel kon niet worden geregistreerd. Probeer het opnieuw of rond de toolbox nu af.");
      void refetch();
    }
  }

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent>
      <View style={{
        flex: 1,
        backgroundColor: kanUitstellen ? c.dark + "BF" : c.dark + "EB",
        alignItems: "center",
        justifyContent: "center",
        padding: ruimte.xl,
      }}>
        <View style={{
          backgroundColor: c.dark,
          borderRadius: c.radius,
          padding: ruimte.xl,
          width: "100%",
          maxWidth: 360,
        }}>
          <View style={{ alignItems: "center", marginBottom: ruimte.l }}>
            <View style={{
              width: 56, height: 56, borderRadius: 28,
              backgroundColor: c.warning + "26",
              alignItems: "center", justifyContent: "center",
              marginBottom: ruimte.m,
            }}>
              <Ionicons name="book-outline" size={28} color={c.warning} />
            </View>
            <Text style={{ color: c.darkForeground, fontSize: 18, fontWeight: "700", textAlign: "center" }}>
              Verplichte maandtoolbox
            </Text>
            {maand != null && (
              <Text style={{ color: c.darkMuted, fontSize: 12, textAlign: "center", marginTop: ruimte.xs }}>
                {maandLabel} {jaar}
              </Text>
            )}
          </View>
          <Text style={{ color: c.darkForeground, fontWeight: "600", fontSize: 15, textAlign: "center", marginBottom: ruimte.xs + 2 }}>
            {toolboxTitel}
          </Text>
          <Text style={{ color: c.darkMuted, fontSize: 14, textAlign: "center", marginBottom: ruimte.l + ruimte.xs, lineHeight: 20 }}>
            {kanUitstellen
              ? "Rond deze toolbox zo snel mogelijk af. Je kunt hem nog een dag uitstellen."
              : "De uitstelperiode is verstreken. Voltooi deze toolbox om door te gaan."}
          </Text>
          <Pressable
            onPress={() => setDoetToolbox(true)}
            disabled={toolboxId == null}
            style={{ backgroundColor: c.warning, borderRadius: c.radius, padding: ruimte.m + 2, alignItems: "center", marginBottom: kanUitstellen ? ruimte.s + 2 : 0, opacity: toolboxId == null ? 0.6 : 1 }}
          >
            <Text style={{ color: c.warningForeground, fontWeight: "700", fontSize: 16 }}>Toolbox nu doen</Text>
          </Pressable>
          {kanUitstellen && (
            <Pressable
              onPress={() => void uitstellen()}
              style={{ borderRadius: c.radius, padding: ruimte.m, alignItems: "center" }}
            >
              <Text style={{ color: c.darkMuted, fontSize: 14 }}>Uitstellen tot morgen</Text>
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
  const c = useColors();
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
      backgroundColor: c.destructive,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: ruimte.m + 2,
      paddingVertical: ruimte.s + 2,
    }}>
      <Ionicons name="warning-outline" size={18} color={c.destructiveForeground} style={{ marginRight: ruimte.s }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.destructiveForeground, fontSize: 13, fontWeight: "700" }}>
          AI-kostendrempel overschreden
        </Text>
        <Text style={{ color: c.destructiveForeground + "CC", fontSize: 12, marginTop: 2 }}>
          {`Maandkosten ${kostenLabel} (drempel ${drempelLabel})`}
        </Text>
      </View>
      <Pressable onPress={() => void sluit()} hitSlop={10}>
        <Ionicons name="close" size={20} color={c.destructiveForeground} />
      </Pressable>
    </View>
  );
}

function UpdateBanner() {
  const c = useColors();
  const [gesloten, setGesloten] = useState(false);
  const [bezigHerstart, setBezigHerstart] = useState(false);
  const { isUpdateAvailable, isUpdatePending } = Updates.useUpdates();

  // Alleen in de productie-app: expo-updates moet actief zijn (dus niet in Expo Go
  // of dev-modus) én de build moet op het EAS-kanaal "production" staan, zodat
  // interne preview-builds nooit updates pollen of de banner tonen.
  const isProductieApp =
    Updates.isEnabled && !__DEV__ && Updates.channel === "production";

  // Controleer periodiek op nieuwe updates zolang de app open staat,
  // zodat een monteur niet hoeft te wachten tot de volgende app-start.
  useEffect(() => {
    if (!isProductieApp) return;
    const timer = setInterval(() => {
      Updates.checkForUpdateAsync().catch(() => undefined);
    }, 15 * 60 * 1000);
    return () => clearInterval(timer);
  }, [isProductieApp]);

  if (!isProductieApp) return null;
  if (gesloten) return null;
  if (!isUpdateAvailable && !isUpdatePending) return null;

  async function herstart() {
    if (bezigHerstart) return;
    setBezigHerstart(true);
    try {
      if (!isUpdatePending) {
        await Updates.fetchUpdateAsync();
      }
      await Updates.reloadAsync();
    } catch {
      // Herstart mislukt — banner blijft staan zodat de monteur het later opnieuw kan proberen
      setBezigHerstart(false);
    }
  }

  return (
    <View style={{
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 998,
      backgroundColor: c.dark,
      borderTopWidth: 1,
      borderTopColor: c.primary,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: ruimte.m + 2,
      paddingVertical: ruimte.m,
      gap: ruimte.s + 2,
    }}>
      <Ionicons name="cloud-download-outline" size={20} color={c.primary} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.darkForeground, fontSize: 13, fontWeight: "700" }}>
          Nieuwe versie beschikbaar
        </Text>
        <Text style={{ color: c.darkMuted, fontSize: 12, marginTop: 2 }}>
          Herstart de app om de update te gebruiken
        </Text>
      </View>
      <Pressable
        onPress={() => void herstart()}
        disabled={bezigHerstart}
        style={{
          backgroundColor: c.primary,
          borderRadius: 8,
          paddingHorizontal: ruimte.m,
          paddingVertical: ruimte.s + 1,
          opacity: bezigHerstart ? 0.6 : 1,
        }}
      >
        <Text style={{ color: c.primaryForeground, fontWeight: "700", fontSize: 13 }}>
          {bezigHerstart ? "Bezig..." : "Herstart"}
        </Text>
      </Pressable>
      <Pressable onPress={() => setGesloten(true)} hitSlop={10}>
        <Ionicons name="close" size={20} color={c.darkMuted} />
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

function PicklijstBewaker() {
  const { token } = useAuth();
  const { speel } = useMeldingGeluid();
  const { nieuwAantal } = usePicklijstMelding();
  const vorigAantal = useRef<number | null>(null);

  useEffect(() => {
    if (!token) {
      vorigAantal.current = null;
      return;
    }
    if (vorigAantal.current === null) {
      vorigAantal.current = nieuwAantal;
      return;
    }
    if (nieuwAantal > vorigAantal.current) {
      void speel();
    }
    vorigAantal.current = nieuwAantal;
  }, [token, nieuwAantal, speel]);

  return null;
}

function RootLayoutNav() {
  const { bezigLaden, vergrendeld, token, gebruiker } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Web (/app): de monteuromgeving is er voor buitendienstprofielen. Wie geen
  // buitendienstprofiel heeft (kantoor, hoofdbeheerder) gaat naar het gewone
  // Connect op hetzelfde domein. Native app blijft ongewijzigd.
  useEffect(() => {
    if (Platform.OS !== "web" || bezigLaden || !token || !gebruiker) return;
    // Alleen wanneer de app daadwerkelijk onder /app draait (productie-export
    // met baseUrl "/app"). In dev draait de web-app op de root van het
    // expo-dev-domein: daar bestaat geen Connect op "/" en zou deze redirect
    // een lus veroorzaken (o.a. e2e met hoofdbeheerder-testaccount).
    const pad = window.location.pathname;
    const onderApp = pad === "/app" || pad.startsWith("/app/");
    // Hoofdbeheerder mag de monteuromgeving altijd bekijken (toezicht/test);
    // alleen overige niet-buitendienstprofielen gaan terug naar Connect.
    const magBlijven =
      isUitvoerendVeld(gebruiker) || gebruiker.rol === "hoofdbeheerder";
    if (onderApp && !magBlijven) {
      window.location.replace("/");
    }
  }, [bezigLaden, token, gebruiker]);

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
      <PicklijstBewaker />
      <UpdateBanner />
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
        <Stack.Screen name="mijn-auto" />
        <Stack.Screen name="veiligheid/index" />
        <Stack.Screen name="pbm" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="uitvoering/[opdrachtId]" />
        <Stack.Screen name="magazijn/picklijsten" />
        <Stack.Screen name="magazijn/picklijst/[id]" />
        <Stack.Screen name="magazijn/inkooporders" />
      </Stack>
      <AlgemeneTerugknop />
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
