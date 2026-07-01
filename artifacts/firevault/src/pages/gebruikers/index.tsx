import { useState, useRef, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  useListGebruikers,
  useCreateGebruiker,
  useUpdateGebruiker,
  useDeleteGebruiker,
  useHerstellenGebruiker,
  useUitnodigingVersturen,
  useUitnodigingOpnieuwVersturen,
  useGebruikerHerkomstToepassen,
  useGebruikerHerkomstBevestigen,
  useGebruikerHerkomstBevestigenBulk,
  useGebruikerHerkomstVerwijderen,
  useGebruikersAanvullen,
  useListProfielen,
  getListGebruikersQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Mail, Phone, Building, Clock, Plus, UserPlus, Pencil, Trash2, Archive,
  RefreshCw, ShieldCheck, Eye, User, Crown, Upload, Palette, SendHorizonal, X,
  Layers, Search, RotateCcw, Check, CheckCheck, Briefcase, Hammer, Wrench, TrendingUp,
  ListChecks, Loader2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useRol } from "@/context/rol-context";
import { useVoorkeur } from "@/hooks/use-voorkeur";
import { PaginaHulp } from "@/components/pagina-hulp";
import { Link } from "wouter";

const ROLLEN = ["hoofdbeheerder", "gebruiker", "klant"] as const;
type Rol = typeof ROLLEN[number];

const FUNCTIETITELS = [
  "Projectleider",
  "Werkvoorbereider",
  "Project-admin",
  "Commercieel",
  "Financieel",
  "HRM-adviseur",
] as const;

type FunctieGroep = {
  naam: string;
  beschrijving: string;
  rol: string;
  presetNaam: string | null;
  icon: React.ElementType;
  kleur: string;
};

const FUNCTIE_GROEPEN: FunctieGroep[] = [
  { naam: "Hoofdbeheerder", beschrijving: "Volledig beheer",          rol: "hoofdbeheerder", presetNaam: null,               icon: Crown,       kleur: "text-amber-600"   },
  { naam: "Projectleider",  beschrijving: "Projectleiding",           rol: "gebruiker",      presetNaam: "Projectleider",    icon: Briefcase,   kleur: "text-blue-600"    },
  { naam: "Werkvoorbereider", beschrijving: "Werkvoorbereiding",      rol: "gebruiker",      presetNaam: "Werkvoorbereider", icon: Briefcase,   kleur: "text-indigo-600"  },
  { naam: "Project-admin",  beschrijving: "Project-administratie",    rol: "gebruiker",      presetNaam: "Project-admin",    icon: Layers,      kleur: "text-violet-600"  },
  { naam: "Uitvoerder",     beschrijving: "Uitvoering op locatie",    rol: "gebruiker",      presetNaam: "Uitvoerder",       icon: Wrench,      kleur: "text-orange-600"  },
  { naam: "Monteur",        beschrijving: "Montage en inspecties",    rol: "gebruiker",      presetNaam: "Monteur",          icon: Hammer,      kleur: "text-orange-700"  },
  { naam: "Timmerman",      beschrijving: "Timmerwerk",               rol: "gebruiker",      presetNaam: "Timmerman",        icon: Hammer,      kleur: "text-amber-700"   },
  { naam: "Controleur",     beschrijving: "Controle-inspecties",      rol: "gebruiker",      presetNaam: "Controleur",       icon: ShieldCheck, kleur: "text-teal-600"    },
  { naam: "Commercieel",    beschrijving: "Commercieel",              rol: "gebruiker",      presetNaam: "Commercieel",      icon: TrendingUp,  kleur: "text-green-600"   },
  { naam: "Financieel",          beschrijving: "Financieel beheer",        rol: "gebruiker",      presetNaam: null,                   icon: TrendingUp,  kleur: "text-emerald-600" },
  { naam: "Externe boekhouder",  beschrijving: "Externe boekhouder",       rol: "gebruiker",      presetNaam: "Externe boekhouder",   icon: TrendingUp,  kleur: "text-emerald-700" },
  { naam: "HRM-adviseur",        beschrijving: "HRM en personeel",         rol: "gebruiker",      presetNaam: null,                   icon: Briefcase,   kleur: "text-pink-600"    },
  { naam: "Klant",          beschrijving: "Rapportages en meldingen", rol: "klant",          presetNaam: null,               icon: User,        kleur: "text-gray-600"    },
];

const GROEP_NAMEN = new Set(FUNCTIE_GROEPEN.map((g) => g.naam));

const MODULES: { id: string; label: string }[] = [
  { id: "gebouwen",      label: "Gebouwen" },
  { id: "voorzieningen", label: "Spots" },
  { id: "inspecties",    label: "Inspecties" },
  { id: "onderhoud",     label: "Onderhoud" },
  { id: "rapportages",   label: "Rapportages" },
  { id: "bibliotheek",   label: "Bibliotheek" },
  { id: "gebruikers",    label: "Gebruikers" },
  { id: "crm",           label: "CRM" },
  { id: "abonnementen",  label: "Abonnementen" },
  { id: "systeem",       label: "Systeembeheer" },
];

const NIVEAUS = [
  { waarde: 0, label: "Geen" },
  { waarde: 1, label: "Lezen" },
  { waarde: 2, label: "Wijzigen" },
  { waarde: 3, label: "Aanmaken" },
  { waarde: 4, label: "Volledig" },
];

function niveauLabel(n: number): string {
  return NIVEAUS.find((x) => x.waarde === n)?.label ?? "";
}

const ROL_CONFIG: Record<Rol, {
  label: string;
  icon: React.ElementType;
  kleur: string;
  badge: string;
  beschrijving: string;
}> = {
  hoofdbeheerder: {
    label: "Hoofdbeheerder",
    icon: Crown,
    kleur: "text-amber-600",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    beschrijving: "Volledig beheer — alle rechten",
  },
  gebruiker: {
    label: "Gebruiker",
    icon: ShieldCheck,
    kleur: "text-primary",
    badge: "bg-primary/10 text-primary border-primary/20",
    beschrijving: "Toegang via bevoegdheden-matrix",
  },
  klant: {
    label: "Klant",
    icon: User,
    kleur: "text-gray-600",
    badge: "bg-gray-100 text-gray-700 border-gray-200",
    beschrijving: "Rapportages & meldingen",
  },
};

const UITNODIGING_STATUS_CONFIG = {
  niet_uitgenodigd: {
    label: "Niet uitgenodigd",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    kaartStyle: { backgroundColor: "#fffbeb", borderColor: "#fcd34d" } as React.CSSProperties,
    balk: "border-l-[4px] border-l-amber-400",
  },
  uitgenodigd: {
    label: "Uitgenodigd",
    badge: "bg-purple-100 text-purple-800 border-purple-200",
    kaartStyle: { backgroundColor: "#faf5ff", borderColor: "#c084fc" } as React.CSSProperties,
    balk: "border-l-[4px] border-l-purple-400",
  },
  geaccepteerd: {
    label: "",
    badge: "",
    kaartStyle: undefined as React.CSSProperties | undefined,
    balk: "",
  },
} as const;

function groepVanGebruiker(g: Gebruiker): string {
  if (g.rol === "hoofdbeheerder") return "Hoofdbeheerder";
  if (g.rol === "klant") return "Klant";
  const ft = g.functietitels ?? [];
  const bekend = ft.find((f) => GROEP_NAMEN.has(f));
  if (bekend) return bekend;
  if (ft.length > 0) return ft[0];
  return "Overig";
}

function bevoegdhedenGelijk(
  a: Record<string, number> | null | undefined,
  b: Record<string, number> | null | undefined,
): boolean {
  const aa = a ?? {};
  const bb = b ?? {};
  const sleutels = new Set([...Object.keys(aa), ...Object.keys(bb)]);
  for (const s of sleutels) {
    if ((aa[s] ?? 0) !== (bb[s] ?? 0)) return false;
  }
  return true;
}

function actieveBevoegdheden(
  bevoegdheden: Record<string, number> | null | undefined,
): { id: string; label: string; niveau: number }[] {
  if (!bevoegdheden) return [];
  return MODULES
    .filter((m) => (bevoegdheden[m.id] ?? 0) > 0)
    .map((m) => ({ id: m.id, label: m.label, niveau: bevoegdheden[m.id] }));
}

