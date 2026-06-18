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
import type { Achievement } from "@workspace/api-client-react";

function achievementKleur(beloning: string): string {
  if (beloning.includes("Legende")) return "#F23B0D";
  if (beloning.includes("Diamanten")) return "#4FC3F7";
  if (beloning.includes("Kristallen")) return "#00CED1";
  if (beloning.includes("Gouden")) return "#FFD700";
  if (beloning.includes("Zilveren")) return "#C0C0C0";
  if (beloning.includes("Bronzen")) return "#CD7F32";
  if (beloning.includes("Speciale")) return "#9B59B6";
  return "#888888";
}

const STER_CONFIG = [
  { x: -100, startY: -80, kleur: "#FFD700" },
  { x: -60,  startY: -60, kleur: "#F23B0D" },
  { x: -20,  startY: -90, kleur: "#FFFFFF" },
  { x:  20,  startY: -70, kleur: "#FFD700" },
  { x:  60,  startY: -85, kleur: "#CD7F32" },
  { x:  100, startY: -65, kleur: "#4FC3F7" },
  { x: -80,  startY: -75, kleur: "#C0C0C0" },
  { x:  80,  startY: -95, kleur: "#F23B0D" },
];

const DELAY_PER_STER = 100;
const DUUR_STER_VAL = 1600;

function Ster({ x, startY, kleur, idx }: { x: number; startY: number; kleur: string; idx: number }) {
  const y = useRef(new Animated.Value(startY)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(idx * DELAY_PER_STER),
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          tension: 200,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(y, {
          toValue: startY + 200,
          duration: DUUR_STER_VAL,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.ster,
        {
          backgroundColor: kleur,
          transform: [{ translateX: x }, { translateY: y }, { scale }],
          opacity,
        },
      ]}
    />
  );
}

function MedailleIcoon({ beloning, kleur }: { beloning: string; kleur: string }) {
  const scale = useRef(new Animated.Value(0)).current;
  const rotation = useRef(new Animated.Value(-0.5)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        tension: 60,
        friction: 6,
        useNativeDriver: true,
      }),
      Animated.timing(rotation, {
        toValue: 0,
        duration: 700,
        delay: 200,
        easing: Easing.out(Easing.back(1.2)),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const rotate = rotation.interpolate({
    inputRange: [-0.5, 0],
    outputRange: ["-180deg", "0deg"],
  });

  const isBeker =
    beloning.includes("beker") ||
    beloning.includes("Kristallen") ||
    beloning.includes("Diamanten") ||
    beloning.includes("Legende");

  return (
    <Animated.View
      style={[
        styles.medaille,
        {
          borderColor: kleur,
          backgroundColor: `${kleur}22`,
          transform: [{ scale }, { rotate }],
        },
      ]}
    >
      <Text style={[styles.medailleTekst, { color: kleur }]}>
        {isBeker ? "B" : "M"}
      </Text>
      <Text style={[styles.medailleLabel, { color: kleur }]}>
        {isBeker ? "BEKER" : "MEDAILLE"}
      </Text>
    </Animated.View>
  );
}

export function AchievementCelebration({
  achievement,
  naam,
  onDismiss,
}: {
  achievement: Achievement;
  naam: string;
  onDismiss: () => void;
}) {
  const kleur = achievementKleur(achievement.beloning);

  const textOpacity = useRef(new Animated.Value(0)).current;
  const textY = useRef(new Animated.Value(20)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(overlayOpacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    Animated.sequence([
      Animated.delay(600),
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(textY, {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, []);

  const mijlpaalTekst =
    achievement.spots_mijlpaal === 999
      ? "999e"
      : `${achievement.spots_mijlpaal}e`;

  return (
    <Modal transparent animationType="none" onRequestClose={onDismiss}>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onDismiss}
        />

        {STER_CONFIG.map((cfg, idx) => (
          <Ster key={idx} {...cfg} idx={idx} />
        ))}

        <View style={styles.inhoud} pointerEvents="none">
          <Animated.View
            style={{ opacity: textOpacity, transform: [{ translateY: textY }] }}
          >
            <Text style={styles.felicitatie}>Gefeliciteerd {naam}!</Text>
            <Text style={styles.subTekst}>Je hebt zojuist je</Text>
          </Animated.View>

          <MedailleIcoon beloning={achievement.beloning} kleur={kleur} />

          <Animated.View
            style={[
              { opacity: textOpacity, transform: [{ translateY: textY }] },
              styles.tekstBlok,
            ]}
          >
            <Text style={[styles.mijlpaal, { color: kleur }]}>
              {mijlpaalTekst} Spot geplaatst
            </Text>

            <View style={[styles.rangBadge, { borderColor: kleur }]}>
              <Text style={styles.rangLabel}>Nieuwe rang</Text>
              <Text style={[styles.rangNaam, { color: kleur }]}>
                {achievement.rang}
              </Text>
              <Text style={[styles.beloningTekst, { color: `${kleur}bb` }]}>
                {achievement.beloning}
              </Text>
            </View>

            <Text style={styles.volgende}>Op naar de volgende mijlpaal!</Text>
          </Animated.View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 18, 26, 0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  ster: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  inhoud: {
    alignItems: "center",
    paddingHorizontal: 32,
  },
  felicitatie: {
    color: "#ffffff",
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 6,
  },
  subTekst: {
    color: "#9ca3af",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginBottom: 24,
  },
  tekstBlok: {
    alignItems: "center",
    marginTop: 20,
  },
  mijlpaal: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 20,
  },
  rangBadge: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    marginBottom: 20,
  },
  rangLabel: {
    color: "#9ca3af",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  rangNaam: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  beloningTekst: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  volgende: {
    color: "#6b7280",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  medaille: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  medailleTekst: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
  },
  medailleLabel: {
    fontSize: 8,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
    marginTop: 2,
  },
});
