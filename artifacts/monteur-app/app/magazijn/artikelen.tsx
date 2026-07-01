import {
  useListArtikelen,
  useListVoorraadTotaal,
} from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";

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

export default function MagazijnArtikelenScherm() {
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
          paddingHorizontal: 16,
          paddingVertical: 14,
          backgroundColor: pressed ? c.muted : c.card,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
          gap: 12,
        })}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            backgroundColor: onderMin ? "#fef2f2" : "#fff3ef",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Ionicons
            name={onderMin ? "warning-outline" : "cube-outline"}
            size={20}
            color={onderMin ? "#dc2626" : c.primary}
          />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.text }}
            numberOfLines={1}
          >
            {item.naam}
          </Text>
          {item.code ? (
            <Text style={{ fontSize: 12, color: c.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 1 }}>
              {item.code}{item.categorie ? ` · ${item.categorie}` : ""}
            </Text>
          ) : item.categorie ? (
            <Text style={{ fontSize: 12, color: c.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 1 }}>
              {item.categorie}
            </Text>
          ) : null}
        </View>

        <View style={{ alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
          <Text
            style={{
              fontSize: 16,
              fontFamily: "Inter_700Bold",
              color: onderMin ? "#dc2626" : "#16a34a",
            }}
          >
            {vrij !== null ? vrij : "—"}
          </Text>
          <Text style={{ fontSize: 10, color: c.mutedForeground, fontFamily: "Inter_400Regular" }}>
            {eenheidLabel(item.eenheid)}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={16} color={c.mutedForeground} />
      </Pressable>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={{
          backgroundColor: c.dark,
          paddingTop: bovenInset(insets) + 12,
          paddingHorizontal: 20,
          paddingBottom: 16,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={c.darkForeground} />
          </Pressable>
          <Text style={{ color: c.darkForeground, fontSize: 18, fontFamily: "Inter_700Bold", flex: 1 }}>
            Artikelen &amp; voorraad
          </Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "rgba(255,255,255,0.12)",
            borderRadius: 10,
            paddingHorizontal: 12,
            gap: 8,
          }}
        >
          <Ionicons name="search" size={18} color={c.darkMuted} />
          <TextInput
            value={zoek}
            onChangeText={setZoek}
            placeholder="Artikel zoeken..."
            placeholderTextColor={c.darkMuted}
            style={{
              flex: 1,
              height: 40,
              color: c.darkForeground,
              fontFamily: "Inter_400Regular",
              fontSize: 14,
            }}
          />
          {zoek.length > 0 && (
            <Pressable onPress={() => setZoek("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={c.darkMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={c.primary} />
          <Text style={{ marginTop: 12, color: c.mutedForeground, fontFamily: "Inter_400Regular" }}>
            Artikelen laden...
          </Text>
        </View>
      ) : artikelen.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Ionicons name="cube-outline" size={48} color={c.mutedForeground} />
          <Text style={{ marginTop: 12, color: c.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center" }}>
            {zoek ? `Geen artikelen gevonden voor "${zoek}"` : "Geen artikelen beschikbaar"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={artikelen}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderArtikel}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          ListHeaderComponent={
            <View style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: c.muted }}>
              <Text style={{ fontSize: 12, color: c.mutedForeground, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.4 }}>
                {artikelen.length} artikel{artikelen.length !== 1 ? "en" : ""} — tik om uit te geven / te retourneren
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
