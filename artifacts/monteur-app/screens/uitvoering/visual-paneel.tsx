import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Image, Modal, Pressable, ScrollView, StatusBar, Text, View } from "react-native";

import { useAuth } from "@/context/auth";
import { API_DOMEIN } from "@/lib/apiDomein";
import { useUitvoeringTheme } from "@/context/UitvoeringThemeContext";
import { FotoAnalyseOverlay, normaliseerFotoAnalyseStatus } from "@/components/foto-analyse-overlay";
import type { PimFotoAnalyse } from "@workspace/api-client-react";

// ─── Toekomstige visual providers (lege hooks — niet implementeren) ────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ViewRef = any;

interface StapContext {
  stapId: number;
  opdrachtId: number;
  complexiteitScore?: number;
}

/**
 * Toekomstige visual providers — niet implementeren.
 * Structurele uitbreidingshaak voor AR, IFC, 3D en Revit integraties.
 */
export interface VisualPanelProvider {
  type: "ar_overlay" | "ifc_viewer" | "3d_model" | "revit_extract";
  render(container: ViewRef, context: StapContext): void;
}
// ──────────────────────────────────────────────────────────────────────────────

// ─── VGE Guidance types ───────────────────────────────────────────────────────

export interface GuidanceVisual {
  visual_id: number;
  naam: string;
  type: string;
  object_path: string;
}

export interface Guidance {
  wat_zie_je_nu?: GuidanceVisual | null;
  wat_is_eindresultaat?: GuidanceVisual | null;
  hoe_doe_je_dit?: GuidanceVisual | null;
  aandachtspunten?: string[];
  veiligheidsrisicos?: string[];
  max_visuals_getoond?: number;
}

const DOMEIN = API_DOMEIN;

const VISUAL_LABELS: Record<string, string> = {
  detailtekening: "Tekening",
  projecttekening_uitsnede: "Plattegrond",
  referentiefoto: "Referentie",
  exploded_view: "Onderdelen",
  animatie: "Animatie",
  checklist: "Checklist",
  productblad: "Productblad",
  montagevoorschrift: "Instructie",
  schema: "Schema",
  "3d_weergave": "3D-weergave",
};

// ──────────────────────────────────────────────────────────────────────────────

type ComplexiteitScore = 1 | 2 | 3 | 4 | 5;

type VisualPaneelProps = {
  referentieFotoUrl?: string | null;
  detailtekeningUrl?: string | null;
  plattegrondVerdiepingId?: number | null;
  fotoAnalyse?: PimFotoAnalyse | null;
  complexiteitScore?: ComplexiteitScore;
  provider?: VisualPanelProvider;
  guidance?: Guidance | null;
};

function LeegPaneel() {
  const { theme } = useUitvoeringTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 32,
      }}
    >
      <Ionicons name="image-outline" size={48} color={theme.gedemptTekst} />
      <Text
        style={{
          color: theme.gedemptTekst,
          fontSize: 14,
          fontFamily: "Inter_400Regular",
          textAlign: "center",
          lineHeight: 20,
        }}
      >
        Geen visuele begeleiding beschikbaar voor deze stap
      </Text>
    </View>
  );
}

