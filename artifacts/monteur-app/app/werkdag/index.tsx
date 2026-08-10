import { useGetMijnWerk, useGetWerkdagVandaag } from "@workspace/api-client-react";
import type { MijnWerkGebouw, WerkdagItem } from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, Redirect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OfflineBanner } from "@/components/OfflineBanner";
import { bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useOffline } from "@/context/offline";
import { useColors } from "@/hooks/useColors";
import { leesWerkorders, leesPlanning } from "@/lib/offlineCache";

const UITVOERING_KLEUR: Record<string, string> = {
  gepland: "#6b7280",
  bezig: "#F23B0D",
  pauze: "#d97706",
  gereed: "#16a34a",
};

const UITVOERING_LABEL: Record<string, string> = {
  gepland: "Gepland",
  bezig: "In uitvoering",
  pauze: "Pauze",
  gereed: "Gereed",
};

function vandaagNederlands(): string {
  return new Date().toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function StatusDot({ status }: { status: string }) {
  const kleur = UITVOERING_KLEUR[status] ?? "#6b7280";
  return (
    <View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: kleur,
        marginTop: 2,
        flexShrink: 0,
      }}
    />
  );
}

function WerkorderRij({
  item,
  onPress,
}: {
  item: WerkdagItem;
  onPress: () => void;
}) {
  const c = useColors();
  const kleur = UITVOERING_KLEUR[item.uitvoering_status] ?? "#6b7280";
  const label = UITVOERING_LABEL[item.uitvoering_status] ?? item.uitvoering_status;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: pressed ? c.muted : "transparent",
      })}
    >
      <View style={{ width: 48, alignItems: "flex-end", paddingTop: 2, flexShrink: 0 }}>
        {item.tijd_start ? (
          <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>
            {item.tijd_start}
          </Text>
        ) : (
          <Text style={{ color: c.border, fontSize: 12 }}>–</Text>
        )}
      </View>

      <View style={{ paddingTop: 4, flexShrink: 0 }}>
        <StatusDot status={item.uitvoering_status} />
        {item.tijd_eind ? (
          <View
            style={{
              width: 1,
              flex: 1,
              backgroundColor: c.border,
              alignSelf: "center",
              marginTop: 4,
              minHeight: 20,
            }}
          />
        ) : null}
      </View>

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <Text
            style={{
              color: c.foreground,
              fontSize: 14,
              fontFamily: "Inter_600SemiBold",
              flex: 1,
            }}
            numberOfLines={2}
          >
            {item.project_naam ?? item.titel}
            {item.werknummer ? `  #${item.werknummer}` : ""}
          </Text>
          <View
            style={{
              backgroundColor: kleur + "22",
              borderRadius: 4,
              paddingHorizontal: 6,
              paddingVertical: 2,
              flexShrink: 0,
            }}
          >
            <Text style={{ color: kleur, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>
              {label}
            </Text>
          </View>
        </View>

        {item.locaties ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="location-outline" size={12} color={c.mutedForeground} />
            <Text
              style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}
              numberOfLines={1}
            >
              {item.locaties}
            </Text>
          </View>
        ) : null}

        {item.omschrijving ? (
          <Text
            style={{
              color: c.mutedForeground,
              fontSize: 12,
              fontFamily: "Inter_400Regular",
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            {item.omschrijving}
          </Text>
        ) : null}
      </View>

      <Ionicons
        name="chevron-forward"
        size={14}
        color={c.border}
        style={{ paddingTop: 2, flexShrink: 0 }}
      />
    </Pressable>
  );
}

