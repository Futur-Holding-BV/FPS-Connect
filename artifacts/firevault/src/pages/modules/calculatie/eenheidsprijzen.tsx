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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, Plus, Pencil, Power, Upload, Download, BookOpen, Search, SlidersHorizontal,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListEenheidsprijzen,
  useCreateEenheidsprijs,
  useUpdateEenheidsprijs,
  useDeleteEenheidsprijs,
  getListEenheidsprijzenQueryKey,
} from "@workspace/api-client-react";
import type { EenheidsPrijs, EenheidsPrijsInput } from "@workspace/api-client-react";

const CATEGORIEEN: { waarde: string; label: string }[] = [
  { waarde: "brandpreventie", label: "Brandpreventie" },
  { waarde: "deuren_kozijnen", label: "Deuren & kozijnen" },
  { waarde: "elektrotechniek", label: "Elektrotechniek" },
  { waarde: "glas", label: "Glas" },
  { waarde: "magazijn_kleinmateriaal", label: "Magazijn / kleinmateriaal" },
  { waarde: "schilderwerk", label: "Schilderwerk" },
  { waarde: "timmerwerk", label: "Timmerwerk" },
  { waarde: "werktuigbouwkundig", label: "Werktuigbouwkundig" },
  { waarde: "algemeen_arbeid", label: "Algemeen arbeid" },
  { waarde: "overig", label: "Overig" },
];

const EENHEDEN = ["m2", "m1", "stuk", "uur", "set", "m3", "dag", "lm", "kg", "pst"];
const BTW_CODES = [
  { waarde: "hoog", label: "Hoog (21%)" },
  { waarde: "laag", label: "Laag (9%)" },
  { waarde: "nul", label: "Nul (0%)" },
  { waarde: "verlegd", label: "Verlegd" },
];

function formatBedrag(n: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
}

function categoriLabel(waarde: string) {
  return CATEGORIEEN.find((c) => c.waarde === waarde)?.label ?? waarde;
}

const LEEG_FORM: EenheidsPrijsInput = {
  code: "",
  omschrijving: "",
  categorie: "brandpreventie",
  eenheid: "stuk",
  materiaalcomponent: 0,
  arbeidscomponent: 0,
  normtijd: 0,
  kostprijs: 0,
  verkoopprijs: 0,
  marge: 0,
  btw_code: null,
  geldig_vanaf: null,
  actief: true,
  opmerkingen: null,
  inclusies: null,
  exclusies: null,
  prijsbasis_opmerking: null,
};

