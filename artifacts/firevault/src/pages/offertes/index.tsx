import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  useListOffertes,
  useCreateOfferte,
  useOfferteRegelsUitSpots,
  useListGebouwen,
  useListCrmKlanten,
  useGetOfferteAnalytics,
  useListOfferteSjablonen,
  getListOffertesQueryKey,
} from "@workspace/api-client-react";
import type { OfferteInput } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { PaginaHulp } from "@/components/pagina-hulp";
import { FileText, Plus, Search, Sparkles, PenLine, TrendingUp, CheckCircle, Send, Eye, Clock, FolderOpen, XCircle, AlertTriangle, Download, Euro, ArrowRight } from "lucide-react";
import { Link } from "wouter";

const STATUS_KLEUR: Record<string, string> = {
  concept: "bg-amber-100 text-amber-800 border-amber-200",
  verzonden: "bg-blue-100 text-blue-800 border-blue-200",
  geaccepteerd: "bg-emerald-100 text-emerald-800 border-emerald-200",
  afgewezen: "bg-rose-100 text-rose-800 border-rose-200",
  vervallen: "bg-muted text-muted-foreground border-border",
};

function euro(bedrag: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(bedrag ?? 0);
}

const DOELGROEP_OPTIES = [
  { value: "algemeen", label: "Algemeen" },
  { value: "vve", label: "VvE / appartementencomplex" },
  { value: "aannemer", label: "Aannemer / bouwpartner" },
  { value: "overig", label: "Overig" },
];

const LEEG: OfferteInput = {
  titel: "",
  opdrachtgever: "",
  geldigheid_dagen: 30,
  btw_percentage: 21,
};

const PORTAAL_STATUS_KLEUR: Record<string, string> = {
  verzonden: "bg-blue-100 text-blue-800 border-blue-200",
  bekeken: "bg-indigo-100 text-indigo-800 border-indigo-200",
  ondertekend: "bg-emerald-100 text-emerald-800 border-emerald-200",
  afgewezen: "bg-rose-100 text-rose-800 border-rose-200",
};

const PORTAAL_STATUS_LABEL: Record<string, string> = {
  verzonden: "Verzonden",
  bekeken: "Bekeken",
  ondertekend: "Ondertekend",
  afgewezen: "Afgewezen",
};

