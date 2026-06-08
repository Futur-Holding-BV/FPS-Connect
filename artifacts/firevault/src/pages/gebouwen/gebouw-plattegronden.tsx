import { useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Link } from "wouter";
import {
  useCreateVerdieping,
  useUpdateVerdieping,
  useAiAnalysePlattegrond,
} from "@workspace/api-client-react";
import type {
  Verdieping,
  PlattegrondAiAnalyseResultaat,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Map,
  Loader2,
  Plus,
  Upload,
  Sparkles,
  ExternalLink,
} from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const NIEUWE_BOUWLAAG = "nieuw";

// Rendert de eerste pagina van een PDF of een afbeelding naar een data-URL
// die geschikt is voor vision-analyse (langste zijde gemaximeerd op 1600px).
async function bestandNaarAfbeelding(file: File): Promise<string> {
  let bron: HTMLCanvasElement;
  if (file.type === "application/pdf") {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Geen canvas context");
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    bron = canvas;
  } else {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Afbeelding laden mislukt"));
      i.src = URL.createObjectURL(file);
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Geen canvas context");
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(img.src);
    bron = canvas;
  }
  const MAX = 1600;
  const schaal = Math.min(1, MAX / Math.max(bron.width, bron.height));
  if (schaal < 1) {
    const klein = document.createElement("canvas");
    klein.width = Math.round(bron.width * schaal);
    klein.height = Math.round(bron.height * schaal);
    const ctx = klein.getContext("2d");
    if (!ctx) throw new Error("Geen canvas context");
    ctx.drawImage(bron, 0, 0, klein.width, klein.height);
    return klein.toDataURL("image/jpeg", 0.85);
  }
  return bron.toDataURL("image/jpeg", 0.85);
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
  const maakVerdieping = useCreateVerdieping();
  const updateVerdieping = useUpdateVerdieping();
  const analyse = useAiAnalysePlattegrond();
  const { uploadFile, isUploading } = useUpload();

  const inputRef = useRef<HTMLInputElement>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [bestandsnaam, setBestandsnaam] = useState("");
  const [objectPath, setObjectPath] = useState("");
  const [renderBezig, setRenderBezig] = useState(false);
  const [verdiepingId, setVerdiepingId] = useState<string>(NIEUWE_BOUWLAAG);
  const [nieuweNaam, setNieuweNaam] = useState("");
  const [nieuwNiveau, setNieuwNiveau] = useState("0");
  const [aiVoorstel, setAiVoorstel] =
    useState<PlattegrondAiAnalyseResultaat | null>(null);
  const [fout, setFout] = useState("");

  const gesorteerd = [...verdiepingen].sort((a, b) => a.niveau - b.niveau);

  async function analyseer(afbeelding: string) {
    try {
      const res = await analyse.mutateAsync({
        id: gebouwId,
        data: { afbeelding },
      });
      setAiVoorstel(res);
      if (res.bestaande_verdieping_id != null) {
        setVerdiepingId(String(res.bestaande_verdieping_id));
      } else {
        setVerdiepingId(NIEUWE_BOUWLAAG);
        if (res.bouwlaag_naam) setNieuweNaam(res.bouwlaag_naam);
        if (res.bouwlaag_niveau != null) setNieuwNiveau(String(res.bouwlaag_niveau));
      }
    } catch {
      // AI-voorstel is optioneel; bij een fout blijft handmatig invullen mogelijk.
    }
  }

  async function kiesBestand(file: File) {
    setFout("");
    setBestandsnaam(file.name);
    setObjectPath("");
    setAiVoorstel(null);
    try {
      setRenderBezig(true);
      const afbeelding = await bestandNaarAfbeelding(file);
      setRenderBezig(false);
      const [upload] = await Promise.all([uploadFile(file), analyseer(afbeelding)]);
      if (!upload) {
        setFout("Uploaden mislukt. Probeer het opnieuw.");
        return;
      }
      setObjectPath(upload.objectPath);
    } catch {
      setRenderBezig(false);
      setFout("Bestand verwerken mislukt. Kies een PDF of afbeelding.");
    }
  }

  function reset() {
    setFormOpen(false);
    setBestandsnaam("");
    setObjectPath("");
    setRenderBezig(false);
    setVerdiepingId(NIEUWE_BOUWLAAG);
    setNieuweNaam("");
    setNieuwNiveau("0");
    setAiVoorstel(null);
    setFout("");
  }

  async function opslaan() {
    if (!objectPath) {
      setFout("Upload eerst een plattegrond.");
      return;
    }
    setFout("");
    try {
      if (verdiepingId === NIEUWE_BOUWLAAG) {
        if (!nieuweNaam.trim()) {
          setFout("Geef de nieuwe bouwlaag een naam.");
          return;
        }
        await maakVerdieping.mutateAsync({
          id: gebouwId,
          data: {
            naam: nieuweNaam.trim(),
            niveau: Number(nieuwNiveau) || 0,
            plattegrond_url: objectPath,
          },
        });
      } else {
        await updateVerdieping.mutateAsync({
          id: Number(verdiepingId),
          data: { plattegrond_url: objectPath },
        });
      }
      reset();
      queryClient.invalidateQueries();
    } catch {
      setFout("Opslaan mislukt. Probeer het opnieuw.");
    }
  }

  const aiBezig = analyse.isPending;
  const opslaanBezig = maakVerdieping.isPending || updateVerdieping.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Map className="h-5 w-5 text-primary" /> Plattegronden
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Upload een plattegrond per bouwlaag. De AI bepaalt de bouwlaag en de
          plattegrond wordt meteen de ondergrond voor het plaatsen van
          voorzieningen.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {gesorteerd.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nog geen bouwlagen. Upload een plattegrond om een bouwlaag aan te
            maken.
          </p>
        ) : (
          <ul className="space-y-2">
            {gesorteerd.map((v) => {
              const heeft = Boolean(v.plattegrond_url);
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
                  {heeft && (
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
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {isBeheerder && !formOpen && (
          <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Plattegrond toevoegen
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

            <div className="space-y-1">
              <Label>Plattegrond</Label>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start font-normal"
                disabled={isUploading || renderBezig}
                onClick={() => inputRef.current?.click()}
              >
                {isUploading || renderBezig ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                <span className="truncate">
                  {bestandsnaam || "Kies PDF of afbeelding"}
                </span>
              </Button>
            </div>

            {aiBezig && (
              <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                AI bepaalt de bouwlaag...
              </div>
            )}

            {aiVoorstel && !aiBezig && (
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
                  Controleer en pas zo nodig de bouwlaag hieronder aan.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Bouwlaag</Label>
                <Select value={verdiepingId} onValueChange={setVerdiepingId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NIEUWE_BOUWLAAG}>
                      Nieuwe bouwlaag aanmaken
                    </SelectItem>
                    {gesorteerd.map((v) => (
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
                      value={nieuweNaam}
                      onChange={(e) => setNieuweNaam(e.target.value)}
                      placeholder="bijv. Begane grond"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Niveau</Label>
                    <Input
                      type="number"
                      value={nieuwNiveau}
                      onChange={(e) => setNieuwNiveau(e.target.value)}
                      placeholder="0"
                    />
                    <p className="text-xs text-muted-foreground">
                      Kelder negatief, begane grond 0, verdiepingen oplopend.
                    </p>
                  </div>
                </>
              )}
            </div>

            {fout && <p className="text-sm text-destructive">{fout}</p>}

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={opslaan}
                disabled={!objectPath || isUploading || renderBezig || opslaanBezig}
              >
                {opslaanBezig ? (
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
    </Card>
  );
}
