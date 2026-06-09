import { useGetInfoInstellingen } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bovenInset } from "@/components/ui";
import { useColors } from "@/hooks/useColors";

const APP_VERSIE = "1.0.0";
const APP_UITGEBRACHT_OP = "2026-06-08";
const APP_LEVERANCIER = "FPS Brandpreventie";

type Wijziging = { versie: string; datum: string; punten: string[] };

const WIJZIGINGSLOGBOEK: Wijziging[] = [
  {
    versie: "1.0.0",
    datum: "2026-06-08",
    punten: [
      "Helpdesk, feedback en gebruiksstatistieken toegevoegd",
      "Login-risicosignalen (nieuw apparaat of nieuw IP-adres)",
      "Uitnodigingslogboek met verlopen-status en acceptatiedatum",
      "Brand- en rookscheidingen intekenen op plattegronden",
      "Tekeningenbeheer en gebouwpartijen met toegewezen gebruikers",
    ],
  },
  {
    versie: "0.9.0",
    datum: "2026-05-20",
    punten: [
      "Verplichte tweestapsverificatie met authenticator-app",
      "Rolgebaseerde portalen voor beheerder, monteur, controleur en klant",
      "Mobiele monteur-app gekoppeld aan het platform",
    ],
  },
  {
    versie: "0.5.0",
    datum: "2026-04-15",
    punten: [
      "Gebouwen-, voorzieningen-, inspectie- en onderhoudsbeheer",
      "Dashboard met live statistieken en aankomende inspectiedatums",
      "Abonnementen en gebruikersbeheer",
    ],
  },
];

