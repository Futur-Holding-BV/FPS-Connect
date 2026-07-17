import { useState } from "react";
import { Plus, Package, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface MiddelItem {
  id: number;
  categorie: string;
  naam: string;
  status: string;
  retour_vereist: boolean;
  opmerking: string | null;
  aangevraagd_op: string | null;
  uitgegeven_op: string | null;
}

interface Props {
  middelen: MiddelItem[];
  magBewerken: boolean;
  onStatusWijzig: (id: number, status: string) => void;
  onVerwijder: (id: number) => void;
  onToevoegen: (naam: string, categorie: string, retourVereist: boolean) => void;
}

const CATEGORIEEN = [
  "werkkleding", "pbm", "gereedschap", "voertuig", "telefoon", "laptop",
  "tablet", "toegangspas", "sleutels", "overig",
];

const STATUS_KLEUR: Record<string, string> = {
  aangevraagd: "bg-gray-100 text-gray-700",
  uitgegeven: "bg-blue-100 text-blue-700",
  ontvangen: "bg-green-100 text-green-700",
  retour_aangevraagd: "bg-amber-100 text-amber-700",
  retour_ontvangen: "bg-gray-100 text-gray-500",
};

const STATUS_LABELS: Record<string, string> = {
  aangevraagd: "Aangevraagd",
  uitgegeven: "Uitgegeven",
  ontvangen: "Ontvangen",
  retour_aangevraagd: "Retour aangevraagd",
  retour_ontvangen: "Retour ontvangen",
};

const VOLGENDE_STATUS: Record<string, string> = {
  aangevraagd: "uitgegeven",
  uitgegeven: "ontvangen",
  ontvangen: "retour_aangevraagd",
  retour_aangevraagd: "retour_ontvangen",
};

export function MiddelenKaart({ middelen, magBewerken, onStatusWijzig, onVerwijder, onToevoegen }: Props) {
  const [nieuwNaam, setNieuwNaam] = useState("");
  const [nieuwCategorie, setNieuwCategorie] = useState("overig");
  const [nieuwRetour, setNieuwRetour] = useState(false);
  const [bezig, setBezig] = useState(false);

  const groeperOpCategorie = middelen.reduce<Record<string, MiddelItem[]>>((acc, m) => {
    if (!acc[m.categorie]) acc[m.categorie] = [];
    acc[m.categorie].push(m);
    return acc;
  }, {});

  async function toevoegen() {
    if (!nieuwNaam.trim()) return;
    setBezig(true);
    await onToevoegen(nieuwNaam.trim(), nieuwCategorie, nieuwRetour);
    setNieuwNaam("");
    setBezig(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Middelen</h3>
        <Badge variant="secondary" className="text-xs">{middelen.length}</Badge>
      </div>

      {Object.entries(groeperOpCategorie).map(([cat, items]) => (
        <div key={cat} className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground capitalize">{cat}</p>
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 rounded-lg border p-2.5">
              <span className="flex-1 text-sm">{item.naam}</span>
              <Badge className={cn("text-xs", STATUS_KLEUR[item.status] ?? "bg-gray-100 text-gray-700")}>
                {STATUS_LABELS[item.status] ?? item.status}
              </Badge>
              {item.retour_vereist && (
                <span className="text-xs text-muted-foreground">Retour vereist</span>
              )}
              {magBewerken && VOLGENDE_STATUS[item.status] && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-blue-600"
                  title={`Markeer als: ${STATUS_LABELS[VOLGENDE_STATUS[item.status]] ?? ""}`}
                  onClick={() => onStatusWijzig(item.id, VOLGENDE_STATUS[item.status])}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </Button>
              )}
              {magBewerken && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-destructive/50 hover:text-destructive"
                  onClick={() => onVerwijder(item.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      ))}

      {middelen.length === 0 && (
        <p className="text-sm text-muted-foreground py-1">Nog geen middelen toegewezen.</p>
      )}

      {magBewerken && (
        <div className="flex gap-2 flex-wrap">
          <Input
            value={nieuwNaam}
            onChange={(e) => setNieuwNaam(e.target.value)}
            placeholder="Naam middel..."
            className="h-8 text-sm min-w-[140px] flex-1"
            onKeyDown={(e) => e.key === "Enter" && toevoegen()}
          />
          <Select value={nieuwCategorie} onValueChange={setNieuwCategorie}>
            <SelectTrigger className="h-8 text-sm w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIEEN.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-8 shrink-0"
            onClick={toevoegen}
            disabled={bezig || !nieuwNaam.trim()}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
