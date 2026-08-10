import {
  useListArtikelen,
  useListLeveranciers,
  useListVoorraadTotaal,
  useCreateMagazijnBestelbon,
} from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import { ruimte } from "@workspace/ontwerp";
import { Redirect, useRouter } from "expo-router";
import React, { useState, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Kaart,
  Ladenstaat,
  LegeStaat,
  Waarschuwvlak,
  bovenInset,
  tekstStijl,
} from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { BevoegdheidGuard } from "@/components/BevoegdheidGuard";

const EENHEID_LABELS: Record<string, string> = {
  st: "stuks", m: "meter", m2: "m\u00b2", m3: "m\u00b3",
  uur: "uur", kg: "kg", set: "set",
};
function eenheidLabel(e: string | null | undefined) {
  return e ? (EENHEID_LABELS[e] ?? e) : "";
}

type BestelRegel = { artikel_id: number; hoeveelheid: string; naam: string; eenheid: string; vrij: number; gewenst: number };
type LeverancierGroep = { leverancier_id: number | null; leverancier_naam: string; email: string | null; regels: BestelRegel[] };

function MagazijnInkoopScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [notities, setNotities] = useState("");
  const [bezigId, setBezigId] = useState<number | null | "all">(null);

  const createBestelbon = useCreateMagazijnBestelbon();

  const { data: artikelenData = [], isLoading: artikelenLaden } = useListArtikelen({ actief: true });
  const { data: voorraadData = [], isLoading: voorraadLaden } = useListVoorraadTotaal();
  const { data: leveranciersData = [] } = useListLeveranciers();

  const leveranciersMap = new Map(
    (leveranciersData as Array<{ id: number; naam: string; email: string | null }>).map((l) => [l.id, l])
  );

  const artikelen = artikelenData as unknown as Array<{
    id: number; naam: string; eenheid: string;
    leverancier_id: number | null | undefined;
    leverancier_naam: string | null | undefined;
    minimum_voorraad: number | null | undefined;
    gewenste_voorraad: number | null | undefined;
  }>;

  const voorraadMap = new Map(voorraadData.map((v) => [v.artikel_id, v]));

  const [hoeveelheden, setHoeveelheden] = useState<Record<number, string>>({});

  const groepen = useMemo<LeverancierGroep[]>(() => {
    const onderMinimum = artikelen.filter((a) => {
      const v = voorraadMap.get(a.id);
      return v?.onder_minimum === true;
    });

    const groepMap = new Map<number | null, LeverancierGroep>();

    for (const art of onderMinimum) {
      const v = voorraadMap.get(art.id);
      const vrij = v?.vrij ?? 0;
      const gewenst = art.gewenste_voorraad ?? art.minimum_voorraad ?? 0;
      const tekort = Math.max(0, gewenst - vrij);

      const leverancierId = art.leverancier_id ?? null;
      let groep = groepMap.get(leverancierId);

      if (!groep) {
        const lev = leverancierId ? leveranciersMap.get(leverancierId) : null;
        groep = {
          leverancier_id: leverancierId,
          leverancier_naam: lev?.naam ?? art.leverancier_naam ?? "Onbekende leverancier",
          email: lev?.email ?? null,
          regels: [],
        };
        groepMap.set(leverancierId, groep);
      }

      groep.regels.push({
        artikel_id: art.id,
        hoeveelheid: String(tekort > 0 ? tekort : 1),
        naam: art.naam,
        eenheid: art.eenheid,
        vrij: Number(vrij.toFixed(2)),
        gewenst,
      });
    }

    return [...groepMap.values()].sort((a, b) => a.leverancier_naam.localeCompare(b.leverancier_naam, "nl"));
  }, [artikelen, voorraadData, leveranciersMap]);

  if (!token) return <Redirect href="/login" />;
  const isLoading = artikelenLaden || voorraadLaden;

  function setHoeveelheid(artikelId: number, waarde: string) {
    setHoeveelheden((prev) => ({ ...prev, [artikelId]: waarde }));
  }

  function getHoeveelheid(regel: BestelRegel): string {
    return hoeveelheden[regel.artikel_id] ?? regel.hoeveelheid;
  }

  async function verstuurGroep(groep: LeverancierGroep) {
    const regels = groep.regels.map((r) => ({
      artikel_id: r.artikel_id,
      hoeveelheid: parseFloat((hoeveelheden[r.artikel_id] ?? r.hoeveelheid).replace(",", ".")) || 1,
    }));

    setBezigId(groep.leverancier_id);
    try {
      const resultaat = await createBestelbon.mutateAsync({
        data: {
          leverancier_id: groep.leverancier_id,
          notities: notities || undefined,
          verstuur_email: !!groep.email,
          regels,
        },
      });
      Alert.alert(
        "Bestelbon verstuurd",
        resultaat.bericht ?? "Bestelbon aangemaakt.",
        [{ text: "OK" }],
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Probeer het opnieuw.";
      Alert.alert("Fout", msg);
    } finally {
      setBezigId(null);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ flex: 1 }}>
        <View
          style={{
            backgroundColor: c.dark,
            paddingTop: bovenInset(insets) + ruimte.m,
            paddingHorizontal: ruimte.l + ruimte.xs,
            paddingBottom: ruimte.l + 2,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.m }}>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="arrow-back" size={ruimte.xl} color={c.darkForeground} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={tekstStijl("sectiekop", c.darkForeground)}>
                Inkoop aanvragen
              </Text>
              <Text style={[tekstStijl("klein", c.darkMuted), { marginTop: 1 }]}>
                Artikelen onder minimumvoorraad
              </Text>
            </View>
          </View>
        </View>

        {isLoading ? (
          <View style={{ flex: 1, padding: ruimte.l }}>
            <Ladenstaat regels={5} />
          </View>
        ) : groepen.length === 0 ? (
          <LegeStaat
            icoon="checkmark-circle-outline"
            titel="Voorraad op orde"
            beschrijving="Er zijn geen artikelen onder het minimumvoorraadniveau."
          />
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: ruimte.l, gap: ruimte.l, paddingBottom: insets.bottom + ruimte.xl }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Waarschuwvlak
              tekst={`${groepen.reduce((s, g) => s + g.regels.length, 0)} artikel${groepen.reduce((s, g) => s + g.regels.length, 0) !== 1 ? "en" : ""} staan onder minimumvoorraad. Pas de aantallen aan en verstuur de bestelbon.`}
            />

            <View>
              <Text style={[tekstStijl("bijschrift", c.mutedForeground), { textTransform: "uppercase", letterSpacing: 0.5, marginBottom: ruimte.xs + 2 }]}>
                Opmerkingen (optioneel)
              </Text>
              <TextInput
                value={notities}
                onChangeText={setNotities}
                placeholder="Bijzonderheden voor de leverancier..."
                placeholderTextColor={c.mutedForeground}
                multiline
                numberOfLines={2}
                style={[
                  tekstStijl("klein", c.foreground),
                  {
                    borderWidth: 1,
                    borderColor: c.border,
                    borderRadius: c.radius,
                    padding: ruimte.m,
                    backgroundColor: c.card,
                    minHeight: ruimte.xxl + ruimte.xl,
                    textAlignVertical: "top",
                  },
                ]}
              />
            </View>

            {groepen.map((groep) => (
              <Kaart
                key={String(groep.leverancier_id)}
                stijl={{ padding: 0, overflow: "hidden" }}
              >
                <View
                  style={{
                    backgroundColor: c.muted,
                    paddingHorizontal: ruimte.l,
                    paddingVertical: ruimte.m,
                    borderBottomWidth: 1,
                    borderBottomColor: c.border,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: ruimte.s + 2,
                  }}
                >
                  <View
                    style={{
                      width: ruimte.xxl,
                      height: ruimte.xxl,
                      borderRadius: c.radius / 2,
                      backgroundColor: c.accent,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="business-outline" size={ruimte.l + 2} color={c.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={tekstStijl("nadruk", c.foreground)}>
                      {groep.leverancier_naam}
                    </Text>
                    {groep.email ? (
                      <Text style={tekstStijl("klein", c.mutedForeground)}>
                        {groep.email}
                      </Text>
                    ) : (
                      <Text style={tekstStijl("klein", c.warning)}>
                        Geen e-mailadres — bestelbon intern opgeslagen
                      </Text>
                    )}
                  </View>
                </View>

                {groep.regels.map((regel) => (
                  <View
                    key={regel.artikel_id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: ruimte.l,
                      paddingVertical: ruimte.m,
                      borderBottomWidth: 1,
                      borderBottomColor: c.border,
                      gap: ruimte.m,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={tekstStijl("nadruk", c.foreground)}>
                        {regel.naam}
                      </Text>
                      <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 2 }]}>
                        Vrij: {regel.vrij} {eenheidLabel(regel.eenheid)} · Gewenst: {regel.gewenst}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.s }}>
                      <TextInput
                        value={getHoeveelheid(regel)}
                        onChangeText={(v) => setHoeveelheid(regel.artikel_id, v)}
                        keyboardType="decimal-pad"
                        style={[
                          tekstStijl("nadruk", c.foreground),
                          {
                            width: ruimte.xxl * 2,
                            borderWidth: 1,
                            borderColor: c.border,
                            borderRadius: c.radius / 2,
                            paddingHorizontal: ruimte.s,
                            paddingVertical: ruimte.xs + 2,
                            backgroundColor: c.muted,
                            textAlign: "center",
                          },
                        ]}
                      />
                      <Text style={tekstStijl("klein", c.mutedForeground)}>
                        {eenheidLabel(regel.eenheid)}
                      </Text>
                    </View>
                  </View>
                ))}

                <Pressable
                  onPress={() => verstuurGroep(groep)}
                  disabled={bezigId === groep.leverancier_id}
                  style={({ pressed }) => ({
                    margin: ruimte.m,
                    paddingVertical: ruimte.m,
                    borderRadius: c.radius,
                    backgroundColor:
                      bezigId === groep.leverancier_id ? c.muted : c.primary,
                    opacity: pressed && bezigId !== groep.leverancier_id ? 0.85 : 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: ruimte.s,
                  })}
                >
                  {bezigId === groep.leverancier_id ? (
                    <ActivityIndicator size="small" color={c.primaryForeground} />
                  ) : (
                    <Ionicons
                      name={groep.email ? "mail-outline" : "save-outline"}
                      size={ruimte.l + 2}
                      color={c.primaryForeground}
                    />
                  )}
                  <Text style={tekstStijl("nadruk", c.primaryForeground)}>
                    {bezigId === groep.leverancier_id
                      ? "Versturen..."
                      : groep.email
                      ? `Bestelbon versturen (${groep.regels.length} art.)`
                      : `Bestelbon opslaan (${groep.regels.length} art.)`}
                  </Text>
                </Pressable>
              </Kaart>
            ))}
          </ScrollView>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// APP_01 §3.3 — schermbescherming: nette weigering zonder bevoegdheid
// (backendroute eist magazijn niveau 3; gemeten, zie docs/metingen).
export default function MagazijnInkoopSchermBeveiligd() {
  return (
    <BevoegdheidGuard vereiste={{ module: "magazijn", niveau: 3 }}>
      <MagazijnInkoopScherm />
    </BevoegdheidGuard>
  );
}
