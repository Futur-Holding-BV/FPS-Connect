import { Ionicons } from "@expo/vector-icons";
import { ruimte } from "@workspace/ontwerp";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bovenInset, tekstStijl } from "@/components/ui";
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
          paddingTop: bovenInset(insets) + ruimte.m,
          paddingHorizontal: ruimte.l + ruimte.xs,
          paddingBottom: ruimte.l + 2,
        }}
      >
        <Pressable onPress={() => router.back()} style={{ marginBottom: ruimte.s + 2 }}>
          <Text style={tekstStijl("sectiekop", c.primary)}>
            ‹ Terug
          </Text>
        </Pressable>
        <Text style={tekstStijl("schermtitel", c.darkForeground)}>
          {titel ?? "Binnenkort"}
        </Text>
      </View>

      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: ruimte.xxl,
          gap: ruimte.l,
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
          style={[tekstStijl("sectiekop", c.foreground), { textAlign: "center" }]}
        >
          Nog in ontwikkeling
        </Text>
        <Text
          style={[
            tekstStijl("standaard", c.mutedForeground),
            { textAlign: "center", maxWidth: 320 },
          ]}
        >
          {titel ? `"${titel}" is ` : "Deze module is "}
          nog niet beschikbaar. We werken eraan en voegen het binnenkort toe aan de app.
        </Text>
      </View>
    </View>
  );
}
