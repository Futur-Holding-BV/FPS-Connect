import { useEffect, useRef, useState } from "react";
import {
  useListProfielen,
  useCreateProfiel,
  useUpdateProfiel,
  useDeleteProfiel,
  useProfielToepassen,
  useProfielenAanvullen,
  getListProfielenQueryKey,
  getListGebruikersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ShieldCheck, Plus, Pencil, Trash2, Lock, Loader2, Users, RefreshCw, AlertTriangle, ListChecks, Sparkles } from "lucide-react";
import { MODULES, NIVEAUS, GROEP_OPTIES } from "@workspace/permissies";
import { AiVoorstelDialog } from "@/components/ai-rollen-voorstel-dialog";

const NIVEAU_LABEL: Record<number, string> = Object.fromEntries(
  NIVEAUS.map((n) => [n.waarde, n.kort]),
);

// Niveau waarop ontbrekende modules worden gezet bij "in één klik aanvullen".
// Bewust "Geen toegang" (0): de sleutel wordt expliciet vastgelegd zodat de
// module niet meer stil ontbreekt, zonder automatisch rechten te verlenen.
const AANVUL_NIVEAU = 0;

type ProfielForm = {
  id: number | null;
  naam: string;
  groep: string | null;
  bevoegdheden: Record<string, number>;
};

const LEEG_FORM: ProfielForm = { id: null, naam: "", groep: null, bevoegdheden: {} };

// Sentinel voor "geen categorie": Radix Select accepteert geen lege string als
// item-waarde (runtime-error bij renderen van de dialoog).
const GEEN_GROEP = "__geen__";

