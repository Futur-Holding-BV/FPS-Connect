import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ruimte } from "@workspace/ontwerp";

import { useColors } from "@/hooks/useColors";

// Bewuste feestkleuren: de confetti-kleuren zijn beeldbepalend voor de viering
// (VORM_01) en blijven bewust letterlijk; gewone UI-kleuren (overlay, tekst)
// lopen via het palet.
const CONFETTI_CONFIG = [
  { x: -110, startY: -80, kleur: "#F23B0D" },
  { x: -70, startY: -60, kleur: "#FFD700" },
  { x: -30, startY: -95, kleur: "#FFFFFF" },
  { x: 10, startY: -70, kleur: "#F23B0D" },
  { x: 50, startY: -90, kleur: "#4FC3F7" },
  { x: 90, startY: -65, kleur: "#FFD700" },
  { x: -90, startY: -75, kleur: "#FFFFFF" },
  { x: 70, startY: -95, kleur: "#F23B0D" },
];

const DELAY_PER_STUK = 100;
const DUUR_VAL = 1600;

function Confettistuk({ x, startY, kleur, idx }: { x: number; startY: number; kleur: string; idx: number }) {
  const y = useRef(new Animated.Value(startY)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(idx * DELAY_PER_STUK),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, tension: 200, friction: 7, useNativeDriver: true }),
        Animated.timing(y, {
          toValue: startY + 220,
          duration: DUUR_VAL,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.confettistuk,
        {
          backgroundColor: kleur,
          transform: [{ translateX: x }, { translateY: y }, { scale }],
          opacity,
        },
      ]}
    />
  );
}

export function BirthdayCelebration({
  naam,
  onDismiss,
}: {
  naam: string;
  onDismiss: () => void;
}) {
  const c = useColors();
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textY = useRef(new Animated.Value(20)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const taartScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(overlayOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();

    Animated.sequence([
      Animated.delay(300),
      Animated.parallel([
        Animated.spring(taartScale, { toValue: 1, tension: 60, friction: 6, useNativeDriver: true }),
        Animated.timing(textOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(textY, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    const timer = setTimeout(onDismiss, 4500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Modal transparent animationType="none" onRequestClose={onDismiss}>
      <Animated.View style={[styles.overlay, { backgroundColor: c.dark + "EB", opacity: overlayOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onDismiss} />

        {CONFETTI_CONFIG.map((cfg, idx) => (
          <Confettistuk key={idx} {...cfg} idx={idx} />
        ))}

        <View style={styles.inhoud} pointerEvents="none">
          <Animated.View style={{ transform: [{ scale: taartScale }] }}>
            <Text style={styles.taartEmoji}>🎂</Text>
          </Animated.View>
          <Animated.View style={{ opacity: textOpacity, transform: [{ translateY: textY }] }}>
            <Text style={[styles.felicitatie, { color: c.darkForeground }]}>Gefeliciteerd, {naam}!</Text>
            <Text style={[styles.subTekst, { color: c.darkMuted }]}>Het hele team van FPS Connect wenst je een fijne verjaardag toe.</Text>
          </Animated.View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  confettistuk: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  inhoud: {
    alignItems: "center",
    paddingHorizontal: ruimte.xxl,
  },
  taartEmoji: {
    fontSize: 64,
    marginBottom: ruimte.l,
    textAlign: "center",
  },
  felicitatie: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: ruimte.s,
  },
  subTekst: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    maxWidth: 280,
  },
});
