import { Redirect, useRouter } from "expo-router";
import React from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RadiaalMenu, type RadiaalActie } from "@/components/RadiaalMenu";
import { bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";

export default function MenuScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { gebruiker, token, uitloggen } = useAuth();

  if (!token) return <Redirect href="/login" />;

  const acties: RadiaalActie[] = [
    {
      sleutel: "mijn-werk",
      label: "Mijn werk",
      icoon: "construct",
      onPress: () => router.push("/mijn-werk"),
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
      sleutel: "berichten",
      label: "Berichten",
      icoon: "chatbubbles",
      onPress: () => router.push("/berichten"),
    },
  ];

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
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Pressable
            onPress={() => router.push("/info")}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 9,
              borderRadius: 10,
              backgroundColor: "rgba(255,255,255,0.12)",
            }}
          >
            <Text style={{ color: c.darkForeground, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
              Instellingen
            </Text>
          </Pressable>
          <Pressable
            onPress={uitloggen}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 9,
              borderRadius: 10,
              backgroundColor: "rgba(255,255,255,0.12)",
            }}
          >
            <Text style={{ color: c.darkForeground, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
              Uitloggen
            </Text>
          </Pressable>
        </View>
      </View>

      <RadiaalMenu acties={acties} />
    </View>
  );
}
