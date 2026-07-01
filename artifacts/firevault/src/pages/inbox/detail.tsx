import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetInboxItem,
  useUpdateInboxItem,
  useGoedkeurenInboxItem,
  useAfwijzenInboxItem,
  useVerplaatsenInboxItem,
  useTerBeoordelingInboxItem,
  getGetInboxItemQueryKey,
  getListInboxItemsQueryKey,
  getGetInboxStatsQueryKey,
  useListCrmKlanten,
} from "@workspace/api-client-react";
import type { InboxItem } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ArrowLeft, Sparkles, CheckCircle2, XCircle, ArrowRight,
  FileText, Clock, AlertTriangle, History, Edit2,
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
  nieuw: "Nieuw", geanalyseerd: "Geanalyseerd", ter_beoordeling: "Ter beoordeling",
  goedgekeurd: "Goedgekeurd", verplaatst: "Verplaatst", afgewezen: "Afgewezen",
};
const BETROUW_KLEUR: Record<string, string> = {
  hoog: "bg-emerald-100 text-emerald-700 border-emerald-200",
  midden: "bg-amber-100 text-amber-700 border-amber-200",
  laag: "bg-red-100 text-red-600 border-red-200",
};

const BESTEMMINGEN = [
  "Gebouwen", "Projecten", "Opnames", "Calculaties", "Offertes", "Uitvoering",
  "Oplevering", "Onderhoud", "Productbibliotheek", "Certificaten", "Financieel",
  "HRM", "Wagenpark", "CRM", "DMS", "Snagstream", "Onbekend",
];

