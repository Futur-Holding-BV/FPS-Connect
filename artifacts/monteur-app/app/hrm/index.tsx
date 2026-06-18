import { useGetHrmStats } from "@workspace/api-client-react";
import { Redirect, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

export default function HrmDashboard() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { inhoudMaxBreedte } = useResponsive();
  const { token, gebruiker } = useAuth();
  const { data: stats, isLoading } = useGetHrmStats();

  if (!token) return <Redirect href="/login" />;

  const statItems = [
    { label: "Medewerkers", waarde: stats?.medewerkers ?? 0 },
    { label: "Actief", waarde: stats?.actief ?? 0 },
    { label: "Functies", waarde: stats?.functies ?? 0 },
    { label: "Certificaten verlopen", waarde: stats?.certificaten_verlopen_binnenkort ?? 0 },
  ];

  const navKaarten = [
    { titel: "Verlof", omschrijving: "Saldo bekijken en aanvragen", route: "/hrm/verlof" as const },
    { titel: "Opleidingen", omschrijving: "Trainingen en certificaten", route: "/hrm/opleidingen" as const },
    { titel: "Kennisbank", omschrijving: "Naslag en veilig werken", route: "/hrm/kennisbank" as const },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ backgroundColor: c.dark, paddingTop: bovenInset(insets) + 12, paddingHorizontal: 20, paddingBottom: 18 }}>
        <View style={{ width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
          <Pressable onPress={() => router.back()} style={{ marginBottom: 10 }}>
            <Text style={{ color: c.primary, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>‹ Terug</Text>
          </Pressable>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View style={{ backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Image
                source={require("../../assets/images/logo-fps.png")}
                style={{ width: 90, height: 35, resizeMode: "contain" }}
                accessibilityLabel="FPS Brandpreventie"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.darkForeground, fontSize: 20, fontFamily: "Inter_700Bold" }}>Personeel</Text>
              <Text style={{ color: c.darkMuted, fontSize: 13, marginTop: 2, fontFamily: "Inter_400Regular" }}>
                {gebruiker?.naam ?? "Medewerker"}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 32, width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}
      >
        {isLoading ? (
          <ActivityIndicator size="large" color={c.primary} style={{ marginTop: 32 }} />
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {statItems.map((s) => (
              <View
                key={s.label}
                style={{
                  flexGrow: 1,
                  flexBasis: "45%",
                  backgroundColor: c.card,
                  borderRadius: c.radius,
                  borderWidth: 1,
                  borderColor: c.border,
                  padding: 16,
                }}
              >
                <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>{s.label}</Text>
                <Text style={{ color: c.foreground, fontSize: 26, fontFamily: "Inter_700Bold", marginTop: 4 }}>{s.waarde}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ gap: 12 }}>
          {navKaarten.map((k) => (
            <Pressable
              key={k.route}
              onPress={() => router.push(k.route)}
              style={({ pressed }) => ({
                backgroundColor: c.card,
                borderRadius: c.radius,
                borderWidth: 1,
                borderColor: c.border,
                padding: 18,
                opacity: pressed ? 0.85 : 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              })}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.foreground, fontSize: 17, fontFamily: "Inter_700Bold" }}>{k.titel}</Text>
                <Text style={{ color: c.mutedForeground, fontSize: 13, marginTop: 2, fontFamily: "Inter_400Regular" }}>
                  {k.omschrijving}
                </Text>
              </View>
              <Text style={{ color: c.primary, fontSize: 22, fontFamily: "Inter_600SemiBold" }}>›</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
