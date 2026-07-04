import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useListFieBegrotingen,
  useCreateFieBegroting,
  useUpdateFieBegroting,
  useGetFieBegroting,
  useCreateFieAkPost,
  useUpdateFieAkPost,
  useDeleteFieAkPost,
  useGetFiePrognose,
  useGetFieObservaties,
  getListFieBegrotingenQueryKey,
  getGetFieBegrotingQueryKey,
  useListFieLeermomenten,
  useHerberekeenFieLeermomenten,
  useHerberekeenVerouderdeNacalculaties,
  useUpdateFieLeermoment,
  useDeleteFieLeermoment,
  type FieJaarbegroting,
  type FieAkPost,
  type FieJaarprognose,
  type FieKwartaalPrognose,
  type FieLeermoment,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Plus, Pencil, Trash2, TrendingUp,
  Calculator, CheckCircle2, Clock, XCircle, AlertTriangle, Users, Info,
  Check, X, BookOpen, RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";

// ─── Constanten ───────────────────────────────────────────────────────────────

const STATUS_OPTIES = [
  { value: "concept",  label: "Concept" },
  { value: "actief",   label: "Actief" },
  { value: "gesloten", label: "Gesloten" },
];

const STATUS_KLEUR: Record<string, string> = {
  concept:  "bg-muted text-muted-foreground border-border",
  actief:   "bg-green-100 text-green-800 border-green-200",
  gesloten: "bg-slate-100 text-slate-600 border-slate-200",
};

const STATUS_ICOON: Record<string, React.ReactNode> = {
  concept:  <Clock className="w-3 h-3" />,
  actief:   <CheckCircle2 className="w-3 h-3" />,
  gesloten: <XCircle className="w-3 h-3" />,
};

