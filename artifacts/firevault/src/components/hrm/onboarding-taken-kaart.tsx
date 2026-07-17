import { useState } from "react";
import { Plus, Check, Clock, AlertCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface OnboardingTaakItem {
  id: number;
  naam: string;
  status: string;
  categorie: string | null;
  deadline: string | null;
  verantwoordelijke_naam: string | null;
  opmerking: string | null;
}

interface Props {
  taken: OnboardingTaakItem[];
  magBewerken: boolean;
  onStatusWijzig: (id: number, status: string) => void;
  onVerwijder: (id: number) => void;
  onToevoegen: (naam: string, categorie?: string) => void;
}

const STATUS_STIJL: Record<string, string> = {
  openstaand: "border-gray-200 bg-white",
  in_uitvoering: "border-blue-200 bg-blue-50/40",
  afgerond: "border-green-200 bg-green-50/30 opacity-70",
  vervallen: "border-red-200 bg-red-50/30 opacity-60",
};

const STATUS_ICOON = {
  openstaand: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
  in_uitvoering: <Clock className="h-3.5 w-3.5 text-blue-600" />,
  afgerond: <Check className="h-3.5 w-3.5 text-green-600" />,
  vervallen: <AlertCircle className="h-3.5 w-3.5 text-red-600" />,
};

export function OnboardingTakenKaart({ taken, magBewerken, onStatusWijzig, onVerwijder, onToevoegen }: Props) {
  const [nieuwNaam, setNieuwNaam] = useState("");
  const [bezig, setBezig] = useState(false);

  async function toevoegen() {
    if (!nieuwNaam.trim()) return;
    setBezig(true);
    await onToevoegen(nieuwNaam.trim());
    setNieuwNaam("");
    setBezig(false);
  }

  const voltooid = taken.filter((t) => t.status === "afgerond").length;
  const totaal = taken.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Onboarding-taken
          {totaal > 0 && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {voltooid}/{totaal} voltooid
            </span>
          )}
        </h3>
      </div>

      {totaal > 0 && (
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div
            className="bg-green-500 h-1.5 rounded-full transition-all"
            style={{ width: totaal > 0 ? `${(voltooid / totaal) * 100}%` : "0%" }}
          />
        </div>
      )}

      <div className="space-y-1.5">
        {taken.map((taak) => (
          <div
            key={taak.id}
            className={cn("flex items-center gap-2 rounded-lg border p-2.5", STATUS_STIJL[taak.status] ?? STATUS_STIJL.openstaand)}
          >
            {STATUS_ICOON[taak.status as keyof typeof STATUS_ICOON] ?? STATUS_ICOON.openstaand}
            <span className={cn("flex-1 text-sm", taak.status === "afgerond" && "line-through text-muted-foreground")}>
              {taak.naam}
            </span>
            {taak.deadline && (
              <span className="text-xs text-muted-foreground">{taak.deadline}</span>
            )}
            {taak.categorie && (
              <Badge variant="secondary" className="text-xs">{taak.categorie}</Badge>
            )}
            {magBewerken && taak.status !== "afgerond" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-green-600 hover:text-green-700"
                title="Markeer als afgerond"
                onClick={() => onStatusWijzig(taak.id, "afgerond")}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
            )}
            {magBewerken && taak.status === "afgerond" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground"
                title="Heropen taak"
                onClick={() => onStatusWijzig(taak.id, "openstaand")}
              >
                <Clock className="h-3.5 w-3.5" />
              </Button>
            )}
            {magBewerken && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-destructive/50 hover:text-destructive"
                title="Verwijder taak"
                onClick={() => onVerwijder(taak.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
        {taken.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">Nog geen taken aangemaakt.</p>
        )}
      </div>

      {magBewerken && (
        <div className="flex gap-2">
          <Input
            value={nieuwNaam}
            onChange={(e) => setNieuwNaam(e.target.value)}
            placeholder="Nieuwe taak toevoegen..."
            className="h-8 text-sm"
            onKeyDown={(e) => e.key === "Enter" && toevoegen()}
          />
          <Button size="sm" className="h-8 shrink-0" onClick={toevoegen} disabled={bezig || !nieuwNaam.trim()}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
