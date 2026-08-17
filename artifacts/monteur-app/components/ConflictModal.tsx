import { Ionicons } from "@expo/vector-icons";
import { ruimte } from "@workspace/ontwerp";
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
  onVerwijderItem?: (id: string) => void;
  onHerprobeeerItem?: (id: string) => void;
};

export function ConflictModal({
  zichtbaar,
  mislukteItems,
  onSluit,
  onWisMislukte,
  onHerprobeer,
  onVerwijderItem,
  onHerprobeeerItem,
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
          backgroundColor: c.dark + "99",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            backgroundColor: c.card,
            borderTopLeftRadius: c.radius + ruimte.xs,
            borderTopRightRadius: c.radius + ruimte.xs,
            maxHeight: "80%",
          }}
        >
          {/* Kop */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: ruimte.l + ruimte.xs,
              paddingTop: ruimte.l + ruimte.xs,
              paddingBottom: ruimte.m,
              borderBottomWidth: 1,
              borderBottomColor: c.border,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.s + 2 }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: c.radius / 2,
                  backgroundColor: c.destructive + "1F",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons name="warning-outline" size={16} color={c.destructive} />
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
            contentContainerStyle={{ padding: ruimte.l, gap: ruimte.s + 2 }}
            showsVerticalScrollIndicator={false}
          >
            {mislukteItems.map((item) => (
              <View
                key={item.id}
                style={{
                  backgroundColor: c.background,
                  borderRadius: c.radius,
                  borderWidth: 1,
                  borderColor: c.destructive + "33",
                  padding: ruimte.m + 2,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: ruimte.s,
                    marginBottom: ruimte.xs + 2,
                  }}
                >
                  <View
                    style={{
                      backgroundColor: c.destructive + "1A",
                      paddingHorizontal: ruimte.s,
                      paddingVertical: ruimte.xs - 1,
                      borderRadius: c.radius / 2,
                    }}
                  >
                    <Text
                      style={{
                        color: c.destructive,
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
                    {item.pogingen}&times; geprobeerd
                  </Text>
                </View>

                <Text
                  style={{
                    color: c.foreground,
                    fontSize: 13,
                    fontFamily: "Inter_500Medium",
                    marginBottom: ruimte.xs,
                  }}
                >
                  {actieOmschrijving(item)}
                </Text>

                {item.fout ? (
                  <Text
                    style={{
                      color: c.destructive,
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
                    marginTop: ruimte.xs,
                  }}
                >
                  Aangemaakt:{" "}
                  {new Date(item.aangemaaktOp).toLocaleString("nl-NL")}
                </Text>

                {(onHerprobeeerItem || onVerwijderItem) ? (
                  <View style={{ flexDirection: "row", gap: ruimte.s, marginTop: 10 }}>
                    {onHerprobeeerItem ? (
                      <Pressable
                        onPress={() => onHerprobeeerItem(item.id)}
                        style={({ pressed }) => ({
                          flex: 1,
                          backgroundColor: pressed
                            ? c.primary + "33"
                            : c.primary + "1A",
                          borderRadius: c.radius / 2,
                          paddingVertical: ruimte.xs + 3,
                          alignItems: "center",
                          borderWidth: 1,
                          borderColor: c.primary + "4D",
                        })}
                      >
                        <Text
                          style={{
                            color: c.primary,
                            fontSize: 12,
                            fontFamily: "Inter_600SemiBold",
                          }}
                        >
                          Opnieuw
                        </Text>
                      </Pressable>
                    ) : null}
                    {onVerwijderItem ? (
                      <Pressable
                        onPress={() => onVerwijderItem(item.id)}
                        style={({ pressed }) => ({
                          flex: 1,
                          backgroundColor: pressed
                            ? c.destructive + "26"
                            : "transparent",
                          borderRadius: c.radius / 2,
                          paddingVertical: ruimte.xs + 3,
                          alignItems: "center",
                          borderWidth: 1,
                          borderColor: c.destructive + "4D",
                        })}
                      >
                        <Text
                          style={{
                            color: c.destructive,
                            fontSize: 12,
                            fontFamily: "Inter_600SemiBold",
                          }}
                        >
                          Verwijderen
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ))}
          </ScrollView>

          {/* Acties */}
          <View
            style={{
              padding: ruimte.l,
              gap: ruimte.s + 2,
              borderTopWidth: 1,
              borderTopColor: c.border,
            }}
          >
            <Pressable
              onPress={onHerprobeer}
              style={({ pressed }) => ({
                backgroundColor: c.primary, opacity: pressed ? 0.85 : 1,
                borderRadius: c.radius,
                paddingVertical: ruimte.m + 1,
                alignItems: "center",
              })}
            >
              <Text
                style={{ color: c.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 14 }}
              >
                Alles opnieuw proberen
              </Text>
            </Pressable>
            <Pressable
              onPress={onWisMislukte}
              style={({ pressed }) => ({
                backgroundColor: pressed ? c.muted : "transparent",
                borderRadius: c.radius,
                paddingVertical: ruimte.m,
                alignItems: "center",
                borderWidth: 1,
                borderColor: c.destructive,
              })}
            >
              <Text
                style={{
                  color: c.destructive,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 14,
                }}
              >
                Alle mislukte items verwijderen
              </Text>
            </Pressable>
            <Pressable onPress={onSluit} style={{ alignItems: "center", paddingVertical: ruimte.s }}>
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
