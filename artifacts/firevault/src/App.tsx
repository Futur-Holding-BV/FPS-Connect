import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { TaalProvider } from "@/context/taal-context";
import { useRol, RolProvider } from "@/context/rol-context";
import LoginPagina from "@/pages/auth/login";
import ActivatiePagina from "@/pages/uitnodiging/index";

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
import Gebruikers from "@/pages/gebruikers/index";
import CrmKlanten from "@/pages/crm/index";
import CrmKlantDetail from "@/pages/crm/detail";
import Abonnementen from "@/pages/abonnementen/index";
import LoginPogingen from "@/pages/beheer/login-pogingen";
import HelpdeskBeheer from "@/pages/beheer/helpdesk";
import FeedbackBeheer from "@/pages/beheer/feedback";
import Heatmaps from "@/pages/beheer/heatmaps";
import ProfielenBeheer from "@/pages/beheer/profielen";
import ToepassingenBeheer from "@/pages/beheer/toepassingen";
import Bibliotheek from "@/pages/beheer/bibliotheek";
import Ontwikkelstatus from "@/pages/beheer/ontwikkelstatus";
import DocumentopmaakBeheer from "@/pages/beheer/documentopmaak";
import MailBeheer from "@/pages/beheer/mail";
import InfoPagina from "@/pages/info/index";
import PersoneelPagina from "@/pages/personeel/index";
import MedewerkerDetailPagina from "@/pages/personeel/detail";
import DossiersPagina from "@/pages/dossiers/index";
import OffertesPagina from "@/pages/offertes/index";
import DocumentenPagina from "@/pages/documenten/index";
import { OndersteuningWidget } from "@/components/ondersteuning-widget";
import RapportenPagina from "@/pages/rapporten/index";
import ToolboxPagina from "@/pages/toolbox/index";
import ConnectPlanning from "@/pages/connect/planning";
import ConnectCalculatie from "@/pages/connect/calculatie";
import ConnectCalculatieDetail from "@/pages/connect/calculatie-detail";
import ConnectHrm from "@/pages/connect/hrm";
import ModulesCalculatie from "@/pages/modules/calculatie/index";
import ModulesCalculatieNieuw from "@/pages/modules/calculatie/nieuw";
import ModulesCalculatieDetail from "@/pages/modules/calculatie/detail";
import ModulesPlanning from "@/pages/modules/planning/index";
import ModulesPlanningMedewerkers from "@/pages/modules/planning/medewerkers";
import ModulesPlanningAfwezigheid from "@/pages/modules/planning/afwezigheid";
import OneDashboard from "@/pages/one/dashboard";
import OneGebouwen from "@/pages/one/gebouwen";
import OneDocumenten from "@/pages/one/documenten";
import OneRapporten from "@/pages/one/rapporten";
import OneAbonnementen from "@/pages/one/abonnementen";
import { HeatmapTracker } from "@/components/heatmap-tracker";

const queryClient = new QueryClient();

