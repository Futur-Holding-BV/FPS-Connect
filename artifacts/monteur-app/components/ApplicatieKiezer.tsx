import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useListVoorzieningTypes } from "@workspace/api-client-react";
import type { VoorzieningType } from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { bovenInset, onderInset } from "@/components/ui";
import { typeKleur } from "@/constants/spots";

interface Props {
  waarde: string;
  onKies: (code: string, naam: string) => void;
}

export function ApplicatieKiezer({ waarde, onKies }: Props) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [zoek, setZoek] = useState("");
  const { data: typen = [] } = useListVoorzieningTypes();

  const gefilterd = (typen as VoorzieningType[]).filter(
    (t) =>
      t.actief &&
      (zoek.trim() === "" ||
        t.naam.toLowerCase().includes(zoek.toLowerCase()) ||
        t.code.includes(zoek))
  );

  const categorieën = Array.from(new Set(gefilterd.map((t) => t.categorie)));

  const geselecteerdType = (typen as VoorzieningType[]).find(
    (t) => t.code === waarde
  );

  return (
    <>
      <Pressable
        onPress={() => { setOpen(true); setZoek(""); }}
        style={{
          backgroundColor: c.secondary,
          borderWidth: 1.5,
          borderColor: waarde ? c.primary : c.border,
          borderRadius: c.radius,
          paddingHorizontal: 14,
          paddingVertical: 13,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        {waarde && geselecteerdType ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: typeKleur(waarde),
              }}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: c.foreground,
                  fontSize: 15,
                  fontFamily: "Inter_600SemiBold",
                }}
                numberOfLines={1}
              >
                {geselecteerdType.naam}
              </Text>
              <Text
                style={{
                  color: c.mutedForeground,
                  fontSize: 12,
                  fontFamily: "Inter_400Regular",
                }}
              >
                {geselecteerdType.code} · {geselecteerdType.categorie}
              </Text>
            </View>
          </View>
        ) : (
          <Text
            style={{
              color: c.mutedForeground,
              fontSize: 15,
              fontFamily: "Inter_400Regular",
            }}
          >
            Kies applicatie-type...
          </Text>
        )}
        <Text style={{ color: c.mutedForeground, fontSize: 18 }}>›</Text>
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: c.background,
            paddingTop: bovenInset(insets) + 8,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingBottom: 12,
              gap: 12,
            }}
          >
            <Text
              style={{
                flex: 1,
                color: c.foreground,
                fontSize: 18,
                fontFamily: "Inter_700Bold",
              }}
            >
              Applicatie-type kiezen
            </Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10}>
              <Text
                style={{
                  color: c.mutedForeground,
                  fontSize: 22,
                  fontFamily: "Inter_600SemiBold",
                }}
              >
                ✕
              </Text>
            </Pressable>
          </View>

          <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
            <TextInput
              value={zoek}
              onChangeText={setZoek}
              placeholder="Zoek op code of naam..."
              placeholderTextColor={c.mutedForeground}
              style={{
                backgroundColor: c.secondary,
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: c.radius,
                paddingHorizontal: 14,
                paddingVertical: 11,
                color: c.foreground,
                fontSize: 15,
                fontFamily: "Inter_400Regular",
              }}
            />
          </View>

          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: onderInset(insets) + 24,
            }}
          >
            {categorieën.map((cat) => (
              <View key={cat} style={{ marginBottom: 16 }}>
                <Text
                  style={{
                    color: c.mutedForeground,
                    fontSize: 12,
                    fontFamily: "Inter_600SemiBold",
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                    marginBottom: 8,
                  }}
                >
                  {cat}
                </Text>
                {gefilterd
                  .filter((t) => t.categorie === cat)
                  .map((t) => (
                    <Pressable
                      key={t.code}
                      onPress={() => {
                        onKies(t.code, t.naam);
                        setOpen(false);
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        paddingVertical: 11,
                        paddingHorizontal: 14,
                        backgroundColor:
                          waarde === t.code ? c.secondary : "transparent",
                        borderRadius: c.radius,
                        borderWidth: waarde === t.code ? 1.5 : 1,
                        borderColor:
                          waarde === t.code ? c.primary : c.border,
                        marginBottom: 6,
                      }}
                    >
                      <View
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 6,
                          backgroundColor: typeKleur(t.code),
                        }}
                      />
                      <Text
                        style={{
                          color: c.mutedForeground,
                          fontSize: 12,
                          fontFamily: "Inter_400Regular",
                          width: 38,
                        }}
                      >
                        {t.code}
                      </Text>
                      <Text
                        style={{
                          flex: 1,
                          color: c.foreground,
                          fontSize: 15,
                          fontFamily:
                            waarde === t.code
                              ? "Inter_600SemiBold"
                              : "Inter_400Regular",
                        }}
                        numberOfLines={2}
                      >
                        {t.naam}
                      </Text>
                      {waarde === t.code && (
                        <Text
                          style={{
                            color: c.primary,
                            fontSize: 18,
                            fontFamily: "Inter_700Bold",
                          }}
                        >
                          ✓
                        </Text>
                      )}
                    </Pressable>
                  ))}
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
