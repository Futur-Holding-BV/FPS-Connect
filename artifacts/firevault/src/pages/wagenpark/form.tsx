import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import {
  useGetVoertuig,
  useCreateVoertuig,
  useUpdateVoertuig,
  getRdwVoertuigGegevens,
  getGetVoertuigQueryKey,
  getListVoertuigenQueryKey,
  useListToewijsbareGebruikers,
  ApiError,
  VoertuigInputAandrijving,
  VoertuigInputEigendomsType,
  VoertuigInputStatus,
} from "@workspace/api-client-react";
import type { VoertuigInput, RdwVoertuigGegevens } from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Alert, AlertDescription,
} from "@/components/ui/alert";
import { ArrowLeft, Save, Search, Loader2, Sparkles, RefreshCw } from "lucide-react";
import { PaginaHulp } from "@/components/pagina-hulp";

// ── Helpers ────────────────────────────────────────────────

function isoNaarDatumInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function datumInputNaarIso(datum: string): string | null {
  if (!datum) return null;
  return new Date(datum).toISOString();
}

function formatDatumTijd(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ══════════════════════════════════════════════════════════
// Formulier
// ══════════════════════════════════════════════════════════

export default function WagenparkFormPagina() {
  const params = useParams<{ id?: string }>();
  const [, navigeer] = useLocation();
  const isBewerken = !!params.id;
  const voertuigId = params.id ? Number(params.id) : 0;

  const { heeftNiveau } = useBevoegdheid();
  const magAanmaken = heeftNiveau("wagenpark", 3);

  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: bestaand, isLoading } = useGetVoertuig(voertuigId, {
    query: {
      queryKey: getGetVoertuigQueryKey(voertuigId),
      enabled: isBewerken && voertuigId > 0,
    },
  });

  const maakAan = useCreateVoertuig();
  const werkBij = useUpdateVoertuig();
  const { data: toewijsbareGebruikers = [], isLoading: werknemersLaden } =
    useListToewijsbareGebruikers();

  // Formulierstaat — gevuld uit bestaand voertuig zodra geladen
  const [kenteken,      setKenteken]      = useState("");
  const [merk,          setMerk]          = useState("");
  const [type,          setType]          = useState("");
  const [bouwjaar,      setBouwjaar]      = useState("");
  const [kleur,         setKleur]         = useState("");
  const [chassisnummer, setChassisnummer] = useState("");
  const [kmStand,       setKmStand]       = useState("0");
  const [apkDatum,      setApkDatum]      = useState("");
  const [aandrijving,   setAandrijving]   = useState<string>(VoertuigInputAandrijving.diesel);
  const [eigendomsType, setEigendomsType] = useState<string>(VoertuigInputEigendomsType.eigendom);
  const [status,        setStatus]        = useState<string>(VoertuigInputStatus.actief);
  const [garageNaam,    setGarageNaam]    = useState("");
  const [garageEmail,   setGarageEmail]   = useState("");
  const [verzekeraar,   setVerzekeraar]   = useState("");
  const [polisnr,       setPolisnr]       = useState("");
  const [verzekVerval,  setVerzekVerval]  = useState("");
  const [leasemij,      setLeasemij]      = useState("");
  const [leaseEind,     setLeaseEind]     = useState("");
  const [opmerkingen,   setOpmerkingen]   = useState("");
  const [chauffeurId,   setChauffeurId]   = useState("");
  const [rdwOpgehaaldOp, setRdwOpgehaaldOp] = useState<string | null>(null);

  // Init uit bestaand voertuig (eenmalig)
  const [geinit, setGeinit] = useState(false);
  if (isBewerken && bestaand && !geinit) {
    setGeinit(true);
    setKenteken(bestaand.kenteken ?? "");
    setMerk(bestaand.merk ?? "");
    setType(bestaand.type ?? "");
    setBouwjaar(bestaand.bouwjaar ? String(bestaand.bouwjaar) : "");
    setKleur(bestaand.kleur ?? "");
    setChassisnummer(bestaand.chassisnummer ?? "");
    setKmStand(String(bestaand.km_stand ?? 0));
    setApkDatum(isoNaarDatumInput(bestaand.apk_datum));
    setAandrijving(bestaand.aandrijving ?? VoertuigInputAandrijving.diesel);
    setEigendomsType(bestaand.eigendoms_type ?? VoertuigInputEigendomsType.eigendom);
    setStatus(bestaand.status ?? VoertuigInputStatus.actief);
    setGarageNaam(bestaand.garage_naam ?? "");
    setGarageEmail(bestaand.garage_email ?? "");
    setVerzekeraar(bestaand.verzekeraar_naam ?? "");
    setPolisnr(bestaand.verzekering_polisnr ?? "");
    setVerzekVerval(isoNaarDatumInput(bestaand.verzekering_verval_dat));
    setLeasemij(bestaand.leasemaatschappij ?? "");
    setLeaseEind(isoNaarDatumInput(bestaand.lease_eind_datum));
    setOpmerkingen(bestaand.opmerkingen ?? "");
    setChauffeurId(bestaand.chauffeur_id ? String(bestaand.chauffeur_id) : "");
    setRdwOpgehaaldOp(bestaand.rdw_opgehaald_op ?? null);
  }

  const isElektrisch = aandrijving === VoertuigInputAandrijving.elektrisch;

  // ── RDW invulhulp (voorstel-patroon) ──
  const [rdwBezig,     setRdwBezig]     = useState(false);
  const [rdwVoorstel,  setRdwVoorstel]  = useState<RdwVoertuigGegevens | null>(null);

  async function rdwOphalen() {
    const schoon = kenteken.replace(/[-\s]/g, "").toUpperCase();
    if (!schoon) {
      toast({ title: "Vul eerst een kenteken in", variant: "destructive" });
      return;
    }
    setRdwBezig(true);
    setRdwVoorstel(null);
    try {
      const res = await getRdwVoertuigGegevens(schoon);
      if (!res.gevonden) {
        toast({
          title: "Geen RDW-gegevens gevonden",
          description: res.foutmelding ?? "Vul de gegevens handmatig in.",
        });
        return;
      }
      setRdwVoorstel(res);
    } catch (err) {
      toast({
        title: "RDW ophalen mislukt",
        description: err instanceof Error ? err.message : "Vul de gegevens handmatig in.",
      });
    } finally {
      setRdwBezig(false);
    }
  }

  function rdwOvernemen() {
    if (!rdwVoorstel) return;
    if (rdwVoorstel.merk) setMerk(rdwVoorstel.merk);
    if (rdwVoorstel.handelsbenaming) setType(rdwVoorstel.handelsbenaming);
    if (rdwVoorstel.kleur) setKleur(rdwVoorstel.kleur);
    if (rdwVoorstel.datum_eerste_toelating) {
      const jaar = new Date(rdwVoorstel.datum_eerste_toelating).getFullYear();
      if (!Number.isNaN(jaar)) setBouwjaar(String(jaar));
    }
    if (rdwVoorstel.apk_vervaldatum) {
      setApkDatum(isoNaarDatumInput(rdwVoorstel.apk_vervaldatum));
    }
    const nu = new Date().toISOString();
    setRdwOpgehaaldOp(nu);
    setRdwVoorstel(null);
    toast({ title: "RDW-gegevens overgenomen", description: "Controleer en pas de velden zo nodig aan." });
  }

  const bezig = maakAan.isPending || werkBij.isPending;

  function opslaan() {
    if (!kenteken.trim() || !merk.trim() || !type.trim()) {
      toast({
        title: "Verplichte velden ontbreken",
        description: "Kenteken, merk en type zijn verplicht.",
        variant: "destructive",
      });
      return;
    }

    const data: VoertuigInput = {
      kenteken: kenteken.trim().toUpperCase(),
      merk: merk.trim(),
      type: type.trim(),
      bouwjaar: bouwjaar ? parseInt(bouwjaar, 10) : null,
      kleur: kleur.trim() || null,
      chassisnummer: chassisnummer.trim() || null,
      km_stand: Math.max(0, parseInt(kmStand, 10) || 0),
      apk_datum: datumInputNaarIso(apkDatum),
      aandrijving: aandrijving as VoertuigInput["aandrijving"],
      eigendoms_type: eigendomsType as VoertuigInput["eigendoms_type"],
      status: status as VoertuigInput["status"],
      garage_naam: garageNaam.trim() || null,
      garage_email: garageEmail.trim() || null,
      // Brandstof/verzekering blijft bewaard; verzekering is niet brandstofgebonden.
      verzekeraar_naam: verzekeraar.trim() || null,
      verzekering_polisnr: polisnr.trim() || null,
      verzekering_verval_dat: datumInputNaarIso(verzekVerval),
      leasemaatschappij: leasemij.trim() || null,
      lease_eind_datum: datumInputNaarIso(leaseEind),
      rdw_opgehaald_op: rdwOpgehaaldOp,
      opmerkingen: opmerkingen.trim() || null,
      chauffeur_id: chauffeurId ? Number(chauffeurId) : null,
    };

    const opties = {
      onSuccess: (v: { id: number }) => {
        void qc.invalidateQueries({ queryKey: getListVoertuigenQueryKey() });
        if (isBewerken) {
          void qc.invalidateQueries({ queryKey: getGetVoertuigQueryKey(voertuigId) });
        }
        toast({ title: isBewerken ? "Voertuig bijgewerkt" : "Voertuig aangemaakt" });
        navigeer(`/wagenpark/${isBewerken ? voertuigId : v.id}`);
      },
      onError: (err: unknown) => {
        if (err instanceof ApiError && err.status === 409) {
          toast({
            title: "Kenteken bestaat al",
            description: "Er bestaat al een voertuig met dit kenteken.",
            variant: "destructive",
          });
          return;
        }
        toast({
          title: "Opslaan mislukt",
          description: err instanceof Error ? err.message : "Onbekende fout.",
          variant: "destructive",
        });
      },
    };

    if (isBewerken) {
      werkBij.mutate({ id: voertuigId, data }, opties);
    } else {
      maakAan.mutate({ data }, opties);
    }
  }

  if (!magAanmaken) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>U heeft geen rechten om voertuigen te beheren.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isBewerken && isLoading) {
    return (
      <div className="p-6 flex items-center gap-3 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin" />
        Laden...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-screen-md">
      <PaginaHulp pagina="wagenpark-form" />
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href={isBewerken ? `/wagenpark/${voertuigId}` : "/wagenpark"}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {isBewerken ? "Terug naar voertuig" : "Terug naar wagenpark"}
          </Link>
        </Button>
      </div>

      <h1 data-paginatitel className="text-2xl font-bold">
        {isBewerken ? "Voertuig bewerken" : "Voertuig toevoegen"}
      </h1>

      {/* Basisgegevens + RDW */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Basisgegevens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Kenteken *</Label>
            <div className="flex gap-2">
              <Input
                value={kenteken}
                onChange={(e) => setKenteken(e.target.value.toUpperCase())}
                placeholder="AB-123-C"
                className="font-mono"
              />
              <Button variant="outline" onClick={rdwOphalen} disabled={rdwBezig} type="button">
                {rdwBezig ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                RDW ophalen
              </Button>
            </div>
            {rdwOpgehaaldOp && (
              <p className="text-xs text-muted-foreground">
                Overgenomen van RDW op {formatDatumTijd(rdwOpgehaaldOp)}
              </p>
            )}
          </div>

          {rdwVoorstel && (
            <Alert className="border-amber-200 bg-amber-50">
              <Sparkles className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 text-sm space-y-2">
                <div className="font-medium">RDW-voorstel gevonden — controleer en neem over:</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {rdwVoorstel.merk && <div>Merk: <span className="font-medium">{rdwVoorstel.merk}</span></div>}
                  {rdwVoorstel.handelsbenaming && <div>Type: <span className="font-medium">{rdwVoorstel.handelsbenaming}</span></div>}
                  {rdwVoorstel.kleur && <div>Kleur: <span className="font-medium">{rdwVoorstel.kleur}</span></div>}
                  {rdwVoorstel.datum_eerste_toelating && <div>Eerste toelating: <span className="font-medium">{isoNaarDatumInput(rdwVoorstel.datum_eerste_toelating)}</span></div>}
                  {rdwVoorstel.apk_vervaldatum && <div>APK vervalt: <span className="font-medium">{isoNaarDatumInput(rdwVoorstel.apk_vervaldatum)}</span></div>}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={rdwOvernemen} type="button">Overnemen</Button>
                  <Button size="sm" variant="ghost" onClick={() => setRdwVoorstel(null)} type="button">Negeren</Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Merk *</Label>
              <Input value={merk} onChange={(e) => setMerk(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Type / handelsbenaming *</Label>
              <Input value={type} onChange={(e) => setType(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Bouwjaar</Label>
              <Input type="number" value={bouwjaar} onChange={(e) => setBouwjaar(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Kleur</Label>
              <Input value={kleur} onChange={(e) => setKleur(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Chassisnummer</Label>
              <Input value={chassisnummer} onChange={(e) => setChassisnummer(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Km-stand</Label>
              <Input type="number" value={kmStand} onChange={(e) => setKmStand(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Aandrijving</Label>
              <Select value={aandrijving} onValueChange={setAandrijving}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={VoertuigInputAandrijving.diesel}>Diesel</SelectItem>
                  <SelectItem value={VoertuigInputAandrijving.benzine}>Benzine</SelectItem>
                  <SelectItem value={VoertuigInputAandrijving.elektrisch}>Elektrisch</SelectItem>
                  <SelectItem value={VoertuigInputAandrijving.hybride}>Hybride</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>APK vervaldatum</Label>
              <Input type="date" value={apkDatum} onChange={(e) => setApkDatum(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={VoertuigInputStatus.actief}>Actief</SelectItem>
                  <SelectItem value={VoertuigInputStatus.in_onderhoud}>In onderhoud</SelectItem>
                  <SelectItem value={VoertuigInputStatus.beschadigd}>Beschadigd</SelectItem>
                  <SelectItem value={VoertuigInputStatus.gereserveerd}>Gereserveerd</SelectItem>
                  <SelectItem value={VoertuigInputStatus.afgestoten}>Afgestoten</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Eigendomstype</Label>
              <Select value={eigendomsType} onValueChange={setEigendomsType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={VoertuigInputEigendomsType.eigendom}>Eigendom</SelectItem>
                  <SelectItem value={VoertuigInputEigendomsType.lease}>Lease</SelectItem>
                  <SelectItem value={VoertuigInputEigendomsType.huur}>Huur</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label htmlFor="vaste-chauffeur">Vaste werknemer / chauffeur</Label>
              <Select
                value={chauffeurId || "geen"}
                onValueChange={(waarde) => setChauffeurId(waarde === "geen" ? "" : waarde)}
                disabled={werknemersLaden}
              >
                <SelectTrigger id="vaste-chauffeur">
                  <SelectValue placeholder={werknemersLaden ? "Werknemers laden..." : "Geen werknemer gekoppeld"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="geen">Geen werknemer gekoppeld</SelectItem>
                  {toewijsbareGebruikers.map((gebruiker) => (
                    <SelectItem key={gebruiker.id} value={String(gebruiker.id)}>
                      {gebruiker.naam}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isElektrisch && (
            <Alert className="border-green-200 bg-green-50">
              <AlertDescription className="text-green-800 text-sm">
                Elektrisch voertuig — brandstofgegevens zijn niet van toepassing en worden verborgen.
                Registreer laadkosten via de categorie &quot;Laden&quot; op de kosten-tab.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Vaste garage */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Vaste garage</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Naam garage</Label>
            <Input
              value={garageNaam}
              onChange={(e) => setGarageNaam(e.target.value)}
              placeholder="Bijv. Garage Van der Berg"
            />
          </div>
          <div className="space-y-1">
            <Label>E-mailadres garage</Label>
            <Input
              type="email"
              value={garageEmail}
              onChange={(e) => setGarageEmail(e.target.value)}
              placeholder="info@garage.nl"
            />
          </div>
        </CardContent>
      </Card>

      {/* Verzekering & Lease */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Verzekering &amp; Lease</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Verzekeraar</Label>
            <Input value={verzekeraar} onChange={(e) => setVerzekeraar(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Polisnummer</Label>
            <Input value={polisnr} onChange={(e) => setPolisnr(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Verzekering vervalt</Label>
            <Input type="date" value={verzekVerval} onChange={(e) => setVerzekVerval(e.target.value)} />
          </div>
          <div className="space-y-1" />
          <div className="space-y-1">
            <Label>Leasemaatschappij</Label>
            <Input value={leasemij} onChange={(e) => setLeasemij(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Lease eindigt</Label>
            <Input type="date" value={leaseEind} onChange={(e) => setLeaseEind(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Opmerkingen */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Opmerkingen</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={opmerkingen}
            onChange={(e) => setOpmerkingen(e.target.value)}
            rows={3}
            placeholder="Optionele opmerkingen..."
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" asChild>
          <Link href={isBewerken ? `/wagenpark/${voertuigId}` : "/wagenpark"}>Annuleren</Link>
        </Button>
        <Button onClick={opslaan} disabled={bezig}>
          {bezig ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Opslaan
        </Button>
      </div>
    </div>
  );
}
