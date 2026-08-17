import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ShieldCheck, Check, AlertTriangle, Minus, X, Pencil, Save, Network } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRol } from "@/context/rol-context";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";

type Score = "ja" | "gedeeltelijk" | "nee" | "nvt";

const CRITERIA: { sleutel: string; label: string; toelichting: string }[] = [
  {
    sleutel: "doel",
    label: "Verwerkingsdoel bepaald",
    toelichting: "Expliciet, welomschreven doel vastgelegd",
  },
  {
    sleutel: "grondslag",
    label: "Rechtmatige grondslag",
    toelichting: "Overeenkomst, wettelijke verplichting, toestemming of gerechtvaardigd belang",
  },
  {
    sleutel: "minimalisatie",
    label: "Dataminimalisatie",
    toelichting: "Alleen strikt noodzakelijke gegevens verwerkt",
  },
  {
    sleutel: "bewaartermijn",
    label: "Bewaartermijn gedefinieerd",
    toelichting: "Concrete termijn vastgesteld; gegevens worden daarna verwijderd",
  },
  {
    sleutel: "beveiliging",
    label: "Beveiligingsmaatregelen",
    toelichting: "Versleuteling, toegangscontrole, logging en audit trail aanwezig",
  },
  {
    sleutel: "transparantie",
    label: "Transparantie (informatieplicht)",
    toelichting: "Betrokkenen zijn geïnformeerd (privacycentrum, beleid)",
  },
  {
    sleutel: "rechten",
    label: "Rechten betrokkene geborgd",
    toelichting: "Procedure voor inzage, rectificatie, wissing en dataportabiliteit",
  },
];

type ModuleScores = Record<string, Score>;

const STANDAARD_MODULES: { naam: string; toelichting: string; scores: ModuleScores }[] = [
  {
    naam: "Gebouwen",
    toelichting: "Gebouwregistratie, adressen, contactpersonen, projectnummers",
    scores: { doel: "ja", grondslag: "ja", minimalisatie: "ja", bewaartermijn: "gedeeltelijk", beveiliging: "ja", transparantie: "ja", rechten: "gedeeltelijk" },
  },
  {
    naam: "Spots",
    toelichting: "Brandpreventieve voorzieningen, foto's, locaties, toewijzingen aan monteurs",
    scores: { doel: "ja", grondslag: "ja", minimalisatie: "ja", bewaartermijn: "gedeeltelijk", beveiliging: "ja", transparantie: "ja", rechten: "gedeeltelijk" },
  },
  {
    naam: "HRM",
    toelichting: "Medewerkerprofielen, functies, bekwaamheden, contactgegevens, BSN",
    scores: { doel: "ja", grondslag: "ja", minimalisatie: "gedeeltelijk", bewaartermijn: "gedeeltelijk", beveiliging: "ja", transparantie: "ja", rechten: "gedeeltelijk" },
  },
  {
    naam: "Verlof",
    toelichting: "Verlofaanvragen, saldo's, ziekmeldingen, verlofsoorten en CAO-kaders",
    scores: { doel: "ja", grondslag: "ja", minimalisatie: "ja", bewaartermijn: "gedeeltelijk", beveiliging: "ja", transparantie: "gedeeltelijk", rechten: "gedeeltelijk" },
  },
  {
    naam: "Documenten",
    toelichting: "Technische documenten, certificaten, testverslagen, versiebeheer",
    scores: { doel: "ja", grondslag: "ja", minimalisatie: "ja", bewaartermijn: "gedeeltelijk", beveiliging: "ja", transparantie: "ja", rechten: "gedeeltelijk" },
  },
  {
    naam: "Dossiers",
    toelichting: "Projectdossiers, bevroren opleverrapporten, archivering",
    scores: { doel: "ja", grondslag: "ja", minimalisatie: "ja", bewaartermijn: "gedeeltelijk", beveiliging: "ja", transparantie: "ja", rechten: "gedeeltelijk" },
  },
  {
    naam: "Planning",
    toelichting: "Werkplanning, taakverdeling, beschikbaarheid en capaciteit medewerkers",
    scores: { doel: "ja", grondslag: "ja", minimalisatie: "ja", bewaartermijn: "nee", beveiliging: "ja", transparantie: "gedeeltelijk", rechten: "gedeeltelijk" },
  },
  {
    naam: "Onderhoud",
    toelichting: "Werkorders, prioriteit, toewijzing, deadlines en statussen",
    scores: { doel: "ja", grondslag: "ja", minimalisatie: "ja", bewaartermijn: "gedeeltelijk", beveiliging: "ja", transparantie: "ja", rechten: "gedeeltelijk" },
  },
  {
    naam: "DMS",
    toelichting: "Documentenbeheer, audittrail, goedkeuringsflows, downloadlogging",
    scores: { doel: "ja", grondslag: "ja", minimalisatie: "ja", bewaartermijn: "ja", beveiliging: "ja", transparantie: "ja", rechten: "gedeeltelijk" },
  },
  {
    naam: "Heatmap",
    toelichting: "Klik-/muisbeweging-registratie gekoppeld aan account. Grondslag: gerechtvaardigd belang (interne productontwikkeling). Standaard uit; alleen actief na expliciete inschakeling door beheerder. Bewaartermijn: geanonimiseerde geaggregeerde weergave, brongegevens max. 12 maanden.",
    scores: { doel: "ja", grondslag: "ja", minimalisatie: "gedeeltelijk", bewaartermijn: "gedeeltelijk", beveiliging: "ja", transparantie: "ja", rechten: "gedeeltelijk" },
  },
];

