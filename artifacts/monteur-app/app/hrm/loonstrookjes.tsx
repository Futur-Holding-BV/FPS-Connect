import { API_DOMEIN } from "@/lib/apiDomein";
// Loonstrookjes & jaaropgaven — medewerker-self-service in de monteur-app.
// Toont eigen gepubliceerde salarisdocumenten en maakt downloaden/openen mogelijk.

import { useGetMijnSalarisdocumenten } from "@workspace/api-client-react";
import { ruimte } from "@workspace/ontwerp";
import * as FileSystem from "expo-file-system/legacy";
import { Redirect } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Kaart, bovenInset, netteWaarde, tekstStijl } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

const MAAND_NAMEN = [
  "", "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];

const TYPE_LABELS: Record<string, string> = {
  loonstrook: "Loonstrook",
  jaaropgave: "Jaaropgave",
  loonaangifte: "Loonaangifte",
  urenexport: "Urenexport",
  verlofoverzicht: "Verlofoverzicht",
  overig: "Overig",
};

function periodeLabel(jaar: number | null, maand: number | null): string {
  if (!jaar) return "Onbekende periode";
  if (!maand) return `${jaar}`;
  return `${MAAND_NAMEN[maand] ?? maand} ${jaar}`;
}

function bestandsGrootteLabel(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function LoonstrookjesScherm() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { inhoudMaxBreedte } = useResponsive();
  const { token } = useAuth();
  const [laadenId, setLaadenId] = useState<number | null>(null);

  const { data, isLoading, isError, refetch } = useGetMijnSalarisdocumenten();

  if (!token) return <Redirect href="/login" />;

  async function download(id: number, bestandsnaam: string) {
    if (!token) return;
    setLaadenId(id);
    try {
      const domain = API_DOMEIN;
      const base = domain ? `https://${domain}` : "";

      if (Platform.OS === "web") {
        // Web: geen bestandssysteem/Sharing — PDF ophalen en openen in
        // een nieuw tabblad via een object-URL.
        const res = await fetch(`${base}/api/mijn/salarisdocumenten/${id}/download`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          Alert.alert("Download mislukt", "Het document kon niet worden geladen.");
          return;
        }
        const blob = await res.blob();
        window.open(URL.createObjectURL(blob), "_blank", "noopener");
        return;
      }

      const cacheUri = `${FileSystem.cacheDirectory ?? ""}loonstrookje_${id}.pdf`;

      const result = await FileSystem.downloadAsync(
        `${base}/api/mijn/salarisdocumenten/${id}/download`,
        cacheUri,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (result.status !== 200) {
        Alert.alert("Download mislukt", "Het document kon niet worden geladen.");
        return;
      }

      const kanDelen = await Sharing.isAvailableAsync();
      if (kanDelen) {
        await Sharing.shareAsync(result.uri, {
          mimeType: "application/pdf",
          dialogTitle: bestandsnaam,
        });
      } else {
        Alert.alert("Openen niet mogelijk", "Delen wordt niet ondersteund op dit apparaat.");
      }
    } catch (err) {
      logger.error({ err }, "Loonstrookje downloaden mislukt");
      Alert.alert("Fout", "Download mislukt. Controleer uw verbinding.");
    } finally {
      setLaadenId(null);
    }
  }

  const loonstroken = (data ?? []).filter((d) => d.type !== "jaaropgave");
  const jaaropgaven = (data ?? []).filter((d) => d.type === "jaaropgave");

  function renderDoc(item: NonNullable<typeof data>[number]) {
    const isLaaden = laadenId === item.id;
    return (
      <Kaart
        stijl={{
          padding: ruimte.l,
          marginBottom: ruimte.m - 2,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: ruimte.m,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={tekstStijl("nadruk", c.foreground)}>
            {periodeLabel(item.periode_jaar ?? null, item.periode_maand ?? null)}
          </Text>
          <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 3 }]}>
            {TYPE_LABELS[item.type ?? ""] ?? netteWaarde(item.type ?? "")}
            {item.bestandsgrootte ? `  ·  ${bestandsGrootteLabel(item.bestandsgrootte)}` : ""}
          </Text>
        </View>
        <Pressable
          onPress={() => void download(item.id, item.bestandsnaam ?? `loonstrookje_${item.id}.pdf`)}
          disabled={isLaaden}
          style={({ pressed }) => ({
            backgroundColor: isLaaden ? c.muted : c.primary,
            borderRadius: c.radius / 2,
            paddingHorizontal: ruimte.m + 2,
            paddingVertical: ruimte.s,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          {isLaaden ? (
            <ActivityIndicator size="small" color={c.primaryForeground} />
          ) : (
            <Text style={tekstStijl("klein", c.primaryForeground)}>
              Openen
            </Text>
          )}
        </Pressable>
      </Kaart>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ backgroundColor: c.dark, paddingTop: bovenInset(insets) + ruimte.m, paddingHorizontal: ruimte.xl, paddingBottom: ruimte.l + 2 }}>
        <View style={{ width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
          <Text style={tekstStijl("schermtitel", c.darkForeground)}>
            Mijn loonstrookjes
          </Text>
          <Text style={[tekstStijl("klein", c.darkMuted), { marginTop: 2 }]}>
            Gepubliceerde salarisdocumenten
          </Text>
        </View>
      </View>

      {isLoading && (
        <ActivityIndicator size="large" color={c.primary} style={{ marginTop: ruimte.xxl + ruimte.l }} />
      )}

      {isError && (
        <View style={{ padding: ruimte.xl, alignItems: "center" }}>
          <Text style={tekstStijl("standaard", c.destructive)}>
            Documenten konden niet worden geladen.
          </Text>
        </View>
      )}

      {!isLoading && !isError && (
        <FlatList
          data={[]}
          renderItem={() => null}
          contentContainerStyle={{
            padding: ruimte.l,
            paddingBottom: insets.bottom + ruimte.xxl,
            width: "100%",
            maxWidth: inhoudMaxBreedte,
            alignSelf: "center",
          }}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void refetch()} tintColor={c.primary} />}
          ListHeaderComponent={
            <View style={{ gap: ruimte.xs }}>
              {loonstroken.length === 0 && jaaropgaven.length === 0 && (
                <View style={{ alignItems: "center", paddingTop: ruimte.xl + ruimte.l }}>
                  <Text style={tekstStijl("standaard", c.mutedForeground)}>
                    Er zijn nog geen salarisdocumenten beschikbaar.
                  </Text>
                </View>
              )}

              {loonstroken.length > 0 && (
                <>
                  <Text style={[tekstStijl("sectiekop", c.foreground), { marginBottom: ruimte.m - 2, marginTop: ruimte.xs }]}>
                    Loonstroken
                  </Text>
                  {loonstroken.map((d) => (
                    <View key={d.id}>{renderDoc(d)}</View>
                  ))}
                </>
              )}

              {jaaropgaven.length > 0 && (
                <>
                  <Text style={[tekstStijl("sectiekop", c.foreground), { marginBottom: ruimte.m - 2, marginTop: loonstroken.length > 0 ? ruimte.l : ruimte.xs }]}>
                    Jaaropgaven
                  </Text>
                  {jaaropgaven.map((d) => (
                    <View key={d.id}>{renderDoc(d)}</View>
                  ))}
                </>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}

const logger = { error: (obj: unknown, msg: string) => console.error(msg, obj) };
