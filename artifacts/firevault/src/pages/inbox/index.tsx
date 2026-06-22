import { useState } from "react";
import { Link } from "wouter";
import {
  useGetInboxStats,
  useListInboxItems,
  useCreateInboxItem,
  getListInboxItemsQueryKey,
  getGetInboxStatsQueryKey,
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
  Inbox, Plus, FileText, Clock, CheckCircle2, XCircle, ArrowRight,
  AlertTriangle, Sparkles, ChevronRight, Upload, Building2,
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

export default function InboxPagina() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [registrerenOpen, setRegistrerenOpen] = useState(false);
  const [velden, setVelden] = useState({ bestandsnaam: "", mimetype: "application/pdf", bestandsgrootte: "", opmerkingen: "" });

  const { data: stats } = useGetInboxStats();
  const { data: items = [], isLoading } = useListInboxItems(statusFilter && statusFilter !== "open" && statusFilter !== "alle" ? { status: statusFilter } : {});
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

  const statsItems = [
    { label: "Open", waarde: (stats?.nieuw ?? 0) + (stats?.ter_beoordeling ?? 0), icon: Clock, kleur: "text-blue-600" },
    { label: "Ter beoordeling", waarde: stats?.ter_beoordeling ?? 0, icon: AlertTriangle, kleur: "text-purple-600" },
    { label: "Goedgekeurd", waarde: stats?.goedgekeurd ?? 0, icon: CheckCircle2, kleur: "text-emerald-600" },
    { label: "Snagstream", waarde: stats?.snagstream_rapporten ?? 0, icon: FileText, kleur: "text-orange-600" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Inbox className="w-6 h-6" /> Slim Uploadpunt
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Centraal documentinstroompunt met AI-classificatie</p>
        </div>
        <Button onClick={() => setRegistrerenOpen(true)} className="gap-2">
          <Upload className="w-4 h-4" /> Document registreren
        </Button>
      </div>

      {/* Statistieken */}
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

      {/* Filters */}
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

      {/* Items */}
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : gefilterd.length === 0 ? (
        <div className="text-center py-16">
          <Inbox className="w-10 h-10 mx-auto text-muted-foreground opacity-40 mb-3" />
          <p className="text-sm text-muted-foreground">Geen items in dit filter.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setRegistrerenOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Document registreren
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {gefilterd.map((item) => (
            <Link key={item.id} href={`/inbox/${item.id}`}>
              <Card className="cursor-pointer hover:shadow-sm hover:border-primary/30 transition-all">
                <CardContent className="p-4 flex items-start gap-4">
                  <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate max-w-xs">{item.bestandsnaam}</span>
                      <Badge variant="outline" className={`text-xs border shrink-0 ${STATUS_KLEUR[item.status] ?? ""}`}>
                        {STATUS_LABEL[item.status] ?? item.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {item.document_categorie && item.document_categorie !== "onbekend" && (
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

      {/* Registreren Dialog */}
      <Dialog open={registrerenOpen} onOpenChange={setRegistrerenOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-4 h-4" /> Document registreren
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
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
              <p className="text-xs text-muted-foreground mt-1">De bestandsnaam wordt gebruikt voor AI-classificatie.</p>
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
