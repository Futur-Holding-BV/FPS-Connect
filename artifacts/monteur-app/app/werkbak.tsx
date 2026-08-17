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
import { ruimte } from "@workspace/ontwerp";

import { Ladenstaat, tekstStijl, bovenInset } from "@/components/ui";
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
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: ruimte.l, paddingBottom: ruimte.s + 2, gap: ruimte.s + 2 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} testID="knop-terug">
          <Ionicons name="chevron-back" size={ruimte.xl} color={c.foreground} />
        </Pressable>
        <Text style={tekstStijl("sectiekop", c.foreground)}>Werkbak</Text>
      </View>
      {isLoading ? (
        <View style={{ padding: ruimte.l }}>
          <Ladenstaat regels={5} />
        </View>
      ) : isError ? (
        <Text style={[tekstStijl("standaard", c.mutedForeground), { textAlign: "center", marginTop: ruimte.xxl + ruimte.s }]}>
          Werkbak kon niet worden geladen.
        </Text>
      ) : (
        <FlatList
          data={gesorteerd}
          keyExtractor={(i) => String(i.id)}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
          contentContainerStyle={{ paddingHorizontal: ruimte.l, paddingBottom: ruimte.xxl, gap: ruimte.s }}
          ListEmptyComponent={
            <Text style={[tekstStijl("standaard", c.mutedForeground), { textAlign: "center", marginTop: ruimte.xxl + ruimte.s }]} testID="tekst-werkbak-leeg">
              Niets te doen — de werkbak is leeg.
            </Text>
          }
          renderItem={({ item, index }) => {
            const eersteVanSoort = index === 0 || gesorteerd[index - 1]?.soort !== item.soort;
            const urgent = item.gewicht >= 85;
            return (
              <View>
                {eersteVanSoort && (
                  <Text style={[tekstStijl("bijschrift", c.mutedForeground), { fontFamily: "Inter_700Bold", textTransform: "uppercase", marginBottom: ruimte.s - 2, marginTop: index === 0 ? 0 : ruimte.m }]}>
                    {item.soort === "doen" ? "Doen" : "Weten"}
                  </Text>
                )}
                <View
                  style={{
                    backgroundColor: c.card,
                    borderRadius: c.radius,
                    borderWidth: 1,
                    borderColor: urgent ? c.destructive : c.border,
                    padding: ruimte.m,
                    gap: ruimte.s - 2,
                  }}
                  testID={`kaart-werkbak-item-${item.id}`}
                >
                  <View style={{ flexDirection: "row", gap: ruimte.s }}>
                    <Text style={[tekstStijl("nadruk", c.foreground), { flex: 1 }]}>{item.titel}</Text>
                    <Text style={tekstStijl("bijschrift", c.mutedForeground)}>{BRON_LABELS[item.bron] ?? item.bron}</Text>
                  </View>
                  {!!item.omschrijving && (
                    <Text style={tekstStijl("klein", c.mutedForeground)}>{item.omschrijving}</Text>
                  )}
                  <View style={{ flexDirection: "row", gap: ruimte.m + 2, marginTop: ruimte.xs / 2 }}>
                    <Pressable
                      onPress={() => afhandelen.mutate({ id: item.id })}
                      disabled={afhandelen.isPending}
                      hitSlop={8}
                      testID={`knop-afhandelen-${item.id}`}
                    >
                      <Text style={[tekstStijl("klein", c.primary), { fontFamily: "Inter_600SemiBold" }]}>Afgehandeld</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => { setWegzetItem(item); setReden(""); }}
                      hitSlop={8}
                      testID={`knop-wegzetten-${item.id}`}
                    >
                      <Text style={[tekstStijl("klein", c.mutedForeground), { fontFamily: "Inter_600SemiBold" }]}>Wegzetten</Text>
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
          <View style={{ flex: 1, backgroundColor: c.dark + "80", justifyContent: "center", padding: ruimte.xl }}>
            <View style={{ backgroundColor: c.card, borderRadius: c.radius, padding: ruimte.l, gap: ruimte.s + 2 }}>
              <Text style={tekstStijl("nadruk", c.foreground)}>Wegzetten</Text>
              <Text style={tekstStijl("klein", c.mutedForeground)}>{wegzetItem.titel}</Text>
              <TextInput
                value={reden}
                onChangeText={setReden}
                placeholder="Waarom zet je dit weg? (verplicht)"
                placeholderTextColor={c.mutedForeground}
                multiline
                style={[tekstStijl("standaard", c.foreground), { borderWidth: 1, borderColor: c.border, borderRadius: c.radius / 2, padding: ruimte.s + 2, minHeight: ruimte.xxl + ruimte.xl }]}
                testID="invoer-wegzet-reden"
              />
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: ruimte.l }}>
                <Pressable onPress={() => setWegzetItem(null)} hitSlop={8}>
                  <Text style={tekstStijl("nadruk", c.mutedForeground)}>Annuleren</Text>
                </Pressable>
                <Pressable
                  disabled={!reden.trim() || wegzetten.isPending}
                  onPress={() => wegzetten.mutate({ id: wegzetItem.id, data: { reden: reden.trim() } })}
                  hitSlop={8}
                  testID="knop-wegzet-bevestig"
                >
                  <Text style={tekstStijl("nadruk", reden.trim() ? c.primary : c.mutedForeground)}>Wegzetten</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}
