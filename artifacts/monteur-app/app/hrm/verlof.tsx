import {
  useCreateMijnVerlofaanvraag,
  useListMijnVerlofaanvragen,
  useListMijnVerlofsaldi,
  useListMijnVerlofsoorten,
  type VerlofAanvraagInput,
} from "@workspace/api-client-react";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Redirect, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LijstFout, bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

const HUIDIG_JAAR = new Date().getFullYear();

const STATUS_LABELS: Record<string, string> = {
  aangevraagd: "Aangevraagd",
  goedgekeurd: "Goedgekeurd",
  afgewezen: "Afgewezen",
  ingetrokken: "Ingetrokken",
};

function statusKleur(status: string, c: ReturnType<typeof useColors>) {
  switch (status) {
    case "aangevraagd":
      return { bg: "#fef3c7", tekst: "#92400e" };
    case "goedgekeurd":
      return { bg: "#d1fae5", tekst: "#065f46" };
    case "afgewezen":
      return { bg: "#fee2e2", tekst: "#991b1b" };
    default:
      return { bg: c.muted, tekst: c.mutedForeground };
  }
}

function datumWeergave(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

function isoVanDate(d: Date): string {
  const jaar = d.getFullYear();
  const maand = String(d.getMonth() + 1).padStart(2, "0");
  const dag = String(d.getDate()).padStart(2, "0");
  return `${jaar}-${maand}-${dag}`;
}

function isGeldigeDatum(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

function DatumKnop({
  label,
  waarde,
  onPress,
  c,
  testID,
}: {
  label: string;
  waarde: string;
  onPress: () => void;
  c: ReturnType<typeof useColors>;
  testID?: string;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
        {label}
      </Text>
      <Pressable
        testID={testID}
        onPress={onPress}
        style={({ pressed }) => ({
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: 8,
          paddingHorizontal: 14,
          paddingVertical: 12,
          backgroundColor: pressed ? c.muted : c.background,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        })}
      >
        <Text
          style={{
            color: waarde ? c.foreground : c.mutedForeground,
            fontSize: 15,
            fontFamily: "Inter_400Regular",
          }}
        >
          {waarde ? datumWeergave(waarde) : "Kies datum…"}
        </Text>
        <Text style={{ color: c.mutedForeground, fontSize: 18 }}>{"📅"}</Text>
      </Pressable>
    </View>
  );
}

export default function VerlofScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { inhoudMaxBreedte } = useResponsive();
  const { token } = useAuth();

  const { data: saldi, isLoading: ladenSaldi, isError: foutSaldi, refetch: herlaadSaldi, isRefetching: herladenSaldi } = useListMijnVerlofsaldi({ query: { queryKey: ["mijn", "verlofsaldi"] } });
  const { data: aanvragen, isLoading: ladenAanvragen, isError: foutAanvragen, refetch: herlaadAanvragen, isRefetching: herladenAanvragen } = useListMijnVerlofaanvragen({ query: { queryKey: ["mijn", "verlofaanvragen"] } });
  const { data: verlofsoorten } = useListMijnVerlofsoorten({ query: { queryKey: ["mijn", "verlofsoorten"] } });
  const { mutate: dienIn, isPending: bezigIndienen } = useCreateMijnVerlofaanvraag();

  const [modalOpen, setModalOpen] = useState(false);
  const [soortPickerOpen, setSoortPickerOpen] = useState(false);
  const [verlofsoortId, setVerlofsoortId] = useState<number | null>(null);
  const [startDatum, setStartDatum] = useState("");
  const [eindDatum, setEindDatum] = useState("");
  const [aantalUren, setAantalUren] = useState("");
  const [reden, setReden] = useState("");
  const [formulierFout, setFormulierFout] = useState<string | null>(null);

  // Native datumkiezer state
  const [activePicker, setActivePicker] = useState<"start" | "eind" | null>(null);
  const [pickerDatum, setPickerDatum] = useState<Date>(new Date());

  if (!token) return <Redirect href="/login" />;

  const huidigJaarSaldi = (saldi ?? []).filter((s) => s.jaar === HUIDIG_JAAR);
  const gekozenSoortNaam = verlofsoorten?.find((s) => s.id === verlofsoortId)?.naam ?? null;

  function openDatumPicker(veld: "start" | "eind") {
    const huidig = veld === "start" ? startDatum : eindDatum;
    setPickerDatum(isGeldigeDatum(huidig) ? new Date(huidig) : new Date());
    setActivePicker(veld);
  }

  function onPickerChange(_event: DateTimePickerEvent, geselecteerd?: Date) {
    if (Platform.OS === "android") {
      setActivePicker(null);
    }
    if (geselecteerd) {
      const iso = isoVanDate(geselecteerd);
      if (activePicker === "start") setStartDatum(iso);
      else if (activePicker === "eind") setEindDatum(iso);
    }
  }

  function bevestigIosPicker() {
    const iso = isoVanDate(pickerDatum);
    if (activePicker === "start") setStartDatum(iso);
    else if (activePicker === "eind") setEindDatum(iso);
    setActivePicker(null);
  }

  function resetFormulier() {
    setVerlofsoortId(null);
    setStartDatum("");
    setEindDatum("");
    setAantalUren("");
    setReden("");
    setFormulierFout(null);
  }

  function openModal() {
    resetFormulier();
    setModalOpen(true);
  }

  function sluitModal() {
    setModalOpen(false);
    resetFormulier();
  }

  function indienen() {
    if (!verlofsoortId) {
      setFormulierFout("Kies een verlofsoort.");
      return;
    }
    if (!isGeldigeDatum(startDatum)) {
      setFormulierFout("Kies een geldige startdatum.");
      return;
    }
    if (!isGeldigeDatum(eindDatum)) {
      setFormulierFout("Kies een geldige einddatum.");
      return;
    }
    if (eindDatum < startDatum) {
      setFormulierFout("De einddatum mag niet vóór de startdatum liggen.");
      return;
    }
    setFormulierFout(null);
    const body: VerlofAanvraagInput = {
      verlofsoort_id: verlofsoortId,
      start_datum: startDatum,
      eind_datum: eindDatum,
      ...(aantalUren ? { aantal_uren: parseFloat(aantalUren) } : {}),
      ...(reden ? { reden } : {}),
    };
    dienIn(
      { data: body },
      {
        onSuccess: () => {
          void herlaadAanvragen();
          void herlaadSaldi();
          sluitModal();
          Alert.alert("Aanvraag ingediend", "Je verlofaanvraag is verzonden en wordt beoordeeld door de beheerder.");
        },
        onError: () => {
          setFormulierFout("Er ging iets mis. Controleer je verbinding en probeer het opnieuw.");
        },
      },
    );
  }

  const isHerladen = herladenSaldi || herladenAanvragen;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={{
          backgroundColor: c.dark,
          paddingTop: bovenInset(insets) + 12,
          paddingHorizontal: 20,
          paddingBottom: 18,
        }}
      >
        <View style={{ width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
          <Pressable onPress={() => router.back()} style={{ marginBottom: 10 }}>
            <Text style={{ color: c.primary, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>‹ Terug</Text>
          </Pressable>
          <Text style={{ color: c.darkForeground, fontSize: 20, fontFamily: "Inter_700Bold" }}>Verlof</Text>
          <Text style={{ color: c.darkMuted, fontSize: 13, marginTop: 2, fontFamily: "Inter_400Regular" }}>
            Saldo en aanvragen {HUIDIG_JAAR}
          </Text>
        </View>
      </View>

      {ladenSaldi || ladenAanvragen ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : foutSaldi || foutAanvragen ? (
        <LijstFout
          beschrijving="De verlofgegevens konden niet worden geladen. Controleer je verbinding en probeer het opnieuw."
          onOpnieuw={() => { void herlaadSaldi(); void herlaadAanvragen(); }}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            gap: 14,
            paddingBottom: insets.bottom + 80,
            width: "100%",
            maxWidth: inhoudMaxBreedte,
            alignSelf: "center",
          }}
          refreshControl={
            <RefreshControl
              refreshing={isHerladen}
              onRefresh={() => { void herlaadSaldi(); void herlaadAanvragen(); }}
              tintColor={c.primary}
            />
          }
        >
          <Text style={{ color: c.foreground, fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 2 }}>
            Verlofsaldo
          </Text>

          {huidigJaarSaldi.length === 0 ? (
            <View
              style={{
                backgroundColor: c.card,
                borderRadius: c.radius,
                borderWidth: 1,
                borderColor: c.border,
                padding: 18,
                alignItems: "center",
              }}
            >
              <Text style={{ color: c.mutedForeground, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" }}>
                Geen verlofsaldo beschikbaar voor {HUIDIG_JAAR}.
              </Text>
              <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 4 }}>
                Neem contact op met de beheerder als dit onjuist lijkt.
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {huidigJaarSaldi.map((s) => (
                <View
                  key={s.id}
                  style={{
                    flexGrow: 1,
                    flexBasis: "45%",
                    backgroundColor: c.card,
                    borderRadius: c.radius,
                    borderWidth: 1,
                    borderColor: c.border,
                    padding: 16,
                  }}
                >
                  <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>
                    {s.verlofsoort_naam ?? "Verlof"}
                  </Text>
                  <Text style={{ color: c.foreground, fontSize: 26, fontFamily: "Inter_700Bold", marginTop: 4 }}>
                    {s.saldo_uren}
                    <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: c.mutedForeground }}> u</Text>
                  </Text>
                  <Text style={{ color: c.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 }}>
                    Opgenomen: {s.opgenomen_uren} u
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
            <Text style={{ color: c.foreground, fontSize: 16, fontFamily: "Inter_700Bold" }}>
              Aanvragen
            </Text>
            <Pressable
              testID="verlof-aanvragen-knop"
              onPress={openModal}
              style={({ pressed }) => ({
                backgroundColor: c.primary,
                borderRadius: 8,
                paddingHorizontal: 16,
                paddingVertical: 8,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" }}>
                + Aanvragen
              </Text>
            </Pressable>
          </View>

          {(aanvragen ?? []).length === 0 ? (
            <View
              style={{
                backgroundColor: c.card,
                borderRadius: c.radius,
                borderWidth: 1,
                borderColor: c.border,
                padding: 18,
                alignItems: "center",
              }}
            >
              <Text style={{ color: c.mutedForeground, fontSize: 14, fontFamily: "Inter_400Regular" }}>
                Geen verlofaanvragen gevonden.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {(aanvragen ?? []).map((a) => {
                const kleur = statusKleur(a.status, c);
                return (
                  <View
                    key={a.id}
                    style={{
                      backgroundColor: c.card,
                      borderRadius: c.radius,
                      borderWidth: 1,
                      borderColor: c.border,
                      padding: 16,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <Text style={{ color: c.foreground, fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1, marginRight: 8 }}>
                        {a.verlofsoort_naam ?? "Verlof"}
                      </Text>
                      <View
                        style={{
                          backgroundColor: kleur.bg,
                          borderRadius: 6,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                        }}
                      >
                        <Text style={{ color: kleur.tekst, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
                          {STATUS_LABELS[a.status] ?? a.status}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular" }}>
                      {datumWeergave(a.start_datum)} — {datumWeergave(a.eind_datum)}
                      {a.aantal_uren ? `  ·  ${a.aantal_uren} uur` : ""}
                    </Text>
                    {a.reden ? (
                      <Text
                        style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 }}
                        numberOfLines={2}
                      >
                        {a.reden}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      {/* Verlofaanvraag modal */}
      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={sluitModal}>
        <View style={{ flex: 1 }}>
          <TouchableWithoutFeedback onPress={sluitModal}>
            <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} />
          </TouchableWithoutFeedback>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}>
          <View
            style={{
              backgroundColor: c.card,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingHorizontal: 20,
              paddingTop: 20,
              paddingBottom: insets.bottom + 24,
              gap: 16,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: c.foreground, fontSize: 18, fontFamily: "Inter_700Bold" }}>
                Verlofaanvraag indienen
              </Text>
              <Pressable testID="verlofaanvraag-sluiten" onPress={sluitModal} hitSlop={12}>
                <Text style={{ color: c.mutedForeground, fontSize: 22, lineHeight: 26 }}>×</Text>
              </Pressable>
            </View>

            {formulierFout ? (
              <View testID="verlof-formulier-fout" style={{ backgroundColor: "#fee2e2", borderRadius: 8, padding: 12 }}>
                <Text style={{ color: "#991b1b", fontSize: 13, fontFamily: "Inter_400Regular" }}>{formulierFout}</Text>
              </View>
            ) : null}

            {/* Verlofsoort */}
            <View style={{ gap: 4 }}>
              <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                VERLOFSOORT
              </Text>
              <Pressable
                testID="verlof-soort-picker-knop"
                onPress={() => setSoortPickerOpen(true)}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor: c.border,
                  borderRadius: 8,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  backgroundColor: pressed ? c.muted : c.background,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                })}
              >
                <Text
                  style={{
                    color: gekozenSoortNaam ? c.foreground : c.mutedForeground,
                    fontSize: 15,
                    fontFamily: "Inter_400Regular",
                  }}
                >
                  {gekozenSoortNaam ?? "Kies een verlofsoort..."}
                </Text>
                <Text style={{ color: c.mutedForeground, fontSize: 16 }}>›</Text>
              </Pressable>
            </View>

            {/* Datums naast elkaar */}
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <DatumKnop
                  label="STARTDATUM"
                  waarde={startDatum}
                  onPress={() => openDatumPicker("start")}
                  c={c}
                  testID="verlof-startdatum-input"
                />
              </View>
              <View style={{ flex: 1 }}>
                <DatumKnop
                  label="EINDDATUM"
                  waarde={eindDatum}
                  onPress={() => openDatumPicker("eind")}
                  c={c}
                />
              </View>
            </View>

            {/* Android: inline DateTimePicker (toont als dialog) */}
            {Platform.OS === "android" && activePicker !== null ? (
              <DateTimePicker
                value={pickerDatum}
                mode="date"
                display="default"
                onChange={onPickerChange}
                locale="nl-NL"
              />
            ) : null}

            {/* Aantal uren */}
            <View style={{ gap: 4 }}>
              <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                AANTAL UREN (OPTIONEEL)
              </Text>
              <TextInput
                value={aantalUren}
                onChangeText={setAantalUren}
                placeholder="Bijv. 8"
                placeholderTextColor={c.mutedForeground}
                keyboardType="decimal-pad"
                style={{
                  borderWidth: 1,
                  borderColor: c.border,
                  borderRadius: 8,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  color: c.foreground,
                  fontSize: 15,
                  fontFamily: "Inter_400Regular",
                  backgroundColor: c.background,
                }}
              />
            </View>

            {/* Reden */}
            <View style={{ gap: 4 }}>
              <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                REDEN (OPTIONEEL)
              </Text>
              <TextInput
                value={reden}
                onChangeText={setReden}
                placeholder="Toelichting bij je aanvraag"
                placeholderTextColor={c.mutedForeground}
                multiline
                numberOfLines={2}
                style={{
                  borderWidth: 1,
                  borderColor: c.border,
                  borderRadius: 8,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  color: c.foreground,
                  fontSize: 15,
                  fontFamily: "Inter_400Regular",
                  backgroundColor: c.background,
                  minHeight: 64,
                  textAlignVertical: "top",
                }}
              />
            </View>

            <Pressable
              testID="verlof-indienen-knop"
              onPress={indienen}
              disabled={bezigIndienen}
              style={({ pressed }) => ({
                backgroundColor: bezigIndienen ? c.muted : c.primary,
                borderRadius: 10,
                paddingVertical: 14,
                alignItems: "center",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              {bezigIndienen ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" }}>
                  Aanvraag indienen
                </Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* iOS datum picker modal */}
      {Platform.OS === "ios" && activePicker !== null ? (
        <Modal visible transparent animationType="slide" onRequestClose={() => setActivePicker(null)}>
          <View style={{ flex: 1 }}>
            <TouchableWithoutFeedback onPress={() => setActivePicker(null)}>
              <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} />
            </TouchableWithoutFeedback>
            <View
              style={{
                backgroundColor: c.card,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                paddingBottom: insets.bottom + 20,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 20,
                  paddingTop: 16,
                  paddingBottom: 8,
                }}
              >
                <Pressable onPress={() => setActivePicker(null)}>
                  <Text style={{ color: c.primary, fontSize: 16, fontFamily: "Inter_400Regular" }}>Annuleren</Text>
                </Pressable>
                <Text style={{ color: c.foreground, fontSize: 16, fontFamily: "Inter_700Bold" }}>
                  {activePicker === "start" ? "Startdatum" : "Einddatum"}
                </Text>
                <Pressable onPress={bevestigIosPicker}>
                  <Text style={{ color: c.primary, fontSize: 16, fontFamily: "Inter_700Bold" }}>Gereed</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={pickerDatum}
                mode="date"
                display="spinner"
                onChange={(_e, d) => { if (d) setPickerDatum(d); }}
                locale="nl-NL"
                style={{ width: "100%" }}
              />
            </View>
          </View>
        </Modal>
      ) : null}

      {/* Verlofsoort picker */}
      {soortPickerOpen && (
      <Modal visible animationType="slide" transparent onRequestClose={() => setSoortPickerOpen(false)}>
        <View style={{ flex: 1 }}>
          <TouchableWithoutFeedback onPress={() => setSoortPickerOpen(false)}>
            <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} />
          </TouchableWithoutFeedback>
          <View
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: c.card,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingHorizontal: 20,
              paddingTop: 20,
              paddingBottom: insets.bottom + 24,
              maxHeight: "60%",
            }}
          >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <Text style={{ color: c.foreground, fontSize: 17, fontFamily: "Inter_700Bold" }}>
              Verlofsoort kiezen
            </Text>
            <Pressable testID="verlofsoort-picker-sluiten" onPress={() => setSoortPickerOpen(false)} hitSlop={12}>
              <Text style={{ color: c.mutedForeground, fontSize: 22, lineHeight: 26 }}>×</Text>
            </Pressable>
          </View>
          {(verlofsoorten ?? []).length === 0 ? (
            <Text style={{ color: c.mutedForeground, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", padding: 16 }}>
              Geen verlofsoorten beschikbaar. Neem contact op met de beheerder.
            </Text>
          ) : (
            <FlatList
              data={verlofsoorten}
              keyExtractor={(s) => String(s.id)}
              ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: c.border }} />}
              renderItem={({ item }) => (
                <Pressable
                  testID={`verlof-soort-rij-${item.id}`}
                  onPress={() => {
                    setVerlofsoortId(item.id);
                    setSoortPickerOpen(false);
                  }}
                  style={({ pressed }) => ({
                    paddingVertical: 14,
                    paddingHorizontal: 4,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: pressed ? c.muted : "transparent",
                  })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.foreground, fontSize: 15, fontFamily: "Inter_400Regular" }}>
                      {item.naam}
                    </Text>
                    {item.toelichting ? (
                      <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 }} numberOfLines={1}>
                        {item.toelichting}
                      </Text>
                    ) : null}
                  </View>
                  {verlofsoortId === item.id ? (
                    <Text style={{ color: c.primary, fontSize: 18 }}>✓</Text>
                  ) : null}
                </Pressable>
              )}
            />
          )}
          </View>
        </View>
      </Modal>
      )}
    </View>
  );
}
