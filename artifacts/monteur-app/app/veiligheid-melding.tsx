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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetVeiligheidMeldingen,
  usePostVeiligheidMeldingen,
  getGetVeiligheidMeldingenQueryKey,
  type VeiligheidMelding,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

const MELDING_TYPEN = [
  { waarde: "onveilige_situatie", label: "Onveilige situatie", icoon: "warning" as const, kleur: "#f97316" },
  { waarde: "bijna_ongeval", label: "Bijna-ongeval", icoon: "alert-circle" as const, kleur: "#ef4444" },
  { waarde: "incident", label: "Incident", icoon: "medical" as const, kleur: "#dc2626" },
  { waarde: "idee", label: "Verbeteringsidee", icoon: "bulb" as const, kleur: "#3b82f6" },
];

const PRIORITEITEN = [
  { waarde: "laag", label: "Laag", kleur: "#6b7280" },
  { waarde: "middel", label: "Middel", kleur: "#f59e0b" },
  { waarde: "hoog", label: "Hoog", kleur: "#f97316" },
  { waarde: "kritiek", label: "Kritiek", kleur: "#dc2626" },
];

const STATUS_KLEUREN: Record<string, string> = {
  open: "#f59e0b",
  in_behandeling: "#3b82f6",
  afgehandeld: "#10b981",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_behandeling: "In behandeling",
  afgehandeld: "Afgehandeld",
};

type FormState = {
  type: string;
  omschrijving: string;
  locatie: string;
  projectNaam: string;
  prioriteit: string;
};

const leegForm = (): FormState => ({
  type: "onveilige_situatie",
  omschrijving: "",
  locatie: "",
  projectNaam: "",
  prioriteit: "middel",
});

