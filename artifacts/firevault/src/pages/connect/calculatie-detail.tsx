import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCalculatie,
  useUpdateCalculatie,
  useDeleteCalculatie,
  useCreateCalculatieRegel,
  useUpdateCalculatieRegel,
  useDeleteCalculatieRegel,
  getListCalculatiesQueryKey,
  getGetCalculatieQueryKey,
} from "@workspace/api-client-react";
import type { CalculatieRegelInput } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Calculator, ArrowLeft, Plus, Trash2, Pencil, Check, X,
  Euro, Layers, Package, Settings, HelpCircle,
} from "lucide-react";

const CATEGORIE_OPTIES = [
  { value: "arbeid", label: "Arbeid", icon: Settings },
  { value: "materiaal", label: "Materiaal", icon: Package },
  { value: "overhead", label: "Overhead", icon: Layers },
  { value: "overig", label: "Overig", icon: HelpCircle },
];

const STATUS_OPTIES = [
  { value: "concept", label: "Concept" },
  { value: "definitief", label: "Definitief" },
];

function formatBedrag(n: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
}

type NieuweRegel = Partial<CalculatieRegelInput>;

export default function ConnectCalculatieDetail() {
  const { id } = useParams<{ id: string }>();
  const cId = Number(id);
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [verwijderOpen, setVerwijderOpen] = useState(false);
  const [bewerkt, setBewerkt] = useState(false);
  const [naamEdit, setNaamEdit] = useState("");
  const [statusEdit, setStatusEdit] = useState("concept");
  const [omschrEdit, setOmschrEdit] = useState("");
  const [nieuweRegel, setNieuweRegel] = useState<NieuweRegel>({});
  const [toevoegenOpen, setToevoegenOpen] = useState(false);
  const [regelBewerkenId, setRegelBewerkenId] = useState<number | null>(null);
  const [regelEdit, setRegelEdit] = useState<NieuweRegel>({});

  const { data, isLoading, error } = useGetCalculatie(cId);
  const { mutateAsync: bijwerken, isPending: opslaan } = useUpdateCalculatie();
  const { mutateAsync: verwijderen, isPending: verwijderenBezig } = useDeleteCalculatie();
  const { mutateAsync: regelAanmaken, isPending: regelAanmaakBezig } = useCreateCalculatieRegel();
  const { mutateAsync: regelBijwerken, isPending: regelEditBezig } = useUpdateCalculatieRegel();
  const { mutateAsync: regelVerwijderen } = useDeleteCalculatieRegel();

  const inv = async () => {
    await qc.invalidateQueries({ queryKey: getGetCalculatieQueryKey(cId) });
    await qc.invalidateQueries({ queryKey: getListCalculatiesQueryKey() });
  };

  function startBewerken() {
    if (!data) return;
    setNaamEdit(data.naam);
    setStatusEdit(data.status);
    setOmschrEdit(data.omschrijving ?? "");
    setBewerkt(true);
  }

  async function opslaanBewerken() {
    if (!naamEdit.trim()) return;
    try {
      await bijwerken({ id: cId, data: { naam: naamEdit.trim(), status: statusEdit, omschrijving: omschrEdit || null } });
      await inv();
      setBewerkt(false);
      toast({ title: "Opgeslagen" });
    } catch {
      toast({ title: "Fout bij opslaan", variant: "destructive" });
    }
  }

  async function verwijderCalculatie() {
    try {
      await verwijderen({ id: cId });
      await qc.invalidateQueries({ queryKey: getListCalculatiesQueryKey() });
      nav("/connect/calculatie");
    } catch {
      toast({ title: "Fout bij verwijderen", variant: "destructive" });
    }
  }

  async function regelOpslaan() {
    if (!nieuweRegel.omschrijving?.trim()) return;
    const h = Number(nieuweRegel.hoeveelheid ?? 0);
    const p = Number(nieuweRegel.stukprijs ?? 0);
    try {
      await regelAanmaken({
        id: cId,
        data: {
          categorie: nieuweRegel.categorie ?? "arbeid",
          omschrijving: nieuweRegel.omschrijving.trim(),
          eenheid: nieuweRegel.eenheid ?? "st",
          hoeveelheid: h,
          stukprijs: p,
        },
      });
      await inv();
      setNieuweRegel({});
      setToevoegenOpen(false);
      toast({ title: "Regel toegevoegd" });
    } catch {
      toast({ title: "Fout bij toevoegen", variant: "destructive" });
    }
  }

  async function regelOpslaanBewerken(regelId: number) {
    if (!regelEdit.omschrijving?.trim()) return;
    const h = Number(regelEdit.hoeveelheid ?? 0);
    const p = Number(regelEdit.stukprijs ?? 0);
    try {
      await regelBijwerken({
        id: cId,
        regelId,
        data: {
          categorie: regelEdit.categorie,
          omschrijving: regelEdit.omschrijving.trim(),
          eenheid: regelEdit.eenheid ?? "st",
          hoeveelheid: h,
          stukprijs: p,
        },
      });
      await inv();
      setRegelBewerkenId(null);
      toast({ title: "Regel bijgewerkt" });
    } catch {
      toast({ title: "Fout bij bijwerken", variant: "destructive" });
    }
  }

  async function regelVerwijderenFn(regelId: number) {
    try {
      await regelVerwijderen({ id: cId, regelId });
      await inv();
    } catch {
      toast({ title: "Fout bij verwijderen", variant: "destructive" });
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <Calculator className="h-8 w-8 mx-auto mb-3 opacity-30" />
        <p>Calculatie niet gevonden.</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => nav("/connect/calculatie")}>
          Terug naar overzicht
        </Button>
      </div>
    );
  }

  const regels = data.regels ?? [];
  const totaalPerCategorie: Record<string, number> = {};
  for (const r of regels) {
    totaalPerCategorie[r.categorie] = (totaalPerCategorie[r.categorie] ?? 0) + r.totaal;
  }
  const grandTotal = Object.values(totaalPerCategorie).reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-6">
      {/* Topbalk */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => nav("/connect/calculatie")} className="gap-1">
          <ArrowLeft className="h-4 w-4" />
          Terug
        </Button>
        <div className="flex-1 min-w-0">
          {bewerkt ? (
            <Input
              value={naamEdit}
              onChange={(e) => setNaamEdit(e.target.value)}
              className="text-xl font-bold h-9 max-w-md"
            />
          ) : (
            <h1 className="text-2xl font-bold tracking-tight truncate">{data.naam}</h1>
          )}
        </div>
        <div className="flex items-center gap-2">
          {bewerkt ? (
            <>
              <Button size="sm" onClick={opslaanBewerken} disabled={opslaan || !naamEdit.trim()}>
                <Check className="h-4 w-4 mr-1" />
                Opslaan
              </Button>
              <Button size="sm" variant="outline" onClick={() => setBewerkt(false)}>
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={startBewerken}>
                <Pencil className="h-4 w-4 mr-1" />
                Bewerken
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setVerwijderOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Meta */}
      <Card>
        <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Gebouw</p>
            <p className="text-sm font-medium">{data.gebouw_naam ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            {bewerkt ? (
              <Select value={statusEdit} onValueChange={setStatusEdit}>
                <SelectTrigger className="h-7 text-xs mt-0.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="outline" className="text-xs mt-0.5">
                {data.status === "definitief" ? "Definitief" : "Concept"}
              </Badge>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Aangemaakt door</p>
            <p className="text-sm font-medium">{data.aangemaakt_door_naam ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Totaal excl. btw</p>
            <p className="text-sm font-semibold text-primary">{formatBedrag(grandTotal)}</p>
          </div>
          {bewerkt && (
            <div className="col-span-2 md:col-span-4">
              <Label className="text-xs">Omschrijving</Label>
              <Textarea
                value={omschrEdit}
                onChange={(e) => setOmschrEdit(e.target.value)}
                className="mt-1 text-sm"
                rows={2}
                placeholder="Optionele toelichting..."
              />
            </div>
          )}
          {!bewerkt && data.omschrijving && (
            <div className="col-span-2 md:col-span-4">
              <p className="text-xs text-muted-foreground">Omschrijving</p>
              <p className="text-sm mt-0.5">{data.omschrijving}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Regels */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Begrotingsregels</CardTitle>
          <Button size="sm" onClick={() => setToevoegenOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Regel toevoegen
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          {regels.length === 0 && !toevoegenOpen ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nog geen regels. Voeg een begrotingsregel toe.
            </p>
          ) : (
            <div className="space-y-1">
              {/* Toevoeg-formulier */}
              {toevoegenOpen && (
                <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-3 mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nieuwe regel</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div>
                      <Label className="text-xs">Categorie</Label>
                      <Select
                        value={nieuweRegel.categorie ?? "arbeid"}
                        onValueChange={(v) => setNieuweRegel((r) => ({ ...r, categorie: v }))}
                      >
                        <SelectTrigger className="h-8 text-xs mt-0.5">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIE_OPTIES.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs">Omschrijving</Label>
                      <Input
                        className="h-8 text-sm mt-0.5"
                        placeholder="Bijv. Brandwerende deur plaatsen"
                        value={nieuweRegel.omschrijving ?? ""}
                        onChange={(e) => setNieuweRegel((r) => ({ ...r, omschrijving: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Eenheid</Label>
                      <Input
                        className="h-8 text-sm mt-0.5"
                        placeholder="st"
                        value={nieuweRegel.eenheid ?? ""}
                        onChange={(e) => setNieuweRegel((r) => ({ ...r, eenheid: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Hoeveelheid</Label>
                      <Input
                        className="h-8 text-sm mt-0.5"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0"
                        value={nieuweRegel.hoeveelheid ?? ""}
                        onChange={(e) => setNieuweRegel((r) => ({ ...r, hoeveelheid: Number(e.target.value) }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Stukprijs (euro)</Label>
                      <Input
                        className="h-8 text-sm mt-0.5"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0,00"
                        value={nieuweRegel.stukprijs ?? ""}
                        onChange={(e) => setNieuweRegel((r) => ({ ...r, stukprijs: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="text-right flex items-end justify-end">
                      <p className="text-sm font-semibold">
                        {formatBedrag((nieuweRegel.hoeveelheid ?? 0) * (nieuweRegel.stukprijs ?? 0))}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={regelOpslaan} disabled={regelAanmaakBezig || !nieuweRegel.omschrijving?.trim()}>
                      <Check className="h-3.5 w-3.5 mr-1" />
                      Toevoegen
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setToevoegenOpen(false); setNieuweRegel({}); }}>
                      Annuleren
                    </Button>
                  </div>
                </div>
              )}

              {/* Bestaande regels */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-left py-2 pr-4">Categorie</th>
                      <th className="text-left py-2 pr-4">Omschrijving</th>
                      <th className="text-right py-2 pr-4">Hoeveelheid</th>
                      <th className="text-left py-2 pr-4">Eenheid</th>
                      <th className="text-right py-2 pr-4">Stukprijs</th>
                      <th className="text-right py-2 pr-4">Totaal</th>
                      <th className="py-2 w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {regels.map((r) => (
                      regelBewerkenId === r.id ? (
                        <tr key={r.id} className="border-b bg-primary/5">
                          <td className="py-2 pr-2">
                            <Select
                              value={regelEdit.categorie ?? r.categorie}
                              onValueChange={(v) => setRegelEdit((e) => ({ ...e, categorie: v }))}
                            >
                              <SelectTrigger className="h-7 text-xs w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CATEGORIE_OPTIES.map((o) => (
                                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-2 pr-2">
                            <Input
                              className="h-7 text-xs"
                              value={regelEdit.omschrijving ?? r.omschrijving}
                              onChange={(e) => setRegelEdit((e2) => ({ ...e2, omschrijving: e.target.value }))}
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <Input
                              className="h-7 text-xs text-right w-20"
                              type="number"
                              min="0"
                              value={regelEdit.hoeveelheid ?? r.hoeveelheid}
                              onChange={(e) => setRegelEdit((e2) => ({ ...e2, hoeveelheid: Number(e.target.value) }))}
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <Input
                              className="h-7 text-xs w-16"
                              value={regelEdit.eenheid ?? r.eenheid}
                              onChange={(e) => setRegelEdit((e2) => ({ ...e2, eenheid: e.target.value }))}
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <Input
                              className="h-7 text-xs text-right w-24"
                              type="number"
                              min="0"
                              step="0.01"
                              value={regelEdit.stukprijs ?? r.stukprijs}
                              onChange={(e) => setRegelEdit((e2) => ({ ...e2, stukprijs: Number(e.target.value) }))}
                            />
                          </td>
                          <td className="py-2 pr-2 text-right font-medium">
                            {formatBedrag((regelEdit.hoeveelheid ?? r.hoeveelheid) * (regelEdit.stukprijs ?? r.stukprijs))}
                          </td>
                          <td className="py-2">
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => regelOpslaanBewerken(r.id)} disabled={regelEditBezig}>
                                <Check className="h-3 w-3" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setRegelBewerkenId(null)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={r.id} className="border-b hover:bg-accent/20 group">
                          <td className="py-2 pr-4">
                            <Badge variant="outline" className="text-xs font-normal">
                              {CATEGORIE_OPTIES.find((o) => o.value === r.categorie)?.label ?? r.categorie}
                            </Badge>
                          </td>
                          <td className="py-2 pr-4 max-w-xs truncate">{r.omschrijving}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{r.hoeveelheid}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{r.eenheid}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{formatBedrag(r.stukprijs)}</td>
                          <td className="py-2 pr-4 text-right font-medium tabular-nums">{formatBedrag(r.totaal)}</td>
                          <td className="py-2">
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => { setRegelBewerkenId(r.id); setRegelEdit({ categorie: r.categorie, omschrijving: r.omschrijving, eenheid: r.eenheid, hoeveelheid: r.hoeveelheid, stukprijs: r.stukprijs }); }}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 hover:text-destructive"
                                onClick={() => regelVerwijderenFn(r.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
        {regels.length > 0 && (
          <CardFooter className="border-t pt-4 flex flex-wrap gap-4">
            {CATEGORIE_OPTIES.filter((o) => totaalPerCategorie[o.value]).map((o) => (
              <div key={o.value} className="text-sm">
                <span className="text-muted-foreground">{o.label}: </span>
                <span className="font-medium">{formatBedrag(totaalPerCategorie[o.value])}</span>
              </div>
            ))}
            <div className="ml-auto text-sm font-bold">
              Totaal excl. btw: {formatBedrag(grandTotal)}
            </div>
          </CardFooter>
        )}
      </Card>

      <AlertDialog open={verwijderOpen} onOpenChange={setVerwijderOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Calculatie verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Alle begrotingsregels van "{data.naam}" worden permanent verwijderd.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={verwijderCalculatie} disabled={verwijderenBezig}>
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
