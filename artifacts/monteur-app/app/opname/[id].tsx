import { Ionicons } from "@expo/vector-icons";
import {
  useGetOpname,
  useCreateOpnameItem,
  useDeleteOpnameItem,
  useSluitOpnameAf,
  useDeleteOpname,
  useListVerdiepingen,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LegeStaat, LijstFout, Statusmerk, tekstStijl, bovenInset } from "@/components/ui";
// `ruimte` wordt in dit scherm als state-variabele gebruikt; de ontwerp-spacingtokens
// importeren we daarom onder het alias `sp` om naamconflicten te voorkomen.
import { ruimte as sp } from "@workspace/ontwerp";
import { useColors } from "@/hooks/useColors";

const SPOT_TYPEN = [
  { waarde: "branddeur", label: "Branddeur", kleur: "#ef4444" },
  { waarde: "doorvoering", label: "Doorvoering", kleur: "#f97316" },
  { waarde: "brandklep", label: "Brandklep", kleur: "#eab308" },
  { waarde: "manchet", label: "Manchet", kleur: "#22c55e" },
  { waarde: "coating", label: "Coating", kleur: "#3b82f6" },
  { waarde: "luik", label: "Luik", kleur: "#8b5cf6" },
  { waarde: "dakdoorvoer", label: "Dakdoorvoer", kleur: "#06b6d4" },
  { waarde: "schuifdeur", label: "Schuifdeur", kleur: "#ec4899" },
  { waarde: "kozijn", label: "Kozijn", kleur: "#14b8a6" },
  { waarde: "overig", label: "Overig", kleur: "#6b7280" },
];

const ACTIES = [
  { waarde: "vervangen", label: "Vervangen" },
  { waarde: "opwaarderen", label: "Opwaarderen" },
  { waarde: "controleren", label: "Controleren" },
  { waarde: "niet-brandwerend-afwerken", label: "Niet-brandw. afwerken" },
];

const BEREIKBAARHEID = [
  { waarde: "goed", label: "Goed", kleur: "#22c55e" },
  { waarde: "beperkt", label: "Beperkt", kleur: "#f97316" },
  { waarde: "moeilijk", label: "Moeilijk", kleur: "#ef4444" },
];

const PRIORITEITEN = [
  { waarde: "laag", label: "Laag" },
  { waarde: "normaal", label: "Normaal" },
  { waarde: "hoog", label: "Hoog" },
];

function ActieBadge({ actie }: { actie: string }) {
  // Actie op het statuspalet: vervangen = fout, opwaarderen = waarschuwing,
  // controleren = primair, niet-brandwerend-afwerken = succes.
  const soortMap: Record<string, "neutraal" | "succes" | "waarschuwing" | "fout" | "primair"> = {
    vervangen: "fout",
    opwaarderen: "waarschuwing",
    controleren: "primair",
    "niet-brandwerend-afwerken": "succes",
  };
  const soort = soortMap[actie] ?? "neutraal";
  const label = ACTIES.find((a) => a.waarde === actie)?.label ?? actie;
  return <Statusmerk label={label} soort={soort} />;
}

