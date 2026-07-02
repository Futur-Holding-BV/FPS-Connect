// Voertuig melding — monteur meldt storing of schade aan zijn auto
// Foto's + omschrijving → AI diagnose + oplossing → vastleggen

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
import { useAuth } from "@/lib/auth";
import { uploadFoto } from "@/lib/upload";
import { useThemeColors } from "@/lib/theme";

const DOMEIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";

type Stap = "invullen" | "laden" | "resultaat" | "opgeslagen";

interface MeldingResultaat {
  id: number;
  voertuig_kenteken: string | null;
  voertuig_merk: string | null;
  voertuig_type_naam: string | null;
  ai_diagnose: string | null;
  ai_oplossing: string | null;
  ai_kosten_indicatie: boolean;
  ai_kosten_tekst: string | null;
  type: string;
  omschrijving: string;
}

export default function VoertuigMeldingScherm() {
  const { token } = useAuth();
  const c = useThemeColors();

  const [stap, setStap] = useState<Stap>("invullen");
  const [type, setType] = useState<"storing" | "schade">("storing");
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

    try {
      const resp = await fetch(`https://${DOMEIN}/api/wagenpark/meldingen`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          omschrijving: omschrijving.trim(),
          foto_paden: fotoPaden,
        }),
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
      setFoutMelding("Geen verbinding. Controleer uw internet.");
      setStap("invullen");
    }
  }

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 12,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.card,
    },
    titel: { fontSize: 17, fontFamily: "Inter_700Bold", color: c.foreground, flex: 1 },
    sectie: { marginHorizontal: 16, marginTop: 20 },
    label: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: c.mutedForeground, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
    toggleRow: { flexDirection: "row", gap: 10 },
    toggleBtn: (actief: boolean) => ({
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: actief ? c.primary : c.border,
      backgroundColor: actief ? `${c.primary}15` : c.card,
      alignItems: "center" as const,
    }),
    toggleTekst: (actief: boolean) => ({
      fontSize: 14,
      fontFamily: actief ? "Inter_700Bold" : "Inter_400Regular",
      color: actief ? c.primary : c.foreground,
    }),
    invoer: {
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: c.foreground,
      minHeight: 100,
      textAlignVertical: "top" as const,
    },
    fotoRij: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
    fotoThumb: { width: 80, height: 80, borderRadius: 8, overflow: "hidden" as const, position: "relative" as const },
    fotoThumbImg: { width: 80, height: 80, borderRadius: 8 },
    verwijderKnop: { position: "absolute" as const, top: 4, right: 4, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 10, padding: 2 },
    fotoToevoegen: {
      width: 80,
      height: 80,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: c.border,
      borderStyle: "dashed" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: c.card,
    },
    verstuurKnop: {
      marginHorizontal: 16,
      marginTop: 28,
      marginBottom: 24,
      backgroundColor: c.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center" as const,
    },
    verstuurTekst: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
    fout: {
      marginHorizontal: 16,
      marginTop: 12,
      backgroundColor: "#fee2e2",
      borderRadius: 8,
      padding: 12,
    },
    foutTekst: { color: "#dc2626", fontSize: 13, fontFamily: "Inter_400Regular" },
    ladenContainer: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 },
    ladenTekst: { fontSize: 14, fontFamily: "Inter_400Regular", color: c.mutedForeground },
    resultaatKaart: { margin: 16, backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: "hidden" as const },
    resultaatKop: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
    resultaatKopTekst: { fontSize: 15, fontFamily: "Inter_700Bold", color: c.foreground },
    resultaatRij: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    resultaatLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: c.mutedForeground, textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 4 },
    resultaatTekst: { fontSize: 14, fontFamily: "Inter_400Regular", color: c.foreground, lineHeight: 20 },
    kostenBadge: { marginTop: 8, backgroundColor: "#fef3c7", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, alignSelf: "flex-start" as const },
    kostenTekst: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#92400e" },
    bevestigKnop: {
      margin: 16,
      backgroundColor: c.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center" as const,
    },
    klaarKnop: {
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 24,
      borderRadius: 12,
      paddingVertical: 14,
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

  // ── Stap: resultaat ──────────────────────────────────────────────────────────
  if ((stap === "resultaat" || stap === "opgeslagen") && resultaat) {
    const voertuigLabel = [resultaat.voertuig_merk, resultaat.voertuig_type_naam, resultaat.voertuig_kenteken ? `(${resultaat.voertuig_kenteken})` : null]
      .filter(Boolean).join(" ");

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
          <View style={{ marginHorizontal: 16, marginTop: 20, flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#dcfce7", borderRadius: 10, padding: 14 }}>
            <Ionicons name="checkmark-circle" size={20} color="#16a34a" style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#14532d" }}>Melding vastgelegd</Text>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: "#166534", marginTop: 2 }}>
                {voertuigLabel || "Uw voertuig"} — {resultaat.type === "schade" ? "Schademelding" : "Storing"}
              </Text>
            </View>
          </View>

          {/* AI diagnose */}
          <View style={s.resultaatKaart}>
            <View style={s.resultaatKop}>
              <Ionicons name="sparkles" size={16} color={c.primary} />
              <Text style={s.resultaatKopTekst}>AI analyse</Text>
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
            {resultaat.ai_kosten_indicatie && (
              <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                <Text style={s.resultaatLabel}>Kosteninschatting</Text>
                <View style={s.kostenBadge}>
                  <Text style={s.kostenTekst}>{resultaat.ai_kosten_tekst ?? "Kosten verwacht — administratie wordt genotificeerd"}</Text>
                </View>
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: c.mutedForeground, marginTop: 8 }}>
                  De administratie ontvangt deze melding voor verdere afhandeling.
                </Text>
              </View>
            )}
            {!resultaat.ai_diagnose && !resultaat.ai_oplossing && (
              <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: c.mutedForeground, fontStyle: "italic" }}>
                  AI analyse niet beschikbaar — melding is wel opgeslagen.
                </Text>
              </View>
            )}
          </View>

          <Pressable style={s.klaarKnop} onPress={() => router.back()}>
            <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.foreground }}>Sluiten</Text>
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
              <Pressable key={t} style={s.toggleBtn(type === t)} onPress={() => setType(t)}>
                <Text style={s.toggleTekst(type === t)}>
                  {t === "storing" ? "Storing" : "Schade"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Omschrijving */}
        <View style={s.sectie}>
          <Text style={s.label}>Omschrijving</Text>
          <TextInput
            style={s.invoer}
            placeholder={type === "storing" ? "Beschrijf de storing (bijv. motor slaat niet aan, waarschuwingslampje brandt...)" : "Beschrijf de schade (bijv. deuk rechtervoor, kapotte spiegel...)"}
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
                  <Ionicons name="close" size={12} color="#fff" />
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
                <Text style={{ fontSize: 10, color: c.mutedForeground, marginTop: 4, fontFamily: "Inter_400Regular" }}>
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