export default function EenheidsprijzenBeheer() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [zoek, setZoek] = useState("");
  const [filterCategorie, setFilterCategorie] = useState("__alle__");
  const [filterActief, setFilterActief] = useState("true");

  const [dialoog, setDialoog] = useState<null | "nieuw" | number>(null);
  const [form, setForm] = useState<EenheidsPrijsInput>(LEEG_FORM);
  const [teDeactiveren, setTeDeactiveren] = useState<EenheidsPrijs | null>(null);

  const params = {
    ...(zoek ? { zoek } : {}),
    ...(filterCategorie !== "__alle__" ? { categorie: filterCategorie } : {}),
    ...(filterActief !== "__alle__" ? { actief: filterActief } : {}),
  };

  const { data: prijzen = [], isLoading } = useListEenheidsprijzen(params);

  const maakAan = useCreateEenheidsprijs({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListEenheidsprijzenQueryKey() });
        setDialoog(null);
        toast({ title: "Eenheidsprijs aangemaakt" });
      },
      onError: (e: unknown) => {
        const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Fout bij aanmaken";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  const bijwerken = useUpdateEenheidsprijs({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListEenheidsprijzenQueryKey() });
        setDialoog(null);
        toast({ title: "Eenheidsprijs bijgewerkt" });
      },
      onError: (e: unknown) => {
        const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Fout bij bijwerken";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  const deactiveren = useDeleteEenheidsprijs({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListEenheidsprijzenQueryKey() });
        setTeDeactiveren(null);
        toast({ title: "Eenheidsprijs gedeactiveerd" });
      },
      onError: () => toast({ title: "Fout bij deactiveren", variant: "destructive" }),
    },
  });

  function openNieuw() {
    setForm({ ...LEEG_FORM });
    setDialoog("nieuw");
  }

  function openBewerken(p: EenheidsPrijs) {
    setForm({
      code: p.code,
      omschrijving: p.omschrijving,
      categorie: p.categorie,
      eenheid: p.eenheid,
      materiaalcomponent: p.materiaalcomponent,
      arbeidscomponent: p.arbeidscomponent,
      normtijd: p.normtijd,
      kostprijs: p.kostprijs,
      verkoopprijs: p.verkoopprijs,
      marge: p.marge,
      btw_code: p.btw_code ?? null,
      geldig_vanaf: p.geldig_vanaf ?? null,
      actief: p.actief,
      opmerkingen: p.opmerkingen ?? null,
      inclusies: p.inclusies ?? null,
      exclusies: p.exclusies ?? null,
      prijsbasis_opmerking: p.prijsbasis_opmerking ?? null,
    });
    setDialoog(p.id);
  }

  function setVeld<K extends keyof EenheidsPrijsInput>(k: K, v: EenheidsPrijsInput[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function opslaan() {
    if (!form.code.trim() || !form.omschrijving.trim()) {
      toast({ title: "Code en omschrijving zijn verplicht", variant: "destructive" });
      return;
    }
    if (dialoog === "nieuw") {
      maakAan.mutate({ data: form });
    } else if (typeof dialoog === "number") {
      bijwerken.mutate({ id: dialoog, data: form });
    }
  }

  const downloadTemplate = () => {
    window.location.href = "/api/import/template/eenheidsprijzen";
  };

  const bezig = maakAan.isPending || bijwerken.isPending;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/modules/calculatie/leveranciers")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-semibold">Eenheidsprijzenbibliotheek</h1>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="w-4 h-4 mr-1" /> Template downloaden
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/beheer/import")}>
            <Upload className="w-4 h-4 mr-1" /> Importeren
          </Button>
          <Button size="sm" onClick={openNieuw}>
            <Plus className="w-4 h-4 mr-1" /> Nieuwe eenheidsprijs
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Zoeken op code of omschrijving..."
                value={zoek}
                onChange={(e) => setZoek(e.target.value)}
                className="pl-8"
              />
            </div>
            <div className="flex gap-2">
              <Select value={filterCategorie} onValueChange={setFilterCategorie}>
                <SelectTrigger className="w-[200px]">
                  <SlidersHorizontal className="w-4 h-4 mr-1" />
                  <SelectValue placeholder="Alle categorieen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__alle__">Alle categorieen</SelectItem>
                  {CATEGORIEEN.map((c) => (
                    <SelectItem key={c.waarde} value={c.waarde}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterActief} onValueChange={setFilterActief}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Actief</SelectItem>
                  <SelectItem value="false">Inactief</SelectItem>
                  <SelectItem value="__alle__">Alle</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Laden...</div>
          ) : prijzen.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <BookOpen className="w-10 h-10 text-muted-foreground mx-auto" />
              <p className="font-medium">Geen eenheidsprijzen gevonden</p>
              <p className="text-sm text-muted-foreground">
                Voeg eenheidsprijzen toe via de knop hierboven of importeer ze vanuit Excel.
              </p>
              <Button size="sm" onClick={openNieuw} className="mt-2">
                <Plus className="w-4 h-4 mr-1" /> Eerste eenheidsprijs toevoegen
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Code</TableHead>
                    <TableHead>Omschrijving</TableHead>
                    <TableHead>Categorie</TableHead>
                    <TableHead className="text-center">Eenheid</TableHead>
                    <TableHead className="text-right">Kostprijs</TableHead>
                    <TableHead className="text-right">Verkoopprijs</TableHead>
                    <TableHead className="text-right">Normtijd</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prijzen.map((p) => (
                    <TableRow key={p.id} className="group">
                      <TableCell className="font-mono text-sm font-medium">{p.code}</TableCell>
                      <TableCell>
                        <div className="font-medium">{p.omschrijving}</div>
                        {p.opmerkingen && (
                          <div className="text-xs text-muted-foreground truncate max-w-[280px]">{p.opmerkingen}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{categoriLabel(p.categorie)}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="font-mono text-xs">{p.eenheid}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatBedrag(p.kostprijs)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatBedrag(p.verkoopprijs)}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {p.normtijd > 0 ? `${p.normtijd.toFixed(2)} u` : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={p.actief ? "default" : "secondary"}>
                          {p.actief ? "Actief" : "Inactief"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Bewerken"
                            onClick={() => openBewerken(p)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                            title={p.actief ? "Deactiveren" : "Al inactief"}
                            disabled={!p.actief}
                            onClick={() => setTeDeactiveren(p)}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Eenheidsprijs dialoog */}
      <Dialog open={dialoog !== null} onOpenChange={(o) => { if (!o) setDialoog(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialoog === "nieuw" ? "Nieuwe eenheidsprijs" : "Eenheidsprijs bewerken"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Basis */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Code <span className="text-destructive">*</span></Label>
                <Input
                  value={form.code}
                  onChange={(e) => setVeld("code", e.target.value)}
                  placeholder="bv. BP-001"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Eenheid <span className="text-destructive">*</span></Label>
                <Select value={form.eenheid} onValueChange={(v) => setVeld("eenheid", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EENHEDEN.map((e) => (
                      <SelectItem key={e} value={e}>{e}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Omschrijving <span className="text-destructive">*</span></Label>
              <Input
                value={form.omschrijving}
                onChange={(e) => setVeld("omschrijving", e.target.value)}
                placeholder="Korte omschrijving van de prestatie"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Categorie</Label>
                <Select value={form.categorie} onValueChange={(v) => setVeld("categorie", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIEEN.map((c) => (
                      <SelectItem key={c.waarde} value={c.waarde}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>BTW-code</Label>
                <Select
                  value={form.btw_code ?? "__geen__"}
                  onValueChange={(v) => setVeld("btw_code", v === "__geen__" ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Kies BTW..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__geen__">Niet opgegeven</SelectItem>
                    {BTW_CODES.map((b) => (
                      <SelectItem key={b.waarde} value={b.waarde}>{b.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Prijsopbouw */}
            <div className="border rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Prijsopbouw</p>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Materiaalcomponent</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.materiaalcomponent ?? 0}
                    onChange={(e) => setVeld("materiaalcomponent", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Arbeidscomponent</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.arbeidscomponent ?? 0}
                    onChange={(e) => setVeld("arbeidscomponent", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Normtijd (uren)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.normtijd ?? 0}
                    onChange={(e) => setVeld("normtijd", parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Kostprijs</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.kostprijs ?? 0}
                    onChange={(e) => setVeld("kostprijs", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Verkoopprijs</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.verkoopprijs ?? 0}
                    onChange={(e) => setVeld("verkoopprijs", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Marge (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={form.marge ?? 0}
                    onChange={(e) => setVeld("marge", parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Inclusies (wat is inbegrepen)</Label>
                <Textarea
                  value={form.inclusies ?? ""}
                  onChange={(e) => setVeld("inclusies", e.target.value || null)}
                  rows={2}
                  placeholder="bv. inclusief montagemateriaal, reinigen..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Exclusies (wat is niet inbegrepen)</Label>
                <Textarea
                  value={form.exclusies ?? ""}
                  onChange={(e) => setVeld("exclusies", e.target.value || null)}
                  rows={2}
                  placeholder="bv. exclusief steigerkosten, vergunningen..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Opmerkingen</Label>
                <Textarea
                  value={form.opmerkingen ?? ""}
                  onChange={(e) => setVeld("opmerkingen", e.target.value || null)}
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Geldig vanaf</Label>
                  <Input
                    type="date"
                    value={form.geldig_vanaf ?? ""}
                    onChange={(e) => setVeld("geldig_vanaf", e.target.value || null)}
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="actief-check"
                    checked={form.actief ?? true}
                    onChange={(e) => setVeld("actief", e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  <Label htmlFor="actief-check" className="cursor-pointer">Actief</Label>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialoog(null)}>Annuleren</Button>
            <Button onClick={opslaan} disabled={bezig}>
              {bezig ? "Bezig..." : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactiveer bevestiging */}
      <AlertDialog open={teDeactiveren !== null} onOpenChange={(o) => { if (!o) setTeDeactiveren(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eenheidsprijs deactiveren?</AlertDialogTitle>
            <AlertDialogDescription>
              De eenheidsprijs <strong>{teDeactiveren?.code}</strong> wordt gedeactiveerd en is niet meer
              beschikbaar als keuze in nieuwe calculatieregels. Bestaande regels blijven ongewijzigd.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (teDeactiveren) deactiveren.mutate({ id: teDeactiveren.id });
              }}
            >
              Deactiveren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
