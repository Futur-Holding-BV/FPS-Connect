import { useState, useRef } from "react";
import { useLocation } from "wouter";
import {
  useListGereedschappen, useCreateGereedschap,
  useGetGereedschapUploadUrl, useAnalyseGereedschapFoto,
} from "@workspace/api-client-react";
import type { GereedschapInput, Gereedschap, GereedschapAiVoorstel } from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ListCard } from "@/components/ui/list-card";
import { Plus, Wrench, Search, User, Camera, Sparkles, CheckCircle, AlertTriangle } from "lucide-react";

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

function statusStreep(status: string): string {
  switch (status) {
    case "Beschikbaar":   return "bg-green-500";
    case "In bruikleen":  return "bg-blue-500";
    case "Defect gemeld": return "bg-orange-500";
    case "Beschadigd":    return "bg-red-500";
    case "Ter keuring":   return "bg-yellow-400";
    case "Afgekeurd":     return "bg-red-700";
    case "In reparatie":  return "bg-amber-500";
    case "Vermist":       return "bg-purple-500";
    case "Afgeschreven":  return "bg-gray-400";
    default:              return "bg-gray-300";
  }
}

const leegFormulier: GereedschapInput = {
  omschrijving: "",
  categorie: "overig",
  aandrijving: "handgereedschap",
  gegraveerd_nummer: null,
  merk: null,
  type: null,
  serienummer: null,
  met_snoer: false,
  accu_inbegrepen: false,
  lader_inbegrepen: false,
  koffer_inbegrepen: false,
  aankoopdatum: null,
  aankoopprijs: null,
  leverancier: null,
  garantietermijn: null,
  status: "Beschikbaar",
  keuringsplichtig: false,
  locatie: null,
  laatste_keuring: null,
  volgende_keuring: null,
  opmerkingen: null,
  huidige_medewerker_id: null,
  foto_url: null,
};

