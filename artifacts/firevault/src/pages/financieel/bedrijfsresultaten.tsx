import { useState, useMemo } from "react";
import { Link } from "wouter";
import {
  useListOnderhandenWerk,
  useGetFinancieelDashboard,
} from "@workspace/api-client-react";
import type { OnderhandenWerkItem } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BarChart3, TrendingUp, TrendingDown, AlertTriangle, Euro,
  Receipt, ArrowUpRight, ExternalLink, Search, ChevronUp, ChevronDown,
} from "lucide-react";
import { PaginaHulp } from "@/components/pagina-hulp";

const eur = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const pctFmt = (n: number | null | undefined) =>
  n == null ? "—" : `${n.toFixed(0)}%`;

const SIGNAAL_LABEL: Record<string, { tekst: string; kleur: string }> = {
  marge_negatief:        { tekst: "Negatieve marge",       kleur: "bg-rose-100 text-rose-700 border-rose-200" },
  marge_laag:            { tekst: "Lage marge (<10%)",     kleur: "bg-amber-100 text-amber-700 border-amber-200" },
  ohw_hoog:              { tekst: "Hoog OHW",              kleur: "bg-amber-100 text-amber-700 border-amber-200" },
  nog_te_factureren:     { tekst: "Nog te factureren",     kleur: "bg-sky-100 text-sky-700 border-sky-200" },
  overplanning:          { tekst: "Overplanning uren",     kleur: "bg-purple-100 text-purple-700 border-purple-200" },
};

type SorteerVeld = "titel" | "opdrachtsom" | "gefactureerd" | "nog_te_factureren" | "actuele_marge" | "waarde_ohw";

