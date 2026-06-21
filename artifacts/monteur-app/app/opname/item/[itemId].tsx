import { Ionicons } from "@expo/vector-icons";
import {
  useGetOpnameItem,
  useUpdateOpnameItem,
  useCreateOpnameFotoUploadUrl,
  useDeleteOpnameFoto,
} from "@workspace/api-client-react";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { useColors } from "@/hooks/useColors";

const SPOT_TYPEN = [
  { waarde: "branddeur", label: "Branddeur", kleur: "#ef4444" },
  { waarde: "doorvoering", label: "Doorvoering", kleur: "#f97316" },
  { waarde: "brandklep", label: "Brandklep", kleur: "#eab308" },
  { waarde: "manchet", label: "Manchet", kleur: "#22c55e" },
  { waarde: "coating", label: "Coating", kleur: "#3b82f6" },
  { waarde: "luik", label: "Luik", kleur: "#8b5cf6" },
  { waarde: "dakdoorvoer", label: "Dakdoorvoer", kleur: "#06b6d4" },
  { waarde: "schuifdeur", label: "Schuifdeur", kleur: "#ec4899" },
  { waarde: "kozijn", label: "Kozijn", kleur: "#14b8a6" },
  { waarde: "overig", label: "Overig", kleur: "#6b7280" },
];

const ACTIES = [
  { waarde: "vervangen", label: "Vervangen" },
  { waarde: "opwaarderen", label: "Opwaarderen" },
  { waarde: "controleren", label: "Controleren" },
  { waarde: "niet-brandwerend-afwerken", label: "Niet-brandw. afwerken" },
];

const BEREIKBAARHEID = [
  { waarde: "goed", label: "Goed", kleur: "#22c55e" },
  { waarde: "beperkt", label: "Beperkt", kleur: "#f97316" },
  { waarde: "moeilijk", label: "Moeilijk", kleur: "#ef4444" },
];

const PRIORITEITEN = [
  { waarde: "laag", label: "Laag" },
  { waarde: "normaal", label: "Normaal" },
  { waarde: "hoog", label: "Hoog" },
];

