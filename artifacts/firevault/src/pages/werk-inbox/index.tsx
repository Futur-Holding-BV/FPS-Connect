import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  useWerkInboxStatus,
  useWerkInboxMailboxen,
  useWerkInboxMails,
  useWerkInboxMailDetail,
  useSyncWerkInbox,
  useMarkeerWerkInboxGelezen,
  useMarkeerWerkInboxVerwerkt,
  useAddWerkInboxNotitie,
  useDeleteWerkInboxNotitie,
  useAddWerkInboxMailbox,
  useDeleteWerkInboxMailbox,
  useOntkoppelMicrosoft,
  useAddWerkInboxKoppeling,
  useDeleteWerkInboxKoppeling,
  type WerkInboxMail,
  type WerkInboxMailsFilter,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Mail,
  RefreshCw,
  MailOpen,
  CheckCircle2,
  Circle,
  Paperclip,
  Plus,
  Trash2,
  Link2,
  Unlink,
  ChevronDown,
  Inbox,
  AlertCircle,
  Loader2,
  Building,
  Users,
  FolderOpen,
  Calculator,
  CalendarDays,
  FileText,
  MoreHorizontal,
  X,
  StickyNote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDatum(dt: string | Date): string {
  const d = new Date(dt);
  const nu = new Date();
  const vandaag = d.toDateString() === nu.toDateString();
  if (vandaag) return d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  const gisteren = new Date(nu);
  gisteren.setDate(nu.getDate() - 1);
  if (d.toDateString() === gisteren.toDateString()) return "Gisteren";
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

function initialen(naam: string | null | undefined): string {
  if (!naam) return "?";
  return naam.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

const ENTITY_TYPE_LABELS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  klant:      { label: "Klant",      icon: Users },
  gebouw:     { label: "Gebouw",     icon: Building },
  project:    { label: "Project",    icon: FolderOpen },
  calculatie: { label: "Calculatie", icon: Calculator },
  planning:   { label: "Planning",   icon: CalendarDays },
  offerte:    { label: "Offerte",    icon: FileText },
};

// ─── Microsoft-koppelen scherm ────────────────────────────────────────────────

function MicrosoftKoppelenBanner({ onKoppel }: { onKoppel: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
        <Mail className="w-8 h-8 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-xl font-semibold mb-2">Mijn werk-inbox</h2>
        <p className="text-muted-foreground max-w-sm">
          Koppel je Microsoft 365-account om je werkmail en gedeelde mailboxen
          hier te bekijken. Je persoonlijke mail is alleen voor jou zichtbaar.
        </p>
      </div>
      <Button onClick={onKoppel} size="lg">
        <Mail className="mr-2 h-4 w-4" />
        Microsoft 365 koppelen
      </Button>
    </div>
  );
}

// ─── Mailbox-filter sidebar ───────────────────────────────────────────────────

interface MailboxFilterProps {
  eigenEmail: string;
  actieveMailbox: string | undefined;
  filter: WerkInboxMailsFilter;
  onFilterChange: (f: Partial<WerkInboxMailsFilter>) => void;
  onMailboxSelect: (adres: string | undefined) => void;
}

function MailboxFilter({ eigenEmail, actieveMailbox, filter, onFilterChange, onMailboxSelect }: MailboxFilterProps) {
  const { data: mailboxen = [] } = useWerkInboxMailboxen();
  const addMailbox     = useAddWerkInboxMailbox();
  const deleteMailbox  = useDeleteWerkInboxMailbox();
  const { toast }      = useToast();
  const [nieuwAdres, setNieuwAdres] = useState("");
  const [nieuwLabel, setNieuwLabel] = useState("");
  const [voegToe, setVoegToe]       = useState(false);

  function handleVoegToe() {
    if (!nieuwAdres.trim()) return;
    addMailbox.mutate(
      { emailAdres: nieuwAdres.trim(), label: nieuwLabel.trim() || undefined },
      {
        onSuccess: () => {
          setNieuwAdres("");
          setNieuwLabel("");
          setVoegToe(false);
          toast({ title: "Mailbox toegevoegd" });
        },
        onError: (err) => toast({ title: "Fout", description: err.message, variant: "destructive" }),
      },
    );
  }

  return (
    <div className="flex flex-col h-full border-r">
      <div className="p-3 border-b">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mailboxen</h3>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {/* Alle mailboxen */}
          <button
            onClick={() => { onMailboxSelect(undefined); onFilterChange({ mailbox: undefined }); }}
            className={cn(
              "w-full flex items-center gap-2 rounded px-2 py-1.5 text-sm text-left transition-colors",
              !actieveMailbox ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted",
            )}
          >
            <Inbox className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Alle mailboxen</span>
          </button>

          {/* Persoonlijke mailbox */}
          {eigenEmail && (
            <button
              onClick={() => onMailboxSelect(eigenEmail)}
              className={cn(
                "w-full flex items-center gap-2 rounded px-2 py-1.5 text-sm text-left transition-colors",
                actieveMailbox === eigenEmail ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted",
              )}
            >
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{eigenEmail}</span>
              <Badge variant="secondary" className="ml-auto text-[10px] px-1 shrink-0">Mijn</Badge>
            </button>
          )}

          {/* Gedeelde mailboxen */}
          {mailboxen.filter((m) => m.actief).map((m) => (
            <div key={m.id} className="flex items-center group">
              <button
                onClick={() => onMailboxSelect(m.email_adres)}
                className={cn(
                  "flex-1 flex items-center gap-2 rounded px-2 py-1.5 text-sm text-left transition-colors min-w-0",
                  actieveMailbox === m.email_adres ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted",
                )}
              >
                <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{m.label ?? m.email_adres}</span>
              </button>
              <button
                onClick={() => deleteMailbox.mutate(m.id)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>

        {/* Gedeelde mailbox toevoegen */}
        <div className="p-2 pt-0">
          {voegToe ? (
            <div className="space-y-1.5 p-2 border rounded-md bg-muted/30">
              <Input
                placeholder="adres@bedrijf.nl"
                value={nieuwAdres}
                onChange={(e) => setNieuwAdres(e.target.value)}
                className="h-7 text-xs"
                autoFocus
              />
              <Input
                placeholder="Label (optioneel)"
                value={nieuwLabel}
                onChange={(e) => setNieuwLabel(e.target.value)}
                className="h-7 text-xs"
              />
              <div className="flex gap-1">
                <Button
                  size="sm"
                  className="h-6 text-xs flex-1"
                  onClick={handleVoegToe}
                  disabled={addMailbox.isPending}
                >
                  {addMailbox.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Toevoegen"}
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setVoegToe(false)}>
                  Annuleer
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setVoegToe(true)}
              className="w-full flex items-center gap-1.5 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              <Plus className="h-3 w-3" />
              Gedeelde mailbox
            </button>
          )}
        </div>

        <Separator className="mx-2 mb-2" />
        <div className="p-2 space-y-0.5">
          <p className="text-xs text-muted-foreground px-2 mb-1">Filters</p>
          {[
            { key: "ongelezen", label: "Ongelezen" },
            { key: "vandaag",   label: "Vandaag" },
            { key: "bijlage",   label: "Met bijlage" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onFilterChange({ [key]: !filter[key as keyof WerkInboxMailsFilter] })}
              className={cn(
                "w-full flex items-center gap-2 rounded px-2 py-1.5 text-sm text-left transition-colors",
                filter[key as keyof WerkInboxMailsFilter] ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted",
              )}
            >
              {filter[key as keyof WerkInboxMailsFilter] ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              {label}
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Mail rij ────────────────────────────────────────────────────────────────

function MailRij({
  mail,
  isActief,
  onClick,
}: {
  mail: WerkInboxMail;
  isActief: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 border-b hover:bg-muted/50 transition-colors",
        isActief && "bg-primary/5 border-l-2 border-l-primary",
        !mail.is_gelezen_ms && "bg-blue-50/40 dark:bg-blue-950/20",
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5",
          mail.is_gelezen_ms ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground",
        )}>
          {initialen(mail.afzender_naam)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={cn("text-sm truncate", !mail.is_gelezen_ms && "font-semibold")}>
              {mail.afzender_naam ?? mail.afzender_email}
            </span>
            <span className="text-[11px] text-muted-foreground shrink-0">{formatDatum(mail.ontvangen_op)}</span>
          </div>
          <p className={cn("text-sm truncate", !mail.is_gelezen_ms ? "font-medium" : "text-muted-foreground")}>
            {mail.onderwerp || "(geen onderwerp)"}
          </p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{mail.snippet}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[10px] text-muted-foreground/70 truncate">{mail.mailbox_adres}</span>
            {mail.heeft_bijlage && <Paperclip className="h-2.5 w-2.5 text-muted-foreground/60 shrink-0" />}
            {mail.verwerkt_op && <CheckCircle2 className="h-2.5 w-2.5 text-green-600 shrink-0" />}
            {mail.notitie_aantal > 0 && (
              <span className="text-[10px] text-primary shrink-0">{mail.notitie_aantal} notitie{mail.notitie_aantal > 1 ? "s" : ""}</span>
            )}
            {mail.koppeling_aantal > 0 && (
              <Link2 className="h-2.5 w-2.5 text-primary/70 shrink-0" />
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Detailpanel ──────────────────────────────────────────────────────────────

function DetailPanel({ messageId, mailboxAdres }: { messageId: string; mailboxAdres: string }) {
  const { data, isLoading, isError } = useWerkInboxMailDetail(messageId);
  const markeerGelezen   = useMarkeerWerkInboxGelezen();
  const markeerVerwerkt  = useMarkeerWerkInboxVerwerkt();
  const addNotitie       = useAddWerkInboxNotitie();
  const deleteNotitie    = useDeleteWerkInboxNotitie();
  const deleteKoppeling  = useDeleteWerkInboxKoppeling();
  const addKoppeling     = useAddWerkInboxKoppeling();
  const { toast }        = useToast();
  const [notitie, setNotitie] = useState("");
  const [koppelingOpen, setKoppelingOpen] = useState(false);
  const [koppelingType, setKoppelingType] = useState("gebouw");
  const [koppelingId, setKoppelingId]     = useState("");
  const [koppelingLabel, setKoppelingLabel] = useState("");

  // Auto-markeer als gelezen bij openen
  useEffect(() => {
    if (data?.meta && !data.meta.is_gelezen_ms) {
      markeerGelezen.mutate({ messageId, isGelezen: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.meta?.message_id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Mail laden...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">Mail kon niet worden geladen.</p>
      </div>
    );
  }

  const { meta, inhoud, notities, koppelingen } = data;
  const isVerwerkt = !!meta.verwerkt_op;

  function handleNotitieOpslaan() {
    if (!notitie.trim()) return;
    addNotitie.mutate(
      { messageId, tekst: notitie.trim() },
      {
        onSuccess: () => { setNotitie(""); toast({ title: "Notitie opgeslagen" }); },
        onError: (err) => toast({ title: "Fout", description: err.message, variant: "destructive" }),
      },
    );
  }

  function handleKoppelingToevoegen() {
    const id = parseInt(koppelingId, 10);
    if (!koppelingId || isNaN(id)) {
      toast({ title: "Voer een geldig ID in", variant: "destructive" });
      return;
    }
    addKoppeling.mutate(
      { messageId, entityType: koppelingType, entityId: id, entityLabel: koppelingLabel.trim() || undefined },
      {
        onSuccess: () => {
          setKoppelingOpen(false);
          setKoppelingId("");
          setKoppelingLabel("");
          toast({ title: "Koppeling toegevoegd" });
        },
        onError: (err) => toast({ title: "Fout", description: err.message, variant: "destructive" }),
      },
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold leading-snug flex-1">
            {inhoud.subject || "(geen onderwerp)"}
          </h2>
          <div className="flex items-center gap-1 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => markeerGelezen.mutate({ messageId, isGelezen: !meta.is_gelezen_ms })}
                >
                  {meta.is_gelezen_ms ? <Mail className="h-3.5 w-3.5" /> : <MailOpen className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{meta.is_gelezen_ms ? "Markeer ongelezen" : "Markeer gelezen"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant={isVerwerkt ? "default" : "ghost"}
                  className="h-7 w-7"
                  onClick={() => markeerVerwerkt.mutate({ messageId, verwerkt: !isVerwerkt })}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isVerwerkt ? "Verwerkt — klik om ongedaan te maken" : "Markeer als verwerkt"}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="text-sm text-muted-foreground space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">
              {inhoud.from?.emailAddress?.name ?? inhoud.from?.emailAddress?.address ?? "Onbekend"}
            </span>
            <span className="text-xs">&lt;{inhoud.from?.emailAddress?.address}&gt;</span>
          </div>
          <div className="text-xs flex items-center gap-3 flex-wrap">
            <span>{new Date(inhoud.receivedDateTime).toLocaleString("nl-NL")}</span>
            <span className="text-muted-foreground/60">{mailboxAdres}</span>
            {inhoud.hasAttachments && (
              <span className="flex items-center gap-0.5"><Paperclip className="h-3 w-3" /> Bijlage</span>
            )}
          </div>
          {inhoud.toRecipients.length > 0 && (
            <p className="text-xs">
              Aan: {inhoud.toRecipients.map((r) => r.emailAddress.name || r.emailAddress.address).join(", ")}
            </p>
          )}
        </div>

        {isVerwerkt && (
          <Badge variant="secondary" className="text-green-700 bg-green-100 text-xs">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Verwerkt op {formatDatum(meta.verwerkt_op!)}
          </Badge>
        )}
      </div>

      {/* Mailbody */}
      <ScrollArea className="flex-1">
        <div className="px-6 py-4">
          {inhoud.body.contentType === "html" ? (
            <div
              className="prose prose-sm max-w-none text-sm [&_a]:text-primary [&_img]:max-w-full"
              dangerouslySetInnerHTML={{ __html: inhoud.body.content }}
            />
          ) : (
            <pre className="text-sm whitespace-pre-wrap font-sans">{inhoud.body.content}</pre>
          )}
        </div>

        <Separator className="mx-6" />

        {/* Notities */}
        <div className="px-6 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <StickyNote className="h-3.5 w-3.5" />
              Interne notities
              {notities.length > 0 && (
                <Badge variant="secondary" className="text-xs">{notities.length}</Badge>
              )}
            </h3>
          </div>

          {notities.map((n) => (
            <div key={n.id} className="group bg-amber-50 border border-amber-100 rounded-md p-3 text-sm relative">
              <p className="pr-6">{n.tekst}</p>
              <span className="text-xs text-muted-foreground">{formatDatum(n.aangemaakt_op)}</span>
              <button
                onClick={() => deleteNotitie.mutate({ id: n.id, messageId })}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          <div className="space-y-1.5">
            <Textarea
              placeholder="Interne notitie toevoegen..."
              value={notitie}
              onChange={(e) => setNotitie(e.target.value)}
              rows={2}
              className="text-sm resize-none"
            />
            <Button
              size="sm"
              onClick={handleNotitieOpslaan}
              disabled={!notitie.trim() || addNotitie.isPending}
              className="h-7 text-xs"
            >
              {addNotitie.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Notitie opslaan"}
            </Button>
          </div>
        </div>

        <Separator className="mx-6" />

        {/* Koppelingen */}
        <div className="px-6 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              Koppelingen
              {koppelingen.length > 0 && (
                <Badge variant="secondary" className="text-xs">{koppelingen.length}</Badge>
              )}
            </h3>
            <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setKoppelingOpen(true)}>
              <Plus className="h-3 w-3 mr-1" />
              Koppelen
            </Button>
          </div>

          {koppelingen.map((k) => {
            const info = ENTITY_TYPE_LABELS[k.entity_type];
            const Icon = info?.icon ?? Link2;
            return (
              <div key={k.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm group">
                <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">
                  <span className="text-muted-foreground text-xs">{info?.label ?? k.entity_type} — </span>
                  {k.entity_label ?? `#${k.entity_id}`}
                </span>
                <button
                  onClick={() => deleteKoppeling.mutate({ id: k.id, messageId })}
                  className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
                >
                  <Unlink className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}

          {koppelingen.length === 0 && (
            <p className="text-xs text-muted-foreground">Nog geen koppelingen. Koppel deze mail aan een gebouw, project of offerte.</p>
          )}
        </div>
      </ScrollArea>

      {/* Koppeling dialog */}
      <Dialog open={koppelingOpen} onOpenChange={setKoppelingOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Mail koppelen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Type</label>
              <select
                value={koppelingType}
                onChange={(e) => setKoppelingType(e.target.value)}
                className="w-full border rounded-md px-2 py-1.5 text-sm bg-background"
              >
                {Object.entries(ENTITY_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">ID</label>
              <Input
                placeholder="bijv. 42"
                value={koppelingId}
                onChange={(e) => setKoppelingId(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Label (optioneel)</label>
              <Input
                placeholder="bijv. Gebouw Rotterdam"
                value={koppelingLabel}
                onChange={(e) => setKoppelingLabel(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <Button className="w-full" onClick={handleKoppelingToevoegen} disabled={addKoppeling.isPending}>
              {addKoppeling.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
              Koppeling toevoegen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Hoofdpagina ──────────────────────────────────────────────────────────────

export default function WerkInboxPagina() {
  const [location]         = useLocation();
  const { data: status, isLoading: statusLaden } = useWerkInboxStatus();
  const sync               = useSyncWerkInbox();
  const ontkoppel          = useOntkoppelMicrosoft();
  const { toast }          = useToast();

  const [actieveMessageId, setActieveMessageId] = useState<string | null>(null);
  const [actieveMailboxAdres, setActieveMailboxAdres] = useState<string>("");
  const [actieveMailbox, setActieveMailbox]       = useState<string | undefined>(undefined);
  const [filter, setFilter] = useState<WerkInboxMailsFilter>({});

  const syncInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Lees URL params bij laden (ms_gekoppeld=1 of ms_error=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("ms_gekoppeld") === "1") {
      toast({ title: "Microsoft 365 gekoppeld", description: "Je mailbox wordt nu gesynchroniseerd." });
      // Verwijder query param
      window.history.replaceState({}, "", "/werk-inbox");
      // Trigger sync
      sync.mutate();
    } else if (params.get("ms_error")) {
      toast({
        title: "Microsoft koppeling mislukt",
        description: params.get("ms_error") ?? "Onbekende fout",
        variant: "destructive",
      });
      window.history.replaceState({}, "", "/werk-inbox");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-sync elke 5 minuten als Microsoft gekoppeld is
  useEffect(() => {
    if (!status?.gekoppeld) return;
    sync.mutate();
    syncInterval.current = setInterval(() => sync.mutate(), 5 * 60_000);
    return () => {
      if (syncInterval.current) clearInterval(syncInterval.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.gekoppeld]);

  const { data: mails = [], isLoading: mailsLaden, refetch } = useWerkInboxMails(
    status?.gekoppeld ? { ...filter, mailbox: actieveMailbox } : undefined,
  );

  function handleFilterChange(delta: Partial<WerkInboxMailsFilter>) {
    setFilter((prev) => ({ ...prev, ...delta }));
  }

  function handleMailboxSelect(adres: string | undefined) {
    setActieveMailbox(adres);
    setActieveMessageId(null);
  }

  function handleMailClick(mail: WerkInboxMail) {
    setActieveMessageId(mail.message_id);
    setActieveMailboxAdres(mail.mailbox_adres);
  }

  if (statusLaden) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!status?.gekoppeld) {
    return (
      <MicrosoftKoppelenBanner onKoppel={() => { window.location.href = "/api/werk-inbox/oauth/start"; }} />
    );
  }

  const ongelezenAantal = mails.filter((m) => !m.is_gelezen_ms).length;

  return (
    <div className="flex flex-col h-full">
      {/* Topbalk */}
      <div className="flex items-center justify-between px-6 py-3 border-b shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Mijn werk-inbox</h1>
          {ongelezenAantal > 0 && (
            <Badge className="bg-primary text-primary-foreground text-xs">{ongelezenAantal}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => sync.mutate(undefined, {
              onSuccess: (r) => {
                void refetch();
                toast({ title: `Gesynchroniseerd — ${r.totaal} berichten` });
              },
              onError: () => toast({ title: "Sync mislukt", variant: "destructive" }),
            })}
            disabled={sync.isPending}
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", sync.isPending && "animate-spin")} />
            Vernieuwen
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <span className="text-xs truncate max-w-[120px]">{status.email}</span>
                <ChevronDown className="ml-1.5 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="text-xs text-muted-foreground" disabled>
                {status.email}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => ontkoppel.mutate(undefined, {
                  onSuccess: () => toast({ title: "Microsoft account ontkoppeld" }),
                })}
              >
                <Unlink className="mr-2 h-3.5 w-3.5" />
                Ontkoppelen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Driekolommen */}
      <div className="flex flex-1 overflow-hidden">
        {/* Kolom 1 — Mailboxen + filters (220px) */}
        <div className="w-[220px] shrink-0">
          <MailboxFilter
            eigenEmail={status.email ?? ""}
            actieveMailbox={actieveMailbox}
            filter={filter}
            onFilterChange={handleFilterChange}
            onMailboxSelect={handleMailboxSelect}
          />
        </div>

        {/* Kolom 2 — Mail lijst (340px) */}
        <div className="w-[340px] shrink-0 border-r flex flex-col">
          <div className="px-4 py-2 border-b flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {mailsLaden ? "Laden..." : `${mails.length} berichten`}
            </span>
            {Object.values(filter).some(Boolean) && (
              <button
                onClick={() => setFilter({})}
                className="text-xs text-primary hover:underline"
              >
                Wis filters
              </button>
            )}
          </div>
          <ScrollArea className="flex-1">
            {mailsLaden ? (
              <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Berichten laden...
              </div>
            ) : mails.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                <Inbox className="h-8 w-8" />
                <p className="text-sm">Geen berichten gevonden.</p>
                {!sync.isPending && (
                  <button onClick={() => sync.mutate()} className="text-xs text-primary hover:underline">
                    Synchroniseer nu
                  </button>
                )}
              </div>
            ) : (
              mails.map((m) => (
                <MailRij
                  key={m.id}
                  mail={m}
                  isActief={actieveMessageId === m.message_id}
                  onClick={() => handleMailClick(m)}
                />
              ))
            )}
          </ScrollArea>
        </div>

        {/* Kolom 3 — Detailpanel */}
        <div className="flex-1 overflow-hidden">
          {actieveMessageId ? (
            <DetailPanel messageId={actieveMessageId} mailboxAdres={actieveMailboxAdres} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
              <MailOpen className="h-10 w-10" />
              <p className="text-sm">Selecteer een bericht om te lezen.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
