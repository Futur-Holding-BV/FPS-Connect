import { useRef, useState } from "react";
import {
  useListGebouwTekeningen,
  useCreateGebouwTekening,
  useUpdateGebouwTekening,
  useDeleteGebouwTekening,
  useCreateVerdieping,
  useAiAnalyseTekening,
  useAiVeldCorrectie,
} from "@workspace/api-client-react";
import type {
  Verdieping,
  Tekening,
  TekeningAiAnalyseResultaat,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { TekeningViewer } from "./tekening-viewer";
import { BestandsGrootteInfo } from "@/components/bestandsgrootte-info";

const TEKENING_TYPES = [
  { waarde: "gevelaanzicht", label: "Gevelaanzicht" },
  { waarde: "doorsnede", label: "Doorsnede" },
  { waarde: "situatietekening", label: "Situatietekening" },
  { waarde: "installatietekening", label: "Installatietekening" },
  { waarde: "detailtekening", label: "Detailtekening" },
  { waarde: "document", label: "Document / rapport" },
  { waarde: "overig", label: "Overig" },
];

const TOEGESTANE_TYPES = new Set(TEKENING_TYPES.map((t) => t.waarde));

function veiligType(type: string): string {
  return TOEGESTANE_TYPES.has(type) ? type : "overig";
}

function typeLabel(type: string): string {
  return TEKENING_TYPES.find((t) => t.waarde === type)?.label ?? type;
}

const GEEN_BOUWLAAG = "geen";
const NIEUWE_BOUWLAAG = "nieuw";

export default function GebouwTekeningen({
  gebouwId,
  verdiepingen = [],
  isBeheerder,
}: {
  gebouwId: number;
  verdiepingen?: Verdieping[];
  isBeheerder: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: tekeningen, isLoading } = useListGebouwTekeningen(gebouwId);
  const maakTekening = useCreateGebouwTekening();
  const wijzigTekening = useUpdateGebouwTekening();
  const verwijderTekening = useDeleteGebouwTekening();
  const maakVerdieping = useCreateVerdieping();
  const analyseTekening = useAiAnalyseTekening();
  const veldCorrectieMutatie = useAiVeldCorrectie();
  const {
    uploadFile,
    isUploading,
    error: uploadError,
    uploadFoutType,
  } = useUpload({ gebouw_id: gebouwId, bestand_type: "tekening" });

  const inputRef = useRef<HTMLInputElement>(null);
  const lastBestandRef = useRef<File | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [naam, setNaam] = useState("");
  const [type, setType] = useState("gevelaanzicht");
  const [schaal, setSchaal] = useState("");
  const [verdiepingId, setVerdiepingId] = useState<string>(GEEN_BOUWLAAG);
  const [nieuweBouwlaagNaam, setNieuweBouwlaagNaam] = useState("");
  const [nieuweBouwlaagNiveau, setNieuweBouwlaagNiveau] = useState("0");
  const [bestandsnaam, setBestandsnaam] = useState("");
  const [objectPath, setObjectPath] = useState("");
  const [bestandGrootte, setBestandGrootte] = useState<number | null>(null);
  const [zichtbaarMonteur, setZichtbaarMonteur] = useState(false);
  const [aiVoorstel, setAiVoorstel] = useState<TekeningAiAnalyseResultaat | null>(
    null,
  );
  const [fout, setFout] = useState("");
  const [actief, setActief] = useState<Tekening | null>(null);

  const gesorteerdeVerdiepingen = [...verdiepingen].sort(
    (a, b) => a.niveau - b.niveau,
  );

  function bouwlaagNaam(id: number | null | undefined): string | null {
    if (id == null) return null;
    return verdiepingen.find((v) => v.id === id)?.naam ?? null;
  }

  async function kiesBestand(file: File) {
    setFout("");
    setBestandGrootte(file.size);
    lastBestandRef.current = file;
    const res = await uploadFile(file);
    if (!res) return;
    setObjectPath(res.objectPath);
    setBestandsnaam(file.name);
    if (!naam) setNaam(file.name.replace(/\.[^.]+$/, ""));
    await analyseerBestand(file.name);
  }

  async function probeerOpnieuw() {
    if (!lastBestandRef.current) return;
    await kiesBestand(lastBestandRef.current);
  }

  async function analyseerBestand(naamVanBestand: string) {
    try {
      const res = await analyseTekening.mutateAsync({
        id: gebouwId,
        data: { bestandsnaam: naamVanBestand, type },
      });
      setAiVoorstel(res);
      setNaam(res.tekening_naam);
      setType(veiligType(res.tekening_type));
      if (res.bestaande_verdieping_id != null) {
        setVerdiepingId(String(res.bestaande_verdieping_id));
      } else if (res.bouwlaag_naam) {
        setVerdiepingId(NIEUWE_BOUWLAAG);
        setNieuweBouwlaagNaam(res.bouwlaag_naam);
        setNieuweBouwlaagNiveau(String(res.bouwlaag_niveau ?? 0));
      } else {
        setVerdiepingId(GEEN_BOUWLAAG);
      }
    } catch {
      // AI-voorstel is optioneel; bij een fout blijft handmatig invullen mogelijk.
    }
  }

  function reset() {
    setNaam("");
    setType("gevelaanzicht");
    setSchaal("");
    setVerdiepingId(GEEN_BOUWLAAG);
    setNieuweBouwlaagNaam("");
    setNieuweBouwlaagNiveau("0");
    setBestandsnaam("");
    setObjectPath("");
    setBestandGrootte(null);
    setZichtbaarMonteur(false);
    setAiVoorstel(null);
    setFout("");
    setFormOpen(false);
    lastBestandRef.current = null;
  }

  // Leerlus: legt per door de tekening-AI voorgesteld veld vast wat er
  // uiteindelijk (evt. na bewerking) is opgeslagen. Fire-and-forget: fouten
  // blijven stil (console.debug) en de flow wordt nooit geblokkeerd.
  function logTekeningCorrecties(opgeslagenNaam: string, opgeslagenType: string) {
    const voorstel = aiVoorstel;
    if (!voorstel) return;
    const velden: Array<[string, string, string]> = [
      ["naam", voorstel.tekening_naam?.trim() ?? "", opgeslagenNaam],
      ["type", voorstel.tekening_type?.trim() ?? "", opgeslagenType],
    ];
    for (const [veld, aiWaarde, gekozen] of velden) {
      // Alleen loggen waar de AI daadwerkelijk een (niet-leeg) voorstel gaf.
      if (!aiWaarde) continue;
      veldCorrectieMutatie.mutate(
        {
          data: {
            veld_naam: `tekening.${veld}`,
            ai_voorstel: aiWaarde,
            gekozen,
            tekst_fragment: opgeslagenNaam.slice(0, 200) || undefined,
          },
        },
        {
          onError: (err) => console.debug("veld-correctie loggen mislukt", err),
        },
      );
    }
  }

  async function opslaan() {
    if (!naam.trim() || !objectPath) return;
    setFout("");
    try {
      let verdieping_id: number | null = null;
      if (verdiepingId === NIEUWE_BOUWLAAG) {
        if (!nieuweBouwlaagNaam.trim()) {
          setFout("Geef de nieuwe bouwlaag een naam.");
          return;
        }
        const nieuw = await maakVerdieping.mutateAsync({
          id: gebouwId,
          data: {
            naam: nieuweBouwlaagNaam.trim(),
            niveau: Number(nieuweBouwlaagNiveau) || 0,
          },
        });
        verdieping_id = nieuw.id;
      } else if (verdiepingId !== GEEN_BOUWLAAG) {
        verdieping_id = Number(verdiepingId);
      }
      const opgeslagenNaam = naam.trim();
      const opgeslagenType = veiligType(type);
      await maakTekening.mutateAsync({
        id: gebouwId,
        data: {
          naam: opgeslagenNaam,
          type: opgeslagenType,
          schaal: schaal || undefined,
          url: objectPath,
          verdieping_id,
          zichtbaar_monteur: zichtbaarMonteur,
        },
      });
      // Leerlus: vastleggen ná succesvolle opslag.
      logTekeningCorrecties(opgeslagenNaam, opgeslagenType);
      reset();
      queryClient.invalidateQueries();
    } catch {
      setFout("Opslaan mislukt. Probeer het opnieuw.");
    }
  }

  async function toggleZichtbaar(t: Tekening, zichtbaar: boolean) {
    try {
      await wijzigTekening.mutateAsync({
        tekeningId: t.id,
        data: { zichtbaar_monteur: zichtbaar },
      });
      queryClient.invalidateQueries();
    } catch {
      setFout("Bijwerken mislukt. Probeer het opnieuw.");
    }
  }

  async function verwijder(tekeningId: number) {
    await verwijderTekening.mutateAsync({ tekeningId });
    queryClient.invalidateQueries();
  }

  const lijst = (tekeningen ?? []).filter((t) => t.type !== "plattegrond");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" /> Overige tekeningen en
          documenten
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Gevelaanzichten, doorsnedes, andere bouwtekeningen en documenten zoals
          rapporten (PDF). Documenten kun je zichtbaar maken voor de monteur op de
          mobiele app; ze maken geen deel uit van het opleverrapport. Plattegronden
          beheer je in de sectie Plattegronden.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Laden...
          </div>
        ) : lijst.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen tekeningen.</p>
        ) : (
          <ul className="space-y-2">
            {lijst.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2 rounded-md border p-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setActief(t)}
                      className="font-medium text-sm hover:underline truncate text-left"
                    >
                      {t.naam}
                    </button>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {typeLabel(t.type)}
                    </Badge>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {bouwlaagNaam(t.verdieping_id) ?? "Hele gebouw"}
                    </Badge>
                    {t.schaal && (
                      <span className="text-xs text-muted-foreground">
                        schaal {t.schaal}
                      </span>
                    )}
                    {t.zichtbaar_monteur && (
                      <Badge
                        variant="outline"
                        className="text-xs shrink-0 border-green-600 text-green-700"
                      >
                        Zichtbaar in monteur-app
                      </Badge>
                    )}
                  </div>
                </div>
                {isBeheerder && (
                  <div className="flex items-center gap-3 shrink-0">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                      <Switch
                        checked={t.zichtbaar_monteur}
                        onCheckedChange={(v) => toggleZichtbaar(t, v)}
                        disabled={wijzigTekening.isPending}
                      />
                      Monteur-app
                    </label>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => verwijder(t.id)}
                      disabled={verwijderTekening.isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {isBeheerder && !formOpen && (
          <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Tekening toevoegen
          </Button>
        )}

        {isBeheerder && formOpen && (
          <div className="space-y-3 rounded-md border p-3">
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) await kiesBestand(file);
                e.target.value = "";
              }}
            />
            {analyseTekening.isPending && (
              <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                AI bepaalt bouwlaag en naam...
              </div>
            )}
            {aiVoorstel && !analyseTekening.isPending && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">AI-voorstel</span>
                  {aiVoorstel.betrouwbaarheid && (
                    <Badge variant="secondary" className="text-xs">
                      betrouwbaarheid {aiVoorstel.betrouwbaarheid}
                    </Badge>
                  )}
                </div>
                {aiVoorstel.toelichting && (
                  <p className="text-xs text-muted-foreground">
                    {aiVoorstel.toelichting}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Controleer en pas zo nodig de naam, het type en de bouwlaag
                  hieronder aan.
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Naam</Label>
                <Input
                  value={naam}
                  onChange={(e) => setNaam(e.target.value)}
                  placeholder="Naam van de tekening"
                />
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEKENING_TYPES.map((t) => (
                      <SelectItem key={t.waarde} value={t.waarde}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Bouwlaag</Label>
                <Select value={verdiepingId} onValueChange={setVerdiepingId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GEEN_BOUWLAAG}>Hele gebouw</SelectItem>
                    <SelectItem value={NIEUWE_BOUWLAAG}>
                      Nieuwe bouwlaag aanmaken
                    </SelectItem>
                    {gesorteerdeVerdiepingen.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        {v.naam}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {verdiepingId === NIEUWE_BOUWLAAG && (
                <>
                  <div className="space-y-1">
                    <Label>Naam nieuwe bouwlaag</Label>
                    <Input
                      value={nieuweBouwlaagNaam}
                      onChange={(e) => setNieuweBouwlaagNaam(e.target.value)}
                      placeholder="bijv. Begane grond"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Niveau</Label>
                    <Input
                      type="number"
                      value={nieuweBouwlaagNiveau}
                      onChange={(e) => setNieuweBouwlaagNiveau(e.target.value)}
                      placeholder="0"
                    />
                    <p className="text-xs text-muted-foreground">
                      Kelder negatief, begane grond 0, verdiepingen oplopend.
                    </p>
                  </div>
                </>
              )}
              <div className="space-y-1">
                <Label>Schaal</Label>
                <Input
                  value={schaal}
                  onChange={(e) => setSchaal(e.target.value)}
                  placeholder="bijv. 1:100"
                />
              </div>
              <div className="space-y-1">
                <Label>Bestand</Label>
                {uploadError && !objectPath ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 space-y-1.5">
                    <p className="text-xs text-destructive flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
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
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={isUploading}
                          onClick={probeerOpnieuw}
                        >
                          Opnieuw proberen
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={isUploading}
                        onClick={() => inputRef.current?.click()}
                      >
                        Ander bestand kiezen
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start font-normal"
                    disabled={isUploading}
                    onClick={() => inputRef.current?.click()}
                  >
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    <span className="truncate">
                      {bestandsnaam || "Kies PDF of afbeelding"}
                    </span>
                  </Button>
                )}
                <BestandsGrootteInfo bytes={bestandGrootte} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Switch
                checked={zichtbaarMonteur}
                onCheckedChange={setZichtbaarMonteur}
              />
              <span>Zichtbaar voor monteur op mobiele app</span>
            </label>
            <p className="text-xs text-muted-foreground">
              Aangevinkt verschijnt dit bestand als leesbaar document voor de
              monteur op de bouwplaats. Documenten maken geen deel uit van het
              opleverrapport.
            </p>
            {fout && <p className="text-sm text-destructive">{fout}</p>}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={opslaan}
                disabled={
                  !naam.trim() ||
                  !objectPath ||
                  maakTekening.isPending ||
                  maakVerdieping.isPending
                }
              >
                {maakTekening.isPending || maakVerdieping.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : null}
                Opslaan
              </Button>
              <Button variant="ghost" size="sm" onClick={reset}>
                Annuleren
              </Button>
            </div>
          </div>
        )}
      </CardContent>
      <TekeningViewer
        open={actief !== null}
        onOpenChange={(o) => {
          if (!o) setActief(null);
        }}
        url={actief?.url ?? ""}
        naam={actief?.naam ?? ""}
      />
    </Card>
  );
}
