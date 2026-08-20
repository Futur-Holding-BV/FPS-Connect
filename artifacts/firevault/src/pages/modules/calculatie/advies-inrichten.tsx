import React, { useState, useCallback, useEffect } from "react";
import {
  useAdviesrapportAnalyseCalculatie,
  useCalcPlakVeldCorrectie,
  useCreateModCalcRegel,
  useListGekoppeldeDocumenten,
  type CalcAdviesAnalyse,
  type CalcAdviesVoorstel,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ClipboardList, CheckCircle2, AlertTriangle, Loader2, FileText,
  Pencil, SkipForward, HelpCircle, Link2, Link2Off,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── Hulpjes ─────────────────────────────────────────────────────────────────

function fmtBedrag(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
}
function fmtGetal(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 3 }).format(n);
}
function fmtDatum(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" }).format(dt);
}

// AI-geel voor voorgestelde velden (§ AI-voorstel = amber; bevestigd = neutraal)
const AI_VELD = "border-amber-200 bg-amber-50 focus-visible:ring-amber-400 focus-visible:border-amber-400";

// Per punt: status en de bewerkbare draftvelden.
type PuntStatus = "open" | "bevestigd" | "overgeslagen";
type PuntDraft = {
  regelnummer: string;
  hoofdstuk: string;
  omschrijving: string;
  hoeveelheid: string;      // §6: nooit geschat — begint leeg, calculator vult in
  eenheid: string;
  tarief: string;           // vast als artikel gekoppeld; anders handmatig
  gekozenNormtijdId: number | null; // alleen_normtijd/ongekoppeld: keuze uit kandidaten
};

