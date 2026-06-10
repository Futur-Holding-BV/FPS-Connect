import {
  useGetGebouw,
  useListVerdiepingen,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bovenInset } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

export default function GebouwDetail() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const gebouwId = Number(id);
  const { kolommen, inhoudMaxBreedte, breedte } = useResponsive();
  const RASTER_GAP = 12;
  const beschikbareBreedte = Math.min(breedte, inhoudMaxBreedte ?? breedte) - 32;
  const itemBreedte =
    kolommen > 1 ? (beschikbareBreedte - RASTER_GAP * (kolommen - 1)) / kolommen : undefined;

  const { data: gebouw } = useGetGebouw(gebouwId);
  const { data: verdiepingen, isLoading } = useListVerdiepingen(gebouwId);

  const gesorteerd = [...(verdiepingen ?? [])].sort((a, b) => a.niveau - b.niveau);

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
          {gebouw?.naam ?? "Gebouw"}
        </Text>
        <Text style={{ color: c.darkMuted, fontSize: 14, marginTop: 4, fontFamily: "Inter_400Regular" }}>
          Kies een verdieping om de plattegrond te openen
        </Text>
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : (
        <FlatList
          data={gesorteerd}
          key={`kol-${kolommen}`}
          keyExtractor={(v) => String(v.id)}
          numColumns={kolommen}
          columnWrapperStyle={kolommen > 1 ? { gap: RASTER_GAP } : undefined}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24, width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}
          ListEmptyComponent={
            <Text style={{ textAlign: "center", color: c.mutedForeground, marginTop: 48, fontFamily: "Inter_400Regular" }}>
              Dit gebouw heeft nog geen verdiepingen.
            </Text>
          }
          renderItem={({ item }) => {
            const heeftPlan = !!item.plattegrond_url;
            return (
              <Pressable
                onPress={() =>
                  router.push(
                    `/plattegrond/${item.id}?gebouwId=${gebouwId}&naam=${encodeURIComponent(item.naam)}`,
                  )
                }
                style={({ pressed }) => ({
                  backgroundColor: c.card,
                  borderRadius: c.radius,
                  borderWidth: 1,
                  borderColor: c.border,
                  padding: 18,
                  width: itemBreedte,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    backgroundColor: c.accent,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: c.accentForeground, fontSize: 18, fontFamily: "Inter_700Bold" }}>
                    {item.niveau}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, color: c.foreground, fontFamily: "Inter_600SemiBold" }}>
                    {item.naam}
                  </Text>
                  <Text style={{ fontSize: 14, color: c.mutedForeground, marginTop: 2, fontFamily: "Inter_400Regular" }}>
                    {item.totaal_voorzieningen ?? 0} voorzieningen
                  </Text>
                </View>
                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 8,
                    backgroundColor: heeftPlan ? "rgba(34,160,107,0.15)" : c.secondary,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontFamily: "Inter_600SemiBold",
                      color: heeftPlan ? c.success : c.mutedForeground,
                    }}
                  >
                    {heeftPlan ? "Plattegrond" : "Geen plan"}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
