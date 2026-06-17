import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCalculaties,
  useCreateCalculatie,
  useListGebouwen,
  getListCalculatiesQueryKey,
} from "@workspace/api-client-react";
import type { CalculatieInput } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Calculator, Plus, ChevronRight, Building, Euro, FileText } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  concept: "Concept",
  definitief: "Definitief",
};

const STATUS_KLEUR: Record<string, string> = {
  concept: "bg-amber-100 text-amber-800 border-amber-200",
  definitief: "bg-green-100 text-green-800 border-green-200",
};

function formatBedrag(n: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
}

function formatDatum(s: string) {
  return new Date(s).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

export default function ConnectCalculatie() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialoogOpen, setDialoogOpen] = useState(false);
  const [zoek, setZoek] = useState("");
  const [vorm, setVorm] = useState<Partial<CalculatieInput>>({});

  const { data: calculaties, isLoading } = useListCalculaties();
  const { data: gebouwenData } = useListGebouwen();
  const { mutateAsync: aanmaken, isPending } = useCreateCalculatie();

  const gefilterd = (calculaties ?? []).filter((c) =>
    !zoek || c.naam.toLowerCase().includes(zoek.toLowerCase()) ||
    (c.gebouw_naam ?? "").toLowerCase().includes(zoek.toLowerCase()),
  );

  async function opslaan() {
    if (!vorm.naam?.trim()) return;
    try {
      await aanmaken({ data: { naam: vorm.naam.trim(), gebouw_id: vorm.gebouw_id ?? null } });
      await qc.invalidateQueries({ queryKey: getListCalculatiesQueryKey() });
      setDialoogOpen(false);
      setVorm({});
      toast({ title: "Calculatie aangemaakt" });
    } catch {
      toast({ title: "Fout bij aanmaken", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calculatie</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Projectcalculaties en begrotingsoverzichten
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs px-2 py-1">
            <Calculator className="h-3 w-3 mr-1" />
            FPS Connect
          </Badge>
          <Button size="sm" onClick={() => setDialoogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nieuwe calculatie
          </Button>
        </div>
      </div>

      <div className="flex gap-3">
        <Input
          placeholder="Zoek op naam of gebouw..."
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
          className="max-w-sm"
        />
        <div className="ml-auto text-sm text-muted-foreground flex items-center">
          {gefilterd.length} calculatie{gefilterd.length !== 1 ? "s" : ""}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : gefilterd.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Calculator className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Geen calculaties gevonden</p>
            <p className="text-sm mt-1">Maak een nieuwe calculatie aan om te beginnen.</p>
            <Button size="sm" className="mt-4" onClick={() => setDialoogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Nieuwe calculatie
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {gefilterd.map((c) => (
            <Link key={c.id} href={`/connect/calculatie/${c.id}`}>
              <div className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/30 hover:border-primary/30 transition-colors cursor-pointer group">
                <div className="flex items-center justify-center h-9 w-9 rounded-md bg-primary/10 text-primary shrink-0">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{c.naam}</p>
                  {c.gebouw_naam && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Building className="h-3 w-3" />
                      {c.gebouw_naam}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-muted-foreground">Totaal excl. btw</p>
                    <p className="font-semibold text-sm">{formatBedrag(c.totaal_excl_btw)}</p>
                  </div>
                  <Badge variant="outline" className={`text-xs ${STATUS_KLEUR[c.status] ?? ""}`}>
                    {STATUS_LABEL[c.status] ?? c.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground hidden md:block">
                    {formatDatum(c.aangemaakt_op)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={dialoogOpen} onOpenChange={setDialoogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nieuwe calculatie</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Naam <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Bijv. Brandwerende deuren blok A"
                value={vorm.naam ?? ""}
                onChange={(e) => setVorm((v) => ({ ...v, naam: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Gebouw (optioneel)</Label>
              <Select
                value={String(vorm.gebouw_id ?? "geen")}
                onValueChange={(v) =>
                  setVorm((f) => ({ ...f, gebouw_id: v === "geen" ? undefined : Number(v) }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kies een gebouw..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="geen">Geen gebouw</SelectItem>
                  {(gebouwenData ?? []).map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.naam}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialoogOpen(false)}>
              Annuleren
            </Button>
            <Button onClick={opslaan} disabled={!vorm.naam?.trim() || isPending}>
              {isPending ? "Aanmaken..." : "Aanmaken"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
