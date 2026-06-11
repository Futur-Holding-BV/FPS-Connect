import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  useListVoorzieningTypes,
  useCreateVoorzieningType,
  useUpdateVoorzieningType,
  getListVoorzieningTypesQueryKey,
  useListLabels,
  useCreateLabel,
  useUpdateLabel,
  getListLabelsQueryKey,
  useListFabrikanten,
  useCreateFabrikant,
  useUpdateFabrikant,
  getListFabrikantenQueryKey,
} from "@workspace/api-client-react";
import type { VoorzieningType, Label, Fabrikant } from "@workspace/api-client-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TabDocumenten } from "./documenten-tab";
import { ToepassingDetailDialog } from "./toepassing-detail";
import { ApplicatieDetailDialog } from "./applicatie-detail";
import { useVoorkeur } from "@/hooks/use-voorkeur";
import { useToast } from "@/hooks/use-toast";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import {
  Archive,
  ArchiveRestore,
  BookOpen,
  Building2,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  FlameKindling,
  Link2,
  Pencil,
  Plus,
  ShieldCheck,
  Wind,
  X,
  XCircle,
} from "lucide-react";

// Robuuste toegang tot de xlsx-API: afhankelijk van de module-interop kunnen de
// functies onder de namespace of onder .default staan.
const xlsxApi: typeof XLSX =
  typeof (XLSX as { read?: unknown }).read === "function"
    ? XLSX
    : (((XLSX as { default?: typeof XLSX }).default ?? XLSX) as typeof XLSX);

// Zet een API-fout om naar een begrijpelijke melding (toont het serverbericht
// i.p.v. een misleidende standaardtekst).
function foutmelding(err: unknown, standaard: string): string {
  const e = err as { status?: number; data?: { error?: string } } | null;
  if (e?.status === 401) return "U bent niet meer ingelogd. Log opnieuw in en probeer het opnieuw.";
  if (e?.status === 403)
    return "U heeft geen bevoegdheid voor deze actie. Neem contact op met een beheerder.";
  const serverbericht = typeof e?.data?.error === "string" ? e.data.error.trim() : "";
  return serverbericht || standaard;
}

const GEEN_TYPE = "__alle__";
const ONGEKOPPELD = "__ongekoppeld__";

const WERENDHEID_OPTIES: { waarde: string; label: string; omschrijving: string }[] = [
  { waarde: "WRD30", label: "WRD 30", omschrijving: "Rookwerendheid 30 minuten (Weerstand Rookdoorgang)" },
  { waarde: "EW20", label: "EW 20", omschrijving: "Brandwerendheid WBDBO 20 minuten — stralingseis ≤ 15 kW/m²" },
  { waarde: "EW30", label: "EW 30", omschrijving: "Brandwerendheid WBDBO 30 minuten — stralingseis ≤ 15 kW/m²" },
  { waarde: "EW60", label: "EW 60", omschrijving: "Brandwerendheid WBDBO 60 minuten — stralingseis ≤ 15 kW/m²" },
  { waarde: "EI30", label: "EI 30", omschrijving: "Brandwerendheid 30 minuten — integriteit en isolatie" },
  { waarde: "EI60", label: "EI 60", omschrijving: "Brandwerendheid 60 minuten — integriteit en isolatie" },
];

