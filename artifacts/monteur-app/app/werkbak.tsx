// WERKBAK_01 — mobiel tabblad van de persoonlijke werkbak. Zelfde regels als
// web: Doen/Weten gescheiden, gerangschikt op consequentie, items verdwijnen
// nooit vanzelf (afhandelen of wegzetten met verplichte reden).
import {
  useListWerkbakItems,
  getListWerkbakItemsQueryKey,
  getGetWerkbakAantalQueryKey,
  useHandelWerkbakItemAf,
  useZetWerkbakItemWeg,
  type WerkbakItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";

const BRON_LABELS: Record<string, string> = {
  goedkeuringsaanvraag: "Goedkeuring",
  verlofaanvraag: "Verlof",
  factuur_goedkeuring: "Factuur",
  betaalbatch: "Betaalbatch",
  conceptantwoord: "Aanvraag",
  mail_antwoord: "Mail",
  contractbesluit: "Contract",
  poortwachter: "Poortwachter",
  verloopdatum: "Verloopdatum",
  verlofverjaring: "Verlofverjaring",
  factuursignaal: "Factuursignaal",
  contract_verlenging: "Contract",
  bewakingsloop: "Systeem",
};

export default function WerkbakScherm() {
  const { token } = useAuth();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: items, isLoading, isError, refetch, isRefetching } = useListWerkbakItems();
  const [wegzetItem, setWegzetItem] = useState<WerkbakItem | null>(null);
  const [reden, setReden] = useState("");

  const invalideer = (): void => {
    void queryClient.invalidateQueries({ queryKey: getListWerkbakItemsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetWerkbakAantalQueryKey() });
  };
  const afhandelen = useHandelWerkbakItemAf({ mutation: { onSuccess: invalideer } });
  const wegzetten = useZetWerkbakItemWeg({
    mutation: {
      onSuccess: () => {
        invalideer();
        setWegzetItem(null);
        setReden("");
      },
      onError: () => Alert.alert("Wegzetten mislukt", "Probeer het opnieuw."),
    },
  });

  const gesorteerd = useMemo(() => {
    const lijst = items ?? [];
    return [
      ...lijst.filter((i) => i.soort === "doen"),
      ...lijst.filter((i) => i.soort === "weten"),
    ];
  }, [items]);

  if (!token) return <Redirect href="/login" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.background, paddingTop: bovenInset(insets) }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 10, gap: 10 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} testID="knop-terug">
          <Ionicons name="chevron-back" size={24} color={c.foreground} />
        </Pressable>
        <Text style={{ fontSize: 20, fontWeight: "700", color: c.foreground }}>Werkbak</Text>
      </View>
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : isError ? (
        <Text style={{ color: c.mutedForeground, textAlign: "center", marginTop: 40 }}>
          Werkbak kon niet worden geladen.
        </Text>
      ) : (
        <FlatList
          data={gesorteerd}
          keyExtractor={(i) => String(i.id)}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 8 }}
          ListEmptyComponent={
            <Text style={{ color: c.mutedForeground, textAlign: "center", marginTop: 40 }} testID="tekst-werkbak-leeg">
              Niets te doen — de werkbak is leeg.
            </Text>
          }
          renderItem={({ item, index }) => {
            const eersteVanSoort = index === 0 || gesorteerd[index - 1]?.soort !== item.soort;
            const urgent = item.gewicht >= 85;
            return (
              <View>
                {eersteVanSoort && (
                  <Text style={{ fontSize: 12, fontWeight: "700", color: c.mutedForeground, textTransform: "uppercase", marginBottom: 6, marginTop: index === 0 ? 0 : 12 }}>
                    {item.soort === "doen" ? "Doen" : "Weten"}
                  </Text>
                )}
                <View
                  style={{
                    backgroundColor: c.card,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: urgent ? "#fca5a5" : c.border,
                    padding: 12,
                    gap: 6,
                  }}
                  testID={`kaart-werkbak-item-${item.id}`}
                >
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Text style={{ flex: 1, fontWeight: "600", color: c.foreground }}>{item.titel}</Text>
                    <Text style={{ fontSize: 11, color: c.mutedForeground }}>{BRON_LABELS[item.bron] ?? item.bron}</Text>
                  </View>
                  {!!item.omschrijving && (
                    <Text style={{ fontSize: 13, color: c.mutedForeground }}>{item.omschrijving}</Text>
                  )}
                  <View style={{ flexDirection: "row", gap: 14, marginTop: 2 }}>
                    <Pressable
                      onPress={() => afhandelen.mutate({ id: item.id })}
                      disabled={afhandelen.isPending}
                      hitSlop={8}
                      testID={`knop-afhandelen-${item.id}`}
                    >
                      <Text style={{ color: c.primary, fontWeight: "600", fontSize: 13 }}>Afgehandeld</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => { setWegzetItem(item); setReden(""); }}
                      hitSlop={8}
                      testID={`knop-wegzetten-${item.id}`}
                    >
                      <Text style={{ color: c.mutedForeground, fontWeight: "600", fontSize: 13 }}>Wegzetten</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
      {wegzetItem != null && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setWegzetItem(null)}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 }}>
            <View style={{ backgroundColor: c.card, borderRadius: 12, padding: 16, gap: 10 }}>
              <Text style={{ fontWeight: "700", color: c.foreground }}>Wegzetten</Text>
              <Text style={{ fontSize: 13, color: c.mutedForeground }}>{wegzetItem.titel}</Text>
              <TextInput
                value={reden}
                onChangeText={setReden}
                placeholder="Waarom zet je dit weg? (verplicht)"
                placeholderTextColor={c.mutedForeground}
                multiline
                style={{ borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10, minHeight: 60, color: c.foreground }}
                testID="invoer-wegzet-reden"
              />
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 16 }}>
                <Pressable onPress={() => setWegzetItem(null)} hitSlop={8}>
                  <Text style={{ color: c.mutedForeground, fontWeight: "600" }}>Annuleren</Text>
                </Pressable>
                <Pressable
                  disabled={!reden.trim() || wegzetten.isPending}
                  onPress={() => wegzetten.mutate({ id: wegzetItem.id, data: { reden: reden.trim() } })}
                  hitSlop={8}
                  testID="knop-wegzet-bevestig"
                >
                  <Text style={{ color: reden.trim() ? c.primary : c.mutedForeground, fontWeight: "700" }}>Wegzetten</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}
