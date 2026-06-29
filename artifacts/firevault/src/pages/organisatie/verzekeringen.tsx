import { useState } from "react";
import {
  useListOrgVerzekeringen,
  useCreateOrgVerzekering,
  useUpdateOrgVerzekering,
  useDeleteOrgVerzekering,
  useAiSuggestiesOrgVerzekeringen,
  useAiBedrijfsscanOrganisatie,
  useListWerkgevers,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  ShieldCheck,
  Plus,
  Sparkles,
  Pencil,
  Trash2,
  AlertTriangle,
  TrendingDown,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";

type Verzekering = {
  id: number;
  type: string;
  omschrijving?: string | null;
  maatschappij?: string | null;
  polisnummer?: string | null;
  premie?: number | null;
  premie_frequentie?: string | null;
  ingangsdatum?: string | null;
  vervaldatum?: string | null;
  eigen_risico?: number | null;
  status: string;
  opmerkingen?: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  AVB: "Aansprakelijkheidsverzekering Bedrijf (AVB)",
  CAR: "Constructie All Risk (CAR)",
  BEROEP: "Beroepsaansprakelijkheid",
  WAGENPARK: "Wagenparksverzekering",
  ARBEIDSONGEVALLEN: "Arbeidsongevallenverzekering",
  BEDRIJFSSCHADE: "Bedrijfsschadeverzekering",
  RECHTSBIJSTAND: "Rechtsbijstandsverzekering",
  CYBER: "Cyberverzekering",
  BRAND: "Brand- en inboedelverzekering",
  VERZUIM: "Verzuimverzekering / WGA",
  OVERIG: "Overig",
};

const STATUS_KLEUREN: Record<string, string> = {
  actief: "bg-green-100 text-green-700",
  verlopen: "bg-red-100 text-red-700",
  opgezegd: "bg-gray-100 text-gray-700",
  concept: "bg-amber-100 text-amber-700",
};

function formatEuro(bedrag: number | null | undefined) {
  if (bedrag == null) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(bedrag);
}

function PremieFrequentieBadge({ freq }: { freq: string | null | undefined }) {
  const labels: Record<string, string> = { maandelijks: "per maand", kwartaal: "per kwartaal", jaarlijks: "per jaar" };
  return <span className="text-xs text-muted-foreground">{labels[freq ?? ""] ?? "per jaar"}</span>;
}

const leegForm = {
  type: "",
  omschrijving: "",
  maatschappij: "",
  polisnummer: "",
  premie: "",
  premie_frequentie: "jaarlijks",
  ingangsdatum: "",
  vervaldatum: "",
  eigen_risico: "",
  status: "actief",
  opmerkingen: "",
};

export default function VerzekeringenPagina() {
  const { data: polissen = [], isLoading } = useListOrgVerzekeringen();
  const { data: werkgevers = [] } = useListWerkgevers();
  const werkgeverNaam = werkgevers[0]?.naam ?? "FPS Brandpreventie";
  const createPolis = useCreateOrgVerzekering();
  const updatePolis = useUpdateOrgVerzekering();
  const deletePolis = useDeleteOrgVerzekering();
  const aiSuggesties = useAiSuggestiesOrgVerzekeringen();
  const aiBedrijfsscan = useAiBedrijfsscanOrganisatie();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dialoogOpen, setDialoogOpen] = useState(false);
  const [bewerkId, setBewerkId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...leegForm });
  const [verwijderBevestiging, setVerwijderBevestiging] = useState<number | null>(null);
  const [suggesties, setSuggesties] = useState<unknown[]>([]);
  const [suggestiesBezig, setSuggestiesBezig] = useState(false);
  const [scanResultaat, setScanResultaat] = useState<{
    samenvatting?: string | null;
    score?: number | null;
    adviezen?: Array<{ titel: string; beschrijving: string; prioriteit: string; type: string }>;
    ontbrekend?: string[];
    besparing_indicatie?: string | null;
  } | null>(null);
  const [scanBezig, setScanBezig] = useState(false);

  const setFormVeld = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const openNieuw = () => {
    setBewerkId(null);
    setForm({ ...leegForm });
    setDialoogOpen(true);
  };

  const openBewerken = (p: Verzekering) => {
    setBewerkId(p.id);
    setForm({
      type: p.type ?? "",
      omschrijving: p.omschrijving ?? "",
      maatschappij: p.maatschappij ?? "",
      polisnummer: p.polisnummer ?? "",
      premie: p.premie != null ? String(p.premie) : "",
      premie_frequentie: p.premie_frequentie ?? "jaarlijks",
      ingangsdatum: p.ingangsdatum ?? "",
      vervaldatum: p.vervaldatum ?? "",
      eigen_risico: p.eigen_risico != null ? String(p.eigen_risico) : "",
      status: p.status ?? "actief",
      opmerkingen: p.opmerkingen ?? "",
    });
    setDialoogOpen(true);
  };

  const slaOp = async () => {
    if (!form.type) {
      toast({ title: "Type is verplicht", variant: "destructive" });
      return;
    }
    const payload = {
      type: form.type,
      omschrijving: form.omschrijving || undefined,
      maatschappij: form.maatschappij || undefined,
      polisnummer: form.polisnummer || undefined,
      premie: form.premie ? parseFloat(form.premie) : undefined,
      premie_frequentie: form.premie_frequentie || undefined,
      ingangsdatum: form.ingangsdatum || undefined,
      vervaldatum: form.vervaldatum || undefined,
      eigen_risico: form.eigen_risico ? parseFloat(form.eigen_risico) : undefined,
      status: form.status,
      opmerkingen: form.opmerkingen || undefined,
    };
    try {
      if (bewerkId) {
        await updatePolis.mutateAsync({ id: bewerkId, data: payload });
        toast({ title: "Polis bijgewerkt" });
      } else {
        await createPolis.mutateAsync({ data: payload });
        toast({ title: "Polis toegevoegd" });
      }
      queryClient.invalidateQueries({ queryKey: ["listOrgVerzekeringen"] });
      setDialoogOpen(false);
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  };

  const verwijder = async (id: number) => {
    try {
      await deletePolis.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: ["listOrgVerzekeringen"] });
      setVerwijderBevestiging(null);
      toast({ title: "Polis verwijderd" });
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    }
  };

  const haalSuggesties = async () => {
    setSuggestiesBezig(true);
    try {
      const result = await aiSuggesties.mutateAsync({
        data: { bedrijfsnaam: werkgeverNaam, sector: "brandpreventie en bouw" },
      });
      setSuggesties((result as { suggesties: unknown[] }).suggesties ?? []);
    } catch {
      toast({ title: "AI niet beschikbaar", variant: "destructive" });
    } finally {
      setSuggestiesBezig(false);
    }
  };

  const voegSuggestieToe = (s: Record<string, unknown>) => {
    setForm({
      ...leegForm,
      type: String(s.type ?? ""),
      omschrijving: String(s.omschrijving ?? ""),
      premie: s.typische_premie_min != null ? String(s.typische_premie_min) : "",
    });
    setBewerkId(null);
    setDialoogOpen(true);
  };

  const voerScanUit = async () => {
    setScanBezig(true);
    try {
      const result = await aiBedrijfsscan.mutateAsync();
      setScanResultaat(result as typeof scanResultaat);
    } catch {
      toast({ title: "AI-scan mislukt", variant: "destructive" });
    } finally {
      setScanBezig(false);
    }
  };

  const prioriteitKleur: Record<string, string> = {
    hoog: "text-red-600",
    middel: "text-amber-600",
    laag: "text-green-600",
  };

  const typeIcoon: Record<string, typeof TrendingDown> = {
    besparing: TrendingDown,
    dekking: ShieldCheck,
    risico: AlertTriangle,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Verzekeringen</h1>
          <p className="text-muted-foreground mt-1">Bedrijfsverzekeringen, polis-overzichten en vervaldatums op één plek.</p>
        </div>
        <Button onClick={openNieuw}>
          <Plus className="h-4 w-4 mr-2" />
          Polis toevoegen
        </Button>
      </div>

      {/* Statistieken */}
      {polissen.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Totaal polissen", waarde: polissen.length },
            { label: "Actief", waarde: polissen.filter((p) => p.status === "actief").length },
            { label: "Verlopen", waarde: polissen.filter((p) => p.status === "verlopen").length },
            {
              label: "Jaarpremie totaal",
              waarde: formatEuro(
                polissen
                  .filter((p) => p.status === "actief" && p.premie != null)
                  .reduce((s, p) => s + (p.premie_frequentie === "maandelijks" ? (p.premie ?? 0) * 12 : p.premie_frequentie === "kwartaal" ? (p.premie ?? 0) * 4 : (p.premie ?? 0)), 0)
              ),
            },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-bold mt-1">{stat.waarde}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Polissen */}
      <Card>
        <CardHeader>
          <CardTitle>Polisoverzicht</CardTitle>
          <CardDescription>Alle geregistreerde bedrijfsverzekeringen</CardDescription>
        </CardHeader>
        <CardContent>
          {polissen.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <div className="p-4 rounded-full bg-muted">
                <ShieldCheck className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">Nog geen polissen geregistreerd</p>
                <p className="text-sm text-muted-foreground mt-1">Voeg handmatig een polis toe of gebruik de AI-suggesties.</p>
              </div>
              <Button variant="outline" size="sm" onClick={openNieuw}>
                <Plus className="h-4 w-4 mr-1" />
                Eerste polis toevoegen
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {polissen.map((p) => (
                <div key={p.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{TYPE_LABELS[p.type] ?? p.type}</span>
                      <Badge className={`text-xs ${STATUS_KLEUREN[p.status] ?? ""}`} variant="outline">
                        {p.status}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                      {p.maatschappij && <span className="text-xs text-muted-foreground">{p.maatschappij}</span>}
                      {p.polisnummer && <span className="text-xs text-muted-foreground">Polisnr. {p.polisnummer}</span>}
                      {p.vervaldatum && <span className="text-xs text-muted-foreground">Verloopt {p.vervaldatum}</span>}
                      {p.premie != null && (
                        <span className="text-xs text-muted-foreground">
                          {formatEuro(p.premie)} <PremieFrequentieBadge freq={p.premie_frequentie} />
                        </span>
                      )}
                      {p.eigen_risico != null && (
                        <span className="text-xs text-muted-foreground">ER {formatEuro(p.eigen_risico)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openBewerken(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setVerwijderBevestiging(p.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Suggesties */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI-verzekeringssuggesties
          </CardTitle>
          <CardDescription>
            AI geeft een overzicht van standaard aanbevolen verzekeringen voor een brandpreventiebedrijf, inclusief indicatieve premies.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {suggesties.length === 0 ? (
            <Button onClick={haalSuggesties} disabled={suggestiesBezig} variant="outline">
              {suggestiesBezig ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Suggesties ophalen
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="divide-y">
                {(suggesties as Array<Record<string, unknown>>).map((s, i) => (
                  <div key={i} className="py-3 flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{String(s.omschrijving ?? s.type ?? "")}</span>
                        <Badge
                          variant="outline"
                          className={
                            s.prioriteit === "verplicht"
                              ? "border-red-300 text-red-700 bg-red-50"
                              : s.prioriteit === "sterk aanbevolen"
                              ? "border-amber-300 text-amber-700 bg-amber-50"
                              : "border-blue-300 text-blue-700 bg-blue-50"
                          }
                        >
                          {String(s.prioriteit ?? "")}
                        </Badge>
                      </div>
                      {!!s.toelichting && (
                        <p className="text-xs text-muted-foreground mt-0.5">{String(s.toelichting)}</p>
                      )}
                      {(s.typische_premie_min != null || s.typische_premie_max != null) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Indicatieve premie: {formatEuro(s.typische_premie_min as number)} – {formatEuro(s.typische_premie_max as number)} per jaar
                        </p>
                      )}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => voegSuggestieToe(s)}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Toevoegen
                    </Button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={haalSuggesties} disabled={suggestiesBezig}>
                {suggestiesBezig ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Opnieuw ophalen
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Bedrijfsscan */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            AI Bedrijfsscan
          </CardTitle>
          <CardDescription>
            AI analyseert het huidige verzekeringspakket op dekking, risico&apos;s en besparingsmogelijkheden.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!scanResultaat ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                De scan vergelijkt het geregistreerde pakket met branchenormen voor brandpreventie- en bouwbedrijven en signaleert hiaten of
                optimalisatiemogelijkheden.
              </p>
              <Button onClick={voerScanUit} disabled={scanBezig || polissen.length === 0}>
                {scanBezig ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                {polissen.length === 0 ? "Voeg eerst polissen toe" : "Scan uitvoeren"}
              </Button>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center">
                  <div
                    className={`text-3xl font-bold ${
                      (scanResultaat.score ?? 0) >= 7 ? "text-green-600" : (scanResultaat.score ?? 0) >= 5 ? "text-amber-600" : "text-red-600"
                    }`}
                  >
                    {scanResultaat.score != null ? `${scanResultaat.score}/10` : "—"}
                  </div>
                  <span className="text-xs text-muted-foreground">Dekking</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm">{scanResultaat.samenvatting}</p>
                  {scanResultaat.besparing_indicatie && (
                    <p className="text-sm text-green-700 mt-1 font-medium">
                      <TrendingDown className="h-3.5 w-3.5 inline mr-1" />
                      Potentiële besparing: {scanResultaat.besparing_indicatie}
                    </p>
                  )}
                </div>
              </div>

              {(scanResultaat.ontbrekend ?? []).length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-2">Ontbrekende dekking</p>
                  <div className="flex flex-wrap gap-2">
                    {scanResultaat.ontbrekend!.map((o) => (
                      <Badge key={o} variant="outline" className="border-red-300 text-red-700 bg-red-50">
                        {o}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {(scanResultaat.adviezen ?? []).length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-2">Adviezen</p>
                  <div className="space-y-2">
                    {scanResultaat.adviezen!.map((a, i) => {
                      const Icoon = typeIcoon[a.type] ?? ChevronRight;
                      return (
                        <div key={i} className="flex gap-3 rounded-lg border p-3">
                          <Icoon className={`h-4 w-4 mt-0.5 shrink-0 ${prioriteitKleur[a.prioriteit] ?? "text-muted-foreground"}`} />
                          <div>
                            <p className="text-sm font-medium">{a.titel}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{a.beschrijving}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <Button variant="outline" size="sm" onClick={voerScanUit} disabled={scanBezig}>
                {scanBezig ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Scan herhalen
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialoog polis aanmaken / bewerken */}
      <Dialog open={dialoogOpen} onOpenChange={setDialoogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{bewerkId ? "Polis bewerken" : "Polis toevoegen"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 md:col-span-2">
                <Label>Type verzekering</Label>
                <Select value={form.type} onValueChange={(v) => setFormVeld("type", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Kies type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Omschrijving</Label>
                <Input value={form.omschrijving} onChange={(e) => setFormVeld("omschrijving", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Verzekeringsmaatschappij</Label>
                <Input value={form.maatschappij} onChange={(e) => setFormVeld("maatschappij", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Polisnummer</Label>
                <Input value={form.polisnummer} onChange={(e) => setFormVeld("polisnummer", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Premie</Label>
                <Input type="number" value={form.premie} onChange={(e) => setFormVeld("premie", e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Frequentie</Label>
                <Select value={form.premie_frequentie} onValueChange={(v) => setFormVeld("premie_frequentie", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="maandelijks">Per maand</SelectItem>
                    <SelectItem value="kwartaal">Per kwartaal</SelectItem>
                    <SelectItem value="jaarlijks">Per jaar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ingangsdatum</Label>
                <Input type="date" value={form.ingangsdatum} onChange={(e) => setFormVeld("ingangsdatum", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Vervaldatum</Label>
                <Input type="date" value={form.vervaldatum} onChange={(e) => setFormVeld("vervaldatum", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Eigen risico</Label>
                <Input type="number" value={form.eigen_risico} onChange={(e) => setFormVeld("eigen_risico", e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setFormVeld("status", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="actief">Actief</SelectItem>
                    <SelectItem value="verlopen">Verlopen</SelectItem>
                    <SelectItem value="opgezegd">Opgezegd</SelectItem>
                    <SelectItem value="concept">Concept</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Opmerkingen</Label>
                <Textarea value={form.opmerkingen} onChange={(e) => setFormVeld("opmerkingen", e.target.value)} rows={2} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialoogOpen(false)}>Annuleren</Button>
            <Button onClick={slaOp} disabled={createPolis.isPending || updatePolis.isPending}>
              {(createPolis.isPending || updatePolis.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {bewerkId ? "Opslaan" : "Toevoegen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verwijder bevestiging */}
      <Dialog open={verwijderBevestiging !== null} onOpenChange={() => setVerwijderBevestiging(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Polis verwijderen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Weet u zeker dat u deze polis wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerwijderBevestiging(null)}>Annuleren</Button>
            <Button
              variant="destructive"
              onClick={() => verwijderBevestiging && verwijder(verwijderBevestiging)}
              disabled={deletePolis.isPending}
            >
              Verwijderen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
