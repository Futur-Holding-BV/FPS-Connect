import { useState, lazy, Suspense } from "react";
import { Link } from "wouter";
const HrmWidgets = lazy(() => import("./hrm-widgets"));
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetHrmStats,
  useListMedewerkers,
  useCreateMedewerker,
  useOnboardMedewerker,
  useListFuncties,
  useCreateFunctie,
  useUpdateFunctie,
  useDeleteFunctie,
  useListOpleidingen,
  useCreateOpleiding,
  useUpdateOpleiding,
  useDeleteOpleiding,
  useVoorstelOpleidingenVoorFunctie,
  useListVerlofsoorten,
  useListCaoOpties,
  useListToewijsbareGebruikers,
  useListAlleVerlofAanvragen,
  useUpdateVerlofAanvraag,
  useListAlleBekwaamheden,
  useListWerkgevers,
  useCreateWerkgever,
  useUpdateWerkgever,
  useListZiekmeldingen,
  useCreateZiekmelding,
  useUpdateZiekmelding,
  useDeleteZiekmelding,
  getGetHrmStatsQueryKey,
  getListMedewerkersQueryKey,
  getListFunctiesQueryKey,
  getListOpleidingenQueryKey,
  getListAlleVerlofAanvragenQueryKey,
  getListWerkgeversQueryKey,
  getListZiekmeldingenQueryKey,
  getListPlanningMedewerkersQueryKey,
} from "@workspace/api-client-react";
import type {
  MedewerkerInput,
  FunctieInput,
  Functie,
  OpleidingInput,
  Opleiding,
  OpleidingVoorstel,
  MedewerkerOnboardingInput,
  VerlofAanvraag,
  Werkgever,
  WerkgeverInput,
  ZiekmeldingenInput,
  CvAnalyseResultaat,
} from "@workspace/api-client-react";
import { PoortwachterSheet } from "@/components/hrm/poortwachter-sheet";
import { useRol } from "@/context/rol-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { PaginaHulp } from "@/components/pagina-hulp";
import {
  Users, Plus, UserPlus, Briefcase, GraduationCap, CalendarClock, AlertTriangle,
  Award, Check, X, ChevronRight, Building2, Pencil, Trash2, HeartPulse,
  LogOut, Upload, Loader2, Sparkles, CheckCircle2, Shield,
} from "lucide-react";
import { WERKMAATSCHAPPIJEN, caoVoorWerkmaatschappij } from "@/lib/werkmaatschappijen";
import { OffboardDialog } from "./offboard-dialog";
import { DemoBanner } from "@/components/ui/demo-banner";
import { demoMedewerkers } from "@/lib/demo-data";

const WERKMAATSCHAPPIJ_STD = WERKMAATSCHAPPIJEN[0];
const DIENSTVERBANDEN = ["vast", "tijdelijk", "oproep", "stage", "inhuur", "zzp", "uitzend"] as const;
const DIENSTVERBAND_LABELS: Record<string, string> = {
  vast: "Vaste medewerker",
  tijdelijk: "Tijdelijk contract",
  oproep: "Oproepkracht",
  stage: "Stagiair",
  inhuur: "Inhuur / onderaannemer",
  zzp: "ZZP-er",
  uitzend: "Uitzendkracht",
};

const SOORT_OPTIES = [
  { value: "cursus", label: "Cursus" },
  { value: "opleiding", label: "Opleiding" },
] as const;
const NIVEAU_OPTIES = ["MBO", "HBO", "WO/UT", "Anders"] as const;
const LESVORM_OPTIES = ["klassikaal", "online", "zelfstudie", "blended", "praktijk"] as const;

function soortLabel(s?: string | null) {
  return s === "opleiding" ? "Opleiding" : "Cursus";
}

