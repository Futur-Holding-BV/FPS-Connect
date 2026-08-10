import { Ionicons } from "@expo/vector-icons";
import { ruimte } from "@workspace/ontwerp";
import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { useOffline } from "@/context/offline";
import { useColors } from "@/hooks/useColors";

function formatTijdstip(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

type Props = {
  stijl?: "compact" | "volledig";
};

export function OfflineBanner({ stijl = "volledig" }: Props) {
  const c = useColors();
  const { isOnline, isDownloading, gecachedOp, downloadVandaag } = useOffline();

  if (isOnline && !gecachedOp) return null;

  if (stijl === "compact") {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: ruimte.xs + 2,
          backgroundColor: isOnline ? c.success + "1F" : c.destructive + "1F",
          paddingHorizontal: ruimte.s + 2,
          paddingVertical: ruimte.xs + 1,
          borderRadius: 20,
        }}
      >
        <Ionicons
          name={isOnline ? "cloud-done-outline" : "cloud-offline-outline"}
          size={13}
          color={isOnline ? c.success : c.destructive}
        />
        <Text
          style={{
            color: isOnline ? c.success : c.destructive,
            fontSize: 11,
            fontFamily: "Inter_500Medium",
          }}
        >
          {isOnline
            ? gecachedOp
              ? `Cache ${formatTijdstip(gecachedOp)}`
              : "Online"
            : gecachedOp
              ? `Offline — cache ${formatTijdstip(gecachedOp)}`
              : "Offline — geen cache"}
        </Text>
      </View>
    );
  }

  // Volledig
  return (
    <View
      style={{
        backgroundColor: isOnline ? c.success + "1A" : c.destructive + "1A",
        borderBottomWidth: 1,
        borderBottomColor: isOnline ? c.success + "33" : c.destructive + "33",
        paddingHorizontal: ruimte.l,
        paddingVertical: ruimte.s + 2,
        flexDirection: "row",
        alignItems: "center",
        gap: ruimte.s + 2,
      }}
    >
      <Ionicons
        name={isOnline ? "cloud-done-outline" : "cloud-offline-outline"}
        size={18}
        color={isOnline ? c.success : c.destructive}
      />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: isOnline ? c.success : c.destructive,
            fontSize: 13,
            fontFamily: "Inter_600SemiBold",
          }}
        >
          {isOnline ? "Online" : "Geen verbinding"}
        </Text>
        <Text
          style={{
            color: c.mutedForeground,
            fontSize: 11,
            fontFamily: "Inter_400Regular",
            marginTop: 1,
          }}
        >
          {gecachedOp
            ? `Lokale data bijgewerkt om ${formatTijdstip(gecachedOp)}`
            : "Geen lokale data beschikbaar"}
        </Text>
      </View>
      {isOnline ? (
        <Pressable
          onPress={() => void downloadVandaag()}
          disabled={isDownloading}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: ruimte.xs + 1,
            backgroundColor: pressed ? c.success + "33" : c.success + "1F",
            paddingHorizontal: ruimte.s + 2,
            paddingVertical: ruimte.xs + 2,
            borderRadius: c.radius / 2,
            opacity: isDownloading ? 0.6 : 1,
          })}
        >
          {isDownloading ? (
            <ActivityIndicator size={12} color={c.success} />
          ) : (
            <Ionicons name="download-outline" size={14} color={c.success} />
          )}
          <Text
            style={{
              color: c.success,
              fontSize: 12,
              fontFamily: "Inter_600SemiBold",
            }}
          >
            {isDownloading ? "Laden..." : "Download"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