export default function GereedschappenPagina() {
  const { heeftNiveau } = useBevoegdheid();
  const magSchrijven = heeftNiveau("gereedschappen", 2);
  const [, navigate] = useLocation();

  const [zoek, setZoek] = useState("");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [formulier, setFormulier] = useState<GereedschapInput>(leegFormulier);
  const [opslaan, setOpslaan] = useState(false);

  const fotoInputRef = useRef<HTMLInputElement>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [fotoObjectPad, setFotoObjectPad] = useState<string | null>(null);
  const [fotoUploaden, setFotoUploaden] = useState(false);
  const [aiLaden, setAiLaden] = useState(false);
  const [aiVoorstel, setAiVoorstel] = useState<GereedschapAiVoorstel | null>(null);
  const [fotoFout, setFotoFout] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const params = {
    ...(statusFilter !== "alle" && { status: statusFilter }),
    ...(zoek && { zoek }),
  };

  const { data: gereedschappen, isLoading } = useListGereedschappen(
    Object.keys(params).length > 0 ? params : undefined
  );

  const getUploadUrl = useGetGereedschapUploadUrl();
  const analyseAi = useAnalyseGereedschapFoto();

  const maakAan = useCreateGereedschap({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["listGereedschappen"] });
        setNieuwOpen(false);
        setFormulier(leegFormulier);
        setOpslaan(false);
        setFotoPreview(null);
        setFotoObjectPad(null);
        setAiVoorstel(null);
      },
      onError: () => setOpslaan(false),
    },
  });

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
      setFotoObjectPad(object_path);
      setFormulier((f) => ({ ...f, foto_url: object_path }));
      setFotoUploaden(false);
      setAiLaden(true);
      const voorstel = await analyseAi.mutateAsync({ id: 0, data: { foto_url: object_path } });
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
    setFormulier((f) => ({
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
        ? `Staat bij registratie: ${aiVoorstel.staat_indicatie}`
        : f.opmerkingen,
    }));
    setAiVoorstel(null);
  }

  function sluitNieuwDialog() {
    setNieuwOpen(false);
    setFormulier(leegFormulier);
    setFotoPreview(null);
    setFotoObjectPad(null);
    setAiVoorstel(null);
    setFotoFout(null);
  }

  function handleOpslaan() {
    if (!formulier.omschrijving) return;
    setOpslaan(true);
    maakAan.mutate({ data: formulier });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wrench className="h-6 w-6 text-[#F23B0D]" />
          <div>
            <h1 className="text-xl font-bold">Gereedschappen</h1>
            <p className="text-sm text-muted-foreground">Centraal register voor machines en gereedschappen</p>
          </div>
        </div>
        {magSchrijven && (
          <Button onClick={() => setNieuwOpen(true)} className="bg-[#F23B0D] hover:bg-[#d43309] text-white">
            <Plus className="h-4 w-4 mr-2" />
            Registreren
          </Button>
        )}
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Zoeken op omschrijving, volgnummer of merk..."
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Alle statussen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle statussen</SelectItem>
            {STATUSSEN.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : !gereedschappen || gereedschappen.length === 0 ? (
        <div className="space-y-4">
          <div className="py-12 text-center text-muted-foreground">
            <Wrench className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nog geen gereedschappen</p>
            <p className="text-xs mt-1">Registreer het eerste gereedschap.</p>
          </div>
          {magSchrijven && (
            <Button variant="outline" size="sm" onClick={() => setNieuwOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Gereedschap registreren
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {gereedschappen.map((item: Gereedschap) => (
            <ListCard
              key={item.id}
              onNavigate={() => navigate(`/gereedschappen/${item.id}`)}
              statusKleur={statusStreep(item.status)}
            >
              <div className="flex items-center gap-4 min-w-0">
                <span className="font-mono text-sm font-semibold text-primary shrink-0 w-20">
                  {item.volgnummer}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{item.omschrijving}</div>
                  {item.gegraveerd_nummer && (
                    <div className="text-xs text-muted-foreground">Gegraveerd: {item.gegraveerd_nummer}</div>
                  )}
                </div>
                <div className="hidden sm:block text-sm text-muted-foreground w-40 shrink-0 truncate">
                  {[item.merk, item.type].filter(Boolean).join(" / ") || "—"}
                </div>
                <div className="hidden md:block text-sm text-muted-foreground w-28 shrink-0 capitalize">
                  {item.categorie}
                </div>
                <div className="shrink-0">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusKleur(item.status)}`}>
                    {item.status}
                  </span>
                </div>
                {item.keuringsplichtig && item.keuring_verval_datum && (() => {
                  const verval = new Date(item.keuring_verval_datum);
                  const over30 = new Date(Date.now() + 30 * 86_400_000);
                  const verlopen = verval < new Date();
                  const binnenkort = verval < over30;
                  if (!verlopen && !binnenkort) return null;
                  return (
                    <div className={`hidden xl:flex items-center gap-1 text-xs font-medium w-40 shrink-0 ${verlopen ? "text-red-600" : "text-orange-600"}`}>
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span>{verlopen ? "Keuring verlopen" : "Keuring binnenkort"}</span>
                    </div>
                  );
                })()}
                {item.huidige_medewerker_naam ? (
                  <div className="hidden lg:flex items-center gap-1 text-sm text-muted-foreground w-36 shrink-0">
                    <User className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{item.huidige_medewerker_naam}</span>
                  </div>
                ) : (
                  <div className="hidden lg:block w-36 shrink-0" />
                )}
              </div>
            </ListCard>
          ))}
          <p className="text-xs text-muted-foreground pt-1">
            {gereedschappen.length} gereedschap{gereedschappen.length !== 1 ? "pen" : ""}
          </p>
        </div>
      )}

      <Dialog open={nieuwOpen} onOpenChange={(open) => { if (!open) sluitNieuwDialog(); else setNieuwOpen(true); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gereedschap registreren</DialogTitle>
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
                <span className="text-sm font-medium text-muted-foreground">Foto (optioneel)</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fotoInputRef.current?.click()}
                  disabled={fotoUploaden || aiLaden}
                  className="gap-2"
                >
                  <Camera className="h-4 w-4" />
                  {fotoUploaden ? "Uploaden..." : aiLaden ? "AI analyseert..." : fotoObjectPad ? "Andere foto" : "Foto nemen"}
                </Button>
              </div>
              {fotoPreview && (
                <img
                  src={fotoPreview}
                  alt="Gereedschap preview"
                  className="w-full max-h-40 object-contain rounded border"
                />
              )}
              {fotoFout && (
                <p className="text-xs text-red-600">{fotoFout}</p>
              )}
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
              <Label>Omschrijving <span className="text-red-500">*</span></Label>
              <Input
                placeholder="bijv. Boormachine, Slijptol"
                value={formulier.omschrijving}
                onChange={(e) => setFormulier((f) => ({ ...f, omschrijving: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Categorie <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="bijv. boormachine, zaag, klimmaterieel"
                  list="gereedschap-categorie-suggesties"
                  value={formulier.categorie ?? ""}
                  onChange={(e) => setFormulier((f) => ({ ...f, categorie: e.target.value }))}
                />
                {/* BOUW_01 §7: klimmaterieel is een categorie binnen gereedschappen —
                    erft daarmee automatisch de keuring-/inspectievelden. */}
                <datalist id="gereedschap-categorie-suggesties">
                  <option value="Klimmaterieel" />
                  <option value="Boormachine" />
                  <option value="Zaag" />
                  <option value="Meetapparatuur" />
                  <option value="overig" />
                </datalist>
              </div>
              <div className="space-y-1">
                <Label>Aandrijving <span className="text-red-500">*</span></Label>
                <Select
                  value={formulier.aandrijving ?? "handgereedschap"}
                  onValueChange={(v) => setFormulier((f) => ({ ...f, aandrijving: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AANDRIJVINGEN.map((a) => (
                      <SelectItem key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Merk</Label>
                <Input
                  placeholder="bijv. Makita, Bosch"
                  value={formulier.merk ?? ""}
                  onChange={(e) => setFormulier((f) => ({ ...f, merk: e.target.value || null }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Type / Model</Label>
                <Input
                  placeholder="bijv. DHP484"
                  value={formulier.type ?? ""}
                  onChange={(e) => setFormulier((f) => ({ ...f, type: e.target.value || null }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Serienummer</Label>
                <Input
                  value={formulier.serienummer ?? ""}
                  onChange={(e) => setFormulier((f) => ({ ...f, serienummer: e.target.value || null }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Gegraveerd nummer</Label>
                <Input
                  value={formulier.gegraveerd_nummer ?? ""}
                  onChange={(e) => setFormulier((f) => ({ ...f, gegraveerd_nummer: e.target.value || null }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Leverancier</Label>
                <Input
                  value={formulier.leverancier ?? ""}
                  onChange={(e) => setFormulier((f) => ({ ...f, leverancier: e.target.value || null }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Aankoopdatum</Label>
                <DatePicker
                  value={formulier.aankoopdatum ?? ""}
                  onChange={(v) => setFormulier((f) => ({ ...f, aankoopdatum: v || null }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Aankoopprijs (EUR)</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={formulier.aankoopprijs ?? ""}
                  onChange={(e) => setFormulier((f) => ({ ...f, aankoopprijs: e.target.value ? parseFloat(e.target.value) : null }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Locatie</Label>
                <Input
                  placeholder="bijv. magazijn, depot"
                  value={formulier.locatie ?? ""}
                  onChange={(e) => setFormulier((f) => ({ ...f, locatie: e.target.value || null }))}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 pt-1">
              {[
                { key: "met_snoer", label: "Met snoer" },
                { key: "accu_inbegrepen", label: "Accu inbegrepen" },
                { key: "lader_inbegrepen", label: "Lader inbegrepen" },
                { key: "koffer_inbegrepen", label: "Koffer inbegrepen" },
                { key: "keuringsplichtig", label: "Keuringsplichtig (NEN/CE)" },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(formulier as unknown as Record<string, unknown>)[key] as boolean ?? false}
                    onChange={(e) => setFormulier((f) => ({ ...f, [key]: e.target.checked }))}
                    className="rounded"
                  />
                  {label}
                </label>
              ))}
            </div>
            {!!(formulier as unknown as Record<string, unknown>)["keuringsplichtig"] && (
              <div className="grid grid-cols-2 gap-3 rounded-md border border-orange-200 bg-orange-50 p-3">
                <div className="space-y-1">
                  <Label>Keuringnorm</Label>
                  <Input
                    placeholder="bijv. NEN3140, NEN1010, CE"
                    value={(formulier as unknown as Record<string, unknown>)["keuring_norm"] as string ?? ""}
                    onChange={(e) => setFormulier((f) => ({ ...f, keuring_norm: e.target.value || null }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Keuringsverval</Label>
                  <DatePicker
                    value={(formulier as unknown as Record<string, unknown>)["keuring_verval_datum"] as string ?? ""}
                    onChange={(v) => setFormulier((f) => ({ ...f, keuring_verval_datum: v || null }))}
                  />
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label>Opmerkingen</Label>
              <Input
                value={formulier.opmerkingen ?? ""}
                onChange={(e) => setFormulier((f) => ({ ...f, opmerkingen: e.target.value || null }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={sluitNieuwDialog}>Annuleren</Button>
            <Button
              onClick={handleOpslaan}
              disabled={!formulier.omschrijving || opslaan || fotoUploaden || aiLaden}
              className="bg-[#F23B0D] hover:bg-[#d43309] text-white"
            >
              {opslaan ? "Registreren..." : "Registreren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