function datumLabel(iso: string) {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export default function VeiligheidMeldingPagina() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [dialoogOpen, setDialoogOpen] = useState(false);
  const [formulier, setFormulier] = useState<FormState>(leegForm());
  const [isBezigOpslaan, setIsBezigOpslaan] = useState(false);

  const { data: meldingen, isLoading, refetch } = useGetVeiligheidMeldingen();

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const aanmakenMutatie = usePostVeiligheidMeldingen({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetVeiligheidMeldingenQueryKey() });
        setDialoogOpen(false);
        setFormulier(leegForm());
        setIsBezigOpslaan(false);
        Alert.alert("Gelukt", "Melding ingediend.");
      },
      onError: () => {
        setIsBezigOpslaan(false);
        Alert.alert("Fout", "Kon de melding niet opslaan.");
      },
    },
  });

  const opslaan = () => {
    if (!formulier.omschrijving.trim()) {
      Alert.alert("Verplicht", "Omschrijving is verplicht.");
      return;
    }
    setIsBezigOpslaan(true);
    aanmakenMutatie.mutate({
      data: {
        type: formulier.type,
        omschrijving: formulier.omschrijving,
        locatie: formulier.locatie || null,
        project_naam: formulier.projectNaam || null,
        prioriteit: formulier.prioriteit,
        foto_paden: [],
      },
    });
  };

  const typeInfo = (type: string) => MELDING_TYPEN.find((t) => t.waarde === type) ?? MELDING_TYPEN[0];
  const prioriteitInfo = (p: string) => PRIORITEITEN.find((x) => x.waarde === p) ?? PRIORITEITEN[1];

  const renderItem = ({ item }: { item: VeiligheidMelding }) => {
    const tp = typeInfo(item.type);
    const pr = prioriteitInfo(item.prioriteit);
    return (
      <View style={{
        backgroundColor: c.card, borderRadius: 12, padding: 14, marginBottom: 10,
        borderWidth: 1, borderColor: c.border, flexDirection: "row", gap: 10,
      }}>
        <View style={{
          width: 36, height: 36, borderRadius: 18,
          backgroundColor: tp.kleur + "20",
          alignItems: "center", justifyContent: "center",
        }}>
          <Ionicons name={tp.icoon} size={18} color={tp.kleur} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center", marginBottom: 4 }}>
            <View style={{ backgroundColor: tp.kleur + "20", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: tp.kleur, fontSize: 11, fontWeight: "600" }}>{tp.label}</Text>
            </View>
            <View style={{ backgroundColor: pr.kleur + "20", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: pr.kleur, fontSize: 11 }}>{pr.label}</Text>
            </View>
            <View style={{ backgroundColor: (STATUS_KLEUREN[item.status] ?? "#6b7280") + "20", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: STATUS_KLEUREN[item.status] ?? "#6b7280", fontSize: 11 }}>
                {STATUS_LABELS[item.status] ?? item.status}
              </Text>
            </View>
          </View>
          <Text style={{ color: c.text, fontSize: 14 }} numberOfLines={3}>{item.omschrijving}</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            {item.locatie && <Text style={{ color: c.subtekst, fontSize: 12 }}>{item.locatie}</Text>}
            <Text style={{ color: c.subtekst, fontSize: 12 }}>{datumLabel(item.aangemaakt_op)}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.dark }}>
      {/* Header */}
      <View style={{
        backgroundColor: c.dark,
        paddingTop: insets.top + 12,
        paddingHorizontal: 16,
        paddingBottom: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <View>
          <Text style={{ color: c.text, fontSize: 20, fontWeight: "700" }}>Veiligheidsmeldingen</Text>
          <Text style={{ color: c.subtekst, fontSize: 13 }}>Meld onveilige situaties en incidenten</Text>
        </View>
        <Pressable
          onPress={() => { setFormulier(leegForm()); setDialoogOpen(true); }}
          style={{
            backgroundColor: c.oranje, borderRadius: 22, width: 44, height: 44,
            alignItems: "center", justifyContent: "center",
          }}
        >
          <Ionicons name="add" size={24} color="white" />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={c.oranje} size="large" />
        </View>
      ) : (meldingen?.length ?? 0) === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          <Ionicons name="warning-outline" size={48} color={c.subtekst} style={{ marginBottom: 12, opacity: 0.5 }} />
          <Text style={{ color: c.subtekst, textAlign: "center" }}>
            Nog geen meldingen. Meld onveilige situaties, bijna-ongevallen en incidenten.
          </Text>
          <Pressable
            onPress={() => { setFormulier(leegForm()); setDialoogOpen(true); }}
            style={{ backgroundColor: c.oranje, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10, marginTop: 16 }}
          >
            <Text style={{ color: "white", fontWeight: "600" }}>Eerste melding doen</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={meldingen ?? []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          refreshing={isLoading}
          onRefresh={refetch}
        />
      )}

      {/* Formulier modal */}
      <Modal visible={dialoogOpen} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: c.dark }}>
          <View style={{
            paddingTop: insets.top + 12,
            paddingHorizontal: 16,
            paddingBottom: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottomWidth: 1,
            borderBottomColor: c.border,
          }}>
            <Text style={{ color: c.text, fontSize: 18, fontWeight: "700" }}>Nieuwe melding</Text>
            <Pressable onPress={() => setDialoogOpen(false)}>
              <Ionicons name="close" size={24} color={c.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            {/* Type */}
            <View>
              <Text style={{ color: c.subtekst, fontSize: 13, marginBottom: 8 }}>Type melding</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {MELDING_TYPEN.map((t) => (
                  <Pressable
                    key={t.waarde}
                    onPress={() => setFormulier((f) => ({ ...f, type: t.waarde }))}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 6,
                      backgroundColor: formulier.type === t.waarde ? t.kleur + "20" : c.card,
                      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
                      borderWidth: 1, borderColor: formulier.type === t.waarde ? t.kleur : c.border,
                    }}
                  >
                    <Ionicons name={t.icoon} size={16} color={formulier.type === t.waarde ? t.kleur : c.subtekst} />
                    <Text style={{
                      color: formulier.type === t.waarde ? t.kleur : c.text,
                      fontSize: 13, fontWeight: formulier.type === t.waarde ? "600" : "400",
                    }}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Omschrijving */}
            <View>
              <Text style={{ color: c.subtekst, fontSize: 13, marginBottom: 4 }}>Omschrijving *</Text>
              <TextInput
                value={formulier.omschrijving}
                onChangeText={(v) => setFormulier((f) => ({ ...f, omschrijving: v }))}
                placeholder="Beschrijf wat er is gebeurd of gesignaleerd"
                placeholderTextColor={c.subtekst}
                multiline
                numberOfLines={4}
                style={{
                  backgroundColor: c.card, color: c.text, borderRadius: 8,
                  borderWidth: 1, borderColor: c.border,
                  paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
                  minHeight: 100, textAlignVertical: "top",
                }}
              />
            </View>

            {/* Locatie */}
            <View>
              <Text style={{ color: c.subtekst, fontSize: 13, marginBottom: 4 }}>Locatie</Text>
              <TextInput
                value={formulier.locatie}
                onChangeText={(v) => setFormulier((f) => ({ ...f, locatie: v }))}
                placeholder="Waar was dit?"
                placeholderTextColor={c.subtekst}
                style={{
                  backgroundColor: c.card, color: c.text, borderRadius: 8,
                  borderWidth: 1, borderColor: c.border,
                  paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
                }}
              />
            </View>

            {/* Project */}
            <View>
              <Text style={{ color: c.subtekst, fontSize: 13, marginBottom: 4 }}>Project</Text>
              <TextInput
                value={formulier.projectNaam}
                onChangeText={(v) => setFormulier((f) => ({ ...f, projectNaam: v }))}
                placeholder="Optioneel"
                placeholderTextColor={c.subtekst}
                style={{
                  backgroundColor: c.card, color: c.text, borderRadius: 8,
                  borderWidth: 1, borderColor: c.border,
                  paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
                }}
              />
            </View>

            {/* Prioriteit */}
            <View>
              <Text style={{ color: c.subtekst, fontSize: 13, marginBottom: 8 }}>Prioriteit</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {PRIORITEITEN.map((p) => (
                  <Pressable
                    key={p.waarde}
                    onPress={() => setFormulier((f) => ({ ...f, prioriteit: p.waarde }))}
                    style={{
                      flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 8,
                      backgroundColor: formulier.prioriteit === p.waarde ? p.kleur + "20" : c.card,
                      borderWidth: 1, borderColor: formulier.prioriteit === p.waarde ? p.kleur : c.border,
                    }}
                  >
                    <Text style={{
                      color: formulier.prioriteit === p.waarde ? p.kleur : c.subtekst,
                      fontSize: 12, fontWeight: formulier.prioriteit === p.waarde ? "700" : "400",
                    }}>{p.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Pressable
              onPress={opslaan}
              disabled={isBezigOpslaan}
              style={{
                backgroundColor: isBezigOpslaan ? c.subtekst : c.oranje,
                borderRadius: 10, padding: 14, alignItems: "center", marginBottom: 16,
              }}
            >
              {isBezigOpslaan ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>Melding indienen</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
