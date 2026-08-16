import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetKalender,
  useListCollectieveVrijeDagen,
  useCreateCollectieveVrijeDagen,
  useDeleteCollectieveVrijeDag,
  useListKalenderAfspraken,
  useCreateKalenderAfspraak,
  useDeleteKalenderAfspraak,
  useListVerlofsoorten,
  useListWerkgevers,
  getGetKalenderQueryKey,
  getListCollectieveVrijeDagenQueryKey,
  getListKalenderAfsprakenQueryKey,
} from "@workspace/api-client-react";
import type {
  KalenderItem,
  CollectieveVrijeDag,
  CreateCollectieveVrijeDagen201,
  DeleteCollectieveVrijeDag200,
  CreateKalenderAfspraakBodyHerhaling,
} from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  ChevronLeft, ChevronRight, CalendarDays, Plus, Trash2, ExternalLink, Info,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

const HUIDIG_JAAR = new Date().getFullYear();

type Soort = KalenderItem["soort"];

const SOORTEN: Array<{ soort: Soort; label: string; kleur: string; stip: string }> = [
  { soort: "feestdag", label: "Feestdag", kleur: "bg-red-100 text-red-800 border-red-200", stip: "bg-red-500" },
  { soort: "collectief", label: "Collectief vrij", kleur: "bg-orange-100 text-orange-800 border-orange-200", stip: "bg-orange-500" },
  { soort: "vakantie", label: "Vakantie", kleur: "bg-emerald-100 text-emerald-800 border-emerald-200", stip: "bg-emerald-500" },
  { soort: "keuring", label: "Keuring", kleur: "bg-amber-100 text-amber-800 border-amber-200", stip: "bg-amber-500" },
  { soort: "verjaardag", label: "Verjaardag", kleur: "bg-pink-100 text-pink-800 border-pink-200", stip: "bg-pink-500" },
  { soort: "afspraak", label: "Afspraak", kleur: "bg-sky-100 text-sky-800 border-sky-200", stip: "bg-sky-500" },
];

const SOORT_MAP = Object.fromEntries(SOORTEN.map((s) => [s.soort, s])) as Record<Soort, (typeof SOORTEN)[number]>;

const MAANDEN = [
  "Januari", "Februari", "Maart", "April", "Mei", "Juni",
  "Juli", "Augustus", "September", "Oktober", "November", "December",
];
const WEEKDAGEN = ["ma", "di", "wo", "do", "vr", "za", "zo"];

const HERHALINGEN: Array<{ waarde: CreateKalenderAfspraakBodyHerhaling; label: string }> = [
  { waarde: "geen", label: "Geen (eenmalig)" },
  { waarde: "jaarlijks", label: "Jaarlijks" },
  { waarde: "halfjaarlijks", label: "Halfjaarlijks" },
  { waarde: "kwartaal", label: "Per kwartaal" },
];

/** Lokale (tijdzone-veilige) jjjj-mm-dd voor een dag in een maand. */
function datumSleutel(jaar: number, maand: number, dag: number): string {
  return `${jaar}-${String(maand + 1).padStart(2, "0")}-${String(dag).padStart(2, "0")}`;
}

/** Aantal dagen in een maand (0-based maand). */
function dagenInMaand(jaar: number, maand: number): number {
  return new Date(jaar, maand + 1, 0).getDate();
}

/** Weekdag-offset (0 = maandag) van de eerste dag van de maand. */
function eersteWeekdag(jaar: number, maand: number): number {
  return (new Date(jaar, maand, 1).getDay() + 6) % 7;
}

