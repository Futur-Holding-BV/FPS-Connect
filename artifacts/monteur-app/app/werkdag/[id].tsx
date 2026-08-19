import { API_DOMEIN } from "@/lib/apiDomein";
import {
  useGetWerkdagItem,
  useUpdateWerkdagItemStatus,
  useListPlanningMeerwerk,
  useCreatePlanningMeerwerk,
} from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
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

import { ruimte } from "@workspace/ontwerp";

import { HandtekeningPad } from "@/components/HandtekeningPad";
import { OfflineBanner } from "@/components/OfflineBanner";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import {
  bovenInset,
  Kaart as UiKaart,
  Ladenstaat,
  netteWaarde,
  Statusmerk,
  tekstStijl,
} from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useOffline } from "@/context/offline";
import { useSync } from "@/context/sync";
import { useColors } from "@/hooks/useColors";
import {
  leesWerkorder,
  patchWerkorderStatusLokaal,
} from "@/lib/offlineCache";
import { voegToeAanWachtrij } from "@/lib/syncQueue";
import { bewaarBestandUitUri, documentMap, lijstMap, maakMap, resolveDisplayUri, schrijfTekstBestand } from "@/lib/bestanden";

const UITVOERING_LABEL: Record<string, string> = {
  gepland: "Gepland",
  bezig: "In uitvoering",
  pauze: "Pauze",
  gereed: "Gereed",
};

// Statussen → soort Statusmerk (kleur komt uit het palet, niet uit dit bestand).
const UITVOERING_SOORT: Record<string, "neutraal" | "succes" | "waarschuwing" | "fout" | "primair"> = {
  gepland: "neutraal",
  bezig: "primair",
  pauze: "waarschuwing",
  gereed: "succes",
};

// Meerwerk-status → soort Statusmerk.
const MEERWERK_SOORT: Record<string, "neutraal" | "succes" | "waarschuwing" | "fout" | "primair"> = {
  goedgekeurd: "succes",
  afgewezen: "fout",
};

const MEERWERK_LABEL: Record<string, string> = {
  goedgekeurd: "Goedgekeurd",
  afgewezen: "Afgewezen",
  ingediend: "In behandeling",
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
    <View style={{ flexDirection: "row", alignItems: "flex-start", paddingVertical: ruimte.s, gap: ruimte.m }}>
      <Ionicons name={icoon} size={ruimte.l} color={c.mutedForeground} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text
          style={[
            tekstStijl("bijschrift", c.mutedForeground),
            { letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 2 },
          ]}
        >
          {label}
        </Text>
        <Text style={tekstStijl("standaard", kleur ?? c.foreground)}>
          {waarde}
        </Text>
      </View>
    </View>
  );
}

