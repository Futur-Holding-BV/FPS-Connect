import { useState } from "react";
import { useLocation } from "wouter";
import {
  useCreateMedewerker,
  useListFuncties,
  useListVerlofsoorten,
  useListCaoOpties,
  getListMedewerkersQueryKey,
  getGetHrmStatsQueryKey,
} from "@workspace/api-client-react";
import type { MedewerkerInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  SelectGroup, SelectLabel,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  UserCheck, Handshake, Building2, ArrowLeft, ArrowRight,
  CheckCircle2, ExternalLink, RotateCcw,
} from "lucide-react";
import { WERKMAATSCHAPPIJEN, caoVoorWerkmaatschappij } from "@/lib/werkmaatschappijen";

const WERKMAATSCHAPPIJ_STD = WERKMAATSCHAPPIJEN[0];

// ─── Typen ────────────────────────────────────────────────────────────────────

type Stroom = "vast" | "zzp" | "uitzend";

interface StRoomsKaart {
  id: Stroom;
  titel: string;
  subtitel: string;
  icoon: React.ReactNode;
  kenmerken: string[];
  accent: string;
}

const STROMEN: StRoomsKaart[] = [
  {
    id: "vast",
    titel: "Vaste / tijdelijke medewerker",
    subtitel: "In loondienst via FPS",
    icoon: <UserCheck className="h-7 w-7" />,
    kenmerken: ["Vaste of tijdelijke aanstelling", "CAO van toepassing", "Verlofopbouw via FPS", "Buitendienst of kantoor"],
    accent: "border-blue-200 hover:border-blue-400 hover:bg-blue-50/40",
  },
  {
    id: "zzp",
    titel: "ZZP-er",
    subtitel: "Zelfstandige zonder personeel",
    icoon: <Handshake className="h-7 w-7" />,
    kenmerken: ["Overeenkomst van opdracht (Wet DBA)", "Eigen KvK en BTW-nummer", "Factureert per uur of vaste prijs", "Geen dienstbetrekking"],
    accent: "border-orange-200 hover:border-orange-400 hover:bg-orange-50/40",
  },
  {
    id: "uitzend",
    titel: "Uitzendkracht / Inhuur",
    subtitel: "Via bureau of onderaannemer",
    icoon: <Building2 className="h-7 w-7" />,
    kenmerken: ["Ingehuurd via uitzendbureau of onderaannemer", "Contract loopt via het bureau", "Tijdelijke inzet op projecten", "Einddatum doorgaans verplicht"],
    accent: "border-purple-200 hover:border-purple-400 hover:bg-purple-50/40",
  },
];

// ─── Forms ────────────────────────────────────────────────────────────────────

interface VastForm {
  naam: string;
  email: string;
  functie_id: number | null;
  werkmaatschappij: string;
  cao: string;
  dienstverband: string;
  contracturen_per_week: string;
  in_dienst_sinds: string;
  verlofsoort_ids: number[];
}

interface ZzpForm {
  naam: string;
  bedrijfsnaam: string;
  kvk: string;
  btw: string;
  functie_id: number | null;
  werkmaatschappij: string;
  uurtarief: string;
  start_datum: string;
  eind_datum: string;
}

interface UitzendForm {
  naam: string;
  bureau_of_bedrijf: string;
  functie_id: number | null;
  werkmaatschappij: string;
  start_datum: string;
  eind_datum: string;
  opmerkingen: string;
}

const LEEG_VAST: VastForm = {
  naam: "",
  email: "",
  functie_id: null,
  werkmaatschappij: WERKMAATSCHAPPIJ_STD,
  cao: caoVoorWerkmaatschappij(WERKMAATSCHAPPIJ_STD) ?? "",
  dienstverband: "vast",
  contracturen_per_week: "38",
  in_dienst_sinds: new Date().toISOString().slice(0, 10),
  verlofsoort_ids: [],
};

