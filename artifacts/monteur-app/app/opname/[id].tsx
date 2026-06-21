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

import { LijstFout, bovenInset } from "@/components/ui";
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
  const kleurMap: Record<string, { bg: string; text: string }> = {
    vervangen: { bg: "#FEE2E2", text: "#991B1B" },
    opwaarderen: { bg: "#FEF9C3", text: "#854D0E" },
    controleren: { bg: "#EFF6FF", text: "#1D4ED8" },
    "niet-brandwerend-afwerken": { bg: "#F0FDF4", text: "#166534" },
  };
  const stijl = kleurMap[actie] ?? { bg: "#F3F4F6", text: "#374151" };
  const label = ACTIES.find((a) => a.waarde === actie)?.label ?? actie;
  return (
    <View style={{ backgroundColor: stijl.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 5 }}>
      <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: stijl.text }}>{label}</Text>
    </View>
  );
}

function ItemRij({ item, onPress, onVerwijder }: { item: any; onPress: () => void; onVerwijder: () => void }) {
  const c = useColors();
  const type = SPOT_TYPEN.find((t) => t.waarde === item.spot_type);
  const kleur = type?.kleur ?? "#6b7280";
  const label = type?.label ?? item.spot_type;

  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: item.afgerond ? c.muted : c.card,
        borderRadius: c.radius,
        borderWidth: 1,
        borderColor: c.border,
        padding: 14,
        marginBottom: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        opacity: item.afgerond ? 0.7 : 1,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          backgroundColor: kleur + "22",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="construct-outline" size={18} color={kleur} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: c.foreground }}>
            {label}
          </Text>
          {item.afgerond && (
            <Ionicons name="checkmark-circle" size={15} color={c.success} />
          )}
        </View>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
          <ActieBadge actie={item.actie} />
          {item.ruimte ? (
            <Text style={{ fontSize: 11, color: c.mutedForeground, fontFamily: "Inter_400Regular" }}>
              {item.ruimte}
            </Text>
          ) : null}
          <Text style={{ fontSize: 11, color: c.mutedForeground, fontFamily: "Inter_400Regular" }}>
            {item.aantal}x
          </Text>
          {item.fotos?.length > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Ionicons name="camera-outline" size={12} color={c.mutedForeground} />
              <Text style={{ fontSize: 11, color: c.mutedForeground, fontFamily: "Inter_400Regular" }}>
                {item.fotos.length}
              </Text>
            </View>
          )}
        </View>
      </View>
      <Pressable
        onPress={onVerwijder}
        hitSlop={12}
        style={{ padding: 6 }}
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
          paddingTop: bovenInset(insets) + 12,
          paddingHorizontal: 20,
          paddingBottom: 16,
        }}
      >
        <Pressable onPress={() => router.back()} style={{ marginBottom: 8 }}>
          <Text style={{ color: c.primary, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
            ‹ Terug
          </Text>
        </Pressable>
        {isLoading ? (
          <ActivityIndicator color={c.primary} />
        ) : (
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={{ color: c.darkForeground, fontSize: 20, fontFamily: "Inter_700Bold" }}>
                  {opname?.naam}
                </Text>
                <Text style={{ color: c.darkMuted, fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 }}>
                  {opname?.gebouw_naam} — {opname?.datum}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                {!isDefinitief && (
                  <Pressable
                    onPress={bevestigDefinitief}
                    style={{ backgroundColor: c.primary + "22", padding: 8, borderRadius: 8 }}
                  >
                    <Ionicons name="lock-closed-outline" size={18} color={c.primary} />
                  </Pressable>
                )}
                {!isDefinitief && (
                  <Pressable
                    onPress={bevestigVerwijder}
                    style={{ backgroundColor: c.destructive + "22", padding: 8, borderRadius: 8 }}
                  >
                    <Ionicons name="trash-outline" size={18} color={c.destructive} />
                  </Pressable>
                )}
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
              <View style={{
                backgroundColor: isDefinitief ? "#DCFCE7" : "#FEF9C3",
                paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
              }}>
                <Text style={{
                  fontSize: 12, fontFamily: "Inter_600SemiBold",
                  color: isDefinitief ? "#166534" : "#854D0E",
                }}>
                  {isDefinitief ? "Definitief" : "Concept"}
                </Text>
              </View>
              <Text style={{ color: c.darkMuted, fontSize: 12, fontFamily: "Inter_400Regular" }}>
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
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          ListEmptyComponent={
            !isLoading ? (
              <View style={{ alignItems: "center", paddingTop: 60 }}>
                <Ionicons name="construct-outline" size={40} color={c.mutedForeground} />
                <Text style={{ color: c.mutedForeground, marginTop: 12, fontFamily: "Inter_400Regular" }}>
                  Nog geen items — voeg spots toe via de knop hieronder
                </Text>
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
            bottom: 28 + insets.bottom,
            right: 24,
            backgroundColor: c.primary,
            width: 58,
            height: 58,
            borderRadius: 29,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOpacity: 0.25,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6,
          }}
        >
          <Ionicons name="add" size={30} color="#fff" />
        </Pressable>
      )}

      {/* Nieuw item modal */}
      <Modal visible={toonNieuwItem} transparent animationType="slide" onRequestClose={() => setToonNieuwItem(false)}>
        <Pressable
          onPress={() => setToonNieuwItem(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <ScrollView
              style={{ backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "90%" }}
              contentContainerStyle={{ padding: 22, paddingBottom: 24 + insets.bottom }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: c.foreground, marginBottom: 18 }}>
                Nieuw item toevoegen
              </Text>

              {/* Spot type */}
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 8 }}>
                Type voorziening
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ gap: 8 }}>
                {SPOT_TYPEN.map((t) => (
                  <Pressable
                    key={t.waarde}
                    onPress={() => setSpotType(t.waarde)}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
                      borderWidth: 1,
                      borderColor: spotType === t.waarde ? t.kleur : c.border,
                      backgroundColor: spotType === t.waarde ? t.kleur + "22" : c.background,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: spotType === t.waarde ? t.kleur : c.foreground }}>
                      {t.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              {/* Actie */}
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 8 }}>
                Vereiste actie
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {ACTIES.map((a) => (
                  <Pressable
                    key={a.waarde}
                    onPress={() => setActie(a.waarde)}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
                      borderWidth: 1,
                      borderColor: actie === a.waarde ? c.primary : c.border,
                      backgroundColor: actie === a.waarde ? c.accent : c.background,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: actie === a.waarde ? c.primary : c.foreground }}>
                      {a.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Bereikbaarheid */}
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 8 }}>
                Bereikbaarheid
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                {BEREIKBAARHEID.map((b) => (
                  <Pressable
                    key={b.waarde}
                    onPress={() => setBereikbaarheid(b.waarde)}
                    style={{
                      flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center",
                      borderWidth: 1,
                      borderColor: bereikbaarheid === b.waarde ? b.kleur : c.border,
                      backgroundColor: bereikbaarheid === b.waarde ? b.kleur + "22" : c.background,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: bereikbaarheid === b.waarde ? b.kleur : c.foreground }}>
                      {b.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Ruimte */}
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 6 }}>
                Ruimte / locatie
              </Text>
              <TextInput
                value={ruimte}
                onChangeText={setRuimte}
                placeholder="Bijv. Gang 1e verdieping, serverruimte..."
                placeholderTextColor={c.mutedForeground}
                style={{ borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: c.foreground, backgroundColor: c.background, marginBottom: 14 }}
              />

              {/* Verdieping */}
              {(verdiepingen ?? []).length > 0 && (
                <>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 8 }}>
                    Verdieping
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }} contentContainerStyle={{ gap: 8 }}>
                    <Pressable
                      onPress={() => setVerdiepingId(null)}
                      style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: verdiepingId === null ? c.primary : c.border, backgroundColor: verdiepingId === null ? c.accent : c.background }}
                    >
                      <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: verdiepingId === null ? c.primary : c.foreground }}>Geen</Text>
                    </Pressable>
                    {(verdiepingen ?? []).map((v) => (
                      <Pressable
                        key={v.id}
                        onPress={() => setVerdiepingId(v.id)}
                        style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: verdiepingId === v.id ? c.primary : c.border, backgroundColor: verdiepingId === v.id ? c.accent : c.background }}
                      >
                        <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: verdiepingId === v.id ? c.primary : c.foreground }}>
                          {v.naam}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              )}

              {/* Aantal + Afmetingen */}
              <View style={{ flexDirection: "row", gap: 12, marginBottom: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 6 }}>
                    Aantal
                  </Text>
                  <TextInput
                    value={aantal}
                    onChangeText={setAantal}
                    keyboardType="numeric"
                    style={{ borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: c.foreground, backgroundColor: c.background }}
                  />
                </View>
                <View style={{ flex: 2 }}>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 6 }}>
                    Afmetingen
                  </Text>
                  <TextInput
                    value={afmetingen}
                    onChangeText={setAfmetingen}
                    placeholder="Bijv. 900×2100 mm"
                    placeholderTextColor={c.mutedForeground}
                    style={{ borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: c.foreground, backgroundColor: c.background }}
                  />
                </View>
              </View>

              {/* Beschrijving */}
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 6 }}>
                Situatie / bevinding
              </Text>
              <TextInput
                value={beschrijving}
                onChangeText={setBeschrijving}
                placeholder="Wat is er te zien? Waarom voldoet het niet?"
                placeholderTextColor={c.mutedForeground}
                multiline
                numberOfLines={3}
                style={{ borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: c.foreground, backgroundColor: c.background, marginBottom: 14, textAlignVertical: "top", minHeight: 72 }}
              />

              {/* Notities */}
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 6 }}>
                Notities (intern)
              </Text>
              <TextInput
                value={notities}
                onChangeText={setNotities}
                placeholder="Extra opmerkingen, aandachtspunten..."
                placeholderTextColor={c.mutedForeground}
                multiline
                numberOfLines={2}
                style={{ borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: c.foreground, backgroundColor: c.background, marginBottom: 20, textAlignVertical: "top", minHeight: 56 }}
              />

              <Pressable
                onPress={itemOpslaan}
                disabled={maakItem.isPending}
                style={{ backgroundColor: c.primary, padding: 14, borderRadius: 12, alignItems: "center" }}
              >
                {maakItem.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 }}>
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
