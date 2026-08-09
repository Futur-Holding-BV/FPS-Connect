import { API_DOMEIN } from "@/lib/apiDomein";
// Toebehoren gereedschap — monteur meldt verbruiksmateriaal voor gereedschap
// (zaagjes, boortjes, schijven). Kosten gaan naar de rubriek
// magazijn-gereedschap-toebehoren, niet op een project. Gaat naar de
// werkvoorbereider.
import { Ionicons } from "@expo/vector-icons";
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

import { bovenInset } from "@/components/ui";
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
          Aanvraag verzonden
        </Text>
        <Text style={{ color: c.mutedForeground, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, marginBottom: 32 }}>
          De werkvoorbereider ontvangt uw aanvraag voor toebehoren gereedschap. De kosten komen op de rubriek magazijn-gereedschap-toebehoren, niet op een project.
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
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.foreground, fontSize: 16, fontFamily: "Inter_700Bold" }}>
            Toebehoren gereedschap
          </Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 }}>
            Zaagjes, boortjes, schijven — verbruik
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top + 8}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Uitleg */}
          <View
            style={{
              backgroundColor: "#2563eb18",
              borderWidth: 1,
              borderColor: "#2563eb55",
              borderRadius: 10,
              padding: 14,
              flexDirection: "row",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <Ionicons name="information-circle-outline" size={18} color="#2563eb" style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, color: c.foreground, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 }}>
              Deze aanvraag gaat naar de werkvoorbereider. De kosten komen op de rubriek magazijn-gereedschap-toebehoren en niet op een project.
            </Text>
          </View>

          {/* Omschrijving */}
          <View>
            <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 8 }}>
              Omschrijving
              <Text style={{ color: "#dc2626", fontFamily: "Inter_400Regular" }}> *</Text>
            </Text>
            <TextInput
              value={omschrijving}
              onChangeText={setOmschrijving}
              placeholder="Bijv. HSS-boortjes 6 mm (10 stuks) of doorslijpschijf 125 mm"
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
          </View>

          {/* Foto (optioneel) */}
          <View>
            <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 10 }}>
              Foto (optioneel)
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

          {/* Verzend knop */}
          <Pressable
            onPress={() => void verzend()}
            disabled={bezig || !omschrijving.trim()}
            style={({ pressed }) => ({
              backgroundColor:
                !omschrijving.trim() ? c.muted : pressed ? "#c93009" : c.tint,
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
              <Ionicons name="send-outline" size={16} color={!omschrijving.trim() ? c.mutedForeground : "#fff"} />
            )}
            <Text
              style={{
                color: !omschrijving.trim() ? c.mutedForeground : "#fff",
                fontSize: 14,
                fontFamily: "Inter_600SemiBold",
              }}
            >
              {bezig ? "Verzenden..." : "Aanvraag verzenden"}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
