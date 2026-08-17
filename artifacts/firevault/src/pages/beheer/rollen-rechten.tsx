import { useState, Fragment } from "react";
import { Link } from "wouter";
import {
  useListProfielen,
  getListProfielenQueryKey,
  useSynchroniseerStandaardProfielen,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { MODULES, NIVEAUS, PRESETS, GROEP_OPTIES, niveauVan } from "@workspace/permissies";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useRol } from "@/context/rol-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  KeyRound, CheckCircle2, XCircle, MinusCircle, AlertTriangle,
  Users, ShieldCheck, ExternalLink, Info, RefreshCw, Loader2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AiVoorstelDialog } from "@/components/ai-rollen-voorstel-dialog";

const NIVEAU_STIJL: Record<number, { label: string; kleur: string }> = {
  0: { label: "Geen",     kleur: "bg-muted text-muted-foreground" },
  1: { label: "Lezen",    kleur: "bg-blue-100 text-blue-800" },
  2: { label: "Wijzigen", kleur: "bg-yellow-100 text-yellow-800" },
  3: { label: "Aanmaken", kleur: "bg-orange-100 text-orange-800" },
  4: { label: "Beheer",   kleur: "bg-red-100 text-red-800" },
};

const NIVEAU_KORT: Record<number, string> = {
  0: "—", 1: "L", 2: "W", 3: "A", 4: "B",
};

type RouteRapportRegel = {
  module: string;
  label: string;
  route: string;
  navItem: boolean;
  gate: string;
  sectie: string;
  opmerking?: string;
};

const ROUTE_RAPPORT: RouteRapportRegel[] = [
  { module: "gebouwen",       label: "Gebouwen",              route: "/gebouwen",                    navItem: true,  gate: "gebouwen:1",       sectie: "Projecten" },
  { module: "gebouwen",       label: "Opnames",               route: "/opname",                      navItem: true,  gate: "gebouwen:1",       sectie: "Projecten", opmerking: "Gated via gebouwen:1 (geen aparte module)" },
  { module: "gebouwen",       label: "Onderhoud",             route: "/onderhoud",                   navItem: true,  gate: "gebouwen:1",       sectie: "Projecten", opmerking: "Gated via gebouwen:1 (geen aparte module)" },
  { module: "rapportages",    label: "Oplevering/Rapporten",  route: "/rapporten",                   navItem: true,  gate: "gebouwen:1",       sectie: "Projecten", opmerking: "Gated via gebouwen:1 (geen aparte module)" },
  { module: "dossiers",       label: "Dossiers",              route: "/dossiers",                    navItem: true,  gate: "dossiers:1",       sectie: "Projecten" },
  { module: "planning",       label: "Planning",              route: "/modules/planning",            navItem: true,  gate: "planning:1",       sectie: "Projecten" },
  { module: "calculaties",    label: "Calculaties",           route: "/connect/calculatie",          navItem: true,  gate: "calculaties:1",    sectie: "Projecten" },
  { module: "offertes",       label: "Offerte Studio",        route: "/offertes/:id",                navItem: false, gate: "offertes:1",       sectie: "Projecten", opmerking: "Geen directe nav-link; bereikbaar via gebouw-detail" },
  { module: "voorzieningen",  label: "Spots",                 route: "/voorzieningen/:id",           navItem: false, gate: "voorzieningen:1",  sectie: "Projecten", opmerking: "Geen directe nav-link; bereikbaar via gebouw/plattegrond" },
  { module: "inspecties",     label: "Inspecties",            route: "/inspecties/:id",              navItem: false, gate: "inspecties:1",     sectie: "Projecten", opmerking: "Geen directe nav-link; bereikbaar via spot-detail" },
  { module: "bibliotheek",    label: "Bibliotheek",           route: "/beheer/bibliotheek",          navItem: true,  gate: "bibliotheek:1",    sectie: "Beheer" },
  { module: "gebruikers",     label: "Gebruikers",            route: "/gebruikers",                  navItem: true,  gate: "gebruikers:1",     sectie: "Beheer" },
  { module: "systeem",        label: "Login-pogingen",        route: "/beheer/login-pogingen",       navItem: true,  gate: "systeem:1",        sectie: "Beheer" },
  { module: "systeem",        label: "Mailinstellingen",      route: "/beheer/mail",                 navItem: true,  gate: "systeem:1",        sectie: "Beheer" },
  { module: "systeem",        label: "Gedeelde mailboxen",    route: "/beheer/mailboxen",            navItem: true,  gate: "systeem:1",        sectie: "Beheer" },
  { module: "systeem",        label: "Back-up & Herstel",     route: "/beheer/backup",               navItem: true,  gate: "systeem:1",        sectie: "Beheer" },
  { module: "crm",            label: "CRM Dashboard",         route: "/crm",                         navItem: true,  gate: "crm:1",            sectie: "CRM" },
  { module: "crm",            label: "Organisaties",          route: "/crm/organisaties",            navItem: true,  gate: "crm:1",            sectie: "CRM" },
  { module: "crm",            label: "Projectkansen",         route: "/crm/projectkansen",           navItem: true,  gate: "crm:1",            sectie: "CRM" },
  { module: "crm",            label: "Concurrenten",          route: "/crm/concurrenten",            navItem: true,  gate: "crm:1",            sectie: "CRM" },
  { module: "crm",            label: "Marktinzicht",          route: "/crm/marktintelligentie",      navItem: true,  gate: "crm:1",            sectie: "CRM" },
  { module: "personeel",      label: "Personeel",             route: "/personeel",                   navItem: true,  gate: "personeel:1",      sectie: "HRM" },
  { module: "personeel",      label: "Verlofoverzicht",       route: "/personeel/verlof",            navItem: true,  gate: "personeel:1",      sectie: "HRM" },
  { module: "personeel",      label: "Capaciteitsplanning",   route: "/personeel/capaciteitsplanning", navItem: true, gate: "personeel:1",     sectie: "HRM" },
  { module: "gereedschappen", label: "Gereedschappen",        route: "/gereedschappen",              navItem: true,  gate: "gereedschappen:1", sectie: "HRM" },
  { module: "personeel",      label: "Urenregistratie",       route: "/uren",                        navItem: true,  gate: "personeel:1",      sectie: "HRM" },
  { module: "personeel",      label: "Weekstaten",            route: "/weekstaten",                  navItem: true,  gate: "personeel:1",      sectie: "HRM", opmerking: "Ontbrak nav-item — hersteld in deze release" },
  { module: "toolbox",        label: "Toolbox",               route: "/toolbox",                     navItem: true,  gate: "toolbox:1",        sectie: "Communicatie" },
  { module: "berichten",      label: "Berichten",             route: "/berichten",                   navItem: true,  gate: "",                 sectie: "Communicatie", opmerking: "Altijd zichtbaar" },
];

