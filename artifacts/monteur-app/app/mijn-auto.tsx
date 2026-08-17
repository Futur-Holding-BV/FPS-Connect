// Mijn auto — WAGENPARK_01 §3
// Toont de aan de monteur gekoppelde auto: kenteken, aandrijving, km-stand,
// APK, eerstvolgend onderhoud en de eigen meldingen. Offline toont het scherm
// de laatst bekende data uit de AsyncStorage-cache (offlineCache).

import {
  useGetMijnAuto,
  type MijnAuto,
  type MijnAutoMelding,
} from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ruimte } from "@workspace/ontwerp";

import { LegeStatus } from "@/components/LegeStatus";
import { OfflineBanner } from "@/components/OfflineBanner";
import { Knop, Ladenstaat, LijstFout, Statusmerk, tekstStijl, bovenInset, onderInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useOffline } from "@/context/offline";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { leesMijnAuto, slaMijnAutoOp } from "@/lib/offlineCache";

// ─── Labels ───────────────────────────────────────────────────────────────────
const AANDRIJVING_LABELS: Record<string, string> = {
  diesel: "Diesel",
  benzine: "Benzine",
  elektrisch: "Elektrisch",
  hybride: "Hybride",
};

const AANDRIJVING_ICOON: Record<string, keyof typeof Ionicons.glyphMap> = {
  diesel: "water-outline",
  benzine: "water-outline",
  elektrisch: "flash-outline",
  hybride: "leaf-outline",
};

const MELDING_STATUS_LABELS: Record<string, string> = {
  nieuw: "Nieuw",
  in_beoordeling: "In beoordeling",
  actie_nodig: "Actie nodig",
  ingepland: "Ingepland",
  doorgezet_garage: "Doorgezet naar garage",
  opgelost: "Opgelost",
  afgewezen_duplicaat: "Afgewezen (duplicaat)",
};

// Meldingstatus op het statuspalet van het ontwerpsysteem. De oorspronkelijke
// per-status kleuren (blauw/oranje/rood/paars/cyaan/groen/grijs) bestaan niet
// als aparte tokens; ze worden op de dichtstbijzijnde semantische soort gemapt.
type MeldingSoort = "neutraal" | "succes" | "waarschuwing" | "fout" | "primair";
const MELDING_STATUS_SOORT: Record<string, MeldingSoort> = {
  nieuw: "primair",
  in_beoordeling: "waarschuwing",
  actie_nodig: "fout",
  ingepland: "primair",
  doorgezet_garage: "primair",
  opgelost: "succes",
  afgewezen_duplicaat: "neutraal",
};

const MELDING_TYPE_LABELS: Record<string, string> = {
  storing: "Storing",
  schade: "Schade",
};

