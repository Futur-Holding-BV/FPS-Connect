import { Ionicons } from "@expo/vector-icons";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";

export default function Binnenkort() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { titel } = useLocalSearchParams<{ titel?: string }>();

  if (!token) return <Redirect href="/login" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={{
          backgroundColor: c.dark,
          paddingTop: bovenInset(insets) + 12,
          paddingHorizontal: 20,
          paddingBottom: 18,
        }}
      >
        <Pressable onPress={() => router.back()} style={{ marginBottom: 10 }}>
          <Text style={{ color: c.primary, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>
            ‹ Terug
          </Text>
        </Pressable>
        <Text style={{ color: c.darkForeground, fontSize: 22, fontFamily: "Inter_700Bold" }}>
          {titel ?? "Binnenkort"}
        </Text>
      </View>

      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
          gap: 16,
        }}
      >
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: c.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="construct-outline" size={40} color={c.primary} />
        </View>
        <Text
          style={{
            color: c.foreground,
            fontSize: 19,
            fontFamily: "Inter_700Bold",
            textAlign: "center",
          }}
        >
          Nog in ontwikkeling
        </Text>
        <Text
          style={{
            color: c.mutedForeground,
            fontSize: 15,
            fontFamily: "Inter_400Regular",
            textAlign: "center",
            lineHeight: 22,
            maxWidth: 320,
          }}
        >
          {titel ? `"${titel}" is ` : "Deze module is "}
          nog niet beschikbaar. We werken eraan en voegen het binnenkort toe aan de app.
        </Text>
      </View>
    </View>
  );
}