// ── Tab Applicaties ──────────────────────────────────────────────────────────
function TabApplicaties() {
  const queryClient = useQueryClient();
  const { heeftNiveau } = useBevoegdheid();
  const magAanmaken = heeftNiveau("bibliotheek", 3);
  const magBewerken = heeftNiveau("bibliotheek", 2);

  const [inclGearchiveerd, setInclGearchiveerd] = useVoorkeur(
    "bibliotheek_applicaties_incl_gearchiveerd",
    false,
  );
  const { data: typen = [], isLoading } = useListVoorzieningTypes({
    inclusief_inactief: inclGearchiveerd,
  });
  // Eén lijst met alle niet-gearchiveerde toepassingen; client-side gegroepeerd
  // per applicatie-code zodat per applicatie de gekoppelde toepassingen tonen
  // zonder een query per rij.
  const { data: labels = [] } = useListLabels({});
  const [gekozen, setGekozen] = useState<VoorzieningType | null>(null);

  const maakType = useCreateVoorzieningType();
  const wijzigType = useUpdateVoorzieningType();

  const [dialoogOpen, setDialoogOpen] = useState(false);
  const [bewerkCode, setBewerkCode] = useState<string | null>(null);
  const [form, setForm] = useState({ code: "", naam: "", categorie: "", volgorde: "" });
  const [fout, setFout] = useState<string | null>(null);

  const categorieOpties = Array.from(
    new Set((typen as VoorzieningType[]).map((t) => t.categorie)),
  ).sort();

  function openNieuw() {
    setBewerkCode(null);
    const maxVolgorde = (typen as VoorzieningType[]).reduce((m, t) => Math.max(m, t.volgorde), 0);
    setForm({ code: "", naam: "", categorie: "", volgorde: String(maxVolgorde + 1) });
    setFout(null);
    setDialoogOpen(true);
  }

  function openBewerk(t: VoorzieningType) {
    setBewerkCode(t.code);
    setForm({ code: t.code, naam: t.naam, categorie: t.categorie, volgorde: String(t.volgorde) });
    setFout(null);
    setDialoogOpen(true);
  }

  async function bewaar() {
    if (bewerkCode == null && !form.code.trim()) {
      setFout("Code is verplicht.");
      return;
    }
    if (bewerkCode == null && form.code.includes("/")) {
      setFout("Code mag geen schuine streep (/) bevatten.");
      return;
    }
    if (!form.naam.trim()) {
      setFout("Naam is verplicht.");
      return;
    }
    if (!form.categorie.trim()) {
      setFout("Categorie is verplicht.");
      return;
    }
    const volgordeNum = form.volgorde.trim() === "" ? 0 : Number(form.volgorde);
    if (Number.isNaN(volgordeNum)) {
      setFout("Volgorde moet een getal zijn.");
      return;
    }
    setFout(null);
    try {
      if (bewerkCode == null) {
        await maakType.mutateAsync({
          data: {
            code: form.code.trim(),
            naam: form.naam.trim(),
            categorie: form.categorie.trim(),
            volgorde: volgordeNum,
          },
        });
      } else {
        await wijzigType.mutateAsync({
          code: bewerkCode,
          data: {
            naam: form.naam.trim(),
            categorie: form.categorie.trim(),
            volgorde: volgordeNum,
          },
        });
      }
      await queryClient.invalidateQueries({ queryKey: getListVoorzieningTypesQueryKey() });
      setDialoogOpen(false);
    } catch (err) {
      setFout(foutmelding(err, "Opslaan mislukt. Probeer het opnieuw."));
    }
  }

  async function zetArchief(t: VoorzieningType) {
    try {
      await wijzigType.mutateAsync({ code: t.code, data: { actief: !t.actief } });
      await queryClient.invalidateQueries({ queryKey: getListVoorzieningTypesQueryKey() });
    } catch {
      // Bij een fout blijft de lijst ongewijzigd; gebruiker kan opnieuw proberen.
    }
  }

  const perCategorie: Record<string, VoorzieningType[]> = {};
  for (const t of typen as VoorzieningType[]) {
    if (!perCategorie[t.categorie]) perCategorie[t.categorie] = [];
    perCategorie[t.categorie].push(t);
  }

  const toepassingenPerCode: Record<string, Label[]> = {};
  for (const l of labels as Label[]) {
    for (const code of l.applicatie_codes ?? []) {
      if (!toepassingenPerCode[code]) toepassingenPerCode[code] = [];
      toepassingenPerCode[code].push(l);
    }
  }

  const bezig = maakType.isPending || wijzigType.isPending;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        De applicatie-catalogus bevat alle genummerde voorzieningstypen (SnagStream-nummering).
        Bij het aanmaken van een concrete spot kiest de monteur een applicatie uit deze catalogus.
        Klik op een applicatie om de gekoppelde toepassingen te bekijken en te beheren.
      </p>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Switch checked={inclGearchiveerd} onCheckedChange={setInclGearchiveerd} />
          Toon gearchiveerde
        </label>
        {magAanmaken && (
          <Button onClick={openNieuw}>
            <Plus className="h-4 w-4 mr-2" />
            Applicatie toevoegen
          </Button>
        )}
      </div>

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
                  {items.map((t) => {
                    const gekoppeld = toepassingenPerCode[t.code] ?? [];
                    return (
                      <tr
                        key={t.code}
                        onClick={() => setGekozen(t)}
                        className={`border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer ${
                          !t.actief ? "opacity-40" : ""
                        }`}
                      >
                        <td className="px-4 py-2.5 w-20 align-top">
                          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                            {t.code}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium">{t.naam}</div>
                          {gekoppeld.length > 0 ? (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {gekoppeld.map((l) => (
                                <Badge
                                  key={l.id}
                                  variant="secondary"
                                  className="text-xs font-normal"
                                >
                                  {l.naam}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              Geen toepassingen gekoppeld
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right align-top whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            {!t.actief && (
                              <Badge variant="outline" className="text-xs text-muted-foreground">
                                Gearchiveerd
                              </Badge>
                            )}
                            {magBewerken && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openBewerk(t);
                                  }}
                                  aria-label={`${t.naam} bewerken`}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  disabled={bezig}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    zetArchief(t);
                                  }}
                                  aria-label={
                                    t.actief ? `${t.naam} archiveren` : `${t.naam} herstellen`
                                  }
                                >
                                  {t.actief ? (
                                    <Archive className="h-3.5 w-3.5" />
                                  ) : (
                                    <ArchiveRestore className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))
      )}

      <ApplicatieDetailDialog
        applicatie={gekozen}
        open={gekozen !== null}
        onOpenChange={(o) => {
          if (!o) setGekozen(null);
        }}
      />

      <Dialog open={dialoogOpen} onOpenChange={setDialoogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bewerkCode == null ? "Applicatie toevoegen" : "Applicatie bewerken"}
            </DialogTitle>
            <DialogDescription>
              Leg de code (SnagStream-nummering), naam, categorie en volgorde van de applicatie vast.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <UiLabel htmlFor="applicatie-code">Code</UiLabel>
              <Input
                id="applicatie-code"
                value={form.code}
                onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))}
                placeholder="Bijv. 1.1"
                disabled={bewerkCode != null}
              />
              {bewerkCode != null && (
                <p className="text-xs text-muted-foreground">
                  De code kan na aanmaken niet worden gewijzigd.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <UiLabel htmlFor="applicatie-naam">Naam</UiLabel>
              <Input
                id="applicatie-naam"
                value={form.naam}
                onChange={(e) => setForm((s) => ({ ...s, naam: e.target.value }))}
                placeholder="Bijv. Doorvoering kabels"
              />
            </div>
            <div className="space-y-1.5">
              <UiLabel htmlFor="applicatie-categorie">Categorie</UiLabel>
              <Input
                id="applicatie-categorie"
                list="applicatie-categorie-opties"
                value={form.categorie}
                onChange={(e) => setForm((s) => ({ ...s, categorie: e.target.value }))}
                placeholder="Kies bestaande of typ een nieuwe categorie"
              />
              <datalist id="applicatie-categorie-opties">
                {categorieOpties.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <UiLabel htmlFor="applicatie-volgorde">Volgorde</UiLabel>
              <Input
                id="applicatie-volgorde"
                type="number"
                value={form.volgorde}
                onChange={(e) => setForm((s) => ({ ...s, volgorde: e.target.value }))}
                placeholder="0"
              />
            </div>
            {fout && <p className="text-sm text-destructive">{fout}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialoogOpen(false)} disabled={bezig}>
              Annuleren
            </Button>
            <Button onClick={bewaar} disabled={bezig}>
              {bezig ? "Bezig..." : bewerkCode == null ? "Toevoegen" : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

interface BulkResultaat {
  geslaagd: number;
  ongewijzigd: number;
  mislukt: Array<{ naam: string; reden: string }>;
}

// ── Tab Toepassingen ─────────────────────────────────────────────────────────
function TabToepassingen() {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter, wisTypeFilter] = useVoorkeur(
    "bibliotheek_toepassingen_type",
    GEEN_TYPE,
  );
  const [inclGearchiveerd, setInclGearchiveerd, wisInclGearchiveerd] =
    useVoorkeur("bibliotheek_toepassingen_incl_gearchiveerd", false);
  const filtersActief = typeFilter !== GEEN_TYPE || inclGearchiveerd;
  function wisFilters() {
    wisTypeFilter();
    wisInclGearchiveerd();
  }
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [detail, setDetail] = useState<Label | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importRijen, setImportRijen] = useState<ExcelRij[]>([]);
  const [importResultaat, setImportResultaat] = useState<ImportResultaat | null>(null);
  const [importBezig, setImportBezig] = useState(false);
  const [importFout, setImportFout] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { heeftNiveau } = useBevoegdheid();
  const magKoppelen = heeftNiveau("bibliotheek", 2);

  // Bulk-koppelen: geselecteerde toepassing-id's en de dialoog-state.
  const [geselecteerd, setGeselecteerd] = useState<Set<number>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCodes, setBulkCodes] = useState<string[]>([]);
  const [bulkBezig, setBulkBezig] = useState(false);
  const [bulkResultaat, setBulkResultaat] = useState<BulkResultaat | null>(null);

  // Bulk-archiveren/herstellen: dezelfde selectie wordt hergebruikt.
  const [archiefActie, setArchiefActie] = useState<"archiveren" | "herstellen" | null>(null);
  const [archiefBezig, setArchiefBezig] = useState(false);
  const [archiefResultaat, setArchiefResultaat] = useState<BulkResultaat | null>(null);

  const { data: typen = [] } = useListVoorzieningTypes();
  const { data: fabrikanten = [] } = useListFabrikanten();
  const { data: alleLabels = [], isLoading } = useListLabels({
    type_code:
      typeFilter === GEEN_TYPE || typeFilter === ONGEKOPPELD ? undefined : typeFilter,
    inclusief_gearchiveerd: inclGearchiveerd || undefined,
  });

  // "Zonder applicatie" toont uitsluitend toepassingen zonder applicatie-koppeling
  // (zoals net geimporteerde toepassingen). De server filtert alleen op een
  // specifieke code, dus dit filteren we client-side.
  const labels =
    typeFilter === ONGEKOPPELD
      ? (alleLabels as Label[]).filter((l) => (l.applicatie_codes ?? []).length === 0)
      : (alleLabels as Label[]);

  const maakLabel = useCreateLabel();
  const wijzigLabel = useUpdateLabel();

  const [nieuw, setNieuw] = useState({
    applicatie_codes: [] as string[],
    naam: "",
    fabrikantId: null as number | null,
    testnorm: "",
  });

  async function bewaarNieuw() {
    if (nieuw.applicatie_codes.length === 0 || !nieuw.naam.trim()) return;
    await maakLabel.mutateAsync({
      data: {
        applicatie_codes: nieuw.applicatie_codes,
        naam: nieuw.naam.trim(),
        fabrikant_id: nieuw.fabrikantId,
        testnorm: nieuw.testnorm.trim() || undefined,
      },
    });
    await queryClient.invalidateQueries({ queryKey: getListLabelsQueryKey() });
    setNieuw({ applicatie_codes: [], naam: "", fabrikantId: null, testnorm: "" });
    setNieuwOpen(false);
  }

  async function toggleArchief(l: Label) {
    await wijzigLabel.mutateAsync({ id: l.id, data: { gearchiveerd: !l.gearchiveerd } });
    await queryClient.invalidateQueries({ queryKey: getListLabelsQueryKey() });
  }

  function toggleSelectie(id: number) {
    setGeselecteerd((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function wisSelectie() {
    setGeselecteerd(new Set());
  }

  function openBulk() {
    setBulkCodes([]);
    setBulkResultaat(null);
    setBulkOpen(true);
  }

  function sluitBulk() {
    setBulkOpen(false);
    setBulkCodes([]);
    setBulkResultaat(null);
  }

  // Koppelt de geselecteerde toepassingen aan de gekozen applicatie-types.
  // Bestaande koppelingen blijven behouden: per toepassing wordt de unie van de
  // huidige codes en de gekozen codes weggeschreven (toevoegen, niet overschrijven).
  async function voerBulkKoppelingUit() {
    if (bulkCodes.length === 0) return;
    setBulkBezig(true);
    const resultaat: BulkResultaat = { geslaagd: 0, ongewijzigd: 0, mislukt: [] };
    const teKoppelen = (alleLabels as Label[]).filter((l) => geselecteerd.has(l.id));
    for (const l of teKoppelen) {
      const huidig = l.applicatie_codes ?? [];
      const samen = Array.from(new Set([...huidig, ...bulkCodes]));
      if (samen.length === huidig.length) {
        resultaat.ongewijzigd++;
        continue;
      }
      try {
        await wijzigLabel.mutateAsync({ id: l.id, data: { applicatie_codes: samen } });
        resultaat.geslaagd++;
      } catch (err) {
        resultaat.mislukt.push({ naam: l.naam, reden: foutmelding(err, "Koppelen mislukt") });
      }
    }
    await queryClient.invalidateQueries({ queryKey: getListLabelsQueryKey() });
    setBulkResultaat(resultaat);
    setBulkBezig(false);
    if (resultaat.mislukt.length === 0) wisSelectie();
  }

  // Geselecteerde toepassingen die nog actief zijn (kunnen gearchiveerd worden)
  // resp. al gearchiveerd zijn (kunnen hersteld worden).
  const geselecteerdeLabels = (alleLabels as Label[]).filter((l) => geselecteerd.has(l.id));
  const aantalArchiveerbaar = geselecteerdeLabels.filter((l) => !l.gearchiveerd).length;
  const aantalHerstelbaar = geselecteerdeLabels.filter((l) => l.gearchiveerd).length;

  function sluitArchief() {
    setArchiefActie(null);
    setArchiefResultaat(null);
  }

  // Archiveert of herstelt de relevante geselecteerde toepassingen via PATCH /labels/:id.
  async function voerArchiefActieUit() {
    if (!archiefActie) return;
    const doelGearchiveerd = archiefActie === "archiveren";
    const teVerwerken = geselecteerdeLabels.filter((l) => l.gearchiveerd !== doelGearchiveerd);
    if (teVerwerken.length === 0) return;
    setArchiefBezig(true);
    const resultaat: BulkResultaat = { geslaagd: 0, ongewijzigd: 0, mislukt: [] };
    for (const l of teVerwerken) {
      try {
        await wijzigLabel.mutateAsync({ id: l.id, data: { gearchiveerd: doelGearchiveerd } });
        resultaat.geslaagd++;
      } catch (err) {
        resultaat.mislukt.push({
          naam: l.naam,
          reden: foutmelding(err, doelGearchiveerd ? "Archiveren mislukt" : "Herstellen mislukt"),
        });
      }
    }
    await queryClient.invalidateQueries({ queryKey: getListLabelsQueryKey() });
    setArchiefResultaat(resultaat);
    setArchiefBezig(false);
    if (resultaat.mislukt.length === 0) wisSelectie();
  }

  function verwerkBestand(file: File) {
    setImportFout(null);
    setImportResultaat(null);
    const reader = new FileReader();
    reader.onerror = () => {
      setImportRijen([]);
      setImportFout("Het bestand kon niet worden gelezen. Probeer het opnieuw.");
    };
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = xlsxApi.read(data, { type: "array" });
        if (wb.SheetNames.length === 0) {
          setImportRijen([]);
          setImportFout("Het Excel-bestand bevat geen werkbladen.");
          return;
        }
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: unknown[][] = xlsxApi.utils.sheet_to_json(ws, { header: 1, defval: "" });
        const rijen: ExcelRij[] = [];
        let overgeslagen = 0;
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i] ?? [];
          const type_code = String(r[0] ?? "").trim();
          const naam = String(r[1] ?? "").trim();
          // De applicatie-code (kolom A) is optioneel: een toepassing zonder code
          // wordt zonder applicatie-koppeling geimporteerd en kan later gekoppeld
          // worden. Alleen de naam (kolom B) is verplicht.
          if (!naam) {
            if (r.some((c) => String(c ?? "").trim())) overgeslagen++;
            continue;
          }
          rijen.push({
            type_code,
            naam,
            fabrikant: String(r[2] ?? "").trim() || undefined,
            testnorm: String(r[3] ?? "").trim() || undefined,
          });
        }
        setImportRijen(rijen);
        if (rijen.length === 0) {
          setImportFout(
            overgeslagen > 0
              ? "Geen bruikbare rijen gevonden. Controleer dat kolom B de naam van de toepassing bevat (rij 1 is de koptekst). De applicatie-code in kolom A is optioneel."
              : "Het bestand bevat geen gegevensrijen onder de koptekst.",
          );
        }
      } catch (err) {
        console.error("Excel-import: lezen mislukt", err);
        setImportRijen([]);
        setImportFout(
          "Het Excel-bestand kon niet worden gelezen. Controleer dat het een geldig .xlsx- of .xls-bestand is.",
        );
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function voerImportUit() {
    setImportBezig(true);
    setImportFout(null);
    const resultaat: ImportResultaat = { geslaagd: 0, mislukt: [] };
    for (let i = 0; i < importRijen.length; i++) {
      const rij = importRijen[i];
      try {
        await maakLabel.mutateAsync({
          data: {
            applicatie_codes: rij.type_code ? [rij.type_code] : [],
            naam: rij.naam,
            fabrikant: rij.fabrikant || undefined,
            testnorm: rij.testnorm || undefined,
          },
        });
        resultaat.geslaagd++;
      } catch (err) {
        resultaat.mislukt.push({ rij: i + 2, reden: foutmelding(err, "Aanmaak mislukt") });
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
    setImportFout(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

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

      {magKoppelen && geselecteerd.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-4 py-3">
          <span className="text-sm font-medium">
            {geselecteerd.size} toepassing(en) geselecteerd
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={wisSelectie}>
              <X className="h-4 w-4 mr-1.5" />
              Selectie wissen
            </Button>
            <Button size="sm" onClick={openBulk}>
              <Link2 className="h-4 w-4 mr-1.5" />
              Koppel aan applicatie
            </Button>
            {aantalArchiveerbaar > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setArchiefResultaat(null); setArchiefActie("archiveren"); }}
              >
                <Archive className="h-4 w-4 mr-1.5" />
                Archiveren
              </Button>
            )}
            {aantalHerstelbaar > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setArchiefResultaat(null); setArchiefActie("herstellen"); }}
              >
                <ArchiveRestore className="h-4 w-4 mr-1.5" />
                Herstellen
              </Button>
            )}
          </div>
        </div>
      )}

      <Dialog open={archiefActie !== null} onOpenChange={(o) => { if (!o) sluitArchief(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {archiefActie === "herstellen"
                ? "Toepassingen herstellen"
                : "Toepassingen archiveren"}
            </DialogTitle>
            <DialogDescription>
              {archiefActie === "herstellen"
                ? `${aantalHerstelbaar} gearchiveerde toepassing(en) uit de selectie worden hersteld en weer als actief getoond.`
                : `${aantalArchiveerbaar} actieve toepassing(en) uit de selectie worden gearchiveerd. Ze blijven bewaard en kunnen later hersteld worden.`}
            </DialogDescription>
          </DialogHeader>

          {archiefResultaat && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">
                  {archiefResultaat.geslaagd} toepassing(en){" "}
                  {archiefActie === "herstellen" ? "hersteld" : "gearchiveerd"}
                </span>
              </div>
              {archiefResultaat.mislukt.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-destructive flex items-center gap-1">
                    <XCircle className="h-4 w-4" />
                    {archiefResultaat.mislukt.length} toepassing(en) mislukt:
                  </p>
                  {archiefResultaat.mislukt.map((m, i) => (
                    <p key={i} className="text-xs text-muted-foreground pl-5">
                      {m.naam}: {m.reden}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={sluitArchief}>
              {archiefResultaat ? "Sluiten" : "Annuleren"}
            </Button>
            {!archiefResultaat && (
              <Button onClick={voerArchiefActieUit} disabled={archiefBezig}>
                {archiefBezig
                  ? archiefActie === "herstellen" ? "Herstellen..." : "Archiveren..."
                  : archiefActie === "herstellen" ? "Herstellen" : "Archiveren"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={(o) => { if (!o) sluitBulk(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Toepassingen koppelen aan applicatie</DialogTitle>
            <DialogDescription>
              Kies een of meer applicatie-types. De {geselecteerd.size} geselecteerde
              toepassing(en) worden hieraan gekoppeld. Bestaande koppelingen blijven behouden.
            </DialogDescription>
          </DialogHeader>

          {!bulkResultaat ? (
            <div className="space-y-3">
              <div>
                <UiLabel>Applicatie-types *</UiLabel>
                <ScrollArea className="h-56 rounded-md border mt-1">
                  <div className="p-2 space-y-1">
                    {(typen as VoorzieningType[]).filter((t) => t.actief).map((t) => (
                      <div key={t.code} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50">
                        <Checkbox
                          id={`bulk-appl-${t.code}`}
                          checked={bulkCodes.includes(t.code)}
                          onCheckedChange={(checked) =>
                            setBulkCodes((cs) =>
                              checked ? [...cs, t.code] : cs.filter((c) => c !== t.code),
                            )
                          }
                        />
                        <label htmlFor={`bulk-appl-${t.code}`} className="cursor-pointer text-sm flex-1">
                          <span className="font-mono text-xs text-muted-foreground mr-2">{t.code}</span>
                          {t.naam}
                        </label>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">
                  {bulkResultaat.geslaagd} toepassing(en) gekoppeld
                </span>
              </div>
              {bulkResultaat.ongewijzigd > 0 && (
                <p className="text-sm text-muted-foreground">
                  {bulkResultaat.ongewijzigd} toepassing(en) waren al gekoppeld en bleven ongewijzigd.
                </p>
              )}
              {bulkResultaat.mislukt.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-destructive flex items-center gap-1">
                    <XCircle className="h-4 w-4" />
                    {bulkResultaat.mislukt.length} toepassing(en) mislukt:
                  </p>
                  {bulkResultaat.mislukt.map((m, i) => (
                    <p key={i} className="text-xs text-muted-foreground pl-5">
                      {m.naam}: {m.reden}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={sluitBulk}>
              {bulkResultaat ? "Sluiten" : "Annuleren"}
            </Button>
            {!bulkResultaat && (
              <Button
                onClick={voerBulkKoppelingUit}
                disabled={bulkCodes.length === 0 || bulkBezig}
              >
                {bulkBezig ? "Koppelen..." : "Koppelen"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={(o) => { if (!o) sluitImport(); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Toepassingen importeren via Excel</DialogTitle>
            <DialogDescription>
              Upload een Excel-bestand (.xlsx). Kolom A: applicatie-code, B: naam, C: fabrikant (optioneel), D: brand- of rookwerendheid (optioneel).
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

              {importFout && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                  <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{importFout}</span>
                </div>
              )}

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
                          <th className="text-left p-2 font-medium">Brand- of rookwerendheid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importRijen.slice(0, 10).map((r, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="p-2 font-mono">{r.type_code || "—"}</td>
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
                  <SelectItem value={ONGEKOPPELD}>Zonder applicatie</SelectItem>
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
            {filtersActief && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={wisFilters}
              >
                Filters wissen
              </Button>
            )}
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
                  {magKoppelen && (
                    <th className="w-10 p-3">
                      <Checkbox
                        aria-label="Alles selecteren"
                        checked={
                          (labels as Label[]).length > 0 &&
                          (labels as Label[]).every((l) => geselecteerd.has(l.id))
                        }
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setGeselecteerd(new Set((labels as Label[]).map((l) => l.id)));
                          } else {
                            wisSelectie();
                          }
                        }}
                      />
                    </th>
                  )}
                  <th className="text-left p-3 font-medium text-muted-foreground">Naam / productsoort</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Fabrikant</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Brand- of rookwerendheid</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {(labels as Label[]).map((l) => (
                  <tr
                    key={l.id}
                    className={`border-b last:border-0 hover:bg-muted/20 transition-colors cursor-pointer ${
                      l.gearchiveerd ? "opacity-50" : ""
                    } ${geselecteerd.has(l.id) ? "bg-muted/30" : ""}`}
                    onClick={() => setDetail(l)}
                  >
                    {magKoppelen && (
                      <td className="w-10 p-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          aria-label={`Selecteer ${l.naam}`}
                          checked={geselecteerd.has(l.id)}
                          onCheckedChange={() => toggleSelectie(l.id)}
                        />
                      </td>
                    )}
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
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleArchief(l);
                        }}
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
              <UiLabel>Applicatie-types *</UiLabel>
              <ScrollArea className="h-40 rounded-md border mt-1">
                <div className="p-2 space-y-1">
                  {(typen as VoorzieningType[]).filter((t) => t.actief).map((t) => (
                    <div key={t.code} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50">
                      <Checkbox
                        id={`appl-bib-${t.code}`}
                        checked={nieuw.applicatie_codes.includes(t.code)}
                        onCheckedChange={(checked) =>
                          setNieuw((n) => ({
                            ...n,
                            applicatie_codes: checked
                              ? [...n.applicatie_codes, t.code]
                              : n.applicatie_codes.filter((c) => c !== t.code),
                          }))
                        }
                      />
                      <label htmlFor={`appl-bib-${t.code}`} className="cursor-pointer text-sm flex-1">
                        <span className="font-mono text-xs text-muted-foreground mr-2">{t.code}</span>
                        {t.naam}
                      </label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
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
              <UiLabel>Brand- of rookwerendheid</UiLabel>
              <Select
                value={nieuw.testnorm || "__geen__"}
                onValueChange={(v) =>
                  setNieuw((n) => ({ ...n, testnorm: v === "__geen__" ? "" : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kies brand- of rookwerendheid (optioneel)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__geen__">Niet opgegeven</SelectItem>
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
              <UiLabel>Fabrikant</UiLabel>
              <Select
                value={nieuw.fabrikantId == null ? "__geen__" : String(nieuw.fabrikantId)}
                onValueChange={(v) =>
                  setNieuw((n) => ({ ...n, fabrikantId: v === "__geen__" ? null : Number(v) }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kies een fabrikant (optioneel)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__geen__">Geen fabrikant</SelectItem>
                  {(fabrikanten as Fabrikant[]).map((f) => (
                    <SelectItem key={f.id} value={String(f.id)}>
                      {f.naam}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNieuwOpen(false)}>
              Annuleren
            </Button>
            <Button
              onClick={bewaarNieuw}
              disabled={nieuw.applicatie_codes.length === 0 || !nieuw.naam.trim() || maakLabel.isPending}
            >
              {maakLabel.isPending ? "Opslaan..." : "Toevoegen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ToepassingDetailDialog
        toepassing={detail}
        open={detail !== null}
        onOpenChange={(o) => {
          if (!o) setDetail(null);
        }}
        typen={typen as VoorzieningType[]}
      />
    </div>
  );
}

// ── Tab Fabrikanten ──────────────────────────────────────────────────────────
function TabFabrikanten() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { heeftNiveau } = useBevoegdheid();
  const magAanmaken = heeftNiveau("bibliotheek", 3);
  const magBewerken = heeftNiveau("bibliotheek", 2);

  const [inclGearchiveerd, setInclGearchiveerd] = useVoorkeur(
    "bibliotheek_fabrikanten_incl_gearchiveerd",
    false,
  );
  const { data: fabrikanten = [], isLoading } = useListFabrikanten({
    inclusief_gearchiveerd: inclGearchiveerd || undefined,
  });
  const maakFabrikant = useCreateFabrikant();
  const wijzigFabrikant = useUpdateFabrikant();

  const [dialoogOpen, setDialoogOpen] = useState(false);
  const [bewerkId, setBewerkId] = useState<number | null>(null);
  const [form, setForm] = useState({ naam: "", url: "" });
  const [fout, setFout] = useState<string | null>(null);

  function openNieuw() {
    setBewerkId(null);
    setForm({ naam: "", url: "" });
    setFout(null);
    setDialoogOpen(true);
  }

  function openBewerk(f: Fabrikant) {
    setBewerkId(f.id);
    setForm({ naam: f.naam, url: f.url ?? "" });
    setFout(null);
    setDialoogOpen(true);
  }

  async function bewaar() {
    if (!form.naam.trim()) {
      setFout("Naam is verplicht.");
      return;
    }
    setFout(null);
    try {
      if (bewerkId == null) {
        await maakFabrikant.mutateAsync({
          data: { naam: form.naam.trim(), url: form.url.trim() || undefined },
        });
      } else {
        await wijzigFabrikant.mutateAsync({
          id: bewerkId,
          data: { naam: form.naam.trim(), url: form.url.trim() ? form.url.trim() : null },
        });
      }
      await queryClient.invalidateQueries({ queryKey: getListFabrikantenQueryKey() });
      setDialoogOpen(false);
    } catch (err) {
      setFout(foutmelding(err, "Opslaan mislukt. Probeer het opnieuw."));
    }
  }

  async function toggleArchief(f: Fabrikant) {
    const archiveren = !f.gearchiveerd;
    try {
      await wijzigFabrikant.mutateAsync({
        id: f.id,
        data: { gearchiveerd: archiveren },
      });
      await queryClient.invalidateQueries({ queryKey: getListFabrikantenQueryKey() });
      toast({
        title: archiveren ? "Fabrikant gearchiveerd" : "Fabrikant hersteld",
        description: `"${f.naam}" is ${archiveren ? "gearchiveerd" : "hersteld"}.`,
      });
    } catch (err) {
      toast({
        title: archiveren ? "Archiveren mislukt" : "Herstellen mislukt",
        description: foutmelding(err, "Probeer het opnieuw."),
        variant: "destructive",
      });
    }
  }

  const bezig = maakFabrikant.isPending || wijzigFabrikant.isPending;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Erkende fabrikanten van brandpreventieve producten. Via de productlink kunt u het
        aanbod en de goedgekeurde productcombinaties raadplegen.
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Switch
            id="fabrikanten-incl-gearchiveerd"
            checked={inclGearchiveerd}
            onCheckedChange={setInclGearchiveerd}
          />
          <UiLabel htmlFor="fabrikanten-incl-gearchiveerd" className="text-sm cursor-pointer">
            Inclusief gearchiveerd
          </UiLabel>
        </div>
        {magAanmaken && (
          <Button className="ml-auto" onClick={openNieuw}>
            <Plus className="h-4 w-4 mr-2" />
            Fabrikant toevoegen
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Laden...</p>
      ) : fabrikanten.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nog geen fabrikanten vastgelegd.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {fabrikanten.map((f) => (
            <Card key={f.id} className={`flex flex-col ${f.gearchiveerd ? "opacity-60" : ""}`}>
              <CardContent className="pt-5 pb-4 flex flex-col gap-3 flex-1">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm leading-tight">{f.naam}</p>
                      {f.gearchiveerd && (
                        <Badge variant="outline" className="text-xs text-muted-foreground shrink-0">
                          Gearchiveerd
                        </Badge>
                      )}
                    </div>
                    {f.url ? (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{f.url.replace("https://", "")}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-0.5">Geen website</p>
                    )}
                  </div>
                  {magBewerken && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => openBewerk(f)}
                      aria-label={`${f.naam} bewerken`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
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
                {magBewerken && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs gap-1.5"
                    onClick={() => toggleArchief(f)}
                    disabled={wijzigFabrikant.isPending}
                  >
                    {f.gearchiveerd ? (
                      <>
                        <ArchiveRestore className="h-3.5 w-3.5" />
                        Herstellen
                      </>
                    ) : (
                      <>
                        <Archive className="h-3.5 w-3.5" />
                        Archiveren
                      </>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialoogOpen} onOpenChange={setDialoogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{bewerkId == null ? "Fabrikant toevoegen" : "Fabrikant bewerken"}</DialogTitle>
            <DialogDescription>
              Leg de naam en optioneel de website (productcatalogus) van de fabrikant vast.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <UiLabel htmlFor="fabrikant-naam">Naam</UiLabel>
              <Input
                id="fabrikant-naam"
                value={form.naam}
                onChange={(e) => setForm((s) => ({ ...s, naam: e.target.value }))}
                placeholder="Bijv. Hilti"
              />
            </div>
            <div className="space-y-1.5">
              <UiLabel htmlFor="fabrikant-url">Website / productcatalogus (optioneel)</UiLabel>
              <Input
                id="fabrikant-url"
                value={form.url}
                onChange={(e) => setForm((s) => ({ ...s, url: e.target.value }))}
                placeholder="https://..."
              />
            </div>
            {fout && <p className="text-sm text-destructive">{fout}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialoogOpen(false)} disabled={bezig}>
              Annuleren
            </Button>
            <Button onClick={bewaar} disabled={bezig || !form.naam.trim()}>
              {bezig ? "Bezig..." : bewerkId == null ? "Toevoegen" : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
        Standaard brand- en rookwerendheidsklassen die bij een concrete spot geselecteerd kunnen worden.
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
  const [actieveTab, setActieveTab] = useVoorkeur(
    "bibliotheek_tab",
    "applicaties",
  );
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bibliotheek</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Centrale stamgegevens voor applicaties, productsoorten, fabrikanten en brand- en rookwerendheidsklassen.
            Items uit de bibliotheek zijn beschikbaar als keuzemenu bij het registreren van concrete spots in gebouwen.
          </p>
        </div>
      </div>

      <Tabs value={actieveTab} onValueChange={setActieveTab}>
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
