import { API_DOMEIN } from "@/lib/apiDomein";
// Voertuig melding — monteur meldt storing of schade aan zijn auto
// Foto's + omschrijving → AI diagnose + oplossing → vastleggen
// Extensies: schade_locatie / storing_type pickers, offline-draft opslaan,
// AI ernst-indicatie + duplicaatdetectie + waarschuwingen in resultaatscherm.

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/context/auth";
import { uploadFoto } from "@/lib/upload";
import { voegToeAanWachtrij } from "@/lib/syncQueue";
import { useColors } from "@/hooks/useColors";
import { tekstStijl } from "@/components/ui";
import { ruimte } from "@workspace/ontwerp";

const DOMEIN = API_DOMEIN;

type Stap = "invullen" | "laden" | "resultaat" | "opgeslagen" | "offline_opgeslagen";

const SCHADE_LOCATIES: { waarde: string; label: string }[] = [
  { waarde: "voorzijde", label: "Voorzijde" },
  { waarde: "achterzijde", label: "Achterzijde" },
  { waarde: "links", label: "Links" },
  { waarde: "rechts", label: "Rechts" },
  { waarde: "interieur", label: "Interieur" },
  { waarde: "laadruimte", label: "Laadruimte" },
  { waarde: "ruit", label: "Ruit" },
  { waarde: "band", label: "Band / velg" },
];

const STORING_TYPEN: { waarde: string; label: string }[] = [
  { waarde: "motor", label: "Motor" },
  { waarde: "verlichting", label: "Verlichting" },
  { waarde: "banden", label: "Banden" },
  { waarde: "remmen", label: "Remmen" },
  { waarde: "accu", label: "Accu" },
  { waarde: "ruit", label: "Ruit" },
  { waarde: "airco", label: "Airco" },
  { waarde: "onderhoudsmelding", label: "Onderhoudsmelding" },
  { waarde: "overige", label: "Overig" },
];

// Ernst-indicatie op het statuspalet. Het palet kent geen aparte "oranje/matig"
// kleur; licht en matig delen daarom het waarschuwingstoken (matig iets sterker),
// ernstig gebruikt het fouttoken. Achtergrond = token met alpha-suffix.
type ErnstStijl = { bg: string; tekst: string; label: string };
function ernstStijl(c: ReturnType<typeof useColors>): Record<string, ErnstStijl> {
  return {
    licht: { bg: c.warning + "22", tekst: c.warning, label: "Licht" },
    matig: { bg: c.warning + "33", tekst: c.warning, label: "Matig" },
    ernstig: { bg: c.destructive + "22", tekst: c.destructive, label: "Ernstig" },
  };
}

interface MeldingResultaat {
  id: number;
  voertuig_kenteken: string | null;
  voertuig_merk: string | null;
  voertuig_type_naam: string | null;
  ai_diagnose: string | null;
  ai_oplossing: string | null;
  ai_kosten_indicatie: boolean;
  ai_kosten_tekst: string | null;
  ai_ernst_indicatie: "licht" | "matig" | "ernstig" | null;
  ai_mogelijk_duplicaat_van_id: number | null;
  ai_gelezen_waarschuwingen: string[] | null;
  type: string;
  omschrijving: string;
}

