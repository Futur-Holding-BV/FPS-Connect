import {
  useListMagazijnPicklijsten,
  type MagazijnPicklijst,
} from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import { ruimte } from "@workspace/ontwerp";
import { Redirect, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { usePicklijstMelding } from "@/hooks/usePicklijstMelding";
import { BevoegdheidGuard } from "@/components/BevoegdheidGuard";

const STATUS_LABELS: Record<string, string> = {
  concept: "Concept",
  deels_voltooid: "Deels gepickt",
  voltooid: "Voltooid",
  geannuleerd: "Geannuleerd",
};

// Statussen → soort Statusmerk (kleur komt uit het palet, niet uit dit bestand).
const STATUS_SOORT: Record<string, "neutraal" | "succes" | "waarschuwing" | "fout" | "primair"> = {
  concept: "primair",
  deels_voltooid: "waarschuwing",
  voltooid: "succes",
  geannuleerd: "neutraal",
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
  const voortgang =
    item.totaal_regels > 0
      ? Math.round((item.gepickt_regels / item.totaal_regels) * 100)
      : 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ marginBottom: ruimte.s + 2, opacity: pressed ? 0.85 : 1 })}
    >
      <Kaart stijl={{ padding: ruimte.l }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: ruimte.s, gap: ruimte.s }}>
          <View style={{ flex: 1 }}>
            <Text style={[tekstStijl("nadruk", c.foreground), { flexShrink: 1 }]} numberOfLines={1}>
              {item.opdracht_titel ?? `Picklijst #${item.id}`}
            </Text>
            {item.notities ? (
              <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 2 }]} numberOfLines={1}>
                {item.notities}
              </Text>
            ) : null}
          </View>
          <Statusmerk
            label={STATUS_LABELS[item.status] ?? netteWaarde(item.status)}
            soort={STATUS_SOORT[item.status] ?? "neutraal"}
          />
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.m }}>
          <View style={{ flex: 1 }}>
            <View style={{ height: ruimte.xs, backgroundColor: c.border, borderRadius: ruimte.xs / 2, overflow: "hidden" }}>
              <View
                style={{
                  width: `${voortgang}%`,
                  height: ruimte.xs,
                  backgroundColor: item.status === "voltooid" ? c.success : c.primary,
                  borderRadius: ruimte.xs / 2,
                }}
              />
            </View>
            <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: ruimte.xs }]}>
              {item.gepickt_regels}/{item.totaal_regels} artikelen gepickt
            </Text>
          </View>
          {item.geplande_uitgifte_op ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.xs }}>
              <Ionicons name="calendar-outline" size={13} color={c.mutedForeground} />
              <Text style={tekstStijl("klein", c.mutedForeground)}>
                {formatDatum(item.geplande_uitgifte_op)}
              </Text>
            </View>
          ) : null}
          <Ionicons name="chevron-forward" size={ruimte.l} color={c.mutedForeground} />
        </View>
      </Kaart>
    </Pressable>
  );
}

function PicklijstenScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [filter, setFilter] = useState<StatusFilter>("open");

  const { data: picklijsten = [], isLoading, refetch } = useListMagazijnPicklijsten(
    { mijn_opdrachten: true },
    { query: { enabled: !!token } } as any,
  );

  const { markeerGezien } = usePicklijstMelding();

  useEffect(() => {
    if (isLoading) return;
    void markeerGezien();
  }, [isLoading, picklijsten.length, markeerGezien]);

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
      <View style={{ paddingTop: bovenInset(insets), paddingHorizontal: ruimte.l, paddingBottom: ruimte.m }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.s + 2, paddingTop: ruimte.xs }}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={ruimte.xl} color={c.foreground} />
          </Pressable>
          <Text style={[tekstStijl("schermtitel", c.foreground), { flex: 1 }]}>
            Picklijsten
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: ruimte.s, marginTop: ruimte.m + 2 }}>
          {filterKnoppen.map((k) => {
            const actief = filter === k.sleutel;
            return (
              <Pressable
                key={k.sleutel}
                onPress={() => setFilter(k.sleutel)}
                style={{
                  paddingHorizontal: ruimte.m + 2,
                  paddingVertical: ruimte.s - 1,
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
          icoon="checkmark-circle-outline"
          titel={filter === "open" ? "Geen openstaande picklijsten" : "Geen picklijsten"}
          beschrijving={
            filter === "open"
              ? "Er zijn momenteel geen openstaande picklijsten."
              : "Geen picklijsten gevonden."
          }
        />
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
          contentContainerStyle={{ paddingHorizontal: ruimte.l, paddingBottom: insets.bottom + ruimte.xl }}
          onRefresh={() => void refetch()}
          refreshing={isLoading}
        />
      )}
    </View>
  );
}

// APP_01 §3.3 — schermbescherming: nette weigering zonder bevoegdheid
// (backendroute eist magazijn niveau 1; gemeten, zie docs/metingen).
export default function PicklijstenSchermBeveiligd() {
  return (
    <BevoegdheidGuard vereiste={{ module: "magazijn", niveau: 1 }}>
      <PicklijstenScherm />
    </BevoegdheidGuard>
  );
}
