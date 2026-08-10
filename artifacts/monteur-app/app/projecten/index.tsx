// Projecten — lijst van opdrachten (BOUW_01 §2)
// Zichtbaar bij bevoegdheid projecten ≥1 (menu regelt zichtbaarheid; server bewaakt).
import { useListOpdrachten, type Opdracht } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ruimte } from "@workspace/ontwerp";

import { LijstFout, Ladenstaat, Statusmerk, tekstStijl, bovenInset } from "@/components/ui";
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
            Projecten
          </Text>
          <Text style={[tekstStijl("klein", c.darkMuted), { marginTop: ruimte.xs }]}>
            Kies een opdracht om de details te bekijken
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View style={{ padding: ruimte.l }}>
          <Ladenstaat regels={6} />
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
            padding: ruimte.l,
            gap: ruimte.m,
            paddingBottom: insets.bottom + ruimte.xl,
            width: "100%",
            maxWidth: inhoudMaxBreedte,
            alignSelf: "center",
          }}
          ListEmptyComponent={
            <Text style={[tekstStijl("standaard", c.mutedForeground), { textAlign: "center", marginTop: ruimte.xxl + ruimte.l }]}>
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
        padding: ruimte.l,
        gap: ruimte.s - 2,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: ruimte.s }}>
        <Text style={tekstStijl("bijschrift", c.mutedForeground)}>
          {kenmerk}
        </Text>
        <Statusmerk label={opdracht.status} />
      </View>
      <Text style={tekstStijl("sectiekop", c.foreground)} numberOfLines={2}>
        {opdracht.titel}
      </Text>
      {gebouw ? (
        <Text style={tekstStijl("standaard", c.mutedForeground)} numberOfLines={1}>
          {gebouw}
        </Text>
      ) : null}
    </Pressable>
  );
}