export default function VoertuigMeldingScherm() {
  const { token } = useAuth();
  const c = useColors();

  const [stap, setStap] = useState<Stap>("invullen");
  const [type, setType] = useState<"storing" | "schade">("storing");
  const [schadeLocatie, setSchadeLocatie] = useState<string | null>(null);
  const [storingType, setStoringType] = useState<string | null>(null);
  const [omschrijving, setOmschrijving] = useState("");
  const [fotos, setFotos] = useState<string[]>([]);
  const [fotoPaden, setFotoPaden] = useState<string[]>([]);
  const [resultaat, setResultaat] = useState<MeldingResultaat | null>(null);
  const [foutMelding, setFoutMelding] = useState<string | null>(null);

  const authHeaders = { Authorization: `Bearer ${token}` };

  async function voegFotoToe(camera: boolean) {
    if (fotos.length >= 3) {
      Alert.alert("Maximum bereikt", "U kunt maximaal 3 foto's toevoegen.");
      return;
    }

    let result: ImagePicker.ImagePickerResult;
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Toestemming vereist", "Geef toegang tot de camera.");
        return;
      }
      result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Toestemming vereist", "Geef toegang tot de fotobibliotheek.");
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    }

    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;

    try {
      const pad = await uploadFoto(uri);
      setFotos((prev) => [...prev, uri]);
      setFotoPaden((prev) => [...prev, pad]);
    } catch {
      Alert.alert("Fout", "Foto uploaden mislukt.");
    }
  }

  function verwijderFoto(index: number) {
    setFotos((prev) => prev.filter((_, i) => i !== index));
    setFotoPaden((prev) => prev.filter((_, i) => i !== index));
  }

  async function verstuurMelding() {
    if (!omschrijving.trim()) {
      Alert.alert("Verplicht veld", "Vul een omschrijving in.");
      return;
    }

    setStap("laden");
    setFoutMelding(null);

    const body: Record<string, unknown> = {
      type,
      omschrijving: omschrijving.trim(),
      foto_paden: fotoPaden,
    };
    if (type === "schade" && schadeLocatie) body.schade_locatie = schadeLocatie;
    if (type === "storing" && storingType) body.storing_type = storingType;

    try {
      const resp = await fetch(`https://${DOMEIN}/api/wagenpark/meldingen`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (resp.status === 404) {
        setFoutMelding("Er is geen voertuig aan uw account gekoppeld. Neem contact op met de beheerder.");
        setStap("invullen");
        return;
      }

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({})) as { error?: string };
        setFoutMelding(err.error ?? "Er is een fout opgetreden.");
        setStap("invullen");
        return;
      }

      const data = await resp.json() as MeldingResultaat;
      setResultaat(data);
      setStap("resultaat");
    } catch {
      // Geen verbinding — sla offline op en sync later
      try {
        await voegToeAanWachtrij({
          type: "create_melding",
          lokaalId: `melding_${Date.now()}`,
          payload: {
            type,
            omschrijving: omschrijving.trim(),
            schade_locatie: type === "schade" ? schadeLocatie : null,
            storing_type: type === "storing" ? storingType : null,
            foto_paden: fotoPaden,
          },
          lokale_foto_paden: [],
        });
        setStap("offline_opgeslagen");
      } catch {
        setFoutMelding("Geen verbinding en opslaan mislukt. Controleer uw internet.");
        setStap("invullen");
      }
    }
  }

  const toggleBtn = (actief: boolean) => ({
    flex: 1,
    paddingVertical: ruimte.s + 2,
    borderRadius: c.radius / 2,
    borderWidth: 1.5,
    borderColor: actief ? c.primary : c.border,
    backgroundColor: actief ? `${c.primary}15` : c.card,
    alignItems: "center" as const,
  });
  const toggleTekst = (actief: boolean) => ({
    ...tekstStijl("standaard", actief ? c.primary : c.foreground),
    fontFamily: actief ? "Inter_700Bold" : "Inter_400Regular",
  });
  const chip = (actief: boolean) => ({
    paddingHorizontal: ruimte.m,
    paddingVertical: ruimte.xs + 2,
    borderRadius: ruimte.xl - 4,
    borderWidth: 1.5,
    borderColor: actief ? c.primary : c.border,
    backgroundColor: actief ? `${c.primary}18` : c.card,
  });
  const chipTekst = (actief: boolean) => ({
    ...tekstStijl("klein", actief ? c.primary : c.foreground),
    fontFamily: actief ? "Inter_600SemiBold" : "Inter_400Regular",
  });

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: ruimte.l,
      paddingTop: ruimte.l,
      paddingBottom: ruimte.m,
      gap: ruimte.m,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.card,
    },
    titel: { ...tekstStijl("sectiekop", c.foreground), flex: 1 },
    sectie: { marginHorizontal: ruimte.l, marginTop: ruimte.xl },
    label: { ...tekstStijl("bijschrift", c.mutedForeground), fontFamily: "Inter_600SemiBold", marginBottom: ruimte.xs + 2, textTransform: "uppercase", letterSpacing: 0.5 },
    toggleRow: { flexDirection: "row", gap: ruimte.s + 2 },
    chipRij: { flexDirection: "row", flexWrap: "wrap", gap: ruimte.s },
    invoer: {
      ...tekstStijl("standaard", c.foreground),
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: c.radius / 2,
      paddingHorizontal: ruimte.m + 2,
      paddingVertical: ruimte.m,
      minHeight: ruimte.xxl * 3 + ruimte.xs,
      textAlignVertical: "top" as const,
    },
    fotoRij: { flexDirection: "row", gap: ruimte.s + 2, flexWrap: "wrap" },
    fotoThumb: { width: ruimte.xxl + ruimte.xxl + ruimte.l, height: ruimte.xxl + ruimte.xxl + ruimte.l, borderRadius: ruimte.s, overflow: "hidden" as const, position: "relative" as const },
    fotoThumbImg: { width: ruimte.xxl + ruimte.xxl + ruimte.l, height: ruimte.xxl + ruimte.xxl + ruimte.l, borderRadius: ruimte.s },
    verwijderKnop: { position: "absolute" as const, top: ruimte.xs, right: ruimte.xs, backgroundColor: c.dark + "99", borderRadius: ruimte.s + 2, padding: ruimte.xs / 2 },
    fotoToevoegen: {
      width: ruimte.xxl + ruimte.xxl + ruimte.l,
      height: ruimte.xxl + ruimte.xxl + ruimte.l,
      borderRadius: ruimte.s,
      borderWidth: 1.5,
      borderColor: c.border,
      borderStyle: "dashed" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: c.card,
    },
    verstuurKnop: {
      marginHorizontal: ruimte.l,
      marginTop: ruimte.xl + ruimte.xs,
      marginBottom: ruimte.xl,
      backgroundColor: c.primary,
      borderRadius: c.radius,
      paddingVertical: ruimte.m + 2,
      alignItems: "center" as const,
    },
    verstuurTekst: { ...tekstStijl("nadruk", c.primaryForeground), fontFamily: "Inter_700Bold" },
    fout: {
      marginHorizontal: ruimte.l,
      marginTop: ruimte.m,
      backgroundColor: c.destructive + "22",
      borderRadius: ruimte.s,
      padding: ruimte.m,
    },
    foutTekst: { ...tekstStijl("klein", c.destructive) },
    ladenContainer: { flex: 1, justifyContent: "center", alignItems: "center", gap: ruimte.l },
    ladenTekst: { ...tekstStijl("standaard", c.mutedForeground) },
    resultaatKaart: { margin: ruimte.l, backgroundColor: c.card, borderRadius: c.radius, borderWidth: 1, borderColor: c.border, overflow: "hidden" as const },
    resultaatKop: { paddingHorizontal: ruimte.l, paddingVertical: ruimte.m, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row" as const, alignItems: "center" as const, gap: ruimte.s },
    resultaatKopTekst: { ...tekstStijl("nadruk", c.foreground), fontFamily: "Inter_700Bold" },
    resultaatRij: { paddingHorizontal: ruimte.l, paddingVertical: ruimte.m, borderBottomWidth: 1, borderBottomColor: c.border },
    resultaatLabel: { ...tekstStijl("bijschrift", c.mutedForeground), fontFamily: "Inter_600SemiBold", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: ruimte.xs },
    resultaatTekst: { ...tekstStijl("standaard", c.foreground) },
    kostenBadge: { marginTop: ruimte.s, backgroundColor: c.warning + "22", borderRadius: ruimte.xs + 2, paddingHorizontal: ruimte.s + 2, paddingVertical: ruimte.xs + 2, alignSelf: "flex-start" as const },
    kostenTekst: { ...tekstStijl("klein", c.warning), fontFamily: "Inter_600SemiBold" },
    klaarKnop: {
      marginHorizontal: ruimte.l,
      marginTop: ruimte.m,
      marginBottom: ruimte.xl,
      borderRadius: c.radius,
      paddingVertical: ruimte.m + 2,
      alignItems: "center" as const,
      borderWidth: 1,
      borderColor: c.border,
    },
  });

  // ── Stap: laden ─────────────────────────────────────────────────────────────
  if (stap === "laden") {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <Ionicons name="car-outline" size={22} color={c.primary} />
          <Text style={s.titel}>Voertuig melden</Text>
        </View>
        <View style={s.ladenContainer}>
          <ActivityIndicator size="large" color={c.primary} />
          <Text style={s.ladenTekst}>AI analyseert uw melding...</Text>
        </View>
      </View>
    );
  }

  // ── Stap: offline opgeslagen ─────────────────────────────────────────────────
  if (stap === "offline_opgeslagen") {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={c.foreground} />
          </Pressable>
          <Text style={s.titel}>Voertuig melden</Text>
        </View>
        <ScrollView>
          <View style={{ marginHorizontal: ruimte.l, marginTop: ruimte.xl, flexDirection: "row", alignItems: "flex-start", gap: ruimte.s + 2, backgroundColor: c.warning + "22", borderRadius: c.radius / 2, padding: ruimte.m + 2 }}>
            <Ionicons name="cloud-offline-outline" size={20} color={c.warning} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={[tekstStijl("standaard", c.warning), { fontFamily: "Inter_700Bold" }]}>Melding opgeslagen (offline)</Text>
              <Text style={[tekstStijl("klein", c.warning), { marginTop: ruimte.xs }]}>
                Uw melding is lokaal opgeslagen en wordt automatisch verzonden zodra de verbinding hersteld is.
              </Text>
            </View>
          </View>
          <Pressable style={s.klaarKnop} onPress={() => router.back()}>
            <Text style={[tekstStijl("nadruk", c.foreground), { fontFamily: "Inter_600SemiBold" }]}>Sluiten</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ── Stap: resultaat ──────────────────────────────────────────────────────────
  if ((stap === "resultaat" || stap === "opgeslagen") && resultaat) {
    const voertuigLabel = [resultaat.voertuig_merk, resultaat.voertuig_type_naam, resultaat.voertuig_kenteken ? `(${resultaat.voertuig_kenteken})` : null]
      .filter(Boolean).join(" ");
    const ernstConfig = resultaat.ai_ernst_indicatie ? ernstStijl(c)[resultaat.ai_ernst_indicatie] : null;
    const heeftWaarschuwingen = (resultaat.ai_gelezen_waarschuwingen?.length ?? 0) > 0;

    return (
      <View style={s.container}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={c.foreground} />
          </Pressable>
          <Text style={s.titel}>Voertuig melden</Text>
        </View>
        <ScrollView>
          {/* Bevestiging */}
          <View style={{ marginHorizontal: ruimte.l, marginTop: ruimte.xl, flexDirection: "row", alignItems: "flex-start", gap: ruimte.s + 2, backgroundColor: c.success + "22", borderRadius: c.radius / 2, padding: ruimte.m + 2 }}>
            <Ionicons name="checkmark-circle" size={20} color={c.success} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={[tekstStijl("standaard", c.success), { fontFamily: "Inter_700Bold" }]}>Melding vastgelegd</Text>
              <Text style={[tekstStijl("klein", c.success), { marginTop: ruimte.xs / 2 }]}>
                {voertuigLabel || "Uw voertuig"} — {resultaat.type === "schade" ? "Schademelding" : "Storing"}
              </Text>
            </View>
          </View>

          {/* Duplicaat waarschuwing */}
          {resultaat.ai_mogelijk_duplicaat_van_id != null && (
            <View style={{ marginHorizontal: ruimte.l, marginTop: ruimte.m, flexDirection: "row", alignItems: "flex-start", gap: ruimte.s + 2, backgroundColor: c.warning + "18", borderRadius: c.radius / 2, padding: ruimte.m + 2, borderWidth: 1, borderColor: c.warning + "55" }}>
              <Ionicons name="warning-outline" size={18} color={c.warning} style={{ marginTop: 1 }} />
              <Text style={[tekstStijl("klein", c.warning), { flex: 1 }]}>
                Er bestaat mogelijk al een openstaande melding voor deze schadelocatie. De administratie beoordeelt of dit een duplicaat is.
              </Text>
            </View>
          )}

          {/* AI diagnose kaart */}
          <View style={s.resultaatKaart}>
            <View style={s.resultaatKop}>
              <Ionicons name="sparkles" size={16} color={c.primary} />
              <Text style={s.resultaatKopTekst}>AI analyse</Text>
              {ernstConfig && (
                <View style={{ marginLeft: "auto", backgroundColor: ernstConfig.bg, borderRadius: ruimte.xs + 2, paddingHorizontal: ruimte.s, paddingVertical: ruimte.xs - 1 }}>
                  <Text style={[tekstStijl("bijschrift", ernstConfig.tekst), { fontFamily: "Inter_600SemiBold" }]}>{ernstConfig.label}</Text>
                </View>
              )}
            </View>
            {resultaat.ai_diagnose ? (
              <View style={s.resultaatRij}>
                <Text style={s.resultaatLabel}>Diagnose</Text>
                <Text style={s.resultaatTekst}>{resultaat.ai_diagnose}</Text>
              </View>
            ) : null}
            {resultaat.ai_oplossing ? (
              <View style={s.resultaatRij}>
                <Text style={s.resultaatLabel}>Aanbevolen aanpak</Text>
                <Text style={s.resultaatTekst}>{resultaat.ai_oplossing}</Text>
              </View>
            ) : null}
            {heeftWaarschuwingen && (
              <View style={s.resultaatRij}>
                <Text style={s.resultaatLabel}>Zichtbare waarschuwingen op foto</Text>
                {(resultaat.ai_gelezen_waarschuwingen ?? []).map((w, i) => (
                  <Text key={i} style={[s.resultaatTekst, { marginTop: i > 0 ? ruimte.xs : 0 }]}>
                    {"\u2022"} {w}
                  </Text>
                ))}
              </View>
            )}
            {resultaat.ai_kosten_indicatie && (
              <View style={{ paddingHorizontal: ruimte.l, paddingVertical: ruimte.m }}>
                <Text style={s.resultaatLabel}>Kosteninschatting</Text>
                <View style={s.kostenBadge}>
                  <Text style={s.kostenTekst}>{resultaat.ai_kosten_tekst ?? "Kosten verwacht — administratie wordt genotificeerd"}</Text>
                </View>
                <Text style={[tekstStijl("bijschrift", c.mutedForeground), { marginTop: ruimte.s }]}>
                  De administratie ontvangt deze melding voor verdere afhandeling.
                </Text>
              </View>
            )}
            {!resultaat.ai_diagnose && !resultaat.ai_oplossing && (
              <View style={{ paddingHorizontal: ruimte.l, paddingVertical: ruimte.m }}>
                <Text style={[tekstStijl("klein", c.mutedForeground), { fontStyle: "italic" }]}>
                  AI analyse niet beschikbaar — melding is wel opgeslagen.
                </Text>
              </View>
            )}
          </View>

          <Pressable style={s.klaarKnop} onPress={() => router.back()}>
            <Text style={[tekstStijl("nadruk", c.foreground), { fontFamily: "Inter_600SemiBold" }]}>Sluiten</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ── Stap: invullen ──────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={c.foreground} />
        </Pressable>
        <Text style={s.titel}>Voertuig melden</Text>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled">
        {/* Type */}
        <View style={s.sectie}>
          <Text style={s.label}>Type melding</Text>
          <View style={s.toggleRow}>
            {(["storing", "schade"] as const).map((t) => (
              <Pressable
                key={t}
                style={toggleBtn(type === t)}
                onPress={() => {
                  setType(t);
                  setSchadeLocatie(null);
                  setStoringType(null);
                }}
              >
                <Text style={toggleTekst(type === t)}>
                  {t === "storing" ? "Storing" : "Schade"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Schade locatie */}
        {type === "schade" && (
          <View style={s.sectie}>
            <Text style={s.label}>Locatie op voertuig</Text>
            <View style={s.chipRij}>
              {SCHADE_LOCATIES.map((loc) => (
                <Pressable
                  key={loc.waarde}
                  style={chip(schadeLocatie === loc.waarde)}
                  onPress={() => setSchadeLocatie(schadeLocatie === loc.waarde ? null : loc.waarde)}
                >
                  <Text style={chipTekst(schadeLocatie === loc.waarde)}>{loc.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Storing type */}
        {type === "storing" && (
          <View style={s.sectie}>
            <Text style={s.label}>Type storing</Text>
            <View style={s.chipRij}>
              {STORING_TYPEN.map((st) => (
                <Pressable
                  key={st.waarde}
                  style={chip(storingType === st.waarde)}
                  onPress={() => setStoringType(storingType === st.waarde ? null : st.waarde)}
                >
                  <Text style={chipTekst(storingType === st.waarde)}>{st.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Omschrijving */}
        <View style={s.sectie}>
          <Text style={s.label}>Omschrijving</Text>
          <TextInput
            style={s.invoer}
            placeholder={type === "storing"
              ? "Beschrijf de storing (bijv. motor slaat niet aan, waarschuwingslampje brandt...)"
              : "Beschrijf de schade (bijv. deuk rechtervoor, kapotte spiegel...)"}
            placeholderTextColor={c.mutedForeground}
            value={omschrijving}
            onChangeText={setOmschrijving}
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Foto's */}
        <View style={s.sectie}>
          <Text style={s.label}>Foto's ({fotos.length}/3)</Text>
          <View style={s.fotoRij}>
            {fotos.map((uri, i) => (
              <View key={i} style={s.fotoThumb}>
                <Image source={{ uri }} style={s.fotoThumbImg} />
                <Pressable style={s.verwijderKnop} onPress={() => verwijderFoto(i)}>
                  <Ionicons name="close" size={12} color={c.darkForeground} />
                </Pressable>
              </View>
            ))}
            {fotos.length < 3 && (
              <Pressable
                style={s.fotoToevoegen}
                onPress={() =>
                  Alert.alert("Foto toevoegen", "Kies een optie", [
                    { text: "Camera", onPress: () => voegFotoToe(true) },
                    { text: "Bibliotheek", onPress: () => voegFotoToe(false) },
                    { text: "Annuleren", style: "cancel" },
                  ])
                }
              >
                <Ionicons name="camera-outline" size={24} color={c.mutedForeground} />
                <Text style={[tekstStijl("bijschrift", c.mutedForeground), { marginTop: ruimte.xs }]}>
                  Foto
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Foutmelding */}
        {foutMelding && (
          <View style={s.fout}>
            <Text style={s.foutTekst}>{foutMelding}</Text>
          </View>
        )}

        {/* Verstuur */}
        <Pressable style={s.verstuurKnop} onPress={verstuurMelding}>
          <Text style={s.verstuurTekst}>Melding indienen</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
