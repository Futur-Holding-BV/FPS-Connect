import { useState } from "react";
import { Link } from "wouter";
import {
  useListOnderhandenWerk,
  useUpdateOnderhandenWerkOverride,
} from "@workspace/api-client-react";
import type { OnderhandenWerkItem } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Calculator, Edit2, ExternalLink, TrendingDown, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const eur = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const pct = (n: number | null | undefined) =>
  n == null ? "—" : `${n.toFixed(0)}%`;

const METHODE_LABELS: Record<string, string> = {
  percentage_gereed: "% gereed",
  werkelijke_kosten: "Werkelijke kosten",
  handmatig: "Handmatig",
  ai_voorstel: "AI-voorstel",
};

const statusKleur: Record<string, string> = {
  actief: "bg-green-100 text-green-800",
  afgerond: "bg-blue-100 text-blue-800",
  gepauzeerd: "bg-yellow-100 text-yellow-800",
  geannuleerd: "bg-gray-100 text-gray-600",
};

function EditSheet({
  item,
  open,
  onClose,
}: {
  item: OnderhandenWerkItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const mutation = useUpdateOnderhandenWerkOverride();

  const [methode, setMethode] = useState(item?.waarderingsmethode ?? "percentage_gereed");
  const [percentage, setPercentage] = useState<string>(
    item?.percentage_gereed != null ? String(item.percentage_gereed) : ""
  );
  const [handmatigBedrag, setHandmatigBedrag] = useState<string>("");
  const [opmerkingen, setOpmerkingen] = useState(item?.opmerkingen ?? "");

  if (!item) return null;

  const opslaan = () => {
    mutation.mutate(
      {
        opdrachtId: item.opdracht_id,
        data: {
          waarderingsmethode: methode as "percentage_gereed" | "werkelijke_kosten" | "handmatig" | "ai_voorstel",
          percentage_gereed: percentage !== "" ? Number(percentage) : null,
          handmatig_bedrag: handmatigBedrag !== "" ? Number(handmatigBedrag) : null,
          opmerkingen: opmerkingen || null,
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["listOnderhandenWerk"] });
          toast({ title: "Instellingen opgeslagen" });
          onClose();
        },
        onError: () => toast({ title: "Fout bij opslaan", variant: "destructive" }),
      }
    );
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{item.titel}</SheetTitle>
          <SheetDescription>Onderhanden werk — voortgang en waardering</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 mt-6">
          <div className="space-y-2">
            <Label>Waarderingsmethode</Label>
            <Select value={methode} onValueChange={setMethode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage_gereed">Percentage gereed (basis)</SelectItem>
                <SelectItem value="werkelijke_kosten">Werkelijke kosten + opslag</SelectItem>
                <SelectItem value="handmatig">Handmatig bedrag</SelectItem>
                <SelectItem value="ai_voorstel">AI-voorstel (op basis van uren)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(methode === "percentage_gereed" || methode === "ai_voorstel") && (
            <div className="space-y-2">
              <Label>Percentage gereed (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={5}
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
                placeholder="bijv. 65"
              />
              <p className="text-xs text-muted-foreground">
                Laat leeg voor automatische schatting op basis van geboekte uren.
              </p>
            </div>
          )}

          {methode === "handmatig" && (
            <div className="space-y-2">
              <Label>Handmatig bedrag (waarde geleverde prestatie excl. BTW)</Label>
              <Input
                type="number"
                min={0}
                step={100}
                value={handmatigBedrag}
                onChange={(e) => setHandmatigBedrag(e.target.value)}
                placeholder="bijv. 12500"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Opmerkingen</Label>
            <Textarea
              value={opmerkingen}
              onChange={(e) => setOpmerkingen(e.target.value)}
              placeholder="Optionele toelichting voor de jaarrekening..."
              rows={3}
            />
          </div>
        </div>

        <SheetFooter className="mt-8">
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button onClick={opslaan} disabled={mutation.isPending}>
            {mutation.isPending ? "Opslaan..." : "Opslaan"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default function OnderhandenWerkPagina() {
  const vandaag = new Date().toISOString().slice(0, 10);
  const [peildatum, setPeildatum] = useState(vandaag);
  const [statusFilter, setStatusFilter] = useState("actief");
  const [editItem, setEditItem] = useState<OnderhandenWerkItem | null>(null);

  const { data: items = [], isLoading } = useListOnderhandenWerk({
    peildatum,
    status: statusFilter === "alle" ? undefined : statusFilter,
  });

  const totaalOhw = items.reduce((s, i) => s + i.waarde_ohw, 0);
  const totaalGefactureerd = items.reduce((s, i) => s + i.gefactureerd, 0);
  const totaalNogTeFact = items.reduce((s, i) => s + i.nog_te_factureren, 0);
  const aantalSignaleringen = items.filter((i) => i.signaleringen.length > 0).length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Onderhanden werk</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Financieel voortgangsoverzicht per project — peildatum bepaalt welke uren en facturen meegenomen worden.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Label className="text-sm whitespace-nowrap">Peildatum</Label>
          <Input
            type="date"
            value={peildatum}
            onChange={(e) => setPeildatum(e.target.value)}
            className="w-40"
          />
          <Button variant="outline" asChild>
            <Link href="/financieel/jaarrekening">Jaarrekening</Link>
          </Button>
        </div>
      </div>

      {/* Samenvattingskaarten */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Waarde OHW</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{eur(totaalOhw)}</p>
            <p className="text-xs text-muted-foreground mt-1">{items.length} projecten</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Gefactureerd</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{eur(totaalGefactureerd)}</p>
            <TrendingUp className="h-4 w-4 text-green-600 mt-1" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Nog te factureren</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{eur(totaalNogTeFact)}</p>
            <TrendingDown className="h-4 w-4 text-orange-500 mt-1" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Signaleringen</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{aantalSignaleringen}</p>
            {aantalSignaleringen > 0 && (
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-1" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Statusfilter */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="actief">Actief</TabsTrigger>
          <TabsTrigger value="afgerond">Afgerond</TabsTrigger>
          <TabsTrigger value="alle">Alle</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Tabel */}
      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Opdrachtsom</TableHead>
              <TableHead className="text-right">Begrote kosten</TableHead>
              <TableHead className="text-right">Geboekte kosten</TableHead>
              <TableHead className="text-right">Uren</TableHead>
              <TableHead className="text-right">Gefactureerd</TableHead>
              <TableHead className="text-right">Nog te fact.</TableHead>
              <TableHead className="text-right">Voortgang</TableHead>
              <TableHead className="text-right font-semibold">Waarde OHW</TableHead>
              <TableHead>Signaleringen</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                  Laden...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                  Geen projecten gevonden voor deze peildatum en filter.
                </TableCell>
              </TableRow>
            )}
            {items.map((item) => (
              <TableRow key={item.opdracht_id} className={item.signaleringen.length > 0 ? "bg-amber-50/50" : ""}>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm">{item.titel}</span>
                      <Link href={`/opdrachten/${item.opdracht_id}`}>
                        <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                      </Link>
                    </div>
                    {item.werknummer && (
                      <span className="text-xs text-muted-foreground">{item.werknummer}</span>
                    )}
                    {item.gebouw_naam && (
                      <span className="text-xs text-muted-foreground">{item.gebouw_naam}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusKleur[item.opdracht_status] ?? "bg-gray-100 text-gray-600"}`}>
                    {item.opdracht_status}
                  </span>
                </TableCell>
                <TableCell className="text-right text-sm">{eur(item.opdrachtsom)}</TableCell>
                <TableCell className="text-right text-sm">{eur(item.begrote_kosten)}</TableCell>
                <TableCell className="text-right text-sm">
                  {eur(item.geboekte_kosten_inkoop)}
                </TableCell>
                <TableCell className="text-right text-sm">
                  {item.geboekte_uren > 0 ? `${item.geboekte_uren.toFixed(1)} u` : "—"}
                </TableCell>
                <TableCell className="text-right text-sm">{eur(item.gefactureerd)}</TableCell>
                <TableCell className="text-right text-sm">{eur(item.nog_te_factureren)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-sm font-medium">{pct(item.percentage_gereed)}</span>
                    <span className="text-xs text-muted-foreground">
                      {METHODE_LABELS[item.waarderingsmethode] ?? item.waarderingsmethode}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <span className={`text-sm font-semibold ${item.waarde_ohw > 0 ? "text-orange-600" : "text-muted-foreground"}`}>
                    {eur(item.waarde_ohw)}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {item.signaleringen.map((s) => (
                      <Badge key={s} variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setEditItem(item)}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <EditSheet item={editItem} open={!!editItem} onClose={() => setEditItem(null)} />
    </div>
  );
}
