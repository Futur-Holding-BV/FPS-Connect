import { Ionicons } from "@expo/vector-icons";
import { ruimte } from "@workspace/ontwerp";
import { Redirect, useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Kaart, bovenInset, tekstStijl } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { BevoegdheidGuard } from "@/components/BevoegdheidGuard";

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

function VeiligheidHub() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  if (!token) return <Redirect href="/login" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={{
          paddingTop: bovenInset(insets) + ruimte.s,
          paddingBottom: ruimte.m + 2,
          paddingHorizontal: ruimte.xl,
          backgroundColor: c.dark,
          flexDirection: "row",
          alignItems: "center",
          gap: ruimte.m,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
        >
          <Ionicons name="arrow-back" size={ruimte.l + ruimte.xs} color={c.darkForeground} />
        </Pressable>
        <View>
          <Text style={tekstStijl("sectiekop", c.darkForeground)}>
            Veiligheid
          </Text>
          <Text style={tekstStijl("klein", c.darkMuted)}>
            LMRA, toolboxen en instructies
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: ruimte.xl, gap: ruimte.m + 2 }}
        showsVerticalScrollIndicator={false}
      >
        {KAARTEN.map((kaart) => (
          <Pressable
            key={kaart.sleutel}
            onPress={() => router.push(kaart.pad as Parameters<typeof router.push>[0])}
            style={({ pressed }) => ({ opacity: kaart.binnenkort ? 0.6 : pressed ? 0.8 : 1 })}
          >
            <Kaart
              stijl={{
                padding: ruimte.l + 2,
                flexDirection: "row",
                alignItems: "center",
                gap: ruimte.l,
              }}
            >
              <View
                style={{
                  width: ruimte.xxl + ruimte.l + 4,
                  height: ruimte.xxl + ruimte.l + 4,
                  borderRadius: c.radius + ruimte.m,
                  backgroundColor: c.accent,
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Ionicons name={kaart.icoon} size={ruimte.xl} color={c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.s, marginBottom: 3 }}>
                  <Text style={tekstStijl("sectiekop", c.foreground)}>
                    {kaart.titel}
                  </Text>
                  {kaart.binnenkort && (
                    <View
                      style={{
                        backgroundColor: c.muted,
                        borderRadius: c.radius / 2,
                        paddingHorizontal: ruimte.s - 1,
                        paddingVertical: 2,
                      }}
                    >
                      <Text style={tekstStijl("bijschrift", c.mutedForeground)}>
                        Binnenkort
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={tekstStijl("klein", c.mutedForeground)}>
                  {kaart.omschrijving}
                </Text>
              </View>
              {!kaart.binnenkort && (
                <Ionicons name="chevron-forward" size={ruimte.l + 2} color={c.mutedForeground} />
              )}
            </Kaart>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// APP_01 §3.3 — schermbescherming: nette weigering zonder bevoegdheid
// (backendroute eist toolbox niveau 1; gemeten, zie docs/metingen).
export default function VeiligheidHubBeveiligd() {
  return (
    <BevoegdheidGuard vereiste={{ module: "toolbox", niveau: 1 }}>
      <VeiligheidHub />
    </BevoegdheidGuard>
  );
}
