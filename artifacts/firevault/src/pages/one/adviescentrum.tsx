// FPS One — Adviescentrum
// Beheerder dient namens klant een projectaanvraag in, voegt documenten toe
// en start de AI-adviesanalyse. Resultaat is direct zichtbaar in Connect.
import { useState, useRef } from "react";
import {
  useMaakAanvraag,
  useListGebouwen,
  useRequestUploadUrl,
  useCreateDocument,
  useAnalyseerPim,
  useGetPim,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, CheckCircle2, ArrowLeft, Upload, FileText, X, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

type Stap = "formulier" | "documenten" | "analyseren" | "resultaat";

interface UploadBestand {
  bestand: File;
  status: "wacht" | "uploaden" | "gereed" | "fout";
  documentId?: number;
  fout?: string;
}

function AdviesResultaatSectie({ label, items }: { label: string; items: unknown }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{label}</p>
      <ul className="space-y-1">
        {(items as string[]).map((item, i) => (
          <li key={i} className="flex gap-2 text-sm">
            <span className="text-muted-foreground shrink-0">–</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function OneAdviescentrum() {
  const { toast } = useToast();
  const [stap, setStap] = useState<Stap>("formulier");
  const [opdrachtId, setOpdrachtId] = useState<number | null>(null);
  const [gebouwId, setGebouwId] = useState<string>("");
  const [titel, setTitel] = useState("");
  const [vrije_tekst, setVrije_tekst] = useState("");
  const [bestanden, setBestanden] = useState<UploadBestand[]>([]);
  const [uploadBezig, setUploadBezig] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: gebouwenData, isLoading: gebouwenLaden } = useListGebouwen();
  const gebouwen = gebouwenData ?? [];

  const uploadUrlMut = useRequestUploadUrl();
  const createDocMut = useCreateDocument();
  const analyseerMut = useAnalyseerPim();

  const { data: pimData, isLoading: pimLoading } = useGetPim(
    opdrachtId ?? 0,
  );

  const aanvraagMutatie = useMaakAanvraag({
    mutation: {
      onSuccess: (data) => {
        setOpdrachtId(data.opdracht_id);
        setStap("documenten");
      },
      onError: () => {
        toast({ title: "Versturen mislukt", description: "Probeer het opnieuw.", variant: "destructive" });
      },
    },
  });

  function handleVerstuur(e: React.FormEvent) {
    e.preventDefault();
    if (!titel.trim()) {
      toast({ title: "Vul een korte omschrijving in" });
      return;
    }
    aanvraagMutatie.mutate({
      data: {
        titel: titel.trim(),
        gebouw_id: gebouwId ? Number(gebouwId) : undefined,
        aanvraag_via_one: true,
        aanvraag_context: vrije_tekst.trim() ? { vrije_tekst: vrije_tekst.trim() } : undefined,
      },
    });
  }

  function handleBestandenKiezen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const nieuw: UploadBestand[] = files.map((f) => ({ bestand: f, status: "wacht" as const }));
    setBestanden((prev) => [...prev, ...nieuw]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function verwijderBestand(index: number) {
    setBestanden((prev) => prev.filter((_, i) => i !== index));
  }

  async function uploadAllebestanden() {
    if (!opdrachtId) return;
    setUploadBezig(true);
    const bijgewerkt = [...bestanden];

    for (let i = 0; i < bijgewerkt.length; i++) {
      const item = bijgewerkt[i];
      if (item.status === "gereed") continue;

      bijgewerkt[i] = { ...item, status: "uploaden" };
      setBestanden([...bijgewerkt]);

      try {
        // 1. Presigned upload-URL ophalen
        const contentType = item.bestand.type || "application/octet-stream";
        const urlResp = await uploadUrlMut.mutateAsync({
          data: {
            name: item.bestand.name,
            size: item.bestand.size,
            contentType,
            bestand_type: "bijlage",
          },
        });

        // 2. Bestand uploaden naar presigned URL
        await fetch(urlResp.uploadURL, {
          method: "PUT",
          body: item.bestand,
          headers: { "Content-Type": contentType },
        });

        // 3. DMS-document aanmaken (koppeling aan opdracht via Connect)
        const doc = await createDocMut.mutateAsync({
          data: {
            naam: item.bestand.name,
            pdf_url: urlResp.objectPath,
          },
        });

        bijgewerkt[i] = { ...item, status: "gereed", documentId: doc.id };
      } catch (_err) {
        bijgewerkt[i] = { ...item, status: "fout", fout: "Upload mislukt" };
      }

      setBestanden([...bijgewerkt]);
    }

    setUploadBezig(false);
  }

  async function startAnalyse() {
    if (!opdrachtId) return;
    // Upload bestanden die nog niet geüpload zijn
    const nogTeUploaden = bestanden.filter((b) => b.status === "wacht");
    if (nogTeUploaden.length > 0) {
      await uploadAllebestanden();
    }

    setStap("analyseren");
    analyseerMut.mutate(
      { id: opdrachtId },
      {
        onSuccess: () => {
          setStap("resultaat");
          toast({ title: "AI-adviesanalyse voltooid" });
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Analyseer mislukt";
          toast({ title: "Analyse mislukt", description: msg, variant: "destructive" });
          setStap("documenten");
        },
      },
    );
  }

  const adviesCtx = pimData?.advies_context as Record<string, unknown> | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/one/dashboard">
          <button className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Terug naar dashboard
          </button>
        </Link>
      </div>

      <div className="rounded-xl border bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 md:p-8">
        <Badge className="mb-4 bg-white/10 text-white border-white/20 hover:bg-white/20">
          FPS One — Adviescentrum
        </Badge>
        <h1 className="text-2xl font-bold tracking-tight">Projectaanvraag indienen</h1>
        <p className="text-slate-300 mt-2 max-w-xl">
          Omschrijf de brandpreventiebehoefte en voeg documenten toe. De AI analyseert de aanvraag voor de werkvoorbereider.
        </p>
      </div>

      {/* Stap-indicator */}
      {stap !== "formulier" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {["formulier", "documenten", "analyseren", "resultaat"].map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              <span className={`font-medium ${stap === s ? "text-foreground" : ""}`}>
                {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
              {i < 3 && <span>/</span>}
            </span>
          ))}
        </div>
      )}

      {/* Stap 1: Formulier */}
      {stap === "formulier" && (
        <Card>
          <CardHeader className="pb-2 pt-5">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Nieuwe aanvraag
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerstuur} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Korte omschrijving <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="Bijv. Brandwerende doorvoeringen kelder — nieuwbouw"
                  value={titel}
                  onChange={(e) => setTitel(e.target.value)}
                  maxLength={200}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Object / gebouw</label>
                {gebouwenLaden ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select value={gebouwId} onValueChange={setGebouwId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Kies een object (optioneel)" />
                    </SelectTrigger>
                    <SelectContent>
                      {gebouwen.map((g) => (
                        <SelectItem key={g.id} value={String(g.id)}>
                          {g.naam}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Toelichting</label>
                <Textarea
                  placeholder="Beschrijf de situatie, het type werk, de locatie en eventuele bijzonderheden..."
                  value={vrije_tekst}
                  onChange={(e) => setVrije_tekst(e.target.value)}
                  rows={6}
                  maxLength={4000}
                />
                <p className="text-xs text-muted-foreground">{vrije_tekst.length}/4000 tekens</p>
              </div>

              <div className="pt-1">
                <Button
                  type="submit"
                  disabled={aanvraagMutatie.isPending || !titel.trim()}
                  className="w-full sm:w-auto"
                >
                  {aanvraagMutatie.isPending ? "Registreren..." : "Doorgaan naar documenten"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Stap 2: Documenten uploaden */}
      {stap === "documenten" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2 pt-5">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4 text-primary" />
                Documenten toevoegen
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Voeg tekeningen, rapporten of foto&apos;s toe die de AI kan analyseren. Dit is optioneel — u kunt ook direct de analyse starten.
              </p>

              {/* Upload-zone */}
              <div
                className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Klik om bestanden te kiezen</p>
                <p className="text-xs text-muted-foreground mt-1">PDF, afbeeldingen (JPG, PNG) — max. 25 MB per bestand</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={handleBestandenKiezen}
                />
              </div>

              {/* Bestandslijst */}
              {bestanden.length > 0 && (
                <ul className="space-y-2">
                  {bestanden.map((item, i) => (
                    <li key={i} className="flex items-center gap-3 p-2.5 rounded-md bg-muted/40 border text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{item.bestand.name}</span>
                      {item.status === "uploaden" && (
                        <span className="text-xs text-muted-foreground">Uploaden...</span>
                      )}
                      {item.status === "gereed" && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      )}
                      {item.status === "fout" && (
                        <span className="flex items-center gap-1 text-xs text-destructive">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {item.fout}
                        </span>
                      )}
                      {item.status === "wacht" && (
                        <button
                          onClick={() => verwijderBestand(i)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {uploadBezig && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Bestanden uploaden...</p>
                  <Progress value={undefined} className="h-1.5" />
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <Button
                  onClick={startAnalyse}
                  disabled={uploadBezig || analyseerMut.isPending}
                  className="w-full sm:w-auto"
                >
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  {analyseerMut.isPending ? "Analyseren..." : "Analyse starten"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setStap("formulier")}
                  disabled={uploadBezig}
                  className="text-muted-foreground"
                >
                  Terug
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-50/50 border-slate-200">
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Aanvraag geregistreerd met referentienummer <strong>{opdrachtId}</strong>. U kunt de analyse ook later starten vanuit FPS Connect onder Opdrachten.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stap 3: Analyseren */}
      {stap === "analyseren" && (
        <Card>
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-primary animate-pulse" />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold">AI analyseert de aanvraag</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                De documenten en toelichting worden verwerkt. Dit duurt doorgaans 15 tot 45 seconden.
              </p>
            </div>
            <Progress value={undefined} className="h-1.5 max-w-xs mx-auto" />
          </CardContent>
        </Card>
      )}

      {/* Stap 4: Resultaat */}
      {stap === "resultaat" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-5 pb-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
              <div>
                <p className="text-sm font-medium">AI-analyse voltooid</p>
                <p className="text-xs text-muted-foreground">
                  Referentie {opdrachtId} — de werkvoorbereider ziet het advies direct in FPS Connect.
                </p>
              </div>
            </CardContent>
          </Card>

          {pimLoading && (
            <Card>
              <CardContent className="pt-5 space-y-3">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </CardContent>
            </Card>
          )}

          {adviesCtx && (
            <Card>
              <CardHeader className="pb-2 pt-5">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  AI-adviesresultaat
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Aanbeveling */}
                {Boolean(adviesCtx.aanbeveling) && (
                  <div className="rounded-md bg-primary/5 border border-primary/20 p-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Aanbeveling</p>
                    <p className="text-sm font-medium capitalize">
                      {String(adviesCtx.aanbeveling).replace(/_/g, " ")}
                    </p>
                    {Boolean(adviesCtx.aanbeveling_toelichting) && (
                      <p className="text-sm text-muted-foreground mt-1">{String(adviesCtx.aanbeveling_toelichting)}</p>
                    )}
                  </div>
                )}

                <AdviesResultaatSectie label="Aangevraagde werkzaamheden" items={adviesCtx.werkzaamheden} />
                <AdviesResultaatSectie label="Herkende locaties" items={adviesCtx.locaties} />
                <AdviesResultaatSectie label="Risico's en aandachtspunten" items={adviesCtx.risicos} />
                <AdviesResultaatSectie label="Ontbrekende informatie" items={adviesCtx.ontbrekende_info} />
                <AdviesResultaatSectie label="Open vragen" items={adviesCtx.vragen} />

                {adviesCtx.vop_aandachtspunt === true && (
                  <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                    <strong>VOP-aandachtspunt:</strong> Inzet van een VOP-gecertificeerd monteur is vereist.
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setStap("formulier");
                setTitel("");
                setGebouwId("");
                setVrije_tekst("");
                setOpdrachtId(null);
                setBestanden([]);
              }}
            >
              Nieuwe aanvraag
            </Button>
            <Link href="/one/dashboard">
              <Button>Terug naar dashboard</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