export default function ProfielenBeheer() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useListProfielen();
  const profielen = data ?? [];

  const maakProfiel = useCreateProfiel();
  const werkBijProfiel = useUpdateProfiel();
  const verwijderProfiel = useDeleteProfiel();
  const pasProfielToe = useProfielToepassen();
  const vulAllesAan = useProfielenAanvullen();

  const [dialoogOpen, setDialoogOpen] = useState(false);
  const [form, setForm] = useState<ProfielForm>(LEEG_FORM);
  const [fout, setFout] = useState<string | null>(null);
  const [verwijderTarget, setVerwijderTarget] =
    useState<{ id: number; naam: string } | null>(null);
  const [toepassenTarget, setToepassenTarget] =
    useState<{ id: number; naam: string; aantal: number } | null>(null);
  const [toepassenBezigId, setToepassenBezigId] = useState<number | null>(null);
  const [aanvullenBezigId, setAanvullenBezigId] = useState<number | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  const invalideer = () =>
    queryClient.invalidateQueries({ queryKey: getListProfielenQueryKey() });

  function openNieuw() {
    setForm(LEEG_FORM);
    setFout(null);
    setDialoogOpen(true);
  }

  function openBewerk(p: { id: number; naam: string; groep?: string | null; bevoegdheden: Record<string, number> }) {
    setForm({ id: p.id, naam: p.naam, groep: p.groep ?? null, bevoegdheden: { ...p.bevoegdheden } });
    setFout(null);
    setDialoogOpen(true);
  }

  // Deep-link vanuit de rollenmatrix: /beheer/profielen?profiel=<id> opent
  // direct de bewerkdialoog van dat profiel (eenmalig, na laden van de lijst).
  const deepLinkVerwerkt = useRef(false);
  useEffect(() => {
    if (deepLinkVerwerkt.current || profielen.length === 0) return;
    const idTekst = new URLSearchParams(window.location.search).get("profiel");
    if (!idTekst) { deepLinkVerwerkt.current = true; return; }
    deepLinkVerwerkt.current = true;
    const p = profielen.find((x) => x.id === Number(idTekst));
    if (p) openBewerk(p as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profielen]);

  async function bewaar() {
    const naam = form.naam.trim();
    if (!naam) {
      setFout("Geef het profiel een naam.");
      return;
    }
    setFout(null);
    try {
      if (form.id === null) {
        await maakProfiel.mutateAsync({
          data: { naam, groep: form.groep, bevoegdheden: form.bevoegdheden },
        });
      } else {
        await werkBijProfiel.mutateAsync({
          id: form.id,
          data: { naam, groep: form.groep, bevoegdheden: form.bevoegdheden },
        });
      }
      await invalideer();
      setDialoogOpen(false);
    } catch {
      setFout("Opslaan mislukt. Mogelijk bestaat er al een profiel met deze naam.");
    }
  }

  async function bevestigVerwijder() {
    if (!verwijderTarget) return;
    try {
      await verwijderProfiel.mutateAsync({ id: verwijderTarget.id });
      await invalideer();
    } finally {
      setVerwijderTarget(null);
    }
  }

  async function bevestigToepassen() {
    if (!toepassenTarget) return;
    setToepassenBezigId(toepassenTarget.id);
    try {
      const result = await pasProfielToe.mutateAsync({ id: toepassenTarget.id });
      await invalideer();
      await queryClient.invalidateQueries({ queryKey: getListGebruikersQueryKey() });
      toast({
        title: "Profiel toegepast",
        description: `Bevoegdheden bijgewerkt voor ${result.bijgewerkt} ${result.bijgewerkt === 1 ? "gebruiker" : "gebruikers"}.`,
      });
    } catch (err: any) {
      toast({
        title: "Toepassen mislukt",
        description: err?.response?.data?.error || "Er is een fout opgetreden bij het toepassen van het profiel.",
        variant: "destructive",
      });
    } finally {
      setToepassenBezigId(null);
      setToepassenTarget(null);
    }
  }

  async function vulOntbrekendeAan(p: {
    id: number;
    naam: string;
    bevoegdheden: Record<string, number>;
  }) {
    setAanvullenBezigId(p.id);
    try {
      const aangevuld: Record<string, number> = { ...p.bevoegdheden };
      for (const m of MODULES) {
        if (!(m.id in aangevuld)) aangevuld[m.id] = AANVUL_NIVEAU;
      }
      await werkBijProfiel.mutateAsync({
        id: p.id,
        data: { naam: p.naam, bevoegdheden: aangevuld },
      });
      await invalideer();
    } finally {
      setAanvullenBezigId(null);
    }
  }

  async function vulAlleOntbrekendeAan() {
    try {
      await vulAllesAan.mutateAsync();
      await invalideer();
    } catch {
      // fout wordt via de mutatie-status getoond
    }
  }

  const bezig = maakProfiel.isPending || werkBijProfiel.isPending;
  const profielenMetOntbrekend = profielen.filter((p) =>
    MODULES.some((m) => !(m.id in p.bevoegdheden)),
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 text-primary p-2 rounded-lg">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 data-paginatitel className="text-2xl font-bold tracking-tight">Bevoegdheidsprofielen</h1>
            <p className="text-sm text-muted-foreground">
              Presets met vaste bevoegdheden per module, toepasbaar bij het bewerken van gebruikers
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {profielenMetOntbrekend > 0 && (
            <Button
              variant="outline"
              onClick={vulAlleOntbrekendeAan}
              disabled={vulAllesAan.isPending}
              title="Vul ontbrekende modules in alle profielen aan op Geen toegang"
            >
              {vulAllesAan.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ListChecks className="h-4 w-4" />
              )}
              Alle profielen aanvullen
            </Button>
          )}
          <Button variant="outline" onClick={() => setAiOpen(true)}>
            <Sparkles className="h-4 w-4 text-amber-500" /> Laat AI profielen voorstellen
          </Button>
          <Button onClick={openNieuw}>
            <Plus className="h-4 w-4" /> Nieuw profiel
          </Button>
        </div>
      </div>

      {vulAllesAan.isError && (
        <p className="text-sm text-destructive">
          Aanvullen mislukt. Probeer het opnieuw.
        </p>
      )}
      {vulAllesAan.isSuccess && profielenMetOntbrekend === 0 && (
        <p className="text-sm text-muted-foreground">
          Alle profielen bevatten nu alle modules.
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : profielen.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nog geen profielen. Maak een eerste preset aan.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {profielen.map((p) => {
            const ontbrekend = MODULES.filter((m) => !(m.id in p.bevoegdheden));
            return (
            <Card key={p.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold truncate">{p.naam}</span>
                    {p.systeem && (
                      <Badge variant="secondary" className="text-muted-foreground gap-1 shrink-0">
                        <Lock className="h-3 w-3" /> Systeem
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openBewerk(p)}
                      title="Bewerken"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {!p.systeem && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setVerwijderTarget({ id: p.id, naam: p.naam })}
                        title="Verwijderen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  {MODULES.filter((m) => (p.bevoegdheden[m.id] ?? 0) > 0).length === 0 ? (
                    <p className="text-xs text-muted-foreground">Geen moduletoegang</p>
                  ) : (
                    MODULES.filter((m) => (p.bevoegdheden[m.id] ?? 0) > 0).map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{m.label}</span>
                        <span className="font-medium">
                          {NIVEAU_LABEL[p.bevoegdheden[m.id] ?? 0]}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {ontbrekend.length > 0 && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 space-y-2">
                    <div className="flex items-start gap-1.5 text-xs text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
                      <span>
                        {ontbrekend.length === 1
                          ? "1 module ontbreekt in dit profiel"
                          : `${ontbrekend.length} modules ontbreken in dit profiel`}{" "}
                        en valt stil terug op "Geen toegang":{" "}
                        <span className="font-medium">
                          {ontbrekend.map((m) => m.label).join(", ")}
                        </span>
                        .
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-full text-xs gap-1.5"
                      onClick={() =>
                        vulOntbrekendeAan({
                          id: p.id,
                          naam: p.naam,
                          bevoegdheden: p.bevoegdheden,
                        })
                      }
                      disabled={aanvullenBezigId === p.id}
                    >
                      {aanvullenBezigId === p.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      Ontbrekende modules vastleggen op "Geen toegang"
                    </Button>
                  </div>
                )}

                <GekoppeldeGebruikers
                  gebruikers={p.gebruikers ?? []}
                  aantal={p.gebruiker_aantal ?? 0}
                  onToepassen={() =>
                    setToepassenTarget({
                      id: p.id,
                      naam: p.naam,
                      aantal: p.gebruiker_aantal ?? 0,
                    })
                  }
                  bezig={toepassenBezigId === p.id}
                />
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialoogOpen} onOpenChange={setDialoogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {form.id === null ? "Nieuw profiel" : "Profiel bewerken"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Naam</Label>
              <Input
                value={form.naam}
                onChange={(e) => setForm((f) => ({ ...f, naam: e.target.value }))}
                placeholder="Bijv. Projectleider"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Categorie</Label>
              <Select
                value={form.groep ?? GEEN_GROEP}
                onValueChange={(v) => setForm((f) => ({ ...f, groep: v === GEEN_GROEP ? null : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Geen categorie" />
                </SelectTrigger>
                <SelectContent>
                  {/* Radix Select verbiedt value="": een lege string gooit een
                      runtime-error zodra de dialoog rendert, waardoor "Bewerken"
                      ogenschijnlijk niets deed. Daarom een sentinel-waarde. */}
                  <SelectItem value={GEEN_GROEP}>Geen categorie</SelectItem>
                  {GROEP_OPTIES.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border p-3 space-y-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Bevoegdheden per module
              </div>
              <div className="grid grid-cols-2 gap-2">
                {MODULES.map((mod) => (
                  <div key={mod.id} className="space-y-0.5">
                    <Label className="text-xs">{mod.label}</Label>
                    <Select
                      value={String(form.bevoegdheden[mod.id] ?? 0)}
                      onValueChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          bevoegdheden: { ...f.bevoegdheden, [mod.id]: Number(v) },
                        }))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NIVEAUS.map((n) => (
                          <SelectItem key={n.waarde} value={String(n.waarde)} className="text-xs">
                            {n.waarde} — {n.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
            {fout && <p className="text-sm text-destructive">{fout}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialoogOpen(false)}>
              Annuleren
            </Button>
            <Button onClick={bewaar} disabled={bezig}>
              {bezig && <Loader2 className="h-4 w-4 animate-spin" />}
              {form.id === null ? "Aanmaken" : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={verwijderTarget !== null}
        onOpenChange={(open) => !open && setVerwijderTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Profiel verwijderen</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je het profiel "{verwijderTarget?.naam}" wilt verwijderen?
              Gebruikers die dit profiel als startpunt kregen, behouden hun huidige bevoegdheden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={bevestigVerwijder}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={toepassenTarget !== null}
        onOpenChange={(open) => !open && setToepassenTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wijzigingen toepassen op gekoppelde gebruikers</AlertDialogTitle>
            <AlertDialogDescription>
              De huidige bevoegdheden van preset "{toepassenTarget?.naam}" worden
              overgenomen door {toepassenTarget?.aantal}{" "}
              {toepassenTarget?.aantal === 1 ? "gebruiker" : "gebruikers"} die dit
              profiel als startpunt kregen. Eventuele handmatige aanpassingen bij die
              gebruikers worden overschreven. Deze actie kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={bevestigToepassen}>
              Toepassen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AiVoorstelDialog open={aiOpen} onOpenChange={setAiOpen} onOpgeslagen={invalideer} />
    </div>
  );
}

type GekoppeldeGebruiker = {
  id: number;
  naam: string;
  rol?: string | null;
  gelijk: boolean;
};

function GekoppeldeGebruikers({
  gebruikers,
  aantal,
  onToepassen,
  bezig,
}: {
  gebruikers: GekoppeldeGebruiker[];
  aantal: number;
  onToepassen: () => void;
  bezig: boolean;
}) {
  const afwijkend = gebruikers.filter((g) => !g.gelijk).length;

  return (
    <div className="border-t pt-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {aantal === 0
            ? "Nog niet toegepast op gebruikers"
            : `${aantal} ${aantal === 1 ? "gebruiker" : "gebruikers"} afgeleid`}
        </div>
        {aantal > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={onToepassen}
            disabled={bezig}
          >
            {bezig ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Toepassen
          </Button>
        )}
      </div>

      {aantal > 0 && (
        <div className="flex flex-wrap gap-1">
          {gebruikers.map((g) => (
            <Badge
              key={g.id}
              variant="secondary"
              className="gap-1 font-normal text-muted-foreground"
              title={
                g.gelijk
                  ? "Bevoegdheden gelijk aan preset"
                  : "Bevoegdheden sindsdien handmatig aangepast"
              }
            >
              {!g.gelijk && <AlertTriangle className="h-3 w-3 text-amber-600" />}
              {g.naam}
            </Badge>
          ))}
        </div>
      )}

      {afwijkend > 0 && (
        <p className="text-xs text-amber-700">
          {afwijkend}{" "}
          {afwijkend === 1 ? "gebruiker wijkt" : "gebruikers wijken"} af van de preset.
        </p>
      )}
    </div>
  );
}
