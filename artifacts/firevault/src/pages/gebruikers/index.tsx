import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  useListGebruikers,
  useCreateGebruiker,
  useUpdateGebruiker,
  useDeleteGebruiker,
  useUitnodigingVersturen,
  useUitnodigingOpnieuwVersturen,
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
import { Switch } from "@/components/ui/switch";
import {
  Mail, Phone, Building, Clock, Plus, UserPlus, Pencil, Trash2,
  RefreshCw, ShieldCheck, Wrench, Eye, User, Crown, Upload, Palette, SendHorizonal,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRol } from "@/context/rol-context";

const ROLLEN = ["hoofdbeheerder", "beheerder", "monteur", "controleur", "klant"] as const;
type Rol = typeof ROLLEN[number];

const FUNCTIETITELS = [
  "Projectleider",
  "Werkvoorbereider",
  "Calculator",
  "Uitvoerder",
  "Hoofduitvoerder",
  "Bedrijfsleider",
  "Monteur",
  "Inspecteur",
] as const;
const GEEN_FUNCTIE = "geen";

const ROL_CONFIG: Record<Rol, {
  label: string;
  icon: React.ElementType;
  kleur: string;
  badge: string;
  rand: string;
  beschrijving: string;
}> = {
  hoofdbeheerder: {
    label: "Hoofdbeheerders",
    icon: Crown,
    kleur: "text-amber-600",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    rand: "border-t-amber-500",
    beschrijving: "Volledig beheer — alle rechten",
  },
  beheerder: {
    label: "Beheerders",
    icon: ShieldCheck,
    kleur: "text-primary",
    badge: "bg-primary/10 text-primary border-primary/20",
    rand: "border-t-primary",
    beschrijving: "Volledige toegang",
  },
  monteur: {
    label: "Monteurs",
    icon: Wrench,
    kleur: "text-blue-600",
    badge: "bg-blue-100 text-blue-800 border-blue-200",
    rand: "border-t-blue-500",
    beschrijving: "Onderhoud & werkorders",
  },
  controleur: {
    label: "Controleurs",
    icon: Eye,
    kleur: "text-purple-600",
    badge: "bg-purple-100 text-purple-800 border-purple-200",
    rand: "border-t-purple-500",
    beschrijving: "Inspectie & controle",
  },
  klant: {
    label: "Klanten",
    icon: User,
    kleur: "text-gray-600",
    badge: "bg-gray-100 text-gray-700 border-gray-200",
    rand: "border-t-gray-400",
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
  naam: "", email: "", rol: "monteur", functietitel: "",
  telefoon: "", bedrijf: "", wachtwoord: "", actief: true,
  avatar_url: "", bedrijfslogo_url: "", bedrijfskleuren: "",
};
type GebruikerForm = typeof leegForm;

type Gebruiker = {
  id: number;
  naam: string | null;
  email: string | null;
  rol: string | null;
  functietitel?: string | null;
  telefoon: string | null;
  bedrijf: string | null;
  actief: boolean | null;
  laatste_online?: string | null;
  avatar_url?: string | null;
  bedrijfslogo_url?: string | null;
  bedrijfskleuren?: string | null;
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

  const { data: gebruikers, isLoading, refetch, isFetching } = useListGebruikers();
  const maakGebruiker      = useCreateGebruiker();
  const werkBijGebruiker   = useUpdateGebruiker();
  const verwijderGebruiker = useDeleteGebruiker();
  const uitnodigingVersturen = useUitnodigingVersturen();
  const uitnodigingOpnieuwVersturen = useUitnodigingOpnieuwVersturen();

  const [toevoegenOpen, setToevoegenOpen]     = useState(false);
  const [toevoegenForm, setToevoegenForm]     = useState<GebruikerForm>(leegForm);
  const [toevoegenFout, setToevoegenFout]     = useState<string | null>(null);

  const [bewerkGebruiker, setBewerkGebruiker] = useState<Gebruiker | null>(null);
  const [bewerkForm, setBewerkForm]           = useState<GebruikerForm>(leegForm);
  const [bewerkFout, setBewerkFout]           = useState<string | null>(null);

  const [verwijderTarget, setVerwijderTarget] = useState<Gebruiker | null>(null);
  const [bekijkGebruiker, setBekijkGebruiker] = useState<Gebruiker | null>(null);

  const [uitnodigingBezig, setUitnodigingBezig] = useState<number | null>(null);

  const invalideer = () => queryClient.invalidateQueries({ queryKey: getListGebruikersQueryKey() });

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
          naam:            toevoegenForm.naam.trim(),
          email:           toevoegenForm.email.trim(),
          rol:             toevoegenForm.rol as any,
          functietitel:    toevoegenForm.functietitel.trim() || undefined,
          telefoon:        toevoegenForm.telefoon.trim()     || undefined,
          bedrijf:         toevoegenForm.bedrijf.trim()      || undefined,
          wachtwoord:      toevoegenForm.wachtwoord.trim()   || undefined,
          avatar_url:      toevoegenForm.avatar_url          || undefined,
          bedrijfslogo_url: toevoegenForm.bedrijfslogo_url   || undefined,
          bedrijfskleuren: toevoegenForm.bedrijfskleuren     || undefined,
        },
      });
      await invalideer();
      setToevoegenOpen(false);
      setToevoegenForm(leegForm);
    } catch (err: any) {
      setToevoegenFout(err?.response?.data?.error ?? err?.message ?? "Onbekende fout");
    }
  }

  function openBewerken(g: Gebruiker) {
    setBewerkGebruiker(g);
    setBewerkForm({
      naam:            g.naam           ?? "",
      email:           g.email          ?? "",
      rol:             g.rol            ?? "monteur",
      functietitel:    g.functietitel   ?? "",
      telefoon:        g.telefoon       ?? "",
      bedrijf:         g.bedrijf        ?? "",
      wachtwoord:      "",
      actief:          g.actief         ?? true,
      avatar_url:      g.avatar_url     ?? "",
      bedrijfslogo_url: g.bedrijfslogo_url ?? "",
      bedrijfskleuren: g.bedrijfskleuren  ?? "",
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
          naam:            bewerkForm.naam.trim(),
          email:           bewerkForm.email.trim(),
          rol:             bewerkForm.rol as any,
          functietitel:    bewerkForm.functietitel.trim() || undefined,
          telefoon:        bewerkForm.telefoon.trim()    || undefined,
          bedrijf:         bewerkForm.bedrijf.trim()     || undefined,
          actief:          bewerkForm.actief,
          avatar_url:      bewerkForm.avatar_url         || undefined,
          bedrijfslogo_url: bewerkForm.bedrijfslogo_url  || undefined,
          bedrijfskleuren: bewerkForm.bedrijfskleuren    || undefined,
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

  async function stuurUitnodiging(g: Gebruiker) {
    const status = g.uitnodiging_status ?? "niet_uitgenodigd";
    setUitnodigingBezig(g.id);
    try {
      if (status === "uitgenodigd") {
        await uitnodigingOpnieuwVersturen.mutateAsync({ id: g.id });
      } else {
        await uitnodigingVersturen.mutateAsync({ id: g.id });
      }
      await invalideer();
    } catch {
      // stille fout — kaart toont nog steeds de status
    } finally {
      setUitnodigingBezig(null);
    }
  }

  const perRol = ROLLEN.reduce<Record<string, Gebruiker[]>>((acc, rol) => {
    acc[rol] = (gebruikers ?? []).filter((g) => g.rol === rol) as Gebruiker[];
    return acc;
  }, {} as Record<string, Gebruiker[]>);

  const zichtbareRollen = ROLLEN.filter((rol) => isHoofd || rol !== "hoofdbeheerder");
  const gridCols = zichtbareRollen.length === 5 ? "grid-cols-5" : "grid-cols-4";

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("gebruikers.titel")}</h1>
          <p className="text-muted-foreground mt-1">
            {t("gebruikers.ondertitel")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching} title="Vernieuwen">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => { setToevoegenOpen(true); setToevoegenForm(leegForm); setToevoegenFout(null); }}>
            <Plus className="h-4 w-4 mr-2" /> Gebruiker toevoegen
          </Button>
        </div>
      </div>

      {/* Kolommenraster */}
      {isLoading ? (
        <div className={`grid ${gridCols} gap-4`}>
          {zichtbareRollen.map((rol) => (
            <div key={rol} className="space-y-3">
              <div className="h-16 bg-muted animate-pulse rounded-lg" />
              {[1, 2].map((i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />)}
            </div>
          ))}
        </div>
      ) : (
        <div className={`grid ${gridCols} gap-4 items-start`}>
          {zichtbareRollen.map((rol) => {
            const cfg  = ROL_CONFIG[rol];
            const Icon = cfg.icon;
            const lijst = perRol[rol] ?? [];

            return (
              <div key={rol} className={`rounded-xl border bg-muted/40 ${cfg.rand} border-t-4 overflow-hidden`}>
                <div className="px-4 pt-3 pb-3 border-b bg-background/60">
                  <div className={`flex items-center gap-2 text-base font-semibold ${cfg.kleur}`}>
                    <Icon className="h-4 w-4" />
                    {cfg.label}
                    <span className="ml-auto text-lg font-bold">{lijst.length}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{cfg.beschrijving}</p>
                </div>

                <div className="p-3 space-y-3">
                  {lijst.length === 0 && (
                    <div className="text-center text-sm text-muted-foreground py-6 border border-dashed rounded-lg">
                      Geen {cfg.label.toLowerCase()}
                    </div>
                  )}

                  {lijst.map((g) => {
                    const status = (g.uitnodiging_status ?? "niet_uitgenodigd") as keyof typeof UITNODIGING_STATUS_CONFIG;
                    const statusCfg = UITNODIGING_STATUS_CONFIG[status] ?? UITNODIGING_STATUS_CONFIG.niet_uitgenodigd;
                    const heeftAfbeelding = !!g.avatar_url;

                    return (
                      <Card
                        key={g.id}
                        className={`hover:shadow-md transition-shadow ${statusCfg.balk}`}
                        style={statusCfg.kaartStyle}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-start gap-3">
                            <Avatar className="h-9 w-9 text-xs border-2 border-primary/10 flex-shrink-0 mt-0.5">
                              {heeftAfbeelding && <AvatarImage src={g.avatar_url!} alt={g.naam ?? ""} />}
                              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                                {initialen(g.naam ?? "")}
                              </AvatarFallback>
                            </Avatar>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-1">
                                <span className="font-semibold text-sm leading-tight truncate">{g.naam}</span>
                                <div className="flex gap-0.5 flex-shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-primary"
                                    onClick={() => setBekijkGebruiker(g)}
                                    title="Bekijken"
                                  >
                                    <Eye className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                    onClick={() => openBewerken(g)}
                                    title="Bewerken"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  {magVerwijderen && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                      onClick={() => setVerwijderTarget(g)}
                                      title="Verwijderen"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>

                              <div className="space-y-1 mt-1.5">
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
                                {g.bedrijf && (
                                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Building className="h-3 w-3 flex-shrink-0" />
                                    <span className="truncate">{g.bedrijf}</span>
                                  </div>
                                )}
                                <div className={`flex items-center gap-1.5 text-xs ${onlinKleur(g.laatste_online)} pt-0.5 border-t border-border/50 mt-1.5`}>
                                  <Clock className="h-3 w-3 flex-shrink-0" />
                                  <span>{relatiefTijdstip(g.laatste_online)}</span>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                {!g.actief && (
                                  <Badge variant="outline" className="text-xs bg-gray-100 text-gray-500 border-gray-200 h-5 px-1.5">
                                    Inactief
                                  </Badge>
                                )}
                                {status !== "geaccepteerd" && (
                                  <Badge variant="outline" className={`text-xs h-5 px-1.5 ${statusCfg.badge}`}>
                                    {statusCfg.label}
                                  </Badge>
                                )}
                                {status === "uitgenodigd" &&
                                  g.uitnodiging_verloopt_op &&
                                  new Date(g.uitnodiging_verloopt_op).getTime() < Date.now() && (
                                    <Badge variant="outline" className="text-xs h-5 px-1.5 bg-red-100 text-red-800 border-red-200">
                                      Verlopen
                                    </Badge>
                                  )}
                              </div>

                              {status === "geaccepteerd" && g.uitnodiging_geaccepteerd_op && (
                                <p className="mt-1 text-xs text-green-600">
                                  Geaccepteerd: {formatDatum(g.uitnodiging_geaccepteerd_op)}
                                </p>
                              )}

                              {status !== "geaccepteerd" && (g.uitnodiging_verstuurd_op || g.uitnodiging_geopend_op || g.uitnodiging_opnieuw_verstuurd_op) && (
                                <div className="mt-1 space-y-0.5">
                                  {g.uitnodiging_verstuurd_op && (
                                    <p className="text-xs text-muted-foreground">
                                      Verzonden: {formatDatum(g.uitnodiging_verstuurd_op)}
                                    </p>
                                  )}
                                  {g.uitnodiging_opnieuw_verstuurd_op && (
                                    <p className="text-xs text-muted-foreground">
                                      Herinnering: {formatDatum(g.uitnodiging_opnieuw_verstuurd_op)}
                                    </p>
                                  )}
                                  {g.uitnodiging_geopend_op && (
                                    <p className="text-xs text-purple-600">
                                      Geopend: {formatDatum(g.uitnodiging_geopend_op)}
                                    </p>
                                  )}
                                </div>
                              )}

                              {status !== "geaccepteerd" && (
                                <Button
                                  size="sm"
                                  className={`mt-2 h-7 text-xs w-full gap-1.5 font-medium ${
                                    status === "niet_uitgenodigd"
                                      ? "bg-amber-500 hover:bg-amber-600 text-white border-0"
                                      : "bg-purple-500 hover:bg-purple-600 text-white border-0"
                                  }`}
                                  disabled={uitnodigingBezig === g.id}
                                  onClick={() => stuurUitnodiging(g)}
                                >
                                  <SendHorizonal className="h-3 w-3" />
                                  {uitnodigingBezig === g.id
                                    ? "Bezig..."
                                    : status === "uitgenodigd"
                                    ? "Gebruiker opnieuw uitnodigen"
                                    : "Gebruiker per e-mail uitnodigen"}
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialoog: toevoegen */}
      <Dialog open={toevoegenOpen} onOpenChange={(o) => { if (!o) { setToevoegenOpen(false); setToevoegenFout(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby="toevoegen-beschr">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" /> Gebruiker toevoegen
            </DialogTitle>
          </DialogHeader>
          <p id="toevoegen-beschr" className="text-sm text-muted-foreground -mt-1">
            Vul de gegevens in om een nieuw account aan te maken.
          </p>
          <form onSubmit={verstuurToevoegen} className="space-y-4 pt-1">
            <GebruikerVelden form={toevoegenForm} setForm={setToevoegenForm} toonActief={false} toonHoofd={isHoofd} />
            {toevoegenFout && <Foutmelding tekst={toevoegenFout} />}
            <DialogFooter className="gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setToevoegenOpen(false)}>Annuleren</Button>
              <Button type="submit" disabled={maakGebruiker.isPending}>
                {maakGebruiker.isPending ? "Opslaan..." : "Toevoegen"}
              </Button>
            </DialogFooter>
          </form>
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

      {/* AlertDialog: verwijderen */}
      <AlertDialog open={!!verwijderTarget} onOpenChange={(o) => { if (!o) setVerwijderTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gebruiker verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet u zeker dat u <strong>{verwijderTarget?.naam}</strong> ({verwijderTarget?.email}) wilt verwijderen?
              Dit kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={bevestigVerwijderen}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {verwijderGebruiker.isPending ? "Verwijderen..." : "Definitief verwijderen"}
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
                  <VeldRij icon={User} label="Projectfunctie" waarde={bekijkGebruiker.functietitel} />
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
      {/* Basisvelden */}
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
          <Select value={form.rol} onValueChange={(v) => setForm((f) => ({ ...f, rol: v }))}>
            <SelectTrigger id="g-rol">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {toonHoofd && <SelectItem value="hoofdbeheerder">Hoofdbeheerder</SelectItem>}
              <SelectItem value="beheerder">Beheerder</SelectItem>
              <SelectItem value="monteur">Monteur</SelectItem>
              <SelectItem value="controleur">Controleur</SelectItem>
              <SelectItem value="klant">Klant</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="g-functie">Projectfunctie</Label>
          <Select
            value={form.functietitel ? form.functietitel : GEEN_FUNCTIE}
            onValueChange={(v) => setForm((f) => ({ ...f, functietitel: v === GEEN_FUNCTIE ? "" : v }))}
          >
            <SelectTrigger id="g-functie">
              <SelectValue placeholder="Geen functie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={GEEN_FUNCTIE}>Geen functie</SelectItem>
              {FUNCTIETITELS.map((ft) => (
                <SelectItem key={ft} value={ft}>{ft}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

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
          <Label htmlFor="g-actief" className="cursor-pointer">
            Account actief
          </Label>
          <span className="text-xs text-muted-foreground ml-auto">
            {form.actief ? "Kan inloggen" : "Kan niet inloggen"}
          </span>
        </div>
      )}

      {/* Profiel en branding */}
      <div className="rounded-lg border p-3 space-y-3">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Palette className="h-3.5 w-3.5" /> Profiel en branding
        </div>

        {/* Profielfoto */}
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fotoInputRef.current?.click()}
                className="text-xs h-7"
              >
                Foto uploaden
              </Button>
              {form.avatar_url && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setForm((f) => ({ ...f, avatar_url: "" }))}
                  className="text-xs h-7 text-muted-foreground"
                >
                  Verwijderen
                </Button>
              )}
              <p className="text-xs text-muted-foreground">JPG, PNG of WebP</p>
            </div>
          </div>
          <input
            ref={fotoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) leesBestand(f, "avatar_url"); }}
          />
        </div>

        {/* Bedrijfslogo */}
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => logoInputRef.current?.click()}
                className="text-xs h-7"
              >
                Logo uploaden
              </Button>
              {form.bedrijfslogo_url && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setForm((f) => ({ ...f, bedrijfslogo_url: "" }))}
                  className="text-xs h-7 text-muted-foreground"
                >
                  Verwijderen
                </Button>
              )}
              <p className="text-xs text-muted-foreground">JPG, PNG of SVG</p>
            </div>
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) leesBestand(f, "bedrijfslogo_url"); }}
          />
        </div>

        {/* Accentkleur */}
        <div className="space-y-1.5">
          <Label htmlFor="g-kleur">Accentkleur</Label>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                id="g-kleur"
                type="color"
                value={primairKleur}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    bedrijfskleuren: JSON.stringify({ primair: e.target.value }),
                  }))
                }
                className="h-9 w-16 rounded cursor-pointer border border-input bg-transparent p-0.5"
                title="Kies accentkleur"
              />
            </div>
            <div>
              <span className="text-sm font-mono">{primairKleur}</span>
              <p className="text-xs text-muted-foreground">Accentkleur voor dit account</p>
            </div>
            {form.bedrijfskleuren && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setForm((f) => ({ ...f, bedrijfskleuren: "" }))}
                className="text-xs h-7 text-muted-foreground ml-auto"
              >
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
