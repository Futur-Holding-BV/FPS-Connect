// AK-dashboard (FINANCIEEL_AI_01) — kritisch meekijken op algemene kosten.
// Toont de AK-omzetverhouding per boekjaar × werkmaatschappij (percentage
// ALTIJD over productie = gefactureerde omzet + OHW-mutatie), het lopende jaar
// tegenover de begroting (alleen tonen, nooit bijstellen), de posten op
// aandeel/ontwikkeling en de AI-adviezen (max 10 open, gerangschikt op bedrag,
// verdwijnen nooit vanzelf).
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetFieAkDashboard,
  getGetFieAkDashboardQueryKey,
  useGenereerFieAkAdviezen,
  useUpdateFieAkAdvies,
  useListFieRealisaties,
  getListFieRealisatiesQueryKey,
  useUpsertFieRealisatie,
  useListWerkgevers,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle2, PauseCircle, Plus, Sparkles, TrendingUp } from "lucide-react";

function euro(n: number | null | undefined): string {
  if (n == null) return "—";
  return `€ ${Math.round(n).toLocaleString("nl-NL")}`;
}
function pctTekst(n: number | null | undefined): string {
  return n == null ? "—" : `${n.toLocaleString("nl-NL")}%`;
}

export default function AkDashboardPagina() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const dashboard = useGetFieAkDashboard();
  const realisaties = useListFieRealisaties();
  const werkgevers = useListWerkgevers();

  const ververs = (): void => {
    void queryClient.invalidateQueries({ queryKey: getGetFieAkDashboardQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListFieRealisatiesQueryKey() });
  };

  const genereer = useGenereerFieAkAdviezen({
    mutation: {
      onSuccess: (resultaat) => {
        ververs();
        const n = resultaat.aangemaakt.length;
        toast({
          title: n > 0 ? `${n} nieuw advies${n === 1 ? "" : "en"}` : "Geen nieuwe adviezen",
          description: n > 0
            ? `Gerangschikt op bedrag.${resultaat.wachtend > 0 ? ` ${resultaat.wachtend} kandidaten wachten tot er ruimte is (max. 10 open).` : ""}`
            : `Er zijn ${resultaat.kandidaten_totaal} signalen gemeten; alles staat al open of er is geen signaal met minstens twee jaren cijfers.`,
        });
      },
      onError: () => toast({ title: "Genereren mislukt", variant: "destructive" }),
    },
  });

  const updateAdvies = useUpdateFieAkAdvies({
    mutation: {
      onSuccess: () => { ververs(); setWegzetten(null); setWegzetReden(""); },
      onError: (e) => toast({
        title: "Bijwerken mislukt",
        description: (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? undefined,
        variant: "destructive",
      }),
    },
  });

  const [wegzetten, setWegzetten] = useState<number | null>(null);
  const [wegzetReden, setWegzetReden] = useState("");

  // Realisatie-invoer
  const [invoerOpen, setInvoerOpen] = useState(false);
  const [invBoekjaar, setInvBoekjaar] = useState(String(new Date().getFullYear() - 1));
  const [invWerkgever, setInvWerkgever] = useState<string>("geheel");
  const [invOmzet, setInvOmzet] = useState("");
  const [invOhw, setInvOhw] = useState("");
  const [invPersoneel, setInvPersoneel] = useState("");
  const upsert = useUpsertFieRealisatie({
    mutation: {
      onSuccess: () => {
        ververs();
        setInvoerOpen(false);
        setInvOmzet(""); setInvOhw(""); setInvPersoneel("");
        toast({ title: "Realisatie opgeslagen" });
      },
      onError: () => toast({ title: "Opslaan mislukt", variant: "destructive" }),
    },
  });

  const d = dashboard.data;

  return (
    <div className="space-y-6 p-6" data-testid="pagina-ak-dashboard">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Algemene kosten</h1>
          <p className="text-sm text-muted-foreground">
            AK-verhouding per boekjaar en werkmaatschappij — percentage berekend over de productie
            (gefactureerde omzet + mutatie onderhanden projecten), niet alleen over gefactureerde omzet.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setInvoerOpen(true)} data-testid="knop-realisatie-invoeren">
            <Plus className="mr-1 h-4 w-4" /> Jaarcijfers invoeren
          </Button>
          <Button onClick={() => genereer.mutate()} disabled={genereer.isPending} data-testid="knop-adviezen-genereren">
            <Sparkles className="mr-1 h-4 w-4" /> {genereer.isPending ? "Bezig…" : "Adviezen genereren"}
          </Button>
        </div>
      </div>

      {d?.bevindingen.map((b, i) => (
        <Alert key={i} data-testid={`bevinding-${i}`}>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Bevinding</AlertTitle>
          <AlertDescription>{b}</AlertDescription>
        </Alert>
      ))}

      {/* Reeks per boekjaar × werkmaatschappij */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4" /> AK-verhouding per boekjaar</CardTitle>
          <CardDescription>Ontbrekende jaren worden benoemd, niet ingevuld.</CardDescription>
        </CardHeader>
        <CardContent>
          {dashboard.isLoading ? (
            <p className="text-sm text-muted-foreground">Laden…</p>
          ) : (d?.reeks.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="reeks-leeg">
              Nog geen cijfers. Voer per boekjaar de gerealiseerde omzet en OHW-mutatie in via "Jaarcijfers invoeren"
              en zorg dat de jaarbegroting AK-posten heeft.
            </p>
          ) : (
            <Table data-testid="tabel-reeks">
              <TableHeader>
                <TableRow>
                  <TableHead>Boekjaar</TableHead>
                  <TableHead>Werkmaatschappij</TableHead>
                  <TableHead className="text-right">AK</TableHead>
                  <TableHead className="text-right">Omzet</TableHead>
                  <TableHead className="text-right">OHW-mutatie</TableHead>
                  <TableHead className="text-right">Productie</TableHead>
                  <TableHead className="text-right">AK % productie</TableHead>
                  <TableHead className="text-right">AK % omzet</TableHead>
                  <TableHead>Opmerking</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d?.reeks.map((r, i) => (
                  <TableRow key={i} data-testid={`reeks-rij-${r.boekjaar}-${r.werkgeverId ?? "geheel"}`}>
                    <TableCell>{r.boekjaar}</TableCell>
                    <TableCell>{r.werkgeverNaam}</TableCell>
                    <TableCell className="text-right">{euro(r.akTotaal)}</TableCell>
                    <TableCell className="text-right">{euro(r.omzetGefactureerd)}</TableCell>
                    <TableCell className="text-right">{euro(r.ohwMutatie)}</TableCell>
                    <TableCell className="text-right font-medium">{euro(r.productie)}</TableCell>
                    <TableCell className="text-right font-semibold">{pctTekst(r.pctVanProductie)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{pctTekst(r.pctVanOmzet)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.ontbreekt ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Urenverhouding per boekjaar — onderbouwing van de loonsplitsing */}
      {(d?.uren_splitsing_per_jaar?.length ?? 0) > 0 && (
        <Card data-testid="kaart-urenverhouding">
          <CardHeader>
            <CardTitle>Urenverhouding productief / indirect per boekjaar</CardTitle>
            <CardDescription>
              Onderbouwing van de splitsing van het indirecte loondeel per boekjaar, op basis van de
              urenregistratie. Jaren zonder uren worden benoemd, nooit ingevuld.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table data-testid="tabel-urenverhouding">
              <TableHeader>
                <TableRow>
                  <TableHead>Boekjaar</TableHead>
                  <TableHead className="text-right">Productieve uren</TableHead>
                  <TableHead className="text-right">Indirecte uren</TableHead>
                  <TableHead className="text-right">Aandeel indirect</TableHead>
                  <TableHead>Opmerking</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d?.uren_splitsing_per_jaar?.map((j) => (
                  <TableRow key={j.boekjaar} data-testid={`urenverhouding-rij-${j.boekjaar}`}>
                    <TableCell>{j.boekjaar}</TableCell>
                    <TableCell className="text-right">{j.dekkend ? j.productief.toLocaleString("nl-NL") : "—"}</TableCell>
                    <TableCell className="text-right">{j.dekkend ? j.indirect.toLocaleString("nl-NL") : "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{pctTekst(j.indirect_pct)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {j.dekkend ? "" : "geen uren geregistreerd"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Lopend jaar */}
      {d?.lopend_jaar && (
        <Card data-testid="kaart-lopend-jaar">
          <CardHeader>
            <CardTitle>Lopend jaar {d.lopend_jaar.boekjaar} — koers tegenover begroting</CardTitle>
            <CardDescription>Wordt alleen getoond; de begroting wordt nooit automatisch bijgesteld.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kerncijfer label="Omzet tot nu" waarde={euro(d.lopend_jaar.omzetTotNu)} />
              <Kerncijfer label="Omzet bij koers" waarde={euro(d.lopend_jaar.omzetKoers)} />
              <Kerncijfer label="AK begroot" waarde={euro(d.lopend_jaar.akBegroot)} />
              <Kerncijfer label="AK% begroot → bij koers" waarde={`${pctTekst(d.lopend_jaar.pctBegroot)} → ${pctTekst(d.lopend_jaar.pctBijKoers)}`} />
            </div>
            <p className="text-sm text-muted-foreground">{d.lopend_jaar.toelichting}</p>
          </CardContent>
        </Card>
      )}

      {/* Adviezen */}
      <Card>
        <CardHeader>
          <CardTitle>Adviezen</CardTitle>
          <CardDescription>
            Gerangschikt op bedrag, maximaal 10 open. Een advies verdwijnt nooit vanzelf: afhandelen of bewust
            wegzetten mét reden. Elk advies noemt bedrag, jaren en bron.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(d?.adviezen.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="adviezen-leeg">Geen open adviezen.</p>
          ) : d?.adviezen.map((a) => (
            <div key={a.id} className="rounded-md border p-4" data-testid={`advies-${a.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{a.titel}</span>
                  <Badge variant="secondary">{euro(a.bedrag)}</Badge>
                  {a.status === "weggezet" && <Badge variant="outline"><PauseCircle className="mr-1 h-3 w-3" />Weggezet</Badge>}
                </div>
                <div className="flex gap-2">
                  {a.status !== "afgehandeld" && (
                    <>
                      <Button size="sm" variant="outline" data-testid={`knop-afhandelen-${a.id}`}
                        onClick={() => updateAdvies.mutate({ id: a.id, data: { status: "afgehandeld" } })}>
                        <CheckCircle2 className="mr-1 h-4 w-4" /> Afgehandeld
                      </Button>
                      {a.status === "open" && (
                        <Button size="sm" variant="ghost" data-testid={`knop-wegzetten-${a.id}`}
                          onClick={() => setWegzetten(a.id)}>
                          Wegzetten…
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
              <p className="mt-2 text-sm">{a.advies}</p>
              {a.vervolgstap && <p className="mt-1 text-sm text-muted-foreground">Vervolgstap: {a.vervolgstap}</p>}
              {a.bron_vermelding && <p className="mt-1 text-xs text-muted-foreground">Bron: {a.bron_vermelding}</p>}
              {a.status === "weggezet" && a.afhandel_reden && (
                <p className="mt-1 text-xs text-muted-foreground">Reden wegzetten: {a.afhandel_reden}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Posten */}
      <Card>
        <CardHeader>
          <CardTitle>AK-posten — aandeel en ontwikkeling</CardTitle>
          <CardDescription>Bij loonkosten toont Connect alleen de cijfers; personeelsbeslissingen zijn aan de directie.</CardDescription>
        </CardHeader>
        <CardContent>
          {(d?.posten.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Nog geen AK-posten in de jaarbegroting.</p>
          ) : (
            <Table data-testid="tabel-posten">
              <TableHeader>
                <TableRow>
                  <TableHead>Post</TableHead>
                  <TableHead>Werkmaatschappij</TableHead>
                  <TableHead>Verloop</TableHead>
                  <TableHead className="text-right">Huidig</TableHead>
                  <TableHead className="text-right">Aandeel</TableHead>
                  <TableHead className="text-right">Ontwikkeling</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d?.posten.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      {p.omschrijving}
                      {p.is_loonkosten && <Badge variant="outline" className="ml-2">loonkosten — alleen constatering</Badge>}
                    </TableCell>
                    <TableCell>{p.werkgever_naam}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {(p.per_jaar ?? []).map((j) => `${j.boekjaar}: ${euro(j.bedrag)}`).join(" → ")}
                    </TableCell>
                    <TableCell className="text-right">{euro(p.huidig_bedrag)}</TableCell>
                    <TableCell className="text-right">{pctTekst(p.aandeel_pct)}</TableCell>
                    <TableCell className="text-right">{p.stijging_pct == null ? "één jaar — geen ontwikkeling" : `${p.stijging_pct > 0 ? "+" : ""}${p.stijging_pct.toLocaleString("nl-NL")}%`}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Wegzetten-dialog */}
      <Dialog open={wegzetten !== null} onOpenChange={(open) => { if (!open) { setWegzetten(null); setWegzetReden(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Advies bewust wegzetten</DialogTitle>
            <DialogDescription>Een reden is verplicht — zo blijft zichtbaar waarom dit signaal niet is opgevolgd.</DialogDescription>
          </DialogHeader>
          <Textarea value={wegzetReden} onChange={(e) => setWegzetReden(e.target.value)}
            placeholder="Bijv.: dekking is in 2025 bewust uitgebreid na schadegeval" data-testid="invoer-wegzet-reden" />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setWegzetten(null); setWegzetReden(""); }}>Annuleren</Button>
            <Button disabled={wegzetReden.trim().length === 0 || updateAdvies.isPending} data-testid="knop-wegzetten-bevestigen"
              onClick={() => { if (wegzetten !== null) updateAdvies.mutate({ id: wegzetten, data: { status: "weggezet", afhandel_reden: wegzetReden.trim() } }); }}>
              Wegzetten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Realisatie-invoer */}
      <Dialog open={invoerOpen} onOpenChange={setInvoerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Jaarcijfers invoeren</DialogTitle>
            <DialogDescription>
              Uit de jaarrekening, per boekjaar en werkmaatschappij. De productie wordt berekend als omzet + OHW-mutatie.
              Bestaat het jaar al, dan worden de cijfers bijgewerkt.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Boekjaar</Label>
              <Input type="number" value={invBoekjaar} onChange={(e) => setInvBoekjaar(e.target.value)} data-testid="invoer-boekjaar" />
            </div>
            <div>
              <Label>Werkmaatschappij</Label>
              <Select value={invWerkgever} onValueChange={setInvWerkgever}>
                <SelectTrigger data-testid="keuze-werkgever"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="geheel">Geheel (geconsolideerd)</SelectItem>
                  {(werkgevers.data ?? []).map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>{w.naam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Gefactureerde omzet (€)</Label>
              <Input type="number" value={invOmzet} onChange={(e) => setInvOmzet(e.target.value)} data-testid="invoer-omzet" />
            </div>
            <div>
              <Label>Mutatie onderhanden projecten (€, +/−)</Label>
              <Input type="number" value={invOhw} onChange={(e) => setInvOhw(e.target.value)} data-testid="invoer-ohw" />
            </div>
            <div className="col-span-2">
              <Label>Personeelskosten totaal (€, optioneel)</Label>
              <Input type="number" value={invPersoneel} onChange={(e) => setInvPersoneel(e.target.value)} data-testid="invoer-personeel" />
              <p className="mt-1 text-xs text-muted-foreground">
                Totaalblok uit de jaarrekening (productief + indirect samen) — dit is géén AK-post.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoerOpen(false)}>Annuleren</Button>
            <Button data-testid="knop-realisatie-opslaan" disabled={upsert.isPending || invBoekjaar.trim().length !== 4}
              onClick={() => upsert.mutate({ data: {
                boekjaar: Number(invBoekjaar),
                werkgever_id: invWerkgever === "geheel" ? null : Number(invWerkgever),
                omzet_gefactureerd: invOmzet.trim() === "" ? null : Number(invOmzet),
                ohw_mutatie: invOhw.trim() === "" ? null : Number(invOhw),
                personeelskosten_totaal: invPersoneel.trim() === "" ? null : Number(invPersoneel),
              } })}>
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bestaande realisaties (klein overzicht) */}
      {(realisaties.data?.length ?? 0) > 0 && (
        <p className="text-xs text-muted-foreground" data-testid="realisaties-overzicht">
          Ingevoerde jaren: {realisaties.data?.map((r) => `${r.boekjaar}${r.werkgever_id ? ` (wm ${r.werkgever_id})` : ""}`).join(", ")}
        </p>
      )}
    </div>
  );
}

function Kerncijfer({ label, waarde }: { label: string; waarde: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{waarde}</p>
    </div>
  );
}
