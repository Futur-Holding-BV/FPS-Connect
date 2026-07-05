// PIM Uitvoering Tab — AI-gestuurde stap-voor-stap uitvoering
import { useRef, useState } from "react";
import {
  useStartPimUitvoering,
  useGetHuidigePimUitvoeringStap,
  useVoltooiPimUitvoeringStap,
  useMeldPimUitvoeringAfwijking,
  useBeslisPimUitvoeringAfwijking,
  useListPimUitvoeringStappen,
  useListPimSpots,
  useKoppelPimStapVoorzieningen,
  useRequestUploadUrl,
  getGetHuidigePimUitvoeringStapQueryKey,
  getListPimUitvoeringStappenQueryKey,
} from "@workspace/api-client-react";
import type { PimUitvoeringStap, VoorzieningPimDetail } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  PlayCircle,
  CheckCircle2,
  AlertTriangle,
  Camera,
  ChevronRight,
  ShieldCheck,
  Wrench,
  PackageOpen,
  ClipboardCheck,
  SkipForward,
  ArrowRight,
  Clock,
  X,
  MapPin,
  Link2,
  Link2Off,
  ChevronDown,
  ChevronUp,
  XCircle,
} from "lucide-react";

// ── Status labels & kleuren ───────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  actief: "Actief",
  voltooid: "Voltooid",
  afgeweken: "Afwijking",
  overgeslagen: "Overgeslagen",
  wacht_op_beslissing: "Wacht op beslissing",
};

const STATUS_KLEUR: Record<string, string> = {
  open: "bg-slate-100 text-slate-700",
  actief: "bg-blue-100 text-blue-800",
  voltooid: "bg-green-100 text-green-800",
  afgeweken: "bg-amber-100 text-amber-800",
  overgeslagen: "bg-red-100 text-red-700",
  wacht_op_beslissing: "bg-orange-100 text-orange-800",
};

