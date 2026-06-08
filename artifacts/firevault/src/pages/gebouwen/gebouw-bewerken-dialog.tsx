import { useEffect, useState } from "react";
import {
  useUpdateGebouw,
  useAiAnalyseGebouw,
} from "@workspace/api-client-react";
import type { Gebouw } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, AlertCircle, Sparkles } from "lucide-react";

interface Velden {
  naam: string;
  adres: string;
  stad: string;
  postcode: string;
  omschrijving: string;
  gebouw_type: string;
  aantal_verdiepingen: string;
  hoogte: string;
  breedte: string;
  diepte: string;
  oppervlakte: string;
}

function tekst(v: string | number | null | undefined): string {
  return v == null ? "" : String(v);
}

function getalOfNull(v: string): number | null {
  if (!v.trim()) return null;
  const n = parseFloat(v.replace(",", "."));
  return isFinite(n) ? n : null;
}

function uitGebouw(gebouw: Gebouw): Velden {
  return {
    naam: tekst(gebouw.naam),
    adres: tekst(gebouw.adres),
    stad: tekst(gebouw.stad),
    postcode: tekst(gebouw.postcode),
    omschrijving: tekst(gebouw.omschrijving),
    gebouw_type: tekst(gebouw.gebouw_type),
    aantal_verdiepingen: tekst(gebouw.aantal_verdiepingen),
    hoogte: tekst(gebouw.hoogte),
    breedte: tekst(gebouw.breedte),
    diepte: tekst(gebouw.diepte),
    oppervlakte: tekst(gebouw.oppervlakte),
  };
}

function standaardBeschrijving(gebouw: Gebouw): string {
  const delen = [
    tekst(gebouw.naam),
    tekst(gebouw.adres),
    tekst(gebouw.postcode),
    tekst(gebouw.stad),
  ].filter((d) => d.trim());
  return delen.join(", ");
}

