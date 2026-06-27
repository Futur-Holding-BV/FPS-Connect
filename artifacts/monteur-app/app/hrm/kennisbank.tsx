import { useListToolboxBerichten } from "@workspace/api-client-react";
import type { ToolboxBericht } from "@workspace/api-client-react";
import { Redirect, useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bovenInset } from "@/components/ui";
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
      style={({ pressed }) => ({
        backgroundColor: c.card,
        borderRadius: c.radius,
        borderWidth: 1,
        borderColor: uitgevouwen ? c.primary : c.border,
        padding: 18,
        opacity: pressed ? 0.88 : 1,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.foreground, fontSize: 15, fontFamily: "Inter_700Bold", lineHeight: 21 }}>
            {bericht.titel}
          </Text>
          {bericht.gepubliceerd_op && (
            <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3 }}>
              {datumLabel(bericht.gepubliceerd_op)}
            </Text>
          )}
        </View>
        <Text style={{ color: c.primary, fontSize: 18, fontFamily: "Inter_600SemiBold", lineHeight: 24 }}>
          {uitgevouwen ? "−" : "+"}
        </Text>
      </View>

      {!uitgevouwen && bericht.inhoud ? (
        <Text
          style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 8, lineHeight: 19 }}
          numberOfLines={2}
        >
          {bericht.inhoud}
        </Text>
      ) : null}

      {uitgevouwen && bericht.inhoud ? (
        <Text
          style={{ color: c.foreground, fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 10, lineHeight: 22 }}
        >
          {bericht.inhoud}
        </Text>
      ) : null}
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
      <View style={{ backgroundColor: c.dark, paddingTop: bovenInset(insets) + 12, paddingHorizontal: 20, paddingBottom: 18 }}>
        <View style={{ width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
          <Pressable onPress={() => router.back()} style={{ marginBottom: 10 }}>
            <Text style={{ color: c.primary, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>‹ Terug</Text>
          </Pressable>
          <Text style={{ color: c.darkForeground, fontSize: 20, fontFamily: "Inter_700Bold" }}>Kennisbank</Text>
          <Text style={{ color: c.darkMuted, fontSize: 13, marginTop: 2, fontFamily: "Inter_400Regular" }}>
            Werkafspraken, handboeken en toolboxen
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          gap: 12,
          paddingBottom: insets.bottom + 32,
          width: "100%",
          maxWidth: leesMaxBreedte,
          alignSelf: "center",
        }}
      >
        {/* Vaste kennisartikelen — altijd aanwezig, geen API-afhankelijkheid */}
        <Text style={{ color: c.mutedForeground, fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
          Vaste artikelen
        </Text>
        {vasteArtikelen.map((a) => (
          <View
            key={a.titel}
            style={{ backgroundColor: c.card, borderRadius: c.radius, borderWidth: 1, borderColor: c.border, padding: 16 }}
          >
            <Text style={{ color: c.foreground, fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 6 }}>{a.titel}</Text>
            <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 }}>{a.inhoud}</Text>
          </View>
        ))}

        {/* Toolbox berichten vanuit de beheeromgeving */}
        {zichtbaar.length > 0 && (
          <Text style={{ color: c.mutedForeground, fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 8, marginBottom: 4 }}>
            Toolbox
          </Text>
        )}
        {isLoading ? (
          <ActivityIndicator size="large" color={c.primary} style={{ marginTop: 16 }} />
        ) : (
          zichtbaar.map((b) => <BerichtKaart key={b.id} bericht={b} c={c} />)
        )}
      </ScrollView>
    </View>
  );
}
