import { useListCaoKeuzes, useGetMijnMedewerker, getGetMijnMedewerkerQueryKey, getListCaoKeuzesQueryKey } from "@workspace/api-client-react";
import type { MedewerkerCaoKeuze } from "@workspace/api-client-react";
import { ruimte } from "@workspace/ontwerp";
import { Redirect } from "expo-router";
import React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";

import { Kaart, bovenInset, netteWaarde, tekstStijl } from "@/components/ui";
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
  return KEUZE_LABEL[k.keuze] ?? netteWaarde(k.keuze);
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
      <View style={{ backgroundColor: c.dark, paddingTop: bovenInset(insets) + ruimte.m, paddingHorizontal: ruimte.xl, paddingBottom: ruimte.l + 2 }}>
        <View style={{ width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
          <Pressable onPress={() => router.back()} style={{ marginBottom: ruimte.s + 2 }}>
            <Text style={tekstStijl("nadruk", c.primary)}>‹ Terug</Text>
          </Pressable>
          <Text style={tekstStijl("schermtitel", c.darkForeground)}>Mijn CAO-keuzes</Text>
          <Text style={[tekstStijl("klein", c.darkMuted), { marginTop: 2 }]}>
            Vastgelegde arbeidsvoorwaardenkeuzes
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: ruimte.l, gap: ruimte.m + 2, paddingBottom: insets.bottom + ruimte.xxl, width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
        {isLoading ? (
          <ActivityIndicator size="large" color={c.primary} style={{ marginTop: ruimte.xxl }} />
        ) : groepen.length === 0 ? (
          <Kaart stijl={{ padding: ruimte.xl, alignItems: "center" }}>
            <Text style={[tekstStijl("standaard", c.mutedForeground), { textAlign: "center" }]}>
              Nog geen CAO-keuzes vastgelegd.{"\n"}Neem contact op met uw leidinggevende.
            </Text>
          </Kaart>
        ) : (
          groepen.map((groep) => (
            <Kaart key={groep.type} stijl={{ overflow: "hidden", padding: 0 }}>
              <View style={{ backgroundColor: c.dark, paddingHorizontal: ruimte.l, paddingVertical: ruimte.s + 2 }}>
                <Text style={tekstStijl("nadruk", c.darkForeground)}>
                  {TYPE_LABEL[groep.type] ?? netteWaarde(groep.type)}
                </Text>
              </View>
              {groep.items.map((item, idx) => (
                <View
                  key={item.id}
                  style={{
                    padding: ruimte.m + 2,
                    borderTopWidth: idx === 0 ? 0 : 1,
                    borderTopColor: c.border,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: ruimte.xs }}>
                    <Text style={[tekstStijl("standaard", c.foreground), { fontFamily: "Inter_600SemiBold", flex: 1 }]}>
                      {keuzeLabel(item)}
                    </Text>
                    {item.jaar != null && (
                      <View style={{ backgroundColor: c.accent, borderRadius: c.radius / 2, paddingHorizontal: ruimte.s, paddingVertical: 2 }}>
                        <Text style={tekstStijl("bijschrift", c.accentForeground)}>{item.jaar}</Text>
                      </View>
                    )}
                  </View>
                  {item.fonds_naam && (
                    <Text style={[tekstStijl("klein", c.mutedForeground), { marginBottom: 2 }]}>
                      Fonds: {item.fonds_naam}
                    </Text>
                  )}
                  {item.bedrag_cents != null && (
                    <Text style={[tekstStijl("klein", c.mutedForeground), { marginBottom: 2 }]}>
                      Bedrag: {euroCent(item.bedrag_cents)}
                    </Text>
                  )}
                  {item.toelichting && (
                    <Text style={tekstStijl("klein", c.mutedForeground)}>
                      {item.toelichting}
                    </Text>
                  )}
                </View>
              ))}
            </Kaart>
          ))
        )}

        <Kaart stijl={{ padding: ruimte.m + 2 }}>
          <Text style={[tekstStijl("klein", c.mutedForeground), { lineHeight: 18 }]}>
            Deze keuzes zijn vastgelegd door uw werkgever. Neem contact op met de personeelsadministratie als iets niet klopt.
          </Text>
        </Kaart>
      </ScrollView>
    </View>
  );
}
