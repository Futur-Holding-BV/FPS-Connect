import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAiSeniorAnalyseCalculatie,
  useListCalcAdviezen,
  useUpdateCalcAdvies,
  getListCalcAdviezenQueryKey,
  type CalcAdvies,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Info,
  TrendingDown,
  FileQuestion,
  HelpCircle,
  CheckCircle2,
  EyeOff,
  StickyNote,
  RefreshCw,
  BrainCircuit,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const TYPE_META: Record<string, { label: string; kleur: string; icoon: React.ElementType }> = {
  waarschuwing:        { label: "Waarschuwing",    kleur: "text-red-700 bg-red-50 border-red-200",     icoon: AlertTriangle },
  aandachtspunt:       { label: "Aandachtspunt",   kleur: "text-amber-700 bg-amber-50 border-amber-200", icoon: Info },
  kans_op_besparing:   { label: "Kans op besparing", kleur: "text-green-700 bg-green-50 border-green-200", icoon: TrendingDown },
  ontbrekende_info:    { label: "Ontbrekende info", kleur: "text-blue-700 bg-blue-50 border-blue-200",   icoon: FileQuestion },
  vraag:               { label: "Vraag",            kleur: "text-purple-700 bg-purple-50 border-purple-200", icoon: HelpCircle },
};

const PRIORITEIT_DOT: Record<string, string> = {
  hoog:   "bg-red-500",
  middel: "bg-amber-400",
  laag:   "bg-slate-300",
};

