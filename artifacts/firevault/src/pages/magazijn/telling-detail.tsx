// Voorraadtelling-detail — regels invullen/bevestigen, verschillenlijst, vaststellen
import { useState } from "react";
import { Link, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetVoorraadTelling,
  useGetVoorraadTellingVerschillen,
  useUpsertVoorraadTellingRegel,
  useDeleteVoorraadTellingRegel,
  useStelVoorraadTellingVast,
  useListArtikelen,
  useListMagazijnLocaties,
  getGetVoorraadTellingQueryKey,
  getGetVoorraadTellingVerschillenQueryKey,
  getListVoorraadTellingenQueryKey,
  type VoorraadTellingRegel,
} from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Lock, Loader2, Trash2, CheckCircle2, Printer, AlertCircle } from "lucide-react";
import { GRONDSLAG_LABELS } from "./tellingen";

function formatBedrag(n: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
}

function formatDatum(d: string) {
  const [j, m, dag] = d.split("-");
  return `${dag}-${m}-${j}`;
}

// "Laatste beweging"-kolom: hoe lang geleden — incourante voorraad zichtbaar maken
function bewegingLabel(iso: string | null | undefined): { tekst: string; oud: boolean } {
  if (!iso) return { tekst: "nooit", oud: true };
  const dagen = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  const oud = dagen > 365;
  if (dagen <= 0) return { tekst: "vandaag", oud };
  if (dagen < 31) return { tekst: `${dagen} dg geleden`, oud };
  if (dagen < 365) return { tekst: `${Math.floor(dagen / 30)} mnd geleden`, oud };
  const jaren = Math.floor(dagen / 365);
  return { tekst: `${jaren} jaar geleden`, oud };
}

