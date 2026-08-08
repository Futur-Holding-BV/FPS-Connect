import {
  useListMagazijnInkooporders,
  type MagazijnInkooporder,
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
import { BevoegdheidGuard } from "@/components/BevoegdheidGuard";

const STATUS_LABELS: Record<string, string> = {
  concept: "Concept",
  verstuurd: "Verstuurd",
  bevestigd: "Bevestigd",
  ontvangen: "Ontvangen",
  geannuleerd: "Geannuleerd",
};

const STATUS_KLEUREN: Record<string, string> = {
  concept: "#6b7280",
  verstuurd: "#3b82f6",
  bevestigd: "#f59e0b",
  ontvangen: "#22c55e",
  geannuleerd: "#ef4444",
};

function formatDatum(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

function InkooporderKaart({ item }: { item: MagazijnInkooporder }) {
  const c = useColors();
  const kleur = STATUS_KLEUREN[item.status] ?? "#6b7280";
  const label = STATUS_LABELS[item.status] ?? item.status;

  return (
    <View
      style={{
        backgroundColor: c.card,
        borderRadius: 12,
        padding: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: c.border,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={{ color: c.text, fontWeight: "700", fontSize: 15 }}>
            {item.nummer ?? `Order #${item.id}`}
          </Text>
          {item.leverancier_naam ? (
            <Text style={{ color: c.mutedForeground, fontSize: 13, marginTop: 2 }}>
              {item.leverancier_naam}
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

      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: c.mutedForeground, fontSize: 13 }}>Artikelen</Text>
          <Text style={{ color: c.text, fontSize: 13, fontWeight: "600" }}>
            {item.totaal_regels}
          </Text>
        </View>
        {item.verwachte_leverdatum ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: c.mutedForeground, fontSize: 13 }}>Verwachte levering</Text>
            <Text style={{ color: c.text, fontSize: 13, fontWeight: "600" }}>
              {formatDatum(item.verwachte_leverdatum)}
            </Text>
          </View>
        ) : null}
        {item.werkelijke_leverdatum ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: c.mutedForeground, fontSize: 13 }}>Ontvangen op</Text>
            <Text style={{ color: "#22c55e", fontSize: 13, fontWeight: "600" }}>
              {formatDatum(item.werkelijke_leverdatum)}
            </Text>
          </View>
        ) : null}
        {item.referentie ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: c.mutedForeground, fontSize: 13 }}>Referentie</Text>
            <Text style={{ color: c.text, fontSize: 13 }}>{item.referentie}</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: c.mutedForeground, fontSize: 13 }}>Aangemaakt</Text>
          <Text style={{ color: c.mutedForeground, fontSize: 13 }}>
            {formatDatum(item.aangemaakt_op)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function InkoopordersScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [statusFilter, setStatusFilter] = useState<string>("alle");

  const { data: orders = [], isLoading, refetch } = useListMagazijnInkooporders(
    {},
    { query: { enabled: !!token } } as any,
  );

  if (!token) return <Redirect href="/login" />;

  const gefilterd = statusFilter === "alle"
    ? orders
    : orders.filter((o) => o.status === statusFilter);

  const filterOpties = [
    { sleutel: "alle", label: "Alle" },
    { sleutel: "verstuurd", label: "Verstuurd" },
    { sleutel: "bevestigd", label: "Bevestigd" },
    { sleutel: "ontvangen", label: "Ontvangen" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ paddingTop: bovenInset(insets), paddingHorizontal: 16, paddingBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 4 }}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={22} color={c.text} />
          </Pressable>
          <Text style={{ color: c.text, fontSize: 20, fontWeight: "700", flex: 1 }}>
            Inkooporders
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
          {filterOpties.map((k) => (
            <Pressable
              key={k.sleutel}
              onPress={() => setStatusFilter(k.sleutel)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor: statusFilter === k.sleutel ? "#f97316" : c.card,
                borderWidth: 1,
                borderColor: statusFilter === k.sleutel ? "#f97316" : c.border,
              }}
            >
              <Text style={{
                color: statusFilter === k.sleutel ? "#fff" : c.mutedForeground,
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
          <Ionicons name="cube-outline" size={48} color={c.mutedForeground} />
          <Text style={{ color: c.mutedForeground, fontSize: 15, marginTop: 12, textAlign: "center" }}>
            Geen inkooporders gevonden
          </Text>
        </View>
      ) : (
        <FlatList
          data={gefilterd}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <InkooporderKaart item={item} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 20 }}
          onRefresh={() => void refetch()}
          refreshing={isLoading}
        />
      )}
    </View>
  );
}

// APP_01 §3.3 — schermbescherming: nette weigering zonder bevoegdheid
// (backendroute eist magazijn niveau 2; gemeten, zie docs/metingen).
export default function InkoopordersSchermBeveiligd() {
  return (
    <BevoegdheidGuard vereiste={{ module: "magazijn", niveau: 2 }}>
      <InkoopordersScherm />
    </BevoegdheidGuard>
  );
}
