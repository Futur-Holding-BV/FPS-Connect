import { API_DOMEIN } from "@/lib/apiDomein";
import { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Image, FlatList,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { ruimte } from "@workspace/ontwerp";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/context/auth";
import { useFotoUpload } from "@/hooks/useFotoUpload";
import { BevoegdheidGuard } from "@/components/BevoegdheidGuard";
import { useColors } from "@/hooks/useColors";
import {
  Kaart,
  Knop,
  Ladenstaat,
  LegeStaat,
  SchermKop,
  Statusmerk,
  Waarschuwvlak,
  netteWaarde,
  tekstStijl,
} from "@/components/ui";

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

// Status → soort Statusmerk (kleur komt uit het palet, niet uit dit bestand).
const STATUS_SOORT: Record<string, "neutraal" | "succes" | "waarschuwing" | "fout" | "primair"> = {
  actief: "succes",
  afgekeurd: "fout",
  ingenomen: "neutraal",
  verloren: "waarschuwing",
};

// Slijtage → soort Statusmerk.
const SLIJTAGE_SOORT: Record<string, "neutraal" | "succes" | "waarschuwing" | "fout" | "primair"> = {
  geen: "succes",
  licht: "waarschuwing",
  matig: "waarschuwing",
  ernstig: "fout",
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
  const c = useColors();
  const s = useStyles();
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
        <Text style={tekstStijl("schermtitel", c.foreground)}>Mijn PBM</Text>
        <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 2 }]}>
          Persoonlijke beschermingsmiddelen
        </Text>
      </View>

      {laden ? (
        <View style={{ padding: ruimte.l }}>
          <Ladenstaat regels={5} />
        </View>
      ) : items.length === 0 ? (
        <LegeStaat
          icoon="shield-outline"
          titel="Nog geen PBM-items toegewezen"
          beschrijving="Neem contact op met de PBM-beheerder."
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => String(i.id)}
          contentContainerStyle={{ padding: ruimte.l, gap: ruimte.s + 2 }}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => setGeselecteerd(item)} activeOpacity={0.7}>
              <Kaart stijl={{ padding: ruimte.m + 2 }}>
                <View style={s.kaartKop}>
                  <Text style={[tekstStijl("nadruk", c.foreground), { textTransform: "capitalize", flexShrink: 1 }]} numberOfLines={1}>
                    {item.type}
                  </Text>
                  <Statusmerk
                    label={netteWaarde(item.status)}
                    soort={STATUS_SOORT[item.status] ?? "neutraal"}
                  />
                </View>
                {(item.merk || item.model) && (
                  <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 2 }]}>
                    {[item.merk, item.model].filter(Boolean).join(" ")}
                  </Text>
                )}
                <View style={s.kaartMeta}>
                  <Text style={tekstStijl("bijschrift", c.mutedForeground)}>Uitgifte: {datumLabel(item.uitgifteDatum)}</Text>
                  {item.vervangingsDatum && (
                    <Text
                      style={tekstStijl(
                        "bijschrift",
                        isVervangingBinnenkort(item.vervangingsDatum) ? c.warning : c.mutedForeground,
                      )}
                    >
                      Vervanging: {datumLabel(item.vervangingsDatum)}
                    </Text>
                  )}
                </View>
              </Kaart>
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
  const c = useColors();
  const s = useStyles();
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
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: ruimte.xxl + ruimte.s }}>
      {/* Terug */}
      <TouchableOpacity style={s.terug} onPress={onTerug}>
        <Text style={tekstStijl("nadruk", c.tint)}>Terug</Text>
      </TouchableOpacity>

      <View style={s.kop}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: ruimte.s }}>
          <Text style={[tekstStijl("schermtitel", c.foreground), { textTransform: "capitalize", flexShrink: 1 }]} numberOfLines={1}>
            {item.type}
          </Text>
          <Statusmerk label={netteWaarde(item.status)} soort={STATUS_SOORT[item.status] ?? "neutraal"} />
        </View>
      </View>

      {/* Kenmerken */}
      <Kaart stijl={s.sectie}>
        <Text style={s.sectieKop}>Kenmerken</Text>
        {ri.filter(([, v]) => v && v !== "—").map(([k, v]) => (
          <View key={k} style={s.rij}>
            <Text style={tekstStijl("klein", c.mutedForeground)}>{k}</Text>
            <Text style={tekstStijl("klein", c.foreground)}>{v}</Text>
          </View>
        ))}
      </Kaart>

      {/* Foto-inspectie */}
      <Kaart stijl={s.sectie}>
        <Text style={s.sectieKop}>AI Foto-inspectie</Text>
        <Text style={[tekstStijl("klein", c.mutedForeground), { marginBottom: ruimte.m }]}>
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
                  <Text style={tekstStijl("bijschrift", c.primaryForeground)}>X</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        <View style={s.fotoknoppen}>
          <View style={{ flex: 1 }}>
            <Knop titel="Camera" onPress={maakFoto} variant="secundair" />
          </View>
          <View style={{ flex: 1 }}>
            <Knop titel="Album" onPress={kiesFoto} variant="secundair" />
          </View>
        </View>

        <Knop
          titel="AI-inspectie starten"
          onPress={() => void startInspectie()}
          bezig={bezig}
          disabled={!fotoUris.length || bezig}
        />

        {/* AI-resultaat */}
        {ai && (
          <View style={s.aiResultaat}>
            <Text style={s.sectieKop}>AI advies</Text>
            <Text style={[tekstStijl("bijschrift", c.mutedForeground), { marginBottom: ruimte.s + 2, fontStyle: "italic" }]}>
              Dit is uitsluitend een advies. AI keurt nooit formeel goed of af.
            </Text>

            <View style={s.aiRij}>
              <Text style={tekstStijl("bijschrift", c.mutedForeground)}>Beoordeling</Text>
              <Text style={[tekstStijl("klein", c.foreground), { marginTop: 2 }]}>{ai.beoordeling}</Text>
            </View>
            <View style={s.aiRij}>
              <Text style={tekstStijl("bijschrift", c.mutedForeground)}>Aanbeveling</Text>
              <Text style={[tekstStijl("klein", c.foreground), { marginTop: 2 }]}>{ai.aanbeveling}</Text>
            </View>
            <View style={s.aiRij}>
              <Text style={[tekstStijl("bijschrift", c.mutedForeground), { marginBottom: ruimte.xs }]}>Slijtage</Text>
              <Statusmerk label={netteWaarde(ai.slijtage)} soort={SLIJTAGE_SOORT[ai.slijtage] ?? "neutraal"} />
            </View>
            {ai.keurNodig && (
              <View style={{ marginTop: ruimte.s }}>
                <Waarschuwvlak tekst="Keuring door PBM-beheerder aanbevolen" soort="waarschuwing" />
              </View>
            )}
          </View>
        )}
      </Kaart>

      {item.opmerkingen && (
        <Kaart stijl={s.sectie}>
          <Text style={s.sectieKop}>Opmerkingen</Text>
          <Text style={tekstStijl("klein", c.foreground)}>{item.opmerkingen}</Text>
        </Kaart>
      )}
    </ScrollView>
  );
}

