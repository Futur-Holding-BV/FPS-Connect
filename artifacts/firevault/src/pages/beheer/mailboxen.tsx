// ─── Beheer: gedeelde mailboxen (MAIL_01) ────────────────────────────────────
//
// Mailboxen zijn organisatiebezit. Hier beheert de hoofdbeheerder (of iemand
// met beheren-recht op een mailbox): adres/label, modus (verwerken |
// ondersteunen | registreren), Connect-toegang per collega, de werkelijke
// Exchange-toegang (alleen tonen — Connect beheert géén Exchange-rechten) en
// de reactietijd per mailbox.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import {
  Inbox, Plus, Trash2, Loader2, Users, ShieldCheck, ShieldAlert,
  ShieldQuestion, Clock, AlertTriangle, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Mailbox = {
  id: number;
  emailAdres: string;
  label: string | null;
  actief: boolean;
  volgorde: number;
  modus: "verwerken" | "ondersteunen" | "registreren";
  isFactuurmailbox: boolean;
  isAanvraagmailbox: boolean;
  recht: "lezen" | "behandelen" | "beheren";
};

type ToegangLid = {
  id: number;
  gebruikerId: number;
  recht: "lezen" | "behandelen" | "beheren";
  naam: string;
  email: string;
};

type Gebruiker = { id: number; naam: string; actief: boolean };

type ExchangeStatus = {
  leden: { gebruikerId: number; naam: string; connectRecht: string; exchange: "ok" | "geen_toegang" | "geen_token" | "fout" }[];
};

type Reactietijd = {
  gemiddeldeUren: number | null;
  aantalBeantwoord: number;
  ligtTeLang: number;
};

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (!resp.ok) throw new Error(await resp.text().catch(() => resp.statusText));
  return resp.json() as Promise<T>;
}

const MODUS_INFO: Record<Mailbox["modus"], { label: string; uitleg: string; cls: string }> = {
  verwerken:    { label: "Verwerken",    uitleg: "AI verwerkt automatisch (facturen/aanvragen)", cls: "bg-green-100 text-green-800" },
  ondersteunen: { label: "Ondersteunen", uitleg: "AI stelt voor, mens beslist — AI onderbreekt nooit", cls: "bg-blue-100 text-blue-800" },
  registreren:  { label: "Registreren",  uitleg: "Alleen archief — geen AI-analyse", cls: "bg-muted text-muted-foreground" },
};

const RECHT_LABELS: Record<string, string> = {
  lezen: "Lezen",
  behandelen: "Behandelen",
  beheren: "Beheren",
};

// ─── Toegangsbeheer per mailbox ───────────────────────────────────────────────

