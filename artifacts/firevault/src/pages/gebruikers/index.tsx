import { useState } from "react";
import {
  useListGebruikers,
  useCreateGebruiker,
  useUpdateGebruiker,
  useDeleteGebruiker,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { Mail, Phone, Building, Clock, Plus, UserPlus, Pencil, Trash2, RefreshCw, ShieldCheck, Wrench, Eye, User, Crown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRol } from "@/context/rol-context";

// Rolvolgorde: meeste rechten eerst
const ROLLEN = ["hoofdbeheerder", "beheerder", "monteur", "controleur", "klant"] as const;
type Rol = typeof ROLLEN[number];

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
  if (uur < 24) return `${uur} ${uur === 1 ? "uur" : "uur"} geleden`;
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
  naam: "", email: "", rol: "monteur",
  telefoon: "", bedrijf: "", wachtwoord: "", actief: true,
};
type GebruikerForm = typeof leegForm;

type Gebruiker = {
  id: number;
  naam: string | null;
  email: string | null;
  rol: string | null;
  telefoon: string | null;
  bedrijf: string | null;
  actief: boolean | null;
  laatste_online?: string | null;
};

export default function Gebruikers() {
  const queryClient = useQueryClient();
  const { rol: viewerRol } = useRol();
  const isHoofd = viewerRol === "hoofdbeheerder";
  const magVerwijderen = isHoofd;
  const { data: gebruikers, isLoading, refetch, isFetching } = useListGebruikers();
  const maakGebruiker       = useCreateGebruiker();
  const werkBijGebruiker    = useUpdateGebruiker();
  const verwijderGebruiker  = useDeleteGebruiker();

  const [toevoegenOpen, setToevoegenOpen]     = useState(false);
  const [toevoegenForm, setToevoegenForm]     = useState<GebruikerForm>(leegForm);
  const [toevoegenFout, setToevoegenFout]     = useState<string | null>(null);

  const [bewerkGebruiker, setBewerkGebruiker] = useState<Gebruiker | null>(null);
  const [bewerkForm, setBewerkForm]           = useState<GebruikerForm>(leegForm);
  const [bewerkFout, setBewerkFout]           = useState<string | null>(null);

  const [verwijderTarget, setVerwijderTarget] = useState<Gebruiker | null>(null);

  const [bekijkGebruiker, setBekijkGebruiker] = useState<Gebruiker | null>(null);

  const invalideer = () => queryClient.invalidateQueries({ queryKey: ["listGebruikers"] });

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
          naam:       toevoegenForm.naam.trim(),
          email:      toevoegenForm.email.trim(),
          rol:        toevoegenForm.rol as any,
          telefoon:   toevoegenForm.telefoon.trim() || undefined,
          bedrijf:    toevoegenForm.bedrijf.trim()  || undefined,
          wachtwoord: toevoegenForm.wachtwoord.trim() || undefined,
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
      naam:      g.naam      ?? "",
      email:     g.email     ?? "",
      rol:       g.rol       ?? "monteur",
      telefoon:  g.telefoon  ?? "",
      bedrijf:   g.bedrijf   ?? "",
      wachtwoord: "",
      actief:    g.actief    ?? true,
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
          naam:     bewerkForm.naam.trim(),
          email:    bewerkForm.email.trim(),
          rol:      bewerkForm.rol as any,
          telefoon: bewerkForm.telefoon.trim() || undefined,
          bedrijf:  bewerkForm.bedrijf.trim()  || undefined,
          actief:   bewerkForm.actief,
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

  // Groepeer per rol
  const perRol = ROLLEN.reduce<Record<string, Gebruiker[]>>((acc, rol) => {
    acc[rol] = (gebruikers ?? []).filter((g) => g.rol === rol) as Gebruiker[];
    return acc;
  }, {} as Record<string, Gebruiker[]>);

  // Hoofdbeheerders zijn alleen zichtbaar voor een hoofdbeheerder
  const zichtbareRollen = ROLLEN.filter((rol) => isHoofd || rol !== "hoofdbeheerder");
  const gridCols = zichtbareRollen.length === 5 ? "grid-cols-5" : "grid-cols-4";

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gebruikers</h1>
          <p className="text-muted-foreground mt-1">
            Beheer accounts en toegangsrechten — geordend op rechtenniveau.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching} title="Vernieuwen">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => { setToevoegenOpen(true); setToevoegenForm(leegForm); setToevoegenFout(null); }}>
            <Plus className="h-4 w-4 mr-2" /> Gebruiker Toevoegen
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
                {/* Kolomkoptekst */}
                <div className="px-4 pt-3 pb-3 border-b bg-background/60">
                  <div className={`flex items-center gap-2 text-base font-semibold ${cfg.kleur}`}>
                    <Icon className="h-4 w-4" />
                    {cfg.label}
                    <span className="ml-auto text-lg font-bold">{lijst.length}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{cfg.beschrijving}</p>
                </div>

                {/* Gebruikerskaarten */}
                <div className="p-3 space-y-3">
                {lijst.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-6 border border-dashed rounded-lg">
                    Geen {cfg.label.toLowerCase()}
                  </div>
                )}

                {lijst.map((g) => (
                  <Card key={g.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-9 w-9 text-xs border-2 border-primary/10 flex-shrink-0 mt-0.5">
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

                          {!g.actief && (
                            <Badge variant="outline" className="mt-2 text-xs bg-gray-100 text-gray-500">
                              Inactief
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Dialoog: toevoegen ── */}
      <Dialog open={toevoegenOpen} onOpenChange={(o) => { if (!o) { setToevoegenOpen(false); setToevoegenFout(null); } }}>
        <DialogContent className="max-w-md" aria-describedby="toevoegen-beschr">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" /> Gebruiker Toevoegen
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

      {/* ── Dialoog: bewerken ── */}
      <Dialog open={!!bewerkGebruiker} onOpenChange={(o) => { if (!o) { setBewerkGebruiker(null); setBewerkFout(null); } }}>
        <DialogContent className="max-w-md" aria-describedby="bewerk-beschr">
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

      {/* ── AlertDialog: verwijderen ── */}
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

      {/* ── Dialoog: bekijken ── */}
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
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-14 w-14 border-2 border-primary/10">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {initialen(bekijkGebruiker.naam ?? "")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="text-lg font-semibold leading-tight">{bekijkGebruiker.naam}</div>
                    <Badge variant="outline" className={`mt-1 ${cfg?.badge ?? ""}`}>
                      <RolIcon className="h-3 w-3 mr-1" />
                      {cfg?.label ?? bekijkGebruiker.rol}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                  <div className="flex items-start gap-3">
                    <Mail className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">E-mailadres</div>
                      <div className="text-sm break-all">{bekijkGebruiker.email || "—"}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Phone className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">Telefoonnummer</div>
                      <div className="text-sm">{bekijkGebruiker.telefoon || "—"}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Building className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">Bedrijf</div>
                      <div className="text-sm">{bekijkGebruiker.bedrijf || "—"}</div>
                    </div>
                  </div>
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
  const set = (k: keyof GebruikerForm) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <Label htmlFor="vld-naam">Volledige naam *</Label>
        <Input id="vld-naam" value={form.naam} onChange={set("naam")} placeholder="Jan de Vries" autoFocus required />
      </div>
      <div className="col-span-2">
        <Label htmlFor="vld-email">E-mailadres *</Label>
        <Input id="vld-email" type="email" value={form.email} onChange={set("email")} placeholder="jan@bedrijf.nl" required />
      </div>
      <div>
        <Label>Rol *</Label>
        <Select value={form.rol} onValueChange={(v) => setForm((f) => ({ ...f, rol: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {toonHoofd && <SelectItem value="hoofdbeheerder">Hoofdbeheerder</SelectItem>}
            <SelectItem value="beheerder">Beheerder</SelectItem>
            <SelectItem value="controleur">Controleur</SelectItem>
            <SelectItem value="monteur">Monteur</SelectItem>
            <SelectItem value="klant">Klant</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="vld-tel">Telefoonnummer</Label>
        <Input id="vld-tel" type="tel" value={form.telefoon} onChange={set("telefoon")} placeholder="+31 6 12345678" />
      </div>
      <div className="col-span-2">
        <Label htmlFor="vld-bedrijf">Bedrijf</Label>
        <Input id="vld-bedrijf" value={form.bedrijf} onChange={set("bedrijf")} placeholder="Naam van het bedrijf" />
      </div>
      <div className="col-span-2">
        <Label htmlFor="vld-ww">{toonActief ? "Nieuw wachtwoord" : "Tijdelijk wachtwoord"}</Label>
        <Input
          id="vld-ww"
          type="password"
          value={form.wachtwoord}
          onChange={set("wachtwoord")}
          placeholder={toonActief ? "Leeg laten om ongewijzigd te laten" : "Optioneel"}
        />
      </div>
      {toonActief && (
        <div className="col-span-2 flex items-center justify-between rounded-lg border p-3">
          <div>
            <div className="text-sm font-medium">Account actief</div>
            <div className="text-xs text-muted-foreground">Inactieve gebruikers kunnen niet inloggen.</div>
          </div>
          <Switch
            checked={form.actief}
            onCheckedChange={(checked) => setForm((f) => ({ ...f, actief: checked }))}
          />
        </div>
      )}
    </div>
  );
}

function Foutmelding({ tekst }: { tekst: string }) {
  return (
    <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2 border border-destructive/20">
      {tekst}
    </div>
  );
}
