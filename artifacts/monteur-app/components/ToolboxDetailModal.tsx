// Gedeelde toolbox-detailflow (inhoud → quiz → bevestiging) voor het
// toolboxen-scherm én de verplichte-maandtoolbox-popup in de root-layout.
// Uitgepakt uit app/toolboxen.tsx (taak: toolbox-vastloper, 18-08-2026).
import { API_DOMEIN } from "@/lib/apiDomein";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetVeiligheidToolboxenId,
  usePostVeiligheidToolboxenIdAfronden,
  getGetVeiligheidToolboxenQueryKey,
  getGetVeiligheidToolboxenIdQueryKey,
  getGetMijnToolboxMaandopdrachtQueryKey,
} from "@workspace/api-client-react";
import { ruimte } from "@workspace/ontwerp";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/auth";
import { Statusmerk, tekstStijl } from "@/components/ui";

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

export function catLabel(cat: string | null | undefined) {
  if (!cat) return "Overig";
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
    <View style={{ flex: 1, padding: ruimte.l + ruimte.xs }}>
      <Text style={[tekstStijl("bijschrift", c.mutedForeground), { marginBottom: ruimte.s }]}>
        Vraag {huidig + 1} van {vragen.length}
      </Text>

      <Text style={[tekstStijl("sectiekop", c.foreground), { marginBottom: ruimte.l + ruimte.xs, lineHeight: 24 }]}>
        {vraag?.vraag}
      </Text>

      <View style={{ gap: ruimte.s + 2 }}>
        {opties.map((o: any, i: number) => {
          let bg = c.card;
          let border = c.border;
          let tekstKleur = c.foreground;

          if (gecontroleerd) {
            if (i === juistIndex) { bg = c.secondary; border = c.success; tekstKleur = c.success; }
            else if (i === gekozen && i !== juistIndex) { bg = c.accent; border = c.destructive; tekstKleur = c.destructive; }
          } else if (i === gekozen) {
            bg = c.accent; border = c.primary;
          }

          return (
            <Pressable
              key={i}
              onPress={() => kiesOptie(i)}
              style={{
                padding: ruimte.m + 2,
                borderRadius: c.radius,
                borderWidth: 1.5,
                backgroundColor: bg,
                borderColor: border,
              }}
            >
              <Text style={tekstStijl("standaard", tekstKleur)}>
                {o?.tekst ?? ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {gecontroleerd && vraag?.uitleg && (
        <View style={{ marginTop: ruimte.m, padding: ruimte.m, backgroundColor: c.secondary, borderRadius: c.radius, borderWidth: 1, borderColor: c.success }}>
          <Text style={tekstStijl("klein", c.success)}>{vraag.uitleg}</Text>
        </View>
      )}

      <View style={{ marginTop: ruimte.l + ruimte.xs }}>
        {!gecontroleerd ? (
          <Pressable
            onPress={controleer}
            disabled={gekozen === null}
            style={{
              backgroundColor: gekozen !== null ? c.primary : c.muted,
              paddingVertical: ruimte.m + 2,
              borderRadius: c.radius,
              alignItems: "center",
            }}
          >
            <Text style={tekstStijl("nadruk", c.primaryForeground)}>Controleer</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={volgende}
            style={{ backgroundColor: c.primary, paddingVertical: ruimte.m + 2, borderRadius: c.radius, alignItems: "center" }}
          >
            <Text style={tekstStijl("nadruk", c.primaryForeground)}>
              {huidig + 1 < vragen.length ? "Volgende vraag" : "Afronden"}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

export function ToolboxDetailModal({
  toolboxId,
  visible,
  onSluit,
  onAfgerond,
}: {
  toolboxId: number;
  visible: boolean;
  onSluit: () => void;
  /** Wordt aangeroepen zodra de afronding succesvol is geregistreerd. */
  onAfgerond?: (geslaagd: boolean) => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { token } = useAuth();

  const { data: detail, isLoading, isError, refetch } = useGetVeiligheidToolboxenId(toolboxId, {
    query: { enabled: visible },
  } as any);

  const afrondMut = usePostVeiligheidToolboxenIdAfronden();

  const [sectie, setSectie] = useState<"intro" | "quiz" | "bevestiging">("intro");
  const [quizAntwoorden, setQuizAntwoorden] = useState<number[]>([]);
  const [quizGeslaagd, setQuizGeslaagd] = useState(false);
  const [handtekening, setHandtekening] = useState("");
  const [bezig, setBezig] = useState(false);
  const [afgerond, setAfgerond] = useState(false);
  const [pdfBezig, setPdfBezig] = useState(false);

  const heeftQuiz = ((detail as any)?.vragen ?? []).length > 0;
  const heeftPdf = !!(detail as any)?.pdf_pad;
  const heeftVideo = !!(detail as any)?.video_url;
  const mijnAfronding = (detail as any)?.mijn_afronding;

  async function openPdf() {
    if (pdfBezig) return;
    const pad = (detail as any)?.pdf_pad;
    if (!pad || !token) return;
    setPdfBezig(true);
    try {
      const storageUrl = `https://${API_DOMEIN}/api/storage${pad}`;
      if (Platform.OS === "web") {
        // Web: met bearer ophalen en in nieuw tabblad tonen — een kale link
        // opent zonder autorisatie (leeg/loginscherm).
        const res = await fetch(storageUrl, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(`http ${res.status}`);
        const blob = await res.blob();
        window.open(URL.createObjectURL(blob), "_blank", "noopener");
      } else {
        const doel = `${FileSystem.cacheDirectory}toolbox-${toolboxId}.pdf`;
        const r = await FileSystem.downloadAsync(storageUrl, doel, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.status !== 200) throw new Error(`http ${r.status}`);
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(r.uri, { mimeType: "application/pdf" });
        } else {
          await Linking.openURL(r.uri);
        }
      }
    } catch {
      Alert.alert("PDF openen mislukt", "Het document kon niet worden geopend. Probeer het opnieuw.");
    } finally {
      setPdfBezig(false);
    }
  }

  async function afronden() {
    if (!handtekening.trim()) {
      Alert.alert("Handtekening vereist", "Vul uw naam in ter bevestiging.");
      return;
    }
    setBezig(true);
    try {
      const resultaat = await afrondMut.mutateAsync({
        id: toolboxId,
        data: { antwoorden: heeftQuiz ? quizAntwoorden : [], handtekening: handtekening.trim() },
      });
      queryClient.invalidateQueries({ queryKey: getGetVeiligheidToolboxenQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetVeiligheidToolboxenIdQueryKey(toolboxId) });
      // Een geslaagde afronding kan de verplichte maandopdracht voltooien
      // (serverkoppeling) — popupstatus direct verversen.
      queryClient.invalidateQueries({ queryKey: getGetMijnToolboxMaandopdrachtQueryKey() });
      setAfgerond(true);
      onAfgerond?.((resultaat as any)?.geslaagd === true);
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
          <Text style={[tekstStijl("sectiekop", c.foreground), { flex: 1 }]} numberOfLines={1}>
            {detail?.titel ?? "Toolbox"}
          </Text>
        </View>

        {isLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={c.primary} />
          </View>
        ) : isError || !detail ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: ruimte.xl, gap: ruimte.m }}>
            <Ionicons name="cloud-offline-outline" size={40} color={c.mutedForeground} />
            <Text style={[tekstStijl("standaard", c.mutedForeground), { textAlign: "center" }]}>
              De toolbox kon niet worden geladen. Controleer uw verbinding en probeer het opnieuw.
            </Text>
            <Pressable
              onPress={() => void refetch()}
              style={{ backgroundColor: c.primary, paddingHorizontal: ruimte.xl, paddingVertical: ruimte.m, borderRadius: c.radius }}
            >
              <Text style={tekstStijl("nadruk", c.primaryForeground)}>Opnieuw proberen</Text>
            </Pressable>
          </View>
        ) : (
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
                    <Statusmerk label="Verplicht" soort="fout" />
                  )}
                </View>

                {/* Intro tekst */}
                {(detail as any).intro && (
                  <View>
                    <Text style={[tekstStijl("nadruk", c.foreground), { marginBottom: ruimte.xs + 2 }]}>Introductie</Text>
                    <Text style={[tekstStijl("standaard", c.foreground), { lineHeight: 22 }]}>
                      {(detail as any).intro}
                    </Text>
                  </View>
                )}

                {/* AI Samenvatting */}
                {(detail as any).ai_samenvatting && (
                  <View style={{ backgroundColor: c.accent, borderRadius: c.radius, padding: ruimte.m + 2, borderWidth: 1, borderColor: c.warning }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.xs + 2, marginBottom: ruimte.s }}>
                      <Ionicons name="sparkles" size={ruimte.m + 3} color={c.warning} />
                      <Text style={tekstStijl("klein", c.warning)}>AI Samenvatting</Text>
                    </View>
                    <Text style={[tekstStijl("klein", c.foreground), { lineHeight: 20 }]}>
                      {(detail as any).ai_samenvatting}
                    </Text>

                    {((detail as any).ai_risicos ?? []).length > 0 && (
                      <View style={{ marginTop: ruimte.s + 2 }}>
                        <Text style={[tekstStijl("bijschrift", c.destructive), { marginBottom: ruimte.xs }]}>
                          Belangrijkste risico's
                        </Text>
                        {((detail as any).ai_risicos as string[]).map((r, i) => (
                          <View key={i} style={{ flexDirection: "row", gap: ruimte.xs + 2, marginBottom: 3 }}>
                            <Ionicons name="warning" size={ruimte.m + 1} color={c.destructive} style={{ marginTop: 2 }} />
                            <Text style={[tekstStijl("klein", c.destructive), { flex: 1 }]}>{r}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {((detail as any).ai_maatregelen ?? []).length > 0 && (
                      <View style={{ marginTop: ruimte.s + 2 }}>
                        <Text style={[tekstStijl("bijschrift", c.success), { marginBottom: ruimte.xs }]}>
                          Maatregelen
                        </Text>
                        {((detail as any).ai_maatregelen as string[]).map((m, i) => (
                          <View key={i} style={{ flexDirection: "row", gap: ruimte.xs + 2, marginBottom: 3 }}>
                            <Ionicons name="checkmark-circle" size={ruimte.m + 1} color={c.success} style={{ marginTop: 2 }} />
                            <Text style={[tekstStijl("klein", c.success), { flex: 1 }]}>{m}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {(detail as any).ai_stoppen && (
                      <View style={{ marginTop: ruimte.s + 2, backgroundColor: c.card, padding: ruimte.s + 2, borderRadius: c.radius, borderWidth: 1, borderColor: c.destructive }}>
                        <Text style={[tekstStijl("bijschrift", c.destructive), { marginBottom: 3 }]}>
                          Wanneer direct stoppen
                        </Text>
                        <Text style={tekstStijl("klein", c.destructive)}>
                          {(detail as any).ai_stoppen}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* PDF knop */}
                {heeftPdf && (
                  <Pressable
                    onPress={() => void openPdf()}
                    disabled={pdfBezig}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      padding: 14,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: c.border,
                      backgroundColor: c.card,
                      opacity: pdfBezig ? 0.6 : 1,
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
                    {pdfBezig ? (
                      <ActivityIndicator size="small" color={c.primary} />
                    ) : (
                      <Ionicons name="open-outline" size={18} color={c.mutedForeground} />
                    )}
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
                  <View style={{ backgroundColor: mijnAfronding.geslaagd ? c.secondary : c.accent, padding: ruimte.m, borderRadius: c.radius, borderWidth: 1, borderColor: mijnAfronding.geslaagd ? c.success : c.warning }}>
                    <Text style={[tekstStijl("klein", mijnAfronding.geslaagd ? c.success : c.warning), { marginBottom: 3 }]}>
                      {mijnAfronding.geslaagd ? "Afgerond en geslaagd" : "Niet geslaagd — probeer opnieuw"}
                    </Text>
                    <Text style={tekstStijl("bijschrift", mijnAfronding.geslaagd ? c.success : c.warning)}>
                      Score: {mijnAfronding.score}/{mijnAfronding.max_score}
                      {mijnAfronding.geldig_tot && ` · Geldig t/m ${new Date(mijnAfronding.geldig_tot).toLocaleDateString("nl-NL")}`}
                    </Text>
                  </View>
                )}

                <Pressable
                  onPress={() => setSectie(heeftQuiz ? "quiz" : "bevestiging")}
                  style={{
                    backgroundColor: c.primary,
                    paddingVertical: ruimte.m + 2,
                    borderRadius: c.radius,
                    alignItems: "center",
                    marginTop: ruimte.s,
                  }}
                >
                  <Text style={tekstStijl("nadruk", c.primaryForeground)}>
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
                    padding: ruimte.m + 2,
                    borderRadius: c.radius,
                    backgroundColor: quizGeslaagd ? c.secondary : c.accent,
                    borderWidth: 1,
                    borderColor: quizGeslaagd ? c.success : c.warning,
                  }}>
                    <Text style={tekstStijl("nadruk", quizGeslaagd ? c.success : c.warning)}>
                      {quizGeslaagd ? "Quiz geslaagd" : "Quiz niet geslaagd"}
                    </Text>
                    <Text style={[tekstStijl("klein", quizGeslaagd ? c.success : c.warning), { marginTop: 3 }]}>
                      {quizAntwoorden.filter((a, i) => (detail as any).vragen?.[i]?.opties?.[a]?.correct).length} van {(detail as any).vragen?.length} vragen goed
                    </Text>
                  </View>
                )}

                {afgerond ? (
                  <View style={{ alignItems: "center", paddingVertical: ruimte.xxl, gap: ruimte.m }}>
                    <Ionicons name="checkmark-circle" size={56} color={c.success} />
                    <Text style={tekstStijl("schermtitel", c.success)}>
                      Toolbox afgerond
                    </Text>
                    <Text style={[tekstStijl("standaard", c.mutedForeground), { textAlign: "center" }]}>
                      Uw bevestiging is geregistreerd. Geldig voor {detail.geldigheid_maanden} maanden.
                    </Text>
                    <Pressable
                      onPress={sluit}
                      style={{ backgroundColor: c.primary, paddingHorizontal: ruimte.xl, paddingVertical: ruimte.m, borderRadius: c.radius, marginTop: ruimte.s }}
                    >
                      <Text style={tekstStijl("nadruk", c.primaryForeground)}>Sluiten</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <View style={{
                      backgroundColor: c.muted,
                      padding: ruimte.l,
                      borderRadius: c.radius,
                      borderWidth: 1,
                      borderColor: c.border,
                    }}>
                      <Text style={[tekstStijl("standaard", c.foreground), { lineHeight: 22, textAlign: "center" }]}>
                        "Ik, {/* naam placeholder */}heb deze toolbox gelezen en begrepen, en verklaar de veiligheidsregels toe te passen in de praktijk."
                      </Text>
                    </View>

                    <View>
                      <Text style={[tekstStijl("standaard", c.foreground), { marginBottom: ruimte.xs + 2 }]}>
                        Handtekening (volledige naam)
                      </Text>
                      <TextInput
                        value={handtekening}
                        onChangeText={setHandtekening}
                        placeholder="Uw naam als digitale handtekening"
                        style={{
                          borderWidth: 1,
                          borderColor: c.border,
                          borderRadius: c.radius,
                          padding: ruimte.m + 2,
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
                        paddingVertical: ruimte.m + 2,
                        borderRadius: c.radius,
                        alignItems: "center",
                      }}
                    >
                      {bezig ? (
                        <ActivityIndicator color={c.primaryForeground} />
                      ) : (
                        <Text style={tekstStijl("nadruk", c.primaryForeground)}>
                          Bevestigen en afronden
                        </Text>
                      )}
                    </Pressable>

                    {heeftQuiz && !quizGeslaagd && (detail.min_score ?? 0) > 0 && (
                      <Pressable onPress={() => setSectie("quiz")} style={{ alignItems: "center" }}>
                        <Text style={tekstStijl("nadruk", c.primary)}>
                          Quiz opnieuw proberen
                        </Text>
                      </Pressable>
                    )}
                  </>
                )}
              </ScrollView>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}
