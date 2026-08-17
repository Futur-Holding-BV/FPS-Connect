import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldAlert,
  Download,
  UserX,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Network,
  Plus,
  Pencil,
  Trash2,
  Check,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

type AvgVerzoek = {
  id: number;
  gebruiker_id: number;
  gebruiker_naam: string | null;
  type: string;
  status: string;
  toelichting: string | null;
  beheerder_opmerking: string | null;
  afgerond_op: string | null;
  geanonimiseerd_op: string | null;
  aangemaakt_op: string;
  bijgewerkt_op: string;
};

type InactiefAccount = {
  id: number;
  naam: string;
  email: string;
  rol: string;
  actief: boolean;
  aangemaakt_op: string;
  laatste_online: string | null;
};

type Stats = {
  open_verzoeken: number;
  in_behandeling: number;
  inactieve_accounts: number;
};

type Verwerker = {
  id: number;
  naam: string;
  land: string | null;
  doel: string | null;
  categorie_persoonsgegevens: string | null;
  grondslag: string | null;
  vwo_aanwezig: boolean;
  vwo_datum: string | null;
  contactpersoon: string | null;
  notities: string | null;
  aangemaakt_op: string;
  bijgewerkt_op: string | null;
};

type VerwerkerInput = {
  naam: string;
  land: string;
  doel: string;
  categorie_persoonsgegevens: string;
  grondslag: string;
  vwo_aanwezig: boolean;
  vwo_datum: string;
  contactpersoon: string;
  notities: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    open: "Open",
    in_behandeling: "In behandeling",
    afgerond: "Afgerond",
    afgewezen: "Afgewezen",
  };
  return map[s] ?? s;
}

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "open") return "destructive";
  if (s === "in_behandeling") return "default";
  if (s === "afgerond") return "secondary";
  return "outline";
}

function typeLabel(t: string): string {
  const map: Record<string, string> = {
    inzage: "Inzageverzoek",
    verwijdering: "Verwijderverzoek",
    correctie: "Correctieverzoek",
    beperking: "Beperkingsverzoek",
    bezwaar: "Bezwaarverzoek",
  };
  return map[t] ?? "Inzageverzoek";
}

