import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MapPin,
  Hash,
  Calendar,
  Users,
  ClipboardList,
  CheckCircle2,
  Circle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Euro,
  Receipt,
  ArrowRight,
  ChevronRight,
  Wrench,
  ListChecks,
  Building2,
  BarChart3,
  Package,
  FileText,
  Activity,
} from "lucide-react";

const EURO_FMT = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

type FaseStatus = "niet_gestart" | "bezig" | "gereed" | "aandacht";
type Ernst = "laag" | "middel" | "hoog";

interface Fase {
  id: string;
  label: string;
  korteLabel: string;
  status: FaseStatus;
  tab: string;
}

interface Signaal {
  tekst: string;
  ernst: Ernst;
  tab?: string;
}

interface DashboardProps {
  gebouw: any;
  toewijzingen: any[];
  gebouwCalcs: any[];
  gebouwOffertes: any[];
  gebouwOpnames: any[];
  gebouwFacturen: any[];
  openActiepunten: any[];
  onNavigeer: (tab: string) => void;
  isBeheerder: boolean;
  heeftFinancieelInzicht: boolean;
}

function leidFasenAf(
  calcs: any[],
  offertes: any[],
  opnames: any[],
  facturen: any[],
  gebouw: any,
): Fase[] {
  const geaccepteerd = offertes.some((o) => o.status === "geaccepteerd");
  const gewonnen = calcs.some((c) => c.status === "gewonnen");
  const heeftOpdracht = geaccepteerd || gewonnen;

  return [
    {
      id: "opname",
      label: "Opname",
      korteLabel: "Opname",
      status: opnames.some((o) => o.status === "gereed")
        ? "gereed"
        : opnames.length > 0
          ? "bezig"
          : "niet_gestart",
      tab: "opnames",
    },
    {
      id: "calculatie",
      label: "Calculatie",
      korteLabel: "Calc.",
      status: gewonnen ? "gereed" : calcs.length > 0 ? "bezig" : "niet_gestart",
      tab: "calculaties",
    },
    {
      id: "offerte",
      label: "Offerte",
      korteLabel: "Offerte",
      status: geaccepteerd
        ? "gereed"
        : offertes.length > 0
          ? "bezig"
          : "niet_gestart",
      tab: "offertes",
    },
    {
      id: "opdracht",
      label: "Opdracht",
      korteLabel: "Opdracht",
      status: heeftOpdracht ? "gereed" : "niet_gestart",
      tab: "project",
    },
    {
      id: "werkbegroting",
      label: "Werkbegroting",
      korteLabel: "WB",
      status: "niet_gestart",
      tab: "calculaties",
    },
    {
      id: "inkoop",
      label: "Inkoop",
      korteLabel: "Inkoop",
      status: "niet_gestart",
      tab: "calculaties",
    },
    {
      id: "planning",
      label: "Planning",
      korteLabel: "Planning",
      status: "niet_gestart",
      tab: "uitvoering",
    },
    {
      id: "uitvoering",
      label: "Uitvoering",
      korteLabel: "Uitv.",
      status: "niet_gestart",
      tab: "uitvoering",
    },
    {
      id: "oplevering",
      label: "Oplevering",
      korteLabel: "Oplev.",
      status: gebouw.gereed_op ? "gereed" : "niet_gestart",
      tab: "rapporten",
    },
    {
      id: "facturatie",
      label: "Facturatie",
      korteLabel: "Factuur",
      status:
        facturen.length > 0 && facturen.some((f) => f.status === "betaald")
          ? "gereed"
          : facturen.length > 0
            ? "bezig"
            : "niet_gestart",
      tab: "facturen",
    },
    {
      id: "onderhoud",
      label: "Onderhoud",
      korteLabel: "Onderh.",
      status: "niet_gestart",
      tab: "beheer",
    },
  ];
}

