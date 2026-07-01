import {
  useListArtikelen,
  useListLeveranciers,
  useListVoorraadTotaal,
  useCreateMagazijnBestelbon,
} from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
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

import { bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";

const EENHEID_LABELS: Record<string, string> = {
  st: "stuks", m: "meter", m2: "m\u00b2", m3: "m\u00b3",
  uur: "uur", kg: "kg", set: "set",
};
function eenheidLabel(e: string | null | undefined) {
  return e ? (EENHEID_LABELS[e] ?? e) : "";
}

type BestelRegel = { artikel_id: number; hoeveelheid: string; naam: string; eenheid: string; vrij: number; gewenst: number };
type LeverancierGroep = { leverancier_id: number | null; leverancier_naam: string; email: string | null; regels: BestelRegel[] };

export default function MagazijnInkoopScherm() {
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
      style={{ flex: 1, backgroundColor: "#f3f4f6" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ flex: 1 }}>
        <View
          style={{
            backgroundColor: "#212631",
            paddingTop: bovenInset(insets) + 12,
            paddingHorizontal: 20,
            paddingBottom: 18,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" }}>
                Inkoop aanvragen
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 }}>
                Artikelen onder minimumvoorraad
              </Text>
            </View>
          </View>
        </View>

        {isLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator size="large" color="#F23B0D" />
            <Text style={{ marginTop: 12, color: "#6b7280", fontFamily: "Inter_400Regular" }}>
              Voorraadstatus laden...
            </Text>
          </View>
        ) : groepen.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
            <Ionicons name="checkmark-circle-outline" size={56} color="#16a34a" />
            <Text style={{ marginTop: 16, fontSize: 17, fontFamily: "Inter_700Bold", color: "#111827", textAlign: "center" }}>
              Voorraad op orde
            </Text>
            <Text style={{ marginTop: 8, fontSize: 14, color: "#6b7280", fontFamily: "Inter_400Regular", textAlign: "center" }}>
              Er zijn geen artikelen onder het minimumvoorraadniveau.
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View
              style={{
                backgroundColor: "#fef3c7",
                borderRadius: 10,
                padding: 12,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Ionicons name="warning-outline" size={18} color="#d97706" />
              <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: "#92400e" }}>
                {groepen.reduce((s, g) => s + g.regels.length, 0)} artikel{groepen.reduce((s, g) => s + g.regels.length, 0) !== 1 ? "en" : ""} staan onder minimumvoorraad. Pas de aantallen aan en verstuur de bestelbon.
              </Text>
            </View>

            <View>
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                Opmerkingen (optioneel)
              </Text>
              <TextInput
                value={notities}
                onChangeText={setNotities}
                placeholder="Bijzonderheden voor de leverancier..."
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={2}
                style={{
                  borderWidth: 1,
                  borderColor: "#e5e7eb",
                  borderRadius: 10,
                  padding: 12,
                  fontSize: 14,
                  fontFamily: "Inter_400Regular",
                  color: "#111827",
                  backgroundColor: "#fff",
                  minHeight: 60,
                  textAlignVertical: "top",
                }}
              />
            </View>

            {groepen.map((groep) => (
              <View
                key={String(groep.leverancier_id)}
                style={{
                  backgroundColor: "#fff",
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "#e5e7eb",
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    backgroundColor: "#f9fafb",
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: "#e5e7eb",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      backgroundColor: "#fff3ef",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="business-outline" size={18} color="#F23B0D" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#111827" }}>
                      {groep.leverancier_naam}
                    </Text>
                    {groep.email ? (
                      <Text style={{ fontSize: 12, color: "#6b7280", fontFamily: "Inter_400Regular" }}>
                        {groep.email}
                      </Text>
                    ) : (
                      <Text style={{ fontSize: 12, color: "#d97706", fontFamily: "Inter_400Regular" }}>
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
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: "#f3f4f6",
                      gap: 12,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#111827" }}>
                        {regel.naam}
                      </Text>
                      <Text style={{ fontSize: 12, color: "#6b7280", fontFamily: "Inter_400Regular", marginTop: 2 }}>
                        Vrij: {regel.vrij} {eenheidLabel(regel.eenheid)} · Gewenst: {regel.gewenst}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <TextInput
                        value={getHoeveelheid(regel)}
                        onChangeText={(v) => setHoeveelheid(regel.artikel_id, v)}
                        keyboardType="decimal-pad"
                        style={{
                          width: 64,
                          borderWidth: 1,
                          borderColor: "#e5e7eb",
                          borderRadius: 8,
                          paddingHorizontal: 8,
                          paddingVertical: 6,
                          fontSize: 15,
                          fontFamily: "Inter_700Bold",
                          color: "#111827",
                          backgroundColor: "#f9fafb",
                          textAlign: "center",
                        }}
                      />
                      <Text style={{ fontSize: 12, color: "#6b7280", fontFamily: "Inter_400Regular" }}>
                        {eenheidLabel(regel.eenheid)}
                      </Text>
                    </View>
                  </View>
                ))}

                <Pressable
                  onPress={() => verstuurGroep(groep)}
                  disabled={bezigId === groep.leverancier_id}
                  style={({ pressed }) => ({
                    margin: 12,
                    paddingVertical: 12,
                    borderRadius: 10,
                    backgroundColor:
                      bezigId === groep.leverancier_id ? "#d1d5db" : (pressed ? "#c2360a" : "#F23B0D"),
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  })}
                >
                  {bezigId === groep.leverancier_id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons
                      name={groep.email ? "mail-outline" : "save-outline"}
                      size={18}
                      color="#fff"
                    />
                  )}
                  <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" }}>
                    {bezigId === groep.leverancier_id
                      ? "Versturen..."
                      : groep.email
                      ? `Bestelbon versturen (${groep.regels.length} art.)`
                      : `Bestelbon opslaan (${groep.regels.length} art.)`}
                  </Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
