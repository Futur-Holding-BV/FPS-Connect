import { API_DOMEIN } from "@/lib/apiDomein";
import { useListLabels } from "@workspace/api-client-react";
import { Redirect, useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Image, Linking, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ruimte } from "@workspace/ontwerp";

import { ChipRij, Ladenstaat, LegeStaat, TekstVeld, tekstStijl, bovenInset, onderInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";

const DOMEIN = API_DOMEIN;
const GEEN_FABRIKANT = "__geen__";

function Badge({ tekst, kleur, achtergrond }: { tekst: string; kleur: string; achtergrond: string }) {
  const c = useColors();
  return (
    <View
      style={{
        backgroundColor: achtergrond,
        borderRadius: c.radius / 2,
        paddingHorizontal: ruimte.s,
        paddingVertical: ruimte.xs - 1,
      }}
    >
      <Text style={tekstStijl("bijschrift", kleur)}>{tekst}</Text>
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
    { waarde: GEEN_FABRIKANT, label: "Alle" },
    ...fabrikantNamen.map((naam) => ({ waarde: naam, label: naam })),
  ];

  const bezig = laadLabels;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={{
          backgroundColor: c.dark,
          paddingTop: bovenInset(insets) + ruimte.m,
          paddingHorizontal: ruimte.xl,
          paddingBottom: ruimte.l,
        }}
      >
        <Pressable onPress={() => router.back()} style={{ marginBottom: ruimte.s }}>
          <Text style={tekstStijl("nadruk", c.primary)}>
            ‹ Terug
          </Text>
        </Pressable>
        <Text style={tekstStijl("schermtitel", c.darkForeground)}>
          Fabrikanten
        </Text>
        <Text
          style={[tekstStijl("klein", c.darkMuted), { marginTop: ruimte.xs }]}
        >
          Productselectie en testnormen
        </Text>
      </View>

      <View style={{ paddingHorizontal: ruimte.l, paddingTop: ruimte.m + 2, gap: ruimte.m }}>
        <TekstVeld
          label="Zoeken"
          value={zoek}
          onChangeText={setZoek}
          placeholder="Zoek op product, type of testnorm"
          autoCapitalize="none"
        />
        <ChipRij
          opties={chipOpties}
          geselecteerd={fabNaam ?? GEEN_FABRIKANT}
          onKies={(w) => setFabNaam(w === GEEN_FABRIKANT ? null : w)}
        />
      </View>

      {bezig ? (
        <View style={{ padding: ruimte.l }}>
          <Ladenstaat regels={6} />
        </View>
      ) : (
        <FlatList
          data={producten}
          keyExtractor={(l) => String(l.id)}
          contentContainerStyle={{
            padding: ruimte.l,
            paddingBottom: onderInset(insets) + ruimte.xl,
            gap: ruimte.s + 2,
          }}
          scrollEnabled={producten.length > 0}
          ListEmptyComponent={
            <LegeStaat
              icoon="cube-outline"
              titel="Geen producten gevonden"
              beschrijving="Pas de zoekopdracht of het fabrikantenfilter aan."
            />
          }
          renderItem={({ item }) => (
            <View
              style={{
                backgroundColor: c.card,
                borderRadius: c.radius,
                borderWidth: 1,
                borderColor: c.border,
                padding: ruimte.l,
                gap: ruimte.s + 2,
              }}
            >
              <View style={{ flexDirection: "row", gap: ruimte.m }}>
                {item.product_foto_url && item.product_foto_geverifieerd ? (
                  <Image
                    source={{
                      uri: `https://${DOMEIN}/api/storage${item.product_foto_url}`,
                      headers: { Authorization: `Bearer ${token}` },
                    }}
                    style={{
                      width: ruimte.xxl + ruimte.xl,
                      height: ruimte.xxl + ruimte.xl,
                      borderRadius: c.radius / 2,
                      backgroundColor: c.secondary,
                    }}
                    resizeMode="cover"
                  />
                ) : null}
                <View style={{ flex: 1, gap: ruimte.xs }}>
                  <Text
                    style={tekstStijl("nadruk", c.foreground)}
                  >
                    {item.naam}
                  </Text>
                  {item.fabrikant ? (
                    <Text
                      style={tekstStijl("standaard", c.mutedForeground)}
                    >
                      {item.fabrikant}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: ruimte.s }}>
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
                  style={{ flexDirection: "row", alignItems: "center", paddingTop: ruimte.xs / 2 }}
                >
                  <Text
                    style={tekstStijl("standaard", c.primary)}
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
