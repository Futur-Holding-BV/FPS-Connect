import { useState } from "react";
import { Link } from "wouter";
import {
  useListFacturen,
  useAiUitlezenFactuur,
  useAccorderenFactuur,
  useAfkeurenFactuur,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Inbox, AlertTriangle, CheckCircle2, ArrowUpRight, Sparkles,
  Eye, Loader2, ShieldAlert, Info, Landmark, Ban, Clock,
  XCircle, TriangleAlert, ChevronDown, ChevronUp,
  TrendingDown, Banknote, Target, Zap, CircleDot,
} from "lucide-react";
import type { Factuur } from "@workspace/api-client-react";

// ── Helpers ────────────────────────────────────────────────────────────────────

function euro(v?: string | null) {
  if (!v) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(parseFloat(v));
}

function aiMeta(factuur: Factuur): Record<string, unknown> {
  const meta = factuur.ai_metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    return meta as Record<string, unknown>;
  }
  return {};
}

function aiConfidence(factuur: Factuur): number | null {
  const c = aiMeta(factuur)["confidence"];
  if (typeof c === "number") return c;
  return null;
}

function aiControlReden(factuur: Factuur): string | null {
  const r = aiMeta(factuur)["controle_reden"];
  if (typeof r === "string" && r.trim()) return r;
  return null;
}

// ── Verwachte actie ───────────────────────────────────────────────────────────

function bepaalActie(factuur: Factuur): { tekst: string; prioriteit: "hoog" | "middel" | "laag" } {
  if (factuur.geblokkeerd) return { tekst: "Blokkade opheffen vóór verdere verwerking", prioriteit: "hoog" };
  if (factuur.iban_afwijking) return { tekst: "Verifieer IBAN vóór enige betaling — mogelijke fraude", prioriteit: "hoog" };
  if (factuur.status === "fout_bij_verzending") return { tekst: "Herstel AccountView-exportfout en exporteer opnieuw", prioriteit: "hoog" };
  if (factuur.status === "controle_nodig") return { tekst: "Handmatige controle nodig — AI-uitlezing was onzeker", prioriteit: "hoog" };
  if (factuur.status === "ontvangen") return { tekst: "Start AI-uitlezing om gegevens automatisch te extraheren", prioriteit: "middel" };
  if (factuur.status === "ai_gelezen") return { tekst: "Controleer AI-resultaat en geef akkoord of pas aan", prioriteit: "middel" };
  if (factuur.status === "te_beoordelen_pl") return { tekst: "Projectleider akkoord vereist voor verwerking", prioriteit: "middel" };
  if (factuur.status === "te_beoordelen_wvb") return { tekst: "Werkbegrotingsverantwoordelijke dient te accorderen", prioriteit: "middel" };
  if (factuur.status === "klaar_voor_accountview") return { tekst: "Klaar — exporteer naar AccountView", prioriteit: "laag" };
  if (factuur.status === "verzonden_naar_accountview") return { tekst: "Wacht op betalingsstatus-terugkoppeling", prioriteit: "laag" };
  if (factuur.status === "verwerkt") return { tekst: "Afgehandeld — geen actie vereist", prioriteit: "laag" };
  return { tekst: "Bekijk factuur voor details", prioriteit: "laag" };
}

// ── Projectimpact-indicator ───────────────────────────────────────────────────

function bepaalProjectimpact(factuur: Factuur): { label: string; kleur: string } {
  if (!factuur.gebouw_id && !factuur.opdracht_id && !factuur.project_code) {
    return { label: "Niet gekoppeld — kostprijsdoorwerking onmogelijk", kleur: "text-amber-600" };
  }
  if (factuur.opdracht_id) {
    return { label: "Doorwerking naar opdracht/werkbegroting mogelijk", kleur: "text-emerald-600" };
  }
  return { label: "Gebouwkoppeling aanwezig — geen directe opdrachtlink", kleur: "text-blue-600" };
}

// ── Budgetimpact ──────────────────────────────────────────────────────────────

function bepaalBudgetimpact(factuur: Factuur): string {
  if (!factuur.bedrag_excl_btw) return "Bedrag onbekend — geen budgetimpact berekend";
  const excl = parseFloat(factuur.bedrag_excl_btw);
  if (!factuur.opdracht_id) return `${euro(factuur.bedrag_excl_btw)} excl. BTW — koppel aan opdracht voor budgetvergelijking`;
  return `${euro(factuur.bedrag_excl_btw)} excl. BTW wordt doorbelast aan opdracht`;
}

