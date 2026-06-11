import { useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListDocumenten,
  getListDocumentenQueryKey,
  useGetDocument,
  getGetDocumentQueryKey,
  useCreateDocument,
  useUpdateDocument,
  useListDocumentRevisies,
  getListDocumentRevisiesQueryKey,
  useCreateDocumentRevisie,
  useSetDocumentToepassingen,
  useAiAnalyseDocument,
  useListLabels,
  DocumentType,
  DocumentStatus,
} from "@workspace/api-client-react";
import type {
  Document,
  DocumentInput,
  Label,
  DocumentAiAnalyseResultaat,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useVoorkeur } from "@/hooks/use-voorkeur";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label as UiLabel } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
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
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  History,
  Plus,
  Sparkles,
  Upload,
} from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const GEEN = "__alle__";

export const TYPE_LABELS: Record<string, string> = {
  eta: "ETA",
  classificatierapport: "Classificatierapport",
  testrapport: "Testrapport",
  productcertificaat: "Productcertificaat",
  dop: "DoP",
  verwerkingsvoorschrift: "Verwerkingsvoorschrift",
};

export const STATUS_LABELS: Record<string, string> = {
  actueel: "Actueel",
  controle_nodig: "Controle nodig",
  vervangen: "Vervangen",
  mogelijk_verouderd: "Mogelijk verouderd",
  ingetrokken: "Ingetrokken",
};

// Zet een API-fout om naar een begrijpelijke melding. Onderscheidt een echte
// bevoegdheidsfout (403) van overige fouten en toont anders het serverbericht,
// zodat een 500/400 niet langer misleidend als "bevoegdheid" wordt gemeld.
export function foutmelding(err: unknown, standaard: string): string {
  const e = err as { status?: number; data?: { error?: string } } | null;
  if (e?.status === 401) return "U bent niet meer ingelogd. Log opnieuw in en probeer het opnieuw.";
  if (e?.status === 403)
    return "U heeft geen bevoegdheid voor deze actie. Neem contact op met een beheerder.";
  const serverbericht = typeof e?.data?.error === "string" ? e.data.error.trim() : "";
  return serverbericht || standaard;
}

export function statusBadge(status: string) {
  const label = STATUS_LABELS[status] ?? status;
  const cls: Record<string, string> = {
    actueel: "text-green-700 border-green-300 bg-green-50",
    controle_nodig: "text-amber-700 border-amber-300 bg-amber-50",
    mogelijk_verouderd: "text-amber-700 border-amber-300 bg-amber-50",
    vervangen: "text-muted-foreground",
    ingetrokken: "text-destructive border-destructive/40",
  };
  return (
    <Badge variant="outline" className={`text-xs ${cls[status] ?? ""}`}>
      {label}
    </Badge>
  );
}

const GEEN_GETEST = "__geen__";
const GETEST_VOOR_LABELS: Record<string, string> = {
  wand: "Wand",
  plafond: "Plafond",
  beide: "Wand en plafond",
};

const AI_VELDEN = [
  "naam",
  "documenttype",
  "fabrikant",
  "product",
  "en_norm",
  "rapportnummer",
  "revisie",
  "datum",
  "getest_voor",
] as const;
type AiVeld = (typeof AI_VELDEN)[number];

interface FormState {
  naam: string;
  documenttype: string;
  fabrikant: string;
  product: string;
  en_norm: string;
  rapportnummer: string;
  revisie: string;
  datum: string;
  getest_voor: string;
  pdf_url: string;
  toepassing_ids: number[];
  ai_geanalyseerd: boolean;
  ai_metadata: Record<string, unknown> | null;
}

const LEEG_FORM: FormState = {
  naam: "",
  documenttype: "",
  fabrikant: "",
  product: "",
  en_norm: "",
  rapportnummer: "",
  revisie: "",
  datum: "",
  getest_voor: "",
  pdf_url: "",
  toepassing_ids: [],
  ai_geanalyseerd: false,
  ai_metadata: null,
};

