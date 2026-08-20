// ── ADMINISTRATIE_02 §3: crediteuren-betaalbatch (SEPA pain.001) ─────────────
// De functie staat achter de akkoord-schakelaar betaalbatch_actief (standaard
// uit). Zolang die uit staat toont deze pagina dat de functie op directie-
// akkoord wacht; de endpoints weigeren dan met 423.
import { useState } from "react";
import { Link } from "wouter";
import {
  useListBetaalbatches, useCreateBetaalbatch, useListBetaalbareFacturen,
  useBevestigBetaalbatch, useAnnuleerBetaalbatch, useListWerkgevers,
  useUpdateInfoInstellingen,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/auth-context";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Banknote, Download, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

const euro = (v: number) => `€ ${v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_LABEL: Record<string, { label: string; klasse: string }> = {
  concept: { label: "Concept", klasse: "bg-slate-100 text-slate-700" },
  bestand_aangemaakt: { label: "Bestand aangemaakt", klasse: "bg-blue-100 text-blue-800" },
  bevestigd: { label: "Handmatig bevestigd", klasse: "bg-amber-100 text-amber-800" },
  uitgevoerd: { label: "Uitgevoerd (bankbewijs)", klasse: "bg-green-100 text-green-800" },
  geannuleerd: { label: "Geannuleerd", klasse: "bg-slate-100 text-slate-500 line-through" },
};

export default function BetaalbatchPagina() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { gebruiker } = useAuth();
  const isHoofdbeheerder = gebruiker?.rol === "hoofdbeheerder";
  const [werkgeverId, setWerkgeverId] = useState<string>("");
  const [uitvoerdatum, setUitvoerdatum] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [geselecteerd, setGeselecteerd] = useState<Set<number>>(new Set());

  const invalideer = () => {
    queryClient.invalidateQueries({ queryKey: ["betaalbatches"] });
    queryClient.invalidateQueries({ queryKey: ["betaalbare-facturen"] });
    queryClient.invalidateQueries({ queryKey: ["facturen"] });
  };

  const { data: werkgevers = [] } = useListWerkgevers({ query: { queryKey: ["werkgevers"] } });
  const batchesQ = useListBetaalbatches({ query: { queryKey: ["betaalbatches"], retry: false } });
  const wgId = Number.parseInt(werkgeverId, 10);
  const betaalbaarQ = useListBetaalbareFacturen(
    { werkgever_id: wgId },
    { query: { queryKey: ["betaalbare-facturen", wgId], enabled: Number.isFinite(wgId), retry: false } },
  );

  // 423 = schakelaar uit; dat melden we prominent.
  const uitgeschakeld =
    (batchesQ.error as { status?: number } | null)?.status === 423 ||
    (betaalbaarQ.error as { status?: number } | null)?.status === 423;

  // FACTUUR_03: de akkoord-schakelaar — alleen de hoofdbeheerder (directie)
  // kan hem omzetten; de server dwingt dit ook af (403).
  const instellingMut = useUpdateInfoInstellingen({
    mutation: {
      onSuccess: () => {
        toast({ title: "Betaalbatch ingeschakeld", description: "Het directie-akkoord is vastgelegd." });
        invalideer();
      },
      onError: (e) => toast({ title: "Inschakelen mislukt", description: (e as { message?: string })?.message ?? "Onbekende fout", variant: "destructive" }),
    },
  });

  const createMut = useCreateBetaalbatch({
    mutation: {
      onSuccess: (r) => {
        toast({ title: `Betaalbatch ${r.id} aangemaakt`, description: `${r.aantal_betalingen} betaling(en), ${euro(r.totaal_bedrag ?? 0)}` });
        setGeselecteerd(new Set());
        invalideer();
      },
      onError: (e: unknown) => {
        const detail = (e as { data?: { detail?: string[] } })?.data?.detail;
        toast({ title: "Batch aanmaken mislukt", description: Array.isArray(detail) ? detail.join("; ") : undefined, variant: "destructive" });
      },
    },
  });
  const bevestigMut = useBevestigBetaalbatch({
    mutation: {
      onSuccess: () => { toast({ title: "Batch bevestigd — facturen staan op betaald" }); invalideer(); },
      onError: () => toast({ title: "Bevestigen mislukt", variant: "destructive" }),
    },
  });
  const annuleerMut = useAnnuleerBetaalbatch({
    mutation: {
      onSuccess: () => { toast({ title: "Batch geannuleerd" }); invalideer(); },
      onError: () => toast({ title: "Annuleren mislukt", variant: "destructive" }),
    },
  });

  const items = betaalbaarQ.data?.items ?? [];
  const betaalbaar = items.filter((i) => i.betaalbaar);
  const nietBetaalbaar = items.filter((i) => !i.betaalbaar);
  const selectieBedrag = betaalbaar.filter((i) => geselecteerd.has(i.factuur_id)).reduce((s, i) => s + i.bedrag, 0);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/facturen"><ArrowLeft className="h-4 w-4 mr-1" /> Facturen</Link>
        </Button>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Banknote className="h-5 w-5" /> Crediteuren-betaalbatch (SEPA)
        </h1>
      </div>

      {uitgeschakeld && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-4 flex items-start gap-3 text-amber-800 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">De betaalfunctie staat uit.</p>
              <p>Deze gaat pas werken na uitdrukkelijk akkoord van de directie (instelling "betaalbatch actief" in Beheer → Instellingen).</p>
              {isHoofdbeheerder && (
                <Button
                  size="sm"
                  className="mt-2"
                  disabled={instellingMut.isPending}
                  onClick={() => instellingMut.mutate({ data: { betaalbatch_actief: true } })}
                  data-testid="button-betaalbatch-inschakelen"
                >
                  Betaalbatch inschakelen (directie-akkoord)
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Nieuwe batch samenstellen */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Nieuwe batch samenstellen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Werkmaatschappij (BV)</p>
              <Select value={werkgeverId} onValueChange={(v) => { setWerkgeverId(v); setGeselecteerd(new Set()); }}>
                <SelectTrigger className="w-64"><SelectValue placeholder="Kies werkmaatschappij" /></SelectTrigger>
                <SelectContent>
                  {werkgevers.map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>{w.naam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Gewenste uitvoerdatum</p>
              <Input type="date" className="w-44" value={uitvoerdatum} onChange={(e) => setUitvoerdatum(e.target.value)} />
            </div>
            <Button
              disabled={!Number.isFinite(wgId) || geselecteerd.size === 0 || createMut.isPending}
              onClick={() => createMut.mutate({ data: { werkgever_id: wgId, uitvoerdatum, factuur_ids: [...geselecteerd] } })}
            >
              Batch aanmaken ({geselecteerd.size} · {euro(selectieBedrag)})
            </Button>
          </div>

          {Number.isFinite(wgId) && !uitgeschakeld && (
            <div className="space-y-3">
              {betaalbaar.length === 0 && <p className="text-sm text-muted-foreground">Geen betaalbare facturen voor deze werkmaatschappij.</p>}
              {betaalbaar.map((f) => (
                <label key={f.factuur_id} className="flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer">
                  <Checkbox
                    checked={geselecteerd.has(f.factuur_id)}
                    onCheckedChange={(v) => setGeselecteerd((prev) => {
                      const n = new Set(prev);
                      if (v === true) n.add(f.factuur_id); else n.delete(f.factuur_id);
                      return n;
                    })}
                  />
                  <span className="font-mono text-sm">{f.factuurnummer ?? `#${f.factuur_id}`}</span>
                  <span className="text-sm text-muted-foreground flex-1 truncate">{f.relatienaam ?? "—"}</span>
                  {f.vervaldatum && <span className="text-xs text-muted-foreground">verval {f.vervaldatum}</span>}
                  <span className="font-mono text-sm">{euro(f.bedrag)}</span>
                </label>
              ))}
              {nietBetaalbaar.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">
                    {nietBetaalbaar.length} factu{nietBetaalbaar.length === 1 ? "ur valt" : "ren vallen"} buiten de batch (met reden)
                  </summary>
                  <div className="mt-2 space-y-1">
                    {nietBetaalbaar.map((f) => (
                      <div key={f.factuur_id} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <XCircle className="h-3 w-3 text-red-400 shrink-0" />
                        <span className="font-mono">{f.factuurnummer ?? `#${f.factuur_id}`}</span>
                        <span>{f.reden}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bestaande batches */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Batches</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(batchesQ.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nog geen batches.</p>}
          {(batchesQ.data ?? []).map((b) => {
            const st = STATUS_LABEL[b.status] ?? { label: b.status, klasse: "bg-slate-100 text-slate-700" };
            return (
              <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm">
                <span className="font-mono">{b.bestand_referentie ?? `Batch ${b.id}`}</span>
                <Badge className={`${st.klasse} hover:${st.klasse}`}>{st.label}</Badge>
                <span className="text-muted-foreground">{b.werkgever_naam ?? "—"}</span>
                <span className="text-muted-foreground">uitvoer {b.uitvoerdatum}</span>
                <span className="font-mono ml-auto">{b.aantal_betalingen}x · {euro(b.totaal_bedrag)}</span>
                {b.status !== "geannuleerd" && b.status !== "bevestigd" && (
                  <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                    <a href={`${import.meta.env.BASE_URL}api/betaalbatches/${b.id}/pain001`} download>
                      <Download className="h-3 w-3 mr-1" /> SEPA-bestand
                    </a>
                  </Button>
                )}
                {b.status === "bestand_aangemaakt" && (
                  <Button size="sm" className="h-7 text-xs"
                    onClick={() => bevestigMut.mutate({ id: b.id })} disabled={bevestigMut.isPending}>
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Bevestigen (op betaald zetten)
                  </Button>
                )}
                {(b.status === "concept" || b.status === "bestand_aangemaakt") && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600"
                    onClick={() => annuleerMut.mutate({ id: b.id })} disabled={annuleerMut.isPending}>
                    Annuleren
                  </Button>
                )}
              </div>
            );
          })}
          <div className="pt-4 mt-2 border-t flex justify-between items-center text-sm">
            <p className="text-muted-foreground">
              Voor automatische reconciliatie van uitgevoerde batches, zie de bankafschriften werkruimte.
            </p>
            {((gebruiker as any)?.bevoegdheden?.bankafschriften ?? 0) >= 1 && (
              <Button variant="link" size="sm" asChild>
                <Link href="/facturen/bankafschriften">Naar Bankafschriften →</Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