function formatDatum(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function InfoScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: instellingen } = useGetInfoInstellingen();

  const heeftSupportInfo =
    instellingen &&
    (instellingen.support_email ||
      instellingen.support_telefoon ||
      instellingen.support_website);

  function Kaart({ titel, children }: { titel: string; children: React.ReactNode }) {
    return (
      <View
        style={{
          backgroundColor: c.card,
          borderRadius: c.radius,
          borderWidth: 1,
          borderColor: c.border,
          padding: 18,
        }}
      >
        <Text
          style={{
            color: c.foreground,
            fontSize: 16,
            fontFamily: "Inter_700Bold",
            marginBottom: 10,
          }}
        >
          {titel}
        </Text>
        {children}
      </View>
    );
  }

  function Alinea({ children }: { children: React.ReactNode }) {
    return (
      <Text
        style={{
          color: c.mutedForeground,
          fontSize: 14,
          lineHeight: 21,
          fontFamily: "Inter_400Regular",
          marginBottom: 10,
        }}
      >
        {children}
      </Text>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={{
          backgroundColor: c.dark,
          paddingTop: bovenInset(insets) + 12,
          paddingHorizontal: 20,
          paddingBottom: 18,
        }}
      >
        <Pressable onPress={() => router.back()} style={{ marginBottom: 10 }}>
          <Text style={{ color: c.primary, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>
            ‹ Terug
          </Text>
        </Pressable>
        <Text style={{ color: c.darkForeground, fontSize: 22, fontFamily: "Inter_700Bold" }}>
          App-informatie
        </Text>
        <Text style={{ color: c.darkMuted, fontSize: 14, marginTop: 4, fontFamily: "Inter_400Regular" }}>
          Versiebeheer, juridische verantwoordelijkheid en ondersteuning
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 32 }}
      >
        <Kaart titel="Over de applicatie">
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular" }}>
                Applicatie
              </Text>
              <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                {APP_LEVERANCIER}
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular" }}>
                Versie
              </Text>
              <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                v{APP_VERSIE}
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular" }}>
                Uitgebracht op
              </Text>
              <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                {formatDatum(APP_UITGEBRACHT_OP)}
              </Text>
            </View>
          </View>
        </Kaart>

        <Kaart titel="Privacybeleid en gegevensverwerking">
          <Alinea>
            {APP_LEVERANCIER} verwerkt persoonsgegevens uitsluitend in het kader van het
            leveren van de dienst. De verwerking beperkt zich tot gegevens die noodzakelijk
            zijn voor de registratie en het beheer van brandpreventieve gebouwvoorzieningen,
            zoals naam, e-mailadres, gebruikersrol en activiteitenlogboek.
          </Alinea>
          <Alinea>
            Gegevens worden opgeslagen in een beveiligde omgeving en worden niet gedeeld met
            derden tenzij dit wettelijk verplicht is. Gebruikers hebben te allen tijde recht
            op inzage, correctie en verwijdering van hun persoonsgegevens conform de Algemene
            Verordening Gegevensbescherming (AVG).
          </Alinea>
        </Kaart>

        <Kaart titel="Veiligheidsdisclaimer">
          <Alinea>
            De informatie en registraties in {APP_LEVERANCIER} zijn bedoeld als ondersteunend
            hulpmiddel bij het beheer van brandveiligheidsvoorzieningen. De applicatie geeft
            geen garantie over de daadwerkelijke brandveiligheid van een gebouw of installatie.
          </Alinea>
          <Alinea>
            Inspecties, keuringen en onderhoud dienen uitsluitend te worden uitgevoerd door
            gecertificeerde en bevoegde personen, conform de geldende wet- en regelgeving,
            NEN-normen en de eisen van het bevoegd gezag. Een digitale registratie vervangt
            nooit een fysieke controle ter plaatse.
          </Alinea>
          <Alinea>
            Bij calamiteiten of twijfel over de brandveiligheid dient altijd een bevoegde
            instantie te worden geraadpleegd. Het gebruik van deze applicatie ontslaat de
            gebruiker, beheerder of gebouweigenaar niet van hun wettelijke verplichtingen op
            het gebied van brandveiligheid.
          </Alinea>
        </Kaart>

        <Kaart titel="Juridische verantwoordelijkheid">
          <Alinea>
            {APP_LEVERANCIER} is een hulpmiddel voor het registreren, beheren en inspecteren
            van brandpreventieve gebouwvoorzieningen. De applicatie ondersteunt bij het
            vastleggen en plannen van werkzaamheden, maar vervangt niet het professionele
            oordeel van bevoegde inspecteurs, monteurs of de verantwoordelijke gebouweigenaar.
          </Alinea>
          <Alinea>
            De gebruiker en de gebouweigenaar blijven te allen tijde zelf verantwoordelijk voor
            het naleven van de geldende wet- en regelgeving op het gebied van brandveiligheid,
            waaronder het Bouwbesluit en de van toepassing zijnde NEN-normen. {APP_LEVERANCIER}
            aanvaardt geen aansprakelijkheid voor schade die voortvloeit uit onjuiste,
            onvolledige of verouderde gegevens, noch uit beslissingen die op basis van de in de
            applicatie getoonde informatie zijn genomen.
          </Alinea>
          <Alinea>
            Controleer ingevoerde gegevens zorgvuldig en raadpleeg bij twijfel altijd een
            gecertificeerde specialist. Alle rechten voorbehouden.
          </Alinea>
        </Kaart>

        <Kaart titel="Ondersteuning">
          {heeftSupportInfo ? (
            <View style={{ gap: 10 }}>
              {instellingen?.support_email ? (
                <Pressable onPress={() => Linking.openURL(`mailto:${instellingen.support_email}`)}>
                  <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>
                    E-mail
                  </Text>
                  <Text style={{ color: c.primary, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
                    {instellingen.support_email}
                  </Text>
                </Pressable>
              ) : null}
              {instellingen?.support_telefoon ? (
                <Pressable onPress={() => Linking.openURL(`tel:${instellingen.support_telefoon}`)}>
                  <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>
                    Telefoon
                  </Text>
                  <Text style={{ color: c.foreground, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
                    {instellingen.support_telefoon}
                  </Text>
                </Pressable>
              ) : null}
              {instellingen?.support_website ? (
                <Pressable onPress={() => Linking.openURL(instellingen.support_website!)}>
                  <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>
                    Website
                  </Text>
                  <Text style={{ color: c.primary, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
                    {instellingen.support_website}
                  </Text>
                </Pressable>
              ) : null}
              {instellingen?.extra_disclaimer ? (
                <Text
                  style={{
                    color: c.mutedForeground,
                    fontSize: 13,
                    lineHeight: 20,
                    fontFamily: "Inter_400Regular",
                    paddingTop: 6,
                    borderTopWidth: 1,
                    borderTopColor: c.border,
                  }}
                >
                  {instellingen.extra_disclaimer}
                </Text>
              ) : null}
            </View>
          ) : (
            <Alinea>
              Er zijn nog geen supportgegevens ingevoerd. Neem contact op met uw systeembeheerder.
            </Alinea>
          )}
        </Kaart>

        <Kaart titel="Versiebeheer">
          <View style={{ gap: 16 }}>
            {WIJZIGINGSLOGBOEK.map((wijziging) => (
              <View
                key={wijziging.versie}
                style={{ borderLeftWidth: 2, borderLeftColor: c.primary, paddingLeft: 12 }}
              >
                <Text style={{ color: c.foreground, fontSize: 14, fontFamily: "Inter_700Bold" }}>
                  v{wijziging.versie}
                  <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>
                    {"  "}
                    {formatDatum(wijziging.datum)}
                  </Text>
                </Text>
                <View style={{ marginTop: 6, gap: 4 }}>
                  {wijziging.punten.map((punt, i) => (
                    <Text
                      key={i}
                      style={{
                        color: c.mutedForeground,
                        fontSize: 13,
                        lineHeight: 19,
                        fontFamily: "Inter_400Regular",
                      }}
                    >
                      {"\u2022  "}
                      {punt}
                    </Text>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </Kaart>

        <Text
          style={{
            textAlign: "center",
            color: c.mutedForeground,
            fontSize: 12,
            fontFamily: "Inter_400Regular",
            paddingTop: 4,
          }}
        >
          © {new Date().getFullYear()} {APP_LEVERANCIER} · v{APP_VERSIE}
        </Text>
      </ScrollView>
    </View>
  );
}
