import { Ionicons } from "@expo/vector-icons";
import { beweging, hoogte, ruimte, typografie, type TypografieToken } from "@workspace/ontwerp";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import type { EdgeInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

export function bovenInset(insets: EdgeInsets): number {
  return Platform.OS === "web" ? Math.max(insets.top, 16) : insets.top;
}

export function onderInset(insets: EdgeInsets): number {
  return Platform.OS === "web" ? Math.max(insets.bottom, 16) : insets.bottom;
}

type KnopProps = {
  titel: string;
  onPress: () => void;
  variant?: "primair" | "secundair" | "gevaar" | "omlijnd";
  bezig?: boolean;
  disabled?: boolean;
  groot?: boolean;
};

export function Knop({
  titel,
  onPress,
  variant = "primair",
  bezig = false,
  disabled = false,
  groot = false,
}: KnopProps) {
  const c = useColors();

  const achtergrond =
    variant === "primair"
      ? c.primary
      : variant === "gevaar"
        ? c.destructive
        : variant === "secundair"
          ? c.secondary
          : "transparent";
  const tekstKleur =
    variant === "secundair"
      ? c.foreground
      : variant === "omlijnd"
        ? c.foreground
        : "#FFFFFF";
  const isUit = disabled || bezig;

  return (
    <Pressable
      onPress={onPress}
      disabled={isUit}
      style={({ pressed }) => [
        {
          backgroundColor: achtergrond,
          borderRadius: c.radius,
          paddingVertical: groot ? 18 : 14,
          paddingHorizontal: 18,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
          borderWidth: variant === "omlijnd" ? 1.5 : 0,
          borderColor: c.border,
          opacity: isUit ? 0.55 : pressed ? 0.85 : 1,
          minHeight: groot ? 58 : 50,
        },
      ]}
    >
      {bezig && <ActivityIndicator color={tekstKleur} />}
      <Text
        style={{
          color: tekstKleur,
          fontFamily: "Inter_600SemiBold",
          fontSize: groot ? 18 : 16,
        }}
      >
        {titel}
      </Text>
    </Pressable>
  );
}

export function LijstFout({
  titel = "Laden mislukt",
  beschrijving = "De gegevens konden niet worden geladen. Controleer je verbinding en probeer het opnieuw.",
  onOpnieuw,
}: {
  titel?: string;
  beschrijving?: string;
  onOpnieuw: () => void;
}) {
  const c = useColors();
  return (
    <View
      style={{
        marginTop: 48,
        marginHorizontal: 24,
        alignItems: "center",
        gap: 12,
      }}
    >
      <Text
        style={{
          color: c.destructive,
          fontSize: 17,
          fontFamily: "Inter_700Bold",
          textAlign: "center",
        }}
      >
        {titel}
      </Text>
      <Text
        style={{
          color: c.mutedForeground,
          fontSize: 15,
          fontFamily: "Inter_400Regular",
          textAlign: "center",
        }}
      >
        {beschrijving}
      </Text>
      <View style={{ marginTop: 4, alignSelf: "stretch" }}>
        <Knop titel="Opnieuw proberen" onPress={onOpnieuw} variant="omlijnd" />
      </View>
    </View>
  );
}

type TekstVeldProps = TextInputProps & {
  label: string;
};

export function TekstVeld({ label, style, ...rest }: TekstVeldProps) {
  const c = useColors();
  const heeftToggle = !!rest.secureTextEntry;
  const [toonTekst, setToonTekst] = useState(false);

  const inputStijl = {
    backgroundColor: c.card,
    borderColor: c.input,
    borderWidth: 1.5,
    borderRadius: c.radius,
    paddingHorizontal: 16,
    paddingRight: heeftToggle ? 50 : 16,
    paddingVertical: 14,
    fontSize: 17,
    color: c.foreground,
    fontFamily: "Inter_400Regular",
  };

  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, { color: c.mutedForeground }]}>{label}</Text>
      <View>
        <TextInput
          placeholderTextColor={c.mutedForeground}
          style={[inputStijl, style]}
          {...rest}
          secureTextEntry={heeftToggle ? !toonTekst : undefined}
        />
        {heeftToggle && (
          <Pressable
            onPress={() => setToonTekst((v) => !v)}
            hitSlop={8}
            style={{
              position: "absolute",
              right: 12,
              top: 0,
              bottom: 0,
              justifyContent: "center",
              paddingHorizontal: 4,
            }}
          >
            <Ionicons
              name={toonTekst ? "eye-off-outline" : "eye-outline"}
              size={22}
              color={c.mutedForeground}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function SectieLabel({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return (
    <Text style={[styles.label, { color: c.mutedForeground, marginTop: 4 }]}>
      {children}
    </Text>
  );
}

type ChipOptie = { waarde: string; label: string; kleur?: string };

export function ChipRij({
  opties,
  geselecteerd,
  onKies,
}: {
  opties: ChipOptie[];
  geselecteerd: string;
  onKies: (waarde: string) => void;
}) {
  const c = useColors();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
    >
      {opties.map((o) => {
        const actief = o.waarde === geselecteerd;
        return (
          <Pressable
            key={o.waarde}
            onPress={() => onKies(o.waarde)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 7,
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderRadius: c.radius,
              backgroundColor: actief ? c.primary : c.secondary,
              borderWidth: 1.5,
              borderColor: actief ? c.primary : c.border,
            }}
          >
            {o.kleur && (
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: o.kleur,
                  borderWidth: 1,
                  borderColor: "#ffffff",
                }}
              />
            )}
            <Text
              style={{
                color: actief ? "#FFFFFF" : c.foreground,
                fontFamily: "Inter_500Medium",
                fontSize: 15,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VORM_01 F3 — nieuwe bouwstenen. Regel: geen letterlijke kleur, maat of duur
// hieronder; alles komt uit @workspace/ontwerp of useColors().
// ─────────────────────────────────────────────────────────────────────────────

export { LegeStatus as LegeStaat } from "@/components/LegeStatus";

/** Typografie-token → React Native tekststijl (Inter-gewichten). */
export function tekstStijl(stap: keyof typeof typografie, kleur: string): TextStyle {
  const t: TypografieToken = typografie[stap];
  const font =
    t.fontWeight === "700"
      ? "Inter_700Bold"
      : t.fontWeight === "600"
        ? "Inter_600SemiBold"
        : t.fontWeight === "500"
          ? "Inter_500Medium"
          : "Inter_400Regular";
  return { fontSize: t.fontSize, lineHeight: t.lineHeight, fontFamily: font, color: kleur };
}

/** Kaart — standaard oppervlak op hoogte 1. */
export function Kaart({
  children,
  niveau = 1,
  stijl,
}: {
  children: React.ReactNode;
  niveau?: 0 | 1 | 2 | 3 | 4;
  stijl?: ViewStyle;
}) {
  const c = useColors();
  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderRadius: c.radius,
          borderWidth: 1,
          borderColor: c.border,
          padding: ruimte.l,
          ...hoogte[niveau],
        },
        stijl,
      ]}
    >
      {children}
    </View>
  );
}

/** Rij — lijstregel met optioneel icoon, label/sublabel en chevron. */
export function Rij({
  label,
  sublabel,
  icoon,
  onPress,
  rechts,
  laatste = false,
}: {
  label: string;
  sublabel?: string;
  icoon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  rechts?: React.ReactNode;
  laatste?: boolean;
}) {
  const c = useColors();
  const inhoud = (
    <>
      {icoon && <Ionicons name={icoon} size={ruimte.xl} color={c.mutedForeground} />}
      <View style={{ flex: 1, gap: ruimte.xs / 2 }}>
        <Text style={tekstStijl("nadruk", c.foreground)}>{label}</Text>
        {sublabel ? <Text style={tekstStijl("klein", c.mutedForeground)}>{sublabel}</Text> : null}
      </View>
      {rechts}
      {onPress && <Ionicons name="chevron-forward" size={ruimte.l} color={c.mutedForeground} />}
    </>
  );
  const basis: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: ruimte.m,
    paddingVertical: ruimte.m,
    borderBottomWidth: laatste ? 0 : 1,
    borderBottomColor: c.border,
  };
  if (!onPress) return <View style={basis}>{inhoud}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [basis, { opacity: pressed ? 0.7 : 1 }]}>
      {inhoud}
    </Pressable>
  );
}

