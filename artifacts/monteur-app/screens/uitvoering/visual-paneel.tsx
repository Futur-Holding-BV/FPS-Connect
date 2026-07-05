import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, ScrollView, Text, View } from "react-native";

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

type ComplexiteitScore = 1 | 2 | 3 | 4 | 5;

type VisualPaneelProps = {
  referentieFotoUrl?: string | null;
  detailtekeningUrl?: string | null;
  plattegrondVerdiepingId?: number | null;
  fotoAnalyse?: PimFotoAnalyse | null;
  complexiteitScore?: ComplexiteitScore;
  provider?: VisualPanelProvider;
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

/**
 * Midden-paneel in de tablet drie-kolommen layout.
 * Toont referentiefoto, detailtekening, plattegrond-uitsnede of een
 * toekomstige VisualPanelProvider. Alleen dit paneel is scrollbaar.
 *
 * Complexiteitsscore bepaalt welke visuals getoond worden:
 * - Laag (1-2): referentiefoto
 * - Middel (3-4): detailtekening + controlepunten
 * - Hoog (5): detailtekening + animatie + exploded view (placeholder)
 */
export function VisualPaneel({
  referentieFotoUrl,
  detailtekeningUrl,
  fotoAnalyse,
  complexiteitScore = 1,
}: VisualPaneelProps) {
  const { theme } = useUitvoeringTheme();

  const heeftFoto = !!referentieFotoUrl;
  const heeftTekening = !!detailtekeningUrl && complexiteitScore >= 3;
  const heeftAnalyse = !!fotoAnalyse;

  if (!heeftFoto && !heeftTekening && !heeftAnalyse) {
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
          {complexiteitScore >= 3 ? "Detailtekening" : "Referentiefoto"}
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
