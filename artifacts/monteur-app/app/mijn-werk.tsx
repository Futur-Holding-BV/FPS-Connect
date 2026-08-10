import { useGetMijnWerk } from "@workspace/api-client-react";
import type { MijnWerkGebouw, MijnWerkSpot } from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import { beweging, ruimte } from "@workspace/ontwerp";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback } from "react";
import { Platform, Pressable, SectionList, Text, View } from "react-native";
import Animated, { FadeInDown, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Kaart,
  Ladenstaat,
  LegeStaat,
  LijstFout,
  Statusmerk,
  bovenInset,
  tekstStijl,
} from "@/components/ui";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import { useAuth } from "@/context/auth";
import { useSync } from "@/context/sync";
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

// Statussen → soort Statusmerk (kleur komt uit het palet, niet uit dit bestand).
const STATUS_SOORT: Record<string, "neutraal" | "succes" | "waarschuwing" | "fout" | "primair"> = {
  concept: "neutraal",
  voorbereid: "neutraal",
  geplaatst: "primair",
  goedgekeurd: "succes",
  afgekeurd: "fout",
  ter_inspectie: "waarschuwing",
  hersteld: "succes",
  vervangen: "primair",
};

const STATUSLABEL: Record<string, string> = {
  concept: "Concept",
  voorbereid: "Voorbereid",
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
  const { token, bezigLaden } = useAuth();
  const { inhoudMaxBreedte } = useResponsive();
  const rustig = useReducedMotion();

  const { syncStatus, aantalWachtend, aantalMislukt, mislukteItems, wisMislukte, forceerSync, verwijderEnkelMislukt, herprobeeerEnkel, herprobeeerAlle } =
    useSync();

  const { data, isLoading, isError, refetch } = useGetMijnWerk();

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  // Niet redirecten zolang het token nog uit de opslag hersteld wordt: anders
  // verliest elke deep-link (web-URL, pushnotificatie) de race en eindigt op
  // /login → /menu.
  if (bezigLaden) return null;
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

  const aantalVoorbereid = (data ?? []).reduce(
    (som: number, g: MijnWerkGebouw) =>
      som + g.spots.filter((s: MijnWerkSpot) => s.status === "voorbereid").length,
    0,
  );

  const verschijn = (volgorde: number) =>
    rustig || Platform.OS === "web"
      ? undefined
      : FadeInDown.duration(beweging.normaal).delay(Math.min(volgorde, 8) * (beweging.snel / 3));

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <LinearGradient
        colors={[c.dark, c.darkMuted + "33", c.dark]}
        locations={[0, 0.85, 1]}
        style={{
          backgroundColor: c.dark,
          paddingTop: bovenInset(insets) + ruimte.m,
          paddingHorizontal: ruimte.l + ruimte.xs,
          paddingBottom: ruimte.l,
        }}
      >
        <View style={{ width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
          <Pressable onPress={() => router.back()} style={{ marginBottom: ruimte.s + 2 }}>
            <Text style={tekstStijl("nadruk", c.tint)}>‹ Terug</Text>
          </Pressable>
          <Text style={tekstStijl("schermtitel", c.darkForeground)}>Mijn werk</Text>
          {!isLoading && !isError && (
            <Text style={[tekstStijl("klein", c.darkMuted), { marginTop: ruimte.xs }]}>
              {totaalSpots === 0
                ? "Geen spots aan u toegewezen"
                : `${totaalSpots} spot${totaalSpots !== 1 ? "s" : ""} in ${(data ?? []).length} gebouw${(data ?? []).length !== 1 ? "en" : ""}`}
              {aantalVoorbereid > 0
                ? ` · ${aantalVoorbereid} nog af te werken`
                : ""}
            </Text>
          )}
          <View style={{ marginTop: ruimte.s + 2 }}>
            <SyncStatusBadge
              status={syncStatus}
              aantalWachtend={aantalWachtend}
              aantalMislukt={aantalMislukt}
              mislukteItems={mislukteItems}
              onWisMislukte={wisMislukte}
              onForceerSync={forceerSync}
              onVerwijderItem={verwijderEnkelMislukt}
              onHerprobeeerItem={herprobeeerEnkel}
              onHerprobeeerAlle={herprobeeerAlle}
            />
          </View>
        </View>
      </LinearGradient>

      {isLoading ? (
        <View
          style={{
            flex: 1,
            padding: ruimte.xl,
            width: "100%",
            maxWidth: inhoudMaxBreedte,
            alignSelf: "center",
          }}
        >
          <Ladenstaat regels={5} />
        </View>
      ) : isError ? (
        <LijstFout
          beschrijving="Mijn werk kon niet worden geladen. Controleer uw verbinding en probeer opnieuw."
          onOpnieuw={() => refetch()}
        />
      ) : secties.length === 0 ? (
        <LegeStaat
          icoon="checkmark-circle-outline"
          titel="Geen openstaand werk"
          beschrijving="Er zijn momenteel geen spots aan u toegewezen. Zodra een beheerder u een spot toewijst, verschijnt die hier."
        />
      ) : (
        <SectionList
          sections={secties}
          keyExtractor={(spot: MijnWerkSpot) => String(spot.id)}
          contentContainerStyle={{ padding: ruimte.m + 2, paddingBottom: insets.bottom + ruimte.xl }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <GebouwKop
              gebouw={section.gebouw}
              router={router}
              c={c}
              inhoudMaxBreedte={inhoudMaxBreedte}
            />
          )}
          renderItem={({ item: spot, index }) => (
            <Animated.View entering={verschijn(index)}>
              <SpotRij
                spot={spot}
                gebouw={secties.find((s) => s.data.includes(spot))?.gebouw}
                router={router}
                c={c}
                inhoudMaxBreedte={inhoudMaxBreedte}
              />
            </Animated.View>
          )}
          SectionSeparatorComponent={() => <View style={{ height: ruimte.l }} />}
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
        marginBottom: ruimte.xs + 2,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: ruimte.xs,
          paddingBottom: ruimte.xs + 2,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
          marginBottom: ruimte.xs,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={tekstStijl("nadruk", c.foreground)}>{gebouw.gebouw_naam}</Text>
          {gebouw.adres ? (
            <Text style={[tekstStijl("bijschrift", c.mutedForeground), { marginTop: 1 }]}>
              {gebouw.adres}
              {gebouw.stad ? `, ${gebouw.stad}` : ""}
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.xs }}>
          <View
            style={{
              backgroundColor: c.accent,
              borderRadius: c.radius - 2,
              paddingHorizontal: ruimte.s + 2,
              paddingVertical: ruimte.xs - 1,
            }}
          >
            <Text style={tekstStijl("bijschrift", c.accentForeground)}>{gebouw.spots.length}</Text>
          </View>
          <Ionicons name="chevron-forward" size={ruimte.l} color={c.mutedForeground} />
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
  function navigeer() {
    if (spot.verdieping_id) {
      router.push({
        pathname: "/plattegrond/[verdiepingId]",
        params: {
          verdiepingId: String(spot.verdieping_id),
          gebouwId: gebouw ? String(gebouw.gebouw_id) : "",
          spotId: String(spot.id),
        },
      });
    } else if (gebouw) {
      router.push(`/gebouw/${gebouw.gebouw_id}`);
    }
  }

  return (
    <Pressable
      onPress={navigeer}
      style={({ pressed }) => ({
        width: "100%",
        maxWidth: inhoudMaxBreedte,
        alignSelf: "center",
        marginBottom: ruimte.xs + 2,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Kaart stijl={{ paddingHorizontal: ruimte.m + 2, paddingVertical: ruimte.m }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.m }}>
          <View style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: ruimte.s,
              }}
            >
              <Text style={[tekstStijl("nadruk", c.foreground), { flexShrink: 1 }]} numberOfLines={1}>
                {spot.objectnummer || "—"}
              </Text>
              <Statusmerk
                label={STATUSLABEL[spot.status] ?? spot.status}
                soort={STATUS_SOORT[spot.status] ?? "neutraal"}
              />
            </View>
            <Text
              style={[tekstStijl("klein", c.mutedForeground), { marginTop: 2 }]}
              numberOfLines={1}
            >
              {TYPEN[spot.type] ?? spot.type}
              {spot.ruimte ? ` · ${spot.ruimte}` : ""}
              {spot.verdieping_naam ? ` · ${spot.verdieping_naam}` : ""}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={ruimte.l}
            color={c.mutedForeground}
            style={{ flexShrink: 0 }}
          />
        </View>
      </Kaart>
    </Pressable>
  );
}
