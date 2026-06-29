// Uitvoeringsplanning tab — AI-gegenereerde fasen/taken per discipline
import { useState } from "react";
import {
  useGetUitvoeringsplanning,
  useGenereerUitvoeringsplanning,
  useVaststellenUitvoeringsplanning,
  usePatchUitvoeringsplanTaak,
  getGetUitvoeringsplanningQueryKey,
} from "@workspace/api-client-react";
import type { UitvoeringsplanTaak } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Check, CalendarCheck, Users, Clock, ChevronDown, ChevronUp, Edit2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const DISCIPLINE_KLEUREN: Record<string, string> = {
  "Brandweerring": "bg-rose-50 text-rose-800 border-rose-200",
  "Doorvoering": "bg-orange-50 text-orange-800 border-orange-200",
  "Brandklep": "bg-amber-50 text-amber-800 border-amber-200",
  "Manchet": "bg-yellow-50 text-yellow-800 border-yellow-200",
  "Coating": "bg-lime-50 text-lime-800 border-lime-200",
  "Branddeur": "bg-emerald-50 text-emerald-800 border-emerald-200",
  "Algemeen": "bg-slate-100 text-slate-700 border-slate-200",
};

function disciplineKleur(disc: string | null): string {
  if (!disc) return DISCIPLINE_KLEUREN["Algemeen"];
  return DISCIPLINE_KLEUREN[disc] ?? "bg-blue-50 text-blue-800 border-blue-200";
}

