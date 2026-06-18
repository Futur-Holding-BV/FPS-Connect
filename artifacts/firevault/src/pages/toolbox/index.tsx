import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  useListToolboxBerichten,
  useCreateToolboxBericht,
  useUpdateToolboxBericht,
  useDeleteToolboxBericht,
  usePublicerenToolboxBericht,
  useGetToolboxBericht,
  useAiAnalyseToolboxBerichten,
  useArchiverenToolboxBericht,
  getListToolboxBerichtenQueryKey,
} from "@workspace/api-client-react";
import type { ToolboxBericht, ToolboxBerichtInput, ToolboxBerichtKoppeling } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import {
  MessageSquare, Plus, Send, Eye, Trash2, Users, CheckCircle, Clock,
  Sparkles, Archive, Link2, X, ExternalLink, Star, StarOff, Loader2,
} from "lucide-react";

const LEEG: ToolboxBerichtInput = { titel: "", inhoud: "", bijlagen: [], doelgroep: "iedereen", koppelingen: [] };

const CONNECT_PAGINAS: { label: string; href: string }[] = [
  { label: "Gebouwen", href: "/gebouwen" },
  { label: "Spots / Voorzieningen", href: "/voorzieningen" },
  { label: "Inspecties", href: "/inspecties" },
  { label: "Onderhoud", href: "/onderhoud" },
  { label: "Rapporten", href: "/rapporten" },
  { label: "Personeel", href: "/personeel" },
  { label: "Planning", href: "/planning" },
  { label: "Bibliotheek", href: "/bibliotheek" },
  { label: "Dossiers", href: "/dossiers" },
  { label: "Offertes", href: "/offertes" },
  { label: "Dashboard", href: "/dashboard" },
];

const STATUS_KLEUR: Record<string, string> = {
  gepubliceerd: "bg-emerald-100 text-emerald-800 border-emerald-200",
  concept: "bg-amber-100 text-amber-800 border-amber-200",
};

function BelangrijkBadge({ isBelangrijk }: { isBelangrijk: boolean | null | undefined }) {
  if (isBelangrijk === true) {
    return (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">
        <Star className="h-2.5 w-2.5 mr-1" />
        Belangrijk
      </Badge>
    );
  }
  if (isBelangrijk === false) {
    return (
      <Badge variant="outline" className="text-muted-foreground text-[10px]">
        <StarOff className="h-2.5 w-2.5 mr-1" />
        Niet-belangrijk
      </Badge>
    );
  }
  return null;
}

