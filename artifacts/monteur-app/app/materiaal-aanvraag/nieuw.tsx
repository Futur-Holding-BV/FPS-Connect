import { API_DOMEIN } from "@/lib/apiDomein";
// Materiaal Aanvraag — monteur meldt artikel dat op/beschadigd/nodig is
// AI herkent het artikel, zoekt prijs/leverancier en toetst aan werkbegroting
import { Ionicons } from "@expo/vector-icons";
import { ruimte } from "@workspace/ontwerp";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
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

import { bovenInset, tekstStijl } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { uploadFoto } from "@/lib/upload";

const DOMEIN = API_DOMEIN;

type Reden = "op" | "beschadigd" | "nodig";
type VolgensOpdracht = "ja" | "wijkt_af" | "weet_niet";
type RedenSoort = "fout" | "waarschuwing" | "primair";

const REDEN_OPTIES: { waarde: Reden; label: string; icoon: keyof typeof Ionicons.glyphMap; soort: RedenSoort }[] = [
  { waarde: "op", label: "Op / verbruikt", icoon: "warning-outline", soort: "fout" },
  { waarde: "beschadigd", label: "Beschadigd", icoon: "construct-outline", soort: "waarschuwing" },
  { waarde: "nodig", label: "Nodig voor werk", icoon: "bag-add-outline", soort: "primair" },
];

const VOLGENS_OPDRACHT_OPTIES: { waarde: VolgensOpdracht; label: string }[] = [
  { waarde: "ja", label: "Ja" },
  { waarde: "wijkt_af", label: "Wijkt af" },
  { waarde: "weet_niet", label: "Weet ik niet" },
];

