import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useUitvoeringTheme } from "@/context/UitvoeringThemeContext";

interface Instructie {
  doel?: string;
  handeling?: string;
  artikelen?: string[];
  gereedschappen?: string[];
  veiligheidscontrole?: string;
  foto_opdracht?: string;
  controlevraag?: string;
  waarom?: string;
}

type StapAssistentProps = {
  stapNummer: number;
  werkpakketSleutel?: string | null;
  instructie: Instructie | null;
  vastgezet?: boolean;
  antwoord?: boolean;
  onAntwoordChange?: (value: boolean) => void;
};

function SectieKop({ label, icoon }: { label: string; icoon: keyof typeof Ionicons.glyphMap }) {
  const { theme } = useUitvoeringTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
      <Ionicons name={icoon} size={14} color={theme.accent} />
      <Text
        style={{
          color: theme.gedemptTekst,
          fontSize: 11,
          fontFamily: "Inter_700Bold",
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function Kaart({ children }: { children: React.ReactNode }) {
  const { theme } = useUitvoeringTheme();
  return (
    <View
      style={{
        backgroundColor: theme.kaart,
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: theme.rand,
      }}
    >
      {children}
    </View>
  );
}

function BulletLijst({ items }: { items: string[] }) {
  const { theme } = useUitvoeringTheme();
  return (
    <View style={{ gap: 6 }}>
      {items.map((item, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
          <Text style={{ color: theme.accent, fontSize: 14, lineHeight: 20 }}>•</Text>
          <Text
            style={{
              color: theme.tekst,
              fontSize: 13,
              fontFamily: "Inter_400Regular",
              flex: 1,
              lineHeight: 19,
            }}
          >
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Linker paneel in de tablet drie-kolommen layout.
 * Toont huidige stap, instructie, waarom-uitleg, benodigd materiaal en
 * veiligheidsinformatie.
 */
export function StapAssistent({
  stapNummer,
  werkpakketSleutel,
  instructie,
  vastgezet = true,
  antwoord = false,
  onAntwoordChange,
}: StapAssistentProps) {
  const { theme } = useUitvoeringTheme();

  const ScrollContainer = vastgezet
    ? ({ children }: { children: React.ReactNode }) => (
        <ScrollView
          contentContainerStyle={{ padding: 14, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      )
    : ({ children }: { children: React.ReactNode }) => (
        <View style={{ padding: 14 }}>{children}</View>
      );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.achtergrond,
        borderRightWidth: 1,
        borderRightColor: theme.rand,
      }}
    >
      <View
        style={{
          backgroundColor: theme.kaart,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: theme.rand,
        }}
      >
        <Text
          style={{
            color: theme.gedemptTekst,
            fontSize: 11,
            fontFamily: "Inter_600SemiBold",
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          Stap {stapNummer}
          {werkpakketSleutel ? ` · ${werkpakketSleutel}` : ""}
        </Text>
        <Text
          style={{
            color: theme.tekst,
            fontSize: 14,
            fontFamily: "Inter_700Bold",
            marginTop: 2,
          }}
        >
          Stapassistent
        </Text>
      </View>

      <ScrollContainer>
        {instructie?.doel && (
          <Kaart>
            <SectieKop label="Doel" icoon="flag-outline" />
            <Text
              style={{
                color: theme.tekst,
                fontSize: 14,
                fontFamily: "Inter_500Medium",
                lineHeight: 21,
              }}
              numberOfLines={3}
            >
              {instructie.doel}
            </Text>
          </Kaart>
        )}

        {instructie?.handeling && (
          <Kaart>
            <SectieKop label="Handeling" icoon="construct-outline" />
            <Text
              style={{
                color: theme.tekst,
                fontSize: 13,
                fontFamily: "Inter_400Regular",
                lineHeight: 19,
              }}
            >
              {instructie.handeling}
            </Text>
          </Kaart>
        )}

        {instructie?.waarom && (
          <Kaart>
            <SectieKop label="Waarom deze stap" icoon="bulb-outline" />
            <Text
              style={{
                color: theme.tekst,
                fontSize: 13,
                fontFamily: "Inter_400Regular",
                lineHeight: 19,
                fontStyle: "italic",
              }}
            >
              {instructie.waarom}
            </Text>
          </Kaart>
        )}

        {(instructie?.artikelen?.length || instructie?.gereedschappen?.length) ? (
          <Kaart>
            <SectieKop label="Benodigd materiaal" icoon="cube-outline" />
            {instructie.artikelen && instructie.artikelen.length > 0 && (
              <>
                <Text
                  style={{
                    color: theme.gedemptTekst,
                    fontSize: 11,
                    fontFamily: "Inter_600SemiBold",
                    marginBottom: 4,
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  Artikelen
                </Text>
                <BulletLijst items={instructie.artikelen} />
              </>
            )}
            {instructie.gereedschappen && instructie.gereedschappen.length > 0 && (
              <>
                <Text
                  style={{
                    color: theme.gedemptTekst,
                    fontSize: 11,
                    fontFamily: "Inter_600SemiBold",
                    marginTop: 10,
                    marginBottom: 4,
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  Gereedschappen
                </Text>
                <BulletLijst items={instructie.gereedschappen} />
              </>
            )}
          </Kaart>
        ) : null}

        {instructie?.veiligheidscontrole && (
          <View
            style={{
              backgroundColor: "#FEF3C7",
              borderRadius: 12,
              padding: 14,
              marginBottom: 10,
              borderWidth: 1,
              borderColor: "#FCD34D",
              flexDirection: "row",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <Ionicons name="shield-outline" size={18} color="#92400E" style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: "#92400E",
                  fontSize: 11,
                  fontFamily: "Inter_700Bold",
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                  marginBottom: 4,
                }}
              >
                Veiligheidsinformatie
              </Text>
              <Text
                style={{
                  color: "#78350F",
                  fontSize: 13,
                  fontFamily: "Inter_400Regular",
                  lineHeight: 18,
                }}
              >
                {instructie.veiligheidscontrole}
              </Text>
            </View>
          </View>
        )}

        {instructie?.foto_opdracht && (
          <Kaart>
            <SectieKop label="Foto-opdracht" icoon="camera-outline" />
            <Text
              style={{
                color: theme.tekst,
                fontSize: 13,
                fontFamily: "Inter_400Regular",
                lineHeight: 19,
              }}
            >
              {instructie.foto_opdracht}
            </Text>
          </Kaart>
        )}

        {instructie?.controlevraag && (
          <Pressable
            onPress={() => onAntwoordChange?.(!antwoord)}
            disabled={!onAntwoordChange}
            style={{
              backgroundColor: antwoord ? theme.accent + "22" : theme.kaart,
              borderRadius: 12,
              padding: 14,
              borderLeftWidth: 3,
              borderLeftColor: antwoord ? theme.accent : theme.rand,
              borderWidth: 1,
              borderColor: antwoord ? theme.accent + "66" : theme.rand,
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                borderWidth: 2,
                borderColor: antwoord ? theme.accent : theme.gedemptTekst,
                backgroundColor: antwoord ? theme.accent : "transparent",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 1,
              }}
            >
              {antwoord && <Ionicons name="checkmark" size={13} color="#fff" />}
            </View>
            <View style={{ flex: 1 }}>
              <SectieKop label="Controlevraag" icoon="help-circle-outline" />
              <Text
                style={{
                  color: theme.tekst,
                  fontSize: 13,
                  fontFamily: "Inter_500Medium",
                  lineHeight: 19,
                }}
              >
                {instructie.controlevraag}
              </Text>
              {onAntwoordChange && (
                <Text
                  style={{
                    color: antwoord ? theme.accent : theme.gedemptTekst,
                    fontSize: 11,
                    fontFamily: "Inter_600SemiBold",
                    marginTop: 6,
                  }}
                >
                  {antwoord ? "Bevestigd" : "Tik om te bevestigen"}
                </Text>
              )}
            </View>
          </Pressable>
        )}
      </ScrollContainer>
    </View>
  );
}
