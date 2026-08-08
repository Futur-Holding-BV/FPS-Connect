// Vooraf-regelen-checklist (WVB_01): toegang, vergunning, V&G, hoogwerker.
// Onderdeel van de fase Voorbereiding op de opdracht-detailpagina.
import { useState } from "react";
import {
  useListOpdrachtChecklist,
  getListOpdrachtChecklistQueryKey,
  useInitialiseerOpdrachtChecklist,
  useCreateOpdrachtChecklistItem,
  usePatchOpdrachtChecklistItem,
  useDeleteOpdrachtChecklistItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ClipboardCheck, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CATEGORIE_LABELS: Record<string, string> = {
  toegang: "Toegang",
  vergunning: "Vergunning",
  veiligheid: "V&G",
  materieel: "Materieel",
  overig: "Overig",
};

export function ChecklistKaart({ opdrachtId, kanSchrijven }: { opdrachtId: number; kanSchrijven: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [nieuwLabel, setNieuwLabel] = useState("");

  const { data: items, isLoading } = useListOpdrachtChecklist(opdrachtId);
  const ververs = () =>
    queryClient.invalidateQueries({ queryKey: getListOpdrachtChecklistQueryKey(opdrachtId) });

  const initialiseer = useInitialiseerOpdrachtChecklist({
    mutation: { onSuccess: ververs, onError: () => toast({ title: "Initialiseren mislukt", variant: "destructive" }) },
  });
  const aanmaken = useCreateOpdrachtChecklistItem({
    mutation: {
      onSuccess: () => { setNieuwLabel(""); void ververs(); },
      onError: () => toast({ title: "Toevoegen mislukt", variant: "destructive" }),
    },
  });
  const bijwerken = usePatchOpdrachtChecklistItem({
    mutation: { onSuccess: ververs, onError: () => toast({ title: "Bijwerken mislukt", variant: "destructive" }) },
  });
  const verwijderen = useDeleteOpdrachtChecklistItem({
    mutation: { onSuccess: ververs, onError: () => toast({ title: "Verwijderen mislukt", variant: "destructive" }) },
  });

  const lijst = items ?? [];
  const afgevinkt = lijst.filter(i => i.afgevinkt).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4" />
          Vooraf regelen
          {lijst.length > 0 && (
            <Badge variant={afgevinkt === lijst.length ? "secondary" : "outline"} className="ml-auto">
              {afgevinkt}/{lijst.length} geregeld
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Laden…</p>
        ) : lijst.length === 0 ? (
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Nog geen checklist. Denk aan toegang, vergunning, V&G-plan en hoogwerker.</p>
            {kanSchrijven && (
              <Button
                size="sm"
                variant="outline"
                disabled={initialiseer.isPending}
                onClick={() => initialiseer.mutate({ id: opdrachtId })}
              >
                Standaard checklist aanmaken
              </Button>
            )}
          </div>
        ) : (
          lijst.map(item => (
            <div key={item.id} className="flex items-center gap-2 group">
              <Checkbox
                checked={item.afgevinkt}
                disabled={!kanSchrijven || bijwerken.isPending}
                onCheckedChange={(v) =>
                  bijwerken.mutate({ id: opdrachtId, itemId: item.id, data: { afgevinkt: v === true } })
                }
              />
              <span className={`text-sm flex-1 ${item.afgevinkt ? "line-through text-muted-foreground" : ""}`}>
                {item.label}
              </span>
              <Badge variant="outline" className="text-xs">
                {CATEGORIE_LABELS[item.categorie] ?? item.categorie}
              </Badge>
              {item.afgevinkt && item.afgevinkt_door && (
                <span className="text-xs text-muted-foreground hidden sm:inline">{item.afgevinkt_door}</span>
              )}
              {kanSchrijven && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100"
                  disabled={verwijderen.isPending}
                  onClick={() => verwijderen.mutate({ id: opdrachtId, itemId: item.id })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))
        )}
        {kanSchrijven && lijst.length > 0 && (
          <div className="flex items-center gap-2 pt-1">
            <Input
              placeholder="Nieuw punt om vooraf te regelen…"
              value={nieuwLabel}
              className="h-8"
              onChange={e => setNieuwLabel(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && nieuwLabel.trim()) {
                  aanmaken.mutate({ id: opdrachtId, data: { label: nieuwLabel.trim() } });
                }
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!nieuwLabel.trim() || aanmaken.isPending}
              onClick={() => aanmaken.mutate({ id: opdrachtId, data: { label: nieuwLabel.trim() } })}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
