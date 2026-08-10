import {
  useGetGebouw,
  useListGebouwTekeningen,
  useListVerdiepingen,
  useListOpdrachten,
  type Opdracht,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ruimte } from "@workspace/ontwerp";

import { LijstFout, Ladenstaat, Statusmerk, tekstStijl, bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { heeftBevoegdheid } from "@/lib/bevoegdheden";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

export default function GebouwDetail() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const gebouwId = Number(id);
  const { kolommen, inhoudMaxBreedte, breedte } = useResponsive();
  const RASTER_GAP = 12;
  const beschikbareBreedte = Math.min(breedte, inhoudMaxBreedte ?? breedte) - 32;
  const itemBreedte =
    kolommen > 1 ? (beschikbareBreedte - RASTER_GAP * (kolommen - 1)) / kolommen : undefined;

  const { gebruiker } = useAuth();
  const magProjecten = heeftBevoegdheid(gebruiker, { module: "projecten", niveau: 1 });

  const { data: gebouw } = useGetGebouw(gebouwId);
  const { data: verdiepingen, isLoading, isError, refetch } = useListVerdiepingen(gebouwId);
  const { data: tekeningen } = useListGebouwTekeningen(gebouwId);
  const { data: opdrachtenData } = useListOpdrachten(
    { gebouw_id: gebouwId },
    { query: { enabled: magProjecten && !Number.isNaN(gebouwId) } } as any,
  );

  const gesorteerd = [...(verdiepingen ?? [])].sort((a, b) => a.niveau - b.niveau);
  const documenten = (tekeningen ?? []).filter((t) => t.zichtbaar_monteur === true);
  // Client-side filteren op gebouw_id als extra vangnet (de API filtert al via param).
  const opdrachten = ((opdrachtenData as Opdracht[]) ?? []).filter(
    (o) => o.gebouw_id === gebouwId,
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={{
          backgroundColor: c.dark,
          paddingTop: bovenInset(insets) + ruimte.m,
          paddingHorizontal: ruimte.xl,
          paddingBottom: ruimte.l,
        }}
      >
        <View style={{ width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
        <Pressable onPress={() => router.back()} style={{ marginBottom: ruimte.s }}>
          <Text style={tekstStijl("nadruk", c.primary)}>
            ‹ Terug
          </Text>
        </Pressable>
        <Text style={tekstStijl("schermtitel", c.darkForeground)}>
          {gebouw?.naam ?? "Gebouw"}
        </Text>
        <Text style={[tekstStijl("klein", c.darkMuted), { marginTop: ruimte.xs }]}>
          Kies een verdieping om de plattegrond te openen
        </Text>
        </View>
      </View>

      {isLoading ? (
        <View style={{ padding: ruimte.l }}>
          <Ladenstaat regels={6} />
        </View>
      ) : isError ? (
        <LijstFout
          beschrijving="De verdiepingen konden niet worden geladen. Controleer je verbinding en probeer het opnieuw."
          onOpnieuw={() => refetch()}
        />
      ) : (
        <FlatList
          data={gesorteerd}
          key={`kol-${kolommen}`}
          keyExtractor={(v) => String(v.id)}
          numColumns={kolommen}
          columnWrapperStyle={kolommen > 1 ? { gap: RASTER_GAP } : undefined}
          contentContainerStyle={{ padding: ruimte.l, gap: ruimte.m, paddingBottom: insets.bottom + ruimte.xl, width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}
          ListEmptyComponent={
            <Text style={[tekstStijl("standaard", c.mutedForeground), { textAlign: "center", marginTop: ruimte.xxl + ruimte.l }]}>
              Dit gebouw heeft nog geen verdiepingen.
            </Text>
          }
          ListFooterComponent={
            <View style={{ gap: ruimte.m }}>
            {magProjecten && opdrachten.length > 0 ? (
              <View style={{ marginTop: ruimte.m, gap: ruimte.s + 2 }}>
                <Text
                  style={[
                    tekstStijl("bijschrift", c.mutedForeground),
                    { textTransform: "uppercase", letterSpacing: 0.5 },
                  ]}
                >
                  Opdrachten
                </Text>
                {opdrachten.map((o) => (
                  <Pressable
                    key={o.id}
                    onPress={() => router.push(`/projecten/${o.id}`)}
                    style={({ pressed }) => ({
                      backgroundColor: c.card,
                      borderRadius: c.radius,
                      borderWidth: 1,
                      borderColor: c.border,
                      padding: ruimte.l,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: ruimte.m + 2,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <View
                      style={{
                        width: ruimte.xl + ruimte.xl,
                        height: ruimte.xl + ruimte.xl,
                        borderRadius: c.radius / 2,
                        backgroundColor: c.secondary,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={[tekstStijl("bijschrift", c.mutedForeground), { fontFamily: "Inter_700Bold" }]}>
                        {o.werknummer ?? `#${o.id}`}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={tekstStijl("nadruk", c.foreground)} numberOfLines={1}>
                        {o.titel}
                      </Text>
                      <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: ruimte.xs / 2 }]}>
                        {o.status}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {documenten.length > 0 ? (
              <View style={{ marginTop: ruimte.m, gap: ruimte.s + 2 }}>
                <Text
                  style={[
                    tekstStijl("bijschrift", c.mutedForeground),
                    { textTransform: "uppercase", letterSpacing: 0.5 },
                  ]}
                >
                  Documenten
                </Text>
                {documenten.map((t) => {
                  const ext = (t.url.split("?")[0].split(".").pop() ?? "")
                    .toUpperCase()
                    .slice(0, 4);
                  return (
                  <Pressable
                    key={t.id}
                    onPress={() =>
                      router.push(
                        `/document/${t.id}?url=${encodeURIComponent(t.url)}&naam=${encodeURIComponent(t.naam)}`,
                      )
                    }
                    style={({ pressed }) => ({
                      backgroundColor: c.card,
                      borderRadius: c.radius,
                      borderWidth: 1,
                      borderColor: c.border,
                      padding: ruimte.l,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: ruimte.m + 2,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <View
                      style={{
                        width: ruimte.xl + ruimte.xl,
                        height: ruimte.xl + ruimte.xl,
                        borderRadius: c.radius / 2,
                        backgroundColor: c.secondary,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={[tekstStijl("bijschrift", c.mutedForeground), { fontFamily: "Inter_700Bold" }]}>
                        {ext || "DOC"}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={tekstStijl("nadruk", c.foreground)}
                        numberOfLines={1}
                      >
                        {t.naam}
                      </Text>
                      <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: ruimte.xs / 2 }]}>
                        Tik om te openen
                      </Text>
                    </View>
                  </Pressable>
                  );
                })}
              </View>
            ) : null}
            </View>
          }
          renderItem={({ item }) => {
            const heeftPlan = !!item.plattegrond_url;
            return (
              <Pressable
                onPress={() =>
                  router.push(
                    `/plattegrond/${item.id}?gebouwId=${gebouwId}&naam=${encodeURIComponent(item.naam)}`,
                  )
                }
                style={({ pressed }) => ({
                  backgroundColor: c.card,
                  borderRadius: c.radius,
                  borderWidth: 1,
                  borderColor: c.border,
                  padding: ruimte.l,
                  width: itemBreedte,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: ruimte.m + 2,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <View
                  style={{
                    width: ruimte.xxl + ruimte.l,
                    height: ruimte.xxl + ruimte.l,
                    borderRadius: c.radius,
                    backgroundColor: c.accent,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={tekstStijl("sectiekop", c.accentForeground)}>
                    {item.niveau}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={tekstStijl("sectiekop", c.foreground)}>
                    {item.naam}
                  </Text>
                  <Text style={[tekstStijl("standaard", c.mutedForeground), { marginTop: ruimte.xs / 2 }]}>
                    {item.totaal_voorzieningen ?? 0} voorzieningen
                  </Text>
                </View>
                <Statusmerk
                  label={heeftPlan ? "Plattegrond" : "Geen plan"}
                  soort={heeftPlan ? "succes" : "neutraal"}
                />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
