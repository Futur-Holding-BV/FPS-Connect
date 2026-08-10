import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface LegeStatusProps {
  icoon?: keyof typeof Ionicons.glyphMap;
  titel: string;
  beschrijving?: string;
  actieLabel?: string;
  actieOnPress?: () => void;
  secondairActieLabel?: string;
  secondairActieOnPress?: () => void;
}

export function LegeStatus({
  icoon,
  titel,
  beschrijving,
  actieLabel,
  actieOnPress,
  secondairActieLabel,
  secondairActieOnPress,
}: LegeStatusProps) {
  const c = useColors();

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 32,
        paddingVertical: 48,
      }}
    >
      {icoon && (
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: c.border,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <Ionicons name={icoon} size={28} color={c.mutedForeground} />
        </View>
      )}
      <Text
        style={{
          fontSize: 16,
          fontFamily: "Inter_600SemiBold",
          color: c.foreground,
          textAlign: "center",
          marginBottom: 6,
        }}
      >
        {titel}
      </Text>
      {beschrijving && (
        <Text
          style={{
            fontSize: 14,
            fontFamily: "Inter_400Regular",
            color: c.mutedForeground,
            textAlign: "center",
            lineHeight: 20,
            maxWidth: 300,
          }}
        >
          {beschrijving}
        </Text>
      )}
      {(actieLabel || secondairActieLabel) && (
        <View style={{ marginTop: 20, gap: 10, alignItems: "center" }}>
          {actieLabel && actieOnPress && (
            <Pressable
              onPress={actieOnPress}
              style={({ pressed }) => ({
                backgroundColor: c.primary,
                opacity: pressed ? 0.85 : 1,
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 8,
              })}
            >
              <Text
                style={{
                  color: c.primaryForeground,
                  fontSize: 14,
                  fontFamily: "Inter_600SemiBold",
                }}
              >
                {actieLabel}
              </Text>
            </Pressable>
          )}
          {secondairActieLabel && secondairActieOnPress && (
            <Pressable
              onPress={secondairActieOnPress}
              style={({ pressed }) => ({
                borderWidth: 1,
                borderColor: c.border,
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 8,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text
                style={{
                  color: c.foreground,
                  fontSize: 14,
                  fontFamily: "Inter_400Regular",
                }}
              >
                {secondairActieLabel}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
