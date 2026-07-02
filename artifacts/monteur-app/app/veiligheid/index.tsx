import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";

type Kaart = {
  sleutel: string;
  titel: string;
  omschrijving: string;
  icoon: keyof typeof Ionicons.glyphMap;
  pad: string;
  binnenkort?: boolean;
};

const KAARTEN: Kaart[] = [
  {
    sleutel: "lmra",
    titel: "LMRA",
    omschrijving: "Laatste Minuut Risico Analyse — vul in vóór aanvang van de werkzaamheden.",
    icoon: "shield-checkmark-outline",
    pad: "/lmra",
  },
  {
    sleutel: "incidenten",
    titel: "Incidenten",
    omschrijving: "Registreer een bijna-ongeval of arbeidsongeval conform de Arbeidsinspectie richtlijnen.",
    icoon: "warning-outline",
    pad: "/incidenten",
  },
  {
    sleutel: "toolboxen",
    titel: "Toolboxen",
    omschrijving: "Bekijk en bevestig toolbox-onderwerpen en maandopdrachten.",
    icoon: "book-outline",
    pad: "/toolboxen",
  },
  {
    sleutel: "instructies",
    titel: "Veiligheidsinstructies",
    omschrijving: "Door de projectleider geüploade veiligheidsinstructies per project.",
    icoon: "document-text-outline",
    pad: "/binnenkort",
    binnenkort: true,
  },
  {
    sleutel: "melding",
    titel: "Veiligheidsmelding",
    omschrijving: "Meld een onveilige situatie of bijna-incident direct door.",
    icoon: "warning-outline",
    pad: "/veiligheid-melding",
  },
];

export default function VeiligheidHub() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  if (!token) return <Redirect href="/login" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={{
          paddingTop: bovenInset(insets) + 8,
          paddingBottom: 14,
          paddingHorizontal: 20,
          backgroundColor: c.dark,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
        >
          <Ionicons name="arrow-back" size={22} color={c.darkForeground} />
        </Pressable>
        <View>
          <Text style={{ color: c.darkForeground, fontSize: 19, fontFamily: "Inter_700Bold" }}>
            Veiligheid
          </Text>
          <Text style={{ color: c.darkMuted, fontSize: 12, fontFamily: "Inter_400Regular" }}>
            LMRA, toolboxen en instructies
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 14 }}
        showsVerticalScrollIndicator={false}
      >
        {KAARTEN.map((kaart) => (
          <Pressable
            key={kaart.sleutel}
            onPress={() => router.push(kaart.pad as Parameters<typeof router.push>[0])}
            style={({ pressed }) => ({
              backgroundColor: pressed ? c.muted : c.card,
              borderRadius: 14,
              padding: 18,
              flexDirection: "row",
              alignItems: "center",
              gap: 16,
              borderWidth: 1,
              borderColor: c.border,
              opacity: kaart.binnenkort ? 0.6 : 1,
            })}
          >
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: `${c.primary}18`,
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Ionicons name={kaart.icoon} size={24} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: c.foreground }}>
                  {kaart.titel}
                </Text>
                {kaart.binnenkort && (
                  <View
                    style={{
                      backgroundColor: c.muted,
                      borderRadius: 6,
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                    }}
                  >
                    <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: c.mutedForeground }}>
                      Binnenkort
                    </Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: c.mutedForeground, lineHeight: 19 }}>
                {kaart.omschrijving}
              </Text>
            </View>
            {!kaart.binnenkort && (
              <Ionicons name="chevron-forward" size={18} color={c.mutedForeground} />
            )}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
