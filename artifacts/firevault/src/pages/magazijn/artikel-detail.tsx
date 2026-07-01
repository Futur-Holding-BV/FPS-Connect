import { useRoute, Link } from "wouter";
import { useGetMagazijnArtikel, useListVoorraad, useListVoorraadMutaties, useListReserveringen, useUpdateMagazijnArtikel, useListMagazijnLocaties } from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Package, AlertTriangle, ArrowUp, ArrowDown, Minus, Tag } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

function formatBedrag(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
}

function formatDatum(iso: string) {
  return new Date(iso).toLocaleString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const TYPE_KLEUR: Record<string, string> = {
  inkoop: "bg-green-100 text-green-800",
  uitgifte: "bg-red-100 text-red-800",
  retour: "bg-blue-100 text-blue-800",
  correctie: "bg-amber-100 text-amber-800",
  reservering: "bg-purple-100 text-purple-800",
  vrijgave: "bg-gray-100 text-gray-700",
};

const TYPE_LABELS: Record<string, string> = {
  inkoop: "Inkoop", uitgifte: "Uitgifte", retour: "Retour",
  correctie: "Correctie", reservering: "Reservering", vrijgave: "Vrijgave",
};

export default function MagazijnArtikelDetailPagina() {
  const [, params] = useRoute("/magazijn/artikelen/:id");
  const artikelId = Number(params?.id ?? 0);
  const { heeftNiveau } = useBevoegdheid();
  const kanSchrijven = heeftNiveau("magazijn", 2);
  const { toast } = useToast();

  const { data: artikel, isLoading, refetch } = useGetMagazijnArtikel(artikelId);
  const { data: voorraadRijen = [] } = useListVoorraad({ artikel_id: artikelId });
  const { data: mutaties = [] } = useListVoorraadMutaties({ artikel_id: artikelId, limit: 50 });
  const { data: reserveringen = [] } = useListReserveringen({ artikel_id: artikelId, status: "open" });
  const { data: locaties = [] } = useListMagazijnLocaties();
  const { mutate: bijwerken, isPending } = useUpdateMagazijnArtikel({ mutation: { onSuccess: () => { void refetch(); setIsEditing(false); toast({ title: "Opgeslagen" }); } } });

  const [isEditing, setIsEditing] = useState(false);
  const [eMinimum, setEMinimum] = useState("");
  const [eGewenst, setEGewenst] = useState("");
  const [eBarcode, setEBarcode] = useState("");
  const [eLocatieId, setELocatieId] = useState("");
  const [eMerk, setEMerk] = useState("");

  function startEdit() {
    setEMinimum(String(artikel?.minimum_voorraad ?? ""));
    setEGewenst(String(artikel?.gewenste_voorraad ?? ""));
    setEBarcode(artikel?.barcode ?? "");
    setELocatieId(String(artikel?.locatie_id ?? ""));
    setEMerk(artikel?.merk ?? "");
    setIsEditing(true);
  }

  const totaalHoeveelheid = voorraadRijen.reduce((s, v) => s + (v.hoeveelheid ?? 0), 0);
  const totaalGereserveerd = voorraadRijen.reduce((s, v) => s + (v.gereserveerd ?? 0), 0);
  const totaalVrij = voorraadRijen.reduce((s, v) => s + (v.vrij ?? 0), 0);
  const onderMinimum = artikel?.minimum_voorraad != null && totaalHoeveelheid < artikel.minimum_voorraad;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!artikel) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Artikel niet gevonden.</p>
        <Link href="/magazijn/artikelen">
          <Button variant="link" className="pl-0 mt-2"><ArrowLeft className="h-4 w-4 mr-1" /> Terug naar overzicht</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Navigatie */}
      <div className="flex items-center gap-3">
        <Link href="/magazijn/artikelen">
          <Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Terug</Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6 text-muted-foreground" />
            {artikel.naam}
            {artikel.code && <span className="text-base text-muted-foreground font-normal">({artikel.code})</span>}
          </h1>
          {artikel.leverancier_naam && <p className="text-sm text-muted-foreground">{artikel.leverancier_naam}</p>}
        </div>
        <Link href={`/magazijn/artikelen/${artikelId}/label`}>
          <Button variant="outline" size="sm">
            <Tag className="h-4 w-4 mr-1.5" />
            QR-label afdrukken
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Links: info + magazijn-instellingen */}
        <div className="lg:col-span-2 space-y-6">
          {/* Voorraadstatus */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                Voorraadstatus
                {onderMinimum && <Badge variant="destructive" className="text-xs flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Onder minimum</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-3xl font-bold">{totaalHoeveelheid}</p>
                  <p className="text-xs text-muted-foreground">Actueel</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-amber-700">{totaalGereserveerd}</p>
                  <p className="text-xs text-muted-foreground">Gereserveerd</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-green-700">{totaalVrij}</p>
                  <p className="text-xs text-muted-foreground">Vrij beschikbaar</p>
                </div>
              </div>
              {artikel.minimum_voorraad != null && (
                <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">
                  Minimumvoorraad: <strong>{artikel.minimum_voorraad}</strong> {artikel.eenheid}
                  {artikel.gewenste_voorraad != null && <> · Gewenst: <strong>{artikel.gewenste_voorraad}</strong> {artikel.eenheid}</>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Voorraad per locatie */}
          {voorraadRijen.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Voorraad per locatie</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-left py-1.5">Locatie</th>
                      <th className="text-right py-1.5">Actueel</th>
                      <th className="text-right py-1.5">Gereserveerd</th>
                      <th className="text-right py-1.5">Vrij</th>
                    </tr>
                  </thead>
                  <tbody>
                    {voorraadRijen.map(v => {
                      const locatie = v.locatie_id ? locaties.find(l => l.id === v.locatie_id) : null;
                      return (
                        <tr key={v.id} className="border-b last:border-0">
                          <td className="py-2">{locatie?.naam ?? "Geen locatie"}</td>
                          <td className="py-2 text-right tabular-nums">{v.hoeveelheid}</td>
                          <td className="py-2 text-right tabular-nums text-amber-700">{v.gereserveerd}</td>
                          <td className="py-2 text-right tabular-nums font-medium">{v.vrij}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Openstaande reserveringen */}
          {reserveringen.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Openstaande reserveringen</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {reserveringen.map(r => (
                    <div key={r.id} className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm">
                      <span className="text-muted-foreground">#{r.id} {r.opdracht_titel ? `· ${r.opdracht_titel}` : ""}</span>
                      <Badge variant="secondary">{r.hoeveelheid} {artikel.eenheid}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Mutaties */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Laatste mutaties</CardTitle></CardHeader>
            <CardContent>
              {mutaties.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nog geen mutaties.</p>
              ) : (
                <div className="space-y-0">
                  {mutaties.map(m => (
                    <div key={m.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TYPE_KLEUR[m.type] ?? "bg-gray-100"}`}>
                          {TYPE_LABELS[m.type] ?? m.type}
                        </span>
                        <span className="text-xs text-muted-foreground">{formatDatum(m.aangemaakt_op)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {m.omschrijving && <span className="text-xs text-muted-foreground">{m.omschrijving}</span>}
                        <span className={`tabular-nums text-sm font-medium flex items-center gap-0.5 ${m.delta > 0 ? "text-green-700" : m.delta < 0 ? "text-red-700" : "text-muted-foreground"}`}>
                          {m.delta > 0 ? <ArrowUp className="h-3 w-3" /> : m.delta < 0 ? <ArrowDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                          {m.delta > 0 ? "+" : ""}{m.delta}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Rechts: artikel-info + magazijn-instellingen */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Artikel-informatie</CardTitle>
                {!isEditing && kanSchrijven && (
                  <Button size="sm" variant="outline" onClick={startEdit}>Bewerken</Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Eenheid</span><span>{artikel.eenheid}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Categorie</span><span>{artikel.categorie ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Inkoopprijs</span><span>{formatBedrag(artikel.inkoopprijs)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Verkoopprijs</span><span>{formatBedrag(artikel.verkoopprijs)}</span></div>
              <Separator />
              {isEditing ? (
                <form onSubmit={e => {
                  e.preventDefault();
                  bijwerken({ id: artikelId, data: {
                    minimum_voorraad: eMinimum ? Number(eMinimum) : null,
                    gewenste_voorraad: eGewenst ? Number(eGewenst) : null,
                    barcode: eBarcode || null,
                    locatie_id: eLocatieId ? Number(eLocatieId) : null,
                    merk: eMerk || null,
                  }});
                }} className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Merk</Label>
                    <Input value={eMerk} onChange={e => setEMerk(e.target.value)} placeholder="Bijv. Rockwool" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Minimumvoorraad</Label>
                    <Input type="number" step="0.01" value={eMinimum} onChange={e => setEMinimum(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Gewenste voorraad</Label>
                    <Input type="number" step="0.01" value={eGewenst} onChange={e => setEGewenst(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Barcode</Label>
                    <Input value={eBarcode} onChange={e => setEBarcode(e.target.value)} placeholder="EAN / SKU" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Standaard locatie</Label>
                    <Select value={eLocatieId} onValueChange={setELocatieId}>
                      <SelectTrigger><SelectValue placeholder="Geen" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Geen</SelectItem>
                        {locaties.map(l => <SelectItem key={l.id} value={String(l.id)}>{l.naam}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button type="submit" size="sm" disabled={isPending}>Opslaan</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setIsEditing(false)}>Annuleren</Button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">Merk</span><span>{artikel.merk ?? "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Minimumvrd.</span><span>{artikel.minimum_voorraad ?? "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Gewenst</span><span>{artikel.gewenste_voorraad ?? "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Barcode</span><span className="font-mono text-xs">{artikel.barcode ?? "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Std. locatie</span>
                    <span>{artikel.locatie_id ? (locaties.find(l => l.id === artikel.locatie_id)?.naam ?? `#${artikel.locatie_id}`) : "—"}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Link href="/magazijn/uitgiftes" className="flex-1">
              <Button variant="outline" size="sm" className="w-full">Uitgifte registreren</Button>
            </Link>
            <Link href="/magazijn/retouren" className="flex-1">
              <Button variant="outline" size="sm" className="w-full">Retour registreren</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
