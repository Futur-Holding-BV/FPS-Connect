// SOCIAL_01 — social media: kalender, berichten en koppelingen (module crm).
// crm 3 = bekijken/opstellen/klaarzetten; crm 4 = plannen/terughalen + koppelingen.
// De kanaaleisen komen live van de server en zijn dezelfde die het
// plannen-endpoint fail-closed afdwingt.
import { useMemo, useState } from "react";
import {
  useListSocialKanaaleisen,
  useListSocialBerichten,
  useCreateSocialBericht,
  useUpdateSocialBericht,
  useDeleteSocialBericht,
  useZetSocialBerichtKlaar,
  useZetSocialBerichtTerugNaarConcept,
  usePlanSocialBericht,
  useZetSocialBerichtTerugNaarKlaar,
  useListSocialKoppelingen,
  useCreateSocialKoppeling,
  useUpdateSocialKoppeling,
  useDeleteSocialKoppeling,
  useListWerkgevers,
  useListMarketingCampagnes,
  getListMarketingCampagnesQueryKey,
  getListSocialBerichtenQueryKey,
  getListSocialKoppelingenQueryKey,
  type SocialBericht,
  type SocialKanaalEisen,
  type SocialKoppeling,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useUpload } from "@workspace/object-storage-web";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Share2, CalendarDays, ListChecks, Link2, Plus, Trash2, Pencil,
  ChevronLeft, ChevronRight, Clock, CheckCircle2, AlertTriangle, Image as ImageIcon, Video,
} from "lucide-react";

const KANAAL_LABEL: Record<string, string> = {
  linkedin: "LinkedIn", facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok",
};
const KANAAL_KLEUR: Record<string, string> = {
  linkedin: "bg-sky-100 text-sky-800 border-sky-200",
  facebook: "bg-blue-100 text-blue-800 border-blue-200",
  instagram: "bg-pink-100 text-pink-800 border-pink-200",
  tiktok: "bg-zinc-100 text-zinc-800 border-zinc-200",
};
const STATUS_LABEL: Record<string, string> = {
  concept: "Concept", klaar: "Klaar", gepland: "Gepland", geplaatst: "Geplaatst",
  deels_geplaatst: "Deels geplaatst", mislukt: "Mislukt",
};
const STATUS_KLEUR: Record<string, string> = {
  concept: "bg-gray-100 text-gray-600 border-gray-200",
  klaar: "bg-amber-100 text-amber-700 border-amber-200",
  gepland: "bg-blue-100 text-blue-700 border-blue-200",
  geplaatst: "bg-emerald-100 text-emerald-700 border-emerald-200",
  deels_geplaatst: "bg-amber-100 text-amber-700 border-amber-200",
  mislukt: "bg-red-100 text-red-700 border-red-200",
};
const PLAATSING_LABEL: Record<string, string> = {
  wachtend: "Wachtend", bezig: "Bezig", geplaatst: "Geplaatst", concept_klaargezet: "Concept klaargezet", mislukt: "Mislukt",
};

