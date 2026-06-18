import { useState, useCallback } from "react";
import {
  useGetMijnWeekUren,
  useCreateUrenRegistratie,
  useUpdateUrenRegistratie,
  useDeleteUrenRegistratie,
  useCreateWeekStaat,
  useWeekStaatIndienen,
  useListWeekStaten,
} from "@workspace/api-client-react";
import type { UrenRegistratie } from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

// ── Helpers ────────────────────────────────────────────────────────────────────

function isoWeekNummer(datum: Date): number {
  const d = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()));
  const dag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dag);
  const jaarStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - jaarStart.getTime()) / 86400000 + 1) / 7);
}

function weekGrenzen(jaar: number, week: number): { van: string; tot: string } {
  const jan4 = new Date(Date.UTC(jaar, 0, 4));
  const dag = jan4.getUTCDay() || 7;
  const ma = new Date(jan4);
  ma.setUTCDate(jan4.getUTCDate() - dag + 1 + (week - 1) * 7);
  const zo = new Date(ma);
  zo.setUTCDate(ma.getUTCDate() + 6);
  return {
    van: ma.toISOString().slice(0, 10),
    tot: zo.toISOString().slice(0, 10),
  };
}

function formatUren(u: number): string {
  const h = Math.floor(u);
  const m = Math.round((u - h) * 60);
  return m > 0 ? `${h}u ${m}m` : `${h}u`;
}

function dagLabel(datum: string): string {
  return new Date(datum + "T00:00:00").toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

const DAGEN = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const PROJECT_OPTIES = [
  "Brandwerende doorvoeringen",
  "Branddeuren",
  "Brandkleppen",
  "Manchetten",
  "Coating / bekleding",
  "Inspectie",
  "Herstelwerkzaamheden",
  "Montage / installatie",
  "Overig",
];

const INTERN_OPTIES = [
  "Overleg",
  "Transport materiaal",
  "Cursus / opleiding",
  "Magazijn",
  "Reistijd",
  "Kantoor",
  "Overig",
];

const PAUZE_OPTIES = [
  { label: "Geen pauze", minuten: 0 },
  { label: "15 min", minuten: 15 },
  { label: "30 min", minuten: 30 },
  { label: "45 min", minuten: 45 },
  { label: "60 min", minuten: 60 },
];

const STATUS_KLEUREN: Record<string, string> = {
  concept: "#94a3b8",
  ingediend: "#f59e0b",
  goedgekeurd: "#10b981",
  afgewezen: "#ef4444",
};

const STATUS_LABELS: Record<string, string> = {
  concept: "Concept",
  ingediend: "Ingediend",
  goedgekeurd: "Goedgekeurd",
  afgewezen: "Afgewezen",
};

// ── Tijdkiezer-rij ─────────────────────────────────────────────────────────────

function TijdKiezer({
  waarde,
  onChange,
  label,
  c,
}: {
  waarde: string;
  onChange: (t: string) => void;
  label: string;
  c: ReturnType<typeof useColors>;
}) {
  const [uur, minuten] = waarde.split(":").map(Number);

  function wijzigUur(delta: number) {
    const nieuw = Math.max(0, Math.min(23, uur + delta));
    onChange(`${String(nieuw).padStart(2, "0")}:${String(minuten).padStart(2, "0")}`);
  }
  function wijzigMin(delta: number) {
    let nieuweMin = minuten + delta;
    let nieuwUur = uur;
    if (nieuweMin >= 60) { nieuwUur = Math.min(23, nieuwUur + 1); nieuweMin -= 60; }
    if (nieuweMin < 0) { nieuwUur = Math.max(0, nieuwUur - 1); nieuweMin += 60; }
    onChange(`${String(nieuwUur).padStart(2, "0")}:${String(nieuweMin).padStart(2, "0")}`);
  }

  const knopStijl = {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.accent,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };

  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 6 }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {/* Uren */}
        <View style={{ alignItems: "center", gap: 4 }}>
          <Pressable style={knopStijl} onPress={() => wijzigUur(1)}>
            <Ionicons name="chevron-up" size={18} color={c.primary} />
          </Pressable>
          <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: c.foreground, width: 34, textAlign: "center" }}>
            {String(uur).padStart(2, "0")}
          </Text>
          <Pressable style={knopStijl} onPress={() => wijzigUur(-1)}>
            <Ionicons name="chevron-down" size={18} color={c.primary} />
          </Pressable>
        </View>
        <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: c.foreground }}>:</Text>
        {/* Minuten */}
        <View style={{ alignItems: "center", gap: 4 }}>
          <Pressable style={knopStijl} onPress={() => wijzigMin(15)}>
            <Ionicons name="chevron-up" size={18} color={c.primary} />
          </Pressable>
          <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: c.foreground, width: 34, textAlign: "center" }}>
            {String(minuten).padStart(2, "0")}
          </Text>
          <Pressable style={knopStijl} onPress={() => wijzigMin(-15)}>
            <Ionicons name="chevron-down" size={18} color={c.primary} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ── Uren-invoer modal ──────────────────────────────────────────────────────────

