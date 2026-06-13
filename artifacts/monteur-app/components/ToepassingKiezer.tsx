import React from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import {
  useListLabels,
} from "@workspace/api-client-react";
import type { Label } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/auth";

const DOMEIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";

interface Props {
  typeCode: string;
  geselecteerdeIds: number[];
  onWijzig: (ids: number[]) => void;
}

export function ToepassingKiezer({
  typeCode,
  geselecteerdeIds,
  onWijzig,
}: Props) {
  const c = useColors();
  const { token } = useAuth();
  const { data: labels = [] } = useListLabels({ type_code: typeCode });

  const actief = (labels as Label[]).filter((l) => !l.gearchiveerd);

  if (actief.length === 0) {
    return (
      <Text
        style={{
          color: c.mutedForeground,
          fontSize: 14,
          fontFamily: "Inter_400Regular",
          fontStyle: "italic",
        }}
      >
        Geen toepassingen beschikbaar voor dit type.
      </Text>
    );
  }

  function toggle(id: number) {
    if (geselecteerdeIds.includes(id)) {
      onWijzig(geselecteerdeIds.filter((x) => x !== id));
    } else {
      onWijzig([...geselecteerdeIds, id]);
    }
  }

  return (
    <ScrollView
      horizontal={false}
      showsVerticalScrollIndicator={false}
      style={{ maxHeight: 200 }}
      nestedScrollEnabled
    >
      <View style={{ gap: 8 }}>
        {actief.map((l: Label) => {
          const geselecteerd = geselecteerdeIds.includes(l.id);
          return (
            <Pressable
              key={l.id}
              onPress={() => toggle(l.id)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingVertical: 11,
                paddingHorizontal: 14,
                backgroundColor: geselecteerd ? c.secondary : "transparent",
                borderRadius: c.radius,
                borderWidth: geselecteerd ? 1.5 : 1,
                borderColor: geselecteerd ? c.primary : c.border,
              }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  borderWidth: 2,
                  borderColor: geselecteerd ? c.primary : c.border,
                  backgroundColor: geselecteerd ? c.primary : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {geselecteerd && (
                  <Text
                    style={{
                      color: "#fff",
                      fontSize: 13,
                      fontFamily: "Inter_700Bold",
                      lineHeight: 16,
                    }}
                  >
                    ✓
                  </Text>
                )}
              </View>
              {l.product_foto_url && l.product_foto_geverifieerd ? (
                <Image
                  source={{
                    uri: `https://${DOMEIN}/api/storage${l.product_foto_url}`,
                    headers: { Authorization: `Bearer ${token}` },
                  }}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 6,
                    backgroundColor: c.secondary,
                  }}
                  resizeMode="cover"
                />
              ) : null}
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: c.foreground,
                    fontSize: 15,
                    fontFamily: geselecteerd
                      ? "Inter_600SemiBold"
                      : "Inter_400Regular",
                  }}
                  numberOfLines={2}
                >
                  {l.naam}
                </Text>
                {(l.testrapport?.fabrikant || l.testrapport?.norm) && (
                  <Text
                    style={{
                      color: c.mutedForeground,
                      fontSize: 12,
                      fontFamily: "Inter_400Regular",
                      marginTop: 2,
                    }}
                  >
                    {[l.testrapport?.fabrikant, l.testrapport?.norm]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
