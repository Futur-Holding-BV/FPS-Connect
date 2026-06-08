import { Redirect, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Knop, TekstVeld, bovenInset } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/auth";

export default function Login() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, inloggen } = useAuth();

  const [email, setEmail] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [code, setCode] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  if (token) return <Redirect href="/gebouwen" />;

  async function verstuur() {
    setFout(null);
    if (!email || !wachtwoord || !code) {
      setFout("Vul e-mail, wachtwoord en authenticatiecode in.");
      return;
    }
    setBezig(true);
    try {
      await inloggen(email, wachtwoord, code);
      router.replace("/gebouwen");
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Inloggen mislukt");
    } finally {
      setBezig(false);
    }
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
        <View style={{ paddingTop: bovenInset(insets) + 40, paddingHorizontal: 24, paddingBottom: 40 }}>
          <View style={{ alignItems: "center", marginBottom: 36 }}>
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 20,
                backgroundColor: c.primary,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 18,
              }}
            >
              <Text style={{ color: "#fff", fontSize: 30, fontFamily: "Inter_700Bold" }}>
                FPS
              </Text>
            </View>
            <Text style={{ color: c.darkForeground, fontSize: 26, fontFamily: "Inter_700Bold" }}>
              FPS Monteur
            </Text>
            <Text style={{ color: c.darkMuted, fontSize: 15, marginTop: 6, fontFamily: "Inter_400Regular" }}>
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
