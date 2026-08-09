import { API_DOMEIN } from "@/lib/apiDomein";
import React, { useState, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  Linking,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetVeiligheidToolboxen,
  useGetVeiligheidToolboxenId,
  usePostVeiligheidToolboxenIdAfronden,
  getGetVeiligheidToolboxenQueryKey,
  getGetVeiligheidToolboxenIdQueryKey,
  type VeiligheidToolbox,
} from "@workspace/api-client-react";
import {
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/auth";
import { BevoegdheidGuard } from "@/components/BevoegdheidGuard";

// ─── helpers ─────────────────────────────────────────────────────────────────

const CATEGORIE_LABELS: Record<string, string> = {
  brandveiligheid: "Brandveiligheid",
  werken_op_hoogte: "Werken op hoogte",
  pbm: "PBM",
  elektrisch: "Elektrisch",
  bouwplaats: "Bouwplaats",
  gezondheid: "Gezondheid",
  milieu: "Milieu",
  machines: "Machines",
  overig: "Overig",
};

function catLabel(cat: string) {
  return CATEGORIE_LABELS[cat] ?? cat;
}

// ─── Quizscherm ───────────────────────────────────────────────────────────────

function QuizScherm({
  vragen,
  minScore,
  c,
  onKlaar,
}: {
  vragen: any[];
  minScore: number;
  c: ReturnType<typeof useColors>;
  onKlaar: (antwoorden: number[], geslaagd: boolean) => void;
}) {
  const [huidig, setHuidig] = useState(0);
  const [antwoorden, setAntwoorden] = useState<number[]>([]);
  const [gekozen, setGekozen] = useState<number | null>(null);
  const [gecontroleerd, setGecontroleerd] = useState(false);

  const vraag = vragen[huidig];
  const opties: any[] = vraag?.opties ?? [];
  const juistIndex = opties.findIndex((o: any) => o.correct);

  function kiesOptie(idx: number) {
    if (gecontroleerd) return;
    setGekozen(idx);
  }

  function controleer() {
    if (gekozen === null) return;
    setGecontroleerd(true);
  }

  function volgende() {
    const nieuweAntwoorden = [...antwoorden, gekozen ?? -1];
    if (huidig + 1 < vragen.length) {
      setAntwoorden(nieuweAntwoorden);
      setHuidig(huidig + 1);
      setGekozen(null);
      setGecontroleerd(false);
    } else {
      const score = nieuweAntwoorden.filter((a, i) => vragen[i]?.opties?.[a]?.correct).length;
      const geslaagd = score >= Math.ceil(vragen.length * (minScore / 100));
      onKlaar(nieuweAntwoorden, geslaagd);
    }
  }

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 8 }}>
        Vraag {huidig + 1} van {vragen.length}
      </Text>

      <Text style={{ color: c.foreground, fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 20, lineHeight: 24 }}>
        {vraag?.vraag}
      </Text>

      <View style={{ gap: 10 }}>
        {opties.map((o: any, i: number) => {
          let bg = c.card;
          let border = c.border;
          let tekstKleur = c.foreground;

          if (gecontroleerd) {
            if (i === juistIndex) { bg = "#dcfce7"; border = "#16a34a"; tekstKleur = "#166534"; }
            else if (i === gekozen && i !== juistIndex) { bg = "#fee2e2"; border = "#dc2626"; tekstKleur = "#991b1b"; }
          } else if (i === gekozen) {
            bg = c.primary + "20"; border = c.primary;
          }

          return (
            <Pressable
              key={i}
              onPress={() => kiesOptie(i)}
              style={{
                padding: 14,
                borderRadius: 10,
                borderWidth: 1.5,
                backgroundColor: bg,
                borderColor: border,
              }}
            >
              <Text style={{ color: tekstKleur, fontFamily: "Inter_400Regular", fontSize: 14 }}>
                {o.tekst}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {gecontroleerd && vraag?.uitleg && (
        <View style={{ marginTop: 12, padding: 12, backgroundColor: "#f0fdf4", borderRadius: 8, borderWidth: 1, borderColor: "#bbf7d0" }}>
          <Text style={{ color: "#166534", fontSize: 13, fontFamily: "Inter_400Regular" }}>{vraag.uitleg}</Text>
        </View>
      )}

      <View style={{ marginTop: 20 }}>
        {!gecontroleerd ? (
          <Pressable
            onPress={controleer}
            disabled={gekozen === null}
            style={{
              backgroundColor: gekozen !== null ? c.primary : c.muted,
              paddingVertical: 14,
              borderRadius: 10,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 }}>Controleer</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={volgende}
            style={{ backgroundColor: c.primary, paddingVertical: 14, borderRadius: 10, alignItems: "center" }}
          >
            <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 }}>
              {huidig + 1 < vragen.length ? "Volgende vraag" : "Afronden"}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({
  toolboxId,
  visible,
  onSluit,
  c,
}: {
  toolboxId: number;
  visible: boolean;
  onSluit: () => void;
  c: ReturnType<typeof useColors>;
}) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: detail, isLoading } = useGetVeiligheidToolboxenId(toolboxId, {
    query: { enabled: visible },
  } as any);

  const afrondMut = usePostVeiligheidToolboxenIdAfronden();

  const [sectie, setSectie] = useState<"intro" | "quiz" | "bevestiging">("intro");
  const [quizAntwoorden, setQuizAntwoorden] = useState<number[]>([]);
  const [quizGeslaagd, setQuizGeslaagd] = useState(false);
  const [handtekening, setHandtekening] = useState("");
  const [bezig, setBezig] = useState(false);
  const [afgerond, setAfgerond] = useState(false);

  const heeftQuiz = ((detail as any)?.vragen ?? []).length > 0;
  const heeftPdf = !!(detail as any)?.pdf_pad;
  const heeftVideo = !!(detail as any)?.video_url;
  const mijnAfronding = (detail as any)?.mijn_afronding;

  async function afronden() {
    if (!handtekening.trim()) {
      Alert.alert("Handtekening vereist", "Vul uw naam in ter bevestiging.");
      return;
    }
    setBezig(true);
    try {
      await afrondMut.mutateAsync({
        id: toolboxId,
        data: { antwoorden: heeftQuiz ? quizAntwoorden : [], handtekening: handtekening.trim() },
      });
      queryClient.invalidateQueries({ queryKey: getGetVeiligheidToolboxenQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetVeiligheidToolboxenIdQueryKey(toolboxId) });
      setAfgerond(true);
    } catch {
      Alert.alert("Fout", "Kon afronding niet registreren. Probeer opnieuw.");
    } finally {
      setBezig(false);
    }
  }

  function sluit() {
    setSectie("intro");
    setQuizAntwoorden([]);
    setHandtekening("");
    setAfgerond(false);
    onSluit();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={sluit}>
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top }}>
        {/* Header */}
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
          gap: 12,
        }}>
          <Pressable onPress={sluit} style={{ padding: 4 }}>
            <Ionicons name="close" size={24} color={c.foreground} />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 17, fontFamily: "Inter_700Bold", color: c.foreground }} numberOfLines={1}>
            {detail?.titel ?? "Toolbox"}
          </Text>
        </View>

        {isLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={c.primary} />
          </View>
        ) : detail ? (
          <>
            {/* Sectie navigatie */}
            <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.border }}>
              {[
                { key: "intro", label: "Inhoud" },
                ...(heeftQuiz ? [{ key: "quiz", label: "Quiz" }] : []),
                { key: "bevestiging", label: "Bevestiging" },
              ].map((s) => (
                <Pressable
                  key={s.key}
                  onPress={() => setSectie(s.key as any)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    alignItems: "center",
                    borderBottomWidth: 2,
                    borderBottomColor: sectie === s.key ? c.primary : "transparent",
                  }}
                >
                  <Text style={{
                    fontSize: 13,
                    fontFamily: "Inter_600SemiBold",
                    color: sectie === s.key ? c.primary : c.mutedForeground,
                  }}>
                    {s.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Inhoud */}
            {sectie === "intro" && (
              <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
                {/* Meta badges */}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  <View style={{ backgroundColor: c.muted, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                    <Text style={{ fontSize: 12, color: c.mutedForeground, fontFamily: "Inter_400Regular" }}>
                      {catLabel(detail.categorie)}
                    </Text>
                  </View>
                  {detail.geschatte_leestijd && (
                    <View style={{ backgroundColor: c.muted, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                      <Text style={{ fontSize: 12, color: c.mutedForeground, fontFamily: "Inter_400Regular" }}>
                        {detail.geschatte_leestijd} min
                      </Text>
                    </View>
                  )}
                  {detail.verplicht && (
                    <View style={{ backgroundColor: "#fef2f2", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: "#fecaca" }}>
                      <Text style={{ fontSize: 12, color: "#dc2626", fontFamily: "Inter_600SemiBold" }}>Verplicht</Text>
                    </View>
                  )}
                </View>

                {/* Intro tekst */}
                {(detail as any).intro && (
                  <View>
                    <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: c.foreground, marginBottom: 6 }}>Introductie</Text>
                    <Text style={{ fontSize: 14, color: c.foreground, fontFamily: "Inter_400Regular", lineHeight: 22 }}>
                      {(detail as any).intro}
                    </Text>
                  </View>
                )}

                {/* AI Samenvatting */}
                {(detail as any).ai_samenvatting && (
                  <View style={{ backgroundColor: "#fffbeb", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#fde68a" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <Ionicons name="sparkles" size={15} color="#d97706" />
                      <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#92400e" }}>AI Samenvatting</Text>
                    </View>
                    <Text style={{ fontSize: 13, color: "#78350f", fontFamily: "Inter_400Regular", lineHeight: 20 }}>
                      {(detail as any).ai_samenvatting}
                    </Text>

                    {((detail as any).ai_risicos ?? []).length > 0 && (
                      <View style={{ marginTop: 10 }}>
                        <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: "#dc2626", marginBottom: 4 }}>
                          Belangrijkste risico's
                        </Text>
                        {((detail as any).ai_risicos as string[]).map((r, i) => (
                          <View key={i} style={{ flexDirection: "row", gap: 6, marginBottom: 3 }}>
                            <Ionicons name="warning" size={13} color="#dc2626" style={{ marginTop: 2 }} />
                            <Text style={{ fontSize: 13, color: "#991b1b", fontFamily: "Inter_400Regular", flex: 1 }}>{r}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {((detail as any).ai_maatregelen ?? []).length > 0 && (
                      <View style={{ marginTop: 10 }}>
                        <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: "#16a34a", marginBottom: 4 }}>
                          Maatregelen
                        </Text>
                        {((detail as any).ai_maatregelen as string[]).map((m, i) => (
                          <View key={i} style={{ flexDirection: "row", gap: 6, marginBottom: 3 }}>
                            <Ionicons name="checkmark-circle" size={13} color="#16a34a" style={{ marginTop: 2 }} />
                            <Text style={{ fontSize: 13, color: "#166534", fontFamily: "Inter_400Regular", flex: 1 }}>{m}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {(detail as any).ai_stoppen && (
                      <View style={{ marginTop: 10, backgroundColor: "#fef2f2", padding: 10, borderRadius: 8, borderWidth: 1, borderColor: "#fecaca" }}>
                        <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: "#dc2626", marginBottom: 3 }}>
                          Wanneer direct stoppen
                        </Text>
                        <Text style={{ fontSize: 13, color: "#991b1b", fontFamily: "Inter_400Regular" }}>
                          {(detail as any).ai_stoppen}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* PDF knop */}
                {heeftPdf && (
                  <Pressable
                    onPress={() => Linking.openURL(`https://${API_DOMEIN}/api/storage${(detail as any).pdf_pad}`)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      padding: 14,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: c.border,
                      backgroundColor: c.card,
                    }}
                  >
                    <Ionicons name="document-text" size={22} color={c.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
                        PDF bekijken
                      </Text>
                      <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>
                        Volledig document openen
                      </Text>
                    </View>
                    <Ionicons name="open-outline" size={18} color={c.mutedForeground} />
                  </Pressable>
                )}

                {/* Video knop */}
                {heeftVideo && (
                  <Pressable
                    onPress={() => Linking.openURL((detail as any).video_url)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      padding: 14,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: c.border,
                      backgroundColor: c.card,
                    }}
                  >
                    <Ionicons name="play-circle" size={22} color={c.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
                        Video bekijken
                      </Text>
                    </View>
                    <Ionicons name="open-outline" size={18} color={c.mutedForeground} />
                  </Pressable>
                )}

                {/* Mijn afronding */}
                {mijnAfronding && (
                  <View style={{ backgroundColor: mijnAfronding.geslaagd ? "#f0fdf4" : "#fff7ed", padding: 12, borderRadius: 10, borderWidth: 1, borderColor: mijnAfronding.geslaagd ? "#bbf7d0" : "#fed7aa" }}>
                    <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: mijnAfronding.geslaagd ? "#166534" : "#9a3412", marginBottom: 3 }}>
                      {mijnAfronding.geslaagd ? "Afgerond en geslaagd" : "Niet geslaagd — probeer opnieuw"}
                    </Text>
                    <Text style={{ fontSize: 12, color: mijnAfronding.geslaagd ? "#166534" : "#9a3412", fontFamily: "Inter_400Regular" }}>
                      Score: {mijnAfronding.score}/{mijnAfronding.max_score}
                      {mijnAfronding.geldig_tot && ` · Geldig t/m ${new Date(mijnAfronding.geldig_tot).toLocaleDateString("nl-NL")}`}
                    </Text>
                  </View>
                )}

                <Pressable
                  onPress={() => setSectie(heeftQuiz ? "quiz" : "bevestiging")}
                  style={{
                    backgroundColor: c.primary,
                    paddingVertical: 14,
                    borderRadius: 10,
                    alignItems: "center",
                    marginTop: 8,
                  }}
                >
                  <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 }}>
                    {heeftQuiz ? "Naar controlevragen" : "Bevestigen"}
                  </Text>
                </Pressable>
              </ScrollView>
            )}

            {sectie === "quiz" && heeftQuiz && (
              <ScrollView style={{ flex: 1 }}>
                <QuizScherm
                  vragen={(detail as any).vragen}
                  minScore={detail.min_score ?? 70}
                  c={c}
                  onKlaar={(antwoorden, geslaagd) => {
                    setQuizAntwoorden(antwoorden);
                    setQuizGeslaagd(geslaagd);
                    setSectie("bevestiging");
                  }}
                />
              </ScrollView>
            )}

            {sectie === "bevestiging" && (
              <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
                {heeftQuiz && (
                  <View style={{
                    padding: 14,
                    borderRadius: 10,
                    backgroundColor: quizGeslaagd ? "#f0fdf4" : "#fff7ed",
                    borderWidth: 1,
                    borderColor: quizGeslaagd ? "#bbf7d0" : "#fed7aa",
                  }}>
                    <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: quizGeslaagd ? "#166534" : "#9a3412" }}>
                      {quizGeslaagd ? "Quiz geslaagd" : "Quiz niet geslaagd"}
                    </Text>
                    <Text style={{ fontSize: 13, color: quizGeslaagd ? "#166534" : "#9a3412", fontFamily: "Inter_400Regular", marginTop: 3 }}>
                      {quizAntwoorden.filter((a, i) => (detail as any).vragen?.[i]?.opties?.[a]?.correct).length} van {(detail as any).vragen?.length} vragen goed
                    </Text>
                  </View>
                )}

                {afgerond ? (
                  <View style={{ alignItems: "center", paddingVertical: 30, gap: 12 }}>
                    <Ionicons name="checkmark-circle" size={56} color="#16a34a" />
                    <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: "#166534" }}>
                      Toolbox afgerond
                    </Text>
                    <Text style={{ fontSize: 14, color: c.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center" }}>
                      Uw bevestiging is geregistreerd. Geldig voor {detail.geldigheid_maanden} maanden.
                    </Text>
                    <Pressable
                      onPress={sluit}
                      style={{ backgroundColor: c.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, marginTop: 8 }}
                    >
                      <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 }}>Sluiten</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <View style={{
                      backgroundColor: "#f8fafc",
                      padding: 16,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: c.border,
                    }}>
                      <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: c.foreground, lineHeight: 22, textAlign: "center" }}>
                        "Ik, {/* naam placeholder */}heb deze toolbox gelezen en begrepen, en verklaar de veiligheidsregels toe te passen in de praktijk."
                      </Text>
                    </View>

                    <View>
                      <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 6 }}>
                        Handtekening (volledige naam)
                      </Text>
                      <TextInput
                        value={handtekening}
                        onChangeText={setHandtekening}
                        placeholder="Uw naam als digitale handtekening"
                        style={{
                          borderWidth: 1,
                          borderColor: c.border,
                          borderRadius: 10,
                          padding: 14,
                          fontSize: 14,
                          fontFamily: "Inter_400Regular",
                          color: c.foreground,
                          backgroundColor: c.card,
                        }}
                        placeholderTextColor={c.mutedForeground}
                      />
                    </View>

                    <Pressable
                      onPress={afronden}
                      disabled={bezig || !handtekening.trim() || (heeftQuiz && !quizGeslaagd && (detail.min_score ?? 0) > 0)}
                      style={{
                        backgroundColor: (bezig || !handtekening.trim() || (heeftQuiz && !quizGeslaagd && (detail.min_score ?? 0) > 0)) ? c.muted : c.primary,
                        paddingVertical: 14,
                        borderRadius: 10,
                        alignItems: "center",
                      }}
                    >
                      {bezig ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 }}>
                          Bevestigen en afronden
                        </Text>
                      )}
                    </Pressable>

                    {heeftQuiz && !quizGeslaagd && (detail.min_score ?? 0) > 0 && (
                      <Pressable onPress={() => setSectie("quiz")} style={{ alignItems: "center" }}>
                        <Text style={{ color: c.primary, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
                          Quiz opnieuw proberen
                        </Text>
                      </Pressable>
                    )}
                  </>
                )}
              </ScrollView>
            )}
          </>
        ) : null}
      </View>
    </Modal>
  );
}

