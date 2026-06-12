import {
  DocumentStatus,
  DocumentType,
  useGetDocument,
  useListDocumentRevisies,
} from "@workspace/api-client-react";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Knop, bovenInset } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { useAuth } from "@/context/auth";

const TYPE_LABELS: Record<DocumentType, string> = {
  [DocumentType.eta]: "ETA",
  [DocumentType.classificatierapport]: "Classificatierapport",
  [DocumentType.testrapport]: "Testrapport",
  [DocumentType.productcertificaat]: "Productcertificaat",
  [DocumentType.dop]: "DoP",
  [DocumentType.verwerkingsvoorschrift]: "Verwerkingsvoorschrift",
  [DocumentType.productblad]: "Productblad",
};

const STATUS_LABELS: Record<DocumentStatus, string> = {
  [DocumentStatus.actueel]: "Actueel",
  [DocumentStatus.controle_nodig]: "Controle nodig",
  [DocumentStatus.vervangen]: "Vervangen",
  [DocumentStatus.mogelijk_verouderd]: "Mogelijk verouderd",
  [DocumentStatus.ingetrokken]: "Ingetrokken",
};

function leeg(waarde: string | null | undefined): string {
  return waarde && waarde.trim() ? waarde : "—";
}

function MetaRij({ label, waarde }: { label: string; waarde: string }) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: c.border,
      }}
    >
      <Text style={{ color: c.mutedForeground, fontSize: 14, fontFamily: "Inter_400Regular" }}>
        {label}
      </Text>
      <Text
        style={{ color: c.foreground, fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1, textAlign: "right" }}
      >
        {waarde}
      </Text>
    </View>
  );
}

export default function DocumentDetail() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { inhoudMaxBreedte } = useResponsive();
  const { token } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const documentId = Number(id);

  const { data: document, isLoading } = useGetDocument(documentId);
  const { data: revisies = [] } = useListDocumentRevisies(documentId);

  if (!token) return <Redirect href="/login" />;

  const gesorteerd = [...revisies].sort((a, b) => b.revisie_nummer - a.revisie_nummer);
  const heeftPdf = !!(document?.pdf_url && document.pdf_url.trim());

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={{
          backgroundColor: c.dark,
          paddingTop: bovenInset(insets) + 12,
          paddingHorizontal: 20,
          paddingBottom: 18,
        }}
      >
        <View style={{ width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
          <Pressable onPress={() => router.back()} style={{ marginBottom: 10 }}>
            <Text style={{ color: c.primary, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>
              ‹ Terug
            </Text>
          </Pressable>
          <Text style={{ color: c.darkForeground, fontSize: 22, fontFamily: "Inter_700Bold" }}>
            {document?.naam ?? "Document"}
          </Text>
          {document ? (
            <Text style={{ color: c.darkMuted, fontSize: 14, marginTop: 4, fontFamily: "Inter_400Regular" }}>
              {TYPE_LABELS[document.documenttype] ?? document.documenttype}
            </Text>
          ) : null}
        </View>
      </View>

      {isLoading || !document ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 32, width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}
        >
          {heeftPdf ? (
            <Knop
              titel="PDF openen"
              onPress={() =>
                router.push(
                  `/document/${document.id}?url=${encodeURIComponent(document.pdf_url ?? "")}&naam=${encodeURIComponent(document.naam)}`,
                )
              }
            />
          ) : null}

          <View
            style={{
              backgroundColor: c.card,
              borderRadius: c.radius,
              borderWidth: 1,
              borderColor: c.border,
              paddingHorizontal: 18,
              paddingVertical: 6,
            }}
          >
            <MetaRij label="Type" waarde={TYPE_LABELS[document.documenttype] ?? document.documenttype} />
            <MetaRij label="Fabrikant" waarde={leeg(document.fabrikant)} />
            <MetaRij label="Product" waarde={leeg(document.product)} />
            <MetaRij label="EN-norm" waarde={leeg(document.en_norm)} />
            <MetaRij label="Rapportnummer" waarde={leeg(document.rapportnummer)} />
            <MetaRij label="Revisie" waarde={leeg(document.revisie)} />
            <MetaRij label="Datum" waarde={leeg(document.datum)} />
            <MetaRij label="Status" waarde={STATUS_LABELS[document.status] ?? document.status} />
          </View>

          {gesorteerd.length > 0 ? (
            <View style={{ gap: 10 }}>
              <Text
                style={{
                  color: c.mutedForeground,
                  fontSize: 13,
                  fontFamily: "Inter_600SemiBold",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                Revisiehistorie
              </Text>
              {gesorteerd.map((r) => (
                <View
                  key={r.id}
                  style={{
                    backgroundColor: c.card,
                    borderRadius: c.radius,
                    borderWidth: 1,
                    borderColor: c.border,
                    padding: 16,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      backgroundColor: c.accent,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: c.accentForeground, fontSize: 16, fontFamily: "Inter_700Bold" }}>
                      {r.revisie_nummer}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{ fontSize: 15, color: c.foreground, fontFamily: "Inter_600SemiBold" }}
                      numberOfLines={2}
                    >
                      {r.naam}
                    </Text>
                    <Text style={{ fontSize: 13, color: c.mutedForeground, marginTop: 2, fontFamily: "Inter_400Regular" }}>
                      {STATUS_LABELS[r.status] ?? r.status}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
