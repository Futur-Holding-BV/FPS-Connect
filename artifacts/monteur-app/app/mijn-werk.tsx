import { useGetMijnWerk } from "@workspace/api-client-react";
import type { MijnWerkGebouw, MijnWerkSpot } from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SectionList,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LijstFout, bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

const TYPEN: Record<string, string> = {
  branddeur: "Branddeur",
  doorvoering: "Doorvoering",
  brandklep: "Brandklep",
  kitvoeg: "Kitvoeg",
  manchet: "Manchet",
  brandwerend_glas: "Brandwerend glas",
  coating: "Coating",
  luik: "Luik",
  plaatconstructie: "Plaatconstructie",
  schuifdeur: "Schuifdeur",
  puiconstructie: "Puiconstructie",
  dakdoorvoer: "Dakdoorvoer",
  samengesteld: "Samengesteld",
};

const STATUSKLEUR: Record<string, string> = {
  concept: "#6b7280",
  geplaatst: "#2563eb",
  goedgekeurd: "#16a34a",
  afgekeurd: "#dc2626",
  ter_inspectie: "#d97706",
  hersteld: "#0891b2",
  vervangen: "#7c3aed",
};

const STATUSLABEL: Record<string, string> = {
  concept: "Concept",
  geplaatst: "Geplaatst",
  goedgekeurd: "Goedgekeurd",
  afgekeurd: "Afgekeurd",
  ter_inspectie: "Ter inspectie",
  hersteld: "Hersteld",
  vervangen: "Vervangen",
};

export default function MijnWerkScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { inhoudMaxBreedte } = useResponsive();

  const { data, isLoading, isError, refetch } = useGetMijnWerk();

  if (!token) return <Redirect href="/login" />;

  const secties = (data ?? []).map((g: MijnWerkGebouw) => ({
    key: String(g.gebouw_id),
    gebouw: g,
    data: g.spots,
  }));

  const totaalSpots = (data ?? []).reduce(
    (som: number, g: MijnWerkGebouw) => som + g.spots.length,
    0,
  );

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
            Mijn werk
          </Text>
          {!isLoading && !isError && (
            <Text
              style={{ color: c.darkMuted, fontSize: 13, marginTop: 4, fontFamily: "Inter_400Regular" }}
            >
              {totaalSpots === 0
                ? "Geen spots aan u toegewezen"
                : `${totaalSpots} spot${totaalSpots !== 1 ? "s" : ""} in ${(data ?? []).length} gebouw${(data ?? []).length !== 1 ? "en" : ""}`}
            </Text>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : isError ? (
        <LijstFout
          beschrijving="Mijn werk kon niet worden geladen. Controleer uw verbinding en probeer opnieuw."
          onOpnieuw={() => refetch()}
        />
      ) : secties.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 }}>
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: c.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="checkmark-circle-outline" size={38} color={c.primary} />
          </View>
          <Text
            style={{
              color: c.foreground,
              fontSize: 18,
              fontFamily: "Inter_700Bold",
              textAlign: "center",
            }}
          >
            Geen openstaand werk
          </Text>
          <Text
            style={{
              color: c.mutedForeground,
              fontSize: 14,
              fontFamily: "Inter_400Regular",
              textAlign: "center",
              lineHeight: 21,
            }}
          >
            Er zijn momenteel geen spots aan u toegewezen. Zodra een beheerder u een spot
            toewijst, verschijnt die hier.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={secties}
          keyExtractor={(spot: MijnWerkSpot) => String(spot.id)}
          contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 24 }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <GebouwKop
              gebouw={section.gebouw}
              router={router}
              c={c}
              inhoudMaxBreedte={inhoudMaxBreedte}
            />
          )}
          renderItem={({ item: spot }) => (
            <SpotRij
              spot={spot}
              gebouw={secties.find((s) => s.data.includes(spot))?.gebouw}
              router={router}
              c={c}
              inhoudMaxBreedte={inhoudMaxBreedte}
            />
          )}
          SectionSeparatorComponent={() => <View style={{ height: 16 }} />}
        />
      )}
    </View>
  );
}

