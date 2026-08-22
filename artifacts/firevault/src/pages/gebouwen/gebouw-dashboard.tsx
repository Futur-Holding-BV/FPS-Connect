import { Link } from "wouter";
import { GebouwPublicatieKaart } from "@/components/gebouw-publicatie-kaart";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Calendar,
  Users,
  ClipboardList,
  Scale,
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
import { GebouwProcessOverzicht } from "@/components/gebouw-process-overzicht";

const EURO_FMT = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

type Ernst = "laag" | "middel" | "hoog";

interface Signaal {
  tekst: string;
  ernst: Ernst;
  tab?: string;
}

interface ProjectFinancien {
  aantalOpdrachten: number;
  opdrachtsom: number | null;
  gefactureerd: number | null;
  nogTeFactureren: number | null;
  begroteKosten: number | null;
  waardeOhw: number | null;
  margeEuro: number | null;
  margePct: number | null;
}

interface DashboardProps {
  gebouw: any;
  toewijzingen: any[];
  canoniekeProjectleider?: { medewerkerId: number; naam: string } | null;
  projectleiderLaden?: boolean;
  gebouwCalcs: any[];
  gebouwOffertes: any[];
  gebouwOpnames: any[];
  gebouwFacturen: any[];
  gebouwOpdrachten?: any[];
  gebouwDocumenten?: any[];
  financien?: ProjectFinancien | null;
  meerMinderwerkAantal?: number;
  openActiepunten: any[];
  onNavigeer: (tab: string) => void;
  isBeheerder: boolean;
  heeftFinancieelInzicht: boolean;
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

function DossierRegel({
  label,
  aantal,
  icoon,
  onClick,
}: {
  label: string;
  aantal: number;
  icoon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-slate-50"
    >
      <span className="shrink-0 rounded-md bg-slate-100 p-1.5 text-slate-500">
        {icoon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-slate-700">
          {label}
        </span>
        <span className="text-sm font-semibold text-slate-900">{aantal}</span>
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-colors group-hover:text-primary" />
    </button>
  );
}

export function GebouwDashboard({
  gebouw,
  toewijzingen = [],
  canoniekeProjectleider = null,
  projectleiderLaden = false,
  gebouwCalcs = [],
  gebouwOffertes = [],
  gebouwOpnames = [],
  gebouwFacturen = [],
  gebouwOpdrachten = [],
  gebouwDocumenten = [],
  financien = null,
  meerMinderwerkAantal = 0,
  openActiepunten = [],
  onNavigeer,
  isBeheerder,
  heeftFinancieelInzicht,
}: DashboardProps) {
  const projectleider = canoniekeProjectleider;
  const overigeToewijzingen = toewijzingen.filter(
    (toewijzing) => toewijzing.project_rol !== "Projectleider",
  );

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

  const gezondheidSignalen: Signaal[] = [];
  if (!projectleiderLaden && !projectleider)
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
  if (heeftOpdracht && gebouwOpdrachten.length === 0)
    gezondheidSignalen.push({
      tekst: "Opdracht geaccepteerd, maar nog geen werkmap gestart",
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

  const financialMetrics = [
    {
      label: financien?.opdrachtsom != null ? "Opdrachtsom" : geaccepteerdeOfferte ? "Opdrachtsom" : "Offerte waarde",
      value: financien?.opdrachtsom != null ? EURO_FMT.format(financien.opdrachtsom) : offerteWaarde != null ? EURO_FMT.format(offerteWaarde) : "—",
      subtext: financien?.opdrachtsom != null ? "excl. BTW" : geaccepteerdeOfferte ? "geaccepteerd" : gebouwOffertes.length > 0 ? "in voorbereiding" : undefined
    },
    {
      label: "Gefactureerd",
      value: gefactureerd > 0 ? EURO_FMT.format(gefactureerd) : "—",
      subtext: gebouwFacturen.length > 0 ? `${gebouwFacturen.length} facturen` : undefined
    }
  ];

  return (
    <div className="space-y-4">
      <GebouwProcessOverzicht
        gebouwId={gebouw.id}
        financialMetrics={financialMetrics}
      />

      {/* ── Hoofdcontent: financieel + sidebar ─────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* Financieel (links, 2/3) */}
        <div className="xl:col-span-2 space-y-4">
          {/* Projectdossier — centraal overzicht met doorklik */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Projectdossier
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <DossierRegel
                  label="Calculaties"
                  aantal={gebouwCalcs.length}
                  icoon={<BarChart3 className="h-4 w-4" />}
                  onClick={() => onNavigeer("calculaties")}
                />
                <DossierRegel
                  label="Offertes"
                  aantal={gebouwOffertes.length}
                  icoon={<Euro className="h-4 w-4" />}
                  onClick={() => onNavigeer("offertes")}
                />
                <DossierRegel
                  label="Opdrachten"
                  aantal={gebouwOpdrachten.length}
                  icoon={<ClipboardList className="h-4 w-4" />}
                  onClick={() => onNavigeer("opdrachten")}
                />
                <DossierRegel
                  label="Meer-/minderwerk"
                  aantal={meerMinderwerkAantal}
                  icoon={<Scale className="h-4 w-4" />}
                  onClick={() => onNavigeer("meerwerk")}
                />
                <DossierRegel
                  label="Opnames"
                  aantal={gebouwOpnames.length}
                  icoon={<ListChecks className="h-4 w-4" />}
                  onClick={() => onNavigeer("opnames")}
                />
                <DossierRegel
                  label="Documenten"
                  aantal={gebouwDocumenten.length}
                  icoon={<FileText className="h-4 w-4" />}
                  onClick={() => onNavigeer("documenten")}
                />
                <DossierRegel
                  label="Facturen"
                  aantal={gebouwFacturen.length}
                  icoon={<Receipt className="h-4 w-4" />}
                  onClick={() => onNavigeer("facturen")}
                />
                <DossierRegel
                  label="Rapporten"
                  aantal={0}
                  icoon={<FileText className="h-4 w-4" />}
                  onClick={() => onNavigeer("rapporten")}
                />
              </div>
            </CardContent>
          </Card>

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
                    label={
                      financien?.opdrachtsom != null
                        ? "Opdrachtsom"
                        : geaccepteerdeOfferte
                          ? "Opdrachtsom"
                          : "Offerte waarde"
                    }
                    waarde={
                      financien?.opdrachtsom != null
                        ? EURO_FMT.format(financien.opdrachtsom)
                        : offerteWaarde != null
                          ? EURO_FMT.format(offerteWaarde)
                          : "—"
                    }
                    sublabel={
                      financien?.opdrachtsom != null
                        ? `excl. BTW (${financien.aantalOpdrachten} opdracht${financien.aantalOpdrachten === 1 ? "" : "en"})`
                        : geaccepteerdeOfferte
                          ? "excl. BTW (geaccepteerd)"
                          : gebouwOffertes.length > 0
                            ? `${gebouwOffertes.length} offerte(s) in voorbereiding`
                            : "Nog geen offerte"
                    }
                    icoon={<Euro className="h-4 w-4" />}
                    onClick={() =>
                      onNavigeer(
                        financien?.opdrachtsom != null ? "opdrachten" : "offertes",
                      )
                    }
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
                    waarde={
                      financien?.begroteKosten != null
                        ? EURO_FMT.format(financien.begroteKosten)
                        : "—"
                    }
                    sublabel={
                      financien?.begroteKosten != null
                        ? "Begrote kosten"
                        : "Nog niet ingevoerd"
                    }
                    icoon={<FileText className="h-4 w-4" />}
                    onClick={
                      financien?.begroteKosten != null
                        ? () => onNavigeer("opdrachten")
                        : undefined
                    }
                  />
                  <KpiKaart
                    label="Actuele marge"
                    waarde={
                      financien?.margeEuro != null
                        ? EURO_FMT.format(financien.margeEuro)
                        : "—"
                    }
                    sublabel={
                      financien?.margePct != null
                        ? `${financien.margePct.toFixed(1)}% van opdrachtsom`
                        : financien?.margeEuro != null
                          ? "Actuele marge"
                          : "Beschikbaar na werkbegroting"
                    }
                    icoon={<TrendingUp className="h-4 w-4" />}
                    trend={
                      financien?.margeEuro != null
                        ? financien.margeEuro < 0
                          ? "neer"
                          : "op"
                        : null
                    }
                    waarschuwing={
                      financien?.margeEuro != null && financien.margeEuro < 0
                    }
                    onClick={
                      financien?.margeEuro != null
                        ? () => onNavigeer("opdrachten")
                        : undefined
                    }
                  />
                  <KpiKaart
                    label="Onderhanden werk"
                    waarde={
                      financien?.waardeOhw != null
                        ? EURO_FMT.format(financien.waardeOhw)
                        : "—"
                    }
                    sublabel={
                      financien?.waardeOhw != null
                        ? financien?.nogTeFactureren != null
                          ? `Nog te factureren: ${EURO_FMT.format(financien.nogTeFactureren)}`
                          : "Onderhanden werk"
                        : "Nog niet berekend"
                    }
                    icoon={<Package className="h-4 w-4" />}
                    onClick={
                      financien?.waardeOhw != null
                        ? () => onNavigeer("opdrachten")
                        : undefined
                    }
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
                <ul className="space-y-1">
                  {gezondheidSignalen.map((s, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => s.tab && onNavigeer(s.tab)}
                        disabled={!s.tab}
                        className="w-full text-left flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50 transition-colors text-sm group disabled:cursor-default"
                      >
                        {s.ernst === "hoog" ? (
                          <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                        ) : s.ernst === "middel" ? (
                          <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                        ) : (
                          <Circle className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                        )}
                        <span className="flex-1 text-slate-700">{s.tekst}</span>
                        {s.tab && (
                          <ArrowRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-primary shrink-0 mt-0.5 transition-colors" />
                        )}
                      </button>
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
            <CardContent className="space-y-2">
              {projectleider && (
                <div
                  data-testid="projectleider-actueel"
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="font-medium text-slate-800">{projectleider.naam}</span>
                  <Badge variant="outline" className="text-xs shrink-0">
                    Projectleider
                  </Badge>
                </div>
              )}
              {overigeToewijzingen.length === 0 ? (
                projectleider ? null : (
                <p className="text-sm text-muted-foreground">
                  Nog geen teamleden toegewezen.
                </p>
                )
              ) : (
                <ul className="space-y-1.5">
                  {overigeToewijzingen.slice(0, 6).map((t: any) => (
                    <li key={t.id ?? t.gebruiker_id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-800">{t.naam}</span>
                      {t.project_rol && (
                        <Badge variant="outline" className="text-xs ml-2 shrink-0">
                          {t.project_rol}
                        </Badge>
                      )}
                    </li>
                  ))}
                  {overigeToewijzingen.length > 6 && (
                    <li className="text-xs text-muted-foreground pt-1">
                      +{overigeToewijzingen.length - 6} meer
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

          {/* FPS One publicatiestatus */}
          {isBeheerder && (
            <GebouwPublicatieKaart gebouwId={gebouw.id} />
          )}
        </div>
      </div>
    </div>
  );
}