function BeheerderPortal() {
  return (
    <BeheerderLayout>
      <Switch>
        <Route path="/" component={BeheerderDashboard} />
        <Route path="/gebouwen" component={Gebouwen} />
        <Route path="/gebouwen/:id" component={GebouwDetail} />
        <Route path="/gebouwen/:id/plattegrond/:verdiepingId" component={Plattegrond} />
        <Route path="/voorzieningen" component={Voorzieningen} />
        <Route path="/voorzieningen/nieuw" component={VoorzieningNieuw} />
        <Route path="/voorzieningen/:id/qr" component={VoorzieningQr} />
        <Route path="/voorzieningen/:id" component={VoorzieningDetail} />
        <Route path="/inspecties" component={Inspecties} />
        <Route path="/inspecties/:id" component={InspectieDetail} />
        <Route path="/onderhoud" component={Onderhoud} />
        <Route path="/gebruikers" component={Gebruikers} />
        <Route path="/crm" component={CrmKlanten} />
        <Route path="/crm/:id" component={CrmKlantDetail} />
        <Route path="/personeel" component={PersoneelPagina} />
        <Route path="/personeel/:id" component={MedewerkerDetailPagina} />
        <Route path="/dossiers" component={DossiersPagina} />
        <Route path="/offertes" component={OffertesPagina} />
        <Route path="/abonnementen" component={Abonnementen} />
        <Route path="/beheer/toepassingen" component={ToepassingenBeheer} />
        <Route path="/beheer/bibliotheek" component={Bibliotheek} />
        <Route path="/beheer/login-pogingen" component={LoginPogingen} />
        <Route path="/beheer/helpdesk" component={HelpdeskBeheer} />
        <Route path="/beheer/feedback" component={FeedbackBeheer} />
        <Route path="/beheer/heatmaps" component={Heatmaps} />
        <Route path="/beheer/profielen" component={ProfielenBeheer} />
        <Route path="/beheer/ontwikkelstatus" component={Ontwikkelstatus} />
        <Route path="/beheer/documentopmaak" component={DocumentopmaakBeheer} />
        <Route path="/beheer/mail" component={MailBeheer} />
        <Route path="/documenten" component={DocumentenPagina} />
        <Route path="/rapporten" component={RapportenPagina} />
        <Route path="/toolbox" component={ToolboxPagina} />
        <Route path="/connect/planning" component={ConnectPlanning} />
        <Route path="/connect/calculatie/:id" component={ConnectCalculatieDetail} />
        <Route path="/connect/calculatie" component={ConnectCalculatie} />
        <Route path="/connect/hrm" component={ConnectHrm} />
        <Route path="/modules/calculatie/nieuw" component={ModulesCalculatieNieuw} />
        <Route path="/modules/calculatie/:id" component={ModulesCalculatieDetail} />
        <Route path="/modules/calculatie" component={ModulesCalculatie} />
        <Route path="/modules/planning/medewerkers" component={ModulesPlanningMedewerkers} />
        <Route path="/modules/planning/afwezigheid" component={ModulesPlanningAfwezigheid} />
        <Route path="/modules/planning" component={ModulesPlanning} />
        <Route path="/one/dashboard" component={OneDashboard} />
        <Route path="/one/gebouwen" component={OneGebouwen} />
        <Route path="/one/documenten" component={OneDocumenten} />
        <Route path="/one/rapporten" component={OneRapporten} />
        <Route path="/one/abonnementen" component={OneAbonnementen} />
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
        <Route path="/gebouwen/:id" component={GebouwDetail} />
        <Route path="/gebouwen/:id/plattegrond/:verdiepingId" component={Plattegrond} />
        <Route path="/klant/rapportages" component={KlantRapportages} />
        <Route path="/info" component={InfoPagina} />
        <Route component={NotFound} />
      </Switch>
    </KlantLayout>
  );
}

function PermissieDashboard() {
  const { bevoegdheden } = useRol();
  const isBeheerGericht = (bevoegdheden.gebouwen ?? 0) >= 1;
  return isBeheerGericht ? <BeheerderDashboard /> : <MonteurDashboard />;
}

