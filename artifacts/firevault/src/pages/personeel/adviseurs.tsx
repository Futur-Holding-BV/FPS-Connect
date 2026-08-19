import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, CalendarClock, CheckCircle2, Contact, Pencil, Search, ShieldAlert, UserRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useRol } from "@/context/rol-context";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const QUERY_KEY = ["externe-adviseurs"] as const;

type ExterneAdviseur = {
  id: number;
  gebruiker_id: number;
  naam: string | null;
  email: string | null;
  account_actief: boolean | null;
  bedrijf: string;
  contactpersoon: string | null;
  ingeschakeld_voor: string;
  functietitel: string | null;
  toegang_tot: string;
  aangemaakt_op: string | null;
};

type AdviseurFormulier = Pick<ExterneAdviseur, "bedrijf" | "contactpersoon" | "ingeschakeld_voor" | "functietitel" | "toegang_tot">;

function datumNaarLokaal(datum: string): Date {
  return new Date(`${datum.slice(0, 10)}T00:00:00`);
}

function formatDatum(datum: string): string {
  const parsed = datumNaarLokaal(datum);
  return Number.isNaN(parsed.getTime())
    ? datum
    : parsed.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

function dagenTot(datum: string): number {
  const vandaag = new Date();
  vandaag.setHours(0, 0, 0, 0);
  return Math.round((datumNaarLokaal(datum).getTime() - vandaag.getTime()) / 86_400_000);
}

function naarFormulier(adviseur: ExterneAdviseur): AdviseurFormulier {
  return {
    bedrijf: adviseur.bedrijf,
    contactpersoon: adviseur.contactpersoon,
    ingeschakeld_voor: adviseur.ingeschakeld_voor,
    functietitel: adviseur.functietitel,
    toegang_tot: adviseur.toegang_tot.slice(0, 10),
  };
}

async function leesFout(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? "De wijziging kon niet worden opgeslagen.";
}

function ToegangStatus({ adviseur }: { adviseur: ExterneAdviseur }) {
  if (!adviseur.account_actief) {
    return <Badge variant="secondary">Account inactief</Badge>;
  }

  const dagen = dagenTot(adviseur.toegang_tot);
  if (dagen < 0) {
    return <Badge variant="destructive"><ShieldAlert className="mr-1 h-3.5 w-3.5" />Toegang verlopen</Badge>;
  }
  if (dagen <= 14) {
    return (
      <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
        <AlertTriangle className="mr-1 h-3.5 w-3.5" />
        {dagen === 0 ? "Verloopt vandaag" : `Verloopt over ${dagen} d`}
      </Badge>
    );
  }
  return <Badge variant="outline" className="border-emerald-300 text-emerald-800"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Toegang actief</Badge>;
}

export default function ExterneAdviseursPagina() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { echteRol, bevoegdheden } = useRol();
  const magSchrijven = echteRol === "hoofdbeheerder" || (bevoegdheden.personeel ?? 0) >= 2;
  const [zoekterm, setZoekterm] = useState("");
  const [bewerken, setBewerken] = useState<ExterneAdviseur | null>(null);
  const [formulier, setFormulier] = useState<AdviseurFormulier | null>(null);

  const adviseursQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<ExterneAdviseur[]> => {
      const response = await fetch(`${BASE}/api/externe-adviseurs`, { credentials: "include" });
      if (!response.ok) throw new Error(await leesFout(response));
      return response.json();
    },
  });

  const wijzigAdviseur = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: AdviseurFormulier }): Promise<ExterneAdviseur> => {
      const response = await fetch(`${BASE}/api/externe-adviseurs/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(await leesFout(response));
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setBewerken(null);
      setFormulier(null);
      toast({ title: "Adviseur bijgewerkt", description: "De gegevens en toegang zijn opgeslagen." });
    },
    onError: (error) => {
      toast({
        title: "Opslaan mislukt",
        description: error instanceof Error ? error.message : "Probeer het opnieuw.",
        variant: "destructive",
      });
    },
  });

  const adviseurs = adviseursQuery.data ?? [];
  const gefilterd = useMemo(() => {
    const zoek = zoekterm.trim().toLocaleLowerCase("nl-NL");
    if (!zoek) return adviseurs;
    return adviseurs.filter((adviseur) =>
      [
        adviseur.bedrijf,
        adviseur.naam,
        adviseur.email,
        adviseur.contactpersoon,
        adviseur.ingeschakeld_voor,
        adviseur.functietitel,
      ].some((waarde) => waarde?.toLocaleLowerCase("nl-NL").includes(zoek)),
    );
  }, [adviseurs, zoekterm]);

  const bijnaVerlopen = adviseurs.filter((a) => a.account_actief && dagenTot(a.toegang_tot) >= 0 && dagenTot(a.toegang_tot) <= 14).length;
  const verlopen = adviseurs.filter((a) => a.account_actief && dagenTot(a.toegang_tot) < 0).length;
  const actieveAccounts = adviseurs.filter((a) => a.account_actief && dagenTot(a.toegang_tot) >= 0).length;

  function openBewerken(adviseur: ExterneAdviseur) {
    setBewerken(adviseur);
    setFormulier(naarFormulier(adviseur));
  }

  function opslaan() {
    if (!bewerken || !formulier) return;
    if (!formulier.bedrijf.trim() || !formulier.ingeschakeld_voor.trim() || !formulier.toegang_tot) {
      toast({ title: "Vul bedrijf, inzet en toegangsdatum in", variant: "destructive" });
      return;
    }
    wijzigAdviseur.mutate({
      id: bewerken.id,
      data: {
        ...formulier,
        bedrijf: formulier.bedrijf.trim(),
        contactpersoon: formulier.contactpersoon?.trim() || null,
        ingeschakeld_voor: formulier.ingeschakeld_voor.trim(),
        functietitel: formulier.functietitel?.trim() || null,
      },
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 data-paginatitel className="text-2xl font-bold tracking-tight">Externe adviseurs</h1>
          <p className="mt-1 text-muted-foreground">
            Overzicht van dienstverleners met een tijdelijk account. Toegang wordt op de einddatum automatisch geblokkeerd.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Contact className="h-5 w-5 text-primary" />
            <div><p className="text-2xl font-semibold">{actieveAccounts}</p><p className="text-xs text-muted-foreground">actieve accounts</p></div>
          </CardContent>
        </Card>
        <Card className={bijnaVerlopen > 0 ? "border-amber-300" : ""}>
          <CardContent className="flex items-center gap-3 p-4">
            <CalendarClock className="h-5 w-5 text-amber-700" />
            <div><p className="text-2xl font-semibold">{bijnaVerlopen}</p><p className="text-xs text-muted-foreground">verloopt binnen 14 dagen</p></div>
          </CardContent>
        </Card>
        <Card className={verlopen > 0 ? "border-destructive/50" : ""}>
          <CardContent className="flex items-center gap-3 p-4">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            <div><p className="text-2xl font-semibold">{verlopen}</p><p className="text-xs text-muted-foreground">toegang verlopen</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={zoekterm} onChange={(event) => setZoekterm(event.target.value)} className="pl-9" placeholder="Zoek op bedrijf, naam of inzet..." />
      </div>

      {adviseursQuery.isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-32 w-full" />)}</div>
      ) : adviseursQuery.isError ? (
        <Card><CardContent className="py-10 text-center text-destructive">De adviseurslijst kon niet worden geladen. Vernieuw de pagina of probeer het later opnieuw.</CardContent></Card>
      ) : gefilterd.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <UserRound className="mx-auto mb-3 h-10 w-10 opacity-40" />
            <p>{adviseurs.length === 0 ? "Nog geen externe adviseurs geregistreerd." : "Geen adviseurs gevonden."}</p>
            {adviseurs.length === 0 && <p className="mt-1 text-xs">Registreer een adviseur via de onboarding-wizard.</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {gefilterd.map((adviseur) => (
            <Card key={adviseur.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4 text-muted-foreground" />{adviseur.bedrijf}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {adviseur.contactpersoon ?? adviseur.naam ?? "Geen contactpersoon opgegeven"}
                      {adviseur.email ? ` · ${adviseur.email}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ToegangStatus adviseur={adviseur} />
                    {magSchrijven && (
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openBewerken(adviseur)}>
                        <Pencil className="h-3.5 w-3.5" />Bewerken
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 border-t pt-4 sm:grid-cols-3">
                <div><p className="text-xs font-medium text-muted-foreground">Waarvoor ingeschakeld</p><p className="mt-1 text-sm">{adviseur.ingeschakeld_voor}</p></div>
                <div><p className="text-xs font-medium text-muted-foreground">Functie</p><p className="mt-1 text-sm">{adviseur.functietitel ?? "—"}</p></div>
                <div><p className="text-xs font-medium text-muted-foreground">Toegang t/m</p><p className="mt-1 text-sm font-medium">{formatDatum(adviseur.toegang_tot)}</p></div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={bewerken !== null} onOpenChange={(open) => { if (!open) { setBewerken(null); setFormulier(null); } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Externe adviseur bewerken</DialogTitle>
            <DialogDescription>Werk de gegevens bij of verleng de toegang van deze adviseur.</DialogDescription>
          </DialogHeader>
          {formulier && (
            <div className="space-y-4 py-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="adviseur-bedrijf">Bedrijf *</Label><Input id="adviseur-bedrijf" value={formulier.bedrijf} onChange={(event) => setFormulier({ ...formulier, bedrijf: event.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="adviseur-contact">Contactpersoon</Label><Input id="adviseur-contact" value={formulier.contactpersoon ?? ""} onChange={(event) => setFormulier({ ...formulier, contactpersoon: event.target.value })} /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="adviseur-inzet">Waarvoor ingeschakeld *</Label><Textarea id="adviseur-inzet" value={formulier.ingeschakeld_voor} onChange={(event) => setFormulier({ ...formulier, ingeschakeld_voor: event.target.value })} /></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="adviseur-functie">Functietitel</Label><Input id="adviseur-functie" value={formulier.functietitel ?? ""} onChange={(event) => setFormulier({ ...formulier, functietitel: event.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="adviseur-toegang">Toegang t/m *</Label><Input id="adviseur-toegang" type="date" value={formulier.toegang_tot} onChange={(event) => setFormulier({ ...formulier, toegang_tot: event.target.value })} /></div>
              </div>
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">De toegang wordt na deze datum bij iedere aanvraag geblokkeerd. Verleng alleen na een bewuste controle van de opdracht.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBewerken(null); setFormulier(null); }}>Annuleren</Button>
            <Button onClick={opslaan} disabled={wijzigAdviseur.isPending}>{wijzigAdviseur.isPending ? "Opslaan..." : "Opslaan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}