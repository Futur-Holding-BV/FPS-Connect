// Overwerkslot-beheer (UREN_01 §4) op de projectdetailpagina.
// Toont de status van het overwerkslot van het gekoppelde project en laat een
// projectleider of hoofdbeheerder het slot openzetten/sluiten en openstaande
// toestemmings-aanvragen goedkeuren.
import { useState } from "react";
import {
  useGetOverwerkslot,
  useOpenOverwerkslot,
  useSluitOverwerkslot,
  getGetOverwerkslotQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import type { OverwerkSlot } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Clock, Lock, Unlock, CheckCircle2, ShieldQuestion } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Zondag van de lopende week (ISO: maandag is de eerste dag).
function zondagVanLopendeWeek(): string {
  const nu = new Date();
  const dag = nu.getDay() || 7; // zondag = 7
  const zo = new Date(nu);
  zo.setDate(nu.getDate() + (7 - dag));
  return zo.toISOString().slice(0, 10);
}

function formatDatum(d?: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

function formatMoment(d?: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatUren(u?: number | null): string {
  if (u == null) return "—";
  const h = Math.floor(u);
  const m = Math.round((u - h) * 60);
  return m > 0 ? `${h}u ${m}m` : `${h}u`;
}

function foutTekst(err: unknown, standaard: string): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "U heeft geen rechten om het overwerkslot te beheren (alleen projectleider of hoofdbeheerder).";
    const data = err.data as { error?: string } | null;
    if (data?.error) return data.error;
  }
  return standaard;
}

