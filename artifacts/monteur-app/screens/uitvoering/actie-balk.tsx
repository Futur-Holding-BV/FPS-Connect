import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useUitvoeringTheme } from "@/context/UitvoeringThemeContext";

type ActieBalkProps = {
  onFoto: () => void;
  onAfgerond: () => void;
  onAfwijking: () => void;
  onVraagAi: () => void;
  afgerondActief?: boolean;
  bezig?: boolean;
  isTablet?: boolean;
};

type ActieKnopProps = {
  icoon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  variant?: "primair" | "normaal" | "gevaar";
  disabled?: boolean;
  bezig?: boolean;
  minHoogte?: number;
};

function ActieKnop({
  icoon,
  label,
  onPress,
  variant = "normaal",
  disabled = false,
  bezig = false,
  minHoogte = 64,
}: ActieKnopProps) {
  const { theme } = useUitvoeringTheme();

  const achtergrond =
    variant === "primair"
      ? theme.accent
      : variant === "gevaar"
        ? theme.gevaar
        : theme.kaart;

  const tekstKleur =
    variant === "primair" || variant === "gevaar"
      ? "#FFFFFF"
      : theme.tekst;

  const icoonKleur =
    variant === "primair" || variant === "gevaar"
      ? "#FFFFFF"
      : theme.accent;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || bezig}
      style={{
        flex: 1,
        minHeight: minHoogte,
        backgroundColor: achtergrond,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 12,
        paddingHorizontal: 8,
        opacity: disabled ? 0.45 : 1,
        gap: 6,
      }}
    >
      {bezig ? (
        <ActivityIndicator size="small" color={tekstKleur} />
      ) : (
        <Ionicons name={icoon} size={24} color={icoonKleur} />
      )}
      <Text
        style={{
          color: tekstKleur,
          fontSize: 11,
          fontFamily: "Inter_600SemiBold",
          textAlign: "center",
          lineHeight: 14,
        }}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Vaste onderbalk met vier primaire acties voor de Uitvoeringsmodus.
 * Minimale knoophoogte 64px (handschoen-proof).
 */
export function UitvoeringActieBalk({
  onFoto,
  onAfgerond,
  onAfwijking,
  onVraagAi,
  afgerondActief = true,
  bezig = false,
  isTablet = false,
}: ActieBalkProps) {
  const { theme } = useUitvoeringTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        backgroundColor: theme.kaart,
        borderTopWidth: 1,
        borderTopColor: theme.rand,
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: Math.max(insets.bottom, 12),
        flexDirection: "row",
        gap: 8,
      }}
    >
      <ActieKnop
        icoon="camera"
        label="Foto maken"
        onPress={onFoto}
        variant="normaal"
        minHoogte={isTablet ? 72 : 64}
      />
      <ActieKnop
        icoon="checkmark-circle"
        label="Stap afgerond"
        onPress={onAfgerond}
        variant="primair"
        disabled={!afgerondActief}
        bezig={bezig}
        minHoogte={isTablet ? 72 : 64}
      />
      <ActieKnop
        icoon="warning"
        label="Afwijking melden"
        onPress={onAfwijking}
        variant="gevaar"
        minHoogte={isTablet ? 72 : 64}
      />
      <ActieKnop
        icoon="chatbubble-ellipses"
        label="Vraag AI"
        onPress={onVraagAi}
        variant="normaal"
        minHoogte={isTablet ? 72 : 64}
      />
    </View>
  );
}
