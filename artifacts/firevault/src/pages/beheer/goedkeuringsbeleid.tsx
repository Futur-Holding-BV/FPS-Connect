// Governance & Approval Engine — beheerscherm voor beleidsregels en aanvragen.
// Niveau 1 = tijdlijn/beleid inzien, niveau 3 = zelf goedkeuren/afwijzen,
// niveau 4 = beleidsregels beheren (aanmaken/bewerken/verwijderen).
import { useMemo, useState } from "react";
import {
  useListGoedkeuringBeleidsregels,
  useCreateGoedkeuringBeleidsregel,
  useUpdateGoedkeuringBeleidsregel,
  useDeleteGoedkeuringBeleidsregel,
  useListGoedkeuringAanvragen,
  useGoedkeuringAanvraagGoedkeuren,
  useGoedkeuringAanvraagAfwijzen,
  getListGoedkeuringBeleidsregelsQueryKey,
  getListGoedkeuringAanvragenQueryKey,
  useListGebruikers,
  useListWerkgevers,
} from "@workspace/api-client-react";
import type {
  GoedkeuringBeleidsregel,
  GoedkeuringBeleidsregelInput,
  GoedkeuringAanvraag,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShieldCheck, Plus, Pencil, Trash2, CheckCircle2, XCircle,
} from "lucide-react";
import { GOEDKEURING_STATUS_INFO } from "@/components/goedkeuring/goedkeuring-widget";
import { MODULES } from "@workspace/permissies";

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  inkoopbon: "Inkoopbon",
  offerte: "Offerte",
  factuur: "Factuur",
  arbeidsovereenkomst: "Arbeidsovereenkomst",
  inspectie: "Inspectierapport",
  opleverrapport: "Opleverrapport",
  certificaat: "Certificaat",
  weekstaat: "Weekstaat / Urenstaat",
  projectafsluiting: "Projectafsluiting",
};

function documentTypeLabel(type: string): string {
  return DOCUMENT_TYPE_LABELS[type] ?? type;
}

const LEEG_REGEL: GoedkeuringBeleidsregelInput = {
  naam: "",
  document_type: "",
  werkmaatschappij_id: null,
  ondergrens: null,
  bovengrens: null,
  goedkeurder_gebruiker_id: null,
  goedkeurder_module: null,
  goedkeurder_min_niveau: null,
  aantal_goedkeuringen_vereist: 1,
  vier_ogen_verplicht: false,
  vervanger_gebruiker_id: null,
  reactietermijn_uren: null,
  actief: true,
};

function euro(bedrag?: number | null) {
  if (bedrag === null || bedrag === undefined) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(bedrag);
}

