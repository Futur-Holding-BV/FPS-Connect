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
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LegeStatus } from "@/components/LegeStatus";
import { OfflineBanner } from "@/components/OfflineBanner";
import { Knop, LijstFout, bovenInset, onderInset } from "@/components/ui";
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

const MELDING_STATUS_KLEUR: Record<string, string> = {
  nieuw: "#2563eb",
  in_beoordeling: "#d97706",
  actie_nodig: "#dc2626",
  ingepland: "#7c3aed",
  doorgezet_garage: "#0891b2",
  opgelost: "#16a34a",
  afgewezen_duplicaat: "#6b7280",
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
  const { token } = useAuth();
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
          paddingTop: bovenInset(insets) + 12,
          paddingHorizontal: 20,
          paddingBottom: 18,
        }}
      >
        <View style={{ width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
          <Pressable onPress={() => router.back()} style={{ marginBottom: 10 }}>
            <Text style={{ color: c.primary, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>
              ‹ Terug
            </Text>
          </Pressable>
          <Text style={{ color: c.darkForeground, fontSize: 22, fontFamily: "Inter_700Bold" }}>
            Mijn auto
          </Text>
          <Text style={{ color: c.darkMuted, fontSize: 14, marginTop: 4, fontFamily: "Inter_400Regular" }}>
            Overzicht van jouw voertuig en meldingen
          </Text>
        </View>
      </View>

      {toonLaden ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : toonFout ? (
        <LijstFout
          beschrijving="De gegevens van jouw auto konden niet worden geladen. Controleer je verbinding en probeer het opnieuw."
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
          <OfflineBanner stijl="compact" />

          {voertuig === null ? (
            <View style={{ marginTop: 32 }}>
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
                  padding: 18,
                  gap: 14,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 20, color: c.foreground, fontFamily: "Inter_700Bold" }}>
                      {voertuig.merk} {voertuig.type}
                    </Text>
                    {voertuig.bouwjaar ? (
                      <Text style={{ fontSize: 14, color: c.mutedForeground, marginTop: 2, fontFamily: "Inter_400Regular" }}>
                        Bouwjaar {voertuig.bouwjaar}
                        {voertuig.kleur ? ` · ${voertuig.kleur}` : ""}
                      </Text>
                    ) : voertuig.kleur ? (
                      <Text style={{ fontSize: 14, color: c.mutedForeground, marginTop: 2, fontFamily: "Inter_400Regular" }}>
                        {voertuig.kleur}
                      </Text>
                    ) : null}
                  </View>
                  <Kentekenplaat kenteken={voertuig.kenteken} />
                </View>

                {/* Aandrijving */}
                {voertuig.aandrijving ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons
                      name={AANDRIJVING_ICOON[voertuig.aandrijving] ?? "car-outline"}
                      size={18}
                      color={c.mutedForeground}
                    />
                    <Text style={{ fontSize: 15, color: c.foreground, fontFamily: "Inter_500Medium" }}>
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
                    padding: 18,
                    gap: 12,
                  }}
                >
                  <Text style={{ fontSize: 16, color: c.foreground, fontFamily: "Inter_700Bold" }}>
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
              <View style={{ gap: 10 }}>
                <Text style={{ fontSize: 16, color: c.foreground, fontFamily: "Inter_700Bold", marginTop: 4 }}>
                  Mijn meldingen
                </Text>
                {meldingen.length === 0 ? (
                  <View
                    style={{
                      backgroundColor: c.card,
                      borderRadius: c.radius,
                      borderWidth: 1,
                      borderColor: c.border,
                      padding: 18,
                    }}
                  >
                    <Text style={{ fontSize: 14, color: c.mutedForeground, fontFamily: "Inter_400Regular" }}>
                      Je hebt nog geen meldingen gemaakt voor deze auto.
                    </Text>
                  </View>
                ) : (
                  meldingen.map((m) => <MeldingKaart key={m.id} melding={m} />)
                )}
              </View>

              {/* Melding maken */}
              <View style={{ marginTop: 6 }}>
                <Knop
                  titel="Melding maken"
                  onPress={() => router.push("/voertuig-melding")}
                  groot
                />
                {!isOnline ? (
                  <Text
                    style={{
                      fontSize: 13,
                      color: c.mutedForeground,
                      textAlign: "center",
                      marginTop: 8,
                      fontFamily: "Inter_400Regular",
                    }}
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
    <View
      style={{
        flexDirection: "row",
        alignItems: "stretch",
        borderRadius: 8,
        overflow: "hidden",
        borderWidth: 1.5,
        borderColor: "#111827",
        backgroundColor: "#F5C518",
      }}
    >
      <View style={{ backgroundColor: "#0B4EA2", paddingHorizontal: 6, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold" }}>NL</Text>
      </View>
      <View style={{ paddingHorizontal: 10, paddingVertical: 6, justifyContent: "center" }}>
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
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
      <Ionicons name={icoon} size={20} color={c.mutedForeground} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, color: c.mutedForeground, fontFamily: "Inter_400Regular" }}>
          {label}
        </Text>
        <Text style={{ fontSize: 16, color: c.foreground, fontFamily: "Inter_600SemiBold", marginTop: 1 }}>
          {waarde}
        </Text>
        {subtekst ? (
          <Text style={{ fontSize: 12, color: c.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 }}>
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
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
      <Ionicons
        name={waarschuwing ? "alert-circle-outline" : "shield-checkmark-outline"}
        size={20}
        color={waarschuwing ? badgeKleur : c.mutedForeground}
        style={{ marginTop: 1 }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, color: c.mutedForeground, fontFamily: "Inter_400Regular" }}>
          APK-vervaldatum
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 1 }}>
          <Text style={{ fontSize: 16, color: c.foreground, fontFamily: "Inter_600SemiBold" }}>
            {geformatteerd ?? "Onbekend"}
          </Text>
          {waarschuwing ? (
            <View
              style={{
                backgroundColor: badgeKleur,
                borderRadius: 20,
                paddingHorizontal: 10,
                paddingVertical: 3,
              }}
            >
              <Text style={{ fontSize: 12, color: "#fff", fontFamily: "Inter_600SemiBold" }}>
                {badgeTekst}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function MeldingKaart({ melding }: { melding: MijnAutoMelding }) {
  const c = useColors();
  const statusLabel = MELDING_STATUS_LABELS[melding.status] ?? melding.status;
  const statusKleur = MELDING_STATUS_KLEUR[melding.status] ?? c.mutedForeground;
  const typeLabel = MELDING_TYPE_LABELS[melding.type] ?? melding.type;
  const datum = formatteerDatum(melding.aangemaakt_op);

  return (
    <View
      style={{
        backgroundColor: c.card,
        borderRadius: c.radius,
        borderWidth: 1,
        borderColor: c.border,
        padding: 16,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Text style={{ fontSize: 14, color: c.mutedForeground, fontFamily: "Inter_500Medium" }}>
          {typeLabel}
          {datum ? ` · ${datum}` : ""}
        </Text>
        <View
          style={{
            backgroundColor: statusKleur,
            borderRadius: 20,
            paddingHorizontal: 10,
            paddingVertical: 3,
          }}
        >
          <Text style={{ fontSize: 12, color: "#fff", fontFamily: "Inter_600SemiBold" }}>
            {statusLabel}
          </Text>
        </View>
      </View>
      <Text style={{ fontSize: 15, color: c.foreground, fontFamily: "Inter_400Regular", lineHeight: 21 }}>
        {melding.omschrijving}
      </Text>
    </View>
  );
}
