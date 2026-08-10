import { useGetMijnWerk } from "@workspace/api-client-react";
import type { MijnWerkGebouw } from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ruimte } from "@workspace/ontwerp";

import { OfflineBanner } from "@/components/OfflineBanner";
import { LijstFout, Ladenstaat, LegeStaat, tekstStijl, bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useOffline } from "@/context/offline";
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
  void Linking.openURL(url);
}

export default function PlanningScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { inhoudMaxBreedte } = useResponsive();
  const { isOnline, isDownloading, downloadVandaag, getCachedPlanning, gecachedOp } = useOffline();

  const { data, isLoading, isError, refetch } = useGetMijnWerk();
  const [cachedPlanning, setCachedPlanning] = useState<MijnWerkGebouw[] | null>(null);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  useEffect(() => {
    if (!isOnline || isError) {
      getCachedPlanning().then((cached) => {
        if (cached) setCachedPlanning(cached as MijnWerkGebouw[]);
      });
    }
  }, [isOnline, isError, getCachedPlanning]);

  if (!token) return <Redirect href="/login" />;

  const bronData = (isOnline ? data : null) ?? cachedPlanning ?? data ?? [];
  const gesorteerd = sorteerOpRoute(bronData);
  const isOfflineCache = !isOnline && !!cachedPlanning;

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
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={tekstStijl("schermtitel", c.darkForeground)}>
                Routeplanning
              </Text>
              <Text
                style={[
                  tekstStijl("klein", c.darkMuted),
                  { marginTop: ruimte.xs, textTransform: "capitalize" },
                ]}
              >
                {vandaag}
              </Text>
            </View>
            {/* Download-knop voor offline gebruik */}
            {isOnline ? (
              <Pressable
                onPress={() => void downloadVandaag()}
                disabled={isDownloading}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: ruimte.xs + 1,
                  backgroundColor: pressed ? c.primary + "4D" : c.primary + "26",
                  paddingHorizontal: ruimte.m,
                  paddingVertical: ruimte.s,
                  borderRadius: c.radius / 2,
                  opacity: isDownloading ? 0.6 : 1,
                  marginTop: ruimte.xs,
                })}
              >
                {isDownloading ? (
                  <ActivityIndicator size={13} color={c.primary} />
                ) : (
                  <Ionicons name="download-outline" size={15} color={c.primary} />
                )}
                <Text style={tekstStijl("bijschrift", c.primary)}>
                  {isDownloading ? "Laden..." : "Offline opslaan"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      <OfflineBanner stijl="volledig" />
      {isOfflineCache ? (
        <View
          style={{
            backgroundColor: c.warning + "14",
            paddingHorizontal: ruimte.l,
            paddingVertical: ruimte.s - 2,
            flexDirection: "row",
            alignItems: "center",
            gap: ruimte.s - 2,
          }}
        >
          <Ionicons name="time-outline" size={13} color={c.warning} />
          <Text style={tekstStijl("bijschrift", c.warning)}>
            Routeplanning uit lokale cache
            {gecachedOp ? ` (geladen op ${new Date(gecachedOp).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })})` : ""}
          </Text>
        </View>
      ) : null}

      {isLoading && !cachedPlanning ? (
        <View style={{ padding: ruimte.l }}>
          <Ladenstaat regels={6} />
        </View>
      ) : isError && !cachedPlanning ? (
        <LijstFout
          beschrijving="De routeplanning kon niet worden geladen. Controleer uw verbinding en probeer opnieuw."
          onOpnieuw={() => void refetch()}
        />
      ) : gesorteerd.length === 0 ? (
        <LegeStaat
          icoon="calendar-outline"
          titel="Geen gepland werk"
          beschrijving="Er zijn geen spots aan u toegewezen. Uw routeplanning wordt automatisch samengesteld op basis van toegewezen werk."
        />
      ) : (
        <>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: ruimte.s,
              paddingHorizontal: ruimte.xl,
              paddingVertical: ruimte.s + 2,
              borderBottomWidth: 1,
              borderBottomColor: c.border,
            }}
          >
            <Ionicons name="information-circle-outline" size={ruimte.l} color={c.mutedForeground} />
            <Text
              style={[tekstStijl("bijschrift", c.mutedForeground), { flex: 1 }]}
            >
              {gesorteerd.length} locatie{gesorteerd.length !== 1 ? "s" : ""} gesorteerd op adres.
              Tik op een adres om navigatie te openen.
            </Text>
          </View>

          <FlatList
            data={gesorteerd}
            keyExtractor={(g: MijnWerkGebouw) => String(g.gebouw_id)}
            contentContainerStyle={{
              padding: ruimte.m + 2,
              paddingBottom: insets.bottom + ruimte.xl,
              gap: ruimte.s + 2,
            }}
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.m, padding: ruimte.m + 2 }}>
        <View
          style={{
            width: ruimte.xxl + ruimte.xs,
            height: ruimte.xxl + ruimte.xs,
            borderRadius: (ruimte.xxl + ruimte.xs) / 2,
            backgroundColor: c.primary,
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Text style={[tekstStijl("standaard", c.primaryForeground), { fontFamily: "Inter_700Bold" }]}>
            {volgorde}
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={[tekstStijl("nadruk", c.foreground), { fontFamily: "Inter_700Bold" }]}
            numberOfLines={1}
          >
            {gebouw.gebouw_naam}
          </Text>
          {hasAdres ? (
            <Text
              style={[tekstStijl("bijschrift", c.mutedForeground), { marginTop: ruimte.xs / 2 }]}
              numberOfLines={1}
            >
              {gebouw.adres}
              {gebouw.stad ? `, ${gebouw.stad}` : ""}
            </Text>
          ) : null}
        </View>

        <View style={{ alignItems: "flex-end", gap: ruimte.xs }}>
          <View
            style={{
              backgroundColor: c.primary + "22",
              borderRadius: c.radius / 2,
              paddingHorizontal: ruimte.s + 1,
              paddingVertical: ruimte.xs - 1,
            }}
          >
            <Text style={[tekstStijl("bijschrift", c.primary), { fontFamily: "Inter_700Bold" }]}>
              {gebouw.spots.length} spot{gebouw.spots.length !== 1 ? "s" : ""}
            </Text>
          </View>
          {openKleur > 0 ? (
            <Text style={tekstStijl("bijschrift", c.mutedForeground)}>
              {openKleur} open
            </Text>
          ) : null}
        </View>
      </View>

      <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: c.border }}>
        <Pressable
          onPress={() => router.push(`/gebouw/${gebouw.gebouw_id}`)}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: ruimte.s - 2,
            paddingVertical: ruimte.s + 2,
            borderRightWidth: hasAdres ? 1 : 0,
            borderRightColor: c.border,
          }}
        >
          <Ionicons name="business-outline" size={15} color={c.primary} />
          <Text style={[tekstStijl("klein", c.primary), { fontFamily: "Inter_600SemiBold" }]}>
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
              gap: ruimte.s - 2,
              paddingVertical: ruimte.s + 2,
            }}
          >
            <Ionicons name="navigate-outline" size={15} color={c.primary} />
            <Text style={[tekstStijl("klein", c.primary), { fontFamily: "Inter_600SemiBold" }]}>
              Navigeren
            </Text>
          </Pressable>
        ) : null}
      </View>

      {volgorde < totaal ? (
        <View style={{ alignItems: "center", paddingVertical: ruimte.s - 2, backgroundColor: c.muted }}>
          <Ionicons name="arrow-down" size={ruimte.m + 2} color={c.mutedForeground} />
        </View>
      ) : null}
    </View>
  );
}
