import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { WerkInboxMailInhoud } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  RefreshCw, Inbox, Paperclip, CheckCircle2, AlertCircle,
  Sparkles, Building2, User, ExternalLink, LogOut, LinkIcon,
  StickyNote, Loader2, Search, X, Mail, MailOpen, Eye, Users,
  UserCheck, Send, Lock, Clock,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type OAuthStatus =
  | { gekoppeld: false }
  | { gekoppeld: true; email: string; verlooptOp: string; herkoppelenNodig?: boolean; ontbrekendeRechten?: string[] };

type Mailbox = {
  id: number;
  emailAdres: string;
  label: string | null;
  actief: boolean;
  modus: "verwerken" | "ondersteunen" | "registreren";
  recht: "lezen" | "behandelen" | "beheren";
};

type ToegangLid = {
  id: number;
  gebruikerId: number;
  recht: string;
  naam: string;
  email: string;
};

type Aanwezige = { gebruikerId: number; naam: string; activiteit: "bekijkt" | "typt" };

type MailItem = {
  id: number;
  messageId: string;
  mailboxAdres: string;
  toegewezenAan: number | null;
  toegewezen_naam: string | null;
  samenwerkStatus: "open" | "toegewezen" | "wacht_op_antwoord" | "afgehandeld";
  beantwoordOp: string | null;
  onderwerp: string;
  afzenderNaam: string | null;
  afzenderEmail: string;
  ontvangenOp: string;
  snippet: string | null;
  heeftBijlage: boolean;
  isGelezenMs: boolean;
  verwerktOp: string | null;
  afgehandeldOp: string | null;
  actieVereist: boolean;
  actieVereistReden: string | null;
  aiVoorstelJson: string | null;
  aiLogboekJson: string | null;
  relatieCategorieAi: string | null;
  notitie_aantal: number;
  koppeling_aantal: number;
};

type MailDetail = {
  meta: MailItem;
  inhoud: WerkInboxMailInhoud;
  inhoud_waarschuwing: string | null;
  notities: { id: number; tekst: string; aangemaaktOp: string; gebruikerId: number; auteurNaam: string | null }[];
  aanwezigheid: Aanwezige[];
  mijn_recht: "lezen" | "behandelen" | "beheren";
  mailbox_modus: "verwerken" | "ondersteunen" | "registreren";
  koppelingen: {
    id: number;
    entityType: string;
    entityId: number;
    entityLabel: string | null;
  }[];
};

type Relatie = {
  gevonden: boolean;
  contactpersoon?: {
    naam: string;
    functie: string | null;
    relatiesterkte: string;
    lastContact: string | null;
  } | null;
  organisatie?: {
    id: number;
    naam: string;
    type: string | null;
    status: string;
  } | null;
};

type AiVoorstel = {
  type: string;
  omschrijving: string;
  zekerheid: number;
};

type AiLogboekItem = {
  actie: string;
  uitgevoerdOp: string;
  samenvatting?: string;
  categorie?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (!resp.ok) {
    const tekst = await resp.text().catch(() => resp.statusText);
    throw new Error(tekst);
  }
  return resp.json() as Promise<T>;
}

