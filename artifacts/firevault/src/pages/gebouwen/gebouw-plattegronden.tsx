import { useEffect, useRef, useState } from "react";
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
import { BestandsGrootteInfo, GROOT_BESTAND_GRENS, formateerGrootte } from "@/components/bestandsgrootte-info";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();
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
  const [rijSelectie, setRijSelectie] = useState<{ vId: number; grootte: number; bestand: File } | null>(null);

  // Ref-kopieën zodat de cleanup-functies altijd de actuele waarden zien.
  const rijSelectieRef = useRef<{ vId: number; grootte: number; bestand: File } | null>(null);
  useEffect(() => { rijSelectieRef.current = rijSelectie; }, [rijSelectie]);
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  // Browser sluiten / harde navigatie: native dialoog.
  useEffect(() => {
    const sel = rijSelectie;
    if (!sel || sel.grootte <= GROOT_BESTAND_GRENS) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [rijSelectie]);

  // In-app navigatie: component unmount → toon melding zodat de gebruiker weet
  // dat de wachtende upload niet gestart is.
  useEffect(() => {
    return () => {
      const sel = rijSelectieRef.current;
      if (sel && sel.grootte > GROOT_BESTAND_GRENS) {
        toastRef.current({
          title: "Upload niet gestart",
          description: "U heeft de pagina verlaten terwijl een groot bestand wachtte op bevestiging. De upload is niet gestart.",
        });
      }
    };
  }, []);

  const gesorteerd = [...verdiepingen].sort((a, b) => a.niveau - b.niveau);
  const gekozen = gesorteerd.find((v) => String(v.id) === keuzeId);
  const heeftAl = Boolean(gekozen?.plattegrond_url);
  const heeftSpots = (gekozen?.totaal_voorzieningen ?? 0) > 0;

  function kiesVoor(verdiepingId: number) {
    setFout("");
    doelId.current = verdiepingId;
    inputRef.current?.click();
  }

  async function opBestand(file: File, verdiepingId: number) {
    setFout("");
    setBestandGrootte(file.size);
    setFouteId(null);
    setBezigId(verdiepingId);
    try {
      const upload = await uploadFile(file);
      if (!upload) {
        setFouteId(verdiepingId);
        return;
      }
      await updateVerdieping.mutateAsync({
        id: verdiepingId,
        data: { plattegrond_url: upload.objectPath },
      });
      queryClient.invalidateQueries();
      setFormOpen(false);
      setBevestigVervangen(false);
      setKeuzeId("");
      setBestandGrootte(null);
      setRijSelectie(null);
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
            if (file) {
              const vId = doelId.current;
              if (!formOpen && vId != null) {
                if (file.size > GROOT_BESTAND_GRENS) {
                  setRijSelectie({ vId, grootte: file.size, bestand: file });
                } else {
                  setRijSelectie({ vId, grootte: file.size, bestand: file });
                  await opBestand(file, vId);
                }
              } else if (vId != null) {
                await opBestand(file, vId);
              }
            }
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
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {heeft ? (
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="h-7"
                      >
                        <Link href={`/gebouwen/${gebouwId}/plattegrond/${v.id}`}>
                          <ExternalLink className="h-4 w-4 mr-1" /> Openen
                        </Link>
                      </Button>
                    ) : isBeheerder && !(rijSelectie?.vId === v.id && rijSelectie.grootte > GROOT_BESTAND_GRENS) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7"
                        disabled={bezig || (rijSelectie != null && rijSelectie.grootte > GROOT_BESTAND_GRENS)}
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
                    {rijSelectie?.vId === v.id && (
                      rijSelectie.grootte > GROOT_BESTAND_GRENS ? (
                        <div className="flex flex-col items-end gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                          <div className="flex items-center gap-1.5">
                            <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />
                            {formateerGrootte(rijSelectie.grootte)} — groot bestand
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              className="h-6 px-2 text-xs"
                              disabled={bezig}
                              onClick={() => { void opBestand(rijSelectie.bestand, rijSelectie.vId); }}
                            >
                              {bezig ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                              Uploaden
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs"
                              disabled={bezig}
                              onClick={() => {
                                setRijSelectie(null);
                                doelId.current = null;
                              }}
                            >
                              Annuleren
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 rounded px-2 py-1 text-xs bg-muted/50 text-muted-foreground">
                          {formateerGrootte(rijSelectie.grootte)}
                        </div>
                      )
                    )}
                  </div>
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

        <BestandsGrootteInfo bytes={bestandGrootte} toonGrootte={false} />

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
