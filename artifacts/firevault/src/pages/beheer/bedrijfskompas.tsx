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
  getListFieBegrotingenQueryKey,
  getGetFieBegrotingQueryKey,
  type FieJaarbegroting,
  type FieAkPost,
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

      {/* Tabs: Overzicht / AK-posten / Capaciteit / Doelmarge */}
      <Tabs value={actieveTab} onValueChange={setActieveTab}>
        <TabsList className="grid w-full grid-cols-4 max-w-lg">
          <TabsTrigger value="overzicht">Overzicht</TabsTrigger>
          <TabsTrigger value="ak-posten">AK-posten</TabsTrigger>
          <TabsTrigger value="capaciteit">Capaciteit</TabsTrigger>
          <TabsTrigger value="doelmarge">Doelmarge</TabsTrigger>
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