/** Statusmerk — chip voor statussen; kleur + zachte achtergrond uit het palet. */
export function Statusmerk({
  label,
  soort = "neutraal",
}: {
  label: string;
  soort?: "neutraal" | "succes" | "waarschuwing" | "fout" | "primair";
}) {
  const c = useColors();
  const kleur =
    soort === "succes"
      ? c.success
      : soort === "waarschuwing"
        ? c.warning
        : soort === "fout"
          ? c.destructive
          : soort === "primair"
            ? c.tint
            : c.mutedForeground;
  return (
    <View
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: ruimte.xs + 2,
        backgroundColor: c.secondary,
        borderRadius: c.radius,
        paddingHorizontal: ruimte.s + 2,
        paddingVertical: ruimte.xs,
      }}
    >
      <View style={{ width: ruimte.s, height: ruimte.s, borderRadius: ruimte.xs, backgroundColor: kleur }} />
      <Text style={tekstStijl("bijschrift", c.foreground)}>{label}</Text>
    </View>
  );
}

/** SchermKop — titel + optionele ondertitel en actie, met vaste ritmiek. */
export function SchermKop({
  titel,
  ondertitel,
  actie,
}: {
  titel: string;
  ondertitel?: string;
  actie?: React.ReactNode;
}) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: ruimte.m, marginBottom: ruimte.l }}>
      <View style={{ flex: 1, gap: ruimte.xs / 2 }}>
        <Text style={tekstStijl("schermtitel", c.foreground)}>{titel}</Text>
        {ondertitel ? <Text style={tekstStijl("klein", c.mutedForeground)}>{ondertitel}</Text> : null}
      </View>
      {actie}
    </View>
  );
}

