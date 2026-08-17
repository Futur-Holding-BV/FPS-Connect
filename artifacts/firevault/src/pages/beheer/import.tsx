import { useState, useRef, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useListImportLogs, useListLeveranciers } from "@workspace/api-client-react";
import { leesEnWisPrijslijstBestand } from "@/lib/prijslijst-import-stash";
import { CheckCircle2, AlertCircle, ArrowRight, FileSpreadsheet, RotateCcw, Download, Undo2, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PaginaHulp } from "@/components/pagina-hulp";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

type ImportType = "leveranciers" | "klanten" | "artikelen" | "medewerkers" | "gebouwen" | "contactpersonen" | "magazijn_artikelen" | "eenheidsprijzen" | "prijsafspraken" | "historische_facturen" | "historische_projecten";

const IMPORT_TYPE_LABELS: Record<ImportType, string> = {
  leveranciers: "Leveranciers",
  klanten: "Klanten",
  contactpersonen: "Contactpersonen",
  artikelen: "Artikelen",
  magazijn_artikelen: "Magazijnartikelen",
  medewerkers: "Medewerkers",
  gebouwen: "Gebouwen",
  historische_projecten: "Historische projecten (archief)",
  eenheidsprijzen: "Eenheidsprijzen",
  prijsafspraken: "Prijsafspraken (leverancier)",
  historische_facturen: "Historische facturen (archief)",
};

// IMPORT_01 §2.1: importrecht = hoogste niveau (4 = Beheer) op de module waar
// de gegevens thuishoren. Zelfde afleiding als de server — geen aparte lijst.
const IMPORT_TYPE_MODULES: Record<ImportType, string> = {
  leveranciers: "crm",
  klanten: "crm",
  contactpersonen: "crm",
  artikelen: "magazijn",
  magazijn_artikelen: "magazijn",
  medewerkers: "personeel",
  gebouwen: "gebouwen",
  historische_projecten: "gebouwen",
  eenheidsprijzen: "calculaties",
  prijsafspraken: "calculaties",
  historische_facturen: "financieel",
};

