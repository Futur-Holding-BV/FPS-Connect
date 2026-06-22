import {
  useGetWerkdagItem,
  useUpdateWerkdagItemStatus,
} from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bovenInset } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";

const UITVOERING_LABEL: Record<string, string> = {
  gepland: "Gepland",
  bezig: "In uitvoering",
  pauze: "Pauze",
  gereed: "Gereed",
};

const UITVOERING_KLEUR: Record<string, string> = {
  gepland: "#6b7280",
  bezig: "#F23B0D",
  pauze: "#d97706",
  gereed: "#16a34a",
};

function InfoRegel({
  icoon,
  label,
  waarde,
  kleur,
}: {
  icoon: keyof typeof Ionicons.glyphMap;
  label: string;
  waarde: string | null | undefined;
  kleur?: string;
}) {
  const c = useColors();
  if (!waarde) return null;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        paddingVertical: 8,
        gap: 12,
      }}
    >
      <Ionicons name={icoon} size={16} color={c.mutedForeground} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: c.mutedForeground,
            fontSize: 11,
            fontFamily: "Inter_600SemiBold",
            letterSpacing: 0.5,
            textTransform: "uppercase",
            marginBottom: 2,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            color: kleur ?? c.text,
            fontSize: 14,
            fontFamily: "Inter_400Regular",
          }}
        >
          {waarde}
        </Text>
      </View>
    </View>
  );
}

function Kaart({ titel, children }: { titel: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View
      style={{
        backgroundColor: c.card,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        marginHorizontal: 16,
      }}
    >
      <Text
        style={{
          color: c.text,
          fontSize: 13,
          fontFamily: "Inter_700Bold",
          letterSpacing: 0.3,
          marginBottom: 8,
        }}
      >
        {titel}
      </Text>
      {children}
    </View>
  );
}

function PlaceholderKaart({ icoon, titel, beschrijving }: {
  icoon: keyof typeof Ionicons.glyphMap;
  titel: string;
  beschrijving: string;
}) {
  const c = useColors();
  return (
    <View
      style={{
        backgroundColor: c.card,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        marginHorizontal: 16,
        borderWidth: 1,
        borderColor: c.border,
        borderStyle: "dashed",
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          backgroundColor: c.muted + "22",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Ionicons name={icoon} size={18} color={c.mutedForeground} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
          {titel}
        </Text>
        <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 }}>
          {beschrijving}
        </Text>
      </View>
    </View>
  );
}

