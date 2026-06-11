import { Redirect, useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

type Artikel = { titel: string; punten: string[] };

const ARTIKELEN: Artikel[] = [
  {
    titel: "Brandwerende doorvoeringen",
    punten: [
      "Controleer altijd of de toegepaste oplossing past bij de wand- of vloerconstructie.",
      "Gebruik uitsluitend producten met een geldig testrapport of ETA voor de situatie.",
      "Leg de afwerking per spot vast met een duidelijke foto.",
    ],
  },
  {
    titel: "Brand- en rookscheidingen",
    punten: [
      "De werendheid volgt uit de testnorm van de gekoppelde toepassing.",
      "Onderbrekingen in een scheiding moeten met een passende toepassing worden hersteld.",
      "Twijfel je over de classificatie? Overleg met de uitvoerder voordat je afwerkt.",
    ],
  },
  {
    titel: "Veilig werken op locatie",
    punten: [
      "Draag de voorgeschreven persoonlijke beschermingsmiddelen.",
      "Meld bijzonderheden of onveilige situaties direct bij je uitvoerder.",
      "Houd vluchtwegen en blusmiddelen tijdens het werk altijd vrij.",
    ],
  },
  {
    titel: "Registratie en oplevering",
    punten: [
      "Werk spots bij zodra een afwerking gereed is, inclusief foto.",
      "Synchroniseer je werk zodra je weer online bent.",
      "Een volledige registratie is de basis voor de opleverrapportage.",
    ],
  },
];

export default function KennisbankScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { leesMaxBreedte, inhoudMaxBreedte } = useResponsive();
  const { token } = useAuth();

  if (!token) return <Redirect href="/login" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ backgroundColor: c.dark, paddingTop: bovenInset(insets) + 12, paddingHorizontal: 20, paddingBottom: 18 }}>
        <View style={{ width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
          <Pressable onPress={() => router.back()} style={{ marginBottom: 10 }}>
            <Text style={{ color: c.primary, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>‹ Terug</Text>
          </Pressable>
          <Text style={{ color: c.darkForeground, fontSize: 20, fontFamily: "Inter_700Bold" }}>Kennisbank</Text>
          <Text style={{ color: c.darkMuted, fontSize: 13, marginTop: 2, fontFamily: "Inter_400Regular" }}>
            Naslag en veilig werken
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 32, width: "100%", maxWidth: leesMaxBreedte, alignSelf: "center" }}
      >
        {ARTIKELEN.map((artikel) => (
          <View
            key={artikel.titel}
            style={{
              backgroundColor: c.card,
              borderRadius: c.radius,
              borderWidth: 1,
              borderColor: c.border,
              padding: 18,
            }}
          >
            <Text style={{ color: c.foreground, fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 10 }}>
              {artikel.titel}
            </Text>
            <View style={{ gap: 6 }}>
              {artikel.punten.map((punt, i) => (
                <Text
                  key={i}
                  style={{ color: c.mutedForeground, fontSize: 14, lineHeight: 21, fontFamily: "Inter_400Regular" }}
                >
                  {"\u2022  "}
                  {punt}
                </Text>
              ))}
            </View>
          </View>
        ))}

        <Text
          style={{ textAlign: "center", color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", paddingTop: 4 }}
        >
          Naslag dient als hulpmiddel. Volg altijd de geldende wet- en regelgeving en de instructies van je uitvoerder.
        </Text>
      </ScrollView>
    </View>
  );
}