function faseKleur(status: FaseStatus) {
  switch (status) {
    case "gereed":
      return {
        ring: "border-green-400 bg-green-50",
        getal: "bg-green-500 text-white",
        label: "text-green-800",
        badge: "bg-green-100 text-green-700 border-green-300",
      };
    case "bezig":
      return {
        ring: "border-primary/40 bg-primary/5",
        getal: "bg-primary text-white",
        label: "text-primary",
        badge: "bg-primary/10 text-primary border-primary/30",
      };
    case "aandacht":
      return {
        ring: "border-amber-400 bg-amber-50",
        getal: "bg-amber-500 text-white",
        label: "text-amber-800",
        badge: "bg-amber-100 text-amber-700 border-amber-300",
      };
    default:
      return {
        ring: "border-slate-200 bg-slate-50",
        getal: "bg-slate-200 text-slate-500",
        label: "text-slate-400",
        badge: "bg-slate-100 text-slate-500 border-slate-200",
      };
  }
}

function FaseStap({
  fase,
  index,
  isLaatste,
  onClick,
}: {
  fase: Fase;
  index: number;
  isLaatste: boolean;
  onClick: () => void;
}) {
  const kl = faseKleur(fase.status);

  return (
    <div className="flex items-center gap-0 shrink-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg border transition-colors hover:bg-slate-100 ${kl.ring} min-w-[3.5rem]`}
          >
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${kl.getal}`}
            >
              {fase.status === "gereed" ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                index + 1
              )}
            </div>
            <span className={`text-[10px] font-medium leading-tight text-center ${kl.label}`}>
              {fase.korteLabel}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {fase.label} —{" "}
          {fase.status === "gereed"
            ? "Gereed"
            : fase.status === "bezig"
              ? "Bezig"
              : fase.status === "aandacht"
                ? "Aandacht nodig"
                : "Nog niet gestart"}
        </TooltipContent>
      </Tooltip>
      {!isLaatste && (
        <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0 -mx-0.5" />
      )}
    </div>
  );
}

function GezondheidBadge({ score }: { score: "groen" | "oranje" | "rood" | "grijs" }) {
  if (score === "groen")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 text-green-800 border border-green-300 px-3 py-1 text-sm font-medium">
        <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
        Onder controle
      </span>
    );
  if (score === "oranje")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 px-3 py-1 text-sm font-medium">
        <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
        Aandacht nodig
      </span>
    );
  if (score === "rood")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 text-red-800 border border-red-300 px-3 py-1 text-sm font-medium">
        <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
        Risico
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 px-3 py-1 text-sm font-medium">
      <span className="h-2 w-2 rounded-full bg-slate-400 shrink-0" />
      Nieuw project
    </span>
  );
}

function KpiKaart({
  label,
  waarde,
  sublabel,
  icoon,
  trend,
  waarschuwing,
  onClick,
}: {
  label: string;
  waarde: string;
  sublabel?: string;
  icoon: React.ReactNode;
  trend?: "op" | "neer" | null;
  waarschuwing?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`text-left w-full rounded-lg border p-4 transition-colors ${
        onClick ? "hover:bg-slate-50 cursor-pointer" : "cursor-default"
      } ${waarschuwing ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            {label}
          </p>
          <p className="text-xl font-semibold text-slate-900 truncate">{waarde}</p>
          {sublabel && <p className="text-xs text-muted-foreground">{sublabel}</p>}
        </div>
        <div
          className={`shrink-0 rounded-md p-2 ${waarschuwing ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}
        >
          {icoon}
        </div>
      </div>
      {trend === "neer" && (
        <p className="mt-2 flex items-center gap-1 text-xs text-amber-700">
          <TrendingDown className="h-3.5 w-3.5" />
          Onder doelstelling
        </p>
      )}
      {trend === "op" && (
        <p className="mt-2 flex items-center gap-1 text-xs text-green-700">
          <TrendingUp className="h-3.5 w-3.5" />
          Op schema
        </p>
      )}
      {onClick && (
        <p className="mt-2 flex items-center gap-1 text-xs text-primary">
          Bekijken
          <ArrowRight className="h-3 w-3" />
        </p>
      )}
    </button>
  );
}

export function GebouwDashboard({
  gebouw,
  toewijzingen = [],
  gebouwCalcs = [],
  gebouwOffertes = [],
  gebouwOpnames = [],
  gebouwFacturen = [],
  openActiepunten = [],
  onNavigeer,
  isBeheerder,
  heeftFinancieelInzicht,
}: DashboardProps) {
  const projectleider = toewijzingen.find((t) => t.project_rol === "Projectleider");
  const werkvoorbereider = toewijzingen.find((t) => t.project_rol === "Werkvoorbereider");
  const projectAdmin = toewijzingen.find((t) => t.project_rol === "Project-admin");

  const geaccepteerdeOfferte = gebouwOffertes.find((o) => o.status === "geaccepteerd");
  const gewonnenCalc = gebouwCalcs.find((c) => c.status === "gewonnen");
  const heeftOpdracht = !!(geaccepteerdeOfferte || gewonnenCalc);

  const offerteWaarde: number | null =
    geaccepteerdeOfferte?.bedrag_excl_btw != null
      ? Number(geaccepteerdeOfferte.bedrag_excl_btw)
      : gebouwOffertes.length > 0
        ? gebouwOffertes.reduce((s, o) => s + (Number(o.bedrag_excl_btw) || 0), 0)
        : null;

  const calcWaarde: number | null =
    gewonnenCalc?.totaal_na_opslagen != null
      ? Number(gewonnenCalc.totaal_na_opslagen)
      : gebouwCalcs.length > 0
        ? gebouwCalcs.reduce((s, c) => s + (Number(c.totaal_na_opslagen) || 0), 0)
        : null;

  const gefactureerd = gebouwFacturen.reduce(
    (s, f) => s + (Number(f.bedrag_incl_btw) || 0),
    0,
  );
  const aantalSpots = gebouw.stats?.totaal ?? 0;

  const fasen = leidFasenAf(
    gebouwCalcs,
    gebouwOffertes,
    gebouwOpnames,
    gebouwFacturen,
    gebouw,
  );
  const huidigeFase = [...fasen].reverse().find((f) => f.status !== "niet_gestart");

  const gezondheidSignalen: Signaal[] = [];
  if (!projectleider)
    gezondheidSignalen.push({ tekst: "Geen projectleider toegewezen", ernst: "middel", tab: "project" });
  if (!gebouw.adres)
    gezondheidSignalen.push({ tekst: "Gebouwadres ontbreekt", ernst: "laag", tab: "project" });
  if (gebouwCalcs.length === 0 && gebouwOffertes.length === 0 && !gebouw.gereed_op)
    gezondheidSignalen.push({
      tekst: "Nog geen calculatie of offerte aangemaakt",
      ernst: "laag",
      tab: "calculaties",
    });
  if (gebouwOffertes.some((o) => o.status === "verzonden") && !heeftOpdracht)
    gezondheidSignalen.push({
      tekst: "Offerte verzonden — wacht op akkoord klant",
      ernst: "middel",
      tab: "offertes",
    });
  if (
    heeftOpdracht &&
    !fasen.find((f) => f.id === "planning")?.status.startsWith("g") // niet gereed
  )
    gezondheidSignalen.push({
      tekst: "Opdracht ontvangen maar uitvoering niet ingepland",
      ernst: "middel",
      tab: "uitvoering",
    });

  const acties: Signaal[] = [
    ...(openActiepunten ?? []).map((a: any) => ({
      tekst: a.titel ?? a.omschrijving ?? "Open actiepunt",
      ernst: (a.prioriteit === "hoog" ? "hoog" : "middel") as Ernst,
      tab: "beheer",
    })),
    ...gezondheidSignalen,
  ];

  const gezondheidScore: "groen" | "oranje" | "rood" | "grijs" =
    gezondheidSignalen.some((s) => s.ernst === "hoog")
      ? "rood"
      : gezondheidSignalen.some((s) => s.ernst === "middel")
        ? "oranje"
        : gezondheidSignalen.length === 0 &&
            (heeftOpdracht || gebouwCalcs.length > 0 || gebouwOffertes.length > 0)
          ? "groen"
          : "grijs";

  return (
    <div className="space-y-6">
      {/* ── Projectkop ─────────────────────────────────────────── */}
      <Card className="border-slate-200">
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900 truncate">
                  {gebouw.naam}
                </h2>
                {gebouw.projectnummer && (
                  <Badge variant="outline" className="gap-1 text-xs font-mono shrink-0">
                    <Hash className="h-3 w-3" />
                    {gebouw.projectnummer}
                  </Badge>
                )}
                {gebouw.werkmaatschappij && (
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {gebouw.werkmaatschappij}
                  </Badge>
                )}
                <GezondheidBadge score={gezondheidScore} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
                {(gebouw.adres || gebouw.stad) && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {[gebouw.adres, gebouw.stad].filter(Boolean).join(", ")}
                  </span>
                )}
                {projectleider && (
                  <span className="flex items-center gap-1">
                    <ClipboardList className="h-3.5 w-3.5 shrink-0" />
                    PL: {projectleider.naam}
                  </span>
                )}
                {werkvoorbereider && (
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5 shrink-0" />
                    WV: {werkvoorbereider.naam}
                  </span>
                )}
                {gebouw.start_datum && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    Start: {new Date(gebouw.start_datum).toLocaleDateString("nl-NL")}
                  </span>
                )}
                {gebouw.eind_datum && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    Gepland: {new Date(gebouw.eind_datum).toLocaleDateString("nl-NL")}
                  </span>
                )}
                {huidigeFase && (
                  <span className="flex items-center gap-1 font-medium text-primary">
                    <Activity className="h-3.5 w-3.5 shrink-0" />
                    Fase: {huidigeFase.label}
                  </span>
                )}
              </div>
            </div>

            {/* Snelkoppelingen */}
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-8 text-xs"
                onClick={() => onNavigeer("offertes")}
              >
                <Euro className="h-3.5 w-3.5" />
                Offertes
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-8 text-xs"
                onClick={() => onNavigeer("uitvoering")}
              >
                <Wrench className="h-3.5 w-3.5" />
                Uitvoering
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-8 text-xs"
                onClick={() => onNavigeer("facturen")}
              >
                <Receipt className="h-3.5 w-3.5" />
                Facturen
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Voortgangsbalk ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Projectflow
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-0 overflow-x-auto pb-1">
            {fasen.map((fase, i) => (
              <FaseStap
                key={fase.id}
                fase={fase}
                index={i}
                isLaatste={i === fasen.length - 1}
                onClick={() => onNavigeer(fase.tab)}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground border-t pt-3">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500 shrink-0" />
              Gereed
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-primary shrink-0" />
              Bezig
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />
              Aandacht
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300 shrink-0" />
              Niet gestart
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              Klik op een stap om door te navigeren
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Hoofdcontent: financieel + sidebar ─────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* Financieel (links, 2/3) */}
        <div className="xl:col-span-2 space-y-4">
          {heeftFinancieelInzicht && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Euro className="h-4 w-4 text-muted-foreground" />
                  Financieel
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <KpiKaart
                    label={geaccepteerdeOfferte ? "Opdrachtsom" : "Offerte waarde"}
                    waarde={
                      offerteWaarde != null ? EURO_FMT.format(offerteWaarde) : "—"
                    }
                    sublabel={
                      geaccepteerdeOfferte
                        ? "excl. BTW (geaccepteerd)"
                        : gebouwOffertes.length > 0
                          ? `${gebouwOffertes.length} offerte(s) in voorbereiding`
                          : "Nog geen offerte"
                    }
                    icoon={<Euro className="h-4 w-4" />}
                    onClick={() => onNavigeer("offertes")}
                  />
                  <KpiKaart
                    label="Calculatie"
                    waarde={calcWaarde != null ? EURO_FMT.format(calcWaarde) : "—"}
                    sublabel={
                      gewonnenCalc
                        ? "Gewonnen calculatie"
                        : gebouwCalcs.length > 0
                          ? `${gebouwCalcs.length} calculatie(s)`
                          : "Nog geen calculatie"
                    }
                    icoon={<BarChart3 className="h-4 w-4" />}
                    onClick={() => onNavigeer("calculaties")}
                  />
                  <KpiKaart
                    label="Gefactureerd"
                    waarde={gefactureerd > 0 ? EURO_FMT.format(gefactureerd) : "—"}
                    sublabel={
                      gebouwFacturen.length > 0
                        ? `${gebouwFacturen.length} factuur/facturen`
                        : "Nog niet gefactureerd"
                    }
                    icoon={<Receipt className="h-4 w-4" />}
                    onClick={() => onNavigeer("facturen")}
                  />
                  <KpiKaart
                    label="Werkbegroting"
                    waarde="—"
                    sublabel="Nog niet ingevoerd"
                    icoon={<FileText className="h-4 w-4" />}
                  />
                  <KpiKaart
                    label="Actuele marge"
                    waarde="—"
                    sublabel="Beschikbaar na werkbegroting"
                    icoon={<TrendingUp className="h-4 w-4" />}
                  />
                  <KpiKaart
                    label="Onderhanden werk"
                    waarde="—"
                    sublabel="Nog niet berekend"
                    icoon={<Package className="h-4 w-4" />}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Planning & uitvoering */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                Planning & uitvoering
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiKaart
                  label="Spots geregistreerd"
                  waarde={String(aantalSpots)}
                  sublabel={aantalSpots > 0 ? "In dit gebouw" : "Nog geen spots"}
                  icoon={<Building2 className="h-4 w-4" />}
                  onClick={() => onNavigeer("uitvoering")}
                />
                <KpiKaart
                  label="Opnames"
                  waarde={String(gebouwOpnames.length)}
                  sublabel={
                    gebouwOpnames.some((o) => o.status === "gereed")
                      ? "Gereed"
                      : gebouwOpnames.length > 0
                        ? "In uitvoering"
                        : "Nog geen opname"
                  }
                  icoon={<ListChecks className="h-4 w-4" />}
                  onClick={() => onNavigeer("opnames")}
                />
                <KpiKaart
                  label="Geplande uren"
                  waarde="—"
                  sublabel="Nog niet gepland"
                  icoon={<Calendar className="h-4 w-4" />}
                />
                <KpiKaart
                  label="Geboekte uren"
                  waarde="—"
                  sublabel="Nog niet beschikbaar"
                  icoon={<Activity className="h-4 w-4" />}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Rechterzijbalk */}
        <div className="space-y-4">
          {/* Projectgezondheid */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-slate-700">
                  Projectgezondheid
                </CardTitle>
                <GezondheidBadge score={gezondheidScore} />
              </div>
            </CardHeader>
            <CardContent>
              {gezondheidSignalen.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {heeftOpdracht || gebouwCalcs.length > 0
                    ? "Het project loopt goed. Geen bijzonderheden."
                    : "Nog te weinig data om een oordeel te geven."}
                </p>
              ) : (
                <ul className="space-y-2">
                  {gezondheidSignalen.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      {s.ernst === "hoog" ? (
                        <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                      ) : s.ernst === "middel" ? (
                        <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                      )}
                      <span className="text-slate-700">{s.tekst}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Acties & blokkades */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-muted-foreground" />
                Acties & blokkades
                {acties.length > 0 && (
                  <Badge variant="secondary" className="ml-auto">
                    {acties.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {acties.length === 0 ? (
                <p className="text-sm text-muted-foreground">Geen open acties.</p>
              ) : (
                <ul className="space-y-2">
                  {acties.map((a, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => a.tab && onNavigeer(a.tab)}
                        className="w-full text-left flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50 transition-colors text-sm group"
                      >
                        {a.ernst === "hoog" ? (
                          <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                        ) : a.ernst === "middel" ? (
                          <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                        ) : (
                          <Circle className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                        )}
                        <span className="flex-1 text-slate-700">{a.tekst}</span>
                        {a.tab && (
                          <ArrowRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-primary shrink-0 mt-0.5 transition-colors" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Team samenvatting */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                Team
              </CardTitle>
            </CardHeader>
            <CardContent>
              {toewijzingen.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nog geen teamleden toegewezen.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {toewijzingen.slice(0, 6).map((t: any) => (
                    <li key={t.id ?? t.gebruiker_id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-800">{t.naam}</span>
                      {t.project_rol && (
                        <Badge variant="outline" className="text-xs ml-2 shrink-0">
                          {t.project_rol}
                        </Badge>
                      )}
                    </li>
                  ))}
                  {toewijzingen.length > 6 && (
                    <li className="text-xs text-muted-foreground pt-1">
                      +{toewijzingen.length - 6} meer
                    </li>
                  )}
                </ul>
              )}
              <button
                type="button"
                onClick={() => onNavigeer("project")}
                className="mt-3 w-full text-xs text-primary hover:underline text-left"
              >
                Team beheren
              </button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
