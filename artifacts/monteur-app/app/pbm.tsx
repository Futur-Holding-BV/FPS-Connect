import { API_DOMEIN } from "@/lib/apiDomein";
import { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Image, FlatList,
} from "react-native";
import { useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/context/auth";
import { useFotoUpload } from "@/hooks/useFotoUpload";
import { BevoegdheidGuard } from "@/components/BevoegdheidGuard";

// ── Types ────────────────────────────────────────────────────────────────────

interface PbmItem {
  id: number;
  type: string;
  merk: string | null;
  model: string | null;
  maat: string | null;
  serienummer: string | null;
  uitgifteDatum: string | null;
  vervangingsDatum: string | null;
  keuringsIntervalMaanden: number | null;
  laatsteControle: string | null;
  status: string;
  opmerkingen: string | null;
  qrCode: string | null;
  fotoPaden: string[];
}

interface AiResultaat {
  beoordeling: string;
  aanbeveling: string;
  slijtage: string;
  keurNodig: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_KLEUR: Record<string, string> = {
  actief: "#16a34a",
  afgekeurd: "#dc2626",
  ingenomen: "#6b7280",
  verloren: "#ea580c",
};

const SLIJTAGE_KLEUR: Record<string, string> = {
  geen: "#16a34a",
  licht: "#ca8a04",
  matig: "#ea580c",
  ernstig: "#dc2626",
};

const DOMEIN = API_DOMEIN;

function datumLabel(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

function isVervangingBinnenkort(d: string | null | undefined) {
  if (!d) return false;
  return new Date(d) <= new Date(Date.now() + 60 * 86400000);
}

// ── Hoofd-scherm ─────────────────────────────────────────────────────────────

function PbmScherm() {
  const { token } = useAuth();
  const { uploadFoto } = useFotoUpload();

  const [items, setItems] = useState<PbmItem[]>([]);
  const [laden, setLaden] = useState(false);
  const [geselecteerd, setGeselecteerd] = useState<PbmItem | null>(null);

  useFocusEffect(
    useCallback(() => {
      void laadItems();
    }, [])
  );

  async function laadItems() {
    setLaden(true);
    try {
      const r = await fetch(`https://${DOMEIN}/api/pbm/items/eigen`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) setItems(await r.json() as PbmItem[]);
    } catch { /* stil falen */ }
    setLaden(false);
  }

  if (geselecteerd) {
    return (
      <PbmItemDetail
        item={geselecteerd}
        token={token}
        uploadFoto={uploadFoto}
        onTerug={() => { setGeselecteerd(null); void laadItems(); }}
      />
    );
  }

  return (
    <View style={s.container}>
      <View style={s.kop}>
        <Text style={s.kopTitel}>Mijn PBM</Text>
        <Text style={s.kopSub}>Persoonlijke beschermingsmiddelen</Text>
      </View>

      {laden ? (
        <ActivityIndicator style={{ margin: 32 }} color="#F23B0D" />
      ) : items.length === 0 ? (
        <View style={s.leeg}>
          <Text style={s.leegTekst}>Nog geen PBM-items toegewezen.</Text>
          <Text style={s.leegSub}>Neem contact op met de PBM-beheerder.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => String(i.id)}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.kaart} onPress={() => setGeselecteerd(item)} activeOpacity={0.7}>
              <View style={s.kaartKop}>
                <Text style={s.kaartType}>{item.type}</Text>
                <View style={[s.statusBadge, { backgroundColor: (STATUS_KLEUR[item.status] ?? "#6b7280") + "20" }]}>
                  <Text style={[s.statusText, { color: STATUS_KLEUR[item.status] ?? "#6b7280" }]}>
                    {item.status}
                  </Text>
                </View>
              </View>
              {(item.merk || item.model) && (
                <Text style={s.kaartSub}>{[item.merk, item.model].filter(Boolean).join(" ")}</Text>
              )}
              <View style={s.kaartMeta}>
                <Text style={s.kaartMetaTekst}>Uitgifte: {datumLabel(item.uitgifteDatum)}</Text>
                {item.vervangingsDatum && (
                  <Text style={[s.kaartMetaTekst, isVervangingBinnenkort(item.vervangingsDatum) && s.waarschuwing]}>
                    Vervanging: {datumLabel(item.vervangingsDatum)}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

// ── Detail + Foto-inspectie ───────────────────────────────────────────────────

interface DetailProps {
  item: PbmItem;
  token: string | null;
  uploadFoto: (uri: string) => Promise<string | null>;
  onTerug: () => void;
}

function PbmItemDetail({ item, token, uploadFoto, onTerug }: DetailProps) {
  const [fotoUris, setFotoUris] = useState<string[]>([]);
  const [ai, setAi] = useState<AiResultaat | null>(null);
  const [bezig, setBezig] = useState(false);

  async function kiesFoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Geen toegang", "Fotoalbum-toegang vereist."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsMultipleSelection: false,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setFotoUris(prev => [...prev, result.assets[0]!.uri].slice(0, 3));
    }
  }

  async function maakFoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert("Geen toegang", "Cameratoegang vereist."); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      setFotoUris(prev => [...prev, result.assets[0]!.uri].slice(0, 3));
    }
  }

  async function startInspectie() {
    if (!fotoUris.length) { Alert.alert("Foto vereist", "Maak minimaal één foto van het PBM."); return; }
    setBezig(true);
    setAi(null);
    try {
      const paden: string[] = [];
      for (const uri of fotoUris) {
        const pad = await uploadFoto(uri);
        if (pad) paden.push(pad);
      }
      if (!paden.length) throw new Error("Upload mislukt");

      const r = await fetch(`https://${DOMEIN}/api/pbm/items/${item.id}/foto-inspectie`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fotoPaden: paden, pbmType: item.type }),
      });
      if (!r.ok) throw new Error("AI-inspectie mislukt");
      const data = await r.json() as { beoordeling: string; aanbeveling: string; slijtage: string; keurNodig: boolean };
      setAi(data);
    } catch (err) {
      Alert.alert("Fout", "AI-inspectie kon niet worden uitgevoerd.");
    } finally {
      setBezig(false);
    }
  }

  const ri: [string, string | null | undefined][] = [
    ["Merk", item.merk],
    ["Model", item.model],
    ["Maat", item.maat],
    ["Serienummer", item.serienummer],
    ["Uitgifte", datumLabel(item.uitgifteDatum)],
    ["Vervanging", datumLabel(item.vervangingsDatum)],
    ["Keuringsinterval", item.keuringsIntervalMaanden ? `${item.keuringsIntervalMaanden} maanden` : null],
    ["Laatste controle", datumLabel(item.laatsteControle)],
  ];

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Terug */}
      <TouchableOpacity style={s.terug} onPress={onTerug}>
        <Text style={s.terugTekst}>Terug</Text>
      </TouchableOpacity>

      <View style={s.kop}>
        <Text style={s.kopTitel}>{item.type}</Text>
        <View style={[s.statusBadge, { backgroundColor: (STATUS_KLEUR[item.status] ?? "#6b7280") + "20" }]}>
          <Text style={[s.statusText, { color: STATUS_KLEUR[item.status] ?? "#6b7280" }]}>{item.status}</Text>
        </View>
      </View>

      {/* Kenmerken */}
      <View style={s.sectie}>
        <Text style={s.sectieKop}>Kenmerken</Text>
        {ri.filter(([, v]) => v && v !== "—").map(([k, v]) => (
          <View key={k} style={s.rij}>
            <Text style={s.rijLabel}>{k}</Text>
            <Text style={s.rijWaarde}>{v}</Text>
          </View>
        ))}
      </View>

      {/* Foto-inspectie */}
      <View style={s.sectie}>
        <Text style={s.sectieKop}>AI Foto-inspectie</Text>
        <Text style={s.toelichting}>
          Maak foto's van je PBM. AI controleert op mogelijke slijtage of beschadigingen
          en geeft een advies. De formele beoordeling blijft altijd bij de PBM-beheerder.
        </Text>

        {/* Foto-preview */}
        {fotoUris.length > 0 && (
          <ScrollView horizontal style={s.fotoRij} showsHorizontalScrollIndicator={false}>
            {fotoUris.map((uri, i) => (
              <View key={i} style={s.fotoWrap}>
                <Image source={{ uri }} style={s.foto} />
                <TouchableOpacity
                  style={s.verwijderFoto}
                  onPress={() => setFotoUris(prev => prev.filter((_, j) => j !== i))}
                >
                  <Text style={s.verwijderFotoText}>X</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        <View style={s.fotoknoppen}>
          <TouchableOpacity style={[s.knop, s.knopSecundair, { flex: 1 }]} onPress={maakFoto}>
            <Text style={s.knopSecundairTekst}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.knop, s.knopSecundair, { flex: 1 }]} onPress={kiesFoto}>
            <Text style={s.knopSecundairTekst}>Album</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[s.knop, s.knopPrimair, (!fotoUris.length || bezig) && s.knopDisabled]}
          onPress={() => void startInspectie()}
          disabled={!fotoUris.length || bezig}
        >
          {bezig ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={s.knopPrimairTekst}>AI-inspectie starten</Text>
          )}
        </TouchableOpacity>

        {/* AI-resultaat */}
        {ai && (
          <View style={s.aiResultaat}>
            <Text style={s.aiTitel}>AI advies</Text>
            <Text style={s.aiDisclaimer}>
              Dit is uitsluitend een advies. AI keurt nooit formeel goed of af.
            </Text>

            <View style={s.aiRij}>
              <Text style={s.aiLabel}>Beoordeling</Text>
              <Text style={s.aiTekst}>{ai.beoordeling}</Text>
            </View>
            <View style={s.aiRij}>
              <Text style={s.aiLabel}>Aanbeveling</Text>
              <Text style={s.aiTekst}>{ai.aanbeveling}</Text>
            </View>
            <View style={s.aiRij}>
              <Text style={s.aiLabel}>Slijtage</Text>
              <Text style={[s.aiTekst, { color: SLIJTAGE_KLEUR[ai.slijtage] ?? "#374151", fontWeight: "600" }]}>
                {ai.slijtage.charAt(0).toUpperCase() + ai.slijtage.slice(1)}
              </Text>
            </View>
            {ai.keurNodig && (
              <View style={s.keurWaarschuwing}>
                <Text style={s.keurWaarschuwingTekst}>
                  Keuring door PBM-beheerder aanbevolen
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {item.opmerkingen && (
        <View style={s.sectie}>
          <Text style={s.sectieKop}>Opmerkingen</Text>
          <Text style={s.rijWaarde}>{item.opmerkingen}</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ── Stijlen ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  kop: { padding: 20, paddingTop: 48, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  kopTitel: { fontSize: 22, fontWeight: "700", color: "#111827", textTransform: "capitalize" },
  kopSub: { fontSize: 14, color: "#6b7280", marginTop: 2 },
  leeg: { padding: 40, alignItems: "center" },
  leegTekst: { fontSize: 15, color: "#374151", fontWeight: "600" },
  leegSub: { fontSize: 13, color: "#9ca3af", marginTop: 4, textAlign: "center" },
  kaart: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  kaartKop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kaartType: { fontSize: 15, fontWeight: "600", color: "#111827", textTransform: "capitalize" },
  kaartSub: { fontSize: 13, color: "#6b7280", marginTop: 2 },
  kaartMeta: { flexDirection: "row", gap: 12, marginTop: 6 },
  kaartMetaTekst: { fontSize: 12, color: "#9ca3af" },
  statusBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 11, fontWeight: "600" },
  waarschuwing: { color: "#ea580c", fontWeight: "600" },
  terug: { padding: 16, paddingTop: 48 },
  terugTekst: { color: "#F23B0D", fontSize: 15, fontWeight: "600" },
  sectie: { margin: 16, backgroundColor: "#fff", borderRadius: 10, padding: 16, borderWidth: 1, borderColor: "#e5e7eb" },
  sectieKop: { fontSize: 13, fontWeight: "700", color: "#374151", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  rij: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  rijLabel: { fontSize: 13, color: "#6b7280" },
  rijWaarde: { fontSize: 13, color: "#111827", fontWeight: "500" },
  toelichting: { fontSize: 12, color: "#6b7280", marginBottom: 12, lineHeight: 18 },
  fotoRij: { marginBottom: 10 },
  fotoWrap: { marginRight: 8, position: "relative" },
  foto: { width: 80, height: 80, borderRadius: 6 },
  verwijderFoto: {
    position: "absolute", top: -6, right: -6,
    backgroundColor: "#dc2626", borderRadius: 999, width: 18, height: 18,
    alignItems: "center", justifyContent: "center",
  },
  verwijderFotoText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  fotoknoppen: { flexDirection: "row", gap: 8, marginBottom: 10 },
  knop: { borderRadius: 8, paddingVertical: 11, paddingHorizontal: 16, alignItems: "center" },
  knopPrimair: { backgroundColor: "#F23B0D" },
  knopPrimairTekst: { color: "#fff", fontWeight: "600", fontSize: 14 },
  knopSecundair: { backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb" },
  knopSecundairTekst: { color: "#374151", fontWeight: "600", fontSize: 14 },
  knopDisabled: { opacity: 0.4 },
  aiResultaat: {
    marginTop: 14, backgroundColor: "#fafafa", borderRadius: 8,
    borderWidth: 1, borderColor: "#e5e7eb", padding: 14,
  },
  aiTitel: { fontSize: 13, fontWeight: "700", color: "#374151", marginBottom: 4 },
  aiDisclaimer: { fontSize: 11, color: "#9ca3af", marginBottom: 10, fontStyle: "italic" },
  aiRij: { marginBottom: 8 },
  aiLabel: { fontSize: 11, color: "#6b7280", textTransform: "uppercase", fontWeight: "600", letterSpacing: 0.4 },
  aiTekst: { fontSize: 13, color: "#111827", marginTop: 2 },
  keurWaarschuwing: {
    marginTop: 8, backgroundColor: "#fef3c7", borderRadius: 6,
    padding: 10, borderWidth: 1, borderColor: "#f59e0b",
  },
  keurWaarschuwingTekst: { fontSize: 13, color: "#92400e", fontWeight: "600" },
});

// APP_01 §3.3 — schermbescherming: nette weigering zonder bevoegdheid
// (backendroute eist toolbox niveau 1; gemeten, zie docs/metingen).
export default function PbmSchermBeveiligd() {
  return (
    <BevoegdheidGuard vereiste={{ module: "toolbox", niveau: 1 }}>
      <PbmScherm />
    </BevoegdheidGuard>
  );
}
