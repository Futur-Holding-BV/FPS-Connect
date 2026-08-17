// MATERIAAL_01 fase 0 — telling van het werkelijke inkoopgebruik (read-only)
// + fase 1 herstelronde (open werkbakitems van al afgehandelde aanvragen sluiten).
// Alleen hoofdbeheerder; de server dwingt dat af (requireRol). Bedoeld om op
// PRODUCTIE te draaien: de agent heeft geen SSH meer, René wel een login.
import { useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useRol } from "@/context/rol-context";
import { RefreshCw, ClipboardCopy, Wrench } from "lucide-react";

type Rij = Record<string, string | number | boolean | null>;

type Meting = {
  gemeten_op: string;
  omgeving: string;
  commit: string | null;
  t1_inkoopbonnen_per_status_maand: Rij[];
  t2_magazijn_inkooporders_per_status_maand: Rij[];
  t3_inkoopplannen: Rij | null;
  t4_reserveringen_per_status: Rij[];
  t5_materiaal_aanvragen: Rij[];
  t6_goedgekeurd_ouderdom: Rij | null;
  t7_mod_calc_inkoop_items: Rij | null;
  t8_onderaannemer_orders_per_status: Rij[];
  t9_algemene_inkopen_per_soort: Rij[];
  t10_aanmakers_per_profiel: Rij[];
  herstelronde_openstaand: Rij | null;
};

const SECTIES: Array<{ sleutel: keyof Meting; titel: string }> = [
  { sleutel: "t1_inkoopbonnen_per_status_maand", titel: "T1 — Inkoopbonnen per status per maand (12 mnd)" },
  { sleutel: "t2_magazijn_inkooporders_per_status_maand", titel: "T2 — Magazijn-inkooporders per status per maand (12 mnd)" },
  { sleutel: "t3_inkoopplannen", titel: "T3 — Inkoopplannen (totaal + met inkoopbon)" },
  { sleutel: "t4_reserveringen_per_status", titel: "T4 — Reserveringen per status" },
  { sleutel: "t5_materiaal_aanvragen", titel: "T5 — Materiaal-aanvragen per status × soort × volgens_opdracht" },
  { sleutel: "t6_goedgekeurd_ouderdom", titel: "T6 — Goedgekeurde aanvragen: ouderdom" },
  { sleutel: "t7_mod_calc_inkoop_items", titel: "T7 — Calculatie-inkoopitems (totaal + offerte ontvangen)" },
  { sleutel: "t8_onderaannemer_orders_per_status", titel: "T8 — Onderaannemer-orders per status" },
  { sleutel: "t9_algemene_inkopen_per_soort", titel: "T9 — Algemene inkopen per soort" },
  { sleutel: "t10_aanmakers_per_profiel", titel: "T10 — Wie maakt ze aan (per functie)" },
  { sleutel: "herstelronde_openstaand", titel: "Werkbak — open items bij al afgehandelde aanvragen" },
];

function naarRijen(waarde: Meting[keyof Meting]): Rij[] {
  if (waarde == null) return [];
  return Array.isArray(waarde) ? waarde : [waarde as Rij];
}

