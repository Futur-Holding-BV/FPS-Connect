import { useState, useEffect, useRef } from "react";
import { useCreateUitgifte, useListArtikelen, useListMagazijnLocaties, useListReserveringen, useListOpdrachten, listArtikelen } from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Trash2, PackageCheck, Search, AlertTriangle, X, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface UitgifteRegel {
  artikel_id: number;
  artikel_naam: string;
  hoeveelheid: number;
  locatie_id: number | null;
  reservering_id: number | null;
}

interface VoorraadFout {
  artikel_naam: string;
  beschikbaar: number;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function MagazijnUitgiftesPagina() {
  const { heeftNiveau } = useBevoegdheid();
  const kanSchrijven = heeftNiveau("magazijn", 3);

  const kanZonderOpdracht = heeftNiveau("magazijn", 4);

  const { data: locaties = [] } = useListMagazijnLocaties();
  const { data: reserveringen = [] } = useListReserveringen({ status: "open" });
  const { data: opdrachten = [] } = useListOpdrachten({ status: "actief", mijn: true });

  const { mutate: uitgifte, isPending } = useCreateUitgifte();
  const { toast } = useToast();

  const [opdrachtId, setOpdrachtId] = useState<number | null>(null);
  const [opdrachtZoek, setOpdrachtZoek] = useState("");
  const [opdrachtOpen, setOpdrachtOpen] = useState(false);
  const opdrachtRef = useRef<HTMLDivElement>(null);

  const [omschrijving, setOmschrijving] = useState("");
  const [regels, setRegels] = useState<UitgifteRegel[]>([]);
  const [nHoeveelheid, setNHoeveelheid] = useState("1");
  const [nLocatieId, setNLocatieId] = useState("");
  const [nReserveringId, setNReserveringId] = useState("");
  const [voltooid, setVoltooid] = useState(false);

  const [voorraadFout, setVoorraadFout] = useState<VoorraadFout | null>(null);

  const [zoekInput, setZoekInput] = useState("");
  const [gekozenArtikel, setGekozenArtikel] = useState<{ id: number; naam: string; eenheid: string } | null>(null);
  const [zoekOpen, setZoekOpen] = useState(false);
  const zoekRef = useRef<HTMLDivElement>(null);

  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeFout, setBarcodeFout] = useState(false);
  const [barcodeBezig, setBarcodeBezig] = useState(false);

  const debouncedZoek = useDebounce(zoekInput, 250);

  const { data: zoekResultaten = [] } = useListArtikelen(
    debouncedZoek.trim().length >= 1 ? { zoek: debouncedZoek.trim(), actief: true } : { actief: true, zoek: undefined },
  );

  const gefilterdeResultaten = debouncedZoek.trim().length >= 1 ? zoekResultaten.slice(0, 10) : [];

  const gefilterdeOpdrachten = opdrachten.filter(o => {
    if (!opdrachtZoek.trim()) return true;
    const z = opdrachtZoek.toLowerCase();
    return (
      o.titel.toLowerCase().includes(z) ||
      (o.werknummer ?? "").toLowerCase().includes(z) ||
      String(o.id).includes(z)
    );
  });

  const gekozenOpdracht = opdrachten.find(o => o.id === opdrachtId) ?? null;

