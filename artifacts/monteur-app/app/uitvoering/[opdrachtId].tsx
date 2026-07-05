import {
  useGetHuidigePimUitvoeringStap,
  useListPimUitvoeringStappen,
  useListPimSpots,
  useKoppelPimStapVoorzieningen,
  useStartPimUitvoering,
  useVoltooiPimUitvoeringStap,
  useMeldPimUitvoeringAfwijking,
  useBeslisPimUitvoeringAfwijking,
  getGetHuidigePimUitvoeringStapQueryKey,
  type PimUitvoeringStap,
  type VoorzieningPimDetail,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OfflineBanner } from "@/components/OfflineBanner";
import { bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useOffline } from "@/context/offline";
import { useSync } from "@/context/sync";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { voegToeAanWachtrij } from "@/lib/syncQueue";
import { uploadFoto } from "@/lib/upload";
import { UitvoeringThemeProvider } from "@/context/UitvoeringThemeContext";
import { UitvoeringLayout } from "@/screens/uitvoering/layout";

const CACHE_VERSIE = "v1";
const DOMEIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";
function cacheSleutel(opdrachtId: number) {
  return `pim_stap_${opdrachtId}_${CACHE_VERSIE}`;
}

interface Instructie {
  doel?: string;
  handeling?: string;
  artikelen?: string[];
  gereedschappen?: string[];
  veiligheidscontrole?: string;
  foto_opdracht?: string;
  controlevraag?: string;
}

function parseInstructie(json: unknown): Instructie | null {
  if (!json || typeof json !== "object") return null;
  return json as Instructie;
}

// ── VGE guidance types ────────────────────────────────────────────────────────

interface GuidanceVisual {
  visual_id: number;
  naam: string;
  type: string;
  object_path: string;
}

interface Guidance {
  wat_zie_je_nu?: GuidanceVisual | null;
  wat_is_eindresultaat?: GuidanceVisual | null;
  hoe_doe_je_dit?: GuidanceVisual | null;
  aandachtspunten?: string[];
  veiligheidsrisicos?: string[];
  max_visuals_getoond?: number;
}

function parseGuidance(json: unknown): Guidance | null {
  if (!json || typeof json !== "object") return null;
  const g = json as Guidance;
  const heeftVisuals = g.wat_zie_je_nu ?? g.wat_is_eindresultaat ?? g.hoe_doe_je_dit;
  const heeftPunten =
    (g.aandachtspunten?.length ?? 0) > 0 ||
    (g.veiligheidsrisicos?.length ?? 0) > 0;
  if (!heeftVisuals && !heeftPunten) return null;
  return g;
}

// ── GuidanceSectie component ──────────────────────────────────────────────────

const VISUAL_LABELS: Record<string, string> = {
  detailtekening: "Tekening",
  projecttekening_uitsnede: "Plattegrond",
  referentiefoto: "Referentie",
  exploded_view: "Onderdelen",
  animatie: "Animatie",
  checklist: "Checklist",
  productblad: "Productblad",
  montagevoorschrift: "Instructie",
  schema: "Schema",
  "3d_weergave": "3D-weergave",
};