function AdviesKaart({
  advies,
  onUpdate,
}: {
  advies: CalcAdvies;
  onUpdate: (id: number, update: { status?: string; notitie?: string | null }) => void;
}) {
  const [notitieOpen, setNotitieOpen] = useState(false);
  const [notitieWaarde, setNotitieWaarde] = useState(advies.notitie ?? "");
  const [uitgeklapt, setUitgeklapt] = useState(true);
  const meta = TYPE_META[advies.type] ?? TYPE_META["aandachtspunt"]!;
  const Icoon = meta.icoon;
  const genegeerd = advies.status === "genegeerd";
  const gecontroleerd = advies.status === "gecontroleerd";

  return (
    <div className={cn("rounded-lg border text-xs", meta.kleur, genegeerd && "opacity-40")}>
      <div className="p-2.5">
        <div className="flex items-start gap-2">
          <Icoon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={cn("inline-block w-2 h-2 rounded-full shrink-0", PRIORITEIT_DOT[advies.prioriteit] ?? "bg-slate-300")} />
              <span className="font-semibold leading-tight">{advies.titel}</span>
              <button onClick={() => setUitgeklapt((v) => !v)} className="ml-auto shrink-0 opacity-60 hover:opacity-100">
                {uitgeklapt ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </div>
            {uitgeklapt && (
              <p className="text-xs leading-snug opacity-90 mt-1">{advies.uitleg}</p>
            )}
          </div>
        </div>

        {advies.notitie && !notitieOpen && (
          <div className="mt-1.5 ml-5 px-2 py-1 bg-white/60 rounded text-xs italic border border-current/20">
            {advies.notitie}
          </div>
        )}

        {notitieOpen && (
          <div className="mt-2 ml-5 space-y-1.5">
            <Textarea
              className="text-xs min-h-[56px] bg-white/80"
              placeholder="Voeg een notitie toe..."
              value={notitieWaarde}
              onChange={(e) => setNotitieWaarde(e.target.value)}
              rows={2}
            />
            <div className="flex gap-1.5">
              <Button size="sm" className="h-6 text-xs px-2" onClick={() => {
                onUpdate(advies.id, { notitie: notitieWaarde || null });
                setNotitieOpen(false);
              }}>
                Opslaan
              </Button>
              <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => {
                setNotitieWaarde(advies.notitie ?? "");
                setNotitieOpen(false);
              }}>
                Annuleren
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 mt-2 ml-5">
          {!gecontroleerd && !genegeerd && (
            <button
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-white/60 transition-colors"
              onClick={() => onUpdate(advies.id, { status: "gecontroleerd" })}
            >
              <CheckCircle2 className="h-3 w-3" />
              Gecontroleerd
            </button>
          )}
          {gecontroleerd && (
            <button
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-white/60 transition-colors font-semibold"
              onClick={() => onUpdate(advies.id, { status: "actief" })}
            >
              <CheckCircle2 className="h-3 w-3" />
              Gecontroleerd
            </button>
          )}
          {!genegeerd && (
            <button
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-white/60 transition-colors opacity-70"
              onClick={() => onUpdate(advies.id, { status: "genegeerd" })}
            >
              <EyeOff className="h-3 w-3" />
              Negeren
            </button>
          )}
          {genegeerd && (
            <button
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-white/60 transition-colors"
              onClick={() => onUpdate(advies.id, { status: "actief" })}
            >
              <EyeOff className="h-3 w-3" />
              Herstellen
            </button>
          )}
          <button
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-white/60 transition-colors opacity-70"
            onClick={() => { setNotitieOpen((v) => !v); setNotitieWaarde(advies.notitie ?? ""); }}
          >
            <StickyNote className="h-3 w-3" />
            Notitie
          </button>
        </div>
      </div>
    </div>
  );
}

const FILTER_OPTIES = [
  { value: "actief",       label: "Actief" },
  { value: "gecontroleerd", label: "Gecontroleerd" },
  { value: "genegeerd",    label: "Genegeerd" },
  { value: "alles",        label: "Alles" },
] as const;

type FilterOptie = typeof FILTER_OPTIES[number]["value"];

export default function AiSeniorCalculatorPanel({ calculatieId }: { calculatieId: number }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<FilterOptie>("actief");

  const { data: adviezen = [], isLoading } = useListCalcAdviezen(calculatieId, {
    query: { queryKey: getListCalcAdviezenQueryKey(calculatieId) },
  });

  const analyseMut = useAiSeniorAnalyseCalculatie({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListCalcAdviezenQueryKey(calculatieId) });
      },
    },
  });

  const updateMut = useUpdateCalcAdvies({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListCalcAdviezenQueryKey(calculatieId) });
      },
    },
  });

  function handleUpdate(adviesId: number, update: { status?: string; notitie?: string | null }) {
    updateMut.mutate({ id: calculatieId, adviesId, data: update });
  }

  const gefilterd = filter === "alles"
    ? adviezen
    : adviezen.filter((a) => a.status === filter);

  const aantalActief      = adviezen.filter((a) => a.status === "actief").length;
  const aantalHoog        = adviezen.filter((a) => a.prioriteit === "hoog" && a.status === "actief").length;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="p-3 border-b shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <BrainCircuit className="h-4 w-4 text-orange-600 shrink-0" />
          <span className="text-sm font-semibold">AI Senior Calculator</span>
          {aantalHoog > 0 && (
            <Badge variant="destructive" className="h-4 text-[10px] px-1.5 ml-auto">{aantalHoog} hoog</Badge>
          )}
        </div>
        <Button
          className="w-full"
          size="sm"
          onClick={() => analyseMut.mutate({ id: calculatieId })}
          disabled={analyseMut.isPending}
          variant={adviezen.length === 0 ? "default" : "outline"}
        >
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", analyseMut.isPending && "animate-spin")} />
          {analyseMut.isPending ? "Analyseren..." : adviezen.length === 0 ? "Analyseer calculatie" : "Heranalyseer"}
        </Button>
        {analyseMut.isPending && (
          <p className="text-xs text-muted-foreground mt-1.5 text-center">
            Senior calculator denkt mee...
          </p>
        )}
      </div>

      {/* Filter tabs */}
      {adviezen.length > 0 && (
        <div className="flex gap-0 border-b shrink-0">
          {FILTER_OPTIES.map((opt) => {
            const aantal = opt.value === "alles"
              ? adviezen.length
              : adviezen.filter((a) => a.status === opt.value).length;
            return (
              <button
                key={opt.value}
                className={cn(
                  "flex-1 py-1.5 text-xs border-b-2 transition-colors",
                  filter === opt.value
                    ? "border-orange-500 text-orange-700 font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setFilter(opt.value)}
              >
                {opt.label}
                {aantal > 0 && <span className="ml-1 opacity-60">({aantal})</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Adviezen lijst */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-2">
          {isLoading && (
            <p className="text-xs text-muted-foreground text-center py-4">Laden...</p>
          )}

          {!isLoading && adviezen.length === 0 && !analyseMut.isPending && (
            <div className="text-center py-6 space-y-2">
              <BrainCircuit className="h-8 w-8 mx-auto text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">
                Klik op "Analyseer calculatie" om de AI Senior Calculator te laten meekijken.
              </p>
              <p className="text-xs text-muted-foreground/60">
                De AI controleert volledigheid, tarieven, opslagen en ontbrekende posten.
              </p>
            </div>
          )}

          {!isLoading && gefilterd.length === 0 && adviezen.length > 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Geen adviezen in deze categorie.
            </p>
          )}

          {gefilterd.map((advies) => (
            <AdviesKaart
              key={advies.id}
              advies={advies}
              onUpdate={handleUpdate}
            />
          ))}

          {adviezen.length > 0 && (
            <div className="pt-1">
              <Separator className="mb-2" />
              <p className="text-[10px] text-muted-foreground text-center">
                {aantalActief} actief van {adviezen.length} adviezen
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
