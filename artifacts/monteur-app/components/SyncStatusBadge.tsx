import { Ionicons } from "@expo/vector-icons";
import { ruimte } from "@workspace/ontwerp";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { ConflictModal } from "@/components/ConflictModal";
import { SyncStatus } from "@/context/sync";
import { useColors } from "@/hooks/useColors";
import { WachtrijItem } from "@/lib/syncQueue";

// Status → palet-token. De zachte achtergrond is dezelfde kleur met opacity.
function bouwConfig(
  c: ReturnType<typeof useColors>,
): Record<SyncStatus, { label: string; tekst: string; laden?: boolean }> {
  return {
    gesynchroniseerd: { label: "Gesynchroniseerd", tekst: c.success },
    opgeslagen: { label: "Opgeslagen, wacht op sync", tekst: c.warning },
    synchroniseert: { label: "Synchroniseert...", tekst: c.tint, laden: true },
    wacht_op_verbinding: { label: "Wacht op verbinding", tekst: c.mutedForeground },
    mislukt: { label: "Sync mislukt", tekst: c.destructive },
  };
}

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
  const c = useColors();
  const [conflictZichtbaar, setConflictZichtbaar] = useState(false);
  const cfg = bouwConfig(c)[status];
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
        gap: ruimte.xs + 2,
        backgroundColor: cfg.tekst + "2E",
        paddingHorizontal: ruimte.s + 2,
        paddingVertical: ruimte.xs + 1,
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
