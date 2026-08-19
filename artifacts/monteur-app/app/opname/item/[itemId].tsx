import { API_DOMEIN } from "@/lib/apiDomein";
import { Ionicons } from "@expo/vector-icons";
import {
  useGetOpnameItem,
  useUpdateOpnameItem,
  useCreateOpnameFotoUploadUrl,
  useDeleteOpnameFoto,
} from "@workspace/api-client-react";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
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

import { OfflineBanner } from "@/components/OfflineBanner";
import { tekstStijl, bovenInset } from "@/components/ui";
// `ruimte` wordt hier als state-variabele gebruikt; de ontwerp-spacingtokens
// importeren we daarom onder het alias `sp`.
import { ruimte as sp } from "@workspace/ontwerp";
import { useOffline } from "@/context/offline";
import { useSync } from "@/context/sync";
import { useColors } from "@/hooks/useColors";
import {
  leesOpnameItem,
  patchOpnameItemLokaal,
  slaOpnameItemOp,
} from "@/lib/offlineCache";
import { MAX_POGINGEN, WachtrijItem, laadWachtrij, voegToeAanWachtrij } from "@/lib/syncQueue";
import { bewaarBestandUitUri, documentMap, lijstMap, maakMap, resolveDisplayUri } from "@/lib/bestanden";

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
  const { isOnline } = useOffline();
  const { herlaadAantal, verwijderEnkelMislukt, herprobeeerEnkel, aantalWachtend, aantalMislukt } = useSync();
  const fotoMapGemaakt = useRef(false);

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
  const [lokaleFotos, setLokaleFotos] = useState<string[]>([]);
  const [displayUris, setDisplayUris] = useState<Record<string, string>>({});
  const [gecachedItem, setGecachedItem] = useState<Record<string, unknown> | null>(null);
  const [uploadFout, setUploadFout] = useState<{ type: "netwerk" | "bestandstype" | "overig"; bericht: string } | null>(null);
  const [wachtrijFotos, setWachtrijFotos] = useState<WachtrijItem[]>([]);
  const laatstUriRef = useRef<string | null>(null);

  const herlaadWachtrijFotos = useCallback(async () => {
    const alle = await laadWachtrij();
    setWachtrijFotos(
      alle.filter(
        (i): i is WachtrijItem & { type: "upload_foto_lokaal" } =>
          i.type === "upload_foto_lokaal" && (i as { itemId?: number }).itemId === id,
      ),
    );
  }, [id]);

  const fotoDir = documentMap(`opname-fotos/${id}`);

  useEffect(() => {
    void herlaadWachtrijFotos();
  }, [herlaadWachtrijFotos, aantalWachtend, aantalMislukt]);

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
    // Cache item voor offline gebruik
    void slaOpnameItemOp(id, item);
  }, [item, id]);

  // Laad gecachede versie als offline
  useEffect(() => {
    if (!isOnline && !item) {
      leesOpnameItem(id).then((cached) => {
        if (cached) {
          const c2 = cached as Record<string, unknown>;
          setGecachedItem(c2);
          setSpotType((c2.spot_type as string) ?? "");
          setRuimte((c2.ruimte as string) ?? "");
          setBeschrijving((c2.beschrijving as string) ?? "");
          setActie((c2.actie as string) ?? "controleren");
          setBereikbaarheid((c2.bereikbaarheid as string) ?? "goed");
          setAantal(String((c2.aantal as number) ?? 1));
          setAfmetingen((c2.afmetingen as string) ?? "");
          setPrioriteit((c2.prioriteit as string) ?? "normaal");
          setNotities((c2.notities as string) ?? "");
          setAfgerond((c2.afgerond as boolean) ?? false);
        }
      });
    }
  }, [isOnline, item, id]);

  // Laad lokale foto's
  useEffect(() => {
    lijstMap(fotoDir).then((paden) => {
      if (paden.length > 0) setLokaleFotos(paden);
    });
  }, [fotoDir]);

  // Zet idb://-paden om naar blob-URLs voor weergave in <Image>
  useEffect(() => {
    let actief = true;
    void Promise.all(
      lokaleFotos.map(async (pad) => {
        const uri = await resolveDisplayUri(pad);
        return [pad, uri] as const;
      }),
    ).then((paren) => {
      if (!actief) return;
      setDisplayUris(Object.fromEntries(paren));
    });
    return () => { actief = false; };
  }, [lokaleFotos]);

  function markeerGewijzigd() { setHeeftWijzigingen(true); }

  async function opslaan() {
    const velden = {
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
    };

    if (!isOnline) {
      // Offline: sla lokaal op en zet in wachtrij
      await patchOpnameItemLokaal(id, velden as Record<string, unknown>);
      await voegToeAanWachtrij({
        type: "patch_opname_item",
        itemId: id,
        velden: velden as Record<string, unknown>,
      });
      await herlaadAantal();
      setHeeftWijzigingen(false);
      return;
    }

    // Online pad
    await bijwerken.mutateAsync({ itemId: id, data: velden });
    setHeeftWijzigingen(false);
    await refetch();
  }

  async function maakFotoMap() {
    if (!fotoMapGemaakt.current) {
      await maakMap(fotoDir);
      fotoMapGemaakt.current = true;
    }
  }

  async function voegFotoToe() {
    const permCam = await ImagePicker.requestCameraPermissionsAsync();
    const permGal = await ImagePicker.requestMediaLibraryPermissionsAsync();

    Alert.alert(
      "Foto toevoegen",
      "Kies een bron",
      [
        ...(permCam.status === "granted"
          ? [{
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
            }]
          : []),
        ...(permGal.status === "granted"
          ? [{
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
            }]
          : []),
        { text: "Annuleren", style: "cancel" },
      ],
    );
  }

  async function uploadFoto(uri: string) {
    setUploadFout(null);
    laatstUriRef.current = uri;

    if (!isOnline) {
      // Offline: sla foto lokaal op en zet in wachtrij
      setIsUploading(true);
      try {
        await maakFotoMap();
        const bestandsnaam = `foto_${Date.now()}.jpg`;
        const lokaalPad = await bewaarBestandUitUri(uri, fotoDir, bestandsnaam);
        setLokaleFotos((prev) => [...prev, lokaalPad]);
        await voegToeAanWachtrij({
          type: "upload_foto_lokaal",
          lokaalPad,
          itemId: id,
          fase: "uitvoering",
        });
        await herlaadAantal();
        await herlaadWachtrijFotos();
      } catch {
        Alert.alert("Fout", "Foto kon niet lokaal worden opgeslagen.");
      } finally {
        setIsUploading(false);
      }
      return;
    }

    // Online pad
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
      const putResponse = await fetch(upload_url, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": contentType },
      });

      if (!putResponse.ok) {
        if (putResponse.status >= 400 && putResponse.status < 500) {
          setUploadFout({
            type: "bestandstype",
            bericht: `Bestand geweigerd door de opslag (HTTP ${putResponse.status}). Kies een ander bestand.`,
          });
          return;
        }
        throw new Error(`HTTP ${putResponse.status}`);
      }

      await refetch();
    } catch (err) {
      const e = err instanceof Error ? err : new Error("Onbekende fout");
      const isNetwerkFout =
        e instanceof TypeError ||
        e.message === "Failed to fetch" ||
        e.message === "Network request failed" ||
        e.message === "NetworkError when attempting to fetch resource.";
      setUploadFout({
        type: isNetwerkFout ? "netwerk" : "overig",
        bericht: isNetwerkFout
          ? "Verbinding weggevallen. Controleer uw netwerk en probeer opnieuw."
          : `Upload mislukt: ${e.message}. Probeer het opnieuw.`,
      });
    } finally {
      setIsUploading(false);
    }
  }

  async function opnieuwProberen() {
    if (laatstUriRef.current) {
      await uploadFoto(laatstUriRef.current);
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

  const huidigItem = item ?? (gecachedItem ? { ...gecachedItem, fotos: [] } as unknown as typeof item : null);
  const typeInfo = SPOT_TYPEN.find((t) => t.waarde === spotType);
  const fotos = item?.fotos ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View
        style={{
          backgroundColor: c.dark,
          paddingTop: bovenInset(insets) + sp.m,
          paddingHorizontal: sp.xl,
          paddingBottom: sp.l,
        }}
      >
        <Pressable onPress={() => router.back()} style={{ marginBottom: sp.s }}>
          <Text style={tekstStijl("nadruk", c.primary)}>
            ‹ Terug
          </Text>
        </Pressable>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={tekstStijl("sectiekop", c.darkForeground)}>
              {typeInfo?.label ?? spotType}
            </Text>
            {(huidigItem as typeof item)?.ruimte ? (
              <Text style={[tekstStijl("klein", c.darkMuted), { marginTop: sp.xs / 2 }]}>
                {(huidigItem as typeof item)?.ruimte}
              </Text>
            ) : null}
          </View>
          {/* Afgerond toggle */}
          <Pressable
            onPress={() => { setAfgerond(!afgerond); markeerGewijzigd(); }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: sp.xs + 2,
              backgroundColor: afgerond ? c.success + "22" : c.darkForeground + "1A",
              paddingHorizontal: sp.m,
              paddingVertical: sp.s,
              borderRadius: sp.s + 2,
            }}
          >
            <Ionicons
              name={afgerond ? "checkmark-circle" : "radio-button-off-outline"}
              size={18}
              color={afgerond ? c.success : c.darkMuted}
            />
            <Text style={[tekstStijl("bijschrift", afgerond ? c.success : c.darkMuted), { fontFamily: "Inter_600SemiBold" }]}>
              {afgerond ? "Afgerond" : "Open"}
            </Text>
          </Pressable>
        </View>
      </View>

      <OfflineBanner stijl="compact" />

      <ScrollView contentContainerStyle={{ padding: sp.l, paddingBottom: sp.xxl * 3 + sp.xs }} keyboardShouldPersistTaps="handled">
        {isLoading && !gecachedItem ? (
          <ActivityIndicator color={c.primary} style={{ marginTop: sp.xxl + sp.s }} />
        ) : (
          <>
            {/* Offline-cache melding */}
            {!isOnline && gecachedItem && !item ? (
              <View
                style={{
                  backgroundColor: c.warning + "1A",
                  borderRadius: sp.s,
                  padding: sp.s + 2,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: sp.xs + 2,
                  marginBottom: sp.m + 2,
                }}
              >
                <Ionicons name="time-outline" size={14} color={c.warning} />
                <Text style={[tekstStijl("bijschrift", c.warning), { flex: 1 }]}>
                  Gegevens uit lokale cache — wijzigingen worden gesynchroniseerd bij verbinding
                </Text>
              </View>
            ) : null}

            {/* Type */}
            <Text style={[tekstStijl("klein", c.foreground), { fontFamily: "Inter_600SemiBold", marginBottom: sp.s }]}>
              Type voorziening
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: sp.l }} contentContainerStyle={{ gap: sp.s }}>
              {SPOT_TYPEN.map((t) => (
                <Pressable
                  key={t.waarde}
                  onPress={() => { setSpotType(t.waarde); markeerGewijzigd(); }}
                  style={{
                    paddingHorizontal: sp.m + 2, paddingVertical: sp.s, borderRadius: sp.s, borderWidth: 1,
                    borderColor: spotType === t.waarde ? t.kleur : c.border,
                    backgroundColor: spotType === t.waarde ? t.kleur + "22" : c.card,
                  }}
                >
                  <Text style={[tekstStijl("klein", spotType === t.waarde ? t.kleur : c.foreground), { fontFamily: "Inter_500Medium" }]}>
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Actie */}
            <Text style={[tekstStijl("klein", c.foreground), { fontFamily: "Inter_600SemiBold", marginBottom: sp.s }]}>
              Vereiste actie
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: sp.s, marginBottom: sp.l }}>
              {ACTIES.map((a) => (
                <Pressable
                  key={a.waarde}
                  onPress={() => { setActie(a.waarde); markeerGewijzigd(); }}
                  style={{
                    paddingHorizontal: sp.m, paddingVertical: sp.xs + 3, borderRadius: sp.s, borderWidth: 1,
                    borderColor: actie === a.waarde ? c.primary : c.border,
                    backgroundColor: actie === a.waarde ? c.accent : c.card,
                  }}
                >
                  <Text style={[tekstStijl("bijschrift", actie === a.waarde ? c.primary : c.foreground), { fontFamily: "Inter_500Medium" }]}>
                    {a.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Bereikbaarheid */}
            <Text style={[tekstStijl("klein", c.foreground), { fontFamily: "Inter_600SemiBold", marginBottom: sp.s }]}>
              Bereikbaarheid
            </Text>
            <View style={{ flexDirection: "row", gap: sp.s, marginBottom: sp.l }}>
              {BEREIKBAARHEID.map((b) => (
                <Pressable
                  key={b.waarde}
                  onPress={() => { setBereikbaarheid(b.waarde); markeerGewijzigd(); }}
                  style={{
                    flex: 1, paddingVertical: sp.s, borderRadius: sp.s, alignItems: "center", borderWidth: 1,
                    borderColor: bereikbaarheid === b.waarde ? b.kleur : c.border,
                    backgroundColor: bereikbaarheid === b.waarde ? b.kleur + "22" : c.card,
                  }}
                >
                  <Text style={[tekstStijl("bijschrift", bereikbaarheid === b.waarde ? b.kleur : c.foreground), { fontFamily: "Inter_500Medium" }]}>
                    {b.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Prioriteit */}
            <Text style={[tekstStijl("klein", c.foreground), { fontFamily: "Inter_600SemiBold", marginBottom: sp.s }]}>
              Prioriteit
            </Text>
            <View style={{ flexDirection: "row", gap: sp.s, marginBottom: sp.l }}>
              {PRIORITEITEN.map((p) => (
                <Pressable
                  key={p.waarde}
                  onPress={() => { setPrioriteit(p.waarde); markeerGewijzigd(); }}
                  style={{
                    flex: 1, paddingVertical: sp.s, borderRadius: sp.s, alignItems: "center", borderWidth: 1,
                    borderColor: prioriteit === p.waarde ? c.primary : c.border,
                    backgroundColor: prioriteit === p.waarde ? c.accent : c.card,
                  }}
                >
                  <Text style={[tekstStijl("bijschrift", prioriteit === p.waarde ? c.primary : c.foreground), { fontFamily: "Inter_500Medium" }]}>
                    {p.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Ruimte + Aantal */}
            <View style={{ flexDirection: "row", gap: sp.m, marginBottom: sp.m + 2 }}>
              <View style={{ flex: 3 }}>
                <Text style={[tekstStijl("klein", c.foreground), { fontFamily: "Inter_600SemiBold", marginBottom: sp.xs + 2 }]}>
                  Ruimte / locatie
                </Text>
                <TextInput
                  value={ruimte}
                  onChangeText={(v) => { setRuimte(v); markeerGewijzigd(); }}
                  placeholder="Gang, serverruimte..."
                  placeholderTextColor={c.mutedForeground}
                  style={[tekstStijl("standaard", c.foreground), { borderWidth: 1, borderColor: c.border, borderRadius: sp.s + 2, padding: sp.m, backgroundColor: c.card }]}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[tekstStijl("klein", c.foreground), { fontFamily: "Inter_600SemiBold", marginBottom: sp.xs + 2 }]}>
                  Aantal
                </Text>
                <TextInput
                  value={aantal}
                  onChangeText={(v) => { setAantal(v); markeerGewijzigd(); }}
                  keyboardType="numeric"
                  style={[tekstStijl("standaard", c.foreground), { borderWidth: 1, borderColor: c.border, borderRadius: sp.s + 2, padding: sp.m, backgroundColor: c.card }]}
                />
              </View>
            </View>

            {/* Afmetingen */}
            <Text style={[tekstStijl("klein", c.foreground), { fontFamily: "Inter_600SemiBold", marginBottom: sp.xs + 2 }]}>
              Afmetingen
            </Text>
            <TextInput
              value={afmetingen}
              onChangeText={(v) => { setAfmetingen(v); markeerGewijzigd(); }}
              placeholder="Bijv. 900×2100 mm"
              placeholderTextColor={c.mutedForeground}
              style={[tekstStijl("standaard", c.foreground), { borderWidth: 1, borderColor: c.border, borderRadius: sp.s + 2, padding: sp.m, backgroundColor: c.card, marginBottom: sp.m + 2 }]}
            />

            {/* Beschrijving */}
            <Text style={[tekstStijl("klein", c.foreground), { fontFamily: "Inter_600SemiBold", marginBottom: sp.xs + 2 }]}>
              Situatie / bevinding
            </Text>
            <TextInput
              value={beschrijving}
              onChangeText={(v) => { setBeschrijving(v); markeerGewijzigd(); }}
              placeholder="Wat is er te zien? Waarom voldoet het niet?"
              placeholderTextColor={c.mutedForeground}
              multiline
              numberOfLines={3}
              style={[tekstStijl("standaard", c.foreground), { borderWidth: 1, borderColor: c.border, borderRadius: sp.s + 2, padding: sp.m, backgroundColor: c.card, marginBottom: sp.m + 2, textAlignVertical: "top", minHeight: sp.xxl + sp.xxl + sp.s }]}
            />

            {/* Notities */}
            <Text style={[tekstStijl("klein", c.foreground), { fontFamily: "Inter_600SemiBold", marginBottom: sp.xs + 2 }]}>
              Notities (intern)
            </Text>
            <TextInput
              value={notities}
              onChangeText={(v) => { setNotities(v); markeerGewijzigd(); }}
              placeholder="Extra opmerkingen, aandachtspunten..."
              placeholderTextColor={c.mutedForeground}
              multiline
              numberOfLines={2}
              style={[tekstStijl("standaard", c.foreground), { borderWidth: 1, borderColor: c.border, borderRadius: sp.s + 2, padding: sp.m, backgroundColor: c.card, marginBottom: sp.xl, textAlignVertical: "top", minHeight: sp.xxl + sp.xl + sp.s }]}
            />

            {/* Opslaan knop */}
            {heeftWijzigingen && (
              <Pressable
                onPress={() => void opslaan()}
                disabled={bijwerken.isPending}
                style={{ backgroundColor: c.primary, padding: sp.m + 2, borderRadius: c.radius, alignItems: "center", marginBottom: sp.xl }}
              >
                {bijwerken.isPending ? (
                  <ActivityIndicator color={c.primaryForeground} />
                ) : (
                  <Text style={[tekstStijl("nadruk", c.primaryForeground), { fontFamily: "Inter_700Bold" }]}>
                    {!isOnline ? "Lokaal opslaan (sync later)" : "Wijzigingen opslaan"}
                  </Text>
                )}
              </Pressable>
            )}

            {/* Foto's sectie */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: wachtrijFotos.length > 0 ? sp.s : sp.m }}>
              <Text style={[tekstStijl("nadruk", c.foreground), { fontFamily: "Inter_700Bold" }]}>
                Foto's {(fotos.length + lokaleFotos.length) > 0 ? `(${fotos.length + lokaleFotos.length})` : ""}
              </Text>
              <Pressable
                onPress={() => void voegFotoToe()}
                disabled={isUploading}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: sp.xs + 2,
                  backgroundColor: c.accent,
                  paddingHorizontal: sp.m + 2,
                  paddingVertical: sp.s,
                  borderRadius: sp.s + 2,
                }}
              >
                {isUploading ? (
                  <ActivityIndicator size="small" color={c.primary} />
                ) : (
                  <Ionicons name="camera-outline" size={16} color={c.primary} />
                )}
                <Text style={[tekstStijl("klein", c.primary), { fontFamily: "Inter_600SemiBold" }]}>
                  {isUploading ? (isOnline ? "Uploaden..." : "Opslaan...") : "Foto toevoegen"}
                </Text>
              </Pressable>
            </View>

            {/* Wachtrij foto-meldingen (pending en mislukt) */}
            {wachtrijFotos.length > 0 ? (
              <View style={{ gap: sp.xs + 2, marginBottom: sp.m }}>
                {wachtrijFotos.map((item) => {
                  const isMislukt = item.pogingen >= MAX_POGINGEN;
                  return (
                    <View
                      key={item.id}
                      style={{
                        backgroundColor: (isMislukt ? c.destructive : c.warning) + "14",
                        borderWidth: 1,
                        borderColor: (isMislukt ? c.destructive : c.warning) + "4D",
                        borderRadius: sp.s + 2,
                        padding: sp.s + 2,
                        flexDirection: "row",
                        alignItems: "flex-start",
                        gap: sp.s,
                      }}
                    >
                      <Ionicons
                        name={isMislukt ? "warning-outline" : "time-outline"}
                        size={15}
                        color={isMislukt ? c.destructive : c.warning}
                        style={{ marginTop: 1 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            tekstStijl("bijschrift", isMislukt ? c.destructive : c.warning),
                            { fontFamily: "Inter_600SemiBold", marginBottom: sp.xs / 2 },
                          ]}
                        >
                          {isMislukt
                            ? `Foto uploaden mislukt (${item.pogingen}\u00d7 geprobeerd)`
                            : "Foto wacht op synchronisatie"}
                        </Text>
                        {item.fout ? (
                          <Text
                            style={[tekstStijl("bijschrift", c.destructive), { marginBottom: sp.xs + 2 }]}
                            numberOfLines={2}
                          >
                            {item.fout}
                          </Text>
                        ) : null}
                        {isMislukt ? (
                          <View style={{ flexDirection: "row", gap: sp.s, marginTop: sp.xs }}>
                            <Pressable
                              onPress={async () => {
                                await herprobeeerEnkel(item.id);
                                await herlaadWachtrijFotos();
                              }}
                              style={({ pressed }) => ({
                                flex: 1,
                                backgroundColor: c.primary + (pressed ? "33" : "1A"),
                                borderRadius: sp.s - 1,
                                paddingVertical: sp.xs + 2,
                                alignItems: "center",
                                borderWidth: 1,
                                borderColor: c.primary + "4D",
                              })}
                            >
                              <Text
                                style={[tekstStijl("bijschrift", c.primary), { fontFamily: "Inter_600SemiBold" }]}
                              >
                                Opnieuw proberen
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={async () => {
                                await verwijderEnkelMislukt(item.id);
                                await herlaadWachtrijFotos();
                              }}
                              style={({ pressed }) => ({
                                flex: 1,
                                backgroundColor: pressed ? c.destructive + "26" : "transparent",
                                borderRadius: sp.s - 1,
                                paddingVertical: sp.xs + 2,
                                alignItems: "center",
                                borderWidth: 1,
                                borderColor: c.destructive + "4D",
                              })}
                            >
                              <Text
                                style={[tekstStijl("bijschrift", c.destructive), { fontFamily: "Inter_600SemiBold" }]}
                              >
                                Verwijderen
                              </Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {/* Upload-foutmelding */}
            {uploadFout ? (
              <View
                style={{
                  backgroundColor: c.destructive + "1A",
                  borderWidth: 1,
                  borderColor: c.destructive,
                  borderRadius: sp.s + 2,
                  padding: sp.m,
                  marginBottom: sp.m,
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: sp.s + 2,
                }}
              >
                <Ionicons name="alert-circle-outline" size={18} color={c.destructive} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[tekstStijl("klein", c.destructive), { fontFamily: "Inter_600SemiBold", marginBottom: sp.xs + 2 }]}>
                    Foto uploaden mislukt
                  </Text>
                  <Text style={[tekstStijl("bijschrift", c.destructive), { marginBottom: sp.s + 2 }]}>
                    {uploadFout.bericht}
                  </Text>
                  {uploadFout.type === "bestandstype" ? (
                    <Pressable
                      onPress={() => void voegFotoToe()}
                      style={{
                        alignSelf: "flex-start",
                        backgroundColor: c.destructive,
                        paddingHorizontal: sp.m,
                        paddingVertical: sp.xs + 3,
                        borderRadius: sp.s,
                      }}
                    >
                      <Text style={[tekstStijl("bijschrift", c.primaryForeground), { fontFamily: "Inter_600SemiBold" }]}>
                        Ander bestand kiezen
                      </Text>
                    </Pressable>
                  ) : (
                    <View style={{ flexDirection: "row", gap: sp.s }}>
                      <Pressable
                        onPress={() => void opnieuwProberen()}
                        disabled={isUploading}
                        style={{
                          backgroundColor: c.destructive,
                          paddingHorizontal: sp.m,
                          paddingVertical: sp.xs + 3,
                          borderRadius: sp.s,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: sp.xs + 1,
                        }}
                      >
                        {isUploading ? (
                          <ActivityIndicator size="small" color={c.primaryForeground} />
                        ) : (
                          <Ionicons name="refresh-outline" size={13} color={c.primaryForeground} />
                        )}
                        <Text style={[tekstStijl("bijschrift", c.primaryForeground), { fontFamily: "Inter_600SemiBold" }]}>
                          Opnieuw proberen
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setUploadFout(null)}
                        style={{
                          paddingHorizontal: sp.m,
                          paddingVertical: sp.xs + 3,
                          borderRadius: sp.s,
                          borderWidth: 1,
                          borderColor: c.destructive,
                        }}
                      >
                        <Text style={[tekstStijl("bijschrift", c.destructive), { fontFamily: "Inter_600SemiBold" }]}>
                          Sluiten
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>
            ) : null}

            {(fotos.length === 0 && lokaleFotos.length === 0) ? (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: c.border,
                  borderStyle: "dashed",
                  borderRadius: c.radius,
                  padding: sp.xl + sp.xs + 2,
                  alignItems: "center",
                }}
              >
                <Ionicons name="camera-outline" size={32} color={c.mutedForeground} />
                <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: sp.s }]}>
                  Nog geen foto's — gebruik de knop hierboven
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: sp.s + 2 }}>
                {/* Server-foto's */}
                {fotos.map((foto) => (
                  <View key={foto.id} style={{ position: "relative" }}>
                    <Image
                      source={{ uri: `https://${API_DOMEIN}${foto.url ?? ""}` }}
                      style={{ width: sp.xxl * 3 + 4, height: sp.xxl * 3 + 4, borderRadius: sp.s + 2, backgroundColor: c.muted }}
                      resizeMode="cover"
                    />
                    <Pressable
                      onPress={() => bevestigVerwijderFoto(foto.id)}
                      style={{
                        position: "absolute",
                        top: sp.xs,
                        right: sp.xs,
                        backgroundColor: c.dark + "99",
                        borderRadius: sp.s + 2,
                        padding: sp.xs,
                      }}
                    >
                      <Ionicons name="trash-outline" size={14} color={c.darkForeground} />
                    </Pressable>
                    {foto.bijschrift ? (
                      <Text style={[tekstStijl("bijschrift", c.mutedForeground), { marginTop: sp.xs - 1, width: sp.xxl * 3 + 4 }]} numberOfLines={1}>
                        {foto.bijschrift}
                      </Text>
                    ) : null}
                  </View>
                ))}
                {/* Lokale foto's (wachten op sync) */}
                {lokaleFotos.map((pad) => (
                  <View key={pad} style={{ position: "relative" }}>
                    <Image
                      source={{ uri: displayUris[pad] ?? pad }}
                      style={{ width: sp.xxl * 3 + 4, height: sp.xxl * 3 + 4, borderRadius: sp.s + 2, backgroundColor: c.muted, opacity: 0.85 }}
                      resizeMode="cover"
                    />
                    <View
                      style={{
                        position: "absolute",
                        bottom: sp.xs,
                        left: sp.xs,
                        backgroundColor: c.warning + "D9",
                        borderRadius: sp.xs + 2,
                        paddingHorizontal: sp.xs + 1,
                        paddingVertical: sp.xs / 2,
                      }}
                    >
                      <Text style={[tekstStijl("bijschrift", c.dark), { fontFamily: "Inter_600SemiBold" }]}>Lokaal</Text>
                    </View>
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
            padding: sp.l,
            paddingBottom: sp.l + insets.bottom,
          }}
        >
          <Pressable
            onPress={() => void opslaan()}
            disabled={bijwerken.isPending}
            style={{ backgroundColor: c.primary, padding: sp.m + 2, borderRadius: c.radius, alignItems: "center" }}
          >
            {bijwerken.isPending ? (
              <ActivityIndicator color={c.primaryForeground} />
            ) : (
              <Text style={[tekstStijl("nadruk", c.primaryForeground), { fontFamily: "Inter_700Bold" }]}>
                {!isOnline ? "Lokaal opslaan" : "Wijzigingen opslaan"}
              </Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}
