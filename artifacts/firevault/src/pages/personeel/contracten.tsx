import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, ChevronRight, Clock, RefreshCw } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type ContractRegel = {
  id: number;
  medewerker_id: number;
  medewerker_naam: string | null;
  functie_naam: string | null;
  contracttype: string;
  start_datum: string;
  eind_datum: string | null;
  dagen_tot_einde: number | null;
  cao: string | null;
  status: string;
};

type Signalering = {
  id: number;
  contract_id: number;
  medewerker_id: number;
  medewerker_naam: string | null;
  type: string;
  ernst: string;
  boodschap: string;
  ai_advies: string | null;
  status: string;
  aangemaakt_op: string;
};

type BesluitRegel = {
  id: number;
  contract_id: number;
  medewerker_id: number;
  medewerker_naam: string | null;
  besluit: string;
  status: string;
  bijgewerkt_op: string;
};

type Dashboard = {
  buckets: {
    verlopen: ContractRegel[];
    binnen30: ContractRegel[];
    binnen60: ContractRegel[];
    binnen90: ContractRegel[];
    binnen120: ContractRegel[];
    onbepaaldeTijd: number;
  };
  signaleringen: Signalering[];
  besluiten_in_behandeling: BesluitRegel[];
};

// ── Labels ───────────────────────────────────────────────────────────────────

const CONTRACTTYPE_LABEL: Record<string, string> = {
  bepaalde_tijd: "Bepaalde tijd",
  onbepaalde_tijd: "Onbepaalde tijd",
  oproep: "Oproepcontract",
  stage: "Stage",
  leer_werk: "Leer-werk",
};

const ERNST_VARIANT: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
  kritiek: "destructive",
  waarschuwing: "default",
  info: "secondary",
};

const BESLUIT_LABEL: Record<string, string> = {
  verlengen: "Verlengen",
  wijzigen: "Wijzigen",
  onbepaalde_tijd: "Omzetten naar onbepaalde tijd",
  beëindigen: "Beëindigen",
  geen_besluit: "Nog geen besluit",
};

