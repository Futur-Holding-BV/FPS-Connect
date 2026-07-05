import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, Text, View } from "react-native";

import { useUitvoeringTheme } from "@/context/UitvoeringThemeContext";

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
  const kleur =
    status === "akkoord"
      ? "#16A34A"
      : status === "aandacht"
        ? "#D97706"
        : status === "herstel"
          ? "#DC2626"
          : "#6B7280";

  const achtergrond =
    status === "akkoord"
      ? "#F0FDF4"
      : status === "aandacht"
        ? "#FFFBEB"
        : status === "herstel"
          ? "#FEF2F2"
          : "#F9FAFB";

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
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderWidth: 1,
        borderColor: kleur + "44",
        marginTop: 8,
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
  const { theme } = useUitvoeringTheme();

  const randKleur =
    status === "akkoord"
      ? "#16A34A"
      : status === "aandacht"
        ? "#D97706"
        : status === "herstel"
          ? "#DC2626"
          : theme.rand;

  return (
    <View>
      <View
        style={{
          borderRadius: 12,
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
              top: 8,
              right: 8,
              backgroundColor: "rgba(0,0,0,0.6)",
              borderRadius: 16,
              paddingHorizontal: 10,
              paddingVertical: 5,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Ionicons name="hourglass-outline" size={12} color="#fff" />
            <Text
              style={{
                color: "#fff",
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
