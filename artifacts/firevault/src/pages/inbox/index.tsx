import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "wouter";
import {
  useGetInboxStats,
  useListInboxItems,
  useCreateInboxItem,
  useListWerkgevers,
  getListInboxItemsQueryKey,
  getGetInboxStatsQueryKey,
} from "@workspace/api-client-react";
import type { InboxItem, InboxOfferteverwerkingResultaat } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Inbox, Plus, FileText, Clock, CheckCircle2, XCircle, ArrowRight,
  AlertTriangle, Sparkles, ChevronRight, Upload, Building2, Mail,
  Paperclip, X, CheckCircle, ExternalLink,
} from "lucide-react";

const STATUS_KLEUR: Record<string, string> = {
  nieuw: "bg-blue-100 text-blue-700 border-blue-200",
  geanalyseerd: "bg-amber-100 text-amber-700 border-amber-200",
  ter_beoordeling: "bg-purple-100 text-purple-700 border-purple-200",
  goedgekeurd: "bg-emerald-100 text-emerald-700 border-emerald-200",
  verplaatst: "bg-gray-100 text-gray-600 border-gray-200",
  afgewezen: "bg-red-100 text-red-700 border-red-200",
};

const STATUS_LABEL: Record<string, string> = {
  nieuw: "Nieuw",
  geanalyseerd: "Geanalyseerd",
  ter_beoordeling: "Ter beoordeling",
  goedgekeurd: "Goedgekeurd",
  verplaatst: "Verplaatst",
  afgewezen: "Afgewezen",
};

