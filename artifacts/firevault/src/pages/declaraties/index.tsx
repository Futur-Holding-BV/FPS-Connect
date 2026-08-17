import { useState } from "react";
import { Link } from "wouter";
import { Plus, Receipt, Clock, CheckCircle, XCircle, Banknote, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListDeclaraties,
  getListDeclaratiesQueryKey,
  useCreateDeclaratie,
  useGetDeclaratieBeleid,
  type Declaratie,
  type DeclaratieInputCategorie,
} from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { PaginaHulp } from "@/components/pagina-hulp";

const CATEGORIEEN = [
  { value: "reiskosten",     label: "Reiskosten" },
  { value: "maaltijden",     label: "Maaltijden" },
  { value: "overnachting",   label: "Overnachting" },
  { value: "representatie",  label: "Representatie" },
  { value: "gereedschap",    label: "Gereedschap" },
  { value: "overig",         label: "Overig" },
];

function statusBadge(status: string) {
  switch (status) {
    case "concept":     return <Badge variant="outline">Concept</Badge>;
    case "ingediend":   return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Ingediend</Badge>;
    case "goedgekeurd": return <Badge className="bg-green-100 text-green-800 border-green-200">Goedgekeurd</Badge>;
    case "afgekeurd":   return <Badge className="bg-red-100 text-red-800 border-red-200">Afgekeurd</Badge>;
    case "verwerkt":    return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Verwerkt</Badge>;
    default:            return <Badge variant="outline">{status}</Badge>;
  }
}

