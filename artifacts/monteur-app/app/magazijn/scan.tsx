import {
  listArtikelen,
  useCreateMagazijnVerplaatsing,
  useCreateRetour,
  useCreateUitgifte,
  useGetMagazijnArtikel,
  useListArtikelen,
  useListMagazijnLocaties,
  useListOpdrachten,
  useListVoorraadTotaal,
  getListArtikelenQueryKey,
} from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import { ruimte } from "@workspace/ontwerp";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useRef, useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Kaart, bovenInset, tekstStijl } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import * as offlineCache from "@/lib/offlineCache";
import { voegToeAanWachtrij } from "@/lib/syncQueue";
import { useOffline } from "@/context/offline";
import { BevoegdheidGuard } from "@/components/BevoegdheidGuard";

type Modus = "scan" | "resultaat";
type Actie = "uitgifte" | "retour" | "verplaatsen";
type PickerType = "opdracht" | "van_locatie" | "naar_locatie";

const EENHEID_LABELS: Record<string, string> = {
  st: "stuks", m: "meter", m2: "m\u00b2", m3: "m\u00b3",
  uur: "uur", kg: "kg", set: "set",
};
function eenheidLabel(e: string | null | undefined) {
  return e ? (EENHEID_LABELS[e] ?? e) : "";
}

type LocatieItem = { id: number; naam: string; type: string; actief: boolean };
type OpdrachtItem = { id: number; titel: string; werknummer?: string | null; status: string; gebouw_naam?: string | null };

function PickerModal({
  zichtbaar,
  onSluit,
  titel,
  items,
  onKies,
  gekozenId,
  leegLabel,
}: {
  zichtbaar: boolean;
  onSluit: () => void;
  titel: string;
  items: { id: number | null; label: string; subtitel?: string }[];
  onKies: (id: number | null, label: string) => void;
  gekozenId: number | null;
  leegLabel?: string;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={zichtbaar} transparent animationType="slide" onRequestClose={onSluit}>
      <Pressable style={{ flex: 1, backgroundColor: c.dark + "73" }} onPress={onSluit} />
      <View
        style={{
          backgroundColor: c.card,
          borderTopLeftRadius: c.radius + ruimte.xs,
          borderTopRightRadius: c.radius + ruimte.xs,
          paddingBottom: insets.bottom + ruimte.s,
          maxHeight: "70%",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: ruimte.l + ruimte.xs,
            paddingVertical: ruimte.l,
            borderBottomWidth: 1,
            borderBottomColor: c.border,
          }}
        >
          <Text style={tekstStijl("sectiekop", c.foreground)}>{titel}</Text>
          <Pressable onPress={onSluit} hitSlop={12}>
            <Ionicons name="close" size={ruimte.xl} color={c.mutedForeground} />
          </Pressable>
        </View>
        <FlatList
          data={leegLabel ? [{ id: null, label: leegLabel }, ...items] : items}
          keyExtractor={(item) => String(item.id)}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => { onKies(item.id as number | null, item.label); onSluit(); }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: ruimte.l + ruimte.xs,
                paddingVertical: ruimte.m + 2,
                backgroundColor: pressed ? c.muted : c.card,
                borderBottomWidth: 1,
                borderBottomColor: c.border,
                gap: ruimte.m,
              })}
            >
              <View style={{ flex: 1 }}>
                <Text style={tekstStijl("nadruk", c.foreground)}>
                  {item.label}
                </Text>
                {item.subtitel ? (
                  <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 1 }]}>
                    {item.subtitel}
                  </Text>
                ) : null}
              </View>
              {gekozenId === item.id ? (
                <Ionicons name="checkmark-circle" size={ruimte.l + ruimte.xs} color={c.primary} />
              ) : null}
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

