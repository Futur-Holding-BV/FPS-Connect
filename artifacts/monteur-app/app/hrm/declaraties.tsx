import { API_DOMEIN } from "@/lib/apiDomein";
import { ruimte } from "@workspace/ontwerp";
import { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ScrollView, Modal, ActivityIndicator, Alert } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { Bedragregel, Kaart, Statusmerk, Waarschuwvlak, netteWaarde, tekstStijl } from "@/components/ui";

const DOMEIN = API_DOMEIN;

type DeclaratieStatus = "concept" | "ingediend" | "goedgekeurd" | "afgekeurd" | "verwerkt";

interface Declaratie {
  id: number;
  medewerker_id: number;
  medewerker_naam: string;
  categorie: string;
  omschrijving: string;
  bedrag_totaal_cents: number;
  datum: string;
  status: DeclaratieStatus;
  ingediend_op: string | null;
  beoordeeld_op: string | null;
  beoordeeld_door_naam: string | null;
  afwijzingsreden: string | null;
  verwerking_op: string | null;
  aangemaakt_op: string;
}

const CATEGORIEEN = [
  { value: "reiskosten",    label: "Reiskosten" },
  { value: "maaltijden",   label: "Maaltijden" },
  { value: "overnachting", label: "Overnachting" },
  { value: "representatie",label: "Representatie" },
  { value: "gereedschap",  label: "Gereedschap" },
  { value: "overig",       label: "Overig" },
];

const STATUS_SOORT: Record<DeclaratieStatus, "neutraal" | "succes" | "waarschuwing" | "fout" | "primair"> = {
  concept: "neutraal",
  ingediend: "waarschuwing",
  goedgekeurd: "succes",
  afgekeurd: "fout",
  verwerkt: "primair",
};

function statusLabel(status: DeclaratieStatus): string {
  switch (status) {
    case "concept":     return "Concept";
    case "ingediend":   return "Ingediend";
    case "goedgekeurd": return "Goedgekeurd";
    case "afgekeurd":   return "Afgekeurd";
    case "verwerkt":    return "Verwerkt";
    default:            return status;
  }
}

