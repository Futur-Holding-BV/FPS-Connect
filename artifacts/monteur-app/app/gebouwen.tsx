import { Ionicons } from "@expo/vector-icons";
import { useListGebouwen } from "@workspace/api-client-react";
import { Redirect, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ruimte } from "@workspace/ontwerp";

import { LijstFout, Ladenstaat, TekstVeld, tekstStijl, bovenInset } from "@/components/ui";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { useAuth } from "@/context/auth";
import { useSync } from "@/context/sync";
import { BevoegdheidGuard } from "@/components/BevoegdheidGuard";

function Gebouwen() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { kolommen, inhoudMaxBreedte, breedte } = useResponsive();
  const RASTER_GAP = 12;
  const beschikbareBreedte = Math.min(breedte, inhoudMaxBreedte ?? breedte) - 32;
  const itemBreedte =
    kolommen > 1 ? (beschikbareBreedte - RASTER_GAP * (kolommen - 1)) / kolommen : undefined;
  const { gebruiker, token, uitloggen } = useAuth();
  const { syncStatus, aantalWachtend, aantalMislukt, mislukteItems, wisMislukte, forceerSync, isSyncing, verwijderEnkelMislukt, herprobeeerEnkel, herprobeeerAlle } =
    useSync();
  const [zoek, setZoek] = useState("");

  const { data, isLoading, isError, refetch, isRefetching } = useListGebouwen();

  if (!token) return <Redirect href="/login" />;

  const gebouwen = (data ?? [])
    .filter((g) => {
      if (!zoek.trim()) return true;
      const q = zoek.toLowerCase();
      return (
        g.naam.toLowerCase().includes(q) ||
        g.adres.toLowerCase().includes(q) ||
        (g.stad ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const ta = a.mijn_laatste_spot_op ? new Date(a.mijn_laatste_spot_op).getTime() : 0;
      const tb = b.mijn_laatste_spot_op ? new Date(b.mijn_laatste_spot_op).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return a.naam.localeCompare(b.naam, "nl");
    });

  async function herlaadMetSync() {
    await forceerSync();
    await refetch();
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={{
          backgroundColor: c.dark,
          paddingTop: bovenInset(insets) + ruimte.m + 2,
          paddingHorizontal: ruimte.xl,
          paddingBottom: ruimte.l,
        }}
      >
        <View style={{ width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
        <View>
          <View style={{ width: "100%" }}>
            <Text style={[tekstStijl("bijschrift", c.primary), { fontFamily: "Inter_700Bold", letterSpacing: 1.5, textTransform: "uppercase" }]}>
              FPS Brandpreventie
            </Text>
            <Text style={tekstStijl("klein", c.darkMuted)}>
              Welkom terug
            </Text>
            <Text style={tekstStijl("sectiekop", c.darkForeground)}>
              {gebruiker?.naam ?? "Monteur"}
            </Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", alignItems: "center", gap: ruimte.s, marginTop: ruimte.m + 2 }}>
            <Pressable
              onPress={() => router.push("/menu")}
              accessibilityLabel="Naar hoofdmenu"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: ruimte.s - 2,
                paddingHorizontal: ruimte.m + 2,
                paddingVertical: ruimte.s + 1,
                borderRadius: c.radius / 2,
                backgroundColor: c.darkForeground + "1F",
              }}
            >
              <Ionicons name="grid" size={15} color={c.darkForeground} />
              <Text style={tekstStijl("standaard", c.darkForeground)}>
                Menu
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/documenten")}
              style={{
                paddingHorizontal: ruimte.m + 2,
                paddingVertical: ruimte.s + 1,
                borderRadius: c.radius / 2,
                backgroundColor: c.darkForeground + "1F",
              }}
            >
              <Text style={tekstStijl("standaard", c.darkForeground)}>
                Documenten
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/hrm")}
              style={{
                paddingHorizontal: ruimte.m + 2,
                paddingVertical: ruimte.s + 1,
                borderRadius: c.radius / 2,
                backgroundColor: c.darkForeground + "1F",
              }}
            >
              <Text style={tekstStijl("standaard", c.darkForeground)}>
                Personeel
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/info")}
              style={{
                paddingHorizontal: ruimte.m + 2,
                paddingVertical: ruimte.s + 1,
                borderRadius: c.radius / 2,
                backgroundColor: c.darkForeground + "1F",
              }}
            >
              <Text style={tekstStijl("standaard", c.darkForeground)}>
                Info
              </Text>
            </Pressable>
            <Pressable
              onPress={uitloggen}
              style={{
                paddingHorizontal: ruimte.m + 2,
                paddingVertical: ruimte.s + 1,
                borderRadius: c.radius / 2,
                backgroundColor: c.darkForeground + "1F",
              }}
            >
              <Text style={tekstStijl("standaard", c.darkForeground)}>
                Uitloggen
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Sync-statusregel */}
        <View style={{ marginTop: ruimte.s + 2, flexDirection: "row", alignItems: "center", gap: ruimte.s + 2 }}>
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
          {aantalWachtend > 0 && !isSyncing && (
            <Pressable
              onPress={forceerSync}
              style={{
                paddingHorizontal: ruimte.s + 2,
                paddingVertical: ruimte.xs + 1,
                borderRadius: ruimte.xl - 4,
                backgroundColor: c.primary + "2E",
              }}
            >
              <Text style={tekstStijl("bijschrift", c.primary)}>
                Nu synchroniseren
              </Text>
            </Pressable>
          )}
        </View>

        <View style={{ marginTop: ruimte.m + 2 }}>
          <TekstVeld
            label=""
            value={zoek}
            onChangeText={setZoek}
            placeholder="Zoek gebouw, adres of stad…"
            autoCapitalize="none"
            style={{ backgroundColor: c.darkForeground + "1A", borderColor: c.darkForeground + "2E", color: c.darkForeground }}
          />
        </View>
        </View>
      </View>

      {isLoading ? (
        <View style={{ padding: ruimte.l }}>
          <Ladenstaat regels={6} />
        </View>
      ) : isError ? (
        <LijstFout
          beschrijving="De gebouwen konden niet worden geladen. Controleer je verbinding en probeer het opnieuw."
          onOpnieuw={() => refetch()}
        />
      ) : (
        <FlatList
          data={gebouwen}
          key={`kol-${kolommen}`}
          keyExtractor={(g) => String(g.id)}
          numColumns={kolommen}
          columnWrapperStyle={kolommen > 1 ? { gap: RASTER_GAP } : undefined}
          contentContainerStyle={{ padding: ruimte.m, gap: ruimte.s, paddingBottom: insets.bottom + ruimte.xl, width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching || isSyncing}
              onRefresh={herlaadMetSync}
              tintColor={c.primary}
            />
          }
          ListEmptyComponent={
            <Text style={[tekstStijl("standaard", c.mutedForeground), { textAlign: "center", marginTop: ruimte.xxl + ruimte.l }]}>
              Geen gebouwen gevonden.
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/gebouw/${item.id}`)}
              style={({ pressed }) => ({
                backgroundColor: c.card,
                borderRadius: c.radius,
                borderWidth: 1,
                borderColor: c.border,
                paddingHorizontal: ruimte.m + 2,
                paddingVertical: ruimte.m - 1,
                width: itemBreedte,
                opacity: pressed ? 0.85 : 1,
                flexDirection: "row",
                alignItems: "center",
                gap: ruimte.s + 2,
              })}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[tekstStijl("standaard", c.foreground), { fontFamily: "Inter_700Bold" }]}
                  numberOfLines={1}
                >
                  {item.projectnummer ? `${item.projectnummer} · ${item.naam}` : item.naam}
                </Text>
                <Text
                  style={[tekstStijl("bijschrift", c.mutedForeground), { marginTop: ruimte.xs / 2 }]}
                  numberOfLines={1}
                >
                  {item.adres}{item.stad ? `, ${item.stad}` : ""}
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: c.accent,
                  paddingHorizontal: ruimte.s,
                  paddingVertical: ruimte.xs,
                  borderRadius: c.radius / 2,
                  minWidth: ruimte.xxl + ruimte.m,
                  alignItems: "center",
                }}
              >
                <Text style={[tekstStijl("bijschrift", c.accentForeground), { fontFamily: "Inter_700Bold" }]}>
                  {item.totaal_voorzieningen ?? 0}
                </Text>
                <Text style={[tekstStijl("bijschrift", c.accentForeground), { fontSize: 9 }]}>
                  spots
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

// APP_01 §3.3 — schermbescherming: nette weigering zonder bevoegdheid
// (backendroute eist gebouwen niveau 1; gemeten, zie docs/metingen).
export default function GebouwenBeveiligd() {
  return (
    <BevoegdheidGuard vereiste={{ module: "gebouwen", niveau: 1 }}>
      <Gebouwen />
    </BevoegdheidGuard>
  );
}