const AK_CATEGORIE_OPTIES = [
  { value: "huisvesting",        label: "Huisvesting" },
  { value: "personeel_indirect", label: "Personeel indirect" },
  { value: "voertuigen",         label: "Voertuigen" },
  { value: "ict",                label: "ICT" },
  { value: "verzekeringen",      label: "Verzekeringen" },
  { value: "marketing",          label: "Marketing" },
  { value: "overig",             label: "Overig" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function fmtPct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${n.toFixed(1)}%`;
}

function fmtUur(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

// ─── Begroting Formulier ─────────────────────────────────────────────────────

type BegrotingFormData = {
  boekjaar: string;
  status: string;
  omzet_doel: string;
  doel_marge_pct: string;
  ak_per_productief_uur: string;
  productieve_uren_doel: string;
  verdeelsleutel: string;
  opmerkingen: string;
};

const LEEG_BEGROTING: BegrotingFormData = {
  boekjaar: String(new Date().getFullYear()),
  status: "concept",
  omzet_doel: "",
  doel_marge_pct: "15",
  ak_per_productief_uur: "",
  productieve_uren_doel: "",
  verdeelsleutel: "uren",
  opmerkingen: "",
};

function begrotingNaarFormData(b: FieJaarbegroting): BegrotingFormData {
  return {
    boekjaar: String(b.boekjaar),
    status: b.status,
    omzet_doel: b.omzet_doel != null ? String(b.omzet_doel) : "",
    doel_marge_pct: String(b.doel_marge_pct),
    ak_per_productief_uur: b.ak_per_productief_uur != null ? String(b.ak_per_productief_uur) : "",
    productieve_uren_doel: b.productieve_uren_doel != null ? String(b.productieve_uren_doel) : "",
    verdeelsleutel: b.verdeelsleutel,
    opmerkingen: b.opmerkingen ?? "",
  };
}

// ─── BegrotingDialoog ─────────────────────────────────────────────────────────

function BegrotingDialoog({
  open,
  onClose,
  bewerken,
}: {
  open: boolean;
  onClose: () => void;
  bewerken?: FieJaarbegroting;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<BegrotingFormData>(LEEG_BEGROTING);

  useEffect(() => {
    if (open) setForm(bewerken ? begrotingNaarFormData(bewerken) : LEEG_BEGROTING);
  }, [open, bewerken]);

  const upd = (k: keyof BegrotingFormData, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const aanmaken = useCreateFieBegroting({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListFieBegrotingenQueryKey() });
        toast({ title: "Begroting aangemaakt" });
        onClose();
      },
      onError: () => toast({ title: "Opslaan mislukt", variant: "destructive" }),
    },
  });

  const bijwerken = useUpdateFieBegroting({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListFieBegrotingenQueryKey() });
        if (bewerken) qc.invalidateQueries({ queryKey: getGetFieBegrotingQueryKey(bewerken.id) });
        toast({ title: "Begroting bijgewerkt" });
        onClose();
      },
      onError: () => toast({ title: "Opslaan mislukt", variant: "destructive" }),
    },
  });

  function opslaan() {
    const payload = {
      status: form.status,
      omzet_doel: form.omzet_doel ? parseFloat(form.omzet_doel) : null,
      doel_marge_pct: parseFloat(form.doel_marge_pct) || 15,
      ak_per_productief_uur: form.ak_per_productief_uur ? parseFloat(form.ak_per_productief_uur) : null,
      productieve_uren_doel: form.productieve_uren_doel ? parseInt(form.productieve_uren_doel, 10) : null,
      verdeelsleutel: form.verdeelsleutel,
      opmerkingen: form.opmerkingen || null,
    };
    if (bewerken) {
      bijwerken.mutate({ id: bewerken.id, data: payload });
    } else {
      aanmaken.mutate({ data: { boekjaar: parseInt(form.boekjaar, 10), ...payload } });
    }
  }

  const bezig = aanmaken.isPending || bijwerken.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{bewerken ? "Begroting bewerken" : "Nieuwe jaarbegroting"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Boekjaar</Label>
              <Input
                type="number"
                value={form.boekjaar}
                onChange={(e) => upd("boekjaar", e.target.value)}
                disabled={!!bewerken}
                min={2020}
                max={2040}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => upd("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Omzetdoel (EUR)</Label>
              <Input
                type="number"
                placeholder="bijv. 1500000"
                value={form.omzet_doel}
                onChange={(e) => upd("omzet_doel", e.target.value)}
              />
            </div>
            <div>
              <Label>Doelmarge (%)</Label>
              <Input
                type="number"
                step="0.5"
                value={form.doel_marge_pct}
                onChange={(e) => upd("doel_marge_pct", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>AK per productief uur (EUR)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="bijv. 18.50"
                value={form.ak_per_productief_uur}
                onChange={(e) => upd("ak_per_productief_uur", e.target.value)}
              />
            </div>
            <div>
              <Label>Productieve uren (doel)</Label>
              <Input
                type="number"
                placeholder="bijv. 5000"
                value={form.productieve_uren_doel}
                onChange={(e) => upd("productieve_uren_doel", e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Opmerkingen</Label>
            <Textarea
              rows={2}
              value={form.opmerkingen}
              onChange={(e) => upd("opmerkingen", e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={bezig}>Annuleren</Button>
          <Button onClick={opslaan} disabled={bezig}>
            {bezig ? "Opslaan..." : "Opslaan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── AkPostDialoog ────────────────────────────────────────────────────────────

type AkPostForm = {
  categorie: string;
  omschrijving: string;
  bedrag_jaarbasis: string;
  actief: boolean;
};

const LEEG_AK_POST: AkPostForm = {
  categorie: "overig",
  omschrijving: "",
  bedrag_jaarbasis: "",
  actief: true,
};

function AkPostDialoog({
  open,
  onClose,
  begrotingId,
  bewerken,
}: {
  open: boolean;
  onClose: () => void;
  begrotingId: number;
  bewerken?: FieAkPost;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<AkPostForm>(LEEG_AK_POST);

  useEffect(() => {
    if (open) {
      setForm(bewerken ? {
        categorie: bewerken.categorie,
        omschrijving: bewerken.omschrijving,
        bedrag_jaarbasis: String(bewerken.bedrag_jaarbasis),
        actief: bewerken.actief,
      } : LEEG_AK_POST);
    }
  }, [open, bewerken]);

  const upd = (k: keyof AkPostForm, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const aanmaken = useCreateFieAkPost({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetFieBegrotingQueryKey(begrotingId) });
        toast({ title: "AK-post toegevoegd" });
        onClose();
      },
      onError: () => toast({ title: "Opslaan mislukt", variant: "destructive" }),
    },
  });

  const bijwerken = useUpdateFieAkPost({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetFieBegrotingQueryKey(begrotingId) });
        toast({ title: "AK-post bijgewerkt" });
        onClose();
      },
      onError: () => toast({ title: "Opslaan mislukt", variant: "destructive" }),
    },
  });

  function opslaan() {
    const payload = {
      categorie: form.categorie,
      omschrijving: form.omschrijving,
      bedrag_jaarbasis: parseFloat(form.bedrag_jaarbasis) || 0,
      actief: form.actief,
    };
    if (bewerken) {
      bijwerken.mutate({ id: bewerken.id, data: payload });
    } else {
      aanmaken.mutate({ id: begrotingId, data: payload });
    }
  }

  const bezig = aanmaken.isPending || bijwerken.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{bewerken ? "AK-post bewerken" : "Nieuwe AK-post"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Categorie</Label>
            <Select value={form.categorie} onValueChange={(v) => upd("categorie", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AK_CATEGORIE_OPTIES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Omschrijving</Label>
            <Input
              value={form.omschrijving}
              onChange={(e) => upd("omschrijving", e.target.value)}
              placeholder="bijv. Huurkosten kantoor"
            />
          </div>
          <div>
            <Label>Bedrag per jaar (EUR)</Label>
            <Input
              type="number"
              step="100"
              value={form.bedrag_jaarbasis}
              onChange={(e) => upd("bedrag_jaarbasis", e.target.value)}
              placeholder="bijv. 24000"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={bezig}>Annuleren</Button>
          <Button onClick={opslaan} disabled={bezig || !form.omschrijving}>
            {bezig ? "Opslaan..." : "Opslaan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Capaciteit-response type (spiegelt berekenCapaciteit uit de service) ──────

interface CapaciteitResultaat {
  aantalMedewerkers: number;
  geschatteProductieveUren: number;
  effectieveProductieveUren: number;
  bron: "snapshot" | "hrm" | "geen";
}

// ─── CapaciteitSectie ─────────────────────────────────────────────────────────
// Toont HRM-afgeleid capaciteitsoverzicht via de backend-endpoint.

function CapaciteitSectie({
  boekjaar,
  productieveUrenDoel,
  totaalAk,
  akPerUurBerekend,
}: {
  boekjaar: number;
  productieveUrenDoel: number | null | undefined;
  totaalAk: number;
  akPerUurBerekend: number | null;
}) {
  const { data: cap, isLoading } = useQuery<CapaciteitResultaat>({
    queryKey: ["fie", "capaciteit", boekjaar, "hrm"],
    queryFn: async () => {
      const res = await fetch(`/api/fie/capaciteit/${boekjaar}/hrm`, { credentials: "include" });
      if (!res.ok) throw new Error("capaciteit ophalen mislukt");
      return res.json() as Promise<CapaciteitResultaat>;
    },
  });

  const ingesteldUren = productieveUrenDoel ?? null;
  const hrmUren = cap?.effectieveProductieveUren ?? null;
  const gebruikteUren = ingesteldUren ?? hrmUren;

  const bronLabel =
    cap?.bron === "snapshot" ? "eigen capaciteitsplanning" :
    cap?.bron === "hrm"      ? "HRM-register (contracturen)" :
                               "geen data beschikbaar";

  const akNormLabel =
    ingesteldUren != null ? "op basis van begroting" :
    hrmUren != null       ? "afgeleid uit HRM" :
                            "voeg AK-posten en medewerkers toe";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-sm">Capaciteit</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-md border p-3">
              <p className="text-[10px] text-muted-foreground">Actieve medewerkers</p>
              <p className="text-lg font-semibold mt-0.5">{cap?.aantalMedewerkers ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground">in HRM</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-[10px] text-muted-foreground">Productieve uren (HRM)</p>
              <p className="text-lg font-semibold mt-0.5">
                {hrmUren != null
                  ? new Intl.NumberFormat("nl-NL").format(hrmUren)
                  : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground">{bronLabel}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-[10px] text-muted-foreground">Ingesteld in begroting</p>
              <p className="text-lg font-semibold mt-0.5">
                {ingesteldUren != null
                  ? new Intl.NumberFormat("nl-NL").format(ingesteldUren)
                  : <span className="text-muted-foreground text-sm">niet ingesteld</span>}
              </p>
              <p className="text-[10px] text-muted-foreground">productieve uren/jaar</p>
            </div>
            <div className="rounded-md border p-3 bg-primary/5 border-primary/20">
              <p className="text-[10px] text-muted-foreground">AK-norm per uur</p>
              <p className="text-lg font-semibold mt-0.5 text-primary">
                {akPerUurBerekend != null
                  ? new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(akPerUurBerekend)
                  : gebruikteUren && gebruikteUren > 0 && totaalAk > 0
                    ? new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(
                        Math.round((totaalAk / gebruikteUren) * 100) / 100
                      )
                    : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground">{akNormLabel}</p>
            </div>
          </div>
        )}

        <div className="rounded-md border border-dashed p-3 bg-muted/20">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Productieve uren worden berekend uit de contracturen van actieve medewerkers (HRM).
              Als er een capaciteitsplanning beschikbaar is, heeft die voorrang.
              Stel de uren handmatig in via de begrotingsinstellingen om de HRM-afleiding te overschrijven.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── PrognoseTab ──────────────────────────────────────────────────────────────

const OBSERVATIE_KLEUR: Record<string, string> = {
  info:         "border-blue-200 bg-blue-50 text-blue-800",
  waarschuwing: "border-amber-200 bg-amber-50 text-amber-800",
  kritiek:      "border-red-200 bg-red-50 text-red-800",
};

const KW_LABEL: Record<number, string> = { 1: "Q1 Jan–Mrt", 2: "Q2 Apr–Jun", 3: "Q3 Jul–Sep", 4: "Q4 Okt–Dec" };

function KwartaalBalk({ kw, max, begroting }: { kw: FieKwartaalPrognose; max: number; begroting?: number }) {
  const pctB = max > 0 ? Math.min(100, (kw.bevestigd / max) * 100) : 0;
  const pctP = max > 0 ? Math.min(100, (kw.pipeline_gewogen / max) * 100) : 0;
  const pctBegroting = begroting != null && max > 0 ? Math.min(100, (begroting / max) * 100) : null;
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-medium text-muted-foreground">{KW_LABEL[kw.kwartaal]}</p>
      <div className="relative h-4 rounded bg-muted overflow-hidden flex">
        <div className="bg-green-500 h-full" style={{ width: `${pctB}%` }} title={`Bevestigd: ${fmt(kw.bevestigd)}`} />
        <div className="bg-amber-400 h-full" style={{ width: `${pctP}%` }} title={`Pipeline: ${fmt(kw.pipeline_gewogen)}`} />
        {pctBegroting != null && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-primary/70"
            style={{ left: `${pctBegroting}%` }}
            title={`Begroting: ${fmt(begroting!)}`}
          />
        )}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{fmt(kw.prognose)}</span>
        {begroting != null && <span className="text-primary/70">{fmt(begroting)}</span>}
      </div>
    </div>
  );
}

function PrognoseTab({ boekjaar }: { boekjaar: number }) {
  const { data: p, isLoading } = useGetFiePrognose(boekjaar) as { data: FieJaarprognose | undefined; isLoading: boolean };
  const { data: obsResp } = useGetFieObservaties(boekjaar) as { data: { boekjaar: number; observaties: FieJaarprognose["observaties"] } | undefined };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-2 w-full" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
            {[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!p) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Prognose kon niet worden geladen.</p>
        </CardContent>
      </Card>
    );
  }

  const coverageNum = p.coverage_pct ?? 0;
  const coverageBar = Math.min(100, Math.max(0, coverageNum));
  const coverageKleur =
    coverageNum < 80  ? "bg-red-500"
    : coverageNum < 95 ? "bg-amber-500"
    : coverageNum > 110 ? "bg-blue-500"
    : "bg-green-500";

  const kwVerdeling: FieKwartaalPrognose[] = p.kwartaal_verdeling ?? [];
  const begrotingPerKw = p.begroting_per_kwartaal ?? [];
  const kwMax = Math.max(
    ...kwVerdeling.map(k => k.prognose),
    ...begrotingPerKw.map(b => b.begroting),
    1,
  );

  const persistenteObservaties = obsResp?.observaties ?? [];

  return (
    <div className="space-y-4">
      {/* Signalen (live, uit prognoseberekening) */}
      {p.observaties.length > 0 && (
        <div className="space-y-2">
          {p.observaties.map((obs, i) => (
            <div
              key={i}
              className={cn(
                "flex items-start gap-2 rounded-md border px-3 py-2.5 text-xs",
                OBSERVATIE_KLEUR[obs.ernst] ?? "border-border bg-muted/20 text-muted-foreground"
              )}
            >
              {obs.ernst === "kritiek" || obs.ernst === "waarschuwing"
                ? <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                : <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
              <p>{obs.omschrijving}</p>
            </div>
          ))}
        </div>
      )}

      {/* Coverage balk (prognose vs. omzetdoel) */}
      {p.heeft_begroting && p.omzet_doel != null && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between items-center">
              <p className="text-xs font-medium text-muted-foreground">Prognose vs. omzetdoel</p>
              <p className="text-xs font-semibold">
                {p.coverage_pct != null ? `${p.coverage_pct.toFixed(1)}%` : "—"}
              </p>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", coverageKleur)}
                style={{ width: `${coverageBar}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0</span>
              <span className="font-medium">Doel: {fmt(p.omzet_doel)}</span>
              <span>
                {p.gap_tot_doel != null
                  ? p.gap_tot_doel < 0
                    ? `+${fmt(Math.abs(p.gap_tot_doel))} voorsprong`
                    : `${fmt(p.gap_tot_doel)} tekort`
                  : ""}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI-tiles — 8 stuks in 2×4 grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-md border p-3">
          <p className="text-[10px] text-muted-foreground">Bevestigd (100%)</p>
          <p className="text-base font-semibold mt-0.5">{fmt(p.bevestigde_omzet)}</p>
          <p className="text-[10px] text-muted-foreground">
            {p.aantal_bevestigde_offertes} offerte{p.aantal_bevestigde_offertes !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-[10px] text-muted-foreground">Pipeline (gewogen)</p>
          <p className="text-base font-semibold mt-0.5">{fmt(p.gewogen_pipeline)}</p>
          <p className="text-[10px] text-muted-foreground">
            {p.aantal_pipeline_offertes} offerte{p.aantal_pipeline_offertes !== 1 ? "s" : ""}
            {p.pijplijn_bruto > 0 ? ` · bruto ${fmt(p.pijplijn_bruto)}` : ""}
          </p>
        </div>
        <div className="rounded-md border p-3 bg-primary/5 border-primary/20">
          <p className="text-[10px] text-muted-foreground">Prognose totaal</p>
          <p className="text-base font-semibold mt-0.5 text-primary">{fmt(p.prognose_omzet)}</p>
          <p className="text-[10px] text-muted-foreground">bevestigd + gewogen pipeline</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-[10px] text-muted-foreground">OHW restwaarde</p>
          <p className="text-base font-semibold mt-0.5">{fmt(p.ohw_restwaarde)}</p>
          <p className="text-[10px] text-muted-foreground">
            {p.aantal_ohw_opdrachten} opdracht{p.aantal_ohw_opdrachten !== 1 ? "en" : ""}
          </p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-[10px] text-muted-foreground">AK-dekkingsgraad</p>
          <p className="text-base font-semibold mt-0.5">
            {p.ak_dekkingsgraad_pct != null ? `${p.ak_dekkingsgraad_pct.toFixed(1)}%` : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {p.totaal_ak > 0 ? `AK: ${fmt(p.totaal_ak)}` : "Geen AK-posten"}
          </p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-[10px] text-muted-foreground">Break-even omzet</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <p className="text-base font-semibold">
              {p.break_even_omzet != null ? fmt(p.break_even_omzet) : "—"}
            </p>
            {p.break_even_bereikt === true && (
              <span className="text-[9px] font-medium text-green-700 bg-green-100 rounded px-1 py-0.5 leading-none">bereikt</span>
            )}
            {p.break_even_bereikt === false && (
              <span className="text-[9px] font-medium text-red-700 bg-red-100 rounded px-1 py-0.5 leading-none">niet bereikt</span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {p.doel_marge_pct != null ? `Bij doelmarge ${p.doel_marge_pct.toFixed(1)}%` : "Geen doelmarge"}
          </p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-[10px] text-muted-foreground">Prognose brutowinst</p>
          <p className={cn("text-base font-semibold mt-0.5", p.prognose_brutowinst != null && p.prognose_brutowinst >= 0 ? "text-green-700" : "text-red-600")}>
            {p.prognose_brutowinst != null ? fmt(p.prognose_brutowinst) : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {p.doel_marge_pct != null ? `Omzet × ${p.doel_marge_pct.toFixed(1)}% doelmarge` : "Doelmarge vereist"}
          </p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-[10px] text-muted-foreground">Prognose nettoresultaat</p>
          <p className={cn("text-base font-semibold mt-0.5", p.prognose_nettoresultaat == null ? "" : p.prognose_nettoresultaat >= 0 ? "text-green-700" : "text-red-600")}>
            {p.prognose_nettoresultaat != null ? fmt(p.prognose_nettoresultaat) : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground">Brutowinst − totale AK</p>
        </div>
      </div>

      {/* Kwartaalverdeling */}
      {kwVerdeling.length === 4 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-medium">Kwartaalverdeling prognose {boekjaar}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {kwVerdeling.map(kw => {
                const bEntry = begrotingPerKw.find(b => b.kwartaal === kw.kwartaal);
                return (
                  <KwartaalBalk key={kw.kwartaal} kw={kw} max={kwMax} begroting={bEntry?.begroting} />
                );
              })}
            </div>
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground pt-1">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-2 rounded-sm bg-green-500" />
                Bevestigd
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-2 rounded-sm bg-amber-400" />
                Pipeline (gewogen)
              </span>
              {begrotingPerKw.length > 0 && (
                <span className="flex items-center gap-1">
                  <span className="inline-block w-0.5 h-3 bg-primary/70" />
                  Begroting
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Historische observaties (gepersisteerd) */}
      {persistenteObservaties.length > 0 && p.observaties.length === 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground px-1">Laatste signalen (vorige berekening)</p>
          {persistenteObservaties.map((obs, i) => (
            <div
              key={i}
              className={cn(
                "flex items-start gap-2 rounded-md border px-3 py-2.5 text-xs",
                OBSERVATIE_KLEUR[obs.ernst] ?? "border-border bg-muted/20 text-muted-foreground"
              )}
            >
              {obs.ernst === "kritiek" || obs.ernst === "waarschuwing"
                ? <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                : <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
              <p>{obs.omschrijving}</p>
            </div>
          ))}
        </div>
      )}

      {/* Toelichting */}
      <div className="rounded-md border border-dashed p-3 bg-muted/20">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Hoe wordt de prognose berekend?</p>
            <p>
              Bevestigd: offertes <em>akkoord</em>/<em>ondertekend</em> tellen voor 100%.
              Pipeline: <em>concept</em> = 20%, <em>verzonden</em> = 40%, <em>bekeken</em> = 60%.
              OHW is de restwaarde van actieve opdrachten met een voortgangsindicatie.
              AK-dekkingsgraad toont of de prognose de totale AK-last dekt.
              Break-even is de minimale omzet om AK te dekken bij de ingestelde doelmarge.
            </p>
            {p.prognose_inclusief_ohw !== p.prognose_omzet && (
              <p>Prognose inclusief OHW: <strong>{fmt(p.prognose_inclusief_ohw)}</strong></p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── BegrotingDetail ─────────────────────────────────────────────────────────

function BegrotingDetail({ begrotingId, onTerug }: { begrotingId: number; onTerug: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [actieveTab, setActieveTab] = useState("overzicht");
  const [akDialoog, setAkDialoog] = useState(false);
  const [bewerkenPost, setBewerkenPost] = useState<FieAkPost | undefined>();
  const [verwijderenPost, setVerwijderenPost] = useState<FieAkPost | undefined>();
  const { heeftNiveau } = useBevoegdheid();
  const heeftFinancieelSchrijven = heeftNiveau("financieel", 2);

  const { data: detail, isLoading } = useGetFieBegroting(begrotingId);

  const verwijderMutatie = useDeleteFieAkPost({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetFieBegrotingQueryKey(begrotingId) });
        toast({ title: "AK-post verwijderd" });
        setVerwijderenPost(undefined);
      },
      onError: () => toast({ title: "Verwijderen mislukt", variant: "destructive" }),
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  if (!detail) return null;

  const akPosten = detail.ak_posten ?? [];
  const actievePosten = akPosten.filter((p) => p.actief);
  const totaalAk = detail.totaal_ak ?? 0;
  const akPerUur = detail.ak_per_uur_berekend ?? null;

  return (
    <div className="space-y-4">
      {/* Koptekst + status */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onTerug}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Alle begrotingen
        </Button>
        <h2 className="text-base font-semibold">
          Begroting {detail.boekjaar}
        </h2>
        <Badge variant="outline" className={cn("flex items-center gap-1 text-xs", STATUS_KLEUR[detail.status])}>
          {STATUS_ICOON[detail.status]}
          {STATUS_OPTIES.find((o) => o.value === detail.status)?.label}
        </Badge>
      </div>

      {/* KPI-kaarten (altijd zichtbaar) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Omzetdoel</p>
            <p className="text-lg font-semibold mt-0.5">{fmt(detail.omzet_doel)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Doelmarge</p>
            <p className="text-lg font-semibold mt-0.5 text-green-700">{fmtPct(detail.doel_marge_pct)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Totale AK</p>
            <p className="text-lg font-semibold mt-0.5">{fmt(totaalAk)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">AK / productief uur</p>
            <p className="text-lg font-semibold mt-0.5 text-primary">
              {akPerUur != null ? fmtUur(akPerUur) : detail.ak_per_productief_uur != null ? fmtUur(detail.ak_per_productief_uur) : "—"}
            </p>
            {akPerUur != null && (
              <p className="text-[10px] text-muted-foreground">berekend uit AK-posten</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Overzicht / AK-posten / Capaciteit / Doelmarge / Prognose / Leereffecten */}
      <Tabs value={actieveTab} onValueChange={setActieveTab}>
        <TabsList className="grid w-full grid-cols-6 max-w-2xl">
          <TabsTrigger value="overzicht">Overzicht</TabsTrigger>
          <TabsTrigger value="ak-posten">AK-posten</TabsTrigger>
          <TabsTrigger value="capaciteit">Capaciteit</TabsTrigger>
          <TabsTrigger value="doelmarge">Doelmarge</TabsTrigger>
          <TabsTrigger value="prognose">Prognose</TabsTrigger>
          <TabsTrigger value="leereffecten">Leereffecten</TabsTrigger>
        </TabsList>

        {/* Tab: Overzicht (doelmarge-toelichting + verdeelsleutel) */}
        <TabsContent value="overzicht" className="mt-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Verdeelsleutel AK</p>
                <p className="text-sm">
                  {detail.verdeelsleutel === "uren"
                    ? "Op basis van productieve uren (AK gedeeld door totale uren)"
                    : detail.verdeelsleutel === "omzet"
                    ? "Op basis van omzet (AK als percentage van projectomzet)"
                    : detail.verdeelsleutel}
                </p>
              </div>
              <Separator />
              <div className="rounded-md border border-dashed p-3 bg-muted/20">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="text-xs text-muted-foreground space-y-1.5">
                    <p className="font-medium text-foreground">Doelmarge-rekenexercitie</p>
                    <p>
                      Doelmarge is ingesteld op <strong>{fmtPct(detail.doel_marge_pct)}</strong>.
                      Dit betekent dat van elke euro omzet minimaal {fmtPct(detail.doel_marge_pct)} overblijft na directe kosten en AK.
                    </p>
                    {detail.productieve_uren_doel != null && totaalAk > 0 && (
                      <p>
                        Met {new Intl.NumberFormat("nl-NL").format(detail.productieve_uren_doel)} productieve uren en {fmt(totaalAk)} totale AK
                        {" "}is de AK-norm <strong>{akPerUur != null ? fmtUur(akPerUur) : "—"}/uur</strong>.
                        Bij een doelmarge van {fmtPct(detail.doel_marge_pct)} moet de verkoopprijs de directe kosten + AK + {fmtPct(detail.doel_marge_pct)} marge dekken.
                      </p>
                    )}
                    <p className="text-[10px]">
                      Stel de productieve uren in via de begrotingsinstellingen (veld "Productieve uren/jaar") om de AK-norm automatisch te berekenen.
                    </p>
                  </div>
                </div>
              </div>
              {detail.opmerkingen && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Opmerkingen</p>
                    <p className="text-sm whitespace-pre-wrap">{detail.opmerkingen}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: AK-posten */}
        <TabsContent value="ak-posten" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Indirecte kostenposten (AK-posten)</CardTitle>
                {heeftFinancieelSchrijven && (
                  <Button size="sm" onClick={() => { setBewerkenPost(undefined); setAkDialoog(true); }}>
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Post toevoegen
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {akPosten.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  Nog geen AK-posten. Voeg huisvestingskosten, ICT, voertuigen etc. toe.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Omschrijving</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Categorie</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">Bedrag/jaar</th>
                      {heeftFinancieelSchrijven && <th className="w-20 px-4 py-2"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {akPosten.map((p) => (
                      <tr key={p.id} className={cn("border-b border-border/30 hover:bg-muted/30", !p.actief && "opacity-40")}>
                        <td className="px-4 py-2.5">{p.omschrijving}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className="text-[10px]">
                            {AK_CATEGORIE_OPTIES.find((o) => o.value === p.categorie)?.label ?? p.categorie}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {fmt(p.bedrag_jaarbasis)}
                        </td>
                        {heeftFinancieelSchrijven && (
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1 justify-end">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => { setBewerkenPost(p); setAkDialoog(true); }}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => setVerwijderenPost(p)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/20">
                      <td className="px-4 py-2.5 font-semibold text-sm" colSpan={2}>
                        Totaal AK ({actievePosten.length} actieve posten)
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold font-mono tabular-nums">
                        {fmt(totaalAk)}
                      </td>
                      {heeftFinancieelSchrijven && <td></td>}
                    </tr>
                  </tfoot>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Capaciteit (HRM-afgeleid via backend) */}
        <TabsContent value="capaciteit" className="mt-4">
          <CapaciteitSectie
            boekjaar={detail.boekjaar}
            productieveUrenDoel={detail.productieve_uren_doel}
            totaalAk={totaalAk}
            akPerUurBerekend={akPerUur}
          />
        </TabsContent>

        {/* Tab: Doelmarge (rekenexercitie op basis van begroting + AK-posten) */}
        <TabsContent value="doelmarge" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm">Doelmarge-rekenexercitie</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* KPI-rij */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="rounded-md border p-3 bg-primary/5 border-primary/20">
                  <p className="text-[10px] text-muted-foreground">Doelmarge</p>
                  <p className="text-lg font-semibold mt-0.5 text-primary">{fmtPct(detail.doel_marge_pct)}</p>
                  <p className="text-[10px] text-muted-foreground">van de aanneemsom</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-[10px] text-muted-foreground">Omzetdoel</p>
                  <p className="text-lg font-semibold mt-0.5">{fmt(detail.omzet_doel)}</p>
                  <p className="text-[10px] text-muted-foreground">per jaar</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-[10px] text-muted-foreground">AK / productief uur</p>
                  <p className="text-lg font-semibold mt-0.5">
                    {akPerUur != null
                      ? fmtUur(akPerUur)
                      : detail.ak_per_productief_uur != null
                        ? fmtUur(detail.ak_per_productief_uur)
                        : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {akPerUur != null ? "berekend uit AK-posten" : detail.ak_per_productief_uur != null ? "handmatig ingesteld" : "nog niet bepaald"}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Rekenexercitie uitleg */}
              <div className="space-y-2 text-sm">
                <p className="font-medium text-foreground">Hoe werkt het?</p>
                <div className="space-y-1.5 text-muted-foreground text-xs">
                  <p>
                    De doelmarge geeft aan welk deel van de projectomzet netto overblijft na aftrek van alle directe kosten en AK (algemene kosten).
                  </p>
                  {(detail.omzet_doel ?? 0) > 0 && (() => {
                    const omzetDoel = detail.omzet_doel!;
                    return (
                      <div className="rounded-md bg-muted/30 p-3 space-y-1 font-mono text-[11px]">
                        <p>Omzetdoel: <span className="font-semibold text-foreground">{fmt(omzetDoel)}</span></p>
                        <p>Totale AK: <span className="font-semibold text-foreground">{fmt(totaalAk)}</span></p>
                        <p>
                          AK als % van omzet:{" "}
                          <span className="font-semibold text-foreground">
                            {fmtPct((totaalAk / omzetDoel) * 100)}
                          </span>
                        </p>
                        <p className="border-t border-border/40 pt-1">
                          Maximale directe kosten bij doelmarge {fmtPct(detail.doel_marge_pct)}:{" "}
                          <span className="font-semibold text-foreground">
                            {fmt(omzetDoel * (1 - detail.doel_marge_pct / 100) - totaalAk)}
                          </span>
                        </p>
                      </div>
                    );
                  })()}
                  <p>
                    Pas de doelmarge aan via de begrotingsinstellingen. De AK-norm per uur wordt automatisch herberekend zodra AK-posten en capaciteit bekend zijn.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Prognose (continue jaarbedrijfsprognose — FIE Fase 3) */}
        <TabsContent value="prognose" className="mt-4">
          <PrognoseTab boekjaar={detail.boekjaar} />
        </TabsContent>

        <TabsContent value="leereffecten" className="mt-4">
          <LeereffectenBeheerTab />
        </TabsContent>
      </Tabs>

      {/* Dialogen */}
      <AkPostDialoog
        open={akDialoog}
        onClose={() => { setAkDialoog(false); setBewerkenPost(undefined); }}
        begrotingId={begrotingId}
        bewerken={bewerkenPost}
      />
      <AlertDialog open={!!verwijderenPost} onOpenChange={(o) => { if (!o) setVerwijderenPost(undefined); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>AK-post verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              "{verwijderenPost?.omschrijving}" wordt permanent verwijderd.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => verwijderenPost && verwijderMutatie.mutate({ id: verwijderenPost.id })}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Leereffecten (Fase 5 nacalculatie-terugkoppeling) ───────────────────────

function LeermomentRij({ lm, onSaved }: { lm: FieLeermoment; onSaved: () => void }) {
  const [bewerkModus, setBewerkModus] = useState(false);
  const [factorInput, setFactorInput] = useState(String(lm.correctie_factor));
  const [opmerkingenInput, setOpmerkingenInput] = useState(lm.opmerkingen ?? "");

  const patch = useUpdateFieLeermoment();
  const verwijder = useDeleteFieLeermoment();

  function opslaan() {
    const factor = Number(factorInput);
    if (!isFinite(factor) || factor <= 0) return;
    patch.mutate(
      { id: lm.id, data: { correctie_factor: factor, opmerkingen: opmerkingenInput || null } },
      { onSuccess: () => { setBewerkModus(false); onSaved(); } },
    );
  }

  function afwijkingKleur(v: number | null | undefined) {
    if (v == null) return "text-muted-foreground";
    if (Math.abs(v) > 20) return v > 0 ? "text-red-600 font-semibold" : "text-green-700 font-semibold";
    if (Math.abs(v) > 10) return v > 0 ? "text-amber-600" : "text-green-600";
    return "text-foreground";
  }

  return (
    <tr className="border-b last:border-0 text-sm">
      <td className="py-2 pr-3 font-medium capitalize pl-4">{lm.werktype}</td>
      <td className={cn("py-2 pr-3 text-right tabular-nums", afwijkingKleur(lm.afwijking_pct_arbeid))}>
        {lm.afwijking_pct_arbeid != null ? `${lm.afwijking_pct_arbeid > 0 ? "+" : ""}${lm.afwijking_pct_arbeid.toFixed(1)}%` : "—"}
      </td>
      <td className={cn("py-2 pr-3 text-right tabular-nums", afwijkingKleur(lm.afwijking_pct_materiaal))}>
        {lm.afwijking_pct_materiaal != null ? `${lm.afwijking_pct_materiaal > 0 ? "+" : ""}${lm.afwijking_pct_materiaal.toFixed(1)}%` : "—"}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{lm.gebaseerd_op_n_projecten}</td>
      <td className="py-2 pr-3 text-right tabular-nums">
        {bewerkModus ? (
          <Input
            className="h-7 w-20 text-xs text-right"
            value={factorInput}
            onChange={e => setFactorInput(e.target.value)}
            type="number" step="0.01" min="0.01"
          />
        ) : (
          <span>{lm.correctie_factor.toFixed(2)}&times;</span>
        )}
      </td>
      <td className="py-2 pr-3 text-muted-foreground text-xs max-w-[160px] truncate">
        {bewerkModus ? (
          <Input
            className="h-7 text-xs"
            value={opmerkingenInput}
            onChange={e => setOpmerkingenInput(e.target.value)}
            placeholder="Toelichting..."
          />
        ) : (
          lm.opmerkingen ?? <span className="italic opacity-50">Geen toelichting</span>
        )}
      </td>
      <td className="py-2 pr-2 text-right">
        {bewerkModus ? (
          <span className="flex justify-end gap-1">
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={opslaan} disabled={patch.isPending}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setBewerkModus(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </span>
        ) : (
          <span className="flex justify-end gap-1">
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setBewerkModus(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon" variant="ghost"
              className="h-6 w-6 text-destructive hover:text-destructive"
              onClick={() => { if (confirm(`Leermoment "${lm.werktype}" verwijderen?`)) verwijder.mutate({ id: lm.id }, { onSuccess: onSaved }); }}
              disabled={verwijder.isPending}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </span>
        )}
      </td>
    </tr>
  );
}

function LeereffectenBeheerTab() {
  const { data: leermomenten, isLoading, refetch } = useListFieLeermomenten();
  const herbereken = useHerberekeenFieLeermomenten();
  const herberekeenVerouderd = useHerberekeenVerouderdeNacalculaties();
  const [verouderdResultaat, setVerouderdResultaat] = useState<number | null>(null);

  function startHerbereken() {
    herbereken.mutate(undefined, { onSuccess: () => { void refetch(); } });
  }

  function startHerberekeenVerouderd() {
    setVerouderdResultaat(null);
    herberekeenVerouderd.mutate(undefined, {
      onSuccess: (data) => {
        setVerouderdResultaat(data.herberekend);
        void refetch();
      },
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Leereffecten — nacalculatie-terugkoppeling</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gemiddelde afwijkingen per werktype over afgesloten projecten. Structurele afwijkingen (op basis van
            minimaal 2 projecten) worden meegewogen in nieuwe calculatieadviezen via de correctiefactor.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Button
            size="sm" variant="outline" className="gap-1.5"
            onClick={startHerbereken}
            disabled={herbereken.isPending}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", herbereken.isPending && "animate-spin")} />
            Herbereken
          </Button>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm" variant="outline" className="gap-1.5"
              onClick={startHerberekeenVerouderd}
              disabled={herberekeenVerouderd.isPending}
              title="Herbereken nacalculaties met werktype 'algemeen' waarbij het gebouw inmiddels spots heeft"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", herberekeenVerouderd.isPending && "animate-spin")} />
              Werktype bijwerken
            </Button>
          </div>
          {verouderdResultaat !== null && (
            <p className="text-xs text-muted-foreground">
              {verouderdResultaat === 0
                ? "Geen verouderde nacalculaties gevonden"
                : `${verouderdResultaat} nacalculatie${verouderdResultaat !== 1 ? "s" : ""} bijgewerkt`}
            </p>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : !leermomenten || leermomenten.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm text-muted-foreground mb-1">Nog geen leereffecten beschikbaar</p>
            <p className="text-xs text-muted-foreground">
              Leermomenten worden dagelijks berekend vanuit afgesloten projecten met een vastgestelde werkbegroting
              en minimaal 2 projecten met structurele afwijking. Klik op "Herbereken" om direct te berekenen.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b text-[11px] text-muted-foreground uppercase tracking-wide">
                  <th className="py-2 pr-3 text-left font-medium pl-4">Werktype</th>
                  <th className="py-2 pr-3 text-right font-medium">Afwijking arbeid</th>
                  <th className="py-2 pr-3 text-right font-medium">Afwijking materiaal</th>
                  <th className="py-2 pr-3 text-right font-medium">Projecten</th>
                  <th className="py-2 pr-3 text-right font-medium">Correctiefactor</th>
                  <th className="py-2 pr-3 font-medium">Toelichting</th>
                  <th className="py-2 pr-2 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {leermomenten.map(lm => (
                  <LeermomentRij key={lm.id} lm={lm} onSaved={() => void refetch()} />
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="rounded-md border border-dashed p-3 bg-muted/20">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Afwijking arbeid = (werkelijk − begroot) / begroot &times; 100. Positief = meer uren dan begroot.
            Een correctiefactor van 1.10 voegt automatisch 10% toe aan het arbeidsadvies bij een nieuwe calculatie.
            Leermomenten worden dagelijks bijgewerkt om 04:00 en vereisen minimaal 2 kwalificerende projecten per
            kostensoort.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Hoofdpagina ─────────────────────────────────────────────────────────────

export default function BedrijfskompasPage() {
  const [begrotingDialoog, setBegrotingDialoog] = useState(false);
  const [gekozenBegroting, setGekozenBegroting] = useState<number | null>(null);
  const [bewerkenBegroting, setBewerkenBegroting] = useState<FieJaarbegroting | undefined>();

  const { heeftNiveau } = useBevoegdheid();
  const heeftFinancieelSchrijven = heeftNiveau("financieel", 2);

  const { data: begrotingen = [], isLoading } = useListFieBegrotingen();

  const activeBegroting = begrotingen.find((b) => b.status === "actief");

  if (gekozenBegroting !== null) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <BegrotingDetail
          begrotingId={gekozenBegroting}
          onTerug={() => setGekozenBegroting(null)}
        />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Koptekst */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Bedrijfskompas
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Financial Intelligence Engine — jaarbegrotingen, AK-normen en margedoelen
          </p>
        </div>
        {heeftFinancieelSchrijven && (
          <Button onClick={() => { setBewerkenBegroting(undefined); setBegrotingDialoog(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Nieuwe begroting
          </Button>
        )}
      </div>

      {/* Actieve begroting banner */}
      {activeBegroting && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="p-4 flex items-center gap-4">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-green-800">
                Actieve begroting: boekjaar {activeBegroting.boekjaar}
              </p>
              <p className="text-xs text-green-700 mt-0.5">
                Doelmarge {fmtPct(activeBegroting.doel_marge_pct)}
                {activeBegroting.ak_per_productief_uur != null && (
                  <> &middot; AK {fmtUur(activeBegroting.ak_per_productief_uur)}/uur</>
                )}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-green-300 text-green-800 hover:bg-green-100"
              onClick={() => setGekozenBegroting(activeBegroting.id)}
            >
              Openen
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Begrotingenlijst */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Jaarbegrotingen</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : begrotingen.length === 0 ? (
            <div className="p-8 text-center">
              <Calculator className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">Nog geen jaarbegroting</p>
              <p className="text-xs text-muted-foreground mt-1">
                Maak een begroting aan met omzetdoel, AK-normen en doelmarge.
              </p>
              {heeftFinancieelSchrijven && (
                <Button className="mt-4" size="sm" onClick={() => setBegrotingDialoog(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Eerste begroting aanmaken
                </Button>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Boekjaar</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Status</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">Omzetdoel</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">Doelmarge</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">AK/uur</th>
                  <th className="w-28 px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {begrotingen.map((b) => (
                  <tr
                    key={b.id}
                    className="border-b border-border/30 hover:bg-muted/30 cursor-pointer"
                    onClick={() => setGekozenBegroting(b.id)}
                  >
                    <td className="px-4 py-3 font-semibold">{b.boekjaar}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={cn("flex items-center gap-1 text-xs w-fit", STATUS_KLEUR[b.status])}>
                        {STATUS_ICOON[b.status]}
                        {STATUS_OPTIES.find((o) => o.value === b.status)?.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{fmt(b.omzet_doel)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-green-700">{fmtPct(b.doel_marge_pct)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{b.ak_per_productief_uur != null ? fmtUur(b.ak_per_productief_uur) : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                        {heeftFinancieelSchrijven && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => { setBewerkenBegroting(b); setBegrotingDialoog(true); }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setGekozenBegroting(b.id)}
                        >
                          Openen
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Toelichting */}
      <Card className="border-dashed">
        <CardContent className="p-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">Hoe werkt het Bedrijfskompas?</p>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>1. Maak een jaarbegroting aan met omzetdoel en doelmarge.</p>
            <p>2. Voeg AK-posten toe (huur, ICT, voertuigen, personeel indirect).</p>
            <p>3. Het systeem berekent automatisch de AK-norm per productief uur.</p>
            <p>4. In elke calculatie verschijnt een live FIE-blok met margeadvies op basis van deze norm.</p>
          </div>
        </CardContent>
      </Card>

      {/* Begroting dialoog */}
      <BegrotingDialoog
        open={begrotingDialoog}
        onClose={() => { setBegrotingDialoog(false); setBewerkenBegroting(undefined); }}
        bewerken={bewerkenBegroting}
      />
    </div>
  );
}
