import { useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Plus, Pencil, Trash2, Upload, Download, Package, Building2, Search,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const BASE = "/api/modules/calculaties";

type Leverancier = {
  id: number; naam: string; contactpersoon: string | null; email: string | null;
  telefoon: string | null; website: string | null; notities: string | null; actief: boolean;
};

type Artikel = {
  id: number; leverancier_id: number | null; leverancier_naam: string | null;
  artikelcode: string | null; omschrijving: string; eenheid: string;
  inkoopprijs: number; verkoopprijs: number; categorie: string; actief: boolean;
};

const LEGE_LEVERANCIER = { naam: "", contactpersoon: "", email: "", telefoon: "", website: "", notities: "" };
const LEGE_ARTIKEL = { leverancier_id: "", artikelcode: "", omschrijving: "", eenheid: "st", inkoopprijs: "0", verkoopprijs: "0", categorie: "materiaal" };
const EENHEDEN = ["st", "pst", "m1", "m2", "m3", "uur", "dag", "week", "lump_sum"];
const CATEGORIEEN = ["materiaal", "arbeid", "onderaanneming", "materieel", "overig"];

function formatBedrag(n: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
}

export default function ModulesCalculatieLeveranciers() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tabblad, setTabblad] = useState<"leveranciers" | "artikelen">("leveranciers");
  const [zoekArtikel, setZoekArtikel] = useState("");
  const [filterLeverancier, setFilterLeverancier] = useState("__alle__");

  const [leverancierDialoog, setLeverancierDialoog] = useState<null | "nieuw" | number>(null);
  const [leverancierForm, setLeverancierForm] = useState(LEGE_LEVERANCIER);
  const [teVerwijderenLev, setTeVerwijderenLev] = useState<number | null>(null);

  const [artikelDialoog, setArtikelDialoog] = useState<null | "nieuw" | number>(null);
  const [artikelForm, setArtikelForm] = useState(LEGE_ARTIKEL);
  const [teVerwijderenArt, setTeVerwijderenArt] = useState<number | null>(null);

  const [importDialoog, setImportDialoog] = useState(false);
  const [importCsv, setImportCsv] = useState("");
  const [importBezig, setImportBezig] = useState(false);

  const { data: leveranciers = [] } = useQuery<Leverancier[]>({
    queryKey: ["calc-leveranciers"],
    queryFn: () => fetch(`${BASE}/leveranciers`).then((r) => r.json()),
  });

  const { data: artikelen = [] } = useQuery<Artikel[]>({
    queryKey: ["calc-artikelen", zoekArtikel, filterLeverancier],
    queryFn: () => {
      const params = new URLSearchParams();
      if (zoekArtikel) params.set("zoek", zoekArtikel);
      if (filterLeverancier !== "__alle__") params.set("leverancier_id", filterLeverancier);
      return fetch(`${BASE}/artikelen?${params}`).then((r) => r.json());
    },
  });

  const maakLeverancier = useMutation({
    mutationFn: (data: typeof LEGE_LEVERANCIER) =>
      fetch(`${BASE}/leveranciers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["calc-leveranciers"] }); setLeverancierDialoog(null); },
  });

  const updateLeverancier = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<typeof LEGE_LEVERANCIER> }) =>
      fetch(`${BASE}/leveranciers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["calc-leveranciers"] }); setLeverancierDialoog(null); },
  });

  const verwijderLeverancier = useMutation({
    mutationFn: (id: number) => fetch(`${BASE}/leveranciers/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["calc-leveranciers"] }); setTeVerwijderenLev(null); },
  });

  const maakArtikel = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch(`${BASE}/artikelen`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["calc-artikelen"] }); setArtikelDialoog(null); },
  });

  const updateArtikel = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      fetch(`${BASE}/artikelen/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["calc-artikelen"] }); setArtikelDialoog(null); },
  });

  const verwijderArtikel = useMutation({
    mutationFn: (id: number) => fetch(`${BASE}/artikelen/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["calc-artikelen"] }); setTeVerwijderenArt(null); },
  });

  function openNieuweLeverancier() {
    setLeverancierForm(LEGE_LEVERANCIER);
    setLeverancierDialoog("nieuw");
  }

  function openBewerkLeverancier(l: Leverancier) {
    setLeverancierForm({ naam: l.naam, contactpersoon: l.contactpersoon ?? "", email: l.email ?? "", telefoon: l.telefoon ?? "", website: l.website ?? "", notities: l.notities ?? "" });
    setLeverancierDialoog(l.id);
  }

  function slaLeverancierOp() {
    if (leverancierDialoog === "nieuw") {
      maakLeverancier.mutate(leverancierForm);
    } else if (typeof leverancierDialoog === "number") {
      updateLeverancier.mutate({ id: leverancierDialoog, data: leverancierForm });
    }
  }

  function openNieuwArtikel() {
    setArtikelForm(LEGE_ARTIKEL);
    setArtikelDialoog("nieuw");
  }

  function openBewerkArtikel(a: Artikel) {
    setArtikelForm({
      leverancier_id: a.leverancier_id ? String(a.leverancier_id) : "",
      artikelcode: a.artikelcode ?? "",
      omschrijving: a.omschrijving,
      eenheid: a.eenheid,
      inkoopprijs: String(a.inkoopprijs),
      verkoopprijs: String(a.verkoopprijs),
      categorie: a.categorie,
    });
    setArtikelDialoog(a.id);
  }

  function slaArtikelOp() {
    const data = {
      leverancier_id: artikelForm.leverancier_id ? Number(artikelForm.leverancier_id) : null,
      artikelcode: artikelForm.artikelcode || null,
      omschrijving: artikelForm.omschrijving,
      eenheid: artikelForm.eenheid,
      inkoopprijs: parseFloat(artikelForm.inkoopprijs) || 0,
      verkoopprijs: parseFloat(artikelForm.verkoopprijs) || 0,
      categorie: artikelForm.categorie,
    };
    if (artikelDialoog === "nieuw") {
      maakArtikel.mutate(data);
    } else if (typeof artikelDialoog === "number") {
      updateArtikel.mutate({ id: artikelDialoog, data });
    }
  }

  async function handleImport() {
    if (!importCsv.trim()) return;
    setImportBezig(true);
    try {
      const resp = await fetch(`${BASE}/artikelen/import-csv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: importCsv }),
      });
      const result = await resp.json() as { aangemaakt: number; fouten: string[] };
      qc.invalidateQueries({ queryKey: ["calc-artikelen"] });
      qc.invalidateQueries({ queryKey: ["calc-leveranciers"] });
      toast({
        title: `${result.aangemaakt} artikelen geimporteerd`,
        description: result.fouten.length > 0 ? `${result.fouten.length} fout(en): ${result.fouten[0]}` : "Import geslaagd",
        variant: result.fouten.length > 0 ? "destructive" : "default",
      });
      setImportDialoog(false);
      setImportCsv("");
    } catch {
      toast({ title: "Import mislukt", variant: "destructive" });
    } finally {
      setImportBezig(false);
    }
  }

  function downloadTemplate() {
    const csv = "artikelcode;omschrijving;eenheid;inkoopprijs;verkoopprijs;categorie;leverancier_naam\nART-001;Brandwerende kit 600ml;st;8,50;14,95;materiaal;Hilti\nART-002;Brandwerend kussen;st;12,00;19,95;materiaal;Rockwool\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "artikelen-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/modules/calculatie")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Leveranciers & artikelen</h1>
          <p className="text-sm text-muted-foreground">Beheer uw leverancierslijsten en productcatalogus</p>
        </div>
      </div>

      <Tabs value={tabblad} onValueChange={(v) => setTabblad(v as typeof tabblad)}>
        <TabsList>
          <TabsTrigger value="leveranciers">
            <Building2 className="h-3.5 w-3.5 mr-1.5" />
            Leveranciers ({leveranciers.length})
          </TabsTrigger>
          <TabsTrigger value="artikelen">
            <Package className="h-3.5 w-3.5 mr-1.5" />
            Artikelen ({artikelen.length})
          </TabsTrigger>
        </TabsList>

        {/* ── Leveranciers ── */}
        <TabsContent value="leveranciers" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Leveranciers</CardTitle>
              <Button size="sm" onClick={openNieuweLeverancier}>
                <Plus className="h-4 w-4 mr-1.5" />
                Leverancier toevoegen
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {leveranciers.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-10">
                  Nog geen leveranciers. Voeg de eerste leverancier toe.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left">
                      <th className="px-4 py-2.5 font-medium text-muted-foreground">Naam</th>
                      <th className="px-4 py-2.5 font-medium text-muted-foreground">Contactpersoon</th>
                      <th className="px-4 py-2.5 font-medium text-muted-foreground">E-mail</th>
                      <th className="px-4 py-2.5 font-medium text-muted-foreground">Telefoon</th>
                      <th className="px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {leveranciers.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2.5 font-medium">{l.naam}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{l.contactpersoon ?? "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{l.email ?? "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{l.telefoon ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant={l.actief ? "default" : "secondary"} className="text-xs">
                            {l.actief ? "Actief" : "Inactief"}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openBewerkLeverancier(l)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setTeVerwijderenLev(l.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Artikelen ── */}
        <TabsContent value="artikelen" className="mt-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Zoek artikelen..."
                value={zoekArtikel}
                onChange={(e) => setZoekArtikel(e.target.value)}
              />
            </div>
            <Select value={filterLeverancier} onValueChange={setFilterLeverancier}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Alle leveranciers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__alle__">Alle leveranciers</SelectItem>
                {leveranciers.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>{l.naam}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setImportDialoog(true)}>
                <Upload className="h-4 w-4 mr-1.5" />
                CSV importeren
              </Button>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-1.5" />
                Template
              </Button>
              <Button size="sm" onClick={openNieuwArtikel}>
                <Plus className="h-4 w-4 mr-1.5" />
                Artikel toevoegen
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              {artikelen.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-10">
                  Geen artikelen gevonden. Voeg artikelen toe of importeer via CSV.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left">
                      <th className="px-4 py-2.5 font-medium text-muted-foreground">Code</th>
                      <th className="px-4 py-2.5 font-medium text-muted-foreground">Omschrijving</th>
                      <th className="px-4 py-2.5 font-medium text-muted-foreground">Leverancier</th>
                      <th className="px-4 py-2.5 font-medium text-muted-foreground">Categorie</th>
                      <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">Inkoopprijs</th>
                      <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">Verkoopprijs</th>
                      <th className="px-4 py-2.5 font-medium text-muted-foreground">Eenheid</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {artikelen.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2 text-muted-foreground font-mono text-xs">{a.artikelcode ?? "—"}</td>
                        <td className="px-4 py-2 font-medium">{a.omschrijving}</td>
                        <td className="px-4 py-2 text-muted-foreground">{a.leverancier_naam ?? "—"}</td>
                        <td className="px-4 py-2">
                          <Badge variant="outline" className="text-xs capitalize">{a.categorie}</Badge>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatBedrag(a.inkoopprijs)}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium">{formatBedrag(a.verkoopprijs)}</td>
                        <td className="px-4 py-2 text-muted-foreground">{a.eenheid}</td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openBewerkArtikel(a)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setTeVerwijderenArt(a.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Leverancier dialoog ── */}
      <Dialog open={leverancierDialoog !== null} onOpenChange={(o) => !o && setLeverancierDialoog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{leverancierDialoog === "nieuw" ? "Leverancier toevoegen" : "Leverancier bewerken"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Naam *</Label>
              <Input value={leverancierForm.naam} onChange={(e) => setLeverancierForm((f) => ({ ...f, naam: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Contactpersoon</Label>
                <Input value={leverancierForm.contactpersoon} onChange={(e) => setLeverancierForm((f) => ({ ...f, contactpersoon: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Telefoon</Label>
                <Input value={leverancierForm.telefoon} onChange={(e) => setLeverancierForm((f) => ({ ...f, telefoon: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input value={leverancierForm.email} onChange={(e) => setLeverancierForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Website</Label>
                <Input value={leverancierForm.website} onChange={(e) => setLeverancierForm((f) => ({ ...f, website: e.target.value }))} placeholder="https://" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notities</Label>
              <Textarea rows={2} value={leverancierForm.notities} onChange={(e) => setLeverancierForm((f) => ({ ...f, notities: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeverancierDialoog(null)}>Annuleren</Button>
            <Button onClick={slaLeverancierOp} disabled={!leverancierForm.naam.trim()}>Opslaan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Artikel dialoog ── */}
      <Dialog open={artikelDialoog !== null} onOpenChange={(o) => !o && setArtikelDialoog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{artikelDialoog === "nieuw" ? "Artikel toevoegen" : "Artikel bewerken"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Omschrijving *</Label>
              <Input value={artikelForm.omschrijving} onChange={(e) => setArtikelForm((f) => ({ ...f, omschrijving: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Leverancier</Label>
                <Select value={artikelForm.leverancier_id || "__geen__"} onValueChange={(v) => setArtikelForm((f) => ({ ...f, leverancier_id: v === "__geen__" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecteer..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__geen__">Geen leverancier</SelectItem>
                    {leveranciers.map((l) => (
                      <SelectItem key={l.id} value={String(l.id)}>{l.naam}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Artikelcode</Label>
                <Input value={artikelForm.artikelcode} onChange={(e) => setArtikelForm((f) => ({ ...f, artikelcode: e.target.value }))} placeholder="Bijv. ART-001" />
              </div>
              <div className="space-y-1.5">
                <Label>Categorie</Label>
                <Select value={artikelForm.categorie} onValueChange={(v) => setArtikelForm((f) => ({ ...f, categorie: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIEEN.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Eenheid</Label>
                <Select value={artikelForm.eenheid} onValueChange={(v) => setArtikelForm((f) => ({ ...f, eenheid: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EENHEDEN.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Inkoopprijs (ex. BTW)</Label>
                <Input type="number" step="0.01" min="0" value={artikelForm.inkoopprijs} onChange={(e) => setArtikelForm((f) => ({ ...f, inkoopprijs: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Verkoopprijs (ex. BTW)</Label>
                <Input type="number" step="0.01" min="0" value={artikelForm.verkoopprijs} onChange={(e) => setArtikelForm((f) => ({ ...f, verkoopprijs: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArtikelDialoog(null)}>Annuleren</Button>
            <Button onClick={slaArtikelOp} disabled={!artikelForm.omschrijving.trim()}>Opslaan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CSV import dialoog ── */}
      <Dialog open={importDialoog} onOpenChange={setImportDialoog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Artikelen importeren via CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              Plak hieronder uw CSV-data. Kolommen gescheiden door puntkomma (;).<br />
              Kolomvolgorde: <span className="font-mono text-xs">artikelcode;omschrijving;eenheid;inkoopprijs;verkoopprijs;categorie;leverancier_naam</span>
            </p>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Voorbeeldbestand downloaden
            </Button>
            <Textarea
              rows={10}
              value={importCsv}
              onChange={(e) => setImportCsv(e.target.value)}
              placeholder={"artikelcode;omschrijving;eenheid;inkoopprijs;verkoopprijs;categorie;leverancier_naam\nART-001;Brandwerende kit 600ml;st;8,50;14,95;materiaal;Hilti"}
              className="font-mono text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialoog(false)}>Annuleren</Button>
            <Button onClick={handleImport} disabled={importBezig || !importCsv.trim()}>
              <Upload className="h-4 w-4 mr-1.5" />
              {importBezig ? "Importeren..." : "Importeren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Verwijder leverancier ── */}
      <AlertDialog open={teVerwijderenLev !== null} onOpenChange={(o) => !o && setTeVerwijderenLev(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leverancier verwijderen</AlertDialogTitle>
            <AlertDialogDescription>
              Weet u zeker dat u deze leverancier wilt verwijderen? Gekoppelde artikelen worden losgekoppeld.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => teVerwijderenLev && verwijderLeverancier.mutate(teVerwijderenLev)}>
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Verwijder artikel ── */}
      <AlertDialog open={teVerwijderenArt !== null} onOpenChange={(o) => !o && setTeVerwijderenArt(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Artikel verwijderen</AlertDialogTitle>
            <AlertDialogDescription>Weet u zeker dat u dit artikel wilt verwijderen?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => teVerwijderenArt && verwijderArtikel.mutate(teVerwijderenArt)}>
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