function ToegangSectie({ mailbox }: { mailbox: Mailbox }) {
  const queryClient = useQueryClient();
  const [nieuwGebruiker, setNieuwGebruiker] = useState<string>("");
  const [nieuwRecht, setNieuwRecht] = useState<string>("behandelen");

  const { data: leden = [], isLoading } = useQuery({
    queryKey: ["werk-inbox", "toegang", mailbox.id],
    queryFn: () => apiFetch<ToegangLid[]>(`/api/werk-inbox/mailboxen/${mailbox.id}/toegang`),
  });

  const { data: gebruikers = [] } = useQuery({
    queryKey: ["toewijsbare-gebruikers"],
    queryFn: () => apiFetch<Gebruiker[]>("/api/toewijsbare-gebruikers"),
    staleTime: 5 * 60_000,
  });

  const invalideer = () => {
    void queryClient.invalidateQueries({ queryKey: ["werk-inbox", "toegang", mailbox.id] });
    void queryClient.invalidateQueries({ queryKey: ["werk-inbox", "exchange", mailbox.id] });
  };

  const toevoegen = useMutation({
    mutationFn: (p: { gebruikerId: number; recht: string }) =>
      apiFetch(`/api/werk-inbox/mailboxen/${mailbox.id}/toegang`, {
        method: "POST",
        body: JSON.stringify(p),
      }),
    onSuccess: () => { invalideer(); setNieuwGebruiker(""); },
  });

  const verwijderen = useMutation({
    mutationFn: (gebruikerId: number) =>
      apiFetch(`/api/werk-inbox/mailboxen/${mailbox.id}/toegang/${gebruikerId}`, { method: "DELETE" }),
    onSuccess: invalideer,
  });

  const beschikbaar = gebruikers.filter((g) => g.actief && !leden.some((l) => l.gebruikerId === g.id));

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        <Users className="h-3 w-3" /> Connect-toegang
      </p>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <div className="space-y-1.5">
          {leden.map((l) => (
            <div key={l.id} className="flex items-center gap-2 text-sm" data-testid={`toegang-lid-${l.gebruikerId}`}>
              <span className="flex-1 truncate">{l.naam}</span>
              <Select
                value={l.recht}
                onValueChange={(recht) => toevoegen.mutate({ gebruikerId: l.gebruikerId, recht })}
              >
                <SelectTrigger className="h-7 w-[120px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RECHT_LABELS).map(([w, lbl]) => (
                    <SelectItem key={w} value={w}>{lbl}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => verwijderen.mutate(l.gebruikerId)}
                disabled={verwijderen.isPending}
                title="Toegang intrekken"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {leden.length === 0 && (
            <p className="text-xs text-muted-foreground">Nog niemand heeft toegang tot deze mailbox.</p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <Select value={nieuwGebruiker} onValueChange={setNieuwGebruiker}>
              <SelectTrigger className="h-7 flex-1 text-xs" data-testid={`toegang-nieuw-${mailbox.id}`}>
                <SelectValue placeholder="Collega toevoegen…" />
              </SelectTrigger>
              <SelectContent>
                {beschikbaar.map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>{g.naam}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={nieuwRecht} onValueChange={setNieuwRecht}>
              <SelectTrigger className="h-7 w-[120px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RECHT_LABELS).map(([w, lbl]) => (
                  <SelectItem key={w} value={w}>{lbl}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm" className="h-7 text-xs gap-1"
              disabled={!nieuwGebruiker || toevoegen.isPending}
              onClick={() => toevoegen.mutate({ gebruikerId: Number(nieuwGebruiker), recht: nieuwRecht })}
            >
              <Plus className="h-3 w-3" /> Toevoegen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Exchange-status (alleen tonen, §7) ───────────────────────────────────────

function ExchangeSectie({ mailboxId }: { mailboxId: number }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["werk-inbox", "exchange", mailboxId],
    queryFn: () => apiFetch<ExchangeStatus>(`/api/werk-inbox/mailboxen/${mailboxId}/exchange-status`),
    enabled: open,
    staleTime: 60_000,
  });

  const icoon = (s: string) =>
    s === "ok" ? <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
    : s === "geen_toegang" ? <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
    : <ShieldQuestion className="h-3.5 w-3.5 text-muted-foreground" />;

  const tekst: Record<string, string> = {
    ok: "heeft toegang in Exchange",
    geen_toegang: "GEEN toegang in Exchange — regel dit in Microsoft 365",
    geen_token: "geen Microsoft-koppeling in Connect (niet te controleren)",
    fout: "controle mislukt",
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" /> Werkelijke Exchange-toegang
        </p>
        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => { setOpen(true); void refetch(); }}>
          <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
          {open ? "Opnieuw controleren" : "Controleren"}
        </Button>
      </div>
      {open && !isLoading && data && (
        <div className="space-y-1">
          {data.leden.map((l) => (
            <div key={l.gebruikerId} className="flex items-center gap-2 text-xs">
              {icoon(l.exchange)}
              <span className="font-medium">{l.naam}</span>
              <span className="text-muted-foreground">{tekst[l.exchange]}</span>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground/80 pt-1">
            Connect beheert geen Exchange-rechten; toegang regelt u in Microsoft 365.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Reactietijd ──────────────────────────────────────────────────────────────

function ReactietijdSectie({ mailboxId }: { mailboxId: number }) {
  const { data } = useQuery({
    queryKey: ["werk-inbox", "reactietijd", mailboxId],
    queryFn: () => apiFetch<Reactietijd>(`/api/werk-inbox/mailboxen/${mailboxId}/reactietijd`),
    staleTime: 60_000,
  });
  if (!data) return null;
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <Clock className="h-3 w-3" />
        {data.gemiddeldeUren != null
          ? `Gem. reactietijd ${data.gemiddeldeUren} uur (30 dagen, ${data.aantalBeantwoord} beantwoord)`
          : "Nog geen beantwoorde mails in de laatste 30 dagen"}
      </span>
      {data.ligtTeLang > 0 && (
        <span className="flex items-center gap-1 text-amber-700 font-medium">
          <AlertTriangle className="h-3 w-3" />
          {data.ligtTeLang} bericht{data.ligtTeLang === 1 ? "" : "en"} ligt langer dan 48 uur open
        </span>
      )}
    </div>
  );
}

// ─── Hoofdpagina ──────────────────────────────────────────────────────────────

export default function MailboxenBeheer() {
  const queryClient = useQueryClient();
  const [nieuwAdres, setNieuwAdres] = useState("");
  const [nieuwLabel, setNieuwLabel] = useState("");
  const [foutmelding, setFoutmelding] = useState<string | null>(null);

  const { data: mailboxen = [], isLoading } = useQuery({
    queryKey: ["werk-inbox", "mailboxen"],
    queryFn: () => apiFetch<Mailbox[]>("/api/werk-inbox/mailboxen"),
  });

  const invalideer = () => {
    void queryClient.invalidateQueries({ queryKey: ["werk-inbox", "mailboxen"] });
  };

  const aanmaken = useMutation({
    mutationFn: () =>
      apiFetch("/api/werk-inbox/mailboxen", {
        method: "POST",
        body: JSON.stringify({ emailAdres: nieuwAdres.trim(), label: nieuwLabel.trim() || null }),
      }),
    onSuccess: () => { invalideer(); setNieuwAdres(""); setNieuwLabel(""); setFoutmelding(null); },
    onError: (e: Error) => setFoutmelding(e.message),
  });

  const bijwerken = useMutation({
    mutationFn: (p: { id: number; patch: Record<string, unknown> }) =>
      apiFetch(`/api/werk-inbox/mailboxen/${p.id}`, { method: "PATCH", body: JSON.stringify(p.patch) }),
    onSuccess: invalideer,
    onError: (e: Error) => setFoutmelding(e.message),
  });

  const verwijderen = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/werk-inbox/mailboxen/${id}`, { method: "DELETE" }),
    onSuccess: invalideer,
    onError: (e: Error) => setFoutmelding(e.message),
  });

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Inbox className="h-5 w-5" /> Gedeelde mailboxen
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Mailboxen zijn van de organisatie. Bepaal hier wie er in Connect bij kan,
          welke modus geldt en zie of de Exchange-toegang klopt.
        </p>
      </div>

      {foutmelding && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded px-3 py-2">
          {foutmelding}
        </div>
      )}

      {/* Nieuwe mailbox */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Mailbox toevoegen</CardTitle>
          <CardDescription className="text-xs">
            Het adres moet in Microsoft 365 bestaan; Connect regelt geen Exchange-toegang.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <Input
            value={nieuwAdres}
            onChange={(e) => setNieuwAdres(e.target.value)}
            placeholder="mailbox@fps-brandpreventie.nl"
            className="h-8 text-sm"
            data-testid="nieuw-mailbox-adres"
          />
          <Input
            value={nieuwLabel}
            onChange={(e) => setNieuwLabel(e.target.value)}
            placeholder="Label (optioneel)"
            className="h-8 text-sm max-w-[200px]"
          />
          <Button
            size="sm" className="h-8 gap-1 shrink-0"
            disabled={!nieuwAdres.includes("@") || aanmaken.isPending}
            onClick={() => aanmaken.mutate()}
            data-testid="nieuw-mailbox-opslaan"
          >
            <Plus className="h-3.5 w-3.5" /> Toevoegen
          </Button>
        </CardContent>
      </Card>

      {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}

      {mailboxen.map((mb) => (
        <Card key={mb.id} data-testid={`mailbox-kaart-${mb.id}`}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-sm flex items-center gap-2">
                  {mb.label ?? mb.emailAdres}
                  {!mb.actief && <Badge variant="outline" className="text-xs">Inactief</Badge>}
                  <span className={cn("text-xs px-2 py-0.5 rounded-full", MODUS_INFO[mb.modus].cls)}>
                    {MODUS_INFO[mb.modus].label}
                  </span>
                  {mb.isFactuurmailbox && <Badge variant="secondary" className="text-xs">Facturen</Badge>}
                  {mb.isAanvraagmailbox && <Badge variant="secondary" className="text-xs">Aanvragen</Badge>}
                </CardTitle>
                <CardDescription className="text-xs">{mb.emailAdres}</CardDescription>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Actief
                  <Switch
                    checked={mb.actief}
                    onCheckedChange={(actief) => bijwerken.mutate({ id: mb.id, patch: { actief } })}
                  />
                </label>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (window.confirm(`Mailbox ${mb.emailAdres} verwijderen? De mails blijven in Microsoft 365 staan.`)) {
                      verwijderen.mutate(mb.id);
                    }
                  }}
                  title="Mailbox verwijderen"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Select
                value={mb.modus}
                onValueChange={(modus) => bijwerken.mutate({ id: mb.id, patch: { modus } })}
              >
                <SelectTrigger className="h-8 w-auto min-w-[160px] text-xs" data-testid={`modus-select-${mb.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(MODUS_INFO) as Mailbox["modus"][]).map((m) => (
                    <SelectItem key={m} value={m}>
                      {MODUS_INFO[m].label} — {MODUS_INFO[m].uitleg}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">{MODUS_INFO[mb.modus].uitleg}</span>
            </div>
            {mb.modus === "verwerken" && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <label className="flex items-center gap-1.5">
                  <Switch
                    checked={mb.isFactuurmailbox}
                    onCheckedChange={(v) => bijwerken.mutate({ id: mb.id, patch: { isFactuurmailbox: v } })}
                  />
                  Factuurstroom
                </label>
                <label className="flex items-center gap-1.5">
                  <Switch
                    checked={mb.isAanvraagmailbox}
                    onCheckedChange={(v) => bijwerken.mutate({ id: mb.id, patch: { isAanvraagmailbox: v } })}
                  />
                  Aanvraagstroom
                </label>
              </div>
            )}
            <ReactietijdSectie mailboxId={mb.id} />
            <ToegangSectie mailbox={mb} />
            <ExchangeSectie mailboxId={mb.id} />
          </CardContent>
        </Card>
      ))}

      {!isLoading && mailboxen.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nog geen mailboxen. Voeg hierboven de eerste gedeelde mailbox toe.
        </p>
      )}
    </div>
  );
}