function KeuzeBalk({
  label,
  waarde,
  placeholder,
  onPress,
  verplicht,
}: {
  label: string;
  waarde: string | null;
  placeholder: string;
  onPress: () => void;
  verplicht?: boolean;
}) {
  const c = useColors();
  return (
    <View style={{ marginBottom: ruimte.l }}>
      <Text
        style={[
          tekstStijl("bijschrift", c.mutedForeground),
          { textTransform: "uppercase", letterSpacing: 0.5, marginBottom: ruimte.xs + 2 },
        ]}
      >
        {label}
        {verplicht ? (
          <Text style={{ color: c.destructive }}> *</Text>
        ) : (
          <Text style={{ color: c.mutedForeground }}> (optioneel)</Text>
        )}
      </Text>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 1,
          borderColor: waarde ? c.primary : c.border,
          borderRadius: c.radius,
          paddingHorizontal: ruimte.m + 2,
          paddingVertical: ruimte.m,
          backgroundColor: pressed ? c.muted : (waarde ? c.accent : c.card),
          gap: ruimte.s + 2,
        })}
      >
        <Text
          style={[
            tekstStijl(waarde ? "nadruk" : "standaard", waarde ? c.foreground : c.mutedForeground),
            { flex: 1 },
          ]}
          numberOfLines={1}
        >
          {waarde ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={ruimte.l + 2} color={c.mutedForeground} />
      </Pressable>
    </View>
  );
}

