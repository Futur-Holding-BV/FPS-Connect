import { useState } from "react";
import { useListMeldingen, useGetMelding, useUpdateMelding } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Bug, MessageCircleQuestion, Lightbulb, Image as ImageIcon, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Sentinel-waarde: Radix Select crasht bij value="" (zelfde bug als profielen-bewerken)
const ALLE_FILTER = "__alle__";

const TYPE_LABELS: Record<string, string> = {
  bug: "Bug",
  vraag: "Vraag",
  verbetering: "Verbetering",
};

const TYPE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  bug: Bug,
  vraag: MessageCircleQuestion,
  verbetering: Lightbulb,
};

const URGENTIE_KLEUREN: Record<string, string> = {
  laag: "bg-slate-100 text-slate-700 border-slate-200",
  normaal: "bg-blue-50 text-blue-700 border-blue-200",
  hoog: "bg-orange-50 text-orange-700 border-orange-200",
  blokkerend: "bg-red-50 text-red-700 border-red-200",
};

const STATUS_KLEUREN: Record<string, string> = {
  nieuw: "bg-amber-50 text-amber-700 border-amber-200",
  in_behandeling: "bg-blue-50 text-blue-700 border-blue-200",
  opgelost: "bg-green-50 text-green-700 border-green-200",
  afgewezen: "bg-slate-100 text-slate-500 border-slate-200",
};

const STATUS_LABELS: Record<string, string> = {
  nieuw: "Nieuw",
  in_behandeling: "In behandeling",
  opgelost: "Opgelost",
  afgewezen: "Afgewezen",
};

type Filters = {
  type?: string;
  urgentie?: string;
  status?: string;
  gebruiker_naam?: string;
};

function DetailDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: melding, isLoading } = useGetMelding(id, { query: { queryKey: ["meldingen", id] } });
  const update = useUpdateMelding();
  const { toast } = useToast();
  const [status, setStatus] = useState("");
  const [notitie, setNotitie] = useState("");
  const [workaround, setWorkaround] = useState("");
  const [geinitialiseerd, setGeinitialiseerd] = useState(false);

  if (melding && !geinitialiseerd) {
    setStatus(melding.status);
    setNotitie(melding.interne_notitie ?? "");
    setWorkaround(melding.ai_workaround ?? "");
    setGeinitialiseerd(true);
  }

  async function slaOp() {
    try {
      await update.mutateAsync({
        id,
        data: {
          status: status as "nieuw" | "in_behandeling" | "opgelost" | "afgewezen",
          interne_notitie: notitie || undefined,
          ai_workaround: workaround || undefined,
        },
      });
      toast({ title: "Melding bijgewerkt" });
      onClose();
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  const TypeIcon = melding ? (TYPE_ICONS[melding.type] ?? Bug) : Bug;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {melding && <TypeIcon className="h-4 w-4" />}
            Melding #{id}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : melding ? (
          <div className="space-y-5">
            {/* Type + urgentie + datum */}
            <div className="flex flex-wrap gap-2 items-center">
              <Badge variant="outline" className={URGENTIE_KLEUREN[melding.urgentie]}>
                Urgentie: {melding.urgentie}
              </Badge>
              <Badge variant="outline" className="capitalize">{TYPE_LABELS[melding.type]}</Badge>
              <span className="text-xs text-muted-foreground ml-auto">
                {format(new Date(melding.aangemaakt_op), "d MMMM yyyy HH:mm", { locale: nl })}
              </span>
            </div>

            {/* Omschrijving */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Omschrijving</p>
              <p className="text-sm whitespace-pre-wrap">{melding.omschrijving}</p>
            </div>

            {/* AI reactie */}
            {melding.ai_reactie && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">AI eerste-reactie</p>
                <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm whitespace-pre-line">
                  {melding.ai_reactie}
                </div>
                {melding.ai_classificatie && (
                  <p className="text-xs text-muted-foreground">Classificatie: {melding.ai_classificatie}</p>
                )}
              </div>
            )}

            {/* Context */}
            <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
              {melding.gebruiker_naam && <div><span className="font-medium">Gebruiker:</span> {melding.gebruiker_naam}</div>}
              {melding.gebruiker_rol && <div><span className="font-medium">Rol:</span> {melding.gebruiker_rol}</div>}
              {melding.pagina && <div className="col-span-2"><span className="font-medium">Pagina:</span> {melding.pagina}</div>}
              {melding.browser_info && <div className="col-span-2 break-all"><span className="font-medium">Browser:</span> {melding.browser_info}</div>}
            </div>

            {/* Technische context */}
            {melding.tech_context && (
              <details className="text-xs">
                <summary className="cursor-pointer font-medium text-muted-foreground">Technische context</summary>
                <pre className="mt-2 rounded bg-muted p-3 overflow-auto text-xs text-muted-foreground">
                  {(() => { try { return JSON.stringify(JSON.parse(melding.tech_context ?? "{}"), null, 2); } catch { return melding.tech_context; } })()}
                </pre>
              </details>
            )}

            {/* Screenshot */}
            {melding.screenshot_data && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <ImageIcon className="h-3 w-3" /> Screenshot
                </p>
                <img
                  src={melding.screenshot_data}
                  alt="Screenshot melding"
                  className="max-h-80 w-full rounded border object-contain bg-muted"
                />
              </div>
            )}

            <hr />

            {/* Beheer-acties */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Opvolging</p>

              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nieuw" className="text-xs">Nieuw</SelectItem>
                    <SelectItem value="in_behandeling" className="text-xs">In behandeling</SelectItem>
                    <SelectItem value="opgelost" className="text-xs">Opgelost</SelectItem>
                    <SelectItem value="afgewezen" className="text-xs">Afgewezen / geen bug</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Workaround / oplossing (optioneel)</Label>
                <Textarea
                  value={workaround}
                  onChange={(e) => setWorkaround(e.target.value)}
                  rows={2}
                  className="resize-none text-xs"
                  placeholder="Beschrijf een tijdelijke oplossing of de definitieve fix…"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Interne notitie</Label>
                <Textarea
                  value={notitie}
                  onChange={(e) => setNotitie(e.target.value)}
                  rows={2}
                  className="resize-none text-xs"
                  placeholder="Niet zichtbaar voor de melder…"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={onClose}>Annuleren</Button>
                <Button size="sm" onClick={slaOp} disabled={update.isPending}>
                  {update.isPending ? "Opslaan..." : "Opslaan"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Melding niet gevonden.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function MeldingenBeheerPage() {
  const [filters, setFilters] = useState<Filters>({});
  const [zoekNaam, setZoekNaam] = useState("");
  const [geselecteerdId, setGeselecteerdId] = useState<number | null>(null);

  const zoekParams = {
    type: filters.type,
    urgentie: filters.urgentie,
    status: filters.status,
    gebruiker_naam: zoekNaam.trim() || undefined,
  };

  const { data: meldingen, isLoading, refetch } = useListMeldingen(zoekParams, {
    query: { queryKey: ["meldingen-beheer", JSON.stringify(zoekParams)] },
  });

  function filterWijzig(veld: keyof Filters, waarde: string | undefined) {
    setFilters((prev) => {
      const nieuw = { ...prev };
      if (!waarde) delete nieuw[veld]; else nieuw[veld] = waarde;
      return nieuw;
    });
  }

  const totaal = meldingen?.length ?? 0;
  const aantalNieuw = meldingen?.filter((m) => m.status === "nieuw").length ?? 0;
  const aantalBlokkerend = meldingen?.filter((m) => m.urgentie === "blokkerend").length ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 data-paginatitel className="text-xl font-semibold">Meldingen</h1>
          <p className="text-sm text-muted-foreground">Gebruikersmeldingen van bugs, vragen en verbetersuggities</p>
        </div>
        {aantalBlokkerend > 0 && (
          <div className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            {aantalBlokkerend} blokkerende melding{aantalBlokkerend !== 1 ? "en" : ""}
          </div>
        )}
      </div>

      {/* Statistieken */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Totaal</p>
          <p className="text-2xl font-semibold">{totaal}</p>
        </div>
        <div className="rounded-lg border bg-amber-50 px-4 py-3">
          <p className="text-xs text-amber-700">Nieuw</p>
          <p className="text-2xl font-semibold text-amber-700">{aantalNieuw}</p>
        </div>
        <div className="rounded-lg border bg-red-50 px-4 py-3">
          <p className="text-xs text-red-700">Blokkerend</p>
          <p className="text-2xl font-semibold text-red-700">{aantalBlokkerend}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select value={filters.type ?? ALLE_FILTER} onValueChange={(v) => filterWijzig("type", v === ALLE_FILTER ? undefined : v)}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="Alle types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALLE_FILTER} className="text-xs">Alle types</SelectItem>
              <SelectItem value="bug" className="text-xs">Bug</SelectItem>
              <SelectItem value="vraag" className="text-xs">Vraag</SelectItem>
              <SelectItem value="verbetering" className="text-xs">Verbetering</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Urgentie</Label>
          <Select value={filters.urgentie ?? ALLE_FILTER} onValueChange={(v) => filterWijzig("urgentie", v === ALLE_FILTER ? undefined : v)}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="Alle urgentie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALLE_FILTER} className="text-xs">Alle urgentie</SelectItem>
              <SelectItem value="laag" className="text-xs">Laag</SelectItem>
              <SelectItem value="normaal" className="text-xs">Normaal</SelectItem>
              <SelectItem value="hoog" className="text-xs">Hoog</SelectItem>
              <SelectItem value="blokkerend" className="text-xs">Blokkerend</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={filters.status ?? ALLE_FILTER} onValueChange={(v) => filterWijzig("status", v === ALLE_FILTER ? undefined : v)}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="Alle statussen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALLE_FILTER} className="text-xs">Alle statussen</SelectItem>
              <SelectItem value="nieuw" className="text-xs">Nieuw</SelectItem>
              <SelectItem value="in_behandeling" className="text-xs">In behandeling</SelectItem>
              <SelectItem value="opgelost" className="text-xs">Opgelost</SelectItem>
              <SelectItem value="afgewezen" className="text-xs">Afgewezen</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Gebruiker</Label>
          <Input
            value={zoekNaam}
            onChange={(e) => setZoekNaam(e.target.value)}
            placeholder="Naam zoeken…"
            className="h-8 w-40 text-xs"
          />
        </div>

        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => refetch()}>
          Verversen
        </Button>
      </div>

      {/* Tabel */}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-10">#</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs">Omschrijving</TableHead>
              <TableHead className="text-xs">Urgentie</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Gebruiker</TableHead>
              <TableHead className="text-xs">Pagina</TableHead>
              <TableHead className="text-xs">Datum</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : !meldingen || meldingen.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                  Geen meldingen gevonden
                </TableCell>
              </TableRow>
            ) : (
              meldingen.map((m) => {
                const TypeIcon = TYPE_ICONS[m.type] ?? Bug;
                return (
                  <TableRow
                    key={m.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setGeselecteerdId(m.id)}
                  >
                    <TableCell className="text-xs text-muted-foreground font-mono">{m.id}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <TypeIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs">{TYPE_LABELS[m.type]}</span>
                        {m.heeft_screenshot && <ImageIcon className="h-3 w-3 text-muted-foreground" />}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <p className="text-xs truncate">{m.omschrijving}</p>
                      {m.ai_reactie && <p className="text-xs text-muted-foreground truncate mt-0.5 italic">{m.ai_reactie.slice(0, 80)}…</p>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${URGENTIE_KLEUREN[m.urgentie]}`}>
                        {m.urgentie}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${STATUS_KLEUREN[m.status]}`}>
                        {STATUS_LABELS[m.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.gebruiker_naam ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">{m.pagina ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(m.aangemaakt_op), "d MMM HH:mm", { locale: nl })}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {geselecteerdId !== null && (
        <DetailDialog id={geselecteerdId} onClose={() => { setGeselecteerdId(null); refetch(); }} />
      )}
    </div>
  );
}
