import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  useAnalyseEnkImport,
  useBevestigEnkImport,
  useHergebruikEnkBronbestand,
  useListEnkBronbestanden,
} from "@workspace/api-client-react";
import type {
  EnkImportAnalyse,
  EnkImportOpslagen,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, FileUp, FileText, Sparkles, AlertTriangle, Search,
  RefreshCcw, ChevronDown, CheckCircle2, Scale, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_BESTAND_BYTES = 25 * 1024 * 1024;
const ACCEPT = ".pdf,.csv,.xlsx,.xls";

function formatCenten(centen: number | null | undefined): string {
  if (centen == null) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(centen / 100);
}

function formatAantal(n: number): string {
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(n);
}

function formatDatum(s: string): string {
  return new Date(s).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

function formatGrootte(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

/**
 * Client-side spiegel van berekenTotalen (api-server/routes/mod-calculatie.ts)
 * + berekenConnectCenten (mod-calculatie-import.ts), zodat de totaalvergelijking
 * live meebeweegt met de gekozen verwerking en opslagen.
 */
function berekenConnectCenten(
  analyse: EnkImportAnalyse,
  verwerking: "inclusief" | "bovenop",
  opslagen: EnkImportOpslagen,
): number {
  const rnd = (n: number) => Math.round(n * 100) / 100;
  const regels = analyse.hoofdstukken
    .flatMap((h) => h.regels)
    .filter((r) => r.totaal_centen !== 0);

  const directe = regels.filter((r) => !r.is_bouwplaatskosten);
  const bouwplaats = regels.filter((r) => r.is_bouwplaatskosten);

  const regelTotaal = (r: { totaal_centen: number; hoeveelheid: number }) => {
    const totaalEuro = r.totaal_centen / 100;
    const effHv = r.hoeveelheid > 0 ? r.hoeveelheid : 1;
    // hv * (totaal/hv) — identiek aan de servermapping (tarief = totaal/hv ongerond)
    return effHv * (totaalEuro / effHv);
  };

  const matSubtotaal = rnd(directe.reduce((s, r) => s + regelTotaal(r), 0));
  const bouwplaatsSubtotaal = rnd(bouwplaats.reduce((s, r) => s + r.totaal_centen / 100, 0));

  const ops = verwerking === "inclusief"
    ? { materiaal: 0, arbeid: 0, ak: 0, abk: 0, risico: 0, winst: 0, korting: 0 }
    : opslagen;

  const matOpslagBedrag = rnd(matSubtotaal * ops.materiaal / 100);
  const subtotaal = rnd(matSubtotaal + matOpslagBedrag + bouwplaatsSubtotaal);

  const akBedrag = rnd(subtotaal * ops.ak / 100);
  const abkBedrag = rnd(subtotaal * ops.abk / 100);
  const risicoBedrag = rnd(subtotaal * ops.risico / 100);
  const basisWinst = rnd(subtotaal + akBedrag + abkBedrag + risicoBedrag);
  const winstBedrag = rnd(basisWinst * ops.winst / 100);
  const aanneemsom = rnd(basisWinst + winstBedrag);
  const kortingBedrag = rnd(aanneemsom * ops.korting / 100);
  return Math.round(rnd(aanneemsom - kortingBedrag) * 100);
}

const OPSLAG_VELDEN: Array<{ sleutel: keyof EnkImportOpslagen; label: string }> = [
  { sleutel: "materiaal", label: "Materiaal %" },
  { sleutel: "arbeid", label: "Arbeid %" },
  { sleutel: "ak", label: "AK %" },
  { sleutel: "abk", label: "ABK %" },
  { sleutel: "risico", label: "Risico %" },
  { sleutel: "winst", label: "Winst %" },
  { sleutel: "korting", label: "Korting %" },
];

const STATUS_LABEL: Record<string, string> = {
  geanalyseerd: "Geanalyseerd",
  verwerkt: "Verwerkt",
  mislukt: "Mislukt",
};

const STATUS_KLEUR: Record<string, string> = {
  geanalyseerd: "bg-amber-100 text-amber-800 border-amber-200",
  verwerkt: "bg-green-100 text-green-800 border-green-200",
  mislukt: "bg-red-100 text-red-800 border-red-200",
};

export default function ModulesCalculatieImport() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const bestandRef = useRef<HTMLInputElement>(null);

  const [analyse, setAnalyse] = useState<EnkImportAnalyse | null>(null);
  const [naam, setNaam] = useState("");
  const [klantNaam, setKlantNaam] = useState("");
  const [projectNaam, setProjectNaam] = useState("");
  const [verwerking, setVerwerking] = useState<"inclusief" | "bovenop">("inclusief");
  const [totaalKeuze, setTotaalKeuze] = useState<"connect" | "enk">("enk");
  const [opslagen, setOpslagen] = useState<EnkImportOpslagen>({
    materiaal: 0, arbeid: 0, ak: 0, abk: 0, risico: 0, winst: 0, korting: 0,
  });
  const [zoek, setZoek] = useState("");
  const [sleepActief, setSleepActief] = useState(false);

  const analyseMut = useAnalyseEnkImport({
    mutation: {
      onSuccess: (a) => startControle(a),
      onError: (e) => {
        const fout = e as { data?: { error?: string }; status?: number };
        toast({
          variant: "destructive",
          title: "Analyse mislukt",
          description: fout?.data?.error ?? "Het bestand kon niet worden geanalyseerd.",
        });
        void queryClient.invalidateQueries({ queryKey: ["enk-bronbestanden"] });
      },
    },
  });

  const hergebruikMut = useHergebruikEnkBronbestand({
    mutation: {
      onSuccess: (a) => {
        startControle(a);
        void queryClient.invalidateQueries({ queryKey: ["enk-bronbestanden"] });
      },
      onError: () => toast({ variant: "destructive", title: "Hergebruik mislukt" }),
    },
  });

  const bevestigMut = useBevestigEnkImport({
    mutation: {
      onSuccess: (r) => {
        void queryClient.invalidateQueries({ queryKey: ["mod-calculaties"] });
        void queryClient.invalidateQueries({ queryKey: ["enk-bronbestanden"] });
        toast({
          title: "Calculatie aangemaakt",
          description: r.correctieregel_toegevoegd
            ? `Met zichtbare correctieregel van ${formatCenten(Math.abs(r.verschil_centen))}.`
            : "Zonder correctieregel.",
        });
        navigate(`/modules/calculatie/${r.calculatie_id}`);
      },
      onError: (e) => {
        const fout = e as { data?: { error?: string } };
        toast({
          variant: "destructive",
          title: "Aanmaken mislukt",
          description: fout?.data?.error ?? "De calculatie kon niet worden aangemaakt.",
        });
      },
    },
  });

  const { data: bronbestanden = [], isLoading: bibliotheekLaadt } = useListEnkBronbestanden(
    zoek ? { zoek } : undefined,
    { query: { queryKey: ["enk-bronbestanden", zoek] } },
  );

  function startControle(a: EnkImportAnalyse) {
    setAnalyse(a);
    setNaam(a.voorstel_naam);
    setKlantNaam(a.opdrachtgever ?? "");
    setProjectNaam("");
    setVerwerking(a.verwerking_advies);
    setOpslagen(a.opslagen);
    setTotaalKeuze(a.totaal_enk_centen != null ? "enk" : "connect");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function kiesBestand(bestand: File | undefined) {
    if (!bestand) return;
    if (bestand.size > MAX_BESTAND_BYTES) {
      toast({ variant: "destructive", title: "Bestand te groot", description: "Maximaal 25 MB." });
      return;
    }
    analyseMut.mutate({ data: { bestand } });
  }

  const connectCenten = useMemo(
    () => (analyse ? berekenConnectCenten(analyse, verwerking, opslagen) : 0),
    [analyse, verwerking, opslagen],
  );
  const enkCenten = analyse?.totaal_enk_centen ?? null;
  const verschilCenten = enkCenten != null ? enkCenten - connectCenten : 0;

  function bevestig() {
    if (!analyse) return;
    bevestigMut.mutate({
      id: analyse.bronbestand_id,
      data: {
        naam: naam.trim() || analyse.voorstel_naam,
        klant_naam: klantNaam.trim() || null,
        project_naam: projectNaam.trim() || null,
        verwerking,
        opslagen,
        totaal_keuze: enkCenten == null ? "connect" : totaalKeuze,
      },
    });
  }

  // ── Controlescherm ─────────────────────────────────────────────────────────
  if (analyse) {
    const aantalRegels = analyse.hoofdstukken.reduce((s, h) => s + h.regels.length, 0);
    return (
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setAnalyse(null)} aria-label="Terug naar upload">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Import controleren</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {analyse.bestandsnaam} — controleer de herkende gegevens voordat de calculatie wordt aangemaakt
              </p>
            </div>
          </div>
          {analyse.ai_gebruikt && (
            <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200">
              <Sparkles className="h-3 w-3 mr-1" />
              AI-analyse gebruikt — extra controle aanbevolen
            </Badge>
          )}
        </div>

        {analyse.duplicaten.length > 0 && (
          <Alert className="border-amber-300 bg-amber-50 text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Mogelijk duplicaat</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4 space-y-0.5">
                {analyse.duplicaten.map((d, i) => (
                  <li key={i}>
                    {d.reden}
                    {d.calculatie_id != null && (
                      <Button
                        variant="link"
                        className="h-auto p-0 pl-1 text-amber-900 underline"
                        onClick={() => navigate(`/modules/calculatie/${d.calculatie_id}`)}
                      >
                        bekijk bestaande calculatie
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {analyse.waarschuwingen.length > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Aandachtspunten uit de analyse</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4 space-y-0.5">
                {analyse.waarschuwingen.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Herkende gegevens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">ENK-calculatienummer</p>
                <p className="font-medium">{analyse.calculatienummer ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Projectnummer</p>
                <p className="font-medium">{analyse.projectnummer ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Datum</p>
                <p className="font-medium">{analyse.datum ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Regels</p>
                <p className="font-medium">{aantalRegels} ({analyse.hoofdstukken.length} hoofdstukken)</p>
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="imp-naam">Naam calculatie</Label>
                <Input id="imp-naam" value={naam} onChange={(e) => setNaam(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="imp-klant">Klant / opdrachtgever</Label>
                <Input id="imp-klant" value={klantNaam} onChange={(e) => setKlantNaam(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="imp-project">Projectnaam (optioneel)</Label>
                <Input id="imp-project" value={projectNaam} onChange={(e) => setProjectNaam(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {analyse.hoofdstukken.map((h) => (
          <Card key={h.naam}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{h.naam}</CardTitle>
                <div className="text-sm text-muted-foreground">
                  Regelsom {formatCenten(h.som_regels_centen)}
                  {h.totaal_enk_centen != null && h.totaal_enk_centen !== h.som_regels_centen && (
                    <span className="text-amber-700"> — ENK-hoofdstuktotaal {formatCenten(h.totaal_enk_centen)}</span>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Omschrijving</TableHead>
                    <TableHead className="w-24 text-right">Hoeveelheid</TableHead>
                    <TableHead className="w-20">Eenheid</TableHead>
                    <TableHead className="w-28 text-right">Totaal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {h.regels.map((r, i) => (
                    <TableRow key={i} className={cn(r.totaal_centen === 0 && "text-muted-foreground")}>
                      <TableCell className="whitespace-normal">{r.omschrijving}</TableCell>
                      <TableCell className="text-right">{r.totaal_centen === 0 ? "—" : formatAantal(r.hoeveelheid)}</TableCell>
                      <TableCell>{r.totaal_centen === 0 ? "" : r.eenheid}</TableCell>
                      <TableCell className="text-right">{r.totaal_centen === 0 ? "—" : formatCenten(r.totaal_centen)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Scale className="h-4 w-4" />
              Verwerking en totaalvergelijking
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Hoe zijn de bedragen in het bestand opgebouwd?</Label>
              <RadioGroup
                value={verwerking}
                onValueChange={(v) => setVerwerking(v === "bovenop" ? "bovenop" : "inclusief")}
                className="grid md:grid-cols-2 gap-3"
              >
                <label className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 cursor-pointer",
                  verwerking === "inclusief" && "border-primary bg-primary/5",
                )}>
                  <RadioGroupItem value="inclusief" className="mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium">
                      Bedragen zijn inclusief opslagen
                      {analyse.verwerking_advies === "inclusief" && (
                        <Badge variant="secondary" className="ml-2 text-muted-foreground">Advies</Badge>
                      )}
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      De regelbedragen worden één-op-één overgenomen, zonder extra opslagen.
                    </p>
                  </div>
                </label>
                <label className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 cursor-pointer",
                  verwerking === "bovenop" && "border-primary bg-primary/5",
                )}>
                  <RadioGroupItem value="bovenop" className="mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium">
                      Opslagen komen er nog bovenop
                      {analyse.verwerking_advies === "bovenop" && (
                        <Badge variant="secondary" className="ml-2 text-muted-foreground">Advies</Badge>
                      )}
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      Connect rekent de onderstaande opslagpercentages over de regelbedragen.
                      {analyse.opslagen_bron === "gedetecteerd" && " Percentages zijn uit het bestand herkend."}
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            {verwerking === "bovenop" && (
              <div className="grid grid-cols-3 md:grid-cols-7 gap-3">
                {OPSLAG_VELDEN.map(({ sleutel, label }) => (
                  <div key={sleutel} className="space-y-1">
                    <Label htmlFor={`ops-${sleutel}`} className="text-xs">{label}</Label>
                    <Input
                      id={`ops-${sleutel}`}
                      type="number"
                      step="0.1"
                      value={opslagen[sleutel]}
                      onChange={(e) => setOpslagen((o) => ({ ...o, [sleutel]: Number(e.target.value) || 0 }))}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-lg border bg-muted/40 p-4 grid md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Totaal volgens ENK-bestand</p>
                <p className="text-xl font-semibold">{formatCenten(enkCenten)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Totaal volgens Connect-berekening</p>
                <p className="text-xl font-semibold">{formatCenten(connectCenten)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Verschil</p>
                <p className={cn(
                  "text-xl font-semibold",
                  enkCenten != null && verschilCenten !== 0 ? "text-amber-700" : "text-green-700",
                )}>
                  {enkCenten == null ? "—" : formatCenten(Math.abs(verschilCenten))}
                </p>
              </div>
            </div>

            {enkCenten != null && verschilCenten !== 0 && (
              <div className="space-y-2">
                <Label>Welk totaal moet de calculatie krijgen?</Label>
                <RadioGroup
                  value={totaalKeuze}
                  onValueChange={(v) => setTotaalKeuze(v === "connect" ? "connect" : "enk")}
                  className="grid md:grid-cols-2 gap-3"
                >
                  <label className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 cursor-pointer",
                    totaalKeuze === "enk" && "border-primary bg-primary/5",
                  )}>
                    <RadioGroupItem value="enk" className="mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium">ENK-totaal aanhouden: {formatCenten(enkCenten)}</p>
                      <p className="text-muted-foreground mt-0.5">
                        Er wordt een zichtbare correctieregel van {formatCenten(Math.abs(verschilCenten))} toegevoegd
                        zodat het totaal exact overeenkomt met het bronbestand.
                      </p>
                    </div>
                  </label>
                  <label className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 cursor-pointer",
                    totaalKeuze === "connect" && "border-primary bg-primary/5",
                  )}>
                    <RadioGroupItem value="connect" className="mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium">Connect-berekening aanhouden: {formatCenten(connectCenten)}</p>
                      <p className="text-muted-foreground mt-0.5">
                        Geen correctieregel; het totaal volgt uit de geïmporteerde regels en opslagen.
                      </p>
                    </div>
                  </label>
                </RadioGroup>
              </div>
            )}

            {enkCenten != null && verschilCenten === 0 && (
              <p className="text-sm text-green-700 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                De Connect-berekening komt exact overeen met het ENK-totaal.
              </p>
            )}

            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ChevronDown className="h-4 w-4" />
                Bewijsvoering uit de analyse ({analyse.bewijs.length})
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground font-mono">
                  {analyse.bewijs.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              </CollapsibleContent>
            </Collapsible>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setAnalyse(null)} disabled={bevestigMut.isPending}>
                Annuleren
              </Button>
              <Button onClick={bevestig} disabled={bevestigMut.isPending}>
                {bevestigMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Calculatie aanmaken
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Uploadscherm + bibliotheek ─────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/modules/calculatie")} aria-label="Terug naar calculaties">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">ENK-import</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Importeer een ENK-calculatie (PDF, Excel of CSV) als nieuwe Connect-calculatie
          </p>
        </div>
      </div>

      <div
        className={cn(
          "rounded-xl border-2 border-dashed p-10 text-center transition-colors",
          sleepActief ? "border-primary bg-primary/5" : "border-border bg-card",
          analyseMut.isPending && "opacity-60 pointer-events-none",
        )}
        onDragOver={(e) => { e.preventDefault(); setSleepActief(true); }}
        onDragLeave={() => setSleepActief(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSleepActief(false);
          kiesBestand(e.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={bestandRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            kiesBestand(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {analyseMut.isPending ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Bestand wordt geanalyseerd…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-full bg-primary/10 p-3">
              <FileUp className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-medium">Sleep een ENK-bestand hierheen</p>
              <p className="text-sm text-muted-foreground mt-0.5">PDF, Excel (.xlsx/.xls) of CSV — maximaal 25 MB</p>
            </div>
            <Button onClick={() => bestandRef.current?.click()}>
              Bestand kiezen
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-base">Bronbestanden-bibliotheek</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Zoek op naam of nummer…"
                className="pl-8"
                value={zoek}
                onChange={(e) => setZoek(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {bibliotheekLaadt ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : bronbestanden.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {zoek ? "Geen bronbestanden gevonden voor deze zoekopdracht." : "Nog geen bronbestanden geïmporteerd."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bestand</TableHead>
                  <TableHead>ENK-nummer</TableHead>
                  <TableHead>Opdrachtgever</TableHead>
                  <TableHead className="text-right">ENK-totaal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Geüpload</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {bronbestanden.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div>
                          <p className="font-medium">{b.bestandsnaam}</p>
                          <p className="text-xs text-muted-foreground">
                            {b.bron_type.toUpperCase()} — {formatGrootte(b.bestandsgrootte)}
                            {b.uploader_naam ? ` — ${b.uploader_naam}` : ""}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{b.calculatienummer ?? "—"}</TableCell>
                    <TableCell>{b.opdrachtgever ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatCenten(b.totaal_enk_centen)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_KLEUR[b.status] ?? ""}>
                        {STATUS_LABEL[b.status] ?? b.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDatum(b.aangemaakt_op)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {b.calculatie_id != null && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/modules/calculatie/${b.calculatie_id}`)}
                          >
                            Calculatie
                          </Button>
                        )}
                        {b.status !== "mislukt" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={hergebruikMut.isPending}
                            onClick={() => hergebruikMut.mutate({ id: b.id })}
                          >
                            <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />
                            Hergebruiken
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
