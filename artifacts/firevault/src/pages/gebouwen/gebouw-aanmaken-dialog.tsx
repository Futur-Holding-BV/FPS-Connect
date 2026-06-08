import { useState } from "react";
import {
  useCreateGebouw,
  useAiAnalyseGebouw,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Sparkles, Loader2, AlertCircle } from "lucide-react";

interface Velden {
  naam: string;
  adres: string;
  stad: string;
  postcode: string;
  omschrijving: string;
  bouwjaar: string;
  gebouw_type: string;
  aantal_verdiepingen: string;
  hoogte: string;
  breedte: string;
  diepte: string;
  oppervlakte: string;
}

const LEEG: Velden = {
  naam: "",
  adres: "",
  stad: "",
  postcode: "",
  omschrijving: "",
  bouwjaar: "",
  gebouw_type: "",
  aantal_verdiepingen: "",
  hoogte: "",
  breedte: "",
  diepte: "",
  oppervlakte: "",
};

function getalOfUndefined(v: string): number | undefined {
  const n = parseFloat(v.replace(",", "."));
  return isFinite(n) ? n : undefined;
}

export function GebouwAanmakenDialog() {
  const queryClient = useQueryClient();
  const maakGebouw = useCreateGebouw();
  const aiAnalyse = useAiAnalyseGebouw();

  const [open, setOpen] = useState(false);
  const [velden, setVelden] = useState<Velden>(LEEG);
  const [satelliet, setSatelliet] = useState<string | null>(null);
  const [aiToelichting, setAiToelichting] = useState<string | null>(null);
  const [aiBetrouwbaarheid, setAiBetrouwbaarheid] = useState<string | null>(null);
  const [foutmelding, setFoutmelding] = useState<string | null>(null);

  function zet<K extends keyof Velden>(key: K, waarde: string) {
    setVelden((v) => ({ ...v, [key]: waarde }));
  }

  function herstel() {
    setVelden(LEEG);
    setSatelliet(null);
    setAiToelichting(null);
    setAiBetrouwbaarheid(null);
    setFoutmelding(null);
  }

  async function voerAiUit() {
    setFoutmelding(null);
    if (!velden.adres.trim()) {
      setFoutmelding("Vul eerst een adres in voordat de AI kan analyseren.");
      return;
    }
    try {
      const res = await aiAnalyse.mutateAsync({
        data: {
          adres: velden.adres,
          stad: velden.stad || undefined,
          postcode: velden.postcode || undefined,
        },
      });

      if (!res.gevonden) {
        setFoutmelding(res.toelichting ?? "Adres kon niet worden gevonden.");
        return;
      }

      setSatelliet(res.satelliet_url ?? null);
      setAiToelichting(res.toelichting ?? null);
      setAiBetrouwbaarheid(res.betrouwbaarheid ?? null);

      setVelden((v) => ({
        ...v,
        naam: v.naam || (res.adres_gevonden ? res.adres_gevonden.split(",")[0] : v.naam),
        stad: v.stad || afleidStad(res.adres_gevonden),
        gebouw_type: res.gebouw_type ?? v.gebouw_type,
        omschrijving: v.omschrijving || (res.omschrijving ?? ""),
        bouwjaar: res.bouwjaar != null ? String(res.bouwjaar) : v.bouwjaar,
        aantal_verdiepingen:
          res.aantal_verdiepingen != null ? String(res.aantal_verdiepingen) : v.aantal_verdiepingen,
        hoogte: res.hoogte != null ? String(Math.round(res.hoogte * 10) / 10) : v.hoogte,
        breedte: res.breedte != null ? String(Math.round(res.breedte * 10) / 10) : v.breedte,
        diepte: res.diepte != null ? String(Math.round(res.diepte * 10) / 10) : v.diepte,
        oppervlakte: res.oppervlakte != null ? String(Math.round(res.oppervlakte)) : v.oppervlakte,
      }));
    } catch {
      setFoutmelding("AI-analyse mislukte. Probeer het opnieuw of vul handmatig in.");
    }
  }

  async function bewaar() {
    setFoutmelding(null);
    if (!velden.naam.trim() || !velden.adres.trim()) {
      setFoutmelding("Naam en adres zijn verplicht.");
      return;
    }
    try {
      await maakGebouw.mutateAsync({
        data: {
          naam: velden.naam,
          adres: velden.adres,
          stad: velden.stad || undefined,
          postcode: velden.postcode || undefined,
          omschrijving: velden.omschrijving || undefined,
          bouwjaar: getalOfUndefined(velden.bouwjaar),
          gebouw_type: velden.gebouw_type || undefined,
          aantal_verdiepingen: getalOfUndefined(velden.aantal_verdiepingen),
          hoogte: getalOfUndefined(velden.hoogte),
          breedte: getalOfUndefined(velden.breedte),
          diepte: getalOfUndefined(velden.diepte),
          oppervlakte: getalOfUndefined(velden.oppervlakte),
        },
      });
      await queryClient.invalidateQueries();
      herstel();
      setOpen(false);
    } catch {
      setFoutmelding("Gebouw kon niet worden opgeslagen.");
    }
  }

  const aiBezig = aiAnalyse.isPending;
  const bewaarBezig = maakGebouw.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) herstel();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" /> Nieuw gebouw
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nieuw gebouw aanmaken</DialogTitle>
          <DialogDescription>
            Vul het adres in en laat de AI de gebouwgegevens schatten op basis van
            Google Maps en satellietbeeld, of vul alles handmatig in.
          </DialogDescription>
        </DialogHeader>

        {/* AI-modus */}
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" /> AI-modus
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="ai-adres">Adres</Label>
              <Input
                id="ai-adres"
                placeholder="Bijv. Coolsingel 40"
                value={velden.adres}
                onChange={(e) => zet("adres", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-postcode">Postcode</Label>
              <Input
                id="ai-postcode"
                placeholder="3011 AD"
                value={velden.postcode}
                onChange={(e) => zet("postcode", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="ai-stad">Stad</Label>
              <Input
                id="ai-stad"
                placeholder="Rotterdam"
                value={velden.stad}
                onChange={(e) => zet("stad", e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="default"
                className="w-full"
                onClick={voerAiUit}
                disabled={aiBezig}
              >
                {aiBezig ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyseren...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" /> AI invullen
                  </>
                )}
              </Button>
            </div>
          </div>

          {satelliet && (
            <div className="flex gap-3 items-start pt-1">
              <img
                src={satelliet}
                alt="Satellietbeeld"
                className="h-24 w-24 rounded-md object-cover border shrink-0"
              />
              <div className="text-xs text-muted-foreground space-y-1">
                {aiBetrouwbaarheid && (
                  <Badge variant="secondary" className="text-xs">
                    Betrouwbaarheid: {aiBetrouwbaarheid}
                  </Badge>
                )}
                {aiToelichting && <p>{aiToelichting}</p>}
              </div>
            </div>
          )}
        </div>

        {foutmelding && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" /> {foutmelding}
          </div>
        )}

        <Separator />

        {/* Gegevens */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="g-naam">Naam *</Label>
            <Input
              id="g-naam"
              value={velden.naam}
              onChange={(e) => zet("naam", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-type">Type</Label>
            <Input
              id="g-type"
              placeholder="kantoor, woonhuis..."
              value={velden.gebouw_type}
              onChange={(e) => zet("gebouw_type", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-bouwjaar">Bouwjaar</Label>
            <Input
              id="g-bouwjaar"
              inputMode="numeric"
              value={velden.bouwjaar}
              onChange={(e) => zet("bouwjaar", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-verdiepingen">Aantal verdiepingen</Label>
            <Input
              id="g-verdiepingen"
              inputMode="numeric"
              value={velden.aantal_verdiepingen}
              onChange={(e) => zet("aantal_verdiepingen", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-hoogte">Hoogte (m)</Label>
            <Input
              id="g-hoogte"
              inputMode="decimal"
              value={velden.hoogte}
              onChange={(e) => zet("hoogte", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-oppervlakte">Oppervlakte (m²)</Label>
            <Input
              id="g-oppervlakte"
              inputMode="decimal"
              value={velden.oppervlakte}
              onChange={(e) => zet("oppervlakte", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-breedte">Breedte (m)</Label>
            <Input
              id="g-breedte"
              inputMode="decimal"
              value={velden.breedte}
              onChange={(e) => zet("breedte", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-diepte">Diepte (m)</Label>
            <Input
              id="g-diepte"
              inputMode="decimal"
              value={velden.diepte}
              onChange={(e) => zet("diepte", e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="g-omschrijving">Omschrijving</Label>
            <Textarea
              id="g-omschrijving"
              rows={2}
              value={velden.omschrijving}
              onChange={(e) => zet("omschrijving", e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={bewaarBezig}>
            Annuleren
          </Button>
          <Button onClick={bewaar} disabled={bewaarBezig}>
            {bewaarBezig ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Opslaan...
              </>
            ) : (
              "Gebouw opslaan"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function afleidStad(adresGevonden: string | null | undefined): string {
  if (!adresGevonden) return "";
  const delen = adresGevonden.split(",").map((d) => d.trim());
  if (delen.length >= 2) {
    const stadDeel = delen[delen.length - 2];
    return stadDeel.replace(/^\d{4}\s?[A-Za-z]{0,2}\s*/, "").trim();
  }
  return "";
}
