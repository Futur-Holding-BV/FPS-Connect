import { KenmerkKop } from "@/components/kenmerk-kop";
import { ProcesBalk } from "@/components/proces-balk";
import { useState } from "react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useParams, Link } from "wouter";
import {
  useGetOpname,
  useOpnameSpotsAanmaken,
  type OpnameSpotsAanmakenResultaat,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Layers,
  Lock,
  MapPin,
  Package,
  Sparkles,
} from "lucide-react";

const ACTIE_LABEL: Record<string, string> = {
  controleren: "Controleren",
  vervangen: "Vervangen",
  bijwerken: "Bijwerken",
  aanvullen: "Aanvullen",
  nieuw: "Nieuw",
  verwijderen: "Verwijderen",
};

const BEREIKBAARHEID_LABEL: Record<string, string> = {
  goed: "Goed bereikbaar",
  beperkt: "Beperkt bereikbaar",
  slecht: "Slecht bereikbaar",
  onbereikbaar: "Onbereikbaar",
};

const PRIORITEIT_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  laag: "secondary",
  normaal: "outline",
  hoog: "default",
  urgent: "destructive",
};

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  concept: { label: "Concept", variant: "secondary" },
  definitief: { label: "Definitief", variant: "default" },
};

export default function OpnameDetailPagina() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [resultaat, setResultaat] = useState<OpnameSpotsAanmakenResultaat | null>(null);
  const { heeftNiveau } = useBevoegdheid();
  // POST /opname/:id/spots-aanmaken eist voorzieningen:3.
  const kanSchrijven = heeftNiveau("voorzieningen", 3);

  const { data: opname, isLoading } = useGetOpname(Number(id));
  const spotsAanmaken = useOpnameSpotsAanmaken();

  const isDefinitief = opname?.status === "definitief";
  const heeftGebouw = Boolean(opname?.gebouw_id);
  const kanSpotsAanmaken = kanSchrijven && isDefinitief && heeftGebouw && resultaat === null;

  async function maakSpotsAan() {
    if (!opname) return;
    try {
      const res = await spotsAanmaken.mutateAsync({ id: opname.id });
      setResultaat(res);
      await queryClient.invalidateQueries({ queryKey: ["listVoorzieningen"] });
      await queryClient.invalidateQueries({ queryKey: ["listVoorzieningenOpVerdieping"] });
      toast({
        title: `${res.aangemaakt} spot${res.aangemaakt !== 1 ? "s" : ""} aangemaakt`,
        description: res.overgeslagen > 0 ? `${res.overgeslagen} overgeslagen (geen type)` : undefined,
      });
    } catch {
      toast({ title: "Fout bij aanmaken van spots", variant: "destructive" });
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!opname) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Link href="/opname">
          <Button variant="ghost" size="sm" className="gap-2 mb-4">
            <ArrowLeft className="w-4 h-4" />
            Terug naar opnames
          </Button>
        </Link>
        <p className="text-muted-foreground">Opname niet gevonden.</p>
      </div>
    );
  }

  const st = STATUS_BADGE[opname.status] ?? STATUS_BADGE.concept;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link href="/opname">
        <Button variant="ghost" size="sm" className="gap-2 mb-4">
          <ArrowLeft className="w-4 h-4" />
          Terug naar opnames
        </Button>
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <ClipboardList className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <KenmerkKop kenmerk={(opname as any).kenmerk} />
              <h1 data-paginatitel className="text-xl font-bold">{opname.naam}</h1>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
              {opname.gebouw_naam && (
                <span className="flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" />
                  {opname.gebouw_naam}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {opname.datum}
              </span>
              <span className="flex items-center gap-1">
                <Package className="w-3.5 h-3.5" />
                {opname.items.length} {opname.items.length === 1 ? "item" : "items"}
              </span>
            </div>
          </div>
        </div>
        {/* Procesbalk (herbruikbaar patroon Projectaanpak) */}
        <ProcesBalk
          stappen={[{ sleutel: "concept", label: "Concept" }, { sleutel: "definitief", label: "Definitief" }]}
          huidige={opname.status}
          className="shrink-0 mt-1"
        />
      </div>

      {opname.notities && (
        <Card className="mb-5">
          <CardContent className="p-4 text-sm text-muted-foreground">
            {opname.notities}
          </CardContent>
        </Card>
      )}

      {/* Spots aanmaken sectie */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Spots aanmaken in het gebouw
          </CardTitle>
        </CardHeader>
        <CardContent>
          {resultaat ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-700 font-medium">
                <CheckCircle2 className="w-5 h-5" />
                {resultaat.aangemaakt} concept-spot{resultaat.aangemaakt !== 1 ? "s" : ""} aangemaakt
                {resultaat.overgeslagen > 0 && (
                  <span className="text-muted-foreground font-normal ml-1">
                    ({resultaat.overgeslagen} overgeslagen)
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                De spots staan nu als concept in het gebouw. Ga naar de plattegrond om ze op de juiste plek te plaatsen.
              </p>
              {opname.gebouw_id && (
                <Link href={`/gebouwen/${opname.gebouw_id}?tab=plattegrond`}>
                  <Button variant="outline" size="sm" className="gap-2">
                    <MapPin className="w-4 h-4" />
                    Naar plattegrond
                  </Button>
                </Link>
              )}
            </div>
          ) : !isDefinitief ? (
            <div className="text-sm text-muted-foreground space-y-2">
              <p>Maak de opname eerst definitief voordat je spots kunt aanmaken.</p>
            </div>
          ) : !heeftGebouw ? (
            <p className="text-sm text-muted-foreground">
              Koppel een gebouw aan deze opname om spots aan te maken.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Alle {opname.items.length} opname-items worden omgezet naar concept-spots in{" "}
                <strong>{opname.gebouw_naam}</strong>. Spots zonder een type worden overgeslagen.
                Daarna kun je ze op de plattegrond plaatsen.
              </p>
              <Button
                onClick={maakSpotsAan}
                disabled={spotsAanmaken.isPending || !kanSpotsAanmaken}
                className="gap-2"
              >
                {spotsAanmaken.isPending ? (
                  <>Bezig met aanmaken...</>
                ) : (
                  <>
                    <Layers className="w-4 h-4" />
                    {opname.items.length} spot{opname.items.length !== 1 ? "s" : ""} aanmaken
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Items lijst */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Opname-items ({opname.items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {opname.items.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              Geen items in deze opname.
            </div>
          ) : (
            <div className="divide-y">
              {opname.items.map((item, i) => (
                <div key={item.id} className="p-4 flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm capitalize">{item.spot_type}</span>
                      {item.actie && (
                        <Badge variant="outline" className="text-xs">
                          {ACTIE_LABEL[item.actie] ?? item.actie}
                        </Badge>
                      )}
                      {item.prioriteit && item.prioriteit !== "normaal" && (
                        <Badge variant={PRIORITEIT_VARIANT[item.prioriteit] ?? "outline"} className="text-xs">
                          {item.prioriteit}
                        </Badge>
                      )}
                      {item.afgerond && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Afgerond
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      {item.verdieping_naam && (
                        <span className="flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          {item.verdieping_naam}
                        </span>
                      )}
                      {item.ruimte && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {item.ruimte}
                        </span>
                      )}
                      {item.bereikbaarheid && item.bereikbaarheid !== "goed" && (
                        <span>{BEREIKBAARHEID_LABEL[item.bereikbaarheid] ?? item.bereikbaarheid}</span>
                      )}
                      {item.aantal > 1 && <span>{item.aantal}x</span>}
                      {item.afmetingen && <span>{item.afmetingen}</span>}
                    </div>
                    {(item.beschrijving || item.notities) && (
                      <p className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                        {item.beschrijving || item.notities}
                      </p>
                    )}
                    {item.fotos.length > 0 && (
                      <div className="flex gap-1.5 flex-wrap mt-1">
                        {item.fotos.map((f) => (
                          f.url ? (
                            <img
                              key={f.id}
                              src={f.url}
                              alt={f.bijschrift ?? "foto"}
                              className="w-14 h-14 object-cover rounded border"
                            />
                          ) : null
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
