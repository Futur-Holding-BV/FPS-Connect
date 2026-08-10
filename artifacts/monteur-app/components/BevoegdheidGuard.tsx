// APP_01 §3.3 — nette weigering voor wie een scherm opent zonder de vereiste
// bevoegdheid (bv. via een direct adres). Geen leeg scherm, geen technische
// fout: uitleg + terugknop. De backend blijft de echte poortwachter.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { ruimte } from "@workspace/ontwerp";

import { tekstStijl } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { heeftBevoegdheid, type Vereiste } from "@/lib/bevoegdheden";

export function BevoegdheidGuard({
  vereiste,
  children,
}: {
  vereiste: Vereiste;
  children: React.ReactNode;
}) {
  const c = useColors();
  const router = useRouter();
  const { gebruiker } = useAuth();

  if (heeftBevoegdheid(gebruiker, vereiste)) return <>{children}</>;

  return (
    <View style={{ flex: 1, backgroundColor: c.background, alignItems: "center", justifyContent: "center", padding: ruimte.xxl }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.muted, alignItems: "center", justifyContent: "center", marginBottom: ruimte.l + ruimte.xs }}>
        <Ionicons name="lock-closed-outline" size={34} color={c.mutedForeground} />
      </View>
      <Text style={[tekstStijl("sectiekop", c.foreground), { textAlign: "center", marginBottom: ruimte.s }]}>
        Geen toegang tot dit onderdeel
      </Text>
      <Text style={[tekstStijl("standaard", c.mutedForeground), { textAlign: "center", lineHeight: 20, marginBottom: ruimte.xl }]}>
        Je huidige profiel geeft geen toegang tot dit scherm. Denk je dat dit niet klopt, vraag het dan na bij de beheerder.
      </Text>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/menu"))}
        style={{ backgroundColor: c.primary, paddingHorizontal: ruimte.xl, paddingVertical: ruimte.m, borderRadius: c.radius }}
      >
        <Text style={{ color: c.primaryForeground, fontWeight: "600" }}>Terug naar het menu</Text>
      </Pressable>
    </View>
  );
}
