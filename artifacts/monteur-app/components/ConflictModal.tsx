import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";
import { WachtrijItem } from "@/lib/syncQueue";

const TYPE_LABEL: Record<string, string> = {
  patch_werkdag_status: "Werkorderstatus",
  patch_voorziening: "Spotgegevens",
  patch_opname_item: "Opname-item",
  create_uren: "Uren registratie",
  update_uren: "Uren bijwerken",
  delete_uren: "Uren verwijderen",
  upload_foto_lokaal: "Foto upload",
  create_handtekening: "Handtekening",
  create_voorziening: "Nieuwe spot",
  add_foto: "Foto koppelen",
};

function actieOmschrijving(item: WachtrijItem): string {
  switch (item.type) {
    case "patch_werkdag_status":
      return `Status gewijzigd naar "${item.nieuweStatus}"`;
    case "patch_voorziening":
      return `Velden: ${Object.keys(item.velden).join(", ")}`;
    case "patch_opname_item":
      return `Velden: ${Object.keys(item.velden).join(", ")}`;
    case "create_uren":
      return `Uren op ${item.datum}`;
    case "update_uren":
      return `Uren ID ${item.urenId} bijgewerkt`;
    case "delete_uren":
      return `Uren ID ${item.urenId} verwijderd`;
    case "upload_foto_lokaal":
      return `Foto voor item ${item.itemId} (fase: ${item.fase})`;
    case "create_handtekening":
      return `Handtekening werkorder ${item.werkdagId}`;
    default:
      return "—";
  }
}

type Props = {
  zichtbaar: boolean;
  mislukteItems: WachtrijItem[];
  onSluit: () => void;
  onWisMislukte: () => void;
  onHerprobeer: () => void;
};

export function ConflictModal({
  zichtbaar,
  mislukteItems,
  onSluit,
  onWisMislukte,
  onHerprobeer,
}: Props) {
  const c = useColors();

  return (
    <Modal
      visible={zichtbaar}
      transparent
      animationType="slide"
      onRequestClose={onSluit}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            backgroundColor: c.card,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: "80%",
          }}
        >
          {/* Kop */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 20,
              paddingTop: 20,
              paddingBottom: 12,
              borderBottomWidth: 1,
              borderBottomColor: c.border,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: "rgba(239,68,68,0.12)",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons name="warning-outline" size={16} color="#f87171" />
              </View>
              <View>
                <Text
                  style={{
                    color: c.foreground,
                    fontSize: 16,
                    fontFamily: "Inter_700Bold",
                  }}
                >
                  Synchronisatie mislukt
                </Text>
                <Text
                  style={{
                    color: c.mutedForeground,
                    fontSize: 12,
                    fontFamily: "Inter_400Regular",
                  }}
                >
                  {mislukteItems.length} item
                  {mislukteItems.length !== 1 ? "s" : ""} konden niet worden
                  gesynchroniseerd
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onSluit} hitSlop={12}>
              <Ionicons name="close" size={22} color={c.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Lijst mislukte items */}
          <ScrollView
            contentContainerStyle={{ padding: 16, gap: 10 }}
            showsVerticalScrollIndicator={false}
          >
            {mislukteItems.map((item) => (
              <View
                key={item.id}
                style={{
                  backgroundColor: c.background,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "rgba(239,68,68,0.2)",
                  padding: 14,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <View
                    style={{
                      backgroundColor: "rgba(239,68,68,0.1)",
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 6,
                    }}
                  >
                    <Text
                      style={{
                        color: "#f87171",
                        fontSize: 11,
                        fontFamily: "Inter_600SemiBold",
                      }}
                    >
                      {TYPE_LABEL[item.type] ?? item.type}
                    </Text>
                  </View>
                  <Text
                    style={{
                      color: c.mutedForeground,
                      fontSize: 11,
                      fontFamily: "Inter_400Regular",
                    }}
                  >
                    {item.pogingen}× geprobeerd
                  </Text>
                </View>

                <Text
                  style={{
                    color: c.foreground,
                    fontSize: 13,
                    fontFamily: "Inter_500Medium",
                    marginBottom: 4,
                  }}
                >
                  {actieOmschrijving(item)}
                </Text>

                {item.fout ? (
                  <Text
                    style={{
                      color: "#f87171",
                      fontSize: 11,
                      fontFamily: "Inter_400Regular",
                    }}
                    numberOfLines={2}
                  >
                    {item.fout}
                  </Text>
                ) : null}

                <Text
                  style={{
                    color: c.mutedForeground,
                    fontSize: 10,
                    fontFamily: "Inter_400Regular",
                    marginTop: 4,
                  }}
                >
                  Aangemaakt:{" "}
                  {new Date(item.aangemaaktOp).toLocaleString("nl-NL")}
                </Text>
              </View>
            ))}
          </ScrollView>

          {/* Acties */}
          <View
            style={{
              padding: 16,
              gap: 10,
              borderTopWidth: 1,
              borderTopColor: c.border,
            }}
          >
            <Pressable
              onPress={onHerprobeer}
              style={({ pressed }) => ({
                backgroundColor: pressed ? "#d63510" : c.primary,
                borderRadius: 10,
                paddingVertical: 13,
                alignItems: "center",
              })}
            >
              <Text
                style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 }}
              >
                Opnieuw proberen
              </Text>
            </Pressable>
            <Pressable
              onPress={onWisMislukte}
              style={({ pressed }) => ({
                backgroundColor: pressed ? c.muted : "transparent",
                borderRadius: 10,
                paddingVertical: 12,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "#f87171",
              })}
            >
              <Text
                style={{
                  color: "#f87171",
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 14,
                }}
              >
                Mislukte items verwijderen
              </Text>
            </Pressable>
            <Pressable onPress={onSluit} style={{ alignItems: "center", paddingVertical: 8 }}>
              <Text
                style={{
                  color: c.mutedForeground,
                  fontFamily: "Inter_400Regular",
                  fontSize: 13,
                }}
              >
                Sluiten
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