// ── Marge-impact ─────────────────────────────────────────────────────────────

function bepaalMargeimpact(factuur: Factuur): { label: string; kleur: string } {
  const btw = factuur.btw_code?.toUpperCase();
  if (btw === "V") {
    return {
      label: "BTW verlegd — onderaannemer/inhuur. Verhoogde marge-impact: controle op nacalculatie.",
      kleur: "text-amber-600",
    };
  }
  if (factuur.g_rekening_van_toepassing && factuur.g_rekening_bedrag) {
    const g = parseFloat(factuur.g_rekening_bedrag);
    return {
      label: `G-rekening ${euro(factuur.g_rekening_bedrag)} vermindert direct beschikbare cashflow.`,
      kleur: "text-blue-600",
    };
  }
  if (factuur.bedrag_incl_btw && parseFloat(factuur.bedrag_incl_btw) > 10000) {
    return { label: "Hoog bedrag — beoordeelbaar op marge na opdrachtkoppeling", kleur: "text-amber-600" };
  }
  return { label: "Geen specifieke marge-impact gesignaleerd", kleur: "text-slate-500" };
}

// ── G-rekening / BTW-uitleg ───────────────────────────────────────────────────

function bepaalFinancieelVoorstelUitleg(factuur: Factuur): string | null {
  const btw = factuur.btw_code?.toUpperCase();
  const regels: string[] = [];

  if (factuur.g_rekening_van_toepassing) {
    const perc = factuur.g_rekening_bedrag && factuur.bedrag_incl_btw
      ? Math.round((parseFloat(factuur.g_rekening_bedrag) / parseFloat(factuur.bedrag_incl_btw)) * 100)
      : null;
    regels.push(
      `G-rekening voorgesteld${perc !== null ? ` (${perc}% van factuurbedrag)` : ""}: leverancier is geregistreerd als onderaannemer met G-rekening-verplichting (Wet keten- en inlenersaansprakelijkheid). Betaling wordt gesplitst: ${euro(factuur.g_rekening_bedrag)} naar G-rekening, ${euro(factuur.normaal_bedrag)} regulier.`,
    );
  }

  if (btw === "V") {
    regels.push(
      "BTW verlegd voorgesteld: dienst verleend door een BTW-plichtige onderaannemer. De afnemer (FPS) verlegt de BTW en draagt deze af. Op de factuur mag geen BTW-bedrag staan.",
    );
  } else if (btw === "H") {
    regels.push("BTW 21% (hoog tarief) — standaard voor diensten en materialen.");
  } else if (btw === "L") {
    regels.push("BTW 9% (laag tarief) — van toepassing op specifieke diensten/goederen.");
  } else if (btw === "0") {
    regels.push("BTW 0% / vrijgesteld — controleer of de leverancier BTW-vrijstelling kan claimen.");
  }

  return regels.length > 0 ? regels.join(" | ") : null;
}

// ── AI-controller panel ───────────────────────────────────────────────────────

