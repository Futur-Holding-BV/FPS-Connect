import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { ConflictModal } from "@/components/ConflictModal";
import { SyncStatus } from "@/context/sync";
import { WachtrijItem } from "@/lib/syncQueue";

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
    label: "Sync mislukt",
    achtergrond: "rgba(239,68,68,0.18)",
    tekst: "#f87171",
  },
};

type Props = {
  status: SyncStatus;
  aantalWachtend?: number;
  aantalMislukt?: number;
  mislukteItems?: WachtrijItem[];
  onWisMislukte?: () => void;
  onForceerSync?: () => void;
  onVerwijderItem?: (id: string) => void;
  onHerprobeeerItem?: (id: string) => void;
  onHerprobeeerAlle?: () => Promise<void>;
};

export function SyncStatusBadge({
  status,
  aantalWachtend,
  aantalMislukt,
  mislukteItems = [],
  onWisMislukte,
  onForceerSync,
  onVerwijderItem,
  onHerprobeeerItem,
  onHerprobeeerAlle,
}: Props) {
  const [conflictZichtbaar, setConflictZichtbaar] = useState(false);
  const cfg = CONFIG[status];
  const heeftMislukte = (aantalMislukt ?? 0) > 0;

  const label =
    status === "mislukt" && heeftMislukte
      ? `Sync mislukt (${aantalMislukt}) — bekijk`
      : aantalWachtend != null &&
          aantalWachtend > 0 &&
          status !== "synchroniseert"
        ? `${cfg.label} (${aantalWachtend})`
        : cfg.label;

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
      {status === "mislukt" && heeftMislukte ? (
        <Ionicons name="warning-outline" size={11} color={cfg.tekst} />
      ) : null}
      <Text
        style={{ color: cfg.tekst, fontSize: 12, fontFamily: "Inter_500Medium" }}
      >
        {label}
      </Text>
    </View>
  );

  if (status === "mislukt" && heeftMislukte) {
    return (
      <>
        <Pressable onPress={() => setConflictZichtbaar(true)}>
          {inhoud}
        </Pressable>
        <ConflictModal
          zichtbaar={conflictZichtbaar}
          mislukteItems={mislukteItems}
          onSluit={() => setConflictZichtbaar(false)}
          onWisMislukte={() => {
            onWisMislukte?.();
            setConflictZichtbaar(false);
          }}
          onHerprobeer={async () => {
            setConflictZichtbaar(false);
            if (onHerprobeeerAlle) {
              await onHerprobeeerAlle();
            }
            onForceerSync?.();
          }}
          onVerwijderItem={onVerwijderItem}
          onHerprobeeerItem={onHerprobeeerItem}
        />
      </>
    );
  }

  if (status === "wacht_op_verbinding" && onForceerSync) {
    return (
      <Pressable onPress={onForceerSync}>
        {inhoud}
      </Pressable>
    );
  }

  return inhoud;
}
