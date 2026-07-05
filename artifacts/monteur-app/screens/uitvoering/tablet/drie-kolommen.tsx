import React from "react";
import { View } from "react-native";

import { useUitvoeringTheme } from "@/context/UitvoeringThemeContext";
import { StapAssistent } from "@/screens/uitvoering/stap-assistent";
import { VisualPaneel, type VisualPanelProvider } from "@/screens/uitvoering/visual-paneel";
import { AiAssistentPaneel } from "@/screens/uitvoering/ai-assistent-paneel";
import { UitvoeringActieBalk } from "@/screens/uitvoering/actie-balk";
import type { PimFotoAnalyse, PimStapRelevantDocument } from "@workspace/api-client-react";

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

type TabletDrieKolommenProps = {
  stapNummer: number;
  werkpakketSleutel?: string | null;
  instructie: Instructie | null;
  referentieFotoUrl?: string | null;
  detailtekeningUrl?: string | null;
  plattegrondVerdiepingId?: number | null;
  fotoAnalyse?: PimFotoAnalyse | null;
  complexiteitScore?: 1 | 2 | 3 | 4 | 5;
  controlepunten?: string[];
  veelgemaakteFouten?: string[];
  projectNotities?: string;
  relevanteDocs?: PimStapRelevantDocument[];
  docsLaden?: boolean;
  aiAntwoord?: string | null;
  aiBezig?: boolean;
  aiFocusTrigger?: number;
  antwoord?: boolean;
  onAntwoordChange?: (value: boolean) => void;
  onVraagAi: (vraag: string) => void;
  onAiFocus: () => void;
  onFoto: () => void;
  onAfgerond: () => void;
  onAfwijking: () => void;
  afgerondActief?: boolean;
  stapBezig?: boolean;
  visualProvider?: VisualPanelProvider;
};

/**
 * Drie-paneel layout voor de tablet Uitvoeringsmodus.
 *
 * Verdeling: Links 30% (StapAssistent) | Midden 40% (VisualPaneel) | Rechts 30% (AiAssistentPaneel)
 * Vaste onderbalk: UitvoeringActieBalk
 *
 * Midden-paneel is scrollbaar; linker en rechter paneel scrollen onafhankelijk.
 */
export function TabletDrieKolommen({
  stapNummer,
  werkpakketSleutel,
  instructie,
  referentieFotoUrl,
  detailtekeningUrl,
  plattegrondVerdiepingId,
  fotoAnalyse,
  complexiteitScore = 1,
  controlepunten,
  veelgemaakteFouten,
  projectNotities,
  relevanteDocs,
  docsLaden,
  aiAntwoord,
  aiBezig,
  aiFocusTrigger = 0,
  antwoord = false,
  onAntwoordChange,
  onVraagAi,
  onAiFocus,
  onFoto,
  onAfgerond,
  onAfwijking,
  afgerondActief = true,
  stapBezig = false,
  visualProvider,
}: TabletDrieKolommenProps) {
  const { theme } = useUitvoeringTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.achtergrond }}>
      <View style={{ flex: 1, flexDirection: "row" }}>
        <View style={{ flex: 30 }}>
          <StapAssistent
            stapNummer={stapNummer}
            werkpakketSleutel={werkpakketSleutel}
            instructie={instructie}
            vastgezet={true}
            antwoord={antwoord}
            onAntwoordChange={onAntwoordChange}
          />
        </View>

        <View style={{ flex: 40 }}>
          <VisualPaneel
            referentieFotoUrl={referentieFotoUrl}
            detailtekeningUrl={detailtekeningUrl}
            plattegrondVerdiepingId={plattegrondVerdiepingId}
            fotoAnalyse={fotoAnalyse}
            complexiteitScore={complexiteitScore}
            provider={visualProvider}
          />
        </View>

        <View style={{ flex: 30 }}>
          <AiAssistentPaneel
            controlepunten={controlepunten}
            veelgemaakteFouten={veelgemaakteFouten}
            projectNotities={projectNotities}
            relevanteDocs={relevanteDocs}
            docsLaden={docsLaden}
            onVraagAi={onVraagAi}
            aiAntwoord={aiAntwoord}
            aiBezig={aiBezig}
            focusTrigger={aiFocusTrigger}
          />
        </View>
      </View>

      <UitvoeringActieBalk
        onFoto={onFoto}
        onAfgerond={onAfgerond}
        onAfwijking={onAfwijking}
        onVraagAi={onAiFocus}
        afgerondActief={afgerondActief}
        bezig={stapBezig}
        isTablet={true}
      />
    </View>
  );
}
