// Opdracht-detail (BOUW_01 §3) — werkbegroting + inkoop in tabs.
// De SERVER bepaalt of bedragen zichtbaar zijn: bij bevoegdheid projecten=1
// stript de server de bedragvelden (null). De app toont null-bedragen NIET.
import {
  useGetOpdracht,
  useGetWerkbegroting,
  useGetInkoopplanning,
  type Opdracht,
  type Werkbegroting,
  type WerkbegrotingRegel,
  type Inkoopplanning,
  type InkoopplanRegel,
} from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ruimte } from "@workspace/ontwerp";

import { Ladenstaat, LijstFout, Statusmerk, tekstStijl, bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

const euroFmt = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
function euro(v?: number | null): string | null {
  if (v == null) return null;
  return euroFmt.format(v);
}

type Tab = "werkbegroting" | "inkoop";

export default function OpdrachtDetail() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { inhoudMaxBreedte } = useResponsive();
  const { id } = useLocalSearchParams<{ id: string }>();
  const opdrachtId = Number(id);

  const [tab, setTab] = useState<Tab>("werkbegroting");

  const { data: opdracht } = useGetOpdracht(opdrachtId, {
    query: { enabled: !!token && !Number.isNaN(opdrachtId) },
  } as any);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={{
          backgroundColor: c.dark,
          paddingTop: bovenInset(insets) + ruimte.m,
          paddingHorizontal: ruimte.xl,
          paddingBottom: ruimte.l,
        }}
      >
        <View style={{ width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
          <Pressable onPress={() => router.back()} style={{ marginBottom: ruimte.s }}>
            <Text style={tekstStijl("nadruk", c.primary)}>
              ‹ Terug
            </Text>
          </Pressable>
          <Text style={[tekstStijl("klein", c.darkMuted), { fontFamily: "Inter_600SemiBold" }]}>
            {(opdracht as Opdracht | undefined)?.werknummer ?? `#${opdrachtId}`}
          </Text>
          <Text style={[tekstStijl("schermtitel", c.darkForeground), { marginTop: ruimte.xs / 2 }]}>
            {(opdracht as Opdracht | undefined)?.titel ?? "Opdracht"}
          </Text>
          {(opdracht as Opdracht | undefined)?.gebouw_naam ? (
            <Text style={[tekstStijl("klein", c.darkMuted), { marginTop: ruimte.xs }]}>
              {[(opdracht as Opdracht).gebouw_naam, (opdracht as Opdracht).gebouw_stad].filter(Boolean).join(", ")}
            </Text>
          ) : null}

          {/* Meer-/minderwerk melden */}
          <Pressable
            onPress={() => router.push(`/projecten/${opdrachtId}/meerwerk`)}
            style={({ pressed }) => ({
              marginTop: ruimte.m + 2,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: ruimte.s,
              backgroundColor: pressed ? c.primary + "E6" : c.primary,
              borderRadius: c.radius / 2,
              paddingVertical: ruimte.m,
            })}
          >
            <Ionicons name="git-compare-outline" size={16} color={c.primaryForeground} />
            <Text style={[tekstStijl("standaard", c.primaryForeground), { fontFamily: "Inter_600SemiBold" }]}>
              Meer-/minderwerk melden
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Tabs */}
      <View
        style={{
          flexDirection: "row",
          backgroundColor: c.card,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
        }}
      >
        {(["werkbegroting", "inkoop"] as Tab[]).map((t) => {
          const actief = tab === t;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={{
                flex: 1,
                paddingVertical: ruimte.m + 2,
                alignItems: "center",
                borderBottomWidth: 2,
                borderBottomColor: actief ? c.primary : "transparent",
              }}
            >
              <Text
                style={[
                  tekstStijl("standaard", actief ? c.primary : c.mutedForeground),
                  { fontFamily: actief ? "Inter_700Bold" : "Inter_400Regular" },
                ]}
              >
                {t === "werkbegroting" ? "Werkbegroting" : "Inkoop"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === "werkbegroting" ? (
        <WerkbegrotingWeergave opdrachtId={opdrachtId} enabled={!!token} />
      ) : (
        <InkoopWeergave opdrachtId={opdrachtId} enabled={!!token} />
      )}
    </View>
  );
}

// ── Werkbegroting ──────────────────────────────────────────────────────────
function WerkbegrotingWeergave({ opdrachtId, enabled }: { opdrachtId: number; enabled: boolean }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { inhoudMaxBreedte } = useResponsive();
  const { data, isLoading, isError, refetch } = useGetWerkbegroting(opdrachtId, {
    query: { enabled: enabled && !Number.isNaN(opdrachtId) },
  } as any);

  if (isLoading) {
    return (
      <View style={{ padding: ruimte.l }}>
        <Ladenstaat regels={5} />
      </View>
    );
  }
  if (isError) {
    return (
      <LijstFout
        beschrijving="De werkbegroting kon niet worden geladen. Controleer je verbinding en probeer het opnieuw."
        onOpnieuw={() => refetch()}
      />
    );
  }

  const wb = data as Werkbegroting | undefined;
  const regels = wb?.regels ?? [];

  // Server bepaalt zichtbaarheid: als geen enkele regel een tarief/totaal heeft
  // (en het totaal-materiaalbedrag null is), tonen we alleen hoeveelheden.
  const toonBedragen =
    (wb?.totaal_materiaal_bedrag != null) ||
    regels.some((r) => r.tarief != null || r.totaal != null);

  // Groeperen per hoofdstuk (met behoud van volgorde).
  const hoofdstukken: { naam: string; regels: WerkbegrotingRegel[] }[] = [];
  for (const r of regels) {
    const naam = r.hoofdstuk || "Overig";
    let groep = hoofdstukken.find((h) => h.naam === naam);
    if (!groep) {
      groep = { naam, regels: [] };
      hoofdstukken.push(groep);
    }
    groep.regels.push(r);
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        padding: ruimte.l,
        gap: ruimte.m + 2,
        paddingBottom: insets.bottom + ruimte.xl,
        width: "100%",
        maxWidth: inhoudMaxBreedte,
        alignSelf: "center",
      }}
    >
      {wb ? (
        <View style={{ backgroundColor: c.card, borderRadius: c.radius, borderWidth: 1, borderColor: c.border, padding: ruimte.m + 2, gap: ruimte.xs }}>
          <RegelRij label="Begrote uren" waarde={`${wb.totaal_arbeid_uren} uur`} />
          {toonBedragen && wb.totaal_materiaal_bedrag != null ? (
            <RegelRij label="Materiaalbedrag" waarde={euro(wb.totaal_materiaal_bedrag)!} />
          ) : null}
        </View>
      ) : null}

      {hoofdstukken.length === 0 ? (
        <Text style={[tekstStijl("standaard", c.mutedForeground), { textAlign: "center", marginTop: ruimte.xxl }]}>
          Deze werkbegroting heeft nog geen regels.
        </Text>
      ) : (
        hoofdstukken.map((h) => (
          <View key={h.naam} style={{ gap: ruimte.s }}>
            <Text
              style={[
                tekstStijl("klein", c.mutedForeground),
                {
                  fontFamily: "Inter_700Bold",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                },
              ]}
            >
              {h.naam}
            </Text>
            {h.regels.map((r) => (
              <View
                key={r.id}
                style={{ backgroundColor: c.card, borderRadius: c.radius, borderWidth: 1, borderColor: c.border, padding: ruimte.m + 2, gap: ruimte.xs + 2 }}
              >
                <Text style={[tekstStijl("nadruk", c.foreground), { fontFamily: "Inter_600SemiBold" }]}>
                  {r.omschrijving}
                </Text>
                <RegelRij label="Hoeveelheid" waarde={`${r.hoeveelheid} ${r.eenheid}`} />
                {toonBedragen && r.tarief != null ? <RegelRij label="Tarief" waarde={euro(r.tarief)!} /> : null}
                {toonBedragen && r.totaal != null ? <RegelRij label="Totaal" waarde={euro(r.totaal)!} /> : null}
              </View>
            ))}
          </View>
        ))
      )}
    </ScrollView>
  );
}

// ── Inkoop ───────────────────────────────────────────────────────────────
function InkoopWeergave({ opdrachtId, enabled }: { opdrachtId: number; enabled: boolean }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { inhoudMaxBreedte } = useResponsive();
  const { data, isLoading, isError, refetch } = useGetInkoopplanning(opdrachtId, {
    query: { enabled: enabled && !Number.isNaN(opdrachtId) },
  } as any);

  if (isLoading) {
    return (
      <View style={{ padding: ruimte.l }}>
        <Ladenstaat regels={5} />
      </View>
    );
  }
  if (isError) {
    return (
      <LijstFout
        beschrijving="De inkoopplanning kon niet worden geladen. Controleer je verbinding en probeer het opnieuw."
        onOpnieuw={() => refetch()}
      />
    );
  }

  const plan = data as Inkoopplanning | undefined;
  const regels: InkoopplanRegel[] = plan?.regels ?? [];

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        padding: ruimte.l,
        gap: ruimte.m,
        paddingBottom: insets.bottom + ruimte.xl,
        width: "100%",
        maxWidth: inhoudMaxBreedte,
        alignSelf: "center",
      }}
    >
      {regels.length === 0 ? (
        <Text style={[tekstStijl("standaard", c.mutedForeground), { textAlign: "center", marginTop: ruimte.xxl }]}>
          Er is nog geen inkoopplanning.
        </Text>
      ) : (
        regels.map((r) => (
          <View
            key={r.id}
            style={{ backgroundColor: c.card, borderRadius: c.radius, borderWidth: 1, borderColor: c.border, padding: ruimte.m + 2, gap: ruimte.xs + 2 }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: ruimte.s }}>
              <Text style={[tekstStijl("nadruk", c.foreground), { fontFamily: "Inter_600SemiBold", flex: 1 }]}>
                {r.omschrijving}
              </Text>
              <Statusmerk label={r.status} soort="neutraal" />
            </View>

            <RegelRij label="Hoeveelheid" waarde={`${r.hoeveelheid} ${r.eenheid}`} />
            {r.leverancier ? <RegelRij label="Leverancier" waarde={r.leverancier} /> : null}
            {r.levertijd_weken != null ? (
              <RegelRij label="Levertijd" waarde={`${r.levertijd_weken} ${r.levertijd_weken === 1 ? "week" : "weken"}`} />
            ) : null}
            {/* gewenste_leverdatum ALTIJD tonen (ook in de weergave zonder bedragen) */}
            <RegelRij label="Gewenste leverdatum" waarde={r.gewenste_leverdatum ? datum(r.gewenste_leverdatum) : "—"} />
            {r.besteldatum ? <RegelRij label="Besteld op" waarde={datum(r.besteldatum)} /> : null}

            {/* Bedragvelden alleen tonen als niet-null (server stript ze bij niveau 1) */}
            {r.calc_prijs != null ? <RegelRij label="Calc. prijs" waarde={euro(r.calc_prijs)!} /> : null}
            {r.inkoopprijs != null ? <RegelRij label="Inkoopprijs" waarde={euro(r.inkoopprijs)!} /> : null}
            {r.besparing != null ? <RegelRij label="Besparing" waarde={euro(r.besparing)!} /> : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

function datum(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

function RegelRij({ label, waarde }: { label: string; waarde: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: ruimte.s }}>
      <Text style={tekstStijl("klein", c.mutedForeground)}>{label}</Text>
      <Text style={[tekstStijl("standaard", c.foreground), { fontFamily: "Inter_600SemiBold", textAlign: "right", flexShrink: 1 }]}>
        {waarde}
      </Text>
    </View>
  );
}
