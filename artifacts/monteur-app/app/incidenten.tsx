import React, { useState, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  Alert,
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetVeiligheidIncidenten,
  usePostVeiligheidIncidenten,
  usePostVeiligheidIncidentenAiVoorstel,
  useGetMijnLmraOpenstaand,
  getGetVeiligheidIncidentenQueryKey,
  type VeiligheidIncident,
  type LmraOpenstaandItem,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/auth";

const STANDAARD_MAATREGELEN = [
  "Direct gestopt met werk",
  "Werkgebied afgezet",
  "Eerste hulp verleend",
  "Leidinggevende ingelicht",
  "Incident gefotografeerd",
  "Collega's geïnformeerd",
  "Arbodienst ingelicht",
];

type StapId = "type" | "locatie" | "omschrijving" | "letsel" | "maatregelen" | "bevestigen";

type FormState = {
  type: "bijna_ongeval" | "ongeval";
  datum: string;
  tijdstip: string;
  locatieOmschrijving: string;
  opdrachtId: number | null;
  opdrachtNaam: string;
  omschrijving: string;
  oorzaak: string;
  letselBeschrijving: string;
  eersteHulpVerleend: boolean;
  eersteHulpBeschrijving: string;
  getuigen: string[];
  genoemenMaatregelen: string[];
  meldplichtig: boolean;
  aiVoorstel: boolean;
};

const nowDatum = () => new Date().toISOString().slice(0, 10);
const nowTijdstip = () => new Date().toTimeString().slice(0, 5);

const leegForm = (): FormState => ({
  type: "bijna_ongeval",
  datum: nowDatum(),
  tijdstip: nowTijdstip(),
  locatieOmschrijving: "",
  opdrachtId: null,
  opdrachtNaam: "",
  omschrijving: "",
  oorzaak: "",
  letselBeschrijving: "",
  eersteHulpVerleend: false,
  eersteHulpBeschrijving: "",
  getuigen: [],
  genoemenMaatregelen: [],
  meldplichtig: false,
  aiVoorstel: false,
});

function datumLabel(iso: string) {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function typeLabel(type: string) {
  return type === "bijna_ongeval" ? "Bijna-Ongeval" : "Ongeval";
}

function statusKleur(status: string, c: ReturnType<typeof useColors>) {
  if (status === "gesloten") return c.success;
  if (status === "in_behandeling") return c.warning;
  return c.danger;
}

function statusLabel(status: string) {
  if (status === "gesloten") return "Gesloten";
  if (status === "in_behandeling") return "In behandeling";
  return "Open";
}

export default function IncidentenScherm() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const qc = useQueryClient();

  const [formulierOpen, setFormulierOpen] = useState(false);
  const [stap, setStap] = useState<StapId>("type");
  const [form, setForm] = useState<FormState>(leegForm());
  const [nieuweGetuige, setNieuweGetuige] = useState("");
  const [aiBezig, setAiBezig] = useState(false);

  const { data: incidenten = [], isLoading, refetch } = useGetVeiligheidIncidenten({
    request: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: opdrachtOpties = [] } = useGetMijnLmraOpenstaand({
    request: { headers: { Authorization: `Bearer ${token}` } },
  });

  const aanmaken = usePostVeiligheidIncidenten({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetVeiligheidIncidentenQueryKey() });
        setFormulierOpen(false);
        setForm(leegForm());
        setStap("type");
      },
    },
    request: { headers: { Authorization: `Bearer ${token}` } },
  });

  const aiVoorstelMutatie = usePostVeiligheidIncidentenAiVoorstel({
    request: { headers: { Authorization: `Bearer ${token}` } },
  });

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const openFormulier = () => {
    setForm(leegForm());
    setStap("type");
    setFormulierOpen(true);
  };

  const haalAiVoorstel = async () => {
    if (!form.locatieOmschrijving) {
      Alert.alert("Locatie vereist", "Vul eerst de locatie in voor een AI-voorstel.");
      return;
    }
    setAiBezig(true);
    try {
      const resultaat = await aiVoorstelMutatie.mutateAsync({
        data: {
          type: form.type,
          locatie_omschrijving: form.locatieOmschrijving,
          werkzaamheden_omschrijving: form.opdrachtNaam || null,
          opdracht_naam: form.opdrachtNaam || null,
        },
      });
      setForm(f => ({
        ...f,
        omschrijving: resultaat.omschrijving || f.omschrijving,
        oorzaak: resultaat.oorzaak || f.oorzaak,
        genoemenMaatregelen: resultaat.genomen_maatregelen.length > 0
          ? resultaat.genomen_maatregelen
          : f.genoemenMaatregelen,
        meldplichtig: resultaat.meldplichtig_indicatie,
        aiVoorstel: true,
      }));
      setStap("omschrijving");
    } catch {
      Alert.alert("AI niet beschikbaar", "Vul de velden handmatig in.");
    } finally {
      setAiBezig(false);
    }
  };

  const opslaan = () => {
    if (!form.locatieOmschrijving.trim()) {
      Alert.alert("Verplicht veld", "Vul de locatie in.");
      return;
    }
    if (!form.omschrijving.trim()) {
      Alert.alert("Verplicht veld", "Vul de omschrijving in.");
      return;
    }
    aanmaken.mutate({
      data: {
        type: form.type,
        datum: form.datum || null,
        tijdstip: form.tijdstip || null,
        locatie_omschrijving: form.locatieOmschrijving,
        opdracht_id: form.opdrachtId ?? undefined,
        omschrijving: form.omschrijving,
        oorzaak: form.oorzaak || null,
        letsel_beschrijving: form.letselBeschrijving || null,
        eerste_hulp_verleend: form.eersteHulpVerleend,
        eerste_hulp_beschrijving: form.eersteHulpBeschrijving || null,
        getuigen: form.getuigen,
        genomen_maatregelen: form.genoemenMaatregelen,
        meldplichtig: form.meldplichtig,
        gemeld_bij_arbeidsinspectie: false,
        status: "open",
        foto_paden: [],
        ai_voorstel: form.aiVoorstel,
      },
    });
  };

  const wisselMaatregel = (m: string) => {
    setForm(f => ({
      ...f,
      genoemenMaatregelen: f.genoemenMaatregelen.includes(m)
        ? f.genoemenMaatregelen.filter(x => x !== m)
        : [...f.genoemenMaatregelen, m],
    }));
  };

  const stappen: StapId[] = ["type", "locatie", "omschrijving", "letsel", "maatregelen", "bevestigen"];
  const stapIndex = stappen.indexOf(stap);
  const vorigeStap = () => setStap(stappen[stapIndex - 1] ?? "type");
  const volgendeStap = () => setStap(stappen[stapIndex + 1] ?? "bevestigen");

  const renderItem = ({ item }: { item: VeiligheidIncident }) => (
    <View style={{
      backgroundColor: c.card,
      borderRadius: 10,
      padding: 14,
      marginBottom: 10,
      borderLeftWidth: 4,
      borderLeftColor: item.type === "ongeval" ? c.danger : c.warning,
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons
            name={item.type === "ongeval" ? "warning" : "alert-circle-outline"}
            size={16}
            color={item.type === "ongeval" ? c.danger : c.warning}
          />
          <Text style={{ fontWeight: "700", fontSize: 13, color: c.text }}>
            {typeLabel(item.type)}
          </Text>
          {item.meldplichtig && (
            <View style={{ backgroundColor: c.danger + "20", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
              <Text style={{ fontSize: 10, color: c.danger, fontWeight: "600" }}>NLA-meldplichtig</Text>
            </View>
          )}
        </View>
        <View style={{ backgroundColor: statusKleur(item.status, c) + "20", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
          <Text style={{ fontSize: 10, color: statusKleur(item.status, c), fontWeight: "600" }}>
            {statusLabel(item.status)}
          </Text>
        </View>
      </View>
      <Text style={{ fontSize: 13, color: c.text, marginBottom: 4 }} numberOfLines={2}>
        {item.omschrijving}
      </Text>
      <Text style={{ fontSize: 12, color: c.textMuted }}>
        {item.locatie_omschrijving}
        {item.datum ? ` — ${datumLabel(item.datum)}` : ""}
        {item.opdracht_naam ? ` | ${item.opdracht_naam}` : ""}
      </Text>
    </View>
  );

  const STAP_TITELS: Record<StapId, string> = {
    type: "Type incident",
    locatie: "Locatie en project",
    omschrijving: "Omschrijving",
    letsel: "Letsel en eerste hulp",
    maatregelen: "Genomen maatregelen",
    bevestigen: "Bevestigen",
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 }}>
        <Text style={{ fontSize: 20, fontWeight: "700", color: c.text }}>Incidenten</Text>
        <Pressable
          onPress={openFormulier}
          style={{ backgroundColor: c.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>Registreren</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator color={c.primary} style={{ marginTop: 32 }} />
      ) : incidenten.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Ionicons name="shield-checkmark-outline" size={48} color={c.textMuted} />
          <Text style={{ color: c.textMuted, fontSize: 15 }}>Nog geen incidenten geregistreerd</Text>
        </View>
      ) : (
        <FlatList
          data={incidenten}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 16 }}
        />
      )}

      <Modal visible={formulierOpen} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: c.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <Pressable onPress={vorigeStap} disabled={stapIndex === 0} style={{ width: 40, alignItems: "flex-start" }}>
              {stapIndex > 0 && <Ionicons name="chevron-back" size={22} color={c.primary} />}
            </Pressable>
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontWeight: "700", fontSize: 16, color: c.text }}>{STAP_TITELS[stap]}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{stapIndex + 1} / {stappen.length}</Text>
            </View>
            <Pressable onPress={() => setFormulierOpen(false)} style={{ width: 40, alignItems: "flex-end" }}>
              <Ionicons name="close" size={22} color={c.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>

            {stap === "type" && (
              <View style={{ gap: 12 }}>
                <Text style={{ color: c.textMuted, fontSize: 13, marginBottom: 4 }}>
                  Wat voor incident gaat het om?
                </Text>
                {(["bijna_ongeval", "ongeval"] as const).map(t => (
                  <Pressable
                    key={t}
                    onPress={() => setForm(f => ({ ...f, type: t }))}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 12,
                      padding: 16, borderRadius: 10, borderWidth: 2,
                      borderColor: form.type === t ? c.primary : c.border,
                      backgroundColor: form.type === t ? c.primary + "10" : c.card,
                    }}
                  >
                    <Ionicons
                      name={t === "bijna_ongeval" ? "alert-circle-outline" : "warning"}
                      size={26}
                      color={t === "bijna_ongeval" ? c.warning : c.danger}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "700", fontSize: 15, color: c.text }}>
                        {t === "bijna_ongeval" ? "Bijna-Ongeval" : "Ongeval"}
                      </Text>
                      <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>
                        {t === "bijna_ongeval"
                          ? "Gevaarlijke situatie waarbij niemand gewond is geraakt"
                          : "Incident waarbij letsel of schade is opgetreden"}
                      </Text>
                    </View>
                    {form.type === t && <Ionicons name="checkmark-circle" size={20} color={c.primary} />}
                  </Pressable>
                ))}

                <View style={{ gap: 10, marginTop: 8 }}>
                  <Text style={{ fontWeight: "600", color: c.text, fontSize: 13 }}>Datum en tijdstip</Text>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <TextInput
                      style={{ flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10, color: c.text, backgroundColor: c.card, fontSize: 14 }}
                      value={form.datum}
                      onChangeText={v => setForm(f => ({ ...f, datum: v }))}
                      placeholder="JJJJ-MM-DD"
                      placeholderTextColor={c.textMuted}
                    />
                    <TextInput
                      style={{ flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10, color: c.text, backgroundColor: c.card, fontSize: 14 }}
                      value={form.tijdstip}
                      onChangeText={v => setForm(f => ({ ...f, tijdstip: v }))}
                      placeholder="UU:MM"
                      placeholderTextColor={c.textMuted}
                    />
                  </View>
                </View>

                <Pressable
                  onPress={volgendeStap}
                  style={{ backgroundColor: c.primary, borderRadius: 10, padding: 14, alignItems: "center", marginTop: 8 }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Volgende</Text>
                </Pressable>
              </View>
            )}

            {stap === "locatie" && (
              <View style={{ gap: 14 }}>
                <View style={{ gap: 6 }}>
                  <Text style={{ fontWeight: "600", color: c.text, fontSize: 13 }}>Locatie / werkplek *</Text>
                  <TextInput
                    style={{ borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10, color: c.text, backgroundColor: c.card, minHeight: 60, textAlignVertical: "top" }}
                    value={form.locatieOmschrijving}
                    onChangeText={v => setForm(f => ({ ...f, locatieOmschrijving: v }))}
                    placeholder="Bijv. 3e verdieping, trappenhuis A"
                    placeholderTextColor={c.textMuted}
                    multiline
                  />
                </View>

                {opdrachtOpties.length > 0 && (
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontWeight: "600", color: c.text, fontSize: 13 }}>Opdracht / project</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <Pressable
                          onPress={() => setForm(f => ({ ...f, opdrachtId: null, opdrachtNaam: "" }))}
                          style={{
                            paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
                            borderWidth: 1.5,
                            borderColor: form.opdrachtId === null ? c.primary : c.border,
                            backgroundColor: form.opdrachtId === null ? c.primary + "10" : c.card,
                          }}
                        >
                          <Text style={{ fontSize: 12, color: form.opdrachtId === null ? c.primary : c.textMuted, fontWeight: "600" }}>
                            Geen
                          </Text>
                        </Pressable>
                        {opdrachtOpties.map((o: LmraOpenstaandItem) => (
                          <Pressable
                            key={o.opdracht_id}
                            onPress={() => setForm(f => ({ ...f, opdrachtId: o.opdracht_id, opdrachtNaam: o.opdracht_naam }))}
                            style={{
                              paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
                              borderWidth: 1.5,
                              borderColor: form.opdrachtId === o.opdracht_id ? c.primary : c.border,
                              backgroundColor: form.opdrachtId === o.opdracht_id ? c.primary + "10" : c.card,
                              maxWidth: 180,
                            }}
                          >
                            <Text style={{ fontSize: 12, color: form.opdrachtId === o.opdracht_id ? c.primary : c.text, fontWeight: "600" }} numberOfLines={1}>
                              {o.opdracht_naam}
                            </Text>
                            <Text style={{ fontSize: 10, color: c.textMuted }} numberOfLines={1}>{o.gebouw_naam}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                )}

                <Pressable
                  onPress={haalAiVoorstel}
                  disabled={aiBezig || !form.locatieOmschrijving.trim()}
                  style={{
                    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                    borderWidth: 1.5, borderColor: c.primary, borderRadius: 10, padding: 12,
                    opacity: aiBezig || !form.locatieOmschrijving.trim() ? 0.4 : 1,
                  }}
                >
                  {aiBezig
                    ? <ActivityIndicator color={c.primary} size="small" />
                    : <Ionicons name="sparkles" size={18} color={c.primary} />}
                  <Text style={{ color: c.primary, fontWeight: "700", fontSize: 14 }}>
                    {aiBezig ? "AI analyseert..." : "AI-voorstel ophalen"}
                  </Text>
                </Pressable>
                <Text style={{ fontSize: 11, color: c.textMuted, textAlign: "center" }}>
                  AI stelt een omschrijving, oorzaak en maatregelen voor. Je past alles zelf aan.
                </Text>

                <Pressable
                  onPress={volgendeStap}
                  disabled={!form.locatieOmschrijving.trim()}
                  style={{ backgroundColor: c.primary, borderRadius: 10, padding: 14, alignItems: "center", marginTop: 4, opacity: form.locatieOmschrijving.trim() ? 1 : 0.5 }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Volgende</Text>
                </Pressable>
              </View>
            )}

            {stap === "omschrijving" && (
              <View style={{ gap: 14 }}>
                {form.aiVoorstel && (
                  <View style={{ flexDirection: "row", gap: 6, alignItems: "center", padding: 8, backgroundColor: "#fef9c3", borderRadius: 8 }}>
                    <Ionicons name="sparkles" size={14} color="#ca8a04" />
                    <Text style={{ fontSize: 12, color: "#92400e", flex: 1 }}>AI-voorstel geladen. Controleer en pas aan waar nodig.</Text>
                  </View>
                )}
                <View style={{ gap: 6 }}>
                  <Text style={{ fontWeight: "600", color: c.text, fontSize: 13 }}>Wat is er gebeurd? *</Text>
                  <TextInput
                    style={{ borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10, color: c.text, backgroundColor: c.card, minHeight: 90, textAlignVertical: "top" }}
                    value={form.omschrijving}
                    onChangeText={v => setForm(f => ({ ...f, omschrijving: v }))}
                    placeholder="Beschrijf het incident zo volledig mogelijk"
                    placeholderTextColor={c.textMuted}
                    multiline
                  />
                </View>
                <View style={{ gap: 6 }}>
                  <Text style={{ fontWeight: "600", color: c.text, fontSize: 13 }}>Oorzaak</Text>
                  <TextInput
                    style={{ borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10, color: c.text, backgroundColor: c.card, minHeight: 70, textAlignVertical: "top" }}
                    value={form.oorzaak}
                    onChangeText={v => setForm(f => ({ ...f, oorzaak: v }))}
                    placeholder="Wat was de directe of achterliggende oorzaak?"
                    placeholderTextColor={c.textMuted}
                    multiline
                  />
                </View>
                <View style={{ gap: 6 }}>
                  <Text style={{ fontWeight: "600", color: c.text, fontSize: 13 }}>Getuigen</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TextInput
                      style={{ flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10, color: c.text, backgroundColor: c.card }}
                      value={nieuweGetuige}
                      onChangeText={setNieuweGetuige}
                      placeholder="Naam getuige"
                      placeholderTextColor={c.textMuted}
                    />
                    <Pressable
                      onPress={() => {
                        if (nieuweGetuige.trim()) {
                          setForm(f => ({ ...f, getuigen: [...f.getuigen, nieuweGetuige.trim()] }));
                          setNieuweGetuige("");
                        }
                      }}
                      style={{ backgroundColor: c.primary, borderRadius: 8, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" }}
                    >
                      <Ionicons name="add" size={20} color="#fff" />
                    </Pressable>
                  </View>
                  {form.getuigen.map((g, i) => (
                    <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}>
                      <Ionicons name="person-outline" size={14} color={c.textMuted} />
                      <Text style={{ flex: 1, color: c.text, fontSize: 13 }}>{g}</Text>
                      <Pressable onPress={() => setForm(f => ({ ...f, getuigen: f.getuigen.filter((_, j) => j !== i) }))}>
                        <Ionicons name="close-circle" size={18} color={c.danger} />
                      </Pressable>
                    </View>
                  ))}
                </View>

                <Pressable
                  onPress={volgendeStap}
                  disabled={!form.omschrijving.trim()}
                  style={{ backgroundColor: c.primary, borderRadius: 10, padding: 14, alignItems: "center", marginTop: 4, opacity: form.omschrijving.trim() ? 1 : 0.5 }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Volgende</Text>
                </Pressable>
              </View>
            )}

            {stap === "letsel" && (
              <View style={{ gap: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: c.card, padding: 14, borderRadius: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "600", color: c.text, fontSize: 14 }}>Letsel opgelopen?</Text>
                    <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>Lichamelijk letsel als gevolg van het incident</Text>
                  </View>
                  <Switch
                    value={form.letselBeschrijving.length > 0 || form.type === "ongeval"}
                    onValueChange={v => setForm(f => ({ ...f, letselBeschrijving: v ? f.letselBeschrijving || " " : "" }))}
                    trackColor={{ false: c.border, true: c.primary }}
                    thumbColor="#fff"
                  />
                </View>

                {(form.letselBeschrijving || form.type === "ongeval") && (
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontWeight: "600", color: c.text, fontSize: 13 }}>Beschrijving letsel</Text>
                    <TextInput
                      style={{ borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10, color: c.text, backgroundColor: c.card, minHeight: 70, textAlignVertical: "top" }}
                      value={form.letselBeschrijving.trim()}
                      onChangeText={v => setForm(f => ({ ...f, letselBeschrijving: v }))}
                      placeholder="Welk letsel? Aan welk lichaamsdeel?"
                      placeholderTextColor={c.textMuted}
                      multiline
                    />
                  </View>
                )}

                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: c.card, padding: 14, borderRadius: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "600", color: c.text, fontSize: 14 }}>Eerste hulp verleend?</Text>
                  </View>
                  <Switch
                    value={form.eersteHulpVerleend}
                    onValueChange={v => setForm(f => ({ ...f, eersteHulpVerleend: v }))}
                    trackColor={{ false: c.border, true: c.primary }}
                    thumbColor="#fff"
                  />
                </View>

                {form.eersteHulpVerleend && (
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontWeight: "600", color: c.text, fontSize: 13 }}>Eerste hulp beschrijving</Text>
                    <TextInput
                      style={{ borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10, color: c.text, backgroundColor: c.card, minHeight: 60, textAlignVertical: "top" }}
                      value={form.eersteHulpBeschrijving}
                      onChangeText={v => setForm(f => ({ ...f, eersteHulpBeschrijving: v }))}
                      placeholder="Welke eerste hulp is verleend?"
                      placeholderTextColor={c.textMuted}
                      multiline
                    />
                  </View>
                )}

                <Pressable
                  onPress={volgendeStap}
                  style={{ backgroundColor: c.primary, borderRadius: 10, padding: 14, alignItems: "center", marginTop: 4 }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Volgende</Text>
                </Pressable>
              </View>
            )}

            {stap === "maatregelen" && (
              <View style={{ gap: 12 }}>
                <Text style={{ color: c.textMuted, fontSize: 13 }}>Welke maatregelen zijn direct genomen?</Text>
                {STANDAARD_MAATREGELEN.map(m => (
                  <Pressable
                    key={m}
                    onPress={() => wisselMaatregel(m)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: c.card, borderRadius: 10, borderWidth: 1.5, borderColor: form.genoemenMaatregelen.includes(m) ? c.primary : c.border }}
                  >
                    <Ionicons name={form.genoemenMaatregelen.includes(m) ? "checkbox" : "square-outline"} size={20} color={form.genoemenMaatregelen.includes(m) ? c.primary : c.textMuted} />
                    <Text style={{ flex: 1, color: c.text, fontSize: 13 }}>{m}</Text>
                  </Pressable>
                ))}

                <View style={{ marginTop: 4, padding: 14, backgroundColor: c.card, borderRadius: 10, borderWidth: 1.5, borderColor: form.meldplichtig ? c.danger : c.border }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "700", color: form.meldplichtig ? c.danger : c.text, fontSize: 14 }}>
                        Meldplichtig bij Arbeidsinspectie
                      </Text>
                      <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 3 }}>
                        Ziekenhuisopname, blijvend letsel of dodelijk ongeluk
                      </Text>
                    </View>
                    <Switch
                      value={form.meldplichtig}
                      onValueChange={v => setForm(f => ({ ...f, meldplichtig: v }))}
                      trackColor={{ false: c.border, true: c.danger }}
                      thumbColor="#fff"
                    />
                  </View>
                  {form.meldplichtig && (
                    <View style={{ marginTop: 8, padding: 8, backgroundColor: c.danger + "10", borderRadius: 6 }}>
                      <Text style={{ fontSize: 11, color: c.danger }}>
                        Dit incident moet binnen 24 uur worden gemeld bij de Nederlandse Arbeidsinspectie.
                        De projectleider wordt direct geattendeerd.
                      </Text>
                    </View>
                  )}
                </View>

                <Pressable
                  onPress={volgendeStap}
                  style={{ backgroundColor: c.primary, borderRadius: 10, padding: 14, alignItems: "center", marginTop: 4 }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Volgende</Text>
                </Pressable>
              </View>
            )}

            {stap === "bevestigen" && (
              <View style={{ gap: 14 }}>
                <View style={{ backgroundColor: c.card, borderRadius: 10, padding: 14, gap: 10 }}>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Ionicons name={form.type === "bijna_ongeval" ? "alert-circle-outline" : "warning"} size={18} color={form.type === "bijna_ongeval" ? c.warning : c.danger} />
                    <Text style={{ fontWeight: "700", color: c.text, flex: 1 }}>{typeLabel(form.type)}</Text>
                  </View>
                  <Text style={{ color: c.textMuted, fontSize: 12 }}>{form.datum} {form.tijdstip}</Text>
                  <Text style={{ color: c.text, fontSize: 13 }}><Text style={{ fontWeight: "600" }}>Locatie: </Text>{form.locatieOmschrijving}</Text>
                  {form.opdrachtNaam ? <Text style={{ color: c.text, fontSize: 13 }}><Text style={{ fontWeight: "600" }}>Opdracht: </Text>{form.opdrachtNaam}</Text> : null}
                  <Text style={{ color: c.text, fontSize: 13 }} numberOfLines={3}><Text style={{ fontWeight: "600" }}>Omschrijving: </Text>{form.omschrijving}</Text>
                  {form.oorzaak ? <Text style={{ color: c.text, fontSize: 13 }} numberOfLines={2}><Text style={{ fontWeight: "600" }}>Oorzaak: </Text>{form.oorzaak}</Text> : null}
                  {form.meldplichtig && (
                    <View style={{ flexDirection: "row", gap: 6, alignItems: "center", padding: 6, backgroundColor: c.danger + "15", borderRadius: 6 }}>
                      <Ionicons name="warning" size={14} color={c.danger} />
                      <Text style={{ fontSize: 12, color: c.danger, fontWeight: "600" }}>Meldplichtig bij Arbeidsinspectie</Text>
                    </View>
                  )}
                  {form.genoemenMaatregelen.length > 0 && (
                    <Text style={{ color: c.textMuted, fontSize: 12 }}>{form.genoemenMaatregelen.length} maatregel(en) genomen</Text>
                  )}
                </View>

                <Text style={{ fontSize: 12, color: c.textMuted, textAlign: "center" }}>
                  Na opslaan wordt de projectleider direct geattendeerd op dit incident.
                </Text>

                <Pressable
                  onPress={opslaan}
                  disabled={aanmaken.isPending}
                  style={{ backgroundColor: c.danger, borderRadius: 10, padding: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
                >
                  {aanmaken.isPending
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Ionicons name="checkmark-circle" size={20} color="#fff" />}
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Incident registreren</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
