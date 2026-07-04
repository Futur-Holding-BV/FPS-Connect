import { useState } from "react";
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
} from "lucide-react";
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
  return t === "verwijdering" ? "Verwijderverzoek" : "Inzageverzoek";
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

export default function AvgBeheer() {
  const [statusFilter, setStatusFilter] = useState("open");
  const [inactiefDagen, setInactiefDagen] = useState(180);
  const [tabblad, setTabblad] = useState<"verzoeken" | "inactief">("verzoeken");
  const [archiverenId, setArchiverenId] = useState<number | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const stats = useAvgStats();
  const verzoeken = useAvgVerzoeken(statusFilter);
  const inactief = useInactieveAccounts(inactiefDagen);

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
        <h1 className="text-xl font-semibold">AVG-verzoeken</h1>
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
