import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListToolboxBerichten,
  useCreateToolboxBericht,
  useUpdateToolboxBericht,
  useDeleteToolboxBericht,
  usePublicerenToolboxBericht,
  useGetToolboxBericht,
  getListToolboxBerichtenQueryKey,
} from "@workspace/api-client-react";
import type { ToolboxBericht, ToolboxBerichtInput } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  MessageSquare, Plus, Send, Eye, Trash2, Users, CheckCircle, Clock,
} from "lucide-react";

const LEEG: ToolboxBerichtInput = { titel: "", inhoud: "", bijlagen: [], doelgroep: "iedereen" };

const STATUS_KLEUR: Record<string, string> = {
  gepubliceerd: "bg-emerald-100 text-emerald-800 border-emerald-200",
  concept: "bg-amber-100 text-amber-800 border-amber-200",
};

export default function ToolboxPagina() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: berichten, isLoading } = useListToolboxBerichten();
  const maakBericht = useCreateToolboxBericht();
  const updateBericht = useUpdateToolboxBericht();
  const verwijderBericht = useDeleteToolboxBericht();
  const publicerenMut = usePublicerenToolboxBericht();

  const [maakOpen, setMaakOpen] = useState(false);
  const [bewerkenId, setBewerkenId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [verwijderBevestigen, setVerwijderBevestigen] = useState<number | null>(null);
  const [formulier, setFormulier] = useState<ToolboxBerichtInput>(LEEG);
  const [bezig, setBezig] = useState(false);
  const [zoek, setZoek] = useState("");

  const { data: detail } = useGetToolboxBericht(detailId ?? 0);

  const gefilterd = (berichten ?? []).filter(
    (b) =>
      !zoek ||
      b.titel.toLowerCase().includes(zoek.toLowerCase()) ||
      b.inhoud.toLowerCase().includes(zoek.toLowerCase())
  );

  function openMaak() {
    setFormulier(LEEG);
    setBewerkenId(null);
    setMaakOpen(true);
  }

  function openBewerken(b: ToolboxBericht) {
    setFormulier({ titel: b.titel, inhoud: b.inhoud, bijlagen: b.bijlagen, doelgroep: b.doelgroep });
    setBewerkenId(b.id);
    setMaakOpen(true);
  }

  async function slaOp() {
    if (!formulier.titel.trim() || !formulier.inhoud.trim()) return;
    setBezig(true);
    try {
      if (bewerkenId !== null) {
        await updateBericht.mutateAsync({ id: bewerkenId, data: formulier });
        toast({ title: "Bericht bijgewerkt" });
      } else {
        await maakBericht.mutateAsync({ data: formulier });
        toast({ title: "Bericht opgeslagen als concept" });
      }
      await queryClient.invalidateQueries({ queryKey: getListToolboxBerichtenQueryKey() });
      setMaakOpen(false);
    } catch {
      toast({ title: "Fout bij opslaan", variant: "destructive" });
    } finally {
      setBezig(false);
    }
  }

  async function publiceer(id: number) {
    try {
      await publicerenMut.mutateAsync({ id });
      await queryClient.invalidateQueries({ queryKey: getListToolboxBerichtenQueryKey() });
      toast({ title: "Bericht gepubliceerd en zichtbaar voor monteurs" });
    } catch {
      toast({ title: "Fout bij publiceren", variant: "destructive" });
    }
  }

  async function verwijder(id: number) {
    try {
      await verwijderBericht.mutateAsync({ id });
      await queryClient.invalidateQueries({ queryKey: getListToolboxBerichtenQueryKey() });
      toast({ title: "Bericht verwijderd" });
      setVerwijderBevestigen(null);
    } catch {
      toast({ title: "Fout bij verwijderen", variant: "destructive" });
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Koptekst */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Toolbox &amp; berichten</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Maak toolbox-onderwerpen en berichten aan voor monteurs. Gepubliceerde berichten zijn
            zichtbaar in de FPS Monteur-app totdat de monteur ze bevestigt.
          </p>
        </div>
        <Button onClick={openMaak} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          Nieuw bericht
        </Button>
      </div>

      {/* Zoekbalk */}
      <div className="relative">
        <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Zoek op titel of inhoud..."
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
        />
      </div>

      {/* Lijst */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : gefilterd.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Geen berichten gevonden</p>
            <p className="text-sm mt-1">Maak een nieuw toolbox-bericht aan met de knop rechtsboven.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {gefilterd.map((b) => (
            <Card key={b.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold truncate">{b.titel}</span>
                      <Badge
                        variant="outline"
                        className={
                          b.gepubliceerd
                            ? STATUS_KLEUR["gepubliceerd"]
                            : STATUS_KLEUR["concept"]
                        }
                      >
                        {b.gepubliceerd ? (
                          <><CheckCircle className="h-3 w-3 mr-1" />Gepubliceerd</>
                        ) : (
                          <><Clock className="h-3 w-3 mr-1" />Concept</>
                        )}
                      </Badge>
                      {b.doelgroep === "iedereen" ? (
                        <Badge variant="outline" className="text-[10px]">
                          <Users className="h-3 w-3 mr-1" />
                          Iedereen
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{b.inhoud}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      {b.aangemaakt_door_naam ? (
                        <span>Aangemaakt door {b.aangemaakt_door_naam}</span>
                      ) : null}
                      {b.gepubliceerd_op ? (
                        <span>
                          Gepubliceerd op{" "}
                          {new Date(b.gepubliceerd_op).toLocaleDateString("nl-NL")}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDetailId(b.id)}
                      title="Leesbevestigingen bekijken"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {!b.gepubliceerd && (
                      <Button size="sm" variant="ghost" onClick={() => openBewerken(b)}>
                        Bewerken
                      </Button>
                    )}
                    {!b.gepubliceerd && (
                      <Button
                        size="sm"
                        onClick={() => publiceer(b.id)}
                        disabled={publicerenMut.isPending}
                      >
                        <Send className="h-3.5 w-3.5 mr-1.5" />
                        Publiceer
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setVerwijderBevestigen(b.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Aanmaken / Bewerken dialog */}
      <Dialog open={maakOpen} onOpenChange={(open) => { if (!bezig) setMaakOpen(open); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {bewerkenId !== null ? "Bericht bewerken" : "Nieuw toolbox-bericht"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Titel</Label>
              <Input
                value={formulier.titel}
                onChange={(e) => setFormulier((f) => ({ ...f, titel: e.target.value }))}
                placeholder="Bijv. Werkplekinstructie brandwerende doorvoering"
              />
            </div>
            <div>
              <Label>Inhoud</Label>
              <Textarea
                rows={8}
                value={formulier.inhoud}
                onChange={(e) => setFormulier((f) => ({ ...f, inhoud: e.target.value }))}
                placeholder="Beschrijf het toolbox-onderwerp, de werkinstructie of het bericht..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMaakOpen(false)} disabled={bezig}>
              Annuleren
            </Button>
            <Button
              onClick={slaOp}
              disabled={bezig || !formulier.titel.trim() || !formulier.inhoud.trim()}
            >
              {bezig ? "Opslaan..." : "Opslaan als concept"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail / leesbevestigingen dialog */}
      <Dialog open={detailId !== null} onOpenChange={(open) => { if (!open) setDetailId(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{detail?.titel ?? "Bericht"}</DialogTitle>
          </DialogHeader>
          {detail ? (
            <div className="space-y-4">
              <p className="text-sm whitespace-pre-wrap">{detail.inhoud}</p>
              <div>
                <p className="text-sm font-semibold mb-2">
                  Leesbevestigingen ({detail.aantal_bevestigd ?? 0})
                </p>
                {detail.bevestigingen && detail.bevestigingen.length > 0 ? (
                  <div className="space-y-1.5">
                    {detail.bevestigingen.map((bev) => (
                      <div
                        key={bev.id}
                        className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-1.5"
                      >
                        <span className="font-medium">{bev.naam}</span>
                        <span className="text-muted-foreground text-xs">
                          {new Date(bev.bevestigd_op).toLocaleDateString("nl-NL", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nog geen bevestigingen ontvangen.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailId(null)}>Sluiten</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verwijder bevestiging */}
      <Dialog
        open={verwijderBevestigen !== null}
        onOpenChange={(open) => { if (!open) setVerwijderBevestigen(null); }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Bericht verwijderen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Weet je zeker dat je dit bericht wilt verwijderen? Dit kan niet ongedaan worden
            gemaakt. Alle leesbevestigingen worden ook verwijderd.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerwijderBevestigen(null)}>
              Annuleren
            </Button>
            <Button
              variant="destructive"
              onClick={() => verwijderBevestigen !== null && verwijder(verwijderBevestigen)}
            >
              Verwijderen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