function kostenLabel(wg?: number | null, wn?: number | null) {
  if (wg == null && wn == null) return null;
  return `Werkgever ${wg ?? 0}% / werknemer ${wn ?? 0}%`;
}

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
  const { data: werkgevers } = useListWerkgevers();
  const { data: ziekmeldingen } = useListZiekmeldingen();

  const maakMedewerker = useCreateMedewerker();
  const onboard = useOnboardMedewerker();
  const maakFunctie = useCreateFunctie();
  const wijzigFunctie = useUpdateFunctie();
  const verwijderFunctieMut = useDeleteFunctie();
  const maakOpleiding = useCreateOpleiding();
  const wijzigOpleiding = useUpdateOpleiding();
  const verwijderOpleidingMut = useDeleteOpleiding();
  const beoordeelMutatie = useUpdateVerlofAanvraag();
  const maakWerkgever = useCreateWerkgever();
  const wijzigWerkgever = useUpdateWerkgever();
  const maakZiekmelding = useCreateZiekmelding();
  const wijzigZiekmelding = useUpdateZiekmelding();
  const verwijderZiekmeldingMut = useDeleteZiekmelding();

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

  async function slaZiekmeldingOp() {
    try {
      if (!ziekForm.medewerker_id || !ziekForm.start_datum) {
        toast({ title: "Medewerker en startdatum zijn verplicht", variant: "destructive" });
        return;
      }
      await maakZiekmelding.mutateAsync({ data: ziekForm });
      await queryClient.invalidateQueries({ queryKey: getListZiekmeldingenQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetHrmStatsQueryKey() });
      setZiekOpen(false);
      setZiekForm({ medewerker_id: 0, start_datum: new Date().toISOString().slice(0, 10) });
      toast({ title: "Ziekmelding opgeslagen" });
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  async function markeerStatus(id: number, status: string, eindDatum?: string) {
    try {
      await wijzigZiekmelding.mutateAsync({
        id,
        data: { status, eind_datum: eindDatum ?? new Date().toISOString().slice(0, 10) } as ZiekmeldingenInput,
      });
      await queryClient.invalidateQueries({ queryKey: getListZiekmeldingenQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetHrmStatsQueryKey() });
      toast({ title: status === "hersteld" ? "Medewerker hersteld gemeld" : "Status bijgewerkt" });
    } catch {
      toast({ title: "Bijwerken mislukt", variant: "destructive" });
    }
  }

  async function verwijderZiekmelding(id: number) {
    try {
      await verwijderZiekmeldingMut.mutateAsync({ id });
      await queryClient.invalidateQueries({ queryKey: getListZiekmeldingenQueryKey() });
      setVerwijderZiekId(null);
      toast({ title: "Ziekmelding verwijderd" });
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    }
  }

  const [medewerkerOpen, setMedewerkerOpen] = useState(false);
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [functieOpen, setFunctieOpen] = useState(false);
  const [opleidingOpen, setOpleidingOpen] = useState(false);
  const [werkgeverOpen, setWerkgeverOpen] = useState(false);
  const [werkgeverEditId, setWerkgeverEditId] = useState<number | null>(null);
  const [functieBewerkenId, setFunctieBewerkenId] = useState<number | null>(null);
  const [opleidingBewerkenId, setOpleidingBewerkenId] = useState<number | null>(null);
  const [verwijderFunctieId, setVerwijderFunctieId] = useState<number | null>(null);
  const [verwijderOpleidingId, setVerwijderOpleidingId] = useState<number | null>(null);
  const [ziekOpen, setZiekOpen] = useState(false);
  const [ziekForm, setZiekForm] = useState<ZiekmeldingenInput>({
    medewerker_id: 0,
    start_datum: new Date().toISOString().slice(0, 10),
  });
  const [verwijderZiekId, setVerwijderZiekId] = useState<number | null>(null);
  const [poortwachterZiekmeldingId, setPoortwachterZiekmeldingId] = useState<number | null>(null);

  const [offboardOpen, setOffboardOpen] = useState(false);
  const [offboardMedId, setOffboardMedId] = useState<number | null>(null);
  const [cvAnalyseLaden, setCvAnalyseLaden] = useState(false);
  const [cvVoorstel, setCvVoorstel] = useState<CvAnalyseResultaat | null>(null);
  const [werkgeverForm, setWerkgeverForm] = useState<WerkgeverInput>({
    naam: "",
    cao: "",
    personeelsbeleid: null,
    adres: null,
    postcode: null,
    plaats: null,
    kvk: null,
    btw: null,
    telefoon: null,
    email: null,
    website: null,
    voettekst: null,
    actief: true,
  });

  const [medewerkerForm, setMedewerkerForm] = useState<MedewerkerInput>({
    naam: "",
    werkmaatschappij: WERKMAATSCHAPPIJ_STD,
    dienstverband: "vast",
    bedrijf_uitzendbureau: undefined,
  });
  const [functieForm, setFunctieForm] = useState<FunctieInput>({
    naam: "",
    werkmaatschappij: WERKMAATSCHAPPIJ_STD,
    uitvoerend: false,
  });
  const [opleidingForm, setOpleidingForm] = useState<OpleidingInput>({
    naam: "",
    categorie: "vakopleiding",
    soort: "cursus",
  });

  const [voorstelFunctieId, setVoorstelFunctieId] = useState<string>("");
  const [voorstellen, setVoorstellen] = useState<OpleidingVoorstel[]>([]);
  const [voorstelToelichting, setVoorstelToelichting] = useState<string | null>(null);
  const [voorstelBetrouwbaarheid, setVoorstelBetrouwbaarheid] = useState<string | null>(null);
  const [gekozenVoorstellen, setGekozenVoorstellen] = useState<Set<number>>(new Set());
  const [voorstelGedaan, setVoorstelGedaan] = useState(false);
  const voorstelMutatie = useVoorstelOpleidingenVoorFunctie();
  const [onboardForm, setOnboardForm] = useState<MedewerkerOnboardingInput>({
    gebruiker_id: 0,
    functie_id: 0,
    werkmaatschappij: WERKMAATSCHAPPIJ_STD,
    cao: caoVoorWerkmaatschappij(WERKMAATSCHAPPIJ_STD) ?? "",
    contracturen_per_week: 38,
    in_dienst_sinds: new Date().toISOString().slice(0, 10),
    jaar: huidigJaar(),
    verlofsoort_ids: [],
    dienstverband: "vast",
    bedrijf_uitzendbureau: undefined,
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
      await queryClient.invalidateQueries({ queryKey: getListPlanningMedewerkersQueryKey() });
      toast({ title: "Medewerker toegevoegd" });
      setMedewerkerForm({ naam: "", werkmaatschappij: WERKMAATSCHAPPIJ_STD, dienstverband: "vast", bedrijf_uitzendbureau: undefined });
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
      await queryClient.invalidateQueries({ queryKey: getListPlanningMedewerkersQueryKey() });
      toast({ title: "Medewerker onboarded", description: "Verlofsaldo is automatisch opgebouwd." });
      setOnboardOpen(false);
    } catch (err) {
      const bericht = err instanceof Error ? err.message : "Onboarding mislukt";
      toast({ title: "Onboarding mislukt", description: bericht, variant: "destructive" });
    }
  }

  async function uploadCv(file: File) {
    setCvAnalyseLaden(true);
    setCvVoorstel(null);
    try {
      const fd = new FormData();
      fd.append("cv", file);
      const res = await fetch("/api/medewerkers/ai-cv-analyse", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Onbekende fout" }));
        toast({
          title: "CV analyse mislukt",
          description: (err as { error?: string }).error ?? "Probeer opnieuw.",
          variant: "destructive",
        });
        return;
      }
      const data = (await res.json()) as CvAnalyseResultaat;
      setCvVoorstel(data);
    } catch {
      toast({
        title: "CV analyse mislukt",
        description: "Controleer de internetverbinding.",
        variant: "destructive",
      });
    } finally {
      setCvAnalyseLaden(false);
    }
  }

  function accepteerCvVoorstel() {
    if (!cvVoorstel) return;
    setOnboardForm((prev) => ({
      ...prev,
      ...(cvVoorstel.naam ? { naam: cvVoorstel.naam } : {}),
      ...(cvVoorstel.email ? { email: cvVoorstel.email } : {}),
      ...(cvVoorstel.telefoon ? { telefoon: cvVoorstel.telefoon } : {}),
      ...(cvVoorstel.mobiel ? { mobiel: cvVoorstel.mobiel } : {}),
    }));
    setCvVoorstel(null);
  }

  async function opslaanFunctie() {
    if (!functieForm.naam.trim()) {
      toast({ title: "Naam is verplicht", variant: "destructive" });
      return;
    }
    try {
      if (functieBewerkenId !== null) {
        await wijzigFunctie.mutateAsync({ id: functieBewerkenId, data: { ...functieForm, naam: functieForm.naam.trim() } });
        toast({ title: "Functie bijgewerkt" });
      } else {
        const nieuw = await maakFunctie.mutateAsync({ data: { ...functieForm, naam: functieForm.naam.trim() } });
        if (onboardOpen && nieuw?.id) {
          setOnboardForm((f) => ({ ...f, functie_id: nieuw.id }));
        }
        toast({ title: "Functie toegevoegd" });
      }
      await queryClient.invalidateQueries({ queryKey: getListFunctiesQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetHrmStatsQueryKey() });
      setFunctieForm({ naam: "", werkmaatschappij: WERKMAATSCHAPPIJ_STD, uitvoerend: false });
      setFunctieBewerkenId(null);
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
      if (opleidingBewerkenId !== null) {
        await wijzigOpleiding.mutateAsync({ id: opleidingBewerkenId, data: { ...opleidingForm, naam: opleidingForm.naam.trim() } });
        toast({ title: "Opleiding bijgewerkt" });
      } else {
        await maakOpleiding.mutateAsync({ data: { ...opleidingForm, naam: opleidingForm.naam.trim() } });
        toast({ title: "Opleiding toegevoegd" });
      }
      await queryClient.invalidateQueries({ queryKey: getListOpleidingenQueryKey() });
      setOpleidingForm({ naam: "", categorie: "vakopleiding", soort: "cursus" });
      setOpleidingBewerkenId(null);
      setOpleidingOpen(false);
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  function startFunctieNieuw() {
    setFunctieBewerkenId(null);
    setFunctieForm({ naam: "", werkmaatschappij: WERKMAATSCHAPPIJ_STD, uitvoerend: false, minimale_bezetting: undefined });
    setFunctieOpen(true);
  }

  function startFunctieBewerken(f: Functie) {
    setFunctieBewerkenId(f.id);
    setFunctieForm({
      naam: f.naam,
      werkmaatschappij: f.werkmaatschappij,
      omschrijving: f.omschrijving ?? undefined,
      uitvoerend: f.uitvoerend ?? false,
      minimale_bezetting: f.minimale_bezetting ?? undefined,
    });
    setFunctieOpen(true);
  }

  async function markeerAlsBuitendienst() {
    const functie = (functies ?? []).find((f) => f.id === onboardForm.functie_id);
    if (!functie) return;
    try {
      await wijzigFunctie.mutateAsync({
        id: functie.id,
        data: {
          naam: functie.naam,
          werkmaatschappij: functie.werkmaatschappij,
          omschrijving: functie.omschrijving ?? undefined,
          uitvoerend: true,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListFunctiesQueryKey() });
      toast({
        title: "Functie bijgewerkt",
        description: `${functie.naam} is gemarkeerd als buitendienst en verschijnt nu in de planning.`,
      });
    } catch {
      toast({ title: "Bijwerken mislukt", variant: "destructive" });
    }
  }

  function startOpleidingNieuw() {
    setOpleidingBewerkenId(null);
    setOpleidingForm({ naam: "", categorie: "vakopleiding", soort: "cursus" });
    setOpleidingOpen(true);
  }

  function startOpleidingBewerken(o: Opleiding) {
    setOpleidingBewerkenId(o.id);
    setOpleidingForm({
      naam: o.naam,
      categorie: o.categorie,
      soort: o.soort,
      omschrijving: o.omschrijving ?? null,
      niveau: o.niveau ?? undefined,
      opleider: o.opleider ?? null,
      studieduur: o.studieduur ?? null,
      studiebelasting: o.studiebelasting ?? null,
      lesvorm: o.lesvorm ?? undefined,
      kosten_indicatie: o.kosten_indicatie ?? null,
      kosten_werkgever_pct: o.kosten_werkgever_pct ?? null,
      kosten_werknemer_pct: o.kosten_werknemer_pct ?? null,
      geldigheid_maanden: o.geldigheid_maanden ?? null,
      verplicht: o.verplicht,
      functie_ids: o.functie_ids ?? [],
    });
    setOpleidingOpen(true);
  }

  async function verwijderFunctie(id: number) {
    try {
      await verwijderFunctieMut.mutateAsync({ id });
      await queryClient.invalidateQueries({ queryKey: getListFunctiesQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetHrmStatsQueryKey() });
      toast({ title: "Functie verwijderd" });
      setVerwijderFunctieId(null);
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    }
  }

  async function verwijderOpleiding(id: number) {
    try {
      await verwijderOpleidingMut.mutateAsync({ id });
      await queryClient.invalidateQueries({ queryKey: getListOpleidingenQueryKey() });
      toast({ title: "Opleiding verwijderd" });
      setVerwijderOpleidingId(null);
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    }
  }

  function startWerkgeverNieuw() {
    setWerkgeverEditId(null);
    setWerkgeverForm({ naam: "", cao: "", personeelsbeleid: null, adres: null, postcode: null, plaats: null, kvk: null, btw: null, telefoon: null, email: null, website: null, voettekst: null, actief: true });
    setWerkgeverOpen(true);
  }

  function startWerkgeverBewerken(w: Werkgever) {
    setWerkgeverEditId(w.id);
    setWerkgeverForm({
      naam: w.naam,
      cao: w.cao,
      personeelsbeleid: w.personeelsbeleid ?? null,
      adres: w.adres ?? null,
      postcode: w.postcode ?? null,
      plaats: w.plaats ?? null,
      kvk: w.kvk ?? null,
      btw: w.btw ?? null,
      telefoon: w.telefoon ?? null,
      email: w.email ?? null,
      website: w.website ?? null,
      voettekst: w.voettekst ?? null,
      actief: w.actief,
    });
    setWerkgeverOpen(true);
  }

  async function opslaanWerkgever() {
    if (!werkgeverForm.naam.trim()) {
      toast({ title: "Naam is verplicht", variant: "destructive" });
      return;
    }
    if (!werkgeverForm.cao) {
      toast({ title: "CAO is verplicht", variant: "destructive" });
      return;
    }
    const data: WerkgeverInput = { ...werkgeverForm, naam: werkgeverForm.naam.trim() };
    try {
      if (werkgeverEditId != null) {
        await wijzigWerkgever.mutateAsync({ id: werkgeverEditId, data });
      } else {
        await maakWerkgever.mutateAsync({ data });
      }
      await queryClient.invalidateQueries({ queryKey: getListWerkgeversQueryKey() });
      toast({ title: werkgeverEditId != null ? "Werkgever bijgewerkt" : "Werkgever toegevoegd" });
      setWerkgeverOpen(false);
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  async function haalVoorstellen() {
    const id = Number(voorstelFunctieId);
    if (!id) {
      toast({ title: "Kies eerst een functie", variant: "destructive" });
      return;
    }
    try {
      const res = await voorstelMutatie.mutateAsync({ id });
      setVoorstellen(res.voorstellen);
      setVoorstelToelichting(res.toelichting ?? null);
      setVoorstelBetrouwbaarheid(res.betrouwbaarheid ?? null);
      setGekozenVoorstellen(new Set(res.voorstellen.map((_, i) => i)));
      setVoorstelGedaan(true);
      if (res.voorstellen.length === 0) {
        toast({ title: "Geen voorstellen", description: res.toelichting ?? "Probeer het later opnieuw." });
      }
    } catch {
      toast({ title: "AI-voorstel mislukt", variant: "destructive" });
    }
  }

  function toggleVoorstel(i: number) {
    setGekozenVoorstellen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function accepteerVoorstellen() {
    const id = Number(voorstelFunctieId);
    const gekozen = voorstellen.filter((_, i) => gekozenVoorstellen.has(i));
    if (gekozen.length === 0) {
      toast({ title: "Selecteer minstens één voorstel", variant: "destructive" });
      return;
    }
    const bestaandeOpNaam = new Map(
      (opleidingen ?? []).map((o) => [o.naam.trim().toLowerCase(), o] as const),
    );
    try {
      let toegevoegd = 0;
      let gekoppeld = 0;
      let overgeslagen = 0;
      for (const v of gekozen) {
        const bestaand = bestaandeOpNaam.get(v.naam.trim().toLowerCase());
        if (bestaand) {
          const huidigeFunctieIds = bestaand.functie_ids ?? [];
          if (id && !huidigeFunctieIds.includes(id)) {
            await wijzigOpleiding.mutateAsync({
              id: bestaand.id,
              data: { naam: bestaand.naam, functie_ids: [...huidigeFunctieIds, id] },
            });
            gekoppeld++;
          } else {
            overgeslagen++;
          }
          continue;
        }
        await maakOpleiding.mutateAsync({
          data: {
            naam: v.naam.trim(),
            categorie: v.categorie ?? "overig",
            soort: v.soort,
            omschrijving: v.omschrijving ?? null,
            niveau: v.niveau ?? null,
            opleider: v.opleider ?? null,
            studieduur: v.studieduur ?? null,
            studiebelasting: v.studiebelasting ?? null,
            lesvorm: v.lesvorm ?? null,
            kosten_indicatie: v.kosten_indicatie ?? null,
            kosten_werkgever_pct: v.kosten_werkgever_pct ?? null,
            kosten_werknemer_pct: v.kosten_werknemer_pct ?? null,
            geldigheid_maanden: v.geldigheid_maanden ?? null,
            verplicht: v.verplicht ?? false,
            functie_ids: id ? [id] : [],
          },
        });
        toegevoegd++;
      }
      await queryClient.invalidateQueries({ queryKey: getListOpleidingenQueryKey() });
      const delen = [
        `${toegevoegd} opgeslagen`,
        gekoppeld ? `${gekoppeld} gekoppeld aan bestaande opleiding` : null,
        overgeslagen ? `${overgeslagen} overgeslagen (bestaat al)` : null,
      ].filter(Boolean);
      toast({ title: delen.join(", ") });
      setVoorstellen([]);
      setVoorstelGedaan(false);
      setGekozenVoorstellen(new Set());
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
      <PaginaHulp pagina="personeel" />
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
          <TabsTrigger value="statistieken">Statistieken</TabsTrigger>
          <TabsTrigger value="medewerkers">Medewerkers</TabsTrigger>
          <TabsTrigger value="werkgevers">Werkgevers</TabsTrigger>
          <TabsTrigger value="functies">Functiehuis</TabsTrigger>
          <TabsTrigger value="opleidingen">Opleidingen</TabsTrigger>
          <TabsTrigger value="bekwaamheden">Bekwaamheden</TabsTrigger>
          <TabsTrigger value="verlof">Verlof</TabsTrigger>
          <TabsTrigger value="ziekmeldingen">Ziekmeldingen</TabsTrigger>
        </TabsList>

        <TabsContent value="statistieken" className="mt-4">
          <Suspense fallback={<div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Laden...</div>}>
            <HrmWidgets />
          </Suspense>
        </TabsContent>

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
            <div className="space-y-4">
              <DemoBanner />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {demoMedewerkers.map((m) => (
                  <Card key={m.id} className="opacity-80">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold truncate">{m.naam}</div>
                        <Badge variant="outline" className="border-emerald-200 text-emerald-700">actief</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <div>{m.functie}</div>
                        <div>{m.afdeling}</div>
                        {m.email && <div>{m.email}</div>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
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
                        {m.actief && magSchrijven ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs text-destructive/60 hover:text-destructive hover:bg-destructive/10 px-2 ml-auto"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setOffboardMedId(m.id);
                              setOffboardOpen(true);
                            }}
                          >
                            <LogOut className="h-3 w-3 mr-1" />
                            Offboarden
                          </Button>
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="werkgevers" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Werkgevers (werkmaatschappijen) binnen de FPS Groep. Medewerkers, functies en
              verlofsoorten worden aan een werkgever gekoppeld.
            </p>
            {magSchrijven && (
              <Button onClick={startWerkgeverNieuw}><Plus className="h-4 w-4" /> Nieuwe werkgever</Button>
            )}
          </div>
          {(werkgevers ?? []).length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Nog geen werkgevers.</p>
            </CardContent></Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(werkgevers ?? []).map((w) => (
                <Card key={w.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{w.naam}</div>
                        {w.cao && <div className="text-xs text-muted-foreground">CAO: {w.cao}</div>}
                      </div>
                      <Badge variant={w.actief ? "outline" : "secondary"} className={w.actief ? "border-emerald-200 text-emerald-700" : ""}>
                        {w.actief ? "actief" : "inactief"}
                      </Badge>
                    </div>
                    {w.personeelsbeleid && (
                      <p className="text-xs text-muted-foreground line-clamp-3">{w.personeelsbeleid}</p>
                    )}
                    {magSchrijven && (
                      <div className="flex justify-end pt-1">
                        <Button size="sm" variant="outline" onClick={() => startWerkgeverBewerken(w)}>
                          <Pencil className="h-4 w-4" /> Bewerken
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="functies" className="space-y-4">
          <div className="flex items-center justify-end">
            {magSchrijven && (
              <Button onClick={startFunctieNieuw}><Plus className="h-4 w-4" /> Nieuwe functie</Button>
            )}
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
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold">{f.naam}</div>
                      <div className="flex items-center gap-1 shrink-0">
                        {f.uitvoerend && (
                          <Badge variant="outline" className="text-xs border-primary/30 text-primary bg-primary/5">
                            Uitvoerend
                          </Badge>
                        )}
                        {magSchrijven && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => startFunctieBewerken(f)}
                              title="Bewerken"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => setVerwijderFunctieId(f.id)}
                              title="Verwijderen"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
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
            {magSchrijven && (
              <Button onClick={startOpleidingNieuw}><Plus className="h-4 w-4" /> Nieuwe opleiding</Button>
            )}
          </div>

          {magSchrijven && (
            <Card className="border-amber-200 bg-amber-50/40">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-amber-700" />
                  <h2 className="text-sm font-semibold">AI stelt opleidingen en cursussen voor</h2>
                </div>
                <p className="text-xs text-muted-foreground">
                  Kies een functie; de AI stelt passende opleidingen en cursussen voor. Niets wordt automatisch opgeslagen — u kiest zelf welke voorstellen u toevoegt.
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1.5 min-w-56">
                    <Label>Functie</Label>
                    {(functies ?? []).length === 0 ? (
                      <div className="flex items-center gap-2">
                        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                          Nog geen functies in het functiehuis.
                        </p>
                        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={startFunctieNieuw}>
                          <Plus className="h-3 w-3" /> Nieuwe functie
                        </Button>
                      </div>
                    ) : (
                      <Select value={voorstelFunctieId} onValueChange={setVoorstelFunctieId}>
                        <SelectTrigger><SelectValue placeholder="Kies een functie" /></SelectTrigger>
                        <SelectContent>
                          {(functies ?? []).map((f) => (
                            <SelectItem key={f.id} value={String(f.id)}>{f.naam}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <Button onClick={haalVoorstellen} disabled={voorstelMutatie.isPending || !voorstelFunctieId}>
                    {voorstelMutatie.isPending ? "AI denkt na…" : "Voorstellen ophalen"}
                  </Button>
                </div>

                {voorstelGedaan && (
                  <div className="space-y-3">
                    {voorstelToelichting && (
                      <p className="text-xs text-amber-800">
                        {voorstelToelichting}
                        {voorstelBetrouwbaarheid ? ` · betrouwbaarheid: ${voorstelBetrouwbaarheid}` : ""}
                      </p>
                    )}
                    {voorstellen.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Geen voorstellen ontvangen.</p>
                    ) : (
                      <>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {voorstellen.map((v, i) => (
                            <label
                              key={i}
                              className="flex gap-2 rounded-md border bg-background p-3 text-sm cursor-pointer"
                            >
                              <Checkbox
                                className="mt-0.5"
                                checked={gekozenVoorstellen.has(i)}
                                onCheckedChange={() => toggleVoorstel(i)}
                              />
                              <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-medium">{v.naam}</span>
                                  <Badge variant="secondary">{soortLabel(v.soort)}</Badge>
                                  {v.niveau && <Badge variant="outline">{v.niveau}</Badge>}
                                  {v.verplicht && <Badge variant="outline" className="border-amber-200 text-amber-700">verplicht</Badge>}
                                </div>
                                {v.omschrijving && <p className="text-xs text-muted-foreground">{v.omschrijving}</p>}
                                <div className="text-xs text-muted-foreground space-y-0.5">
                                  {v.opleider && <div>Opleider: {v.opleider}</div>}
                                  {(v.studieduur || v.studiebelasting) && (
                                    <div>{[v.studieduur, v.studiebelasting].filter(Boolean).join(" · ")}</div>
                                  )}
                                  {v.lesvorm && <div>Lesvorm: {v.lesvorm}</div>}
                                  {v.kosten_indicatie && <div>Kosten: {v.kosten_indicatie}</div>}
                                  {kostenLabel(v.kosten_werkgever_pct, v.kosten_werknemer_pct) && (
                                    <div>{kostenLabel(v.kosten_werkgever_pct, v.kosten_werknemer_pct)}</div>
                                  )}
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button onClick={accepteerVoorstellen} disabled={maakOpleiding.isPending || gekozenVoorstellen.size === 0}>
                            {maakOpleiding.isPending ? "Bezig…" : `${gekozenVoorstellen.size} toevoegen aan catalogus`}
                          </Button>
                          <Button variant="outline" onClick={() => { setVoorstellen([]); setVoorstelGedaan(false); setGekozenVoorstellen(new Set()); }}>
                            Annuleren
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

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
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold">{o.naam}</div>
                      <div className="flex items-center gap-1 shrink-0">
                        {o.verplicht && <Badge variant="outline" className="border-amber-200 text-amber-700 text-xs">verplicht</Badge>}
                        {magSchrijven && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => startOpleidingBewerken(o)}
                              title="Bewerken"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => setVerwijderOpleidingId(o.id)}
                              title="Verwijderen"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary">{soortLabel(o.soort)}</Badge>
                      {o.niveau && <Badge variant="outline">{o.niveau}</Badge>}
                      <span className="text-xs text-muted-foreground">{o.categorie}</span>
                    </div>
                    {o.opleider && <div className="text-xs text-muted-foreground">Opleider: {o.opleider}</div>}
                    {(o.studieduur || o.studiebelasting) && (
                      <div className="text-xs text-muted-foreground">{[o.studieduur, o.studiebelasting].filter(Boolean).join(" · ")}</div>
                    )}
                    {o.lesvorm && <div className="text-xs text-muted-foreground">Lesvorm: {o.lesvorm}</div>}
                    {kostenLabel(o.kosten_werkgever_pct, o.kosten_werknemer_pct) && (
                      <div className="text-xs text-muted-foreground">{kostenLabel(o.kosten_werkgever_pct, o.kosten_werknemer_pct)}</div>
                    )}
                    {o.geldigheid_maanden != null && (
                      <div className="text-xs text-muted-foreground">Geldig {o.geldigheid_maanden} mnd</div>
                    )}
                    {(o.functie_namen ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {(o.functie_namen ?? []).map((n, i) => (
                          <Badge key={i} variant="outline" className="font-normal">{n}</Badge>
                        ))}
                      </div>
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

        {/* ── Ziekmeldingen ── */}
        <TabsContent value="ziekmeldingen" className="space-y-4">
          {magSchrijven && (
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => {
                  setZiekForm({ medewerker_id: 0, start_datum: new Date().toISOString().slice(0, 10) });
                  setZiekOpen(true);
                }}
              >
                <HeartPulse className="h-4 w-4 mr-1" /> Ziekmelding registreren
              </Button>
            </div>
          )}

          {/* Actief ziek */}
          {(() => {
            const actief = (ziekmeldingen ?? []).filter(
              (z) => z.status !== "hersteld" && (!z.eind_datum || z.eind_datum >= new Date().toISOString().slice(0, 10)),
            );
            return (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <HeartPulse className="h-4 w-4 text-red-500" />
                  <h2 className="text-sm font-semibold">Momenteel ziek</h2>
                  {actief.length > 0 && <Badge variant="secondary" className="bg-red-100 text-red-700">{actief.length}</Badge>}
                </div>
                {actief.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Geen medewerkers momenteel ziek gemeld.</p>
                ) : (
                  <div className="space-y-2">
                    {actief.map((z) => (
                      <Card key={z.id}>
                        <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="font-medium">
                              {z.medewerker_naam ?? `Medewerker #${z.medewerker_id}`}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Ziek sinds {fmtDatum(z.start_datum)}
                              {z.reden ? ` · ${z.reden}` : ""}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge
                              variant="outline"
                              className={
                                z.status === "langdurig"
                                  ? "bg-red-100 text-red-700 border-red-200"
                                  : "bg-orange-100 text-orange-700 border-orange-200"
                              }
                            >
                              {z.status === "langdurig" ? "Langdurig" : "Gemeld"}
                            </Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs gap-1.5"
                              onClick={() => setPoortwachterZiekmeldingId(z.id)}
                            >
                              Poortwachter
                            </Button>
                            {magSchrijven && (
                              <>
                                {z.status !== "langdurig" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => markeerStatus(z.id, "langdurig")}
                                  >
                                    Langdurig
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => markeerStatus(z.id, "hersteld")}
                                >
                                  <Check className="h-4 w-4 mr-1" /> Hersteld
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => setVerwijderZiekId(z.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Historisch */}
          {(() => {
            const hist = (ziekmeldingen ?? []).filter(
              (z) => z.status === "hersteld" || (z.eind_datum && z.eind_datum < new Date().toISOString().slice(0, 10)),
            );
            if (hist.length === 0) return null;
            return (
              <div>
                <h2 className="text-sm font-semibold mb-2 text-muted-foreground">Eerder hersteld</h2>
                <div className="space-y-2">
                  {hist.slice(0, 10).map((z) => (
                    <Card key={z.id} className="opacity-70">
                      <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="font-medium text-sm">{z.medewerker_naam ?? `Medewerker #${z.medewerker_id}`}</div>
                          <div className="text-xs text-muted-foreground">
                            {fmtDatum(z.start_datum)} – {fmtDatum(z.eind_datum)}
                            {z.reden ? ` · ${z.reden}` : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 text-xs">Hersteld</Badge>
                          {magSchrijven && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setVerwijderZiekId(z.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })()}
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
              <Select
                value={medewerkerForm.werkmaatschappij || undefined}
                onValueChange={(v) => setMedewerkerForm({ ...medewerkerForm, werkmaatschappij: v })}
              >
                <SelectTrigger><SelectValue placeholder="Kies werkmaatschappij" /></SelectTrigger>
                <SelectContent>
                  {WERKMAATSCHAPPIJEN.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Functie</Label>
                <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 text-xs px-1.5" onClick={startFunctieNieuw}>
                  <Plus className="h-3 w-3" /> Nieuwe functie
                </Button>
              </div>
              {(functies ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground border rounded-md px-3 py-2">
                  Nog geen functies in het functiehuis. Klik op "Nieuwe functie" om er een toe te voegen.
                </p>
              ) : (
                <Select
                  value={medewerkerForm.functie_id ? String(medewerkerForm.functie_id) : undefined}
                  onValueChange={(v) => setMedewerkerForm({ ...medewerkerForm, functie_id: Number(v) })}
                >
                  <SelectTrigger><SelectValue placeholder="Kies functie" /></SelectTrigger>
                  <SelectContent>
                    {(functies ?? []).some((f) => f.uitvoerend) && (
                      <SelectGroup>
                        <SelectLabel className="text-xs font-semibold text-primary">Buitendienst — zichtbaar in planning</SelectLabel>
                        {(functies ?? []).filter((f) => f.uitvoerend).map((f) => (
                          <SelectItem key={f.id} value={String(f.id)}>{f.naam}</SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {(functies ?? []).some((f) => !f.uitvoerend) && (
                      <SelectGroup>
                        <SelectLabel className="text-xs font-semibold text-muted-foreground">Kantoor / staf — niet in planning</SelectLabel>
                        {(functies ?? []).filter((f) => !f.uitvoerend).map((f) => (
                          <SelectItem key={f.id} value={String(f.id)}>{f.naam}</SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Leidinggevende</Label>
              <Select
                value={medewerkerForm.leidinggevende_id ? String(medewerkerForm.leidinggevende_id) : "geen"}
                onValueChange={(v) => setMedewerkerForm({ ...medewerkerForm, leidinggevende_id: v === "geen" ? undefined : Number(v) })}
              >
                <SelectTrigger><SelectValue placeholder="Geen (hoofdbeheerder behandelt verlof)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="geen">Geen — hoofdbeheerder behandelt verlof</SelectItem>
                  {(medewerkers ?? []).map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.naam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                De leidinggevende beoordeelt verlofaanvragen van deze medewerker; de hoofdbeheerder kan altijd behandelen.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Dienstverband</Label>
              <Select value={medewerkerForm.dienstverband} onValueChange={(v) => setMedewerkerForm({ ...medewerkerForm, dienstverband: v, bedrijf_uitzendbureau: (v === "uitzend" || v === "inhuur" || v === "zzp") ? (medewerkerForm.bedrijf_uitzendbureau ?? "") : undefined })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DIENSTVERBANDEN.map((d) => <SelectItem key={d} value={d}>{DIENSTVERBAND_LABELS[d] ?? d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {(medewerkerForm.dienstverband === "uitzend" || medewerkerForm.dienstverband === "inhuur" || medewerkerForm.dienstverband === "zzp") && (
              <div className="space-y-1.5">
                <Label>
                  {medewerkerForm.dienstverband === "uitzend" ? "Naam uitzendbureau" : medewerkerForm.dienstverband === "zzp" ? "Bedrijfsnaam ZZP" : "Naam bedrijf / onderaannemer"}
                </Label>
                <input
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={medewerkerForm.bedrijf_uitzendbureau ?? ""}
                  onChange={(e) => setMedewerkerForm({ ...medewerkerForm, bedrijf_uitzendbureau: e.target.value || undefined })}
                  placeholder={medewerkerForm.dienstverband === "uitzend" ? "bijv. Randstad" : medewerkerForm.dienstverband === "zzp" ? "bijv. Jansen Installatietechniek" : "Naam van het bedrijf"}
                />
              </div>
            )}
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
              <DatePicker value={medewerkerForm.in_dienst_sinds ?? ""} onChange={(v) => setMedewerkerForm({ ...medewerkerForm, in_dienst_sinds: v })} />
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

          {/* CV upload — AI vult velden in */}
          <div className="rounded-lg border border-dashed p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium flex items-center gap-1.5">
                <Upload className="h-4 w-4 text-muted-foreground" />
                CV uploaden (AI vult velden in)
              </div>
              {cvVoorstel && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setCvVoorstel(null)}
                >
                  <X className="h-3 w-3" /> Sluiten
                </Button>
              )}
            </div>
            {cvVoorstel ? (
              <div className="rounded-md bg-amber-50 border border-amber-200 p-2 space-y-2">
                <div className="text-xs font-semibold text-amber-800 flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI heeft de volgende velden herkend:
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  {cvVoorstel.naam && (
                    <div><span className="text-muted-foreground">Naam:</span> {cvVoorstel.naam}</div>
                  )}
                  {cvVoorstel.email && (
                    <div><span className="text-muted-foreground">E-mail:</span> {cvVoorstel.email}</div>
                  )}
                  {cvVoorstel.telefoon && (
                    <div><span className="text-muted-foreground">Telefoon:</span> {cvVoorstel.telefoon}</div>
                  )}
                  {cvVoorstel.mobiel && (
                    <div><span className="text-muted-foreground">Mobiel:</span> {cvVoorstel.mobiel}</div>
                  )}
                  {cvVoorstel.vca_vervaldatum && (
                    <div><span className="text-muted-foreground">VCA vervalt:</span> {cvVoorstel.vca_vervaldatum}</div>
                  )}
                  {cvVoorstel.rijbewijs && (
                    <div><span className="text-muted-foreground">Rijbewijs:</span> {cvVoorstel.rijbewijs}</div>
                  )}
                </div>
                {cvVoorstel.ai_toelichting && (
                  <p className="text-xs text-amber-700 italic">{cvVoorstel.ai_toelichting}</p>
                )}
                <Button
                  size="sm"
                  className="w-full h-7 text-xs"
                  onClick={accepteerCvVoorstel}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Voorstel toepassen op formulier
                </Button>
              </div>
            ) : cvAnalyseLaden ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                CV wordt geanalyseerd door AI...
              </div>
            ) : (
              <label className="cursor-pointer block">
                <input
                  type="file"
                  accept=".pdf,.txt"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadCv(f);
                    e.target.value = "";
                  }}
                />
                <span className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  PDF-bestand selecteren — AI herkent naam, e-mail, telefoon, VCA-vervaldatum, rijbewijs en meer
                </span>
              </label>
            )}
          </div>

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
                  onClick={startFunctieNieuw}
                >
                  <Plus className="h-3 w-3" /> Nieuwe functie
                </Button>
              </div>
              {(functies ?? []).length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                  Nog geen functies in het functiehuis. Maak er eerst een aan met "Nieuwe functie".
                </p>
              ) : (
                <>
                  <Select
                    value={onboardForm.functie_id ? String(onboardForm.functie_id) : undefined}
                    onValueChange={(v) => setOnboardForm({ ...onboardForm, functie_id: Number(v) })}
                  >
                    <SelectTrigger><SelectValue placeholder="Kies functie" /></SelectTrigger>
                    <SelectContent>
                      {(functies ?? []).some((f) => f.uitvoerend) && (
                        <SelectGroup>
                          <SelectLabel className="text-xs font-semibold text-primary">
                            Buitendienst — zichtbaar in planning
                          </SelectLabel>
                          {(functies ?? []).filter((f) => f.uitvoerend).map((f) => (
                            <SelectItem key={f.id} value={String(f.id)}>{f.naam}</SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {(functies ?? []).some((f) => !f.uitvoerend) && (
                        <SelectGroup>
                          <SelectLabel className="text-xs font-semibold text-muted-foreground">
                            Kantoor / staf — niet in planning
                          </SelectLabel>
                          {(functies ?? []).filter((f) => !f.uitvoerend).map((f) => (
                            <SelectItem key={f.id} value={String(f.id)}>{f.naam}</SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </SelectContent>
                  </Select>
                  {onboardForm.functie_id ? (
                    (functies ?? []).find((f) => f.id === onboardForm.functie_id)?.uitvoerend ? (
                      <p className="flex items-center gap-1.5 text-xs text-primary font-medium mt-1">
                        <span className="inline-block h-2 w-2 rounded-full bg-primary" />
                        Zichtbaar in de planning (buitendienst)
                      </p>
                    ) : ["zzp", "uitzend", "inhuur"].includes(onboardForm.dienstverband ?? "") ? (
                      <div className="mt-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        <p className="flex items-center gap-1.5 font-medium">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          Functie staat niet als buitendienst geregistreerd
                        </p>
                        <p className="mt-0.5 text-amber-800">
                          ZZP / uitzend / inhuur medewerkers voeren doorgaans veldwerk uit. Klik hieronder om de functie als uitvoerend te markeren zodat deze medewerker in de planning verschijnt.
                        </p>
                        <button
                          type="button"
                          className="mt-1.5 font-medium underline underline-offset-2 hover:text-amber-950 disabled:opacity-50"
                          disabled={wijzigFunctie.isPending}
                          onClick={markeerAlsBuitendienst}
                        >
                          {wijzigFunctie.isPending ? "Bezig…" : "Markeer als buitendienst"}
                        </button>
                      </div>
                    ) : (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                        <span className="inline-block h-2 w-2 rounded-full bg-slate-300" />
                        Niet zichtbaar in de planning (kantoor/staf)
                      </p>
                    )
                  ) : null}
                </>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Werkmaatschappij *</Label>
              <Select
                value={onboardForm.werkmaatschappij || undefined}
                onValueChange={(v) =>
                  setOnboardForm({
                    ...onboardForm,
                    werkmaatschappij: v,
                    cao: caoVoorWerkmaatschappij(v) ?? onboardForm.cao,
                  })
                }
              >
                <SelectTrigger><SelectValue placeholder="Kies werkmaatschappij" /></SelectTrigger>
                <SelectContent>
                  {WERKMAATSCHAPPIJEN.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                </SelectContent>
              </Select>
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
              <DatePicker value={onboardForm.in_dienst_sinds} onChange={(v) => setOnboardForm({ ...onboardForm, in_dienst_sinds: v })} />
            </div>
            <div className="space-y-1.5">
              <Label>Dienstverband</Label>
              <Select
                value={onboardForm.dienstverband ?? "vast"}
                onValueChange={(v) => setOnboardForm({ ...onboardForm, dienstverband: v, bedrijf_uitzendbureau: (v === "uitzend" || v === "inhuur" || v === "zzp") ? (onboardForm.bedrijf_uitzendbureau ?? "") : undefined })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DIENSTVERBANDEN.map((d) => <SelectItem key={d} value={d}>{DIENSTVERBAND_LABELS[d] ?? d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {(onboardForm.dienstverband === "uitzend" || onboardForm.dienstverband === "inhuur" || onboardForm.dienstverband === "zzp") && (
              <div className="sm:col-span-2 space-y-1.5">
                <Label>
                  {onboardForm.dienstverband === "uitzend" ? "Naam uitzendbureau" : onboardForm.dienstverband === "zzp" ? "Bedrijfsnaam ZZP" : "Naam bedrijf / onderaannemer"}
                </Label>
                <Input
                  value={onboardForm.bedrijf_uitzendbureau ?? ""}
                  onChange={(e) => setOnboardForm({ ...onboardForm, bedrijf_uitzendbureau: e.target.value || undefined })}
                  placeholder={onboardForm.dienstverband === "uitzend" ? "bijv. Randstad" : onboardForm.dienstverband === "zzp" ? "bijv. Jansen Installatietechniek" : "Naam van het bedrijf"}
                />
              </div>
            )}
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

      {/* Functie aanmaken / bewerken */}
      <Dialog open={functieOpen} onOpenChange={(open) => { if (!open) setFunctieBewerkenId(null); setFunctieOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{functieBewerkenId !== null ? "Functie bewerken" : "Nieuwe functie"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Naam *</Label>
              <Input value={functieForm.naam} onChange={(e) => setFunctieForm({ ...functieForm, naam: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Werkmaatschappij</Label>
              <Select
                value={functieForm.werkmaatschappij || undefined}
                onValueChange={(v) => setFunctieForm({ ...functieForm, werkmaatschappij: v })}
              >
                <SelectTrigger><SelectValue placeholder="Kies werkmaatschappij" /></SelectTrigger>
                <SelectContent>
                  {WERKMAATSCHAPPIJEN.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Omschrijving</Label>
              <Textarea value={functieForm.omschrijving ?? ""} onChange={(e) => setFunctieForm({ ...functieForm, omschrijving: e.target.value })} />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="functie-uitvoerend"
                checked={functieForm.uitvoerend ?? false}
                onCheckedChange={(v) => setFunctieForm({ ...functieForm, uitvoerend: Boolean(v) })}
              />
              <Label htmlFor="functie-uitvoerend" className="cursor-pointer font-normal">
                Uitvoerende functie (monteur, timmerman, voorman, leerling)
              </Label>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              Medewerkers met een uitvoerende functie verschijnen automatisch in de planning.
            </p>
            <div className="space-y-1.5">
              <Label>Minimale bezetting</Label>
              <Input
                type="number"
                min={0}
                value={functieForm.minimale_bezetting ?? ""}
                onChange={(e) => setFunctieForm({ ...functieForm, minimale_bezetting: e.target.value === "" ? undefined : Number(e.target.value) })}
                placeholder="Geen minimum"
              />
              <p className="text-xs text-muted-foreground">
                Minimaal aantal medewerkers met deze functie dat gelijktijdig aanwezig moet blijven. Verlof dat hieronder komt, wordt bij goedkeuring geblokkeerd (tenzij expliciet overschreven).
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFunctieOpen(false)}>Annuleren</Button>
            <Button onClick={opslaanFunctie} disabled={maakFunctie.isPending || wijzigFunctie.isPending}>
              {(maakFunctie.isPending || wijzigFunctie.isPending) ? "Bezig…" : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Opleiding aanmaken / bewerken */}
      <Dialog open={opleidingOpen} onOpenChange={(open) => { if (!open) setOpleidingBewerkenId(null); setOpleidingOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{opleidingBewerkenId !== null ? "Opleiding bewerken" : "Nieuwe opleiding of cursus"}</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label>Naam *</Label>
              <Input value={opleidingForm.naam} onChange={(e) => setOpleidingForm({ ...opleidingForm, naam: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Soort</Label>
                <Select
                  value={opleidingForm.soort ?? "cursus"}
                  onValueChange={(v) => setOpleidingForm({ ...opleidingForm, soort: v as OpleidingInput["soort"] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SOORT_OPTIES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Niveau</Label>
                <Select
                  value={opleidingForm.niveau ?? ""}
                  onValueChange={(v) => setOpleidingForm({ ...opleidingForm, niveau: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Kies niveau" /></SelectTrigger>
                  <SelectContent>
                    {NIVEAU_OPTIES.map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Categorie</Label>
              <Input value={opleidingForm.categorie ?? ""} onChange={(e) => setOpleidingForm({ ...opleidingForm, categorie: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Omschrijving</Label>
              <Textarea
                rows={2}
                value={opleidingForm.omschrijving ?? ""}
                onChange={(e) => setOpleidingForm({ ...opleidingForm, omschrijving: e.target.value || null })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Opleider</Label>
              <Input value={opleidingForm.opleider ?? ""} onChange={(e) => setOpleidingForm({ ...opleidingForm, opleider: e.target.value || null })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Studieduur</Label>
                <Input
                  placeholder="bijv. 3 jaar, 2 dagen"
                  value={opleidingForm.studieduur ?? ""}
                  onChange={(e) => setOpleidingForm({ ...opleidingForm, studieduur: e.target.value || null })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Studiebelasting</Label>
                <Input
                  placeholder="bijv. 16 uur per week"
                  value={opleidingForm.studiebelasting ?? ""}
                  onChange={(e) => setOpleidingForm({ ...opleidingForm, studiebelasting: e.target.value || null })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Lesvorm</Label>
              <Select
                value={opleidingForm.lesvorm ?? ""}
                onValueChange={(v) => setOpleidingForm({ ...opleidingForm, lesvorm: v })}
              >
                <SelectTrigger><SelectValue placeholder="Kies lesvorm" /></SelectTrigger>
                <SelectContent>
                  {LESVORM_OPTIES.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Kostenindicatie</Label>
              <Input
                placeholder="bijv. EUR 1.500"
                value={opleidingForm.kosten_indicatie ?? ""}
                onChange={(e) => setOpleidingForm({ ...opleidingForm, kosten_indicatie: e.target.value || null })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Aandeel werkgever (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={opleidingForm.kosten_werkgever_pct ?? ""}
                  onChange={(e) => {
                    const wg = e.target.value ? Number(e.target.value) : null;
                    setOpleidingForm({
                      ...opleidingForm,
                      kosten_werkgever_pct: wg,
                      kosten_werknemer_pct: wg == null ? null : Math.max(0, 100 - wg),
                    });
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Aandeel werknemer (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={opleidingForm.kosten_werknemer_pct ?? ""}
                  onChange={(e) => {
                    const wn = e.target.value ? Number(e.target.value) : null;
                    setOpleidingForm({
                      ...opleidingForm,
                      kosten_werknemer_pct: wn,
                      kosten_werkgever_pct: wn == null ? null : Math.max(0, 100 - wn),
                    });
                  }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Geldigheid (maanden)</Label>
              <Input
                type="number"
                value={opleidingForm.geldigheid_maanden ?? ""}
                onChange={(e) => setOpleidingForm({ ...opleidingForm, geldigheid_maanden: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Gekoppelde functies</Label>
              <div className="flex flex-wrap gap-2 rounded-md border p-2">
                {(functies ?? []).length === 0 ? (
                  <span className="text-xs text-muted-foreground">Nog geen functies.</span>
                ) : (
                  (functies ?? []).map((f) => {
                    const gekoppeld = (opleidingForm.functie_ids ?? []).includes(f.id);
                    return (
                      <label key={f.id} className="flex items-center gap-1.5 text-sm">
                        <Checkbox
                          checked={gekoppeld}
                          onCheckedChange={(c) => {
                            const huidig = new Set(opleidingForm.functie_ids ?? []);
                            if (c === true) huidig.add(f.id);
                            else huidig.delete(f.id);
                            setOpleidingForm({ ...opleidingForm, functie_ids: [...huidig] });
                          }}
                        />
                        {f.naam}
                      </label>
                    );
                  })
                )}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={opleidingForm.verplicht ?? false}
                onCheckedChange={(c) => setOpleidingForm({ ...opleidingForm, verplicht: c === true })}
              />
              Verplicht voor de functie
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpleidingOpen(false)}>Annuleren</Button>
            <Button onClick={opslaanOpleiding} disabled={maakOpleiding.isPending || wijzigOpleiding.isPending}>
              {(maakOpleiding.isPending || wijzigOpleiding.isPending) ? "Bezig…" : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Werkgever toevoegen / bewerken */}
      <Dialog open={werkgeverOpen} onOpenChange={setWerkgeverOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{werkgeverEditId != null ? "Werkgever bewerken" : "Nieuwe werkgever"}</DialogTitle>
            <DialogDescription>
              Een werkgever is een werkmaatschappij binnen de FPS Groep met een eigen CAO en
              personeelsbeleid.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Naam *</Label>
              <Input value={werkgeverForm.naam} onChange={(e) => setWerkgeverForm({ ...werkgeverForm, naam: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>CAO *</Label>
              <Select
                value={werkgeverForm.cao || undefined}
                onValueChange={(v) => setWerkgeverForm({ ...werkgeverForm, cao: v })}
              >
                <SelectTrigger><SelectValue placeholder="Kies CAO" /></SelectTrigger>
                <SelectContent>
                  {(caoOpties ?? []).map((c) => <SelectItem key={c.naam} value={c.naam}>{c.naam}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Personeelsbeleid</Label>
              <Textarea
                rows={3}
                value={werkgeverForm.personeelsbeleid ?? ""}
                onChange={(e) => setWerkgeverForm({ ...werkgeverForm, personeelsbeleid: e.target.value || null })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>Adres (straat + huisnummer)</Label>
                <Input value={werkgeverForm.adres ?? ""} onChange={(e) => setWerkgeverForm({ ...werkgeverForm, adres: e.target.value || null })} />
              </div>
              <div className="space-y-1.5">
                <Label>Postcode</Label>
                <Input value={werkgeverForm.postcode ?? ""} onChange={(e) => setWerkgeverForm({ ...werkgeverForm, postcode: e.target.value || null })} placeholder="1234 AB" />
              </div>
              <div className="space-y-1.5">
                <Label>Plaats</Label>
                <Input value={werkgeverForm.plaats ?? ""} onChange={(e) => setWerkgeverForm({ ...werkgeverForm, plaats: e.target.value || null })} placeholder="Enschede" />
              </div>
              <div className="space-y-1.5">
                <Label>KVK-nummer</Label>
                <Input value={werkgeverForm.kvk ?? ""} onChange={(e) => setWerkgeverForm({ ...werkgeverForm, kvk: e.target.value || null })} />
              </div>
              <div className="space-y-1.5">
                <Label>BTW-nummer</Label>
                <Input value={werkgeverForm.btw ?? ""} onChange={(e) => setWerkgeverForm({ ...werkgeverForm, btw: e.target.value || null })} />
              </div>
              <div className="space-y-1.5">
                <Label>Telefoon</Label>
                <Input value={werkgeverForm.telefoon ?? ""} onChange={(e) => setWerkgeverForm({ ...werkgeverForm, telefoon: e.target.value || null })} />
              </div>
              <div className="space-y-1.5">
                <Label>E-mailadres</Label>
                <Input value={werkgeverForm.email ?? ""} onChange={(e) => setWerkgeverForm({ ...werkgeverForm, email: e.target.value || null })} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Website</Label>
                <Input value={werkgeverForm.website ?? ""} onChange={(e) => setWerkgeverForm({ ...werkgeverForm, website: e.target.value || null })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Voettekst</Label>
              <Textarea
                rows={2}
                value={werkgeverForm.voettekst ?? ""}
                onChange={(e) => setWerkgeverForm({ ...werkgeverForm, voettekst: e.target.value || null })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={werkgeverForm.actief ?? true}
                onCheckedChange={(c) => setWerkgeverForm({ ...werkgeverForm, actief: c === true })}
              />
              Actief
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWerkgeverOpen(false)}>Annuleren</Button>
            <Button onClick={opslaanWerkgever} disabled={maakWerkgever.isPending || wijzigWerkgever.isPending}>
              {maakWerkgever.isPending || wijzigWerkgever.isPending ? "Bezig…" : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Functie verwijderen */}
      <Dialog open={verwijderFunctieId !== null} onOpenChange={(open) => { if (!open) setVerwijderFunctieId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Functie verwijderen</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Weet je zeker dat je deze functie wilt verwijderen? Medewerkers die aan deze functie zijn gekoppeld behouden hun koppeling, maar de functie verdwijnt uit het functiehuis.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerwijderFunctieId(null)}>Annuleren</Button>
            <Button
              variant="destructive"
              disabled={verwijderFunctieMut.isPending}
              onClick={() => verwijderFunctieId !== null && verwijderFunctie(verwijderFunctieId)}
            >
              {verwijderFunctieMut.isPending ? "Bezig…" : "Verwijderen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Opleiding verwijderen */}
      <Dialog open={verwijderOpleidingId !== null} onOpenChange={(open) => { if (!open) setVerwijderOpleidingId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Opleiding verwijderen</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Weet je zeker dat je deze opleiding wilt verwijderen? Certificaten van medewerkers die aan deze opleiding zijn gekoppeld blijven bestaan.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerwijderOpleidingId(null)}>Annuleren</Button>
            <Button
              variant="destructive"
              disabled={verwijderOpleidingMut.isPending}
              onClick={() => verwijderOpleidingId !== null && verwijderOpleiding(verwijderOpleidingId)}
            >
              {verwijderOpleidingMut.isPending ? "Bezig…" : "Verwijderen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ziekmelding registreren */}
      <Dialog open={ziekOpen} onOpenChange={setZiekOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Ziekmelding registreren</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Medewerker *</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                value={ziekForm.medewerker_id ?? ""}
                onChange={(e) => setZiekForm({ ...ziekForm, medewerker_id: Number(e.target.value) })}
              >
                <option value="">Kies medewerker…</option>
                {(medewerkers ?? []).map((m) => (
                  <option key={m.id} value={m.id}>{m.naam}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Startdatum *</Label>
                <DatePicker
                  value={ziekForm.start_datum}
                  onChange={(v) => setZiekForm({ ...ziekForm, start_datum: v })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Einddatum (herstel)</Label>
                <DatePicker
                  value={ziekForm.eind_datum ?? ""}
                  onChange={(v) => setZiekForm({ ...ziekForm, eind_datum: v || undefined })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reden</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                value={ziekForm.reden ?? ""}
                onChange={(e) => setZiekForm({ ...ziekForm, reden: e.target.value || undefined })}
              >
                <option value="">Niet opgegeven</option>
                <option value="ziekte">Ziekte</option>
                <option value="letsel">Letsel / arbeidsongeval</option>
                <option value="zwangerschap">Zwangerschap / bevalling</option>
                <option value="burn-out">Burn-out / overspanning</option>
                <option value="operatie">Operatie / herstel</option>
                <option value="overig">Overig</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Toelichting</Label>
              <Input
                placeholder="Optionele toelichting voor intern gebruik"
                value={ziekForm.omschrijving ?? ""}
                onChange={(e) => setZiekForm({ ...ziekForm, omschrijving: e.target.value || undefined })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setZiekOpen(false)}>Annuleren</Button>
            <Button disabled={maakZiekmelding.isPending} onClick={slaZiekmeldingOp}>
              {maakZiekmelding.isPending ? "Bezig…" : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ziekmelding verwijderen */}
      <PoortwachterSheet
        ziekmeldingId={poortwachterZiekmeldingId}
        onOpenChange={(open) => { if (!open) setPoortwachterZiekmeldingId(null); }}
      />

      <Dialog open={verwijderZiekId !== null} onOpenChange={(o) => !o && setVerwijderZiekId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ziekmelding verwijderen</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Weet je zeker dat je deze ziekmelding wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerwijderZiekId(null)}>Annuleren</Button>
            <Button
              variant="destructive"
              disabled={verwijderZiekmeldingMut.isPending}
              onClick={() => verwijderZiekId !== null && verwijderZiekmelding(verwijderZiekId)}
            >
              {verwijderZiekmeldingMut.isPending ? "Bezig…" : "Verwijderen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Offboarding */}
      <OffboardDialog
        medewerkerId={offboardMedId}
        open={offboardOpen}
        onOpenChange={(o) => {
          setOffboardOpen(o);
          if (!o) setOffboardMedId(null);
        }}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: getListMedewerkersQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetHrmStatsQueryKey() });
        }}
      />
    </div>
  );
}
