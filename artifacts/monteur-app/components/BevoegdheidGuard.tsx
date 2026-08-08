// APP_01 §3.3 — nette weigering voor wie een scherm opent zonder de vereiste
// bevoegdheid (bv. via een direct adres). Geen leeg scherm, geen technische
// fout: uitleg + terugknop. De backend blijft de echte poortwachter.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

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
    <View style={{ flex: 1, backgroundColor: c.background, alignItems: "center", justifyContent: "center", padding: 32 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.muted, alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
        <Ionicons name="lock-closed-outline" size={34} color={c.mutedForeground} />
      </View>
      <Text style={{ color: c.foreground, fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: 8 }}>
        Geen toegang tot dit onderdeel
      </Text>
      <Text style={{ color: c.mutedForeground, fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 24 }}>
        Je huidige profiel geeft geen toegang tot dit scherm. Denk je dat dit niet klopt, vraag het dan na bij de beheerder.
      </Text>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/menu"))}
        style={{ backgroundColor: c.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 }}
      >
        <Text style={{ color: "#fff", fontWeight: "600" }}>Terug naar het menu</Text>
      </Pressable>
    </View>
  );
}
