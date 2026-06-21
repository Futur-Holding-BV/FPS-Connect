import { Ionicons } from "@expo/vector-icons";
import {
  useListOpnames,
  useListGebouwen,
  useCreateOpname,
} from "@workspace/api-client-react";
import { Redirect, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LijstFout, bovenInset } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/auth";

const SPOT_TYPE_KLEUREN: Record<string, string> = {
  branddeur: "#ef4444",
  doorvoering: "#f97316",
  brandklep: "#eab308",
  manchet: "#22c55e",
  coating: "#3b82f6",
  luik: "#8b5cf6",
  dakdoorvoer: "#06b6d4",
  overig: "#6b7280",
};

const ACTIE_LABELS: Record<string, string> = {
  vervangen: "Vervangen",
  opwaarderen: "Opwaarderen",
  controleren: "Controleren",
  "niet-brandwerend-afwerken": "Niet-brandwerend afwerken",
};

const STATUS_KLEUREN: Record<string, { bg: string; text: string; label: string }> = {
  concept: { bg: "#FEF9C3", text: "#854D0E", label: "Concept" },
  definitief: { bg: "#DCFCE7", text: "#166534", label: "Definitief" },
};

function OpnameKaart({ item, onPress }: { item: any; onPress: () => void }) {
  const c = useColors();
  const status = STATUS_KLEUREN[item.status] ?? STATUS_KLEUREN.concept;
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: c.card,
        borderRadius: c.radius,
        borderWidth: 1,
        borderColor: c.border,
        padding: 16,
        marginBottom: 10,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: c.foreground }}>
            {item.naam}
          </Text>
          {item.gebouw_naam ? (
            <Text style={{ fontSize: 13, color: c.mutedForeground, marginTop: 2, fontFamily: "Inter_400Regular" }}>
              {item.gebouw_naam}
            </Text>
          ) : null}
        </View>
        <View style={{ backgroundColor: status.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: status.text }}>
            {status.label}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 16, marginTop: 10, alignItems: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Ionicons name="calendar-outline" size={13} color={c.mutedForeground} />
          <Text style={{ fontSize: 12, color: c.mutedForeground, fontFamily: "Inter_400Regular" }}>
            {item.datum}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Ionicons name="list-outline" size={13} color={c.mutedForeground} />
          <Text style={{ fontSize: 12, color: c.mutedForeground, fontFamily: "Inter_400Regular" }}>
            {item.aantal_items} {item.aantal_items === 1 ? "item" : "items"}
          </Text>
        </View>
        {item.aangemaakt_door_naam ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Ionicons name="person-outline" size={13} color={c.mutedForeground} />
            <Text style={{ fontSize: 12, color: c.mutedForeground, fontFamily: "Inter_400Regular" }}>
              {item.aangemaakt_door_naam}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function OpnameLijst() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [zoek, setZoek] = useState("");
  const [toonNieuw, setToonNieuw] = useState(false);
  const [nieuwNaam, setNieuwNaam] = useState("");
  const [nieuwGebouwId, setNieuwGebouwId] = useState<number | null>(null);
  const [nieuwDatum, setNieuwDatum] = useState(new Date().toISOString().slice(0, 10));

  const { data, isLoading, isError, refetch, isRefetching } = useListOpnames();
  const { data: gebouwen } = useListGebouwen();
  const maakAan = useCreateOpname();

  if (!token) return <Redirect href="/login" />;

  const gefilterd = (data ?? []).filter((o) => {
    if (!zoek.trim()) return true;
    const q = zoek.toLowerCase();
    return (
      o.naam.toLowerCase().includes(q) ||
      (o.gebouw_naam ?? "").toLowerCase().includes(q)
    );
  });

  async function aanmaken() {
    if (!nieuwNaam.trim() || !nieuwGebouwId) return;
    try {
      const opname = await maakAan.mutateAsync({
        data: {
          naam: nieuwNaam.trim(),
          gebouw_id: nieuwGebouwId,
          datum: nieuwDatum,
        },
      });
      setToonNieuw(false);
      setNieuwNaam("");
      setNieuwGebouwId(null);
      await refetch();
      router.push(`/opname/${opname.id}` as never);
    } catch {}
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View
        style={{
          backgroundColor: c.dark,
          paddingTop: bovenInset(insets) + 14,
          paddingHorizontal: 20,
          paddingBottom: 18,
        }}
      >
        <Pressable onPress={() => router.push("/menu")} style={{ marginBottom: 10 }}>
          <Text style={{ color: c.primary, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
            ‹ Menu
          </Text>
        </Pressable>
        <Text style={{ color: c.darkForeground, fontSize: 22, fontFamily: "Inter_700Bold" }}>
          Opname
        </Text>
        <Text style={{ color: c.darkMuted, fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 }}>
          Veldopnames voor de calculatiefase
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "rgba(255,255,255,0.08)",
            borderRadius: c.radius,
            paddingHorizontal: 12,
            paddingVertical: 8,
            marginTop: 12,
            gap: 8,
          }}
        >
          <Ionicons name="search-outline" size={16} color={c.darkMuted} />
          <TextInput
            value={zoek}
            onChangeText={setZoek}
            placeholder="Zoek opname of gebouw..."
            placeholderTextColor={c.darkMuted}
            style={{
              flex: 1,
              color: c.darkForeground,
              fontFamily: "Inter_400Regular",
              fontSize: 14,
            }}
          />
        </View>
      </View>

      {/* Lijst */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : isError ? (
        <LijstFout
          beschrijving="De opnames konden niet worden geladen."
          onOpnieuw={() => refetch()}
        />
      ) : (
        <FlatList
          data={gefilterd}
          keyExtractor={(o) => String(o.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.primary} />
          }
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 60 }}>
              <Ionicons name="clipboard-outline" size={40} color={c.mutedForeground} />
              <Text style={{ color: c.mutedForeground, marginTop: 12, fontFamily: "Inter_400Regular" }}>
                {zoek ? "Geen resultaten gevonden" : "Nog geen opnames aangemaakt"}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <OpnameKaart item={item} onPress={() => router.push(`/opname/${item.id}` as never)} />
          )}
        />
      )}

      {/* FAB */}
      <Pressable
        onPress={() => setToonNieuw(true)}
        style={{
          position: "absolute",
          bottom: 28 + insets.bottom,
          right: 24,
          backgroundColor: c.primary,
          width: 58,
          height: 58,
          borderRadius: 29,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>

      {/* Nieuw opname modal */}
      <Modal visible={toonNieuw} transparent animationType="slide" onRequestClose={() => setToonNieuw(false)}>
        <Pressable
          onPress={() => setToonNieuw(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: c.card,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 24,
              paddingBottom: 24 + insets.bottom,
            }}
          >
            <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: c.foreground, marginBottom: 18 }}>
              Nieuwe opname
            </Text>

            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 6 }}>
              Naam
            </Text>
            <TextInput
              value={nieuwNaam}
              onChangeText={setNieuwNaam}
              placeholder="Bijv. Begane grond inventarisatie"
              placeholderTextColor={c.mutedForeground}
              style={{
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: 10,
                padding: 12,
                fontSize: 15,
                fontFamily: "Inter_400Regular",
                color: c.foreground,
                backgroundColor: c.background,
                marginBottom: 14,
              }}
            />

            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 6 }}>
              Datum
            </Text>
            <TextInput
              value={nieuwDatum}
              onChangeText={setNieuwDatum}
              placeholder="JJJJ-MM-DD"
              placeholderTextColor={c.mutedForeground}
              style={{
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: 10,
                padding: 12,
                fontSize: 15,
                fontFamily: "Inter_400Regular",
                color: c.foreground,
                backgroundColor: c.background,
                marginBottom: 14,
              }}
            />

            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 6 }}>
              Gebouw
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 20 }}
              contentContainerStyle={{ gap: 8 }}
            >
              {(gebouwen ?? []).map((g) => (
                <Pressable
                  key={g.id}
                  onPress={() => setNieuwGebouwId(g.id)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: nieuwGebouwId === g.id ? c.primary : c.border,
                    backgroundColor: nieuwGebouwId === g.id ? c.accent : c.background,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: "Inter_500Medium",
                      color: nieuwGebouwId === g.id ? c.primary : c.foreground,
                    }}
                  >
                    {g.naam}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Pressable
              onPress={aanmaken}
              disabled={!nieuwNaam.trim() || !nieuwGebouwId || maakAan.isPending}
              style={{
                backgroundColor: !nieuwNaam.trim() || !nieuwGebouwId ? c.muted : c.primary,
                padding: 14,
                borderRadius: 12,
                alignItems: "center",
              }}
            >
              {maakAan.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 }}>
                  Opname aanmaken
                </Text>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
