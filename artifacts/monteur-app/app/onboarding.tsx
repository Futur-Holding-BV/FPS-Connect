import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

export const ONBOARDING_KEY = "fps_onboarding_voltooid";

const { width: SCHERM_BREEDTE } = Dimensions.get("window");

type Stap = {
  sleutel: string;
  icoon: keyof typeof Ionicons.glyphMap;
  titel: string;
  inhoud: string | { titel: string; tekst: string }[];
};

const STAPPEN: Stap[] = [
  {
    sleutel: "welkom",
    icoon: "flame-outline",
    titel: "Welkom bij FPS Monteur",
    inhoud:
      "Dit is jouw werkomgeving voor brandpreventieve installaties. In een paar stappen laten we je zien hoe de app werkt.",
  },
  {
    sleutel: "expo-go",
    icoon: "phone-portrait-outline",
    titel: "App openen via Expo Go",
    inhoud: [
      {
        titel: "1. Installeer Expo Go",
        tekst: "Download Expo Go vanuit de App Store (iPhone) of Play Store (Android).",
      },
      {
        titel: "2. Scan de QR-code",
        tekst: "Je beheerder stuurt je een QR-code of link. Scan deze via de Expo Go-app of je camera.",
      },
      {
        titel: "3. App opent automatisch",
        tekst: "Na het scannen opent FPS Monteur direct. Je hoeft niets extra te installeren.",
      },
    ],
  },
  {
    sleutel: "login",
    icoon: "log-in-outline",
    titel: "Inloggen",
    inhoud: [
      {
        titel: "E-mail en wachtwoord",
        tekst: "Gebruik de inloggegevens die je van je beheerder hebt ontvangen.",
      },
      {
        titel: "Authenticator-app vereist",
        tekst:
          "Na het inloggen wordt een verificatiecode gevraagd. Installeer hiervoor Google Authenticator, Microsoft Authenticator of Authy.",
      },
      {
        titel: "QR-code scannen",
        tekst:
          "Bij je eerste inlog scan je een QR-code in de web-app (FPS Connect) om de authenticator-app te koppelen.",
      },
    ],
  },
  {
    sleutel: "totp",
    icoon: "shield-checkmark-outline",
    titel: "Tweestapsverificatie",
    inhoud: [
      {
        titel: "Elke keer een code",
        tekst:
          "Bij elke inlog vul je een 6-cijferige code in uit je authenticator-app. De code verloopt elke 30 seconden.",
      },
      {
        titel: "Code kwijt?",
        tekst:
          "Neem contact op met je beheerder. Die kan de tweestapsverificatie opnieuw instellen.",
      },
    ],
  },
  {
    sleutel: "app-tour",
    icoon: "grid-outline",
    titel: "Wat kun je doen in de app?",
    inhoud: [
      { titel: "Mijn werk", tekst: "Bekijk je werkzaamheden voor vandaag en de rest van de week." },
      { titel: "Gebouwen", tekst: "Zoek en bekijk gebouwen die aan jou zijn toegewezen." },
      { titel: "Spots", tekst: "Registreer en bewerk brandpreventieve spots per gebouw." },
      { titel: "Foto's", tekst: "Maak voor- en nafoto's van een spot direct vanuit de app." },
      { titel: "Uren", tekst: "Registreer je gewerkte uren per opdracht." },
      { titel: "Documenten", tekst: "Bekijk tekeningen en documenten die door de beheerder zijn gedeeld." },
      { titel: "Magazijn", tekst: "Scan artikelen in het magazijn en dien materiaalanvragen in." },
      { titel: "Veiligheid", tekst: "Vul de LMRA in, registreer incidenten en bevestig toolboxen." },
    ],
  },
  {
    sleutel: "afsluiten",
    icoon: "checkmark-circle-outline",
    titel: "Klaar om te starten",
    inhoud:
      "Je bent ingesteld. Druk op 'Start werkdag' om naar het hoofdmenu te gaan. Je kunt deze rondleiding altijd opnieuw bekijken via Info.",
  },
];

