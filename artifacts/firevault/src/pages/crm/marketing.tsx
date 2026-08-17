// MARKETING_01 — doelgroepen, sjablonen en campagnes (module crm).
// crm 3 = beheren + proefverzending; crm 4 = daadwerkelijk verzenden/stoppen.
// Toestemming is server-side een harde poort; de UI toont alleen wat mag.
import { useMemo, useState } from "react";
import {
  useListMarketingDoelgroepen,
  useCreateMarketingDoelgroep,
  useDeleteMarketingDoelgroep,
  useTelMarketingDoelgroepVoorbeeld,
  useListMarketingDoelgroepLeden,
  useListMarketingSjablonen,
  useCreateMarketingSjabloon,
  useDeleteMarketingSjabloon,
  useListMarketingCampagnes,
  useGetMarketingCampagne,
  useCreateMarketingCampagne,
  useDeleteMarketingCampagne,
  useVerstuurMarketingCampagneProef,
  useVerstuurMarketingCampagne,
  useStopMarketingCampagne,
  getListMarketingDoelgroepenQueryKey,
  getListMarketingDoelgroepLedenQueryKey,
  getListMarketingSjablonenQueryKey,
  getListMarketingCampagnesQueryKey,
  getGetMarketingCampagneQueryKey,
  type MarketingCampagne,
  type MarketingDoelgroepCriteria,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Megaphone, Users, FileText, Send, FlaskConical, StopCircle, Trash2, Plus, Eye } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  concept: "Concept",
  gepland: "Gepland",
  verzendend: "Verzendend",
  verzonden: "Verzonden",
  gestopt: "Gestopt",
};
const STATUS_KLEUR: Record<string, string> = {
  concept: "bg-gray-100 text-gray-600 border-gray-200",
  gepland: "bg-blue-100 text-blue-700 border-blue-200",
  verzendend: "bg-amber-100 text-amber-700 border-amber-200",
  verzonden: "bg-emerald-100 text-emerald-700 border-emerald-200",
  gestopt: "bg-red-100 text-red-700 border-red-200",
};

function lijstUitTekst(t: string): string[] | undefined {
  const w = t.split(",").map((s) => s.trim()).filter(Boolean);
  return w.length > 0 ? w : undefined;
}

export default function CrmMarketingPagina() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { heeftNiveau } = useBevoegdheid();
  const magVerzenden = heeftNiveau("marketing", 4);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Megaphone className="h-7 w-7 text-primary" />
        <div>
          <h1 data-paginatitel className="text-2xl font-bold">Marketing</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Doelgroepen, mailsjablonen en campagnes — alleen naar relaties met vastgelegde toestemming
          </p>
        </div>
      </div>

      <Tabs defaultValue="campagnes">
        <TabsList>
          <TabsTrigger value="campagnes"><Send className="h-4 w-4 mr-1.5" />Campagnes</TabsTrigger>
          <TabsTrigger value="doelgroepen"><Users className="h-4 w-4 mr-1.5" />Doelgroepen</TabsTrigger>
          <TabsTrigger value="sjablonen"><FileText className="h-4 w-4 mr-1.5" />Sjablonen</TabsTrigger>
        </TabsList>
        <TabsContent value="campagnes"><CampagnesTab magVerzenden={magVerzenden} qc={qc} toast={toast} /></TabsContent>
        <TabsContent value="doelgroepen"><DoelgroepenTab qc={qc} toast={toast} /></TabsContent>
        <TabsContent value="sjablonen"><SjablonenTab qc={qc} toast={toast} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Doelgroepen ─────────────────────────────────────────────────────────────

