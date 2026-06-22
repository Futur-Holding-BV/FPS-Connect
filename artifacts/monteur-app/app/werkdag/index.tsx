import { useGetWerkdagVandaag } from "@workspace/api-client-react";
import type { WerkdagItem } from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, Redirect, useRouter } from "expo-router";
import React, { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";

const UITVOERING_LABEL: Record<string, string> = {
  gepland: "Gepland",
  bezig: "In uitvoering",
  pauze: "Pauze",
  gereed: "Gereed",
};

const UITVOERING_KLEUR: Record<string, string> = {
  gepland: "#6b7280",
  bezig: "#F23B0D",
  pauze: "#d97706",
  gereed: "#16a34a",
};

function vandaagNederlands(): string {
  return new Date().toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function StatusBadge({ status }: { status: string }) {
  const kleur = UITVOERING_KLEUR[status] ?? "#6b7280";
  const label = UITVOERING_LABEL[status] ?? status;
  return (
    <View
      style={{
        backgroundColor: kleur + "22",
        borderWidth: 1,
        borderColor: kleur,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 2,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ color: kleur, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
        {label}
      </Text>
    </View>
  );
}

function WerkorderKaart({
  item,
  onPress,
  borderKleur,
}: {
  item: WerkdagItem;
  onPress: () => void;
  borderKleur: string;
}) {
  const c = useColors();
  const randKleur = UITVOERING_KLEUR[item.uitvoering_status] ?? borderKleur;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? c.secondary : c.card,
        borderRadius: 12,
        borderLeftWidth: 4,
        borderLeftColor: randKleur,
        marginHorizontal: 16,
        marginBottom: 12,
        padding: 16,
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      })}
    >
      {/* Tijdregel */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 6 }}>
        <Ionicons name="time-outline" size={14} color={c.mutedForeground} />
        <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular" }}>
          {item.tijd_start ?? "–"}
          {item.tijd_eind ? ` – ${item.tijd_eind}` : ""}
          {item.uren ? `  ·  ${item.uren} u` : ""}
        </Text>
        <View style={{ flex: 1 }} />
        <StatusBadge status={item.uitvoering_status} />
      </View>

      {/* Projectnaam + werknummer */}
      <Text
        style={{
          color: c.text,
          fontSize: 15,
          fontFamily: "Inter_600SemiBold",
          marginBottom: 4,
        }}
        numberOfLines={2}
      >
        {item.project_naam ?? item.titel}
        {item.werknummer ? `  #${item.werknummer}` : ""}
      </Text>

      {/* Locatie */}
      {item.locaties ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
          <Ionicons name="location-outline" size={13} color={c.mutedForeground} />
          <Text
            style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular" }}
            numberOfLines={1}
          >
            {item.locaties}
          </Text>
        </View>
      ) : null}

      {/* Werkzaamheden */}
      {item.omschrijving ? (
        <Text
          style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 }}
          numberOfLines={2}
        >
          {item.omschrijving}
        </Text>
      ) : null}

      {/* Opdracht type */}
      {item.opdracht_type ? (
        <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 6 }}>
          {item.opdracht_type === "meerwerk" ? "Meerwerk" : "Hoofdopdracht"}
        </Text>
      ) : null}

      <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 8 }}>
        <Ionicons name="chevron-forward" size={16} color={c.mutedForeground} />
      </View>
    </Pressable>
  );
}

export default function WerkdagScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  if (!token) return <Redirect href="/login" />;

  const {
    data: werkorders = [],
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useGetWerkdagVandaag();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View
        style={{
          paddingTop: bovenInset(insets) + 8,
          paddingHorizontal: 20,
          paddingBottom: 16,
          backgroundColor: c.dark,
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
        }}
      >
        <View>
          <Text
            style={{
              color: c.tint,
              fontSize: 11,
              fontFamily: "Inter_600SemiBold",
              letterSpacing: 1,
              textTransform: "uppercase",
              marginBottom: 2,
            }}
          >
            {vandaagNederlands()}
          </Text>
          <Text
            style={{
              color: "#fff",
              fontSize: 22,
              fontFamily: "Inter_700Bold",
            }}
          >
            Mijn werkdag
          </Text>
        </View>
        <Pressable
          onPress={() => router.back()}
          style={{ padding: 8 }}
          hitSlop={8}
        >
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
      </View>

      {/* Inhoud */}
      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={c.tint} size="large" />
        </View>
      ) : isError ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32 }}>
          <Ionicons name="alert-circle-outline" size={40} color={c.mutedForeground} />
          <Text
            style={{
              color: c.mutedForeground,
              fontSize: 15,
              textAlign: "center",
              marginTop: 12,
              fontFamily: "Inter_400Regular",
            }}
          >
            Kon werkorders niet laden. Controleer de verbinding.
          </Text>
          <Pressable
            onPress={() => refetch()}
            style={{
              marginTop: 16,
              backgroundColor: c.tint,
              borderRadius: 8,
              paddingHorizontal: 20,
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold" }}>Opnieuw proberen</Text>
          </Pressable>
        </View>
      ) : werkorders.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32 }}>
          <Ionicons name="calendar-outline" size={48} color={c.muted} />
          <Text
            style={{
              color: c.text,
              fontSize: 17,
              fontFamily: "Inter_600SemiBold",
              marginTop: 16,
              textAlign: "center",
            }}
          >
            Geen werkorders voor vandaag
          </Text>
          <Text
            style={{
              color: c.muted,
              fontSize: 14,
              fontFamily: "Inter_400Regular",
              marginTop: 8,
              textAlign: "center",
            }}
          >
            Er staan vandaag geen werkorders voor jou gepland.
          </Text>
        </View>
      ) : (
        <FlatList
          data={werkorders}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={c.accent}
            />
          }
          ListHeaderComponent={
            <Text
              style={{
                color: c.muted,
                fontSize: 12,
                fontFamily: "Inter_400Regular",
                marginHorizontal: 16,
                marginBottom: 8,
              }}
            >
              {werkorders.length} werkorder{werkorders.length !== 1 ? "s" : ""} vandaag
            </Text>
          }
          renderItem={({ item }) => (
            <WerkorderKaart
              item={item}
              borderKleur={c.accent}
              onPress={() => router.push(`/werkdag/${item.id}`)}
            />
          )}
        />
      )}
    </View>
  );
}