function VergrootModal({
  visual,
  zichtbaar,
  onSluiten,
  c,
}: {
  visual: GuidanceVisual;
  zichtbaar: boolean;
  onSluiten: () => void;
  c: ReturnType<typeof useColors>;
}) {
  const { token } = useAuth();
  const [laadFout, setLaadFout] = useState(false);
  const imageUri = `https://${DOMEIN}/api/storage${visual.object_path}`;
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

  return (
    <Modal
      visible={zichtbaar}
      transparent
      animationType="fade"
      onRequestClose={onSluiten}
      statusBarTranslucent
    >
      <StatusBar backgroundColor="rgba(0,0,0,0.92)" barStyle="light-content" />
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" }}>
        <Pressable
          onPress={onSluiten}
          style={{ position: "absolute", top: 44, right: 20, zIndex: 10, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20, padding: 8 }}
        >
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
        <View style={{ paddingHorizontal: 20, width: "100%", gap: 8 }}>
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.4, textAlign: "center" }}>
            {VISUAL_LABELS[visual.type] ?? visual.type}
          </Text>
          {laadFout ? (
            <View style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Ionicons name="image-outline" size={40} color="rgba(255,255,255,0.35)" />
              <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" }}>
                Visual niet beschikbaar
              </Text>
            </View>
          ) : (
            <Image
              source={{ uri: imageUri, headers: authHeaders }}
              style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: 10, backgroundColor: c.accent }}
              resizeMode="contain"
              onError={() => setLaadFout(true)}
            />
          )}
          <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold", textAlign: "center" }} numberOfLines={2}>
            {visual.naam}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function GuidanceThumbnail({
  visual,
  label,
  c,
}: {
  visual: GuidanceVisual;
  label: string;
  c: ReturnType<typeof useColors>;
}) {
  const { token } = useAuth();
  const [vergroot, setVergroot] = useState(false);
  const [laadFout, setLaadFout] = useState(false);
  const imageUri = `https://${DOMEIN}/api/storage${visual.object_path}`;
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={{ color: c.mutedForeground, fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.4, textAlign: "center" }}>
        {label}
      </Text>
      <Pressable
        onPress={() => !laadFout && setVergroot(true)}
        style={{
          aspectRatio: 4 / 3,
          backgroundColor: c.accent,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: c.border,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {laadFout ? (
          <View style={{ flex: 1, width: "100%", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Ionicons name="image-outline" size={28} color={c.mutedForeground} />
            <Text style={{ color: c.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 8 }}>
              Visual niet beschikbaar
            </Text>
          </View>
        ) : (
          <>
            <Image
              source={{ uri: imageUri, headers: authHeaders }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
              onError={() => setLaadFout(true)}
            />
            <View
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: "rgba(0,0,0,0.45)",
                paddingHorizontal: 4,
                paddingVertical: 2,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 10, fontFamily: "Inter_400Regular", flex: 1 }} numberOfLines={1}>
                {VISUAL_LABELS[visual.type] ?? visual.type}
              </Text>
              <Ionicons name="expand-outline" size={11} color="rgba(255,255,255,0.8)" />
            </View>
          </>
        )}
      </Pressable>
      <Text style={{ color: c.foreground, fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 15 }} numberOfLines={2}>
        {visual.naam}
      </Text>
      {vergroot && (
        <VergrootModal visual={visual} zichtbaar={vergroot} onSluiten={() => setVergroot(false)} c={c} />
      )}
    </View>
  );
}

function GuidanceSectie({
  guidance,
  c,
}: {
  guidance: Guidance;
  c: ReturnType<typeof useColors>;
}) {
  const visuals: Array<{ slot: GuidanceVisual; label: string }> = [];
  if (guidance.wat_zie_je_nu) visuals.push({ slot: guidance.wat_zie_je_nu, label: "Huidige situatie" });
  if (guidance.wat_is_eindresultaat) visuals.push({ slot: guidance.wat_is_eindresultaat, label: "Eindresultaat" });
  if (guidance.hoe_doe_je_dit) visuals.push({ slot: guidance.hoe_doe_je_dit, label: "Hoe doe je dit" });

  const aandachtspunten = guidance.aandachtspunten ?? [];
  const veiligheidsrisicos = guidance.veiligheidsrisicos ?? [];
  const heeftTekst = aandachtspunten.length > 0 || veiligheidsrisicos.length > 0;

  if (visuals.length === 0 && !heeftTekst) return null;

  return (
    <Sectie titel="Visuele begeleiding">
      {visuals.length > 0 && (
        <View style={{ flexDirection: "row", gap: 8, marginBottom: heeftTekst ? 12 : 0 }}>
          {visuals.map(({ slot, label }) => (
            <GuidanceThumbnail key={slot.visual_id} visual={slot} label={label} c={c} />
          ))}
        </View>
      )}
      {aandachtspunten.length > 0 && (
        <View style={{ gap: 4, marginBottom: veiligheidsrisicos.length > 0 ? 8 : 0 }}>
          <Text style={{ color: c.mutedForeground, fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>
            Aandachtspunten
          </Text>
          {aandachtspunten.map((punt, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
              <Ionicons name="information-circle-outline" size={14} color="#d97706" style={{ marginTop: 2 }} />
              <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, flex: 1 }}>
                {punt}
              </Text>
            </View>
          ))}
        </View>
      )}
      {veiligheidsrisicos.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text style={{ color: "#92400e", fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>
            Veiligheidsrisicos
          </Text>
          {veiligheidsrisicos.map((risico, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
              <Ionicons name="warning-outline" size={14} color="#dc2626" style={{ marginTop: 2 }} />
              <Text style={{ color: "#92400e", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, flex: 1 }}>
                {risico}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Sectie>
  );
}

async function cacheStap(opdrachtId: number, stap: PimUitvoeringStap) {
  try {
    await AsyncStorage.setItem(cacheSleutel(opdrachtId), JSON.stringify(stap));
  } catch {
    // stil falen
  }
}

async function laadGecachteStap(opdrachtId: number): Promise<PimUitvoeringStap | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheSleutel(opdrachtId));
    if (!raw) return null;
    return JSON.parse(raw) as PimUitvoeringStap;
  } catch {
    return null;
  }
}

async function verwijderCache(opdrachtId: number) {
  try {
    await AsyncStorage.removeItem(cacheSleutel(opdrachtId));
  } catch {
    // stil falen
  }
}

const STAPPEN_CACHE_VERSIE = "v1";
function stappenCacheSleutel(opdrachtId: number) {
  return `pim_stappen_${opdrachtId}_${STAPPEN_CACHE_VERSIE}`;
}

async function cacheStappen(opdrachtId: number, stappen: PimUitvoeringStap[]) {
  try {
    await AsyncStorage.setItem(stappenCacheSleutel(opdrachtId), JSON.stringify(stappen));
  } catch {
    // stil falen
  }
}

async function laadGecachteStappen(opdrachtId: number): Promise<PimUitvoeringStap[]> {
  try {
    const raw = await AsyncStorage.getItem(stappenCacheSleutel(opdrachtId));
    if (!raw) return [];
    return JSON.parse(raw) as PimUitvoeringStap[];
  } catch {
    return [];
  }
}

function VoortgangsBalk({ volgorde }: { volgorde: number }) {
  const c = useColors();
  const breedte = Math.min(100, (volgorde / 10) * 100);
  return (
    <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={{ color: c.darkMuted, fontSize: 11, fontFamily: "Inter_400Regular" }}>
          Stap {volgorde}
        </Text>
        <Text style={{ color: c.darkMuted, fontSize: 11, fontFamily: "Inter_400Regular" }}>
          Voortgang
        </Text>
      </View>
      <View style={{ height: 4, backgroundColor: c.darkMuted + "44", borderRadius: 2 }}>
        <View
          style={{
            height: 4,
            width: `${breedte}%`,
            backgroundColor: c.primary,
            borderRadius: 2,
          }}
        />
      </View>
    </View>
  );
}

function Sectie({ titel, children }: { titel: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View
      style={{
        backgroundColor: c.card,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <Text
        style={{
          color: c.foreground,
          fontSize: 12,
          fontFamily: "Inter_700Bold",
          letterSpacing: 0.5,
          textTransform: "uppercase",
          marginBottom: 10,
          opacity: 0.6,
        }}
      >
        {titel}
      </Text>
      {children}
    </View>
  );
}

function BulletLijst({ items }: { items: string[] }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      {items.map((item, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 8 }}>
          <Text style={{ color: c.primary, fontSize: 14, marginTop: 1 }}>•</Text>
          <Text style={{ color: c.foreground, fontSize: 14, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 20 }}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

function FotoRij({
  uris,
  onVerwijder,
  onHerprobeer,
}: {
  uris: { lokaal: string; objectPath?: string; fout?: boolean }[];
  onVerwijder: (idx: number) => void;
  onHerprobeer?: (idx: number) => void;
}) {
  const c = useColors();
  if (uris.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
      {uris.map((f, i) => (
        <View key={i} style={{ position: "relative" }}>
          <Image
            source={{ uri: f.lokaal }}
            style={{
              width: 80,
              height: 80,
              borderRadius: 8,
              backgroundColor: c.accent,
              borderWidth: f.fout ? 2 : 0,
              borderColor: f.fout ? "#dc2626" : "transparent",
            }}
          />
          {f.objectPath && !f.fout && (
            <View
              style={{
                position: "absolute",
                bottom: 4,
                right: 4,
                backgroundColor: "#16a34a",
                borderRadius: 8,
                padding: 2,
              }}
            >
              <Ionicons name="checkmark" size={10} color="#fff" />
            </View>
          )}
          {f.fout && onHerprobeer && (
            <Pressable
              onPress={() => onHerprobeer(i)}
              style={{
                position: "absolute",
                bottom: 4,
                left: 4,
                right: 4,
                backgroundColor: "rgba(220,38,38,0.88)",
                borderRadius: 5,
                paddingVertical: 3,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 9, fontFamily: "Inter_600SemiBold" }}>
                Opnieuw
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => onVerwijder(i)}
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              backgroundColor: "#dc2626",
              borderRadius: 10,
              width: 20,
              height: 20,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="close" size={12} color="#fff" />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

export default function UitvoeringScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { opdrachtId: param } = useLocalSearchParams<{ opdrachtId: string }>();
  const { token } = useAuth();
  const { isOnline } = useOffline();
  const { forceerSync, herlaadAantal } = useSync();
  const { isTablet } = useResponsive();

  const opdrachtId = parseInt(param ?? "0", 10);

  const [gecachteStap, setGecachteStap] = useState<PimUitvoeringStap | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fotos, setFotos] = useState<{ lokaal: string; objectPath?: string; fout?: boolean }[]>([]);
  const [antwoord, setAntwoord] = useState(false);
  const [opmerkingen, setOpmerkingen] = useState("");
  const [afwijkingModus, setAfwijkingModus] = useState(false);
  const [afwijkingTekst, setAfwijkingTekst] = useState("");
  const [afwijkingBezig, setAfwijkingBezig] = useState(false);
  const [uitvoeringGereed, setUitvoeringGereed] = useState(false);
  const [offlineOpgeslagen, setOfflineOpgeslagen] = useState(false);
  const [toonVorigeStappen, setToonVorigeStappen] = useState(false);
  const [toonVoorbereideSpots, setToonVoorbereideSpots] = useState(false);
  const [gecachteStappen, setGecachteStappen] = useState<PimUitvoeringStap[]>([]);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  if (!token) return <Redirect href="/login" />;

  const {
    data: stapData,
    isLoading,
    isError,
    refetch,
  } = useGetHuidigePimUitvoeringStap(opdrachtId, {
    query: { queryKey: ["pim-huidige-stap", opdrachtId], enabled: opdrachtId > 0 },
  });

  const startMutatie = useStartPimUitvoering();
  const voltooiMutatie = useVoltooiPimUitvoeringStap();
  const afwijkingMutatie = useMeldPimUitvoeringAfwijking();
  const beslisMutatie = useBeslisPimUitvoeringAfwijking();

  useEffect(() => {
    if (opdrachtId > 0) {
      laadGecachteStap(opdrachtId).then((c) => {
        if (c) setGecachteStap(c);
      });
    }
  }, [opdrachtId]);

  useEffect(() => {
    if (stapData) {
      setGecachteStap(stapData);
      void cacheStap(opdrachtId, stapData);
    }
  }, [stapData, opdrachtId]);

  const actieveStap = stapData ?? gecachteStap;

  const { data: stappenData } = useListPimUitvoeringStappen(opdrachtId, {
    query: { queryKey: ["pim-stappen", opdrachtId], enabled: opdrachtId > 0 },
  });

  useEffect(() => {
    if (stappenData && stappenData.length > 0) {
      void cacheStappen(opdrachtId, stappenData);
      setGecachteStappen(stappenData);
    }
  }, [stappenData, opdrachtId]);

  useEffect(() => {
    if (opdrachtId > 0) {
      laadGecachteStappen(opdrachtId).then((stappen) => {
        if (stappen.length > 0) setGecachteStappen(stappen);
      });
    }
  }, [opdrachtId]);

  const { data: spotsData } = useListPimSpots(opdrachtId, {
    query: { queryKey: ["pim-spots", opdrachtId], enabled: opdrachtId > 0 },
  });
  const alleSpots = spotsData ?? [];

  const alleStappen = stappenData ?? gecachteStappen;
  const voltooideStappen = alleStappen.filter(
    (s) => s.status === "voltooid" || s.status === "overgeslagen",
  );

  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    pollingRef.current = setInterval(() => {
      void refetch();
    }, 30000);
  }, [refetch]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (actieveStap?.status === "afgeweken") {
      startPolling();
    } else {
      stopPolling();
    }
    return () => stopPolling();
  }, [actieveStap?.status, startPolling, stopPolling]);

  async function voegFotoToe() {
    const permCam = await ImagePicker.requestCameraPermissionsAsync();
    const permGal = await ImagePicker.requestMediaLibraryPermissionsAsync();

    const bronnen: { label: string; actie: () => Promise<ImagePicker.ImagePickerResult> }[] = [];
    if (permCam.status === "granted") {
      bronnen.push({
        label: "Camera",
        actie: () =>
          ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 }),
      });
    }
    if (permGal.status === "granted") {
      bronnen.push({
        label: "Fotobibliotheek",
        actie: () =>
          ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 }),
      });
    }
    if (bronnen.length === 0) {
      Alert.alert("Geen toegang", "Geef toegang tot camera of fotobibliotheek.");
      return;
    }

    const kies =
      bronnen.length === 1
        ? bronnen[0]!.actie
        : await new Promise<(() => Promise<ImagePicker.ImagePickerResult>) | null>((resolve) => {
            Alert.alert("Foto toevoegen", "Kies een bron", [
              ...bronnen.map((b) => ({ text: b.label, onPress: () => resolve(b.actie) })),
              { text: "Annuleren", style: "cancel", onPress: () => resolve(null) },
            ]);
          });

    if (!kies) return;
    const result = await kies();
    if (result.canceled || !result.assets[0]) return;

    const lokaal = result.assets[0].uri;
    const nieuweFoto = { lokaal };
    setFotos((prev) => [...prev, nieuweFoto]);

    if (isOnline) {
      setUploading(true);
      try {
        const objectPath = await uploadFoto(lokaal, undefined, "foto");
        setFotos((prev) =>
          prev.map((f) => (f.lokaal === lokaal ? { ...f, objectPath } : f)),
        );
      } catch (err) {
        const isBestandstype =
          err instanceof Error &&
          /415|bestandstype|unsupported|ongeldig.*(type|formaat)/i.test(err.message);
        if (isBestandstype) {
          setFotos((prev) => prev.filter((f) => f.lokaal !== lokaal));
          Alert.alert(
            "Bestandstype niet toegestaan",
            "Dit bestandstype wordt niet ondersteund. Kies een ander bestand.",
            [
              { text: "Annuleren", style: "cancel" },
              { text: "Ander bestand kiezen", onPress: () => void voegFotoToe() },
            ],
          );
        } else {
          setFotos((prev) =>
            prev.map((f) => (f.lokaal === lokaal ? { ...f, fout: true } : f)),
          );
          Alert.alert(
            "Upload mislukt",
            "De foto kon niet worden geüpload.",
            [
              {
                text: "Verwijderen",
                style: "cancel",
                onPress: () =>
                  setFotos((prev) => prev.filter((f) => f.lokaal !== lokaal)),
              },
              { text: "Opnieuw proberen", onPress: () => void herprobeerFoto(lokaal) },
            ],
          );
        }
      } finally {
        setUploading(false);
      }
    }
  }

  async function herprobeerFoto(lokaal: string) {
    setFotos((prev) =>
      prev.map((f) => (f.lokaal === lokaal ? { ...f, fout: false } : f)),
    );
    setUploading(true);
    try {
      const objectPath = await uploadFoto(lokaal, undefined, "foto");
      setFotos((prev) =>
        prev.map((f) => (f.lokaal === lokaal ? { ...f, objectPath } : f)),
      );
    } catch (err) {
      const isBestandstype =
        err instanceof Error &&
        /415|bestandstype|unsupported|ongeldig.*(type|formaat)/i.test(err.message);
      if (isBestandstype) {
        setFotos((prev) => prev.filter((f) => f.lokaal !== lokaal));
        Alert.alert(
          "Bestandstype niet toegestaan",
          "Dit bestandstype wordt niet ondersteund. Kies een ander bestand.",
          [
            { text: "Annuleren", style: "cancel" },
            { text: "Ander bestand kiezen", onPress: () => void voegFotoToe() },
          ],
        );
      } else {
        setFotos((prev) =>
          prev.map((f) => (f.lokaal === lokaal ? { ...f, fout: true } : f)),
        );
        Alert.alert(
          "Upload mislukt",
          "De foto kon niet worden geüpload.",
          [
            {
              text: "Verwijderen",
              style: "cancel",
              onPress: () =>
                setFotos((prev) => prev.filter((f) => f.lokaal !== lokaal)),
            },
            { text: "Opnieuw proberen", onPress: () => void herprobeerFoto(lokaal) },
          ],
        );
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleStart() {
    if (!isOnline) {
      Alert.alert("Geen verbinding", "AI-stap genereren vereist een internetverbinding.");
      return;
    }
    startMutatie.mutate(
      { id: opdrachtId },
      {
        onSuccess: (stap) => {
          setGecachteStap(stap);
          void cacheStap(opdrachtId, stap);
          void refetch();
        },
        onError: () => Alert.alert("Fout", "Kon uitvoering niet starten. Probeer opnieuw."),
      },
    );
  }

  async function handleVoltooi() {
    if (!actieveStap) return;
    if (!antwoord) {
      Alert.alert("Bevestiging vereist", "Bevestig dat de controlevraag met 'ja' is beantwoord.");
      return;
    }

    const geuploadeFotos = fotos.filter((f) => f.objectPath).map((f) => f.objectPath!);
    const offlineFotos = fotos.filter((f) => !f.objectPath).map((f) => f.lokaal);

    if (!isOnline) {
      await voegToeAanWachtrij({
        type: "voltooi_pim_stap",
        opdrachtId,
        stapId: actieveStap.id,
        payload: {
          antwoord_controle: true,
          opmerkingen: opmerkingen.trim() || undefined,
          foto_urls: geuploadeFotos.length > 0 ? geuploadeFotos : undefined,
        },
        // Lokale foto's (nog niet geüpload) worden bij sync geüpload
        lokale_foto_paden: offlineFotos.length > 0 ? offlineFotos : undefined,
      });
      await herlaadAantal();
      setOfflineOpgeslagen(true);
      setAntwoord(false);
      setOpmerkingen("");
      setFotos([]);
      return;
    }

    voltooiMutatie.mutate(
      {
        id: opdrachtId,
        stapId: actieveStap.id,
        data: {
          antwoord_controle: true,
          opmerkingen: opmerkingen.trim() || undefined,
          foto_urls: geuploadeFotos.length > 0 ? geuploadeFotos : undefined,
        },
      },
      {
        onSuccess: async (resultaat) => {
          setAntwoord(false);
          setOpmerkingen("");
          setFotos([]);

          if (resultaat.uitvoering_gereed) {
            await verwijderCache(opdrachtId);
            setUitvoeringGereed(true);
          } else if (resultaat.volgende_stap) {
            const volgende = resultaat.volgende_stap;
            setGecachteStap(volgende);
            await cacheStap(opdrachtId, volgende);
            void refetch();
          }
        },
        onError: () => Alert.alert("Fout", "Voltooien mislukt. Probeer opnieuw."),
      },
    );
  }

  async function handleAfwijking() {
    if (!actieveStap || !afwijkingTekst.trim()) return;
    setAfwijkingBezig(true);
    afwijkingMutatie.mutate(
      {
        id: opdrachtId,
        stapId: actieveStap.id,
        data: { omschrijving: afwijkingTekst.trim() },
      },
      {
        onSuccess: async (stap) => {
          setGecachteStap(stap);
          await cacheStap(opdrachtId, stap);
          setAfwijkingModus(false);
          setAfwijkingTekst("");
          setAfwijkingBezig(false);
          void refetch();
          startPolling();
        },
        onError: () => {
          setAfwijkingBezig(false);
          Alert.alert("Fout", "Afwijking melden mislukt. Probeer opnieuw.");
        },
      },
    );
  }

  async function handleBeslissing(beslissing: "doorgaan" | "stoppen") {
    if (!actieveStap) return;
    beslisMutatie.mutate(
      {
        id: opdrachtId,
        stapId: actieveStap.id,
        data: { beslissing },
      },
      {
        onSuccess: async (resultaat) => {
          stopPolling();
          if (resultaat.uitvoering_gereed) {
            await verwijderCache(opdrachtId);
            setUitvoeringGereed(true);
          } else if (resultaat.volgende_stap) {
            const volgende = resultaat.volgende_stap;
            setGecachteStap(volgende);
            await cacheStap(opdrachtId, volgende);
            void refetch();
          } else {
            void refetch();
          }
        },
        onError: () => Alert.alert("Fout", "Beslissing kon niet worden verwerkt."),
      },
    );
  }

  if (uitvoeringGereed) {
    return (
      <UitvoeringThemeProvider>
        <View style={{ flex: 1, backgroundColor: c.background }}>
          <View
            style={{
              backgroundColor: c.dark,
              paddingTop: bovenInset(insets) + 12,
              paddingHorizontal: 20,
              paddingBottom: 18,
            }}
          >
            <Pressable onPress={() => router.back()} style={{ marginBottom: 10 }}>
              <Text style={{ color: c.primary, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>
                ‹ Terug
              </Text>
            </Pressable>
            <Text style={{ color: c.darkForeground, fontSize: 20, fontFamily: "Inter_700Bold" }}>
              Adaptieve gids
            </Text>
          </View>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }}>
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: "#dcfce7",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="checkmark-circle" size={44} color="#16a34a" />
            </View>
            <Text style={{ color: c.foreground, fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" }}>
              Uitvoering gereed
            </Text>
            <Text style={{ color: c.mutedForeground, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 }}>
              Alle stappen zijn doorlopen. De uitvoering is voltooid.
            </Text>
            <Pressable
              onPress={() => {
                void forceerSync();
                router.back();
              }}
              style={{
                backgroundColor: c.primary,
                borderRadius: 10,
                paddingHorizontal: 24,
                paddingVertical: 14,
                marginTop: 8,
              }}
            >
              <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" }}>
                Terug naar werk
              </Text>
            </Pressable>
          </View>
        </View>
      </UitvoeringThemeProvider>
    );
  }

  return (
    <UitvoeringThemeProvider>
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <View
          style={{
            backgroundColor: c.dark,
            paddingTop: bovenInset(insets) + 12,
            paddingHorizontal: 20,
            paddingBottom: 12,
          }}
        >
          <Pressable onPress={() => router.back()} style={{ marginBottom: 10 }}>
            <Text style={{ color: c.primary, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>
              ‹ Terug
            </Text>
          </Pressable>
          <Text style={{ color: c.darkForeground, fontSize: 20, fontFamily: "Inter_700Bold" }}>
            Adaptieve gids
          </Text>
          {actieveStap && (
            <Text style={{ color: c.darkMuted, fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 }}>
              Stap {actieveStap.volgorde}
              {actieveStap.werkpakket_sleutel ? ` · ${actieveStap.werkpakket_sleutel}` : ""}
            </Text>
          )}
        </View>

        {actieveStap && <VoortgangsBalk volgorde={actieveStap.volgorde} />}
        <OfflineBanner />

        {isLoading && !gecachteStap ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator size="large" color={c.primary} />
            <Text style={{ color: c.mutedForeground, marginTop: 12, fontFamily: "Inter_400Regular" }}>
              Stap laden...
            </Text>
          </View>
        ) : isError && !gecachteStap ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }}>
            <Ionicons name="cloud-offline-outline" size={48} color={c.mutedForeground} />
            <Text style={{ color: c.foreground, fontSize: 16, fontFamily: "Inter_700Bold", textAlign: "center" }}>
              Geen actieve stap gevonden
            </Text>
            <Text style={{ color: c.mutedForeground, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 }}>
              Start de adaptieve gids om de eerste AI-stap te genereren. Hiervoor is een internetverbinding vereist.
            </Text>
            <Pressable
              onPress={handleStart}
              disabled={!isOnline || startMutatie.isPending}
              style={{
                backgroundColor: !isOnline ? c.accent : c.primary,
                borderRadius: 10,
                paddingHorizontal: 24,
                paddingVertical: 14,
                opacity: startMutatie.isPending ? 0.7 : 1,
              }}
            >
              {startMutatie.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: !isOnline ? c.mutedForeground : "#fff", fontSize: 15, fontFamily: "Inter_700Bold" }}>
                  {isOnline ? "Start adaptieve gids" : "Geen verbinding"}
                </Text>
              )}
            </Pressable>
          </View>
        ) : actieveStap ? (
          actieveStap.status === "afgeweken" ? (
            <ScrollView
              contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
              keyboardShouldPersistTaps="handled"
            >
              <AfwijkingWachtScherm
                stap={actieveStap}
                onBeslissing={handleBeslissing}
                isBezig={beslisMutatie.isPending}
                c={c}
              />
            </ScrollView>
          ) : afwijkingModus ? (
            <ScrollView
              contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
              keyboardShouldPersistTaps="handled"
            >
              <AfwijkingFormulier
                tekst={afwijkingTekst}
                onTekst={setAfwijkingTekst}
                onAnnuleer={() => setAfwijkingModus(false)}
                onIndien={handleAfwijking}
                isBezig={afwijkingBezig}
                isOnline={isOnline}
                c={c}
              />
            </ScrollView>
          ) : (
            <View style={{ flex: 1 }}>
              {offlineOpgeslagen && (
                <View
                  style={{
                    backgroundColor: "#fef3c7",
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    flexDirection: "row",
                    gap: 8,
                    alignItems: "center",
                    borderBottomWidth: 1,
                    borderBottomColor: "#fcd34d",
                  }}
                >
                  <Ionicons name="save-outline" size={14} color="#92400e" />
                  <Text style={{ color: "#92400e", fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 }}>
                    Opgeslagen voor later — wordt gesynchroniseerd zodra verbinding is hersteld.
                  </Text>
                </View>
              )}
              <UitvoeringLayout
                stap={actieveStap}
                opdrachtId={opdrachtId}
                fotos={fotos}
                uploading={uploading}
                antwoord={antwoord}
                isBezig={voltooiMutatie.isPending}
                isOnline={isOnline}
                toonEigenStapHeader={false}
                onFoto={voegFotoToe}
                onAfgerond={handleVoltooi}
                onAfwijking={() => setAfwijkingModus(true)}
                onAntwoordChange={setAntwoord}
                onTerugNaarNormaal={() => router.back()}
              />
            </View>
          )
        ) : null}
      </View>
    </UitvoeringThemeProvider>
  );
}

function StapKaart({
  stap,
  fotos,
  antwoord,
  opmerkingen,
  uploading,
  isBezig,
  onAntwoord,
  onOpmerkingen,
  onFotoToevoegen,
  onFotoVerwijder,
  onVoltooi,
  onAfwijking,
  isOnline,
  c,
}: {
  stap: PimUitvoeringStap;
  fotos: { lokaal: string; objectPath?: string }[];
  antwoord: boolean;
  opmerkingen: string;
  uploading: boolean;
  isBezig: boolean;
  onAntwoord: (v: boolean) => void;
  onOpmerkingen: (v: string) => void;
  onFotoToevoegen: () => void;
  onFotoVerwijder: (idx: number) => void;
  onVoltooi: () => void;
  onAfwijking: () => void;
  isOnline: boolean;
  c: ReturnType<typeof useColors>;
}) {
  const instructie = parseInstructie(stap.instructie_json);
  const guidance = parseGuidance(stap.guidance_context);
  const vgeRanMaarLeeg =
    stap.guidance_context !== null &&
    stap.guidance_context !== undefined &&
    typeof stap.guidance_context === "object" &&
    "vge_versie" in (stap.guidance_context as object) &&
    !guidance;

  return (
    <>
      {guidance && (
        <GuidanceSectie guidance={guidance} c={c} />
      )}
      {vgeRanMaarLeeg && (
        <Sectie titel="Visuele begeleiding">
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Ionicons name="image-outline" size={18} color={c.mutedForeground} />
            <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 18 }}>
              Geen visuele instructie beschikbaar voor dit spot-type.
            </Text>
          </View>
        </Sectie>
      )}

      {instructie?.doel && (
        <Sectie titel="Doel">
          <Text style={{ color: c.foreground, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 }}>
            {instructie.doel}
          </Text>
        </Sectie>
      )}

      {instructie?.veiligheidscontrole && (
        <Sectie titel="Veiligheidscontrole">
          <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#d97706" style={{ marginTop: 1 }} />
            <Text style={{ color: c.foreground, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, flex: 1 }}>
              {instructie.veiligheidscontrole}
            </Text>
          </View>
        </Sectie>
      )}

      {instructie?.handeling && (
        <Sectie titel="Handeling">
          <Text style={{ color: c.foreground, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 }}>
            {instructie.handeling}
          </Text>
        </Sectie>
      )}

      {instructie?.gereedschappen && instructie.gereedschappen.length > 0 && (
        <Sectie titel="Gereedschappen">
          <BulletLijst items={instructie.gereedschappen} />
        </Sectie>
      )}

      {instructie?.artikelen && instructie.artikelen.length > 0 && (
        <Sectie titel="Benodigde artikelen">
          <BulletLijst items={instructie.artikelen} />
        </Sectie>
      )}

      {instructie?.foto_opdracht && (
        <Sectie titel="Fotobewijs vereist">
          <Text style={{ color: c.foreground, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: 10 }}>
            {instructie.foto_opdracht}
          </Text>
          <Pressable
            onPress={onFotoToevoegen}
            disabled={uploading}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: c.primary + "18",
              borderRadius: 8,
              padding: 12,
              borderWidth: 1,
              borderColor: c.primary + "44",
              borderStyle: "dashed",
            }}
          >
            {uploading ? (
              <ActivityIndicator size="small" color={c.primary} />
            ) : (
              <Ionicons name="camera-outline" size={20} color={c.primary} />
            )}
            <Text style={{ color: c.primary, fontSize: 14, fontFamily: "Inter_600SemiBold" }}>
              {uploading ? "Uploaden..." : "Foto toevoegen"}
            </Text>
          </Pressable>
          <FotoRij uris={fotos} onVerwijder={onFotoVerwijder} />
        </Sectie>
      )}

      {instructie?.controlevraag && (
        <Sectie titel="Controlevraag">
          <Text style={{ color: c.foreground, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: 12 }}>
            {instructie.controlevraag}
          </Text>
          <Pressable
            onPress={() => onAntwoord(!antwoord)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              backgroundColor: antwoord ? "#dcfce7" : c.accent,
              borderRadius: 8,
              padding: 14,
            }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 4,
                borderWidth: 2,
                borderColor: antwoord ? "#16a34a" : c.border,
                backgroundColor: antwoord ? "#16a34a" : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {antwoord && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text
              style={{
                color: antwoord ? "#15803d" : c.foreground,
                fontSize: 14,
                fontFamily: antwoord ? "Inter_600SemiBold" : "Inter_400Regular",
              }}
            >
              Ja, ik bevestig dit
            </Text>
          </Pressable>
        </Sectie>
      )}

      <Sectie titel="Opmerkingen (optioneel)">
        <TextInput
          value={opmerkingen}
          onChangeText={onOpmerkingen}
          placeholder="Voeg opmerkingen toe bij deze stap..."
          placeholderTextColor={c.mutedForeground}
          multiline
          numberOfLines={3}
          style={{
            color: c.foreground,
            fontSize: 14,
            fontFamily: "Inter_400Regular",
            backgroundColor: c.background,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: c.border,
            padding: 10,
            minHeight: 70,
            textAlignVertical: "top",
          }}
        />
      </Sectie>

      <View style={{ gap: 10, marginTop: 4 }}>
        <Pressable
          onPress={onVoltooi}
          disabled={isBezig || uploading}
          style={{
            backgroundColor: !antwoord ? c.accent : c.primary,
            borderRadius: 12,
            padding: 16,
            alignItems: "center",
            opacity: isBezig || uploading ? 0.7 : 1,
          }}
        >
          {isBezig ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons
                name={!isOnline ? "save-outline" : "checkmark-circle-outline"}
                size={20}
                color={!antwoord ? c.mutedForeground : "#fff"}
              />
              <Text
                style={{
                  color: !antwoord ? c.mutedForeground : "#fff",
                  fontSize: 15,
                  fontFamily: "Inter_700Bold",
                }}
              >
                {!isOnline ? "Opslaan voor later" : "Stap voltooien"}
              </Text>
            </View>
          )}
        </Pressable>

        <Pressable
          onPress={onAfwijking}
          style={{
            backgroundColor: "transparent",
            borderRadius: 12,
            padding: 14,
            alignItems: "center",
            borderWidth: 1,
            borderColor: "#d97706",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="warning-outline" size={18} color="#d97706" />
            <Text style={{ color: "#d97706", fontSize: 14, fontFamily: "Inter_600SemiBold" }}>
              Afwijking melden
            </Text>
          </View>
        </Pressable>
      </View>
    </>
  );
}

function AfwijkingFormulier({
  tekst,
  onTekst,
  onAnnuleer,
  onIndien,
  isBezig,
  isOnline,
  c,
}: {
  tekst: string;
  onTekst: (v: string) => void;
  onAnnuleer: () => void;
  onIndien: () => void;
  isBezig: boolean;
  isOnline: boolean;
  c: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={{
        backgroundColor: "#fff7ed",
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: "#fed7aa",
        gap: 14,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name="warning" size={20} color="#d97706" />
        <Text style={{ color: "#92400e", fontSize: 16, fontFamily: "Inter_700Bold" }}>
          Afwijking melden
        </Text>
      </View>
      <Text style={{ color: "#92400e", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 }}>
        Beschrijf wat er afwijkt van de instructie. Een projectleider beoordeelt de situatie en geeft aan of u kunt doorgaan.
      </Text>
      {!isOnline && (
        <View style={{ backgroundColor: "#dc262622", borderRadius: 8, padding: 10 }}>
          <Text style={{ color: "#dc2626", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
            Geen verbinding — afwijking melden vereist een internetverbinding.
          </Text>
        </View>
      )}
      <TextInput
        value={tekst}
        onChangeText={onTekst}
        placeholder="Beschrijf de afwijking..."
        placeholderTextColor="#a16207"
        multiline
        numberOfLines={4}
        editable={isOnline}
        style={{
          color: "#78350f",
          fontSize: 14,
          fontFamily: "Inter_400Regular",
          backgroundColor: "#fffbeb",
          borderRadius: 8,
          borderWidth: 1,
          borderColor: "#fcd34d",
          padding: 10,
          minHeight: 90,
          textAlignVertical: "top",
        }}
      />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={onAnnuleer}
          style={{
            flex: 1,
            borderRadius: 10,
            padding: 12,
            alignItems: "center",
            backgroundColor: "#e5e7eb",
          }}
        >
          <Text style={{ color: "#374151", fontSize: 14, fontFamily: "Inter_600SemiBold" }}>
            Annuleren
          </Text>
        </Pressable>
        <Pressable
          onPress={onIndien}
          disabled={!tekst.trim() || isBezig || !isOnline}
          style={{
            flex: 2,
            borderRadius: 10,
            padding: 12,
            alignItems: "center",
            backgroundColor: !tekst.trim() || !isOnline ? "#d1d5db" : "#d97706",
            opacity: isBezig ? 0.7 : 1,
          }}
        >
          {isBezig ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" }}>
              Meld afwijking
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function AfwijkingWachtScherm({
  stap,
  onBeslissing,
  isBezig,
  c,
}: {
  stap: PimUitvoeringStap;
  onBeslissing: (beslissing: "doorgaan" | "stoppen") => void;
  isBezig: boolean;
  c: ReturnType<typeof useColors>;
}) {
  const afwijking = stap.afwijking_json as Record<string, unknown> | null;
  const beslissing = afwijking?.beslissing as string | undefined;
  const toelichting = afwijking?.toelichting as string | undefined;
  const afwijkingOmschrijving = afwijking?.omschrijving as string | undefined;

  const heeftBeslissing = beslissing === "doorgaan" || beslissing === "stoppen";

  return (
    <View
      style={{
        backgroundColor: heeftBeslissing && beslissing === "doorgaan" ? "#f0fdf4" : "#fff7ed",
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: heeftBeslissing && beslissing === "doorgaan" ? "#86efac" : "#fed7aa",
        gap: 14,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons
          name={heeftBeslissing ? "checkmark-circle" : "time-outline"}
          size={22}
          color={heeftBeslissing && beslissing === "doorgaan" ? "#16a34a" : "#d97706"}
        />
        <Text
          style={{
            color: heeftBeslissing && beslissing === "doorgaan" ? "#15803d" : "#92400e",
            fontSize: 16,
            fontFamily: "Inter_700Bold",
          }}
        >
          {heeftBeslissing
            ? beslissing === "doorgaan"
              ? "Projectleider: Doorgaan"
              : "Projectleider: Gestopt"
            : "Wachten op projectleider"}
        </Text>
      </View>

      {afwijkingOmschrijving && (
        <View>
          <Text style={{ color: "#92400e", fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
            Gemelde afwijking
          </Text>
          <Text style={{ color: "#78350f", fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 }}>
            {afwijkingOmschrijving}
          </Text>
        </View>
      )}

      {!heeftBeslissing && (
        <View style={{ backgroundColor: "#fef3c7", borderRadius: 8, padding: 12 }}>
          <Text style={{ color: "#92400e", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 }}>
            De afwijking is gemeld bij de projectleider. Dit scherm controleert automatisch of er een beslissing is genomen. U hoeft niets te doen.
          </Text>
        </View>
      )}

      {heeftBeslissing && toelichting && (
        <View>
          <Text style={{ color: beslissing === "doorgaan" ? "#15803d" : "#92400e", fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
            Toelichting
          </Text>
          <Text style={{ color: c.foreground, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 }}>
            {toelichting}
          </Text>
        </View>
      )}

      {heeftBeslissing && (
        <Pressable
          onPress={() => onBeslissing(beslissing as "doorgaan" | "stoppen")}
          disabled={isBezig}
          style={{
            backgroundColor: beslissing === "doorgaan" ? "#16a34a" : "#dc2626",
            borderRadius: 10,
            padding: 14,
            alignItems: "center",
            opacity: isBezig ? 0.7 : 1,
          }}
        >
          {isBezig ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" }}>
              {beslissing === "doorgaan" ? "Doorgaan met uitvoering" : "Uitvoering stoppen"}
            </Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

function VorigeStappenPanel({
  stappen,
  onSluit,
  c,
  insets,
}: {
  stappen: PimUitvoeringStap[];
  onSluit: () => void;
  c: ReturnType<typeof useColors>;
  insets: { bottom: number };
}) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <Text style={{ color: c.foreground, fontSize: 16, fontFamily: "Inter_700Bold" }}>
          Vorige stappen
        </Text>
        <Pressable
          onPress={onSluit}
          style={{
            backgroundColor: c.accent,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 6,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Ionicons name="arrow-forward-outline" size={14} color={c.foreground} />
          <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
            Actieve stap
          </Text>
        </Pressable>
      </View>

      {stappen.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 48 }}>
          <Ionicons name="time-outline" size={40} color={c.mutedForeground} />
          <Text
            style={{
              color: c.mutedForeground,
              marginTop: 12,
              fontSize: 14,
              fontFamily: "Inter_400Regular",
              textAlign: "center",
            }}
          >
            Nog geen voltooide stappen.
          </Text>
        </View>
      ) : (
        stappen
          .slice()
          .sort((a, b) => b.volgorde - a.volgorde)
          .map((stap) => <ReadOnlyStapKaart key={stap.id} stap={stap} c={c} />)
      )}
    </ScrollView>
  );
}

function ReadOnlyStapKaart({
  stap,
  c,
}: {
  stap: PimUitvoeringStap;
  c: ReturnType<typeof useColors>;
}) {
  const instructie = parseInstructie(stap.instructie_json);
  const antwoorden = stap.antwoorden_json as {
    antwoord_controle?: boolean;
    opmerkingen?: string;
  } | null;
  const aiAnalyse = stap.ai_analyse_json as Record<string, unknown> | null;
  const afwijking = stap.afwijking_json as {
    omschrijving?: string;
    beslissing?: string;
    toelichting?: string;
  } | null;

  const statusKleur =
    stap.status === "voltooid"
      ? "#16a34a"
      : stap.status === "overgeslagen"
        ? "#6b7280"
        : "#d97706";
  const statusLabel =
    stap.status === "voltooid"
      ? "Voltooid"
      : stap.status === "overgeslagen"
        ? "Overgeslagen"
        : stap.status;
  const statusIcoon: keyof typeof Ionicons.glyphMap =
    stap.status === "voltooid"
      ? "checkmark-circle"
      : stap.status === "overgeslagen"
        ? "remove-circle-outline"
        : "alert-circle-outline";

  return (
    <View
      style={{
        backgroundColor: c.card,
        borderRadius: 12,
        marginBottom: 16,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: c.border,
      }}
    >
      <View
        style={{
          backgroundColor: c.accent,
          padding: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          <View
            style={{
              backgroundColor: c.primary + "22",
              borderRadius: 20,
              width: 32,
              height: 32,
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Text style={{ color: c.primary, fontSize: 14, fontFamily: "Inter_700Bold" }}>
              {stap.volgorde}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            {instructie?.doel ? (
              <Text
                style={{
                  color: c.foreground,
                  fontSize: 13,
                  fontFamily: "Inter_600SemiBold",
                }}
                numberOfLines={2}
              >
                {instructie.doel}
              </Text>
            ) : (
              <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                Stap {stap.volgorde}
              </Text>
            )}
            {stap.werkpakket_sleutel ? (
              <Text style={{ color: c.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular" }}>
                {stap.werkpakket_sleutel}
              </Text>
            ) : null}
          </View>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            backgroundColor: statusKleur + "18",
            borderRadius: 20,
            paddingHorizontal: 8,
            paddingVertical: 3,
            flexShrink: 0,
          }}
        >
          <Ionicons name={statusIcoon} size={12} color={statusKleur} />
          <Text style={{ color: statusKleur, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
            {statusLabel}
          </Text>
        </View>
      </View>

      <View style={{ padding: 14, gap: 12 }}>
        {instructie?.handeling ? (
          <View>
            <Text
              style={{
                color: c.mutedForeground,
                fontSize: 11,
                fontFamily: "Inter_600SemiBold",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 4,
              }}
            >
              Handeling
            </Text>
            <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 }}>
              {instructie.handeling}
            </Text>
          </View>
        ) : null}

        {instructie?.controlevraag ? (
          <View>
            <Text
              style={{
                color: c.mutedForeground,
                fontSize: 11,
                fontFamily: "Inter_600SemiBold",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 4,
              }}
            >
              Controlevraag
            </Text>
            <Text
              style={{
                color: c.foreground,
                fontSize: 13,
                fontFamily: "Inter_400Regular",
                lineHeight: 19,
                marginBottom: 6,
              }}
            >
              {instructie.controlevraag}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons
                name={antwoorden?.antwoord_controle ? "checkmark-circle" : "close-circle"}
                size={16}
                color={antwoorden?.antwoord_controle ? "#16a34a" : "#9ca3af"}
              />
              <Text
                style={{
                  color: antwoorden?.antwoord_controle ? "#15803d" : c.mutedForeground,
                  fontSize: 13,
                  fontFamily: "Inter_600SemiBold",
                }}
              >
                {antwoorden?.antwoord_controle ? "Ja, bevestigd" : "Niet bevestigd"}
              </Text>
            </View>
          </View>
        ) : null}

        {antwoorden?.opmerkingen ? (
          <View>
            <Text
              style={{
                color: c.mutedForeground,
                fontSize: 11,
                fontFamily: "Inter_600SemiBold",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 4,
              }}
            >
              Opmerkingen
            </Text>
            <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 }}>
              {antwoorden.opmerkingen}
            </Text>
          </View>
        ) : null}

        {stap.foto_urls && stap.foto_urls.length > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="camera-outline" size={15} color={c.mutedForeground} />
            <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular" }}>
              {stap.foto_urls.length} foto{stap.foto_urls.length !== 1 ? "'s" : ""} bijgevoegd
            </Text>
          </View>
        ) : null}

        {aiAnalyse && Object.keys(aiAnalyse).length > 0 ? (() => {
          const oordeel = typeof aiAnalyse.oordeel === "string" ? aiAnalyse.oordeel : null;
          const isAkkoord = oordeel === "akkoord";
          const isTwijfel = oordeel === "twijfel";
          const borderKleur = isAkkoord ? "#16a34a" : isTwijfel ? "#d97706" : "#dc2626";
          const bgKleur = isAkkoord ? "#f0fdf4" : isTwijfel ? "#fffbeb" : "#fef2f2";
          const tekstKleur = isAkkoord ? "#14532d" : isTwijfel ? "#78350f" : "#7f1d1d";
          const badgeBgKleur = isAkkoord ? "#dcfce7" : isTwijfel ? "#fef9c3" : "#fee2e2";
          const badgeTekstKleur = isAkkoord ? "#15803d" : isTwijfel ? "#854d0e" : "#b91c1c";
          const oordeelLabel = isAkkoord ? "Akkoord" : isTwijfel ? "Aandachtspunt" : "Niet akkoord";
          const oordeelIcoon = isAkkoord ? "checkmark-circle" : isTwijfel ? "warning" : "close-circle";
          const risicos = Array.isArray(aiAnalyse.waargenomen_risicos) ? aiAnalyse.waargenomen_risicos as string[] : [];
          const ontbrekend = Array.isArray(aiAnalyse.ontbrekende_bewijsstukken) ? aiAnalyse.ontbrekende_bewijsstukken as string[] : [];
          const confidence = typeof aiAnalyse.confidence === "number" ? aiAnalyse.confidence as number : null;
          return (
            <View style={{ backgroundColor: bgKleur, borderRadius: 8, padding: 10, borderLeftWidth: 3, borderLeftColor: borderKleur, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ backgroundColor: badgeBgKleur, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name={oordeelIcoon as "checkmark-circle" | "warning" | "close-circle"} size={13} color={badgeTekstKleur} />
                  <Text style={{ color: badgeTekstKleur, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{oordeelLabel}</Text>
                </View>
                {confidence !== null ? (
                  <Text style={{ color: tekstKleur, fontSize: 11, fontFamily: "Inter_400Regular", opacity: 0.7 }}>
                    {Math.round(confidence * 100)}% zekerheid
                  </Text>
                ) : null}
              </View>
              {typeof aiAnalyse.samenvatting === "string" ? (
                <Text style={{ color: tekstKleur, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 }}>
                  {aiAnalyse.samenvatting}
                </Text>
              ) : null}
              {risicos.length > 0 ? (
                <View style={{ gap: 3 }}>
                  <Text style={{ color: tekstKleur, fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 }}>Risico&apos;s</Text>
                  {risicos.map((r, i) => (
                    <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 5 }}>
                      <Ionicons name="warning-outline" size={13} color="#d97706" style={{ marginTop: 2 }} />
                      <Text style={{ color: tekstKleur, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18, flex: 1 }}>{r}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {ontbrekend.length > 0 ? (
                <View style={{ gap: 3 }}>
                  <Text style={{ color: tekstKleur, fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 }}>Nog aanleveren</Text>
                  {ontbrekend.map((b, i) => (
                    <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 5 }}>
                      <Ionicons name="alert-circle-outline" size={13} color="#0891b2" style={{ marginTop: 2 }} />
                      <Text style={{ color: tekstKleur, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18, flex: 1 }}>{b}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {typeof aiAnalyse.herstelactie_voorstel === "string" ? (
                <View style={{ backgroundColor: "#fff7ed", borderRadius: 6, padding: 8 }}>
                  <Text style={{ color: "#92400e", fontSize: 11, fontFamily: "Inter_600SemiBold", marginBottom: 2 }}>Aanbevolen actie</Text>
                  <Text style={{ color: "#78350f", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 }}>{aiAnalyse.herstelactie_voorstel}</Text>
                </View>
              ) : null}
            </View>
          );
        })() : null}

        {afwijking?.omschrijving ? (
          <View
            style={{
              backgroundColor: "#fff7ed",
              borderRadius: 8,
              padding: 10,
              borderLeftWidth: 3,
              borderLeftColor: "#d97706",
            }}
          >
            <Text
              style={{
                color: "#92400e",
                fontSize: 11,
                fontFamily: "Inter_600SemiBold",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 4,
              }}
            >
              Afwijking
            </Text>
            <Text style={{ color: "#78350f", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 }}>
              {afwijking.omschrijving}
            </Text>
            {afwijking.beslissing ? (
              <View style={{ marginTop: 8, flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
                <Ionicons
                  name={afwijking.beslissing === "doorgaan" ? "checkmark-circle" : "close-circle"}
                  size={15}
                  color={afwijking.beslissing === "doorgaan" ? "#16a34a" : "#dc2626"}
                  style={{ marginTop: 1 }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: afwijking.beslissing === "doorgaan" ? "#15803d" : "#dc2626",
                      fontSize: 12,
                      fontFamily: "Inter_600SemiBold",
                    }}
                  >
                    Besluit: {afwijking.beslissing === "doorgaan" ? "Doorgaan" : "Gestopt"}
                  </Text>
                  {afwijking.toelichting ? (
                    <Text
                      style={{
                        color: "#78350f",
                        fontSize: 12,
                        fontFamily: "Inter_400Regular",
                        marginTop: 2,
                      }}
                    >
                      {afwijking.toelichting}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {stap.voltooid_op ? (
          <Text style={{ color: c.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular" }}>
            Voltooid op{" "}
            {new Date(stap.voltooid_op).toLocaleString("nl-NL", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ── Spot status helpers ───────────────────────────────────────────────────────
const SPOT_STATUS_LABEL: Record<string, string> = {
  concept: "Concept",
  voorbereid: "Voorbereid",
  in_uitvoering: "In uitvoering",
  opgeleverd: "Opgeleverd",
  goedgekeurd: "Goedgekeurd",
  afgekeurd: "Afgekeurd",
  in_onderhoud: "In onderhoud",
  vervallen: "Vervallen",
  opdracht: "Opdracht",
  werkbegroting: "Werkbegroting",
  inkoop: "Inkoop",
};

const SPOT_STATUS_KLEUR: Record<string, string> = {
  concept: "#6b7280",
  voorbereid: "#0284c7",
  in_uitvoering: "#d97706",
  opgeleverd: "#16a34a",
  goedgekeurd: "#15803d",
  afgekeurd: "#dc2626",
  in_onderhoud: "#7c3aed",
  vervallen: "#6b7280",
  opdracht: "#0369a1",
  werkbegroting: "#1d4ed8",
  inkoop: "#0f766e",
};

// ── SpotKaartMonteur ─────────────────────────────────────────────────────────
function SpotKaartMonteur({
  spot,
  actieveStap,
  opdrachtId,
  c,
}: {
  spot: VoorzieningPimDetail;
  actieveStap: PimUitvoeringStap | null;
  opdrachtId: number;
  c: ReturnType<typeof useColors>;
}) {
  const queryClient = useQueryClient();
  const koppelMutatie = useKoppelPimStapVoorzieningen();

  const actieveVoorzieningIds: number[] = Array.isArray(actieveStap?.voorziening_ids)
    ? (actieveStap!.voorziening_ids as number[])
    : [];
  const isGekoppeld = actieveVoorzieningIds.includes(spot.id);
  const kanKoppelen =
    actieveStap !== null &&
    (actieveStap.status === "actief" || actieveStap.status === "afgeweken");

  async function handleToggle() {
    if (!actieveStap || !kanKoppelen) return;
    const nieuweIds = isGekoppeld
      ? actieveVoorzieningIds.filter((id) => id !== spot.id)
      : [...actieveVoorzieningIds, spot.id];
    try {
      await koppelMutatie.mutateAsync({
        id: opdrachtId,
        stapId: actieveStap.id,
        data: { voorziening_ids: nieuweIds },
      });
      void queryClient.invalidateQueries({
        queryKey: getGetHuidigePimUitvoeringStapQueryKey(opdrachtId),
      });
    } catch {
      // stil falen
    }
  }

  const opnameFotos = (spot.fotos ?? []).filter((f) => f.fase === "opname");
  const statusKleur = SPOT_STATUS_KLEUR[spot.status] ?? "#6b7280";
  const statusLabel = SPOT_STATUS_LABEL[spot.status] ?? spot.status;

  return (
    <View
      style={{
        backgroundColor: c.card,
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        borderWidth: isGekoppeld ? 2 : 1,
        borderColor: isGekoppeld ? c.primary : c.accent,
      }}
    >
      {/* Objectnummer + status badge */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <Text style={{ color: c.foreground, fontSize: 15, fontFamily: "Inter_700Bold" }}>
          {spot.objectnummer}
        </Text>
        <View
          style={{
            backgroundColor: statusKleur + "22",
            borderRadius: 6,
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}
        >
          <Text style={{ color: statusKleur, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
            {statusLabel}
          </Text>
        </View>
      </View>

      {/* Type + locatie */}
      <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 2 }}>
        {spot.type_naam ?? spot.type}
        {spot.verdieping_naam ? ` · ${spot.verdieping_naam}` : ""}
        {spot.ruimte ? ` · ${spot.ruimte}` : ""}
      </Text>

      {spot.locatie_omschrijving ? (
        <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 2 }}>
          {spot.locatie_omschrijving}
        </Text>
      ) : null}

      {/* Maatregel (toepassing) of materialen */}
      {(spot.maatregel ?? spot.materialen) ? (
        <View style={{ marginTop: 6, backgroundColor: c.accent, borderRadius: 6, padding: 8 }}>
          <Text style={{ color: c.foreground, fontSize: 11, fontFamily: "Inter_600SemiBold", opacity: 0.6, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>
            {spot.maatregel ? "Maatregel" : "Materialen"}
          </Text>
          <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_400Regular" }}>
            {spot.maatregel
              ? `${spot.maatregel}${spot.maatregel_fabrikant ? ` — ${spot.maatregel_fabrikant}` : ""}`
              : spot.materialen}
          </Text>
        </View>
      ) : null}

      {/* Opmerkingen */}
      {spot.opmerkingen ? (
        <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 6, lineHeight: 17 }}>
          {spot.opmerkingen}
        </Text>
      ) : null}

      {/* Opname foto's */}
      {opnameFotos.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {opnameFotos.slice(0, 4).map((foto) => (
            <Image
              key={foto.id}
              source={{ uri: foto.url }}
              style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: c.accent }}
            />
          ))}
          {opnameFotos.length > 4 ? (
            <View style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: c.mutedForeground, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
                +{opnameFotos.length - 4}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Koppelen / ontkoppelen */}
      {kanKoppelen ? (
        <Pressable
          onPress={() => void handleToggle()}
          disabled={koppelMutatie.isPending}
          style={{
            marginTop: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            alignSelf: "flex-start",
            backgroundColor: isGekoppeld ? "#fef2f2" : c.primary + "15",
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 6,
            opacity: koppelMutatie.isPending ? 0.6 : 1,
          }}
        >
          <Ionicons
            name={isGekoppeld ? "unlink-outline" : "link-outline"}
            size={14}
            color={isGekoppeld ? "#dc2626" : c.primary}
          />
          <Text style={{ color: isGekoppeld ? "#dc2626" : c.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
            {isGekoppeld ? "Ontkoppelen" : "Koppelen aan stap"}
          </Text>
        </Pressable>
      ) : isGekoppeld ? (
        <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="link" size={14} color={c.primary} />
          <Text style={{ color: c.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
            Gekoppeld aan stap {actieveStap?.volgorde}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ── VoorbereideSpotsPanel ─────────────────────────────────────────────────────
function VoorbereideSpotsPanel({
  spots,
  opdrachtId,
  actieveStap,
  onSluit,
  c,
  insets,
}: {
  spots: VoorzieningPimDetail[];
  opdrachtId: number;
  actieveStap: PimUitvoeringStap | null;
  onSluit: () => void;
  c: ReturnType<typeof useColors>;
  insets: { bottom: number };
}) {
  const actieveVoorzieningIds: number[] = Array.isArray(actieveStap?.voorziening_ids)
    ? (actieveStap!.voorziening_ids as number[])
    : [];
  const gekoppeldeSpots = spots.filter((s) => actieveVoorzieningIds.includes(s.id));
  const overigeSpots = spots.filter((s) => !actieveVoorzieningIds.includes(s.id));

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
      {/* Koptekst */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <View>
          <Text style={{ color: c.foreground, fontSize: 16, fontFamily: "Inter_700Bold" }}>
            Voorbereide spots
          </Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>
            {spots.length} spot{spots.length !== 1 ? "s" : ""} voor dit gebouw
          </Text>
        </View>
        <Pressable
          onPress={onSluit}
          style={{
            backgroundColor: c.accent,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 6,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Ionicons name="arrow-forward-outline" size={14} color={c.foreground} />
          <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
            Actieve stap
          </Text>
        </Pressable>
      </View>

      {spots.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 48 }}>
          <Ionicons name="location-outline" size={40} color={c.mutedForeground} />
          <Text style={{ color: c.mutedForeground, marginTop: 12, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" }}>
            Geen spots gevonden voor dit gebouw.
          </Text>
        </View>
      ) : (
        <>
          {gekoppeldeSpots.length > 0 && (
            <>
              <Text style={{ color: c.primary, fontSize: 11, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 }}>
                Gekoppeld aan stap {actieveStap?.volgorde} ({gekoppeldeSpots.length})
              </Text>
              {gekoppeldeSpots.map((spot) => (
                <SpotKaartMonteur key={spot.id} spot={spot} actieveStap={actieveStap} opdrachtId={opdrachtId} c={c} />
              ))}
              {overigeSpots.length > 0 && (
                <View style={{ height: 1, backgroundColor: c.accent, marginVertical: 16 }} />
              )}
            </>
          )}
          {overigeSpots.length > 0 && (
            <>
              {gekoppeldeSpots.length > 0 && (
                <Text style={{ color: c.mutedForeground, fontSize: 11, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 }}>
                  Overige spots ({overigeSpots.length})
                </Text>
              )}
              {overigeSpots.map((spot) => (
                <SpotKaartMonteur key={spot.id} spot={spot} actieveStap={actieveStap} opdrachtId={opdrachtId} c={c} />
              ))}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}
