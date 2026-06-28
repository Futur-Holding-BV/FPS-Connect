import { useState, useEffect, useRef } from "react";
import {
  GitBranch, Plus, X, ChevronDown, Sparkles, User, AlertTriangle,
  Check, Trash2, GripVertical, Filter, BookOpen, Layers, Cpu,
  ArrowRight, Network, Package, Users, Zap, RotateCcw, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  useListWorkflowDefinities,
  useGetWorkflowDefinitie,
} from "@workspace/api-client-react";

// ── Constanten ─────────────────────────────────────────────────────────────────

const FUNCTIES = [
  "Commercieel medewerker",
  "Calculator",
  "Werkvoorbereider",
  "Planner",
  "Projectleider",
  "Monteur",
  "Controleur",
  "Financiële administratie",
  "Directie",
  "Systeem",
  "AI",
];

const MODULES = [
  "Projecten",
  "Gebouwen",
  "Opnames",
  "Calculaties",
  "Offertes",
  "Werkbegroting",
  "Planning",
  "Uitvoering",
  "Factuurverwerking",
  "Opleverrapportage",
  "DMS",
  "HRM",
  "Wagenpark",
  "E-mail inbox",
  "Werk-inbox",
];

const OBJECTEN = [
  "Klant",
  "Organisatie",
  "Gebouw",
  "Project",
  "Opname",
  "Calculatie",
  "Offerte",
  "Werkbegroting",
  "Planning",
  "Spot",
  "Factuur",
  "Opleverrapport",
  "Taak",
  "Document",
  "Dossier",
];

const AI_TAKEN_V2 = [
  "AI leest",
  "AI classificeert",
  "AI controleert",
  "AI koppelt",
  "AI stelt voor",
  "AI maakt concept",
  "AI signaleert risico",
  "AI vraagt menselijk akkoord",
  "Mens akkoord nodig",
  "Automatisch na akkoord",
];

const VERVOLGACTIES_OPTIES = [
  "Ga door naar volgende stap",
  "Stuur terug naar vorige stap",
  "Start andere workflow",
  "Maak taak aan",
  "Maak document aan",
  "Verstuur e-mailconcept",
  "Zet klaar voor akkoord",
  "Archiveer",
  "Escaleer naar functie",
];

const AI_BADGE_KLEUR: Record<string, string> = {
  "AI leest": "bg-violet-100 text-violet-700 border-violet-200",
  "AI classificeert": "bg-indigo-100 text-indigo-700 border-indigo-200",
  "AI controleert": "bg-blue-100 text-blue-700 border-blue-200",
  "AI koppelt": "bg-indigo-100 text-indigo-700 border-indigo-200",
  "AI stelt voor": "bg-purple-100 text-purple-700 border-purple-200",
  "AI maakt concept": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  "AI signaleert risico": "bg-rose-100 text-rose-700 border-rose-200",
  "AI vraagt menselijk akkoord": "bg-amber-100 text-amber-700 border-amber-200",
  "Mens akkoord nodig": "bg-orange-100 text-orange-700 border-orange-200",
  "Automatisch na akkoord": "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const FUNCTIE_KLEUREN = [
  "bg-sky-100 text-sky-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
  "bg-amber-100 text-amber-700",
  "bg-emerald-100 text-emerald-700",
  "bg-pink-100 text-pink-700",
  "bg-cyan-100 text-cyan-700",
];

