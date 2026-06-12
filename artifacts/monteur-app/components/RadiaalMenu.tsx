import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  type LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";

import { useColors } from "@/hooks/useColors";

export type RadiaalActie = {
  sleutel: string;
  label: string;
  icoon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  binnenkort?: boolean;
};

const ITEM_GROOTTE = 74;
const MIDDEN_GROOTTE = 124;

function tik(stijl: Haptics.ImpactFeedbackStyle) {
  if (Platform.OS === "web") return;
  Haptics.impactAsync(stijl).catch(() => {});
}

function RadiaalItem({
  actie,
  index,
  totaal,
  straal,
  voortgang,
  onKies,
}: {
  actie: RadiaalActie;
  index: number;
  totaal: number;
  straal: number;
  voortgang: SharedValue<number>;
  onKies: (actie: RadiaalActie) => void;
}) {
  const c = useColors();
  const hoek = (-90 + (360 / totaal) * index) * (Math.PI / 180);

  const stijl = useAnimatedStyle(() => {
    const offset = index * 0.05;
    const span = 1 - offset;
    let lokaal = (voortgang.value - offset) / span;
    lokaal = lokaal < 0 ? 0 : lokaal > 1 ? 1 : lokaal;
    const spin = (1 - lokaal) * 0.7;
    const a = hoek - spin;
    return {
      opacity: lokaal,
      transform: [
        { translateX: Math.cos(a) * straal * lokaal },
        { translateY: Math.sin(a) * straal * lokaal },
        { scale: 0.4 + 0.6 * lokaal },
      ],
    };
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        pointerEvents="box-none"
      >
        <Animated.View style={[{ alignItems: "center", width: ITEM_GROOTTE + 28 }, stijl]}>
          <Pressable
            testID={`radiaal-${actie.sleutel}`}
            onPress={() => onKies(actie)}
            style={({ pressed }) => [
              {
                width: ITEM_GROOTTE,
                height: ITEM_GROOTTE,
                borderRadius: ITEM_GROOTTE / 2,
                backgroundColor: c.card,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1.5,
                borderColor: c.border,
                shadowColor: "#000",
                shadowOpacity: 0.18,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 6,
                opacity: pressed ? 0.85 : 1,
              },
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
          </Pressable>
          <Text
            numberOfLines={1}
            style={{
              marginTop: 7,
              color: c.darkForeground,
              fontFamily: "Inter_600SemiBold",
              fontSize: 12.5,
              textAlign: "center",
            }}
          >
            {actie.label}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

export function RadiaalMenu({ acties }: { acties: RadiaalActie[] }) {
  const c = useColors();
  const { width, height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [vlak, setVlak] = useState({ w: width, h: height });
  const voortgang = useSharedValue(0);

  useEffect(() => {
    voortgang.value = withSpring(open ? 1 : 0, {
      damping: 15,
      stiffness: 130,
      mass: 0.7,
    });
  }, [open, voortgang]);

  const zichtbaar = acties.slice(0, 6);
  const minDim = Math.min(vlak.w, vlak.h);
  const straal = Math.max(98, Math.min(150, minDim / 2 - ITEM_GROOTTE / 2 - 18));

  function schakel() {
    tik(open ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
    setOpen((o) => !o);
  }

  function kies(actie: RadiaalActie) {
    tik(Haptics.ImpactFeedbackStyle.Light);
    setOpen(false);
    setTimeout(() => actie.onPress(), 10);
  }

  const backdropStijl = useAnimatedStyle(() => ({
    opacity: voortgang.value * 0.55,
  }));

  const chevronStijl = useAnimatedStyle(() => ({
    transform: [{ rotate: `${voortgang.value * 180}deg` }],
  }));

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
        <Pressable style={{ flex: 1 }} onPress={schakel} accessibilityLabel="Menu sluiten" />
      </Animated.View>

      {zichtbaar.map((actie, i) => (
        <RadiaalItem
          key={actie.sleutel}
          actie={actie}
          index={i}
          totaal={zichtbaar.length}
          straal={straal}
          voortgang={voortgang}
          onKies={kies}
        />
      ))}

      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          pointerEvents="box-none"
        >
          <Pressable
            testID="radiaal-fps"
            onPress={schakel}
            style={({ pressed }) => [
              {
                width: MIDDEN_GROOTTE,
                height: MIDDEN_GROOTTE,
                borderRadius: MIDDEN_GROOTTE / 2,
                backgroundColor: c.primary,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: c.primary,
                shadowOpacity: 0.45,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 8 },
                elevation: 10,
                borderWidth: 4,
                borderColor: "rgba(255,255,255,0.16)",
                opacity: pressed ? 0.92 : 1,
              },
            ]}
          >
            <Text
              style={{
                color: "#FFFFFF",
                fontFamily: "Inter_700Bold",
                fontSize: 30,
                letterSpacing: 1,
              }}
            >
              FPS
            </Text>
            <Animated.View style={[{ marginTop: 1 }, chevronStijl]}>
              <Ionicons name="chevron-up" size={18} color="rgba(255,255,255,0.92)" />
            </Animated.View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