export default function OpnameItemDetail() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const id = Number(itemId);

  const { data: item, isLoading, refetch } = useGetOpnameItem(id);
  const bijwerken = useUpdateOpnameItem();
  const fotoUrl = useCreateOpnameFotoUploadUrl();
  const verwijderFoto = useDeleteOpnameFoto();

  const [spotType, setSpotType] = useState("");
  const [ruimte, setRuimte] = useState("");
  const [beschrijving, setBeschrijving] = useState("");
  const [actie, setActie] = useState("controleren");
  const [bereikbaarheid, setBereikbaarheid] = useState("goed");
  const [aantal, setAantal] = useState("1");
  const [afmetingen, setAfmetingen] = useState("");
  const [prioriteit, setPrioriteit] = useState("normaal");
  const [notities, setNotities] = useState("");
  const [afgerond, setAfgerond] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [heeftWijzigingen, setHeeftWijzigingen] = useState(false);

  useEffect(() => {
    if (!item) return;
    setSpotType(item.spot_type ?? "");
    setRuimte(item.ruimte ?? "");
    setBeschrijving(item.beschrijving ?? "");
    setActie(item.actie ?? "controleren");
    setBereikbaarheid(item.bereikbaarheid ?? "goed");
    setAantal(String(item.aantal ?? 1));
    setAfmetingen(item.afmetingen ?? "");
    setPrioriteit(item.prioriteit ?? "normaal");
    setNotities(item.notities ?? "");
    setAfgerond(item.afgerond ?? false);
    setHeeftWijzigingen(false);
  }, [item]);

  function markeerGewijzigd() { setHeeftWijzigingen(true); }

  async function opslaan() {
    await bijwerken.mutateAsync({
      itemId: id,
      data: {
        spot_type: spotType,
        ruimte: ruimte || undefined,
        beschrijving: beschrijving || undefined,
        actie,
        bereikbaarheid,
        aantal: Number(aantal) || 1,
        afmetingen: afmetingen || undefined,
        prioriteit,
        notities: notities || undefined,
        afgerond,
      },
    });
    setHeeftWijzigingen(false);
    await refetch();
  }

  async function voegFotoToe() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== "granted") {
      const gallery = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (gallery.status !== "granted") {
        Alert.alert("Geen toegang", "Geef toegang tot de camera of fotobibliotheek in de instellingen.");
        return;
      }
    }

    Alert.alert(
      "Foto toevoegen",
      "Kies een bron",
      [
        {
          text: "Camera",
          onPress: async () => {
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
              base64: false,
            });
            if (!result.canceled && result.assets[0]) {
              await uploadFoto(result.assets[0].uri);
            }
          },
        },
        {
          text: "Fotobibliotheek",
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
              base64: false,
            });
            if (!result.canceled && result.assets[0]) {
              await uploadFoto(result.assets[0].uri);
            }
          },
        },
        { text: "Annuleren", style: "cancel" },
      ],
    );
  }

  async function uploadFoto(uri: string) {
    setIsUploading(true);
    try {
      const bestandsnaam = uri.split("/").pop() ?? "foto.jpg";
      const contentType = "image/jpeg";

      const { upload_url } = await fotoUrl.mutateAsync({
        itemId: id,
        data: { bestandsnaam, content_type: contentType },
      });

      const response = await fetch(uri);
      const blob = await response.blob();
      await fetch(upload_url, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": contentType },
      });

      await refetch();
    } catch (e) {
      Alert.alert("Fout", "Foto kon niet worden geupload. Probeer het opnieuw.");
    } finally {
      setIsUploading(false);
    }
  }

  function bevestigVerwijderFoto(fotoId: number) {
    Alert.alert(
      "Foto verwijderen",
      "Weet je zeker dat je deze foto wilt verwijderen?",
      [
        { text: "Annuleren", style: "cancel" },
        {
          text: "Verwijderen",
          style: "destructive",
          onPress: async () => {
            await verwijderFoto.mutateAsync({ fotoId });
            await refetch();
          },
        },
      ],
    );
  }

  const typeInfo = SPOT_TYPEN.find((t) => t.waarde === spotType);
  const fotos = item?.fotos ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View
        style={{
          backgroundColor: c.dark,
          paddingTop: bovenInset(insets) + 12,
          paddingHorizontal: 20,
          paddingBottom: 16,
        }}
      >
        <Pressable onPress={() => router.back()} style={{ marginBottom: 8 }}>
          <Text style={{ color: c.primary, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
            ‹ Terug
          </Text>
        </Pressable>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.darkForeground, fontSize: 20, fontFamily: "Inter_700Bold" }}>
              {typeInfo?.label ?? spotType}
            </Text>
            {item?.ruimte ? (
              <Text style={{ color: c.darkMuted, fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 }}>
                {item.ruimte}
              </Text>
            ) : null}
          </View>
          {/* Afgerond toggle */}
          <Pressable
            onPress={() => { setAfgerond(!afgerond); markeerGewijzigd(); }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: afgerond ? "#DCFCE7" : "rgba(255,255,255,0.1)",
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 10,
            }}
          >
            <Ionicons
              name={afgerond ? "checkmark-circle" : "radio-button-off-outline"}
              size={18}
              color={afgerond ? "#166534" : c.darkMuted}
            />
            <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: afgerond ? "#166534" : c.darkMuted }}>
              {afgerond ? "Afgerond" : "Open"}
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
        {isLoading ? (
          <ActivityIndicator color={c.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Type */}
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 8 }}>
              Type voorziening
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ gap: 8 }}>
              {SPOT_TYPEN.map((t) => (
                <Pressable
                  key={t.waarde}
                  onPress={() => { setSpotType(t.waarde); markeerGewijzigd(); }}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
                    borderColor: spotType === t.waarde ? t.kleur : c.border,
                    backgroundColor: spotType === t.waarde ? t.kleur + "22" : c.card,
                  }}
                >
                  <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: spotType === t.waarde ? t.kleur : c.foreground }}>
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Actie */}
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 8 }}>
              Vereiste actie
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {ACTIES.map((a) => (
                <Pressable
                  key={a.waarde}
                  onPress={() => { setActie(a.waarde); markeerGewijzigd(); }}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1,
                    borderColor: actie === a.waarde ? c.primary : c.border,
                    backgroundColor: actie === a.waarde ? c.accent : c.card,
                  }}
                >
                  <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: actie === a.waarde ? c.primary : c.foreground }}>
                    {a.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Bereikbaarheid */}
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 8 }}>
              Bereikbaarheid
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              {BEREIKBAARHEID.map((b) => (
                <Pressable
                  key={b.waarde}
                  onPress={() => { setBereikbaarheid(b.waarde); markeerGewijzigd(); }}
                  style={{
                    flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", borderWidth: 1,
                    borderColor: bereikbaarheid === b.waarde ? b.kleur : c.border,
                    backgroundColor: bereikbaarheid === b.waarde ? b.kleur + "22" : c.card,
                  }}
                >
                  <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: bereikbaarheid === b.waarde ? b.kleur : c.foreground }}>
                    {b.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Prioriteit */}
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 8 }}>
              Prioriteit
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              {PRIORITEITEN.map((p) => (
                <Pressable
                  key={p.waarde}
                  onPress={() => { setPrioriteit(p.waarde); markeerGewijzigd(); }}
                  style={{
                    flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", borderWidth: 1,
                    borderColor: prioriteit === p.waarde ? c.primary : c.border,
                    backgroundColor: prioriteit === p.waarde ? c.accent : c.card,
                  }}
                >
                  <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: prioriteit === p.waarde ? c.primary : c.foreground }}>
                    {p.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Ruimte + Aantal */}
            <View style={{ flexDirection: "row", gap: 12, marginBottom: 14 }}>
              <View style={{ flex: 3 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 6 }}>
                  Ruimte / locatie
                </Text>
                <TextInput
                  value={ruimte}
                  onChangeText={(v) => { setRuimte(v); markeerGewijzigd(); }}
                  placeholder="Gang, serverruimte..."
                  placeholderTextColor={c.mutedForeground}
                  style={{ borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: c.foreground, backgroundColor: c.card }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 6 }}>
                  Aantal
                </Text>
                <TextInput
                  value={aantal}
                  onChangeText={(v) => { setAantal(v); markeerGewijzigd(); }}
                  keyboardType="numeric"
                  style={{ borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: c.foreground, backgroundColor: c.card }}
                />
              </View>
            </View>

            {/* Afmetingen */}
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 6 }}>
              Afmetingen
            </Text>
            <TextInput
              value={afmetingen}
              onChangeText={(v) => { setAfmetingen(v); markeerGewijzigd(); }}
              placeholder="Bijv. 900×2100 mm"
              placeholderTextColor={c.mutedForeground}
              style={{ borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: c.foreground, backgroundColor: c.card, marginBottom: 14 }}
            />

            {/* Beschrijving */}
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 6 }}>
              Situatie / bevinding
            </Text>
            <TextInput
              value={beschrijving}
              onChangeText={(v) => { setBeschrijving(v); markeerGewijzigd(); }}
              placeholder="Wat is er te zien? Waarom voldoet het niet?"
              placeholderTextColor={c.mutedForeground}
              multiline
              numberOfLines={3}
              style={{ borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: c.foreground, backgroundColor: c.card, marginBottom: 14, textAlignVertical: "top", minHeight: 72 }}
            />

            {/* Notities */}
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 6 }}>
              Notities (intern)
            </Text>
            <TextInput
              value={notities}
              onChangeText={(v) => { setNotities(v); markeerGewijzigd(); }}
              placeholder="Extra opmerkingen, aandachtspunten..."
              placeholderTextColor={c.mutedForeground}
              multiline
              numberOfLines={2}
              style={{ borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: c.foreground, backgroundColor: c.card, marginBottom: 20, textAlignVertical: "top", minHeight: 56 }}
            />

            {/* Opslaan knop */}
            {heeftWijzigingen && (
              <Pressable
                onPress={opslaan}
                disabled={bijwerken.isPending}
                style={{ backgroundColor: c.primary, padding: 14, borderRadius: 12, alignItems: "center", marginBottom: 24 }}
              >
                {bijwerken.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 }}>
                    Wijzigingen opslaan
                  </Text>
                )}
              </Pressable>
            )}

            {/* Foto's sectie */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: c.foreground }}>
                Foto's {fotos.length > 0 ? `(${fotos.length})` : ""}
              </Text>
              <Pressable
                onPress={voegFotoToe}
                disabled={isUploading}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: c.accent,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 10,
                }}
              >
                {isUploading ? (
                  <ActivityIndicator size="small" color={c.primary} />
                ) : (
                  <Ionicons name="camera-outline" size={16} color={c.primary} />
                )}
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.primary }}>
                  {isUploading ? "Uploaden..." : "Foto toevoegen"}
                </Text>
              </Pressable>
            </View>

            {fotos.length === 0 ? (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: c.border,
                  borderStyle: "dashed",
                  borderRadius: c.radius,
                  padding: 30,
                  alignItems: "center",
                }}
              >
                <Ionicons name="camera-outline" size={32} color={c.mutedForeground} />
                <Text style={{ color: c.mutedForeground, marginTop: 8, fontFamily: "Inter_400Regular", fontSize: 13 }}>
                  Nog geen foto's — gebruik de knop hierboven
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {fotos.map((foto: any) => (
                  <View key={foto.id} style={{ position: "relative" }}>
                    <Image
                      source={{ uri: `https://${process.env.EXPO_PUBLIC_DOMAIN}${foto.url}` }}
                      style={{ width: 100, height: 100, borderRadius: 10, backgroundColor: c.muted }}
                      resizeMode="cover"
                    />
                    <Pressable
                      onPress={() => bevestigVerwijderFoto(foto.id)}
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        backgroundColor: "rgba(0,0,0,0.6)",
                        borderRadius: 10,
                        padding: 4,
                      }}
                    >
                      <Ionicons name="trash-outline" size={14} color="#fff" />
                    </Pressable>
                    {foto.bijschrift ? (
                      <Text style={{ fontSize: 10, color: c.mutedForeground, marginTop: 3, width: 100, fontFamily: "Inter_400Regular" }} numberOfLines={1}>
                        {foto.bijschrift}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Opslaan bij scroll — sticky bottom */}
      {heeftWijzigingen && !isLoading && (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: c.card,
            borderTopWidth: 1,
            borderTopColor: c.border,
            padding: 16,
            paddingBottom: 16 + insets.bottom,
          }}
        >
          <Pressable
            onPress={opslaan}
            disabled={bijwerken.isPending}
            style={{ backgroundColor: c.primary, padding: 14, borderRadius: 12, alignItems: "center" }}
          >
            {bijwerken.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 }}>
                Wijzigingen opslaan
              </Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}