export default function ToolboxPagina() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { heeftNiveau } = useBevoegdheid();

  const kanSchrijven = heeftNiveau("toolbox", 3);
  const heeftHrmToegang = heeftNiveau("personeel", 1);

  const { data: actieveBerichten, isLoading: actievenLaden } = useListToolboxBerichten({ gearchiveerd: false });
  const { data: archiefBerichten, isLoading: archiefLaden } = useListToolboxBerichten({ gearchiveerd: true });

  const maakBericht = useCreateToolboxBericht();
  const updateBericht = useUpdateToolboxBericht();
  const verwijderBericht = useDeleteToolboxBericht();
  const publicerenMut = usePublicerenToolboxBericht();
  const aiAnaliseMut = useAiAnalyseToolboxBerichten();
  const archiverenMut = useArchiverenToolboxBericht();

  const [tab, setTab] = useState<"actief" | "archief">("actief");
  const [maakOpen, setMaakOpen] = useState(false);
  const [bewerkenId, setBewerkenId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [verwijderBevestigen, setVerwijderBevestigen] = useState<number | null>(null);
  const [formulier, setFormulier] = useState<ToolboxBerichtInput>(LEEG);
  const [bezig, setBezig] = useState(false);
  const [zoek, setZoek] = useState("");

  // Koppeling-editor state
  const [nieuwKoppelLabel, setNieuwKoppelLabel] = useState("");
  const [nieuwKoppelHref, setNieuwKoppelHref] = useState("");

  const { data: detail } = useGetToolboxBericht(detailId ?? 0);

  function invaliderenActief() {
    queryClient.invalidateQueries({ queryKey: getListToolboxBerichtenQueryKey({ gearchiveerd: false }) });
  }
  function invaliderenArchief() {
    queryClient.invalidateQueries({ queryKey: getListToolboxBerichtenQueryKey({ gearchiveerd: true }) });
  }
  function invaliderenAlles() { invaliderenActief(); invaliderenArchief(); }

  const gefilterdActief = (actieveBerichten ?? []).filter(
    (b) => !zoek || b.titel.toLowerCase().includes(zoek.toLowerCase()) || b.inhoud.toLowerCase().includes(zoek.toLowerCase())
  );
  // Sorteer actieve berichten: AI-belangrijk eerst
  const gesorteerdeActief = [...gefilterdActief].sort((a, b) => {
    if (a.is_belangrijk === b.is_belangrijk) return 0;
    if (a.is_belangrijk === true) return -1;
    if (b.is_belangrijk === true) return 1;
    return 0;
  });

  const archiefImportant = (archiefBerichten ?? []).filter((b) => b.is_belangrijk === true || b.is_belangrijk === null);
  const archiefBeperkt = (archiefBerichten ?? []).filter((b) => b.is_belangrijk === false);

  function openMaak() {
    setFormulier(LEEG);
    setBewerkenId(null);
    setNieuwKoppelLabel("");
    setNieuwKoppelHref("");
    setMaakOpen(true);
  }

  function openBewerken(b: ToolboxBericht) {
    setFormulier({
      titel: b.titel,
      inhoud: b.inhoud,
      bijlagen: b.bijlagen,
      doelgroep: b.doelgroep,
      koppelingen: (b.koppelingen ?? []) as ToolboxBerichtKoppeling[],
    });
    setBewerkenId(b.id);
    setNieuwKoppelLabel("");
    setNieuwKoppelHref("");
    setMaakOpen(true);
  }

  function voegKoppelingToe() {
    if (!nieuwKoppelLabel.trim() || !nieuwKoppelHref.trim()) return;
    setFormulier((f) => ({
      ...f,
      koppelingen: [...(f.koppelingen ?? []), { label: nieuwKoppelLabel.trim(), href: nieuwKoppelHref.trim() }],
    }));
    setNieuwKoppelLabel("");
    setNieuwKoppelHref("");
  }

  function verwijderKoppeling(idx: number) {
    setFormulier((f) => ({
      ...f,
      koppelingen: (f.koppelingen ?? []).filter((_, i) => i !== idx),
    }));
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
      invaliderenActief();
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
      invaliderenActief();
      toast({ title: "Bericht gepubliceerd" });
    } catch {
      toast({ title: "Fout bij publiceren", variant: "destructive" });
    }
  }

  async function archiveer(id: number) {
    try {
      await archiverenMut.mutateAsync({ id });
      invaliderenAlles();
      toast({ title: "Bericht gearchiveerd" });
    } catch {
      toast({ title: "Fout bij archiveren", variant: "destructive" });
    }
  }

  async function verwijder(id: number) {
    try {
      await verwijderBericht.mutateAsync({ id });
      invaliderenAlles();
      toast({ title: "Bericht verwijderd" });
      setVerwijderBevestigen(null);
    } catch {
      toast({ title: "Fout bij verwijderen", variant: "destructive" });
    }
  }

  async function handleAiAnalyse() {
    try {
      const res = await aiAnaliseMut.mutateAsync();
      invaliderenActief();
      toast({ title: `AI-analyse voltooid`, description: `${res.verwerkt} bericht${res.verwerkt !== 1 ? "en" : ""} geclassificeerd` });
    } catch {
      toast({ title: "AI-analyse mislukt", variant: "destructive" });
    }
  }

  function BerichtRegel({ b, toonArchiveerKnop = true }: { b: ToolboxBericht; toonArchiveerKnop?: boolean }) {
    return (
      <Card key={b.id} className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-semibold truncate">{b.titel}</span>
                <Badge
                  variant="outline"
                  className={b.gepubliceerd ? STATUS_KLEUR["gepubliceerd"] : STATUS_KLEUR["concept"]}
                >
                  {b.gepubliceerd
                    ? <><CheckCircle className="h-3 w-3 mr-1" />Gepubliceerd</>
                    : <><Clock className="h-3 w-3 mr-1" />Concept</>}
                </Badge>
                <BelangrijkBadge isBelangrijk={b.is_belangrijk} />
                {b.doelgroep === "iedereen" && (
                  <Badge variant="outline" className="text-[10px]">
                    <Users className="h-3 w-3 mr-1" />
                    Iedereen
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">{b.inhoud}</p>
              {b.koppelingen && b.koppelingen.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {(b.koppelingen as ToolboxBerichtKoppeling[]).map((k, i) => (
                    <Link key={i} href={k.href}>
                      <span className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer">
                        <Link2 className="h-3 w-3" />
                        {k.label}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                {b.aangemaakt_door_naam && <span>Door {b.aangemaakt_door_naam}</span>}
                {b.gepubliceerd_op && (
                  <span>Gepubliceerd {new Date(b.gepubliceerd_op).toLocaleDateString("nl-NL")}</span>
                )}
                {b.ai_verwerkt_op && (
                  <span className="flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    AI {new Date(b.ai_verwerkt_op).toLocaleDateString("nl-NL")}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button size="sm" variant="ghost" onClick={() => setDetailId(b.id)} title="Detail / leesbevestigingen">
                <Eye className="h-4 w-4" />
              </Button>
              {kanSchrijven && !b.gepubliceerd && (
                <Button size="sm" variant="ghost" onClick={() => openBewerken(b)}>
                  Bewerken
                </Button>
              )}
              {kanSchrijven && !b.gepubliceerd && (
                <Button size="sm" onClick={() => publiceer(b.id)} disabled={publicerenMut.isPending}>
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  Publiceer
                </Button>
              )}
              {kanSchrijven && toonArchiveerKnop && !b.gearchiveerd && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => archiveer(b.id)}
                  title="Archiveren"
                >
                  <Archive className="h-4 w-4" />
                </Button>
              )}
              {kanSchrijven && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setVerwijderBevestigen(b.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Koptekst */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Toolbox &amp; berichten</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Toolbox-onderwerpen en mededelingen. AI classificeert berichten automatisch elke 4 uur.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {kanSchrijven && (
            <Button
              variant="outline"
              onClick={handleAiAnalyse}
              disabled={aiAnaliseMut.isPending}
              title="AI nu laten analyseren"
            >
              {aiAnaliseMut.isPending
                ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                : <Sparkles className="h-4 w-4 mr-2" />}
              AI analyseren
            </Button>
          )}
          {kanSchrijven && (
            <Button onClick={openMaak} className="shrink-0">
              <Plus className="h-4 w-4 mr-2" />
              Nieuw bericht
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as "actief" | "archief")}>
        <TabsList>
          <TabsTrigger value="actief" className="gap-1.5">
            <MessageSquare className="h-4 w-4" />
            Actief
            {(actieveBerichten ?? []).length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px]">
                {(actieveBerichten ?? []).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="archief" className="gap-1.5">
            <Archive className="h-4 w-4" />
            Archief
            {(archiefBerichten ?? []).length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px]">
                {(archiefBerichten ?? []).length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Actieve berichten ── */}
        <TabsContent value="actief" className="space-y-4 mt-4">
          <div className="relative">
            <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Zoek op titel of inhoud..."
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
            />
          </div>

          {actievenLaden ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
            </div>
          ) : gesorteerdeActief.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Geen actieve berichten</p>
                {kanSchrijven && (
                  <p className="text-sm mt-1">Maak een nieuw bericht aan via de knop rechtsboven.</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {gesorteerdeActief.map((b) => <BerichtRegel key={b.id} b={b} />)}
            </div>
          )}
        </TabsContent>

        {/* ── Archief ── */}
        <TabsContent value="archief" className="space-y-6 mt-4">
          {archiefLaden ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
            </div>
          ) : (
            <>
              {/* Belangrijke berichten — zichtbaar voor iedereen */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-blue-600" />
                  <h3 className="text-sm font-semibold">Belangrijke mededelingen</h3>
                  <span className="text-xs text-muted-foreground">(zichtbaar voor alle medewerkers)</span>
                </div>
                {archiefImportant.length === 0 ? (
                  <p className="text-sm text-muted-foreground pl-6">Geen belangrijke gearchiveerde berichten.</p>
                ) : (
                  <div className="space-y-3">
                    {archiefImportant.map((b) => <BerichtRegel key={b.id} b={b} toonArchiveerKnop={false} />)}
                  </div>
                )}
              </div>

              {/* Niet-belangrijke berichten — alleen voor HRM/hoofdbeheerder */}
              {heeftHrmToegang && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <StarOff className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Overige berichten</h3>
                    <span className="text-xs text-muted-foreground">(alleen zichtbaar voor HRM en hoofdbeheerder)</span>
                  </div>
                  {archiefBeperkt.length === 0 ? (
                    <p className="text-sm text-muted-foreground pl-6">Geen overige gearchiveerde berichten.</p>
                  ) : (
                    <div className="space-y-3">
                      {archiefBeperkt.map((b) => <BerichtRegel key={b.id} b={b} toonArchiveerKnop={false} />)}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Aanmaken / Bewerken dialog ── */}
      <Dialog open={maakOpen} onOpenChange={(open) => { if (!bezig) setMaakOpen(open); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
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
                rows={6}
                value={formulier.inhoud}
                onChange={(e) => setFormulier((f) => ({ ...f, inhoud: e.target.value }))}
                placeholder="Beschrijf het toolbox-onderwerp, de werkinstructie of het bericht..."
              />
            </div>

            {/* Koppelingen */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5" />
                Koppelingen naar Connect
              </Label>
              {(formulier.koppelingen ?? []).length > 0 && (
                <div className="space-y-1.5">
                  {(formulier.koppelingen as ToolboxBerichtKoppeling[]).map((k, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-sm">
                      <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium">{k.label}</span>
                      <span className="text-muted-foreground text-xs truncate flex-1">{k.href}</span>
                      <button onClick={() => verwijderKoppeling(i)} className="ml-auto text-muted-foreground hover:text-destructive">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="Label (bijv. Gebouwen)"
                  value={nieuwKoppelLabel}
                  onChange={(e) => setNieuwKoppelLabel(e.target.value)}
                  className="flex-1"
                />
                <Select
                  value={nieuwKoppelHref}
                  onValueChange={(v) => {
                    setNieuwKoppelHref(v);
                    if (!nieuwKoppelLabel) {
                      const p = CONNECT_PAGINAS.find((p) => p.href === v);
                      if (p) setNieuwKoppelLabel(p.label);
                    }
                  }}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Pagina kiezen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CONNECT_PAGINAS.map((p) => (
                      <SelectItem key={p.href} value={p.href}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={voegKoppelingToe}
                  disabled={!nieuwKoppelLabel.trim() || !nieuwKoppelHref.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Koppel dit bericht aan relevante onderdelen in FPS Connect.
              </p>
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

      {/* ── Detail / leesbevestigingen dialog ── */}
      <Dialog open={detailId !== null} onOpenChange={(open) => { if (!open) setDetailId(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{detail?.titel ?? "Bericht"}</DialogTitle>
          </DialogHeader>
          {detail ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <BelangrijkBadge isBelangrijk={detail.is_belangrijk} />
                {detail.gearchiveerd && (
                  <Badge variant="outline" className="text-muted-foreground text-[10px]">
                    <Archive className="h-3 w-3 mr-1" />
                    Gearchiveerd
                  </Badge>
                )}
              </div>
              <p className="text-sm whitespace-pre-wrap">{detail.inhoud}</p>

              {/* Koppelingen */}
              {detail.koppelingen && (detail.koppelingen as ToolboxBerichtKoppeling[]).length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">Koppelingen</p>
                  {(detail.koppelingen as ToolboxBerichtKoppeling[]).map((k, i) => (
                    <Link key={i} href={k.href} onClick={() => setDetailId(null)}>
                      <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm hover:bg-muted cursor-pointer transition-colors">
                        <ExternalLink className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="font-medium text-primary">{k.label}</span>
                        <span className="text-muted-foreground text-xs ml-auto">{k.href}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* Leesbevestigingen */}
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
                  <p className="text-sm text-muted-foreground">Nog geen bevestigingen ontvangen.</p>
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

      {/* ── Verwijder bevestiging ── */}
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
