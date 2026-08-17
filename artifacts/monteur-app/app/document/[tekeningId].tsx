import { API_DOMEIN } from "@/lib/apiDomein";
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

import { bovenInset, tekstStijl } from "@/components/ui";
import { ruimte } from "@workspace/ontwerp";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/auth";

const DOMEIN = API_DOMEIN;
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
          paddingTop: bovenInset(insets) + ruimte.s,
          paddingHorizontal: ruimte.l,
          paddingBottom: ruimte.m + 2,
          flexDirection: "row",
          alignItems: "center",
          gap: ruimte.m,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={[tekstStijl("schermtitel", c.primary), { fontSize: 26 }]}>
            ‹
          </Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={tekstStijl("sectiekop", c.darkForeground)}
            numberOfLines={1}
          >
            {naam || "Document"}
          </Text>
        </View>
      </View>

      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: ruimte.xl }}>
        {status === "laden" ? (
          <>
            <ActivityIndicator size="large" color={c.primary} />
            <Text style={[tekstStijl("standaard", c.mutedForeground), { marginTop: ruimte.l }]}>
              Document laden…
            </Text>
          </>
        ) : status === "fout" ? (
          <Text
            style={[tekstStijl("standaard", c.mutedForeground), { textAlign: "center" }]}
          >
            Document kon niet geladen worden.
          </Text>
        ) : isBeeld && dataUri ? (
          <ScrollView
            style={{ width: "100%" }}
            contentContainerStyle={{ alignItems: "center", paddingVertical: ruimte.l }}
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
          <View style={{ alignItems: "center", gap: ruimte.l }}>
            <Text
              style={[tekstStijl("standaard", c.mutedForeground), { textAlign: "center" }]}
            >
              Het PDF is geopend in de PDF-viewer van uw toestel.
            </Text>
            <Pressable
              onPress={() => void opnieuwOpenen()}
              style={({ pressed }) => ({
                backgroundColor: c.primary,
                borderRadius: c.radius,
                paddingHorizontal: ruimte.xl,
                paddingVertical: ruimte.s + 2,
                opacity: pressed || status === "openen" ? 0.75 : 1,
              })}
            >
              <Text style={tekstStijl("nadruk", c.primaryForeground)}>
                {status === "openen" ? "Openen…" : "Opnieuw openen"}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}
