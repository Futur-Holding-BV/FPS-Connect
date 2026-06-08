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

import { TekstVeld, bovenInset } from "@/components/ui";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/auth";
import { useSync } from "@/context/sync";

export default function Gebouwen() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { gebruiker, token, uitloggen } = useAuth();
  const { syncStatus, aantalWachtend, forceerSync, isSyncing } = useSync();
  const [zoek, setZoek] = useState("");

  const { data, isLoading, refetch, isRefetching } = useListGebouwen();

  if (!token) return <Redirect href="/login" />;

  const gebouwen = (data ?? []).filter((g) => {
    if (!zoek.trim()) return true;
    const q = zoek.toLowerCase();
    return (
      g.naam.toLowerCase().includes(q) ||
      g.adres.toLowerCase().includes(q) ||
      (g.stad ?? "").toLowerCase().includes(q)
    );
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
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.darkMuted, fontSize: 14, fontFamily: "Inter_400Regular" }}>
              Welkom terug
            </Text>
            <Text style={{ color: c.darkForeground, fontSize: 22, fontFamily: "Inter_700Bold" }}>
              {gebruiker?.naam ?? "Monteur"}
            </Text>
          </View>
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

        {/* Sync-statusregel */}
        <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <SyncStatusBadge status={syncStatus} aantalWachtend={aantalWachtend} />
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

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : (
        <FlatList
          data={gebouwen}
          keyExtractor={(g) => String(g.id)}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}
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
                padding: 18,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ fontSize: 18, color: c.foreground, fontFamily: "Inter_700Bold" }}>
                {item.projectnummer ? `${item.projectnummer} - ${item.naam}` : item.naam}
              </Text>
              <Text style={{ fontSize: 15, color: c.mutedForeground, marginTop: 4, fontFamily: "Inter_400Regular" }}>
                {item.adres}
                {item.stad ? `, ${item.stad}` : ""}
              </Text>
              <View
                style={{
                  marginTop: 12,
                  alignSelf: "flex-start",
                  backgroundColor: c.accent,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 8,
                }}
              >
                <Text style={{ color: c.accentForeground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                  {item.totaal_voorzieningen ?? 0} voorzieningen
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