function DoelgroepenTab({ qc, toast }: { qc: ReturnType<typeof useQueryClient>; toast: ReturnType<typeof useToast>["toast"] }) {
  const { data: doelgroepen = [], isLoading } = useListMarketingDoelgroepen();
  const [open, setOpen] = useState(false);
  const [naam, setNaam] = useState("");
  const [omschrijving, setOmschrijving] = useState("");
  const [branche, setBranche] = useState("");
  const [stad, setStad] = useState("");
  const [klantStatus, setKlantStatus] = useState("");
  const [ledenVan, setLedenVan] = useState<number | null>(null);

  const criteria: MarketingDoelgroepCriteria = useMemo(() => ({
    branche: lijstUitTekst(branche),
    stad: lijstUitTekst(stad),
    klant_status: lijstUitTekst(klantStatus),
  }), [branche, stad, klantStatus]);

  const invalideer = () => qc.invalidateQueries({ queryKey: getListMarketingDoelgroepenQueryKey() });
  const tel = useTelMarketingDoelgroepVoorbeeld();
  const maak = useCreateMarketingDoelgroep({
    mutation: {
      onSuccess: () => { invalideer(); setOpen(false); setNaam(""); setOmschrijving(""); setBranche(""); setStad(""); setKlantStatus(""); toast({ title: "Doelgroep aangemaakt" }); },
      onError: () => toast({ title: "Aanmaken mislukt", variant: "destructive" }),
    },
  });
  const verwijder = useDeleteMarketingDoelgroep({
    mutation: { onSuccess: () => { invalideer(); toast({ title: "Doelgroep verwijderd" }); } },
  });
  const { data: leden = [], isLoading: ledenLaden } = useListMarketingDoelgroepLeden(ledenVan ?? 0, {
    query: { enabled: ledenVan !== null, queryKey: getListMarketingDoelgroepLedenQueryKey(ledenVan ?? 0) },
  });

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Leden worden altijd live berekend: wie geen toestemming heeft, is afgemeld of onbestelbaar is, valt automatisch buiten elke doelgroep.
        </p>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" />Nieuwe doelgroep</Button>
      </div>
      {isLoading ? <Skeleton className="h-32 w-full" /> : doelgroepen.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nog geen doelgroepen. Maak er één aan op basis van branche, stad of status.</CardContent></Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {doelgroepen.map((d) => (
            <Card key={d.id}>
              <CardHeader className="pb-2 flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">{d.naam}</CardTitle>
                  {d.omschrijving ? <p className="text-xs text-muted-foreground mt-0.5">{d.omschrijving}</p> : null}
                </div>
                <Badge variant="secondary">{d.aantal_leden} leden</Badge>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground space-x-2">
                  {(d.criteria.branche ?? []).length > 0 && <span>Branche: {d.criteria.branche!.join(", ")}</span>}
                  {(d.criteria.stad ?? []).length > 0 && <span>Stad: {d.criteria.stad!.join(", ")}</span>}
                  {(d.criteria.klant_status ?? []).length > 0 && <span>Status: {d.criteria.klant_status!.join(", ")}</span>}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setLedenVan(d.id)}><Eye className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => verwijder.mutate({ id: d.id })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nieuwe doelgroep</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Naam</Label><Input value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Bijv. Zorginstellingen Drenthe" /></div>
            <div><Label>Omschrijving</Label><Input value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} /></div>
            <div><Label>Branche (komma-gescheiden)</Label><Input value={branche} onChange={(e) => setBranche(e.target.value)} placeholder="zorg, onderwijs" /></div>
            <div><Label>Stad (komma-gescheiden)</Label><Input value={stad} onChange={(e) => setStad(e.target.value)} /></div>
            <div><Label>Organisatiestatus (komma-gescheiden)</Label><Input value={klantStatus} onChange={(e) => setKlantStatus(e.target.value)} placeholder="klant, prospect" /></div>
            <Button
              variant="outline" size="sm"
              disabled={tel.isPending}
              onClick={() => tel.mutate({ data: { criteria } }, { onSuccess: (r) => toast({ title: `${r.aantal_leden} leden met toestemming` }) })}
            >
              Live telling
            </Button>
          </div>
          <DialogFooter>
            <Button
              disabled={!naam.trim() || maak.isPending}
              onClick={() => maak.mutate({ data: { naam: naam.trim(), omschrijving: omschrijving.trim() || null, criteria } })}
            >
              Aanmaken
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ledenVan !== null} onOpenChange={(o) => !o && setLedenVan(null)}>
        <DialogContent className="max-h-[70vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Leden (live berekend)</DialogTitle></DialogHeader>
          {ledenLaden ? <Skeleton className="h-20 w-full" /> : leden.length === 0 ? (
            <p className="text-sm text-muted-foreground">Niemand voldoet op dit moment (of niemand heeft toestemming).</p>
          ) : (
            <div className="space-y-2">
              {leden.map((l) => (
                <div key={l.contactpersoon_id} className="flex justify-between text-sm border-b pb-1.5">
                  <span>{l.naam}{l.organisatie ? <span className="text-muted-foreground"> — {l.organisatie}</span> : null}</span>
                  <span className="text-muted-foreground">{l.email}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sjablonen ───────────────────────────────────────────────────────────────

function SjablonenTab({ qc, toast }: { qc: ReturnType<typeof useQueryClient>; toast: ReturnType<typeof useToast>["toast"] }) {
  const { data: sjablonen = [], isLoading } = useListMarketingSjablonen();
  const [open, setOpen] = useState(false);
  const [naam, setNaam] = useState("");
  const [onderwerp, setOnderwerp] = useState("");
  const [inhoud, setInhoud] = useState("");

  const invalideer = () => qc.invalidateQueries({ queryKey: getListMarketingSjablonenQueryKey() });
  const maak = useCreateMarketingSjabloon({
    mutation: {
      onSuccess: () => { invalideer(); setOpen(false); setNaam(""); setOnderwerp(""); setInhoud(""); toast({ title: "Sjabloon aangemaakt" }); },
      onError: () => toast({ title: "Aanmaken mislukt", variant: "destructive" }),
    },
  });
  const verwijder = useDeleteMarketingSjabloon({ mutation: { onSuccess: () => { invalideer(); toast({ title: "Sjabloon verwijderd" }); } } });

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Gebruik <code className="text-xs bg-muted px-1 rounded">{"{{naam}}"}</code> en <code className="text-xs bg-muted px-1 rounded">{"{{organisatie}}"}</code> voor persoonlijke velden. De afmeldlink wordt automatisch toegevoegd.
        </p>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" />Nieuw sjabloon</Button>
      </div>
      {isLoading ? <Skeleton className="h-32 w-full" /> : sjablonen.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nog geen sjablonen.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {sjablonen.map((s) => (
            <Card key={s.id}>
              <CardContent className="py-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium">{s.naam}</p>
                  <p className="text-sm text-muted-foreground">Onderwerp: {s.onderwerp}</p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-line">{s.inhoud}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => verwijder.mutate({ id: s.id })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nieuw sjabloon</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Naam</Label><Input value={naam} onChange={(e) => setNaam(e.target.value)} /></div>
            <div><Label>Onderwerp</Label><Input value={onderwerp} onChange={(e) => setOnderwerp(e.target.value)} placeholder="Brandveiligheid bij {{organisatie}}" /></div>
            <div><Label>Inhoud</Label><Textarea rows={8} value={inhoud} onChange={(e) => setInhoud(e.target.value)} placeholder={"Beste {{naam}},\n\n..."} /></div>
          </div>
          <DialogFooter>
            <Button
              disabled={!naam.trim() || !onderwerp.trim() || !inhoud.trim() || maak.isPending}
              onClick={() => maak.mutate({ data: { naam: naam.trim(), onderwerp: onderwerp.trim(), inhoud: inhoud.trim() } })}
            >
              Aanmaken
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Campagnes ───────────────────────────────────────────────────────────────

function CampagnesTab({ magVerzenden, qc, toast }: {
  magVerzenden: boolean;
  qc: ReturnType<typeof useQueryClient>;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const { data: campagnes = [], isLoading } = useListMarketingCampagnes();
  const { data: doelgroepen = [] } = useListMarketingDoelgroepen();
  const { data: sjablonen = [] } = useListMarketingSjablonen();
  const [open, setOpen] = useState(false);
  const [naam, setNaam] = useState("");
  const [doel, setDoel] = useState("");
  const [doelgroepId, setDoelgroepId] = useState("");
  const [sjabloonId, setSjabloonId] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [verzendBevestig, setVerzendBevestig] = useState<MarketingCampagne | null>(null);

  const invalideer = () => {
    void qc.invalidateQueries({ queryKey: getListMarketingCampagnesQueryKey() });
    if (detailId !== null) void qc.invalidateQueries({ queryKey: getGetMarketingCampagneQueryKey(detailId) });
  };
  const foutmelding = (err: unknown): string =>
    ((err as { response?: { data?: { fout?: string } } })?.response?.data?.fout) ?? "Er ging iets mis";

  const maak = useCreateMarketingCampagne({
    mutation: {
      onSuccess: () => { invalideer(); setOpen(false); setNaam(""); setDoel(""); setDoelgroepId(""); setSjabloonId(""); toast({ title: "Campagne aangemaakt" }); },
      onError: (e) => toast({ title: foutmelding(e), variant: "destructive" }),
    },
  });
  const verwijder = useDeleteMarketingCampagne({
    mutation: { onSuccess: () => { invalideer(); toast({ title: "Campagne verwijderd" }); }, onError: (e) => toast({ title: foutmelding(e), variant: "destructive" }) },
  });
  const proef = useVerstuurMarketingCampagneProef({
    mutation: {
      onSuccess: (r) => { invalideer(); toast({ title: `Proef verzonden naar ${r.verzonden_naar ?? "je eigen adres"}` }); },
      onError: (e) => toast({ title: foutmelding(e), variant: "destructive" }),
    },
  });
  const verzend = useVerstuurMarketingCampagne({
    mutation: {
      onSuccess: (r) => { invalideer(); setVerzendBevestig(null); toast({ title: `${r.ingepland ?? 0} berichten in de mailwachtrij geplaatst`, description: "Een beheerder verstuurt ze gespreid vanuit de wachtrij." }); },
      onError: (e) => { setVerzendBevestig(null); toast({ title: foutmelding(e), variant: "destructive" }); },
    },
  });
  const stop = useStopMarketingCampagne({
    mutation: {
      onSuccess: (r) => { invalideer(); toast({ title: `Campagne gestopt — ${r.vervallen ?? 0} berichten vervallen` }); },
      onError: (e) => toast({ title: foutmelding(e), variant: "destructive" }),
    },
  });
  const { data: detail } = useGetMarketingCampagne(detailId ?? 0, {
    query: { enabled: detailId !== null, queryKey: getGetMarketingCampagneQueryKey(detailId ?? 0) },
  });

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Verzenden vereist een proefverzending naar jezelf en loopt altijd via de mailwachtrij{magVerzenden ? "" : " — je hebt beheerrechten, verzenden vereist een hoger recht"}.
        </p>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" />Nieuwe campagne</Button>
      </div>
      {isLoading ? <Skeleton className="h-32 w-full" /> : campagnes.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nog geen campagnes.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {campagnes.map((c) => {
            const dg = doelgroepen.find((d) => d.id === c.doelgroep_id);
            const sj = sjablonen.find((s) => s.id === c.sjabloon_id);
            return (
              <Card key={c.id}>
                <CardContent className="py-4" data-testid={`campagne-kaart-${c.id}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{c.naam}</p>
                        <Badge variant="outline" className={STATUS_KLEUR[c.status] ?? ""}>{STATUS_LABEL[c.status] ?? c.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {dg ? `Doelgroep: ${dg.naam} (${dg.aantal_leden} leden)` : "Geen doelgroep"} · {sj ? `Sjabloon: ${sj.naam}` : "Geen sjabloon"}
                        {c.proef_verzonden_op ? " · proef verzonden" : " · nog geen proef"}
                      </p>
                      {c.gestopt_reden ? <p className="text-xs text-red-600 mt-0.5">Gestopt: {c.gestopt_reden}</p> : null}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => setDetailId(c.id)}><Eye className="h-4 w-4" /></Button>
                      {(c.status === "concept" || c.status === "gepland") && (
                        <>
                          <Button data-testid="btn-proef" size="sm" variant="outline" disabled={proef.isPending} onClick={() => proef.mutate({ id: c.id })}>
                            <FlaskConical className="h-4 w-4 mr-1" />Proef
                          </Button>
                          {magVerzenden && (
                            <Button data-testid="btn-verzenden" size="sm" disabled={verzend.isPending || !c.proef_verzonden_op} onClick={() => setVerzendBevestig(c)}>
                              <Send className="h-4 w-4 mr-1" />Verzenden
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => verwijder.mutate({ id: c.id })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </>
                      )}
                      {magVerzenden && (c.status === "verzendend" || c.status === "gepland") && (
                        <Button data-testid="btn-stoppen" size="sm" variant="destructive" disabled={stop.isPending} onClick={() => stop.mutate({ id: c.id, data: { reden: "handmatig gestopt" } })}>
                          <StopCircle className="h-4 w-4 mr-1" />Stop
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nieuwe campagne</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Naam</Label><Input value={naam} onChange={(e) => setNaam(e.target.value)} /></div>
            <div><Label>Doel</Label><Input value={doel} onChange={(e) => setDoel(e.target.value)} placeholder="Bijv. onderhoudscontracten zorgsector" /></div>
            <div>
              <Label>Doelgroep</Label>
              <Select value={doelgroepId} onValueChange={setDoelgroepId}>
                <SelectTrigger><SelectValue placeholder="Kies doelgroep" /></SelectTrigger>
                <SelectContent>{doelgroepen.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.naam} ({d.aantal_leden})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sjabloon</Label>
              <Select value={sjabloonId} onValueChange={setSjabloonId}>
                <SelectTrigger><SelectValue placeholder="Kies sjabloon" /></SelectTrigger>
                <SelectContent>{sjablonen.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.naam}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={!naam.trim() || maak.isPending}
              onClick={() => maak.mutate({ data: {
                naam: naam.trim(),
                doel: doel.trim() || null,
                doelgroep_id: doelgroepId ? Number(doelgroepId) : null,
                sjabloon_id: sjabloonId ? Number(sjabloonId) : null,
              } })}
            >
              Aanmaken
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailId !== null} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{detail?.naam ?? "Campagne"}</DialogTitle></DialogHeader>
          {detail ? (
            <div className="space-y-2 text-sm">
              <p>Status: <Badge variant="outline" className={STATUS_KLEUR[detail.status] ?? ""}>{STATUS_LABEL[detail.status] ?? detail.status}</Badge></p>
              {detail.doel ? <p className="text-muted-foreground">{detail.doel}</p> : null}
              <div className="grid grid-cols-2 gap-2 pt-2">
                {Object.entries(detail.ontvangers ?? {}).map(([status, aantal]) => (
                  <div key={status} className="flex justify-between border rounded px-3 py-1.5">
                    <span className="capitalize">{status}</span><span className="font-medium">{aantal}</span>
                  </div>
                ))}
                {Object.keys(detail.ontvangers ?? {}).length === 0 && <p className="text-muted-foreground col-span-2">Nog geen ontvangers.</p>}
              </div>
            </div>
          ) : <Skeleton className="h-24 w-full" />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={verzendBevestig !== null} onOpenChange={(o) => !o && setVerzendBevestig(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Campagne verzenden?</AlertDialogTitle>
            <AlertDialogDescription>
              "{verzendBevestig?.naam}" wordt klaargezet voor alle doelgroepleden met toestemming. De berichten gaan in de mailwachtrij en worden daarvandaan gespreid verstuurd.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={() => verzendBevestig && verzend.mutate({ id: verzendBevestig.id })}>Verzenden</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
