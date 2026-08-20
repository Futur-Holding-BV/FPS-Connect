import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import {
  useListBankImports,
  useListBankMutaties,
  useImporteerBankafschrift,
  useGetBankMutatieVoorstellen,
  useGetBankMutatieAudit,
  usePasVoorstelToe,
  useWijsVoorstelAf,
  useExporteerBankmutatieAccountView,
  useHerstelBankmutatieAccountView,
  getListBankImportsQueryKey,
  getListBankMutatiesQueryKey,
  getGetBankMutatieVoorstellenQueryKey,
  getGetBankMutatieAuditQueryKey,
  type BankImport,
  type BankMutatie,
  type BankAfletterVoorstel,
  type BankAfletterAudit,
  BankImportFormaat,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, FileDown, CheckCircle2, AlertTriangle, ArrowRightLeft, History, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const euro = (v: number | string) => {
  const num = typeof v === "string" ? parseFloat(v) : v;
  return `€ ${num.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "dd MMM yyyy HH:mm", { locale: nl });
  } catch (e) {
    return iso;
  }
};

const formatJustDate = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "dd MMM yyyy", { locale: nl });
  } catch (e) {
    return iso;
  }
};

// ── Tab: Dagafschriften ──

function ImportTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [formaat, setFormaat] = useState<string>(BankImportFormaat.camt053);

  const { data: importsData, isLoading, error: importsError } = useListBankImports(
    {},
    { query: { queryKey: getListBankImportsQueryKey({}), retry: false } }
  );
  const imports = importsData?.items ?? [];

  const importMut = useImporteerBankafschrift({
    mutation: {
      onSuccess: (res) => {
        setFile(null);
        if (res.duplicate) {
          toast({ title: "Bestand al verwerkt", description: "Dit bestand is al eerder geïmporteerd (SHA-256 is identiek).", variant: "default" });
        } else if (res.ok) {
          toast({ title: "Import geslaagd", description: `${res.aantal_nieuwe_afschriften ?? 0} afschrift(en) verwerkt.` });
          if (res.hiat_signalen && res.hiat_signalen.length > 0) {
            toast({
              title: "Hiaten gesignaleerd",
              description: `Er zijn ${res.hiat_signalen.length} hiaten in saldi of data ontdekt. Controleer de import.`,
              variant: "destructive",
            });
          }
        } else {
          toast({ title: "Import met fouten", description: res.fout ?? "Onbekende fout", variant: "destructive" });
        }
        queryClient.invalidateQueries({ queryKey: getListBankImportsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListBankMutatiesQueryKey() });
      },
      onError: (e: any) => {
        toast({ title: "Import mislukt", description: e.data?.error || "Fout bij uploaden", variant: "destructive" });
      }
    }
  });

  const handleUpload = () => {
    if (!file) return;
    importMut.mutate({ data: { bestand: file as any, formaat: formaat as any } });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="w-4 h-4 text-muted-foreground" /> Nieuw afschrift importeren
          </CardTitle>
          <CardDescription>Upload CAMT.053 (XML) of MT940 (STA/TXT) bestanden</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
            <div className="space-y-1.5 w-full max-w-sm">
              <Label>Bestand</Label>
              <Input
                type="file"
                accept=".xml,.sta,.txt,.mt940,.940,.swi"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                data-testid="input-import-file"
              />
            </div>
            <div className="space-y-1.5 w-full max-w-xs">
              <Label>Bestandsformaat</Label>
              <Select value={formaat} onValueChange={setFormaat}>
                <SelectTrigger data-testid="select-import-formaat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={BankImportFormaat.camt053}>CAMT.053 (Primair / Voorkeur)</SelectItem>
                  <SelectItem value={BankImportFormaat.mt940}>MT940 (Legacy fallback)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button 
              onClick={handleUpload} 
              disabled={!file || importMut.isPending}
              data-testid="button-import-upload"
            >
              {importMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Bestand uploaden
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base">Historie importbestanden</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {importsError ? (
            <div className="p-8 text-center text-red-600 flex flex-col items-center gap-2">
              <AlertTriangle className="w-8 h-8 opacity-80" />
              <p>{(importsError as any).data?.error || "Fout bij ophalen van bestanden (mogelijk geen toegang)."}</p>
            </div>
          ) : isLoading ? (
            <div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : imports.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nog geen bestanden geïmporteerd.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Bestandsnaam</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Formaat</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Bron</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Datum</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {imports.map(imp => (
                    <tr key={imp.id} className="hover:bg-muted/30" data-testid={`row-import-${imp.id}`}>
                      <td className="px-4 py-3 font-medium">{imp.bestandsnaam}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs font-mono">{imp.formaat_label ?? imp.formaat}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">
                        {imp.bron}
                      </td>
                      <td className="px-4 py-3">
                        {imp.status === 'verwerkt' && <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Verwerkt</Badge>}
                        {imp.status === 'fout' && <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Fout</Badge>}
                        {imp.status === 'gedeeltelijk' && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Gedeeltelijk</Badge>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(imp.aangemaakt_op)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Voorstellen & Audit Dialog ──

function MutatieActieDialog({
  mutatie,
  open,
  onOpenChange,
}: {
  mutatie: BankMutatie | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [afwijzingsReden, setAfwijzingsReden] = useState("");
  const [afwijsVoorstelId, setAfwijsVoorstelId] = useState<number | null>(null);
  const [herstelReden, setHerstelReden] = useState("");
  const [herstelBoekingId, setHerstelBoekingId] = useState("");

  const { data: voorstellenData, isLoading: loadingV } = useGetBankMutatieVoorstellen(
    mutatie?.id as number,
    { query: { enabled: open && !!mutatie?.id, queryKey: getGetBankMutatieVoorstellenQueryKey(mutatie?.id as number), retry: false } }
  );
  
  const { data: auditData, isLoading: loadingA } = useGetBankMutatieAudit(
    mutatie?.id as number,
    { query: { enabled: open && !!mutatie?.id, queryKey: getGetBankMutatieAuditQueryKey(mutatie?.id as number), retry: false } }
  );

  const pasVoorstelToe = usePasVoorstelToe({
    mutation: {
      onSuccess: () => {
        toast({ title: "Voorstel toegepast" });
        queryClient.invalidateQueries({ queryKey: getListBankMutatiesQueryKey({}) });
        if (mutatie?.id) {
          queryClient.invalidateQueries({ queryKey: getGetBankMutatieVoorstellenQueryKey(mutatie.id) });
          queryClient.invalidateQueries({ queryKey: getGetBankMutatieAuditQueryKey(mutatie.id) });
        }
      },
      onError: (e: any) => toast({ title: "Toepassen mislukt", description: e.data?.error || "Onbekende fout", variant: "destructive" })
    }
  });

  const wijsVoorstelAf = useWijsVoorstelAf({
    mutation: {
      onSuccess: () => {
        toast({ title: "Voorstel afgewezen" });
        setAfwijsVoorstelId(null);
        setAfwijzingsReden("");
        queryClient.invalidateQueries({ queryKey: getListBankMutatiesQueryKey({}) });
        if (mutatie?.id) {
          queryClient.invalidateQueries({ queryKey: getGetBankMutatieVoorstellenQueryKey(mutatie.id) });
          queryClient.invalidateQueries({ queryKey: getGetBankMutatieAuditQueryKey(mutatie.id) });
        }
      },
      onError: (e: any) => toast({ title: "Afwijzen mislukt", description: e.data?.error || "Onbekende fout", variant: "destructive" })
    }
  });

  const exporteren = useExporteerBankmutatieAccountView({
    mutation: {
      onSuccess: (res) => {
        if (res.geslaagd) {
          toast({ title: "Geëxporteerd naar AccountView", description: `Boeking ID: ${res.boeking_id}` });
        } else {
          toast({ title: "Export mislukt", description: res.foutmelding ?? "Fout in AccountView", variant: "destructive" });
        }
        queryClient.invalidateQueries({ queryKey: getListBankMutatiesQueryKey({}) });
        if (mutatie?.id) {
          queryClient.invalidateQueries({ queryKey: getGetBankMutatieAuditQueryKey(mutatie.id) });
        }
      },
      onError: (e: any) => {
        toast({
          title: e.data?.error || "AccountView-export niet gestart",
          description: e.data?.detail || "Kon export niet aanroepen",
          variant: "destructive",
        });
        queryClient.invalidateQueries({ queryKey: getListBankMutatiesQueryKey({}) });
        onOpenChange(false);
      }
    }
  });

  const herstelExport = useHerstelBankmutatieAccountView({
    mutation: {
      onSuccess: (res) => {
        toast({
          title: res.geslaagd ? "AccountView-boeking bevestigd" : "Export vrijgegeven",
          description: res.geslaagd
            ? `Boeking ${res.boeking_id ?? ""} is vastgelegd als gecontroleerd.`
            : "U kunt de export nu opnieuw expliciet starten.",
        });
        setHerstelReden("");
        setHerstelBoekingId("");
        queryClient.invalidateQueries({ queryKey: getListBankMutatiesQueryKey({}) });
        if (mutatie?.id) {
          queryClient.invalidateQueries({ queryKey: getGetBankMutatieAuditQueryKey(mutatie.id) });
        }
        onOpenChange(false);
      },
      onError: (e: any) => toast({
        title: "Herstel mislukt",
        description: e.data?.detail || e.data?.error || "De herstelkeuze kon niet worden opgeslagen.",
        variant: "destructive",
      }),
    },
  });

  const voorstellen = voorstellenData?.items ?? [];
  const audits = auditData?.items ?? [];

  if (!mutatie) return null;

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!val) {
        setAfwijsVoorstelId(null);
        setHerstelReden("");
        setHerstelBoekingId("");
      }
      onOpenChange(val);
    }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0">
        <div className="p-6 border-b flex-shrink-0">
          <DialogTitle>Transactie details</DialogTitle>
          <DialogDescription className="mt-1">Mutatie #{mutatie.id} • {mutatie.tegenpartij_naam ?? "Onbekende tegenpartij"}</DialogDescription>
          
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm bg-muted/30 p-4 rounded-md border">
            <div>
              <span className="text-muted-foreground block mb-1">Datum</span>
              <span className="font-medium">{formatJustDate(mutatie.boekdatum)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block mb-1">Bedrag</span>
              <span className={cn("font-medium font-mono text-base", mutatie.credit_debit === "CRDT" ? "text-green-600" : "text-slate-700")}>
                {euro(mutatie.bedrag)}
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground block mb-1">Omschrijving / Kenmerk</span>
              <span className="font-mono text-xs break-all">{mutatie.remittance ?? mutatie.tx_referentie ?? "—"}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Voorstellen sectie */}
          <section className="space-y-4">
            <h3 className="font-semibold flex items-center gap-2"><ArrowRightLeft className="w-4 h-4 text-primary" /> Reconciliatie Voorstellen</h3>
            
            {loadingV ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : voorstellen.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Geen automatische match gevonden.</p>
            ) : (
              <div className="space-y-3">
                {voorstellen.map(v => (
                  <Card key={v.id} className={cn("border", v.status === "geaccepteerd" ? "border-green-500 bg-green-50" : "")}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={v.rang === 1 ? "default" : "secondary"}>Rang {v.rang}</Badge>
                            <span className="text-sm font-medium">{v.reden}</span>
                            {v.status === "geaccepteerd" && <Badge className="bg-green-600">Geaccepteerd</Badge>}
                            {v.status === "afgewezen" && <Badge variant="destructive">Afgewezen</Badge>}
                          </div>
                          {v.factuur_id && <p className="text-xs text-muted-foreground pt-1">Factuur #{v.factuur_id}</p>}
                          {v.batchregel_id && <p className="text-xs text-muted-foreground pt-1">Batchregel #{v.batchregel_id}</p>}
                        </div>
                        
                        {v.status === "voorstel" && (
                          <div className="flex gap-2 shrink-0">
                            {afwijsVoorstelId === v.id ? (
                              <div className="flex items-center gap-2 bg-background p-1 border rounded shadow-sm">
                                <Input 
                                  value={afwijzingsReden} 
                                  onChange={e => setAfwijzingsReden(e.target.value)}
                                  placeholder="Reden voor afwijzing..."
                                  className="h-8 text-xs w-48"
                                  autoFocus
                                  data-testid={`input-reject-reason-${v.id}`}
                                />
                                <Button size="sm" className="h-8" variant="destructive" onClick={() => wijsVoorstelAf.mutate({ id: v.id, data: { reden: afwijzingsReden } })} disabled={!afwijzingsReden.trim()} data-testid={`button-reject-confirm-${v.id}`}>
                                  Bevestig
                                </Button>
                                <Button size="sm" className="h-8" variant="ghost" onClick={() => setAfwijsVoorstelId(null)}>Annuleer</Button>
                              </div>
                            ) : (
                              <>
                                <Button size="sm" variant="outline" onClick={() => setAfwijsVoorstelId(v.id)} data-testid={`button-reject-${v.id}`}>
                                  Afwijzen
                                </Button>
                                <Button size="sm" onClick={() => pasVoorstelToe.mutate({ id: v.id })} data-testid={`button-apply-${v.id}`}>
                                  <CheckCircle2 className="w-4 h-4 mr-1" /> Toepassen
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* Export sectie */}
          <section className="space-y-4">
            <h3 className="font-semibold flex items-center gap-2"><FileDown className="w-4 h-4 text-primary" /> AccountView Export</h3>
            {mutatie.accountview_status === "onzeker" ? (
              <div className="space-y-4 rounded-md border border-amber-300 bg-amber-50 p-4">
                <div className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  <div>
                    <p className="font-medium text-amber-900">Uitkomst van de vorige export is onzeker</p>
                    <p className="mt-1 text-xs text-amber-800">
                      {mutatie.accountview_fout ?? "Controleer in AccountView of deze bankmutatie al is geboekt. Start niet opnieuw zonder die controle."}
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="accountview-herstel-reden">Wat is in AccountView gecontroleerd?</Label>
                  <Input
                    id="accountview-herstel-reden"
                    value={herstelReden}
                    onChange={(e) => setHerstelReden(e.target.value)}
                    placeholder="Bijvoorbeeld: gezocht op bankreferentie en bedrag"
                    data-testid="input-accountview-herstel-reden"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="accountview-herstel-id">Bestaand AccountView-boekings-ID</Label>
                  <Input
                    id="accountview-herstel-id"
                    value={herstelBoekingId}
                    onChange={(e) => setHerstelBoekingId(e.target.value)}
                    placeholder="Alleen invullen als de boeking al bestaat"
                    data-testid="input-accountview-herstel-id"
                  />
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    disabled={!herstelReden.trim() || herstelExport.isPending}
                    onClick={() => herstelExport.mutate({
                      id: mutatie.id,
                      data: { actie: "opnieuw_proberen", reden: herstelReden.trim(), accountview_boeking_id: null },
                    })}
                    data-testid="button-accountview-herstel-retry"
                  >
                    Vrijgeven voor nieuwe poging
                  </Button>
                  <Button
                    disabled={!herstelReden.trim() || !herstelBoekingId.trim() || herstelExport.isPending}
                    onClick={() => herstelExport.mutate({
                      id: mutatie.id,
                      data: {
                        actie: "bevestig_geboekt",
                        reden: herstelReden.trim(),
                        accountview_boeking_id: herstelBoekingId.trim(),
                      },
                    })}
                    data-testid="button-accountview-herstel-bevestig"
                  >
                    Bestaande boeking bevestigen
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between p-4 border rounded-md bg-muted/10">
                <div className="text-sm">
                  <p className="font-medium">Exporteer naar AccountView</p>
                  <p className="text-muted-foreground text-xs">Plaats deze mutatie direct als boeking in AccountView.</p>
                  {mutatie.accountview_id && (
                    <p className="text-green-700 text-xs mt-1 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Reeds geëxporteerd (ID: {mutatie.accountview_id})
                    </p>
                  )}
                  {mutatie.accountview_status === "bezig" && (
                    <p className="text-amber-700 text-xs mt-1">Export wordt verwerkt. Start geen tweede export.</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  onClick={() => exporteren.mutate({ id: mutatie.id })}
                  disabled={exporteren.isPending || !!mutatie.accountview_id || mutatie.accountview_status === "bezig"}
                  data-testid="button-export-av"
                >
                  {exporteren.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Exporteer
                </Button>
              </div>
            )}
          </section>

          {/* Audit trail */}
          <section className="space-y-4">
            <h3 className="font-semibold flex items-center gap-2"><History className="w-4 h-4 text-primary" /> Audit Trail</h3>
            {loadingA ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : audits.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Geen historie beschikbaar.</p>
            ) : (
              <div className="space-y-4 border-l-2 border-muted ml-2 pl-4">
                {audits.map(a => (
                  <div key={a.id} className="relative" data-testid={`audit-item-${a.id}`}>
                    <div className="absolute -left-[21px] w-2.5 h-2.5 rounded-full bg-primary ring-4 ring-background" />
                    <p className="text-xs text-muted-foreground mb-0.5">{formatDate(a.aangemaakt_op)} • {a.gebruiker_naam ?? "Systeem"}</p>
                    <p className="text-sm font-medium">{a.actie}</p>
                    {a.reden && <p className="text-sm text-muted-foreground">{a.reden}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}


// ── Tab: Mutaties ──

function MutatiesTab() {
  const [status, setStatus] = useState<string>("all");
  const [iban, setIban] = useState<string>("");
  const [gRekening, setGRekening] = useState<boolean>(false);
  const [selectedMutatie, setSelectedMutatie] = useState<BankMutatie | null>(null);

  const queryParams: Record<string, any> = {};
  if (status !== "all") queryParams.reconciliatie_status = status;
  if (iban.trim() !== "") queryParams.iban = iban.trim();
  if (gRekening) queryParams.g_rekening = true;
  queryParams.limit = 100;

  const { data: mutatiesData, isLoading, isFetching, error: mutatiesError } = useListBankMutaties(
    queryParams,
    { query: { queryKey: getListBankMutatiesQueryKey(queryParams), retry: false } }
  );
  const mutaties = mutatiesData?.items ?? [];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-4 items-center">
          <div className="flex-1 space-y-1.5 w-full">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9" data-testid="filter-status">
                <SelectValue placeholder="Alle statussen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="onbekend">Onbekend (Nieuw)</SelectItem>
                <SelectItem value="meerdere_kandidaten">Meerdere kandidaten</SelectItem>
                <SelectItem value="gematcht">Gematcht</SelectItem>
                <SelectItem value="handmatig">Handmatig</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1.5 w-full">
            <Label className="text-xs text-muted-foreground">Eigen IBAN</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="NL12RABO..." 
                className="pl-9 h-9" 
                value={iban} 
                onChange={e => setIban(e.target.value)}
                data-testid="filter-iban"
              />
            </div>
          </div>
          <div className="flex-1 space-y-1.5 w-full sm:pt-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer border p-2 rounded-md hover:bg-muted/50 h-9">
              <Switch checked={gRekening} onCheckedChange={setGRekening} data-testid="filter-grekening" />
              Alleen G-rekening
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto min-h-[300px]">
          {mutatiesError ? (
            <div className="p-8 text-center text-red-600 flex flex-col items-center gap-2">
              <AlertTriangle className="w-8 h-8 opacity-80" />
              <p>{(mutatiesError as any).data?.error || "Fout bij ophalen van mutaties (mogelijk geen toegang)."}</p>
            </div>
          ) : isLoading && !isFetching ? (
            <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 font-medium text-muted-foreground w-[120px]">Datum</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Tegenpartij / Omschrijving</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right w-[120px]">Bedrag</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground w-[150px]">Status</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground w-[80px]"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {mutaties.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Geen mutaties gevonden.</td>
                  </tr>
                ) : (
                  mutaties.map(m => (
                    <tr 
                      key={m.id} 
                      className="hover:bg-muted/30 cursor-pointer group"
                      onClick={() => setSelectedMutatie(m)}
                      data-testid={`row-mutatie-${m.id}`}
                    >
                      <td className="px-4 py-3 align-top whitespace-nowrap text-muted-foreground">
                        {formatJustDate(m.boekdatum)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium mb-1">{m.tegenpartij_naam ?? "—"}</div>
                        <div className="font-mono text-xs text-muted-foreground line-clamp-2" title={m.remittance ?? m.tx_referentie ?? ""}>
                          {m.remittance ?? m.tx_referentie ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        <span className={cn("font-mono font-medium", m.credit_debit === 'CRDT' ? "text-green-600" : "")}>
                          {euro(m.bedrag)}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-col gap-1.5 items-start">
                          {m.reconciliatie_status === 'gematcht' || m.reconciliatie_status === 'handmatig' ? (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">{m.reconciliatie_status}</Badge>
                          ) : m.reconciliatie_status === 'meerdere_kandidaten' ? (
                            <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 whitespace-nowrap">Voorstel klaar</Badge>
                          ) : (
                            <Badge variant="secondary">Onbekend</Badge>
                          )}
                          {m.accountview_id && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground border-green-200">geëxporteerd</Badge>
                          )}
                           {m.accountview_status === "onzeker" && (
                             <Badge className="bg-amber-100 text-[10px] text-amber-800 hover:bg-amber-100">AccountView controleren</Badge>
                           )}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle text-right">
                        <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 h-8 px-2">Bekijk</Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <MutatieActieDialog 
        mutatie={selectedMutatie} 
        open={!!selectedMutatie} 
        onOpenChange={(v) => !v && setSelectedMutatie(null)} 
      />
    </div>
  );
}

// ── Hoofdpagina ──

export default function BankafschriftenPagina() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 data-paginatitel className="text-2xl font-bold tracking-tight">Bankafschriften Werkruimte</h1>
        <p className="text-muted-foreground mt-1">Importeer dagafschriften, behandel voorstellen en exporteer naar AccountView.</p>
      </div>

      <Tabs defaultValue="mutaties" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="mutaties" className="px-6">Mutaties & Reconciliatie</TabsTrigger>
          <TabsTrigger value="import" className="px-6">Imports (Dagafschriften)</TabsTrigger>
        </TabsList>
        
        <TabsContent value="mutaties" className="m-0 focus:outline-none">
          <MutatiesTab />
        </TabsContent>
        
        <TabsContent value="import" className="m-0 focus:outline-none">
          <ImportTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