function initialen(naam: string) {
  return naam.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join("");
}

function relatiefTijdstip(iso: string | null | undefined): string {
  if (!iso) return "Nooit ingelogd";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 2) return "Zojuist actief";
  if (min < 60) return `${min} minuten geleden`;
  const uur = Math.floor(min / 60);
  if (uur < 24) return `${uur} uur geleden`;
  const dag = Math.floor(uur / 24);
  if (dag < 7) return `${dag} ${dag === 1 ? "dag" : "dagen"} geleden`;
  const week = Math.floor(dag / 7);
  if (week < 5) return `${week} ${week === 1 ? "week" : "weken"} geleden`;
  const maand = Math.floor(dag / 30);
  return `${maand} ${maand === 1 ? "maand" : "maanden"} geleden`;
}

function onlinKleur(iso: string | null | undefined): string {
  if (!iso) return "text-muted-foreground";
  const uur = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (uur < 1) return "text-green-600";
  if (uur < 24) return "text-amber-600";
  return "text-muted-foreground";
}

const leegForm = {
  naam: "", email: "", rol: "gebruiker", functietitels: [] as string[],
  telefoon: "", bedrijf: "", wachtwoord: "", actief: true,
  avatar_url: "", bedrijfslogo_url: "", bedrijfskleuren: "",
  bevoegdheden: {} as Record<string, number>,
  herkomst_profiel_id: null as number | null,
  herkomst_automatisch: false,
  dienstverband: "intern",
  bedrijf_uitzendbureau: "",
};
type GebruikerForm = typeof leegForm;

type Gebruiker = {
  id: number;
  naam: string | null;
  email: string | null;
  rol: string | null;
  functietitels?: string[] | null;
  telefoon: string | null;
  bedrijf: string | null;
  actief: boolean | null;
  gearchiveerd: boolean;
  laatste_online?: string | null;
  avatar_url?: string | null;
  bedrijfslogo_url?: string | null;
  bedrijfskleuren?: string | null;
  bevoegdheden?: Record<string, number> | null;
  herkomst_profiel_id?: number | null;
  dienstverband?: string | null;
  bedrijf_uitzendbureau?: string | null;
  uitnodiging_status?: string | null;
  uitnodiging_verstuurd_op?: string | null;
  uitnodiging_verloopt_op?: string | null;
  uitnodiging_geopend_op?: string | null;
  uitnodiging_opnieuw_verstuurd_op?: string | null;
  uitnodiging_geaccepteerd_op?: string | null;
};

function haalPrimairKleur(bedrijfskleuren: string | null | undefined): string {
  if (!bedrijfskleuren) return "#ff6b35";
  try { return JSON.parse(bedrijfskleuren).primair ?? "#ff6b35"; }
  catch { return "#ff6b35"; }
}