const STORAGE_KEY = "fps_privacy_avg_matrix_v1";

function loadMatrix(): ModuleScores[] {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v) {
      const parsed = JSON.parse(v) as ModuleScores[];
      if (parsed.length === STANDAARD_MODULES.length) return parsed;
    }
  } catch {}
  return STANDAARD_MODULES.map((m) => ({ ...m.scores }));
}

function ScoreIcon({ score }: { score: Score }) {
  if (score === "ja") return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-100"><Check className="h-3.5 w-3.5 text-green-700" /></span>;
  if (score === "gedeeltelijk") return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100"><AlertTriangle className="h-3.5 w-3.5 text-amber-700" /></span>;
  if (score === "nee") return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-100"><X className="h-3.5 w-3.5 text-red-700" /></span>;
  return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-muted"><Minus className="h-3.5 w-3.5 text-muted-foreground" /></span>;
}

function scoreLabel(s: Score) {
  if (s === "ja") return "Ja";
  if (s === "gedeeltelijk") return "Gedeeltelijk";
  if (s === "nee") return "Nee";
  return "N.v.t.";
}

function TotaalBadge({ scores }: { scores: ModuleScores }) {
  const waarden = Object.values(scores);
  const ja = waarden.filter((v) => v === "ja").length;
  const totaal = waarden.filter((v) => v !== "nvt").length;
  const pct = totaal > 0 ? Math.round((ja / totaal) * 100) : 100;
  const kleur = pct >= 85 ? "text-green-700 bg-green-100" : pct >= 60 ? "text-amber-700 bg-amber-100" : "text-red-700 bg-red-100";
  return <Badge className={`text-xs border-0 font-medium ${kleur}`}>{pct}%</Badge>;
}

