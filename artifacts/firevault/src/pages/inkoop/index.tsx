import { useState } from "react";
import { useLocation } from "wouter";
import { useListInkoopoverzicht } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShoppingCart, ExternalLink, Search } from "lucide-react";
import { PaginaHulp } from "@/components/pagina-hulp";

const statusLabel: Record<string, string> = {
  concept: "Concept",
  ingediend: "Ingediend",
  verzonden: "Verzonden",
  bevestigd: "Bevestigd",
  geleverd: "Geleverd",
  geannuleerd: "Geannuleerd",
};

const statusKleur: Record<string, string> = {
  concept: "bg-gray-100 text-gray-700 border-gray-200",
  ingediend: "bg-blue-50 text-blue-700 border-blue-200",
  verzonden: "bg-orange-50 text-orange-700 border-orange-200",
  bevestigd: "bg-purple-50 text-purple-700 border-purple-200",
  geleverd: "bg-green-50 text-green-700 border-green-200",
  geannuleerd: "bg-red-50 text-red-700 border-red-200",
};

function formatBedrag(bedrag: number | null | undefined) {
  if (bedrag == null) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(bedrag);
}

function formatDatum(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("nl-NL");
}

export default function InkoopOverzicht() {
  const [, navigate] = useLocation();
  const [filterStatus, setFilterStatus] = useState("alle");
  const [filterLeverancier, setFilterLeverancier] = useState("");
  const [filterVan, setFilterVan] = useState("");
  const [filterTot, setFilterTot] = useState("");

  const params: Record<string, string | number> = {};
  if (filterStatus && filterStatus !== "alle") params.status = filterStatus;
  if (filterLeverancier) params.leverancier = filterLeverancier;
  if (filterVan) params.van = filterVan;
  if (filterTot) params.tot = filterTot;

  const { data: bonnen, isLoading } = useListInkoopoverzicht(params);

  const totaalBedrag = bonnen?.reduce((sum, b) => sum + (b.totaal_bedrag ?? 0), 0) ?? 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <PaginaHulp pagina="inkoop-overzicht" />
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 data-paginatitel className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart className="h-6 w-6" />
            Inkoopoverzicht
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Alle inkoopbonnen over alle opdrachten
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Search className="h-4 w-4" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle statussen</SelectItem>
                  {Object.entries(statusLabel).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Leverancier</Label>
              <Input
                placeholder="Zoek op naam..."
                value={filterLeverancier}
                onChange={(e) => setFilterLeverancier(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Van datum</Label>
              <Input
                type="date"
                value={filterVan}
                onChange={(e) => setFilterVan(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tot datum</Label>
              <Input
                type="date"
                value={filterTot}
                onChange={(e) => setFilterTot(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{bonnen?.length ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">Inkoopbonnen</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{formatBedrag(totaalBedrag)}</div>
            <div className="text-xs text-muted-foreground mt-1">Totaalbedrag</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {bonnen?.filter((b) => b.status === "verzonden").length ?? 0}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Openstaand bij leverancier</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {bonnen?.filter((b) => b.status === "geleverd").length ?? 0}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Ontvangen</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : !bonnen || bonnen.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Geen inkoopbonnen gevonden.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nummer</TableHead>
                  <TableHead>Opdracht</TableHead>
                  <TableHead>Leverancier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Bedrag</TableHead>
                  <TableHead>Leverdatum</TableHead>
                  <TableHead>Aangemaakt</TableHead>
                  <TableHead>Regels</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {bonnen.map((bon) => (
                  <TableRow key={bon.id}>
                    <TableCell>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {bon.kenmerk && (
                          <span
                            className="font-mono text-xs font-semibold tracking-wide text-muted-foreground bg-muted border border-border rounded px-1.5 py-0.5 select-all"
                            title="Kenmerk (automatisch berekend, niet bewerkbaar)"
                          >
                            {bon.kenmerk}
                          </span>
                        )}
                        <span className="font-mono text-sm">{bon.bon_nummer ?? `#${bon.id}`}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{bon.opdracht_nummer ?? "—"}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                        {bon.opdracht_titel ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{bon.leverancier}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusKleur[bon.status] ?? ""}>
                        {statusLabel[bon.status] ?? bon.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {formatBedrag(bon.totaal_bedrag)}
                    </TableCell>
                    <TableCell className="text-sm">{formatDatum(bon.gewenste_leverdatum)}</TableCell>
                    <TableCell className="text-sm">{formatDatum(bon.aangemaakt_op)}</TableCell>
                    <TableCell className="text-center text-sm">{bon.aantal_regels}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/opdrachten/${bon.opdracht_id}?tab=inkoop`)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
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
