// Projecten — lijst van opdrachten (BOUW_01 §2)
// Zichtbaar bij bevoegdheid projecten ≥1 (menu regelt zichtbaarheid; server bewaakt).
import { useListOpdrachten, type Opdracht } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LijstFout, bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

export default function ProjectenLijst() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { inhoudMaxBreedte } = useResponsive();

  const { data, isLoading, isError, refetch } = useListOpdrachten(undefined, {
    query: { enabled: !!token },
  } as any);

  const opdrachten = (data as Opdracht[]) ?? [];

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
            Projecten
          </Text>
          <Text style={{ color: c.darkMuted, fontSize: 14, marginTop: 4, fontFamily: "Inter_400Regular" }}>
            Kies een opdracht om de details te bekijken
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : isError ? (
        <LijstFout
          beschrijving="De opdrachten konden niet worden geladen. Controleer je verbinding en probeer het opnieuw."
          onOpnieuw={() => refetch()}
        />
      ) : (
        <FlatList
          data={opdrachten}
          keyExtractor={(o) => String(o.id)}
          contentContainerStyle={{
            padding: 16,
            gap: 12,
            paddingBottom: insets.bottom + 24,
            width: "100%",
            maxWidth: inhoudMaxBreedte,
            alignSelf: "center",
          }}
          ListEmptyComponent={
            <Text style={{ textAlign: "center", color: c.mutedForeground, marginTop: 48, fontFamily: "Inter_400Regular" }}>
              Er zijn nog geen opdrachten.
            </Text>
          }
          renderItem={({ item }) => <OpdrachtKaart opdracht={item} />}
        />
      )}
    </View>
  );
}

export function OpdrachtKaart({ opdracht }: { opdracht: Opdracht }) {
  const c = useColors();
  const router = useRouter();
  const kenmerk = opdracht.werknummer ?? `#${opdracht.id}`;
  const gebouw = [opdracht.gebouw_naam, opdracht.gebouw_stad].filter(Boolean).join(", ");
  return (
    <Pressable
      onPress={() => router.push(`/projecten/${opdracht.id}`)}
      style={({ pressed }) => ({
        backgroundColor: c.card,
        borderRadius: c.radius,
        borderWidth: 1,
        borderColor: c.border,
        padding: 16,
        gap: 6,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
          {kenmerk}
        </Text>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 8,
            backgroundColor: c.secondary,
          }}
        >
          <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: c.mutedForeground }}>
            {opdracht.status}
          </Text>
        </View>
      </View>
      <Text style={{ color: c.foreground, fontSize: 17, fontFamily: "Inter_700Bold" }} numberOfLines={2}>
        {opdracht.titel}
      </Text>
      {gebouw ? (
        <Text style={{ color: c.mutedForeground, fontSize: 14, fontFamily: "Inter_400Regular" }} numberOfLines={1}>
          {gebouw}
        </Text>
      ) : null}
    </Pressable>
  );
}