function ItemRij({ item, onPress, onVerwijder }: { item: any; onPress: () => void; onVerwijder: () => void }) {
  const c = useColors();
  const type = SPOT_TYPEN.find((t) => t.waarde === item.spot_type);
  // De spot-type kleuren zijn categorische data-kleuren zonder paletequivalent;
  // ze blijven bewust behouden. De fallback valt terug op een ontwerptoken.
  const kleur = type?.kleur ?? c.mutedForeground;
  const label = type?.label ?? item.spot_type;

  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: item.afgerond ? c.muted : c.card,
        borderRadius: c.radius,
        borderWidth: 1,
        borderColor: c.border,
        padding: sp.m + 2,
        marginBottom: sp.s,
        flexDirection: "row",
        alignItems: "center",
        gap: sp.m,
        opacity: item.afgerond ? 0.7 : 1,
      }}
    >
      <View
        style={{
          width: sp.xxl + 4,
          height: sp.xxl + 4,
          borderRadius: sp.s,
          backgroundColor: kleur + "22",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="construct-outline" size={18} color={kleur} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: sp.s, flexWrap: "wrap" }}>
          <Text style={[tekstStijl("standaard", c.foreground), { fontFamily: "Inter_600SemiBold" }]}>
            {label}
          </Text>
          {item.afgerond && (
            <Ionicons name="checkmark-circle" size={15} color={c.success} />
          )}
        </View>
        <View style={{ flexDirection: "row", gap: sp.xs + 2, marginTop: sp.xs, flexWrap: "wrap", alignItems: "center" }}>
          <ActieBadge actie={item.actie} />
          {item.ruimte ? (
            <Text style={tekstStijl("bijschrift", c.mutedForeground)}>
              {item.ruimte}
            </Text>
          ) : null}
          <Text style={tekstStijl("bijschrift", c.mutedForeground)}>
            {item.aantal}x
          </Text>
          {item.fotos?.length > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: sp.xs - 1 }}>
              <Ionicons name="camera-outline" size={12} color={c.mutedForeground} />
              <Text style={tekstStijl("bijschrift", c.mutedForeground)}>
                {item.fotos.length}
              </Text>
            </View>
          )}
        </View>
      </View>
      <Pressable
        onPress={onVerwijder}
        hitSlop={12}
        style={{ padding: sp.xs + 2 }}
      >
        <Ionicons name="trash-outline" size={18} color={c.destructive} />
      </Pressable>
    </Pressable>
  );
}