interface Props {
  gebouw: Gebouw;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GebouwBewerkenDialog({ gebouw, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const wijzigGebouw = useUpdateGebouw();
  const aiAnalyse = useAiAnalyseGebouw();

  const [velden, setVelden] = useState<Velden>(() => uitGebouw(gebouw));
  const [foutmelding, setFoutmelding] = useState<string | null>(null);

  const [aiTekst, setAiTekst] = useState("");
  const [satelliet, setSatelliet] = useState<string | null>(null);
  const [aiToelichting, setAiToelichting] = useState<string | null>(null);
  const [aiBetrouwbaarheid, setAiBetrouwbaarheid] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setVelden(uitGebouw(gebouw));
      setFoutmelding(null);
      setAiTekst(standaardBeschrijving(gebouw));
      setSatelliet(null);
      setAiToelichting(null);
      setAiBetrouwbaarheid(null);
    }
  }, [open, gebouw]);

  function zet<K extends keyof Velden>(key: K, waarde: string) {
    setVelden((v) => ({ ...v, [key]: waarde }));
  }

  async function voerAiUit() {
    setFoutmelding(null);
    if (!aiTekst.trim()) {
      setFoutmelding("Beschrijf eerst het gebouw of het adres voordat de AI kan invullen.");
      return;
    }
    try {
      const res = await aiAnalyse.mutateAsync({
        data: { beschrijving: aiTekst },
      });

      if (!res.gevonden) {
        setFoutmelding(res.toelichting ?? "De omschrijving kon niet worden verwerkt.");
        return;
      }

      setSatelliet(res.satelliet_url ?? null);
      setAiToelichting(res.toelichting ?? null);
      setAiBetrouwbaarheid(res.betrouwbaarheid ?? null);

      setVelden((v) => ({
        ...v,
        naam: res.naam ?? v.naam,
        adres: res.adres ?? v.adres,
        stad: res.stad ?? (afleidStad(res.adres_gevonden) || v.stad),
        postcode: res.postcode ?? v.postcode,
        gebouw_type: res.gebouw_type ?? v.gebouw_type,
        omschrijving: res.omschrijving ?? v.omschrijving,
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
      await wijzigGebouw.mutateAsync({
        id: gebouw.id,
        data: {
          naam: velden.naam,
          adres: velden.adres,
          stad: velden.stad || null,
          postcode: velden.postcode || null,
          omschrijving: velden.omschrijving || null,
          gebouw_type: velden.gebouw_type || null,
          aantal_verdiepingen: getalOfNull(velden.aantal_verdiepingen),
          hoogte: getalOfNull(velden.hoogte),
          breedte: getalOfNull(velden.breedte),
          diepte: getalOfNull(velden.diepte),
          oppervlakte: getalOfNull(velden.oppervlakte),
        },
      });
      await queryClient.invalidateQueries();
      onOpenChange(false);
    } catch {
      setFoutmelding("Gebouw kon niet worden opgeslagen.");
    }
  }

  const aiBezig = aiAnalyse.isPending;
  const bezig = wijzigGebouw.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gebouw bewerken</DialogTitle>
          <DialogDescription>
            Pas de gegevens van dit gebouw aan, of laat de AI de afmetingen opnieuw schatten op basis
            van Google Maps en satellietbeeld.
          </DialogDescription>
        </DialogHeader>

        {/* AI-modus */}
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" /> AI-modus
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-ai-beschrijving">Beschrijving</Label>
            <Textarea
              id="b-ai-beschrijving"
              rows={2}
              placeholder="Beschrijf het gebouw of plak een adres. Bijv. 'Coolsingel 40 Rotterdam'."
              value={aiTekst}
              onChange={(e) => setAiTekst(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              De AI schat o.a. hoogte, breedte, diepte en oppervlakte en vult de velden hieronder in.
              Wat u zelf benoemt heeft voorrang; de rest wordt geschat via satellietbeeld.
            </p>
          </div>
          <Button
            type="button"
            variant="default"
            className="w-full sm:w-auto"
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="b-naam">Naam *</Label>
            <Input
              id="b-naam"
              value={velden.naam}
              onChange={(e) => zet("naam", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-adres">Adres *</Label>
            <Input
              id="b-adres"
              placeholder="Coolsingel 40"
              value={velden.adres}
              onChange={(e) => zet("adres", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-postcode">Postcode</Label>
            <Input
              id="b-postcode"
              placeholder="3011 AD"
              value={velden.postcode}
              onChange={(e) => zet("postcode", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-stad">Stad</Label>
            <Input
              id="b-stad"
              placeholder="Rotterdam"
              value={velden.stad}
              onChange={(e) => zet("stad", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-type">Type</Label>
            <Input
              id="b-type"
              placeholder="kantoor, woonhuis..."
              value={velden.gebouw_type}
              onChange={(e) => zet("gebouw_type", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-verdiepingen">Aantal verdiepingen</Label>
            <Input
              id="b-verdiepingen"
              inputMode="numeric"
              value={velden.aantal_verdiepingen}
              onChange={(e) => zet("aantal_verdiepingen", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-hoogte">Hoogte (m)</Label>
            <Input
              id="b-hoogte"
              inputMode="decimal"
              value={velden.hoogte}
              onChange={(e) => zet("hoogte", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-breedte">Breedte (m)</Label>
            <Input
              id="b-breedte"
              inputMode="decimal"
              value={velden.breedte}
              onChange={(e) => zet("breedte", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-diepte">Diepte (m)</Label>
            <Input
              id="b-diepte"
              inputMode="decimal"
              value={velden.diepte}
              onChange={(e) => zet("diepte", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-oppervlakte">Oppervlakte (m²)</Label>
            <Input
              id="b-oppervlakte"
              inputMode="decimal"
              value={velden.oppervlakte}
              onChange={(e) => zet("oppervlakte", e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="b-omschrijving">Omschrijving</Label>
          <Textarea
            id="b-omschrijving"
            rows={3}
            value={velden.omschrijving}
            onChange={(e) => zet("omschrijving", e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={bezig}>
            Annuleren
          </Button>
          <Button onClick={bewaar} disabled={bezig}>
            {bezig ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Opslaan...
              </>
            ) : (
              "Wijzigingen opslaan"
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
