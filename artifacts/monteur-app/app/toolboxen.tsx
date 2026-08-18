import React, { useState, useCallback } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import {
  useGetVeiligheidToolboxen,
} from "@workspace/api-client-react";
import {
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { ruimte } from "@workspace/ontwerp";
import { useColors } from "@/hooks/useColors";
import { BevoegdheidGuard } from "@/components/BevoegdheidGuard";
import { Kaart, Ladenstaat, Statusmerk, tekstStijl } from "@/components/ui";
import { ToolboxDetailModal, catLabel } from "@/components/ToolboxDetailModal";

// ─── Lijstscherm ─────────────────────────────────────────────────────────────

function ToolboxenScherm() {
  const insets = useSafeAreaInsets();
  const c = useColors();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold });

  const { data: toolboxen, isLoading, isError, refetch } = useGetVeiligheidToolboxen(
    { gepubliceerd: true },
    { query: {} } as any
  );

  const [zoek, setZoek] = useState("");
  const [geselecteerdeId, setGeselecteerdeId] = useState<number | null>(null);
  const [vernieuwen, setVernieuwen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  async function handleRefresh() {
    setVernieuwen(true);
    await refetch();
    setVernieuwen(false);
  }

  // Null-safe: een toolbox zonder titel uit de API mag het scherm nooit crashen.
  const gefilterd = (toolboxen ?? []).filter(
    (t) => !zoek || (t.titel ?? "").toLowerCase().includes(zoek.toLowerCase())
  );

  if (!fontsLoaded) return null;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + ruimte.s,
        paddingBottom: ruimte.m,
        paddingHorizontal: ruimte.l,
        backgroundColor: c.dark,
        gap: ruimte.s + 2,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.s + 2 }}>
          <Ionicons name="shield-checkmark" size={ruimte.l + 2} color={c.primary} />
          <Text style={[tekstStijl("schermtitel", c.darkForeground), { flex: 1 }]}>
            Veiligheidstoolboxen
          </Text>
        </View>
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: c.darkMuted + "33",
          borderRadius: c.radius,
          paddingHorizontal: ruimte.m,
          borderWidth: 1,
          borderColor: c.darkMuted + "55",
          gap: ruimte.s,
        }}>
          <Ionicons name="search" size={ruimte.l} color={c.darkMuted} />
          <TextInput
            value={zoek}
            onChangeText={setZoek}
            placeholder="Zoek toolbox..."
            placeholderTextColor={c.darkMuted}
            style={{ flex: 1, paddingVertical: ruimte.s + 2, fontSize: 14, fontFamily: "Inter_400Regular", color: c.darkForeground }}
          />
        </View>
      </View>

      {/* Lijst */}
      {isLoading ? (
        <View style={{ flex: 1, padding: ruimte.l }}>
          <Ladenstaat regels={6} />
        </View>
      ) : isError ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: ruimte.xxl + ruimte.s, gap: ruimte.m }}>
          <Ionicons name="cloud-offline-outline" size={ruimte.xxl + ruimte.l} color={c.mutedForeground} />
          <Text style={[tekstStijl("sectiekop", c.foreground)]}>Laden mislukt</Text>
          <Text style={[tekstStijl("standaard", c.mutedForeground), { textAlign: "center" }]}>
            De toolboxen konden niet worden opgehaald. Controleer uw verbinding en probeer het opnieuw.
          </Text>
          <Pressable
            onPress={() => void refetch()}
            style={{ backgroundColor: c.primary, paddingHorizontal: ruimte.xl, paddingVertical: ruimte.m, borderRadius: c.radius }}
          >
            <Text style={tekstStijl("nadruk", c.primaryForeground)}>Opnieuw proberen</Text>
          </Pressable>
        </View>
      ) : gefilterd.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: ruimte.xxl + ruimte.s }}>
          <Ionicons name="shield-checkmark-outline" size={ruimte.xxl + ruimte.l} color={c.mutedForeground} style={{ marginBottom: ruimte.m }} />
          <Text style={[tekstStijl("sectiekop", c.foreground), { marginBottom: ruimte.xs + 2 }]}>
            Geen toolboxen
          </Text>
          <Text style={[tekstStijl("standaard", c.mutedForeground), { textAlign: "center" }]}>
            {zoek ? "Geen resultaten voor uw zoekopdracht." : "Er zijn nog geen gepubliceerde toolboxen."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={gefilterd}
          keyExtractor={(t) => String(t.id)}
          contentContainerStyle={{ padding: ruimte.m + 2, gap: ruimte.s + 2, paddingBottom: insets.bottom + ruimte.l + ruimte.xs }}
          refreshControl={<RefreshControl refreshing={vernieuwen} onRefresh={handleRefresh} tintColor={c.primary} />}
          renderItem={({ item: t }) => {
            const mijnAfronding = (t as any).mijn_afronding;
            const geslaagd = mijnAfronding?.geslaagd === true;
            const afgerond = mijnAfronding != null;

            return (
              <Pressable onPress={() => setGeselecteerdeId(t.id)}>
                <Kaart stijl={{ padding: ruimte.m + 2, gap: ruimte.s }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: ruimte.s + 2 }}>
                  <View style={{
                    width: ruimte.xxl + ruimte.xs,
                    height: ruimte.xxl + ruimte.xs,
                    borderRadius: c.radius,
                    backgroundColor: c.accent,
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Ionicons name="shield-checkmark" size={ruimte.l + 2} color={c.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={tekstStijl("nadruk", c.foreground)} numberOfLines={2}>
                      {t.titel}
                    </Text>
                    <View style={{ flexDirection: "row", gap: ruimte.s }}>
                      <Text style={tekstStijl("bijschrift", c.mutedForeground)}>
                        {catLabel(t.categorie)}
                      </Text>
                      {t.geschatte_leestijd && (
                        <Text style={tekstStijl("bijschrift", c.mutedForeground)}>
                          {t.geschatte_leestijd} min
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: ruimte.xs }}>
                    {afgerond ? (
                      <Ionicons
                        name={geslaagd ? "checkmark-circle" : "close-circle"}
                        size={ruimte.l + 2}
                        color={geslaagd ? c.success : c.warning}
                      />
                    ) : t.verplicht ? (
                      <Statusmerk label="Verplicht" soort="fout" />
                    ) : null}
                    <Ionicons name="chevron-forward" size={ruimte.l} color={c.mutedForeground} />
                  </View>
                </View>

                {(t.tags ?? []).length > 0 && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: ruimte.xs + 1 }}>
                    {(t.tags as string[]).slice(0, 3).map((tag) => (
                      <View key={tag} style={{ backgroundColor: c.muted, paddingHorizontal: ruimte.s, paddingVertical: 2, borderRadius: c.radius / 2 }}>
                        <Text style={tekstStijl("bijschrift", c.mutedForeground)}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                )}
                </Kaart>
              </Pressable>
            );
          }}
        />
      )}

      {/* Detail Modal */}
      {geselecteerdeId !== null && (
        <ToolboxDetailModal
          toolboxId={geselecteerdeId}
          visible={geselecteerdeId !== null}
          onSluit={() => setGeselecteerdeId(null)}
        />
      )}
    </View>
  );
}

// APP_01 §3.3 — schermbescherming: nette weigering zonder bevoegdheid
// (backendroute eist toolbox niveau 1; gemeten, zie docs/metingen).
export default function ToolboxenSchermBeveiligd() {
  return (
    <BevoegdheidGuard vereiste={{ module: "toolbox", niveau: 1 }}>
      <ToolboxenScherm />
    </BevoegdheidGuard>
  );
}