function Kaart({ titel, children }: { titel: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <UiKaart stijl={{ marginBottom: ruimte.m, marginHorizontal: ruimte.l }}>
      <Text
        style={[tekstStijl("nadruk", c.foreground), { marginBottom: ruimte.s }]}
      >
        {titel}
      </Text>
      {children}
    </UiKaart>
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
  const [displayUris, setDisplayUris] = useState<Record<string, string>>({});
  const [handtekeningOpgeslagen, setHandtekeningOpgeslagen] = useState(false);
  const [handtekeningBezig, setHandtekeningBezig] = useState(false);
  const fotoMapGemaakt = useRef(false);
  const [toonMeerwerkFormulier, setToonMeerwerkFormulier] = useState(false);
  const [meerwerkTekst, setMeerwerkTekst] = useState("");
  const [meerwerkBezig, setMeerwerkBezig] = useState(false);
  const [openKwartaalCyclus, setOpenKwartaalCyclus] = useState<{
    id: number;
    deadline: string | null;
    voertuig_kenteken: string | null;
  } | null>(null);

  if (!token) return <Redirect href="/login" />;

  const id = parseInt(idParam ?? "0", 10);
  const fotoDir = documentMap(`werkdag-fotos/${id}`);

  const { data: werkorder, isLoading, isError, refetch } = useGetWerkdagItem(id);
  const [gecachedWerkorder, setGecachedWerkorder] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!isOnline || (!werkorder && isError)) {
      leesWerkorder(id).then((cached) => {
        if (cached) setGecachedWerkorder(cached as Record<string, unknown>);
      });
    }
  }, [isOnline, id, werkorder, isError]);

  // Laad lokale foto's uit de bestandslaag bij start
  useEffect(() => {
    lijstMap(fotoDir).then((paden) => {
      if (paden.length > 0) setLokaleFotos(paden);
    });
  }, [fotoDir]);

  // Zet idb://-paden om naar blob-URLs voor weergave in <Image>
  useEffect(() => {
    let actief = true;
    void Promise.all(
      lokaleFotos.map(async (pad) => {
        const uri = await resolveDisplayUri(pad);
        return [pad, uri] as const;
      }),
    ).then((paren) => {
      if (!actief) return;
      setDisplayUris(Object.fromEntries(paren));
    });
    return () => { actief = false; };
  }, [lokaleFotos]);

  // Check of er een open kwartaalcontrole-cyclus klaarstaat voor dit voertuig
  useEffect(() => {
    if (!token || !isOnline) return;
    const basis = `https://${API_DOMEIN}`;
    void fetch(`${basis}/api/wagenpark/kwartaalcontrole/mijn`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (data: { id: number; deadline: string | null; voertuig_kenteken: string | null } | null) => {
          if (data?.id) setOpenKwartaalCyclus(data);
        },
      )
      .catch(() => undefined);
  }, [token, isOnline]);

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
      await maakMap(fotoDir);
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
    const doel = await bewaarBestandUitUri(result.assets[0].uri, fotoDir, bestandsnaam);
    setLokaleFotos((prev) => [...prev, doel]);
  }

  async function slaHandtekeningOp(svgData: string) {
    setHandtekeningBezig(true);
    try {
      const pad = await schrijfTekstBestand(
        documentMap("werkdag-handtekeningen"),
        `werkdag_${id}.svg`,
        svgData,
      );
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
          paddingTop: bovenInset(insets) + ruimte.s,
          paddingHorizontal: ruimte.l,
          paddingBottom: ruimte.m + 2,
          backgroundColor: c.dark,
          flexDirection: "row",
          alignItems: "center",
          gap: ruimte.m,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: ruimte.xs }}>
          <Ionicons name="arrow-back" size={22} color={c.darkForeground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={tekstStijl("sectiekop", c.darkForeground)}
            numberOfLines={1}
          >
            {isLoading && !huidigWerkorder
              ? "Laden…"
              : (huidigWerkorder?.project_naam ?? huidigWerkorder?.titel ?? "Werkorder")}
          </Text>
          {huidigWerkorder?.werknummer ? (
            <Text style={tekstStijl("klein", c.darkMuted)}>
              #{huidigWerkorder.werknummer}
            </Text>
          ) : null}
        </View>
        {huidigWerkorder ? (
          <Statusmerk
            label={UITVOERING_LABEL[uitvoeringStatus] ?? netteWaarde(uitvoeringStatus)}
            soort={UITVOERING_SOORT[uitvoeringStatus] ?? "neutraal"}
          />
        ) : null}
      </View>

      <OfflineBanner stijl="compact" />
      <View style={{ paddingHorizontal: ruimte.l, paddingVertical: ruimte.s }}>
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
            backgroundColor: c.secondary,
            paddingHorizontal: ruimte.l,
            paddingVertical: ruimte.xs + 2,
            flexDirection: "row",
            alignItems: "center",
            gap: ruimte.xs + 2,
          }}
        >
          <Ionicons name="time-outline" size={ruimte.m + 1} color={c.warning} />
          <Text style={tekstStijl("bijschrift", c.warning)}>
            Gegevens uit lokale cache
          </Text>
        </View>
      ) : null}

      {/* Inhoud */}
      {isLoading && !huidigWerkorder ? (
        <View style={{ flex: 1, padding: ruimte.l }}>
          <Ladenstaat regels={5} />
        </View>
      ) : (isError && !huidigWerkorder) ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: ruimte.xxl }}>
          <Ionicons name="alert-circle-outline" size={40} color={c.mutedForeground} />
          <Text
            style={[tekstStijl("standaard", c.mutedForeground), { textAlign: "center", marginTop: ruimte.m }]}
          >
            {isOnline
              ? "Werkorder niet gevonden of geen toegang."
              : "Geen verbinding en geen lokale cache beschikbaar."}
          </Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: ruimte.l }}>
            <Text style={tekstStijl("nadruk", c.tint)}>Terug</Text>
          </Pressable>
        </View>
      ) : huidigWerkorder ? (
        <ScrollView contentContainerStyle={{ paddingTop: ruimte.l, paddingBottom: ruimte.xxl + ruimte.l }}>

          {/* ── Statusknopen ─────────────────────────────────────────────── */}
          {uitvoeringStatus !== "gereed" ? (
            <View style={{ marginHorizontal: ruimte.l, marginBottom: ruimte.l, gap: ruimte.s + 2 }}>
              {uitvoeringStatus === "gepland" ? (
                <Pressable
                  onPress={() => void zetStatus("bezig")}
                  disabled={statusBezig}
                  style={({ pressed }) => ({
                    backgroundColor: c.tint,
                    borderRadius: c.radius,
                    paddingVertical: ruimte.l,
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: ruimte.s,
                    opacity: statusBezig ? 0.7 : pressed ? 0.85 : 1,
                  })}
                >
                  {statusBezig ? (
                    <ActivityIndicator color={c.primaryForeground} size="small" />
                  ) : (
                    <Ionicons name="play-circle" size={20} color={c.primaryForeground} />
                  )}
                  <Text style={tekstStijl("sectiekop", c.primaryForeground)}>
                    Start werk{!isOnline ? " (offline)" : ""}
                  </Text>
                </Pressable>
              ) : null}

              {uitvoeringStatus === "bezig" ? (
                <View style={{ flexDirection: "row", gap: ruimte.s + 2 }}>
                  <Pressable
                    onPress={() => void zetStatus("pauze")}
                    disabled={statusBezig}
                    style={({ pressed }) => ({
                      flex: 1,
                      backgroundColor: c.warning,
                      borderRadius: c.radius,
                      paddingVertical: ruimte.m + 2,
                      flexDirection: "row",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: ruimte.xs + 2,
                      opacity: statusBezig ? 0.7 : pressed ? 0.85 : 1,
                    })}
                  >
                    <Ionicons name="pause-circle" size={18} color={c.warningForeground} />
                    <Text style={tekstStijl("nadruk", c.warningForeground)}>
                      Pauze
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void zetStatus("gereed")}
                    disabled={statusBezig}
                    style={({ pressed }) => ({
                      flex: 1,
                      backgroundColor: c.success,
                      borderRadius: c.radius,
                      paddingVertical: ruimte.m + 2,
                      flexDirection: "row",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: ruimte.xs + 2,
                      opacity: statusBezig ? 0.7 : pressed ? 0.85 : 1,
                    })}
                  >
                    <Ionicons name="checkmark-circle" size={18} color={c.successForeground} />
                    <Text style={tekstStijl("nadruk", c.successForeground)}>
                      Gereed melden
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {uitvoeringStatus === "pauze" ? (
                <View style={{ flexDirection: "row", gap: ruimte.s + 2 }}>
                  <Pressable
                    onPress={() => void zetStatus("bezig")}
                    disabled={statusBezig}
                    style={({ pressed }) => ({
                      flex: 1,
                      backgroundColor: c.tint,
                      borderRadius: c.radius,
                      paddingVertical: ruimte.m + 2,
                      flexDirection: "row",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: ruimte.xs + 2,
                      opacity: statusBezig ? 0.7 : pressed ? 0.85 : 1,
                    })}
                  >
                    {statusBezig ? (
                      <ActivityIndicator color={c.primaryForeground} size="small" />
                    ) : (
                      <Ionicons name="play-circle" size={18} color={c.primaryForeground} />
                    )}
                    <Text style={tekstStijl("nadruk", c.primaryForeground)}>
                      Hervat werk
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void zetStatus("gereed")}
                    disabled={statusBezig}
                    style={({ pressed }) => ({
                      flex: 1,
                      backgroundColor: c.success,
                      borderRadius: c.radius,
                      paddingVertical: ruimte.m + 2,
                      flexDirection: "row",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: ruimte.xs + 2,
                      opacity: statusBezig ? 0.7 : pressed ? 0.85 : 1,
                    })}
                  >
                    <Ionicons name="checkmark-circle" size={18} color={c.successForeground} />
                    <Text style={tekstStijl("nadruk", c.successForeground)}>
                      Gereed melden
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : (
            <View
              style={{
                marginHorizontal: ruimte.l,
                marginBottom: ruimte.l,
                backgroundColor: c.secondary,
                borderRadius: c.radius,
                borderWidth: 1,
                borderColor: c.success,
                paddingVertical: ruimte.m + 2,
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: ruimte.s,
              }}
            >
              <Ionicons name="checkmark-circle" size={20} color={c.success} />
              <Text style={tekstStijl("nadruk", c.success)}>
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
              <View style={{ marginBottom: ruimte.m, gap: ruimte.s }}>
                {meerwerkItems.map((item) => (
                  <View
                    key={item.id}
                    style={{
                      backgroundColor: c.secondary,
                      borderRadius: c.radius / 2,
                      borderWidth: 1,
                      borderColor: c.border,
                      padding: ruimte.s + 2,
                      gap: ruimte.xs,
                    }}
                  >
                    {item.omschrijving ? (
                      <Text style={tekstStijl("klein", c.foreground)}>
                        {item.omschrijving}
                      </Text>
                    ) : null}
                    <Statusmerk
                      label={MEERWERK_LABEL[item.status] ?? netteWaarde(item.status)}
                      soort={MEERWERK_SOORT[item.status] ?? "waarschuwing"}
                    />
                  </View>
                ))}
              </View>
            )}
            {toonMeerwerkFormulier ? (
              <View style={{ gap: ruimte.s + 2 }}>
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
                    borderRadius: c.radius / 2,
                    padding: ruimte.s + 2,
                    color: c.foreground,
                    fontSize: 14,
                    fontFamily: "Inter_400Regular",
                    minHeight: 72,
                    textAlignVertical: "top",
                  }}
                />
                <View style={{ flexDirection: "row", gap: ruimte.s }}>
                  <Pressable
                    onPress={() => { setToonMeerwerkFormulier(false); setMeerwerkTekst(""); }}
                    style={{ flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: c.radius / 2, paddingVertical: ruimte.s + 2, alignItems: "center" }}
                  >
                    <Text style={tekstStijl("standaard", c.mutedForeground)}>Annuleren</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void indienMeerwerk()}
                    disabled={meerwerkBezig || !meerwerkTekst.trim()}
                    style={{
                      flex: 2,
                      backgroundColor: meerwerkBezig || !meerwerkTekst.trim() ? c.muted : c.tint,
                      borderRadius: c.radius / 2,
                      paddingVertical: ruimte.s + 2,
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: ruimte.xs + 2,
                    }}
                  >
                    {meerwerkBezig && <ActivityIndicator size="small" color={c.primaryForeground} />}
                    <Text style={tekstStijl("standaard", c.primaryForeground)}>Indienen</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => setToonMeerwerkFormulier(true)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: ruimte.s + 2,
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: pressed ? c.tint : c.border,
                  borderRadius: c.radius / 2,
                  padding: ruimte.m,
                })}
              >
                <Ionicons name="add-circle-outline" size={18} color={c.tint} />
                <Text style={tekstStijl("standaard", c.tint)}>
                  Meerwerk melden
                </Text>
              </Pressable>
            )}
          </Kaart>

          {/* ── Uitvoerend personeel ───────────────────────────────────────── */}
          {(huidigWerkorder.medewerker_naam as string | null) ? (
            <Kaart titel="Uitvoerend personeel">
              <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.s + 2 }}>
                <View
                  style={{
                    width: ruimte.xxl,
                    height: ruimte.xxl,
                    borderRadius: ruimte.l,
                    backgroundColor: c.accent,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Ionicons name="person" size={ruimte.l} color={c.tint} />
                </View>
                <Text style={tekstStijl("standaard", c.foreground)}>
                  {huidigWerkorder.medewerker_naam as string}
                </Text>
              </View>
            </Kaart>
          ) : null}

          {/* ── Foto's (offline-first) ─────────────────────────────────────── */}
          <Kaart titel={`Foto's${lokaleFotos.length > 0 ? ` (${lokaleFotos.length})` : ""}`}>
            {lokaleFotos.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: ruimte.s, marginBottom: ruimte.s + 2 }}>
                {lokaleFotos.map((pad) => (
                  <View key={pad} style={{ position: "relative" }}>
                    <Image
                      source={{ uri: displayUris[pad] ?? pad }}
                      style={{ width: 90, height: 90, borderRadius: c.radius / 2, backgroundColor: c.muted }}
                      resizeMode="cover"
                    />
                    <View
                      style={{
                        position: "absolute",
                        bottom: ruimte.xs,
                        right: ruimte.xs,
                        backgroundColor: c.dark,
                        borderRadius: c.radius / 2,
                        paddingHorizontal: ruimte.xs + 1,
                        paddingVertical: 2,
                      }}
                    >
                      <Text style={tekstStijl("bijschrift", c.darkForeground)}>Lokaal</Text>
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
                  borderRadius: c.radius / 2,
                  padding: ruimte.l + ruimte.xs,
                  alignItems: "center",
                  marginBottom: ruimte.s + 2,
                }}
              >
                <Ionicons name="camera-outline" size={ruimte.xl} color={c.mutedForeground} />
                <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: ruimte.xs + 2 }]}>
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
                gap: ruimte.xs + 2,
                backgroundColor: pressed ? c.muted : c.accent,
                borderRadius: c.radius / 2,
                paddingVertical: ruimte.s + 2,
              })}
            >
              <Ionicons name="camera-outline" size={ruimte.l} color={c.primary} />
              <Text style={tekstStijl("nadruk", c.primary)}>
                Foto toevoegen
              </Text>
            </Pressable>
            {!isOnline && (
              <Text style={[tekstStijl("bijschrift", c.mutedForeground), { marginTop: ruimte.xs + 2, textAlign: "center" }]}>
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
              borderRadius: c.radius,
              padding: ruimte.l,
              marginBottom: ruimte.m,
              marginHorizontal: ruimte.l,
              flexDirection: "row",
              alignItems: "center",
              gap: ruimte.m,
            })}
          >
            <View
              style={{
                width: ruimte.xxl + ruimte.xs,
                height: ruimte.xxl + ruimte.xs,
                borderRadius: c.radius / 2,
                backgroundColor: c.secondary,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="bag-add-outline" size={18} color={c.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={tekstStijl("nadruk", c.foreground)}>
                Materiaal melden
              </Text>
              <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 1 }]}>
                Voor de opdracht — op, beschadigd of nodig
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={ruimte.l} color={c.mutedForeground} />
          </Pressable>

          {/* ── Toebehoren gereedschap ────────────────────────────────────── */}
          <Pressable
            onPress={() => router.push("/materiaal-aanvraag/toebehoren")}
            style={({ pressed }) => ({
              backgroundColor: pressed ? c.muted : c.card,
              borderRadius: c.radius,
              padding: ruimte.l,
              marginBottom: ruimte.m,
              marginHorizontal: ruimte.l,
              flexDirection: "row",
              alignItems: "center",
              gap: ruimte.m,
            })}
          >
            <View
              style={{
                width: ruimte.xxl + ruimte.xs,
                height: ruimte.xxl + ruimte.xs,
                borderRadius: c.radius / 2,
                backgroundColor: c.accent,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="build-outline" size={18} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={tekstStijl("nadruk", c.foreground)}>
                Toebehoren gereedschap
              </Text>
              <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 1 }]}>
                Verbruik — zaagjes, boortjes, schijven
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={ruimte.l} color={c.mutedForeground} />
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
              borderRadius: c.radius,
              padding: ruimte.l,
              marginBottom: ruimte.m,
              marginHorizontal: ruimte.l,
              flexDirection: "row",
              alignItems: "center",
              gap: ruimte.m,
            })}
          >
            <View
              style={{
                width: ruimte.xxl + ruimte.xs,
                height: ruimte.xxl + ruimte.xs,
                borderRadius: c.radius / 2,
                backgroundColor: c.accent,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="sparkles" size={18} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={tekstStijl("nadruk", c.foreground)}>
                Digitale Uitvoerder
              </Text>
              <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 1 }]}>
                AI meedenken over aanpak en uitvoering
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={ruimte.l} color={c.mutedForeground} />
          </Pressable>

          {/* ── Adaptieve gids ─────────────────────────────────────────────── */}
          {!!(huidigWerkorder.opdracht_id as number | null) && (
            <Pressable
              onPress={() =>
                router.push(`/uitvoering/${huidigWerkorder.opdracht_id as number}` as any)
              }
              style={({ pressed }) => ({
                backgroundColor: pressed ? c.muted : c.card,
                borderRadius: c.radius,
                padding: ruimte.l,
                marginBottom: ruimte.m,
                marginHorizontal: ruimte.l,
                flexDirection: "row",
                alignItems: "center",
                gap: ruimte.m,
              })}
            >
              <View
                style={{
                  width: ruimte.xxl + ruimte.xs,
                  height: ruimte.xxl + ruimte.xs,
                  borderRadius: c.radius / 2,
                  backgroundColor: c.accent,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons name="map-outline" size={18} color={c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={tekstStijl("nadruk", c.foreground)}>
                  Start adaptieve gids
                </Text>
                <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 1 }]}>
                  AI-gestuurde stap-voor-stap uitvoering
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={ruimte.l} color={c.mutedForeground} />
            </Pressable>
          )}

          {/* ── Kwartaalcontrole (nudge als er een open cyclus is) ──────── */}
          {openKwartaalCyclus && (
            <Pressable
              onPress={() => router.push("/kwartaalcontrole" as Parameters<typeof router.push>[0])}
              style={({ pressed }) => ({
                backgroundColor: pressed ? c.muted : c.secondary,
                borderRadius: c.radius,
                padding: ruimte.l,
                marginBottom: ruimte.m,
                marginHorizontal: ruimte.l,
                flexDirection: "row",
                alignItems: "center",
                gap: ruimte.m,
                borderWidth: 1.5,
                borderColor: c.warning,
              })}
            >
              <View
                style={{
                  width: ruimte.xxl + ruimte.xs,
                  height: ruimte.xxl + ruimte.xs,
                  borderRadius: c.radius / 2,
                  backgroundColor: c.card,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons name="clipboard-outline" size={18} color={c.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={tekstStijl("nadruk", c.warning)}>
                  Kwartaalcontrole uitvoeren
                </Text>
                <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 1 }]}>
                  {openKwartaalCyclus.voertuig_kenteken
                    ? `Verplicht voor ${openKwartaalCyclus.voertuig_kenteken}`
                    : "Verplichte dashboardfoto en kilometerstand"}
                </Text>
              </View>
              <Ionicons name="alert-circle" size={18} color={c.warning} />
            </Pressable>
          )}

          {/* ── Voertuig melden ────────────────────────────────────────────── */}
          <Pressable
            onPress={() => router.push("/voertuig-melding")}
            style={({ pressed }) => ({
              backgroundColor: pressed ? c.muted : c.card,
              borderRadius: c.radius,
              padding: ruimte.l,
              marginBottom: ruimte.m,
              marginHorizontal: ruimte.l,
              flexDirection: "row",
              alignItems: "center",
              gap: ruimte.m,
            })}
          >
            <View
              style={{
                width: ruimte.xxl + ruimte.xs,
                height: ruimte.xxl + ruimte.xs,
                borderRadius: c.radius / 2,
                backgroundColor: c.secondary,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="car-outline" size={18} color={c.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={tekstStijl("nadruk", c.foreground)}>
                Voertuig melden
              </Text>
              <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 1 }]}>
                Storing of schade doorgeven
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={ruimte.l} color={c.mutedForeground} />
          </Pressable>

          {/* ── Tijdregistratie ────────────────────────────────────────────── */}
          <Pressable
            onPress={() => router.push("/uren")}
            style={({ pressed }) => ({
              backgroundColor: pressed ? c.muted : c.card,
              borderRadius: c.radius,
              padding: ruimte.l,
              marginBottom: ruimte.m,
              marginHorizontal: ruimte.l,
              flexDirection: "row",
              alignItems: "center",
              gap: ruimte.m,
            })}
          >
            <View
              style={{
                width: ruimte.xxl + ruimte.xs,
                height: ruimte.xxl + ruimte.xs,
                borderRadius: c.radius / 2,
                backgroundColor: c.accent,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="stopwatch-outline" size={18} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={tekstStijl("nadruk", c.foreground)}>
                Tijdregistratie
              </Text>
              <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 1 }]}>
                Uren bijhouden voor vandaag
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={ruimte.l} color={c.mutedForeground} />
          </Pressable>

          {/* ── Oplevering / handtekening ──────────────────────────────────── */}
          <Kaart titel="Oplevering">
            <Text style={[tekstStijl("klein", c.mutedForeground), { marginBottom: ruimte.m + 2 }]}>
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
                  gap: ruimte.xs + 2,
                  marginTop: ruimte.s,
                  backgroundColor: c.secondary,
                  borderRadius: c.radius / 2,
                  padding: ruimte.s + 2,
                }}
              >
                <Ionicons name="time-outline" size={ruimte.m + 2} color={c.warning} />
                <Text style={[tekstStijl("klein", c.warning), { flex: 1 }]}>
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
