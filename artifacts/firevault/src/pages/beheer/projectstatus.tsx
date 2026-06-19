import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Circle,
  Database,
  Globe,
  Cpu,
  Shield,
  FileText,
  Smartphone,
  Layers,
  BarChart3,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ModuleStatus = "gebouwd" | "in-aanbouw" | "gepland" | "geparkeerd";

interface Module {
  naam: string;
  doel: string;
  status: ModuleStatus;
  gereedheid: number;
  notitie?: string;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const modules: Module[] = [
  { naam: "Gebouwenbeheer", doel: "Registratie gebouwen, verdiepingen, tekeningen, team", status: "gebouwd", gereedheid: 100 },
  { naam: "Spots & Uitvoering (V1.3)", doel: "Spotregistratie, statuslevenscyclus, QR-labels", status: "gebouwd", gereedheid: 100 },
  { naam: "Plattegronden", doel: "SVG-editor, scheidingen, clusters, mobiele renderer", status: "gebouwd", gereedheid: 100 },
  { naam: "Bibliotheek & Documenten (V1.2)", doel: "Applicaties, toepassingen, documenten, versiebeheer", status: "gebouwd", gereedheid: 100 },
  { naam: "DMS / Documentenbibliotheek", doel: "Koppelingen, goedkeuringsflow, signaleringen, bevriezing", status: "gebouwd", gereedheid: 100 },
  { naam: "Inspecties", doel: "Oplevering, periodiek, jaarlijks, herstel", status: "gebouwd", gereedheid: 100 },
  { naam: "Onderhoud", doel: "Werkorders met prioriteit, deadline, toewijzing", status: "gebouwd", gereedheid: 100 },
  { naam: "Rollen & Bevoegdheden (V1.1)", doel: "RBAC via bevoegdheden-matrix; TOTP-login", status: "gebouwd", gereedheid: 100 },
  { naam: "AI Spotherkenning", doel: "Foto voor/na → applicatie, toepassing, fabrikant (leerset)", status: "gebouwd", gereedheid: 100 },
  { naam: "AI Bibliotheekvalidatie", doel: "Ontbrekende document-koppelingen voorstellen", status: "gebouwd", gereedheid: 100 },
  { naam: "HRM / Personeel (Fase 1-basis)", doel: "Medewerkers, functiehuis, opleidingen, verlof+saldi", status: "gebouwd", gereedheid: 100 },
  { naam: "Dossiermodule (Fase 1-basis)", doel: "Dossiers per gebouw: concept → definitief → gearchiveerd", status: "gebouwd", gereedheid: 100 },
  { naam: "Offerte Intelligence (Fase 1-basis)", doel: "Offertes voorbereiden uit spots (geen AI-calculatie)", status: "gebouwd", gereedheid: 100 },
  { naam: "Planning (week-grid V1)", doel: "Week-grid per monteur, tijdsloten, werknummer", status: "gebouwd", gereedheid: 100 },
  { naam: "Communicatie / Berichten", doel: "Chat direct + groep, foto-editor, bijlages", status: "gebouwd", gereedheid: 100 },
  { naam: "Document Design System", doel: "Herbruikbare documentcomponenten, sjabloonbeheer", status: "in-aanbouw", gereedheid: 70, notitie: "PDF-export en digitale ondertekening nog te bouwen" },
  { naam: "V1.4 Opleverrapportage", doel: "Spotselectie, rapporttypes, bijlagenpakket, definitief maken", status: "in-aanbouw", gereedheid: 60, notitie: "Live rapport bestaat; spotselectie en presets open" },
  { naam: "V1.5 Rapportenmodule", doel: "Gepersisteerde definitieve rapporten, reactietermijn", status: "gepland", gereedheid: 0, notitie: "Afhankelijk van V1.4 afronding" },
  { naam: "V2.0 Mobiele monteurflow (volledig)", doel: "Offline sync, routeplanning, biometrisch inloggen", status: "geparkeerd", gereedheid: 0 },
  { naam: "V3.0 HRM volledig / Medewerkerportaal", doel: "Salarisadministratie, werving, AI-coaches (FPS Groep)", status: "geparkeerd", gereedheid: 0 },
  { naam: "CRM volledig", doel: "Uitgebreide klantmodule, CRM-koppeling", status: "geparkeerd", gereedheid: 0 },
  { naam: "S.G. Constructies", doel: "Samengesteld spottype + constructietemplates", status: "geparkeerd", gereedheid: 0 },
  { naam: "Fase 2 Bedrijfsbesturing", doel: "Calculatie, projectcontrol, AccountView-koppeling", status: "geparkeerd", gereedheid: 0 },
];

const aiComponenten = [
  { naam: "Document-AI", model: "gpt-5-mini", doel: "PDF-tekst analyseren: fabrikant, type, EN-norm, revisie" },
  { naam: "Spot-AI Vision", model: "gpt-5 (vision)", doel: "Foto voor/na: oriëntatie, applicatie, toepassing, fabrikant" },
  { naam: "Bibliotheekvalidatie-AI", model: "gpt-5-mini", doel: "Ontbrekende Document↔Toepassing-koppelingen voorstellen" },
  { naam: "Gebouw-AI", model: "gpt-5 + gpt-5-mini", doel: "Satellietbeelden, tekeningen, adresextractie analyseren" },
  { naam: "E-mail-AI", model: "gpt-5-mini", doel: "E-mails samenvatten, NAW extraheren, relevantie beoordelen" },
  { naam: "Opleiding-AI", model: "gpt-5", doel: "Passende opleidingen per functie voorstellen" },
  { naam: "Calculatie-AI", model: "gpt-5", doel: "Begrotingsregels voorstellen op basis van spots" },
  { naam: "Toolbox-AI", model: "gpt-4o-mini", doel: "Berichten classificeren als blijvend belangrijk" },
];

const apiRouters = [
  "auth", "uitnodiging", "dashboard", "gebouwen", "voorzieningen", "classificatie",
  "fabrikanten", "documenten", "inspecties", "onderhoud", "gebruikers", "abonnementen",
  "storage", "systeem", "info", "crm", "emails", "profielen", "hrm", "dossiers",
  "offertes", "mail", "calculaties", "rapporten", "constructie-templates", "mijn-werk",
  "toolbox", "planning-module", "mod-calculatie", "gereedschappen", "uren",
  "achievements", "chat", "backups",
];

const dbSchemas = [
  { bestand: "gebruikers.ts", tabellen: ["gebruikers", "login_pogingen", "uitnodigingen"] },
  { bestand: "gebouwen.ts", tabellen: ["gebouwen", "verdiepingen", "tekeningen", "gebouw_toewijzingen", "clusters"] },
  { bestand: "voorzieningen.ts", tabellen: ["voorzieningen", "voorziening_types", "labels", "voorziening_labels", "spot_ai_voorstellen", "fabrikanten"] },
  { bestand: "documenten.ts", tabellen: ["documenten", "document_applicaties", "document_toepassingen", "document_koppelingen", "document_goedkeuringen", "document_logboek"] },
  { bestand: "hrm.ts", tabellen: ["werkgevers", "medewerkers", "functies", "functie_opleidingen", "opleidingen", "bekwaamheden", "verlofsoorten", "verlofsaldi", "verlofaanvragen", "ziekmeldingen"] },
  { bestand: "chat.ts", tabellen: ["chat_gesprekken", "chat_deelnemers", "chat_berichten"] },
  { bestand: "inspecties.ts", tabellen: ["inspecties"] },
  { bestand: "onderhoud.ts", tabellen: ["werkorders"] },
  { bestand: "dossiers.ts", tabellen: ["dossiers", "dossier_documenten"] },
  { bestand: "emails.ts", tabellen: ["gebouw_emails", "email_bijlagen"] },
  { bestand: "planning.ts", tabellen: ["planning_items", "planning_afwezigheid"] },
  { bestand: "uren.ts", tabellen: ["uren_registraties", "week_staten"] },
  { bestand: "offertes.ts", tabellen: ["offertes", "offerte_sjablonen", "offerte_regels"] },
  { bestand: "calculaties.ts", tabellen: ["calculaties", "calculatie_regels"] },
  { bestand: "toolbox.ts", tabellen: ["toolbox_berichten", "toolbox_bevestigingen"] },
  { bestand: "crm.ts", tabellen: ["crm_klanten", "crm_contactpersonen", "crm_opdrachten"] },
  { bestand: "achievements.ts", tabellen: ["gebruiker_achievements"] },
  { bestand: "gereedschappen.ts", tabellen: ["gereedschappen", "gereedschap_uitleningen"] },
  { bestand: "rapporten.ts", tabellen: ["rapporten"] },
  { bestand: "systeem.ts", tabellen: ["app_instellingen", "helpdesk_tickets", "feedback", "module_beoordelingen"] },
  { bestand: "backups.ts", tabellen: ["backup_records"] },
];

const openstaandePunten = [
  { type: "technische-schuld", omschrijving: "Legacy WBDBO/WRD-kolommen niet verwijderd (DB-compatibiliteit)" },
  { type: "technische-schuld", omschrijving: "labels.testrapportId deprecated; blijft als fallback voor legacy-koppeling" },
  { type: "ontbrekend", omschrijving: "V1.4 restscope: spotselectie per verdieping/cluster, bijlagenpakket, rapporttypes" },
  { type: "ontbrekend", omschrijving: "V1.5: gepersisteerde definitieve rapporten, reactietermijn, centrale bibliotheek" },
  { type: "ontbrekend", omschrijving: "DDS: PDF-export, digitale ondertekening, per-werkmaatschappij branding" },
  { type: "beveiliging", omschrijving: "otplib vastzetten op v12 — jaarlijks herbeoordelen" },
  { type: "beveiliging", omschrijving: "Upstream Microsoft Graph-foutteksten worden geredigeerd vóór log/response" },
  { type: "optimalisatie", omschrijving: "Polling-strategie berichten: WebSockets of SSE overwegen als alternatief" },
  { type: "optimalisatie", omschrijving: "PDF-plattegrondrender: kwaliteitsverlies bij sterk inzoomen op detailrijke tekeningen" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: ModuleStatus) {
  switch (status) {
    case "gebouwd":
      return <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">Gebouwd</Badge>;
    case "in-aanbouw":
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">In aanbouw</Badge>;
    case "gepland":
      return <Badge className="bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100">Gepland</Badge>;
    case "geparkeerd":
      return <Badge variant="outline" className="text-muted-foreground">Geparkeerd</Badge>;
  }
}

function statusIcoon(status: ModuleStatus) {
  switch (status) {
    case "gebouwd":
      return <CheckCircle2 size={15} className="text-green-600 flex-shrink-0" />;
    case "in-aanbouw":
      return <Clock size={15} className="text-amber-600 flex-shrink-0" />;
    case "gepland":
      return <AlertCircle size={15} className="text-blue-500 flex-shrink-0" />;
    case "geparkeerd":
      return <Circle size={15} className="text-muted-foreground flex-shrink-0" />;
  }
}

function PuntTypeLabel({ type }: { type: string }) {
  switch (type) {
    case "technische-schuld":
      return <span className="text-[10px] font-medium uppercase tracking-wide text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">Technische schuld</span>;
    case "ontbrekend":
      return <span className="text-[10px] font-medium uppercase tracking-wide text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Ontbrekend</span>;
    case "beveiliging":
      return <span className="text-[10px] font-medium uppercase tracking-wide text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Beveiliging</span>;
    case "optimalisatie":
      return <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optimalisatie</span>;
    default:
      return null;
  }
}

function VoortgangsBalk({ waarde }: { waarde: number }) {
  const kleur =
    waarde === 100
      ? "bg-green-500"
      : waarde >= 50
        ? "bg-amber-500"
        : waarde > 0
          ? "bg-blue-400"
          : "bg-muted";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${kleur}`} style={{ width: `${waarde}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right">{waarde}%</span>
    </div>
  );
}

// ─── Pagina ───────────────────────────────────────────────────────────────────

export default function ProjectstatusPagina() {
  const gebouwd = modules.filter((m) => m.status === "gebouwd");
  const inAanbouw = modules.filter((m) => m.status === "in-aanbouw");
  const gepland = modules.filter((m) => m.status === "gepland");
  const geparkeerd = modules.filter((m) => m.status === "geparkeerd");

  const totaalTabellen = dbSchemas.reduce((sum, s) => sum + s.tabellen.length, 0);

  const gemiddeldeGereedheid = Math.round(
    modules
      .filter((m) => m.status !== "geparkeerd")
      .reduce((sum, m) => sum + m.gereedheid, 0) /
      modules.filter((m) => m.status !== "geparkeerd").length,
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Projectstatus</h1>
        <p className="text-sm text-muted-foreground mt-1">
          FPS Connect — technische en functionele status. Bijgewerkt: juni 2026.
          Volledig dossier: <code className="text-xs bg-muted px-1 py-0.5 rounded">docs/PROJECT_INTELLIGENCE_DOSSIER.md</code>
        </p>
      </div>

      {/* ── Statistieken ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Layers size={14} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Modules gebouwd</span>
            </div>
            <p className="text-2xl font-semibold">{gebouwd.length}</p>
            <p className="text-xs text-muted-foreground">van {modules.length} totaal</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 size={14} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Gereedheid platform</span>
            </div>
            <p className="text-2xl font-semibold">{gemiddeldeGereedheid}%</p>
            <p className="text-xs text-muted-foreground">excl. geparkeerde modules</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Database size={14} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">DB-tabellen</span>
            </div>
            <p className="text-2xl font-semibold">{totaalTabellen}+</p>
            <p className="text-xs text-muted-foreground">{dbSchemas.length} schema-bestanden</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Globe size={14} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">API-routers</span>
            </div>
            <p className="text-2xl font-semibold">{apiRouters.length}</p>
            <p className="text-xs text-muted-foreground">Express-routers geregistreerd</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Architectuur ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield size={15} />
            Architectuur
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Stack</span>
              <span className="font-medium text-xs text-right">pnpm · Node.js 24 · TS 5.9 · React + Vite · Express 5 · PostgreSQL</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">ORM / validatie</span>
              <span className="font-medium text-xs">Drizzle ORM · Zod v4</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Authenticatie</span>
              <span className="font-medium text-xs">Eigen sessie-auth + verplichte TOTP</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Mobiel</span>
              <span className="font-medium text-xs">Expo (React Native) · HMAC bearer token</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Opslag</span>
              <span className="font-medium text-xs">Replit Object Storage</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">E-mail</span>
              <span className="font-medium text-xs">Microsoft 365 via Graph API</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">AI</span>
              <span className="font-medium text-xs">OpenAI via Replit AI Integrations proxy</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Kaarten</span>
              <span className="font-medium text-xs">Google Maps (API-key server-side)</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Feature flags</span>
              <span className="font-medium text-xs">PLANNING=aan · CALCULATIE=uit (pilot)</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Naamgeving</span>
              <span className="font-medium text-xs">FPS Connect (intern) · FPS One (klant)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Modules ── */}
      <div>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Layers size={15} />
          Modules
        </h2>

        {/* Gebouwd */}
        <div className="mb-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Gebouwd ({gebouwd.length})
          </p>
          <div className="space-y-1">
            {gebouwd.map((m) => (
              <div key={m.naam} className="flex items-center gap-3 py-2 border-b last:border-0">
                {statusIcoon(m.status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{m.naam}</span>
                    {statusBadge(m.status)}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{m.doel}</p>
                </div>
                <div className="w-32 flex-shrink-0">
                  <VoortgangsBalk waarde={m.gereedheid} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* In aanbouw */}
        <div className="mb-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            In aanbouw ({inAanbouw.length})
          </p>
          <div className="space-y-1">
            {inAanbouw.map((m) => (
              <div key={m.naam} className="flex items-start gap-3 py-2 border-b last:border-0">
                {statusIcoon(m.status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{m.naam}</span>
                    {statusBadge(m.status)}
                  </div>
                  <p className="text-xs text-muted-foreground">{m.doel}</p>
                  {m.notitie && (
                    <p className="text-xs text-amber-700 mt-0.5">{m.notitie}</p>
                  )}
                </div>
                <div className="w-32 flex-shrink-0 mt-1">
                  <VoortgangsBalk waarde={m.gereedheid} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Gepland */}
        <div className="mb-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Gepland ({gepland.length})
          </p>
          <div className="space-y-1">
            {gepland.map((m) => (
              <div key={m.naam} className="flex items-start gap-3 py-2 border-b last:border-0">
                {statusIcoon(m.status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{m.naam}</span>
                    {statusBadge(m.status)}
                  </div>
                  <p className="text-xs text-muted-foreground">{m.doel}</p>
                  {m.notitie && (
                    <p className="text-xs text-blue-700 mt-0.5">{m.notitie}</p>
                  )}
                </div>
                <div className="w-32 flex-shrink-0 mt-1">
                  <VoortgangsBalk waarde={m.gereedheid} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Geparkeerd */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Geparkeerd ({geparkeerd.length}) — wacht op formeel akkoord
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {geparkeerd.map((m) => (
              <div key={m.naam} className="flex items-start gap-2 py-1.5 px-2 rounded-lg bg-muted/40">
                {statusIcoon(m.status)}
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground font-medium">{m.naam}</p>
                  <p className="text-xs text-muted-foreground/70">{m.doel}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Separator />

      {/* ── AI-componenten ── */}
      <div>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Cpu size={15} />
          AI-componenten
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Principe: AI stelt voor, mens beslist. AI koppelt of keurt nooit zelfstandig iets juridisch goed.
          Voorstel = geel · Bevestigd = neutraal.
        </p>
        <div className="space-y-1">
          {aiComponenten.map((ai) => (
            <div key={ai.naam} className="flex items-center gap-3 py-2 border-b last:border-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{ai.naam}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">{ai.model}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{ai.doel}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* ── Database ── */}
      <div>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Database size={15} />
          Database ({totaalTabellen}+ tabellen in {dbSchemas.length} schema-bestanden)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {dbSchemas.map((s) => (
            <div key={s.bestand} className="border rounded-lg px-3 py-2">
              <p className="text-xs font-mono text-muted-foreground mb-1">{s.bestand}</p>
              <div className="flex flex-wrap gap-1">
                {s.tabellen.map((t) => (
                  <span key={t} className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* ── API ── */}
      <div>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Globe size={15} />
          API — {apiRouters.length} routers geregistreerd
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Alle routes vereisen een geldige sessie of HMAC bearer token, behalve <code className="bg-muted px-1 rounded">/auth/*</code>, <code className="bg-muted px-1 rounded">/healthz</code> en <code className="bg-muted px-1 rounded">/uitnodiging/*</code>.
          Codegen via <code className="bg-muted px-1 rounded">pnpm --filter @workspace/api-spec run codegen</code>.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {apiRouters.map((r) => (
            <span key={r} className="text-xs bg-muted px-2 py-1 rounded font-mono">/api/{r}</span>
          ))}
        </div>
      </div>

      <Separator />

      {/* ── Teststatus ── */}
      <div>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Smartphone size={15} />
          Teststatus
        </h2>
        <div className="space-y-1">
          {[
            { naam: "Typecheck (volledig schoon)", status: "ok", detail: "pnpm run typecheck" },
            { naam: "E2E menu-navigatie (Playwright)", status: "ok", detail: "e2e-menu workflow · TOTP next-window timing geborgd" },
            { naam: "Kwaliteitscheck script", status: "ok", detail: "pnpm --filter @workspace/scripts run kwaliteitscheck" },
            { naam: "Beveiligingsscan", status: "ok", detail: "pnpm --filter @workspace/scripts run security-scan" },
            { naam: "Handmatige acceptatietest", status: "ok", detail: "Na elk increment via Replit preview" },
            { naam: "Unit tests", status: "geen", detail: "Geen formele unit tests aanwezig" },
          ].map((t) => (
            <div key={t.naam} className="flex items-center gap-3 py-2 border-b last:border-0">
              {t.status === "ok" ? (
                <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />
              ) : (
                <Circle size={14} className="text-muted-foreground flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <span className="text-sm">{t.naam}</span>
                <p className="text-xs text-muted-foreground">{t.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* ── Openstaande punten ── */}
      <div>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <FileText size={15} />
          Openstaande punten
        </h2>
        <div className="space-y-2">
          {openstaandePunten.map((p, i) => (
            <div key={i} className="flex items-start gap-3 py-2 border-b last:border-0">
              <div className="flex-shrink-0 mt-0.5">
                <PuntTypeLabel type={p.type} />
              </div>
              <p className="text-sm">{p.omschrijving}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="text-xs text-muted-foreground pt-2">
        Volledig dossier: <code className="bg-muted px-1 rounded">docs/PROJECT_INTELLIGENCE_DOSSIER.md</code> ·
        Samenvatting: <code className="bg-muted px-1 rounded">docs/PROJECT_STATUS.md</code>
      </div>
    </div>
  );
}
