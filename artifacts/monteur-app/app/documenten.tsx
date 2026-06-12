import {
  DocumentStatus,
  DocumentType,
  useListDocumenten,
} from "@workspace/api-client-react";
import { Redirect, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TekstVeld, bovenInset } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { useAuth } from "@/context/auth";

const TYPE_LABELS: Record<DocumentType, string> = {
  [DocumentType.eta]: "ETA",
  [DocumentType.classificatierapport]: "Classificatierapport",
  [DocumentType.testrapport]: "Testrapport",
  [DocumentType.productcertificaat]: "Productcertificaat",
  [DocumentType.dop]: "DoP",
  [DocumentType.verwerkingsvoorschrift]: "Verwerkingsvoorschrift",
  [DocumentType.productblad]: "Productblad",
  [DocumentType.opleverrapport]: "Opleverrapport",
};

const STATUS_LABELS: Record<DocumentStatus, string> = {
  [DocumentStatus.actueel]: "Actueel",
  [DocumentStatus.controle_nodig]: "Controle nodig",
  [DocumentStatus.vervangen]: "Vervangen",
  [DocumentStatus.mogelijk_verouderd]: "Mogelijk verouderd",
  [DocumentStatus.ingetrokken]: "Ingetrokken",
};

export default function Documenten() {
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
            Documenten
          </Text>
          <Text style={{ color: c.darkMuted, fontSize: 14, marginTop: 4, fontFamily: "Inter_400Regular" }}>
            Bibliotheek met certificaten en rapporten
          </Text>

          <View style={{ marginTop: 14 }}>
            <TekstVeld
              label=""
              value={zoek}
              onChangeText={setZoek}
              placeholder="Zoek op naam, fabrikant of rapportnummer…"
              autoCapitalize="none"
              style={{ backgroundColor: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.18)", color: "#fff" }}
            />
          </View>
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : (
        <FlatList
          data={gefilterd}
          key={`kol-${kolommen}`}
          keyExtractor={(d) => String(d.id)}
          numColumns={kolommen}
          columnWrapperStyle={kolommen > 1 ? { gap: RASTER_GAP } : undefined}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24, width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.primary} />
          }
          ListEmptyComponent={
            <Text style={{ textAlign: "center", color: c.mutedForeground, marginTop: 48, fontFamily: "Inter_400Regular" }}>
              Geen documenten gevonden.
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/documenten/${item.id}`)}
              style={({ pressed }) => ({
                backgroundColor: c.card,
                borderRadius: c.radius,
                borderWidth: 1,
                borderColor: c.border,
                padding: 18,
                width: itemBreedte,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text
                style={{ fontSize: 17, color: c.foreground, fontFamily: "Inter_700Bold" }}
                numberOfLines={2}
              >
                {item.naam}
              </Text>
              {item.fabrikant ? (
                <Text style={{ fontSize: 14, color: c.mutedForeground, marginTop: 4, fontFamily: "Inter_400Regular" }}>
                  {item.fabrikant}
                </Text>
              ) : null}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12, alignItems: "center" }}>
                <View
                  style={{
                    backgroundColor: c.accent,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ color: c.accentForeground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                    {TYPE_LABELS[item.documenttype] ?? item.documenttype}
                  </Text>
                </View>
                <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
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
