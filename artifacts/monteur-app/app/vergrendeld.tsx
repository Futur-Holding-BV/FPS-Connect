import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Knop, bovenInset } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/auth";

export default function Vergrendeld() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    bezigLaden,
    vergrendeld,
    gebruiker,
    biometrieType,
    ontgrendel,
    uitloggen,
  } = useAuth();

  const [bezig, setBezig] = useState(false);
  const [mislukt, setMislukt] = useState(false);
  const autoGedaan = useRef(false);
  const bezigRef = useRef(false);

  async function probeer() {
    // Synchrone gate: blokkeert een dubbele biometrie-prompt bij snelle dubbeltap
    // voordat de bezig-state een re-render heeft veroorzaakt.
    if (bezigRef.current) return;
    bezigRef.current = true;
    setBezig(true);
    setMislukt(false);
    const ok = await ontgrendel();
    bezigRef.current = false;
    setBezig(false);
    if (ok) router.replace("/menu");
    else setMislukt(true);
  }

  // Vraag bij openen eenmalig automatisch om biometrie.
  useEffect(() => {
    if (autoGedaan.current) return;
    if (bezigLaden || !vergrendeld) return;
    autoGedaan.current = true;
    probeer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bezigLaden, vergrendeld]);

  async function naarWachtwoord() {
    await uitloggen();
    router.replace("/login");
  }

  // Wanneer er niets (meer) te ontgrendelen valt, laat de centrale poort
  // in _layout.tsx de juiste route bepalen.
  if (!bezigLaden && !vergrendeld) return <Redirect href="/menu" />;

  const biometrieIconNaam =
    biometrieType === "Face ID" || biometrieType === "gezichtsherkenning"
      ? "scan-outline"
      : "finger-print-outline";

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
      <View style={{ alignItems: "center", marginBottom: 36 }}>
        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: 16,
            paddingHorizontal: 24,
            paddingVertical: 12,
            marginBottom: 20,
          }}
        >
          <Image
            source={require("../assets/images/logo-fps.png")}
            style={{ width: 160, height: 62, resizeMode: "contain" }}
            accessibilityLabel="FPS Brandpreventie"
          />
        </View>
        <View
          style={{
            backgroundColor: c.primary,
            borderRadius: 22,
            width: 72,
            height: 72,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <Ionicons name={biometrieIconNaam} size={34} color="#fff" />
        </View>
        <Text style={{ color: c.darkForeground, fontSize: 22, fontFamily: "Inter_700Bold" }}>
          App vergrendeld
        </Text>
        <Text
          style={{
            color: c.darkMuted,
            fontSize: 15,
            marginTop: 6,
            textAlign: "center",
            fontFamily: "Inter_400Regular",
          }}
        >
          {gebruiker?.naam ? `Welkom terug, ${gebruiker.naam}.` : "Welkom terug."}
        </Text>
      </View>

      <View style={{ width: "100%", maxWidth: 420, gap: 14 }}>
        {mislukt && (
          <View
            style={{
              backgroundColor: "rgba(229,72,77,0.15)",
              borderRadius: c.radius,
              padding: 14,
            }}
          >
            <Text style={{ color: "#FCA5A5", fontSize: 15, fontFamily: "Inter_500Medium", textAlign: "center" }}>
              Ontgrendelen is niet gelukt. Probeer het opnieuw of log in met je
              wachtwoord.
            </Text>
          </View>
        )}

        <Knop
          titel={`Ontgrendelen met ${biometrieType}`}
          onPress={probeer}
          bezig={bezig}
          groot
        />

        <Pressable onPress={naarWachtwoord} style={{ paddingVertical: 12 }}>
          <Text
            style={{
              color: c.darkMuted,
              fontSize: 15,
              textAlign: "center",
              fontFamily: "Inter_600SemiBold",
            }}
          >
            Met wachtwoord inloggen
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
