import { useMemo, useRef, useState, type ReactNode } from "react";
import { DatePicker } from "@/components/ui/date-picker";
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
  useAiKoppelvoorstellenDocumenten,
  useControleerDocumentDuplicaat,
  useListDocumentKoppelingen,
  getListDocumentKoppelingenQueryKey,
  useAddDocumentKoppeling,
  useRemoveDocumentKoppeling,
  useIndienenDocument,
  useGoedkeurenDocument,
  useAfkeurenDocument,
  useListDocumentGoedkeuringen,
  getListDocumentGoedkeuringenQueryKey,
  useGetDocumentLogboek,
  getGetDocumentLogboekQueryKey,
  useListDocumentLogboek,
  useListDocumentSignaleringen,
  getListDocumentSignaleringenQueryKey,
  useListGebouwen,
  useListCrmKlanten,
  useListOffertes,
  useListDossiers,
  useListLabels,
  DocumentType,
  DocumentStatus,
  GoedkeuringStatus,
  KoppelingDoelType,
} from "@workspace/api-client-react";
import type {
  Document,
  DocumentInput,
  DocumentDuplicaatMatch,
  DocumentKoppeling,
  DocumentGoedkeuring,
  DocumentLogboekRegel,
  DocumentSignaleringen,
  Label,
  DocumentAiAnalyseResultaat,
  DocumentKoppelVoorstel,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useVoorkeur } from "@/hooks/use-voorkeur";
import { useToast } from "@/hooks/use-toast";
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
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  ExternalLink,
  FileText,
  History,
  Info as InfoIcon,
  Link2,
  Plus,
  Send,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { TYPE_LABELS, STATUS_LABELS } from "@/lib/documenten-labels";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const GEEN = "__alle__";

const GROOT_BESTAND_GRENS = 10 * 1024 * 1024;

function formateerGrootte(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(".", ",")} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export { TYPE_LABELS, STATUS_LABELS };

export const GOEDKEURING_LABELS: Record<string, string> = {
  concept: "Concept",
  ter_goedkeuring: "Ter goedkeuring",
  goedgekeurd: "Goedgekeurd",
  afgekeurd: "Afgekeurd",
};

const KOPPELING_LABELS: Record<string, string> = {
  gebouw: "Gebouw",
  klant: "Klant",
  offerte: "Offerte",
  dossier: "Dossier",
  voorziening: "Spot",
};

export function goedkeuringBadge(status: string) {
  const label = GOEDKEURING_LABELS[status] ?? status;
  const cls: Record<string, string> = {
    concept: "text-muted-foreground",
    ter_goedkeuring: "text-amber-700 border-amber-300 bg-amber-50",
    goedgekeurd: "text-green-700 border-green-300 bg-green-50",
    afgekeurd: "text-destructive border-destructive/40",
  };
  return (
    <Badge variant="outline" className={`text-xs ${cls[status] ?? ""}`}>
      {label}
    </Badge>
  );
}

// Bepaalt of een geldig_tot-datum verlopen of binnenkort (<90 dagen) is.
function geldigheidStatus(geldigTot?: string | null): "verlopen" | "binnenkort" | "ok" | null {
  if (!geldigTot) return null;
  const eind = new Date(geldigTot);
  if (Number.isNaN(eind.getTime())) return null;
  const nu = new Date();
  const dagen = Math.ceil((eind.getTime() - nu.getTime()) / (1000 * 60 * 60 * 24));
  if (dagen < 0) return "verlopen";
  if (dagen <= 90) return "binnenkort";
  return "ok";
}

