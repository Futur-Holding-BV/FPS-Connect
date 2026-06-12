import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ListChecks,
  CheckCircle2,
  Clock,
  CircleDashed,
  Eye,
  ExternalLink,
  Smartphone,
} from "lucide-react";

type Status = "af" | "in-ontwikkeling" | "gepland";

interface ModuleItem {
  naam: string;
  omschrijving: string;
  status: Status;
  versie?: string;
  testbaar?: boolean;
  route?: string;
  externToegankelijk?: string;
  geparkeerd?: boolean;
  opmerking?: string;
}

const MODULES: ModuleItem[] = [
  // ── Af (gebouwd en beschikbaar) ─────────────────────────────────────────
  {
    naam: "Dashboard",
    omschrijving: "Live statistieken: gebouwen, spots, onderhoud en aankomende inspecties",
    status: "af",
    testbaar: true,
    route: "/",
  },
  {
    naam: "Gebouwenbeheer",
    omschrijving: "Gebouwen, verdiepingen, plattegronden en 3D-weergave",
    status: "af",
    versie: "V1.0",
    testbaar: true,
    route: "/gebouwen",
  },
  {
    naam: "Spots (voorzieningen)",
    omschrijving: "Registratie en overzicht van brandpreventieve spots op de plattegrond",
    status: "af",
    versie: "V1.0",
    testbaar: true,
    route: "/voorzieningen",
  },
  {
    naam: "Inspecties",
    omschrijving: "Oplevering, periodiek, jaarlijks en herstelinspecties bijhouden",
    status: "af",
    testbaar: true,
    route: "/inspecties",
  },
  {
    naam: "Onderhoud",
    omschrijving: "Werkorders met prioriteit, deadline, toewijzing en statussturing",
    status: "af",
    testbaar: true,
    route: "/onderhoud",
  },
  {
    naam: "Rollen & bevoegdheden",
    omschrijving: "Gebruikers, rollen en de bevoegdhedenmatrix",
    status: "af",
    versie: "V1.1",
    testbaar: true,
    route: "/gebruikers",
  },
  {
    naam: "Profielen",
    omschrijving: "Herbruikbare bevoegdheidsprofielen koppelen aan gebruikers",
    status: "af",
    versie: "V1.1",
    testbaar: true,
    route: "/beheer/profielen",
  },
  {
    naam: "Bibliotheek & documentstructuur",
    omschrijving: "Applicaties, toepassingen, documenten, ETA's, koppelingen en versiebeheer",
    status: "af",
    versie: "V1.2",
    testbaar: true,
    route: "/beheer/bibliotheek",
  },
  {
    naam: "DMS / Documentenbibliotheek",
    omschrijving:
      "Documentdetail en logboek, polymorfe koppelingen, duplicaatdetectie, goedkeuringsflow, signaleringen en audittrail",
    status: "af",
    testbaar: true,
    route: "/beheer/bibliotheek",
    opmerking: "Uitbreiding op V1.2 met dossierkoppeling en bevriezing",
  },
  {
    naam: "Toepassingen",
    omschrijving: "Beheer van toepassingen, fabrikanten en testnormen",
    status: "af",
    testbaar: true,
    route: "/beheer/toepassingen",
  },
  {
    naam: "AI Spotherkenning",
    omschrijving: "AI stelt spotafwerking voor met zelflerende correcties; een mens bevestigt altijd",
    status: "af",
    testbaar: true,
    route: "/voorzieningen",
  },
  {
    naam: "AI Bibliotheekvalidatie",
    omschrijving: "AI controleert bibliotheekdocumenten; een mens keurt juridisch goed",
    status: "af",
    testbaar: true,
    route: "/beheer/bibliotheek",
  },
  {
    naam: "HRM / Personeel (basis)",
    omschrijving: "Medewerkers, functiehuis, opleidingen, bekwaamheidsmatrix en verlof",
    status: "af",
    testbaar: true,
    route: "/personeel",
    opmerking: "Fase 1-basis — diepere uitwerking blijft gepland",
  },
  {
    naam: "Dossiermodule (basis)",
    omschrijving: "Dossiers per gebouw met status concept, definitief en gearchiveerd",
    status: "af",
    testbaar: true,
    route: "/dossiers",
    opmerking: "Fase 1-basis — juridisch sluitend opleverdossier volgt in V1.5",
  },
  {
    naam: "Offerte Intelligence (basis)",
    omschrijving: "Voorbereiding: regels uit spots en sjablonen",
    status: "af",
    testbaar: true,
    route: "/offertes",
    opmerking: "Fase 1-basis — bewust geen AI-calculatie en geen automatische verzending",
  },
  {
    naam: "Abonnementen",
    omschrijving: "Pakketten Basis, Beheer en Volledig",
    status: "af",
    testbaar: true,
    route: "/abonnementen",
  },
  {
    naam: "Heatmaps",
    omschrijving: "Gebruiksanalyse via geregistreerde muisbewegingen",
    status: "af",
    testbaar: true,
    route: "/beheer/heatmaps",
  },
  {
    naam: "Helpdesk",
    omschrijving: "Supporttickets van gebruikers afhandelen",
    status: "af",
    testbaar: true,
    route: "/beheer/helpdesk",
  },
  {
    naam: "Feedback",
    omschrijving: "Gebruikersfeedback verzamelen en bekijken",
    status: "af",
    testbaar: true,
    route: "/beheer/feedback",
  },
  {
    naam: "Login-pogingen",
    omschrijving: "Beveiligingssignalen bij aanmelden (nieuw apparaat of IP-adres)",
    status: "af",
    testbaar: true,
    route: "/beheer/login-pogingen",
  },
  {
    naam: "Mobiele monteur-app (FPS Monteur)",
    omschrijving: "Read-mostly mobiele schermen voor gebouwen, plattegronden en spots",
    status: "af",
    testbaar: true,
    externToegankelijk: "Te openen via de FPS Monteur-app in de preview",
  },
  {
    naam: "CRM (basis-scaffold)",
    omschrijving: "Klantenoverzicht — basis aanwezig",
    status: "af",
    testbaar: true,
    route: "/crm",
    opmerking: "Scaffold; wordt bewust niet verder uitgebouwd vóór V1.5",
  },

  // ── In ontwikkeling (wordt nu actief aan gewerkt) ───────────────────────
  {
    naam: "Naamgeving FPS Connect / FPS One",
    omschrijving:
      "Intern heet het platform FPS Connect, de klantomgeving FPS One. Wordt stapsgewijs en zichtbaar doorgevoerd",
    status: "in-ontwikkeling",
  },

  // ── Gepland (vastgelegd op de roadmap, nog niet gebouwd) ────────────────
  {
    naam: "Spots & uitvoering",
    omschrijving: "Spotflow, plattegronden, toewijzingen, voorbereide spots en clustering",
    status: "gepland",
    versie: "V1.3",
    opmerking: "Wacht op formeel akkoord (Ontwikkelstop)",
  },
  {
    naam: "Opleverrapportage",
    omschrijving: "Voorblad, rapportopmaak, e-mailselectie, bijlagenpakket en definitief maken",
    status: "gepland",
    versie: "V1.4",
    opmerking: "Wacht op formeel akkoord (Ontwikkelstop)",
  },
  {
    naam: "Rapportenmodule",
    omschrijving: "Centrale rapportenbibliotheek met definitieve rapporten, versiebeheer en documentbevriezing",
    status: "gepland",
    versie: "V1.5",
    opmerking: "Wacht op formeel akkoord (Ontwikkelstop)",
  },
  {
    naam: "Mobiele monteur-app (uitbreiding)",
    omschrijving: "Offline synchronisatie, routeplanning en biometrisch inloggen",
    status: "gepland",
    versie: "V2.0",
    geparkeerd: true,
  },
  {
    naam: "HRM volledige FPS Groep",
    omschrijving: "Verlof, uren, gereedschap, contracten, werving en mobiele medewerkersapp",
    status: "gepland",
    versie: "V3.0",
    geparkeerd: true,
  },
  {
    naam: "AI Brandveiligheidsmanager / Calculator / Klantmodule",
    omschrijving: "Strategische AI- en klantlaag met klantportaal en AI-calculatie",
    status: "gepland",
    geparkeerd: true,
  },
  {
    naam: "S.G. Constructies",
    omschrijving: "Aparte bibliotheeklaag voor scheidende constructies, branddeuren en opwaarderingen",
    status: "gepland",
    geparkeerd: true,
  },
  {
    naam: "CRM-module (uitgebreid)",
    omschrijving: "Bredere CRM-functionaliteit",
    status: "gepland",
    geparkeerd: true,
  },
];

