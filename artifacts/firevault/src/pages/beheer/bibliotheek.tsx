import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  useListVoorzieningTypes,
  useListLabels,
  useCreateLabel,
  useUpdateLabel,
  getListLabelsQueryKey,
} from "@workspace/api-client-react";
import type { VoorzieningType, Label } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label as UiLabel } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { TabDocumenten } from "./documenten-tab";
import {
  Archive,
  ArchiveRestore,
  BookOpen,
  Building2,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  FlameKindling,
  Plus,
  ShieldCheck,
  Wind,
  XCircle,
} from "lucide-react";

const GEEN_TYPE = "__alle__";

const WERENDHEID_OPTIES: { waarde: string; label: string; omschrijving: string }[] = [
  { waarde: "WRD30", label: "WRD 30", omschrijving: "Rookwerendheid 30 minuten (Weerstand Rookdoorgang)" },
  { waarde: "EW20", label: "EW 20", omschrijving: "Brandwerendheid WBDBO 20 minuten — stralingseis ≤ 15 kW/m²" },
  { waarde: "EW30", label: "EW 30", omschrijving: "Brandwerendheid WBDBO 30 minuten — stralingseis ≤ 15 kW/m²" },
  { waarde: "EW60", label: "EW 60", omschrijving: "Brandwerendheid WBDBO 60 minuten — stralingseis ≤ 15 kW/m²" },
  { waarde: "EI30", label: "EI 30", omschrijving: "Brandwerendheid 30 minuten — integriteit en isolatie" },
  { waarde: "EI60", label: "EI 60", omschrijving: "Brandwerendheid 60 minuten — integriteit en isolatie" },
];

const FABRIKANTEN: { naam: string; url: string | null }[] = [
  { naam: "Mulcol", url: "https://www.mulcol.com/selector" },
  { naam: "Hilti", url: "https://firestop.hilti.com/" },
  { naam: "Promat", url: null },
  { naam: "Rockwool", url: "https://www.rockwool.com/nl/producten/categorieen/fire-protection/" },
  { naam: "Nullifire", url: "https://www.nullifire.com/nl-nl/" },
  { naam: "Flamro", url: "https://flamro.nl/product-selector" },
  { naam: "Red Profs", url: "https://redprofs.com/" },
];

