import { useGetMijnWerk } from "@workspace/api-client-react";
import type { MijnWerkGebouw } from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LijstFout, bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

function sorteerOpRoute(gebouwen: MijnWerkGebouw[]): MijnWerkGebouw[] {
  return [...gebouwen].sort((a, b) => {
    const aKey = `${a.stad ?? ""} ${a.adres ?? ""}`.trim().toLowerCase();
    const bKey = `${b.stad ?? ""} ${b.adres ?? ""}`.trim().toLowerCase();
    return aKey.localeCompare(bKey, "nl");
  });
}

function openNavigatie(gebouw: MijnWerkGebouw) {
  const query = encodeURIComponent(
    `${gebouw.adres ?? ""} ${gebouw.stad ?? ""}`.trim(),
  );
  const url = `https://www.google.com/maps/search/?api=1&query=${query}`;
  Linking.openURL(url);
}

export default function PlanningScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { inhoudMaxBreedte } = useResponsive();

  const { data, isLoading, isError, refetch } = useGetMijnWerk();

  if (!token) return <Redirect href="/login" />;

  const gesorteerd = sorteerOpRoute(data ?? []);

  const vandaag = new Date().toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
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
            Routeplanning
          </Text>
          <Text
            style={{
              color: c.darkMuted,
              fontSize: 13,
              marginTop: 4,
              fontFamily: "Inter_400Regular",
              textTransform: "capitalize",
            }}
          >
            {vandaag}
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : isError ? (
        <LijstFout
          beschrijving="De routeplanning kon niet worden geladen. Controleer uw verbinding en probeer opnieuw."
          onOpnieuw={() => refetch()}
        />
      ) : gesorteerd.length === 0 ? (
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
            <Ionicons name="calendar-outline" size={38} color={c.primary} />
          </View>
          <Text
            style={{
              color: c.foreground,
              fontSize: 18,
              fontFamily: "Inter_700Bold",
              textAlign: "center",
            }}
          >
            Geen gepland werk
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
            Er zijn geen spots aan u toegewezen. Uw routeplanning wordt automatisch samengesteld
            op basis van toegewezen werk.
          </Text>
        </View>
      ) : (
        <>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 20,
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: c.border,
            }}
          >
            <Ionicons name="information-circle-outline" size={16} color={c.mutedForeground} />
            <Text
              style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 }}
            >
              {gesorteerd.length} locatie{gesorteerd.length !== 1 ? "s" : ""} gesorteerd op adres.
              Tik op een adres om navigatie te openen.
            </Text>
          </View>

          <FlatList
            data={gesorteerd}
            keyExtractor={(g: MijnWerkGebouw) => String(g.gebouw_id)}
            contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 24, gap: 10 }}
            renderItem={({ item: g, index }) => (
              <RouteKaart
                gebouw={g}
                volgorde={index + 1}
                totaal={gesorteerd.length}
                router={router}
                c={c}
                inhoudMaxBreedte={inhoudMaxBreedte}
                onNavigeer={() => openNavigatie(g)}
              />
            )}
          />
        </>
      )}
    </View>
  );
}

function RouteKaart({
  gebouw,
  volgorde,
  totaal,
  router,
  c,
  inhoudMaxBreedte,
  onNavigeer,
}: {
  gebouw: MijnWerkGebouw;
  volgorde: number;
  totaal: number;
  router: ReturnType<typeof useRouter>;
  c: ReturnType<typeof useColors>;
  inhoudMaxBreedte: number | undefined;
  onNavigeer: () => void;
}) {
  const openKleur =
    gebouw.spots.filter((s) => s.status === "geplaatst" || s.status === "concept").length;
  const hasAdres = !!(gebouw.adres || gebouw.stad);

  return (
    <View
      style={{
        width: "100%",
        maxWidth: inhoudMaxBreedte,
        alignSelf: "center",
        backgroundColor: c.card,
        borderRadius: c.radius,
        borderWidth: 1,
        borderColor: c.border,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: 14,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: c.primary,
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Text
            style={{ color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" }}
          >
            {volgorde}
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={{ color: c.foreground, fontSize: 15, fontFamily: "Inter_700Bold" }}
            numberOfLines={1}
          >
            {gebouw.gebouw_naam}
          </Text>
          {hasAdres ? (
            <Text
              style={{
                color: c.mutedForeground,
                fontSize: 12,
                fontFamily: "Inter_400Regular",
                marginTop: 2,
              }}
              numberOfLines={1}
            >
              {gebouw.adres}
              {gebouw.stad ? `, ${gebouw.stad}` : ""}
            </Text>
          ) : null}
        </View>

        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <View
            style={{
              backgroundColor: c.primary + "22",
              borderRadius: 10,
              paddingHorizontal: 9,
              paddingVertical: 3,
            }}
          >
            <Text style={{ color: c.primary, fontSize: 12, fontFamily: "Inter_700Bold" }}>
              {gebouw.spots.length} spot{gebouw.spots.length !== 1 ? "s" : ""}
            </Text>
          </View>
          {openKleur > 0 ? (
            <Text
              style={{ color: c.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular" }}
            >
              {openKleur} open
            </Text>
          ) : null}
        </View>
      </View>

      <View
        style={{
          flexDirection: "row",
          borderTopWidth: 1,
          borderTopColor: c.border,
        }}
      >
        <Pressable
          onPress={() => router.push(`/gebouw/${gebouw.gebouw_id}`)}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingVertical: 10,
            borderRightWidth: hasAdres ? 1 : 0,
            borderRightColor: c.border,
          }}
        >
          <Ionicons name="business-outline" size={15} color={c.primary} />
          <Text style={{ color: c.primary, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
            Gebouw openen
          </Text>
        </Pressable>

        {hasAdres ? (
          <Pressable
            onPress={onNavigeer}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingVertical: 10,
            }}
          >
            <Ionicons name="navigate-outline" size={15} color={c.primary} />
            <Text style={{ color: c.primary, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
              Navigeren
            </Text>
          </Pressable>
        ) : null}
      </View>

      {volgorde < totaal ? (
        <View
          style={{
            alignItems: "center",
            paddingVertical: 6,
            backgroundColor: c.muted,
          }}
        >
          <Ionicons name="arrow-down" size={14} color={c.mutedForeground} />
        </View>
      ) : null}
    </View>
  );
}