async function extraheerPdfTekst(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const taak = pdfjsLib.getDocument({ data: buf });
  const pdf = await taak.promise;
  let tekst = "";
  const maxPaginas = Math.min(pdf.numPages, 10);
  for (let p = 1; p <= maxPaginas; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    tekst +=
      content.items
        .map((it) => ("str" in it ? (it as { str?: string }).str ?? "" : ""))
        .join(" ") + "\n";
    page.cleanup();
  }
  await taak.destroy();
  return tekst;
}

// ── Koppelingen-kiezer (toepassingen of applicaties) ─────────────────────────
function KoppelingenKiezer({
  titel,
  opties,
  geselecteerd,
  onToggle,
}: {
  titel: string;
  opties: { value: string; label: string; sub?: string }[];
  geselecteerd: string[];
  onToggle: (value: string) => void;
}) {
  const [zoek, setZoek] = useState("");
  const gefilterd = opties.filter(
    (o) =>
      o.label.toLowerCase().includes(zoek.toLowerCase()) ||
      (o.sub ?? "").toLowerCase().includes(zoek.toLowerCase()),
  );
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <UiLabel>{titel}</UiLabel>
        {geselecteerd.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {geselecteerd.length} geselecteerd
          </span>
        )}
      </div>
      <Input
        placeholder="Zoeken..."
        value={zoek}
        onChange={(e) => setZoek(e.target.value)}
        className="h-8 text-sm"
      />
      <ScrollArea className="h-40 rounded-md border">
        <div className="p-2 space-y-1">
          {gefilterd.length === 0 ? (
            <p className="text-xs text-muted-foreground p-2">Geen resultaten.</p>
          ) : (
            gefilterd.map((o) => (
              <label
                key={o.value}
                className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40 cursor-pointer"
              >
                <Checkbox
                  checked={geselecteerd.includes(o.value)}
                  onCheckedChange={() => onToggle(o.value)}
                />
                <span className="text-sm flex-1">{o.label}</span>
                {o.sub && (
                  <span className="text-xs text-muted-foreground">{o.sub}</span>
                )}
              </label>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Document-formulier (nieuw document of nieuwe revisie) ─────────────────────
function DocumentFormulier({
  open,
  onOpenChange,
  mode,
  basisDocument,
  toepassingOpties,
  onBewaard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "nieuw" | "revisie";
  basisDocument?: Document;
  toepassingOpties: { value: string; label: string; sub?: string }[];
  onBewaard: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() =>
    mode === "revisie" && basisDocument
      ? {
          naam: basisDocument.naam,
          documenttype: basisDocument.documenttype,
          fabrikant: basisDocument.fabrikant ?? "",
          product: basisDocument.product ?? "",
          en_norm: basisDocument.en_norm ?? "",
          rapportnummer: basisDocument.rapportnummer ?? "",
          revisie: basisDocument.revisie ?? "",
          datum: basisDocument.datum ?? "",
          getest_voor: basisDocument.getest_voor ?? "",
          pdf_url: "",
          toepassing_ids: basisDocument.toepassing_ids ?? [],
          ai_geanalyseerd: false,
          ai_metadata: null,
        }
      : LEEG_FORM,
  );
  const [aiVelden, setAiVelden] = useState<Set<AiVeld>>(new Set());
  const [aiBetrouwbaarheid, setAiBetrouwbaarheid] = useState<string | null>(null);
  const [aiBezig, setAiBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const maakDocument = useCreateDocument();
  const maakRevisie = useCreateDocumentRevisie();
  const aiAnalyse = useAiAnalyseDocument();
  const { uploadFile, isUploading } = useUpload({
    onSuccess: (res) => setForm((f) => ({ ...f, pdf_url: res.objectPath })),
  });

  function zet<K extends keyof FormState>(key: K, waarde: FormState[K]) {
    setForm((f) => ({ ...f, [key]: waarde }));
    if ((AI_VELDEN as readonly string[]).includes(key as string)) {
      setAiVelden((s) => {
        const n = new Set(s);
        n.delete(key as AiVeld);
        return n;
      });
    }
  }

  async function verwerkBestand(file: File) {
    setFout(null);
    void uploadFile(file);
    setAiBezig(true);
    try {
      const tekst = await extraheerPdfTekst(file);
      const res: DocumentAiAnalyseResultaat = await aiAnalyse.mutateAsync({
        data: { tekst, bestandsnaam: file.name },
      });
      const nieuweAi = new Set<AiVeld>();
      setForm((f) => {
        const next = { ...f };
        const map: Record<AiVeld, string | null | undefined> = {
          naam: res.naam,
          documenttype: res.documenttype,
          fabrikant: res.fabrikant,
          product: res.product,
          en_norm: res.en_norm,
          rapportnummer: res.rapportnummer,
          revisie: res.revisie,
          datum: res.datum,
          getest_voor: res.getest_voor,
        };
        for (const veld of AI_VELDEN) {
          const waarde = map[veld];
          if (waarde) {
            (next[veld] as string) = waarde;
            nieuweAi.add(veld);
          }
        }
        next.ai_geanalyseerd = true;
        next.ai_metadata = res as unknown as Record<string, unknown>;
        return next;
      });
      setAiVelden(nieuweAi);
      setAiBetrouwbaarheid(res.betrouwbaarheid ?? null);
    } catch (err) {
      setFout(foutmelding(err, "Automatische analyse is mislukt. Vul de gegevens handmatig in."));
    } finally {
      setAiBezig(false);
    }
  }

  function toggleLijst(value: string) {
    setForm((f) => {
      const id = Number(value);
      const has = f.toepassing_ids.includes(id);
      return {
        ...f,
        toepassing_ids: has
          ? f.toepassing_ids.filter((x) => x !== id)
          : [...f.toepassing_ids, id],
      };
    });
  }

  const geldig = form.naam.trim() !== "" && form.documenttype !== "";
  const bezig = maakDocument.isPending || maakRevisie.isPending || isUploading;

  async function bewaar() {
    if (!geldig) return;
    setFout(null);
    const data: DocumentInput = {
      naam: form.naam.trim(),
      documenttype: form.documenttype as DocumentInput["documenttype"],
      fabrikant: form.fabrikant.trim() || undefined,
      product: form.product.trim() || undefined,
      en_norm: form.en_norm.trim() || undefined,
      rapportnummer: form.rapportnummer.trim() || undefined,
      revisie: form.revisie.trim() || undefined,
      datum: form.datum.trim() || undefined,
      getest_voor: form.getest_voor
        ? (form.getest_voor as DocumentInput["getest_voor"])
        : undefined,
      pdf_url: form.pdf_url || undefined,
      ai_geanalyseerd: form.ai_geanalyseerd || undefined,
      ai_metadata: form.ai_metadata ?? undefined,
      toepassing_ids: form.toepassing_ids,
    };
    try {
      if (mode === "revisie" && basisDocument) {
        await maakRevisie.mutateAsync({ id: basisDocument.id, data });
        await queryClient.invalidateQueries({
          queryKey: getListDocumentRevisiesQueryKey(basisDocument.id),
        });
        // Bronrevisie krijgt server-side status 'vervangen'; ververs zijn detail.
        await queryClient.invalidateQueries({
          queryKey: getGetDocumentQueryKey(basisDocument.id),
        });
      } else {
        await maakDocument.mutateAsync({ data });
      }
      await queryClient.invalidateQueries({ queryKey: getListDocumentenQueryKey() });
      onBewaard();
      onOpenChange(false);
    } catch (err) {
      setFout(foutmelding(err, "Opslaan is mislukt. Probeer het opnieuw."));
    }
  }

  function amber(veld: AiVeld) {
    return aiVelden.has(veld) ? "border-amber-400 bg-amber-50" : "";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "revisie" ? "Nieuwe revisie toevoegen" : "Nieuw document toevoegen"}
          </DialogTitle>
          <DialogDescription>
            {mode === "revisie"
              ? "De vorige versie blijft bewaard en krijgt de status 'vervangen'."
              : "Upload een PDF; de gegevens worden automatisch voorgesteld en kunnen worden aangepast."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload */}
          <div className="border-2 border-dashed border-muted rounded-lg p-4 text-center">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void verwerkBestand(f);
                e.target.value = "";
              }}
            />
            {form.pdf_url ? (
              <div className="flex items-center justify-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-primary" />
                <span className="font-medium">PDF geupload</span>
                <a
                  href={`/api/storage${form.pdf_url}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary inline-flex items-center gap-1 text-xs"
                >
                  <ExternalLink className="h-3 w-3" />
                  Bekijken
                </a>
              </div>
            ) : (
              <>
                <Upload className="h-7 w-7 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground mb-2">
                  Kies een PDF-document
                </p>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => fileRef.current?.click()}
              disabled={isUploading || aiBezig}
            >
              {isUploading
                ? "Uploaden..."
                : form.pdf_url
                  ? "Ander bestand kiezen"
                  : "Bestand kiezen"}
            </Button>
          </div>

          {aiBezig && (
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              <Sparkles className="h-4 w-4 animate-pulse" />
              Document wordt geanalyseerd...
            </div>
          )}

          {aiVelden.size > 0 && !aiBezig && (
            <div className="flex items-center justify-between gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                AI-voorstel
                {aiBetrouwbaarheid && (
                  <span className="text-xs text-amber-700">
                    (betrouwbaarheid: {aiBetrouwbaarheid})
                  </span>
                )}
                — controleer de gele velden en bevestig.
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 shrink-0"
                onClick={() => setAiVelden(new Set())}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                AI-velden bevestigen
              </Button>
            </div>
          )}

          {fout && (
            <p className="text-sm text-destructive">{fout}</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <UiLabel htmlFor="doc-naam">Documentnaam *</UiLabel>
              <Input
                id="doc-naam"
                value={form.naam}
                onChange={(e) => zet("naam", e.target.value)}
                className={amber("naam")}
                placeholder="Bijv. ETA Mulcol Multicollar Slim"
              />
            </div>
            <div>
              <UiLabel>Documenttype *</UiLabel>
              <Select
                value={form.documenttype}
                onValueChange={(v) => zet("documenttype", v)}
              >
                <SelectTrigger className={amber("documenttype")}>
                  <SelectValue placeholder="Kies type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(DocumentType).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t] ?? t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <UiLabel htmlFor="doc-fabrikant">Fabrikant</UiLabel>
              <Input
                id="doc-fabrikant"
                value={form.fabrikant}
                onChange={(e) => zet("fabrikant", e.target.value)}
                className={amber("fabrikant")}
              />
            </div>
            <div>
              <UiLabel htmlFor="doc-product">Product</UiLabel>
              <Input
                id="doc-product"
                value={form.product}
                onChange={(e) => zet("product", e.target.value)}
                className={amber("product")}
              />
            </div>
            <div>
              <UiLabel htmlFor="doc-norm">EN-norm</UiLabel>
              <Input
                id="doc-norm"
                value={form.en_norm}
                onChange={(e) => zet("en_norm", e.target.value)}
                className={amber("en_norm")}
                placeholder="Bijv. EN 13501-2"
              />
            </div>
            <div>
              <UiLabel htmlFor="doc-rapportnr">Rapport-/referentienummer</UiLabel>
              <Input
                id="doc-rapportnr"
                value={form.rapportnummer}
                onChange={(e) => zet("rapportnummer", e.target.value)}
                className={amber("rapportnummer")}
              />
            </div>
            <div>
              <UiLabel htmlFor="doc-revisie">Revisie</UiLabel>
              <Input
                id="doc-revisie"
                value={form.revisie}
                onChange={(e) => zet("revisie", e.target.value)}
                className={amber("revisie")}
              />
            </div>
            <div>
              <UiLabel htmlFor="doc-datum">Datum</UiLabel>
              <Input
                id="doc-datum"
                value={form.datum}
                onChange={(e) => zet("datum", e.target.value)}
                className={amber("datum")}
                placeholder="JJJJ-MM-DD"
              />
            </div>
            <div>
              <UiLabel>Getest voor</UiLabel>
              <Select
                value={form.getest_voor || GEEN_GETEST}
                onValueChange={(v) => zet("getest_voor", v === GEEN_GETEST ? "" : v)}
              >
                <SelectTrigger className={amber("getest_voor")}>
                  <SelectValue placeholder="Kies wand/plafond..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GEEN_GETEST}>Niet opgegeven</SelectItem>
                  {Object.entries(GETEST_VOOR_LABELS).map(([w, label]) => (
                    <SelectItem key={w} value={w}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <KoppelingenKiezer
            titel="Gekoppelde toepassingen"
            opties={toepassingOpties}
            geselecteerd={form.toepassing_ids.map(String)}
            onToggle={(v) => toggleLijst(v)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
          <Button onClick={bewaar} disabled={!geldig || bezig}>
            {bezig ? "Opslaan..." : mode === "revisie" ? "Revisie opslaan" : "Document opslaan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Detaildialoog ────────────────────────────────────────────────────────────
function DocumentDetail({
  document,
  onOpenChange,
  toepassingOpties,
  magBeheren,
  magCreeren,
  onNieuweRevisie,
}: {
  document: Document;
  onOpenChange: (open: boolean) => void;
  toepassingOpties: { value: string; label: string; sub?: string }[];
  magBeheren: boolean;
  magCreeren: boolean;
  onNieuweRevisie: () => void;
}) {
  const queryClient = useQueryClient();
  // Live versie ophalen zodat de dialoog na een mutatie niet op een verouderde
  // lijst-snapshot blijft hangen; de meegegeven snapshot dient als directe fallback.
  const { data: liveDoc } = useGetDocument(document.id);
  const doc = liveDoc ?? document;
  const { data: revisies = [] } = useListDocumentRevisies(document.id);
  const wijzigDocument = useUpdateDocument();
  const setToepassingen = useSetDocumentToepassingen();
  const [toep, setToep] = useState<number[]>(document.toepassing_ids ?? []);

  const koppelingenGewijzigd =
    JSON.stringify([...toep].sort()) !==
      JSON.stringify([...(doc.toepassing_ids ?? [])].sort());

  async function bewaarStatus(status: string) {
    await wijzigDocument.mutateAsync({
      id: document.id,
      data: { status: status as Document["status"] },
    });
    await queryClient.invalidateQueries({ queryKey: getListDocumentenQueryKey() });
    await queryClient.invalidateQueries({
      queryKey: getGetDocumentQueryKey(document.id),
    });
    await queryClient.invalidateQueries({
      queryKey: getListDocumentRevisiesQueryKey(document.id),
    });
  }

  async function toggleArchief() {
    await wijzigDocument.mutateAsync({
      id: document.id,
      data: { gearchiveerd: !doc.gearchiveerd },
    });
    await queryClient.invalidateQueries({ queryKey: getListDocumentenQueryKey() });
    await queryClient.invalidateQueries({
      queryKey: getGetDocumentQueryKey(document.id),
    });
  }

  async function bewaarKoppelingen() {
    await setToepassingen.mutateAsync({ id: document.id, data: { label_ids: toep } });
    await queryClient.invalidateQueries({ queryKey: getListDocumentenQueryKey() });
    await queryClient.invalidateQueries({
      queryKey: getGetDocumentQueryKey(document.id),
    });
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            {doc.naam}
          </DialogTitle>
          <DialogDescription>
            {TYPE_LABELS[doc.documenttype] ?? doc.documenttype}
            {" · revisie "}
            {doc.revisie_nummer}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Info label="Fabrikant" waarde={doc.fabrikant} />
            <Info label="Product" waarde={doc.product} />
            <Info label="EN-norm" waarde={doc.en_norm} />
            <Info label="Rapportnummer" waarde={doc.rapportnummer} />
            <Info label="Revisie" waarde={doc.revisie} />
            <Info label="Datum" waarde={doc.datum} />
            <Info
              label="Getest voor"
              waarde={doc.getest_voor ? GETEST_VOOR_LABELS[doc.getest_voor] : null}
            />
          </div>

          {doc.pdf_url && (
            <a
              href={`/api/storage${doc.pdf_url}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary"
            >
              <ExternalLink className="h-4 w-4" />
              PDF openen
            </a>
          )}

          {/* Status + archief */}
          <div className="flex flex-wrap items-end gap-4 border-t pt-4">
            <div className="min-w-48">
              <UiLabel>Status</UiLabel>
              <Select
                value={doc.status}
                onValueChange={bewaarStatus}
                disabled={!magBeheren || wijzigDocument.isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(DocumentStatus).map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s] ?? s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {magBeheren && (
              <Button variant="outline" size="sm" onClick={toggleArchief}>
                {doc.gearchiveerd ? "Herstellen uit archief" : "Archiveren"}
              </Button>
            )}
            {magCreeren && (
              <Button size="sm" className="ml-auto" onClick={onNieuweRevisie}>
                <Plus className="h-4 w-4 mr-1" />
                Nieuwe revisie
              </Button>
            )}
          </div>

          {/* Koppelingen */}
          <div className="border-t pt-4 space-y-3">
            <KoppelingenKiezer
              titel="Toepassingen"
              opties={toepassingOpties}
              geselecteerd={toep.map(String)}
              onToggle={(v) => {
                if (!magBeheren) return;
                const id = Number(v);
                setToep((s) =>
                  s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
                );
              }}
            />
            {magBeheren && koppelingenGewijzigd && (
              <Button
                size="sm"
                onClick={bewaarKoppelingen}
                disabled={setToepassingen.isPending}
              >
                Koppelingen opslaan
              </Button>
            )}
          </div>

          {/* Revisiehistorie */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium flex items-center gap-1.5 mb-2">
              <History className="h-4 w-4 text-muted-foreground" />
              Revisiehistorie
            </h4>
            <div className="rounded-md border divide-y">
              {(revisies as Document[])
                .slice()
                .sort((a, b) => b.revisie_nummer - a.revisie_nummer)
                .map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 px-3 py-2 text-sm"
                  >
                    <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                      rev {r.revisie_nummer}
                    </span>
                    <span className="flex-1 truncate">{r.naam}</span>
                    {statusBadge(r.status)}
                    {r.pdf_url && (
                      <a
                        href={`/api/storage${r.pdf_url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, waarde }: { label: string; waarde?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{waarde || "—"}</p>
    </div>
  );
}

// ── Hoofd-tab ────────────────────────────────────────────────────────────────
export function TabDocumenten() {
  const { heeftNiveau } = useBevoegdheid();
  const magCreeren = heeftNiveau("bibliotheek", 3);
  const magBeheren = heeftNiveau("bibliotheek", 2);

  const [typeFilter, setTypeFilter, wisTypeFilter] = useVoorkeur(
    "documenten_type",
    GEEN,
  );
  const [statusFilter, setStatusFilter, wisStatusFilter] = useVoorkeur(
    "documenten_status",
    GEEN,
  );
  const [fabrikantFilter, setFabrikantFilter, wisFabrikantFilter] = useVoorkeur(
    "documenten_fabrikant",
    "",
  );
  const [alleenActueel, setAlleenActueel, wisAlleenActueel] = useVoorkeur(
    "documenten_alleen_actueel",
    true,
  );
  const [inclGearchiveerd, setInclGearchiveerd, wisInclGearchiveerd] =
    useVoorkeur("documenten_incl_gearchiveerd", false);

  const filtersActief =
    typeFilter !== GEEN ||
    statusFilter !== GEEN ||
    fabrikantFilter.trim() !== "" ||
    !alleenActueel ||
    inclGearchiveerd;

  function wisFilters() {
    wisTypeFilter();
    wisStatusFilter();
    wisFabrikantFilter();
    wisAlleenActueel();
    wisInclGearchiveerd();
  }

  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [detail, setDetail] = useState<Document | null>(null);
  const [revisieVoor, setRevisieVoor] = useState<Document | null>(null);

  const { data: labels = [] } = useListLabels({});

  const { data: documenten = [], isLoading } = useListDocumenten({
    documenttype:
      typeFilter === GEEN ? undefined : (typeFilter as Document["documenttype"]),
    status: statusFilter === GEEN ? undefined : (statusFilter as Document["status"]),
    fabrikant: fabrikantFilter.trim() || undefined,
    alleen_actueel: alleenActueel || undefined,
    inclusief_gearchiveerd: inclGearchiveerd || undefined,
  });

  const toepassingOpties = useMemo(
    () =>
      (labels as Label[]).map((l) => ({
        value: String(l.id),
        label: l.naam,
        sub: l.applicatie_codes.join(", "),
      })),
    [labels],
  );

  const labelNaam = useMemo(
    () => Object.fromEntries((labels as Label[]).map((l) => [l.id, l.naam])),
    [labels],
  );

  const lijst = documenten as Document[];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        De centrale documentbibliotheek bevat ETA's, classificatierapporten, testrapporten,
        productcertificaten, DoP's en verwerkingsvoorschriften. Documenten worden nooit
        overschreven: een inhoudelijke wijziging wordt als nieuwe revisie opgeslagen.
      </p>

      {magCreeren && (
        <div className="flex justify-end">
          <Button onClick={() => setNieuwOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nieuw document
          </Button>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={GEEN}>Alle types</SelectItem>
                {Object.values(DocumentType).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_LABELS[t] ?? t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={GEEN}>Alle statussen</SelectItem>
                {Object.values(DocumentStatus).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s] ?? s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Fabrikant..."
              value={fabrikantFilter}
              onChange={(e) => setFabrikantFilter(e.target.value)}
              className="w-40"
            />
            <div className="flex items-center gap-2">
              <Switch
                id="alleen-actueel"
                checked={alleenActueel}
                onCheckedChange={setAlleenActueel}
              />
              <UiLabel htmlFor="alleen-actueel" className="text-sm cursor-pointer">
                Alleen actuele revisie
              </UiLabel>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="incl-gearch-doc"
                checked={inclGearchiveerd}
                onCheckedChange={setInclGearchiveerd}
              />
              <UiLabel htmlFor="incl-gearch-doc" className="text-sm cursor-pointer">
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
          ) : lijst.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Geen documenten gevonden.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium text-muted-foreground">Naam</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Fabrikant</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Koppelingen</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {lijst.map((d) => (
                  <tr
                    key={d.id}
                    className={`border-b last:border-0 hover:bg-muted/20 transition-colors cursor-pointer ${
                      d.gearchiveerd ? "opacity-50" : ""
                    }`}
                    onClick={() => setDetail(d)}
                  >
                    <td className="p-3 font-medium">
                      <span className="flex items-center gap-2">
                        {d.ai_geanalyseerd && (
                          <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        {d.naam}
                      </span>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-xs">
                        {TYPE_LABELS[d.documenttype] ?? d.documenttype}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">{d.fabrikant || "—"}</td>
                    <td className="p-3 text-muted-foreground text-xs">
                      {(d.toepassing_ids ?? []).map((id) => labelNaam[id]).filter(Boolean).slice(0, 2).join(", ") || "—"}
                      {(d.toepassing_ids?.length ?? 0) > 2 && " ..."}
                    </td>
                    <td className="p-3">{statusBadge(d.status)}</td>
                    <td className="p-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetail(d);
                        }}
                      >
                        Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {nieuwOpen && (
        <DocumentFormulier
          key="nieuw-document"
          open={nieuwOpen}
          onOpenChange={setNieuwOpen}
          mode="nieuw"
          toepassingOpties={toepassingOpties}
          onBewaard={() => {}}
        />
      )}

      {revisieVoor && (
        <DocumentFormulier
          key={`revisie-${revisieVoor.id}`}
          open={!!revisieVoor}
          onOpenChange={(o) => {
            if (!o) setRevisieVoor(null);
          }}
          mode="revisie"
          basisDocument={revisieVoor}
          toepassingOpties={toepassingOpties}
          onBewaard={() => {
            setRevisieVoor(null);
            setDetail(null);
          }}
        />
      )}

      {detail && !revisieVoor && (
        <DocumentDetail
          document={detail}
          onOpenChange={(o) => {
            if (!o) setDetail(null);
          }}
          toepassingOpties={toepassingOpties}
          magBeheren={magBeheren}
          magCreeren={magCreeren}
          onNieuweRevisie={() => setRevisieVoor(detail)}
        />
      )}
    </div>
  );
}
