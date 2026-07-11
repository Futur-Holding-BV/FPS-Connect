import { useGetHrmStats, useGetMijnCertificaten } from "@workspace/api-client-react";
import { Redirect, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

function fmtDatum(datum?: string | null) {
  if (!datum) return "—";
  const d = new Date(datum);
  if (Number.isNaN(d.getTime())) return datum;
  return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
}

type CertStatus = "verlopen" | "binnenkort" | "geldig" | "onbekend";

function certStatus(datum?: string | null): CertStatus {
  if (!datum) return "onbekend";
  const t = new Date(datum).getTime();
  if (!Number.isFinite(t)) return "onbekend";
  const nu = Date.now();
  if (t < nu) return "verlopen";
  if (t <= nu + 60 * 24 * 60 * 60 * 1000) return "binnenkort";
  return "geldig";
}

export default function HrmDashboard() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { inhoudMaxBreedte } = useResponsive();
  const { token, gebruiker } = useAuth();
  const { data: stats, isLoading } = useGetHrmStats();
  const { data: certificaten } = useGetMijnCertificaten();

  if (!token) return <Redirect href="/login" />;

  const statItems = [
    { label: "Actief", waarde: stats?.actief ?? 0 },
    { label: "Certificaten verlopen binnenkort", waarde: stats?.certificaten_verlopen_binnenkort ?? 0 },
    { label: "Openstaande verlofaanvragen", waarde: stats?.openstaande_verlofaanvragen ?? 0 },
  ];

  const certs = [
    { label: "VCA", datum: certificaten?.vca_vervaldatum ?? null },
    { label: "EHBO", datum: certificaten?.ehbo_vervaldatum ?? null },
    { label: "BHV", datum: certificaten?.bhv_vervaldatum ?? null },
  ];

  const statusKleur: Record<CertStatus, string> = {
    verlopen: "#dc2626",
    binnenkort: "#d97706",
    geldig: "#16a34a",
    onbekend: c.mutedForeground,
  };

  const statusLabel: Record<CertStatus, string> = {
    verlopen: "Verlopen",
    binnenkort: "Binnenkort",
    geldig: "Geldig",
    onbekend: "Niet ingevuld",
  };

  const navKaarten = [
    { titel: "Verlof", omschrijving: "Saldo bekijken en aanvragen", route: "/hrm/verlof" as const, testID: "hrm-verlof-navkaart" },
    { titel: "Loonstrookjes", omschrijving: "Loonstroken en jaaropgaven bekijken", route: "/hrm/loonstrookjes" as const, testID: "hrm-loonstrookjes-navkaart" },
    { titel: "Opleidingen", omschrijving: "Trainingen, certificaten en bekwaamheden", route: "/hrm/opleidingen" as const, testID: "hrm-opleidingen-navkaart" },
    { titel: "Kennisbank", omschrijving: "Werkafspraken, handboeken en toolboxen", route: "/hrm/kennisbank" as const, testID: "hrm-kennisbank-navkaart" },
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

        {/* Mijn veiligheidscertificaten */}
        <View style={{ backgroundColor: c.card, borderRadius: c.radius, borderWidth: 1, borderColor: c.border, padding: 16 }}>
          <Text style={{ color: c.foreground, fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 12 }}>
            Mijn veiligheidscertificaten
          </Text>
          {certs.map((cert) => {
            const status = certStatus(cert.datum);
            return (
              <View
                key={cert.label}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}
              >
                <Text style={{ color: c.foreground, fontSize: 14, fontFamily: "Inter_600SemiBold", width: 52 }}>
                  {cert.label}
                </Text>
                <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular", flex: 1, paddingHorizontal: 8 }}>
                  {fmtDatum(cert.datum)}
                </Text>
                <View style={{ backgroundColor: statusKleur[status] + "1a", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: statusKleur[status], fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                    {statusLabel[status]}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={{ gap: 12 }}>
          {navKaarten.map((k) => (
            <Pressable
              key={k.route}
              testID={k.testID}
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
