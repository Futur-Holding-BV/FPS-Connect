// Rapport "Ritten buiten werktijd" — voertuiggericht (nooit per persoon).
// Beheerders configureren werktijdvensters (organisatie + per voertuig);
// elke raadpleging van het rapport wordt in het AVG-logboek geregistreerd.
import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListVoertuigen,
  useListWagenparkWerktijdvensters,
  useUpsertWagenparkWerktijdvenster,
  useDeleteWagenparkWerktijdvenster,
  useGetWagenparkBuitenWerktijdRapport,
  getListWagenparkWerktijdvenstersQueryKey,
  getGetWagenparkBuitenWerktijdRapportQueryKey,
} from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Clock, ShieldAlert, Trash2, Truck } from "lucide-react";

const DAG_LABELS = ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"];
// Weergavevolgorde ma..zo
const DAG_VOLGORDE = [1, 2, 3, 4, 5, 6, 0];

function formatDagen(dagen: number[]): string {
  return DAG_VOLGORDE.filter((d) => dagen.includes(d)).map((d) => DAG_LABELS[d]).join(", ");
}

function formatDatumTijd(iso: string): string {
  return new Date(iso).toLocaleString("nl-NL", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function isoDatum(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Vensterformulier ───────────────────────────────────────

function VensterFormulier({ naSucces }: { naSucces: () => void }) {
  const { data: voertuigen = [] } = useListVoertuigen({ gearchiveerd: false });
  const upsert = useUpsertWagenparkWerktijdvenster();

  const [scope, setScope]       = useState<string>("organisatie");
  const [dagen, setDagen]       = useState<number[]>([1, 2, 3, 4, 5]);
  const [startTijd, setStartTijd] = useState("07:00");
  const [eindTijd, setEindTijd]   = useState("18:00");

  const wisselDag = (d: number) => {
    setDagen((huidig) => huidig.includes(d) ? huidig.filter((x) => x !== d) : [...huidig, d]);
  };

  const opslaan = () => {
    upsert.mutate(
      {
        data: {
          voertuig_id: scope === "organisatie" ? null : Number(scope),
          werkdagen: dagen,
          start_tijd: startTijd,
          eind_tijd: eindTijd,
          actief: true,
        },
      },
      { onSuccess: naSucces },
    );
  };

  const geldig = dagen.length > 0 && startTijd < eindTijd;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Geldt voor</Label>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="organisatie">Hele organisatie (standaard)</SelectItem>
              {voertuigen.map((v) => (
                <SelectItem key={v.id} value={String(v.id)}>
                  {v.kenteken} — {v.merk} {v.type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Van</Label>
          <Input type="time" value={startTijd} onChange={(e) => setStartTijd(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Tot</Label>
          <Input type="time" value={eindTijd} onChange={(e) => setEindTijd(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Werkdagen</Label>
        <div className="flex flex-wrap gap-2">
          {DAG_VOLGORDE.map((d) => (
            <Button
              key={d}
              type="button"
              size="sm"
              variant={dagen.includes(d) ? "default" : "outline"}
              onClick={() => wisselDag(d)}
            >
              {DAG_LABELS[d]}
            </Button>
          ))}
        </div>
      </div>

      {upsert.isError && (
        <p className="text-sm text-destructive">Opslaan mislukt — controleer de invoer.</p>
      )}
      <Button onClick={opslaan} disabled={!geldig || upsert.isPending}>
        {upsert.isPending ? "Bezig..." : "Venster opslaan"}
      </Button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Pagina
// ══════════════════════════════════════════════════════════

export default function WagenparkBuitenWerktijdPagina() {
  const { heeftNiveau } = useBevoegdheid();
  const magBeheer = heeftNiveau("wagenpark", 4);
  const queryClient = useQueryClient();

  const vandaag = new Date();
  const [van, setVan] = useState(isoDatum(new Date(vandaag.getTime() - 30 * 86_400_000)));
  const [tot, setTot] = useState(isoDatum(vandaag));

  // Gate enabled op UI-niveau (query.enabled geeft TS2741 zonder queryKey).
  const { data: vensters = [] } = useListWagenparkWerktijdvensters();
  const { data: rapport, isLoading: ladenRapport } = useGetWagenparkBuitenWerktijdRapport({ van, tot });
  const verwijder = useDeleteWagenparkWerktijdvenster();

  const ververs = () => {
    void queryClient.invalidateQueries({ queryKey: getListWagenparkWerktijdvenstersQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetWagenparkBuitenWerktijdRapportQueryKey({ van, tot }) });
  };

  if (!magBeheer) {
    return (
      <div className="p-6">
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            Alleen wagenparkbeheerders kunnen dit rapport raadplegen.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      {/* Privacy-waarborg — altijd zichtbaar */}
      <Alert className="border-blue-200 bg-blue-50">
        <ShieldAlert className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800 text-sm">
          Dit rapport is voertuiggericht en toont géén persoonsgegevens of adressen.
          Elke raadpleging wordt vastgelegd in het AVG-logboek. De data is niet bedoeld
          voor continue personeelscontrole of beoordeling van individuele medewerkers.
        </AlertDescription>
      </Alert>

      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/wagenpark"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <Clock className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Ritten buiten werktijd</h1>
          <p className="text-sm text-muted-foreground">
            Signaleer mogelijk privégebruik per voertuig, binnen configureerbare werktijdvensters
          </p>
        </div>
      </div>

      {/* Vensters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Werktijdvensters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {vensters.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Geldt voor</TableHead>
                  <TableHead>Werkdagen</TableHead>
                  <TableHead>Venster</TableHead>
                  <TableHead>Bijgewerkt</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {vensters.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell>
                      {w.voertuig_id === null || w.voertuig_id === undefined
                        ? <Badge variant="secondary">Organisatiestandaard</Badge>
                        : <span className="font-medium">{w.kenteken ?? `Voertuig #${w.voertuig_id}`}</span>}
                    </TableCell>
                    <TableCell>{formatDagen(w.werkdagen)}</TableCell>
                    <TableCell>{w.start_tijd} – {w.eind_tijd}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDatumTijd(w.bijgewerkt_op)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => verwijder.mutate({ id: w.id }, { onSuccess: ververs })}
                        disabled={verwijder.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <VensterFormulier naSucces={ververs} />
        </CardContent>
      </Card>

      {/* Rapport */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Rapport per voertuig
          </CardTitle>
          <div className="flex items-center gap-2">
            <Input type="date" value={van} onChange={(e) => setVan(e.target.value)} className="w-40" />
            <span className="text-sm text-muted-foreground">t/m</span>
            <Input type="date" value={tot} onChange={(e) => setTot(e.target.value)} className="w-40" />
          </div>
        </CardHeader>
        <CardContent>
          {ladenRapport ? (
            <p className="text-sm text-muted-foreground py-4">Rapport laden…</p>
          ) : !rapport?.geconfigureerd ? (
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription>
                Er is nog geen werktijdvenster geconfigureerd. Stel hierboven eerst een
                organisatiestandaard in om ritten buiten werktijd te kunnen signaleren.
              </AlertDescription>
            </Alert>
          ) : rapport.voertuigen.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Geen voertuigen met een geldend werktijdvenster in deze periode.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Voertuig</TableHead>
                  <TableHead>Venster</TableHead>
                  <TableHead className="text-right">Ritten totaal</TableHead>
                  <TableHead className="text-right">Buiten werktijd</TableHead>
                  <TableHead className="text-right">Km buiten werktijd</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rapport.voertuigen.map((v) => (
                  <TableRow key={v.voertuig_id}>
                    <TableCell>
                      <Link href={`/wagenpark/${v.voertuig_id}`} className="font-medium hover:underline">
                        {v.kenteken}
                      </Link>
                      <span className="text-muted-foreground text-sm ml-2">{v.merk} {v.type}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {v.venster_bron === "voertuig" ? "Voertuigspecifiek" : "Organisatie"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{v.aantal_ritten_totaal}</TableCell>
                    <TableCell className="text-right">
                      {v.aantal_buiten_venster > 0 ? (
                        <Badge className="bg-orange-100 text-orange-800">{v.aantal_buiten_venster}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {v.km_buiten_venster > 0 ? `${v.km_buiten_venster.toLocaleString("nl-NL")} km` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