function FotoBadge({ status }: { status: string }) {
  const kleur =
    status === "akkoord"
      ? "#16A34A"
      : status === "aandacht"
        ? "#D97706"
        : status === "herstel"
          ? "#DC2626"
          : "#6B7280";

  const label =
    status === "akkoord"
      ? "Akkoord"
      : status === "aandacht"
        ? "Aandacht vereist"
        : status === "herstel"
          ? "Herstel nodig"
          : "Analyseren...";

  const icoon =
    status === "akkoord"
      ? "checkmark-circle"
      : status === "aandacht"
        ? "warning"
        : status === "herstel"
          ? "close-circle"
          : "hourglass-outline";

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: kleur + "22",
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 6,
        alignSelf: "flex-start",
      }}
    >
      <Ionicons name={icoon as keyof typeof Ionicons.glyphMap} size={14} color={kleur} />
      <Text
        style={{
          color: kleur,
          fontSize: 12,
          fontFamily: "Inter_700Bold",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function VergrootModal({
  visual,
  zichtbaar,
  onSluiten,
}: {
  visual: GuidanceVisual;
  zichtbaar: boolean;
  onSluiten: () => void;
}) {
  const { token } = useAuth();
  const imageUri = `https://${DOMEIN}/api/storage${visual.object_path}`;
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

  return (
    <Modal
      visible={zichtbaar}
      transparent
      animationType="fade"
      onRequestClose={onSluiten}
      statusBarTranslucent
    >
      <StatusBar backgroundColor="rgba(0,0,0,0.92)" barStyle="light-content" />
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.92)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Pressable
          onPress={onSluiten}
          style={{
            position: "absolute",
            top: 44,
            right: 20,
            zIndex: 10,
            backgroundColor: "rgba(255,255,255,0.15)",
            borderRadius: 20,
            padding: 8,
          }}
        >
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
        <View style={{ paddingHorizontal: 20, width: "100%", gap: 8 }}>
          <Text
            style={{
              color: "rgba(255,255,255,0.6)",
              fontSize: 11,
              fontFamily: "Inter_600SemiBold",
              textTransform: "uppercase",
              letterSpacing: 0.4,
              textAlign: "center",
            }}
          >
            {VISUAL_LABELS[visual.type] ?? visual.type}
          </Text>
          <Image
            source={{ uri: imageUri, headers: authHeaders }}
            style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: 10, backgroundColor: "#666" }}
            resizeMode="contain"
          />
          <Text
            style={{ color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold", textAlign: "center" }}
            numberOfLines={2}
          >
            {visual.naam}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function GuidanceThumbnail({ visual, label }: { visual: GuidanceVisual; label: string }) {
  const { theme } = useUitvoeringTheme();
  const { token } = useAuth();
  const [vergroot, setVergroot] = useState(false);
  const imageUri = `https://${DOMEIN}/api/storage${visual.object_path}`;
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text
        style={{
          color: theme.gedemptTekst,
          fontSize: 10,
          fontFamily: "Inter_600SemiBold",
          textTransform: "uppercase",
          letterSpacing: 0.4,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
      <Pressable
        onPress={() => setVergroot(true)}
        style={{
          aspectRatio: 4 / 3,
          backgroundColor: theme.rand,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: theme.rand,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Image
          source={{ uri: imageUri, headers: authHeaders }}
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
        />
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: "rgba(0,0,0,0.45)",
            paddingHorizontal: 4,
            paddingVertical: 2,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text
            style={{ color: "#fff", fontSize: 10, fontFamily: "Inter_400Regular", flex: 1 }}
            numberOfLines={1}
          >
            {VISUAL_LABELS[visual.type] ?? visual.type}
          </Text>
          <Ionicons name="expand-outline" size={11} color="rgba(255,255,255,0.8)" />
        </View>
      </Pressable>
      <Text
        style={{
          color: theme.tekst,
          fontSize: 11,
          fontFamily: "Inter_400Regular",
          textAlign: "center",
          lineHeight: 15,
        }}
        numberOfLines={2}
      >
        {visual.naam}
      </Text>
      {vergroot && (
        <VergrootModal visual={visual} zichtbaar={vergroot} onSluiten={() => setVergroot(false)} />
      )}
    </View>
  );
}

function GuidanceSectieTablet({ guidance }: { guidance: Guidance }) {
  const { theme } = useUitvoeringTheme();

  const visuals: Array<{ slot: GuidanceVisual; label: string }> = [];
  if (guidance.wat_zie_je_nu) visuals.push({ slot: guidance.wat_zie_je_nu, label: "Huidige situatie" });
  if (guidance.wat_is_eindresultaat) visuals.push({ slot: guidance.wat_is_eindresultaat, label: "Eindresultaat" });
  if (guidance.hoe_doe_je_dit) visuals.push({ slot: guidance.hoe_doe_je_dit, label: "Hoe doe je dit" });

  const aandachtspunten = guidance.aandachtspunten ?? [];
  const veiligheidsrisicos = guidance.veiligheidsrisicos ?? [];

  if (visuals.length === 0 && aandachtspunten.length === 0 && veiligheidsrisicos.length === 0) {
    return null;
  }

  return (
    <View style={{ gap: 12 }}>
      {visuals.length > 0 && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {visuals.map(({ slot, label }) => (
            <GuidanceThumbnail key={slot.visual_id} visual={slot} label={label} />
          ))}
        </View>
      )}

      {aandachtspunten.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text
            style={{
              color: theme.gedemptTekst,
              fontSize: 11,
              fontFamily: "Inter_600SemiBold",
              textTransform: "uppercase",
              letterSpacing: 0.4,
              marginBottom: 2,
            }}
          >
            Aandachtspunten
          </Text>
          {aandachtspunten.map((punt, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
              <Ionicons
                name="information-circle-outline"
                size={14}
                color="#d97706"
                style={{ marginTop: 2 }}
              />
              <Text
                style={{
                  color: theme.tekst,
                  fontSize: 13,
                  fontFamily: "Inter_400Regular",
                  lineHeight: 18,
                  flex: 1,
                }}
              >
                {punt}
              </Text>
            </View>
          ))}
        </View>
      )}

      {veiligheidsrisicos.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text
            style={{
              color: "#92400e",
              fontSize: 11,
              fontFamily: "Inter_600SemiBold",
              textTransform: "uppercase",
              letterSpacing: 0.4,
              marginBottom: 2,
            }}
          >
            Veiligheidsrisicos
          </Text>
          {veiligheidsrisicos.map((risico, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
              <Ionicons
                name="warning-outline"
                size={14}
                color="#dc2626"
                style={{ marginTop: 2 }}
              />
              <Text
                style={{
                  color: "#92400e",
                  fontSize: 13,
                  fontFamily: "Inter_400Regular",
                  lineHeight: 18,
                  flex: 1,
                }}
              >
                {risico}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Midden-paneel in de tablet drie-kolommen layout.
 * Toont VGE guidance visuals (thumbnails + tap-to-enlarge), referentiefoto,
 * detailtekening, fotoanalyse, of een toekomstige VisualPanelProvider.
 * Alleen dit paneel is scrollbaar.
 *
 * Volgorde: guidance_context (VGE) heeft voorrang boven de oude referentieFotoUrl/
 * detailtekeningUrl velden. Beide kunnen naast elkaar worden getoond.
 */
export function VisualPaneel({
  referentieFotoUrl,
  detailtekeningUrl,
  fotoAnalyse,
  complexiteitScore = 1,
  guidance,
}: VisualPaneelProps) {
  const { theme } = useUitvoeringTheme();

  const heeftGuidance = !!guidance && (
    !!guidance.wat_zie_je_nu ||
    !!guidance.wat_is_eindresultaat ||
    !!guidance.hoe_doe_je_dit ||
    (guidance.aandachtspunten?.length ?? 0) > 0 ||
    (guidance.veiligheidsrisicos?.length ?? 0) > 0
  );
  const heeftFoto = !!referentieFotoUrl;
  const heeftTekening = !!detailtekeningUrl && complexiteitScore >= 3;
  const heeftAnalyse = !!fotoAnalyse;

  if (!heeftGuidance && !heeftFoto && !heeftTekening && !heeftAnalyse) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.achtergrond,
          borderRightWidth: 1,
          borderRightColor: theme.rand,
        }}
      >
        <LeegPaneel />
      </View>
    );
  }

  const koptitel = heeftGuidance
    ? "Visuele begeleiding"
    : complexiteitScore >= 3
      ? "Detailtekening"
      : "Referentiefoto";

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.achtergrond,
        borderRightWidth: 1,
        borderRightColor: theme.rand,
      }}
    >
      <View
        style={{
          backgroundColor: theme.kaart,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: theme.rand,
        }}
      >
        <Text
          style={{
            color: theme.gedemptTekst,
            fontSize: 11,
            fontFamily: "Inter_600SemiBold",
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          Visuele begeleiding
        </Text>
        <Text
          style={{
            color: theme.tekst,
            fontSize: 14,
            fontFamily: "Inter_700Bold",
            marginTop: 2,
          }}
        >
          {koptitel}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 24, gap: 14 }}
        showsVerticalScrollIndicator={false}
      >
        {heeftAnalyse && fotoAnalyse.afwijkingsstatus && (
          <FotoBadge status={normaliseerFotoAnalyseStatus(fotoAnalyse.afwijkingsstatus)} />
        )}

        {heeftAnalyse && (
          <View style={{ borderRadius: 12, overflow: "hidden", gap: 0 }}>
            <FotoAnalyseOverlay
              fotoUrl={fotoAnalyse.foto_object_path ?? ""}
              annotatieUrl={fotoAnalyse.annotatie_object_path ?? undefined}
              status={normaliseerFotoAnalyseStatus(fotoAnalyse.afwijkingsstatus)}
            />
          </View>
        )}

        {heeftGuidance && guidance && (
          <GuidanceSectieTablet guidance={guidance} />
        )}

        {heeftFoto && !heeftAnalyse && (
          <View>
            <Text
              style={{
                color: theme.gedemptTekst,
                fontSize: 11,
                fontFamily: "Inter_600SemiBold",
                textTransform: "uppercase",
                letterSpacing: 0.4,
                marginBottom: 8,
              }}
            >
              Gewenste eindresultaat
            </Text>
            <Image
              source={{ uri: referentieFotoUrl ?? "" }}
              style={{
                width: "100%",
                height: 260,
                borderRadius: 12,
                backgroundColor: theme.rand,
              }}
              resizeMode="cover"
            />
          </View>
        )}

        {heeftTekening && (
          <View>
            <Text
              style={{
                color: theme.gedemptTekst,
                fontSize: 11,
                fontFamily: "Inter_600SemiBold",
                textTransform: "uppercase",
                letterSpacing: 0.4,
                marginBottom: 8,
              }}
            >
              Detailtekening
            </Text>
            <Image
              source={{ uri: detailtekeningUrl ?? "" }}
              style={{
                width: "100%",
                height: 300,
                borderRadius: 12,
                backgroundColor: theme.rand,
              }}
              resizeMode="contain"
            />
          </View>
        )}

        {complexiteitScore >= 5 && (
          <View
            style={{
              backgroundColor: theme.kaart,
              borderRadius: 12,
              padding: 20,
              alignItems: "center",
              borderWidth: 1,
              borderColor: theme.rand,
              borderStyle: "dashed",
            }}
          >
            <Ionicons name="cube-outline" size={32} color={theme.gedemptTekst} />
            <Text
              style={{
                color: theme.gedemptTekst,
                fontSize: 12,
                fontFamily: "Inter_500Medium",
                marginTop: 8,
                textAlign: "center",
              }}
            >
              Animatie / Exploded view{"\n"}beschikbaar in toekomstige versie
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
