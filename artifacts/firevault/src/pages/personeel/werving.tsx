// WERVING_01 — Wervingsoverzicht: kandidaten, kanalen en kernvragen per functie.
// De AI bereidt alleen voor (toetsing + vragen), oordeelt nooit.
import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListWervingKandidaten,
  getListWervingKandidatenQueryKey,
  useCreateWervingKandidaat,
  useGetWervingKanalenOverzicht,
  getGetWervingKanalenOverzichtQueryKey,
  useListFuncties,
  useListFunctieKernvragen,
  getListFunctieKernvragenQueryKey,
  useSetFunctieKernvragen,
  useStelFunctieKernvragenVoor,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { Plus, ChevronRight, Sparkles, Trash2, ListChecks } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  ontvangen: "Ontvangen",
  uitgenodigd: "Uitgenodigd",
  gesproken: "Gesproken",
  afgewezen: "Afgewezen",
  aangenomen: "Aangenomen",
};

function StatusBadge({ status }: { status: string }) {
  const variant = status === "aangenomen" ? "default" : status === "afgewezen" ? "outline" : "secondary";
  return <Badge variant={variant}>{STATUS_LABELS[status] ?? status}</Badge>;
}

export default function WervingPagina() {
  const { heeftNiveau } = useBevoegdheid();
  const magSchrijven = heeftNiveau("personeel", 2);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: kandidaten, isLoading } = useListWervingKandidaten({
    query: { queryKey: getListWervingKandidatenQueryKey() },
  });
  const { data: kanalen } = useGetWervingKanalenOverzicht({
    query: { queryKey: getGetWervingKanalenOverzichtQueryKey() },
  });
  const { data: functies } = useListFuncties();

  // ── Nieuwe kandidaat ────────────────────────────────────────────────────────
  const [dialoogOpen, setDialoogOpen] = useState(false);
  const [naam, setNaam] = useState("");
  const [functieId, setFunctieId] = useState<string>("");
  const [email, setEmail] = useState("");
  const [telefoon, setTelefoon] = useState("");
  const [kanaal, setKanaal] = useState("");
  const [toestemming, setToestemming] = useState(false);
  const [cvBestand, setCvBestand] = useState<File | null>(null);
  const maakKandidaat = useCreateWervingKandidaat();

  async function voegToe() {
    if (!naam.trim() || !functieId) {
      toast({ title: "Naam en functie zijn verplicht", variant: "destructive" });
      return;
    }
    try {
      await maakKandidaat.mutateAsync({
        data: {
          naam: naam.trim(),
          functie_id: functieId,
          email: email.trim() || undefined,
          telefoon: telefoon.trim() || undefined,
          kanaal: kanaal.trim() || undefined,
          toestemming_bewaring: toestemming ? "true" : "false",
          cv: cvBestand ?? undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListWervingKandidatenQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetWervingKanalenOverzichtQueryKey() });
      setDialoogOpen(false);
      setNaam(""); setFunctieId(""); setEmail(""); setTelefoon(""); setKanaal(""); setToestemming(false); setCvBestand(null);
      toast({ title: "Kandidaat toegevoegd" });
    } catch (err) {
      toast({ title: "Toevoegen mislukt", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  }

  // ── Kernvragen per functie ──────────────────────────────────────────────────
  const [kernFunctieId, setKernFunctieId] = useState<number | null>(null);
  const [kernOpen, setKernOpen] = useState(false);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Werving</h1>
          <p className="text-sm text-muted-foreground">
            Registratie en gespreksvoorbereiding. De AI toetst het cv aan de functie en stelt vragen op — zij geeft nooit een oordeel of score.
          </p>
        </div>
        <div className="flex gap-2">
          {magSchrijven && (
            <Button variant="outline" onClick={() => setKernOpen(true)}>
              <ListChecks className="mr-2 h-4 w-4" /> Kernvragen per functie
            </Button>
          )}
          {magSchrijven && (
            <Dialog open={dialoogOpen} onOpenChange={setDialoogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> Kandidaat toevoegen</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Nieuwe kandidaat</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="werving-naam">Naam</Label>
                    <Input id="werving-naam" value={naam} onChange={(e) => setNaam(e.target.value)} />
                  </div>
                  <div>
                    <Label>Functie</Label>
                    <Select value={functieId} onValueChange={setFunctieId}>
                      <SelectTrigger><SelectValue placeholder="Kies een functie" /></SelectTrigger>
                      <SelectContent>
                        {(functies ?? []).filter((f) => f.actief).map((f) => (
                          <SelectItem key={f.id} value={String(f.id)}>{f.naam}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="werving-email">E-mail</Label>
                      <Input id="werving-email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="werving-telefoon">Telefoon</Label>
                      <Input id="werving-telefoon" value={telefoon} onChange={(e) => setTelefoon(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="werving-kanaal">Kanaal (bijv. Indeed, eigen netwerk, open sollicitatie)</Label>
                    <Input id="werving-kanaal" value={kanaal} onChange={(e) => setKanaal(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="werving-cv">Cv (PDF, DOCX, tekst of scan)</Label>
                    <Input id="werving-cv" type="file" accept=".pdf,.docx,.txt,.jpg,.jpeg,.png"
                      onChange={(e) => setCvBestand(e.target.files?.[0] ?? null)} />
                  </div>
                  <div className="flex items-start gap-2 rounded-md border p-3">
                    <Checkbox id="werving-toestemming" checked={toestemming} onCheckedChange={(v) => setToestemming(v === true)} />
                    <Label htmlFor="werving-toestemming" className="text-sm font-normal leading-snug">
                      De kandidaat heeft uitdrukkelijk toestemming gegeven om gegevens één jaar te bewaren.
                      Zonder toestemming worden gegevens en cv vier weken na afronding automatisch verwijderd.
                    </Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={voegToe} disabled={maakKandidaat.isPending}>
                    {maakKandidaat.isPending ? "Bezig..." : "Toevoegen"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Kandidaten</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
            ) : (kandidaten ?? []).length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nog geen kandidaten. Voeg een kandidaat met cv toe om een gesprek voor te bereiden.
              </p>
            ) : (
              <div className="divide-y">
                {(kandidaten ?? []).map((k) => (
                  <Link key={k.id} href={`/personeel/werving/${k.id}`}>
                    <div className="flex cursor-pointer items-center justify-between gap-3 py-3 hover:bg-muted/50">
                      <div className="min-w-0">
                        <div className="font-medium">{k.naam}</div>
                        <div className="text-sm text-muted-foreground">
                          {k.functie_naam ?? "Onbekende functie"} · via {k.kanaal}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {k.toetsing_op && (
                          <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-700">
                            <Sparkles className="mr-1 h-3 w-3" /> Voorbereid
                          </Badge>
                        )}
                        <StatusBadge status={k.status} />
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Kanalen</CardTitle></CardHeader>
          <CardContent>
            {(kanalen ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen gegevens. Het kanaal wordt per kandidaat vastgelegd, zodat na verloop van tijd zichtbaar is welk kanaal bruikbare mensen oplevert.</p>
            ) : (
              <div className="space-y-3">
                {(kanalen ?? []).map((r) => (
                  <div key={r.kanaal} className="rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{r.kanaal}</span>
                      <span className="text-sm text-muted-foreground">{r.totaal} kandidaat{r.totaal === 1 ? "" : "en"}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {Object.entries(r.per_status).map(([status, aantal]) => (
                        <Badge key={status} variant="secondary" className="text-xs">
                          {STATUS_LABELS[status] ?? status}: {aantal}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <KernvragenDialoog open={kernOpen} onOpenChange={setKernOpen} functies={(functies ?? []).filter((f) => f.actief)} functieId={kernFunctieId} setFunctieId={setKernFunctieId} />
    </div>
  );
}

// ── Kernvragen-beheer ──────────────────────────────────────────────────────────
// Vaste kernvragen zijn per functie identiek voor elke kandidaat
// (vergelijkbaarheid). AI kan een voorstel doen; de mens bewerkt en bewaart.

function KernvragenDialoog({ open, onOpenChange, functies, functieId, setFunctieId }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  functies: Array<{ id: number; naam: string }>;
  functieId: number | null;
  setFunctieId: (id: number | null) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [werkset, setWerkset] = useState<string[] | null>(null);

  const kernQuery = useListFunctieKernvragen(functieId ?? 0, {
    query: { enabled: open && !!functieId, queryKey: getListFunctieKernvragenQueryKey(functieId ?? 0) },
  });
  // Set-sync patroon: werkset pas initialiseren uit een GESLAAGDE fetch,
  // en Bewaren blokkeren tot de werkset er is (anders wist [] stilzwijgend alles).
  const vragen = werkset ?? (kernQuery.isSuccess ? kernQuery.data.map((v) => v.vraag) : null);

  const bewaar = useSetFunctieKernvragen();
  const stelVoor = useStelFunctieKernvragenVoor();

  async function opslaan() {
    if (!functieId || vragen === null) return;
    try {
      await bewaar.mutateAsync({ id: functieId, data: { vragen: vragen.filter((v) => v.trim()) } });
      await queryClient.invalidateQueries({ queryKey: getListFunctieKernvragenQueryKey(functieId) });
      setWerkset(null);
      toast({ title: "Kernvragen bewaard" });
    } catch {
      toast({ title: "Bewaren mislukt", variant: "destructive" });
    }
  }

  async function aiVoorstel() {
    if (!functieId) return;
    try {
      const res = await stelVoor.mutateAsync({ id: functieId });
      setWerkset([...(vragen ?? []), ...res.vragen]);
      toast({ title: "AI-voorstel toegevoegd", description: "Controleer, bewerk en bewaar de lijst — het voorstel is pas definitief na bewaren." });
    } catch (err) {
      toast({ title: "AI-voorstel mislukt", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setWerkset(null); setFunctieId(null); } }}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Vaste kernvragen per functie</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Deze vragen worden aan elke kandidaat op dezelfde functie gesteld, zodat kandidaten vergelijkbaar zijn.
        </p>
        <Select value={functieId ? String(functieId) : ""} onValueChange={(v) => { setFunctieId(Number(v)); setWerkset(null); }}>
          <SelectTrigger><SelectValue placeholder="Kies een functie" /></SelectTrigger>
          <SelectContent>
            {functies.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.naam}</SelectItem>)}
          </SelectContent>
        </Select>
        {functieId && (
          <div className="space-y-2">
            {vragen === null ? (
              <Skeleton className="h-10 w-full" />
            ) : vragen.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nog geen kernvragen voor deze functie.</p>
            ) : (
              vragen.map((vraag, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Input value={vraag} onChange={(e) => {
                    const kopie = [...vragen]; kopie[i] = e.target.value; setWerkset(kopie);
                  }} />
                  <Button variant="ghost" size="icon" onClick={() => setWerkset(vragen.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setWerkset([...(vragen ?? []), ""])} disabled={vragen === null}>
                <Plus className="mr-1 h-4 w-4" /> Vraag toevoegen
              </Button>
              <Button variant="outline" size="sm" onClick={aiVoorstel} disabled={stelVoor.isPending}
                className="border-amber-300 bg-amber-100 text-amber-700 hover:bg-amber-200">
                <Sparkles className="mr-1 h-4 w-4" /> {stelVoor.isPending ? "AI denkt na..." : "AI-voorstel"}
              </Button>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button onClick={opslaan} disabled={!functieId || vragen === null || bewaar.isPending}>
            {bewaar.isPending ? "Bezig..." : "Bewaren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
