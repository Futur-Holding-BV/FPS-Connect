// Meer-/minderwerk melden vanaf de bouwplaats (BOUW_01 §4).
// ALLE velden verplicht; indienen pas mogelijk als alles is ingevuld.
// Per veld wordt duidelijk gemaakt wat ontbreekt.
import {
  useMeldMeerwerk,
  MeerwerkMeldingInputType,
  type MeerwerkMeldingInput,
} from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bovenInset } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { uploadFoto } from "@/lib/upload";

type Type = "meerwerk" | "minderwerk";

export default function MeerwerkMelden() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { formMaxBreedte } = useResponsive();
  const { id } = useLocalSearchParams<{ id: string }>();
  const opdrachtId = Number(id);

  const meldMut = useMeldMeerwerk();

  const [type, setType] = useState<Type | null>(null);
  const [fotoUris, setFotoUris] = useState<string[]>([]);
  const [omschrijving, setOmschrijving] = useState("");
  const [impactMateriaal, setImpactMateriaal] = useState("");
  const [impactUren, setImpactUren] = useState("");
  const [impactPlanning, setImpactPlanning] = useState("");
  const [bezig, setBezig] = useState(false);
  const [poging, setPoging] = useState(false);
  const [verzonden, setVerzonden] = useState(false);

  const ontbreekt = {
    type: type == null,
    fotos: fotoUris.length < 1,
    omschrijving: omschrijving.trim().length === 0,
    impact_materiaal: impactMateriaal.trim().length === 0,
    impact_uren: impactUren.trim().length === 0,
    impact_planning: impactPlanning.trim().length === 0,
  };
  const compleet = !Object.values(ontbreekt).some(Boolean);

  async function voegFotoToe() {
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
    setFotoUris((huidig) => [...huidig, result.assets[0]!.uri]);
  }

  async function verzend() {
    setPoging(true);
    if (!compleet || type == null) {
      Alert.alert(
        "Nog niet compleet",
        "Vul alle velden in. Een ruwe schatting is genoeg, leeg laten niet.",
      );
      return;
    }

    setBezig(true);
    try {
      const fotos: string[] = [];
      for (const uri of fotoUris) {
        fotos.push(await uploadFoto(uri));
      }

      const body: MeerwerkMeldingInput = {
        type: type === "meerwerk" ? MeerwerkMeldingInputType.meerwerk : MeerwerkMeldingInputType.minderwerk,
        fotos,
        omschrijving: omschrijving.trim(),
        impact_materiaal: impactMateriaal.trim(),
        impact_uren: impactUren.trim(),
        impact_planning: impactPlanning.trim(),
      };

      await meldMut.mutateAsync({ id: opdrachtId, data: body });
      setVerzonden(true);
    } catch (err) {
      let bericht = "Onbekende fout. Probeer opnieuw.";
      const resp = (err as { status?: number; data?: { ontbrekende_velden?: string[] } });
      if (resp?.status === 400 && Array.isArray(resp.data?.ontbrekende_velden)) {
        bericht = `Ontbrekende velden: ${resp.data!.ontbrekende_velden!.join(", ")}. Een ruwe schatting is genoeg, leeg laten niet.`;
      } else if (err instanceof Error && err.message) {
        bericht = err.message;
      }
      Alert.alert("Fout", bericht);
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
          Gemeld bij werkvoorbereiding, cc projectleider.
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={{ backgroundColor: c.tint, borderRadius: 10, paddingHorizontal: 28, paddingVertical: 12 }}
        >
          <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" }}>Terug</Text>
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
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={22} color={c.foreground} />
        </Pressable>
        <Text style={{ color: c.foreground, fontSize: 16, fontFamily: "Inter_700Bold" }}>
          Meer-/minderwerk melden
        </Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 40, width: "100%", maxWidth: formMaxBreedte, alignSelf: "center" }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Type */}
          <Veld label="Type" ontbreekt={poging && ontbreekt.type}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["meerwerk", "minderwerk"] as Type[]).map((t) => {
                const gesel = type === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => setType(t)}
                    style={{
                      flex: 1,
                      alignItems: "center",
                      paddingVertical: 14,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: gesel ? c.primary : c.border,
                      backgroundColor: gesel ? c.primary + "18" : c.card,
                    }}
                  >
                    <Text
                      style={{
                        color: gesel ? c.primary : c.foreground,
                        fontSize: 14,
                        fontFamily: gesel ? "Inter_600SemiBold" : "Inter_400Regular",
                      }}
                    >
                      {t === "meerwerk" ? "Meerwerk" : "Minderwerk"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Veld>

          {/* Foto's */}
          <Veld label="Foto's (minimaal 1)" ontbreekt={poging && ontbreekt.fotos}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {fotoUris.map((uri, i) => (
                <View key={`${uri}-${i}`}>
                  <Image source={{ uri }} style={{ width: 96, height: 96, borderRadius: 10, backgroundColor: c.muted }} resizeMode="cover" />
                  <Pressable
                    onPress={() => setFotoUris((h) => h.filter((_, idx) => idx !== i))}
                    style={{ position: "absolute", top: 4, right: 4, backgroundColor: "#000000aa", borderRadius: 20, padding: 4 }}
                  >
                    <Ionicons name="close" size={14} color="#fff" />
                  </Pressable>
                </View>
              ))}
              <Pressable
                onPress={() => void voegFotoToe()}
                style={{
                  width: 96,
                  height: 96,
                  borderWidth: 2,
                  borderStyle: "dashed",
                  borderColor: c.border,
                  borderRadius: 10,
                  backgroundColor: c.card,
                  justifyContent: "center",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Ionicons name="camera-outline" size={26} color={c.mutedForeground} />
                <Text style={{ color: c.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular" }}>Toevoegen</Text>
              </Pressable>
            </View>
          </Veld>

          {/* Omschrijving */}
          <Veld label="Omschrijving" ontbreekt={poging && ontbreekt.omschrijving}>
            <Invoer
              value={omschrijving}
              onChangeText={setOmschrijving}
              placeholder="Wat is er anders dan afgesproken?"
              meerregelig
            />
          </Veld>

          {/* Impact materiaal */}
          <Veld label="Impact materiaal" ontbreekt={poging && ontbreekt.impact_materiaal}>
            <Invoer
              value={impactMateriaal}
              onChangeText={setImpactMateriaal}
              placeholder="Bijv. 20 m extra kabelgoot"
            />
          </Veld>

          {/* Impact uren */}
          <Veld label="Impact uren" ontbreekt={poging && ontbreekt.impact_uren}>
            <Invoer
              value={impactUren}
              onChangeText={setImpactUren}
              placeholder="Bijv. circa 4 uur extra"
            />
          </Veld>

          {/* Impact planning */}
          <Veld label="Impact planning" ontbreekt={poging && ontbreekt.impact_planning}>
            <Invoer
              value={impactPlanning}
              onChangeText={setImpactPlanning}
              placeholder="Bijv. 1 dag later klaar"
            />
          </Veld>

          <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" }}>
            Alle velden zijn verplicht. Een ruwe schatting is genoeg, leeg laten niet.
          </Text>

          {/* Verzend */}
          <Pressable
            onPress={() => void verzend()}
            disabled={bezig}
            style={({ pressed }) => ({
              backgroundColor: !compleet ? c.muted : pressed ? "#c93009" : c.tint,
              borderRadius: 10,
              paddingVertical: 14,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 8,
              opacity: bezig ? 0.7 : 1,
            })}
          >
            {bezig ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send-outline" size={16} color={!compleet ? c.mutedForeground : "#fff"} />
            )}
            <Text
              style={{
                color: !compleet ? c.mutedForeground : "#fff",
                fontSize: 14,
                fontFamily: "Inter_600SemiBold",
              }}
            >
              {bezig ? "Verzenden..." : "Melding verzenden"}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Veld({ label, ontbreekt, children }: { label: string; ontbreekt: boolean; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
        <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
          {label}
          <Text style={{ color: "#dc2626", fontFamily: "Inter_400Regular" }}> *</Text>
        </Text>
      </View>
      {children}
      {ontbreekt ? (
        <Text style={{ color: "#dc2626", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 6 }}>
          Dit veld is verplicht — een ruwe schatting is genoeg, leeg laten niet.
        </Text>
      ) : null}
    </View>
  );
}

function Invoer({
  value,
  onChangeText,
  placeholder,
  meerregelig,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  meerregelig?: boolean;
}) {
  const c = useColors();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={c.mutedForeground}
      multiline={meerregelig}
      numberOfLines={meerregelig ? 3 : 1}
      style={{
        backgroundColor: c.card,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 10,
        padding: 12,
        color: c.foreground,
        fontSize: 14,
        fontFamily: "Inter_400Regular",
        minHeight: meerregelig ? 80 : undefined,
        textAlignVertical: meerregelig ? "top" : "center",
      }}
    />
  );
}