function TabelSectie({ titel, rijen }: { titel: string; rijen: Rij[] }) {
  const kolommen = rijen.length > 0 ? Object.keys(rijen[0]) : [];
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{titel}</CardTitle></CardHeader>
      <CardContent>
        {rijen.length === 0 ? (
          <p className="text-sm text-muted-foreground">0 rijen — de tabel is leeg. Dat is een antwoord, geen fout.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  {kolommen.map((k) => <th key={k} className="py-1 pr-4 font-medium">{k}</th>)}
                </tr>
              </thead>
              <tbody>
                {rijen.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {kolommen.map((k) => <td key={k} className="py-1 pr-4">{String(r[k] ?? "—")}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function naarMarkdown(m: Meting): string {
  const delen: string[] = [
    `# MATERIAAL_01 — telling inkoopgebruik`,
    `Gemeten op: ${m.gemeten_op} · omgeving: ${m.omgeving} · commit: ${m.commit ?? "onbekend"}`,
  ];
  for (const s of SECTIES) {
    const rijen = naarRijen(m[s.sleutel]);
    delen.push(`\n## ${s.titel}`);
    if (rijen.length === 0) { delen.push(`(0 rijen — tabel leeg)`); continue; }
    const kolommen = Object.keys(rijen[0]);
    delen.push(`| ${kolommen.join(" | ")} |`);
    delen.push(`|${kolommen.map(() => "---").join("|")}|`);
    for (const r of rijen) delen.push(`| ${kolommen.map((k) => String(r[k] ?? "—")).join(" | ")} |`);
  }
  return delen.join("\n");
}

export default function MetingenMateriaalBeheer() {
  const { rol } = useRol();
  const { toast } = useToast();
  const [meting, setMeting] = useState<Meting | null>(null);
  const [laden, setLaden] = useState(false);
  const [herstelLoopt, setHerstelLoopt] = useState(false);

  const laadMeting = useCallback(async () => {
    setLaden(true);
    try {
      const r = await fetch("/api/metingen/materiaal01", { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setMeting(await r.json() as Meting);
    } catch (e) {
      toast({ title: "Telling mislukt", description: String(e), variant: "destructive" });
    } finally {
      setLaden(false);
    }
  }, [toast]);

  const draaiHerstel = useCallback(async () => {
    setHerstelLoopt(true);
    try {
      const r = await fetch("/api/metingen/materiaal01/herstel", { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json() as { gesloten: number };
      toast({ title: "Herstelronde uitgevoerd", description: `${data.gesloten} werkbakitem(s) afgehandeld.` });
      void laadMeting();
    } catch (e) {
      toast({ title: "Herstelronde mislukt", description: String(e), variant: "destructive" });
    } finally {
      setHerstelLoopt(false);
    }
  }, [toast, laadMeting]);

  if (rol !== "hoofdbeheerder") {
    return <div className="p-6 text-sm text-muted-foreground">Alleen de hoofdbeheerder kan deze meting draaien.</div>;
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h1 data-paginatitel className="text-xl font-semibold">Meting inkoopgebruik (MATERIAAL_01)</h1>
          <p className="text-sm text-muted-foreground">
            Read-only telling van alle inkoopsporen. Nulwaarden zijn een antwoord — de duiding is aan de directie.
          </p>
        </div>
        <Button onClick={() => void laadMeting()} disabled={laden} data-testid="button-meting-draaien">
          <RefreshCw className={`mr-2 h-4 w-4 ${laden ? "animate-spin" : ""}`} />Telling draaien
        </Button>
        {meting && (
          <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(naarMarkdown(meting)); toast({ title: "Gekopieerd als markdown" }); }} data-testid="button-meting-kopieren">
            <ClipboardCopy className="mr-2 h-4 w-4" />Kopieer als markdown
          </Button>
        )}
        <Button variant="outline" onClick={() => void draaiHerstel()} disabled={herstelLoopt} data-testid="button-herstelronde">
          <Wrench className="mr-2 h-4 w-4" />Herstelronde werkbak
        </Button>
      </div>
      {meting && (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline">Gemeten: {new Date(meting.gemeten_op).toLocaleString("nl-NL")}</Badge>
            <Badge variant="outline">Omgeving: {meting.omgeving}</Badge>
            {meting.commit && <Badge variant="outline">Commit: {meting.commit.slice(0, 8)}</Badge>}
          </div>
          <div className="grid gap-4">
            {SECTIES.map((s) => <TabelSectie key={s.sleutel} titel={s.titel} rijen={naarRijen(meting[s.sleutel])} />)}
          </div>
        </>
      )}
      {!meting && !laden && (
        <p className="text-sm text-muted-foreground">Klik op "Telling draaien" om de meting uit te voeren.</p>
      )}
    </div>
  );
}
