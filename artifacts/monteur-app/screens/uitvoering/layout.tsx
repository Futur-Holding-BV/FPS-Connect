import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useUitvoeringTheme } from "@/context/UitvoeringThemeContext";
import { useUitvoeringsModus } from "@/hooks/useUitvoeringsModus";
import { useResponsive } from "@/hooks/useResponsive";
import { UitvoeringActieBalk } from "@/screens/uitvoering/actie-balk";
import { TabletDrieKolommen } from "@/screens/uitvoering/tablet/drie-kolommen";
import { FotoAnalyseOverlay, normaliseerFotoAnalyseStatus } from "@/components/foto-analyse-overlay";
import { voegToeAanWachtrij, laadWachtrij } from "@/lib/syncQueue";
import { useSync } from "@/context/sync";
import {
  useGetPimUitvoeringRelevanteDocs,
  useStartPimStapFotoAnalyse,
  useGetPimStapFotoAnalyse,
  type PimUitvoeringStap,
  type PimFotoAnalyse,
} from "@workspace/api-client-react";

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

function parseInstructie(json: unknown): Instructie | null {
  if (!json || typeof json !== "object") return null;
  return json as Instructie;
}

function complexiteitUitInstructie(instructie: Instructie | null): 1 | 2 | 3 | 4 | 5 {
  if (!instructie) return 1;
  const score =
    (instructie.artikelen?.length ?? 0) +
    (instructie.gereedschappen?.length ?? 0) +
    (instructie.veiligheidscontrole ? 2 : 0) +
    (instructie.foto_opdracht ? 1 : 0);
  if (score >= 7) return 5;
  if (score >= 5) return 4;
  if (score >= 3) return 3;
  if (score >= 1) return 2;
  return 1;
}

type BottomSheetInhoud = "details" | "documenten" | "ai" | null;

type TelefoonLayoutProps = {
  stap: PimUitvoeringStap;
  opdrachtId: number;
  instructie: Instructie | null;
  fotos: { lokaal: string; objectPath?: string }[];
  fotoAnalyse: PimFotoAnalyse | null;
  uploading: boolean;
  antwoord: boolean;
  afgerondActief: boolean;
  wachtendOpAi: boolean;
  toonEigenStapHeader: boolean;
  isBezig: boolean;
  onFoto: () => void;
  onAfgerond: () => void;
  onAfwijking: () => void;
  onAntwoordChange: (value: boolean) => void;
};

