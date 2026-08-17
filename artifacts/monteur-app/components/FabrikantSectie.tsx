import React, { useState } from "react";
import { Alert, Linking, Pressable, Text, View } from "react-native";
import { ruimte } from "@workspace/ontwerp";
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
  { naam: "Red Profs", url: "https://redprofs.com/" },
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
    <View style={{ gap: ruimte.m }}>
      {/* Fabrikant chips */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: ruimte.s }}>
        {FABRIKANTEN.map((f) => {
          const actief = gekozen === f.naam;
          return (
            <Pressable
              key={f.naam}
              onPress={() => setGekozen(actief ? null : f.naam)}
              style={{
                paddingHorizontal: ruimte.m + 2,
                paddingVertical: ruimte.s,
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
            gap: ruimte.s + 2,
            backgroundColor: c.secondary,
            borderRadius: c.radius,
            borderWidth: 1.5,
            borderColor: c.primary,
            paddingHorizontal: ruimte.l,
            paddingVertical: ruimte.m + 1,
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
          backgroundColor: c.warning + "1A",
          borderRadius: c.radius,
          borderWidth: 1,
          borderColor: c.warning + "66",
          paddingHorizontal: ruimte.m + 2,
          paddingVertical: ruimte.m,
          gap: ruimte.xs,
        }}
      >
        <Text
          style={{
            color: c.warning,
            fontSize: 13,
            fontFamily: "Inter_600SemiBold",
          }}
        >
          Hulpmiddel
        </Text>
        <Text
          style={{
            color: c.warning,
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