function formatDatum(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

export default function Gebruikers() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { rol: viewerRol } = useRol();
  const isHoofd = viewerRol === "hoofdbeheerder";
  const magVerwijderen = isHoofd;

  const { toast } = useToast();
  const { data: gebruikers, isLoading, refetch, isFetching } = useListGebruikers();
  const { data: profielen } = useListProfielen();
  const profielMap = new Map((profielen ?? []).map((p) => [p.id, p]));
  const maakGebruiker       = useCreateGebruiker();
  const werkBijGebruiker    = useUpdateGebruiker();
  const verwijderGebruiker  = useDeleteGebruiker();
  const herstellenMutatie   = useHerstellenGebruiker();
  const uitnodigingVersturen = useUitnodigingVersturen();
  const uitnodigingOpnieuwVersturen = useUitnodigingOpnieuwVersturen();
  const herkomstToepassen   = useGebruikerHerkomstToepassen();
  const herkomstBevestigen  = useGebruikerHerkomstBevestigen();
  const herkomstBevestigenBulk = useGebruikerHerkomstBevestigenBulk();
  const herkomstVerwijderen = useGebruikerHerkomstVerwijderen();
  const vulModulesAan        = useGebruikersAanvullen();

  const [toevoegenOpen, setToevoegenOpen] = useState(false);
  const [toevoegenStap, setToevoegenStap] = useState<1 | 2>(1);
  const [toevoegenForm, setToevoegenForm] = useState<GebruikerForm>(leegForm);
  const [toevoegenFout, setToevoegenFout] = useState<string | null>(null);

  const [bewerkGebruiker, setBewerkGebruiker] = useState<Gebruiker | null>(null);
  const [bewerkForm, setBewerkForm]           = useState<GebruikerForm>(leegForm);
  const [bewerkFout, setBewerkFout]           = useState<string | null>(null);

  const [verwijderTarget, setVerwijderTarget] = useState<Gebruiker | null>(null);
  const [bekijkGebruiker, setBekijkGebruiker] = useState<Gebruiker | null>(null);

  const [uitnodigingBezig, setUitnodigingBezig] = useState<number | null>(null);
  const [herkomstBezig, setHerkomstBezig]       = useState<number | null>(null);

  const [zoek, setZoek]               = useVoorkeur<string>("gebruikers_zoek", "");
  const [filterGroep, setFilterGroep] = useVoorkeur<string | null>("gebruikers_filter_groep", null);
  const [actieveTab, setActieveTab]   = useState<"gebruikers" | "klanten" | "profielen">("gebruikers");
  const [alleenAuto, setAlleenAuto]         = useState<boolean>(false);
  const [toonGearchiveerd, setToonGearchiveerd] = useState<boolean>(false);
  const [bulkBevestigOpen, setBulkBevestigOpen] = useState<boolean>(false);
  const [bulkResultaat, setBulkResultaat] = useState<string | null>(null);

  const invalideer = () => queryClient.invalidateQueries({ queryKey: getListGebruikersQueryKey() });

  // Migratie: "Klant" is geen interne functiegroep-filter meer. Reset een
  // eventueel eerder bewaarde filterkeuze zodat het interne overzicht niet
  // ten onrechte leeg lijkt.
  useEffect(() => {
    if (filterGroep === "Klant") setFilterGroep(null);
  }, [filterGroep, setFilterGroep]);

  async function pasHerkomstToe(g: Gebruiker) {
    if (g.herkomst_profiel_id == null || herkomstBezig != null) return;
    setHerkomstBezig(g.id);
    try {
      const bijgewerkt = await herkomstToepassen.mutateAsync({ id: g.id });
      invalideer();
      setBekijkGebruiker((huidig) => huidig && huidig.id === g.id ? (bijgewerkt as Gebruiker) : huidig);
    } catch {
    } finally { setHerkomstBezig(null); }
  }

  async function bevestigHerkomst(g: Gebruiker) {
    if (g.herkomst_profiel_id == null || herkomstBezig != null) return;
    setHerkomstBezig(g.id);
    try {
      const bijgewerkt = await herkomstBevestigen.mutateAsync({ id: g.id });
      invalideer();
      setBekijkGebruiker((huidig) => huidig && huidig.id === g.id ? (bijgewerkt as Gebruiker) : huidig);
    } catch {
    } finally { setHerkomstBezig(null); }
  }

  async function verwijderHerkomst(g: Gebruiker) {
    if (g.herkomst_profiel_id == null || herkomstBezig != null) return;
    setHerkomstBezig(g.id);
    try {
      const bijgewerkt = await herkomstVerwijderen.mutateAsync({ id: g.id });
      invalideer();
      setBekijkGebruiker((huidig) => huidig && huidig.id === g.id ? (bijgewerkt as Gebruiker) : huidig);
    } catch {
    } finally { setHerkomstBezig(null); }
  }

  async function bevestigHerkomstBulk(ids: number[]) {
    if (ids.length === 0 || herkomstBevestigenBulk.isPending) return;
    setBulkResultaat(null);
    try {
      const res: any = await herkomstBevestigenBulk.mutateAsync({ data: { ids } });
      await invalideer();
      const aantal = typeof res?.bevestigd === "number" ? res.bevestigd : ids.length;
      setBulkResultaat(
        aantal === 0
          ? "Geen koppelingen bevestigd."
          : `${aantal} ${aantal === 1 ? "koppeling" : "koppelingen"} bevestigd.`,
      );
    } catch {
      setBulkResultaat("Bevestigen mislukt. Probeer het opnieuw.");
    } finally {
      setBulkBevestigOpen(false);
    }
  }

  async function verstuurToevoegen(e: React.FormEvent) {
    e.preventDefault();
    setToevoegenFout(null);
    if (!toevoegenForm.naam.trim() || !toevoegenForm.email.trim()) {
      setToevoegenFout("Naam en e-mailadres zijn verplicht.");
      return;
    }
    try {
      await maakGebruiker.mutateAsync({
        data: {
          naam:             toevoegenForm.naam.trim(),
          email:            toevoegenForm.email.trim(),
          rol:              toevoegenForm.rol as any,
          functietitels:    toevoegenForm.functietitels,
          telefoon:         toevoegenForm.telefoon.trim()    || undefined,
          bedrijf:          toevoegenForm.bedrijf.trim()     || undefined,
          wachtwoord:       toevoegenForm.wachtwoord.trim()  || undefined,
          avatar_url:       toevoegenForm.avatar_url         || undefined,
          bedrijfslogo_url: toevoegenForm.bedrijfslogo_url   || undefined,
          bedrijfskleuren:  toevoegenForm.bedrijfskleuren    || undefined,
          bevoegdheden:     toevoegenForm.bevoegdheden,
          herkomst_profiel_id: toevoegenForm.herkomst_profiel_id,
          dienstverband:    toevoegenForm.dienstverband || undefined,
          bedrijf_uitzendbureau: toevoegenForm.bedrijf_uitzendbureau.trim() || undefined,
        },
      });
      await invalideer();
      setToevoegenOpen(false);
      setToevoegenForm(leegForm);
      setToevoegenStap(1);
    } catch (err: any) {
      setToevoegenFout(err?.response?.data?.error ?? err?.message ?? "Onbekende fout");
    }
  }

  function openBewerken(g: Gebruiker) {
    setBewerkGebruiker(g);
    setBewerkForm({
      naam:             g.naam            ?? "",
      email:            g.email           ?? "",
      rol:              g.rol             ?? "gebruiker",
      functietitels:    g.functietitels   ?? [],
      telefoon:         g.telefoon        ?? "",
      bedrijf:          g.bedrijf         ?? "",
      wachtwoord:       "",
      actief:           g.actief          ?? true,
      avatar_url:       g.avatar_url      ?? "",
      bedrijfslogo_url: g.bedrijfslogo_url ?? "",
      bedrijfskleuren:  g.bedrijfskleuren  ?? "",
      bevoegdheden:     g.bevoegdheden    ?? {},
      herkomst_profiel_id: g.herkomst_profiel_id ?? null,
      herkomst_automatisch: (g as any).herkomst_automatisch === true,
      dienstverband: g.dienstverband ?? "intern",
      bedrijf_uitzendbureau: g.bedrijf_uitzendbureau ?? "",
    });
    setBewerkFout(null);
  }

  async function verstuurBewerken(e: React.FormEvent) {
    e.preventDefault();
    if (!bewerkGebruiker) return;
    setBewerkFout(null);
    if (!bewerkForm.naam.trim() || !bewerkForm.email.trim()) {
      setBewerkFout("Naam en e-mailadres zijn verplicht.");
      return;
    }
    try {
      await werkBijGebruiker.mutateAsync({
        id: bewerkGebruiker.id,
        data: {
          naam:             bewerkForm.naam.trim(),
          email:            bewerkForm.email.trim(),
          rol:              bewerkForm.rol as any,
          functietitels:    bewerkForm.functietitels,
          telefoon:         bewerkForm.telefoon.trim()    || undefined,
          bedrijf:          bewerkForm.bedrijf.trim()     || undefined,
          actief:           bewerkForm.actief,
          avatar_url:       bewerkForm.avatar_url         || undefined,
          bedrijfslogo_url: bewerkForm.bedrijfslogo_url   || undefined,
          bedrijfskleuren:  bewerkForm.bedrijfskleuren    || undefined,
          bevoegdheden:     bewerkForm.bevoegdheden,
          herkomst_profiel_id: bewerkForm.herkomst_profiel_id,
          dienstverband:    bewerkForm.dienstverband || undefined,
          bedrijf_uitzendbureau: bewerkForm.bedrijf_uitzendbureau.trim() || undefined,
        },
      });
      await invalideer();
      setBewerkGebruiker(null);
    } catch (err: any) {
      setBewerkFout(err?.response?.data?.error ?? err?.message ?? "Onbekende fout");
    }
  }

  async function bevestigVerwijderen() {
    if (!verwijderTarget) return;
    await verwijderGebruiker.mutateAsync({ id: verwijderTarget.id });
    await invalideer();
    setVerwijderTarget(null);
  }

  async function herstellenGebruiker(g: Gebruiker) {
    try {
      await herstellenMutatie.mutateAsync({ id: g.id });
      await invalideer();
    } catch { }
  }

  async function stuurUitnodiging(g: Gebruiker) {
    const status = g.uitnodiging_status ?? "niet_uitgenodigd";
    setUitnodigingBezig(g.id);
    try {
      if (status === "uitgenodigd") {
        await uitnodigingOpnieuwVersturen.mutateAsync({ id: g.id });
        toast({ title: "Uitnodiging opnieuw verstuurd", description: `Een herinnering is verzonden naar ${g.email ?? g.naam ?? "de gebruiker"}.` });
      } else {
        await uitnodigingVersturen.mutateAsync({ id: g.id });
        toast({ title: "Uitnodiging verstuurd", description: `${g.naam ?? g.email ?? "De gebruiker"} ontvangt een activatielink per e-mail.` });
      }
      await invalideer();
    } catch (err: unknown) {
      const bericht =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Probeer het later opnieuw.";
      toast({
        title: "Uitnodiging niet verstuurd",
        description: bericht,
        variant: "destructive",
      });
    } finally { setUitnodigingBezig(null); }
  }

  // Interne FPS-gebruikers (staf) vs. klantaccounts. Klanten horen bij de
  // klantomgeving (FPS One) en worden bewust apart getoond, niet tussen het
  // interne gebruikersoverzicht.
  const internBron = useMemo(
    () => ((gebruikers ?? []) as Gebruiker[]).filter(
      (g) => g.rol !== "klant" && (toonGearchiveerd || !g.gearchiveerd),
    ),
    [gebruikers, toonGearchiveerd],
  );
  const klantBron = useMemo(
    () => ((gebruikers ?? []) as Gebruiker[]).filter(
      (g) => g.rol === "klant" && (toonGearchiveerd || !g.gearchiveerd),
    ),
    [gebruikers, toonGearchiveerd],
  );
  const aantalGearchiveerd = useMemo(
    () => ((gebruikers ?? []) as Gebruiker[]).filter((g) => g.gearchiveerd).length,
    [gebruikers],
  );

  const groepCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const g of internBron) {
      const naam = groepVanGebruiker(g);
      counts[naam] = (counts[naam] ?? 0) + 1;
    }
    return counts;
  }, [internBron]);

  const groepGefilterd = useMemo(() => {
    return internBron.filter((g: any) => {
      if (filterGroep && groepVanGebruiker(g as Gebruiker) !== filterGroep) return false;
      if (alleenAuto && !(g.herkomst_profiel_id != null && g.herkomst_automatisch === true)) return false;
      const term = zoek.trim().toLowerCase();
      if (!term) return true;
      return (
        (g.naam ?? "").toLowerCase().includes(term) ||
        (g.email ?? "").toLowerCase().includes(term) ||
        (g.functietitels ?? []).some((f: string) => f.toLowerCase().includes(term))
      );
    }) as Gebruiker[];
  }, [internBron, filterGroep, zoek, alleenAuto]);

  const klantGefilterd = useMemo(() => {
    const term = zoek.trim().toLowerCase();
    return klantBron.filter((g) => {
      if (!term) return true;
      return (
        (g.naam ?? "").toLowerCase().includes(term) ||
        (g.email ?? "").toLowerCase().includes(term) ||
        (g.bedrijf ?? "").toLowerCase().includes(term)
      );
    });
  }, [klantBron, zoek]);

  const totaalGevonden = groepGefilterd.length;

  // Gebruikers binnen de huidige filter met een onbevestigde automatische
  // herkomst-koppeling. De bulkactie bevestigt precies deze set.
  const autoOnbevestigd = useMemo(
    () =>
      groepGefilterd.filter(
        (g: any) => g.herkomst_profiel_id != null && g.herkomst_automatisch === true,
      ) as Gebruiker[],
    [groepGefilterd],
  );
  const autoOnbevestigdTotaal = useMemo(
    () =>
      ((gebruikers ?? []) as any[]).filter(
        (g) => g.herkomst_profiel_id != null && g.herkomst_automatisch === true,
      ).length,
    [gebruikers],
  );

  // Gebruikers waarbij een of meer module-sleutels in de bevoegdheden-matrix
  // ontbreken. De aanvulactie zet die ontbrekende sleutels op niveau 0; de
  // effectieve toegang verandert niet (0 == ontbrekend), maar nieuwe modules
  // staan dan expliciet in elke matrix.
  const gebruikersMetOntbrekend = useMemo(
    () =>
      ((gebruikers ?? []) as any[]).filter((g) => {
        const bev = (g.bevoegdheden as Record<string, number> | null) ?? {};
        return MODULES.some((m) => !(m.id in bev));
      }).length,
    [gebruikers],
  );

  async function vulModulesBijGebruikersAan() {
    try {
      await vulModulesAan.mutateAsync();
      await invalideer();
    } catch {
      // fout wordt via de mutatie-status getoond
    }
  }

  // Gedeelde gebruikerskaart — gebruikt voor zowel interne gebruikers als
  // klantaccounts, zodat beide overzichten identiek werken (bekijken,
  // bewerken, verwijderen, uitnodigen).
  function gebruikerKaart(g: Gebruiker) {
    const status = (g.uitnodiging_status ?? "niet_uitgenodigd") as keyof typeof UITNODIGING_STATUS_CONFIG;
    const statusCfg = UITNODIGING_STATUS_CONFIG[status] ?? UITNODIGING_STATUS_CONFIG.niet_uitgenodigd;
    const groep = groepVanGebruiker(g);
    const groepCfg = FUNCTIE_GROEPEN.find((gr) => gr.naam === groep);
    const GroepIcon = groepCfg?.icon ?? User;
    const profiel = g.herkomst_profiel_id != null ? profielMap.get(g.herkomst_profiel_id) : undefined;
    const afwijkend = profiel ? !bevoegdhedenGelijk(g.bevoegdheden, profiel.bevoegdheden) : false;
    const automatisch = (g as any).herkomst_automatisch === true;

    return (
      <Card
        key={g.id}
        className={`hover:shadow-md transition-shadow ${statusCfg.balk}`}
        style={statusCfg.kaartStyle as any}
      >
        <CardContent className="p-3">
          <div className="flex items-start gap-2.5">
            <Avatar className="h-8 w-8 text-xs border border-border/50 flex-shrink-0 mt-0.5">
              {g.avatar_url && <AvatarImage src={g.avatar_url} alt={g.naam ?? ""} />}
              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                {initialen(g.naam ?? "")}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-1">
                <span className="font-semibold text-sm leading-tight truncate">{g.naam}</span>
                <div className="flex gap-0.5 flex-shrink-0">
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={() => setBekijkGebruiker(g)} title="Bekijken">
                    <Eye className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => openBewerken(g)} title="Bewerken">
                    <Pencil className="h-3 w-3" />
                  </Button>
                  {magVerwijderen && (
                    g.gearchiveerd ? (
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-green-600" onClick={() => herstellenGebruiker(g)} title="Herstellen" disabled={herstellenMutatie.isPending}>
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => setVerwijderTarget(g)} title="Archiveren">
                        <Archive className="h-3 w-3" />
                      </Button>
                    )
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 mt-0.5">
                <GroepIcon className={`h-3 w-3 flex-shrink-0 ${groepCfg?.kleur ?? "text-muted-foreground"}`} />
                <span className={`text-xs font-medium ${groepCfg?.kleur ?? "text-muted-foreground"}`}>{groep}</span>
              </div>

              <div className="space-y-0.5 mt-1">
                {g.email && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Mail className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{g.email}</span>
                  </div>
                )}
                {g.telefoon && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3 flex-shrink-0" />
                    <span>{g.telefoon}</span>
                  </div>
                )}
                <div className={`flex items-center gap-1.5 text-xs ${onlinKleur(g.laatste_online)}`}>
                  <Clock className="h-3 w-3 flex-shrink-0" />
                  <span>{relatiefTijdstip(g.laatste_online)}</span>
                </div>
              </div>

              {profiel && (
                <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
                  <Layers className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{profiel.naam}</span>
                  {afwijkend && (
                    <Badge variant="outline" className="text-xs h-4 px-1 bg-amber-50 text-amber-700 border-amber-200 flex-shrink-0 ml-auto">
                      Aangepast
                    </Badge>
                  )}
                  {automatisch && !afwijkend && (
                    <Badge variant="outline" className="text-xs h-4 px-1 bg-amber-50 text-amber-700 border-amber-200 flex-shrink-0 ml-auto">
                      Auto
                    </Badge>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1 mt-1.5">
                {g.gearchiveerd ? (
                  <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200 h-5 px-1.5">Gearchiveerd</Badge>
                ) : !g.actief && (
                  <Badge variant="outline" className="text-xs bg-gray-100 text-gray-500 border-gray-200 h-5 px-1.5">Inactief</Badge>
                )}
                {status !== "geaccepteerd" && statusCfg.label && (
                  <Badge variant="outline" className={`text-xs h-5 px-1.5 ${statusCfg.badge}`}>{statusCfg.label}</Badge>
                )}
                {status === "uitgenodigd" && g.uitnodiging_verloopt_op &&
                  new Date(g.uitnodiging_verloopt_op).getTime() < Date.now() && (
                    <Badge variant="outline" className="text-xs h-5 px-1.5 bg-red-100 text-red-800 border-red-200">Verlopen</Badge>
                )}
              </div>

              {status !== "geaccepteerd" && (
                <button
                  type="button"
                  className={`mt-2 h-7 text-xs w-full gap-1.5 font-medium rounded-md flex items-center justify-center px-2 transition-colors ${
                    status === "niet_uitgenodigd"
                      ? "bg-amber-500 hover:bg-amber-600 text-white"
                      : "bg-purple-500 hover:bg-purple-600 text-white"
                  } disabled:opacity-60`}
                  disabled={uitnodigingBezig === g.id}
                  onClick={() => stuurUitnodiging(g)}
                >
                  <SendHorizonal className="h-3 w-3 mr-1 flex-shrink-0" />
                  {uitnodigingBezig === g.id
                    ? "Bezig..."
                    : status === "uitgenodigd"
                    ? "Opnieuw uitnodigen"
                    : "Uitnodigen"}
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      <PaginaHulp pagina="gebruikers" />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("gebruikers.titel")}</h1>
          <p className="text-muted-foreground mt-1">{t("gebruikers.ondertitel")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching} title="Vernieuwen">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          {actieveTab === "gebruikers" && isHoofd && gebruikersMetOntbrekend > 0 && (
            <Button
              variant="outline"
              onClick={vulModulesBijGebruikersAan}
              disabled={vulModulesAan.isPending}
              title="Vul ontbrekende modules bij alle gebruikers aan op Geen toegang"
            >
              {vulModulesAan.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ListChecks className="h-4 w-4 mr-2" />
              )}
              Modules aanvullen
            </Button>
          )}
          {actieveTab === "gebruikers" && (
            <Button onClick={() => { setToevoegenStap(1); setToevoegenOpen(true); setToevoegenForm(leegForm); setToevoegenFout(null); }}>
              <Plus className="h-4 w-4 mr-2" /> Gebruiker toevoegen
            </Button>
          )}
          {actieveTab === "klanten" && (
            <Button onClick={() => { setToevoegenForm({ ...leegForm, rol: "klant" }); setToevoegenStap(2); setToevoegenOpen(true); setToevoegenFout(null); }}>
              <Plus className="h-4 w-4 mr-2" /> Klant toevoegen
            </Button>
          )}
        </div>
      </div>

      <Tabs value={actieveTab} onValueChange={(v) => setActieveTab(v as typeof actieveTab)}>
        <TabsList className="h-9">
          <TabsTrigger value="gebruikers" className="text-sm">Gebruikers</TabsTrigger>
          <TabsTrigger value="klanten" className="text-sm gap-1.5">
            Klanten
            {klantBron.length > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">{klantBron.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="profielen" className="text-sm">Profielen</TabsTrigger>
        </TabsList>

        {/* Tab: Gebruikers */}
        <TabsContent value="gebruikers" className="space-y-4 mt-4">
          {/* Zoekbalk */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={zoek}
                onChange={(e) => setZoek(e.target.value)}
                placeholder="Naam, e-mail of functie..."
                className="h-9 pl-8"
              />
            </div>
            {filterGroep && (
              <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setFilterGroep(null)}>
                <X className="h-3.5 w-3.5" />
                {filterGroep}
              </Button>
            )}
            {(!!zoek.trim() || !!filterGroep) && (
              <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={() => { setZoek(""); setFilterGroep(null); }}>
                Alles wissen
              </Button>
            )}
            {isHoofd && aantalGearchiveerd > 0 && (
              <Button
                variant={toonGearchiveerd ? "secondary" : "outline"}
                size="sm"
                className="h-9 gap-1.5 ml-auto"
                onClick={() => setToonGearchiveerd((v) => !v)}
              >
                <Archive className="h-3.5 w-3.5" />
                {toonGearchiveerd
                  ? "Verberg gearchiveerden"
                  : `Gearchiveerd (${aantalGearchiveerd})`}
              </Button>
            )}
            {(!!zoek.trim() || !!filterGroep) && (
              <span className="text-xs text-muted-foreground ml-auto">
                {totaalGevonden} {totaalGevonden === 1 ? "gebruiker" : "gebruikers"}
              </span>
            )}
          </div>

          {/* Automatische profielkoppelingen — overzicht en bulkbevestiging */}
          {isHoofd && (autoOnbevestigdTotaal > 0 || alleenAuto || bulkResultaat) && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
              <Badge variant="outline" className="h-5 px-1.5 text-xs bg-amber-100 text-amber-800 border-amber-200 gap-1">
                <Layers className="h-3 w-3" />
                Auto
              </Badge>
              <span className="text-xs text-amber-900">
                {autoOnbevestigdTotaal === 0
                  ? "Geen onbevestigde automatische koppelingen"
                  : `${autoOnbevestigdTotaal} ${autoOnbevestigdTotaal === 1 ? "gebruiker heeft" : "gebruikers hebben"} een onbevestigde automatische profielkoppeling`}
              </span>
              {bulkResultaat && (
                <span className="text-xs font-medium text-green-700 flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  {bulkResultaat}
                </span>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant={alleenAuto ? "secondary" : "outline"}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setAlleenAuto((v) => !v)}
                  disabled={autoOnbevestigdTotaal === 0 && !alleenAuto}
                >
                  {alleenAuto ? "Toon alle gebruikers" : "Alleen automatische"}
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  disabled={autoOnbevestigd.length === 0 || herkomstBevestigenBulk.isPending}
                  onClick={() => { setBulkResultaat(null); setBulkBevestigOpen(true); }}
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  {herkomstBevestigenBulk.isPending
                    ? "Bezig..."
                    : `Bevestig ${autoOnbevestigd.length} ${autoOnbevestigd.length === 1 ? "koppeling" : "koppelingen"}`}
                </Button>
              </div>
            </div>
          )}

          {/* Functiegroep-tegels */}
          {!isLoading && (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {FUNCTIE_GROEPEN.filter((gr) => (isHoofd || gr.naam !== "Hoofdbeheerder") && gr.naam !== "Klant").map((gr) => {
                const Icon = gr.icon;
                const aantal = groepCounts[gr.naam] ?? 0;
                const actief = filterGroep === gr.naam;
                return (
                  <button
                    key={gr.naam}
                    onClick={() => setFilterGroep(actief ? null : gr.naam)}
                    className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-all hover:shadow-sm ${
                      actief
                        ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30"
                        : "bg-background hover:border-border/80"
                    }`}
                  >
                    <div className={`flex items-center gap-1.5 w-full ${actief ? "text-primary" : gr.kleur}`}>
                      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="text-xs font-medium truncate leading-tight">{gr.naam}</span>
                    </div>
                    <span className={`text-xl font-bold leading-none mt-0.5 ${actief ? "text-primary" : "text-foreground"}`}>
                      {aantal}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Gebruikerskaarten */}
          {isLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : groepGefilterd.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-muted/30 py-12 text-center">
              <p className="text-muted-foreground text-sm">
                {filterGroep
                  ? `Geen ${filterGroep.toLowerCase()}s gevonden`
                  : "Geen gebruikers gevonden"}
              </p>
              {(!!zoek.trim() || !!filterGroep) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-muted-foreground"
                  onClick={() => { setZoek(""); setFilterGroep(null); }}
                >
                  Filters wissen
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {groepGefilterd.map((g) => gebruikerKaart(g))}
            </div>
          )}
        </TabsContent>

        {/* Tab: Klanten */}
        <TabsContent value="klanten" className="space-y-4 mt-4">
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Klantaccounts horen bij de klantomgeving (FPS One) en staan los van de interne FPS-gebruikers. Hier beheer je hun toegang tot het klantportaal.
          </div>

          {/* Zoekbalk */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={zoek}
                onChange={(e) => setZoek(e.target.value)}
                placeholder="Naam, e-mail of bedrijf..."
                className="h-9 pl-8"
              />
            </div>
            {!!zoek.trim() && (
              <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={() => setZoek("")}>
                Wissen
              </Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {klantGefilterd.length} {klantGefilterd.length === 1 ? "klant" : "klanten"}
            </span>
          </div>

          {/* Klantkaarten */}
          {isLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : klantGefilterd.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-muted/30 py-12 text-center">
              <p className="text-muted-foreground text-sm">
                {zoek.trim() ? "Geen klanten gevonden" : "Nog geen klantaccounts"}
              </p>
              {!!zoek.trim() && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-muted-foreground"
                  onClick={() => setZoek("")}
                >
                  Filters wissen
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {klantGefilterd.map((g) => gebruikerKaart(g))}
            </div>
          )}
        </TabsContent>

        {/* Tab: Profielen */}
        <TabsContent value="profielen" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Bevoegdheidsprofielen</h2>
              <p className="text-sm text-muted-foreground">
                Sjablonen die als startpunt dienen bij het aanmaken van gebruikers.
              </p>
            </div>
            <Link href="/beheer/profielen">
              <Button variant="outline" size="sm">
                Volledig beheren
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(profielen ?? []).map((p) => {
              const actief = actieveBevoegdheden(p.bevoegdheden as Record<string, number> | null);
              const gebruikersAantal = (gebruikers ?? []).filter((g: any) => g.herkomst_profiel_id === p.id).length;
              return (
                <div key={p.id} className="rounded-lg border bg-muted/30 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{p.naam}</span>
                    <Badge variant="secondary" className="text-xs">
                      {gebruikersAantal} {gebruikersAantal === 1 ? "gebruiker" : "gebruikers"}
                    </Badge>
                  </div>
                  {actief.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {actief.slice(0, 4).map((b) => (
                        <Badge key={b.id} variant="outline" className="text-xs h-5 px-1.5 font-normal text-muted-foreground">
                          {b.label}: {niveauLabel(b.niveau).toLowerCase()}
                        </Badge>
                      ))}
                      {actief.length > 4 && (
                        <Badge variant="outline" className="text-xs h-5 px-1.5">+{actief.length - 4}</Badge>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {(!profielen || profielen.length === 0) && (
              <div className="col-span-full rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
                Geen profielen gevonden. Klik op "Volledig beheren" om profielen aan te maken.
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialoog: toevoegen */}
      <Dialog open={toevoegenOpen} onOpenChange={(o) => { if (!o) { setToevoegenOpen(false); setToevoegenFout(null); setToevoegenStap(1); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby="toevoegen-beschr">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              {toevoegenStap === 1 ? "Kies een functie" : "Gebruiker toevoegen"}
            </DialogTitle>
          </DialogHeader>

          {toevoegenStap === 1 ? (
            <>
              <p id="toevoegen-beschr" className="text-sm text-muted-foreground -mt-1">
                Kies de functie van de nieuwe gebruiker. De standaardbevoegdheden worden automatisch vooringevuld.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {FUNCTIE_GROEPEN.filter((gr) => isHoofd || gr.naam !== "Hoofdbeheerder").map((gr) => {
                  const Icon = gr.icon;
                  return (
                    <button
                      key={gr.naam}
                      type="button"
                      onClick={() => {
                        const profiel = (profielen ?? []).find((p: any) => p.naam === gr.presetNaam);
                        const bevoegdheden = profiel
                          ? { ...(profiel.bevoegdheden ?? {}) } as Record<string, number>
                          : {};
                        const herkomstProfielId = profiel ? profiel.id : null;
                        const functietitels = gr.rol === "gebruiker" ? [gr.naam] : [];
                        setToevoegenForm((f) => ({
                          ...f,
                          rol: gr.rol,
                          functietitels,
                          bevoegdheden,
                          herkomst_profiel_id: herkomstProfielId,
                        }));
                        setToevoegenStap(2);
                      }}
                      className="flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5 text-left hover:bg-muted/50 hover:border-primary/30 hover:shadow-sm transition-all"
                    >
                      <Icon className={`h-4 w-4 flex-shrink-0 ${gr.kleur}`} />
                      <div>
                        <div className="text-sm font-medium leading-tight">{gr.naam}</div>
                        <div className="text-xs text-muted-foreground leading-tight">{gr.beschrijving}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <DialogFooter className="pt-1">
                <Button type="button" variant="outline" onClick={() => setToevoegenOpen(false)}>Annuleren</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <p id="toevoegen-beschr" className="text-sm text-muted-foreground -mt-1">
                Vul de gegevens in om een nieuw account aan te maken.
              </p>
              <form onSubmit={verstuurToevoegen} className="space-y-4 pt-1">
                <GebruikerVelden form={toevoegenForm} setForm={setToevoegenForm} toonActief={false} toonHoofd={isHoofd} />
                {toevoegenFout && <Foutmelding tekst={toevoegenFout} />}
                <DialogFooter className="gap-2 pt-1">
                  <Button type="button" variant="outline" onClick={() => setToevoegenStap(1)}>Terug</Button>
                  <Button type="submit" disabled={maakGebruiker.isPending}>
                    {maakGebruiker.isPending ? "Opslaan..." : "Toevoegen"}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialoog: bewerken */}
      <Dialog open={!!bewerkGebruiker} onOpenChange={(o) => { if (!o) { setBewerkGebruiker(null); setBewerkFout(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby="bewerk-beschr">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" /> Gebruiker bewerken
            </DialogTitle>
          </DialogHeader>
          <p id="bewerk-beschr" className="text-sm text-muted-foreground -mt-1">
            Pas de gegevens van <strong>{bewerkGebruiker?.naam}</strong> aan.
          </p>
          <form onSubmit={verstuurBewerken} className="space-y-4 pt-1">
            <GebruikerVelden form={bewerkForm} setForm={setBewerkForm} toonActief toonHoofd={isHoofd} />
            {bewerkFout && <Foutmelding tekst={bewerkFout} />}
            <DialogFooter className="gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setBewerkGebruiker(null)}>Annuleren</Button>
              <Button type="submit" disabled={werkBijGebruiker.isPending}>
                {werkBijGebruiker.isPending ? "Opslaan..." : "Wijzigingen opslaan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: archiveren */}
      <AlertDialog open={!!verwijderTarget} onOpenChange={(o) => { if (!o) setVerwijderTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gebruiker archiveren?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet u zeker dat u <strong>{verwijderTarget?.naam}</strong> ({verwijderTarget?.email}) wilt archiveren?
              De gebruiker kan dan niet meer inloggen. U kunt dit later ongedaan maken via de knop Herstellen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={bevestigVerwijderen}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {verwijderGebruiker.isPending ? "Archiveren..." : "Archiveren"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog: automatische koppelingen in bulk bevestigen */}
      <AlertDialog open={bulkBevestigOpen} onOpenChange={(o) => { if (!o) setBulkBevestigOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Automatische koppelingen bevestigen?</AlertDialogTitle>
            <AlertDialogDescription>
              U staat op het punt {autoOnbevestigd.length} automatisch afgeleide
              profielkoppeling{autoOnbevestigd.length === 1 ? "" : "en"} te bevestigen
              {(filterGroep || alleenAuto || !!zoek.trim())
                ? " (binnen de huidige selectie)"
                : ""}.
              De koppelingen blijven behouden en worden voortaan als handmatig
              bevestigd behandeld. De bevoegdheden van de gebruikers wijzigen niet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); bevestigHerkomstBulk(autoOnbevestigd.map((g) => g.id)); }}
              disabled={herkomstBevestigenBulk.isPending}
            >
              {herkomstBevestigenBulk.isPending ? "Bevestigen..." : "Bevestigen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialoog: bekijken */}
      <Dialog open={!!bekijkGebruiker} onOpenChange={(o) => { if (!o) setBekijkGebruiker(null); }}>
        <DialogContent className="max-w-md" aria-describedby="bekijk-beschr">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" /> Gebruikersgegevens
            </DialogTitle>
          </DialogHeader>
          <p id="bekijk-beschr" className="sr-only">Volledige gegevens van de gebruiker.</p>

          {bekijkGebruiker && (() => {
            const cfg = ROL_CONFIG[bekijkGebruiker.rol as Rol];
            const RolIcon = cfg?.icon ?? User;
            const status = (bekijkGebruiker.uitnodiging_status ?? "niet_uitgenodigd") as keyof typeof UITNODIGING_STATUS_CONFIG;
            const statusCfg = UITNODIGING_STATUS_CONFIG[status];
            const groep = groepVanGebruiker(bekijkGebruiker);
            const groepCfg = FUNCTIE_GROEPEN.find((gr) => gr.naam === groep);
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-14 w-14 border-2 border-primary/10">
                    {bekijkGebruiker.avatar_url && (
                      <AvatarImage src={bekijkGebruiker.avatar_url} alt={bekijkGebruiker.naam ?? ""} />
                    )}
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {initialen(bekijkGebruiker.naam ?? "")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="text-lg font-semibold leading-tight">{bekijkGebruiker.naam}</div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      <Badge variant="outline" className={cfg?.badge ?? ""}>
                        <RolIcon className="h-3 w-3 mr-1" />
                        {cfg?.label ?? bekijkGebruiker.rol}
                      </Badge>
                      {groepCfg && (
                        <Badge variant="secondary" className={`text-xs ${groepCfg.kleur}`}>
                          {groep}
                        </Badge>
                      )}
                      {status !== "geaccepteerd" && statusCfg.label && (
                        <Badge variant="outline" className={statusCfg.badge}>
                          {statusCfg.label}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {bekijkGebruiker.bedrijfslogo_url && (
                    <img
                      src={bekijkGebruiker.bedrijfslogo_url}
                      alt="Bedrijfslogo"
                      className="h-10 w-10 object-contain rounded border bg-white p-0.5"
                    />
                  )}
                </div>

                <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                  <VeldRij icon={Mail} label="E-mailadres" waarde={bekijkGebruiker.email} />
                  <VeldRij
                    icon={User}
                    label="Functie"
                    waarde={groep !== "Overig" ? groep : (bekijkGebruiker.functietitels ?? []).join(", ")}
                  />
                  <VeldRij icon={Phone} label="Telefoonnummer" waarde={bekijkGebruiker.telefoon} />
                  <VeldRij icon={Building} label="Bedrijf" waarde={bekijkGebruiker.bedrijf} />
                  <div className="flex items-start gap-3">
                    <Clock className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">Laatste online</div>
                      <div className={`text-sm ${onlinKleur(bekijkGebruiker.laatste_online)}`}>
                        {relatiefTijdstip(bekijkGebruiker.laatste_online)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">Status</div>
                      <div className="text-sm">{bekijkGebruiker.actief ? "Actief" : "Inactief"}</div>
                    </div>
                  </div>
                  {bekijkGebruiker.bedrijfskleuren && (
                    <div className="flex items-start gap-3">
                      <Palette className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">Accentkleur</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div
                            className="h-4 w-4 rounded-full border"
                            style={{ backgroundColor: haalPrimairKleur(bekijkGebruiker.bedrijfskleuren) }}
                          />
                          <span className="text-sm font-mono text-xs">
                            {haalPrimairKleur(bekijkGebruiker.bedrijfskleuren)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {(() => {
                  const actief = actieveBevoegdheden(bekijkGebruiker.bevoegdheden);
                  const profiel =
                    bekijkGebruiker.herkomst_profiel_id != null
                      ? profielMap.get(bekijkGebruiker.herkomst_profiel_id)
                      : undefined;
                  const afwijkend = profiel
                    ? !bevoegdhedenGelijk(bekijkGebruiker.bevoegdheden, profiel.bevoegdheden)
                    : false;
                  return (
                    <div className="rounded-lg border bg-muted/30 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <ShieldCheck className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="text-sm font-medium">Bevoegdheden</div>
                      </div>
                      {profiel && (() => {
                        const automatisch = (bekijkGebruiker as any).herkomst_automatisch === true;
                        return (
                          <div className="mb-3 space-y-2">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              <Layers className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="text-muted-foreground">
                                {automatisch ? "Automatisch gekoppeld aan profiel" : "Gekoppeld aan profiel"}
                              </span>
                              <span className="font-medium">{profiel.naam}</span>
                              {automatisch ? (
                                <Badge variant="outline" className="text-xs h-5 px-1.5 bg-amber-50 text-amber-700 border-amber-200">
                                  Automatisch
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs h-5 px-1.5 text-muted-foreground">
                                  Handmatig
                                </Badge>
                              )}
                              {afwijkend && (
                                <Badge variant="outline" className="text-xs h-5 px-1.5 bg-amber-50 text-amber-700 border-amber-200">
                                  Sindsdien aangepast
                                </Badge>
                              )}
                            </div>
                            {automatisch && (
                              <p className="text-xs text-muted-foreground">
                                De bevoegdheden van deze gebruiker kwamen exact en als enige overeen
                                met dit profiel; de koppeling is daarom automatisch gelegd.
                              </p>
                            )}
                            {isHoofd && (automatisch || afwijkend) && (
                              <div className="flex flex-wrap items-center gap-2">
                                {automatisch && (
                                  <>
                                    <Button
                                      variant="outline" size="sm" className="h-6 px-2 text-xs"
                                      disabled={herkomstBezig === bekijkGebruiker.id}
                                      onClick={() => bevestigHerkomst(bekijkGebruiker)}
                                    >
                                      <Check className="h-3 w-3 mr-1" /> Koppeling bevestigen
                                    </Button>
                                    <Button
                                      variant="outline" size="sm" className="h-6 px-2 text-xs"
                                      disabled={herkomstBezig === bekijkGebruiker.id}
                                      onClick={() => verwijderHerkomst(bekijkGebruiker)}
                                    >
                                      <X className="h-3 w-3 mr-1" /> Koppeling verwijderen
                                    </Button>
                                  </>
                                )}
                                {afwijkend && (
                                  <Button
                                    variant="outline" size="sm" className="h-6 px-2 text-xs ml-auto"
                                    disabled={herkomstBezig === bekijkGebruiker.id}
                                    onClick={() => pasHerkomstToe(bekijkGebruiker)}
                                  >
                                    <RotateCcw className={`h-3 w-3 mr-1 ${herkomstBezig === bekijkGebruiker.id ? "animate-spin" : ""}`} />
                                    Profiel opnieuw toepassen
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {actief.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Geen bevoegdheden ingesteld.</p>
                      ) : (
                        <div className="divide-y divide-border/50">
                          {actief.map((b) => (
                            <div key={b.id} className="flex items-center justify-between py-1.5">
                              <span className="text-sm">{b.label}</span>
                              <Badge variant="secondary" className="text-xs font-normal text-muted-foreground">
                                {niveauLabel(b.niveau)}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {isHoofd && status !== "geaccepteerd" && (
                  <button
                    type="button"
                    className={`h-9 text-sm w-full gap-1.5 font-medium rounded-md flex items-center justify-center px-3 transition-colors ${
                      status === "niet_uitgenodigd"
                        ? "bg-amber-500 hover:bg-amber-600 text-white"
                        : "bg-purple-500 hover:bg-purple-600 text-white"
                    } disabled:opacity-60`}
                    disabled={uitnodigingBezig === bekijkGebruiker.id}
                    onClick={() => stuurUitnodiging(bekijkGebruiker)}
                  >
                    <SendHorizonal className="h-4 w-4 mr-1.5 flex-shrink-0" />
                    {uitnodigingBezig === bekijkGebruiker.id
                      ? "Bezig..."
                      : status === "uitgenodigd"
                      ? "Uitnodiging opnieuw sturen"
                      : "Uitnodiging versturen"}
                  </button>
                )}

                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => { const g = bekijkGebruiker; setBekijkGebruiker(null); openBewerken(g); }}>
                    <Pencil className="h-4 w-4 mr-1" /> Bewerken
                  </Button>
                  <Button onClick={() => setBekijkGebruiker(null)}>Sluiten</Button>
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VeldRij({ icon: Icon, label, waarde }: { icon: React.ElementType; label: string; waarde?: string | null }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm">{waarde || "—"}</div>
      </div>
    </div>
  );
}

function BevoegdhedenEditor({
  bevoegdheden,
  onChange,
  onPresetGekozen,
  herkomstProfielId,
  herkomstAutomatisch,
}: {
  bevoegdheden: Record<string, number>;
  onChange: (b: Record<string, number>) => void;
  onPresetGekozen?: (profielId: number) => void;
  herkomstProfielId?: number | null;
  herkomstAutomatisch?: boolean;
}) {
  const { data: profielen } = useListProfielen();
  const gekoppeldProfiel =
    herkomstProfielId != null ? profielen?.find((p) => p.id === herkomstProfielId) : undefined;

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5" /> Bevoegdheden
      </div>

      {gekoppeldProfiel && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Layers className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-muted-foreground">
            {herkomstAutomatisch ? "Automatisch gekoppeld aan profiel" : "Gekoppeld aan profiel"}
          </span>
          <span className="font-medium">{gekoppeldProfiel.naam}</span>
          {herkomstAutomatisch ? (
            <Badge variant="outline" className="text-xs h-5 px-1.5 bg-amber-50 text-amber-700 border-amber-200">
              Automatisch
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs h-5 px-1.5 text-muted-foreground">
              Handmatig
            </Badge>
          )}
        </div>
      )}

      {profielen && profielen.length > 0 && (
        <div className="space-y-1.5">
          <Label>Preset toepassen</Label>
          <Select
            value={herkomstProfielId != null ? String(herkomstProfielId) : ""}
            onValueChange={(profielId) => {
              const profiel = profielen.find((p) => String(p.id) === profielId);
              if (profiel) {
                onChange({ ...(profiel.bevoegdheden as Record<string, number>) });
                onPresetGekozen?.(profiel.id);
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Kies een preset..." />
            </SelectTrigger>
            <SelectContent>
              {profielen.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.naam}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {herkomstAutomatisch
              ? "Een preset kiezen legt een handmatige (bevestigde) koppeling. Preset overschrijft alle modulewaarden — daarna nog per module aanpasbaar."
              : "Een preset kiezen legt een handmatige koppeling. Preset overschrijft alle modulewaarden — daarna nog per module aanpasbaar."}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {MODULES.map((mod) => (
          <div key={mod.id} className="space-y-0.5">
            <Label className="text-xs">{mod.label}</Label>
            <Select
              value={String(bevoegdheden[mod.id] ?? 0)}
              onValueChange={(v) => onChange({ ...bevoegdheden, [mod.id]: Number(v) })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NIVEAUS.map((n) => (
                  <SelectItem key={n.waarde} value={String(n.waarde)} className="text-xs">
                    {n.waarde} — {n.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}

function GebruikerVelden({
  form,
  setForm,
  toonActief,
  toonHoofd,
}: {
  form: GebruikerForm;
  setForm: React.Dispatch<React.SetStateAction<GebruikerForm>>;
  toonActief: boolean;
  toonHoofd: boolean;
}) {
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  function leesBestand(file: File, veld: "avatar_url" | "bedrijfslogo_url") {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const resultaat = ev.target?.result as string;
      setForm((f) => ({ ...f, [veld]: resultaat }));
    };
    reader.readAsDataURL(file);
  }

  const primairKleur = haalPrimairKleur(form.bedrijfskleuren);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="g-naam">Naam <span className="text-destructive">*</span></Label>
          <Input
            id="g-naam"
            value={form.naam}
            onChange={(e) => setForm((f) => ({ ...f, naam: e.target.value }))}
            placeholder="Volledige naam"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="g-email">E-mailadres <span className="text-destructive">*</span></Label>
          <Input
            id="g-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="naam@bedrijf.nl"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="g-rol">Rol <span className="text-destructive">*</span></Label>
          <Select
            value={form.rol}
            onValueChange={(v) =>
              setForm((f) => ({
                ...f,
                rol: v,
                functietitels:
                  v === "hoofdbeheerder"
                    ? f.functietitels.filter((o) => (FUNCTIETITELS as readonly string[]).includes(o))
                    : [],
              }))
            }
          >
            <SelectTrigger id="g-rol"><SelectValue /></SelectTrigger>
            <SelectContent>
              {toonHoofd && <SelectItem value="hoofdbeheerder">Hoofdbeheerder</SelectItem>}
              <SelectItem value="gebruiker">Gebruiker (matrix)</SelectItem>
              <SelectItem value="klant">Klant</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {form.rol === "hoofdbeheerder" && (
        <div className="space-y-1.5">
          <Label>Projectfunctie</Label>
          <p className="text-xs text-muted-foreground">Een hoofdbeheerder kan één of meer projectfuncties hebben.</p>
          <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
            {FUNCTIETITELS.map((ft) => {
              const aan = form.functietitels.includes(ft);
              return (
                <label key={ft} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={aan}
                    onCheckedChange={(c) =>
                      setForm((f) => ({
                        ...f,
                        functietitels: c
                          ? [...f.functietitels, ft]
                          : f.functietitels.filter((x) => x !== ft),
                      }))
                    }
                  />
                  {ft}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {form.rol === "gebruiker" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="g-dienstverband">Type personeel</Label>
            <Select
              value={form.dienstverband}
              onValueChange={(v) => setForm((f) => ({ ...f, dienstverband: v, bedrijf_uitzendbureau: (v === "uitzend" || v === "inhuur") ? f.bedrijf_uitzendbureau : "" }))}
            >
              <SelectTrigger id="g-dienstverband"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="intern">Intern (eigen dienst)</SelectItem>
                <SelectItem value="zzp">ZZP-er</SelectItem>
                <SelectItem value="uitzend">Uitzendkracht</SelectItem>
                <SelectItem value="inhuur">Inhuur / onderaannemer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(form.dienstverband === "uitzend" || form.dienstverband === "inhuur") && (
            <div className="space-y-1.5">
              <Label htmlFor="g-bedrijf-uitzend">{form.dienstverband === "uitzend" ? "Naam uitzendbureau" : "Naam bedrijf / onderaannemer"}</Label>
              <Input
                id="g-bedrijf-uitzend"
                value={form.bedrijf_uitzendbureau}
                onChange={(e) => setForm((f) => ({ ...f, bedrijf_uitzendbureau: e.target.value }))}
                placeholder={form.dienstverband === "uitzend" ? "bijv. Randstad" : "Naam van het bedrijf"}
              />
            </div>
          )}
        </div>
      )}

      {form.rol !== "klant" && form.rol !== "hoofdbeheerder" && (
        <BevoegdhedenEditor
          bevoegdheden={form.bevoegdheden}
          herkomstProfielId={form.herkomst_profiel_id}
          herkomstAutomatisch={form.herkomst_automatisch}
          onChange={(b) => setForm((f) => ({ ...f, bevoegdheden: b }))}
          onPresetGekozen={(profielId) =>
            setForm((f) => ({ ...f, herkomst_profiel_id: profielId, herkomst_automatisch: false }))
          }
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="g-telefoon">Telefoonnummer</Label>
          <Input
            id="g-telefoon"
            value={form.telefoon}
            onChange={(e) => setForm((f) => ({ ...f, telefoon: e.target.value }))}
            placeholder="+31 6 12345678"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="g-bedrijf">Bedrijf</Label>
          <Input
            id="g-bedrijf"
            value={form.bedrijf}
            onChange={(e) => setForm((f) => ({ ...f, bedrijf: e.target.value }))}
            placeholder="Bedrijfsnaam"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="g-wachtwoord">Wachtwoord</Label>
          <Input
            id="g-wachtwoord"
            type="password"
            value={form.wachtwoord}
            onChange={(e) => setForm((f) => ({ ...f, wachtwoord: e.target.value }))}
            placeholder={toonActief ? "Leeg = ongewijzigd" : "Instellen"}
            autoComplete="new-password"
          />
        </div>
      </div>

      {toonActief && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
          <Switch
            id="g-actief"
            checked={form.actief}
            onCheckedChange={(v) => setForm((f) => ({ ...f, actief: v }))}
          />
          <Label htmlFor="g-actief" className="cursor-pointer">Account actief</Label>
          <span className="text-xs text-muted-foreground ml-auto">
            {form.actief ? "Kan inloggen" : "Kan niet inloggen"}
          </span>
        </div>
      )}

      <div className="rounded-lg border p-3 space-y-3">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Palette className="h-3.5 w-3.5" /> Profiel en branding
        </div>

        <div className="space-y-1.5">
          <Label>Profielfoto</Label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fotoInputRef.current?.click()}
              className="h-14 w-14 rounded-full border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors overflow-hidden flex-shrink-0 bg-muted/30"
            >
              {form.avatar_url ? (
                <img src={form.avatar_url} className="h-full w-full object-cover" alt="Profielfoto" />
              ) : (
                <div className="h-full w-full flex items-center justify-center">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
            </button>
            <div className="space-y-1">
              <Button type="button" variant="outline" size="sm" onClick={() => fotoInputRef.current?.click()} className="text-xs h-7">
                Foto uploaden
              </Button>
              {form.avatar_url && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, avatar_url: "" }))} className="text-xs h-7 text-muted-foreground">
                  Verwijderen
                </Button>
              )}
              <p className="text-xs text-muted-foreground">JPG, PNG of WebP</p>
            </div>
          </div>
          <input ref={fotoInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) leesBestand(f, "avatar_url"); }} />
        </div>

        <div className="space-y-1.5">
          <Label>Bedrijfslogo</Label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              className="h-14 w-14 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors overflow-hidden flex-shrink-0 bg-white/50"
            >
              {form.bedrijfslogo_url ? (
                <img src={form.bedrijfslogo_url} className="h-full w-full object-contain p-1" alt="Bedrijfslogo" />
              ) : (
                <div className="h-full w-full flex items-center justify-center">
                  <Building className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
            </button>
            <div className="space-y-1">
              <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} className="text-xs h-7">
                Logo uploaden
              </Button>
              {form.bedrijfslogo_url && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, bedrijfslogo_url: "" }))} className="text-xs h-7 text-muted-foreground">
                  Verwijderen
                </Button>
              )}
              <p className="text-xs text-muted-foreground">JPG, PNG of SVG</p>
            </div>
          </div>
          <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) leesBestand(f, "bedrijfslogo_url"); }} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="g-kleur">Accentkleur</Label>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                id="g-kleur"
                type="color"
                value={primairKleur}
                onChange={(e) => setForm((f) => ({ ...f, bedrijfskleuren: JSON.stringify({ primair: e.target.value }) }))}
                className="h-9 w-16 rounded cursor-pointer border border-input bg-transparent p-0.5"
                title="Kies accentkleur"
              />
            </div>
            <div>
              <span className="text-sm font-mono">{primairKleur}</span>
              <p className="text-xs text-muted-foreground">Accentkleur voor dit account</p>
            </div>
            {form.bedrijfskleuren && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, bedrijfskleuren: "" }))} className="text-xs h-7 text-muted-foreground ml-auto">
                Resetten
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Foutmelding({ tekst }: { tekst: string }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {tekst}
    </div>
  );
}
