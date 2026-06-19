import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListChatBerichten,
  useCreateChatBericht,
  useMarkeerChatGelezen,
  useGetChatGesprek,
  getListChatGesprekkenQueryKey,
  type ChatBericht,
} from "@workspace/api-client-react";
import {
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { bovenInset } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/auth";

function formatTijdstip(dt: string | Date): string {
  const d = new Date(dt);
  const nu = new Date();
  const vandaag = nu.toDateString() === d.toDateString();
  if (vandaag) {
    return d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

function gesprekNaam(deelnemers: Array<{ gebruiker_id: number; naam: string }>, mijnId: number): string {
  const anderen = deelnemers.filter((d) => d.gebruiker_id !== mijnId);
  if (anderen.length === 0) return "Gesprek";
  return anderen.map((d) => d.naam).join(", ");
}

function BerichtBel({
  bericht,
  isEigen,
  c,
}: {
  bericht: ChatBericht;
  isEigen: boolean;
  c: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: isEigen ? "flex-end" : "flex-start",
        marginBottom: 4,
        paddingHorizontal: 12,
      }}
    >
      <View
        style={{
          maxWidth: "75%",
          backgroundColor: isEigen ? c.primary : c.card,
          borderRadius: 16,
          borderBottomRightRadius: isEigen ? 4 : 16,
          borderBottomLeftRadius: isEigen ? 16 : 4,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderWidth: isEigen ? 0 : 1,
          borderColor: c.border,
        }}
      >
        {!isEigen && bericht.afzender_naam ? (
          <Text
            style={{
              fontSize: 10,
              fontFamily: "Inter_600SemiBold",
              color: c.primary,
              marginBottom: 2,
            }}
          >
            {bericht.afzender_naam}
          </Text>
        ) : null}
        <Text
          style={{
            fontSize: 14,
            fontFamily: "Inter_400Regular",
            color: isEigen ? "#fff" : c.foreground,
            lineHeight: 20,
          }}
        >
          {bericht.inhoud}
        </Text>
        <Text
          style={{
            fontSize: 10,
            fontFamily: "Inter_400Regular",
            color: isEigen ? "rgba(255,255,255,0.65)" : c.mutedForeground,
            marginTop: 2,
            textAlign: "right",
          }}
        >
          {formatTijdstip(bericht.aangemaakt_op)}
        </Text>
      </View>
    </View>
  );
}

export default function GesprekScherm() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold });
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const gesprekId = parseInt(idParam ?? "0");
  const queryClient = useQueryClient();
  const { gebruiker } = useAuth();
  const mijnId = gebruiker?.id ?? 0;

  const [inputText, setInputText] = useState("");
  const [verzending, setVerzending] = useState(false);

  const {
    data: berichten,
    refetch,
    isLoading,
  } = useListChatBerichten(gesprekId);

  const { data: gesprek } = useGetChatGesprek(gesprekId);

  const stuurBericht = useCreateChatBericht();
  const markeerGelezen = useMarkeerChatGelezen();

  // Polling
  useEffect(() => {
    const timer = setInterval(() => {
      void refetch();
    }, 5000);
    return () => clearInterval(timer);
  }, [refetch]);

  // Mark as read on mount and when messages arrive
  useEffect(() => {
    if (gesprekId) {
      markeerGelezen.mutate({ id: gesprekId });
      void queryClient.invalidateQueries({ queryKey: getListChatGesprekkenQueryKey() });
    }
  }, [gesprekId, berichten?.length]);

  async function verzend() {
    if (!inputText.trim() || verzending) return;
    const tekst = inputText.trim();
    setInputText("");
    setVerzending(true);
    try {
      await stuurBericht.mutateAsync({
        id: gesprekId,
        data: { inhoud: tekst },
      });
      await refetch();
      await queryClient.invalidateQueries({ queryKey: getListChatGesprekkenQueryKey() });
    } catch {
      setInputText(tekst);
    } finally {
      setVerzending(false);
    }
  }

  const naam =
    gesprek?.naam ??
    (gesprek ? gesprekNaam(gesprek.deelnemers, mijnId) : "Laden...");

  if (!fontsLoaded) return null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      {/* Koptekst */}
      <View
        style={{
          paddingTop: bovenInset(insets) + 8,
          paddingHorizontal: 16,
          paddingBottom: 12,
          backgroundColor: c.dark,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" }}
            numberOfLines={1}
          >
            {naam}
          </Text>
          {gesprek && gesprek.deelnemers.length > 2 && (
            <Text
              style={{
                fontSize: 11,
                fontFamily: "Inter_400Regular",
                color: "rgba(255,255,255,0.7)",
              }}
            >
              {gesprek.deelnemers.length} deelnemers
            </Text>
          )}
        </View>
      </View>

      {/* Berichtenlijst */}
      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : (
        <FlatList
          data={berichten ?? []}
          keyExtractor={(b) => String(b.id)}
          inverted
          renderItem={({ item }) => (
            <BerichtBel bericht={item} isEigen={item.afzender_id === mijnId} c={c} />
          )}
          contentContainerStyle={{
            paddingVertical: 12,
          }}
          ListEmptyComponent={
            <View
              style={{
                padding: 24,
                alignItems: "center",
                gap: 8,
                transform: [{ scaleY: -1 }],
              }}
            >
              <Ionicons name="chatbubble-outline" size={36} color={c.mutedForeground} />
              <Text
                style={{
                  fontSize: 14,
                  fontFamily: "Inter_400Regular",
                  color: c.mutedForeground,
                  textAlign: "center",
                }}
              >
                Nog geen berichten. Stuur het eerste bericht.
              </Text>
            </View>
          }
        />
      )}

      {/* Invoerveld */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 8,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
          borderTopWidth: 1,
          borderTopColor: c.border,
          backgroundColor: c.background,
        }}
      >
        <TextInput
          value={inputText}
          onChangeText={setInputText}
          placeholder="Typ een bericht..."
          placeholderTextColor={c.mutedForeground}
          multiline
          style={{
            flex: 1,
            maxHeight: 100,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 20,
            paddingHorizontal: 14,
            paddingVertical: 8,
            fontSize: 14,
            fontFamily: "Inter_400Regular",
            color: c.foreground,
            backgroundColor: c.card,
          }}
        />
        <Pressable
          onPress={() => void verzend()}
          disabled={!inputText.trim() || verzending}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor:
              !inputText.trim() || verzending ? c.muted : c.primary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="send" size={18} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
