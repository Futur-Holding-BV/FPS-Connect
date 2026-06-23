import { ShieldCheck, Check, AlertTriangle, Minus, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRol } from "@/context/rol-context";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";

type Score = "ja" | "gedeeltelijk" | "nee" | "nvt";

const CRITERIA: { sleutel: string; label: string; toelichting: string }[] = [
  {
    sleutel: "doel",
    label: "Verwerkingsdoel bepaald",
    toelichting: "Is er een expliciet, welomschreven doel voor de verwerking vastgelegd?",
  },
  {
    sleutel: "grondslag",
    label: "Rechtmatige grondslag (AVG art. 6)",
    toelichting: "Overeenkomst, wettelijke verplichting, gerechtvaardigd belang of toestemming.",
  },
  {
    sleutel: "minimalisatie",
    label: "Dataminimalisatie",
    toelichting: "Worden alleen de gegevens verwerkt die strikt noodzakelijk zijn voor het doel?",
  },
  {
    sleutel: "bewaartermijn",
    label: "Bewaartermijn gedefinieerd",
    toelichting: "Is er een concrete bewaartermijn vastgesteld en worden gegevens daarna verwijderd?",
  },
  {
    sleutel: "beveiliging",
    label: "Passende beveiligingsmaatregelen",
    toelichting: "Versleuteling, toegangscontrole, logging en audit trail aanwezig?",
  },
  {
    sleutel: "transparantie",
    label: "Transparantie (informatieplicht)",
    toelichting: "Zijn betrokkenen geïnformeerd over de verwerking (privacycentrum, beleid)?",
  },
  {
    sleutel: "rechten",
    label: "Rechten betrokkene geborgd",
    toelichting: "Is er een procedure voor inzage, rectificatie, wissing en dataportabiliteit?",
  },
];

const MODULES: {
  naam: string;
  scores: Record<string, Score>;
  toelichting: string;
}[] = [
  {
    naam: "Gebouwen & Spots",
    toelichting: "Projectregistratie, locaties en brandpreventieve voorzieningen",
    scores: {
      doel: "ja",
      grondslag: "ja",
      minimalisatie: "ja",
      bewaartermijn: "gedeeltelijk",
      beveiliging: "ja",
      transparantie: "ja",
      rechten: "gedeeltelijk",
    },
  },
  {
    naam: "Gebruikersbeheer",
    toelichting: "Accounts, rollen, bevoegdheden en authenticatie",
    scores: {
      doel: "ja",
      grondslag: "ja",
      minimalisatie: "ja",
      bewaartermijn: "gedeeltelijk",
      beveiliging: "ja",
      transparantie: "ja",
      rechten: "ja",
    },
  },
  {
    naam: "HRM / Personeel",
    toelichting: "Medewerkerprofielen, opleidingen, bekwaamheden en verlof",
    scores: {
      doel: "ja",
      grondslag: "ja",
      minimalisatie: "gedeeltelijk",
      bewaartermijn: "gedeeltelijk",
      beveiliging: "ja",
      transparantie: "ja",
      rechten: "gedeeltelijk",
    },
  },
  {
    naam: "Documenten & Dossiers",
    toelichting: "Technische documenten, certificaten en projectdossiers",
    scores: {
      doel: "ja",
      grondslag: "ja",
      minimalisatie: "ja",
      bewaartermijn: "gedeeltelijk",
      beveiliging: "ja",
      transparantie: "ja",
      rechten: "gedeeltelijk",
    },
  },
  {
    naam: "Planning",
    toelichting: "Werkplanning, taakverdeling en capaciteit",
    scores: {
      doel: "ja",
      grondslag: "ja",
      minimalisatie: "ja",
      bewaartermijn: "nee",
      beveiliging: "ja",
      transparantie: "gedeeltelijk",
      rechten: "gedeeltelijk",
    },
  },
  {
    naam: "Chat & Berichten",
    toelichting: "Interne communicatie en toolbox-berichten",
    scores: {
      doel: "ja",
      grondslag: "ja",
      minimalisatie: "ja",
      bewaartermijn: "nee",
      beveiliging: "ja",
      transparantie: "gedeeltelijk",
      rechten: "nee",
    },
  },
  {
    naam: "Back-up & Herstel",
    toelichting: "Automatische databaseback-ups en herstelproces",
    scores: {
      doel: "ja",
      grondslag: "ja",
      minimalisatie: "nvt",
      bewaartermijn: "ja",
      beveiliging: "ja",
      transparantie: "ja",
      rechten: "nvt",
    },
  },
];