// ─── Datum-helpers ──────────────────────────────────────────────────────────
function formatteerDatum(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function dagenTot(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const nu = new Date();
  const verschil = d.getTime() - nu.getTime();
  return Math.ceil(verschil / (1000 * 60 * 60 * 24));
}

function formatteerKm(km: number | null | undefined): string {
  if (km == null) return "—";
  return `${km.toLocaleString("nl-NL")} km`;
}

export default function MijnAutoScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, bezigLaden } = useAuth();
  const { inhoudMaxBreedte } = useResponsive();
  const { isOnline } = useOffline();

  const { data, isLoading, isError, isRefetching, refetch } = useGetMijnAuto();

  // Offline cache: bewaar laatst bekende data en toon die bij geen verbinding.
  const [gecached, setGecached] = useState<MijnAuto | null>(null);

  useEffect(() => {
    void leesMijnAuto<MijnAuto>().then((opgeslagen) => {
      if (opgeslagen) setGecached(opgeslagen);
    });
  }, []);

  useEffect(() => {
    if (data) {
      setGecached(data);
      void slaMijnAutoOp(data);
    }
  }, [data]);

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  // Deep-link-race: wacht tot het token-herstel klaar is voordat we
  // doorsturen, anders verliest een koude deep-link de race (→ /login → /menu).
  if (bezigLaden) return null;
  if (!token) return <Redirect href="/login" />;

  // Toon serverdata indien beschikbaar, val anders terug op de cache.
  const weergave: MijnAuto | null = data ?? gecached;
  const voertuig = weergave?.voertuig ?? null;
  const meldingen: MijnAutoMelding[] = weergave?.meldingen ?? [];

  const toonLaden = isLoading && !weergave;
  const toonFout = isError && !weergave;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Kopbalk */}
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
          <Text style={tekstStijl("schermtitel", c.darkForeground)}>
            Mijn auto
          </Text>
          <Text style={[tekstStijl("klein", c.darkMuted), { marginTop: ruimte.xs }]}>
            Overzicht van jouw voertuig en meldingen
          </Text>
        </View>
      </View>

      {toonLaden ? (
        <View style={{ padding: ruimte.l }}>
          <Ladenstaat regels={6} />
        </View>
      ) : toonFout ? (
        <LijstFout
          beschrijving="De gegevens van jouw auto konden niet worden geladen. Controleer je verbinding en probeer het opnieuw."
          onOpnieuw={() => refetch()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: ruimte.l,
            gap: ruimte.m + 2,
            paddingBottom: onderInset(insets) + ruimte.xl,
            width: "100%",
            maxWidth: inhoudMaxBreedte,
            alignSelf: "center",
          }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.primary} />
          }
        >
          <OfflineBanner stijl="compact" />

          {voertuig === null ? (
            <View style={{ marginTop: ruimte.xxl }}>
              <LegeStatus
                icoon="car-outline"
                titel="Nog geen auto gekoppeld"
                beschrijving="Er is nog geen auto aan jou gekoppeld. Neem contact op met je beheerder als dit niet klopt."
              />
            </View>
          ) : (
            <>
              {/* Voertuigkaart */}
              <View
                style={{
                  backgroundColor: c.card,
                  borderRadius: c.radius,
                  borderWidth: 1,
                  borderColor: c.border,
                  padding: ruimte.l,
                  gap: ruimte.m + 2,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: ruimte.m }}>
                  <View style={{ flex: 1 }}>
                    <Text style={tekstStijl("sectiekop", c.foreground)}>
                      {voertuig.merk} {voertuig.type}
                    </Text>
                    {voertuig.bouwjaar ? (
                      <Text style={[tekstStijl("standaard", c.mutedForeground), { marginTop: ruimte.xs / 2 }]}>
                        Bouwjaar {voertuig.bouwjaar}
                        {voertuig.kleur ? ` · ${voertuig.kleur}` : ""}
                      </Text>
                    ) : voertuig.kleur ? (
                      <Text style={[tekstStijl("standaard", c.mutedForeground), { marginTop: ruimte.xs / 2 }]}>
                        {voertuig.kleur}
                      </Text>
                    ) : null}
                  </View>
                  <Kentekenplaat kenteken={voertuig.kenteken} />
                </View>

                {/* Aandrijving */}
                {voertuig.aandrijving ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.s }}>
                    <Ionicons
                      name={AANDRIJVING_ICOON[voertuig.aandrijving] ?? "car-outline"}
                      size={18}
                      color={c.mutedForeground}
                    />
                    <Text style={[tekstStijl("standaard", c.foreground), { fontFamily: "Inter_500Medium" }]}>
                      {AANDRIJVING_LABELS[voertuig.aandrijving] ?? voertuig.aandrijving}
                    </Text>
                  </View>
                ) : null}

                <View style={{ height: 1, backgroundColor: c.border }} />

                {/* Gegevensrijen */}
                <GegevensRij
                  icoon="speedometer-outline"
                  label="Km-stand"
                  waarde={formatteerKm(voertuig.km_stand)}
                  subtekst={
                    formatteerDatum(voertuig.km_stand_datum)
                      ? `Bijgewerkt op ${formatteerDatum(voertuig.km_stand_datum)}`
                      : undefined
                  }
                />

                <ApkRij datum={voertuig.apk_datum} />
              </View>

              {/* Eerstvolgend onderhoud */}
              {(voertuig.volgend_onderhoud_km != null || voertuig.volgend_onderhoud_datum) ? (
                <View
                  style={{
                    backgroundColor: c.card,
                    borderRadius: c.radius,
                    borderWidth: 1,
                    borderColor: c.border,
                    padding: ruimte.l,
                    gap: ruimte.m,
                  }}
                >
                  <Text style={[tekstStijl("nadruk", c.foreground), { fontFamily: "Inter_700Bold" }]}>
                    Eerstvolgend onderhoud
                  </Text>
                  {voertuig.volgend_onderhoud_km != null ? (
                    <GegevensRij
                      icoon="build-outline"
                      label="Bij km-stand"
                      waarde={formatteerKm(voertuig.volgend_onderhoud_km)}
                    />
                  ) : null}
                  {voertuig.volgend_onderhoud_datum ? (
                    <GegevensRij
                      icoon="calendar-outline"
                      label="Uiterlijk op"
                      waarde={formatteerDatum(voertuig.volgend_onderhoud_datum) ?? "—"}
                    />
                  ) : null}
                </View>
              ) : null}

              {/* Meldingen */}
              <View style={{ gap: ruimte.s + 2 }}>
                <Text style={[tekstStijl("nadruk", c.foreground), { fontFamily: "Inter_700Bold", marginTop: ruimte.xs }]}>
                  Mijn meldingen
                </Text>
                {meldingen.length === 0 ? (
                  <View
                    style={{
                      backgroundColor: c.card,
                      borderRadius: c.radius,
                      borderWidth: 1,
                      borderColor: c.border,
                      padding: ruimte.l,
                    }}
                  >
                    <Text style={tekstStijl("standaard", c.mutedForeground)}>
                      Je hebt nog geen meldingen gemaakt voor deze auto.
                    </Text>
                  </View>
                ) : (
                  meldingen.map((m) => <MeldingKaart key={m.id} melding={m} />)
                )}
              </View>

              {/* Melding maken */}
              <View style={{ marginTop: ruimte.xs }}>
                <Knop
                  titel="Melding maken"
                  onPress={() => router.push("/voertuig-melding")}
                  groot
                />
                {!isOnline ? (
                  <Text
                    style={[tekstStijl("klein", c.mutedForeground), { textAlign: "center", marginTop: ruimte.s }]}
                  >
                    Je bekijkt de laatst bekende gegevens (offline).
                  </Text>
                ) : null}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Deelcomponenten ──────────────────────────────────────────────────────────
