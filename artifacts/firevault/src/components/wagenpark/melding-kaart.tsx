// Herbruikbare kaart voor één voertuigmelding — gebruikt in zowel het per-voertuig
// tabblad (detail.tsx) als het centrale meldingenoverzicht (meldingen.tsx).

import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Car, Sparkles, AlertTriangle, Gauge, Copy, Wrench, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { ToewijsbareGebruiker, WagenparkOnderhoud } from "@workspace/api-client-react";
import {
  type VoertuigMelding,
  MELDING_TYPE_LABELS,
  MELDING_STATUS_LABELS,
  MELDING_STATUS_KLEUR,
  MELDING_ERNST_LABELS,
  MELDING_ERNST_KLEUR,
} from "@/lib/wagenpark-melding-types";

interface Props {
  melding: VoertuigMelding;
  toewijsbareGebruikers: ToewijsbareGebruiker[];
  onderhoudOpties?: WagenparkOnderhoud[];
  toonVoertuigLink?: boolean;
  onPatch: (waarden: {
    status?: string;
    toegewezen_beheerder_id?: number | null;
    onderhoud_id?: number | null;
    opvolg_notitie?: string;
    admin_notitie?: string;
  }) => void;
}

function formatDatumTijd(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function MeldingKaart({ melding: m, toewijsbareGebruikers, onderhoudOpties = [], toonVoertuigLink, onPatch }: Props) {
  const voertuigLabel = [m.voertuig_merk, m.voertuig_type_naam, m.voertuig_kenteken ? `(${m.voertuig_kenteken})` : null]
    .filter(Boolean).join(" ");

  const [garageDialogOpen, setGarageDialogOpen] = useState(false);
  const [garageEmail, setGarageEmail] = useState("");
  const [garageNaam, setGarageNaam] = useState("");
  const [garageNotitie, setGarageNotitie] = useState("");
  const [doorzetBezig, setDoorzetBezig] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  async function doorzettenNaarGarage() {
    if (!garageEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(garageEmail.trim())) {
      toast({ title: "Ongeldig e-mailadres", description: "Voer een geldig e-mailadres in.", variant: "destructive" });
      return;
    }
    setDoorzetBezig(true);
    try {
      const resp = await fetch(`/api/wagenpark/meldingen/${m.id}/doorzetten-garage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          garage_email: garageEmail.trim(),
          garage_naam: garageNaam.trim() || undefined,
          notitie: garageNotitie.trim() || undefined,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Doorzetten mislukt");
      }
      toast({ title: "Doorgezet naar garage", description: `E-mail verstuurd naar ${garageEmail.trim()}.` });
      setGarageDialogOpen(false);
      setGarageEmail("");
      setGarageNaam("");
      setGarageNotitie("");
      await qc.invalidateQueries({ queryKey: ["wagenpark-meldingen-overzicht"] });
      await qc.invalidateQueries({ queryKey: ["wagenpark-meldingen-voertuig"] });
    } catch (err) {
      toast({ title: "Fout", description: err instanceof Error ? err.message : "Doorzetten mislukt.", variant: "destructive" });
    } finally {
      setDoorzetBezig(false);
    }
  }

  const magDoorzetten = m.status !== "doorgezet_garage" && m.status !== "opgelost" && m.status !== "afgewezen_duplicaat";

  return (
    <>
      <Card className={m.status === "nieuw" ? "border-red-200" : m.status === "actie_nodig" ? "border-orange-200" : ""}>
        <CardContent className="p-4 space-y-3">
          {/* Kop */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2">
              <Car className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{MELDING_TYPE_LABELS[m.type]}</span>
                  <Badge className={`text-xs px-1.5 py-0 border-0 ${MELDING_STATUS_KLEUR[m.status]}`}>
                    {MELDING_STATUS_LABELS[m.status]}
                  </Badge>
                  {m.ai_ernst_indicatie && (
                    <Badge className={`text-xs px-1.5 py-0 border-0 ${MELDING_ERNST_KLEUR[m.ai_ernst_indicatie]}`}>
                      {MELDING_ERNST_LABELS[m.ai_ernst_indicatie]}
                    </Badge>
                  )}
                  {m.ai_kosten_indicatie && (
                    <Badge className="text-xs px-1.5 py-0 bg-amber-100 text-amber-800 border-0">
                      Kosten verwacht
                    </Badge>
                  )}
                  {m.ai_mogelijk_duplicaat_van_id && (
                    <Badge className="text-xs px-1.5 py-0 bg-purple-100 text-purple-800 border-0 gap-1">
                      <Copy className="h-3 w-3" />
                      Mogelijk duplicaat van #{m.ai_mogelijk_duplicaat_van_id}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {m.monteur_naam ?? "Onbekend"} · {formatDatumTijd(m.aangemaakt_op)}
                  {toonVoertuigLink && voertuigLabel && (
                    <>
                      {" · "}
                      <Link href={`/wagenpark/${m.voertuig_id}`} className="underline hover:text-foreground">
                        {voertuigLabel}
                      </Link>
                    </>
                  )}
                  {m.schade_locatie && <> · locatie: {m.schade_locatie}</>}
                  {m.storing_type && <> · type: {m.storing_type}</>}
                </div>
              </div>
            </div>
            <Select value={m.status} onValueChange={(status) => onPatch({ status })}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(MELDING_STATUS_LABELS).map(([waarde, label]) => (
                  <SelectItem key={waarde} value={waarde}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Omschrijving */}
          <p className="text-sm">{m.omschrijving}</p>

          {/* AI diagnose (storing/schade) */}
          {(m.ai_diagnose || m.ai_oplossing) && (
            <div className="rounded-md bg-muted/50 border px-3 py-2.5 space-y-1.5 text-sm">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-1">
                <Sparkles className="h-3 w-3" />
                AI analyse
              </div>
              {m.ai_diagnose && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Diagnose: </span>
                  {m.ai_diagnose}
                </div>
              )}
              {m.ai_oplossing && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Aanpak: </span>
                  {m.ai_oplossing}
                </div>
              )}
              {m.ai_kosten_indicatie && m.ai_kosten_tekst && (
                <div className="mt-1 text-xs text-amber-700 font-medium">{m.ai_kosten_tekst}</div>
              )}
            </div>
          )}

          {/* AI kwartaalcontrole-uitlezing */}
          {m.type === "kwartaalcontrole" && (m.ai_gelezen_km_stand || (m.ai_gelezen_waarschuwingen && m.ai_gelezen_waarschuwingen.length > 0)) && (
            <div className="rounded-md bg-muted/50 border px-3 py-2.5 space-y-1.5 text-sm">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-1">
                <Gauge className="h-3 w-3" />
                AI uitlezing dashboard
              </div>
              {m.ai_gelezen_km_stand != null && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Kilometerstand: </span>
                  {m.ai_gelezen_km_stand.toLocaleString("nl-NL")} km
                </div>
              )}
              {m.ai_gelezen_waarschuwingen && m.ai_gelezen_waarschuwingen.length > 0 && (
                <div className="flex items-start gap-1.5 text-orange-700">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{m.ai_gelezen_waarschuwingen.join(", ")}</span>
                </div>
              )}
            </div>
          )}

          {/* Kantoorafhandeling */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t pt-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Toegewezen aan</label>
              <Select
                value={m.toegewezen_beheerder_id ? String(m.toegewezen_beheerder_id) : "geen"}
                onValueChange={(waarde) => onPatch({ toegewezen_beheerder_id: waarde === "geen" ? null : Number(waarde) })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="geen">Niet toegewezen</SelectItem>
                  {toewijsbareGebruikers.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>{g.naam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {onderhoudOpties.length > 0 && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Koppelen aan onderhoud</label>
                <Select
                  value={m.onderhoud_id ? String(m.onderhoud_id) : "geen"}
                  onValueChange={(waarde) => onPatch({ onderhoud_id: waarde === "geen" ? null : Number(waarde) })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="geen">Geen koppeling</SelectItem>
                    {onderhoudOpties.map((o) => (
                      <SelectItem key={o.id} value={String(o.id)}>{o.omschrijving}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Opvolgnotitie (schadeherstel / verzekering / lease)
            </label>
            <Textarea
              defaultValue={m.opvolg_notitie ?? ""}
              placeholder="Bijv. schade gemeld bij verzekeraar, dossiernummer..."
              className="text-sm min-h-[60px]"
              onBlur={(e) => {
                if (e.target.value !== (m.opvolg_notitie ?? "")) {
                  onPatch({ opvolg_notitie: e.target.value });
                }
              }}
            />
          </div>

          {/* Admin notitie (legacy vrij veld) */}
          {m.admin_notitie && (
            <div className="text-xs text-muted-foreground italic border-t pt-2">
              Notitie: {m.admin_notitie}
            </div>
          )}

          {/* Doorzetten naar garage */}
          {magDoorzetten && (
            <div className="border-t pt-3">
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5"
                onClick={() => setGarageDialogOpen(true)}
              >
                <Wrench className="h-3.5 w-3.5" />
                Doorzetten naar garage
              </Button>
            </div>
          )}
          {m.status === "doorgezet_garage" && (
            <div className="border-t pt-3">
              <p className="text-xs text-teal-700 font-medium flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5" />
                Doorgezet naar garage — zie opvolgnotitie voor details
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Doorzetten naar garage dialog */}
      <Dialog open={garageDialogOpen} onOpenChange={setGarageDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" />
              Doorzetten naar garage
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">
              De garage ontvangt een e-mail met de meldingsdetails, AI-diagnose en een samenvatting van het voertuig.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">E-mailadres garage <span className="text-destructive">*</span></label>
              <Input
                type="email"
                placeholder="info@garage.nl"
                value={garageEmail}
                onChange={(e) => setGarageEmail(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Naam garage <span className="text-muted-foreground">(optioneel)</span></label>
              <Input
                placeholder="Bijv. Garage Van der Berg"
                value={garageNaam}
                onChange={(e) => setGarageNaam(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Extra notitie <span className="text-muted-foreground">(optioneel)</span></label>
              <Textarea
                placeholder="Bijv. afspraak gepland voor vrijdag, vraag naar spoedbehandeling..."
                value={garageNotitie}
                onChange={(e) => setGarageNotitie(e.target.value)}
                className="min-h-[70px] text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGarageDialogOpen(false)} disabled={doorzetBezig}>
              Annuleren
            </Button>
            <Button onClick={doorzettenNaarGarage} disabled={doorzetBezig || !garageEmail.trim()}>
              {doorzetBezig ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Versturen...
                </>
              ) : (
                "Doorzetten & e-mail versturen"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