function LocatiePill({
  gebouw,
  router,
  c,
}: {
  gebouw: MijnWerkGebouw;
  router: ReturnType<typeof useRouter>;
  c: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      onPress={() => router.push(`/gebouw/${gebouw.gebouw_id}`)}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: pressed ? c.muted : c.card,
        marginRight: 8,
      })}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: c.primary,
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Ionicons name="business-outline" size={12} color="#fff" />
      </View>
      <View style={{ maxWidth: 140 }}>
        <Text
          style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}
          numberOfLines={1}
        >
          {gebouw.gebouw_naam}
        </Text>
        {(gebouw.adres || gebouw.stad) ? (
          <Text
            style={{ color: c.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular" }}
            numberOfLines={1}
          >
            {gebouw.adres}
            {gebouw.stad ? `, ${gebouw.stad}` : ""}
          </Text>
        ) : null}
      </View>
      <Text style={{ color: c.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular" }}>
        {gebouw.spots.length} spots
      </Text>
    </Pressable>
  );
}

// Toegangsguard in een wrapper zodat de hook-volgorde in het scherm zelf
// constant blijft (een vroege return vóór latere hooks crasht React zodra het
// token alsnog hersteld is).
export default function WerkdagScherm() {
  const { token, bezigLaden } = useAuth();
  // Deep-link-race: niet redirecten zolang het token nog hersteld wordt.
  if (bezigLaden) return null;
  if (!token) return <Redirect href="/login" />;
  return <WerkdagSchermInhoud />;
}

function WerkdagSchermInhoud() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isOnline } = useOffline();

  const [gecachedWerkorders, setGecachedWerkorders] = useState<WerkdagItem[]>([]);
  const [gecachedLocaties, setGecachedLocaties] = useState<MijnWerkGebouw[]>([]);

  const {
    data: werkorders = [],
    isLoading: ladenWerkorders,
    isError: foutWerkorders,
    refetch: herlaadWerkorders,
    isRefetching: herladenWerkorders,
  } = useGetWerkdagVandaag();

  const {
    data: mijnWerk,
    isLoading: ladenWerk,
    refetch: herlaadWerk,
    isRefetching: herladenWerk,
  } = useGetMijnWerk();

  // Laad gecachede gegevens als fallback
  useEffect(() => {
    if (!isOnline || foutWerkorders) {
      leesWerkorders().then((cached) => {
        if (cached && cached.length > 0) {
          setGecachedWerkorders(cached as WerkdagItem[]);
        }
      });
      leesPlanning().then((cached) => {
        if (cached && cached.length > 0) {
          setGecachedLocaties(cached as MijnWerkGebouw[]);
        }
      });
    }
  }, [isOnline, foutWerkorders]);

  useFocusEffect(
    useCallback(() => {
      void herlaadWerkorders();
      void herlaadWerk();
    }, [herlaadWerkorders, herlaadWerk]),
  );

  // Kies API-data of gecachede fallback
  const toonWerkorders = isOnline && werkorders.length > 0
    ? werkorders
    : gecachedWerkorders.length > 0
      ? gecachedWerkorders
      : werkorders;

  const locaties = isOnline && (mijnWerk ?? []).length > 0
    ? (mijnWerk ?? [])
    : gecachedLocaties.length > 0
      ? gecachedLocaties
      : (mijnWerk ?? []);

  const isOfflineCache = !isOnline && (gecachedWerkorders.length > 0 || gecachedLocaties.length > 0);
  const isHerladen = herladenWerkorders || herladenWerk;
  const isLaden = (ladenWerkorders || ladenWerk) && toonWerkorders.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View
        style={{
          paddingTop: bovenInset(insets) + 10,
          paddingHorizontal: 20,
          paddingBottom: 14,
          backgroundColor: c.dark,
        }}
      >
        <Text
          style={{
            color: c.primary,
            fontSize: 10,
            fontFamily: "Inter_600SemiBold",
            letterSpacing: 1,
            textTransform: "uppercase",
            marginBottom: 2,
          }}
        >
          {vandaagNederlands()}
        </Text>
        <Text style={{ color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold" }}>
          Mijn werkdag
        </Text>
      </View>

      <OfflineBanner stijl="compact" />
      {isOfflineCache ? (
        <View
          style={{
            backgroundColor: "rgba(234,179,8,0.08)",
            paddingHorizontal: 16,
            paddingVertical: 5,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Ionicons name="time-outline" size={12} color="#facc15" />
          <Text style={{ color: "#facc15", fontSize: 11, fontFamily: "Inter_400Regular" }}>
            Gegevens uit lokale cache
          </Text>
        </View>
      ) : null}

      {isLaden ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={c.tint} size="large" />
        </View>
      ) : (
        <FlatList
          data={toonWerkorders}
          keyExtractor={(item) => `wo-${item.id}`}
          refreshControl={
            isOnline ? (
              <RefreshControl
                refreshing={isHerladen}
                onRefresh={() => { void herlaadWerkorders(); void herlaadWerk(); }}
                tintColor={c.primary}
              />
            ) : undefined
          }
          ListHeaderComponent={
            <View>
              {/* Routeplanning balk */}
              <Pressable
                onPress={() => router.push("/planning")}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  backgroundColor: pressed ? c.muted : c.card,
                  borderBottomWidth: 1,
                  borderBottomColor: c.border,
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      backgroundColor: c.primary + "1A",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="navigate-outline" size={16} color={c.primary} />
                  </View>
                  <View>
                    <Text
                      style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}
                    >
                      Routeplanning
                    </Text>
                    {locaties.length > 0 ? (
                      <Text
                        style={{
                          color: c.mutedForeground,
                          fontSize: 11,
                          fontFamily: "Inter_400Regular",
                        }}
                      >
                        {locaties.length} locatie{locaties.length !== 1 ? "s" : ""} vandaag
                        {isOfflineCache ? " (cache)" : ""}
                      </Text>
                    ) : ladenWerk && isOnline ? (
                      <Text
                        style={{
                          color: c.mutedForeground,
                          fontSize: 11,
                          fontFamily: "Inter_400Regular",
                        }}
                      >
                        Laden…
                      </Text>
                    ) : (
                      <Text
                        style={{
                          color: c.mutedForeground,
                          fontSize: 11,
                          fontFamily: "Inter_400Regular",
                        }}
                      >
                        {isOnline ? "Geen locaties ingepland" : "Geen cache beschikbaar"}
                      </Text>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={c.mutedForeground} />
              </Pressable>

              {/* Locatie-pills (horizontaal scrollen) */}
              {locaties.length > 0 ? (
                <FlatList
                  data={locaties}
                  keyExtractor={(g) => `loc-${g.gebouw_id}`}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10 }}
                  renderItem={({ item }) => (
                    <LocatiePill gebouw={item} router={router} c={c} />
                  )}
                />
              ) : null}

              {/* Sectie kop werkorders */}
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingTop: 16,
                  paddingBottom: 6,
                  borderTopWidth: locaties.length > 0 ? 1 : 0,
                  borderTopColor: c.border,
                }}
              >
                <Text
                  style={{
                    color: c.mutedForeground,
                    fontSize: 11,
                    fontFamily: "Inter_600SemiBold",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  {toonWerkorders.length > 0
                    ? `${toonWerkorders.length} werkorder${toonWerkorders.length !== 1 ? "s" : ""} vandaag`
                    : "Werkorders vandaag"}
                </Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            foutWerkorders && !isOfflineCache ? (
              <View style={{ padding: 24, alignItems: "center", gap: 12 }}>
                <Ionicons name="alert-circle-outline" size={36} color={c.mutedForeground} />
                <Text
                  style={{
                    color: c.mutedForeground,
                    fontSize: 14,
                    textAlign: "center",
                    fontFamily: "Inter_400Regular",
                  }}
                >
                  {isOnline
                    ? "Werkorders konden niet worden geladen."
                    : "Geen verbinding en geen cache beschikbaar.\nDownload de planning op kantoor voordat je vertrekt."}
                </Text>
                {isOnline ? (
                  <Pressable
                    onPress={() => void herlaadWerkorders()}
                    style={{
                      backgroundColor: c.primary,
                      borderRadius: 8,
                      paddingHorizontal: 16,
                      paddingVertical: 9,
                    }}
                  >
                    <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 }}>
                      Opnieuw proberen
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View style={{ padding: 24, alignItems: "center", gap: 8 }}>
                <Ionicons name="calendar-outline" size={36} color={c.border} />
                <Text
                  style={{
                    color: c.mutedForeground,
                    fontSize: 14,
                    textAlign: "center",
                    fontFamily: "Inter_400Regular",
                  }}
                >
                  Geen werkorders voor vandaag.
                </Text>
              </View>
            )
          }
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: c.border, marginLeft: 76 }} />
          )}
          renderItem={({ item }) => (
            <WerkorderRij
              item={item}
              onPress={() => router.push(`/werkdag/${item.id}`)}
            />
          )}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        />
      )}
    </View>
  );
}