function functieBadgeKleur(naam: string): string {
  let h = 0;
  for (let i = 0; i < naam.length; i++) h = naam.charCodeAt(i) + ((h << 5) - h);
  return FUNCTIE_KLEUREN[Math.abs(h) % FUNCTIE_KLEUREN.length]!;
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface WorkflowCard {
  id: number;
  workflow_id: number;
  lane_id: number;
  type: string;
  titel: string;
  omschrijving: string | null;
  invoer: string | null;
  uitvoer: string | null;
  rol: string | null;
  ai_taak: string | null;
  akkoord_door: string | null;
  gekoppelde_module: string | null;
  uitzonderingsroute: string | null;
  actief: boolean;
  volgorde: number;
  // V2.0
  betrokken_functies: string[];
  primaire_functie: string | null;
  modules: string[];
  objecten_gebruikt: string[];
  objecten_gewijzigd: string[];
  ai_acties: string[];
  beslisregels: string[];
  vervolgacties: string[];
  impact_workflows: string[];
}

interface WorkflowLane {
  id: number;
  workflow_id: number;
  naam: string;
  kleur: string;
  volgorde: number;
  cards: WorkflowCard[];
}

// ── MoveRecord ────────────────────────────────────────────────────────────────

interface MoveRecord {
  id: string;
  cardId: number;
  cardTitel: string;
  vanLaneId: number;
  vanLaneNaam: string;
  naarLaneId: number;
  naarLaneNaam: string;
  vanVolgorde: number;
  vanBeforeCardId: number | null;
  tijdstip: Date;
}

// ── TagEditor ──────────────────────────────────────────────────────────────────

function TagEditor({
  tags,
  onChange,
  opties,
  placeholder,
  vrij = false,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  opties?: string[];
  placeholder?: string;
  vrij?: boolean;
}) {
  const [invoer, setInvoer] = useState("");

  const voegToe = (tag: string) => {
    const val = tag.trim();
    if (!val || tags.includes(val)) return;
    onChange([...tags, val]);
    setInvoer("");
  };

  const verwijder = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  const beschikbaar = opties ? opties.filter((o) => !tags.includes(o)) : [];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700"
          >
            {tag}
            <button
              type="button"
              onClick={() => verwijder(tag)}
              className="ml-0.5 text-gray-400 hover:text-gray-600"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {tags.length === 0 && (
          <span className="text-xs text-gray-400 italic">Nog niets toegevoegd</span>
        )}
      </div>

      {opties && beschikbaar.length > 0 && (
        <Select onValueChange={voegToe} value="">
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder={placeholder ?? "Voeg toe..."} />
          </SelectTrigger>
          <SelectContent>
            {beschikbaar.map((o) => (
              <SelectItem key={o} value={o} className="text-xs">
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {vrij && (
        <div className="flex gap-1.5">
          <Input
            className="h-8 text-xs"
            value={invoer}
            onChange={(e) => setInvoer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); voegToe(invoer); }
            }}
            placeholder={placeholder ?? "Typ en druk Enter..."}
          />
          <Button
            size="sm"
            variant="outline"
            type="button"
            className="h-8 px-2.5"
            onClick={() => voegToe(invoer)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ── AiBadge ────────────────────────────────────────────────────────────────────

function AiBadge({ taak }: { taak: string }) {
  const kleur = AI_BADGE_KLEUR[taak] ?? "bg-gray-100 text-gray-600 border-gray-200";
  const isAi = taak.startsWith("AI");
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${kleur}`}
    >
      {isAi ? <Sparkles className="h-2.5 w-2.5" /> : <User className="h-2.5 w-2.5" />}
      {taak}
    </span>
  );
}

// ── ProcesKaart ────────────────────────────────────────────────────────────────

function ProcesKaart({
  card,
  isDragging,
  isDropTarget,
  dimmed,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
}: {
  card: WorkflowCard;
  isDragging: boolean;
  isDropTarget: boolean;
  dimmed: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onClick: () => void;
}) {
  const isBeslissing = card.type === "beslissing";
  const effectieveFuncties = card.betrokken_functies.length > 0
    ? card.betrokken_functies
    : card.rol ? [card.rol] : [];
  const effectieveModules = card.modules.length > 0
    ? card.modules
    : card.gekoppelde_module ? [card.gekoppelde_module] : [];
  const effectieveAiActies = card.ai_acties.length > 0
    ? card.ai_acties
    : card.ai_taak ? [card.ai_taak] : [];
  const primair = card.primaire_functie ?? card.rol;
  const MAX_CHIPS = 2;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      className={`
        group relative select-none cursor-pointer rounded-lg border bg-white p-3 shadow-sm transition-all
        ${isDragging ? "opacity-40 scale-95" : "hover:shadow-md"}
        ${isDropTarget ? "border-orange-400 ring-2 ring-orange-200" : "border-gray-200"}
        ${isBeslissing ? "border-l-4 border-l-amber-400 bg-amber-50/30" : ""}
        ${!card.actief ? "opacity-60" : ""}
        ${dimmed ? "opacity-30 pointer-events-none" : ""}
      `}
    >
      {/* Grip */}
      <div className="absolute left-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition-opacity">
        <GripVertical className="h-3.5 w-3.5 text-gray-400" />
      </div>

      {/* Type indicator */}
      {isBeslissing && (
        <div className="mb-1.5 flex items-center gap-1">
          <div className="h-3 w-3 rotate-45 rounded-sm border border-amber-400 bg-amber-100" />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">
            Beslismoment
          </span>
          {card.beslisregels.length > 0 && (
            <span className="ml-auto text-[10px] font-medium text-amber-500">
              {card.beslisregels.length} {card.beslisregels.length === 1 ? "regel" : "regels"}
            </span>
          )}
        </div>
      )}

      {/* Title */}
      <p className="text-sm font-semibold text-gray-900 leading-snug pl-4">
        {card.titel}
      </p>

      {/* Primaire functie */}
      {primair && (
        <p className="mt-0.5 text-[11px] text-gray-500 pl-4">{primair}</p>
      )}

      {/* Betrokken functies chips */}
      {effectieveFuncties.length > 0 && (
        <div className="mt-2 pl-4 flex flex-wrap gap-1">
          {effectieveFuncties.slice(0, MAX_CHIPS).map((f) => (
            <span
              key={f}
              className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${functieBadgeKleur(f)}`}
            >
              {f}
            </span>
          ))}
          {effectieveFuncties.length > MAX_CHIPS && (
            <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500">
              +{effectieveFuncties.length - MAX_CHIPS}
            </span>
          )}
        </div>
      )}

      {/* AI-acties badges */}
      {effectieveAiActies.length > 0 && (
        <div className="mt-2 pl-4 flex flex-wrap gap-1">
          <AiBadge taak={effectieveAiActies[0]!} />
          {effectieveAiActies.length > 1 && (
            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 border-gray-200">
              +{effectieveAiActies.length - 1}
            </span>
          )}
        </div>
      )}

      {/* Modules */}
      {effectieveModules.length > 0 && (
        <div className="mt-1.5 pl-4 flex flex-wrap gap-1">
          {effectieveModules.slice(0, MAX_CHIPS).map((m) => (
            <span
              key={m}
              className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] text-gray-500 bg-gray-50 border border-gray-200"
            >
              {m}
            </span>
          ))}
          {effectieveModules.length > MAX_CHIPS && (
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] text-gray-400 bg-gray-50 border border-gray-200">
              +{effectieveModules.length - MAX_CHIPS}
            </span>
          )}
        </div>
      )}

      {/* Uitzonderingsroute */}
      {isBeslissing && card.uitzonderingsroute && (
        <div className="mt-2 flex items-start gap-1 pl-4">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
          <p className="text-[10px] text-amber-700 leading-tight">{card.uitzonderingsroute}</p>
        </div>
      )}

      {/* Vervolgacties indicator */}
      {card.vervolgacties.length > 0 && (
        <div className="mt-1.5 pl-4 flex items-center gap-1">
          <ArrowRight className="h-2.5 w-2.5 text-gray-400" />
          <span className="text-[10px] text-gray-400">
            {card.vervolgacties.length} {card.vervolgacties.length === 1 ? "vervolgactie" : "vervolgacties"}
          </span>
        </div>
      )}

      {/* Inactief label */}
      {!card.actief && (
        <div className="mt-1.5 pl-4">
          <span className="text-[10px] text-gray-400 italic">Inactief</span>
        </div>
      )}
    </div>
  );
}

// ── Swimlane ───────────────────────────────────────────────────────────────────