export default function WerkdagDetailScherm() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();

  const [statusBezig, setStatusBezig] = useState(false);

  if (!token) return <Redirect href="/login" />;

  const id = parseInt(idParam ?? "0", 10);

  const { data: werkorder, isLoading, isError, refetch } = useGetWerkdagItem(id);

  const statusMutatie = useUpdateWerkdagItemStatus({
    mutation: {
      onSuccess: () => {
        setStatusBezig(false);
        refetch();
      },
      onError: () => {
        setStatusBezig(false);
        Alert.alert("Fout", "Statuswijziging mislukt. Probeer opnieuw.");
      },
    },
  });

  function zetStatus(nieuweStatus: string) {
    setStatusBezig(true);
    statusMutatie.mutate({ id, data: { uitvoering_status: nieuweStatus } });
  }

  const uitvoeringStatus = werkorder?.uitvoering_status ?? "gepland";

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View
        style={{
          paddingTop: bovenInset(insets) + 8,
          paddingHorizontal: 16,
          paddingBottom: 14,
          backgroundColor: c.dark,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" }} numberOfLines={1}>
            {isLoading ? "Laden…" : (werkorder?.project_naam ?? werkorder?.titel ?? "Werkorder")}
          </Text>
          {werkorder?.werknummer ? (
            <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>
              #{werkorder.werknummer}
            </Text>
          ) : null}
        </View>
        {werkorder ? (
          <View
            style={{
              backgroundColor: (UITVOERING_KLEUR[uitvoeringStatus] ?? "#6b7280") + "33",
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <Text
              style={{
                color: UITVOERING_KLEUR[uitvoeringStatus] ?? "#6b7280",
                fontSize: 12,
                fontFamily: "Inter_600SemiBold",
              }}
            >
              {UITVOERING_LABEL[uitvoeringStatus] ?? uitvoeringStatus}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Inhoud */}
      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={c.tint} size="large" />
        </View>
      ) : isError || !werkorder ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32 }}>
          <Ionicons name="alert-circle-outline" size={40} color={c.mutedForeground} />
          <Text style={{ color: c.mutedForeground, fontSize: 15, textAlign: "center", marginTop: 12, fontFamily: "Inter_400Regular" }}>
            Werkorder niet gevonden of geen toegang.
          </Text>
          <Pressable
            onPress={() => router.back()}
            style={{ marginTop: 16 }}
          >
            <Text style={{ color: c.tint, fontFamily: "Inter_600SemiBold" }}>Terug</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingTop: 16, paddingBottom: 48 }}>

          {/* Statusknopen */}
          {uitvoeringStatus !== "gereed" ? (
            <View
              style={{
                marginHorizontal: 16,
                marginBottom: 16,
                gap: 10,
              }}
            >
              {uitvoeringStatus === "gepland" ? (
                <Pressable
                  onPress={() => zetStatus("bezig")}
                  disabled={statusBezig}
                  style={({ pressed }) => ({
                    backgroundColor: pressed || statusBezig ? "#d63510" : c.tint,
                    borderRadius: 12,
                    paddingVertical: 16,
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: 8,
                    opacity: statusBezig ? 0.7 : 1,
                  })}
                >
                  {statusBezig ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Ionicons name="play-circle" size={20} color="#fff" />
                  )}
                  <Text style={{ color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" }}>
                    Start werk
                  </Text>
                </Pressable>
              ) : null}

              {uitvoeringStatus === "bezig" ? (
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={() => zetStatus("pauze")}
                    disabled={statusBezig}
                    style={({ pressed }) => ({
                      flex: 1,
                      backgroundColor: pressed ? "#b45309" : "#d97706",
                      borderRadius: 12,
                      paddingVertical: 14,
                      flexDirection: "row",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: 6,
                      opacity: statusBezig ? 0.7 : 1,
                    })}
                  >
                    <Ionicons name="pause-circle" size={18} color="#fff" />
                    <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
                      Pauze
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => zetStatus("gereed")}
                    disabled={statusBezig}
                    style={({ pressed }) => ({
                      flex: 1,
                      backgroundColor: pressed ? "#15803d" : "#16a34a",
                      borderRadius: 12,
                      paddingVertical: 14,
                      flexDirection: "row",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: 6,
                      opacity: statusBezig ? 0.7 : 1,
                    })}
                  >
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                    <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
                      Gereed melden
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {uitvoeringStatus === "pauze" ? (
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={() => zetStatus("bezig")}
                    disabled={statusBezig}
                    style={({ pressed }) => ({
                      flex: 1,
                      backgroundColor: pressed || statusBezig ? "#d63510" : c.tint,
                      borderRadius: 12,
                      paddingVertical: 14,
                      flexDirection: "row",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: 6,
                      opacity: statusBezig ? 0.7 : 1,
                    })}
                  >
                    {statusBezig ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Ionicons name="play-circle" size={18} color="#fff" />
                    )}
                    <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
                      Hervat werk
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => zetStatus("gereed")}
                    disabled={statusBezig}
                    style={({ pressed }) => ({
                      flex: 1,
                      backgroundColor: pressed ? "#15803d" : "#16a34a",
                      borderRadius: 12,
                      paddingVertical: 14,
                      flexDirection: "row",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: 6,
                      opacity: statusBezig ? 0.7 : 1,
                    })}
                  >
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                    <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
                      Gereed melden
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : (
            <View
              style={{
                marginHorizontal: 16,
                marginBottom: 16,
                backgroundColor: "#16a34a22",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#16a34a",
                paddingVertical: 14,
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
              <Text style={{ color: "#16a34a", fontSize: 15, fontFamily: "Inter_700Bold" }}>
                Werk voltooid
              </Text>
            </View>
          )}

          {/* Project */}
          <Kaart titel="Project">
            <InfoRegel
              icoon="business-outline"
              label="Gebouw"
              waarde={werkorder.gebouw_naam}
            />
            <InfoRegel
              icoon="folder-outline"
              label="Project"
              waarde={werkorder.project_naam}
            />
            <InfoRegel
              icoon="barcode-outline"
              label="Werknummer"
              waarde={werkorder.werknummer}
            />
            <InfoRegel
              icoon="information-circle-outline"
              label="Type"
              waarde={werkorder.opdracht_type === "meerwerk" ? "Meerwerk" : "Hoofdopdracht"}
            />
          </Kaart>

          {/* Locatie & planning */}
          <Kaart titel="Locatie & planning">
            <InfoRegel
              icoon="location-outline"
              label="Locatie / woning / bouwnummer"
              waarde={werkorder.locaties}
            />
            <InfoRegel
              icoon="calendar-outline"
              label="Datum"
              waarde={
                werkorder.datum_start === werkorder.datum_eind
                  ? werkorder.datum_start
                  : `${werkorder.datum_start} – ${werkorder.datum_eind}`
              }
            />
            <InfoRegel
              icoon="time-outline"
              label="Tijd"
              waarde={
                werkorder.tijd_start
                  ? `${werkorder.tijd_start}${werkorder.tijd_eind ? ` – ${werkorder.tijd_eind}` : ""}`
                  : null
              }
            />
            <InfoRegel
              icoon="hourglass-outline"
              label="Geplande uren"
              waarde={werkorder.uren ? `${werkorder.uren} uur` : null}
            />
          </Kaart>

          {/* Werkzaamheden */}
          {werkorder.omschrijving || werkorder.dag_notities || werkorder.notities ? (
            <Kaart titel="Werkzaamheden">
              <InfoRegel
                icoon="construct-outline"
                label="Werkzaamheden"
                waarde={werkorder.omschrijving}
              />
              <InfoRegel
                icoon="document-text-outline"
                label="Dagopdracht"
                waarde={werkorder.dag_notities}
              />
              <InfoRegel
                icoon="chatbox-outline"
                label="Opmerkingen"
                waarde={werkorder.notities}
              />
            </Kaart>
          ) : null}

          {/* Meerwerk (als aanwezig) */}
          {(werkorder as any).meerwerk?.length > 0 ? (
            <Kaart titel="Meerwerk">
              {(werkorder as any).meerwerk.map((m: { id: number; meerwerkNummer: string | null; omschrijving: string | null; status: string }) => (
                <View
                  key={m.id}
                  style={{
                    paddingVertical: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: c.border,
                  }}
                >
                  <Text style={{ color: c.text, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                    {m.meerwerkNummer ? `MW-${m.meerwerkNummer}` : "Meerwerk"}
                  </Text>
                  {m.omschrijving ? (
                    <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 }}>
                      {m.omschrijving}
                    </Text>
                  ) : null}
                  <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 4 }}>{m.status}</Text>
                </View>
              ))}
            </Kaart>
          ) : null}

          {/* Medewerker */}
          {werkorder.medewerker_naam ? (
            <Kaart titel="Uitvoerend personeel">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: c.accent + "33",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Ionicons name="person" size={16} color={c.tint} />
                </View>
                <Text style={{ color: c.text, fontSize: 14, fontFamily: "Inter_500Medium" }}>
                  {werkorder.medewerker_naam}
                </Text>
              </View>
            </Kaart>
          ) : null}

          {/* Placeholders voor toekomstige modules */}
          <Text
            style={{
              color: c.mutedForeground,
              fontSize: 11,
              fontFamily: "Inter_600SemiBold",
              letterSpacing: 0.8,
              textTransform: "uppercase",
              marginHorizontal: 16,
              marginBottom: 8,
              marginTop: 4,
            }}
          >
            Nog te bouwen
          </Text>

          <PlaceholderKaart
            icoon="camera-outline"
            titel="Foto's"
            beschrijving="Voeg uitvoerings- en opleveringsfoto's toe — beschikbaar in een volgende versie"
          />

          <PlaceholderKaart
            icoon="stopwatch-outline"
            titel="Tijdregistratie"
            beschrijving="Begin- en eindtijd, pauze en netto uren registreren — beschikbaar in een volgende versie"
          />

          <PlaceholderKaart
            icoon="clipboard-outline"
            titel="Oplevering"
            beschrijving="Opleverchecklist en handtekening — beschikbaar in een volgende versie"
          />
        </ScrollView>
      )}
    </View>
  );
}