function TelefoonLayout({
  stap,
  opdrachtId: _opdrachtId,
  instructie,
  fotos,
  fotoAnalyse,
  uploading: _uploading,
  antwoord,
  afgerondActief,
  wachtendOpAi,
  toonEigenStapHeader,
  isBezig,
  onFoto,
  onAfgerond,
  onAfwijking,
  onAntwoordChange,
}: TelefoonLayoutProps) {
  const { theme } = useUitvoeringTheme();
  const insets = useSafeAreaInsets();
  const [bottomSheet, setBottomSheet] = useState<BottomSheetInhoud>(null);
  const [aiVraag, setAiVraag] = useState("");

  const complexiteit = complexiteitUitInstructie(instructie);
  const isHighComplexiteit = complexiteit >= 5;

  const voortgangBreedte = Math.min(100, (stap.volgorde / 10) * 100);

  return (
    <View style={{ flex: 1, backgroundColor: theme.achtergrond }}>
      {toonEigenStapHeader && (
        <View
          style={{
            backgroundColor: theme.kaart,
            paddingHorizontal: 16,
            paddingTop: insets.top + 8,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: theme.rand,
          }}
        >
          <Text
            style={{
              color: theme.gedemptTekst,
              fontSize: 12,
              fontFamily: "Inter_400Regular",
            }}
          >
            Stap {stap.volgorde}
            {stap.werkpakket_sleutel ? ` · ${stap.werkpakket_sleutel}` : ""}
          </Text>
          <View style={{ height: 4, backgroundColor: theme.rand, borderRadius: 2, marginTop: 6 }}>
            <View
              style={{
                height: 4,
                width: `${voortgangBreedte}%`,
                backgroundColor: theme.accent,
                borderRadius: 2,
              }}
            />
          </View>
        </View>
      )}

      {wachtendOpAi && (
        <View
          style={{
            backgroundColor: "#EFF6FF",
            paddingHorizontal: 14,
            paddingVertical: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderBottomWidth: 1,
            borderBottomColor: "#BFDBFE",
          }}
        >
          <Ionicons name="time-outline" size={14} color="#2563EB" />
          <Text style={{ color: "#1D4ED8", fontSize: 12, fontFamily: "Inter_600SemiBold", flex: 1 }}>
            Foto in wachtrij voor AI-analyse — wordt verwerkt zodra verbinding hersteld is.
          </Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {instructie?.doel && (
          <Text
            style={{
              color: theme.tekst,
              fontSize: 17,
              fontFamily: "Inter_700Bold",
              lineHeight: 24,
              marginBottom: 8,
            }}
            numberOfLines={3}
          >
            {instructie.doel}
          </Text>
        )}

        {instructie?.handeling && (
          <Text
            style={{
              color: theme.tekst,
              fontSize: 14,
              fontFamily: "Inter_400Regular",
              lineHeight: 21,
              marginBottom: 12,
            }}
            numberOfLines={3}
          >
            {instructie.handeling}
          </Text>
        )}

        {fotoAnalyse && (
          <View style={{ marginBottom: 12 }}>
            <FotoAnalyseOverlay
              fotoUrl={fotoAnalyse.foto_object_path ?? ""}
              annotatieUrl={fotoAnalyse.annotatie_object_path ?? undefined}
              status={normaliseerFotoAnalyseStatus(fotoAnalyse.afwijkingsstatus)}
              hoogte={180}
            />
          </View>
        )}

        {fotos.length > 0 && !fotoAnalyse && (
          <View
            style={{
              backgroundColor: theme.kaart,
              borderRadius: 10,
              padding: 10,
              marginBottom: 12,
              borderWidth: 1,
              borderColor: theme.rand,
            }}
          >
            <Text
              style={{
                color: theme.gedemptTekst,
                fontSize: 11,
                fontFamily: "Inter_600SemiBold",
                textTransform: "uppercase",
                letterSpacing: 0.4,
                marginBottom: 6,
              }}
            >
              Gemaakte foto's ({fotos.length})
            </Text>
          </View>
        )}

        {(complexiteit >= 3 || isHighComplexiteit) && (
          <Pressable
            onPress={() =>
              setBottomSheet((prev) => (prev === "details" ? null : "details"))
            }
            style={{
              backgroundColor: theme.kaart,
              borderRadius: 10,
              padding: 12,
              marginBottom: 8,
              flexDirection: "row",
              alignItems: "center",
              borderWidth: 1,
              borderColor: theme.rand,
            }}
          >
            <Ionicons name="document-text-outline" size={18} color={theme.accent} />
            <Text
              style={{
                color: theme.tekst,
                fontSize: 14,
                fontFamily: "Inter_500Medium",
                flex: 1,
                marginLeft: 10,
              }}
            >
              Tekening &amp; details
              {isHighComplexiteit ? " (uitgebreid)" : ""}
            </Text>
            <Ionicons
              name={bottomSheet === "details" ? "chevron-up" : "chevron-down"}
              size={16}
              color={theme.gedemptTekst}
            />
          </Pressable>
        )}

        {bottomSheet === "details" && instructie && (
          <View
            style={{
              backgroundColor: theme.kaart,
              borderRadius: 10,
              padding: 14,
              marginBottom: 8,
              borderWidth: 1,
              borderColor: theme.rand,
            }}
          >
            {instructie.artikelen && instructie.artikelen.length > 0 && (
              <>
                <Text
                  style={{
                    color: theme.gedemptTekst,
                    fontSize: 11,
                    fontFamily: "Inter_700Bold",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                    marginBottom: 6,
                  }}
                >
                  Benodigde artikelen
                </Text>
                {instructie.artikelen.map((item, i) => (
                  <Text
                    key={i}
                    style={{
                      color: theme.tekst,
                      fontSize: 13,
                      fontFamily: "Inter_400Regular",
                      lineHeight: 20,
                    }}
                  >
                    · {item}
                  </Text>
                ))}
              </>
            )}
            {instructie.veiligheidscontrole && (
              <View
                style={{
                  marginTop: instructie.artikelen?.length ? 12 : 0,
                  backgroundColor: "#FEF3C7",
                  borderRadius: 8,
                  padding: 10,
                }}
              >
                <Text
                  style={{
                    color: "#92400E",
                    fontSize: 12,
                    fontFamily: "Inter_600SemiBold",
                    marginBottom: 4,
                  }}
                >
                  Veiligheid
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
            )}
          </View>
        )}

        <Pressable
          onPress={() => setBottomSheet((prev) => (prev === "ai" ? null : "ai"))}
          style={{
            backgroundColor: theme.kaart,
            borderRadius: 10,
            padding: 12,
            marginBottom: 8,
            flexDirection: "row",
            alignItems: "center",
            borderWidth: 1,
            borderColor: theme.rand,
          }}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.accent} />
          <Text
            style={{
              color: theme.tekst,
              fontSize: 14,
              fontFamily: "Inter_500Medium",
              flex: 1,
              marginLeft: 10,
            }}
          >
            Vraag aan AI
          </Text>
          <Ionicons
            name={bottomSheet === "ai" ? "chevron-up" : "chevron-down"}
            size={16}
            color={theme.gedemptTekst}
          />
        </Pressable>

        {bottomSheet === "ai" && (
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View
              style={{
                backgroundColor: theme.kaart,
                borderRadius: 10,
                padding: 14,
                marginBottom: 8,
                borderWidth: 1,
                borderColor: theme.rand,
              }}
            >
              <TextInput
                value={aiVraag}
                onChangeText={setAiVraag}
                placeholder="Stel een vraag over deze stap..."
                placeholderTextColor={theme.gedemptTekst}
                multiline
                style={{
                  color: theme.tekst,
                  fontSize: 14,
                  fontFamily: "Inter_400Regular",
                  minHeight: 60,
                  lineHeight: 20,
                }}
              />
              <Pressable
                onPress={() => {
                  if (aiVraag.trim()) {
                    Alert.alert("AI Vraag", "Vraagfunctie beschikbaar wanneer verbonden met AI-assistent.");
                    setAiVraag("");
                  }
                }}
                style={{
                  backgroundColor: aiVraag.trim() ? theme.accent : theme.rand,
                  borderRadius: 8,
                  padding: 10,
                  alignItems: "center",
                  marginTop: 8,
                }}
              >
                <Text
                  style={{
                    color: aiVraag.trim() ? "#fff" : theme.gedemptTekst,
                    fontSize: 14,
                    fontFamily: "Inter_600SemiBold",
                  }}
                >
                  Vraag stellen
                </Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        )}
      </ScrollView>

      {instructie?.controlevraag && (
        <Pressable
          onPress={() => onAntwoordChange(!antwoord)}
          style={{
            backgroundColor: antwoord ? theme.accent + "18" : theme.kaart,
            borderTopWidth: 1,
            borderTopColor: antwoord ? theme.accent + "55" : theme.rand,
            paddingHorizontal: 16,
            paddingVertical: 12,
            flexDirection: "row",
            alignItems: "center",
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
            }}
          >
            {antwoord && <Ionicons name="checkmark" size={13} color="#fff" />}
          </View>
          <Text
            style={{
              flex: 1,
              color: theme.tekst,
              fontSize: 13,
              fontFamily: antwoord ? "Inter_600SemiBold" : "Inter_400Regular",
              lineHeight: 18,
            }}
            numberOfLines={2}
          >
            {instructie.controlevraag}
          </Text>
          <Text
            style={{
              color: antwoord ? theme.accent : theme.gedemptTekst,
              fontSize: 11,
              fontFamily: "Inter_600SemiBold",
            }}
          >
            {antwoord ? "Akkoord" : "Bevestig"}
          </Text>
        </Pressable>
      )}

      <UitvoeringActieBalk
        onFoto={onFoto}
        onAfgerond={onAfgerond}
        onAfwijking={onAfwijking}
        onVraagAi={() => setBottomSheet((prev) => (prev === "ai" ? null : "ai"))}
        afgerondActief={afgerondActief}
        bezig={isBezig}
        isTablet={false}
      />
    </View>
  );
}

type UitvoeringLayoutProps = {
  stap: PimUitvoeringStap;
  opdrachtId: number;
  fotos: { lokaal: string; objectPath?: string }[];
  uploading: boolean;
  antwoord: boolean;
  isBezig: boolean;
  isOnline: boolean;
  toonEigenStapHeader?: boolean;
  onFoto: () => void;
  onAfgerond: () => void;
  onAfwijking: () => void;
  onAntwoordChange: (value: boolean) => void;
  onTerugNaarNormaal?: () => void;
};

/**
 * Hoofd-layout voor de Uitvoeringsmodus.
 *
 * Schakelt automatisch tussen telefoon- en tabletmodus op basis van
 * schermgrootte via useResponsive (breakpoint ≥768px = tablet).
 *
 * Op tablet: drie-kolommen layout + Uitvoeringsmodus (KeepAwake + hoog contrast).
 * Op telefoon: eenvoudige layout met 4 grote knoppen en bottom sheet.
 */
export function UitvoeringLayout({
  stap,
  opdrachtId,
  fotos,
  uploading,
  antwoord,
  isBezig,
  isOnline,
  toonEigenStapHeader = true,
  onFoto,
  onAfgerond,
  onAfwijking,
  onAntwoordChange,
  onTerugNaarNormaal,
}: UitvoeringLayoutProps) {
  const { isTablet } = useResponsive();
  const { theme, hoogContrast, setHoogContrast } = useUitvoeringTheme();
  const { activeerModus, deactiveerModus } = useUitvoeringsModus();
  const { isSyncing } = useSync();

  const [aiAntwoord, setAiAntwoord] = useState<string | null>(null);
  const [aiBezig, setAiBezig] = useState(false);
  const [fotoAnalyse, setFotoAnalyse] = useState<PimFotoAnalyse | null>(null);
  const [actieveAnalyseId, setActieveAnalyseId] = useState<number | null>(null);
  const [wachtendOpAi, setWachtendOpAi] = useState(false);
  const [aiInputFocusTrigger, setAiInputFocusTrigger] = useState(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const geanalyseerdePathsRef = useRef(new Set<string>());
  const gequeuedeLokaalPathsRef = useRef(new Set<string>());
  const prevSyncingRef = useRef(false);

  // "Stap afgerond" is actief wanneer antwoord bevestigd is EN
  // AI-analyse (indien aanwezig) expliciet akkoord heeft gegeven.
  // Waarden van afwijkingsstatus: akkoord | aandacht | herstel (nooit "afwijking").
  // Alles behalve "akkoord" (inclusief null/wachtend/bezig/aandacht/herstel)
  // blokkeert voltooiing.
  const analyseGereed =
    !fotoAnalyse ||
    fotoAnalyse.afwijkingsstatus === "akkoord";
  const afgerondActief = antwoord && analyseGereed && !wachtendOpAi;

  const instructie = parseInstructie(stap.instructie_json);
  const complexiteit = complexiteitUitInstructie(instructie);

  const { data: relevanteDocs, isLoading: docsLaden } = useGetPimUitvoeringRelevanteDocs(
    opdrachtId,
    stap.id,
    {
      query: {
        queryKey: ["pim-relevante-docs", opdrachtId, stap.id],
        enabled: isTablet && isOnline && opdrachtId > 0 && stap.id > 0,
      },
    },
  );

  const fotoAnalyseMutatie = useStartPimStapFotoAnalyse();

  const { data: analyseResultaat, refetch: refetchAnalyse } = useGetPimStapFotoAnalyse(
    opdrachtId,
    stap.id,
    actieveAnalyseId ?? 0,
    {
      query: {
        queryKey: ["pim-foto-analyse", opdrachtId, stap.id, actieveAnalyseId],
        enabled: actieveAnalyseId !== null && actieveAnalyseId > 0,
      },
    },
  );

  // Reset analyse-state en tracking-sets wanneer de stap wisselt
  useEffect(() => {
    geanalyseerdePathsRef.current = new Set<string>();
    gequeuedeLokaalPathsRef.current = new Set<string>();
    setFotoAnalyse(null);
    setActieveAnalyseId(null);
    setWachtendOpAi(false);
  }, [stap.id]);

  // Verwijder wachtendOpAi zodra de sync-run eindigt en er geen foto_analyse-items
  // meer in de wachtrij staan voor deze opdracht
  useEffect(() => {
    const waseSyncing = prevSyncingRef.current;
    prevSyncingRef.current = isSyncing;
    if (waseSyncing && !isSyncing && wachtendOpAi) {
      laadWachtrij().then((wachtrij) => {
        const nogActief = wachtrij.some(
          (item) => item.type === "foto_analyse" && item.opdrachtId === opdrachtId,
        );
        if (!nogActief) {
          setWachtendOpAi(false);
          gequeuedeLokaalPathsRef.current.clear();
        }
      }).catch(() => undefined);
    }
  }, [isSyncing, wachtendOpAi, opdrachtId]);

  useEffect(() => {
    if (isTablet) {
      void activeerModus();
    } else {
      void deactiveerModus();
    }
    return () => {
      void deactiveerModus();
    };
  }, [isTablet]);

  useEffect(() => {
    if (analyseResultaat) {
      setFotoAnalyse(analyseResultaat);
      const status = analyseResultaat.status;
      if (status !== "wachtend" && status !== "bezig") {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    }
  }, [analyseResultaat]);

  const startFotoAnalyse = useCallback(
    (objectPath: string) => {
      if (!isOnline) {
        // Offline: enqueue voor later via SyncQueue, markeer als wachtend
        if (!gequeuedeLokaalPathsRef.current.has(objectPath)) {
          gequeuedeLokaalPathsRef.current.add(objectPath);
          void voegToeAanWachtrij({
            type: "foto_analyse",
            opdrachtId,
            stapId: stap.id,
            lokaalPad: objectPath,
            lokaleStatus: "wachtend_op_ai",
          });
          setWachtendOpAi(true);
        }
        return;
      }
      fotoAnalyseMutatie.mutate(
        {
          id: opdrachtId,
          stapId: stap.id,
          data: { foto_object_path: objectPath },
        },
        {
          onSuccess: (analyse) => {
            setFotoAnalyse(analyse);
            setActieveAnalyseId(analyse.id);
            if (analyse.status === "wachtend" || analyse.status === "bezig") {
              pollingRef.current = setInterval(() => {
                void refetchAnalyse();
              }, 3000);
            }
          },
        },
      );
    },
    [opdrachtId, stap.id, isOnline, fotoAnalyseMutatie, refetchAnalyse],
  );

  // Analyseer elke nieuw geüploade foto (per objectPath, niet alleen de eerste)
  useEffect(() => {
    for (const foto of fotos) {
      if (foto.objectPath && !geanalyseerdePathsRef.current.has(foto.objectPath)) {
        geanalyseerdePathsRef.current.add(foto.objectPath);
        startFotoAnalyse(foto.objectPath);
      } else if (!foto.objectPath && !isOnline && !gequeuedeLokaalPathsRef.current.has(foto.lokaal)) {
        startFotoAnalyse(foto.lokaal);
      }
    }
  }, [fotos, isOnline, startFotoAnalyse]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  function handleVraagAi(vraag: string) {
    if (!vraag.trim()) return;
    setAiBezig(true);
    setTimeout(() => {
      setAiAntwoord(
        "AI-assistent is beschikbaar zodra de VGF integratie actief is. " +
          "Raadpleeg het montagevoorschrift of contacteer de projectleider.",
      );
      setAiBezig(false);
    }, 800);
  }

  if (isTablet) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.achtergrond }}>
        {hoogContrast && (
          <View
            style={{
              backgroundColor: theme.kaart,
              paddingHorizontal: 16,
              paddingVertical: 8,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottomWidth: 1,
              borderBottomColor: theme.rand,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="moon" size={14} color={theme.accent} />
              <Text
                style={{
                  color: theme.tekst,
                  fontSize: 12,
                  fontFamily: "Inter_600SemiBold",
                }}
              >
                Uitvoeringsmodus actief
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text
                style={{
                  color: theme.gedemptTekst,
                  fontSize: 11,
                  fontFamily: "Inter_400Regular",
                }}
              >
                Hoog contrast
              </Text>
              <Switch
                value={hoogContrast}
                onValueChange={setHoogContrast}
                trackColor={{ false: theme.rand, true: theme.accent + "88" }}
                thumbColor={hoogContrast ? theme.accent : theme.gedemptTekst}
              />
              {onTerugNaarNormaal && (
                <Pressable
                  onPress={onTerugNaarNormaal}
                  style={{
                    backgroundColor: theme.rand,
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                  }}
                >
                  <Text
                    style={{
                      color: theme.tekst,
                      fontSize: 12,
                      fontFamily: "Inter_500Medium",
                    }}
                  >
                    Verlaten
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        <TabletDrieKolommen
          stapNummer={stap.volgorde}
          werkpakketSleutel={stap.werkpakket_sleutel}
          instructie={instructie}
          fotoAnalyse={fotoAnalyse}
          complexiteitScore={complexiteit}
          relevanteDocs={relevanteDocs}
          docsLaden={docsLaden && isOnline}
          aiAntwoord={aiAntwoord}
          aiBezig={aiBezig}
          aiFocusTrigger={aiInputFocusTrigger}
          antwoord={antwoord}
          onAntwoordChange={onAntwoordChange}
          onVraagAi={handleVraagAi}
          onAiFocus={() => setAiInputFocusTrigger((n) => n + 1)}
          onFoto={onFoto}
          onAfgerond={onAfgerond}
          onAfwijking={onAfwijking}
          afgerondActief={afgerondActief}
          stapBezig={isBezig}
        />
      </View>
    );
  }

  return (
    <TelefoonLayout
      stap={stap}
      opdrachtId={opdrachtId}
      instructie={instructie}
      fotos={fotos}
      fotoAnalyse={fotoAnalyse}
      uploading={uploading}
      antwoord={antwoord}
      afgerondActief={afgerondActief}
      wachtendOpAi={wachtendOpAi}
      toonEigenStapHeader={toonEigenStapHeader}
      isBezig={isBezig}
      onFoto={onFoto}
      onAfgerond={onAfgerond}
      onAfwijking={onAfwijking}
      onAntwoordChange={onAntwoordChange}
    />
  );
}

export { parseInstructie };
export type { Instructie };

export function UitvoeringLaadScherm() {
  const { theme } = useUitvoeringTheme();
  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.achtergrond }}
    >
      <ActivityIndicator size="large" color={theme.accent} />
      <Text
        style={{
          color: theme.gedemptTekst,
          marginTop: 12,
          fontFamily: "Inter_400Regular",
          fontSize: 14,
        }}
      >
        Stap laden...
      </Text>
    </View>
  );
}