function formatTijdstip(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// SHA-256 van het geuploade bestand, gebruikt voor duplicaatdetectie.
async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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
  bestands_hash: string;
  bestandsgrootte: number | null;
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
  bestands_hash: "",
  bestandsgrootte: null,
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
  aiVoorstellen,
}: {
  titel: string;
  opties: { value: string; label: string; sub?: string }[];
  geselecteerd: string[];
  onToggle: (value: string) => void;
  aiVoorstellen?: Set<string>;
}) {
  const [zoek, setZoek] = useState("");
  const gefilterd = opties
    .filter(
      (o) =>
        o.label.toLowerCase().includes(zoek.toLowerCase()) ||
        (o.sub ?? "").toLowerCase().includes(zoek.toLowerCase()),
    )
    // AI-voorstellen bovenaan zodat de gebruiker ze meteen ziet.
    .sort(
      (a, b) =>
        Number(aiVoorstellen?.has(b.value) ?? false) -
        Number(aiVoorstellen?.has(a.value) ?? false),
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
            gefilterd.map((o) => {
              const isAi = aiVoorstellen?.has(o.value) ?? false;
              return (
                <label
                  key={o.value}
                  className={`flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer ${
                    isAi
                      ? "border border-amber-300 bg-amber-50 hover:bg-amber-100"
                      : "hover:bg-muted/40"
                  }`}
                >
                  <Checkbox
                    checked={geselecteerd.includes(o.value)}
                    onCheckedChange={() => onToggle(o.value)}
                  />
                  <span className="text-sm flex-1">{o.label}</span>
                  {isAi && (
                    <span className="flex items-center gap-1 text-xs text-amber-700">
                      <Sparkles className="h-3 w-3" />
                      AI-voorstel
                    </span>
                  )}
                  {o.sub && (
                    <span className="text-xs text-muted-foreground">{o.sub}</span>
                  )}
                </label>
              );
            })
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
          bestands_hash: "",
          bestandsgrootte: null,
          toepassing_ids: basisDocument.toepassing_ids ?? [],
          ai_geanalyseerd: false,
          ai_metadata: null,
        }
      : LEEG_FORM,
  );
  const [aiVelden, setAiVelden] = useState<Set<AiVeld>>(new Set());
  const [aiToepassingen, setAiToepassingen] = useState<Set<number>>(new Set());
  const [aiBetrouwbaarheid, setAiBetrouwbaarheid] = useState<string | null>(null);
  const [aiBezig, setAiBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const maakDocument = useCreateDocument();
  const maakRevisie = useCreateDocumentRevisie();
  const aiAnalyse = useAiAnalyseDocument();
  const duplicaatCheck = useControleerDocumentDuplicaat();
  const [duplicaten, setDuplicaten] = useState<DocumentDuplicaatMatch[]>([]);
  const {
    uploadFile,
    retryUpload,
    isUploading,
    error: uploadError,
    uploadFoutType,
  } = useUpload({
    bestand_type: "rapport",
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
    setDuplicaten([]);
    void uploadFile(file);

    // Bereken hash + grootte en controleer direct op een exact duplicaat (zelfde bestand).
    let hash = "";
    try {
      const buf = await file.arrayBuffer();
      hash = await sha256Hex(buf);
      setForm((f) => ({ ...f, bestands_hash: hash, bestandsgrootte: file.size }));
      const res = await duplicaatCheck.mutateAsync({ data: { bestands_hash: hash } });
      if (res.mogelijke_duplicaten?.length) setDuplicaten(res.mogelijke_duplicaten);
    } catch {
      // Duplicaatcontrole is niet kritiek; blokkeer het uploaden niet.
    }

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

      // Aanvullende fuzzy-controle op naam/rapportnummer/fabrikant (naast de exacte hash-match).
      try {
        const fuzzy = await duplicaatCheck.mutateAsync({
          data: {
            naam: res.naam ?? undefined,
            rapportnummer: res.rapportnummer ?? undefined,
            fabrikant: res.fabrikant ?? undefined,
          },
        });
        if (fuzzy.mogelijke_duplicaten?.length) {
          setDuplicaten((prev) => {
            const bestaand = new Set(prev.map((m) => m.document.id));
            const extra = fuzzy.mogelijke_duplicaten.filter(
              (m) => !bestaand.has(m.document.id),
            );
            return [...prev, ...extra];
          });
        }
      } catch {
        // niet kritiek
      }

      const suggesties = res.toepassing_suggesties ?? [];
      if (suggesties.length > 0) {
        const ids = suggesties.map((s) => s.label_id);
        setForm((f) => ({
          ...f,
          toepassing_ids: Array.from(new Set([...f.toepassing_ids, ...ids])),
        }));
        setAiToepassingen(new Set(ids));
      } else {
        setAiToepassingen(new Set());
      }
    } catch (err) {
      setFout(foutmelding(err, "Automatische analyse is mislukt. Vul de gegevens handmatig in."));
    } finally {
      setAiBezig(false);
    }
  }

  function toggleLijst(value: string) {
    const id = Number(value);
    setForm((f) => {
      const has = f.toepassing_ids.includes(id);
      return {
        ...f,
        toepassing_ids: has
          ? f.toepassing_ids.filter((x) => x !== id)
          : [...f.toepassing_ids, id],
      };
    });
    // Zodra de gebruiker een AI-voorstel aan- of uitzet, is het bevestigd: niet langer geel.
    setAiToepassingen((s) => {
      if (!s.has(id)) return s;
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }

  const uploadMislukt = !!uploadError && !form.pdf_url;
  const geldig = form.naam.trim() !== "" && form.documenttype !== "" && !uploadMislukt;
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
      bestands_hash: form.bestands_hash || undefined,
      bestandsgrootte: form.bestandsgrootte ?? undefined,
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
          <div className={`border-2 border-dashed rounded-lg p-4 text-center ${
            uploadError && !form.pdf_url
              ? "border-destructive/50 bg-destructive/5"
              : "border-muted"
          }`}>
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
            ) : uploadError ? (
              <>
                <AlertTriangle className="h-7 w-7 mx-auto text-destructive mb-2" />
                <p className="text-sm text-destructive mb-1">
                  {uploadFoutType === "netwerk"
                    ? "Verbinding tijdelijk weggevallen"
                    : uploadFoutType === "bestandstype"
                      ? "Bestandstype geweigerd"
                      : "Upload mislukt"}
                </p>
                <p className="text-xs text-muted-foreground mb-2">
                  {uploadError.message}
                </p>
              </>
            ) : (
              <>
                <Upload className="h-7 w-7 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground mb-2">
                  Kies een PDF-document
                </p>
              </>
            )}
            <div className="flex items-center justify-center gap-2 mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={isUploading || aiBezig}
              >
                {isUploading
                  ? "Uploaden..."
                  : form.pdf_url
                    ? "Ander bestand kiezen"
                    : uploadError
                      ? "Ander bestand kiezen"
                      : "Bestand kiezen"}
              </Button>
              {uploadError && !form.pdf_url && uploadFoutType !== "bestandstype" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void retryUpload()}
                  disabled={isUploading}
                >
                  Opnieuw proberen
                </Button>
              )}
            </div>
            {form.bestandsgrootte !== null && (
              <p className="text-xs text-muted-foreground mt-1">{formateerGrootte(form.bestandsgrootte)}</p>
            )}
          </div>
          {form.bestandsgrootte !== null && form.bestandsgrootte > GROOT_BESTAND_GRENS && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
              <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
              <span>Groot bestand ({formateerGrootte(form.bestandsgrootte)}) — overweeg een geoptimaliseerde versie</span>
            </div>
          )}

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

          {duplicaten.length > 0 && (
            <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 space-y-1">
              <p className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Mogelijk duplicaat gevonden
              </p>
              <p className="text-xs text-amber-700">
                Dit document lijkt al in de bibliotheek te staan. Controleer of u
                niet dubbel toevoegt; opslaan blijft mogelijk.
              </p>
              <ul className="text-xs space-y-0.5 mt-1">
                {duplicaten.slice(0, 4).map((m) => (
                  <li key={m.document.id} className="flex items-start gap-1">
                    <span className="font-medium">{m.document.naam}</span>
                    <span className="text-amber-700">— {m.reden}</span>
                  </li>
                ))}
              </ul>
            </div>
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

          <div className="space-y-2">
            {aiToepassingen.size > 0 && (
              <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  De AI stelt {aiToepassingen.size}{" "}
                  {aiToepassingen.size === 1 ? "toepassing" : "toepassingen"} voor op
                  basis van de herkende fabrikant, product en norm. Controleer de
                  selectie en pas zo nodig aan.
                </span>
              </div>
            )}
            <KoppelingenKiezer
              titel="Gekoppelde toepassingen"
              opties={toepassingOpties}
              geselecteerd={form.toepassing_ids.map(String)}
              onToggle={(v) => toggleLijst(v)}
              aiVoorstellen={
                new Set(Array.from(aiToepassingen).map(String))
              }
            />
          </div>
        </div>

        <DialogFooter className="flex-col items-end gap-2 sm:flex-col">
          {uploadMislukt && (
            <p className="text-xs text-destructive w-full text-right">
              Upload mislukt — kies een ander bestand of probeer opnieuw voordat u opslaat.
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuleren
            </Button>
            <Button onClick={bewaar} disabled={!geldig || bezig}>
              {bezig ? "Opslaan..." : mode === "revisie" ? "Revisie opslaan" : "Document opslaan"}
            </Button>
          </div>
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
  const { toast } = useToast();
  const { heeftNiveau } = useBevoegdheid();
  const magGoedkeuren = heeftNiveau("bibliotheek", 4);
  // Live versie ophalen zodat de dialoog na een mutatie niet op een verouderde
  // lijst-snapshot blijft hangen; de meegegeven snapshot dient als directe fallback.
  const { data: liveDoc } = useGetDocument(document.id);
  const doc = liveDoc ?? document;
  const { data: revisies = [] } = useListDocumentRevisies(document.id);
  const wijzigDocument = useUpdateDocument();
  const setToepassingen = useSetDocumentToepassingen();
  const [toep, setToep] = useState<number[]>(document.toepassing_ids ?? []);
  const [geldigTot, setGeldigTot] = useState<string>(doc.geldig_tot ?? "");

  const geldigGewijzigd = (geldigTot || "") !== (doc.geldig_tot ?? "");

  async function bewaarGeldigheid() {
    try {
      await wijzigDocument.mutateAsync({
        id: document.id,
        data: { geldig_tot: geldigTot.trim() === "" ? null : geldigTot },
      });
      await queryClient.invalidateQueries({ queryKey: getListDocumentenQueryKey() });
      await queryClient.invalidateQueries({
        queryKey: getGetDocumentQueryKey(document.id),
      });
      toast({
        title: "Geldigheid opgeslagen",
        description: geldigTot
          ? `"${doc.naam}" is geldig tot ${geldigTot}.`
          : `De geldigheidsdatum van "${doc.naam}" is verwijderd.`,
      });
    } catch (err) {
      toast({
        title: "Geldigheid opslaan mislukt",
        description: foutmelding(err, "Probeer het opnieuw."),
        variant: "destructive",
      });
    }
  }

  const koppelingenGewijzigd =
    JSON.stringify([...toep].sort()) !==
      JSON.stringify([...(doc.toepassing_ids ?? [])].sort());

  async function bewaarStatus(status: string) {
    try {
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
      toast({
        title: "Status gewijzigd",
        description: `"${doc.naam}" heeft nu de status "${STATUS_LABELS[status] ?? status}".`,
      });
    } catch (err) {
      toast({
        title: "Status wijzigen mislukt",
        description: foutmelding(err, "Probeer het opnieuw."),
        variant: "destructive",
      });
    }
  }

  async function toggleArchief() {
    const archiveren = !doc.gearchiveerd;
    try {
      await wijzigDocument.mutateAsync({
        id: document.id,
        data: { gearchiveerd: archiveren },
      });
      await queryClient.invalidateQueries({ queryKey: getListDocumentenQueryKey() });
      await queryClient.invalidateQueries({
        queryKey: getGetDocumentQueryKey(document.id),
      });
      toast({
        title: archiveren ? "Document gearchiveerd" : "Document hersteld",
        description: `"${doc.naam}" is ${archiveren ? "gearchiveerd" : "hersteld"}.`,
      });
    } catch (err) {
      toast({
        title: archiveren ? "Archiveren mislukt" : "Herstellen mislukt",
        description: foutmelding(err, "Probeer het opnieuw."),
        variant: "destructive",
      });
    }
  }

  async function bewaarKoppelingen() {
    try {
      await setToepassingen.mutateAsync({ id: document.id, data: { label_ids: toep } });
      await queryClient.invalidateQueries({ queryKey: getListDocumentenQueryKey() });
      await queryClient.invalidateQueries({
        queryKey: getGetDocumentQueryKey(document.id),
      });
      toast({
        title: "Koppelingen opgeslagen",
        description: `De toepassingskoppelingen van "${doc.naam}" zijn bijgewerkt.`,
      });
    } catch (err) {
      toast({
        title: "Koppelingen opslaan mislukt",
        description: foutmelding(err, "Probeer het opnieuw."),
        variant: "destructive",
      });
    }
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
              href={`/api/documenten/${doc.id}/download`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary"
            >
              <Download className="h-4 w-4" />
              PDF openen
            </a>
          )}

          {/* Goedkeuringsflow */}
          <DocumentGoedkeuringSectie
            doc={doc}
            magIndienen={magCreeren}
            magGoedkeuren={magGoedkeuren}
          />

          {/* Geldigheid */}
          <div className="border-t pt-4 space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Geldigheid
            </h4>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-48">
                <UiLabel htmlFor="doc-geldig-tot">Geldig tot</UiLabel>
                <DatePicker
                  id="doc-geldig-tot"
                  value={geldigTot}
                  onChange={setGeldigTot}
                  disabled={!magBeheren}
                />
              </div>
              {(() => {
                const gs = geldigheidStatus(doc.geldig_tot);
                if (gs === "verlopen")
                  return (
                    <Badge variant="outline" className="text-destructive border-destructive/40">
                      Verlopen
                    </Badge>
                  );
                if (gs === "binnenkort")
                  return (
                    <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
                      Verloopt binnenkort
                    </Badge>
                  );
                if (gs === "ok")
                  return (
                    <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
                      Geldig
                    </Badge>
                  );
                return (
                  <span className="text-xs text-muted-foreground pb-2">
                    Geen geldigheidsdatum ingesteld
                  </span>
                );
              })()}
              {magBeheren && geldigGewijzigd && (
                <Button
                  size="sm"
                  onClick={bewaarGeldigheid}
                  disabled={wijzigDocument.isPending}
                >
                  Geldigheid opslaan
                </Button>
              )}
            </div>
          </div>

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

          {/* Gekoppelde entiteiten (gebouw/klant/offerte/dossier/spot) */}
          <DocumentEntiteitKoppelingen documentId={document.id} magBeheren={magBeheren} />

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
                        href={`/api/documenten/${r.id}/download`}
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

          {/* Audittrail / logboek */}
          <DocumentLogboekSectie documentId={document.id} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Goedkeuringsflow: concept -> ter goedkeuring (indienen, bibliotheek>=3) -> goedgekeurd/
// afgekeurd (bibliotheek>=4). De statusbadge volgt de AI-state-kleurconventie niet (dit is
// een lifecycle-status, geen AI-voorstel).
function DocumentGoedkeuringSectie({
  doc,
  magIndienen,
  magGoedkeuren,
}: {
  doc: Document;
  magIndienen: boolean;
  magGoedkeuren: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: goedkeuringen = [] } = useListDocumentGoedkeuringen(doc.id);
  const indienen = useIndienenDocument();
  const goedkeuren = useGoedkeurenDocument();
  const afkeuren = useAfkeurenDocument();
  const [opmerking, setOpmerking] = useState("");

  const status = doc.goedkeuring_status;
  const bezig = indienen.isPending || goedkeuren.isPending || afkeuren.isPending;

  async function ververs() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetDocumentQueryKey(doc.id) }),
      queryClient.invalidateQueries({ queryKey: getListDocumentenQueryKey() }),
      queryClient.invalidateQueries({
        queryKey: getListDocumentGoedkeuringenQueryKey(doc.id),
      }),
      queryClient.invalidateQueries({
        queryKey: getGetDocumentLogboekQueryKey(doc.id),
      }),
      queryClient.invalidateQueries({
        queryKey: getListDocumentSignaleringenQueryKey(),
      }),
    ]);
  }

  async function voer(
    actie: "indienen" | "goedkeuren" | "afkeuren",
    fn: () => Promise<unknown>,
    titel: string,
  ) {
    try {
      await fn();
      await ververs();
      setOpmerking("");
      toast({ title: titel, description: `"${doc.naam}".` });
    } catch (err) {
      toast({
        title: "Actie mislukt",
        description: foutmelding(err, "Probeer het opnieuw."),
        variant: "destructive",
      });
    }
  }

  return (
    <div className="border-t pt-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          Goedkeuring
        </h4>
        {goedkeuringBadge(status)}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {status === "concept" && magIndienen && (
          <Button
            size="sm"
            variant="outline"
            disabled={bezig}
            onClick={() =>
              voer(
                "indienen",
                () => indienen.mutateAsync({ id: doc.id }),
                "Ingediend ter goedkeuring",
              )
            }
          >
            <Send className="h-4 w-4 mr-1" />
            Indienen ter goedkeuring
          </Button>
        )}
        {status === "ter_goedkeuring" && magGoedkeuren && (
          <>
            <Button
              size="sm"
              disabled={bezig}
              onClick={() =>
                voer(
                  "goedkeuren",
                  () =>
                    goedkeuren.mutateAsync({
                      id: doc.id,
                      data: opmerking.trim() ? { opmerking: opmerking.trim() } : undefined,
                    }),
                  "Document goedgekeurd",
                )
              }
            >
              <ShieldCheck className="h-4 w-4 mr-1" />
              Goedkeuren
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive"
              disabled={bezig}
              onClick={() =>
                voer(
                  "afkeuren",
                  () =>
                    afkeuren.mutateAsync({
                      id: doc.id,
                      data: opmerking.trim() ? { opmerking: opmerking.trim() } : undefined,
                    }),
                  "Document afgekeurd",
                )
              }
            >
              <ShieldX className="h-4 w-4 mr-1" />
              Afkeuren
            </Button>
          </>
        )}
      </div>

      {status === "ter_goedkeuring" && magGoedkeuren && (
        <Input
          placeholder="Opmerking (optioneel)"
          value={opmerking}
          onChange={(e) => setOpmerking(e.target.value)}
        />
      )}

      {(goedkeuringen as DocumentGoedkeuring[]).length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-1">
          {(goedkeuringen as DocumentGoedkeuring[]).map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium text-foreground">
                {GOEDKEURING_LABELS[g.actie] ?? g.actie}
              </span>
              <span>door {g.door_naam || "onbekend"}</span>
              <span>· {formatTijdstip(g.tijdstip)}</span>
              {g.opmerking && <span className="italic">— {g.opmerking}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Polymorfe koppelingen aan gebouw/klant/offerte/dossier/spot. Het toevoeg-formulier
// wordt pas gemount (en haalt pas entiteitenlijsten op) wanneer de gebruiker het opent.
function DocumentEntiteitKoppelingen({
  documentId,
  magBeheren,
}: {
  documentId: number;
  magBeheren: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: koppelingen = [] } = useListDocumentKoppelingen(documentId);
  const verwijder = useRemoveDocumentKoppeling();
  const [toevoegenOpen, setToevoegenOpen] = useState(false);

  async function ververs() {
    await queryClient.invalidateQueries({
      queryKey: getListDocumentKoppelingenQueryKey(documentId),
    });
    await queryClient.invalidateQueries({
      queryKey: getGetDocumentLogboekQueryKey(documentId),
    });
  }

  async function verwijderKoppeling(koppeling: DocumentKoppeling) {
    try {
      await verwijder.mutateAsync({ id: documentId, koppelingId: koppeling.id });
      await ververs();
      const doel = koppeling.doel_naam || `#${koppeling.doel_id}`;
      toast({
        title: "Koppeling verwijderd",
        description: `De koppeling met ${doel} is losgekoppeld.`,
      });
    } catch (err) {
      toast({
        title: "Koppeling verwijderen mislukt",
        description: foutmelding(err, "Probeer het opnieuw."),
        variant: "destructive",
      });
    }
  }

  const lijst = koppelingen as DocumentKoppeling[];

  return (
    <div className="border-t pt-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium flex items-center gap-1.5">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          Gekoppeld aan
        </h4>
        {magBeheren && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setToevoegenOpen((o) => !o)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Koppeling toevoegen
          </Button>
        )}
      </div>

      {lijst.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nog niet gekoppeld aan een gebouw, klant, offerte, dossier of spot.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {lijst.map((k) => (
            <span
              key={k.id}
              className="inline-flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1 text-xs"
            >
              <Badge variant="outline" className="text-[10px]">
                {KOPPELING_LABELS[k.doel_type] ?? k.doel_type}
              </Badge>
              <span className="font-medium">{k.doel_naam || `#${k.doel_id}`}</span>
              {magBeheren && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => verwijderKoppeling(k)}
                  disabled={verwijder.isPending}
                  aria-label="Koppeling verwijderen"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {toevoegenOpen && magBeheren && (
        <KoppelingToevoegen
          documentId={documentId}
          onGekoppeld={() => {
            void ververs();
            setToevoegenOpen(false);
          }}
        />
      )}
    </div>
  );
}

const KOPPEL_TYPES: { value: string; label: string }[] = [
  { value: KoppelingDoelType.gebouw, label: "Gebouw" },
  { value: KoppelingDoelType.klant, label: "Klant" },
  { value: KoppelingDoelType.offerte, label: "Offerte" },
  { value: KoppelingDoelType.dossier, label: "Dossier" },
];

function KoppelingToevoegen({
  documentId,
  onGekoppeld,
}: {
  documentId: number;
  onGekoppeld: () => void;
}) {
  const { toast } = useToast();
  const toevoegen = useAddDocumentKoppeling();
  const [doelType, setDoelType] = useState<string>(KoppelingDoelType.gebouw);
  const [doelId, setDoelId] = useState<string>("");

  const { data: gebouwen = [] } = useListGebouwen();
  const { data: klanten = [] } = useListCrmKlanten();
  const { data: offertes = [] } = useListOffertes();
  const { data: dossiers = [] } = useListDossiers();

  const opties = useMemo(() => {
    if (doelType === KoppelingDoelType.gebouw)
      return gebouwen.map((g) => ({ value: String(g.id), label: g.naam }));
    if (doelType === KoppelingDoelType.klant)
      return klanten.map((k) => ({ value: String(k.id), label: k.naam }));
    if (doelType === KoppelingDoelType.offerte)
      return offertes.map((o) => ({ value: String(o.id), label: o.titel }));
    if (doelType === KoppelingDoelType.dossier)
      return dossiers.map((d) => ({ value: String(d.id), label: d.naam }));
    return [];
  }, [doelType, gebouwen, klanten, offertes, dossiers]);

  async function koppel() {
    if (!doelId) return;
    try {
      await toevoegen.mutateAsync({
        id: documentId,
        data: {
          doel_type: doelType as DocumentKoppeling["doel_type"],
          doel_id: Number(doelId),
        },
      });
      const doel = opties.find((o) => o.value === doelId)?.label ?? `#${doelId}`;
      toast({
        title: "Koppeling toegevoegd",
        description: `Het document is gekoppeld aan ${doel}.`,
      });
      onGekoppeld();
    } catch (err) {
      toast({
        title: "Koppelen mislukt",
        description: foutmelding(err, "Probeer het opnieuw."),
        variant: "destructive",
      });
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/20 p-3">
      <div className="min-w-36">
        <UiLabel>Type</UiLabel>
        <Select
          value={doelType}
          onValueChange={(v) => {
            setDoelType(v);
            setDoelId("");
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KOPPEL_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-48 flex-1">
        <UiLabel>Doel</UiLabel>
        <Select value={doelId} onValueChange={setDoelId}>
          <SelectTrigger>
            <SelectValue placeholder="Kies..." />
          </SelectTrigger>
          <SelectContent>
            {opties.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button size="sm" onClick={koppel} disabled={!doelId || toevoegen.isPending}>
        Koppelen
      </Button>
    </div>
  );
}

// Audittrail per document. Geen view-logging; alleen betekenisvolle acties.
function DocumentLogboekSectie({ documentId }: { documentId: number }) {
  const { data: regels = [] } = useGetDocumentLogboek(documentId);
  const lijst = regels as DocumentLogboekRegel[];

  return (
    <div className="border-t pt-4">
      <h4 className="text-sm font-medium flex items-center gap-1.5 mb-2">
        <ClipboardList className="h-4 w-4 text-muted-foreground" />
        Logboek
      </h4>
      {lijst.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nog geen acties geregistreerd.</p>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {lijst.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-1.5">
              <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">{formatTijdstip(r.tijdstip)}</span>
              <span className="font-medium">{r.actie}</span>
              {r.gebruiker_naam && (
                <span className="text-muted-foreground">door {r.gebruiker_naam}</span>
              )}
              {r.detail && <span className="text-muted-foreground">— {r.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
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

// Reviewdialoog voor AI-koppelvoorstellen: de AI stelt voor welke toepassingen aan de
// nieuwste documenten gekoppeld kunnen worden; de beheerder neemt per voorstel (of per
// document in één keer) over. Voorstellen zijn GEEL (amber + Sparkles); overgenomen
// koppelingen worden NEUTRAAL weergegeven, volgens de AI-state kleurconventie.
function KoppelVoorstellenDialog({
  voorstellen,
  onOpenChange,
}: {
  voorstellen: DocumentKoppelVoorstel[];
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const setToepassingen = useSetDocumentToepassingen();
  // document_id -> in deze sessie reeds overgenomen label_ids
  const [overgenomen, setOvergenomen] = useState<Record<number, number[]>>({});
  const [bezigDoc, setBezigDoc] = useState<number | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  async function neemOver(v: DocumentKoppelVoorstel, labelIds: number[]) {
    setBezigDoc(v.document_id);
    setFout(null);
    try {
      const reeds = overgenomen[v.document_id] ?? [];
      const nieuweSet = Array.from(
        new Set([...v.huidige_toepassing_ids, ...reeds, ...labelIds]),
      );
      await setToepassingen.mutateAsync({
        id: v.document_id,
        data: { label_ids: nieuweSet },
      });
      setOvergenomen((s) => ({
        ...s,
        [v.document_id]: Array.from(new Set([...reeds, ...labelIds])),
      }));
      await queryClient.invalidateQueries({ queryKey: getListDocumentenQueryKey() });
      const namen = v.suggesties
        .filter((s) => labelIds.includes(s.label_id))
        .map((s) => s.naam);
      toast({
        title:
          namen.length > 1 ? "Koppelingen overgenomen" : "Koppeling overgenomen",
        description: `${namen.join(", ")} nu gekoppeld aan "${v.document_naam}". Terug te vinden in het document onder "Gekoppelde toepassingen".`,
      });
    } catch (err) {
      const melding = foutmelding(err, "Koppeling overnemen mislukte.");
      setFout(melding);
      toast({
        variant: "destructive",
        title: "Koppeling overnemen mislukt",
        description: melding,
      });
    } finally {
      setBezigDoc(null);
    }
  }

  async function trekIn(v: DocumentKoppelVoorstel, labelIds: number[]) {
    setBezigDoc(v.document_id);
    setFout(null);
    try {
      const reeds = overgenomen[v.document_id] ?? [];
      const huidig = Array.from(
        new Set([...v.huidige_toepassing_ids, ...reeds]),
      );
      const nieuweSet = huidig.filter((id) => !labelIds.includes(id));
      await setToepassingen.mutateAsync({
        id: v.document_id,
        data: { label_ids: nieuweSet },
      });
      setOvergenomen((s) => ({
        ...s,
        [v.document_id]: reeds.filter((id) => !labelIds.includes(id)),
      }));
      await queryClient.invalidateQueries({ queryKey: getListDocumentenQueryKey() });
      const namen = v.suggesties
        .filter((s) => labelIds.includes(s.label_id))
        .map((s) => s.naam);
      toast({
        title:
          namen.length > 1
            ? "Koppelingen teruggedraaid"
            : "Koppeling teruggedraaid",
        description: `${namen.join(", ")} niet langer gekoppeld aan "${v.document_naam}".`,
      });
    } catch (err) {
      const melding = foutmelding(err, "Koppeling terugdraaien mislukte.");
      setFout(melding);
      toast({
        variant: "destructive",
        title: "Koppeling terugdraaien mislukt",
        description: melding,
      });
    } finally {
      setBezigDoc(null);
    }
  }

  const totaalOvergenomen = Object.values(overgenomen).reduce(
    (n, ids) => n + ids.length,
    0,
  );

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI-koppelvoorstellen
          </DialogTitle>
          <DialogDescription>
            De AI vergelijkt de fabrikant, het product en de norm van elk actueel document
            met de bestaande toepassingen en stelt nieuwe koppelingen voor. De voorstellen
            zijn een hulpmiddel; u beslist welke u overneemt.
          </DialogDescription>
        </DialogHeader>

        {voorstellen.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <InfoIcon className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Wat u overneemt wordt meteen opgeslagen en verschijnt in het
              betreffende document onder &quot;Gekoppelde toepassingen&quot;.
              Sluit dit venster en open het document om de koppeling te bekijken.
            </span>
          </div>
        )}

        {fout && (
          <div className="text-sm text-destructive border border-destructive/30 bg-destructive/5 rounded-md px-3 py-2">
            {fout}
          </div>
        )}

        {voorstellen.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            Geen nieuwe koppelvoorstellen gevonden. De actuele documenten zijn al gekoppeld,
            of er is geen passende toepassing herkend. Voeg eerst documenten toe of laat ze
            analyseren.
          </div>
        ) : (
          <div className="space-y-4">
            {voorstellen.map((v) => {
              const reeds = new Set(overgenomen[v.document_id] ?? []);
              const openstaand = v.suggesties.filter((s) => !reeds.has(s.label_id));
              const overgenomenNamen = v.suggesties
                .filter((s) => reeds.has(s.label_id))
                .map((s) => s.naam);
              return (
                <div key={v.document_id} className="rounded-lg border p-3 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <FileText className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{v.document_naam}</p>
                      <p className="text-xs text-muted-foreground">
                        {TYPE_LABELS[v.documenttype] ?? v.documenttype}
                        {v.fabrikant ? ` · ${v.fabrikant}` : ""}
                      </p>
                    </div>
                    {openstaand.length > 1 && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={bezigDoc === v.document_id}
                        onClick={() => neemOver(v, openstaand.map((s) => s.label_id))}
                      >
                        Alles overnemen
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {v.suggesties.map((s) => {
                      const isOvergenomen = reeds.has(s.label_id);
                      return (
                        <div
                          key={s.label_id}
                          className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 ${
                            isOvergenomen
                              ? "bg-muted/40"
                              : "border-amber-300 bg-amber-50"
                          }`}
                        >
                          {isOvergenomen ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <Sparkles className="h-4 w-4 shrink-0 text-amber-700" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p
                              className={`truncate text-sm font-medium ${
                                isOvergenomen ? "text-muted-foreground" : "text-amber-800"
                              }`}
                            >
                              {s.naam}
                            </p>
                            {s.reden && (
                              <p className="text-xs text-muted-foreground truncate">
                                {s.reden} · score {Math.round(s.score)}
                              </p>
                            )}
                          </div>
                          {isOvergenomen ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Badge variant="secondary" className="text-muted-foreground">
                                Overgenomen
                              </Badge>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                disabled={bezigDoc === v.document_id}
                                onClick={() => trekIn(v, [s.label_id])}
                              >
                                Terugdraaien
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={bezigDoc === v.document_id}
                              onClick={() => neemOver(v, [s.label_id])}
                            >
                              Overnemen
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {overgenomenNamen.length > 0 && (
                    <div className="flex items-start gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>
                        Gekoppeld aan dit document: {overgenomenNamen.join(", ")}.
                        Te vinden onder &quot;Gekoppelde toepassingen&quot; in het
                        document.
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          {totaalOvergenomen > 0 ? (
            <p className="text-xs text-muted-foreground">
              {totaalOvergenomen} koppeling{totaalOvergenomen === 1 ? "" : "en"}{" "}
              overgenomen
            </p>
          ) : (
            <span />
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Sluiten
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Signaleringen-dashboard: actuele documenten die aandacht vragen. Verlopen is
// kritiek (destructive), de overige buckets zijn aandachtspunten (amber/neutraal).
function DocumentSignaleringenDashboard({
  signaleringen,
  onOpen,
}: {
  signaleringen: DocumentSignaleringen;
  onOpen: (doc: Document) => void;
}) {
  const tegels: {
    sleutel: keyof DocumentSignaleringen;
    label: string;
    docs: Document[];
    klasse: string;
    icon: ReactNode;
  }[] = [
    {
      sleutel: "verlopen",
      label: "Verlopen",
      docs: signaleringen.verlopen,
      klasse: "border-destructive/40 bg-destructive/5 text-destructive",
      icon: <ShieldX className="h-4 w-4" />,
    },
    {
      sleutel: "binnenkort",
      label: "Verloopt binnenkort",
      docs: signaleringen.binnenkort,
      klasse: "border-amber-300 bg-amber-50 text-amber-700",
      icon: <Clock className="h-4 w-4" />,
    },
    {
      sleutel: "ter_goedkeuring",
      label: "Ter goedkeuring",
      docs: signaleringen.ter_goedkeuring,
      klasse: "border-border bg-muted/40 text-foreground",
      icon: <ShieldCheck className="h-4 w-4" />,
    },
    {
      sleutel: "controle_nodig",
      label: "Controle nodig",
      docs: signaleringen.controle_nodig,
      klasse: "border-amber-300 bg-amber-50 text-amber-700",
      icon: <AlertTriangle className="h-4 w-4" />,
    },
  ];

  const totaalSignalen = tegels.reduce((n, t) => n + t.docs.length, 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tegels.map((t) => (
          <div
            key={t.sleutel}
            className={`rounded-lg border p-3 ${t.klasse}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">{t.label}</span>
              {t.icon}
            </div>
            <p className="text-2xl font-semibold mt-1">{t.docs.length}</p>
          </div>
        ))}
      </div>

      {totaalSignalen === 0 ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Geen openstaande signaleringen.
        </p>
      ) : (
        <div className="rounded-lg border divide-y">
          {tegels
            .filter((t) => t.docs.length > 0)
            .map((t) =>
              t.docs.slice(0, 8).map((d) => (
                <button
                  type="button"
                  key={`${t.sleutel}-${d.id}`}
                  onClick={() => onOpen(d)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/30"
                >
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {t.label}
                  </Badge>
                  <span className="flex-1 truncate">{d.naam}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {d.geldig_tot ? `geldig tot ${d.geldig_tot}` : ""}
                  </span>
                </button>
              )),
            )}
        </div>
      )}
    </div>
  );
}

// Globaal audittrail over alle documenten. Alleen gemount (en pas dan opgehaald)
// wanneer de beheerder het paneel opent.
function DocumentAudittrail() {
  const { data: regels = [] } = useListDocumentLogboek({ limiet: 100 });
  const lijst = regels as DocumentLogboekRegel[];

  return (
    <div className="rounded-lg border">
      {lijst.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          Nog geen acties geregistreerd.
        </p>
      ) : (
        <ul className="divide-y">
          {lijst.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-1.5 px-3 py-2 text-xs"
            >
              <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">{formatTijdstip(r.tijdstip)}</span>
              <span className="font-medium">{r.actie}</span>
              {r.document_naam && (
                <span className="text-muted-foreground">· {r.document_naam}</span>
              )}
              {r.gebruiker_naam && (
                <span className="text-muted-foreground">door {r.gebruiker_naam}</span>
              )}
              {r.detail && <span className="text-muted-foreground">— {r.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Hoofd-tab ────────────────────────────────────────────────────────────────
export function TabDocumenten() {
  const { heeftNiveau } = useBevoegdheid();
  const magCreeren = heeftNiveau("bibliotheek", 3);
  const magBeheren = heeftNiveau("bibliotheek", 2);
  const magAudittrail = heeftNiveau("bibliotheek", 4);

  const [zoek, setZoek] = useState("");
  const [auditOpen, setAuditOpen] = useState(false);

  const { data: signaleringen } = useListDocumentSignaleringen();

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
    zoek.trim() !== "" ||
    typeFilter !== GEEN ||
    statusFilter !== GEEN ||
    fabrikantFilter.trim() !== "" ||
    !alleenActueel ||
    inclGearchiveerd;

  function wisFilters() {
    setZoek("");
    wisTypeFilter();
    wisStatusFilter();
    wisFabrikantFilter();
    wisAlleenActueel();
    wisInclGearchiveerd();
  }

  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [detail, setDetail] = useState<Document | null>(null);
  const [revisieVoor, setRevisieVoor] = useState<Document | null>(null);
  const [koppelVoorstellen, setKoppelVoorstellen] = useState<
    DocumentKoppelVoorstel[] | null
  >(null);
  const [koppelFout, setKoppelFout] = useState<string | null>(null);

  const koppelMutatie = useAiKoppelvoorstellenDocumenten();

  async function laadKoppelVoorstellen() {
    setKoppelFout(null);
    try {
      const resultaat = await koppelMutatie.mutateAsync();
      setKoppelVoorstellen(resultaat);
    } catch (err) {
      setKoppelFout(
        foutmelding(err, "AI-koppelvoorstellen ophalen is mislukt. Probeer het opnieuw."),
      );
    }
  }

  const { data: labels = [] } = useListLabels({});

  const { data: documenten = [], isLoading } = useListDocumenten({
    zoek: zoek.trim() || undefined,
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
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            onClick={laadKoppelVoorstellen}
            disabled={koppelMutatie.isPending}
            title="Laat de AI de nieuwste documenten koppelen aan passende toepassingen"
          >
            <Sparkles
              className={`h-4 w-4 mr-2 ${koppelMutatie.isPending ? "animate-pulse" : ""}`}
            />
            {koppelMutatie.isPending ? "AI zoekt koppelingen..." : "AI-koppelvoorstellen"}
          </Button>
          <Button onClick={() => setNieuwOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nieuw document
          </Button>
        </div>
      )}

      {koppelFout && (
        <div className="text-sm text-destructive border border-destructive/30 bg-destructive/5 rounded-md px-3 py-2">
          {koppelFout}
        </div>
      )}

      {signaleringen && (
        <DocumentSignaleringenDashboard
          signaleringen={signaleringen}
          onOpen={setDetail}
        />
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Zoek op naam, fabrikant, rapportnummer, EN-norm..."
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
              className="w-72"
            />
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

      {magAudittrail && (
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAuditOpen((o) => !o)}
          >
            <ClipboardList className="h-4 w-4 mr-2" />
            {auditOpen ? "Audittrail verbergen" : "Audittrail tonen"}
          </Button>
          {auditOpen && <DocumentAudittrail />}
        </div>
      )}

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

      {koppelVoorstellen !== null && (
        <KoppelVoorstellenDialog
          voorstellen={koppelVoorstellen}
          onOpenChange={(o) => {
            if (!o) setKoppelVoorstellen(null);
          }}
        />
      )}
    </div>
  );
}
