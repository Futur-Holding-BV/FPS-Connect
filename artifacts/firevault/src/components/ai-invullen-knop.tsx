import { useState } from "react";
import { Sparkles, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAiCentraalInvullen } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export type AiFormulierType =
  | "crm_organisatie"
  | "crm_contactpersoon"
  | "gebouw"
  | "leverancier"
  | "werkmaatschappij"
  | "concurrent"
  | "wagenpark_voertuig"
  | "medewerker"
  | "magazijn_artikel";

const STANDAARD_LABELS: Record<AiFormulierType, Record<string, string>> = {
  crm_organisatie: {
    kvk: "KVK", btw: "BTW", adres: "Adres", postcode: "Postcode", stad: "Stad",
    regio: "Regio", telefoon: "Telefoon", email: "E-mail", website: "Website",
    branche: "Branche", org_type: "Type",
  },
  crm_contactpersoon: {
    email: "E-mail", telefoon: "Telefoon", mobiel: "Mobiel",
    functie: "Functie", afdeling: "Afdeling",
  },
  gebouw: {
    bouwjaar: "Bouwjaar", gebouw_type: "Type", eigenaar: "Eigenaar",
    oppervlakte: "Oppervlakte (m²)", omschrijving: "Omschrijving",
    postcode: "Postcode", stad: "Stad",
  },
  leverancier: {
    kvk: "KVK", btw: "BTW", adres: "Adres", postcode: "Postcode", stad: "Stad",
    telefoon: "Telefoon", email: "E-mail", website: "Website", iban: "IBAN",
  },
  werkmaatschappij: {
    kvk: "KVK", btw: "BTW", adres: "Adres", postcode: "Postcode", stad: "Stad",
    telefoon: "Telefoon", email: "E-mail", website: "Website",
  },
  concurrent: {
    website: "Website", regio: "Regio", bekende_klanten: "Bekende klanten",
    bekende_projecttypes: "Projecttypen", sterke_punten: "Sterke punten",
    zwakke_punten: "Zwakke punten", where_we_encounter: "Gezien bij",
  },
  wagenpark_voertuig: {
    merk: "Merk", voertuig_type: "Type", bouwjaar: "Bouwjaar",
    brandstof: "Brandstof", kleur: "Kleur", laadvermogen: "Laadvermogen",
  },
  medewerker: {
    email: "E-mail", telefoon: "Telefoon", functie_omschrijving: "Functieomschrijving",
  },
  magazijn_artikel: {
    omschrijving: "Omschrijving", eenheid: "Eenheid", leverancier_naam: "Leverancier",
    catalogusprijs: "Prijs", artikel_nummer: "Artikelnummer",
  },
};

interface Props {
  formulierType: AiFormulierType;
  contextId?: number | null;
  huidigVelden: Record<string, string>;
  onVoorstellen: (velden: Record<string, string>) => void;
  veldenLabels?: Record<string, string>;
  className?: string;
}

export function AiInvullenKnop({
  formulierType,
  contextId,
  huidigVelden,
  onVoorstellen,
  veldenLabels,
  className,
}: Props) {
  const { toast } = useToast();
  const mutatie = useAiCentraalInvullen();
  const [voorstel, setVoorstel] = useState<Record<string, string | null> | null>(null);

  const labels: Record<string, string> = {
    ...(STANDAARD_LABELS[formulierType] ?? {}),
    ...(veldenLabels ?? {}),
  };

  const gevuldVoorstel = voorstel
    ? Object.entries(voorstel).filter(([, v]) => v !== null && v !== "")
    : [];

  async function zoekVelden() {
    try {
      const result = await mutatie.mutateAsync({
        data: {
          formulier_type: formulierType,
          context_id: contextId ?? null,
          huidige_velden: huidigVelden,
        },
      });
      const gevuld = Object.entries(result.velden).filter(([, v]) => v !== null && v !== "");
      if (gevuld.length === 0) {
        toast({ title: "Geen aanvullende gegevens gevonden" });
        return;
      }
      setVoorstel(result.velden);
    } catch {
      toast({ title: "AI-aanvullen mislukt", variant: "destructive" });
    }
  }

  function allesOvernemen() {
    if (!voorstel) return;
    const over = Object.fromEntries(
      Object.entries(voorstel)
        .filter(([, v]) => v !== null && v !== "")
        .map(([k, v]) => [k, v as string]),
    );
    onVoorstellen(over);
    setVoorstel(null);
  }

  return (
    <div className={className}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1.5 border-amber-300 bg-white text-amber-700 hover:bg-amber-50 hover:text-amber-800"
        onClick={zoekVelden}
        disabled={mutatie.isPending}
      >
        {mutatie.isPending
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <Sparkles className="h-3.5 w-3.5" />}
        AI invullen
      </Button>

      {voorstel && gevuldVoorstel.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-amber-800 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              AI-voorstel
            </p>
            <button
              type="button"
              onClick={() => setVoorstel(null)}
              className="text-amber-500 hover:text-amber-800 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <dl className="space-y-1 text-sm text-amber-900">
            {gevuldVoorstel.map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="text-amber-600 shrink-0 min-w-32 font-medium">
                  {labels[k] ?? k}:
                </dt>
                <dd className="break-all">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="flex gap-2 pt-0.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1 border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
              onClick={allesOvernemen}
            >
              <Check className="h-3 w-3" />
              Overnemen
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-amber-700 hover:text-amber-900 hover:bg-amber-100"
              onClick={() => setVoorstel(null)}
            >
              Negeren
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