// ── Tab Applicaties ──────────────────────────────────────────────────────────
function TabApplicaties() {
  const { data: typen = [], isLoading } = useListVoorzieningTypes();

  const perCategorie: Record<string, VoorzieningType[]> = {};
  for (const t of typen as VoorzieningType[]) {
    if (!perCategorie[t.categorie]) perCategorie[t.categorie] = [];
    perCategorie[t.categorie].push(t);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        De applicatie-catalogus bevat alle genummerde voorzieningstypen (SnagStream-nummering).
        Bij het aanmaken van een concrete spot kiest de monteur een applicatie uit deze catalogus.
      </p>
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 bg-muted animate-pulse rounded" />
          ))}
        </div>
      ) : (
        Object.entries(perCategorie).map(([cat, items]) => (
          <Card key={cat}>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {cat}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <tbody>
                  {items.map((t) => (
                    <tr
                      key={t.code}
                      className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${
                        !t.actief ? "opacity-40" : ""
                      }`}
                    >
                      <td className="px-4 py-2 w-20">
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                          {t.code}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-medium">{t.naam}</td>
                      <td className="px-4 py-2 text-right">
                        {!t.actief && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            Inactief
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

interface ExcelRij {
  type_code: string;
  naam: string;
  fabrikant?: string;
  testnorm?: string;
}

interface ImportResultaat {
  geslaagd: number;
  mislukt: Array<{ rij: number; reden: string }>;
}

// ── Tab Toepassingen ─────────────────────────────────────────────────────────
function TabToepassingen() {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState(GEEN_TYPE);
  const [inclGearchiveerd, setInclGearchiveerd] = useState(false);
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importRijen, setImportRijen] = useState<ExcelRij[]>([]);
  const [importResultaat, setImportResultaat] = useState<ImportResultaat | null>(null);
  const [importBezig, setImportBezig] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: typen = [] } = useListVoorzieningTypes();
  const { data: labels = [], isLoading } = useListLabels({
    type_code: typeFilter === GEEN_TYPE ? undefined : typeFilter,
    inclusief_gearchiveerd: inclGearchiveerd || undefined,
  });

  const maakLabel = useCreateLabel();
  const wijzigLabel = useUpdateLabel();

  const [nieuw, setNieuw] = useState({
    type_code: "",
    naam: "",
    fabrikant: "",
    testnorm: "",
  });

  async function bewaarNieuw() {
    if (!nieuw.type_code || !nieuw.naam.trim()) return;
    await maakLabel.mutateAsync({
      data: {
        type_code: nieuw.type_code,
        naam: nieuw.naam.trim(),
        fabrikant: nieuw.fabrikant.trim() || undefined,
        testnorm: nieuw.testnorm.trim() || undefined,
      },
    });
    await queryClient.invalidateQueries({ queryKey: getListLabelsQueryKey() });
    setNieuw({ type_code: "", naam: "", fabrikant: "", testnorm: "" });
    setNieuwOpen(false);
  }

  async function toggleArchief(l: Label) {
    await wijzigLabel.mutateAsync({ id: l.id, data: { gearchiveerd: !l.gearchiveerd } });
    await queryClient.invalidateQueries({ queryKey: getListLabelsQueryKey() });
  }

  function verwerkBestand(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        const rijen: ExcelRij[] = [];
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          const type_code = String(r[0] ?? "").trim();
          const naam = String(r[1] ?? "").trim();
          if (!type_code || !naam) continue;
          rijen.push({
            type_code,
            naam,
            fabrikant: String(r[2] ?? "").trim() || undefined,
            testnorm: String(r[3] ?? "").trim() || undefined,
          });
        }
        setImportRijen(rijen);
        setImportResultaat(null);
      } catch {
        setImportRijen([]);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function voerImportUit() {
    setImportBezig(true);
    const resultaat: ImportResultaat = { geslaagd: 0, mislukt: [] };
    for (let i = 0; i < importRijen.length; i++) {
      const rij = importRijen[i];
      try {
        await maakLabel.mutateAsync({
          data: {
            type_code: rij.type_code,
            naam: rij.naam,
            fabrikant: rij.fabrikant || undefined,
            testnorm: rij.testnorm || undefined,
          },
        });
        resultaat.geslaagd++;
      } catch {
        resultaat.mislukt.push({ rij: i + 2, reden: "Aanmaak mislukt (mogelijk duplicaat)" });
      }
    }
    await queryClient.invalidateQueries({ queryKey: getListLabelsQueryKey() });
    setImportResultaat(resultaat);
    setImportBezig(false);
  }

  function sluitImport() {
    setImportOpen(false);
    setImportRijen([]);
    setImportResultaat(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const typeLookup = Object.fromEntries(
    (typen as VoorzieningType[]).map((t) => [t.code, t])
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Toepassingen zijn concrete producten of productsoorten gekoppeld aan een applicatie-type,
        zoals "Schakelmanchet Multicollar Slim". Ze zijn beschikbaar als keuze bij het registreren
        van een concrete spot.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Importeren via Excel
        </Button>
        <Button onClick={() => setNieuwOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nieuwe toepassing
        </Button>
      </div>

      <Dialog open={importOpen} onOpenChange={(o) => { if (!o) sluitImport(); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Toepassingen importeren via Excel</DialogTitle>
            <DialogDescription>
              Upload een Excel-bestand (.xlsx). Kolom A: applicatie-code, B: naam, C: fabrikant (optioneel), D: werendheid (optioneel).
              Rij 1 is de koptekst en wordt overgeslagen.
            </DialogDescription>
          </DialogHeader>

          {!importResultaat ? (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-muted rounded-lg p-6 text-center">
                <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-3">
                  Kies een Excel-bestand om te importeren
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) verwerkBestand(f);
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Bestand kiezen
                </Button>
              </div>

              {importRijen.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    {importRijen.length} rij(en) gevonden — voorbeeld:
                  </p>
                  <div className="border rounded-md overflow-auto max-h-48">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left p-2 font-medium">Type</th>
                          <th className="text-left p-2 font-medium">Naam</th>
                          <th className="text-left p-2 font-medium">Fabrikant</th>
                          <th className="text-left p-2 font-medium">Werendheid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importRijen.slice(0, 10).map((r, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="p-2 font-mono">{r.type_code}</td>
                            <td className="p-2">{r.naam}</td>
                            <td className="p-2 text-muted-foreground">{r.fabrikant ?? "—"}</td>
                            <td className="p-2 text-muted-foreground">{r.testnorm ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importRijen.length > 10 && (
                    <p className="text-xs text-muted-foreground">
                      … en nog {importRijen.length - 10} rij(en) meer.
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">{importResultaat.geslaagd} toepassing(en) geimporteerd</span>
              </div>
              {importResultaat.mislukt.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-destructive flex items-center gap-1">
                    <XCircle className="h-4 w-4" />
                    {importResultaat.mislukt.length} rij(en) mislukt:
                  </p>
                  {importResultaat.mislukt.map((m, i) => (
                    <p key={i} className="text-xs text-muted-foreground pl-5">
                      Rij {m.rij}: {m.reden}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={sluitImport}>
              {importResultaat ? "Sluiten" : "Annuleren"}
            </Button>
            {!importResultaat && (
              <Button
                onClick={voerImportUit}
                disabled={importRijen.length === 0 || importBezig}
              >
                {importBezig
                  ? `Importeren... (${importRijen.length} rijen)`
                  : `${importRijen.length} rij(en) importeren`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-48">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter op applicatie-type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GEEN_TYPE}>Alle types</SelectItem>
                  {(typen as VoorzieningType[]).map((t) => (
                    <SelectItem key={t.code} value={t.code}>
                      <span className="font-mono text-xs mr-2 text-muted-foreground">{t.code}</span>
                      {t.naam}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="incl-gearch"
                checked={inclGearchiveerd}
                onCheckedChange={setInclGearchiveerd}
              />
              <UiLabel htmlFor="incl-gearch" className="text-sm cursor-pointer">
                Inclusief gearchiveerd
              </UiLabel>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : (labels as Label[]).length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Geen toepassingen gevonden.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Naam / productsoort</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Fabrikant</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Werendheid</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {(labels as Label[]).map((l) => (
                  <tr
                    key={l.id}
                    className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${
                      l.gearchiveerd ? "opacity-50" : ""
                    }`}
                  >
                    <td className="p-3">
                      {typeLookup[l.type_code] ? (
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                          {l.type_code}
                        </span>
                      ) : (
                        <span className="text-muted-foreground font-mono text-xs">{l.type_code}</span>
                      )}
                    </td>
                    <td className="p-3 font-medium">{l.naam}</td>
                    <td className="p-3 text-muted-foreground">{l.fabrikant ?? "—"}</td>
                    <td className="p-3">
                      {l.testnorm ? (
                        <Badge variant="outline" className="text-xs font-mono">
                          {l.testnorm}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      {l.gearchiveerd ? (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Gearchiveerd
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50">
                          Actief
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => toggleArchief(l)}
                        disabled={wijzigLabel.isPending}
                      >
                        {l.gearchiveerd ? (
                          <><ArchiveRestore className="h-3.5 w-3.5" />Herstellen</>
                        ) : (
                          <><Archive className="h-3.5 w-3.5" />Archiveren</>
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={nieuwOpen} onOpenChange={setNieuwOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nieuwe toepassing toevoegen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <UiLabel>Applicatie-type *</UiLabel>
              <Select
                value={nieuw.type_code}
                onValueChange={(v) => setNieuw((n) => ({ ...n, type_code: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kies een type" />
                </SelectTrigger>
                <SelectContent>
                  {(typen as VoorzieningType[]).filter((t) => t.actief).map((t) => (
                    <SelectItem key={t.code} value={t.code}>
                      <span className="font-mono text-xs mr-2 text-muted-foreground">{t.code}</span>
                      {t.naam}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <UiLabel htmlFor="nieuw-naam">Naam / productsoort *</UiLabel>
              <Input
                id="nieuw-naam"
                placeholder="Bijv. Schakelmanchet Multicollar Slim"
                value={nieuw.naam}
                onChange={(e) => setNieuw((n) => ({ ...n, naam: e.target.value }))}
              />
            </div>
            <div>
              <UiLabel>Werendheid</UiLabel>
              <Select
                value={nieuw.testnorm}
                onValueChange={(v) => setNieuw((n) => ({ ...n, testnorm: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kies werendheid (optioneel)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Niet opgegeven</SelectItem>
                  {WERENDHEID_OPTIES.map((w) => (
                    <SelectItem key={w.waarde} value={w.waarde}>
                      <span className="font-mono text-xs mr-2">{w.label}</span>
                      <span className="text-muted-foreground text-xs">{w.omschrijving.split(" — ")[0]}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <UiLabel htmlFor="nieuw-fabrikant">Fabrikant</UiLabel>
              <Input
                id="nieuw-fabrikant"
                placeholder="Optioneel"
                value={nieuw.fabrikant}
                onChange={(e) => setNieuw((n) => ({ ...n, fabrikant: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNieuwOpen(false)}>
              Annuleren
            </Button>
            <Button
              onClick={bewaarNieuw}
              disabled={!nieuw.type_code || !nieuw.naam.trim() || maakLabel.isPending}
            >
              {maakLabel.isPending ? "Opslaan..." : "Toevoegen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Tab Fabrikanten ──────────────────────────────────────────────────────────
function TabFabrikanten() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Erkende fabrikanten van brandpreventieve producten. Via de productlink kunt u het
        aanbod en de goedgekeurde productcombinaties raadplegen.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FABRIKANTEN.map((f) => (
          <Card key={f.naam} className="flex flex-col">
            <CardContent className="pt-5 pb-4 flex flex-col gap-3 flex-1">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm leading-tight">{f.naam}</p>
                  {f.url ? (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{f.url.replace("https://", "")}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-0.5">Geen website</p>
                  )}
                </div>
              </div>
              {f.url && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs gap-1.5 mt-auto"
                  asChild
                >
                  <a href={f.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3" />
                    Productcatalogus openen
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Tab Meetwaarden ──────────────────────────────────────────────────────────
function TabMeetwaarden() {
  const groepen = [
    {
      titel: "Rookwerendheid (WRD)",
      icoon: Wind,
      kleur: "text-blue-600",
      bg: "bg-blue-50",
      items: WERENDHEID_OPTIES.filter((w) => w.waarde.startsWith("WRD")),
    },
    {
      titel: "Brandwerendheid WBDBO (EW)",
      icoon: FlameKindling,
      kleur: "text-orange-600",
      bg: "bg-orange-50",
      items: WERENDHEID_OPTIES.filter((w) => w.waarde.startsWith("EW")),
    },
    {
      titel: "Brandwerendheid (EI)",
      icoon: ShieldCheck,
      kleur: "text-red-600",
      bg: "bg-red-50",
      items: WERENDHEID_OPTIES.filter((w) => w.waarde.startsWith("EI")),
    },
  ];

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Standaard werendheidsklassen die bij een concrete spot geselecteerd kunnen worden.
        WRD = rookwerendheid, EW = brandwerendheid met stralingseis (WBDBO),
        EI = brandwerendheid op integriteit en isolatie.
      </p>
      {groepen.map((g) => (
        <Card key={g.titel}>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <span className={`p-1 rounded ${g.bg}`}>
                <g.icoon className={`h-3.5 w-3.5 ${g.kleur}`} />
              </span>
              {g.titel}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/20">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground w-24">Code</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Omschrijving</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((w) => (
                  <tr key={w.waarde} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold bg-muted px-2 py-1 rounded">
                        {w.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{w.omschrijving}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Hoofdpagina ──────────────────────────────────────────────────────────────
export default function Bibliotheek() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bibliotheek</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Centrale stamgegevens voor applicaties, productsoorten, fabrikanten en werendheidsklassen.
            Items uit de bibliotheek zijn beschikbaar als keuzemenu bij het registreren van concrete spots in gebouwen.
          </p>
        </div>
      </div>

      <Tabs defaultValue="applicaties">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="applicaties">Applicaties</TabsTrigger>
          <TabsTrigger value="toepassingen">Toepassingen</TabsTrigger>
          <TabsTrigger value="documenten">Documenten</TabsTrigger>
          <TabsTrigger value="fabrikanten">Fabrikanten</TabsTrigger>
          <TabsTrigger value="meetwaarden">Meetwaarden</TabsTrigger>
        </TabsList>

        <TabsContent value="applicaties" className="mt-5">
          <TabApplicaties />
        </TabsContent>

        <TabsContent value="toepassingen" className="mt-5">
          <TabToepassingen />
        </TabsContent>

        <TabsContent value="documenten" className="mt-5">
          <TabDocumenten />
        </TabsContent>

        <TabsContent value="fabrikanten" className="mt-5">
          <TabFabrikanten />
        </TabsContent>

        <TabsContent value="meetwaarden" className="mt-5">
          <TabMeetwaarden />
        </TabsContent>
      </Tabs>
    </div>
  );
}
