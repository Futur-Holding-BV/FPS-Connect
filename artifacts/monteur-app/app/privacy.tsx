import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ruimte } from "@workspace/ontwerp";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/auth";
import { bovenInset, tekstStijl } from "@/components/ui";

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
          paddingTop: bovenInset(insets) + ruimte.s,
          paddingHorizontal: ruimte.l + ruimte.xs,
          paddingBottom: ruimte.m,
          flexDirection: "row",
          alignItems: "center",
          gap: ruimte.m,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
          backgroundColor: c.card,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={c.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={tekstStijl("sectiekop", c.foreground)}>
            Privacy &amp; transparantie
          </Text>
          <Text style={tekstStijl("bijschrift", c.mutedForeground)}>
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
        contentContainerStyle={{ padding: ruimte.l + ruimte.xs, paddingBottom: insets.bottom + ruimte.xl }}
        showsVerticalScrollIndicator={false}
      >
        {gebruiker && (
          <View
            style={{
              backgroundColor: c.card,
              borderRadius: c.radius,
              padding: ruimte.l,
              marginBottom: ruimte.l,
              borderWidth: 1,
              borderColor: c.border,
            }}
          >
            <Text
              style={[
                tekstStijl("bijschrift", c.mutedForeground),
                { textTransform: "uppercase", letterSpacing: 0.5, marginBottom: ruimte.s },
              ]}
            >
              Ingelogd als
            </Text>
            <Text style={tekstStijl("nadruk", c.foreground)}>
              {gebruiker.naam}
            </Text>
            <Text
              style={[tekstStijl("klein", c.mutedForeground), { marginTop: 2 }]}
            >
              {gebruiker.email}
            </Text>
            {gebruiker.rol && (
              <View
                style={{
                  marginTop: ruimte.s,
                  alignSelf: "flex-start",
                  paddingHorizontal: ruimte.s,
                  paddingVertical: 3,
                  borderRadius: c.radius / 2,
                  backgroundColor: c.primary + "18",
                }}
              >
                <Text
                  style={[tekstStijl("bijschrift", c.primary), { textTransform: "capitalize" }]}
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
              borderRadius: c.radius,
              padding: ruimte.l,
              marginBottom: ruimte.m,
              borderWidth: 1,
              borderColor: s.accent ? c.primary + "33" : c.border,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: ruimte.s, marginBottom: ruimte.xs + 2 }}>
              <Ionicons
                name={s.accent ? "shield-checkmark" : i === 1 ? "sparkles" : "information-circle"}
                size={16}
                color={s.accent ? c.primary : c.mutedForeground}
                style={{ marginTop: 1 }}
              />
              <Text
                style={[
                  tekstStijl("standaard", s.accent ? c.primary : c.foreground),
                  { fontFamily: "Inter_600SemiBold", flex: 1 },
                ]}
              >
                {s.titel}
              </Text>
            </View>
            <Text style={tekstStijl("klein", c.mutedForeground)}>
              {s.tekst}
            </Text>
          </View>
        ))}

        <Text
          style={[tekstStijl("bijschrift", c.mutedForeground), { textAlign: "center", marginTop: ruimte.s }]}
        >
          FPS Brandpreventie — FPS Connect privacybeleid
        </Text>
      </ScrollView>
    </View>
  );
}
