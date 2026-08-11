import {
  DocumentStatus,
  DocumentType,
  useListDocumenten,
} from "@workspace/api-client-react";
import { LegeStatus } from "@/components/LegeStatus";
import { Redirect, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ruimte } from "@workspace/ontwerp";

import { LijstFout, Ladenstaat, TekstVeld, tekstStijl, bovenInset } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { useAuth } from "@/context/auth";
import { BevoegdheidGuard } from "@/components/BevoegdheidGuard";

const TYPE_LABELS: Record<DocumentType, string> = {
  [DocumentType.eta]: "ETA",
  [DocumentType.classificatierapport]: "Classificatierapport",
  [DocumentType.testrapport]: "Testrapport",
  [DocumentType.productcertificaat]: "Productcertificaat",
  [DocumentType.dop]: "DoP",
  [DocumentType.verwerkingsvoorschrift]: "Verwerkingsvoorschrift",
  [DocumentType.productblad]: "Productblad",
  [DocumentType.opleverrapport]: "Opleverrapport",
  [DocumentType.tekening]: "Tekening",
  [DocumentType.contract]: "Contract",
  [DocumentType.verzekering]: "Verzekering",
  [DocumentType.opdrachtbevestiging]: "Opdrachtbevestiging",
  [DocumentType.overig]: "Overig",
};

const STATUS_LABELS: Record<DocumentStatus, string> = {
  [DocumentStatus.actueel]: "Actueel",
  [DocumentStatus.controle_nodig]: "Controle nodig",
  [DocumentStatus.vervangen]: "Vervangen",
  [DocumentStatus.mogelijk_verouderd]: "Mogelijk verouderd",
  [DocumentStatus.ingetrokken]: "Ingetrokken",
};

function Documenten() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { kolommen, inhoudMaxBreedte, breedte } = useResponsive();
  const RASTER_GAP = 12;
  const beschikbareBreedte = Math.min(breedte, inhoudMaxBreedte ?? breedte) - 32;
  const itemBreedte =
    kolommen > 1 ? (beschikbareBreedte - RASTER_GAP * (kolommen - 1)) / kolommen : undefined;
  const { token } = useAuth();
  const [zoek, setZoek] = useState("");

  const {
    data: documenten = [],
    isLoading,
    isError,
    isRefetching,
    refetch,
  } = useListDocumenten({ alleen_actueel: true });

  if (!token) return <Redirect href="/login" />;

  const gefilterd = documenten.filter((d) => {
    if (!zoek.trim()) return true;
    const q = zoek.toLowerCase();
    return (
      d.naam.toLowerCase().includes(q) ||
      (d.fabrikant ?? "").toLowerCase().includes(q) ||
      (d.rapportnummer ?? "").toLowerCase().includes(q)
    );
  });

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
          <Text style={tekstStijl("schermtitel", c.darkForeground)}>
            Documenten
          </Text>
          <Text style={[tekstStijl("klein", c.darkMuted), { marginTop: ruimte.xs }]}>
            Bibliotheek met certificaten en rapporten
          </Text>

          <View style={{ marginTop: ruimte.m + 2 }}>
            <TekstVeld
              label=""
              value={zoek}
              onChangeText={setZoek}
              placeholder="Zoek op naam, fabrikant of rapportnummer…"
              autoCapitalize="none"
              style={{ backgroundColor: c.darkForeground + "1A", borderColor: c.darkForeground + "2E", color: c.darkForeground }}
            />
          </View>
        </View>
      </View>

      {isLoading ? (
        <View style={{ padding: ruimte.l }}>
          <Ladenstaat regels={6} />
        </View>
      ) : isError ? (
        <LijstFout
          beschrijving="De documenten konden niet worden geladen. Controleer je verbinding en probeer het opnieuw."
          onOpnieuw={() => refetch()}
        />
      ) : (
        <FlatList
          data={gefilterd}
          key={`kol-${kolommen}`}
          keyExtractor={(d) => String(d.id)}
          numColumns={kolommen}
          columnWrapperStyle={kolommen > 1 ? { gap: RASTER_GAP } : undefined}
          contentContainerStyle={{ padding: ruimte.l, gap: ruimte.m, paddingBottom: insets.bottom + ruimte.xl, width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.primary} />
          }
          ListEmptyComponent={
            <LegeStatus
              icoon="document-outline"
              titel="Geen documenten"
              beschrijving="Er zijn nog geen documenten door uw beheerder gedeeld."
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/documenten/${item.id}`)}
              style={({ pressed }) => ({
                backgroundColor: c.card,
                borderRadius: c.radius,
                borderWidth: 1,
                borderColor: c.border,
                padding: ruimte.l,
                width: itemBreedte,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text
                style={tekstStijl("sectiekop", c.foreground)}
                numberOfLines={2}
              >
                {item.naam}
              </Text>
              {item.fabrikant ? (
                <Text style={[tekstStijl("standaard", c.mutedForeground), { marginTop: ruimte.xs }]}>
                  {item.fabrikant}
                </Text>
              ) : null}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: ruimte.s, marginTop: ruimte.m, alignItems: "center" }}>
                <View
                  style={{
                    backgroundColor: c.accent,
                    paddingHorizontal: ruimte.m,
                    paddingVertical: ruimte.s - 2,
                    borderRadius: c.radius / 2,
                  }}
                >
                  <Text style={tekstStijl("bijschrift", c.accentForeground)}>
                    {TYPE_LABELS[item.documenttype] ?? item.documenttype}
                  </Text>
                </View>
                <Text style={tekstStijl("bijschrift", c.mutedForeground)}>
                  {STATUS_LABELS[item.status] ?? item.status}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

// APP_01 §3.3 — schermbescherming: nette weigering zonder bevoegdheid
// (backendroute eist bibliotheek niveau 1; gemeten, zie docs/metingen).
export default function DocumentenBeveiligd() {
  return (
    <BevoegdheidGuard vereiste={{ module: "bibliotheek", niveau: 1 }}>
      <Documenten />
    </BevoegdheidGuard>
  );
}