function StapInhoud({ stap }: { stap: Stap }) {
  const c = useColors();

  if (typeof stap.inhoud === "string") {
    return (
      <Text
        style={{
          fontSize: 15,
          fontFamily: "Inter_400Regular",
          color: c.mutedForeground,
          textAlign: "center",
          lineHeight: 24,
          marginTop: 12,
          paddingHorizontal: 8,
        }}
      >
        {stap.inhoud}
      </Text>
    );
  }

  return (
    <ScrollView
      style={{ marginTop: 12, width: "100%" }}
      showsVerticalScrollIndicator={false}
    >
      {stap.inhoud.map((item, i) => (
        <View
          key={i}
          style={{
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 10,
            padding: 14,
            marginBottom: 8,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontFamily: "Inter_600SemiBold",
              color: c.foreground,
              marginBottom: 4,
            }}
          >
            {item.titel}
          </Text>
          <Text
            style={{
              fontSize: 13,
              fontFamily: "Inter_400Regular",
              color: c.mutedForeground,
              lineHeight: 20,
            }}
          >
            {item.tekst}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

export default function OnboardingScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [actieveIndex, setActieveIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  const isLaatste = actieveIndex === STAPPEN.length - 1;

  async function volgende() {
    if (isLaatste) {
      await AsyncStorage.setItem(ONBOARDING_KEY, "1");
      router.replace("/menu");
      return;
    }
    const volgend = actieveIndex + 1;
    listRef.current?.scrollToIndex({ index: volgend, animated: true });
    setActieveIndex(volgend);
  }

  function vorige() {
    if (actieveIndex === 0) return;
    const prev = actieveIndex - 1;
    listRef.current?.scrollToIndex({ index: prev, animated: true });
    setActieveIndex(prev);
  }

  async function sla_over() {
    await AsyncStorage.setItem(ONBOARDING_KEY, "1");
    router.replace("/menu");
  }

  const actieveStap = STAPPEN[actieveIndex]!;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.background,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          paddingHorizontal: 20,
          paddingTop: 12,
        }}
      >
        <Pressable onPress={sla_over}>
          <Text
            style={{
              fontSize: 14,
              fontFamily: "Inter_400Regular",
              color: c.mutedForeground,
            }}
          >
            Overslaan
          </Text>
        </Pressable>
      </View>

      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 28,
        }}
      >
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: "#FEE8E1",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
          }}
        >
          <Ionicons name={actieveStap.icoon} size={36} color="#F23B0D" />
        </View>

        <Text
          style={{
            fontSize: 22,
            fontFamily: "Inter_700Bold",
            color: c.foreground,
            textAlign: "center",
            marginBottom: 4,
          }}
        >
          {actieveStap.titel}
        </Text>

        <View style={{ width: "100%", flex: 1, maxHeight: 360 }}>
          <StapInhoud stap={actieveStap} />
        </View>
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          gap: 6,
          marginBottom: 16,
        }}
      >
        {STAPPEN.map((_, i) => (
          <View
            key={i}
            style={{
              width: i === actieveIndex ? 20 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: i === actieveIndex ? "#F23B0D" : c.border,
            }}
          />
        ))}
      </View>

      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 20,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        {actieveIndex > 0 && (
          <Pressable
            onPress={vorige}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: 14,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: c.border,
              alignItems: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              style={{
                fontSize: 15,
                fontFamily: "Inter_500Medium",
                color: c.foreground,
              }}
            >
              Vorige
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={volgende}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 14,
            borderRadius: 10,
            backgroundColor: pressed ? "#d63400" : "#F23B0D",
            alignItems: "center",
          })}
        >
          <Text
            style={{
              fontSize: 15,
              fontFamily: "Inter_600SemiBold",
              color: "#fff",
            }}
          >
            {isLaatste ? "Start werkdag" : "Volgende"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
