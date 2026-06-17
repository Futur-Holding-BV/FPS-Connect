import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetVoorziening,
  getGetVoorzieningQueryKey,
  useGetSpotAiVoorstel,
  getGetSpotAiVoorstelQueryKey,
  useBevestigSpotAiControle,
} from "@workspace/api-client-react";
import type { Label } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label as FormLabel } from "@/components/ui/label";
import { ArrowLeft, Building, Calendar, User, Package, MapPin, QrCode, CheckCircle, AlertCircle, Clock, Pencil, Tag, Sparkles } from "lucide-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { VoorzieningStatusDialog } from "./voorziening-status-dialog";
import { VoorzieningBewerkenDialog } from "./voorziening-bewerken-dialog";

const statusKleur: Record<string, string> = {
  concept: "bg-gray-100 text-gray-700 border-gray-200",
  voorbereid: "bg-slate-100 text-slate-700 border-slate-300 border-dashed",
  in_uitvoering: "bg-blue-100 text-blue-800 border-blue-200",
  wacht_op_akkoord: "bg-amber-100 text-amber-800 border-amber-200",
  meerwerk_financieel: "bg-violet-100 text-violet-800 border-violet-200",
  opgeleverd: "bg-teal-100 text-teal-800 border-teal-200",
  goedgekeurd: "bg-green-100 text-green-800 border-green-200",
  afgekeurd: "bg-red-100 text-red-800 border-red-200",
  in_onderhoud: "bg-orange-100 text-orange-800 border-orange-200",
};

const statusLabel: Record<string, string> = {
  concept: "Concept",
  voorbereid: "Voorbereid",
  in_uitvoering: "In uitvoering",
  wacht_op_akkoord: "Niet gereed - wachten op akkoord",
  meerwerk_financieel: "Meerwerk - financieel afronden",
  opgeleverd: "Opgeleverd",
  goedgekeurd: "Gereed",
  afgekeurd: "Afgekeurd",
  in_onderhoud: "In onderhoud",
};

const typeLabel: Record<string, string> = {
  branddeur: "Branddeur",
  doorvoering: "Doorvoering",
  brandklep: "Brandklep",
  kitvoeg: "Kitvoeg",
  manchet: "Manchet",
  brandwerend_glas: "Brandwerend Glas",
  coating: "Coating/Bekleding",
  luik: "Luik",
  plaatconstructie: "Plaatconstructie",
  schuifdeur: "Schuifdeur",
  puiconstructie: "Puiconstructie",
  dakdoorvoer: "Dakdoorvoer",
};