function ArtikelKaart({
  artikelId,
  onSluit,
}: {
  artikelId: number;
  onSluit: () => void;
}) {
  const c = useColors();
  const { isOnline } = useOffline();
  const uitgifte = useCreateUitgifte();
  const retour = useCreateRetour();
  const verplaatsen = useCreateMagazijnVerplaatsing();
  const { data: artikel, isLoading: artikelLaden } = useGetMagazijnArtikel(artikelId);
  const { data: voorraadLijst } = useListVoorraadTotaal();
  const { data: locatiesRaw } = useListMagazijnLocaties();
  const { data: opdrachtenRaw } = useListOpdrachten({ status: "actief" } as Parameters<typeof useListOpdrachten>[0]);

  const locaties = ((locatiesRaw ?? []) as LocatieItem[]).filter((l) => l.actief);
  const opdrachten = (opdrachtenRaw ?? []) as OpdrachtItem[];

  const [actie, setActie] = useState<Actie>("uitgifte");
  const [hoeveelheid, setHoeveelheid] = useState("1");
  const [bezig, setBezig] = useState(false);
  const [pickerType, setPickerType] = useState<PickerType | null>(null);

  const [opdrachtId, setOpdrachtId] = useState<number | null>(null);
  const [opdrachtNaam, setOpdrachtNaam] = useState<string | null>(null);
  const [vanLocatieId, setVanLocatieId] = useState<number | null>(null);
  const [vanLocatieNaam, setVanLocatieNaam] = useState<string | null>(null);
  const [naarLocatieId, setNaarLocatieId] = useState<number | null>(null);
  const [naarLocatieNaam, setNaarLocatieNaam] = useState<string | null>(null);

  const voorraad = voorraadLijst?.find((v) => v.artikel_id === artikelId);
  const vrij = voorraad?.vrij ?? null;

  const locatieItems = locaties.map((l) => ({
    id: l.id,
    label: l.naam,
    subtitel: l.type,
  }));
  const opdrachtItems = opdrachten.map((o) => ({
    id: o.id,
    label: o.werknummer ? `${o.werknummer} — ${o.titel}` : o.titel,
    subtitel: o.gebouw_naam ?? undefined,
  }));

  async function verwerken() {
    const aantal = parseFloat(hoeveelheid.replace(",", "."));
    if (!aantal || aantal <= 0) {
      Alert.alert("Ongeldige hoeveelheid", "Voer een hoeveelheid groter dan 0 in.");
      return;
    }
    if (actie === "verplaatsen" && !naarLocatieId) {
      Alert.alert("Naar-locatie vereist", "Selecteer een locatie om naar te verplaatsen.");
      return;
    }

    setBezig(true);
    try {
      if (isOnline) {
        if (actie === "uitgifte") {
          await uitgifte.mutateAsync({
            data: {
              opdracht_id: opdrachtId,
              regels: [{ artikel_id: artikelId, hoeveelheid: aantal, locatie_id: vanLocatieId }],
            },
          });
          Alert.alert(
            "Uitgifte geregistreerd",
            `${aantal} ${eenheidLabel(artikel?.eenheid)} "${artikel?.naam}" uitgeleverd.${opdrachtNaam ? `\nOpdracht: ${opdrachtNaam}` : ""}`,
            [{ text: "OK", onPress: onSluit }],
          );
        } else if (actie === "retour") {
          await retour.mutateAsync({
            data: {
              opdracht_id: opdrachtId,
              regels: [{ artikel_id: artikelId, hoeveelheid: aantal, locatie_id: naarLocatieId, conditie: "goed" }],
            },
          });
          Alert.alert(
            "Retour geregistreerd",
            `${aantal} ${eenheidLabel(artikel?.eenheid)} "${artikel?.naam}" ingenomen.`,
            [{ text: "OK", onPress: onSluit }],
          );
        } else {
          await verplaatsen.mutateAsync({
            data: {
              artikel_id: artikelId,
              hoeveelheid: aantal,
              van_locatie_id: vanLocatieId,
              naar_locatie_id: naarLocatieId!,
              omschrijving: `Verplaatsing${vanLocatieNaam ? ` van ${vanLocatieNaam}` : ""}${naarLocatieNaam ? ` naar ${naarLocatieNaam}` : ""}`,
            },
          });
          Alert.alert(
            "Verplaatsing geregistreerd",
            `${aantal} ${eenheidLabel(artikel?.eenheid)} "${artikel?.naam}" verplaatst naar ${naarLocatieNaam ?? "nieuwe locatie"}.`,
            [{ text: "OK", onPress: onSluit }],
          );
        }
      } else {
        // Offline modus: voeg toe aan SyncQueue
        if (actie === "uitgifte") {
          await voegToeAanWachtrij({
            type: "create_uitgifte",
            payload: {
              opdracht_id: opdrachtId,
              regels: [{ artikel_id: artikelId, hoeveelheid: aantal, locatie_id: vanLocatieId }],
            },
          });
          Alert.alert(
            "Offline opgeslagen",
            `De uitgifte van ${aantal} ${eenheidLabel(artikel?.eenheid)} "${artikel?.naam}" is lokaal opgeslagen en wordt gesynchroniseerd zodra er weer verbinding is.`,
            [{ text: "OK", onPress: onSluit }],
          );
        } else if (actie === "retour") {
          await voegToeAanWachtrij({
            type: "create_retour",
            payload: {
              opdracht_id: opdrachtId,
              regels: [{ artikel_id: artikelId, hoeveelheid: aantal, locatie_id: naarLocatieId, conditie: "goed" }],
            },
          });
          Alert.alert(
            "Offline opgeslagen",
            `De retour van ${aantal} ${eenheidLabel(artikel?.eenheid)} "${artikel?.naam}" is lokaal opgeslagen en wordt gesynchroniseerd zodra er weer verbinding is.`,
            [{ text: "OK", onPress: onSluit }],
          );
        } else {
          Alert.alert("Offline niet mogelijk", "Verplaatsingen kunnen momenteel alleen online worden geregistreerd.");
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Controleer je verbinding en probeer het opnieuw.";
      Alert.alert("Fout", msg);
    } finally {
      setBezig(false);
    }
  }

  if (artikelLaden) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: ruimte.xxl }}>
        <ActivityIndicator size="large" color={c.primary} />
        <Text style={[tekstStijl("standaard", c.mutedForeground), { marginTop: ruimte.m }]}>
          Artikel ophalen...
        </Text>
      </View>
    );
  }

  if (!artikel) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: ruimte.xxl }}>
        <Text style={[tekstStijl("standaard", c.mutedForeground), { textAlign: "center" }]}>
          Artikelgegevens niet beschikbaar.
        </Text>
        <Pressable onPress={onSluit} style={{ marginTop: ruimte.l }}>
          <Text style={tekstStijl("nadruk", c.primary)}>Sluiten</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ padding: ruimte.l + ruimte.xs, paddingBottom: ruimte.xxl }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Artikelkaart */}
        <Kaart stijl={{ padding: ruimte.l + 2, marginBottom: ruimte.l }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: ruimte.m }}>
            <View
              style={{
                width: ruimte.xxl + ruimte.m,
                height: ruimte.xxl + ruimte.m,
                borderRadius: c.radius / 2,
                backgroundColor: c.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="cube-outline" size={ruimte.xl - 2} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[tekstStijl("sectiekop", c.foreground), { marginBottom: 2 }]}>
                {artikel.naam}
              </Text>
              {artikel.code ? (
                <Text style={tekstStijl("klein", c.mutedForeground)}>
                  Code: {artikel.code}
                </Text>
              ) : null}
              {artikel.categorie ? (
                <Text style={tekstStijl("klein", c.mutedForeground)}>
                  {artikel.categorie}
                </Text>
              ) : null}
            </View>
          </View>

          {artikel.omschrijving ? (
            <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: ruimte.m }]}>
              {artikel.omschrijving}
            </Text>
          ) : null}

          <View style={{ marginTop: ruimte.m + 2, flexDirection: "row", gap: ruimte.m, flexWrap: "wrap" }}>
            <View style={{ flex: 1, minWidth: 100, backgroundColor: c.muted, borderRadius: c.radius / 2, padding: ruimte.s + 2, alignItems: "center" }}>
              <Text style={[tekstStijl("bijschrift", c.mutedForeground), { textTransform: "uppercase", letterSpacing: 0.4, marginBottom: ruimte.xs }]}>
                Eenheid
              </Text>
              <Text style={tekstStijl("sectiekop", c.foreground)}>
                {eenheidLabel(artikel.eenheid)}
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                minWidth: 100,
                backgroundColor: c.muted,
                borderRadius: c.radius / 2,
                padding: ruimte.s + 2,
                alignItems: "center",
              }}
            >
              <Text style={[tekstStijl("bijschrift", c.mutedForeground), { textTransform: "uppercase", letterSpacing: 0.4, marginBottom: ruimte.xs }]}>
                Vrije voorraad
              </Text>
              <Text style={tekstStijl("sectiekop", vrij !== null && vrij <= (artikel.minimum_voorraad ?? 0) ? c.destructive : c.success)}>
                {vrij !== null ? `${vrij} ${eenheidLabel(artikel.eenheid)}` : "\u2014"}
              </Text>
            </View>
            {artikel.minimum_voorraad != null ? (
              <View style={{ flex: 1, minWidth: 100, backgroundColor: c.muted, borderRadius: c.radius / 2, padding: ruimte.s + 2, alignItems: "center" }}>
                <Text style={[tekstStijl("bijschrift", c.mutedForeground), { textTransform: "uppercase", letterSpacing: 0.4, marginBottom: ruimte.xs }]}>
                  Minimum
                </Text>
                <Text style={tekstStijl("sectiekop", c.foreground)}>
                  {artikel.minimum_voorraad} {eenheidLabel(artikel.eenheid)}
                </Text>
              </View>
            ) : null}
          </View>
        </Kaart>

        {/* Actie kiezer */}
        <Text style={[tekstStijl("klein", c.mutedForeground), { textTransform: "uppercase", letterSpacing: 0.5, marginBottom: ruimte.s + 2 }]}>
          Registreren als
        </Text>
        <View style={{ flexDirection: "row", gap: ruimte.s, marginBottom: ruimte.l }}>
          {(["uitgifte", "retour", "verplaatsen"] as Actie[]).map((a) => {
            const actief = actie === a;
            const icoon = a === "uitgifte" ? "arrow-up-circle-outline" : a === "retour" ? "arrow-down-circle-outline" : "swap-horizontal-outline";
            const label = a === "uitgifte" ? "Uitgifte" : a === "retour" ? "Retour" : "Verplaatsen";
            return (
              <Pressable
                key={a}
                onPress={() => setActie(a)}
                style={({ pressed }) => ({
                  flex: 1,
                  paddingVertical: ruimte.m,
                  borderRadius: c.radius,
                  alignItems: "center",
                  backgroundColor: actief ? c.primary : (pressed ? c.muted : c.card),
                  borderWidth: 1.5,
                  borderColor: actief ? c.primary : c.border,
                })}
              >
                <Ionicons name={icoon as "arrow-up-circle-outline"} size={ruimte.l + ruimte.xs} color={actief ? c.primaryForeground : c.mutedForeground} />
                <Text style={[tekstStijl("bijschrift", actief ? c.primaryForeground : c.foreground), { marginTop: ruimte.xs }]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Opdracht keuze (uitgifte + retour) */}
        {(actie === "uitgifte" || actie === "retour") && opdrachten.length > 0 && (
          <KeuzeBalk
            label="Opdracht"
            waarde={opdrachtNaam}
            placeholder="Kies een opdracht..."
            onPress={() => setPickerType("opdracht")}
          />
        )}

        {/* Van-locatie (uitgifte + verplaatsen) */}
        {(actie === "uitgifte" || actie === "verplaatsen") && locaties.length > 0 && (
          <KeuzeBalk
            label={actie === "verplaatsen" ? "Van locatie" : "Vanuit locatie"}
            waarde={vanLocatieNaam}
            placeholder="Kies een locatie..."
            onPress={() => setPickerType("van_locatie")}
            verplicht={actie === "verplaatsen"}
          />
        )}

        {/* Naar-locatie (retour + verplaatsen) */}
        {(actie === "retour" || actie === "verplaatsen") && locaties.length > 0 && (
          <KeuzeBalk
            label={actie === "verplaatsen" ? "Naar locatie" : "Terugplaatsen naar"}
            waarde={naarLocatieNaam}
            placeholder="Kies een locatie..."
            onPress={() => setPickerType("naar_locatie")}
            verplicht={actie === "verplaatsen"}
          />
        )}

        {/* Hoeveelheid */}
        <Text style={[tekstStijl("klein", c.mutedForeground), { textTransform: "uppercase", letterSpacing: 0.5, marginBottom: ruimte.s }]}>
          Hoeveelheid ({eenheidLabel(artikel.eenheid)})
        </Text>
        <TextInput
          value={hoeveelheid}
          onChangeText={setHoeveelheid}
          keyboardType="decimal-pad"
          placeholder="1"
          placeholderTextColor={c.mutedForeground}
          style={[
            tekstStijl("sectiekop", c.foreground),
            {
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: c.radius,
              paddingHorizontal: ruimte.m + 2,
              paddingVertical: ruimte.m,
              backgroundColor: c.card,
              marginBottom: ruimte.l,
              textAlign: "center",
            },
          ]}
        />

        {/* Bevestigen */}
        <Pressable
          onPress={verwerken}
          disabled={bezig}
          style={({ pressed }) => ({
            backgroundColor: bezig ? c.muted : c.primary,
            opacity: pressed && !bezig ? 0.85 : 1,
            borderRadius: c.radius,
            paddingVertical: ruimte.m + 3,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: ruimte.s,
            marginBottom: ruimte.m,
          })}
        >
          {bezig ? (
            <ActivityIndicator size="small" color={c.primaryForeground} />
          ) : (
            <>
              <Ionicons
                name={
                  actie === "uitgifte"
                    ? "arrow-up-circle"
                    : actie === "retour"
                    ? "arrow-down-circle"
                    : "swap-horizontal"
                }
                size={ruimte.l + ruimte.xs}
                color={c.primaryForeground}
              />
              <Text style={tekstStijl("sectiekop", c.primaryForeground)}>
                {actie === "uitgifte"
                  ? "Uitgifte bevestigen"
                  : actie === "retour"
                  ? "Retour bevestigen"
                  : "Verplaatsing bevestigen"}
              </Text>
            </>
          )}
        </Pressable>

        <Pressable
          onPress={onSluit}
          style={({ pressed }) => ({ paddingVertical: ruimte.m, alignItems: "center", opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={tekstStijl("nadruk", c.mutedForeground)}>
            Annuleren — terug naar scanner
          </Text>
        </Pressable>
      </ScrollView>

      {/* Picker modals */}
      <PickerModal
        zichtbaar={pickerType === "opdracht"}
        onSluit={() => setPickerType(null)}
        titel="Kies opdracht"
        items={opdrachtItems}
        onKies={(id, label) => { setOpdrachtId(id); setOpdrachtNaam(id ? label : null); }}
        gekozenId={opdrachtId}
        leegLabel="Geen opdracht"
      />
      <PickerModal
        zichtbaar={pickerType === "van_locatie"}
        onSluit={() => setPickerType(null)}
        titel="Kies van-locatie"
        items={locatieItems}
        onKies={(id, label) => { setVanLocatieId(id); setVanLocatieNaam(id ? label : null); }}
        gekozenId={vanLocatieId}
        leegLabel="Geen specifieke locatie"
      />
      <PickerModal
        zichtbaar={pickerType === "naar_locatie"}
        onSluit={() => setPickerType(null)}
        titel="Kies naar-locatie"
        items={locatieItems}
        onKies={(id, label) => { setNaarLocatieId(id); setNaarLocatieNaam(id ? label : null); }}
        gekozenId={naarLocatieId}
      />
    </KeyboardAvoidingView>
  );
}

function HandmatigZoekenModal({
  zichtbaar,
  onSluit,
  onKies,
}: {
  zichtbaar: boolean;
  onSluit: () => void;
  onKies: (artikelId: number) => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [zoekInvoer, setZoekInvoer] = useState("");
  const [zoek, setZoek] = useState("");

  React.useEffect(() => {
    const timer = setTimeout(() => setZoek(zoekInvoer), 300);
    return () => clearTimeout(timer);
  }, [zoekInvoer]);

  const params = { zoek: zoek.trim() || undefined, actief: true };
  const { data: resultaten = [], isLoading, isFetching } = useListArtikelen(params, {
    query: { enabled: zichtbaar, queryKey: getListArtikelenQueryKey(params) },
  });

  return (
    <Modal visible={zichtbaar} transparent animationType="slide" onRequestClose={onSluit}>
      <Pressable style={{ flex: 1, backgroundColor: c.dark + "73" }} onPress={onSluit} />
      <View
        style={{
          backgroundColor: c.card,
          borderTopLeftRadius: c.radius + ruimte.xs,
          borderTopRightRadius: c.radius + ruimte.xs,
          paddingBottom: insets.bottom + ruimte.s,
          maxHeight: "80%",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: ruimte.l + ruimte.xs,
            paddingVertical: ruimte.l,
            borderBottomWidth: 1,
            borderBottomColor: c.border,
          }}
        >
          <Text style={tekstStijl("sectiekop", c.foreground)}>Artikel zoeken</Text>
          <Pressable onPress={onSluit} hitSlop={12}>
            <Ionicons name="close" size={ruimte.xl} color={c.mutedForeground} />
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: ruimte.l + ruimte.xs, paddingTop: ruimte.m + 2, paddingBottom: ruimte.s + 2 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: c.radius,
              paddingHorizontal: ruimte.m,
              backgroundColor: c.background,
              gap: ruimte.s,
            }}
          >
            <Ionicons name="search" size={ruimte.l + 1} color={c.mutedForeground} />
            <TextInput
              value={zoekInvoer}
              onChangeText={setZoekInvoer}
              placeholder="Zoek op naam, code of omschrijving..."
              placeholderTextColor={c.mutedForeground}
              autoFocus
              style={[tekstStijl("standaard", c.foreground), { flex: 1, paddingVertical: ruimte.m }]}
            />
            {isFetching && <ActivityIndicator size="small" color={c.mutedForeground} />}
          </View>
        </View>
        <FlatList
          data={resultaten}
          keyExtractor={(item) => String(item.id)}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text
              style={[tekstStijl("standaard", c.mutedForeground), { textAlign: "center", paddingVertical: ruimte.xl }]}
            >
              {isLoading ? "Zoeken..." : "Geen artikelen gevonden."}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => { onKies(item.id); onSluit(); }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: ruimte.l + ruimte.xs,
                paddingVertical: ruimte.m + 2,
                backgroundColor: pressed ? c.muted : c.card,
                borderBottomWidth: 1,
                borderBottomColor: c.border,
                gap: ruimte.m,
              })}
            >
              <View style={{ flex: 1 }}>
                <Text style={tekstStijl("nadruk", c.foreground)}>
                  {item.naam}
                  {item.code ? (
                    <Text style={tekstStijl("standaard", c.mutedForeground)}> ({item.code})</Text>
                  ) : null}
                </Text>
                {item.leverancier_naam ? (
                  <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 1 }]}>
                    {item.leverancier_naam}
                  </Text>
                ) : null}
              </View>
              <Text style={tekstStijl("klein", c.mutedForeground)}>
                {eenheidLabel(item.eenheid)}
              </Text>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

function MagazijnScanScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { isOnline } = useOffline();
  const params = useLocalSearchParams<{ artikel_id?: string }>();

  // Offline cache sync bij eerste online gebruik
  const { data: alleArtikelenRaw } = useListArtikelen({ actief: true }, { query: { enabled: isOnline, queryKey: getListArtikelenQueryKey({ actief: true }) } });
  useEffect(() => {
    if (isOnline && alleArtikelenRaw && alleArtikelenRaw.length > 0) {
      void offlineCache.slaArtikelenOp(alleArtikelenRaw.map(a => ({
        id: a.id,
        naam: a.naam,
        barcode: a.barcode ?? null,
        eenheid: a.eenheid,
        categorie: a.categorie ?? null,
        code: a.code ?? null,
      })));
    }
  }, [isOnline, alleArtikelenRaw]);

  const [permission, requestPermission] = useCameraPermissions();
  const [modus, setModus] = useState<Modus>(params.artikel_id ? "resultaat" : "scan");
  const [gevondenArtikelId, setGevondenArtikelId] = useState<number | null>(
    params.artikel_id ? Number(params.artikel_id) : null,
  );
  const [scanFout, setScanFout] = useState<string | null>(null);
  const [scanBezig, setScanBezig] = useState(false);
  const [zoekOpen, setZoekOpen] = useState(false);

  const geblokkeerd = useRef(false);

  if (!token) return <Redirect href="/login" />;

  async function onBarcodeScanned({ data }: { data: string; type: string }) {
    if (geblokkeerd.current) return;
    geblokkeerd.current = true;
    setScanBezig(true);
    setScanFout(null);

    try {
      let artikelId: number | null = null;

      if (isOnline) {
        const artikelen = await listArtikelen({ barcode: data });
        if (artikelen && artikelen.length > 0) {
          artikelId = artikelen[0].id;
        }
      } else {
        // Offline zoeken in cache
        const cache = await offlineCache.leesArtikelen();
        const gevonden = cache?.find(a => a.barcode === data || a.code === data);
        if (gevonden) {
          artikelId = gevonden.id;
        }
      }

      if (artikelId) {
        setGevondenArtikelId(artikelId);
        setModus("resultaat");
      } else {
        setScanFout(`Geen artikel gevonden voor barcode: ${data}`);
        setTimeout(() => { setScanFout(null); geblokkeerd.current = false; }, 2500);
      }
    } catch {
      setScanFout("Fout bij ophalen artikel. Controleer je verbinding.");
      setTimeout(() => { setScanFout(null); geblokkeerd.current = false; }, 2500);
    } finally {
      setScanBezig(false);
    }
  }

  function resetNaarScanner() {
    setModus("scan");
    setGevondenArtikelId(null);
    setScanFout(null);
    geblokkeerd.current = false;
  }

  if (!permission) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  const viaParam = !!params.artikel_id;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Koptekst */}
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
              {viaParam ? "Artikel" : "Barcode scannen"}
            </Text>
            <Text style={[tekstStijl("klein", c.darkMuted), { marginTop: 1 }]}>
              {modus === "scan" ? "Richt de camera op een artikelbarcode" : "Artikel gevonden"}
            </Text>
          </View>
          {modus === "resultaat" && !viaParam && (
            <Pressable
              onPress={resetNaarScanner}
              hitSlop={12}
              style={({ pressed }) => ({
                opacity: pressed ? 0.6 : 1,
                backgroundColor: c.secondary,
                borderRadius: c.radius / 2,
                paddingHorizontal: ruimte.s + 2,
                paddingVertical: ruimte.xs + 2,
                flexDirection: "row",
                alignItems: "center",
                gap: ruimte.xs,
              })}
            >
              <Ionicons name="scan-outline" size={15} color={c.darkForeground} />
              <Text style={tekstStijl("bijschrift", c.darkForeground)}>
                Opnieuw
              </Text>
            </Pressable>
          )}
          {modus === "scan" && !viaParam && (
            <Pressable
              onPress={() => setZoekOpen(true)}
              hitSlop={12}
              style={({ pressed }) => ({
                opacity: pressed ? 0.6 : 1,
                backgroundColor: c.secondary,
                borderRadius: c.radius / 2,
                paddingHorizontal: ruimte.s + 2,
                paddingVertical: ruimte.xs + 2,
                flexDirection: "row",
                alignItems: "center",
                gap: ruimte.xs,
              })}
            >
              <Ionicons name="search" size={15} color={c.darkForeground} />
              <Text style={tekstStijl("bijschrift", c.darkForeground)}>
                Zoeken
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {modus === "scan" ? (
        !permission.granted ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: ruimte.xxl }}>
            <Ionicons name="camera-outline" size={56} color={c.mutedForeground} />
            <Text style={[tekstStijl("sectiekop", c.foreground), { textAlign: "center", marginTop: ruimte.l, marginBottom: ruimte.s }]}>
              Cameratoegang vereist
            </Text>
            <Text style={[tekstStijl("standaard", c.mutedForeground), { textAlign: "center", marginBottom: ruimte.xl }]}>
              Om barcodes te scannen heeft de app toegang nodig tot de camera.
            </Text>
            <Pressable
              onPress={requestPermission}
              style={({ pressed }) => ({
                backgroundColor: c.primary,
                opacity: pressed ? 0.85 : 1,
                borderRadius: c.radius,
                paddingHorizontal: ruimte.xl + ruimte.xs,
                paddingVertical: ruimte.m + 1,
              })}
            >
              <Text style={tekstStijl("nadruk", c.primaryForeground)}>
                Toestemming geven
              </Text>
            </Pressable>
          </View>
        ) : Platform.OS === "web" ? (
          // Web (/app in de browser): live barcode-scannen via expo-camera is
          // hier niet beschikbaar. Geen doodlopende knop — bied direct de
          // werkende terugval aan: artikel opzoeken op naam of code.
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: ruimte.xl, gap: ruimte.l }}>
            <Ionicons name="barcode-outline" size={48} color={c.mutedForeground} />
            <Text style={[tekstStijl("nadruk", c.foreground), { textAlign: "center" }]}>
              Barcode scannen is niet beschikbaar in de browser
            </Text>
            <Text style={[tekstStijl("klein", c.mutedForeground), { textAlign: "center" }]}>
              Zoek het artikel op naam of artikelcode. Scannen met de camera werkt in de geïnstalleerde app.
            </Text>
            <Pressable
              onPress={() => setZoekOpen(true)}
              style={{ backgroundColor: c.primary, borderRadius: c.radius, paddingHorizontal: ruimte.xl, paddingVertical: ruimte.m }}
            >
              <Text style={tekstStijl("nadruk", c.primaryForeground)}>Artikel zoeken</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flex: 1, position: "relative" }}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              onBarcodeScanned={onBarcodeScanned}
              barcodeScannerSettings={{
                barcodeTypes: ["ean13", "ean8", "code128", "code39", "qr", "upc_a", "upc_e"],
              }}
            />

            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: "30%", backgroundColor: c.dark + "80" }} />
              <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "30%", backgroundColor: c.dark + "80" }} />
              <View style={{ position: "absolute", top: "30%", bottom: "30%", left: 0, width: "12%", backgroundColor: c.dark + "80" }} />
              <View style={{ position: "absolute", top: "30%", bottom: "30%", right: 0, width: "12%", backgroundColor: c.dark + "80" }} />
              <View style={{ width: "76%", aspectRatio: 2.5, borderColor: c.primaryForeground, borderWidth: 2, borderRadius: c.radius / 2 }} />
            </View>

            <View style={{ position: "absolute", bottom: insets.bottom + ruimte.xxl, left: 0, right: 0, alignItems: "center" }}>
              {scanBezig ? (
                <View style={{ backgroundColor: c.dark + "b8", borderRadius: c.radius + ruimte.s, paddingHorizontal: ruimte.l, paddingVertical: ruimte.s + 2, flexDirection: "row", alignItems: "center", gap: ruimte.s + 2 }}>
                  <ActivityIndicator size="small" color={c.primaryForeground} />
                  <Text style={tekstStijl("klein", c.primaryForeground)}>Artikel zoeken...</Text>
                </View>
              ) : scanFout ? (
                <View style={{ backgroundColor: c.destructive, borderRadius: c.radius + ruimte.s, paddingHorizontal: ruimte.l, paddingVertical: ruimte.s + 2, flexDirection: "row", alignItems: "center", gap: ruimte.s, maxWidth: "80%" }}>
                  <Ionicons name="alert-circle-outline" size={ruimte.l + 2} color={c.destructiveForeground} />
                  <Text style={[tekstStijl("klein", c.destructiveForeground), { flexShrink: 1 }]}>{scanFout}</Text>
                </View>
              ) : (
                <Text style={[tekstStijl("klein", c.primaryForeground), { textAlign: "center" }]}>
                  Richt de camera op een barcode of QR-code
                </Text>
              )}
            </View>
          </View>
        )
      ) : (
        <View style={{ flex: 1 }}>
          {gevondenArtikelId !== null ? (
            <ArtikelKaart
              artikelId={gevondenArtikelId}
              onSluit={viaParam ? () => router.back() : resetNaarScanner}
            />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: ruimte.xxl }}>
              <Text style={tekstStijl("standaard", c.mutedForeground)}>
                Geen artikel geselecteerd.
              </Text>
              <Pressable onPress={resetNaarScanner} style={{ marginTop: ruimte.l }}>
                <Text style={tekstStijl("nadruk", c.primary)}>Terug naar scanner</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      <HandmatigZoekenModal
        zichtbaar={zoekOpen}
        onSluit={() => setZoekOpen(false)}
        onKies={(artikelId) => {
          setGevondenArtikelId(artikelId);
          setScanFout(null);
          setModus("resultaat");
        }}
      />
    </View>
  );
}

// APP_01 §3.3 — schermbescherming: nette weigering zonder bevoegdheid
// (backendroute eist magazijn niveau 1; gemeten, zie docs/metingen).
export default function MagazijnScanSchermBeveiligd() {
  return (
    <BevoegdheidGuard vereiste={{ module: "magazijn", niveau: 1 }}>
      <MagazijnScanScherm />
    </BevoegdheidGuard>
  );
}
