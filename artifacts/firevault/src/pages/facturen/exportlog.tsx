import { useState } from "react";
import { useListExportlog } from "@workspace/api-client-react";
import type { ExportlogRegel } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "wouter";
import { ScrollText, CheckCircle2, XCircle, Clock, ExternalLink, RefreshCw } from "lucide-react";
import { PaginaHulp } from "@/components/pagina-hulp";

const ACTIES: Record<string, string> = {
  export: "Export",
  herexport: "Herexport",
  sync: "Sync",
  afkeuren: "Afkeuring",
  accorderen: "Accorderen",
};

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "destructive" | "secondary" | "outline" }> = {
  geslaagd: { label: "Geslaagd", variant: "default" },
  mislukt: { label: "Mislukt", variant: "destructive" },
  bezig: { label: "Bezig", variant: "secondary" },
};

export default function ExportlogPagina() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [actieFilter, setActieFilter] = useState<string>("");
  const [zoekterm, setZoekterm] = useState<string>("");

  const { data, isLoading, refetch } = useListExportlog({
    status: statusFilter || undefined,
    actie: actieFilter || undefined,
    limit: 500,
  });

  const regels = (data ?? [] as ExportlogRegel[]).filter((r: ExportlogRegel) => {
    if (!zoekterm) return true;
    const z = zoekterm.toLowerCase();
    return (
      (r.factuurnummer ?? "").toLowerCase().includes(z) ||
      (r.relatienaam ?? "").toLowerCase().includes(z) ||
      (r.gebruiker_naam ?? "").toLowerCase().includes(z) ||
      (r.accountview_boeking_id ?? "").toLowerCase().includes(z)
    );
  });

  function formatTs(iso: string) {
    return new Date(iso).toLocaleString("nl-NL", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PaginaHulp pagina="facturen-exportlog" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ScrollText className="h-6 w-6" />
            Exportlog
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Alle export- en synchronisatiepogingen naar AccountView
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Vernieuwen
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Zoek op factuurnummer, relatienaam..."
          value={zoekterm}
          onChange={(e) => setZoekterm(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter || "alles"} onValueChange={(v) => setStatusFilter(v === "alles" ? "" : v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alles">Alle statussen</SelectItem>
            <SelectItem value="geslaagd">Geslaagd</SelectItem>
            <SelectItem value="mislukt">Mislukt</SelectItem>
            <SelectItem value="bezig">Bezig</SelectItem>
          </SelectContent>
        </Select>
        <Select value={actieFilter || "alles"} onValueChange={(v) => setActieFilter(v === "alles" ? "" : v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Actie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alles">Alle acties</SelectItem>
            <SelectItem value="export">Export</SelectItem>
            <SelectItem value="herexport">Herexport</SelectItem>
            <SelectItem value="sync">Sync</SelectItem>
            <SelectItem value="afkeuren">Afkeuring</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {isLoading ? "Laden..." : `${regels.length} ${regels.length === 1 ? "regel" : "regels"}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tijdstip</TableHead>
                  <TableHead>Actie</TableHead>
                  <TableHead>Factuur</TableHead>
                  <TableHead>Relatie</TableHead>
                  <TableHead>AV-boekingnr</TableHead>
                  <TableHead>HTTP</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Gebruiker</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      Laden...
                    </TableCell>
                  </TableRow>
                ) : regels.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      Geen exportregels gevonden
                    </TableCell>
                  </TableRow>
                ) : (
                  regels.map((r) => {
                    const statusInfo = STATUS_BADGE[r.status] ?? { label: r.status, variant: "outline" as const };
                    const StatusIcon = r.status === "geslaagd" ? CheckCircle2 : r.status === "mislukt" ? XCircle : Clock;
                    return (
                      <TableRow key={r.id} className={r.status === "mislukt" ? "bg-destructive/5" : ""}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatTs(r.export_op)}
                          {r.testmodus && (
                            <Badge variant="outline" className="ml-1 text-xs py-0">test</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{ACTIES[r.actie] ?? r.actie}</span>
                        </TableCell>
                        <TableCell>
                          {r.factuurnummer ? (
                            <Link href={`/facturen/${r.factuur_id}`} className="text-sm font-medium hover:underline">
                              {r.factuurnummer}
                            </Link>
                          ) : (
                            <Link href={`/facturen/${r.factuur_id}`} className="text-sm text-muted-foreground hover:underline">
                              #{r.factuur_id}
                            </Link>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{r.relatienaam ?? "—"}</TableCell>
                        <TableCell className="text-sm font-mono text-xs">{r.accountview_boeking_id ?? "—"}</TableCell>
                        <TableCell className="text-sm">
                          {r.http_status ? (
                            <span className={r.http_status >= 400 ? "text-destructive" : "text-green-700"}>
                              {r.http_status}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusInfo.variant} className="gap-1">
                            <StatusIcon className="h-3 w-3" />
                            {statusInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.gebruiker_naam ?? "—"}</TableCell>
                        <TableCell>
                          <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                            <Link href={`/facturen/${r.factuur_id}`}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Foutdetails */}
          {regels.filter((r) => r.status === "mislukt" && r.foutmelding).length > 0 && (
            <div className="border-t px-4 py-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Foutmeldingen</p>
              {regels.filter((r) => r.status === "mislukt" && r.foutmelding).slice(0, 5).map((r) => (
                <div key={r.id} className="text-xs text-destructive bg-destructive/5 rounded px-3 py-2">
                  <span className="font-medium">{r.factuurnummer ?? `#${r.factuur_id}`}:</span>{" "}
                  {r.foutmelding}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
