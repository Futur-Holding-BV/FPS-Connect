import { useState } from "react";
import { X, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  useListLabels,
  useCreateLabel,
  getListLabelsQueryKey,
} from "@workspace/api-client-react";
import type { Label } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  typeCode: string;
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
  magLabelsAanmaken?: boolean;
}

export function ToepassingMultiSelect({
  typeCode,
  selectedIds,
  onSelectionChange,
  magLabelsAanmaken,
}: Props) {
  const queryClient = useQueryClient();
  const { data: labels = [] } = useListLabels({ type_code: typeCode });
  const maakLabel = useCreateLabel();

  const [nieuwNaam, setNieuwNaam] = useState("");
  const [nieuwFabrikant, setNieuwFabrikant] = useState("");
  const [nieuwTestnorm, setNieuwTestnorm] = useState("");
  const [toonFormulier, setToonFormulier] = useState(false);

  function toggle(id: number) {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((x) => x !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  }

  async function bewaarNieuw() {
    if (!nieuwNaam.trim()) return;
    const l = await maakLabel.mutateAsync({
      data: {
        applicatie_codes: [typeCode],
        naam: nieuwNaam.trim(),
        fabrikant: nieuwFabrikant.trim() || undefined,
        testnorm: nieuwTestnorm.trim() || undefined,
      },
    });
    await queryClient.invalidateQueries({
      queryKey: getListLabelsQueryKey({ type_code: typeCode }),
    });
    onSelectionChange([...selectedIds, l.id]);
    setNieuwNaam("");
    setNieuwFabrikant("");
    setNieuwTestnorm("");
    setToonFormulier(false);
  }

  const actief = (labels as Label[]).filter((l) => !l.gearchiveerd);

  return (
    <div className="space-y-2">
      {actief.length === 0 && !toonFormulier && (
        <p className="text-xs text-muted-foreground italic">
          Geen toepassingen beschikbaar voor dit type.
          {magLabelsAanmaken && " Voeg er hieronder een toe."}
        </p>
      )}

      {actief.map((l: Label) => (
        <div key={l.id} className="flex items-start gap-2">
          <Checkbox
            id={`label-${l.id}`}
            checked={selectedIds.includes(l.id)}
            onCheckedChange={() => toggle(l.id)}
            className="mt-0.5"
          />
          <label
            htmlFor={`label-${l.id}`}
            className="text-sm cursor-pointer leading-tight"
          >
            {l.naam}
            {l.fabrikant && (
              <span className="text-muted-foreground ml-2 text-xs">
                {l.fabrikant}
              </span>
            )}
            {l.testnorm && (
              <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0">
                {l.testnorm}
              </Badge>
            )}
          </label>
        </div>
      ))}

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1 border-t">
          {selectedIds.map((id) => {
            const l = (labels as Label[]).find((x) => x.id === id);
            if (!l) return null;
            return (
              <Badge key={id} variant="secondary" className="gap-1 text-xs">
                {l.naam}
                <X
                  className="h-3 w-3 cursor-pointer hover:text-destructive"
                  onClick={() => toggle(id)}
                />
              </Badge>
            );
          })}
        </div>
      )}

      {magLabelsAanmaken && !toonFormulier && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs h-7 px-2 mt-1"
          onClick={() => setToonFormulier(true)}
        >
          <Plus className="h-3 w-3 mr-1" />
          Nieuwe toepassing
        </Button>
      )}

      {magLabelsAanmaken && toonFormulier && (
        <div className="border rounded-md p-3 space-y-2 bg-muted/30">
          <p className="text-xs font-medium">Nieuwe toepassing toevoegen</p>
          <Input
            placeholder="Naam *"
            value={nieuwNaam}
            onChange={(e) => setNieuwNaam(e.target.value)}
            className="h-8 text-sm"
          />
          <Input
            placeholder="Fabrikant (optioneel)"
            value={nieuwFabrikant}
            onChange={(e) => setNieuwFabrikant(e.target.value)}
            className="h-8 text-sm"
          />
          <Input
            placeholder="Testnorm (optioneel, bijv. EN 1366-2)"
            value={nieuwTestnorm}
            onChange={(e) => setNieuwTestnorm(e.target.value)}
            className="h-8 text-sm"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              onClick={bewaarNieuw}
              disabled={!nieuwNaam.trim() || maakLabel.isPending}
            >
              {maakLabel.isPending ? "Toevoegen..." : "Toevoegen"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => {
                setToonFormulier(false);
                setNieuwNaam("");
                setNieuwFabrikant("");
                setNieuwTestnorm("");
              }}
            >
              Annuleren
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
