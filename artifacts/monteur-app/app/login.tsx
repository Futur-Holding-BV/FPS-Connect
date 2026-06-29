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

import { Knop, TekstVeld, bovenInset } from "@/components/ui";
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
          paddingTop: bovenInset(insets) + 40,
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 32,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View style={{ width: "100%", maxWidth: maxBreedte, alignItems: "center", gap: 28 }}>
          <View style={{ alignItems: "center", gap: 16 }}>
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
              <Ionicons name={biometrieIconNaam} size={40} color="#fff" />
            </View>
            <Text
              style={{
                color: c.darkForeground,
                fontSize: 22,
                fontFamily: "Inter_700Bold",
                textAlign: "center",
              }}
            >
              Snel ontgrendelen inschakelen?
            </Text>
            <Text
              style={{
                color: c.darkMuted,
                fontSize: 15,
                fontFamily: "Inter_400Regular",
                textAlign: "center",
                lineHeight: 22,
              }}
            >
              Gebruik{" "}
              <Text style={{ fontFamily: "Inter_600SemiBold", color: c.darkForeground }}>
                {biometrieType}
              </Text>{" "}
              de volgende keer om de app snel te openen. Je sessie blijft veilig opgeslagen op dit
              toestel.
            </Text>
          </View>

          <View style={{ width: "100%", gap: 14 }}>
            <Knop
              titel={`Inschakelen met ${biometrieType}`}
              onPress={schakelBiometriIn}
              bezig={bezigBio}
              groot
            />
            <Pressable onPress={slaOver} style={{ paddingVertical: 12 }}>
              <Text
                style={{
                  color: c.darkMuted,
                  fontSize: 15,
                  textAlign: "center",
                  fontFamily: "Inter_600SemiBold",
                }}
              >
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
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ paddingTop: bovenInset(insets) + 40, paddingHorizontal: 24, paddingBottom: 40, width: "100%", maxWidth: maxBreedte, alignSelf: "center" }}>
          <View style={{ alignItems: "center", marginBottom: 36 }}>
            <View
              style={{
                backgroundColor: "#fff",
                borderRadius: 16,
                paddingHorizontal: 24,
                paddingVertical: 12,
                marginBottom: 20,
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
            <Text style={{ color: c.darkMuted, fontSize: 15, fontFamily: "Inter_400Regular" }}>
              Brandpreventie op de bouwplaats
            </Text>
          </View>

          <View style={{ gap: 16 }}>
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
                  backgroundColor: "rgba(229,72,77,0.15)",
                  borderRadius: c.radius,
                  padding: 14,
                }}
              >
                <Text style={{ color: "#FCA5A5", fontSize: 15, fontFamily: "Inter_500Medium" }}>
                  {fout}
                </Text>
              </View>
            )}

            <View style={{ marginTop: 8 }}>
              <Knop titel="Inloggen" onPress={verstuur} bezig={bezig} groot />
            </View>

            <Text
              style={{
                color: c.darkMuted,
                fontSize: 13,
                textAlign: "center",
                marginTop: 8,
                lineHeight: 19,
                fontFamily: "Inter_400Regular",
              }}
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
