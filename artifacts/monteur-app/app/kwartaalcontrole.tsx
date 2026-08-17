import { API_DOMEIN } from "@/lib/apiDomein";
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
import { ruimte } from "@workspace/ontwerp";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/context/auth";
import { uploadFoto } from "@/lib/upload";
import { voegToeAanWachtrij } from "@/lib/syncQueue";
import { useColors } from "@/hooks/useColors";
import { Waarschuwvlak, tekstStijl } from "@/components/ui";

const DOMEIN = API_DOMEIN;

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
      paddingHorizontal: ruimte.l,
      paddingTop: ruimte.l,
      paddingBottom: ruimte.m,
      gap: ruimte.m,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.card,
    },
    titel: { ...tekstStijl("sectiekop", c.foreground), flex: 1 },
    kaart: { margin: ruimte.l, backgroundColor: c.card, borderRadius: c.radius, borderWidth: 1, borderColor: c.border, overflow: "hidden" as const },
    kaartRij: { paddingHorizontal: ruimte.l, paddingVertical: ruimte.m, borderBottomWidth: 1, borderBottomColor: c.border },
    rijLabel: { ...tekstStijl("bijschrift", c.mutedForeground), textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: ruimte.xs },
    rijTekst: { ...tekstStijl("klein", c.foreground), lineHeight: 20 },
    primairKnop: {
      marginHorizontal: ruimte.l,
      marginTop: ruimte.xl,
      marginBottom: ruimte.m,
      backgroundColor: c.primary,
      borderRadius: c.radius,
      paddingVertical: ruimte.m + 2,
      alignItems: "center" as const,
    },
    primairKnopTekst: { ...tekstStijl("nadruk", c.primaryForeground) },
    secundairKnop: {
      marginHorizontal: ruimte.l,
      marginBottom: ruimte.xl,
      borderRadius: c.radius,
      paddingVertical: ruimte.m + 2,
      alignItems: "center" as const,
      borderWidth: 1,
      borderColor: c.border,
    },
    centraal: { flex: 1, justifyContent: "center", alignItems: "center", gap: ruimte.l, padding: ruimte.xxl },
    invoer: {
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: c.radius,
      paddingHorizontal: ruimte.m + 2,
      paddingVertical: ruimte.s + 2,
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
          <Text style={[tekstStijl("klein", c.mutedForeground), { textAlign: "center" }]}>
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
          <View style={{ marginHorizontal: ruimte.l, marginTop: ruimte.l + ruimte.xs }}>
            <Waarschuwvlak
              soort="waarschuwing"
              tekst="Opgeslagen (offline). De kwartaalcontrole is lokaal opgeslagen en wordt automatisch verzonden zodra de verbinding hersteld is."
            />
          </View>
          <Pressable style={s.secundairKnop} onPress={() => router.back()}>
            <Text style={tekstStijl("nadruk", c.foreground)}>Sluiten</Text>
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
            <Image source={{ uri: fotoUri }} style={{ margin: ruimte.l, height: 200, borderRadius: c.radius }} resizeMode="cover" />
          )}
          <View style={{ marginHorizontal: ruimte.l, marginTop: ruimte.s }}>
            <Waarschuwvlak
              soort="fout"
              tekst={`Foto voldoet niet. ${aiResultaat.reden ?? "De foto is niet scherp genoeg of toont niet het dashboard. Probeer opnieuw."}`}
            />
          </View>
          <Pressable style={s.primairKnop} onPress={() => { setFotoUri(null); setFotoPad(null); setAiResultaat(null); setStap("foto_nemen"); }}>
            <Text style={s.primairKnopTekst}>Opnieuw fotograferen</Text>
          </Pressable>
          <Pressable style={s.secundairKnop} onPress={() => router.back()}>
            <Text style={tekstStijl("nadruk", c.foreground)}>Annuleren</Text>
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
          <View style={{ marginHorizontal: ruimte.l, marginTop: ruimte.l + ruimte.xs, flexDirection: "row", alignItems: "flex-start", gap: ruimte.s + 2, backgroundColor: c.secondary, borderRadius: c.radius, padding: ruimte.m + 2 }}>
            <Ionicons name="checkmark-circle" size={ruimte.l + 2} color={c.success} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={tekstStijl("nadruk", c.foreground)}>Kwartaalcontrole vastgelegd</Text>
              <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 2 }]}>
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
            <View style={{ paddingHorizontal: ruimte.l, paddingVertical: ruimte.m }}>
              <Text style={s.rijLabel}>Waarschuwingen</Text>
              {heeftWaarschuwingen ? (
                (eindResultaat.ai_gelezen_waarschuwingen ?? []).map((w, i) => (
                  <Text key={i} style={[s.rijTekst, { marginTop: i > 0 ? ruimte.xs : 0 }]}>{"\u2022"} {w}</Text>
                ))
              ) : (
                <Text style={tekstStijl("klein", c.success)}>Geen waarschuwingen zichtbaar</Text>
              )}
            </View>
          </View>

          {heeftWaarschuwingen && (
            <View style={{ marginHorizontal: ruimte.l, marginBottom: ruimte.s }}>
              <Waarschuwvlak
                soort="waarschuwing"
                tekst="Er zijn waarschuwingen geconstateerd. De administratie ontvangt een melding voor verdere afhandeling."
              />
            </View>
          )}

          <Pressable style={s.secundairKnop} onPress={() => router.back()}>
            <Text style={tekstStijl("nadruk", c.foreground)}>Sluiten</Text>
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
            <Image source={{ uri: fotoUri }} style={{ margin: ruimte.l, height: 180, borderRadius: c.radius }} resizeMode="cover" />
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
                <Text style={[tekstStijl("bijschrift", c.mutedForeground), { marginTop: ruimte.xs }]}>
                  Automatisch afgelezen: {aiResultaat.km_stand.toLocaleString("nl-NL")} km
                </Text>
              )}
            </View>

            {aiResultaat.waarschuwingen.length > 0 && (
              <View style={{ paddingHorizontal: ruimte.l, paddingVertical: ruimte.m }}>
                <Text style={s.rijLabel}>Gedetecteerde waarschuwingen</Text>
                {aiResultaat.waarschuwingen.map((w, i) => (
                  <Text key={i} style={[tekstStijl("klein", c.warning), { marginTop: i > 0 ? ruimte.xs : 0, lineHeight: 20 }]}>{"\u2022"} {w}</Text>
                ))}
              </View>
            )}

            {aiResultaat.waarschuwingen.length === 0 && (
              <View style={{ paddingHorizontal: ruimte.l, paddingVertical: ruimte.m, flexDirection: "row", gap: ruimte.s, alignItems: "center" }}>
                <Ionicons name="checkmark-circle" size={ruimte.l} color={c.success} />
                <Text style={tekstStijl("klein", c.success)}>Geen waarschuwingslampjes zichtbaar</Text>
              </View>
            )}
          </View>

          {foutMelding && (
            <View style={{ marginHorizontal: ruimte.l, marginTop: ruimte.m }}>
              <Waarschuwvlak soort="fout" tekst={foutMelding} />
            </View>
          )}

          <Pressable style={s.primairKnop} onPress={indienen}>
            <Text style={s.primairKnopTekst}>Bevestigen en vastleggen</Text>
          </Pressable>
          <Pressable style={s.secundairKnop} onPress={() => { setFotoUri(null); setFotoPad(null); setAiResultaat(null); setKmStandTekst(""); setStap("foto_nemen"); }}>
            <Text style={tekstStijl("nadruk", c.foreground)}>Opnieuw fotograferen</Text>
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
          <View style={{ marginHorizontal: ruimte.l, marginTop: ruimte.l + ruimte.xs, backgroundColor: c.card, borderRadius: c.radius, padding: ruimte.l, borderWidth: 1, borderColor: c.border }}>
            <Text style={[tekstStijl("nadruk", c.foreground), { marginBottom: ruimte.s }]}>Dashboardfoto maken</Text>
            <Text style={[tekstStijl("klein", c.mutedForeground), { lineHeight: 20 }]}>
              Fotografeer het volledige dashboard inclusief de kilometerteller. Zorg dat de foto scherp is en het scherm goed leesbaar.
            </Text>
          </View>

          {fotoUri && (
            <Image source={{ uri: fotoUri }} style={{ margin: ruimte.l, height: 180, borderRadius: c.radius }} resizeMode="cover" />
          )}

          {foutMelding && (
            <View style={{ marginHorizontal: ruimte.l, marginTop: ruimte.m }}>
              <Waarschuwvlak soort="fout" tekst={foutMelding} />
            </View>
          )}

          <Pressable style={s.primairKnop} onPress={maakFoto}>
            <Text style={s.primairKnopTekst}>
              {fotoUri ? "Andere foto maken" : "Foto maken"}
            </Text>
          </Pressable>
          <Pressable style={s.secundairKnop} onPress={() => router.back()}>
            <Text style={tekstStijl("nadruk", c.foreground)}>Annuleren</Text>
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
        <View style={{ marginHorizontal: ruimte.l, marginTop: ruimte.l + ruimte.xs, flexDirection: "row", alignItems: "flex-start", gap: ruimte.s + 2, backgroundColor: c.accent, borderRadius: c.radius, padding: ruimte.m + 2, borderWidth: 1, borderColor: c.border }}>
          <Ionicons name="information-circle-outline" size={ruimte.l + 2} color={c.primary} style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={[tekstStijl("nadruk", c.foreground), { marginBottom: ruimte.xs + 2 }]}>Wat is de kwartaalcontrole?</Text>
            <Text style={[tekstStijl("klein", c.mutedForeground), { lineHeight: 20 }]}>
              Elke drie maanden controleert u kort de staat van uw voertuig. Maak een foto van het dashboard — de AI leest automatisch de kilometerstand en eventuele waarschuwingen af.
            </Text>
          </View>
        </View>

        <View style={{ marginHorizontal: ruimte.l, marginTop: ruimte.l }}>
          {[
            "Start de motor zodat het dashboard volledig actief is",
            "Fotografeer het volledige instrumentenpaneel",
            "Zorg voor voldoende licht en een scherpe, rechte foto",
            "Controleer de afgelezen gegevens en bevestig",
          ].map((stap, i) => (
            <View key={i} style={{ flexDirection: "row", gap: ruimte.m, marginBottom: ruimte.m + 2, alignItems: "flex-start" }}>
              <View style={{ width: ruimte.l + ruimte.s, height: ruimte.l + ruimte.s, borderRadius: c.radius, backgroundColor: c.primary, justifyContent: "center", alignItems: "center" }}>
                <Text style={tekstStijl("bijschrift", c.primaryForeground)}>{i + 1}</Text>
              </View>
              <Text style={[tekstStijl("klein", c.foreground), { flex: 1, lineHeight: 20 }]}>{stap}</Text>
            </View>
          ))}
        </View>

        <Pressable style={s.primairKnop} onPress={() => setStap("foto_nemen")}>
          <Text style={s.primairKnopTekst}>Start kwartaalcontrole</Text>
        </Pressable>
        <Pressable style={s.secundairKnop} onPress={() => router.back()}>
          <Text style={tekstStijl("nadruk", c.foreground)}>Annuleren</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
