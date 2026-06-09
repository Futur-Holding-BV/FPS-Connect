import { useState } from "react";
import { useParams, Link } from "wouter";
import { useGetVoorziening, getGetVoorzieningQueryKey } from "@workspace/api-client-react";
import type { Label } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building, Calendar, User, Package, MapPin, QrCode, CheckCircle, AlertCircle, Clock, Pencil, Tag } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { VoorzieningStatusDialog } from "./voorziening-status-dialog";
import { VoorzieningBewerkenDialog } from "./voorziening-bewerken-dialog";

// Controleur valt buiten de normale project-/opleverworkflow; alleen monteur en beheerder
// mogen spots bewerken. Controleur krijgt inzagerechten via TOEGEWEZEN_ROLLEN op de server.
const BEWERK_ROLLEN = ["monteur", "beheerder", "hoofdbeheerder"];

const statusKleur: Record<string, string> = {
  concept: "bg-gray-100 text-gray-700 border-gray-200",
  in_uitvoering: "bg-blue-100 text-blue-800 border-blue-200",
  goedgekeurd: "bg-green-100 text-green-800 border-green-200",
  afgekeurd: "bg-red-100 text-red-800 border-red-200",
  in_onderhoud: "bg-orange-100 text-orange-800 border-orange-200",
};

const statusLabel: Record<string, string> = {
  concept: "Concept",
  in_uitvoering: "In uitvoering",
  goedgekeurd: "Goedgekeurd",
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

export default function VoorzieningDetail() {
  const { id } = useParams<{ id: string }>();
  const { gebruiker } = useAuth();
  const { data: voorziening, isLoading } = useGetVoorziening(Number(id), {
    query: { enabled: !!id, queryKey: getGetVoorzieningQueryKey(Number(id)) },
  });
  const [statusOpen, setStatusOpen] = useState(false);
  const [bewerkenOpen, setBewerkenOpen] = useState(false);
  const magBewerken = !!gebruiker?.rol && BEWERK_ROLLEN.includes(gebruiker.rol as string);

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
        <div className="text-muted-foreground">Voorziening niet gevonden.</div>
      </div>
    );
  }

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
            {voorziening.classificatie && ` • EI ${voorziening.classificatie}`}
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
                <div className="text-muted-foreground">Classificatie</div>
                <div className="font-semibold">EI {voorziening.classificatie ?? "—"}</div>
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
