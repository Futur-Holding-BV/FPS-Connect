import { useRef, useState } from "react";
import {
  useCreateGebouw,
  useAiAnalyseGebouw,
  useListWerkgevers,
  type ErrorType,
  type GebouwSuggestie,
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
import { Plus, Sparkles, Loader2, AlertCircle, TriangleAlert } from "lucide-react";
import { GebouwAiSuggesties } from "./gebouw-ai-suggesties";

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

// Velden die door de AI mogen worden ingevuld (projectnummer nooit).
type AiVeld = Exclude<keyof Velden, "projectnummer">;
const AI_VELDEN: AiVeld[] = [
  "naam",
  "adres",
  "stad",
  "postcode",
  "omschrijving",
  "gebouw_type",
  "aantal_verdiepingen",
  "hoogte",
  "breedte",
  "diepte",
  "oppervlakte",
];

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

function metHoofdletters(v: string): string {
  return v.replace(/(^|[\s'-])([a-zà-ÿ])/g, (_, sep, letter) => sep + letter.toUpperCase());
}

export function GebouwAanmakenDialog() {
  const queryClient = useQueryClient();
  const maakGebouw = useCreateGebouw();
  const aiAnalyse = useAiAnalyseGebouw();
  const { data: werkgevers } = useListWerkgevers();

  const [open, setOpen] = useState(false);
  const [velden, setVelden] = useState<Velden>(LEEG);
  const [werkgeverId, setWerkgeverId] = useState<number | null>(null);
  // Bijhouden welke velden door de AI zijn ingevuld; door de gebruiker getypte
  // velden blijven altijd staan en worden nooit door een nieuwe AI-run overschreven.
  // Bewust een ref (niet in de render gebruikt): zo lezen we tijdens een lopend
  // AI-verzoek altijd de actuele eigendomsstatus, ook als de gebruiker ondertussen typt.
  const aiVeldenRef = useRef<Set<keyof Velden>>(new Set());
  const [aiTekst, setAiTekst] = useState("");
  // De beschrijving die het huidige AI-resultaat opleverde; wijkt de invoer hiervan
  // af, dan zijn de eerdere voorstellen verouderd.
  const [laatsteAiTekst, setLaatsteAiTekst] = useState<string | null>(null);
  const [suggesties, setSuggesties] = useState<GebouwSuggestie[]>([]);
  const [satelliet, setSatelliet] = useState<string | null>(null);
  const [aiToelichting, setAiToelichting] = useState<string | null>(null);
  const [aiBetrouwbaarheid, setAiBetrouwbaarheid] = useState<string | null>(null);
  const [geschatteAfmetingen, setGeschatteAfmetingen] = useState(false);
  const [foutmelding, setFoutmelding] = useState<string | null>(null);

  // Door de gebruiker getypt: het veld wordt nu door de gebruiker beheerd.
  function zet<K extends keyof Velden>(key: K, waarde: string) {
    setVelden((v) => ({ ...v, [key]: waarde }));
    aiVeldenRef.current.delete(key);
  }

  // Alleen hoofdletter-normalisatie bij blur; verandert het eigenaarschap niet.
  function zetMetHoofdletters<K extends keyof Velden>(key: K) {
    setVelden((v) => ({ ...v, [key]: metHoofdletters(String(v[key])) }));
  }

  // Wis alle door de AI ingevulde velden (laat door de gebruiker getypte velden staan).
  function wisAiVelden() {
    const teWissen = Array.from(aiVeldenRef.current);
    setVelden((prev) => {
      const next = { ...prev };
      for (const key of teWissen) next[key] = "";
      return next;
    });
    aiVeldenRef.current = new Set();
  }

  function herstel() {
    setVelden(LEEG);
    setWerkgeverId(null);
    aiVeldenRef.current = new Set();
    setAiTekst("");
    setLaatsteAiTekst(null);
    setSuggesties([]);
    setSatelliet(null);
    setAiToelichting(null);
    setAiBetrouwbaarheid(null);
    setGeschatteAfmetingen(false);
    setFoutmelding(null);
  }

  // De ingevoerde beschrijving wijkt af van wat het huidige resultaat opleverde.
  const voorstellenVerouderd =
    laatsteAiTekst !== null && aiTekst.trim() !== laatsteAiTekst.trim();

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

  async function voerAiUit(overrideTekst?: string) {
    setFoutmelding(null);
    const invoer = overrideTekst ?? aiTekst;
    const basis = invoer.trim() || beschrijvingUitVelden();
    if (!basis) {
      setFoutmelding(
        "Vul eerst minimaal een naam of adres in (of beschrijf het gebouw hierboven) voordat de AI kan aanvullen.",
      );
      return;
    }
    // Een nieuwe zoekopdracht: eerdere voorstellen en hulpinfo zijn niet langer geldig.
    setSuggesties([]);
    setSatelliet(null);
    setAiToelichting(null);
    setAiBetrouwbaarheid(null);
    setGeschatteAfmetingen(false);
    try {
      const res = await aiAnalyse.mutateAsync({
        data: { beschrijving: basis },
      });

      // Markeer dit als de tekst die het huidige resultaat opleverde.
      if (overrideTekst !== undefined) setAiTekst(overrideTekst);
      setLaatsteAiTekst(invoer);

      if (!res.gevonden) {
        // Geen geldig resultaat: oude AI-velden wissen zodat verouderde gegevens niet blijven staan.
        wisAiVelden();
        setFoutmelding(res.toelichting ?? "De omschrijving kon niet worden verwerkt.");
        return;
      }

      // Onduidelijke invoer: toon de keuzelijst en wis oude AI-velden. De gebruiker
      // kiest eerst de juiste locatie voordat er iets wordt ingevuld.
      if (res.meerdere && res.suggesties && res.suggesties.length > 0) {
        wisAiVelden();
        setSuggesties(res.suggesties);
        setAiToelichting(res.toelichting ?? null);
        return;
      }

      setSatelliet(res.satelliet_url ?? null);
      setAiToelichting(res.toelichting ?? null);
      setAiBetrouwbaarheid(res.betrouwbaarheid ?? null);

      // Nieuwe AI-waarden per veld. Leeg ("") betekent: de AI heeft hiervoor niets gevonden.
      const nieuw: Record<(typeof AI_VELDEN)[number], string> = {
        naam: res.naam ?? (res.adres_gevonden ? res.adres_gevonden.split(",")[0] ?? "" : ""),
        adres: res.adres ?? "",
        stad: res.stad ?? (res.adres_gevonden ? afleidStad(res.adres_gevonden) : ""),
        postcode: res.postcode ?? "",
        gebouw_type: res.gebouw_type ?? "",
        omschrijving: res.omschrijving ?? "",
        aantal_verdiepingen: res.aantal_verdiepingen != null ? String(res.aantal_verdiepingen) : "",
        hoogte: res.hoogte != null ? String(Math.round(res.hoogte * 10) / 10) : "",
        breedte: res.breedte != null ? String(Math.round(res.breedte * 10) / 10) : "",
        diepte: res.diepte != null ? String(Math.round(res.diepte * 10) / 10) : "",
        oppervlakte: res.oppervlakte != null ? String(Math.round(res.oppervlakte)) : "",
      };

      // Overschrijfregel: een veld is vervangbaar als het door de AI is ingevuld
      // (in aiVelden) of als het leeg is. Door de gebruiker getypte velden blijven staan.
      // We lezen de ref na de await, zodat tijdens het verzoek getypte invoer telt.
      const huidigeAiVelden = aiVeldenRef.current;
      const nieuwAiVelden = new Set(huidigeAiVelden);
      setVelden((prev) => {
        const bijgewerkt = { ...prev };
        for (const key of AI_VELDEN) {
          const vervangbaar = huidigeAiVelden.has(key) || !prev[key].trim();
          if (!vervangbaar) continue;
          bijgewerkt[key] = nieuw[key];
          if (nieuw[key].trim()) nieuwAiVelden.add(key);
          else nieuwAiVelden.delete(key);
        }
        // Toon waarschuwing als afmetingen als standaardschatting zijn ingevuld.
        const heeftAfmetingen =
          bijgewerkt.aantal_verdiepingen || bijgewerkt.hoogte || bijgewerkt.breedte;
        setGeschatteAfmetingen(
          heeftAfmetingen ? res.betrouwbaarheid === "laag" || !res.betrouwbaarheid : false,
        );
        return bijgewerkt;
      });
      aiVeldenRef.current = nieuwAiVelden;
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

  // Een suggestie kiezen: opnieuw analyseren met het precieze adres, wat tot één
  // resultaat leidt en de volledige analyse (satelliet/afmetingen) uitvoert.
  function kiesSuggestie(s: GebouwSuggestie) {
    setSuggesties([]);
    void voerAiUit(s.label);
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
          naam: metHoofdletters(velden.naam),
          adres: metHoofdletters(velden.adres),
          stad: velden.stad ? metHoofdletters(velden.stad) : undefined,
          postcode: velden.postcode || undefined,
          omschrijving: velden.omschrijving || undefined,
          gebouw_type: velden.gebouw_type || undefined,
          aantal_verdiepingen: getalOfUndefined(velden.aantal_verdiepingen),
          hoogte: getalOfUndefined(velden.hoogte),
          breedte: getalOfUndefined(velden.breedte),
          diepte: getalOfUndefined(velden.diepte),
          oppervlakte: getalOfUndefined(velden.oppervlakte),
          werkgever_id: werkgeverId ?? undefined,
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
              onChange={(e) => {
                setAiTekst(e.target.value);
                // Bij gewijzigde zoektekst zijn eerdere suggesties niet meer geldig.
                if (suggesties.length > 0) setSuggesties([]);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Laat dit veld leeg om de AI te laten aanvullen op basis van de velden
              die u hieronder al hebt ingevuld (naam, adres, postcode, stad of type),
              of beschrijf het gebouw hier zelf. Door uzelf ingevulde velden blijven
              staan; eerder door de AI ingevulde velden worden bij een nieuwe zoekopdracht
              vervangen.
            </p>
          </div>
          <Button
            type="button"
            variant="default"
            className="w-full sm:w-auto"
            onClick={() => voerAiUit()}
            disabled={aiBezig}
          >
            {aiBezig ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyseren...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />{" "}
                {laatsteAiTekst !== null ? "Opnieuw zoeken" : "AI aanvullen"}
              </>
            )}
          </Button>

          {voorstellenVerouderd && !aiBezig && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                De zoektekst is gewijzigd sinds de laatste analyse. De eerder ingevulde
                gegevens kunnen verouderd zijn — klik op "Opnieuw zoeken" om bij te werken.
              </span>
            </div>
          )}

          {suggesties.length > 0 && (
            <GebouwAiSuggesties suggesties={suggesties} onKies={kiesSuggestie} bezig={aiBezig} />
          )}

          {(satelliet || aiToelichting) && (
            <div className="flex gap-3 items-start pt-1">
              {satelliet && (
                <img
                  src={satelliet}
                  alt="Satellietbeeld"
                  className="h-24 w-24 rounded-md object-cover border shrink-0"
                />
              )}
              <div className="text-xs text-muted-foreground space-y-1">
                {aiBetrouwbaarheid && (
                  <Badge
                    variant={aiBetrouwbaarheid === "laag" ? "outline" : "secondary"}
                    className={
                      aiBetrouwbaarheid === "laag"
                        ? "text-xs border-amber-500/60 text-amber-600"
                        : "text-xs"
                    }
                  >
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
              onBlur={() => zetMetHoofdletters("naam")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-adres">Adres *</Label>
            <Input
              id="g-adres"
              placeholder="bijv. Kerkstraat 10"
              value={velden.adres}
              onChange={(e) => zet("adres", e.target.value)}
              onBlur={() => zetMetHoofdletters("adres")}
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
              onBlur={() => zetMetHoofdletters("stad")}
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
            <Label htmlFor="g-werkmaatschappij">Werkmaatschappij</Label>
            <select
              id="g-werkmaatschappij"
              value={werkgeverId ?? ""}
              onChange={(e) => setWerkgeverId(e.target.value ? Number(e.target.value) : null)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Geen</option>
              {(werkgevers ?? []).map((w) => (
                <option key={w.id} value={w.id}>{w.naam}</option>
              ))}
            </select>
          </div>
          {geschatteAfmetingen && (
            <div className="sm:col-span-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                De onderstaande afmetingen zijn conservatieve schattingen — controleer en corrigeer ze voor opslaan.
              </span>
            </div>
          )}

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