// Beschikbare velden per importtype
const VELD_DEFINITIES: Record<ImportType, { veld: string; label: string; verplicht?: boolean }[]> = {
  leveranciers: [
    { veld: "naam", label: "Naam (bedrijfsnaam)", verplicht: true },
    { veld: "code", label: "Code / debiteurnummer" },
    { veld: "adres", label: "Straat" },
    { veld: "huisnummer", label: "Huisnummer" },
    { veld: "postcode", label: "Postcode" },
    { veld: "stad", label: "Stad / Plaats" },
    { veld: "land", label: "Land" },
    { veld: "contactpersoon", label: "Contactpersoon" },
    { veld: "email", label: "E-mailadres" },
    { veld: "telefoon", label: "Telefoonnummer" },
    { veld: "website", label: "Website" },
    { veld: "kvk_nummer", label: "KvK-nummer" },
    { veld: "btw_nummer", label: "BTW-nummer" },
    { veld: "iban", label: "IBAN" },
    { veld: "bic", label: "BIC / SWIFT" },
    { veld: "bank_naam", label: "Banknaam" },
    { veld: "betalingstermijn_dagen", label: "Betalingstermijn (dagen)" },
    { veld: "categorie", label: "Categorie" },
    { veld: "notities", label: "Notities" },
  ],
  artikelen: [
    { veld: "naam", label: "Naam", verplicht: true },
    { veld: "code", label: "Artikelcode" },
    { veld: "omschrijving", label: "Omschrijving" },
    { veld: "eenheid", label: "Eenheid (st/m/m2/uur)" },
    { veld: "inkoopprijs", label: "Inkoopprijs" },
    { veld: "verkoopprijs", label: "Verkoopprijs" },
    { veld: "categorie", label: "Categorie" },
    { veld: "notities", label: "Notities" },
  ],
  klanten: [
    { veld: "naam", label: "Naam (bedrijfsnaam)", verplicht: true },
    { veld: "type", label: "Organisatietype" },
    { veld: "kvk", label: "KvK-nummer" },
    { veld: "adres", label: "Straat" },
    { veld: "postcode", label: "Postcode" },
    { veld: "stad", label: "Stad / Plaats" },
    { veld: "regio", label: "Regio" },
    { veld: "telefoon", label: "Telefoonnummer" },
    { veld: "email", label: "E-mailadres" },
    { veld: "website", label: "Website" },
    { veld: "linkedin_url", label: "LinkedIn-URL" },
    { veld: "branche", label: "Branche" },
    { veld: "relatie_status", label: "Relatiestatus (onbekend/koud/warm/actief)" },
    { veld: "opmerkingen", label: "Opmerkingen / notities" },
  ],
  medewerkers: [
    { veld: "naam", label: "Volledige naam", verplicht: true },
    { veld: "email", label: "E-mailadres" },
    { veld: "telefoon", label: "Telefoonnummer" },
    { veld: "mobiel", label: "Mobiel" },
    { veld: "dienstverband", label: "Dienstverband (vast/tijdelijk/oproep/inhuur/zzp)" },
    { veld: "in_dienst_sinds", label: "In dienst sinds (JJJJ-MM-DD)" },
    { veld: "geboortedatum", label: "Geboortedatum (JJJJ-MM-DD)" },
    { veld: "werkmaatschappij", label: "Werkmaatschappij" },
    { veld: "adres", label: "Woonadres" },
    { veld: "postcode", label: "Postcode" },
    { veld: "woonplaats", label: "Woonplaats" },
    { veld: "actief", label: "Actief (ja/nee)" },
  ],
  gebouwen: [
    { veld: "naam", label: "Naam / projectnaam", verplicht: true },
    { veld: "adres", label: "Straat + huisnummer", verplicht: true },
    { veld: "postcode", label: "Postcode" },
    { veld: "stad", label: "Stad / Plaats" },
    { veld: "gebouw_type", label: "Gebouwtype" },
    { veld: "aantal_verdiepingen", label: "Aantal verdiepingen" },
    { veld: "werknummer", label: "Werknummer" },
    { veld: "projectnummer", label: "Projectnummer" },
    { veld: "omschrijving", label: "Omschrijving" },
  ],
  contactpersonen: [
    { veld: "naam", label: "Volledige naam", verplicht: true },
    { veld: "functie", label: "Functie / rol" },
    { veld: "email", label: "E-mailadres" },
    { veld: "telefoon", label: "Telefoonnummer" },
    { veld: "mobiel", label: "Mobiel" },
    { veld: "beslisrol", label: "Beslisrol (onbekend/influencer/beslisser)" },
    { veld: "opmerkingen", label: "Opmerkingen" },
  ],
  magazijn_artikelen: [
    { veld: "naam", label: "Naam", verplicht: true },
    { veld: "code", label: "Artikelcode" },
    { veld: "omschrijving", label: "Omschrijving" },
    { veld: "eenheid", label: "Eenheid (st/m/m2/rol)" },
    { veld: "inkoopprijs", label: "Inkoopprijs" },
    { veld: "categorie", label: "Categorie" },
  ],
  eenheidsprijzen: [
    { veld: "code", label: "Code", verplicht: true },
    { veld: "omschrijving", label: "Omschrijving", verplicht: true },
    { veld: "categorie", label: "Categorie" },
    { veld: "eenheid", label: "Eenheid" },
    { veld: "materiaalcomponent", label: "Materiaalcomponent" },
    { veld: "arbeidscomponent", label: "Arbeidscomponent" },
    { veld: "normtijd", label: "Normtijd (uren)" },
    { veld: "kostprijs", label: "Kostprijs" },
    { veld: "verkoopprijs", label: "Verkoopprijs" },
    { veld: "marge", label: "Marge" },
    { veld: "btw_code", label: "Btw-code" },
    { veld: "inclusies", label: "Inclusies" },
    { veld: "exclusies", label: "Exclusies" },
    { veld: "opmerkingen", label: "Opmerkingen" },
  ],
  historische_facturen: [
    { veld: "factuurnummer", label: "Factuurnummer", verplicht: true },
    { veld: "type", label: "Type (inkoop / verkoop)" },
    { veld: "factuurdatum", label: "Factuurdatum (JJJJ-MM-DD)" },
    { veld: "vervaldatum", label: "Vervaldatum (JJJJ-MM-DD)" },
    { veld: "relatienaam", label: "Leverancier / klant naam" },
    { veld: "relatie_code", label: "Relatienummer / debiteur- of crediteurcode" },
    { veld: "bedrag_excl_btw", label: "Bedrag excl. btw" },
    { veld: "btw_bedrag", label: "Btw-bedrag" },
    { veld: "bedrag_incl_btw", label: "Bedrag incl. btw" },
    { veld: "btw_code", label: "Btw-code (H/L/0)" },
    { veld: "grootboekrekening", label: "Grootboekrekening (GBL)" },
    { veld: "kostenplaats", label: "Kostenplaats" },
    { veld: "dagboek", label: "Dagboek" },
    { veld: "betaalstatus", label: "Betaalstatus (betaald / openstaand / deels_betaald)" },
    { veld: "omschrijving", label: "Omschrijving / referentie" },
    { veld: "bestandsnaam", label: "Bestandsnaam PDF (optioneel)" },
  ],
  prijsafspraken: [
    { veld: "artikelcode", label: "Artikelcode (leverancier)", verplicht: true },
    { veld: "omschrijving", label: "Omschrijving" },
    { veld: "prijs", label: "Prijs", verplicht: true },
    { veld: "eenheid", label: "Eenheid" },
    { veld: "leverancier", label: "Leverancier (naam of id) — of vul hierboven in" },
    { veld: "geldig_van", label: "Geldig van (JJJJ-MM-DD) — of vul hierboven in" },
    { veld: "geldig_tot", label: "Geldig tot (JJJJ-MM-DD) — of vul hierboven in" },
    { veld: "staffel_vanaf", label: "Staffel vanaf (aantal)" },
    { veld: "excl_btw", label: "Prijs excl. btw (ja/nee)" },
  ],
  historische_projecten: [
    { veld: "naam", label: "Projectnaam", verplicht: true },
    { veld: "werknummer", label: "Werknummer" },
    { veld: "projectnummer", label: "Projectnummer" },
    { veld: "adres", label: "Adres" },
    { veld: "postcode", label: "Postcode" },
    { veld: "stad", label: "Stad / Plaats" },
    { veld: "gebouw_type", label: "Gebouwtype" },
    { veld: "aantal_verdiepingen", label: "Aantal verdiepingen" },
    { veld: "omschrijving", label: "Omschrijving / toelichting" },
  ],
};

