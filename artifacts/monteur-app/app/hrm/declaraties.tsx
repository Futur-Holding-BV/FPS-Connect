import { API_DOMEIN } from "@/lib/apiDomein";
import { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ScrollView, Modal, ActivityIndicator, Alert } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/context/auth";

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

function statusKleur(status: DeclaratieStatus): string {
  switch (status) {
    case "concept":     return "#6B7280";
    case "ingediend":   return "#D97706";
    case "goedgekeurd": return "#16A34A";
    case "afgekeurd":   return "#DC2626";
    case "verwerkt":    return "#2563EB";
    default:            return "#6B7280";
  }
}

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
      <TouchableOpacity style={styles.kaart} onPress={() => setGeselecteerd(item)}>
        <View style={styles.kaartTop}>
          <Text style={styles.kaartNaam}>{categorieTekst(item.categorie)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusKleur(item.status) + "20" }]}>
            <Text style={[styles.statusTekst, { color: statusKleur(item.status) }]}>
              {statusLabel(item.status)}
            </Text>
          </View>
        </View>
        <Text style={styles.kaartOmschrijving} numberOfLines={2}>{item.omschrijving}</Text>
        <View style={styles.kaartOnder}>
          <Text style={styles.kaartDatum}>{item.datum}</Text>
          <Text style={styles.kaartBedrag}>{bedragTekst(item.bedrag_totaal_cents)}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  if (laden && declaraties.length === 0) {
    return (
      <View style={styles.midden}>
        <ActivityIndicator size="large" color="#F23B0D" />
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

            <View style={[styles.statusBadge, { backgroundColor: statusKleur(geselecteerd.status) + "20", alignSelf: "flex-start", marginBottom: 16 }]}>
              <Text style={[styles.statusTekst, { color: statusKleur(geselecteerd.status) }]}>
                {statusLabel(geselecteerd.status)}
              </Text>
            </View>

            <View style={styles.detailRij}>
              <Text style={styles.detailLabel}>Categorie</Text>
              <Text style={styles.detailWaarde}>{categorieTekst(geselecteerd.categorie)}</Text>
            </View>
            <View style={styles.detailRij}>
              <Text style={styles.detailLabel}>Bedrag</Text>
              <Text style={[styles.detailWaarde, { fontWeight: "700", fontSize: 18 }]}>
                {bedragTekst(geselecteerd.bedrag_totaal_cents)}
              </Text>
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
              <View style={styles.afwijsBlok}>
                <Text style={styles.afwijsTitel}>Reden afwijzing</Text>
                <Text style={styles.afwijsTekst}>{geselecteerd.afwijzingsreden}</Text>
                {geselecteerd.beoordeeld_door_naam && (
                  <Text style={styles.afwijsDoor}>Door: {geselecteerd.beoordeeld_door_naam}</Text>
                )}
              </View>
            )}

            {geselecteerd.status === "concept" && (
              <TouchableOpacity style={styles.actieKnop} onPress={() => dienIn(geselecteerd.id)}>
                <Text style={styles.actieKnopTekst}>Indienen ter beoordeling</Text>
              </TouchableOpacity>
            )}

            {geselecteerd.status === "ingediend" && (
              <View style={styles.wachten}>
                <Text style={styles.wachtenTekst}>In behandeling bij uw leidinggevende</Text>
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

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: "#F9FAFB" },
  midden:           { flex: 1, justifyContent: "center", alignItems: "center" },
  header:           { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
  titel:            { fontSize: 20, fontWeight: "700", color: "#111827" },
  nieuwKnop:        { backgroundColor: "#F23B0D", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  nieuwKnopTekst:   { color: "#fff", fontWeight: "600", fontSize: 14 },
  kaart:            { backgroundColor: "#fff", borderRadius: 10, padding: 14, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  kaartTop:         { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  kaartNaam:        { fontSize: 15, fontWeight: "600", color: "#111827" },
  kaartOmschrijving:{ fontSize: 13, color: "#6B7280", marginBottom: 8 },
  kaartOnder:       { flexDirection: "row", justifyContent: "space-between" },
  kaartDatum:       { fontSize: 12, color: "#9CA3AF" },
  kaartBedrag:      { fontSize: 15, fontWeight: "700", color: "#111827" },
  statusBadge:      { borderRadius: 99, paddingVertical: 3, paddingHorizontal: 8 },
  statusTekst:      { fontSize: 12, fontWeight: "600" },
  leeg:             { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  leegTekst:        { fontSize: 16, color: "#9CA3AF", marginBottom: 16 },
  leegKnop:         { backgroundColor: "#F23B0D", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20 },
  leegKnopTekst:    { color: "#fff", fontWeight: "600" },
  modal:            { flex: 1, backgroundColor: "#F9FAFB" },
  modalHeader:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitel:       { fontSize: 20, fontWeight: "700", color: "#111827" },
  sluitTekst:       { fontSize: 15, color: "#F23B0D", fontWeight: "600" },
  detailRij:        { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  detailBlok:       { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  detailLabel:      { fontSize: 13, color: "#6B7280" },
  detailWaarde:     { fontSize: 15, color: "#111827", fontWeight: "500" },
  detailWaardeLang: { fontSize: 14, color: "#111827", marginTop: 4, lineHeight: 20 },
  afwijsBlok:       { backgroundColor: "#FEF2F2", borderRadius: 8, padding: 14, marginVertical: 16 },
  afwijsTitel:      { fontSize: 13, fontWeight: "700", color: "#DC2626", marginBottom: 4 },
  afwijsTekst:      { fontSize: 14, color: "#7F1D1D", lineHeight: 20 },
  afwijsDoor:       { fontSize: 12, color: "#9CA3AF", marginTop: 6 },
  actieKnop:        { backgroundColor: "#F23B0D", borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 24 },
  actieKnopUit:     { opacity: 0.5 },
  actieKnopTekst:   { color: "#fff", fontWeight: "700", fontSize: 16 },
  wachten:          { backgroundColor: "#FEF3C7", borderRadius: 8, padding: 14, marginTop: 16, alignItems: "center" },
  wachtenTekst:     { fontSize: 14, color: "#92400E" },
  label:            { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 6, marginTop: 14 },
  input:            { backgroundColor: "#fff", borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: "#111827" },
  inputMulti:       { height: 80, paddingTop: 10 },
  categorieScroll:  { marginBottom: 4 },
  categoriePil:     { borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 99, paddingVertical: 6, paddingHorizontal: 14, marginRight: 8, backgroundColor: "#fff" },
  categoriePilActief:{ backgroundColor: "#F23B0D", borderColor: "#F23B0D" },
  categoriePilTekst:{ fontSize: 13, color: "#6B7280", fontWeight: "500" },
  categoriePilTekstActief: { color: "#fff" },
});
