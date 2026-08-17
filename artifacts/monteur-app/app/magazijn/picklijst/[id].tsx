import {
  useGetMagazijnPicklijst,
  useVerwerkMagazijnPicklijst,
  getListMagazijnPicklijstenQueryKey,
  getGetMagazijnPicklijstQueryKey,
  type MagazijnPicklijstRegel,
} from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import { ruimte } from "@workspace/ontwerp";
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
import {
  Ladenstaat,
  Statusmerk,
  Waarschuwvlak,
  bovenInset,
  netteWaarde,
  tekstStijl,
} from "@/components/ui";
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

// Statussen → soort Statusmerk (kleur komt uit het palet, niet uit dit bestand).
const STATUS_SOORT: Record<string, "neutraal" | "succes" | "waarschuwing" | "fout" | "primair"> = {
  concept: "primair",
  deels_voltooid: "waarschuwing",
  voltooid: "succes",
  geannuleerd: "neutraal",
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
  const aangevinkt = state.gepickt || isGepickt;
  const voldoendeVoorraad =
    regel.vrije_voorraad != null && regel.vrije_voorraad >= regel.gevraagd_hoeveelheid;

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
        gap: ruimte.m,
        backgroundColor: c.card,
        borderRadius: c.radius,
        padding: ruimte.m + 2,
        marginBottom: ruimte.s,
        borderWidth: 1,
        borderColor: aangevinkt ? c.success : c.border,
        opacity: gesloten ? 0.7 : pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: ruimte.xl,
          height: ruimte.xl,
          borderRadius: c.radius / 2,
          borderWidth: 2,
          borderColor: aangevinkt ? c.success : c.border,
          backgroundColor: aangevinkt ? c.success : "transparent",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {aangevinkt && (
          <Ionicons name="checkmark" size={ruimte.l - 1} color={c.primaryForeground} />
        )}
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={[
            tekstStijl("nadruk", c.foreground),
            { textDecorationLine: isGepickt ? "line-through" : "none" },
          ]}
          numberOfLines={2}
        >
          {regel.artikel_naam ?? `Artikel #${regel.artikel_id}`}
        </Text>
        <View style={{ flexDirection: "row", gap: ruimte.s + 2, marginTop: 3, flexWrap: "wrap" }}>
          {regel.artikel_code ? (
            <Text style={tekstStijl("klein", c.mutedForeground)}>{regel.artikel_code}</Text>
          ) : null}
          {regel.locatie_naam ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Ionicons name="location-outline" size={11} color={c.mutedForeground} />
              <Text style={tekstStijl("klein", c.mutedForeground)}>{regel.locatie_naam}</Text>
            </View>
          ) : null}
          {regel.vrije_voorraad != null ? (
            <Text style={tekstStijl("klein", voldoendeVoorraad ? c.success : c.warning)}>
              voorraad: {regel.vrije_voorraad} {eenheidLabel(regel.artikel_eenheid)}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={{ alignItems: "flex-end", flexShrink: 0 }}>
        <Text style={tekstStijl("nadruk", c.foreground)}>
          {regel.gevraagd_hoeveelheid} {eenheidLabel(regel.artikel_eenheid)}
        </Text>
        {isGepickt ? (
          <Text style={[tekstStijl("bijschrift", c.success), { marginTop: 2 }]}>gepickt</Text>
        ) : null}
        {toonInvoer ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.xs, marginTop: ruimte.xs + 2 }}>
            <Text style={tekstStijl("bijschrift", c.mutedForeground)}>gepickt:</Text>
            <TextInput
              value={String(state.gepicktHoeveelheid)}
              onChangeText={wijzigHoeveelheid}
              keyboardType="number-pad"
              selectTextOnFocus
              style={[
                tekstStijl("nadruk", c.foreground),
                {
                  minWidth: ruimte.xl + ruimte.l,
                  paddingHorizontal: ruimte.s,
                  paddingVertical: ruimte.xs,
                  borderWidth: 1,
                  borderColor: state.gepicktHoeveelheid === 0 ? c.warning : c.border,
                  borderRadius: c.radius / 2,
                  textAlign: "center",
                  backgroundColor: c.background,
                },
              ]}
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
  const statusLabel = picklijst ? (STATUS_LABELS[picklijst.status] ?? netteWaarde(picklijst.status)) : "";
  const statusSoort = picklijst ? (STATUS_SOORT[picklijst.status] ?? "neutraal") : "neutraal";

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
      <View style={{ paddingTop: bovenInset(insets), paddingHorizontal: ruimte.l, paddingBottom: ruimte.m }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.s + 2, paddingTop: ruimte.xs }}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={ruimte.xl} color={c.foreground} />
          </Pressable>
          <Text style={[tekstStijl("sectiekop", c.foreground), { flex: 1 }]} numberOfLines={1}>
            {picklijst?.opdracht_titel ?? (isLoading ? "Laden..." : `Picklijst #${picklijstId}`)}
          </Text>
          {picklijst ? (
            <Statusmerk label={statusLabel} soort={statusSoort} />
          ) : null}
        </View>
      </View>

      <OfflineBanner stijl="compact" />

      {isLoading ? (
        <View style={{ flex: 1, padding: ruimte.l }}>
          <Ladenstaat regels={5} />
        </View>
      ) : !picklijst ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: ruimte.xxl }}>
          <Text style={tekstStijl("standaard", c.mutedForeground)}>Picklijst niet gevonden</Text>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{ padding: ruimte.l, paddingBottom: ruimte.xxl * 3 + insets.bottom }}
          >
            {picklijst.notities ? (
              <View style={{ marginBottom: ruimte.m + 2 }}>
                <Waarschuwvlak tekst={picklijst.notities} soort="info" />
              </View>
            ) : null}

            <View style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: ruimte.m,
            }}>
              <Text style={tekstStijl("nadruk", c.foreground)}>
                Artikelen ({aantalGepickt}/{totaalRegels} gepickt)
              </Text>
              {!gesloten && totaalRegels > 0 && (
                <Pressable onPress={allesAanvinken} hitSlop={8}>
                  <Text style={tekstStijl("nadruk", c.primary)}>
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
              <View style={{ alignItems: "center", padding: ruimte.xl }}>
                <Text style={tekstStijl("standaard", c.mutedForeground)}>Geen artikelen op deze picklijst</Text>
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
              padding: ruimte.l,
              paddingBottom: insets.bottom + ruimte.l,
            }}>
              {!isOnline && (
                <View style={{ marginBottom: ruimte.m }}>
                  <Waarschuwvlak tekst="Offline — wijzigingen worden later verstuurd" />
                </View>
              )}
              <Pressable
                onPress={() => void verwerk()}
                disabled={bezigVerwerken || aantalTeVerwerken === 0}
                style={({ pressed }) => ({
                  backgroundColor:
                    bezigVerwerken || aantalTeVerwerken === 0
                      ? c.muted
                      : c.primary,
                  opacity: pressed && !(bezigVerwerken || aantalTeVerwerken === 0) ? 0.85 : 1,
                  borderRadius: c.radius,
                  padding: ruimte.l,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: ruimte.s,
                })}
              >
                {bezigVerwerken ? (
                  <ActivityIndicator color={c.primaryForeground} size="small" />
                ) : (
                  <Ionicons name="checkmark-circle" size={ruimte.xl} color={c.primaryForeground} />
                )}
                <Text style={tekstStijl("sectiekop", c.primaryForeground)}>
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
