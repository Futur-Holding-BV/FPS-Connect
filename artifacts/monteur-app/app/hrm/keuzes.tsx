import { useListCaoKeuzes, useGetMijnMedewerker, getGetMijnMedewerkerQueryKey, getListCaoKeuzesQueryKey } from "@workspace/api-client-react";
import type { MedewerkerCaoKeuze } from "@workspace/api-client-react";
import { Redirect } from "expo-router";
import React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";

import { bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

const TYPE_LABEL: Record<string, string> = {
  vakantiegeld:    "Vakantiegeld",
  gereedschapsgeld: "Gereedschapsgeld",
  spaarfonds:      "Spaarfonds",
};

const KEUZE_LABEL: Record<string, string> = {
  "55_uitbetaald":  "55% direct uitbetaald + 45% naar spaarfonds",
  "100_spaarfonds": "100% naar spaarfonds",
  "100_uitbetaald": "100% direct uitbetaald",
  "geld":           "Geldbedrag ontvangen",
  "natura":         "Natura (bon / gereedschapsset)",
};

function keuzeLabel(k: MedewerkerCaoKeuze): string {
  return KEUZE_LABEL[k.keuze] ?? k.keuze;
}

function euroCent(c: number | null | undefined): string {
  if (c == null) return "";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);
}

export default function CaoKeuzesScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { inhoudMaxBreedte } = useResponsive();
  const { token } = useAuth();

  const { data: mijnMedewerker } = useGetMijnMedewerker({
    query: { queryKey: getGetMijnMedewerkerQueryKey(), enabled: !!token },
  });
  const medewerkerId = mijnMedewerker?.id;
  const { data: keuzes, isLoading } = useListCaoKeuzes(medewerkerId ?? 0, {
    query: { queryKey: getListCaoKeuzesQueryKey(medewerkerId ?? 0), enabled: !!medewerkerId },
  });

  if (!token) return <Redirect href="/login" />;

  const groepenVolgorde = ["vakantiegeld", "gereedschapsgeld", "spaarfonds"];
  const groepen = groepenVolgorde.map((type) => ({
    type,
    items: (keuzes ?? []).filter((k) => k.type === type),
  })).filter((g) => g.items.length > 0);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ backgroundColor: c.dark, paddingTop: bovenInset(insets) + 12, paddingHorizontal: 20, paddingBottom: 18 }}>
        <View style={{ width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
          <Pressable onPress={() => router.back()} style={{ marginBottom: 10 }}>
            <Text style={{ color: c.primary, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>‹ Terug</Text>
          </Pressable>
          <Text style={{ color: c.darkForeground, fontSize: 20, fontFamily: "Inter_700Bold" }}>Mijn CAO-keuzes</Text>
          <Text style={{ color: c.darkMuted, fontSize: 13, marginTop: 2, fontFamily: "Inter_400Regular" }}>
            Vastgelegde arbeidsvoorwaardenkeuzes
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 32, width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
        {isLoading ? (
          <ActivityIndicator size="large" color={c.primary} style={{ marginTop: 32 }} />
        ) : groepen.length === 0 ? (
          <View style={{ backgroundColor: c.card, borderRadius: c.radius, borderWidth: 1, borderColor: c.border, padding: 24, alignItems: "center" }}>
            <Text style={{ color: c.mutedForeground, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" }}>
              Nog geen CAO-keuzes vastgelegd.{"\n"}Neem contact op met uw leidinggevende.
            </Text>
          </View>
        ) : (
          groepen.map((groep) => (
            <View key={groep.type} style={{ backgroundColor: c.card, borderRadius: c.radius, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
              <View style={{ backgroundColor: c.dark, paddingHorizontal: 16, paddingVertical: 10 }}>
                <Text style={{ color: c.darkForeground, fontSize: 14, fontFamily: "Inter_700Bold" }}>
                  {TYPE_LABEL[groep.type] ?? groep.type}
                </Text>
              </View>
              {groep.items.map((item, idx) => (
                <View
                  key={item.id}
                  style={{
                    padding: 14,
                    borderTopWidth: idx === 0 ? 0 : 1,
                    borderTopColor: c.border,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text style={{ color: c.foreground, fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 }}>
                      {keuzeLabel(item)}
                    </Text>
                    {item.jaar != null && (
                      <View style={{ backgroundColor: c.primary + "1a", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ color: c.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{item.jaar}</Text>
                      </View>
                    )}
                  </View>
                  {item.fonds_naam && (
                    <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 2 }}>
                      Fonds: {item.fonds_naam}
                    </Text>
                  )}
                  {item.bedrag_cents != null && (
                    <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 2 }}>
                      Bedrag: {euroCent(item.bedrag_cents)}
                    </Text>
                  )}
                  {item.toelichting && (
                    <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>
                      {item.toelichting}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          ))
        )}

        <View style={{ backgroundColor: c.card, borderRadius: c.radius, borderWidth: 1, borderColor: c.border, padding: 14 }}>
          <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 }}>
            Deze keuzes zijn vastgelegd door uw werkgever. Neem contact op met de personeelsadministratie als iets niet klopt.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
