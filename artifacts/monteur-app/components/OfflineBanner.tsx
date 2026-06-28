import { Ionicons } from "@expo/vector-icons";
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
          gap: 6,
          backgroundColor: isOnline ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 20,
        }}
      >
        <Ionicons
          name={isOnline ? "cloud-done-outline" : "cloud-offline-outline"}
          size={13}
          color={isOnline ? "#4ade80" : "#f87171"}
        />
        <Text
          style={{
            color: isOnline ? "#4ade80" : "#f87171",
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
        backgroundColor: isOnline ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
        borderBottomWidth: 1,
        borderBottomColor: isOnline ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)",
        paddingHorizontal: 16,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <Ionicons
        name={isOnline ? "cloud-done-outline" : "cloud-offline-outline"}
        size={18}
        color={isOnline ? "#4ade80" : "#f87171"}
      />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: isOnline ? "#4ade80" : "#f87171",
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
            gap: 5,
            backgroundColor: pressed ? "rgba(34,197,94,0.2)" : "rgba(34,197,94,0.12)",
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 8,
            opacity: isDownloading ? 0.6 : 1,
          })}
        >
          {isDownloading ? (
            <ActivityIndicator size={12} color="#4ade80" />
          ) : (
            <Ionicons name="download-outline" size={14} color="#4ade80" />
          )}
          <Text
            style={{
              color: "#4ade80",
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
