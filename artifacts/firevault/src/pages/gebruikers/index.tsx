import { useState } from "react";
import { useListGebruikers, useCreateGebruiker } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Phone, Building, Shield, Plus, UserPlus } from "lucide-react";
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

const leegForm = { naam: "", email: "", rol: "monteur", telefoon: "", bedrijf: "", wachtwoord: "" };

export default function Gebruikers() {
  const queryClient = useQueryClient();
  const { data: gebruikers, isLoading } = useListGebruikers();
  const maakGebruiker = useCreateGebruiker();

  const [dialoogOpen, setDialoogOpen] = useState(false);
  const [form, setForm] = useState(leegForm);
  const [fout, setFout] = useState<string | null>(null);

  const set = (k: keyof typeof leegForm) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function verstuur(e: React.FormEvent) {
    e.preventDefault();
    setFout(null);
    if (!form.naam.trim() || !form.email.trim() || !form.rol) {
      setFout("Naam, e-mailadres en rol zijn verplicht.");
      return;
    }
    try {
      await maakGebruiker.mutateAsync({
        data: {
          naam: form.naam.trim(),
          email: form.email.trim(),
          rol: form.rol as any,
          telefoon: form.telefoon.trim() || undefined,
          bedrijf: form.bedrijf.trim() || undefined,
          wachtwoord: form.wachtwoord.trim() || undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["listGebruikers"] });
      setDialoogOpen(false);
      setForm(leegForm);
    } catch (err: any) {
      const bericht = err?.response?.data?.error ?? err?.message ?? "Onbekende fout";
      setFout(bericht);
    }
  }

  function sluitDialoog() {
    setDialoogOpen(false);
    setForm(leegForm);
    setFout(null);
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gebruikers</h1>
          <p className="text-muted-foreground mt-1">Beheer accounts en toegangsrechten.</p>
        </div>
        <Button onClick={() => setDialoogOpen(true)}>
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
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      )}

      {/* Gebruikerskaarten */}
      {!isLoading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {gebruikers?.map((gebruiker) => (
            <Card key={gebruiker.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <Avatar className="h-12 w-12 text-sm border-2 border-primary/20">
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
                  <Button variant="ghost" size="sm">Bewerken</Button>
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

      {/* Dialoog: gebruiker toevoegen */}
      <Dialog open={dialoogOpen} onOpenChange={(o) => { if (!o) sluitDialoog(); }}>
        <DialogContent className="max-w-md" aria-describedby="gebruiker-dialoog-beschrijving">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" /> Gebruiker Toevoegen
            </DialogTitle>
          </DialogHeader>
          <p id="gebruiker-dialoog-beschrijving" className="text-sm text-muted-foreground -mt-1">
            Vul de gegevens in om een nieuw account aan te maken.
          </p>

          <form onSubmit={verstuur} className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label htmlFor="g-naam">Volledige naam *</Label>
                <Input
                  id="g-naam"
                  value={form.naam}
                  onChange={set("naam")}
                  placeholder="Jan de Vries"
                  autoFocus
                  required
                />
              </div>

              <div className="col-span-2">
                <Label htmlFor="g-email">E-mailadres *</Label>
                <Input
                  id="g-email"
                  type="email"
                  value={form.email}
                  onChange={set("email")}
                  placeholder="jan@bedrijf.nl"
                  required
                />
              </div>

              <div>
                <Label>Rol *</Label>
                <Select value={form.rol} onValueChange={(v) => setForm((f) => ({ ...f, rol: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beheerder">Beheerder</SelectItem>
                    <SelectItem value="monteur">Monteur</SelectItem>
                    <SelectItem value="controleur">Controleur</SelectItem>
                    <SelectItem value="klant">Klant</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="g-tel">Telefoonnummer</Label>
                <Input
                  id="g-tel"
                  type="tel"
                  value={form.telefoon}
                  onChange={set("telefoon")}
                  placeholder="+31 6 12345678"
                />
              </div>

              <div className="col-span-2">
                <Label htmlFor="g-bedrijf">Bedrijf</Label>
                <Input
                  id="g-bedrijf"
                  value={form.bedrijf}
                  onChange={set("bedrijf")}
                  placeholder="Naam van het bedrijf"
                />
              </div>

              <div className="col-span-2">
                <Label htmlFor="g-ww">Tijdelijk wachtwoord</Label>
                <Input
                  id="g-ww"
                  type="password"
                  value={form.wachtwoord}
                  onChange={set("wachtwoord")}
                  placeholder="Optioneel — gebruiker kan het zelf instellen"
                />
              </div>
            </div>

            {fout && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2 border border-destructive/20">
                {fout}
              </div>
            )}

            <DialogFooter className="gap-2 pt-1">
              <Button type="button" variant="outline" onClick={sluitDialoog}>
                Annuleren
              </Button>
              <Button type="submit" disabled={maakGebruiker.isPending}>
                {maakGebruiker.isPending ? "Opslaan..." : "Toevoegen"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
