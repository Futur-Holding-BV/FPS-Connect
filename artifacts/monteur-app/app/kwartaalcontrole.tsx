// Kwartaalcontrole — monteur fotografeert dashboard, AI leest kilometerstand
// en eventuele waarschuwingslampjes af, monteur bevestigt en dient in.
// Offline fallback: als de uiteindelijke POST mislukt wordt de melding in de
// sync-wachtrij gezet (foto al geüpload).

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

const DOMEIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";

type Stap =
  | "instructie"
  | "foto_nemen"
  | "ai_bezig"
  | "ai_fout"
  | "bevestigen"
  | "laden"
  | "klaar"
  | "offline_opgeslagen";

interface AiResultaat {
  fotokwaliteit_ok: boolean;
  reden: string | null;
  km_stand: number | null;
  waarschuwingen: string[];
}

interface MeldingResultaat {
  id: number;
  voertuig_kenteken: string | null;
  voertuig_merk: string | null;
  voertuig_type_naam: string | null;
  ai_gelezen_km_stand: number | null;
  ai_gelezen_waarschuwingen: string[] | null;
  status: string;
}

export default function KwartaalcontroleScherm() {
  const { token } = useAuth();
  const c = useColors();

  const [stap, setStap] = useState<Stap>("instructie");
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [fotoPad, setFotoPad] = useState<string | null>(null);
  const [aiResultaat, setAiResultaat] = useState<AiResultaat | null>(null);
  const [kmStandTekst, setKmStandTekst] = useState("");
  const [foutMelding, setFoutMelding] = useState<string | null>(null);
  const [eindResultaat, setEindResultaat] = useState<MeldingResultaat | null>(null);

  const authHeaders = { Authorization: `Bearer ${token}` };

  async function maakFoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Toestemming vereist", "Geef toegang tot de camera.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;

    const uri = result.assets[0].uri;
    setFotoUri(uri);
    setFoutMelding(null);
    setStap("ai_bezig");

    try {
      const pad = await uploadFoto(uri);
      setFotoPad(pad);

      const resp = await fetch(`https://${DOMEIN}/api/wagenpark/kwartaalcontrole/foto-check`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ foto_pad: pad }),
      });

      if (!resp.ok) {
        setFoutMelding("Fotocontrole mislukt. Probeer opnieuw.");
        setStap("foto_nemen");
        return;
      }

      const ai = await resp.json() as AiResultaat;
      setAiResultaat(ai);

      if (!ai.fotokwaliteit_ok) {
        setStap("ai_fout");
        return;
      }

      setKmStandTekst(ai.km_stand != null ? String(ai.km_stand) : "");
      setStap("bevestigen");
    } catch {
      setFoutMelding("Geen verbinding. Probeer opnieuw met een actieve internetverbinding.");
      setStap("foto_nemen");
    }
  }

  async function indienen() {
    setStap("laden");
    setFoutMelding(null);

    const kmStandGetal = parseInt(kmStandTekst.replace(/\D/g, ""), 10);
    const kmStandWaarde = !isNaN(kmStandGetal) ? kmStandGetal : null;

    const body = {
      type: "kwartaalcontrole",
      omschrijving: "Kwartaalcontrole uitgevoerd",
      foto_paden: fotoPad ? [fotoPad] : [],
      ai_fotokwaliteit_ok: aiResultaat?.fotokwaliteit_ok ?? true,
      ai_gelezen_km_stand: kmStandWaarde,
      ai_gelezen_waarschuwingen: aiResultaat?.waarschuwingen ?? [],
    };

    try {
      const resp = await fetch(`https://${DOMEIN}/api/wagenpark/meldingen`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (resp.status === 404) {
        setFoutMelding("Er is geen voertuig aan uw account gekoppeld.");
        setStap("bevestigen");
        return;
      }

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({})) as { error?: string };
        setFoutMelding(err.error ?? "Er is een fout opgetreden.");
        setStap("bevestigen");
        return;
      }

      const data = await resp.json() as MeldingResultaat;
      setEindResultaat(data);
      setStap("klaar");
    } catch {
      // Foto is al geüpload — alleen de POST hoeft nog
      try {
        await voegToeAanWachtrij({
          type: "create_melding",
          lokaalId: `kwartaalcontrole_${Date.now()}`,
          payload: {
            ...body,
            foto_paden: fotoPad ? [fotoPad] : [],
          },
          lokale_foto_paden: [],
        });
        setStap("offline_opgeslagen");
      } catch {
        setFoutMelding("Geen verbinding en opslaan mislukt. Controleer uw internet.");
        setStap("bevestigen");
      }
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
    kaart: { margin: 16, backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: "hidden" as const },
    kaartRij: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    rijLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: c.mutedForeground, textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 4 },
    rijTekst: { fontSize: 14, fontFamily: "Inter_400Regular", color: c.foreground, lineHeight: 20 },
    primairKnop: {
      marginHorizontal: 16,
      marginTop: 24,
      marginBottom: 12,
      backgroundColor: c.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center" as const,
    },
    primairKnopTekst: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
    secundairKnop: {
      marginHorizontal: 16,
      marginBottom: 24,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center" as const,
      borderWidth: 1,
      borderColor: c.border,
    },
    fout: { marginHorizontal: 16, marginTop: 12, backgroundColor: "#fee2e2", borderRadius: 8, padding: 12 },
    foutTekst: { color: "#dc2626", fontSize: 13, fontFamily: "Inter_400Regular" },
    centraal: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16, padding: 32 },
    invoer: {
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: c.foreground,
    },
  });

  const Header = ({ terug = true }: { terug?: boolean }) => (
    <View style={s.header}>
      {terug ? (
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={c.foreground} />
        </Pressable>
      ) : (
        <Ionicons name="clipboard-outline" size={22} color={c.primary} />
      )}
      <Text style={s.titel}>Kwartaalcontrole</Text>
    </View>
  );

  // ── Stap: laden ─────────────────────────────────────────────────────────────
  if (stap === "ai_bezig" || stap === "laden") {
    return (
      <View style={s.container}>
        <Header terug={false} />
        <View style={s.centraal}>
          <ActivityIndicator size="large" color={c.primary} />
          <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: c.mutedForeground, textAlign: "center" }}>
            {stap === "ai_bezig" ? "AI analyseert dashboardfoto..." : "Controle wordt vastgelegd..."}
          </Text>
        </View>
      </View>
    );
  }

  // ── Stap: offline opgeslagen ─────────────────────────────────────────────────
  if (stap === "offline_opgeslagen") {
    return (
      <View style={s.container}>
        <Header />
        <ScrollView>
          <View style={{ marginHorizontal: 16, marginTop: 20, flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#fef3c7", borderRadius: 10, padding: 14 }}>
            <Ionicons name="cloud-offline-outline" size={20} color="#d97706" style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#92400e" }}>Opgeslagen (offline)</Text>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: "#a16207", marginTop: 4, lineHeight: 18 }}>
                De kwartaalcontrole is lokaal opgeslagen en wordt automatisch verzonden zodra de verbinding hersteld is.
              </Text>
            </View>
          </View>
          <Pressable style={s.secundairKnop} onPress={() => router.back()}>
            <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.foreground }}>Sluiten</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ── Stap: AI fout (fotokwaliteit niet OK) ────────────────────────────────────
  if (stap === "ai_fout" && aiResultaat) {
    return (
      <View style={s.container}>
        <Header />
        <ScrollView>
          {fotoUri && (
            <Image source={{ uri: fotoUri }} style={{ margin: 16, height: 200, borderRadius: 12 }} resizeMode="cover" />
          )}
          <View style={{ marginHorizontal: 16, marginTop: 8, backgroundColor: "#fee2e2", borderRadius: 10, padding: 14 }}>
            <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#dc2626", marginBottom: 6 }}>Foto voldoet niet</Text>
            <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: "#7f1d1d", lineHeight: 18 }}>
              {aiResultaat.reden ?? "De foto is niet scherp genoeg of toont niet het dashboard. Probeer opnieuw."}
            </Text>
          </View>
          <Pressable style={s.primairKnop} onPress={() => { setFotoUri(null); setFotoPad(null); setAiResultaat(null); setStap("foto_nemen"); }}>
            <Text style={s.primairKnopTekst}>Opnieuw fotograferen</Text>
          </Pressable>
          <Pressable style={s.secundairKnop} onPress={() => router.back()}>
            <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.foreground }}>Annuleren</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ── Stap: klaar ──────────────────────────────────────────────────────────────
  if (stap === "klaar" && eindResultaat) {
    const voertuigLabel = [eindResultaat.voertuig_merk, eindResultaat.voertuig_type_naam, eindResultaat.voertuig_kenteken ? `(${eindResultaat.voertuig_kenteken})` : null]
      .filter(Boolean).join(" ");
    const heeftWaarschuwingen = (eindResultaat.ai_gelezen_waarschuwingen?.length ?? 0) > 0;

    return (
      <View style={s.container}>
        <Header />
        <ScrollView>
          <View style={{ marginHorizontal: 16, marginTop: 20, flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#dcfce7", borderRadius: 10, padding: 14 }}>
            <Ionicons name="checkmark-circle" size={20} color="#16a34a" style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#14532d" }}>Kwartaalcontrole vastgelegd</Text>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: "#166534", marginTop: 2 }}>
                {voertuigLabel || "Uw voertuig"}
              </Text>
            </View>
          </View>

          <View style={s.kaart}>
            <View style={s.kaartRij}>
              <Text style={s.rijLabel}>Kilometerstand</Text>
              <Text style={s.rijTekst}>
                {eindResultaat.ai_gelezen_km_stand != null
                  ? `${eindResultaat.ai_gelezen_km_stand.toLocaleString("nl-NL")} km`
                  : "Niet afleesbaar"}
              </Text>
            </View>
            <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              <Text style={s.rijLabel}>Waarschuwingen</Text>
              {heeftWaarschuwingen ? (
                (eindResultaat.ai_gelezen_waarschuwingen ?? []).map((w, i) => (
                  <Text key={i} style={[s.rijTekst, { marginTop: i > 0 ? 4 : 0 }]}>{"\u2022"} {w}</Text>
                ))
              ) : (
                <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: "#16a34a" }}>Geen waarschuwingen zichtbaar</Text>
              )}
            </View>
          </View>

          {heeftWaarschuwingen && (
            <View style={{ marginHorizontal: 16, marginBottom: 8, backgroundColor: "#fff7ed", borderRadius: 10, padding: 14, borderWidth: 1, borderColor: "#fed7aa" }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: "#9a3412", lineHeight: 18 }}>
                Er zijn waarschuwingen geconstateerd. De administratie ontvangt een melding voor verdere afhandeling.
              </Text>
            </View>
          )}

          <Pressable style={s.secundairKnop} onPress={() => router.back()}>
            <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.foreground }}>Sluiten</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ── Stap: bevestigen ─────────────────────────────────────────────────────────
  if (stap === "bevestigen" && aiResultaat) {
    return (
      <View style={s.container}>
        <Header />
        <ScrollView keyboardShouldPersistTaps="handled">
          {fotoUri && (
            <Image source={{ uri: fotoUri }} style={{ margin: 16, height: 180, borderRadius: 12 }} resizeMode="cover" />
          )}

          <View style={s.kaart}>
            <View style={s.kaartRij}>
              <Text style={s.rijLabel}>Kilometerstand</Text>
              <TextInput
                style={s.invoer}
                value={kmStandTekst}
                onChangeText={setKmStandTekst}
                keyboardType="numeric"
                placeholder="Voer kilometerstand in"
                placeholderTextColor={c.mutedForeground}
              />
              {aiResultaat.km_stand != null && (
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: c.mutedForeground, marginTop: 4 }}>
                  Automatisch afgelezen: {aiResultaat.km_stand.toLocaleString("nl-NL")} km
                </Text>
              )}
            </View>

            {aiResultaat.waarschuwingen.length > 0 && (
              <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                <Text style={s.rijLabel}>Gedetecteerde waarschuwingen</Text>
                {aiResultaat.waarschuwingen.map((w, i) => (
                  <Text key={i} style={[s.rijTekst, { marginTop: i > 0 ? 4 : 0, color: "#c2410c" }]}>{"\u2022"} {w}</Text>
                ))}
              </View>
            )}

            {aiResultaat.waarschuwingen.length === 0 && (
              <View style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: "#16a34a" }}>Geen waarschuwingslampjes zichtbaar</Text>
              </View>
            )}
          </View>

          {foutMelding && (
            <View style={s.fout}>
              <Text style={s.foutTekst}>{foutMelding}</Text>
            </View>
          )}

          <Pressable style={s.primairKnop} onPress={indienen}>
            <Text style={s.primairKnopTekst}>Bevestigen en vastleggen</Text>
          </Pressable>
          <Pressable style={s.secundairKnop} onPress={() => { setFotoUri(null); setFotoPad(null); setAiResultaat(null); setKmStandTekst(""); setStap("foto_nemen"); }}>
            <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.foreground }}>Opnieuw fotograferen</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ── Stap: foto nemen ─────────────────────────────────────────────────────────
  if (stap === "foto_nemen") {
    return (
      <View style={s.container}>
        <Header />
        <ScrollView>
          <View style={{ marginHorizontal: 16, marginTop: 20, backgroundColor: c.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: c.border }}>
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 8 }}>Dashboardfoto maken</Text>
            <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: c.mutedForeground, lineHeight: 20 }}>
              Fotografeer het volledige dashboard inclusief de kilometerteller. Zorg dat de foto scherp is en het scherm goed leesbaar.
            </Text>
          </View>

          {fotoUri && (
            <Image source={{ uri: fotoUri }} style={{ margin: 16, height: 180, borderRadius: 12 }} resizeMode="cover" />
          )}

          {foutMelding && (
            <View style={s.fout}>
              <Text style={s.foutTekst}>{foutMelding}</Text>
            </View>
          )}

          <Pressable style={s.primairKnop} onPress={maakFoto}>
            <Text style={s.primairKnopTekst}>
              {fotoUri ? "Andere foto maken" : "Foto maken"}
            </Text>
          </Pressable>
          <Pressable style={s.secundairKnop} onPress={() => router.back()}>
            <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.foreground }}>Annuleren</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ── Stap: instructie (standaard) ─────────────────────────────────────────────
  return (
    <View style={s.container}>
      <Header />
      <ScrollView>
        <View style={{ marginHorizontal: 16, marginTop: 20, flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: `${c.primary}15`, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: `${c.primary}40` }}>
          <Ionicons name="information-circle-outline" size={20} color={c.primary} style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: c.foreground, marginBottom: 6 }}>Wat is de kwartaalcontrole?</Text>
            <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: c.mutedForeground, lineHeight: 20 }}>
              Elke drie maanden controleert u kort de staat van uw voertuig. Maak een foto van het dashboard — de AI leest automatisch de kilometerstand en eventuele waarschuwingen af.
            </Text>
          </View>
        </View>

        <View style={{ marginHorizontal: 16, marginTop: 16 }}>
          {[
            "Start de motor zodat het dashboard volledig actief is",
            "Fotografeer het volledige instrumentenpaneel",
            "Zorg voor voldoende licht en een scherpe, rechte foto",
            "Controleer de afgelezen gegevens en bevestig",
          ].map((stap, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 12, marginBottom: 14, alignItems: "flex-start" }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.primary, justifyContent: "center", alignItems: "center" }}>
                <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: "#fff" }}>{i + 1}</Text>
              </View>
              <Text style={{ flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: c.foreground, lineHeight: 20 }}>{stap}</Text>
            </View>
          ))}
        </View>

        <Pressable style={s.primairKnop} onPress={() => setStap("foto_nemen")}>
          <Text style={s.primairKnopTekst}>Start kwartaalcontrole</Text>
        </Pressable>
        <Pressable style={s.secundairKnop} onPress={() => router.back()}>
          <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.foreground }}>Annuleren</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