function BeleidsregelsTab({ magBeheren }: { magBeheren: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: regels, isLoading } = useListGoedkeuringBeleidsregels();
  const { data: gebruikers } = useListGebruikers();
  const { data: werkgevers } = useListWerkgevers();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bewerkId, setBewerkId] = useState<number | null>(null);
  const [form, setForm] = useState<GoedkeuringBeleidsregelInput>(LEEG_REGEL);
  const [verwijderId, setVerwijderId] = useState<number | null>(null);

  function verversen() {
    qc.invalidateQueries({ queryKey: getListGoedkeuringBeleidsregelsQueryKey() });
  }

  const aanmaken = useCreateGoedkeuringBeleidsregel({
    mutation: {
      onSuccess: () => { verversen(); toast({ title: "Beleidsregel aangemaakt" }); setDialogOpen(false); },
      onError: () => toast({ title: "Aanmaken mislukt", variant: "destructive" }),
    },
  });
  const bijwerken = useUpdateGoedkeuringBeleidsregel({
    mutation: {
      onSuccess: () => { verversen(); toast({ title: "Beleidsregel bijgewerkt" }); setDialogOpen(false); },
      onError: () => toast({ title: "Bijwerken mislukt", variant: "destructive" }),
    },
  });
  const verwijderen = useDeleteGoedkeuringBeleidsregel({
    mutation: {
      onSuccess: () => { verversen(); toast({ title: "Beleidsregel verwijderd" }); setVerwijderId(null); },
      onError: () => toast({ title: "Verwijderen mislukt", variant: "destructive" }),
    },
  });

  function openNieuw() {
    setBewerkId(null);
    setForm(LEEG_REGEL);
    setDialogOpen(true);
  }

  function openBewerk(regel: GoedkeuringBeleidsregel) {
    setBewerkId(regel.id);
    setForm({
      naam: regel.naam,
      document_type: regel.document_type,
      werkmaatschappij_id: regel.werkmaatschappij_id ?? null,
      ondergrens: regel.ondergrens ?? null,
      bovengrens: regel.bovengrens ?? null,
      goedkeurder_gebruiker_id: regel.goedkeurder_gebruiker_id ?? null,
      goedkeurder_module: regel.goedkeurder_module ?? null,
      goedkeurder_min_niveau: regel.goedkeurder_min_niveau ?? null,
      aantal_goedkeuringen_vereist: regel.aantal_goedkeuringen_vereist,
      vier_ogen_verplicht: regel.vier_ogen_verplicht,
      vervanger_gebruiker_id: regel.vervanger_gebruiker_id ?? null,
      reactietermijn_uren: regel.reactietermijn_uren ?? null,
      actief: regel.actief,
    });
    setDialogOpen(true);
  }

  function opslaan() {
    if (!form.naam.trim() || !form.document_type.trim()) {
      toast({ title: "Naam en documenttype zijn verplicht", variant: "destructive" });
      return;
    }
    if (bewerkId) {
      bijwerken.mutate({ id: bewerkId, data: form });
    } else {
      aanmaken.mutate({ data: form });
    }
  }

  const werkgeverNaam = (id?: number | null) => werkgevers?.find((w) => w.id === id)?.naam ?? "Alle";
  const gebruikerNaam = (id?: number | null) => gebruikers?.find((g) => g.id === id)?.naam ?? null;

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="flex flex-col gap-4">
      {magBeheren && (
        <div className="flex justify-end">
          <Button size="sm" onClick={openNieuw}>
            <Plus className="h-4 w-4" />
            Nieuwe beleidsregel
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead>Documenttype</TableHead>
                <TableHead>Werkmaatschappij</TableHead>
                <TableHead>Bereik</TableHead>
                <TableHead>Goedkeurder</TableHead>
                <TableHead>Vereist</TableHead>
                <TableHead>Vier ogen</TableHead>
                <TableHead>Actief</TableHead>
                {magBeheren && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(regels ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={magBeheren ? 9 : 8} className="text-center text-sm text-muted-foreground py-8">
                    Nog geen beleidsregels ingericht.
                  </TableCell>
                </TableRow>
              )}
              {(regels ?? []).map((regel) => (
                <TableRow key={regel.id}>
                  <TableCell className="font-medium">{regel.naam}</TableCell>
                  <TableCell>{documentTypeLabel(regel.document_type)}</TableCell>
                  <TableCell>{werkgeverNaam(regel.werkmaatschappij_id)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {euro(regel.ondergrens)} – {euro(regel.bovengrens)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {gebruikerNaam(regel.goedkeurder_gebruiker_id)
                      ?? (regel.goedkeurder_module
                        ? `${MODULES.find((m) => m.id === regel.goedkeurder_module)?.label ?? regel.goedkeurder_module} (niveau ${regel.goedkeurder_min_niveau ?? 4}+)`
                        : "—")}
                  </TableCell>
                  <TableCell>{regel.aantal_goedkeuringen_vereist}</TableCell>
                  <TableCell>{regel.vier_ogen_verplicht ? "Ja" : "Nee"}</TableCell>
                  <TableCell>
                    <Badge variant={regel.actief ? "outline" : "secondary"} className="text-xs">
                      {regel.actief ? "Actief" : "Uitgeschakeld"}
                    </Badge>
                  </TableCell>
                  {magBeheren && (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openBewerk(regel)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => setVerwijderId(regel.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{bewerkId ? "Beleidsregel bewerken" : "Nieuwe beleidsregel"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Naam</Label>
              <Input value={form.naam} onChange={(e) => setForm({ ...form, naam: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Documenttype</Label>
              <Input
                value={form.document_type}
                placeholder="bijv. inkoopbon, offerte, factuur"
                onChange={(e) => setForm({ ...form, document_type: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Werkmaatschappij</Label>
              <Select
                value={form.werkmaatschappij_id ? String(form.werkmaatschappij_id) : "alle"}
                onValueChange={(v) => setForm({ ...form, werkmaatschappij_id: v === "alle" ? null : Number(v) })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle werkmaatschappijen</SelectItem>
                  {(werkgevers ?? []).map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>{w.naam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ondergrens (€)</Label>
              <Input
                type="number"
                value={form.ondergrens ?? ""}
                onChange={(e) => setForm({ ...form, ondergrens: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Bovengrens (€)</Label>
              <Input
                type="number"
                value={form.bovengrens ?? ""}
                onChange={(e) => setForm({ ...form, bovengrens: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Goedkeurder — specifieke gebruiker (optioneel)</Label>
              <Select
                value={form.goedkeurder_gebruiker_id ? String(form.goedkeurder_gebruiker_id) : "geen"}
                onValueChange={(v) => setForm({ ...form, goedkeurder_gebruiker_id: v === "geen" ? null : Number(v) })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="geen">Geen — gebruik moduletoegang</SelectItem>
                  {(gebruikers ?? []).filter((g) => g.actief).map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>{g.naam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!form.goedkeurder_gebruiker_id && (
              <>
                <div className="space-y-1.5">
                  <Label>Goedkeurder — module</Label>
                  <Select
                    value={form.goedkeurder_module ?? "geen"}
                    onValueChange={(v) => setForm({ ...form, goedkeurder_module: v === "geen" ? null : v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="geen">Geen</SelectItem>
                      {MODULES.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Minimaal niveau</Label>
                  <Input
                    type="number"
                    min={1}
                    max={4}
                    value={form.goedkeurder_min_niveau ?? 4}
                    onChange={(e) => setForm({ ...form, goedkeurder_min_niveau: Number(e.target.value) })}
                  />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label>Aantal goedkeuringen vereist</Label>
              <Input
                type="number"
                min={1}
                value={form.aantal_goedkeuringen_vereist}
                onChange={(e) => setForm({ ...form, aantal_goedkeuringen_vereist: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Reactietermijn (uren, optioneel)</Label>
              <Input
                type="number"
                value={form.reactietermijn_uren ?? ""}
                onChange={(e) => setForm({ ...form, reactietermijn_uren: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div className="col-span-2 flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Vier-ogen-principe verplicht</p>
                <p className="text-xs text-muted-foreground">Indiener mag niet zelf goedkeuren</p>
              </div>
              <Switch
                checked={form.vier_ogen_verplicht}
                onCheckedChange={(v) => setForm({ ...form, vier_ogen_verplicht: v })}
              />
            </div>
            <div className="col-span-2 flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Actief</p>
                <p className="text-xs text-muted-foreground">Uitgeschakelde regels worden niet toegepast</p>
              </div>
              <Switch
                checked={form.actief}
                onCheckedChange={(v) => setForm({ ...form, actief: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuleren</Button>
            <Button onClick={opslaan} disabled={aanmaken.isPending || bijwerken.isPending}>
              {aanmaken.isPending || bijwerken.isPending ? "Bezig..." : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={verwijderId !== null} onOpenChange={(open) => !open && setVerwijderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Beleidsregel verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dit kan niet ongedaan worden gemaakt. Al ingediende aanvragen blijven bewaard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => verwijderId && verwijderen.mutate({ id: verwijderId })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AanvragenTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [afwijzenAanvraag, setAfwijzenAanvraag] = useState<GoedkeuringAanvraag | null>(null);
  const [afwijzenReden, setAfwijzenReden] = useState("");

  const params = useMemo(
    () => (statusFilter === "alle" ? undefined : { status: statusFilter }),
    [statusFilter],
  );
  const { data: aanvragen, isLoading } = useListGoedkeuringAanvragen(params);

  function verversen() {
    qc.invalidateQueries({ queryKey: getListGoedkeuringAanvragenQueryKey() });
  }

  const goedkeuren = useGoedkeuringAanvraagGoedkeuren({
    mutation: {
      onSuccess: () => { verversen(); toast({ title: "Aanvraag goedgekeurd" }); },
      onError: () => toast({ title: "Goedkeuren mislukt", variant: "destructive" }),
    },
  });
  const afwijzen = useGoedkeuringAanvraagAfwijzen({
    mutation: {
      onSuccess: () => {
        verversen();
        toast({ title: "Aanvraag afgewezen" });
        setAfwijzenAanvraag(null);
        setAfwijzenReden("");
      },
      onError: () => toast({ title: "Afwijzen mislukt", variant: "destructive" }),
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle statussen</SelectItem>
            <SelectItem value="ingediend">Wacht op goedkeuring</SelectItem>
            <SelectItem value="goedgekeurd">Goedgekeurd</SelectItem>
            <SelectItem value="afgewezen">Afgewezen</SelectItem>
            <SelectItem value="ingetrokken">Ingetrokken</SelectItem>
            <SelectItem value="vervangen">Vervangen</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Omschrijving</TableHead>
                  <TableHead>Bedrag</TableHead>
                  <TableHead>Ingediend door</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(aanvragen ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                      Geen aanvragen gevonden.
                    </TableCell>
                  </TableRow>
                )}
                {(aanvragen ?? []).map((aanvraag) => {
                  const info = GOEDKEURING_STATUS_INFO[aanvraag.status] ?? GOEDKEURING_STATUS_INFO.ingediend;
                  const Icon = info.icon;
                  return (
                    <TableRow key={aanvraag.id}>
                      <TableCell className="font-medium">{documentTypeLabel(aanvraag.document_type)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-64 truncate">
                        {aanvraag.omschrijving ?? "—"}
                      </TableCell>
                      <TableCell>{euro(aanvraag.bedrag)}</TableCell>
                      <TableCell className="text-sm">{aanvraag.ingediend_door_naam ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${info.kleur}`}>
                          <Icon className="h-3 w-3 mr-1" />
                          {info.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {aanvraag.status === "ingediend" && aanvraag.mag_goedkeuren && (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={goedkeuren.isPending}
                              onClick={() => goedkeuren.mutate({ id: aanvraag.id })}
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Goedkeuren
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs text-destructive"
                              onClick={() => setAfwijzenAanvraag(aanvraag)}
                            >
                              <XCircle className="h-3 w-3" />
                              Afwijzen
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={afwijzenAanvraag !== null} onOpenChange={(open) => !open && setAfwijzenAanvraag(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aanvraag afwijzen</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reden (verplicht)</Label>
            <Textarea value={afwijzenReden} onChange={(e) => setAfwijzenReden(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAfwijzenAanvraag(null)}>Annuleren</Button>
            <Button
              variant="destructive"
              disabled={!afwijzenReden.trim() || afwijzen.isPending}
              onClick={() => afwijzenAanvraag && afwijzen.mutate({ id: afwijzenAanvraag.id, data: { reden: afwijzenReden.trim() } })}
            >
              {afwijzen.isPending ? "Bezig..." : "Afwijzen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function GoedkeuringsbeleidBeheer() {
  const { heeftNiveau } = useBevoegdheid();
  const magBeheren = heeftNiveau("goedkeuring", 4);
  const [tabActief, setTabActief] = useState("aanvragen");

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Goedkeuringsbeleid</h1>
          <p className="text-sm text-muted-foreground">
            Financiële grenzen, vier-ogen-regels en goedkeuringsaanvragen voor offertes, facturen, inkoop en overige documenten
          </p>
        </div>
      </div>

      <Tabs value={tabActief} onValueChange={setTabActief}>
        <TabsList>
          <TabsTrigger value="aanvragen">Aanvragen</TabsTrigger>
          <TabsTrigger value="beleidsregels">Beleidsregels</TabsTrigger>
        </TabsList>
        <TabsContent value="aanvragen" className="mt-4">
          <AanvragenTab />
        </TabsContent>
        <TabsContent value="beleidsregels" className="mt-4">
          <BeleidsregelsTab magBeheren={magBeheren} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