  useEffect(() => {
    function handleClickBuiten(e: MouseEvent) {
      if (zoekRef.current && !zoekRef.current.contains(e.target as Node)) {
        setZoekOpen(false);
      }
      if (opdrachtRef.current && !opdrachtRef.current.contains(e.target as Node)) {
        setOpdrachtOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickBuiten);
    return () => document.removeEventListener("mousedown", handleClickBuiten);
  }, []);

  function kiesArtikel(a: { id: number; naam: string; eenheid: string }) {
    setGekozenArtikel(a);
    setZoekInput(a.naam);
    setZoekOpen(false);
    setBarcodeFout(false);
  }

  function wisArtikelkeuze() {
    setGekozenArtikel(null);
    setZoekInput("");
    setZoekOpen(false);
    setBarcodeFout(false);
  }

  function kiesOpdracht(id: number | null) {
    setOpdrachtId(id);
    setOpdrachtOpen(false);
    setOpdrachtZoek("");
  }

  async function scanBarcode() {
    const barcode = barcodeInput.trim();
    if (!barcode) return;
    setBarcodeBezig(true);
    setBarcodeFout(false);
    try {
      const resultaten = await listArtikelen({ barcode });
      if (!resultaten || resultaten.length === 0) {
        setBarcodeFout(true);
      } else {
        const a = resultaten[0];
        kiesArtikel({ id: a.id, naam: a.naam, eenheid: a.eenheid });
        setBarcodeInput("");
      }
    } catch {
      setBarcodeFout(true);
    } finally {
      setBarcodeBezig(false);
    }
  }

  function voegToe() {
    if (!gekozenArtikel) return;
    setRegels(prev => [...prev, {
      artikel_id: gekozenArtikel.id,
      artikel_naam: gekozenArtikel.naam,
      hoeveelheid: Number(nHoeveelheid),
      locatie_id: nLocatieId ? Number(nLocatieId) : null,
      reservering_id: nReserveringId ? Number(nReserveringId) : null,
    }]);
    wisArtikelkeuze();
    setNHoeveelheid("1");
    setNLocatieId("");
    setNReserveringId("");
    setVoorraadFout(null);
  }

  function verwijderRegel(idx: number) {
    setRegels(prev => prev.filter((_, i) => i !== idx));
    setVoorraadFout(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!regels.length) return;
    setVoorraadFout(null);
    uitgifte({
      data: {
        opdracht_id: opdrachtId ?? null,
        omschrijving,
        regels,
      },
    }, {
      onSuccess: () => {
        setVoltooid(true);
        toast({ title: "Uitgifte geregistreerd", description: `${regels.length} artikel(en) uitgegeven.` });
      },
      onError: (err) => {
        const body = (err as { response?: { data?: { code?: string; beschikbaar?: number; error?: string } } })?.response?.data;
        if (body?.code === "ONVOLDOENDE_VOORRAAD") {
          const beschikbaar = body.beschikbaar ?? 0;
          const artikel_naam = regels.find(r => r.artikel_id)?.artikel_naam ?? "Onbekend artikel";
          setVoorraadFout({ artikel_naam, beschikbaar });
        } else {
          toast({ title: "Fout bij uitgifte", description: "Controleer de gegevens en probeer opnieuw.", variant: "destructive" });
        }
      },
    });
  }

  if (!kanSchrijven) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Je hebt geen toegang tot deze functie.</p>
      </div>
    );
  }

  if (voltooid) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-64 gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <PackageCheck className="h-8 w-8 text-green-700" />
        </div>
        <div>
          <p className="text-xl font-semibold">Uitgifte geregistreerd</p>
          <p className="text-muted-foreground text-sm mt-1">De voorraad is bijgewerkt en de mutaties zijn gelogd.</p>
        </div>
        <Button onClick={() => { setRegels([]); setOpdrachtId(null); setOpdrachtZoek(""); setOmschrijving(""); setVoltooid(false); setVoorraadFout(null); }}>
          Nieuwe uitgifte
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Uitgifte</h1>

      {voorraadFout && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Onvoldoende voorraad</strong> — {voorraadFout.artikel_naam}: {voorraadFout.beschikbaar} beschikbaar.
            Verwijder het artikel of pas de hoeveelheid aan voordat u de uitgifte opnieuw indient.
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Opdracht koppelen</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1" ref={opdrachtRef}>
              <Label>
                Opdracht{kanZonderOpdracht ? " (optioneel)" : " (verplicht)"}
              </Label>
              <div className="relative">
                <button
                  type="button"
                  className="w-full flex items-center justify-between border rounded-md px-3 py-2 text-sm bg-background hover:bg-muted/30 transition-colors"
                  onClick={() => setOpdrachtOpen(v => !v)}
                >
                  <span className={gekozenOpdracht ? "font-medium" : "text-muted-foreground"}>
                    {gekozenOpdracht
                      ? `${gekozenOpdracht.titel}${gekozenOpdracht.werknummer ? ` (${gekozenOpdracht.werknummer})` : ""}`
                      : "Geen opdracht — algemene uitgifte"}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
                {opdrachtOpen && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg">
                    <div className="p-2 border-b">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        <Input
                          value={opdrachtZoek}
                          onChange={e => setOpdrachtZoek(e.target.value)}
                          placeholder="Zoek opdracht..."
                          className="pl-8 h-8 text-sm"
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="max-h-52 overflow-auto">
                      {kanZonderOpdracht && (
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted text-muted-foreground"
                          onClick={() => kiesOpdracht(null)}
                        >
                          Geen opdracht — algemene uitgifte
                        </button>
                      )}
                      {gefilterdeOpdrachten.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-muted-foreground">
                          {opdrachten.length === 0
                            ? "Geen actieve opdrachten gevonden voor uw account"
                            : "Geen opdrachten gevonden voor deze zoekopdracht"}
                        </p>
                      ) : (
                        gefilterdeOpdrachten.map(o => (
                          <button
                            key={o.id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex flex-col"
                            onClick={() => kiesOpdracht(o.id)}
                          >
                            <span className="font-medium">{o.titel}</span>
                            <span className="text-xs text-muted-foreground">
                              {[o.werknummer, o.gebouw_naam].filter(Boolean).join(" — ") || `Opdracht #${o.id}`}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              {gekozenOpdracht && (
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">
                    Opdracht #{gekozenOpdracht.id}{gekozenOpdracht.werknummer ? ` · ${gekozenOpdracht.werknummer}` : ""}
                  </Badge>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    onClick={() => kiesOpdracht(null)}
                  >
                    <X className="h-3 w-3" /> Verwijder koppeling
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label>Omschrijving</Label>
              <Input value={omschrijving} onChange={e => setOmschrijving(e.target.value)} placeholder="Bijv. Uitgifte project Brandweerkazerne Almelo" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Artikelen selecteren</CardTitle></CardHeader>
          <CardContent className="space-y-4">

            {/* Barcode scan */}
            <div className="space-y-1">
              <Label className="text-xs">Barcode scannen</Label>
              <div className="flex gap-2">
                <Input
                  value={barcodeInput}
                  onChange={e => { setBarcodeInput(e.target.value); setBarcodeFout(false); }}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void scanBarcode(); } }}
                  placeholder="Scan of typ barcode..."
                  className="font-mono"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => void scanBarcode()} disabled={!barcodeInput.trim() || barcodeBezig}>
                  {barcodeBezig ? "Zoeken..." : "Zoek"}
                </Button>
              </div>
              {barcodeFout && (
                <p className="text-sm text-destructive flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Artikel niet gevonden — controleer de barcode of zoek handmatig hieronder.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3 bg-muted/30 rounded-lg">
              {/* Artikel zoeken */}
              <div className="space-y-1 sm:col-span-2 lg:col-span-1" ref={zoekRef}>
                <Label className="text-xs">Artikel zoeken</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={zoekInput}
                    onChange={e => {
                      setZoekInput(e.target.value);
                      setZoekOpen(true);
                      if (gekozenArtikel && e.target.value !== gekozenArtikel.naam) {
                        setGekozenArtikel(null);
                      }
                    }}
                    onFocus={() => { if (zoekInput.trim().length >= 1) setZoekOpen(true); }}
                    placeholder="Naam, code of omschrijving..."
                    className="pl-8 pr-7"
                  />
                  {zoekInput && (
                    <button
                      type="button"
                      className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                      onClick={wisArtikelkeuze}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  {zoekOpen && gefilterdeResultaten.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
                      {gefilterdeResultaten.map(a => (
                        <button
                          key={a.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex flex-col"
                          onClick={() => kiesArtikel({ id: a.id, naam: a.naam, eenheid: a.eenheid })}
                        >
                          <span className="font-medium">{a.naam}</span>
                          {(a.code || a.omschrijving) && (
                            <span className="text-xs text-muted-foreground">
                              {[a.code, a.omschrijving].filter(Boolean).join(" — ")}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {zoekOpen && debouncedZoek.trim().length >= 1 && gefilterdeResultaten.length === 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg px-3 py-2 text-sm text-muted-foreground">
                      Geen artikelen gevonden voor "{debouncedZoek.trim()}"
                    </div>
                  )}
                </div>
                {gekozenArtikel && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Gekozen: <strong>{gekozenArtikel.naam}</strong> ({gekozenArtikel.eenheid})
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Hoeveelheid</Label>
                <Input type="number" min="0.01" step="0.01" value={nHoeveelheid} onChange={e => setNHoeveelheid(e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Locatie</Label>
                <Select value={nLocatieId || "__geen__"} onValueChange={v => setNLocatieId(v === "__geen__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Geen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__geen__">Geen locatie</SelectItem>
                    {locaties.map(l => <SelectItem key={l.id} value={String(l.id)}>{l.naam}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Koppel reservering</Label>
                <Select value={nReserveringId || "__geen__"} onValueChange={v => setNReserveringId(v === "__geen__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Geen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__geen__">Geen reservering</SelectItem>
                    {reserveringen
                      .filter(r => !gekozenArtikel || r.artikel_id === gekozenArtikel.id)
                      .map(r => <SelectItem key={r.id} value={String(r.id)}>#{r.id} — {r.artikel_naam ?? ""} ({r.hoeveelheid})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button type="button" variant="outline" size="sm" onClick={voegToe} disabled={!gekozenArtikel || !nHoeveelheid}>
              <Plus className="h-4 w-4 mr-1" /> Toevoegen
            </Button>

            {regels.length > 0 && (
              <div className="space-y-2 mt-2">
                {regels.map((r, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-background border rounded-lg">
                    <div>
                      <p className="font-medium text-sm">{r.artikel_naam}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.hoeveelheid} st
                        {r.locatie_id && ` · Locatie #${r.locatie_id}`}
                        {r.reservering_id && (
                          <Badge variant="outline" className="ml-1 text-xs">Reservering #{r.reservering_id}</Badge>
                        )}
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => verwijderRegel(i)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={!regels.length || isPending || voorraadFout !== null || (!kanZonderOpdracht && !opdrachtId)} className="gap-2">
            <PackageCheck className="h-4 w-4" />
            Uitgifte bevestigen ({regels.length} artikel{regels.length !== 1 ? "en" : ""})
          </Button>
        </div>
      </form>
    </div>
  );
}
