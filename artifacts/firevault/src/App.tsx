import React from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Loader2, Lock, AlertTriangle } from "lucide-react";
import { featureFlags } from "@/lib/feature-flags";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { useWachtwoordWijzigen } from "@workspace/api-client-react";
import { WerkmaatschappijProvider } from "@/context/werkmaatschappij-context";
import { TaalProvider } from "@/context/taal-context";
import { useRol, RolProvider } from "@/context/rol-context";
import { AchievementProvider } from "@/context/achievement-context";
import { WeergaveProvider } from "@/context/weergave-context";
import LoginPagina from "@/pages/auth/login";
import ActivatiePagina from "@/pages/uitnodiging/index";
import InstallatiePagina from "@/pages/installatie/index";
import WachtwoordVergetenPagina from "@/pages/auth/wachtwoord-vergeten";
import WachtwoordResetPagina from "@/pages/auth/wachtwoord-reset";
import PortaalPagina from "@/pages/portaal/index";
import { useBootstrapBeschikbaar } from "@/hooks/use-bootstrap-status";

import BeheerderLayout from "@/layouts/beheerder-layout";
import MonteurLayout from "@/layouts/monteur-layout";
import KlantLayout from "@/layouts/klant-layout";

import BeheerderDashboard from "@/pages/dashboard/beheerder";
import MonteurDashboard from "@/pages/dashboard/monteur";
import KlantDashboard from "@/pages/dashboard/klant";
import KlantRapportages from "@/pages/klant/rapportages";

