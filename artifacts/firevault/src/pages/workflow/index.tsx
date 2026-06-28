import { useState, useEffect, useRef } from "react";
import {
  GitBranch, Plus, X, ChevronDown, Sparkles, User, AlertTriangle,
  Check, Trash2, GripVertical, Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";
import {
  useListWorkflowDefinities,
  useGetWorkflowDefinitie,
} from "@workspace/api-client-react";

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
}

interface WorkflowLane {
  id: number;
  workflow_id: number;
  naam: string;
  kleur: string;
  volgorde: number;
  cards: WorkflowCard[];
}

// ── Hulpfuncties ───────────────────────────────────────────────────────────────

const AI_TAKEN = [
  "AI leest",
  "AI controleert",
  "AI koppelt",
  "AI stelt voor",
  "AI maakt concept",
  "AI wacht op akkoord",
  "Mens akkoord nodig",
  "Automatisch na akkoord",
];

const AI_BADGE_KLEUR: Record<string, string> = {
  "AI leest": "bg-violet-100 text-violet-700 border-violet-200",
  "AI controleert": "bg-blue-100 text-blue-700 border-blue-200",
  "AI koppelt": "bg-indigo-100 text-indigo-700 border-indigo-200",
  "AI stelt voor": "bg-purple-100 text-purple-700 border-purple-200",
  "AI maakt concept": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  "AI wacht op akkoord": "bg-amber-100 text-amber-700 border-amber-200",
  "Mens akkoord nodig": "bg-orange-100 text-orange-700 border-orange-200",
  "Automatisch na akkoord": "bg-emerald-100 text-emerald-700 border-emerald-200",
};

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

// ── Proceskaart ────────────────────────────────────────────────────────────────

