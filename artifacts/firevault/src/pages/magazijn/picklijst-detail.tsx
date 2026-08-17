import { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetMagazijnPicklijst,
  useVerwerkMagazijnPicklijst,
  useUpdateMagazijnPicklijst,
} from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Play, CheckCircle2, AlertCircle, Package, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  concept: "Concept",
  in_uitvoering: "In uitvoering",
  voltooid: "Voltooid",
  deels_voltooid: "Deels voltooid",
  geannuleerd: "Geannuleerd",
};

const STATUS_KLEUR: Record<string, string> = {
  concept: "bg-gray-100 text-gray-700",
  in_uitvoering: "bg-blue-100 text-blue-700",
  voltooid: "bg-green-100 text-green-700",
  deels_voltooid: "bg-amber-100 text-amber-700",
  geannuleerd: "bg-red-100 text-red-700",
};

const REGEL_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  gepickt: "Gepickt",
  niet_beschikbaar: "Niet beschikbaar",
};

const REGEL_STATUS_KLEUR: Record<string, string> = {
  open: "bg-gray-100 text-gray-600",
  gepickt: "bg-green-100 text-green-700",
  niet_beschikbaar: "bg-red-100 text-red-700",
};

function formatDatum(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

type PicklijstRegel = {
  id: number;
  artikel_naam: string | null;
  artikel_eenheid: string | null;
  artikel_code: string | null;
  locatie_naam: string | null;
  gevraagd_hoeveelheid: number;
  gepickt_hoeveelheid: number;
  vrije_voorraad: number | null;
  status: string;
};

export default function PicklijstDetailPagina() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { heeftNiveau } = useBevoegdheid();
  const kanSchrijven = heeftNiveau("magazijn", 2);

  const pickId = Number(id);
  const {
    data: pick,
    isLoading,
    refetch,
    error,
  } = useGetMagazijnPicklijst(pickId, {
    query: { queryKey: ["magazijn-picklijst", pickId] },
  });

  const { mutate: verwerk, isPending: verwerkBezig } = useVerwerkMagazijnPicklijst({
    mutation: {
      onSuccess: () => {
        void refetch();
        setShowVerwerk(false);
      },
    },
  });
  const { mutate: update } = useUpdateMagazijnPicklijst({
    mutation: { onSuccess: () => void refetch() },
  });

  const [showVerwerk, setShowVerwerk] = useState(false);
  const [gepickt, setGepickt] = useState<Record<number, string>>({});
  const [regelStatus, setRegelStatus] = useState<Record<number, string>>({});

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  if (error || !pick) {
    return (
      <div className="p-6 flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="h-10 w-10 text-destructive mb-4" />
        <p className="font-medium">Picklijst niet gevonden</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/magazijn/picklijsten")}>
          Terug naar overzicht
        </Button>
      </div>
    );
  }

  const regels: PicklijstRegel[] = (pick as { regels?: PicklijstRegel[] }).regels ?? [];
  const kanVerwerken = ["concept", "in_uitvoering"].includes(pick.status);
  const isGesloten = ["voltooid", "deels_voltooid", "geannuleerd"].includes(pick.status);
  const pct = pick.totaal_regels > 0
    ? Math.round((pick.gepickt_regels / pick.totaal_regels) * 100)
    : 0;

  function openVerwerken() {
    const init: Record<number, string> = {};
    const initStatus: Record<number, string> = {};
    regels.filter((r) => r.status === "open").forEach((r) => {
      const beschikbaar = r.vrije_voorraad ?? r.gevraagd_hoeveelheid;
      const voorgepickt = Math.min(r.gevraagd_hoeveelheid, Math.max(0, beschikbaar));
      init[r.id] = String(voorgepickt);
      initStatus[r.id] = voorgepickt <= 0 ? "niet_beschikbaar" : "gepickt";
    });
    setGepickt(init);
    setRegelStatus(initStatus);
    setShowVerwerk(true);
  }

  function handleVerwerken() {
    const inkomend = regels
      .filter((r) => r.status === "open")
      .map((r) => ({
        regel_id: r.id,
        gepickt_hoeveelheid: Number(gepickt[r.id] ?? 0),
        status: regelStatus[r.id] ?? "gepickt",
      }));
    verwerk({ id: pickId, data: { regels: inkomend } });
  }

  function allesGepickt() {
    const openRegels = regels.filter((r) => r.status === "open");
    const nieuweGepickt: Record<number, string> = {};
    const nieuweStatus: Record<number, string> = {};
    openRegels.forEach((r) => {
      const beschikbaar = r.vrije_voorraad ?? r.gevraagd_hoeveelheid;
      const voorgepickt = Math.min(r.gevraagd_hoeveelheid, Math.max(0, beschikbaar));
      nieuweGepickt[r.id] = String(voorgepickt);
      nieuweStatus[r.id] = voorgepickt <= 0 ? "niet_beschikbaar" : "gepickt";
    });
    setGepickt(nieuweGepickt);
    setRegelStatus(nieuweStatus);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/magazijn/picklijsten")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 data-paginatitel className="text-xl font-semibold">
            {pick.opdracht_titel ?? "Picklijst"} #{pick.id}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge className={STATUS_KLEUR[pick.status] ?? "bg-gray-100 text-gray-700"}>
              {STATUS_LABELS[pick.status] ?? pick.status}
            </Badge>
            {!isGesloten && (
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-20 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">{pct}%</span>
              </div>
            )}
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          {kanSchrijven && kanVerwerken && (
            <Button onClick={openVerwerken}>
              <Play className="h-4 w-4 mr-2" />
              Verwerken
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg border">
        <div>
          <p className="text-xs text-muted-foreground">Project</p>
          <p className="text-sm font-medium">{pick.opdracht_titel ?? "Geen project"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Geplande uitgifte</p>
          <p className="text-sm font-medium">{formatDatum(pick.geplande_uitgifte_op)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Aangemaakt door</p>
          <p className="text-sm font-medium">{pick.aangemaakt_door_naam ?? "—"}</p>
        </div>
      </div>

      {pick.notities && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
          <strong>Notities:</strong> {pick.notities}
        </div>
      )}

      {isGesloten && pick.verwerkt_op && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md flex items-center gap-2 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          <span>Verwerkt op {formatDatum(pick.verwerkt_op)}</span>
        </div>
      )}

      <div>
        <h2 className="text-base font-medium mb-3">Artikelen</h2>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artikel</TableHead>
                <TableHead>Locatie</TableHead>
                <TableHead className="text-right">Gevraagd</TableHead>
                <TableHead className="text-right">Vrije voorraad</TableHead>
                <TableHead className="text-right">Gepickt</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {regels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-8">
                    <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                    Geen artikelen op deze picklijst
                  </TableCell>
                </TableRow>
              ) : (
                regels.map((r) => {
                  const tekortVoorraad = r.vrije_voorraad != null && r.vrije_voorraad < r.gevraagd_hoeveelheid;
                  return (
                    <TableRow
                      key={r.id}
                      className={cn(r.status === "gepickt" && "bg-green-50/50")}
                    >
                      <TableCell>
                        <p className="font-medium text-sm">{r.artikel_naam ?? `Artikel #${r.id}`}</p>
                        {r.artikel_code && <p className="text-xs text-muted-foreground">{r.artikel_code}</p>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.locatie_naam ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {r.gevraagd_hoeveelheid} {r.artikel_eenheid ?? ""}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {r.vrije_voorraad != null ? (
                          <span className={cn(tekortVoorraad && "text-orange-600 font-medium")}>
                            {r.vrije_voorraad} {r.artikel_eenheid ?? ""}
                            {tekortVoorraad && " ⚠"}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {r.gepickt_hoeveelheid > 0 ? (
                          <span className="text-green-700 font-medium">
                            {r.gepickt_hoeveelheid} {r.artikel_eenheid ?? ""}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge className={REGEL_STATUS_KLEUR[r.status] ?? "bg-gray-100 text-gray-600"}>
                          {REGEL_STATUS_LABELS[r.status] ?? r.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="text-xs text-muted-foreground border-t pt-3 flex gap-6">
        <span>Aangemaakt: {formatDatum(pick.aangemaakt_op)}</span>
        {pick.verwerkt_op && <span>Verwerkt: {formatDatum(pick.verwerkt_op)}</span>}
      </div>

      <Dialog open={showVerwerk} onOpenChange={setShowVerwerk}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Picklijst verwerken</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={allesGepickt}>
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Alles gepickt
              </Button>
            </div>
            {regels.filter((r) => r.status === "open").map((r) => {
              const beschikbaar = r.vrije_voorraad ?? null;
              const tekort = beschikbaar != null && beschikbaar < r.gevraagd_hoeveelheid;
              const geenVoorraad = beschikbaar != null && beschikbaar <= 0;
              const gepicktWaarde = Number(gepickt[r.id] ?? 0);
              const overschrijdtVoorraad = beschikbaar != null && gepicktWaarde > beschikbaar;
              return (
                <div key={r.id} className={cn("space-y-2 p-3 border rounded-md", geenVoorraad && "border-red-200 bg-red-50/50", tekort && !geenVoorraad && "border-amber-200 bg-amber-50/50")}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{r.artikel_naam ?? `Artikel #${r.id}`}</p>
                      <p className="text-xs text-muted-foreground">
                        Gevraagd: {r.gevraagd_hoeveelheid} {r.artikel_eenheid ?? ""}
                        {beschikbaar != null && (
                          <span className={cn("ml-1", tekort ? "text-red-600 font-medium" : "text-muted-foreground")}>
                            · Beschikbaar: {beschikbaar} {r.artikel_eenheid ?? ""}
                          </span>
                        )}
                      </p>
                    </div>
                    {geenVoorraad && (
                      <Badge className="bg-red-100 text-red-700 shrink-0 text-xs">
                        <TriangleAlert className="h-3 w-3 mr-1" />
                        Geen voorraad
                      </Badge>
                    )}
                    {tekort && !geenVoorraad && (
                      <Badge className="bg-amber-100 text-amber-700 shrink-0 text-xs">
                        <TriangleAlert className="h-3 w-3 mr-1" />
                        Tekort
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Gepickt</Label>
                      <Input
                        type="number"
                        min="0"
                        max={beschikbaar != null ? Math.min(r.gevraagd_hoeveelheid, beschikbaar) : r.gevraagd_hoeveelheid}
                        step="any"
                        value={gepickt[r.id] ?? ""}
                        className={cn(overschrijdtVoorraad && "border-red-400 focus-visible:ring-red-400")}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGepickt((prev) => ({ ...prev, [r.id]: val }));
                          const n = Number(val);
                          if (beschikbaar != null && n > beschikbaar) {
                            setGepickt((prev) => ({ ...prev, [r.id]: String(Math.max(0, beschikbaar)) }));
                          }
                        }}
                      />
                      {overschrijdtVoorraad && (
                        <p className="text-xs text-red-600">Maximaal {beschikbaar} beschikbaar</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Status</Label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                        value={regelStatus[r.id] ?? "gepickt"}
                        onChange={(e) => setRegelStatus((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      >
                        <option value="gepickt">Gepickt</option>
                        <option value="niet_beschikbaar">Niet beschikbaar</option>
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
            {regels.filter((r) => r.status === "open").length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Alle regels zijn al verwerkt.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVerwerk(false)}>Annuleren</Button>
            <Button onClick={handleVerwerken} disabled={verwerkBezig}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {verwerkBezig ? "Verwerken..." : "Uitgifte bevestigen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
