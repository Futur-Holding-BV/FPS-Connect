// Voorraadtellingen — overzicht + aanmaken (VOORRAADTELLING fase 1)
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListVoorraadTellingen,
  useCreateVoorraadTelling,
  getListVoorraadTellingenQueryKey,
} from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { ClipboardList, Plus, Lock, Loader2 } from "lucide-react";

export const GRONDSLAG_LABELS: Record<string, string> = {
  inkoopprijs: "Inkoopprijs",
  laatste_inkoopprijs: "Laatste inkoopprijs",
  gewogen_gemiddelde: "Gewogen gemiddelde",
};

function formatDatum(d: string) {
  const [j, m, dag] = d.split("-");
  return `${dag}-${m}-${j}`;
}

export default function MagazijnTellingenPagina() {
  const { heeftNiveau } = useBevoegdheid();
  const kanLezen = heeftNiveau("magazijn", 1);
  const kanAanmaken = heeftNiveau("magazijn", 3);
  const queryClient = useQueryClient();
  const [, navigeer] = useLocation();

  const { data: tellingen = [], isLoading } = useListVoorraadTellingen();

  const [open, setOpen] = useState(false);
  const [peildatum, setPeildatum] = useState(() => `${new Date().getFullYear()}-12-31`);
  const [grondslag, setGrondslag] = useState("inkoopprijs");
  const [omschrijving, setOmschrijving] = useState("");
  const [fout, setFout] = useState<string | null>(null);

  const aanmaken = useCreateVoorraadTelling({
    mutation: {
      onSuccess: (telling) => {
        queryClient.invalidateQueries({ queryKey: getListVoorraadTellingenQueryKey() });
        setOpen(false);
        navigeer(`/magazijn/tellingen/${telling.id}`);
      },
      onError: () => setFout("Aanmaken mislukt. Controleer peildatum en grondslag."),
    },
  });

  if (!kanLezen) {
    return <div className="p-6"><p className="text-muted-foreground">Geen toegang tot magazijn.</p></div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 data-paginatitel className="text-2xl font-bold">Voorraadtellingen</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Bevroren tellingen per peildatum — de onderbouwing voor de boekhouder.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {kanAanmaken && (
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); setFout(null); }}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-2" />Nieuwe telling</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Nieuwe voorraadtelling</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="telling-peildatum">Peildatum</Label>
                    <Input id="telling-peildatum" type="date" value={peildatum} onChange={(e) => setPeildatum(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Waarderingsgrondslag</Label>
                    <Select value={grondslag} onValueChange={setGrondslag}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inkoopprijs">Inkoopprijs</SelectItem>
                        <SelectItem value="laatste_inkoopprijs">Laatste inkoopprijs</SelectItem>
                        <SelectItem value="gewogen_gemiddelde">Gewogen gemiddelde</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Vaste keuze per telling — wordt bij het aanmaken vastgelegd en kan daarna niet meer wisselen.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="telling-omschrijving">Omschrijving (optioneel)</Label>
                    <Input id="telling-omschrijving" value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} placeholder="Bijv. Jaarafsluiting 2026" />
                  </div>
                  {fout && <p className="text-sm text-destructive">{fout}</p>}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
                  <Button
                    onClick={() => aanmaken.mutate({ data: { peildatum, grondslag: grondslag as "inkoopprijs" | "laatste_inkoopprijs" | "gewogen_gemiddelde", omschrijving: omschrijving || null } })}
                    disabled={aanmaken.isPending || !peildatum}
                  >
                    {aanmaken.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Telling aanmaken
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          <Link href="/magazijn"><Button variant="ghost" size="sm">Terug naar dashboard</Button></Link>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left py-2.5 px-4">Peildatum</th>
                  <th className="text-left py-2.5 px-4">Grondslag</th>
                  <th className="text-left py-2.5 px-4">Status</th>
                  <th className="text-right py-2.5 px-4">Regels</th>
                  <th className="text-left py-2.5 px-4">Aangemaakt door</th>
                  <th className="text-left py-2.5 px-4">Vastgesteld door</th>
                  <th className="text-left py-2.5 px-4">Omschrijving</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-t"><td className="py-2.5 px-4" colSpan={7}><Skeleton className="h-4 w-full" /></td></tr>
                  ))
                ) : tellingen.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-muted-foreground">
                      <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      Nog geen tellingen. {kanAanmaken ? "Maak de eerste telling aan met de knop rechtsboven." : ""}
                    </td>
                  </tr>
                ) : (
                  tellingen.map((t) => (
                    <tr
                      key={t.id}
                      className="border-t hover:bg-muted/20 transition-colors cursor-pointer"
                      onClick={() => navigeer(`/magazijn/tellingen/${t.id}`)}
                    >
                      <td className="py-2.5 px-4 font-medium">{formatDatum(t.peildatum)}</td>
                      <td className="py-2.5 px-4">{GRONDSLAG_LABELS[t.grondslag] ?? t.grondslag}</td>
                      <td className="py-2.5 px-4">
                        {t.status === "vastgesteld" ? (
                          <Badge variant="secondary" className="text-muted-foreground"><Lock className="h-3 w-3 mr-1" />Vastgesteld</Badge>
                        ) : (
                          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Open</Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums">{t.aantal_regels}</td>
                      <td className="py-2.5 px-4 text-muted-foreground">{t.aangemaakt_door_naam ?? "—"}</td>
                      <td className="py-2.5 px-4 text-muted-foreground">{t.vastgesteld_door_naam ?? "—"}</td>
                      <td className="py-2.5 px-4 text-muted-foreground">{t.omschrijving ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
