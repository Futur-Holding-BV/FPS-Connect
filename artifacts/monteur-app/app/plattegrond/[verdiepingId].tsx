import { API_DOMEIN } from "@/lib/apiDomein";
import {
  useAddFoto,
  useAiSpotvoorstel,
  useBewaarSpotAiVoorstel,
  useCreateVoorziening,
  useGetVerdieping,
  useGetGebouw,
  useGetVolgendSpotnummer,
  useListFotos,
  useListScheidingen,
  useListClusters,
  useListVoorzieningenOpVerdieping,
  useArchiveerVoorziening,
  useUpdateVoorziening,
} from "@workspace/api-client-react";
import type { SpotAiVoorstelResultaat, Label } from "@workspace/api-client-react";
import { ApplicatieKiezer } from "@/components/ApplicatieKiezer";
import { ToepassingKiezer } from "@/components/ToepassingKiezer";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useRef, useState } from "react";
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
  tekstStijl,
  bovenInset,
  onderInset,
} from "@/components/ui";
import { ruimte } from "@workspace/ontwerp";
import {
  PdfPlattegrond,
  type PdfPlattegrondHandle,
  type PlattegrondSpot,
  type PlattegrondScheiding,
  type PlattegrondCluster,
} from "@/components/PdfPlattegrond";
import {
  STATUS_VOLGORDE,
  WAND_PLAFOND_OPTIES,
  statusKleur,
  statusLabel,
  typeInfo,
} from "@/constants/spots";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { useAuth } from "@/context/auth";
import { useSync } from "@/context/sync";
import { useAchievement } from "@/context/achievement";
import { FabrikantSectie } from "@/components/FabrikantSectie";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import { uploadFoto } from "@/lib/upload";

const LEEG = {
  objectnummer: "",
  type: "",
  status: "in_uitvoering",
  wand_of_plafond: "",
  ruimte: "",
  locatie_omschrijving: "",
};

const DOMEIN = API_DOMEIN;

// AI-voorstel kleurconventie (geel/amber tot bevestigd); web-equivalent amber-100/300/700.
const AMBER_BG = "#FEF3C7";
const AMBER_BORDER = "#FCD34D";
const AMBER_TEXT = "#B45309";
const AMBER_DONKER = "#7C4A03";