type Stap = "keuze" | "koppeling" | "controle" | "resultaat";

interface PreviewData {
  kolommen: string[];
  rijen: Record<string, string>[];
  totaal_rijen: number;
  bestand_id: string;
  sleutel_omschrijving?: string | null;
}

interface ControleData {
  totaal_rijen: number;
  nieuw: number;
  dubbel: number;
  onbruikbaar: number;
  onbruikbaar_redenen: { rij: number; reden: string }[];
  sleutel_omschrijving?: string | null;
  // PRIJS_01 §4 — alleen voor prijsafspraken
  vergelijking?: {
    duurder: number;
    goedkoper: number;
    gelijk: number;
    nieuw: number;
    top_verschillen: Array<Record<string, unknown>>;
  };
  niet_koppelbaar?: {
    aantal: number;
    redenen: { rij: number; reden: string }[];
  };
}

// PRIJS_01 §4 — respons van /import/prijslijst-voorstel
interface PrijslijstVoorstelData {
  bestandssoort: "excel" | "csv" | "pdf";
  leverancier_voorstel: { naam: string | null; leverancier_id: number | null };
  periode_voorstel: { geldig_van: string | null; geldig_tot: string | null };
  valuta_voorstel: string | null;
  kolomkoppeling_voorstel: Record<string, string>;
  kolommen: string[];
  proefregels: Record<string, string>[];
  niet_leesbaar: number;
  waarschuwing: string | null;
}

// Defaults uit het prijslijst-voorstelscherm (leverancier/periode/valuta).
interface PrijsafsprakenDefaults {
  leverancier_id: string;
  geldig_van: string;
  geldig_tot: string;
  valuta: string;
}

interface Resultaat {
  type: string;
  rijen_totaal: number;
  rijen_verwerkt: number;
  rijen_overgeslagen: number;
  rijen_dubbel_overgeslagen?: number;
  fouten: { rij: number; fout: string }[];
  log_id?: number;
}

