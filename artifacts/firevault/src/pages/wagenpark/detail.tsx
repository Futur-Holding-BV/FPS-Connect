import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetVoertuig,
  useListVoertuigOnderhoud,
  useCreateVoertuigOnderhoud,
  useUpdateVoertuigOnderhoud,
  useListVoertuigKosten,
  useCreateVoertuigKosten,
  useListVoertuigRitten,
  useListToewijsbareGebruikers,
  useGetVoertuigKostenOverzicht,
  useListVoertuigDocumenten,
  useUploadVoertuigDocument,
  useDeleteVoertuigDocument,
  useListDocumentsoorten,
  getListVoertuigDocumentenQueryKey,
} from "@workspace/api-client-react";
import type { VoertuigDocument, Documentsoort } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { MeldingKaart } from "@/components/wagenpark/melding-kaart";
import type { VoertuigMelding } from "@/lib/wagenpark-melding-types";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Alert, AlertDescription,
} from "@/components/ui/alert";
import {
  ArrowLeft, Truck, Wrench, Euro, Route, ShieldAlert, Plus, CheckCircle,
  AlertTriangle, Sparkles, RefreshCw, FileText, Upload, Trash2, Download, Pencil,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { WagenparkOnderhoud } from "@workspace/api-client-react";
import { PaginaHulp } from "@/components/pagina-hulp";

// ── Helpers ────────────────────────────────────────────────

const STATUS_KLEUR: Record<string, string> = {
  actief:       "bg-green-100 text-green-800",
  in_onderhoud: "bg-orange-100 text-orange-800",
  beschadigd:   "bg-red-100 text-red-800",
  afgestoten:   "bg-gray-100 text-gray-600",
  gereserveerd: "bg-blue-100 text-blue-800",
};

const ONDERHOUD_PRIO_KLEUR: Record<string, string> = {
  urgent:  "bg-red-100 text-red-800",
  hoog:    "bg-orange-100 text-orange-800",
  normaal: "bg-yellow-100 text-yellow-800",
  laag:    "bg-gray-100 text-gray-600",
};

function formatDatum(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatBedrag(b: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(b);
}

// ══════════════════════════════════════════════════════════
// Onderhoud-dialoog
// ══════════════════════════════════════════════════════════

function OnderhoudDialoog({
  voertuigId, open, onSluit,
}: { voertuigId: number; open: boolean; onSluit: () => void }) {
  const [omschrijving, setOmschrijving] = useState("");
  const [type,         setType]         = useState("periodiek");
  const [prioriteit,   setPrioriteit]   = useState("normaal");
  const [geplandDatum, setGeplandDatum] = useState("");
  const maakAan = useCreateVoertuigOnderhoud();

  function opslaan() {
    if (!omschrijving.trim()) return;
    maakAan.mutate(
      {
        id: voertuigId,
        data: {
          type:         type as "periodiek" | "apk" | "bandenwissel" | "schade" | "reparatie" | "overig",
          omschrijving,
          prioriteit:   prioriteit as "laag" | "normaal" | "hoog" | "urgent",
          gepland_datum: geplandDatum || null,
        },
      },
      { onSuccess: () => { onSluit(); setOmschrijving(""); setGeplandDatum(""); } },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onSluit}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Onderhoudsmelding toevoegen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="periodiek">Periodiek onderhoud</SelectItem>
                <SelectItem value="apk">APK / Keuring</SelectItem>
                <SelectItem value="bandenwissel">Bandenwissel</SelectItem>
                <SelectItem value="schade">Schademelding</SelectItem>
                <SelectItem value="reparatie">Reparatie</SelectItem>
                <SelectItem value="overig">Overig</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Omschrijving</Label>
            <Textarea
              value={omschrijving}
              onChange={(e) => setOmschrijving(e.target.value)}
              placeholder="Beschrijf het onderhoud of de melding..."
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Prioriteit</Label>
              <Select value={prioriteit} onValueChange={setPrioriteit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="laag">Laag</SelectItem>
                  <SelectItem value="normaal">Normaal</SelectItem>
                  <SelectItem value="hoog">Hoog</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Gepland op</Label>
              <Input
                type="date"
                value={geplandDatum}
                onChange={(e) => setGeplandDatum(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onSluit}>Annuleren</Button>
          <Button onClick={opslaan} disabled={!omschrijving.trim() || maakAan.isPending}>
            Opslaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════
// Kosten-dialoog
// ══════════════════════════════════════════════════════════

function KostenDialoog({
  voertuigId, open, onSluit, isElektrisch,
}: { voertuigId: number; open: boolean; onSluit: () => void; isElektrisch: boolean }) {
  const [categorie,    setCategorie]    = useState("onderhoud");
  const [bedrag,       setBedrag]       = useState("");
  const [datum,        setDatum]        = useState(new Date().toISOString().slice(0, 10));
  const [omschrijving, setOmschrijving] = useState("");
  const [leverancier,  setLeverancier]  = useState("");
  const maakAan = useCreateVoertuigKosten();

  function opslaan() {
    const b = parseFloat(bedrag.replace(",", "."));
    if (!b || !datum) return;
    maakAan.mutate(
      {
        id: voertuigId,
        data: {
          categorie: categorie as "onderhoud" | "brandstof" | "laden" | "banden" | "verzekering" | "lease" | "schade" | "apk" | "overig",
          bedrag:    b,
          datum:     new Date(datum).toISOString(),
          omschrijving: omschrijving || null,
          leverancier:  leverancier || null,
        },
      },
      { onSuccess: () => { onSluit(); setBedrag(""); setOmschrijving(""); setLeverancier(""); } },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onSluit}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Kostenregel toevoegen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Categorie</Label>
              <Select value={categorie} onValueChange={setCategorie}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="onderhoud">Onderhoud</SelectItem>
                  {isElektrisch ? (
                    <SelectItem value="laden">Laden</SelectItem>
                  ) : (
                    <>
                      <SelectItem value="brandstof">Brandstof</SelectItem>
                      <SelectItem value="laden">Laden</SelectItem>
                    </>
                  )}
                  <SelectItem value="banden">Banden</SelectItem>
                  <SelectItem value="verzekering">Verzekering</SelectItem>
                  <SelectItem value="lease">Lease / Afschrijving</SelectItem>
                  <SelectItem value="schade">Schade</SelectItem>
                  <SelectItem value="apk">APK / Keuring</SelectItem>
                  <SelectItem value="overig">Overig</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Datum</Label>
              <Input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Bedrag (€)</Label>
            <Input
              placeholder="0,00"
              value={bedrag}
              onChange={(e) => setBedrag(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Omschrijving</Label>
            <Input
              placeholder="Optionele omschrijving..."
              value={omschrijving}
              onChange={(e) => setOmschrijving(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Leverancier</Label>
            <Input
              placeholder="Naam leverancier..."
              value={leverancier}
              onChange={(e) => setLeverancier(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onSluit}>Annuleren</Button>
          <Button onClick={opslaan} disabled={!bedrag || !datum || maakAan.isPending}>
            Opslaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════
// Document-upload-dialoog
// ══════════════════════════════════════════════════════════

function DocumentUploadDialoog({
  voertuigId, open, onSluit, soorten,
}: {
  voertuigId: number;
  open: boolean;
  onSluit: () => void;
  soorten: Documentsoort[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const upload = useUploadVoertuigDocument();

  const [bestand,        setBestand]        = useState<File | null>(null);
  const [documentsoortId, setDocumentsoortId] = useState<string>("");
  const [geldigTot,      setGeldigTot]      = useState("");

  const gekozenSoort = soorten.find((s) => String(s.id) === documentsoortId);
  const vervaldatumVerplicht = gekozenSoort?.heeft_vervaldatum ?? false;

  function reset() {
    setBestand(null);
    setDocumentsoortId("");
    setGeldigTot("");
  }

  function opslaan() {
    if (!bestand) {
      toast({ title: "Kies een bestand", variant: "destructive" });
      return;
    }
    if (!documentsoortId) {
      toast({ title: "Kies een documentsoort", variant: "destructive" });
      return;
    }
    if (vervaldatumVerplicht && !geldigTot) {
      toast({
        title: "Vervaldatum verplicht",
        description: `De soort "${gekozenSoort?.naam}" vereist een geldig-tot datum.`,
        variant: "destructive",
      });
      return;
    }
    upload.mutate(
      {
        id: voertuigId,
        data: {
          bestand,
          documentsoort_id: documentsoortId,
          geldig_tot: geldigTot ? new Date(geldigTot).toISOString() : null,
        },
      },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: getListVoertuigDocumentenQueryKey(voertuigId) });
          toast({ title: "Document geüpload" });
          reset();
          onSluit();
        },
        onError: (err) => {
          toast({
            title: "Uploaden mislukt",
            description: err instanceof Error ? err.message : "Onbekende fout.",
            variant: "destructive",
          });
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onSluit(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Document uploaden</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Bestand</Label>
            <Input
              type="file"
              onChange={(e) => setBestand(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-1">
            <Label>Documentsoort</Label>
            <Select value={documentsoortId} onValueChange={setDocumentsoortId}>
              <SelectTrigger>
                <SelectValue placeholder="Kies een soort" />
              </SelectTrigger>
              <SelectContent>
                {soorten.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.naam}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {soorten.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nog geen documentsoorten — voeg deze eerst toe via Documentsoorten.
              </p>
            )}
          </div>
          {vervaldatumVerplicht && (
            <div className="space-y-1">
              <Label>Geldig tot *</Label>
              <Input type="date" value={geldigTot} onChange={(e) => setGeldigTot(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onSluit}>Annuleren</Button>
          <Button onClick={opslaan} disabled={upload.isPending || !bestand || !documentsoortId}>
            Uploaden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════
// Documenten-tab
// ══════════════════════════════════════════════════════════

function DocumentVervalStatus(iso: string | null | undefined, waarschuwingDagen = 30): "verlopen" | "bijna" | "ok" | null {
  if (!iso) return null;
  const nu = Date.now();
  const verval = new Date(iso).getTime();
  if (verval < nu) return "verlopen";
  if (verval < nu + waarschuwingDagen * 86_400_000) return "bijna";
  return "ok";
}

function DocumentenTab({
  voertuigId, magAanmaken,
}: { voertuigId: number; magAanmaken: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: documenten = [] } = useListVoertuigDocumenten(voertuigId);
  const { data: soorten = [] } = useListDocumentsoorten({ context: "voertuig" });

  const [uploadOpen,    setUploadOpen]    = useState(false);
  const [teVerwijderen, setTeVerwijderen] = useState<VoertuigDocument | null>(null);

  const verwijder = useDeleteVoertuigDocument();

  function verwijderBevestig() {
    if (!teVerwijderen) return;
    verwijder.mutate(
      { id: voertuigId, documentId: teVerwijderen.id },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: getListVoertuigDocumentenQueryKey(voertuigId) });
          toast({ title: "Document verwijderd" });
          setTeVerwijderen(null);
        },
        onError: (err) => {
          toast({
            title: "Verwijderen mislukt",
            description: err instanceof Error ? err.message : "Onbekende fout.",
            variant: "destructive",
          });
          setTeVerwijderen(null);
        },
      },
    );
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end">
        {magAanmaken && (
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Document uploaden
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Soort</TableHead>
                <TableHead>Naam</TableHead>
                <TableHead>Geldig tot</TableHead>
                <TableHead className="text-right">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documenten.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <div>Nog geen documenten</div>
                  </TableCell>
                </TableRow>
              ) : (
                documenten.map((d) => {
                  const status = DocumentVervalStatus(d.geldig_tot);
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="text-sm">
                        {d.documentsoort_naam ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{d.naam}</TableCell>
                      <TableCell className="text-sm">
                        {d.geldig_tot ? (
                          <span className={
                            status === "verlopen" ? "text-red-600 font-semibold"
                              : status === "bijna" ? "text-orange-600 font-medium" : ""
                          }>
                            {formatDatum(d.geldig_tot)}
                            {status === "verlopen" && " (verlopen)"}
                            {status === "bijna" && " (bijna verlopen)"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {d.pdf_url && (
                            <Button variant="ghost" size="sm" asChild>
                              <a
                                href={`/api/wagenpark/voertuigen/${voertuigId}/documenten/${d.id}/download`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <Download className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          {magAanmaken && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setTeVerwijderen(d)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {magAanmaken && (
        <DocumentUploadDialoog
          voertuigId={voertuigId}
          open={uploadOpen}
          onSluit={() => setUploadOpen(false)}
          soorten={soorten}
        />
      )}

      <AlertDialog open={!!teVerwijderen} onOpenChange={(o) => { if (!o) setTeVerwijderen(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Document verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet u zeker dat u &quot;{teVerwijderen?.naam}&quot; wilt verwijderen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={verwijderBevestig}
              disabled={verwijder.isPending}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Kosten per jaar-overzicht
// ══════════════════════════════════════════════════════════

const KOSTEN_CATEGORIE_LABELS: Record<string, string> = {
  onderhoud:   "Onderhoud",
  brandstof:   "Brandstof",
  laden:       "Laden",
  banden:      "Banden",
  verzekering: "Verzekering",
  lease:       "Lease",
  schade:      "Schade",
  apk:         "APK",
  overig:      "Overig",
};

function KostenPerJaar({ voertuigId }: { voertuigId: number }) {
  const { data: overzicht = [] } = useGetVoertuigKostenOverzicht(voertuigId);

  if (overzicht.length === 0) return null;

  // Verzamel alle voorkomende categorieën
  const categorieen = Array.from(
    new Set(overzicht.flatMap((j) => Object.keys(j.per_categorie))),
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Kosten per jaar</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Jaar</TableHead>
              {categorieen.map((c) => (
                <TableHead key={c} className="text-right">
                  {KOSTEN_CATEGORIE_LABELS[c] ?? c}
                </TableHead>
              ))}
              <TableHead className="text-right font-semibold">Totaal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {overzicht.map((j) => (
              <TableRow key={j.jaar}>
                <TableCell className="font-medium">{j.jaar}</TableCell>
                {categorieen.map((c) => (
                  <TableCell key={c} className="text-right font-mono text-sm">
                    {j.per_categorie[c] ? formatBedrag(j.per_categorie[c]) : "—"}
                  </TableCell>
                ))}
                <TableCell className="text-right font-mono font-semibold">
                  {formatBedrag(j.totaal)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════
// Detail-pagina
// ══════════════════════════════════════════════════════════

export default function WagenparkDetailPagina() {
  const { id } = useParams<{ id: string }>();
  const voertuigId = Number(id);

  const { heeftNiveau } = useBevoegdheid();
  const magSchrijven = heeftNiveau("wagenpark", 2);
  const magAanmaken  = heeftNiveau("wagenpark", 3);

  const [toonOnderhoudDialoog, setToonOnderhoudDialoog] = useState(false);
  const [toonKostenDialoog,    setToonKostenDialoog]    = useState(false);
  const [statusFilter,         setStatusFilter]         = useState("alle");

  const { data: voertuig, isLoading } = useGetVoertuig(voertuigId);
  const { data: onderhoud = [] }       = useListVoertuigOnderhoud(voertuigId);
  const { data: kosten = [] }          = useListVoertuigKosten(voertuigId);
  const { data: ritten = [] }          = useListVoertuigRitten(voertuigId);

  const qc = useQueryClient();
  const { data: meldingen = [] } = useQuery<VoertuigMelding[]>({
    queryKey: ["wagenpark-meldingen", voertuigId],
    queryFn: async () => {
      const r = await fetch(`/api/wagenpark/meldingen?voertuig_id=${voertuigId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json() as Promise<VoertuigMelding[]>;
    },
    enabled: voertuigId > 0,
    refetchInterval: 30000,
  });

  const { data: toewijsbareGebruikers = [] } = useListToewijsbareGebruikers();

  const patchMelding = useMutation({
    mutationFn: async ({ id, ...waarden }: {
      id: number;
      status?: string;
      admin_notitie?: string;
      toegewezen_beheerder_id?: number | null;
      onderhoud_id?: number | null;
      opvolg_notitie?: string;
    }) => {
      const r = await fetch(`/api/wagenpark/meldingen/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(waarden),
      });
      if (!r.ok) throw new Error("Bijwerken mislukt");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["wagenpark-meldingen", voertuigId] }),
  });

  const nieuweMeldingen = meldingen.filter(m => m.status === "nieuw" || m.status === "actie_nodig").length;

  const updateOnderhoud = useUpdateVoertuigOnderhoud();

  function accordeerOnderhoud(o: WagenparkOnderhoud) {
    updateOnderhoud.mutate({
      id:          voertuigId,
      onderhoudId: o.id,
      data: {
        type:        o.type as "periodiek" | "apk" | "bandenwissel" | "schade" | "reparatie" | "overig",
        omschrijving: o.omschrijving,
        geaccordeerd: true,
        status:       "ingepland" as const,
      },
    });
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-3 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin" />
        Laden...
      </div>
    );
  }

  if (!voertuig) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>Voertuig niet gevonden.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const isElektrisch    = voertuig.aandrijving === "elektrisch";
  const totaalKosten    = kosten.reduce((s, k) => s + k.bedrag, 0);
  const onderhoudKosten = kosten.filter((k) => k.categorie === "onderhoud").reduce((s, k) => s + k.bedrag, 0);
  const brandstofKosten = kosten.filter((k) => k.categorie === "brandstof").reduce((s, k) => s + k.bedrag, 0);
  const laadKosten      = kosten.filter((k) => k.categorie === "laden").reduce((s, k) => s + k.bedrag, 0);

  const gefilterdOnderhoud = onderhoud.filter((o) =>
    statusFilter === "alle" || o.status === statusFilter,
  );

  const openOnderhoud = onderhoud.filter((o) => o.status === "open").length;
  const aiVoorstellen = onderhoud.filter((o) => o.is_ai_voorstel && !o.geaccordeerd).length;

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <PaginaHulp pagina="wagenpark-detail" />
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/wagenpark">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Terug naar wagenpark
          </Link>
        </Button>
        {magAanmaken && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/wagenpark/${voertuigId}/bewerken`}>
              <Pencil className="h-4 w-4 mr-2" />
              Bewerken
            </Link>
          </Button>
        )}
      </div>

      <Alert className="border-blue-200 bg-blue-50">
        <ShieldAlert className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800 text-sm">
          Voertuigdata is uitsluitend bedoeld voor wagenparkbeheer. Geen persoonsgerichte
          GPS-tijdlijn of beoordeling van individuele medewerkers.
        </AlertDescription>
      </Alert>

      {/* Voertuig header */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Truck className="h-7 w-7 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 data-paginatitel className="text-2xl font-bold font-mono">{voertuig.kenteken}</h1>
                  <Badge className={STATUS_KLEUR[voertuig.status] ?? "bg-gray-100 text-gray-700"}>
                    {voertuig.status.replace("_", " ")}
                  </Badge>
                  {voertuig.aandacht_nodig && (
                    <Badge className="bg-orange-100 text-orange-800">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Aandacht nodig
                    </Badge>
                  )}
                </div>
                <div className="text-muted-foreground">
                  {voertuig.merk} {voertuig.type}
                  {voertuig.bouwjaar && ` — ${voertuig.bouwjaar}`}
                  {voertuig.kleur && `, ${voertuig.kleur}`}
                </div>
                {voertuig.fleet_provider && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Provider: {voertuig.fleet_provider}
                    {voertuig.provider_voertuig_id && ` (${voertuig.provider_voertuig_id})`}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-muted/50 rounded p-2">
                <div className="font-bold font-mono text-sm">
                  {voertuig.km_stand.toLocaleString("nl-NL")}
                </div>
                <div className="text-xs text-muted-foreground">km-stand</div>
              </div>
              <div className={`rounded p-2 ${voertuig.apk_datum && new Date(voertuig.apk_datum) < new Date(Date.now() + 30 * 86_400_000) ? "bg-orange-50" : "bg-muted/50"}`}>
                <div className={`font-bold text-sm ${voertuig.apk_datum && new Date(voertuig.apk_datum) < new Date(Date.now() + 30 * 86_400_000) ? "text-orange-700" : ""}`}>
                  {formatDatum(voertuig.apk_datum)}
                </div>
                <div className="text-xs text-muted-foreground">APK vervalt</div>
              </div>
              <div className="bg-muted/50 rounded p-2">
                <div className="font-bold text-sm capitalize">{voertuig.eigendoms_type}</div>
                <div className="text-xs text-muted-foreground">type</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overzicht">
        <TabsList>
          <TabsTrigger value="overzicht">Overzicht</TabsTrigger>
          <TabsTrigger value="onderhoud">
            Onderhoud
            {openOnderhoud > 0 && (
              <Badge className="ml-2 bg-orange-100 text-orange-800 text-xs">{openOnderhoud}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="kosten">Kosten</TabsTrigger>
          <TabsTrigger value="ritten">Ritten</TabsTrigger>
          <TabsTrigger value="meldingen">
            Meldingen
            {nieuweMeldingen > 0 && (
              <Badge className="ml-2 bg-red-100 text-red-800 text-xs">{nieuweMeldingen}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="documenten">Documenten</TabsTrigger>
        </TabsList>

        {/* ── Overzicht ── */}
        <TabsContent value="overzicht" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Voertuiggegevens</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {([
                  ["Chassisnummer", voertuig.chassisnummer],
                  ["Kleur", voertuig.kleur],
                  ["Bouwjaar", voertuig.bouwjaar?.toString()],
                  ["Aandrijving", voertuig.aandrijving],
                  ["Vaste garage", voertuig.garage_naam],
                  ["Garage e-mail", voertuig.garage_email],
                  ["Chauffeur (vast)", voertuig.chauffeur_naam],
                ] as [string, string | null | undefined][]).map(([label, waarde]) =>
                  waarde ? (
                    <div key={label} className="flex justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium">{waarde}</span>
                    </div>
                  ) : null,
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Onderhoudsstatus</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {([
                  ["Km-stand", `${voertuig.km_stand.toLocaleString("nl-NL")} km`],
                  ["Interval (km)", voertuig.onderhouds_interval_km ? `${voertuig.onderhouds_interval_km.toLocaleString("nl-NL")} km` : null],
                  ["Interval (maanden)", voertuig.onderhouds_interval_dag ? `${Math.round(voertuig.onderhouds_interval_dag / 30)} mnd` : null],
                  ["Laatste onderhoud (km)", voertuig.llaatst_onderhoud_km ? `${voertuig.llaatst_onderhoud_km.toLocaleString("nl-NL")} km` : null],
                  ["Laatste onderhoud (datum)", formatDatum(voertuig.llaatste_onderhoud_datum)],
                  ["Bandenstatus", voertuig.bandenwissels_status?.replace("_", " ")],
                ] as [string, string | null | undefined][]).map(([label, waarde]) =>
                  waarde && waarde !== "—" ? (
                    <div key={label} className="flex justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium capitalize">{waarde}</span>
                    </div>
                  ) : null,
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Verzekering & Lease</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {([
                  ["Verzekeraar", voertuig.verzekeraar_naam],
                  ["Polisnummer", voertuig.verzekering_polisnr],
                  ["Verzekering vervalt", formatDatum(voertuig.verzekering_verval_dat)],
                  ["Leasemaatschappij", voertuig.leasemaatschappij],
                  ["Lease eindigt", formatDatum(voertuig.lease_eind_datum)],
                  ["Km/jaar (lease)", voertuig.lease_km_jaarlijks ? `${voertuig.lease_km_jaarlijks.toLocaleString("nl-NL")} km` : null],
                ] as [string, string | null | undefined][]).map(([label, waarde]) =>
                  waarde && waarde !== "—" ? (
                    <div key={label} className="flex justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium">{waarde}</span>
                    </div>
                  ) : null,
                )}
              </CardContent>
            </Card>

            {voertuig.opmerkingen && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Opmerkingen</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {voertuig.opmerkingen}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ── Onderhoud ── */}
        <TabsContent value="onderhoud" className="space-y-4 mt-4">
          {aiVoorstellen > 0 && (
            <Alert className="border-amber-200 bg-amber-50">
              <Sparkles className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 text-sm">
                {aiVoorstellen} AI-conceptvoorstel(len) wachten op accordering.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle statussen</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="ingepland">Ingepland</SelectItem>
                <SelectItem value="in_uitvoering">In uitvoering</SelectItem>
                <SelectItem value="afgerond">Afgerond</SelectItem>
              </SelectContent>
            </Select>
            {magAanmaken && (
              <Button size="sm" onClick={() => setToonOnderhoudDialoog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Melding toevoegen
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {gefilterdOnderhoud.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Wrench className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <div>Geen onderhoudsmeldingen</div>
              </div>
            ) : (
              gefilterdOnderhoud.map((o) => (
                <Card
                  key={o.id}
                  className={o.is_ai_voorstel && !o.geaccordeerd ? "border-amber-200 bg-amber-50/30" : ""}
                >
                  <CardContent className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{o.omschrijving}</span>
                          <Badge className={ONDERHOUD_PRIO_KLEUR[o.prioriteit] ?? ""} variant="secondary">
                            {o.prioriteit}
                          </Badge>
                          <Badge variant="outline" className="text-xs capitalize">
                            {o.type.replace("_", " ")}
                          </Badge>
                          {o.is_ai_voorstel && (
                            <Badge className="bg-amber-100 text-amber-800 text-xs">
                              <Sparkles className="h-3 w-3 mr-1" />
                              AI-voorstel
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex gap-3 flex-wrap">
                          <span>Status: <span className="font-medium capitalize">{o.status.replace("_", " ")}</span></span>
                          {o.gepland_datum && <span>Gepland: {formatDatum(o.gepland_datum)}</span>}
                          {o.kosten && <span>Kosten: {formatBedrag(o.kosten)}</span>}
                          {o.leverancier && <span>Leverancier: {o.leverancier}</span>}
                          {o.ai_reden && <span className="text-amber-700">Reden: {o.ai_reden}</span>}
                        </div>
                      </div>
                      {o.is_ai_voorstel && !o.geaccordeerd && magSchrijven && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-amber-300 text-amber-800 hover:bg-amber-100 flex-shrink-0"
                          onClick={() => accordeerOnderhoud(o)}
                          disabled={updateOnderhoud.isPending}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Accorderen
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* ── Kosten ── */}
        <TabsContent value="kosten" className="space-y-4 mt-4">
          <KostenPerJaar voertuigId={voertuigId} />

          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="pt-3">
                <div className="font-bold text-lg">{formatBedrag(totaalKosten)}</div>
                <div className="text-xs text-muted-foreground">Totaal alle kosten</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3">
                <div className="font-bold text-lg">{formatBedrag(onderhoudKosten)}</div>
                <div className="text-xs text-muted-foreground">Onderhoud</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3">
                <div className="font-bold text-lg">
                  {formatBedrag(isElektrisch ? laadKosten : brandstofKosten)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {isElektrisch ? "Laden" : "Brandstof"}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end">
            {magAanmaken && (
              <Button size="sm" onClick={() => setToonKostenDialoog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Kostenregel toevoegen
              </Button>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Categorie</TableHead>
                    <TableHead>Omschrijving</TableHead>
                    <TableHead>Leverancier</TableHead>
                    <TableHead className="text-right">Bedrag</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {kosten.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        <Euro className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        Nog geen kostenregels
                      </TableCell>
                    </TableRow>
                  ) : (
                    kosten.map((k) => (
                      <TableRow key={k.id}>
                        <TableCell className="text-sm">{formatDatum(k.datum)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="capitalize text-xs">
                            {k.categorie}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{k.omschrijving ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{k.leverancier ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          {formatBedrag(k.bedrag)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Ritten ── */}
        <TabsContent value="ritten" className="space-y-4 mt-4">
          <Alert className="border-blue-100 bg-blue-50">
            <Route className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-700 text-sm">
              Rittenhistorie is voertuiggericht. Geen persoonlijke GPS-tijdlijn — data wordt
              uitsluitend gebruikt voor wagenparkbeheer, kostentoewijzing en planning.
            </AlertDescription>
          </Alert>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Van</TableHead>
                    <TableHead>Naar</TableHead>
                    <TableHead className="text-right">Afstand</TableHead>
                    <TableHead>Doel</TableHead>
                    <TableHead>Bron</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ritten.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        <Route className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        Geen ritten beschikbaar
                        {!voertuig.fleet_provider && (
                          <div className="text-xs mt-1">
                            Koppel een fleet-provider om ritten automatisch te importeren
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    ritten.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm">{formatDatum(r.start_datum)}</TableCell>
                        <TableCell className="text-sm max-w-[120px] truncate">{r.vertrek_adres ?? "—"}</TableCell>
                        <TableCell className="text-sm max-w-[120px] truncate">{r.bestemming_adres ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {r.afstand_km ? `${r.afstand_km.toFixed(0)} km` : "—"}
                        </TableCell>
                        <TableCell className="text-sm capitalize text-muted-foreground">{r.doel ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{r.bron}</Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Meldingen ── */}
        <TabsContent value="meldingen" className="space-y-3 mt-4">
          {meldingen.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Geen meldingen voor dit voertuig.
            </p>
          ) : (
            meldingen.map((m) => (
              <MeldingKaart
                key={m.id}
                melding={m}
                toewijsbareGebruikers={toewijsbareGebruikers}
                onderhoudOpties={onderhoud}
                standaardGarageEmail={voertuig.garage_email}
                standaardGarageNaam={voertuig.garage_naam}
                onPatch={(waarden) => patchMelding.mutate({ id: m.id, ...waarden })}
              />
            ))
          )}
        </TabsContent>

        {/* ── Documenten ── */}
        <TabsContent value="documenten">
          <DocumentenTab voertuigId={voertuigId} magAanmaken={magAanmaken} />
        </TabsContent>
      </Tabs>

      <OnderhoudDialoog
        voertuigId={voertuigId}
        open={toonOnderhoudDialoog}
        onSluit={() => setToonOnderhoudDialoog(false)}
      />
      <KostenDialoog
        voertuigId={voertuigId}
        open={toonKostenDialoog}
        onSluit={() => setToonKostenDialoog(false)}
        isElektrisch={isElektrisch}
      />
    </div>
  );
}