type PlanningItemBrief = {
  id: number;
  datum?: string | null;
  gebouw_id?: number | null;
  gebouw_naam?: string | null;
  omschrijving?: string | null;
  begin_tijd?: string | null;
  eind_tijd?: string | null;
};

type UrenFormulierProps = {
  datum: string;
  bestaand?: UrenRegistratie;
  planningItem?: PlanningItemBrief & {
    titel?: string | null;
    tijd_start?: string | null;
    tijd_eind?: string | null;
    project_naam?: string | null;
  };
  planningItemsVanWeek?: PlanningItemBrief[];
  onSluiten: () => void;
  onOpgeslagen: () => void;
};

function UrenFormulier({ datum, bestaand, planningItem, planningItemsVanWeek = [], onSluiten, onOpgeslagen }: UrenFormulierProps) {
  const c = useColors();

  // Type detectie: intern als werkzaamheden in INTERN_OPTIES staat
  const startType: "project" | "intern" =
    bestaand?.werkzaamheden && INTERN_OPTIES.includes(bestaand.werkzaamheden) ? "intern" : "project";

  // Pre-fill vanuit planning of bestaand
  const startGebouwId = bestaand?.gebouw_id ?? planningItem?.gebouw_id ?? null;
  const startProject = bestaand?.project_naam ?? planningItem?.gebouw_naam ?? planningItem?.project_naam ?? "";
  const startWerkz = bestaand?.werkzaamheden ?? "";
  const startPauze = bestaand?.pauze_minuten ?? 30;

  const [urenType, setUrenType] = useState<"project" | "intern">(startType);
  const [begin, setBegin] = useState(bestaand?.begin_tijd ?? planningItem?.tijd_start ?? planningItem?.begin_tijd ?? "07:00");
  const [eind, setEind] = useState(bestaand?.eind_tijd ?? planningItem?.tijd_eind ?? planningItem?.eind_tijd ?? "16:00");
  const [gebouwId, setGebouwId] = useState<number | null>(startGebouwId);
  const [project, setProject] = useState(startProject);
  const [vrijeInvoer, setVrijeInvoer] = useState(!startGebouwId && !!startProject);
  const [werkzaamheden, setWerkzaamheden] = useState(startWerkz);
  const [pauze, setPauze] = useState(startPauze);
  const [opmerkingen, setOpmerkingen] = useState(bestaand?.opmerkingen ?? "");
  const [toontWerkzOpties, setToontWerkzOpties] = useState(false);

  // Unieke gebouwen uit planning-items van de week
  const gebouwSuggesties = planningItemsVanWeek
    .filter((p) => p.gebouw_id && p.gebouw_naam)
    .reduce<Array<{ gebouw_id: number; gebouw_naam: string }>>((acc, p) => {
      if (!acc.some((a) => a.gebouw_id === p.gebouw_id)) {
        acc.push({ gebouw_id: p.gebouw_id!, gebouw_naam: p.gebouw_naam! });
      }
      return acc;
    }, []);

  const aanmaken = useCreateUrenRegistratie();
  const bijwerken = useUpdateUrenRegistratie();

  function berekendUren(): number {
    const [bH, bM] = begin.split(":").map(Number);
    const [eH, eM] = eind.split(":").map(Number);
    const min = (eH * 60 + eM) - (bH * 60 + bM) - pauze;
    return Math.max(0, Math.round(min * 10) / 10) / 10;
  }

  function wisselType(type: "project" | "intern") {
    setUrenType(type);
    setWerkzaamheden("");
    setToontWerkzOpties(false);
    if (type === "intern") {
      setGebouwId(null);
      setProject("");
      setVrijeInvoer(false);
    }
  }

  function selecteerGebouw(gId: number, gNaam: string) {
    setGebouwId(gId);
    setProject(gNaam);
    setVrijeInvoer(false);
  }

  function opslaan() {
    const payload = {
      datum,
      begin_tijd: begin,
      eind_tijd: eind,
      pauze_minuten: pauze,
      project_naam: urenType === "project" ? (project || null) : null,
      werkzaamheden: werkzaamheden || null,
      opmerkingen: opmerkingen || null,
      planning_item_id: planningItem?.id ?? null,
      gebouw_id: urenType === "project" ? (gebouwId ?? null) : null,
    };

    if (bestaand) {
      bijwerken.mutate({ id: bestaand.id, data: payload }, { onSuccess: onOpgeslagen });
    } else {
      aanmaken.mutate({ data: payload }, { onSuccess: onOpgeslagen });
    }
  }

  const isBusy = aanmaken.isPending || bijwerken.isPending;
  const nettoUren = berekendUren();

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Datum kop */}
        <View>
          <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>
            Datum
          </Text>
          <Text style={{ color: c.foreground, fontSize: 16, fontFamily: "Inter_700Bold", marginTop: 2 }}>
            {dagLabel(datum)}
          </Text>
        </View>

        {/* Planning-hint */}
        {planningItem && (
          <View style={{
            backgroundColor: c.primary + "15",
            borderRadius: 10,
            padding: 12,
            borderLeftWidth: 3,
            borderLeftColor: c.primary,
          }}>
            <Text style={{ color: c.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
              Gepland: {planningItem.gebouw_naam ?? planningItem.titel ?? planningItem.project_naam ?? "Taak"}
            </Text>
            {(planningItem.tijd_start ?? planningItem.begin_tijd) && (planningItem.tijd_eind ?? planningItem.eind_tijd) && (
              <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 }}>
                {planningItem.tijd_start ?? planningItem.begin_tijd} – {planningItem.tijd_eind ?? planningItem.eind_tijd}
              </Text>
            )}
          </View>
        )}

        {/* Type toggle: Project vs Intern */}
        <View>
          <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 8 }}>
            Soort uren
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["project", "intern"] as const).map((t) => (
              <Pressable
                key={t}
                onPress={() => wisselType(t)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: urenType === t ? c.primary : c.accent,
                  borderWidth: 1,
                  borderColor: urenType === t ? c.primary : c.border,
                  alignItems: "center",
                }}
              >
                <Text style={{
                  color: urenType === t ? "#fff" : c.foreground,
                  fontSize: 14,
                  fontFamily: urenType === t ? "Inter_700Bold" : "Inter_400Regular",
                }}>
                  {t === "project" ? "Project / Locatie" : "Intern"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Tijden */}
        <View style={{ flexDirection: "row", gap: 24 }}>
          <TijdKiezer waarde={begin} onChange={setBegin} label="Begintijd" c={c} />
          <TijdKiezer waarde={eind} onChange={setEind} label="Eindtijd" c={c} />
        </View>

        {/* Pauze */}
        <View>
          <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 8 }}>
            Pauze
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {PAUZE_OPTIES.map((opt) => (
              <Pressable
                key={opt.minuten}
                onPress={() => setPauze(opt.minuten)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 20,
                  backgroundColor: pauze === opt.minuten ? c.primary : c.accent,
                  borderWidth: 1,
                  borderColor: pauze === opt.minuten ? c.primary : c.border,
                }}
              >
                <Text style={{
                  color: pauze === opt.minuten ? "#fff" : c.foreground,
                  fontSize: 13,
                  fontFamily: pauze === opt.minuten ? "Inter_600SemiBold" : "Inter_400Regular",
                }}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Netto berekening */}
        <View style={{
          backgroundColor: c.accent,
          borderRadius: 10,
          padding: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular" }}>
            Netto gewerkte uren
          </Text>
          <Text style={{ color: c.primary, fontSize: 20, fontFamily: "Inter_700Bold" }}>
            {formatUren(nettoUren)}
          </Text>
        </View>

        {/* Gebouw / Project picker — alleen bij project-type */}
        {urenType === "project" && (
          <View>
            <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 8 }}>
              Gebouw / Project
            </Text>

            {/* Suggesties vanuit planning */}
            {gebouwSuggesties.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                {gebouwSuggesties.map((s) => {
                  const geselecteerd = gebouwId === s.gebouw_id;
                  return (
                    <Pressable
                      key={s.gebouw_id}
                      onPress={() => selecteerGebouw(s.gebouw_id, s.gebouw_naam)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 20,
                        backgroundColor: geselecteerd ? c.primary : c.accent,
                        borderWidth: 1,
                        borderColor: geselecteerd ? c.primary : c.border,
                        maxWidth: 220,
                      }}
                    >
                      <Text numberOfLines={1} style={{
                        color: geselecteerd ? "#fff" : c.foreground,
                        fontSize: 13,
                        fontFamily: geselecteerd ? "Inter_600SemiBold" : "Inter_400Regular",
                      }}>
                        {s.gebouw_naam}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => {
                    setVrijeInvoer(true);
                    setGebouwId(null);
                    setProject("");
                  }}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 20,
                    backgroundColor: vrijeInvoer ? c.primary : c.accent,
                    borderWidth: 1,
                    borderColor: vrijeInvoer ? c.primary : c.border,
                  }}
                >
                  <Text style={{
                    color: vrijeInvoer ? "#fff" : c.mutedForeground,
                    fontSize: 13,
                    fontFamily: vrijeInvoer ? "Inter_600SemiBold" : "Inter_400Regular",
                  }}>
                    Overig / vrij invoeren
                  </Text>
                </Pressable>
              </View>
            )}

            {/* Vrije tekstinvoer (altijd zichtbaar als geen suggesties, of bij "Vrij invoeren") */}
            {(vrijeInvoer || gebouwSuggesties.length === 0) && (
              <TextInput
                value={project}
                onChangeText={(v) => { setProject(v); setGebouwId(null); }}
                placeholder="Bijv. Domijn – Flat Eschmarke"
                placeholderTextColor={c.mutedForeground}
                style={{
                  borderWidth: 1,
                  borderColor: c.border,
                  borderRadius: 10,
                  padding: 12,
                  fontSize: 14,
                  fontFamily: "Inter_400Regular",
                  color: c.foreground,
                  backgroundColor: c.card,
                }}
              />
            )}
          </View>
        )}

        {/* Werkzaamheden */}
        <View>
          <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 8 }}>
            {urenType === "intern" ? "Soort werkzaamheden" : "Werkzaamheden"}
          </Text>

          {urenType === "intern" ? (
            /* Intern: chips */
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {INTERN_OPTIES.map((opt) => (
                <Pressable
                  key={opt}
                  onPress={() => setWerkzaamheden(werkzaamheden === opt ? "" : opt)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 20,
                    backgroundColor: werkzaamheden === opt ? c.primary : c.accent,
                    borderWidth: 1,
                    borderColor: werkzaamheden === opt ? c.primary : c.border,
                  }}
                >
                  <Text style={{
                    color: werkzaamheden === opt ? "#fff" : c.foreground,
                    fontSize: 13,
                    fontFamily: werkzaamheden === opt ? "Inter_600SemiBold" : "Inter_400Regular",
                  }}>
                    {opt}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            /* Project: dropdown */
            <>
              <Pressable
                onPress={() => setToontWerkzOpties(!toontWerkzOpties)}
                style={{
                  borderWidth: 1,
                  borderColor: c.border,
                  borderRadius: 10,
                  padding: 12,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  backgroundColor: c.card,
                }}
              >
                <Text style={{
                  fontSize: 14,
                  fontFamily: "Inter_400Regular",
                  color: werkzaamheden ? c.foreground : c.mutedForeground,
                  flex: 1,
                }}>
                  {werkzaamheden || "Kies werkzaamheden..."}
                </Text>
                <Ionicons name={toontWerkzOpties ? "chevron-up" : "chevron-down"} size={16} color={c.mutedForeground} />
              </Pressable>
              {toontWerkzOpties && (
                <View style={{
                  borderWidth: 1,
                  borderColor: c.border,
                  borderRadius: 10,
                  marginTop: 4,
                  backgroundColor: c.card,
                  overflow: "hidden",
                }}>
                  {PROJECT_OPTIES.map((opt) => (
                    <Pressable
                      key={opt}
                      onPress={() => { setWerkzaamheden(opt); setToontWerkzOpties(false); }}
                      style={{
                        padding: 12,
                        borderBottomWidth: 1,
                        borderBottomColor: c.border,
                        backgroundColor: werkzaamheden === opt ? c.primary + "15" : "transparent",
                      }}
                    >
                      <Text style={{
                        fontSize: 14,
                        fontFamily: werkzaamheden === opt ? "Inter_600SemiBold" : "Inter_400Regular",
                        color: werkzaamheden === opt ? c.primary : c.foreground,
                      }}>
                        {opt}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}
        </View>

        {/* Opmerkingen */}
        <View>
          <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 6 }}>
            Opmerkingen (optioneel)
          </Text>
          <TextInput
            value={opmerkingen}
            onChangeText={setOpmerkingen}
            placeholder="Extra toelichting..."
            placeholderTextColor={c.mutedForeground}
            multiline
            numberOfLines={3}
            style={{
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: 10,
              padding: 12,
              fontSize: 14,
              fontFamily: "Inter_400Regular",
              color: c.foreground,
              backgroundColor: c.card,
              textAlignVertical: "top",
              minHeight: 80,
            }}
          />
        </View>

        {/* Acties */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={onSluiten}
            style={{
              flex: 1,
              padding: 14,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: c.border,
              alignItems: "center",
            }}
          >
            <Text style={{ color: c.foreground, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
              Annuleren
            </Text>
          </Pressable>
          <Pressable
            onPress={opslaan}
            disabled={isBusy}
            style={{
              flex: 2,
              padding: 14,
              borderRadius: 12,
              backgroundColor: isBusy ? c.muted : c.primary,
              alignItems: "center",
            }}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" }}>
                {bestaand ? "Opslaan" : "Registreren"}
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Dag-kaart ─────────────────────────────────────────────────────────────────

function DagKaart({
  datum,
  urenLijst,
  planningLijst,
  c,
  inhoudMaxBreedte,
  onToevoegen,
  onBewerken,
  onVerwijderen,
  onPlanningBevestigen,
}: {
  datum: string;
  urenLijst: UrenRegistratie[];
  planningLijst: any[];
  c: ReturnType<typeof useColors>;
  inhoudMaxBreedte: number | undefined;
  onToevoegen: (datum: string, planning?: any) => void;
  onBewerken: (uren: UrenRegistratie) => void;
  onVerwijderen: (id: number) => void;
  onPlanningBevestigen: (planning: any) => void;
}) {
  const dagTotaal = urenLijst.reduce((acc, u) => acc + u.netto_uren, 0);
  const dagLabel_ = dagLabel(datum);
  const vandaag = new Date().toISOString().slice(0, 10) === datum;

  return (
    <View style={{
      width: "100%",
      maxWidth: inhoudMaxBreedte,
      alignSelf: "center",
      backgroundColor: c.card,
      borderRadius: c.radius,
      borderWidth: vandaag ? 2 : 1,
      borderColor: vandaag ? c.primary : c.border,
      overflow: "hidden",
      marginBottom: 10,
    }}>
      {/* Dag-header */}
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: vandaag ? c.primary + "12" : "transparent",
        borderBottomWidth: 1,
        borderBottomColor: c.border,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {vandaag && (
            <View style={{
              backgroundColor: c.primary,
              borderRadius: 4,
              paddingHorizontal: 6,
              paddingVertical: 2,
            }}>
              <Text style={{ color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" }}>VANDAAG</Text>
            </View>
          )}
          <Text style={{
            color: c.foreground,
            fontSize: 14,
            fontFamily: "Inter_600SemiBold",
            textTransform: "capitalize",
          }}>
            {dagLabel_}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {dagTotaal > 0 && (
            <Text style={{ color: c.primary, fontSize: 13, fontFamily: "Inter_700Bold" }}>
              {formatUren(dagTotaal)}
            </Text>
          )}
          <Pressable
            onPress={() => onToevoegen(datum)}
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: c.primary + "20",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="add" size={18} color={c.primary} />
          </Pressable>
        </View>
      </View>

      {/* Planning-suggesties (niet-bevestigde planning) */}
      {planningLijst.map((p) => {
        const bevestigd = urenLijst.some((u) => u.planning_item_id === p.id);
        if (bevestigd) return null;
        return (
          <Pressable
            key={`plan-${p.id}`}
            onPress={() => onPlanningBevestigen(p)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: c.border,
              backgroundColor: c.primary + "08",
            }}
          >
            <Ionicons name="calendar-outline" size={16} color={c.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_500Medium" }} numberOfLines={1}>
                {p.gebouw_naam ?? p.titel ?? p.project_naam ?? p.omschrijving ?? "Geplande taak"}
              </Text>
              {(p.begin_tijd ?? p.tijd_start) && (p.eind_tijd ?? p.tijd_eind) && (
                <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>
                  {p.begin_tijd ?? p.tijd_start} – {p.eind_tijd ?? p.tijd_eind}
                </Text>
              )}
            </View>
            <View style={{
              backgroundColor: c.primary,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 5,
            }}>
              <Text style={{ color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                Bevestigen
              </Text>
            </View>
          </Pressable>
        );
      })}

      {/* Geregistreerde uren */}
      {urenLijst.map((u) => (
        <Pressable
          key={u.id}
          onLongPress={() => Alert.alert("Verwijderen", `Uren verwijderen voor ${dagLabel_}?`, [
            { text: "Annuleren", style: "cancel" },
            { text: "Verwijderen", style: "destructive", onPress: () => onVerwijderen(u.id) },
          ])}
          onPress={() => onBewerken(u)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: c.border,
          }}
        >
          <View style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: STATUS_KLEUREN[u.status] ?? "#94a3b8",
          }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_500Medium" }} numberOfLines={1}>
              {u.gebouw_naam ?? u.project_naam ?? "Project"}
            </Text>
            <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>
              {u.begin_tijd} – {u.eind_tijd}
              {u.werkzaamheden ? ` · ${u.werkzaamheden}` : ""}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: c.primary, fontSize: 13, fontFamily: "Inter_700Bold" }}>
              {formatUren(u.netto_uren)}
            </Text>
            <Text style={{ color: STATUS_KLEUREN[u.status] ?? c.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular" }}>
              {STATUS_LABELS[u.status] ?? u.status}
            </Text>
          </View>
        </Pressable>
      ))}

      {urenLijst.length === 0 && planningLijst.length === 0 && (
        <Pressable
          onPress={() => onToevoegen(datum)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingVertical: 14,
          }}
        >
          <Ionicons name="add-circle-outline" size={18} color={c.mutedForeground} />
          <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular" }}>
            Uren toevoegen
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Hoofd-scherm ──────────────────────────────────────────────────────────────

export default function UrenScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { inhoudMaxBreedte } = useResponsive();

  const nu = new Date();
  const [jaar, setJaar] = useState(nu.getFullYear());
  const [week, setWeek] = useState(isoWeekNummer(nu));
  const [modalDatum, setModalDatum] = useState<string | null>(null);
  const [bewerkenUren, setBewerkenUren] = useState<UrenRegistratie | null>(null);
  const [planningBevestigen, setPlanningBevestigen] = useState<any>(null);

  const { data, isLoading, refetch } = useGetMijnWeekUren({ jaar, week } as Parameters<typeof useGetMijnWeekUren>[0]);
  const verwijderen = useDeleteUrenRegistratie();
  const weekStaatAanmaken = useCreateWeekStaat();
  const weekStaatIndienen = useWeekStaatIndienen();

  const { data: weekstatenData = [] } = useListWeekStaten({ jaar, week } as Parameters<typeof useListWeekStaten>[0]);
  const huidigWeekstaat = weekstatenData[0];

  if (!token) return <Redirect href="/login" />;

  const totaalUren = data?.totaal_uren ?? 0;
  const advUren = data?.adv_uren ?? 0;

  const { van, tot } = weekGrenzen(jaar, week);
  const maxWeek = isoWeekNummer(new Date(jaar, 11, 28));

  function vorigeWeek() {
    if (week <= 1) { setJaar((j) => j - 1); setWeek(isoWeekNummer(new Date(jaar - 1, 11, 28))); }
    else setWeek((w) => w - 1);
  }
  function volgendeWeek() {
    if (week >= maxWeek) { setJaar((j) => j + 1); setWeek(1); }
    else setWeek((w) => w + 1);
  }

  function handleVerwijderen(id: number) {
    verwijderen.mutate({ id }, { onSuccess: () => refetch() });
  }

  function handleIndienen() {
    // Weekstaat aanmaken als die nog niet bestaat, dan indienen
    if (!huidigWeekstaat) {
      weekStaatAanmaken.mutate(
        { data: { jaar, week_nummer: week } },
        {
          onSuccess: (ws) => {
            weekStaatIndienen.mutate({ id: ws.id }, { onSuccess: () => refetch() });
          },
        }
      );
    } else if (huidigWeekstaat.status === "concept" || huidigWeekstaat.status === "afgewezen") {
      weekStaatIndienen.mutate({ id: huidigWeekstaat.id }, { onSuccess: () => refetch() });
    }
  }

  const dagen = Array.from({ length: 7 }, (_, i) => {
    const ma = new Date(van + "T00:00:00");
    const dag = new Date(ma);
    dag.setDate(ma.getDate() + i);
    return dag.toISOString().slice(0, 10);
  });

  const urenPerDag = (datum: string): UrenRegistratie[] =>
    (data?.uren ?? []).filter((u) => u.datum === datum);

  const planningPerDag = (datum: string) =>
    (data?.planning_items ?? []).filter((p: any) => p.datum === datum);

  const kanIndienen =
    totaalUren > 0 &&
    (!huidigWeekstaat || huidigWeekstaat.status === "concept" || huidigWeekstaat.status === "afgewezen");

  const modalOpen = modalDatum !== null || bewerkenUren !== null || planningBevestigen !== null;
  const activeDatum = modalDatum ?? bewerkenUren?.datum ?? planningBevestigen?.datum;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View style={{
        backgroundColor: c.dark,
        paddingTop: bovenInset(insets) + 12,
        paddingHorizontal: 20,
        paddingBottom: 18,
      }}>
        <View style={{ width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
          <Pressable onPress={() => router.back()} style={{ marginBottom: 10 }}>
            <Text style={{ color: c.primary, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>
              ‹ Terug
            </Text>
          </Pressable>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: c.darkForeground, fontSize: 22, fontFamily: "Inter_700Bold" }}>
              Urenregistratie
            </Text>
            {huidigWeekstaat && (
              <View style={{
                backgroundColor: STATUS_KLEUREN[huidigWeekstaat.status] + "30",
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}>
                <Text style={{
                  color: STATUS_KLEUREN[huidigWeekstaat.status],
                  fontSize: 12,
                  fontFamily: "Inter_600SemiBold",
                }}>
                  {STATUS_LABELS[huidigWeekstaat.status]}
                </Text>
              </View>
            )}
          </View>

          {/* Week-navigator */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
            <Pressable onPress={vorigeWeek} style={{ padding: 6 }}>
              <Ionicons name="chevron-back" size={20} color={c.primary} />
            </Pressable>
            <Text style={{ color: c.darkMuted, fontSize: 13, fontFamily: "Inter_500Medium" }}>
              Week {week} · {new Date(van + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" })} – {new Date(tot + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}
            </Text>
            <Pressable onPress={volgendeWeek} style={{ padding: 6 }}>
              <Ionicons name="chevron-forward" size={20} color={c.primary} />
            </Pressable>
          </View>

          {/* Totalen */}
          <View style={{ flexDirection: "row", gap: 16, marginTop: 12 }}>
            <View>
              <Text style={{ color: c.darkMuted, fontSize: 11, fontFamily: "Inter_400Regular" }}>Gewerkt</Text>
              <Text style={{ color: c.darkForeground, fontSize: 20, fontFamily: "Inter_700Bold" }}>
                {formatUren(totaalUren)}
              </Text>
            </View>
            {advUren > 0 && (
              <View>
                <Text style={{ color: c.darkMuted, fontSize: 11, fontFamily: "Inter_400Regular" }}>ADV opgebouwd</Text>
                <Text style={{ color: c.primary, fontSize: 20, fontFamily: "Inter_700Bold" }}>
                  {formatUren(advUren)}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Dag-lijst */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : (
        <FlatList
          data={dagen}
          keyExtractor={(d) => d}
          contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 100 }}
          renderItem={({ item: datum }) => (
            <DagKaart
              datum={datum}
              urenLijst={urenPerDag(datum)}
              planningLijst={planningPerDag(datum)}
              c={c}
              inhoudMaxBreedte={inhoudMaxBreedte}
              onToevoegen={(d) => setModalDatum(d)}
              onBewerken={(u) => setBewerkenUren(u)}
              onVerwijderen={handleVerwijderen}
              onPlanningBevestigen={(p) => setPlanningBevestigen(p)}
            />
          )}
        />
      )}

      {/* Indienen-knop */}
      {kanIndienen && (
        <View style={{
          position: "absolute",
          bottom: insets.bottom + 16,
          left: 20,
          right: 20,
        }}>
          <Pressable
            onPress={handleIndienen}
            disabled={weekStaatAanmaken.isPending || weekStaatIndienen.isPending}
            style={{
              backgroundColor: c.primary,
              borderRadius: 14,
              padding: 16,
              alignItems: "center",
              shadowColor: "#000",
              shadowOpacity: 0.15,
              shadowRadius: 8,
              elevation: 4,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" }}>
              Week indienen ter goedkeuring
            </Text>
          </Pressable>
        </View>
      )}

      {/* Invoer-modal */}
      <Modal
        visible={modalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setModalDatum(null);
          setBewerkenUren(null);
          setPlanningBevestigen(null);
        }}
      >
        <View style={{ flex: 1, backgroundColor: c.background }}>
          {/* Modal header */}
          <View style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 16,
            paddingTop: 20,
            borderBottomWidth: 1,
            borderBottomColor: c.border,
          }}>
            <Text style={{ color: c.foreground, fontSize: 17, fontFamily: "Inter_700Bold" }}>
              {bewerkenUren ? "Uren bewerken" : "Uren registreren"}
            </Text>
            <Pressable onPress={() => {
              setModalDatum(null);
              setBewerkenUren(null);
              setPlanningBevestigen(null);
            }}>
              <Ionicons name="close" size={24} color={c.foreground} />
            </Pressable>
          </View>

          {activeDatum && (
            <UrenFormulier
              datum={activeDatum}
              bestaand={bewerkenUren ?? undefined}
              planningItem={planningBevestigen ?? undefined}
              planningItemsVanWeek={data?.planning_items ?? []}
              onSluiten={() => {
                setModalDatum(null);
                setBewerkenUren(null);
                setPlanningBevestigen(null);
              }}
              onOpgeslagen={() => {
                setModalDatum(null);
                setBewerkenUren(null);
                setPlanningBevestigen(null);
                refetch();
              }}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}
