// FACTUUR_01 — beheerpagina "Uitzendbureau-koppelingen".
//
// Toont alle vrije-tekstwaarden uit bedrijf_uitzendbureau (gebruikers +
// medewerkers) die nog geen verwijzing naar een CRM-organisatie hebben.
// De migratie koppelt eenduidige naam-matches automatisch; wat hier staat is
// bewust NIET automatisch gekoppeld (geen of meerdere matches) en wordt door
// een beheerder één keer handmatig opgelost.
import { useState } from "react";
import {
  useListUitzendbureauKoppelingen,
  useKoppelUitzendbureau,
  useListCrmKlanten,
  getListUitzendbureauKoppelingenQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Link2, CheckCircle2 } from "lucide-react";

export default function UitzendbureauKoppelingenPagina() {
  const { data, isLoading } = useListUitzendbureauKoppelingen();
  const { data: organisaties } = useListCrmKlanten();
  const koppel = useKoppelUitzendbureau();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [keuze, setKeuze] = useState<Record<string, number>>({});

  const openstaand = data?.openstaand ?? [];

  async function koppelen(tekst: string) {
    const crmKlantId = keuze[tekst];
    if (!crmKlantId) return;
    try {
      const resultaat = await koppel.mutateAsync({ data: { tekst, crm_klant_id: crmKlantId } });
      toast({
        title: "Gekoppeld",
        description: `"${tekst}" gekoppeld: ${resultaat.gekoppelde_gebruikers} gebruiker(s), ${resultaat.gekoppelde_medewerkers} medewerker(s).`,
      });
      await queryClient.invalidateQueries({ queryKey: getListUitzendbureauKoppelingenQueryKey() });
    } catch (err) {
      toast({
        title: "Koppelen mislukt",
        description: err instanceof Error ? err.message : "Onbekende fout",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-6 p-6 max-w-4xl">
      <div>
        <h1 data-paginatitel className="text-2xl font-semibold">Uitzendbureau-koppelingen</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vrije-tekstnamen van uitzendbureaus en onderaannemers die nog niet aan een organisatie
          in het CRM zijn gekoppeld. Kies per naam de juiste organisatie; bij twijfel niet koppelen.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : openstaand.length === 0 ? (
        <Card>
          <CardContent className="py-8 flex items-center gap-3 text-sm text-muted-foreground">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            Alles is gekoppeld. Nieuwe vrije-tekstnamen verschijnen hier automatisch.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {openstaand.map((regel) => (
            <Card key={regel.tekst}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {regel.tekst}
                  <Badge variant="outline">
                    {regel.aantal_gebruikers} gebruiker(s) · {regel.aantal_medewerkers} medewerker(s)
                  </Badge>
                </CardTitle>
                {regel.kandidaten.length === 0 && (
                  <CardDescription>
                    Geen naam-match in het CRM. Maak de organisatie eerst aan onder CRM → Organisaties
                    (type "Uitzendbureau" of "Inlener") en koppel daarna hier.
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3">
                <div className="min-w-64">
                  <Select
                    value={keuze[regel.tekst] ? String(keuze[regel.tekst]) : undefined}
                    onValueChange={(v) => setKeuze((k) => ({ ...k, [regel.tekst]: Number(v) }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Kies organisatie" /></SelectTrigger>
                    <SelectContent>
                      {(regel.kandidaten.length > 0
                        ? regel.kandidaten
                        : (organisaties ?? []).filter((o) => ["uitzendbureau", "inlener", "leverancier", "overig", null].includes(o.type ?? null))
                      ).map((o) => (
                        <SelectItem key={o.id} value={String(o.id)}>
                          {o.naam}{"type" in o && o.type ? ` (${o.type})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  disabled={!keuze[regel.tekst] || koppel.isPending}
                  onClick={() => koppelen(regel.tekst)}
                >
                  <Link2 className="h-4 w-4 mr-1.5" />
                  Koppelen
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