function bedragTekst(cents: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function categorieTekst(cat: string): string {
  return CATEGORIEEN.find(c => c.value === cat)?.label ?? cat;
}

export default function DeclaratiesScherm() {
  const c = useColors();
  const styles = maakStyles(c);
  const { token } = useAuth();
  const [declaraties, setDeclaraties] = useState<Declaratie[]>([]);
  const [laden, setLaden] = useState(true);
  const [geselecteerd, setGeselecteerd] = useState<Declaratie | null>(null);
  const [nieuwOpen, setNieuwOpen] = useState(false);

  const [categorie, setCategorie] = useState("reiskosten");
  const [omschrijving, setOmschrijving] = useState("");
  const [bedrag, setBedrag] = useState("");
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [opslaan, setOpslaan] = useState(false);

  useFocusEffect(
    useCallback(() => {
      laadDeclaraties();
    }, [token])
  );

  async function laadDeclaraties() {
    setLaden(true);
    try {
      const res = await fetch(`https://${DOMEIN}/api/mijn/declaraties`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = (await res.json()) as Declaratie[];
      setDeclaraties(data);
    } catch {
      // stil falen
    } finally {
      setLaden(false);
    }
  }

  async function maakNieuw() {
    if (!omschrijving.trim() || !bedrag.trim()) return;
    const bedragCents = Math.round(parseFloat(bedrag.replace(",", ".")) * 100);
    if (isNaN(bedragCents) || bedragCents <= 0) {
      Alert.alert("Ongeldig bedrag", "Voer een geldig bedrag in (bijv. 12,50).");
      return;
    }
    setOpslaan(true);
    try {
      const res = await fetch(`https://${DOMEIN}/api/declaraties`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ categorie, omschrijving: omschrijving.trim(), bedrag_totaal_cents: bedragCents, datum }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setNieuwOpen(false);
      setOmschrijving("");
      setBedrag("");
      setDatum(new Date().toISOString().slice(0, 10));
      setCategorie("reiskosten");
      await laadDeclaraties();
    } catch {
      Alert.alert("Fout", "Declaratie kon niet worden opgeslagen.");
    } finally {
      setOpslaan(false);
    }
  }

  async function dienIn(id: number) {
    try {
      const res = await fetch(`https://${DOMEIN}/api/declaraties/${id}/indienen`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      await laadDeclaraties();
      setGeselecteerd(null);
    } catch {
      Alert.alert("Fout", "Indienen mislukt.");
    }
  }

  function renderItem({ item }: { item: Declaratie }) {
    return (
      <TouchableOpacity onPress={() => setGeselecteerd(item)}>
        <Kaart stijl={styles.kaart}>
          <View style={styles.kaartTop}>
            <Text style={styles.kaartNaam}>{categorieTekst(item.categorie)}</Text>
            <Statusmerk label={statusLabel(item.status)} soort={STATUS_SOORT[item.status]} />
          </View>
          <Text style={styles.kaartOmschrijving} numberOfLines={2}>{item.omschrijving}</Text>
          <View style={styles.kaartOnder}>
            <Text style={styles.kaartDatum}>{item.datum}</Text>
            <Text style={styles.kaartBedrag}>{bedragTekst(item.bedrag_totaal_cents)}</Text>
          </View>
        </Kaart>
      </TouchableOpacity>
    );
  }

  if (laden && declaraties.length === 0) {
    return (
      <View style={styles.midden}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.titel}>Mijn declaraties</Text>
        <TouchableOpacity style={styles.nieuwKnop} onPress={() => setNieuwOpen(true)}>
          <Text style={styles.nieuwKnopTekst}>+ Nieuw</Text>
        </TouchableOpacity>
      </View>

      {declaraties.length === 0 ? (
        <View style={styles.leeg}>
          <Text style={styles.leegTekst}>Geen declaraties gevonden</Text>
          <TouchableOpacity style={styles.leegKnop} onPress={() => setNieuwOpen(true)}>
            <Text style={styles.leegKnopTekst}>Eerste declaratie indienen</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={declaraties}
          renderItem={renderItem}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshing={laden}
          onRefresh={laadDeclaraties}
        />
      )}

      {/* Detail modal */}
      {geselecteerd && (
        <Modal visible animationType="slide" onRequestClose={() => setGeselecteerd(null)}>
          <ScrollView style={styles.modal} contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitel}>Declaratie #{geselecteerd.id}</Text>
              <TouchableOpacity onPress={() => setGeselecteerd(null)}>
                <Text style={styles.sluitTekst}>Sluiten</Text>
              </TouchableOpacity>
            </View>

            <View style={{ alignSelf: "flex-start", marginBottom: ruimte.l }}>
              <Statusmerk label={statusLabel(geselecteerd.status)} soort={STATUS_SOORT[geselecteerd.status]} />
            </View>

            <View style={styles.detailRij}>
              <Text style={styles.detailLabel}>Categorie</Text>
              <Text style={styles.detailWaarde}>{categorieTekst(geselecteerd.categorie)}</Text>
            </View>
            <View style={{ paddingVertical: ruimte.s, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Bedragregel label="Bedrag" bedrag={geselecteerd.bedrag_totaal_cents / 100} nadruk />
            </View>
            <View style={styles.detailRij}>
              <Text style={styles.detailLabel}>Datum kosten</Text>
              <Text style={styles.detailWaarde}>{geselecteerd.datum}</Text>
            </View>
            <View style={styles.detailBlok}>
              <Text style={styles.detailLabel}>Omschrijving</Text>
              <Text style={styles.detailWaardeLang}>{geselecteerd.omschrijving}</Text>
            </View>

            {geselecteerd.afwijzingsreden && (
              <View style={{ marginVertical: ruimte.l }}>
                <Text style={styles.afwijsTitel}>Reden afwijzing</Text>
                <Waarschuwvlak
                  soort="fout"
                  tekst={
                    geselecteerd.beoordeeld_door_naam
                      ? `${geselecteerd.afwijzingsreden}\nDoor: ${geselecteerd.beoordeeld_door_naam}`
                      : geselecteerd.afwijzingsreden
                  }
                />
              </View>
            )}

            {geselecteerd.status === "concept" && (
              <TouchableOpacity style={styles.actieKnop} onPress={() => dienIn(geselecteerd.id)}>
                <Text style={styles.actieKnopTekst}>Indienen ter beoordeling</Text>
              </TouchableOpacity>
            )}

            {geselecteerd.status === "ingediend" && (
              <View style={{ marginTop: ruimte.l }}>
                <Waarschuwvlak soort="waarschuwing" tekst="In behandeling bij uw leidinggevende" />
              </View>
            )}
          </ScrollView>
        </Modal>
      )}

      {/* Nieuwe declaratie modal */}
      {nieuwOpen && (
        <Modal visible animationType="slide" onRequestClose={() => setNieuwOpen(false)}>
          <ScrollView style={styles.modal} contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitel}>Nieuwe declaratie</Text>
              <TouchableOpacity onPress={() => setNieuwOpen(false)}>
                <Text style={styles.sluitTekst}>Annuleren</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Categorie</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categorieScroll}>
              {CATEGORIEEN.map(c => (
                <TouchableOpacity
                  key={c.value}
                  style={[styles.categoriePil, categorie === c.value && styles.categoriePilActief]}
                  onPress={() => setCategorie(c.value)}
                >
                  <Text style={[styles.categoriePilTekst, categorie === c.value && styles.categoriePilTekstActief]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.label}>Omschrijving</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={omschrijving}
              onChangeText={setOmschrijving}
              placeholder="Waarvoor zijn de kosten gemaakt?"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <Text style={styles.label}>Bedrag (euro)</Text>
            <TextInput
              style={styles.input}
              value={bedrag}
              onChangeText={setBedrag}
              placeholder="0,00"
              keyboardType="decimal-pad"
            />

            <Text style={styles.label}>Datum kosten</Text>
            <TextInput
              style={styles.input}
              value={datum}
              onChangeText={setDatum}
              placeholder="JJJJ-MM-DD"
            />

            <TouchableOpacity
              style={[styles.actieKnop, (!omschrijving.trim() || !bedrag.trim() || opslaan) && styles.actieKnopUit]}
              onPress={maakNieuw}
              disabled={!omschrijving.trim() || !bedrag.trim() || opslaan}
            >
              <Text style={styles.actieKnopTekst}>
                {opslaan ? "Opslaan..." : "Opslaan als concept"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </Modal>
      )}
    </View>
  );
}

type Kleuren = ReturnType<typeof useColors>;

function maakStyles(c: Kleuren) {
  return StyleSheet.create({
    container:        { flex: 1, backgroundColor: c.background },
    midden:           { flex: 1, justifyContent: "center", alignItems: "center" },
    header:           { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: ruimte.l, backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.border },
    titel:            { ...tekstStijl("schermtitel", c.foreground) },
    nieuwKnop:        { backgroundColor: c.primary, borderRadius: c.radius / 2, paddingVertical: ruimte.s, paddingHorizontal: ruimte.m + 2 },
    nieuwKnopTekst:   { ...tekstStijl("nadruk", c.primaryForeground) },
    kaart:            { padding: ruimte.m + 2 },
    kaartTop:         { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: ruimte.xs + 2 },
    kaartNaam:        { ...tekstStijl("nadruk", c.foreground) },
    kaartOmschrijving:{ ...tekstStijl("klein", c.mutedForeground), marginBottom: ruimte.s },
    kaartOnder:       { flexDirection: "row", justifyContent: "space-between" },
    kaartDatum:       { ...tekstStijl("bijschrift", c.mutedForeground) },
    kaartBedrag:      { ...tekstStijl("nadruk", c.foreground) },
    leeg:             { flex: 1, justifyContent: "center", alignItems: "center", padding: ruimte.xxl + ruimte.s },
    leegTekst:        { ...tekstStijl("sectiekop", c.mutedForeground), marginBottom: ruimte.l },
    leegKnop:         { backgroundColor: c.primary, borderRadius: c.radius / 2, paddingVertical: ruimte.s + 2, paddingHorizontal: ruimte.xl },
    leegKnopTekst:    { ...tekstStijl("nadruk", c.primaryForeground) },
    modal:            { flex: 1, backgroundColor: c.background },
    modalHeader:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: ruimte.xl },
    modalTitel:       { ...tekstStijl("schermtitel", c.foreground) },
    sluitTekst:       { ...tekstStijl("nadruk", c.primary) },
    detailRij:        { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: ruimte.s, borderBottomWidth: 1, borderBottomColor: c.border },
    detailBlok:       { paddingVertical: ruimte.s, borderBottomWidth: 1, borderBottomColor: c.border },
    detailLabel:      { ...tekstStijl("klein", c.mutedForeground) },
    detailWaarde:     { ...tekstStijl("nadruk", c.foreground) },
    detailWaardeLang: { ...tekstStijl("standaard", c.foreground), marginTop: ruimte.xs, lineHeight: 20 },
    afwijsTitel:      { ...tekstStijl("klein", c.destructive), fontFamily: "Inter_700Bold", marginBottom: ruimte.xs },
    afwijsTekst:      { ...tekstStijl("standaard", c.foreground), lineHeight: 20 },
    afwijsDoor:       { ...tekstStijl("bijschrift", c.mutedForeground), marginTop: ruimte.xs + 2 },
    actieKnop:        { backgroundColor: c.primary, borderRadius: c.radius, paddingVertical: ruimte.m + 2, alignItems: "center", marginTop: ruimte.xl },
    actieKnopUit:     { opacity: 0.5 },
    actieKnopTekst:   { ...tekstStijl("sectiekop", c.primaryForeground) },
    wachtenTekst:     { ...tekstStijl("standaard", c.foreground) },
    label:            { ...tekstStijl("nadruk", c.foreground), marginBottom: ruimte.xs + 2, marginTop: ruimte.m + 2 },
    input:            { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: c.radius / 2, paddingHorizontal: ruimte.m, paddingVertical: ruimte.s + 2, ...tekstStijl("standaard", c.foreground) },
    inputMulti:       { height: 80, paddingTop: ruimte.s + 2 },
    categorieScroll:  { marginBottom: ruimte.xs },
    categoriePil:     { borderWidth: 1, borderColor: c.border, borderRadius: c.radius, paddingVertical: ruimte.xs + 2, paddingHorizontal: ruimte.m + 2, marginRight: ruimte.s, backgroundColor: c.card },
    categoriePilActief:{ backgroundColor: c.primary, borderColor: c.primary },
    categoriePilTekst:{ ...tekstStijl("klein", c.mutedForeground) },
    categoriePilTekstActief: { color: c.primaryForeground },
  });
}
