import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, CheckCircle2, AlertCircle, Clock, UserCheck, Eye, EyeOff,
  Send, Download, Loader2, FileText, Search,
} from "lucide-react";
import {
  useGetSalarisarchiefBatchesId,
  usePatchSalarisarchiefDocumentenId,
  usePostSalarisarchiefDocumentenIdPubliceer,
  usePostSalarisarchiefBatchPubliceer,
  getGetSalarisarchiefBatchesIdQueryKey,
  getGetSalarisarchiefBatchesQueryKey,
  useListMedewerkers,
  type SalarisbestandRegel,
} from "@workspace/api-client-react";
import { useRol } from "@/context/rol-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

const MAANDEN = [
  "", "Januari", "Februari", "Maart", "April", "Mei", "Juni",
  "Juli", "Augustus", "September", "Oktober", "November", "December",
];

function fmtDatum(d: string) {
  return new Date(d).toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  if (status === "gekoppeld") return (
    <Badge className="bg-blue-100 text-blue-800 border-blue-200">
      <CheckCircle2 className="h-3 w-3 mr-1" />Gekoppeld
    </Badge>
  );
  if (status === "controle_nodig") return (
    <Badge className="bg-amber-100 text-amber-800 border-amber-200">
      <AlertCircle className="h-3 w-3 mr-1" />Controle nodig
    </Badge>
  );
  if (status === "gepubliceerd") return (
    <Badge className="bg-green-100 text-green-800 border-green-200">
      <Send className="h-3 w-3 mr-1" />Gepubliceerd
    </Badge>
  );
  return (
    <Badge variant="outline">
      <Clock className="h-3 w-3 mr-1" />{status}
    </Badge>
  );
}

function ZekerheidBadge({ zekerheid }: { zekerheid?: number | null }) {
  if (zekerheid == null) return null;
  const pct = Math.round(zekerheid * 100);
  const kleur = pct >= 85 ? "text-green-700" : pct >= 40 ? "text-amber-700" : "text-muted-foreground";
  return <span className={`text-xs ${kleur}`}>{pct}%</span>;
}

