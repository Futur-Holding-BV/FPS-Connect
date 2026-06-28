import * as FileSystem from "expo-file-system/legacy";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bovenInset } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/auth";

const DOMEIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";
const BEELD_EXT = ["jpg", "jpeg", "png", "webp", "gif", "bmp"];

type Status = "laden" | "gereed" | "openen" | "fout";

export default function DocumentViewer() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { url, naam } = useLocalSearchParams<{
    tekeningId: string;
    url: string;
    naam: string;
  }>();

  const [status, setStatus] = useState<Status>("laden");
  const [dataUri, setDataUri] = useState<string | null>(null);
  const cacheRef = useRef<string | null>(null);

  const ext = ((url ?? "").split("?")[0].split(".").pop() ?? "").toLowerCase();
  const isBeeld = BEELD_EXT.includes(ext);

  useEffect(() => {
    let actief = true;
    setStatus("laden");
    setDataUri(null);
    cacheRef.current = null;
    if (!url || !token) return;

    void (async () => {
      try {
        const storageUrl = `https://${DOMEIN}/api/storage${url}`;

        if (isBeeld) {
          // Afbeelding: als data-URI in Image component tonen
          const res = await fetch(storageUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error(`http ${res.status}`);
          const blob = await res.blob();
          const d = await new Promise<string>((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result));
            fr.onerror = () => reject(new Error("lezen mislukt"));
            fr.readAsDataURL(blob);
          });
          if (actief) {
            setDataUri(d);
            setStatus("gereed");
          }
        } else {
          // PDF / overig: downloaden naar cache, dan openen via Sharing
          const bestandsnaam = (naam ?? "document").replace(/[^a-zA-Z0-9._-]/g, "_") + (naam?.endsWith(".pdf") ? "" : ".pdf");
          const pad = `${FileSystem.cacheDirectory}${bestandsnaam}`;
          const resultaat = await FileSystem.downloadAsync(storageUrl, pad, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!actief) return;
          if (resultaat.status !== 200) throw new Error(`http ${resultaat.status}`);
          cacheRef.current = resultaat.uri;

          const kanDelen = await Sharing.isAvailableAsync();
          if (!kanDelen) throw new Error("delen niet beschikbaar");

          setStatus("gereed");
          // Direct openen
          await Sharing.shareAsync(resultaat.uri, {
            mimeType: "application/pdf",
            dialogTitle: naam ?? "Document",
          });
        }
      } catch {
        if (actief) setStatus("fout");
      }
    })();

    return () => {
      actief = false;
    };
  }, [url, token, isBeeld, naam]);

  async function opnieuwOpenen() {
    if (!cacheRef.current) return;
    setStatus("openen");
    try {
      await Sharing.shareAsync(cacheRef.current, {
        mimeType: isBeeld ? "image/*" : "application/pdf",
        dialogTitle: naam ?? "Document",
      });
    } finally {
      setStatus("gereed");
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={{
          backgroundColor: c.dark,
          paddingTop: bovenInset(insets) + 8,
          paddingHorizontal: 16,
          paddingBottom: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={{ color: c.primary, fontSize: 26, fontFamily: "Inter_700Bold" }}>
            ‹
          </Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={{ color: c.darkForeground, fontSize: 17, fontFamily: "Inter_700Bold" }}
            numberOfLines={1}
          >
            {naam || "Document"}
          </Text>
        </View>
      </View>

      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        {status === "laden" ? (
          <>
            <ActivityIndicator size="large" color={c.primary} />
            <Text style={{ color: c.mutedForeground, marginTop: 16, fontFamily: "Inter_400Regular" }}>
              Document laden…
            </Text>
          </>
        ) : status === "fout" ? (
          <Text
            style={{
              color: c.mutedForeground,
              fontSize: 15,
              textAlign: "center",
              fontFamily: "Inter_400Regular",
            }}
          >
            Document kon niet geladen worden.
          </Text>
        ) : isBeeld && dataUri ? (
          <ScrollView
            style={{ width: "100%" }}
            contentContainerStyle={{ alignItems: "center", paddingVertical: 16 }}
            maximumZoomScale={4}
            minimumZoomScale={1}
          >
            <Image
              source={{ uri: dataUri }}
              style={{ width: "100%", aspectRatio: 1 }}
              resizeMode="contain"
            />
          </ScrollView>
        ) : (
          <View style={{ alignItems: "center", gap: 16 }}>
            <Text
              style={{
                color: c.mutedForeground,
                fontSize: 15,
                textAlign: "center",
                fontFamily: "Inter_400Regular",
              }}
            >
              Het PDF is geopend in de PDF-viewer van uw toestel.
            </Text>
            <Pressable
              onPress={() => void opnieuwOpenen()}
              style={({ pressed }) => ({
                backgroundColor: c.primary,
                borderRadius: c.radius,
                paddingHorizontal: 20,
                paddingVertical: 10,
                opacity: pressed || status === "openen" ? 0.75 : 1,
              })}
            >
              <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 }}>
                {status === "openen" ? "Openen…" : "Opnieuw openen"}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}
