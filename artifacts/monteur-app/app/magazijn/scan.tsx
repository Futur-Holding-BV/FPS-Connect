import {
  listArtikelen,
  useCreateMagazijnVerplaatsing,
  useCreateRetour,
  useCreateUitgifte,
  useGetMagazijnArtikel,
  useListMagazijnLocaties,
  useListOpdrachten,
  useListVoorraadTotaal,
} from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";

type Modus = "scan" | "resultaat";
type Actie = "uitgifte" | "retour" | "verplaatsen";
type PickerType = "opdracht" | "van_locatie" | "naar_locatie";

const EENHEID_LABELS: Record<string, string> = {
  st: "stuks", m: "meter", m2: "m\u00b2", m3: "m\u00b3",
  uur: "uur", kg: "kg", set: "set",
};
function eenheidLabel(e: string | null | undefined) {
  return e ? (EENHEID_LABELS[e] ?? e) : "";
}

type LocatieItem = { id: number; naam: string; type: string; actief: boolean };
type OpdrachtItem = { id: number; titel: string; werknummer?: string | null; status: string; gebouw_naam?: string | null };

function PickerModal({
  zichtbaar,
  onSluit,
  titel,
  items,
  onKies,
  gekozenId,
  leegLabel,
}: {
  zichtbaar: boolean;
  onSluit: () => void;
  titel: string;
  items: { id: number | null; label: string; subtitel?: string }[];
  onKies: (id: number | null, label: string) => void;
  gekozenId: number | null;
  leegLabel?: string;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={zichtbaar} transparent animationType="slide" onRequestClose={onSluit}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} onPress={onSluit} />
      <View
        style={{
          backgroundColor: c.card,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingBottom: insets.bottom + 8,
          maxHeight: "70%",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: c.border,
          }}
        >
          <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: c.text }}>{titel}</Text>
          <Pressable onPress={onSluit} hitSlop={12}>
            <Ionicons name="close" size={22} color={c.mutedForeground} />
          </Pressable>
        </View>
        <FlatList
          data={leegLabel ? [{ id: null, label: leegLabel }, ...items] : items}
          keyExtractor={(item) => String(item.id)}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => { onKies(item.id as number | null, item.label); onSluit(); }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 20,
                paddingVertical: 14,
                backgroundColor: pressed ? c.muted : c.card,
                borderBottomWidth: 1,
                borderBottomColor: c.border,
                gap: 12,
              })}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: c.text }}>
                  {item.label}
                </Text>
                {item.subtitel ? (
                  <Text style={{ fontSize: 12, color: c.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 1 }}>
                    {item.subtitel}
                  </Text>
                ) : null}
              </View>
              {gekozenId === item.id ? (
                <Ionicons name="checkmark-circle" size={20} color={c.primary} />
              ) : null}
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

function KeuzeBalk({
  label,
  waarde,
  placeholder,
  onPress,
  verplicht,
}: {
  label: string;
  waarde: string | null;
  placeholder: string;
  onPress: () => void;
  verplicht?: boolean;
}) {
  const c = useColors();
  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontSize: 12,
          fontFamily: "Inter_600SemiBold",
          color: c.mutedForeground,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 6,
        }}
      >
        {label}
        {verplicht ? (
          <Text style={{ color: "#dc2626" }}> *</Text>
        ) : (
          <Text style={{ color: c.mutedForeground }}> (optioneel)</Text>
        )}
      </Text>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 1,
          borderColor: waarde ? c.primary : c.border,
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 12,
          backgroundColor: pressed ? c.muted : (waarde ? "#fff7f5" : c.card),
          gap: 10,
        })}
      >
        <Text
          style={{
            flex: 1,
            fontSize: 14,
            fontFamily: waarde ? "Inter_600SemiBold" : "Inter_400Regular",
            color: waarde ? c.text : c.mutedForeground,
          }}
          numberOfLines={1}
        >
          {waarde ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={c.mutedForeground} />
      </Pressable>
    </View>
  );
}

