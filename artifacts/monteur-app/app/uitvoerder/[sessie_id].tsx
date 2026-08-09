import { API_DOMEIN } from "@/lib/apiDomein";
// Digitale Uitvoerder — AI-chatscherm voor monteur
// Monteur stelt vragen + foto, AI geeft uitvoeringsadvies, monteur legt aanpak vast
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { uploadFoto } from "@/lib/upload";

const DOMEIN = API_DOMEIN;

type Rol = "monteur" | "ai";

interface Bericht {
  id: number;
  sessie_id: number;
  rol: Rol;
  inhoud: string;
  foto_pad: string | null;
  aangemaakt_op: string;
}

interface Sessie {
  id: number;
  status: "actief" | "bevestigd";
  gekozen_aanpak: string | null;
  gekozen_aanpak_op: string | null;
}

interface FotoKeuze {
  uri: string;
  pad: string | null;
}

export default function UitvoerderScherm() {
  const { werkdag_id, titel, werknummer } = useLocalSearchParams<{
    werkdag_id: string;
    titel: string;
    werknummer: string;
  }>();
  const { token } = useAuth();
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const lijstRef = useRef<FlatList>(null);

  const [sessie, setSessie] = useState<Sessie | null>(null);
  const [berichten, setBerichten] = useState<Bericht[]>([]);
  const [laden, setLaden] = useState(true);
  const [verzenden, setVerzenden] = useState(false);
  const [tekst, setTekst] = useState("");
  const [foto, setFoto] = useState<FotoKeuze | null>(null);
  const [fotoUploaden, setFotoUploaden] = useState(false);
  const [toonBevestig, setToonBevestig] = useState(false);
  const [aanpakTekst, setAanpakTekst] = useState("");
  const [bevestigen, setBevestigen] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}` };

  // Sessie starten of hervatten
  useEffect(() => {
    void startSessie();
  }, [werkdag_id]);

  async function startSessie() {
    setLaden(true);
    try {
      const resp = await fetch(`https://${DOMEIN}/api/uitvoerder/sessies`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ werkdag_id: werkdag_id ? parseInt(werkdag_id, 10) : undefined }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = (await resp.json()) as { sessie: Sessie; berichten: Bericht[] };
      setSessie(data.sessie);
      setBerichten(data.berichten);
    } catch (err) {
      Alert.alert("Fout", "Sessie kon niet worden geladen.");
    } finally {
      setLaden(false);
    }
  }

  async function probeerFotoUpload(uri: string, opOpnieuw: () => void) {
    setFotoUploaden(true);
    try {
      const pad = await uploadFoto(uri);
      setFoto({ uri, pad });
    } catch (err) {
      const isBestandstype =
        err instanceof Error &&
        /415|bestandstype|unsupported|ongeldig.*(type|formaat)/i.test(err.message);
      if (isBestandstype) {
        setFoto(null);
        Alert.alert(
          "Bestandstype niet toegestaan",
          "Dit bestandstype wordt niet ondersteund. Kies een ander bestand.",
          [
            { text: "Annuleren", style: "cancel" },
            { text: "Ander bestand kiezen", onPress: () => void kiesFoto() },
          ],
        );
      } else {
        Alert.alert(
          "Upload mislukt",
          "De foto kon niet worden geüpload.",
          [
            { text: "Annuleren", style: "cancel", onPress: () => setFoto(null) },
            { text: "Opnieuw proberen", onPress: opOpnieuw },
          ],
        );
      }
    } finally {
      setFotoUploaden(false);
    }
  }

  async function kiesFoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Toestemming vereist", "Geef toegang tot de fotobibliotheek.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setFoto({ uri, pad: null });
    await probeerFotoUpload(uri, () => void probeerFotoUpload(uri, () => setFoto(null)));
  }

  async function maakFoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Toestemming vereist", "Geef toegang tot de camera.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setFoto({ uri, pad: null });
    await probeerFotoUpload(uri, () => void probeerFotoUpload(uri, () => setFoto(null)));
  }

  async function verstuur() {
    if (!tekst.trim() && !foto?.pad) return;
    if (!sessie) return;
    if (fotoUploaden) {
      Alert.alert("Even wachten", "Foto wordt nog geüpload.");
      return;
    }

    const berichtTekst = tekst.trim() || "(foto bijgevoegd)";
    setVerzenden(true);
    try {
      const resp = await fetch(`https://${DOMEIN}/api/uitvoerder/sessies/${sessie.id}/berichten`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ inhoud: berichtTekst, foto_pad: foto?.pad ?? undefined }),
      });
      if (!resp.ok) {
        const err = (await resp.json()) as { error?: string };
        throw new Error(err.error ?? "Onbekende fout");
      }
      const data = (await resp.json()) as { monteur_bericht: Bericht; ai_bericht: Bericht };
      setBerichten((prev) => [...prev, data.monteur_bericht, data.ai_bericht]);
      setTekst("");
      setFoto(null);
      setTimeout(() => lijstRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err: unknown) {
      const boodschap = err instanceof Error ? err.message : "Onbekende fout";
      Alert.alert("Fout", boodschap);
    } finally {
      setVerzenden(false);
    }
  }

  async function bevestigAanpak() {
    if (!aanpakTekst.trim()) {
      Alert.alert("Verplicht", "Beschrijf de gekozen aanpak.");
      return;
    }
    if (!sessie) return;
    setBevestigen(true);
    try {
      const resp = await fetch(`https://${DOMEIN}/api/uitvoerder/sessies/${sessie.id}/bevestig`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ gekozen_aanpak: aanpakTekst.trim() }),
      });
      if (!resp.ok) throw new Error("Bevestiging mislukt");
      const data = (await resp.json()) as { sessie: Sessie };
      setSessie(data.sessie);
      setToonBevestig(false);
    } catch {
      Alert.alert("Fout", "Aanpak kon niet worden vastgelegd.");
    } finally {
      setBevestigen(false);
    }
  }

  function openBevestigPanel() {
    // Pre-fill met laatste AI-bericht als suggestie
    const laatsAi = [...berichten].reverse().find((b) => b.rol === "ai");
    setAanpakTekst(laatsAi ? laatsAi.inhoud : "");
    setToonBevestig(true);
  }

  const heeftAiBerichten = berichten.some((b) => b.rol === "ai");
  const isBevestigd = sessie?.status === "bevestigd";

  function renderBericht({ item }: { item: Bericht }) {
    const isMonteur = item.rol === "monteur";
    return (
      <View
        style={{
          marginHorizontal: 16,
          marginBottom: 12,
          alignItems: isMonteur ? "flex-end" : "flex-start",
        }}
      >
        {!isMonteur && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: c.primary,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="sparkles" size={11} color="#fff" />
            </View>
            <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: c.mutedForeground }}>
              Digitale Uitvoerder
            </Text>
          </View>
        )}
        <View
          style={{
            maxWidth: "82%",
            backgroundColor: isMonteur ? c.primary : c.card,
            borderRadius: 14,
            borderBottomRightRadius: isMonteur ? 4 : 14,
            borderBottomLeftRadius: isMonteur ? 14 : 4,
            padding: 12,
            borderWidth: isMonteur ? 0 : 1,
            borderColor: c.border,
          }}
        >
          {item.foto_pad && (
            <Image
              source={{ uri: `https://${DOMEIN}/api/storage/object?path=${encodeURIComponent(item.foto_pad)}` }}
              style={{ width: 200, height: 150, borderRadius: 8, marginBottom: 8 }}
              resizeMode="cover"
            />
          )}
          <Text
            style={{
              color: isMonteur ? "#fff" : c.foreground,
              fontSize: 14,
              fontFamily: "Inter_400Regular",
              lineHeight: 20,
            }}
          >
            {item.inhoud}
          </Text>
        </View>
        <Text style={{ fontSize: 10, color: c.mutedForeground, marginTop: 2, fontFamily: "Inter_400Regular" }}>
          {new Date(item.aangemaakt_op).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}
        </Text>
      </View>
    );
  }

  if (laden) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingBottom: 12,
          paddingHorizontal: 16,
          backgroundColor: c.card,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={c.foreground} />
        </Pressable>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: c.primary,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Ionicons name="sparkles" size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.foreground }}>
            Digitale Uitvoerder
          </Text>
          {(titel || werknummer) && (
            <Text style={{ fontSize: 12, color: c.mutedForeground, fontFamily: "Inter_400Regular" }}>
              {[werknummer, titel].filter(Boolean).join(" — ")}
            </Text>
          )}
        </View>
        {isBevestigd && (
          <View
            style={{
              backgroundColor: "#16a34a22",
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}
          >
            <Text style={{ fontSize: 11, color: "#16a34a", fontFamily: "Inter_600SemiBold" }}>Vastgelegd</Text>
          </View>
        )}
      </View>

      {/* Bevestigde aanpak banner */}
      {isBevestigd && sessie?.gekozen_aanpak && (
        <View
          style={{
            margin: 12,
            padding: 12,
            backgroundColor: "#16a34a11",
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "#16a34a44",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
            <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#16a34a" }}>
              Vastgelegde aanpak
            </Text>
          </View>
          <Text style={{ fontSize: 13, color: c.foreground, fontFamily: "Inter_400Regular", lineHeight: 18 }}>
            {sessie.gekozen_aanpak}
          </Text>
        </View>
      )}

      {/* Welkomstbericht als nog geen berichten */}
      {berichten.length === 0 && (
        <View
          style={{
            margin: 16,
            padding: 16,
            backgroundColor: c.card,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: c.border,
            alignItems: "center",
            gap: 8,
          }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: `${c.primary}22`,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons name="sparkles" size={24} color={c.primary} />
          </View>
          <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.foreground, textAlign: "center" }}>
            Digitale Uitvoerder
          </Text>
          <Text
            style={{ fontSize: 13, color: c.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 }}
          >
            Stel een vraag of maak een foto. De uitvoerder denkt mee over de aanpak, controleert de norm en geeft praktisch advies.
          </Text>
        </View>
      )}

      {/* Berichtenlijst */}
      <FlatList
        ref={lijstRef}
        data={berichten}
        keyExtractor={(b) => String(b.id)}
        renderItem={renderBericht}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 8 }}
        onLayout={() => berichten.length > 0 && lijstRef.current?.scrollToEnd({ animated: false })}
      />

      {/* Bevestig-aanpak panel */}
      {toonBevestig && (
        <View
          style={{
            margin: 12,
            padding: 14,
            backgroundColor: c.card,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: c.border,
          }}
        >
          <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 6 }}>
            Aanpak vastleggen
          </Text>
          <Text style={{ fontSize: 12, color: c.mutedForeground, fontFamily: "Inter_400Regular", marginBottom: 8 }}>
            Beschrijf de gekozen aanpak. Dit wordt vastgelegd in het logboek en gedeeld met de projectleider.
          </Text>
          <TextInput
            value={aanpakTekst}
            onChangeText={setAanpakTekst}
            multiline
            numberOfLines={4}
            placeholder="Beschrijf hoe je het gaat uitvoeren..."
            placeholderTextColor={c.mutedForeground}
            style={{
              backgroundColor: c.background,
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: 8,
              padding: 10,
              color: c.foreground,
              fontFamily: "Inter_400Regular",
              fontSize: 13,
              minHeight: 80,
              textAlignVertical: "top",
              marginBottom: 10,
            }}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => setToonBevestig(false)}
              style={{
                flex: 1,
                padding: 10,
                borderRadius: 8,
                backgroundColor: c.muted,
                alignItems: "center",
              }}
            >
              <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_500Medium" }}>Annuleer</Text>
            </Pressable>
            <Pressable
              onPress={bevestigAanpak}
              disabled={bevestigen}
              style={{
                flex: 2,
                padding: 10,
                borderRadius: 8,
                backgroundColor: "#16a34a",
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 6,
                opacity: bevestigen ? 0.6 : 1,
              }}
            >
              {bevestigen ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
              )}
              <Text style={{ color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                {bevestigen ? "Vastleggen..." : "Vastleggen"}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Foto preview */}
      {foto && (
        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Image
            source={{ uri: foto.uri }}
            style={{ width: 56, height: 56, borderRadius: 8 }}
            resizeMode="cover"
          />
          {fotoUploaden && <ActivityIndicator size="small" color={c.primary} />}
          {!fotoUploaden && foto.pad && (
            <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
          )}
          <Pressable onPress={() => setFoto(null)} style={{ marginLeft: "auto" }}>
            <Ionicons name="close-circle" size={20} color={c.mutedForeground} />
          </Pressable>
        </View>
      )}

      {/* Invoerbalk */}
      {!isBevestigd && (
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 10,
            paddingBottom: insets.bottom + 10,
            backgroundColor: c.card,
            borderTopWidth: 1,
            borderTopColor: c.border,
          }}
        >
          {/* Aanpak vastleggen knop */}
          {heeftAiBerichten && !toonBevestig && (
            <Pressable
              onPress={openBevestigPanel}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                backgroundColor: "#16a34a11",
                borderWidth: 1,
                borderColor: "#16a34a44",
                borderRadius: 8,
                paddingVertical: 8,
                marginBottom: 8,
              }}
            >
              <Ionicons name="checkmark-circle-outline" size={16} color="#16a34a" />
              <Text style={{ fontSize: 13, color: "#16a34a", fontFamily: "Inter_600SemiBold" }}>
                Aanpak vastleggen
              </Text>
            </Pressable>
          )}

          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
            {/* Foto-knoppen */}
            <View style={{ flexDirection: "column", gap: 4 }}>
              <Pressable
                onPress={maakFoto}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  backgroundColor: c.muted,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons name="camera-outline" size={18} color={c.mutedForeground} />
              </Pressable>
              <Pressable
                onPress={kiesFoto}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  backgroundColor: c.muted,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons name="image-outline" size={18} color={c.mutedForeground} />
              </Pressable>
            </View>

            {/* Tekstinvoer */}
            <TextInput
              value={tekst}
              onChangeText={setTekst}
              multiline
              placeholder="Vraag of beschrijf de situatie..."
              placeholderTextColor={c.mutedForeground}
              style={{
                flex: 1,
                backgroundColor: c.background,
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
                color: c.foreground,
                fontFamily: "Inter_400Regular",
                fontSize: 14,
                maxHeight: 100,
                textAlignVertical: "top",
              }}
            />

            {/* Verstuur-knop */}
            <Pressable
              onPress={verstuur}
              disabled={verzenden || fotoUploaden || (!tekst.trim() && !foto?.pad)}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: c.primary,
                justifyContent: "center",
                alignItems: "center",
                opacity: verzenden || fotoUploaden || (!tekst.trim() && !foto?.pad) ? 0.4 : 1,
              }}
            >
              {verzenden ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={18} color="#fff" />
              )}
            </Pressable>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