function formatDatum(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useAvgStats() {
  return useQuery<Stats>({
    queryKey: ["avg", "stats"],
    queryFn: async () => {
      const r = await fetch("/api/avg/stats", { credentials: "include" });
      if (!r.ok) throw new Error("Fout bij laden statistieken");
      return r.json();
    },
  });
}

function useAvgVerzoeken(statusFilter: string) {
  return useQuery<{ verzoeken: AvgVerzoek[]; totaal: number }>({
    queryKey: ["avg", "verzoeken", statusFilter],
    queryFn: async () => {
      const r = await fetch(`/api/avg/inzageverzoeken?status=${statusFilter}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Fout bij laden verzoeken");
      return r.json();
    },
  });
}

function useInactieveAccounts(dagen: number) {
  return useQuery<{ accounts: InactiefAccount[]; grens: string; inactief_dagen: number }>({
    queryKey: ["avg", "inactief", dagen],
    queryFn: async () => {
      const r = await fetch(`/api/avg/inactieve-accounts?dagen=${dagen}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Fout bij laden inactieve accounts");
      return r.json();
    },
  });
}

type OpschoonStatus = {
  bewaardagen: number;
  wachtend_op_anonimisering: number;
  laatste_run: {
    uitgevoerd_op: string;
    accounts_geanonimiseerd: number;
    activiteiten_verwijderd: number;
  } | null;
};

function useAvgOpschoonStatus() {
  return useQuery<OpschoonStatus>({
    queryKey: ["avg", "opschoon-status"],
    queryFn: async () => {
      const r = await fetch("/api/avg/opschoon-status", { credentials: "include" });
      if (!r.ok) throw new Error("Fout bij laden opschoonstatus");
      return r.json();
    },
  });
}

function useAvgVerwerkers() {
  return useQuery<Verwerker[]>({
    queryKey: ["avg", "verwerkers"],
    queryFn: async () => {
      const r = await fetch("/api/avg/verwerkers", { credentials: "include" });
      if (!r.ok) throw new Error("Fout bij laden verwerkersregister");
      return r.json();
    },
  });
}

// ── Sub-component: VerwerkerDialoog ──────────────────────────────────────────

const LEGE_VERWERKER: VerwerkerInput = {
  naam: "",
  land: "",
  doel: "",
  categorie_persoonsgegevens: "",
  grondslag: "",
  vwo_aanwezig: false,
  vwo_datum: "",
  contactpersoon: "",
  notities: "",
};

function VerwerkerDialoog({
  open,
  onOpenChange,
  bestaand,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bestaand: Verwerker | null;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<VerwerkerInput>(LEGE_VERWERKER);

  useEffect(() => {
    if (open) {
      setForm(
        bestaand
          ? {
              naam: bestaand.naam,
              land: bestaand.land ?? "",
              doel: bestaand.doel ?? "",
              categorie_persoonsgegevens: bestaand.categorie_persoonsgegevens ?? "",
              grondslag: bestaand.grondslag ?? "",
              vwo_aanwezig: bestaand.vwo_aanwezig,
              vwo_datum: bestaand.vwo_datum ?? "",
              contactpersoon: bestaand.contactpersoon ?? "",
              notities: bestaand.notities ?? "",
            }
          : LEGE_VERWERKER,
      );
    }
  }, [open, bestaand]);

  const mutatie = useMutation({
    mutationFn: async (body: VerwerkerInput) => {
      const url = bestaand ? `/api/avg/verwerkers/${bestaand.id}` : "/api/avg/verwerkers";
      const r = await fetch(url, {
        method: bestaand ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? "Opslaan mislukt");
      }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: bestaand ? "Verwerker bijgewerkt" : "Verwerker toegevoegd" });
      qc.invalidateQueries({ queryKey: ["avg", "verwerkers"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Fout", description: err.message, variant: "destructive" });
    },
  });

  const veld = (k: keyof VerwerkerInput, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{bestaand ? "Verwerker bewerken" : "Verwerker toevoegen"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-sm">Naam verwerker *</Label>
            <Input value={form.naam} onChange={(e) => veld("naam", e.target.value)} placeholder="Bijv. OpenAI, L.L.C." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Land</Label>
              <Input value={form.land} onChange={(e) => veld("land", e.target.value)} placeholder="Bijv. Ierland (EU)" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Contactpersoon</Label>
              <Input value={form.contactpersoon} onChange={(e) => veld("contactpersoon", e.target.value)} placeholder="E-mail of naam" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Doel van verwerking</Label>
            <Textarea rows={2} value={form.doel} onChange={(e) => veld("doel", e.target.value)} className="text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Categorie persoonsgegevens</Label>
            <Textarea rows={2} value={form.categorie_persoonsgegevens} onChange={(e) => veld("categorie_persoonsgegevens", e.target.value)} className="text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Grondslag</Label>
            <Input value={form.grondslag} onChange={(e) => veld("grondslag", e.target.value)} placeholder="Bijv. Uitvoering van de overeenkomst" />
          </div>
          <div className="flex items-center justify-between rounded border p-3">
            <div>
              <Label className="text-sm">Verwerkersovereenkomst aanwezig</Label>
              <p className="text-xs text-muted-foreground">Is er een getekende verwerkersovereenkomst (DPA)?</p>
            </div>
            <Switch checked={form.vwo_aanwezig} onCheckedChange={(v) => setForm((f) => ({ ...f, vwo_aanwezig: v }))} />
          </div>
          {form.vwo_aanwezig && (
            <div className="space-y-1.5">
              <Label className="text-sm">Datum verwerkersovereenkomst</Label>
              <Input type="date" value={form.vwo_datum} onChange={(e) => veld("vwo_datum", e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-sm">Notities</Label>
            <Textarea rows={2} value={form.notities} onChange={(e) => veld("notities", e.target.value)} className="text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
          <Button
            onClick={() => {
              if (!form.naam.trim()) {
                toast({ title: "Naam is verplicht", variant: "destructive" });
                return;
              }
              mutatie.mutate(form);
            }}
            disabled={mutatie.isPending}
          >
            {bestaand ? "Opslaan" : "Toevoegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-component: VerzoekKaart ───────────────────────────────────────────────

function VerzoekKaart({ verzoek, onRefresh }: { verzoek: AvgVerzoek; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [opmerking, setOpmerking] = useState(verzoek.beheerder_opmerking ?? "");
  const [bevestigAnonimiseer, setBevestigAnonimiseer] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const patchMutation = useMutation({
    mutationFn: async (body: { status?: string; beheerder_opmerking?: string }) => {
      const r = await fetch(`/api/avg/inzageverzoek/${verzoek.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? "Opslaan mislukt");
      }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Verzoek bijgewerkt" });
      qc.invalidateQueries({ queryKey: ["avg"] });
      onRefresh();
    },
    onError: (err: Error) => {
      toast({ title: "Fout", description: err.message, variant: "destructive" });
    },
  });

  const anonimiseerMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/avg/inzageverzoek/${verzoek.id}/anonimiseer`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? "Anonimiseren mislukt");
      }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Account geanonimiseerd", description: "PII is vervangen door pseudoniem" });
      qc.invalidateQueries({ queryKey: ["avg"] });
      onRefresh();
    },
    onError: (err: Error) => {
      toast({ title: "Fout", description: err.message, variant: "destructive" });
    },
  });

  const handleExport = () => {
    window.open(`/api/avg/inzageverzoek/${verzoek.id}/export`, "_blank");
  };

  return (
    <Card className="mb-3">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">
              {typeLabel(verzoek.type)} #{verzoek.id}
            </span>
            <Badge variant={statusVariant(verzoek.status)}>{statusLabel(verzoek.status)}</Badge>
            {verzoek.geanonimiseerd_op && (
              <Badge variant="outline" className="text-muted-foreground">
                Geanonimiseerd
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          <span className="font-medium">{verzoek.gebruiker_naam ?? `Gebruiker #${verzoek.gebruiker_id}`}</span>
          {" · "}
          Ingediend: {formatDatum(verzoek.aangemaakt_op)}
          {verzoek.afgerond_op && ` · Afgerond: ${formatDatum(verzoek.afgerond_op)}`}
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4">
          {verzoek.toelichting && (
            <div>
              <Label className="text-xs text-muted-foreground">Toelichting gebruiker</Label>
              <p className="text-sm mt-1 p-2 bg-muted rounded">{verzoek.toelichting}</p>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" />
              Gegevensexport downloaden
            </Button>

            {!verzoek.geanonimiseerd_op && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setBevestigAnonimiseer(true)}
                disabled={anonimiseerMutation.isPending}
              >
                <UserX className="h-4 w-4 mr-1" />
                Account anonimiseren
              </Button>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-sm">Status bijwerken</Label>
            <Select
              defaultValue={verzoek.status}
              onValueChange={(v) => patchMutation.mutate({ status: v })}
              disabled={patchMutation.isPending}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_behandeling">In behandeling</SelectItem>
                <SelectItem value="afgerond">Afgerond</SelectItem>
                <SelectItem value="afgewezen">Afgewezen</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Interne opmerking</Label>
            <Textarea
              rows={2}
              value={opmerking}
              onChange={(e) => setOpmerking(e.target.value)}
              placeholder="Optionele toelichting voor intern gebruik"
              className="text-sm"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => patchMutation.mutate({ beheerder_opmerking: opmerking })}
              disabled={patchMutation.isPending}
            >
              Opmerking opslaan
            </Button>
          </div>
        </CardContent>
      )}

      <AlertDialog open={bevestigAnonimiseer} onOpenChange={setBevestigAnonimiseer}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Account anonimiseren</AlertDialogTitle>
            <AlertDialogDescription>
              Naam, e-mailadres, telefoonnummer en overige persoonsgegevens van{" "}
              <strong>{verzoek.gebruiker_naam ?? `gebruiker #${verzoek.gebruiker_id}`}</strong> worden
              vervangen door een pseudoniem. Het account wordt uitgeschakeld. Dit is onomkeerbaar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setBevestigAnonimiseer(false);
                anonimiseerMutation.mutate();
              }}
            >
              Ja, anonimiseer dit account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ── Hoofd-component ───────────────────────────────────────────────────────────

// ── Sub-component: VerwerkersTab ─────────────────────────────────────────────

function VerwerkersTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const verwerkers = useAvgVerwerkers();
  const [dialoogOpen, setDialoogOpen] = useState(false);
  const [bewerken, setBewerken] = useState<Verwerker | null>(null);
  const [verwijderId, setVerwijderId] = useState<number | null>(null);

  const verwijderMutatie = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/avg/verwerkers/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Verwijderen mislukt");
    },
    onSuccess: () => {
      toast({ title: "Verwerker verwijderd" });
      qc.invalidateQueries({ queryKey: ["avg", "verwerkers"] });
      setVerwijderId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Fout", description: err.message, variant: "destructive" });
    },
  });

  const exporteerCsv = () => {
    const rijen = verwerkers.data ?? [];
    if (rijen.length === 0) {
      toast({ title: "Geen verwerkers om te exporteren" });
      return;
    }
    const q = (v: string | null | boolean) => {
      const s = v === true ? "Ja" : v === false ? "Nee" : (v ?? "");
      return `"${String(s).replace(/"/g, '""')}"`;
    };
    const kop = [
      "Naam",
      "Land",
      "Doel",
      "Categorie persoonsgegevens",
      "Grondslag",
      "Verwerkersovereenkomst aanwezig",
      "Datum verwerkersovereenkomst",
      "Contactpersoon",
      "Notities",
    ];
    const regels = rijen.map((v) =>
      [
        q(v.naam),
        q(v.land),
        q(v.doel),
        q(v.categorie_persoonsgegevens),
        q(v.grondslag),
        q(v.vwo_aanwezig),
        q(v.vwo_datum),
        q(v.contactpersoon),
        q(v.notities),
      ].join(","),
    );
    const csv = "\uFEFF" + [kop.map((k) => `"${k}"`).join(","), ...regels].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `verwerkersregister-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card className="bg-muted/40">
        <CardContent className="pt-4 pb-3 space-y-1">
          <div className="text-sm font-medium">Verwerkersregister (AVG art. 30 lid 2)</div>
          <p className="text-xs text-muted-foreground">
            Overzicht van externe (sub-)verwerkers die persoonsgegevens verwerken namens FPS. Houd dit
            register actueel en controleer of voor elke verwerker een verwerkersovereenkomst (DPA) is
            gesloten.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 flex-wrap">
        <Button
          size="sm"
          onClick={() => {
            setBewerken(null);
            setDialoogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" />
          Verwerker toevoegen
        </Button>
        <Button size="sm" variant="outline" onClick={exporteerCsv}>
          <Download className="h-4 w-4 mr-1" />
          Exporteren (CSV)
        </Button>
        {verwerkers.data && (
          <span className="text-sm text-muted-foreground">
            {verwerkers.data.length} verwerker{verwerkers.data.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {verwerkers.isLoading && <p className="text-sm text-muted-foreground">Laden...</p>}
      {verwerkers.isError && (
        <p className="text-sm text-destructive">Fout bij laden van het verwerkersregister</p>
      )}

      <div className="grid gap-3">
        {verwerkers.data?.map((v) => (
          <Card key={v.id}>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Network className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-medium">{v.naam}</span>
                  {v.land && (
                    <Badge variant="secondary" className="text-xs">
                      {v.land}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={v.vwo_aanwezig ? "secondary" : "outline"} className="text-xs">
                    {v.vwo_aanwezig ? (
                      <>
                        <Check className="h-3 w-3 mr-1" />
                        DPA aanwezig
                      </>
                    ) : (
                      "Geen DPA"
                    )}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => {
                      setBewerken(v);
                      setDialoogOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => setVerwijderId(v.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                {v.doel && (
                  <div>
                    <span className="text-xs text-muted-foreground">Doel</span>
                    <p>{v.doel}</p>
                  </div>
                )}
                {v.categorie_persoonsgegevens && (
                  <div>
                    <span className="text-xs text-muted-foreground">Categorie persoonsgegevens</span>
                    <p>{v.categorie_persoonsgegevens}</p>
                  </div>
                )}
                {v.grondslag && (
                  <div>
                    <span className="text-xs text-muted-foreground">Grondslag</span>
                    <p>{v.grondslag}</p>
                  </div>
                )}
                {v.contactpersoon && (
                  <div>
                    <span className="text-xs text-muted-foreground">Contactpersoon</span>
                    <p>{v.contactpersoon}</p>
                  </div>
                )}
                {v.vwo_aanwezig && v.vwo_datum && (
                  <div>
                    <span className="text-xs text-muted-foreground">Datum verwerkersovereenkomst</span>
                    <p>{formatDatum(v.vwo_datum)}</p>
                  </div>
                )}
                {v.notities && (
                  <div className="sm:col-span-2">
                    <span className="text-xs text-muted-foreground">Notities</span>
                    <p className="text-muted-foreground">{v.notities}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {verwerkers.data?.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">Nog geen verwerkers geregistreerd.</p>
        )}
      </div>

      <VerwerkerDialoog open={dialoogOpen} onOpenChange={setDialoogOpen} bestaand={bewerken} />

      <AlertDialog
        open={verwijderId !== null}
        onOpenChange={(o) => {
          if (!o) setVerwijderId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Verwerker verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              De verwerker wordt uit het register verwijderd. Deze actie kan niet ongedaan worden
              gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => verwijderId !== null && verwijderMutatie.mutate(verwijderId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AvgBeheer() {
  const [statusFilter, setStatusFilter] = useState("open");
  const [inactiefDagen, setInactiefDagen] = useState(180);
  const [tabblad, setTabblad] = useState<"verzoeken" | "inactief" | "verwerkers">("verzoeken");
  const [archiverenId, setArchiverenId] = useState<number | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const stats = useAvgStats();
  const verzoeken = useAvgVerzoeken(statusFilter);
  const inactief = useInactieveAccounts(inactiefDagen);
  const opschoonStatus = useAvgOpschoonStatus();

  const archiveerMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/gebruikers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ gearchiveerd: true }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? "Archiveren mislukt");
      }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Account gearchiveerd" });
      setArchiverenId(null);
      qc.invalidateQueries({ queryKey: ["avg"] });
    },
    onError: (err: Error) => {
      toast({ title: "Fout", description: err.message, variant: "destructive" });
    },
  });

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ["avg"] });
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-primary" />
        <h1 data-paginatitel className="text-xl font-semibold">AVG-verzoeken</h1>
      </div>

      {/* Statistieken */}
      {stats.data && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold text-destructive">{stats.data.open_verzoeken}</div>
              <div className="text-xs text-muted-foreground">Open verzoeken</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold">{stats.data.in_behandeling}</div>
              <div className="text-xs text-muted-foreground">In behandeling</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold text-amber-600">{stats.data.inactieve_accounts}</div>
              <div className="text-xs text-muted-foreground">Inactieve accounts (&gt;180 dagen)</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabbladen */}
      <div className="flex gap-2 border-b pb-0">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tabblad === "verzoeken" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setTabblad("verzoeken")}
        >
          Inzage- en verwijderverzoeken
          {(stats.data?.open_verzoeken ?? 0) > 0 && (
            <span className="ml-2 rounded-full bg-destructive text-destructive-foreground text-xs px-1.5 py-0.5">
              {stats.data!.open_verzoeken}
            </span>
          )}
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tabblad === "inactief" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setTabblad("inactief")}
        >
          Inactieve accounts
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tabblad === "verwerkers" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setTabblad("verwerkers")}
        >
          Verwerkersregister
        </button>
      </div>

      {/* Verzoeken */}
      {tabblad === "verzoeken" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_behandeling">In behandeling</SelectItem>
                <SelectItem value="afgerond">Afgerond</SelectItem>
                <SelectItem value="afgewezen">Afgewezen</SelectItem>
                <SelectItem value="alle">Alle verzoeken</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Vernieuwen
            </Button>
            {verzoeken.data && (
              <span className="text-sm text-muted-foreground">
                {verzoeken.data.totaal} verzoeken
              </span>
            )}
          </div>

          {verzoeken.isLoading && (
            <p className="text-sm text-muted-foreground">Laden...</p>
          )}
          {verzoeken.isError && (
            <p className="text-sm text-destructive">Fout bij laden van verzoeken</p>
          )}
          {verzoeken.data?.verzoeken.length === 0 && (
            <p className="text-sm text-muted-foreground py-4">Geen verzoeken gevonden</p>
          )}
          {verzoeken.data?.verzoeken.map((v) => (
            <VerzoekKaart key={v.id} verzoek={v} onRefresh={handleRefresh} />
          ))}
        </div>
      )}

      {/* Inactieve accounts */}
      {tabblad === "inactief" && (
        <div className="space-y-4">
          {opschoonStatus.data && (
            <Card className="bg-muted/40">
              <CardContent className="pt-4 pb-3 space-y-1">
                <div className="text-sm font-medium">Geautomatiseerde accountopschoning</div>
                <p className="text-xs text-muted-foreground">
                  Accounts die langer dan {opschoonStatus.data.bewaardagen} dagen inactief zijn
                  worden dagelijks automatisch geanonimiseerd.{" "}
                  {opschoonStatus.data.wachtend_op_anonimisering > 0 ? (
                    <span className="text-amber-700 font-medium">
                      {opschoonStatus.data.wachtend_op_anonimisering} account
                      {opschoonStatus.data.wachtend_op_anonimisering === 1 ? "" : "s"} wachten op de
                      volgende run.
                    </span>
                  ) : (
                    "Geen accounts wachten momenteel."
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {opschoonStatus.data.laatste_run ? (
                    <>
                      Laatste run: {formatDatum(opschoonStatus.data.laatste_run.uitgevoerd_op)} ·{" "}
                      {opschoonStatus.data.laatste_run.accounts_geanonimiseerd} account(s)
                      geanonimiseerd · {opschoonStatus.data.laatste_run.activiteiten_verwijderd}{" "}
                      activiteitenregels verwijderd
                    </>
                  ) : (
                    "Nog geen opschoonrun uitgevoerd."
                  )}
                </p>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Inactief langer dan</span>
              <Select
                value={String(inactiefDagen)}
                onValueChange={(v) => setInactiefDagen(Number(v))}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="90">90 dagen</SelectItem>
                  <SelectItem value="180">180 dagen</SelectItem>
                  <SelectItem value="365">365 dagen</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="outline" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Vernieuwen
            </Button>
          </div>

          <div className="rounded-sm border text-sm">
            <div className="flex font-medium text-muted-foreground bg-muted px-3 py-2 text-xs">
              <span className="flex-1">Naam</span>
              <span className="w-52">E-mail</span>
              <span className="w-28">Rol</span>
              <span className="w-36">Laatste login</span>
              <span className="w-28 text-right">Actie</span>
            </div>

            {inactief.isLoading && (
              <p className="text-sm text-muted-foreground p-4">Laden...</p>
            )}
            {inactief.data?.accounts.length === 0 && (
              <p className="text-sm text-muted-foreground p-4">
                Geen inactieve accounts gevonden voor de geselecteerde periode.
              </p>
            )}
            {inactief.data?.accounts.map((a) => (
              <div
                key={a.id}
                className="flex items-center px-3 py-2 border-t hover:bg-muted/40 transition-colors"
              >
                <span className="flex-1 font-medium">{a.naam}</span>
                <span className="w-52 text-muted-foreground truncate">{a.email}</span>
                <span className="w-28 text-muted-foreground capitalize">{a.rol}</span>
                <span className="w-36 text-muted-foreground">
                  {a.laatste_online ? formatDatum(a.laatste_online) : "Nooit"}
                </span>
                <div className="w-28 flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setArchiverenId(a.id)}
                  >
                    Archiveren
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {inactief.data && inactief.data.accounts.length > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Archiveren schakelt het account uit. Automatische verwijdering vereist een
                AVG-verwijderverzoek van de gebruiker of een expliciete beheerderbeslissing.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Verwerkersregister */}
      {tabblad === "verwerkers" && <VerwerkersTab />}

      {/* Bevestigingsdialog archiveren inactief account */}
      <AlertDialog open={archiverenId !== null} onOpenChange={(o) => { if (!o) setArchiverenId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Account archiveren?</AlertDialogTitle>
            <AlertDialogDescription>
              Het account wordt gearchiveerd en is niet meer inlogbaar. Dit kan ongedaan worden
              gemaakt via Gebruikersbeheer. Gegevens blijven bewaard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => archiverenId !== null && archiveerMutation.mutate(archiverenId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Archiveren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