function AiControllerPanel({ factuur }: { factuur: Factuur }) {
  const confidence = aiConfidence(factuur);
  const controlReden = aiControlReden(factuur);
  const actie = bepaalActie(factuur);
  const projectimpact = bepaalProjectimpact(factuur);
  const budgetimpact = bepaalBudgetimpact(factuur);
  const margeimpact = bepaalMargeimpact(factuur);
  const financieelUitleg = bepaalFinancieelVoorstelUitleg(factuur);

  const confidencePct = confidence !== null ? Math.round(confidence * 100) : null;
  const confidenceKleur = confidencePct === null ? "bg-slate-200"
    : confidencePct >= 80 ? "bg-emerald-500"
    : confidencePct >= 60 ? "bg-amber-500"
    : "bg-red-500";

  return (
    <div className="bg-slate-50 border-t px-4 py-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* AI confidence */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
            <Sparkles className="h-3.5 w-3.5 text-blue-500" />
            AI-betrouwbaarheid
          </div>
          {confidencePct !== null ? (
            <>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${confidenceKleur}`}
                    style={{ width: `${confidencePct}%` }}
                  />
                </div>
                <span className={`text-xs font-semibold tabular-nums ${
                  confidencePct >= 80 ? "text-emerald-700"
                  : confidencePct >= 60 ? "text-amber-700"
                  : "text-red-700"
                }`}>{confidencePct}%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {confidencePct >= 80 ? "Hoge zekerheid — AI-uitlezing betrouwbaar"
                 : confidencePct >= 60 ? "Matige zekerheid — handmatige controle aanbevolen"
                 : "Lage zekerheid — handmatige controle verplicht"}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Nog niet uitgelezen door AI</p>
          )}
        </div>

        {/* Verwachte actie */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
            <Zap className="h-3.5 w-3.5 text-violet-500" />
            Verwachte actie
          </div>
          <div className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium ${
            actie.prioriteit === "hoog" ? "bg-red-100 text-red-700"
            : actie.prioriteit === "middel" ? "bg-amber-100 text-amber-700"
            : "bg-slate-100 text-slate-600"
          }`}>
            {actie.prioriteit === "hoog" && <ShieldAlert className="h-3 w-3" />}
            {actie.prioriteit === "middel" && <Clock className="h-3 w-3" />}
            {actie.prioriteit === "laag" && <CheckCircle2 className="h-3 w-3" />}
            {actie.tekst}
          </div>
        </div>

        {/* Projectimpact */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
            <Target className="h-3.5 w-3.5 text-slate-500" />
            Projectimpact
          </div>
          <p className={`text-xs ${projectimpact.kleur}`}>{projectimpact.label}</p>
        </div>

        {/* Budgetimpact */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
            <Banknote className="h-3.5 w-3.5 text-slate-500" />
            Budgetimpact
          </div>
          <p className="text-xs text-slate-600">{budgetimpact}</p>
          {factuur.g_rekening_van_toepassing && factuur.g_rekening_bedrag && (
            <div className="text-xs text-blue-600 space-y-0.5">
              <span className="block">G-rekening: {euro(factuur.g_rekening_bedrag)}</span>
              <span className="block">Normaal deel: {euro(factuur.normaal_bedrag)}</span>
            </div>
          )}
        </div>

        {/* Marge-impact */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
            <TrendingDown className="h-3.5 w-3.5 text-slate-500" />
            Marge-impact
          </div>
          <p className={`text-xs ${margeimpact.kleur}`}>{margeimpact.label}</p>
        </div>

        {/* Waarschuwing reden */}
        {(controlReden || factuur.iban_afwijking || factuur.blokkering_reden) && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
              <TriangleAlert className="h-3.5 w-3.5 text-amber-500" />
              Reden waarschuwing
            </div>
            <div className="space-y-1">
              {factuur.iban_afwijking && (
                <p className="text-xs text-red-600 font-medium">
                  IBAN op factuur ({factuur.iban_uitgelezen ?? "onbekend"}) wijkt af van het geregistreerde leverancier-IBAN.
                </p>
              )}
              {controlReden && (
                <p className="text-xs text-amber-700">{controlReden}</p>
              )}
              {factuur.blokkering_reden && (
                <p className="text-xs text-slate-600">Blokkadereden: {factuur.blokkering_reden}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* G-rekening / BTW-uitleg */}
      {financieelUitleg && (
        <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2">
          <div className="flex items-start gap-2">
            <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-blue-700 mb-0.5">Toelichting financieel voorstel</p>
              <p className="text-xs text-blue-600">{financieelUitleg}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Status helpers ─────────────────────────────────────────────────────────────

const TAB_STATUSSEN: Record<string, string[]> = {
  inbox: ["ontvangen", "ai_gelezen"],
  beoordelen: ["te_beoordelen_pl", "te_beoordelen_wvb", "te_beoordelen_medewerker"],
  controle: ["controle_nodig"],
  exportklaar: ["klaar_voor_accountview", "klaar_voor_boeking"],
  fouten: ["fout_bij_verzending"],
};

function isInTab(status: string, tab: string): boolean {
  return TAB_STATUSSEN[tab]?.includes(status) ?? false;
}

const STATUS_LABEL: Record<string, string> = {
  ontvangen: "Nieuw",
  ai_gelezen: "AI gelezen",
  controle_nodig: "Controle nodig",
  te_beoordelen_pl: "Te beoordelen",
  te_beoordelen_wvb: "WVB beoordeling",
  te_beoordelen_medewerker: "Medewerker",
  klaar_voor_boeking: "Klaar voor boeking",
  klaar_voor_accountview: "Exportklaar",
  verzonden_naar_accountview: "Verzonden",
  fout_bij_verzending: "Export fout",
  verwerkt: "Verwerkt",
  afgekeurd: "Afgekeurd",
};

const STATUS_KLEUR: Record<string, string> = {
  ontvangen: "bg-slate-100 text-slate-600",
  ai_gelezen: "bg-blue-100 text-blue-700",
  controle_nodig: "bg-amber-100 text-amber-700",
  te_beoordelen_pl: "bg-violet-100 text-violet-700",
  te_beoordelen_wvb: "bg-violet-100 text-violet-700",
  te_beoordelen_medewerker: "bg-violet-100 text-violet-700",
  klaar_voor_accountview: "bg-emerald-100 text-emerald-700",
  fout_bij_verzending: "bg-red-100 text-red-700",
  afgekeurd: "bg-red-100 text-red-600",
};

// ── Vervaldate badge ───────────────────────────────────────────────────────────

function DatumBadge({ datum }: { datum?: string | null }) {
  if (!datum) return null;
  const d = new Date(datum);
  const verschilDagen = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (verschilDagen < 0) return <span className="text-xs text-red-600 font-medium">{datum} (verlopen)</span>;
  if (verschilDagen < 7) return <span className="text-xs text-amber-600 font-medium">{datum} ({verschilDagen}d)</span>;
  return <span className="text-xs text-muted-foreground">{datum}</span>;
}

// ── Afwijking-indicatoren ──────────────────────────────────────────────────────

function AfwijkingIndicatoren({ factuur }: { factuur: Factuur }) {
  const signalen: Array<{ label: string; ernst: "kritisch" | "waarschuwing" | "info" }> = [];
  if (factuur.iban_afwijking) signalen.push({ label: "IBAN afwijking", ernst: "kritisch" });
  if (factuur.g_rekening_van_toepassing) signalen.push({ label: "G-rekening", ernst: "info" });
  if (!factuur.gebouw_id && !factuur.opdracht_id && !factuur.project_code) signalen.push({ label: "Geen koppeling", ernst: "waarschuwing" });
  if (factuur.accountview_status === "error") signalen.push({ label: "Export fout", ernst: "kritisch" });
  if (factuur.btw_code?.toUpperCase() === "V") signalen.push({ label: "BTW verlegd", ernst: "info" });

  if (signalen.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {signalen.map((s) => (
        <span key={s.label} className={`inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded font-medium ${
          s.ernst === "kritisch" ? "bg-red-100 text-red-700"
          : s.ernst === "waarschuwing" ? "bg-amber-100 text-amber-700"
          : "bg-blue-50 text-blue-600"
        }`}>
          {s.ernst === "kritisch" && <ShieldAlert className="h-2.5 w-2.5" />}
          {s.ernst === "waarschuwing" && <TriangleAlert className="h-2.5 w-2.5" />}
          {s.ernst === "info" && <Info className="h-2.5 w-2.5" />}
          {s.label}
        </span>
      ))}
    </div>
  );
}

// ── Factuur-rij ────────────────────────────────────────────────────────────────

function FactuurRij({
  factuur,
  isOpen,
  onToggle,
  aiBezig,
  onAi,
  onAkkoord,
  onAfwijzen,
  bezig,
}: {
  factuur: Factuur;
  isOpen: boolean;
  onToggle: () => void;
  aiBezig: number | null;
  onAi: (id: number) => void;
  onAkkoord: (id: number) => void;
  onAfwijzen: (id: number) => void;
  bezig: Record<string, number | null>;
}) {
  const confidence = aiConfidence(factuur);
  const confidencePct = confidence !== null ? Math.round(confidence * 100) : null;
  const kanAiUitlezen = ["ontvangen", "controle_nodig", "ai_gelezen"].includes(factuur.status) && !!factuur.pdf_url;
  const kanAccorderen = !factuur.geaccordeerd && !factuur.geblokkeerd && factuur.status !== "verwerkt";
  const kanAfwijzen = !["afgekeurd", "verwerkt"].includes(factuur.status);

  return (
    <div className={factuur.geblokkeerd ? "opacity-60" : ""}>
      <div
        className="px-4 py-3 hover:bg-slate-50/60 cursor-pointer select-none"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onToggle()}
      >
        <div className="flex items-start gap-3">
          {/* Type badge */}
          <span className={`mt-0.5 shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${
            factuur.type === "inkoop" ? "bg-slate-100 text-slate-600" : "bg-blue-50 text-blue-600"
          }`}>
            {factuur.type === "inkoop" ? "INK" : "VRK"}
          </span>

          {/* Factuur info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-slate-900 text-sm truncate">
                {factuur.factuurnummer ?? factuur.bestandsnaam ?? `Factuur #${factuur.id}`}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_KLEUR[factuur.status] ?? "bg-slate-100 text-slate-600"}`}>
                {STATUS_LABEL[factuur.status] ?? factuur.status}
              </span>
              {factuur.geblokkeerd && (
                <span className="text-xs text-slate-500 flex items-center gap-0.5">
                  <Ban className="h-3 w-3" /> Geblokkeerd
                </span>
              )}
              {confidencePct !== null && (
                <span className={`text-xs font-medium flex items-center gap-0.5 ${
                  confidencePct >= 80 ? "text-emerald-600"
                  : confidencePct >= 60 ? "text-amber-600"
                  : "text-red-600"
                }`}>
                  <Sparkles className="h-3 w-3" />{confidencePct}%
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
              <span>{factuur.relatienaam ?? "Onbekende leverancier"}</span>
              {factuur.factuurdatum && <span>{factuur.factuurdatum}</span>}
              {factuur.vervaldatum && <span>Vervalt: <DatumBadge datum={factuur.vervaldatum} /></span>}
              {factuur.gebouw_naam && (
                <span className="flex items-center gap-0.5">
                  <Landmark className="h-3 w-3" />{factuur.gebouw_naam}
                </span>
              )}
            </div>
            <AfwijkingIndicatoren factuur={factuur} />
          </div>

          {/* Bedrag + acties */}
          <div className="shrink-0 flex items-start gap-3">
            <div className="text-right min-w-20">
              <span className="font-mono text-sm font-medium text-slate-900">{euro(factuur.bedrag_incl_btw)}</span>
              {factuur.betaalstatus === "betaald" && (
                <div className="text-xs text-emerald-600 flex items-center justify-end gap-0.5 mt-0.5">
                  <CheckCircle2 className="h-3 w-3" /> Betaald
                </div>
              )}
            </div>

            {/* Snelacties — stoppen propagation zodat rij niet togglet */}
            <div
              className="flex items-center gap-1 flex-wrap justify-end"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {kanAiUitlezen && (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={aiBezig === factuur.id}
                  onClick={() => onAi(factuur.id)}>
                  {aiBezig === factuur.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  AI
                </Button>
              )}
              {kanAccorderen && (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                  disabled={bezig["akkoord"] === factuur.id} onClick={() => onAkkoord(factuur.id)}>
                  {bezig["akkoord"] === factuur.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                  Akkoord
                </Button>
              )}
              {kanAfwijzen && (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-700 border-red-200 hover:bg-red-50"
                  disabled={bezig["afwijzen"] === factuur.id} onClick={() => onAfwijzen(factuur.id)}>
                  <XCircle className="h-3 w-3" /> Afwijzen
                </Button>
              )}
              <Link href={`/facturen/${factuur.id}`}>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => e.stopPropagation()}>
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              </Link>
              <button
                className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-slate-900 rounded"
                onClick={(e) => { e.stopPropagation(); onToggle(); }}
                aria-label={isOpen ? "Verberg details" : "Toon AI-details"}
              >
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* AI-controller panel */}
      {isOpen && <AiControllerPanel factuur={factuur} />}
    </div>
  );
}

// ── Samenvatting-kaartje ───────────────────────────────────────────────────────

function TellerKaart({
  icoon, label, waarde, kleurClass, onClick, actief,
}: {
  icoon: React.ReactNode; label: string; waarde: number; kleurClass: string;
  onClick?: () => void; actief?: boolean;
}) {
  return (
    <Card
      className={`cursor-pointer transition-colors ${actief ? "ring-2 ring-primary border-primary" : "hover:border-primary/50"}`}
      onClick={onClick}
    >
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${kleurClass}`}>
          {icoon}
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-900 leading-none">{waarde}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Hoofdpagina ────────────────────────────────────────────────────────────────

export default function ControleboxPagina() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState("inbox");
  const [filter, setFilter] = useState<"alle" | "inkoop" | "verkoop">("alle");
  const [openRij, setOpenRij] = useState<number | null>(null);
  const [aiBezig, setAiBezig] = useState<number | null>(null);
  const [bezig, setBezig] = useState<Record<string, number | null>>({});

  const { data: facturen = [], isLoading } = useListFacturen(
    {},
    { query: { queryKey: ["facturen-controlebox"] } },
  );
  const aiMut = useAiUitlezenFactuur({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["facturen-controlebox"] }),
      onError: () => toast({
        title: "AI-uitlezing mislukt",
        description: "OpenAI is niet bereikbaar of de analyse is mislukt. Probeer het later opnieuw.",
        variant: "destructive",
      }),
    },
  });
  const akkoordMut = useAccorderenFactuur({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["facturen-controlebox"] }) },
  });
  const afwijzenMut = useAfkeurenFactuur({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["facturen-controlebox"] }) },
  });

  function handleAi(id: number) {
    setAiBezig(id);
    aiMut.mutate({ id }, { onSettled: () => setAiBezig(null) });
  }
  function handleAkkoord(id: number) {
    setBezig((p) => ({ ...p, akkoord: id }));
    akkoordMut.mutate({ id }, { onSettled: () => setBezig((p) => ({ ...p, akkoord: null })) });
  }
  function handleAfwijzen(id: number) {
    const reden = prompt("Reden voor afwijzing (verplicht):");
    if (!reden?.trim()) return;
    setBezig((p) => ({ ...p, afwijzen: id }));
    afwijzenMut.mutate({ id, data: { reden } }, { onSettled: () => setBezig((p) => ({ ...p, afwijzen: null })) });
  }

  const alle = facturen as Factuur[];

  // ── Tellers ──
  const tellerNieuw         = alle.filter((f) => isInTab(f.status, "inbox")).length;
  const tellerBeoordelen    = alle.filter((f) => isInTab(f.status, "beoordelen")).length;
  const tellerControle      = alle.filter((f) => isInTab(f.status, "controle")).length;
  const tellerBlokkades     = alle.filter((f) => f.geblokkeerd).length;
  const tellerExportKlaar   = alle.filter((f) => isInTab(f.status, "exportklaar")).length;
  const tellerExportMislukt = alle.filter((f) => isInTab(f.status, "fouten")).length;
  const tellerAiAkkoord     = alle.filter((f) => {
    const c = aiConfidence(f);
    return c !== null && c >= 0.80 && !f.iban_afwijking && !f.geblokkeerd && f.status === "te_beoordelen_pl";
  }).length;

  const aantalAfwijkingen = alle.filter((f) => f.iban_afwijking || f.accountview_status === "error").length;

  const lijst = alle.filter((f) => {
    if (filter !== "alle" && f.type !== filter) return false;
    return isInTab(f.status, tab);
  });

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      {/* Koptekst */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <Inbox className="h-6 w-6 text-primary" />
            Financiële controlebox
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            AI Financial Controller — verwerk facturen en bekijk projectimpact, budgetimpact en afwijkingen.
          </p>
        </div>
        <Link href="/facturen">
          <Button size="sm" variant="outline">
            <ArrowUpRight className="h-3.5 w-3.5 mr-1.5" />
            Alle facturen
          </Button>
        </Link>
      </div>

      {/* 6 samenvatting-kaartjes */}
      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <TellerKaart
            icoon={<Clock className="h-4.5 w-4.5 text-slate-600" />}
            label="Nieuwe facturen"
            waarde={tellerNieuw}
            kleurClass="bg-slate-100"
            actief={tab === "inbox"}
            onClick={() => setTab("inbox")}
          />
          <TellerKaart
            icoon={<Sparkles className="h-4.5 w-4.5 text-emerald-600" />}
            label="AI volledig akkoord"
            waarde={tellerAiAkkoord}
            kleurClass="bg-emerald-100"
            actief={tab === "beoordelen"}
            onClick={() => setTab("beoordelen")}
          />
          <TellerKaart
            icoon={<AlertTriangle className="h-4.5 w-4.5 text-amber-600" />}
            label="Controle nodig"
            waarde={tellerControle}
            kleurClass="bg-amber-100"
            actief={tab === "controle"}
            onClick={() => setTab("controle")}
          />
          <TellerKaart
            icoon={<Ban className="h-4.5 w-4.5 text-red-500" />}
            label="Blokkades"
            waarde={tellerBlokkades}
            kleurClass="bg-red-100"
            onClick={() => setTab("alle" as string)}
          />
          <TellerKaart
            icoon={<CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />}
            label="Export gereed"
            waarde={tellerExportKlaar}
            kleurClass="bg-emerald-100"
            actief={tab === "exportklaar"}
            onClick={() => setTab("exportklaar")}
          />
          <TellerKaart
            icoon={<XCircle className="h-4.5 w-4.5 text-red-600" />}
            label="Export mislukt"
            waarde={tellerExportMislukt}
            kleurClass="bg-red-100"
            actief={tab === "fouten"}
            onClick={() => setTab("fouten")}
          />
        </div>
      )}

      {/* IBAN-afwijking banner */}
      {aantalAfwijkingen > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-red-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">
              {aantalAfwijkingen} factuur{aantalAfwijkingen > 1 ? "en" : ""} met kritische afwijking
            </p>
            <p className="text-xs text-red-600">
              IBAN-afwijking of export-fout aangetroffen. Controleer vóór verdere verwerking of betaling.
            </p>
          </div>
        </div>
      )}

      {/* Tabs + filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v)}>
          <TabsList>
            <TabsTrigger value="inbox" className="gap-1.5">
              Nieuw
              {tellerNieuw > 0 && <Badge variant="secondary" className="text-xs px-1.5">{tellerNieuw}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="beoordelen" className="gap-1.5">
              Te beoordelen
              {tellerBeoordelen > 0 && <Badge variant="secondary" className="text-xs px-1.5">{tellerBeoordelen}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="controle" className="gap-1.5">
              Controle
              {tellerControle > 0 && <Badge className="text-xs px-1.5 bg-amber-500">{tellerControle}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="exportklaar">Exportklaar</TabsTrigger>
            <TabsTrigger value="fouten" className="gap-1.5">
              Fouten
              {tellerExportMislukt > 0 && <Badge className="text-xs px-1.5 bg-red-500">{tellerExportMislukt}</Badge>}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex gap-1">
          {(["alle", "inkoop", "verkoop"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"}
              className="h-7 text-xs" onClick={() => setFilter(f)}>
              {f === "alle" ? "Alle" : f === "inkoop" ? "Inkoop" : "Verkoop"}
            </Button>
          ))}
        </div>
      </div>

      {/* Hint — klik op rij voor AI-details */}
      {!isLoading && lijst.length > 0 && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <CircleDot className="h-3 w-3" />
          Klik op een rij voor AI confidence, projectimpact, budgetimpact en toelichting.
        </p>
      )}

      {/* Factuurlijst */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-10">
          <Loader2 className="h-4 w-4 animate-spin" /> Laden...
        </div>
      ) : lijst.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Inbox className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">Geen facturen in deze categorie</p>
            <p className="text-xs mt-1">
              {tab === "inbox" ? "Alle ingekomen facturen zijn verwerkt."
               : tab === "beoordelen" ? "Geen facturen wachten op beoordeling."
               : tab === "controle" ? "Geen facturen vereisen handmatige controle."
               : tab === "fouten" ? "Geen export-fouten aangetroffen."
               : "Geen exportklare facturen."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y">
            {lijst.map((f) => (
              <FactuurRij
                key={f.id}
                factuur={f}
                isOpen={openRij === f.id}
                onToggle={() => setOpenRij(openRij === f.id ? null : f.id)}
                aiBezig={aiBezig}
                onAi={handleAi}
                onAkkoord={handleAkkoord}
                onAfwijzen={handleAfwijzen}
                bezig={bezig}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
