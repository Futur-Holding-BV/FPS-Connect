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
  useActivatielinkGenereren,
  useGebruikersAanvullen,
  useGebruikerWachtwoordResetten,
  useGebruikerSessiesBeeindigen,
  useGebruikerOntgrendelen,
  // GEBRUIKERS_01 v2: bevoegdheden per gebruiker (baseline + afwijkingen + effectief)
  useGetGebruikerBevoegdhedenV2,
  usePasFunctieRechtenToe,
  useVervangGebruikerAfwijkingen,
  useGetMailStatus,
  useListExterneAdviseurs,
  useGetExterneAdviseurHerstartVoorvertoning,
  useRestartExterneAdviseurOnboarding,
  getGetMailStatusQueryKey,
  getListGebruikersQueryKey,
  getListExterneAdviseursQueryKey,
  getGetExterneAdviseurHerstartVoorvertoningQueryKey,
  getGetGebruikerBevoegdhedenV2QueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UitzendbureauSelect } from "@/components/uitzendbureau-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Mail, Phone, Building, Clock, Plus, UserPlus, Pencil, Trash2, Archive,
  RefreshCw, ShieldCheck, Eye, User, Crown, Upload, Palette, SendHorizonal, X,
  Search, RotateCcw, Briefcase,
  ListChecks, Loader2, AlertTriangle, MoreVertical, KeyRound, LogOut, Lock, Unlock, Copy,
  QrCode, Download, Link2, UserRoundX,
} from "lucide-react";
import { MODULES, NIVEAUS } from "@workspace/permissies";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useRol } from "@/context/rol-context";
import { useVoorkeur } from "@/hooks/use-voorkeur";
import { PaginaHulp } from "@/components/pagina-hulp";
import { Link } from "wouter";

const ROLLEN = ["hoofdbeheerder", "gebruiker"] as const;
type Rol = typeof ROLLEN[number];