function KpiKaart({
  label, waarde, sub, icoon: Icoon, accent,
}: {
  label: string;
  waarde: string;
  sub?: string;
  icoon: React.ElementType;
  accent?: "amber" | "red" | "green";
}) {
  const ringKleur = accent === "amber" ? "ring-amber-300" : accent === "red" ? "ring-rose-300" : accent === "green" ? "ring-emerald-300" : "";
  return (
    <Card className={ringKleur ? `ring-2 ${ringKleur}` : undefined}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
          <Icoon className={`h-4 w-4 ${accent === "amber" ? "text-amber-500" : accent === "red" ? "text-rose-500" : accent === "green" ? "text-emerald-500" : "text-muted-foreground"}`} />
        </div>
        <p className="text-2xl font-bold mt-1 tabular-nums">{waarde}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function MargeIndicator({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="text-muted-foreground text-xs">—</span>;
  const kleur = pct < 0 ? "text-rose-700 font-bold" : pct < 10 ? "text-amber-700 font-medium" : "text-emerald-700 font-medium";
  const Icoon = pct >= 10 ? TrendingUp : TrendingDown;
  return (
    <span className={`flex items-center gap-0.5 tabular-nums ${kleur}`}>
      <Icoon className="h-3.5 w-3.5 shrink-0" />
      {pctFmt(pct)}
    </span>
  );
}

export default function BedrijfsresultatenPagina() {
  const [zoek, setZoek] = useState("");
  const [statusFilter, setStatusFilter] = useState("actief");
  const [sortVeld, setSortVeld] = useState<SorteerVeld>("opdrachtsom");
  const [sortRichting, setSortRichting] = useState<"asc" | "desc">("desc");

  const { data: items = [], isLoading } = useListOnderhandenWerk(
    { status: statusFilter !== "alle" ? statusFilter : undefined },
    { query: { queryKey: ["ohw-bedrijfsresultaten", statusFilter] } }
  );
  const { data: facturenStats } = useGetFinancieelDashboard();

  const gefilterd = useMemo(() => {
    let lijst = items as OnderhandenWerkItem[];
    if (zoek.trim()) {
      const z = zoek.toLowerCase();
      lijst = lijst.filter((it) =>
        it.titel.toLowerCase().includes(z) ||
        (it.opdrachtgever ?? "").toLowerCase().includes(z) ||
        (it.werknummer ?? "").toLowerCase().includes(z) ||
        (it.gebouw_naam ?? "").toLowerCase().includes(z)
      );
    }
    return [...lijst].sort((a, b) => {
      const va = a[sortVeld] ?? 0;
      const vb = b[sortVeld] ?? 0;
      if (typeof va === "string" && typeof vb === "string") {
        return sortRichting === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortRichting === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }, [items, zoek, sortVeld, sortRichting]);

  const totalen = useMemo(() => {
    const lijst = items as OnderhandenWerkItem[];
    const opdrachtsom = lijst.reduce((s, it) => s + (it.opdrachtsom ?? 0), 0);
    const gefactureerd = lijst.reduce((s, it) => s + it.gefactureerd, 0);
    const ohw = lijst.reduce((s, it) => s + it.waarde_ohw, 0);
    const metMarge = lijst.filter((it) => it.actuele_marge != null);
    const gemMarge = metMarge.length > 0
      ? metMarge.reduce((s, it) => s + (it.actuele_marge ?? 0), 0) / metMarge.length
      : null;
    const signaleringen = lijst.flatMap((it) => it.signaleringen ?? []);
    return { opdrachtsom, gefactureerd, ohw, gemMarge, aantalSignaleringen: signaleringen.length };
  }, [items]);

  const metSignaleringen = useMemo(() =>
    (items as OnderhandenWerkItem[]).filter((it) => (it.signaleringen ?? []).length > 0),
    [items]
  );

  function toggleSort(veld: SorteerVeld) {
    if (sortVeld === veld) setSortRichting((r) => r === "asc" ? "desc" : "asc");
    else { setSortVeld(veld); setSortRichting("desc"); }
  }

  function SortKop({ veld, label, klasse }: { veld: SorteerVeld; label: string; klasse?: string }) {
    const actief = sortVeld === veld;
    return (
      <th
        className={`py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide cursor-pointer select-none hover:text-slate-700 transition-colors ${klasse ?? ""}`}
        onClick={() => toggleSort(veld)}
      >
        <span className="flex items-center gap-1 justify-end">
          {label}
          {actief ? (
            sortRichting === "desc"
              ? <ChevronDown className="h-3 w-3" />
              : <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3 opacity-30" />
          )}
        </span>
      </th>
    );
  }

  return (
    <div className="space-y-6">
      <PaginaHulp pagina="bedrijfsresultaten" />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bedrijfsresultaten</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Financieel overzicht per opdracht — opdrachtsom, facturering, marge en onderhanden werk.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" asChild>
            <Link href="/financieel/onderhanden-werk">
              <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
              OHW detail
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/facturen/dashboard">
              <Receipt className="h-3.5 w-3.5 mr-1.5" />
              Facturatie
            </Link>
          </Button>
        </div>
      </div>

      {/* ── KPI-kaarten ────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiKaart
            label="Totale opdrachtsom"
            waarde={eur(totalen.opdrachtsom)}
            sub={`${(items as OnderhandenWerkItem[]).length} opdrachten`}
            icoon={Euro}
          />
          <KpiKaart
            label="Gefactureerd"
            waarde={eur(totalen.gefactureerd)}
            sub={totalen.opdrachtsom > 0 ? `${Math.round(totalen.gefactureerd / totalen.opdrachtsom * 100)}% van opdrachtsom` : undefined}
            icoon={ArrowUpRight}
            accent={totalen.gefactureerd > 0 ? "green" : undefined}
          />
          <KpiKaart
            label="Onderhanden werk"
            waarde={eur(totalen.ohw)}
            sub="Nog niet verantwoord"
            icoon={Receipt}
            accent={totalen.ohw > 50000 ? "amber" : undefined}
          />
          <KpiKaart
            label="Gem. marge"
            waarde={totalen.gemMarge != null ? pctFmt(totalen.gemMarge) : "—"}
            sub={`${metSignaleringen.length} signalering${metSignaleringen.length !== 1 ? "en" : ""}`}
            icoon={totalen.gemMarge != null && totalen.gemMarge >= 10 ? TrendingUp : TrendingDown}
            accent={totalen.gemMarge != null && totalen.gemMarge < 0 ? "red" : totalen.gemMarge != null && totalen.gemMarge < 10 ? "amber" : undefined}
          />
        </div>
      )}

      {/* Facturen-kpi aanvullend */}
      {facturenStats && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Klaar voor export", waarde: String(facturenStats.klaar_voor_export), href: "/facturen/klaar-voor-export", accent: facturenStats.klaar_voor_export > 0 ? "amber" as const : undefined },
            { label: "Open bedrag (facturen)", waarde: facturenStats.open_bedrag, href: "/facturen", accent: undefined },
            { label: "Exportfouten open", waarde: String(facturenStats.export_fouten_open), href: "/facturen?status=fout_bij_verzending", accent: facturenStats.export_fouten_open > 0 ? "red" as const : undefined },
          ].map(({ label, waarde, href, accent }) => (
            <Link key={label} href={href}>
              <div className={`rounded-lg border px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer flex items-center justify-between ${accent === "amber" ? "border-amber-200 bg-amber-50/50" : accent === "red" ? "border-rose-200 bg-rose-50/50" : ""}`}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm font-semibold ${accent === "amber" ? "text-amber-700" : accent === "red" ? "text-rose-700" : "text-slate-800"}`}>{waarde}</span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* ── Signaleringen ───────────────────────────────────────────────── */}
      {metSignaleringen.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <CardTitle className="text-sm font-semibold text-amber-800">
                Signaleringen — {metSignaleringen.length} opdracht{metSignaleringen.length !== 1 ? "en" : ""} vereist{metSignaleringen.length !== 1 ? "en" : ""} aandacht
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pb-4 space-y-2">
            {metSignaleringen.map((it) => (
              <div key={it.opdracht_id} className="flex items-start gap-3 rounded-md bg-white border border-amber-100 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <Link href={`/opdrachten/${it.opdracht_id}`}>
                    <p className="text-sm font-medium text-slate-800 hover:text-primary hover:underline truncate">{it.titel}</p>
                  </Link>
                  {it.opdrachtgever && <p className="text-xs text-muted-foreground">{it.opdrachtgever}</p>}
                </div>
                <div className="flex flex-wrap gap-1 justify-end shrink-0">
                  {(it.signaleringen ?? []).map((s) => {
                    const info = SIGNAAL_LABEL[s] ?? { tekst: s, kleur: "bg-slate-100 text-slate-600 border-slate-200" };
                    return (
                      <Badge key={s} variant="outline" className={`text-[10px] ${info.kleur}`}>{info.tekst}</Badge>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Projecttabel ────────────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3 pt-4">
          <div className="flex items-center gap-3 flex-wrap">
            <CardTitle className="text-sm font-semibold flex-1">Projectoverzicht</CardTitle>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-xs w-56"
                placeholder="Zoek opdracht, opdrachtgever..."
                value={zoek}
                onChange={(e) => setZoek(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="actief">Actief</SelectItem>
                <SelectItem value="afgerond">Afgerond</SelectItem>
                <SelectItem value="alle">Alle statussen</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : gefilterd.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-20" />
              {zoek ? "Geen opdrachten gevonden voor dit zoekterm." : "Geen opdrachten beschikbaar voor dit filter."}
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b bg-slate-50 text-right">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort("titel")}>
                    <span className="flex items-center gap-1">
                      Opdracht / Opdrachtgever
                      {sortVeld === "titel" ? (sortRichting === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronDown className="h-3 w-3 opacity-30" />}
                    </span>
                  </th>
                  <SortKop veld="opdrachtsom" label="Opdrachtsom" klasse="px-3" />
                  <SortKop veld="gefactureerd" label="Gefactureerd" klasse="px-3" />
                  <SortKop veld="nog_te_factureren" label="Te factureren" klasse="px-3" />
                  <SortKop veld="actuele_marge" label="Marge" klasse="px-3" />
                  <SortKop veld="waarde_ohw" label="OHW" klasse="px-4" />
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {gefilterd.map((it) => {
                  const heeftSignaleringen = (it.signaleringen ?? []).length > 0;
                  return (
                    <tr key={it.opdracht_id} className={`hover:bg-slate-50/40 transition-colors ${heeftSignaleringen ? "bg-amber-50/20" : ""}`}>
                      <td className="px-4 py-3 min-w-56">
                        <div className="flex items-center gap-1.5">
                          {heeftSignaleringen && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                          <div>
                            <Link href={`/opdrachten/${it.opdracht_id}`}>
                              <p className="text-sm font-medium text-slate-800 hover:text-primary hover:underline truncate max-w-72">{it.titel}</p>
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {it.opdrachtgever ?? it.gebouw_naam ?? it.werknummer ?? "—"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-sm tabular-nums text-slate-700">{eur(it.opdrachtsom)}</td>
                      <td className="px-3 py-3 text-right text-sm tabular-nums text-slate-700">{eur(it.gefactureerd)}</td>
                      <td className={`px-3 py-3 text-right text-sm tabular-nums ${it.nog_te_factureren > 0 ? "text-sky-700 font-medium" : "text-muted-foreground"}`}>
                        {it.nog_te_factureren > 0 ? eur(it.nog_te_factureren) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <MargeIndicator pct={it.actuele_marge ?? it.verwachte_marge_pct} />
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums">
                        <span className={it.waarde_ohw > 0 ? "text-slate-700" : "text-muted-foreground"}>
                          {it.waarde_ohw > 0 ? eur(it.waarde_ohw) : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="outline" className={`text-[10px] capitalize ${it.opdracht_status === "actief" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : it.opdracht_status === "afgerond" ? "bg-slate-100 text-slate-600 border-slate-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                          {it.opdracht_status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {gefilterd.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-slate-50/80 font-semibold text-sm">
                    <td className="px-4 py-3 text-xs text-muted-foreground">{gefilterd.length} opdracht{gefilterd.length !== 1 ? "en" : ""}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{eur(gefilterd.reduce((s, it) => s + (it.opdrachtsom ?? 0), 0))}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{eur(gefilterd.reduce((s, it) => s + it.gefactureerd, 0))}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{eur(gefilterd.reduce((s, it) => s + it.nog_te_factureren, 0))}</td>
                    <td className="px-3 py-3 text-right">
                      <MargeIndicator pct={(() => { const m = gefilterd.filter((it) => it.actuele_marge != null); return m.length > 0 ? m.reduce((s, it) => s + (it.actuele_marge ?? 0), 0) / m.length : null; })()} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{eur(gefilterd.reduce((s, it) => s + it.waarde_ohw, 0))}</td>
                    <td className="px-4 py-3" />
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
