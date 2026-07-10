import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  useListOffertePortaalTokens,
  useCreateOffertePortaalToken,
  useCreateOfferteAiEmail,
  useVerzendOfferte,
  useListOfferteTracking,
  useBeantwoordOfferteVraag,
  useUpdateOfferte,
  useListOfferteKlantContracten,
  useCreateOfferteKlantContract,
  useGetOfferteKlantContractUploadUrl,
  useDeleteOfferteKlantContract,
  useGenereerOfferteContractAdvies,
  getListOffertePortaalTokensQueryKey,
  getListOfferteTrackingQueryKey,
  getListOfferteVragenQueryKey,
  getListOfferteKlantContractenQueryKey,
  getGetOfferteQueryKey,
} from "@workspace/api-client-react";
import type {
  OffertePortaalToken,
  OfferteTrackingEvent,
  OfferteVraag,
  OfferteEmailVoorstel,
  OfferteKlantContract,
  OfferteContractAdvies,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Link2, Copy, Plus, Send, Sparkles, Clock, MessageSquare, CheckCircle, Eye, AlertCircle, Reply,
  FileText, List, Paperclip, Upload, Trash2, Brain, ChevronDown, ChevronUp, ShieldAlert,
  ShieldCheck, FileCheck, CheckCircle2, Circle,
} from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

async function extracteerPdfTekst(file: File): Promise<string> {
  try {
    const data = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const paginas: string[] = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 100); i++) {
      const pagina = await pdf.getPage(i);
      const inhoud = await pagina.getTextContent();
      paginas.push(inhoud.items.map((item) => ("str" in item ? (item as { str: string }).str : "")).join(" "));
    }
    return paginas.join("\n").slice(0, 60000);
  } catch {
    return "";
  }
}