function NiveauBadge({ niveau, kort = false }: { niveau: number; kort?: boolean }) {
  const stijl = NIVEAU_STIJL[niveau] ?? NIVEAU_STIJL[0];
  if (kort) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded text-xs font-semibold w-6 h-5",
          niveau === 0 ? "text-muted-foreground" : stijl.kleur,
        )}
        title={stijl.label}
      >
        {NIVEAU_KORT[niveau] ?? "—"}
      </span>
    );
  }
  return (
    <Badge variant="outline" className={cn("text-xs font-medium border-0", stijl.kleur)}>
      {stijl.label}
    </Badge>
  );
}


function RollenmatrixTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useListProfielen();
  const profielen = data ?? [];
  const synchroniseer = useSynchroniseerStandaardProfielen({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProfielenQueryKey() });
      },
    },
  });
  const [bevestigOpen, setBevestigOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const invalideerProfielen = () =>
    queryClient.invalidateQueries({ queryKey: getListProfielenQueryKey() });

  const zichtbareModules = MODULES.filter(
    (m) => !["abonnementen", "systeem"].includes(m.id),
  );

  const ontbrekendePresets = PRESETS.filter(
    (p) => !profielen.some((pr) => pr.naam === p.naam),
  );

  const GROEP_VOLGORDE: string[] = [...GROEP_OPTIES];
  const profielenPerGroep = new Map<string, typeof profielen>();
  for (const p of profielen) {
    const key = p.groep || "Overige rollen";
    if (!profielenPerGroep.has(key)) profielenPerGroep.set(key, []);
    profielenPerGroep.get(key)!.push(p);
  }
  const groepen = [
    ...GROEP_VOLGORDE.filter((g) => profielenPerGroep.has(g)),
    ...[...profielenPerGroep.keys()].filter((g) => !GROEP_VOLGORDE.includes(g) && g !== "Overige rollen").sort(),
    ...(profielenPerGroep.has("Overige rollen") ? ["Overige rollen"] : []),
  ];
  const toonGroepen = groepen.length > 1 || (groepen.length === 1 && groepen[0] !== "Overige rollen");

  if (!isLoading && profielen.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <ShieldCheck className="mx-auto mb-3 h-8 w-8 opacity-40" />
          <p className="font-medium">Nog geen profielen aangemaakt.</p>
          <p className="text-sm mt-1 mb-4">
            Synchroniseer de {PRESETS.length} standaardrollen in één klik, of laat de AI een set
            rollen voorstellen.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              onClick={() => synchroniseer.mutate()}
              disabled={synchroniseer.isPending}
            >
              {synchroniseer.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Standaardrollen aanmaken
            </Button>
            <Button variant="outline" onClick={() => setAiOpen(true)}>
              <Sparkles className="mr-2 h-4 w-4 text-amber-500" />
              Laat AI rollen voorstellen
            </Button>
          </div>
          {synchroniseer.isSuccess && (
            <p className="text-sm text-green-600 mt-3">
              {synchroniseer.data.aangemaakt} profiel(en) aangemaakt.
            </p>
          )}
        </CardContent>
        <AiVoorstelDialog open={aiOpen} onOpenChange={setAiOpen} onOpgeslagen={invalideerProfielen} />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {profielen.length} rol(len) geconfigureerd.
        </p>
        <Button variant="outline" size="sm" onClick={() => setAiOpen(true)}>
          <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
          Laat AI rollen voorstellen
        </Button>
      </div>
      <AiVoorstelDialog open={aiOpen} onOpenChange={setAiOpen} onOpgeslagen={invalideerProfielen} />
      {ontbrekendePresets.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              {ontbrekendePresets.length} standaardrol(len) ontbreken nog:{" "}
              <span className="font-medium">{ontbrekendePresets.map((p) => p.naam).join(", ")}</span>
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (profielen.some(p => !p.systeem)) {
                setBevestigOpen(true);
              } else {
                synchroniseer.mutate();
              }
            }}
            disabled={synchroniseer.isPending}
            className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100"
          >
            {synchroniseer.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Synchroniseren
          </Button>
        </div>
      )}
      {synchroniseer.isSuccess && synchroniseer.data.aangemaakt > 0 && (
        <p className="text-sm text-green-600">
          {synchroniseer.data.aangemaakt} standaardprofiel(en) aangemaakt.
        </p>
      )}
      <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Compacte weergave — <strong>L</strong>=Lezen&nbsp;&nbsp;<strong>W</strong>=Wijzigen&nbsp;&nbsp;<strong>A</strong>=Aanmaken&nbsp;&nbsp;<strong>B</strong>=Beheer&nbsp;&nbsp;<strong>—</strong>=Geen toegang.{" "}
          Bewerken via{" "}
          <Link href="/beheer/profielen" className="underline text-foreground">
            Profielen
          </Link>
          .
        </span>
      </div>

      <AlertDialog open={bevestigOpen} onOpenChange={setBevestigOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Standaardrollen synchroniseren?</AlertDialogTitle>
            <AlertDialogDescription>
              Er bestaan al aangepaste profielen in dit systeem. Synchroniseren zal ontbrekende standaardrollen toevoegen en bestaande standaardrollen bijwerken naar de systeemdefinitie. Aangepaste (niet-systeem) profielen blijven ongewijzigd.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={() => synchroniseer.mutate()}>
              Synchroniseren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="min-w-[160px] sticky left-0 bg-muted/50 z-10 font-semibold">
                Rol / Profiel
              </TableHead>
              <TableHead className="text-center w-10 px-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Users className="h-3.5 w-3.5 mx-auto opacity-60" />
                  </TooltipTrigger>
                  <TooltipContent>Aantal gebruikers met dit profiel</TooltipContent>
                </Tooltip>
              </TableHead>
              {zichtbareModules.map((m) => (
                <TableHead key={m.id} className="text-center px-1 min-w-[36px]">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs font-semibold cursor-default">
                        {m.label.slice(0, 4)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{m.label}</TooltipContent>
                  </Tooltip>
                </TableHead>
              ))}
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {groepen.map((groep) => {
              const items = profielenPerGroep.get(groep) ?? [];
              return (
                <Fragment key={groep}>
                  {toonGroepen && (
                    <TableRow className="bg-muted/40 hover:bg-muted/40 border-t">
                      <TableCell
                        colSpan={zichtbareModules.length + 3}
                        className="py-1 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                      >
                        {groep}
                      </TableCell>
                    </TableRow>
                  )}
                  {items.map((profiel) => {
                    const bevoegdheden = profiel.bevoegdheden as Record<string, number>;
                    const aantalGebruikers = (profiel as unknown as Record<string, unknown>).gebruiker_aantal as number | undefined;
                    const isSystemProfiel = (profiel as unknown as Record<string, unknown>).systeem as boolean | undefined;
                    return (
                      <TableRow key={profiel.id} className="hover:bg-muted/30">
                        <TableCell className="sticky left-0 bg-background z-10 font-medium">
                          <div className="flex items-center gap-2">
                            {isSystemProfiel && (
                              <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            )}
                            <span>{profiel.naam}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">
                          {aantalGebruikers ?? 0}
                        </TableCell>
                        {zichtbareModules.map((m) => {
                          const niveau = niveauVan(bevoegdheden, m.id as Parameters<typeof niveauVan>[1]);
                          return (
                            <TableCell key={m.id} className="text-center px-1 py-1">
                              <NiveauBadge niveau={niveau} kort />
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" asChild className="h-7 text-xs">
                            <Link href="/beheer/profielen">
                              Bewerken
                              <ExternalLink className="ml-1 h-3 w-3" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {NIVEAUS.map((n) => (
          <div key={n.waarde} className="flex items-center gap-2 text-sm">
            <NiveauBadge niveau={n.waarde} />
            <span className="text-muted-foreground">{n.omschrijving}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModulerapportTab() {
  const secties = Array.from(new Set(ROUTE_RAPPORT.map((r) => r.sectie)));

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Overzicht van alle geregistreerde routes en hun navigatiestatus.
          Routes zonder nav-item zijn bereikbaar via directe URL of vanuit een andere pagina.
        </span>
      </div>

      {secties.map((sectie) => {
        const regels = ROUTE_RAPPORT.filter((r) => r.sectie === sectie);
        return (
          <div key={sectie} className="rounded-md border overflow-hidden">
            <div className="bg-muted/60 px-4 py-2 font-semibold text-sm">{sectie}</div>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20">
                  <TableHead className="w-48">Onderdeel</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead className="w-28 text-center">Nav-item</TableHead>
                  <TableHead className="w-40">Vereist</TableHead>
                  <TableHead>Opmerking</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regels.map((r, i) => {
                  const moduleInfo = MODULES.find((m) => m.id === r.module);
                  return (
                    <TableRow key={i} className={cn(!r.navItem && "bg-amber-50/30")}>
                      <TableCell className="font-medium">{r.label}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{r.route}</code>
                      </TableCell>
                      <TableCell className="text-center">
                        {r.navItem ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
                        ) : (
                          <MinusCircle className="h-4 w-4 text-muted-foreground mx-auto" />
                        )}
                      </TableCell>
                      <TableCell>
                        {r.gate ? (
                          <span className="text-xs text-muted-foreground">
                            {moduleInfo?.label ?? r.module}&nbsp;
                            <span className="font-mono">
                              (niv.&nbsp;{r.gate.split(":")[1]})
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Altijd zichtbaar</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.opmerking && (
                          <span className={cn(
                            r.opmerking.includes("hersteld") && "text-green-700 font-medium",
                            r.opmerking.includes("Ontbrak") && "text-amber-700",
                          )}>
                            {r.opmerking}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        );
      })}
    </div>
  );
}

function MijnToegang() {
  const { bevoegdheden } = useBevoegdheid();
  const { rol } = useRol();

  const uitleg: Record<string, string> = {
    gebouwen: "Gebouwen lezen/bewerken — kernmodule voor projectbeheer",
    voorzieningen: "Spots (branddeuren, doorvoeringen, etc.) inzien en beheren",
    inspecties: "Oplever-, periodieke en herstelinspecties bijhouden",
    onderhoud: "Werkorders aanmaken en opvolgen",
    rapportages: "Opleverrapporten exporteren en archiveren",
    bibliotheek: "Applicaties, toepassingen en testrapporten beheren",
    gebruikers: "Gebruikersaccounts en bevoegdheden beheren",
    crm: "Relatiebeheer, projectkansen en commercieel overzicht",
    abonnementen: "Abonnementen en pakketten beheren",
    personeel: "Medewerkers, verlof, uren en certificaten",
    dossiers: "Projectdossiers aanmaken en archiveren",
    offertes: "Offertestructuur, begroting en uitgangspunten",
    systeem: "Systeeminstellingen, mail en beveiligingslog",
    planning: "Planningsitems en werkagenda's",
    calculaties: "Kostenberekeningen en normtijden",
    toolbox: "Toolboxberichten ontvangen en bevestigen",
    gereedschappen: "Machines en gereedschapsinventaris",
  };

  const alleModules = MODULES;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Toegangsstatus voor het huidig ingelogde account.
          Rol: <span className="font-medium text-foreground">{rol}</span>.
          Hoofdbeheerders hebben altijd volledige toegang.
        </span>
      </div>

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-44">Module</TableHead>
              <TableHead className="w-36 text-center">Toegangsniveau</TableHead>
              <TableHead className="w-32 text-center">Status</TableHead>
              <TableHead>Toelichting</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {alleModules.map((m) => {
              const niveau: number = rol === "hoofdbeheerder" ? 4 : (bevoegdheden[m.id] ?? 0);
              const heeftToegang = niveau > 0;
              return (
                <TableRow key={m.id} className={cn(!heeftToegang && "bg-muted/10")}>
                  <TableCell>
                    <div className="font-medium text-sm">{m.label}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[160px]" title={m.omschrijving}>
                      {m.omschrijving}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <NiveauBadge niveau={niveau} />
                  </TableCell>
                  <TableCell className="text-center">
                    {heeftToegang ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground mx-auto" />
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {heeftToegang ? (
                      <span className="text-muted-foreground">{uitleg[m.id] ?? m.omschrijving}</span>
                    ) : (
                      <div className="flex items-start gap-1.5">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                        <div>
                          <p className="text-amber-800 font-medium">Geen toegang</p>
                          <p className="text-muted-foreground text-xs">
                            Vraag een beheerder om het bevoegdheidsprofiel aan te passen via{" "}
                            <Link href="/beheer/profielen" className="underline">
                              Profielen
                            </Link>
                            {" "}(module &ldquo;{m.label}&rdquo;, minimaal niveau Lezen).
                          </p>
                        </div>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function RollenRechtenBeheer() {
  const [tabActief, setTabActief] = useState("matrix");

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center gap-3">
          <KeyRound className="h-6 w-6 text-primary" />
          <div>
            <h1 data-paginatitel className="text-xl font-semibold">Rollen &amp; Rechten</h1>
            <p className="text-sm text-muted-foreground">
              Overzicht van rolprofielen, moduletoegang en navigatiestatus
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 sm:grid-cols-3">
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Standaardrollen</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{PRESETS.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">ingebouwde rolprofielen</p>
            </CardContent>
          </Card>
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Modules</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{MODULES.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">geregistreerde modules</p>
            </CardContent>
          </Card>
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Routes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{ROUTE_RAPPORT.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {ROUTE_RAPPORT.filter((r) => !r.navItem).length} zonder direct nav-item
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={tabActief} onValueChange={setTabActief}>
          <TabsList>
            <TabsTrigger value="matrix">Rollenmatrix</TabsTrigger>
            <TabsTrigger value="rapport">Modulerapport</TabsTrigger>
            <TabsTrigger value="diagnose">Mijn toegang</TabsTrigger>
          </TabsList>

          <TabsContent value="matrix" className="mt-4">
            <RollenmatrixTab />
          </TabsContent>

          <TabsContent value="rapport" className="mt-4">
            <ModulerapportTab />
          </TabsContent>

          <TabsContent value="diagnose" className="mt-4">
            <MijnToegang />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
