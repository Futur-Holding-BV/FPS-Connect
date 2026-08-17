import { useState, useRef } from "react";
import { Link, useParams } from "wouter";
import {
  useGetGereedschap,
  useUpdateGereedschap,
  useListGereedschapBruikleen,
  useListGereedschapMeldingen,
  useCreateGereedschapMelding,
  useCreateBruikleen,
  useVerwerkRetourgave,
  useGetGereedschapUploadUrl,
  useAnalyseGereedschapFoto,
  useAiVeldCorrectie,
} from "@workspace/api-client-react";
import type {
  GereedschapInput, BruikleenInput, GereedschapMeldingInput, GereedschapAiVoorstel,
} from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useListMedewerkers } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ChevronLeft, Pencil, AlertTriangle, Package, ClipboardList, Wrench,
  Camera, Sparkles, CheckCircle,
} from "lucide-react";

const STATUSSEN = [
  "Beschikbaar", "In bruikleen", "Defect gemeld", "Beschadigd",
  "Ter keuring", "Afgekeurd", "In reparatie", "Vermist", "Afgeschreven",
];

const AANDRIJVINGEN = ["handgereedschap", "elektrisch", "accu", "machine", "overig"];

function statusKleur(status: string): string {
  switch (status) {
    case "Beschikbaar":   return "bg-green-100 text-green-800";
    case "In bruikleen":  return "bg-blue-100 text-blue-800";
    case "Defect gemeld": return "bg-orange-100 text-orange-800";
    case "Beschadigd":    return "bg-red-100 text-red-800";
    case "Ter keuring":   return "bg-yellow-100 text-yellow-800";
    case "Afgekeurd":     return "bg-red-200 text-red-900";
    case "In reparatie":  return "bg-amber-100 text-amber-800";
    case "Vermist":       return "bg-purple-100 text-purple-800";
    case "Afgeschreven":  return "bg-gray-100 text-gray-600";
    default:              return "bg-gray-100 text-gray-700";
  }
}

function urgentieKleur(urgentie: string): string {
  switch (urgentie) {
    case "kritiek": return "bg-red-100 text-red-800";
    case "hoog":    return "bg-orange-100 text-orange-800";
    case "normaal": return "bg-blue-100 text-blue-800";
    case "laag":    return "bg-gray-100 text-gray-700";
    default:        return "bg-gray-100 text-gray-700";
  }
}

function GegraveerLabel({ label, waarde }: { label: string; waarde?: string | number | boolean | null }) {
  if (waarde === null || waarde === undefined || waarde === "") return null;
  const tekst = typeof waarde === "boolean" ? (waarde ? "Ja" : "Nee") : String(waarde);
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{tekst}</p>
    </div>
  );
}

