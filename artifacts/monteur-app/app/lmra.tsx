import React, { useState, useCallback, useMemo } from "react";
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
import { ruimte } from "@workspace/ontwerp";
import { useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetVeiligheidLmras,
  usePostVeiligheidLmras,
  useGetWerkdagVandaag,
  useGetMijnLmraOpenstaand,
  getGetVeiligheidLmrasQueryKey,
  type VeiligheidLmra,
  type LmraOpenstaandItem,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/auth";
import { BevoegdheidGuard } from "@/components/BevoegdheidGuard";
import {
  Kaart,
  Ladenstaat,
  Statusmerk,
  Waarschuwvlak,
  tekstStijl,
} from "@/components/ui";

const STANDAARD_RISICOS = [
  "Val van hoogte",
  "Beknelling",
  "Gevaarlijke stoffen",
  "Elektrisch gevaar",
  "Brand-/explosiegevaar",
  "Geluidsoverlast",
];

const STANDAARD_MAATREGELEN = [
  "PBM dragen",
  "Werkgebied afzetten",
  "Gereedschap keuren",
  "Communiceer met collega's",
  "EHBO aanwezig",
  "Vluchtweg vrijhouden",
];

type GebouwOptie = {
  id: number;
  naam: string;
};

type FormState = {
  gebouwId: number | null;
  gebouwNaam: string;
  locatieOmschrijving: string;
  werkzaamheden: string;
  opdrachtId: number | null;
  opdrachtNaam: string;
  risicos: string[];
  maatregelen: string[];
  veiligVoorAanvang: boolean;
  bevestigd: boolean;
};

const leegForm = (): FormState => ({
  gebouwId: null,
  gebouwNaam: "",
  locatieOmschrijving: "",
  werkzaamheden: "",
  opdrachtId: null,
  opdrachtNaam: "",
  risicos: [],
  maatregelen: [],
  veiligVoorAanvang: true,
  bevestigd: false,
});

function datumLabel(iso: string) {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function LmraPagina() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { gebruiker } = useAuth();

  const [dialoogOpen, setDialoogOpen] = useState(false);
  const [formulier, setFormulier] = useState<FormState>(leegForm());
  const [risicoInput, setRisicoInput] = useState("");
  const [maatregelInput, setMaatregelInput] = useState("");
  const [isBezigOpslaan, setIsBezigOpslaan] = useState(false);

  const { data: lmras, isLoading, refetch } = useGetVeiligheidLmras();
  const { data: werkdagData } = useGetWerkdagVandaag();
  const { data: lmraOpenstaand } = useGetMijnLmraOpenstaand();

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const gebouwenVandaag = useMemo<GebouwOptie[]>(() => {
    if (!werkdagData) return [];
    const items = Array.isArray(werkdagData) ? werkdagData : [];
    const gezien = new Set<number>();
    const opties: GebouwOptie[] = [];
    for (const item of items) {
      if (item.gebouw_id && item.gebouw_naam && !gezien.has(item.gebouw_id)) {
        gezien.add(item.gebouw_id);
        opties.push({ id: item.gebouw_id, naam: item.gebouw_naam });
      }
    }
    return opties;
  }, [werkdagData]);

  const openDialoog = () => {
    const leeg = leegForm();
    if (gebouwenVandaag.length === 1) {
      const g = gebouwenVandaag[0];
      setFormulier({
        ...leeg,
        gebouwId: g.id,
        gebouwNaam: g.naam,
        locatieOmschrijving: g.naam,
      });
    } else {
      setFormulier(leeg);
    }
    setRisicoInput("");
    setMaatregelInput("");
    setDialoogOpen(true);
  };

  const kiesGebouw = (g: GebouwOptie) => {
    setFormulier((f) => ({
      ...f,
      gebouwId: g.id,
      gebouwNaam: g.naam,
      locatieOmschrijving: f.locatieOmschrijving || g.naam,
    }));
  };

  const wisGebouw = () => {
    setFormulier((f) => ({ ...f, gebouwId: null, gebouwNaam: "" }));
  };

  const kiesOpdracht = (o: LmraOpenstaandItem) => {
    setFormulier((f) => ({
      ...f,
      opdrachtId: o.opdracht_id,
      opdrachtNaam: o.opdracht_naam,
      gebouwId: f.gebouwId ?? o.gebouw_id ?? null,
      gebouwNaam: f.gebouwNaam || o.gebouw_naam || "",
      locatieOmschrijving: f.locatieOmschrijving || o.gebouw_naam || "",
    }));
  };

  const wisOpdracht = () => {
    setFormulier((f) => ({ ...f, opdrachtId: null, opdrachtNaam: "" }));
  };

  const opdrachtOpties = useMemo<LmraOpenstaandItem[]>(() => lmraOpenstaand ?? [], [lmraOpenstaand]);

  const aanmakenMutatie = usePostVeiligheidLmras({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetVeiligheidLmrasQueryKey() });
        setDialoogOpen(false);
        setFormulier(leegForm());
        setIsBezigOpslaan(false);
        Alert.alert("Gelukt", "LMRA geregistreerd.");
      },
      onError: () => {
        setIsBezigOpslaan(false);
        Alert.alert("Fout", "Kon de LMRA niet opslaan.");
      },
    },
  });

  const voegRisicoToe = (tekst: string) => {
    const t = tekst.trim();
    if (!t || formulier.risicos.includes(t)) return;
    setFormulier((f) => ({ ...f, risicos: [...f.risicos, t] }));
    setRisicoInput("");
  };

  const voegMaatregelToe = (tekst: string) => {
    const t = tekst.trim();
    if (!t || formulier.maatregelen.includes(t)) return;
    setFormulier((f) => ({ ...f, maatregelen: [...f.maatregelen, t] }));
    setMaatregelInput("");
  };

  const opslaan = () => {
    if (!formulier.locatieOmschrijving.trim() || !formulier.werkzaamheden.trim()) {
      Alert.alert("Verplicht", "Locatie en werkzaamheden zijn verplicht.");
      return;
    }
    if (!formulier.bevestigd) {
      Alert.alert("Bevestiging vereist", "Bevestig de LMRA voor je registreert.");
      return;
    }
    setIsBezigOpslaan(true);
    aanmakenMutatie.mutate({
      data: {
        gebouw_id: formulier.gebouwId ?? undefined,
        opdracht_id: formulier.opdrachtId ?? undefined,
        locatie_omschrijving: formulier.locatieOmschrijving,
        werkzaamheden: formulier.werkzaamheden,
        project_naam: formulier.opdrachtNaam || null,
        risicos: formulier.risicos,
        maatregelen: formulier.maatregelen,
        veilig_voor_aanvang: formulier.veiligVoorAanvang,
        foto_paden: [],
        handtekening: null,
        gps_lat: null,
        gps_lng: null,
      },
    });
  };

  // Invoerveld-stijl — hergebruikt door de tekstvelden in het formulier.
  const invoerStijl = {
    backgroundColor: c.card, color: c.foreground, borderRadius: c.radius,
    borderWidth: 1, borderColor: c.border,
    paddingHorizontal: ruimte.m, paddingVertical: ruimte.s + 2, fontSize: 15,
    fontFamily: "Inter_400Regular" as const,
  };

  const renderItem = ({ item }: { item: VeiligheidLmra }) => (
    <Kaart stijl={{
      padding: ruimte.m + 2,
      marginBottom: ruimte.s + 2,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: ruimte.m,
    }}>
      <View style={{
        width: ruimte.xl + ruimte.xs, height: ruimte.xl + ruimte.xs, borderRadius: c.radius,
        backgroundColor: c.secondary,
        alignItems: "center", justifyContent: "center", marginTop: 2,
      }}>
        <Ionicons
          name={item.veilig_voor_aanvang ? "checkmark-circle" : "close-circle"}
          size={ruimte.l + 2}
          color={item.veilig_voor_aanvang ? c.success : c.destructive}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={tekstStijl("nadruk", c.foreground)}>
          {item.locatie_omschrijving}
        </Text>
        {item.gebouw_naam && (
          <View style={{ marginTop: ruimte.xs, alignSelf: "flex-start" }}>
            <Statusmerk label={item.gebouw_naam} soort="succes" />
          </View>
        )}
        <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: ruimte.xs }]} numberOfLines={2}>
          {item.werkzaamheden}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: ruimte.xs + 2, marginTop: ruimte.xs + 2, alignItems: "center" }}>
          {item.medewerker_naam && (
            <Text style={tekstStijl("bijschrift", c.mutedForeground)}>{item.medewerker_naam}</Text>
          )}
          {(item.opdracht_naam ?? item.project_naam) && (
            <Statusmerk label={(item.opdracht_naam ?? item.project_naam) as string} soort="primair" />
          )}
          <Text style={tekstStijl("bijschrift", c.mutedForeground)}>{datumLabel(item.aangemaakt_op)}</Text>
        </View>
        {(item.risicos?.length ?? 0) > 0 && (
          <Text style={[tekstStijl("bijschrift", c.mutedForeground), { marginTop: ruimte.xs }]}>
            {item.risicos!.length} risico{item.risicos!.length !== 1 ? "'s" : ""}
          </Text>
        )}
      </View>
    </Kaart>
  );

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
          <Text style={tekstStijl("schermtitel", c.darkForeground)}>LMRA</Text>
          <Text style={tekstStijl("klein", c.darkMuted)}>Laatste Minuut Risico Analyse</Text>
        </View>
        <Pressable
          onPress={openDialoog}
          style={{
            backgroundColor: c.primary,
            borderRadius: c.radius + ruimte.s, width: ruimte.xxl + ruimte.m, height: ruimte.xxl + ruimte.m,
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
      ) : (lmras?.length ?? 0) === 0 ? (
        <View style={{ flex: 1, backgroundColor: c.background, alignItems: "center", justifyContent: "center", paddingHorizontal: ruimte.xxl }}>
          <Ionicons name="clipboard-outline" size={ruimte.xxl + ruimte.l} color={c.mutedForeground} style={{ marginBottom: ruimte.m, opacity: 0.5 }} />
          <Text style={[tekstStijl("standaard", c.mutedForeground), { textAlign: "center" }]}>
            Nog geen LMRA's. Registreer de eerste voor aanvang van werkzaamheden.
          </Text>
          <Pressable
            onPress={openDialoog}
            style={{ backgroundColor: c.primary, borderRadius: c.radius, paddingHorizontal: ruimte.xl, paddingVertical: ruimte.s + 2, marginTop: ruimte.l }}
          >
            <Text style={tekstStijl("nadruk", c.primaryForeground)}>Eerste LMRA registreren</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={lmras ?? []}
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
            <Text style={tekstStijl("sectiekop", c.darkForeground)}>Nieuwe LMRA</Text>
            <Pressable onPress={() => setDialoogOpen(false)}>
              <Ionicons name="close" size={ruimte.l + ruimte.s} color={c.darkForeground} />
            </Pressable>
          </View>

          <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={{ padding: ruimte.l, gap: ruimte.l }}>

            {/* Smart gebouw koppeling */}
            {gebouwenVandaag.length > 0 && (
              <View style={{
                backgroundColor: formulier.gebouwId ? c.secondary : c.card,
                borderRadius: c.radius, padding: ruimte.m,
                borderWidth: 1,
                borderColor: formulier.gebouwId ? c.success : c.border,
              }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.xs + 2, marginBottom: ruimte.s }}>
                  <Ionicons name="business-outline" size={ruimte.m + 2} color={formulier.gebouwId ? c.success : c.mutedForeground} />
                  <Text style={tekstStijl("klein", formulier.gebouwId ? c.success : c.mutedForeground)}>
                    {formulier.gebouwId
                      ? "Gebouw automatisch gekoppeld"
                      : gebouwenVandaag.length === 1
                        ? "Vandaag ingepland bij"
                        : "Kies het gebouw van vandaag"}
                  </Text>
                </View>

                {formulier.gebouwId ? (
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={[tekstStijl("nadruk", c.foreground), { flex: 1 }]}>
                      {formulier.gebouwNaam}
                    </Text>
                    <Pressable
                      onPress={wisGebouw}
                      style={{ paddingHorizontal: ruimte.s, paddingVertical: ruimte.xs }}
                    >
                      <Text style={tekstStijl("klein", c.success)}>Wijzigen</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: ruimte.s }}>
                    {gebouwenVandaag.map((g) => (
                      <Pressable
                        key={g.id}
                        onPress={() => kiesGebouw(g)}
                        style={{
                          backgroundColor: c.card, borderRadius: c.radius, borderWidth: 1,
                          borderColor: c.border, paddingHorizontal: ruimte.m, paddingVertical: ruimte.s,
                          flexDirection: "row", alignItems: "center", gap: ruimte.xs + 2,
                        }}
                      >
                        <Ionicons name="location-outline" size={ruimte.m + 1} color={c.primary} />
                        <Text style={tekstStijl("standaard", c.foreground)}>{g.naam}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Locatie */}
            <View>
              <Text style={[tekstStijl("klein", c.mutedForeground), { marginBottom: ruimte.xs }]}>
                Locatie / werkplek *
              </Text>
              <TextInput
                value={formulier.locatieOmschrijving}
                onChangeText={(v) => setFormulier((f) => ({ ...f, locatieOmschrijving: v }))}
                placeholder="Beschrijf de locatie of het werkgebied"
                placeholderTextColor={c.mutedForeground}
                style={invoerStijl}
              />
            </View>

            {/* Werkzaamheden */}
            <View>
              <Text style={[tekstStijl("klein", c.mutedForeground), { marginBottom: ruimte.xs }]}>
                Werkzaamheden *
              </Text>
              <TextInput
                value={formulier.werkzaamheden}
                onChangeText={(v) => setFormulier((f) => ({ ...f, werkzaamheden: v }))}
                placeholder="Wat ga je doen?"
                placeholderTextColor={c.mutedForeground}
                multiline
                numberOfLines={3}
                style={[invoerStijl, { minHeight: ruimte.xxl * 2 + ruimte.l, textAlignVertical: "top" }]}
              />
            </View>

            {/* Opdracht koppeling */}
            {opdrachtOpties.length > 0 && (
              <View style={{
                backgroundColor: formulier.opdrachtId ? c.secondary : c.card,
                borderRadius: c.radius, padding: ruimte.m,
                borderWidth: 1,
                borderColor: formulier.opdrachtId ? c.tint : c.border,
              }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.xs + 2, marginBottom: ruimte.s }}>
                  <Ionicons name="briefcase-outline" size={ruimte.m + 2} color={formulier.opdrachtId ? c.tint : c.mutedForeground} />
                  <Text style={tekstStijl("klein", formulier.opdrachtId ? c.tint : c.mutedForeground)}>
                    {formulier.opdrachtId ? "Opdracht gekoppeld" : "Kies opdracht / project"}
                  </Text>
                </View>
                {formulier.opdrachtId ? (
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={[tekstStijl("nadruk", c.foreground), { flex: 1 }]}>
                      {formulier.opdrachtNaam}
                    </Text>
                    <Pressable onPress={wisOpdracht} style={{ paddingHorizontal: ruimte.s, paddingVertical: ruimte.xs }}>
                      <Text style={tekstStijl("klein", c.tint)}>Wijzigen</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={{ gap: ruimte.xs + 2 }}>
                    {opdrachtOpties.map((o) => (
                      <Pressable
                        key={o.opdracht_id}
                        onPress={() => kiesOpdracht(o)}
                        style={{
                          backgroundColor: c.card, borderRadius: c.radius, borderWidth: 1,
                          borderColor: c.border, paddingHorizontal: ruimte.m, paddingVertical: ruimte.s + 2,
                          flexDirection: "row", alignItems: "center", gap: ruimte.s,
                        }}
                      >
                        <Ionicons name="briefcase-outline" size={ruimte.m + 1} color={c.primary} />
                        <View style={{ flex: 1 }}>
                          <Text style={tekstStijl("nadruk", c.foreground)}>{o.opdracht_naam}</Text>
                          {o.gebouw_naam && (
                            <Text style={tekstStijl("bijschrift", c.mutedForeground)}>{o.gebouw_naam}</Text>
                          )}
                        </View>
                        {o.dwingend && (
                          <Statusmerk label="Vereist" soort="fout" />
                        )}
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Risico's */}
            <View>
              <Text style={[tekstStijl("klein", c.mutedForeground), { marginBottom: ruimte.s }]}>Risico's</Text>
              <View style={{ flexDirection: "row", gap: ruimte.s }}>
                <TextInput
                  value={risicoInput}
                  onChangeText={setRisicoInput}
                  placeholder="Beschrijf een risico"
                  placeholderTextColor={c.mutedForeground}
                  onSubmitEditing={() => voegRisicoToe(risicoInput)}
                  returnKeyType="done"
                  style={[invoerStijl, { flex: 1 }]}
                />
                <Pressable
                  onPress={() => voegRisicoToe(risicoInput)}
                  style={{
                    backgroundColor: c.primary, borderRadius: c.radius, width: ruimte.xxl + ruimte.m,
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Ionicons name="add" size={ruimte.l + ruimte.xs} color={c.primaryForeground} />
                </Pressable>
              </View>
              {formulier.risicos.map((r, i) => (
                <View key={i} style={{
                  flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  backgroundColor: c.card, borderRadius: c.radius, paddingHorizontal: ruimte.s + 2,
                  paddingVertical: ruimte.s, marginTop: ruimte.xs + 2,
                }}>
                  <Text style={[tekstStijl("standaard", c.foreground), { flex: 1 }]}>{r}</Text>
                  <Pressable onPress={() => setFormulier((f) => ({ ...f, risicos: f.risicos.filter((_, j) => j !== i) }))}>
                    <Ionicons name="trash-outline" size={ruimte.l} color={c.mutedForeground} />
                  </Pressable>
                </View>
              ))}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: ruimte.xs + 2, marginTop: ruimte.s }}>
                {STANDAARD_RISICOS.filter((s) => !formulier.risicos.includes(s)).slice(0, 4).map((s) => (
                  <Pressable key={s} onPress={() => voegRisicoToe(s)} style={{
                    backgroundColor: c.card, borderRadius: c.radius, paddingHorizontal: ruimte.s + 2,
                    paddingVertical: ruimte.xs + 1, borderWidth: 1, borderColor: c.border,
                  }}>
                    <Text style={tekstStijl("bijschrift", c.mutedForeground)}>+ {s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Maatregelen */}
            <View>
              <Text style={[tekstStijl("klein", c.mutedForeground), { marginBottom: ruimte.s }]}>Beheersmaatregelen</Text>
              <View style={{ flexDirection: "row", gap: ruimte.s }}>
                <TextInput
                  value={maatregelInput}
                  onChangeText={setMaatregelInput}
                  placeholder="Voeg een maatregel toe"
                  placeholderTextColor={c.mutedForeground}
                  onSubmitEditing={() => voegMaatregelToe(maatregelInput)}
                  returnKeyType="done"
                  style={[invoerStijl, { flex: 1 }]}
                />
                <Pressable
                  onPress={() => voegMaatregelToe(maatregelInput)}
                  style={{
                    backgroundColor: c.primary, borderRadius: c.radius, width: ruimte.xxl + ruimte.m,
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Ionicons name="add" size={ruimte.l + ruimte.xs} color={c.primaryForeground} />
                </Pressable>
              </View>
              {formulier.maatregelen.map((m, i) => (
                <View key={i} style={{
                  flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  backgroundColor: c.card, borderRadius: c.radius, paddingHorizontal: ruimte.s + 2,
                  paddingVertical: ruimte.s, marginTop: ruimte.xs + 2,
                }}>
                  <Text style={[tekstStijl("standaard", c.foreground), { flex: 1 }]}>{m}</Text>
                  <Pressable onPress={() => setFormulier((f) => ({ ...f, maatregelen: f.maatregelen.filter((_, j) => j !== i) }))}>
                    <Ionicons name="trash-outline" size={ruimte.l} color={c.mutedForeground} />
                  </Pressable>
                </View>
              ))}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: ruimte.xs + 2, marginTop: ruimte.s }}>
                {STANDAARD_MAATREGELEN.filter((s) => !formulier.maatregelen.includes(s)).slice(0, 4).map((s) => (
                  <Pressable key={s} onPress={() => voegMaatregelToe(s)} style={{
                    backgroundColor: c.card, borderRadius: c.radius, paddingHorizontal: ruimte.s + 2,
                    paddingVertical: ruimte.xs + 1, borderWidth: 1, borderColor: c.border,
                  }}>
                    <Text style={tekstStijl("bijschrift", c.mutedForeground)}>+ {s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Veilig voor aanvang */}
            <View style={{
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              backgroundColor: c.card, borderRadius: c.radius, padding: ruimte.m + 2,
              borderWidth: 1, borderColor: c.border,
            }}>
              <View style={{ flex: 1 }}>
                <Text style={tekstStijl("nadruk", c.foreground)}>Veilig om te beginnen?</Text>
                <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 2 }]}>
                  Zijn alle risico's beheersbaar?
                </Text>
              </View>
              <Switch
                value={formulier.veiligVoorAanvang}
                onValueChange={(v) => setFormulier((f) => ({ ...f, veiligVoorAanvang: v }))}
                trackColor={{ true: c.primary, false: c.mutedForeground }}
                thumbColor={c.card}
              />
            </View>

            {!formulier.veiligVoorAanvang && (
              <Waarschuwvlak
                soort="fout"
                tekst="Werkzaamheden mogen niet starten. Raadpleeg de leidinggevende."
              />
            )}

            {/* Bevestiging */}
            <Pressable
              onPress={() => setFormulier((f) => ({ ...f, bevestigd: !f.bevestigd }))}
              style={{
                flexDirection: "row", gap: ruimte.s + 2, alignItems: "flex-start",
                backgroundColor: c.card, borderRadius: c.radius, padding: ruimte.m + 2,
                borderWidth: 1, borderColor: formulier.bevestigd ? c.primary : c.border,
              }}
            >
              <View style={{
                width: ruimte.l + ruimte.xs + 2, height: ruimte.l + ruimte.xs + 2, borderRadius: c.radius / 2, borderWidth: 2,
                borderColor: formulier.bevestigd ? c.primary : c.mutedForeground,
                backgroundColor: formulier.bevestigd ? c.primary : "transparent",
                alignItems: "center", justifyContent: "center",
                marginTop: 1,
              }}>
                {formulier.bevestigd && <Ionicons name="checkmark" size={ruimte.m + 2} color={c.primaryForeground} />}
              </View>
              <Text style={[tekstStijl("klein", c.foreground), { flex: 1, lineHeight: 18 }]}>
                Ik bevestig dat ik de werkplek heb gecontroleerd, de risico's heb
                beoordeeld en de beheersmaatregelen heb doorgevoerd of gecommuniceerd.
              </Text>
            </Pressable>

            <Pressable
              onPress={opslaan}
              disabled={isBezigOpslaan}
              style={{
                backgroundColor: isBezigOpslaan ? c.mutedForeground : c.primary,
                borderRadius: c.radius, padding: ruimte.m + 2,
                alignItems: "center", marginBottom: ruimte.l,
              }}
            >
              {isBezigOpslaan ? (
                <ActivityIndicator color={c.primaryForeground} />
              ) : (
                <Text style={tekstStijl("sectiekop", c.primaryForeground)}>LMRA registreren</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// APP_01 §3.3 — schermbescherming: nette weigering zonder bevoegdheid
// (backendroute eist toolbox niveau 1; gemeten, zie docs/metingen).
export default function LmraPaginaBeveiligd() {
  return (
    <BevoegdheidGuard vereiste={{ module: "toolbox", niveau: 1 }}>
      <LmraPagina />
    </BevoegdheidGuard>
  );
}
