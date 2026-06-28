import { useState, useCallback } from "react";
import { useGetSalarisMutaties, usePostSalarisMutaties, usePatchSalarisMutatiesId } from "@workspace/api-client-react";
import { useListWerkgevers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Plus, Check, X, ClipboardList, Sparkles, ArrowRight,
  AlertTriangle, Info, CheckCircle2, ChevronDown, ChevronUp, Mail,
} from "lucide-react";
import { Link } from "wouter";

const HUIDIG_JAAR = new Date().getFullYear();
const HUIDIG_MAAND = new Date().getMonth() + 1;

const MAAND_NAMEN = [
  "januari","februari","maart","april","mei","juni",
  "juli","augustus","september","oktober","november","december",
];

const MUTATIE_TYPEN = [
  "Loonsverhoging", "Verloning nieuwe medewerker", "Uitdiensttreding",
  "Functiewijziging", "Uren aanpassing", "Bonus/gratificatie",
  "Vaste vergoeding", "Kilometervergoeding", "Overuren", "Ziektemelding",
  "Re-integratie", "Overig",
];

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  concept: { label: "Concept", variant: "secondary" },
  geaccordeerd: { label: "Geaccordeerd", variant: "default" },
  afgekeurd: { label: "Afgekeurd", variant: "destructive" },
  verwerkt: { label: "Verwerkt", variant: "outline" },
};

interface AiControleResultaat {
  methode: string;
  periode: string;
  werkmaatschappij: string;
  totaal_mutaties: number;
  geaccordeerd: number;
  bevindingen: { ernst: "waarschuwing" | "aandacht" | "ok"; mutatie_naam: string; bericht: string }[];
  compleet: boolean;
  aanbeveling: string;
}

// ── Workflow-stappen indicator ────────────────────────────────────────────────

const STAPPEN = [
  { nr: 1, label: "Mutaties verzamelen" },
  { nr: 2, label: "Accorderen" },
  { nr: 3, label: "AI-controle" },
  { nr: 4, label: "SCAB-mail" },
];