function MaandGrid({
  jaar,
  maand,
  itemsPerDag,
  onDagKlik,
}: {
  jaar: number;
  maand: number;
  itemsPerDag: Map<string, KalenderItem[]>;
  onDagKlik: (datum: string, items: KalenderItem[]) => void;
}) {
  const aantalDagen = dagenInMaand(jaar, maand);
  const offset = eersteWeekdag(jaar, maand);
  const cellen: Array<number | null> = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: aantalDagen }, (_, i) => i + 1),
  ];
  const vandaag = datumSleutel(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-semibold">{MAANDEN[maand]}</CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <div className="grid grid-cols-7 gap-0.5 text-center">
          {WEEKDAGEN.map((wd) => (
            <div key={wd} className="text-[10px] font-medium text-muted-foreground pb-1">{wd}</div>
          ))}
          {cellen.map((dag, i) => {
            if (dag == null) return <div key={`leeg-${i}`} />;
            const datum = datumSleutel(jaar, maand, dag);
            const items = itemsPerDag.get(datum) ?? [];
            const heeftItems = items.length > 0;
            const soortenOpDag = [...new Set(items.map((it) => it.soort))];
            const isVandaag = datum === vandaag;
            return (
              <button
                type="button"
                key={datum}
                disabled={!heeftItems}
                onClick={() => onDagKlik(datum, items)}
                className={[
                  "relative flex flex-col items-center justify-start rounded-md aspect-square min-h-[34px] text-xs transition-colors",
                  heeftItems ? "hover:bg-muted cursor-pointer font-medium" : "text-muted-foreground/70 cursor-default",
                  isVandaag ? "ring-2 ring-[#F23B0D] ring-offset-0" : "",
                ].join(" ")}
                title={heeftItems ? items.map((it) => it.titel).join(", ") : undefined}
              >
                <span className="mt-0.5">{dag}</span>
                {heeftItems && (
                  <span className="absolute bottom-1 flex gap-0.5">
                    {soortenOpDag.slice(0, 4).map((s) => (
                      <span key={s} className={`h-1.5 w-1.5 rounded-full ${SOORT_MAP[s].stip}`} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/** Weergave van een afboek-rapport (per medewerker/negatief/mislukt). */
function AfboekRapportWeergave({ rapport }: { rapport: CreateCollectieveVrijeDagen201["dagen"][number]["rapport"] }) {
  return (
    <div className="space-y-2 text-sm">
      <p><span className="font-medium">{rapport.verwerkt}</span> medewerker(s) afgeboekt.</p>
      {rapport.uren_per_medewerker.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Uren per medewerker</p>
          <ul className="space-y-0.5">
            {rapport.uren_per_medewerker.map((u) => (
              <li key={u.medewerker_id} className="text-xs">{u.naam}: {u.uren} u</li>
            ))}
          </ul>
        </div>
      )}
      {rapport.zonder_saldo_rij.length > 0 && (
        <Alert variant="destructive" className="py-2">
          <AlertTitle className="text-xs">Zonder saldo-rij (niet afgeboekt)</AlertTitle>
          <AlertDescription className="text-xs">{rapport.zonder_saldo_rij.join(", ")}</AlertDescription>
        </Alert>
      )}
      {rapport.negatief.length > 0 && (
        <Alert variant="destructive" className="py-2">
          <AlertTitle className="text-xs">Negatief saldo</AlertTitle>
          <AlertDescription className="text-xs">
            {rapport.negatief.map((n) => `${n.naam} (${n.saldo_uren} u)`).join(", ")}
          </AlertDescription>
        </Alert>
      )}
      {rapport.mislukt.length > 0 && (
        <Alert variant="destructive" className="py-2">
          <AlertTitle className="text-xs">Mislukt</AlertTitle>
          <AlertDescription className="text-xs">
            {rapport.mislukt.map((m) => `${m.naam}: ${m.reden}`).join(", ")}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default function JaarkalenderPagina() {
  const qc = useQueryClient();
  const { heeftNiveau } = useBevoegdheid();
  const magBeheren = heeftNiveau("personeel", 2);

  const [jaar, setJaar] = useState(HUIDIG_JAAR);
  const [werkgeverFilter, setWerkgeverFilter] = useState<string>("alle");
  const [actieveSoorten, setActieveSoorten] = useState<Set<Soort>>(new Set(SOORTEN.map((s) => s.soort)));

  const werkgeverId = werkgeverFilter !== "alle" ? Number(werkgeverFilter) : undefined;

  const { data: kalender, isLoading } = useGetKalender({ jaar, ...(werkgeverId != null ? { werkgever_id: werkgeverId } : {}) });
  const { data: werkgevers = [] } = useListWerkgevers();

  const items = kalender?.items ?? [];

  // Client-side filter op soort.
  const gefilterd = useMemo(
    () => items.filter((it) => actieveSoorten.has(it.soort)),
    [items, actieveSoorten],
  );

  const itemsPerDag = useMemo(() => {
    const map = new Map<string, KalenderItem[]>();
    for (const it of gefilterd) {
      const lijst = map.get(it.datum) ?? [];
      lijst.push(it);
      map.set(it.datum, lijst);
    }
    return map;
  }, [gefilterd]);

  // Dag-popover.
  const [gekozenDag, setGekozenDag] = useState<{ datum: string; items: KalenderItem[] } | null>(null);

  function toggleSoort(soort: Soort) {
    setActieveSoorten((prev) => {
      const volgende = new Set(prev);
      if (volgende.has(soort)) volgende.delete(soort);
      else volgende.add(soort);
      return volgende;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Jaarkalender</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Feestdagen, collectieve vrije dagen, verlof, keuringen, verjaardagen en afspraken — {jaar}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setJaar((j) => j - 1)} aria-label="Vorig jaar">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setJaar(HUIDIG_JAAR)}>{jaar}</Button>
          <Button variant="outline" size="icon" onClick={() => setJaar((j) => j + 1)} aria-label="Volgend jaar">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Beheersecties — bovenaan op verzoek van René */}
      {magBeheren && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CollectieveVrijeDagenSectie jaar={jaar} qc={qc} />
          <TerugkerendeAfsprakenSectie qc={qc} />
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="flex flex-wrap items-center gap-4">
            {SOORTEN.map((s) => (
              <label key={s.soort} className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  checked={actieveSoorten.has(s.soort)}
                  onCheckedChange={() => toggleSoort(s.soort)}
                />
                <span className={`h-2.5 w-2.5 rounded-full ${s.stip}`} />
                <span className="text-sm">{s.label}</span>
              </label>
            ))}
          </div>
          {werkgevers.length > 0 && (
            <div className="flex items-center gap-2">
              <Label className="text-sm">Werkgever</Label>
              <Select value={werkgeverFilter} onValueChange={setWerkgeverFilter}>
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle werkgevers</SelectItem>
                  {werkgevers.map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>{w.naam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Maandgrids */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Kalender wordt geladen…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {MAANDEN.map((_, maand) => (
            <MaandGrid
              key={maand}
              jaar={jaar}
              maand={maand}
              itemsPerDag={itemsPerDag}
              onDagKlik={(datum, dagItems) => setGekozenDag({ datum, items: dagItems })}
            />
          ))}
        </div>
      )}

      {/* Dag-popover als dialog */}
      <Dialog open={gekozenDag != null} onOpenChange={(open) => !open && setGekozenDag(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {gekozenDag && new Date(gekozenDag.datum + "T00:00:00").toLocaleDateString("nl-NL", {
                weekday: "long", day: "numeric", month: "long", year: "numeric",
              })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {gekozenDag?.items.map((it, i) => {
              const meta = SOORT_MAP[it.soort];
              const inhoud = (
                <div className={`rounded-md border p-3 ${meta.kleur}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${meta.stip}`} />
                      <span className="font-medium truncate">{it.titel}</span>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">{meta.label}</Badge>
                  </div>
                  {it.omschrijving && <p className="text-xs mt-1 opacity-90">{it.omschrijving}</p>}
                  {it.link && (
                    <span className="text-xs mt-1 inline-flex items-center gap-1 underline">
                      Ga naar bron <ExternalLink className="h-3 w-3" />
                    </span>
                  )}
                </div>
              );
              return it.link ? (
                <Link key={i} href={it.link} onClick={() => setGekozenDag(null)} className="block">
                  {inhoud}
                </Link>
              ) : (
                <div key={i}>{inhoud}</div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}

// ── Collectieve vrije dagen ──────────────────────────────────────────────────

function CollectieveVrijeDagenSectie({ jaar, qc }: { jaar: number; qc: ReturnType<typeof useQueryClient> }) {
  const { data: dagen = [] } = useListCollectieveVrijeDagen({ jaar });
  const { data: verlofsoorten = [] } = useListVerlofsoorten();
  const { data: werkgevers = [] } = useListWerkgevers();

  const collectieveSoorten = useMemo(
    () => verlofsoorten.filter((v) => v.collectief && v.actief),
    [verlofsoorten],
  );

  const createDagen = useCreateCollectieveVrijeDagen();
  const deleteDag = useDeleteCollectieveVrijeDag();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [rijen, setRijen] = useState<Array<{ datum: string; naam: string }>>([{ datum: "", naam: "" }]);
  const [verlofsoortId, setVerlofsoortId] = useState<string>("");
  const [werkgeverId, setWerkgeverId] = useState<string>("geen");
  const [resultaat, setResultaat] = useState<CreateCollectieveVrijeDagen201 | null>(null);

  const [teVerwijderen, setTeVerwijderen] = useState<CollectieveVrijeDag | null>(null);
  const [teruggedraaid, setTeruggedraaid] = useState<DeleteCollectieveVrijeDag200 | null>(null);

  function resetForm() {
    setRijen([{ datum: "", naam: "" }]);
    setVerlofsoortId("");
    setWerkgeverId("geen");
    setResultaat(null);
  }

  // Verlofsoort automatisch afleiden uit de gekozen werkgever (op verzoek van
  // René: geen handmatige keuze zolang de werkmaatschappij dit al bepaalt).
  // Kandidaten: collectieve soorten van de gekozen werkmaatschappij, plus
  // algemene soorten (zonder werkmaatschappij). Bij "Alle werkgevers" tellen
  // alle collectieve soorten mee, met voorkeur voor de algemene.
  const gekozenWerkgeverNaam = useMemo(
    () => werkgevers.find((w) => String(w.id) === werkgeverId)?.naam ?? null,
    [werkgevers, werkgeverId],
  );
  const kandidaatSoorten = useMemo(() => {
    if (!gekozenWerkgeverNaam) {
      const algemeen = collectieveSoorten.filter((v) => !v.werkmaatschappij);
      return algemeen.length > 0 ? algemeen : collectieveSoorten;
    }
    const specifiek = collectieveSoorten.filter(
      (v) => v.werkmaatschappij && v.werkmaatschappij.toLowerCase() === gekozenWerkgeverNaam.toLowerCase(),
    );
    if (specifiek.length > 0) return specifiek;
    const algemeen = collectieveSoorten.filter((v) => !v.werkmaatschappij);
    return algemeen.length > 0 ? algemeen : collectieveSoorten;
  }, [collectieveSoorten, gekozenWerkgeverNaam]);

  useEffect(() => {
    // Automatisch (her)kiezen zodra de werkgever wijzigt of de kandidaten laden.
    if (kandidaatSoorten.length === 0) {
      setVerlofsoortId("");
      return;
    }
    if (!kandidaatSoorten.some((v) => String(v.id) === verlofsoortId)) {
      setVerlofsoortId(String(kandidaatSoorten[0].id));
    }
  }, [kandidaatSoorten, verlofsoortId]);

  async function opslaan() {
    const geldig = rijen.filter((r) => r.datum && r.naam.trim());
    if (geldig.length === 0) {
      toast({ title: "Voeg minimaal één dag met datum en naam toe", variant: "destructive" });
      return;
    }
    if (!verlofsoortId) {
      toast({ title: "Kies een verlofsoort", variant: "destructive" });
      return;
    }
    try {
      const res = await createDagen.mutateAsync({
        data: {
          dagen: geldig.map((r) => ({ datum: r.datum, naam: r.naam.trim() })),
          verlofsoort_id: Number(verlofsoortId),
          werkgever_id: werkgeverId !== "geen" ? Number(werkgeverId) : null,
        },
      });
      setResultaat(res);
      await qc.invalidateQueries({ queryKey: getListCollectieveVrijeDagenQueryKey({ jaar }) });
      await qc.invalidateQueries({ queryKey: getGetKalenderQueryKey() });
      toast({ title: "Collectieve vrije dag(en) vastgelegd" });
    } catch (err) {
      const e = err as { data?: { error?: string } };
      toast({ title: "Fout bij opslaan", description: e?.data?.error, variant: "destructive" });
    }
  }

  async function verwijder() {
    if (!teVerwijderen) return;
    try {
      const res = await deleteDag.mutateAsync({ id: teVerwijderen.id });
      setTeruggedraaid(res);
      await qc.invalidateQueries({ queryKey: getListCollectieveVrijeDagenQueryKey({ jaar }) });
      await qc.invalidateQueries({ queryKey: getGetKalenderQueryKey() });
      toast({ title: "Collectieve vrije dag teruggedraaid" });
    } catch (err) {
      const e = err as { data?: { error?: string } };
      toast({ title: "Terugdraaien mislukt", description: e?.data?.error, variant: "destructive" });
    } finally {
      setTeVerwijderen(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4" /> Collectieve vrije dagen
        </CardTitle>
        <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Toevoegen
        </Button>
      </CardHeader>
      <CardContent>
        {dagen.length === 0 ? (
          <p className="text-sm text-muted-foreground">Geen collectieve vrije dagen in {jaar}.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Naam</TableHead>
                <TableHead>Verlofsoort</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {dagen.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{d.datum}</TableCell>
                  <TableCell>{d.naam}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {d.verlofsoort_naam}{d.werkgever_naam ? ` · ${d.werkgever_naam}` : ""}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setTeVerwijderen(d)} aria-label="Terugdraaien">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Toevoegen-dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Collectieve vrije dagen vastleggen</DialogTitle>
            <DialogDescription>
              De dagen worden direct via het verlofmechanisme afgeboekt bij alle actieve medewerkers.
            </DialogDescription>
          </DialogHeader>

          {resultaat ? (
            <div className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Beperking</AlertTitle>
                <AlertDescription className="text-xs">{resultaat.beperking}</AlertDescription>
              </Alert>
              {resultaat.dagen.map((d) => (
                <div key={d.id} className="rounded-md border p-3">
                  <p className="font-medium text-sm mb-2">{d.datum} — {d.naam}</p>
                  <AfboekRapportWeergave rapport={d.rapport} />
                </div>
              ))}
              <DialogFooter>
                <Button onClick={() => setDialogOpen(false)}>Sluiten</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              {werkgevers.length > 0 && (
                <div className="space-y-2">
                  <Label>Werkgever (optioneel)</Label>
                  <Select value={werkgeverId} onValueChange={setWerkgeverId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="geen">Alle werkgevers</SelectItem>
                      {werkgevers.map((w) => (
                        <SelectItem key={w.id} value={String(w.id)}>{w.naam}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Verlofsoort wordt automatisch bepaald door de werkmaatschappij. */}
              <div className="space-y-1">
                <Label>Verlofsoort (collectief)</Label>
                {kandidaatSoorten.length === 0 ? (
                  <p className="text-sm text-destructive">
                    Geen collectieve verlofsoort gevonden. Leg er eerst één vast bij de verlofsoorten (HRM).
                  </p>
                ) : kandidaatSoorten.length === 1 ? (
                  <p className="text-sm text-muted-foreground">
                    {kandidaatSoorten[0].naam} <span className="text-xs">(automatisch via werkmaatschappij)</span>
                  </p>
                ) : (
                  <Select value={verlofsoortId} onValueChange={setVerlofsoortId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Kies verlofsoort" />
                    </SelectTrigger>
                    <SelectContent>
                      {kandidaatSoorten.map((v) => (
                        <SelectItem key={v.id} value={String(v.id)}>{v.naam}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label>Dagen</Label>
                {rijen.map((rij, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={rij.datum}
                      onChange={(e) => setRijen((prev) => prev.map((r, j) => j === i ? { ...r, datum: e.target.value } : r))}
                      className="w-40"
                    />
                    <Input
                      placeholder="Naam (bv. Brugdag)"
                      value={rij.naam}
                      onChange={(e) => setRijen((prev) => prev.map((r, j) => j === i ? { ...r, naam: e.target.value } : r))}
                    />
                    {rijen.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => setRijen((prev) => prev.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setRijen((prev) => [...prev, { datum: "", naam: "" }])}>
                  <Plus className="h-4 w-4 mr-1" /> Dag toevoegen
                </Button>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuleren</Button>
                <Button onClick={opslaan} disabled={createDagen.isPending}>
                  {createDagen.isPending ? "Bezig…" : "Opslaan"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bevestiging terugdraaien */}
      <AlertDialog open={teVerwijderen != null} onOpenChange={(open) => !open && setTeVerwijderen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Collectieve vrije dag terugdraaien?</AlertDialogTitle>
            <AlertDialogDescription>
              Terugdraaien trekt alle gekoppelde verlofaanvragen in en boekt saldi terug.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={verwijder} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Terugdraaien
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Teruggedraaid-overzicht */}
      <Dialog open={teruggedraaid != null} onOpenChange={(open) => !open && setTeruggedraaid(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Teruggedraaid</DialogTitle>
          </DialogHeader>
          <div className="text-sm space-y-2">
            {teruggedraaid && teruggedraaid.teruggedraaid.length === 0 ? (
              <p className="text-muted-foreground">Er waren geen gekoppelde verlofaanvragen om terug te boeken.</p>
            ) : (
              <ul className="space-y-1">
                {teruggedraaid?.teruggedraaid.map((t, i) => (
                  <li key={i} className="text-sm">{t.naam}: {t.uren} u teruggeboekt</li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setTeruggedraaid(null)}>Sluiten</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Terugkerende afspraken ───────────────────────────────────────────────────

function TerugkerendeAfsprakenSectie({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const { data: afspraken = [] } = useListKalenderAfspraken();
  const { data: werkgevers = [] } = useListWerkgevers();

  const createAfspraak = useCreateKalenderAfspraak();
  const deleteAfspraak = useDeleteKalenderAfspraak();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [titel, setTitel] = useState("");
  const [omschrijving, setOmschrijving] = useState("");
  const [startDatum, setStartDatum] = useState("");
  const [herhaling, setHerhaling] = useState<CreateKalenderAfspraakBodyHerhaling>("jaarlijks");
  const [eindDatum, setEindDatum] = useState("");
  const [aantalHerhalingen, setAantalHerhalingen] = useState("");
  const [werkgeverId, setWerkgeverId] = useState<string>("geen");

  const [teVerwijderenId, setTeVerwijderenId] = useState<number | null>(null);

  function resetForm() {
    setTitel("");
    setOmschrijving("");
    setStartDatum("");
    setHerhaling("jaarlijks");
    setEindDatum("");
    setAantalHerhalingen("");
    setWerkgeverId("geen");
  }

  async function opslaan() {
    if (!titel.trim()) {
      toast({ title: "Titel is verplicht", variant: "destructive" });
      return;
    }
    if (!startDatum) {
      toast({ title: "Startdatum is verplicht", variant: "destructive" });
      return;
    }
    try {
      await createAfspraak.mutateAsync({
        data: {
          titel: titel.trim(),
          omschrijving: omschrijving.trim() || null,
          start_datum: startDatum,
          herhaling,
          eind_datum: eindDatum || null,
          aantal_herhalingen: aantalHerhalingen ? Number(aantalHerhalingen) : null,
          werkgever_id: werkgeverId !== "geen" ? Number(werkgeverId) : null,
        },
      });
      await qc.invalidateQueries({ queryKey: getListKalenderAfsprakenQueryKey() });
      await qc.invalidateQueries({ queryKey: getGetKalenderQueryKey() });
      toast({ title: "Afspraak toegevoegd" });
      setDialogOpen(false);
      resetForm();
    } catch (err) {
      const e = err as { data?: { error?: string } };
      toast({ title: "Fout bij opslaan", description: e?.data?.error, variant: "destructive" });
    }
  }

  async function verwijder() {
    if (teVerwijderenId == null) return;
    try {
      await deleteAfspraak.mutateAsync({ id: teVerwijderenId });
      await qc.invalidateQueries({ queryKey: getListKalenderAfsprakenQueryKey() });
      await qc.invalidateQueries({ queryKey: getGetKalenderQueryKey() });
      toast({ title: "Afspraak verwijderd" });
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    } finally {
      setTeVerwijderenId(null);
    }
  }

  const herhalingLabel = (h: string) => HERHALINGEN.find((x) => x.waarde === h)?.label ?? h;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4" /> Terugkerende afspraken
        </CardTitle>
        <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Toevoegen
        </Button>
      </CardHeader>
      <CardContent>
        {afspraken.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen afspraken.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titel</TableHead>
                <TableHead>Vanaf</TableHead>
                <TableHead>Herhaling</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {afspraken.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="font-medium">{a.titel}</div>
                    {a.omschrijving && <div className="text-xs text-muted-foreground">{a.omschrijving}</div>}
                  </TableCell>
                  <TableCell>{a.start_datum}</TableCell>
                  <TableCell><Badge variant="secondary">{herhalingLabel(a.herhaling)}</Badge></TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setTeVerwijderenId(a.id)} aria-label="Verwijderen">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Toevoegen-dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Terugkerende afspraak toevoegen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Titel</Label>
              <Input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="Bv. Personeelsuitje" />
            </div>
            <div className="space-y-2">
              <Label>Omschrijving (optioneel)</Label>
              <Textarea value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Startdatum</Label>
                <Input type="date" value={startDatum} onChange={(e) => setStartDatum(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Herhaling</Label>
                <Select value={herhaling} onValueChange={(v) => setHerhaling(v as CreateKalenderAfspraakBodyHerhaling)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HERHALINGEN.map((h) => (
                      <SelectItem key={h.waarde} value={h.waarde}>{h.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {herhaling !== "geen" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Einddatum (optioneel)</Label>
                  <Input type="date" value={eindDatum} onChange={(e) => setEindDatum(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Aantal herhalingen (optioneel)</Label>
                  <Input type="number" min={1} value={aantalHerhalingen} onChange={(e) => setAantalHerhalingen(e.target.value)} />
                </div>
              </div>
            )}
            {werkgevers.length > 0 && (
              <div className="space-y-2">
                <Label>Werkgever (optioneel)</Label>
                <Select value={werkgeverId} onValueChange={setWerkgeverId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="geen">Alle werkgevers</SelectItem>
                    {werkgevers.map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>{w.naam}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuleren</Button>
            <Button onClick={opslaan} disabled={createAfspraak.isPending}>
              {createAfspraak.isPending ? "Bezig…" : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bevestiging verwijderen */}
      <AlertDialog open={teVerwijderenId != null} onOpenChange={(open) => !open && setTeVerwijderenId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Afspraak verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>Deze terugkerende afspraak wordt definitief verwijderd.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={verwijder} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
