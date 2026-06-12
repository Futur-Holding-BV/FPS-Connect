import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetHrmStats,
  useListMedewerkers,
  useCreateMedewerker,
  useOnboardMedewerker,
  useListFuncties,
  useCreateFunctie,
  useListOpleidingen,
  useCreateOpleiding,
  useListVerlofsoorten,
  useListCaoOpties,
  useListToewijsbareGebruikers,
  useListAlleVerlofAanvragen,
  useUpdateVerlofAanvraag,
  useListAlleBekwaamheden,
  getGetHrmStatsQueryKey,
  getListMedewerkersQueryKey,
  getListFunctiesQueryKey,
  getListOpleidingenQueryKey,
  getListAlleVerlofAanvragenQueryKey,
} from "@workspace/api-client-react";
import type {
  MedewerkerInput,
  FunctieInput,
  OpleidingInput,
  MedewerkerOnboardingInput,
  VerlofAanvraag,
} from "@workspace/api-client-react";
import { useRol } from "@/context/rol-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Plus, UserPlus, Briefcase, GraduationCap, CalendarClock, AlertTriangle,
  Award, Check, X, ChevronRight,
} from "lucide-react";

const WERKMAATSCHAPPIJ_STD = "FPS Brandpreventie";
const DIENSTVERBANDEN = ["vast", "tijdelijk", "oproep", "stage", "inhuur"] as const;

const NIVEAU_LABEL: Record<string, string> = {
  niet_bevoegd: "Niet bevoegd",
  onder_begeleiding: "Onder begeleiding",
  zelfstandig: "Zelfstandig",
  specialist: "Specialist",
  trainer: "Trainer / instructeur",
};

function niveauBadgeClass(n: string) {
  return n === "niet_bevoegd" || n === "onder_begeleiding" ? "border-amber-200 text-amber-700" : "";
}

function fmtDatum(datum?: string | null) {
  if (!datum) return "—";
  const d = new Date(datum);
  if (Number.isNaN(d.getTime())) return datum;
  return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
}

function huidigJaar() {
  return new Date().getFullYear();
}