function Swimlane({
  lane,
  draggingCardId,
  dropTargetLaneId,
  dropBeforeCardId,
  filterFunctie,
  filterModule,
  onCardDragStart,
  onCardDragOver,
  onCardDragLeave,
  onLaneDragOver,
  onLaneDragLeave,
  onLaneDrop,
  onCardDrop,
  onCardClick,
  onAddCard,
}: {
  lane: WorkflowLane;
  draggingCardId: number | null;
  dropTargetLaneId: number | null;
  dropBeforeCardId: number | null;
  filterFunctie: string | null;
  filterModule: string | null;
  onCardDragStart: (cardId: number, laneId: number) => void;
  onCardDragOver: (e: React.DragEvent, cardId: number, laneId: number) => void;
  onCardDragLeave: (e: React.DragEvent) => void;
  onLaneDragOver: (e: React.DragEvent, laneId: number) => void;
  onLaneDragLeave: (e: React.DragEvent) => void;
  onLaneDrop: (e: React.DragEvent, laneId: number) => void;
  onCardDrop: (e: React.DragEvent, beforeCardId: number, laneId: number) => void;
  onCardClick: (card: WorkflowCard) => void;
  onAddCard: (laneId: number) => void;
}) {
  const isLaneDropTarget = dropTargetLaneId === lane.id && dropBeforeCardId === null;

  function isCardDimmed(card: WorkflowCard): boolean {
    if (!filterFunctie && !filterModule) return false;
    const functies = card.betrokken_functies.length > 0
      ? card.betrokken_functies
      : card.rol ? [card.rol] : [];
    const modules = card.modules.length > 0
      ? card.modules
      : card.gekoppelde_module ? [card.gekoppelde_module] : [];
    const functieOk = !filterFunctie ||
      functies.includes(filterFunctie) ||
      card.primaire_functie === filterFunctie;
    const moduleOk = !filterModule || modules.includes(filterModule);
    return !functieOk || !moduleOk;
  }

  const actieveTelling = lane.cards.filter((c) => c.actief && !isCardDimmed(c)).length;

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div
        className="mb-2 flex items-center justify-between rounded-lg px-3 py-2.5"
        style={{ backgroundColor: lane.kleur + "20", borderLeft: `4px solid ${lane.kleur}` }}
      >
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: lane.kleur }} />
          <span className="text-sm font-semibold text-gray-800">{lane.naam}</span>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: lane.kleur + "30", color: lane.kleur }}
        >
          {actieveTelling}
        </span>
      </div>

      <div
        className={`
          flex flex-1 flex-col gap-2 rounded-xl border-2 border-dashed p-2 transition-colors min-h-32
          ${isLaneDropTarget ? "border-orange-400 bg-orange-50" : "border-transparent"}
        `}
        onDragOver={(e) => onLaneDragOver(e, lane.id)}
        onDragLeave={onLaneDragLeave}
        onDrop={(e) => onLaneDrop(e, lane.id)}
      >
        {lane.cards.map((card) => (
          <div key={card.id}>
            {dropBeforeCardId === card.id && dropTargetLaneId === lane.id && (
              <div className="mb-1.5 h-0.5 rounded-full bg-orange-400 mx-1" />
            )}
            <ProcesKaart
              card={card}
              isDragging={draggingCardId === card.id}
              isDropTarget={dropBeforeCardId === card.id && dropTargetLaneId === lane.id}
              dimmed={isCardDimmed(card)}
              onDragStart={(e) => { e.stopPropagation(); onCardDragStart(card.id, lane.id); }}
              onDragOver={(e) => onCardDragOver(e, card.id, lane.id)}
              onDragLeave={onCardDragLeave}
              onDrop={(e) => onCardDrop(e, card.id, lane.id)}
              onClick={() => onCardClick(card)}
            />
          </div>
        ))}

        {lane.cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center py-6">
            <p className="text-xs text-gray-400">Sleep een kaart hiernaartoe</p>
          </div>
        )}
      </div>

      <button
        onClick={() => onAddCard(lane.id)}
        className="mt-2 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors w-full"
      >
        <Plus className="h-3.5 w-3.5" />
        Kaart toevoegen
      </button>
    </div>
  );
}

// ── Edit Sheet ─────────────────────────────────────────────────────────────────

interface EditFormData {
  titel: string;
  type: string;
  omschrijving: string;
  invoer: string;
  uitvoer: string;
  rol: string;
  ai_taak: string;
  akkoord_door: string;
  gekoppelde_module: string;
  uitzonderingsroute: string;
  actief: boolean;
  // V2.0
  betrokken_functies: string[];
  primaire_functie: string;
  modules: string[];
  objecten_gebruikt: string[];
  objecten_gewijzigd: string[];
  ai_acties: string[];
  beslisregels: string[];
  vervolgacties: string[];
  impact_workflows: string[];
}

