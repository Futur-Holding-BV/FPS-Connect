import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useSetApplicatieLabels,
  useListLabels,
  getListLabelsQueryKey,
} from "@workspace/api-client-react";
import type { VoorzieningType, Label } from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label as UiLabel } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Boxes, Plus, X } from "lucide-react";
import { foutmelding } from "./documenten-tab";

// Detail-/beheerscherm voor een applicatie (voorziening-type). De applicatie zelf
// is een vaste catalogus en wordt hier alleen-lezen getoond; bewerkbaar is welke
// toepassingen (labels) aan deze applicatie gekoppeld zijn. Dit is de omgekeerde
// richting van het toepassing-detailscherm.
export function ApplicatieDetailDialog({
  applicatie,
  open,
  onOpenChange,
}: {
  applicatie: VoorzieningType | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        {open && applicatie ? (
          <ApplicatieDetailInhoud
            key={applicatie.code}
            applicatie={applicatie}
            onSluit={() => onOpenChange(false)}
          />
        ) : (
          <DialogHeader>
            <DialogTitle>Applicatie</DialogTitle>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ApplicatieDetailInhoud({
  applicatie,
  onSluit,
}: {
  applicatie: VoorzieningType;
  onSluit: () => void;
}) {
  const queryClient = useQueryClient();
  const { heeftNiveau } = useBevoegdheid();
  const magBewerken = heeftNiveau("bibliotheek", 2);

  const zetLabels = useSetApplicatieLabels();

  // De VOLLEDIGE huidige set gekoppelde toepassingen van deze applicatie,
  // inclusief gearchiveerde. Cruciaal: zo verdwijnt bij opslaan niet stilzwijgend
  // een (gearchiveerde) toepassing die nog gekoppeld was.
  const {
    data: gekoppeld = [],
    isLoading: gekoppeldLaadt,
    isError: gekoppeldFout,
    isSuccess: gekoppeldGeladen,
  } = useListLabels({ type_code: applicatie.code, inclusief_gearchiveerd: true });

  // Koppelbare toepassingen: alle niet-gearchiveerde toepassingen.
  const { data: alleLabels = [] } = useListLabels({});

  // De te bewaren set toepassing-ids. Geïnitialiseerd uit de volledige gekoppelde
  // set zodra die is geladen; daarna alleen door bewuste acties van de gebruiker
  // aangepast. labelIdsKlaar = de gekoppelde set is daadwerkelijk geladen EN
  // geïnitialiseerd. Pas dan mag opgeslagen worden: anders zou een nog-ladende of
  // mislukte query (data valt terug op []) bij opslaan stilzwijgend alle
  // koppelingen van deze applicatie wissen.
  const [labelIds, setLabelIds] = useState<number[]>([]);
  const [labelIdsKlaar, setLabelIdsKlaar] = useState(false);
  const geinitialiseerd = useRef(false);
  useEffect(() => {
    if (!geinitialiseerd.current && gekoppeldGeladen) {
      setLabelIds((gekoppeld as Label[]).map((l) => l.id));
      geinitialiseerd.current = true;
      setLabelIdsKlaar(true);
    }
  }, [gekoppeldGeladen, gekoppeld]);

  const [fout, setFout] = useState("");

  // Opzoektabel met metadata voor elke toepassing-id in de set. De gekoppelde set
  // (incl. gearchiveerd) is leidend, aangevuld met de niet-gearchiveerde lijst
  // zodat net-toegevoegde toepassingen ook hun gegevens tonen.
  const labelMap = useMemo(() => {
    const m = new Map<number, Label>();
    for (const l of alleLabels as Label[]) m.set(l.id, l);
    for (const l of gekoppeld as Label[]) m.set(l.id, l);
    return m;
  }, [alleLabels, gekoppeld]);

  const gekoppeldeLabels = labelIds
    .map((id) => labelMap.get(id))
    .filter((l): l is Label => Boolean(l));
  const koppelbaar = (alleLabels as Label[]).filter((l) => !labelIds.includes(l.id));

  const bezig = zetLabels.isPending;

  async function bewaar() {
    if (!labelIdsKlaar) return;
    setFout("");
    try {
      await zetLabels.mutateAsync({
        code: applicatie.code,
        data: { label_ids: labelIds },
      });
      await queryClient.invalidateQueries({ queryKey: getListLabelsQueryKey() });
      onSluit();
    } catch (err) {
      setFout(foutmelding(err, "Opslaan is mislukt. Probeer het opnieuw."));
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <span className="font-mono text-sm bg-muted px-1.5 py-0.5 rounded">
            {applicatie.code}
          </span>
          {applicatie.naam}
        </DialogTitle>
        <DialogDescription>
          {magBewerken
            ? "Beheer welke toepassingen aan deze applicatie zijn gekoppeld."
            : "Bekijk welke toepassingen aan deze applicatie zijn gekoppeld."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-xs text-muted-foreground">Categorie</span>
            <p className="font-medium">{applicatie.categorie}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Status</span>
            <p className="font-medium">{applicatie.actief ? "Actief" : "Inactief"}</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <UiLabel>Gekoppelde toepassingen</UiLabel>
            <span className="text-xs text-muted-foreground">{labelIds.length} gekoppeld</span>
          </div>

          {gekoppeldLaadt ? (
            <p className="text-xs text-muted-foreground p-2">Toepassingen laden…</p>
          ) : gekoppeldFout ? (
            <p className="text-xs text-destructive rounded-md border border-destructive/40 p-3 text-center">
              De gekoppelde toepassingen konden niet worden geladen. Sluit dit venster
              en probeer het opnieuw; opslaan is uitgeschakeld om te voorkomen dat
              koppelingen verloren gaan.
            </p>
          ) : gekoppeldeLabels.length === 0 ? (
            <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3 text-center">
              Nog geen toepassingen gekoppeld.
            </p>
          ) : (
            <div className="rounded-md border divide-y">
              {gekoppeldeLabels.map((l) => (
                <div key={l.id} className="flex items-center gap-2 p-2">
                  <Boxes className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{l.naam}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                      {l.fabrikant && (
                        <span className="text-xs text-muted-foreground">{l.fabrikant}</span>
                      )}
                      {l.testnorm && (
                        <Badge variant="outline" className="text-xs font-normal">
                          {l.testnorm}
                        </Badge>
                      )}
                      {l.gearchiveerd && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Gearchiveerd
                        </Badge>
                      )}
                    </div>
                  </div>
                  {magBewerken && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      title="Koppeling verwijderen"
                      onClick={() => setLabelIds((ids) => ids.filter((x) => x !== l.id))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {magBewerken && (
            <ToepassingKoppelen
              koppelbaar={koppelbaar}
              onKoppel={(id) =>
                setLabelIds((ids) => (ids.includes(id) ? ids : [...ids, id]))
              }
            />
          )}
        </div>

        {fout && <p className="text-sm text-destructive">{fout}</p>}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onSluit}>
          {magBewerken ? "Annuleren" : "Sluiten"}
        </Button>
        {magBewerken && (
          <Button onClick={bewaar} disabled={bezig || !labelIdsKlaar}>
            {bezig ? "Opslaan…" : "Opslaan"}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

// Inklapbare picker om een bestaande (niet-gearchiveerde) toepassing aan de
// applicatie te koppelen.
function ToepassingKoppelen({
  koppelbaar,
  onKoppel,
}: {
  koppelbaar: Label[];
  onKoppel: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [zoek, setZoek] = useState("");

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-4 w-4 mr-1.5" />
        Toepassing koppelen
      </Button>
    );
  }

  const gefilterd = koppelbaar.filter(
    (l) =>
      l.naam.toLowerCase().includes(zoek.toLowerCase()) ||
      (l.fabrikant ?? "").toLowerCase().includes(zoek.toLowerCase()),
  );

  return (
    <div className="rounded-md border p-2 space-y-2">
      <Input
        placeholder="Zoek een toepassing…"
        value={zoek}
        onChange={(e) => setZoek(e.target.value)}
        className="h-8 text-sm"
        autoFocus
      />
      <ScrollArea className="h-40">
        <div className="space-y-1">
          {gefilterd.length === 0 ? (
            <p className="text-xs text-muted-foreground p-2">
              Geen koppelbare toepassingen. Maak eerst een toepassing aan in de tab
              Toepassingen.
            </p>
          ) : (
            gefilterd.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => onKoppel(l.id)}
                className="w-full flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40 text-left"
              >
                <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm flex-1 truncate">{l.naam}</span>
                {l.fabrikant && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {l.fabrikant}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
