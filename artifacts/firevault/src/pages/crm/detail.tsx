import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetCrmKlant,
  useListCrmContactpersonen,
  useCreateCrmContactpersoon,
  useDeleteCrmContactpersoon,
  useListCrmOpdrachten,
  useCreateCrmOpdracht,
  useDeleteCrmOpdracht,
  useListCrmCommunicatie,
  useCreateCrmCommunicatie,
  useDeleteCrmCommunicatie,
  useListCrmCommercieel,
  useCreateCrmCommercieel,
  useDeleteCrmCommercieel,
  useListCrmFinancieel,
  useCreateCrmFinancieel,
  useDeleteCrmFinancieel,
  useListGebouwen,
  getListCrmContactpersonenQueryKey,
  getListCrmOpdrachtenQueryKey,
  getListCrmCommunicatieQueryKey,
  getListCrmCommercieelQueryKey,
  getListCrmFinancieelQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AiInvullenKnop } from "@/components/ai-invullen-knop";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useRol } from "@/context/rol-context";
import {
  ArrowLeft, Building2, Plus, Trash2, Phone, Mail, Smartphone, Star,
  Lock, Briefcase, MessageSquare, TrendingUp, Euro, Users, Sparkles,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CrmCoachPanel } from "@/components/crm-coach-panel";
import { CrmRelatienetwerk } from "@/components/crm-relatienetwerk";

const GEEN_GEBOUW = "geen";

function geld(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
}

function datum(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("nl-NL");
}

export default function CrmKlantDetail() {
  const { id } = useParams<{ id: string }>();
  const klantId = Number(id);
  const { echteRol } = useRol();
  const isHoofd = echteRol === "hoofdbeheerder";

  const { data: klant, isLoading } = useGetCrmKlant(klantId);

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!klant) {
    return (
      <div className="max-w-5xl mx-auto">
        <Link href="/crm">
          <Button variant="ghost"><ArrowLeft className="h-4 w-4" /> Terug</Button>
        </Link>
        <Card className="mt-4">
          <CardContent className="py-12 text-center text-muted-foreground">
            Klant niet gevonden.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link href="/crm">
        <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /> Alle klanten</Button>
      </Link>

      <div className="flex items-start gap-3">
        <div className="bg-primary/10 text-primary rounded-lg p-3">
          <Building2 className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">{klant.naam}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {klant.branche && <span>{klant.branche}</span>}
            {klant.kvk && <span>KvK {klant.kvk}</span>}
            {(klant.adres || klant.stad) && (
              <span>{[klant.adres, klant.postcode, klant.stad].filter(Boolean).join(" ")}</span>
            )}
            {klant.telefoon && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{klant.telefoon}</span>}
            {klant.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{klant.email}</span>}
          </div>
          <div className="flex flex-wrap gap-2 mt-1">
            <Badge variant="outline">{klant.status}</Badge>
            <Sheet>
              <SheetTrigger asChild>
                <button className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium hover:bg-accent transition-colors">
                  <Sparkles className="h-3 w-3" /> Coach
                </button>
              </SheetTrigger>
              <SheetContent className="w-80 overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>AI Business Coach</SheetTitle>
                </SheetHeader>
                <div className="mt-6">
                  <CrmCoachPanel scherm="organisatie_detail" klantId={klantId} />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      <CrmRelatienetwerk klantId={klantId} klantNaam={klant.naam} />

      <Tabs defaultValue="contactpersonen">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="contactpersonen"><Users className="h-4 w-4 mr-1" />Contactpersonen</TabsTrigger>
          <TabsTrigger value="opdrachten"><Briefcase className="h-4 w-4 mr-1" />Opdrachten</TabsTrigger>
          <TabsTrigger value="communicatie"><MessageSquare className="h-4 w-4 mr-1" />Communicatie</TabsTrigger>
          <TabsTrigger value="commercieel"><TrendingUp className="h-4 w-4 mr-1" />Commercieel</TabsTrigger>
          <TabsTrigger value="financieel"><Euro className="h-4 w-4 mr-1" />Financieel</TabsTrigger>
        </TabsList>

        <TabsContent value="contactpersonen"><ContactpersonenTab klantId={klantId} /></TabsContent>
        <TabsContent value="opdrachten"><OpdrachtenTab klantId={klantId} /></TabsContent>
        <TabsContent value="communicatie"><CommunicatieTab klantId={klantId} /></TabsContent>
        <TabsContent value="commercieel"><CommercieelTab klantId={klantId} /></TabsContent>
        <TabsContent value="financieel"><FinancieelTab klantId={klantId} isHoofd={isHoofd} /></TabsContent>
      </Tabs>
    </div>
  );
}

