import { useState } from "react";
import {
  useCreateGebouw,
  useAiAnalyseGebouw,
  type ErrorType,
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
  projectnummer: string;
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

const LEEG: Velden = {
  projectnummer: "",
  naam: "",
  adres: "",
  stad: "",
  postcode: "",
  omschrijving: "",
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
  const [aiTekst, setAiTekst] = useState("");
  const [satelliet, setSatelliet] = useState<string | null>(null);
  const [aiToelichting, setAiToelichting] = useState<string | null>(null);
  const [aiBetrouwbaarheid, setAiBetrouwbaarheid] = useState<string | null>(null);
  const [foutmelding, setFoutmelding] = useState<string | null>(null);

  function zet<K extends keyof Velden>(key: K, waarde: string) {
    setVelden((v) => ({ ...v, [key]: waarde }));
  }

  function herstel() {
    setVelden(LEEG);
    setAiTekst("");
    setSatelliet(null);
    setAiToelichting(null);
    setAiBetrouwbaarheid(null);
    setFoutmelding(null);
  }

  function beschrijvingUitVelden(): string {
    const delen = [
      velden.naam,
      velden.adres,
      [velden.postcode, velden.stad].filter(Boolean).join(" "),
      velden.gebouw_type,
    ]
      .map((d) => d.trim())
      .filter(Boolean);
    return delen.join(", ");
  }

  async function voerAiUit() {
    setFoutmelding(null);
    const basis = aiTekst.trim() || beschrijvingUitVelden();
    if (!basis) {
      setFoutmelding(
        "Vul eerst minimaal een naam of adres in (of beschrijf het gebouw hierboven) voordat de AI kan aanvullen.",
      );
      return;
    }
    try {
      const res = await aiAnalyse.mutateAsync({
        data: { beschrijving: basis },
      });

      if (!res.gevonden) {
        setFoutmelding(res.toelichting ?? "De omschrijving kon niet worden verwerkt.");
        return;
      }

      setSatelliet(res.satelliet_url ?? null);
      setAiToelichting(res.toelichting ?? null);
      setAiBetrouwbaarheid(res.betrouwbaarheid ?? null);

      // Alleen lege velden aanvullen — door de gebruiker ingevulde gegevens
      // blijven altijd staan.
      const vul = (huidig: string, nieuw: string | null | undefined): string =>
        huidig.trim() ? huidig : (nieuw ?? "");

      setVelden((v) => ({
        ...v,
        naam: vul(
          v.naam,
          res.naam ?? (res.adres_gevonden ? res.adres_gevonden.split(",")[0] : null),
        ),
        adres: vul(v.adres, res.adres),
        stad: vul(v.stad, res.stad ?? (res.adres_gevonden ? afleidStad(res.adres_gevonden) : null)),
        postcode: vul(v.postcode, res.postcode),
        gebouw_type: vul(v.gebouw_type, res.gebouw_type),
        omschrijving: vul(v.omschrijving, res.omschrijving),
        aantal_verdiepingen: vul(
          v.aantal_verdiepingen,
          res.aantal_verdiepingen != null ? String(res.aantal_verdiepingen) : null,
        ),
        hoogte: vul(v.hoogte, res.hoogte != null ? String(Math.round(res.hoogte * 10) / 10) : null),
        breedte: vul(v.breedte, res.breedte != null ? String(Math.round(res.breedte * 10) / 10) : null),
        diepte: vul(v.diepte, res.diepte != null ? String(Math.round(res.diepte * 10) / 10) : null),
        oppervlakte: vul(
          v.oppervlakte,
          res.oppervlakte != null ? String(Math.round(res.oppervlakte)) : null,
        ),
      }));
    } catch (err) {
      const apiErr = err as ErrorType<{ error?: string }>;
      const melding =
        apiErr?.data?.error ||
        (apiErr?.status === 500
          ? "De AI-service is tijdelijk niet beschikbaar. Controleer de API-sleutels of vul de velden handmatig in."
          : apiErr?.status === 401 || apiErr?.status === 403
            ? "Geen toegang tot de AI-functie."
            : "AI-analyse mislukte. Probeer het opnieuw of vul de velden handmatig in.");
      setFoutmelding(melding);
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
          projectnummer: velden.projectnummer.trim() || undefined,
          naam: velden.naam,
          adres: velden.adres,
          stad: velden.stad || undefined,
          postcode: velden.postcode || undefined,
          omschrijving: velden.omschrijving || undefined,
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
    } catch (err) {
      const fout = err as { status?: number; data?: { error?: string } };
      if (fout?.status === 409) {
        setFoutmelding(
          fout.data?.error ?? "Dit nummer is al in gebruik. Kies een uniek nummer.",
        );
      } else {
        setFoutmelding("Gebouw kon niet worden opgeslagen.");
      }
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
            Beschrijf het gebouw of het adres en laat de AI de gebouwgegevens schatten op basis van
            Google Maps en satellietbeeld, of vul alles handmatig in.
          </DialogDescription>
        </DialogHeader>

        {/* AI-modus */}
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" /> AI-modus
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-beschrijving">Beschrijving (optioneel)</Label>
            <Textarea
              id="ai-beschrijving"
              rows={3}
              placeholder="Bijv. 'Colosseum Enschede', 'kantoorpand Stationsplein 1 Utrecht' of 'schoolgebouw De Regenboog Zwolle'."
              value={aiTekst}
              onChange={(e) => setAiTekst(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Laat dit veld leeg om de AI te laten aanvullen op basis van de velden
              die u hieronder al hebt ingevuld (naam, adres, postcode, stad of type),
              of beschrijf het gebouw hier zelf. Alleen lege velden worden aangevuld;
              wat u zelf invult blijft staan.
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
                <Sparkles className="h-4 w-4 mr-2" /> AI aanvullen
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
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <p>{foutmelding}</p>
              {velden !== LEEG && (
                <button
                  type="button"
                  className="underline text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setVelden(LEEG)}
                >
                  Velden wissen en handmatig invullen
                </button>
              )}
            </div>
          </div>
        )}

        <Separator />

        {/* Gegevens */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="g-projectnummer">Projectnummer</Label>
            <Input
              id="g-projectnummer"
              placeholder="bijv. P-2026-014"
              value={velden.projectnummer}
              onChange={(e) => zet("projectnummer", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Uniek projectnummer, getoond als "projectnummer - naam".
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-naam">Naam *</Label>
            <Input
              id="g-naam"
              value={velden.naam}
              onChange={(e) => zet("naam", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-adres">Adres *</Label>
            <Input
              id="g-adres"
              placeholder="bijv. Kerkstraat 10"
              value={velden.adres}
              onChange={(e) => zet("adres", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-postcode">Postcode</Label>
            <Input
              id="g-postcode"
              placeholder="bijv. 1234 AB"
              value={velden.postcode}
              onChange={(e) => zet("postcode", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-stad">Stad</Label>
            <Input
              id="g-stad"
              placeholder="bijv. Amsterdam"
              value={velden.stad}
              onChange={(e) => zet("stad", e.target.value)}
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