function CardEditSheet({
  card,
  lanes,
  workflowNamen,
  open,
  onClose,
  onSave,
  onDelete,
}: {
  card: WorkflowCard | null;
  lanes: WorkflowLane[];
  workflowNamen: string[];
  open: boolean;
  onClose: () => void;
  onSave: (id: number, data: Partial<EditFormData> & { lane_id?: number }) => void;
  onDelete: (id: number) => void;
}) {
  const [form, setForm] = useState<EditFormData>({
    titel: "",
    type: "stap",
    omschrijving: "",
    invoer: "",
    uitvoer: "",
    rol: "",
    ai_taak: "",
    akkoord_door: "",
    gekoppelde_module: "",
    uitzonderingsroute: "",
    actief: true,
    betrokken_functies: [],
    primaire_functie: "",
    modules: [],
    objecten_gebruikt: [],
    objecten_gewijzigd: [],
    ai_acties: [],
    beslisregels: [],
    vervolgacties: [],
    impact_workflows: [],
  });
  const [laneId, setLaneId] = useState<number | null>(null);
  const [opslaan, setOpslaan] = useState(false);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (card) {
      setForm({
        titel: card.titel,
        type: card.type,
        omschrijving: card.omschrijving ?? "",
        invoer: card.invoer ?? "",
        uitvoer: card.uitvoer ?? "",
        rol: card.rol ?? "",
        ai_taak: card.ai_taak ?? "",
        akkoord_door: card.akkoord_door ?? "",
        gekoppelde_module: card.gekoppelde_module ?? "",
        uitzonderingsroute: card.uitzonderingsroute ?? "",
        actief: card.actief,
        betrokken_functies: card.betrokken_functies ?? [],
        primaire_functie: card.primaire_functie ?? "",
        modules: card.modules ?? [],
        objecten_gebruikt: card.objecten_gebruikt ?? [],
        objecten_gewijzigd: card.objecten_gewijzigd ?? [],
        ai_acties: card.ai_acties ?? [],
        beslisregels: card.beslisregels ?? [],
        vervolgacties: card.vervolgacties ?? [],
        impact_workflows: card.impact_workflows ?? [],
      });
      setLaneId(card.lane_id);
      setAttempted(false);
    }
  }, [card]);

  if (!card) return null;

  const isValid = form.titel.trim().length > 0;

  const handleSave = async () => {
    if (!isValid) { setAttempted(true); return; }
    setOpslaan(true);
    await onSave(card.id, { ...form, lane_id: laneId ?? card.lane_id });
    setOpslaan(false);
    onClose();
  };

  const set = <K extends keyof EditFormData>(key: K, val: EditFormData[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const beschikbareImpactWorkflows = workflowNamen.filter(
    (n) => !form.impact_workflows.includes(n),
  );

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full max-w-xl overflow-y-auto flex flex-col">
        <SheetHeader className="shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <GitBranch className="h-4 w-4 text-orange-500" />
            {form.titel || "Kaart bewerken"}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-4">
          <Tabs defaultValue="basis">
            <TabsList className="w-full grid grid-cols-5 h-auto">
              <TabsTrigger value="basis" className="text-xs py-1.5 gap-1">
                <BookOpen className="h-3 w-3" />
                Basis
              </TabsTrigger>
              <TabsTrigger value="functies" className="text-xs py-1.5 gap-1">
                <Users className="h-3 w-3" />
                Functies
              </TabsTrigger>
              <TabsTrigger value="modules" className="text-xs py-1.5 gap-1">
                <Layers className="h-3 w-3" />
                Modules
              </TabsTrigger>
              <TabsTrigger value="ai" className="text-xs py-1.5 gap-1">
                <Cpu className="h-3 w-3" />
                AI
              </TabsTrigger>
              <TabsTrigger value="koppeling" className="text-xs py-1.5 gap-1">
                <Network className="h-3 w-3" />
                Koppeling
              </TabsTrigger>
            </TabsList>

            {/* ── Tab: Basis ── */}
            <TabsContent value="basis" className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1">
                  Titel <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={form.titel}
                  onChange={(e) => {
                    set("titel", e.target.value);
                    if (attempted && e.target.value.trim()) setAttempted(false);
                  }}
                  placeholder="Naam van de processtap"
                  className={attempted && !form.titel.trim() ? "border-red-400 ring-2 ring-red-200" : ""}
                />
                {attempted && !form.titel.trim() && (
                  <p className="text-xs text-red-500">Titel is verplicht</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v) => set("type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stap">Processtap</SelectItem>
                      <SelectItem value="beslissing">Beslismoment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Afdeling</Label>
                  <Select
                    value={laneId?.toString() ?? ""}
                    onValueChange={(v) => setLaneId(Number(v))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {lanes.map((l) => (
                        <SelectItem key={l.id} value={l.id.toString()}>{l.naam}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Omschrijving</Label>
                <Textarea
                  value={form.omschrijving}
                  onChange={(e) => set("omschrijving", e.target.value)}
                  rows={3}
                  placeholder="Wat gebeurt er in deze stap?"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Invoer</Label>
                  <Textarea
                    value={form.invoer}
                    onChange={(e) => set("invoer", e.target.value)}
                    rows={2}
                    placeholder="Wat gaat erin?"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Uitvoer</Label>
                  <Textarea
                    value={form.uitvoer}
                    onChange={(e) => set("uitvoer", e.target.value)}
                    rows={2}
                    placeholder="Wat komt eruit?"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  checked={form.actief}
                  onCheckedChange={(v) => set("actief", v)}
                />
                <Label>Stap actief</Label>
              </div>
            </TabsContent>

            {/* ── Tab: Functies ── */}
            <TabsContent value="functies" className="mt-4 space-y-5">
              <div className="space-y-1.5">
                <Label className="font-medium">Betrokken gebruikersfuncties</Label>
                <p className="text-xs text-gray-500">Alle rollen die bij deze stap betrokken zijn</p>
                <TagEditor
                  tags={form.betrokken_functies}
                  onChange={(v) => set("betrokken_functies", v)}
                  opties={FUNCTIES}
                  placeholder="Functie toevoegen..."
                />
              </div>

              <div className="space-y-1.5">
                <Label className="font-medium">Primaire verantwoordelijke</Label>
                <p className="text-xs text-gray-500">Hoofdverantwoordelijke voor deze stap</p>
                <Select
                  value={form.primaire_functie || "__geen__"}
                  onValueChange={(v) => set("primaire_functie", v === "__geen__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Kies verantwoordelijke..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__geen__">Geen primaire functie</SelectItem>
                    {FUNCTIES.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="font-medium">Verplicht akkoord door</Label>
                <Input
                  value={form.akkoord_door}
                  onChange={(e) => set("akkoord_door", e.target.value)}
                  placeholder="bijv. Directie, Projectleider"
                />
              </div>
            </TabsContent>

            {/* ── Tab: Modules & Objecten ── */}
            <TabsContent value="modules" className="mt-4 space-y-5">
              <div className="space-y-1.5">
                <Label className="font-medium flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5 text-orange-500" />
                  Gebruikte modules
                </Label>
                <p className="text-xs text-gray-500">Connect-modules die in deze stap worden gebruikt</p>
                <TagEditor
                  tags={form.modules}
                  onChange={(v) => set("modules", v)}
                  opties={MODULES}
                  placeholder="Module toevoegen..."
                />
              </div>

              <div className="space-y-1.5">
                <Label className="font-medium">Objecten geraadpleegd</Label>
                <p className="text-xs text-gray-500">Welke dataobjecten worden gelezen of bekeken</p>
                <TagEditor
                  tags={form.objecten_gebruikt}
                  onChange={(v) => set("objecten_gebruikt", v)}
                  opties={OBJECTEN}
                  placeholder="Object toevoegen..."
                />
              </div>

              <div className="space-y-1.5">
                <Label className="font-medium">Objecten aangemaakt of gewijzigd</Label>
                <p className="text-xs text-gray-500">Welke dataobjecten worden aangemaakt of aangepast</p>
                <TagEditor
                  tags={form.objecten_gewijzigd}
                  onChange={(v) => set("objecten_gewijzigd", v)}
                  opties={OBJECTEN}
                  placeholder="Object toevoegen..."
                />
              </div>
            </TabsContent>

            {/* ── Tab: AI & Regels ── */}
            <TabsContent value="ai" className="mt-4 space-y-5">
              <div className="space-y-1.5">
                <Label className="font-medium flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                  AI-acties
                </Label>
                <p className="text-xs text-gray-500">Wat doet AI in deze stap?</p>
                <TagEditor
                  tags={form.ai_acties}
                  onChange={(v) => set("ai_acties", v)}
                  opties={AI_TAKEN_V2}
                  placeholder="AI-actie toevoegen..."
                />
              </div>

              <div className="space-y-1.5">
                <Label className="font-medium flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  Beslisregels
                </Label>
                <p className="text-xs text-gray-500">
                  Voorwaarden en condities — bijv. "Als marge &lt; 12%, dan directie akkoord verplicht"
                </p>
                <TagEditor
                  tags={form.beslisregels}
                  onChange={(v) => set("beslisregels", v)}
                  vrij
                  placeholder="Regel toevoegen en Enter drukken..."
                />
              </div>

              {form.type === "beslissing" && (
                <div className="space-y-1.5">
                  <Label className="font-medium flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    Uitzonderingsroute (Nee-pad)
                  </Label>
                  <Textarea
                    value={form.uitzonderingsroute}
                    onChange={(e) => set("uitzonderingsroute", e.target.value)}
                    rows={2}
                    placeholder="Wat gebeurt er bij afkeuring of afwijking?"
                  />
                </div>
              )}
            </TabsContent>

            {/* ── Tab: Koppeling ── */}
            <TabsContent value="koppeling" className="mt-4 space-y-5">
              <div className="space-y-1.5">
                <Label className="font-medium flex items-center gap-1.5">
                  <ArrowRight className="h-3.5 w-3.5 text-blue-500" />
                  Vervolgacties
                </Label>
                <p className="text-xs text-gray-500">
                  Wat volgt er na deze stap?
                </p>
                <TagEditor
                  tags={form.vervolgacties}
                  onChange={(v) => set("vervolgacties", v)}
                  opties={VERVOLGACTIES_OPTIES}
                  vrij
                  placeholder="Actie toevoegen..."
                />
              </div>

              <div className="space-y-1.5">
                <Label className="font-medium flex items-center gap-1.5">
                  <Network className="h-3.5 w-3.5 text-teal-500" />
                  Impact op andere workflows
                </Label>
                <p className="text-xs text-gray-500">
                  Welke andere workflows worden door deze stap beïnvloed?
                </p>
                {beschikbareImpactWorkflows.length > 0 ? (
                  <TagEditor
                    tags={form.impact_workflows}
                    onChange={(v) => set("impact_workflows", v)}
                    opties={beschikbareImpactWorkflows}
                    vrij
                    placeholder="Workflow toevoegen..."
                  />
                ) : (
                  <TagEditor
                    tags={form.impact_workflows}
                    onChange={(v) => set("impact_workflows", v)}
                    vrij
                    placeholder="Workflow naam toevoegen..."
                  />
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {attempted && !isValid && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 shrink-0">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <p className="text-sm text-red-700">
              Vul minimaal de <span className="font-semibold">Titel</span> in.
            </p>
          </div>
        )}

        <SheetFooter className="mt-4 flex items-center justify-between shrink-0">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => { onDelete(card.id); onClose(); }}
            className="mr-auto"
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Verwijderen
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Annuleren</Button>
            <Button
              onClick={handleSave}
              disabled={opslaan}
              className={!isValid
                ? "bg-red-100 text-red-400 border border-red-200 hover:bg-red-100 hover:text-red-400 shadow-none"
                : ""}
            >
              <Check className="mr-1.5 h-3.5 w-3.5" />
              {opslaan ? "Opslaan..." : "Opslaan"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── Nieuw kaart sheet ──────────────────────────────────────────────────────────

function NieuweKaartSheet({
  laneId,
  workflowId,
  open,
  onClose,
  onCreated,
}: {
  laneId: number | null;
  workflowId: number;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [titel, setTitel] = useState("");
  const [type, setType] = useState("stap");
  const [opslaan, setOpslaan] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) { setTitel(""); setType("stap"); setAttempted(false); }
  }, [open]);

  const isValid = titel.trim().length > 0;

  const handleSubmit = async () => {
    if (!isValid || !laneId) { setAttempted(true); return; }
    setOpslaan(true);
    try {
      const res = await fetch("/api/workflow-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ workflow_id: workflowId, lane_id: laneId, type, titel }),
      });
      if (!res.ok) throw new Error();
      onCreated();
      onClose();
    } catch {
      toast({ title: "Fout bij aanmaken", variant: "destructive" });
    } finally {
      setOpslaan(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="max-w-sm">
        <SheetHeader>
          <SheetTitle className="text-base">Nieuwe kaart</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1">
              Titel <span className="text-red-500">*</span>
            </Label>
            <Input
              autoFocus
              value={titel}
              onChange={(e) => { setTitel(e.target.value); if (attempted && e.target.value.trim()) setAttempted(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              placeholder="Naam van de stap"
              className={attempted && !titel.trim() ? "border-red-400 ring-2 ring-red-200" : ""}
            />
            {attempted && !titel.trim() && <p className="text-xs text-red-500">Titel is verplicht</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="stap">Processtap</SelectItem>
                <SelectItem value="beslissing">Beslismoment</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {attempted && !isValid && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <p className="text-sm text-red-700">Vul de <span className="font-semibold">Titel</span> in.</p>
          </div>
        )}
        <SheetFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button
            onClick={handleSubmit}
            disabled={opslaan}
            className={!isValid ? "bg-red-100 text-red-400 border border-red-200 hover:bg-red-100 hover:text-red-400 shadow-none" : ""}
          >
            {opslaan ? "Aanmaken..." : "Aanmaken"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── Hoofdpagina ────────────────────────────────────────────────────────────────

export default function WorkflowDesignerPagina() {
  const { toast } = useToast();

  const { data: workflows, isLoading: ladenLijst } = useListWorkflowDefinities();
  const [actieveWorkflowId, setActieveWorkflowId] = useState<number | null>(null);

  useEffect(() => {
    if (workflows && workflows.length > 0 && !actieveWorkflowId) {
      setActieveWorkflowId(workflows[0].id);
    }
  }, [workflows, actieveWorkflowId]);

  const { data: werkflow, isLoading: ladenDetail, refetch } = useGetWorkflowDefinitie(
    actieveWorkflowId ?? 0,
  );

  const [localLanes, setLocalLanes] = useState<WorkflowLane[]>([]);

  useEffect(() => {
    if (werkflow && "lanes" in werkflow) {
      setLocalLanes((werkflow as unknown as { lanes: WorkflowLane[] }).lanes ?? []);
    }
  }, [werkflow]);

  // Filter state
  const [filterFunctie, setFilterFunctie] = useState<string | null>(null);
  const [filterModule, setFilterModule] = useState<string | null>(null);

  // Verplaatsingsgeschiedenis
  const [moveHistory, setMoveHistory] = useState<MoveRecord[]>([]);
  const [geschiedenisOpen, setGeschiedenisOpen] = useState(false);

  // DnD state
  const [draggingCardId, setDraggingCardId] = useState<number | null>(null);
  const [draggingSourceLaneId, setDraggingSourceLaneId] = useState<number | null>(null);
  const [dropTargetLaneId, setDropTargetLaneId] = useState<number | null>(null);
  const [dropBeforeCardId, setDropBeforeCardId] = useState<number | null>(null);
  const dragLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Edit state
  const [selectedCard, setSelectedCard] = useState<WorkflowCard | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [addLaneId, setAddLaneId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // ── DnD handlers ─────────────────────────────────────────────────────────────

  const handleCardDragStart = (cardId: number, laneId: number) => {
    setDraggingCardId(cardId);
    setDraggingSourceLaneId(laneId);
  };

  const handleCardDragOver = (e: React.DragEvent, cardId: number, laneId: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragLeaveTimerRef.current) clearTimeout(dragLeaveTimerRef.current);
    setDropTargetLaneId(laneId);
    setDropBeforeCardId(cardId !== draggingCardId ? cardId : null);
  };

  const handleCardDragLeave = (e: React.DragEvent) => { e.stopPropagation(); };

  const handleLaneDragOver = (e: React.DragEvent, laneId: number) => {
    e.preventDefault();
    if (dragLeaveTimerRef.current) clearTimeout(dragLeaveTimerRef.current);
    setDropTargetLaneId(laneId);
    setDropBeforeCardId(null);
  };

  const handleLaneDragLeave = (e: React.DragEvent) => {
    dragLeaveTimerRef.current = setTimeout(() => {
      setDropTargetLaneId(null);
      setDropBeforeCardId(null);
    }, 80);
  };

  const voerVerplaatsUit = async (cardId: number, targetLaneId: number, beforeCardId: number | null, isRevert = false) => {
    const targetLane = localLanes.find((l) => l.id === targetLaneId);
    if (!targetLane) return;

    // Record de verplaatsing in de geschiedenis (alleen bij echte moves, niet bij revert)
    if (!isRevert) {
      const kaart = localLanes.flatMap((l) => l.cards).find((c) => c.id === cardId);
      const bronLane = localLanes.find((l) => l.cards.some((c) => c.id === cardId));
      if (kaart && bronLane && bronLane.id !== targetLaneId) {
        const record: MoveRecord = {
          id: `${Date.now()}-${cardId}`,
          cardId,
          cardTitel: kaart.titel,
          vanLaneId: bronLane.id,
          vanLaneNaam: bronLane.naam,
          naarLaneId: targetLaneId,
          naarLaneNaam: targetLane.naam,
          vanVolgorde: kaart.volgorde,
          vanBeforeCardId: null,
          tijdstip: new Date(),
        };
        setMoveHistory((prev) => [record, ...prev]);
      }
    }

    let nieuweVolgorde: number;
    if (beforeCardId) {
      const idx = targetLane.cards.findIndex((c) => c.id === beforeCardId);
      nieuweVolgorde = idx > 0 ? targetLane.cards[idx - 1]!.volgorde + 0.5 : -0.5;
    } else {
      nieuweVolgorde = targetLane.cards.length > 0
        ? Math.max(...targetLane.cards.map((c) => c.volgorde)) + 1
        : 0;
    }

    setLocalLanes((prev) => {
      const kaart = prev.flatMap((l) => l.cards).find((c) => c.id === cardId);
      if (!kaart) return prev;
      const updated = prev.map((lane) => ({
        ...lane,
        cards: lane.cards.filter((c) => c.id !== cardId),
      }));
      return updated.map((lane) => {
        if (lane.id !== targetLaneId) return lane;
        const newCard = { ...kaart, lane_id: targetLaneId, volgorde: nieuweVolgorde };
        if (beforeCardId) {
          const idx = lane.cards.findIndex((c) => c.id === beforeCardId);
          const cards = [...lane.cards];
          cards.splice(idx, 0, newCard);
          return { ...lane, cards };
        }
        return { ...lane, cards: [...lane.cards, newCard] };
      });
    });

    try {
      await fetch(`/api/workflow-cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ lane_id: targetLaneId, volgorde: nieuweVolgorde }),
      });
      refetch();
    } catch {
      toast({ title: "Opslaan mislukt — ververs de pagina", variant: "destructive" });
      refetch();
    }
  };

  const handleLaneDrop = (e: React.DragEvent, laneId: number) => {
    e.preventDefault();
    if (!draggingCardId) return;
    voerVerplaatsUit(draggingCardId, laneId, null);
    setDraggingCardId(null); setDraggingSourceLaneId(null);
    setDropTargetLaneId(null); setDropBeforeCardId(null);
  };

  const handleCardDrop = (e: React.DragEvent, beforeCardId: number, laneId: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggingCardId) return;
    voerVerplaatsUit(draggingCardId, laneId, beforeCardId);
    setDraggingCardId(null); setDraggingSourceLaneId(null);
    setDropTargetLaneId(null); setDropBeforeCardId(null);
  };

  // ── Kaart opslaan ─────────────────────────────────────────────────────────────

  const handleCardSave = async (id: number, data: Record<string, unknown>) => {
    try {
      const payload: Record<string, unknown> = {};
      const tekstVeld = (k: string) => {
        if (data[k] !== undefined) payload[k] = data[k] || null;
      };
      const arrayVeld = (k: string) => {
        if (Array.isArray(data[k])) payload[k] = data[k];
      };
      tekstVeld("titel"); tekstVeld("omschrijving"); tekstVeld("invoer"); tekstVeld("uitvoer");
      tekstVeld("rol"); tekstVeld("ai_taak"); tekstVeld("akkoord_door");
      tekstVeld("gekoppelde_module"); tekstVeld("uitzonderingsroute"); tekstVeld("primaire_functie");
      if (data.type !== undefined) payload.type = data.type;
      if (data.actief !== undefined) payload.actief = data.actief;
      if (data.lane_id !== undefined) payload.lane_id = data.lane_id;
      arrayVeld("betrokken_functies"); arrayVeld("modules");
      arrayVeld("objecten_gebruikt"); arrayVeld("objecten_gewijzigd");
      arrayVeld("ai_acties"); arrayVeld("beslisregels");
      arrayVeld("vervolgacties"); arrayVeld("impact_workflows");

      await fetch(`/api/workflow-cards/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      refetch();
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  };

  const handleCardDelete = async (id: number) => {
    try {
      await fetch(`/api/workflow-cards/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      refetch();
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    }
  };

  const terugdraaienMove = async (record: MoveRecord) => {
    await voerVerplaatsUit(record.cardId, record.vanLaneId, null, true);
    setMoveHistory((prev) => prev.filter((r) => r.id !== record.id));
    toast({ title: `"${record.cardTitel}" teruggezet naar ${record.vanLaneNaam}` });
  };

  // ── Impact analyse ────────────────────────────────────────────────────────────

  const alleImpactWorkflows = Array.from(
    new Set(localLanes.flatMap((l) => l.cards.flatMap((c) => c.impact_workflows))),
  );

  // ── Matching stats voor filter ────────────────────────────────────────────────

  const filterActief = filterFunctie !== null || filterModule !== null;
  const alleKaarten = localLanes.flatMap((l) => l.cards);
  const matchendeKaarten = filterActief
    ? alleKaarten.filter((c) => {
        const functies = c.betrokken_functies.length > 0 ? c.betrokken_functies : c.rol ? [c.rol] : [];
        const modules = c.modules.length > 0 ? c.modules : c.gekoppelde_module ? [c.gekoppelde_module] : [];
        const fOk = !filterFunctie || functies.includes(filterFunctie) || c.primaire_functie === filterFunctie;
        const mOk = !filterModule || modules.includes(filterModule);
        return fOk && mOk;
      })
    : alleKaarten;

  const workflowNamen = (workflows ?? []).map((w) => w.naam);
  const isLaden = ladenLijst || ladenDetail;
  void draggingSourceLaneId;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-gray-50">

      {/* Topbalk */}
      <div className="flex shrink-0 items-center justify-between border-b bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <GitBranch className="h-5 w-5 text-orange-500" />
          <h1 className="text-lg font-semibold text-gray-900">Workflow Designer</h1>

          {workflows && workflows.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="ml-2 gap-1.5 text-sm h-8">
                  {workflows.find((w) => w.id === actieveWorkflowId)?.naam ?? "Kies workflow"}
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                {workflows.map((wf) => (
                  <DropdownMenuItem
                    key={wf.id}
                    onSelect={() => setActieveWorkflowId(wf.id)}
                    className="flex items-center justify-between"
                  >
                    <span>{wf.naam}</span>
                    {wf.id === actieveWorkflowId && (
                      <Check className="h-3.5 w-3.5 text-orange-500" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="flex items-center gap-2">
          <p className="text-xs text-gray-400">
            Sleep kaarten om de volgorde aan te passen — wijzigingen worden automatisch opgeslagen
          </p>
          {moveHistory.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setGeschiedenisOpen(true)}
            >
              <Clock className="h-3.5 w-3.5" />
              Geschiedenis
              <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">
                {moveHistory.length}
              </span>
            </Button>
          )}
        </div>
      </div>

      {/* Omschrijving workflow */}
      {werkflow && "omschrijving" in werkflow && werkflow.omschrijving && (
        <div className="shrink-0 border-b bg-white px-6 py-2">
          <p className="text-sm text-gray-500">{werkflow.omschrijving as string}</p>
        </div>
      )}

      {/* Filter balk */}
      {!isLaden && localLanes.length > 0 && (
        <div className="shrink-0 border-b bg-gray-50 px-6 py-2 flex items-center gap-3 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-gray-400 shrink-0" />

          {/* Functie filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0">Bekijk als:</span>
            <Select
              value={filterFunctie ?? "__alle__"}
              onValueChange={(v) => setFilterFunctie(v === "__alle__" ? null : v)}
            >
              <SelectTrigger className="h-7 text-xs w-48 border-gray-200">
                <SelectValue placeholder="Alle functies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__alle__" className="text-xs">Alle functies</SelectItem>
                {FUNCTIES.map((f) => (
                  <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Module filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0">Module:</span>
            <Select
              value={filterModule ?? "__alle__"}
              onValueChange={(v) => setFilterModule(v === "__alle__" ? null : v)}
            >
              <SelectTrigger className="h-7 text-xs w-44 border-gray-200">
                <SelectValue placeholder="Alle modules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__alle__" className="text-xs">Alle modules</SelectItem>
                {MODULES.map((m) => (
                  <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filter actief indicator */}
          {filterActief && (
            <>
              <span className="text-xs text-gray-400">
                {matchendeKaarten.length} van {alleKaarten.length} stappen
              </span>
              <button
                type="button"
                onClick={() => { setFilterFunctie(null); setFilterModule(null); }}
                className="flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-700 hover:bg-orange-200 transition-colors"
              >
                <X className="h-2.5 w-2.5" />
                Filter wissen
              </button>
            </>
          )}
        </div>
      )}

      {/* Board */}
      <div className="flex-1 overflow-auto p-6">
        {isLaden ? (
          <div className="flex gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="w-72 shrink-0 space-y-3">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-20 w-full rounded-lg" />
                <Skeleton className="h-16 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            ))}
          </div>
        ) : localLanes.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <GitBranch className="mx-auto h-10 w-10 text-gray-300" />
              <p className="mt-3 text-sm text-gray-400">Geen workflow geselecteerd</p>
            </div>
          </div>
        ) : (
          <div
            className="flex gap-4 pb-4"
            onDragEnd={() => {
              setDraggingCardId(null); setDraggingSourceLaneId(null);
              setDropTargetLaneId(null); setDropBeforeCardId(null);
            }}
          >
            {localLanes.map((lane) => (
              <Swimlane
                key={lane.id}
                lane={lane}
                draggingCardId={draggingCardId}
                dropTargetLaneId={dropTargetLaneId}
                dropBeforeCardId={dropBeforeCardId}
                filterFunctie={filterFunctie}
                filterModule={filterModule}
                onCardDragStart={handleCardDragStart}
                onCardDragOver={handleCardDragOver}
                onCardDragLeave={handleCardDragLeave}
                onLaneDragOver={handleLaneDragOver}
                onLaneDragLeave={handleLaneDragLeave}
                onLaneDrop={handleLaneDrop}
                onCardDrop={handleCardDrop}
                onCardClick={(card) => { setSelectedCard(card); setEditOpen(true); }}
                onAddCard={(laneId) => { setAddLaneId(laneId); setAddOpen(true); }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Impact overzicht */}
      {!isLaden && alleImpactWorkflows.length > 0 && (
        <div className="shrink-0 border-t bg-white px-6 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Network className="h-3.5 w-3.5 text-teal-500" />
              <span className="text-xs font-medium text-gray-600">Impactoverzicht:</span>
            </div>
            {alleImpactWorkflows.map((wf) => (
              <span
                key={wf}
                className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-[11px] font-medium text-teal-700"
              >
                <GitBranch className="h-2.5 w-2.5" />
                {wf}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Legenda */}
      {!isLaden && localLanes.length > 0 && (
        <div className="shrink-0 border-t bg-white px-6 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-xs font-medium text-gray-400">AI-labels:</span>
            {Object.entries(AI_BADGE_KLEUR).slice(0, 6).map(([taak, kleur]) => (
              <span
                key={taak}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${kleur}`}
              >
                {taak.startsWith("AI") ? (
                  <Sparkles className="h-2.5 w-2.5" />
                ) : (
                  <User className="h-2.5 w-2.5" />
                )}
                {taak}
              </span>
            ))}
            <span className="ml-4 flex items-center gap-1.5 text-[10px] text-gray-400">
              <div className="h-3 w-3 rotate-45 rounded-sm border border-amber-400 bg-amber-100" />
              Beslismoment
            </span>
          </div>
        </div>
      )}

      {/* Edit sheet */}
      <CardEditSheet
        card={selectedCard}
        lanes={localLanes}
        workflowNamen={workflowNamen}
        open={editOpen}
        onClose={() => { setEditOpen(false); setSelectedCard(null); }}
        onSave={handleCardSave}
        onDelete={handleCardDelete}
      />

      {/* Nieuw kaart sheet */}
      <NieuweKaartSheet
        laneId={addLaneId}
        workflowId={actieveWorkflowId ?? 0}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => refetch()}
      />

      {/* Verplaatsingsgeschiedenis sheet */}
      <Sheet open={geschiedenisOpen} onOpenChange={setGeschiedenisOpen}>
        <SheetContent side="right" className="w-[400px] max-w-full flex flex-col">
          <SheetHeader className="shrink-0">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-orange-500" />
              Verplaatsingsgeschiedenis
            </SheetTitle>
          </SheetHeader>

          {moveHistory.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-gray-400">Nog geen verplaatsingen</p>
            </div>
          ) : (
            <div className="mt-4 flex-1 overflow-y-auto space-y-2 pr-1">
              {moveHistory.map((record) => (
                <div
                  key={record.id}
                  className="rounded-lg border border-gray-100 bg-gray-50 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {record.cardTitel}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                        <span className="rounded px-1.5 py-0.5 bg-white border border-gray-200 truncate max-w-[120px]">
                          {record.vanLaneNaam}
                        </span>
                        <ArrowRight className="h-3 w-3 shrink-0 text-gray-400" />
                        <span className="rounded px-1.5 py-0.5 bg-orange-50 border border-orange-200 text-orange-700 truncate max-w-[120px]">
                          {record.naarLaneNaam}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-gray-400">
                        {record.tijdstip.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs shrink-0"
                      onClick={() => terugdraaienMove(record)}
                    >
                      <RotateCcw className="mr-1 h-3 w-3" />
                      Terugdraaien
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {moveHistory.length > 0 && (
            <div className="mt-4 shrink-0 border-t pt-3">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-gray-400 hover:text-gray-600"
                onClick={() => setMoveHistory([])}
              >
                <X className="mr-1.5 h-3 w-3" />
                Geschiedenis wissen
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
