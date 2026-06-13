import { useListLabels } from "@workspace/api-client-react";
import { Redirect, useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, FlatList, Linking, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChipRij, TekstVeld, bovenInset, onderInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";

function Badge({ tekst, kleur, achtergrond }: { tekst: string; kleur: string; achtergrond: string }) {
  return (
    <View
      style={{
        backgroundColor: achtergrond,
        borderRadius: 7,
        paddingHorizontal: 8,
        paddingVertical: 3,
      }}
    >
      <Text style={{ color: kleur, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{tekst}</Text>
    </View>
  );
}

export default function FabrikantenScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { data: labels, isLoading: laadLabels } = useListLabels();

  const [zoek, setZoek] = useState("");
  const [fabNaam, setFabNaam] = useState<string | null>(null);

  if (!token) return <Redirect href="/login" />;

  const actieveLabels = (labels ?? []).filter((l) => !l.gearchiveerd);

  // De fabrikantfilter leiden we af uit de fabrikantnamen die daadwerkelijk op de
  // producten staan, zodat elke getoonde fabrikant ook producten bevat.
  const fabrikantNamen = Array.from(
    new Set(
      actieveLabels.map((l) => (l.fabrikant ?? "").trim()).filter((naam) => naam.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b, "nl"));

  const producten = actieveLabels.filter((l) => {
    if (fabNaam != null && (l.fabrikant ?? "").trim() !== fabNaam) return false;
    if (!zoek.trim()) return true;
    const q = zoek.toLowerCase();
    return (
      l.naam.toLowerCase().includes(q) ||
      (l.type_code ?? "").toLowerCase().includes(q) ||
      (l.testnorm ?? "").toLowerCase().includes(q) ||
      (l.fabrikant ?? "").toLowerCase().includes(q)
    );
  });

  const chipOpties = [
    { waarde: "", label: "Alle" },
    ...fabrikantNamen.map((naam) => ({ waarde: naam, label: naam })),
  ];

  const bezig = laadLabels;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={{
          backgroundColor: c.dark,
          paddingTop: bovenInset(insets) + 12,
          paddingHorizontal: 20,
          paddingBottom: 16,
        }}
      >
        <Pressable onPress={() => router.back()} style={{ marginBottom: 10 }}>
          <Text style={{ color: c.primary, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>
            ‹ Terug
          </Text>
        </Pressable>
        <Text style={{ color: c.darkForeground, fontSize: 22, fontFamily: "Inter_700Bold" }}>
          Fabrikanten
        </Text>
        <Text
          style={{
            color: c.darkMuted,
            fontSize: 14,
            marginTop: 4,
            fontFamily: "Inter_400Regular",
          }}
        >
          Productselectie en testnormen
        </Text>
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 14, gap: 12 }}>
        <TekstVeld
          label="Zoeken"
          value={zoek}
          onChangeText={setZoek}
          placeholder="Zoek op product, type of testnorm"
          autoCapitalize="none"
        />
        <ChipRij
          opties={chipOpties}
          geselecteerd={fabNaam ?? ""}
          onKies={(w) => setFabNaam(w === "" ? null : w)}
        />
      </View>

      {bezig ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : (
        <FlatList
          data={producten}
          keyExtractor={(l) => String(l.id)}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: onderInset(insets) + 24,
            gap: 10,
          }}
          scrollEnabled={producten.length > 0}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 48, gap: 8 }}>
              <Text style={{ color: c.foreground, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>
                Geen producten gevonden
              </Text>
              <Text
                style={{
                  color: c.mutedForeground,
                  fontSize: 14,
                  fontFamily: "Inter_400Regular",
                  textAlign: "center",
                }}
              >
                Pas de zoekopdracht of het fabrikantenfilter aan.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View
              style={{
                backgroundColor: c.card,
                borderRadius: c.radius,
                borderWidth: 1,
                borderColor: c.border,
                padding: 16,
                gap: 10,
              }}
            >
              <Text style={{ color: c.foreground, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>
                {item.naam}
              </Text>
              {item.fabrikant ? (
                <Text
                  style={{
                    color: c.mutedForeground,
                    fontSize: 14,
                    fontFamily: "Inter_400Regular",
                  }}
                >
                  {item.fabrikant}
                </Text>
              ) : null}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {item.type_code ? (
                  <Badge tekst={item.type_code} kleur={c.accentForeground} achtergrond={c.accent} />
                ) : null}
                {item.testnorm ? (
                  <Badge
                    tekst={item.testnorm}
                    kleur={c.secondaryForeground}
                    achtergrond={c.secondary}
                  />
                ) : null}
              </View>
              {item.fabrikant_url ? (
                <Pressable
                  onPress={() => {
                    const ruw = (item.fabrikant_url ?? "").trim();
                    if (!ruw) return;
                    const adres = /^https?:\/\//i.test(ruw) ? ruw : `https://${ruw}`;
                    Linking.openURL(adres).catch(() => {});
                  }}
                  hitSlop={8}
                  style={{ flexDirection: "row", alignItems: "center", paddingTop: 2 }}
                >
                  <Text
                    style={{
                      color: c.primary,
                      fontSize: 14,
                      fontFamily: "Inter_600SemiBold",
                    }}
                  >
                    Website leverancier ›
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}
