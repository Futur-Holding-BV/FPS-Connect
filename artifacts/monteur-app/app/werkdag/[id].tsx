import {
  useGetWerkdagItem,
  useUpdateWerkdagItemStatus,
  useListPlanningMeerwerk,
  useCreatePlanningMeerwerk,
} from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HandtekeningPad } from "@/components/HandtekeningPad";
import { OfflineBanner } from "@/components/OfflineBanner";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import { bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useOffline } from "@/context/offline";
import { useSync } from "@/context/sync";
import { useColors } from "@/hooks/useColors";
import {
  leesWerkorder,
  patchWerkorderStatusLokaal,
} from "@/lib/offlineCache";
import { voegToeAanWachtrij } from "@/lib/syncQueue";

const UITVOERING_LABEL: Record<string, string> = {
  gepland: "Gepland",
  bezig: "In uitvoering",
  pauze: "Pauze",
  gereed: "Gereed",
};

const UITVOERING_KLEUR: Record<string, string> = {
  gepland: "#6b7280",
  bezig: "#F23B0D",
  pauze: "#d97706",
  gereed: "#16a34a",
};

function InfoRegel({
  icoon,
  label,
  waarde,
  kleur,
}: {
  icoon: keyof typeof Ionicons.glyphMap;
  label: string;
  waarde: string | null | undefined;
  kleur?: string;
}) {
  const c = useColors();
  if (!waarde) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", paddingVertical: 8, gap: 12 }}>
      <Ionicons name={icoon} size={16} color={c.mutedForeground} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: c.mutedForeground,
            fontSize: 11,
            fontFamily: "Inter_600SemiBold",
            letterSpacing: 0.5,
            textTransform: "uppercase",
            marginBottom: 2,
          }}
        >
          {label}
        </Text>
        <Text style={{ color: kleur ?? c.text, fontSize: 14, fontFamily: "Inter_400Regular" }}>
          {waarde}
        </Text>
      </View>
    </View>
  );
}

function Kaart({ titel, children }: { titel: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View
      style={{
        backgroundColor: c.card,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        marginHorizontal: 16,
      }}
    >
      <Text
        style={{
          color: c.text,
          fontSize: 13,
          fontFamily: "Inter_700Bold",
          letterSpacing: 0.3,
          marginBottom: 8,
        }}
      >
        {titel}
      </Text>
      {children}
    </View>
  );
}

