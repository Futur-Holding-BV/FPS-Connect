// PRIJS_01 §3 — Prijsafspraken (jaarprijzen) beheerpagina.
//
// Tabel van prijsafspraken (leverancier, artikel/artikelcode, omschrijving,
// prijs + eenheid, periode, bron, status geldig/verlopen/teruggedraaid), met
// filter op leverancier en een "alleen geldig"-toggle. Vanuit hier kun je een
// afspraak beëindigen (inkorten) en een nieuwe afspraak handmatig aanmaken;
// een botsende (overlappende) periode wordt met 409 netjes getoond, inclusief
// de botsende regel. Er is BEWUST geen bewerkfunctie voor prijsvelden: een
// gewijzigde prijs of periode is een nieuwe afspraak (§9). Bulk inladen gaat via
// de prijslijst-import.
import { useMemo, useState } from "react";
import {
  useListPrijsafspraken,
  useListLeveranciers,
  useCreatePrijsafspraak,
  useBeeindigPrijsafspraak,
  getListPrijsafsprakenQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import type {
  Prijsafspraak,
  PrijsafspraakInput,
  PrijsafspraakConflict,
  Leverancier,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Handshake, Plus, Upload, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const eur = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n);

const vandaagIso = () => new Date().toISOString().slice(0, 10);

// Haalt de servermelding uit een ApiError-body ({ error: string }), met een
// veilige fallback.
function foutBericht(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.data && typeof err.data === "object") {
    const data = err.data as { error?: unknown };
    if (typeof data.error === "string") return data.error;
  }
  return fallback;
}

type Status = "geldig" | "verlopen" | "teruggedraaid";

function bepaalStatus(a: Prijsafspraak): Status {
  if (a.teruggedraaid_op) return "teruggedraaid";
  const nu = vandaagIso();
  if (a.geldig_van <= nu && a.geldig_tot >= nu) return "geldig";
  return "verlopen";
}

const STATUS_LABEL: Record<Status, string> = {
  geldig: "Geldig",
  verlopen: "Verlopen",
  teruggedraaid: "Teruggedraaid",
};
const STATUS_KLEUR: Record<Status, string> = {
  geldig: "bg-emerald-100 text-emerald-700 border-emerald-200",
  verlopen: "bg-amber-100 text-amber-700 border-amber-200",
  teruggedraaid: "bg-slate-100 text-slate-500 border-slate-200",
};