function ArtikelKaart({
  artikelId,
  onSluit,
}: {
  artikelId: number;
  onSluit: () => void;
}) {
  const c = useColors();
  const uitgifte = useCreateUitgifte();
  const retour = useCreateRetour();
  const verplaatsen = useCreateMagazijnVerplaatsing();
  const { data: artikel, isLoading: artikelLaden } = useGetMagazijnArtikel(artikelId);
  const { data: voorraadLijst } = useListVoorraadTotaal();
  const { data: locatiesRaw } = useListMagazijnLocaties();
  const { data: opdrachtenRaw } = useListOpdrachten({ status: "actief" } as Parameters<typeof useListOpdrachten>[0]);

  const locaties = ((locatiesRaw ?? []) as LocatieItem[]).filter((l) => l.actief);
  const opdrachten = (opdrachtenRaw ?? []) as OpdrachtItem[];

  const [actie, setActie] = useState<Actie>("uitgifte");
  const [hoeveelheid, setHoeveelheid] = useState("1");
  const [bezig, setBezig] = useState(false);
  const [pickerType, setPickerType] = useState<PickerType | null>(null);

  const [opdrachtId, setOpdrachtId] = useState<number | null>(null);
  const [opdrachtNaam, setOpdrachtNaam] = useState<string | null>(null);
  const [vanLocatieId, setVanLocatieId] = useState<number | null>(null);
  const [vanLocatieNaam, setVanLocatieNaam] = useState<string | null>(null);
  const [naarLocatieId, setNaarLocatieId] = useState<number | null>(null);
  const [naarLocatieNaam, setNaarLocatieNaam] = useState<string | null>(null);

  const voorraad = voorraadLijst?.find((v) => v.artikel_id === artikelId);
  const vrij = voorraad?.vrij ?? null;

  const locatieItems = locaties.map((l) => ({
    id: l.id,
    label: l.naam,
    subtitel: l.type,
  }));
  const opdrachtItems = opdrachten.map((o) => ({
    id: o.id,
    label: o.werknummer ? `${o.werknummer} — ${o.titel}` : o.titel,
    subtitel: o.gebouw_naam ?? undefined,
  }));

  async function verwerken() {
    const aantal = parseFloat(hoeveelheid.replace(",", "."));
    if (!aantal || aantal <= 0) {
      Alert.alert("Ongeldige hoeveelheid", "Voer een hoeveelheid groter dan 0 in.");
      return;
    }
    if (actie === "verplaatsen" && !naarLocatieId) {
      Alert.alert("Naar-locatie vereist", "Selecteer een locatie om naar te verplaatsen.");
      return;
    }

    setBezig(true);
    try {
      if (actie === "uitgifte") {
        await uitgifte.mutateAsync({
          data: {
            opdracht_id: opdrachtId,
            regels: [{ artikel_id: artikelId, hoeveelheid: aantal, locatie_id: vanLocatieId }],
          },
        });
        Alert.alert(
          "Uitgifte geregistreerd",
          `${aantal} ${eenheidLabel(artikel?.eenheid)} "${artikel?.naam}" uitgeleverd.${opdrachtNaam ? `\nOpdracht: ${opdrachtNaam}` : ""}`,
          [{ text: "OK", onPress: onSluit }],
        );
      } else if (actie === "retour") {
        await retour.mutateAsync({
          data: {
            opdracht_id: opdrachtId,
            regels: [{ artikel_id: artikelId, hoeveelheid: aantal, locatie_id: naarLocatieId, conditie: "goed" }],
          },
        });
        Alert.alert(
          "Retour geregistreerd",
          `${aantal} ${eenheidLabel(artikel?.eenheid)} "${artikel?.naam}" ingenomen.`,
          [{ text: "OK", onPress: onSluit }],
        );
      } else {
        await verplaatsen.mutateAsync({
          data: {
            artikel_id: artikelId,
            hoeveelheid: aantal,
            van_locatie_id: vanLocatieId,
            naar_locatie_id: naarLocatieId!,
            omschrijving: `Verplaatsing${vanLocatieNaam ? ` van ${vanLocatieNaam}` : ""}${naarLocatieNaam ? ` naar ${naarLocatieNaam}` : ""}`,
          },
        });
        Alert.alert(
          "Verplaatsing geregistreerd",
          `${aantal} ${eenheidLabel(artikel?.eenheid)} "${artikel?.naam}" verplaatst naar ${naarLocatieNaam ?? "nieuwe locatie"}.`,
          [{ text: "OK", onPress: onSluit }],
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Controleer je verbinding en probeer het opnieuw.";
      Alert.alert("Fout", msg);
    } finally {
      setBezig(false);
    }
  }

  if (artikelLaden) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <ActivityIndicator size="large" color={c.primary} />
        <Text style={{ marginTop: 12, color: c.mutedForeground, fontFamily: "Inter_400Regular" }}>
          Artikel ophalen...
        </Text>
      </View>
    );
  }

  if (!artikel) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center" }}>
          Artikelgegevens niet beschikbaar.
        </Text>
        <Pressable onPress={onSluit} style={{ marginTop: 16 }}>
          <Text style={{ color: c.primary, fontFamily: "Inter_600SemiBold" }}>Sluiten</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Artikelkaart */}
        <View
          style={{
            backgroundColor: c.card,
            borderRadius: 14,
            padding: 18,
            marginBottom: 20,
            borderWidth: 1,
            borderColor: c.border,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                backgroundColor: "#fff3ef",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="cube-outline" size={22} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: c.text, marginBottom: 2 }}>
                {artikel.naam}
              </Text>
              {artikel.code ? (
                <Text style={{ fontSize: 12, color: c.mutedForeground, fontFamily: "Inter_400Regular" }}>
                  Code: {artikel.code}
                </Text>
              ) : null}
              {artikel.categorie ? (
                <Text style={{ fontSize: 12, color: c.mutedForeground, fontFamily: "Inter_400Regular" }}>
                  {artikel.categorie}
                </Text>
              ) : null}
            </View>
          </View>

          {artikel.omschrijving ? (
            <Text style={{ marginTop: 12, fontSize: 13, color: c.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 19 }}>
              {artikel.omschrijving}
            </Text>
          ) : null}

          <View style={{ marginTop: 14, flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
            <View style={{ flex: 1, minWidth: 100, backgroundColor: "#f9fafb", borderRadius: 8, padding: 10, alignItems: "center" }}>
              <Text style={{ fontSize: 11, color: c.mutedForeground, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
                Eenheid
              </Text>
              <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: c.text }}>
                {eenheidLabel(artikel.eenheid)}
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                minWidth: 100,
                backgroundColor: vrij !== null && vrij <= (artikel.minimum_voorraad ?? 0) ? "#fef2f2" : "#f0fdf4",
                borderRadius: 8,
                padding: 10,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 11, color: c.mutedForeground, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
                Vrije voorraad
              </Text>
              <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: vrij !== null && vrij <= (artikel.minimum_voorraad ?? 0) ? "#dc2626" : "#16a34a" }}>
                {vrij !== null ? `${vrij} ${eenheidLabel(artikel.eenheid)}` : "\u2014"}
              </Text>
            </View>
            {artikel.minimum_voorraad != null ? (
              <View style={{ flex: 1, minWidth: 100, backgroundColor: "#f9fafb", borderRadius: 8, padding: 10, alignItems: "center" }}>
                <Text style={{ fontSize: 11, color: c.mutedForeground, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
                  Minimum
                </Text>
                <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: c.text }}>
                  {artikel.minimum_voorraad} {eenheidLabel(artikel.eenheid)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Actie kiezer */}
        <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
          Registreren als
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
          {(["uitgifte", "retour", "verplaatsen"] as Actie[]).map((a) => {
            const actief = actie === a;
            const icoon = a === "uitgifte" ? "arrow-up-circle-outline" : a === "retour" ? "arrow-down-circle-outline" : "swap-horizontal-outline";
            const label = a === "uitgifte" ? "Uitgifte" : a === "retour" ? "Retour" : "Verplaatsen";
            return (
              <Pressable
                key={a}
                onPress={() => setActie(a)}
                style={({ pressed }) => ({
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 10,
                  alignItems: "center",
                  backgroundColor: actief ? c.primary : (pressed ? "#f3f4f6" : c.card),
                  borderWidth: 1.5,
                  borderColor: actief ? c.primary : c.border,
                })}
              >
                <Ionicons name={icoon as "arrow-up-circle-outline"} size={20} color={actief ? "#fff" : c.mutedForeground} />
                <Text style={{ marginTop: 4, fontSize: 12, fontFamily: "Inter_600SemiBold", color: actief ? "#fff" : c.text }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Opdracht keuze (uitgifte + retour) */}
        {(actie === "uitgifte" || actie === "retour") && opdrachten.length > 0 && (
          <KeuzeBalk
            label="Opdracht"
            waarde={opdrachtNaam}
            placeholder="Kies een opdracht..."
            onPress={() => setPickerType("opdracht")}
          />
        )}

        {/* Van-locatie (uitgifte + verplaatsen) */}
        {(actie === "uitgifte" || actie === "verplaatsen") && locaties.length > 0 && (
          <KeuzeBalk
            label={actie === "verplaatsen" ? "Van locatie" : "Vanuit locatie"}
            waarde={vanLocatieNaam}
            placeholder="Kies een locatie..."
            onPress={() => setPickerType("van_locatie")}
            verplicht={actie === "verplaatsen"}
          />
        )}

        {/* Naar-locatie (retour + verplaatsen) */}
        {(actie === "retour" || actie === "verplaatsen") && locaties.length > 0 && (
          <KeuzeBalk
            label={actie === "verplaatsen" ? "Naar locatie" : "Terugplaatsen naar"}
            waarde={naarLocatieNaam}
            placeholder="Kies een locatie..."
            onPress={() => setPickerType("naar_locatie")}
            verplicht={actie === "verplaatsen"}
          />
        )}

        {/* Hoeveelheid */}
        <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
          Hoeveelheid ({eenheidLabel(artikel.eenheid)})
        </Text>
        <TextInput
          value={hoeveelheid}
          onChangeText={setHoeveelheid}
          keyboardType="decimal-pad"
          placeholder="1"
          placeholderTextColor={c.mutedForeground}
          style={{
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 18,
            fontFamily: "Inter_700Bold",
            color: c.text,
            backgroundColor: c.card,
            marginBottom: 20,
            textAlign: "center",
          }}
        />

        {/* Bevestigen */}
        <Pressable
          onPress={verwerken}
          disabled={bezig}
          style={({ pressed }) => ({
            backgroundColor: bezig ? "#d1d5db" : (pressed ? "#c2360a" : c.primary),
            borderRadius: 12,
            paddingVertical: 15,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 8,
            marginBottom: 12,
          })}
        >
          {bezig ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons
                name={
                  actie === "uitgifte"
                    ? "arrow-up-circle"
                    : actie === "retour"
                    ? "arrow-down-circle"
                    : "swap-horizontal"
                }
                size={20}
                color="#fff"
              />
              <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" }}>
                {actie === "uitgifte"
                  ? "Uitgifte bevestigen"
                  : actie === "retour"
                  ? "Retour bevestigen"
                  : "Verplaatsing bevestigen"}
              </Text>
            </>
          )}
        </Pressable>

        <Pressable
          onPress={onSluit}
          style={({ pressed }) => ({ paddingVertical: 12, alignItems: "center", opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: c.mutedForeground }}>
            Annuleren — terug naar scanner
          </Text>
        </Pressable>
      </ScrollView>

      {/* Picker modals */}
      <PickerModal
        zichtbaar={pickerType === "opdracht"}
        onSluit={() => setPickerType(null)}
        titel="Kies opdracht"
        items={opdrachtItems}
        onKies={(id, label) => { setOpdrachtId(id); setOpdrachtNaam(id ? label : null); }}
        gekozenId={opdrachtId}
        leegLabel="Geen opdracht"
      />
      <PickerModal
        zichtbaar={pickerType === "van_locatie"}
        onSluit={() => setPickerType(null)}
        titel="Kies van-locatie"
        items={locatieItems}
        onKies={(id, label) => { setVanLocatieId(id); setVanLocatieNaam(id ? label : null); }}
        gekozenId={vanLocatieId}
        leegLabel="Geen specifieke locatie"
      />
      <PickerModal
        zichtbaar={pickerType === "naar_locatie"}
        onSluit={() => setPickerType(null)}
        titel="Kies naar-locatie"
        items={locatieItems}
        onKies={(id, label) => { setNaarLocatieId(id); setNaarLocatieNaam(id ? label : null); }}
        gekozenId={naarLocatieId}
      />
    </KeyboardAvoidingView>
  );
}

export default function MagazijnScanScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ artikel_id?: string }>();

  const [permission, requestPermission] = useCameraPermissions();
  const [modus, setModus] = useState<Modus>(params.artikel_id ? "resultaat" : "scan");
  const [gevondenArtikelId, setGevondenArtikelId] = useState<number | null>(
    params.artikel_id ? Number(params.artikel_id) : null,
  );
  const [scanFout, setScanFout] = useState<string | null>(null);
  const [scanBezig, setScanBezig] = useState(false);

  const geblokkeerd = useRef(false);

  if (!token) return <Redirect href="/login" />;

  async function onBarcodeScanned({ data }: { data: string; type: string }) {
    if (geblokkeerd.current) return;
    geblokkeerd.current = true;
    setScanBezig(true);
    setScanFout(null);

    try {
      const artikelen = await listArtikelen({ barcode: data });
      if (!artikelen || artikelen.length === 0) {
        setScanFout(`Geen artikel gevonden voor barcode: ${data}`);
        setTimeout(() => { setScanFout(null); geblokkeerd.current = false; }, 2500);
      } else {
        setGevondenArtikelId(artikelen[0].id);
        setModus("resultaat");
      }
    } catch {
      setScanFout("Fout bij ophalen artikel. Controleer je verbinding.");
      setTimeout(() => { setScanFout(null); geblokkeerd.current = false; }, 2500);
    } finally {
      setScanBezig(false);
    }
  }

  function resetNaarScanner() {
    setModus("scan");
    setGevondenArtikelId(null);
    setScanFout(null);
    geblokkeerd.current = false;
  }

  if (!permission) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  const viaParam = !!params.artikel_id;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Koptekst */}
      <View
        style={{
          backgroundColor: c.dark,
          paddingTop: bovenInset(insets) + 12,
          paddingHorizontal: 20,
          paddingBottom: 18,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={c.darkForeground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.darkForeground, fontSize: 18, fontFamily: "Inter_700Bold" }}>
              {viaParam ? "Artikel" : "Barcode scannen"}
            </Text>
            <Text style={{ color: c.darkMuted, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 }}>
              {modus === "scan" ? "Richt de camera op een artikelbarcode" : "Artikel gevonden"}
            </Text>
          </View>
          {modus === "resultaat" && !viaParam && (
            <Pressable
              onPress={resetNaarScanner}
              hitSlop={12}
              style={({ pressed }) => ({
                opacity: pressed ? 0.6 : 1,
                backgroundColor: "rgba(255,255,255,0.12)",
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 6,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              })}
            >
              <Ionicons name="scan-outline" size={15} color={c.darkForeground} />
              <Text style={{ color: c.darkForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                Opnieuw
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {modus === "scan" ? (
        !permission.granted ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
            <Ionicons name="camera-outline" size={56} color={c.mutedForeground} />
            <Text style={{ marginTop: 16, fontSize: 17, fontFamily: "Inter_700Bold", color: c.text, textAlign: "center", marginBottom: 8 }}>
              Cameratoegang vereist
            </Text>
            <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: c.mutedForeground, textAlign: "center", lineHeight: 21, marginBottom: 24 }}>
              Om barcodes te scannen heeft de app toegang nodig tot de camera.
            </Text>
            <Pressable
              onPress={requestPermission}
              style={({ pressed }) => ({
                backgroundColor: pressed ? "#c2360a" : c.primary,
                borderRadius: 12,
                paddingHorizontal: 28,
                paddingVertical: 13,
              })}
            >
              <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" }}>
                Toestemming geven
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flex: 1, position: "relative" }}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              onBarcodeScanned={onBarcodeScanned}
              barcodeScannerSettings={{
                barcodeTypes: ["ean13", "ean8", "code128", "code39", "qr", "upc_a", "upc_e"],
              }}
            />

            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: "30%", backgroundColor: "rgba(0,0,0,0.5)" }} />
              <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "30%", backgroundColor: "rgba(0,0,0,0.5)" }} />
              <View style={{ position: "absolute", top: "30%", bottom: "30%", left: 0, width: "12%", backgroundColor: "rgba(0,0,0,0.5)" }} />
              <View style={{ position: "absolute", top: "30%", bottom: "30%", right: 0, width: "12%", backgroundColor: "rgba(0,0,0,0.5)" }} />
              <View style={{ width: "76%", aspectRatio: 2.5, borderColor: "#fff", borderWidth: 2, borderRadius: 10 }} />
            </View>

            <View style={{ position: "absolute", bottom: insets.bottom + 32, left: 0, right: 0, alignItems: "center" }}>
              {scanBezig ? (
                <View style={{ backgroundColor: "rgba(0,0,0,0.72)", borderRadius: 24, paddingHorizontal: 20, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" }}>Artikel zoeken...</Text>
                </View>
              ) : scanFout ? (
                <View style={{ backgroundColor: "rgba(220,38,38,0.88)", borderRadius: 24, paddingHorizontal: 20, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8, maxWidth: "80%" }}>
                  <Ionicons name="alert-circle-outline" size={18} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold", flexShrink: 1 }}>{scanFout}</Text>
                </View>
              ) : (
                <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" }}>
                  Richt de camera op een barcode of QR-code
                </Text>
              )}
            </View>
          </View>
        )
      ) : (
        <View style={{ flex: 1 }}>
          {gevondenArtikelId !== null ? (
            <ArtikelKaart
              artikelId={gevondenArtikelId}
              onSluit={viaParam ? () => router.back() : resetNaarScanner}
            />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
              <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular" }}>
                Geen artikel geselecteerd.
              </Text>
              <Pressable onPress={resetNaarScanner} style={{ marginTop: 16 }}>
                <Text style={{ color: c.primary, fontFamily: "Inter_600SemiBold" }}>Terug naar scanner</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
