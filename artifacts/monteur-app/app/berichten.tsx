import React, { useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import {
  useListToolboxBerichten,
  useBevestigenToolboxBericht,
  getListToolboxBerichtenQueryKey,
} from "@workspace/api-client-react";
import type { ToolboxBericht } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { bovenInset, LijstFout } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

import {
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";

export default function BerichtenScherm() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold });
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { inhoudMaxBreedte } = useResponsive();
  const queryClient = useQueryClient();

  const [refreshing, setRefreshing] = useState(false);
  const [geselecteerd, setGeselecteerd] = useState<ToolboxBericht | null>(null);
  const [bezigBevestigen, setBezigBevestigen] = useState(false);
  const [bevestigFout, setBevestigFout] = useState<string | null>(null);

  const {
    data: berichten,
    isLoading,
    error,
    refetch,
  } = useListToolboxBerichten({ gepubliceerd: true });

  const bevestigenMut = useBevestigenToolboxBericht();

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  async function bevestig(bericht: ToolboxBericht) {
    if (bezigBevestigen || bericht.mijn_bevestiging) return;
    setBezigBevestigen(true);
    setBevestigFout(null);
    try {
      await bevestigenMut.mutateAsync({ id: bericht.id });
      await queryClient.invalidateQueries({ queryKey: getListToolboxBerichtenQueryKey() });
      setGeselecteerd((prev) =>
        prev?.id === bericht.id
          ? {
              ...prev,
              mijn_bevestiging: {
                id: 0,
                bericht_id: bericht.id,
                gebruiker_id: 0,
                bevestigd_op: new Date().toISOString(),
              },
            }
          : prev
      );
    } catch {
      setBevestigFout("Kon niet bevestigen. Probeer opnieuw.");
    } finally {
      setBezigBevestigen(false);
    }
  }

  if (!fontsLoaded) return null;

  const openstaand = (berichten ?? []).filter((b) => !b.mijn_bevestiging);
  const bevestigd = (berichten ?? []).filter((b) => !!b.mijn_bevestiging);

  if (geselecteerd) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentContainerStyle={{
          padding: 16,
          paddingTop: bovenInset(insets) + 16,
          paddingBottom: insets.bottom + 32,
          maxWidth: inhoudMaxBreedte,
          width: "100%",
          alignSelf: "center",
        }}
      >
        <Pressable
          onPress={() => { setGeselecteerd(null); setBevestigFout(null); }}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 20 }}
        >
          <Ionicons name="chevron-back" size={20} color={c.primary} />
          <Text style={{ color: c.primary, fontSize: 14, fontFamily: "Inter_600SemiBold" }}>
            Terug naar berichten
          </Text>
        </Pressable>

        <Text
          style={{
            fontSize: 20,
            fontFamily: "Inter_700Bold",
            color: c.foreground,
            marginBottom: 6,
          }}
        >
          {geselecteerd.titel}
        </Text>

        {geselecteerd.aangemaakt_door_naam ? (
          <Text
            style={{ fontSize: 12, color: c.mutedForeground, fontFamily: "Inter_400Regular", marginBottom: 4 }}
          >
            Door {geselecteerd.aangemaakt_door_naam}
            {geselecteerd.gepubliceerd_op
              ? " · " + new Date(geselecteerd.gepubliceerd_op).toLocaleDateString("nl-NL")
              : ""}
          </Text>
        ) : null}

        <View style={{ height: 1, backgroundColor: c.border, marginVertical: 16 }} />

        <Text
          style={{
            fontSize: 15,
            color: c.foreground,
            fontFamily: "Inter_400Regular",
            lineHeight: 24,
            marginBottom: 32,
          }}
        >
          {geselecteerd.inhoud}
        </Text>

        {bevestigFout ? (
          <Text
            style={{
              fontSize: 13,
              color: "#dc2626",
              fontFamily: "Inter_400Regular",
              marginBottom: 12,
              textAlign: "center",
            }}
          >
            {bevestigFout}
          </Text>
        ) : null}

        {geselecteerd.mijn_bevestiging ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              backgroundColor: "#f0fdf4",
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "#bbf7d0",
              padding: 14,
            }}
          >
            <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#15803d" }}>
              Gelezen en begrepen op{" "}
              {new Date(geselecteerd.mijn_bevestiging.bevestigd_op).toLocaleDateString("nl-NL")}
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={() => bevestig(geselecteerd)}
            disabled={bezigBevestigen}
            style={{
              backgroundColor: c.primary,
              borderRadius: 10,
              paddingVertical: 14,
              alignItems: "center",
              opacity: bezigBevestigen ? 0.6 : 1,
            }}
          >
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" }}>
              {bezigBevestigen ? "Bezig..." : "Gelezen en begrepen"}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Koptekst */}
      <View
        style={{
          paddingTop: bovenInset(insets) + 8,
          paddingHorizontal: 16,
          paddingBottom: 12,
          backgroundColor: c.dark,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" }}>
            Berichten
          </Text>
          {openstaand.length > 0 ? (
            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.7)" }}>
              {openstaand.length} nog te bevestigen
            </Text>
          ) : null}
        </View>
      </View>

      {(
        <FlatList
          data={berichten ?? []}
          keyExtractor={(b) => String(b.id)}
          refreshControl={
            <RefreshControl refreshing={refreshing || isLoading} onRefresh={onRefresh} tintColor={c.primary} />
          }
          ListEmptyComponent={
            error ? (
              <LijstFout onOpnieuw={() => { void refetch(); }} />
            ) : null
          }
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 32,
            maxWidth: inhoudMaxBreedte,
            width: "100%",
            alignSelf: "center",
            gap: 10,
          }}
          ListHeaderComponent={
            openstaand.length === 0 && bevestigd.length === 0 && !isLoading ? (
              <View
                style={{
                  alignItems: "center",
                  paddingVertical: 48,
                  gap: 8,
                }}
              >
                <Ionicons name="mail-open-outline" size={40} color={c.mutedForeground} />
                <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.foreground }}>
                  Geen berichten
                </Text>
                <Text
                  style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: c.mutedForeground, textAlign: "center" }}
                >
                  Nieuwe toolbox-berichten verschijnen hier zodra ze gepubliceerd zijn.
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const isBevestigd = !!item.mijn_bevestiging;
            return (
              <Pressable
                onPress={() => setGeselecteerd(item)}
                style={{
                  backgroundColor: c.card,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: isBevestigd ? c.border : c.primary + "44",
                  padding: 14,
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: isBevestigd ? "#f0fdf4" : c.primary + "18",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Ionicons
                    name={isBevestigd ? "checkmark-circle" : "document-text-outline"}
                    size={20}
                    color={isBevestigd ? "#16a34a" : c.primary}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Text
                      style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: c.foreground, flex: 1 }}
                      numberOfLines={1}
                    >
                      {item.titel}
                    </Text>
                    {!isBevestigd && (
                      <View
                        style={{
                          backgroundColor: c.primary,
                          borderRadius: 8,
                          paddingHorizontal: 7,
                          paddingVertical: 2,
                        }}
                      >
                        <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#fff" }}>
                          Te bevestigen
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: "Inter_400Regular",
                      color: c.mutedForeground,
                      marginTop: 2,
                    }}
                    numberOfLines={2}
                  >
                    {item.inhoud}
                  </Text>
                  {isBevestigd && item.mijn_bevestiging ? (
                    <Text
                      style={{
                        fontSize: 11,
                        fontFamily: "Inter_400Regular",
                        color: "#16a34a",
                        marginTop: 4,
                      }}
                    >
                      Bevestigd op{" "}
                      {new Date(item.mijn_bevestiging.bevestigd_op).toLocaleDateString("nl-NL")}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={16} color={c.mutedForeground} style={{ flexShrink: 0 }} />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
