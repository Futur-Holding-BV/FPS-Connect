import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMedewerkers,
  getListMedewerkersQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ShieldCheck, Search, AlertTriangle, RefreshCw, UserCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

interface DuplicaatTreffer {
  id: number;
  naam: string;
  email: string | null;
  geboortedatum: string | null;
  gelijkenis_score: number;
  type: string;
}

interface DuplicaatResultaat {
  mogelijke_duplicaten: DuplicaatTreffer[];
}

async function checkDuplicaat(body: { naam?: string; email?: string; geboortedatum?: string }): Promise<DuplicaatResultaat> {
  const resp = await fetch("/api/medewerkers/duplicate-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error("Fout bij duplicaatcontrole");
  return resp.json() as Promise<DuplicaatResultaat>;
}

async function heranalyseerDossier(id: number): Promise<{ aangemaakt: number; overgeslagen: number; fout: number }> {
  const resp = await fetch(`/api/medewerkers/${id}/heranalyseer-dossier`, {
    method: "POST",
    credentials: "include",
  });
  if (!resp.ok) throw new Error("Heranalyse mislukt");
  return resp.json() as Promise<{ aangemaakt: number; overgeslagen: number; fout: number }>;
}

export default function HrmIntegriteitstools() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: medewerkers = [] } = useListMedewerkers();

  // Duplicaatcontrole
  const [zoekNaam, setZoekNaam] = useState("");
  const [zoekEmail, setZoekEmail] = useState("");
  const [zoekGeboortedatum, setZoekGeboortedatum] = useState("");
  const [duplicaten, setDuplicaten] = useState<DuplicaatTreffer[] | null>(null);
  const [duplicaatBezig, setDuplicaatBezig] = useState(false);

  // Bulk heranalyse
  const [heranalyseBezig, setHeranalyseBezig] = useState(false);
  const [heranalyseVoortgang, setHeranalyseVoortgang] = useState<{ gedaan: number; totaal: number; aangemaakt: number } | null>(null);

  async function controleerDuplicaten() {
    if (!zoekNaam.trim() && !zoekEmail.trim() && !zoekGeboortedatum.trim()) return;
    setDuplicaatBezig(true);
    setDuplicaten(null);
    try {
      const result = await checkDuplicaat({
        naam: zoekNaam.trim() || undefined,
        email: zoekEmail.trim() || undefined,
        geboortedatum: zoekGeboortedatum.trim() || undefined,
      });
      setDuplicaten(result.mogelijke_duplicaten);
    } catch {
      toast({ title: "Fout", description: "Duplicaatcontrole mislukt.", variant: "destructive" });
    } finally {
      setDuplicaatBezig(false);
    }
  }

  async function bulkHeranalyseer() {
    const actieven = medewerkers.filter((m) => (m as { actief?: boolean }).actief !== false);
    if (actieven.length === 0) return;

    setHeranalyseBezig(true);
    setHeranalyseVoortgang({ gedaan: 0, totaal: actieven.length, aangemaakt: 0 });
    let totaalAangemaakt = 0;

    for (let i = 0; i < actieven.length; i++) {
      const m = actieven[i];
      try {
        const res = await heranalyseerDossier((m as { id: number }).id);
        totaalAangemaakt += res.aangemaakt;
      } catch {
        // Ga door bij individuele fouten
      }
      setHeranalyseVoortgang({ gedaan: i + 1, totaal: actieven.length, aangemaakt: totaalAangemaakt });
    }

    setHeranalyseBezig(false);
    await queryClient.invalidateQueries({ queryKey: getListMedewerkersQueryKey() });
    toast({
      title: "Heranalyse voltooid",
      description: `${totaalAangemaakt} nieuwe AI-voorstellen aangemaakt voor ${actieven.length} medewerkers.`,
    });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 data-paginatitel className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-6 w-6" />
          Integriteitstools
        </h1>
        <p className="text-muted-foreground mt-1">
          Hulpmiddelen voor datakwaliteit, duplicaatdetectie en bulk-AI-analyse van personeelsdossiers.
        </p>
      </div>

      {/* Duplicaatcontrole */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            Duplicaatcontrole
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Controleer of een nieuwe of bestaande medewerker al voorkomt in het systeem.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Naam</label>
              <Input
                value={zoekNaam}
                onChange={(e) => setZoekNaam(e.target.value)}
                placeholder="Gedeeltelijke naam..."
                className="h-9"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">E-mailadres</label>
              <Input
                value={zoekEmail}
                onChange={(e) => setZoekEmail(e.target.value)}
                placeholder="email@voorbeeld.nl"
                className="h-9"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Geboortedatum</label>
              <Input
                type="date"
                value={zoekGeboortedatum}
                onChange={(e) => setZoekGeboortedatum(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          <Button
            onClick={controleerDuplicaten}
            disabled={duplicaatBezig || (!zoekNaam.trim() && !zoekEmail.trim() && !zoekGeboortedatum.trim())}
            size="sm"
          >
            {duplicaatBezig ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Search className="h-4 w-4 mr-2" />
            )}
            Controleer
          </Button>

          {duplicaten !== null && (
            <div className="space-y-2 pt-2">
              <Separator />
              {duplicaten.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <UserCheck className="h-4 w-4" />
                  Geen duplicaten gevonden.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-amber-700">
                    <AlertTriangle className="h-4 w-4" />
                    {duplicaten.length} mogelijke {duplicaten.length === 1 ? "match" : "matches"} gevonden.
                  </div>
                  {duplicaten.map((d) => (
                    <div key={d.id} className="flex items-center justify-between rounded-lg border p-3 bg-amber-50/40 border-amber-200">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">{d.naam}</p>
                        <p className="text-xs text-muted-foreground">
                          {d.email && <span className="mr-3">{d.email}</span>}
                          {d.geboortedatum && <span>{d.geboortedatum}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary" className="text-xs">
                          {Math.round(d.gelijkenis_score * 100)}% overeenkomst
                        </Badge>
                        <Link href={`/personeel/${d.id}`}>
                          <Button variant="outline" size="sm" className="h-7 text-xs">
                            Bekijk
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk heranalyse */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Bulk dossier-heranalyse
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Analyseert alle documenten van alle actieve medewerkers opnieuw en maakt AI-voorstellen aan voor ontbrekende gegevens.
            Dit is een achtergrondprocedure die meerdere minuten kan duren.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 inline mr-1.5" />
            Er worden geen gegevens automatisch gewijzigd. Voorstellen moeten handmatig beoordeeld worden op de medewerker-detailpagina.
          </div>

          <Button
            onClick={bulkHeranalyseer}
            disabled={heranalyseBezig}
            variant="outline"
            size="sm"
          >
            {heranalyseBezig ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {heranalyseBezig ? "Bezig..." : `Heranalyseer alle medewerkers (${medewerkers.length})`}
          </Button>

          {heranalyseVoortgang && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Voortgang: {heranalyseVoortgang.gedaan}/{heranalyseVoortgang.totaal}
                </span>
                <span className="text-muted-foreground">
                  {heranalyseVoortgang.aangemaakt} voorstellen aangemaakt
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${(heranalyseVoortgang.gedaan / heranalyseVoortgang.totaal) * 100}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
