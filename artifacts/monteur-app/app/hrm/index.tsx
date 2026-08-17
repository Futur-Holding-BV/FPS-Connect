import { useGetHrmStats, useGetMijnCertificaten } from "@workspace/api-client-react";
import { ruimte } from "@workspace/ontwerp";
import { Redirect, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Kaart, Statusmerk, bovenInset, tekstStijl } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { heeftBevoegdheid } from "@/lib/bevoegdheden";
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
  const { token, gebruiker, bezigLaden } = useAuth();
  // APP_01 §4 — teamstatistieken (andermans gegevens) alleen met de module
  // `personeel`; de eigen onderdelen hieronder zijn een basisrecht.
  const magPersoneel = heeftBevoegdheid(gebruiker, { module: "personeel", niveau: 1 });
  const { data: stats, isLoading } = useGetHrmStats({ query: { enabled: magPersoneel } } as any);
  const { data: certificaten } = useGetMijnCertificaten();

  // Deep-link-race: niet redirecten zolang het token nog hersteld wordt.
  if (bezigLaden) return null;
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

  const statusSoort: Record<CertStatus, "neutraal" | "succes" | "waarschuwing" | "fout" | "primair"> = {
    verlopen: "fout",
    binnenkort: "waarschuwing",
    geldig: "succes",
    onbekend: "neutraal",
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
    { titel: "Mijn CAO-keuzes", omschrijving: "Vakantiegeld, gereedschapsgeld en spaarfonds", route: "/hrm/keuzes" as const, testID: "hrm-keuzes-navkaart" },
    { titel: "Declaraties", omschrijving: "Onkosten en reiskosten indienen", route: "/hrm/declaraties" as const, testID: "hrm-declaraties-navkaart" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ backgroundColor: c.dark, paddingTop: bovenInset(insets) + ruimte.m, paddingHorizontal: ruimte.xl, paddingBottom: ruimte.l + 2 }}>
        <View style={{ width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
          <Pressable onPress={() => router.back()} style={{ marginBottom: ruimte.s + 2 }}>
            <Text style={tekstStijl("nadruk", c.primary)}>‹ Terug</Text>
          </Pressable>
          <View style={{ flexDirection: "row", alignItems: "center", gap: ruimte.m + 2 }}>
            <View style={{ backgroundColor: c.card, borderRadius: c.radius / 2, paddingHorizontal: ruimte.s + 2, paddingVertical: ruimte.xs + 2 }}>
              <Image
                source={require("../../assets/images/logo-fps.png")}
                style={{ width: 90, height: 35, resizeMode: "contain" }}
                accessibilityLabel="FPS Brandpreventie"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={tekstStijl("schermtitel", c.darkForeground)}>{magPersoneel ? "Personeel" : "Mijn gegevens"}</Text>
              <Text style={[tekstStijl("klein", c.darkMuted), { marginTop: 2 }]}>
                {gebruiker?.naam ?? "Medewerker"}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: ruimte.l, gap: ruimte.m + 2, paddingBottom: insets.bottom + ruimte.xxl, width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}
      >
        {!magPersoneel ? null : isLoading ? (
          <ActivityIndicator size="large" color={c.primary} style={{ marginTop: ruimte.xxl }} />
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: ruimte.m }}>
            {statItems.map((s) => (
              <Kaart
                key={s.label}
                stijl={{ flexGrow: 1, flexBasis: "45%", padding: ruimte.l }}
              >
                <Text style={tekstStijl("klein", c.mutedForeground)}>{s.label}</Text>
                <Text style={[tekstStijl("schermtitel", c.foreground), { fontSize: 26, lineHeight: 32, marginTop: ruimte.xs }]}>{s.waarde}</Text>
              </Kaart>
            ))}
          </View>
        )}

        {/* Mijn veiligheidscertificaten */}
        <Kaart stijl={{ padding: ruimte.l }}>
          <Text style={[tekstStijl("nadruk", c.foreground), { marginBottom: ruimte.m }]}>
            Mijn veiligheidscertificaten
          </Text>
          {certs.map((cert) => {
            const status = certStatus(cert.datum);
            return (
              <View
                key={cert.label}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: ruimte.s, borderBottomWidth: 1, borderBottomColor: c.border }}
              >
                <Text style={[tekstStijl("standaard", c.foreground), { fontFamily: "Inter_600SemiBold", width: 52 }]}>
                  {cert.label}
                </Text>
                <Text style={[tekstStijl("klein", c.mutedForeground), { flex: 1, paddingHorizontal: ruimte.s }]}>
                  {fmtDatum(cert.datum)}
                </Text>
                <Statusmerk label={statusLabel[status]} soort={statusSoort[status]} />
              </View>
            );
          })}
        </Kaart>

        <View style={{ gap: ruimte.m }}>
          {navKaarten.map((k) => (
            <Pressable
              key={k.route}
              testID={k.testID}
              onPress={() => router.push(k.route)}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            >
              <Kaart stijl={{ padding: ruimte.l + 2, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Text style={tekstStijl("sectiekop", c.foreground)}>{k.titel}</Text>
                  <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 2 }]}>
                    {k.omschrijving}
                  </Text>
                </View>
                <Text style={[tekstStijl("sectiekop", c.primary), { fontSize: 22 }]}>›</Text>
              </Kaart>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
