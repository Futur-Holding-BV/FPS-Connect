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
import { ruimte } from "@workspace/ontwerp";
import { tekstStijl } from "@/components/ui";
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
      "Dit is jouw werkomgeving voor bouwkundige en installatietechnische brandveiligheidsvoorzieningen. In een paar stappen laten we je zien hoe de app werkt.",
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
        titel: "Eerste keer: verificatiecode",
        tekst:
          "Bij de allereerste inlog op een nieuw toestel wordt eenmalig een 6-cijferige verificatiecode gevraagd. Je beheerder helpt je hier bij de start mee.",
      },
      {
        titel: "Daarna: vingerafdruk of gezichtsherkenning",
        tekst:
          "Na de eerste inlog vergrendelt de app zich automatisch. Je ontgrendelt daarna met je vingerafdruk of gezichtsherkenning \u2014 geen code meer nodig.",
      },
    ],
  },
  {
    sleutel: "totp",
    icoon: "finger-print-outline",
    titel: "Snel ontgrendelen",
    inhoud: [
      {
        titel: "Vingerafdruk of gezichtsherkenning",
        tekst:
          "De app gebruikt de biometrische beveiliging van jouw telefoon. Druk je vinger op de sensor of kijk in de camera om direct toegang te krijgen.",
      },
      {
        titel: "Veilig en snel",
        tekst:
          "Je vingerafdruk of gezicht verlaat nooit je telefoon. FPS heeft hier geen toegang toe. Dit is de snelste en veiligste manier om in te loggen in het veld.",
      },
      {
        titel: "Biometrie niet beschikbaar?",
        tekst:
          "Neem contact op met je beheerder. Die kan de instellingen aanpassen of een alternatieve inlogmethode instellen.",
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
      { titel: "Spots", tekst: "Registreer en bewerk brandveiligheidsvoorzieningen (spots) per gebouw." },
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
        style={[
          tekstStijl("standaard", c.mutedForeground),
          { textAlign: "center", lineHeight: 24, marginTop: ruimte.m, paddingHorizontal: ruimte.s },
        ]}
      >
        {stap.inhoud}
      </Text>
    );
  }

  return (
    <ScrollView
      style={{ marginTop: ruimte.m, width: "100%" }}
      showsVerticalScrollIndicator={false}
    >
      {stap.inhoud.map((item, i) => (
        <View
          key={i}
          style={{
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: c.radius,
            padding: ruimte.m + 2,
            marginBottom: ruimte.s,
          }}
        >
          <Text
            style={[tekstStijl("standaard", c.foreground), { fontFamily: "Inter_600SemiBold", marginBottom: ruimte.xs }]}
          >
            {item.titel}
          </Text>
          <Text style={tekstStijl("klein", c.mutedForeground)}>
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
          paddingHorizontal: ruimte.l + ruimte.xs,
          paddingTop: ruimte.m,
        }}
      >
        <Pressable onPress={sla_over}>
          <Text style={tekstStijl("standaard", c.mutedForeground)}>
            Overslaan
          </Text>
        </Pressable>
      </View>

      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: ruimte.xl + ruimte.xs,
        }}
      >
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: c.accent,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: ruimte.l,
          }}
        >
          <Ionicons name={actieveStap.icoon} size={36} color={c.primary} />
        </View>

        <Text
          style={[tekstStijl("schermtitel", c.foreground), { textAlign: "center", marginBottom: ruimte.xs }]}
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
          gap: ruimte.xs + 2,
          marginBottom: ruimte.l,
        }}
      >
        {STAPPEN.map((_, i) => (
          <View
            key={i}
            style={{
              width: i === actieveIndex ? 20 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: i === actieveIndex ? c.primary : c.border,
            }}
          />
        ))}
      </View>

      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: ruimte.l + ruimte.xs,
          paddingBottom: ruimte.m,
          gap: ruimte.s + 2,
        }}
      >
        {actieveIndex > 0 && (
          <Pressable
            onPress={vorige}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: ruimte.m + 2,
              borderRadius: c.radius,
              borderWidth: 1,
              borderColor: c.border,
              alignItems: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={tekstStijl("nadruk", c.foreground)}>
              Vorige
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={volgende}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: ruimte.m + 2,
            borderRadius: c.radius,
            backgroundColor: c.primary,
            opacity: pressed ? 0.85 : 1,
            alignItems: "center",
          })}
        >
          <Text style={tekstStijl("nadruk", c.primaryForeground)}>
            {isLaatste ? "Start werkdag" : "Volgende"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
