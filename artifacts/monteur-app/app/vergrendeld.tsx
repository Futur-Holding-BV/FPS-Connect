import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ruimte } from "@workspace/ontwerp";

import { Knop, bovenInset, tekstStijl } from "@/components/ui";
import kleuren from "@/constants/colors";
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
        paddingTop: bovenInset(insets) + ruimte.xxl + ruimte.s,
        paddingHorizontal: ruimte.xl,
        paddingBottom: insets.bottom + ruimte.xxl,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
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
            marginBottom: ruimte.l,
          }}
        >
          <Ionicons name={biometrieIconNaam} size={34} color={c.primaryForeground} />
        </View>
        <Text style={tekstStijl("schermtitel", c.darkForeground)}>
          App vergrendeld
        </Text>
        <Text
          style={[
            tekstStijl("standaard", c.darkMuted),
            { marginTop: ruimte.xs + 2, textAlign: "center" },
          ]}
        >
          {gebruiker?.naam ? `Welkom terug, ${gebruiker.naam}.` : "Welkom terug."}
        </Text>
      </View>

      <View style={{ width: "100%", maxWidth: 420, gap: ruimte.m + 2 }}>
        {mislukt && (
          <View
            style={{
              backgroundColor: c.destructive + "26",
              borderRadius: c.radius,
              padding: ruimte.m + 2,
            }}
          >
            <Text style={[tekstStijl("nadruk", c.destructive), { fontFamily: "Inter_500Medium", textAlign: "center" }]}>
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

        <Pressable onPress={naarWachtwoord} style={{ paddingVertical: ruimte.m }}>
          <Text style={[tekstStijl("nadruk", c.darkMuted), { textAlign: "center" }]}>
            Met wachtwoord inloggen
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
