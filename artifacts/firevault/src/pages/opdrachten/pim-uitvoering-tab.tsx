// PIM Uitvoering Tab — AI-gestuurde stap-voor-stap uitvoering
import { useState } from "react";
import {
  useStartPimUitvoering,
  useGetHuidigePimUitvoeringStap,
  useVoltooiPimUitvoeringStap,
  useMeldPimUitvoeringAfwijking,
  useBeslisPimUitvoeringAfwijking,
  getGetHuidigePimUitvoeringStapQueryKey,
} from "@workspace/api-client-react";
import type { PimUitvoeringStap } from "@workspace/api-client-react";
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
} from "lucide-react";

// ── Status labels & kleuren ───────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  actief: "Actief",
  voltooid: "Voltooid",
  afgeweken: "Afwijking",
  overgeslagen: "Overgeslagen",
};

const STATUS_KLEUR: Record<string, string> = {
  open: "bg-slate-100 text-slate-700",
  actief: "bg-blue-100 text-blue-800",
  voltooid: "bg-green-100 text-green-800",
  afgeweken: "bg-amber-100 text-amber-800",
  overgeslagen: "bg-red-100 text-red-700",
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
            <p className="text-xs text-muted-foreground mt-1">Upload foto via de mobiele app of voeg de opslag-URL hieronder in.</p>
          </div>
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
  const [fotoUrls, setFotoUrls] = useState("");
  const [afwijkingModus, setAfwijkingModus] = useState(false);
  const [afwijkingOmschrijving, setAfwijkingOmschrijving] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const voltooienMutatie = useVoltooiPimUitvoeringStap({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: getGetHuidigePimUitvoeringStapQueryKey(opdrachtId) });
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
        qc.invalidateQueries({ queryKey: getGetHuidigePimUitvoeringStapQueryKey(opdrachtId) });
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
        <div className="space-y-1">
          <Label htmlFor="afwijking-foto-urls" className="flex items-center gap-1.5">
            <Camera className="h-3.5 w-3.5 text-slate-500" />
            Foto-URL&#x27;s afwijking (optioneel, per regel)
          </Label>
          <Textarea
            id="afwijking-foto-urls"
            placeholder={"uploads/afwijking-1.jpg"}
            value={fotoUrls}
            onChange={(e) => setFotoUrls(e.target.value)}
            rows={2}
            className="font-mono text-xs"
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
              const parsedUrls = fotoUrls.split("\n").map((u) => u.trim()).filter(Boolean);
              afwijkingMutatie.mutate({
                id: opdrachtId,
                stapId: stap.id,
                data: {
                  omschrijving: afwijkingOmschrijving.trim(),
                  foto_urls: parsedUrls.length > 0 ? parsedUrls : undefined,
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

      <div className="space-y-1">
        <Label htmlFor="foto-urls" className="flex items-center gap-1.5">
          <Camera className="h-3.5 w-3.5 text-slate-500" />
          Foto-URL&#x27;s (optioneel, per regel)
        </Label>
        <Textarea
          id="foto-urls"
          placeholder={"uploads/foto-1.jpg\nuploads/foto-2.jpg"}
          value={fotoUrls}
          onChange={(e) => setFotoUrls(e.target.value)}
          rows={2}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">Opslagpaden van de gemaakte foto&#x27;s, uno per regel.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!antwoord || voltooienMutatie.isPending}
          onClick={() => {
            const parsedUrls = fotoUrls.split("\n").map((u) => u.trim()).filter(Boolean);
            voltooienMutatie.mutate({
              id: opdrachtId,
              stapId: stap.id,
              data: {
                antwoord_controle: antwoord,
                opmerkingen: opmerkingen || undefined,
                foto_urls: parsedUrls.length > 0 ? parsedUrls : undefined,
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
  };

  if (uitvoeringGereed) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
        <CheckCircle2 className="h-12 w-12 text-green-500" />
        <h2 className="text-xl font-semibold">Uitvoering afgerond</h2>
        <p className="text-muted-foreground text-sm max-w-md">
          Alle uitvoeringsstappen zijn doorlopen. Ga verder met de oplevering.
        </p>
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
      <div className="flex flex-col items-center justify-center py-16 gap-5">
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
    );
  }

  if (!stap) return null;

  const instructie = parseInstructie(stap.instructie_json);
  const isAfgeweken = stap.status === "afgeweken";

  return (
    <div className="mt-4 space-y-6">
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
              Stap heeft status &quot;{stap.status}&quot; — geen actie vereist.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
