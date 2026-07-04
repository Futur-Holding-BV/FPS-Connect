import { useState } from "react";
import { useListVoorraadMutaties, useListArtikelen, useListOpdrachten } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  inkoop: "Inkoop",
  uitgifte: "Uitgifte",
  retour: "Retour",
  correctie: "Correctie",
  reservering: "Reservering",
  vrijgave: "Vrijgave",
};

const TYPE_KLEUR: Record<string, string> = {
  inkoop: "bg-green-100 text-green-800",
  uitgifte: "bg-red-100 text-red-800",
  retour: "bg-blue-100 text-blue-800",
  correctie: "bg-amber-100 text-amber-800",
  reservering: "bg-purple-100 text-purple-800",
  vrijgave: "bg-gray-100 text-gray-700",
};

function formatDatum(iso: string) {
  return new Date(iso).toLocaleString("nl-NL", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function MagazijnMutatiesPagina() {
  const [filterArtikel, setFilterArtikel] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterOpdracht, setFilterOpdracht] = useState("");

  const { data: artikelenData } = useListArtikelen();
  const artikelen = artikelenData ?? [];

  const { data: opdrachtenData } = useListOpdrachten();
  const opdrachten = opdrachtenData ?? [];

  const { data: mutaties = [], isLoading } = useListVoorraadMutaties({
    artikel_id: filterArtikel ? Number(filterArtikel) : undefined,
    type: filterType || undefined,
    opdracht_id: filterOpdracht ? Number(filterOpdracht) : undefined,
    limit: 200,
  });

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Mutaties</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterArtikel || "__alle__"} onValueChange={v => setFilterArtikel(v === "__alle__" ? "" : v)}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Alle artikelen" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__alle__">Alle artikelen</SelectItem>
            {artikelen.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.naam}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType || "__alle__"} onValueChange={v => setFilterType(v === "__alle__" ? "" : v)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Alle types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__alle__">Alle types</SelectItem>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterOpdracht || "__alle__"} onValueChange={v => setFilterOpdracht(v === "__alle__" ? "" : v)}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Alle opdrachten" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__alle__">Alle opdrachten</SelectItem>
            {opdrachten.map(o => (
              <SelectItem key={o.id} value={String(o.id)}>
                {o.titel}{o.werknummer ? ` (${o.werknummer})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg overflow-hidden bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left py-2.5 px-4">Datum</th>
              <th className="text-left py-2.5 px-4">Type</th>
              <th className="text-left py-2.5 px-4">Artikel</th>
              <th className="text-right py-2.5 px-4">Hoeveelheid</th>
              <th className="text-right py-2.5 px-4">Delta</th>
              <th className="text-left py-2.5 px-4">Opdracht</th>
              <th className="text-left py-2.5 px-4">Omschrijving</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b">
                  <td className="py-3 px-4" colSpan={7}><Skeleton className="h-5 w-full" /></td>
                </tr>
              ))
            ) : mutaties.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-muted-foreground">
                  Geen mutaties gevonden.
                </td>
              </tr>
            ) : (
              mutaties.map(m => (
                <tr key={m.id} className="border-b hover:bg-muted/20 transition-colors">
                  <td className="py-2.5 px-4 text-muted-foreground text-xs">{formatDatum(m.aangemaakt_op)}</td>
                  <td className="py-2.5 px-4">
                    <Badge className={cn("text-xs", TYPE_KLEUR[m.type] ?? "bg-gray-100")}>
                      {TYPE_LABELS[m.type] ?? m.type}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-4 font-medium">{m.artikel_naam ?? `#${m.artikel_id}`}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums">{m.hoeveelheid}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums">
                    <span className={cn("flex items-center justify-end gap-1", m.delta > 0 ? "text-green-700" : m.delta < 0 ? "text-red-700" : "text-muted-foreground")}>
                      {m.delta > 0 ? <ArrowUp className="h-3 w-3" /> : m.delta < 0 ? <ArrowDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                      {m.delta > 0 ? "+" : ""}{m.delta}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-xs text-muted-foreground">
                    {m.opdracht_titel ?? (m.opdracht_id ? `#${m.opdracht_id}` : "—")}
                  </td>
                  <td className="py-2.5 px-4 text-muted-foreground text-xs">{m.omschrijving ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
