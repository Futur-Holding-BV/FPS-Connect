import { useState, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import {
  useGetModCalculatie,
  useUpdateModCalculatie,
  useDeleteModCalculatie,
  useDupliceerModCalculatie,
  useCreateModCalcRegel,
  useUpdateModCalcRegel,
  useDeleteModCalcRegel,
  useListModCalcNormtijden,
  useListModCalcTarieven,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Plus, Pencil, Trash2, Copy, ChevronRight,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const STATUS_LABEL: Record<string, string> = {
  concept: "Concept",
  intern_akkoord: "Intern akkoord",
  aangeboden: "Aangeboden",
  gewonnen: "Gewonnen",
  verloren: "Verloren",
};

const STATUS_KLEUR: Record<string, string> = {
  concept: "bg-slate-100 text-slate-700 border-slate-200",
  intern_akkoord: "bg-blue-100 text-blue-800 border-blue-200",
  aangeboden: "bg-amber-100 text-amber-800 border-amber-200",
  gewonnen: "bg-green-100 text-green-800 border-green-200",
  verloren: "bg-red-100 text-red-800 border-red-200",
};

const STATUS_WORKFLOW: Record<string, string[]> = {
  concept: ["intern_akkoord", "verloren"],
  intern_akkoord: ["aangeboden", "verloren"],
  aangeboden: ["gewonnen", "verloren"],
  gewonnen: [],
  verloren: ["concept"],
};

const CATEGORIE_LABEL: Record<string, string> = {
  arbeid: "Arbeid",
  materiaal: "Materiaal",
  onderaanneming: "Onderaanneming",
  materieel: "Materieel",
  overig: "Overig",
};

const CATEGORIE_KLEUR: Record<string, string> = {
  arbeid: "bg-blue-50 text-blue-700",
  materiaal: "bg-green-50 text-green-700",
  onderaanneming: "bg-purple-50 text-purple-700",
  materieel: "bg-orange-50 text-orange-700",
  overig: "bg-slate-50 text-slate-600",
};

function formatBedrag(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
}

function formatBedragKort(n: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

type RegelRow = {
  id: number;
  calculatie_id: number;
  categorie: string;
  omschrijving: string;
  normtijd_id?: number | null;
  normtijd_code?: string | null;
  eenheid: string;
  hoeveelheid: number;
  tarief: number;
  totaal: number;
  volgorde: number;
  opmerkingen?: string | null;
};

type RegelForm = {
  categorie: string;
  omschrijving: string;
  normtijd_id: string;
  eenheid: string;
  hoeveelheid: string;
  tarief: string;
  opmerkingen: string;
};

const LEGE_REGEL: RegelForm = {
  categorie: "arbeid",
  omschrijving: "",
  normtijd_id: "",
  eenheid: "st",
  hoeveelheid: "1",
  tarief: "0",
  opmerkingen: "",
};

export default function ModulesCalculatieDetail() {
  const [, params] = useRoute("/modules/calculatie/:id");
  const [, navigate] = useLocation();
  const id = params?.id ? parseInt(params.id, 10) : 0;

  const queryClient = useQueryClient();
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["mod-calculatie", id] });
  }, [queryClient, id]);

  const { data, isLoading } = useGetModCalculatie(id, {
    query: { queryKey: ["mod-calculatie", id], enabled: id > 0 },
  });
  const { data: normtijden = [] } = useListModCalcNormtijden({ query: { queryKey: ["mod-calc-normtijden"] } });
  const { data: tarieven = [] } = useListModCalcTarieven({ query: { queryKey: ["mod-calc-tarieven"] } });

  const updateMut = useUpdateModCalculatie({ mutation: { onSuccess: invalidate } });
  const deleteMut = useDeleteModCalculatie({ mutation: { onSuccess: () => navigate("/modules/calculatie") } });
  const dupliceerMut = useDupliceerModCalculatie({
    mutation: {
      onSuccess: (d) => {
        queryClient.invalidateQueries({ queryKey: ["mod-calculaties"] });
        navigate(`/modules/calculatie/${d.id}`);
      },
    },
  });
  const createRegelMut = useCreateModCalcRegel({ mutation: { onSuccess: invalidate } });
  const updateRegelMut = useUpdateModCalcRegel({ mutation: { onSuccess: invalidate } });
  const deleteRegelMut = useDeleteModCalcRegel({ mutation: { onSuccess: invalidate } });

  const [teVerwijderen, setTeVerwijderen] = useState(false);
  const [regelDialoog, setRegelDialoog] = useState<"nieuw" | number | null>(null);
  const [regelForm, setRegelForm] = useState<RegelForm>(LEGE_REGEL);
  const [bewerkenDialoog, setBewerkenDialoog] = useState(false);
  const [headerForm, setHeaderForm] = useState({
    naam: "", referentie: "", klant_naam: "", project_naam: "",
    status: "", omschrijving: "", opmerkingen: "",
    opslag_ak: 15, opslag_risico: 5, opslag_winst: 10, korting: 0,
  });

  function openNieuweRegel() {
    setRegelForm(LEGE_REGEL);
    setRegelDialoog("nieuw");
  }

  function openBewerkenRegel(r: RegelRow) {
    setRegelForm({
      categorie: r.categorie,
      omschrijving: r.omschrijving,
      normtijd_id: r.normtijd_id ? String(r.normtijd_id) : "",
      eenheid: r.eenheid,
      hoeveelheid: String(r.hoeveelheid),
      tarief: String(r.tarief),
      opmerkingen: r.opmerkingen ?? "",
    });
    setRegelDialoog(r.id);
  }

  function openBewerkenHeader() {
    if (!data) return;
    setHeaderForm({
      naam: data.naam,
      referentie: data.referentie ?? "",
      klant_naam: data.klant_naam ?? "",
      project_naam: data.project_naam ?? "",
      status: data.status,
      omschrijving: data.omschrijving ?? "",
      opmerkingen: data.opmerkingen ?? "",
      opslag_ak: data.opslag_ak,
      opslag_risico: data.opslag_risico,
      opslag_winst: data.opslag_winst,
      korting: data.korting,
    });
    setBewerkenDialoog(true);
  }

  function handleRegelOpslaan() {
    const hv = parseFloat(regelForm.hoeveelheid) || 0;
    const t = parseFloat(regelForm.tarief) || 0;
    const payload = {
      categorie: regelForm.categorie,
      omschrijving: regelForm.omschrijving,
      normtijd_id: regelForm.normtijd_id ? parseInt(regelForm.normtijd_id, 10) : null,
      eenheid: regelForm.eenheid,
      hoeveelheid: hv,
      tarief: t,
      opmerkingen: regelForm.opmerkingen || null,
    };
    if (regelDialoog === "nieuw") {
      createRegelMut.mutate({ id, data: payload });
    } else if (typeof regelDialoog === "number") {
      updateRegelMut.mutate({ id, regelId: regelDialoog, data: payload });
    }
    setRegelDialoog(null);
  }

  function handleStatusWijzigen(nieuweStatus: string) {
    if (!data) return;
    updateMut.mutate({ id, data: { naam: data.naam, status: nieuweStatus } });
  }

  function handleNormtijdKiezen(normtijdId: string) {
    if (!normtijdId) {
      setRegelForm((f) => ({ ...f, normtijd_id: "" }));
      return;
    }
    const nt = normtijden.find((n) => String(n.id) === normtijdId);
    if (nt) {
      const huidigTarief = parseFloat(regelForm.tarief) || 0;
      setRegelForm((f) => ({
        ...f,
        normtijd_id: normtijdId,
        omschrijving: f.omschrijving || nt.omschrijving,
        eenheid: nt.eenheid,
        hoeveelheid: String(f.hoeveelheid || 1),
        tarief: huidigTarief > 0 ? f.tarief : String(nt.uren_per_eenheid),
      }));
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Calculatie niet gevonden.
      </div>
    );
  }

  const regels: RegelRow[] = (data.regels ?? []) as RegelRow[];
  const subtotaal = regels.reduce((s, r) => s + r.totaal, 0);
  const akBedrag = subtotaal * (data.opslag_ak / 100);
  const risicoBedrag = subtotaal * (data.opslag_risico / 100);
  const winstBedrag = subtotaal * (data.opslag_winst / 100);
  const voorKorting = subtotaal + akBedrag + risicoBedrag + winstBedrag;
  const kortingBedrag = voorKorting * (data.korting / 100);
  const totaal = voorKorting - kortingBedrag;
  const totaalBtw = totaal * 1.21;

  const regelsByCategorie = Object.entries(CATEGORIE_LABEL).map(([cat, label]) => ({
    categorie: cat,
    label,
    regels: regels.filter((r) => r.categorie === cat).sort((a, b) => a.volgorde - b.volgorde),
  })).filter((g) => g.regels.length > 0);

  const volgendStatussen = STATUS_WORKFLOW[data.status] ?? [];

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Koptekst */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/modules/calculatie")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">{data.naam}</h1>
              <Badge className={`text-xs border ${STATUS_KLEUR[data.status] ?? STATUS_KLEUR.concept}`}>
                {STATUS_LABEL[data.status] ?? data.status}
              </Badge>
            </div>
            {data.referentie && (
              <p className="text-sm text-muted-foreground">{data.referentie}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {volgendStatussen.map((s) => (
            <Button
              key={s}
              variant={s === "verloren" ? "outline" : "default"}
              size="sm"
              onClick={() => handleStatusWijzigen(s)}
            >
              {STATUS_LABEL[s]}
              {s !== "verloren" && <ChevronRight className="h-3.5 w-3.5 ml-1" />}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={openBewerkenHeader}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Bewerken
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => dupliceerMut.mutate({ id })}
          >
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Dupliceren
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setTeVerwijderen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Hoofdinhoud */}
        <div className="col-span-2 space-y-5">
          {/* Projectgegevens */}
          <Card>
            <CardContent className="pt-5">
              <div className="grid grid-cols-3 gap-4 text-sm">
                {data.klant_naam && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Klant</p>
                    <p className="font-medium">{data.klant_naam}</p>
                  </div>
                )}
                {data.project_naam && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Project</p>
                    <p className="font-medium">{data.project_naam}</p>
                  </div>
                )}
                {data.gebouw_naam && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Gebouw</p>
                    <p className="font-medium">{data.gebouw_naam}</p>
                  </div>
                )}
                {data.aangemaakt_door_naam && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Aangemaakt door</p>
                    <p className="font-medium">{data.aangemaakt_door_naam}</p>
                  </div>
                )}
              </div>
              {data.omschrijving && (
                <p className="text-sm text-muted-foreground mt-3 pt-3 border-t">{data.omschrijving}</p>
              )}
            </CardContent>
          </Card>

          {/* Regels */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Calculatieregels</CardTitle>
                <Button size="sm" onClick={openNieuweRegel}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Regel toevoegen
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {regels.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <p className="text-sm">Nog geen regels toegevoegd.</p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={openNieuweRegel}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Eerste regel toevoegen
                  </Button>
                </div>
              ) : (
                <div>
                  {regelsByCategorie.map(({ categorie, label, regels: catRegels }) => (
                    <div key={categorie}>
                      <div className={`px-6 py-2 text-xs font-semibold uppercase tracking-wide ${CATEGORIE_KLEUR[categorie]}`}>
                        {label}
                      </div>
                      <table className="w-full text-sm">
                        <colgroup>
                          <col className="w-[40%]" />
                          <col className="w-[10%]" />
                          <col className="w-[12%]" />
                          <col className="w-[12%]" />
                          <col className="w-[14%]" />
                          <col className="w-[12%]" />
                        </colgroup>
                        <thead>
                          <tr className="border-b text-xs text-muted-foreground">
                            <th className="px-6 py-2 text-left font-normal">Omschrijving</th>
                            <th className="px-3 py-2 text-center font-normal">Eenheid</th>
                            <th className="px-3 py-2 text-right font-normal">Hoeveelheid</th>
                            <th className="px-3 py-2 text-right font-normal">Tarief</th>
                            <th className="px-3 py-2 text-right font-normal">Totaal</th>
                            <th className="px-3 py-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {catRegels.map((r) => (
                            <tr key={r.id} className="hover:bg-slate-50 transition-colors group">
                              <td className="px-6 py-2.5">
                                <p className="font-medium text-slate-800">{r.omschrijving}</p>
                                {r.normtijd_code && (
                                  <p className="text-xs text-muted-foreground">{r.normtijd_code}</p>
                                )}
                                {r.opmerkingen && (
                                  <p className="text-xs text-muted-foreground italic">{r.opmerkingen}</p>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-center text-muted-foreground">{r.eenheid}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">{r.hoeveelheid}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">{formatBedrag(r.tarief)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums font-medium">{formatBedrag(r.totaal)}</td>
                              <td className="px-3 py-2.5 text-right">
                                <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    variant="ghost" size="icon" className="h-6 w-6"
                                    onClick={() => openBewerkenRegel(r)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost" size="icon" className="h-6 w-6 text-destructive"
                                    onClick={() => deleteRegelMut.mutate({ id, regelId: r.id })}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Rechterpaneel: opslagen + totalen */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Opslagen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {[
                { label: "Algemene kosten", pct: data.opslag_ak, bedrag: akBedrag },
                { label: "Risico", pct: data.opslag_risico, bedrag: risicoBedrag },
                { label: "Winst", pct: data.opslag_winst, bedrag: winstBedrag },
              ].map(({ label, pct, bedrag }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-muted-foreground">{label} ({pct}%)</span>
                  <span className="tabular-nums">{formatBedrag(bedrag)}</span>
                </div>
              ))}
              {data.korting > 0 && (
                <div className="flex justify-between items-center text-green-700">
                  <span>Korting ({data.korting}%)</span>
                  <span className="tabular-nums">- {formatBedrag(kortingBedrag)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-300">
            <CardContent className="pt-5 space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotaal</span>
                <span className="tabular-nums">{formatBedrag(subtotaal)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Opslagen</span>
                <span className="tabular-nums">{formatBedrag(akBedrag + risicoBedrag + winstBedrag - kortingBedrag)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold text-base">
                <span>Totaal excl. BTW</span>
                <span className="tabular-nums">{formatBedrag(totaal)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>BTW (21%)</span>
                <span className="tabular-nums">{formatBedrag(totaalBtw - totaal)}</span>
              </div>
              <div className="flex justify-between font-semibold text-primary">
                <span>Totaal incl. BTW</span>
                <span className="tabular-nums">{formatBedragKort(totaalBtw)}</span>
              </div>
            </CardContent>
          </Card>

          {data.opmerkingen && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Opmerkingen</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{data.opmerkingen}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Regelsdialoog */}
      <Dialog open={regelDialoog !== null} onOpenChange={() => setRegelDialoog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {regelDialoog === "nieuw" ? "Regel toevoegen" : "Regel bewerken"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Categorie</Label>
                <Select
                  value={regelForm.categorie}
                  onValueChange={(v) => setRegelForm((f) => ({ ...f, categorie: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORIE_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Normtijd (optioneel)</Label>
                <Select value={regelForm.normtijd_id} onValueChange={handleNormtijdKiezen}>
                  <SelectTrigger><SelectValue placeholder="Kies normtijd..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Geen normtijd</SelectItem>
                    {normtijden.map((n) => (
                      <SelectItem key={n.id} value={String(n.id)}>
                        {n.code} — {n.omschrijving}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Omschrijving *</Label>
              <Input
                value={regelForm.omschrijving}
                onChange={(e) => setRegelForm((f) => ({ ...f, omschrijving: e.target.value }))}
                placeholder="Beschrijving van de werkzaamheid of het materiaal"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Eenheid</Label>
                <Select
                  value={regelForm.eenheid}
                  onValueChange={(v) => setRegelForm((f) => ({ ...f, eenheid: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["st", "uur", "m", "m2", "m3", "dag", "lump_sum"].map((e) => (
                      <SelectItem key={e} value={e}>{e}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Hoeveelheid</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={regelForm.hoeveelheid}
                  onChange={(e) => setRegelForm((f) => ({ ...f, hoeveelheid: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tarief (€)</Label>
                <Select
                  value=""
                  onValueChange={(v) => {
                    const tar = tarieven.find((t) => String(t.id) === v);
                    if (tar) setRegelForm((f) => ({ ...f, tarief: String(tar.tarief) }));
                  }}
                >
                  <SelectTrigger className="mb-1"><SelectValue placeholder="Kies tarief..." /></SelectTrigger>
                  <SelectContent>
                    {tarieven.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.naam} — {formatBedrag(t.tarief)}/{t.eenheid}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={regelForm.tarief}
                  onChange={(e) => setRegelForm((f) => ({ ...f, tarief: e.target.value }))}
                  placeholder="Handmatig invullen"
                />
              </div>
            </div>

            {regelForm.hoeveelheid && regelForm.tarief && (
              <div className="rounded-md bg-slate-50 border px-4 py-2.5 text-sm flex justify-between">
                <span className="text-muted-foreground">Totaal</span>
                <span className="font-semibold">
                  {formatBedrag((parseFloat(regelForm.hoeveelheid) || 0) * (parseFloat(regelForm.tarief) || 0))}
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Opmerkingen</Label>
              <Input
                value={regelForm.opmerkingen}
                onChange={(e) => setRegelForm((f) => ({ ...f, opmerkingen: e.target.value }))}
                placeholder="Interne notitie bij deze regel"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegelDialoog(null)}>Annuleren</Button>
            <Button
              onClick={handleRegelOpslaan}
              disabled={!regelForm.omschrijving.trim() || createRegelMut.isPending || updateRegelMut.isPending}
            >
              {regelDialoog === "nieuw" ? "Toevoegen" : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bewerken header dialoog */}
      <Dialog open={bewerkenDialoog} onOpenChange={setBewerkenDialoog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Calculatie bewerken</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Naam *</Label>
              <Input value={headerForm.naam} onChange={(e) => setHeaderForm((f) => ({ ...f, naam: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Referentie</Label>
                <Input value={headerForm.referentie} onChange={(e) => setHeaderForm((f) => ({ ...f, referentie: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={headerForm.status} onValueChange={(v) => setHeaderForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Klant</Label>
                <Input value={headerForm.klant_naam} onChange={(e) => setHeaderForm((f) => ({ ...f, klant_naam: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Project</Label>
                <Input value={headerForm.project_naam} onChange={(e) => setHeaderForm((f) => ({ ...f, project_naam: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Omschrijving</Label>
              <Textarea rows={2} value={headerForm.omschrijving} onChange={(e) => setHeaderForm((f) => ({ ...f, omschrijving: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Opmerkingen (intern)</Label>
              <Textarea rows={2} value={headerForm.opmerkingen} onChange={(e) => setHeaderForm((f) => ({ ...f, opmerkingen: e.target.value }))} />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { field: "opslag_ak", label: "AK (%)" },
                { field: "opslag_risico", label: "Risico (%)" },
                { field: "opslag_winst", label: "Winst (%)" },
                { field: "korting", label: "Korting (%)" },
              ].map(({ field, label }) => (
                <div key={field} className="space-y-1.5">
                  <Label className="text-xs">{label}</Label>
                  <Input
                    type="number" step="0.5" min="0" max="100"
                    value={headerForm[field as keyof typeof headerForm]}
                    onChange={(e) => setHeaderForm((f) => ({ ...f, [field]: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBewerkenDialoog(false)}>Annuleren</Button>
            <Button
              onClick={() => {
                updateMut.mutate({ id, data: { ...headerForm } });
                setBewerkenDialoog(false);
              }}
              disabled={!headerForm.naam.trim()}
            >
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verwijder bevestiging */}
      <AlertDialog open={teVerwijderen} onOpenChange={setTeVerwijderen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Calculatie verwijderen</AlertDialogTitle>
            <AlertDialogDescription>
              Weet u zeker dat u deze calculatie en alle regels wilt verwijderen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMut.mutate({ id })}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
