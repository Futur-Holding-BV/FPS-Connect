import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  FileUp, CheckCircle2, AlertCircle, Clock, ChevronRight, Archive, Loader2, Scissors,
} from "lucide-react";
import { useGetSalarisarchiefBatches, getGetSalarisarchiefBatchesQueryKey } from "@workspace/api-client-react";
import { useRol } from "@/context/rol-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const DOCUMENT_TYPEN = [
  { value: "loonstrook", label: "Loonstrook" },
  { value: "jaaropgave", label: "Jaaropgave" },
  { value: "arbeidscontract", label: "Arbeidscontract" },
  { value: "overig", label: "Overig" },
];

const MAANDEN = [
  "Januari", "Februari", "Maart", "April", "Mei", "Juni",
  "Juli", "Augustus", "September", "Oktober", "November", "December",
];

function fmtDatum(d: string) {
  return new Date(d).toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  if (status === "gereed") return <Badge className="bg-green-100 text-green-800 border-green-200">Gereed</Badge>;
  if (status === "verwerken") return <Badge className="bg-amber-100 text-amber-800 border-amber-200"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Verwerken</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export default function SalarisarchiefPagina() {
  const [, navigate] = useLocation();
  const { echteRol, bevoegdheden } = useRol();
  const magUploaden = echteRol === "hoofdbeheerder" || (bevoegdheden.salarisarchief ?? 0) >= 3;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [geselecteerdebestanden, setGeselecteerdebestanden] = useState<File[]>([]);
  const [type, setType] = useState("loonstrook");
  const [omschrijving, setOmschrijving] = useState("");
  const [periodeJaar, setPeriodeJaar] = useState<string>(String(new Date().getFullYear()));
  const [periodeMaand, setPeriodeMaand] = useState<string>(String(new Date().getMonth() + 1));
  const [beziggUploaden, setBezigUploaden] = useState(false);

  const splitFileInputRef = useRef<HTMLInputElement>(null);
  const [splitBestand, setSplitBestand] = useState<File | null>(null);
  const [splitType, setSplitType] = useState("loonstrook");
  const [splitOmschrijving, setSplitOmschrijving] = useState("");
  const [splitJaar, setSplitJaar] = useState<string>(String(new Date().getFullYear()));
  const [splitMaand, setSplitMaand] = useState<string>(String(new Date().getMonth() + 1));
  const [bezigSplitsen, setBezigSplitsen] = useState(false);

  const { data: batches, isLoading } = useGetSalarisarchiefBatches();

  async function splitPdf() {
    if (!splitBestand) return;
    setBezigSplitsen(true);
    try {
      const form = new FormData();
      form.append("bestand", splitBestand);
      form.append("type", splitType);
      form.append("omschrijving", splitOmschrijving || `Split PDF: ${splitBestand.name}`);
      form.append("periode_jaar", splitJaar);
      form.append("periode_maand", splitMaand);
      const res = await fetch("/api/salarisarchief/split-pdf", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const batch = await res.json() as { id: number; totaal_bestanden: number; gekoppeld: number; controle_nodig: number };
      toast({
        title: "PDF gesplitst",
        description: `${batch.totaal_bestanden} pagina('s) verwerkt — ${batch.gekoppeld} automatisch gekoppeld, ${batch.controle_nodig} vereisen controle.`,
      });
      setSplitBestand(null);
      setSplitOmschrijving("");
      if (splitFileInputRef.current) splitFileInputRef.current.value = "";
      void queryClient.invalidateQueries({ queryKey: getGetSalarisarchiefBatchesQueryKey() });
      navigate(`/salarisarchief/batch/${batch.id}`);
    } catch {
      toast({ title: "Splitsen mislukt", description: "Controleer of het bestand een geldige PDF is.", variant: "destructive" });
    } finally {
      setBezigSplitsen(false);
    }
  }

  async function upload() {
    if (geselecteerdebestanden.length === 0) return;
    setBezigUploaden(true);
    try {
      const form = new FormData();
      geselecteerdebestanden.forEach((f) => form.append("bestanden", f));
      form.append("type", type);
      form.append("omschrijving", omschrijving);
      form.append("periode_jaar", periodeJaar);
      form.append("periode_maand", periodeMaand);
      const res = await fetch("/api/salarisarchief/upload", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const batch = await res.json() as { id: number; totaal_bestanden: number; gekoppeld: number };
      toast({
        title: "Batch geupload",
        description: `${batch.totaal_bestanden} bestand(en) verwerkt, ${batch.gekoppeld} automatisch gekoppeld.`,
      });
      setGeselecteerdebestanden([]);
      setOmschrijving("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      void queryClient.invalidateQueries({ queryKey: getGetSalarisarchiefBatchesQueryKey() });
      navigate(`/salarisarchief/batch/${batch.id}`);
    } catch {
      toast({ title: "Upload mislukt", description: "Controleer de bestanden en probeer opnieuw.", variant: "destructive" });
    } finally {
      setBezigUploaden(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold">Salarisarchief</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Upload loonstroken, jaaropgaven en andere salarisdocumenten voor medewerkers.
        </p>
      </div>

      {magUploaden && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Scissors className="h-4 w-4" /> PDF splitsen per medewerker
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload een gecombineerde PDF met meerdere loonstrookjes. Het systeem splitst de PDF
              per pagina en koppelt elke pagina automatisch aan de juiste medewerker op basis van
              naamherkenning.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label>Documenttype</Label>
                <Select value={splitType} onValueChange={setSplitType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPEN.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Jaar</Label>
                <Input
                  type="number"
                  value={splitJaar}
                  onChange={(e) => setSplitJaar(e.target.value)}
                  min={2000}
                  max={2100}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Maand</Label>
                <Select value={splitMaand} onValueChange={setSplitMaand}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MAANDEN.map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Omschrijving (optioneel)</Label>
                <Input
                  value={splitOmschrijving}
                  onChange={(e) => setSplitOmschrijving(e.target.value)}
                  placeholder="bijv. Loonstroken april 2026"
                />
              </div>
            </div>

            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => splitFileInputRef.current?.click()}
            >
              <Scissors className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              {splitBestand ? (
                <p className="text-sm font-medium">{splitBestand.name} ({(splitBestand.size / 1024).toFixed(0)} KB)</p>
              ) : (
                <p className="text-sm text-muted-foreground">Klik om een multi-pagina PDF te selecteren</p>
              )}
              <input
                ref={splitFileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => setSplitBestand(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={splitPdf} disabled={!splitBestand || bezigSplitsen}>
                {bezigSplitsen
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Splitsen...</>
                  : <><Scissors className="h-4 w-4 mr-2" />PDF splitsen</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {magUploaden && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documenten uploaden</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label>Documenttype</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPEN.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Jaar</Label>
                <Input
                  type="number"
                  value={periodeJaar}
                  onChange={(e) => setPeriodeJaar(e.target.value)}
                  min={2000}
                  max={2100}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Maand</Label>
                <Select value={periodeMaand} onValueChange={setPeriodeMaand}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MAANDEN.map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Omschrijving (optioneel)</Label>
                <Input
                  value={omschrijving}
                  onChange={(e) => setOmschrijving(e.target.value)}
                  placeholder="bijv. Loonstroken april 2026"
                />
              </div>
            </div>

            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              {geselecteerdebestanden.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Klik om bestanden te selecteren (PDF, meerdere tegelijk mogelijk)
                </p>
              ) : (
                <p className="text-sm font-medium">
                  {geselecteerdebestanden.length} bestand(en) geselecteerd
                </p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.zip,.xml"
                className="hidden"
                onChange={(e) => setGeselecteerdebestanden(Array.from(e.target.files ?? []))}
              />
            </div>

            {geselecteerdebestanden.length > 0 && (
              <ul className="text-sm space-y-1 text-muted-foreground max-h-32 overflow-y-auto">
                {geselecteerdebestanden.map((f, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <FileUp className="h-3.5 w-3.5" />
                    {f.name} ({(f.size / 1024).toFixed(0)} KB)
                  </li>
                ))}
              </ul>
            )}

            <div className="flex justify-end">
              <Button onClick={upload} disabled={geselecteerdebestanden.length === 0 || beziggUploaden}>
                {beziggUploaden ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploaden...</> : <><FileUp className="h-4 w-4 mr-2" />Uploaden</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Archive className="h-4 w-4" /> Uploadbatches
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Laden...</div>
          ) : !batches || batches.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Archive className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Nog geen uploadbatches.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Omschrijving</TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead className="text-center">Bestanden</TableHead>
                  <TableHead className="text-center">
                    <span className="flex items-center justify-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-green-600" />Gekoppeld</span>
                  </TableHead>
                  <TableHead className="text-center">
                    <span className="flex items-center justify-center gap-1"><AlertCircle className="h-3.5 w-3.5 text-amber-500" />Controle</span>
                  </TableHead>
                  <TableHead className="text-center">
                    <span className="flex items-center justify-center gap-1"><Clock className="h-3.5 w-3.5 text-muted-foreground" />Ongekoppeld</span>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => (
                  <TableRow
                    key={b.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => navigate(`/salarisarchief/batch/${b.id}`)}
                  >
                    <TableCell className="font-medium">
                      {b.omschrijving ?? `Batch #${b.id}`}
                    </TableCell>
                    <TableCell>
                      {b.periode_jaar ? `${MAANDEN[(b.periode_maand ?? 1) - 1]} ${b.periode_jaar}` : "—"}
                    </TableCell>
                    <TableCell className="text-center">{b.totaal_bestanden}</TableCell>
                    <TableCell className="text-center text-green-700 font-medium">{b.gekoppeld}</TableCell>
                    <TableCell className="text-center text-amber-700 font-medium">{b.controle_nodig}</TableCell>
                    <TableCell className="text-center text-muted-foreground">{b.ongekoppeld}</TableCell>
                    <TableCell><StatusBadge status={b.status} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDatum(b.aangemaakt_op)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