const STATUS_META: Record<Status, { label: string; icon: typeof CheckCircle2; klasse: string }> = {
  af: {
    label: "Af",
    icon: CheckCircle2,
    klasse: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  "in-ontwikkeling": {
    label: "In ontwikkeling",
    icon: Clock,
    klasse: "border-amber-200 bg-amber-50 text-amber-700",
  },
  gepland: {
    label: "Gepland",
    icon: CircleDashed,
    klasse: "border-muted-foreground/30 bg-muted text-muted-foreground",
  },
};

function StatusBadge({ status }: { status: Status }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${meta.klasse}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </Badge>
  );
}

function ModuleRij({ item }: { item: ModuleItem }) {
  return (
    <div className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{item.naam}</span>
          {item.versie && (
            <Badge variant="secondary" className="text-[10px]">
              {item.versie}
            </Badge>
          )}
          {item.geparkeerd && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              Geparkeerd
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{item.omschrijving}</p>
        {item.opmerking && (
          <p className="text-xs text-muted-foreground/80 italic">{item.opmerking}</p>
        )}
        {item.externToegankelijk && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground/80">
            <Smartphone className="h-3 w-3" />
            {item.externToegankelijk}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <StatusBadge status={item.status} />
        {item.testbaar && (
          <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/5 text-primary">
            <Eye className="h-3 w-3" />
            Testbaar in preview
          </Badge>
        )}
        {item.testbaar && item.route && (
          <Link
            href={item.route}
            className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent"
          >
            Openen
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  );
}

export default function Ontwikkelstatus() {
  const afItems = MODULES.filter((m) => m.status === "af");
  const inOntwikkelingItems = MODULES.filter((m) => m.status === "in-ontwikkeling");
  const geplandItems = MODULES.filter((m) => m.status === "gepland");
  const testbaarAantal = MODULES.filter((m) => m.testbaar).length;

  const samenvatting: { label: string; aantal: number; icon: typeof CheckCircle2; klasse: string }[] = [
    { label: "Af", aantal: afItems.length, icon: CheckCircle2, klasse: "text-emerald-600" },
    { label: "In ontwikkeling", aantal: inOntwikkelingItems.length, icon: Clock, klasse: "text-amber-600" },
    { label: "Testbaar in preview", aantal: testbaarAantal, icon: Eye, klasse: "text-primary" },
    { label: "Gepland", aantal: geplandItems.length, icon: CircleDashed, klasse: "text-muted-foreground" },
  ];

  const alleSecties: { titel: string; status: Status; items: ModuleItem[] }[] = [
    { titel: "Af", status: "af", items: afItems },
    { titel: "In ontwikkeling", status: "in-ontwikkeling", items: inOntwikkelingItems },
    { titel: "Gepland", status: "gepland", items: geplandItems },
  ];
  const secties = alleSecties.filter((s) => s.items.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 text-primary p-2 rounded-lg">
          <ListChecks className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ontwikkelstatus</h1>
          <p className="text-sm text-muted-foreground">
            Per module: wat af is, wat in ontwikkeling is, wat nu testbaar is in de preview en wat nog gepland staat
          </p>
        </div>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-4">
          <p className="text-sm text-muted-foreground">
            Ontwikkeling gebeurt in kleine, zichtbare stappen, zodat elke wijziging direct in de preview te
            beoordelen is. Geplande fasen worden pas gebouwd na formeel akkoord (Ontwikkelstop).
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {samenvatting.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardContent className="flex items-center gap-3 py-4">
                <Icon className={`h-5 w-5 ${s.klasse}`} />
                <div>
                  <div className="text-2xl font-bold leading-none">{s.aantal}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {secties.map((sectie) => (
        <Card key={sectie.titel}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <StatusBadge status={sectie.status} />
              <span className="text-muted-foreground">({sectie.items.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y pt-0">
            {sectie.items.map((item) => (
              <ModuleRij key={item.naam} item={item} />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
