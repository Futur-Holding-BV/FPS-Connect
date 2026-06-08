import {
  useAddFoto,
  useCreateVoorziening,
  useGetVerdieping,
  useGetVolgendSpotnummer,
  useListFotos,
  useListVoorzieningenOpVerdieping,
  useArchiveerVoorziening,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ChipRij,
  Knop,
  SectieLabel,
  TekstVeld,
  bovenInset,
  onderInset,
} from "@/components/ui";
import { PdfPlattegrond, type PlattegrondSpot } from "@/components/PdfPlattegrond";
import {
  CLASSIFICATIE_OPTIES,
  STATUS_VOLGORDE,
  TYPE_VOLGORDE,
  WAND_PLAFOND_OPTIES,
  WBDBO_OPTIES,
  WRD_OPTIES,
  statusKleur,
  statusLabel,
  typeInfo,
} from "@/constants/spots";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/auth";
import { useSync } from "@/context/sync";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import { uploadFoto } from "@/lib/upload";

const LEEG = {
  objectnummer: "",
  type: "branddeur",
  status: "in_uitvoering",
  classificatie: "60",
  wbdbo: "60",
  wrd: "",
  wand_of_plafond: "",
  ruimte: "",
  locatie_omschrijving: "",
};

const DOMEIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";

export default function Plattegrond() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { gebruiker, token } = useAuth();
  const { verdiepingId, gebouwId, naam } = useLocalSearchParams<{
    verdiepingId: string;
    gebouwId: string;
    naam: string;
  }>();

  const vId = Number(verdiepingId);
  const gId = Number(gebouwId);

  const { data: verdieping } = useGetVerdieping(vId);
  const { data: voorzieningen, refetch } = useListVoorzieningenOpVerdieping(vId);
  const { data: volgendSpot, refetch: refetchSpotnummer } = useGetVolgendSpotnummer(gId);
  const maakVoorziening = useCreateVoorziening();
  const voegFotoToe = useAddFoto();

  const { syncStatus, aantalWachtend, forceerSync } = useSync();

  const [plaatsModus, setPlaatsModus] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [locatie, setLocatie] = useState({ x: 0, y: 0 });
  const [form, setForm] = useState({ ...LEEG });
  const [voorFotos, setVoorFotos] = useState<string[]>([]);
  const [naFotos, setNaFotos] = useState<string[]>([]);
  const [fotoBezig, setFotoBezig] = useState(false);
  const [opslaan, setOpslaan] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const spots: PlattegrondSpot[] = (voorzieningen ?? []).map((v) => ({
    id: v.id,
    objectnummer: v.objectnummer,
    type: v.type,
    status: v.status,
    wand_of_plafond: v.wand_of_plafond,
    locatie_x: v.locatie_x,
    locatie_y: v.locatie_y,
  }));

  const detailSpot = (voorzieningen ?? []).find((v) => v.id === detailId) ?? null;

  function opTap(x: number, y: number) {
    setLocatie({ x, y });
    setForm({ ...LEEG, objectnummer: volgendSpot?.spotnummer ?? "" });
    setVoorFotos([]);
    setNaFotos([]);
    setFormOpen(true);
  }

  async function kiesFoto(fase: "voor" | "na", bron: "camera" | "galerij") {
    try {
      const perm =
        bron === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Toestemming nodig",
          bron === "camera"
            ? "Geef toegang tot de camera om foto's te maken."
            : "Geef toegang tot je foto's.",
        );
        return;
      }
      const res =
        bron === "camera"
          ? await ImagePicker.launchCameraAsync({ quality: 0.6, mediaTypes: ["images"] })
          : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ["images"] });
      if (res.canceled || !res.assets?.[0]) return;
      setFotoBezig(true);
      const objectPath = await uploadFoto(res.assets[0].uri);
      if (fase === "voor") setVoorFotos((a) => [...a, objectPath]);
      else setNaFotos((a) => [...a, objectPath]);
    } catch (e) {
      Alert.alert("Fout", e instanceof Error ? e.message : "Foto opslaan mislukt");
    } finally {
      setFotoBezig(false);
    }
  }

  async function bewaar() {
    setOpslaan(true);
    try {
      const aangemaakt = await maakVoorziening.mutateAsync({
        data: {
          objectnummer: form.objectnummer.trim() || undefined,
          type: form.type,
          status: form.status,
          classificatie: form.classificatie,
          gebouw_id: gId,
          verdieping_id: vId,
          locatie_x: locatie.x,
          locatie_y: locatie.y,
          ruimte: form.ruimte || undefined,
          locatie_omschrijving: form.locatie_omschrijving || undefined,
          wbdbo: form.wbdbo || undefined,
          wrd: form.wrd || undefined,
          wand_of_plafond: form.wand_of_plafond || undefined,
          installatie_datum: new Date().toISOString().slice(0, 10),
          maker_monteur_id: gebruiker?.id,
          monteur_id: gebruiker?.id,
        },
      });
      const nieuwId = (aangemaakt as { id?: number })?.id;
      if (nieuwId) {
        for (const url of voorFotos) {
          await voegFotoToe.mutateAsync({ id: nieuwId, data: { fase: "voor", url } });
        }
        for (const url of naFotos) {
          await voegFotoToe.mutateAsync({ id: nieuwId, data: { fase: "na", url } });
        }
      }
      setFormOpen(false);
      setPlaatsModus(false);
      await refetch();
      refetchSpotnummer();
      // Direct synchroniseren zodra verbinding beschikbaar is
      forceerSync();
    } catch (e) {
      Alert.alert("Opslaan mislukt", e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      setOpslaan(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#2b303b" }}>
      <PdfPlattegrond
        plattegrondUrl={verdieping?.plattegrond_url ?? null}
        spots={spots}
        plaatsModus={plaatsModus}
        token={token ?? ""}
        domein={DOMEIN}
        onTap={opTap}
        onSpot={(id) => setDetailId(id)}
      />

      {/* Kopbalk over de WebView */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          paddingTop: bovenInset(insets) + 8,
          paddingHorizontal: 16,
          paddingBottom: 12,
          backgroundColor: "rgba(33,38,49,0.92)",
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={{ color: c.primary, fontSize: 26, fontFamily: "Inter_700Bold" }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" }} numberOfLines={1}>
            {naam || "Plattegrond"}
          </Text>
          <Text style={{ color: "#9AA3B2", fontSize: 13, fontFamily: "Inter_400Regular" }}>
            {spots.length} voorzieningen · knijp om te zoomen
          </Text>
        </View>
        <SyncStatusBadge status={syncStatus} aantalWachtend={aantalWachtend} />
      </View>

      {/* Instructiebalk in plaatsmodus */}
      {plaatsModus && (
        <View
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: onderInset(insets) + 96,
            backgroundColor: c.primary,
            borderRadius: c.radius,
            paddingVertical: 14,
            paddingHorizontal: 18,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold", textAlign: "center" }}>
            Tik op de plattegrond om een voorziening te plaatsen
          </Text>
        </View>
      )}

      {/* Actieknop rechtsonder (één-handsbediening) */}
      <Pressable
        onPress={() => setPlaatsModus((v) => !v)}
        style={{
          position: "absolute",
          right: 20,
          bottom: onderInset(insets) + 24,
          height: 64,
          paddingHorizontal: 22,
          borderRadius: 32,
          backgroundColor: plaatsModus ? c.destructive : c.primary,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          shadowColor: "#000",
          shadowOpacity: 0.3,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 24, fontFamily: "Inter_700Bold" }}>
          {plaatsModus ? "✕" : "+"}
        </Text>
        <Text style={{ color: "#fff", fontSize: 17, fontFamily: "Inter_600SemiBold" }}>
          {plaatsModus ? "Annuleren" : "Voorziening"}
        </Text>
      </Pressable>

      {/* ---- Formulier nieuwe voorziening ---- */}
      <Modal visible={formOpen} animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: c.background }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View
            style={{
              backgroundColor: c.dark,
              paddingTop: bovenInset(insets) + 10,
              paddingHorizontal: 20,
              paddingBottom: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold" }}>
              Nieuwe voorziening
            </Text>
            <Pressable onPress={() => setFormOpen(false)} hitSlop={10}>
              <Text style={{ color: "#9AA3B2", fontSize: 22, fontFamily: "Inter_600SemiBold" }}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <TekstVeld
              label="Spotnummer"
              value={form.objectnummer}
              editable={false}
              placeholder="Wordt automatisch toegekend"
            />

            <View style={{ gap: 8 }}>
              <SectieLabel>Type voorziening</SectieLabel>
              <ChipRij
                opties={TYPE_VOLGORDE.map((t) => ({
                  waarde: t,
                  label: typeInfo(t).label,
                  kleur: typeInfo(t).kleur,
                }))}
                geselecteerd={form.type}
                onKies={(v) => setForm((f) => ({ ...f, type: v }))}
              />
            </View>

            <View style={{ gap: 8 }}>
              <SectieLabel>Status</SectieLabel>
              <ChipRij
                opties={STATUS_VOLGORDE.map((s) => ({
                  waarde: s,
                  label: statusLabel(s),
                  kleur: statusKleur(s),
                }))}
                geselecteerd={form.status}
                onKies={(v) => setForm((f) => ({ ...f, status: v }))}
              />
            </View>

            <View style={{ gap: 8 }}>
              <SectieLabel>Classificatie (EI)</SectieLabel>
              <ChipRij
                opties={CLASSIFICATIE_OPTIES.map((v) => ({ waarde: v, label: `EI ${v}` }))}
                geselecteerd={form.classificatie}
                onKies={(v) => setForm((f) => ({ ...f, classificatie: v }))}
              />
            </View>

            <View style={{ gap: 8 }}>
              <SectieLabel>WBDBO (min)</SectieLabel>
              <ChipRij
                opties={WBDBO_OPTIES.map((v) => ({ waarde: v, label: v }))}
                geselecteerd={form.wbdbo}
                onKies={(v) => setForm((f) => ({ ...f, wbdbo: v }))}
              />
            </View>

            <View style={{ gap: 8 }}>
              <SectieLabel>WRD (min)</SectieLabel>
              <ChipRij
                opties={[{ waarde: "", label: "Geen" }, ...WRD_OPTIES.map((v) => ({ waarde: v, label: v }))]}
                geselecteerd={form.wrd}
                onKies={(v) => setForm((f) => ({ ...f, wrd: v }))}
              />
            </View>

            <View style={{ gap: 8 }}>
              <SectieLabel>Wand of plafond</SectieLabel>
              <ChipRij
                opties={[
                  { waarde: "", label: "Niet opgegeven" },
                  ...WAND_PLAFOND_OPTIES.map((v) => ({ waarde: v, label: v === "wand" ? "Wand" : "Plafond" })),
                ]}
                geselecteerd={form.wand_of_plafond}
                onKies={(v) => setForm((f) => ({ ...f, wand_of_plafond: v }))}
              />
            </View>

            <TekstVeld
              label="Ruimte"
              value={form.ruimte}
              onChangeText={(t) => setForm((f) => ({ ...f, ruimte: t }))}
              placeholder="bijv. Trappenhuis A"
            />

            <TekstVeld
              label="Locatie-omschrijving"
              value={form.locatie_omschrijving}
              onChangeText={(t) => setForm((f) => ({ ...f, locatie_omschrijving: t }))}
              placeholder="bijv. naast de meterkast"
              multiline
              style={{ minHeight: 70, textAlignVertical: "top" }}
            />

            <FotoSectie
              titel="Foto's vóór"
              fotos={voorFotos}
              bezig={fotoBezig}
              token={token ?? ""}
              onCamera={() => kiesFoto("voor", "camera")}
              onGalerij={() => kiesFoto("voor", "galerij")}
              onVerwijder={(i) => setVoorFotos((a) => a.filter((_, idx) => idx !== i))}
            />

            <FotoSectie
              titel="Foto's ná"
              fotos={naFotos}
              bezig={fotoBezig}
              token={token ?? ""}
              onCamera={() => kiesFoto("na", "camera")}
              onGalerij={() => kiesFoto("na", "galerij")}
              onVerwijder={(i) => setNaFotos((a) => a.filter((_, idx) => idx !== i))}
            />

            <View style={{ marginTop: 8 }}>
              <Knop titel="Voorziening opslaan" onPress={bewaar} bezig={opslaan} groot />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ---- Detail bestaande voorziening ---- */}
      <Modal
        visible={detailId != null}
        animationType="slide"
        transparent
        onRequestClose={() => setDetailId(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}
          onPress={() => setDetailId(null)}
        >
          <Pressable
            style={{
              backgroundColor: c.background,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingBottom: onderInset(insets) + 20,
              maxHeight: "82%",
            }}
            onPress={(e) => e.stopPropagation()}
          >
            {detailSpot && (
              <SpotDetail
                spot={detailSpot}
                token={token ?? ""}
                onSluit={() => setDetailId(null)}
                onGearchiveerd={() => {
                  setDetailId(null);
                  refetch();
                  refetchSpotnummer();
                  forceerSync();
                }}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function FotoSectie({
  titel,
  fotos,
  bezig,
  token,
  onCamera,
  onGalerij,
  onVerwijder,
}: {
  titel: string;
  fotos: string[];
  bezig: boolean;
  token: string;
  onCamera: () => void;
  onGalerij: () => void;
  onVerwijder: (index: number) => void;
}) {
  const c = useColors();
  return (
    <View style={{ gap: 10 }}>
      <SectieLabel>{titel}</SectieLabel>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={onCamera}
          disabled={bezig}
          style={{
            flex: 1,
            backgroundColor: c.secondary,
            borderRadius: c.radius,
            paddingVertical: 14,
            alignItems: "center",
            borderWidth: 1.5,
            borderColor: c.border,
          }}
        >
          <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>
            Camera
          </Text>
        </Pressable>
        <Pressable
          onPress={onGalerij}
          disabled={bezig}
          style={{
            flex: 1,
            backgroundColor: c.secondary,
            borderRadius: c.radius,
            paddingVertical: 14,
            alignItems: "center",
            borderWidth: 1.5,
            borderColor: c.border,
          }}
        >
          <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>
            Galerij
          </Text>
        </Pressable>
      </View>
      {(fotos.length > 0 || bezig) && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {fotos.map((p, i) => (
            <View key={`${p}-${i}`}>
              <Image
                source={{ uri: `https://${DOMEIN}/api/storage${p}`, headers: { Authorization: `Bearer ${token}` } }}
                style={{ width: 90, height: 90, borderRadius: 10, backgroundColor: c.muted }}
              />
              <Pressable
                onPress={() => onVerwijder(i)}
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: c.destructive,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" }}>✕</Text>
              </Pressable>
            </View>
          ))}
          {bezig && (
            <View
              style={{
                width: 90,
                height: 90,
                borderRadius: 10,
                backgroundColor: c.muted,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ActivityIndicator color={c.primary} />
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function SpotDetail({
  spot,
  token,
  onSluit,
  onGearchiveerd,
}: {
  spot: {
    id: number;
    objectnummer: string;
    type: string;
    status: string;
    classificatie: string;
    ruimte?: string | null;
    locatie_omschrijving?: string | null;
    wbdbo?: string | null;
    wrd?: string | null;
    wand_of_plafond?: string | null;
  };
  token: string;
  onSluit: () => void;
  onGearchiveerd: () => void;
}) {
  const c = useColors();
  const { data: fotos } = useListFotos(spot.id);
  const archiveer = useArchiveerVoorziening();

  function bevestigArchiveren() {
    Alert.alert(
      "Voorziening archiveren",
      `Weet je zeker dat je ${spot.objectnummer} wilt archiveren? De voorziening verdwijnt van de plattegrond.`,
      [
        { text: "Annuleren", style: "cancel" },
        {
          text: "Archiveren",
          style: "destructive",
          onPress: async () => {
            try {
              await archiveer.mutateAsync({ id: spot.id, data: { gearchiveerd: true } });
              onGearchiveerd();
            } catch {
              Alert.alert("Mislukt", "Archiveren is niet gelukt. Probeer het opnieuw.");
            }
          },
        },
      ],
    );
  }
  const ti = typeInfo(spot.type);
  const voor = (fotos ?? []).filter((f) => f.fase === "voor");
  const na = (fotos ?? []).filter((f) => f.fase === "na");

  const Rij = ({ label, waarde }: { label: string; waarde?: string | null }) =>
    waarde ? (
      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 }}>
        <Text style={{ color: c.mutedForeground, fontSize: 15, fontFamily: "Inter_400Regular" }}>{label}</Text>
        <Text style={{ color: c.foreground, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>{waarde}</Text>
      </View>
    ) : null;

  return (
    <ScrollView contentContainerStyle={{ padding: 22, gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: ti.kleur }} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.foreground, fontSize: 20, fontFamily: "Inter_700Bold" }}>
            {spot.objectnummer}
          </Text>
          <Text style={{ color: c.mutedForeground, fontSize: 14, fontFamily: "Inter_400Regular" }}>
            {ti.label}
          </Text>
        </View>
        <View style={{ backgroundColor: statusKleur(spot.status), paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
          <Text style={{ color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
            {statusLabel(spot.status)}
          </Text>
        </View>
      </View>

      <View style={{ height: 1, backgroundColor: c.border, marginVertical: 6 }} />

      <Rij label="Classificatie" waarde={spot.classificatie ? `EI ${spot.classificatie}` : null} />
      <Rij label="WBDBO" waarde={spot.wbdbo} />
      <Rij label="WRD" waarde={spot.wrd} />
      <Rij label="Wand/plafond" waarde={spot.wand_of_plafond} />
      <Rij label="Ruimte" waarde={spot.ruimte} />
      <Rij label="Locatie" waarde={spot.locatie_omschrijving} />

      {voor.length > 0 && (
        <View style={{ marginTop: 12 }}>
          <SectieLabel>Foto's vóór</SectieLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, marginTop: 8 }}>
            {voor.map((f) => (
              <Image
                key={f.id}
                source={{ uri: `https://${DOMEIN}/api/storage${f.url}`, headers: { Authorization: `Bearer ${token}` } }}
                style={{ width: 120, height: 120, borderRadius: 10, backgroundColor: c.muted }}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {na.length > 0 && (
        <View style={{ marginTop: 12 }}>
          <SectieLabel>Foto's ná</SectieLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, marginTop: 8 }}>
            {na.map((f) => (
              <Image
                key={f.id}
                source={{ uri: `https://${DOMEIN}/api/storage${f.url}`, headers: { Authorization: `Bearer ${token}` } }}
                style={{ width: 120, height: 120, borderRadius: 10, backgroundColor: c.muted }}
              />
            ))}
          </ScrollView>
        </View>
      )}

      <View style={{ marginTop: 20, gap: 10 }}>
        <Knop
          titel={archiveer.isPending ? "Bezig met archiveren..." : "Archiveren"}
          onPress={bevestigArchiveren}
          variant="gevaar"
          bezig={archiveer.isPending}
        />
        <Knop titel="Sluiten" onPress={onSluit} variant="secundair" />
      </View>
    </ScrollView>
  );
}