// ── Stijlen ──────────────────────────────────────────────────────────────────

function useStyles() {
  const c = useColors();
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    kop: {
      padding: ruimte.l + ruimte.xs,
      paddingTop: ruimte.xxl + ruimte.l,
      backgroundColor: c.card,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    kaartKop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: ruimte.s },
    kaartMeta: { flexDirection: "row", gap: ruimte.m, marginTop: ruimte.s - 2 },
    terug: { padding: ruimte.l, paddingTop: ruimte.xxl + ruimte.l },
    sectie: { margin: ruimte.l },
    sectieKop: {
      ...tekstStijl("bijschrift", c.mutedForeground),
      marginBottom: ruimte.s + 2,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    rij: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: ruimte.xs + 1,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    fotoRij: { marginBottom: ruimte.s + 2 },
    fotoWrap: { marginRight: ruimte.s, position: "relative" },
    foto: { width: ruimte.xxl * 2 + ruimte.l, height: ruimte.xxl * 2 + ruimte.l, borderRadius: c.radius / 2 },
    verwijderFoto: {
      position: "absolute", top: -6, right: -6,
      backgroundColor: c.destructive, borderRadius: c.radius, width: ruimte.l + 2, height: ruimte.l + 2,
      alignItems: "center", justifyContent: "center",
    },
    fotoknoppen: { flexDirection: "row", gap: ruimte.s, marginBottom: ruimte.s + 2 },
    aiResultaat: {
      marginTop: ruimte.m + 2, backgroundColor: c.secondary, borderRadius: c.radius,
      borderWidth: 1, borderColor: c.border, padding: ruimte.m + 2,
    },
    aiRij: { marginBottom: ruimte.s },
  });
}

// APP_01 §3.3 — schermbescherming: nette weigering zonder bevoegdheid
// (backendroute eist toolbox niveau 1; gemeten, zie docs/metingen).
export default function PbmSchermBeveiligd() {
  return (
    <BevoegdheidGuard vereiste={{ module: "toolbox", niveau: 1 }}>
      <PbmScherm />
    </BevoegdheidGuard>
  );
}
