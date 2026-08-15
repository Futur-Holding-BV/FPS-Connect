// NP_INKOOP_01 — Algemene inkoop (niet-projectgebonden).
// Twee soorten: op rekening (A-nummer direct groot in beeld als factuurkenmerk)
// en direct betaald (bon verplicht om af te ronden). Boven de goedkeuringsgrens
// loopt de regel via de generieke goedkeuringsmotor.
import { useMemo, useState } from "react";
import {
  useListAlgemeneInkoop,
  getListAlgemeneInkoopQueryKey,
  useCreateAlgemeneInkoop,
  useRondAlgemeneInkoopAf,
  useListLeveranciers,
} from "@workspace/api-client-react";
import type { AlgemeneInkoop } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { GoedkeuringWidget } from "@/components/goedkeuring/goedkeuring-widget";
import { GoedkeuringLabel } from "@/components/goedkeuring/goedkeuring-label";
import { NieuweLeverancierDialoog } from "@/components/nieuwe-leverancier-dialoog";
import { PaginaHulp } from "@/components/pagina-hulp";
import {
  Plus, Copy, Check, Receipt, CreditCard, Loader2, Paperclip, ShoppingCart, ExternalLink,
} from "lucide-react";
import { Link } from "wouter";

const KOSTENSOORTEN: { waarde: string; label: string }[] = [
  { waarde: "algemene_kosten", label: "Algemene kosten" },
  { waarde: "gereedschap", label: "Gereedschap" },
  { waarde: "wagenpark", label: "Wagenpark" },
  { waarde: "investering", label: "Investering" },
  { waarde: "representatie", label: "Representatie" },
  { waarde: "software", label: "Software" },
  { waarde: "verzekering", label: "Verzekering" },
];

const BETAALWIJZEN: { waarde: string; label: string }[] = [
  { waarde: "zakelijke_pas", label: "Zakelijke pas" },
  { waarde: "creditcard", label: "Creditcard" },
  { waarde: "contant", label: "Contant" },
  { waarde: "ideal", label: "iDEAL" },
];

const STATUS_INFO: Record<string, { label: string; kleur: string }> = {
  ter_goedkeuring: { label: "Wacht op goedkeuring", kleur: "bg-amber-100 text-amber-800 border-amber-200" },
  besteld: { label: "Besteld — wacht op factuur", kleur: "bg-blue-100 text-blue-800 border-blue-200" },
  factuur_ontvangen: { label: "Factuur ontvangen", kleur: "bg-violet-100 text-violet-800 border-violet-200" },
  open: { label: "Open — bon toevoegen", kleur: "bg-blue-100 text-blue-800 border-blue-200" },
  afgehandeld: { label: "Afgehandeld", kleur: "bg-secondary text-muted-foreground border-transparent" },
};

function kostensoortLabel(waarde: string): string {
  return KOSTENSOORTEN.find((k) => k.waarde === waarde)?.label ?? waarde;
}

function KopieerbaarNummer({ nummer, groot = false }: { nummer: string; groot?: boolean }) {
  const [gekopieerd, setGekopieerd] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(nummer).then(() => {
          setGekopieerd(true);
          setTimeout(() => setGekopieerd(false), 1500);
        });
      }}
      className={groot
        ? "inline-flex items-center gap-3 rounded-xl border-2 border-primary/30 bg-primary/5 px-6 py-4 font-mono text-4xl font-bold tracking-wider text-primary hover:bg-primary/10"
        : "inline-flex items-center gap-1.5 font-mono font-semibold hover:text-primary"}
      title="Klik om te kopiëren"
    >
      {nummer}
      {gekopieerd ? <Check className={groot ? "h-6 w-6" : "h-3.5 w-3.5"} /> : <Copy className={groot ? "h-6 w-6" : "h-3.5 w-3.5"} />}
    </button>
  );
}

