// FPS One — Adviescentrum
// Klant dient een projectaanvraag in; FPS-beheerder analyseert via Connect.
import { useState } from "react";
import {
  useMaakAanvraag,
  useListGebouwen,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, CheckCircle2, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

type Stap = "formulier" | "bevestigd";

export default function OneAdviescentrum() {
  const { toast } = useToast();
  const [stap, setStap] = useState<Stap>("formulier");
  const [opdrachtnummer, setOpdrachtnummer] = useState<number | null>(null);

  const [gebouwId, setGebouwId] = useState<string>("");
  const [titel, setTitel] = useState("");
  const [vrije_tekst, setVrije_tekst] = useState("");

  const { data: gebouwenData, isLoading: gebouwenLaden } = useListGebouwen();
  const gebouwen = gebouwenData ?? [];

  const aanvraagMutatie = useMaakAanvraag({
    mutation: {
      onSuccess: (data) => {
        setOpdrachtnummer(data.opdracht_id);
        setStap("bevestigd");
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
          Omschrijf uw brandpreventiebehoefte. FPS analyseert de aanvraag en neemt contact met u op.
        </p>
      </div>

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
                  Korte omschrijving van de aanvraag <span className="text-destructive">*</span>
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
                  {aanvraagMutatie.isPending ? "Versturen..." : "Aanvraag versturen"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {stap === "bevestigd" && (
        <Card>
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold">Aanvraag ontvangen</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                Uw aanvraag is geregistreerd{opdrachtnummer ? ` (referentienummer: ${opdrachtnummer})` : ""}. FPS neemt zo snel mogelijk contact met u op.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setStap("formulier");
                  setTitel("");
                  setGebouwId("");
                  setVrije_tekst("");
                  setOpdrachtnummer(null);
                }}
              >
                Nieuwe aanvraag
              </Button>
              <Link href="/one/dashboard">
                <Button>Terug naar dashboard</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-slate-50/50 border-slate-200">
        <CardContent className="pt-5 pb-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong>Documenten bijvoegen?</strong> Stuur uw tekeningen, rapporten of foto's per e-mail mee of
            geef aan in de toelichting dat u bijlagen heeft — FPS vraagt ze op bij de opname.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
