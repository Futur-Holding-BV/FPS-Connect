import { Ionicons } from "@expo/vector-icons";
import { useListGebouwen } from "@workspace/api-client-react";
import { Redirect, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LijstFout, TekstVeld, bovenInset } from "@/components/ui";
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
          paddingTop: bovenInset(insets) + 14,
          paddingHorizontal: 20,
          paddingBottom: 18,
        }}
      >
        <View style={{ width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
        <View>
          <View style={{ width: "100%" }}>
            <Text style={{ color: c.primary, fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.5, textTransform: "uppercase" }}>
              FPS Brandpreventie
            </Text>
            <Text style={{ color: c.darkMuted, fontSize: 13, fontFamily: "Inter_400Regular" }}>
              Welkom terug
            </Text>
            <Text style={{ color: c.darkForeground, fontSize: 20, fontFamily: "Inter_700Bold" }}>
              {gebruiker?.naam ?? "Monteur"}
            </Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", alignItems: "center", gap: 8, marginTop: 14 }}>
            <Pressable
              onPress={() => router.push("/menu")}
              accessibilityLabel="Naar hoofdmenu"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 10,
                backgroundColor: "rgba(255,255,255,0.12)",
              }}
            >
              <Ionicons name="grid" size={15} color={c.darkForeground} />
              <Text style={{ color: c.darkForeground, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
                Menu
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/documenten")}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 10,
                backgroundColor: "rgba(255,255,255,0.12)",
              }}
            >
              <Text style={{ color: c.darkForeground, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
                Documenten
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/hrm")}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 10,
                backgroundColor: "rgba(255,255,255,0.12)",
              }}
            >
              <Text style={{ color: c.darkForeground, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
                Personeel
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/info")}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 10,
                backgroundColor: "rgba(255,255,255,0.12)",
              }}
            >
              <Text style={{ color: c.darkForeground, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
                Info
              </Text>
            </Pressable>
            <Pressable
              onPress={uitloggen}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 10,
                backgroundColor: "rgba(255,255,255,0.12)",
              }}
            >
              <Text style={{ color: c.darkForeground, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
                Uitloggen
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Sync-statusregel */}
        <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
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
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 20,
                backgroundColor: "rgba(242,59,13,0.18)",
              }}
            >
              <Text style={{ color: c.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                Nu synchroniseren
              </Text>
            </Pressable>
          )}
        </View>

        <View style={{ marginTop: 14 }}>
          <TekstVeld
            label=""
            value={zoek}
            onChangeText={setZoek}
            placeholder="Zoek gebouw, adres of stad…"
            autoCapitalize="none"
            style={{ backgroundColor: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.18)", color: "#fff" }}
          />
        </View>
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={c.primary} />
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
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: insets.bottom + 24, width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching || isSyncing}
              onRefresh={herlaadMetSync}
              tintColor={c.primary}
            />
          }
          ListEmptyComponent={
            <Text style={{ textAlign: "center", color: c.mutedForeground, marginTop: 48, fontFamily: "Inter_400Regular" }}>
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
                paddingHorizontal: 14,
                paddingVertical: 11,
                width: itemBreedte,
                opacity: pressed ? 0.85 : 1,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              })}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontSize: 14, color: c.foreground, fontFamily: "Inter_700Bold" }}
                  numberOfLines={1}
                >
                  {item.projectnummer ? `${item.projectnummer} · ${item.naam}` : item.naam}
                </Text>
                <Text
                  style={{ fontSize: 12, color: c.mutedForeground, marginTop: 2, fontFamily: "Inter_400Regular" }}
                  numberOfLines={1}
                >
                  {item.adres}{item.stad ? `, ${item.stad}` : ""}
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: c.accent,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 6,
                  minWidth: 44,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: c.accentForeground, fontSize: 11, fontFamily: "Inter_700Bold" }}>
                  {item.totaal_voorzieningen ?? 0}
                </Text>
                <Text style={{ color: c.accentForeground, fontSize: 9, fontFamily: "Inter_400Regular" }}>
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
