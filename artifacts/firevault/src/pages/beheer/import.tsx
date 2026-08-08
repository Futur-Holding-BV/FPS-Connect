import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useListImportLogs } from "@workspace/api-client-react";
import { Upload, CheckCircle2, AlertCircle, ArrowRight, FileSpreadsheet, RotateCcw, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PaginaHulp } from "@/components/pagina-hulp";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

type ImportType = "leveranciers" | "klanten" | "artikelen" | "medewerkers" | "gebouwen" | "contactpersonen" | "magazijn_artikelen" | "historische_facturen" | "historische_projecten";

const IMPORT_TYPE_LABELS: Record<ImportType, string> = {
  leveranciers: "Leveranciers",
  klanten: "Klanten",
  artikelen: "Artikelen",
  medewerkers: "Medewerkers",
  gebouwen: "Gebouwen",
  contactpersonen: "Contactpersonen",
  magazijn_artikelen: "Magazijnartikelen",
  historische_facturen: "Historische facturen (archief)",
  historische_projecten: "Historische projecten (archief)",
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
    { veld: "werkmaatschappij", label: "Werkmaatschappij" },
    { veld: "adres", label: "Woonadres" },
    { veld: "postcode", label: "Postcode" },
    { veld: "woonplaats", label: "Woonplaats" },
    { veld: "actief", label: "Actief (ja/nee)" },
    { veld: "opmerkingen", label: "Opmerkingen" },
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

type Stap = "keuze" | "koppeling" | "preview" | "resultaat";

interface PreviewData {
  kolommen: string[];
  rijen: Record<string, string>[];
  totaal_rijen: number;
  bestand_id: string;
}

interface Resultaat {
  type: string;
  rijen_totaal: number;
  rijen_verwerkt: number;
  rijen_overgeslagen: number;
  fouten: { rij: number; fout: string }[];
}

export default function ImportPagina() {
  const [stap, setStap] = useState<Stap>("keuze");
  const [type, setType] = useState<ImportType>("leveranciers");
  const [bestand, setBestand] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [koppeling, setKoppeling] = useState<Record<string, string>>({});
  const [resultaat, setResultaat] = useState<Resultaat | null>(null);
  const [bezig, setBezig] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { heeftNiveau } = useBevoegdheid();
  const magImporteren = heeftNiveau("systeem", 2); // uploaden/uitvoeren; lezen (logs/templates) = systeem:1
  const { data: logs = [], refetch: refetchLogs } = useListImportLogs();

  const veldDefs = VELD_DEFINITIES[type];

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

      // Auto-koppeling: kolom die exact overeenkomt met veld
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

  async function uitvoeren() {
    if (!preview) return;
    setBezig(true);
    try {
      const resp = await fetch("/api/import/uitvoeren", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bestand_id: preview.bestand_id, type, kolomkoppeling: koppeling }),
      });
      const data = await resp.json() as Resultaat;
      setResultaat(data);
      setStap("resultaat");
      void refetchLogs();
    } catch {
      toast({ title: "Import mislukt", variant: "destructive" });
    } finally {
      setBezig(false);
    }
  }

  function opnieuw() {
    setStap("keuze");
    setBestand(null);
    setPreview(null);
    setKoppeling({});
    setResultaat(null);
    if (fileRef.current) fileRef.current.value = "";
  }

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
              {(Object.keys(IMPORT_TYPE_LABELS) as ImportType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
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
            <Button
              variant="outline"
              size="sm"
              asChild
            >
              <a href={`/api/import/template/${type}`} download>
                <Download className="h-4 w-4 mr-1.5" />
                Template
              </a>
            </Button>
          </div>

          {!magImporteren && (
            <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
              Je kunt hier importlogboeken en templates bekijken. Voor het uitvoeren van
              een import is systeembeheer-schrijfrecht nodig.
            </div>
          )}
          <div
            className={magImporteren
              ? "border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:bg-muted/40 transition-colors"
              : "border-2 border-dashed rounded-lg p-10 text-center opacity-50 pointer-events-none"}
            onClick={() => magImporteren && fileRef.current?.click()}
          >
            <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium">Klik om een bestand te kiezen</p>
            <p className="text-sm text-muted-foreground mt-1">Excel (.xlsx) of CSV (.csv) — max 50 MB</p>
            {bestand && (
              <p className="text-sm font-medium text-primary mt-2">{bestand.name}</p>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setBestand(f);
                if (f) void uploadPreview(f);
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
              onClick={() => setStap("preview")}
              disabled={!koppeling[veldDefs.find((v) => v.verplicht)?.veld ?? "naam"]}
            >
              Voorvertoning
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Stap 3: Preview */}
      {stap === "preview" && preview && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Voorvertoning</h2>
              <p className="text-sm text-muted-foreground">
                Eerste {Math.min(preview.rijen.length, 20)} van {preview.totaal_rijen} rijen
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={opnieuw}>
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Opnieuw
            </Button>
          </div>

          <div className="overflow-x-auto border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  {Object.entries(koppeling).map(([veld]) => {
                    const def = veldDefs.find((d) => d.veld === veld);
                    return (
                      <th key={veld} className="text-left px-3 py-2 font-medium whitespace-nowrap">
                        {def?.label ?? veld}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {preview.rijen.map((rij, i) => (
                  <tr key={i} className="border-t">
                    {Object.entries(koppeling).map(([veld, kolom]) => (
                      <td key={veld} className="px-3 py-1.5 text-muted-foreground max-w-[180px] truncate">
                        {rij[kolom] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStap("koppeling")}>Terug</Button>
            <Button onClick={uitvoeren} disabled={bezig}>
              {bezig ? "Importeren..." : `${preview.totaal_rijen} rijen importeren`}
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
              <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Totaal</p>
                  <p className="font-semibold text-lg">{resultaat.rijen_totaal}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Verwerkt</p>
                  <p className="font-semibold text-lg text-green-600">{resultaat.rijen_verwerkt}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Overgeslagen</p>
                  <p className="font-semibold text-lg text-amber-600">{resultaat.rijen_overgeslagen}</p>
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
            {logs.slice(0, 10).map((log) => (
              <div key={log.id} className="flex items-center justify-between px-4 py-2.5 rounded-md border text-sm">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="capitalize">{log.type}</Badge>
                  <span className="text-muted-foreground truncate max-w-48">{log.bestandsnaam}</span>
                </div>
                <div className="flex items-center gap-4 text-muted-foreground shrink-0">
                  <span className="text-green-600">{log.rijen_verwerkt} verwerkt</span>
                  {log.rijen_overgeslagen > 0 && (
                    <span className="text-amber-600">{log.rijen_overgeslagen} overgeslagen</span>
                  )}
                  <span>
                    {formatDistanceToNow(new Date(log.aangemaakt_op), { addSuffix: true, locale: nl })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