const BETROUW_KLEUR: Record<string, string> = {
  hoog: "bg-emerald-100 text-emerald-700",
  midden: "bg-amber-100 text-amber-700",
  laag: "bg-red-100 text-red-600",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type AanvraagStap = "werkmaatschappij" | "upload" | "verwerken" | "resultaat";

interface AanvraagState {
  stap: AanvraagStap;
  werkmaatschappijId: string;
  emailBestand: File | null;
  bijlagen: File[];
  resultaat: InboxOfferteverwerkingResultaat | null;
  fout: string | null;
}

const ACCEPTEER_EMAIL = ".eml,.msg,.pdf,.docx,.doc,.txt";
const ACCEPTEER_BIJLAGEN = ".pdf,.docx,.doc,.xlsx,.xls,.jpg,.jpeg,.png,.eml,.msg";

export default function InboxPagina() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [registrerenOpen, setRegistrerenOpen] = useState(false);
  const [velden, setVelden] = useState({ bestandsnaam: "", mimetype: "application/pdf", bestandsgrootte: "", opmerkingen: "" });

  const [aanvraagOpen, setAanvraagOpen] = useState(false);
  const [aanvraag, setAanvraag] = useState<AanvraagState>({
    stap: "werkmaatschappij",
    werkmaatschappijId: "",
    emailBestand: null,
    bijlagen: [],
    resultaat: null,
    fout: null,
  });
  const [dropActief, setDropActief] = useState(false);
  const [paginaDragActief, setPaginaDragActief] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const bijlagenInputRef = useRef<HTMLInputElement>(null);
  const paginaInputRef = useRef<HTMLInputElement>(null);
  const registreerInputRef = useRef<HTMLInputElement>(null);

  const { data: stats } = useGetInboxStats();
  const { data: items = [], isLoading } = useListInboxItems(statusFilter && statusFilter !== "open" && statusFilter !== "alle" ? { status: statusFilter } : {});
  const { data: werkgevers = [] } = useListWerkgevers();
  const registreer = useCreateInboxItem();

  const openStatussen = ["nieuw", "geanalyseerd", "ter_beoordeling"];
  const gefilterd = statusFilter === "open"
    ? (items as InboxItem[]).filter((i) => openStatussen.includes(i.status))
    : statusFilter === "alle" ? (items as InboxItem[]) : (items as InboxItem[]).filter((i) => i.status === statusFilter);

  async function handleRegistreren() {
    if (!velden.bestandsnaam.trim()) { toast({ title: "Bestandsnaam is verplicht", variant: "destructive" }); return; }
    try {
      await registreer.mutateAsync({ data: { bestandsnaam: velden.bestandsnaam, mimetype: velden.mimetype || undefined, bestandsgrootte: velden.bestandsgrootte ? parseInt(velden.bestandsgrootte) : undefined, opmerkingen: velden.opmerkingen || undefined } });
      await qc.invalidateQueries({ queryKey: getListInboxItemsQueryKey() });
      await qc.invalidateQueries({ queryKey: getGetInboxStatsQueryKey() });
      setRegistrerenOpen(false);
      setVelden({ bestandsnaam: "", mimetype: "application/pdf", bestandsgrootte: "", opmerkingen: "" });
      toast({ title: "Document geregistreerd — AI-classificatie uitgevoerd" });
    } catch {
      toast({ title: "Fout bij registreren", variant: "destructive" });
    }
  }

  function resetAanvraag() {
    setAanvraag({ stap: "werkmaatschappij", werkmaatschappijId: "", emailBestand: null, bijlagen: [], resultaat: null, fout: null });
    setDropActief(false);
  }

  function verwerkPaginaDrop(bestanden: FileList | File[]) {
    const lijst = Array.from(bestanden);
    if (lijst.length === 0) return;
    const eerste = lijst[0];
    const naam = eerste.name.toLowerCase();
    const isEmail = naam.endsWith(".eml") || naam.endsWith(".msg") || eerste.type === "message/rfc822";
    if (isEmail) {
      resetAanvraag();
      setAanvraag((a) => ({ ...a, emailBestand: eerste, bijlagen: lijst.slice(1) }));
      setAanvraagOpen(true);
    } else {
      const ext = naam.split(".").pop() ?? "";
      const mimeMap: Record<string, string> = {
        pdf: "application/pdf",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xls: "application/vnd.ms-excel",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        txt: "text/plain",
      };
      setVelden({
        bestandsnaam: eerste.name,
        mimetype: eerste.type || mimeMap[ext] || "application/octet-stream",
        bestandsgrootte: String(eerste.size),
        opmerkingen: "",
      });
      setRegistrerenOpen(true);
    }
  }

  useEffect(() => {
    let teller = 0;
    function onDragEnter(e: DragEvent) {
      if (e.dataTransfer?.types.includes("Files")) { teller++; setPaginaDragActief(true); }
    }
    function onDragLeave() {
      teller = Math.max(0, teller - 1);
      if (teller === 0) setPaginaDragActief(false);
    }
    function onDragOver(e: DragEvent) { e.preventDefault(); }
    function onDrop(e: DragEvent) {
      e.preventDefault();
      teller = 0;
      setPaginaDragActief(false);
      if (e.dataTransfer?.files?.length) verwerkPaginaDrop(e.dataTransfer.files);
    }
    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aanvraagOpen, registrerenOpen]);

  function sluitAanvraag() {
    setAanvraagOpen(false);
    resetAanvraag();
  }

  const onEmailDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDropActief(false);
    const bestand = e.dataTransfer.files[0];
    if (bestand) setAanvraag((a) => ({ ...a, emailBestand: bestand }));
  }, []);

  const onBijlagenDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const nieuw = Array.from(e.dataTransfer.files);
    setAanvraag((a) => ({ ...a, bijlagen: [...a.bijlagen, ...nieuw] }));
  }, []);

  async function verwerkAanvraag() {
    if (!aanvraag.werkmaatschappijId) return;
    setAanvraag((a) => ({ ...a, stap: "verwerken", fout: null }));

    try {
      const form = new FormData();
      form.append("werkmaatschappij_id", aanvraag.werkmaatschappijId);
      if (aanvraag.emailBestand) form.append("email", aanvraag.emailBestand);
      for (const b of aanvraag.bijlagen) form.append("bijlagen", b);

      const resp = await fetch("/api/inbox/offerte-aanvraag", {
        method: "POST",
        body: form,
        credentials: "include",
      });

      if (!resp.ok) {
        const foutData = await resp.json().catch(() => ({ error: "Onbekende fout" }));
        throw new Error((foutData as { error?: string }).error ?? "Verwerken mislukt");
      }

      const resultaat = await resp.json() as InboxOfferteverwerkingResultaat;
      setAanvraag((a) => ({ ...a, stap: "resultaat", resultaat }));
      await qc.invalidateQueries({ queryKey: getListInboxItemsQueryKey() });
      await qc.invalidateQueries({ queryKey: getGetInboxStatsQueryKey() });
    } catch (err) {
      setAanvraag((a) => ({ ...a, stap: "upload", fout: err instanceof Error ? err.message : "Verwerken mislukt" }));
    }
  }

  const statsItems = [
    { label: "Open", waarde: (stats?.nieuw ?? 0) + (stats?.ter_beoordeling ?? 0), icon: Clock, kleur: "text-blue-600" },
    { label: "Ter beoordeling", waarde: stats?.ter_beoordeling ?? 0, icon: AlertTriangle, kleur: "text-purple-600" },
    { label: "Goedgekeurd", waarde: stats?.goedgekeurd ?? 0, icon: CheckCircle2, kleur: "text-emerald-600" },
    { label: "Snagstream", waarde: stats?.snagstream_rapporten ?? 0, icon: FileText, kleur: "text-orange-600" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Page-level drag overlay */}
      {paginaDragActief && (
        <div className="fixed inset-0 z-50 bg-primary/10 border-4 border-dashed border-primary rounded-2xl pointer-events-none flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-lg px-10 py-8 flex flex-col items-center gap-3">
            <Upload className="w-12 h-12 text-primary" />
            <p className="text-lg font-semibold text-primary">Loslaten om te uploaden</p>
            <p className="text-sm text-muted-foreground">E-mailbestand (.eml/.msg) → offerte-aanvraag<br />Overig bestand → document registreren</p>
          </div>
        </div>
      )}

      {/* Hidden file input for drop zone click */}
      <input
        ref={paginaInputRef}
        type="file"
        className="hidden"
        multiple
        onChange={(e) => { if (e.target.files?.length) verwerkPaginaDrop(e.target.files); e.target.value = ""; }}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Inbox className="w-6 h-6" /> Slim Uploadpunt
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Centraal documentinstroompunt met AI-classificatie</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { resetAanvraag(); setAanvraagOpen(true); }} className="gap-2">
            <Mail className="w-4 h-4" /> Offerte-aanvraag
          </Button>
          <Button onClick={() => setRegistrerenOpen(true)} className="gap-2">
            <Upload className="w-4 h-4" /> Document registreren
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statsItems.map(({ label, waarde, icon: Icon, kleur }) => (
            <Card key={label}>
              <CardContent className="p-4 flex items-center gap-3">
                <Icon className={`w-8 h-8 ${kleur} opacity-80`} />
                <div>
                  <p className="text-2xl font-bold">{waarde}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {[
          { value: "open", label: "Open" },
          { value: "alle", label: "Alles" },
          { value: "nieuw", label: "Nieuw" },
          { value: "geanalyseerd", label: "Geanalyseerd" },
          { value: "ter_beoordeling", label: "Ter beoordeling" },
          { value: "goedgekeurd", label: "Goedgekeurd" },
          { value: "verplaatst", label: "Verplaatst" },
          { value: "afgewezen", label: "Afgewezen" },
        ].map((f) => (
          <Button key={f.value} variant={statusFilter === f.value ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setStatusFilter(f.value)}>
            {f.label}
            {f.value === "open" && stats && (stats.nieuw + stats.ter_beoordeling) > 0 && (
              <span className="ml-1 bg-white/20 text-white rounded-full px-1.5 text-xs font-semibold">
                {stats.nieuw + stats.ter_beoordeling}
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* Zichtbare sleep-zone */}
      <div
        className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
        onClick={() => paginaInputRef.current?.click()}
      >
        <Upload className="w-8 h-8 mx-auto text-muted-foreground opacity-40 mb-2" />
        <p className="text-sm font-medium text-muted-foreground">Sleep een bestand hierin of klik om te kiezen</p>
        <p className="text-xs text-muted-foreground mt-1 opacity-70">
          E-mail (.eml, .msg) → offerte-aanvraag &nbsp;·&nbsp; Overig bestand → document registreren
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : gefilterd.length === 0 ? (
        <div className="text-center py-16">
          <Inbox className="w-10 h-10 mx-auto text-muted-foreground opacity-40 mb-3" />
          <p className="text-sm text-muted-foreground">Geen items in dit filter.</p>
          <div className="flex gap-2 justify-center mt-3">
            <Button variant="outline" size="sm" onClick={() => { resetAanvraag(); setAanvraagOpen(true); }}>
              <Mail className="w-3.5 h-3.5 mr-1.5" /> Offerte-aanvraag
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRegistrerenOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Document registreren
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {gefilterd.map((item) => (
            <Link key={item.id} href={`/inbox/${item.id}`}>
              <Card className="cursor-pointer hover:shadow-sm hover:border-primary/30 transition-all">
                <CardContent className="p-4 flex items-start gap-4">
                  <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    {item.document_categorie === "offerte_aanvraag"
                      ? <Mail className="w-4 h-4 text-primary" />
                      : <FileText className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate max-w-xs">{item.bestandsnaam}</span>
                      <Badge variant="outline" className={`text-xs border shrink-0 ${STATUS_KLEUR[item.status] ?? ""}`}>
                        {STATUS_LABEL[item.status] ?? item.status}
                      </Badge>
                      {item.document_categorie === "offerte_aanvraag" && (
                        <Badge variant="outline" className="text-xs border shrink-0 bg-orange-50 text-orange-700 border-orange-200">
                          Offerte-aanvraag
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {item.document_categorie && item.document_categorie !== "onbekend" && item.document_categorie !== "offerte_aanvraag" && (
                        <span className="text-xs text-muted-foreground">{item.document_categorie.replace(/_/g, " ")}</span>
                      )}
                      {item.bestemming && item.bestemming !== "Onbekend" && (
                        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                          <ArrowRight className="w-3 h-3" />{item.bestemming}
                        </span>
                      )}
                      {item.ai_betrouwbaarheid && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1 ${BETROUW_KLEUR[item.ai_betrouwbaarheid] ?? ""}`}>
                          <Sparkles className="w-3 h-3" />{item.ai_betrouwbaarheid}
                        </span>
                      )}
                      {item.bestandsgrootte && (
                        <span className="text-xs text-muted-foreground">{formatBytes(item.bestandsgrootte)}</span>
                      )}
                    </div>
                    {item.ai_samenvatting && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{item.ai_samenvatting}</p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* ── OFFERTE-AANVRAAG DIALOG ──────────────────────────────────────────── */}
      <Dialog open={aanvraagOpen} onOpenChange={(open) => { if (!open) sluitAanvraag(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary" /> Offerte-aanvraag verwerken
            </DialogTitle>
          </DialogHeader>

          {/* Stap 1 — Werkmaatschappij */}
          {aanvraag.stap === "werkmaatschappij" && (
            <div className="space-y-4">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-xs text-orange-800">
                <p className="font-medium flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Werkmaatschappij selecteren</p>
                <p className="mt-1">Kies eerst welke werkmaatschappij deze aanvraag in behandeling neemt. AI verwerkt de e-mail daarna automatisch.</p>
              </div>
              <div>
                <Label>Werkmaatschappij <span className="text-destructive">*</span></Label>
                <Select value={aanvraag.werkmaatschappijId} onValueChange={(v) => setAanvraag((a) => ({ ...a, werkmaatschappijId: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecteer werkmaatschappij..." />
                  </SelectTrigger>
                  <SelectContent>
                    {werkgevers.map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>{w.naam}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {werkgevers.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">Geen werkmaatschappijen gevonden. Voeg ze toe via HRM.</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={sluitAanvraag}>Annuleren</Button>
                <Button disabled={!aanvraag.werkmaatschappijId} onClick={() => setAanvraag((a) => ({ ...a, stap: "upload" }))}>
                  Volgende
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Stap 2 — Upload */}
          {aanvraag.stap === "upload" && (
            <div className="space-y-4">
              {aanvraag.fout && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800 flex items-start gap-2">
                  <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{aanvraag.fout}</span>
                </div>
              )}

              {/* E-mail uploaden */}
              <div>
                <Label className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> E-mail (offerte-aanvraag)</Label>
                <div
                  className={`mt-1 border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${dropActief ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                  onDragOver={(e) => { e.preventDefault(); setDropActief(true); }}
                  onDragLeave={() => setDropActief(false)}
                  onDrop={onEmailDrop}
                  onClick={() => emailInputRef.current?.click()}
                >
                  <input
                    ref={emailInputRef}
                    type="file"
                    accept={ACCEPTEER_EMAIL}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setAanvraag((a) => ({ ...a, emailBestand: f }));
                    }}
                  />
                  {aanvraag.emailBestand ? (
                    <div className="flex items-center justify-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-primary" />
                      <span className="font-medium truncate max-w-[220px]">{aanvraag.emailBestand.name}</span>
                      <span className="text-muted-foreground text-xs">({formatBytes(aanvraag.emailBestand.size)})</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setAanvraag((a) => ({ ...a, emailBestand: null })); }}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      <Upload className="w-6 h-6 mx-auto mb-1 opacity-50" />
                      <p className="text-xs">Sleep of klik om e-mail te uploaden</p>
                      <p className="text-xs opacity-60 mt-0.5">.eml, .msg, .pdf, .docx, .txt</p>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Geen e-mail? AI verwerkt dan alleen de bijlagen en opmerkingen.</p>
              </div>

              {/* Bijlagen */}
              <div>
                <Label className="flex items-center gap-1.5"><Paperclip className="w-3.5 h-3.5" /> Bijlagen <span className="text-muted-foreground font-normal">(optioneel)</span></Label>
                <div
                  className="mt-1 border border-dashed border-border rounded-lg p-3 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={onBijlagenDrop}
                  onClick={() => bijlagenInputRef.current?.click()}
                >
                  <input
                    ref={bijlagenInputRef}
                    type="file"
                    accept={ACCEPTEER_BIJLAGEN}
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const bestanden = Array.from(e.target.files ?? []);
                      setAanvraag((a) => ({ ...a, bijlagen: [...a.bijlagen, ...bestanden] }));
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Sleep bijlagen of klik</p>
                </div>
                {aanvraag.bijlagen.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {aanvraag.bijlagen.map((b, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1">
                        <Paperclip className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="truncate flex-1">{b.name}</span>
                        <span className="text-muted-foreground shrink-0">{formatBytes(b.size)}</span>
                        <button
                          onClick={() => setAanvraag((a) => ({ ...a, bijlagen: a.bijlagen.filter((_, j) => j !== i) }))}
                          className="text-muted-foreground hover:text-destructive shrink-0"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setAanvraag((a) => ({ ...a, stap: "werkmaatschappij", fout: null }))}>
                  Terug
                </Button>
                <Button onClick={verwerkAanvraag} className="gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> AI laten verwerken
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Stap 3 — Verwerken */}
          {aanvraag.stap === "verwerken" && (
            <div className="py-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center mx-auto animate-pulse">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-medium">AI analyseert de aanvraag...</p>
                <p className="text-sm text-muted-foreground mt-1">E-mail wordt gelezen en verwerkt. Even geduld.</p>
              </div>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <p>Opdrachtgever en adres extraheren</p>
                <p>Gevraagde werkzaamheden samenvatten</p>
                <p>Offerte en gebouw aanmaken</p>
              </div>
            </div>
          )}

          {/* Stap 4 — Resultaat */}
          {aanvraag.stap === "resultaat" && aanvraag.resultaat && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-emerald-800 text-sm">Aanvraag verwerkt</p>
                  {aanvraag.resultaat.ai_samenvatting && (
                    <p className="text-xs text-emerald-700 mt-1">{aanvraag.resultaat.ai_samenvatting}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {aanvraag.resultaat.aangemaakt?.offerte && aanvraag.resultaat.offerte_id && (
                  <a
                    href={`/offertes/${aanvraag.resultaat.offerte_id}`}
                    className="flex items-center justify-between p-3 rounded-lg border hover:border-primary/40 hover:bg-muted/30 transition-colors group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded bg-orange-100 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Offerte aangemaakt</p>
                        <p className="text-xs text-muted-foreground">{aanvraag.resultaat.offerte_titel}</p>
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                  </a>
                )}

                {aanvraag.resultaat.aangemaakt?.gebouw && aanvraag.resultaat.gebouw_id && (
                  <Link href={`/gebouwen/${aanvraag.resultaat.gebouw_id}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg border hover:border-primary/40 hover:bg-muted/30 transition-colors group cursor-pointer">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center">
                          <Building2 className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Gebouw aangemaakt</p>
                          <p className="text-xs text-muted-foreground">{aanvraag.resultaat.gebouw_naam}</p>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                    </div>
                  </Link>
                )}

                {aanvraag.resultaat.aangemaakt?.opname && aanvraag.resultaat.opname_id && (
                  <Link href={`/opname/${aanvraag.resultaat.opname_id}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg border hover:border-primary/40 hover:bg-muted/30 transition-colors group cursor-pointer">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded bg-purple-100 flex items-center justify-center">
                          <CheckCircle2 className="w-4 h-4 text-purple-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Opname ingepland</p>
                          <p className="text-xs text-muted-foreground">Veldopname klaar om in te vullen</p>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                    </div>
                  </Link>
                )}

                <Link href={`/inbox/${aanvraag.resultaat.inbox_item.id}`}>
                  <div className="flex items-center justify-between p-3 rounded-lg border hover:border-primary/40 hover:bg-muted/30 transition-colors group cursor-pointer">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                        <Inbox className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Inbox-item bekijken</p>
                        <p className="text-xs text-muted-foreground">{aanvraag.resultaat.inbox_item.bestandsnaam}</p>
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                  </div>
                </Link>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={sluitAanvraag}>Sluiten</Button>
                <Button onClick={() => { resetAanvraag(); setAanvraagOpen(true); }} className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Nieuwe aanvraag
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── DOCUMENT REGISTREREN DIALOG ─────────────────────────────────────── */}
      <Dialog open={registrerenOpen} onOpenChange={setRegistrerenOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-4 h-4" /> Document registreren
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Bestandskiezer */}
            <input
              ref={registreerInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
                const mimeMap: Record<string, string> = {
                  pdf: "application/pdf", doc: "application/msword",
                  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                  xls: "application/vnd.ms-excel",
                  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", txt: "text/plain",
                  eml: "message/rfc822", msg: "application/vnd.ms-outlook",
                };
                setVelden((v) => ({
                  ...v,
                  bestandsnaam: f.name,
                  mimetype: f.type || mimeMap[ext] || "application/octet-stream",
                  bestandsgrootte: String(f.size),
                }));
                e.target.value = "";
              }}
            />
            <div
              className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
              onClick={() => registreerInputRef.current?.click()}
            >
              {velden.bestandsnaam ? (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="font-medium truncate max-w-[260px]">{velden.bestandsnaam}</span>
                  {velden.bestandsgrootte && (
                    <span className="text-muted-foreground text-xs">({formatBytes(parseInt(velden.bestandsgrootte))})</span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setVelden((v) => ({ ...v, bestandsnaam: "", bestandsgrootte: "" })); }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="text-muted-foreground">
                  <Upload className="w-6 h-6 mx-auto mb-1 opacity-50" />
                  <p className="text-xs">Sleep een bestand of klik om te kiezen</p>
                  <p className="text-xs opacity-60 mt-0.5">Bestandsnaam en type worden automatisch ingevuld</p>
                </div>
              )}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              <p className="font-medium flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> AI-classificatie</p>
              <p className="mt-1">Na registratie analyseert het systeem de bestandsnaam automatisch en stelt een categorie en bestemming voor.</p>
            </div>
            <div>
              <Label>Bestandsnaam <span className="text-destructive">*</span></Label>
              <Input
                value={velden.bestandsnaam}
                onChange={(e) => setVelden((v) => ({ ...v, bestandsnaam: e.target.value }))}
                className="mt-1"
                placeholder="bijv. snagstream_rapport_2026.pdf"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Bestandstype</Label>
                <Select value={velden.mimetype} onValueChange={(val) => setVelden((v) => ({ ...v, mimetype: val }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="application/pdf">PDF</SelectItem>
                    <SelectItem value="application/msword">Word (.doc)</SelectItem>
                    <SelectItem value="application/vnd.openxmlformats-officedocument.wordprocessingml.document">Word (.docx)</SelectItem>
                    <SelectItem value="application/vnd.ms-excel">Excel (.xls)</SelectItem>
                    <SelectItem value="image/jpeg">Afbeelding (JPG)</SelectItem>
                    <SelectItem value="image/png">Afbeelding (PNG)</SelectItem>
                    <SelectItem value="message/rfc822">E-mail (.eml)</SelectItem>
                    <SelectItem value="application/vnd.ms-outlook">E-mail (.msg)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Bestandsgrootte (bytes)</Label>
                <Input value={velden.bestandsgrootte} onChange={(e) => setVelden((v) => ({ ...v, bestandsgrootte: e.target.value }))} className="mt-1" type="number" placeholder="Optioneel" />
              </div>
            </div>
            <div>
              <Label>Opmerkingen</Label>
              <Textarea value={velden.opmerkingen} onChange={(e) => setVelden((v) => ({ ...v, opmerkingen: e.target.value }))} className="mt-1" rows={2} placeholder="Optionele context voor de beoordelaar..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegistrerenOpen(false)}>Annuleren</Button>
            <Button onClick={handleRegistreren} disabled={registreer.isPending} className="gap-1.5">
              {registreer.isPending ? "Analyseren..." : <><Upload className="w-3.5 h-3.5" /> Registreren</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