function datumLabel(iso: string) {
  return new Date(iso).toLocaleString("nl-NL", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const EVENT_LABEL: Record<string, string> = {
  portaal_bekeken: "Portaal geopend",
  bekeken: "Bekeken",
  pdf_gedownload: "PDF gedownload",
  bijlage_gedownload: "Bijlage gedownload",
  ondertekend: "Ondertekend",
  afgewezen: "Afgewezen",
  vraag_gesteld: "Vraag gesteld",
  vraag_beantwoord: "Vraag beantwoord",
  verzonden: "E-mail verzonden",
};

function eventBadge(event: string) {
  if (event === "ondertekend") return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">{EVENT_LABEL[event] ?? event}</Badge>;
  if (event === "afgewezen") return <Badge className="bg-rose-100 text-rose-800 border-rose-200">{EVENT_LABEL[event] ?? event}</Badge>;
  if (event === "vraag_gesteld") return <Badge className="bg-blue-100 text-blue-800 border-blue-200">{EVENT_LABEL[event] ?? event}</Badge>;
  if (event === "vraag_beantwoord") return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">{EVENT_LABEL[event] ?? event}</Badge>;
  if (event === "pdf_gedownload" || event === "bijlage_gedownload") return <Badge className="bg-purple-100 text-purple-800 border-purple-200">{EVENT_LABEL[event] ?? event}</Badge>;
  return <Badge variant="outline">{EVENT_LABEL[event] ?? event}</Badge>;
}

function risicoKleur(niveau: string) {
  if (niveau === "hoog") return "bg-rose-100 text-rose-800 border-rose-200";
  if (niveau === "middel") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-emerald-100 text-emerald-800 border-emerald-200";
}

function risicoLabel(niveau: string) {
  if (niveau === "hoog") return "Hoog risico";
  if (niveau === "middel") return "Middel risico";
  return "Laag risico";
}

function RisicoIcoon({ niveau }: { niveau: string }) {
  if (niveau === "hoog") return <ShieldAlert className="h-4 w-4 text-rose-600" />;
  if (niveau === "middel") return <ShieldAlert className="h-4 w-4 text-amber-600" />;
  return <ShieldCheck className="h-4 w-4 text-emerald-600" />;
}

interface VerzendSectie {
  id: number;
  titel: string;
  actief: boolean;
  type?: string;
}

interface VerzendRegel {
  id: number;
  maatregel: string;
  kosten: number;
  is_optioneel?: boolean;
}

interface VerzendTabProps {
  offerteId: number;
  opdrachtgever?: string | null;
  titel: string;
  vragen?: OfferteVraag[];
  vragenLaden?: boolean;
  secties?: VerzendSectie[];
  regels?: VerzendRegel[];
  bijlagenAantal?: number;
  verzendType?: string;
}

interface AntwoordForm {
  tekst: string;
  email: string;
  naam: string;
}

function AdviesPanel({
  offerteId,
  contract,
  onAdviesGeladen,
}: {
  offerteId: number;
  contract: OfferteKlantContract;
  onAdviesGeladen: (contractId: number, advies: OfferteContractAdvies) => void;
}) {
  const { toast } = useToast();
  const [advies, setAdvies] = useState<OfferteContractAdvies | null>(null);
  const [laden, setLaden] = useState(contract.heeft_advies);
  const [volledigOpen, setVolledigOpen] = useState(false);
  const genereer = useGenereerOfferteContractAdvies();

  useEffect(() => {
    if (!contract.heeft_advies) return;
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    fetch(`${base}/api/offertes/${offerteId}/klant-contracten/${contract.id}/advies`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: OfferteContractAdvies | null) => {
        if (data) { setAdvies(data); onAdviesGeladen(contract.id, data); }
        setLaden(false);
      })
      .catch(() => setLaden(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function genereerAdvies() {
    try {
      const result = await genereer.mutateAsync({ id: offerteId, contractId: contract.id });
      setAdvies(result);
      onAdviesGeladen(contract.id, result);
      toast({ title: "AI-contractadvies gegenereerd" });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast({ title: msg ?? "Analyse mislukt", variant: "destructive" });
    }
  }

  if (laden) {
    return (
      <div className="space-y-2 pt-3 border-t mt-3">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  if (!advies) {
    return (
      <div className="pt-3 border-t mt-3 space-y-2">
        <p className="text-sm text-muted-foreground">
          Laat AI het klantcontract analyseren en een intern adviesrapport opstellen voor de directie.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={genereerAdvies}
          disabled={genereer.isPending}
        >
          <Brain className="h-3.5 w-3.5" />
          {genereer.isPending ? "Analyseren…" : "AI-analyse starten"}
        </Button>
        {genereer.isPending && (
          <div className="space-y-1.5 pt-1">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        )}
      </div>
    );
  }

  const aandachtspunten = Array.isArray(advies.aandachtspunten) ? advies.aandachtspunten : [];

  return (
    <div className="pt-3 border-t mt-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <RisicoIcoon niveau={advies.risico_niveau} />
          <span className="text-sm font-semibold">AI-contractadvies</span>
          <Badge className={`text-xs ${risicoKleur(advies.risico_niveau)}`}>
            {risicoLabel(advies.risico_niveau)}
          </Badge>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-muted-foreground"
          onClick={genereerAdvies}
          disabled={genereer.isPending}
        >
          <Brain className="h-3 w-3" />
          {genereer.isPending ? "Analyseren…" : "Opnieuw"}
        </Button>
      </div>

      {advies.advies_samenvatting && (
        <div className="rounded-md bg-muted/50 border px-3 py-2 text-sm text-muted-foreground">
          {advies.advies_samenvatting}
        </div>
      )}

      {aandachtspunten.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Aandachtspunten ({aandachtspunten.length})
          </p>
          {aandachtspunten.map((punt: {
            titel?: string;
            beschrijving?: string;
            prioriteit?: string;
            clausule?: string | null;
          }, i: number) => (
            <div key={i} className="rounded-md border p-2.5 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{punt.titel}</span>
                {punt.clausule && (
                  <Badge variant="outline" className="text-xs font-mono">{punt.clausule}</Badge>
                )}
                {punt.prioriteit === "hoog" && (
                  <Badge className="text-xs bg-rose-100 text-rose-800 border-rose-200">Hoog</Badge>
                )}
                {punt.prioriteit === "middel" && (
                  <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-200">Middel</Badge>
                )}
              </div>
              {punt.beschrijving && (
                <p className="text-xs text-muted-foreground">{punt.beschrijving}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {advies.volledig_advies && (
        <div>
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setVolledigOpen((v) => !v)}
          >
            {volledigOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Volledig advies voor directie
          </button>
          {volledigOpen && (
            <div className="mt-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground whitespace-pre-wrap max-h-60 overflow-y-auto">
              {advies.volledig_advies}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Gegenereerd op {datumLabel(advies.aangemaakt_op)} — intern gebruik, niet zichtbaar voor klant
      </p>
    </div>
  );
}

export function VerzendTab({
  offerteId,
  opdrachtgever,
  titel,
  vragen,
  vragenLaden,
  secties,
  regels,
  bijlagenAantal,
  verzendType: verzendTypeProp = "ondertekening",
}: VerzendTabProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [verzendType, setVerzendTypeLocal] = useState(verzendTypeProp);

  const { data: tokens, isLoading: tokensLaden } = useListOffertePortaalTokens(offerteId);
  const { data: tracking, isLoading: trackingLaden } = useListOfferteTracking(offerteId);
  const { data: contracten, isLoading: contractenLaden } = useListOfferteKlantContracten(offerteId);

  const maakToken = useCreateOffertePortaalToken();
  const aiEmail = useCreateOfferteAiEmail();
  const verzend = useVerzendOfferte();
  const beantwoord = useBeantwoordOfferteVraag();
  const werkOfferte = useUpdateOfferte();
  const uploadUrlMutatie = useGetOfferteKlantContractUploadUrl();
  const registreerContract = useCreateOfferteKlantContract();
  const verwijderContract = useDeleteOfferteKlantContract();

  const [emailVoorstel, setEmailVoorstel] = useState<OfferteEmailVoorstel | null>(null);
  const [emailForm, setEmailForm] = useState({
    naar_email: "",
    naar_naam: opdrachtgever ?? "",
    onderwerp: "",
    tekst: "",
  });

  const [openAntwoord, setOpenAntwoord] = useState<number | null>(null);
  const [antwoordForms, setAntwoordForms] = useState<Record<number, AntwoordForm>>({});
  const [adviesOpen, setAdviesOpen] = useState<number | null>(null);
  const [uploadBezig, setUploadBezig] = useState(false);

  const autoFillGedaan = useRef(false);
  const bestandInputRef = useRef<HTMLInputElement>(null);

  const baseUrl = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}`;

  useEffect(() => {
    setVerzendTypeLocal(verzendTypeProp);
  }, [verzendTypeProp]);

  // Auto-genereer AI-voorstel zodra de tab opent (eenmalig)
  useEffect(() => {
    if (autoFillGedaan.current) return;
    autoFillGedaan.current = true;
    void (async () => {
      try {
        const voorstel = await aiEmail.mutateAsync({ id: offerteId });
        setEmailVoorstel(voorstel);
        setEmailForm((f) => ({
          ...f,
          naar_naam: f.naar_naam || opdrachtgever || "",
          onderwerp: voorstel.onderwerp,
          tekst: [voorstel.begroeting, "", voorstel.samenvatting, "", voorstel.call_to_action, "", voorstel.afsluiting].join("\n"),
        }));
      } catch {
        // stil falen
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function wisselVerzendType(type: string) {
    if (type === verzendType) return;
    setVerzendTypeLocal(type);
    try {
      await werkOfferte.mutateAsync({ id: offerteId, data: { verzend_type: type } as never });
      await qc.invalidateQueries({ queryKey: getGetOfferteQueryKey(offerteId) });
    } catch {
      setVerzendTypeLocal(verzendType);
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  function getAntwoordForm(vraagId: number): AntwoordForm {
    return antwoordForms[vraagId] ?? { tekst: "", email: "", naam: "" };
  }

  function setAntwoordForm(vraagId: number, patch: Partial<AntwoordForm>) {
    setAntwoordForms((prev) => ({
      ...prev,
      [vraagId]: { ...getAntwoordForm(vraagId), ...patch },
    }));
  }

  async function nieuwPortaalLink() {
    try {
      await maakToken.mutateAsync({ id: offerteId });
      await qc.invalidateQueries({ queryKey: getListOffertePortaalTokensQueryKey(offerteId) });
      toast({ title: "Portaallink aangemaakt" });
    } catch {
      toast({ title: "Aanmaken mislukt", variant: "destructive" });
    }
  }

  async function kopieerLink(token: string) {
    const url = `${baseUrl}/portaal/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link gekopieerd" });
    } catch {
      toast({ title: "Kopiëren mislukt", variant: "destructive" });
    }
  }

  async function genereerAiVoorstel() {
    try {
      const voorstel = await aiEmail.mutateAsync({ id: offerteId });
      setEmailVoorstel(voorstel);
      setEmailForm((f) => ({
        ...f,
        onderwerp: voorstel.onderwerp,
        tekst: [voorstel.begroeting, "", voorstel.samenvatting, "", voorstel.call_to_action, "", voorstel.afsluiting].join("\n"),
      }));
      toast({ title: "AI-voorstel gegenereerd" });
    } catch {
      toast({ title: "Genereren mislukt", variant: "destructive" });
    }
  }

  async function verstuurEmail(metPortaalLink: boolean) {
    if (!emailForm.naar_email.trim() || !emailForm.onderwerp.trim() || !emailForm.tekst.trim()) {
      toast({ title: "E-mail, onderwerp en tekst zijn verplicht", variant: "destructive" });
      return;
    }

    let portaalLink: string | undefined;

    if (metPortaalLink) {
      const actieveTokens = (tokens ?? []).filter(
        (t: OffertePortaalToken) => new Date(t.verloopt_op) > new Date(),
      );
      let portaalToken = actieveTokens[0];
      if (!portaalToken) {
        try {
          portaalToken = await maakToken.mutateAsync({ id: offerteId });
          await qc.invalidateQueries({ queryKey: getListOffertePortaalTokensQueryKey(offerteId) });
        } catch {
          toast({ title: "Portaallink aanmaken mislukt", variant: "destructive" });
          return;
        }
      }
      portaalLink = `${baseUrl}/portaal/${portaalToken.token}`;
    }

    try {
      await verzend.mutateAsync({
        id: offerteId,
        data: {
          naar_email: emailForm.naar_email.trim(),
          naar_naam: emailForm.naar_naam.trim() || undefined,
          onderwerp: emailForm.onderwerp.trim(),
          tekst: emailForm.tekst.trim(),
          portaal_link: portaalLink,
        },
      });
      await qc.invalidateQueries({ queryKey: getListOfferteTrackingQueryKey(offerteId) });
      toast({ title: "E-mail verzonden" });
      setEmailForm({ naar_email: "", naar_naam: opdrachtgever ?? "", onderwerp: "", tekst: "" });
      setEmailVoorstel(null);
    } catch {
      toast({ title: "Verzenden mislukt", variant: "destructive" });
    }
  }

  const verwerkBestandUpload = useCallback(async (file: File) => {
    setUploadBezig(true);
    try {
      // 1. Tekst extraheren uit PDF
      const extractedText = await extracteerPdfTekst(file);

      // 2. Presigned upload-URL ophalen
      const { upload_url: uploadUrl, object_path: objectPath } =
        await uploadUrlMutatie.mutateAsync({ id: offerteId });

      // 3. Bestand uploaden naar storage
      const uploadResp = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/pdf" },
        body: file,
      });
      if (!uploadResp.ok) throw new Error("Upload mislukt");

      // 4. Contract registreren
      await registreerContract.mutateAsync({
        id: offerteId,
        data: {
          bestandsnaam: file.name,
          bestand_pad: objectPath,
          mime_type: file.type || "application/pdf",
          extracted_text: extractedText || undefined,
        },
      });

      await qc.invalidateQueries({ queryKey: getListOfferteKlantContractenQueryKey(offerteId) });
      toast({ title: "Contract geregistreerd" });
    } catch {
      toast({ title: "Uploaden mislukt", variant: "destructive" });
    } finally {
      setUploadBezig(false);
      if (bestandInputRef.current) bestandInputRef.current.value = "";
    }
  }, [offerteId, uploadUrlMutatie, registreerContract, qc, toast]);

  async function verwijderContractHandler(contractId: number) {
    try {
      await verwijderContract.mutateAsync({ id: offerteId, contractId });
      await qc.invalidateQueries({ queryKey: getListOfferteKlantContractenQueryKey(offerteId) });
      if (adviesOpen === contractId) setAdviesOpen(null);
      toast({ title: "Contract verwijderd" });
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    }
  }

  async function slaAntwoordOp(vraagId: number) {
    const form = getAntwoordForm(vraagId);
    if (!form.tekst.trim()) {
      toast({ title: "Antwoord mag niet leeg zijn", variant: "destructive" });
      return;
    }
    try {
      await beantwoord.mutateAsync({
        id: offerteId,
        vraagId,
        data: {
          antwoord: form.tekst.trim(),
          naar_email: form.email.trim() || undefined,
          naar_naam: form.naam.trim() || undefined,
        },
      });
      await qc.invalidateQueries({ queryKey: getListOfferteVragenQueryKey(offerteId) });
      await qc.invalidateQueries({ queryKey: getListOfferteTrackingQueryKey(offerteId) });
      toast({ title: form.email.trim() ? "Antwoord opgeslagen en e-mail verstuurd" : "Antwoord opgeslagen" });
      setOpenAntwoord(null);
      setAntwoordForms((prev) => {
        const next = { ...prev };
        delete next[vraagId];
        return next;
      });
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  const actieveSecties = (secties ?? []).filter((s) => s.actief);
  const verplichtRegels = (regels ?? []).filter((r) => !r.is_optioneel);
  const optioneleRegels = (regels ?? []).filter((r) => r.is_optioneel);
  const totaalBedrag = (regels ?? []).reduce((s, r) => s + (r.kosten ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Moduskeuze */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => wisselVerzendType("ondertekening")}
          className={`rounded-lg border p-4 text-left transition-colors ${
            verzendType === "ondertekening"
              ? "border-primary bg-primary/5 ring-1 ring-primary"
              : "border-muted-foreground/20 hover:border-primary/40 bg-background"
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              {verzendType === "ondertekening"
                ? <CheckCircle2 className="h-4 w-4 text-primary" />
                : <Circle className="h-4 w-4 text-muted-foreground" />}
            </div>
            <div>
              <div className="text-sm font-semibold">Ondertekenbare offerte</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Klant ontvangt portaallink en tekent digitaal. Geschikt voor VvE, gebouweigenaren en reguliere opdrachtgevers.
              </div>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => wisselVerzendType("contract_klant")}
          className={`rounded-lg border p-4 text-left transition-colors ${
            verzendType === "contract_klant"
              ? "border-primary bg-primary/5 ring-1 ring-primary"
              : "border-muted-foreground/20 hover:border-primary/40 bg-background"
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              {verzendType === "contract_klant"
                ? <CheckCircle2 className="h-4 w-4 text-primary" />
                : <Circle className="h-4 w-4 text-muted-foreground" />}
            </div>
            <div>
              <div className="text-sm font-semibold">Contract van klant</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Klant stuurt een eigen contractstuk retour. AI analyseert het contract en stelt intern advies op voor de directie.
              </div>
            </div>
          </div>
        </button>
      </div>

      {/* Inhoudsoverzicht */}
      {(secties !== undefined || regels !== undefined) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Inhoudsoverzicht — wat de klant te zien krijgt
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {actieveSecties.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  <List className="h-3.5 w-3.5" /> Secties ({actieveSecties.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {actieveSecties.map((s) => (
                    <Badge key={s.id} variant="outline" className="text-xs">{s.titel}</Badge>
                  ))}
                </div>
                {(secties ?? []).filter((s) => !s.actief).length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {(secties ?? []).filter((s) => !s.actief).length} sectie(s) verborgen en niet zichtbaar voor de klant.
                  </p>
                )}
              </div>
            )}
            {regels !== undefined && (
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  <span className="font-mono">&#8364;</span> Begrotingsregels
                </div>
                <div className="text-sm space-y-0.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Verplichte regels</span>
                    <span className="font-medium">{verplichtRegels.length}</span>
                  </div>
                  {optioneleRegels.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Optionele regels</span>
                      <span className="font-medium">{optioneleRegels.length}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1 border-t">
                    <span className="text-muted-foreground">Totaal excl. btw</span>
                    <span className="font-semibold">
                      {new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(totaalBedrag)}
                    </span>
                  </div>
                </div>
              </div>
            )}
            {bijlagenAantal !== undefined && bijlagenAantal > 0 && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Paperclip className="h-3.5 w-3.5" />
                {bijlagenAantal} bijlage(n) meegestuurd
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* PAD 1 — Portaallinks (alleen ondertekening) */}
      {verzendType === "ondertekening" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              Portaallinks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Genereer een beveiligde link waarmee de klant de offerte kan bekijken en digitaal ondertekenen. Elke link is 30 dagen geldig.
            </p>
            {tokensLaden ? (
              <Skeleton className="h-10 w-full" />
            ) : (tokens ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Nog geen portaallinks aangemaakt.</p>
            ) : (
              <div className="space-y-2">
                {(tokens ?? []).map((t: OffertePortaalToken) => {
                  const url = `${baseUrl}/portaal/${t.token}`;
                  const verlopen = new Date(t.verloopt_op) < new Date();
                  return (
                    <div key={t.id} className="flex items-center gap-2 rounded-md border bg-muted/30 p-2.5">
                      <span className="text-xs font-mono text-muted-foreground truncate flex-1">{url}</span>
                      {verlopen ? (
                        <Badge variant="outline" className="text-muted-foreground shrink-0">Verlopen</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200 shrink-0">Actief</Badge>
                      )}
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => kopieerLink(t.token)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={nieuwPortaalLink} disabled={maakToken.isPending}>
              <Plus className="h-3.5 w-3.5" />
              {maakToken.isPending ? "Bezig…" : "Nieuwe link genereren"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* E-mail verzenden (beide modi, maar met ander gedrag) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            E-mail verzenden
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-start gap-3">
            <p className="text-sm text-muted-foreground">
              {verzendType === "ondertekening"
                ? "Verstuur de offerte per e-mail. De portaallink wordt automatisch meegestuurd als er een actieve link beschikbaar is."
                : "Verstuur de offerte per e-mail aan de klant. De klant dient vervolgens een getekend contractstuk aan u te retourneren."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={genereerAiVoorstel}
              disabled={aiEmail.isPending}
              className="shrink-0"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {aiEmail.isPending ? "Genereren…" : emailVoorstel ? "Opnieuw genereren" : "AI-voorstel"}
            </Button>
          </div>

          {aiEmail.isPending && (
            <div className="rounded-md border bg-slate-50 border-slate-200 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-3 w-3 animate-pulse text-primary" />
                AI stelt e-mail op op basis van de offerte-inhoud…
              </div>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          )}

          {!aiEmail.isPending && emailVoorstel && (
            <div className="rounded-md border bg-amber-50 border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 shrink-0" />
              <span>AI-voorstel ingevuld op basis van offerte-inhoud — controleer en pas aan voor verzending</span>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>E-mailadres klant *</Label>
              {aiEmail.isPending
                ? <Skeleton className="h-9 w-full" />
                : <Input
                    type="email"
                    value={emailForm.naar_email}
                    onChange={(e) => setEmailForm((f) => ({ ...f, naar_email: e.target.value }))}
                    placeholder="klant@bedrijf.nl"
                  />
              }
            </div>
            <div className="space-y-1.5">
              <Label>Naam (optioneel)</Label>
              {aiEmail.isPending
                ? <Skeleton className="h-9 w-full" />
                : <Input
                    value={emailForm.naar_naam}
                    onChange={(e) => setEmailForm((f) => ({ ...f, naar_naam: e.target.value }))}
                    placeholder={opdrachtgever ?? ""}
                  />
              }
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Onderwerp *</Label>
              {aiEmail.isPending
                ? <Skeleton className="h-9 w-full" />
                : <Input
                    value={emailForm.onderwerp}
                    onChange={(e) => setEmailForm((f) => ({ ...f, onderwerp: e.target.value }))}
                    placeholder={`Offerte ${titel}`}
                  />
              }
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Berichttekst *</Label>
              {aiEmail.isPending
                ? <Skeleton className="h-40 w-full" />
                : <Textarea
                    value={emailForm.tekst}
                    onChange={(e) => setEmailForm((f) => ({ ...f, tekst: e.target.value }))}
                    rows={10}
                    placeholder="Geachte heer/mevrouw…"
                  />
              }
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => verstuurEmail(verzendType === "ondertekening")}
              disabled={verzend.isPending || aiEmail.isPending}
            >
              <Send className="h-3.5 w-3.5" />
              {verzend.isPending ? "Verzenden…" : "Versturen"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* PAD 2 — Contract ontvangen (alleen contract_klant) */}
      {verzendType === "contract_klant" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-primary" />
              Contract ontvangen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Zodra de klant zijn eigen contractstuk heeft gestuurd, registreert u het hier. AI analyseert het contract en stelt een intern adviesrapport op voor de directie met aandachtspunten en risico-inschatting.
            </p>

            {/* Upload knop */}
            <div>
              <input
                ref={bestandInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void verwerkBestandUpload(file);
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => bestandInputRef.current?.click()}
                disabled={uploadBezig}
              >
                <Upload className="h-3.5 w-3.5" />
                {uploadBezig ? "Uploaden en analyseren…" : "Contract uploaden (PDF)"}
              </Button>
              {uploadBezig && (
                <div className="mt-2 space-y-1.5">
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              )}
            </div>

            {/* Lijst van contracten */}
            {contractenLaden ? (
              <Skeleton className="h-16 w-full" />
            ) : (contracten ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Nog geen klantcontracten geregistreerd.</p>
            ) : (
              <div className="space-y-3">
                {(contracten ?? []).map((c: OfferteKlantContract) => (
                  <div key={c.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <span className="text-sm font-medium truncate block">{c.bestandsnaam}</span>
                          <span className="text-xs text-muted-foreground">{datumLabel(c.geupload_op)}</span>
                        </div>
                        {c.heeft_advies && (
                          <Badge className="text-xs bg-blue-100 text-blue-800 border-blue-200 shrink-0">
                            <Brain className="h-3 w-3 mr-1" />Advies
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => setAdviesOpen((open) => open === c.id ? null : c.id)}
                        >
                          {adviesOpen === c.id ? (
                            <><ChevronUp className="h-3.5 w-3.5" /> Sluiten</>
                          ) : (
                            <><Brain className="h-3.5 w-3.5" /> {c.heeft_advies ? "Advies" : "Analyseren"}</>
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => verwijderContractHandler(c.id)}
                          disabled={verwijderContract.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {adviesOpen === c.id && (
                      <AdviesPanel
                        offerteId={offerteId}
                        contract={c}
                        onAdviesGeladen={(_contractId, _advies) => {
                          void qc.invalidateQueries({ queryKey: getListOfferteKlantContractenQueryKey(offerteId) });
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Activiteit */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            Activiteit
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {trackingLaden ? (
            <Skeleton className="h-20 w-full" />
          ) : (tracking ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Nog geen activiteit vastgelegd.</p>
          ) : (
            <div className="space-y-1.5">
              {(tracking ?? []).map((t: OfferteTrackingEvent) => (
                <div key={t.id} className="flex items-center gap-3 text-sm">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground text-xs">{datumLabel(t.aangemaakt_op)}</span>
                  {eventBadge(t.event)}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Klantvragen */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Klantvragen
          </CardTitle>
        </CardHeader>
        <CardContent>
          {vragenLaden ? (
            <Skeleton className="h-16 w-full" />
          ) : (vragen ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Geen klantvragen ontvangen.</p>
          ) : (
              <div className="space-y-3">
                {(vragen ?? []).map((v: OfferteVraag) => (
                  <div
                    key={v.id}
                    className={`rounded-md border p-3 space-y-2 transition-all ${
                      !v.antwoord
                        ? "border-rose-200 bg-rose-50/30 shadow-sm ring-1 ring-rose-100"
                        : "bg-background"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {v.antwoord ? (
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0 animate-pulse" />
                        )}
                        <span className="text-xs text-muted-foreground truncate">
                          <span className="font-semibold text-foreground">{v.bezoeker_naam ?? "Klant"}</span>
                          {v.bezoeker_email ? ` (${v.bezoeker_email})` : ""} — {datumLabel(v.aangemaakt_op)}
                          {!v.antwoord && (
                            <Badge className="ml-2 h-4 px-1.5 text-[10px] bg-rose-600 hover:bg-rose-600 text-white border-none">
                              Onbeantwoord
                            </Badge>
                          )}
                        </span>
                      </div>
                    {!v.antwoord && openAntwoord !== v.id && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0"
                        onClick={() => {
                          setAntwoordForm(v.id, { email: v.bezoeker_email ?? "", naam: v.bezoeker_naam ?? "" });
                          setOpenAntwoord(v.id);
                        }}
                      >
                        <Reply className="h-3.5 w-3.5" />
                        Antwoorden
                      </Button>
                    )}
                    {v.antwoord && openAntwoord !== v.id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 shrink-0 text-muted-foreground"
                        onClick={() => {
                          setAntwoordForm(v.id, { tekst: v.antwoord ?? "", email: v.bezoeker_email ?? "", naam: v.bezoeker_naam ?? "" });
                          setOpenAntwoord(v.id);
                        }}
                      >
                        Bewerken
                      </Button>
                    )}
                  </div>

                  <p className="text-sm font-medium">{v.vraag}</p>

                  {v.antwoord && openAntwoord !== v.id && (
                    <div className="mt-2 pl-3 border-l-2 border-primary/30 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] h-4 px-1 bg-primary/5">Antwoord</Badge>
                        {v.bijgewerkt_op && (
                          <span className="text-[10px] text-muted-foreground">
                            {datumLabel(v.bijgewerkt_op)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{v.antwoord}</p>
                    </div>
                  )}

                  {openAntwoord === v.id && (
                    <div className="space-y-3 pt-1 border-t mt-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Antwoord *</Label>
                        <Textarea
                          value={getAntwoordForm(v.id).tekst}
                          onChange={(e) => setAntwoordForm(v.id, { tekst: e.target.value })}
                          rows={3}
                          placeholder="Typ hier uw antwoord…"
                          autoFocus
                        />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs">E-mail klant voor notificatie (optioneel)</Label>
                          <Input
                            type="email"
                            value={getAntwoordForm(v.id).email}
                            onChange={(e) => setAntwoordForm(v.id, { email: e.target.value })}
                            placeholder="klant@bedrijf.nl"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Naam (optioneel)</Label>
                          <Input
                            value={getAntwoordForm(v.id).naam}
                            onChange={(e) => setAntwoordForm(v.id, { naam: e.target.value })}
                            placeholder={v.bezoeker_naam ?? ""}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setOpenAntwoord(null)}>
                          Annuleren
                        </Button>
                        <Button size="sm" onClick={() => slaAntwoordOp(v.id)} disabled={beantwoord.isPending}>
                          {beantwoord.isPending ? "Opslaan…" : "Opslaan"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