export default function MateriaalAanvraagNieuw() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ werkdag_id?: string; titel?: string; werknummer?: string }>();

  // Redensoort → paletkleur (geen letterlijke kleuren in dit bestand).
  const redenKleur = (soort: RedenSoort) =>
    soort === "fout" ? c.destructive : soort === "waarschuwing" ? c.warning : c.tint;

  const werkdagId = params.werkdag_id ? parseInt(params.werkdag_id, 10) : null;
  const opdrachtTitel = params.titel ?? null;
  const werknummer = params.werknummer ?? null;

  const [reden, setReden] = useState<Reden | null>(null);
  const [volgensOpdracht, setVolgensOpdracht] = useState<VolgensOpdracht | null>(null);
  const [omschrijving, setOmschrijving] = useState("");
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [verzonden, setVerzonden] = useState(false);
  const [verzondenVolgensOpdracht, setVerzondenVolgensOpdracht] = useState<VolgensOpdracht | null>(null);

  async function maakFoto() {
    const permCam = await ImagePicker.requestCameraPermissionsAsync();
    const permGal = await ImagePicker.requestMediaLibraryPermissionsAsync();

    const bronnen: { label: string; actie: () => Promise<ImagePicker.ImagePickerResult> }[] = [];
    if (permCam.status === "granted") {
      bronnen.push({
        label: "Camera",
        actie: () => ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 }),
      });
    }
    if (permGal.status === "granted") {
      bronnen.push({
        label: "Fotobibliotheek",
        actie: () => ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 }),
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
            Alert.alert("Foto kiezen", "Kies een bron", [
              ...bronnen.map((b) => ({ text: b.label, onPress: () => resolve(b.actie) })),
              { text: "Annuleren", style: "cancel", onPress: () => resolve(null) },
            ]);
          });

    if (!kies) return;
    const result = await kies();
    if (result.canceled || !result.assets[0]) return;
    setFotoUri(result.assets[0].uri);
  }

  async function verzend() {
    if (!reden) {
      Alert.alert("Reden verplicht", "Kies eerst een reden voor de aanvraag.");
      return;
    }
    if (!volgensOpdracht) {
      Alert.alert(
        "Antwoord verplicht",
        "Geef eerst aan of dit volgens de opdracht is.",
      );
      return;
    }
    if (!fotoUri) {
      Alert.alert("Foto verplicht", "Voeg een foto toe zodat de werkvoorbereider het artikel kan herkennen.");
      return;
    }
    if (!werkdagId) {
      Alert.alert("Geen werkdag", "Open deze melding vanuit een werkdag.");
      return;
    }

    setBezig(true);
    try {
      const fotoPad = await uploadFoto(fotoUri);

      const resp = await fetch(`https://${DOMEIN}/api/materiaal-aanvragen`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          werkdag_id: werkdagId,
          reden,
          volgens_opdracht: volgensOpdracht,
          omschrijving: omschrijving.trim() || null,
          foto_pad: fotoPad,
        }),
      });

      if (!resp.ok) {
        const fout = await resp.json().catch(() => ({})) as { error?: string };
        throw new Error(fout.error ?? "Verzenden mislukt");
      }

      setVerzondenVolgensOpdracht(volgensOpdracht);
      setVerzonden(true);
    } catch (err) {
      Alert.alert("Fout", err instanceof Error ? err.message : "Onbekende fout. Probeer opnieuw.");
    } finally {
      setBezig(false);
    }
  }

  if (verzonden) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, justifyContent: "center", alignItems: "center", padding: ruimte.xxl }}>
        <View
          style={{
            width: ruimte.xxl * 2,
            height: ruimte.xxl * 2,
            borderRadius: ruimte.xxl,
            backgroundColor: c.accent,
            justifyContent: "center",
            alignItems: "center",
            marginBottom: ruimte.l + ruimte.xs,
          }}
        >
          <Ionicons name="checkmark-circle" size={36} color={c.success} />
        </View>
        <Text style={[tekstStijl("sectiekop", c.foreground), { textAlign: "center", marginBottom: ruimte.s }]}>
          Melding verzonden
        </Text>
        <Text style={[tekstStijl("standaard", c.mutedForeground), { textAlign: "center", marginBottom: ruimte.xxl }]}>
          De werkvoorbereider ontvangt uw melding. AI analyseert het artikel en controleert de werkbegroting.
        </Text>
        {(verzondenVolgensOpdracht === "wijkt_af" || verzondenVolgensOpdracht === "weet_niet") && (
          <View
            style={{
              backgroundColor: c.secondary,
              borderWidth: 1,
              borderColor: c.warning,
              borderRadius: c.radius,
              padding: ruimte.m + 2,
              marginBottom: ruimte.xxl,
              flexDirection: "row",
              gap: ruimte.s + 2,
              alignItems: "flex-start",
            }}
          >
            <Ionicons name="information-circle-outline" size={ruimte.l + 2} color={c.warning} style={{ marginTop: 1 }} />
            <Text style={[tekstStijl("klein", c.foreground), { flex: 1 }]}>
              Omdat dit afwijkt van of niet zeker volgens de opdracht is, gaat de aanvraag eerst langs de werkvoorbereider ter controle.
            </Text>
          </View>
        )}
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({ backgroundColor: c.tint, borderRadius: c.radius, paddingHorizontal: ruimte.xl + ruimte.xs, paddingVertical: ruimte.m, opacity: pressed ? 0.85 : 1 })}
        >
          <Text style={tekstStijl("nadruk", c.primaryForeground)}>Terug naar werkdag</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View
        style={{
          backgroundColor: c.card,
          paddingTop: bovenInset(insets),
          paddingBottom: ruimte.m + 2,
          paddingHorizontal: ruimte.l,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
          flexDirection: "row",
          alignItems: "center",
          gap: ruimte.m,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={{ padding: ruimte.xs }}
        >
          <Ionicons name="chevron-back" size={ruimte.xl} color={c.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={tekstStijl("sectiekop", c.foreground)}>
            Materiaal melden
          </Text>
          {(opdrachtTitel ?? werknummer) ? (
            <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 1 }]}>
              {[werknummer, opdrachtTitel].filter(Boolean).join(" — ")}
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: ruimte.l, gap: ruimte.l, paddingBottom: ruimte.xxl + ruimte.s }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Reden */}
        <View>
          <Text style={[tekstStijl("nadruk", c.foreground), { marginBottom: ruimte.s + 2 }]}>
            Reden
          </Text>
          <View style={{ gap: ruimte.s }}>
            {REDEN_OPTIES.map((opt) => {
              const geselecteerd = reden === opt.waarde;
              const kleur = redenKleur(opt.soort);
              return (
                <Pressable
                  key={opt.waarde}
                  onPress={() => setReden(opt.waarde)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: ruimte.m,
                    backgroundColor: geselecteerd ? c.accent : c.card,
                    borderWidth: 1.5,
                    borderColor: geselecteerd ? kleur : c.border,
                    borderRadius: c.radius,
                    padding: ruimte.m + 2,
                  }}
                >
                  <View
                    style={{
                      width: ruimte.xxl,
                      height: ruimte.xxl,
                      borderRadius: c.radius / 2,
                      backgroundColor: c.secondary,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Ionicons name={opt.icoon} size={ruimte.l + 2} color={kleur} />
                  </View>
                  <Text style={tekstStijl(geselecteerd ? "nadruk" : "standaard", geselecteerd ? kleur : c.foreground)}>
                    {opt.label}
                  </Text>
                  {geselecteerd && (
                    <Ionicons name="checkmark-circle" size={ruimte.l + 2} color={kleur} style={{ marginLeft: "auto" }} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Is dit volgens de opdracht? */}
        <View>
          <Text style={[tekstStijl("nadruk", c.foreground), { marginBottom: ruimte.xs }]}>
            Is dit volgens de opdracht?
            <Text style={tekstStijl("standaard", c.destructive)}> *</Text>
          </Text>
          <Text style={[tekstStijl("bijschrift", c.mutedForeground), { marginBottom: ruimte.s + 2 }]}>
            Verplicht. "Weet ik niet" is een geldig antwoord.
          </Text>
          <View style={{ flexDirection: "row", gap: ruimte.s }}>
            {VOLGENS_OPDRACHT_OPTIES.map((opt) => {
              const geselecteerd = volgensOpdracht === opt.waarde;
              return (
                <Pressable
                  key={opt.waarde}
                  onPress={() => setVolgensOpdracht(opt.waarde)}
                  style={{
                    flex: 1,
                    backgroundColor: geselecteerd ? c.accent : c.card,
                    borderWidth: 1.5,
                    borderColor: geselecteerd ? c.tint : c.border,
                    borderRadius: c.radius,
                    paddingVertical: ruimte.m + 2,
                    paddingHorizontal: ruimte.s,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={[tekstStijl(geselecteerd ? "nadruk" : "standaard", geselecteerd ? c.tint : c.foreground), { textAlign: "center" }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {!volgensOpdracht && (
            <Text style={[tekstStijl("bijschrift", c.mutedForeground), { marginTop: ruimte.xs + 2 }]}>
              Zonder antwoord kunt u de melding niet indienen.
            </Text>
          )}
        </View>

        {/* Foto */}
        <View>
          <Text style={[tekstStijl("nadruk", c.foreground), { marginBottom: ruimte.s + 2 }]}>
            Foto
            <Text style={tekstStijl("standaard", c.destructive)}> *</Text>
          </Text>
          {fotoUri ? (
            <View>
              <Image
                source={{ uri: fotoUri }}
                style={{ width: "100%", height: 220, borderRadius: c.radius, backgroundColor: c.muted }}
                resizeMode="cover"
              />
              <Pressable
                onPress={() => setFotoUri(null)}
                style={{ position: "absolute", top: ruimte.s, right: ruimte.s, backgroundColor: c.dark + "aa", borderRadius: ruimte.l + ruimte.xs, padding: ruimte.xs + 2 }}
              >
                <Ionicons name="close" size={ruimte.l} color={c.primaryForeground} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => void maakFoto()}
              style={{
                height: 160,
                borderWidth: 2,
                borderStyle: "dashed",
                borderColor: c.border,
                borderRadius: c.radius,
                backgroundColor: c.card,
                justifyContent: "center",
                alignItems: "center",
                gap: ruimte.s,
              }}
            >
              <Ionicons name="camera-outline" size={ruimte.xxl} color={c.mutedForeground} />
              <Text style={tekstStijl("klein", c.mutedForeground)}>
                Foto toevoegen
              </Text>
            </Pressable>
          )}
        </View>

        {/* Omschrijving */}
        <View>
          <Text style={[tekstStijl("nadruk", c.foreground), { marginBottom: ruimte.s }]}>
            Toelichting (optioneel)
          </Text>
          <TextInput
            value={omschrijving}
            onChangeText={setOmschrijving}
            placeholder="Bijv. DN75 manchet voor doorvoering in scheidingswand 2e verdieping"
            placeholderTextColor={c.mutedForeground}
            multiline
            numberOfLines={3}
            style={[
              tekstStijl("klein", c.foreground),
              {
                backgroundColor: c.card,
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: c.radius,
                padding: ruimte.m,
                minHeight: ruimte.xxl * 2 + ruimte.l,
                textAlignVertical: "top",
              },
            ]}
          />
          <Text style={[tekstStijl("bijschrift", c.mutedForeground), { marginTop: ruimte.xs }]}>
            AI analyseert het artikel op basis van foto en toelichting.
          </Text>
        </View>

        {/* Verzend knop */}
        <Pressable
          onPress={() => void verzend()}
          disabled={bezig || !reden || !volgensOpdracht || !fotoUri}
          style={({ pressed }) => ({
            backgroundColor:
              !reden || !volgensOpdracht || !fotoUri ? c.muted : c.tint,
            opacity: pressed && reden && volgensOpdracht && fotoUri ? 0.85 : 1,
            borderRadius: c.radius,
            paddingVertical: ruimte.m + 2,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: ruimte.s,
            marginTop: ruimte.s,
          })}
        >
          {bezig ? (
            <ActivityIndicator size="small" color={c.primaryForeground} />
          ) : (
            <Ionicons name="send-outline" size={ruimte.l} color={!reden || !volgensOpdracht || !fotoUri ? c.mutedForeground : c.primaryForeground} />
          )}
          <Text style={tekstStijl("nadruk", !reden || !volgensOpdracht || !fotoUri ? c.mutedForeground : c.primaryForeground)}>
            {bezig ? "Verzenden..." : "Melding verzenden"}
          </Text>
        </Pressable>

        <Text style={[tekstStijl("bijschrift", c.mutedForeground), { textAlign: "center" }]}>
          De werkvoorbereider ontvangt de melding direct. AI zoekt het artikel op, vergelijkt met de werkbegroting en geeft advies.
        </Text>
      </ScrollView>
    </View>
  );
}
