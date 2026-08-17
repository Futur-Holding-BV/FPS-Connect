import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp, Download, CheckCircle2, Clock, AlertCircle, Loader2, Building2 } from "lucide-react";
import {
  useGetSepaBestanden,
  usePatchSepaBestandenId,
  getGetSepaBestandenQueryKey,
  useListWerkgevers,
} from "@workspace/api-client-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useRol } from "@/context/rol-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PaginaHulp } from "@/components/pagina-hulp";

const MAANDEN = [
  "", "Januari", "Februari", "Maart", "April", "Mei", "Juni",
  "Juli", "Augustus", "September", "Oktober", "November", "December",
];

function fmtDatum(d: string) {
  return new Date(d).toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ontvangen") return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Ontvangen</Badge>;
  if (status === "klaar_voor_bank") return <Badge className="bg-blue-100 text-blue-800 border-blue-200"><CheckCircle2 className="h-3 w-3 mr-1" />Klaar voor bank</Badge>;
  if (status === "gedownload") return <Badge className="bg-amber-100 text-amber-800 border-amber-200"><Download className="h-3 w-3 mr-1" />Gedownload</Badge>;
  if (status === "verwerkt") return <Badge className="bg-green-100 text-green-800 border-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Verwerkt</Badge>;
  if (status === "fout") return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Fout</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export default function SepaBestandenPagina() {
  const { echteRol, bevoegdheden } = useRol();
  const magBewerken = echteRol === "hoofdbeheerder" || (bevoegdheden.salarisarchief ?? 0) >= 2;
  const magUploaden = echteRol === "hoofdbeheerder" || (bevoegdheden.salarisarchief ?? 0) >= 3;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [geselecteerdBestand, setGeselecteerdBestand] = useState<File | null>(null);
  const [omschrijving, setOmschrijving] = useState("");
  const [periodeJaar, setPeriodeJaar] = useState<string>(String(new Date().getFullYear()));
  const [periodeMaand, setPeriodeMaand] = useState<string>(String(new Date().getMonth() + 1));
  const [bezigUploaden, setBezigUploaden] = useState(false);

  const { data: sepabestanden, isLoading } = useGetSepaBestanden();
  const { data: werkgevers = [] } = useListWerkgevers();

  // LOON_01: aanvullen van een onvolledig mail-bestand (werkgever + periode).
  const [aanvullenVoor, setAanvullenVoor] = useState<number | null>(null);
  const [aanvulWerkgever, setAanvulWerkgever] = useState<string>("");
  const [aanvulJaar, setAanvulJaar] = useState<string>(String(new Date().getFullYear()));
  const [aanvulMaand, setAanvulMaand] = useState<string>("");

  const updateStatus = usePatchSepaBestandenId({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetSepaBestandenQueryKey() });
        toast({ title: "Status bijgewerkt" });
      },
      onError: () => toast({ title: "Bijwerken mislukt", variant: "destructive" }),
    },
  });

  async function upload() {
    if (!geselecteerdBestand) return;
    setBezigUploaden(true);
    try {
      const form = new FormData();
      form.append("bestand", geselecteerdBestand);
      form.append("omschrijving", omschrijving);
      form.append("periode_jaar", periodeJaar);
      form.append("periode_maand", periodeMaand);
      const res = await fetch("/api/sepa-bestanden/upload", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      void queryClient.invalidateQueries({ queryKey: getGetSepaBestandenQueryKey() });
      toast({ title: "SEPA-bestand geupload" });
      setGeselecteerdBestand(null);
      setOmschrijving("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      toast({ title: "Upload mislukt", variant: "destructive" });
    } finally {
      setBezigUploaden(false);
    }
  }

  async function downloadBestand(id: number, bestandsnaam: string) {
    const res = await fetch(`/api/sepa-bestanden/${id}/download-url`, { credentials: "include" });
    if (res.ok) {
      const { url } = await res.json() as { url: string };
      await updateStatus.mutateAsync({ id, data: { status: "gedownload" } });
      window.open(url, "_blank");
    }
    void bestandsnaam;
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <PaginaHulp pagina="sepa-bestanden" />
      <div>
        <h1 data-paginatitel className="text-2xl font-semibold">SEPA-betaalbestanden</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Upload en beheer SEPA-betaalbestanden (PAIN.001 XML) voor salarisbetalingen.
        </p>
      </div>

      {magUploaden && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bestand uploaden</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                    {MAANDEN.slice(1).map((m, i) => (
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
                  placeholder="bijv. Salarisbetaling april 2026"
                />
              </div>
            </div>

            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              {!geselecteerdBestand ? (
                <p className="text-sm text-muted-foreground">Klik om een XML- of CSV-bestand te selecteren</p>
              ) : (
                <p className="text-sm font-medium">{geselecteerdBestand.name} ({(geselecteerdBestand.size / 1024).toFixed(0)} KB)</p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xml,.csv,.pain001"
                className="hidden"
                onChange={(e) => setGeselecteerdBestand(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={upload} disabled={!geselecteerdBestand || bezigUploaden}>
                {bezigUploaden
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploaden...</>
                  : <><FileUp className="h-4 w-4 mr-2" />Uploaden</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">SEPA-bestanden</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Laden...</div>
          ) : !sepabestanden || sepabestanden.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Nog geen SEPA-bestanden geupload.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bestand</TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead>Bedrag</TableHead>
                  <TableHead>Betalingen</TableHead>
                  <TableHead>IBAN</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sepabestanden.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-medium text-sm truncate max-w-[180px]">{s.bestandsnaam}</div>
                      {s.omschrijving && <div className="text-xs text-muted-foreground">{s.omschrijving}</div>}
                      <div className="flex items-center gap-1 mt-0.5">
                        {s.bron === "mail" && (
                          <Badge variant="outline" className="text-xs">
                            Per mail{s.bron_mailbox_adres ? ` via ${s.bron_mailbox_adres}` : ""}
                          </Badge>
                        )}
                        {s.onvolledig && (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
                            <AlertCircle className="h-3 w-3 mr-1" />Onvolledig
                          </Badge>
                        )}
                        {s.onvolledig && magBewerken && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs"
                            onClick={() => {
                              setAanvullenVoor(s.id);
                              setAanvulWerkgever(s.werkgever_id ? String(s.werkgever_id) : "");
                              setAanvulJaar(String(s.periode_jaar ?? new Date().getFullYear()));
                              setAanvulMaand(s.periode_maand ? String(s.periode_maand) : "");
                            }}
                          >
                            Aanvullen
                          </Button>
                        )}
                      </div>
                      {s.fouten && s.fouten.length > 0 && (
                        <div className="text-xs text-amber-700 mt-0.5">
                          <AlertCircle className="h-3 w-3 inline mr-0.5" />
                          {s.fouten.join(", ")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {s.periode_jaar ? `${MAANDEN[s.periode_maand ?? 1]} ${s.periode_jaar}` : "—"}
                    </TableCell>
                    <TableCell>
                      {s.totaalbedrag
                        ? new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(s.totaalbedrag))
                        : "—"}
                    </TableCell>
                    <TableCell>{s.aantal_betalingen ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{s.iban_opdrachtgever ?? "—"}</TableCell>
                    <TableCell><StatusBadge status={s.status} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDatum(s.aangemaakt_op)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => downloadBestand(s.id, s.bestandsnaam)}
                        >
                          <Download className="h-3.5 w-3.5 mr-1" />Download
                        </Button>
                        {magBewerken && s.status === "ontvangen" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateStatus.mutate({ id: s.id, data: { status: "klaar_voor_bank" } })}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Klaar voor bank
                          </Button>
                        )}
                        {magBewerken && s.status === "klaar_voor_bank" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateStatus.mutate({ id: s.id, data: { status: "verwerkt" } })}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Verwerkt
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={aanvullenVoor !== null} onOpenChange={(open) => { if (!open) setAanvullenVoor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bestand aanvullen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Dit betaalbestand kwam per mail binnen maar kon niet automatisch aan een
            werkgever of periode worden gekoppeld. Vul het aan; pas daarna kan het richting de bank.
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Werkgever</Label>
              <Select value={aanvulWerkgever} onValueChange={setAanvulWerkgever}>
                <SelectTrigger><SelectValue placeholder="Kies werkgever" /></SelectTrigger>
                <SelectContent>
                  {werkgevers.map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>{w.naam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Maand</Label>
                <Select value={aanvulMaand} onValueChange={setAanvulMaand}>
                  <SelectTrigger><SelectValue placeholder="Kies maand" /></SelectTrigger>
                  <SelectContent>
                    {MAANDEN.slice(1).map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Jaar</Label>
                <Input type="number" value={aanvulJaar} onChange={(e) => setAanvulJaar(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAanvullenVoor(null)}>Annuleren</Button>
            <Button
              disabled={!aanvulWerkgever || !aanvulMaand || !aanvulJaar || updateStatus.isPending}
              onClick={() => {
                if (aanvullenVoor === null) return;
                updateStatus.mutate(
                  {
                    id: aanvullenVoor,
                    data: {
                      werkgever_id: Number(aanvulWerkgever),
                      periode_jaar: Number(aanvulJaar),
                      periode_maand: Number(aanvulMaand),
                    },
                  },
                  { onSuccess: () => setAanvullenVoor(null) },
                );
              }}
            >
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