// ─── Hoofdscherm ──────────────────────────────────────────────────────────────

function ToolboxenScherm() {
  const insets = useSafeAreaInsets();
  const c = useColors();
  const queryClient = useQueryClient();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold });

  const { data: toolboxen, isLoading, refetch } = useGetVeiligheidToolboxen(
    { gepubliceerd: true },
    { query: {} } as any
  );

  const [zoek, setZoek] = useState("");
  const [geselecteerdeId, setGeselecteerdeId] = useState<number | null>(null);
  const [vernieuwen, setVernieuwen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  async function handleRefresh() {
    setVernieuwen(true);
    await refetch();
    setVernieuwen(false);
  }

  const gefilterd = (toolboxen ?? []).filter(
    (t) => !zoek || t.titel.toLowerCase().includes(zoek.toLowerCase())
  );

  if (!fontsLoaded) return null;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 8,
        paddingBottom: 12,
        paddingHorizontal: 16,
        backgroundColor: c.dark,
        gap: 10,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons name="shield-checkmark" size={22} color={c.primary} />
          <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: c.darkForeground, flex: 1 }}>
            Veiligheidstoolboxen
          </Text>
        </View>
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "#2d3444",
          borderRadius: 10,
          paddingHorizontal: 12,
          borderWidth: 1,
          borderColor: "#3a4255",
          gap: 8,
        }}>
          <Ionicons name="search" size={16} color={c.darkMuted} />
          <TextInput
            value={zoek}
            onChangeText={setZoek}
            placeholder="Zoek toolbox..."
            placeholderTextColor={c.darkMuted}
            style={{ flex: 1, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular", color: c.darkForeground }}
          />
        </View>
      </View>

      {/* Lijst */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={c.primary} size="large" />
        </View>
      ) : gefilterd.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
          <Ionicons name="shield-checkmark-outline" size={48} color={c.mutedForeground} style={{ marginBottom: 12 }} />
          <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 6 }}>
            Geen toolboxen
          </Text>
          <Text style={{ fontSize: 14, color: c.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center" }}>
            {zoek ? "Geen resultaten voor uw zoekopdracht." : "Er zijn nog geen gepubliceerde toolboxen."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={gefilterd}
          keyExtractor={(t) => String(t.id)}
          contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: insets.bottom + 20 }}
          refreshControl={<RefreshControl refreshing={vernieuwen} onRefresh={handleRefresh} tintColor={c.primary} />}
          renderItem={({ item: t }) => {
            const mijnAfronding = (t as any).mijn_afronding;
            const geslaagd = mijnAfronding?.geslaagd === true;
            const afgerond = mijnAfronding != null;

            return (
              <Pressable
                onPress={() => setGeselecteerdeId(t.id)}
                style={{
                  backgroundColor: c.card,
                  borderRadius: 12,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: c.border,
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                  <View style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: c.primary + "20",
                    alignItems: "center",
                    justifyContent: "center",
                    shrink: 0,
                  } as any}>
                    <Ionicons name="shield-checkmark" size={20} color={c.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: c.foreground }} numberOfLines={2}>
                      {t.titel}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Text style={{ fontSize: 12, color: c.mutedForeground, fontFamily: "Inter_400Regular" }}>
                        {catLabel(t.categorie)}
                      </Text>
                      {t.geschatte_leestijd && (
                        <Text style={{ fontSize: 12, color: c.mutedForeground, fontFamily: "Inter_400Regular" }}>
                          {t.geschatte_leestijd} min
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    {afgerond ? (
                      <Ionicons
                        name={geslaagd ? "checkmark-circle" : "close-circle"}
                        size={22}
                        color={geslaagd ? "#16a34a" : "#ea580c"}
                      />
                    ) : t.verplicht ? (
                      <View style={{ backgroundColor: "#fef2f2", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ fontSize: 10, color: "#dc2626", fontFamily: "Inter_600SemiBold" }}>Verplicht</Text>
                      </View>
                    ) : null}
                    <Ionicons name="chevron-forward" size={16} color={c.mutedForeground} />
                  </View>
                </View>

                {(t.tags ?? []).length > 0 && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
                    {(t.tags as string[]).slice(0, 3).map((tag) => (
                      <View key={tag} style={{ backgroundColor: c.muted, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                        <Text style={{ fontSize: 11, color: c.mutedForeground, fontFamily: "Inter_400Regular" }}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}

      {/* Detail Modal */}
      {geselecteerdeId !== null && (
        <DetailModal
          toolboxId={geselecteerdeId}
          visible={geselecteerdeId !== null}
          onSluit={() => setGeselecteerdeId(null)}
          c={c}
        />
      )}
    </View>
  );
}

// APP_01 §3.3 — schermbescherming: nette weigering zonder bevoegdheid
// (backendroute eist toolbox niveau 1; gemeten, zie docs/metingen).
export default function ToolboxenSchermBeveiligd() {
  return (
    <BevoegdheidGuard vereiste={{ module: "toolbox", niveau: 1 }}>
      <ToolboxenScherm />
    </BevoegdheidGuard>
  );
}
