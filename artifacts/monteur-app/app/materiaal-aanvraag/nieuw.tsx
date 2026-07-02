// Materiaal Aanvraag — monteur meldt artikel dat op/beschadigd/nodig is
// AI herkent het artikel, zoekt prijs/leverancier en toetst aan werkbegroting
import { Ionicons } from "@expo/vector-icons";
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

import { bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { uploadFoto } from "@/lib/upload";

const DOMEIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";

type Reden = "op" | "beschadigd" | "nodig";

const REDEN_OPTIES: { waarde: Reden; label: string; icoon: keyof typeof Ionicons.glyphMap; kleur: string }[] = [
  { waarde: "op", label: "Op / verbruikt", icoon: "warning-outline", kleur: "#dc2626" },
  { waarde: "beschadigd", label: "Beschadigd", icoon: "construct-outline", kleur: "#d97706" },
  { waarde: "nodig", label: "Nodig voor werk", icoon: "bag-add-outline", kleur: "#2563eb" },
];

export default function MateriaalAanvraagNieuw() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ werkdag_id?: string; titel?: string; werknummer?: string }>();

  const werkdagId = params.werkdag_id ? parseInt(params.werkdag_id, 10) : null;
  const opdrachtTitel = params.titel ?? null;
  const werknummer = params.werknummer ?? null;

  const [reden, setReden] = useState<Reden | null>(null);
  const [omschrijving, setOmschrijving] = useState("");
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [verzonden, setVerzonden] = useState(false);

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
          omschrijving: omschrijving.trim() || null,
          foto_pad: fotoPad,
        }),
      });

      if (!resp.ok) {
        const fout = await resp.json().catch(() => ({})) as { error?: string };
        throw new Error(fout.error ?? "Verzenden mislukt");
      }

      setVerzonden(true);
    } catch (err) {
      Alert.alert("Fout", err instanceof Error ? err.message : "Onbekende fout. Probeer opnieuw.");
    } finally {
      setBezig(false);
    }
  }

  if (verzonden) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, justifyContent: "center", alignItems: "center", padding: 32 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: "#16a34a22",
            justifyContent: "center",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <Ionicons name="checkmark-circle" size={36} color="#16a34a" />
        </View>
        <Text style={{ color: c.foreground, fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 8 }}>
          Melding verzonden
        </Text>
        <Text style={{ color: c.mutedForeground, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, marginBottom: 32 }}>
          De werkvoorbereider ontvangt uw melding. AI analyseert het artikel en controleert de werkbegroting.
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={{ backgroundColor: c.tint, borderRadius: 10, paddingHorizontal: 28, paddingVertical: 12 }}
        >
          <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" }}>Terug naar werkdag</Text>
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
          paddingBottom: 14,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={{ padding: 4 }}
        >
          <Ionicons name="chevron-back" size={22} color={c.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.foreground, fontSize: 16, fontFamily: "Inter_700Bold" }}>
            Materiaal melden
          </Text>
          {(opdrachtTitel ?? werknummer) ? (
            <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 }}>
              {[werknummer, opdrachtTitel].filter(Boolean).join(" — ")}
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Reden */}
        <View>
          <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 10 }}>
            Reden
          </Text>
          <View style={{ gap: 8 }}>
            {REDEN_OPTIES.map((opt) => {
              const geselecteerd = reden === opt.waarde;
              return (
                <Pressable
                  key={opt.waarde}
                  onPress={() => setReden(opt.waarde)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    backgroundColor: geselecteerd ? opt.kleur + "18" : c.card,
                    borderWidth: 1.5,
                    borderColor: geselecteerd ? opt.kleur : c.border,
                    borderRadius: 10,
                    padding: 14,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      backgroundColor: opt.kleur + "22",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Ionicons name={opt.icoon} size={18} color={opt.kleur} />
                  </View>
                  <Text
                    style={{
                      color: geselecteerd ? opt.kleur : c.foreground,
                      fontSize: 14,
                      fontFamily: geselecteerd ? "Inter_600SemiBold" : "Inter_400Regular",
                    }}
                  >
                    {opt.label}
                  </Text>
                  {geselecteerd && (
                    <Ionicons name="checkmark-circle" size={18} color={opt.kleur} style={{ marginLeft: "auto" }} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Foto */}
        <View>
          <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 10 }}>
            Foto
            <Text style={{ color: "#dc2626", fontFamily: "Inter_400Regular" }}> *</Text>
          </Text>
          {fotoUri ? (
            <View>
              <Image
                source={{ uri: fotoUri }}
                style={{ width: "100%", height: 220, borderRadius: 10, backgroundColor: c.muted }}
                resizeMode="cover"
              />
              <Pressable
                onPress={() => setFotoUri(null)}
                style={{ position: "absolute", top: 8, right: 8, backgroundColor: "#000000aa", borderRadius: 20, padding: 6 }}
              >
                <Ionicons name="close" size={16} color="#fff" />
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
                borderRadius: 10,
                backgroundColor: c.card,
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Ionicons name="camera-outline" size={32} color={c.mutedForeground} />
              <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular" }}>
                Foto toevoegen
              </Text>
            </Pressable>
          )}
        </View>

        {/* Omschrijving */}
        <View>
          <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 8 }}>
            Toelichting (optioneel)
          </Text>
          <TextInput
            value={omschrijving}
            onChangeText={setOmschrijving}
            placeholder="Bijv. DN75 manchet voor doorvoering in scheidingswand 2e verdieping"
            placeholderTextColor={c.mutedForeground}
            multiline
            numberOfLines={3}
            style={{
              backgroundColor: c.card,
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: 10,
              padding: 12,
              color: c.foreground,
              fontSize: 14,
              fontFamily: "Inter_400Regular",
              minHeight: 80,
              textAlignVertical: "top",
            }}
          />
          <Text style={{ color: c.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 }}>
            AI analyseert het artikel op basis van foto en toelichting.
          </Text>
        </View>

        {/* Verzend knop */}
        <Pressable
          onPress={() => void verzend()}
          disabled={bezig || !reden || !fotoUri}
          style={({ pressed }) => ({
            backgroundColor:
              !reden || !fotoUri ? c.muted : pressed ? "#c93009" : c.tint,
            borderRadius: 10,
            paddingVertical: 14,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 8,
            marginTop: 8,
          })}
        >
          {bezig ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send-outline" size={16} color={!reden || !fotoUri ? c.mutedForeground : "#fff"} />
          )}
          <Text
            style={{
              color: !reden || !fotoUri ? c.mutedForeground : "#fff",
              fontSize: 14,
              fontFamily: "Inter_600SemiBold",
            }}
          >
            {bezig ? "Verzenden..." : "Melding verzenden"}
          </Text>
        </Pressable>

        <Text style={{ color: c.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 16 }}>
          De werkvoorbereider ontvangt de melding direct. AI zoekt het artikel op, vergelijkt met de werkbegroting en geeft advies.
        </Text>
      </ScrollView>
    </View>
  );
}