function Kentekenplaat({ kenteken }: { kenteken: string }) {
  return (
    // NB: de kleuren van de kentekenplaat (geel/blauw/wit) zijn de wettelijke
    // NL-plaatkleuren en geen ontwerptokens — daarom bewust als letterlijke
    // kleuren behouden (geen paletequivalent).
    <View
      style={{
        flexDirection: "row",
        alignItems: "stretch",
        borderRadius: ruimte.s,
        overflow: "hidden",
        borderWidth: 1.5,
        borderColor: "#111827",
        backgroundColor: "#F5C518",
      }}
    >
      <View style={{ backgroundColor: "#0B4EA2", paddingHorizontal: ruimte.s - 2, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold" }}>NL</Text>
      </View>
      <View style={{ paddingHorizontal: ruimte.s + 2, paddingVertical: ruimte.s - 2, justifyContent: "center" }}>
        <Text
          style={{
            color: "#111827",
            fontSize: 18,
            fontFamily: "Inter_700Bold",
            letterSpacing: 1.5,
          }}
        >
          {kenteken.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

function GegevensRij({
  icoon,
  label,
  waarde,
  subtekst,
}: {
  icoon: keyof typeof Ionicons.glyphMap;
  label: string;
  waarde: string;
  subtekst?: string;
}) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: ruimte.m }}>
      <Ionicons name={icoon} size={20} color={c.mutedForeground} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={tekstStijl("bijschrift", c.mutedForeground)}>
          {label}
        </Text>
        <Text style={[tekstStijl("nadruk", c.foreground), { marginTop: 1 }]}>
          {waarde}
        </Text>
        {subtekst ? (
          <Text style={[tekstStijl("bijschrift", c.mutedForeground), { marginTop: ruimte.xs / 2 }]}>
            {subtekst}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ApkRij({ datum }: { datum: string | null | undefined }) {
  const c = useColors();
  const dagen = dagenTot(datum);
  const geformatteerd = formatteerDatum(datum);

  const verlopen = dagen != null && dagen < 0;
  const bijnaVerlopen = dagen != null && dagen >= 0 && dagen < 60;
  const waarschuwing = verlopen || bijnaVerlopen;

  const badgeKleur = verlopen ? c.destructive : c.warning;
  const badgeTekst = verlopen
    ? "APK verlopen"
    : dagen === 0
      ? "Verloopt vandaag"
      : dagen != null
        ? `Nog ${dagen} ${dagen === 1 ? "dag" : "dagen"}`
        : "";

  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: ruimte.m }}>
      <Ionicons
        name={waarschuwing ? "alert-circle-outline" : "shield-checkmark-outline"}
        size={20}
        color={waarschuwing ? badgeKleur : c.mutedForeground}
        style={{ marginTop: 1 }}
      />
      <View style={{ flex: 1 }}>
        <Text style={tekstStijl("bijschrift", c.mutedForeground)}>
          APK-vervaldatum
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: ruimte.s, marginTop: 1 }}>
          <Text style={tekstStijl("nadruk", c.foreground)}>
            {geformatteerd ?? "Onbekend"}
          </Text>
          {waarschuwing ? (
            <Statusmerk label={badgeTekst} soort={verlopen ? "fout" : "waarschuwing"} />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function MeldingKaart({ melding }: { melding: MijnAutoMelding }) {
  const c = useColors();
  const statusLabel = MELDING_STATUS_LABELS[melding.status] ?? melding.status;
  const statusSoort = MELDING_STATUS_SOORT[melding.status] ?? "neutraal";
  const typeLabel = MELDING_TYPE_LABELS[melding.type] ?? melding.type;
  const datum = formatteerDatum(melding.aangemaakt_op);

  return (
    <View
      style={{
        backgroundColor: c.card,
        borderRadius: c.radius,
        borderWidth: 1,
        borderColor: c.border,
        padding: ruimte.l,
        gap: ruimte.s,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: ruimte.s + 2 }}>
        <Text style={[tekstStijl("standaard", c.mutedForeground), { fontFamily: "Inter_500Medium" }]}>
          {typeLabel}
          {datum ? ` · ${datum}` : ""}
        </Text>
        <Statusmerk label={statusLabel} soort={statusSoort} />
      </View>
      <Text style={tekstStijl("standaard", c.foreground)}>
        {melding.omschrijving}
      </Text>
    </View>
  );
}
