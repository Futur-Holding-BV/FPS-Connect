import { API_DOMEIN } from "@/lib/apiDomein";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
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
import { ruimte } from "@workspace/ontwerp";
import { bovenInset } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/auth";
import { uploadFoto } from "@/lib/upload";

const DOMEIN = API_DOMEIN;

function opslagUrl(objectPath: string): string {
  return `https://${DOMEIN}/api/storage${objectPath}`;
}

function formatTijdstip(dt: string | Date): string {
  const d = new Date(dt);
  const nu = new Date();
  const vandaag = nu.toDateString() === d.toDateString();
  if (vandaag) {
    return d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

function gesprekNaam(
  deelnemers: Array<{ gebruiker_id: number; naam: string }>,
  mijnId: number,
): string {
  const anderen = deelnemers.filter((d) => d.gebruiker_id !== mijnId);
  if (anderen.length === 0) return "Gesprek";
  return anderen.map((d) => d.naam).join(", ");
}

function BerichtBel({
  bericht,
  isEigen,
  token,
  c,
}: {
  bericht: ChatBericht;
  isEigen: boolean;
  token: string | null;
  c: ReturnType<typeof useColors>;
}) {
  const isAfbeelding = bericht.bijlage_type === "foto";
  const isVideo = bericht.bijlage_type === "video";
  const isBijlage = !!bericht.bijlage_url && !isAfbeelding && !isVideo;
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

  const bubbleStijl = {
    maxWidth: "80%" as const,
    backgroundColor: isEigen ? c.primary : c.card,
    borderRadius: c.radius,
    borderBottomRightRadius: isEigen ? ruimte.xs : c.radius,
    borderBottomLeftRadius: isEigen ? c.radius : ruimte.xs,
    borderWidth: isEigen ? 0 : 1,
    borderColor: c.border,
    overflow: "hidden" as const,
  };

  const tijdstip = (
    <Text
      style={{
        fontSize: 10,
        fontFamily: "Inter_400Regular",
        color: isEigen ? c.primaryForeground : c.mutedForeground,
        textAlign: "right",
        marginTop: 2,
        paddingHorizontal: isAfbeelding || isVideo ? 10 : 0,
        paddingBottom: isAfbeelding || isVideo ? 6 : 0,
      }}
    >
      {formatTijdstip(bericht.aangemaakt_op)}
    </Text>
  );

  const afzenderNaam =
    !isEigen && bericht.afzender_naam ? (
      <Text
        style={{
          fontSize: 10,
          fontFamily: "Inter_600SemiBold",
          color: c.primary,
          marginBottom: 2,
          paddingHorizontal: isAfbeelding ? 10 : 0,
          paddingTop: isAfbeelding ? 8 : 0,
        }}
      >
        {bericht.afzender_naam}
      </Text>
    ) : null;

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: isEigen ? "flex-end" : "flex-start",
        marginBottom: 4,
        paddingHorizontal: 12,
      }}
    >
      <View style={bubbleStijl}>
        {afzenderNaam}

        {isAfbeelding && bericht.bijlage_url ? (
          <>
            <Image
              source={{ uri: opslagUrl(bericht.bijlage_url), headers: authHeaders }}
              style={{ width: 220, height: 165 }}
              resizeMode="cover"
            />
            {bericht.inhoud ? (
              <Text
                style={{
                  fontSize: 14,
                  fontFamily: "Inter_400Regular",
                  color: isEigen ? c.primaryForeground : c.foreground,
                  paddingHorizontal: 10,
                  paddingTop: 6,
                  lineHeight: 20,
                }}
              >
                {bericht.inhoud}
              </Text>
            ) : null}
          </>
        ) : isVideo && bericht.bijlage_url ? (
          <Pressable
            onPress={() => void Linking.openURL(opslagUrl(bericht.bijlage_url!))}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 10,
              paddingVertical: 10,
            }}
          >
            <Ionicons name="play-circle" size={32} color={isEigen ? c.primaryForeground : c.primary} />
            <Text
              style={{
                fontSize: 13,
                fontFamily: "Inter_400Regular",
                color: isEigen ? c.primaryForeground : c.foreground,
              }}
            >
              Video bekijken
            </Text>
          </Pressable>
        ) : isBijlage && bericht.bijlage_url ? (
          <Pressable
            onPress={() => void Linking.openURL(opslagUrl(bericht.bijlage_url!))}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 10,
              paddingVertical: 10,
            }}
          >
            <Ionicons
              name="document-outline"
              size={22}
              color={isEigen ? c.primaryForeground : c.primary}
            />
            <Text
              style={{
                fontSize: 13,
                fontFamily: "Inter_400Regular",
                color: isEigen ? c.primaryForeground : c.foreground,
                flexShrink: 1,
              }}
              numberOfLines={1}
            >
              {bericht.inhoud || "Bestand"}
            </Text>
          </Pressable>
        ) : (
          <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
            <Text
              style={{
                fontSize: 14,
                fontFamily: "Inter_400Regular",
                color: isEigen ? c.primaryForeground : c.foreground,
                lineHeight: 20,
              }}
            >
              {bericht.inhoud}
            </Text>
          </View>
        )}

        <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>{tijdstip}</View>
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
  const gesprekId = parseInt(idParam ?? "0", 10);
  const queryClient = useQueryClient();
  const { gebruiker, token } = useAuth();
  const mijnId = gebruiker?.id ?? 0;

  const [inputText, setInputText] = useState("");
  const [verzending, setVerzending] = useState(false);
  const [bijlageUri, setBijlageUri] = useState<string | null>(null);
  const [bijlageType, setBijlageType] = useState<"foto" | "video" | null>(null);
  const [uploadBezig, setUploadBezig] = useState(false);

  const {
    data: berichten,
    refetch,
    isLoading,
  } = useListChatBerichten(gesprekId);

  const { data: gesprek } = useGetChatGesprek(gesprekId);
  const stuurBericht = useCreateChatBericht();
  const markeerGelezen = useMarkeerChatGelezen();

  useEffect(() => {
    const timer = setInterval(() => {
      void refetch();
    }, 5000);
    return () => clearInterval(timer);
  }, [refetch]);

  useEffect(() => {
    if (gesprekId) {
      markeerGelezen.mutate({ id: gesprekId });
      void queryClient.invalidateQueries({ queryKey: getListChatGesprekkenQueryKey() });
    }
  }, [gesprekId, berichten?.length]);

  async function kiesFoto(bron: "camera" | "galerij") {
    try {
      const perm =
        bron === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Toestemming nodig",
          bron === "camera"
            ? "Geef toegang tot de camera."
            : "Geef toegang tot je foto's.",
        );
        return;
      }
      const res =
        bron === "camera"
          ? await ImagePicker.launchCameraAsync({
              quality: 0.7,
              mediaTypes: ["images"],
            })
          : await ImagePicker.launchImageLibraryAsync({
              quality: 0.7,
              mediaTypes: ["images", "videos"],
            });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      setBijlageUri(asset.uri);
      setBijlageType(asset.type === "video" ? "video" : "foto");
    } catch (e) {
      Alert.alert("Fout", "Selecteren mislukt");
    }
  }

  function toonBijlageMenu() {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Annuleren", "Camera", "Fotobibliotheek"],
          cancelButtonIndex: 0,
        },
        (index) => {
          if (index === 1) void kiesFoto("camera");
          if (index === 2) void kiesFoto("galerij");
        },
      );
    } else {
      Alert.alert("Bijlage", "Kies een bron", [
        { text: "Camera", onPress: () => void kiesFoto("camera") },
        { text: "Fotobibliotheek", onPress: () => void kiesFoto("galerij") },
        { text: "Annuleren", style: "cancel" },
      ]);
    }
  }

  function verwijderBijlage() {
    setBijlageUri(null);
    setBijlageType(null);
  }

  async function verzend() {
    if ((!inputText.trim() && !bijlageUri) || verzending) return;
    const tekst = inputText.trim();
    setInputText("");
    setVerzending(true);
    try {
      let objectPath: string | null = null;

      if (bijlageUri && bijlageType) {
        setUploadBezig(true);
        objectPath = await uploadFoto(bijlageUri, undefined, "bijlage");
        setUploadBezig(false);
        setBijlageUri(null);
        setBijlageType(null);
      }

      await stuurBericht.mutateAsync({
        id: gesprekId,
        data: {
          inhoud: tekst,
          bijlage_url: objectPath ?? undefined,
          bijlage_type: bijlageType ?? undefined,
        },
      });
      await refetch();
      await queryClient.invalidateQueries({ queryKey: getListChatGesprekkenQueryKey() });
    } catch (e) {
      Alert.alert("Fout", "Bericht versturen mislukt");
      setInputText(tekst);
      setUploadBezig(false);
    } finally {
      setVerzending(false);
    }
  }

  const naam =
    gesprek?.naam ?? (gesprek ? gesprekNaam(gesprek.deelnemers, mijnId) : "Laden...");

  const kanVerzenden = (!!inputText.trim() || !!bijlageUri) && !verzending;

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
          <Ionicons name="arrow-back" size={22} color={c.darkForeground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: c.darkForeground }}
            numberOfLines={1}
          >
            {naam}
          </Text>
          {gesprek && gesprek.deelnemers.length > 2 && (
            <Text
              style={{
                fontSize: 11,
                fontFamily: "Inter_400Regular",
                color: c.darkMuted,
              }}
            >
              {gesprek.deelnemers.length} deelnemers
            </Text>
          )}
        </View>
      </View>

      {/* Bijlagevoorvertoning */}
      {bijlageUri && bijlageType === "foto" && (
        <View
          style={{
            backgroundColor: c.card,
            borderBottomWidth: 1,
            borderBottomColor: c.border,
            padding: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Image
            source={{ uri: bijlageUri }}
            style={{ width: 56, height: 56, borderRadius: 8 }}
            resizeMode="cover"
          />
          <Text
            style={{
              flex: 1,
              fontSize: 12,
              fontFamily: "Inter_400Regular",
              color: c.mutedForeground,
            }}
          >
            {uploadBezig ? "Uploaden..." : "Foto geselecteerd"}
          </Text>
          {!uploadBezig && (
            <Pressable onPress={verwijderBijlage} hitSlop={8}>
              <Ionicons name="close-circle" size={22} color={c.mutedForeground} />
            </Pressable>
          )}
        </View>
      )}

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
            <BerichtBel
              bericht={item}
              isEigen={item.afzender_id === mijnId}
              token={token}
              c={c}
            />
          )}
          contentContainerStyle={{ paddingVertical: 12 }}
          ListEmptyComponent={
            <View
              style={{
                padding: 24,
                alignItems: "center",
                gap: 8,
                transform: [{ scaleY: -1 }],
              }}
            >
              <Ionicons
                name="chatbubble-outline"
                size={36}
                color={c.mutedForeground}
              />
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
          gap: 6,
          paddingHorizontal: 10,
          paddingVertical: 8,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
          borderTopWidth: 1,
          borderTopColor: c.border,
          backgroundColor: c.background,
        }}
      >
        <Pressable
          onPress={toonBijlageMenu}
          disabled={verzending}
          hitSlop={8}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name="attach-outline"
            size={22}
            color={bijlageUri ? c.primary : c.mutedForeground}
          />
        </Pressable>

        <TextInput
          value={inputText}
          onChangeText={setInputText}
          placeholder={bijlageUri ? "Bijschrift toevoegen..." : "Typ een bericht..."}
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
          disabled={!kanVerzenden}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: kanVerzenden ? c.primary : c.muted,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {verzending || uploadBezig ? (
            <ActivityIndicator size="small" color={c.primaryForeground} />
          ) : (
            <Ionicons name="send" size={18} color={c.primaryForeground} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
