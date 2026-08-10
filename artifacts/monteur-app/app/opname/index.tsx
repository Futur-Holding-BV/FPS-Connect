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
import { ruimte } from "@workspace/ontwerp";

import { Ladenstaat, LegeStaat, LijstFout, Statusmerk, tekstStijl, bovenInset } from "@/components/ui";
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

// Opnamestatus op het statuspalet: concept = waarschuwing (geel), definitief = succes (groen).
const STATUS_SOORT: Record<string, { soort: "waarschuwing" | "succes"; label: string }> = {
  concept: { soort: "waarschuwing", label: "Concept" },
  definitief: { soort: "succes", label: "Definitief" },
};

function OpnameKaart({ item, onPress }: { item: any; onPress: () => void }) {
  const c = useColors();
  const status = STATUS_SOORT[item.status] ?? STATUS_SOORT.concept;
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: c.card,
        borderRadius: c.radius,
        borderWidth: 1,
        borderColor: c.border,
        padding: ruimte.l,
        marginBottom: ruimte.s + 2,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, marginRight: ruimte.m }}>
          <Text style={[tekstStijl("nadruk", c.foreground), { fontFamily: "Inter_600SemiBold" }]}>
            {item.naam}
          </Text>
          {item.gebouw_naam ? (
            <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: ruimte.xs / 2 }]}>
              {item.gebouw_naam}
            </Text>
          ) : null}
        </View>
        <Statusmerk label={status.label} soort={status.soort} />
      </View>
      <View style={{ flexDirection: "row", gap: ruimte.l, marginTop: ruimte.s + 2, alignItems: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.xs + 1 }}>
          <Ionicons name="calendar-outline" size={13} color={c.mutedForeground} />
          <Text style={tekstStijl("bijschrift", c.mutedForeground)}>
            {item.datum}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.xs + 1 }}>
          <Ionicons name="list-outline" size={13} color={c.mutedForeground} />
          <Text style={tekstStijl("bijschrift", c.mutedForeground)}>
            {item.aantal_items} {item.aantal_items === 1 ? "item" : "items"}
          </Text>
        </View>
        {item.aangemaakt_door_naam ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.xs + 1 }}>
            <Ionicons name="person-outline" size={13} color={c.mutedForeground} />
            <Text style={tekstStijl("bijschrift", c.mutedForeground)}>
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
          paddingTop: bovenInset(insets) + ruimte.m,
          paddingHorizontal: ruimte.xl,
          paddingBottom: ruimte.l,
        }}
      >
        <Pressable onPress={() => router.push("/menu")} style={{ marginBottom: ruimte.s }}>
          <Text style={tekstStijl("nadruk", c.primary)}>
            ‹ Menu
          </Text>
        </Pressable>
        <Text style={tekstStijl("schermtitel", c.darkForeground)}>
          Opname
        </Text>
        <Text style={[tekstStijl("klein", c.darkMuted), { marginTop: ruimte.xs / 2 }]}>
          Veldopnames voor de calculatiefase
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: c.darkForeground + "14",
            borderRadius: c.radius,
            paddingHorizontal: ruimte.m,
            paddingVertical: ruimte.s,
            marginTop: ruimte.m,
            gap: ruimte.s,
          }}
        >
          <Ionicons name="search-outline" size={16} color={c.darkMuted} />
          <TextInput
            value={zoek}
            onChangeText={setZoek}
            placeholder="Zoek opname of gebouw..."
            placeholderTextColor={c.darkMuted}
            style={[tekstStijl("standaard", c.darkForeground), { flex: 1 }]}
          />
        </View>
      </View>

      {/* Lijst */}
      {isLoading ? (
        <View style={{ padding: ruimte.l }}>
          <Ladenstaat regels={6} />
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
          contentContainerStyle={{ padding: ruimte.l, paddingBottom: ruimte.xxl * 3 + ruimte.xs }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.primary} />
          }
          ListEmptyComponent={
            <View style={{ paddingTop: ruimte.xxl + ruimte.xl }}>
              <LegeStaat
                icoon="clipboard-outline"
                titel={zoek ? "Geen resultaten gevonden" : "Nog geen opnames aangemaakt"}
              />
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
          bottom: ruimte.xl + ruimte.xs + insets.bottom,
          right: ruimte.xl,
          backgroundColor: c.primary,
          width: ruimte.xxl + ruimte.xl + 2,
          height: ruimte.xxl + ruimte.xl + 2,
          borderRadius: (ruimte.xxl + ruimte.xl + 2) / 2,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
      >
        <Ionicons name="add" size={30} color={c.primaryForeground} />
      </Pressable>

      {/* Nieuw opname modal */}
      <Modal visible={toonNieuw} transparent animationType="slide" onRequestClose={() => setToonNieuw(false)}>
        <Pressable
          onPress={() => setToonNieuw(false)}
          style={{ flex: 1, backgroundColor: c.dark + "80", justifyContent: "flex-end" }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: c.card,
              borderTopLeftRadius: ruimte.xl,
              borderTopRightRadius: ruimte.xl,
              padding: ruimte.xl,
              paddingBottom: ruimte.xl + insets.bottom,
            }}
          >
            <Text style={[tekstStijl("sectiekop", c.foreground), { marginBottom: ruimte.l }]}>
              Nieuwe opname
            </Text>

            <Text style={[tekstStijl("klein", c.foreground), { fontFamily: "Inter_600SemiBold", marginBottom: ruimte.xs + 2 }]}>
              Naam
            </Text>
            <TextInput
              value={nieuwNaam}
              onChangeText={setNieuwNaam}
              placeholder="Bijv. Begane grond inventarisatie"
              placeholderTextColor={c.mutedForeground}
              style={[
                tekstStijl("nadruk", c.foreground),
                {
                  borderWidth: 1,
                  borderColor: c.border,
                  borderRadius: c.radius / 2,
                  padding: ruimte.m,
                  backgroundColor: c.background,
                  marginBottom: ruimte.m + 2,
                },
              ]}
            />

            <Text style={[tekstStijl("klein", c.foreground), { fontFamily: "Inter_600SemiBold", marginBottom: ruimte.xs + 2 }]}>
              Datum
            </Text>
            <TextInput
              value={nieuwDatum}
              onChangeText={setNieuwDatum}
              placeholder="JJJJ-MM-DD"
              placeholderTextColor={c.mutedForeground}
              style={[
                tekstStijl("nadruk", c.foreground),
                {
                  borderWidth: 1,
                  borderColor: c.border,
                  borderRadius: c.radius / 2,
                  padding: ruimte.m,
                  backgroundColor: c.background,
                  marginBottom: ruimte.m + 2,
                },
              ]}
            />

            <Text style={[tekstStijl("klein", c.foreground), { fontFamily: "Inter_600SemiBold", marginBottom: ruimte.xs + 2 }]}>
              Gebouw
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: ruimte.xl }}
              contentContainerStyle={{ gap: ruimte.s }}
            >
              {(gebouwen ?? []).map((g) => (
                <Pressable
                  key={g.id}
                  onPress={() => setNieuwGebouwId(g.id)}
                  style={{
                    paddingHorizontal: ruimte.m + 2,
                    paddingVertical: ruimte.s,
                    borderRadius: ruimte.s,
                    borderWidth: 1,
                    borderColor: nieuwGebouwId === g.id ? c.primary : c.border,
                    backgroundColor: nieuwGebouwId === g.id ? c.accent : c.background,
                  }}
                >
                  <Text
                    style={[
                      tekstStijl("klein", nieuwGebouwId === g.id ? c.primary : c.foreground),
                      { fontFamily: "Inter_500Medium" },
                    ]}
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
                padding: ruimte.m + 2,
                borderRadius: c.radius,
                alignItems: "center",
              }}
            >
              {maakAan.isPending ? (
                <ActivityIndicator color={c.primaryForeground} />
              ) : (
                <Text style={[tekstStijl("nadruk", c.primaryForeground), { fontFamily: "Inter_700Bold" }]}>
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