export default function PrijsafsprakenBeheerPagina() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [leverancierFilter, setLeverancierFilter] = useState<string>("alle");
  const [alleenGeldig, setAlleenGeldig] = useState(false);

  const levId = leverancierFilter !== "alle" ? Number(leverancierFilter) : undefined;
  const { data: afspraken, isLoading } = useListPrijsafspraken({
    ...(levId != null ? { leverancier_id: levId } : {}),
    ...(alleenGeldig ? { actueel: true } : {}),
  });
  const { data: leveranciers } = useListLeveranciers();

  const leverancierNaam = useMemo(() => {
    const map = new Map<number, string>();
    (leveranciers ?? []).forEach((l: Leverancier) => map.set(l.id, l.naam));
    return map;
  }, [leveranciers]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListPrijsafsprakenQueryKey() });

  // ── Nieuwe afspraak ──
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [conflict, setConflict] = useState<PrijsafspraakConflict | null>(null);
  const createMut = useCreatePrijsafspraak();

  // ── Beëindigen ──
  const [teBeeindigen, setTeBeeindigen] = useState<Prijsafspraak | null>(null);
  const [beeindigDatum, setBeeindigDatum] = useState<string>(vandaagIso());
  const beeindigMut = useBeeindigPrijsafspraak();

  const startBeeindigen = (a: Prijsafspraak) => {
    setTeBeeindigen(a);
    setBeeindigDatum(vandaagIso());
  };

  const bevestigBeeindigen = () => {
    if (!teBeeindigen) return;
    beeindigMut.mutate(
      { id: teBeeindigen.id, data: { geldig_tot: beeindigDatum } },
      {
        onSuccess: () => {
          toast({ title: "Afspraak beëindigd", description: `Geldig t/m ${beeindigDatum}.` });
          setTeBeeindigen(null);
          invalidate();
        },
        onError: (err) => {
          toast({ variant: "destructive", title: "Kon niet beëindigen", description: foutBericht(err, "Beëindigen mislukt.") });
        },
      },
    );
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Handshake className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Prijsafspraken</h1>
            <p className="text-sm text-muted-foreground">
              Afgesproken jaarprijzen per leverancier. Een afspraak wordt nooit
              overschreven; een gewijzigde prijs of periode is een nieuwe afspraak.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/beheer/import">
              <Upload className="mr-2 h-4 w-4" />
              Prijslijst importeren
            </Link>
          </Button>
          <Button onClick={() => { setConflict(null); setNieuwOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Nieuwe afspraak
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="w-full max-w-xs space-y-1">
            <Label>Leverancier</Label>
            <Select value={leverancierFilter} onValueChange={setLeverancierFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Alle leveranciers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle leveranciers</SelectItem>
                {(leveranciers ?? [])
                  .slice()
                  .sort((a, b) => a.naam.localeCompare(b.naam))
                  .map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>{l.naam}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch id="alleen-geldig" checked={alleenGeldig} onCheckedChange={setAlleenGeldig} />
            <Label htmlFor="alleen-geldig">Alleen nu geldige afspraken</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (afspraken ?? []).length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Geen prijsafspraken gevonden. Voeg er handmatig één toe of importeer een prijslijst.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Leverancier</TableHead>
                  <TableHead>Artikel / code</TableHead>
                  <TableHead>Omschrijving</TableHead>
                  <TableHead className="text-right">Prijs</TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead>Bron</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actie</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(afspraken ?? []).map((a) => {
                  const status = bepaalStatus(a);
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        {leverancierNaam.get(a.leverancier_id) ?? `#${a.leverancier_id}`}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {a.artikel_id != null
                          ? `artikel #${a.artikel_id}`
                          : (a.leverancier_artikelcode ?? "—")}
                      </TableCell>
                      <TableCell className="text-sm">{a.leverancier_omschrijving ?? "—"}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {eur(a.prijs)}
                        <span className="text-xs text-muted-foreground"> / {a.eenheid}</span>
                        {a.staffel_vanaf > 0 && (
                          <span className="ml-1 text-xs text-muted-foreground">(≥ {a.staffel_vanaf})</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {a.geldig_van} t/m {a.geldig_tot}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.bron}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_KLEUR[status]}>
                          {STATUS_LABEL[status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {status === "geldig" ? (
                          <Button variant="outline" size="sm" onClick={() => startBeeindigen(a)}>
                            Beëindigen
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Nieuwe afspraak-dialoog ── */}
      <NieuweAfspraakDialoog
        open={nieuwOpen}
        onOpenChange={(o) => { setNieuwOpen(o); if (!o) setConflict(null); }}
        leveranciers={leveranciers ?? []}
        leverancierNaam={leverancierNaam}
        conflict={conflict}
        bezig={createMut.isPending}
        onSubmit={(invoer) => {
          setConflict(null);
          createMut.mutate({ data: invoer }, {
            onSuccess: () => {
              toast({ title: "Afspraak toegevoegd" });
              setNieuwOpen(false);
              invalidate();
            },
            onError: (err) => {
              if (err instanceof ApiError && err.status === 409 && err.data) {
                setConflict(err.data as PrijsafspraakConflict);
                return;
              }
              toast({ variant: "destructive", title: "Kon niet toevoegen", description: foutBericht(err, "Toevoegen mislukt.") });
            },
          });
        }}
      />

      {/* ── Beëindigen-bevestiging ── */}
      <AlertDialog open={teBeeindigen != null} onOpenChange={(o) => { if (!o) setTeBeeindigen(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Prijsafspraak beëindigen?</AlertDialogTitle>
            <AlertDialogDescription>
              De afspraak wordt ingekort tot de gekozen einddatum. Een afspraak kan
              alleen ingekort worden, niet verlengd. Dit draait de afspraak niet terug.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Label htmlFor="beeindig-datum">Geldig t/m</Label>
            <Input
              id="beeindig-datum"
              type="date"
              value={beeindigDatum}
              max={teBeeindigen?.geldig_tot}
              min={teBeeindigen?.geldig_van}
              onChange={(e) => setBeeindigDatum(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); bevestigBeeindigen(); }} disabled={beeindigMut.isPending}>
              Beëindigen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NieuweAfspraakDialoog({
  open, onOpenChange, leveranciers, leverancierNaam, conflict, bezig, onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leveranciers: Leverancier[];
  leverancierNaam: Map<number, string>;
  conflict: PrijsafspraakConflict | null;
  bezig: boolean;
  onSubmit: (invoer: PrijsafspraakInput) => void;
}) {
  const [leverancierId, setLeverancierId] = useState<string>("");
  const [artikelcode, setArtikelcode] = useState("");
  const [omschrijving, setOmschrijving] = useState("");
  const [prijs, setPrijs] = useState("");
  const [eenheid, setEenheid] = useState("stuk");
  const [geldigVan, setGeldigVan] = useState(vandaagIso());
  const [geldigTot, setGeldigTot] = useState("");
  const [staffelVanaf, setStaffelVanaf] = useState("0");
  const [exclBtw, setExclBtw] = useState(true);

  const reset = () => {
    setLeverancierId(""); setArtikelcode(""); setOmschrijving(""); setPrijs("");
    setEenheid("stuk"); setGeldigVan(vandaagIso()); setGeldigTot(""); setStaffelVanaf("0");
    setExclBtw(true);
  };

  const geldig =
    leverancierId !== "" &&
    prijs !== "" && Number.isFinite(Number(prijs)) &&
    eenheid.trim() !== "" &&
    geldigVan !== "" && geldigTot !== "" && geldigVan <= geldigTot &&
    (artikelcode.trim() !== "" || omschrijving.trim() !== "");

  const verzend = () => {
    if (!geldig) return;
    onSubmit({
      leverancier_id: Number(leverancierId),
      leverancier_artikelcode: artikelcode.trim() || undefined,
      leverancier_omschrijving: omschrijving.trim() || undefined,
      prijs: Number(prijs),
      eenheid: eenheid.trim(),
      excl_btw: exclBtw,
      geldig_van: geldigVan,
      geldig_tot: geldigTot,
      staffel_vanaf: Number(staffelVanaf) || 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nieuwe prijsafspraak</DialogTitle>
          <DialogDescription>
            Leg een afgesproken (jaar)prijs vast. Geef een artikelcode of een
            omschrijving op. Overlappende perioden worden geweigerd.
          </DialogDescription>
        </DialogHeader>

        {conflict && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
            <div className="flex items-start gap-2 text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">{conflict.error}</p>
                {conflict.botsende_regel && (
                  <p className="mt-1 text-amber-700">
                    Botsende regel: {leverancierNaam.get(conflict.botsende_regel.leverancier_id) ?? `#${conflict.botsende_regel.leverancier_id}`}
                    {" · "}
                    {conflict.botsende_regel.leverancier_artikelcode ?? conflict.botsende_regel.leverancier_omschrijving ?? "artikel"}
                    {" · "}
                    {eur(conflict.botsende_regel.prijs)} / {conflict.botsende_regel.eenheid}
                    {" · "}
                    {conflict.botsende_regel.geldig_van} t/m {conflict.botsende_regel.geldig_tot}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Leverancier</Label>
            <Select value={leverancierId} onValueChange={setLeverancierId}>
              <SelectTrigger>
                <SelectValue placeholder="Kies leverancier" />
              </SelectTrigger>
              <SelectContent>
                {leveranciers
                  .slice()
                  .sort((a, b) => a.naam.localeCompare(b.naam))
                  .map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>{l.naam}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Leverancier-artikelcode</Label>
              <Input value={artikelcode} onChange={(e) => setArtikelcode(e.target.value)} placeholder="bijv. ABC-123" />
            </div>
            <div className="space-y-1">
              <Label>Staffel vanaf</Label>
              <Input type="number" min={0} value={staffelVanaf} onChange={(e) => setStaffelVanaf(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Omschrijving</Label>
            <Input value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} placeholder="Omschrijving van het artikel" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Prijs</Label>
              <Input type="number" step="0.0001" value={prijs} onChange={(e) => setPrijs(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Eenheid</Label>
              <Input value={eenheid} onChange={(e) => setEenheid(e.target.value)} placeholder="stuk / m / uur" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="excl-btw" checked={exclBtw} onCheckedChange={setExclBtw} />
            <Label htmlFor="excl-btw">Prijs is exclusief btw</Label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Geldig van</Label>
              <Input type="date" value={geldigVan} onChange={(e) => setGeldigVan(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Geldig t/m</Label>
              <Input type="date" value={geldigTot} min={geldigVan} onChange={(e) => setGeldigTot(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={verzend} disabled={!geldig || bezig}>Opslaan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