export default function PersoneelPagina() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { echteRol, bevoegdheden } = useRol();
  const magSchrijven =
    echteRol === "hoofdbeheerder" || (bevoegdheden.personeel ?? 0) >= 2;

  const { data: stats } = useGetHrmStats();
  const { data: medewerkers, isLoading: medewerkersLaden } = useListMedewerkers();
  const { data: functies } = useListFuncties();
  const { data: opleidingen } = useListOpleidingen();
  const { data: verlofsoorten } = useListVerlofsoorten();
  const { data: caoOpties } = useListCaoOpties();
  const { data: gebruikers } = useListToewijsbareGebruikers();
  const { data: openAanvragen } = useListAlleVerlofAanvragen({ status: "aangevraagd" });
  const { data: alleBekwaamheden } = useListAlleBekwaamheden();

  const maakMedewerker = useCreateMedewerker();
  const onboard = useOnboardMedewerker();
  const maakFunctie = useCreateFunctie();
  const maakOpleiding = useCreateOpleiding();
  const beoordeelMutatie = useUpdateVerlofAanvraag();

  const gekoppeldeIds = new Set(
    (medewerkers ?? []).map((m) => m.gebruiker_id).filter((x): x is number => x != null),
  );
  const ongekoppeld = (gebruikers ?? []).filter((g) => !gekoppeldeIds.has(g.id));

  const bekwaamhedenPerCategorie = (alleBekwaamheden ?? []).reduce<Record<string, typeof alleBekwaamheden>>(
    (acc, b) => {
      const cat = b.categorie?.trim() || "Overig";
      (acc[cat] ??= []).push(b);
      return acc;
    },
    {},
  );

  async function beoordeelAanvraag(a: VerlofAanvraag, status: "goedgekeurd" | "afgewezen") {
    try {
      await beoordeelMutatie.mutateAsync({
        id: a.id,
        data: {
          verlofsoort_id: a.verlofsoort_id,
          start_datum: a.start_datum,
          eind_datum: a.eind_datum,
          aantal_uren: a.aantal_uren,
          status,
          reden: a.reden ?? undefined,
          opmerking: a.opmerking ?? undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListAlleVerlofAanvragenQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetHrmStatsQueryKey() });
      toast({ title: status === "goedgekeurd" ? "Aanvraag goedgekeurd" : "Aanvraag afgewezen" });
    } catch {
      toast({ title: "Beoordelen mislukt", variant: "destructive" });
    }
  }

  function startOnboard(gebruikerId: number) {
    setOnboardForm((f) => ({ ...f, gebruiker_id: gebruikerId }));
    setOnboardOpen(true);
  }

  const [medewerkerOpen, setMedewerkerOpen] = useState(false);
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [functieOpen, setFunctieOpen] = useState(false);
  const [opleidingOpen, setOpleidingOpen] = useState(false);

  const [medewerkerForm, setMedewerkerForm] = useState<MedewerkerInput>({
    naam: "",
    werkmaatschappij: WERKMAATSCHAPPIJ_STD,
    dienstverband: "vast",
  });
  const [functieForm, setFunctieForm] = useState<FunctieInput>({
    naam: "",
    werkmaatschappij: WERKMAATSCHAPPIJ_STD,
  });
  const [opleidingForm, setOpleidingForm] = useState<OpleidingInput>({
    naam: "",
    categorie: "vakopleiding",
  });
  const [onboardForm, setOnboardForm] = useState<MedewerkerOnboardingInput>({
    gebruiker_id: 0,
    functie_id: 0,
    werkmaatschappij: WERKMAATSCHAPPIJ_STD,
    cao: "",
    contracturen_per_week: 38,
    in_dienst_sinds: new Date().toISOString().slice(0, 10),
    jaar: huidigJaar(),
    verlofsoort_ids: [],
  });

  async function opslaanMedewerker() {
    if (!medewerkerForm.naam.trim()) {
      toast({ title: "Naam is verplicht", variant: "destructive" });
      return;
    }
    try {
      await maakMedewerker.mutateAsync({ data: { ...medewerkerForm, naam: medewerkerForm.naam.trim() } });
      await queryClient.invalidateQueries({ queryKey: getListMedewerkersQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetHrmStatsQueryKey() });
      toast({ title: "Medewerker toegevoegd" });
      setMedewerkerForm({ naam: "", werkmaatschappij: WERKMAATSCHAPPIJ_STD, dienstverband: "vast" });
      setMedewerkerOpen(false);
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  async function opslaanOnboarding() {
    if (!onboardForm.gebruiker_id || !onboardForm.functie_id || !onboardForm.cao) {
      toast({ title: "Gebruiker, functie en CAO zijn verplicht", variant: "destructive" });
      return;
    }
    try {
      await onboard.mutateAsync({ data: onboardForm });
      await queryClient.invalidateQueries({ queryKey: getListMedewerkersQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetHrmStatsQueryKey() });
      toast({ title: "Medewerker onboarded", description: "Verlofsaldo is automatisch opgebouwd." });
      setOnboardOpen(false);
    } catch (err) {
      const bericht = err instanceof Error ? err.message : "Onboarding mislukt";
      toast({ title: "Onboarding mislukt", description: bericht, variant: "destructive" });
    }
  }

  async function opslaanFunctie() {
    if (!functieForm.naam.trim()) {
      toast({ title: "Naam is verplicht", variant: "destructive" });
      return;
    }
    try {
      const nieuw = await maakFunctie.mutateAsync({ data: { ...functieForm, naam: functieForm.naam.trim() } });
      await queryClient.invalidateQueries({ queryKey: getListFunctiesQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetHrmStatsQueryKey() });
      if (onboardOpen && nieuw?.id) {
        setOnboardForm((f) => ({ ...f, functie_id: nieuw.id }));
      }
      toast({ title: "Functie toegevoegd" });
      setFunctieForm({ naam: "", werkmaatschappij: WERKMAATSCHAPPIJ_STD });
      setFunctieOpen(false);
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  async function opslaanOpleiding() {
    if (!opleidingForm.naam.trim()) {
      toast({ title: "Naam is verplicht", variant: "destructive" });
      return;
    }
    try {
      await maakOpleiding.mutateAsync({ data: { ...opleidingForm, naam: opleidingForm.naam.trim() } });
      await queryClient.invalidateQueries({ queryKey: getListOpleidingenQueryKey() });
      toast({ title: "Opleiding toegevoegd" });
      setOpleidingForm({ naam: "", categorie: "vakopleiding" });
      setOpleidingOpen(false);
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  function toggleVerlofsoort(id: number) {
    setOnboardForm((f) => {
      const huidig = f.verlofsoort_ids ?? [];
      return huidig.includes(id)
        ? { ...f, verlofsoort_ids: huidig.filter((x) => x !== id) }
        : { ...f, verlofsoort_ids: [...huidig, id] };
    });
  }

  const statKaarten = [
    { label: "Medewerkers", waarde: stats?.medewerkers ?? 0, icon: Users },
    { label: "Actief", waarde: stats?.actief ?? 0, icon: UserPlus },
    { label: "Functies", waarde: stats?.functies ?? 0, icon: Briefcase },
    { label: "Certificaten verlopen", waarde: stats?.certificaten_verlopen_binnenkort ?? 0, icon: AlertTriangle },
    { label: "Open verlofaanvragen", waarde: stats?.openstaande_verlofaanvragen ?? 0, icon: CalendarClock },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Personeel / HRM</h1>
        <p className="text-sm text-muted-foreground">
          Medewerkers, functiehuis, opleidingen en verlof binnen de FPS Groep.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        {statKaarten.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <s.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold mt-1">{s.waarde}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="medewerkers">
        <TabsList>
          <TabsTrigger value="medewerkers">Medewerkers</TabsTrigger>
          <TabsTrigger value="functies">Functiehuis</TabsTrigger>
          <TabsTrigger value="opleidingen">Opleidingen</TabsTrigger>
          <TabsTrigger value="bekwaamheden">Bekwaamheden</TabsTrigger>
          <TabsTrigger value="verlof">Verlof</TabsTrigger>
        </TabsList>

        <TabsContent value="medewerkers" className="space-y-4">
          {magSchrijven && (
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setOnboardOpen(true)}>
                <UserPlus className="h-4 w-4" /> Onboarden
              </Button>
              <Button onClick={() => setMedewerkerOpen(true)}>
                <Plus className="h-4 w-4" /> Nieuwe medewerker
              </Button>
            </div>
          )}

          {magSchrijven && ongekoppeld.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Gebruikers zonder medewerkerprofiel</h2>
                  <Badge variant="secondary">{ongekoppeld.length}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Deze accounts bestaan al maar zijn nog niet als medewerker geregistreerd. Onboard ze
                  in één klik; naam en e-mail worden uit het account overgenomen.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ongekoppeld.map((g) => (
                    <div key={g.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{g.naam}</div>
                        <div className="text-xs text-muted-foreground">{g.rol}</div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => startOnboard(g.id)}>
                        <UserPlus className="h-4 w-4" /> Onboarden
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {medewerkersLaden ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
            </div>
          ) : (medewerkers ?? []).length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Nog geen medewerkers.</p>
            </CardContent></Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(medewerkers ?? []).map((m) => (
                <Link key={m.id} href={`/personeel/${m.id}`}>
                  <Card className="cursor-pointer transition-colors hover:border-primary/40 hover:bg-accent/40">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold truncate">{m.naam}</div>
                        <Badge variant={m.actief ? "outline" : "secondary"} className={m.actief ? "border-emerald-200 text-emerald-700" : ""}>
                          {m.actief ? "actief" : "inactief"}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {m.functie_naam && <div>{m.functie_naam}</div>}
                        <div>{m.werkmaatschappij}</div>
                        {m.cao && <div>CAO: {m.cao}</div>}
                        {m.contracturen_per_week != null && <div>{m.contracturen_per_week} uur/week</div>}
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        {m.gebruiker_id ? (
                          <Badge variant="secondary" className="text-[11px]">
                            Account{m.gebruiker_rol ? `: ${m.gebruiker_rol}` : ""}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[11px] border-amber-200 text-amber-700">Geen account</Badge>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="functies" className="space-y-4">
          <div className="flex items-center justify-end">
            <Button onClick={() => setFunctieOpen(true)}><Plus className="h-4 w-4" /> Nieuwe functie</Button>
          </div>
          {(functies ?? []).length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Nog geen functies.</p>
            </CardContent></Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(functies ?? []).map((f) => (
                <Card key={f.id}>
                  <CardContent className="p-4 space-y-1">
                    <div className="font-semibold">{f.naam}</div>
                    <div className="text-xs text-muted-foreground">{f.werkmaatschappij}</div>
                    {f.omschrijving && <p className="text-xs text-muted-foreground line-clamp-2">{f.omschrijving}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="opleidingen" className="space-y-4">
          <div className="flex items-center justify-end">
            <Button onClick={() => setOpleidingOpen(true)}><Plus className="h-4 w-4" /> Nieuwe opleiding</Button>
          </div>
          {(opleidingen ?? []).length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <GraduationCap className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Nog geen opleidingen.</p>
            </CardContent></Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(opleidingen ?? []).map((o) => (
                <Card key={o.id}>
                  <CardContent className="p-4 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold">{o.naam}</div>
                      {o.verplicht && <Badge variant="outline" className="border-amber-200 text-amber-700">verplicht</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">{o.categorie}</div>
                    {o.geldigheid_maanden != null && (
                      <div className="text-xs text-muted-foreground">Geldig {o.geldigheid_maanden} mnd</div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="verlof" className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Openstaande verlofaanvragen</h2>
              {(openAanvragen ?? []).length > 0 && <Badge variant="secondary">{(openAanvragen ?? []).length}</Badge>}
            </div>
            {(openAanvragen ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Geen openstaande aanvragen.</p>
            ) : (
              <div className="space-y-2">
                {(openAanvragen ?? []).map((a) => (
                  <Card key={a.id}>
                    <CardContent className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          <Link href={`/personeel/${a.medewerker_id}`} className="hover:underline">
                            {a.medewerker_naam ?? `Medewerker #${a.medewerker_id}`}
                          </Link>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {a.verlofsoort_naam ?? `Soort #${a.verlofsoort_id}`} · {fmtDatum(a.start_datum)} – {fmtDatum(a.eind_datum)} · {a.aantal_uren ?? 0} uur
                        </div>
                        {a.reden && <div className="text-xs text-muted-foreground mt-1">{a.reden}</div>}
                      </div>
                      {magSchrijven && (
                        <div className="flex items-center gap-2 shrink-0">
                          <Button variant="outline" size="sm" onClick={() => beoordeelAanvraag(a, "goedgekeurd")}><Check className="h-4 w-4" /> Goedkeuren</Button>
                          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => beoordeelAanvraag(a, "afgewezen")}><X className="h-4 w-4" /> Afwijzen</Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
          <div>
            <h2 className="text-sm font-semibold mb-2">Verlofsoorten (CAO)</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(verlofsoorten ?? []).map((v) => (
                <Card key={v.id}>
                  <CardContent className="p-4 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold">{v.naam}</div>
                      <Badge variant="outline">{v.betaald ? "betaald" : "onbetaald"}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{v.categorie}{v.cao ? ` — ${v.cao}` : ""}</div>
                    {v.opbouw_uren_per_jaar != null && (
                      <div className="text-xs text-muted-foreground">{v.opbouw_uren_per_jaar} uur/jaar</div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Verlofsaldo per medewerker en het indienen van aanvragen staan op het medewerkerdetail.
          </p>
        </TabsContent>

        <TabsContent value="bekwaamheden" className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Bekwaamheidsmatrix over alle medewerkers, gegroepeerd per categorie. Bewerken kan op het
            medewerkerdetail.
          </p>
          {(alleBekwaamheden ?? []).length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Award className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Nog geen bekwaamheden vastgelegd.</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-4">
              {Object.entries(bekwaamhedenPerCategorie).map(([categorie, items]) => (
                <div key={categorie}>
                  <h2 className="text-sm font-semibold mb-2">{categorie}</h2>
                  <div className="space-y-2">
                    {(items ?? []).map((b) => (
                      <Card key={b.id}>
                        <CardContent className="p-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{b.onderwerp}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              <Link href={`/personeel/${b.medewerker_id}`} className="hover:underline">
                                {b.medewerker_naam ?? `Medewerker #${b.medewerker_id}`}
                              </Link>
                            </div>
                          </div>
                          <Badge variant="outline" className={niveauBadgeClass(b.niveau)}>
                            {NIVEAU_LABEL[b.niveau] ?? b.niveau}
                          </Badge>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Nieuwe medewerker */}
      <Dialog open={medewerkerOpen} onOpenChange={setMedewerkerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nieuwe medewerker</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Naam *</Label>
              <Input value={medewerkerForm.naam} onChange={(e) => setMedewerkerForm({ ...medewerkerForm, naam: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input value={medewerkerForm.email ?? ""} onChange={(e) => setMedewerkerForm({ ...medewerkerForm, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefoon</Label>
              <Input value={medewerkerForm.telefoon ?? ""} onChange={(e) => setMedewerkerForm({ ...medewerkerForm, telefoon: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Werkmaatschappij</Label>
              <Input value={medewerkerForm.werkmaatschappij ?? ""} onChange={(e) => setMedewerkerForm({ ...medewerkerForm, werkmaatschappij: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Functie</Label>
              <Select
                value={medewerkerForm.functie_id ? String(medewerkerForm.functie_id) : undefined}
                onValueChange={(v) => setMedewerkerForm({ ...medewerkerForm, functie_id: Number(v) })}
              >
                <SelectTrigger><SelectValue placeholder="Kies functie" /></SelectTrigger>
                <SelectContent>
                  {(functies ?? []).map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.naam}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Dienstverband</Label>
              <Select value={medewerkerForm.dienstverband} onValueChange={(v) => setMedewerkerForm({ ...medewerkerForm, dienstverband: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DIENSTVERBANDEN.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Contracturen/week</Label>
              <Input
                type="number"
                value={medewerkerForm.contracturen_per_week ?? ""}
                onChange={(e) => setMedewerkerForm({ ...medewerkerForm, contracturen_per_week: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>In dienst sinds</Label>
              <Input type="date" value={medewerkerForm.in_dienst_sinds ?? ""} onChange={(e) => setMedewerkerForm({ ...medewerkerForm, in_dienst_sinds: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMedewerkerOpen(false)}>Annuleren</Button>
            <Button onClick={opslaanMedewerker} disabled={maakMedewerker.isPending}>
              {maakMedewerker.isPending ? "Bezig…" : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Onboarding */}
      <Dialog open={onboardOpen} onOpenChange={setOnboardOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Medewerker onboarden</DialogTitle>
            <DialogDescription>
              Koppel een bestaande gebruiker, kies de juiste CAO en aanvangsdatum. Het verlofsaldo
              wordt server-side pro rata opgebouwd.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Gebruiker *</Label>
              <Select
                value={onboardForm.gebruiker_id ? String(onboardForm.gebruiker_id) : undefined}
                onValueChange={(v) => setOnboardForm({ ...onboardForm, gebruiker_id: Number(v) })}
              >
                <SelectTrigger><SelectValue placeholder="Kies gebruiker" /></SelectTrigger>
                <SelectContent>
                  {(gebruikers ?? []).map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>{g.naam} — {g.rol}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Functie *</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 text-xs"
                  onClick={() => setFunctieOpen(true)}
                >
                  <Plus className="h-3 w-3" /> Nieuwe functie
                </Button>
              </div>
              {(functies ?? []).length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                  Nog geen functies in het functiehuis. Maak er eerst een aan met "Nieuwe functie".
                </p>
              ) : (
                <Select
                  value={onboardForm.functie_id ? String(onboardForm.functie_id) : undefined}
                  onValueChange={(v) => setOnboardForm({ ...onboardForm, functie_id: Number(v) })}
                >
                  <SelectTrigger><SelectValue placeholder="Kies functie" /></SelectTrigger>
                  <SelectContent>
                    {(functies ?? []).map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.naam}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>CAO *</Label>
              <Select value={onboardForm.cao || undefined} onValueChange={(v) => setOnboardForm({ ...onboardForm, cao: v })}>
                <SelectTrigger><SelectValue placeholder="Kies CAO" /></SelectTrigger>
                <SelectContent>
                  {(caoOpties ?? []).map((c) => <SelectItem key={c.naam} value={c.naam}>{c.naam}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Contracturen/week *</Label>
              <Input
                type="number"
                value={onboardForm.contracturen_per_week}
                onChange={(e) => setOnboardForm({ ...onboardForm, contracturen_per_week: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>In dienst sinds *</Label>
              <Input type="date" value={onboardForm.in_dienst_sinds} onChange={(e) => setOnboardForm({ ...onboardForm, in_dienst_sinds: e.target.value })} />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Verlofsoorten met beginsaldo</Label>
              <div className="grid grid-cols-2 gap-2">
                {(verlofsoorten ?? []).map((v) => (
                  <label key={v.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={(onboardForm.verlofsoort_ids ?? []).includes(v.id)}
                      onCheckedChange={() => toggleVerlofsoort(v.id)}
                    />
                    {v.naam}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOnboardOpen(false)}>Annuleren</Button>
            <Button onClick={opslaanOnboarding} disabled={onboard.isPending}>
              {onboard.isPending ? "Bezig…" : "Onboarden"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nieuwe functie */}
      <Dialog open={functieOpen} onOpenChange={setFunctieOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nieuwe functie</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Naam *</Label>
              <Input value={functieForm.naam} onChange={(e) => setFunctieForm({ ...functieForm, naam: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Werkmaatschappij</Label>
              <Input value={functieForm.werkmaatschappij ?? ""} onChange={(e) => setFunctieForm({ ...functieForm, werkmaatschappij: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Omschrijving</Label>
              <Textarea value={functieForm.omschrijving ?? ""} onChange={(e) => setFunctieForm({ ...functieForm, omschrijving: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFunctieOpen(false)}>Annuleren</Button>
            <Button onClick={opslaanFunctie} disabled={maakFunctie.isPending}>
              {maakFunctie.isPending ? "Bezig…" : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nieuwe opleiding */}
      <Dialog open={opleidingOpen} onOpenChange={setOpleidingOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nieuwe opleiding</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Naam *</Label>
              <Input value={opleidingForm.naam} onChange={(e) => setOpleidingForm({ ...opleidingForm, naam: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Categorie</Label>
              <Input value={opleidingForm.categorie ?? ""} onChange={(e) => setOpleidingForm({ ...opleidingForm, categorie: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Geldigheid (maanden)</Label>
              <Input
                type="number"
                value={opleidingForm.geldigheid_maanden ?? ""}
                onChange={(e) => setOpleidingForm({ ...opleidingForm, geldigheid_maanden: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={opleidingForm.verplicht ?? false}
                onCheckedChange={(c) => setOpleidingForm({ ...opleidingForm, verplicht: c === true })}
              />
              Verplichte opleiding
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpleidingOpen(false)}>Annuleren</Button>
            <Button onClick={opslaanOpleiding} disabled={maakOpleiding.isPending}>
              {maakOpleiding.isPending ? "Bezig…" : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
