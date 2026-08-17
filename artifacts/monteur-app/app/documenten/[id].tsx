import {
  DocumentStatus,
  DocumentType,
  useGetDocument,
  useListDocumentRevisies,
} from "@workspace/api-client-react";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ruimte } from "@workspace/ontwerp";

import { Knop, Ladenstaat, tekstStijl, bovenInset } from "@/components/ui";
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
  [DocumentType.opleverrapport]: "Opleverrapport",
  [DocumentType.tekening]: "Tekening",
  [DocumentType.contract]: "Contract",
  [DocumentType.verzekering]: "Verzekering",
  [DocumentType.overig]: "Overig",
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
        gap: ruimte.l,
        paddingVertical: ruimte.m,
        borderBottomWidth: 1,
        borderBottomColor: c.border,
      }}
    >
      <Text style={tekstStijl("standaard", c.mutedForeground)}>
        {label}
      </Text>
      <Text
        style={[tekstStijl("nadruk", c.foreground), { flex: 1, textAlign: "right" }]}
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
          paddingTop: bovenInset(insets) + ruimte.m,
          paddingHorizontal: ruimte.xl,
          paddingBottom: ruimte.l,
        }}
      >
        <View style={{ width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}>
          <Pressable onPress={() => router.back()} style={{ marginBottom: ruimte.s }}>
            <Text style={tekstStijl("nadruk", c.primary)}>
              ‹ Terug
            </Text>
          </Pressable>
          <Text style={tekstStijl("schermtitel", c.darkForeground)}>
            {document?.naam ?? "Document"}
          </Text>
          {document ? (
            <Text style={[tekstStijl("klein", c.darkMuted), { marginTop: ruimte.xs }]}>
              {TYPE_LABELS[document.documenttype] ?? document.documenttype}
            </Text>
          ) : null}
        </View>
      </View>

      {isLoading || !document ? (
        <View style={{ padding: ruimte.l }}>
          <Ladenstaat regels={6} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: ruimte.l, gap: ruimte.l, paddingBottom: insets.bottom + ruimte.xxl, width: "100%", maxWidth: inhoudMaxBreedte, alignSelf: "center" }}
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
              paddingHorizontal: ruimte.l,
              paddingVertical: ruimte.s - 2,
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
            <View style={{ gap: ruimte.s }}>
              <Text
                style={[
                  tekstStijl("bijschrift", c.mutedForeground),
                  { textTransform: "uppercase", letterSpacing: 0.5 },
                ]}
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
                    padding: ruimte.l,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: ruimte.m + 2,
                  }}
                >
                  <View
                    style={{
                      width: ruimte.xl + ruimte.xl,
                      height: ruimte.xl + ruimte.xl,
                      borderRadius: c.radius,
                      backgroundColor: c.accent,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={tekstStijl("nadruk", c.accentForeground)}>
                      {r.revisie_nummer}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={tekstStijl("nadruk", c.foreground)}
                      numberOfLines={2}
                    >
                      {r.naam}
                    </Text>
                    <Text style={[tekstStijl("klein", c.mutedForeground), { marginTop: ruimte.xs / 2 }]}>
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