function ScoreBadge({ score }: { score: Score }) {
  if (score === "ja") {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-100">
        <Check className="h-3.5 w-3.5 text-green-700" />
      </span>
    );
  }
  if (score === "gedeeltelijk") {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
      </span>
    );
  }
  if (score === "nee") {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-100">
        <X className="h-3.5 w-3.5 text-red-700" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-muted">
      <Minus className="h-3.5 w-3.5 text-muted-foreground" />
    </span>
  );
}

function scoreLabel(score: Score) {
  if (score === "ja") return "Ja";
  if (score === "gedeeltelijk") return "Gedeeltelijk";
  if (score === "nee") return "Nee";
  return "N.v.t.";
}

function TotaalScore({ scores }: { scores: Record<string, Score> }) {
  const waarden = Object.values(scores);
  const ja = waarden.filter((v) => v === "ja").length;
  const totaal = waarden.filter((v) => v !== "nvt").length;
  const pct = totaal > 0 ? Math.round((ja / totaal) * 100) : 100;
  let kleur = "text-green-700 bg-green-100";
  if (pct < 60) kleur = "text-red-700 bg-red-100";
  else if (pct < 85) kleur = "text-amber-700 bg-amber-100";
  return (
    <Badge className={`text-xs ${kleur} border-0 font-medium`}>
      {pct}%
    </Badge>
  );
}

export default function BeheerPrivacyPagina() {
  const { rol } = useRol();
  const { heeftNiveau } = useBevoegdheid();
  const isHoofdbeheerder = rol === "hoofdbeheerder";
  const magZien = isHoofdbeheerder || heeftNiveau("systeem", 1) || heeftNiveau("beheer", 2);

  if (!magZien) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <ShieldCheck className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Geen toegang tot deze pagina.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Privacy by Design — AVG-matrix</h1>
          <p className="text-sm text-muted-foreground">
            Overzicht van AVG-privacyvereisten per module in FPS Connect
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100">
            <Check className="h-3 w-3 text-green-700" />
          </span>
          Ja — volledig geborgd
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100">
            <AlertTriangle className="h-3 w-3 text-amber-700" />
          </span>
          Gedeeltelijk — verbetering nodig
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100">
            <X className="h-3 w-3 text-red-700" />
          </span>
          Nee — actie vereist
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted">
            <Minus className="h-3 w-3 text-muted-foreground" />
          </span>
          N.v.t.
        </span>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground w-48">
                AVG-criterium
              </th>
              {MODULES.map((m) => (
                <th key={m.naam} className="text-center px-2 py-3 font-medium text-muted-foreground">
                  <div className="text-xs leading-tight">{m.naam}</div>
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
                {MODULES.map((m) => (
                  <td key={m.naam} className="px-2 py-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <ScoreBadge score={m.scores[c.sleutel]!} />
                      <span className="text-[10px] text-muted-foreground">
                        {scoreLabel(m.scores[c.sleutel]!)}
                      </span>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t bg-muted/30">
              <td className="px-4 py-3 font-medium text-xs text-muted-foreground">
                Totaalscore (% volledig)
              </td>
              {MODULES.map((m) => (
                <td key={m.naam} className="px-2 py-3 text-center">
                  <TotaalScore scores={m.scores} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.filter((m) => {
          const waarden = Object.values(m.scores);
          return waarden.some((v) => v === "nee" || v === "gedeeltelijk");
        }).map((m) => {
          const punten = CRITERIA.filter(
            (c) => m.scores[c.sleutel] === "nee" || m.scores[c.sleutel] === "gedeeltelijk",
          );
          return (
            <Card key={m.naam} className="border-amber-200/60">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                  {m.naam}
                  <TotaalScore scores={m.scores} />
                </CardTitle>
                <p className="text-xs text-muted-foreground">{m.toelichting}</p>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {punten.map((p) => (
                  <div key={p.sleutel} className="flex items-start gap-2 text-xs">
                    <ScoreBadge score={m.scores[p.sleutel]!} />
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
        Deze matrix is gebaseerd op de ontwerpdocumentatie van FPS Connect en wordt periodiek bijgewerkt. Het is geen vervanging van een formeel DPIA-rapport.
      </p>
    </div>
  );
}
