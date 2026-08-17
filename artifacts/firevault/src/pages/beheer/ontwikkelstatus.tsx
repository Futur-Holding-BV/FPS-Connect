import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListModuleBeoordelingen,
  useUpsertModuleBeoordeling,
  useDeleteModuleBeoordeling,
  getListModuleBeoordelingenQueryKey,
  type ModuleBeoordeling,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRol } from "@/context/rol-context";
import {
  ListChecks,
  CheckCircle2,
  Clock,
  CircleDashed,
  Eye,
  ExternalLink,
  Smartphone,
  XCircle,
  CircleHelp,
} from "lucide-react";

type Status = "af" | "in-ontwikkeling" | "gepland";

interface ModuleItem {
  // Stabiele, URL-veilige sleutel: bewust losgekoppeld van de weergavenaam,
  // zodat een hernoeming nooit een bestaande beoordeling laat verweesd raken.
  sleutel: string;
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
    sleutel: "dashboard",
    naam: "Dashboard",
    omschrijving: "Live statistieken: gebouwen, spots, onderhoud en aankomende inspecties",
    status: "af",
    testbaar: true,
    route: "/",
  },
  {
    sleutel: "gebouwenbeheer",
    naam: "Gebouwenbeheer",
    omschrijving: "Gebouwen, verdiepingen, plattegronden en 3D-weergave",
    status: "af",
    versie: "V1.0",
    testbaar: true,
    route: "/gebouwen",
  },
  {
    sleutel: "spots",
    naam: "Spots (voorzieningen)",
    omschrijving: "Registratie en overzicht van brandpreventieve spots op de plattegrond",
    status: "af",
    versie: "V1.0",
    testbaar: true,
    route: "/voorzieningen",
  },
  {
    sleutel: "v13-spots-uitvoering",
    naam: "Spots & uitvoering",
    omschrijving: "Spotflow, plattegronden, toewijzingen, voorbereide spots en clustering",
    status: "af",
    versie: "V1.3",
    testbaar: true,
    route: "/gebouwen",
    opmerking: "Gebouwd; resterende punten zijn verfijning en gebruiksvriendelijkheid",
  },
  {
    sleutel: "inspecties",
    naam: "Inspecties",
    omschrijving: "Oplevering, periodiek, jaarlijks en herstelinspecties bijhouden",
    status: "af",
    testbaar: true,
    route: "/inspecties",
  },
  {
    sleutel: "onderhoud",
    naam: "Onderhoud",
    omschrijving: "Werkorders met prioriteit, deadline, toewijzing en statussturing",
    status: "af",
    testbaar: true,
    route: "/onderhoud",
  },
  {
    sleutel: "rollen-bevoegdheden",
    naam: "Rollen & bevoegdheden",
    omschrijving: "Gebruikers, rollen en de bevoegdhedenmatrix",
    status: "af",
    versie: "V1.1",
    testbaar: true,
    route: "/gebruikers",
  },
  {
    sleutel: "profielen",
    naam: "Profielen",
    omschrijving: "Herbruikbare bevoegdheidsprofielen koppelen aan gebruikers",
    status: "af",
    versie: "V1.1",
    testbaar: true,
    route: "/beheer/profielen",
  },
  {
    sleutel: "bibliotheek",
    naam: "Bibliotheek & documentstructuur",
    omschrijving: "Applicaties, toepassingen, documenten, ETA's, koppelingen en versiebeheer",
    status: "af",
    versie: "V1.2",
    testbaar: true,
    route: "/beheer/bibliotheek",
  },
  {
    sleutel: "dms",
    naam: "DMS / Documentenbibliotheek",
    omschrijving:
      "Documentdetail en logboek, polymorfe koppelingen, duplicaatdetectie, goedkeuringsflow, signaleringen en audittrail",
    status: "af",
    testbaar: true,
    route: "/beheer/bibliotheek",
    opmerking: "Uitbreiding op V1.2 met dossierkoppeling en bevriezing",
  },
  {
    sleutel: "toepassingen",
    naam: "Toepassingen",
    omschrijving: "Beheer van toepassingen, fabrikanten en testnormen",
    status: "af",
    testbaar: true,
    route: "/beheer/toepassingen",
  },
  {
    sleutel: "ai-spotherkenning",
    naam: "AI Spotherkenning",
    omschrijving: "AI stelt spotafwerking voor met zelflerende correcties; een mens bevestigt altijd",
    status: "af",
    testbaar: true,
    route: "/voorzieningen",
  },
  {
    sleutel: "ai-bibliotheekvalidatie",
    naam: "AI Bibliotheekvalidatie",
    omschrijving: "AI controleert bibliotheekdocumenten; een mens keurt juridisch goed",
    status: "af",
    testbaar: true,
    route: "/beheer/bibliotheek",
  },
  {
    sleutel: "hrm-personeel",
    naam: "HRM / Personeel (basis)",
    omschrijving: "Medewerkers, functiehuis, opleidingen, bekwaamheidsmatrix en verlof",
    status: "af",
    testbaar: true,
    route: "/personeel",
    opmerking: "Fase 1-basis — diepere uitwerking blijft gepland",
  },
  {
    sleutel: "dossiermodule",
    naam: "Dossiermodule (basis)",
    omschrijving: "Dossiers per gebouw met status concept, definitief en gearchiveerd",
    status: "af",
    testbaar: true,
    route: "/dossiers",
    opmerking: "Fase 1-basis — juridisch sluitend opleverdossier volgt in V1.5",
  },
  {
    sleutel: "offerte-intelligence",
    naam: "Offerte Intelligence (basis)",
    omschrijving: "Voorbereiding: regels uit spots en sjablonen",
    status: "af",
    testbaar: true,
    route: "/offertes",
    opmerking: "Fase 1-basis — bewust geen AI-calculatie en geen automatische verzending",
  },
  {
    sleutel: "abonnementen",
    naam: "Abonnementen",
    omschrijving: "Pakketten Basis, Beheer en Volledig",
    status: "af",
    testbaar: true,
    route: "/abonnementen",
  },
  {
    sleutel: "heatmaps",
    naam: "Heatmaps",
    omschrijving: "Gebruiksanalyse via geregistreerde muisbewegingen",
    status: "af",
    testbaar: true,
    route: "/beheer/heatmaps",
  },
  {
    sleutel: "helpdesk",
    naam: "Helpdesk",
    omschrijving: "Supporttickets van gebruikers afhandelen",
    status: "af",
    testbaar: true,
    route: "/beheer/helpdesk",
  },
  {
    sleutel: "feedback",
    naam: "Feedback",
    omschrijving: "Gebruikersfeedback verzamelen en bekijken",
    status: "af",
    testbaar: true,
    route: "/beheer/feedback",
  },
  {
    sleutel: "login-pogingen",
    naam: "Login-pogingen",
    omschrijving: "Beveiligingssignalen bij aanmelden (nieuw apparaat of IP-adres)",
    status: "af",
    testbaar: true,
    route: "/beheer/login-pogingen",
  },
  {
    sleutel: "mobiele-monteur-app",
    naam: "Mobiele monteur-app (FPS Monteur)",
    omschrijving: "Read-mostly mobiele schermen voor gebouwen, plattegronden en spots",
    status: "af",
    testbaar: true,
    externToegankelijk: "Te openen via de FPS Monteur-app in de preview",
  },
  {
    sleutel: "crm-basis",
    naam: "CRM (basis-scaffold)",
    omschrijving: "Klantenoverzicht — basis aanwezig",
    status: "af",
    testbaar: true,
    route: "/crm",
    opmerking: "Scaffold; wordt bewust niet verder uitgebouwd vóór V1.5",
  },

  // ── In ontwikkeling (wordt nu actief aan gewerkt) ───────────────────────
  {
    sleutel: "naamgeving-fps-connect-one",
    naam: "Naamgeving FPS Connect / FPS One",
    omschrijving:
      "Intern heet het platform FPS Connect, de klantomgeving FPS One. Wordt stapsgewijs en zichtbaar doorgevoerd",
    status: "in-ontwikkeling",
  },
  {
    sleutel: "v14-opleverrapportage",
    naam: "Opleverrapportage",
    omschrijving: "Voorblad, rapportopmaak, e-mailselectie, bijlagenpakket en definitief maken",
    status: "in-ontwikkeling",
    versie: "V1.4",
    opmerking: "In aanbouw met formeel akkoord; bouwt voort op de bestaande live-rapportage",
  },

  // ── Gepland (vastgelegd op de roadmap, nog niet gebouwd) ────────────────
  {
    sleutel: "v15-rapportenmodule",
    naam: "Rapportenmodule",
    omschrijving: "Centrale rapportenbibliotheek met definitieve rapporten, versiebeheer en documentbevriezing",
    status: "gepland",
    versie: "V1.5",
    opmerking: "Wacht op formeel akkoord (Ontwikkelstop)",
  },
  {
    sleutel: "v20-monteur-app-uitbreiding",
    naam: "Mobiele monteur-app (uitbreiding)",
    omschrijving: "Offline synchronisatie, routeplanning en biometrisch inloggen",
    status: "gepland",
    versie: "V2.0",
    geparkeerd: true,
  },
  {
    sleutel: "v30-hrm-fps-groep",
    naam: "HRM volledige FPS Groep",
    omschrijving: "Verlof, uren, gereedschap, contracten, werving en mobiele medewerkersapp",
    status: "gepland",
    versie: "V3.0",
    geparkeerd: true,
  },
  {
    sleutel: "ai-brandveiligheidsmanager",
    naam: "AI Brandveiligheidsmanager / Calculator / Klantmodule",
    omschrijving: "Strategische AI- en klantlaag met klantportaal en AI-calculatie",
    status: "gepland",
    geparkeerd: true,
  },
  {
    sleutel: "sg-constructies",
    naam: "S.G. Constructies",
    omschrijving: "Aparte bibliotheeklaag voor scheidende constructies, branddeuren en opwaarderingen",
    status: "gepland",
    geparkeerd: true,
  },
  {
    sleutel: "crm-uitgebreid",
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

function BeoordelingBadge({ beoordeling }: { beoordeling: ModuleBeoordeling }) {
  if (beoordeling.status === "gereed") {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700">
        <CheckCircle2 className="h-3 w-3" />
        Gereed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-red-200 bg-red-50 text-red-700">
      <XCircle className="h-3 w-3" />
      Niet akkoord
    </Badge>
  );
}

function BeoordelingControle({
  sleutel,
  beoordeling,
  kanBeoordelen,
}: {
  sleutel: string;
  beoordeling?: ModuleBeoordeling;
  kanBeoordelen: boolean;
}) {
  const queryClient = useQueryClient();
  const upsert = useUpsertModuleBeoordeling();
  const verwijder = useDeleteModuleBeoordeling();
  const [opmerking, setOpmerking] = useState(beoordeling?.opmerking ?? "");

  useEffect(() => {
    setOpmerking(beoordeling?.opmerking ?? "");
  }, [beoordeling?.opmerking]);

  const ververs = () =>
    queryClient.invalidateQueries({ queryKey: getListModuleBeoordelingenQueryKey() });

  const bezig = upsert.isPending || verwijder.isPending;
  const huidige = beoordeling?.status;

  function zet(status: "gereed" | "niet_akkoord") {
    if (bezig) return;
    if (huidige === status) {
      verwijder.mutate({ sleutel }, { onSuccess: ververs });
      return;
    }
    upsert.mutate(
      { sleutel, data: { status, opmerking: status === "niet_akkoord" ? opmerking : undefined } },
      { onSuccess: ververs },
    );
  }

  function bewaarOpmerking() {
    if (bezig) return;
    upsert.mutate({ sleutel, data: { status: "niet_akkoord", opmerking } }, { onSuccess: ververs });
  }

  // Gebruikers zonder systeembevoegdheid zien alleen het resultaat (read-only).
  if (!kanBeoordelen) {
    if (!beoordeling) return null;
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
        <BeoordelingBadge beoordeling={beoordeling} />
        {beoordeling.opmerking && (
          <span className="text-xs text-muted-foreground">{beoordeling.opmerking}</span>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={bezig}
          onClick={() => zet("gereed")}
          className={
            huidige === "gereed"
              ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white"
              : "border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
          }
        >
          <CheckCircle2 className="h-4 w-4" />
          Gereed
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={bezig}
          onClick={() => zet("niet_akkoord")}
          className={
            huidige === "niet_akkoord"
              ? "border-red-600 bg-red-600 text-white hover:bg-red-700 hover:text-white"
              : "border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
          }
        >
          <XCircle className="h-4 w-4" />
          Niet akkoord
        </Button>
        {beoordeling?.beoordeeld_door_naam && (
          <span className="text-xs text-muted-foreground">
            Beoordeeld door {beoordeling.beoordeeld_door_naam}
          </span>
        )}
      </div>

      {huidige === "niet_akkoord" && (
        <div className="space-y-2 rounded-md border border-red-200 bg-red-50/60 p-3">
          <label className="text-xs font-medium text-red-800">
            Waarom werkt dit onderdeel niet goed? Dit gebruik ik om het te onderzoeken en met een
            voorstel te komen.
          </label>
          <Textarea
            value={opmerking}
            onChange={(e) => setOpmerking(e.target.value)}
            placeholder="Beschrijf wat er niet werkt of wat er anders moet…"
            className="min-h-[72px] bg-background text-sm"
          />
          <div className="flex justify-end">
            <Button type="button" size="sm" variant="outline" disabled={bezig} onClick={bewaarOpmerking}>
              Opmerking opslaan
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ModuleRij({
  item,
  beoordeling,
  kanBeoordelen,
}: {
  item: ModuleItem;
  beoordeling?: ModuleBeoordeling;
  kanBeoordelen: boolean;
}) {
  return (
    <div className="py-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
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
          {beoordeling && <BeoordelingBadge beoordeling={beoordeling} />}
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
      <BeoordelingControle sleutel={item.sleutel} beoordeling={beoordeling} kanBeoordelen={kanBeoordelen} />
    </div>
  );
}

export default function Ontwikkelstatus() {
  const { bevoegdheden } = useRol();
  const kanBeoordelen = (bevoegdheden.systeem ?? 0) >= 1;

  const { data: beoordelingenData } = useListModuleBeoordelingen();
  const beoordelingMap = useMemo(() => {
    const m = new Map<string, ModuleBeoordeling>();
    (beoordelingenData ?? []).forEach((b) => m.set(b.sleutel, b));
    return m;
  }, [beoordelingenData]);

  const afItems = MODULES.filter((m) => m.status === "af");
  const inOntwikkelingItems = MODULES.filter((m) => m.status === "in-ontwikkeling");
  const geplandItems = MODULES.filter((m) => m.status === "gepland");
  const testbaarAantal = MODULES.filter((m) => m.testbaar).length;

  const gereedAantal = MODULES.filter((m) => beoordelingMap.get(m.sleutel)?.status === "gereed").length;
  const nietAkkoordAantal = MODULES.filter(
    (m) => beoordelingMap.get(m.sleutel)?.status === "niet_akkoord",
  ).length;
  const teBeoordelen = MODULES.length - gereedAantal - nietAkkoordAantal;

  const samenvatting: { label: string; aantal: number; icon: typeof CheckCircle2; klasse: string }[] = [
    { label: "Af", aantal: afItems.length, icon: CheckCircle2, klasse: "text-emerald-600" },
    { label: "In ontwikkeling", aantal: inOntwikkelingItems.length, icon: Clock, klasse: "text-amber-600" },
    { label: "Testbaar in preview", aantal: testbaarAantal, icon: Eye, klasse: "text-primary" },
    { label: "Gepland", aantal: geplandItems.length, icon: CircleDashed, klasse: "text-muted-foreground" },
  ];

  const beoordelingSamenvatting: { label: string; aantal: number; icon: typeof CheckCircle2; klasse: string }[] = [
    { label: "Gereed bevonden", aantal: gereedAantal, icon: CheckCircle2, klasse: "text-emerald-600" },
    { label: "Niet akkoord", aantal: nietAkkoordAantal, icon: XCircle, klasse: "text-red-600" },
    { label: "Nog te beoordelen", aantal: teBeoordelen, icon: CircleHelp, klasse: "text-muted-foreground" },
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
          <h1 data-paginatitel className="text-2xl font-bold tracking-tight">Ontwikkelstatus</h1>
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

      {kanBeoordelen && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Beoordeling per module</CardTitle>
            <p className="text-sm text-muted-foreground">
              Markeer per module of het naar wens werkt. Kies "Gereed" als het in orde is, of "Niet akkoord"
              als er iets niet klopt. Bij "Niet akkoord" kun je kort toelichten wat er mis is; dat onderzoek ik
              vervolgens om met een voorstel te komen. Keuzes worden bewaard.
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-3 gap-3">
              {beoordelingSamenvatting.map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className="flex items-center gap-3 rounded-lg border p-3">
                    <Icon className={`h-5 w-5 ${s.klasse}`} />
                    <div>
                      <div className="text-2xl font-bold leading-none">{s.aantal}</div>
                      <div className="text-xs text-muted-foreground">{s.label}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

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
              <ModuleRij
                key={item.sleutel}
                item={item}
                beoordeling={beoordelingMap.get(item.sleutel)}
                kanBeoordelen={kanBeoordelen}
              />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