function statusBadge(status: string) {
  return (
    <Badge className={`${STATUS_KLEUR[status] ?? "bg-slate-100 text-slate-700"} font-medium text-xs`}>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

// ── Instructie weergave ───────────────────────────────────────────────────────

interface Instructie {
  doel?: string;
  handeling?: string;
  benodigde_artikelen?: string[];
  benodigde_gereedschappen?: string[];
  veiligheidscontrole?: string;
  productinstructie?: string | null;
  foto_opdracht?: string;
  controlevraag?: string;
  werkpakket?: string | null;
  is_laatste_stap?: boolean;
}

function parseInstructie(json: unknown): Instructie | null {
  if (!json || typeof json !== "object") return null;
  return json as Instructie;
}

function InstructieWeergave({ instructie, volgorde }: { instructie: Instructie; volgorde: number }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">
          {volgorde}
        </div>
        <div>
          <p className="font-semibold text-base">{instructie.doel ?? "Stap"}</p>
          {instructie.werkpakket && (
            <p className="text-xs text-muted-foreground">Werkpakket: {instructie.werkpakket}</p>
          )}
        </div>
      </div>

      {instructie.handeling && (
        <div className="bg-slate-50 rounded-md p-4 border">
          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Handeling</p>
          <p className="text-sm whitespace-pre-line">{instructie.handeling}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {instructie.benodigde_artikelen && instructie.benodigde_artikelen.length > 0 && (
          <div className="border rounded-md p-3">
            <div className="flex items-center gap-2 mb-2">
              <PackageOpen className="h-4 w-4 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wide">Benodigde artikelen</p>
            </div>
            <ul className="space-y-1">
              {instructie.benodigde_artikelen.map((a, i) => (
                <li key={i} className="text-sm flex items-start gap-1.5">
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  {a}
                </li>
              ))}
            </ul>
          </div>
        )}

        {instructie.benodigde_gereedschappen && instructie.benodigde_gereedschappen.length > 0 && (
          <div className="border rounded-md p-3">
            <div className="flex items-center gap-2 mb-2">
              <Wrench className="h-4 w-4 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wide">Gereedschap</p>
            </div>
            <ul className="space-y-1">
              {instructie.benodigde_gereedschappen.map((g, i) => (
                <li key={i} className="text-sm flex items-start gap-1.5">
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  {g}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {instructie.veiligheidscontrole && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-md p-3">
          <ShieldCheck className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">Veiligheidscontrole</p>
            <p className="text-sm text-amber-900">{instructie.veiligheidscontrole}</p>
          </div>
        </div>
      )}

      {instructie.productinstructie && (
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-md p-3">
          <ClipboardCheck className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-0.5">Productinstructie</p>
            <p className="text-sm text-blue-900">{instructie.productinstructie}</p>
          </div>
        </div>
      )}

      {instructie.foto_opdracht && (
        <div className="flex items-start gap-3 bg-slate-50 border rounded-md p-3">
          <Camera className="h-4 w-4 text-slate-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-0.5">Foto-opdracht</p>
            <p className="text-sm">{instructie.foto_opdracht}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Foto upload component ─────────────────────────────────────────────────────

interface FotoUploadKnopProps {
  fotoUrls: string[];
  onToevoegen: (url: string) => void;
  onVerwijderen: (index: number) => void;
}

function FotoUploadKnop({ fotoUrls, onToevoegen, onVerwijderen }: FotoUploadKnopProps) {
  const [uploading, setUploading] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const uploadUrlMutatie = useRequestUploadUrl();

  async function handleSelectie(e: React.ChangeEvent<HTMLInputElement>) {
    const bestand = e.target.files?.[0];
    if (!bestand) return;
    setFout(null);
    setUploading(true);
    try {
      const data = await uploadUrlMutatie.mutateAsync({
        data: {
          name: bestand.name,
          size: bestand.size,
          contentType: bestand.type || "image/jpeg",
          bestand_type: "foto",
        },
      });
      const uploadResp = await fetch(data.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": bestand.type || "image/jpeg" },
        body: bestand,
      });
      if (!uploadResp.ok) throw new Error("Upload mislukt");
      onToevoegen(data.objectPath);
    } catch (err) {
      const bericht = err instanceof Error ? err.message : "Upload mislukt";
      setFout(bericht);
      toast({ title: "Upload mislukt", description: bericht, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={handleSelectie}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <Camera className="h-3.5 w-3.5 mr-1.5" />
          {uploading ? "Uploaden..." : "Foto toevoegen"}
        </Button>
        {fotoUrls.length > 0 && (
          <span className="text-xs text-muted-foreground">{fotoUrls.length} foto{fotoUrls.length !== 1 ? "'s" : ""} geselecteerd</span>
        )}
      </div>
      {fout && <p className="text-xs text-destructive">{fout}</p>}
      {fotoUrls.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {fotoUrls.map((url, i) => (
            <div key={i} className="flex items-center gap-1 bg-slate-100 rounded px-2 py-0.5 text-xs font-mono">
              <Camera className="h-3 w-3 text-slate-500 shrink-0" />
              <span className="max-w-[140px] truncate text-slate-700">{url.split("/").pop() ?? url}</span>
              <button
                type="button"
                onClick={() => onVerwijderen(i)}
                className="ml-0.5 text-slate-400 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Stappen overzicht ─────────────────────────────────────────────────────────

interface StappenOverzichtProps {
  opdrachtId: number;
  actieveStapId?: number;
}

function StappenOverzicht({ opdrachtId, actieveStapId }: StappenOverzichtProps) {
  const stappenQuery = useListPimUitvoeringStappen(opdrachtId);
  const stappen = (stappenQuery.data as PimUitvoeringStap[] | undefined) ?? [];

  if (stappenQuery.isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }
  if (stappen.length === 0) return null;

  const aantalVoltooid = stappen.filter((s) => s.status === "voltooid").length;

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Voortgang uitvoering</CardTitle>
          <span className="text-xs text-muted-foreground">
            {aantalVoltooid} van {stappen.length} stappen voltooid
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {stappen.map((stap) => {
          const instructie = parseInstructie(stap.instructie_json);
          const isActief = stap.id === actieveStapId;
          const afwijking = stap.afwijking_json as Record<string, unknown> | null;
          const wachtOpBeslissing =
            stap.status === "afgeweken" && afwijking != null && !afwijking.beslissing;
          const weergaveStatus = wachtOpBeslissing ? "wacht_op_beslissing" : stap.status;
          const fotoAantal = (stap.foto_urls as string[] | null)?.length ?? 0;

          return (
            <div
              key={stap.id}
              className={`flex items-start gap-3 rounded-md px-2.5 py-2 transition-colors ${
                isActief ? "bg-blue-50 border border-blue-200" : "border border-transparent"
              }`}
            >
              <div
                className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${
                  stap.status === "voltooid"
                    ? "bg-green-500 text-white"
                    : stap.status === "actief"
                    ? "bg-blue-500 text-white"
                    : stap.status === "afgeweken"
                    ? "bg-amber-500 text-white"
                    : stap.status === "overgeslagen"
                    ? "bg-red-400 text-white"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                {stap.volgorde}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">
                    {instructie?.doel ?? `Stap ${stap.volgorde}`}
                  </span>
                  {statusBadge(weergaveStatus)}
                  {(() => {
                    const aiAnalyse = stap.ai_analyse_json as Record<string, unknown> | null;
                    if (!aiAnalyse?.oordeel) return null;
                    const oordeel = aiAnalyse.oordeel as string;
                    if (oordeel === "akkoord") return (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700">
                        <CheckCircle2 className="h-3 w-3" />AI akkoord
                      </span>
                    );
                    if (oordeel === "twijfel") return (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-700 font-medium">
                        <AlertTriangle className="h-3 w-3" />Aandachtspunt
                      </span>
                    );
                    return (
                      <span className="inline-flex items-center gap-1 text-xs text-red-700 font-medium">
                        <XCircle className="h-3 w-3" />Niet akkoord
                      </span>
                    );
                  })()}
                  {fotoAantal > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-xs text-slate-500">
                      <Camera className="h-3 w-3" />
                      {fotoAantal}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                    <Clock className="h-3 w-3" />
                    {new Date(stap.aangemaakt_op as string).toLocaleDateString("nl-NL")}
                  </span>
                  {stap.voltooid_op && (
                    <span className="text-xs text-green-700">
                      Voltooid {new Date(stap.voltooid_op as string).toLocaleDateString("nl-NL")}
                    </span>
                  )}
                  {wachtOpBeslissing && (
                    <span className="text-xs text-orange-700 font-medium flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Beslissing vereist
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ── AI analyse panel (projectleider view) ────────────────────────────────────

interface PimAiAnalysePanelProps {
  analyse: Record<string, unknown>;
}

function PimAiAnalysePanel({ analyse }: PimAiAnalysePanelProps) {
  const oordeel = typeof analyse.oordeel === "string" ? analyse.oordeel : null;
  const isAkkoord = oordeel === "akkoord";
  const isTwijfel = oordeel === "twijfel";
  const risicos = Array.isArray(analyse.waargenomen_risicos) ? analyse.waargenomen_risicos as string[] : [];
  const ontbrekend = Array.isArray(analyse.ontbrekende_bewijsstukken) ? analyse.ontbrekende_bewijsstukken as string[] : [];
  const confidence = typeof analyse.confidence === "number" ? analyse.confidence as number : null;

  return (
    <div className={`rounded-md border p-3 space-y-2 text-sm ${
      isAkkoord ? "border-green-200 bg-green-50" : isTwijfel ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"
    }`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${
          isAkkoord ? "bg-green-100 text-green-800" : isTwijfel ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"
        }`}>
          {isAkkoord
            ? <CheckCircle2 className="h-3.5 w-3.5" />
            : isTwijfel
            ? <AlertTriangle className="h-3.5 w-3.5" />
            : <XCircle className="h-3.5 w-3.5" />}
          {isAkkoord ? "AI akkoord" : isTwijfel ? "AI aandachtspunt" : "AI niet akkoord"}
        </span>
        {confidence !== null && (
          <span className="text-xs text-muted-foreground">{Math.round(confidence * 100)}% zekerheid</span>
        )}
        {typeof analyse.vision_gebruikt === "boolean" && (
          <span className="text-xs text-muted-foreground">{analyse.vision_gebruikt ? "Foto's geanalyseerd" : "Tekstanalyse"}</span>
        )}
      </div>

      {typeof analyse.samenvatting === "string" && (
        <p className={`text-sm ${isAkkoord ? "text-green-900" : isTwijfel ? "text-amber-900" : "text-red-900"}`}>
          {analyse.samenvatting}
        </p>
      )}

      {typeof analyse.bevindingen === "string" && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Technische bevindingen</p>
          <p className="text-xs text-muted-foreground">{analyse.bevindingen}</p>
        </div>
      )}

      {risicos.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Waargenomen risico&#x27;s</p>
          <ul className="space-y-0.5">
            {risicos.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-amber-900">
                <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {ontbrekend.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-sky-700 uppercase tracking-wide mb-1">Ontbrekende bewijsstukken</p>
          <ul className="space-y-0.5">
            {ontbrekend.map((b, i) => (
              <li key={i} className="text-xs text-sky-900 flex items-start gap-1.5">
                <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-sky-500" />
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}

      {typeof analyse.herstelactie_voorstel === "string" && (
        <div className="bg-orange-50 border border-orange-200 rounded px-2.5 py-2">
          <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-0.5">Aanbevolen herstelactie</p>
          <p className="text-xs text-orange-900">{analyse.herstelactie_voorstel}</p>
        </div>
      )}
    </div>
  );
}

// ── Voltooien formulier ───────────────────────────────────────────────────────

interface VoltooienFormProps {
  stap: PimUitvoeringStap;
  opdrachtId: number;
  onGereed: (volgendeStap: PimUitvoeringStap | null, uitvoeringGereed: boolean) => void;
}

function VoltooienForm({ stap, opdrachtId, onGereed }: VoltooienFormProps) {
  const [antwoord, setAntwoord] = useState(false);
  const [opmerkingen, setOpmerkingen] = useState("");
  const [fotoUrls, setFotoUrls] = useState<string[]>([]);
  const [afwijkingModus, setAfwijkingModus] = useState(false);
  const [afwijkingOmschrijving, setAfwijkingOmschrijving] = useState("");
  const [afwijkingFotoUrls, setAfwijkingFotoUrls] = useState<string[]>([]);
  const { toast } = useToast();
  const qc = useQueryClient();

  function invaliderenAlles() {
    qc.invalidateQueries({ queryKey: getGetHuidigePimUitvoeringStapQueryKey(opdrachtId) });
    qc.invalidateQueries({ queryKey: getListPimUitvoeringStappenQueryKey(opdrachtId) });
  }

  const voltooienMutatie = useVoltooiPimUitvoeringStap({
    mutation: {
      onSuccess: (data) => {
        invaliderenAlles();
        if (data.uitvoering_gereed) {
          toast({ title: "Uitvoering gereed", description: "Alle stappen zijn doorlopen." });
        } else {
          toast({ title: "Stap voltooid", description: "De volgende stap is klaargezet." });
        }
        onGereed(
          (data.volgende_stap as PimUitvoeringStap | null) ?? null,
          data.uitvoering_gereed ?? false,
        );
      },
      onError: () => {
        toast({ title: "Fout", description: "Voltooien mislukt.", variant: "destructive" });
      },
    },
  });

  const afwijkingMutatie = useMeldPimUitvoeringAfwijking({
    mutation: {
      onSuccess: (data) => {
        invaliderenAlles();
        toast({ title: "Afwijking gemeld", description: "De projectleider kan nu een beslissing nemen." });
        onGereed(data as PimUitvoeringStap, false);
      },
      onError: () => {
        toast({ title: "Fout", description: "Afwijking melden mislukt.", variant: "destructive" });
      },
    },
  });

  const instructie = parseInstructie(stap.instructie_json);

  if (afwijkingModus) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-amber-700">
          <AlertTriangle className="h-4 w-4" />
          <p className="font-semibold text-sm">Afwijking melden</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="afwijking-omschrijving">Omschrijving afwijking</Label>
          <Textarea
            id="afwijking-omschrijving"
            placeholder="Beschrijf wat er afwijkt van de instructie..."
            value={afwijkingOmschrijving}
            onChange={(e) => setAfwijkingOmschrijving(e.target.value)}
            rows={4}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <Camera className="h-3.5 w-3.5 text-slate-500" />
            Foto&#x27;s afwijking (optioneel)
          </Label>
          <FotoUploadKnop
            fotoUrls={afwijkingFotoUrls}
            onToevoegen={(url) => setAfwijkingFotoUrls((prev) => [...prev, url])}
            onVerwijderen={(i) => setAfwijkingFotoUrls((prev) => prev.filter((_, idx) => idx !== i))}
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setAfwijkingModus(false)}
          >
            Annuleren
          </Button>
          <Button
            className="bg-amber-600 hover:bg-amber-700"
            disabled={!afwijkingOmschrijving.trim() || afwijkingMutatie.isPending}
            onClick={() => {
              afwijkingMutatie.mutate({
                id: opdrachtId,
                stapId: stap.id,
                data: {
                  omschrijving: afwijkingOmschrijving.trim(),
                  foto_urls: afwijkingFotoUrls.length > 0 ? afwijkingFotoUrls : undefined,
                },
              });
            }}
          >
            {afwijkingMutatie.isPending ? "Bezig..." : "Afwijking melden"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {instructie?.controlevraag && (
        <div className="flex items-start gap-3 border rounded-md p-4 bg-slate-50">
          <Checkbox
            id="controlevraag"
            checked={antwoord}
            onCheckedChange={(v) => setAntwoord(Boolean(v))}
          />
          <Label htmlFor="controlevraag" className="text-sm font-medium leading-relaxed cursor-pointer">
            {instructie.controlevraag}
          </Label>
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="opmerkingen">Opmerkingen (optioneel)</Label>
        <Textarea
          id="opmerkingen"
          placeholder="Aanvullende opmerkingen..."
          value={opmerkingen}
          onChange={(e) => setOpmerkingen(e.target.value)}
          rows={2}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          <Camera className="h-3.5 w-3.5 text-slate-500" />
          Foto&#x27;s (optioneel)
        </Label>
        <FotoUploadKnop
          fotoUrls={fotoUrls}
          onToevoegen={(url) => setFotoUrls((prev) => [...prev, url])}
          onVerwijderen={(i) => setFotoUrls((prev) => prev.filter((_, idx) => idx !== i))}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!antwoord || voltooienMutatie.isPending}
          onClick={() => {
            voltooienMutatie.mutate({
              id: opdrachtId,
              stapId: stap.id,
              data: {
                antwoord_controle: antwoord,
                opmerkingen: opmerkingen || undefined,
                foto_urls: fotoUrls.length > 0 ? fotoUrls : undefined,
              },
            });
          }}
        >
          <CheckCircle2 className="h-4 w-4 mr-2" />
          {voltooienMutatie.isPending ? "Bezig..." : "Stap voltooien"}
        </Button>

        <Button
          variant="outline"
          className="border-amber-300 text-amber-700 hover:bg-amber-50"
          onClick={() => setAfwijkingModus(true)}
        >
          <AlertTriangle className="h-4 w-4 mr-2" />
          Afwijking melden
        </Button>
      </div>
    </div>
  );
}

// ── Afwijking beslissing formulier ────────────────────────────────────────────

interface AfwijkingBeslisFormProps {
  stap: PimUitvoeringStap;
  opdrachtId: number;
  onGereed: (volgendeStap: PimUitvoeringStap | null, uitvoeringGereed: boolean) => void;
}

function AfwijkingBeslisForm({ stap, opdrachtId, onGereed }: AfwijkingBeslisFormProps) {
  const [toelichting, setToelichting] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const beslisMutatie = useBeslisPimUitvoeringAfwijking({
    mutation: {
      onSuccess: (data, vars) => {
        qc.invalidateQueries({ queryKey: getGetHuidigePimUitvoeringStapQueryKey(opdrachtId) });
        qc.invalidateQueries({ queryKey: getListPimUitvoeringStappenQueryKey(opdrachtId) });
        const beslissing = vars.data.beslissing;
        if (beslissing === "stoppen") {
          toast({ title: "Uitvoering gestopt", description: "De uitvoering is gestopt door de projectleider." });
          onGereed(null, true);
        } else {
          toast({ title: "Doorgaan", description: "De stap is hervat." });
          onGereed(
            (data.volgende_stap as PimUitvoeringStap | null) ?? null,
            data.uitvoering_gereed ?? false,
          );
        }
      },
      onError: () => {
        toast({ title: "Fout", description: "Beslissing opslaan mislukt.", variant: "destructive" });
      },
    },
  });

  const afwijking = stap.afwijking_json as Record<string, unknown> | null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-amber-700">
        <AlertTriangle className="h-5 w-5" />
        <p className="font-semibold">Afwijking geregistreerd — beslissing vereist</p>
      </div>

      {afwijking && (
        <div className="space-y-3 bg-amber-50 border border-amber-200 rounded-md p-4">
          {!!afwijking.afwijking_omschrijving && (
            <div>
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Afwijking</p>
              <p className="text-sm">{String(afwijking.afwijking_omschrijving)}</p>
            </div>
          )}
          {!!afwijking.impact && (
            <div>
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Impact</p>
              <p className="text-sm">{String(afwijking.impact)}</p>
            </div>
          )}
          {Array.isArray(afwijking.vervolgopties) && afwijking.vervolgopties.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Vervolgopties (AI)</p>
              <ul className="space-y-1">
                {(afwijking.vervolgopties as string[]).map((o, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <ArrowRight className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                    {o}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!!afwijking.stop_vereist && (
            <div className="flex items-center gap-2 text-red-700 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4" />
              AI adviseert: stoppen vereist
            </div>
          )}
        </div>
      )}

      {(() => {
        const aiAnalyse = stap.ai_analyse_json as Record<string, unknown> | null;
        if (!aiAnalyse?.oordeel) return null;
        return (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">AI-kwaliteitsanalyse</p>
            <PimAiAnalysePanel analyse={aiAnalyse} />
          </div>
        );
      })()}

      <div className="space-y-1">
        <Label htmlFor="toelichting-beslissing">Toelichting beslissing (optioneel)</Label>
        <Textarea
          id="toelichting-beslissing"
          placeholder="Toelichting bij uw beslissing..."
          value={toelichting}
          onChange={(e) => setToelichting(e.target.value)}
          rows={2}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() =>
            beslisMutatie.mutate({
              id: opdrachtId,
              stapId: stap.id,
              data: { beslissing: "doorgaan", toelichting: toelichting || undefined },
            })
          }
          disabled={beslisMutatie.isPending}
        >
          <ArrowRight className="h-4 w-4 mr-2" />
          {beslisMutatie.isPending ? "Bezig..." : "Doorgaan"}
        </Button>

        <Button
          variant="destructive"
          onClick={() =>
            beslisMutatie.mutate({
              id: opdrachtId,
              stapId: stap.id,
              data: { beslissing: "stoppen", toelichting: toelichting || undefined },
            })
          }
          disabled={beslisMutatie.isPending}
        >
          <SkipForward className="h-4 w-4 mr-2" />
          Uitvoering stoppen
        </Button>
      </div>
    </div>
  );
}

// ── Hoofdcomponent ────────────────────────────────────────────────────────────

interface PimUitvoeringTabProps {
  opdrachtId: number;
}

export default function PimUitvoeringTab({ opdrachtId }: PimUitvoeringTabProps) {
  const [uitvoeringGereed, setUitvoeringGereed] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const huidigStapQuery = useGetHuidigePimUitvoeringStap(opdrachtId);

  const startMutatie = useStartPimUitvoering({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetHuidigePimUitvoeringStapQueryKey(opdrachtId) });
        qc.invalidateQueries({ queryKey: getListPimUitvoeringStappenQueryKey(opdrachtId) });
        toast({ title: "Uitvoering gestart", description: "Stap 1 is klaargezet door de AI." });
      },
      onError: (err: unknown) => {
        const msg = (err as { status?: number })?.status === 409
          ? "Uitvoering is al gestart."
          : "Starten mislukt.";
        toast({ title: "Fout", description: msg, variant: "destructive" });
      },
    },
  });

  const stap = huidigStapQuery.data as PimUitvoeringStap | undefined;
  const isLaden = huidigStapQuery.isLoading;
  const geenActieveStap = huidigStapQuery.error !== null && !huidigStapQuery.data;

  const handleStapGereed = (volgendeStap: PimUitvoeringStap | null, gereed: boolean) => {
    if (gereed && !volgendeStap) {
      setUitvoeringGereed(true);
    }
    qc.invalidateQueries({ queryKey: getGetHuidigePimUitvoeringStapQueryKey(opdrachtId) });
    qc.invalidateQueries({ queryKey: getListPimUitvoeringStappenQueryKey(opdrachtId) });
  };

  if (uitvoeringGereed) {
    return (
      <div className="mt-4 space-y-6">
        <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <h2 className="text-xl font-semibold">Uitvoering afgerond</h2>
          <p className="text-muted-foreground text-sm max-w-md">
            Alle uitvoeringsstappen zijn doorlopen. Ga verder met de oplevering.
          </p>
        </div>
        <StappenOverzicht opdrachtId={opdrachtId} />
      </div>
    );
  }

  if (isLaden) {
    return (
      <div className="space-y-3 mt-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!stap && geenActieveStap) {
    return (
      <div className="mt-4 space-y-6">
        <div className="flex flex-col items-center justify-center py-12 gap-5">
          <PlayCircle className="h-12 w-12 text-muted-foreground" />
          <div className="text-center">
            <h2 className="text-lg font-semibold mb-1">Uitvoering nog niet gestart</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              Start de adaptieve uitvoering. De AI genereert de eerste uitvoeringsstap op basis van de werkvoorbereiding en het inkoopplan.
            </p>
          </div>
          <Button
            onClick={() => startMutatie.mutate({ id: opdrachtId })}
            disabled={startMutatie.isPending}
            size="lg"
          >
            <PlayCircle className="h-5 w-5 mr-2" />
            {startMutatie.isPending ? "Stap 1 genereren..." : "Uitvoering starten"}
          </Button>
        </div>
      </div>
    );
  }

  if (!stap) return null;

  const instructie = parseInstructie(stap.instructie_json);
  const isAfgeweken = stap.status === "afgeweken";

  return (
    <div className="mt-4 space-y-6">
      {/* Stappenoverzicht — projectleiderperspectief */}
      <StappenOverzicht opdrachtId={opdrachtId} actieveStapId={stap.id} />

      <Separator />

      {/* Stap header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm font-semibold text-muted-foreground">Stap {stap.volgorde}</p>
          {statusBadge(stap.status)}
        </div>
      </div>

      {/* Instructie kaart */}
      {instructie && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-base">Uitvoeringsinstructie</CardTitle>
          </CardHeader>
          <CardContent>
            <InstructieWeergave instructie={instructie} volgorde={stap.volgorde} />
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Actieformulier */}
      <Card className={isAfgeweken ? "border-amber-300" : ""}>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-base">
            {isAfgeweken ? "Afwijking — beslissing vereist" : "Stap afronden"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isAfgeweken ? (
            <AfwijkingBeslisForm
              stap={stap}
              opdrachtId={opdrachtId}
              onGereed={handleStapGereed}
            />
          ) : stap.status === "actief" ? (
            <VoltooienForm
              stap={stap}
              opdrachtId={opdrachtId}
              onGereed={handleStapGereed}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Stap is {STATUS_LABEL[stap.status] ?? stap.status.toLowerCase()} en kan niet meer worden aangepast.
            </p>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Voorbereide spots — koppeling aan uitvoeringsstappen */}
      <PimSpotsLijst opdrachtId={opdrachtId} actieveStap={stap} />
    </div>
  );
}

// ── Spot status helpers (kantoor) ─────────────────────────────────────────────
const SPOT_STATUS_LABEL_WEB: Record<string, string> = {
  concept: "Concept",
  voorbereid: "Voorbereid",
  in_uitvoering: "In uitvoering",
  opgeleverd: "Opgeleverd",
  goedgekeurd: "Goedgekeurd",
  afgekeurd: "Afgekeurd",
  in_onderhoud: "In onderhoud",
  vervallen: "Vervallen",
  opdracht: "Opdracht",
  werkbegroting: "Werkbegroting",
  inkoop: "Inkoop",
};

const SPOT_STATUS_KLEUR_WEB: Record<string, string> = {
  concept: "bg-slate-100 text-slate-600",
  voorbereid: "bg-blue-100 text-blue-800",
  in_uitvoering: "bg-amber-100 text-amber-800",
  opgeleverd: "bg-green-100 text-green-800",
  goedgekeurd: "bg-green-200 text-green-900",
  afgekeurd: "bg-red-100 text-red-700",
  in_onderhoud: "bg-purple-100 text-purple-800",
  vervallen: "bg-slate-100 text-slate-500",
  opdracht: "bg-sky-100 text-sky-800",
  werkbegroting: "bg-indigo-100 text-indigo-800",
  inkoop: "bg-teal-100 text-teal-800",
};

function spotBadge(status: string) {
  return (
    <Badge className={`${SPOT_STATUS_KLEUR_WEB[status] ?? "bg-slate-100 text-slate-600"} font-medium text-xs`}>
      {SPOT_STATUS_LABEL_WEB[status] ?? status}
    </Badge>
  );
}

// ── PimSpotsLijst component ───────────────────────────────────────────────────
function PimSpotsLijst({
  opdrachtId,
  actieveStap,
}: {
  opdrachtId: number;
  actieveStap: PimUitvoeringStap | null;
}) {
  const [uitgevouwen, setUitgevouwen] = useState(true);
  const queryClient = useQueryClient();
  const koppelMutatie = useKoppelPimStapVoorzieningen();

  const { data: spots = [], isLoading } = useListPimSpots(opdrachtId, {
    query: { queryKey: ["pim-spots", opdrachtId], enabled: opdrachtId > 0 },
  });

  const actieveVoorzieningIds: number[] = Array.isArray(actieveStap?.voorziening_ids)
    ? (actieveStap!.voorziening_ids as number[])
    : [];
  const kanKoppelen =
    actieveStap !== null &&
    (actieveStap.status === "actief" || actieveStap.status === "afgeweken");

  async function handleToggle(spot: VoorzieningPimDetail) {
    if (!actieveStap || !kanKoppelen) return;
    const isGekoppeld = actieveVoorzieningIds.includes(spot.id);
    const nieuweIds = isGekoppeld
      ? actieveVoorzieningIds.filter((id) => id !== spot.id)
      : [...actieveVoorzieningIds, spot.id];
    await koppelMutatie.mutateAsync({
      id: opdrachtId,
      stapId: actieveStap.id,
      data: { voorziening_ids: nieuweIds },
    });
    void queryClient.invalidateQueries({
      queryKey: getGetHuidigePimUitvoeringStapQueryKey(opdrachtId),
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <button
          type="button"
          className="flex items-center justify-between w-full text-left"
          onClick={() => setUitgevouwen((v) => !v)}
        >
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Voorbereide spots</CardTitle>
            {spots.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {spots.length} spot{spots.length !== 1 ? "s" : ""}
                {actieveVoorzieningIds.length > 0
                  ? ` · ${actieveVoorzieningIds.length} gekoppeld aan stap ${actieveStap?.volgorde}`
                  : ""}
              </span>
            )}
          </div>
          {uitgevouwen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </CardHeader>

      {uitgevouwen && (
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-3/4" />
            </div>
          ) : spots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
              <MapPin className="h-8 w-8" />
              <p className="text-sm">Geen spots voor dit gebouw.</p>
            </div>
          ) : (
            <div className="divide-y">
              {spots.map((spot) => {
                const isGekoppeld = actieveVoorzieningIds.includes(spot.id);
                return (
                  <div
                    key={spot.id}
                    className={`flex items-center gap-3 py-2.5 ${isGekoppeld ? "bg-primary/5 -mx-6 px-6 rounded" : ""}`}
                  >
                    {/* Objectnummer */}
                    <span className="font-mono text-sm font-semibold w-24 shrink-0 text-foreground">
                      {spot.objectnummer}
                    </span>

                    {/* Type + locatie */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {spot.type_naam ?? spot.type}
                      </p>
                      {(spot.verdieping_naam ?? spot.ruimte) && (
                        <p className="text-xs text-muted-foreground truncate">
                          {[spot.verdieping_naam, spot.ruimte].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>

                    {/* Status badge */}
                    <div className="shrink-0">{spotBadge(spot.status)}</div>

                    {/* Gekoppelde stap (niet-actieve stap) */}
                    {spot.gekoppelde_stap_id && !isGekoppeld && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        Stap {spot.gekoppelde_stap_id}
                      </span>
                    )}

                    {/* Koppelen / ontkoppelen knop */}
                    {kanKoppelen && (
                      <button
                        type="button"
                        title={isGekoppeld ? "Ontkoppelen van actieve stap" : "Koppelen aan actieve stap"}
                        disabled={koppelMutatie.isPending}
                        onClick={() => void handleToggle(spot)}
                        className={`shrink-0 p-1.5 rounded transition-colors ${
                          isGekoppeld
                            ? "text-destructive hover:bg-destructive/10"
                            : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                        }`}
                      >
                        {isGekoppeld ? (
                          <Link2Off className="h-4 w-4" />
                        ) : (
                          <Link2 className="h-4 w-4" />
                        )}
                      </button>
                    )}
                    {!kanKoppelen && isGekoppeld && (
                      <Link2 className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
