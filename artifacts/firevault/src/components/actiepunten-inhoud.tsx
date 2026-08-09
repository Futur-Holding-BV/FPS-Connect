// Actiepunten — persoonlijke to-dolijst van de hoofdbeheerder in de zijrand.
// Toont waar het platform op een mens wacht (Azure, mailing, VPS, app-stores)
// zodat René niets vergeet; afvinken, toevoegen en opruimen kan direct hier.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListActiepunten, getListActiepuntenQueryKey,
  useCreateActiepunt, useUpdateActiepunt, useDeleteActiepunt,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORIE_LABELS: Record<string, string> = {
  platform: "Platform & infrastructuur",
  testen: "Testen",
  "app-stores": "App-stores",
  overig: "Overig",
};
const CATEGORIE_VOLGORDE = ["platform", "testen", "app-stores", "overig"];

export function ActiepuntenInhoud() {
  const queryClient = useQueryClient();
  const { data: punten, isLoading } = useListActiepunten({ query: { queryKey: getListActiepuntenQueryKey() } });
  const ververs = () => queryClient.invalidateQueries({ queryKey: getListActiepuntenQueryKey() });
  const bijwerken = useUpdateActiepunt({ mutation: { onSuccess: ververs } });
  const toevoegen = useCreateActiepunt({ mutation: { onSuccess: ververs } });
  const verwijderen = useDeleteActiepunt({ mutation: { onSuccess: ververs } });
  const [nieuweTitel, setNieuweTitel] = useState("");

  if (isLoading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const lijst = punten ?? [];
  const open = lijst.filter((p) => p.status !== "afgerond");
  const afgerond = lijst.filter((p) => p.status === "afgerond");
  const categorieen = [...CATEGORIE_VOLGORDE.filter((c) => open.some((p) => p.categorie === c)),
    ...[...new Set(open.map((p) => p.categorie))].filter((c) => !CATEGORIE_VOLGORDE.includes(c))];

  const voegToe = () => {
    const titel = nieuweTitel.trim();
    if (!titel) return;
    toevoegen.mutate({ data: { titel, categorie: "overig" } });
    setNieuweTitel("");
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4" data-testid="lijst-actiepunten">
      <p className="text-xs text-muted-foreground">
        Acties die op jou wachten — afvinken zodra gedaan. Punten met een toelichting leggen uit waarom het platform hierop wacht.
      </p>

      {categorieen.map((cat) => (
        <div key={cat} className="space-y-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{CATEGORIE_LABELS[cat] ?? cat}</h3>
          {open.filter((p) => p.categorie === cat).map((p) => (
            <div key={p.id} className="flex items-start gap-2 rounded-md border border-border p-2" data-testid={`actiepunt-${p.id}`}>
              <Checkbox
                className="mt-0.5"
                checked={false}
                onCheckedChange={() => bijwerken.mutate({ id: p.id, data: { status: "afgerond" } })}
                data-testid={`vink-actiepunt-${p.id}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">{p.titel}</p>
                {p.omschrijving && <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{p.omschrijving}</p>}
              </div>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground" title="Verwijderen"
                onClick={() => verwijderen.mutate({ id: p.id })} data-testid={`verwijder-actiepunt-${p.id}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ))}

      {open.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">Niets meer te doen — alles is afgevinkt.</p>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={nieuweTitel}
          onChange={(e) => setNieuweTitel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") voegToe(); }}
          placeholder="Nieuw actiepunt…"
          className="h-8 text-sm"
          data-testid="invoer-nieuw-actiepunt"
        />
        <Button size="sm" className="h-8 px-2" onClick={voegToe} disabled={!nieuweTitel.trim()} data-testid="knop-actiepunt-toevoegen">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {afgerond.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-border">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Afgerond</h3>
          {afgerond.map((p) => (
            <div key={p.id} className="flex items-start gap-2 rounded-md p-2 opacity-70" data-testid={`actiepunt-${p.id}`}>
              <Checkbox
                className="mt-0.5"
                checked
                onCheckedChange={() => bijwerken.mutate({ id: p.id, data: { status: "open" } })}
                data-testid={`vink-actiepunt-${p.id}`}
              />
              <p className={cn("text-sm leading-snug flex-1 line-through text-muted-foreground")}>{p.titel}</p>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground" title="Verwijderen"
                onClick={() => verwijderen.mutate({ id: p.id })} data-testid={`verwijder-actiepunt-${p.id}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
