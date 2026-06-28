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
import { useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetVeiligheidLmras,
  usePostVeiligheidLmras,
  useGetWerkdagVandaag,
  getGetVeiligheidLmrasQueryKey,
  type VeiligheidLmra,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/auth";

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
  projectNaam: string;
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
  projectNaam: "",
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

export default function LmraPagina() {
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
        locatie_omschrijving: formulier.locatieOmschrijving,
        werkzaamheden: formulier.werkzaamheden,
        project_naam: formulier.projectNaam || null,
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

  const renderItem = ({ item }: { item: VeiligheidLmra }) => (
    <View style={{
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: c.border,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    }}>
      <View style={{
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: item.veilig_voor_aanvang ? "#d1fae5" : "#fee2e2",
        alignItems: "center", justifyContent: "center", marginTop: 2,
      }}>
        <Ionicons
          name={item.veilig_voor_aanvang ? "checkmark-circle" : "close-circle"}
          size={18}
          color={item.veilig_voor_aanvang ? "#059669" : "#dc2626"}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.foreground, fontWeight: "600", fontSize: 15 }}>
          {item.locatie_omschrijving}
        </Text>
        {item.gebouw_naam && (
          <View style={{
            flexDirection: "row", alignItems: "center", gap: 4,
            backgroundColor: "#f0fdf4", borderRadius: 6,
            paddingHorizontal: 7, paddingVertical: 3, marginTop: 4,
            alignSelf: "flex-start",
          }}>
            <Ionicons name="business-outline" size={11} color="#059669" />
            <Text style={{ color: "#059669", fontSize: 11, fontWeight: "500" }}>
              {item.gebouw_naam}
            </Text>
          </View>
        )}
        <Text style={{ color: c.mutedForeground, fontSize: 13, marginTop: 4 }} numberOfLines={2}>
          {item.werkzaamheden}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6, alignItems: "center" }}>
          {item.medewerker_naam && (
            <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{item.medewerker_naam}</Text>
          )}
          {item.project_naam && (
            <View style={{ backgroundColor: c.muted, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: c.mutedForeground, fontSize: 11 }}>{item.project_naam}</Text>
            </View>
          )}
          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{datumLabel(item.aangemaakt_op)}</Text>
        </View>
        {(item.risicos?.length ?? 0) > 0 && (
          <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 4 }}>
            {item.risicos!.length} risico{item.risicos!.length !== 1 ? "'s" : ""}
          </Text>
        )}
      </View>
    </View>
  );

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
          <Text style={{ color: c.foreground, fontSize: 20, fontWeight: "700" }}>LMRA</Text>
          <Text style={{ color: c.mutedForeground, fontSize: 13 }}>Laatste Minuut Risico Analyse</Text>
        </View>
        <Pressable
          onPress={openDialoog}
          style={{
            backgroundColor: c.primary,
            borderRadius: 22, width: 44, height: 44,
            alignItems: "center", justifyContent: "center",
          }}
        >
          <Ionicons name="add" size={24} color="white" />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={c.primary} size="large" />
        </View>
      ) : (lmras?.length ?? 0) === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          <Ionicons name="clipboard-outline" size={48} color={c.mutedForeground} style={{ marginBottom: 12, opacity: 0.5 }} />
          <Text style={{ color: c.mutedForeground, textAlign: "center" }}>
            Nog geen LMRA's. Registreer de eerste voor aanvang van werkzaamheden.
          </Text>
          <Pressable
            onPress={openDialoog}
            style={{ backgroundColor: c.primary, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10, marginTop: 16 }}
          >
            <Text style={{ color: "white", fontWeight: "600" }}>Eerste LMRA registreren</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={lmras ?? []}
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
            <Text style={{ color: c.foreground, fontSize: 18, fontWeight: "700" }}>Nieuwe LMRA</Text>
            <Pressable onPress={() => setDialoogOpen(false)}>
              <Ionicons name="close" size={24} color={c.foreground} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>

            {/* Smart gebouw koppeling */}
            {gebouwenVandaag.length > 0 && (
              <View style={{
                backgroundColor: formulier.gebouwId ? "#f0fdf4" : c.card,
                borderRadius: 12, padding: 12,
                borderWidth: 1,
                borderColor: formulier.gebouwId ? "#86efac" : c.border,
              }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <Ionicons name="business-outline" size={14} color={formulier.gebouwId ? "#059669" : c.mutedForeground} />
                  <Text style={{ color: formulier.gebouwId ? "#059669" : c.mutedForeground, fontSize: 13, fontWeight: "500" }}>
                    {formulier.gebouwId
                      ? "Gebouw automatisch gekoppeld"
                      : gebouwenVandaag.length === 1
                        ? "Vandaag ingepland bij"
                        : "Kies het gebouw van vandaag"}
                  </Text>
                </View>

                {formulier.gebouwId ? (
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ color: "#166534", fontWeight: "600", fontSize: 15, flex: 1 }}>
                      {formulier.gebouwNaam}
                    </Text>
                    <Pressable
                      onPress={wisGebouw}
                      style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                    >
                      <Text style={{ color: "#059669", fontSize: 13 }}>Wijzigen</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {gebouwenVandaag.map((g) => (
                      <Pressable
                        key={g.id}
                        onPress={() => kiesGebouw(g)}
                        style={{
                          backgroundColor: c.dark, borderRadius: 8, borderWidth: 1,
                          borderColor: c.border, paddingHorizontal: 12, paddingVertical: 8,
                          flexDirection: "row", alignItems: "center", gap: 6,
                        }}
                      >
                        <Ionicons name="location-outline" size={13} color={c.primary} />
                        <Text style={{ color: c.foreground, fontSize: 14 }}>{g.naam}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Locatie */}
            <View>
              <Text style={{ color: c.mutedForeground, fontSize: 13, marginBottom: 4 }}>
                Locatie / werkplek *
              </Text>
              <TextInput
                value={formulier.locatieOmschrijving}
                onChangeText={(v) => setFormulier((f) => ({ ...f, locatieOmschrijving: v }))}
                placeholder="Beschrijf de locatie of het werkgebied"
                placeholderTextColor={c.mutedForeground}
                style={{
                  backgroundColor: c.card, color: c.foreground, borderRadius: 8,
                  borderWidth: 1, borderColor: c.border,
                  paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
                }}
              />
            </View>

            {/* Werkzaamheden */}
            <View>
              <Text style={{ color: c.mutedForeground, fontSize: 13, marginBottom: 4 }}>
                Werkzaamheden *
              </Text>
              <TextInput
                value={formulier.werkzaamheden}
                onChangeText={(v) => setFormulier((f) => ({ ...f, werkzaamheden: v }))}
                placeholder="Wat ga je doen?"
                placeholderTextColor={c.mutedForeground}
                multiline
                numberOfLines={3}
                style={{
                  backgroundColor: c.card, color: c.foreground, borderRadius: 8,
                  borderWidth: 1, borderColor: c.border,
                  paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
                  minHeight: 80, textAlignVertical: "top",
                }}
              />
            </View>

            {/* Project */}
            <View>
              <Text style={{ color: c.mutedForeground, fontSize: 13, marginBottom: 4 }}>Project (optioneel)</Text>
              <TextInput
                value={formulier.projectNaam}
                onChangeText={(v) => setFormulier((f) => ({ ...f, projectNaam: v }))}
                placeholder="Projectnaam of -nummer"
                placeholderTextColor={c.mutedForeground}
                style={{
                  backgroundColor: c.card, color: c.foreground, borderRadius: 8,
                  borderWidth: 1, borderColor: c.border,
                  paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
                }}
              />
            </View>

            {/* Risico's */}
            <View>
              <Text style={{ color: c.mutedForeground, fontSize: 13, marginBottom: 8 }}>Risico's</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  value={risicoInput}
                  onChangeText={setRisicoInput}
                  placeholder="Beschrijf een risico"
                  placeholderTextColor={c.mutedForeground}
                  onSubmitEditing={() => voegRisicoToe(risicoInput)}
                  returnKeyType="done"
                  style={{
                    flex: 1, backgroundColor: c.card, color: c.foreground, borderRadius: 8,
                    borderWidth: 1, borderColor: c.border,
                    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
                  }}
                />
                <Pressable
                  onPress={() => voegRisicoToe(risicoInput)}
                  style={{
                    backgroundColor: c.primary, borderRadius: 8, width: 44,
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Ionicons name="add" size={20} color="white" />
                </Pressable>
              </View>
              {formulier.risicos.map((r, i) => (
                <View key={i} style={{
                  flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  backgroundColor: c.card, borderRadius: 8, paddingHorizontal: 10,
                  paddingVertical: 8, marginTop: 6,
                }}>
                  <Text style={{ color: c.foreground, fontSize: 14, flex: 1 }}>{r}</Text>
                  <Pressable onPress={() => setFormulier((f) => ({ ...f, risicos: f.risicos.filter((_, j) => j !== i) }))}>
                    <Ionicons name="trash-outline" size={16} color={c.mutedForeground} />
                  </Pressable>
                </View>
              ))}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {STANDAARD_RISICOS.filter((s) => !formulier.risicos.includes(s)).slice(0, 4).map((s) => (
                  <Pressable key={s} onPress={() => voegRisicoToe(s)} style={{
                    backgroundColor: c.card, borderRadius: 16, paddingHorizontal: 10,
                    paddingVertical: 5, borderWidth: 1, borderColor: c.border,
                  }}>
                    <Text style={{ color: c.mutedForeground, fontSize: 12 }}>+ {s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Maatregelen */}
            <View>
              <Text style={{ color: c.mutedForeground, fontSize: 13, marginBottom: 8 }}>Beheersmaatregelen</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  value={maatregelInput}
                  onChangeText={setMaatregelInput}
                  placeholder="Voeg een maatregel toe"
                  placeholderTextColor={c.mutedForeground}
                  onSubmitEditing={() => voegMaatregelToe(maatregelInput)}
                  returnKeyType="done"
                  style={{
                    flex: 1, backgroundColor: c.card, color: c.foreground, borderRadius: 8,
                    borderWidth: 1, borderColor: c.border,
                    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
                  }}
                />
                <Pressable
                  onPress={() => voegMaatregelToe(maatregelInput)}
                  style={{
                    backgroundColor: c.primary, borderRadius: 8, width: 44,
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Ionicons name="add" size={20} color="white" />
                </Pressable>
              </View>
              {formulier.maatregelen.map((m, i) => (
                <View key={i} style={{
                  flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  backgroundColor: c.card, borderRadius: 8, paddingHorizontal: 10,
                  paddingVertical: 8, marginTop: 6,
                }}>
                  <Text style={{ color: c.foreground, fontSize: 14, flex: 1 }}>{m}</Text>
                  <Pressable onPress={() => setFormulier((f) => ({ ...f, maatregelen: f.maatregelen.filter((_, j) => j !== i) }))}>
                    <Ionicons name="trash-outline" size={16} color={c.mutedForeground} />
                  </Pressable>
                </View>
              ))}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {STANDAARD_MAATREGELEN.filter((s) => !formulier.maatregelen.includes(s)).slice(0, 4).map((s) => (
                  <Pressable key={s} onPress={() => voegMaatregelToe(s)} style={{
                    backgroundColor: c.card, borderRadius: 16, paddingHorizontal: 10,
                    paddingVertical: 5, borderWidth: 1, borderColor: c.border,
                  }}>
                    <Text style={{ color: c.mutedForeground, fontSize: 12 }}>+ {s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Veilig voor aanvang */}
            <View style={{
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              backgroundColor: c.card, borderRadius: 12, padding: 14,
              borderWidth: 1, borderColor: c.border,
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.foreground, fontWeight: "600" }}>Veilig om te beginnen?</Text>
                <Text style={{ color: c.mutedForeground, fontSize: 13, marginTop: 2 }}>
                  Zijn alle risico's beheersbaar?
                </Text>
              </View>
              <Switch
                value={formulier.veiligVoorAanvang}
                onValueChange={(v) => setFormulier((f) => ({ ...f, veiligVoorAanvang: v }))}
                trackColor={{ true: "#f97316", false: "#6b7280" }}
                thumbColor="white"
              />
            </View>

            {!formulier.veiligVoorAanvang && (
              <View style={{
                backgroundColor: "#fee2e2", borderRadius: 10, padding: 12,
                flexDirection: "row", gap: 8, alignItems: "flex-start",
              }}>
                <Ionicons name="close-circle" size={18} color="#dc2626" style={{ marginTop: 1 }} />
                <Text style={{ color: "#dc2626", fontSize: 13, flex: 1 }}>
                  Werkzaamheden mogen niet starten. Raadpleeg de leidinggevende.
                </Text>
              </View>
            )}

            {/* Bevestiging */}
            <Pressable
              onPress={() => setFormulier((f) => ({ ...f, bevestigd: !f.bevestigd }))}
              style={{
                flexDirection: "row", gap: 10, alignItems: "flex-start",
                backgroundColor: c.card, borderRadius: 12, padding: 14,
                borderWidth: 1, borderColor: formulier.bevestigd ? c.primary : c.border,
              }}
            >
              <View style={{
                width: 22, height: 22, borderRadius: 6, borderWidth: 2,
                borderColor: formulier.bevestigd ? c.primary : c.mutedForeground,
                backgroundColor: formulier.bevestigd ? c.primary : "transparent",
                alignItems: "center", justifyContent: "center",
                marginTop: 1,
              }}>
                {formulier.bevestigd && <Ionicons name="checkmark" size={14} color="white" />}
              </View>
              <Text style={{ color: c.foreground, fontSize: 13, flex: 1, lineHeight: 18 }}>
                Ik bevestig dat ik de werkplek heb gecontroleerd, de risico's heb
                beoordeeld en de beheersmaatregelen heb doorgevoerd of gecommuniceerd.
              </Text>
            </Pressable>

            <Pressable
              onPress={opslaan}
              disabled={isBezigOpslaan}
              style={{
                backgroundColor: isBezigOpslaan ? c.mutedForeground : c.primary,
                borderRadius: 10, padding: 14,
                alignItems: "center", marginBottom: 16,
              }}
            >
              {isBezigOpslaan ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>LMRA registreren</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
