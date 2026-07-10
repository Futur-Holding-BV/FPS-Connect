import { useListOpleidingen } from "@workspace/api-client-react";
import { Redirect, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LijstFout, bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

export default function OpleidingenScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { inhoudMaxBreedte } = useResponsive();
  const { token } = useAuth();
  const { data, isLoading, isError, refetch, isRefetching } = useListOpleidingen();

  if (!token) return <Redirect href="/login" />;

  const opleidingen = data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ backgroundColor: c.dark, paddingTop: bovenInset(insets) + 12, paddingHorizontal: 20, paddingBottom: 18 }}>
        <View style={{ width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
          <Pressable onPress={() => router.back()} style={{ marginBottom: 10 }}>
            <Text style={{ color: c.primary, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>‹ Terug</Text>
          </Pressable>
          <Text style={{ color: c.darkForeground, fontSize: 20, fontFamily: "Inter_700Bold" }}>Opleidingen</Text>
          <Text style={{ color: c.darkMuted, fontSize: 13, marginTop: 2, fontFamily: "Inter_400Regular" }}>
            Trainingen en certificaten
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : isError ? (
        <LijstFout
          beschrijving="De opleidingen konden niet worden geladen. Controleer je verbinding en probeer het opnieuw."
          onOpnieuw={() => refetch()}
        />
      ) : (
        <FlatList
          data={opleidingen}
          keyExtractor={(o) => String(o.id)}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24, width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.primary} />}
          ListEmptyComponent={
            <Text style={{ textAlign: "center", color: c.mutedForeground, marginTop: 48, fontFamily: "Inter_400Regular" }}>
              Geen opleidingen gevonden.
            </Text>
          }
          renderItem={({ item }) => (
            <View
              style={{
                backgroundColor: c.card,
                borderRadius: c.radius,
                borderWidth: 1,
                borderColor: c.border,
                padding: 18,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 16, color: c.foreground, fontFamily: "Inter_700Bold" }}>{item.naam}</Text>
                {item.verplicht ? (
                  <View style={{ backgroundColor: c.accent, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                    <Text style={{ color: c.accentForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>verplicht</Text>
                  </View>
                ) : null}
              </View>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                <View style={{ backgroundColor: c.muted, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                  <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                    {item.soort === "opleiding" ? "Opleiding" : "Cursus"}
                  </Text>
                </View>
                {item.categorie ? (
                  <View style={{ backgroundColor: c.muted, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                    <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                      {item.categorie}
                    </Text>
                  </View>
                ) : null}
                {item.niveau ? (
                  <View style={{ backgroundColor: c.muted, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                    <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                      {item.niveau}
                    </Text>
                  </View>
                ) : null}
                {item.lesvorm ? (
                  <View style={{ backgroundColor: c.muted, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                    <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                      {item.lesvorm}
                    </Text>
                  </View>
                ) : null}
              </View>

              {item.opleider ? (
                <Text style={{ fontSize: 13, color: c.mutedForeground, marginTop: 8, fontFamily: "Inter_400Regular" }}>
                  Opleider: {item.opleider}
                </Text>
              ) : null}
              {item.studieduur || item.studiebelasting ? (
                <Text style={{ fontSize: 13, color: c.mutedForeground, marginTop: 2, fontFamily: "Inter_400Regular" }}>
                  {[item.studieduur, item.studiebelasting].filter(Boolean).join(" · ")}
                </Text>
              ) : null}
              {item.kosten_werkgever_pct != null || item.kosten_werknemer_pct != null ? (
                <Text style={{ fontSize: 13, color: c.mutedForeground, marginTop: 2, fontFamily: "Inter_400Regular" }}>
                  Kostenverdeling: werkgever {item.kosten_werkgever_pct ?? 0}% · werknemer {item.kosten_werknemer_pct ?? 0}%
                </Text>
              ) : null}
              {item.geldigheid_maanden != null ? (
                <Text style={{ fontSize: 13, color: c.mutedForeground, marginTop: 2, fontFamily: "Inter_400Regular" }}>
                  Geldig {item.geldigheid_maanden} maanden
                </Text>
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}
