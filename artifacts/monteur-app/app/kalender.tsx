// KALENDER_01 — Maandkalender voor de monteur.
// Toont per maand de items uit GET /kalender (feestdagen, collectieve vrije
// dagen, eigen verlof, keuringen, verjaardagen en afspraken). De server scoopt
// de inhoud al op rechten; de app filtert dus niets. Een tik op een dag toont
// de items van die dag in een lijst onder de kalender.

import {
  useGetKalender,
  getGetKalenderQueryKey,
  type KalenderItem,
  type KalenderItemSoort,
} from "@workspace/api-client-react";
import { Redirect, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ruimte } from "@workspace/ontwerp";

import { Kaart, Ladenstaat, LijstFout, bovenInset, onderInset, tekstStijl } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

// ─── Soort-labels en -kleuren ──────────────────────────────────────────────────
const SOORT_LABELS: Record<KalenderItemSoort, string> = {
  feestdag: "Feestdag",
  collectief: "Collectieve vrije dag",
  vakantie: "Verlof",
  keuring: "Keuring",
  verjaardag: "Verjaardag",
  afspraak: "Afspraak",
};

// De zes soorten hadden elk een eigen kleur. Het palet (@workspace/ontwerp)
// kent geen paars/blauw/roze/cyaan; de soorten worden daarom afgebeeld op de
// dichtstbijzijnde tokens. Zie eindrapport voor deze afweging.
function soortKleuren(c: ReturnType<typeof useColors>): Record<KalenderItemSoort, string> {
  return {
    feestdag: c.accentForeground,
    collectief: c.primary,
    vakantie: c.success,
    keuring: c.warning,
    verjaardag: c.destructive,
    afspraak: c.mutedForeground,
  };
}

// Vaste volgorde voor legenda en stippen.
const SOORT_VOLGORDE: KalenderItemSoort[] = [
  "feestdag",
  "collectief",
  "vakantie",
  "keuring",
  "verjaardag",
  "afspraak",
];

const WEEKDAGEN = ["ma", "di", "wo", "do", "vr", "za", "zo"];

// ─── Datum-helpers ──────────────────────────────────────────────────────────
/** jjjj-mm-dd voor een jaar/maand(0-based)/dag zonder tijdzone-drift. */
function datumSleutel(jaar: number, maand: number, dag: number): string {
  const mm = String(maand + 1).padStart(2, "0");
  const dd = String(dag).padStart(2, "0");
  return `${jaar}-${mm}-${dd}`;
}

/** Aantal dagen in een maand (0-based maand). */
function dagenInMaand(jaar: number, maand: number): number {
  return new Date(jaar, maand + 1, 0).getDate();
}

/** Index (0=ma … 6=zo) van de eerste dag van de maand. */
function eersteWeekdagIndex(jaar: number, maand: number): number {
  const js = new Date(jaar, maand, 1).getDay(); // 0=zo … 6=za
  return (js + 6) % 7; // naar ma=0
}