function formatDatum(d: string): string {
  const dt = new Date(d);
  const nu = new Date();
  const vandag = nu.toDateString() === dt.toDateString();
  if (vandag) return dt.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  const gisteren = new Date(nu);
  gisteren.setDate(gisteren.getDate() - 1);
  if (gisteren.toDateString() === dt.toDateString()) return "Gisteren";
  return dt.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

function initialen(naam: string | null, email: string): string {
  if (naam) {
    const delen = naam.trim().split(/\s+/);
    if (delen.length >= 2) return (delen[0][0] + delen[delen.length - 1][0]).toUpperCase();
    return naam.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function voorstelIcon(type: string): string {
  const map: Record<string, string> = {
    koppel_project: "Koppelen aan project",
    maak_taak: "Taak aanmaken",
    conceptantwoord: "Conceptantwoord gereed",
    factuur_herkennen: "Factuur verwerken",
    offerte_koppelen: "Offerte koppelen",
    document_opslaan: "Document opslaan",
    onderhoudscontract: "Onderhoudscontract herkennen",
    administratief_verwerken: "Administratief verwerken",
  };
  return map[type] ?? type;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  open:              { label: "Open",              cls: "bg-muted text-muted-foreground" },
  toegewezen:        { label: "Toegewezen",        cls: "bg-blue-100 text-blue-800" },
  wacht_op_antwoord: { label: "Wacht op antwoord", cls: "bg-purple-100 text-purple-800" },
  afgehandeld:       { label: "Afgehandeld",       cls: "bg-green-100 text-green-800" },
};

function relatiesterkteBadge(s: string): { label: string; cls: string } {
  const map: Record<string, { label: string; cls: string }> = {
    sterk: { label: "Sterke relatie", cls: "bg-green-100 text-green-800" },
    matig: { label: "Matige relatie", cls: "bg-yellow-100 text-yellow-800" },
    zwak: { label: "Zwakke relatie", cls: "bg-red-100 text-red-800" },
    onbekend: { label: "Relatie onbekend", cls: "bg-muted text-muted-foreground" },
  };
  return map[s] ?? map["onbekend"]!;
}

// ─── Verbindingsscherm ────────────────────────────────────────────────────────

function VerbindingsScherm({ onOntkoppel }: { onOntkoppel?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 gap-6">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
        <Inbox className="w-8 h-8 text-primary" />
      </div>
      <div className="space-y-2 max-w-sm">
        <h2 className="text-xl font-semibold">Verbind met Microsoft 365</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Koppel uw Outlook-postbus aan FPS Connect om e-mails te ontvangen,
          AI-voorstellen te genereren en relaties zichtbaar te houden.
        </p>
      </div>
      <Button
        onClick={() => { window.location.href = "/api/werk-inbox/oauth/start"; }}
        className="gap-2"
      >
        <Mail className="h-4 w-4" />
        Koppel Microsoft 365-account
      </Button>
      {onOntkoppel && (
        <Button variant="ghost" size="sm" onClick={onOntkoppel} className="text-muted-foreground gap-2">
          <LogOut className="h-3 w-3" />
          Ontkoppelen
        </Button>
      )}
    </div>
  );
}

// ─── Relatiepaneel ────────────────────────────────────────────────────────────

function RelatiePanel({ email }: { email: string }) {
  const { data: relatie, isLoading } = useQuery({
    queryKey: ["werk-inbox", "relatie", email],
    queryFn: () => apiFetch<Relatie>(`/api/werk-inbox/relatie/${encodeURIComponent(email)}`),
    enabled: !!email,
    staleTime: 5 * 60_000,
  });

  return (
    <div className="w-72 shrink-0 border-l bg-muted/20 flex flex-col overflow-y-auto pb-14">
      <div className="p-3 border-b">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Relatie</h3>
      </div>

      {isLoading && (
        <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Opzoeken...
        </div>
      )}

      {!isLoading && !relatie?.gevonden && (
        <div className="p-4 text-sm text-muted-foreground">
          <p className="font-medium mb-1 text-foreground">{email}</p>
          <p>Niet gevonden in CRM.</p>
          <Button variant="outline" size="sm" className="mt-3 gap-2 w-full" asChild>
            <a href="/crm" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3 w-3" />
              Toevoegen aan CRM
            </a>
          </Button>
        </div>
      )}

      {!isLoading && relatie?.gevonden && (
        <div className="p-4 space-y-4 text-sm">
          {relatie.contactpersoon && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
                <User className="h-3 w-3" />
                Contactpersoon
              </div>
              <p className="font-semibold">{relatie.contactpersoon.naam}</p>
              {relatie.contactpersoon.functie && (
                <p className="text-muted-foreground">{relatie.contactpersoon.functie}</p>
              )}
              {relatie.contactpersoon.relatiesterkte && relatie.contactpersoon.relatiesterkte !== "onbekend" && (
                <span className={cn(
                  "inline-block text-xs px-2 py-0.5 rounded-full",
                  relatiesterkteBadge(relatie.contactpersoon.relatiesterkte).cls,
                )}>
                  {relatiesterkteBadge(relatie.contactpersoon.relatiesterkte).label}
                </span>
              )}
              {relatie.contactpersoon.lastContact && (
                <p className="text-xs text-muted-foreground">
                  Laatste contact: {relatie.contactpersoon.lastContact}
                </p>
              )}
            </div>
          )}

          {relatie.organisatie && (
            <>
              {relatie.contactpersoon && <Separator />}
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  <Building2 className="h-3 w-3" />
                  Organisatie
                </div>
                <p className="font-semibold">{relatie.organisatie.naam}</p>
                {relatie.organisatie.type && (
                  <p className="text-muted-foreground capitalize">{relatie.organisatie.type}</p>
                )}
                <Badge variant="outline" className="text-xs capitalize">
                  {relatie.organisatie.status}
                </Badge>
              </div>
            </>
          )}

          <Separator />
          <Button variant="outline" size="sm" className="gap-2 w-full" asChild>
            <a href="/crm" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3 w-3" />
              Bekijken in CRM
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Mail detail ──────────────────────────────────────────────────────────────

function MailDetailView({
  messageId,
  mailboxen,
  onSluiten,
}: {
  messageId: string;
  mailboxen: Mailbox[];
  onSluiten: () => void;
}) {
  const queryClient = useQueryClient();
  const [nieuwNotitie, setNieuwNotitie] = useState("");
  const [notitieOpen, setNotitieOpen] = useState(false);
  const [logboekOpen, setLogboekOpen] = useState(false);
  const [antwoordOpen, setAntwoordOpen] = useState(false);
  const [antwoordTekst, setAntwoordTekst] = useState("");
  const [aanwezigen, setAanwezigen] = useState<Aanwezige[]>([]);
  const typtRef = useRef(false);
  typtRef.current = antwoordOpen && antwoordTekst.length > 0;

  const { data: detail, isLoading } = useQuery({
    queryKey: ["werk-inbox", "mail", messageId],
    queryFn: () => apiFetch<MailDetail>(`/api/werk-inbox/mails/${messageId}`),
    // Kort pollen zodat opmerkingen/status/toewijzing van collega's "live" verschijnen.
    refetchInterval: 12_000,
  });

  // Aanwezigheid: heartbeat elke 8s ("bekijkt" of "typt"), bij verlaten "weg".
  useEffect(() => {
    let actief = true;
    const stuur = async (activiteit: "bekijkt" | "typt" | "weg") => {
      try {
        const r = await apiFetch<{ aanwezigheid: Aanwezige[] }>(
          `/api/werk-inbox/mails/${encodeURIComponent(messageId)}/aanwezigheid`,
          { method: "POST", body: JSON.stringify({ activiteit }) },
        );
        if (actief && activiteit !== "weg") setAanwezigen(r.aanwezigheid);
      } catch { /* aanwezigheid is best-effort */ }
    };
    void stuur("bekijkt");
    const timer = setInterval(() => { void stuur(typtRef.current ? "typt" : "bekijkt"); }, 8000);
    return () => { actief = false; clearInterval(timer); void stuur("weg"); };
  }, [messageId]);

  const mailbox = mailboxen.find((mb) => mb.emailAdres === detail?.meta.mailboxAdres) ?? null;

  const { data: leden = [] } = useQuery({
    queryKey: ["werk-inbox", "toegang", mailbox?.id],
    queryFn: () => apiFetch<ToegangLid[]>(`/api/werk-inbox/mailboxen/${mailbox!.id}/toegang`),
    enabled: mailbox != null,
    staleTime: 60_000,
  });

  const invalideer = () => {
    void queryClient.invalidateQueries({ queryKey: ["werk-inbox", "mail", messageId] });
    void queryClient.invalidateQueries({ queryKey: ["werk-inbox", "mails"] });
  };

  const gelezenMutatie = useMutation({
    mutationFn: (isGelezen: boolean) =>
      apiFetch(`/api/werk-inbox/mails/${messageId}/gelezen`, {
        method: "PATCH",
        body: JSON.stringify({ isGelezen }),
      }),
    onSuccess: invalideer,
  });

  const afgehandeldMutatie = useMutation({
    mutationFn: (afgehandeld: boolean) =>
      apiFetch(`/api/werk-inbox/mails/${messageId}/afgehandeld`, {
        method: "PATCH",
        body: JSON.stringify({ afgehandeld }),
      }),
    onSuccess: invalideer,
  });

  const aiAnalyseMutatie = useMutation({
    mutationFn: () =>
      apiFetch(`/api/werk-inbox/mails/${messageId}/analyseer`, { method: "POST" }),
    onSuccess: invalideer,
  });

  const notitieAanmakenMutatie = useMutation({
    mutationFn: (tekst: string) =>
      apiFetch(`/api/werk-inbox/mails/${messageId}/notities`, {
        method: "POST",
        body: JSON.stringify({ tekst }),
      }),
    onSuccess: () => { invalideer(); setNieuwNotitie(""); },
  });

  const notitiVerwijderenMutatie = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/werk-inbox/notities/${id}`, { method: "DELETE" }),
    onSuccess: invalideer,
  });

  // Optimistic concurrency: stuur de stand mee die we nu tonen; bij 409 heeft
  // een collega net gewijzigd — dan herladen we en tonen we diens stand.
  const toewijzenMutatie = useMutation({
    mutationFn: (gebruikerId: number | null) =>
      apiFetch(`/api/werk-inbox/mails/${messageId}/toewijzen`, {
        method: "PATCH",
        body: JSON.stringify({ gebruikerId, verwachtToegewezenAan: detail?.meta.toegewezenAan ?? null }),
      }),
    onSuccess: invalideer,
    onError: (err: Error) => { invalideer(); toast({ title: "Toewijzing niet doorgevoerd", description: err.message, variant: "destructive" }); },
  });

  const statusMutatie = useMutation({
    mutationFn: (status: string) =>
      apiFetch(`/api/werk-inbox/mails/${messageId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, verwachteStatus: detail?.meta.samenwerkStatus }),
      }),
    onSuccess: invalideer,
    onError: (err: Error) => { invalideer(); toast({ title: "Status niet gewijzigd", description: err.message, variant: "destructive" }); },
  });

  const beantwoordMutatie = useMutation({
    mutationFn: (tekst: string) =>
      apiFetch(`/api/werk-inbox/mails/${messageId}/beantwoord`, {
        method: "POST",
        body: JSON.stringify({ htmlBody: tekst.split("\n").map((r) => escapeHtml(r)).join("<br>") }),
      }),
    onSuccess: () => { invalideer(); setAntwoordTekst(""); setAntwoordOpen(false); },
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Laden...
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Mail niet gevonden.
      </div>
    );
  }

  const { meta, inhoud, notities, koppelingen } = detail;
  const magBehandelen = detail.mijn_recht === "behandelen" || detail.mijn_recht === "beheren";
  const behandelaars = leden.filter((l) => l.recht === "behandelen" || l.recht === "beheren");
  const voorstellen: AiVoorstel[] = (() => {
    try { return meta.aiVoorstelJson ? (JSON.parse(meta.aiVoorstelJson) as AiVoorstel[]) : []; }
    catch { return []; }
  })();
  const logboek: AiLogboekItem[] = (() => {
    try { return meta.aiLogboekJson ? (JSON.parse(meta.aiLogboekJson) as AiLogboekItem[]) : []; }
    catch { return []; }
  })();

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Mail content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mail header */}
        <div className="p-4 border-b space-y-3 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                  {initialen(meta.afzenderNaam, meta.afzenderEmail)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-semibold truncate">{meta.afzenderNaam ?? meta.afzenderEmail}</p>
                <p className="text-xs text-muted-foreground truncate">{meta.afzenderEmail}</p>
                {meta.relatieCategorieAi && (
                  <Badge variant="secondary" className="text-xs mt-1 capitalize">
                    {meta.relatieCategorieAi}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(meta.ontvangenOp).toLocaleString("nl-NL", {
                  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                })}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onSluiten}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <h2 className="font-semibold text-base leading-tight">{meta.onderwerp}</h2>

          {/* Samenwerking: wie kijkt mee (opdracht §5.2) */}
          {aanwezigen.length > 0 && (
            <div className="flex items-center gap-2 text-xs bg-blue-50 border border-blue-200 text-blue-800 rounded px-2.5 py-1.5" data-testid="aanwezigheid-banner">
              <Eye className="h-3.5 w-3.5 shrink-0" />
              {aanwezigen.map((a) => (
                <span key={a.gebruikerId} className="font-medium">
                  {a.naam} {a.activiteit === "typt" ? "typt een antwoord…" : "heeft dit bericht open"}
                </span>
              ))}
            </div>
          )}

          {/* Toewijzing + gezamenlijke status (opdracht §5.1/§5.4) */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("inline-flex items-center text-xs px-2 py-0.5 rounded-full", STATUS_LABELS[meta.samenwerkStatus]?.cls)}>
              {STATUS_LABELS[meta.samenwerkStatus]?.label ?? meta.samenwerkStatus}
            </span>
            {magBehandelen && (
              <>
                <Select
                  value={meta.toegewezenAan != null ? String(meta.toegewezenAan) : "niemand"}
                  onValueChange={(v) => toewijzenMutatie.mutate(v === "niemand" ? null : Number(v))}
                  disabled={toewijzenMutatie.isPending}
                >
                  <SelectTrigger className="h-7 w-auto min-w-[160px] text-xs" data-testid="toewijzen-select">
                    <UserCheck className="h-3 w-3 mr-1 shrink-0" />
                    <SelectValue placeholder="Toewijzen aan…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="niemand">Niet toegewezen</SelectItem>
                    {behandelaars.map((l) => (
                      <SelectItem key={l.gebruikerId} value={String(l.gebruikerId)}>{l.naam}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={meta.samenwerkStatus}
                  onValueChange={(v) => statusMutatie.mutate(v)}
                  disabled={statusMutatie.isPending}
                >
                  <SelectTrigger className="h-7 w-auto min-w-[150px] text-xs" data-testid="status-select">
                    <Clock className="h-3 w-3 mr-1 shrink-0" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([w, s]) => (
                      <SelectItem key={w} value={w}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
            {meta.toegewezen_naam && (
              <span className="text-xs text-muted-foreground">Behandelaar: <span className="font-medium text-foreground">{meta.toegewezen_naam}</span></span>
            )}
          </div>

          {/* Actie-knoppen */}
          <div className="flex items-center gap-2 flex-wrap">
            {magBehandelen && (
              <Button
                variant={antwoordOpen ? "secondary" : "default"}
                size="sm"
                className="gap-2 h-7 text-xs"
                onClick={() => setAntwoordOpen(!antwoordOpen)}
                data-testid="knop-beantwoorden"
              >
                <Send className="h-3 w-3" />
                Beantwoorden
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-2 h-7 text-xs"
              onClick={() => gelezenMutatie.mutate(!meta.isGelezenMs)}
              disabled={gelezenMutatie.isPending || !magBehandelen}
            >
              {meta.isGelezenMs ? <Mail className="h-3 w-3" /> : <MailOpen className="h-3 w-3" />}
              {meta.isGelezenMs ? "Ongelezen" : "Gelezen"}
            </Button>

            <Button
              variant={meta.afgehandeldOp ? "secondary" : "outline"}
              size="sm"
              className="gap-2 h-7 text-xs"
              onClick={() => afgehandeldMutatie.mutate(!meta.afgehandeldOp)}
              disabled={afgehandeldMutatie.isPending}
            >
              <CheckCircle2 className="h-3 w-3" />
              {meta.afgehandeldOp ? "Heropenen" : "Afhandelen"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="gap-2 h-7 text-xs"
              onClick={() => aiAnalyseMutatie.mutate()}
              disabled={aiAnalyseMutatie.isPending}
            >
              {aiAnalyseMutatie.isPending
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Sparkles className="h-3 w-3" />}
              {voorstellen.length > 0 ? "Heranalyseer" : "AI analyseer"}
            </Button>
          </div>
        </div>

        {/* Inhoud niet beschikbaar (Graph-storing of geen Exchange-toegang) */}
        {detail.inhoud_waarschuwing && (
          <div className="px-4 py-2 bg-muted border-b flex items-center gap-2 text-sm text-muted-foreground shrink-0">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{detail.inhoud_waarschuwing}</span>
          </div>
        )}

        {/* Actie vereist banner */}
        {meta.actieVereist && (
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-sm text-amber-800 shrink-0">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>
              <span className="font-medium">Actie vereist: </span>
              {meta.actieVereistReden ?? "Menselijke beoordeling nodig."}
            </span>
          </div>
        )}

        {/* AI voorstellen */}
        {voorstellen.length > 0 && (
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 space-y-2 shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-semibold text-amber-800">
                AI Voorstellen ({voorstellen.length})
              </span>
            </div>
            <div className="space-y-1.5">
              {voorstellen.map((v, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-3 bg-white rounded border border-amber-200 px-3 py-2"
                >
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium text-amber-900">{voorstelIcon(v.type)}</p>
                    <p className="text-xs text-amber-700">{v.omschrijving}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-xs shrink-0 border-amber-300 text-amber-700"
                  >
                    {v.zekerheid}%
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mail body */}
        <div className="flex-1 overflow-y-auto pb-14">
          {inhoud.body ? (
            inhoud.contentType === "html" ? (
              <iframe
                srcDoc={inhoud.body}
                sandbox=""
                referrerPolicy="no-referrer"
                title="E-mailinhoud"
                className="w-full h-full min-h-[300px] border-0"
                data-testid="mailinhoud-html"
              />
            ) : (
              <div
                className="p-4 text-sm whitespace-pre-wrap break-words"
                data-testid="mailinhoud-tekst"
              >
                {inhoud.body}
              </div>
            )
          ) : (
            <div className="p-4 text-sm text-muted-foreground">
              {meta.snippet ?? "Geen inhoud beschikbaar. Controleer uw Microsoft 365-verbinding."}
            </div>
          )}
        </div>

        {/* Antwoord-composer (opdracht §5.2/§5.5) — strikt gescheiden van interne opmerkingen */}
        {antwoordOpen && magBehandelen && (
          <div className="border-t px-4 py-3 space-y-2 shrink-0 bg-background" data-testid="antwoord-composer">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Send className="h-3 w-3" />
              Antwoord aan {meta.afzenderNaam ?? meta.afzenderEmail}
            </p>
            <Textarea
              value={antwoordTekst}
              onChange={(e) => setAntwoordTekst(e.target.value)}
              placeholder="Typ uw antwoord aan de afzender…"
              className="text-sm min-h-[100px]"
              data-testid="antwoord-tekst"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Dit antwoord wordt via Microsoft 365 naar de afzender gestuurd.</span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setAntwoordOpen(false); setAntwoordTekst(""); }}>
                  Annuleren
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => antwoordTekst.trim() && beantwoordMutatie.mutate(antwoordTekst.trim())}
                  disabled={!antwoordTekst.trim() || beantwoordMutatie.isPending}
                  data-testid="antwoord-versturen"
                >
                  {beantwoordMutatie.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Versturen
                </Button>
              </div>
            </div>
            {beantwoordMutatie.isError && (
              <p className="text-xs text-destructive">{(beantwoordMutatie.error as Error).message}</p>
            )}
          </div>
        )}

        {/* Bijlagen */}
        {(inhoud.bijlagen?.length ?? 0) > 0 && (
          <div className="border-t px-4 py-2 shrink-0">
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <Paperclip className="h-3 w-3" />
              Bijlagen ({inhoud.bijlagen!.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {inhoud.bijlagen!.map((b, i) => (
                <span
                  key={i}
                  className="text-xs bg-muted px-2 py-1 rounded border truncate max-w-[200px]"
                  title={b.naam}
                >
                  {b.naam}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Koppelingen */}
        {koppelingen.length > 0 && (
          <div className="border-t px-4 py-2 shrink-0">
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <LinkIcon className="h-3 w-3" />
              Koppelingen ({koppelingen.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {koppelingen.map((k) => (
                <Badge key={k.id} variant="secondary" className="text-xs capitalize">
                  {k.entityType}: {k.entityLabel ?? k.entityId}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Interne opmerkingen (opdracht §5.3): gedeeld met collega's, gaan NOOIT naar de klant */}
        <div className="border-t shrink-0 bg-amber-50/60">
          <button
            className="w-full px-4 py-2 flex items-center justify-between text-xs font-medium text-amber-800 hover:bg-amber-100/60"
            onClick={() => setNotitieOpen(!notitieOpen)}
            data-testid="opmerkingen-toggle"
          >
            <span className="flex items-center gap-1.5">
              <Lock className="h-3 w-3" />
              <StickyNote className="h-3 w-3" />
              Interne opmerkingen ({notities.length}) — nooit zichtbaar voor de klant
            </span>
            <span>{notitieOpen ? "▲" : "▼"}</span>
          </button>
          {notitieOpen && (
            <div className="px-4 pb-3 space-y-2">
              {notities.map((n) => (
                <div key={n.id} className="flex items-start gap-2 bg-amber-100/70 border border-amber-200 rounded p-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-amber-900">{n.auteurNaam ?? "Collega"}
                      <span className="font-normal text-amber-700/70 ml-2">
                        {new Date(n.aangemaaktOp).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </p>
                    <p className="whitespace-pre-wrap text-amber-900">{n.tekst}</p>
                  </div>
                  <button
                    className="text-amber-700 hover:text-destructive shrink-0"
                    onClick={() => notitiVerwijderenMutatie.mutate(n.id)}
                    title="Verwijder opmerking"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {magBehandelen && (
                <div className="flex gap-2">
                  <Input
                    value={nieuwNotitie}
                    onChange={(e) => setNieuwNotitie(e.target.value)}
                    placeholder="Interne opmerking voor collega's — gaat nooit naar de klant…"
                    className="h-7 text-xs bg-white border-amber-300"
                    data-testid="opmerking-invoer"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && nieuwNotitie.trim()) {
                        notitieAanmakenMutatie.mutate(nieuwNotitie.trim());
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-amber-300"
                    onClick={() => nieuwNotitie.trim() && notitieAanmakenMutatie.mutate(nieuwNotitie.trim())}
                    disabled={!nieuwNotitie.trim() || notitieAanmakenMutatie.isPending}
                  >
                    Plaatsen
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* AI Logboek */}
        {logboek.length > 0 && (
          <div className="border-t shrink-0">
            <button
              className="w-full px-4 py-2 flex items-center justify-between text-xs font-medium text-muted-foreground hover:bg-muted/50"
              onClick={() => setLogboekOpen(!logboekOpen)}
            >
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                AI Logboek ({logboek.length})
              </span>
              <span>{logboekOpen ? "▲" : "▼"}</span>
            </button>
            {logboekOpen && (
              <div className="px-4 pb-3 space-y-1.5">
                {logboek.map((l, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <CheckCircle2 className="h-3 w-3 text-green-600 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium">{l.actie}</span>
                      {l.categorie && <Badge variant="outline" className="ml-2 text-xs capitalize">{l.categorie}</Badge>}
                      {l.samenvatting && <p className="text-muted-foreground">{l.samenvatting}</p>}
                      <p className="text-muted-foreground/70">
                        {new Date(l.uitgevoerdOp).toLocaleString("nl-NL", {
                          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Relatiepaneel */}
      <RelatiePanel email={meta.afzenderEmail} />
    </div>
  );
}

// ─── Mail lijstitem ───────────────────────────────────────────────────────────

function MailLijstItem({
  mail,
  geselecteerd,
  onClick,
}: {
  mail: MailItem;
  geselecteerd: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 border-b hover:bg-muted/60 transition-colors",
        geselecteerd && "bg-primary/5 border-l-2 border-l-primary",
        !mail.isGelezenMs && "bg-blue-50/50",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className={cn("text-sm truncate", !mail.isGelezenMs && "font-semibold")}>
              {mail.afzenderNaam ?? mail.afzenderEmail}
            </span>
            <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
              {formatDatum(mail.ontvangenOp)}
            </span>
          </div>
          <p className={cn("text-xs truncate", !mail.isGelezenMs ? "font-medium text-foreground" : "text-foreground")}>
            {mail.onderwerp}
          </p>
          {mail.snippet && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{mail.snippet}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1">
            {!mail.isGelezenMs && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
            )}
            {mail.heeftBijlage && (
              <Paperclip className="h-3 w-3 text-muted-foreground" />
            )}
            {mail.actieVereist && (
              <AlertCircle className="h-3 w-3 text-amber-500" />
            )}
            {mail.aiVoorstelJson && mail.aiVoorstelJson !== "[]" && (
              <Sparkles className="h-3 w-3 text-amber-500" />
            )}
            {mail.afgehandeldOp && (
              <CheckCircle2 className="h-3 w-3 text-green-600" />
            )}
            {mail.notitie_aantal > 0 && (
              <StickyNote className="h-3 w-3 text-amber-600" />
            )}
            {mail.toegewezen_naam && (
              <span className="text-[10px] px-1.5 py-0 rounded-full bg-blue-100 text-blue-800 truncate max-w-[100px]">
                {mail.toegewezen_naam}
              </span>
            )}
            {mail.samenwerkStatus === "wacht_op_antwoord" && (
              <span className="text-[10px] px-1.5 py-0 rounded-full bg-purple-100 text-purple-800">wacht</span>
            )}
            {mail.koppeling_aantal > 0 && (
              <LinkIcon className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Lege staat ───────────────────────────────────────────────────────────────

function LegeBoodschap({ icoon: Icoon, titel, tekst }: { icoon: React.ElementType; titel: string; tekst: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 gap-3">
      <Icoon className="h-10 w-10 text-muted-foreground/40" />
      <div>
        <p className="font-medium">{titel}</p>
        <p className="text-sm text-muted-foreground">{tekst}</p>
      </div>
    </div>
  );
}

// ─── Hoofdpagina ──────────────────────────────────────────────────────────────

export default function WerkInboxPagina() {
  const queryClient = useQueryClient();
  const [geselecteerdeMessageId, setGeselecteerdeMessageId] = useState<string | null>(null);
  const [zoekterm, setZoekterm] = useState("");
  const [filterOngelezen, setFilterOngelezen] = useState(false);
  const [filterBijlage, setFilterBijlage] = useState(false);
  const [filterMailbox, setFilterMailbox] = useState<string>("alle");
  const [filterVanMij, setFilterVanMij] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("alle");

  const { data: oauthStatus, isLoading: oauthLaden } = useQuery({
    queryKey: ["werk-inbox", "oauth-status"],
    queryFn: () => apiFetch<OAuthStatus>("/api/werk-inbox/oauth/status"),
  });

  // Mailboxen waar deze gebruiker toegang toe heeft (organisatiebezit, §3).
  const { data: mailboxen = [] } = useQuery({
    queryKey: ["werk-inbox", "mailboxen"],
    queryFn: () => apiFetch<Mailbox[]>("/api/werk-inbox/mailboxen"),
  });

  const mailsParams = new URLSearchParams();
  if (filterVanMij) mailsParams.set("toegewezen", "mij");
  if (filterStatus !== "alle") mailsParams.set("status", filterStatus);
  const { data: mails = [], isLoading: mailsLaden } = useQuery({
    queryKey: ["werk-inbox", "mails", filterVanMij, filterStatus],
    queryFn: () => apiFetch<MailItem[]>(`/api/werk-inbox/mails${mailsParams.size ? `?${mailsParams}` : ""}`),
    enabled: mailboxen.length > 0,
    // Kort pollen zodat wijzigingen van collega's zonder handmatige refresh zichtbaar zijn.
    refetchInterval: 15_000,
  });

  const syncMutatie = useMutation({
    mutationFn: () => apiFetch<{ gesynchroniseerd: number }>("/api/werk-inbox/sync", { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["werk-inbox", "mails"] });
    },
  });

  const ontkoppelMutatie = useMutation({
    mutationFn: () => apiFetch("/api/werk-inbox/oauth/ontkoppel", { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["werk-inbox", "oauth-status"] });
      setGeselecteerdeMessageId(null);
    },
  });

  if (oauthLaden) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Verbinding controleren...
      </div>
    );
  }

  // Zonder eigen Microsoft-koppeling én zonder toegang tot gedeelde mailboxen
  // valt er niets te tonen; met gedeelde toegang kan er wél gelezen worden.
  if (!oauthStatus?.gekoppeld && mailboxen.length === 0) {
    return <VerbindingsScherm />;
  }

  // Filter mails per tab
  const gefilterd = mails.filter((m) => {
    if (filterMailbox !== "alle" && m.mailboxAdres !== filterMailbox) return false;
    return true;
  }).filter((m) => {
    if (zoekterm) {
      const z = zoekterm.toLowerCase();
      if (
        !m.onderwerp.toLowerCase().includes(z) &&
        !(m.afzenderNaam ?? "").toLowerCase().includes(z) &&
        !m.afzenderEmail.toLowerCase().includes(z) &&
        !(m.snippet ?? "").toLowerCase().includes(z)
      ) return false;
    }
    if (filterOngelezen && m.isGelezenMs) return false;
    if (filterBijlage && !m.heeftBijlage) return false;
    return true;
  });

  const alleNietAfgehandeld = gefilterd.filter((m) => !m.afgehandeldOp);
  const aiVoorstellen = gefilterd.filter((m) => m.aiVoorstelJson && m.aiVoorstelJson !== "[]" && !m.afgehandeldOp);
  const actieVereist  = gefilterd.filter((m) => m.actieVereist && !m.afgehandeldOp);
  const afgehandeld   = gefilterd.filter((m) => !!m.afgehandeldOp);

  const ongelezen = mails.filter((m) => !m.isGelezenMs && !m.afgehandeldOp).length;

  function renderMailLijst(items: MailItem[], leegTitel: string, leegTekst: string) {
    if (mailsLaden) {
      return (
        <div className="flex items-center justify-center h-24 text-muted-foreground gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Laden...
        </div>
      );
    }
    if (items.length === 0) {
      return <LegeBoodschap icoon={Inbox} titel={leegTitel} tekst={leegTekst} />;
    }
    return items.map((m) => (
      <MailLijstItem
        key={m.messageId}
        mail={m}
        geselecteerd={geselecteerdeMessageId === m.messageId}
        onClick={() => setGeselecteerdeMessageId(
          geselecteerdeMessageId === m.messageId ? null : m.messageId,
        )}
      />
    ));
  }

  const herkoppelenNodig = oauthStatus?.gekoppeld === true && oauthStatus.herkoppelenNodig === true;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Koppeling met verouderde (smallere) rechten → opnieuw koppelen */}
      {herkoppelenNodig && (
        <div
          className="px-6 py-3 bg-amber-100 border-b border-amber-300 text-amber-900 flex items-center justify-between gap-4 shrink-0"
          data-testid="banner-herkoppelen"
        >
          <p className="text-sm">
            Uw Microsoft-koppeling heeft niet alle rechten die de werkinbox nodig heeft
            (o.a. versturen en verplaatsen van e-mail). Koppel uw account opnieuw om alle
            functies te gebruiken.
          </p>
          <Button
            size="sm"
            className="gap-2 h-8 shrink-0"
            onClick={() => { window.location.href = "/api/werk-inbox/oauth/start"; }}
            data-testid="knop-herkoppelen"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Opnieuw koppelen
          </Button>
        </div>
      )}
      {/* Paginaheader */}
      <div className="px-6 py-4 border-b flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <h1 data-paginatitel className="text-xl font-semibold">Werkinbox</h1>
          {ongelezen > 0 && (
            <Badge className="bg-primary text-primary-foreground">{ongelezen} ongelezen</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {mailboxen.length > 0 && (
            <Select value={filterMailbox} onValueChange={setFilterMailbox}>
              <SelectTrigger className="h-8 w-auto min-w-[180px] text-xs" data-testid="mailbox-filter">
                <Users className="h-3.5 w-3.5 mr-1 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle mailboxen</SelectItem>
                {mailboxen.map((mb) => (
                  <SelectItem key={mb.id} value={mb.emailAdres}>
                    {mb.label ?? mb.emailAdres}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {oauthStatus?.gekoppeld ? (
            <>
              <span className="text-xs text-muted-foreground hidden sm:block">{oauthStatus.email}</span>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 h-8"
                onClick={() => syncMutatie.mutate()}
                disabled={syncMutatie.isPending}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", syncMutatie.isPending && "animate-spin")} />
                Synchroniseer
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 h-8 text-muted-foreground"
                onClick={() => ontkoppelMutatie.mutate()}
                disabled={ontkoppelMutatie.isPending}
                title="Ontkoppel Microsoft 365"
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              className="gap-2 h-8"
              onClick={() => { window.location.href = "/api/werk-inbox/oauth/start"; }}
            >
              <Mail className="h-3.5 w-3.5" />
              Koppel Microsoft 365
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="alle" className="flex-1 flex flex-col overflow-hidden">
        {/* Tabs + filters */}
        <div className="border-b px-4 pt-2 shrink-0">
          <TabsList className="min-h-8 bg-transparent p-0 gap-0">
            {[
              { value: "alle", label: "Alle berichten", count: alleNietAfgehandeld.filter(m => !m.isGelezenMs).length },
              { value: "voorstellen", label: "AI Voorstellen", count: aiVoorstellen.length },
              { value: "actie", label: "Actie vereist", count: actieVereist.length },
              { value: "afgehandeld", label: "Afgehandeld", count: 0 },
            ].map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="h-8 px-4 text-sm rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-1.5"
              >
                {tab.label}
                {tab.count > 0 && (
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-xs h-4 px-1.5 min-w-4",
                      tab.value === "actie" && "bg-amber-100 text-amber-800",
                    )}
                  >
                    {tab.count}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Zoek + filters */}
          <div className="flex items-center gap-2 py-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={zoekterm}
                onChange={(e) => setZoekterm(e.target.value)}
                placeholder="Zoeken in berichten..."
                className="h-7 pl-8 text-xs"
              />
              {zoekterm && (
                <button
                  onClick={() => setZoekterm("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <Button
              variant={filterOngelezen ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setFilterOngelezen(!filterOngelezen)}
            >
              <Mail className="h-3 w-3" />
              Ongelezen
            </Button>
            <Button
              variant={filterBijlage ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setFilterBijlage(!filterBijlage)}
            >
              <Paperclip className="h-3 w-3" />
              Bijlagen
            </Button>
            <Button
              variant={filterVanMij ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setFilterVanMij(!filterVanMij)}
              data-testid="filter-van-mij"
            >
              <UserCheck className="h-3 w-3" />
              Aan mij toegewezen
            </Button>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-7 w-auto min-w-[130px] text-xs" data-testid="filter-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle statussen</SelectItem>
                {Object.entries(STATUS_LABELS).map(([w, s]) => (
                  <SelectItem key={w} value={w}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tab content */}
        {(["alle", "voorstellen", "actie", "afgehandeld"] as const).map((tab) => {
          const lijstItems =
            tab === "alle" ? alleNietAfgehandeld :
            tab === "voorstellen" ? aiVoorstellen :
            tab === "actie" ? actieVereist :
            afgehandeld;

          const leegTitel =
            tab === "alle" ? "Geen berichten" :
            tab === "voorstellen" ? "Geen AI voorstellen" :
            tab === "actie" ? "Geen acties vereist" :
            "Geen afgehandelde berichten";

          const leegTekst =
            tab === "alle" ? (zoekterm ? "Geen resultaten voor uw zoekopdracht." : "Synchroniseer om nieuwe berichten op te halen.") :
            tab === "voorstellen" ? "Klik op 'AI analyseer' bij een bericht om voorstellen te genereren." :
            tab === "actie" ? "Alle berichten zijn afgehandeld of vereisen geen actie." :
            "Berichten die u heeft afgehandeld verschijnen hier.";

          return (
            <TabsContent
              key={tab}
              value={tab}
              className="flex-1 flex overflow-hidden mt-0 border-0 data-[state=inactive]:hidden"
            >
              {/* Split panel */}
              <div className="w-80 shrink-0 border-r overflow-y-auto pb-14">
                {renderMailLijst(lijstItems, leegTitel, leegTekst)}
              </div>

              {/* Detail */}
              <div className="flex-1 flex overflow-hidden">
                {geselecteerdeMessageId ? (
                  <MailDetailView
                    key={geselecteerdeMessageId}
                    messageId={geselecteerdeMessageId}
                    mailboxen={mailboxen}
                    onSluiten={() => setGeselecteerdeMessageId(null)}
                  />
                ) : (
                  <LegeBoodschap
                    icoon={Inbox}
                    titel="Selecteer een bericht"
                    tekst="Klik op een bericht links om de inhoud te lezen."
                  />
                )}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
