import { useState } from "react";
import { Link } from "wouter";
import {
  useListFacturen,
  useBeoordelenFactuurPL,
  useBeoordelenFactuurWVB,
} from "@workspace/api-client-react";
import type { Factuur } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Inbox, CheckCircle2, XCircle, ChevronRight, Loader2, AlertCircle,
  Euro, Calendar, Building2, FileText,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getListFacturenQueryKey } from "@workspace/api-client-react";

function euro(v?: string | null) {
  if (!v) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(parseFloat(v));
}

function datum(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function vervaldatumBadge(vervaldatum?: string | null) {
  if (!vervaldatum) return null;
  const dagen = Math.ceil((new Date(vervaldatum).getTime() - Date.now()) / 86_400_000);
  if (dagen < 0) return { label: `Vervallen (${Math.abs(dagen)}d)`, kleur: "bg-red-100 text-red-700 border-red-200" };
  if (dagen <= 7) return { label: `Vervalt over ${dagen}d`, kleur: "bg-orange-100 text-orange-700 border-orange-200" };
  return null;
}

type BeoordeelActie = "goedkeuren" | "afkeuren" | "doorzetten";

interface BeoordeelDialoogProps {
  factuur: Factuur;
  box: "pl" | "wvb";
  open: boolean;
  onSluit: () => void;
}

function BeoordeelDialoog({ factuur, box, open, onSluit }: BeoordeelDialoogProps) {
  const queryClient = useQueryClient();
  const [actie, setActie] = useState<BeoordeelActie | null>(null);
  const [reden, setReden] = useState("");
  const [bezig, setBezig] = useState(false);

  const mutatePl = useBeoordelenFactuurPL();
  const mutateWvb = useBeoordelenFactuurWVB();

  function reset() {
    setActie(null);
    setReden("");
    setBezig(false);
  }

  function sluit() {
    reset();
    onSluit();
  }

  async function verstuur() {
    if (!actie) return;
    if (actie === "afkeuren" && !reden.trim()) {
      toast({ title: "Reden vereist", description: "Geef een reden op bij afkeuren.", variant: "destructive" });
      return;
    }
    setBezig(true);
    try {
      const payload = { actie, reden: reden.trim() || undefined };
      if (box === "pl") {
        await mutatePl.mutateAsync({ id: factuur.id, data: payload });
      } else {
        await mutateWvb.mutateAsync({ id: factuur.id, data: payload });
      }
      await queryClient.invalidateQueries({ queryKey: getListFacturenQueryKey({ status: box === "pl" ? "te_beoordelen_pl" : "te_beoordelen_wvb" }) });
      const label = actie === "goedkeuren" ? "Goedgekeurd" : actie === "afkeuren" ? "Afgekeurd" : "Doorgezet";
      toast({ title: `${label}`, description: `Factuur ${factuur.factuurnummer ?? `#${factuur.id}`} is ${label.toLowerCase()}.` });
      sluit();
    } catch {
      toast({ title: "Fout", description: "Kon actie niet uitvoeren. Probeer het opnieuw.", variant: "destructive" });
    } finally {
      setBezig(false);
    }
  }

  const doorzendLabel = box === "pl" ? "Doorzetten naar WVB" : "Doorzetten naar boekhouding";
  const goedkeurLabel = box === "pl" ? "Goedkeuren" : "Goedkeuren";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) sluit(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Factuur beoordelen</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <FileText className="h-4 w-4 shrink-0" />
              <span>{factuur.factuurnummer ?? `Factuur #${factuur.id}`}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Euro className="h-4 w-4 shrink-0" />
              <span className="font-medium">{euro(factuur.bedrag_incl_btw)}</span>
            </div>
            {factuur.relatienaam && (
              <div className="flex items-center gap-2 text-muted-foreground col-span-2">
                <Building2 className="h-4 w-4 shrink-0" />
                <span>{factuur.relatienaam}</span>
              </div>
            )}
            {factuur.factuurdatum && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4 shrink-0" />
                <span>{datum(factuur.factuurdatum)}</span>
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-sm font-medium">Actie</Label>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={actie === "goedkeuren" ? "default" : "outline"}
                size="sm"
                onClick={() => { setActie("goedkeuren"); setReden(""); }}
                className={actie === "goedkeuren" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                {goedkeurLabel}
              </Button>
              <Button
                variant={actie === "afkeuren" ? "default" : "outline"}
                size="sm"
                onClick={() => setActie("afkeuren")}
                className={actie === "afkeuren" ? "bg-destructive hover:bg-destructive/90" : ""}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Afkeuren
              </Button>
              <Button
                variant={actie === "doorzetten" ? "default" : "outline"}
                size="sm"
                onClick={() => { setActie("doorzetten"); setReden(""); }}
                className={actie === "doorzetten" ? "bg-blue-600 hover:bg-blue-700" : ""}
              >
                <ChevronRight className="h-4 w-4 mr-1" />
                {doorzendLabel}
              </Button>
            </div>
          </div>

          {actie === "afkeuren" && (
            <div className="space-y-1">
              <Label htmlFor="reden" className="text-sm">Reden (verplicht)</Label>
              <Textarea
                id="reden"
                placeholder="Omschrijf waarom deze factuur wordt afgekeurd..."
                value={reden}
                onChange={(e) => setReden(e.target.value)}
                rows={3}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={sluit} disabled={bezig}>Annuleren</Button>
          <Button onClick={verstuur} disabled={!actie || bezig}>
            {bezig && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Bevestigen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface FactuurRijProps {
  factuur: Factuur;
  box: "pl" | "wvb";
}

function FactuurRij({ factuur, box }: FactuurRijProps) {
  const [dialoogOpen, setDialoogOpen] = useState(false);

  return (
    <>
      <Card className="hover:bg-muted/30 transition-colors">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm truncate">
                  {factuur.factuurnummer ?? `Factuur #${factuur.id}`}
                </span>
                {factuur.ai_metadata && (
                  <Badge variant="secondary" className="text-xs shrink-0">AI gelezen</Badge>
                )}
                {(() => { const b = vervaldatumBadge(factuur.vervaldatum); return b ? <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${b.kleur}`}>{b.label}</span> : null; })()}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {factuur.relatienaam && (
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {factuur.relatienaam}
                  </span>
                )}
                {factuur.factuurdatum && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {datum(factuur.factuurdatum)}
                  </span>
                )}
                {factuur.vervaldatum && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-orange-400" />
                    Vervaldatum: {datum(factuur.vervaldatum)}
                  </span>
                )}
                {factuur.bedrag_incl_btw && (
                  <span className="flex items-center gap-1 font-medium text-foreground">
                    <Euro className="h-3 w-3" />
                    {euro(factuur.bedrag_incl_btw)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link href={`/facturen/${factuur.id}`} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
                Bekijk
              </Link>
              <Button size="sm" onClick={() => setDialoogOpen(true)}>
                Beoordelen
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <BeoordeelDialoog
        factuur={factuur}
        box={box}
        open={dialoogOpen}
        onSluit={() => setDialoogOpen(false)}
      />
    </>
  );
}

interface BoxTabProps {
  status: string;
  box: "pl" | "wvb";
  label: string;
}

function BoxTab({ status, box, label }: BoxTabProps) {
  const { data: facturen = [], isLoading } = useListFacturen({ status } as Parameters<typeof useListFacturen>[0]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Laden...
      </div>
    );
  }

  if (facturen.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Inbox className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">Geen facturen in de {label}</p>
        <p className="text-xs mt-1">Facturen verschijnen hier nadat ze door AI zijn uitgelezen.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground pb-1">
        {facturen.length} {facturen.length === 1 ? "factuur" : "facturen"} wacht{facturen.length === 1 ? "" : "en"} op beoordeling
      </p>
      {facturen.map((f) => (
        <FactuurRij key={f.id} factuur={f} box={box} />
      ))}
    </div>
  );
}

export default function CredieurenInboxPagina() {
  const { heeftNiveau } = useBevoegdheid();
  const toonPl = heeftNiveau("financieel", 2);
  const toonWvb = heeftNiveau("financieel", 3);

  const defaultTab = toonPl ? "pl" : toonWvb ? "wvb" : null;

  if (!defaultTab) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <AlertCircle className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">Geen toegang</p>
        <p className="text-xs mt-1">U heeft geen rechten om facturen te beoordelen.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Crediteuren — Inbox</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Beoordeel inkomende facturen voordat ze naar de boekhouding gaan.
          </p>
        </div>
        <Link href="/facturen/dashboard">
          <Button variant="outline" size="sm">
            Alle facturen
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {toonPl && (
            <TabsTrigger value="pl">PL-box</TabsTrigger>
          )}
          {toonWvb && (
            <TabsTrigger value="wvb">WVB-box</TabsTrigger>
          )}
        </TabsList>

        {toonPl && (
          <TabsContent value="pl" className="mt-4">
            <BoxTab status="te_beoordelen_pl" box="pl" label="PL-box" />
          </TabsContent>
        )}

        {toonWvb && (
          <TabsContent value="wvb" className="mt-4">
            <BoxTab status="te_beoordelen_wvb" box="wvb" label="WVB-box" />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
