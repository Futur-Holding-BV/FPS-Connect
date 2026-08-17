import { useGetMijnOpleidingen, useListOpleidingen } from "@workspace/api-client-react";
import { ruimte } from "@workspace/ontwerp";
import { Redirect, useRouter } from "expo-router";
import React from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Kaart, Ladenstaat, LijstFout, Statusmerk, bovenInset, netteWaarde, tekstStijl } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

function isVerlopen(datum: string | null | undefined): boolean {
  if (!datum) return false;
  return new Date(datum).getTime() < Date.now();
}

function isBinnenkortVerlopen(datum: string | null | undefined): boolean {
  if (!datum) return false;
  const t = new Date(datum).getTime();
  const nu = Date.now();
  return t >= nu && t <= nu + 60 * 24 * 60 * 60 * 1000;
}

export default function OpleidingenScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { inhoudMaxBreedte } = useResponsive();
  const { token } = useAuth();
  const { data, isLoading, isError, refetch, isRefetching } = useListOpleidingen();
  const { data: mijnData } = useGetMijnOpleidingen({ query: { queryKey: ["mijn", "opleidingen"], retry: false } });

  if (!token) return <Redirect href="/login" />;

  const opleidingen = data ?? [];
  const mijnOpleidingen = mijnData ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ backgroundColor: c.dark, paddingTop: bovenInset(insets) + ruimte.m, paddingHorizontal: ruimte.xl, paddingBottom: ruimte.l + 2 }}>
        <View style={{ width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
          <Pressable onPress={() => router.back()} style={{ marginBottom: ruimte.s + 2 }}>
            <Text style={tekstStijl("nadruk", c.primary)}>‹ Terug</Text>
          </Pressable>
          <Text style={tekstStijl("schermtitel", c.darkForeground)}>Opleidingen</Text>
          <Text style={[tekstStijl("klein", c.darkMuted), { marginTop: 2 }]}>
            Trainingen en certificaten
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, padding: ruimte.l, width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
          <Ladenstaat regels={5} />
        </View>
      ) : isError ? (
        <LijstFout
          beschrijving="De opleidingen konden niet worden geladen. Controleer je verbinding en probeer het opnieuw."
          onOpnieuw={() => refetch()}
        />
      ) : (
        <FlatList
          data={opleidingen}
          keyExtractor={(o) => String(o.id)}
          contentContainerStyle={{ padding: ruimte.l, gap: ruimte.m, paddingBottom: insets.bottom + ruimte.xl, width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.primary} />}
          ListEmptyComponent={
            <Text style={[tekstStijl("standaard", c.mutedForeground), { textAlign: "center", marginTop: ruimte.xxl + ruimte.l }]}>
              Geen opleidingen gevonden.
            </Text>
          }
          ListHeaderComponent={
            mijnOpleidingen.length > 0 ? (
              <View style={{ marginBottom: ruimte.xs }}>
                <Text style={[tekstStijl("nadruk", c.foreground), { marginBottom: ruimte.s }]}>
                  Mijn opleidingen
                </Text>
                <View style={{ gap: ruimte.m - 2, marginBottom: ruimte.l }}>
                  {mijnOpleidingen.map((m) => {
                    const verlopen = isVerlopen(m.verloopt_op);
                    const bijnaVerlopen = !verlopen && isBinnenkortVerlopen(m.verloopt_op);
                    return (
                      <Kaart
                        key={m.id}
                        stijl={{ borderColor: verlopen ? c.destructive : c.border, padding: ruimte.m + 2 }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: ruimte.s }}>
                          <Text style={[tekstStijl("nadruk", c.foreground), { flex: 1 }]}>
                            {m.opleiding_naam}
                          </Text>
                          <Statusmerk
                            label={verlopen ? "Verlopen" : netteWaarde(m.status)}
                            soort={verlopen ? "fout" : bijnaVerlopen ? "waarschuwing" : "neutraal"}
                          />
                        </View>
                        {m.behaald_op ? (
                          <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: ruimte.xs + 2 }]}>
                            Behaald op {new Date(m.behaald_op).toLocaleDateString("nl-NL")}
                          </Text>
                        ) : null}
                        {m.verloopt_op ? (
                          <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 2 }]}>
                            {verlopen ? "Verlopen op" : "Geldig tot"} {new Date(m.verloopt_op).toLocaleDateString("nl-NL")}
                          </Text>
                        ) : null}
                        {m.opleider ? (
                          <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 2 }]}>
                            Opleider: {m.opleider}
                          </Text>
                        ) : null}
                      </Kaart>
                    );
                  })}
                </View>
                <Text style={[tekstStijl("nadruk", c.foreground), { marginBottom: ruimte.s }]}>
                  Catalogus
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Kaart stijl={{ padding: ruimte.l + 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: ruimte.s }}>
                <Text style={[tekstStijl("sectiekop", c.foreground), { flex: 1, fontFamily: "Inter_700Bold" }]}>{item.naam}</Text>
                {item.verplicht ? (
                  <View style={{ backgroundColor: c.accent, paddingHorizontal: ruimte.s + 2, paddingVertical: ruimte.xs, borderRadius: c.radius / 2 }}>
                    <Text style={tekstStijl("bijschrift", c.accentForeground)}>verplicht</Text>
                  </View>
                ) : null}
              </View>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: ruimte.xs + 2, marginTop: ruimte.s }}>
                <View style={{ backgroundColor: c.muted, paddingHorizontal: ruimte.s + 2, paddingVertical: ruimte.xs, borderRadius: c.radius / 2 }}>
                  <Text style={tekstStijl("bijschrift", c.mutedForeground)}>
                    {item.soort === "opleiding" ? "Opleiding" : "Cursus"}
                  </Text>
                </View>
                {item.categorie ? (
                  <View style={{ backgroundColor: c.muted, paddingHorizontal: ruimte.s + 2, paddingVertical: ruimte.xs, borderRadius: c.radius / 2 }}>
                    <Text style={tekstStijl("bijschrift", c.mutedForeground)}>
                      {item.categorie}
                    </Text>
                  </View>
                ) : null}
                {item.niveau ? (
                  <View style={{ backgroundColor: c.muted, paddingHorizontal: ruimte.s + 2, paddingVertical: ruimte.xs, borderRadius: c.radius / 2 }}>
                    <Text style={tekstStijl("bijschrift", c.mutedForeground)}>
                      {item.niveau}
                    </Text>
                  </View>
                ) : null}
                {item.lesvorm ? (
                  <View style={{ backgroundColor: c.muted, paddingHorizontal: ruimte.s + 2, paddingVertical: ruimte.xs, borderRadius: c.radius / 2 }}>
                    <Text style={tekstStijl("bijschrift", c.mutedForeground)}>
                      {item.lesvorm}
                    </Text>
                  </View>
                ) : null}
              </View>

              {item.opleider ? (
                <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: ruimte.s }]}>
                  Opleider: {item.opleider}
                </Text>
              ) : null}
              {item.studieduur || item.studiebelasting ? (
                <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 2 }]}>
                  {[item.studieduur, item.studiebelasting].filter(Boolean).join(" · ")}
                </Text>
              ) : null}
              {item.kosten_werkgever_pct != null || item.kosten_werknemer_pct != null ? (
                <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 2 }]}>
                  Kostenverdeling: werkgever {item.kosten_werkgever_pct ?? 0}% · werknemer {item.kosten_werknemer_pct ?? 0}%
                </Text>
              ) : null}
              {item.geldigheid_maanden != null ? (
                <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: 2 }]}>
                  Geldig {item.geldigheid_maanden} maanden
                </Text>
              ) : null}
            </Kaart>
          )}
        />
      )}
    </View>
  );
}