export default function InboxDetailPagina() {
  const { id } = useParams<{ id: string }>();
  const numId = parseInt(id ?? "0");
  const qc = useQueryClient();
  const { toast } = useToast();

  const [afwijzenOpen, setAfwijzenOpen] = useState(false);
  const [verplaatsenOpen, setVerplaatsenOpen] = useState(false);
  const [bewerkOpen, setBewerkOpen] = useState(false);
  const [afwijzenReden, setAfwijzenReden] = useState("");
  const [doelBestemming, setDoelBestemming] = useState("");

  const { data: item, isLoading } = useGetInboxItem(numId);
  const goedkeuren = useGoedkeurenInboxItem();
  const afwijzen = useAfwijzenInboxItem();
  const verplaatsen = useVerplaatsenInboxItem();
  const terBeoordeling = useTerBeoordelingInboxItem();
  const bijwerken = useUpdateInboxItem();

  async function invalideer() {
    await qc.invalidateQueries({ queryKey: getGetInboxItemQueryKey(numId) });
    await qc.invalidateQueries({ queryKey: getListInboxItemsQueryKey() });
    await qc.invalidateQueries({ queryKey: getGetInboxStatsQueryKey() });
  }

  async function handleGoedkeuren() {
    try {
      await goedkeuren.mutateAsync({ id: numId, data: {} });
      await invalideer();
      toast({ title: "Item goedgekeurd" });
    } catch { toast({ title: "Fout bij goedkeuren", variant: "destructive" }); }
  }

  async function handleAfwijzen() {
    if (!afwijzenReden.trim()) { toast({ title: "Vul een reden in", variant: "destructive" }); return; }
    try {
      await afwijzen.mutateAsync({ id: numId, data: { reden: afwijzenReden } });
      await invalideer();
      setAfwijzenOpen(false);
      setAfwijzenReden("");
      toast({ title: "Item afgewezen" });
    } catch { toast({ title: "Fout bij afwijzen", variant: "destructive" }); }
  }

  async function handleVerplaatsen() {
    if (!doelBestemming) { toast({ title: "Selecteer een bestemming", variant: "destructive" }); return; }
    try {
      await verplaatsen.mutateAsync({ id: numId, data: { bestemming: doelBestemming } });
      await invalideer();
      setVerplaatsenOpen(false);
      toast({ title: `Item verplaatst naar ${doelBestemming}` });
    } catch { toast({ title: "Fout bij verplaatsen", variant: "destructive" }); }
  }

  async function handleTerBeoordeling() {
    try {
      await terBeoordeling.mutateAsync({ id: numId });
      await invalideer();
      toast({ title: "Item ter beoordeling gesteld" });
    } catch { toast({ title: "Fout", variant: "destructive" }); }
  }

  const typedItem = item as unknown as (InboxItem & { auditlog?: Array<{ id: number; actie: string; gebruiker_id?: number | null; details?: string | null; aangemaakt_op: string | null }> }) | undefined;

  const kanActeren = typedItem && !["goedgekeurd", "verplaatst", "afgewezen"].includes(typedItem.status);
  const afgewezenReden: string | undefined = typedItem ? ((typedItem as unknown as { afgewezen_reden?: string }).afgewezen_reden ?? undefined) : undefined;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!typedItem) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Item niet gevonden.</p>
        <Link href="/inbox"><Button variant="outline" size="sm" className="mt-4">Terug naar inbox</Button></Link>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/inbox">
          <Button variant="ghost" size="sm" className="gap-1 pl-1"><ArrowLeft className="w-4 h-4" /> Inbox</Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold truncate">{typedItem.bestandsnaam}</h1>
            <Badge variant="outline" className={`text-xs border shrink-0 ${STATUS_KLEUR[typedItem.status] ?? ""}`}>
              {STATUS_LABEL[typedItem.status] ?? typedItem.status}
            </Badge>
          </div>
          {typedItem.geupload_op && (
            <p className="text-xs text-muted-foreground mt-0.5">Geregistreerd op {new Date(typedItem.geupload_op).toLocaleString("nl-NL")}</p>
          )}
        </div>
      </div>

      {/* Afgewezen — doorsturen actie */}
      {typedItem.status === "afgewezen" && (
        <div className="rounded-md border border-red-200 bg-red-50/50 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-700">Dit item is afgewezen</p>
              {afgewezenReden && <p className="text-xs text-red-600 mt-0.5">{afgewezenReden}</p>}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Het document staat nog in de inbox. Stuur het door naar de juiste module of laat het hier staan als archief.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
            onClick={() => { setDoelBestemming(typedItem.bestemming ?? ""); setVerplaatsenOpen(true); }}
          >
            <ArrowRight className="w-3.5 h-3.5" /> Doorsturen naar andere module
          </Button>
        </div>
      )}

      {/* Acties */}
      {kanActeren && (
        <div className="flex gap-2 flex-wrap">
          {typedItem.status === "geanalyseerd" && (
            <Button variant="outline" size="sm" className="gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-50" onClick={handleTerBeoordeling} disabled={terBeoordeling.isPending}>
              <AlertTriangle className="w-3.5 h-3.5" /> Ter beoordeling
            </Button>
          )}
          <Button variant="default" size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={handleGoedkeuren} disabled={goedkeuren.isPending}>
            <CheckCircle2 className="w-3.5 h-3.5" /> {goedkeuren.isPending ? "Bezig..." : "Goedkeuren"}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50" onClick={() => { setDoelBestemming(typedItem.bestemming ?? ""); setVerplaatsenOpen(true); }}>
            <ArrowRight className="w-3.5 h-3.5" /> Verplaatsen naar...
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50" onClick={() => setAfwijzenOpen(true)}>
            <XCircle className="w-3.5 h-3.5" /> Afwijzen
          </Button>
        </div>
      )}

      {/* AI-analyse */}
      <Card className="border-amber-200 bg-amber-50/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-amber-700">
            <Sparkles className="w-4 h-4" /> AI-classificatie
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Categorie</p>
              <p className="text-sm font-medium mt-0.5">{typedItem.document_categorie?.replace(/_/g, " ") ?? "Onbekend"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Bestemming</p>
              <p className="text-sm font-medium mt-0.5">{typedItem.bestemming ?? "Onbekend"}</p>
            </div>
          </div>

          {typedItem.ai_betrouwbaarheid && (
            <div>
              <p className="text-xs text-muted-foreground font-medium">AI-betrouwbaarheid</p>
              <Badge variant="outline" className={`text-xs border mt-0.5 ${BETROUW_KLEUR[typedItem.ai_betrouwbaarheid] ?? ""}`}>
                {typedItem.ai_betrouwbaarheid}
              </Badge>
            </div>
          )}

          {typedItem.ai_samenvatting && (
            <div>
              <p className="text-xs text-muted-foreground font-medium">Samenvatting</p>
              <p className="text-sm mt-0.5">{typedItem.ai_samenvatting}</p>
            </div>
          )}

          {typedItem.ai_redenering && (
            <div>
              <p className="text-xs text-muted-foreground font-medium">Redenering</p>
              <p className="text-xs text-muted-foreground mt-0.5">{typedItem.ai_redenering}</p>
            </div>
          )}

          {typedItem.ai_volgende_actie && (
            <div className="bg-amber-100 border border-amber-200 rounded p-2">
              <p className="text-xs font-medium text-amber-800">Aanbevolen actie</p>
              <p className="text-xs text-amber-700 mt-0.5">{typedItem.ai_volgende_actie}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Snagstream-velden */}
      {typedItem.document_categorie === "snagstream_rapport" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4" /> Snagstream-gegevens
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: "Opdrachtgever", waarde: typedItem.snagstream_opdrachtgever },
              { label: "Gebouw", waarde: typedItem.snagstream_gebouw },
              { label: "Project", waarde: typedItem.snagstream_project },
              { label: "Rapportdatum", waarde: typedItem.snagstream_rapportdatum },
              { label: "Rapporttype", waarde: typedItem.snagstream_rapporttype },
              { label: "Status", waarde: typedItem.snagstream_status },
            ].map(({ label, waarde }) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground font-medium">{label}</p>
                <p className="text-sm mt-0.5">{waarde ?? "—"}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Koppeling */}
      {typedItem.gekoppelde_entiteit_naam && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Gekoppeld aan</p>
            <p className="text-sm font-medium mt-0.5">{typedItem.gekoppelde_entiteit_naam} ({typedItem.gekoppelde_entiteit_type})</p>
          </CardContent>
        </Card>
      )}

      {/* Audit log */}
      {typedItem.auditlog && typedItem.auditlog.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="w-4 h-4" /> Geschiedenis
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {(typedItem.auditlog as Array<Record<string, unknown>>).map((log, idx) => {
                const logId = (log["id"] as number | undefined) ?? idx;
                const logActie = String(log["actie"] ?? "");
                const logDatum = log["aangemaakt_op"] != null ? String(log["aangemaakt_op"]) : null;
                const logDetails = log["details"] != null ? String(log["details"]) : null;
                return (
                  <div key={logId} className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium">{logActie}</p>
                      {logDatum && (
                        <p className="text-xs text-muted-foreground">{new Date(logDatum).toLocaleString("nl-NL")}</p>
                      )}
                    </div>
                    {logDetails && <p className="text-xs text-muted-foreground mt-0.5">{logDetails}</p>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Afwijzen dialog */}
      <Dialog open={afwijzenOpen} onOpenChange={setAfwijzenOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Item afwijzen</DialogTitle></DialogHeader>
          <div>
            <Label>Reden voor afwijzing <span className="text-destructive">*</span></Label>
            <Textarea value={afwijzenReden} onChange={(e) => setAfwijzenReden(e.target.value)} className="mt-1" rows={3} placeholder="Beschrijf waarom dit document wordt afgewezen..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAfwijzenOpen(false)}>Annuleren</Button>
            <Button variant="destructive" onClick={handleAfwijzen} disabled={afwijzen.isPending}>
              {afwijzen.isPending ? "Bezig..." : "Afwijzen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verplaatsen dialog */}
      <Dialog open={verplaatsenOpen} onOpenChange={setVerplaatsenOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Document verplaatsen naar module</DialogTitle></DialogHeader>
          <div>
            <Label>Bestemming <span className="text-destructive">*</span></Label>
            <Select value={doelBestemming} onValueChange={setDoelBestemming}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecteer module..." /></SelectTrigger>
              <SelectContent>{BESTEMMINGEN.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerplaatsenOpen(false)}>Annuleren</Button>
            <Button onClick={handleVerplaatsen} disabled={verplaatsen.isPending}>
              {verplaatsen.isPending ? "Bezig..." : "Verplaatsen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