/** Bevestigknop — Knop met haptische tik bij aanraken (stil op web). */
export function Bevestigknop(props: KnopProps) {
  const onPress = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    props.onPress();
  };
  return <Knop {...props} onPress={onPress} />;
}

/** Tabrij — segmentkeuze binnen een scherm. */
export function Tabrij({
  tabs,
  actief,
  onKies,
}: {
  tabs: Array<{ waarde: string; label: string }>;
  actief: string;
  onKies: (waarde: string) => void;
}) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: c.secondary,
        borderRadius: c.radius,
        padding: ruimte.xs,
        gap: ruimte.xs,
      }}
    >
      {tabs.map((t) => {
        const is = t.waarde === actief;
        return (
          <Pressable
            key={t.waarde}
            onPress={() => onKies(t.waarde)}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: ruimte.s + 2,
              borderRadius: c.radius - ruimte.xs,
              backgroundColor: is ? c.card : "transparent",
              ...(is ? hoogte[1] : hoogte[0]),
            }}
          >
            <Text style={tekstStijl(is ? "nadruk" : "standaard", is ? c.foreground : c.mutedForeground)}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Blad — onderliggend paneel (bottom sheet) op hoogte 3. */
export function Blad({
  open,
  onSluit,
  titel,
  children,
}: {
  open: boolean;
  onSluit: () => void;
  titel?: string;
  children: React.ReactNode;
}) {
  const c = useColors();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onSluit}>
      <Pressable
        onPress={onSluit}
        style={{ flex: 1, backgroundColor: c.dark, opacity: 0.5 }}
        accessibilityLabel="Sluiten"
      />
      <View
        style={{
          backgroundColor: c.card,
          borderTopLeftRadius: c.radius + ruimte.xs,
          borderTopRightRadius: c.radius + ruimte.xs,
          padding: ruimte.xl,
          gap: ruimte.l,
          ...hoogte[3],
        }}
      >
        <View
          style={{
            alignSelf: "center",
            width: ruimte.xxl + ruimte.s,
            height: ruimte.xs,
            borderRadius: ruimte.xs / 2,
            backgroundColor: c.border,
          }}
        />
        {titel ? <Text style={tekstStijl("sectiekop", c.foreground)}>{titel}</Text> : null}
        {children}
      </View>
    </Modal>
  );
}

/** Ladenstaat — skeletonblokken tijdens laden; staat stil bij verminderde beweging. */
export function Ladenstaat({ regels = 3 }: { regels?: number }) {
  const c = useColors();
  const rustig = useReducedMotion();
  const puls = useSharedValue(1);
  useEffect(() => {
    if (rustig) {
      puls.value = withTiming(1, { duration: 0 });
      return;
    }
    puls.value = withRepeat(
      withTiming(0.45, {
        duration: beweging.traag * 2,
        easing: Easing.bezier(...beweging.versnelling),
      }),
      -1,
      true,
    );
  }, [rustig, puls]);
  const stijl = useAnimatedStyle(() => ({ opacity: rustig ? 0.7 : puls.value }));
  return (
    <View style={{ gap: ruimte.m }}>
      {Array.from({ length: regels }).map((_, i) => (
        <Animated.View
          key={i}
          style={[
            {
              height: ruimte.xl + ruimte.s,
              borderRadius: c.radius,
              backgroundColor: c.secondary,
            },
            stijl,
          ]}
        />
      ))}
    </View>
  );
}

/** Waarschuwvlak — opvallend maar rustig vlak voor waarschuwingen of fouten. */
export function Waarschuwvlak({
  tekst,
  soort = "waarschuwing",
}: {
  tekst: string;
  soort?: "waarschuwing" | "fout" | "info";
}) {
  const c = useColors();
  const kleur = soort === "fout" ? c.destructive : soort === "info" ? c.tint : c.warning;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: ruimte.s + 2,
        backgroundColor: c.secondary,
        borderLeftWidth: ruimte.xs - 1,
        borderLeftColor: kleur,
        borderRadius: c.radius,
        padding: ruimte.m,
      }}
    >
      <Ionicons
        name={soort === "info" ? "information-circle-outline" : "warning-outline"}
        size={ruimte.l + ruimte.xs}
        color={kleur}
      />
      <Text style={[tekstStijl("klein", c.foreground), { flex: 1 }]}>{tekst}</Text>
    </View>
  );
}

const euroFormaat = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

/** Bedragregel — label + euro-bedrag volgens de vaste bedragweergave (nl-NL). */
export function Bedragregel({
  label,
  bedrag,
  nadruk = false,
}: {
  label: string;
  /** Bedrag in euro's (geen centen). */
  bedrag: number;
  nadruk?: boolean;
}) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: ruimte.m, paddingVertical: ruimte.xs }}>
      <Text style={tekstStijl(nadruk ? "nadruk" : "standaard", nadruk ? c.foreground : c.mutedForeground)}>
        {label}
      </Text>
      <Text style={tekstStijl(nadruk ? "nadruk" : "standaard", c.foreground)}>{euroFormaat.format(bedrag)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
});
