import { useGetInfoInstellingen, useWachtwoordWijzigen } from "@workspace/api-client-react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useSync } from "@/context/sync";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

const APP_VERSIE = "1.0.0";
const APP_UITGEBRACHT_OP = "2026-06-08";
const APP_NAAM = "FPS Monteur";
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
  const { inhoudMaxBreedte, leesMaxBreedte } = useResponsive();
  const { data: instellingen } = useGetInfoInstellingen();
  const { biometrieAan, biometrieBeschikbaar, biometrieType, zetBiometrie } = useAuth();
  const { aantalWachtend, aantalMislukt: aantalMisluktSync, isSyncing, syncStatus, forceerSync, wisMislukte } = useSync();
  const [bezigBio, setBezigBio] = useState(false);
  const [bezigSync, setBezigSync] = useState(false);

  const [wwOpen, setWwOpen] = useState(false);
  const [wwHuidig, setWwHuidig] = useState("");
  const [wwNieuw, setWwNieuw] = useState("");
  const [wwBevestig, setWwBevestig] = useState("");
  const [wwFout, setWwFout] = useState("");
  const [wwGedaan, setWwGedaan] = useState(false);
  const wachtwoordWijzigen = useWachtwoordWijzigen();

  function resetWwModal() {
    setWwHuidig("");
    setWwNieuw("");
    setWwBevestig("");
    setWwFout("");
    setWwGedaan(false);
  }

  async function slaWachtwoordOp() {
    if (!wwHuidig || !wwNieuw || !wwBevestig) {
      setWwFout("Vul alle velden in.");
      return;
    }
    if (wwNieuw.length < 8) {
      setWwFout("Nieuw wachtwoord moet minimaal 8 tekens bevatten.");
      return;
    }
    if (wwNieuw !== wwBevestig) {
      setWwFout("Nieuwe wachtwoorden komen niet overeen.");
      return;
    }
    setWwFout("");
    try {
      await wachtwoordWijzigen.mutateAsync({
        data: { huidig_wachtwoord: wwHuidig, nieuw_wachtwoord: wwNieuw },
      });
      setWwGedaan(true);
    } catch {
      setWwFout("Huidig wachtwoord is onjuist of er is een serverfout opgetreden.");
    }
  }

  async function syncNu() {
    if (bezigSync) return;
    setBezigSync(true);
    try {
      await forceerSync();
    } finally {
      setBezigSync(false);
    }
  }

  async function wisselBiometrie(aan: boolean) {
    if (bezigBio) return;
    setBezigBio(true);
    try {
      await zetBiometrie(aan);
    } finally {
      setBezigBio(false);
    }
  }

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
        <View style={{ width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
        <Pressable onPress={() => router.back()} style={{ marginBottom: 10 }}>
          <Text style={{ color: c.primary, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>
            ‹ Terug
          </Text>
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            <Image
              source={require("../assets/images/logo-fps.png")}
              style={{ width: 90, height: 35, resizeMode: "contain" }}
              accessibilityLabel="FPS Brandpreventie"
            />
          </View>
          <View>
            <Text style={{ color: c.darkForeground, fontSize: 20, fontFamily: "Inter_700Bold" }}>
              App-informatie
            </Text>
            <Text style={{ color: c.darkMuted, fontSize: 13, marginTop: 2, fontFamily: "Inter_400Regular" }}>
              v{APP_VERSIE}
            </Text>
          </View>
        </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 32, width: "100%", maxWidth: leesMaxBreedte, alignSelf: "center" }}
      >
        <Kaart titel="Synchronisatie">
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: c.foreground, fontSize: 14, fontFamily: "Inter_600SemiBold" }}>
                Status
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: "Inter_600SemiBold",
                  color:
                    syncStatus === "gesynchroniseerd"
                      ? "#16a34a"
                      : syncStatus === "mislukt"
                      ? "#dc2626"
                      : syncStatus === "synchroniseert"
                      ? c.primary
                      : "#d97706",
                }}
              >
                {syncStatus === "gesynchroniseerd"
                  ? "Gesynchroniseerd"
                  : syncStatus === "mislukt"
                  ? `${aantalMisluktSync} mislukt`
                  : syncStatus === "synchroniseert"
                  ? "Bezig..."
                  : syncStatus === "opgeslagen"
                  ? `${aantalWachtend} wachtend`
                  : "Wacht op verbinding"}
              </Text>
            </View>

            {aantalWachtend > 0 || aantalMisluktSync > 0 ? (
              <Text
                style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}
              >
                {aantalWachtend > 0
                  ? `${aantalWachtend} item${aantalWachtend !== 1 ? "s" : ""} wachten op synchronisatie. `
                  : ""}
                {aantalMisluktSync > 0
                  ? `${aantalMisluktSync} item${aantalMisluktSync !== 1 ? "s" : ""} zijn definitief mislukt.`
                  : ""}
              </Text>
            ) : null}

            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={syncNu}
                disabled={bezigSync || isSyncing}
                style={{
                  flex: 1,
                  backgroundColor: c.primary,
                  borderRadius: 8,
                  paddingVertical: 9,
                  alignItems: "center",
                  opacity: bezigSync || isSyncing ? 0.6 : 1,
                }}
              >
                <Text style={{ color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                  {isSyncing ? "Bezig..." : "Nu synchroniseren"}
                </Text>
              </Pressable>

              {aantalMisluktSync > 0 ? (
                <Pressable
                  onPress={wisMislukte}
                  style={{
                    flex: 1,
                    backgroundColor: c.accent,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: c.border,
                    paddingVertical: 9,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#dc2626", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                    Wis mislukte items
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </Kaart>

        <Kaart titel="Beveiliging">
          <View style={{ gap: 14 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.foreground, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
                  Snel ontgrendelen
                </Text>
                <Text
                  style={{
                    color: c.mutedForeground,
                    fontSize: 13,
                    lineHeight: 19,
                    fontFamily: "Inter_400Regular",
                    marginTop: 2,
                  }}
                >
                  {Platform.OS === "web"
                    ? "Snel ontgrendelen is alleen beschikbaar in de native app op een iOS- of Android-toestel."
                    : biometrieBeschikbaar
                    ? `Open de app voortaan met ${biometrieType} in plaats van opnieuw inloggen. Je sessie blijft veilig opgeslagen op dit toestel.`
                    : "Stel eerst een vingerafdruk of gezichtsherkenning in op dit toestel om snel ontgrendelen te kunnen gebruiken."}
                </Text>
              </View>
              <Switch
                value={biometrieAan}
                onValueChange={wisselBiometrie}
                disabled={!biometrieBeschikbaar || bezigBio}
                trackColor={{ false: c.border, true: c.primary }}
                thumbColor="#fff"
              />
            </View>

            <View style={{ height: 1, backgroundColor: c.border }} />

            <Pressable
              onPress={() => { resetWwModal(); setWwOpen(true); }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 2,
              }}
            >
              <View>
                <Text style={{ color: c.foreground, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
                  Wachtwoord wijzigen
                </Text>
                <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 }}>
                  Stel een nieuw wachtwoord in voor uw account
                </Text>
              </View>
              <Text style={{ color: c.primary, fontSize: 20, fontFamily: "Inter_400Regular" }}>›</Text>
            </Pressable>
          </View>
        </Kaart>

        <Kaart titel="Rondleiding">
          <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: 12 }}>
            Bekijk de introductierondleiding opnieuw om vertrouwd te raken met alle functies van de app.
          </Text>
          <Pressable
            onPress={async () => {
              await AsyncStorage.removeItem("fps_onboarding_voltooid");
              router.push("/onboarding");
            }}
            style={({ pressed }) => ({
              backgroundColor: pressed ? "#d63400" : "#F23B0D",
              borderRadius: 8,
              paddingVertical: 10,
              paddingHorizontal: 16,
              alignItems: "center",
            })}
          >
            <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" }}>
              Rondleiding opnieuw bekijken
            </Text>
          </Pressable>
        </Kaart>

        <Kaart titel="Over de applicatie">
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular" }}>
                Applicatie
              </Text>
              <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                {APP_NAAM}
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
            De informatie en registraties in {APP_NAAM} zijn bedoeld als ondersteunend
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
            {APP_NAAM} is een hulpmiddel voor het registreren, beheren en inspecteren
            van brandpreventieve gebouwvoorzieningen. De applicatie ondersteunt bij het
            vastleggen en plannen van werkzaamheden, maar vervangt niet het professionele
            oordeel van bevoegde inspecteurs, monteurs of de verantwoordelijke gebouweigenaar.
          </Alinea>
          <Alinea>
            De gebruiker en de gebouweigenaar blijven te allen tijde zelf verantwoordelijk voor
            het naleven van de geldende wet- en regelgeving op het gebied van brandveiligheid,
            waaronder het Bouwbesluit en de van toepassing zijnde NEN-normen. {APP_LEVERANCIER} aanvaardt geen aansprakelijkheid voor schade die voortvloeit uit onjuiste,
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

      <Modal
        visible={wwOpen}
        transparent
        animationType="slide"
        onRequestClose={() => { setWwOpen(false); resetWwModal(); }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: "flex-end" }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            style={{ flex: 1 }}
            onPress={() => { setWwOpen(false); resetWwModal(); }}
          />
          <View
            style={{
              backgroundColor: c.card,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 24,
              paddingBottom: insets.bottom + 24,
              borderTopWidth: 1,
              borderTopColor: c.border,
              gap: 16,
            }}
          >
            <Text style={{ color: c.foreground, fontSize: 18, fontFamily: "Inter_700Bold" }}>
              Wachtwoord wijzigen
            </Text>

            {wwGedaan ? (
              <View style={{ gap: 14 }}>
                <View
                  style={{
                    backgroundColor: "#f0fdf4",
                    borderRadius: 10,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: "#bbf7d0",
                  }}
                >
                  <Text style={{ color: "#15803d", fontSize: 14, fontFamily: "Inter_600SemiBold" }}>
                    Wachtwoord succesvol gewijzigd
                  </Text>
                  <Text style={{ color: "#166534", fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 }}>
                    Gebruik uw nieuwe wachtwoord bij de volgende aanmelding.
                  </Text>
                </View>
                <Pressable
                  onPress={() => { setWwOpen(false); resetWwModal(); }}
                  style={{
                    backgroundColor: c.primary,
                    borderRadius: 10,
                    paddingVertical: 13,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
                    Sluiten
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 14 }}>
                <View style={{ gap: 6 }}>
                  <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                    Huidig wachtwoord
                  </Text>
                  <TextInput
                    value={wwHuidig}
                    onChangeText={setWwHuidig}
                    secureTextEntry
                    autoComplete="current-password"
                    placeholder="Voer huidig wachtwoord in"
                    placeholderTextColor={c.mutedForeground}
                    style={{
                      backgroundColor: c.accent,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: c.border,
                      paddingHorizontal: 12,
                      paddingVertical: 11,
                      color: c.foreground,
                      fontSize: 15,
                      fontFamily: "Inter_400Regular",
                    }}
                  />
                </View>

                <View style={{ gap: 6 }}>
                  <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                    Nieuw wachtwoord
                  </Text>
                  <TextInput
                    value={wwNieuw}
                    onChangeText={setWwNieuw}
                    secureTextEntry
                    autoComplete="new-password"
                    placeholder="Minimaal 8 tekens"
                    placeholderTextColor={c.mutedForeground}
                    style={{
                      backgroundColor: c.accent,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: c.border,
                      paddingHorizontal: 12,
                      paddingVertical: 11,
                      color: c.foreground,
                      fontSize: 15,
                      fontFamily: "Inter_400Regular",
                    }}
                  />
                </View>

                <View style={{ gap: 6 }}>
                  <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                    Bevestig nieuw wachtwoord
                  </Text>
                  <TextInput
                    value={wwBevestig}
                    onChangeText={setWwBevestig}
                    secureTextEntry
                    autoComplete="new-password"
                    placeholder="Herhaal nieuw wachtwoord"
                    placeholderTextColor={c.mutedForeground}
                    style={{
                      backgroundColor: c.accent,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: c.border,
                      paddingHorizontal: 12,
                      paddingVertical: 11,
                      color: c.foreground,
                      fontSize: 15,
                      fontFamily: "Inter_400Regular",
                    }}
                  />
                </View>

                {wwFout ? (
                  <Text style={{ color: "#dc2626", fontSize: 13, fontFamily: "Inter_400Regular" }}>
                    {wwFout}
                  </Text>
                ) : null}

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={() => { setWwOpen(false); resetWwModal(); }}
                    style={{
                      flex: 1,
                      backgroundColor: c.accent,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: c.border,
                      paddingVertical: 13,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: c.foreground, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
                      Annuleren
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={slaWachtwoordOp}
                    disabled={wachtwoordWijzigen.isPending}
                    style={{
                      flex: 2,
                      backgroundColor: c.primary,
                      borderRadius: 10,
                      paddingVertical: 13,
                      alignItems: "center",
                      opacity: wachtwoordWijzigen.isPending ? 0.6 : 1,
                    }}
                  >
                    <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
                      {wachtwoordWijzigen.isPending ? "Bezig..." : "Wachtwoord wijzigen"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