function AiControlePaneel({ voorzieningId, labels }: { voorzieningId: number; labels: Label[] }) {
  const queryClient = useQueryClient();
  const { data: record, isLoading } = useGetSpotAiVoorstel(voorzieningId, {
    query: { queryKey: getGetSpotAiVoorstelQueryKey(voorzieningId) },
  });
  const [herkomst, setHerkomst] = useState<string>("");
  const bevestig = useBevestigSpotAiControle();

  if (isLoading) {
    return (
      <Card className="border-red-300">
        <CardContent className="p-6 text-sm text-muted-foreground">AI-controle laden…</CardContent>
      </Card>
    );
  }
  if (!record) return null;

  const voorstel = record.voorstel;
  const suggesties = voorstel?.toepassing_suggesties ?? [];

  const onBevestig = async () => {
    if (herkomst !== "gebouwspecifiek" && herkomst !== "generiek") return;
    await bevestig.mutateAsync({ id: voorzieningId, data: { herkomst } });
    await queryClient.invalidateQueries({ queryKey: getGetVoorzieningQueryKey(voorzieningId) });
    await queryClient.invalidateQueries({ queryKey: getGetSpotAiVoorstelQueryKey(voorzieningId) });
  };

  return (
    <Card className="border-red-300 bg-red-50/40">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 text-red-800">
          <AlertCircle className="h-4 w-4" /> AI-controle vereist — afwijkende toepassingskeuze
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          De monteur koos een andere toepassing dan de AI voorstelde. Beoordeel de afwijking en leg vast of deze keuze
          gebouwspecifiek of generiek toepasbaar is. De keuze wordt opgeslagen als leervoorbeeld; de AI keurt nooit zelf goed.
        </p>

        {(record.foto_voor_url || record.foto_na_url) && (
          <div className="grid grid-cols-2 gap-4">
            {record.foto_voor_url && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Foto vóór</div>
                <img
                  src={`/api/storage${record.foto_voor_url}`}
                  alt="Foto vóór de afwerking"
                  className="w-full rounded-md border object-cover aspect-video bg-muted"
                />
              </div>
            )}
            {record.foto_na_url && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Foto ná</div>
                <img
                  src={`/api/storage${record.foto_na_url}`}
                  alt="Foto ná de afwerking"
                  className="w-full rounded-md border object-cover aspect-video bg-muted"
                />
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-md border border-amber-300 bg-amber-100/70 p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 mb-2">
              <Sparkles className="h-3.5 w-3.5" /> AI stelde voor
            </div>
            {suggesties.length ? (
              <ul className="space-y-1 text-sm">
                {suggesties.slice(0, 3).map((s) => (
                  <li key={s.label_id} className="font-medium">
                    {s.naam}
                    {s.fabrikant && <span className="text-muted-foreground font-normal"> · {s.fabrikant}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-muted-foreground">Geen toepassingsvoorstel</div>
            )}
            {voorstel?.betrouwbaarheid && (
              <div className="text-xs text-amber-700 mt-2">Betrouwbaarheid: {voorstel.betrouwbaarheid}</div>
            )}
          </div>
          <div className="rounded-md border bg-background p-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">Monteur koos</div>
            {labels.length ? (
              <ul className="space-y-1 text-sm">
                {labels.map((l) => (
                  <li key={l.id} className="font-medium">
                    {l.naam}
                    {l.fabrikant && <span className="text-muted-foreground font-normal"> · {l.fabrikant}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-muted-foreground">Geen toepassing gekozen</div>
            )}
          </div>
        </div>

        {voorstel?.observaties && (
          <div className="text-sm">
            <div className="text-xs text-muted-foreground">AI-observaties</div>
            <div className="italic text-muted-foreground">{voorstel.observaties}</div>
          </div>
        )}

        <div className="space-y-2">
          <div className="text-sm font-medium">
            Hoe moet deze keuze gelden? <span className="text-red-600">*</span>
          </div>
          <RadioGroup value={herkomst} onValueChange={setHerkomst} className="gap-2">
            <div className="flex items-start gap-2">
              <RadioGroupItem value="gebouwspecifiek" id="herkomst-gebouw" className="mt-0.5" />
              <FormLabel htmlFor="herkomst-gebouw" className="font-normal leading-snug">
                <span className="font-medium">Gebouwspecifiek</span> — geldt alleen voor dit gebouw
              </FormLabel>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="generiek" id="herkomst-generiek" className="mt-0.5" />
              <FormLabel htmlFor="herkomst-generiek" className="font-normal leading-snug">
                <span className="font-medium">Generiek</span> — algemeen toepasbaar (voedt de AI-leerset breed)
              </FormLabel>
            </div>
          </RadioGroup>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={onBevestig} disabled={!herkomst || bevestig.isPending}>
            {bevestig.isPending ? "Bevestigen…" : "Controle bevestigen"}
          </Button>
          <span className="text-xs text-muted-foreground">
            Na bevestiging verdwijnt de markering en wordt de keuze opgeslagen als leervoorbeeld.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function VoorzieningDetail() {
  const { id } = useParams<{ id: string }>();
  const { heeftNiveau } = useBevoegdheid();
  const { data: voorziening, isLoading } = useGetVoorziening(Number(id), {
    query: { enabled: !!id, queryKey: getGetVoorzieningQueryKey(Number(id)) },
  });
  const [statusOpen, setStatusOpen] = useState(false);
  const [bewerkenOpen, setBewerkenOpen] = useState(false);
  // Spots bewerken (status, foto's, gegevens) komt uit de bevoegdheden-matrix
  // (Spots-module, niveau 3 "Aanmaken en wijzigen"), niet uit een rolnaam — de
  // rol-enum kent alleen nog hoofdbeheerder/gebruiker/klant.
  const magBewerken = heeftNiveau("voorzieningen", 3);
  // AI-controle bevestigen vereist volledig beheer (niveau 4) op de spots-module,
  // zodat een monteur (niveau 3) zijn eigen afwijking niet zelf kan bevestigen.
  const magControleren = heeftNiveau("voorzieningen", 4);

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto">
        <div className="h-10 bg-muted animate-pulse rounded w-48" />
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  if (!voorziening) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <Link href="/voorzieningen">
          <Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-2" /> Terug</Button>
        </Link>
        <div className="text-muted-foreground">Spot niet gevonden.</div>
      </div>
    );
  }

  // Brand-/rookwerendheid wordt niet meer per spot gekozen. Leid de waarde af uit
  // de testnorm van een gekoppelde toepassing; val terug op legacy spot-velden.
  const toepassingen: any[] = Array.isArray((voorziening as any).labels)
    ? (voorziening as any).labels
    : [];
  const meetwaarde: string | null = (() => {
    for (const l of toepassingen) {
      const m = /^(WRD|EW|EI)\s?(\d+)/i.exec(String(l?.testnorm ?? "").trim());
      if (m) {
        const p = m[1].toUpperCase();
        return p === "WRD" ? `WRD ${m[2]}` : p === "EW" ? `EW ${m[2]}` : `EI ${m[2]}`;
      }
    }
    const v: any = voorziening;
    if (v.wrd) return `WRD ${v.wrd}`;
    if (v.wbdbo) return `EW ${v.wbdbo}`;
    if (v.classificatie && v.classificatie !== "60") return `EI ${v.classificatie}`;
    return null;
  })();

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/voorzieningen">
          <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">{voorziening.objectnummer}</h1>
            <Badge variant="outline" className={statusKleur[voorziening.status ?? "concept"]}>
              {voorziening.status === "goedgekeurd" ? <CheckCircle className="h-3 w-3 mr-1" /> : voorziening.status === "afgekeurd" ? <AlertCircle className="h-3 w-3 mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
              {statusLabel[voorziening.status ?? "concept"]}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-0.5">
            {typeLabel[voorziening.type ?? ""] ?? voorziening.type}
            {meetwaarde && ` • ${meetwaarde}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/voorzieningen/${id}/qr`}>
            <Button variant="outline">
              <QrCode className="h-4 w-4 mr-2" /> QR-label
            </Button>
          </Link>
          {magBewerken && (
            <Button variant="outline" onClick={() => setBewerkenOpen(true)}>
              <Pencil className="h-4 w-4 mr-2" /> Bewerken
            </Button>
          )}
        </div>
      </div>

      {magControleren && (voorziening as any).ai_te_controleren && (
        <AiControlePaneel
          voorzieningId={voorziening.id}
          labels={(Array.isArray((voorziening as any).labels) ? (voorziening as any).labels : []) as Label[]}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Locatie */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Locatie
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Gebouw</div>
                <div className="font-medium">{voorziening.gebouw_naam ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Verdieping</div>
                <div className="font-medium">{voorziening.verdieping_naam ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Ruimte</div>
                <div className="font-medium">{voorziening.ruimte ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Locatieomschrijving</div>
                <div className="font-medium">{voorziening.locatie_omschrijving ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Cluster</div>
                <div className="font-medium">{(voorziening as any).cluster_naam ?? "—"}</div>
              </div>
              {(voorziening.locatie_x || voorziening.locatie_y) && (
                <div className="col-span-2">
                  <div className="text-muted-foreground">Coördinaten (plattegrond)</div>
                  <div className="font-medium font-mono">X: {voorziening.locatie_x} / Y: {voorziening.locatie_y}</div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Materialen & Opmerkingen */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" /> Materialen & Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-muted-foreground">Toegepaste materialen</div>
                <div className="font-medium mt-0.5">{voorziening.materialen ?? "Niet geregistreerd"}</div>
              </div>
              {voorziening.opmerkingen && (
                <div>
                  <div className="text-muted-foreground">Opmerkingen</div>
                  <div className="font-medium mt-0.5 text-muted-foreground italic">{voorziening.opmerkingen}</div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Toepassingen */}
          {Array.isArray((voorziening as any).labels) && (voorziening as any).labels.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Tag className="h-4 w-4" /> Toepassingen
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {((voorziening as any).labels as Label[]).map((l) => (
                    <div
                      key={l.id}
                      className="border rounded-md px-3 py-1.5 text-sm bg-muted/30"
                    >
                      <span className="font-medium">{l.naam}</span>
                      {l.fabrikant && (
                        <span className="text-muted-foreground ml-2 text-xs">
                          {l.fabrikant}
                        </span>
                      )}
                      {l.testnorm && (
                        <Badge
                          variant="outline"
                          className="ml-2 text-[10px] px-1 py-0"
                        >
                          {l.testnorm}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Inspecties */}
          {Array.isArray((voorziening as any).inspecties) && (voorziening as any).inspecties.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Inspecties</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(voorziening as any).inspecties.map((i: any) => (
                    <div key={i.id} className="flex items-center justify-between border-b last:border-0 pb-2 last:pb-0">
                      <div>
                        <div className="font-medium text-sm">{i.type}</div>
                        <div className="text-xs text-muted-foreground">{i.geplande_datum ? new Date(i.geplande_datum).toLocaleDateString("nl-NL") : "—"}</div>
                      </div>
                      <Badge variant="outline" className="text-xs">{i.status}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {/* QR & Nummers */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <QrCode className="h-4 w-4" /> Identificatie
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-muted-foreground">Objectnummer</div>
                <div className="font-mono font-semibold">{voorziening.objectnummer}</div>
              </div>
              {voorziening.qr_code && (
                <div>
                  <div className="text-muted-foreground">QR-code</div>
                  <div className="font-mono text-xs bg-muted p-2 rounded mt-1">{voorziening.qr_code}</div>
                </div>
              )}
              <div>
                <div className="text-muted-foreground">Brand-/rookwerendheid</div>
                <div className="font-semibold">{meetwaarde ?? "—"}</div>
              </div>
            </CardContent>
          </Card>

          {/* Personeel */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" /> Verantwoordelijken
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-muted-foreground">Monteur</div>
                <div className="font-medium">{voorziening.monteur_naam ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Onderhoudscontroleur</div>
                <div className="font-medium">{voorziening.controleur_naam ?? "—"}</div>
              </div>
            </CardContent>
          </Card>

          {/* Datums */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Datums
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-muted-foreground">Installatiedatum</div>
                <div className="font-medium">
                  {voorziening.installatie_datum ? new Date(voorziening.installatie_datum).toLocaleDateString("nl-NL") : "—"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Volgende inspectie</div>
                <div className={`font-medium ${voorziening.volgende_inspectie ? "text-foreground" : "text-muted-foreground"}`}>
                  {voorziening.volgende_inspectie ? new Date(voorziening.volgende_inspectie).toLocaleDateString("nl-NL") : "—"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Aangemaakt op</div>
                <div className="font-medium">{new Date(voorziening.aangemaakt_op).toLocaleDateString("nl-NL")}</div>
              </div>
            </CardContent>
          </Card>

          {/* Acties */}
          {magBewerken && (
            <div className="space-y-2">
              <Button className="w-full" variant="default" onClick={() => setStatusOpen(true)}>
                Status Bijwerken
              </Button>
              <Button className="w-full" variant="outline" onClick={() => setBewerkenOpen(true)}>
                Spot Bewerken
              </Button>
            </div>
          )}
        </div>
      </div>

      {magBewerken && (
        <>
          <VoorzieningStatusDialog
            voorzieningId={voorziening.id}
            huidigeStatus={voorziening.status ?? "concept"}
            open={statusOpen}
            onOpenChange={setStatusOpen}
          />
          <VoorzieningBewerkenDialog
            voorziening={voorziening}
            open={bewerkenOpen}
            onOpenChange={setBewerkenOpen}
          />
        </>
      )}
    </div>
  );
}
