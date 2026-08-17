import { featureFlags } from "@/lib/feature-flags";
import NotFound from "@/pages/not-found";
import { useRol } from "@/context/rol-context";

// ── Paginacomponenten (interne portaalroutes) ──
import BeheerderDashboard from "@/pages/dashboard/beheerder";
import MonteurDashboard from "@/pages/dashboard/monteur";

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
import AlgemeneInkoopPagina from "@/pages/algemene-inkoop/index";
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
import CrmMarketing from "@/pages/crm/marketing";
import CrmSocial from "@/pages/crm/social";
import CrmMerkenkast from "@/pages/crm/merkenkast";
import CrmBeeldbank from "@/pages/crm/beeldbank";
import CrmAanvragen from "@/pages/crm/aanvragen";
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
import MailboxenBeheer from "@/pages/beheer/mailboxen";
import BackupBeheer from "@/pages/beheer/backup";
import MailWachtrijBeheer from "@/pages/beheer/mail-wachtrij";
import HerstelDashboard from "@/pages/beheer/herstel";
import ImportPagina from "@/pages/beheer/import";
import PrijsafsprakenBeheerPagina from "@/pages/beheer/prijsafspraken";
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
import AssistentPagina from "@/pages/assistent";
import { AssistentContextProvider } from "@/lib/assistent-context";
import PersoneelPagina from "@/pages/personeel/index";
import MedewerkerDetailPagina from "@/pages/personeel/detail";
import ContractbewakingPagina from "@/pages/personeel/contracten";
import VerlofOverzichtPagina from "@/pages/personeel/verlof-overzicht";
import VerlofInstellingenPagina from "@/pages/personeel/verlof-instellingen";
import IndirecteWerkzaamhedenPagina from "@/pages/beheer/indirecte-werkzaamheden";
import JaarAfsluitingPagina from "@/pages/personeel/jaarafsluiting";
import CapaciteitsplanningPagina from "@/pages/personeel/capaciteitsplanning";
import UitboardenPagina from "@/pages/personeel/uitboarden";
import OudMedewerkersPagina from "@/pages/personeel/oud-medewerkers";
import ExternenPagina from "@/pages/personeel/externen";
import UitzendbureauKoppelingenPagina from "@/pages/personeel/uitzendbureaus";
import OnboardenPagina from "@/pages/personeel/onboarden";
import HrmIntegriteitstools from "@/pages/personeel/hrm-integriteitstools";
import JaarplanningPagina from "@/pages/personeel/jaarplanning";
import JaarkalenderPagina from "@/pages/personeel/jaarkalender";
import GereedschappenPagina from "@/pages/gereedschappen/index";
import GereedschapDetailPagina from "@/pages/gereedschappen/detail";
import WagenparkPagina from "@/pages/wagenpark/index";
import WagenparkDetailPagina from "@/pages/wagenpark/detail";
import WagenparkBrandstofImportPagina from "@/pages/wagenpark/brandstof-import";
import WagenparkMeldingenPagina from "@/pages/wagenpark/meldingen";
import WagenparkBuitenWerktijdPagina from "@/pages/wagenpark/buiten-werktijd";
import WagenparkDocumentsoortenPagina from "@/pages/wagenpark/documentsoorten";
import WagenparkFormPagina from "@/pages/wagenpark/form";
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
import WorkflowPagina from "@/pages/workflow";
import TeamOverlegPagina from "@/pages/team-overleg";
import BedrijfsresultatenPagina from "@/pages/financieel/bedrijfsresultaten";
import CredieurenInboxPagina from "@/pages/financieel/crediteuren/index";
import OnderhandenWerkPagina from "@/pages/financieel/onderhanden-werk/index";
import JarrekeningPagina from "@/pages/financieel/jaarrekening/index";
import JaarrekeningenValidatiePagina from "@/pages/financieel/jaarrekeningen/index";
import MeerjarenoverzichtPagina from "@/pages/financieel/meerjarenoverzicht/index";
import AkDashboardPagina from "@/pages/financieel/ak-dashboard";
import ScenariosPagina from "@/pages/financieel/scenarios";
import ContractenPagina from "@/pages/financieel/contracten/index";
import MarktspiegelPagina from "@/pages/financieel/marktspiegel/index";
import DossiersPagina from "@/pages/dossiers/index";
import OffertesPagina from "@/pages/offertes/index";
import ProposalStudio from "@/pages/offertes/studio";
import OffertePrintPagina from "@/pages/offertes/print";
import FactuurPrintPagina from "@/pages/facturen/print";
import OpdrachtDetailPagina from "@/pages/opdrachten/detail";
import WerkvoorbereidingOverzicht from "@/pages/werkvoorbereiding/index";
import UitvoeringOverzichtPagina from "@/pages/uitvoering/index";
import UitvoeringDetailPagina from "@/pages/uitvoering/detail";
import RegiePagina from "@/pages/regie/index";
import RegieDetailPagina from "@/pages/regie/detail";
import DocumentenPagina from "@/pages/documenten/index";
import { OndersteuningWidget } from "@/components/ondersteuning-widget";
import WelkomWizard, { isWelkomAfgerond } from "@/pages/welkom/index";
import InitialenPrompt from "@/components/initialen-prompt";
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
import FactuurstroomBewakingPagina from "@/pages/facturen/stroom";
import SalarisarchiefPagina from "@/pages/salarisarchief/index";
import SalarisarchiefBatchDetailPagina from "@/pages/salarisarchief/batch-detail";
import SepaBestandenPagina from "@/pages/sepa-bestanden/index";
import MijnSalarisdocumentenPagina from "@/pages/mijn/salarisdocumenten";
import MailVoorkeurenPagina from "@/pages/mijn/mail-voorkeuren";
import MijnDeclaratiesPagina from "@/pages/mijn/declaraties";
import MijnVerlofPagina from "@/pages/mijn/verlof";
import AiLogBeheer from "@/pages/beheer/ai-log";
import GovernancePagina from "@/pages/beheer/governance";
import SecurityIntakePagina from "@/pages/beheer/security-intake";
import AiPromptGovernance from "@/pages/beheer/ai-prompt-governance";
import SecurityValidation from "@/pages/beheer/security-validation";
import ReleaseReadiness from "@/pages/beheer/release-readiness";
import KantoorReleaseDashboard from "@/pages/beheer/kantoor-release";
import SysteemstatusBeheer from "@/pages/beheer/systeemstatus";
import MetingenMateriaalBeheer from "@/pages/beheer/metingen-materiaal";
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
import { HeatmapTracker } from "@/components/heatmap-tracker";
import WervingPagina from "@/pages/personeel/werving";
import WervingDetailPagina from "@/pages/personeel/werving-detail";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { Lock, ShieldOff } from "lucide-react";
import { useEffect } from "react";

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
const WizardNietBeschikbaar = () => <ModuleNietBeschikbaar naam="Wizard onboarding" />;