function ProcesKaart({
  card,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
}: {
  card: WorkflowCard;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onClick: () => void;
}) {
  const isBeslissing = card.type === "beslissing";

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
      `}
    >
      {/* Grip handle */}
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
        </div>
      )}

      {/* Title */}
      <p className={`text-sm font-medium text-gray-900 leading-snug pl-4 group-hover:pl-4 ${isDragging ? "" : ""}`}>
        {card.titel}
      </p>

      {/* Role */}
      {card.rol && (
        <p className="mt-1 text-[11px] text-gray-500 pl-4">{card.rol}</p>
      )}

      {/* AI badge */}
      {card.ai_taak && (
        <div className="mt-2 pl-4">
          <AiBadge taak={card.ai_taak} />
        </div>
      )}

      {/* Uitzonderingsroute */}
      {isBeslissing && card.uitzonderingsroute && (
        <div className="mt-2 flex items-start gap-1 pl-4">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
          <p className="text-[10px] text-amber-700 leading-tight">{card.uitzonderingsroute}</p>
        </div>
      )}

      {/* Module koppeling */}
      {card.gekoppelde_module && (
        <div className="mt-1.5 pl-4">
          <span className="text-[10px] text-gray-400">{card.gekoppelde_module}</span>
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

  return (
    <div className="flex w-72 shrink-0 flex-col">
      {/* Lane header */}
      <div
        className="mb-2 flex items-center justify-between rounded-lg px-3 py-2.5"
        style={{ backgroundColor: lane.kleur + "20", borderLeft: `4px solid ${lane.kleur}` }}
      >
        <div className="flex items-center gap-2">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: lane.kleur }}
          />
          <span className="text-sm font-semibold text-gray-800">{lane.naam}</span>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: lane.kleur + "30", color: lane.kleur }}
        >
          {lane.cards.filter((c) => c.actief).length}
        </span>
      </div>

      {/* Drop zone + cards */}
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
            {/* Drop indicator: before this card */}
            {dropBeforeCardId === card.id && dropTargetLaneId === lane.id && (
              <div className="mb-1.5 h-0.5 rounded-full bg-orange-400 mx-1" />
            )}
            <ProcesKaart
              card={card}
              isDragging={draggingCardId === card.id}
              isDropTarget={dropBeforeCardId === card.id && dropTargetLaneId === lane.id}
              onDragStart={(e) => {
                e.stopPropagation();
                onCardDragStart(card.id, lane.id);
              }}
              onDragOver={(e) => onCardDragOver(e, card.id, lane.id)}
              onDragLeave={onCardDragLeave}
              onDrop={(e) => onCardDrop(e, card.id, lane.id)}
              onClick={() => onCardClick(card)}
            />
          </div>
        ))}

        {/* Empty state */}
        {lane.cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center py-6">
            <p className="text-xs text-gray-400">Sleep een kaart hiernaartoe</p>
          </div>
        )}
      </div>

      {/* Add card knop */}
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
}

function CardEditSheet({
  card,
  lanes,
  open,
  onClose,
  onSave,
  onDelete,
}: {
  card: WorkflowCard | null;
  lanes: WorkflowLane[];
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
  });
  const [laneId, setLaneId] = useState<number | null>(null);
  const [opslaan, setOpslaan] = useState(false);

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
      });
      setLaneId(card.lane_id);
    }
  }, [card]);

  if (!card) return null;

  const handleSave = async () => {
    setOpslaan(true);
    await onSave(card.id, { ...form, lane_id: laneId ?? card.lane_id });
    setOpslaan(false);
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <GitBranch className="h-4 w-4 text-orange-500" />
            Kaart bewerken
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Titel */}
          <div className="space-y-1.5">
            <Label>Titel</Label>
            <Input
              value={form.titel}
              onChange={(e) => setForm((f) => ({ ...f, titel: e.target.value }))}
              placeholder="Naam van de processtap"
            />
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stap">Processtap</SelectItem>
                <SelectItem value="beslissing">Beslismoment</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Afdeling / Lane */}
          <div className="space-y-1.5">
            <Label>Afdeling</Label>
            <Select
              value={laneId?.toString() ?? ""}
              onValueChange={(v) => setLaneId(Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {lanes.map((l) => (
                  <SelectItem key={l.id} value={l.id.toString()}>
                    {l.naam}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Omschrijving */}
          <div className="space-y-1.5">
            <Label>Omschrijving</Label>
            <Textarea
              value={form.omschrijving}
              onChange={(e) => setForm((f) => ({ ...f, omschrijving: e.target.value }))}
              rows={3}
              placeholder="Wat gebeurt er in deze stap?"
            />
          </div>

          {/* Invoer / Uitvoer */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Invoer</Label>
              <Textarea
                value={form.invoer}
                onChange={(e) => setForm((f) => ({ ...f, invoer: e.target.value }))}
                rows={2}
                placeholder="Wat gaat erin?"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Uitvoer</Label>
              <Textarea
                value={form.uitvoer}
                onChange={(e) => setForm((f) => ({ ...f, uitvoer: e.target.value }))}
                rows={2}
                placeholder="Wat komt eruit?"
              />
            </div>
          </div>

          {/* Verantwoordelijke rol */}
          <div className="space-y-1.5">
            <Label>Verantwoordelijke rol</Label>
            <Input
              value={form.rol}
              onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value }))}
              placeholder="bijv. Projectleider, Administratie, Systeem"
            />
          </div>

          {/* AI-taak */}
          <div className="space-y-1.5">
            <Label>AI-taak</Label>
            <Select
              value={form.ai_taak || "__geen__"}
              onValueChange={(v) => setForm((f) => ({ ...f, ai_taak: v === "__geen__" ? "" : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Geen AI-rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__geen__">Geen AI-rol</SelectItem>
                {AI_TAKEN.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Akkoord door */}
          <div className="space-y-1.5">
            <Label>Verplicht akkoord door</Label>
            <Input
              value={form.akkoord_door}
              onChange={(e) => setForm((f) => ({ ...f, akkoord_door: e.target.value }))}
              placeholder="bijv. Directie, Projectleider"
            />
          </div>

          {/* Gekoppelde module */}
          <div className="space-y-1.5">
            <Label>Gekoppelde module</Label>
            <Input
              value={form.gekoppelde_module}
              onChange={(e) => setForm((f) => ({ ...f, gekoppelde_module: e.target.value }))}
              placeholder="bijv. Factuurverwerking, Planning"
            />
          </div>

          {/* Uitzonderingsroute */}
          {form.type === "beslissing" && (
            <div className="space-y-1.5">
              <Label>Uitzonderingsroute (Nee-pad)</Label>
              <Textarea
                value={form.uitzonderingsroute}
                onChange={(e) => setForm((f) => ({ ...f, uitzonderingsroute: e.target.value }))}
                rows={2}
                placeholder="Wat gebeurt er bij afkeuring of afwijking?"
              />
            </div>
          )}

          {/* Actief */}
          <div className="flex items-center gap-3">
            <Switch
              checked={form.actief}
              onCheckedChange={(v) => setForm((f) => ({ ...f, actief: v }))}
            />
            <Label>Stap actief</Label>
          </div>
        </div>

        <SheetFooter className="mt-6 flex items-center justify-between">
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
            <Button variant="outline" onClick={onClose}>
              Annuleren
            </Button>
            <Button onClick={handleSave} disabled={opslaan || !form.titel}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              {opslaan ? "Opslaan..." : "Opslaan"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── Nieuw kaart formulier ──────────────────────────────────────────────────────

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
  const { toast } = useToast();

  useEffect(() => {
    if (open) { setTitel(""); setType("stap"); }
  }, [open]);

  const handleSubmit = async () => {
    if (!titel || !laneId) return;
    setOpslaan(true);
    try {
      const res = await fetch("/api/workflow-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          workflow_id: workflowId,
          lane_id: laneId,
          type,
          titel,
        }),
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
            <Label>Titel</Label>
            <Input
              autoFocus
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              placeholder="Naam van de stap"
            />
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
        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button onClick={handleSubmit} disabled={opslaan || !titel}>
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

  // Lokale lanes state voor optimistische DnD updates
  const [localLanes, setLocalLanes] = useState<WorkflowLane[]>([]);

  useEffect(() => {
    if (werkflow && "lanes" in werkflow) {
      setLocalLanes((werkflow as unknown as { lanes: WorkflowLane[] }).lanes ?? []);
    }
  }, [werkflow]);

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

  const handleCardDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
  };

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

  const voerVerplaatsUit = async (cardId: number, targetLaneId: number, beforeCardId: number | null) => {
    const targetLane = localLanes.find((l) => l.id === targetLaneId);
    if (!targetLane) return;

    // Bereken nieuwe volgorde
    let nieuweVolgorde: number;
    if (beforeCardId) {
      const idx = targetLane.cards.findIndex((c) => c.id === beforeCardId);
      nieuweVolgorde = idx > 0 ? targetLane.cards[idx - 1].volgorde + 0.5 : -0.5;
    } else {
      nieuweVolgorde = targetLane.cards.length > 0
        ? Math.max(...targetLane.cards.map((c) => c.volgorde)) + 1
        : 0;
    }

    // Optimistische update
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
    setDraggingCardId(null);
    setDraggingSourceLaneId(null);
    setDropTargetLaneId(null);
    setDropBeforeCardId(null);
  };

  const handleCardDrop = (e: React.DragEvent, beforeCardId: number, laneId: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggingCardId) return;
    voerVerplaatsUit(draggingCardId, laneId, beforeCardId);
    setDraggingCardId(null);
    setDraggingSourceLaneId(null);
    setDropTargetLaneId(null);
    setDropBeforeCardId(null);
  };

  // ── Kaart opslaan ─────────────────────────────────────────────────────────────

  const handleCardSave = async (id: number, data: Record<string, unknown>) => {
    try {
      const payload: Record<string, unknown> = {};
      if (data.titel !== undefined) payload.titel = data.titel;
      if (data.type !== undefined) payload.type = data.type;
      if (data.omschrijving !== undefined) payload.omschrijving = data.omschrijving || null;
      if (data.invoer !== undefined) payload.invoer = data.invoer || null;
      if (data.uitvoer !== undefined) payload.uitvoer = data.uitvoer || null;
      if (data.rol !== undefined) payload.rol = data.rol || null;
      if (data.ai_taak !== undefined) payload.ai_taak = data.ai_taak || null;
      if (data.akkoord_door !== undefined) payload.akkoord_door = data.akkoord_door || null;
      if (data.gekoppelde_module !== undefined) payload.gekoppelde_module = data.gekoppelde_module || null;
      if (data.uitzonderingsroute !== undefined) payload.uitzonderingsroute = data.uitzonderingsroute || null;
      if (data.actief !== undefined) payload.actief = data.actief;
      if (data.lane_id !== undefined) payload.lane_id = data.lane_id;

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

  // ── Kaart verwijderen ─────────────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────────────

  const isLaden = ladenLijst || ladenDetail;

  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* Topbalk */}
      <div className="flex shrink-0 items-center justify-between border-b bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <GitBranch className="h-5 w-5 text-orange-500" />
          <h1 className="text-lg font-semibold text-gray-900">Workflow Designer</h1>

          {/* Workflow selector */}
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
          <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs">
            <Settings className="h-3.5 w-3.5" />
            Instellingen
          </Button>
        </div>
      </div>

      {/* Omschrijving workflow */}
      {werkflow && "omschrijving" in werkflow && werkflow.omschrijving && (
        <div className="shrink-0 border-b bg-white px-6 py-2">
          <p className="text-sm text-gray-500">{werkflow.omschrijving as string}</p>
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
              setDraggingCardId(null);
              setDraggingSourceLaneId(null);
              setDropTargetLaneId(null);
              setDropBeforeCardId(null);
            }}
          >
            {localLanes.map((lane) => (
              <Swimlane
                key={lane.id}
                lane={lane}
                draggingCardId={draggingCardId}
                dropTargetLaneId={dropTargetLaneId}
                dropBeforeCardId={dropBeforeCardId}
                onCardDragStart={handleCardDragStart}
                onCardDragOver={handleCardDragOver}
                onCardDragLeave={handleCardDragLeave}
                onLaneDragOver={handleLaneDragOver}
                onLaneDragLeave={handleLaneDragLeave}
                onLaneDrop={handleLaneDrop}
                onCardDrop={handleCardDrop}
                onCardClick={(card) => {
                  setSelectedCard(card);
                  setEditOpen(true);
                }}
                onAddCard={(laneId) => {
                  setAddLaneId(laneId);
                  setAddOpen(true);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Legenda */}
      {!isLaden && localLanes.length > 0 && (
        <div className="shrink-0 border-t bg-white px-6 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-xs font-medium text-gray-400">AI-labels:</span>
            {Object.entries(AI_BADGE_KLEUR).map(([taak, kleur]) => (
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
    </div>
  );
}