function fmtDatumTijd(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" }) + " " +
    d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

export default function CrmSocialPagina() {
  const { heeftNiveau } = useBevoegdheid();
  const magPlannen = heeftNiveau("social", 4);
  const params = new URLSearchParams(window.location.search);
  const startTab = params.get("tab") === "koppelingen" && magPlannen ? "koppelingen" : "kalender";

  const { data: werkgevers } = useListWerkgevers();
  const { data: eisen } = useListSocialKanaaleisen();
  const [werkgeverFilter, setWerkgeverFilter] = useState<string>("alle");

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Share2 className="h-7 w-7 text-primary" />
          <div>
            <h1 data-paginatitel className="text-2xl font-bold">Social media</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Berichten plannen en publiceren per werkmaatschappij — LinkedIn, Facebook, Instagram en TikTok
            </p>
          </div>
        </div>
        <Select value={werkgeverFilter} onValueChange={setWerkgeverFilter}>
          <SelectTrigger className="w-56" data-testid="select-werkgever-filter">
            <SelectValue placeholder="Werkmaatschappij" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle werkmaatschappijen</SelectItem>
            {(werkgevers ?? []).map((w) => (
              <SelectItem key={w.id} value={String(w.id)}>{w.naam}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue={startTab}>
        <TabsList>
          <TabsTrigger value="kalender"><CalendarDays className="h-4 w-4 mr-1.5" />Kalender</TabsTrigger>
          <TabsTrigger value="berichten"><ListChecks className="h-4 w-4 mr-1.5" />Berichten</TabsTrigger>
          {magPlannen && (
            <TabsTrigger value="koppelingen" data-testid="tab-koppelingen"><Link2 className="h-4 w-4 mr-1.5" />Koppelingen</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="kalender">
          <KalenderTab werkgeverFilter={werkgeverFilter} />
        </TabsContent>
        <TabsContent value="berichten">
          <BerichtenTab werkgeverFilter={werkgeverFilter} magPlannen={magPlannen} eisen={eisen ?? []} werkgevers={werkgevers ?? []} />
        </TabsContent>
        {magPlannen && (
          <TabsContent value="koppelingen">
            <KoppelingenTab werkgevers={werkgevers ?? []} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// ── Kalender (week/maand) ────────────────────────────────────────────────────
function KalenderTab({ werkgeverFilter }: { werkgeverFilter: string }) {
  const [weergave, setWeergave] = useState<"maand" | "week">("maand");
  const [anker, setAnker] = useState<Date>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });

  const { van, tot, dagen } = useMemo(() => {
    if (weergave === "week") {
      const start = new Date(anker);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // maandag
      const dgn = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
      const eind = new Date(start); eind.setDate(eind.getDate() + 7);
      return { van: start, tot: eind, dagen: dgn };
    }
    const eerste = new Date(anker.getFullYear(), anker.getMonth(), 1);
    const start = new Date(eerste); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const dgn = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
    const eind = new Date(start); eind.setDate(eind.getDate() + 42);
    return { van: start, tot: eind, dagen: dgn };
  }, [weergave, anker]);

  const { data: berichten, isLoading } = useListSocialBerichten({
    van: van.toISOString(), tot: tot.toISOString(),
    ...(werkgeverFilter !== "alle" ? { werkgever_id: Number(werkgeverFilter) } : {}),
  });

  const perDag = useMemo(() => {
    const m = new Map<string, SocialBericht[]>();
    for (const b of berichten ?? []) {
      if (!b.gepland_op) continue;
      const sleutel = new Date(b.gepland_op).toDateString();
      m.set(sleutel, [...(m.get(sleutel) ?? []), b]);
    }
    return m;
  }, [berichten]);

  const stap = (richting: number) => {
    const d = new Date(anker);
    if (weergave === "week") d.setDate(d.getDate() + 7 * richting);
    else d.setMonth(d.getMonth() + richting);
    setAnker(d);
  };
  const titel = weergave === "week"
    ? `Week van ${dagen[0].toLocaleDateString("nl-NL", { day: "numeric", month: "long" })}`
    : anker.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base capitalize">{titel}</CardTitle>
        <div className="flex items-center gap-2">
          <Tabs value={weergave} onValueChange={(v) => setWeergave(v as "maand" | "week")}>
            <TabsList className="h-8">
              <TabsTrigger value="week" className="text-xs px-2.5">Week</TabsTrigger>
              <TabsTrigger value="maand" className="text-xs px-2.5">Maand</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => stap(-1)} data-testid="button-kalender-vorige"><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => stap(1)} data-testid="button-kalender-volgende"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-64 w-full" /> : (
          <div className="grid grid-cols-7 gap-px bg-border rounded-md overflow-hidden border">
            {["ma", "di", "wo", "do", "vr", "za", "zo"].map((d) => (
              <div key={d} className="bg-muted/60 text-xs font-medium text-muted-foreground text-center py-1.5 uppercase">{d}</div>
            ))}
            {dagen.map((dag) => {
              const items = perDag.get(dag.toDateString()) ?? [];
              const vandaag = dag.toDateString() === new Date().toDateString();
              const buitenMaand = weergave === "maand" && dag.getMonth() !== anker.getMonth();
              return (
                <div key={dag.toISOString()} className={`bg-background min-h-24 p-1.5 ${buitenMaand ? "opacity-40" : ""}`}>
                  <div className={`text-xs mb-1 ${vandaag ? "font-bold text-primary" : "text-muted-foreground"}`}>{dag.getDate()}</div>
                  <div className="space-y-1">
                    {items.map((b) => (
                      <div key={b.id} className="rounded border bg-muted/40 px-1.5 py-1 text-xs" title={b.tekst} data-testid={`kalender-bericht-${b.id}`}>
                        <div className="flex items-center gap-1 flex-wrap">
                          <Badge variant="outline" className={`text-[10px] px-1 py-0 ${STATUS_KLEUR[b.status]}`}>{STATUS_LABEL[b.status]}</Badge>
                          <span className="text-muted-foreground">{fmtDatumTijd(b.gepland_op).split(" ").slice(-1)[0]}</span>
                        </div>
                        <div className="truncate font-medium">{b.tekst || "(alleen media)"}</div>
                        <div className="flex gap-0.5 flex-wrap mt-0.5">
                          {b.kanalen.map((k) => (
                            <span key={k.id} className={`rounded px-1 text-[10px] border ${KANAAL_KLEUR[k.kanaal]}`}>{KANAAL_LABEL[k.kanaal]}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Berichten (lijst + opsteller + statusacties) ─────────────────────────────
function BerichtenTab({ werkgeverFilter, magPlannen, eisen, werkgevers }: {
  werkgeverFilter: string; magPlannen: boolean; eisen: SocialKanaalEisen[];
  werkgevers: { id: number; naam: string }[];
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: berichten, isLoading } = useListSocialBerichten(
    werkgeverFilter !== "alle" ? { werkgever_id: Number(werkgeverFilter) } : undefined,
  );
  const [opstellerOpen, setOpstellerOpen] = useState(false);
  const [bewerkBericht, setBewerkBericht] = useState<SocialBericht | null>(null);
  const [planBericht, setPlanBericht] = useState<SocialBericht | null>(null);
  const [verwijderId, setVerwijderId] = useState<number | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListSocialBerichtenQueryKey() });
  const klaar = useZetSocialBerichtKlaar({ mutation: { onSuccess: invalidate, onError: (e: unknown) => foutToast(toast, e) } });
  const terugConcept = useZetSocialBerichtTerugNaarConcept({ mutation: { onSuccess: invalidate, onError: (e: unknown) => foutToast(toast, e) } });
  const terugKlaar = useZetSocialBerichtTerugNaarKlaar({ mutation: { onSuccess: invalidate, onError: (e: unknown) => foutToast(toast, e) } });
  const verwijder = useDeleteSocialBericht({ mutation: { onSuccess: () => { invalidate(); setVerwijderId(null); }, onError: (e: unknown) => foutToast(toast, e) } });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setBewerkBericht(null); setOpstellerOpen(true); }} data-testid="button-nieuw-bericht">
          <Plus className="h-4 w-4 mr-1.5" />Nieuw bericht
        </Button>
      </div>
      {isLoading ? <Skeleton className="h-40 w-full" /> : (berichten ?? []).length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nog geen social berichten. Maak het eerste bericht aan.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {(berichten ?? []).map((b) => (
            <Card key={b.id} data-testid={`bericht-kaart-${b.id}`}>
              <CardContent className="py-4 space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={STATUS_KLEUR[b.status]}>{STATUS_LABEL[b.status]}</Badge>
                      <span className="text-sm font-medium">{b.werkgever_naam}</span>
                      {b.gepland_op && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDatumTijd(b.gepland_op)}</span>
                      )}
                      {b.media_pad && (b.media_type === "video"
                        ? <Video className="h-3.5 w-3.5 text-muted-foreground" />
                        : <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />)}
                    </div>
                    <p className="text-sm mt-1 line-clamp-2">{b.tekst || <span className="text-muted-foreground italic">(geen gedeelde tekst)</span>}</p>
                    <div className="flex gap-1.5 flex-wrap mt-1.5">
                      {b.kanalen.map((k) => (
                        <span key={k.id} className={`rounded px-1.5 py-0.5 text-xs border ${KANAAL_KLEUR[k.kanaal]}`}>
                          {KANAAL_LABEL[k.kanaal]}
                          {b.status !== "concept" && b.status !== "klaar" && (
                            <span className="ml-1 text-muted-foreground">· {PLAATSING_LABEL[k.plaatsing_status]}</span>
                          )}
                          {k.laatste_fout && <AlertTriangle className="inline h-3 w-3 ml-1 text-amber-600" />}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap shrink-0">
                    {["concept", "klaar"].includes(b.status) && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => { setBewerkBericht(b); setOpstellerOpen(true); }} data-testid={`button-bewerk-${b.id}`}>
                          <Pencil className="h-3.5 w-3.5 mr-1" />Bewerken
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setVerwijderId(b.id)} data-testid={`button-verwijder-${b.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {b.status === "concept" && (
                      <Button size="sm" onClick={() => klaar.mutate({ id: b.id })} data-testid={`button-klaar-${b.id}`}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Klaar
                      </Button>
                    )}
                    {b.status === "klaar" && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => terugConcept.mutate({ id: b.id })}>Terug naar concept</Button>
                        {magPlannen && (
                          <Button size="sm" onClick={() => setPlanBericht(b)} data-testid={`button-plan-${b.id}`}>
                            <CalendarDays className="h-3.5 w-3.5 mr-1" />Plannen
                          </Button>
                        )}
                      </>
                    )}
                    {b.status === "gepland" && magPlannen && (
                      <Button variant="outline" size="sm" onClick={() => terugKlaar.mutate({ id: b.id })} data-testid={`button-terughalen-${b.id}`}>Terughalen</Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {opstellerOpen && (
        <OpstellerDialog
          open={opstellerOpen}
          onClose={() => setOpstellerOpen(false)}
          bestaand={bewerkBericht}
          eisen={eisen}
          werkgevers={werkgevers}
          onKlaar={invalidate}
        />
      )}
      {planBericht && (
        <PlanDialog bericht={planBericht} onClose={() => setPlanBericht(null)} onKlaar={invalidate} />
      )}
      <AlertDialog open={verwijderId != null} onOpenChange={(o) => !o && setVerwijderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bericht verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>Dit verwijdert het bericht en alle kanaalvarianten. Dit kan niet ongedaan worden gemaakt.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={() => verwijderId != null && verwijder.mutate({ id: verwijderId })} data-testid="button-bevestig-verwijderen">Verwijderen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function foutToast(toast: ReturnType<typeof useToast>["toast"], e: unknown) {
  const info = e as { error?: string; redenen?: string[] } | undefined;
  toast({
    variant: "destructive",
    title: info?.error ?? "Actie mislukt",
    description: info?.redenen?.join("\n"),
  });
}

// ── Opsteller (nieuw/bewerken) met live kanaaleisen ──────────────────────────
function OpstellerDialog({ open, onClose, bestaand, eisen, werkgevers, onKlaar }: {
  open: boolean; onClose: () => void; bestaand: SocialBericht | null;
  eisen: SocialKanaalEisen[]; werkgevers: { id: number; naam: string }[]; onKlaar: () => void;
}) {
  const { toast } = useToast();
  const [werkgeverId, setWerkgeverId] = useState<string>(bestaand ? String(bestaand.werkgever_id) : "");
  const [tekst, setTekst] = useState(bestaand?.tekst ?? "");
  const [kanalen, setKanalen] = useState<string[]>(bestaand?.kanalen.map((k) => k.kanaal) ?? []);
  const [overrides, setOverrides] = useState<Record<string, string>>(
    Object.fromEntries((bestaand?.kanalen ?? []).filter((k) => k.tekst_override).map((k) => [k.kanaal, k.tekst_override as string])),
  );
  const [mediaPad, setMediaPad] = useState<string | null>(bestaand?.media_pad ?? null);
  const [mediaType, setMediaType] = useState<"beeld" | "video" | null>((bestaand?.media_type as "beeld" | "video" | null) ?? null);
  const [campagneId, setCampagneId] = useState<string>(bestaand?.campagne_id ? String(bestaand.campagne_id) : "geen");
  // Campagne-koppeling vereist de marketingmodule (lijst-endpoint = marketing 3);
  // zonder recht geen aanroep (403) en geen selector.
  const { heeftNiveau: heeftNiveauDialog } = useBevoegdheid();
  const magCampagneKoppelen = heeftNiveauDialog("marketing", 3);
  const { data: campagnes } = useListMarketingCampagnes({ query: { enabled: magCampagneKoppelen, queryKey: getListMarketingCampagnesQueryKey() } });
  const { uploadFile, isUploading } = useUpload({ bestand_type: "algemeen" });

  const create = useCreateSocialBericht({ mutation: { onSuccess: () => { onKlaar(); onClose(); }, onError: (e: unknown) => foutToast(toast, e) } });
  const update = useUpdateSocialBericht({ mutation: { onSuccess: () => { onKlaar(); onClose(); }, onError: (e: unknown) => foutToast(toast, e) } });

  const eisenPer = useMemo(() => Object.fromEntries(eisen.map((e) => [e.kanaal, e])), [eisen]);

  const onBestand = async (f: File | undefined) => {
    if (!f) return;
    const isVideo = f.type.startsWith("video/");
    try {
      const resp = await uploadFile(f);
      if (resp?.objectPath) { setMediaPad(resp.objectPath); setMediaType(isVideo ? "video" : "beeld"); }
    } catch {
      toast({ variant: "destructive", title: "Upload mislukt" });
    }
  };

  const opslaan = () => {
    if (!werkgeverId) return void toast({ variant: "destructive", title: "Kies een werkmaatschappij" });
    if (kanalen.length === 0) return void toast({ variant: "destructive", title: "Kies minstens één kanaal" });
    const data = {
      werkgever_id: Number(werkgeverId),
      tekst,
      kanalen: kanalen as ("linkedin" | "facebook" | "instagram" | "tiktok")[],
      kanaal_teksten: overrides,
      media_pad: mediaPad,
      media_type: mediaType,
      campagne_id: campagneId !== "geen" ? Number(campagneId) : null,
    };
    if (bestaand) update.mutate({ id: bestaand.id, data });
    else create.mutate({ data });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{bestaand ? "Bericht bewerken" : "Nieuw social bericht"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Werkmaatschappij</Label>
              <Select value={werkgeverId} onValueChange={setWerkgeverId} disabled={!!bestaand}>
                <SelectTrigger data-testid="select-werkgever"><SelectValue placeholder="Kies…" /></SelectTrigger>
                <SelectContent>{werkgevers.map((w) => <SelectItem key={w.id} value={String(w.id)}>{w.naam}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {magCampagneKoppelen && (
            <div className="space-y-1.5">
              <Label>Campagne (optioneel)</Label>
              <Select value={campagneId} onValueChange={setCampagneId}>
                <SelectTrigger data-testid="select-campagne"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="geen">Geen campagne</SelectItem>
                  {(campagnes ?? []).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.naam}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Kanalen</Label>
            <div className="grid grid-cols-2 gap-2">
              {eisen.map((e) => (
                <label key={e.kanaal} className="flex items-start gap-2 rounded-md border p-2.5 cursor-pointer">
                  <Checkbox
                    checked={kanalen.includes(e.kanaal)}
                    onCheckedChange={(c) => setKanalen((k) => c ? [...k, e.kanaal] : k.filter((x) => x !== e.kanaal))}
                    data-testid={`checkbox-kanaal-${e.kanaal}`}
                  />
                  <span className="text-sm">
                    <span className="font-medium">{e.naam}</span>
                    <span className="block text-xs text-muted-foreground">
                      max {e.tekst_max.toLocaleString("nl-NL")} tekens
                      {e.media_verplicht && (e.video === "verplicht" ? " · alleen video" : " · media verplicht")}
                      {e.max_per_dag != null && ` · max ${e.max_per_dag}/dag`}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Gedeelde tekst</Label>
            <Textarea rows={4} value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder="Wat wil je delen?" data-testid="input-tekst" />
            <div className="flex gap-3 flex-wrap text-xs">
              {kanalen.map((k) => {
                const eis = eisenPer[k]; if (!eis) return null;
                const eigen = (overrides[k] ?? tekst).length;
                const teLang = eigen > eis.tekst_max;
                return (
                  <span key={k} className={teLang ? "text-destructive font-medium" : "text-muted-foreground"}>
                    {eis.naam}: {eigen.toLocaleString("nl-NL")}/{eis.tekst_max.toLocaleString("nl-NL")}
                  </span>
                );
              })}
            </div>
          </div>

          {kanalen.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Afwijkende tekst per kanaal (leeg = gedeelde tekst)</Label>
              {kanalen.map((k) => (
                <div key={k} className="space-y-1">
                  <Label className="text-xs">{KANAAL_LABEL[k]}</Label>
                  <Textarea rows={2} value={overrides[k] ?? ""} placeholder="(gedeelde tekst)"
                    onChange={(e) => setOverrides((o) => ({ ...o, [k]: e.target.value }))}
                    data-testid={`input-override-${k}`} />
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Media (beeld of video)</Label>
            {mediaPad ? (
              <div className="flex items-center gap-2 text-sm">
                {mediaType === "video" ? <Video className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                <span className="truncate flex-1 text-muted-foreground">{mediaPad.split("/").pop()}</span>
                <Button variant="outline" size="sm" onClick={() => { setMediaPad(null); setMediaType(null); }}>Verwijderen</Button>
              </div>
            ) : (
              <Input type="file" accept="image/*,video/*" disabled={isUploading}
                onChange={(e) => onBestand(e.target.files?.[0])} data-testid="input-media" />
            )}
            {isUploading && <p className="text-xs text-muted-foreground">Bezig met uploaden…</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button onClick={opslaan} disabled={create.isPending || update.isPending || isUploading} data-testid="button-opslaan-bericht">
            {bestaand ? "Opslaan" : "Aanmaken"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Plannen (crm 4) — server valideert fail-closed, redenen tonen ────────────
function PlanDialog({ bericht, onClose, onKlaar }: { bericht: SocialBericht; onClose: () => void; onKlaar: () => void }) {
  const { toast } = useToast();
  const [moment, setMoment] = useState("");
  const [redenen, setRedenen] = useState<string[]>([]);
  const plan = usePlanSocialBericht({
    mutation: {
      onSuccess: () => { onKlaar(); onClose(); toast({ title: "Bericht gepland" }); },
      onError: (e: unknown) => {
        const info = e as { error?: string; redenen?: string[] };
        setRedenen(info?.redenen ?? []);
        toast({ variant: "destructive", title: info?.error ?? "Plannen mislukt" });
      },
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Bericht plannen</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Datum en tijd</Label>
            <Input type="datetime-local" value={moment} onChange={(e) => setMoment(e.target.value)} data-testid="input-gepland-op" />
          </div>
          {redenen.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1">
              <p className="text-sm font-medium text-destructive flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" />Voldoet niet aan de kanaaleisen:</p>
              {redenen.map((r, i) => <p key={i} className="text-xs text-destructive">• {r}</p>)}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button disabled={!moment || plan.isPending}
            onClick={() => plan.mutate({ id: bericht.id, data: { gepland_op: new Date(moment).toISOString() } })}
            data-testid="button-bevestig-plannen">Plannen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Koppelingen (crm 4) ──────────────────────────────────────────────────────
function KoppelingenTab({ werkgevers }: { werkgevers: { id: number; naam: string }[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: koppelingen, isLoading } = useListSocialKoppelingen();
  const invalidate = () => qc.invalidateQueries({ queryKey: getListSocialKoppelingenQueryKey() });
  const [formOpen, setFormOpen] = useState(false);
  const [bewerk, setBewerk] = useState<SocialKoppeling | null>(null);
  const [verwijderId, setVerwijderId] = useState<number | null>(null);
  const verwijder = useDeleteSocialKoppeling({ mutation: { onSuccess: () => { invalidate(); setVerwijderId(null); }, onError: (e: unknown) => foutToast(toast, e) } });

  const KOPPELING_STATUS_KLEUR: Record<string, string> = {
    actief: "bg-emerald-100 text-emerald-700 border-emerald-200",
    verlopen: "bg-amber-100 text-amber-700 border-amber-200",
    ingetrokken: "bg-red-100 text-red-700 border-red-200",
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">
          Per werkmaatschappij per kanaal één koppeling. De modus legt vast wat Connect mag:
          <span className="font-medium text-foreground"> publiceren</span> (rechtstreeks plaatsen) of
          <span className="font-medium text-foreground"> klaarzetten</span> (concept op het account + taak voor de planner).
          De API-toegang per kanaal volgt in een volgende stap; tot die tijd leveren geplande berichten altijd een taak op.
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button onClick={() => { setBewerk(null); setFormOpen(true); }} data-testid="button-nieuwe-koppeling">
          <Plus className="h-4 w-4 mr-1.5" />Koppeling toevoegen
        </Button>
      </div>
      {isLoading ? <Skeleton className="h-32 w-full" /> : (koppelingen ?? []).length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nog geen kanaal-koppelingen.</CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(koppelingen ?? []).map((k) => (
            <Card key={k.id} data-testid={`koppeling-kaart-${k.id}`}>
              <CardContent className="py-4 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-xs border ${KANAAL_KLEUR[k.kanaal]}`}>{KANAAL_LABEL[k.kanaal]}</span>
                  <Badge variant="outline" className={KOPPELING_STATUS_KLEUR[k.status]}>{k.status}</Badge>
                </div>
                <p className="text-sm font-medium">{k.account_naam}</p>
                <p className="text-xs text-muted-foreground">{k.werkgever_naam} · modus: {k.modus}</p>
                <p className="text-xs text-muted-foreground">
                  {k.heeft_toegang ? "Toegang aanwezig" : "Nog geen API-toegang"}
                  {k.verloopt_op && ` · verloopt ${fmtDatumTijd(k.verloopt_op)}`}
                </p>
                {k.laatste_fout && <p className="text-xs text-destructive">{k.laatste_fout}</p>}
                <div className="flex gap-1.5 pt-1">
                  <Button variant="outline" size="sm" onClick={() => { setBewerk(k); setFormOpen(true); }} data-testid={`button-bewerk-koppeling-${k.id}`}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />Bewerken
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setVerwijderId(k.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {formOpen && (
        <KoppelingDialog bestaand={bewerk} werkgevers={werkgevers} onClose={() => setFormOpen(false)} onKlaar={invalidate} />
      )}
      <AlertDialog open={verwijderId != null} onOpenChange={(o) => !o && setVerwijderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Koppeling verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>Geplande berichten voor dit kanaal leveren daarna een taak op in plaats van automatische plaatsing.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={() => verwijderId != null && verwijder.mutate({ id: verwijderId })}>Verwijderen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function KoppelingDialog({ bestaand, werkgevers, onClose, onKlaar }: {
  bestaand: SocialKoppeling | null; werkgevers: { id: number; naam: string }[];
  onClose: () => void; onKlaar: () => void;
}) {
  const { toast } = useToast();
  const [werkgeverId, setWerkgeverId] = useState(bestaand ? String(bestaand.werkgever_id) : "");
  const [kanaal, setKanaal] = useState<string>(bestaand?.kanaal ?? "");
  const [accountNaam, setAccountNaam] = useState(bestaand?.account_naam ?? "");
  const [modus, setModus] = useState<string>(bestaand?.modus ?? "klaarzetten");
  const [verlooptOp, setVerlooptOp] = useState(bestaand?.verloopt_op ? bestaand.verloopt_op.slice(0, 10) : "");
  const create = useCreateSocialKoppeling({ mutation: { onSuccess: () => { onKlaar(); onClose(); }, onError: (e: unknown) => foutToast(toast, e) } });
  const update = useUpdateSocialKoppeling({ mutation: { onSuccess: () => { onKlaar(); onClose(); }, onError: (e: unknown) => foutToast(toast, e) } });

  const opslaan = () => {
    if (!bestaand && (!werkgeverId || !kanaal)) return void toast({ variant: "destructive", title: "Kies werkmaatschappij en kanaal" });
    if (!accountNaam.trim()) return void toast({ variant: "destructive", title: "Accountnaam is verplicht" });
    const basis = {
      account_naam: accountNaam.trim(),
      modus: modus as "publiceren" | "klaarzetten",
      verloopt_op: verlooptOp ? new Date(verlooptOp).toISOString() : null,
    };
    if (bestaand) update.mutate({ id: bestaand.id, data: basis });
    else create.mutate({ data: { ...basis, werkgever_id: Number(werkgeverId), kanaal: kanaal as "linkedin" | "facebook" | "instagram" | "tiktok" } });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{bestaand ? "Koppeling bewerken" : "Koppeling toevoegen"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!bestaand && (
            <>
              <div className="space-y-1.5">
                <Label>Werkmaatschappij</Label>
                <Select value={werkgeverId} onValueChange={setWerkgeverId}>
                  <SelectTrigger data-testid="select-koppeling-werkgever"><SelectValue placeholder="Kies…" /></SelectTrigger>
                  <SelectContent>{werkgevers.map((w) => <SelectItem key={w.id} value={String(w.id)}>{w.naam}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Kanaal</Label>
                <Select value={kanaal} onValueChange={setKanaal}>
                  <SelectTrigger data-testid="select-koppeling-kanaal"><SelectValue placeholder="Kies…" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(KANAAL_LABEL).map(([w, l]) => <SelectItem key={w} value={w}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label>Accountnaam</Label>
            <Input value={accountNaam} onChange={(e) => setAccountNaam(e.target.value)} placeholder="bijv. FPS Brandpreventie" data-testid="input-account-naam" />
          </div>
          <div className="space-y-1.5">
            <Label>Modus</Label>
            <Select value={modus} onValueChange={setModus}>
              <SelectTrigger data-testid="select-koppeling-modus"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="publiceren">Publiceren — Connect plaatst rechtstreeks</SelectItem>
                <SelectItem value="klaarzetten">Klaarzetten — concept op het account + taak</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Toegang verloopt op (optioneel)</Label>
            <Input type="date" value={verlooptOp} onChange={(e) => setVerlooptOp(e.target.value)} data-testid="input-verloopt-op" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button onClick={opslaan} disabled={create.isPending || update.isPending} data-testid="button-opslaan-koppeling">Opslaan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