/**
 * Puur uitvoerende veldmedewerkers (monteurs/timmermannen) mogen kantoor-
 * gerichte pagina's niet benaderen — ook niet via een directe URL.
 * Dezelfde criteria als in beheerder-layout.tsx (isUitvoerendVeld).
 */
const UITVOERENDE_FUNCTIES = ["Monteur", "Timmerman", "Uitvoerder", "Onderhoudsmonteur"];

/**
 * Pad-prefixen die voor veldmedewerkers zijn geblokkeerd. Elke prefix dekt
 * zowel het exacte pad als alle sub-paden (bijv. /offertes/123).
 * Synchroon houden met de !isUitvoerendVeld-blokken in beheerder-layout.tsx.
 */
const VELD_GEBLOKKEERDE_PREFIXEN = [
  // Projectaanpak
  "/gebouwen",
  "/voorzieningen",
  "/opname",
  "/modules/calculatie",
  "/modules/planning",
  "/offertes",
  "/opdrachten",
  "/werkvoorbereiding",
  "/inkoop",
  "/regie",
  "/uitvoering",
  "/rapporten",
  "/onderhoud",
  "/dossiers",
  "/documenten",
  "/snagstream",
  "/magazijn",
  "/gereedschappen",
  // Communicatie
  "/berichten",
  "/werk-inbox",
  "/workflow",
  "/team-overleg",
  // Declaraties
  "/declaraties",
] as const;
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
 * ConnectRoutes — de complete route-Switch van het interne portaal, los van
 * het BeheerderLayout. Zo kan hij zowel over de volle breedte (via
 * ConnectPortal, ongewijzigd gedrag) als binnen een baan (PANEEL_01) worden
 * gerenderd. Elke baan wikkelt dit in een eigen wouter-<Router> met een eigen
 * memoryLocation, zodat navigatie binnen een baan blijft.
 */