export default function OffertesPagina() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { data: offertes, isLoading } = useListOffertes();
  const { data: gebouwen } = useListGebouwen();
  const { data: klanten } = useListCrmKlanten();
  const { data: analytics } = useGetOfferteAnalytics();
  const { data: sjablonen } = useListOfferteSjablonen();
  const maakOfferte = useCreateOfferte();
  const uitSpots = useOfferteRegelsUitSpots();

  const [zoek, setZoek] = useState("");
  const [doelgroepFilter, setDoelgroepFilter] = useState("alle");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<OfferteInput>(LEEG);
  const [gekozenDoelgroep, setGekozenDoelgroep] = useState("algemeen");

  const geselecteerdeKlant = (klanten ?? []).find((k) => k.id === form.klant_id) ?? null;
  const geselecteerdGebouw = (gebouwen ?? []).find((g) => g.id === form.gebouw_id) ?? null;
  const gefilterdeSjablonen = (sjablonen ?? []).filter(
    (s) => s.actief && (gekozenDoelgroep === "algemeen" || s.doelgroep === gekozenDoelgroep || s.doelgroep === "algemeen")
  );

  const gefilterd = (offertes ?? []).filter((o) => {
    const t = zoek.trim().toLowerCase();
    if (!t) return true;
    return (
      o.titel.toLowerCase().includes(t) ||
      (o.opdrachtgever ?? "").toLowerCase().includes(t) ||
      (o.offertenummer ?? "").toLowerCase().includes(t)
    );
  });

  async function herlaad() {
    await queryClient.invalidateQueries({ queryKey: getListOffertesQueryKey() });
  }

  async function opslaan() {
    if (!form.titel.trim()) {
      toast({ title: "Titel is verplicht", variant: "destructive" });
      return;
    }
    try {
      const schoon: OfferteInput = {
        titel: form.titel.trim(),
        opdrachtgever: form.opdrachtgever?.trim() || undefined,
        gebouw_id: form.gebouw_id ?? undefined,
        klant_id: form.klant_id ?? undefined,
        geldigheid_dagen: form.geldigheid_dagen,
        btw_percentage: form.btw_percentage,
        voorwaarden: form.voorwaarden?.trim() || undefined,
      };
      await maakOfferte.mutateAsync({ data: schoon });
      await herlaad();
      toast({ title: "Offerte aangemaakt" });
      setForm(LEEG);
      setOpen(false);
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  async function bereidVoorUitSpots(id: number) {
    try {
      await uitSpots.mutateAsync({ id });
      await herlaad();
      toast({ title: "Begrotingsregels voorbereid uit spots" });
    } catch {
      toast({ title: "Voorbereiden mislukt", description: "Koppel eerst een gebouw met spots.", variant: "destructive" });
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PaginaHulp pagina="offertes" />
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Offertes</h1>
          <p className="text-sm text-muted-foreground">
            Offertes voorbereiden — begrotingsregels uit spots, handmatig afronden. Geen automatische verzending.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Nieuwe offerte
        </Button>
      </div>

      {analytics && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <Card>
              <CardContent className="p-3 flex items-center gap-2">
                <Send className="h-4 w-4 text-blue-600 shrink-0" />
                <div>
                  <div className="text-xl font-bold">{analytics.verzonden}</div>
                  <div className="text-xs text-muted-foreground">Verzonden</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 flex items-center gap-2">
                <Eye className="h-4 w-4 text-indigo-600 shrink-0" />
                <div>
                  <div className="text-xl font-bold">{analytics.bekeken}</div>
                  <div className="text-xs text-muted-foreground">Bekeken</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                <div>
                  <div className="text-xl font-bold">{analytics.ondertekend}</div>
                  <div className="text-xs text-muted-foreground">Geaccepteerd</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 flex items-center gap-2">
                <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                <div>
                  <div className="text-xl font-bold">{analytics.afgewezen}</div>
                  <div className="text-xs text-muted-foreground">Afgewezen</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                <div>
                  <div className="text-xl font-bold">{analytics.vervallen}</div>
                  <div className="text-xs text-muted-foreground">Vervallen</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <div className="text-xl font-bold">{analytics.conversie_procent.toFixed(0)}%</div>
                  <div className="text-xs text-muted-foreground">Conversie</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 flex items-center gap-2">
                <Euro className="h-4 w-4 text-emerald-600 shrink-0" />
                <div>
                  <div className="text-xl font-bold">{analytics.gemiddelde_waarde > 0 ? euro(analytics.gemiddelde_waarde) : "—"}</div>
                  <div className="text-xs text-muted-foreground">Gem. waarde</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                <div>
                  <div className="text-xl font-bold">
                    {analytics.gemiddelde_doorlooptijd_dagen > 0
                      ? `${analytics.gemiddelde_doorlooptijd_dagen}d`
                      : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">Gem. doorlooptijd</div>
                </div>
              </CardContent>
            </Card>
          </div>
          {analytics.top_bijlagen.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Download className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Meest gedownloade bijlagen</span>
                </div>
                <div className="space-y-1.5">
                  {analytics.top_bijlagen.map((b, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground truncate max-w-[70%]">
                        {b.offertenummer ? `${b.offertenummer} — ` : ""}{b.titel ?? "Onbekend"}
                      </span>
                      <span className="font-medium shrink-0">{b.downloads}×</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Zoek op titel, opdrachtgever of nummer…" value={zoek} onChange={(e) => setZoek(e.target.value)} className="pl-9" />
        </div>
        <Select value={doelgroepFilter} onValueChange={setDoelgroepFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Alle doelgroepen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle doelgroepen</SelectItem>
            {DOELGROEP_OPTIES.map((d) => (
              <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36 w-full" />)}
        </div>
      ) : gefilterd.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>Geen offertes gevonden.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {gefilterd.map((o) => (
            <div
              key={o.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/offertes/${o.id}`)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/offertes/${o.id}`); } }}
              className="group relative rounded-xl border bg-card cursor-pointer shadow-sm hover:shadow-md hover:-translate-y-px hover:bg-muted/30 transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{o.titel}</div>
                    {o.offertenummer && <div className="text-xs text-muted-foreground">{o.offertenummer}</div>}
                  </div>
                  <div className="flex flex-col gap-1 items-end shrink-0">
                    <Badge variant="outline" className={STATUS_KLEUR[o.status] ?? ""}>{o.status}</Badge>
                    {(o as { portaal_status?: string }).portaal_status && (o as { portaal_status?: string }).portaal_status !== "concept" && (
                      <Badge variant="outline" className={PORTAAL_STATUS_KLEUR[(o as { portaal_status?: string }).portaal_status!] ?? ""}>
                        {PORTAAL_STATUS_LABEL[(o as { portaal_status?: string }).portaal_status!] ?? (o as { portaal_status?: string }).portaal_status}
                      </Badge>
                    )}
                    {(o as { ai_acceptatiescore?: string }).ai_acceptatiescore === "hoog" && (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1">
                        <Sparkles className="h-3 w-3" /> AI hoog
                      </Badge>
                    )}
                    {(o as { onbeantwoorde_vragen?: number }).onbeantwoorde_vragen != null &&
                      (o as { onbeantwoorde_vragen?: number }).onbeantwoorde_vragen! > 0 && (
                      <Badge className="bg-rose-600 text-white border-rose-600 gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {(o as { onbeantwoorde_vragen?: number }).onbeantwoorde_vragen!}{" "}
                        {(o as { onbeantwoorde_vragen?: number }).onbeantwoorde_vragen! === 1 ? "vraag" : "vragen"}
                      </Badge>
                    )}
                    {o.portaal_status === "ondertekend" && o.gebouw_id && (
                      <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        <Link href={`/gebouwen/${o.gebouw_id}`}>
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 cursor-pointer hover:bg-emerald-100 gap-1">
                            <FolderOpen className="h-3 w-3" />
                            Project geopend
                          </Badge>
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {o.opdrachtgever && <div>{o.opdrachtgever}</div>}
                  {o.gebouw_naam && <div>Gebouw: {o.gebouw_naam}</div>}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">{euro(o.bedrag_excl_btw)} <span className="text-xs text-muted-foreground">excl. btw</span></div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                {o.gebouw_id && o.status === "concept" && (
                  <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="outline" onClick={() => bereidVoorUitSpots(o.id)} disabled={uitSpots.isPending}>
                      <Sparkles className="h-3.5 w-3.5" /> Uit spots
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nieuwe offerte</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Titel *</Label>
              <Input value={form.titel} onChange={(e) => setForm({ ...form, titel: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Opdrachtgever</Label>
              <Input value={form.opdrachtgever ?? ""} onChange={(e) => setForm({ ...form, opdrachtgever: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Klant</Label>
              <Select
                value={form.klant_id ? String(form.klant_id) : undefined}
                onValueChange={(v) => {
                  const id = Number(v);
                  const k = (klanten ?? []).find((x) => x.id === id);
                  setForm((f) => ({
                    ...f,
                    klant_id: id,
                    opdrachtgever: f.opdrachtgever?.trim() ? f.opdrachtgever : (k?.naam ?? f.opdrachtgever),
                  }));
                }}
              >
                <SelectTrigger><SelectValue placeholder="Geen koppeling" /></SelectTrigger>
                <SelectContent>
                  {(klanten ?? []).map((k) => <SelectItem key={k.id} value={String(k.id)}>{k.naam}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {geselecteerdeKlant && (
              <div className="sm:col-span-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground space-y-0.5">
                <div className="font-medium text-foreground">Gegevens klant — {geselecteerdeKlant.naam}</div>
                {geselecteerdeKlant.adres && <div>{geselecteerdeKlant.adres}</div>}
                {(geselecteerdeKlant.postcode || geselecteerdeKlant.stad) && (
                  <div>{[geselecteerdeKlant.postcode, geselecteerdeKlant.stad].filter(Boolean).join("  ")}</div>
                )}
                {geselecteerdeKlant.telefoon && <div>Tel: {geselecteerdeKlant.telefoon}</div>}
                {geselecteerdeKlant.email && <div>{geselecteerdeKlant.email}</div>}
                {!geselecteerdeKlant.adres && !geselecteerdeKlant.stad && !geselecteerdeKlant.telefoon && !geselecteerdeKlant.email && (
                  <div>Geen adres- of contactgegevens vastgelegd bij deze klant.</div>
                )}
              </div>
            )}
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Gebouw (voor voorbereiding uit spots)</Label>
              <Select
                value={form.gebouw_id ? String(form.gebouw_id) : undefined}
                onValueChange={(v) => {
                  const id = Number(v);
                  const g = (gebouwen ?? []).find((x) => x.id === id);
                  setForm((f) => ({
                    ...f,
                    gebouw_id: id,
                    titel: f.titel.trim() ? f.titel : (g ? `Offerte ${g.naam}` : f.titel),
                  }));
                }}
              >
                <SelectTrigger><SelectValue placeholder="Geen koppeling" /></SelectTrigger>
                <SelectContent>
                  {(gebouwen ?? []).map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.naam}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {geselecteerdGebouw && (
              <div className="sm:col-span-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground space-y-0.5">
                <div className="font-medium text-foreground">Gegevens gebouw — {geselecteerdGebouw.naam}</div>
                {geselecteerdGebouw.adres && <div>{geselecteerdGebouw.adres}</div>}
                {(geselecteerdGebouw.postcode || geselecteerdGebouw.stad) && (
                  <div>{[geselecteerdGebouw.postcode, geselecteerdGebouw.stad].filter(Boolean).join("  ")}</div>
                )}
                {geselecteerdGebouw.klant_naam && <div>Klant van gebouw: {geselecteerdGebouw.klant_naam}</div>}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Geldigheid (dagen)</Label>
              <Input
                type="number"
                value={form.geldigheid_dagen ?? 30}
                onChange={(e) => setForm({ ...form, geldigheid_dagen: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Btw %</Label>
              <Input
                type="number"
                value={form.btw_percentage ?? 21}
                onChange={(e) => setForm({ ...form, btw_percentage: Number(e.target.value) })}
              />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Doelgroep</Label>
              <Select
                value={gekozenDoelgroep}
                onValueChange={(v) => {
                  setGekozenDoelgroep(v);
                  setForm((f) => ({ ...f, sjabloon_id: undefined }));
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOELGROEP_OPTIES.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {gefilterdeSjablonen.length > 0 && (
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Sjabloon (optioneel)</Label>
                <Select
                  value={form.sjabloon_id ? String(form.sjabloon_id) : undefined}
                  onValueChange={(v) => setForm((f) => ({ ...f, sjabloon_id: v ? Number(v) : undefined }))}
                >
                  <SelectTrigger><SelectValue placeholder="Geen sjabloon" /></SelectTrigger>
                  <SelectContent>
                    {gefilterdeSjablonen.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.naam}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
            <Button onClick={opslaan} disabled={maakOfferte.isPending}>
              {maakOfferte.isPending ? "Bezig…" : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
