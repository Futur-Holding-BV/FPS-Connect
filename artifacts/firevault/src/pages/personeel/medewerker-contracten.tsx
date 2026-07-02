import { useState, useEffect } from "react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, ChevronDown, ChevronUp, Plus, Sparkles, CheckCircle2, Clock } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type Contract = {
  id: number;
  medewerker_id: number;
  werkgever_naam: string | null;
  functie_naam: string | null;
  contracttype: string;
  start_datum: string;
  eind_datum: string | null;
  proeftijd_dagen: number | null;
  cao: string | null;
  salaris_bruto: number | null;
  arbeidsduur_per_week: number | null;
  status: string;
  voorgaand_contract_id: number | null;
  ondertekening_vereist: boolean;
  ondertekend_door_medewerker_op: string | null;
  notities: string | null;
  dagen_tot_einde: number | null;
  aangemaakt_op: string;
  bijgewerkt_op: string;
};

type Signalering = {
  id: number;
  type: string;
  ernst: string;
  boodschap: string;
  ai_advies: string | null;
  status: string;
  gezien_op: string | null;
  aangemaakt_op: string;
};

type Besluit = {
  id: number;
  besluit: string;
  nieuw_eind_datum: string | null;
  nieuw_salaris: number | null;
  nieuw_arbeidsduur: number | null;
  toelichting: string | null;
  ai_samenvatting: string | null;
  ai_aandachtspunten: string[] | null;
  ai_wettelijke_risicos: string[] | null;
  status: string;
  besloten_op: string | null;
  audittrail: Array<{ actie: string; doorId: number | null; op: string; notitie: string | null }>;
};

// ── Labels ───────────────────────────────────────────────────────────────────

const CONTRACTTYPE_LABEL: Record<string, string> = {
  bepaalde_tijd: "Bepaalde tijd",
  onbepaalde_tijd: "Onbepaalde tijd",
  oproep: "Oproepcontract",
  stage: "Stage",
  leer_werk: "Leer-werk",
};

const STATUS_LABEL: Record<string, string> = {
  concept: "Concept",
  actief: "Actief",
  verlopen: "Verlopen",
  opgezegd: "Opgezegd",
  omgezet: "Omgezet",
  beëindigd: "Beëindigd",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  actief: "default",
  concept: "secondary",
  verlopen: "destructive",
  opgezegd: "outline",
  omgezet: "secondary",
  beëindigd: "outline",
};

const ERNST_KLEUR: Record<string, string> = {
  kritiek: "text-red-600 bg-red-50 border-red-200",
  waarschuwing: "text-orange-600 bg-orange-50 border-orange-200",
  info: "text-slate-600 bg-slate-50 border-slate-200",
};