export default function BeheerPrivacyPagina() {
  const { rol } = useRol();
  const { heeftNiveau } = useBevoegdheid();
  const isHoofdbeheerder = rol === "hoofdbeheerder";
  const magZien = isHoofdbeheerder || heeftNiveau("systeem", 1) || heeftNiveau("beheer", 2);
  const magBewerken = isHoofdbeheerder || heeftNiveau("systeem", 1);

  const [scores, setScores] = useState<ModuleScores[]>(() => loadMatrix());
  const [bewerkMode, setBewerkMode] = useState(false);
  const [opgeslagen, setOpgeslagen] = useState(false);

  useEffect(() => {
    setScores(loadMatrix());
  }, []);

  if (!magZien) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <ShieldCheck className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Geen toegang tot deze pagina.</p>
      </div>
    );
  }

  function setScore(moduleIdx: number, criteriumSleutel: string, waarde: Score) {
    setScores((prev) => {
      const nieuw = prev.map((s, i) => i === moduleIdx ? { ...s, [criteriumSleutel]: waarde } : s);
      return nieuw;
    });
  }

  function opslaan() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
    setBewerkMode(false);
    setOpgeslagen(true);
    setTimeout(() => setOpgeslagen(false), 2500);
  }

  function annuleren() {
    setScores(loadMatrix());
    setBewerkMode(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 data-paginatitel className="text-xl font-semibold">Privacy by Design — AVG-matrix</h1>
            <p className="text-sm text-muted-foreground">AVG-privacyvereisten per module in FPS Connect</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/beheer/avg">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Network className="h-3.5 w-3.5" />Bekijk verwerkersregister
            </Button>
          </Link>
          {magBewerken && (
            <>
              {opgeslagen && <span className="text-xs text-green-700">Opgeslagen</span>}
              {bewerkMode ? (
                <>
                  <Button variant="outline" size="sm" onClick={annuleren}>Annuleren</Button>
                  <Button size="sm" onClick={opslaan} className="gap-1.5">
                    <Save className="h-3.5 w-3.5" />Opslaan
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setBewerkMode(true)} className="gap-1.5">
                  <Pencil className="h-3.5 w-3.5" />Bewerken
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        {[
          { icon: <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100"><Check className="h-3 w-3 text-green-700" /></span>, label: "Volledig geborgd" },
          { icon: <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100"><AlertTriangle className="h-3 w-3 text-amber-700" /></span>, label: "Verbetering nodig" },
          { icon: <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100"><X className="h-3 w-3 text-red-700" /></span>, label: "Actie vereist" },
          { icon: <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted"><Minus className="h-3 w-3 text-muted-foreground" /></span>, label: "N.v.t." },
        ].map(({ icon, label }) => (
          <span key={label} className="flex items-center gap-1.5">{icon}{label}</span>
        ))}
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 900 }}>
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground w-44">AVG-criterium</th>
              {STANDAARD_MODULES.map((m, i) => (
                <th key={m.naam} className="text-center px-2 py-3 font-medium text-muted-foreground">
                  <div className="text-xs leading-tight">{m.naam}</div>
                  <TotaalBadge scores={scores[i]!} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CRITERIA.map((c) => (
              <tr key={c.sleutel} className="border-b last:border-0 hover:bg-muted/20">
                <td className="px-4 py-3">
                  <p className="font-medium text-xs">{c.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{c.toelichting}</p>
                </td>
                {STANDAARD_MODULES.map((_, mi) => {
                  const score = (scores[mi]?.[c.sleutel] ?? "nvt") as Score;
                  return (
                    <td key={mi} className="px-2 py-3 text-center">
                      {bewerkMode ? (
                        <Select value={score} onValueChange={(v) => setScore(mi, c.sleutel, v as Score)}>
                          <SelectTrigger className="h-7 w-28 text-xs mx-auto">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ja">Ja</SelectItem>
                            <SelectItem value="gedeeltelijk">Gedeeltelijk</SelectItem>
                            <SelectItem value="nee">Nee</SelectItem>
                            <SelectItem value="nvt">N.v.t.</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <ScoreIcon score={score} />
                          <span className="text-[10px] text-muted-foreground">{scoreLabel(score)}</span>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {STANDAARD_MODULES.map((m, mi) => {
          const mScores = scores[mi]!;
          const openPunten = CRITERIA.filter((c) => mScores[c.sleutel] === "nee" || mScores[c.sleutel] === "gedeeltelijk");
          if (openPunten.length === 0) return null;
          return (
            <Card key={m.naam} className="border-amber-200/60">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                  {m.naam}
                  <TotaalBadge scores={mScores} />
                </CardTitle>
                <p className="text-xs text-muted-foreground">{m.toelichting}</p>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {openPunten.map((p) => (
                  <div key={p.sleutel} className="flex items-start gap-2 text-xs">
                    <ScoreIcon score={mScores[p.sleutel] as Score} />
                    <div>
                      <p className="font-medium">{p.label}</p>
                      <p className="text-muted-foreground">{p.toelichting}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {bewerkMode
          ? "U bewerkt de matrix. Wijzigingen worden lokaal bewaard na opslaan."
          : "Scores zijn opgeslagen in uw browser. Dit is geen vervanging van een formeel DPIA-rapport."}
      </p>
    </div>
  );
}
