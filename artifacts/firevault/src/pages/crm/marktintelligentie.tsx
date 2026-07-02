import { useState } from "react";
import {
  useListCrmMarktintelligentie,
  useListCrmKlanten,
  useListCrmConcurrenten,
  useCreateCrmMarktintelligentie,
  useScanCrmMarktintelligentieAi,
  useGetCrmScoutStatus,
  useStartCrmScout,
  getListCrmMarktintelligentieQueryKey,
  getGetCrmScoutStatusQueryKey,
} from "@workspace/api-client-react";
import type { CrmMarktintelligentie, CrmOrganisatie, CrmConcurrent, CrmMarktintelligentieVoorstel } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Newspaper, Plus, ArrowLeft, Calendar, Globe, Building2, Handshake, Sparkles, Loader2, Check, Radio, Clock, RefreshCw, MapPin } from "lucide-react";

const TYPES = [
  { value: "nieuws", label: "Nieuws", kleur: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "aanbesteding", label: "Aanbesteding", kleur: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "concurrentie", label: "Concurrentie", kleur: "bg-red-100 text-red-700 border-red-200" },
  { value: "kans", label: "Kans", kleur: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "risico", label: "Risico", kleur: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "overig", label: "Overig", kleur: "bg-muted text-muted-foreground border-border" },
];

function formatDatum(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso.slice(0, 10);
  }
}

