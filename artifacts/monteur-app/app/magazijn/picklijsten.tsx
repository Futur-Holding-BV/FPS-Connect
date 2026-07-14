import {
  useListMagazijnPicklijsten,
  type MagazijnPicklijst,
} from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";

const STATUS_LABELS: Record<string, string> = {
  concept: "Concept",
  deels_voltooid: "Deels gepickt",
  voltooid: "Voltooid",
  geannuleerd: "Geannuleerd",
};

const STATUS_KLEUREN: Record<string, string> = {
  concept: "#3b82f6",
  deels_voltooid: "#f59e0b",
  voltooid: "#22c55e",
  geannuleerd: "#6b7280",
};

type StatusFilter = "alle" | "open" | "voltooid";

function formatDatum(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

function PicklijstKaart({
  item,
  onPress,
}: {
  item: MagazijnPicklijst;
  onPress: () => void;
}) {
  const c = useColors();
  const kleur = STATUS_KLEUREN[item.status] ?? "#6b7280";
  const label = STATUS_LABELS[item.status] ?? item.status;
  const voortgang =
    item.totaal_regels > 0
      ? Math.round((item.gepickt_regels / item.totaal_regels) * 100)
      : 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? c.card + "cc" : c.card,
        borderRadius: 12,
        padding: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: c.border,
      })}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={{ color: c.text, fontWeight: "700", fontSize: 15 }}>
            {item.opdracht_titel ?? `Picklijst #${item.id}`}
          </Text>
          {item.notities ? (
            <Text style={{ color: c.mutedForeground, fontSize: 13, marginTop: 2 }} numberOfLines={1}>
              {item.notities}
            </Text>
          ) : null}
        </View>
        <View style={{
          backgroundColor: kleur + "22",
          borderRadius: 6,
          paddingHorizontal: 8,
          paddingVertical: 3,
        }}>
          <Text style={{ color: kleur, fontSize: 12, fontWeight: "600" }}>{label}</Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <View style={{ height: 4, backgroundColor: c.border, borderRadius: 2, overflow: "hidden" }}>
            <View
              style={{
                width: `${voortgang}%`,
                height: 4,
                backgroundColor: item.status === "voltooid" ? "#22c55e" : "#f97316",
                borderRadius: 2,
              }}
            />
          </View>
          <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 4 }}>
            {item.gepickt_regels}/{item.totaal_regels} artikelen gepickt
          </Text>
        </View>
        {item.geplande_uitgifte_op ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="calendar-outline" size={13} color={c.mutedForeground} />
            <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
              {formatDatum(item.geplande_uitgifte_op)}
            </Text>
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={16} color={c.mutedForeground} />
      </View>
    </Pressable>
  );
}

export default function PicklijstenScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [filter, setFilter] = useState<StatusFilter>("open");

  const { data: picklijsten = [], isLoading, refetch } = useListMagazijnPicklijsten(
    {},
    { query: { enabled: !!token } } as any,
  );

  if (!token) return <Redirect href="/login" />;

  // Toon alleen picklijsten die aan een opdracht zijn gekoppeld (monteur-context).
  // Picklijsten zonder opdracht_id zijn interne magazijnlijsten buiten de monteur-scope.
  const opdrachtGebonden = picklijsten.filter((p) => p.opdracht_id != null);

  const gefilterd = opdrachtGebonden.filter((p) => {
    if (filter === "open") return p.status === "concept";
    if (filter === "voltooid")
      return (
        p.status === "voltooid" ||
        p.status === "deels_voltooid" ||
        p.status === "geannuleerd"
      );
    return true;
  });

  const filterKnoppen: { sleutel: StatusFilter; label: string }[] = [
    { sleutel: "open", label: "Openstaand" },
    { sleutel: "alle", label: "Alle" },
    { sleutel: "voltooid", label: "Voltooid" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ paddingTop: bovenInset(insets), paddingHorizontal: 16, paddingBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 4 }}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={22} color={c.text} />
          </Pressable>
          <Text style={{ color: c.text, fontSize: 20, fontWeight: "700", flex: 1 }}>
            Picklijsten
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
          {filterKnoppen.map((k) => (
            <Pressable
              key={k.sleutel}
              onPress={() => setFilter(k.sleutel)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 20,
                backgroundColor: filter === k.sleutel ? "#f97316" : c.card,
                borderWidth: 1,
                borderColor: filter === k.sleutel ? "#f97316" : c.border,
              }}
            >
              <Text style={{
                color: filter === k.sleutel ? "#fff" : c.mutedForeground,
                fontSize: 13,
                fontWeight: "600",
              }}>
                {k.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color="#f97316" />
        </View>
      ) : gefilterd.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Ionicons name="checkmark-circle-outline" size={48} color={c.mutedForeground} />
          <Text style={{ color: c.mutedForeground, fontSize: 15, marginTop: 12, textAlign: "center" }}>
            {filter === "open"
              ? "Geen openstaande picklijsten"
              : "Geen picklijsten gevonden"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={gefilterd}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <PicklijstKaart
              item={item}
              onPress={() =>
                router.push(`/magazijn/picklijst/${item.id}` as "/werkdag")
              }
            />
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 20 }}
          onRefresh={() => void refetch()}
          refreshing={isLoading}
        />
      )}
    </View>
  );
}
