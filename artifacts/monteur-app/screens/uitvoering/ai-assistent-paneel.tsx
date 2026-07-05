import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { useUitvoeringTheme } from "@/context/UitvoeringThemeContext";
import type { PimStapRelevantDocument } from "@workspace/api-client-react";

type AiAssistentPaneelProps = {
  controlepunten?: string[];
  veelgemaakteFouten?: string[];
  projectNotities?: string;
  relevanteDocs?: PimStapRelevantDocument[];
  docsLaden?: boolean;
  onVraagAi: (vraag: string) => void;
  aiAntwoord?: string | null;
  aiBezig?: boolean;
  focusTrigger?: number;
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

function ControlepuntRij({ tekst, index }: { tekst: string; index: number }) {
  const { theme } = useUitvoeringTheme();
  const [aangevinkt, setAangevinkt] = useState(false);

  return (
    <Pressable
      onPress={() => setAangevinkt((v) => !v)}
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        paddingVertical: 6,
        borderBottomWidth: index > 0 ? 1 : 0,
        borderBottomColor: theme.rand,
      }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          borderWidth: 2,
          borderColor: aangevinkt ? theme.succes : theme.rand,
          backgroundColor: aangevinkt ? theme.succes : "transparent",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
          flexShrink: 0,
        }}
      >
        {aangevinkt && <Ionicons name="checkmark" size={12} color="#fff" />}
      </View>
      <Text
        style={{
          color: aangevinkt ? theme.gedemptTekst : theme.tekst,
          fontSize: 13,
          fontFamily: "Inter_400Regular",
          flex: 1,
          lineHeight: 19,
          textDecorationLine: aangevinkt ? "line-through" : "none",
        }}
      >
        {tekst}
      </Text>
    </Pressable>
  );
}

function DocumentRij({ doc }: { doc: PimStapRelevantDocument }) {
  const { theme } = useUitvoeringTheme();

  const typeLabel =
    doc.document_type === "ETA"
      ? "ETA"
      : doc.document_type === "DoP"
        ? "DoP"
        : doc.document_type === "montagevoorschrift"
          ? "Montagevoorschrift"
          : doc.document_type === "tekening"
            ? "Tekening"
            : "Document";

  return (
    <Pressable
      onPress={() => void Linking.openURL(doc.download_url)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: theme.rand,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: theme.accent + "22",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Ionicons name="document-text-outline" size={16} color={theme.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: theme.tekst,
            fontSize: 13,
            fontFamily: "Inter_500Medium",
            lineHeight: 17,
          }}
          numberOfLines={2}
        >
          {doc.titel}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
          <Text
            style={{
              color: theme.accent,
              fontSize: 11,
              fontFamily: "Inter_600SemiBold",
              textTransform: "uppercase",
              letterSpacing: 0.3,
            }}
          >
            {typeLabel}
          </Text>
          {doc.relevantie_reden && (
            <Text
              style={{
                color: theme.gedemptTekst,
                fontSize: 11,
                fontFamily: "Inter_400Regular",
              }}
              numberOfLines={1}
            >
              · {doc.relevantie_reden}
            </Text>
          )}
        </View>
      </View>
      <Ionicons name="download-outline" size={16} color={theme.gedemptTekst} />
    </Pressable>
  );
}

/**
 * Rechter paneel in de tablet drie-kolommen layout.
 * Bevat controlepunten-checklist, AI-assistent invoerveld, relevante
 * documenten, projectnotities en veelgemaakte fouten.
 *
 * Gebruikt KeyboardAvoidingView (géén KeyboardController — Expo Go).
 */