function OpenzettenDialog({
  open, onClose, projectId, aanvraag, onKlaar,
}: {
  open: boolean;
  onClose: () => void;
  projectId: number;
  aanvraag: OverwerkSlot | null;
  onKlaar: () => void;
}) {
  const { toast } = useToast();
  const [geldigTot, setGeldigTot] = useState(zondagVanLopendeWeek());
  const [reden, setReden] = useState(aanvraag?.motivatie_aanvraag ?? "");
  const [urenPlafond, setUrenPlafond] = useState("");
  const openen = useOpenOverwerkslot();

  async function bewaar() {
    if (!geldigTot) {
      toast({ title: "Einddatum is verplicht", variant: "destructive" });
      return;
    }
    if (!reden.trim()) {
      toast({ title: "Reden is verplicht", variant: "destructive" });
      return;
    }
    try {
      await openen.mutateAsync({
        id: projectId,
        data: {
          geldig_tot: geldigTot,
          reden: reden.trim(),
          uren_plafond: urenPlafond ? Number(urenPlafond) : undefined,
          aanvraag_id: aanvraag?.id ?? undefined,
        },
      });
      toast({ title: "Overwerkslot opengezet" });
      onKlaar();
      onClose();
    } catch (err) {
      toast({ title: "Openzetten mislukt", description: foutTekst(err, "Probeer het opnieuw."), variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Overwerkslot openzetten</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Zolang het slot open staat mogen medewerkers boven de weekgrens uren boeken op dit project.
          </p>
          {aanvraag?.motivatie_aanvraag && (
            <div className="rounded-md border bg-muted/40 p-2 text-xs">
              <span className="text-muted-foreground">Motivatie aanvraag: </span>
              {aanvraag.motivatie_aanvraag}
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Geldig t/m <span className="text-destructive">*</span></Label>
            <DatePicker value={geldigTot} onChange={setGeldigTot} />
          </div>
          <div className="space-y-1.5">
            <Label>Reden <span className="text-destructive">*</span></Label>
            <Input
              value={reden}
              onChange={(e) => setReden(e.target.value)}
              placeholder="Bijv. spoedopdracht, deadline oplevering"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Urenplafond (optioneel)</Label>
            <Input
              type="number"
              min={0}
              step="0.5"
              value={urenPlafond}
              onChange={(e) => setUrenPlafond(e.target.value)}
              placeholder="Geen plafond"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button onClick={bewaar} disabled={openen.isPending}>
            {openen.isPending ? "Bezig…" : "Openzetten"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OverwerkslotKaart({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [openzettenOpen, setOpenzettenOpen] = useState(false);
  const [gekozenAanvraag, setGekozenAanvraag] = useState<OverwerkSlot | null>(null);

  const { data, isLoading } = useGetOverwerkslot(projectId);
  const sluiten = useSluitOverwerkslot();
  // Dezelfde serverbeslissing als de open/sluit-routes: hoofdbeheerder of een
  // actuele actieve functie Projectleider. Geen client-side titelheuristiek.
  const magBeheren = data?.mag_beheren === true;

  const ververs = () =>
    queryClient.invalidateQueries({ queryKey: getGetOverwerkslotQueryKey(projectId) });

  const openSlot = data?.open_slot ?? null;
  const aanvragen = (data?.sloten ?? []).filter((s) => s.status === "aangevraagd");

  async function sluitSlot() {
    try {
      await sluiten.mutateAsync({ id: projectId });
      toast({ title: "Overwerkslot gesloten" });
      ververs();
    } catch (err) {
      toast({ title: "Sluiten mislukt", description: foutTekst(err, "Probeer het opnieuw."), variant: "destructive" });
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" />
          Overwerkslot
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Laden…</p>
        ) : openSlot ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Unlock className="h-4 w-4 text-emerald-700" />
              <Badge variant="default" className="bg-emerald-600">Slot open</Badge>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div>
                <span className="text-muted-foreground">Geldig t/m: </span>
                <span className="font-medium">{formatDatum(openSlot.geldig_tot)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Verbruik: </span>
                <span className="font-medium">
                  {formatUren(openSlot.verbruikte_uren)}
                  {openSlot.uren_plafond != null ? ` / ${formatUren(openSlot.uren_plafond)}` : ""}
                </span>
              </div>
              {openSlot.reden && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Reden: </span>
                  <span className="font-medium">{openSlot.reden}</span>
                </div>
              )}
              <div className="col-span-2 text-xs text-muted-foreground">
                Geopend{openSlot.geopend_door_naam ? ` door ${openSlot.geopend_door_naam}` : ""}
                {openSlot.geopend_op ? ` op ${formatMoment(openSlot.geopend_op)}` : ""}
              </div>
            </div>
            {magBeheren && (
              <Button variant="outline" size="sm" onClick={sluitSlot} disabled={sluiten.isPending}>
                <Lock className="h-4 w-4 mr-1" />
                Slot sluiten
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-md border bg-muted/40 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Slot dicht</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Overwerk boven de weekgrens is niet mogelijk.
            </p>
            {magBeheren && (
              <Button size="sm" onClick={() => { setGekozenAanvraag(null); setOpenzettenOpen(true); }}>
                <Unlock className="h-4 w-4 mr-1" />
                Slot openzetten
              </Button>
            )}
          </div>
        )}

        {aanvragen.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <ShieldQuestion className="h-3.5 w-3.5" />
              Openstaande toestemmings-aanvragen
            </h4>
            {aanvragen.map((a) => (
              <div key={a.id} className="rounded-md border p-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="border-orange-500 text-orange-600">Aangevraagd</Badge>
                  <span className="text-xs text-muted-foreground">
                    {a.aangevraagd_op ? formatMoment(a.aangevraagd_op) : ""}
                  </span>
                </div>
                {a.motivatie_aanvraag && (
                  <p className="text-sm">{a.motivatie_aanvraag}</p>
                )}
                {magBeheren && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setGekozenAanvraag(a); setOpenzettenOpen(true); }}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Openzetten
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {magBeheren && (
        <OpenzettenDialog
          open={openzettenOpen}
          onClose={() => setOpenzettenOpen(false)}
          projectId={projectId}
          aanvraag={gekozenAanvraag}
          onKlaar={ververs}
        />
      )}
    </Card>
  );
}