function PermissiePortal() {
  return (
    <BeheerderLayout>
      <Switch>
        <Route path="/" component={PermissieDashboard} />
        <Route path="/gebouwen" component={Gebouwen} />
        <Route path="/gebouwen/:id" component={GebouwDetail} />
        <Route path="/gebouwen/:id/plattegrond/:verdiepingId" component={Plattegrond} />
        <Route path="/voorzieningen" component={Voorzieningen} />
        <Route path="/voorzieningen/nieuw" component={VoorzieningNieuw} />
        <Route path="/voorzieningen/:id/qr" component={VoorzieningQr} />
        <Route path="/voorzieningen/:id" component={VoorzieningDetail} />
        <Route path="/inspecties" component={Inspecties} />
        <Route path="/inspecties/:id" component={InspectieDetail} />
        <Route path="/onderhoud" component={Onderhoud} />
        <Route path="/gebruikers" component={Gebruikers} />
        <Route path="/crm" component={CrmKlanten} />
        <Route path="/crm/:id" component={CrmKlantDetail} />
        <Route path="/personeel" component={PersoneelPagina} />
        <Route path="/personeel/:id" component={MedewerkerDetailPagina} />
        <Route path="/dossiers" component={DossiersPagina} />
        <Route path="/offertes" component={OffertesPagina} />
        <Route path="/abonnementen" component={Abonnementen} />
        <Route path="/beheer/toepassingen" component={ToepassingenBeheer} />
        <Route path="/beheer/bibliotheek" component={Bibliotheek} />
        <Route path="/beheer/login-pogingen" component={LoginPogingen} />
        <Route path="/beheer/helpdesk" component={HelpdeskBeheer} />
        <Route path="/beheer/feedback" component={FeedbackBeheer} />
        <Route path="/beheer/heatmaps" component={Heatmaps} />
        <Route path="/beheer/profielen" component={ProfielenBeheer} />
        <Route path="/beheer/ontwikkelstatus" component={Ontwikkelstatus} />
        <Route path="/beheer/documentopmaak" component={DocumentopmaakBeheer} />
        <Route path="/beheer/mail" component={MailBeheer} />
        <Route path="/documenten" component={DocumentenPagina} />
        <Route path="/rapporten" component={RapportenPagina} />
        <Route path="/toolbox" component={ToolboxPagina} />
        <Route path="/connect/planning" component={ConnectPlanning} />
        <Route path="/connect/calculatie/:id" component={ConnectCalculatieDetail} />
        <Route path="/connect/calculatie" component={ConnectCalculatie} />
        <Route path="/connect/hrm" component={ConnectHrm} />
        <Route path="/modules/calculatie/nieuw" component={ModulesCalculatieNieuw} />
        <Route path="/modules/calculatie/:id" component={ModulesCalculatieDetail} />
        <Route path="/modules/calculatie" component={ModulesCalculatie} />
        <Route path="/modules/planning/medewerkers" component={ModulesPlanningMedewerkers} />
        <Route path="/modules/planning/afwezigheid" component={ModulesPlanningAfwezigheid} />
        <Route path="/modules/planning" component={ModulesPlanning} />
        <Route path="/one/dashboard" component={OneDashboard} />
        <Route path="/one/gebouwen" component={OneGebouwen} />
        <Route path="/one/documenten" component={OneDocumenten} />
        <Route path="/one/rapporten" component={OneRapporten} />
        <Route path="/one/abonnementen" component={OneAbonnementen} />
        <Route path="/info" component={InfoPagina} />
        <Route component={NotFound} />
      </Switch>
    </BeheerderLayout>
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
  const { rol, bevoegdheden } = useRol();

  if (rol === "hoofdbeheerder") return <BeheerderPortal />;
  if (rol === "klant") return <KlantPortal />;
  if (rol === "gebruiker") {
    const heeftToegang = Object.values(bevoegdheden).some((n) => n > 0);
    return heeftToegang ? <PermissiePortal /> : <GeenToegang />;
  }
  // Legacy rollen — worden in T016 omgezet naar "gebruiker"
  if (rol === "beheerder") return <BeheerderPortal />;
  if (rol === "monteur" || rol === "controleur") return <MonteurPortal />;
  return <GeenToegang />;
}

function Gate() {
  const { isLoading, isAuthenticated } = useAuth();

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const pad = window.location.pathname.slice(base.length) || "/";
  if (pad.startsWith("/uitnodiging/")) {
    const token = pad.replace("/uitnodiging/", "");
    return <ActivatiePagina token={token} />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPagina />;
  }

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Switch>
        <Route path="/gebouwen/:id/print" component={GebouwPrint} />
        <Route>
          <Portalen />
          <OndersteuningWidget />
          <HeatmapTracker />
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
          <AuthProvider>
            <RolProvider>
              <Gate />
            </RolProvider>
            <Toaster />
          </AuthProvider>
        </TaalProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
