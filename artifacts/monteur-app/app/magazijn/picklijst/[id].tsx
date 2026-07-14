import {
  useGetMagazijnPicklijst,
  useVerwerkMagazijnPicklijst,
  getListMagazijnPicklijstenQueryKey,
  getGetMagazijnPicklijstQueryKey,
  type MagazijnPicklijstRegel,
} from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OfflineBanner } from "@/components/OfflineBanner";
import { bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useOffline } from "@/context/offline";
import { useSync } from "@/context/sync";
import { useColors } from "@/hooks/useColors";
import { voegToeAanWachtrij } from "@/lib/syncQueue";

const EENHEID_LABELS: Record<string, string> = {
  st: "st.", m: "m", m2: "m²", m3: "m³", uur: "uur", kg: "kg", set: "set",
};

function eenheidLabel(e: string | null | undefined): string {
  return e ? (EENHEID_LABELS[e] ?? e) : "";
}

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

interface RegelState {
  regelId: number;
  gepickt: boolean;
  gepicktHoeveelheid: number;
}

function RegelRij({
  regel,
  state,
  onChange,
  gesloten,
}: {
  regel: MagazijnPicklijstRegel;
  state: RegelState;
  onChange: (s: RegelState) => void;
  gesloten: boolean;
}) {
  const c = useColors();
  const isGepickt = regel.status === "gepickt";
  const toonInvoer = state.gepickt && !isGepickt && !gesloten;

  function toggle() {
    if (gesloten) return;
    onChange({
      ...state,
      gepickt: !state.gepickt,
      gepicktHoeveelheid: !state.gepickt ? regel.gevraagd_hoeveelheid : 0,
    });
  }

  function wijzigHoeveelheid(tekst: string) {
    const genormaliseerd = tekst.replace(/[^0-9]/g, "");
    if (genormaliseerd === "") {
      onChange({ ...state, gepicktHoeveelheid: 0 });
      return;
    }
    let waarde = parseInt(genormaliseerd, 10);
    if (isNaN(waarde) || waarde < 0) waarde = 0;
    if (waarde > regel.gevraagd_hoeveelheid) waarde = regel.gevraagd_hoeveelheid;
    onChange({ ...state, gepicktHoeveelheid: waarde });
  }

  return (
    <Pressable
      onPress={toggle}
      disabled={gesloten}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: pressed && !gesloten ? c.card + "aa" : c.card,
        borderRadius: 10,
        padding: 14,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: state.gepickt || isGepickt ? "#22c55e44" : c.border,
        opacity: gesloten ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: state.gepickt || isGepickt ? "#22c55e" : c.border,
          backgroundColor: state.gepickt || isGepickt ? "#22c55e" : "transparent",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {(state.gepickt || isGepickt) && (
          <Ionicons name="checkmark" size={15} color="#fff" />
        )}
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: c.text,
            fontSize: 14,
            fontWeight: "600",
            textDecorationLine: isGepickt ? "line-through" : "none",
          }}
          numberOfLines={2}
        >
          {regel.artikel_naam ?? `Artikel #${regel.artikel_id}`}
        </Text>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 3, flexWrap: "wrap" }}>
          {regel.artikel_code ? (
            <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{regel.artikel_code}</Text>
          ) : null}
          {regel.locatie_naam ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Ionicons name="location-outline" size={11} color={c.mutedForeground} />
              <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{regel.locatie_naam}</Text>
            </View>
          ) : null}
          {regel.vrije_voorraad != null ? (
            <Text style={{ color: regel.vrije_voorraad >= regel.gevraagd_hoeveelheid ? "#22c55e" : "#f59e0b", fontSize: 12 }}>
              voorraad: {regel.vrije_voorraad} {eenheidLabel(regel.artikel_eenheid)}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={{ alignItems: "flex-end", flexShrink: 0 }}>
        <Text style={{ color: c.text, fontSize: 14, fontWeight: "700" }}>
          {regel.gevraagd_hoeveelheid} {eenheidLabel(regel.artikel_eenheid)}
        </Text>
        {isGepickt ? (
          <Text style={{ color: "#22c55e", fontSize: 11, marginTop: 2 }}>gepickt</Text>
        ) : null}
        {toonInvoer ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 }}>
            <Text style={{ color: c.mutedForeground, fontSize: 11 }}>gepickt:</Text>
            <TextInput
              value={String(state.gepicktHoeveelheid)}
              onChangeText={wijzigHoeveelheid}
              keyboardType="number-pad"
              selectTextOnFocus
              style={{
                minWidth: 44,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderWidth: 1,
                borderColor: state.gepicktHoeveelheid === 0 ? "#f59e0b" : c.border,
                borderRadius: 8,
                color: c.text,
                fontSize: 14,
                fontWeight: "700",
                textAlign: "center",
                backgroundColor: c.background,
              }}
            />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function PicklijstDetailScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const picklijstId = Number(id);
  const { token } = useAuth();
  const { isOnline } = useOffline();
  const { forceerSync } = useSync();
  const queryClient = useQueryClient();

  const [regelStaten, setRegelStaten] = useState<Map<number, RegelState>>(new Map());
  const geinitialiseerd = useRef(false);
  const [bezigVerwerken, setBezigVerwerken] = useState(false);

  const verwerkMut = useVerwerkMagazijnPicklijst();

  const { data: picklijst, isLoading } = useGetMagazijnPicklijst(
    picklijstId,
    { query: { enabled: !!token && !isNaN(picklijstId) } } as any,
  );

  useEffect(() => {
    if (!picklijst?.regels || geinitialiseerd.current) return;
    geinitialiseerd.current = true;
    const nieuw = new Map<number, RegelState>();
    for (const r of picklijst.regels) {
      nieuw.set(r.id, {
        regelId: r.id,
        gepickt: r.status === "gepickt",
        gepicktHoeveelheid: r.status === "gepickt" ? r.gepickt_hoeveelheid : r.gevraagd_hoeveelheid,
      });
    }
    setRegelStaten(nieuw);
  }, [picklijst?.regels]);

  const updateRegel = useCallback((s: RegelState) => {
    setRegelStaten((prev) => new Map(prev).set(s.regelId, s));
  }, []);

  if (!token) return <Redirect href="/login" />;

  const gesloten =
    picklijst?.status === "voltooid" ||
    picklijst?.status === "deels_voltooid" ||
    picklijst?.status === "geannuleerd";
  const statusLabel = picklijst ? (STATUS_LABELS[picklijst.status] ?? picklijst.status) : "";
  const statusKleur = picklijst ? (STATUS_KLEUREN[picklijst.status] ?? "#6b7280") : "#6b7280";

  const alleAangevinkt = picklijst?.regels?.every((r) => {
    const s = regelStaten.get(r.id);
    return s?.gepickt === true || r.status === "gepickt";
  }) ?? false;

  const aantalGepickt = picklijst?.regels?.filter((r) => {
    if (r.status === "gepickt") return true;
    const s = regelStaten.get(r.id);
    return s?.gepickt === true && (s?.gepicktHoeveelheid ?? 0) > 0;
  }).length ?? 0;

  const aantalTeVerwerken = picklijst?.regels?.filter((r) => {
    if (r.status === "gepickt") return false;
    const s = regelStaten.get(r.id);
    return s?.gepickt === true && (s?.gepicktHoeveelheid ?? 0) > 0;
  }).length ?? 0;

  const totaalRegels = picklijst?.regels?.length ?? 0;

  async function verwerk() {
    if (!picklijst?.regels) return;
    const teVerwerkenRegels = picklijst.regels
      .filter((r) => {
        const s = regelStaten.get(r.id);
        return s?.gepickt === true && r.status !== "gepickt" && (s?.gepicktHoeveelheid ?? 0) > 0;
      })
      .map((r) => {
        const s = regelStaten.get(r.id);
        return {
          regel_id: r.id,
          gepickt_hoeveelheid: s?.gepicktHoeveelheid ?? r.gevraagd_hoeveelheid,
          status: "gepickt",
        };
      });

    if (teVerwerkenRegels.length === 0) {
      Alert.alert("Geen wijzigingen", "Vink eerst artikelen aan die je hebt gepickt.");
      return;
    }

    setBezigVerwerken(true);
    try {
      if (isOnline) {
        await verwerkMut.mutateAsync({ id: picklijstId, data: { regels: teVerwerkenRegels } });
        void queryClient.invalidateQueries({ queryKey: getGetMagazijnPicklijstQueryKey(picklijstId) });
        void queryClient.invalidateQueries({ queryKey: getListMagazijnPicklijstenQueryKey() });
        Alert.alert("Gepickt", "De picklijst is bijgewerkt.");
      } else {
        await voegToeAanWachtrij({
          type: "verwerk_picklijst",
          picklijstId,
          payload: { regels: teVerwerkenRegels },
        });
        void forceerSync();
        Alert.alert(
          "Opgeslagen",
          "Je keuze is lokaal opgeslagen en wordt verstuurd zodra je weer online bent.",
        );
      }
    } catch {
      Alert.alert("Fout", "Verwerken mislukt. Probeer het opnieuw.");
    } finally {
      setBezigVerwerken(false);
    }
  }

  function allesAanvinken() {
    if (!picklijst?.regels || gesloten) return;
    const nieuw = new Map(regelStaten);
    for (const r of picklijst.regels) {
      if (r.status !== "gepickt") {
        nieuw.set(r.id, { regelId: r.id, gepickt: true, gepicktHoeveelheid: r.gevraagd_hoeveelheid });
      }
    }
    setRegelStaten(nieuw);
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ paddingTop: bovenInset(insets), paddingHorizontal: 16, paddingBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 4 }}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={22} color={c.text} />
          </Pressable>
          <Text style={{ color: c.text, fontSize: 18, fontWeight: "700", flex: 1 }} numberOfLines={1}>
            {picklijst?.opdracht_titel ?? (isLoading ? "Laden..." : `Picklijst #${picklijstId}`)}
          </Text>
          {picklijst ? (
            <View style={{
              backgroundColor: statusKleur + "22",
              borderRadius: 6,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}>
              <Text style={{ color: statusKleur, fontSize: 12, fontWeight: "600" }}>
                {statusLabel}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <OfflineBanner stijl="compact" />

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color="#f97316" />
        </View>
      ) : !picklijst ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Text style={{ color: c.mutedForeground, fontSize: 15 }}>Picklijst niet gevonden</Text>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 120 + insets.bottom }}
          >
            {picklijst.notities ? (
              <View style={{
                backgroundColor: "#f59e0b22",
                borderRadius: 10,
                padding: 12,
                marginBottom: 14,
                flexDirection: "row",
                gap: 8,
                alignItems: "flex-start",
              }}>
                <Ionicons name="information-circle-outline" size={16} color="#f59e0b" style={{ marginTop: 1 }} />
                <Text style={{ color: c.text, fontSize: 13, flex: 1 }}>{picklijst.notities}</Text>
              </View>
            ) : null}

            <View style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}>
              <Text style={{ color: c.text, fontWeight: "700", fontSize: 15 }}>
                Artikelen ({aantalGepickt}/{totaalRegels} gepickt)
              </Text>
              {!gesloten && totaalRegels > 0 && (
                <Pressable onPress={allesAanvinken} hitSlop={8}>
                  <Text style={{ color: "#f97316", fontSize: 13, fontWeight: "600" }}>
                    Alles aanvinken
                  </Text>
                </Pressable>
              )}
            </View>

            {picklijst.regels && picklijst.regels.length > 0 ? (
              picklijst.regels.map((r) => (
                <RegelRij
                  key={r.id}
                  regel={r}
                  state={regelStaten.get(r.id) ?? {
                    regelId: r.id,
                    gepickt: r.status === "gepickt",
                    gepicktHoeveelheid: r.gepickt_hoeveelheid,
                  }}
                  onChange={updateRegel}
                  gesloten={gesloten}
                />
              ))
            ) : (
              <View style={{ alignItems: "center", padding: 24 }}>
                <Text style={{ color: c.mutedForeground, fontSize: 14 }}>Geen artikelen op deze picklijst</Text>
              </View>
            )}
          </ScrollView>

          {!gesloten && (
            <View style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: c.background,
              borderTopWidth: 1,
              borderTopColor: c.border,
              padding: 16,
              paddingBottom: insets.bottom + 16,
            }}>
              {!isOnline && (
                <View style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: "#f59e0b22",
                  borderRadius: 8,
                  padding: 10,
                  marginBottom: 12,
                }}>
                  <Ionicons name="cloud-offline-outline" size={15} color="#f59e0b" />
                  <Text style={{ color: "#f59e0b", fontSize: 13, flex: 1 }}>
                    Offline — wijzigingen worden later verstuurd
                  </Text>
                </View>
              )}
              <Pressable
                onPress={() => void verwerk()}
                disabled={bezigVerwerken || aantalTeVerwerken === 0}
                style={({ pressed }) => ({
                  backgroundColor:
                    bezigVerwerken || aantalTeVerwerken === 0
                      ? "#6b7280"
                      : pressed
                        ? "#ea580c"
                        : "#f97316",
                  borderRadius: 12,
                  padding: 16,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                })}
              >
                {bezigVerwerken ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                )}
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
                  {bezigVerwerken
                    ? "Bezig..."
                    : `Verwerk ${aantalTeVerwerken} artikel${aantalTeVerwerken !== 1 ? "en" : ""}`}
                </Text>
              </Pressable>
            </View>
          )}
        </>
      )}
    </View>
  );
}
