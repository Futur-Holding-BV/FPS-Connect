import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
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

type TekstVeldProps = TextInputProps & {
  label: string;
};

export function TekstVeld({ label, style, ...rest }: TekstVeldProps) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, { color: c.mutedForeground }]}>{label}</Text>
      <TextInput
        placeholderTextColor={c.mutedForeground}
        style={[
          {
            backgroundColor: c.card,
            borderColor: c.input,
            borderWidth: 1.5,
            borderRadius: c.radius,
            paddingHorizontal: 16,
            paddingVertical: 14,
            fontSize: 17,
            color: c.foreground,
            fontFamily: "Inter_400Regular",
          },
          style,
        ]}
        {...rest}
      />
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

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
});
