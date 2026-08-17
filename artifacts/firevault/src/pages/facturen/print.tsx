import { useEffect } from "react";
import { useParams } from "wouter";
import {
  useGetFactuur,
  useListFactuurRegels,
  useListWerkgevers,
  useListStudioWerkgevers,
  useGetDocumentStudioModel,
  getGetDocumentStudioModelQueryKey,
} from "@workspace/api-client-react";
import { useActiefStudioModel } from "@/hooks/use-actief-studio-model";
import { FactuurTemplateA } from "@/components/documentopmaak/FamilieA";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

function datumNl(iso?: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}

export default function FactuurPrintPagina() {
  const { id } = useParams<{ id: string }>();
  const factuurId = parseInt(id ?? "0", 10);

  const { data: factuur, isLoading: factuurLaden } = useGetFactuur(factuurId, {
    query: { queryKey: ["factuur-print", factuurId], enabled: !!factuurId },
  });
  const { data: regels = [], isLoading: regelsLaden } = useListFactuurRegels(factuurId, {
    query: { queryKey: ["factuur-regels-print", factuurId], enabled: !!factuurId },
  });
  const { data: werkgevers } = useListWerkgevers();
  const { data: studioWerkgevers } = useListStudioWerkgevers();

  const actieveWerkgeverNaam = (() => {
    try {
      const v = localStorage.getItem("fps.actieve_werkgever");
      const id = v ? Number(v) : null;
      return id ? ((werkgevers ?? []).find((w) => w.id === id)?.naam ?? null) : null;
    } catch { return null; }
  })();

  const studioWerkgeverId = (
    (studioWerkgevers ?? []).find((w) => actieveWerkgeverNaam && w.naam === actieveWerkgeverNaam)?.id
    ?? (studioWerkgevers ?? [])[0]?.id
    ?? null
  );

  const { model: actiefModel, isLoading: modelLaden } = useActiefStudioModel(studioWerkgeverId, "factuur");

  const pinnedModelId = (factuur as Record<string, unknown> | undefined)?.["studio_model_id"] as number | null ?? null;
  const { data: pinnedModel, isLoading: pinnedModelLaden } = useGetDocumentStudioModel(pinnedModelId ?? 0, {
    query: { queryKey: getGetDocumentStudioModelQueryKey(pinnedModelId ?? 0), enabled: !!pinnedModelId, retry: false },
  });

  const gebruiktModel = pinnedModelId ? (pinnedModel ?? null) : actiefModel;
  const gebruiktModelLaden = pinnedModelId ? pinnedModelLaden : modelLaden;

  const klaar = !factuurLaden && !regelsLaden && !!factuur;
  // Zonder fiscaal factuurnummer is de factuur niet afdrukbaar: een terugval
  // op het interne id zet een betekenisloos nummer op een uitgaand document.
  const heeftFactuurnummer = !!factuur?.factuurnummer;

  useEffect(() => {
    if (klaar && heeftFactuurnummer) {
      document.documentElement.setAttribute("data-fps-print-ready", "1");
      const t = setTimeout(() => window.print(), 800);
      return () => {
        clearTimeout(t);
        document.documentElement.removeAttribute("data-fps-print-ready");
      };
    }
    // Laden of geblokkeerd (geen fiscaal nummer): ready-marker mag nooit blijven
    // hangen van een eerder bezochte, wél afdrukbare factuur in dezelfde SPA-sessie.
    document.documentElement.removeAttribute("data-fps-print-ready");
    return undefined;
  }, [klaar, heeftFactuurnummer, factuur?.id]);

  if (klaar && !heeftFactuurnummer) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground p-6">
        <div className="max-w-md text-center space-y-3" data-testid="print-geblokkeerd-geen-factuurnummer">
          <AlertTriangle className="h-8 w-8 mx-auto text-amber-500" />
          <p className="font-semibold text-foreground">Deze factuur is nog niet afdrukbaar</p>
          <p className="text-sm">
            Er is nog geen fiscaal factuurnummer toegekend. Maak de factuur eerst definitief;
            afdrukken zonder nummer zou een betekenisloos nummer op een uitgaand document zetten.
          </p>
        </div>
      </div>
    );
  }

  if (!klaar) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-2">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p>Factuur laden…</p>
        </div>
      </div>
    );
  }

  const templateJson = (() => {
    if (!gebruiktModel?.connect_template_json) return null;
    try {
      return JSON.parse(gebruiktModel.connect_template_json) as {
        koptekst?: { logo_positie?: string };
        kleurschema?: { primair?: string };
        voettekst?: string | null;
      };
    } catch { return null; }
  })();
  const accentKleur = templateJson?.kleurschema?.primair ?? "#F23B0D";
  const logoPositie = (templateJson?.koptekst?.logo_positie ?? "rechts") as "links" | "rechts" | "midden";

  const werkgever = actieveWerkgeverNaam
    ? ((werkgevers ?? []).find((w) => w.naam === actieveWerkgeverNaam) ?? (werkgevers ?? [])[0])
    : ((werkgevers ?? [])[0] ?? null);

  const studioLogo = (studioWerkgevers ?? []).find((w) => w.id === studioWerkgeverId)?.logo_url;
  const logoUrl = studioLogo
    ? (studioLogo.startsWith("/") ? `/api/storage${studioLogo}` : `/api/storage/objects/${studioLogo}`)
    : werkgever?.logo_url
    ? (werkgever.logo_url.startsWith("/") ? `/api/storage${werkgever.logo_url}` : `/api/storage/objects/${werkgever.logo_url}`)
    : "/logo-fps.png";

  const werkgeverX = werkgever ? (werkgever as unknown as Record<string, unknown>) : null;
  const briefpapierDocId = werkgeverX?.["briefpapier_document_id"] as number | null | undefined;
  const briefpapierUrl = briefpapierDocId ? `/api/storage/objects/${briefpapierDocId}` : null;

  const werkgeverIban           = werkgeverX?.["iban"] as string | null | undefined;
  const werkgeverVoettekst      = werkgeverX?.["voettekst"] as string | null | undefined;
  const werkgeverVoettekstPositie = ((werkgeverX?.["voettekst_positie"] as string | null | undefined) ?? "links");
  const werkgeverMargeOnder     = werkgeverX?.["marge_onder"] as number | null | undefined;
  const werkgeverMargeLinks     = werkgeverX?.["marge_links"] as number | null | undefined;
  const werkgeverMargeRechts    = werkgeverX?.["marge_rechts"] as number | null | undefined;

  const mij = {
    naam:               werkgever?.naam ?? "FPS Brandpreventie",
    logoUrl,
    adres:              werkgever?.adres ?? "",
    postcodeWoonplaats: [werkgever?.postcode, werkgever?.plaats].filter(Boolean).join("  "),
    telefoon:           werkgever?.telefoon ?? "",
    email:              werkgever?.email ?? "",
    website:            werkgever?.website ?? "",
    kvk:                werkgever?.kvk ?? "",
    btw:                werkgever?.btw ?? "",
    iban:               werkgeverIban ?? "",
    voettekst:          werkgeverVoettekst ?? templateJson?.voettekst ?? "",
    voettekstPositie:   werkgeverVoettekstPositie as "links" | "midden" | "rechts",
    margeOnder:         werkgeverMargeOnder ?? undefined,
    margeLinks:         werkgeverMargeLinks ?? undefined,
    margeRechts:        werkgeverMargeRechts ?? undefined,
  };

  // Factuurgegevens — directe velden uit het schema
  const factuurX      = factuur as unknown as Record<string, unknown>;
  // Boven al afgedwongen: zonder factuurnummer komt de render hier niet.
  const factuurNummer = factuur.factuurnummer as string;
  // Ketenkenmerk (bv. O405/F002): hangt via de offerte aan gebouw en BV en is
  // daarmee — anders dan het fiscale nummer — uniek over de drie administraties.
  const ketenKenmerk = (factuurX["kenmerk"] as string | null | undefined) ?? null;
  const betalingskenmerk = ketenKenmerk ? `${factuurNummer} / ${ketenKenmerk}` : factuurNummer;
  const factuurDatum  = datumNl(factuur.factuurdatum) || datumNl(factuurX["aangemaakt_op"] as string);
  const vervaldatum   = factuur.vervaldatum ? datumNl(factuur.vervaldatum) : null;
  const referentie    = (factuurX["relatie_referentie"] as string | null | undefined) ?? null;

  // Debiteur
  const debiteur = {
    naam:               factuur.relatienaam ?? factuur.gebouw_naam ?? "Onbekend",
    adres:              factuur.relatie_adres ?? null,
    postcodeWoonplaats: null as string | null,
  };

  // Regels
  const factuurRegels = regels.map((r) => ({
    omschrijving:  r.omschrijving,
    hoeveelheid:   r.hoeveelheid ?? null,
    eenheid:       r.eenheid ?? null,
    stukprijs:     r.stukprijs ?? null,
    bedragExclBtw: r.bedrag_excl_btw ?? null,
    btwPercentage: r.btw_percentage ?? null,
    btwBedrag:     r.btw_bedrag ?? null,
  }));

  // Totalen
  const exclBtw   = parseFloat(factuur.bedrag_excl_btw ?? "0") || 0;
  const inclBtw   = parseFloat(factuur.bedrag_incl_btw ?? "0") || 0;
  const btwBedrag = parseFloat(factuur.btw_bedrag ?? "0") || (inclBtw - exclBtw);
  const btwPerc   = 21;

  const totalen = { exclBtw, btwBedrag, inclBtw, btwPercentage: btwPerc };

  return (
    <div
      className="min-h-screen bg-slate-100 py-8 print:bg-white print:p-0 overflow-x-hidden"
      style={accentKleur ? ({ "--color-primary": accentKleur }) as React.CSSProperties : undefined}
    >
      <div className="w-full max-w-[210mm] mx-auto mb-2 px-4 print:hidden overflow-hidden">
        {!gebruiktModelLaden && gebruiktModel ? (
          <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded px-2 py-0.5 font-medium">
            <CheckCircle2 className="h-3 w-3" />
            {pinnedModelId
              ? `Opmaak: vastgezet model v${gebruiktModel.versie} — ${gebruiktModel.werkgever_naam ?? mij.naam}`
              : `Opmaak: Model 0 — ${gebruiktModel.werkgever_naam ?? mij.naam}`}
          </span>
        ) : !gebruiktModelLaden ? (
          <div className="flex items-start gap-2 text-xs bg-amber-50 text-amber-800 border border-amber-200 rounded px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Geen goedgekeurd factuur-opmaakmodel gevonden.{" "}
              <a href="/beheer/documentopmaak" className="underline font-medium">
                Stel een model in via Beheer › Documentopmaak.
              </a>
            </span>
          </div>
        ) : null}
      </div>

      <FactuurTemplateA
        mij={mij}
        factuur={{
          nummer:      factuurNummer,
          datum:       factuurDatum,
          vervaldatum: vervaldatum,
          referentie:  referentie ?? null,
          kenmerk:     ketenKenmerk,
          betalingskenmerk,
          type:        factuur.type,
        }}
        debiteur={debiteur}
        regels={factuurRegels}
        totalen={totalen}
        accentKleur={accentKleur}
        logoPositie={logoPositie}
        briefpapierUrl={briefpapierUrl}
        betalingstermijn={30}
      />
    </div>
  );
}