export default function MarktintelligentiePagina() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState<string>("alle");
  const [bronFilter, setBronFilter] = useState<string>("alle");
  const [nieuwOpen, setNieuwOpen] = useState(false);

  const [scanSheet, setScanSheet] = useState(false);
  const [voorstellen, setVoorstellen] = useState<CrmMarktintelligentieVoorstel[]>([]);
  const [geselecteerd, setGeselecteerd] = useState<Set<number>>(new Set());
  const [opslaanBezig, setOpslaanBezig] = useState(false);

  const { data: items = [], isLoading } = useListCrmMarktintelligentie();
  const { data: orgs = [] } = useListCrmKlanten();
  const { data: concurrenten = [] } = useListCrmConcurrenten();
  const { data: scoutStatus } = useGetCrmScoutStatus();
  const aanmaken = useCreateCrmMarktintelligentie();
  const scan = useScanCrmMarktintelligentieAi();
  const startScout = useStartCrmScout();

  const alleItems = items as CrmMarktintelligentie[];
  const gefilterd = alleItems
    .filter((i) => typeFilter === "alle" || i.type === typeFilter)
    .filter((i) => {
      if (bronFilter === "alle") return true;
      if (bronFilter === "scout") return (i as unknown as { bron_type?: string }).bron_type === "scout";
      if (bronFilter === "handmatig") return (i as unknown as { bron_type?: string }).bron_type !== "scout";
      return true;
    });

  const orgMap = new Map((orgs as CrmOrganisatie[]).map((o) => [o.id, o.naam]));
  const concMap = new Map((concurrenten as CrmConcurrent[]).map((c) => [c.id, c.naam]));

  const typeInfo = (type: string) => TYPES.find((t) => t.value === type) ?? TYPES[TYPES.length - 1];

  const [velden, setVelden] = useState({ type: "nieuws", organisatie_id: "", concurrent_id: "", titel: "", inhoud: "", bron: "", regio: "", datum: new Date().toISOString().slice(0, 10) });

  async function handleAanmaken() {
    if (!velden.titel.trim()) { toast({ title: "Titel is verplicht", variant: "destructive" }); return; }
    try {
      await aanmaken.mutateAsync({ data: { type: velden.type, organisatie_id: velden.organisatie_id ? parseInt(velden.organisatie_id) : undefined, concurrent_id: velden.concurrent_id ? parseInt(velden.concurrent_id) : undefined, titel: velden.titel, inhoud: velden.inhoud || undefined, bron: velden.bron || undefined, regio: velden.regio || undefined, datum: velden.datum || undefined } });
      await qc.invalidateQueries({ queryKey: getListCrmMarktintelligentieQueryKey() });
      setNieuwOpen(false);
      setVelden({ type: "nieuws", organisatie_id: "", concurrent_id: "", titel: "", inhoud: "", bron: "", regio: "", datum: new Date().toISOString().slice(0, 10) });
      toast({ title: "Marktinformatie toegevoegd" });
    } catch {
      toast({ title: "Fout bij aanmaken", variant: "destructive" });
    }
  }

  async function handleAiScan() {
    setScanSheet(true);
    setVoorstellen([]);
    setGeselecteerd(new Set());
    try {
      const resultaten = await scan.mutateAsync();
      setVoorstellen(resultaten);
      setGeselecteerd(new Set(resultaten.map((_, i) => i)));
    } catch {
      toast({ title: "AI-scan mislukt — controleer of AI beschikbaar is", variant: "destructive" });
      setScanSheet(false);
    }
  }

  async function handleNuScannen() {
    try {
      await startScout.mutateAsync();
      await qc.invalidateQueries({ queryKey: getGetCrmScoutStatusQueryKey() });
      await qc.invalidateQueries({ queryKey: getListCrmMarktintelligentieQueryKey() });
      toast({ title: "Scout gestart — resultaten verschijnen automatisch" });
    } catch {
      toast({ title: "Scout kon niet starten", variant: "destructive" });
    }
  }

  function toggleSelectie(i: number) {
    setGeselecteerd((prev) => {
      const s = new Set(prev);
      s.has(i) ? s.delete(i) : s.add(i);
      return s;
    });
  }

  async function handleSlaOpGeselecteerde() {
    setOpslaanBezig(true);
    const teOpslaan = voorstellen.filter((_, i) => geselecteerd.has(i));
    try {
      for (const v of teOpslaan) {
        await aanmaken.mutateAsync({
          data: {
            type: v.type,
            titel: v.titel,
            inhoud: v.inhoud ?? undefined,
            bron: v.bron ?? undefined,
            regio: v.regio ?? undefined,
            datum: v.datum ?? undefined,
          },
        });
      }
      await qc.invalidateQueries({ queryKey: getListCrmMarktintelligentieQueryKey() });
      setScanSheet(false);
      toast({ title: `${teOpslaan.length} ${teOpslaan.length === 1 ? "signaal" : "signalen"} opgeslagen` });
    } catch {
      toast({ title: "Fout bij opslaan", variant: "destructive" });
    } finally {
      setOpslaanBezig(false);
    }
  }

  const scoutAantalVandaag = alleItems.filter((i) => {
    const bt = (i as unknown as { bron_type?: string }).bron_type;
    if (bt !== "scout") return false;
    const vandaag = new Date().toISOString().slice(0, 10);
    return (i.aangemaakt_op ?? "").slice(0, 10) === vandaag;
  }).length;

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/crm">
          <Button variant="ghost" size="sm" className="gap-1 pl-1"><ArrowLeft className="w-4 h-4" /> CRM</Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Marktinzicht</h1>
          <p className="text-xs text-muted-foreground">{gefilterd.length} signalen & berichten</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleAiScan} disabled={scan.isPending}>
          <Sparkles className="w-4 h-4 text-amber-500" />
          AI-scan
        </Button>
        <Button onClick={() => setNieuwOpen(true)} size="sm" className="gap-1">
          <Plus className="w-4 h-4" /> Toevoegen
        </Button>
      </div>

      {/* Scout-statuspanel */}
      {scoutStatus && (
        <div className="rounded-lg border bg-muted/30 px-4 py-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-medium">Dagelijkse scout</span>
              </div>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {scoutStatus.regio}
              </span>
              {scoutStatus.laatste_run && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Laatste run: {formatDatum(scoutStatus.laatste_run.gestart_op)}
                  {scoutStatus.laatste_run.opgeslagen != null && scoutStatus.laatste_run.opgeslagen > 0 && (
                    <span className="ml-1 text-emerald-600 font-medium">+{scoutStatus.laatste_run.opgeslagen} nieuw</span>
                  )}
                  {scoutStatus.laatste_run.status === "fout" && (
                    <span className="ml-1 text-destructive">fout</span>
                  )}
                </span>
              )}
              {scoutStatus.volgende_run_op && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Volgende: {formatDatum(scoutStatus.volgende_run_op)}
                </span>
              )}
              {scoutAantalVandaag > 0 && (
                <Badge variant="outline" className="text-xs border-emerald-200 bg-emerald-50 text-emerald-700">
                  {scoutAantalVandaag} vandaag gevonden
                </Badge>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5 shrink-0"
              onClick={handleNuScannen}
              disabled={startScout.isPending}
            >
              {startScout.isPending ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Bezig...</>
              ) : (
                <><RefreshCw className="w-3 h-3" /> Nu scannen</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex gap-2 flex-wrap">
          <Button variant={typeFilter === "alle" ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setTypeFilter("alle")}>Alles</Button>
          {TYPES.map((t) => (
            <Button key={t.value} variant={typeFilter === t.value ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setTypeFilter(t.value)}>{t.label}</Button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant={bronFilter === "alle" ? "secondary" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setBronFilter("alle")}>Alle bronnen</Button>
          <Button variant={bronFilter === "scout" ? "secondary" : "ghost"} size="sm" className="h-7 text-xs gap-1" onClick={() => setBronFilter("scout")}>
            <Radio className="w-3 h-3 text-emerald-500" /> Scout
          </Button>
          <Button variant={bronFilter === "handmatig" ? "secondary" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setBronFilter("handmatig")}>Handmatig / AI</Button>
        </div>
      </div>

      {/* Items */}
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : gefilterd.length === 0 ? (
        <div className="text-center py-16">
          <Newspaper className="w-10 h-10 mx-auto text-muted-foreground opacity-40 mb-3" />
          <p className="text-sm text-muted-foreground">Geen marktinformatie beschikbaar.</p>
          <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={handleAiScan} disabled={scan.isPending}>
            <Sparkles className="w-4 h-4 text-amber-500" /> AI-scan starten
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {gefilterd.map((item) => {
            const tInfo = typeInfo(item.type);
            const orgNaam = item.organisatie_id ? orgMap.get(item.organisatie_id) : null;
            const concNaam = item.concurrent_id ? concMap.get(item.concurrent_id) : null;
            const isScout = (item as unknown as { bron_type?: string }).bron_type === "scout";
            const bronUrl = (item as unknown as { bron_url?: string }).bron_url;
            return (
              <Card key={item.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Badge variant="outline" className={`text-xs border shrink-0 mt-0.5 ${tInfo.kleur}`}>{tInfo.label}</Badge>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className="font-semibold text-sm">{item.titel}</p>
                        {isScout && (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 border border-emerald-200 bg-emerald-50 rounded px-1.5 py-0.5 shrink-0">
                            <Radio className="w-2.5 h-2.5" /> Scout
                          </span>
                        )}
                      </div>
                      {item.inhoud && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.inhoud}</p>}
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        {orgNaam && <span className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="w-3 h-3" />{orgNaam}</span>}
                        {concNaam && <span className="text-xs text-muted-foreground flex items-center gap-1"><Handshake className="w-3 h-3" />{concNaam}</span>}
                        {item.regio && <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{item.regio}</span>}
                        {item.bron && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            {bronUrl ? (
                              <a href={bronUrl} target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-primary">{item.bron}</a>
                            ) : item.bron}
                          </span>
                        )}
                        {item.datum && <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />{item.datum}</span>}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Handmatig toevoegen */}
      <Dialog open={nieuwOpen} onOpenChange={setNieuwOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Marktinformatie toevoegen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Type</Label>
              <Select value={velden.type} onValueChange={(val) => setVelden((v) => ({ ...v, type: val }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Titel <span className="text-destructive">*</span></Label>
              <Input value={velden.titel} onChange={(e) => setVelden((v) => ({ ...v, titel: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Inhoud</Label>
              <Textarea value={velden.inhoud} onChange={(e) => setVelden((v) => ({ ...v, inhoud: e.target.value }))} className="mt-1" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Gerelateerde organisatie</Label>
                <Select value={velden.organisatie_id || "__geen__"} onValueChange={(val) => setVelden((v) => ({ ...v, organisatie_id: val === "__geen__" ? "" : val }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Geen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__geen__">Geen</SelectItem>
                    {(orgs as CrmOrganisatie[]).map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.naam}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Gerelateerde concurrent</Label>
                <Select value={velden.concurrent_id || "__geen__"} onValueChange={(val) => setVelden((v) => ({ ...v, concurrent_id: val === "__geen__" ? "" : val }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Geen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__geen__">Geen</SelectItem>
                    {(concurrenten as CrmConcurrent[]).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.naam}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Bron</Label>
                <Input value={velden.bron} onChange={(e) => setVelden((v) => ({ ...v, bron: e.target.value }))} className="mt-1" placeholder="Bijv. LinkedIn, TenderNed..." />
              </div>
              <div>
                <Label>Regio</Label>
                <Input value={velden.regio} onChange={(e) => setVelden((v) => ({ ...v, regio: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Datum</Label>
              <DatePicker value={velden.datum} onChange={(v) => setVelden((vv) => ({ ...vv, datum: v }))} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNieuwOpen(false)}>Annuleren</Button>
            <Button onClick={handleAanmaken} disabled={aanmaken.isPending}>{aanmaken.isPending ? "Bezig..." : "Toevoegen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI-scan review sheet */}
      <Sheet open={scanSheet} onOpenChange={setScanSheet}>
        <SheetContent className="w-full sm:max-w-xl flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              AI-marktintelligentie
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              AI scant het internet en vakbladen op nieuws, aanbestedingen en concurrentiebewegingen. Selecteer wat je wilt opslaan.
            </p>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {scan.isPending ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Markt aan het scannen...</p>
                <p className="text-xs text-muted-foreground">Dit kan 15-30 seconden duren</p>
              </div>
            ) : voorstellen.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <p className="text-sm text-muted-foreground">Geen resultaten gevonden.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-muted-foreground">{geselecteerd.size} van {voorstellen.length} geselecteerd</p>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setGeselecteerd(new Set(voorstellen.map((_, i) => i)))}>Alles</Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setGeselecteerd(new Set())}>Geen</Button>
                  </div>
                </div>
                <div className="space-y-2">
                  {voorstellen.map((v, i) => {
                    const geselecteerdItem = geselecteerd.has(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${geselecteerdItem ? "border-primary bg-primary/5" : "border-border bg-muted/20 opacity-60"}`}
                        onClick={() => toggleSelectie(i)}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className={`w-4 h-4 mt-0.5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${geselecteerdItem ? "border-primary bg-primary" : "border-muted-foreground"}`}>
                            {geselecteerdItem && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className={`text-xs shrink-0 ${typeInfo(v.type).kleur}`}>{typeInfo(v.type).label}</Badge>
                            </div>
                            <p className="text-sm font-medium leading-snug">{v.titel}</p>
                            {v.inhoud && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{v.inhoud}</p>}
                            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                              {v.regio && <span className="text-xs text-muted-foreground">{v.regio}</span>}
                              {v.bron && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Globe className="w-3 h-3" />
                                  {v.bron_url ? (
                                    <a href={v.bron_url} target="_blank" rel="noopener noreferrer" className="hover:underline" onClick={(e) => e.stopPropagation()}>{v.bron}</a>
                                  ) : v.bron}
                                </span>
                              )}
                              {v.datum && <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />{v.datum}</span>}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {!scan.isPending && voorstellen.length > 0 && (
            <SheetFooter className="px-6 py-4 border-t flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setScanSheet(false)}>Annuleren</Button>
              <Button
                className="flex-1"
                onClick={handleSlaOpGeselecteerde}
                disabled={geselecteerd.size === 0 || opslaanBezig}
              >
                {opslaanBezig ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" />Bezig...</>
                ) : (
                  `Opslaan (${geselecteerd.size})`
                )}
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
