// WERKBAK_02 §5/§6 — Team & overleg (desktop, kantoor). Twee tabs:
//  • Team: openstaande eigen taken (eigenaar, meewerkers, einddatum, status)
//    plus een aparte sectie werk-signalen.
//  • Overleg: agenda in vaste blokvolgorde + "Overleg vastleggen" (datum,
//    aanwezigen, nieuwe taken → in één handeling via legOverlegVast).
// Los daarvan: "Taak toevoegen" (maakWerkbakTaak). Zonder eigenaar + einddatum
// geeft de server 422 (EIGENAAR_EN_DATUM_VERPLICHT) → wij bieden aan er een
// gebouwaantekening van te maken.
import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetWerkbakTeam,
  getGetWerkbakTeamQueryKey,
  useGetOverlegAgenda,
  getGetOverlegAgendaQueryKey,
  useListOverleggen,
  getListOverleggenQueryKey,
  useLegOverlegVast,
  useMaakWerkbakTaak,
  useListToewijsbareGebruikers,
  getListToewijsbareGebruikersQueryKey,
} from "@workspace/api-client-react";
import type {
  WerkbakTaak,
  WerkbakTeamSignaal,
  WerkbakTaakInput,
  ToewijsbareGebruiker,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Users2, CalendarCheck2, Plus, Trash2, ExternalLink, ShieldAlert, Building2, Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const VANDAAG = new Date().toISOString().slice(0, 10);

/** Leest de HTTP-status uit een orval/ApiError. */
function status(err: unknown): number | undefined {
  return (err as { status?: number } | null)?.status;
}

/** Leest de foutcode uit de responsdata (bv. EIGENAAR_EN_DATUM_VERPLICHT). */
function foutCode(err: unknown): string | undefined {
  const data = (err as { data?: { code?: string } } | null)?.data;
  return data?.code;
}

// ── Team-tab ─────────────────────────────────────────────────────────────────

function TakenTabel({ taken }: { taken: WerkbakTaak[] }) {
  if (taken.length === 0) {
    return <p className="text-sm text-muted-foreground">Geen openstaande taken.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Taak</TableHead>
          <TableHead>Eigenaar</TableHead>
          <TableHead>Meewerkers</TableHead>
          <TableHead>Einddatum</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {taken.map((t) => (
          <TableRow key={t.id} data-testid={`rij-team-taak-${t.id}`}>
            <TableCell className="font-medium">
              {t.titel}
              {t.omschrijving && (
                <p className="text-xs text-muted-foreground font-normal mt-0.5">{t.omschrijving}</p>
              )}
            </TableCell>
            <TableCell>{t.eigenaar_naam ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground text-xs">
              {t.meewerker_namen && t.meewerker_namen.length > 0 ? t.meewerker_namen.join(", ") : "—"}
            </TableCell>
            <TableCell>{t.deadline ?? "—"}</TableCell>
            <TableCell>
              <Badge variant="secondary" className="text-[10px]">{t.status}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SignalenSectie({ signalen, onNavigeer }: { signalen: WerkbakTeamSignaal[]; onNavigeer: (pad: string) => void }) {
  if (signalen.length === 0) {
    return <p className="text-sm text-muted-foreground">Geen openstaande werk-signalen.</p>;
  }
  return (
    <div className="space-y-2">
      {signalen.map((s) => (
        <div
          key={s.id}
          className="rounded-md border p-2.5 flex items-start gap-2 text-sm"
          data-testid={`kaart-team-signaal-${s.id}`}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium">{s.titel}</p>
              <Badge variant="outline" className="text-[10px]">{s.bron}</Badge>
            </div>
            {s.omschrijving && <p className="text-xs text-muted-foreground mt-0.5">{s.omschrijving}</p>}
          </div>
          {s.actie_pad && (
            <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => onNavigeer(s.actie_pad!)}>
              <ExternalLink className="h-3 w-3 mr-1" /> Openen
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Overleg-tab: agenda-blokken ──────────────────────────────────────────────

function AgendaBlok({ titel, taken }: { titel: string; taken: WerkbakTaak[] }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-sm font-semibold">{titel}</h3>
      {taken.length === 0 ? (
        <p className="text-xs text-muted-foreground">Niets in dit blok.</p>
      ) : (
        <ul className="space-y-1">
          {taken.map((t) => (
            <li key={t.id} className="text-sm flex items-center gap-2 flex-wrap">
              <span className="font-medium">{t.titel}</span>
              <span className="text-xs text-muted-foreground">
                {t.eigenaar_naam ?? "geen eigenaar"}{t.deadline ? ` · ${t.deadline}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Nieuwe-taak-rij (in overleg-formulier en in taak-dialoog) ────────────────

type NieuweTaak = {
  titel: string;
  eigenaar_id: string;
  deadline: string;
  meewerker_ids: number[];
  soort: "doen" | "idee";
};

function legeTaak(): NieuweTaak {
  return { titel: "", eigenaar_id: "", deadline: "", meewerker_ids: [], soort: "doen" };
}

function EigenaarSelect({ waarde, gebruikers, onKies, placeholder = "Kies eigenaar" }: {
  waarde: string;
  gebruikers: ToewijsbareGebruiker[];
  onKies: (id: string) => void;
  placeholder?: string;
}) {
  return (
    <Select value={waarde} onValueChange={onKies}>
      <SelectTrigger className="w-44">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {gebruikers.map((g) => (
          <SelectItem key={g.id} value={String(g.id)}>{g.naam}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function TeamOverlegPagina() {
  const [, navigeer] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const team = useGetWerkbakTeam({ query: { queryKey: getGetWerkbakTeamQueryKey() } });
  const agenda = useGetOverlegAgenda({ query: { queryKey: getGetOverlegAgendaQueryKey() } });
  const overleggen = useListOverleggen({ query: { queryKey: getListOverleggenQueryKey() } });
  const { data: gebruikers = [] } = useListToewijsbareGebruikers({
    query: { queryKey: getListToewijsbareGebruikersQueryKey() },
  });

  const geenToegang = status(team.error) === 403 || status(agenda.error) === 403;

  // Overleg vastleggen
  const [overlegDatum, setOverlegDatum] = useState(VANDAAG);
  const [aanwezigenTekst, setAanwezigenTekst] = useState("");
  const [overlegTaken, setOverlegTaken] = useState<NieuweTaak[]>([]);

  // Losse taak toevoegen
  const [taakDialoog, setTaakDialoog] = useState(false);
  const [taakTitel, setTaakTitel] = useState("");
  const [taakOmschrijving, setTaakOmschrijving] = useState("");
  const [taakEigenaar, setTaakEigenaar] = useState("");
  const [taakDeadline, setTaakDeadline] = useState("");
  const [taakMeewerkers, setTaakMeewerkers] = useState<number[]>([]);
  const [taakGeenTaak, setTaakGeenTaak] = useState(false);

  function invalideerAlles(): void {
    void qc.invalidateQueries({ queryKey: getGetWerkbakTeamQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetOverlegAgendaQueryKey() });
    void qc.invalidateQueries({ queryKey: getListOverleggenQueryKey() });
  }

  const overlegMutatie = useLegOverlegVast({
    mutation: {
      onSuccess: (res) => {
        invalideerAlles();
        setAanwezigenTekst("");
        setOverlegTaken([]);
        setOverlegDatum(VANDAAG);
        toast({ title: "Overleg vastgelegd", description: `${res.taken_aangemaakt} taak/taken weggezet.` });
      },
      onError: (err) => {
        if (status(err) === 422 && foutCode(err) === "EIGENAAR_EN_DATUM_VERPLICHT") {
          toast({
            title: "Zonder eigenaar en einddatum is dit geen taak",
            description: "Geef elke taak een eigenaar en einddatum (ideeën mogen zonder datum).",
            variant: "destructive",
          });
          return;
        }
        toast({ title: "Overleg vastleggen mislukt", variant: "destructive" });
      },
    },
  });

  const taakMutatie = useMaakWerkbakTaak({
    mutation: {
      onSuccess: () => {
        invalideerAlles();
        setTaakDialoog(false);
        resetTaakDialoog();
        toast({ title: "Taak toegevoegd" });
      },
      onError: (err) => {
        if (status(err) === 422 && foutCode(err) === "EIGENAAR_EN_DATUM_VERPLICHT") {
          setTaakGeenTaak(true);
          return;
        }
        toast({ title: "Taak toevoegen mislukt", variant: "destructive" });
      },
    },
  });

  function resetTaakDialoog(): void {
    setTaakTitel("");
    setTaakOmschrijving("");
    setTaakEigenaar("");
    setTaakDeadline("");
    setTaakMeewerkers([]);
    setTaakGeenTaak(false);
  }

  function legOverlegVast(): void {
    const aanwezigen = aanwezigenTekst.split("\n").map((r) => r.trim()).filter((r) => r !== "");
    if (aanwezigen.length === 0) {
      toast({ title: "Vul minstens één aanwezige in", variant: "destructive" });
      return;
    }
    const taken: WerkbakTaakInput[] = overlegTaken
      .filter((t) => t.titel.trim() !== "")
      .map((t) => ({
        titel: t.titel.trim(),
        soort: t.soort,
        eigenaar_id: Number(t.eigenaar_id),
        deadline: t.deadline || null,
        meewerker_ids: t.meewerker_ids,
      }));
    overlegMutatie.mutate({ data: { datum: overlegDatum, aanwezigen, taken } });
  }

  function maakTaak(): void {
    if (!taakTitel.trim()) {
      toast({ title: "Titel is verplicht", variant: "destructive" });
      return;
    }
    setTaakGeenTaak(false);
    taakMutatie.mutate({
      data: {
        titel: taakTitel.trim(),
        omschrijving: taakOmschrijving.trim() || null,
        soort: "doen",
        eigenaar_id: taakEigenaar ? Number(taakEigenaar) : (0 as number),
        deadline: taakDeadline || null,
        meewerker_ids: taakMeewerkers,
      },
    });
  }

  function naarGebouwaantekening(): void {
    setTaakDialoog(false);
    resetTaakDialoog();
    toast({
      title: "Maak er een gebouwaantekening van",
      description: "Kies het gebouw en leg de aantekening daar vast.",
    });
    navigeer("/gebouwen");
  }

  if (geenToegang) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Team &amp; overleg</h1>
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Geen toegang</AlertTitle>
          <AlertDescription>
            Team &amp; overleg is beschikbaar voor personeel- of planningsbeheer (niveau 2) en
            hoofdbeheerders. Neem contact op met de beheerder als je hier wél toegang tot hoort te hebben.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Team &amp; overleg</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Wie doet wat, waar loopt het vast, en het wekelijkse overleg — alles hangt aan de werkbak.
          </p>
        </div>
        <Button onClick={() => { resetTaakDialoog(); setTaakDialoog(true); }} data-testid="knop-taak-toevoegen">
          <Plus className="h-4 w-4 mr-1" /> Taak toevoegen
        </Button>
      </div>

      <Tabs defaultValue="team">
        <TabsList>
          <TabsTrigger value="team" data-testid="tab-team">
            <Users2 className="h-4 w-4 mr-1.5" /> Team
          </TabsTrigger>
          <TabsTrigger value="overleg" data-testid="tab-overleg">
            <CalendarCheck2 className="h-4 w-4 mr-1.5" /> Overleg
          </TabsTrigger>
        </TabsList>

        {/* ── Team ── */}
        <TabsContent value="team" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Taken</CardTitle>
            </CardHeader>
            <CardContent>
              {team.isLoading ? (
                <p className="text-sm text-muted-foreground">Laden…</p>
              ) : (
                <TakenTabel taken={team.data?.taken ?? []} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Werk-signalen</CardTitle>
            </CardHeader>
            <CardContent>
              {team.isLoading ? (
                <p className="text-sm text-muted-foreground">Laden…</p>
              ) : (
                <SignalenSectie signalen={team.data?.signalen ?? []} onNavigeer={navigeer} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Overleg ── */}
        <TabsContent value="overleg" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Agenda</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {agenda.isLoading ? (
                <p className="text-sm text-muted-foreground">Laden…</p>
              ) : (
                <>
                  <AgendaBlok titel="1. Afgesproken vorige week" taken={agenda.data?.blok1_afgesproken ?? []} />
                  <AgendaBlok titel="2. Waar loopt het vast" taken={agenda.data?.blok2_loopt_vast ?? []} />
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-semibold">3. Nieuw sinds vorige week</h3>
                    {(agenda.data?.blok3_nieuw.taken.length ?? 0) === 0 &&
                    (agenda.data?.blok3_nieuw.signalen.length ?? 0) === 0 ? (
                      <p className="text-xs text-muted-foreground">Niets in dit blok.</p>
                    ) : (
                      <ul className="space-y-1">
                        {(agenda.data?.blok3_nieuw.taken ?? []).map((t) => (
                          <li key={`t-${t.id}`} className="text-sm flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{t.titel}</span>
                            <span className="text-xs text-muted-foreground">
                              {t.eigenaar_naam ?? "geen eigenaar"}{t.deadline ? ` · ${t.deadline}` : ""}
                            </span>
                          </li>
                        ))}
                        {(agenda.data?.blok3_nieuw.signalen ?? []).map((s) => (
                          <li key={`s-${s.id}`} className="text-sm flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{s.titel}</span>
                            <Badge variant="outline" className="text-[10px]">{s.bron}</Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <AgendaBlok titel="4. Plannen en ideeën" taken={agenda.data?.blok4_ideeen ?? []} />
                </>
              )}
            </CardContent>
          </Card>

          {/* Overleg vastleggen */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Overleg vastleggen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Datum</Label>
                  <Input
                    type="date"
                    value={overlegDatum}
                    onChange={(e) => setOverlegDatum(e.target.value)}
                    className="w-44"
                    data-testid="invoer-overleg-datum"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Aanwezigen (één per regel)</Label>
                  <Textarea
                    value={aanwezigenTekst}
                    onChange={(e) => setAanwezigenTekst(e.target.value)}
                    placeholder={"Jan\nPiet\n…"}
                    className="min-h-20"
                    data-testid="invoer-overleg-aanwezigen"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Nieuwe taken</Label>
                {overlegTaken.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nog geen taken toegevoegd.</p>
                )}
                {overlegTaken.map((t, i) => (
                  <div key={i} className="rounded-md border p-2.5 space-y-2" data-testid={`overleg-taak-${i}`}>
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Titel"
                        value={t.titel}
                        onChange={(e) => setOverlegTaken((prev) => prev.map((x, j) => j === i ? { ...x, titel: e.target.value } : x))}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setOverlegTaken((prev) => prev.filter((_, j) => j !== i))}
                        aria-label="Taak verwijderen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <EigenaarSelect
                        waarde={t.eigenaar_id}
                        gebruikers={gebruikers}
                        onKies={(id) => setOverlegTaken((prev) => prev.map((x, j) => j === i ? { ...x, eigenaar_id: id } : x))}
                      />
                      <Input
                        type="date"
                        value={t.deadline}
                        onChange={(e) => setOverlegTaken((prev) => prev.map((x, j) => j === i ? { ...x, deadline: e.target.value } : x))}
                        className="w-40"
                      />
                      <Select
                        value={t.soort}
                        onValueChange={(v) => setOverlegTaken((prev) => prev.map((x, j) => j === i ? { ...x, soort: v as "doen" | "idee" } : x))}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="doen">Taak</SelectItem>
                          <SelectItem value="idee">Idee</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <MeewerkerKiezer
                      gebruikers={gebruikers}
                      geselecteerd={t.meewerker_ids}
                      eigenaarId={t.eigenaar_id ? Number(t.eigenaar_id) : null}
                      onWijzig={(ids) => setOverlegTaken((prev) => prev.map((x, j) => j === i ? { ...x, meewerker_ids: ids } : x))}
                    />
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setOverlegTaken((prev) => [...prev, legeTaak()])}>
                  <Plus className="h-4 w-4 mr-1" /> Taak toevoegen
                </Button>
              </div>

              <div className="flex justify-end">
                <Button onClick={legOverlegVast} disabled={overlegMutatie.isPending} data-testid="knop-overleg-vastleggen">
                  {overlegMutatie.isPending ? "Bezig…" : "Overleg vastleggen"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Eerdere overleggen */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Eerdere overleggen</CardTitle>
            </CardHeader>
            <CardContent>
              {(overleggen.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nog geen overleggen vastgelegd.</p>
              ) : (
                <ul className="space-y-1.5">
                  {(overleggen.data ?? []).map((o) => (
                    <li key={o.id} className="text-sm flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{o.datum}</span>
                      <span className="text-xs text-muted-foreground">{o.aanwezigen.join(", ")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Taak toevoegen (los van overleg) */}
      <Dialog open={taakDialoog} onOpenChange={(open) => { setTaakDialoog(open); if (!open) resetTaakDialoog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Taak toevoegen</DialogTitle>
            <DialogDescription>
              Een taak heeft één eigenaar en een einddatum nodig.
            </DialogDescription>
          </DialogHeader>

          {taakGeenTaak ? (
            <div className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Zonder eigenaar en einddatum is dit geen taak</AlertTitle>
                <AlertDescription>
                  Vul een eigenaar en einddatum in om er een taak van te maken, of leg het vast als
                  gebouwaantekening.
                </AlertDescription>
              </Alert>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setTaakGeenTaak(false)}>Terug</Button>
                <Button onClick={naarGebouwaantekening} data-testid="knop-naar-gebouwaantekening">
                  <Building2 className="h-4 w-4 mr-1" /> Maak er een gebouwaantekening van
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Titel</Label>
                <Input value={taakTitel} onChange={(e) => setTaakTitel(e.target.value)} data-testid="invoer-taak-titel" />
              </div>
              <div className="space-y-1.5">
                <Label>Omschrijving (optioneel)</Label>
                <Textarea value={taakOmschrijving} onChange={(e) => setTaakOmschrijving(e.target.value)} className="min-h-16" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Eigenaar</Label>
                  <EigenaarSelect waarde={taakEigenaar} gebruikers={gebruikers} onKies={setTaakEigenaar} />
                </div>
                <div className="space-y-1.5">
                  <Label>Einddatum</Label>
                  <Input type="date" value={taakDeadline} onChange={(e) => setTaakDeadline(e.target.value)} className="w-44" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Meewerkers (optioneel)</Label>
                <MeewerkerKiezer
                  gebruikers={gebruikers}
                  geselecteerd={taakMeewerkers}
                  eigenaarId={taakEigenaar ? Number(taakEigenaar) : null}
                  onWijzig={setTaakMeewerkers}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setTaakDialoog(false); resetTaakDialoog(); }}>Annuleren</Button>
                <Button onClick={maakTaak} disabled={taakMutatie.isPending} data-testid="knop-taak-opslaan">
                  {taakMutatie.isPending ? "Bezig…" : "Opslaan"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Eenvoudige meewerker-kiezer: klikbare badges (eigenaar uitgesloten).
function MeewerkerKiezer({ gebruikers, geselecteerd, eigenaarId, onWijzig }: {
  gebruikers: ToewijsbareGebruiker[];
  geselecteerd: number[];
  eigenaarId: number | null;
  onWijzig: (ids: number[]) => void;
}) {
  const beschikbaar = gebruikers.filter((g) => g.id !== eigenaarId);
  if (beschikbaar.length === 0) {
    return <p className="text-xs text-muted-foreground">Geen gebruikers beschikbaar.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {beschikbaar.map((g) => {
        const actief = geselecteerd.includes(g.id);
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => onWijzig(actief ? geselecteerd.filter((id) => id !== g.id) : [...geselecteerd, g.id])}
            className={
              "text-xs rounded-full border px-2.5 py-0.5 transition-colors " +
              (actief ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted")
            }
          >
            {g.naam}
          </button>
        );
      })}
    </div>
  );
}