export default function KalenderScherm() {
  const c = useColors();
  const SOORT_KLEUREN = soortKleuren(c);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { inhoudMaxBreedte } = useResponsive();

  const nu = new Date();
  const [jaar, setJaar] = useState(nu.getFullYear());
  const [maand, setMaand] = useState(nu.getMonth()); // 0-based
  const [gekozenDag, setGekozenDag] = useState<string | null>(null);

  // Haal de kalender per jaar op; bij jaarwissel volgt de query automatisch mee.
  const { data, isLoading, isError, isRefetching, refetch } = useGetKalender(
    { jaar },
    { query: { enabled: !!token, queryKey: getGetKalenderQueryKey({ jaar }) } },
  );

  // Items groeperen per datum voor snelle opzoeking.
  const itemsPerDag = useMemo(() => {
    const kaart = new Map<string, KalenderItem[]>();
    for (const item of data?.items ?? []) {
      const lijst = kaart.get(item.datum);
      if (lijst) lijst.push(item);
      else kaart.set(item.datum, [item]);
    }
    return kaart;
  }, [data]);

  const maandTitel = useMemo(
    () =>
      new Date(jaar, maand, 1).toLocaleDateString("nl-NL", {
        month: "long",
        year: "numeric",
      }),
    [jaar, maand],
  );

  function vorigeMaand() {
    setGekozenDag(null);
    if (maand === 0) {
      setMaand(11);
      setJaar((j) => j - 1);
    } else {
      setMaand((m) => m - 1);
    }
  }

  function volgendeMaand() {
    setGekozenDag(null);
    if (maand === 11) {
      setMaand(0);
      setJaar((j) => j + 1);
    } else {
      setMaand((m) => m + 1);
    }
  }

  // Rooster opbouwen: lege cellen vóór de eerste dag, dan de dagen.
  const cellen = useMemo(() => {
    const offset = eersteWeekdagIndex(jaar, maand);
    const totaal = dagenInMaand(jaar, maand);
    const lijst: (number | null)[] = [];
    for (let i = 0; i < offset; i++) lijst.push(null);
    for (let d = 1; d <= totaal; d++) lijst.push(d);
    // Aanvullen tot een veelvoud van 7 zodat het raster netjes uitlijnt.
    while (lijst.length % 7 !== 0) lijst.push(null);
    return lijst;
  }, [jaar, maand]);

  const vandaagSleutel = datumSleutel(nu.getFullYear(), nu.getMonth(), nu.getDate());

  const gekozenItems = gekozenDag ? (itemsPerDag.get(gekozenDag) ?? []) : [];

  if (!token) return <Redirect href="/login" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Kopbalk */}
      <View
        style={{
          backgroundColor: c.dark,
          paddingTop: bovenInset(insets) + ruimte.m,
          paddingHorizontal: ruimte.xl,
          paddingBottom: ruimte.l + 2,
        }}
      >
        <View style={{ width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
          <Pressable onPress={() => router.back()} style={{ marginBottom: ruimte.s + 2 }}>
            <Text style={tekstStijl("nadruk", c.primary)}>
              ‹ Terug
            </Text>
          </Pressable>
          <Text style={tekstStijl("schermtitel", c.darkForeground)}>
            Kalender
          </Text>
          <Text style={[tekstStijl("standaard", c.darkMuted), { marginTop: ruimte.xs }]}>
            Feestdagen, verlof, keuringen en afspraken
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, padding: ruimte.l, width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
          <Ladenstaat regels={6} />
        </View>
      ) : isError ? (
        <LijstFout
          beschrijving="De kalender kon niet worden geladen. Controleer je verbinding en probeer het opnieuw."
          onOpnieuw={() => refetch()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            gap: 14,
            paddingBottom: onderInset(insets) + 24,
            width: "100%",
            maxWidth: inhoudMaxBreedte,
            alignSelf: "center",
          }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.primary} />
          }
        >
          {/* Maandnavigatie */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Pressable
              onPress={vorigeMaand}
              accessibilityLabel="Vorige maand"
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                borderRadius: c.radius,
                backgroundColor: c.card,
                borderWidth: 1,
                borderColor: c.border,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ color: c.foreground, fontSize: 22, fontFamily: "Inter_600SemiBold" }}>
                ‹
              </Text>
            </Pressable>
            <Text
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: 18,
                color: c.foreground,
                fontFamily: "Inter_700Bold",
                textTransform: "capitalize",
              }}
            >
              {maandTitel}
            </Text>
            <Pressable
              onPress={volgendeMaand}
              accessibilityLabel="Volgende maand"
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                borderRadius: c.radius,
                backgroundColor: c.card,
                borderWidth: 1,
                borderColor: c.border,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ color: c.foreground, fontSize: 22, fontFamily: "Inter_600SemiBold" }}>
                ›
              </Text>
            </Pressable>
          </View>

          {/* Kalenderraster */}
          <View
            style={{
              backgroundColor: c.card,
              borderRadius: c.radius,
              borderWidth: 1,
              borderColor: c.border,
              padding: 10,
            }}
          >
            {/* Weekdagkoppen */}
            <View style={{ flexDirection: "row" }}>
              {WEEKDAGEN.map((wd) => (
                <View key={wd} style={{ flex: 1, alignItems: "center", paddingVertical: 6 }}>
                  <Text
                    style={{
                      fontSize: 12,
                      color: c.mutedForeground,
                      fontFamily: "Inter_600SemiBold",
                      textTransform: "capitalize",
                    }}
                  >
                    {wd}
                  </Text>
                </View>
              ))}
            </View>

            {/* Dagcellen */}
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {cellen.map((dag, index) => {
                if (dag === null) {
                  return <View key={`leeg-${index}`} style={{ width: `${100 / 7}%`, height: 52 }} />;
                }
                const sleutel = datumSleutel(jaar, maand, dag);
                const dagItems = itemsPerDag.get(sleutel) ?? [];
                const isVandaag = sleutel === vandaagSleutel;
                const isGekozen = sleutel === gekozenDag;
                // Unieke soorten voor de stippen, in vaste volgorde.
                const soorten = SOORT_VOLGORDE.filter((s) =>
                  dagItems.some((i) => i.soort === s),
                );
                return (
                  <Pressable
                    key={sleutel}
                    onPress={() => setGekozenDag(isGekozen ? null : sleutel)}
                    style={{ width: `${100 / 7}%`, height: 52, padding: 2 }}
                  >
                    <View
                      style={{
                        flex: 1,
                        borderRadius: 10,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: isGekozen
                          ? c.primary
                          : isVandaag
                            ? c.accent
                            : "transparent",
                        borderWidth: isVandaag && !isGekozen ? 1 : 0,
                        borderColor: c.primary,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 15,
                          color: isGekozen ? c.primaryForeground : c.foreground,
                          fontFamily: isVandaag ? "Inter_700Bold" : "Inter_400Regular",
                        }}
                      >
                        {dag}
                      </Text>
                      {/* Kleurstippen per soort */}
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 2,
                          marginTop: 3,
                          height: 6,
                          alignItems: "center",
                        }}
                      >
                        {soorten.slice(0, 4).map((s) => (
                          <View
                            key={s}
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: 3,
                              backgroundColor: isGekozen ? c.primaryForeground : SOORT_KLEUREN[s],
                            }}
                          />
                        ))}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Legenda */}
          <View
            style={{
              backgroundColor: c.card,
              borderRadius: c.radius,
              borderWidth: 1,
              borderColor: c.border,
              padding: 14,
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            {SOORT_VOLGORDE.map((s) => (
              <View key={s} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: SOORT_KLEUREN[s],
                  }}
                />
                <Text style={{ fontSize: 13, color: c.foreground, fontFamily: "Inter_500Medium" }}>
                  {SOORT_LABELS[s]}
                </Text>
              </View>
            ))}
          </View>

          {/* Items van de gekozen dag */}
          {gekozenDag ? (
            <View style={{ gap: 10 }}>
              <Text
                style={{
                  fontSize: 16,
                  color: c.foreground,
                  fontFamily: "Inter_700Bold",
                  textTransform: "capitalize",
                }}
              >
                {new Date(gekozenDag + "T00:00:00").toLocaleDateString("nl-NL", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </Text>

              {gekozenItems.length === 0 ? (
                <Kaart stijl={{ padding: ruimte.l + 2, alignItems: "center" }}>
                  <Text style={tekstStijl("standaard", c.mutedForeground)}>
                    Geen items op deze dag.
                  </Text>
                </Kaart>
              ) : (
                gekozenItems.map((item, i) => (
                  <Kaart
                    key={`${item.bron}-${i}`}
                    stijl={{ padding: ruimte.m + 2, gap: ruimte.s }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <Text
                        style={{
                          flex: 1,
                          fontSize: 15,
                          color: c.foreground,
                          fontFamily: "Inter_600SemiBold",
                        }}
                      >
                        {item.titel}
                      </Text>
                      <View
                        style={{
                          flexShrink: 0,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: ruimte.xs + 2,
                          paddingHorizontal: ruimte.s + 2,
                          paddingVertical: ruimte.xs,
                          borderRadius: c.radius,
                          backgroundColor: c.secondary,
                        }}
                      >
                        <View style={{ width: ruimte.s, height: ruimte.s, borderRadius: ruimte.xs, backgroundColor: SOORT_KLEUREN[item.soort] }} />
                        <Text
                          style={{
                            fontSize: 11,
                            color: c.foreground,
                            fontFamily: "Inter_600SemiBold",
                          }}
                        >
                          {SOORT_LABELS[item.soort]}
                        </Text>
                      </View>
                    </View>
                    {item.omschrijving ? (
                      <Text style={{ fontSize: 14, color: c.mutedForeground, fontFamily: "Inter_400Regular" }}>
                        {item.omschrijving}
                      </Text>
                    ) : null}
                  </View>
                ))
              )}
            </View>
          ) : (
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
              <Text
                style={{
                  fontSize: 14,
                  color: c.mutedForeground,
                  fontFamily: "Inter_400Regular",
                  textAlign: "center",
                }}
              >
                Tik op een dag om de items van die dag te bekijken.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
