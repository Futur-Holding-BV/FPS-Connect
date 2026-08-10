import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ruimte } from "@workspace/ontwerp";

import { Knop, TekstVeld, bovenInset, tekstStijl } from "@/components/ui";
import kleuren from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { useAuth } from "@/context/auth";

export default function Login() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isTablet } = useResponsive();
  const { token, inloggen, biometrieBeschikbaar, biometrieAan, biometrieType, zetBiometrie } = useAuth();

  const [email, setEmail] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [code, setCode] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [biedBiometriAan, setBiedBiometriAan] = useState(false);
  const [bezigBio, setBezigBio] = useState(false);

  if (token) return <Redirect href="/menu" />;

  async function verstuur() {
    setFout(null);
    if (!email || !wachtwoord || !code) {
      setFout("Vul e-mail, wachtwoord en authenticatiecode in.");
      return;
    }
    setBezig(true);
    try {
      await inloggen(email, wachtwoord, code);
      if (biometrieBeschikbaar && !biometrieAan) {
        setBiedBiometriAan(true);
      } else {
        router.replace("/menu");
      }
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Inloggen mislukt");
    } finally {
      setBezig(false);
    }
  }

  async function schakelBiometriIn() {
    if (bezigBio) return;
    setBezigBio(true);
    try {
      await zetBiometrie(true);
    } finally {
      setBezigBio(false);
    }
    router.replace("/menu");
  }

  function slaOver() {
    router.replace("/menu");
  }

  const maxBreedte = isTablet ? 460 : undefined;

  const biometrieIconNaam =
    biometrieType === "Face ID" || biometrieType === "gezichtsherkenning"
      ? "scan-outline"
      : "finger-print-outline";

  if (biedBiometriAan) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.dark,
          paddingTop: bovenInset(insets) + ruimte.xxl + ruimte.s,
          paddingHorizontal: ruimte.xl,
          paddingBottom: insets.bottom + ruimte.xxl,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View style={{ width: "100%", maxWidth: maxBreedte, alignItems: "center", gap: ruimte.xl + ruimte.xs }}>
          <View style={{ alignItems: "center", gap: ruimte.l }}>
            <View
              style={{
                backgroundColor: c.primary,
                borderRadius: 22,
                width: 80,
                height: 80,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name={biometrieIconNaam} size={40} color={c.primaryForeground} />
            </View>
            <Text
              style={[tekstStijl("schermtitel", c.darkForeground), { textAlign: "center" }]}
            >
              Snel ontgrendelen inschakelen?
            </Text>
            <Text
              style={[
                tekstStijl("standaard", c.darkMuted),
                { textAlign: "center", lineHeight: 22 },
              ]}
            >
              Gebruik{" "}
              <Text style={{ fontFamily: "Inter_600SemiBold", color: c.darkForeground }}>
                {biometrieType}
              </Text>{" "}
              de volgende keer om de app snel te openen. Je sessie blijft veilig opgeslagen op dit
              toestel.
            </Text>
          </View>

          <View style={{ width: "100%", gap: ruimte.m + 2 }}>
            <Knop
              titel={`Inschakelen met ${biometrieType}`}
              onPress={schakelBiometriIn}
              bezig={bezigBio}
              groot
            />
            <Pressable onPress={slaOver} style={{ paddingVertical: ruimte.m }}>
              <Text style={[tekstStijl("nadruk", c.darkMuted), { textAlign: "center" }]}>
                Niet nu
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.dark }}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === "android" ? 0 : 0}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingTop: bovenInset(insets) + ruimte.xxl, paddingHorizontal: ruimte.xl, paddingBottom: ruimte.xxl + ruimte.l, width: "100%", maxWidth: maxBreedte, alignSelf: "center" }}>
          <View style={{ alignItems: "center", marginBottom: ruimte.xxl + ruimte.xs }}>
            <View
              style={{
                // Logo-vlak: het beeldmerk heeft donkere tekst en vraagt altijd een wit vlak,
                // onafhankelijk van licht/donker — bewust het lichte card-token.
                backgroundColor: kleuren.light.card,
                borderRadius: c.radius,
                paddingHorizontal: ruimte.xl,
                paddingVertical: ruimte.m,
                marginBottom: ruimte.l + ruimte.xs,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.18,
                shadowRadius: 6,
                elevation: 4,
              }}
            >
              <Image
                source={require("../assets/images/logo-fps.png")}
                style={{ width: 160, height: 62, resizeMode: "contain" }}
                accessibilityLabel="FPS Brandpreventie"
              />
            </View>
            <Text style={tekstStijl("standaard", c.darkMuted)}>
              Brandpreventie op de bouwplaats
            </Text>
          </View>

          <View style={{ gap: ruimte.l }}>
            <TekstVeld
              label="E-mailadres"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              placeholder="naam@bedrijf.nl"
            />
            <TekstVeld
              label="Wachtwoord"
              value={wachtwoord}
              onChangeText={setWachtwoord}
              secureTextEntry
              placeholder="••••••••"
            />
            <TekstVeld
              label="Authenticatiecode (2FA)"
              value={code}
              onChangeText={(t) => setCode(t.replace(/\s/g, ""))}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="123456"
            />

            {fout && (
              <View
                style={{
                  backgroundColor: c.destructive + "26",
                  borderRadius: c.radius,
                  padding: ruimte.m + 2,
                }}
              >
                <Text style={[tekstStijl("nadruk", c.destructive), { fontFamily: "Inter_500Medium" }]}>
                  {fout}
                </Text>
              </View>
            )}

            <View style={{ marginTop: ruimte.s }}>
              <Knop titel="Inloggen" onPress={verstuur} bezig={bezig} groot />
            </View>

            <Text
              style={[
                tekstStijl("klein", c.darkMuted),
                { textAlign: "center", marginTop: ruimte.s, lineHeight: 19 },
              ]}
            >
              Nog geen 2FA ingericht? Log eerst eenmalig in via de webportal om je
              authenticator-app te koppelen.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
