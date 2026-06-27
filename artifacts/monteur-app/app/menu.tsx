import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import React, { useEffect } from "react";
import { Image, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RadiaalMenu, type RadiaalActie } from "@/components/RadiaalMenu";
import { bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";

declare global {
  interface Window {
    __FPS_ROUTES__: Record<string, string>;
    __FPS_NAVIGEER__: (pad: string) => void;
  }
}

export default function MenuScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { gebruiker, token, uitloggen } = useAuth();

  if (!token) return <Redirect href="/login" />;

  const acties: RadiaalActie[] = [
    {
      sleutel: "werkdag",
      label: "Mijn werkdag",
      icoon: "today",
      onPress: () => router.push("/werkdag"),
    },
    {
      sleutel: "gebouwen",
      label: "Gebouwen",
      icoon: "business",
      onPress: () => router.push("/gebouwen"),
    },
    {
      sleutel: "planning",
      label: "Routeplanning",
      icoon: "navigate",
      onPress: () => router.push("/planning"),
    },
    {
      sleutel: "personeel",
      label: "Personeel & Organisatie",
      icoon: "people",
      onPress: () => router.push("/hrm"),
    },
    {
      sleutel: "uren",
      label: "Uren",
      icoon: "stopwatch",
      onPress: () => router.push("/uren"),
    },
    {
      sleutel: "toolboxen",
      label: "Toolboxen",
      icoon: "shield-checkmark",
      onPress: () => router.push("/toolboxen"),
    },
    {
      sleutel: "lmra",
      label: "LMRA",
      icoon: "clipboard-outline",
      onPress: () => router.push("/lmra"),
    },
    {
      sleutel: "veiligheid_melding",
      label: "Veiligheidsmelding",
      icoon: "warning-outline",
      onPress: () => router.push("/veiligheid-melding"),
    },
    {
      sleutel: "berichten",
      label: "Berichten",
      icoon: "chatbubbles",
      onPress: () => router.push("/berichten"),
    },
    {
      sleutel: "opname",
      label: "Opname",
      icoon: "clipboard",
      onPress: () => router.push("/opname"),
    },
  ];

  const routeMap: Record<string, string> = {
    werkdag: "/werkdag",
    gebouwen: "/gebouwen",
    planning: "/planning",
    personeel: "/hrm",
    uren: "/uren",
    toolboxen: "/toolboxen",
    lmra: "/lmra",
    veiligheid_melding: "/veiligheid-melding",
    berichten: "/berichten",
    opname: "/opname",
  };

  // Expose navigatiehulp voor e2e-tests op web. Reanimated positioneert waaier-items
  // DOM-matig allemaal op hetzelfde middelpunt — klikken werkt niet. De test roept
  // window.__FPS_NAVIGEER__(pad) aan om via de Expo Router te navigeren.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (Platform.OS !== "web") return;
    window.__FPS_ROUTES__ = routeMap;
    window.__FPS_NAVIGEER__ = (pad: string) => {
      router.push(pad as Parameters<typeof router.push>[0]);
    };
    return () => {
      delete (window as Partial<Window>).__FPS_ROUTES__;
      delete (window as Partial<Window>).__FPS_NAVIGEER__;
    };
  });

  return (
    <View style={{ flex: 1, backgroundColor: c.dark }}>
      <View
        style={{
          paddingTop: bovenInset(insets) + 10,
          paddingHorizontal: 20,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexShrink: 1 }}>
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 10,
              paddingHorizontal: 8,
              paddingVertical: 6,
            }}
          >
            <Image
              source={require("../assets/images/logo-fps.png")}
              style={{ width: 64, height: 26, resizeMode: "contain" }}
              accessibilityLabel="FPS Brandpreventie"
            />
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text
              style={{ color: c.darkMuted, fontSize: 12, fontFamily: "Inter_400Regular" }}
            >
              Welkom terug
            </Text>
            <Text
              numberOfLines={1}
              style={{ color: c.darkForeground, fontSize: 17, fontFamily: "Inter_700Bold" }}
            >
              {gebruiker?.naam ?? "Monteur"}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          <Pressable
            onPress={() => router.push("/info")}
            accessibilityLabel="Instellingen"
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: pressed ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.10)",
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Ionicons name="settings-outline" size={19} color={c.darkForeground} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/privacy")}
            accessibilityLabel="Privacy"
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: pressed ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.10)",
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Ionicons name="shield-checkmark-outline" size={19} color={c.darkForeground} />
          </Pressable>
          <Pressable
            onPress={uitloggen}
            accessibilityLabel="Uitloggen"
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: pressed ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.10)",
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Ionicons name="log-out-outline" size={19} color={c.darkForeground} />
          </Pressable>
        </View>
      </View>

      <RadiaalMenu acties={acties} />
    </View>
  );
}