function LegeRij({ tekst }: { tekst: string }) {
  return <div className="py-8 text-center text-sm text-muted-foreground">{tekst}</div>;
}

function VerwijderKnop({ onConfirm, isPending }: { onConfirm: () => void; isPending: boolean }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Verwijderen?</AlertDialogTitle>
          <AlertDialogDescription>Deze actie kan niet ongedaan worden gemaakt.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuleren</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isPending}>Verwijderen</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ContactpersonenTab({ klantId }: { klantId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: items, isLoading } = useListCrmContactpersonen(klantId);
  const maak = useCreateCrmContactpersoon();
  const verwijder = useDeleteCrmContactpersoon();

  const [open, setOpen] = useState(false);
  const [naam, setNaam] = useState("");
  const [functie, setFunctie] = useState("");
  const [email, setEmail] = useState("");
  const [telefoon, setTelefoon] = useState("");
  const [mobiel, setMobiel] = useState("");

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListCrmContactpersonenQueryKey(klantId) });

  async function opslaan() {
    if (!naam.trim()) { toast({ title: "Naam is verplicht", variant: "destructive" }); return; }
    try {
      await maak.mutateAsync({
        id: klantId,
        data: {
          naam: naam.trim(),
          functie: functie.trim() || undefined,
          email: email.trim() || undefined,
          telefoon: telefoon.trim() || undefined,
          mobiel: mobiel.trim() || undefined,
        },
      });
      await invalidate();
      toast({ title: "Contactpersoon toegevoegd" });
      setNaam(""); setFunctie(""); setEmail(""); setTelefoon(""); setMobiel("");
      setOpen(false);
    } catch { toast({ title: "Opslaan mislukt", variant: "destructive" }); }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4" /> Contactpersoon</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nieuwe contactpersoon</DialogTitle></DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2 space-y-1.5"><Label>Naam *</Label><Input value={naam} onChange={(e) => setNaam(e.target.value)} /></div>
                <div className="sm:col-span-2">
                  <AiInvullenKnop
                    formulierType="crm_contactpersoon"
                    contextId={klantId}
                    huidigVelden={{ naam }}
                    onVoorstellen={(voorgesteld) => {
                      if (voorgesteld.email)    setEmail(voorgesteld.email);
                      if (voorgesteld.telefoon) setTelefoon(voorgesteld.telefoon);
                      if (voorgesteld.mobiel)   setMobiel(voorgesteld.mobiel);
                      if (voorgesteld.functie)  setFunctie(voorgesteld.functie);
                    }}
                  />
                </div>
                <div className="sm:col-span-2 space-y-1.5"><Label>Functie</Label><Input value={functie} onChange={(e) => setFunctie(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>E-mail</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Telefoon</Label><Input value={telefoon} onChange={(e) => setTelefoon(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Mobiel</Label><Input value={mobiel} onChange={(e) => setMobiel(e.target.value)} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
                <Button onClick={opslaan} disabled={maak.isPending}>Opslaan</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (items ?? []).length === 0 ? (
          <LegeRij tekst="Nog geen contactpersonen." />
        ) : (
          <div className="divide-y">
            {(items ?? []).map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-2">
                    {c.naam}
                    {c.primair && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}
                  </div>
                  {c.functie && <div className="text-xs text-muted-foreground">{c.functie}</div>}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                    {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                    {c.telefoon && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.telefoon}</span>}
                    {c.mobiel && <span className="flex items-center gap-1"><Smartphone className="h-3 w-3" />{c.mobiel}</span>}
                  </div>
                </div>
                <VerwijderKnop
                  isPending={verwijder.isPending}
                  onConfirm={async () => {
                    try { await verwijder.mutateAsync({ id: c.id }); await invalidate(); toast({ title: "Verwijderd" }); }
                    catch { toast({ title: "Verwijderen mislukt", variant: "destructive" }); }
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const OPDRACHT_STATUS = ["offerte", "lopend", "afgerond", "geannuleerd"] as const;

function OpdrachtenTab({ klantId }: { klantId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: items, isLoading } = useListCrmOpdrachten(klantId);
  const { data: gebouwen } = useListGebouwen();
  const maak = useCreateCrmOpdracht();
  const verwijder = useDeleteCrmOpdracht();

  const [open, setOpen] = useState(false);
  const [titel, setTitel] = useState("");
  const [omschrijving, setOmschrijving] = useState("");
  const [status, setStatus] = useState<string>("offerte");
  const [waarde, setWaarde] = useState("");
  const [gebouwId, setGebouwId] = useState<string>(GEEN_GEBOUW);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListCrmOpdrachtenQueryKey(klantId) });

  async function opslaan() {
    if (!titel.trim()) { toast({ title: "Titel is verplicht", variant: "destructive" }); return; }
    try {
      await maak.mutateAsync({
        id: klantId,
        data: {
          titel: titel.trim(),
          omschrijving: omschrijving.trim() || undefined,
          status,
          waarde: waarde ? Number(waarde) : undefined,
          gebouw_id: gebouwId === GEEN_GEBOUW ? null : Number(gebouwId),
        },
      });
      await invalidate();
      toast({ title: "Opdracht toegevoegd" });
      setTitel(""); setOmschrijving(""); setStatus("offerte"); setWaarde(""); setGebouwId(GEEN_GEBOUW);
      setOpen(false);
    } catch { toast({ title: "Opslaan mislukt", variant: "destructive" }); }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4" /> Opdracht</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nieuwe opdracht</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-1.5"><Label>Titel *</Label><Input value={titel} onChange={(e) => setTitel(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Omschrijving</Label><Textarea value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{OPDRACHT_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Waarde (€)</Label><Input type="number" value={waarde} onChange={(e) => setWaarde(e.target.value)} /></div>
                </div>
                <div className="space-y-1.5">
                  <Label>Gebouw</Label>
                  <Select value={gebouwId} onValueChange={setGebouwId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={GEEN_GEBOUW}>Geen gebouw</SelectItem>
                      {(gebouwen ?? []).map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.naam}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
                <Button onClick={opslaan} disabled={maak.isPending}>Opslaan</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (items ?? []).length === 0 ? (
          <LegeRij tekst="Nog geen opdrachten." />
        ) : (
          <div className="divide-y">
            {(items ?? []).map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="font-medium">{o.titel}</div>
                  {o.omschrijving && <div className="text-xs text-muted-foreground line-clamp-2">{o.omschrijving}</div>}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                    {o.gebouw_naam && <span>{o.gebouw_naam}</span>}
                    <span>{geld(o.waarde)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant="outline">{o.status}</Badge>
                  <VerwijderKnop
                    isPending={verwijder.isPending}
                    onConfirm={async () => {
                      try { await verwijder.mutateAsync({ id: o.id }); await invalidate(); toast({ title: "Verwijderd" }); }
                      catch { toast({ title: "Verwijderen mislukt", variant: "destructive" }); }
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const COMM_TYPE = ["telefoon", "email", "afspraak", "notitie"] as const;

function CommunicatieTab({ klantId }: { klantId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: items, isLoading } = useListCrmCommunicatie(klantId);
  const maak = useCreateCrmCommunicatie();
  const verwijder = useDeleteCrmCommunicatie();

  const [open, setOpen] = useState(false);
  const [onderwerp, setOnderwerp] = useState("");
  const [type, setType] = useState<string>("notitie");
  const [inhoud, setInhoud] = useState("");

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListCrmCommunicatieQueryKey(klantId) });

  async function opslaan() {
    if (!onderwerp.trim()) { toast({ title: "Onderwerp is verplicht", variant: "destructive" }); return; }
    try {
      await maak.mutateAsync({
        id: klantId,
        data: { onderwerp: onderwerp.trim(), type, inhoud: inhoud.trim() || undefined },
      });
      await invalidate();
      toast({ title: "Communicatie toegevoegd" });
      setOnderwerp(""); setType("notitie"); setInhoud("");
      setOpen(false);
    } catch { toast({ title: "Opslaan mislukt", variant: "destructive" }); }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4" /> Notitie</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nieuwe communicatie</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-1.5"><Label>Onderwerp *</Label><Input value={onderwerp} onChange={(e) => setOnderwerp(e.target.value)} /></div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{COMM_TYPE.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Inhoud</Label><Textarea value={inhoud} onChange={(e) => setInhoud(e.target.value)} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
                <Button onClick={opslaan} disabled={maak.isPending}>Opslaan</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (items ?? []).length === 0 ? (
          <LegeRij tekst="Nog geen communicatie vastgelegd." />
        ) : (
          <div className="divide-y">
            {(items ?? []).map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-2">
                    <Badge variant="secondary">{c.type}</Badge>{c.onderwerp}
                  </div>
                  {c.inhoud && <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{c.inhoud}</div>}
                  <div className="text-xs text-muted-foreground mt-1">{datum(c.datum)}{c.gebruiker_naam ? ` · ${c.gebruiker_naam}` : ""}</div>
                </div>
                <VerwijderKnop
                  isPending={verwijder.isPending}
                  onConfirm={async () => {
                    try { await verwijder.mutateAsync({ id: c.id }); await invalidate(); toast({ title: "Verwijderd" }); }
                    catch { toast({ title: "Verwijderen mislukt", variant: "destructive" }); }
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const FASES = ["lead", "kwalificatie", "voorstel", "onderhandeling", "gewonnen", "verloren"] as const;

function CommercieelTab({ klantId }: { klantId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: items, isLoading } = useListCrmCommercieel(klantId);
  const maak = useCreateCrmCommercieel();
  const verwijder = useDeleteCrmCommercieel();

  const [open, setOpen] = useState(false);
  const [titel, setTitel] = useState("");
  const [fase, setFase] = useState<string>("lead");
  const [waarde, setWaarde] = useState("");
  const [kans, setKans] = useState("");

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListCrmCommercieelQueryKey(klantId) });

  async function opslaan() {
    if (!titel.trim()) { toast({ title: "Titel is verplicht", variant: "destructive" }); return; }
    try {
      await maak.mutateAsync({
        id: klantId,
        data: {
          titel: titel.trim(),
          fase,
          waarde: waarde ? Number(waarde) : undefined,
          kans: kans ? Number(kans) : undefined,
        },
      });
      await invalidate();
      toast({ title: "Kans toegevoegd" });
      setTitel(""); setFase("lead"); setWaarde(""); setKans("");
      setOpen(false);
    } catch { toast({ title: "Opslaan mislukt", variant: "destructive" }); }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4" /> Kans</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nieuwe commerciële kans</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-1.5"><Label>Titel *</Label><Input value={titel} onChange={(e) => setTitel(e.target.value)} /></div>
                <div className="space-y-1.5">
                  <Label>Fase</Label>
                  <Select value={fase} onValueChange={setFase}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{FASES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Waarde (€)</Label><Input type="number" value={waarde} onChange={(e) => setWaarde(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Kans (%)</Label><Input type="number" value={kans} onChange={(e) => setKans(e.target.value)} /></div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
                <Button onClick={opslaan} disabled={maak.isPending}>Opslaan</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (items ?? []).length === 0 ? (
          <LegeRij tekst="Nog geen commerciële kansen." />
        ) : (
          <div className="divide-y">
            {(items ?? []).map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="font-medium">{c.titel}</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                    <span>{geld(c.waarde)}</span>
                    {c.kans != null && <span>{c.kans}% kans</span>}
                    {c.verwachte_sluitdatum && <span>sluit {datum(c.verwachte_sluitdatum)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant="outline">{c.fase}</Badge>
                  <VerwijderKnop
                    isPending={verwijder.isPending}
                    onConfirm={async () => {
                      try { await verwijder.mutateAsync({ id: c.id }); await invalidate(); toast({ title: "Verwijderd" }); }
                      catch { toast({ title: "Verwijderen mislukt", variant: "destructive" }); }
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const FIN_TYPE = ["factuur", "offerte", "creditnota", "betaling"] as const;
const FIN_STATUS = ["open", "verzonden", "betaald", "vervallen"] as const;

function FinancieelTab({ klantId, isHoofd }: { klantId: number; isHoofd: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: items, isLoading } = useListCrmFinancieel(klantId, {
    query: { enabled: isHoofd, queryKey: getListCrmFinancieelQueryKey(klantId) },
  });
  const maak = useCreateCrmFinancieel();
  const verwijder = useDeleteCrmFinancieel();

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>("factuur");
  const [omschrijving, setOmschrijving] = useState("");
  const [bedrag, setBedrag] = useState("");
  const [status, setStatus] = useState<string>("open");
  const [factuurnummer, setFactuurnummer] = useState("");

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListCrmFinancieelQueryKey(klantId) });

  if (!isHoofd) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground space-y-2">
          <Lock className="h-8 w-8 mx-auto opacity-40" />
          <p>Financiële gegevens zijn alleen zichtbaar voor de hoofdbeheerder.</p>
        </CardContent>
      </Card>
    );
  }

  async function opslaan() {
    if (!type) { toast({ title: "Type is verplicht", variant: "destructive" }); return; }
    try {
      await maak.mutateAsync({
        id: klantId,
        data: {
          type,
          omschrijving: omschrijving.trim() || undefined,
          bedrag: bedrag ? Number(bedrag) : undefined,
          status,
          factuurnummer: factuurnummer.trim() || undefined,
        },
      });
      await invalidate();
      toast({ title: "Financiële post toegevoegd" });
      setType("factuur"); setOmschrijving(""); setBedrag(""); setStatus("open"); setFactuurnummer("");
      setOpen(false);
    } catch { toast({ title: "Opslaan mislukt", variant: "destructive" }); }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4" /> Post</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nieuwe financiële post</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <Select value={type} onValueChange={setType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{FIN_TYPE.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{FIN_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5"><Label>Omschrijving</Label><Input value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Bedrag (€)</Label><Input type="number" value={bedrag} onChange={(e) => setBedrag(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Factuurnummer</Label><Input value={factuurnummer} onChange={(e) => setFactuurnummer(e.target.value)} /></div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
                <Button onClick={opslaan} disabled={maak.isPending}>Opslaan</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (items ?? []).length === 0 ? (
          <LegeRij tekst="Nog geen financiële posten." />
        ) : (
          <div className="divide-y">
            {(items ?? []).map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-2">
                    <Badge variant="secondary">{f.type}</Badge>
                    {f.factuurnummer || f.omschrijving || "—"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {geld(f.bedrag)}{f.datum ? ` · ${datum(f.datum)}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant="outline">{f.status}</Badge>
                  <VerwijderKnop
                    isPending={verwijder.isPending}
                    onConfirm={async () => {
                      try { await verwijder.mutateAsync({ id: f.id }); await invalidate(); toast({ title: "Verwijderd" }); }
                      catch { toast({ title: "Verwijderen mislukt", variant: "destructive" }); }
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