import Gebouwen from "@/pages/gebouwen/index";
import GebouwDetail from "@/pages/gebouwen/detail";
import GebouwPrint from "@/pages/gebouwen/print";
import Plattegrond from "@/pages/gebouwen/plattegrond";
import Voorzieningen from "@/pages/voorzieningen/index";
import VoorzieningDetail from "@/pages/voorzieningen/detail";
import VoorzieningNieuw from "@/pages/voorzieningen/nieuw";
import VoorzieningQr from "@/pages/voorzieningen/qr";
import Inspecties from "@/pages/inspecties/index";
import InspectieDetail from "@/pages/inspecties/detail";
import Onderhoud from "@/pages/onderhoud/index";
import ContractDetail from "@/pages/onderhoud/contract-detail";
import InkoopOverzicht from "@/pages/inkoop/index";
import WerkbonDetail from "@/pages/onderhoud/werkbon-detail";
import Gebruikers from "@/pages/gebruikers/index";
import CrmKlanten from "@/pages/crm/index";
import CrmKlantDetail from "@/pages/crm/detail";
import CrmOrganisaties from "@/pages/crm/organisaties";
import CrmProjectkansen from "@/pages/crm/projectkansen";
import CrmConcurrenten from "@/pages/crm/concurrenten";
import CrmMarktintelligentie from "@/pages/crm/marktintelligentie";
import CrmContactpersonen from "@/pages/crm/contactpersonen";
import CrmKennisbibliotheek from "@/pages/crm/kennisbibliotheek";
import CrmTaken from "@/pages/crm/taken";
import CrmRelatievoorstellen from "@/pages/crm/relatievoorstellen";
import WerkInboxPagina from "@/pages/werk-inbox/index";
import Abonnementen from "@/pages/abonnementen/index";
import LoginPogingen from "@/pages/beheer/login-pogingen";
import AuditTrail from "@/pages/beheer/audit";
import AiAanroepenBeheer from "@/pages/beheer/ai-aanroepen";
import HelpdeskBeheer from "@/pages/beheer/helpdesk";
import FeedbackBeheer from "@/pages/beheer/feedback";
import Heatmaps from "@/pages/beheer/heatmaps";
import VisualLibraryBeheer from "@/pages/beheer/visual-library";
import ProfielenBeheer from "@/pages/beheer/profielen";
import ToepassingenBeheer from "@/pages/beheer/toepassingen";
import Bibliotheek from "@/pages/beheer/bibliotheek";
import VisualsLegacyBeheer from "@/pages/beheer/visuals";
import Ontwikkelstatus from "@/pages/beheer/ontwikkelstatus";
import DocumentopmaakBeheer from "@/pages/organisatie/documentopmaak";
import WerkmaatschappijPagina from "@/pages/organisatie/werkmaatschappijen";
import SpotconfiguratieBeheer from "@/pages/beheer/spotconfiguratie";
import MailBeheer from "@/pages/beheer/mail";
import BackupBeheer from "@/pages/beheer/backup";
import HerstelDashboard from "@/pages/beheer/herstel";
import ImportPagina from "@/pages/beheer/import";
import InstellingenPagina from "@/pages/instellingen/index";
import LeveranciersPagina from "@/pages/leveranciers/index";
import LeverancierDetailPagina from "@/pages/leveranciers/detail";
import ArtikelenPagina from "@/pages/artikelen/index";
import ProjectstatusPagina from "@/pages/beheer/projectstatus";
import PwaTest from "@/pages/beheer/pwa-test";
import PrivacyCentrum from "@/pages/mijn/privacy";
import BeheerPrivacy from "@/pages/beheer/privacy";
import AvgBeheer from "@/pages/beheer/avg";
import RollenRechtenBeheer from "@/pages/beheer/rollen-rechten";
import GoedkeuringsbeleidBeheer from "@/pages/beheer/goedkeuringsbeleid";
import BiaeBeheer from "@/pages/beheer/biae";
import GoedkeuringenDashboard from "@/pages/beheer/goedkeuringen-dashboard";
import DeclaratiesPagina from "@/pages/declaraties/index";
import DeclaratieDetailPagina from "@/pages/declaraties/detail";
import ObjectRechtenBeheer from "@/pages/beheer/object-rechten";
import OpnamePagina from "@/pages/opname/index";
import OpnameDetailPagina from "@/pages/opname/detail";
import InfoPagina from "@/pages/info/index";
import PersoneelPagina from "@/pages/personeel/index";
import MedewerkerDetailPagina from "@/pages/personeel/detail";
import ContractbewakingPagina from "@/pages/personeel/contracten";
import VerlofOverzichtPagina from "@/pages/personeel/verlof-overzicht";
import VerlofInstellingenPagina from "@/pages/personeel/verlof-instellingen";
import JaarAfsluitingPagina from "@/pages/personeel/jaarafsluiting";
import CapaciteitsplanningPagina from "@/pages/personeel/capaciteitsplanning";
import UitboardenPagina from "@/pages/personeel/uitboarden";
import OudMedewerkersPagina from "@/pages/personeel/oud-medewerkers";
import ExternenPagina from "@/pages/personeel/externen";
import OnboardenPagina from "@/pages/personeel/onboarden";
import JaarplanningPagina from "@/pages/personeel/jaarplanning";
import GereedschappenPagina from "@/pages/gereedschappen/index";
import GereedschapDetailPagina from "@/pages/gereedschappen/detail";
import WagenparkPagina from "@/pages/wagenpark/index";
import WagenparkDetailPagina from "@/pages/wagenpark/detail";
import WagenparkBrandstofImportPagina from "@/pages/wagenpark/brandstof-import";
import WagenparkMeldingenPagina from "@/pages/wagenpark/meldingen";
import MagazijnDashboardPagina from "@/pages/magazijn/dashboard";
import MagazijnArtikelenPagina from "@/pages/magazijn/artikelen";
import MagazijnArtikelenBarcodesBulkPagina from "@/pages/magazijn/artikelen-barcodes-bulk";
import MagazijnArtikelDetailPagina from "@/pages/magazijn/artikel-detail";
import MagazijnArtikelLabelPagina from "@/pages/magazijn/artikel-label";
import MagazijnLocatiesPagina from "@/pages/magazijn/locaties";
import MagazijnVoorraadPagina from "@/pages/magazijn/voorraad";
import MagazijnStellingsscansPagina from "@/pages/magazijn/stellingscans";
import MagazijnMutatiesPagina from "@/pages/magazijn/mutaties";
import MagazijnReserveringenPagina from "@/pages/magazijn/reserveringen";
import MagazijnUitgiftesPagina from "@/pages/magazijn/uitgiftes";
import MagazijnRetourenPagina from "@/pages/magazijn/retouren";
import MagazijnInkoopordersPagina from "@/pages/magazijn/inkooporders";
import MagazijnInkooporderDetailPagina from "@/pages/magazijn/inkooporder-detail";
import MagazijnPicklijstenPagina from "@/pages/magazijn/picklijsten";
import MagazijnPicklijstDetailPagina from "@/pages/magazijn/picklijst-detail";
import MagazijnVoorraadwaardePagina from "@/pages/magazijn/voorraadwaarde";
import HallOfFamePagina from "@/pages/hall-of-fame";
import AutoparkPagina from "@/pages/organisatie/autopark";
import VerzekeringenPagina from "@/pages/organisatie/verzekeringen";
import BedrijfsgegevensPagina from "@/pages/organisatie/bedrijfsgegevens";
import JaarverslagenPagina from "@/pages/organisatie/jaarverslagen";
import BedrijfsdocumentenPagina from "@/pages/organisatie/bedrijfsdocumenten";
import DocumentStudioPagina from "@/pages/organisatie/studio";
import WorkflowDesignerPagina from "@/pages/workflow/index";
import BedrijfsresultatenPagina from "@/pages/financieel/bedrijfsresultaten";
import CredieurenInboxPagina from "@/pages/financieel/crediteuren/index";
import OnderhandenWerkPagina from "@/pages/financieel/onderhanden-werk/index";
import JarrekeningPagina from "@/pages/financieel/jaarrekening/index";
import JaarrekeningenValidatiePagina from "@/pages/financieel/jaarrekeningen/index";
import MeerjarenoverzichtPagina from "@/pages/financieel/meerjarenoverzicht/index";
import ContractenPagina from "@/pages/financieel/contracten/index";
import DossiersPagina from "@/pages/dossiers/index";
import OffertesPagina from "@/pages/offertes/index";
import ProposalStudio from "@/pages/offertes/studio";
import OffertePrintPagina from "@/pages/offertes/print";
import FactuurPrintPagina from "@/pages/facturen/print";
import OpdrachtDetailPagina from "@/pages/opdrachten/detail";
import WerkvoorbereidingOverzicht from "@/pages/werkvoorbereiding/index";
import RegiePagina from "@/pages/regie/index";
import RegieDetailPagina from "@/pages/regie/detail";
import DocumentenPagina from "@/pages/documenten/index";
import { OndersteuningWidget } from "@/components/ondersteuning-widget";
import WelkomWizard, { isWelkomAfgerond } from "@/pages/welkom/index";
import RapportenPagina from "@/pages/rapporten/index";
import UrenPagina from "@/pages/uren/index";
import WeekstatenPaginaComponent from "@/pages/uren/weekstaten";
import ToolboxPagina from "@/pages/toolbox/index";
import VeiligheidToolboxenPagina from "@/pages/veiligheid/toolboxen";
import VeiligheidLmraPagina from "@/pages/veiligheid/lmra";
import VeiligheidMeldingenPagina from "@/pages/veiligheid/meldingen";
import VeiligheidIncidentenPagina from "@/pages/veiligheid/incidenten";
import VeiligheidPbmPagina from "@/pages/veiligheid/pbm";
import ToolboxCompliancePagina from "@/pages/veiligheid/toolbox-compliance";
import SnagstreamArchiefPagina from "@/pages/snagstream/index";
import SnagstreamDetailPagina from "@/pages/snagstream/detail";
import FacturenPagina from "@/pages/facturen/index";
import FactuurDetailPagina from "@/pages/facturen/detail";
import ControleboxPagina from "@/pages/facturen/controlebox";
import KlaarVoorExportPagina from "@/pages/facturen/klaar-voor-export";
import FinancieelDashboardPagina from "@/pages/facturen/dashboard";
import ExportlogPagina from "@/pages/facturen/exportlog";
import SalarisarchiefPagina from "@/pages/salarisarchief/index";
import SalarisarchiefBatchDetailPagina from "@/pages/salarisarchief/batch-detail";
import SepaBestandenPagina from "@/pages/sepa-bestanden/index";
import MijnSalarisdocumentenPagina from "@/pages/mijn/salarisdocumenten";
import AiLogBeheer from "@/pages/beheer/ai-log";
import GovernancePagina from "@/pages/beheer/governance";
import SecurityIntakePagina from "@/pages/beheer/security-intake";
import AiPromptGovernance from "@/pages/beheer/ai-prompt-governance";
import SecurityValidation from "@/pages/beheer/security-validation";
import ReleaseReadiness from "@/pages/beheer/release-readiness";
import KantoorReleaseDashboard from "@/pages/beheer/kantoor-release";
import ReleaseNotesPagina from "@/pages/release-notes";
import BoekhoudingBeheer from "@/pages/beheer/boekhouding";
import GoLivePagina from "@/pages/beheer/go-live";
import BedrijfskompasPage from "@/pages/beheer/bedrijfskompas";
import DirectieKompasPagina from "@/pages/directie/kompas";
import DirectieCockpitPagina from "@/pages/directie/cockpit";
import LiquiditeitPagina from "@/pages/directie/liquiditeit";
import MeldingenBeheerPage from "@/pages/beheer/meldingen";
import GebouwenArchiefBeheer from "@/pages/beheer/gebouwen-archief";
import SalarisMutatiesPagina from "@/pages/salaris-mutaties/index";
import ScabMailPagina from "@/pages/scab-mail/index";
import BoekhouderPortaalPagina from "@/pages/boekhouder/index";
import LoonOutputPagina from "@/pages/loon-output/index";
import BerichtenPagina from "@/pages/berichten/index";
import ModulesCalculatie from "@/pages/modules/calculatie/index";
import ModulesCalculatieNieuw from "@/pages/modules/calculatie/nieuw";
import ModulesCalculatieImport from "@/pages/modules/calculatie/import";
import ModulesCalculatieDetail from "@/pages/modules/calculatie/detail";
import ModulesCalculatieLeveranciers from "@/pages/modules/calculatie/leveranciers";
import ModulesCalculatieEenheidsprijzen from "@/pages/modules/calculatie/eenheidsprijzen";
import ModulesCalculatiePrint from "@/pages/modules/calculatie/print";
import ModulesPlanning from "@/pages/modules/planning/index";
import ModulesPlanningMedewerkers from "@/pages/modules/planning/medewerkers";
import ModulesPlanningAfwezigheid from "@/pages/modules/planning/afwezigheid";
import OneDashboard from "@/pages/one/dashboard";
import OneGebouwen from "@/pages/one/gebouwen";
import OneGebouwDetail from "@/pages/one/gebouw-detail";
import OneDocumenten from "@/pages/one/documenten";
import OneRapporten from "@/pages/one/rapporten";
import OneAbonnementen from "@/pages/one/abonnementen";
import OneAdviescentrum from "@/pages/one/adviescentrum";
import { HeatmapTracker } from "@/components/heatmap-tracker";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, retryDelay: 1000 },
    mutations: { retry: 0 },
  },
});

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { fout: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { fout: null };
  }
  static getDerivedStateFromError(fout: Error) {
    return { fout };
  }
  render() {
    if (this.state.fout) {
      return (
        <div className="flex flex-col items-center justify-center h-screen gap-4 text-center px-6">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-red-500" />
          </div>
          <div className="max-w-sm">
            <p className="font-semibold text-lg">Er is een technische fout opgetreden</p>
            <p className="text-sm text-muted-foreground mt-1">
              Laad de pagina opnieuw. Als het probleem aanhoudt, neem dan contact op met de beheerder.
            </p>
          </div>
          <button
            className="text-sm underline text-muted-foreground hover:text-foreground"
            onClick={() => { this.setState({ fout: null }); window.location.reload(); }}
          >
            Pagina herladen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const WeekstatenPagina = () => <WeekstatenPaginaComponent />;

function ModuleNietBeschikbaar({ naam }: { naam: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-center px-4">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
        <Lock className="w-5 h-5 text-muted-foreground" />
      </div>
      <div>
        <p className="font-semibold text-foreground">{naam} — niet beschikbaar in pilot</p>
        <p className="text-sm text-muted-foreground mt-1">
          Deze module is uitgeschakeld in de huidige omgeving.
        </p>
      </div>
    </div>
  );
}

const PlanningNietBeschikbaar = () => <ModuleNietBeschikbaar naam="Planning" />;
const CalculatieNietBeschikbaar = () => <ModuleNietBeschikbaar naam="Calculatie" />;

/**
 * Dashboard adapteert op basis van rol en bevoegdheden.
 * Beheerder-gericht profiel → BeheerderDashboard; anders → MonteurDashboard.
 */
function AdaptieveDashboard() {
  const { rol, bevoegdheden } = useRol();
  const rolStr = rol as string;
  if (rolStr === "hoofdbeheerder" || rolStr === "beheerder") return <BeheerderDashboard />;
  const isBeheerGericht =
    (bevoegdheden.gebouwen ?? 0) >= 1 ||
    (bevoegdheden.personeel ?? 0) >= 1 ||
    (bevoegdheden.planning ?? 0) >= 1;
  return isBeheerGericht ? <BeheerderDashboard /> : <MonteurDashboard />;
}

/**
 * ConnectPortal — enkel portaal voor alle interne FPS Connect-gebruikers.
 * Rolonderscheid (wat zichtbaar is) wordt afgehandeld via bevoegdheden in de
 * individuele pagina's en de sidebar; niet via duplicate route-sets.
 */
function ConnectPortal() {
  return (
    <BeheerderLayout>
      <Switch>
        {/* ── Hoofdpagina ── */}
        <Route path="/" component={AdaptieveDashboard} />

        {/* ── Gebouwen (centrale entiteit) ── */}
        <Route path="/gebouwen" component={Gebouwen} />
        <Route path="/gebouwen/:id" component={GebouwDetail} />
        <Route path="/gebouwen/:id/plattegrond/:verdiepingId" component={Plattegrond} />

        {/* ── Spots / Voorzieningen ── */}
        <Route path="/voorzieningen" component={Voorzieningen} />
        <Route path="/voorzieningen/nieuw" component={VoorzieningNieuw} />
        <Route path="/voorzieningen/:id/qr" component={VoorzieningQr} />
        <Route path="/voorzieningen/:id" component={VoorzieningDetail} />

        {/* ── Inspecties (legacy, read-only) ── */}
        <Route path="/inspecties" component={Inspecties} />
        <Route path="/inspecties/:id" component={InspectieDetail} />

        {/* ── CWU: Calculatie & Werkvoorbereiding & Uitvoering ── */}
        <Route path="/opname" component={OpnamePagina} />
        <Route path="/opname/:id" component={OpnameDetailPagina} />
        <Route
          path="/modules/calculatie/nieuw"
          component={featureFlags.calculatie ? ModulesCalculatieNieuw : CalculatieNietBeschikbaar}
        />
        <Route
          path="/modules/calculatie/import"
          component={featureFlags.calculatie ? ModulesCalculatieImport : CalculatieNietBeschikbaar}
        />
        <Route
          path="/modules/calculatie/leveranciers"
          component={featureFlags.calculatie ? ModulesCalculatieLeveranciers : CalculatieNietBeschikbaar}
        />
        <Route
          path="/modules/calculatie/eenheidsprijzen"
          component={featureFlags.calculatie ? ModulesCalculatieEenheidsprijzen : CalculatieNietBeschikbaar}
        />
        <Route
          path="/modules/calculatie/:id"
          component={featureFlags.calculatie ? ModulesCalculatieDetail : CalculatieNietBeschikbaar}
        />
        <Route
          path="/modules/calculatie"
          component={featureFlags.calculatie ? ModulesCalculatie : CalculatieNietBeschikbaar}
        />
        {/* Verouderd pad — redirect naar geconsolideerde module */}
        <Route path="/connect/calculatie/:id">
          {(params) => <Redirect to={`/modules/calculatie/${params.id}`} />}
        </Route>
        <Route path="/connect/calculatie">
          <Redirect to="/modules/calculatie" />
        </Route>

        {/* ── Oplevering & Onderhoud ── */}
        <Route path="/rapporten" component={RapportenPagina} />
        <Route path="/inkoop/overzicht" component={InkoopOverzicht} />
        <Route path="/onderhoud/contracten/:id" component={ContractDetail} />
        <Route path="/onderhoud/werkbonnen/:id" component={WerkbonDetail} />
        <Route path="/onderhoud/:rest*" component={Onderhoud} />
        <Route path="/onderhoud" component={Onderhoud} />

        {/* ── Planning ── */}
        <Route
          path="/modules/planning/medewerkers"
          component={featureFlags.planning ? ModulesPlanningMedewerkers : PlanningNietBeschikbaar}
        />
        <Route
          path="/modules/planning/afwezigheid"
          component={featureFlags.planning ? ModulesPlanningAfwezigheid : PlanningNietBeschikbaar}
        />
        <Route
          path="/modules/planning"
          component={featureFlags.planning ? ModulesPlanning : PlanningNietBeschikbaar}
        />
        {/* Verouderd pad — redirect naar geconsolideerde module */}
        <Route path="/connect/planning">
          <Redirect to="/modules/planning" />
        </Route>

        {/* ── Offertes & Opdrachten ── */}
        <Route path="/offertes" component={OffertesPagina} />
        <Route path="/offertes/:id/print" component={OffertePrintPagina} />
        <Route path="/facturen/:id/print" component={FactuurPrintPagina} />
        <Route path="/offertes/:id" component={ProposalStudio} />
        <Route path="/opdrachten/:id" component={OpdrachtDetailPagina} />
        <Route path="/werkvoorbereiding" component={WerkvoorbereidingOverzicht} />
        <Route path="/regie" component={RegiePagina} />
        <Route path="/regie/:id" component={RegieDetailPagina} />

        {/* ── Documenten & Dossiers ── */}
        <Route path="/documenten" component={DocumentenPagina} />
        <Route path="/dossiers" component={DossiersPagina} />

        {/* ── Veiligheid ── */}
        <Route path="/veiligheid/toolboxen" component={VeiligheidToolboxenPagina} />
        <Route path="/veiligheid/lmra" component={VeiligheidLmraPagina} />
        <Route path="/veiligheid/meldingen" component={VeiligheidMeldingenPagina} />
        <Route path="/veiligheid/incidenten" component={VeiligheidIncidentenPagina} />
        <Route path="/veiligheid/pbm" component={VeiligheidPbmPagina} />
        <Route path="/veiligheid/toolbox-compliance" component={ToolboxCompliancePagina} />

        {/* ── Snagstream ── */}
        <Route path="/snagstream" component={SnagstreamArchiefPagina} />
        <Route path="/snagstream/:id" component={SnagstreamDetailPagina} />
        <Route path="/facturen/dashboard" component={FinancieelDashboardPagina} />
        <Route path="/facturen/exportlog" component={ExportlogPagina} />
        <Route path="/facturen/klaar-voor-export" component={KlaarVoorExportPagina} />
        <Route path="/facturen/controlebox" component={ControleboxPagina} />
        <Route path="/facturen/:id" component={FactuurDetailPagina} />
        <Route path="/facturen" component={FacturenPagina} />
        <Route path="/salarisarchief/batch/:id" component={SalarisarchiefBatchDetailPagina} />
        <Route path="/salarisarchief" component={SalarisarchiefPagina} />
        <Route path="/sepa-bestanden" component={SepaBestandenPagina} />
        <Route path="/salaris-mutaties" component={SalarisMutatiesPagina} />
        <Route path="/scab-mail" component={ScabMailPagina} />
        <Route path="/loon-output" component={LoonOutputPagina} />
        <Route path="/boekhouder" component={BoekhouderPortaalPagina} />

        {/* ── Communicatie ── */}
        <Route path="/berichten" component={BerichtenPagina} />
        <Route path="/toolbox" component={ToolboxPagina} />

        {/* ── Relaties / CRM ── */}
        <Route path="/crm/organisaties" component={CrmOrganisaties} />
        <Route path="/crm/projectkansen" component={CrmProjectkansen} />
        <Route path="/crm/concurrenten" component={CrmConcurrenten} />
        <Route path="/crm/marktintelligentie" component={CrmMarktintelligentie} />
        <Route path="/crm/contactpersonen" component={CrmContactpersonen} />
        <Route path="/crm/taken" component={CrmTaken} />
        <Route path="/crm/relatievoorstellen" component={CrmRelatievoorstellen} />
        <Route path="/crm/kennisbibliotheek" component={CrmKennisbibliotheek} />
        <Route path="/crm/:id" component={CrmKlantDetail} />
        <Route path="/crm" component={CrmKlanten} />

        {/* ── Werk-inbox ── */}
        <Route path="/werk-inbox" component={WerkInboxPagina} />

        {/* ── Personeel ── statische /personeel/* paden vóór dynamisch /:id */}
        <Route path="/personeel/verlof" component={VerlofOverzichtPagina} />
        <Route path="/personeel/verlof-instellingen" component={VerlofInstellingenPagina} />
        <Route path="/personeel/jaarafsluiting" component={JaarAfsluitingPagina} />
        <Route path="/personeel/capaciteitsplanning" component={CapaciteitsplanningPagina} />
        <Route path="/personeel/onboarden" component={OnboardenPagina} />
        <Route path="/personeel/uitboarden" component={UitboardenPagina} />
        <Route path="/personeel/oud-medewerkers" component={OudMedewerkersPagina} />
        <Route path="/personeel/externen" component={ExternenPagina} />
        <Route path="/personeel/contracten" component={ContractbewakingPagina} />
        <Route path="/personeel/jaarplanning" component={JaarplanningPagina} />
        <Route path="/personeel/:id" component={MedewerkerDetailPagina} />
        <Route path="/personeel" component={PersoneelPagina} />
        <Route path="/gereedschappen" component={GereedschappenPagina} />
        <Route path="/gereedschappen/:id" component={GereedschapDetailPagina} />
        <Route path="/wagenpark" component={WagenparkPagina} />
        <Route path="/wagenpark/brandstof-import" component={WagenparkBrandstofImportPagina} />
        <Route path="/wagenpark/meldingen" component={WagenparkMeldingenPagina} />
        <Route path="/wagenpark/:id" component={WagenparkDetailPagina} />

        {/* ── Magazijn ── */}
        <Route path="/magazijn" component={MagazijnDashboardPagina} />
        <Route path="/magazijn/artikelen" component={MagazijnArtikelenPagina} />
        <Route path="/magazijn/artikelen/barcodes-afdrukken" component={MagazijnArtikelenBarcodesBulkPagina} />
        <Route path="/magazijn/artikelen/:id/label" component={MagazijnArtikelLabelPagina} />
        <Route path="/magazijn/artikelen/:id" component={MagazijnArtikelDetailPagina} />
        <Route path="/magazijn/locaties" component={MagazijnLocatiesPagina} />
        <Route path="/magazijn/voorraad" component={MagazijnVoorraadPagina} />
        <Route path="/magazijn/stellingscans" component={MagazijnStellingsscansPagina} />
        <Route path="/magazijn/mutaties" component={MagazijnMutatiesPagina} />
        <Route path="/magazijn/reserveringen" component={MagazijnReserveringenPagina} />
        <Route path="/magazijn/uitgiftes" component={MagazijnUitgiftesPagina} />
        <Route path="/magazijn/retouren" component={MagazijnRetourenPagina} />
        <Route path="/magazijn/inkooporders" component={MagazijnInkoopordersPagina} />
        <Route path="/magazijn/inkooporders/:id" component={MagazijnInkooporderDetailPagina} />
        <Route path="/magazijn/picklijsten" component={MagazijnPicklijstenPagina} />
        <Route path="/magazijn/picklijsten/:id" component={MagazijnPicklijstDetailPagina} />
        <Route path="/magazijn/voorraadwaarde" component={MagazijnVoorraadwaardePagina} />

        {/* ── Financieel extra ── */}
        <Route path="/financieel/crediteuren" component={CredieurenInboxPagina} />
        <Route path="/financieel/bedrijfsresultaten" component={BedrijfsresultatenPagina} />
        <Route path="/financieel/onderhanden-werk" component={OnderhandenWerkPagina} />
        <Route path="/financieel/jaarrekening" component={JarrekeningPagina} />
        <Route path="/financieel/jaarrekeningen" component={JaarrekeningenValidatiePagina} />
        <Route path="/financieel/meerjarenoverzicht" component={MeerjarenoverzichtPagina} />
        <Route path="/financieel/contracten" component={ContractenPagina} />

        {/* ── Organisatie ── */}
        <Route path="/organisatie/autopark" component={AutoparkPagina} />
        <Route path="/organisatie/verzekeringen" component={VerzekeringenPagina} />
        <Route path="/organisatie/bedrijfsgegevens" component={BedrijfsgegevensPagina} />
        <Route path="/organisatie/jaarverslagen" component={JaarverslagenPagina} />
        <Route path="/organisatie/bedrijfsdocumenten" component={BedrijfsdocumentenPagina} />
        <Route path="/organisatie/studio" component={DocumentStudioPagina} />
        <Route path="/workflow" component={WorkflowDesignerPagina} />
        <Route path="/uren" component={UrenPagina} />
        <Route path="/weekstaten" component={WeekstatenPagina} />
        <Route path="/hall-of-fame" component={HallOfFamePagina} />
        {/* Verouderd pad — redirect naar personeel */}
        <Route path="/connect/hrm">
          <Redirect to="/personeel" />
        </Route>

        {/* ── Inkoop ── */}
        <Route path="/leveranciers" component={LeveranciersPagina} />
        <Route path="/leveranciers/:id" component={LeverancierDetailPagina} />
        <Route path="/artikelen" component={ArtikelenPagina} />

        {/* ── Beheer ── */}
        <Route path="/gebruikers" component={Gebruikers} />
        <Route path="/abonnementen" component={Abonnementen} />
        <Route path="/beheer/toepassingen" component={ToepassingenBeheer} />
        <Route path="/beheer/bibliotheek" component={Bibliotheek} />
        <Route path="/beheer/login-pogingen" component={LoginPogingen} />
        <Route path="/beheer/audit" component={AuditTrail} />
        <Route path="/beheer/ai-aanroepen" component={AiAanroepenBeheer} />
        <Route path="/beheer/helpdesk" component={HelpdeskBeheer} />
        <Route path="/beheer/feedback" component={FeedbackBeheer} />
        <Route path="/beheer/heatmaps" component={Heatmaps} />
        <Route path="/beheer/visual-library" component={VisualLibraryBeheer} />
        <Route path="/beheer/profielen" component={ProfielenBeheer} />
        <Route path="/beheer/rollen-rechten" component={RollenRechtenBeheer} />
        <Route path="/beheer/goedkeuringen-dashboard" component={GoedkeuringenDashboard} />
        <Route path="/beheer/goedkeuringsbeleid" component={GoedkeuringsbeleidBeheer} />
        <Route path="/beheer/biae" component={BiaeBeheer} />
        <Route path="/declaraties/:id" component={DeclaratieDetailPagina} />
        <Route path="/declaraties" component={DeclaratiesPagina} />
        <Route path="/beheer/object-rechten" component={ObjectRechtenBeheer} />
        <Route path="/beheer/ontwikkelstatus" component={Ontwikkelstatus} />
        <Route path="/organisatie/documentopmaak" component={DocumentopmaakBeheer} />
        <Route path="/organisatie/werkmaatschappijen" component={WerkmaatschappijPagina} />
        <Route path="/beheer/spotconfiguratie" component={SpotconfiguratieBeheer} />
        <Route path="/beheer/visuals" component={VisualsLegacyBeheer} />
        <Route path="/beheer/mail" component={MailBeheer} />
        <Route path="/beheer/backup" component={BackupBeheer} />
        <Route path="/beheer/herstel" component={HerstelDashboard} />
        <Route path="/beheer/import" component={ImportPagina} />
        <Route path="/beheer/boekhouding" component={BoekhoudingBeheer} />
        <Route path="/beheer/go-live" component={GoLivePagina} />
        <Route path="/beheer/bedrijfskompas" component={BedrijfskompasPage} />
        <Route path="/directie/kompas" component={DirectieKompasPagina} />
        <Route path="/directie/cockpit" component={DirectieCockpitPagina} />
        <Route path="/financieel/liquiditeit" component={LiquiditeitPagina} />
        <Route path="/beheer/meldingen" component={MeldingenBeheerPage} />
        <Route path="/beheer/projectstatus" component={ProjectstatusPagina} />
        <Route path="/beheer/pwa-test" component={PwaTest} />
        <Route path="/instellingen" component={InstellingenPagina} />
        <Route path="/beheer/ai-log" component={AiLogBeheer} />
        <Route path="/beheer/governance-risico" component={GovernancePagina} />
        <Route path="/beheer/security-intake" component={SecurityIntakePagina} />
        <Route path="/beheer/ai-governance" component={AiPromptGovernance} />
        <Route path="/beheer/security-validation" component={SecurityValidation} />
        <Route path="/beheer/release-readiness" component={ReleaseReadiness} />
        <Route path="/beheer/kantoor-release" component={KantoorReleaseDashboard} />
        <Route path="/release-notes" component={ReleaseNotesPagina} />
        <Route path="/beheer/privacy" component={BeheerPrivacy} />
        <Route path="/beheer/avg" component={AvgBeheer} />
        <Route path="/beheer/gebouwen-archief" component={GebouwenArchiefBeheer} />
        <Route path="/mijn/privacy" component={PrivacyCentrum} />
        <Route path="/mijn/salarisdocumenten" component={MijnSalarisdocumentenPagina} />

        {/* ── FPS ONE (klantportaal, via omgevingsswitch) ── */}
        <Route path="/one/dashboard" component={OneDashboard} />
        <Route path="/one/gebouwen/:id" component={OneGebouwDetail} />
        <Route path="/one/gebouwen" component={OneGebouwen} />
        <Route path="/one/documenten" component={OneDocumenten} />
        <Route path="/one/rapporten" component={OneRapporten} />
        <Route path="/one/abonnementen" component={OneAbonnementen} />
        <Route path="/one/adviescentrum" component={OneAdviescentrum} />

        {/* ── Overig ── */}
        <Route path="/info" component={InfoPagina} />
        <Route component={NotFound} />
      </Switch>
    </BeheerderLayout>
  );
}

function MonteurPortal() {
  return (
    <MonteurLayout>
      <Switch>
        <Route path="/" component={MonteurDashboard} />
        <Route path="/onderhoud" component={Onderhoud} />
        <Route path="/inspecties" component={Inspecties} />
        <Route path="/inspecties/:id" component={InspectieDetail} />
        <Route path="/voorzieningen" component={Voorzieningen} />
        <Route path="/voorzieningen/:id/qr" component={VoorzieningQr} />
        <Route path="/voorzieningen/:id" component={VoorzieningDetail} />
        <Route path="/gebouwen" component={Gebouwen} />
        <Route path="/gebouwen/:id" component={GebouwDetail} />
        <Route path="/gebouwen/:id/plattegrond/:verdiepingId" component={Plattegrond} />
        <Route path="/info" component={InfoPagina} />
        <Route component={NotFound} />
      </Switch>
    </MonteurLayout>
  );
}

function KlantPortal() {
  return (
    <KlantLayout>
      <Switch>
        <Route path="/" component={KlantDashboard} />
        <Route path="/gebouwen" component={Gebouwen} />
        <Route path="/gebouwen/:id" component={OneGebouwDetail} />
        <Route path="/klant/rapportages" component={KlantRapportages} />
        <Route path="/info" component={InfoPagina} />
        <Route component={NotFound} />
      </Switch>
    </KlantLayout>
  );
}

function GeenToegang() {
  const { uitloggen } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-sm text-center space-y-4">
        <h1 className="text-xl font-semibold text-foreground">Geen toegang</h1>
        <p className="text-sm text-muted-foreground">
          Je account heeft geen geldige rol om dit portaal te tonen. Neem contact
          op met een beheerder.
        </p>
        <button
          onClick={() => uitloggen()}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Uitloggen
        </button>
      </div>
    </div>
  );
}

function Portalen() {
  const [locatie] = useLocation();
  const { rol, bevoegdheden } = useRol();
  // Cast naar string zodat legacy-rollen (beheerder/monteur/controleur) die nog
  // in de database kunnen staan ook matchen — T016 converteert ze naar "gebruiker".
  const rolStr = rol as string;

  // Eerste keer inloggen als hoofdbeheerder → wizard tonen
  if (rolStr === "hoofdbeheerder" && !isWelkomAfgerond() && locatie === "/") {
    return <Redirect to="/welkom" />;
  }

  // Interne FPS Connect gebruikers
  if (rolStr === "hoofdbeheerder" || rolStr === "beheerder") return <ConnectPortal />;

  // Klant-portaal
  if (rolStr === "klant") return <KlantPortal />;

  // Gebruiker met bevoegdhedenmatrix
  if (rolStr === "gebruiker") {
    const heeftToegang = Object.values(bevoegdheden).some((n) => n > 0);
    return heeftToegang ? <ConnectPortal /> : <GeenToegang />;
  }

  // Legacy: monteur/controleur — worden in T016 omgezet naar "gebruiker"
  if (rolStr === "monteur" || rolStr === "controleur") return <MonteurPortal />;

  return <GeenToegang />;
}

/**
 * Blokkerende wachtwoord-wijzig-pagina. Wordt getoond wanneer de gebruiker
 * is ingelogd maar `moet_wachtwoord_wijzigen = true` heeft staan (bijv. na
 * een admin-reset met tijdelijk wachtwoord). De server blokkeert intussen
 * alle data-routes met 403 WACHTWOORD_WIJZIGEN_VEREIST; deze UI geeft een
 * duidelijk herstelpad zodat de gebruiker niet met lege schermen blijft zitten.
 */
function WachtwoordWijzigenScherm() {
  const { herlaad } = useAuth();
  const [huidig, setHuidig] = React.useState("");
  const [nieuw, setNieuw] = React.useState("");
  const [bevestig, setBevestig] = React.useState("");
  const [fout, setFout] = React.useState<string | null>(null);

  const { mutate, isPending, isSuccess } = useWachtwoordWijzigen({
    mutation: {
      onSuccess: () => {
        herlaad();
      },
      onError: () => {
        setFout(
          "Huidig wachtwoord is onjuist of het nieuwe wachtwoord voldoet niet aan de eisen (minimaal 8 tekens).",
        );
      },
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFout(null);
    if (nieuw !== bevestig) {
      setFout("De nieuwe wachtwoorden komen niet overeen.");
      return;
    }
    if (nieuw.length < 8) {
      setFout("Nieuw wachtwoord moet minimaal 8 tekens bevatten.");
      return;
    }
    mutate({ data: { huidig_wachtwoord: huidig, nieuw_wachtwoord: nieuw } });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
            <Lock className="w-5 h-5 text-amber-600" />
          </div>
          <h1 className="text-xl font-semibold">Wachtwoord wijzigen vereist</h1>
          <p className="text-sm text-muted-foreground">
            Uw account vereist een wachtwoordwijziging voordat u verder kunt.
            Stel hieronder een nieuw wachtwoord in.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="ww-huidig" className="text-sm font-medium">
              Huidig wachtwoord
            </label>
            <input
              id="ww-huidig"
              type="password"
              required
              autoComplete="current-password"
              value={huidig}
              onChange={(e) => setHuidig(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ww-nieuw" className="text-sm font-medium">
              Nieuw wachtwoord
            </label>
            <input
              id="ww-nieuw"
              type="password"
              required
              autoComplete="new-password"
              value={nieuw}
              onChange={(e) => setNieuw(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">Minimaal 8 tekens</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ww-bevestig" className="text-sm font-medium">
              Bevestig nieuw wachtwoord
            </label>
            <input
              id="ww-bevestig"
              type="password"
              required
              autoComplete="new-password"
              value={bevestig}
              onChange={(e) => setBevestig(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {fout && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {fout}
            </p>
          )}
          {isSuccess && (
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              Wachtwoord gewijzigd. Een moment...
            </p>
          )}
          <button
            type="submit"
            disabled={isPending || isSuccess}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isPending ? "Opslaan..." : "Wachtwoord instellen"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Gate() {
  const { isLoading, isAuthenticated, gebruiker } = useAuth();

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const pad = window.location.pathname.slice(base.length) || "/";

  // Publieke paden die nooit naar /first-install omgeleid mogen worden —
  // ook niet zolang de installatie nog niet voltooid is.
  const isSpeciaalPad =
    pad.startsWith("/uitnodiging/") ||
    pad.startsWith("/portaal/") ||
    pad === "/first-install" ||
    pad === "/wachtwoord-vergeten" ||
    pad === "/wachtwoord-reset";

  // Alleen controleren of de bootstrap nog open staat wanneer dat relevant
  // kan zijn: niet ingelogd, nog niet aan het laden, en geen speciaal pad.
  const bootstrapCheckActief = !isLoading && !isAuthenticated && !isSpeciaalPad;
  const bootstrapBeschikbaar = useBootstrapBeschikbaar(bootstrapCheckActief);

  if (pad.startsWith("/uitnodiging/")) {
    const token = pad.replace("/uitnodiging/", "");
    return <ActivatiePagina token={token} />;
  }
  if (pad.startsWith("/portaal/")) {
    const token = pad.replace("/portaal/", "");
    return <PortaalPagina token={token} />;
  }
  if (pad === "/first-install") {
    return <InstallatiePagina />;
  }
  if (pad === "/wachtwoord-vergeten") {
    return <WachtwoordVergetenPagina />;
  }
  if (pad === "/wachtwoord-reset") {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") ?? "";
    return <WachtwoordResetPagina token={token} />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    if (bootstrapCheckActief && bootstrapBeschikbaar === "laden") {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      );
    }
    if (bootstrapBeschikbaar === true) {
      window.location.href = base + "/first-install";
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      );
    }
    return <LoginPagina />;
  }

  // Verplichte wachtwoordwijziging vóór toegang tot het portaal. De server
  // blokkeert alle data-routes met 403 WACHTWOORD_WIJZIGEN_VEREIST; de UI
  // geeft hier een duidelijk herstelpad zodat de gebruiker niet vastraakt.
  if (gebruiker?.moet_wachtwoord_wijzigen) {
    return <WachtwoordWijzigenScherm />;
  }

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Switch>
        <Route path="/welkom" component={WelkomWizard} />
        <Route path="/gebouwen/:id/print" component={GebouwPrint} />
        <Route path="/modules/calculatie/:id/print" component={ModulesCalculatiePrint} />
        <Route>
          <AchievementProvider>
            <Portalen />
            <OndersteuningWidget />
            <HeatmapTracker />
          </AchievementProvider>
        </Route>
      </Switch>
    </WouterRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <TaalProvider>
          <WeergaveProvider>
            <AuthProvider>
              <RolProvider>
                <WerkmaatschappijProvider>
                  <AppErrorBoundary>
                    <Gate />
                  </AppErrorBoundary>
                </WerkmaatschappijProvider>
              </RolProvider>
              <Toaster />
            </AuthProvider>
          </WeergaveProvider>
        </TaalProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