const BESLUIT_LABEL: Record<string, string> = {
  verlengen: "Verlengen",
  wijzigen: "Wijzigen",
  onbepaalde_tijd: "Omzetten naar onbepaalde tijd",
  beëindigen: "Beëindigen",
  geen_besluit: "Nog geen besluit",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDatum(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

function dagLabel(dagen: number | null): string {
  if (dagen === null) return "—";
  if (dagen < 0) return `${Math.abs(dagen)} dag(en) geleden verlopen`;
  if (dagen === 0) return "Verloopt vandaag";
  return `Nog ${dagen} dag(en)`;
}

// ── Nieuw-contract-formulier ─────────────────────────────────────────────────

const LEEG_FORMULIER = {
  contracttype: "bepaalde_tijd",
  start_datum: "",
  eind_datum: "",
  proeftijd_dagen: "",
  cao: "",
  salaris_bruto: "",
  arbeidsduur_per_week: "",
  functie_omschrijving: "",
  notities: "",
  ondertekening_vereist: false,
};

function ContractFormulier({
  open,
  onSluiten,
  onOpgeslagen,
  medewerkerId,
}: {
  open: boolean;
  onSluiten: () => void;
  onOpgeslagen: () => void;
  medewerkerId: number;
}) {
  const [form, setForm] = useState(LEEG_FORMULIER);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  function stel(veld: keyof typeof LEEG_FORMULIER, waarde: string | boolean) {
    setForm((v) => ({ ...v, [veld]: waarde }));
  }

  async function opslaan() {
    if (!form.contracttype || !form.start_datum) {
      setFout("Contracttype en startdatum zijn verplicht.");
      return;
    }
    setBezig(true);
    setFout(null);
    try {
      const resp = await fetch(`/api/contract-bewaking/medewerkers/${medewerkerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contracttype: form.contracttype,
          start_datum: form.start_datum,
          eind_datum: form.eind_datum || null,
          proeftijd_dagen: form.proeftijd_dagen ? parseInt(form.proeftijd_dagen) : null,
          cao: form.cao || null,
          salaris_bruto: form.salaris_bruto ? parseFloat(form.salaris_bruto) : null,
          arbeidsduur_per_week: form.arbeidsduur_per_week ? parseFloat(form.arbeidsduur_per_week) : null,
          functie_omschrijving: form.functie_omschrijving || null,
          notities: form.notities || null,
          ondertekening_vereist: form.ondertekening_vereist,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Opslaan mislukt");
      }
      setForm(LEEG_FORMULIER);
      onOpgeslagen();
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Opslaan mislukt");
    } finally {
      setBezig(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onSluiten(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nieuw contract toevoegen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {fout && <Alert variant="destructive"><AlertDescription>{fout}</AlertDescription></Alert>}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Contracttype *</Label>
              <Select value={form.contracttype} onValueChange={(v) => stel("contracttype", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CONTRACTTYPE_LABEL).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Startdatum *</Label>
              <Input type="date" value={form.start_datum} onChange={(e) => stel("start_datum", e.target.value)} />
            </div>
            <div>
              <Label>Einddatum</Label>
              <Input type="date" value={form.eind_datum} onChange={(e) => stel("eind_datum", e.target.value)} />
            </div>
            <div>
              <Label>Salaris bruto (€/mnd)</Label>
              <Input type="number" min={0} step={0.01} value={form.salaris_bruto} onChange={(e) => stel("salaris_bruto", e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <Label>Arbeidsduur (uur/week)</Label>
              <Input type="number" min={0} max={40} step={0.5} value={form.arbeidsduur_per_week} onChange={(e) => stel("arbeidsduur_per_week", e.target.value)} placeholder="40" />
            </div>
            <div>
              <Label>Proeftijd (dagen)</Label>
              <Select value={form.proeftijd_dagen} onValueChange={(v) => stel("proeftijd_dagen", v)}>
                <SelectTrigger><SelectValue placeholder="Geen" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Geen proeftijd</SelectItem>
                  <SelectItem value="30">30 dagen (1 maand)</SelectItem>
                  <SelectItem value="60">60 dagen (2 maanden)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>CAO</Label>
              <Input value={form.cao} onChange={(e) => stel("cao", e.target.value)} placeholder="bijv. Metaal & Techniek" />
            </div>
            <div className="col-span-2">
              <Label>Functiebeschrijving (afwijkend)</Label>
              <Input value={form.functie_omschrijving} onChange={(e) => stel("functie_omschrijving", e.target.value)} placeholder="Optioneel, laat leeg voor standaard" />
            </div>
            <div className="col-span-2">
              <Label>Notities</Label>
              <Textarea value={form.notities} onChange={(e) => stel("notities", e.target.value)} rows={2} placeholder="Interne notities" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onSluiten} disabled={bezig}>Annuleren</Button>
          <Button onClick={opslaan} disabled={bezig}>{bezig ? "Opslaan..." : "Opslaan"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Besluitvorming-paneel ────────────────────────────────────────────────────

function BesluitPaneel({
  contractId,
  onBijgewerkt,
}: {
  contractId: number;
  onBijgewerkt: () => void;
}) {
  const { heeftNiveau } = useBevoegdheid();
  const magSchrijven = heeftNiveau("personeel", 2);

  const [besluit, setBesluit] = useState<Besluit | null>(null);
  const [laden, setLaden] = useState(true);
  const [aiBezig, setAiBezig] = useState(false);
  const [besluitBezig, setBesluitBezig] = useState(false);
  const [gekozenBesluit, setGekozenBesluit] = useState("");
  const [toelichting, setToelichting] = useState("");
  const [nieuwEindDatum, setNieuwEindDatum] = useState("");
  const [fout, setFout] = useState<string | null>(null);

  async function laadBesluit() {
    setLaden(true);
    try {
      const r = await fetch(`/api/contract-bewaking/${contractId}/besluit`);
      if (r.ok) {
        const d = await r.json();
        setBesluit(d);
        if (d?.besluit) setGekozenBesluit(d.besluit);
        if (d?.toelichting) setToelichting(d.toelichting);
        if (d?.nieuw_eind_datum) setNieuwEindDatum(d.nieuw_eind_datum);
      }
    } finally {
      setLaden(false);
    }
  }

  useEffect(() => { laadBesluit(); }, [contractId]);

  async function vraagAiVoorbereiding() {
    setAiBezig(true);
    setFout(null);
    try {
      const r = await fetch(`/api/contract-bewaking/${contractId}/ai-voorbereiding`, { method: "POST" });
      if (!r.ok) throw new Error("AI-voorbereiding mislukt");
      await laadBesluit();
    } catch {
      setFout("AI-voorbereiding kon niet worden gegenereerd.");
    } finally {
      setAiBezig(false);
    }
  }

  async function slaatBesluitOp() {
    if (!gekozenBesluit) { setFout("Kies een besluit."); return; }
    setBesluitBezig(true);
    setFout(null);
    try {
      const r = await fetch(`/api/contract-bewaking/${contractId}/besluit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          besluit: gekozenBesluit,
          nieuw_eind_datum: nieuwEindDatum || null,
          toelichting: toelichting || null,
        }),
      });
      if (!r.ok) throw new Error("Opslaan mislukt");
      await laadBesluit();
      onBijgewerkt();
    } catch {
      setFout("Besluit kon niet worden opgeslagen.");
    } finally {
      setBesluitBezig(false);
    }
  }

  if (laden) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-4">
      {fout && <Alert variant="destructive"><AlertDescription>{fout}</AlertDescription></Alert>}

      {/* AI-voorbereiding */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-slate-700">AI-gespreksvoorbereiding</p>
          {magSchrijven && (
            <Button
              variant="outline"
              size="sm"
              onClick={vraagAiVoorbereiding}
              disabled={aiBezig}
              className="gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {aiBezig ? "Genereren..." : "Voorbereiding genereren"}
            </Button>
          )}
        </div>
        {besluit?.ai_samenvatting ? (
          <div className="rounded-md border bg-amber-50 border-amber-200 p-3 text-sm text-amber-900 whitespace-pre-wrap">
            {besluit.ai_samenvatting}
            <p className="text-xs text-amber-700 mt-2 italic">
              Dit is uitsluitend een ondersteunend AI-advies. De beslissing ligt altijd bij HR en directie.
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-400 italic">Nog geen voorbereiding gegenereerd.</p>
        )}
      </div>

      {/* AI aandachtspunten */}
      {besluit?.ai_aandachtspunten && besluit.ai_aandachtspunten.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-1.5">Aandachtspunten</p>
          <ul className="space-y-1">
            {besluit.ai_aandachtspunten.map((punt, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-0.5 shrink-0 text-amber-500">&#9654;</span>
                {punt}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Wettelijke risico's */}
      {besluit?.ai_wettelijke_risicos && besluit.ai_wettelijke_risicos.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-1.5">Wettelijke risico&apos;s</p>
          {besluit.ai_wettelijke_risicos.map((r, i) => (
            <Alert key={i} className="mb-1.5 py-2 border-orange-300 bg-orange-50">
              <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
              <AlertDescription className="text-orange-800 text-xs">{r}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      <Separator />

      {/* Besluit vastleggen */}
      <div>
        <p className="text-sm font-semibold text-slate-700 mb-2">Besluit</p>
        {magSchrijven ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2">
              {["verlengen", "wijzigen", "onbepaalde_tijd", "beëindigen", "geen_besluit"].map((opt) => (
                <label
                  key={opt}
                  className={`flex items-center gap-2.5 rounded-md border px-3 py-2 cursor-pointer transition-colors ${gekozenBesluit === opt ? "border-orange-400 bg-orange-50" : "border-slate-200 hover:bg-slate-50"}`}
                >
                  <input
                    type="radio"
                    name="besluit"
                    value={opt}
                    checked={gekozenBesluit === opt}
                    onChange={() => setGekozenBesluit(opt)}
                    className="accent-orange-500"
                  />
                  <span className="text-sm text-slate-800">{BESLUIT_LABEL[opt]}</span>
                </label>
              ))}
            </div>

            {(gekozenBesluit === "verlengen" || gekozenBesluit === "wijzigen") && (
              <div>
                <Label className="text-xs">Nieuwe einddatum</Label>
                <Input type="date" value={nieuwEindDatum} onChange={(e) => setNieuwEindDatum(e.target.value)} className="mt-1" />
              </div>
            )}

            <div>
              <Label className="text-xs">Toelichting</Label>
              <Textarea
                value={toelichting}
                onChange={(e) => setToelichting(e.target.value)}
                rows={2}
                placeholder="Motivatie voor dit besluit..."
                className="mt-1"
              />
            </div>

            <Button onClick={slaatBesluitOp} disabled={besluitBezig || !gekozenBesluit} className="w-full">
              {besluitBezig ? "Opslaan..." : "Besluit vastleggen"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            {besluit?.besluit
              ? `Besluit: ${BESLUIT_LABEL[besluit.besluit] ?? besluit.besluit}`
              : "Geen besluit vastgelegd."}
          </p>
        )}
      </div>

      {/* Audittrail */}
      {besluit?.audittrail && besluit.audittrail.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-1.5">Audittrail</p>
          <ul className="space-y-1">
            {besluit.audittrail.map((item, i) => (
              <li key={i} className="text-xs text-slate-500 flex gap-2">
                <Clock className="h-3 w-3 mt-0.5 shrink-0" />
                <span>{formatDatum(item.op)} — {item.actie}{item.notitie ? ` (${item.notitie})` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Signaleringen-paneel ─────────────────────────────────────────────────────

function SignaleringenPaneel({ contractId }: { contractId: number }) {
  const [signaleringen, setSignaleringen] = useState<Signalering[]>([]);
  const [laden, setLaden] = useState(true);

  useEffect(() => {
    fetch(`/api/contract-bewaking/${contractId}/signaleringen`)
      .then((r) => r.json())
      .then((d) => { setSignaleringen(d); setLaden(false); })
      .catch(() => setLaden(false));
  }, [contractId]);

  if (laden) return <Skeleton className="h-16 w-full" />;
  if (signaleringen.length === 0) return <p className="text-sm text-slate-400 italic">Geen signaleringen voor dit contract.</p>;

  return (
    <ul className="space-y-2">
      {signaleringen.map((s) => (
        <li
          key={s.id}
          className={`rounded-md border px-3 py-2 text-sm flex items-start gap-2 ${ERNST_KLEUR[s.ernst] ?? "text-slate-600 bg-slate-50 border-slate-200"}`}
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">{s.boodschap}</p>
            {s.ai_advies && <p className="text-xs mt-0.5 opacity-80">{s.ai_advies}</p>}
            <p className="text-xs mt-1 opacity-60">
              {formatDatum(s.aangemaakt_op)} · {s.status === "gezien" ? "Gezien" : "Nieuw"}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Contract-kaart ───────────────────────────────────────────────────────────

function ContractKaart({
  contract,
  onBijgewerkt,
}: {
  contract: Contract;
  onBijgewerkt: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"info" | "signaleringen" | "besluit">("info");

  const isActief = contract.status === "actief";
  const isTijdelijk = contract.contracttype === "bepaalde_tijd" || contract.contracttype === "oproep" || contract.contracttype === "stage" || contract.contracttype === "leer_werk";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={STATUS_VARIANT[contract.status] ?? "secondary"}>
                {STATUS_LABEL[contract.status] ?? contract.status}
              </Badge>
              <span className="text-sm font-semibold text-slate-800">
                {CONTRACTTYPE_LABEL[contract.contracttype] ?? contract.contracttype}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {formatDatum(contract.start_datum)} — {contract.eind_datum ? formatDatum(contract.eind_datum) : "onbepaald"}
              {contract.dagen_tot_einde !== null && isActief && isTijdelijk && (
                <span className={`ml-2 font-medium ${contract.dagen_tot_einde <= 30 ? "text-red-600" : contract.dagen_tot_einde <= 60 ? "text-orange-600" : "text-slate-600"}`}>
                  ({dagLabel(contract.dagen_tot_einde)})
                </span>
              )}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="p-4 pt-0 space-y-4">
          {/* Tab-knoppen */}
          <div className="flex gap-1 border-b pb-2">
            {(["info", "signaleringen", "besluit"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${tab === t ? "bg-orange-100 text-orange-700 font-medium" : "text-slate-500 hover:bg-slate-100"}`}
              >
                {t === "info" ? "Contractgegevens" : t === "signaleringen" ? "Signaleringen" : "Besluitvorming"}
              </button>
            ))}
          </div>

          {tab === "info" && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {[
                ["Salaris", contract.salaris_bruto ? `€ ${contract.salaris_bruto.toLocaleString("nl-NL", { minimumFractionDigits: 2 })} bruto/mnd` : "—"],
                ["Arbeidsduur", contract.arbeidsduur_per_week ? `${contract.arbeidsduur_per_week} uur/week` : "—"],
                ["CAO", contract.cao ?? "—"],
                ["Proeftijd", contract.proeftijd_dagen ? `${contract.proeftijd_dagen} dagen` : "Geen"],
                ["Ondertekening", contract.ondertekening_vereist
                  ? (contract.ondertekend_door_medewerker_op ? `Ondertekend op ${formatDatum(contract.ondertekend_door_medewerker_op)}` : "Nog te ondertekenen")
                  : "Niet vereist"],
                ["Functie", contract.functie_naam ?? "—"],
                ["Werkgever", contract.werkgever_naam ?? "—"],
              ].map(([l, w]) => (
                <div key={l as string}>
                  <dt className="text-xs text-slate-500">{l}</dt>
                  <dd className="text-slate-800 font-medium">{w}</dd>
                </div>
              ))}
              {contract.notities && (
                <div className="col-span-2">
                  <dt className="text-xs text-slate-500">Notities</dt>
                  <dd className="text-slate-700">{contract.notities}</dd>
                </div>
              )}
            </dl>
          )}

          {tab === "signaleringen" && (
            <SignaleringenPaneel contractId={contract.id} />
          )}

          {tab === "besluit" && isTijdelijk && (
            <BesluitPaneel contractId={contract.id} onBijgewerkt={onBijgewerkt} />
          )}

          {tab === "besluit" && !isTijdelijk && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-md p-3 border border-green-200">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Onbepaalde tijd — geen verlengingsbeslissing nodig.</span>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Hoofd-export ─────────────────────────────────────────────────────────────

export function MedewerkerContractenTab({ medewerkerId }: { medewerkerId: number }) {
  const { heeftNiveau } = useBevoegdheid();
  const magSchrijven = heeftNiveau("personeel", 2);

  const [contracten, setContracten] = useState<Contract[]>([]);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState<string | null>(null);
  const [nieuwOpen, setNieuwOpen] = useState(false);

  async function laadContracten() {
    setLaden(true);
    setFout(null);
    try {
      const r = await fetch(`/api/contract-bewaking/medewerkers/${medewerkerId}`);
      if (!r.ok) throw new Error("Contracten konden niet worden geladen");
      setContracten(await r.json());
    } catch {
      setFout("Contracten konden niet worden geladen.");
    } finally {
      setLaden(false);
    }
  }

  useEffect(() => { laadContracten(); }, [medewerkerId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Contracthistorie</h2>
        {magSchrijven && (
          <Button size="sm" variant="outline" onClick={() => setNieuwOpen(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Nieuw contract
          </Button>
        )}
      </div>

      {fout && <Alert variant="destructive"><AlertDescription>{fout}</AlertDescription></Alert>}

      {laden && <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>}

      {!laden && contracten.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-slate-500 text-sm">Nog geen contracten geregistreerd.</p>
          </CardContent>
        </Card>
      )}

      {!laden && contracten.map((c) => (
        <ContractKaart key={c.id} contract={c} onBijgewerkt={laadContracten} />
      ))}

      <ContractFormulier
        open={nieuwOpen}
        onSluiten={() => setNieuwOpen(false)}
        onOpgeslagen={() => { setNieuwOpen(false); laadContracten(); }}
        medewerkerId={medewerkerId}
      />
    </div>
  );
}