function AiBadge() {
  return (
    <View
      style={{
        backgroundColor: AMBER_BG,
        borderColor: AMBER_BORDER,
        borderWidth: 1,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 2,
      }}
    >
      <Text style={{ color: AMBER_TEXT, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
        AI-voorstel
      </Text>
    </View>
  );
}

export default function Plattegrond() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isTablet, formMaxBreedte } = useResponsive();
  const { gebruiker, token } = useAuth();
  const { verdiepingId, gebouwId, naam, spotId } = useLocalSearchParams<{
    verdiepingId: string;
    gebouwId: string;
    naam: string;
    spotId?: string;
  }>();

  const vId = Number(verdiepingId);
  const gId = Number(gebouwId);

  const { data: verdieping } = useGetVerdieping(vId);
  const { data: gebouwData } = useGetGebouw(gId);
  const galerijToegestaan = gebouwData?.galerij_upload_toegestaan ?? false;
  const { data: voorzieningen, refetch } = useListVoorzieningenOpVerdieping(vId);
  const { data: scheidingenData } = useListScheidingen(vId);

  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => void refetch(), 60000);
    return () => clearInterval(timer);
  }, [token, refetch]);

  const { data: clusterData } = useListClusters(gId);
  const { data: volgendSpot, refetch: refetchSpotnummer } = useGetVolgendSpotnummer(gId);
  const maakVoorziening = useCreateVoorziening();
  const voegFotoToe = useAddFoto();
  const aiSpotvoorstel = useAiSpotvoorstel();
  const bewaarAiVoorstel = useBewaarSpotAiVoorstel();

  const { syncStatus, aantalWachtend, aantalMislukt, mislukteItems, wisMislukte, forceerSync, verwijderEnkelMislukt, herprobeeerEnkel, herprobeeerAlle } = useSync();
  const { checkAchievements } = useAchievement();

  const [plaatsModus, setPlaatsModus] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [locatie, setLocatie] = useState({ x: 0, y: 0 });
  const [form, setForm] = useState({ ...LEEG });
  const [labelIds, setLabelIds] = useState<number[]>([]);
  const [voorFotos, setVoorFotos] = useState<string[]>([]);
  const [naFotos, setNaFotos] = useState<string[]>([]);
  const [fotoBezig, setFotoBezig] = useState(false);
  const [opslaan, setOpslaan] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [clusterDetailId, setClusterDetailId] = useState<number | null>(null);
  const [groepSpotIds, setGroepSpotIds] = useState<number[] | null>(null);
  const [groepCentroid, setGroepCentroid] = useState<{ x: number; y: number } | null>(null);
  const plattegrondRef = useRef<PdfPlattegrondHandle>(null);
  const [aiVoorstel, setAiVoorstel] = useState<SpotAiVoorstelResultaat | null>(null);
  const [aiBezig, setAiBezig] = useState(false);
  const [aiVelden, setAiVelden] = useState<Set<string>>(new Set());
  const [doorvoerDoorgang, setDoorvoerDoorgang] = useState(false);

  // Een veld is "AI" (amber) zolang het de AI-suggestie houdt en niet is aangeraakt.
  const isAi = (veld: string) => aiVelden.has(veld);
  const amberVak = {
    borderWidth: 1.5,
    borderColor: AMBER_BORDER,
    backgroundColor: AMBER_BG,
    borderRadius: c.radius,
    padding: ruimte.s,
  } as const;

  const spots: PlattegrondSpot[] = (voorzieningen ?? []).map((v) => ({
    id: v.id,
    objectnummer: v.objectnummer,
    type: v.type,
    status: v.status,
    wand_of_plafond: v.wand_of_plafond,
    locatie_x: v.locatie_x,
    locatie_y: v.locatie_y,
    cluster_id: (v as any).cluster_id ?? null,
  }));

  const scheidingen: PlattegrondScheiding[] = (scheidingenData ?? []).map((s) => ({
    id: s.id,
    type: s.type,
    waarde: s.waarde,
    kleur: s.kleur,
    punten: s.punten,
  }));

  const clusters: PlattegrondCluster[] = (clusterData ?? [])
    .filter((c: any) => c.verdieping_id == null || c.verdieping_id === vId)
    .map((c: any) => ({
      id: c.id,
      naam: c.naam,
      kleur: c.kleur,
      monteur_naam: c.monteur_naam ?? null,
      voorbereid_aantal: c.voorbereid_aantal ?? 0,
    }));

  const detailSpot = (voorzieningen ?? []).find((v) => v.id === detailId) ?? null;

  // Vanuit "Mijn werk" kan direct naar de afwerkflow van één spot genavigeerd worden
  // via ?spotId=. Zodra de spots geladen zijn, openen we het detail automatisch.
  useEffect(() => {
    if (!spotId) return;
    const gevraagdId = Number(spotId);
    if (!Number.isFinite(gevraagdId)) return;
    if ((voorzieningen ?? []).some((v) => v.id === gevraagdId)) {
      setDetailId(gevraagdId);
    }
  }, [spotId, voorzieningen]);

  const clusterDetail =
    (clusterData ?? []).find((cl: any) => cl.id === clusterDetailId) ?? null;
  const clusterSpots = (voorzieningen ?? []).filter(
    (v) => (v as any).cluster_id === clusterDetailId,
  );
  const groepSpots = (voorzieningen ?? []).filter((v) =>
    groepSpotIds ? groepSpotIds.includes(v.id) : false,
  );

  function opTap(x: number, y: number) {
    setLocatie({ x, y });
    setForm({ ...LEEG, objectnummer: volgendSpot?.spotnummer ?? "" });
    setLabelIds([]);
    setVoorFotos([]);
    setNaFotos([]);
    setAiVoorstel(null);
    setDoorvoerDoorgang(false);
    setAiVelden(new Set());
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
      const objectPath = await uploadFoto(res.assets[0].uri, gId, "foto");
      if (fase === "voor") setVoorFotos((a) => [...a, objectPath]);
      else setNaFotos((a) => [...a, objectPath]);
    } catch (e) {
      Alert.alert("Fout", e instanceof Error ? e.message : "Foto opslaan mislukt");
    } finally {
      setFotoBezig(false);
    }
  }

  function raakAan(veld: string) {
    setAiVelden((s) => {
      if (!s.has(veld)) return s;
      const n = new Set(s);
      n.delete(veld);
      return n;
    });
  }

  async function analyseerMetAi() {
    if (naFotos.length === 0) {
      Alert.alert("Foto ná ontbreekt", "Maak eerst een foto ná de afwerking voor de AI-analyse.");
      return;
    }
    setAiBezig(true);
    try {
      const res = await aiSpotvoorstel.mutateAsync({
        data: {
          gebouw_id: gId,
          foto_voor_url: voorFotos[0] ?? null,
          foto_na_url: naFotos[0],
        },
      });
      setAiVoorstel(res);
      // Als de AI meerdere doorvoeren detecteert, toon een keuze-dialoog vóórdat
      // de formuliervelden worden ingevuld. De monteur kiest: aparte spots aanmaken
      // (reset AI-voorstel) of toch doorgaan (spot krijgt controlevlag).
      if (res.meerdere_doorvoeren) {
        setAiBezig(false);
        const toelichting = res.meerdere_doorvoeren_toelichting
          ? `\n\n${res.meerdere_doorvoeren_toelichting}`
          : "";
        Alert.alert(
          "Meerdere doorvoeren gedetecteerd",
          `De AI heeft meerdere aparte doorvoeren gezien. Per doorvoer dient een eigen spot te worden aangemaakt, tenzij ze binnen een vlak van 50\u00d750\u00a0cm bij elkaar liggen.${toelichting}\n\nWil je toch doorgaan met \u00e9\u00e9n spot?`,
          [
            {
              text: "Aparte spots aanmaken",
              style: "cancel",
              onPress: () => {
                setAiVoorstel(null);
                setAiVelden(new Set());
                setDoorvoerDoorgang(false);
              },
            },
            {
              text: "Toch doorgaan",
              onPress: () => {
                setDoorvoerDoorgang(true);
                const nieuw2 = new Set<string>();
                setForm((f) => {
                  const next = { ...f };
                  if (res.type_code) { next.type = res.type_code; nieuw2.add("type"); }
                  if (res.wand_of_plafond) { next.wand_of_plafond = res.wand_of_plafond; nieuw2.add("wand_of_plafond"); }
                  return next;
                });
                const topS = res.toepassing_suggesties?.[0];
                if (topS && topS.score > 0) { setLabelIds([topS.label_id]); nieuw2.add("toepassing"); }
                else { setLabelIds([]); }
                setAiVelden(nieuw2);
              },
            },
          ],
        );
        return;
      }
      const nieuw = new Set<string>();
      setForm((f) => {
        const next = { ...f };
        if (res.type_code) {
          next.type = res.type_code;
          nieuw.add("type");
        }
        if (res.wand_of_plafond) {
          next.wand_of_plafond = res.wand_of_plafond;
          nieuw.add("wand_of_plafond");
        }
        return next;
      });
      // Toepassing alleen automatisch invullen bij een betrouwbare suggestie (score > 0);
      // applicatie-gekoppelde opties (score 0) tonen we alleen als hint.
      const top = res.toepassing_suggesties?.[0];
      if (top && top.score > 0) {
        setLabelIds([top.label_id]);
        nieuw.add("toepassing");
      } else {
        setLabelIds([]);
      }
      setAiVelden(nieuw);
    } catch (e) {
      Alert.alert("AI-analyse mislukt", e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      setAiBezig(false);
    }
  }

  async function bewaar() {
    setOpslaan(true);
    try {
      const aangemaakt = await maakVoorziening.mutateAsync({
        data: {
          objectnummer: form.objectnummer.trim() || undefined,
          type: form.type || "overig",
          status: form.status,
          classificatie: "60",
          gebouw_id: gId,
          verdieping_id: vId,
          locatie_x: locatie.x,
          locatie_y: locatie.y,
          ruimte: form.ruimte || undefined,
          locatie_omschrijving: form.locatie_omschrijving || undefined,
          wand_of_plafond: form.wand_of_plafond || undefined,
          installatie_datum: new Date().toISOString().slice(0, 10),
          maker_monteur_id: gebruiker?.id,
          monteur_id: gebruiker?.id,
          label_ids: labelIds.length > 0 ? labelIds : undefined,
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
        // Leerset: bewaar het AI-voorstel + de uiteindelijke keuze. De server
        // berekent de afwijking en markeert de spot eventueel voor beheerder-controle.
        if (aiVoorstel) {
          try {
            await bewaarAiVoorstel.mutateAsync({
              id: nieuwId,
              data: {
                foto_voor_url: voorFotos[0] ?? null,
                foto_na_url: naFotos[0] ?? null,
                voorstel: aiVoorstel,
                gekozen: {
                  wand_of_plafond: form.wand_of_plafond || null,
                  type_code: form.type || null,
                  label_ids: labelIds,
                },
                meerdere_doorvoeren_doorgang: doorvoerDoorgang,
              },
            });
          } catch (e) {
            // Het opslaan van de leerset is niet kritiek voor het aanmaken van de spot.
            console.warn("AI-leerset opslaan mislukt", e);
          }
        }
      }
      setFormOpen(false);
      setDoorvoerDoorgang(false);
      setPlaatsModus(false);
      await refetch();
      refetchSpotnummer();
      // Direct synchroniseren zodra verbinding beschikbaar is
      forceerSync();
      void checkAchievements();
    } catch (e) {
      Alert.alert("Opslaan mislukt", e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      setOpslaan(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.dark }}>
      <PdfPlattegrond
        ref={plattegrondRef}
        plattegrondUrl={verdieping?.plattegrond_url ?? null}
        spots={spots}
        scheidingen={scheidingen}
        clusters={clusters}
        plaatsModus={plaatsModus}
        token={token ?? ""}
        domein={DOMEIN}
        onTap={opTap}
        onSpot={(id) => setDetailId(id)}
        onCluster={(id) => setClusterDetailId(id)}
        onGroep={(ids, centroid) => {
          setGroepSpotIds(ids);
          setGroepCentroid(centroid);
        }}
      />

      {/* Kopbalk over de WebView */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          paddingTop: bovenInset(insets) + ruimte.s,
          paddingHorizontal: ruimte.l,
          paddingBottom: ruimte.m,
          backgroundColor: c.dark + "EB",
          flexDirection: "row",
          alignItems: "center",
          gap: ruimte.m,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={{ color: c.primary, fontSize: 26, fontFamily: "Inter_700Bold" }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[tekstStijl("nadruk", c.darkForeground), { fontFamily: "Inter_700Bold" }]} numberOfLines={1}>
            {naam || "Plattegrond"}
          </Text>
          <Text style={tekstStijl("klein", c.darkMuted)}>
            {spots.length} voorzieningen · knijp om te zoomen
          </Text>
        </View>
        <SyncStatusBadge
          status={syncStatus}
          aantalWachtend={aantalWachtend}
          aantalMislukt={aantalMislukt}
          mislukteItems={mislukteItems}
          onWisMislukte={wisMislukte}
          onForceerSync={forceerSync}
          onVerwijderItem={verwijderEnkelMislukt}
          onHerprobeeerItem={herprobeeerEnkel}
          onHerprobeeerAlle={herprobeeerAlle}
        />
      </View>

      {/* Instructiebalk in plaatsmodus */}
      {plaatsModus && (
        <View
          style={{
            position: "absolute",
            left: ruimte.l,
            right: ruimte.l,
            bottom: onderInset(insets) + ruimte.xxl * 3,
            backgroundColor: c.primary,
            borderRadius: c.radius,
            paddingVertical: ruimte.m + 2,
            paddingHorizontal: ruimte.l + 2,
          }}
        >
          <Text style={[tekstStijl("nadruk", c.primaryForeground), { fontFamily: "Inter_600SemiBold", textAlign: "center" }]}>
            Tik op de plattegrond om een voorziening te plaatsen
          </Text>
        </View>
      )}

      {/* Actieknop rechtsonder (één-handsbediening) */}
      <Pressable
        onPress={() => setPlaatsModus((v) => !v)}
        style={{
          position: "absolute",
          right: ruimte.l + 4,
          bottom: onderInset(insets) + ruimte.xl,
          height: ruimte.xxl * 2,
          paddingHorizontal: ruimte.xl - 2,
          borderRadius: ruimte.xxl,
          backgroundColor: plaatsModus ? c.destructive : c.primary,
          flexDirection: "row",
          alignItems: "center",
          gap: ruimte.s + 2,
          shadowColor: "#000",
          shadowOpacity: 0.3,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
      >
        <Text style={{ color: c.primaryForeground, fontSize: 24, fontFamily: "Inter_700Bold" }}>
          {plaatsModus ? "✕" : "+"}
        </Text>
        <Text style={[tekstStijl("nadruk", c.primaryForeground), { fontFamily: "Inter_600SemiBold" }]}>
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
              paddingTop: bovenInset(insets) + ruimte.s + 2,
              paddingHorizontal: ruimte.xl,
              paddingBottom: ruimte.l,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={tekstStijl("schermtitel", c.darkForeground)}>
              Nieuwe voorziening
            </Text>
            <Pressable onPress={() => setFormOpen(false)} hitSlop={10}>
              <Text style={{ color: c.darkMuted, fontSize: 22, fontFamily: "Inter_600SemiBold" }}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: ruimte.xl, gap: ruimte.l + 2, paddingBottom: ruimte.xxl + ruimte.s, width: "100%", maxWidth: formMaxBreedte, alignSelf: "center" }}
            keyboardShouldPersistTaps="handled"
          >
            <TekstVeld
              label="Spotnummer"
              value={form.objectnummer}
              editable={false}
              placeholder="Wordt automatisch toegekend"
            />

            <FotoSectie
              titel="Foto's vóór"
              fotos={voorFotos}
              bezig={fotoBezig}
              token={token ?? ""}
              galerijToegestaan={galerijToegestaan}
              onCamera={() => kiesFoto("voor", "camera")}
              onGalerij={() => kiesFoto("voor", "galerij")}
              onVerwijder={(i) => setVoorFotos((a) => a.filter((_, idx) => idx !== i))}
            />

            <FotoSectie
              titel="Foto's ná"
              fotos={naFotos}
              bezig={fotoBezig}
              token={token ?? ""}
              galerijToegestaan={galerijToegestaan}
              onCamera={() => kiesFoto("na", "camera")}
              onGalerij={() => kiesFoto("na", "galerij")}
              onVerwijder={(i) => setNaFotos((a) => a.filter((_, idx) => idx !== i))}
            />

            {/* AI-spotherkenning: vergelijkt foto ná met foto vóór en stelt voor. */}
            <View style={{ gap: 10 }}>
              <SectieLabel>AI-spotherkenning</SectieLabel>
              <Pressable
                onPress={analyseerMetAi}
                disabled={aiBezig || naFotos.length === 0}
                style={{
                  backgroundColor: naFotos.length === 0 ? c.muted : AMBER_BG,
                  borderColor: naFotos.length === 0 ? c.border : AMBER_BORDER,
                  borderWidth: 1.5,
                  borderRadius: c.radius,
                  paddingVertical: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  opacity: aiBezig ? 0.7 : 1,
                }}
              >
                {aiBezig && <ActivityIndicator color={AMBER_TEXT} />}
                <Text
                  style={{
                    color: naFotos.length === 0 ? c.mutedForeground : AMBER_TEXT,
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 15,
                  }}
                >
                  {aiBezig
                    ? "AI analyseert de foto..."
                    : aiVoorstel
                      ? "Opnieuw analyseren met AI"
                      : "Analyseer foto met AI"}
                </Text>
              </Pressable>
              {naFotos.length === 0 && (
                <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>
                  Maak eerst een foto ná de afwerking. De AI vergelijkt die met de foto vóór.
                </Text>
              )}
              {aiVoorstel && (
                <View
                  style={{
                    backgroundColor: AMBER_BG,
                    borderColor: AMBER_BORDER,
                    borderWidth: 1,
                    borderRadius: c.radius,
                    padding: 14,
                    gap: 6,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ color: AMBER_TEXT, fontFamily: "Inter_700Bold", fontSize: 14 }}>
                      AI-voorstel
                    </Text>
                    {!!aiVoorstel.betrouwbaarheid && (
                      <Text style={{ color: AMBER_TEXT, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                        Betrouwbaarheid: {aiVoorstel.betrouwbaarheid}
                      </Text>
                    )}
                  </View>
                  {!!aiVoorstel.observaties && (
                    <Text style={{ color: AMBER_DONKER, fontSize: 13, fontFamily: "Inter_400Regular" }}>
                      {aiVoorstel.observaties}
                    </Text>
                  )}
                  {!!aiVoorstel.toelichting && (
                    <Text style={{ color: AMBER_DONKER, fontSize: 13, fontFamily: "Inter_400Regular" }}>
                      {aiVoorstel.toelichting}
                    </Text>
                  )}
                  {!!aiVoorstel.document_naam && (
                    <Text style={{ color: AMBER_TEXT, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                      Gekoppeld document: {aiVoorstel.document_naam}
                    </Text>
                  )}
                  <Text style={{ color: AMBER_DONKER, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 }}>
                    Controleer en pas aan waar nodig. De AI keurt niets zelf goed.
                  </Text>
                </View>
              )}
            </View>

            <View style={{ gap: ruimte.s }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.s }}>
                <SectieLabel>Applicatie (type)</SectieLabel>
                {isAi("type") && <AiBadge />}
              </View>
              <View style={isAi("type") ? amberVak : undefined}>
                <ApplicatieKiezer
                  waarde={form.type}
                  onKies={(code) => {
                    setForm((f) => ({ ...f, type: code }));
                    setLabelIds([]);
                    raakAan("type");
                    raakAan("toepassing");
                  }}
                />
              </View>
            </View>

            {form.type !== "" && (
              <View style={{ gap: ruimte.s }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.s }}>
                  <SectieLabel>Toepassing (optioneel)</SectieLabel>
                  {isAi("toepassing") && <AiBadge />}
                </View>
                {!!aiVoorstel?.toepassing_suggesties?.length && (
                  <Text style={{ color: AMBER_TEXT, fontSize: 12, fontFamily: "Inter_400Regular" }}>
                    AI stelt voor: {aiVoorstel.toepassing_suggesties.map((s) => s.naam).join(", ")}
                  </Text>
                )}
                <View style={isAi("toepassing") ? amberVak : undefined}>
                  <ToepassingKiezer
                    typeCode={form.type}
                    geselecteerdeIds={labelIds}
                    onWijzig={(ids) => {
                      setLabelIds(ids);
                      raakAan("toepassing");
                    }}
                  />
                </View>
              </View>
            )}

            <View style={{ gap: ruimte.s }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.s }}>
                <SectieLabel>Wand of plafond</SectieLabel>
                {isAi("wand_of_plafond") && <AiBadge />}
              </View>
              <View style={isAi("wand_of_plafond") ? amberVak : undefined}>
                <ChipRij
                  opties={[
                    { waarde: "", label: "Niet opgegeven" },
                    ...WAND_PLAFOND_OPTIES.map((v) => ({ waarde: v, label: v === "wand" ? "Wand" : "Plafond" })),
                  ]}
                  geselecteerd={form.wand_of_plafond}
                  onKies={(v) => {
                    setForm((f) => ({ ...f, wand_of_plafond: v }));
                    raakAan("wand_of_plafond");
                  }}
                />
              </View>
            </View>

            <View style={{ gap: ruimte.s }}>
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

            <View style={{ gap: ruimte.s }}>
              <SectieLabel>Fabrikant- en systeeminformatie (optioneel)</SectieLabel>
              <FabrikantSectie />
            </View>

            <View style={{ marginTop: ruimte.s }}>
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
          style={{ flex: 1, backgroundColor: c.dark + "80", justifyContent: "flex-end", alignItems: isTablet ? "center" : "stretch" }}
          onPress={() => setDetailId(null)}
        >
          <Pressable
            style={{
              backgroundColor: c.background,
              borderTopLeftRadius: ruimte.xl,
              borderTopRightRadius: ruimte.xl,
              paddingBottom: onderInset(insets) + ruimte.xl - 4,
              maxHeight: "82%",
              width: "100%",
              maxWidth: isTablet ? 560 : undefined,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            {detailSpot && (
              <SpotDetail
                spot={detailSpot}
                token={token ?? ""}
                gId={gId}
                gebruikerId={gebruiker?.id}
                onSluit={() => setDetailId(null)}
                onGearchiveerd={() => {
                  setDetailId(null);
                  refetch();
                  refetchSpotnummer();
                  forceerSync();
                }}
                onAfgewerkt={() => {
                  setDetailId(null);
                  refetch();
                  forceerSync();
                }}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ---- Spots in cluster ---- */}
      <Modal
        visible={clusterDetailId != null}
        animationType="slide"
        transparent
        onRequestClose={() => setClusterDetailId(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: c.dark + "80", justifyContent: "flex-end", alignItems: isTablet ? "center" : "stretch" }}
          onPress={() => setClusterDetailId(null)}
        >
          <Pressable
            style={{
              backgroundColor: c.background,
              borderTopLeftRadius: ruimte.xl,
              borderTopRightRadius: ruimte.xl,
              paddingBottom: onderInset(insets) + ruimte.xl - 4,
              maxHeight: "82%",
              width: "100%",
              maxWidth: isTablet ? 560 : undefined,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            {clusterDetail && (
              <ClusterSpots
                cluster={clusterDetail}
                spots={clusterSpots}
                onSpot={(id) => {
                  setClusterDetailId(null);
                  setDetailId(id);
                }}
                onSluit={() => setClusterDetailId(null)}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ---- Overlappende spots (telbolletje) ---- */}
      <Modal
        visible={groepSpotIds != null}
        animationType="slide"
        transparent
        onRequestClose={() => setGroepSpotIds(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: c.dark + "80", justifyContent: "flex-end", alignItems: isTablet ? "center" : "stretch" }}
          onPress={() => setGroepSpotIds(null)}
        >
          <Pressable
            style={{
              backgroundColor: c.background,
              borderTopLeftRadius: ruimte.xl,
              borderTopRightRadius: ruimte.xl,
              paddingBottom: onderInset(insets) + ruimte.xl - 4,
              maxHeight: "82%",
              width: "100%",
              maxWidth: isTablet ? 560 : undefined,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <OverlappendeSpots
              spots={groepSpots}
              onSpot={(id) => {
                setGroepSpotIds(null);
                setDetailId(id);
              }}
              onSluit={() => setGroepSpotIds(null)}
              onZoom={
                groepCentroid
                  ? () => {
                      plattegrondRef.current?.zoomNaar(groepCentroid.x, groepCentroid.y);
                      setGroepSpotIds(null);
                    }
                  : undefined
              }
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function OverlappendeSpots({
  spots,
  onSpot,
  onSluit,
  onZoom,
}: {
  spots: { id: number; objectnummer: string; type: string; status: string }[];
  onSpot: (id: number) => void;
  onSluit: () => void;
  onZoom?: () => void;
}) {
  const c = useColors();

  return (
    <View style={{ paddingTop: ruimte.xs }}>
      <View style={{ paddingHorizontal: ruimte.xl - 2, paddingTop: ruimte.l + 2, paddingBottom: ruimte.s }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.m }}>
          <View style={{ flex: 1 }}>
            <Text style={tekstStijl("schermtitel", c.foreground)}>
              Overlappende spots
            </Text>
            <Text style={tekstStijl("standaard", c.mutedForeground)}>
              {spots.length} spots op deze plek · kies er een om te openen
            </Text>
          </View>
          <Pressable onPress={onSluit} hitSlop={10}>
            <Text style={{ color: c.mutedForeground, fontSize: 22, fontFamily: "Inter_600SemiBold" }}>✕</Text>
          </Pressable>
        </View>
        {onZoom ? (
          <Pressable
            onPress={onZoom}
            style={{
              marginTop: ruimte.m,
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: ruimte.xs + 2,
              paddingHorizontal: ruimte.m + 2,
              paddingVertical: ruimte.s + 1,
              borderRadius: ruimte.s + 2,
              backgroundColor: c.primary,
            }}
          >
            <Text style={[tekstStijl("standaard", c.primaryForeground), { fontFamily: "Inter_600SemiBold" }]}>
              Inzoomen op dit gebied
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={{ height: 1, backgroundColor: c.border }} />

      <ScrollView contentContainerStyle={{ paddingHorizontal: ruimte.xl - 2, paddingVertical: ruimte.s }}>
        {spots.length === 0 ? (
          <Text style={[tekstStijl("standaard", c.mutedForeground), { paddingVertical: ruimte.xl - 4, textAlign: "center" }]}>
            Geen spots gevonden.
          </Text>
        ) : (
          spots.map((s) => {
            const ti = typeInfo(s.type);
            const voorbereidSpot = s.status === "voorbereid";
            return (
              <Pressable
                key={s.id}
                onPress={() => onSpot(s.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: ruimte.m,
                  paddingVertical: ruimte.m,
                  borderBottomWidth: 1,
                  borderBottomColor: c.border,
                }}
              >
                <View style={{ width: ruimte.m + 2, height: ruimte.m + 2, borderRadius: (ruimte.m + 2) / 2, backgroundColor: ti.kleur }} />
                <View style={{ flex: 1 }}>
                  <Text style={[tekstStijl("standaard", c.foreground), { fontFamily: "Inter_600SemiBold" }]}>
                    {s.objectnummer}
                  </Text>
                  <Text style={tekstStijl("klein", c.mutedForeground)}>
                    {ti.label}
                  </Text>
                </View>
                <View style={{ backgroundColor: statusKleur(s.status), paddingHorizontal: ruimte.s + 2, paddingVertical: ruimte.xs + 1, borderRadius: ruimte.s }}>
                  <Text style={[tekstStijl("bijschrift", voorbereidSpot ? c.dark : c.primaryForeground), { fontFamily: "Inter_600SemiBold" }]}>
                    {statusLabel(s.status)}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function ClusterSpots({
  cluster,
  spots,
  onSpot,
  onSluit,
}: {
  cluster: any;
  spots: { id: number; objectnummer: string; type: string; status: string }[];
  onSpot: (id: number) => void;
  onSluit: () => void;
}) {
  const c = useColors();
  // Clusterkleuren zijn categorische, door de gebruiker/data bepaalde kleuren zonder
  // paletequivalent; de fallback is een vaste indigo-tint (bewust behouden).
  const kleur =
    typeof cluster.kleur === "string" && /^#[0-9a-fA-F]{3,8}$/.test(cluster.kleur)
      ? cluster.kleur
      : "#6366f1";
  const monteurNaam =
    typeof cluster.monteur_naam === "string" && cluster.monteur_naam
      ? cluster.monteur_naam
      : null;
  const voorbereid = Number(cluster.voorbereid_aantal) || 0;

  return (
    <View style={{ paddingTop: ruimte.xs }}>
      <View style={{ paddingHorizontal: ruimte.xl - 2, paddingTop: ruimte.l + 2, paddingBottom: ruimte.s }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.m }}>
          <View style={{ width: ruimte.l, height: ruimte.l, borderRadius: ruimte.s, backgroundColor: kleur }} />
          <View style={{ flex: 1 }}>
            <Text style={tekstStijl("schermtitel", c.foreground)}>
              {cluster.naam}
            </Text>
            <Text style={tekstStijl("standaard", c.mutedForeground)}>
              {monteurNaam ? monteurNaam : "Niet toegewezen"}
              {voorbereid > 0 ? ` · ${voorbereid} voorbereid` : ""}
            </Text>
          </View>
          <Pressable onPress={onSluit} hitSlop={10}>
            <Text style={{ color: c.mutedForeground, fontSize: 22, fontFamily: "Inter_600SemiBold" }}>✕</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ height: 1, backgroundColor: c.border }} />

      <ScrollView contentContainerStyle={{ paddingHorizontal: ruimte.xl - 2, paddingVertical: ruimte.s }}>
        {spots.length === 0 ? (
          <Text style={[tekstStijl("standaard", c.mutedForeground), { paddingVertical: ruimte.xl - 4, textAlign: "center" }]}>
            Geen spots in dit cluster.
          </Text>
        ) : (
          spots.map((s) => {
            const ti = typeInfo(s.type);
            const voorbereidSpot = s.status === "voorbereid";
            return (
              <Pressable
                key={s.id}
                onPress={() => onSpot(s.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: ruimte.m,
                  paddingVertical: ruimte.m,
                  borderBottomWidth: 1,
                  borderBottomColor: c.border,
                }}
              >
                <View style={{ width: ruimte.m + 2, height: ruimte.m + 2, borderRadius: (ruimte.m + 2) / 2, backgroundColor: ti.kleur }} />
                <View style={{ flex: 1 }}>
                  <Text style={[tekstStijl("standaard", c.foreground), { fontFamily: "Inter_600SemiBold" }]}>
                    {s.objectnummer}
                  </Text>
                  <Text style={tekstStijl("klein", c.mutedForeground)}>
                    {ti.label}
                  </Text>
                </View>
                <View style={{ backgroundColor: statusKleur(s.status), paddingHorizontal: ruimte.s + 2, paddingVertical: ruimte.xs + 1, borderRadius: ruimte.s }}>
                  <Text style={[tekstStijl("bijschrift", voorbereidSpot ? c.dark : c.primaryForeground), { fontFamily: "Inter_600SemiBold" }]}>
                    {statusLabel(s.status)}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function FotoSectie({
  titel,
  fotos,
  bezig,
  token,
  galerijToegestaan,
  onCamera,
  onGalerij,
  onVerwijder,
}: {
  titel: string;
  fotos: string[];
  bezig: boolean;
  token: string;
  galerijToegestaan: boolean;
  onCamera: () => void;
  onGalerij: () => void;
  onVerwijder: (index: number) => void;
}) {
  const c = useColors();
  return (
    <View style={{ gap: ruimte.s + 2 }}>
      <SectieLabel>{titel}</SectieLabel>
      <View style={{ flexDirection: "row", gap: ruimte.s + 2 }}>
        <Pressable
          onPress={onCamera}
          disabled={bezig}
          style={{
            flex: 1,
            backgroundColor: c.secondary,
            borderRadius: c.radius,
            paddingVertical: ruimte.m + 2,
            alignItems: "center",
            borderWidth: 1.5,
            borderColor: c.border,
          }}
        >
          <Text style={[tekstStijl("nadruk", c.foreground), { fontFamily: "Inter_600SemiBold" }]}>
            Camera
          </Text>
        </Pressable>
        {galerijToegestaan && (
          <Pressable
            onPress={onGalerij}
            disabled={bezig}
            style={{
              flex: 1,
              backgroundColor: c.secondary,
              borderRadius: c.radius,
              paddingVertical: ruimte.m + 2,
              alignItems: "center",
              borderWidth: 1.5,
              borderColor: c.border,
            }}
          >
            <Text style={[tekstStijl("nadruk", c.foreground), { fontFamily: "Inter_600SemiBold" }]}>
              Galerij
            </Text>
          </Pressable>
        )}
      </View>
      {(fotos.length > 0 || bezig) && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: ruimte.s + 2 }}>
          {fotos.map((p, i) => (
            <View key={`${p}-${i}`}>
              <Image
                source={{ uri: `https://${DOMEIN}/api/storage${p}`, headers: { Authorization: `Bearer ${token}` } }}
                style={{ width: ruimte.xxl * 3 - 6, height: ruimte.xxl * 3 - 6, borderRadius: ruimte.s + 2, backgroundColor: c.muted }}
              />
              <Pressable
                onPress={() => onVerwijder(i)}
                style={{
                  position: "absolute",
                  top: -ruimte.xs - 2,
                  right: -ruimte.xs - 2,
                  width: ruimte.l + ruimte.s,
                  height: ruimte.l + ruimte.s,
                  borderRadius: (ruimte.l + ruimte.s) / 2,
                  backgroundColor: c.destructive,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: c.primaryForeground, fontSize: 14, fontFamily: "Inter_700Bold" }}>✕</Text>
              </Pressable>
            </View>
          ))}
          {bezig && (
            <View
              style={{
                width: ruimte.xxl * 3 - 6,
                height: ruimte.xxl * 3 - 6,
                borderRadius: ruimte.s + 2,
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
  gId,
  gebruikerId,
  onSluit,
  onGearchiveerd,
  onAfgewerkt,
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
    labels?: Label[];
  };
  token: string;
  gId: number;
  gebruikerId?: number;
  onSluit: () => void;
  onGearchiveerd: () => void;
  onAfgewerkt: () => void;
}) {
  const c = useColors();
  const { data: fotos } = useListFotos(spot.id);
  const archiveer = useArchiveerVoorziening();
  const voegFotoToe = useAddFoto();
  const aiSpotvoorstel = useAiSpotvoorstel();
  const bewaarAiVoorstel = useBewaarSpotAiVoorstel();
  const updateVoorziening = useUpdateVoorziening();

  const isVoorbereid = spot.status === "voorbereid";
  const verwachteLabelIds = (spot.labels ?? []).map((l) => l.id);

  const [afwerken, setAfwerken] = useState(false);
  const [naFotos, setNaFotos] = useState<string[]>([]);
  const [fotoBezig, setFotoBezig] = useState(false);
  const [labelIds, setLabelIds] = useState<number[]>(verwachteLabelIds);
  const [aiVoorstel, setAiVoorstel] = useState<SpotAiVoorstelResultaat | null>(null);
  const [aiBezig, setAiBezig] = useState(false);
  const [aiLabelGevuld, setAiLabelGevuld] = useState(false);
  const [opslaan, setOpslaan] = useState(false);

  const amberVak = {
    borderWidth: 1.5,
    borderColor: AMBER_BORDER,
    backgroundColor: AMBER_BG,
    borderRadius: c.radius,
    padding: ruimte.s,
  } as const;

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

  async function kiesNaFoto(bron: "camera" | "galerij") {
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
      const objectPath = await uploadFoto(res.assets[0].uri, gId, "foto");
      setNaFotos((a) => [...a, objectPath]);
    } catch (e) {
      Alert.alert("Fout", e instanceof Error ? e.message : "Foto opslaan mislukt");
    } finally {
      setFotoBezig(false);
    }
  }

  async function analyseerMetAi() {
    if (naFotos.length === 0) {
      Alert.alert("Foto ná ontbreekt", "Maak eerst een foto ná de afwerking voor de AI-analyse.");
      return;
    }
    setAiBezig(true);
    try {
      const res = await aiSpotvoorstel.mutateAsync({
        data: {
          gebouw_id: gId,
          foto_voor_url: null,
          foto_na_url: naFotos[0],
        },
      });
      setAiVoorstel(res);
      const top = res.toepassing_suggesties?.[0];
      if (top && top.score > 0) {
        setLabelIds([top.label_id]);
        setAiLabelGevuld(true);
      }
    } catch (e) {
      Alert.alert("AI-analyse mislukt", e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      setAiBezig(false);
    }
  }

  async function lever() {
    if (naFotos.length === 0) {
      Alert.alert("Foto ná ontbreekt", "Maak eerst een foto ná de afwerking voordat je oplevert.");
      return;
    }
    setOpslaan(true);
    try {
      await updateVoorziening.mutateAsync({
        id: spot.id,
        data: {
          status: "opgeleverd",
          label_ids: labelIds,
          installatie_datum: new Date().toISOString().slice(0, 10),
          ...(gebruikerId ? { monteur_id: gebruikerId } : {}),
        },
      });
      for (const url of naFotos) {
        await voegFotoToe.mutateAsync({ id: spot.id, data: { fase: "na", url } });
      }
      if (aiVoorstel) {
        try {
          await bewaarAiVoorstel.mutateAsync({
            id: spot.id,
            data: {
              foto_voor_url: null,
              foto_na_url: naFotos[0] ?? null,
              voorstel: aiVoorstel,
              gekozen: {
                wand_of_plafond: spot.wand_of_plafond || null,
                type_code: spot.type || null,
                label_ids: labelIds,
              },
            },
          });
        } catch (e) {
          console.warn("AI-leerset opslaan mislukt", e);
        }
      }
      onAfgewerkt();
    } catch (e) {
      Alert.alert("Opslaan mislukt", e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      setOpslaan(false);
    }
  }

  const ti = typeInfo(spot.type);
  const voor = (fotos ?? []).filter((f) => f.fase === "voor");
  const na = (fotos ?? []).filter((f) => f.fase === "na");
  // Contrasttekst op de statusbadge: donker op de lichte "voorbereid"-kleur, anders licht.
  const badgeTekstKleur = isVoorbereid ? c.dark : c.primaryForeground;

  const Rij = ({ label, waarde }: { label: string; waarde?: string | null }) =>
    waarde ? (
      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: ruimte.s }}>
        <Text style={tekstStijl("standaard", c.mutedForeground)}>{label}</Text>
        <Text style={[tekstStijl("standaard", c.foreground), { fontFamily: "Inter_600SemiBold" }]}>{waarde}</Text>
      </View>
    ) : null;

  return (
    <ScrollView contentContainerStyle={{ padding: ruimte.xl - 2, gap: ruimte.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.m, marginBottom: ruimte.s }}>
        <View style={{ width: ruimte.l, height: ruimte.l, borderRadius: ruimte.s, backgroundColor: ti.kleur }} />
        <View style={{ flex: 1 }}>
          <Text style={tekstStijl("schermtitel", c.foreground)}>
            {spot.objectnummer}
          </Text>
          <Text style={tekstStijl("standaard", c.mutedForeground)}>
            {ti.label}
          </Text>
        </View>
        <View style={{ backgroundColor: statusKleur(spot.status), paddingHorizontal: ruimte.m, paddingVertical: ruimte.xs + 2, borderRadius: ruimte.s }}>
          <Text style={[tekstStijl("klein", badgeTekstKleur), { fontFamily: "Inter_600SemiBold" }]}>
            {statusLabel(spot.status)}
          </Text>
        </View>
      </View>

      <View style={{ height: 1, backgroundColor: c.border, marginVertical: ruimte.xs + 2 }} />

      <Rij label="Wand/plafond" waarde={spot.wand_of_plafond} />
      <Rij label="Ruimte" waarde={spot.ruimte} />
      <Rij label="Locatie" waarde={spot.locatie_omschrijving} />

      {(spot.labels ?? []).length > 0 && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: ruimte.s }}>
          <Text style={tekstStijl("standaard", c.mutedForeground)}>
            {isVoorbereid ? "Verwachte toepassing" : "Toepassing"}
          </Text>
          <Text style={[tekstStijl("standaard", c.foreground), { fontFamily: "Inter_600SemiBold", flex: 1, textAlign: "right" }]}>
            {(spot.labels ?? []).map((l) => l.naam).join(", ")}
          </Text>
        </View>
      )}

      {voor.length > 0 && (
        <View style={{ marginTop: ruimte.m }}>
          <SectieLabel>Foto's vóór</SectieLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: ruimte.s + 2, marginTop: ruimte.s }}>
            {voor.map((f) => (
              <Image
                key={f.id}
                source={{ uri: `https://${DOMEIN}/api/storage${f.url}`, headers: { Authorization: `Bearer ${token}` } }}
                style={{ width: ruimte.xxl * 3 + ruimte.xl, height: ruimte.xxl * 3 + ruimte.xl, borderRadius: ruimte.s + 2, backgroundColor: c.muted }}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {na.length > 0 && (
        <View style={{ marginTop: ruimte.m }}>
          <SectieLabel>Foto's ná</SectieLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: ruimte.s + 2, marginTop: ruimte.s }}>
            {na.map((f) => (
              <Image
                key={f.id}
                source={{ uri: `https://${DOMEIN}/api/storage${f.url}`, headers: { Authorization: `Bearer ${token}` } }}
                style={{ width: ruimte.xxl * 3 + ruimte.xl, height: ruimte.xxl * 3 + ruimte.xl, borderRadius: ruimte.s + 2, backgroundColor: c.muted }}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {isVoorbereid && afwerken && (
        <View style={{ marginTop: ruimte.l, gap: ruimte.m }}>
          <View style={{ height: 1, backgroundColor: c.border, marginBottom: ruimte.xs / 2 }} />
          <SectieLabel>Spot afwerken</SectieLabel>

          <View>
            <Text style={[tekstStijl("klein", c.mutedForeground), { marginBottom: ruimte.xs + 2 }]}>
              Foto ná de afwerking
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: ruimte.s + 2 }}>
              {naFotos.map((url) => (
                <Image
                  key={url}
                  source={{ uri: `https://${DOMEIN}/api/storage${url}`, headers: { Authorization: `Bearer ${token}` } }}
                  style={{ width: ruimte.xxl * 3 - 6, height: ruimte.xxl * 3 - 6, borderRadius: ruimte.s + 2, backgroundColor: c.muted }}
                />
              ))}
              {fotoBezig && (
                <View style={{ width: ruimte.xxl * 3 - 6, height: ruimte.xxl * 3 - 6, borderRadius: ruimte.s + 2, backgroundColor: c.muted, alignItems: "center", justifyContent: "center" }}>
                  <ActivityIndicator color={c.primary} />
                </View>
              )}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: ruimte.s + 2, marginTop: ruimte.s + 2 }}>
              <View style={{ flex: 1 }}>
                <Knop titel="Camera" onPress={() => kiesNaFoto("camera")} variant="secundair" />
              </View>
              <View style={{ flex: 1 }}>
                <Knop titel="Galerij" onPress={() => kiesNaFoto("galerij")} variant="secundair" />
              </View>
            </View>
          </View>

          <Knop
            titel={aiBezig ? "AI analyseert..." : "AI-analyse"}
            onPress={analyseerMetAi}
            variant="secundair"
            bezig={aiBezig}
          />

          {!!aiVoorstel?.toepassing_suggesties?.length && (
            <Text style={{ color: AMBER_DONKER, fontSize: 13, fontFamily: "Inter_400Regular" }}>
              AI stelt voor: {aiVoorstel.toepassing_suggesties.map((s) => s.naam).join(", ")}
            </Text>
          )}

          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.s, marginBottom: ruimte.xs + 2 }}>
              <SectieLabel>Toepassing bevestigen</SectieLabel>
              {aiLabelGevuld && <AiBadge />}
            </View>
            <View style={aiLabelGevuld ? amberVak : undefined}>
              <ToepassingKiezer
                typeCode={spot.type}
                geselecteerdeIds={labelIds}
                onWijzig={(ids) => {
                  setLabelIds(ids);
                  setAiLabelGevuld(false);
                }}
              />
            </View>
          </View>

          <Knop
            titel={opslaan ? "Bezig met opleveren..." : "Spot opleveren"}
            onPress={lever}
            bezig={opslaan}
            groot
          />
          <Knop titel="Annuleren" onPress={() => setAfwerken(false)} variant="secundair" />
        </View>
      )}

      {!afwerken && (
        <View style={{ marginTop: ruimte.xl - 4, gap: ruimte.s + 2 }}>
          {isVoorbereid && (
            <Knop titel="Afwerken" onPress={() => setAfwerken(true)} groot />
          )}
          <Knop
            titel={archiveer.isPending ? "Bezig met archiveren..." : "Archiveren"}
            onPress={bevestigArchiveren}
            variant="gevaar"
            bezig={archiveer.isPending}
          />
          <Knop titel="Sluiten" onPress={onSluit} variant="secundair" />
        </View>
      )}
    </ScrollView>
  );
}