function bedragTekst(cents: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function categorieTekst(cat: string) {
  return CATEGORIEEN.find(c => c.value === cat)?.label ?? cat;
}

function DeclaratieRij({ declaratie }: { declaratie: Declaratie }) {
  return (
    <Link href={`/declaraties/${declaratie.id}`}>
      <div className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{declaratie.medewerker_naam}</span>
            <Badge variant="secondary" className="text-xs">{categorieTekst(declaratie.categorie)}</Badge>
            {statusBadge(declaratie.status)}
            {declaratie.status === "ingediend" && declaratie.doorgezet_naar_naam && (
              <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-200">
                Doorgezet naar {declaratie.doorgezet_naar_naam}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-xs mt-0.5 truncate">{declaratie.omschrijving}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Datum: {declaratie.datum}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-semibold text-sm">{bedragTekst(declaratie.bedrag_totaal_cents)}</p>
          {declaratie.ingediend_op && (
            <p className="text-xs text-muted-foreground">
              Ingediend {new Date(declaratie.ingediend_op).toLocaleDateString("nl-NL")}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

export function NieuweDeclaratieDialog({ open, onSluit, naOpslaan }: { open: boolean; onSluit: () => void; naOpslaan?: () => Promise<unknown> }) {
  const queryClient = useQueryClient();
  const { mutateAsync, isPending } = useCreateDeclaratie();
  const [categorie, setCategorie] = useState<DeclaratieInputCategorie>("reiskosten");
  const [omschrijving, setOmschrijving] = useState("");
  const [bedrag, setBedrag] = useState("");
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));

  async function opslaan() {
    if (!categorie || !omschrijving || !bedrag || !datum) return;
    const bedragCents = Math.round(parseFloat(bedrag.replace(",", ".")) * 100);
    if (isNaN(bedragCents) || bedragCents <= 0) return;
    await mutateAsync({ data: { categorie, omschrijving, bedrag_totaal_cents: bedragCents, datum } });
    await queryClient.invalidateQueries({ queryKey: getListDeclaratiesQueryKey() });
    if (naOpslaan) await naOpslaan();
    setCategorie("reiskosten"); setOmschrijving(""); setBedrag(""); setDatum(new Date().toISOString().slice(0, 10));
    onSluit();
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onSluit(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nieuwe declaratie</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Categorie</Label>
            <Select value={categorie} onValueChange={v => setCategorie(v as DeclaratieInputCategorie)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Kies categorie" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIEEN.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Omschrijving</Label>
            <Textarea
              className="mt-1"
              value={omschrijving}
              onChange={e => setOmschrijving(e.target.value)}
              placeholder="Waarvoor zijn de kosten gemaakt?"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Bedrag (euro)</Label>
              <Input
                className="mt-1"
                value={bedrag}
                onChange={e => setBedrag(e.target.value)}
                placeholder="0,00"
                type="text"
                inputMode="decimal"
              />
            </div>
            <div>
              <Label>Datum kosten</Label>
              <Input
                className="mt-1"
                type="date"
                value={datum}
                onChange={e => setDatum(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onSluit} disabled={isPending}>Annuleren</Button>
          <Button
            onClick={opslaan}
            disabled={isPending || !categorie || !omschrijving || !bedrag}
          >
            {isPending ? "Opslaan..." : "Opslaan als concept"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DeclaratiesPagina() {
  const { heeftNiveau } = useBevoegdheid();
  const [tabblad, setTabblad] = useState("alles");
  const [nieuwOpen, setNieuwOpen] = useState(false);

  const magIndienen   = heeftNiveau("declaraties", 2);
  const magBeoordelen = heeftNiveau("declaraties", 3);
  const magVerwerken  = heeftNiveau("declaraties", 4);

  const { data: declaraties = [], isLoading } = useListDeclaraties({
    query: { queryKey: getListDeclaratiesQueryKey() },
  });

  const { data: beleid } = useGetDeclaratieBeleid();

  const gefilterd = tabblad === "alles"
    ? declaraties
    : tabblad === "te_beoordelen"
    ? declaraties.filter(d => d.status === "ingediend")
    : tabblad === "goedgekeurd"
    ? declaraties.filter(d => d.status === "goedgekeurd")
    : tabblad === "verwerkt"
    ? declaraties.filter(d => d.status === "verwerkt")
    : tabblad === "afgekeurd"
    ? declaraties.filter(d => d.status === "afgekeurd")
    : declaraties;

  const telIngediend   = declaraties.filter(d => d.status === "ingediend").length;
  const telGoedgekeurd = declaraties.filter(d => d.status === "goedgekeurd").length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PaginaHulp pagina="declaraties" />
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6" />
            Declaraties
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Onkostendeclaraties indienen, beoordelen en verwerken
          </p>
        </div>
        {magIndienen && (
          <Button onClick={() => setNieuwOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nieuwe declaratie
          </Button>
        )}
      </div>

      {beleid?.inhoud && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold text-amber-800">Declaratiebeleid</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="text-sm text-amber-700 whitespace-pre-line">{beleid.inhoud}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="text-center p-4">
          <p className="text-2xl font-bold">{declaraties.filter(d => d.status === "concept").length}</p>
          <p className="text-xs text-muted-foreground mt-1">Concept</p>
        </Card>
        <Card className="text-center p-4">
          <p className="text-2xl font-bold text-amber-600">{telIngediend}</p>
          <p className="text-xs text-muted-foreground mt-1">Ter beoordeling</p>
        </Card>
        <Card className="text-center p-4">
          <p className="text-2xl font-bold text-green-600">{telGoedgekeurd}</p>
          <p className="text-xs text-muted-foreground mt-1">Goedgekeurd</p>
        </Card>
        <Card className="text-center p-4">
          <p className="text-2xl font-bold text-blue-600">{declaraties.filter(d => d.status === "verwerkt").length}</p>
          <p className="text-xs text-muted-foreground mt-1">Verwerkt</p>
        </Card>
      </div>

      <Tabs value={tabblad} onValueChange={setTabblad}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="alles">Alles ({declaraties.length})</TabsTrigger>
          {magBeoordelen && (
            <TabsTrigger value="te_beoordelen" className="gap-1.5">
              Ter beoordeling
              {telIngediend > 0 && (
                <Badge className="h-4 min-w-4 px-1 text-[10px] leading-none bg-primary text-primary-foreground">
                  {telIngediend}
                </Badge>
              )}
            </TabsTrigger>
          )}
          {magVerwerken && (
            <TabsTrigger value="goedgekeurd" className="gap-1.5">
              Goedgekeurd
              {telGoedgekeurd > 0 && (
                <Badge className="h-4 min-w-4 px-1 text-[10px] leading-none bg-primary text-primary-foreground">
                  {telGoedgekeurd}
                </Badge>
              )}
            </TabsTrigger>
          )}
          <TabsTrigger value="verwerkt">Verwerkt</TabsTrigger>
          <TabsTrigger value="afgekeurd">Afgekeurd</TabsTrigger>
        </TabsList>

        <TabsContent value={tabblad} className="mt-4">
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Laden...</p>
          ) : gefilterd.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Receipt className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="font-medium">Geen declaraties gevonden</p>
              {magIndienen && tabblad === "alles" && (
                <Button variant="outline" className="mt-4 gap-2" onClick={() => setNieuwOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Eerste declaratie indienen
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {gefilterd.map(d => (
                <DeclaratieRij key={d.id} declaratie={d} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <NieuweDeclaratieDialog open={nieuwOpen} onSluit={() => setNieuwOpen(false)} />
    </div>
  );
}
