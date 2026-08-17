import { useState } from "react";
import { Link } from "wouter";
import { useGetJarrekeningOnderhandenWerk } from "@workspace/api-client-react";
import type { OnderhandenWerkItem } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ArrowLeft, BookOpen } from "lucide-react";
import { PaginaHulp } from "@/components/pagina-hulp";

const eur = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const METHODE_LABELS: Record<string, string> = {
  percentage_gereed: "% gereed",
  werkelijke_kosten: "Werkelijke kosten",
  handmatig: "Handmatig",
  ai_voorstel: "AI-voorstel",
};

const huidigJaar = new Date().getFullYear();
const jaren = Array.from({ length: 5 }, (_, i) => huidigJaar - i);

export default function JarrekeningPagina() {
  const [jaar, setJaar] = useState(String(huidigJaar - 1));

  const peildatum = `${jaar}-12-31`;

  const { data, isLoading } = useGetJarrekeningOnderhandenWerk({ peildatum });

  const items: OnderhandenWerkItem[] = data?.items ?? [];
  const totalen = data?.totalen;

  const metSignalering = items.filter((i) => i.signaleringen.length > 0);

  return (
    <div className="space-y-6 p-6">
      <PaginaHulp pagina="jaarrekening" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/financieel/onderhanden-werk">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-muted-foreground" />
              <h1 data-paginatitel className="text-2xl font-semibold">Jaarrekening — OHW</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Onderhanden werk per 31 december — balanspost voor de jaarrekening.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Label className="text-sm">Jaar</Label>
          <Select value={jaar} onValueChange={setJaar}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {jaren.map((j) => (
                <SelectItem key={j} value={String(j)}>{j}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">Peildatum: 31-12-{jaar}</span>
        </div>
      </div>

      {/* Totaalsamenvatting */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-700">Balanspost OHW</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-800">{eur(totalen?.totaal_waarde_ohw)}</p>
            <p className="text-xs text-orange-600 mt-1">{totalen?.aantal_projecten ?? 0} projecten</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Totaal opdrachtsom</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{eur(totalen?.totaal_opdrachtsom)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Gefactureerd t/m 31-12</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{eur(totalen?.totaal_gefactureerd)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Nog te factureren: {eur(totalen?.totaal_nog_te_factureren)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Geboekte kosten</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{eur(totalen?.totaal_geboekte_kosten)}</p>
            {(totalen?.aantal_met_signalering ?? 0) > 0 && (
              <div className="flex items-center gap-1 mt-1">
                <AlertTriangle className="h-3 w-3 text-amber-500" />
                <span className="text-xs text-amber-600">{totalen?.aantal_met_signalering} met signalering</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Signaleringen sectie */}
      {metSignalering.length > 0 && (
        <div className="border border-amber-200 rounded-lg p-4 bg-amber-50">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="font-medium text-amber-800">
              {metSignalering.length} project{metSignalering.length !== 1 ? "en" : ""} met aandachtspunten
            </span>
          </div>
          <div className="space-y-2">
            {metSignalering.map((item) => (
              <div key={item.opdracht_id} className="flex items-start gap-3 text-sm">
                <span className="font-medium text-amber-900 min-w-0 shrink-0">{item.titel}</span>
                <div className="flex flex-wrap gap-1">
                  {item.signaleringen.map((s) => (
                    <Badge key={s} variant="outline" className="text-xs border-amber-300 text-amber-700 bg-white">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detailtabel */}
      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead className="text-right">Opdrachtsom</TableHead>
              <TableHead className="text-right">Geboekte kosten</TableHead>
              <TableHead className="text-right">Uren</TableHead>
              <TableHead className="text-right">Gefactureerd</TableHead>
              <TableHead className="text-right">Voortgang</TableHead>
              <TableHead className="text-right font-semibold">OHW waarde</TableHead>
              <TableHead>Methode</TableHead>
              <TableHead>Opmerkingen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  Laden...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  Geen onderhanden werk gevonden per 31-12-{jaar}.
                </TableCell>
              </TableRow>
            )}
            {items.map((item) => (
              <TableRow key={item.opdracht_id}>
                <TableCell>
                  <div>
                    <p className="font-medium text-sm">{item.titel}</p>
                    {item.werknummer && (
                      <p className="text-xs text-muted-foreground">{item.werknummer}</p>
                    )}
                    {item.opdrachtgever && (
                      <p className="text-xs text-muted-foreground">{item.opdrachtgever}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right text-sm">{eur(item.opdrachtsom)}</TableCell>
                <TableCell className="text-right text-sm">{eur(item.geboekte_kosten_inkoop)}</TableCell>
                <TableCell className="text-right text-sm">
                  {item.geboekte_uren > 0 ? `${item.geboekte_uren.toFixed(1)} u` : "—"}
                </TableCell>
                <TableCell className="text-right text-sm">{eur(item.gefactureerd)}</TableCell>
                <TableCell className="text-right text-sm">
                  {item.percentage_gereed != null ? `${item.percentage_gereed.toFixed(0)}%` : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-semibold text-orange-700">
                    {eur(item.waarde_ohw)}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {METHODE_LABELS[item.waarderingsmethode] ?? item.waarderingsmethode}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-40 truncate">
                  {item.opmerkingen ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Accountantstoelichting */}
      <div className="border rounded-lg p-4 bg-muted/30">
        <p className="text-xs font-medium text-muted-foreground mb-1">Toelichting voor accountant</p>
        <p className="text-sm text-muted-foreground">
          Onderhanden werk per 31-12-{jaar}: {eur(totalen?.totaal_waarde_ohw)} — vertegenwoordigt de
          geleverde maar nog niet gefactureerde prestatie op actieve projecten.
          Berekend op basis van opgegeven voortgangspercentages per project.
          Bron: FPS Connect, peildatum {peildatum}.
        </p>
      </div>
    </div>
  );
}
