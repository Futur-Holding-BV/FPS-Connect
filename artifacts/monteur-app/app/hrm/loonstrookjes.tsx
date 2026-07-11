// Loonstrookjes & jaaropgaven — medewerker-self-service in de monteur-app.
// Toont eigen gepubliceerde salarisdocumenten en maakt downloaden/openen mogelijk.

import { useGetMijnSalarisdocumenten } from "@workspace/api-client-react";
import * as FileSystem from "expo-file-system/legacy";
import { Redirect } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bovenInset } from "@/components/ui";
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
      const domain = process.env["EXPO_PUBLIC_DOMAIN"] ?? "";
      const base = domain ? `https://${domain}` : "";
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
      <View
        style={{
          backgroundColor: c.card,
          borderRadius: c.radius,
          borderWidth: 1,
          borderColor: c.border,
          padding: 16,
          marginBottom: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.foreground, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
            {periodeLabel(item.periode_jaar ?? null, item.periode_maand ?? null)}
          </Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 3, fontFamily: "Inter_400Regular" }}>
            {TYPE_LABELS[item.type ?? ""] ?? item.type}
            {item.bestandsgrootte ? `  ·  ${bestandsGrootteLabel(item.bestandsgrootte)}` : ""}
          </Text>
        </View>
        <Pressable
          onPress={() => void download(item.id, item.bestandsnaam ?? `loonstrookje_${item.id}.pdf`)}
          disabled={isLaaden}
          style={({ pressed }) => ({
            backgroundColor: isLaaden ? c.muted : c.primary,
            borderRadius: 8,
            paddingHorizontal: 14,
            paddingVertical: 8,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          {isLaaden ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
              Openen
            </Text>
          )}
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ backgroundColor: c.dark, paddingTop: bovenInset(insets) + 12, paddingHorizontal: 20, paddingBottom: 18 }}>
        <View style={{ width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
          <Text style={{ color: c.darkForeground, fontSize: 20, fontFamily: "Inter_700Bold" }}>
            Mijn loonstrookjes
          </Text>
          <Text style={{ color: c.darkMuted, fontSize: 13, marginTop: 2, fontFamily: "Inter_400Regular" }}>
            Gepubliceerde salarisdocumenten
          </Text>
        </View>
      </View>

      {isLoading && (
        <ActivityIndicator size="large" color={c.primary} style={{ marginTop: 48 }} />
      )}

      {isError && (
        <View style={{ padding: 24, alignItems: "center" }}>
          <Text style={{ color: c.destructive, fontSize: 14, fontFamily: "Inter_400Regular" }}>
            Documenten konden niet worden geladen.
          </Text>
        </View>
      )}

      {!isLoading && !isError && (
        <FlatList
          data={[]}
          renderItem={() => null}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 32,
            width: "100%",
            maxWidth: inhoudMaxBreedte,
            alignSelf: "center",
          }}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void refetch()} tintColor={c.primary} />}
          ListHeaderComponent={
            <View style={{ gap: 4 }}>
              {loonstroken.length === 0 && jaaropgaven.length === 0 && (
                <View style={{ alignItems: "center", paddingTop: 40 }}>
                  <Text style={{ color: c.mutedForeground, fontSize: 14, fontFamily: "Inter_400Regular" }}>
                    Er zijn nog geen salarisdocumenten beschikbaar.
                  </Text>
                </View>
              )}

              {loonstroken.length > 0 && (
                <>
                  <Text style={{ color: c.foreground, fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 10, marginTop: 4 }}>
                    Loonstroken
                  </Text>
                  {loonstroken.map((d) => (
                    <View key={d.id}>{renderDoc(d)}</View>
                  ))}
                </>
              )}

              {jaaropgaven.length > 0 && (
                <>
                  <Text style={{ color: c.foreground, fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 10, marginTop: loonstroken.length > 0 ? 16 : 4 }}>
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