export default function OpnameDetail() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const opnameId = Number(id);

  const { data: opname, isLoading, isError, refetch } = useGetOpname(opnameId);
  const { data: verdiepingen } = useListVerdiepingen(opname?.gebouw_id ?? 0);
  const maakItem = useCreateOpnameItem();
  const verwijderItem = useDeleteOpnameItem();
  const sluitAf = useSluitOpnameAf();
  const verwijderOpname = useDeleteOpname();

  const [toonNieuwItem, setToonNieuwItem] = useState(false);
  const [spotType, setSpotType] = useState("branddeur");
  const [ruimte, setRuimte] = useState("");
  const [verdiepingId, setVerdiepingId] = useState<number | null>(null);
  const [beschrijving, setBeschrijving] = useState("");
  const [actie, setActie] = useState("controleren");
  const [bereikbaarheid, setBereikbaarheid] = useState("goed");
  const [aantal, setAantal] = useState("1");
  const [afmetingen, setAfmetingen] = useState("");
  const [prioriteit, setPrioriteit] = useState("normaal");
  const [notities, setNotities] = useState("");

  function resetNieuwItem() {
    setSpotType("branddeur");
    setRuimte("");
    setVerdiepingId(null);
    setBeschrijving("");
    setActie("controleren");
    setBereikbaarheid("goed");
    setAantal("1");
    setAfmetingen("");
    setPrioriteit("normaal");
    setNotities("");
  }

  async function itemOpslaan() {
    try {
      await maakItem.mutateAsync({
        id: opnameId,
        data: {
          spot_type: spotType,
          ruimte: ruimte || undefined,
          verdieping_id: verdiepingId ?? undefined,
          beschrijving: beschrijving || undefined,
          actie,
          bereikbaarheid,
          aantal: Number(aantal) || 1,
          afmetingen: afmetingen || undefined,
          prioriteit,
          notities: notities || undefined,
        },
      });
      setToonNieuwItem(false);
      resetNieuwItem();
      await refetch();
    } catch {}
  }

  function bevestigVerwijderItem(itemId: number) {
    Alert.alert(
      "Item verwijderen",
      "Dit item en alle foto's worden definitief verwijderd.",
      [
        { text: "Annuleren", style: "cancel" },
        {
          text: "Verwijderen",
          style: "destructive",
          onPress: async () => {
            await verwijderItem.mutateAsync({ itemId });
            await refetch();
          },
        },
      ],
    );
  }

  function bevestigDefinitief() {
    Alert.alert(
      "Opname definitief maken",
      "Na het definitief maken kan de opname niet meer worden bewerkt.",
      [
        { text: "Annuleren", style: "cancel" },
        {
          text: "Definitief maken",
          onPress: async () => {
            await sluitAf.mutateAsync({ id: opnameId });
            await refetch();
          },
        },
      ],
    );
  }

  function bevestigVerwijder() {
    Alert.alert(
      "Opname verwijderen",
      "Alle items en foto's worden definitief verwijderd.",
      [
        { text: "Annuleren", style: "cancel" },
        {
          text: "Verwijderen",
          style: "destructive",
          onPress: async () => {
            await verwijderOpname.mutateAsync({ id: opnameId });
            router.back();
          },
        },
      ],
    );
  }

  const isDefinitief = opname?.status === "definitief";
  const items = opname?.items ?? [];
  const afgerond = items.filter((i: any) => i.afgerond).length;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View
        style={{
          backgroundColor: c.dark,
          paddingTop: bovenInset(insets) + sp.m,
          paddingHorizontal: sp.xl,
          paddingBottom: sp.l,
        }}
      >
        <Pressable onPress={() => router.back()} style={{ marginBottom: sp.s }}>
          <Text style={tekstStijl("nadruk", c.primary)}>
            ‹ Terug
          </Text>
        </Pressable>
        {isLoading ? (
          <ActivityIndicator color={c.primary} />
        ) : (
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1, marginRight: sp.s }}>
                <Text style={tekstStijl("sectiekop", c.darkForeground)}>
                  {opname?.naam}
                </Text>
                <Text style={[tekstStijl("klein", c.darkMuted), { marginTop: sp.xs / 2 }]}>
                  {opname?.gebouw_naam} — {opname?.datum}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: sp.s, alignItems: "center" }}>
                {!isDefinitief && (
                  <Pressable
                    onPress={bevestigDefinitief}
                    style={{ backgroundColor: c.primary + "22", padding: sp.s, borderRadius: sp.s }}
                  >
                    <Ionicons name="lock-closed-outline" size={18} color={c.primary} />
                  </Pressable>
                )}
                {!isDefinitief && (
                  <Pressable
                    onPress={bevestigVerwijder}
                    style={{ backgroundColor: c.destructive + "22", padding: sp.s, borderRadius: sp.s }}
                  >
                    <Ionicons name="trash-outline" size={18} color={c.destructive} />
                  </Pressable>
                )}
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: sp.m, marginTop: sp.s + 2, flexWrap: "wrap", alignItems: "center" }}>
              <Statusmerk label={isDefinitief ? "Definitief" : "Concept"} soort={isDefinitief ? "succes" : "waarschuwing"} />
              <Text style={tekstStijl("bijschrift", c.darkMuted)}>
                {items.length} items  •  {afgerond} afgerond
              </Text>
            </View>
          </>
        )}
      </View>

      {/* Items lijst */}
      {isError ? (
        <LijstFout beschrijving="De opname kon niet worden geladen." onOpnieuw={() => refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item: any) => String(item.id)}
          contentContainerStyle={{ padding: sp.l, paddingBottom: sp.xxl * 3 + sp.xs }}
          ListEmptyComponent={
            !isLoading ? (
              <View style={{ paddingTop: sp.xxl + sp.xl }}>
                <LegeStaat
                  icoon="construct-outline"
                  titel="Nog geen items"
                  beschrijving="Voeg spots toe via de knop hieronder."
                />
              </View>
            ) : null
          }
          renderItem={({ item }: { item: any }) => (
            <ItemRij
              item={item}
              onPress={() => router.push(`/opname/item/${item.id}` as never)}
              onVerwijder={() => bevestigVerwijderItem(item.id)}
            />
          )}
        />
      )}

      {/* FAB — alleen in concept-modus */}
      {!isDefinitief && !isLoading && (
        <Pressable
          onPress={() => setToonNieuwItem(true)}
          style={{
            position: "absolute",
            bottom: sp.xl + sp.xs + insets.bottom,
            right: sp.xl,
            backgroundColor: c.primary,
            width: sp.xxl + sp.xl + 2,
            height: sp.xxl + sp.xl + 2,
            borderRadius: (sp.xxl + sp.xl + 2) / 2,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOpacity: 0.25,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6,
          }}
        >
          <Ionicons name="add" size={30} color={c.primaryForeground} />
        </Pressable>
      )}

      {/* Nieuw item modal */}
      <Modal visible={toonNieuwItem} transparent animationType="slide" onRequestClose={() => setToonNieuwItem(false)}>
        <Pressable
          onPress={() => setToonNieuwItem(false)}
          style={{ flex: 1, backgroundColor: c.dark + "80", justifyContent: "flex-end" }}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <ScrollView
              style={{ backgroundColor: c.card, borderTopLeftRadius: sp.xl, borderTopRightRadius: sp.xl, maxHeight: "90%" }}
              contentContainerStyle={{ padding: sp.xl, paddingBottom: sp.xl + insets.bottom }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[tekstStijl("sectiekop", c.foreground), { marginBottom: sp.l }]}>
                Nieuw item toevoegen
              </Text>

              {/* Spot type */}
              <Text style={[tekstStijl("klein", c.foreground), { fontFamily: "Inter_600SemiBold", marginBottom: sp.s }]}>
                Type voorziening
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: sp.l }} contentContainerStyle={{ gap: sp.s }}>
                {SPOT_TYPEN.map((t) => (
                  <Pressable
                    key={t.waarde}
                    onPress={() => setSpotType(t.waarde)}
                    style={{
                      paddingHorizontal: sp.m + 2, paddingVertical: sp.s, borderRadius: sp.s,
                      borderWidth: 1,
                      borderColor: spotType === t.waarde ? t.kleur : c.border,
                      backgroundColor: spotType === t.waarde ? t.kleur + "22" : c.background,
                    }}
                  >
                    <Text style={[tekstStijl("klein", spotType === t.waarde ? t.kleur : c.foreground), { fontFamily: "Inter_500Medium" }]}>
                      {t.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              {/* Actie */}
              <Text style={[tekstStijl("klein", c.foreground), { fontFamily: "Inter_600SemiBold", marginBottom: sp.s }]}>
                Vereiste actie
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: sp.s, marginBottom: sp.l }}>
                {ACTIES.map((a) => (
                  <Pressable
                    key={a.waarde}
                    onPress={() => setActie(a.waarde)}
                    style={{
                      paddingHorizontal: sp.m, paddingVertical: sp.xs + 3, borderRadius: sp.s,
                      borderWidth: 1,
                      borderColor: actie === a.waarde ? c.primary : c.border,
                      backgroundColor: actie === a.waarde ? c.accent : c.background,
                    }}
                  >
                    <Text style={[tekstStijl("bijschrift", actie === a.waarde ? c.primary : c.foreground), { fontFamily: "Inter_500Medium" }]}>
                      {a.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Bereikbaarheid */}
              <Text style={[tekstStijl("klein", c.foreground), { fontFamily: "Inter_600SemiBold", marginBottom: sp.s }]}>
                Bereikbaarheid
              </Text>
              <View style={{ flexDirection: "row", gap: sp.s, marginBottom: sp.l }}>
                {BEREIKBAARHEID.map((b) => (
                  <Pressable
                    key={b.waarde}
                    onPress={() => setBereikbaarheid(b.waarde)}
                    style={{
                      flex: 1, paddingVertical: sp.s, borderRadius: sp.s, alignItems: "center",
                      borderWidth: 1,
                      borderColor: bereikbaarheid === b.waarde ? b.kleur : c.border,
                      backgroundColor: bereikbaarheid === b.waarde ? b.kleur + "22" : c.background,
                    }}
                  >
                    <Text style={[tekstStijl("bijschrift", bereikbaarheid === b.waarde ? b.kleur : c.foreground), { fontFamily: "Inter_500Medium" }]}>
                      {b.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Ruimte */}
              <Text style={[tekstStijl("klein", c.foreground), { fontFamily: "Inter_600SemiBold", marginBottom: sp.xs + 2 }]}>
                Ruimte / locatie
              </Text>
              <TextInput
                value={ruimte}
                onChangeText={setRuimte}
                placeholder="Bijv. Gang 1e verdieping, serverruimte..."
                placeholderTextColor={c.mutedForeground}
                style={[tekstStijl("standaard", c.foreground), { borderWidth: 1, borderColor: c.border, borderRadius: sp.s + 2, padding: sp.m, backgroundColor: c.background, marginBottom: sp.m + 2 }]}
              />

              {/* Verdieping */}
              {(verdiepingen ?? []).length > 0 && (
                <>
                  <Text style={[tekstStijl("klein", c.foreground), { fontFamily: "Inter_600SemiBold", marginBottom: sp.s }]}>
                    Verdieping
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: sp.m + 2 }} contentContainerStyle={{ gap: sp.s }}>
                    <Pressable
                      onPress={() => setVerdiepingId(null)}
                      style={{ paddingHorizontal: sp.m, paddingVertical: sp.xs + 3, borderRadius: sp.s, borderWidth: 1, borderColor: verdiepingId === null ? c.primary : c.border, backgroundColor: verdiepingId === null ? c.accent : c.background }}
                    >
                      <Text style={tekstStijl("bijschrift", verdiepingId === null ? c.primary : c.foreground)}>Geen</Text>
                    </Pressable>
                    {(verdiepingen ?? []).map((v) => (
                      <Pressable
                        key={v.id}
                        onPress={() => setVerdiepingId(v.id)}
                        style={{ paddingHorizontal: sp.m, paddingVertical: sp.xs + 3, borderRadius: sp.s, borderWidth: 1, borderColor: verdiepingId === v.id ? c.primary : c.border, backgroundColor: verdiepingId === v.id ? c.accent : c.background }}
                      >
                        <Text style={[tekstStijl("bijschrift", verdiepingId === v.id ? c.primary : c.foreground), { fontFamily: "Inter_500Medium" }]}>
                          {v.naam}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              )}

              {/* Aantal + Afmetingen */}
              <View style={{ flexDirection: "row", gap: sp.m, marginBottom: sp.m + 2 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[tekstStijl("klein", c.foreground), { fontFamily: "Inter_600SemiBold", marginBottom: sp.xs + 2 }]}>
                    Aantal
                  </Text>
                  <TextInput
                    value={aantal}
                    onChangeText={setAantal}
                    keyboardType="numeric"
                    style={[tekstStijl("standaard", c.foreground), { borderWidth: 1, borderColor: c.border, borderRadius: sp.s + 2, padding: sp.m, backgroundColor: c.background }]}
                  />
                </View>
                <View style={{ flex: 2 }}>
                  <Text style={[tekstStijl("klein", c.foreground), { fontFamily: "Inter_600SemiBold", marginBottom: sp.xs + 2 }]}>
                    Afmetingen
                  </Text>
                  <TextInput
                    value={afmetingen}
                    onChangeText={setAfmetingen}
                    placeholder="Bijv. 900×2100 mm"
                    placeholderTextColor={c.mutedForeground}
                    style={[tekstStijl("standaard", c.foreground), { borderWidth: 1, borderColor: c.border, borderRadius: sp.s + 2, padding: sp.m, backgroundColor: c.background }]}
                  />
                </View>
              </View>

              {/* Beschrijving */}
              <Text style={[tekstStijl("klein", c.foreground), { fontFamily: "Inter_600SemiBold", marginBottom: sp.xs + 2 }]}>
                Situatie / bevinding
              </Text>
              <TextInput
                value={beschrijving}
                onChangeText={setBeschrijving}
                placeholder="Wat is er te zien? Waarom voldoet het niet?"
                placeholderTextColor={c.mutedForeground}
                multiline
                numberOfLines={3}
                style={[tekstStijl("standaard", c.foreground), { borderWidth: 1, borderColor: c.border, borderRadius: sp.s + 2, padding: sp.m, backgroundColor: c.background, marginBottom: sp.m + 2, textAlignVertical: "top", minHeight: sp.xxl + sp.xxl + sp.s }]}
              />

              {/* Notities */}
              <Text style={[tekstStijl("klein", c.foreground), { fontFamily: "Inter_600SemiBold", marginBottom: sp.xs + 2 }]}>
                Notities (intern)
              </Text>
              <TextInput
                value={notities}
                onChangeText={setNotities}
                placeholder="Extra opmerkingen, aandachtspunten..."
                placeholderTextColor={c.mutedForeground}
                multiline
                numberOfLines={2}
                style={[tekstStijl("standaard", c.foreground), { borderWidth: 1, borderColor: c.border, borderRadius: sp.s + 2, padding: sp.m, backgroundColor: c.background, marginBottom: sp.xl, textAlignVertical: "top", minHeight: sp.xxl + sp.xl + sp.s }]}
              />

              <Pressable
                onPress={itemOpslaan}
                disabled={maakItem.isPending}
                style={{ backgroundColor: c.primary, padding: sp.m + 2, borderRadius: c.radius, alignItems: "center" }}
              >
                {maakItem.isPending ? (
                  <ActivityIndicator color={c.primaryForeground} />
                ) : (
                  <Text style={[tekstStijl("nadruk", c.primaryForeground), { fontFamily: "Inter_700Bold" }]}>
                    Item toevoegen
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
