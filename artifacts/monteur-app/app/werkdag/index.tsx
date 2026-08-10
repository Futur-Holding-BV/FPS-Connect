import { useGetMijnWerk, useGetWerkdagVandaag } from "@workspace/api-client-react";
import type { MijnWerkGebouw, WerkdagItem } from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, Redirect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ruimte } from "@workspace/ontwerp";

import { OfflineBanner } from "@/components/OfflineBanner";
import { bovenInset, Ladenstaat, LegeStaat, LijstFout, netteWaarde, Statusmerk, tekstStijl } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useOffline } from "@/context/offline";
import { useColors } from "@/hooks/useColors";
import { leesWerkorders, leesPlanning } from "@/lib/offlineCache";

// Statussen → soort Statusmerk (kleur komt uit het palet, niet uit dit bestand).
const UITVOERING_SOORT: Record<string, "neutraal" | "succes" | "waarschuwing" | "fout" | "primair"> = {
  gepland: "neutraal",
  bezig: "primair",
  pauze: "waarschuwing",
  gereed: "succes",
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

function soortKleur(c: ReturnType<typeof useColors>, soort: string): string {
  return soort === "succes"
    ? c.success
    : soort === "waarschuwing"
      ? c.warning
      : soort === "fout"
        ? c.destructive
        : soort === "primair"
          ? c.tint
          : c.mutedForeground;
}

function StatusDot({ status }: { status: string }) {
  const c = useColors();
  const kleur = soortKleur(c, UITVOERING_SOORT[status] ?? "neutraal");
  return (
    <View
      style={{
        width: ruimte.s,
        height: ruimte.s,
        borderRadius: ruimte.xs,
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
  const label = UITVOERING_LABEL[item.uitvoering_status] ?? netteWaarde(item.uitvoering_status);
  const soort = UITVOERING_SOORT[item.uitvoering_status] ?? "neutraal";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "flex-start",
        gap: ruimte.m,
        paddingVertical: ruimte.m + 2,
        paddingHorizontal: ruimte.l,
        backgroundColor: pressed ? c.muted : "transparent",
      })}
    >
      <View style={{ width: ruimte.xxl + ruimte.l, alignItems: "flex-end", paddingTop: 2, flexShrink: 0 }}>
        {item.tijd_start ? (
          <Text style={tekstStijl("klein", c.mutedForeground)}>
            {item.tijd_start}
          </Text>
        ) : (
          <Text style={tekstStijl("klein", c.border)}>–</Text>
        )}
      </View>

      <View style={{ paddingTop: ruimte.xs, flexShrink: 0 }}>
        <StatusDot status={item.uitvoering_status} />
        {item.tijd_eind ? (
          <View
            style={{
              width: 1,
              flex: 1,
              backgroundColor: c.border,
              alignSelf: "center",
              marginTop: ruimte.xs,
              minHeight: 20,
            }}
          />
        ) : null}
      </View>

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.s, marginBottom: 2 }}>
          <Text
            style={[tekstStijl("nadruk", c.foreground), { flex: 1 }]}
            numberOfLines={2}
          >
            {item.project_naam ?? item.titel}
            {item.werknummer ? `  #${item.werknummer}` : ""}
          </Text>
          <Statusmerk label={label} soort={soort} />
        </View>

        {item.locaties ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.xs }}>
            <Ionicons name="location-outline" size={ruimte.m} color={c.mutedForeground} />
            <Text
              style={tekstStijl("klein", c.mutedForeground)}
              numberOfLines={1}
            >
              {item.locaties}
            </Text>
          </View>
        ) : null}

        {item.omschrijving ? (
          <Text
            style={[tekstStijl("klein", c.mutedForeground), { marginTop: 2 }]}
            numberOfLines={1}
          >
            {item.omschrijving}
          </Text>
        ) : null}
      </View>

      <Ionicons
        name="chevron-forward"
        size={ruimte.l - 2}
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
        gap: ruimte.s,
        paddingHorizontal: ruimte.m,
        paddingVertical: ruimte.s,
        borderRadius: c.radius,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: pressed ? c.muted : c.card,
        marginRight: ruimte.s,
      })}
    >
      <View
        style={{
          width: ruimte.xl,
          height: ruimte.xl,
          borderRadius: ruimte.m,
          backgroundColor: c.primary,
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Ionicons name="business-outline" size={ruimte.m} color={c.primaryForeground} />
      </View>
      <View style={{ maxWidth: 140 }}>
        <Text
          style={tekstStijl("nadruk", c.foreground)}
          numberOfLines={1}
        >
          {gebouw.gebouw_naam}
        </Text>
        {(gebouw.adres || gebouw.stad) ? (
          <Text
            style={tekstStijl("bijschrift", c.mutedForeground)}
            numberOfLines={1}
          >
            {gebouw.adres}
            {gebouw.stad ? `, ${gebouw.stad}` : ""}
          </Text>
        ) : null}
      </View>
      <Text style={tekstStijl("bijschrift", c.mutedForeground)}>
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
          paddingTop: bovenInset(insets) + ruimte.s,
          paddingHorizontal: ruimte.l + ruimte.xs,
          paddingBottom: ruimte.m + 2,
          backgroundColor: c.dark,
        }}
      >
        <Text
          style={[
            tekstStijl("bijschrift", c.primary),
            { letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 },
          ]}
        >
          {vandaagNederlands()}
        </Text>
        <Text style={tekstStijl("schermtitel", c.darkForeground)}>
          Mijn werkdag
        </Text>
      </View>

      <OfflineBanner stijl="compact" />
      {isOfflineCache ? (
        <View
          style={{
            backgroundColor: c.secondary,
            paddingHorizontal: ruimte.l,
            paddingVertical: ruimte.xs + 1,
            flexDirection: "row",
            alignItems: "center",
            gap: ruimte.xs + 2,
          }}
        >
          <Ionicons name="time-outline" size={ruimte.m} color={c.warning} />
          <Text style={tekstStijl("bijschrift", c.warning)}>
            Gegevens uit lokale cache
          </Text>
        </View>
      ) : null}

      {isLaden ? (
        <View style={{ flex: 1, padding: ruimte.l }}>
          <Ladenstaat regels={5} />
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
                  paddingHorizontal: ruimte.l,
                  paddingVertical: ruimte.m,
                  backgroundColor: pressed ? c.muted : c.card,
                  borderBottomWidth: 1,
                  borderBottomColor: c.border,
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.s + 2 }}>
                  <View
                    style={{
                      width: ruimte.xxl,
                      height: ruimte.xxl,
                      borderRadius: c.radius / 2,
                      backgroundColor: c.accent,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="navigate-outline" size={ruimte.l} color={c.primary} />
                  </View>
                  <View>
                    <Text style={tekstStijl("nadruk", c.foreground)}>
                      Routeplanning
                    </Text>
                    {locaties.length > 0 ? (
                      <Text style={tekstStijl("bijschrift", c.mutedForeground)}>
                        {locaties.length} locatie{locaties.length !== 1 ? "s" : ""} vandaag
                        {isOfflineCache ? " (cache)" : ""}
                      </Text>
                    ) : ladenWerk && isOnline ? (
                      <Text style={tekstStijl("bijschrift", c.mutedForeground)}>
                        Laden…
                      </Text>
                    ) : (
                      <Text style={tekstStijl("bijschrift", c.mutedForeground)}>
                        {isOnline ? "Geen locaties ingepland" : "Geen cache beschikbaar"}
                      </Text>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={ruimte.l} color={c.mutedForeground} />
              </Pressable>

              {/* Locatie-pills (horizontaal scrollen) */}
              {locaties.length > 0 ? (
                <FlatList
                  data={locaties}
                  keyExtractor={(g) => `loc-${g.gebouw_id}`}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: ruimte.l, paddingVertical: ruimte.s + 2 }}
                  renderItem={({ item }) => (
                    <LocatiePill gebouw={item} router={router} c={c} />
                  )}
                />
              ) : null}

              {/* Sectie kop werkorders */}
              <View
                style={{
                  paddingHorizontal: ruimte.l,
                  paddingTop: ruimte.l,
                  paddingBottom: ruimte.xs + 2,
                  borderTopWidth: locaties.length > 0 ? 1 : 0,
                  borderTopColor: c.border,
                }}
              >
                <Text
                  style={[
                    tekstStijl("bijschrift", c.mutedForeground),
                    { textTransform: "uppercase", letterSpacing: 0.5 },
                  ]}
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
              isOnline ? (
                <LijstFout
                  beschrijving="Werkorders konden niet worden geladen."
                  onOpnieuw={() => void herlaadWerkorders()}
                />
              ) : (
                <LegeStaat
                  icoon="cloud-offline-outline"
                  titel="Geen verbinding"
                  beschrijving={"Geen verbinding en geen cache beschikbaar.\nDownload de planning op kantoor voordat je vertrekt."}
                />
              )
            ) : (
              <LegeStaat
                icoon="calendar-outline"
                titel="Geen werkorders"
                beschrijving="Geen werkorders voor vandaag."
              />
            )
          }
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: c.border, marginLeft: ruimte.xxl + ruimte.xl + ruimte.xl + ruimte.m }} />
          )}
          renderItem={({ item }) => (
            <WerkorderRij
              item={item}
              onPress={() => router.push(`/werkdag/${item.id}`)}
            />
          )}
          contentContainerStyle={{ paddingBottom: insets.bottom + ruimte.xl }}
        />
      )}
    </View>
  );
}