function RegelRij({ regel, vastgesteld, kanInvullen, tellingId }: {
  regel: VoorraadTellingRegel;
  vastgesteld: boolean;
  kanInvullen: boolean;
  tellingId: number;
}) {
  const queryClient = useQueryClient();
  const [aantal, setAantal] = useState(String(regel.geteld_aantal));
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetVoorraadTellingQueryKey(tellingId) });
    queryClient.invalidateQueries({ queryKey: getGetVoorraadTellingVerschillenQueryKey(tellingId) });
  };
  const upsert = useUpsertVoorraadTellingRegel({ mutation: { onSuccess: invalidate } });
  const verwijder = useDeleteVoorraadTellingRegel({ mutation: { onSuccess: invalidate } });

  const bewaar = (bevestigd: boolean) => {
    if (regel.artikel_id == null) return;
    upsert.mutate({
      id: tellingId,
      data: {
        artikel_id: regel.artikel_id,
        locatie_id: regel.locatie_id ?? null,
        geteld_aantal: Number(aantal) || 0,
        bevestigd,
      },
    });
  };

  const beweging = bewegingLabel(regel.laatste_beweging_op);
  return (
    <tr className="border-t hover:bg-muted/20 transition-colors">
      <td className="py-2 px-4 font-medium">
        {regel.artikel_naam}
        {regel.artikel_code && <span className="text-xs text-muted-foreground ml-2">{regel.artikel_code}</span>}
      </td>
      <td className="py-2 px-4 text-muted-foreground">{regel.locatie_naam ?? "—"}</td>
      <td className="py-2 px-4 text-right tabular-nums text-muted-foreground">
        {regel.administratieve_voorraad ?? "—"}
      </td>
      <td className="py-2 px-4 text-right">
        {vastgesteld || !kanInvullen ? (
          <span className="tabular-nums font-semibold">{regel.geteld_aantal}</span>
        ) : (
          <Input
            type="number"
            min={0}
            step="0.01"
            value={aantal}
            onChange={(e) => setAantal(e.target.value)}
            onBlur={() => { if (Number(aantal) !== regel.geteld_aantal) bewaar(false); }}
            className="h-8 w-24 ml-auto text-right"
          />
        )}
      </td>
      <td className="py-2 px-4 text-right tabular-nums">
        {regel.verschil_aantal != null && regel.verschil_aantal !== 0 ? (
          <span className={regel.verschil_aantal > 0 ? "text-green-700" : "text-red-700"}>
            {regel.verschil_aantal > 0 ? "+" : ""}{regel.verschil_aantal}
          </span>
        ) : <span className="text-muted-foreground">0</span>}
      </td>
      <td className="py-2 px-4">
        <span className={beweging.oud ? "text-amber-700 text-xs font-medium" : "text-muted-foreground text-xs"}>
          {beweging.tekst}
        </span>
      </td>
      <td className="py-2 px-4">
        {regel.bevestigd ? (
          <Badge variant="secondary" className="text-muted-foreground"><CheckCircle2 className="h-3 w-3 mr-1" />Bevestigd</Badge>
        ) : (
          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Nog bevestigen</Badge>
        )}
      </td>
      {!vastgesteld && kanInvullen && (
        <td className="py-2 px-4 text-right whitespace-nowrap">
          {!regel.bevestigd && (
            <Button size="sm" variant="outline" className="h-8 mr-1" onClick={() => bewaar(true)} disabled={upsert.isPending}>
              Bevestigen
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground"
            onClick={() => verwijder.mutate({ id: tellingId, regelId: regel.id })}
            disabled={verwijder.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </td>
      )}
    </tr>
  );
}

export default function MagazijnTellingDetailPagina() {
  const [, params] = useRoute("/magazijn/tellingen/:id");
  const tellingId = Number(params?.id ?? 0);
  const { heeftNiveau } = useBevoegdheid();
  const kanLezen = heeftNiveau("magazijn", 1);
  const kanInvullen = heeftNiveau("magazijn", 3);
  const kanVaststellen = heeftNiveau("magazijn", 4);
  const queryClient = useQueryClient();

  const { data: telling, isLoading } = useGetVoorraadTelling(tellingId);
  const { data: verschillen } = useGetVoorraadTellingVerschillen(tellingId);
  const { data: artikelen = [] } = useListArtikelen();
  const { data: locaties = [] } = useListMagazijnLocaties();

  const [nieuwArtikel, setNieuwArtikel] = useState("");
  const [nieuwLocatie, setNieuwLocatie] = useState("geen");
  const [nieuwAantal, setNieuwAantal] = useState("");
  const [vaststelDialoog, setVaststelDialoog] = useState(false);
  const [foutmelding, setFoutmelding] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetVoorraadTellingQueryKey(tellingId) });
    queryClient.invalidateQueries({ queryKey: getGetVoorraadTellingVerschillenQueryKey(tellingId) });
    queryClient.invalidateQueries({ queryKey: getListVoorraadTellingenQueryKey() });
  };

  const upsert = useUpsertVoorraadTellingRegel({
    mutation: {
      onSuccess: () => { invalidate(); setNieuwArtikel(""); setNieuwAantal(""); setNieuwLocatie("geen"); setFoutmelding(null); },
      onError: () => setFoutmelding("Regel opslaan mislukt."),
    },
  });
  const vaststellen = useStelVoorraadTellingVast({
    mutation: {
      onSuccess: () => { invalidate(); setVaststelDialoog(false); setFoutmelding(null); },
      onError: (e: unknown) => {
        const err = e as { data?: { error?: string } };
        setFoutmelding(err?.data?.error ?? "Vaststellen mislukt.");
      },
    },
  });

  if (!kanLezen) {
    return <div className="p-6"><p className="text-muted-foreground">Geen toegang tot magazijn.</p></div>;
  }
  if (isLoading || !telling) {
    return <div className="p-6 space-y-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full" /></div>;
  }

  const vastgesteld = telling.status === "vastgesteld";
  const regels = telling.regels ?? [];
  const onbevestigd = regels.filter((r) => !r.bevestigd).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 data-paginatitel className="text-2xl font-bold flex items-center gap-2">
            Telling {formatDatum(telling.peildatum)}
            {vastgesteld ? (
              <Badge variant="secondary" className="text-muted-foreground"><Lock className="h-3 w-3 mr-1" />Vastgesteld</Badge>
            ) : (
              <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Open</Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Grondslag: {GRONDSLAG_LABELS[telling.grondslag] ?? telling.grondslag}
            {telling.omschrijving ? ` — ${telling.omschrijving}` : ""}
            {vastgesteld && telling.vastgesteld_door_naam ? ` — vastgesteld door ${telling.vastgesteld_door_naam}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {vastgesteld && (
            <Link href={`/magazijn/tellingen/${telling.id}/print`}>
              <Button variant="outline" size="sm"><Printer className="h-4 w-4 mr-2" />Boekhouder-uitvoer</Button>
            </Link>
          )}
          {!vastgesteld && kanVaststellen && (
            <Button size="sm" onClick={() => setVaststelDialoog(true)} disabled={regels.length === 0}>
              <Lock className="h-4 w-4 mr-2" />Vaststellen
            </Button>
          )}
          <Link href="/magazijn/tellingen"><Button variant="ghost" size="sm">Alle tellingen</Button></Link>
        </div>
      </div>

      {foutmelding && (
        <p className="text-sm text-destructive flex items-center gap-1"><AlertCircle className="h-4 w-4" />{foutmelding}</p>
      )}

      <Tabs defaultValue="regels">
        <TabsList>
          <TabsTrigger value="regels">Telregels ({regels.length})</TabsTrigger>
          <TabsTrigger value="verschillen">Verschillenlijst</TabsTrigger>
        </TabsList>

        <TabsContent value="regels" className="space-y-4">
          {!vastgesteld && kanInvullen && (
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-end gap-3 flex-wrap">
                  <div className="space-y-1 min-w-56">
                    <Label>Artikel</Label>
                    <Select value={nieuwArtikel} onValueChange={setNieuwArtikel}>
                      <SelectTrigger><SelectValue placeholder="Kies artikel" /></SelectTrigger>
                      <SelectContent>
                        {artikelen.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>{a.naam}{a.code ? ` (${a.code})` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 min-w-44">
                    <Label>Locatie (optioneel)</Label>
                    <Select value={nieuwLocatie} onValueChange={setNieuwLocatie}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="geen">Geen locatie</SelectItem>
                        {locaties.map((l) => (
                          <SelectItem key={l.id} value={String(l.id)}>{l.naam}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="nieuw-aantal">Geteld aantal</Label>
                    <Input id="nieuw-aantal" type="number" min={0} step="0.01" value={nieuwAantal} onChange={(e) => setNieuwAantal(e.target.value)} className="w-32" />
                  </div>
                  <Button
                    onClick={() => upsert.mutate({
                      id: tellingId,
                      data: {
                        artikel_id: Number(nieuwArtikel),
                        locatie_id: nieuwLocatie !== "geen" ? Number(nieuwLocatie) : null,
                        geteld_aantal: Number(nieuwAantal) || 0,
                        bevestigd: false,
                      },
                    })}
                    disabled={!nieuwArtikel || nieuwAantal === "" || upsert.isPending}
                  >
                    {upsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Regel toevoegen
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="text-left py-2.5 px-4">Artikel</th>
                      <th className="text-left py-2.5 px-4">Locatie</th>
                      <th className="text-right py-2.5 px-4">Administratie</th>
                      <th className="text-right py-2.5 px-4">Geteld</th>
                      <th className="text-right py-2.5 px-4">Verschil</th>
                      <th className="text-left py-2.5 px-4">Laatste beweging</th>
                      <th className="text-left py-2.5 px-4">Status</th>
                      {!vastgesteld && kanInvullen && <th className="text-right py-2.5 px-4">Acties</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {regels.length === 0 ? (
                      <tr><td colSpan={8} className="py-8 text-center text-muted-foreground text-sm">Nog geen telregels ingevuld.</td></tr>
                    ) : (
                      regels.map((r) => (
                        <RegelRij key={r.id} regel={r} vastgesteld={vastgesteld} kanInvullen={kanInvullen} tellingId={tellingId} />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="verschillen">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Administratie vs. geteld — tegen {GRONDSLAG_LABELS[telling.grondslag]?.toLowerCase() ?? telling.grondslag}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="text-left py-2.5 px-4">Artikel</th>
                      <th className="text-left py-2.5 px-4">Locatie</th>
                      <th className="text-right py-2.5 px-4">Administratie</th>
                      <th className="text-right py-2.5 px-4">Geteld</th>
                      <th className="text-right py-2.5 px-4">Verschil</th>
                      <th className="text-right py-2.5 px-4">Prijs</th>
                      <th className="text-right py-2.5 px-4">Verschil in geld</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(verschillen?.regels ?? []).length === 0 ? (
                      <tr><td colSpan={7} className="py-8 text-center text-muted-foreground text-sm">Geen regels.</td></tr>
                    ) : (
                      verschillen!.regels.map((r) => (
                        <tr key={r.regel_id} className="border-t hover:bg-muted/20 transition-colors">
                          <td className="py-2.5 px-4 font-medium">{r.artikel_naam}</td>
                          <td className="py-2.5 px-4 text-muted-foreground">{r.locatie_naam ?? "—"}</td>
                          <td className="py-2.5 px-4 text-right tabular-nums">{r.administratieve_voorraad}</td>
                          <td className="py-2.5 px-4 text-right tabular-nums">{r.geteld_aantal}</td>
                          <td className="py-2.5 px-4 text-right tabular-nums">
                            {r.verschil_aantal !== 0 ? (
                              <span className={r.verschil_aantal > 0 ? "text-green-700" : "text-red-700"}>
                                {r.verschil_aantal > 0 ? "+" : ""}{r.verschil_aantal}
                              </span>
                            ) : "0"}
                          </td>
                          <td className="py-2.5 px-4 text-right tabular-nums">{r.prijs != null ? formatBedrag(r.prijs) : "—"}</td>
                          <td className="py-2.5 px-4 text-right tabular-nums font-medium">
                            {r.verschil_waarde != null ? formatBedrag(r.verschil_waarde) : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {verschillen && verschillen.regels.length > 0 && (
                    <tfoot>
                      <tr className="border-t bg-muted/30 font-semibold">
                        <td className="py-2.5 px-4" colSpan={5}>Totaal</td>
                        <td className="py-2.5 px-4 text-right tabular-nums text-muted-foreground text-xs">geteld: {formatBedrag(verschillen.totaal_geteld_waarde)}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums">{formatBedrag(verschillen.totaal_verschil_waarde)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              {(verschillen?.regels_zonder_prijs ?? 0) > 0 && (
                <p className="text-xs text-amber-700 px-4 py-3 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {verschillen!.regels_zonder_prijs} regel(s) zonder prijs volgens de gekozen grondslag — niet meegeteld in de geldbedragen.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={vaststelDialoog} onOpenChange={setVaststelDialoog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Telling vaststellen</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              Vaststellen bevriest per regel het getelde aantal, de gehanteerde prijs, de waarde en de locatie.
              Verschillen worden geboekt als correctiemutaties met verwijzing naar deze telling.
              <strong> Daarna is de telling onwijzigbaar.</strong>
            </p>
            {onbevestigd > 0 && (
              <p className="text-amber-700 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                {onbevestigd} regel(s) zijn nog niet bevestigd — bevestig ze eerst.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVaststelDialoog(false)}>Annuleren</Button>
            <Button
              onClick={() => vaststellen.mutate({ id: tellingId })}
              disabled={vaststellen.isPending || onbevestigd > 0}
            >
              {vaststellen.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Definitief vaststellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