function GebouwKop({
  gebouw,
  router,
  c,
  inhoudMaxBreedte,
}: {
  gebouw: MijnWerkGebouw;
  router: ReturnType<typeof useRouter>;
  c: ReturnType<typeof useColors>;
  inhoudMaxBreedte: number | undefined;
}) {
  return (
    <Pressable
      onPress={() => router.push(`/gebouw/${gebouw.gebouw_id}`)}
      style={{
        width: "100%",
        maxWidth: inhoudMaxBreedte,
        alignSelf: "center",
        marginBottom: 6,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 4,
          paddingBottom: 6,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
          marginBottom: 4,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.foreground, fontSize: 15, fontFamily: "Inter_700Bold" }}>
            {gebouw.gebouw_naam}
          </Text>
          {gebouw.adres ? (
            <Text
              style={{
                color: c.mutedForeground,
                fontSize: 12,
                fontFamily: "Inter_400Regular",
                marginTop: 1,
              }}
            >
              {gebouw.adres}
              {gebouw.stad ? `, ${gebouw.stad}` : ""}
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View
            style={{
              backgroundColor: c.primary + "22",
              borderRadius: 12,
              paddingHorizontal: 10,
              paddingVertical: 3,
            }}
          >
            <Text style={{ color: c.primary, fontSize: 12, fontFamily: "Inter_700Bold" }}>
              {gebouw.spots.length}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={c.mutedForeground} />
        </View>
      </View>
    </Pressable>
  );
}

function SpotRij({
  spot,
  gebouw,
  router,
  c,
  inhoudMaxBreedte,
}: {
  spot: MijnWerkSpot;
  gebouw: MijnWerkGebouw | undefined;
  router: ReturnType<typeof useRouter>;
  c: ReturnType<typeof useColors>;
  inhoudMaxBreedte: number | undefined;
}) {
  const statusKleur = STATUSKLEUR[spot.status] ?? c.mutedForeground;

  function navigeer() {
    if (spot.verdieping_id) {
      router.push(`/plattegrond/${spot.verdieping_id}`);
    } else if (gebouw) {
      router.push(`/gebouw/${gebouw.gebouw_id}`);
    }
  }

  return (
    <Pressable
      onPress={navigeer}
      style={{
        width: "100%",
        maxWidth: inhoudMaxBreedte,
        alignSelf: "center",
        marginBottom: 6,
      }}
    >
      <View
        style={{
          backgroundColor: c.card,
          borderRadius: c.radius,
          borderWidth: 1,
          borderColor: c.border,
          paddingHorizontal: 14,
          paddingVertical: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: statusKleur,
            flexShrink: 0,
            marginTop: 1,
          }}
        />
        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <Text
              style={{
                color: c.foreground,
                fontSize: 14,
                fontFamily: "Inter_600SemiBold",
                flexShrink: 1,
              }}
              numberOfLines={1}
            >
              {spot.objectnummer || "—"}
            </Text>
            <Text
              style={{
                color: statusKleur,
                fontSize: 11,
                fontFamily: "Inter_600SemiBold",
                flexShrink: 0,
              }}
            >
              {STATUSLABEL[spot.status] ?? spot.status}
            </Text>
          </View>
          <Text
            style={{
              color: c.mutedForeground,
              fontSize: 12,
              fontFamily: "Inter_400Regular",
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            {TYPEN[spot.type] ?? spot.type}
            {spot.ruimte ? ` · ${spot.ruimte}` : ""}
            {spot.verdieping_naam ? ` · ${spot.verdieping_naam}` : ""}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={c.mutedForeground} style={{ flexShrink: 0 }} />
      </View>
    </Pressable>
  );
}
