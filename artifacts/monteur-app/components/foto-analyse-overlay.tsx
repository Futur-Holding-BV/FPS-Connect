import { Ionicons } from "@expo/vector-icons";
import { ruimte } from "@workspace/ontwerp";
import React from "react";
import { Image, Text, View } from "react-native";

import { useUitvoeringTheme } from "@/context/UitvoeringThemeContext";
import { useColors } from "@/hooks/useColors";

export type FotoAnalyseStatus = "wachtend" | "bezig" | "akkoord" | "aandacht" | "herstel";

export function normaliseerFotoAnalyseStatus(status: string | null | undefined): FotoAnalyseStatus {
  if (
    status === "bezig" ||
    status === "akkoord" ||
    status === "aandacht" ||
    status === "herstel"
  ) {
    return status;
  }
  return "wachtend";
}

type FotoAnalyseOverlayProps = {
  fotoUrl: string;
  annotatieUrl?: string;
  status: FotoAnalyseStatus;
  breedte?: number;
  hoogte?: number;
};

function StatusBalk({ status }: { status: FotoAnalyseStatus }) {
  const c = useColors();
  const kleur =
    status === "akkoord"
      ? c.success
      : status === "aandacht"
        ? c.warning
        : status === "herstel"
          ? c.destructive
          : c.mutedForeground;

  // Zachte statusachtergrond = dezelfde statuskleur met lage opacity.
  const achtergrond = kleur + "14";

  const icoon: keyof typeof Ionicons.glyphMap =
    status === "akkoord"
      ? "checkmark-circle"
      : status === "aandacht"
        ? "warning"
        : status === "herstel"
          ? "close-circle"
          : "hourglass-outline";

  const label =
    status === "akkoord"
      ? "Akkoord — stap kan worden afgerond"
      : status === "aandacht"
        ? "Aandacht vereist — controleer voor afronding"
        : status === "herstel"
          ? "Herstel nodig — stap kan niet worden afgerond"
          : "Analyseren...";

  return (
    <View
      style={{
        backgroundColor: achtergrond,
        borderRadius: c.radius,
        paddingHorizontal: ruimte.m,
        paddingVertical: ruimte.s,
        flexDirection: "row",
        alignItems: "center",
        gap: ruimte.s,
        borderWidth: 1,
        borderColor: kleur + "44",
        marginTop: ruimte.s,
      }}
    >
      <Ionicons name={icoon} size={18} color={kleur} />
      <Text
        style={{
          color: kleur,
          fontSize: 13,
          fontFamily: "Inter_600SemiBold",
          flex: 1,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * Toont de originele foto (ongewijzigd) met de AI-annotatie-laag daaroverheen.
 * De originele foto en annotatie-laag worden apart opgeslagen en apart geladen.
 *
 * Status bepaalt de kleurrand:
 * - akkoord: groen
 * - aandacht: oranje
 * - herstel: rood
 * - wachtend/bezig: grijs
 */
export function FotoAnalyseOverlay({
  fotoUrl,
  annotatieUrl,
  status,
  breedte,
  hoogte = 260,
}: FotoAnalyseOverlayProps) {
  const c = useColors();
  const { theme } = useUitvoeringTheme();

  const randKleur =
    status === "akkoord"
      ? c.success
      : status === "aandacht"
        ? c.warning
        : status === "herstel"
          ? c.destructive
          : theme.rand;

  return (
    <View>
      <View
        style={{
          borderRadius: c.radius,
          overflow: "hidden",
          borderWidth: 2,
          borderColor: randKleur,
          width: breedte,
          height: hoogte,
          backgroundColor: theme.kaart,
          position: "relative",
        }}
      >
        {fotoUrl ? (
          <Image
            source={{ uri: fotoUrl }}
            style={{
              width: "100%",
              height: "100%",
            }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="image-outline" size={40} color={theme.gedemptTekst} />
          </View>
        )}

        {annotatieUrl && (
          <Image
            source={{ uri: annotatieUrl }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: "100%",
              height: "100%",
            }}
            resizeMode="cover"
          />
        )}

        {(status === "wachtend" || status === "bezig") && (
          <View
            style={{
              position: "absolute",
              top: ruimte.s,
              right: ruimte.s,
              backgroundColor: c.dark + "99",
              borderRadius: c.radius,
              paddingHorizontal: ruimte.s + 2,
              paddingVertical: ruimte.xs + 1,
              flexDirection: "row",
              alignItems: "center",
              gap: ruimte.xs + 2,
            }}
          >
            <Ionicons name="hourglass-outline" size={12} color={c.darkForeground} />
            <Text
              style={{
                color: c.darkForeground,
                fontSize: 11,
                fontFamily: "Inter_600SemiBold",
              }}
            >
              AI analyseert...
            </Text>
          </View>
        )}
      </View>

      <StatusBalk status={status} />
    </View>
  );
}
