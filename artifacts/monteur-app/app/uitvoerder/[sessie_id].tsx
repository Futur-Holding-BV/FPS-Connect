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

import { ruimte } from "@workspace/ontwerp";

import { Kaart, Ladenstaat, Statusmerk, tekstStijl } from "@/components/ui";
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
          marginHorizontal: ruimte.l,
          marginBottom: ruimte.m,
          alignItems: isMonteur ? "flex-end" : "flex-start",
        }}
      >
        {!isMonteur && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.xs, marginBottom: ruimte.xs }}>
            <View
              style={{
                width: ruimte.l + ruimte.xs,
                height: ruimte.l + ruimte.xs,
                borderRadius: (ruimte.l + ruimte.xs) / 2,
                backgroundColor: c.primary,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="sparkles" size={11} color={c.primaryForeground} />
            </View>
            <Text style={tekstStijl("bijschrift", c.mutedForeground)}>
              Digitale Uitvoerder
            </Text>
          </View>
        )}
        <View
          style={{
            maxWidth: "82%",
            backgroundColor: isMonteur ? c.primary : c.card,
            borderRadius: c.radius,
            borderBottomRightRadius: isMonteur ? ruimte.xs : c.radius,
            borderBottomLeftRadius: isMonteur ? c.radius : ruimte.xs,
            padding: ruimte.m,
            borderWidth: isMonteur ? 0 : 1,
            borderColor: c.border,
          }}
        >
          {item.foto_pad && (
            <Image
              source={{ uri: `https://${DOMEIN}/api/storage/object?path=${encodeURIComponent(item.foto_pad)}` }}
              style={{ width: 200, height: 150, borderRadius: c.radius / 2, marginBottom: ruimte.s, backgroundColor: c.muted }}
              resizeMode="cover"
            />
          )}
          <Text
            style={[
              tekstStijl("standaard", isMonteur ? c.primaryForeground : c.foreground),
              { lineHeight: 20 },
            ]}
          >
            {item.inhoud}
          </Text>
        </View>
        <Text style={[tekstStijl("bijschrift", c.mutedForeground), { marginTop: 2 }]}>
          {new Date(item.aangemaakt_op).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}
        </Text>
      </View>
    );
  }

  if (laden) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, padding: ruimte.l }}>
        <Ladenstaat regels={4} />
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
          paddingTop: insets.top + ruimte.m,
          paddingBottom: ruimte.m,
          paddingHorizontal: ruimte.l,
          backgroundColor: c.card,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
          flexDirection: "row",
          alignItems: "center",
          gap: ruimte.m,
        }}
      >
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={c.foreground} />
        </Pressable>
        <View
          style={{
            width: ruimte.xxl + ruimte.xs,
            height: ruimte.xxl + ruimte.xs,
            borderRadius: (ruimte.xxl + ruimte.xs) / 2,
            backgroundColor: c.primary,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Ionicons name="sparkles" size={18} color={c.primaryForeground} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={tekstStijl("nadruk", c.foreground)}>
            Digitale Uitvoerder
          </Text>
          {(titel || werknummer) && (
            <Text style={tekstStijl("klein", c.mutedForeground)}>
              {[werknummer, titel].filter(Boolean).join(" — ")}
            </Text>
          )}
        </View>
        {isBevestigd && (
          <Statusmerk label="Vastgelegd" soort="succes" />
        )}
      </View>

      {/* Bevestigde aanpak banner */}
      {isBevestigd && sessie?.gekozen_aanpak && (
        <View
          style={{
            margin: ruimte.m,
            padding: ruimte.m,
            backgroundColor: c.secondary,
            borderRadius: c.radius,
            borderWidth: 1,
            borderColor: c.success,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.xs + 2, marginBottom: ruimte.xs }}>
            <Ionicons name="checkmark-circle" size={ruimte.l} color={c.success} />
            <Text style={tekstStijl("klein", c.success)}>
              Vastgelegde aanpak
            </Text>
          </View>
          <Text style={tekstStijl("klein", c.foreground)}>
            {sessie.gekozen_aanpak}
          </Text>
        </View>
      )}

      {/* Welkomstbericht als nog geen berichten */}
      {berichten.length === 0 && (
        <Kaart stijl={{ margin: ruimte.l, alignItems: "center", gap: ruimte.s }}>
          <View
            style={{
              width: ruimte.xxl + ruimte.l,
              height: ruimte.xxl + ruimte.l,
              borderRadius: (ruimte.xxl + ruimte.l) / 2,
              backgroundColor: c.accent,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons name="sparkles" size={ruimte.xl} color={c.primary} />
          </View>
          <Text style={[tekstStijl("nadruk", c.foreground), { textAlign: "center" }]}>
            Digitale Uitvoerder
          </Text>
          <Text
            style={[tekstStijl("klein", c.mutedForeground), { textAlign: "center" }]}
          >
            Stel een vraag of maak een foto. De uitvoerder denkt mee over de aanpak, controleert de norm en geeft praktisch advies.
          </Text>
        </Kaart>
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
        <Kaart stijl={{ margin: ruimte.m, padding: ruimte.m + 2 }}>
          <Text style={[tekstStijl("klein", c.foreground), { fontFamily: "Inter_600SemiBold", marginBottom: ruimte.xs + 2 }]}>
            Aanpak vastleggen
          </Text>
          <Text style={[tekstStijl("klein", c.mutedForeground), { marginBottom: ruimte.s }]}>
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
              borderRadius: c.radius / 2,
              padding: ruimte.s + 2,
              color: c.foreground,
              fontFamily: "Inter_400Regular",
              fontSize: 13,
              minHeight: 80,
              textAlignVertical: "top",
              marginBottom: ruimte.s + 2,
            }}
          />
          <View style={{ flexDirection: "row", gap: ruimte.s }}>
            <Pressable
              onPress={() => setToonBevestig(false)}
              style={{
                flex: 1,
                padding: ruimte.s + 2,
                borderRadius: c.radius / 2,
                backgroundColor: c.muted,
                alignItems: "center",
              }}
            >
              <Text style={tekstStijl("klein", c.foreground)}>Annuleer</Text>
            </Pressable>
            <Pressable
              onPress={bevestigAanpak}
              disabled={bevestigen}
              style={{
                flex: 2,
                padding: ruimte.s + 2,
                borderRadius: c.radius / 2,
                backgroundColor: c.success,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: ruimte.xs + 2,
                opacity: bevestigen ? 0.6 : 1,
              }}
            >
              {bevestigen ? (
                <ActivityIndicator size="small" color={c.successForeground} />
              ) : (
                <Ionicons name="checkmark-circle" size={ruimte.l} color={c.successForeground} />
              )}
              <Text style={tekstStijl("klein", c.successForeground)}>
                {bevestigen ? "Vastleggen..." : "Vastleggen"}
              </Text>
            </Pressable>
          </View>
        </Kaart>
      )}

      {/* Foto preview */}
      {foto && (
        <View
          style={{
            marginHorizontal: ruimte.l,
            marginBottom: ruimte.s,
            flexDirection: "row",
            alignItems: "center",
            gap: ruimte.s,
          }}
        >
          <Image
            source={{ uri: foto.uri }}
            style={{ width: ruimte.xxl + ruimte.xl, height: ruimte.xxl + ruimte.xl, borderRadius: c.radius / 2, backgroundColor: c.muted }}
            resizeMode="cover"
          />
          {fotoUploaden && <ActivityIndicator size="small" color={c.primary} />}
          {!fotoUploaden && foto.pad && (
            <Ionicons name="checkmark-circle" size={18} color={c.success} />
          )}
          <Pressable onPress={() => setFoto(null)} style={{ marginLeft: "auto" }}>
            <Ionicons name="close-circle" size={ruimte.l} color={c.mutedForeground} />
          </Pressable>
        </View>
      )}

      {/* Invoerbalk */}
      {!isBevestigd && (
        <View
          style={{
            paddingHorizontal: ruimte.m,
            paddingVertical: ruimte.s + 2,
            paddingBottom: insets.bottom + ruimte.s + 2,
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
                gap: ruimte.xs + 2,
                backgroundColor: c.secondary,
                borderWidth: 1,
                borderColor: c.success,
                borderRadius: c.radius / 2,
                paddingVertical: ruimte.s,
                marginBottom: ruimte.s,
              }}
            >
              <Ionicons name="checkmark-circle-outline" size={ruimte.l} color={c.success} />
              <Text style={tekstStijl("klein", c.success)}>
                Aanpak vastleggen
              </Text>
            </Pressable>
          )}

          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: ruimte.s }}>
            {/* Foto-knoppen */}
            <View style={{ flexDirection: "column", gap: ruimte.xs }}>
              <Pressable
                onPress={maakFoto}
                style={{
                  width: ruimte.xxl + ruimte.xs,
                  height: ruimte.xxl + ruimte.xs,
                  borderRadius: c.radius / 2,
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
                  width: ruimte.xxl + ruimte.xs,
                  height: ruimte.xxl + ruimte.xs,
                  borderRadius: c.radius / 2,
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
                borderRadius: c.radius / 2,
                paddingHorizontal: ruimte.m,
                paddingVertical: ruimte.s,
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
                width: ruimte.xl + ruimte.l + ruimte.xs,
                height: ruimte.xl + ruimte.l + ruimte.xs,
                borderRadius: (ruimte.xl + ruimte.l + ruimte.xs) / 2,
                backgroundColor: c.primary,
                justifyContent: "center",
                alignItems: "center",
                opacity: verzenden || fotoUploaden || (!tekst.trim() && !foto?.pad) ? 0.4 : 1,
              }}
            >
              {verzenden ? (
                <ActivityIndicator size="small" color={c.primaryForeground} />
              ) : (
                <Ionicons name="send" size={18} color={c.primaryForeground} />
              )}
            </Pressable>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
