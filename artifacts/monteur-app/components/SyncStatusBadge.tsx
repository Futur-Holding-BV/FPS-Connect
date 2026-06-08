import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { SyncStatus } from "@/context/sync";

const CONFIG: Record<
  SyncStatus,
  { label: string; achtergrond: string; tekst: string; laden?: boolean }
> = {
  gesynchroniseerd: {
    label: "Gesynchroniseerd",
    achtergrond: "rgba(34,197,94,0.18)",
    tekst: "#4ade80",
  },
  opgeslagen: {
    label: "Opgeslagen, wacht op sync",
    achtergrond: "rgba(234,179,8,0.18)",
    tekst: "#facc15",
  },
  synchroniseert: {
    label: "Synchroniseert...",
    achtergrond: "rgba(59,130,246,0.18)",
    tekst: "#60a5fa",
    laden: true,
  },
  wacht_op_verbinding: {
    label: "Wacht op verbinding",
    achtergrond: "rgba(156,163,175,0.18)",
    tekst: "#9ca3af",
  },
  mislukt: {
    label: "Synchronisatie mislukt",
    achtergrond: "rgba(239,68,68,0.18)",
    tekst: "#f87171",
  },
};

type Props = {
  status: SyncStatus;
  aantalWachtend?: number;
  aantalMislukt?: number;
  onWisMislukte?: () => void;
};

export function SyncStatusBadge({ status, aantalWachtend, aantalMislukt, onWisMislukte }: Props) {
  const cfg = CONFIG[status];
  const toonWissen = status === "mislukt" && (aantalMislukt ?? 0) > 0 && !!onWisMislukte;

  const inhoud = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: cfg.achtergrond,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
      }}
    >
      {cfg.laden && <ActivityIndicator size={10} color={cfg.tekst} />}
      <Text
        style={{ color: cfg.tekst, fontSize: 12, fontFamily: "Inter_500Medium" }}
      >
        {cfg.label}
        {status === "mislukt" && (aantalMislukt ?? 0) > 0
          ? ` (${aantalMislukt})${toonWissen ? " — wissen" : ""}`
          : aantalWachtend != null && aantalWachtend > 0 && status !== "synchroniseert"
            ? ` (${aantalWachtend})`
            : ""}
      </Text>
    </View>
  );

  if (toonWissen) {
    return <Pressable onPress={onWisMislukte}>{inhoud}</Pressable>;
  }
  return inhoud;
}