const LEEG_ZZP: ZzpForm = {
  naam: "",
  bedrijfsnaam: "",
  kvk: "",
  btw: "",
  functie_id: null,
  werkmaatschappij: WERKMAATSCHAPPIJ_STD,
  uurtarief: "",
  start_datum: new Date().toISOString().slice(0, 10),
  eind_datum: "",
};

const LEEG_UITZEND: UitzendForm = {
  naam: "",
  bureau_of_bedrijf: "",
  functie_id: null,
  werkmaatschappij: WERKMAATSCHAPPIJ_STD,
  start_datum: new Date().toISOString().slice(0, 10),
  eind_datum: "",
  opmerkingen: "",
};

// ─── Hulpfuncties ─────────────────────────────────────────────────────────────

function FunctieSelect({
  functieId,
  functies,
  onChange,
}: {
  functieId: number | null;
  functies: { id: number; naam: string; uitvoerend?: boolean }[];
  onChange: (id: number) => void;
}) {
  if (functies.length === 0) {
    return (
      <p className="text-xs text-muted-foreground border rounded-md px-3 py-2">
        Nog geen functies. Voeg eerst een functie toe via Personeel &rsaquo; Functiehuis.
      </p>
    );
  }
  return (
    <Select value={functieId ? String(functieId) : undefined} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger><SelectValue placeholder="Kies functie" /></SelectTrigger>
      <SelectContent>
        {functies.some((f) => f.uitvoerend) && (
          <SelectGroup>
            <SelectLabel className="text-xs font-semibold text-primary">Buitendienst</SelectLabel>
            {functies.filter((f) => f.uitvoerend).map((f) => (
              <SelectItem key={f.id} value={String(f.id)}>{f.naam}</SelectItem>
            ))}
          </SelectGroup>
        )}
        {functies.some((f) => !f.uitvoerend) && (
          <SelectGroup>
            <SelectLabel className="text-xs font-semibold text-muted-foreground">Kantoor / staf</SelectLabel>
            {functies.filter((f) => !f.uitvoerend).map((f) => (
              <SelectItem key={f.id} value={String(f.id)}>{f.naam}</SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}

// ─── Stap 1: Type kiezen ──────────────────────────────────────────────────────

function TypeKiezer({ onKies }: { onKies: (s: Stroom) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Onboarden</h1>
        <p className="text-muted-foreground mt-1">
          Kies het type indiensttreding. Elk type heeft een eigen intake met de juiste velden en vervolgstappen.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {STROMEN.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onKies(s.id)}
            className={`text-left rounded-xl border-2 p-5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${s.accent}`}
          >
            <div className="text-muted-foreground mb-3">{s.icoon}</div>
            <div className="font-semibold text-base leading-tight">{s.titel}</div>
            <div className="text-xs text-muted-foreground mt-0.5 mb-3">{s.subtitel}</div>
            <ul className="space-y-1">
              {s.kenmerken.map((k) => (
                <li key={k} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                  {k}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center gap-1 text-xs font-medium">
              Starten <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Stap 2a: Vast / tijdelijk ────────────────────────────────────────────────

function VastFormulier({
  onTerug,
  onGereed,
}: {
  onTerug: () => void;
  onGereed: (id: number) => void;
}) {
  const [form, setForm] = useState<VastForm>(LEEG_VAST);
  const { data: functies } = useListFuncties();
  const { data: verlofsoorten } = useListVerlofsoorten();
  const { data: caoOpties } = useListCaoOpties();
  const maak = useCreateMedewerker();
  const { toast } = useToast();

  function toggleVerlof(id: number) {
    setForm((f) => ({
      ...f,
      verlofsoort_ids: f.verlofsoort_ids.includes(id)
        ? f.verlofsoort_ids.filter((x) => x !== id)
        : [...f.verlofsoort_ids, id],
    }));
  }

  async function opslaan() {
    if (!form.naam.trim()) {
      toast({ title: "Naam is verplicht", variant: "destructive" });
      return;
    }
    try {
      const input: MedewerkerInput = {
        naam: form.naam.trim(),
        email: form.email.trim() || undefined,
        functie_id: form.functie_id ?? undefined,
        werkmaatschappij: form.werkmaatschappij,
        cao: form.cao || undefined,
        dienstverband: form.dienstverband,
        contracturen_per_week: form.contracturen_per_week ? Number(form.contracturen_per_week) : undefined,
        in_dienst_sinds: form.in_dienst_sinds || undefined,
      };
      const nieuw = await maak.mutateAsync({ data: input });
      onGereed(nieuw.id);
    } catch {
      toast({ title: "Aanmaken mislukt", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onTerug}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Vaste / tijdelijke medewerker</h1>
          <p className="text-sm text-muted-foreground">In loondienst via FPS — CAO en verlofopbouw van toepassing</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5 col-span-2">
            <Label>Naam *</Label>
            <Input placeholder="Voor- en achternaam" value={form.naam} onChange={(e) => setForm({ ...form, naam: e.target.value })} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>E-mailadres <span className="text-muted-foreground text-xs">(voor uitnodiging account)</span></Label>
            <Input type="email" placeholder="naam@bedrijf.nl" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Functie</Label>
          <FunctieSelect
            functieId={form.functie_id}
            functies={functies ?? []}
            onChange={(id) => setForm({ ...form, functie_id: id })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Dienstverband</Label>
            <Select value={form.dienstverband} onValueChange={(v) => setForm({ ...form, dienstverband: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="vast">Vaste medewerker</SelectItem>
                <SelectItem value="tijdelijk">Tijdelijk contract</SelectItem>
                <SelectItem value="oproep">Oproepkracht</SelectItem>
                <SelectItem value="stage">Stagiair</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Contracturen/week</Label>
            <Input type="number" min="0" max="48" value={form.contracturen_per_week} onChange={(e) => setForm({ ...form, contracturen_per_week: e.target.value })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Werkmaatschappij *</Label>
            <Select
              value={form.werkmaatschappij}
              onValueChange={(v) => setForm({ ...form, werkmaatschappij: v, cao: caoVoorWerkmaatschappij(v) ?? form.cao })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {WERKMAATSCHAPPIJEN.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>CAO</Label>
            <Select value={form.cao || undefined} onValueChange={(v) => setForm({ ...form, cao: v })}>
              <SelectTrigger><SelectValue placeholder="Kies CAO" /></SelectTrigger>
              <SelectContent>
                {(caoOpties ?? []).map((c) => <SelectItem key={c.naam} value={c.naam}>{c.naam}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>In dienst sinds</Label>
          <Input type="date" value={form.in_dienst_sinds} onChange={(e) => setForm({ ...form, in_dienst_sinds: e.target.value })} />
        </div>

        {(verlofsoorten ?? []).length > 0 && (
          <div className="space-y-2">
            <Label>Verlofsoorten met beginsaldo <span className="text-muted-foreground text-xs">(optioneel)</span></Label>
            <div className="grid grid-cols-2 gap-2">
              {(verlofsoorten ?? []).map((v) => (
                <label key={v.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={form.verlofsoort_ids.includes(v.id)}
                    onCheckedChange={() => toggleVerlof(v.id)}
                  />
                  {v.naam}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Geselecteerde verlofsoorten worden pro rata opgebouwd vanaf de ingangsdatum.</p>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <Button onClick={opslaan} disabled={maak.isPending}>
          {maak.isPending ? "Aanmaken…" : "Medewerker onboarden"}
        </Button>
        <Button variant="outline" onClick={onTerug}>Terug</Button>
      </div>
    </div>
  );
}

// ─── Stap 2b: ZZP ─────────────────────────────────────────────────────────────

function ZzpFormulier({
  onTerug,
  onGereed,
}: {
  onTerug: () => void;
  onGereed: (id: number) => void;
}) {
  const [form, setForm] = useState<ZzpForm>(LEEG_ZZP);
  const { data: functies } = useListFuncties();
  const maak = useCreateMedewerker();
  const { toast } = useToast();

  async function opslaan() {
    if (!form.naam.trim()) { toast({ title: "Naam is verplicht", variant: "destructive" }); return; }
    if (!form.eind_datum) { toast({ title: "Einddatum is verplicht voor een ZZP-opdracht", variant: "destructive" }); return; }
    try {
      const input: MedewerkerInput = {
        naam: form.naam.trim(),
        functie_id: form.functie_id ?? undefined,
        werkmaatschappij: form.werkmaatschappij,
        dienstverband: "zzp",
        bedrijf_uitzendbureau: form.bedrijfsnaam.trim() || undefined,
        in_dienst_sinds: form.start_datum || undefined,
        uit_dienst_per: form.eind_datum || undefined,
      };
      const nieuw = await maak.mutateAsync({ data: input });
      onGereed(nieuw.id);
    } catch {
      toast({ title: "Aanmaken mislukt", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onTerug}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">ZZP-er onboarden</h1>
          <p className="text-sm text-muted-foreground">Zelfstandige — na registratie direct een overeenkomst aanmaken</p>
        </div>
      </div>

      <div className="rounded-md border border-orange-200 bg-orange-50/50 px-4 py-3 text-sm text-orange-800 space-y-1">
        <p className="font-medium">ZZP — geen dienstbetrekking</p>
        <p className="text-xs text-orange-700">
          Na het registreren maakt u direct een overeenkomst van opdracht aan. Dit is verplicht conform de Wet DBA.
          Sla geen kosten in rekening vóór ondertekening van de overeenkomst.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Naam contactpersoon / ZZP-er *</Label>
          <Input placeholder="Voor- en achternaam" value={form.naam} onChange={(e) => setForm({ ...form, naam: e.target.value })} />
        </div>

        <div className="space-y-1.5">
          <Label>Bedrijfsnaam *</Label>
          <Input placeholder="bijv. Jansen Installatietechniek" value={form.bedrijfsnaam} onChange={(e) => setForm({ ...form, bedrijfsnaam: e.target.value })} />
          <p className="text-xs text-muted-foreground">Handelsnaam zoals ingeschreven bij de Kamer van Koophandel.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>KvK-nummer</Label>
            <Input placeholder="12345678" value={form.kvk} onChange={(e) => setForm({ ...form, kvk: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>BTW-nummer</Label>
            <Input placeholder="NL000000000B01" value={form.btw} onChange={(e) => setForm({ ...form, btw: e.target.value })} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Vakgebied / functie</Label>
          <FunctieSelect
            functieId={form.functie_id}
            functies={functies ?? []}
            onChange={(id) => setForm({ ...form, functie_id: id })}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Werkmaatschappij</Label>
          <Select value={form.werkmaatschappij} onValueChange={(v) => setForm({ ...form, werkmaatschappij: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {WERKMAATSCHAPPIJEN.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Startdatum opdracht</Label>
            <Input type="date" value={form.start_datum} onChange={(e) => setForm({ ...form, start_datum: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Einddatum opdracht * <span className="text-muted-foreground text-xs">(verplicht)</span></Label>
            <Input type="date" value={form.eind_datum} onChange={(e) => setForm({ ...form, eind_datum: e.target.value })} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Uurtarief (&euro;) <span className="text-muted-foreground text-xs">(optioneel — ook in overeenkomst vast te leggen)</span></Label>
          <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.uurtarief} onChange={(e) => setForm({ ...form, uurtarief: e.target.value })} />
        </div>
      </div>

      <div className="flex gap-3">
        <Button onClick={opslaan} disabled={maak.isPending}>
          {maak.isPending ? "Aanmaken…" : "ZZP-er registreren"}
        </Button>
        <Button variant="outline" onClick={onTerug}>Terug</Button>
      </div>
    </div>
  );
}

// ─── Stap 2c: Uitzend / inhuur ────────────────────────────────────────────────

function UitzendFormulier({
  onTerug,
  onGereed,
}: {
  onTerug: () => void;
  onGereed: (id: number) => void;
}) {
  const [form, setForm] = useState<UitzendForm>(LEEG_UITZEND);
  const [soort, setSoort] = useState<"uitzend" | "inhuur">("uitzend");
  const { data: functies } = useListFuncties();
  const maak = useCreateMedewerker();
  const { toast } = useToast();

  async function opslaan() {
    if (!form.naam.trim()) { toast({ title: "Naam is verplicht", variant: "destructive" }); return; }
    if (!form.bureau_of_bedrijf.trim()) {
      toast({ title: soort === "uitzend" ? "Naam uitzendbureau is verplicht" : "Naam onderaannemer is verplicht", variant: "destructive" });
      return;
    }
    try {
      const input: MedewerkerInput = {
        naam: form.naam.trim(),
        functie_id: form.functie_id ?? undefined,
        werkmaatschappij: form.werkmaatschappij,
        dienstverband: soort,
        bedrijf_uitzendbureau: form.bureau_of_bedrijf.trim(),
        in_dienst_sinds: form.start_datum || undefined,
        uit_dienst_per: form.eind_datum || undefined,
        opmerkingen: form.opmerkingen.trim() || undefined,
      };
      const nieuw = await maak.mutateAsync({ data: input });
      onGereed(nieuw.id);
    } catch {
      toast({ title: "Aanmaken mislukt", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onTerug}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Uitzendkracht / Inhuur</h1>
          <p className="text-sm text-muted-foreground">Ingeleend via uitzendbureau of onderaannemer</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Type inhuur</Label>
          <div className="flex gap-3">
            {[
              { v: "uitzend" as const, label: "Uitzendkracht" },
              { v: "inhuur" as const, label: "Inhuur / onderaannemer" },
            ].map(({ v, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => setSoort(v)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${soort === v ? "border-primary bg-primary/5 font-medium" : "border-input hover:bg-muted/40"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <Separator />

        <div className="space-y-1.5">
          <Label>Naam medewerker *</Label>
          <Input placeholder="Voor- en achternaam" value={form.naam} onChange={(e) => setForm({ ...form, naam: e.target.value })} />
        </div>

        <div className="space-y-1.5">
          <Label>{soort === "uitzend" ? "Naam uitzendbureau *" : "Naam onderaannemer / bedrijf *"}</Label>
          <Input
            placeholder={soort === "uitzend" ? "bijv. Randstad, Tempo-Team" : "bijv. Jansen BV"}
            value={form.bureau_of_bedrijf}
            onChange={(e) => setForm({ ...form, bureau_of_bedrijf: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Vakgebied / functie</Label>
          <FunctieSelect
            functieId={form.functie_id}
            functies={functies ?? []}
            onChange={(id) => setForm({ ...form, functie_id: id })}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Werkmaatschappij</Label>
          <Select value={form.werkmaatschappij} onValueChange={(v) => setForm({ ...form, werkmaatschappij: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {WERKMAATSCHAPPIJEN.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Startdatum</Label>
            <Input type="date" value={form.start_datum} onChange={(e) => setForm({ ...form, start_datum: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Einddatum <span className="text-muted-foreground text-xs">(aanbevolen)</span></Label>
            <Input type="date" value={form.eind_datum} onChange={(e) => setForm({ ...form, eind_datum: e.target.value })} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Opmerkingen <span className="text-muted-foreground text-xs">(bijv. contactpersoon bureau)</span></Label>
          <Input
            placeholder={soort === "uitzend" ? "bijv. Contactpersoon: Jan de Vries, 06-12345678" : "bijv. Onderdeel van project 2025-042"}
            value={form.opmerkingen}
            onChange={(e) => setForm({ ...form, opmerkingen: e.target.value })}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button onClick={opslaan} disabled={maak.isPending}>
          {maak.isPending ? "Aanmaken…" : `${soort === "uitzend" ? "Uitzendkracht" : "Inhuurkracht"} registreren`}
        </Button>
        <Button variant="outline" onClick={onTerug}>Terug</Button>
      </div>
    </div>
  );
}

// ─── Stap 3: Succes ───────────────────────────────────────────────────────────

function Succes({ stroom, medewerkerId, onNogEen }: { stroom: Stroom; medewerkerId: number; onNogEen: () => void }) {
  const [, navigate] = useLocation();

  const SUCCES_INHOUD: Record<Stroom, { titel: string; tekst: string; cta: string; ctaHref: string; ctaLabel: string }> = {
    vast: {
      titel: "Medewerker geregistreerd",
      tekst: "Het profiel is aangemaakt. Koppel nu een gebruikersaccount via het medewerkerprofiel om ook app-toegang te geven.",
      cta: `/personeel/${medewerkerId}`,
      ctaLabel: "Profiel bekijken",
      ctaHref: `/personeel/${medewerkerId}`,
    },
    zzp: {
      titel: "ZZP-er geregistreerd",
      tekst: "De ZZP-er staat in het systeem. Maak nu direct een overeenkomst van opdracht aan — dit is verplicht conform de Wet DBA. Facturen worden alleen goedgekeurd met een ondertekende overeenkomst.",
      cta: "/personeel/externen",
      ctaLabel: "Overeenkomst aanmaken",
      ctaHref: "/personeel/externen",
    },
    uitzend: {
      titel: "Uitzendkracht geregistreerd",
      tekst: "De medewerker staat in het systeem en is zichtbaar onder Externen / ZZP. Voeg daar eventueel projectkoppelingen en bijlagen toe.",
      cta: `/personeel/${medewerkerId}`,
      ctaLabel: "Profiel bekijken",
      ctaHref: `/personeel/${medewerkerId}`,
    },
  };

  const inhoud = SUCCES_INHOUD[stroom];

  return (
    <div className="space-y-6 max-w-md">
      <div className="flex items-center gap-3 text-green-700">
        <CheckCircle2 className="h-8 w-8 shrink-0" />
        <h1 className="text-xl font-bold">{inhoud.titel}</h1>
      </div>

      <p className="text-muted-foreground">{inhoud.tekst}</p>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => navigate(inhoud.ctaHref)} className="gap-1.5">
          {inhoud.ctaLabel} <ExternalLink className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" onClick={onNogEen} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" /> Nog iemand onboarden
        </Button>
      </div>

      {stroom === "zzp" && (
        <div className="rounded-md border border-amber-200 bg-amber-50/50 px-4 py-3 text-xs text-amber-800 space-y-1">
          <p className="font-medium">Herinnering — ZZP Wet DBA checklist</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Overeenkomst van opdracht getekend vóór aanvang werkzaamheden</li>
            <li>KvK- en BTW-nummer vastgelegd</li>
            <li>Einddatum én specifieke werkzaamheden omschreven (geen gezagsverhouding)</li>
            <li>Facturen controleren op geldige BTW-vermelding</li>
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Hoofdcomponent ───────────────────────────────────────────────────────────

export default function OnboardenPagina() {
  const queryClient = useQueryClient();
  const [stroom, setStroom] = useState<Stroom | null>(null);
  const [afrondMedewerkerId, setAfrondMedewerkerId] = useState<number | null>(null);

  async function gereed(id: number) {
    setAfrondMedewerkerId(id);
    await queryClient.invalidateQueries({ queryKey: getListMedewerkersQueryKey() });
    await queryClient.invalidateQueries({ queryKey: getGetHrmStatsQueryKey() });
  }

  function reset() {
    setStroom(null);
    setAfrondMedewerkerId(null);
  }

  if (afrondMedewerkerId !== null && stroom !== null) {
    return <Succes stroom={stroom} medewerkerId={afrondMedewerkerId} onNogEen={reset} />;
  }

  if (stroom === null) {
    return <TypeKiezer onKies={setStroom} />;
  }

  if (stroom === "vast") {
    return <VastFormulier onTerug={() => setStroom(null)} onGereed={gereed} />;
  }
  if (stroom === "zzp") {
    return <ZzpFormulier onTerug={() => setStroom(null)} onGereed={gereed} />;
  }
  return <UitzendFormulier onTerug={() => setStroom(null)} onGereed={gereed} />;
}
