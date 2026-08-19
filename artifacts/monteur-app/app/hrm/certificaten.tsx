import { useGetMijnCertificaten } from "@workspace/api-client-react";
import { ruimte } from "@workspace/ontwerp";
import { Redirect, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Kaart, LijstFout, Statusmerk, bovenInset, tekstStijl } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

type CertificaatStatus = "geldig" | "binnenkort" | "verlopen" | "onbekend";

function datumLabel(datum?: string | null): string {
  if (!datum) return "Geen vervaldatum vastgelegd";
  const waarde = new Date(datum);
  if (Number.isNaN(waarde.getTime())) return datum;
  return waarde.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function bepaalStatus(datum?: string | null): CertificaatStatus {
  if (!datum) return "onbekend";
  const tijd = new Date(datum).getTime();
  if (!Number.isFinite(tijd)) return "onbekend";
  const nu = Date.now();
  if (tijd < nu) return "verlopen";
  if (tijd <= nu + 60 * 24 * 60 * 60 * 1000) return "binnenkort";
  return "geldig";
}

const STATUS_LABEL: Record<CertificaatStatus, string> = {
  geldig: "Geldig",
  binnenkort: "Verloopt binnenkort",
  verlopen: "Verlopen",
  onbekend: "Niet ingevuld",
};

const STATUS_SOORT: Record<
  CertificaatStatus,
  "neutraal" | "succes" | "waarschuwing" | "fout"
> = {
  geldig: "succes",
  binnenkort: "waarschuwing",
  verlopen: "fout",
  onbekend: "neutraal",
};

export default function CertificatenScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { inhoudMaxBreedte } = useResponsive();
  const { token } = useAuth();
  const { data, isLoading, isError, isRefetching, refetch } = useGetMijnCertificaten({
    query: { queryKey: ["mijn", "certificaten"], retry: false },
  });

  if (!token) return <Redirect href="/login" />;

  const certificaten = [
    { naam: "VCA", omschrijving: "Veiligheid, gezondheid en milieu", datum: data?.vca_vervaldatum },
    { naam: "EHBO", omschrijving: "Eerste hulp bij ongevallen", datum: data?.ehbo_vervaldatum },
    { naam: "BHV", omschrijving: "Bedrijfshulpverlening", datum: data?.bhv_vervaldatum },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={{
          backgroundColor: c.dark,
          paddingTop: bovenInset(insets) + ruimte.m,
          paddingHorizontal: ruimte.xl,
          paddingBottom: ruimte.l + 2,
        }}
      >
        <View style={{ width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
          <Pressable onPress={() => router.back()} style={{ marginBottom: ruimte.s + 2 }}>
            <Text style={tekstStijl("nadruk", c.primary)}>‹ Terug</Text>
          </Pressable>
          <Text style={tekstStijl("schermtitel", c.darkForeground)}>Mijn certificaten</Text>
          <Text style={[tekstStijl("klein", c.darkMuted), { marginTop: 2 }]}>
            Geldigheid van uw veiligheidscertificaten
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : isError ? (
        <LijstFout
          beschrijving="De certificaten konden niet worden geladen. Controleer uw verbinding en probeer het opnieuw."
          onOpnieuw={() => void refetch()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: ruimte.l,
            gap: ruimte.m,
            paddingBottom: insets.bottom + ruimte.xxl,
            width: "100%",
            maxWidth: inhoudMaxBreedte,
            alignSelf: "center",
          }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              tintColor={c.primary}
            />
          }
        >
          {certificaten.map((certificaat) => {
            const status = bepaalStatus(certificaat.datum);
            return (
              <Kaart key={certificaat.naam} stijl={{ padding: ruimte.l }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: ruimte.m,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={tekstStijl("sectiekop", c.foreground)}>
                      {certificaat.naam}
                    </Text>
                    <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 2 }]}>
                      {certificaat.omschrijving}
                    </Text>
                  </View>
                  <Statusmerk label={STATUS_LABEL[status]} soort={STATUS_SOORT[status]} />
                </View>
                <Text style={[tekstStijl("standaard", c.foreground), { marginTop: ruimte.l }]}>
                  {datumLabel(certificaat.datum)}
                </Text>
              </Kaart>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}