export default function ImportPagina() {
  const { heeftNiveau } = useBevoegdheid();

  // IMPORT_01 aanvulling: toon uitsluitend de types die deze gebruiker mag
  // importeren; geen enkel recht → pagina onbereikbaar (ook via directe URL).
  const toegestaneTypes = useMemo(
    () =>
      (Object.keys(IMPORT_TYPE_LABELS) as ImportType[]).filter((t) =>
        heeftNiveau(IMPORT_TYPE_MODULES[t], 4),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [heeftNiveau],
  );

  if (toegestaneTypes.length === 0) {
    return (
      <div className="p-6 max-w-xl mx-auto mt-12 text-center space-y-3">
        <ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground" />
        <h1 data-paginatitel className="text-lg font-semibold">Geen toegang</h1>
        <p className="text-sm text-muted-foreground">
          Je hebt geen rechten om gegevens te importeren. Importeren vereist
          beheerrecht op de module waar de gegevens thuishoren.
        </p>
      </div>
    );
  }

  return <ImportWizard toegestaneTypes={toegestaneTypes} />;
}

function ImportWizard({ toegestaneTypes }: { toegestaneTypes: ImportType[] }) {
  const [stap, setStap] = useState<Stap>("keuze");
  const [type, setType] = useState<ImportType>(toegestaneTypes[0]!);
  const [bestand, setBestand] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [koppeling, setKoppeling] = useState<Record<string, string>>({});
  const [controle, setControle] = useState<ControleData | null>(null);
  const [keuzeDubbelen, setKeuzeDubbelen] = useState<"overslaan" | "als_nieuw">("overslaan");
  const [resultaat, setResultaat] = useState<Resultaat | null>(null);
  const [bezig, setBezig] = useState(false);
  const [terugdraaiBezig, setTerugdraaiBezig] = useState<number | null>(null);
  // PRIJS_01 §4 — prijslijst-voorstel + defaults (leverancier/periode/valuta)
  const [voorstel, setVoorstel] = useState<PrijslijstVoorstelData | null>(null);
  const [prijsDefaults, setPrijsDefaults] = useState<PrijsafsprakenDefaults>({
    leverancier_id: "",
    geldig_van: "",
    geldig_tot: "",
    valuta: "EUR",
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { data: logs = [], refetch: refetchLogs } = useListImportLogs();
  const { data: leveranciers = [] } = useListLeveranciers();

  const veldDefs = VELD_DEFINITIES[type];
  const isPrijsafspraken = type === "prijsafspraken";

  async function uploadPreview(bestandFile: File) {
    setBezig(true);
    const form = new FormData();
    form.append("bestand", bestandFile);
    form.append("type", type);
    try {
      const resp = await fetch("/api/import/preview", { method: "POST", body: form });
      if (!resp.ok) throw new Error((await resp.json() as { error: string }).error);
      const data = await resp.json() as PreviewData;
      setPreview(data);

      const autoKoppeling: Record<string, string> = {};
      for (const { veld } of veldDefs) {
        const gevonden = data.kolommen.find(
          (k) => k.toLowerCase().replace(/[^a-z0-9]/g, "_") === veld ||
                 k.toLowerCase() === veld,
        );
        if (gevonden) autoKoppeling[veld] = gevonden;
      }
      setKoppeling(autoKoppeling);
      setStap("koppeling");
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Upload mislukt", variant: "destructive" });
    } finally {
      setBezig(false);
    }
  }

  // PRIJS_01 §4 — voor prijsafspraken analyseren we het bestand eerst met de
  // AI-voorstelroute (leverancier/periode/valuta + kolomkoppeling + proefregels),
  // en daarna pas de gewone /import/preview zodat de bestaande koppel- en
  // controle-stappen ongewijzigd werken. Het voorstel vult niets definitief in;
  // de gebruiker corrigeert de dropdowns en de velden bovenaan.
  async function uploadPrijslijstVoorstel(bestandFile: File) {
    setBezig(true);
    try {
      // 1) AI-voorstel ophalen
      const voorstelForm = new FormData();
      voorstelForm.append("bestand", bestandFile);
      const vResp = await fetch("/api/import/prijslijst-voorstel", { method: "POST", body: voorstelForm });
      if (!vResp.ok) throw new Error((await vResp.json() as { error: string }).error);
      const vData = await vResp.json() as PrijslijstVoorstelData;
      setVoorstel(vData);
      setPrijsDefaults({
        leverancier_id: vData.leverancier_voorstel.leverancier_id != null ? String(vData.leverancier_voorstel.leverancier_id) : "",
        geldig_van: vData.periode_voorstel.geldig_van ?? "",
        geldig_tot: vData.periode_voorstel.geldig_tot ?? "",
        valuta: vData.valuta_voorstel ?? "EUR",
      });

      // 2) Gewone preview voor de import-cache (bestand_id) — pdf's parseren daar
      //    niet, dus voor pdf werken we met de gedestilleerde proefregels: die
      //    kunnen niet door de reguliere import (die xlsx/csv verwacht). We laten
      //    de preview toch draaien zodat excel/csv de normale flow volgt.
      const previewForm = new FormData();
      previewForm.append("bestand", bestandFile);
      previewForm.append("type", "prijsafspraken");
      const pResp = await fetch("/api/import/preview", { method: "POST", body: previewForm });
      if (!pResp.ok) {
        // Bij pdf faalt de reguliere parse — meld duidelijk i.p.v. stil door.
        const fout = (await pResp.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          vData.bestandssoort === "pdf"
            ? "Een pdf-prijslijst kan niet automatisch als tabel worden ingelezen. Zet de prijslijst om naar Excel of CSV en probeer opnieuw."
            : fout.error ?? "Bestand kon niet worden gelezen",
        );
      }
      const pData = await pResp.json() as PreviewData;
      setPreview(pData);

      // 3) Voorgestelde kolomkoppeling omzetten van {kolom: doelveld} naar
      //    {doelveld: kolom} (de structuur die de koppel-stap gebruikt).
      const autoKoppeling: Record<string, string> = {};
      for (const [kolom, doelveld] of Object.entries(vData.kolomkoppeling_voorstel)) {
        if (doelveld && pData.kolommen.includes(kolom)) autoKoppeling[doelveld] = kolom;
      }
      setKoppeling(autoKoppeling);
      setStap("koppeling");
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Analyse mislukt", variant: "destructive" });
    } finally {
      setBezig(false);
    }
  }

  async function controleren() {
    if (!preview) return;
    setBezig(true);
    try {
      const resp = await fetch("/api/import/controleren", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bestand_id: preview.bestand_id,
          type,
          kolomkoppeling: koppeling,
          ...(isPrijsafspraken ? { defaults: prijsDefaultsPayload() } : {}),
        }),
      });
      if (!resp.ok) throw new Error((await resp.json() as { error: string }).error);
      const data = await resp.json() as ControleData;
      setControle(data);
      setStap("controle");
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Controle mislukt", variant: "destructive" });
    } finally {
      setBezig(false);
    }
  }

  // Defaults naar de server: leverancier_id als getal, lege velden als null.
  function prijsDefaultsPayload() {
    const id = parseInt(prijsDefaults.leverancier_id, 10);
    return {
      leverancier_id: Number.isFinite(id) ? id : null,
      geldig_van: prijsDefaults.geldig_van.trim() || null,
      geldig_tot: prijsDefaults.geldig_tot.trim() || null,
      valuta: prijsDefaults.valuta.trim() || null,
    };
  }

  async function uitvoeren() {
    if (!preview || !controle) return;
    setBezig(true);
    try {
      const resp = await fetch("/api/import/uitvoeren", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bestand_id: preview.bestand_id,
          type,
          kolomkoppeling: koppeling,
          ...(controle.dubbel > 0 ? { keuze_dubbelen: keuzeDubbelen } : {}),
          ...(isPrijsafspraken ? { defaults: prijsDefaultsPayload() } : {}),
        }),
      });
      const data = await resp.json() as Resultaat & { error?: string };
      if (!resp.ok) throw new Error(data.error ?? "Import mislukt");
      setResultaat(data);
      setStap("resultaat");
      void refetchLogs();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Import mislukt", variant: "destructive" });
    } finally {
      setBezig(false);
    }
  }

  async function terugdraaien(logId: number) {
    if (!window.confirm("Weet je zeker dat je deze import wilt terugdraaien? Alle geïmporteerde records uit deze import worden verwijderd (behalve records die inmiddels gewijzigd of in gebruik zijn).")) return;
    setTerugdraaiBezig(logId);
    try {
      const resp = await fetch(`/api/import/logs/${logId}/terugdraaien`, { method: "POST" });
      const data = await resp.json() as { error?: string; verwijderd: number; niet_verwijderd: { id: number; reden: string }[]; volledig: boolean };
      if (!resp.ok) throw new Error(data.error ?? "Terugdraaien mislukt");
      toast({
        title: data.volledig
          ? `Import teruggedraaid — ${data.verwijderd} records verwijderd`
          : `${data.verwijderd} records verwijderd, ${data.niet_verwijderd.length} niet (gewijzigd of in gebruik)`,
      });
      void refetchLogs();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Terugdraaien mislukt", variant: "destructive" });
    } finally {
      setTerugdraaiBezig(null);
    }
  }

  function opnieuw() {
    setStap("keuze");
    setBestand(null);
    setPreview(null);
    setKoppeling({});
    setControle(null);
    setResultaat(null);
    setVoorstel(null);
    setPrijsDefaults({ leverancier_id: "", geldig_van: "", geldig_tot: "", valuta: "EUR" });
    if (fileRef.current) fileRef.current.value = "";
  }

  // PRIJS_01 §4 — entry vanuit Slim Upload: URL ?type=prijsafspraken&bron=slim-upload.
  // Het bestand is daar al gearchiveerd én in-memory gestasht; hier pakken we het
  // op en starten meteen de prijslijst-analyse. Draait één keer bij mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlType = params.get("type");
    if (urlType && (Object.keys(IMPORT_TYPE_LABELS) as ImportType[]).includes(urlType as ImportType)) {
      setType(urlType as ImportType);
    }
    if (urlType === "prijsafspraken" && params.get("bron") === "slim-upload") {
      const gestasht = leesEnWisPrijslijstBestand();
      if (gestasht) {
        setBestand(gestasht);
        void uploadPrijslijstVoorstel(gestasht);
      }
    }
    // Query-string eenmalig opschonen zodat een refresh niet opnieuw triggert.
    if (urlType) window.history.replaceState({}, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Alleen logs van types die de gebruiker zelf mag importeren zijn relevant;
  // de server geeft leesrecht al breder (module-leesrecht), dus tonen wat er komt.
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <PaginaHulp pagina="beheer-import" />
      <div>
        <h1 className="text-2xl font-semibold">Importeren</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Importeer gegevens uit ENK-software via Excel of CSV
        </p>
      </div>

      {/* Stap 1: Type + bestand kiezen */}
      {stap === "keuze" && (
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-sm font-medium">Wat wil je importeren?</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {toegestaneTypes.map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  data-testid={`import-type-${t}`}
                  className={`px-4 py-2.5 rounded-md border text-sm font-medium transition-colors ${
                    type === t
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-input hover:bg-muted"
                  }`}
                >
                  {IMPORT_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div>
              <p className="text-sm font-medium">Template downloaden</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Download het Excel-sjabloon met de juiste kolomindeling voor {IMPORT_TYPE_LABELS[type].toLowerCase()}
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/import/template/${type}`} download>
                <Download className="h-4 w-4 mr-1.5" />
                Template
              </a>
            </Button>
          </div>

          <div
            className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:bg-muted/40 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium">Klik om een bestand te kiezen</p>
            <p className="text-sm text-muted-foreground mt-1">
              {isPrijsafspraken
                ? "Excel (.xlsx), CSV (.csv) of PDF (.pdf) — max 50 MB"
                : "Excel (.xlsx) of CSV (.csv) — max 50 MB"}
            </p>
            {bestand && (
              <p className="text-sm font-medium text-primary mt-2">{bestand.name}</p>
            )}
            <input
              ref={fileRef}
              type="file"
              accept={isPrijsafspraken ? ".xlsx,.xls,.csv,.pdf" : ".xlsx,.xls,.csv"}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setBestand(f);
                if (f) void (isPrijsafspraken ? uploadPrijslijstVoorstel(f) : uploadPreview(f));
              }}
            />
          </div>
          {bezig && <p className="text-sm text-center text-muted-foreground">Bestand wordt verwerkt...</p>}
        </div>
      )}

      {/* Stap 2: Kolomkoppeling */}
      {stap === "koppeling" && preview && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Kolommen koppelen</h2>
              <p className="text-sm text-muted-foreground">
                {preview.totaal_rijen} rijen gevonden — koppel de kolommen uit je bestand
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={opnieuw}>
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Opnieuw
            </Button>
          </div>

          {/* PRIJS_01 §4 — voorstel-info + defaults + proefregels (alleen prijsafspraken) */}
          {isPrijsafspraken && voorstel && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" data-testid="voorstel-bestandssoort">
                  Bestandssoort: {voorstel.bestandssoort.toUpperCase()}
                </Badge>
                {voorstel.leverancier_voorstel.naam && (
                  <Badge variant="outline">Herkende leverancier: {voorstel.leverancier_voorstel.naam}</Badge>
                )}
              </div>

              {voorstel.bestandssoort === "pdf" && (
                <div className="flex items-start gap-3 p-3 rounded-lg border bg-amber-50 dark:bg-amber-950/30" data-testid="pdf-waarschuwing">
                  <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    Dit is een PDF: {voorstel.waarschuwing ?? "kolomherkenning bij pdf is foutgevoeliger"}.
                    Controleer de proefregels en kolomkoppeling extra goed.
                    {voorstel.niet_leesbaar > 0 && ` ${voorstel.niet_leesbaar} regel(s) konden niet betrouwbaar gelezen worden en zijn weggelaten.`}
                  </p>
                </div>
              )}

              {/* Defaults: leverancier / periode / valuta — corrigeerbaar */}
              <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
                <p className="text-sm font-medium">Gegevens voor deze prijslijst (vullen ontbrekende kolommen aan)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Leverancier</label>
                    <select
                      value={prijsDefaults.leverancier_id}
                      onChange={(e) => setPrijsDefaults((p) => ({ ...p, leverancier_id: e.target.value }))}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                      data-testid="default-leverancier"
                    >
                      <option value="">— kies leverancier —</option>
                      {leveranciers.map((l) => (
                        <option key={l.id} value={String(l.id)}>{l.naam}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Valuta</label>
                    <input
                      type="text"
                      value={prijsDefaults.valuta}
                      onChange={(e) => setPrijsDefaults((p) => ({ ...p, valuta: e.target.value }))}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                      data-testid="default-valuta"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Geldig van (JJJJ-MM-DD)</label>
                    <input
                      type="date"
                      value={prijsDefaults.geldig_van}
                      onChange={(e) => setPrijsDefaults((p) => ({ ...p, geldig_van: e.target.value }))}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                      data-testid="default-geldig-van"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Geldig tot (JJJJ-MM-DD)</label>
                    <input
                      type="date"
                      value={prijsDefaults.geldig_tot}
                      onChange={(e) => setPrijsDefaults((p) => ({ ...p, geldig_tot: e.target.value }))}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                      data-testid="default-geldig-tot"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {veldDefs.map(({ veld, label, verplicht }) => (
              <div key={veld} className="flex items-center gap-3">
                <div className="w-44 shrink-0">
                  <p className="text-sm font-medium truncate">
                    {label}
                    {verplicht && <span className="text-destructive ml-0.5">*</span>}
                  </p>
                </div>
                <select
                  value={koppeling[veld] ?? ""}
                  onChange={(e) =>
                    setKoppeling((prev) => {
                      const n = { ...prev };
                      if (e.target.value) n[veld] = e.target.value;
                      else delete n[veld];
                      return n;
                    })
                  }
                  className="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                >
                  <option value="">— overslaan —</option>
                  {preview.kolommen.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={opnieuw}>Terug</Button>
            <Button
              onClick={() => void controleren()}
              disabled={bezig || !koppeling[veldDefs.find((v) => v.verplicht)?.veld ?? "naam"]}
              data-testid="knop-controleren"
            >
              {bezig ? "Controleren..." : "Controleren"}
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Stap 3: Controle-overzicht (IMPORT_01 §2.2) */}
      {stap === "controle" && preview && controle && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Controle vóór importeren</h2>
              <p className="text-sm text-muted-foreground">
                Er wordt pas iets opgeslagen na jouw bevestiging
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={opnieuw}>
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Opnieuw
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-lg border">
              <p className="text-sm text-muted-foreground">Totaal</p>
              <p className="text-2xl font-semibold" data-testid="controle-totaal">{controle.totaal_rijen}</p>
            </div>
            <div className="p-4 rounded-lg border">
              <p className="text-sm text-muted-foreground">Nieuw</p>
              <p className="text-2xl font-semibold text-green-600" data-testid="controle-nieuw">{controle.nieuw}</p>
            </div>
            <div className="p-4 rounded-lg border">
              <p className="text-sm text-muted-foreground">Lijkt al te bestaan</p>
              <p className="text-2xl font-semibold text-amber-600" data-testid="controle-dubbel">{controle.dubbel}</p>
            </div>
            <div className="p-4 rounded-lg border">
              <p className="text-sm text-muted-foreground">Onbruikbaar</p>
              <p className="text-2xl font-semibold text-destructive" data-testid="controle-onbruikbaar">{controle.onbruikbaar}</p>
            </div>
          </div>

          {controle.sleutel_omschrijving && (
            <p className="text-xs text-muted-foreground">
              Bestaande records worden herkend op: {controle.sleutel_omschrijving}
            </p>
          )}

          {controle.dubbel > 0 && (
            <div className="p-4 rounded-lg border bg-amber-50 dark:bg-amber-950/30 space-y-3" data-testid="dubbelen-waarschuwing">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">
                    {controle.dubbel} {controle.dubbel === 1 ? "rij lijkt" : "rijen lijken"} op iets dat al bestaat
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Kies wat er met deze rijen moet gebeuren. Bestaande gegevens worden nooit overschreven.
                  </p>
                </div>
              </div>
              <div className="flex gap-4 pl-8">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    checked={keuzeDubbelen === "overslaan"}
                    onChange={() => setKeuzeDubbelen("overslaan")}
                  />
                  Overslaan (aanbevolen)
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    checked={keuzeDubbelen === "als_nieuw"}
                    onChange={() => setKeuzeDubbelen("als_nieuw")}
                  />
                  Toch als nieuw toevoegen
                </label>
              </div>
            </div>
          )}

          {controle.onbruikbaar_redenen.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Onbruikbare rijen (worden overgeslagen)</p>
              <div className="border rounded-md divide-y max-h-40 overflow-y-auto">
                {controle.onbruikbaar_redenen.map((f, i) => (
                  <div key={i} className="flex gap-3 px-3 py-1.5 text-sm">
                    <span className="text-muted-foreground shrink-0">Rij {f.rij}</span>
                    <span className="text-destructive">{f.reden}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PRIJS_01 §4 — vergelijking met vorige afspraak */}
          {isPrijsafspraken && controle.vergelijking && (
            <div className="space-y-3" data-testid="prijs-vergelijking">
              <p className="text-sm font-medium">Vergelijking met de vorige geldige afspraak</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Duurder</p>
                  <p className="text-xl font-semibold text-destructive" data-testid="vergelijking-duurder">{controle.vergelijking.duurder}</p>
                </div>
                <div className="p-3 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Goedkoper</p>
                  <p className="text-xl font-semibold text-green-600" data-testid="vergelijking-goedkoper">{controle.vergelijking.goedkoper}</p>
                </div>
                <div className="p-3 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Gelijk</p>
                  <p className="text-xl font-semibold" data-testid="vergelijking-gelijk">{controle.vergelijking.gelijk}</p>
                </div>
                <div className="p-3 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Nieuw artikel</p>
                  <p className="text-xl font-semibold text-sky-600" data-testid="vergelijking-nieuw">{controle.vergelijking.nieuw}</p>
                </div>
              </div>
              {controle.vergelijking.top_verschillen.length > 0 && (
                <div className="border rounded-md overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        {Object.keys(controle.vergelijking.top_verschillen[0] ?? {}).map((k) => (
                          <th key={k} className="px-3 py-2 text-left font-medium whitespace-nowrap">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {controle.vergelijking.top_verschillen.map((rij, i) => (
                        <tr key={i} className="border-t">
                          {Object.values(rij).map((v, j) => (
                            <td key={j} className="px-3 py-1.5 whitespace-nowrap">{v == null ? "" : String(v)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* PRIJS_01 §4 — niet-koppelbare regels */}
          {isPrijsafspraken && controle.niet_koppelbaar && controle.niet_koppelbaar.aantal > 0 && (
            <div className="space-y-2" data-testid="niet-koppelbaar">
              <p className="text-sm font-medium">
                {controle.niet_koppelbaar.aantal} regel(s) zonder match op een eigen artikel
                <span className="text-muted-foreground font-normal"> — worden bewaard als leverancierscode (geen artikel aangemaakt)</span>
              </p>
              <div className="border rounded-md divide-y max-h-40 overflow-y-auto">
                {controle.niet_koppelbaar.redenen.map((f, i) => (
                  <div key={i} className="flex gap-3 px-3 py-1.5 text-sm">
                    <span className="text-muted-foreground shrink-0">Rij {f.rij}</span>
                    <span>{f.reden}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PRIJS_01 §4 — proefregels PROMINENT vóór uitvoeren */}
          {isPrijsafspraken && preview.rijen.length > 0 && (
            <div className="space-y-2" data-testid="proefregels">
              <p className="text-sm font-semibold">
                Controleer de eerste {Math.min(20, preview.rijen.length)} regels vóór je importeert
              </p>
              <div className="border rounded-md overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      {preview.kolommen.map((k) => (
                        <th key={k} className="px-3 py-2 text-left font-medium whitespace-nowrap">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rijen.slice(0, 20).map((rij, i) => (
                      <tr key={i} className="border-t">
                        {preview.kolommen.map((k) => (
                          <td key={k} className="px-3 py-1.5 whitespace-nowrap">{rij[k] ?? ""}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStap("koppeling")}>Terug</Button>
            <Button onClick={() => void uitvoeren()} disabled={bezig || controle.nieuw + (keuzeDubbelen === "als_nieuw" ? controle.dubbel : 0) === 0} data-testid="knop-importeren">
              {bezig
                ? "Importeren..."
                : `${controle.nieuw + (keuzeDubbelen === "als_nieuw" ? controle.dubbel : 0)} rijen importeren`}
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Stap 4: Resultaat */}
      {stap === "resultaat" && resultaat && (
        <div className="space-y-6">
          <div className="flex items-start gap-4 p-5 rounded-lg border bg-card">
            {resultaat.rijen_overgeslagen === 0 ? (
              <CheckCircle2 className="h-8 w-8 text-green-500 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-8 w-8 text-amber-500 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <h2 className="font-semibold text-lg">Import voltooid</h2>
              <div className="mt-2 grid grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Totaal</p>
                  <p className="font-semibold text-lg">{resultaat.rijen_totaal}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Verwerkt</p>
                  <p className="font-semibold text-lg text-green-600" data-testid="resultaat-verwerkt">{resultaat.rijen_verwerkt}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Overgeslagen</p>
                  <p className="font-semibold text-lg text-amber-600">{resultaat.rijen_overgeslagen}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Waarvan dubbel</p>
                  <p className="font-semibold text-lg text-amber-600">{resultaat.rijen_dubbel_overgeslagen ?? 0}</p>
                </div>
              </div>
            </div>
          </div>

          {resultaat.fouten.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Fouten ({resultaat.fouten.length})</p>
              <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                {resultaat.fouten.map((f, i) => (
                  <div key={i} className="flex gap-3 px-3 py-2 text-sm">
                    <span className="text-muted-foreground shrink-0">Rij {f.rij}</span>
                    <span className="text-destructive">{f.fout}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button onClick={opnieuw}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Nieuwe import
          </Button>
        </div>
      )}

      {/* Import-logboek */}
      {logs.length > 0 && (
        <div className="space-y-3 pt-4 border-t">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Importgeschiedenis</h2>
          <div className="space-y-2">
            {logs.slice(0, 15).map((log) => {
              const magDitType = toegestaneTypes.includes(log.type as ImportType);
              const detail = log.terugdraai_detail as { verwijderd?: number; niet_verwijderd?: { id: number; reden: string }[] } | null | undefined;
              return (
                <div key={log.id} className="px-4 py-2.5 rounded-md border text-sm space-y-1.5" data-testid={`import-log-${log.id}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge variant="outline" className="capitalize shrink-0">{IMPORT_TYPE_LABELS[log.type as ImportType] ?? log.type}</Badge>
                      <span className="text-muted-foreground truncate">{log.bestandsnaam}</span>
                      <span className="text-muted-foreground/70 shrink-0">#{log.id}</span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground shrink-0">
                      {log.teruggedraaid_op ? (
                        <Badge variant="secondary" className="text-muted-foreground">
                          {detail?.niet_verwijderd?.length ? "Deels teruggedraaid" : "Teruggedraaid"}
                        </Badge>
                      ) : (
                        <>
                          <span className="text-green-600">{log.rijen_verwerkt} verwerkt</span>
                          {log.rijen_overgeslagen > 0 && (
                            <span className="text-amber-600">{log.rijen_overgeslagen} overgeslagen</span>
                          )}
                        </>
                      )}
                      <span>
                        {formatDistanceToNow(new Date(log.aangemaakt_op), { addSuffix: true, locale: nl })}
                      </span>
                      {log.bestand_beschikbaar && magDitType && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={`/api/import/logs/${log.id}/bestand`} download title="Origineel bestand downloaden">
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      {!log.teruggedraaid_op && magDitType && log.rijen_verwerkt > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void terugdraaien(log.id)}
                          disabled={terugdraaiBezig === log.id}
                          data-testid={`terugdraai-${log.id}`}
                          title="Import terugdraaien"
                        >
                          <Undo2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {detail?.niet_verwijderd && detail.niet_verwijderd.length > 0 && (
                    <p className="text-xs text-muted-foreground pl-1">
                      Niet teruggedraaid: {detail.niet_verwijderd.length} records ({[...new Set(detail.niet_verwijderd.map((n) => n.reden))].join("; ")})
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