export default function WerkdagDetailScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const { isOnline } = useOffline();
  const { herlaadAantal, syncStatus, aantalWachtend, aantalMislukt, mislukteItems, wisMislukte, forceerSync, verwijderEnkelMislukt, herprobeeerEnkel, herprobeeerAlle } = useSync();

  const [statusBezig, setStatusBezig] = useState(false);
  const [lokaleStatus, setLokaleStatus] = useState<string | null>(null);
  const [lokaleFotos, setLokaleFotos] = useState<string[]>([]);
  const [handtekeningOpgeslagen, setHandtekeningOpgeslagen] = useState(false);
  const [handtekeningBezig, setHandtekeningBezig] = useState(false);
  const fotoMapGemaakt = useRef(false);
  const [toonMeerwerkFormulier, setToonMeerwerkFormulier] = useState(false);
  const [meerwerkTekst, setMeerwerkTekst] = useState("");
  const [meerwerkBezig, setMeerwerkBezig] = useState(false);

  if (!token) return <Redirect href="/login" />;

  const id = parseInt(idParam ?? "0", 10);
  const fotoDir = `${FileSystem.documentDirectory ?? ""}werkdag-fotos/${id}/`;

  const { data: werkorder, isLoading, isError, refetch } = useGetWerkdagItem(id);
  const [gecachedWerkorder, setGecachedWerkorder] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!isOnline || (!werkorder && isError)) {
      leesWerkorder(id).then((cached) => {
        if (cached) setGecachedWerkorder(cached as Record<string, unknown>);
      });
    }
  }, [isOnline, id, werkorder, isError]);

  // Laad lokale foto's uit FileSystem bij start
  useEffect(() => {
    FileSystem.getInfoAsync(fotoDir).then((info) => {
      if (info.exists && info.isDirectory) {
        FileSystem.readDirectoryAsync(fotoDir).then((bestanden) => {
          setLokaleFotos(bestanden.map((b) => `${fotoDir}${b}`));
        });
      }
    });
  }, [fotoDir]);

  const statusMutatie = useUpdateWerkdagItemStatus({
    mutation: {
      onSuccess: () => {
        setStatusBezig(false);
        void refetch();
      },
      onError: () => {
        setStatusBezig(false);
        Alert.alert("Fout", "Statuswijziging mislukt. Probeer opnieuw.");
      },
    },
  });

  const { data: meerwerkItems = [], refetch: refetchMeerwerk } = useListPlanningMeerwerk(
    { planning_item_id: id },
    { query: { queryKey: ["meerwerk-werkdag", id], enabled: id > 0 } }
  );
  const maakMeerwerk = useCreatePlanningMeerwerk();

  async function indienMeerwerk() {
    if (!meerwerkTekst.trim()) {
      Alert.alert("Omschrijving vereist", "Voer een omschrijving in voor het meerwerk.");
      return;
    }
    setMeerwerkBezig(true);
    maakMeerwerk.mutate(
      { data: { planning_item_id: id, status: "ingediend", omschrijving: meerwerkTekst.trim() } },
      {
        onSuccess: () => {
          setMeerwerkTekst("");
          setToonMeerwerkFormulier(false);
          setMeerwerkBezig(false);
          void refetchMeerwerk();
        },
        onError: () => {
          setMeerwerkBezig(false);
          Alert.alert("Fout", "Meerwerk indienen mislukt. Probeer opnieuw.");
        },
      }
    );
  }

  async function zetStatus(nieuweStatus: string) {
    if (!isOnline) {
      // Offline: sla op in cache en wachtrij
      await patchWerkorderStatusLokaal(id, nieuweStatus);
      await voegToeAanWachtrij({
        type: "patch_werkdag_status",
        werkdagId: id,
        nieuweStatus,
      });
      setLokaleStatus(nieuweStatus);
      await herlaadAantal();
      return;
    }
    setStatusBezig(true);
    statusMutatie.mutate({ id, data: { uitvoering_status: nieuweStatus } });
  }

  // Gebruik lokale status als die er is, anders server-data of cache
  const huidigWerkorder = werkorder ?? (gecachedWerkorder as unknown as typeof werkorder) ?? null;
  const uitvoeringStatus = lokaleStatus ?? huidigWerkorder?.uitvoering_status ?? "gepland";
  const isOfflineCache = !werkorder && !!gecachedWerkorder;

  async function maakFotoMap() {
    if (!fotoMapGemaakt.current) {
      await FileSystem.makeDirectoryAsync(fotoDir, { intermediates: true });
      fotoMapGemaakt.current = true;
    }
  }

  async function voegFotoToe() {
    const permCam = await ImagePicker.requestCameraPermissionsAsync();
    const permGal = await ImagePicker.requestMediaLibraryPermissionsAsync();

    const bronnen: { label: string; actie: () => Promise<ImagePicker.ImagePickerResult> }[] = [];

    if (permCam.status === "granted") {
      bronnen.push({
        label: "Camera",
        actie: () =>
          ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 }),
      });
    }
    if (permGal.status === "granted") {
      bronnen.push({
        label: "Fotobibliotheek",
        actie: () =>
          ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 }),
      });
    }

    if (bronnen.length === 0) {
      Alert.alert("Geen toegang", "Geef toegang tot camera of fotobibliotheek.");
      return;
    }

    const kies = bronnen.length === 1
      ? bronnen[0]!.actie
      : await new Promise<(() => Promise<ImagePicker.ImagePickerResult>) | null>((resolve) => {
          Alert.alert(
            "Foto toevoegen",
            "Kies een bron",
            [
              ...bronnen.map((b) => ({
                text: b.label,
                onPress: () => resolve(b.actie),
              })),
              { text: "Annuleren", style: "cancel", onPress: () => resolve(null) },
            ],
          );
        });

    if (!kies) return;
    const result = await kies();
    if (result.canceled || !result.assets[0]) return;

    await maakFotoMap();
    const bestandsnaam = `foto_${Date.now()}.jpg`;
    const doel = `${fotoDir}${bestandsnaam}`;
    await FileSystem.copyAsync({ from: result.assets[0].uri, to: doel });
    setLokaleFotos((prev) => [...prev, doel]);
  }

  async function slaHandtekeningOp(svgData: string) {
    setHandtekeningBezig(true);
    try {
      const pad = `${FileSystem.documentDirectory ?? ""}werkdag-handtekeningen/werkdag_${id}.svg`;
      await FileSystem.makeDirectoryAsync(
        `${FileSystem.documentDirectory ?? ""}werkdag-handtekeningen`,
        { intermediates: true },
      );
      await FileSystem.writeAsStringAsync(pad, svgData);
      await voegToeAanWachtrij({
        type: "create_handtekening",
        lokaalPad: pad,
        werkdagId: id,
        positie: "medewerker",
      });
      await herlaadAantal();
      setHandtekeningOpgeslagen(true);
    } finally {
      setHandtekeningBezig(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View
        style={{
          paddingTop: bovenInset(insets) + 8,
          paddingHorizontal: 16,
          paddingBottom: 14,
          backgroundColor: c.dark,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={{ color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" }}
            numberOfLines={1}
          >
            {isLoading && !huidigWerkorder
              ? "Laden…"
              : (huidigWerkorder?.project_naam ?? huidigWerkorder?.titel ?? "Werkorder")}
          </Text>
          {huidigWerkorder?.werknummer ? (
            <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>
              #{huidigWerkorder.werknummer}
            </Text>
          ) : null}
        </View>
        {huidigWerkorder ? (
          <View
            style={{
              backgroundColor: (UITVOERING_KLEUR[uitvoeringStatus] ?? "#6b7280") + "33",
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <Text
              style={{
                color: UITVOERING_KLEUR[uitvoeringStatus] ?? "#6b7280",
                fontSize: 12,
                fontFamily: "Inter_600SemiBold",
              }}
            >
              {UITVOERING_LABEL[uitvoeringStatus] ?? uitvoeringStatus}
            </Text>
          </View>
        ) : null}
      </View>

      <OfflineBanner stijl="compact" />
      <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        <SyncStatusBadge
          status={syncStatus}
          aantalWachtend={aantalWachtend}
          aantalMislukt={aantalMislukt}
          mislukteItems={mislukteItems}
          onWisMislukte={wisMislukte}
          onForceerSync={forceerSync}
          onVerwijderItem={verwijderEnkelMislukt}
          onHerprobeeerItem={herprobeeerEnkel}
          onHerprobeeerAlle={herprobeeerAlle}
        />
      </View>
      {isOfflineCache ? (
        <View
          style={{
            backgroundColor: "rgba(234,179,8,0.1)",
            paddingHorizontal: 16,
            paddingVertical: 6,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Ionicons name="time-outline" size={13} color="#facc15" />
          <Text style={{ color: "#facc15", fontSize: 11, fontFamily: "Inter_400Regular" }}>
            Gegevens uit lokale cache
          </Text>
        </View>
      ) : null}

      {/* Inhoud */}
      {isLoading && !huidigWerkorder ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={c.tint} size="large" />
        </View>
      ) : (isError && !huidigWerkorder) ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32 }}>
          <Ionicons name="alert-circle-outline" size={40} color={c.mutedForeground} />
          <Text
            style={{
              color: c.mutedForeground,
              fontSize: 15,
              textAlign: "center",
              marginTop: 12,
              fontFamily: "Inter_400Regular",
            }}
          >
            {isOnline
              ? "Werkorder niet gevonden of geen toegang."
              : "Geen verbinding en geen lokale cache beschikbaar."}
          </Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
            <Text style={{ color: c.tint, fontFamily: "Inter_600SemiBold" }}>Terug</Text>
          </Pressable>
        </View>
      ) : huidigWerkorder ? (
        <ScrollView contentContainerStyle={{ paddingTop: 16, paddingBottom: 48 }}>

          {/* ── Statusknopen ─────────────────────────────────────────────── */}
          {uitvoeringStatus !== "gereed" ? (
            <View style={{ marginHorizontal: 16, marginBottom: 16, gap: 10 }}>
              {uitvoeringStatus === "gepland" ? (
                <Pressable
                  onPress={() => void zetStatus("bezig")}
                  disabled={statusBezig}
                  style={({ pressed }) => ({
                    backgroundColor: pressed || statusBezig ? "#d63510" : c.tint,
                    borderRadius: 12,
                    paddingVertical: 16,
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: 8,
                    opacity: statusBezig ? 0.7 : 1,
                  })}
                >
                  {statusBezig ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Ionicons name="play-circle" size={20} color="#fff" />
                  )}
                  <Text style={{ color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" }}>
                    Start werk{!isOnline ? " (offline)" : ""}
                  </Text>
                </Pressable>
              ) : null}

              {uitvoeringStatus === "bezig" ? (
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={() => void zetStatus("pauze")}
                    disabled={statusBezig}
                    style={({ pressed }) => ({
                      flex: 1,
                      backgroundColor: pressed ? "#b45309" : "#d97706",
                      borderRadius: 12,
                      paddingVertical: 14,
                      flexDirection: "row",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: 6,
                      opacity: statusBezig ? 0.7 : 1,
                    })}
                  >
                    <Ionicons name="pause-circle" size={18} color="#fff" />
                    <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
                      Pauze
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void zetStatus("gereed")}
                    disabled={statusBezig}
                    style={({ pressed }) => ({
                      flex: 1,
                      backgroundColor: pressed ? "#15803d" : "#16a34a",
                      borderRadius: 12,
                      paddingVertical: 14,
                      flexDirection: "row",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: 6,
                      opacity: statusBezig ? 0.7 : 1,
                    })}
                  >
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                    <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
                      Gereed melden
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {uitvoeringStatus === "pauze" ? (
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={() => void zetStatus("bezig")}
                    disabled={statusBezig}
                    style={({ pressed }) => ({
                      flex: 1,
                      backgroundColor: pressed || statusBezig ? "#d63510" : c.tint,
                      borderRadius: 12,
                      paddingVertical: 14,
                      flexDirection: "row",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: 6,
                      opacity: statusBezig ? 0.7 : 1,
                    })}
                  >
                    {statusBezig ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Ionicons name="play-circle" size={18} color="#fff" />
                    )}
                    <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
                      Hervat werk
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void zetStatus("gereed")}
                    disabled={statusBezig}
                    style={({ pressed }) => ({
                      flex: 1,
                      backgroundColor: pressed ? "#15803d" : "#16a34a",
                      borderRadius: 12,
                      paddingVertical: 14,
                      flexDirection: "row",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: 6,
                      opacity: statusBezig ? 0.7 : 1,
                    })}
                  >
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                    <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
                      Gereed melden
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : (
            <View
              style={{
                marginHorizontal: 16,
                marginBottom: 16,
                backgroundColor: "#16a34a22",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#16a34a",
                paddingVertical: 14,
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
              <Text style={{ color: "#16a34a", fontSize: 15, fontFamily: "Inter_700Bold" }}>
                Werk voltooid
              </Text>
            </View>
          )}

          {/* ── Project info ──────────────────────────────────────────────── */}
          <Kaart titel="Project">
            <InfoRegel icoon="business-outline" label="Gebouw" waarde={huidigWerkorder.gebouw_naam as string | null} />
            <InfoRegel icoon="folder-outline" label="Project" waarde={huidigWerkorder.project_naam as string | null} />
            <InfoRegel icoon="barcode-outline" label="Werknummer" waarde={huidigWerkorder.werknummer as string | null} />
            <InfoRegel
              icoon="information-circle-outline"
              label="Type"
              waarde={(huidigWerkorder.opdracht_type as string | null) === "meerwerk" ? "Meerwerk" : "Hoofdopdracht"}
            />
          </Kaart>

          {/* ── Locatie & planning ─────────────────────────────────────────── */}
          <Kaart titel="Locatie & planning">
            <InfoRegel icoon="location-outline" label="Locatie / woning / bouwnummer" waarde={huidigWerkorder.locaties as string | null} />
            <InfoRegel
              icoon="calendar-outline"
              label="Datum"
              waarde={
                huidigWerkorder.datum_start === huidigWerkorder.datum_eind
                  ? (huidigWerkorder.datum_start as string | null)
                  : `${huidigWerkorder.datum_start as string} – ${huidigWerkorder.datum_eind as string}`
              }
            />
            <InfoRegel
              icoon="time-outline"
              label="Tijd"
              waarde={
                (huidigWerkorder.tijd_start as string | null)
                  ? `${huidigWerkorder.tijd_start as string}${(huidigWerkorder.tijd_eind as string | null) ? ` – ${huidigWerkorder.tijd_eind as string}` : ""}`
                  : null
              }
            />
            <InfoRegel icoon="hourglass-outline" label="Geplande uren" waarde={(huidigWerkorder.uren as number | null) ? `${huidigWerkorder.uren as number} uur` : null} />
          </Kaart>

          {/* ── Werkzaamheden ──────────────────────────────────────────────── */}
          {(huidigWerkorder.omschrijving ?? huidigWerkorder.dag_notities ?? huidigWerkorder.notities) ? (
            <Kaart titel="Werkzaamheden">
              <InfoRegel icoon="construct-outline" label="Werkzaamheden" waarde={huidigWerkorder.omschrijving as string | null} />
              <InfoRegel icoon="document-text-outline" label="Dagopdracht" waarde={huidigWerkorder.dag_notities as string | null} />
              <InfoRegel icoon="chatbox-outline" label="Opmerkingen" waarde={huidigWerkorder.notities as string | null} />
            </Kaart>
          ) : null}

          {/* ── Meerwerk melden ──────────────────────────────────────────────── */}
          <Kaart titel={meerwerkItems.length > 0 ? `Meerwerk (${meerwerkItems.length})` : "Meerwerk melden"}>
            {meerwerkItems.length > 0 && (
              <View style={{ marginBottom: 12, gap: 8 }}>
                {meerwerkItems.map((item) => {
                  const kleur = item.status === "goedgekeurd" ? "#16a34a"
                    : item.status === "afgewezen" ? "#dc2626"
                    : "#d97706";
                  const label = item.status === "goedgekeurd" ? "Goedgekeurd"
                    : item.status === "afgewezen" ? "Afgewezen"
                    : "In behandeling";
                  return (
                    <View
                      key={item.id}
                      style={{
                        backgroundColor: kleur + "18",
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: kleur + "44",
                        padding: 10,
                        gap: 4,
                      }}
                    >
                      {item.omschrijving ? (
                        <Text style={{ color: c.text, fontSize: 13, fontFamily: "Inter_400Regular" }}>
                          {item.omschrijving}
                        </Text>
                      ) : null}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: kleur }} />
                        <Text style={{ color: kleur, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
                          {label}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
            {toonMeerwerkFormulier ? (
              <View style={{ gap: 10 }}>
                <TextInput
                  value={meerwerkTekst}
                  onChangeText={setMeerwerkTekst}
                  placeholder="Omschrijf het meerwerk..."
                  placeholderTextColor={c.mutedForeground}
                  multiline
                  numberOfLines={3}
                  style={{
                    backgroundColor: c.background,
                    borderWidth: 1,
                    borderColor: c.border,
                    borderRadius: 8,
                    padding: 10,
                    color: c.text,
                    fontSize: 14,
                    fontFamily: "Inter_400Regular",
                    minHeight: 72,
                    textAlignVertical: "top",
                  }}
                />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    onPress={() => { setToonMeerwerkFormulier(false); setMeerwerkTekst(""); }}
                    style={{ flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingVertical: 10, alignItems: "center" }}
                  >
                    <Text style={{ color: c.mutedForeground, fontSize: 14, fontFamily: "Inter_500Medium" }}>Annuleren</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void indienMeerwerk()}
                    disabled={meerwerkBezig || !meerwerkTekst.trim()}
                    style={{
                      flex: 2,
                      backgroundColor: meerwerkBezig || !meerwerkTekst.trim() ? c.muted : c.tint,
                      borderRadius: 8,
                      paddingVertical: 10,
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    {meerwerkBezig && <ActivityIndicator size="small" color="#fff" />}
                    <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" }}>Indienen</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => setToonMeerwerkFormulier(true)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: pressed ? c.tint : c.border,
                  borderRadius: 8,
                  padding: 12,
                })}
              >
                <Ionicons name="add-circle-outline" size={18} color={c.tint} />
                <Text style={{ color: c.tint, fontSize: 14, fontFamily: "Inter_500Medium" }}>
                  Meerwerk melden
                </Text>
              </Pressable>
            )}
          </Kaart>

          {/* ── Uitvoerend personeel ───────────────────────────────────────── */}
          {(huidigWerkorder.medewerker_naam as string | null) ? (
            <Kaart titel="Uitvoerend personeel">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: c.accent + "33",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Ionicons name="person" size={16} color={c.tint} />
                </View>
                <Text style={{ color: c.text, fontSize: 14, fontFamily: "Inter_500Medium" }}>
                  {huidigWerkorder.medewerker_naam as string}
                </Text>
              </View>
            </Kaart>
          ) : null}

          {/* ── Foto's (offline-first) ─────────────────────────────────────── */}
          <Kaart titel={`Foto's${lokaleFotos.length > 0 ? ` (${lokaleFotos.length})` : ""}`}>
            {lokaleFotos.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {lokaleFotos.map((pad) => (
                  <View key={pad} style={{ position: "relative" }}>
                    <Image
                      source={{ uri: pad }}
                      style={{ width: 90, height: 90, borderRadius: 8, backgroundColor: c.muted }}
                      resizeMode="cover"
                    />
                    <View
                      style={{
                        position: "absolute",
                        bottom: 4,
                        right: 4,
                        backgroundColor: "rgba(0,0,0,0.55)",
                        borderRadius: 6,
                        paddingHorizontal: 5,
                        paddingVertical: 2,
                      }}
                    >
                      <Text style={{ color: "#fff", fontSize: 9, fontFamily: "Inter_500Medium" }}>Lokaal</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: c.border,
                  borderStyle: "dashed",
                  borderRadius: 8,
                  padding: 20,
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <Ionicons name="camera-outline" size={26} color={c.mutedForeground} />
                <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 6 }}>
                  Nog geen foto's toegevoegd
                </Text>
              </View>
            )}
            <Pressable
              onPress={() => void voegFotoToe()}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                backgroundColor: pressed ? c.muted : c.accent,
                borderRadius: 10,
                paddingVertical: 10,
              })}
            >
              <Ionicons name="camera-outline" size={16} color={c.primary} />
              <Text style={{ color: c.primary, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                Foto toevoegen
              </Text>
            </Pressable>
            {!isOnline && (
              <Text style={{ color: c.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 6, textAlign: "center" }}>
                Foto's worden lokaal opgeslagen en gesynchroniseerd bij verbinding
              </Text>
            )}
          </Kaart>

          {/* ── Materiaal melden ──────────────────────────────────────────── */}
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/materiaal-aanvraag/nieuw",
                params: {
                  werkdag_id: String(id),
                  titel: String(huidigWerkorder.titel ?? ""),
                  werknummer: String((huidigWerkorder.werknummer as string | null) ?? ""),
                },
              })
            }
            style={({ pressed }) => ({
              backgroundColor: pressed ? c.muted : c.card,
              borderRadius: 12,
              padding: 16,
              marginBottom: 12,
              marginHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            })}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                backgroundColor: "#d9770622",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="bag-add-outline" size={18} color="#d97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                Materiaal melden
              </Text>
              <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 }}>
                Artikel op, beschadigd of nodig
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={c.mutedForeground} />
          </Pressable>

          {/* ── Digitale Uitvoerder ───────────────────────────────────────── */}
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/uitvoerder/[sessie_id]",
                params: {
                  sessie_id: "nieuw",
                  werkdag_id: String(id),
                  titel: String(huidigWerkorder.titel ?? ""),
                  werknummer: String((huidigWerkorder.werknummer as string | null) ?? ""),
                },
              })
            }
            style={({ pressed }) => ({
              backgroundColor: pressed ? c.muted : c.card,
              borderRadius: 12,
              padding: 16,
              marginBottom: 12,
              marginHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            })}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                backgroundColor: `${c.primary}22`,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="sparkles" size={18} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                Digitale Uitvoerder
              </Text>
              <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 }}>
                AI meedenken over aanpak en uitvoering
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={c.mutedForeground} />
          </Pressable>

          {/* ── Adaptieve gids ─────────────────────────────────────────────── */}
          {!!(huidigWerkorder.opdracht_id as number | null) && (
            <Pressable
              onPress={() =>
                router.push(`/uitvoering/${huidigWerkorder.opdracht_id as number}` as any)
              }
              style={({ pressed }) => ({
                backgroundColor: pressed ? c.muted : c.card,
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
                marginHorizontal: 16,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              })}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  backgroundColor: `${c.primary}22`,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons name="map-outline" size={18} color={c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                  Start adaptieve gids
                </Text>
                <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 }}>
                  AI-gestuurde stap-voor-stap uitvoering
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.mutedForeground} />
            </Pressable>
          )}

          {/* ── Voertuig melden ────────────────────────────────────────────── */}
          <Pressable
            onPress={() => router.push("/voertuig-melding")}
            style={({ pressed }) => ({
              backgroundColor: pressed ? c.muted : c.card,
              borderRadius: 12,
              padding: 16,
              marginBottom: 12,
              marginHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            })}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                backgroundColor: "#fef3c722",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="car-outline" size={18} color="#d97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                Voertuig melden
              </Text>
              <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 }}>
                Storing of schade doorgeven
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={c.mutedForeground} />
          </Pressable>

          {/* ── Tijdregistratie ────────────────────────────────────────────── */}
          <Pressable
            onPress={() => router.push("/uren")}
            style={({ pressed }) => ({
              backgroundColor: pressed ? c.muted : c.card,
              borderRadius: 12,
              padding: 16,
              marginBottom: 12,
              marginHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            })}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                backgroundColor: c.accent,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="stopwatch-outline" size={18} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                Tijdregistratie
              </Text>
              <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 }}>
                Uren bijhouden voor vandaag
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={c.mutedForeground} />
          </Pressable>

          {/* ── Oplevering / handtekening ──────────────────────────────────── */}
          <Kaart titel="Oplevering">
            <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 14 }}>
              Laat de opdrachtgever of contactpersoon hieronder tekenen ter bevestiging van de uitgevoerde werkzaamheden.
            </Text>
            <HandtekeningPad
              breedte={320}
              hoogte={160}
              opgeslagen={handtekeningOpgeslagen}
              bezig={handtekeningBezig}
              onOpgeslagen={(svg) => void slaHandtekeningOp(svg)}
              onWissen={() => setHandtekeningOpgeslagen(false)}
            />
            {handtekeningOpgeslagen && !isOnline ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 8,
                  backgroundColor: "rgba(234,179,8,0.1)",
                  borderRadius: 8,
                  padding: 10,
                }}
              >
                <Ionicons name="time-outline" size={14} color="#facc15" />
                <Text style={{ color: "#facc15", fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 }}>
                  Handtekening lokaal opgeslagen — wordt gesynchroniseerd bij verbinding
                </Text>
              </View>
            ) : null}
          </Kaart>
        </ScrollView>
      ) : null}
    </View>
  );
}
