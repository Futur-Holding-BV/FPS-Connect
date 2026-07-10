import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useListArtikelen, useListVoorraadTotaal } from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, AlertTriangle, Package, Eye, Barcode } from "lucide-react";
import { cn } from "@/lib/utils";
import { bewaarBulkBarcodeSelectie } from "@/pages/magazijn/artikelen-barcodes-bulk";

function formatBedrag(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
}

export default function MagazijnArtikelenPagina() {
  const { heeftNiveau } = useBevoegdheid();
  const [, navigeer] = useLocation();
  const [zoek, setZoek] = useState("");
  const [alleenActief, setAlleenActief] = useState(true);
  const [geselecteerd, setGeselecteerd] = useState<Set<number>>(new Set());

  const { data: artikelenData, isLoading } = useListArtikelen({
    actief: alleenActief ? true : undefined,
    zoek: zoek || undefined,
  });
  const { data: voorraadData = [] } = useListVoorraadTotaal();

  const artikelen = artikelenData ?? [];
  const voorraadMap = new Map(voorraadData.map(v => [v.artikel_id, v]));

  const alleGeselecteerd = artikelen.length > 0 && artikelen.every(a => geselecteerd.has(a.id));

  function toggelAlle() {
    setGeselecteerd(alleGeselecteerd ? new Set() : new Set(artikelen.map(a => a.id)));
  }

  function toggelEen(id: number) {
    setGeselecteerd(prev => {
      const nieuw = new Set(prev);
      if (nieuw.has(id)) nieuw.delete(id); else nieuw.add(id);
      return nieuw;
    });
  }

  function drukBarcodesAf() {
    const selectie = artikelen
      .filter(a => geselecteerd.has(a.id))
      .map(a => ({ id: a.id, naam: a.naam, code: a.code, barcode: a.barcode, eenheid: a.eenheid }));
    bewaarBulkBarcodeSelectie(selectie);
    navigeer("/magazijn/artikelen/barcodes-afdrukken");
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Artikelen</h1>
        <div className="flex items-center gap-2">
          {geselecteerd.size > 0 && (
            <Button variant="outline" size="sm" onClick={drukBarcodesAf}>
              <Barcode className="h-4 w-4 mr-1.5" />
              Barcodes afdrukken ({geselecteerd.size})
            </Button>
          )}
          <Link href="/artikelen">
            <Button variant="outline" size="sm">Volledig artikelbeheer</Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={zoek} onChange={e => setZoek(e.target.value)} placeholder="Artikel zoeken..." className="pl-9" />
        </div>
        <Button
          variant={alleenActief ? "default" : "outline"}
          size="sm"
          onClick={() => setAlleenActief(v => !v)}
        >
          {alleenActief ? "Actief" : "Alle"}
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-2.5 px-4 w-8">
                <Checkbox checked={alleGeselecteerd} onCheckedChange={toggelAlle} aria-label="Alles selecteren" />
              </th>
              <th className="text-left py-2.5 px-4">Artikel</th>
              <th className="text-left py-2.5 px-4">Categorie</th>
              <th className="text-left py-2.5 px-4">Eenheid</th>
              <th className="text-right py-2.5 px-4">Inkoopprijs</th>
              <th className="text-right py-2.5 px-4">Actueel</th>
              <th className="text-right py-2.5 px-4">Vrij</th>
              <th className="text-left py-2.5 px-4">Status</th>
              <th className="py-2.5 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b">
                  <td className="py-3 px-4" colSpan={9}><Skeleton className="h-5 w-full" /></td>
                </tr>
              ))
            ) : artikelen.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-muted-foreground">
                  {zoek ? "Geen artikelen gevonden." : "Nog geen artikelen aangemaakt."}
                </td>
              </tr>
            ) : (
              artikelen.map(a => {
                const v = voorraadMap.get(a.id);
                const onderMinimum = v?.onder_minimum ?? false;
                return (
                  <tr key={a.id} className={cn("border-b hover:bg-muted/20 transition-colors", onderMinimum && "bg-red-50 hover:bg-red-50")}>
                    <td className="py-2.5 px-4">
                      <Checkbox checked={geselecteerd.has(a.id)} onCheckedChange={() => toggelEen(a.id)} aria-label={`${a.naam} selecteren`} />
                    </td>
                    <td className="py-2.5 px-4">
                      <div>
                        <span className="font-medium">{a.naam}</span>
                        {a.code && <span className="text-xs text-muted-foreground ml-1.5">({a.code})</span>}
                      </div>
                      {a.leverancier_naam && <p className="text-xs text-muted-foreground">{a.leverancier_naam}</p>}
                    </td>
                    <td className="py-2.5 px-4 text-muted-foreground">{a.categorie ?? "—"}</td>
                    <td className="py-2.5 px-4 text-muted-foreground">{a.eenheid}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums">{formatBedrag(a.inkoopprijs)}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums">{v?.hoeveelheid ?? "—"}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums">{v?.vrij ?? "—"}</td>
                    <td className="py-2.5 px-4">
                      {onderMinimum ? (
                        <Badge variant="destructive" className="text-xs flex items-center gap-1 w-fit">
                          <AlertTriangle className="h-2.5 w-2.5" /> Onder minimum
                        </Badge>
                      ) : v ? (
                        <Badge variant="secondary" className="text-xs">Op voorraad</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">Geen voorraad</Badge>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      <Link href={`/magazijn/artikelen/${a.id}`}>
                        <Button size="icon" variant="ghost" className="h-7 w-7">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
