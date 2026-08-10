import { API_DOMEIN } from "@/lib/apiDomein";
// Toebehoren gereedschap — monteur meldt verbruiksmateriaal voor gereedschap
// (zaagjes, boortjes, schijven). Kosten gaan naar de rubriek
// magazijn-gereedschap-toebehoren, niet op een project. Gaat naar de
// werkvoorbereider.
import { Ionicons } from "@expo/vector-icons";
import { ruimte } from "@workspace/ontwerp";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
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

import { Waarschuwvlak, bovenInset, tekstStijl } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { uploadFoto } from "@/lib/upload";

const DOMEIN = API_DOMEIN;

export default function ToebehorenAanvraag() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();

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
    if (!omschrijving.trim()) {
      Alert.alert("Omschrijving verplicht", "Beschrijf welk toebehoren nodig is.");
      return;
    }

    setBezig(true);
    try {
      let fotoPad: string | null = null;
      if (fotoUri) {
        fotoPad = await uploadFoto(fotoUri);
      }

      const resp = await fetch(`https://${DOMEIN}/api/toebehoren-aanvragen`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          omschrijving: omschrijving.trim(),
          ...(fotoPad ? { foto_pad: fotoPad } : {}),
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
          Aanvraag verzonden
        </Text>
        <Text style={[tekstStijl("standaard", c.mutedForeground), { textAlign: "center", marginBottom: ruimte.xxl }]}>
          De werkvoorbereider ontvangt uw aanvraag voor toebehoren gereedschap. De kosten komen op de rubriek magazijn-gereedschap-toebehoren, niet op een project.
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({ backgroundColor: c.tint, borderRadius: c.radius, paddingHorizontal: ruimte.xl + ruimte.xs, paddingVertical: ruimte.m, opacity: pressed ? 0.85 : 1 })}
        >
          <Text style={tekstStijl("nadruk", c.primaryForeground)}>Terug</Text>
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
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: ruimte.xs }}>
          <Ionicons name="chevron-back" size={ruimte.xl} color={c.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={tekstStijl("sectiekop", c.foreground)}>
            Toebehoren gereedschap
          </Text>
          <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 1 }]}>
            Zaagjes, boortjes, schijven — verbruik
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top + ruimte.s}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: ruimte.l, gap: ruimte.l, paddingBottom: ruimte.xxl + ruimte.s }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Uitleg */}
          <Waarschuwvlak
            soort="info"
            tekst="Deze aanvraag gaat naar de werkvoorbereider. De kosten komen op de rubriek magazijn-gereedschap-toebehoren en niet op een project."
          />

          {/* Omschrijving */}
          <View>
            <Text style={[tekstStijl("nadruk", c.foreground), { marginBottom: ruimte.s }]}>
              Omschrijving
              <Text style={tekstStijl("standaard", c.destructive)}> *</Text>
            </Text>
            <TextInput
              value={omschrijving}
              onChangeText={setOmschrijving}
              placeholder="Bijv. HSS-boortjes 6 mm (10 stuks) of doorslijpschijf 125 mm"
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
          </View>

          {/* Foto (optioneel) */}
          <View>
            <Text style={[tekstStijl("nadruk", c.foreground), { marginBottom: ruimte.s + 2 }]}>
              Foto (optioneel)
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

          {/* Verzend knop */}
          <Pressable
            onPress={() => void verzend()}
            disabled={bezig || !omschrijving.trim()}
            style={({ pressed }) => ({
              backgroundColor:
                !omschrijving.trim() ? c.muted : c.tint,
              opacity: pressed && omschrijving.trim() ? 0.85 : 1,
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
              <Ionicons name="send-outline" size={ruimte.l} color={!omschrijving.trim() ? c.mutedForeground : c.primaryForeground} />
            )}
            <Text style={tekstStijl("nadruk", !omschrijving.trim() ? c.mutedForeground : c.primaryForeground)}>
              {bezig ? "Verzenden..." : "Aanvraag verzenden"}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
