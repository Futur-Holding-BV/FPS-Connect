// PRIJS_01 §8 — De marktspiegel (firevault-pagina).
//
// Lijst van onderzoeken + "Nieuw onderzoek" (aflopende/actieve prijsafspraak uit
// een keuzelijst, financieel contract, of vrije vraag) + detailweergave:
// samenvatting, tabel met aanbieder / indicatie / VINDPLAATS als klikbare link +
// datum. Expliciet nergens een overstap-advies (§8.3, §9). Lege staat wanneer er
// nog niets is onderzocht. De status wordt gepolld zolang een onderzoek 'bezig' is.
import { useMemo, useState } from "react";
import {
  useListMarktspiegelOnderzoeken,
  useGetMarktspiegelOnderzoek,
  useStartMarktspiegelOnderzoek,
  useListPrijsafspraken,
  useListFinancieleContracten,
  getListMarktspiegelOnderzoekenQueryKey,
  getGetMarktspiegelOnderzoekQueryKey,
} from "@workspace/api-client-react";
import type {
  MarktspiegelOnderzoek,
  MarktspiegelOnderzoekInput,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ScanSearch, Plus, ExternalLink, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_KLEUR: Record<string, string> = {
  bezig: "bg-blue-100 text-blue-700 border-blue-200",
  klaar: "bg-emerald-100 text-emerald-700 border-emerald-200",
  fout: "bg-rose-100 text-rose-700 border-rose-200",
};
const STATUS_LABEL: Record<string, string> = {
  bezig: "Bezig…",
  klaar: "Klaar",
  fout: "Mislukt",
};
const ONDERWERP_LABEL: Record<string, string> = {
  prijsafspraak: "Prijsafspraak",
  financieel_contract: "Financieel contract",
  vrij: "Vrije vraag",
};

function fmtDatum(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleString("nl-NL");
}

// ── Detailweergave: één onderzoek, met polling zolang 'bezig' ────────────────
function OnderzoekDetail({ onderzoekId }: { onderzoekId: number }) {
  const { data, isLoading } = useGetMarktspiegelOnderzoek(onderzoekId, {
    query: {
      queryKey: getGetMarktspiegelOnderzoekQueryKey(onderzoekId),
      // Poll zolang het onderzoek loopt.
      refetchInterval: (query) =>
        (query.state.data as MarktspiegelOnderzoek | undefined)?.status === "bezig" ? 3000 : false,
    },
  });

  if (isLoading || !data) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={STATUS_KLEUR[data.status] ?? ""}>
          {STATUS_LABEL[data.status] ?? data.status}
        </Badge>
        <span className="text-sm text-muted-foreground">{ONDERWERP_LABEL[data.onderwerp_type] ?? data.onderwerp_type}</span>
      </div>

      <p className="text-sm">{data.vraag}</p>

      {data.status === "bezig" && (
        <p className="text-sm text-muted-foreground">De marktspiegel kijkt naar buiten. Dit kan even duren…</p>
      )}
      {data.status === "fout" && (
        <p className="text-sm text-rose-600">Het onderzoek is mislukt: {data.fout ?? "onbekende fout"}.</p>
      )}

      {data.status === "klaar" && data.resultaat && (
        <>
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="text-sm whitespace-pre-wrap">{data.resultaat.samenvatting}</p>
          </div>

          {data.resultaat.vergelijkingen.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Er zijn geen vergelijkbare marktprijzen met een controleerbare bron gevonden. Wat niet te vinden was, blijft leeg.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aanbieder</TableHead>
                  <TableHead>Indicatie</TableHead>
                  <TableHead>Eenheid</TableHead>
                  <TableHead>Vindplaats</TableHead>
                  <TableHead>Gevonden op</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.resultaat.vergelijkingen.map((v, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{v.aanbieder}</TableCell>
                    <TableCell>{v.indicatie_prijs}</TableCell>
                    <TableCell>{v.eenheid ?? "—"}</TableCell>
                    <TableCell>
                      <a
                        href={v.vindplaats_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        bron <ExternalLink className="h-3 w-3" />
                      </a>
                    </TableCell>
                    <TableCell>{v.gevonden_op}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </div>
  );
}

// ── "Nieuw onderzoek"-dialoog ─────────────────────────────────────────────────
function NieuwOnderzoekDialog({
  open, onOpenChange, onGestart,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onGestart: () => void;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<"prijsafspraak" | "financieel_contract" | "vrij">("prijsafspraak");
  const [prijsafspraakId, setPrijsafspraakId] = useState<string>("");
  const [contractId, setContractId] = useState<string>("");
  const [vraag, setVraag] = useState<string>("");

  const { data: afspraken } = useListPrijsafspraken({ actueel: false });
  const { data: contracten } = useListFinancieleContracten();

  const starten = useStartMarktspiegelOnderzoek({
    mutation: {
      onSuccess: () => {
        toast({ title: "Onderzoek gestart", description: "De marktspiegel draait op de achtergrond." });
        onGestart();
        onOpenChange(false);
        setPrijsafspraakId(""); setContractId(""); setVraag("");
      },
      onError: () => toast({ title: "Starten mislukt", variant: "destructive" }),
    },
  });

  const start = () => {
    let payload: MarktspiegelOnderzoekInput;
    if (type === "vrij") {
      if (!vraag.trim()) return void toast({ title: "Vul een vraag in", variant: "destructive" });
      payload = { onderwerp_type: "vrij", vraag: vraag.trim(), aanleiding: "handmatig" };
    } else if (type === "prijsafspraak") {
      if (!prijsafspraakId) return void toast({ title: "Kies een prijsafspraak", variant: "destructive" });
      payload = { onderwerp_type: "prijsafspraak", onderwerp_id: Number(prijsafspraakId), aanleiding: "handmatig" };
    } else {
      if (!contractId) return void toast({ title: "Kies een contract", variant: "destructive" });
      payload = { onderwerp_type: "financieel_contract", onderwerp_id: Number(contractId), aanleiding: "handmatig" };
    }
    starten.mutate({ data: payload });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nieuw marktspiegel-onderzoek</DialogTitle>
          <DialogDescription>
            Kies een onderwerp. De marktspiegel kijkt op aanvraag naar buiten: dit betaal je, dit vraagt de markt.
            Het doel is weten, niet wisselen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Onderwerp</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="prijsafspraak">Prijsafspraak</SelectItem>
                <SelectItem value="financieel_contract">Financieel contract</SelectItem>
                <SelectItem value="vrij">Vrije vraag</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type === "prijsafspraak" && (
            <div className="space-y-1">
              <Label>Prijsafspraak</Label>
              <Select value={prijsafspraakId} onValueChange={setPrijsafspraakId}>
                <SelectTrigger><SelectValue placeholder="Kies een prijsafspraak" /></SelectTrigger>
                <SelectContent>
                  {(afspraken ?? []).map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {(a.leverancier_omschrijving ?? a.leverancier_artikelcode ?? `artikel #${a.artikel_id ?? "?"}`)}
                      {" — "}{new Intl.NumberFormat("nl-NL", { style: "currency", currency: a.valuta || "EUR" }).format(a.prijs)}
                      {a.eenheid ? `/${a.eenheid}` : ""} (t/m {a.geldig_tot})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {type === "financieel_contract" && (
            <div className="space-y-1">
              <Label>Financieel contract</Label>
              <Select value={contractId} onValueChange={setContractId}>
                <SelectTrigger><SelectValue placeholder="Kies een contract" /></SelectTrigger>
                <SelectContent>
                  {(contracten ?? []).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.naam}{c.leverancier ? ` — ${c.leverancier}` : ""} ({c.categorie})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {type === "vrij" && (
            <div className="space-y-1">
              <Label>Vraag</Label>
              <Textarea
                value={vraag}
                onChange={(e) => setVraag(e.target.value)}
                placeholder="Bijv. Wat vragen andere leveranciers voor brandwerende manchetten 110 mm?"
                rows={3}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={start} disabled={starten.isPending}>
            {starten.isPending ? "Starten…" : "Onderzoek starten"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MarktspiegelPagina() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [geselecteerdId, setGeselecteerdId] = useState<number | null>(null);

  const { data: onderzoeken, isLoading } = useListMarktspiegelOnderzoeken({
    query: {
      queryKey: getListMarktspiegelOnderzoekenQueryKey(),
      // Blijf de lijst verversen zolang er nog een onderzoek loopt.
      refetchInterval: (query) => {
        const rijen = query.state.data as MarktspiegelOnderzoek[] | undefined;
        return rijen?.some((o) => o.status === "bezig") ? 4000 : false;
      },
    },
  });

  const invalideerLijst = () =>
    queryClient.invalidateQueries({ queryKey: getListMarktspiegelOnderzoekenQueryKey() });

  const geselecteerd = useMemo(
    () => (onderzoeken ?? []).find((o) => o.id === geselecteerdId) ?? null,
    [onderzoeken, geselecteerdId],
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScanSearch className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Marktspiegel</h1>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nieuw onderzoek
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Dit betaal je, dit vraagt de markt. Elke vergelijking draagt een controleerbare vindplaats en datum;
          wat niet te vinden was, blijft leeg. Het doel is weten, niet wisselen — de gebruikelijke vervolgstap is een
          gesprek met de bestaande leverancier.
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Onderzoeken</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (onderzoeken ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nog niets onderzocht. Start een onderzoek voor een prijsafspraak, een financieel contract of een vrije vraag.
              </p>
            ) : (
              <div className="space-y-1">
                {(onderzoeken ?? []).map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setGeselecteerdId(o.id)}
                    className={`w-full text-left rounded-md border p-3 hover:bg-muted/50 transition ${
                      geselecteerdId === o.id ? "border-primary bg-muted/40" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium line-clamp-1">{o.vraag}</span>
                      <Badge variant="outline" className={STATUS_KLEUR[o.status] ?? ""}>
                        {STATUS_LABEL[o.status] ?? o.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {ONDERWERP_LABEL[o.onderwerp_type] ?? o.onderwerp_type} · {fmtDatum(o.aangemaakt_op)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Detail</CardTitle>
          </CardHeader>
          <CardContent>
            {geselecteerd ? (
              <OnderzoekDetail onderzoekId={geselecteerd.id} />
            ) : (
              <p className="text-sm text-muted-foreground">Kies links een onderzoek om de uitkomst te zien.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <NieuwOnderzoekDialog open={dialogOpen} onOpenChange={setDialogOpen} onGestart={invalideerLijst} />
    </div>
  );
}
