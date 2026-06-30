import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RadiaalMenu, type RadiaalActie } from "@/components/RadiaalMenu";
import { bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import {
  useGetMijnToolboxMaandopdracht,
  useUitstellenToolboxMaandopdracht,
  useVoltooienToolboxMaandopdracht,
  type MijnToolboxMaandopdracht,
} from "@workspace/api-client-react";

declare global {
  interface Window {
    __FPS_ROUTES__: Record<string, string>;
    __FPS_NAVIGEER__: (pad: string) => void;
  }
}

export default function MenuScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { gebruiker, token, uitloggen } = useAuth();

  const [modalZichtbaar, setModalZichtbaar] = useState(false);
  const [vraag, setVraag] = useState("");
  const [opdracht, setOpdracht] = useState<MijnToolboxMaandopdracht | null>(null);

  const { data: maandOpdracht, isLoading: maandLaden } = useGetMijnToolboxMaandopdracht({
    query: { enabled: !!token },
  } as any);

  const uitstellenMut = useUitstellenToolboxMaandopdracht();
  const voltooienMut = useVoltooienToolboxMaandopdracht();

  useEffect(() => {
    if (!maandOpdracht) return;
    const o = maandOpdracht as MijnToolboxMaandopdracht;
    if (!o.voltooid) {
      setOpdracht(o);
      setModalZichtbaar(true);
    }
  }, [maandOpdracht]);

  if (!token) return <Redirect href="/login" />;

  const acties: RadiaalActie[] = [
    { sleutel: "werkdag", label: "Mijn werkdag", icoon: "today", onPress: () => router.push("/werkdag") },
    { sleutel: "gebouwen", label: "Gebouwen", icoon: "business", onPress: () => router.push("/gebouwen") },
    { sleutel: "verlof", label: "Verlof", icoon: "calendar-outline", onPress: () => router.push("/hrm/verlof") },
    { sleutel: "uren", label: "Uren", icoon: "stopwatch", onPress: () => router.push("/uren") },
    { sleutel: "planning", label: "Routeplanner", icoon: "navigate", onPress: () => router.push("/planning") },
    { sleutel: "veiligheid", label: "Veiligheid", icoon: "shield-checkmark-outline", onPress: () => router.push("/veiligheid") },
  ];

  const meerActies: RadiaalActie[] = [
    { sleutel: "personeel", label: "Personeel", icoon: "people-outline", onPress: () => router.push("/hrm") },
    { sleutel: "berichten", label: "Berichten", icoon: "chatbubbles-outline", onPress: () => router.push("/berichten") },
    { sleutel: "opname", label: "Opname", icoon: "clipboard-outline", onPress: () => router.push("/opname") },
    { sleutel: "documenten", label: "Documenten", icoon: "folder-outline", onPress: () => router.push("/documenten") },
    { sleutel: "magazijn", label: "Magazijn scan", icoon: "barcode-outline", onPress: () => router.push("/magazijn/scan" as "/werkdag") },
  ];

  const routeMap: Record<string, string> = {
    werkdag: "/werkdag",
    gebouwen: "/gebouwen",
    verlof: "/hrm/verlof",
    uren: "/uren",
    planning: "/planning",
    veiligheid: "/veiligheid",
    personeel: "/hrm",
    berichten: "/berichten",
    opname: "/opname",
    documenten: "/documenten",
    magazijn: "/magazijn/scan",
  };

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (Platform.OS !== "web") return;
    window.__FPS_ROUTES__ = routeMap;
    window.__FPS_NAVIGEER__ = (pad: string) => {
      router.push(pad as Parameters<typeof router.push>[0]);
    };
    return () => {
      delete (window as Partial<Window>).__FPS_ROUTES__;
      delete (window as Partial<Window>).__FPS_NAVIGEER__;
    };
  });

  function sluitModal() {
    setModalZichtbaar(false);
  }

  async function uitstellen() {
    if (!opdracht) return;
    try {
      const bijgewerkt = await uitstellenMut.mutateAsync({ id: opdracht.id });
      setOpdracht(bijgewerkt as MijnToolboxMaandopdracht);
      sluitModal();
    } catch {
      // server geeft 403 als deadline verstreken — stil laten falen
    }
  }

  async function voltooien() {
    if (!opdracht) return;
    try {
      await voltooienMut.mutateAsync({ id: opdracht.id, data: { vraag: vraag || undefined } } as any);
      sluitModal();
    } catch {
      // stil
    }
  }

  const isBezig = uitstellenMut.isPending || voltooienMut.isPending;

  const CATEGORIE_KLEUREN: Record<string, string> = {
    brandveiligheid: "#ef4444",
    werken_op_hoogte: "#f59e0b",
    pbm: "#22c55e",
    elektrisch: "#facc15",
    gevaarlijke_stoffen: "#a855f7",
    machineveiligheid: "#3b82f6",
    ergonomie: "#14b8a6",
    verkeer_transport: "#f97316",
    milieu: "#10b981",
    anders: "#94a3b8",
  };

  const categoriekleur = opdracht
    ? (CATEGORIE_KLEUREN[opdracht.toolbox_categorie ?? ""] ?? "#94a3b8")
    : "#94a3b8";

  return (
    <View style={{ flex: 1, backgroundColor: c.dark }}>
      {/* Maandopdracht modal */}
      <Modal
        visible={modalZichtbaar}
        transparent
        animationType="slide"
        onRequestClose={() => opdracht?.kan_uitstellen && sluitModal()}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.65)",
            justifyContent: "flex-end",
          }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View
              style={{
                backgroundColor: "#fff",
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                paddingBottom: insets.bottom + 16,
                maxHeight: "90%",
              }}
            >
              {/* Categorie streep */}
              <View style={{ height: 5, backgroundColor: categoriekleur, borderTopLeftRadius: 20, borderTopRightRadius: 20 }} />

              <ScrollView
                style={{ paddingHorizontal: 20 }}
                contentContainerStyle={{ paddingTop: 18, paddingBottom: 8 }}
                showsVerticalScrollIndicator={false}
              >
                {/* Status badge */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <View
                    style={{
                      backgroundColor: opdracht?.is_verplicht ? "#fef2f2" : "#fef9ef",
                      borderRadius: 6,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: opdracht?.is_verplicht ? "#dc2626" : "#d97706" }}>
                      {opdracht?.is_verplicht
                        ? "Verplicht — deadline verstreken"
                        : `Nog ${opdracht?.dagen_resterend ?? 3} dag${(opdracht?.dagen_resterend ?? 3) === 1 ? "" : "en"} uitstelbaar`}
                    </Text>
                  </View>
                  {opdracht?.kan_uitstellen && (
                    <Pressable
                      onPress={uitstellen}
                      disabled={isBezig}
                      hitSlop={12}
                      style={{ opacity: isBezig ? 0.4 : 1 }}
                    >
                      <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "#6b7280", textDecorationLine: "underline" }}>
                        Uitstellen
                      </Text>
                    </Pressable>
                  )}
                </View>

                {/* Titel */}
                <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: "#111827", marginBottom: 4 }}>
                  {maandLaden ? "Laden..." : (opdracht?.toolbox_titel ?? "")}
                </Text>

                {/* Maand label */}
                {opdracht && (
                  <Text style={{ fontSize: 13, color: "#6b7280", fontFamily: "Inter_400Regular", marginBottom: 14 }}>
                    Maandopdracht {MAANDEN_LANG[opdracht.maand - 1]} {opdracht.jaar}
                  </Text>
                )}

                {/* Intro */}
                {opdracht?.toolbox_intro ? (
                  <Text style={{ fontSize: 14, color: "#374151", fontFamily: "Inter_400Regular", lineHeight: 21, marginBottom: 20 }}>
                    {opdracht.toolbox_intro}
                  </Text>
                ) : null}

                {/* Naar toolbox knop */}
                <Pressable
                  onPress={() => {
                    sluitModal();
                    router.push("/toolboxen");
                  }}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    backgroundColor: pressed ? "#f3f4f6" : "#f9fafb",
                    borderRadius: 10,
                    paddingVertical: 11,
                    borderWidth: 1,
                    borderColor: "#e5e7eb",
                    marginBottom: 20,
                  })}
                >
                  <Ionicons name="book-outline" size={15} color="#374151" />
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#374151" }}>
                    Ga naar de volledige toolbox
                  </Text>
                </Pressable>

                {/* Vraag veld */}
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#374151", marginBottom: 6 }}>
                  Heb je een vraag of opmerking? (optioneel)
                </Text>
                <TextInput
                  value={vraag}
                  onChangeText={setVraag}
                  placeholder="Stel je vraag hier..."
                  placeholderTextColor="#9ca3af"
                  multiline
                  numberOfLines={3}
                  style={{
                    borderWidth: 1,
                    borderColor: "#d1d5db",
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 14,
                    fontFamily: "Inter_400Regular",
                    color: "#111827",
                    textAlignVertical: "top",
                    minHeight: 80,
                    marginBottom: 20,
                  }}
                />
              </ScrollView>

              {/* Actieknoppen */}
              <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
                <Pressable
                  onPress={voltooien}
                  disabled={isBezig}
                  style={({ pressed }) => ({
                    backgroundColor: isBezig ? "#d1d5db" : (pressed ? "#c2360a" : "#e8380c"),
                    borderRadius: 12,
                    paddingVertical: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "row",
                    gap: 8,
                  })}
                >
                  {voltooienMut.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color="#fff" />
                      <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" }}>
                        Akkoord en begrepen
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Koptekst */}
      <View
        style={{
          paddingTop: bovenInset(insets) + 10,
          paddingHorizontal: 20,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexShrink: 1 }}>
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 10,
              paddingHorizontal: 8,
              paddingVertical: 6,
            }}
          >
            <Image
              source={require("../assets/images/logo-fps.png")}
              style={{ width: 64, height: 26, resizeMode: "contain" }}
              accessibilityLabel="FPS Brandpreventie"
            />
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={{ color: c.darkMuted, fontSize: 12, fontFamily: "Inter_400Regular" }}>
              Welkom terug
            </Text>
            <Text
              numberOfLines={1}
              style={{ color: c.darkForeground, fontSize: 17, fontFamily: "Inter_700Bold" }}
            >
              {gebruiker?.naam ?? "Monteur"}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          <Pressable
            onPress={() => router.push("/info")}
            accessibilityLabel="Instellingen"
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: pressed ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.10)",
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Ionicons name="settings-outline" size={19} color={c.darkForeground} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/privacy")}
            accessibilityLabel="Privacy"
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: pressed ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.10)",
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Ionicons name="shield-checkmark-outline" size={19} color={c.darkForeground} />
          </Pressable>
          <Pressable
            onPress={uitloggen}
            accessibilityLabel="Uitloggen"
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: pressed ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.10)",
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Ionicons name="log-out-outline" size={19} color={c.darkForeground} />
          </Pressable>
        </View>
      </View>

      <RadiaalMenu acties={acties} meerActies={meerActies} />
    </View>
  );
}

const MAANDEN_LANG = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