export function AiAssistentPaneel({
  controlepunten = [],
  veelgemaakteFouten = [],
  projectNotities,
  relevanteDocs = [],
  docsLaden = false,
  onVraagAi,
  aiAntwoord,
  aiBezig = false,
  focusTrigger = 0,
}: AiAssistentPaneelProps) {
  const { theme } = useUitvoeringTheme();
  const [vraag, setVraag] = useState("");
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (focusTrigger > 0) {
      inputRef.current?.focus();
    }
  }, [focusTrigger]);

  function verstuurVraag() {
    const trimmed = vraag.trim();
    if (!trimmed || aiBezig) return;
    onVraagAi(trimmed);
    setVraag("");
  }

  return (
    <KeyboardAvoidingView
      style={{
        flex: 1,
        backgroundColor: theme.achtergrond,
      }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
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
          AI-assistent
        </Text>
        <Text
          style={{
            color: theme.tekst,
            fontSize: 14,
            fontFamily: "Inter_700Bold",
            marginTop: 2,
          }}
        >
          Hulp &amp; Documenten
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {controlepunten.length > 0 && (
          <Kaart>
            <SectieKop label="Controlepunten" icoon="checkmark-done-outline" />
            <View>
              {controlepunten.map((punt, i) => (
                <ControlepuntRij key={i} tekst={punt} index={i} />
              ))}
            </View>
          </Kaart>
        )}

        <Kaart>
          <SectieKop label="Vraag aan AI" icoon="chatbubble-ellipses-outline" />
          <View
            style={{
              backgroundColor: theme.achtergrond,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: theme.rand,
              paddingHorizontal: 12,
              paddingVertical: 8,
              flexDirection: "row",
              alignItems: "flex-end",
              gap: 8,
              marginBottom: aiAntwoord ? 12 : 0,
            }}
          >
            <TextInput
              ref={inputRef}
              value={vraag}
              onChangeText={setVraag}
              placeholder="Stel een vraag over deze stap..."
              placeholderTextColor={theme.gedemptTekst}
              multiline
              numberOfLines={3}
              style={{
                flex: 1,
                color: theme.tekst,
                fontSize: 13,
                fontFamily: "Inter_400Regular",
                lineHeight: 19,
                minHeight: 40,
                maxHeight: 100,
              }}
              returnKeyType="send"
              onSubmitEditing={verstuurVraag}
              blurOnSubmit={false}
            />
            <Pressable
              onPress={verstuurVraag}
              disabled={!vraag.trim() || aiBezig}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: vraag.trim() && !aiBezig ? theme.accent : theme.rand,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {aiBezig ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={16} color="#fff" />
              )}
            </Pressable>
          </View>

          {aiAntwoord && (
            <View
              style={{
                backgroundColor: theme.accent + "11",
                borderRadius: 10,
                padding: 12,
                borderLeftWidth: 3,
                borderLeftColor: theme.accent,
              }}
            >
              <Text
                style={{
                  color: theme.gedemptTekst,
                  fontSize: 10,
                  fontFamily: "Inter_700Bold",
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                  marginBottom: 6,
                }}
              >
                AI Antwoord
              </Text>
              <Text
                style={{
                  color: theme.tekst,
                  fontSize: 13,
                  fontFamily: "Inter_400Regular",
                  lineHeight: 19,
                }}
              >
                {aiAntwoord}
              </Text>
            </View>
          )}
        </Kaart>

        {(docsLaden || relevanteDocs.length > 0) && (
          <Kaart>
            <SectieKop label="Relevante documenten" icoon="folder-outline" />
            {docsLaden ? (
              <View style={{ alignItems: "center", paddingVertical: 16 }}>
                <ActivityIndicator color={theme.accent} />
                <Text
                  style={{
                    color: theme.gedemptTekst,
                    fontSize: 12,
                    fontFamily: "Inter_400Regular",
                    marginTop: 8,
                  }}
                >
                  Documenten laden...
                </Text>
              </View>
            ) : (
              <View>
                {relevanteDocs.map((doc) => (
                  <DocumentRij key={doc.id} doc={doc} />
                ))}
              </View>
            )}
          </Kaart>
        )}

        {projectNotities && (
          <Kaart>
            <SectieKop label="Projectnotities" icoon="document-text-outline" />
            <Text
              style={{
                color: theme.tekst,
                fontSize: 13,
                fontFamily: "Inter_400Regular",
                lineHeight: 19,
              }}
            >
              {projectNotities}
            </Text>
          </Kaart>
        )}

        {veelgemaakteFouten.length > 0 && (
          <View
            style={{
              backgroundColor: "#FEF2F2",
              borderRadius: 12,
              padding: 14,
              marginBottom: 10,
              borderWidth: 1,
              borderColor: "#FCA5A5",
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}
            >
              <Ionicons name="alert-circle-outline" size={14} color="#DC2626" />
              <Text
                style={{
                  color: "#DC2626",
                  fontSize: 11,
                  fontFamily: "Inter_700Bold",
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                }}
              >
                Veelgemaakte fouten
              </Text>
            </View>
            <View style={{ gap: 6 }}>
              {veelgemaakteFouten.map((fout, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                  <Text style={{ color: "#DC2626", fontSize: 14, lineHeight: 20 }}>!</Text>
                  <Text
                    style={{
                      color: "#7F1D1D",
                      fontSize: 13,
                      fontFamily: "Inter_400Regular",
                      flex: 1,
                      lineHeight: 19,
                    }}
                  >
                    {fout}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