export function ConnectRoutes() {
  const { rol, functietitels } = useRol();
  const [location] = useLocation();

  const isHoofdbeheerder = rol === "hoofdbeheerder";
  const isUitvoerendVeld =
    !isHoofdbeheerder &&
    functietitels.length > 0 &&
    functietitels.every((f) => UITVOERENDE_FUNCTIES.includes(f));

  // Veldmedewerker op een geblokkeerd pad → toon omleidingspagina.
  if (
    isUitvoerendVeld &&
    VELD_GEBLOKKEERDE_PREFIXEN.some(
      (pad) => location === pad || location.startsWith(pad + "/"),
    )
  ) {
    return <VeldwerkOmleiding />;
  }

  return (
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
        <Route path="/algemene-inkoop" component={AlgemeneInkoopPagina} />
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
        <Route path="/uitvoering" component={UitvoeringOverzichtPagina} />
        <Route path="/uitvoering/:id" component={UitvoeringDetailPagina} />
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
        <Route path="/facturen/stroom" component={FactuurstroomBewakingPagina} />
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
        <Route path="/crm/aanvragen" component={CrmAanvragen} />
        <Route path="/crm/projectkansen" component={CrmProjectkansen} />
        <Route path="/crm/concurrenten" component={CrmConcurrenten} />
        <Route path="/crm/marktintelligentie" component={CrmMarktintelligentie} />
        <Route path="/crm/contactpersonen" component={CrmContactpersonen} />
        <Route path="/crm/taken" component={CrmTaken} />
        <Route path="/crm/relatievoorstellen" component={CrmRelatievoorstellen} />
        <Route path="/crm/marketing" component={CrmMarketing} />
        <Route path="/crm/social" component={CrmSocial} />
        <Route path="/crm/merkenkast" component={CrmMerkenkast} />
        <Route path="/crm/beeldbank" component={CrmBeeldbank} />
        <Route path="/crm/kennisbibliotheek" component={CrmKennisbibliotheek} />
        <Route path="/crm/:id" component={CrmKlantDetail} />
        <Route path="/crm" component={CrmKlanten} />

        {/* ── Werk-inbox ── */}
        <Route path="/werk-inbox" component={WerkInboxPagina} />
        <Route path="/assistent" component={AssistentPagina} />

        {/* ── WERKBAK_02: persoonlijke workflow + team & overleg ── */}
        <Route path="/workflow" component={WorkflowPagina} />
        <Route path="/team-overleg" component={TeamOverlegPagina} />

        {/* ── Personeel ── statische /personeel/* paden vóór dynamisch /:id */}
        <Route path="/personeel/verlof" component={VerlofOverzichtPagina} />
        <Route path="/personeel/verlof-instellingen" component={VerlofInstellingenPagina} />
        <Route path="/beheer/indirecte-werkzaamheden" component={IndirecteWerkzaamhedenPagina} />
        <Route path="/personeel/jaarafsluiting" component={JaarAfsluitingPagina} />
        <Route path="/personeel/capaciteitsplanning" component={CapaciteitsplanningPagina} />
        <Route path="/personeel/onboarden" component={featureFlags.wizardOnboarding ? OnboardenPagina : WizardNietBeschikbaar} />
        <Route path="/personeel/integriteitstools" component={featureFlags.wizardOnboarding ? HrmIntegriteitstools : WizardNietBeschikbaar} />
        <Route path="/personeel/uitboarden" component={UitboardenPagina} />
        <Route path="/personeel/oud-medewerkers" component={OudMedewerkersPagina} />
        <Route path="/personeel/externen" component={ExternenPagina} />
        <Route path="/personeel/uitzendbureaus" component={UitzendbureauKoppelingenPagina} />
        <Route path="/personeel/contracten" component={ContractbewakingPagina} />
        <Route path="/personeel/jaarplanning" component={JaarplanningPagina} />
        <Route path="/personeel/jaarkalender" component={JaarkalenderPagina} />
        <Route path="/personeel/werving/:id" component={WervingDetailPagina} />
        <Route path="/personeel/werving" component={WervingPagina} />
        <Route path="/personeel/:id" component={MedewerkerDetailPagina} />
        <Route path="/personeel" component={PersoneelPagina} />
        <Route path="/gereedschappen" component={GereedschappenPagina} />
        <Route path="/gereedschappen/:id" component={GereedschapDetailPagina} />
        <Route path="/wagenpark" component={WagenparkPagina} />
        <Route path="/wagenpark/brandstof-import" component={WagenparkBrandstofImportPagina} />
        <Route path="/wagenpark/meldingen" component={WagenparkMeldingenPagina} />
        <Route path="/wagenpark/buiten-werktijd" component={WagenparkBuitenWerktijdPagina} />
        <Route path="/wagenpark/documentsoorten" component={WagenparkDocumentsoortenPagina} />
        <Route path="/wagenpark/nieuw" component={WagenparkFormPagina} />
        <Route path="/wagenpark/:id/bewerken" component={WagenparkFormPagina} />
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
        <Route path="/financieel/algemene-kosten" component={AkDashboardPagina} />
        <Route path="/financieel/scenarios" component={ScenariosPagina} />
        <Route path="/financieel/contracten" component={ContractenPagina} />
        <Route path="/financieel/marktspiegel" component={MarktspiegelPagina} />
        <Route path="/beheer/prijsafspraken" component={PrijsafsprakenBeheerPagina} />

        {/* ── Organisatie ── */}
        <Route path="/organisatie/autopark" component={AutoparkPagina} />
        <Route path="/organisatie/verzekeringen" component={VerzekeringenPagina} />
        <Route path="/organisatie/bedrijfsgegevens" component={BedrijfsgegevensPagina} />
        <Route path="/organisatie/jaarverslagen" component={JaarverslagenPagina} />
        <Route path="/organisatie/bedrijfsdocumenten" component={BedrijfsdocumentenPagina} />
        <Route path="/organisatie/studio" component={DocumentStudioPagina} />
        <Route path="/workflow-designer" component={WorkflowDesignerPagina} />
        <Route path="/uren" component={UrenPagina} />
        <Route path="/weekstaten" component={WeekstatenPagina} />
        {/* Alias: werkbak-items verwezen historisch naar /uren/weekstaten */}
        <Route path="/uren/weekstaten" component={WeekstatenPagina} />
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
        <Route path="/beheer/mailboxen" component={MailboxenBeheer} />
        <Route path="/beheer/backup" component={BackupBeheer} />
        <Route path="/beheer/mail-wachtrij" component={MailWachtrijBeheer} />
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
        <Route path="/beheer/systeemstatus" component={SysteemstatusBeheer} />
        <Route path="/beheer/metingen-materiaal" component={MetingenMateriaalBeheer} />
        <Route path="/release-notes" component={ReleaseNotesPagina} />
        <Route path="/beheer/privacy" component={BeheerPrivacy} />
        <Route path="/beheer/avg" component={AvgBeheer} />
        <Route path="/beheer/gebouwen-archief" component={GebouwenArchiefBeheer} />
        <Route path="/mijn/privacy" component={PrivacyCentrum} />
        <Route path="/mijn/salarisdocumenten" component={MijnSalarisdocumentenPagina} />
        <Route path="/mijn/mail-voorkeuren" component={MailVoorkeurenPagina} />
        <Route path="/mijn/declaraties" component={MijnDeclaratiesPagina} />
        <Route path="/mijn/verlof" component={MijnVerlofPagina} />


        {/* ── Overig ── */}
        <Route path="/info" component={InfoPagina} />
        <Route component={NotFound} />
      </Switch>
  );
}


/** Tijdelijke omleidingspagina terwijl de navigatie naar / afhandelt. */
function VeldwerkOmleiding() {
  const [, navigeer] = useLocation();
  useEffect(() => {
    navigeer("/");
  }, [navigeer]);
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-center px-4">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
        <ShieldOff className="w-5 h-5 text-muted-foreground" />
      </div>
      <div>
        <p className="font-semibold text-foreground">Pagina niet beschikbaar</p>
        <p className="text-sm text-muted-foreground mt-1">
          Deze pagina is bedoeld voor kantoormedewerkers. Je wordt teruggestuurd naar je startpagina.
        </p>
      </div>
    </div>
  );
}
