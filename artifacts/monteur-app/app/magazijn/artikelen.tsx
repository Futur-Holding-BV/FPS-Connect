import {
  useListArtikelen,
  useListVoorraadTotaal,
} from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import { ruimte } from "@workspace/ontwerp";
import { Redirect, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Ladenstaat,
  LegeStaat,
  bovenInset,
  tekstStijl,
} from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { BevoegdheidGuard } from "@/components/BevoegdheidGuard";

const EENHEID_LABELS: Record<string, string> = {
  st: "stuks", m: "meter", m2: "m\u00b2", m3: "m\u00b3",
  uur: "uur", kg: "kg", set: "set",
};
function eenheidLabel(e: string | null | undefined) {
  return e ? (EENHEID_LABELS[e] ?? e) : "";
}

type ArtikelItem = {
  id: number;
  naam: string;
  code: string | null | undefined;
  categorie: string | null | undefined;
  eenheid: string;
  minimum_voorraad: number | null | undefined;
};

function MagazijnArtikelenScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [zoek, setZoek] = useState("");

  const { data: artikelenData, isLoading } = useListArtikelen({
    actief: true,
    zoek: zoek || undefined,
  });
  const { data: voorraadData = [] } = useListVoorraadTotaal();

  if (!token) return <Redirect href="/login" />;

  const artikelen = (artikelenData ?? []) as unknown as ArtikelItem[];
  const voorraadMap = new Map(voorraadData.map((v) => [v.artikel_id, v]));

  function naarActie(artikelId: number) {
    router.push(`/magazijn/scan?artikel_id=${artikelId}` as "/werkdag");
  }

  function renderArtikel({ item }: { item: ArtikelItem }) {
    const v = voorraadMap.get(item.id);
    const vrij = v?.vrij ?? null;
    const onderMin = v?.onder_minimum ?? false;

    return (
      <Pressable
        onPress={() => naarActie(item.id)}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: ruimte.l,
          paddingVertical: ruimte.m + 2,
          backgroundColor: pressed ? c.muted : c.card,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
          gap: ruimte.m,
        })}
      >
        <View
          style={{
            width: ruimte.xxl + ruimte.s,
            height: ruimte.xxl + ruimte.s,
            borderRadius: c.radius / 2,
            backgroundColor: c.accent,
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Ionicons
            name={onderMin ? "warning-outline" : "cube-outline"}
            size={ruimte.l + ruimte.xs}
            color={onderMin ? c.destructive : c.primary}
          />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={tekstStijl("nadruk", c.foreground)}
            numberOfLines={1}
          >
            {item.naam}
          </Text>
          {item.code ? (
            <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 1 }]}>
              {item.code}{item.categorie ? ` · ${item.categorie}` : ""}
            </Text>
          ) : item.categorie ? (
            <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 1 }]}>
              {item.categorie}
            </Text>
          ) : null}
        </View>

        <View style={{ alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
          <Text style={tekstStijl("sectiekop", onderMin ? c.destructive : c.success)}>
            {vrij !== null ? vrij : "—"}
          </Text>
          <Text style={tekstStijl("bijschrift", c.mutedForeground)}>
            {eenheidLabel(item.eenheid)}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={ruimte.l} color={c.mutedForeground} />
      </Pressable>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={{
          backgroundColor: c.dark,
          paddingTop: bovenInset(insets) + ruimte.m,
          paddingHorizontal: ruimte.l + ruimte.xs,
          paddingBottom: ruimte.l,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.m, marginBottom: ruimte.m + 2 }}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={ruimte.xl} color={c.darkForeground} />
          </Pressable>
          <Text style={[tekstStijl("sectiekop", c.darkForeground), { flex: 1 }]}>
            Artikelen &amp; voorraad
          </Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: c.secondary,
            borderRadius: c.radius / 2,
            paddingHorizontal: ruimte.m,
            gap: ruimte.s,
          }}
        >
          <Ionicons name="search" size={ruimte.l + 2} color={c.darkMuted} />
          <TextInput
            value={zoek}
            onChangeText={setZoek}
            placeholder="Artikel zoeken..."
            placeholderTextColor={c.darkMuted}
            style={[
              tekstStijl("klein", c.darkForeground),
              { flex: 1, height: ruimte.xxl + ruimte.s },
            ]}
          />
          {zoek.length > 0 && (
            <Pressable onPress={() => setZoek("")} hitSlop={8}>
              <Ionicons name="close-circle" size={ruimte.l + 2} color={c.darkMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, padding: ruimte.l }}>
          <Ladenstaat regels={6} />
        </View>
      ) : artikelen.length === 0 ? (
        <LegeStaat
          icoon="cube-outline"
          titel={zoek ? "Geen resultaten" : "Geen artikelen"}
          beschrijving={
            zoek
              ? `Geen artikelen gevonden voor "${zoek}"`
              : "Geen artikelen beschikbaar."
          }
        />
      ) : (
        <FlatList
          data={artikelen}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderArtikel}
          contentContainerStyle={{ paddingBottom: insets.bottom + ruimte.l }}
          ListHeaderComponent={
            <View style={{ paddingHorizontal: ruimte.l, paddingVertical: ruimte.s + 2, backgroundColor: c.muted }}>
              <Text style={tekstStijl("bijschrift", c.mutedForeground)}>
                {artikelen.length} artikel{artikelen.length !== 1 ? "en" : ""} — tik om uit te geven / te retourneren
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// APP_01 §3.3 — schermbescherming: nette weigering zonder bevoegdheid
// (backendroute eist magazijn niveau 1; gemeten, zie docs/metingen).
export default function MagazijnArtikelenSchermBeveiligd() {
  return (
    <BevoegdheidGuard vereiste={{ module: "magazijn", niveau: 1 }}>
      <MagazijnArtikelenScherm />
    </BevoegdheidGuard>
  );
}