function niveauLabel(n: number): string {
  return NIVEAUS.find((x) => x.waarde === n)?.kort ?? "";
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
  const ft = g.functietitels ?? [];
  if (ft.length > 0) return ft[0];
  return "Overig";
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

// GEBRUIKERS_01 v2: het account-formulier beheert geen functietitels, bevoegdheden
// of profielkoppelingen meer — die komen via een HRM-aanstelling in Personeel.
const leegForm = {
  naam: "", email: "", rol: "gebruiker",
  telefoon: "", bedrijf: "", wachtwoord: "", actief: true,
  avatar_url: "", bedrijfslogo_url: "", bedrijfskleuren: "",
  dienstverband: "intern",
  bedrijf_uitzendbureau: "",
  uitzendbureau_id: null as number | null,
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
  profiel_ids?: number[] | null;
  dienstverband?: string | null;
  bedrijf_uitzendbureau?: string | null;
  uitzendbureau_id?: number | null;
  uitnodiging_status?: string | null;
  uitnodiging_verstuurd_op?: string | null;
  uitnodiging_verloopt_op?: string | null;
  uitnodiging_geopend_op?: string | null;
  uitnodiging_opnieuw_verstuurd_op?: string | null;
  uitnodiging_geaccepteerd_op?: string | null;
  moet_wachtwoord_wijzigen?: boolean | null;
  mislukte_pogingen?: number | null;
  vergrendeld_tot?: string | null;
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
  const { data: externeAdviseurs } = useListExterneAdviseurs({
    query: { enabled: isHoofd, queryKey: getListExterneAdviseursQueryKey() },
  });
  // Alleen hoofdbeheerders mogen mailconfiguratie inzien (systeem-bevoegdheid);
  // proactieve waarschuwing zodat een uitnodiging niet voor een verrassing zorgt.
  const { data: mailStatus } = useGetMailStatus({
    query: { enabled: isHoofd, queryKey: getGetMailStatusQueryKey() },
  });
  const maakGebruiker       = useCreateGebruiker();
  const werkBijGebruiker    = useUpdateGebruiker();
  const verwijderGebruiker  = useDeleteGebruiker();
  const herstellenMutatie   = useHerstellenGebruiker();
  const uitnodigingVersturen = useUitnodigingVersturen();
  const uitnodigingOpnieuwVersturen = useUitnodigingOpnieuwVersturen();
  const activatielinkMutatie = useActivatielinkGenereren();
  // GEBRUIKERS_01 v2: functierechten toepassen (reset afwijkingen) en afwijkingen vervangen
  const pasFunctieRechtenToeMut = usePasFunctieRechtenToe();
  const vervangAfwijkingenMut   = useVervangGebruikerAfwijkingen();
  const vulModulesAan        = useGebruikersAanvullen();
  const wachtwoordResetten   = useGebruikerWachtwoordResetten();
  const sessiesBeeindigen    = useGebruikerSessiesBeeindigen();
  const ontgrendelenMutatie  = useGebruikerOntgrendelen();
  const herstartMutatie      = useRestartExterneAdviseurOnboarding();

  const [toevoegenOpen, setToevoegenOpen] = useState(false);
  const [toevoegenStap, setToevoegenStap] = useState<1 | 2>(1);
  const [toevoegenForm, setToevoegenForm] = useState<GebruikerForm>(leegForm);
  const [toevoegenFout, setToevoegenFout] = useState<string | null>(null);

  const [bewerkGebruiker, setBewerkGebruiker] = useState<Gebruiker | null>(null);
  const [bewerkForm, setBewerkForm]           = useState<GebruikerForm>(leegForm);
  const [bewerkFout, setBewerkFout]           = useState<string | null>(null);

  const [verwijderTarget, setVerwijderTarget] = useState<Gebruiker | null>(null);
  const [bekijkGebruiker, setBekijkGebruiker] = useState<Gebruiker | null>(null);
  // GEBRUIKERS_01 v2: bevoegdheden V2 voor bekijk/bewerk dialoog
  const [afwijkingenBewerkenOpen, setAfwijkingenBewerkenOpen] = useState(false);
  const [afwijkingenEditMap, setAfwijkingenEditMap] = useState<Record<string, number>>({});
  const [afwijkingenEditReden, setAfwijkingenEditReden] = useState("");
  const { data: bekijkBevoegdhedenV2 } = useGetGebruikerBevoegdhedenV2(
    bekijkGebruiker?.id ?? 0,
    { query: { enabled: !!bekijkGebruiker, queryKey: getGetGebruikerBevoegdhedenV2QueryKey(bekijkGebruiker?.id ?? 0) } },
  );

  const [uitnodigingBezig, setUitnodigingBezig] = useState<number | null>(null);
  const [herkomstBezig, setHerkomstBezig]       = useState<number | null>(null);
  const [activatielinkBezig, setActivatielinkBezig] = useState<number | null>(null);
  const [activatielinkResultaat, setActivatielinkResultaat] = useState<{ link: string; verloopt_op: string } | null>(null);

  const [wwResetTarget, setWwResetTarget]     = useState<Gebruiker | null>(null);
  const [wwResetMethode, setWwResetMethode]   = useState<"link" | "tijdelijk">("link");
  const [wwResetMfa, setWwResetMfa]           = useState(false);
  const [wwResetResultaat, setWwResetResultaat] = useState<{ tijdelijk_wachtwoord?: string; resetlink_verstuurd?: boolean } | null>(null);
  const [sessiesTarget, setSessiesTarget]     = useState<Gebruiker | null>(null);
  const [herstartTarget, setHerstartTarget] = useState<{ gebruiker: Gebruiker; adviseurId: number } | null>(null);
  const [herstartBevestiging, setHerstartBevestiging] = useState("");
  const [herstartFout, setHerstartFout] = useState<string | null>(null);
  const {
    data: herstartPreview,
    isLoading: herstartPreviewLaadt,
    error: herstartPreviewFout,
  } = useGetExterneAdviseurHerstartVoorvertoning(
    herstartTarget?.adviseurId ?? 0,
    {
      query: {
        enabled: !!herstartTarget,
        queryKey: getGetExterneAdviseurHerstartVoorvertoningQueryKey(herstartTarget?.adviseurId ?? 0),
        retry: false,
      },
    },
  );

  const [zoek, setZoek]               = useVoorkeur<string>("gebruikers_zoek", "");
  const [filterGroep, setFilterGroep] = useVoorkeur<string | null>("gebruikers_filter_groep", null);
  const [toonGearchiveerd, setToonGearchiveerd] = useState<boolean>(false);
  const [herkomstToepassenTarget, setHerkomstToepassenTarget] = useState<Gebruiker | null>(null);
  // GEBRUIKERS_01 eis 4: reden verplicht bij apply/reset van profiel
  const [herkomstToepassenReden, setHerkomstToepassenReden] = useState("");
  const [appQrGebruiker, setAppQrGebruiker] = useState<Gebruiker | null>(null);
  // QR-afbeelding kan ontbreken (app nog niet gepubliceerd → 404); dan tonen we
  // een duidelijke uitleg in plaats van een kapot plaatje.
  const [appQrFout, setAppQrFout] = useState(false);
  // Welke store-links zijn ingesteld? Bepaalt of we één of twee (iOS/Android)
  // QR-codes tonen. null = nog niet opgehaald.
  const [appStoreInfo, setAppStoreInfo] = useState<{ store_url: string | null; play_store_url: string | null } | null>(null);
  useEffect(() => {
    if (!appQrGebruiker) return;
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    fetch(`${base}/api/auth/app-installatie-info`)
      .then((r) => (r.ok ? r.json() : { store_url: null, play_store_url: null }))
      .then((d: { store_url: string | null; play_store_url: string | null }) => setAppStoreInfo(d))
      .catch(() => setAppStoreInfo({ store_url: null, play_store_url: null }));
  }, [appQrGebruiker]);

  const invalideer = () => queryClient.invalidateQueries({ queryKey: getListGebruikersQueryKey() });

  // Migratie: "Klant" is geen interne functiegroep-filter meer. Reset een
  // eventueel eerder bewaarde filterkeuze zodat het interne overzicht niet
  // ten onrechte leeg lijkt.
  useEffect(() => {
    if (filterGroep === "Klant") setFilterGroep(null);
  }, [filterGroep, setFilterGroep]);

  // GEBRUIKERS_01 v2: reset afwijkingen via pasFunctieRechtenToe
  async function resetNaarFunctieRechten(g: Gebruiker, reden: string) {
    if (!reden.trim()) {
      toast({ title: "Reden is verplicht", variant: "destructive" });
      return;
    }
    setHerkomstBezig(g.id);
    try {
      await pasFunctieRechtenToeMut.mutateAsync({ id: g.id, data: { reden, bewuste_afwijkingen_wissen: true } });
      invalideer();
      await queryClient.invalidateQueries({ queryKey: getGetGebruikerBevoegdhedenV2QueryKey(g.id) });
      toast({ title: "Functierechten hersteld", description: `De bevoegdheden van ${g.naam ?? "de gebruiker"} zijn teruggezet naar de functie-baseline.` });
    } catch {
      toast({ title: "Herstellen mislukt", description: "Probeer het later opnieuw.", variant: "destructive" });
    } finally { setHerkomstBezig(null); }
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
          telefoon:         toevoegenForm.telefoon.trim()    || undefined,
          bedrijf:          toevoegenForm.bedrijf.trim()     || undefined,
          wachtwoord:       toevoegenForm.wachtwoord.trim()  || undefined,
          avatar_url:       toevoegenForm.avatar_url         || undefined,
          bedrijfslogo_url: toevoegenForm.bedrijfslogo_url   || undefined,
          bedrijfskleuren:  toevoegenForm.bedrijfskleuren    || undefined,
          dienstverband:    toevoegenForm.dienstverband || undefined,
          bedrijf_uitzendbureau: toevoegenForm.bedrijf_uitzendbureau.trim() || undefined,
          uitzendbureau_id: toevoegenForm.uitzendbureau_id,
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
      telefoon:         g.telefoon        ?? "",
      bedrijf:          g.bedrijf         ?? "",
      wachtwoord:       "",
      actief:           g.actief          ?? true,
      avatar_url:       g.avatar_url      ?? "",
      bedrijfslogo_url: g.bedrijfslogo_url ?? "",
      bedrijfskleuren:  g.bedrijfskleuren  ?? "",
      dienstverband: g.dienstverband ?? "intern",
      bedrijf_uitzendbureau: g.bedrijf_uitzendbureau ?? "",
      uitzendbureau_id: g.uitzendbureau_id ?? null,
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
          telefoon:         bewerkForm.telefoon.trim()    || undefined,
          bedrijf:          bewerkForm.bedrijf.trim()     || undefined,
          wachtwoord:       bewerkForm.wachtwoord.trim()  || undefined,
          actief:           bewerkForm.actief,
          avatar_url:       bewerkForm.avatar_url         || undefined,
          bedrijfslogo_url: bewerkForm.bedrijfslogo_url   || undefined,
          bedrijfskleuren:  bewerkForm.bedrijfskleuren    || undefined,
          // GEBRUIKERS_01 v2: geen functietitels/bevoegdheden/profiel_ids meer vanuit
          // het account-formulier; die worden beheerd via HRM-aanstelling en afwijkingen.
          dienstverband:    bewerkForm.dienstverband || undefined,
          bedrijf_uitzendbureau: bewerkForm.bedrijf_uitzendbureau.trim() || undefined,
          uitzendbureau_id: bewerkForm.uitzendbureau_id,
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

  async function kopieerActivatielink(g: Gebruiker) {
    setActivatielinkBezig(g.id);
    try {
      const resultaat = await activatielinkMutatie.mutateAsync({ id: g.id });
      setActivatielinkResultaat(resultaat);
    } catch {
      toast({ title: "Activatielink mislukt", description: "Probeer het later opnieuw.", variant: "destructive" });
    } finally {
      setActivatielinkBezig(null);
    }
  }

  function kopieerInstallatielink() {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const link = `${window.location.origin}${base}/app`;
    navigator.clipboard.writeText(link).then(() => {
      toast({
        title: "Installatielink gekopieerd",
        description: `${link} — stuur deze bijvoorbeeld via WhatsApp naar de medewerker.`,
      });
    }).catch(() => {
      toast({ title: "Kopiëren mislukt", description: link, variant: "destructive" });
    });
  }

  function openWachtwoordReset(g: Gebruiker) {
    setWwResetTarget(g);
    setWwResetMethode("link");
    setWwResetMfa(false);
    setWwResetResultaat(null);
  }

  async function verstuurWachtwoordReset() {
    if (!wwResetTarget) return;
    try {
      const res: any = await wachtwoordResetten.mutateAsync({
        id: wwResetTarget.id,
        data: { methode: wwResetMethode, mfa_resetten: wwResetMfa },
      });
      await invalideer();
      if (wwResetMethode === "tijdelijk") {
        setWwResetResultaat({ tijdelijk_wachtwoord: res?.tijdelijk_wachtwoord ?? undefined });
      } else {
        setWwResetResultaat({ resetlink_verstuurd: res?.resetlink_verstuurd ?? true });
        toast({
          title: "Resetlink verstuurd",
          description: `Een resetlink is verzonden naar ${wwResetTarget.email ?? wwResetTarget.naam ?? "de gebruiker"}.`,
        });
        setWwResetTarget(null);
      }
    } catch (err: unknown) {
      const bericht =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Probeer het later opnieuw.";
      toast({ title: "Wachtwoord resetten mislukt", description: bericht, variant: "destructive" });
    }
  }

  async function bevestigSessiesBeeindigen() {
    if (!sessiesTarget) return;
    try {
      const res: any = await sessiesBeeindigen.mutateAsync({ id: sessiesTarget.id });
      const aantal = typeof res?.sessies_beeindigd === "number" ? res.sessies_beeindigd : 0;
      toast({
        title: "Sessies beëindigd",
        description: aantal === 0
          ? `${sessiesTarget.naam ?? "De gebruiker"} had geen actieve sessies.`
          : `${aantal} actieve sessie${aantal === 1 ? "" : "s"} van ${sessiesTarget.naam ?? "de gebruiker"} beëindigd.`,
      });
    } catch {
      toast({ title: "Sessies beëindigen mislukt", description: "Probeer het later opnieuw.", variant: "destructive" });
    } finally {
      setSessiesTarget(null);
    }
  }

  async function ontgrendelGebruiker(g: Gebruiker) {
    try {
      await ontgrendelenMutatie.mutateAsync({ id: g.id });
      await invalideer();
      toast({ title: "Account ontgrendeld", description: `${g.naam ?? "De gebruiker"} kan weer inloggen.` });
    } catch {
      toast({ title: "Ontgrendelen mislukt", description: "Probeer het later opnieuw.", variant: "destructive" });
    }
  }

  async function bevestigVolledigeHerstart() {
    if (!herstartTarget || !herstartPreview) return;
    setHerstartFout(null);
    try {
      const resultaat = await herstartMutatie.mutateAsync({
        id: herstartTarget.adviseurId,
        data: {
          bevestiging: herstartBevestiging,
          impact_token: herstartPreview.impact_token,
        },
      });
      await Promise.all([
        invalideer(),
        queryClient.invalidateQueries({ queryKey: getListExterneAdviseursQueryKey() }),
      ]);
      toast({
        title: "Onboarding kan opnieuw beginnen",
        description: `${resultaat.vrijgegeven_email} kan nu opnieuw worden uitgenodigd.`,
      });
      setHerstartTarget(null);
      setHerstartBevestiging("");
    } catch (err: unknown) {
      const bericht =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "De herstart is niet uitgevoerd.";
      setHerstartFout(bericht);
    }
  }

  // Interne FPS-gebruikers (staf).
  const internBron = useMemo(
    () => ((gebruikers ?? []) as Gebruiker[]).filter(
      (g) => (toonGearchiveerd || !g.gearchiveerd),
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
  const functieGroepen = useMemo(
    () =>
      Object.keys(groepCounts)
        .filter((naam) => isHoofd || naam !== "Hoofdbeheerder")
        .sort((a, b) => a.localeCompare(b, "nl"))
        .map((naam) => ({
          naam,
          icon: naam === "Hoofdbeheerder" ? Crown : User,
          kleur: naam === "Hoofdbeheerder" ? "text-amber-600" : "text-primary",
        })),
    [groepCounts, isHoofd],
  );

  const groepGefilterd = useMemo(() => {
    return internBron.filter((g: any) => {
      if (filterGroep && groepVanGebruiker(g as Gebruiker) !== filterGroep) return false;
      const term = zoek.trim().toLowerCase();
      if (!term) return true;
      return (
        (g.naam ?? "").toLowerCase().includes(term) ||
        (g.email ?? "").toLowerCase().includes(term) ||
        (g.functietitels ?? []).some((f: string) => f.toLowerCase().includes(term))
      );
    }) as Gebruiker[];
  }, [internBron, filterGroep, zoek]);

  const totaalGevonden = groepGefilterd.length;
  const adviseurPerGebruiker = useMemo(
    () => new Map((externeAdviseurs ?? []).map((a) => [a.gebruiker_id, a.id])),
    [externeAdviseurs],
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

  // Gedeelde gebruikerskaart voor de interne gebruikers (bekijken,
  // bewerken, verwijderen, uitnodigen).
  function gebruikerKaart(g: Gebruiker) {
    const status = (g.uitnodiging_status ?? "niet_uitgenodigd") as keyof typeof UITNODIGING_STATUS_CONFIG;
    const statusCfg = UITNODIGING_STATUS_CONFIG[status] ?? UITNODIGING_STATUS_CONFIG.niet_uitgenodigd;
    const groep = groepVanGebruiker(g);
    const groepCfg = functieGroepen.find((gr) => gr.naam === groep);
    const GroepIcon = groepCfg?.icon ?? User;
    const vergrendeld = !!g.vergrendeld_tot && new Date(g.vergrendeld_tot).getTime() > Date.now();

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
                  {isHoofd && !g.gearchiveerd && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" title="Acties">
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openWachtwoordReset(g)}>
                          <KeyRound className="h-3.5 w-3.5 mr-2" /> Wachtwoord resetten
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSessiesTarget(g)}>
                          <LogOut className="h-3.5 w-3.5 mr-2" /> Sessies beëindigen
                        </DropdownMenuItem>
                        {g.rol !== "hoofdbeheerder" && adviseurPerGebruiker.has(g.id) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                setHerstartTarget({ gebruiker: g, adviseurId: adviseurPerGebruiker.get(g.id)! });
                                setHerstartBevestiging("");
                                setHerstartFout(null);
                              }}
                            >
                              <UserRoundX className="h-3.5 w-3.5 mr-2" />
                              Onboarding volledig opnieuw beginnen
                            </DropdownMenuItem>
                          </>
                        )}
                        {vergrendeld && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => ontgrendelGebruiker(g)}>
                              <Unlock className="h-3.5 w-3.5 mr-2" /> Account ontgrendelen
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
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

              {/* GEBRUIKERS_01 v2: geen legacy auto-profielkoppeling-badge meer;
                  functietitel staat al in de groepsindeling. */}
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
                {vergrendeld && (
                  <Badge variant="outline" className="text-xs h-5 px-1.5 bg-red-100 text-red-800 border-red-200">
                    <Lock className="h-3 w-3 mr-1" /> Vergrendeld
                  </Badge>
                )}
                {!vergrendeld && g.moet_wachtwoord_wijzigen && (
                  <Badge variant="outline" className="text-xs h-5 px-1.5 bg-amber-50 text-amber-700 border-amber-200">
                    Wachtwoord wijzigen vereist
                  </Badge>
                )}
              </div>

              {isHoofd && (
                <button
                  type="button"
                  className={`mt-2 h-7 text-xs w-full gap-1.5 font-medium rounded-md flex items-center justify-center px-2 transition-colors ${
                    status === "niet_uitgenodigd"
                      ? "bg-amber-500 hover:bg-amber-600 text-white"
                      : status === "geaccepteerd"
                      ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300"
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
                    : status === "geaccepteerd"
                    ? "Opnieuw uitnodigen"
                    : "Uitnodigen"}
                </button>
              )}
              {isHoofd && !g.gearchiveerd && (
                <button
                  type="button"
                  className="mt-1.5 h-7 text-xs w-full gap-1.5 font-medium rounded-md flex items-center justify-center px-2 transition-colors bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 disabled:opacity-60"
                  disabled={activatielinkBezig === g.id}
                  onClick={() => kopieerActivatielink(g)}
                >
                  <Link2 className="h-3 w-3 mr-1 flex-shrink-0" />
                  {activatielinkBezig === g.id ? "Bezig..." : "Activatielink kopiëren"}
                </button>
              )}
              {isHoofd && !g.gearchiveerd && (
                <button
                  type="button"
                  className="mt-1.5 h-7 text-xs w-full gap-1.5 font-medium rounded-md flex items-center justify-center px-2 transition-colors bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200"
                  onClick={() => setAppQrGebruiker(g)}
                >
                  <QrCode className="h-3 w-3 mr-1 flex-shrink-0" />
                  App QR-code
                </button>
              )}
              {isHoofd && !g.gearchiveerd && (
                <button
                  type="button"
                  className="mt-1.5 h-7 text-xs w-full gap-1.5 font-medium rounded-md flex items-center justify-center px-2 transition-colors bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200"
                  onClick={kopieerInstallatielink}
                >
                  <Link2 className="h-3 w-3 mr-1 flex-shrink-0" />
                  App-installatielink kopiëren
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
      {isHoofd && mailStatus && !mailStatus.geconfigureerd && (
        <div className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">E-mailservice niet geconfigureerd.</span>{" "}
            Uitnodigingen kunnen niet worden verstuurd totdat dit is opgelost.
            {mailStatus.ontbrekende_secrets.length > 0 && (
              <> Ontbreekt: {mailStatus.ontbrekende_secrets.join(", ")}.</>
            )}{" "}
            Zie <Link href="/beheer/mail" className="underline font-medium">Beheer &rsaquo; Mail</Link>.
          </div>
        </div>
      )}
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
          {isHoofd && gebruikersMetOntbrekend > 0 && (
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
          <Button onClick={() => { setToevoegenStap(1); setToevoegenOpen(true); setToevoegenForm(leegForm); setToevoegenFout(null); }}>
            <Plus className="h-4 w-4 mr-2" /> Gebruiker toevoegen
          </Button>
        </div>
      </div>

      {/* GEBRUIKERS_01 v2: geen Functies-tab meer op de gebruikerspagina.
          Functiebeheer gebeurt uitsluitend in het Functiehuis (Personeel › Functies). */}
      <div className="space-y-4 mt-4">
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

          {/* Functiegroep-tegels */}
          {!isLoading && (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {functieGroepen.map((gr) => {
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
      </div>

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
                Kies het accounttype voor de nieuwe gebruiker. De functie en bijbehorende bevoegdheden worden
                daarna via een HRM-aanstelling in Personeel gekoppeld.
              </p>
              {/* GEBRUIKERS_01 v2: create-account maakt geen HRM-aanstelling.
                  Toon daarom enkel accounttype (Gebruiker + optioneel Hoofdbeheerder);
                  functie/rechten volgen via Personeel › Aanstelling. */}
              <div className="grid grid-cols-1 gap-2 pt-1">
                <button
                  key="__gebruiker__"
                  type="button"
                  onClick={() => {
                    setToevoegenForm((f) => ({ ...f, rol: "gebruiker" }));
                    setToevoegenStap(2);
                  }}
                  className="flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5 text-left hover:bg-muted/50 hover:border-primary/30 hover:shadow-sm transition-all"
                >
                  <ShieldCheck className="h-4 w-4 flex-shrink-0 text-primary" />
                  <div>
                    <div className="text-sm font-medium leading-tight">Gebruiker</div>
                    <div className="text-xs text-muted-foreground leading-tight">
                      Toegang via bevoegdheden — functie wordt via aanstelling gekoppeld
                    </div>
                  </div>
                </button>
                {isHoofd && (
                  <button
                    key="__hoofdbeheerder__"
                    type="button"
                    onClick={() => {
                      setToevoegenForm((f) => ({ ...f, rol: "hoofdbeheerder" }));
                      setToevoegenStap(2);
                    }}
                    className="flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5 text-left hover:bg-muted/50 hover:border-primary/30 hover:shadow-sm transition-all"
                  >
                    <Crown className="h-4 w-4 flex-shrink-0 text-amber-600" />
                    <div>
                      <div className="text-sm font-medium leading-tight">Hoofdbeheerder</div>
                      <div className="text-xs text-muted-foreground leading-tight">Volledig beheer — alle rechten</div>
                    </div>
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground pt-1 border-t">
                De functie en bevoegdheden worden toegekend via een HRM-aanstelling in Personeel.
                Koppel de medewerker na aanmaken aan de juiste functie via het aanstellingscherm.
              </p>
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
          {/* GEBRUIKERS_01 v2: bewerk-dialoog — basisgegevens, geen profielkoppeling hier */}
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

      <Dialog
        open={!!herstartTarget}
        onOpenChange={(open) => {
          if (!open && !herstartMutatie.isPending) {
            setHerstartTarget(null);
            setHerstartBevestiging("");
            setHerstartFout(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserRoundX className="h-5 w-5 text-destructive" />
              Onboarding volledig opnieuw beginnen
            </DialogTitle>
            <DialogDescription>
              Connect berekent eerst wat bij <strong>{herstartTarget?.gebruiker.naam}</strong> wordt verwijderd,
              afgeschermd of behouden. De actie kan niet ongedaan worden gemaakt.
            </DialogDescription>
          </DialogHeader>

          {herstartPreviewLaadt && (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Impact controleren…
            </div>
          )}

          {herstartPreviewFout && (
            <Foutmelding tekst={herstartPreviewFout.message || "De impact kon niet worden berekend."} />
          )}

          {herstartPreview && (
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {herstartPreview.impact.map((regel, index) => (
                  <div key={`${regel.categorie}-${regel.label}-${index}`} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium">{regel.label}</div>
                      <Badge variant={regel.categorie === "behouden" ? "secondary" : "outline"}>
                        {regel.aantal}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                      {regel.categorie}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{regel.toelichting}</p>
                  </div>
                ))}
              </div>

              {herstartPreview.blokkades.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-3">
                  <div className="flex items-center gap-2 font-medium text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    Eerst verantwoordelijkheden overdragen
                  </div>
                  {herstartPreview.blokkades.map((blokkade) => (
                    <div key={blokkade.code} className="text-sm">
                      <div className="font-medium">{blokkade.omschrijving} ({blokkade.aantal})</div>
                      <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                        {blokkade.voorbeelden.map((voorbeeld) => <li key={voorbeeld}>{voorbeeld}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {herstartPreview.uitvoerbaar && (
                <div className="space-y-2 rounded-md border border-destructive/30 p-3">
                  <Label htmlFor="adviseur-herstart-bevestiging">
                    Typ exact <span className="font-mono font-semibold">{herstartPreview.bevestigingstekst}</span>
                  </Label>
                  <Input
                    id="adviseur-herstart-bevestiging"
                    autoComplete="off"
                    value={herstartBevestiging}
                    onChange={(event) => setHerstartBevestiging(event.target.value)}
                  />
                </div>
              )}
              {herstartFout && <Foutmelding tekst={herstartFout} />}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setHerstartTarget(null)}
              disabled={herstartMutatie.isPending}
            >
              Annuleren
            </Button>
            <Button
              variant="destructive"
              onClick={bevestigVolledigeHerstart}
              disabled={
                !herstartPreview?.uitvoerbaar ||
                herstartBevestiging !== herstartPreview.bevestigingstekst ||
                herstartMutatie.isPending
              }
            >
              {herstartMutatie.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Bezig…</>
              ) : "Volledig opnieuw beginnen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: sessies beëindigen */}
      <AlertDialog open={!!sessiesTarget} onOpenChange={(o) => { if (!o) setSessiesTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sessies beëindigen?</AlertDialogTitle>
            <AlertDialogDescription>
              Alle actieve sessies (web) en mobiele apparaten van <strong>{sessiesTarget?.naam}</strong> worden
              direct uitgelogd. Het wachtwoord blijft ongewijzigd; de gebruiker moet opnieuw inloggen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); bevestigSessiesBeeindigen(); }} disabled={sessiesBeeindigen.isPending}>
              {sessiesBeeindigen.isPending ? "Bezig..." : "Sessies beëindigen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* GEBRUIKERS_01 v2: Afwijkingen wissen — terugzetten naar functie-baseline (reden verplicht) */}
      <Dialog
        open={!!herkomstToepassenTarget}
        onOpenChange={(o) => { if (!o) { setHerkomstToepassenTarget(null); setHerkomstToepassenReden(""); } }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Afwijkingen wissen?
            </DialogTitle>
            <DialogDescription>
              De persoonlijke bevoegdheidafwijkingen van <strong>{herkomstToepassenTarget?.naam}</strong> worden gewist
              en de rechten vallen terug op de functie-baseline. Geef een reden op — dit wordt gelogd.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="herkomst-toepassen-reden">Reden voor terugzetten *</Label>
            <Textarea
              id="herkomst-toepassen-reden"
              value={herkomstToepassenReden}
              onChange={(e) => setHerkomstToepassenReden(e.target.value)}
              placeholder="bijv. functieprofiel is gewijzigd, persoonlijke rechten niet meer van toepassing"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setHerkomstToepassenTarget(null); setHerkomstToepassenReden(""); }}
            >
              Annuleren
            </Button>
            <Button
              variant="destructive"
              disabled={!herkomstToepassenReden.trim() || herkomstBezig === herkomstToepassenTarget?.id}
              onClick={() => {
                if (herkomstToepassenTarget) resetNaarFunctieRechten(herkomstToepassenTarget, herkomstToepassenReden);
                setHerkomstToepassenTarget(null);
                setHerkomstToepassenReden("");
              }}
            >
              {herkomstBezig === herkomstToepassenTarget?.id ? "Bezig..." : "Afwijkingen wissen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* GEBRUIKERS_01 v2: Afwijkingen bewerken dialoog */}
      <Dialog
        open={afwijkingenBewerkenOpen && !!bekijkGebruiker}
        onOpenChange={(o) => { if (!o) setAfwijkingenBewerkenOpen(false); }}
      >
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Afwijkingen bewerken — {bekijkGebruiker?.naam}</DialogTitle>
            <DialogDescription>
              Stel per module een afwijkend niveau in ten opzichte van de functie-baseline.
              Modules die op het baseline-niveau staan krijgen geen afwijking.
              Reden is verplicht en wordt gelogd.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="rounded-md border divide-y text-sm max-h-72 overflow-y-auto">
              {MODULES.map((mod) => {
                const basisN = bekijkBevoegdhedenV2?.functie_baseline?.[mod.id] ?? 0;
                const huidig = afwijkingenEditMap[mod.id] ?? basisN;
                const isAfwijkend = huidig !== basisN;
                return (
                  <div key={mod.id} className={`flex items-center gap-2 px-3 py-1.5 ${isAfwijkend ? "bg-amber-50/50" : ""}`}>
                    <span className="flex-1 truncate text-xs">
                      {mod.label}
                      {isAfwijkend && <span className="ml-1 text-amber-600 text-xs">(⚡ afwijkt van baseline: {niveauLabel(basisN)})</span>}
                    </span>
                    <Select
                      value={String(huidig)}
                      onValueChange={(v) => setAfwijkingenEditMap((prev) => ({ ...prev, [mod.id]: Number(v) }))}
                    >
                      <SelectTrigger className="w-32 h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NIVEAUS.map((n) => (
                          <SelectItem key={n.waarde} value={String(n.waarde)} className="text-xs">
                            {n.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="afwijkingen-reden">Reden *</Label>
              <Textarea
                id="afwijkingen-reden"
                value={afwijkingenEditReden}
                onChange={(e) => setAfwijkingenEditReden(e.target.value)}
                placeholder="Waarom wijken deze rechten af? Dit wordt gelogd in de audittrail."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAfwijkingenBewerkenOpen(false)}>Annuleren</Button>
            <Button
              disabled={!afwijkingenEditReden.trim() || vervangAfwijkingenMut.isPending}
              onClick={async () => {
                if (!bekijkGebruiker) return;
                const baseline = bekijkBevoegdhedenV2?.functie_baseline ?? {};
                // Alleen afwijkende modules meesturen
                const afwijkingen = MODULES
                  .filter((m) => (afwijkingenEditMap[m.id] ?? baseline[m.id] ?? 0) !== (baseline[m.id] ?? 0))
                  .map((m) => ({ module_id: m.id, niveau: afwijkingenEditMap[m.id] ?? (baseline[m.id] ?? 0) }));
                try {
                  await vervangAfwijkingenMut.mutateAsync({
                    id: bekijkGebruiker.id,
                    data: { afwijkingen, reden: afwijkingenEditReden.trim() },
                  });
                  await queryClient.invalidateQueries({ queryKey: getGetGebruikerBevoegdhedenV2QueryKey(bekijkGebruiker.id) });
                  setAfwijkingenBewerkenOpen(false);
                  toast({ title: "Afwijkingen opgeslagen" });
                } catch {
                  toast({ title: "Opslaan mislukt", variant: "destructive" });
                }
              }}
            >
              {vervangAfwijkingenMut.isPending ? "Bezig…" : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialoog: wachtwoord resetten */}
      <Dialog open={!!wwResetTarget} onOpenChange={(o) => { if (!o) setWwResetTarget(null); }}>
        <DialogContent className="max-w-md" aria-describedby="ww-reset-beschr">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> Wachtwoord resetten
            </DialogTitle>
          </DialogHeader>
          <p id="ww-reset-beschr" className="sr-only">
            Reset het wachtwoord van {wwResetTarget?.naam} via een resetlink of een tijdelijk wachtwoord.
          </p>

          {wwResetResultaat?.tijdelijk_wachtwoord ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Geef dit eenmalige tijdelijke wachtwoord door aan <strong>{wwResetTarget?.naam}</strong>.
                Het wordt niet nogmaals getoond en moet bij de eerstvolgende login gewijzigd worden.
              </p>
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3">
                <code className="flex-1 font-mono text-sm break-all">{wwResetResultaat.tijdelijk_wachtwoord}</code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0"
                  title="Kopiëren"
                  onClick={() => {
                    navigator.clipboard?.writeText(wwResetResultaat.tijdelijk_wachtwoord ?? "");
                    toast({ title: "Gekopieerd naar klembord" });
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <DialogFooter>
                <Button type="button" onClick={() => setWwResetTarget(null)}>Sluiten</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Kies hoe <strong>{wwResetTarget?.naam}</strong> een nieuw wachtwoord instelt. Bestaande sessies
                en mobiele apparaten worden hierbij automatisch uitgelogd en de gebruiker moet bij de
                eerstvolgende login direct een nieuw wachtwoord kiezen.
              </p>
              <RadioGroup value={wwResetMethode} onValueChange={(v) => setWwResetMethode(v as "link" | "tijdelijk")}>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="link" id="ww-methode-link" className="mt-0.5" />
                  <Label htmlFor="ww-methode-link" className="font-normal">
                    <div className="font-medium">Resetlink versturen</div>
                    <div className="text-xs text-muted-foreground">Verstuurt een e-mail met een resetlink naar {wwResetTarget?.email}.</div>
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="tijdelijk" id="ww-methode-tijdelijk" className="mt-0.5" />
                  <Label htmlFor="ww-methode-tijdelijk" className="font-normal">
                    <div className="font-medium">Tijdelijk wachtwoord genereren</div>
                    <div className="text-xs text-muted-foreground">Toont eenmalig een tijdelijk wachtwoord dat u zelf doorgeeft.</div>
                  </Label>
                </div>
              </RadioGroup>
              <div className="flex items-start gap-2 pt-1">
                <Checkbox
                  id="ww-mfa-resetten"
                  checked={wwResetMfa}
                  onCheckedChange={(c) => setWwResetMfa(c === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="ww-mfa-resetten" className="font-normal">
                  <div className="font-medium">Ook tweestapsverificatie opnieuw laten instellen</div>
                  <div className="text-xs text-muted-foreground">Nuttig bij verlies van de authenticator-app.</div>
                </Label>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setWwResetTarget(null)}>Annuleren</Button>
                <Button type="button" onClick={verstuurWachtwoordReset} disabled={wachtwoordResetten.isPending}>
                  {wachtwoordResetten.isPending ? "Bezig..." : "Resetten"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialoog: App QR-code voor Expo Go */}
      <Dialog open={!!appQrGebruiker} onOpenChange={(o) => { if (!o) { setAppQrGebruiker(null); setAppQrFout(false); } }}>
        <DialogContent className="max-w-sm" aria-describedby="app-qr-beschr">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" /> FPS Monteur-app installeren
            </DialogTitle>
          </DialogHeader>
          <p id="app-qr-beschr" className="sr-only">
            QR-code om de FPS Monteur-app te installeren op een telefoon.
          </p>
          {appQrFout ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground" data-testid="text-app-qr-onbeschikbaar">
                Er is nog geen installatielink voor de monteur-app beschikbaar in deze omgeving.
                Zodra de app in de App Store gepubliceerd is en de installatielink is ingesteld,
                verschijnt hier automatisch een scanbare QR-code.
              </p>
              <DialogFooter>
                <Button variant="ghost" size="sm" onClick={() => { setAppQrGebruiker(null); setAppQrFout(false); }}>
                  Sluiten
                </Button>
              </DialogFooter>
            </div>
          ) : (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Laat <strong>{appQrGebruiker?.naam}</strong> deze code scannen met de camera van de
              telefoon om de FPS Monteur-app te openen.
            </p>
            {appStoreInfo?.store_url && appStoreInfo?.play_store_url ? (
              <div className="flex justify-center gap-4">
                <div className="flex flex-col items-center gap-1.5">
                  <img
                    src="/api/auth/app-qr?platform=ios"
                    alt="QR-code FPS Monteur-app voor iPhone (App Store)"
                    className="rounded-lg border border-border shadow-sm"
                    width={150}
                    height={150}
                    data-testid="img-app-qr-ios"
                    onError={() => setAppQrFout(true)}
                  />
                  <span className="text-xs font-medium text-muted-foreground">iPhone (App Store)</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <img
                    src="/api/auth/app-qr?platform=android"
                    alt="QR-code FPS Monteur-app voor Android (Google Play)"
                    className="rounded-lg border border-border shadow-sm"
                    width={150}
                    height={150}
                    data-testid="img-app-qr-android"
                    onError={() => setAppQrFout(true)}
                  />
                  <span className="text-xs font-medium text-muted-foreground">Android (Google Play)</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <img
                  src={appStoreInfo?.play_store_url ? "/api/auth/app-qr?platform=android" : "/api/auth/app-qr"}
                  alt="QR-code FPS Monteur-app"
                  className="rounded-lg border border-border shadow-sm"
                  width={240}
                  height={240}
                  data-testid="img-app-qr"
                  onError={() => setAppQrFout(true)}
                />
                {appStoreInfo?.store_url ? (
                  <span className="text-xs font-medium text-muted-foreground">iPhone (App Store)</span>
                ) : appStoreInfo?.play_store_url ? (
                  <span className="text-xs font-medium text-muted-foreground">Android (Google Play)</span>
                ) : null}
              </div>
            )}
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Scan bovenstaande code met de camera van de telefoon</li>
              <li>Volg de link om de app te openen of te installeren</li>
              <li>Log in met het e-mailadres <strong>{appQrGebruiker?.email}</strong></li>
            </ol>
            <p className="text-xs text-muted-foreground">
              Kan de medewerker niet scannen? Kopieer de installatielink en stuur hem via WhatsApp:
            </p>
            <Button variant="outline" size="sm" className="w-full" onClick={kopieerInstallatielink}>
              <Link2 className="h-4 w-4 mr-1.5" /> Installatielink kopiëren
            </Button>
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const antwoord = await fetch("/api/auth/app-qr", { credentials: "include" });
                    if (!antwoord.ok) throw new Error(`status ${antwoord.status}`);
                    const blob = await antwoord.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `fps-app-qr-${appQrGebruiker?.naam?.toLowerCase().replace(/\s+/g, "-") ?? "code"}.png`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch {
                    toast({
                      title: "Downloaden mislukt",
                      description: "Er is nog geen installatielink beschikbaar in deze omgeving.",
                      variant: "destructive",
                    });
                  }
                }}
              >
                <Download className="h-4 w-4 mr-1.5" /> Downloaden
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setAppQrGebruiker(null); setAppQrFout(false); }}>
                Sluiten
              </Button>
            </DialogFooter>
          </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialoog: activatielink */}
      <Dialog open={!!activatielinkResultaat} onOpenChange={(o) => { if (!o) setActivatielinkResultaat(null); }}>
        <DialogContent className="max-w-sm" aria-describedby="activatielink-beschr">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              Activatielink gegenereerd
            </DialogTitle>
          </DialogHeader>
          <p id="activatielink-beschr" className="text-sm text-muted-foreground">
            Deel deze link handmatig met de medewerker. De link is 7 dagen geldig.
          </p>
          <div className="flex items-center gap-2 rounded-md border bg-slate-50 px-3 py-2">
            <span className="flex-1 text-xs break-all font-mono text-slate-700 select-all">
              {activatielinkResultaat?.link}
            </span>
            <button
              type="button"
              className="shrink-0 text-slate-500 hover:text-slate-800 transition-colors"
              onClick={() => {
                if (activatielinkResultaat?.link) {
                  navigator.clipboard.writeText(activatielinkResultaat.link);
                  toast({ title: "Gekopieerd", description: "De activatielink staat in het klembord." });
                }
              }}
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <DialogFooter>
            <Button variant="default" onClick={() => {
              if (activatielinkResultaat?.link) {
                navigator.clipboard.writeText(activatielinkResultaat.link);
                toast({ title: "Gekopieerd", description: "De activatielink staat in het klembord." });
              }
              setActivatielinkResultaat(null);
            }}>
              <Copy className="h-4 w-4 mr-1.5" /> Kopieer en sluiten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            const groepCfg = functieGroepen.find((gr) => gr.naam === groep);
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

                {/* GEBRUIKERS_01 v2: baseline / afwijkingen / effectief per module */}
                {(() => {
                  const bev = bekijkBevoegdhedenV2;
                  const baseline = bev?.functie_baseline ?? {};
                  const effectief = bev?.effectieve_bevoegdheden ?? {};
                  const afwijkingen = bev?.afwijkingen ?? [];
                  const afwijkMap = new Map(afwijkingen.map((a) => [a.module_id, a]));
                  const actieveMods = MODULES.filter((m) => (effectief[m.id] ?? 0) > 0 || (baseline[m.id] ?? 0) > 0);
                  const heeftAfwijkingen = afwijkingen.length > 0;
                  return (
                    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="text-sm font-medium">Bevoegdheden</div>
                        </div>
                        {isHoofd && (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline" size="sm" className="h-6 px-2 text-xs gap-1"
                              onClick={() => {
                                setAfwijkingenEditMap({ ...effectief });
                                setAfwijkingenEditReden("");
                                setAfwijkingenBewerkenOpen(true);
                              }}
                            >
                              <Pencil className="h-3 w-3" /> Afwijkingen bewerken
                            </Button>
                            {heeftAfwijkingen && (
                              <Button
                                variant="outline" size="sm" className="h-6 px-2 text-xs gap-1 border-amber-200 text-amber-700 hover:bg-amber-50"
                                disabled={herkomstBezig === bekijkGebruiker.id}
                                onClick={() => setHerkomstToepassenTarget(bekijkGebruiker)}
                              >
                                <RotateCcw className="h-3 w-3" /> Terug naar baseline
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                      {!bev ? (
                        <p className="text-xs text-muted-foreground">Bevoegdheden laden…</p>
                      ) : actieveMods.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Geen bevoegdheden ingesteld.</p>
                      ) : (
                        <>
                          <div className="grid grid-cols-[1fr_4.5rem_4.5rem_4.5rem] gap-1 text-xs text-muted-foreground border-b pb-1 px-1">
                            <span>Module</span>
                            <span className="text-center">Baseline</span>
                            <span className="text-center">Afwijking</span>
                            <span className="text-center font-medium text-foreground">Effectief</span>
                          </div>
                          <div className="divide-y divide-border/40">
                            {actieveMods.map((m) => {
                              const basisN = baseline[m.id] ?? 0;
                              const effN = effectief[m.id] ?? 0;
                              const afw = afwijkMap.get(m.id);
                              const heeftAfw = afw != null;
                              return (
                                <div key={m.id} className={`grid grid-cols-[1fr_4.5rem_4.5rem_4.5rem] gap-1 items-center py-1 px-1 text-xs ${heeftAfw ? "bg-amber-50/50 -mx-1 px-2" : ""}`}>
                                  <div className="flex items-center gap-1 min-w-0">
                                    {heeftAfw && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
                                    <span className="truncate">{m.label}</span>
                                  </div>
                                  <span className="text-center text-muted-foreground">{niveauLabel(basisN)}</span>
                                  <span className="text-center">
                                    {heeftAfw ? (
                                      <span className="font-medium text-amber-700">{niveauLabel(afw.niveau)}</span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </span>
                                  <span className={`text-center font-semibold ${effN > basisN ? "text-green-700" : effN < basisN ? "text-red-600" : ""}`}>
                                    {niveauLabel(effN)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          {heeftAfwijkingen && (
                            <div className="space-y-1 pt-1 border-t">
                              <p className="text-xs font-medium text-amber-700">Actieve afwijkingen:</p>
                              {afwijkingen.map((a) => (
                                <div key={a.module_id} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                  <span className="font-medium text-foreground">{MODULES.find((m) => m.id === a.module_id)?.label ?? a.module_id}:</span>
                                  <span>{a.reden}</span>
                                  <span className="shrink-0 text-muted-foreground/60">— {a.actor_naam}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}

                {isHoofd && (
                  <button
                    type="button"
                    className={`h-9 text-sm w-full gap-1.5 font-medium rounded-md flex items-center justify-center px-3 transition-colors ${
                      status === "niet_uitgenodigd"
                        ? "bg-amber-500 hover:bg-amber-600 text-white"
                        : status === "geaccepteerd"
                        ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300"
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
                      : status === "geaccepteerd"
                      ? "Opnieuw uitnodigen"
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
            onValueChange={(v) => setForm((f) => ({ ...f, rol: v }))}
          >
            <SelectTrigger id="g-rol"><SelectValue /></SelectTrigger>
            <SelectContent>
              {toonHoofd && <SelectItem value="hoofdbeheerder">Hoofdbeheerder</SelectItem>}
              <SelectItem value="gebruiker">Gebruiker</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* GEBRUIKERS_01 v2: geen hardcoded projectfunctie-keuze meer.
          Functie(s) worden via een HRM-aanstelling in Personeel toegekend. */}
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex items-start gap-2">
        <Briefcase className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
        <span>
          De functie en bevoegdheden worden toegekend via een HRM-aanstelling in{" "}
          <a href="/personeel" className="underline">Personeel</a> — niet hier in het account.
        </span>
      </div>

      {form.rol === "gebruiker" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="g-dienstverband">Type personeel</Label>
            <Select
              value={form.dienstverband}
              onValueChange={(v) => setForm((f) => ({
                ...f,
                dienstverband: v,
                bedrijf_uitzendbureau: (v === "uitzend" || v === "inhuur") ? f.bedrijf_uitzendbureau : "",
                uitzendbureau_id: (v === "uitzend" || v === "inhuur") ? f.uitzendbureau_id : null,
              }))}
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
            <UitzendbureauSelect
              idPrefix="g-bedrijf-uitzend"
              label={form.dienstverband === "uitzend" ? "Uitzendbureau" : "Bedrijf / onderaannemer"}
              uitzendbureauId={form.uitzendbureau_id}
              tekst={form.bedrijf_uitzendbureau}
              onChange={({ uitzendbureau_id, tekst }) =>
                setForm((f) => ({ ...f, uitzendbureau_id, bedrijf_uitzendbureau: tekst }))}
            />
          )}
        </div>
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
