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
    titel: "Uw gegevens in FPS Monteur",
    tekst:
      "FPS Monteur verwerkt uw naam, e-mailadres en rolgegevens uitsluitend voor de uitvoering van brandpreventieve inspectie- en onderhoudswerkzaamheden. De app toont alleen gegevens die relevant zijn voor uw dagelijkse werkzaamheden.",
  },
  {
    titel: "Wat wordt opgeslagen",
    tekst:
      "De app slaat uw sessie-informatie lokaal op voor veilige toegang (bearer-token). Foto's die u maakt van spots worden versleuteld naar de beveiligde opslag van FPS Connect gestuurd. Locatiegegevens worden niet opgeslagen of verwerkt.",
  },
  {
    titel: "Uw rechten",
    tekst:
      "U heeft het recht op inzage, correctie en wissing van uw persoonsgegevens. Voor vragen of verzoeken kunt u contact opnemen met uw projectleider of de beheerder van FPS Connect binnen uw organisatie.",
  },
  {
    titel: "Beveiliging",
    tekst:
      "Toegang tot de app is beveiligd met gebruikersnaam, wachtwoord en tweestapsverificatie (TOTP). Alle communicatie met FPS Connect verloopt via een versleutelde HTTPS-verbinding.",
  },
  {
    titel: "Contact",
    tekst:
      "Voor privacyvragen kunt u terecht bij uw leidinggevende of de FPS Connect-beheerder. Een uitgebreider privacyoverzicht is beschikbaar via FPS Connect op het web (Mijn privacy).",
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
            Privacy
          </Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>
            Transparantie over uw gegevens
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
            <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 }}>
              {gebruiker.email}
            </Text>
          </View>
        )}

        {SECTIES.map((s, i) => (
          <View
            key={i}
            style={{
              backgroundColor: c.card,
              borderRadius: 12,
              padding: 16,
              marginBottom: 12,
              borderWidth: 1,
              borderColor: c.border,
            }}
          >
            <Text
              style={{
                color: c.foreground,
                fontSize: 14,
                fontFamily: "Inter_600SemiBold",
                marginBottom: 6,
              }}
            >
              {s.titel}
            </Text>
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
