import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListToolboxBerichten,
  useBevestigenToolboxBericht,
  getListToolboxBerichtenQueryKey,
  useListChatGesprekken,
  useCreateChatGesprek,
  useListChatGebruikers,
  getListChatGesprekkenQueryKey,
  type ToolboxBericht,
  type ChatGesprek,
} from "@workspace/api-client-react";
import {
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { bovenInset, LijstFout } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { useAuth } from "@/context/auth";

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatTijdstip(dt: string | Date): string {
  const d = new Date(dt);
  const nu = new Date();
  if (nu.toDateString() === d.toDateString()) {
    return d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

function gesprekNaam(gesprek: ChatGesprek, mijnId: number): string {
  if (gesprek.naam) return gesprek.naam;
  const anderen = gesprek.deelnemers.filter((d) => d.gebruiker_id !== mijnId);
  return anderen.map((d) => d.naam).join(", ") || "Gesprek";
}

// ─── Tab-knop ─────────────────────────────────────────────────────────────────

function TabKnop({
  label,
  actief,
  badge,
  onPress,
  c,
}: {
  label: string;
  actief: boolean;
  badge?: number;
  onPress: () => void;
  c: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 10,
        alignItems: "center",
        borderBottomWidth: 2,
        borderBottomColor: actief ? c.primary : "transparent",
        flexDirection: "row",
        justifyContent: "center",
        gap: 6,
      }}
    >
      <Text
        style={{
          fontSize: 14,
          fontFamily: actief ? "Inter_700Bold" : "Inter_400Regular",
          color: actief ? c.primary : c.mutedForeground,
        }}
      >
        {label}
      </Text>
      {badge != null && badge > 0 && (
        <View
          style={{
            backgroundColor: c.primary,
            borderRadius: 8,
            minWidth: 16,
            height: 16,
            paddingHorizontal: 4,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>
            {badge > 99 ? "99+" : badge}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// ─── Gebruikerskiezer modal ────────────────────────────────────────────────────

function GebruikerKiezerModal({
  zichtbaar,
  onSluiten,
  onKiezen,
  mijnId,
  c,
}: {
  zichtbaar: boolean;
  onSluiten: () => void;
  onKiezen: (ids: number[]) => void;
  mijnId: number;
  c: ReturnType<typeof useColors>;
}) {
  const [zoek, setZoek] = useState("");
  const [geselecteerd, setGeselecteerd] = useState<number[]>([]);
  const [bezig, setBezig] = useState(false);
  const { data: gebruikers, isLoading } = useListChatGebruikers();

  const gefilterd = (gebruikers ?? []).filter(
    (g) =>
      g.id !== mijnId &&
      g.naam.toLowerCase().includes(zoek.toLowerCase()),
  );

  function toggle(id: number) {
    setGeselecteerd((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  }

  function bevestig() {
    if (geselecteerd.length === 0 || bezig) return;
    setBezig(true);
    onKiezen(geselecteerd);
    setGeselecteerd([]);
    setZoek("");
    setBezig(false);
  }

  return (
    <Modal visible={zichtbaar} animationType="slide" presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: c.border,
            gap: 12,
          }}
        >
          <Pressable onPress={onSluiten} hitSlop={12}>
            <Ionicons name="close" size={22} color={c.foreground} />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 17, fontFamily: "Inter_700Bold", color: c.foreground }}>
            Nieuw gesprek
          </Text>
          {geselecteerd.length > 0 && (
            <Pressable
              onPress={bevestig}
              style={{
                backgroundColor: c.primary,
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 8,
              }}
            >
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" }}>
                Starten
              </Text>
            </Pressable>
          )}
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            margin: 12,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 10,
            paddingHorizontal: 12,
            gap: 8,
            backgroundColor: c.card,
          }}
        >
          <Ionicons name="search-outline" size={16} color={c.mutedForeground} />
          <TextInput
            value={zoek}
            onChangeText={setZoek}
            placeholder="Zoeken..."
            placeholderTextColor={c.mutedForeground}
            style={{ flex: 1, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular", color: c.foreground }}
          />
        </View>

        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={c.primary} />
        ) : (
          <FlatList
            data={gefilterd}
            keyExtractor={(g) => String(g.id)}
            renderItem={({ item: g }) => {
              const isGesel = geselecteerd.includes(g.id);
              return (
                <Pressable
                  onPress={() => toggle(g.id)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: c.border,
                    backgroundColor: isGesel ? c.primary + "10" : "transparent",
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: c.primary + "20",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: c.primary }}>
                      {g.naam.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: c.foreground }}
                      numberOfLines={1}
                    >
                      {g.naam}
                    </Text>
                    <Text
                      style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: c.mutedForeground }}
                      numberOfLines={1}
                    >
                      {g.email}
                    </Text>
                  </View>
                  {isGesel && (
                    <Ionicons name="checkmark-circle" size={22} color={c.primary} />
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text
                style={{
                  textAlign: "center",
                  marginTop: 32,
                  fontSize: 14,
                  fontFamily: "Inter_400Regular",
                  color: c.mutedForeground,
                }}
              >
                Geen medewerkers gevonden
              </Text>
            }
          />
        )}
      </View>
    </Modal>
  );
}

// ─── Hoofdscherm ──────────────────────────────────────────────────────────────

export default function BerichtenScherm() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold });
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { inhoudMaxBreedte } = useResponsive();
  const queryClient = useQueryClient();
  const { gebruiker } = useAuth();
  const mijnId = gebruiker?.id ?? 0;

  const [activeTab, setActiveTab] = useState<"toolbox" | "chat">("toolbox");
  const [refreshing, setRefreshing] = useState(false);
  const [geselecteerdToolbox, setGeselecteerdToolbox] = useState<ToolboxBericht | null>(null);
  const [bezigBevestigen, setBezigBevestigen] = useState(false);
  const [bevestigFout, setBevestigFout] = useState<string | null>(null);
  const [kiezerOpen, setKiezerOpen] = useState(false);

  // Toolbox
  const {
    data: berichten,
    isLoading: toolboxLaden,
    error: toolboxFout,
    refetch: refetchToolbox,
  } = useListToolboxBerichten({ gepubliceerd: true });
  const bevestigenMut = useBevestigenToolboxBericht();

  // Chat
  const {
    data: gesprekken,
    isLoading: chatLaden,
    error: chatFout,
    refetch: refetchChat,
  } = useListChatGesprekken();
  const maakGesprek = useCreateChatGesprek();

  // Chat polling
  useEffect(() => {
    const timer = setInterval(() => {
      if (activeTab === "chat") void refetchChat();
    }, 10000);
    return () => clearInterval(timer);
  }, [activeTab, refetchChat]);

  async function onRefresh() {
    setRefreshing(true);
    if (activeTab === "toolbox") await refetchToolbox();
    else await refetchChat();
    setRefreshing(false);
  }

  async function bevestig(bericht: ToolboxBericht) {
    if (bezigBevestigen || bericht.mijn_bevestiging) return;
    setBezigBevestigen(true);
    setBevestigFout(null);
    try {
      await bevestigenMut.mutateAsync({ id: bericht.id });
      await queryClient.invalidateQueries({ queryKey: getListToolboxBerichtenQueryKey() });
      setGeselecteerdToolbox((prev) =>
        prev?.id === bericht.id
          ? {
              ...prev,
              mijn_bevestiging: {
                id: 0,
                bericht_id: bericht.id,
                gebruiker_id: 0,
                bevestigd_op: new Date().toISOString(),
              },
            }
          : prev,
      );
    } catch {
      setBevestigFout("Kon niet bevestigen. Probeer opnieuw.");
    } finally {
      setBezigBevestigen(false);
    }
  }

  async function startGesprek(ids: number[]) {
    try {
      const type = ids.length > 1 ? "groep" : "direct";
      const result = await maakGesprek.mutateAsync({
        data: { type, deelnemer_ids: ids },
      });
      await queryClient.invalidateQueries({ queryKey: getListChatGesprekkenQueryKey() });
      setKiezerOpen(false);
      router.push(`/gesprek/${result.id}` as any);
    } catch {
      // stil falen — gebruiker kan opnieuw proberen
    }
  }

  if (!fontsLoaded) return null;

  // Toolbox detail weergave
  if (activeTab === "toolbox" && geselecteerdToolbox) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentContainerStyle={{
          padding: 16,
          paddingTop: bovenInset(insets) + 16,
          paddingBottom: insets.bottom + 32,
          maxWidth: inhoudMaxBreedte,
          width: "100%",
          alignSelf: "center",
        }}
      >
        <Pressable
          onPress={() => { setGeselecteerdToolbox(null); setBevestigFout(null); }}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 20 }}
        >
          <Ionicons name="chevron-back" size={20} color={c.primary} />
          <Text style={{ color: c.primary, fontSize: 14, fontFamily: "Inter_600SemiBold" }}>
            Terug naar berichten
          </Text>
        </Pressable>

        <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: c.foreground, marginBottom: 6 }}>
          {geselecteerdToolbox.titel}
        </Text>

        {geselecteerdToolbox.aangemaakt_door_naam ? (
          <Text style={{ fontSize: 12, color: c.mutedForeground, fontFamily: "Inter_400Regular", marginBottom: 4 }}>
            Door {geselecteerdToolbox.aangemaakt_door_naam}
            {geselecteerdToolbox.gepubliceerd_op
              ? " · " + new Date(geselecteerdToolbox.gepubliceerd_op).toLocaleDateString("nl-NL")
              : ""}
          </Text>
        ) : null}

        <View style={{ height: 1, backgroundColor: c.border, marginVertical: 16 }} />

        <Text style={{ fontSize: 15, color: c.foreground, fontFamily: "Inter_400Regular", lineHeight: 24, marginBottom: 32 }}>
          {geselecteerdToolbox.inhoud}
        </Text>

        {bevestigFout ? (
          <Text style={{ fontSize: 13, color: "#dc2626", fontFamily: "Inter_400Regular", marginBottom: 12, textAlign: "center" }}>
            {bevestigFout}
          </Text>
        ) : null}

        {geselecteerdToolbox.mijn_bevestiging ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#f0fdf4", borderRadius: 10, borderWidth: 1, borderColor: "#bbf7d0", padding: 14 }}>
            <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#15803d" }}>
              Gelezen en begrepen op{" "}
              {new Date(geselecteerdToolbox.mijn_bevestiging.bevestigd_op).toLocaleDateString("nl-NL")}
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={() => bevestig(geselecteerdToolbox)}
            disabled={bezigBevestigen}
            style={{ backgroundColor: c.primary, borderRadius: 10, paddingVertical: 14, alignItems: "center", opacity: bezigBevestigen ? 0.6 : 1 }}
          >
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" }}>
              {bezigBevestigen ? "Bezig..." : "Gelezen en begrepen"}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    );
  }

  const openstaandToolbox = (berichten ?? []).filter((b) => !b.mijn_bevestiging);
  const totalOngelezen = (gesprekken ?? []).reduce((s, g) => s + g.ongelezen_aantal, 0);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Koptekst */}
      <View
        style={{
          paddingTop: bovenInset(insets) + 8,
          paddingHorizontal: 16,
          paddingBottom: 0,
          backgroundColor: c.dark,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" }}>
            Berichten
          </Text>
          {activeTab === "chat" && (
            <Pressable
              onPress={() => setKiezerOpen(true)}
              hitSlop={12}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: "rgba(255,255,255,0.15)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="add" size={20} color="#fff" />
            </Pressable>
          )}
        </View>

        {/* Tabs */}
        <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.15)" }}>
          <TabKnop
            label="Toolbox"
            actief={activeTab === "toolbox"}
            badge={openstaandToolbox.length}
            onPress={() => setActiveTab("toolbox")}
            c={{ ...c, primary: "#fff", mutedForeground: "rgba(255,255,255,0.6)" } as any}
          />
          <TabKnop
            label="Chat"
            actief={activeTab === "chat"}
            badge={totalOngelezen}
            onPress={() => setActiveTab("chat")}
            c={{ ...c, primary: "#fff", mutedForeground: "rgba(255,255,255,0.6)" } as any}
          />
        </View>
      </View>

      {/* Toolbox tab */}
      {activeTab === "toolbox" && (
        <FlatList
          data={berichten ?? []}
          keyExtractor={(b) => String(b.id)}
          refreshControl={
            <RefreshControl refreshing={refreshing || toolboxLaden} onRefresh={onRefresh} tintColor={c.primary} />
          }
          ListEmptyComponent={
            toolboxFout ? (
              <LijstFout onOpnieuw={() => { void refetchToolbox(); }} />
            ) : null
          }
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 32,
            maxWidth: inhoudMaxBreedte,
            width: "100%",
            alignSelf: "center",
            gap: 10,
          }}
          ListHeaderComponent={
            openstaandToolbox.length === 0 && (berichten ?? []).length === 0 && !toolboxLaden ? (
              <View style={{ alignItems: "center", paddingVertical: 48, gap: 8 }}>
                <Ionicons name="mail-open-outline" size={40} color={c.mutedForeground} />
                <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.foreground }}>
                  Geen berichten
                </Text>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: c.mutedForeground, textAlign: "center" }}>
                  Nieuwe toolbox-berichten verschijnen hier zodra ze gepubliceerd zijn.
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const isBevestigd = !!item.mijn_bevestiging;
            return (
              <Pressable
                onPress={() => setGeselecteerdToolbox(item)}
                style={{
                  backgroundColor: c.card,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: isBevestigd ? c.border : c.primary + "44",
                  padding: 14,
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: isBevestigd ? "#f0fdf4" : c.primary + "18",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Ionicons
                    name={isBevestigd ? "checkmark-circle" : "document-text-outline"}
                    size={20}
                    color={isBevestigd ? "#16a34a" : c.primary}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: c.foreground, flex: 1 }} numberOfLines={1}>
                      {item.titel}
                    </Text>
                    {!isBevestigd && (
                      <View style={{ backgroundColor: c.primary, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#fff" }}>
                          Te bevestigen
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: c.mutedForeground, marginTop: 2 }}
                    numberOfLines={2}
                  >
                    {item.inhoud}
                  </Text>
                  {isBevestigd && item.mijn_bevestiging ? (
                    <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: "#16a34a", marginTop: 4 }}>
                      Bevestigd op{" "}
                      {new Date(item.mijn_bevestiging.bevestigd_op).toLocaleDateString("nl-NL")}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={16} color={c.mutedForeground} style={{ flexShrink: 0 }} />
              </Pressable>
            );
          }}
        />
      )}

      {/* Chat tab */}
      {activeTab === "chat" && (
        <FlatList
          data={gesprekken ?? []}
          keyExtractor={(g) => String(g.id)}
          refreshControl={
            <RefreshControl refreshing={refreshing || chatLaden} onRefresh={onRefresh} tintColor={c.primary} />
          }
          ListEmptyComponent={
            chatFout ? (
              <LijstFout onOpnieuw={() => { void refetchChat(); }} />
            ) : null
          }
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 32,
            maxWidth: inhoudMaxBreedte,
            width: "100%",
            alignSelf: "center",
            gap: 10,
          }}
          ListHeaderComponent={
            (gesprekken ?? []).length === 0 && !chatLaden ? (
              <View style={{ alignItems: "center", paddingVertical: 48, gap: 8 }}>
                <Ionicons name="chatbubbles-outline" size={40} color={c.mutedForeground} />
                <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.foreground }}>
                  Nog geen gesprekken
                </Text>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: c.mutedForeground, textAlign: "center" }}>
                  Tik op + om een gesprek te starten.
                </Text>
                <Pressable
                  onPress={() => setKiezerOpen(true)}
                  style={{ marginTop: 8, backgroundColor: c.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 }}
                >
                  <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" }}>
                    Nieuw gesprek
                  </Text>
                </Pressable>
              </View>
            ) : null
          }
          renderItem={({ item: g }) => {
            const naam = gesprekNaam(g, mijnId);
            const heeftOngelezen = g.ongelezen_aantal > 0;
            return (
              <Pressable
                onPress={() => router.push(`/gesprek/${g.id}` as any)}
                style={{
                  backgroundColor: c.card,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: heeftOngelezen ? c.primary + "44" : c.border,
                  padding: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: g.type === "groep" ? "#dbeafe" : c.primary + "18",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {g.type === "groep" ? (
                    <Ionicons name="people-outline" size={20} color="#3b82f6" />
                  ) : (
                    <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: c.primary }}>
                      {naam.charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text
                      style={{ flex: 1, fontSize: 14, fontFamily: heeftOngelezen ? "Inter_700Bold" : "Inter_600SemiBold", color: c.foreground }}
                      numberOfLines={1}
                    >
                      {naam}
                    </Text>
                    {g.laatste_bericht && (
                      <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: c.mutedForeground }}>
                        {formatTijdstip(g.laatste_bericht.aangemaakt_op)}
                      </Text>
                    )}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 13,
                        fontFamily: heeftOngelezen ? "Inter_600SemiBold" : "Inter_400Regular",
                        color: heeftOngelezen ? c.foreground : c.mutedForeground,
                      }}
                      numberOfLines={1}
                    >
                      {g.laatste_bericht
                        ? (g.laatste_bericht.afzender_id === mijnId ? "Jij: " : "") + g.laatste_bericht.inhoud
                        : "Nog geen berichten"}
                    </Text>
                    {heeftOngelezen && (
                      <View
                        style={{
                          backgroundColor: c.primary,
                          borderRadius: 8,
                          minWidth: 18,
                          height: 18,
                          paddingHorizontal: 5,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" }}>
                          {g.ongelezen_aantal > 99 ? "99+" : g.ongelezen_aantal}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={c.mutedForeground} style={{ flexShrink: 0 }} />
              </Pressable>
            );
          }}
        />
      )}

      <GebruikerKiezerModal
        zichtbaar={kiezerOpen}
        onSluiten={() => setKiezerOpen(false)}
        onKiezen={(ids) => void startGesprek(ids)}
        mijnId={mijnId}
        c={c}
      />
    </View>
  );
}