export default function SalarisarchiefBatchDetailPagina() {
  const [, params] = useRoute("/salarisarchief/batch/:id");
  const [, navigate] = useLocation();
  const batchId = Number(params?.id ?? "0");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { echteRol, bevoegdheden } = useRol();
  const magBewerken = echteRol === "hoofdbeheerder" || (bevoegdheden.salarisarchief ?? 0) >= 2;

  const { data: batch, isLoading } = useGetSalarisarchiefBatchesId(batchId);
  const { data: medewerkers } = useListMedewerkers();

  const [koppelenDoc, setKoppelenDoc] = useState<SalarisbestandRegel | null>(null);
  const [gekozenMedewerkerId, setGekozenMedewerkerId] = useState<string>("");
  const [medewerkerZoek, setMedewerkerZoek] = useState("");
  const [geselecteerd, setGeselecteerd] = useState<Set<number>>(new Set());
  const [bezigPubliceren, setBezigPubliceren] = useState(false);

  const patchDoc = usePatchSalarisarchiefDocumentenId({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetSalarisarchiefBatchesIdQueryKey(batchId) });
        void queryClient.invalidateQueries({ queryKey: getGetSalarisarchiefBatchesQueryKey() });
        setKoppelenDoc(null);
        toast({ title: "Medewerker gekoppeld" });
      },
      onError: () => toast({ title: "Koppelen mislukt", variant: "destructive" }),
    },
  });

  const publiceerDoc = usePostSalarisarchiefDocumentenIdPubliceer({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetSalarisarchiefBatchesIdQueryKey(batchId) });
        toast({ title: "Document gepubliceerd" });
      },
      onError: (e: unknown) => {
        const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast({ title: "Publiceren mislukt", description: msg ?? undefined, variant: "destructive" });
      },
    },
  });

  const batchPubliceer = usePostSalarisarchiefBatchPubliceer();

  async function koppelMedewerker() {
    if (!koppelenDoc || !gekozenMedewerkerId) return;
    await patchDoc.mutateAsync({
      id: koppelenDoc.id,
      data: { medewerker_id: parseInt(gekozenMedewerkerId, 10) },
    });
  }

  async function publiceerGeselecteerd() {
    if (geselecteerd.size === 0) return;
    setBezigPubliceren(true);
    try {
      const result = await batchPubliceer.mutateAsync({
        data: { document_ids: Array.from(geselecteerd) },
      });
      void queryClient.invalidateQueries({ queryKey: getGetSalarisarchiefBatchesIdQueryKey(batchId) });
      void queryClient.invalidateQueries({ queryKey: getGetSalarisarchiefBatchesQueryKey() });
      toast({
        title: "Publiceren gereed",
        description: `${result.gepubliceerd} gepubliceerd, ${result.overgeslagen} overgeslagen (geen medewerker).`,
      });
      setGeselecteerd(new Set());
    } catch {
      toast({ title: "Publiceren mislukt", variant: "destructive" });
    } finally {
      setBezigPubliceren(false);
    }
  }

  async function downloadDoc(docId: number) {
    const res = await fetch(`/api/salarisarchief/documenten/${docId}/download-url`, { credentials: "include" });
    if (res.ok) {
      const { url } = await res.json() as { url: string };
      window.open(url, "_blank");
    }
  }

  const gefilterdeMedewerkers = (medewerkers ?? []).filter((m) =>
    m.naam.toLowerCase().includes(medewerkerZoek.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />Laden...
      </div>
    );
  }

  if (!batch) {
    return <div className="p-6 text-center text-muted-foreground">Batch niet gevonden.</div>;
  }

  const documenten = batch.documenten ?? [];
  const gekoppeldCount = documenten.filter((d) => d.status === "gekoppeld" || d.status === "gepubliceerd").length;
  const teKoppelenCount = documenten.filter((d) => d.status !== "gepubliceerd").length;

  function toggleSelect(id: number) {
    setGeselecteerd((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function selecteerKoppelingen() {
    const ids = documenten.filter((d) => d.medewerker_id !== null && d.status !== "gepubliceerd").map((d) => d.id);
    setGeselecteerd(new Set(ids));
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/salarisarchief")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 data-paginatitel className="text-xl font-semibold">{batch.omschrijving ?? `Batch #${batch.id}`}</h1>
          <p className="text-sm text-muted-foreground">
            {batch.periode_jaar ? `${MAANDEN[batch.periode_maand ?? 1]} ${batch.periode_jaar} · ` : ""}
            {batch.totaal_bestanden} bestanden · Geupload door {batch.uploader_naam ?? "onbekend"} op {fmtDatum(batch.aangemaakt_op)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <div className="text-xl font-semibold">{batch.gekoppeld}</div>
              <div className="text-xs text-muted-foreground">Automatisch gekoppeld</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            <div>
              <div className="text-xl font-semibold">{batch.controle_nodig}</div>
              <div className="text-xs text-muted-foreground">Controle nodig</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-xl font-semibold">{batch.ongekoppeld}</div>
              <div className="text-xs text-muted-foreground">Ongekoppeld</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Documenten ({documenten.length})</CardTitle>
            {magBewerken && (
              <div className="flex items-center gap-2">
                {geselecteerd.size === 0 ? (
                  <Button variant="outline" size="sm" onClick={selecteerKoppelingen}>
                    Selecteer gekoppelde
                  </Button>
                ) : (
                  <Button size="sm" onClick={publiceerGeselecteerd} disabled={bezigPubliceren}>
                    {bezigPubliceren
                      ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Publiceren...</>
                      : <><Send className="h-3.5 w-3.5 mr-1.5" />Publiceer {geselecteerd.size} geselecteerde</>}
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {magBewerken && <TableHead className="w-10" />}
                <TableHead>Bestandsnaam</TableHead>
                <TableHead>AI-suggestie</TableHead>
                <TableHead>Zekerheid</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Zichtbaar</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {documenten.map((doc) => (
                <TableRow key={doc.id}>
                  {magBewerken && (
                    <TableCell>
                      <Checkbox
                        checked={geselecteerd.has(doc.id)}
                        onCheckedChange={() => toggleSelect(doc.id)}
                        disabled={doc.status === "gepubliceerd"}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate max-w-[200px]">{doc.bestandsnaam}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {doc.medewerker_naam ?? doc.medewerker_naam_ai ?? (
                      <span className="text-muted-foreground text-xs">Niet herkend</span>
                    )}
                  </TableCell>
                  <TableCell><ZekerheidBadge zekerheid={doc.ai_zekerheid} /></TableCell>
                  <TableCell><StatusBadge status={doc.status} /></TableCell>
                  <TableCell>
                    {doc.zichtbaar_medewerker
                      ? <Eye className="h-4 w-4 text-green-600" />
                      : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {magBewerken && doc.status !== "gepubliceerd" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setKoppelenDoc(doc);
                            setGekozenMedewerkerId(doc.medewerker_id ? String(doc.medewerker_id) : "");
                            setMedewerkerZoek(doc.medewerker_naam ?? doc.medewerker_naam_ai ?? "");
                          }}
                        >
                          <UserCheck className="h-3.5 w-3.5 mr-1" />Koppel
                        </Button>
                      )}
                      {magBewerken && doc.medewerker_id !== null && doc.status !== "gepubliceerd" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => publiceerDoc.mutate({ id: doc.id })}
                        >
                          <Send className="h-3.5 w-3.5 mr-1" />Publiceer
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => downloadDoc(doc.id)}>
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={koppelenDoc !== null} onOpenChange={(o) => { if (!o) setKoppelenDoc(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Medewerker koppelen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground truncate">
              Bestand: <strong>{koppelenDoc?.bestandsnaam}</strong>
            </p>
            {koppelenDoc?.medewerker_naam_ai && (
              <p className="text-sm">
                AI-suggestie: <strong>{koppelenDoc.medewerker_naam_ai}</strong>
                {koppelenDoc.ai_zekerheid != null && (
                  <span className="text-muted-foreground ml-2">
                    ({Math.round(koppelenDoc.ai_zekerheid * 100)}% zekerheid)
                  </span>
                )}
              </p>
            )}
            <div className="space-y-1.5">
              <Label>Zoek medewerker</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  value={medewerkerZoek}
                  onChange={(e) => setMedewerkerZoek(e.target.value)}
                  placeholder="Naam typen om te zoeken..."
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Medewerker</Label>
              <Select value={gekozenMedewerkerId} onValueChange={setGekozenMedewerkerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecteer medewerker" />
                </SelectTrigger>
                <SelectContent>
                  {gefilterdeMedewerkers.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.naam}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKoppelenDoc(null)}>Annuleren</Button>
            <Button
              onClick={koppelMedewerker}
              disabled={!gekozenMedewerkerId || patchDoc.isPending}
            >
              {patchDoc.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Koppelen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
