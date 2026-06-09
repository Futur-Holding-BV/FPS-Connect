import React, { useState } from "react";
import { Alert, Linking, Pressable, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

const FABRIKANTEN: { naam: string; url: string | null }[] = [
  { naam: "Mulcol", url: "https://www.mulcol.com/selector" },
  { naam: "Hilti", url: "https://firestop.hilti.com/" },
  { naam: "Promat", url: null },
  {
    naam: "Rockwool",
    url: "https://www.rockwool.com/nl/producten/categorieen/fire-protection/",
  },
  { naam: "Nullifire", url: "https://www.nullifire.com/nl-nl/" },
  { naam: "Flamro", url: "https://flamro.nl/product-selector" },
  { naam: "Overige", url: null },
];

async function openUrl(url: string) {
  const kan = await Linking.canOpenURL(url);
  if (kan) {
    await Linking.openURL(url);
  } else {
    Alert.alert("Kan niet openen", "De link kon niet worden geopend.");
  }
}

export function FabrikantSectie() {
  const c = useColors();
  const [gekozen, setGekozen] = useState<string | null>(null);

  const fabrikant = FABRIKANTEN.find((f) => f.naam === gekozen) ?? null;

  return (
    <View style={{ gap: 12 }}>
      {/* Fabrikant chips */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {FABRIKANTEN.map((f) => {
          const actief = gekozen === f.naam;
          return (
            <Pressable
              key={f.naam}
              onPress={() => setGekozen(actief ? null : f.naam)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 20,
                borderWidth: 1.5,
                borderColor: actief ? c.primary : c.border,
                backgroundColor: actief ? c.secondary : "transparent",
              }}
            >
              <Text
                style={{
                  color: actief ? c.primary : c.foreground,
                  fontSize: 14,
                  fontFamily: actief ? "Inter_600SemiBold" : "Inter_400Regular",
                }}
              >
                {f.naam}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Externe link */}
      {fabrikant && fabrikant.url && (
        <Pressable
          onPress={() => openUrl(fabrikant.url!)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            backgroundColor: c.secondary,
            borderRadius: c.radius,
            borderWidth: 1.5,
            borderColor: c.primary,
            paddingHorizontal: 16,
            paddingVertical: 13,
          }}
        >
          <Text
            style={{
              flex: 1,
              color: c.primary,
              fontSize: 15,
              fontFamily: "Inter_600SemiBold",
            }}
          >
            {fabrikant.naam} selector openen
          </Text>
          <Text style={{ color: c.primary, fontSize: 18 }}>↗</Text>
        </Pressable>
      )}

      {fabrikant && !fabrikant.url && (
        <Text
          style={{
            color: c.mutedForeground,
            fontSize: 13,
            fontFamily: "Inter_400Regular",
          }}
        >
          Geen directe selector beschikbaar voor {fabrikant.naam}. Raadpleeg de
          website van de fabrikant.
        </Text>
      )}

      {/* Disclaimer */}
      <View
        style={{
          backgroundColor: "#fef9c3",
          borderRadius: c.radius,
          borderWidth: 1,
          borderColor: "#fde047",
          paddingHorizontal: 14,
          paddingVertical: 12,
          gap: 4,
        }}
      >
        <Text
          style={{
            color: "#854d0e",
            fontSize: 13,
            fontFamily: "Inter_600SemiBold",
          }}
        >
          Hulpmiddel
        </Text>
        <Text
          style={{
            color: "#92400e",
            fontSize: 13,
            fontFamily: "Inter_400Regular",
            lineHeight: 19,
          }}
        >
          Fabrikantselectors zijn hulpmiddelen ter ondersteuning. Het geldige
          testrapport, classificatierapport en verwerkingsvoorschrift van de
          fabrikant zijn altijd leidend. Leg gevonden productadvies vast als
          opmerking of bijlage bij deze spot.
        </Text>
      </View>
    </View>
  );
}