export default function GereedschapDetailPagina() {
  const { id } = useParams<{ id: string }>();
  const gereedschapId = parseInt(id!);
  const { heeftNiveau } = useBevoegdheid();
  const magSchrijven = heeftNiveau("gereedschappen", 2);
  const queryClient = useQueryClient();

  const [bewerkOpen, setBewerkOpen] = useState(false);
  const [bruikleenOpen, setBruikleenOpen] = useState(false);
  const [meldingOpen, setMeldingOpen] = useState(false);
  const [bewerkFormulier, setBewerkFormulier] = useState<Partial<GereedschapInput>>({});
  const [innameId, setInnameId] = useState<number | null>(null);
  const [innameFormulier, setInnameFormulier] = useState({ datum_inname: new Date().toISOString().slice(0, 10), staat_bij_inname: "" });

  const fotoInputRef = useRef<HTMLInputElement>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [fotoUploaden, setFotoUploaden] = useState(false);
  const [aiLaden, setAiLaden] = useState(false);
  const [aiVoorstel, setAiVoorstel] = useState<GereedschapAiVoorstel | null>(null);
  const [fotoFout, setFotoFout] = useState<string | null>(null);

  // Leerlus: bewaar het overgenomen AI-voorstel zodat we bij opslaan per veld
  // kunnen vastleggen wat de gebruiker uiteindelijk (evt. na bewerking) opslaat.
  const overgenomenVoorstelRef = useRef<GereedschapAiVoorstel | null>(null);

  const getUploadUrl = useGetGereedschapUploadUrl();
  const analyseAi = useAnalyseGereedschapFoto();
  const veldCorrectieMutatie = useAiVeldCorrectie();

  const { data: gereedschap, isLoading } = useGetGereedschap(gereedschapId);
  const { data: bruikleenHistory } = useListGereedschapBruikleen(gereedschapId);
  const { data: meldingen } = useListGereedschapMeldingen(gereedschapId);
  const { data: medewerkers } = useListMedewerkers();

  const [bruikleenForm, setBruikleenForm] = useState<BruikleenInput>({
    gereedschap_id: gereedschapId,
    medewerker_id: 0,
    datum_uitgifte: new Date().toISOString().slice(0, 10),
    staat_bij_uitgifte: null,
    accessoires: null,
    bruikleen_voorwaarden: null,
    opmerkingen: null,
  });

  const [meldingForm, setMeldingForm] = useState<GereedschapMeldingInput>({
    soort_melding: "defect",
    omschrijving: "",
    urgentie: "normaal",
    datum_melding: new Date().toISOString().slice(0, 10),
    opmerkingen: null,
    kan_nog_veilig_gebruikt_worden: null,
  });

  const updateGereedschap = useUpdateGereedschap({
    mutation: {
      onSuccess: (_data, variables) => {
        // Leerlus: pas na een succesvolle opslag vastleggen wat de gebruiker
        // overnam t.o.v. het AI-fotovoorstel (fire-and-forget, blokkeert niet).
        logAiVeldCorrecties(variables.data as GereedschapInput);
        queryClient.invalidateQueries({ queryKey: ["getGereedschap", gereedschapId] });
        queryClient.invalidateQueries({ queryKey: ["listGereedschappen"] });
        setBewerkOpen(false);
      },
    },
  });

  // Legt per door de foto-AI voorgesteld veld vast wat er is opgeslagen.
  // Alleen velden met een niet-leeg AI-voorstel worden gelogd.
  function logAiVeldCorrecties(opgeslagen: Partial<GereedschapInput>) {
    const voorstel = overgenomenVoorstelRef.current;
    if (!voorstel) return;
    const velden: Array<[string, string, string]> = [
      ["omschrijving", voorstel.omschrijving?.trim() ?? "", opgeslagen.omschrijving ?? ""],
      ["merk", voorstel.merk?.trim() ?? "", opgeslagen.merk ?? ""],
      ["type", voorstel.type?.trim() ?? "", opgeslagen.type ?? ""],
      ["categorie", voorstel.categorie?.trim() ?? "", opgeslagen.categorie ?? ""],
      ["aandrijving", voorstel.aandrijving?.trim() ?? "", opgeslagen.aandrijving ?? ""],
    ];
    for (const [veld, aiWaarde, gekozen] of velden) {
      if (!aiWaarde) continue;
      veldCorrectieMutatie.mutate(
        {
          data: {
            veld_naam: `gereedschap.${veld}`,
            ai_voorstel: aiWaarde,
            gekozen,
            tekst_fragment: (opgeslagen.omschrijving ?? "").slice(0, 200) || undefined,
          },
        },
        {
          onError: (err) => console.debug("veld-correctie loggen mislukt", err),
        },
      );
    }
  }

  const maakBruikleen = useCreateBruikleen({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["listGereedschapBruikleen", gereedschapId] });
        queryClient.invalidateQueries({ queryKey: ["getGereedschap", gereedschapId] });
        queryClient.invalidateQueries({ queryKey: ["listGereedschappen"] });
        setBruikleenOpen(false);
      },
    },
  });

  const verwerkRetourgave = useVerwerkRetourgave({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["listGereedschapBruikleen", gereedschapId] });
        queryClient.invalidateQueries({ queryKey: ["getGereedschap", gereedschapId] });
        setInnameId(null);
      },
    },
  });

  const maakMelding = useCreateGereedschapMelding({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["listGereedschapMeldingen", gereedschapId] });
        queryClient.invalidateQueries({ queryKey: ["getGereedschap", gereedschapId] });
        setMeldingOpen(false);
        setMeldingForm({
          soort_melding: "defect",
          omschrijving: "",
          urgentie: "normaal",
          datum_melding: new Date().toISOString().slice(0, 10),
          opmerkingen: null,
          kan_nog_veilig_gebruikt_worden: null,
        });
      },
    },
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Laden...</div>;
  if (!gereedschap) return <div className="p-6 text-muted-foreground">Gereedschap niet gevonden.</div>;

  async function handleFotoSelectie(e: React.ChangeEvent<HTMLInputElement>) {
    const bestand = e.target.files?.[0];
    if (!bestand) return;
    setFotoFout(null);
    setAiVoorstel(null);
    setFotoPreview(URL.createObjectURL(bestand));
    setFotoUploaden(true);
    try {
      const urlData = await getUploadUrl.mutateAsync();
      const { upload_url, object_path } = urlData as { upload_url: string; object_path: string };
      const uploadResp = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": bestand.type || "image/jpeg" },
        body: bestand,
      });
      if (!uploadResp.ok) throw new Error("Foto uploaden mislukt");
      setBewerkFormulier((f) => ({ ...f, foto_url: object_path }));
      setFotoUploaden(false);
      setAiLaden(true);
      const voorstel = await analyseAi.mutateAsync({ id: gereedschapId, data: { foto_url: object_path } });
      setAiVoorstel(voorstel as GereedschapAiVoorstel);
    } catch (err) {
      setFotoFout(err instanceof Error ? err.message : "Upload of analyse mislukt");
    } finally {
      setFotoUploaden(false);
      setAiLaden(false);
      if (fotoInputRef.current) fotoInputRef.current.value = "";
    }
  }

  function accepteerVoorstel() {
    if (!aiVoorstel) return;
    setBewerkFormulier((f) => ({
      ...f,
      omschrijving: aiVoorstel.omschrijving || f.omschrijving,
      merk: aiVoorstel.merk ?? f.merk,
      type: aiVoorstel.type ?? f.type,
      categorie: aiVoorstel.categorie || f.categorie,
      aandrijving: aiVoorstel.aandrijving || f.aandrijving,
      met_snoer: aiVoorstel.met_snoer ?? f.met_snoer,
      accu_inbegrepen: aiVoorstel.accu_inbegrepen ?? f.accu_inbegrepen,
      lader_inbegrepen: aiVoorstel.lader_inbegrepen ?? f.lader_inbegrepen,
      koffer_inbegrepen: aiVoorstel.koffer_inbegrepen ?? f.koffer_inbegrepen,
      keuringsplichtig: aiVoorstel.keuringsplichtig ?? f.keuringsplichtig,
      opmerkingen: aiVoorstel.staat_indicatie
        ? `Staat bij wijziging: ${aiVoorstel.staat_indicatie}`
        : f.opmerkingen,
    }));
    // Leerlus: onthoud het overgenomen voorstel voor vastlegging bij opslaan.
    overgenomenVoorstelRef.current = aiVoorstel;
    setAiVoorstel(null);
  }

  function openBewerken() {
    setBewerkFormulier({
      omschrijving: gereedschap!.omschrijving,
      gegraveerd_nummer: gereedschap!.gegraveerd_nummer,
      merk: gereedschap!.merk,
      type: gereedschap!.type,
      serienummer: gereedschap!.serienummer,
      categorie: gereedschap!.categorie,
      aandrijving: gereedschap!.aandrijving,
      met_snoer: gereedschap!.met_snoer,
      accu_inbegrepen: gereedschap!.accu_inbegrepen,
      lader_inbegrepen: gereedschap!.lader_inbegrepen,
      koffer_inbegrepen: gereedschap!.koffer_inbegrepen,
      aankoopdatum: gereedschap!.aankoopdatum,
      aankoopprijs: gereedschap!.aankoopprijs,
      leverancier: gereedschap!.leverancier,
      garantietermijn: gereedschap!.garantietermijn,
      status: gereedschap!.status,
      locatie: gereedschap!.locatie,
      keuringsplichtig: gereedschap!.keuringsplichtig,
      laatste_keuring: gereedschap!.laatste_keuring,
      volgende_keuring: gereedschap!.volgende_keuring,
      opmerkingen: gereedschap!.opmerkingen,
      foto_url: gereedschap!.foto_url,
    });
    setFotoPreview(null);
    setAiVoorstel(null);
    overgenomenVoorstelRef.current = null;
    setFotoFout(null);
    setBewerkOpen(true);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/gereedschappen">
          <Button variant="ghost" size="sm" className="gap-1">
            <ChevronLeft className="h-4 w-4" />
            Gereedschappen
          </Button>
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-[#F23B0D] font-medium">{gereedschap.volgnummer}</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusKleur(gereedschap.status)}`}>
              {gereedschap.status}
            </span>
            {gereedschap.keuringsplichtig && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                <AlertTriangle className="h-3 w-3" />
                Keuringsplichtig
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold">{gereedschap.omschrijving}</h1>
          {gereedschap.merk && (
            <p className="text-sm text-muted-foreground">
              {[gereedschap.merk, gereedschap.type].filter(Boolean).join(" ")}
            </p>
          )}
        </div>
        {magSchrijven && (
          <Button variant="outline" onClick={openBewerken} className="gap-2">
            <Pencil className="h-4 w-4" />
            Bewerken
          </Button>
        )}
      </div>

      <Tabs defaultValue="gegevens">
        <TabsList>
          <TabsTrigger value="gegevens" className="gap-2">
            <Wrench className="h-4 w-4" />
            Gegevens
          </TabsTrigger>
          <TabsTrigger value="bruikleen" className="gap-2">
            <Package className="h-4 w-4" />
            Bruikleen
            {bruikleenHistory && bruikleenHistory.length > 0 && (
              <span className="ml-1 bg-muted text-muted-foreground text-xs px-1.5 py-0.5 rounded-full">
                {bruikleenHistory.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="meldingen" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            Meldingen
            {meldingen && meldingen.length > 0 && (
              <span className="ml-1 bg-muted text-muted-foreground text-xs px-1.5 py-0.5 rounded-full">
                {meldingen.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="gegevens" className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {gereedschap.foto_url && (
              <div className="md:col-span-2 border rounded-lg overflow-hidden">
                <img
                  src={`/api/storage${gereedschap.foto_url}`}
                  alt={gereedschap.omschrijving}
                  className="w-full max-h-56 object-contain bg-muted"
                />
              </div>
            )}
            <div className="space-y-4 border rounded-lg p-4">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Identificatie</h3>
              <div className="grid grid-cols-2 gap-3">
                <GegraveerLabel label="Volgnummer" waarde={gereedschap.volgnummer} />
                <GegraveerLabel label="Gegraveerd nummer" waarde={gereedschap.gegraveerd_nummer} />
                <GegraveerLabel label="Serienummer" waarde={gereedschap.serienummer} />
                <GegraveerLabel label="Categorie" waarde={gereedschap.categorie} />
                <GegraveerLabel label="Aandrijving" waarde={gereedschap.aandrijving} />
                <GegraveerLabel label="Locatie" waarde={gereedschap.locatie} />
              </div>
            </div>

            <div className="space-y-4 border rounded-lg p-4">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Aankoop</h3>
              <div className="grid grid-cols-2 gap-3">
                <GegraveerLabel label="Leverancier" waarde={gereedschap.leverancier} />
                <GegraveerLabel label="Aankoopdatum" waarde={gereedschap.aankoopdatum} />
                <GegraveerLabel label="Aankoopprijs" waarde={gereedschap.aankoopprijs != null ? `€ ${gereedschap.aankoopprijs.toFixed(2)}` : null} />
                <GegraveerLabel label="Garantietermijn" waarde={gereedschap.garantietermijn} />
              </div>
            </div>

            <div className="space-y-4 border rounded-lg p-4">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Toebehoren</h3>
              <div className="grid grid-cols-2 gap-3">
                <GegraveerLabel label="Met snoer" waarde={gereedschap.met_snoer} />
                <GegraveerLabel label="Accu inbegrepen" waarde={gereedschap.accu_inbegrepen} />
                <GegraveerLabel label="Lader inbegrepen" waarde={gereedschap.lader_inbegrepen} />
                <GegraveerLabel label="Koffer inbegrepen" waarde={gereedschap.koffer_inbegrepen} />
              </div>
            </div>

            <div className="space-y-4 border rounded-lg p-4">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Keuring & status</h3>
              <div className="grid grid-cols-2 gap-3">
                <GegraveerLabel label="Keuringsplichtig" waarde={gereedschap.keuringsplichtig} />
                <GegraveerLabel label="Laatste keuring" waarde={gereedschap.laatste_keuring} />
                <GegraveerLabel label="Volgende keuring" waarde={gereedschap.volgende_keuring} />
                <GegraveerLabel label="Huidige medewerker" waarde={gereedschap.huidige_medewerker_naam} />
              </div>
              {gereedschap.opmerkingen && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground">Opmerkingen</p>
                  <p className="text-sm mt-1">{gereedschap.opmerkingen}</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="bruikleen" className="pt-4">
          <div className="space-y-4">
            {magSchrijven && gereedschap.status === "Beschikbaar" && (
              <div className="flex justify-end">
                <Button
                  onClick={() => setBruikleenOpen(true)}
                  className="bg-[#F23B0D] hover:bg-[#d43309] text-white"
                >
                  <Package className="h-4 w-4 mr-2" />
                  Uitgifte registreren
                </Button>
              </div>
            )}
            {!bruikleenHistory || bruikleenHistory.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground border rounded-lg">
                <Package className="h-8 w-8 mx-auto opacity-30 mb-2" />
                <p>Geen bruikleenhistorie</p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medewerker</TableHead>
                      <TableHead>Datum uitgifte</TableHead>
                      <TableHead>Datum inname</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Staat uitgifte</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bruikleenHistory.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.medewerker_naam ?? "Onbekend"}</TableCell>
                        <TableCell>{b.datum_uitgifte}</TableCell>
                        <TableCell>{b.datum_inname ?? "—"}</TableCell>
                        <TableCell>
                          {b.definitief ? (
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">Definitief</span>
                          ) : (
                            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">Concept</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{b.staat_bij_uitgifte ?? "—"}</TableCell>
                        <TableCell>
                          {magSchrijven && !b.datum_inname && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setInnameId(b.id)}
                            >
                              Inname
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="meldingen" className="pt-4">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setMeldingOpen(true)}>
                <AlertTriangle className="h-4 w-4 mr-2" />
                Melding toevoegen
              </Button>
            </div>
            {!meldingen || meldingen.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground border rounded-lg">
                <ClipboardList className="h-8 w-8 mx-auto opacity-30 mb-2" />
                <p>Geen meldingen</p>
              </div>
            ) : (
              <div className="space-y-3">
                {meldingen.map((m) => (
                  <div key={m.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium capitalize">{m.soort_melding}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${urgentieKleur(m.urgentie)}`}>{m.urgentie}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        m.status === "afgehandeld" ? "bg-green-100 text-green-800" :
                        m.status === "in_behandeling" ? "bg-blue-100 text-blue-800" :
                        "bg-gray-100 text-gray-700"
                      }`}>{m.status.replace("_", " ")}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{m.datum_melding}</span>
                    </div>
                    <p className="text-sm">{m.omschrijving}</p>
                    {m.gemeld_door_naam && (
                      <p className="text-xs text-muted-foreground">Gemeld door: {m.gemeld_door_naam}</p>
                    )}
                    {m.kan_nog_veilig_gebruikt_worden === false && (
                      <p className="text-xs text-red-600 font-medium">Kan niet meer veilig gebruikt worden</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={bewerkOpen} onOpenChange={(open) => {
        if (!open) { setAiVoorstel(null); setFotoPreview(null); setFotoFout(null); }
        setBewerkOpen(open);
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gereedschap bewerken</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <input
              ref={fotoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFotoSelectie}
            />
            <div className="rounded-lg border border-dashed border-muted-foreground/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Foto</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fotoInputRef.current?.click()}
                  disabled={fotoUploaden || aiLaden}
                  className="gap-2"
                >
                  <Camera className="h-4 w-4" />
                  {fotoUploaden ? "Uploaden..." : aiLaden ? "AI analyseert..." : bewerkFormulier.foto_url ?? gereedschap.foto_url ? "Andere foto" : "Foto nemen"}
                </Button>
              </div>
              {(fotoPreview || (bewerkFormulier.foto_url ?? gereedschap.foto_url)) && (
                <img
                  src={fotoPreview ?? `/api/storage${bewerkFormulier.foto_url ?? gereedschap.foto_url}`}
                  alt="Gereedschap foto"
                  className="w-full max-h-40 object-contain rounded border"
                />
              )}
              {fotoFout && <p className="text-xs text-red-600">{fotoFout}</p>}
              {aiVoorstel && (
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-600 shrink-0" />
                    <span className="text-xs font-semibold text-amber-800">AI-voorstel op basis van de foto</span>
                  </div>
                  <div className="text-xs text-amber-900 space-y-0.5">
                    <p><span className="font-medium">Omschrijving:</span> {aiVoorstel.omschrijving}</p>
                    {aiVoorstel.merk && <p><span className="font-medium">Merk:</span> {aiVoorstel.merk}</p>}
                    {aiVoorstel.type && <p><span className="font-medium">Type:</span> {aiVoorstel.type}</p>}
                    <p><span className="font-medium">Categorie:</span> {aiVoorstel.categorie} &middot; {aiVoorstel.aandrijving}</p>
                    {aiVoorstel.staat_indicatie && <p><span className="font-medium">Staat:</span> {aiVoorstel.staat_indicatie}</p>}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={accepteerVoorstel}
                    className="gap-2 bg-amber-600 hover:bg-amber-700 text-white w-full"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Voorstel overnemen in formulier
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label>Omschrijving</Label>
              <Input
                value={bewerkFormulier.omschrijving ?? ""}
                onChange={(e) => setBewerkFormulier((f) => ({ ...f, omschrijving: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Status</Label>
                <Select
                  value={bewerkFormulier.status ?? gereedschap.status}
                  onValueChange={(v) => setBewerkFormulier((f) => ({ ...f, status: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSSEN.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Locatie</Label>
                <Input
                  value={bewerkFormulier.locatie ?? ""}
                  onChange={(e) => setBewerkFormulier((f) => ({ ...f, locatie: e.target.value || null }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Laatste keuring</Label>
                <DatePicker
                  value={bewerkFormulier.laatste_keuring ?? ""}
                  onChange={(v) => setBewerkFormulier((f) => ({ ...f, laatste_keuring: v || null }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Volgende keuring</Label>
                <DatePicker
                  value={bewerkFormulier.volgende_keuring ?? ""}
                  onChange={(v) => setBewerkFormulier((f) => ({ ...f, volgende_keuring: v || null }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Opmerkingen</Label>
              <Input
                value={bewerkFormulier.opmerkingen ?? ""}
                onChange={(e) => setBewerkFormulier((f) => ({ ...f, opmerkingen: e.target.value || null }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBewerkOpen(false)}>Annuleren</Button>
            <Button
              onClick={() => updateGereedschap.mutate({ id: gereedschapId, data: bewerkFormulier as GereedschapInput })}
              className="bg-[#F23B0D] hover:bg-[#d43309] text-white"
            >
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bruikleenOpen} onOpenChange={setBruikleenOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Uitgifte registreren</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Medewerker <span className="text-red-500">*</span></Label>
              <Select
                value={bruikleenForm.medewerker_id > 0 ? String(bruikleenForm.medewerker_id) : ""}
                onValueChange={(v) => setBruikleenForm((f) => ({ ...f, medewerker_id: parseInt(v) }))}
              >
                <SelectTrigger><SelectValue placeholder="Selecteer medewerker" /></SelectTrigger>
                <SelectContent>
                  {medewerkers?.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.naam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Datum uitgifte</Label>
              <DatePicker
                value={bruikleenForm.datum_uitgifte}
                onChange={(v) => setBruikleenForm((f) => ({ ...f, datum_uitgifte: v }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Staat bij uitgifte</Label>
              <Input
                placeholder="bijv. goed, lichte gebruikssporen"
                value={bruikleenForm.staat_bij_uitgifte ?? ""}
                onChange={(e) => setBruikleenForm((f) => ({ ...f, staat_bij_uitgifte: e.target.value || null }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Meegeleverde accessoires</Label>
              <Input
                placeholder="bijv. 2 accu's, lader, koffer"
                value={bruikleenForm.accessoires ?? ""}
                onChange={(e) => setBruikleenForm((f) => ({ ...f, accessoires: e.target.value || null }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Bruikleenvoorwaarden</Label>
              <Input
                placeholder="eventuele voorwaarden..."
                value={bruikleenForm.bruikleen_voorwaarden ?? ""}
                onChange={(e) => setBruikleenForm((f) => ({ ...f, bruikleen_voorwaarden: e.target.value || null }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBruikleenOpen(false)}>Annuleren</Button>
            <Button
              disabled={!bruikleenForm.medewerker_id || bruikleenForm.medewerker_id === 0}
              onClick={() => maakBruikleen.mutate({ data: { ...bruikleenForm, gereedschap_id: gereedschapId } })}
              className="bg-[#F23B0D] hover:bg-[#d43309] text-white"
            >
              Uitgifte vastleggen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={innameId !== null} onOpenChange={(o) => { if (!o) setInnameId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Inname verwerken</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Datum inname</Label>
              <DatePicker
                value={innameFormulier.datum_inname}
                onChange={(v) => setInnameFormulier((f) => ({ ...f, datum_inname: v }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Staat bij inname</Label>
              <Input
                placeholder="bijv. goed, beschadigd"
                value={innameFormulier.staat_bij_inname}
                onChange={(e) => setInnameFormulier((f) => ({ ...f, staat_bij_inname: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInnameId(null)}>Annuleren</Button>
            <Button
              onClick={() => innameId && verwerkRetourgave.mutate({
                id: innameId,
                data: {
                  datum_inname: innameFormulier.datum_inname,
                  staat_bij_inname: innameFormulier.staat_bij_inname || null,
                  opmerkingen: null,
                },
              })}
              className="bg-[#F23B0D] hover:bg-[#d43309] text-white"
            >
              Inname verwerken
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={meldingOpen} onOpenChange={setMeldingOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Melding toevoegen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Soort melding</Label>
                <Select
                  value={meldingForm.soort_melding}
                  onValueChange={(v) => setMeldingForm((f) => ({ ...f, soort_melding: v as "schade" | "defect" | "vermissing" }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="defect">Defect</SelectItem>
                    <SelectItem value="schade">Schade</SelectItem>
                    <SelectItem value="vermissing">Vermissing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Urgentie</Label>
                <Select
                  value={meldingForm.urgentie ?? "normaal"}
                  onValueChange={(v) => setMeldingForm((f) => ({ ...f, urgentie: v as "laag" | "normaal" | "hoog" | "kritiek" }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="laag">Laag</SelectItem>
                    <SelectItem value="normaal">Normaal</SelectItem>
                    <SelectItem value="hoog">Hoog</SelectItem>
                    <SelectItem value="kritiek">Kritiek</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Omschrijving <span className="text-red-500">*</span></Label>
              <Input
                placeholder="Beschrijf het defect, schade of vermissing..."
                value={meldingForm.omschrijving}
                onChange={(e) => setMeldingForm((f) => ({ ...f, omschrijving: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Datum melding</Label>
              <DatePicker
                value={meldingForm.datum_melding}
                onChange={(v) => setMeldingForm((f) => ({ ...f, datum_melding: v }))}
              />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={meldingForm.kan_nog_veilig_gebruikt_worden === false}
                onChange={(e) => setMeldingForm((f) => ({ ...f, kan_nog_veilig_gebruikt_worden: e.target.checked ? false : null }))}
                className="rounded"
              />
              Kan niet meer veilig gebruikt worden
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMeldingOpen(false)}>Annuleren</Button>
            <Button
              disabled={!meldingForm.omschrijving}
              onClick={() => maakMelding.mutate({ id: gereedschapId, data: meldingForm })}
              className="bg-[#F23B0D] hover:bg-[#d43309] text-white"
            >
              Melding opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
