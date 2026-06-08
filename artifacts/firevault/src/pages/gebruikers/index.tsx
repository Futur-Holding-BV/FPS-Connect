import { useState } from "react";
import {
  useListGebruikers,
  useCreateGebruiker,
  useUpdateGebruiker,
  useDeleteGebruiker,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
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
import { Mail, Phone, Building, Shield, Plus, UserPlus, Pencil, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const rolKleur: Record<string, string> = {
  beheerder:  "bg-primary/10 text-primary border-primary/20",
  monteur:    "bg-blue-100 text-blue-800 border-blue-200",
  controleur: "bg-purple-100 text-purple-800 border-purple-200",
  klant:      "bg-gray-100 text-gray-700 border-gray-200",
};

const rolLabel: Record<string, string> = {
  beheerder:  "Beheerder",
  monteur:    "Monteur",
  controleur: "Controleur",
  klant:      "Klant",
};

function initialen(naam: string) {
  return naam.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join("");
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
};

export default function Gebruikers() {
  const queryClient = useQueryClient();
  const { data: gebruikers, isLoading } = useListGebruikers();
  const maakGebruiker   = useCreateGebruiker();
  const werkBijGebruiker = useUpdateGebruiker();
  const verwijderGebruiker = useDeleteGebruiker();

  // Toevoegen dialoog
  const [toevoegenOpen, setToevoegenOpen] = useState(false);
  const [toevoegenForm, setToevoegenForm] = useState<GebruikerForm>(leegForm);
  const [toevoegenFout, setToevoegenFout] = useState<string | null>(null);

  // Bewerken dialoog
  const [bewerkGebruiker, setBewerkGebruiker] = useState<Gebruiker | null>(null);
  const [bewerkForm, setBewerkForm] = useState<GebruikerForm>(leegForm);
  const [bewerkFout, setBewerkFout] = useState<string | null>(null);

  // Verwijderen dialoog
  const [verwijderTarget, setVerwijderTarget] = useState<Gebruiker | null>(null);

  // --- Helpers ---
  const invalideer = () => queryClient.invalidateQueries({ queryKey: ["listGebruikers"] });

  const setT = (setter: React.Dispatch<React.SetStateAction<GebruikerForm>>, k: keyof GebruikerForm) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setter((f) => ({ ...f, [k]: e.target.value }));

  // --- Toevoegen ---
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
          naam: toevoegenForm.naam.trim(),
          email: toevoegenForm.email.trim(),
          rol: toevoegenForm.rol as any,
          telefoon: toevoegenForm.telefoon.trim() || undefined,
          bedrijf:  toevoegenForm.bedrijf.trim()  || undefined,
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

  // --- Bewerken openen ---
  function openBewerken(g: Gebruiker) {
    setBewerkGebruiker(g);
    setBewerkForm({
      naam: g.naam ?? "",
      email: g.email ?? "",
      rol: g.rol ?? "monteur",
      telefoon: g.telefoon ?? "",
      bedrijf: g.bedrijf ?? "",
      wachtwoord: "",
      actief: g.actief ?? true,
    });
    setBewerkFout(null);
  }

  // --- Bewerken opslaan ---
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

  // --- Verwijderen bevestigen ---
  async function bevestigVerwijderen() {
    if (!verwijderTarget) return;
    await verwijderGebruiker.mutateAsync({ id: verwijderTarget.id });
    await invalideer();
    setVerwijderTarget(null);
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gebruikers</h1>
          <p className="text-muted-foreground mt-1">Beheer accounts en toegangsrechten.</p>
        </div>
        <Button onClick={() => { setToevoegenOpen(true); setToevoegenForm(leegForm); setToevoegenFout(null); }}>
          <Plus className="h-4 w-4 mr-2" /> Gebruiker Toevoegen
        </Button>
      </div>

      {/* Statistieken per rol */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(["beheerder", "monteur", "controleur", "klant"] as const).map((rol) => (
          <Card key={rol}>
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold">
                {gebruikers?.filter((g) => g.rol === rol).length ?? 0}
              </div>
              <div className="text-sm text-muted-foreground">{rolLabel[rol]}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Laadstatus */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />)}
        </div>
      )}

      {/* Gebruikerskaarten */}
      {!isLoading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {gebruikers?.map((gebruiker) => (
            <Card key={gebruiker.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <Avatar className="h-12 w-12 text-sm border-2 border-primary/20 flex-shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {initialen(gebruiker.naam ?? "")}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{gebruiker.naam}</span>
                      <Badge variant="outline" className={rolKleur[gebruiker.rol ?? ""]}>
                        <Shield className="h-3 w-3 mr-1" />
                        {rolLabel[gebruiker.rol ?? ""] ?? gebruiker.rol}
                      </Badge>
                      {!gebruiker.actief && (
                        <Badge variant="outline" className="bg-gray-100 text-gray-500">Inactief</Badge>
                      )}
                    </div>
                    <div className="space-y-1 mt-2">
                      {gebruiker.email && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">{gebruiker.email}</span>
                        </div>
                      )}
                      {gebruiker.telefoon && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Phone className="h-3.5 w-3.5" />
                          <span>{gebruiker.telefoon}</span>
                        </div>
                      )}
                      {gebruiker.bedrijf && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Building className="h-3.5 w-3.5" />
                          <span>{gebruiker.bedrijf}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Acties */}
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => openBewerken(gebruiker as Gebruiker)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setVerwijderTarget(gebruiker as Gebruiker)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {!gebruikers?.length && (
            <Card className="col-span-2">
              <CardContent className="py-12 text-center text-muted-foreground">
                Geen gebruikers gevonden.
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Dialoog: gebruiker toevoegen ── */}
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
            <GebruikerVelden form={toevoegenForm} setForm={setToevoegenForm} toonActief={false} />
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

      {/* ── Dialoog: gebruiker bewerken ── */}
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
            <GebruikerVelden form={bewerkForm} setForm={setBewerkForm} toonActief />
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

      {/* ── AlertDialog: verwijderen bevestigen ── */}
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
    </div>
  );
}

// ── Gedeeld formuliervelden component ──
function GebruikerVelden({
  form,
  setForm,
  toonActief,
}: {
  form: GebruikerForm;
  setForm: React.Dispatch<React.SetStateAction<GebruikerForm>>;
  toonActief: boolean;
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
            <SelectItem value="beheerder">Beheerder</SelectItem>
            <SelectItem value="monteur">Monteur</SelectItem>
            <SelectItem value="controleur">Controleur</SelectItem>
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
          placeholder={toonActief ? "Leeg laten om ongewijzigd te laten" : "Optioneel — gebruiker kan het zelf instellen"}
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
