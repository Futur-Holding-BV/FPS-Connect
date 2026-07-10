import { useState } from "react";
import { Link } from "wouter";
import { useGetFinancieelMeerjarenoverzicht } from "@workspace/api-client-react";
import type { FinancieelMeerjarenRij } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, TrendingUp, TrendingDown, Minus, Info, AlertTriangle, ShieldCheck, ShieldAlert,
} from "lucide-react";

const eur = (n: number | null | undefined, eenheid: string) => {
  if (n == null) return "—";
  if (eenheid === "EUR") {
    return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
  }
  if (eenheid === "%") return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(n)}%`;
  return new Intl.NumberFormat("nl-NL").format(n);
};

const SIGNAAL_INFO: Record<string, { kleur: string; icoon: React.ReactNode }> = {
  info: { kleur: "bg-sky-50 text-sky-700 border-sky-200", icoon: <Info className="h-4 w-4" /> },
  let_op: { kleur: "bg-amber-50 text-amber-700 border-amber-200", icoon: <AlertTriangle className="h-4 w-4" /> },
  waarschuwing: { kleur: "bg-red-50 text-red-700 border-red-200", icoon: <ShieldAlert className="h-4 w-4" /> },
};

function TrendCel({ rij }: { rij: FinancieelMeerjarenRij }) {
  if (rij.trend_pct == null) return <span className="text-muted-foreground"><Minus className="h-4 w-4" /></span>;
  const positief = rij.trend_pct >= 0;
  return (
    <span className={cn("inline-flex items-center gap-1 font-medium tabular-nums", positief ? "text-emerald-600" : "text-red-600")}>
      {positief ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
      {new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1, signDisplay: "always" }).format(rij.trend_pct)}%
    </span>
  );
}

export default function MeerjarenoverzichtPagina() {
  const [entiteit, setEntiteit] = useState<string>("alle");
  const [geconsolideerd, setGeconsolideerd] = useState(true);

  const { data, isLoading } = useGetFinancieelMeerjarenoverzicht({
    entiteit: entiteit === "alle" ? undefined : entiteit,
    geconsolideerd,
  });

  const boekjaren = data?.boekjaren ?? [];
  const rijen = data?.rijen ?? [];
  const signalen = data?.signalen ?? [];
  const entiteiten = data?.entiteiten ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/financieel/jaarrekeningen"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-2xl font-semibold">Meerjarenoverzicht</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Goedgekeurde kerncijfers per boekjaar — uitsluitend gebaseerd op gevalideerde jaarrekeningen.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Geconsolideerd</span>
            <Switch checked={geconsolideerd} onCheckedChange={setGeconsolideerd} />
          </div>
          {entiteiten.length > 0 && (
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Entiteit</Label>
              <Select value={entiteit} onValueChange={setEntiteit}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle entiteiten</SelectItem>
                  {entiteiten.map((e) => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {signalen.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {signalen.map((s, i) => {
            const info = SIGNAAL_INFO[s.niveau] ?? SIGNAAL_INFO.info;
            return (
              <div key={i} className={cn("flex items-start gap-2 rounded-md border p-3", info.kleur)}>
                <span className="shrink-0 mt-0.5">{info.icoon}</span>
                <div className="text-xs">
                  <div className="font-semibold">Boekjaar {s.boekjaar}</div>
                  <div>{s.bericht}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Kerncijfers per boekjaar
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Laden…</p>
          ) : rijen.length === 0 || boekjaren.length === 0 ? (
            <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
              Nog geen goedgekeurde kerncijfers. Keur eerst kerncijfers goed bij{" "}
              <Link href="/financieel/jaarrekeningen" className="text-primary underline">Jaarrekeningen</Link>.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kerncijfer</TableHead>
                  {boekjaren.map((jaar) => (
                    <TableHead key={jaar} className="text-right tabular-nums">{jaar}</TableHead>
                  ))}
                  <TableHead className="text-right">Trend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rijen.map((rij) => (
                  <TableRow key={rij.sleutel}>
                    <TableCell>
                      <div className="font-medium text-sm">{rij.label}</div>
                      {rij.eenheid && rij.eenheid !== "EUR" && (
                        <Badge variant="secondary" className="text-[10px] mt-0.5">{rij.eenheid}</Badge>
                      )}
                    </TableCell>
                    {boekjaren.map((jaar) => (
                      <TableCell key={jaar} className="text-right tabular-nums">
                        {eur(rij.waarden[String(jaar)] ?? null, rij.eenheid)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      <TrendCel rij={rij} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