function draftUitVoorstel(v: CalcAdviesVoorstel): PuntDraft {
  const cr = v.conceptregel;
  return {
    regelnummer: v.regelnummer ?? v.nummer ?? "",
    hoofdstuk: v.hoofdstuk ?? "Overige werkzaamheden",
    omschrijving: v.omschrijving ?? v.geadviseerd_herstel ?? v.tekortkoming ?? "",
    hoeveelheid: "",
    eenheid: cr?.eenheid ?? v.artikel?.eenheid ?? v.normtijd?.eenheid ?? "st",
    tarief: cr?.tarief != null ? String(cr.tarief) : "",
    gekozenNormtijdId: null,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AdviesInrichten({
  calculatieId,
  openDocumentId,
  onAfgehandeld,
  onOvergenomen,
}: {
  calculatieId: number;
  /** Wanneer gezet (via ?adviesrapport=<id>) opent het paneel automatisch met dit rapport. */
  openDocumentId: number | null;
  /** Aangeroepen als de gebruiker het paneel sluit (om de query-param op te ruimen). */
  onAfgehandeld: () => void;
  /** Aangeroepen na elke toegevoegde regel zodat de calculatie herrekend wordt. */
  onOvergenomen: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [documentId, setDocumentId] = useState<number | null>(null);
  const [analyse, setAnalyse] = useState<CalcAdviesAnalyse | null>(null);
  const [status, setStatus] = useState<Record<number, PuntStatus>>({});
  const [drafts, setDrafts] = useState<Record<number, PuntDraft>>({});
  const [bewerken, setBewerken] = useState<Record<number, boolean>>({});

  // Adviesrapporten horen bij deze calculatiecontext en nooit in Productrapporten.
  const { data: documenten = [] } = useListGekoppeldeDocumenten({
    doel_type: "calculatie",
    doel_id: calculatieId,
  }, {
    query: { queryKey: ["calculatie-adviesrapporten", calculatieId], enabled: open },
  });
  const adviesrapporten = React.useMemo(
    () => (Array.isArray(documenten) ? documenten : []).filter((d: any) => {
      const cat = d?.ai_metadata?.categorie;
      return cat === "adviesrapport";
    }),
    [documenten],
  );

  const analyseMut = useAdviesrapportAnalyseCalculatie();
  const createRegelMut = useCreateModCalcRegel();
  const correctieMut = useCalcPlakVeldCorrectie();

  const logCorrectie = useCallback((veld: string, aiVoorstel: string, gekozen: string) => {
    if (aiVoorstel === gekozen) return;
    correctieMut.mutate({ data: { veld_naam: veld, ai_voorstel: aiVoorstel, gekozen } });
  }, [correctieMut]);

  const startAnalyse = useCallback((docId: number) => {
    setDocumentId(docId);
    analyseMut.mutate(
      { id: calculatieId, data: { document_id: docId } },
      {
        onSuccess: (data) => {
          setAnalyse(data);
          const nieuweDrafts: Record<number, PuntDraft> = {};
          (data.voorstellen ?? []).forEach((v, i) => { nieuweDrafts[i] = draftUitVoorstel(v); });
          setDrafts(nieuweDrafts);
          setStatus({});
          setBewerken({});
          if (data.waarschuwing) {
            toast({ title: "Let op", description: data.waarschuwing });
          }
        },
        onError: () => toast({ title: "Inlezen mislukt", description: "Het adviesrapport kon niet worden ingelezen.", variant: "destructive" }),
      },
    );
  }, [analyseMut, calculatieId, toast]);

  // Auto-open bij ?adviesrapport=<id>.
  useEffect(() => {
    if (openDocumentId != null && !open) {
      setOpen(true);
      startAnalyse(openDocumentId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDocumentId]);

  const sluit = useCallback(() => {
    setOpen(false);
    setAnalyse(null);
    setDocumentId(null);
    setStatus({});
    setDrafts({});
    setBewerken({});
    onAfgehandeld();
  }, [onAfgehandeld]);

  const zetDraft = useCallback((i: number, patch: Partial<PuntDraft>) => {
    setDrafts((prev) => ({ ...prev, [i]: { ...prev[i], ...patch } }));
  }, []);

  const bevestig = useCallback((i: number) => {
    if (!analyse) return;
    const v = analyse.voorstellen[i];
    const d = drafts[i];
    if (!v || !d) return;

    // §4.3.2 tekstregel "geen werkzaamheden aannemer" → soort tekst, geen bedragen.
    if (v.soortvoorstel === "geen_werkzaamheden") {
      const regelData: Record<string, unknown> = {
        soort: "tekst",
        categorie: "arbeid",
        omschrijving: d.omschrijving || v.tekstregel || "Geen werkzaamheden aannemer",
        eenheid: d.eenheid || "st",
        hoeveelheid: 0,
        tarief: 0,
        regelnummer: d.regelnummer || null,
        hoofdstuk: d.hoofdstuk || "Overige werkzaamheden",
      };
      createRegelMut.mutate({ id: calculatieId, data: regelData as any }, {
        onSuccess: () => { setStatus((s) => ({ ...s, [i]: "bevestigd" })); onOvergenomen(); toast({ title: "Tekstregel toegevoegd" }); },
        onError: () => toast({ title: "Toevoegen mislukt", variant: "destructive" }),
      });
      return;
    }

    // Werkzaamheden / niet-te-beoordelen → gewone regel. Prijs/uren nooit stil 0.
    const cr = v.conceptregel;

    // mu_per_eenheid UITSLUITEND uit gekoppelde/gekozen normtijd.
    let muPerEenheid: number | null = null;
    let normtijdIdUit: number | null = null;
    if (v.normtijd?.id != null) {
      muPerEenheid = v.normtijd.uren_per_eenheid;
      normtijdIdUit = v.normtijd.id;
    } else if (d.gekozenNormtijdId != null) {
      const nt = (v.normtijd_kandidaten ?? []).find((n) => n.id === d.gekozenNormtijdId);
      if (nt) { muPerEenheid = nt.uren_per_eenheid; normtijdIdUit = nt.id; }
    } else if (cr?.mu_per_eenheid != null) {
      muPerEenheid = cr.mu_per_eenheid;
    }

    // Tarief: uit artikel (conceptregel) of handmatig ingevoerd. Nooit verzonnen 0.
    let tariefWaarde: number | null = cr?.tarief != null ? cr.tarief : null;
    if (d.tarief.trim() !== "") {
      const parsed = parseFloat(d.tarief);
      if (!Number.isNaN(parsed)) tariefWaarde = parsed;
    }

    const hoeveelheid = d.hoeveelheid.trim() !== "" ? parseFloat(d.hoeveelheid) : NaN;
    if (Number.isNaN(hoeveelheid)) {
      toast({ title: "Vul een hoeveelheid in", description: "Hoeveelheden worden nooit geschat — vul deze zelf in.", variant: "destructive" });
      return;
    }
    if (tariefWaarde == null && muPerEenheid == null) {
      toast({ title: "Ontbrekende prijs of normtijd", description: "Koppel een artikel/normtijd of vul een tarief in.", variant: "destructive" });
      return;
    }

    // Leerbron: logt AI-voorstel vs. keuze van de calculator (§4.5).
    logCorrectie("advies.omschrijving", v.omschrijving ?? "", d.omschrijving);
    logCorrectie("advies.regelnummer", v.regelnummer ?? "", d.regelnummer);
    logCorrectie("advies.hoofdstuk", v.hoofdstuk ?? "", d.hoofdstuk);

    const regelData: Record<string, unknown> = {
      soort: "regel",
      categorie: cr?.categorie ?? (v.artikel ? "materiaal" : "arbeid"),
      omschrijving: d.omschrijving,
      eenheid: d.eenheid,
      hoeveelheid,
      tarief: tariefWaarde ?? 0,
      regelnummer: d.regelnummer || null,
      hoofdstuk: d.hoofdstuk || "Overige werkzaamheden",
      normtijd_id: normtijdIdUit,
    };
    if (muPerEenheid != null) regelData.mu_per_eenheid = muPerEenheid;
    if (!cr?.arbeids_tarief_ontbreekt && cr?.arbeids_tarief != null) {
      regelData.arbeids_tarief = cr.arbeids_tarief;
    }

    createRegelMut.mutate({ id: calculatieId, data: regelData as any }, {
      onSuccess: () => { setStatus((s) => ({ ...s, [i]: "bevestigd" })); onOvergenomen(); toast({ title: "Regel toegevoegd" }); },
      onError: () => toast({ title: "Toevoegen mislukt", variant: "destructive" }),
    });
  }, [analyse, drafts, calculatieId, createRegelMut, logCorrectie, onOvergenomen, toast]);

  const voorstellen = analyse?.voorstellen ?? [];
  const bevestigdAantal = Object.values(status).filter((s) => s === "bevestigd").length;
  const overgeslagenAantal = Object.values(status).filter((s) => s === "overgeslagen").length;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ClipboardList className="h-4 w-4 mr-2" />
        Adviesrapport inlezen
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (!o) sluit(); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-amber-600" />
              Adviesrapport inlezen
            </DialogTitle>
            <DialogDescription>
              Elk genummerd punt wordt als voorstel getoond. Niets wordt automatisch overgenomen —
              bevestig, pas aan of sla over per punt.
            </DialogDescription>
          </DialogHeader>

          {/* Rapport kiezen (als er nog geen analyse is) */}
          {!analyse && (
            <div className="space-y-3">
              <Label>Kies een gearchiveerd adviesrapport</Label>
              {analyseMut.isPending ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                  <Loader2 className="h-4 w-4 animate-spin" /> Adviesrapport wordt uitgelezen…
                </div>
              ) : adviesrapporten.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Geen adviesrapporten aan deze calculatie gekoppeld.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {adviesrapporten.map((d: any) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => startAnalyse(d.id)}
                      className="w-full flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left hover:bg-muted/40 transition"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium truncate">{d.naam}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Analyse-resultaat */}
          {analyse && (
            <div className="space-y-4">
              {/* Telbalk §8.6 / §8.11 */}
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                <span className="font-medium">{analyse.punten_aantal} punten in rapport</span>
                <span className="text-muted-foreground">·</span>
                <span>{voorstellen.length} voorstellen</span>
                <span className="text-muted-foreground">·</span>
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">{bevestigdAantal} bevestigd</Badge>
                {overgeslagenAantal > 0 && (
                  <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">{overgeslagenAantal} overgeslagen</Badge>
                )}
                {analyse.koppelgraad && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    Koppeling: {analyse.koppelgraad.volledig} volledig · {analyse.koppelgraad.alleen_artikel} alleen artikel ·
                    {" "}{analyse.koppelgraad.alleen_normtijd} alleen normtijd · {analyse.koppelgraad.ongekoppeld} ongekoppeld
                  </span>
                )}
              </div>

              {analyse.punten_aantal !== voorstellen.length && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{analyse.waarschuwing ?? "Aantal punten en voorstellen verschilt — controleer of alle punten aanwezig zijn."}</span>
                </div>
              )}

              {/* Punt-kaarten */}
              <div className="space-y-3">
                {voorstellen.map((v, i) => {
                  const d = drafts[i];
                  if (!d) return null;
                  const st = status[i] ?? "open";
                  const inBewerking = bewerken[i] ?? false;
                  return (
                    <PuntKaart
                      key={i}
                      voorstel={v}
                      draft={d}
                      status={st}
                      inBewerking={inBewerking}
                      bezig={createRegelMut.isPending}
                      zetDraft={(patch) => zetDraft(i, patch)}
                      onBewerk={() => setBewerken((b) => ({ ...b, [i]: !inBewerking }))}
                      onBevestig={() => bevestig(i)}
                      onOversla={() => setStatus((s) => ({ ...s, [i]: "overgeslagen" }))}
                    />
                  );
                })}
              </div>

              <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={sluit}>Sluiten</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Punt-kaart ───────────────────────────────────────────────────────────────

function PuntKaart({
  voorstel: v,
  draft: d,
  status,
  inBewerking,
  bezig,
  zetDraft,
  onBewerk,
  onBevestig,
  onOversla,
}: {
  voorstel: CalcAdviesVoorstel;
  draft: PuntDraft;
  status: PuntStatus;
  inBewerking: boolean;
  bezig: boolean;
  zetDraft: (patch: Partial<PuntDraft>) => void;
  onBewerk: () => void;
  onBevestig: () => void;
  onOversla: () => void;
}) {
  const isVoorstel = status === "open";
  const cr = v.conceptregel;
  const kandidaten = v.normtijd_kandidaten ?? [];

  const soortBadge = {
    werkzaamheden: { label: "Werkzaamheden", klas: "bg-blue-50 text-blue-700 border-blue-200" },
    geen_werkzaamheden: { label: "Geen werkzaamheden aannemer", klas: "bg-slate-50 text-slate-600 border-slate-200" },
    niet_te_beoordelen: { label: "Niet te beoordelen", klas: "bg-purple-50 text-purple-700 border-purple-200" },
  }[v.soortvoorstel];

  const uitkomstBadge = v.uitkomst && {
    volledig: { icon: <Link2 className="h-3 w-3" />, label: "Artikel + normtijd", klas: "bg-green-50 text-green-700 border-green-200" },
    alleen_artikel: { icon: <Link2 className="h-3 w-3" />, label: "Alleen artikel", klas: "bg-amber-50 text-amber-700 border-amber-200" },
    alleen_normtijd: { icon: <Link2 className="h-3 w-3" />, label: "Alleen normtijd", klas: "bg-amber-50 text-amber-700 border-amber-200" },
    ongekoppeld: { icon: <Link2Off className="h-3 w-3" />, label: "Ongekoppeld", klas: "bg-red-50 text-red-700 border-red-200" },
  }[v.uitkomst];

  return (
    <div className={cn(
      "rounded-xl border p-4 space-y-3",
      status === "bevestigd" ? "border-green-200 bg-green-50/40" :
      status === "overgeslagen" ? "border-slate-200 bg-slate-50/60 opacity-70" :
      "border-amber-200 bg-amber-50/40",
    )}>
      {/* Kop */}
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-1 shrink-0">
          <span className="font-mono text-sm font-semibold bg-white border rounded px-2 py-1">{v.nummer}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={soortBadge.klas}>{soortBadge.label}</Badge>
            {uitkomstBadge && (
              <Badge variant="outline" className={cn("gap-1", uitkomstBadge.klas)}>{uitkomstBadge.icon}{uitkomstBadge.label}</Badge>
            )}
            {v.hoofdstuk && <span className="text-xs text-muted-foreground">{v.hoofdstuk}</span>}
            {status === "bevestigd" && <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 gap-1"><CheckCircle2 className="h-3 w-3" />Bevestigd</Badge>}
            {status === "overgeslagen" && <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 gap-1"><SkipForward className="h-3 w-3" />Overgeslagen</Badge>}
          </div>
          {v.tekortkoming && <p className="text-sm mt-1"><span className="text-muted-foreground">Tekortkoming: </span>{v.tekortkoming}</p>}
          {v.geadviseerd_herstel && <p className="text-sm"><span className="text-muted-foreground">Herstel: </span>{v.geadviseerd_herstel}</p>}
          {v.locatie && <p className="text-xs text-muted-foreground">Locatie: {v.locatie}</p>}
        </div>
      </div>

      {/* Niet te beoordelen: vervolgvraag */}
      {v.soortvoorstel === "niet_te_beoordelen" && v.vraag && (
        <div className="flex items-start gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm text-purple-900">
          <HelpCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{v.vraag}</span>
        </div>
      )}

      {/* Gekoppeld artikel / normtijd + inkoopherkomst */}
      {(v.artikel || v.normtijd) && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {v.artikel && (
            <p>
              Artikel: <span className="text-foreground font-medium">{v.artikel.omschrijving}</span>
              {v.artikel.leverancier_naam ? ` — ${v.artikel.leverancier_naam}` : ""}
              {" · verkoop "}{fmtBedrag(cr?.tarief)}
              {v.inkoop_bron === "afspraak" && (
                <span className="text-emerald-700"> · inkoopafspraak {fmtBedrag(v.afgesproken_inkoopprijs)} bij {v.afspraak_leverancier} (t/m {fmtDatum(v.afspraak_geldig_tot)})</span>
              )}
            </p>
          )}
          {v.normtijd && <p>Normtijd: <span className="text-foreground font-medium">{v.normtijd.omschrijving}</span> · {fmtGetal(v.normtijd.uren_per_eenheid)} u/{v.normtijd.eenheid}</p>}
        </div>
      )}

      {/* Bewerkbare regelvelden (alleen bij open + niet 'geen_werkzaamheden' óf altijd regelnummer) */}
      {isVoorstel && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Regelnummer</Label>
            <Input className={cn("h-8", AI_VELD)} value={d.regelnummer} onChange={(e) => zetDraft({ regelnummer: e.target.value })} />
          </div>
          <div className="space-y-1 col-span-2 md:col-span-3">
            <Label className="text-xs">Omschrijving</Label>
            <Input className={cn("h-8", inBewerking ? "" : AI_VELD)} value={d.omschrijving} readOnly={!inBewerking} onChange={(e) => zetDraft({ omschrijving: e.target.value })} />
          </div>

          {v.soortvoorstel !== "geen_werkzaamheden" && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Hoeveelheid</Label>
                <Input
                  className="h-8"
                  inputMode="decimal"
                  placeholder="—"
                  value={d.hoeveelheid}
                  onChange={(e) => zetDraft({ hoeveelheid: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Eenheid</Label>
                <Input className="h-8" value={d.eenheid} onChange={(e) => zetDraft({ eenheid: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tarief (materiaal)</Label>
                <Input
                  className={cn("h-8", v.artikel ? AI_VELD : "")}
                  inputMode="decimal"
                  placeholder={v.artikel ? undefined : "—"}
                  value={d.tarief}
                  onChange={(e) => zetDraft({ tarief: e.target.value })}
                />
              </div>
              {/* Normtijd kiezen als die (nog) niet gekoppeld is */}
              {!v.normtijd && kandidaten.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Normtijd</Label>
                  <Select
                    value={d.gekozenNormtijdId != null ? String(d.gekozenNormtijdId) : ""}
                    onValueChange={(val) => zetDraft({ gekozenNormtijdId: val ? parseInt(val, 10) : null })}
                  >
                    <SelectTrigger className="h-8"><SelectValue placeholder="Kies…" /></SelectTrigger>
                    <SelectContent>
                      {kandidaten.map((n) => (
                        <SelectItem key={n.id} value={String(n.id)}>{n.code} — {n.omschrijving}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Acties per punt §4.4 — nooit auto-commit */}
      {isVoorstel && (
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={onBevestig} disabled={bezig}>
            {bezig ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
            Bevestigen
          </Button>
          <Button size="sm" variant="outline" onClick={onBewerk}>
            <Pencil className="h-4 w-4 mr-1.5" />
            {inBewerking ? "Klaar met aanpassen" : "Aanpassen"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onOversla}>
            <SkipForward className="h-4 w-4 mr-1.5" />
            Overslaan
          </Button>
        </div>
      )}
    </div>
  );
}
