import { useRef, useState } from "react";
import { Link } from "wouter";
import { useUpdateVerdieping } from "@workspace/api-client-react";
import type { Verdieping } from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Map, Loader2, Upload, ExternalLink, Plus, AlertTriangle } from "lucide-react";

const GROOT_BESTAND_GRENS = 10 * 1024 * 1024;

function formateerGrootte(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(".", ",")} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export default function GebouwPlattegronden({
  gebouwId,
  verdiepingen = [],
  isBeheerder,
}: {
  gebouwId: number;
  verdiepingen?: Verdieping[];
  isBeheerder: boolean;
}) {
  const queryClient = useQueryClient();
  const updateVerdieping = useUpdateVerdieping();
  const {
    uploadFile,
    retryUpload,
    error: uploadError,
    uploadFoutType,
  } = useUpload({ gebouw_id: gebouwId, bestand_type: "tekening" });

  const inputRef = useRef<HTMLInputElement>(null);
  const doelId = useRef<number | null>(null);
  const [bezigId, setBezigId] = useState<number | null>(null);
  const [fouteId, setFouteId] = useState<number | null>(null);
  const [fout, setFout] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [keuzeId, setKeuzeId] = useState<string>("");
  const [bevestigVervangen, setBevestigVervangen] = useState(false);
  const [bestandGrootte, setBestandGrootte] = useState<number | null>(null);

  const gesorteerd = [...verdiepingen].sort((a, b) => a.niveau - b.niveau);
  const gekozen = gesorteerd.find((v) => String(v.id) === keuzeId);
  const heeftAl = Boolean(gekozen?.plattegrond_url);
  const heeftSpots = (gekozen?.totaal_voorzieningen ?? 0) > 0;

  function kiesVoor(verdiepingId: number) {
    setFout("");
    doelId.current = verdiepingId;
    inputRef.current?.click();
  }

  async function opBestand(file: File) {
    const vId = doelId.current;
    if (vId == null) return;
    setFout("");
    setBestandGrootte(file.size);
    setFouteId(null);
    setBezigId(vId);
    try {
      const upload = await uploadFile(file);
      if (!upload) {
        setFouteId(vId);
        return;
      }
      await updateVerdieping.mutateAsync({
        id: vId,
        data: { plattegrond_url: upload.objectPath },
      });
      queryClient.invalidateQueries();
      setFormOpen(false);
      setBevestigVervangen(false);
      setKeuzeId("");
      setBestandGrootte(null);
    } catch {
      setFout("Opslaan mislukt. Probeer het opnieuw.");
    } finally {
      setBezigId(null);
      doelId.current = null;
    }
  }

  async function probeerOpnieuw() {
    if (fouteId == null) return;
    const vId = fouteId;
    setFout("");
    setFouteId(null);
    setBezigId(vId);
    try {
      const upload = await retryUpload();
      if (!upload) {
        setFouteId(vId);
        return;
      }
      await updateVerdieping.mutateAsync({
        id: vId,
        data: { plattegrond_url: upload.objectPath },
      });
      queryClient.invalidateQueries();
      setFormOpen(false);
      setBevestigVervangen(false);
      setKeuzeId("");
    } catch {
      setFout("Opslaan mislukt. Probeer het opnieuw.");
      setFouteId(vId);
    } finally {
      setBezigId(null);
    }
  }

  function kiesOpnieuw() {
    if (fouteId == null) return;
    setFout("");
    setFouteId(null);
    doelId.current = fouteId;
    inputRef.current?.click();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Map className="h-5 w-5 text-primary" /> Plattegronden
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Upload een plattegrond per bouwlaag. De plattegrond wordt meteen de
          ondergrond voor het plaatsen van voorzieningen.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) await opBestand(file);
            e.target.value = "";
          }}
        />

        {gesorteerd.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nog geen bouwlagen. Maak eerst een bouwlaag aan in de sectie
            Bouwlagen, daarna kun je hier een plattegrond uploaden.
          </p>
        ) : (
          <ul className="space-y-2">
            {gesorteerd.map((v) => {
              const heeft = Boolean(v.plattegrond_url);
              const bezig = bezigId === v.id;
              return (
                <li
                  key={v.id}
                  className="flex items-center justify-between gap-2 rounded-md border p-2"
                >
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="font-medium text-sm truncate">{v.naam}</span>
                    <Badge variant="outline" className="text-xs shrink-0">
                      niveau {v.niveau}
                    </Badge>
                    {heeft ? (
                      <Badge
                        variant="outline"
                        className="text-xs shrink-0 border-green-600 text-green-700"
                      >
                        Plattegrond aanwezig
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-xs shrink-0 text-muted-foreground"
                      >
                        Geen plattegrond
                      </Badge>
                    )}
                  </div>
                  {heeft ? (
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="shrink-0 h-7"
                    >
                      <Link href={`/gebouwen/${gebouwId}/plattegrond/${v.id}`}>
                        <ExternalLink className="h-4 w-4 mr-1" /> Openen
                      </Link>
                    </Button>
                  ) : isBeheerder ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 h-7"
                      disabled={bezig}
                      onClick={() => kiesVoor(v.id)}
                    >
                      {bezig ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-1" />
                      )}
                      Upload plattegrond
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {isBeheerder && gesorteerd.length > 0 && !formOpen && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFormOpen(true);
              setKeuzeId(String(gesorteerd[0]!.id));
              setBevestigVervangen(false);
              setFout("");
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Tekening toevoegen
          </Button>
        )}

        {isBeheerder && formOpen && (
          <div className="space-y-3 rounded-md border p-3">
            <div className="space-y-1">
              <Label>Bouwlaag</Label>
              <Select
                value={keuzeId}
                onValueChange={(v) => {
                  setKeuzeId(v);
                  setBevestigVervangen(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kies een bouwlaag" />
                </SelectTrigger>
                <SelectContent>
                  {gesorteerd.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.naam}
                      {v.plattegrond_url ? " — plattegrond aanwezig" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {heeftAl && (
              <p className="text-xs text-amber-700">
                Deze bouwlaag heeft al een plattegrond. Uploaden vervangt de
                bestaande
                {heeftSpots
                  ? "; geplaatste spots kunnen daardoor verschuiven"
                  : ""}
                .
              </p>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!keuzeId || bezigId === Number(keuzeId)}
                onClick={() => {
                  if (!keuzeId) return;
                  if (heeftAl && heeftSpots && !bevestigVervangen) {
                    setBevestigVervangen(true);
                    return;
                  }
                  setFout("");
                  doelId.current = Number(keuzeId);
                  inputRef.current?.click();
                }}
              >
                {bezigId === Number(keuzeId) ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-1" />
                )}
                {bevestigVervangen ? "Toch vervangen" : "Bestand kiezen"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFormOpen(false);
                  setBevestigVervangen(false);
                }}
              >
                Annuleren
              </Button>
            </div>
          </div>
        )}

        {bestandGrootte !== null && bestandGrootte > GROOT_BESTAND_GRENS && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
            <span>Groot bestand ({formateerGrootte(bestandGrootte)}) — overweeg een geoptimaliseerde versie</span>
          </div>
        )}

        {uploadError && fouteId != null && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2">
            <p className="text-sm text-destructive flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {uploadFoutType === "netwerk"
                ? "Verbinding tijdelijk weggevallen"
                : uploadFoutType === "bestandstype"
                  ? "Bestandstype geweigerd"
                  : "Upload mislukt"}
            </p>
            <p className="text-xs text-muted-foreground">{uploadError.message}</p>
            <div className="flex gap-2">
              {uploadFoutType !== "bestandstype" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bezigId !== null}
                  onClick={probeerOpnieuw}
                >
                  Opnieuw proberen
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={bezigId !== null}
                onClick={kiesOpnieuw}
              >
                Ander bestand kiezen
              </Button>
            </div>
          </div>
        )}
        {fout && <p className="text-sm text-destructive">{fout}</p>}
      </CardContent>
    </Card>
  );
}
