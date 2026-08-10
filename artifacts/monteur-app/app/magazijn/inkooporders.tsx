import {
  useListMagazijnInkooporders,
  type MagazijnInkooporder,
} from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import { ruimte } from "@workspace/ontwerp";
import { Redirect, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Kaart,
  Ladenstaat,
  LegeStaat,
  Statusmerk,
  bovenInset,
  netteWaarde,
  tekstStijl,
} from "@/components/ui";
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

// Statussen → soort Statusmerk (kleur komt uit het palet, niet uit dit bestand).
const STATUS_SOORT: Record<string, "neutraal" | "succes" | "waarschuwing" | "fout" | "primair"> = {
  concept: "neutraal",
  verstuurd: "primair",
  bevestigd: "waarschuwing",
  ontvangen: "succes",
  geannuleerd: "fout",
};

function formatDatum(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

function InkooporderKaart({ item }: { item: MagazijnInkooporder }) {
  const c = useColors();

  return (
    <Kaart stijl={{ padding: ruimte.l, marginBottom: ruimte.s + 2 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: ruimte.s + 2, gap: ruimte.s }}>
        <View style={{ flex: 1 }}>
          <Text style={[tekstStijl("nadruk", c.foreground), { flexShrink: 1 }]} numberOfLines={1}>
            {item.nummer ?? `Order #${item.id}`}
          </Text>
          {item.leverancier_naam ? (
            <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 2 }]}>
              {item.leverancier_naam}
            </Text>
          ) : null}
        </View>
        <Statusmerk
          label={STATUS_LABELS[item.status] ?? netteWaarde(item.status)}
          soort={STATUS_SOORT[item.status] ?? "neutraal"}
        />
      </View>

      <View style={{ gap: ruimte.xs }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={tekstStijl("klein", c.mutedForeground)}>Artikelen</Text>
          <Text style={tekstStijl("nadruk", c.foreground)}>
            {item.totaal_regels}
          </Text>
        </View>
        {item.verwachte_leverdatum ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={tekstStijl("klein", c.mutedForeground)}>Verwachte levering</Text>
            <Text style={tekstStijl("nadruk", c.foreground)}>
              {formatDatum(item.verwachte_leverdatum)}
            </Text>
          </View>
        ) : null}
        {item.werkelijke_leverdatum ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={tekstStijl("klein", c.mutedForeground)}>Ontvangen op</Text>
            <Text style={tekstStijl("nadruk", c.success)}>
              {formatDatum(item.werkelijke_leverdatum)}
            </Text>
          </View>
        ) : null}
        {item.referentie ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={tekstStijl("klein", c.mutedForeground)}>Referentie</Text>
            <Text style={tekstStijl("klein", c.foreground)}>{item.referentie}</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={tekstStijl("klein", c.mutedForeground)}>Aangemaakt</Text>
          <Text style={tekstStijl("klein", c.mutedForeground)}>
            {formatDatum(item.aangemaakt_op)}
          </Text>
        </View>
      </View>
    </Kaart>
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
      <View style={{ paddingTop: bovenInset(insets), paddingHorizontal: ruimte.l, paddingBottom: ruimte.m }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.s + 2, paddingTop: ruimte.xs }}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={ruimte.xl} color={c.foreground} />
          </Pressable>
          <Text style={[tekstStijl("schermtitel", c.foreground), { flex: 1 }]}>
            Inkooporders
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: ruimte.s - 2, marginTop: ruimte.m + 2, flexWrap: "wrap" }}>
          {filterOpties.map((k) => {
            const actief = statusFilter === k.sleutel;
            return (
              <Pressable
                key={k.sleutel}
                onPress={() => setStatusFilter(k.sleutel)}
                style={{
                  paddingHorizontal: ruimte.m,
                  paddingVertical: ruimte.s - 2,
                  borderRadius: c.radius,
                  backgroundColor: actief ? c.primary : c.card,
                  borderWidth: 1,
                  borderColor: actief ? c.primary : c.border,
                }}
              >
                <Text style={tekstStijl("klein", actief ? c.primaryForeground : c.mutedForeground)}>
                  {k.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, padding: ruimte.l }}>
          <Ladenstaat regels={5} />
        </View>
      ) : gefilterd.length === 0 ? (
        <LegeStaat
          icoon="cube-outline"
          titel="Geen inkooporders"
          beschrijving="Er zijn geen inkooporders gevonden."
        />
      ) : (
        <FlatList
          data={gefilterd}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <InkooporderKaart item={item} />}
          contentContainerStyle={{ paddingHorizontal: ruimte.l, paddingBottom: insets.bottom + ruimte.xl }}
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