function uren(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toFixed(1)} u`;
}

interface TaakRijProps {
  taak: UitvoeringsplanTaak;
  opdrachtId: number;
}

function TaakRij({ taak, opdrachtId }: TaakRijProps) {
  const [open, setOpen] = useState(false);
  const [bewerkModus, setBewerkModus] = useState(false);
  const [omschrijving, setOmschrijving] = useState(taak.omschrijving);
  const [discipline, setDiscipline] = useState(taak.discipline ?? "");
  const [duurDagen, setDuurDagen] = useState(taak.duur_dagen != null ? String(taak.duur_dagen) : "");
  const [medewerkers, setMedewerkers] = useState(taak.benodigde_medewerkers != null ? String(taak.benodigde_medewerkers) : "");
  const [urenbegroting, setUrenbegroting] = useState(taak.urenbegroting != null ? String(taak.urenbegroting) : "");
  const [materiaalMoment, setMateriaalMoment] = useState(taak.materiaal_moment ?? "");
  const { toast } = useToast();
  const qc = useQueryClient();

  const patchMutatie = usePatchUitvoeringsplanTaak({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetUitvoeringsplanningQueryKey(opdrachtId) });
        setBewerkModus(false);
        toast({ title: "Taak bijgewerkt" });
      },
      onError: () => toast({ title: "Opslaan mislukt", variant: "destructive" }),
    },
  });

  function bewaar() {
    patchMutatie.mutate({
      id: opdrachtId,
      taakId: taak.id,
      data: {
        omschrijving: omschrijving || undefined,
        discipline: discipline || undefined,
        duur_dagen: duurDagen ? parseInt(duurDagen) : undefined,
        benodigde_medewerkers: medewerkers ? parseInt(medewerkers) : undefined,
        urenbegroting: urenbegroting ? parseFloat(urenbegroting) : undefined,
        materiaal_moment: materiaalMoment || undefined,
      },
    });
  }

  return (
    <div className="border rounded-md overflow-hidden">
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => !bewerkModus && setOpen(!open)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{taak.omschrijving}</span>
            {taak.discipline && (
              <Badge variant="outline" className={`text-xs ${disciplineKleur(taak.discipline)}`}>
                {taak.discipline}
              </Badge>
            )}
            {taak.ai_gegenereerd && <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            {taak.duur_dagen != null && (
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {taak.duur_dagen} dag{taak.duur_dagen !== 1 ? "en" : ""}</span>
            )}
            {taak.benodigde_medewerkers != null && (
              <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {taak.benodigde_medewerkers} pers.</span>
            )}
            {taak.urenbegroting != null && (
              <span>{uren(taak.urenbegroting)} begroot</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={e => { e.stopPropagation(); setBewerkModus(!bewerkModus); setOpen(true); }}
          >
            <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {open && (
        <div className="border-t bg-muted/20 p-3 space-y-3">
          {taak.ai_motivatie && !bewerkModus && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-2 text-xs text-amber-800">
              <Sparkles className="h-3 w-3 inline mr-1" />
              {taak.ai_motivatie}
            </div>
          )}
          {taak.materiaal_moment && !bewerkModus && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-2 text-xs text-blue-800">
              <strong>Materiaal:</strong> {taak.materiaal_moment}
            </div>
          )}

          {bewerkModus ? (
            <div className="space-y-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Omschrijving</label>
                <Input value={omschrijving} onChange={e => setOmschrijving(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Discipline</label>
                  <Input value={discipline} onChange={e => setDiscipline(e.target.value)} placeholder="bijv. Brandweerring" className="h-8 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Duur (dagen)</label>
                  <Input type="number" value={duurDagen} onChange={e => setDuurDagen(e.target.value)} min="1" className="h-8 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Medewerkers</label>
                  <Input type="number" value={medewerkers} onChange={e => setMedewerkers(e.target.value)} min="1" className="h-8 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Uren begroot</label>
                  <Input type="number" value={urenbegroting} onChange={e => setUrenbegroting(e.target.value)} step="0.5" className="h-8 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Materiaal-moment</label>
                <Input value={materiaalMoment} onChange={e => setMateriaalMoment(e.target.value)} placeholder="bijv. dag 1: staalplaten, dag 3: manchetten" className="h-8 text-sm" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setBewerkModus(false)}>Annuleren</Button>
                <Button size="sm" onClick={bewaar} disabled={patchMutatie.isPending}>
                  {patchMutatie.isPending ? "Opslaan..." : "Opslaan"}
                </Button>
              </div>
            </div>
          ) : (
            taak.opmerkingen && (
              <p className="text-xs text-muted-foreground">{taak.opmerkingen}</p>
            )
          )}
        </div>
      )}
    </div>
  );
}

interface UitvoeringsplanningTabProps {
  opdrachtId: number;
}

export default function UitvoeringsplanningTab({ opdrachtId }: UitvoeringsplanningTabProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: plan, isLoading, error } = useGetUitvoeringsplanning(opdrachtId);

  const genereerMutatie = useGenereerUitvoeringsplanning({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetUitvoeringsplanningQueryKey(opdrachtId) });
        toast({ title: "Uitvoeringsplanning gegenereerd" });
      },
      onError: () => toast({ title: "Genereren mislukt", variant: "destructive" }),
    },
  });

  const vaststellenMutatie = useVaststellenUitvoeringsplanning({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetUitvoeringsplanningQueryKey(opdrachtId) });
        toast({ title: "Uitvoeringsplanning gereedgemeld voor planning" });
      },
      onError: () => toast({ title: "Gereedmelden mislukt", variant: "destructive" }),
    },
  });

  const isGereed = plan?.status === "gereed_voor_planning";
  const taken = plan?.taken ?? [];

  // Groepeer op fase
  const fasenMap: Record<string, UitvoeringsplanTaak[]> = {};
  for (const t of taken) {
    const fase = t.fase ?? "Overige werkzaamheden";
    if (!fasenMap[fase]) fasenMap[fase] = [];
    fasenMap[fase].push(t);
  }

  const totaalUren = taken.reduce((a, t) => a + (t.urenbegroting ?? 0), 0);
  const totaalDagen = taken.reduce((a, t) => a + (t.duur_dagen ?? 0), 0);

  if (isLoading) {
    return (
      <div className="space-y-2 mt-4">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="mt-4">
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <CalendarCheck className="h-10 w-10 mx-auto opacity-30" />
            <p className="text-muted-foreground">Nog geen uitvoeringsplanning voor deze opdracht.</p>
            <p className="text-sm text-muted-foreground">
              AI maakt een concept uitvoeringsplanning op basis van de werkbegroting.
            </p>
            <Button
              onClick={() => genereerMutatie.mutate({ id: opdrachtId })}
              disabled={genereerMutatie.isPending}
            >
              <Sparkles className="h-4 w-4" />
              {genereerMutatie.isPending ? "Genereren..." : "AI Uitvoeringsplanning genereren"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Header + acties */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {plan.ai_gegenereerd && (
            <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-xs">
              <Sparkles className="h-3 w-3 mr-1" />
              AI gegenereerd
            </Badge>
          )}
          <Badge variant="outline" className={`text-xs ${isGereed ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-amber-50 text-amber-800 border-amber-200"}`}>
            {isGereed ? "Gereed voor planning" : "Concept"}
          </Badge>
          {plan.totaal_weken != null && (
            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-800 border-blue-200">
              <Clock className="h-3 w-3 mr-1" />
              {plan.totaal_weken} {plan.totaal_weken === 1 ? "week" : "weken"}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => genereerMutatie.mutate({ id: opdrachtId })}
            disabled={genereerMutatie.isPending || isGereed}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {genereerMutatie.isPending ? "Genereren..." : "Opnieuw genereren"}
          </Button>
          {!isGereed && (
            <Button
              size="sm"
              onClick={() => vaststellenMutatie.mutate({ id: opdrachtId })}
              disabled={vaststellenMutatie.isPending}
            >
              <Check className="h-3.5 w-3.5" /> Gereed voor planning
            </Button>
          )}
        </div>
      </div>

      {/* AI samenvatting */}
      {plan.ai_samenvatting && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-900">
          <Sparkles className="h-4 w-4 inline mr-1.5 text-amber-600" />
          {plan.ai_samenvatting}
        </div>
      )}

      {/* Samenvatting statistieken */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-xs text-muted-foreground">Totaal uren</p>
            <p className="text-lg font-semibold">{totaalUren.toFixed(1)} u</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-xs text-muted-foreground">Totaal doorlooptijd</p>
            <p className="text-lg font-semibold">{totaalDagen} dagen</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-xs text-muted-foreground">Fasen</p>
            <p className="text-lg font-semibold">{Object.keys(fasenMap).length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Taken per fase */}
      {taken.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Geen taken gegenereerd.
          </CardContent>
        </Card>
      ) : (
        Object.entries(fasenMap).map(([fase, fasenTaken]) => {
          const faseUren = fasenTaken.reduce((a, t) => a + (t.urenbegroting ?? 0), 0);
          return (
            <div key={fase}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {fase}
                </h3>
                {faseUren > 0 && (
                  <span className="text-xs text-muted-foreground">{faseUren.toFixed(1)} u totaal</span>
                )}
              </div>
              <div className="space-y-2">
                {fasenTaken.map(taak => (
                  <TaakRij key={taak.id} taak={taak} opdrachtId={opdrachtId} />
                ))}
              </div>
            </div>
          );
        })
      )}

      {plan.vastgesteld_op && (
        <p className="text-xs text-muted-foreground text-right">
          Gereedgemeld op {new Date(plan.vastgesteld_op).toLocaleString("nl-NL")}
        </p>
      )}
    </div>
  );
}
