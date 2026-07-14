import { useGetMagazijnVoorraadwaarde, type MagazijnVoorraadwaarde } from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Euro, Tag, Building2, MapPin, AlertCircle, Download } from "lucide-react";
import { Link } from "wouter";

function formatBedrag(n: number) {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatProcent(n: number) {
  return n.toFixed(1) + "%";
}

type Groep = {
  naam: string;
  artikel_aantal: number;
  waarde: number;
  percentage: number;
};

function GroepTabel({ titel, icoon: Icoon, rijen, isLoading }: {
  titel: string;
  icoon: React.ElementType;
  rijen: Groep[];
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icoon className="h-4 w-4 text-muted-foreground" />
          {titel}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left py-2.5 px-4">{titel.replace(" uitsplitsing", "")}</th>
                <th className="text-right py-2.5 px-4">Artikelen</th>
                <th className="text-right py-2.5 px-4">Waarde</th>
                <th className="text-right py-2.5 px-4">% van totaal</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-2.5 px-4" colSpan={4}><Skeleton className="h-4 w-full" /></td>
                  </tr>
                ))
              ) : rijen.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground text-xs">
                    Geen gegevens beschikbaar.
                  </td>
                </tr>
              ) : (
                rijen.map((r) => (
                  <tr key={r.naam} className="border-t hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 px-4 font-medium">{r.naam}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-muted-foreground">{r.artikel_aantal}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums font-semibold">{formatBedrag(r.waarde)}</td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-2 bg-primary/20 rounded-full overflow-hidden w-16 hidden sm:block">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${Math.min(r.percentage, 100)}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-muted-foreground w-12 text-right">{formatProcent(r.percentage)}</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function downloadCsv(data: MagazijnVoorraadwaarde | undefined) {
  if (!data) return;

  const rijen: string[] = [
    "Sectie,Naam,Artikelen,Waarde (EUR),Percentage (%)",
    ...data.per_categorie.map((r) =>
      `Categorie,${csvEscape(r.naam)},${r.artikel_aantal},${r.waarde.toFixed(2)},${r.percentage.toFixed(1)}`
    ),
    ...data.per_leverancier.map((r) =>
      `Leverancier,${csvEscape(r.naam)},${r.artikel_aantal},${r.waarde.toFixed(2)},${r.percentage.toFixed(1)}`
    ),
    ...data.per_locatie.map((r) =>
      `Locatie,${csvEscape(r.naam)},${r.artikel_aantal},${r.waarde.toFixed(2)},${r.percentage.toFixed(1)}`
    ),
    "",
    "Artikelen zonder inkoopprijs",
    "Artikel,Eenheid,Hoeveelheid,Categorie,Leverancier",
    ...data.onbekende_prijs.map((r) =>
      `${csvEscape(r.naam)},${r.eenheid},${r.hoeveelheid},${csvEscape(r.categorie ?? "")},${csvEscape(r.leverancier_naam ?? "")}`
    ),
  ];

  const blob = new Blob([rijen.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `voorraadwaarde-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(val: string) {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export default function MagazijnVoorraadwaardePagina() {
  const { heeftNiveau } = useBevoegdheid();
  const kanLezen = heeftNiveau("magazijn", 1);
  const { data, isLoading } = useGetMagazijnVoorraadwaarde();

  if (!kanLezen) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Geen toegang tot magazijn.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Voorraadwaarde</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Totale inkoopwaarde van de huidige voorraad, uitgesplitst per categorie, leverancier en locatie.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadCsv(data)}
            disabled={!data || isLoading}
          >
            <Download className="h-4 w-4 mr-2" />
            Exporteren als CSV
          </Button>
          <Link href="/magazijn">
            <Button variant="ghost" size="sm">Terug naar dashboard</Button>
          </Link>
        </div>
      </div>

      {/* Totaalkaart */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-4 rounded-xl bg-primary/10 text-primary">
              <Euro className="h-8 w-8" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Totale voorraadwaarde</p>
              {isLoading ? (
                <Skeleton className="h-9 w-40 mt-1" />
              ) : (
                <p className="text-3xl font-bold">{formatBedrag(data?.totaal_waarde ?? 0)}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Op basis van inkoopprijs (gemiddeld indien beschikbaar)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Drie uitsplitsingstabellen */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <GroepTabel
          titel="Per categorie"
          icoon={Tag}
          rijen={data?.per_categorie ?? []}
          isLoading={isLoading}
        />
        <GroepTabel
          titel="Per leverancier"
          icoon={Building2}
          rijen={data?.per_leverancier ?? []}
          isLoading={isLoading}
        />
        <GroepTabel
          titel="Per locatie"
          icoon={MapPin}
          rijen={data?.per_locatie ?? []}
          isLoading={isLoading}
        />
      </div>

      {/* Artikelen zonder inkoopprijs */}
      {(isLoading || (data?.onbekende_prijs?.length ?? 0) > 0) && (
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              Artikelen zonder inkoopprijs
              {!isLoading && (
                <Badge className="bg-amber-100 text-amber-700 ml-1">
                  {data!.onbekende_prijs.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left py-2.5 px-4">Artikel</th>
                    <th className="text-right py-2.5 px-4">Hoeveelheid</th>
                    <th className="text-left py-2.5 px-4">Categorie</th>
                    <th className="text-left py-2.5 px-4">Leverancier</th>
                    <th className="text-left py-2.5 px-4">Actie</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i} className="border-t">
                        <td className="py-2.5 px-4" colSpan={5}><Skeleton className="h-4 w-full" /></td>
                      </tr>
                    ))
                  ) : (
                    data!.onbekende_prijs.map((a) => (
                      <tr key={a.artikel_id} className="border-t hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 px-4 font-medium">{a.naam}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums">{a.hoeveelheid} {a.eenheid}</td>
                        <td className="py-2.5 px-4 text-muted-foreground">{a.categorie ?? "—"}</td>
                        <td className="py-2.5 px-4 text-muted-foreground">{a.leverancier_naam ?? "—"}</td>
                        <td className="py-2.5 px-4">
                          <Link
                            href={`/magazijn/artikelen/${a.artikel_id}`}
                            className="text-primary hover:underline text-xs"
                          >
                            Prijs aanvullen
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
