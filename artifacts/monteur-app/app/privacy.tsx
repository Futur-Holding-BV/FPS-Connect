import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/auth";
import { bovenInset } from "@/components/ui";

const SECTIES = [
  {
    titel: "Connect is niet ontworpen om u te controleren",
    tekst:
      "FPS Monteur legt uw acties vast om projecten en gebouwveiligheid bij te houden. Dit is niet bedoeld om individueel gedrag of prestaties van medewerkers te monitoren. De activiteitenregistratie dient uitsluitend voor het herstellen van fouten en het bijhouden van wijzigingen.",
    accent: true,
  },
  {
    titel: "Connect AI — ondersteunt, beslist nooit",
    tekst:
      "FPS Connect gebruikt AI om foto's van spots te analyseren en documentvalidatie te ondersteunen. De AI doet altijd een voorstel — u of uw collega bevestigt. De AI neemt nooit zelfstandig een beslissing over een spot of project en geeft geen oordeel over uw prestaties of geschiktheid.",
    accent: false,
  },
  {
    titel: "Uw gegevens in FPS Monteur",
    tekst:
      "De app gebruikt uw naam, e-mailadres en rolgegevens voor toegang tot uw projecten. Foto's die u maakt van spots worden versleuteld verstuurd naar de beveiligde opslag van FPS Connect. De app slaat geen GPS-locaties of rijroutes op.",
    accent: false,
  },
  {
    titel: "Beveiliging",
    tekst:
      "Uw toegang is beveiligd met gebruikersnaam, wachtwoord en een authenticator-app (tweestapsverificatie). Alle communicatie met FPS Connect verloopt via een versleutelde HTTPS-verbinding.",
    accent: false,
  },
  {
    titel: "Uw rechten",
    tekst:
      "U kunt uw gegevens inzien via FPS Connect op het web (menu: Privacy). Voor correctie of verwijdering van gegevens neemt u contact op met uw projectleider of de beheerder van FPS Connect.",
    accent: false,
  },
];

export default function PrivacyScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { gebruiker } = useAuth();

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={{
          paddingTop: bovenInset(insets) + 8,
          paddingHorizontal: 20,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
          backgroundColor: c.card,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={c.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.foreground, fontSize: 17, fontFamily: "Inter_700Bold" }}>
            Privacy &amp; transparantie
          </Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>
            Hoe FPS Monteur uw gegevens gebruikt
          </Text>
        </View>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: c.primary + "22",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="shield-checkmark" size={18} color={c.primary} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {gebruiker && (
          <View
            style={{
              backgroundColor: c.card,
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: c.border,
            }}
          >
            <Text
              style={{
                color: c.mutedForeground,
                fontSize: 11,
                fontFamily: "Inter_500Medium",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 8,
              }}
            >
              Ingelogd als
            </Text>
            <Text style={{ color: c.foreground, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
              {gebruiker.naam}
            </Text>
            <Text
              style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 }}
            >
              {gebruiker.email}
            </Text>
            {gebruiker.rol && (
              <View
                style={{
                  marginTop: 8,
                  alignSelf: "flex-start",
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 6,
                  backgroundColor: c.primary + "18",
                }}
              >
                <Text
                  style={{ color: c.primary, fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" }}
                >
                  {gebruiker.rol === "hoofdbeheerder"
                    ? "Hoofdbeheerder"
                    : gebruiker.rol === "gebruiker"
                    ? "Gebruiker"
                    : gebruiker.rol}
                </Text>
              </View>
            )}
          </View>
        )}

        {SECTIES.map((s, i) => (
          <View
            key={i}
            style={{
              backgroundColor: s.accent ? c.primary + "0D" : c.card,
              borderRadius: 12,
              padding: 16,
              marginBottom: 12,
              borderWidth: 1,
              borderColor: s.accent ? c.primary + "33" : c.border,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
              <Ionicons
                name={s.accent ? "shield-checkmark" : i === 1 ? "sparkles" : "information-circle"}
                size={16}
                color={s.accent ? c.primary : c.mutedForeground}
                style={{ marginTop: 1 }}
              />
              <Text
                style={{
                  color: s.accent ? c.primary : c.foreground,
                  fontSize: 14,
                  fontFamily: "Inter_600SemiBold",
                  flex: 1,
                }}
              >
                {s.titel}
              </Text>
            </View>
            <Text
              style={{
                color: c.mutedForeground,
                fontSize: 13,
                fontFamily: "Inter_400Regular",
                lineHeight: 20,
              }}
            >
              {s.tekst}
            </Text>
          </View>
        ))}

        <Text
          style={{
            color: c.mutedForeground,
            fontSize: 11,
            fontFamily: "Inter_400Regular",
            textAlign: "center",
            marginTop: 8,
          }}
        >
          FPS Brandpreventie — FPS Connect privacybeleid
        </Text>
      </ScrollView>
    </View>
  );
}
