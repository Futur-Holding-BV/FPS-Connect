import { useListToolboxBerichten } from "@workspace/api-client-react";
import type { ToolboxBericht } from "@workspace/api-client-react";
import { ruimte } from "@workspace/ontwerp";
import { Redirect, useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Kaart, bovenInset, tekstStijl } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

function datumLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

function BerichtKaart({ bericht, c }: { bericht: ToolboxBericht; c: ReturnType<typeof useColors> }) {
  const [uitgevouwen, setUitgevouwen] = useState(false);

  return (
    <Pressable
      onPress={() => setUitgevouwen((v) => !v)}
      style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
    >
      <Kaart stijl={{ borderColor: uitgevouwen ? c.primary : c.border, padding: ruimte.l + 2 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: ruimte.m }}>
          <View style={{ flex: 1 }}>
            <Text style={tekstStijl("nadruk", c.foreground)}>
              {bericht.titel}
            </Text>
            {bericht.gepubliceerd_op && (
              <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 3 }]}>
                {datumLabel(bericht.gepubliceerd_op)}
              </Text>
            )}
          </View>
          <Text style={[tekstStijl("sectiekop", c.primary), { fontSize: 18, lineHeight: 24 }]}>
            {uitgevouwen ? "−" : "+"}
          </Text>
        </View>

        {!uitgevouwen && bericht.inhoud ? (
          <Text
            style={[tekstStijl("klein", c.mutedForeground), { marginTop: ruimte.s }]}
            numberOfLines={2}
          >
            {bericht.inhoud}
          </Text>
        ) : null}

        {uitgevouwen && bericht.inhoud ? (
          <Text
            style={[tekstStijl("standaard", c.foreground), { marginTop: ruimte.s + 2, lineHeight: 22 }]}
          >
            {bericht.inhoud}
          </Text>
        ) : null}
      </Kaart>
    </Pressable>
  );
}

export default function KennisbankScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { leesMaxBreedte, inhoudMaxBreedte } = useResponsive();
  const { token } = useAuth();

  const { data: berichten, isLoading } = useListToolboxBerichten(
    {},
    { query: { queryKey: ["toolbox-berichten-kennisbank"] } }
  );

  if (!token) return <Redirect href="/login" />;

  const zichtbaar = (berichten ?? []).filter((b) => b.gepubliceerd && !b.gearchiveerd);

  const vasteArtikelen = [
    {
      titel: "Brandwerende doorvoeringen",
      inhoud: "Richtlijnen voor het brandwerend afdichten van doorvoeringen in scheidingsconstructies. Altijd de goedgekeurde producten en toepassingsvoorschriften uit de bibliotheek volgen.",
    },
    {
      titel: "Veilig werken op locatie",
      inhoud: "Verplichte veiligheidsmaatregelen bij werkzaamheden in gebouwen: persoonlijke beschermingsmiddelen, afbakening werkgebied, melding bij opdrachtgever en noodprocedures.",
    },
    {
      titel: "Inspectie van branddeuren",
      inhoud: "Controlepunten bij periodieke inspectie: sluitmechanisme, kieren, deurdrangers, afdichtingsstrippen en aanwezigheid van keuringslabel.",
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ backgroundColor: c.dark, paddingTop: bovenInset(insets) + ruimte.m, paddingHorizontal: ruimte.xl, paddingBottom: ruimte.l + 2 }}>
        <View style={{ width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
          <Pressable onPress={() => router.back()} style={{ marginBottom: ruimte.s + 2 }}>
            <Text style={tekstStijl("nadruk", c.primary)}>‹ Terug</Text>
          </Pressable>
          <Text style={tekstStijl("schermtitel", c.darkForeground)}>Kennisbank</Text>
          <Text style={[tekstStijl("klein", c.darkMuted), { marginTop: 2 }]}>
            Werkafspraken, handboeken en toolboxen
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: ruimte.l,
          gap: ruimte.m,
          paddingBottom: insets.bottom + ruimte.xxl,
          width: "100%",
          maxWidth: leesMaxBreedte,
          alignSelf: "center",
        }}
      >
        {/* Vaste kennisartikelen — altijd aanwezig, geen API-afhankelijkheid */}
        <Text style={[tekstStijl("bijschrift", c.mutedForeground), { textTransform: "uppercase", letterSpacing: 0.8, marginBottom: ruimte.xs }]}>
          Vaste artikelen
        </Text>
        {vasteArtikelen.map((a) => (
          <Kaart key={a.titel} stijl={{ padding: ruimte.l }}>
            <Text style={[tekstStijl("nadruk", c.foreground), { marginBottom: ruimte.xs + 2 }]}>{a.titel}</Text>
            <Text style={[tekstStijl("klein", c.mutedForeground), { lineHeight: 19 }]}>{a.inhoud}</Text>
          </Kaart>
        ))}

        {/* Toolbox berichten vanuit de beheeromgeving */}
        {zichtbaar.length > 0 && (
          <Text style={[tekstStijl("bijschrift", c.mutedForeground), { textTransform: "uppercase", letterSpacing: 0.8, marginTop: ruimte.s, marginBottom: ruimte.xs }]}>
            Toolbox
          </Text>
        )}
        {isLoading ? (
          <ActivityIndicator size="large" color={c.primary} style={{ marginTop: ruimte.l }} />
        ) : (
          zichtbaar.map((b) => <BerichtKaart key={b.id} bericht={b} c={c} />)
        )}
      </ScrollView>
    </View>
  );
}
