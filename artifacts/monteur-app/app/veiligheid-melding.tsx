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
import { ruimte } from "@workspace/ontwerp";
import { useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetVeiligheidMeldingen,
  usePostVeiligheidMeldingen,
  getGetVeiligheidMeldingenQueryKey,
  type VeiligheidMelding,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import {
  Kaart,
  Ladenstaat,
  Statusmerk,
  netteWaarde,
  tekstStijl,
} from "@/components/ui";

type Soort = "neutraal" | "succes" | "waarschuwing" | "fout" | "primair";

const MELDING_TYPEN: { waarde: string; label: string; icoon: keyof typeof Ionicons.glyphMap; soort: Soort }[] = [
  { waarde: "onveilige_situatie", label: "Onveilige situatie", icoon: "warning", soort: "waarschuwing" },
  { waarde: "bijna_ongeval", label: "Bijna-ongeval", icoon: "alert-circle", soort: "fout" },
  { waarde: "incident", label: "Incident", icoon: "medical", soort: "fout" },
  { waarde: "idee", label: "Verbeteringsidee", icoon: "bulb", soort: "primair" },
];

const PRIORITEITEN: { waarde: string; label: string; soort: Soort }[] = [
  { waarde: "laag", label: "Laag", soort: "neutraal" },
  { waarde: "middel", label: "Middel", soort: "waarschuwing" },
  { waarde: "hoog", label: "Hoog", soort: "waarschuwing" },
  { waarde: "kritiek", label: "Kritiek", soort: "fout" },
];

const STATUS_SOORT: Record<string, Soort> = {
  open: "waarschuwing",
  in_behandeling: "primair",
  afgehandeld: "succes",
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

  // Soort → kleur uit het palet (voor iconen en selectie-accenten).
  const soortKleur = (soort: Soort) =>
    soort === "succes"
      ? c.success
      : soort === "waarschuwing"
        ? c.warning
        : soort === "fout"
          ? c.destructive
          : soort === "primair"
            ? c.tint
            : c.mutedForeground;

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
      <Kaart stijl={{ padding: ruimte.m + 2, marginBottom: ruimte.s + 2, flexDirection: "row", gap: ruimte.m }}>
        <View style={{
          width: ruimte.xxl + ruimte.xs, height: ruimte.xxl + ruimte.xs, borderRadius: c.radius,
          backgroundColor: c.secondary,
          alignItems: "center", justifyContent: "center",
        }}>
          <Ionicons name={tp.icoon} size={ruimte.l + 2} color={soortKleur(tp.soort)} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", gap: ruimte.xs + 2, alignItems: "center", marginBottom: ruimte.xs, flexWrap: "wrap" }}>
            <Statusmerk label={tp.label} soort={tp.soort} />
            <Statusmerk label={pr.label} soort={pr.soort} />
            <Statusmerk label={STATUS_LABELS[item.status] ?? netteWaarde(item.status)} soort={STATUS_SOORT[item.status] ?? "neutraal"} />
          </View>
          <Text style={tekstStijl("klein", c.foreground)} numberOfLines={3}>{item.omschrijving}</Text>
          <View style={{ flexDirection: "row", gap: ruimte.s, marginTop: ruimte.xs }}>
            {item.locatie && <Text style={tekstStijl("bijschrift", c.mutedForeground)}>{item.locatie}</Text>}
            <Text style={tekstStijl("bijschrift", c.mutedForeground)}>{datumLabel(item.aangemaakt_op)}</Text>
          </View>
        </View>
      </Kaart>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.dark }}>
      {/* Header */}
      <View style={{
        backgroundColor: c.dark,
        paddingTop: insets.top + ruimte.m,
        paddingHorizontal: ruimte.l,
        paddingBottom: ruimte.m,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <View>
          <Text style={tekstStijl("schermtitel", c.darkForeground)}>Veiligheidsmeldingen</Text>
          <Text style={tekstStijl("klein", c.darkMuted)}>Meld onveilige situaties en incidenten</Text>
        </View>
        <Pressable
          onPress={() => { setFormulier(leegForm()); setDialoogOpen(true); }}
          style={{
            backgroundColor: c.primary, borderRadius: c.radius + ruimte.s, width: ruimte.xxl + ruimte.m, height: ruimte.xxl + ruimte.m,
            alignItems: "center", justifyContent: "center",
          }}
        >
          <Ionicons name="add" size={ruimte.l + ruimte.s} color={c.primaryForeground} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, backgroundColor: c.background, padding: ruimte.l }}>
          <Ladenstaat regels={5} />
        </View>
      ) : (meldingen?.length ?? 0) === 0 ? (
        <View style={{ flex: 1, backgroundColor: c.background, alignItems: "center", justifyContent: "center", paddingHorizontal: ruimte.xxl }}>
          <Ionicons name="warning-outline" size={ruimte.xxl + ruimte.l} color={c.mutedForeground} style={{ marginBottom: ruimte.m, opacity: 0.5 }} />
          <Text style={[tekstStijl("standaard", c.mutedForeground), { textAlign: "center" }]}>
            Nog geen meldingen. Meld onveilige situaties, bijna-ongevallen en incidenten.
          </Text>
          <Pressable
            onPress={() => { setFormulier(leegForm()); setDialoogOpen(true); }}
            style={{ backgroundColor: c.primary, borderRadius: c.radius, paddingHorizontal: ruimte.xl, paddingVertical: ruimte.m - 2, marginTop: ruimte.l }}
          >
            <Text style={tekstStijl("nadruk", c.primaryForeground)}>Eerste melding doen</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={meldingen ?? []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          style={{ backgroundColor: c.background }}
          contentContainerStyle={{ padding: ruimte.l }}
          refreshing={isLoading}
          onRefresh={refetch}
        />
      )}

      {/* Formulier modal */}
      <Modal visible={dialoogOpen} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: c.dark }}>
          <View style={{
            paddingTop: insets.top + ruimte.m,
            paddingHorizontal: ruimte.l,
            paddingBottom: ruimte.m,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottomWidth: 1,
            borderBottomColor: c.border,
          }}>
            <Text style={tekstStijl("sectiekop", c.darkForeground)}>Nieuwe melding</Text>
            <Pressable onPress={() => setDialoogOpen(false)}>
              <Ionicons name="close" size={ruimte.l + ruimte.s} color={c.darkForeground} />
            </Pressable>
          </View>
          <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={{ padding: ruimte.l, gap: ruimte.l }}>
            {/* Type */}
            <View>
              <Text style={[tekstStijl("klein", c.mutedForeground), { marginBottom: ruimte.s }]}>Type melding</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: ruimte.s }}>
                {MELDING_TYPEN.map((t) => {
                  const actief = formulier.type === t.waarde;
                  return (
                    <Pressable
                      key={t.waarde}
                      onPress={() => setFormulier((f) => ({ ...f, type: t.waarde }))}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: ruimte.xs + 2,
                        backgroundColor: actief ? c.accent : c.card,
                        borderRadius: c.radius, paddingHorizontal: ruimte.m, paddingVertical: ruimte.s,
                        borderWidth: 1, borderColor: actief ? soortKleur(t.soort) : c.border,
                      }}
                    >
                      <Ionicons name={t.icoon} size={ruimte.l} color={actief ? soortKleur(t.soort) : c.mutedForeground} />
                      <Text style={tekstStijl(actief ? "nadruk" : "standaard", actief ? c.foreground : c.foreground)}>{t.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Omschrijving */}
            <View>
              <Text style={[tekstStijl("klein", c.mutedForeground), { marginBottom: ruimte.xs }]}>Omschrijving *</Text>
              <TextInput
                value={formulier.omschrijving}
                onChangeText={(v) => setFormulier((f) => ({ ...f, omschrijving: v }))}
                placeholder="Beschrijf wat er is gebeurd of gesignaleerd"
                placeholderTextColor={c.mutedForeground}
                multiline
                numberOfLines={4}
                style={{
                  backgroundColor: c.card, color: c.foreground, borderRadius: c.radius,
                  borderWidth: 1, borderColor: c.border,
                  paddingHorizontal: ruimte.m, paddingVertical: ruimte.s + 2, fontSize: 15,
                  fontFamily: "Inter_400Regular",
                  minHeight: ruimte.xxl * 3 + ruimte.xs, textAlignVertical: "top",
                }}
              />
            </View>

            {/* Locatie */}
            <View>
              <Text style={[tekstStijl("klein", c.mutedForeground), { marginBottom: ruimte.xs }]}>Locatie</Text>
              <TextInput
                value={formulier.locatie}
                onChangeText={(v) => setFormulier((f) => ({ ...f, locatie: v }))}
                placeholder="Waar was dit?"
                placeholderTextColor={c.mutedForeground}
                style={{
                  backgroundColor: c.card, color: c.foreground, borderRadius: c.radius,
                  borderWidth: 1, borderColor: c.border,
                  paddingHorizontal: ruimte.m, paddingVertical: ruimte.s + 2, fontSize: 15,
                  fontFamily: "Inter_400Regular",
                }}
              />
            </View>

            {/* Project */}
            <View>
              <Text style={[tekstStijl("klein", c.mutedForeground), { marginBottom: ruimte.xs }]}>Project</Text>
              <TextInput
                value={formulier.projectNaam}
                onChangeText={(v) => setFormulier((f) => ({ ...f, projectNaam: v }))}
                placeholder="Optioneel"
                placeholderTextColor={c.mutedForeground}
                style={{
                  backgroundColor: c.card, color: c.foreground, borderRadius: c.radius,
                  borderWidth: 1, borderColor: c.border,
                  paddingHorizontal: ruimte.m, paddingVertical: ruimte.s + 2, fontSize: 15,
                  fontFamily: "Inter_400Regular",
                }}
              />
            </View>

            {/* Prioriteit */}
            <View>
              <Text style={[tekstStijl("klein", c.mutedForeground), { marginBottom: ruimte.s }]}>Prioriteit</Text>
              <View style={{ flexDirection: "row", gap: ruimte.s }}>
                {PRIORITEITEN.map((p) => {
                  const actief = formulier.prioriteit === p.waarde;
                  return (
                    <Pressable
                      key={p.waarde}
                      onPress={() => setFormulier((f) => ({ ...f, prioriteit: p.waarde }))}
                      style={{
                        flex: 1, alignItems: "center", paddingVertical: ruimte.s, borderRadius: c.radius,
                        backgroundColor: actief ? c.accent : c.card,
                        borderWidth: 1, borderColor: actief ? soortKleur(p.soort) : c.border,
                      }}
                    >
                      <Text style={tekstStijl(actief ? "nadruk" : "standaard", actief ? c.foreground : c.mutedForeground)}>{p.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Pressable
              onPress={opslaan}
              disabled={isBezigOpslaan}
              style={{
                backgroundColor: isBezigOpslaan ? c.muted : c.primary,
                borderRadius: c.radius, padding: ruimte.m + 2, alignItems: "center", marginBottom: ruimte.l,
              }}
            >
              {isBezigOpslaan ? (
                <ActivityIndicator color={c.primaryForeground} />
              ) : (
                <Text style={tekstStijl("sectiekop", c.primaryForeground)}>Melding indienen</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