const BESLUIT_STATUS_LABEL: Record<string, string> = {
  in_behandeling: "In behandeling",
  documenten_op: "Documenten opstellen",
  wacht_handtekening: "Wacht op handtekening",
  afgerond: "Afgerond",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDatum(d: string): string {
  return new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

function dagLabel(dagen: number | null): string {
  if (dagen === null) return "—";
  if (dagen < 0) return `${Math.abs(dagen)} dag(en) geleden verlopen`;
  if (dagen === 0) return "Verloopt vandaag";
  return `Nog ${dagen} dag(en)`;
}

// ── Bucket-kaart ─────────────────────────────────────────────────────────────

function BucketKaart({
  titel,
  contracten,
  kleur,
}: {
  titel: string;
  contracten: ContractRegel[];
  kleur: "rood" | "oranje" | "geel" | "grijs";
}) {
  const kleuren = {
    rood: "border-red-500 bg-red-50",
    oranje: "border-orange-400 bg-orange-50",
    geel: "border-yellow-400 bg-yellow-50",
    grijs: "border-slate-300 bg-slate-50",
  };

  if (contracten.length === 0) return null;

  return (
    <Card className={`border-l-4 ${kleuren[kleur]}`}>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Clock className="h-4 w-4" />
          {titel}
          <Badge variant="outline" className="ml-auto text-xs">{contracten.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <ul className="space-y-2">
          {contracten.map((c) => (
            <li key={c.id}>
              <Link href={`/personeel/${c.medewerker_id}?tab=contracten`}>
                <div className="flex items-center justify-between rounded-md hover:bg-white/70 px-2 py-1.5 cursor-pointer transition-colors">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{c.medewerker_naam ?? "Onbekend"}</p>
                    <p className="text-xs text-slate-500">
                      {CONTRACTTYPE_LABEL[c.contracttype] ?? c.contracttype}
                      {c.eind_datum ? ` · ${formatDatum(c.eind_datum)}` : ""}
                      {c.dagen_tot_einde !== null ? ` · ${dagLabel(c.dagen_tot_einde)}` : ""}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ── Hoofd-component ───────────────────────────────────────────────────────────

export default function ContractbewakingPagina() {
  const { heeftNiveau } = useBevoegdheid();
  const mag = heeftNiveau("personeel", 1);

  const [data, setData] = useState<Dashboard | null>(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  async function laadDashboard() {
    setLaden(true);
    setFout(null);
    try {
      const resp = await fetch("/api/contract-bewaking/dashboard");
      if (!resp.ok) throw new Error("Kon dashboard niet laden");
      setData(await resp.json());
    } catch {
      setFout("Dashboard kon niet worden geladen. Controleer of de server bereikbaar is.");
    } finally {
      setLaden(false);
    }
  }

  async function markeerGezien(sigId: number) {
    await fetch(`/api/contract-bewaking/signaleringen/${sigId}/gezien`, { method: "PATCH" });
    setData((prev) =>
      prev
        ? {
            ...prev,
            signaleringen: prev.signaleringen.map((s) =>
              s.id === sigId ? { ...s, status: "gezien" } : s,
            ),
          }
        : prev,
    );
  }

  useEffect(() => { laadDashboard(); }, []);

  if (!mag) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>U heeft geen toegang tot de contractbewaking.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const actieveSig = data?.signaleringen.filter((s) => s.status === "nieuw") ?? [];
  const kritiek = actieveSig.filter((s) => s.ernst === "kritiek");
  const waarschuwing = actieveSig.filter((s) => s.ernst === "waarschuwing");

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Kop */}
      <div className="flex items-center justify-between">
        <div>
          <h1 data-paginatitel className="text-xl font-bold text-slate-900">Contractbewaking</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Tijdelijke arbeidsovereenkomsten bewaken en verlengen
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setBezig(true); laadDashboard().finally(() => setBezig(false)); }}
          disabled={bezig}
        >
          <RefreshCw className={`h-4 w-4 mr-1.5 ${bezig ? "animate-spin" : ""}`} />
          Vernieuwen
        </Button>
      </div>

      {fout && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{fout}</AlertDescription>
        </Alert>
      )}

      {laden && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      )}

      {!laden && data && (
        <>
          {/* Kritieke signaleringen bovenaan */}
          {kritiek.length > 0 && (
            <div className="space-y-2">
              {kritiek.map((s) => (
                <Alert key={s.id} variant="destructive" className="flex items-start gap-3">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <AlertDescription className="font-medium">{s.boodschap}</AlertDescription>
                    {s.ai_advies && (
                      <p className="text-xs mt-1 opacity-80">{s.ai_advies}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-xs h-7"
                    onClick={() => markeerGezien(s.id)}
                  >
                    Gezien
                  </Button>
                </Alert>
              ))}
            </div>
          )}

          {waarschuwing.length > 0 && (
            <div className="space-y-2">
              {waarschuwing.map((s) => (
                <Alert key={s.id} className="flex items-start gap-3 border-orange-300 bg-orange-50">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-orange-500" />
                  <div className="flex-1 min-w-0">
                    <AlertDescription className="text-orange-800 font-medium">{s.boodschap}</AlertDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-xs h-7"
                    onClick={() => markeerGezien(s.id)}
                  >
                    Gezien
                  </Button>
                </Alert>
              ))}
            </div>
          )}

          {/* Statistieken */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Verlopen", waarde: data.buckets.verlopen.length, kleur: "text-red-600" },
              { label: "Binnen 30 dagen", waarde: data.buckets.binnen30.length, kleur: "text-orange-600" },
              { label: "Binnen 60 dagen", waarde: data.buckets.binnen60.length, kleur: "text-yellow-600" },
              { label: "Binnen 90 dagen", waarde: data.buckets.binnen90.length, kleur: "text-slate-600" },
            ].map((item) => (
              <Card key={item.label} className="text-center p-4">
                <p className={`text-2xl font-bold ${item.kleur}`}>{item.waarde}</p>
                <p className="text-xs text-slate-500 mt-1">{item.label}</p>
              </Card>
            ))}
          </div>

          {/* Buckets */}
          <div className="space-y-3">
            <BucketKaart titel="Verlopen" contracten={data.buckets.verlopen} kleur="rood" />
            <BucketKaart titel="Verloopt binnen 30 dagen" contracten={data.buckets.binnen30} kleur="rood" />
            <BucketKaart titel="Verloopt binnen 60 dagen" contracten={data.buckets.binnen60} kleur="oranje" />
            <BucketKaart titel="Verloopt binnen 90 dagen" contracten={data.buckets.binnen90} kleur="geel" />
            <BucketKaart titel="Verloopt binnen 120 dagen" contracten={data.buckets.binnen120} kleur="grijs" />
          </div>

          {/* Besluiten in behandeling */}
          {data.besluiten_in_behandeling.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-700 mb-2">Besluitvorming in behandeling</h2>
              <Card>
                <CardContent className="p-0">
                  <ul className="divide-y">
                    {data.besluiten_in_behandeling.map((b) => (
                      <li key={b.id}>
                        <Link href={`/personeel/${b.medewerker_id}?tab=contracten`}>
                          <div className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors">
                            <div>
                              <p className="text-sm font-medium text-slate-800">{b.medewerker_naam ?? "Onbekend"}</p>
                              <p className="text-xs text-slate-500">
                                {BESLUIT_LABEL[b.besluit] ?? b.besluit}
                                {" · "}
                                {BESLUIT_STATUS_LABEL[b.status] ?? b.status}
                              </p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          )}

          {data.buckets.verlopen.length === 0 &&
            data.buckets.binnen30.length === 0 &&
            data.buckets.binnen60.length === 0 &&
            data.buckets.binnen90.length === 0 &&
            data.buckets.binnen120.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-slate-500 text-sm">Geen tijdelijke contracten die binnenkort verlopen.</p>
                  <p className="text-slate-400 text-xs mt-1">
                    Contracten registreer je via de medewerker-detailpagina &rsaquo; Contracten.
                  </p>
                </CardContent>
              </Card>
            )}
        </>
      )}
    </div>
  );
}
