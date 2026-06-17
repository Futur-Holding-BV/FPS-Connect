import { useEffect, useRef, useState } from "react";
import {
  useUpdateGebouw,
  useAiAnalyseGebouw,
  useListWerkgevers,
} from "@workspace/api-client-react";
import type { Gebouw, GebouwSuggestie } from "@workspace/api-client-react";
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
import { Loader2, AlertCircle, Sparkles, TriangleAlert } from "lucide-react";
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
    projectnummer: tekst(gebouw.projectnummer),
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
  const { data: werkgevers } = useListWerkgevers();

  const [velden, setVelden] = useState<Velden>(() => uitGebouw(gebouw));
  const [werkgeverId, setWerkgeverId] = useState<number | null>((gebouw as any).werkgever_id ?? null);
  const [foutmelding, setFoutmelding] = useState<string | null>(null);

  // Bestaande gebouwgegevens starten als door de gebruiker beheerd: de AI
  // overschrijft ze niet, alleen lege of eerder door de AI ingevulde velden.
  // Bewust een ref (niet in de render gebruikt): zo lezen we tijdens een lopend
  // AI-verzoek altijd de actuele eigendomsstatus, ook als de gebruiker ondertussen typt.
  const aiVeldenRef = useRef<Set<keyof Velden>>(new Set());
  const [aiTekst, setAiTekst] = useState("");
  const [laatsteAiTekst, setLaatsteAiTekst] = useState<string | null>(null);
  const [suggesties, setSuggesties] = useState<GebouwSuggestie[]>([]);
  const [satelliet, setSatelliet] = useState<string | null>(null);
  const [aiToelichting, setAiToelichting] = useState<string | null>(null);
  const [aiBetrouwbaarheid, setAiBetrouwbaarheid] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setVelden(uitGebouw(gebouw));
      setWerkgeverId((gebouw as any).werkgever_id ?? null);
      aiVeldenRef.current = new Set();
      setFoutmelding(null);
      setAiTekst(standaardBeschrijving(gebouw));
      setLaatsteAiTekst(null);
      setSuggesties([]);
      setSatelliet(null);
      setAiToelichting(null);
      setAiBetrouwbaarheid(null);
    }
  }, [open, gebouw]);

  // Door de gebruiker getypt: het veld wordt nu door de gebruiker beheerd.
  function zet<K extends keyof Velden>(key: K, waarde: string) {
    setVelden((v) => ({ ...v, [key]: waarde }));
    aiVeldenRef.current.delete(key);
  }

  // Wis alle door de AI ingevulde velden (laat door de gebruiker beheerde velden staan).
  function wisAiVelden() {
    const teWissen = Array.from(aiVeldenRef.current);
    setVelden((prev) => {
      const next = { ...prev };
      for (const key of teWissen) next[key] = "";
      return next;
    });
    aiVeldenRef.current = new Set();
  }

  // De ingevoerde beschrijving wijkt af van wat het huidige resultaat opleverde.
  const voorstellenVerouderd =
    laatsteAiTekst !== null && aiTekst.trim() !== laatsteAiTekst.trim();

  async function voerAiUit(overrideTekst?: string) {
    setFoutmelding(null);
    const invoer = overrideTekst ?? aiTekst;
    if (!invoer.trim()) {
      setFoutmelding("Beschrijf eerst het gebouw of het adres voordat de AI kan invullen.");
      return;
    }
    // Een nieuwe zoekopdracht: eerdere voorstellen en hulpinfo zijn niet langer geldig.
    setSuggesties([]);
    setSatelliet(null);
    setAiToelichting(null);
    setAiBetrouwbaarheid(null);
    try {
      const res = await aiAnalyse.mutateAsync({
        data: { beschrijving: invoer },
      });

      if (overrideTekst !== undefined) setAiTekst(overrideTekst);
      setLaatsteAiTekst(invoer);

      if (!res.gevonden) {
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
        naam: res.naam ?? "",
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
      // (in aiVelden) of als het leeg is. Door de gebruiker beheerde velden blijven staan.
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
        return bijgewerkt;
      });
      aiVeldenRef.current = nieuwAiVelden;
    } catch {
      setFoutmelding("AI-analyse mislukte. Probeer het opnieuw of vul handmatig in.");
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
      await wijzigGebouw.mutateAsync({
        id: gebouw.id,
        data: {
          projectnummer: velden.projectnummer.trim() || null,
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
          werkgever_id: werkgeverId,
        },
      });
      await queryClient.invalidateQueries();
      onOpenChange(false);
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
              onChange={(e) => {
                setAiTekst(e.target.value);
                // Bij gewijzigde zoektekst zijn eerdere suggesties niet meer geldig.
                if (suggesties.length > 0) setSuggesties([]);
              }}
            />
            <p className="text-xs text-muted-foreground">
              De AI schat o.a. hoogte, breedte, diepte en oppervlakte en vult lege velden in.
              Wat u zelf invult heeft voorrang en blijft staan; alleen eerder door de AI
              ingevulde velden worden bij een nieuwe zoekopdracht vervangen.
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
                {laatsteAiTekst !== null ? "Opnieuw zoeken" : "AI invullen"}
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
            <Label htmlFor="b-projectnummer">Projectnummer</Label>
            <Input
              id="b-projectnummer"
              placeholder="bijv. P-2026-014"
              value={velden.projectnummer}
              onChange={(e) => zet("projectnummer", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Uniek projectnummer, getoond als "projectnummer - naam".
            </p>
          </div>
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
            <Label htmlFor="b-werkmaatschappij">Werkmaatschappij</Label>
            <select
              id="b-werkmaatschappij"
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
