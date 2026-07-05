import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useState } from "react";
import {
  type LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolateColor,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { onderInset } from "@/components/ui";
import { useColors } from "@/hooks/useColors";

export type RadiaalActie = {
  sleutel: string;
  label: string;
  icoon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  binnenkort?: boolean;
};

export type RadiaalMenuProps = {
  acties: RadiaalActie[];
  meerActies?: RadiaalActie[];
};

const ITEM_GROOTTE = 74;
const MIDDEN_GROOTTE = 124;

function tikStoot(stijl: Haptics.ImpactFeedbackStyle) {
  if (Platform.OS === "web") return;
  Haptics.impactAsync(stijl).catch(() => {});
}

function tikSelectie() {
  if (Platform.OS === "web") return;
  Haptics.selectionAsync().catch(() => {});
}

function RadiaalItem({
  actie,
  index,
  totaal,
  straal,
  voortgang,
  rotatie,
  onKies,
}: {
  actie: RadiaalActie;
  index: number;
  totaal: number;
  straal: number;
  voortgang: SharedValue<number>;
  rotatie: SharedValue<number>;
  onKies: (actie: RadiaalActie) => void;
}) {
  const c = useColors();
  const hoek = (-90 + (360 / totaal) * index) * (Math.PI / 180);

  const markering = useDerivedValue(() => {
    let d = hoek + rotatie.value + Math.PI / 2;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const helft = Math.PI / totaal;
    let h = 1 - Math.abs(d) / helft;
    if (h < 0) h = 0;
    const m = h * voortgang.value;
    return m > 1 ? 1 : m;
  });

  const omhulselStijl = useAnimatedStyle(() => {
    const offset = index * 0.05;
    const span = 1 - offset;
    let lokaal = (voortgang.value - offset) / span;
    lokaal = lokaal < 0 ? 0 : lokaal > 1 ? 1 : lokaal;
    const spiraal = (1 - lokaal) * 0.7;
    const a = hoek + rotatie.value - spiraal;
    const schaal = 0.4 + 0.6 * lokaal + markering.value * 0.16;
    return {
      opacity: lokaal,
      transform: [
        { translateX: Math.cos(a) * straal * lokaal },
        { translateY: Math.sin(a) * straal * lokaal },
        { scale: schaal },
      ],
    };
  });

  const cirkelStijl = useAnimatedStyle(() => ({
    borderColor: interpolateColor(markering.value, [0, 1], [c.border, c.primary]),
    borderWidth: 1.5 + markering.value * 2,
  }));

  const labelStijl = useAnimatedStyle(() => ({
    color: interpolateColor(markering.value, [0, 1], [c.darkForeground, c.primary]),
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        pointerEvents="box-none"
      >
        <Animated.View
          pointerEvents="box-none"
          style={[{ alignItems: "center", width: ITEM_GROOTTE + 28 }, omhulselStijl]}
        >
          <Pressable testID={`radiaal-${actie.sleutel}`} onPress={() => onKies(actie)}>
            <Animated.View
              style={[
                {
                  width: ITEM_GROOTTE,
                  height: ITEM_GROOTTE,
                  borderRadius: ITEM_GROOTTE / 2,
                  backgroundColor: c.card,
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: "#000",
                  shadowOpacity: 0.18,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 6,
                },
                cirkelStijl,
              ]}
            >
              <Ionicons name={actie.icoon} size={28} color={c.primary} />
              {actie.binnenkort && (
                <View
                  style={{
                    position: "absolute",
                    top: -3,
                    right: -3,
                    backgroundColor: c.dark,
                    borderRadius: 9,
                    width: 18,
                    height: 18,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1.5,
                    borderColor: c.card,
                  }}
                >
                  <Ionicons name="time-outline" size={10} color={c.darkForeground} />
                </View>
              )}
            </Animated.View>
          </Pressable>
          <Animated.Text
            numberOfLines={1}
            pointerEvents="none"
            style={[
              { marginTop: 7, fontFamily: "Inter_600SemiBold", fontSize: 12.5, textAlign: "center" },
              labelStijl,
            ]}
          >
            {actie.label}
          </Animated.Text>
        </Animated.View>
      </View>
    </View>
  );
}

export function RadiaalMenu({ acties, meerActies = [] }: RadiaalMenuProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [open, setOpen] = useState(true);
  const [selectie, setSelectie] = useState(0);
  const [vlak, setVlak] = useState({ w: width, h: height });
  const [meerOpen, setMeerOpen] = useState(false);

  const voortgang = useSharedValue(1);
  const rotatie = useSharedValue(0);
  const vorigeHoek = useSharedValue(0);

  const zichtbaar = acties.slice(0, 10);
  const totaal = zichtbaar.length;
  const stap = (2 * Math.PI) / totaal;

  const minDim = Math.min(vlak.w, vlak.h);
  const straal = Math.max(98, Math.min(150, minDim / 2 - ITEM_GROOTTE / 2 - 18));
  const dialZijde = 2 * (straal + ITEM_GROOTTE / 2 + 30);
  const midden = dialZijde / 2;

  useEffect(() => {
    voortgang.value = withSpring(open ? 1 : 0, {
      damping: 15,
      stiffness: 130,
      mass: 0.7,
    });
  }, [open, voortgang]);

  useAnimatedReaction(
    () => Math.round(rotatie.value / stap),
    (cur, prev) => {
      const idx = ((-cur % totaal) + totaal) % totaal;
      runOnJS(setSelectie)(idx);
      if (prev !== null && cur !== prev) {
        runOnJS(tikSelectie)();
      }
    },
    [stap, totaal],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(open)
        .minDistance(8)
        .onStart((e) => {
          vorigeHoek.value = Math.atan2(e.y - midden, e.x - midden);
        })
        .onUpdate((e) => {
          const a = Math.atan2(e.y - midden, e.x - midden);
          let d = a - vorigeHoek.value;
          if (d > Math.PI) d -= 2 * Math.PI;
          if (d < -Math.PI) d += 2 * Math.PI;
          rotatie.value += d;
          vorigeHoek.value = a;
        })
        .onEnd(() => {
          const k = Math.round(rotatie.value / stap);
          rotatie.value = withSpring(k * stap, { damping: 16, stiffness: 140 });
        }),
    [open, midden, stap, rotatie, vorigeHoek],
  );

  function openen() {
    tikStoot(Haptics.ImpactFeedbackStyle.Medium);
    rotatie.value = 0;
    setSelectie(0);
    setOpen(true);
  }

  function sluiten() {
    tikStoot(Haptics.ImpactFeedbackStyle.Light);
    setOpen(false);
    setMeerOpen(false);
  }

  function kies(actie: RadiaalActie) {
    tikStoot(Haptics.ImpactFeedbackStyle.Light);
    setOpen(false);
    setTimeout(() => actie.onPress(), 10);
  }

  function opMidden() {
    if (!open) {
      openen();
    } else {
      const actie = zichtbaar[selectie];
      if (actie) kies(actie);
    }
  }

  const backdropStijl = useAnimatedStyle(() => ({ opacity: voortgang.value * 0.55 }));
  const markerStijl = useAnimatedStyle(() => ({ opacity: voortgang.value }));
  const chevronStijl = useAnimatedStyle(() => ({ opacity: 1 - voortgang.value }));
  const vinkStijl = useAnimatedStyle(() => ({ opacity: voortgang.value }));

  return (
    <View
      style={{ flex: 1 }}
      onLayout={(e: LayoutChangeEvent) =>
        setVlak({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
      }
    >
      <Animated.View
        pointerEvents={open ? "auto" : "none"}
        style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }, backdropStijl]}
      >
        <Pressable style={{ flex: 1 }} onPress={sluiten} accessibilityLabel="Menu sluiten" />
      </Animated.View>

      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: onderInset(insets) + 16 }}
          pointerEvents="box-none"
        >
          <GestureDetector gesture={pan}>
            <View
              style={{
                width: dialZijde,
                height: dialZijde,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                  <Animated.View
                    style={[
                      {
                        position: "absolute",
                        width: ITEM_GROOTTE + 14,
                        height: ITEM_GROOTTE + 14,
                        borderRadius: (ITEM_GROOTTE + 14) / 2,
                        borderWidth: 2,
                        borderColor: c.primary,
                        transform: [{ translateY: -straal }],
                      },
                      markerStijl,
                    ]}
                  />
                </View>
              </View>

              {zichtbaar.map((actie, i) => (
                <RadiaalItem
                  key={actie.sleutel}
                  actie={actie}
                  index={i}
                  totaal={totaal}
                  straal={straal}
                  voortgang={voortgang}
                  rotatie={rotatie}
                  onKies={kies}
                />
              ))}

              <Pressable
                testID="radiaal-fps"
                onPress={opMidden}
                style={({ pressed }) => ({
                  width: MIDDEN_GROOTTE,
                  height: MIDDEN_GROOTTE,
                  borderRadius: MIDDEN_GROOTTE / 2,
                  shadowColor: "#000",
                  shadowOpacity: pressed ? 0.35 : 0.55,
                  shadowRadius: pressed ? 14 : 28,
                  shadowOffset: { width: 0, height: pressed ? 4 : 10 },
                  elevation: pressed ? 8 : 18,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}
              >
                <LinearGradient
                  colors={["#FF6530", "#E02800"]}
                  start={{ x: 0.25, y: 0 }}
                  end={{ x: 0.75, y: 1 }}
                  style={{
                    width: MIDDEN_GROOTTE,
                    height: MIDDEN_GROOTTE,
                    borderRadius: MIDDEN_GROOTTE / 2,
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    borderWidth: 2.5,
                    borderColor: "rgba(255,255,255,0.22)",
                  }}
                >
                  {/* Glow ring buitenkant */}
                  <View
                    style={{
                      position: "absolute",
                      top: -3,
                      left: -3,
                      right: -3,
                      bottom: -3,
                      borderRadius: (MIDDEN_GROOTTE + 6) / 2,
                      borderWidth: 2,
                      borderColor: "rgba(255,100,40,0.35)",
                    }}
                  />
                  {/* Glans highlight bovenkant */}
                  <View
                    style={{
                      position: "absolute",
                      top: 6,
                      left: 14,
                      right: 14,
                      height: MIDDEN_GROOTTE * 0.38,
                      borderRadius: MIDDEN_GROOTTE * 0.4,
                      backgroundColor: "rgba(255,255,255,0.28)",
                      transform: [{ scaleY: 0.65 }],
                    }}
                  />
                  {/* Subtiele donkere rand onderaan voor diepte */}
                  <View
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: MIDDEN_GROOTTE * 0.3,
                      borderBottomLeftRadius: MIDDEN_GROOTTE / 2,
                      borderBottomRightRadius: MIDDEN_GROOTTE / 2,
                      backgroundColor: "rgba(0,0,0,0.18)",
                    }}
                  />
                  <Text
                    style={{
                      color: "#FFFFFF",
                      fontFamily: "Inter_700Bold",
                      fontSize: 30,
                      letterSpacing: 1,
                      textShadowColor: "rgba(0,0,0,0.3)",
                      textShadowOffset: { width: 0, height: 1 },
                      textShadowRadius: 3,
                    }}
                  >
                    FPS
                  </Text>
                  <View style={{ height: 20, marginTop: 1, justifyContent: "center" }}>
                    <Animated.View style={[{ position: "absolute", alignSelf: "center" }, chevronStijl]}>
                      <Ionicons name="chevron-up" size={18} color="rgba(255,255,255,0.92)" />
                    </Animated.View>
                    <Animated.View style={[{ position: "absolute", alignSelf: "center" }, vinkStijl]}>
                      <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                    </Animated.View>
                  </View>
                </LinearGradient>
              </Pressable>
            </View>
          </GestureDetector>
        </View>
      </View>

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: onderInset(insets) + 16,
          alignItems: "center",
          gap: 10,
        }}
        pointerEvents="box-none"
      >
        {open ? (
          <>
            <Text style={{ color: c.darkForeground, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
              {zichtbaar[selectie]?.label ?? ""}
            </Text>
            <Text style={{ color: c.darkMuted, fontSize: 12.5, fontFamily: "Inter_400Regular" }}>
              Draai de ring en tik op het midden
            </Text>
            <Pressable
              testID="radiaal-sluiten"
              onPress={sluiten}
              style={{
                marginTop: 2,
                paddingHorizontal: 18,
                paddingVertical: 9,
                borderRadius: 999,
                backgroundColor: "rgba(255,255,255,0.12)",
              }}
            >
              <Text style={{ color: c.darkForeground, fontSize: 14, fontFamily: "Inter_600SemiBold" }}>
                Sluiten
              </Text>
            </Pressable>
          </>
        ) : (
          <View style={{ alignItems: "center", width: "100%", paddingHorizontal: 24, gap: 0 }}>
            <Text style={{ color: c.darkMuted, fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 14 }}>
              Tik op FPS om het menu te openen
            </Text>
            {meerActies.length > 0 && (
              <>
                <Pressable
                  onPress={() => setMeerOpen((v) => !v)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: pressed
                      ? "rgba(255,255,255,0.16)"
                      : "rgba(255,255,255,0.09)",
                    marginBottom: meerOpen ? 16 : 0,
                  })}
                >
                  <Text style={{ color: c.darkForeground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                    Meer
                  </Text>
                  <Ionicons
                    name={meerOpen ? "chevron-up" : "chevron-down"}
                    size={14}
                    color={c.darkForeground}
                  />
                </Pressable>
                {meerOpen && (
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 16,
                      justifyContent: "center",
                    }}
                  >
                    {meerActies.map((actie) => (
                      <Pressable
                        key={actie.sleutel}
                        testID={`meer-${actie.sleutel}`}
                        onPress={() => {
                          setMeerOpen(false);
                          actie.onPress();
                        }}
                        style={({ pressed }) => ({
                          alignItems: "center",
                          gap: 7,
                          width: 68,
                          opacity: pressed ? 0.6 : 1,
                        })}
                      >
                        <View
                          style={{
                            width: 52,
                            height: 52,
                            borderRadius: 26,
                            backgroundColor: "rgba(255,255,255,0.10)",
                            borderWidth: 1,
                            borderColor: "rgba(255,255,255,0.18)",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Ionicons name={actie.icoon} size={22} color={c.darkForeground} />
                        </View>
                        <Text
                          numberOfLines={2}
                          style={{
                            color: c.darkMuted,
                            fontSize: 11,
                            fontFamily: "Inter_500Medium",
                            textAlign: "center",
                            lineHeight: 15,
                          }}
                        >
                          {actie.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        )}
      </View>
    </View>
  );
}