function WorkflowIndicator({ actief }: { actief: number }) {
  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1">
      {STAPPEN.map((stap, i) => (
        <div key={stap.nr} className="flex items-center shrink-0">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
            ${actief === stap.nr
              ? "bg-primary text-primary-foreground border-primary"
              : actief > stap.nr
                ? "bg-green-50 text-green-700 border-green-200"
                : "bg-muted text-muted-foreground border-transparent"}`}>
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0
              ${actief === stap.nr ? "bg-white/20" : actief > stap.nr ? "bg-green-200" : "bg-muted-foreground/20"}`}>
              {actief > stap.nr ? "✓" : stap.nr}
            </span>
            {stap.label}
          </div>
          {i < STAPPEN.length - 1 && (
            <ArrowRight size={14} className="text-muted-foreground mx-1 shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}

// ── AI-controle sectie ────────────────────────────────────────────────────────

function AiControleSectie({
  jaar, maand, werkmaatschappij, aantalGeaccordeerd, totaal,
}: {
  jaar: number; maand: number; werkmaatschappij: string;
  aantalGeaccordeerd: number; totaal: number;
}) {
  const [resultaat, setResultaat] = useState<AiControleResultaat | null>(null);
  const [laden, setLaden] = useState(false);
  const [open, setOpen] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const voerUit = useCallback(async () => {
    setLaden(true);
    setFout(null);
    try {
      const res = await fetch("/api/salaris-mutaties/ai-controle", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jaar, maand, werkmaatschappij }),
      });
      if (!res.ok) throw new Error("Controle mislukt");
      const data: AiControleResultaat = await res.json();
      setResultaat(data);
      setOpen(true);
    } catch {
      setFout("De AI-controle kon niet worden uitgevoerd. Probeer het later opnieuw.");
    } finally {
      setLaden(false);
    }
  }, [jaar, maand, werkmaatschappij]);

  const waarschuwingen = resultaat?.bevindingen.filter((b) => b.ernst === "waarschuwing") ?? [];
  const aandachtspunten = resultaat?.bevindingen.filter((b) => b.ernst === "aandacht") ?? [];

  return (
    <Card className={`border-2 transition-colors ${resultaat?.compleet ? "border-green-200 bg-green-50/30" : resultaat ? "border-amber-200 bg-amber-50/30" : "border-dashed"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-amber-500" />
            <CardTitle className="text-base">AI-controle salarismutaties</CardTitle>
            {resultaat?.methode === "gpt-4o" && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">GPT-4o</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {resultaat && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(!open)}>
                {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {open ? "Inklappen" : "Uitklappen"}
              </Button>
            )}
            <Button size="sm" className="h-8 text-xs" onClick={voerUit} disabled={laden || aantalGeaccordeerd === 0}>
              {laden ? (
                <><span className="animate-pulse">Analyseren...</span></>
              ) : (
                <><Sparkles size={13} className="mr-1.5" />{resultaat ? "Opnieuw controleren" : "Controleer met AI"}</>
              )}
            </Button>
          </div>
        </div>
        {!resultaat && !laden && (
          <p className="text-xs text-muted-foreground mt-1">
            Laat AI controleren of alle mutaties volledig en consistent zijn voor verzending naar SCAB.
            {aantalGeaccordeerd === 0 && " Accordeer eerst minimaal één mutatie."}
          </p>
        )}
        {fout && <p className="text-xs text-destructive mt-1">{fout}</p>}
      </CardHeader>

      {resultaat && open && (
        <CardContent className="pt-0 space-y-3">
          <Separator />
          <div className="flex items-start gap-3 p-3 rounded-lg bg-background/80 border">
            {resultaat.compleet
              ? <CheckCircle2 size={18} className="text-green-600 shrink-0 mt-0.5" />
              : <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            }
            <div>
              <p className="text-sm font-medium">{resultaat.aanbeveling}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {resultaat.geaccordeerd}/{resultaat.totaal_mutaties} geaccordeerd — {resultaat.periode}
              </p>
            </div>
          </div>

          {waarschuwingen.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-destructive uppercase tracking-wide">Blokkerende waarschuwingen</p>
              {waarschuwingen.map((b, i) => (
                <div key={i} className="flex items-start gap-2 p-2.5 rounded bg-red-50 border border-red-200 text-sm">
                  <X size={14} className="text-red-600 shrink-0 mt-0.5" />
                  <span className="text-red-800">{b.bericht}</span>
                </div>
              ))}
            </div>
          )}

          {aandachtspunten.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Aandachtspunten</p>
              {aandachtspunten.map((b, i) => (
                <div key={i} className="flex items-start gap-2 p-2.5 rounded bg-amber-50 border border-amber-200 text-sm">
                  <Info size={14} className="text-amber-600 shrink-0 mt-0.5" />
                  <span className="text-amber-800">{b.bericht}</span>
                </div>
              ))}
            </div>
          )}

          {resultaat.bevindingen.length === 0 && (
            <div className="flex items-center gap-2 p-2.5 rounded bg-green-50 border border-green-200 text-sm text-green-800">
              <CheckCircle2 size={14} className="text-green-600 shrink-0" />
              Geen problemen gevonden — alle mutaties zijn compleet en consistent.
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Hoofdpagina ────────────────────────────────────────────────────────────────

export default function SalarisMutatiesPage() {
  const [jaar, setJaar] = useState(HUIDIG_JAAR);
  const [maand, setMaand] = useState(HUIDIG_MAAND);
  const [werkmaatschappijFilter, setWerkmaatschappijFilter] = useState<string>("FPS Bouw & Renovatie");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const params: Record<string, unknown> = { jaar, maand };
  if (werkmaatschappijFilter !== "alle") params.werkmaatschappij = werkmaatschappijFilter;

  const { data: mutaties = [], refetch } = useGetSalarisMutaties(params, { query: { queryKey: ["salaris-mutaties", jaar, maand, werkmaatschappijFilter] } });
  const { data: werkgevers = [] } = useListWerkgevers();
  const postMutatie = usePostSalarisMutaties();
  const patchMutatie = usePatchSalarisMutatiesId();

  const [form, setForm] = useState({
    werkmaatschappij: "",
    periode_jaar: HUIDIG_JAAR,
    periode_maand: HUIDIG_MAAND,
    type: "",
    omschrijving: "",
    ingangsdatum: "",
    notities: "",
  });

  const aantalConcept = mutaties.filter((m) => m.status === "concept").length;
  const aantalGeaccordeerd = mutaties.filter((m) => m.status === "geaccordeerd").length;
  const aantalAfgekeurd = mutaties.filter((m) => m.status === "afgekeurd").length;
  const allesBehandeld = mutaties.length > 0 && aantalConcept === 0;

  // Workflow-stap afgeleid uit de data
  const werkflowStap = mutaties.length === 0 ? 1 : aantalConcept > 0 ? 2 : 3;

  const detailMutatie = detailId ? mutaties.find((m) => m.id === detailId) : null;

  function openNieuw() {
    setForm({
      werkmaatschappij: werkmaatschappijFilter !== "alle" ? werkmaatschappijFilter : werkgevers[0]?.naam ?? "",
      periode_jaar: jaar,
      periode_maand: maand,
      type: "",
      omschrijving: "",
      ingangsdatum: "",
      notities: "",
    });
    setDialogOpen(true);
  }

  async function opslaanMutatie() {
    await postMutatie.mutateAsync({
      data: {
        werkmaatschappij: form.werkmaatschappij,
        periode_jaar: form.periode_jaar,
        periode_maand: form.periode_maand,
        type: form.type,
        omschrijving: form.omschrijving || undefined,
        ingangsdatum: form.ingangsdatum || undefined,
        bron: "handmatig",
        notities: form.notities || undefined,
      },
    });
    setDialogOpen(false);
    refetch();
  }

  async function accorderen(id: number, akkoord: boolean) {
    await patchMutatie.mutateAsync({ id, data: { akkoord } });
    refetch();
  }

  const jaren = [HUIDIG_JAAR, HUIDIG_JAAR - 1, HUIDIG_JAAR - 2];

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <ClipboardList className="text-primary" size={24} />
          <div>
            <h1 className="text-2xl font-semibold">Salarismutaties</h1>
            <p className="text-sm text-muted-foreground">Mutaties per loonperiode verzamelen, accorderen en doorsturen naar SCAB</p>
          </div>
        </div>
        <div className="flex gap-2">
          {allesBehandeld && werkmaatschappijFilter !== "alle" && (
            <Button variant="outline" asChild className="text-xs h-9">
              <Link href="/scab-mail">
                <Mail size={14} className="mr-1.5" />
                Naar SCAB-mail
              </Link>
            </Button>
          )}
          <Button onClick={openNieuw} size="sm">
            <Plus size={15} className="mr-1.5" />
            Mutatie toevoegen
          </Button>
        </div>
      </div>

      {/* Workflow-indicator */}
      <WorkflowIndicator actief={werkflowStap} />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={String(jaar)} onValueChange={(v) => setJaar(Number(v))}>
          <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {jaren.map((j) => <SelectItem key={j} value={String(j)}>{j}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={String(maand)} onValueChange={(v) => setMaand(Number(v))}>
          <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MAAND_NAMEN.map((naam, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>{naam}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={werkmaatschappijFilter} onValueChange={setWerkmaatschappijFilter}>
          <SelectTrigger className="w-52 h-8 text-sm"><SelectValue placeholder="Alle werkmaatschappijen" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle werkmaatschappijen</SelectItem>
            {werkgevers.map((wg) => (
              <SelectItem key={wg.id} value={wg.naam}>{wg.naam}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      {mutaties.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Totaal", waarde: mutaties.length, kleur: "text-foreground" },
            { label: "Concept", waarde: aantalConcept, kleur: aantalConcept > 0 ? "text-amber-600" : "text-muted-foreground" },
            { label: "Geaccordeerd", waarde: aantalGeaccordeerd, kleur: aantalGeaccordeerd > 0 ? "text-green-600" : "text-muted-foreground" },
            { label: "Afgekeurd", waarde: aantalAfgekeurd, kleur: aantalAfgekeurd > 0 ? "text-red-600" : "text-muted-foreground" },
          ].map(({ label, waarde, kleur }) => (
            <Card key={label} className="text-center py-3">
              <CardContent className="p-0">
                <p className={`text-2xl font-bold ${kleur}`}>{waarde}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* AI-controle — alleen tonen als er mutaties zijn */}
      {mutaties.length > 0 && werkmaatschappijFilter !== "alle" && (
        <AiControleSectie
          jaar={jaar}
          maand={maand}
          werkmaatschappij={werkmaatschappijFilter}
          aantalGeaccordeerd={aantalGeaccordeerd}
          totaal={mutaties.length}
        />
      )}

      {/* CTA naar SCAB-mail als alles geaccordeerd */}
      {allesBehandeld && aantalGeaccordeerd > 0 && werkmaatschappijFilter !== "alle" && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 border border-green-200">
          <CheckCircle2 size={20} className="text-green-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-800">
              Alle {aantalGeaccordeerd} mutaties geaccordeerd voor {MAAND_NAMEN[maand - 1]} {jaar}
            </p>
            <p className="text-xs text-green-700">U kunt nu een SCAB-conceptmail laten genereren door de AI.</p>
          </div>
          <Button size="sm" className="shrink-0 bg-green-700 hover:bg-green-800" asChild>
            <Link href="/scab-mail">
              <Mail size={14} className="mr-1.5" />
              Genereer SCAB-mail
            </Link>
          </Button>
        </div>
      )}

      {/* Mutatieslijst */}
      {mutaties.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ClipboardList size={36} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Geen mutaties voor {MAAND_NAMEN[maand - 1]} {jaar}</p>
            <p className="text-sm mt-1">Voeg de eerste salarismutatie toe voor deze periode.</p>
            <Button className="mt-4" onClick={openNieuw}>
              <Plus size={15} className="mr-1.5" />
              Mutatie toevoegen
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Mutaties — {mutaties.length} {mutaties.length === 1 ? "record" : "records"}
          </h2>
          {mutaties.map((m) => {
            const statusInfo = STATUS_LABELS[m.status] ?? { label: m.status, variant: "secondary" as const };
            const isOpen = detailId === m.id;
            return (
              <Card key={m.id}
                className={`cursor-pointer transition-shadow hover:shadow-sm ${isOpen ? "ring-1 ring-primary/30" : ""}`}
                onClick={() => setDetailId(isOpen ? null : m.id)}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {m.medewerker_naam ?? "Onbekende medewerker"}
                        </span>
                        <Badge variant="outline" className="text-xs">{m.werkmaatschappij}</Badge>
                        <Badge variant={statusInfo.variant} className="text-xs">{statusInfo.label}</Badge>
                        {m.bron === "hrm" && (
                          <Badge variant="secondary" className="text-xs">HRM-import</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{m.type}</p>
                      {m.omschrijving && (
                        <p className="text-xs text-muted-foreground mt-0.5">{m.omschrijving}</p>
                      )}
                      {m.ingangsdatum && (
                        <p className="text-xs text-muted-foreground">Ingangsdatum: {m.ingangsdatum}</p>
                      )}
                    </div>
                    {m.status === "concept" && (
                      <div className="flex gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="outline"
                          className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50"
                          onClick={() => accorderen(m.id, true)}>
                          <Check size={13} className="mr-1" /> Akkoord
                        </Button>
                        <Button size="sm" variant="outline"
                          className="h-7 text-xs text-red-700 border-red-300 hover:bg-red-50"
                          onClick={() => accorderen(m.id, false)}>
                          <X size={13} className="mr-1" /> Afkeuren
                        </Button>
                      </div>
                    )}
                    {m.status === "geaccordeerd" && (
                      <Badge className="shrink-0 bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
                        <Check size={11} className="mr-1" />
                        {m.gecontroleerd_door_naam ?? "Geaccordeerd"}
                      </Badge>
                    )}
                    {m.status === "afgekeurd" && (
                      <Badge variant="destructive" className="shrink-0 text-xs">
                        <X size={11} className="mr-1" /> Afgekeurd
                      </Badge>
                    )}
                  </div>

                  {isOpen && (
                    <div className="mt-3 pt-3 border-t space-y-2 text-xs text-muted-foreground">
                      {m.notities && (
                        <div>
                          <span className="font-semibold text-foreground">Notitie: </span>{m.notities}
                        </div>
                      )}
                      {m.gecontroleerd_door_naam && (
                        <div>
                          <span className="font-semibold text-foreground">Gecontroleerd door: </span>
                          {m.gecontroleerd_door_naam}
                          {m.gecontroleerd_op && ` op ${new Date(m.gecontroleerd_op).toLocaleDateString("nl-NL")}`}
                        </div>
                      )}
                      {m.aangemaakt_door_naam && (
                        <div><span className="font-semibold text-foreground">Ingevoerd door: </span>{m.aangemaakt_door_naam}</div>
                      )}
                      <div><span className="font-semibold text-foreground">Bron: </span>{m.bron}</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Nieuw mutatie dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Salarismutatie toevoegen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Jaar</Label>
                <Select value={String(form.periode_jaar)} onValueChange={(v) => setForm((f) => ({ ...f, periode_jaar: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {jaren.map((j) => <SelectItem key={j} value={String(j)}>{j}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Maand</Label>
                <Select value={String(form.periode_maand)} onValueChange={(v) => setForm((f) => ({ ...f, periode_maand: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MAAND_NAMEN.map((nm, i) => <SelectItem key={i + 1} value={String(i + 1)}>{nm}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Werkmaatschappij</Label>
              <Select value={form.werkmaatschappij} onValueChange={(v) => setForm((f) => ({ ...f, werkmaatschappij: v }))}>
                <SelectTrigger><SelectValue placeholder="Kies werkmaatschappij" /></SelectTrigger>
                <SelectContent>
                  {werkgevers.map((wg) => <SelectItem key={wg.id} value={wg.naam}>{wg.naam}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Type mutatie</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue placeholder="Kies type" /></SelectTrigger>
                <SelectContent>
                  {MUTATIE_TYPEN.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Omschrijving</Label>
              <Input placeholder="Toelichting op de mutatie"
                value={form.omschrijving}
                onChange={(e) => setForm((f) => ({ ...f, omschrijving: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label>Ingangsdatum</Label>
              <Input type="date" value={form.ingangsdatum}
                onChange={(e) => setForm((f) => ({ ...f, ingangsdatum: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label>Notities</Label>
              <Textarea rows={2} placeholder="Interne opmerkingen"
                value={form.notities}
                onChange={(e) => setForm((f) => ({ ...f, notities: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuleren</Button>
            <Button onClick={opslaanMutatie}
              disabled={!form.werkmaatschappij || !form.type || postMutatie.isPending}>
              {postMutatie.isPending ? "Opslaan..." : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