export default function AlgemeneInkoopPagina() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>("lopend");
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [nieuweLevOpen, setNieuweLevOpen] = useState(false);
  const [detail, setDetail] = useState<AlgemeneInkoop | null>(null);
  const [netAangemaakt, setNetAangemaakt] = useState<AlgemeneInkoop | null>(null);
  const [uploadBezig, setUploadBezig] = useState(false);

  // Nieuw-formulier
  const [soort, setSoort] = useState<"op_rekening" | "direct_betaald">("op_rekening");
  const [omschrijving, setOmschrijving] = useState("");
  const [kostensoort, setKostensoort] = useState("");
  const [leverancierId, setLeverancierId] = useState<number | null>(null);
  const [leverancierNaam, setLeverancierNaam] = useState("");
  const [verwachtBedrag, setVerwachtBedrag] = useState("");
  const [betaalwijze, setBetaalwijze] = useState("");
  const [bedrag, setBedrag] = useState("");
  const [opmerkingen, setOpmerkingen] = useState("");

  const { data: inkopen = [], isLoading } = useListAlgemeneInkoop();
  const { data: leveranciers = [] } = useListLeveranciers();

  const vernieuw = (): void => {
    void queryClient.invalidateQueries({ queryKey: getListAlgemeneInkoopQueryKey() });
  };

  const { mutate: maakAan, isPending: aanmakenBezig } = useCreateAlgemeneInkoop({
    mutation: {
      onSuccess: (rij) => {
        vernieuw();
        setNieuwOpen(false);
        resetFormulier();
        if (rij.soort === "op_rekening") {
          setNetAangemaakt(rij); // nummer groot in beeld
        } else {
          toast({ title: "Inkoop vastgelegd", description: "Voeg de bon toe om de inkoop te kunnen afronden." });
          setDetail(rij);
        }
      },
      onError: (err: unknown) => {
        const bericht = (err as { error?: string } | undefined)?.error ?? "Vastleggen mislukt";
        toast({ title: bericht, variant: "destructive" });
      },
    },
  });

  const { mutate: rondAf, isPending: afrondenBezig } = useRondAlgemeneInkoopAf({
    mutation: {
      onSuccess: (rij) => {
        vernieuw();
        setDetail(rij);
        toast({ title: `${rij.nummer_weergave} afgehandeld` });
      },
      onError: (err: unknown) => {
        const bericht = (err as { error?: string } | undefined)?.error ?? "Afronden mislukt";
        toast({ title: bericht, variant: "destructive" });
      },
    },
  });

  function resetFormulier(): void {
    setSoort("op_rekening"); setOmschrijving(""); setKostensoort("");
    setLeverancierId(null); setLeverancierNaam(""); setVerwachtBedrag("");
    setBetaalwijze(""); setBedrag(""); setOpmerkingen("");
  }

  async function uploadBon(inkoop: AlgemeneInkoop, bestand: File): Promise<void> {
    setUploadBezig(true);
    try {
      const form = new FormData();
      form.append("bestand", bestand);
      const resp = await fetch(`/api/algemene-inkoop/${inkoop.id}/bon`, { method: "POST", body: form });
      if (!resp.ok) {
        const body = await resp.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "Upload mislukt");
      }
      const bijgewerkt = await resp.json() as AlgemeneInkoop;
      vernieuw();
      setDetail(bijgewerkt);
      toast({ title: "Bon toegevoegd" });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Upload mislukt", variant: "destructive" });
    } finally {
      setUploadBezig(false);
    }
  }

  const gefilterd = useMemo(() => {
    if (filter === "alles") return inkopen;
    if (filter === "lopend") return inkopen.filter((r) => r.status !== "afgehandeld");
    return inkopen.filter((r) => r.status === filter);
  }, [inkopen, filter]);

  const kanAanmaken = omschrijving.trim().length > 0 && kostensoort
    && (leverancierId != null || leverancierNaam.trim().length > 0)
    && (soort === "op_rekening" || (betaalwijze && bedrag && Number(bedrag) > 0));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PaginaHulp pagina="algemene-inkoop" />
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ShoppingCart className="h-6 w-6" /> Algemene inkoop
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Inkoop zonder project: kantoorartikelen, gereedschap, webshopbestellingen. Op rekening krijgt direct een A‑nummer voor op de factuur.
          </p>
        </div>
        <Button onClick={() => { resetFormulier(); setNieuwOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Nieuwe inkoop
        </Button>
      </div>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="lopend">Lopend</TabsTrigger>
          <TabsTrigger value="ter_goedkeuring">Wacht op goedkeuring</TabsTrigger>
          <TabsTrigger value="afgehandeld">Afgehandeld</TabsTrigger>
          <TabsTrigger value="alles">Alles</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : gefilterd.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nog geen algemene inkopen{filter !== "alles" ? " in deze weergave" : ""}. Leg een bestelling op rekening of een directe betaling vast met "Nieuwe inkoop".
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {gefilterd.map((r) => {
            const status = STATUS_INFO[r.status] ?? { label: r.status, kleur: "bg-secondary" };
            return (
              <Card key={r.id} className="cursor-pointer hover:border-primary/40" onClick={() => setDetail(r)}>
                <CardContent className="py-3 px-4 flex items-center gap-4">
                  <div className="w-20 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <KopieerbaarNummer nummer={r.nummer_weergave} />
                  </div>
                  <div className="shrink-0">
                    {r.soort === "op_rekening"
                      ? <Receipt className="h-4 w-4 text-muted-foreground" aria-label="Op rekening" />
                      : <CreditCard className="h-4 w-4 text-muted-foreground" aria-label="Direct betaald" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{r.omschrijving}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.leverancier_naam} · {kostensoortLabel(r.kostensoort)}
                      {r.besteld_door_naam ? ` · ${r.besteld_door_naam}` : ""}
                    </p>
                  </div>
                  <div className="text-sm font-medium tabular-nums shrink-0">
                    {r.soort === "direct_betaald" && r.bedrag != null && `€ ${r.bedrag.toFixed(2)}`}
                    {r.soort === "op_rekening" && r.verwacht_bedrag != null && `± € ${r.verwacht_bedrag.toFixed(2)}`}
                  </div>
                  {r.soort === "direct_betaald" && r.bon_pad && <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-label="Bon aanwezig" />}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant="outline" className={`${status.kleur}`}>{status.label}</Badge>
                    <GoedkeuringLabel
                      objectType="algemene_inkoop"
                      objectId={r.id}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Nieuw ── */}
      <Dialog open={nieuwOpen} onOpenChange={setNieuwOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nieuwe algemene inkoop</DialogTitle>
            <DialogDescription>Voor inkoop zonder project. Projectinkoop loopt via Werkvoorbereiding.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSoort("op_rekening")}
                className={`rounded-lg border p-3 text-left ${soort === "op_rekening" ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <Receipt className="h-4 w-4 mb-1" />
                <p className="text-sm font-medium">Op rekening</p>
                <p className="text-xs text-muted-foreground">Factuur volgt; je krijgt direct een A‑nummer</p>
              </button>
              <button
                type="button"
                onClick={() => setSoort("direct_betaald")}
                className={`rounded-lg border p-3 text-left ${soort === "direct_betaald" ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <CreditCard className="h-4 w-4 mb-1" />
                <p className="text-sm font-medium">Direct betaald</p>
                <p className="text-xs text-muted-foreground">Pas, creditcard, contant of iDEAL — bon verplicht</p>
              </button>
            </div>

            <div className="space-y-1">
              <Label>Omschrijving *</Label>
              <Input value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} placeholder="Bijv. printpapier en tonercartridges" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Kostensoort *</Label>
                <Select value={kostensoort} onValueChange={setKostensoort}>
                  <SelectTrigger><SelectValue placeholder="Kies kostensoort" /></SelectTrigger>
                  <SelectContent>
                    {KOSTENSOORTEN.map((k) => <SelectItem key={k.waarde} value={k.waarde}>{k.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{soort === "op_rekening" ? "Verwacht bedrag (incl. btw)" : "Bedrag (incl. btw) *"}</Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={soort === "op_rekening" ? verwachtBedrag : bedrag}
                  onChange={(e) => (soort === "op_rekening" ? setVerwachtBedrag(e.target.value) : setBedrag(e.target.value))}
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Leverancier of webshop *</Label>
              <div className="flex gap-2">
                <Select
                  value={leverancierId != null ? String(leverancierId) : "vrij"}
                  onValueChange={(w) => {
                    if (w === "vrij") { setLeverancierId(null); return; }
                    const lev = leveranciers.find((l) => l.id === Number(w));
                    setLeverancierId(lev?.id ?? null);
                    setLeverancierNaam(lev?.naam ?? "");
                  }}
                >
                  <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vrij">Vrije naam (niet in register)</SelectItem>
                    {leveranciers.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.naam}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={() => setNieuweLevOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Nieuw
                </Button>
              </div>
              {leverancierId == null && (
                <Input
                  className="mt-2"
                  value={leverancierNaam}
                  onChange={(e) => setLeverancierNaam(e.target.value)}
                  placeholder="Naam leverancier of webshop, bijv. bol.com"
                />
              )}
            </div>

            {soort === "direct_betaald" && (
              <div className="space-y-1">
                <Label>Betaalwijze *</Label>
                <Select value={betaalwijze} onValueChange={setBetaalwijze}>
                  <SelectTrigger><SelectValue placeholder="Hoe is er betaald?" /></SelectTrigger>
                  <SelectContent>
                    {BETAALWIJZEN.map((b) => <SelectItem key={b.waarde} value={b.waarde}>{b.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label>Opmerkingen</Label>
              <Textarea rows={2} value={opmerkingen} onChange={(e) => setOpmerkingen(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNieuwOpen(false)}>Annuleren</Button>
            <Button
              disabled={!kanAanmaken || aanmakenBezig}
              onClick={() => maakAan({ data: {
                soort,
                omschrijving: omschrijving.trim(),
                kostensoort: kostensoort as never,
                leverancier_id: leverancierId,
                leverancier_naam: leverancierId == null ? leverancierNaam.trim() : undefined,
                verwacht_bedrag: soort === "op_rekening" && verwachtBedrag ? Number(verwachtBedrag) : undefined,
                betaalwijze: soort === "direct_betaald" ? (betaalwijze as never) : undefined,
                bedrag: soort === "direct_betaald" ? Number(bedrag) : undefined,
                opmerkingen: opmerkingen.trim() || undefined,
              }})}
            >
              {aanmakenBezig && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Vastleggen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Nummer groot in beeld na aanmaken (op rekening) ── */}
      <Dialog open={netAangemaakt != null} onOpenChange={(open) => { if (!open) setNetAangemaakt(null); }}>
        <DialogContent className="sm:max-w-md text-center">
          <DialogHeader>
            <DialogTitle>Gebruik dit nummer bij je bestelling</DialogTitle>
            <DialogDescription>
              Vraag de leverancier dit nummer als referentie op de factuur te zetten — dan wordt de factuur straks automatisch herkend en gekoppeld.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 flex justify-center">
            {netAangemaakt && <KopieerbaarNummer nummer={netAangemaakt.nummer_weergave} groot />}
          </div>
          {netAangemaakt?.status === "ter_goedkeuring" && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
              Let op: deze inkoop valt boven de goedkeuringsgrens en moet eerst worden goedgekeurd voordat je bestelt.
            </p>
          )}
          <DialogFooter className="sm:justify-center">
            <Button onClick={() => { const r = netAangemaakt; setNetAangemaakt(null); if (r) setDetail(r); }}>Sluiten</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Detail ── */}
      <Dialog open={detail != null} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <DialogContent className="sm:max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <KopieerbaarNummer nummer={detail.nummer_weergave} />
                  <Badge variant="outline" className={STATUS_INFO[detail.status]?.kleur}>{STATUS_INFO[detail.status]?.label ?? detail.status}</Badge>
                </DialogTitle>
                <DialogDescription>{detail.omschrijving}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <span className="text-muted-foreground">Soort</span>
                  <span>{detail.soort === "op_rekening" ? "Op rekening" : "Direct betaald"}</span>
                  <span className="text-muted-foreground">Leverancier</span>
                  <span>{detail.leverancier_naam}</span>
                  <span className="text-muted-foreground">Kostensoort</span>
                  <span>{kostensoortLabel(detail.kostensoort)}</span>
                  {detail.soort === "op_rekening" && detail.verwacht_bedrag != null && (<>
                    <span className="text-muted-foreground">Verwacht bedrag</span>
                    <span>€ {detail.verwacht_bedrag.toFixed(2)} incl. btw</span>
                  </>)}
                  {detail.soort === "direct_betaald" && (<>
                    <span className="text-muted-foreground">Betaalwijze</span>
                    <span>{BETAALWIJZEN.find((b) => b.waarde === detail.betaalwijze)?.label ?? detail.betaalwijze ?? "—"}</span>
                    {detail.bedrag != null && (<>
                      <span className="text-muted-foreground">Bedrag</span>
                      <span>€ {detail.bedrag.toFixed(2)} incl. btw</span>
                    </>)}
                    {detail.betaald_op && (<>
                      <span className="text-muted-foreground">Betaald op</span>
                      <span>{detail.betaald_op}</span>
                    </>)}
                  </>)}
                  {detail.factuur_id != null && (<>
                    <span className="text-muted-foreground">Gekoppelde factuur</span>
                    <span>
                      <Link href={`/facturen/${detail.factuur_id}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                        {detail.factuur_nummer ?? `#${detail.factuur_id}`} <ExternalLink className="h-3 w-3" />
                      </Link>
                    </span>
                  </>)}
                  {detail.opmerkingen && (<>
                    <span className="text-muted-foreground">Opmerkingen</span>
                    <span>{detail.opmerkingen}</span>
                  </>)}
                </div>

                {/* Bon (verplicht bij direct betaald) */}
                {detail.soort === "direct_betaald" && detail.status !== "afgehandeld" && (
                  <div className="rounded-md border p-3 space-y-2">
                    <p className="font-medium flex items-center gap-1.5"><Paperclip className="h-4 w-4" /> Bon (verplicht om af te ronden)</p>
                    {detail.bon_pad
                      ? <p className="text-xs text-green-700">Bon aanwezig — je kunt de inkoop afronden.</p>
                      : <p className="text-xs text-muted-foreground">Nog geen bon. Voeg een foto of pdf toe.</p>}
                    <Input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                      disabled={uploadBezig}
                      onChange={(e) => {
                        const bestand = e.target.files?.[0];
                        if (bestand) void uploadBon(detail, bestand);
                        e.target.value = "";
                      }}
                    />
                  </div>
                )}
                {detail.bon_pad && (
                  <a
                    href={`/api/algemene-inkoop/${detail.id}/bon`}
                    target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
                  >
                    <Paperclip className="h-3.5 w-3.5" /> Bon bekijken
                  </a>
                )}

                {/* Goedkeuring via de bestaande motor */}
                {detail.status === "ter_goedkeuring" && (
                  <GoedkeuringWidget
                    objectType="algemene_inkoop"
                    objectId={detail.id}
                    documentType="algemene_inkoop"
                    bedrag={detail.soort === "direct_betaald" ? detail.bedrag ?? null : detail.verwacht_bedrag ?? null}
                    omschrijving={`Algemene inkoop ${detail.nummer_weergave} — ${detail.omschrijving}`}
                    toonIndienKnop
                    onWijziging={() => { vernieuw(); setDetail(null); }}
                  />
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDetail(null)}>Sluiten</Button>
                {detail.status !== "afgehandeld" && detail.status !== "ter_goedkeuring" && (
                  <Button
                    disabled={afrondenBezig || (detail.soort === "direct_betaald" && !detail.bon_pad)}
                    onClick={() => rondAf({ id: detail.id })}
                  >
                    {afrondenBezig && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Afronden
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <NieuweLeverancierDialoog
        open={nieuweLevOpen}
        onOpenChange={setNieuweLevOpen}
        onAangemaakt={(lev) => { setLeverancierId(lev.id); setLeverancierNaam(lev.naam); }}
      />
    </div>
  );
}
