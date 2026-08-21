// WERKBAK_01 — één werkbak per persoon: rechterzijpaneel (geen popup) met
// alles wat een handeling (Doen) of aandacht (Weten) vraagt, gerangschikt op
// consequentie. Items verdwijnen nooit vanzelf: afhandelen of wegzetten met
// reden. Verlofaanvragen zijn inline te beoordelen; overige items deep-linken
// naar het item zelf.
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListWerkbakItems,
  getListWerkbakItemsQueryKey,
  useGetWerkbakAantal,
  getGetWerkbakAantalQueryKey,
  useHandelWerkbakItemAf,
  useZetWerkbakItemWeg,
  useListAlleVerlofAanvragen,
  useUpdateVerlofAanvraag,
  getListAlleVerlofAanvragenQueryKey,
} from "@workspace/api-client-react";
import type { WerkbakItem } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Check, ExternalLink, Archive, CircleAlert, ListTodo, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useNavigatieBewaking } from "@/context/navigatie-bewaking";

const BRON_LABELS: Record<string, string> = {
  goedkeuringsaanvraag: "Goedkeuring",
  verlofaanvraag: "Verlof",
  factuur_goedkeuring: "Factuur",
  betaalbatch: "Betaalbatch",
  conceptantwoord: "Aanvraag",
  mail_antwoord: "Mail",
  contractbesluit: "Contract",
  leverancier_beoordeling: "Leverancier",
  poortwachter: "Poortwachter",
  verloopdatum: "Verloopdatum",
  verlofverjaring: "Verlofverjaring",
  factuursignaal: "Factuursignaal",
  factuur_zonder_leverancier: "Leverancier",
  contract_verlenging: "Contract",
  bewakingsloop: "Systeem",
};

/** Badge-hook voor de zijrand-knop: aantal open werkbak-items (60s-refresh). */
export function useWerkbakAantal(): number {
  const { data: aantal, refetch } = useGetWerkbakAantal();
  useEffect(() => {
    const timer = setInterval(() => void refetch(), 60000);
    return () => clearInterval(timer);
  }, [refetch]);
  return aantal?.totaal ?? 0;
}

/** Alleen de werkbak-inhoud (lijst) — wordt in de gedeelde zijrand getoond (ASSISTENT_01 §3). */
export function WerkbakInhoud({ onNavigeer, actief = true }: { onNavigeer: () => void; actief?: boolean }) {
  const { data: items, isLoading } = useListWerkbakItems({ query: { enabled: actief, queryKey: getListWerkbakItemsQueryKey() } });
  const doen = useMemo(() => (items ?? []).filter((i) => i.soort === "doen"), [items]);
  const weten = useMemo(() => (items ?? []).filter((i) => i.soort === "weten"), [items]);
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-4" data-testid="paneel-werkbak">
        {isLoading && <p className="text-sm text-muted-foreground">Laden…</p>}
        {!isLoading && doen.length === 0 && weten.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center" data-testid="tekst-werkbak-leeg">
            Niets te doen — de werkbak is leeg.
          </p>
        )}
        {doen.length > 0 && (
          <section data-testid="sectie-werkbak-doen">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground mb-2">
              <ListTodo className="h-3.5 w-3.5" /> Doen ({doen.length})
            </h3>
            <div className="space-y-2">
              {doen.map((item) => <WerkbakItemKaart key={item.id} item={item} onNavigeer={onNavigeer} />)}
            </div>
          </section>
        )}
        {weten.length > 0 && (
          <section data-testid="sectie-werkbak-weten">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground mb-2">
              <Info className="h-3.5 w-3.5" /> Weten ({weten.length})
            </h3>
            <div className="space-y-2">
              {weten.map((item) => <WerkbakItemKaart key={item.id} item={item} onNavigeer={onNavigeer} />)}
            </div>
          </section>
        )}
    </div>
  );
}

function WerkbakItemKaart({ item, onNavigeer }: { item: WerkbakItem; onNavigeer: () => void }) {
  const [locatie] = useLocation();
  const { requestNavigatie } = useNavigatieBewaking();
  const [wegzetten, setWegzetten] = useState(false);
  const [reden, setReden] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const invalideer = (): void => {
    void queryClient.invalidateQueries({ queryKey: getListWerkbakItemsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetWerkbakAantalQueryKey() });
  };
  const afhandelen = useHandelWerkbakItemAf({ mutation: { onSuccess: invalideer } });
  const wegzettenMutatie = useZetWerkbakItemWeg({
    mutation: {
      onSuccess: () => { invalideer(); setWegzetten(false); },
      onError: () => toast({ title: "Wegzetten mislukt", variant: "destructive" }),
    },
  });
  const urgent = item.gewicht >= 85;
  return (
    <div
      className={cn("rounded-md border p-2.5 text-sm space-y-1.5", urgent ? "border-destructive/50 bg-destructive/5" : "border-border")}
      data-testid={`kaart-werkbak-item-${item.id}`}
    >
      <div className="flex items-start gap-1.5">
        {urgent && <CircleAlert className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />}
        <p className="font-medium leading-snug flex-1">{item.titel}</p>
        <Badge variant="secondary" className="text-[10px] shrink-0">{BRON_LABELS[item.bron] ?? item.bron}</Badge>
      </div>
      {item.omschrijving && <p className="text-xs text-muted-foreground leading-snug">{item.omschrijving}</p>}
      {wegzetten ? (
        <div className="space-y-1.5">
          <Textarea
            value={reden}
            onChange={(e) => setReden(e.target.value)}
            placeholder="Waarom zet je dit weg? (verplicht)"
            className="text-xs min-h-14"
            data-testid={`invoer-wegzet-reden-${item.id}`}
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!reden.trim() || wegzettenMutatie.isPending}
              onClick={() => wegzettenMutatie.mutate({ id: item.id, data: { reden: reden.trim() } })}
              data-testid={`knop-wegzet-bevestig-${item.id}`}
            >
              Wegzetten
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setWegzetten(false)}>Annuleren</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 flex-wrap">
          {item.actie_type === "verlof_beoordelen" && item.herkomst_id != null && (
            <VerlofInlineActies verlofId={item.herkomst_id} werkbakItemId={item.id} naInline={invalideer} />
          )}
          {item.actie_pad && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                requestNavigatie(item.actie_pad!, {
                  instroom: { label: "Werkbak", pad: locatie },
                });
                onNavigeer();
              }}
              data-testid={`knop-open-item-${item.id}`}
            >
              <ExternalLink className="h-3 w-3 mr-1" /> Openen
            </Button>
          )}
          {item.actie_type !== "verlof_beoordelen" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={afhandelen.isPending}
              onClick={() => afhandelen.mutate({ id: item.id })}
              data-testid={`knop-afhandelen-${item.id}`}
            >
              <Check className="h-3 w-3 mr-1" /> Afgehandeld
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => setWegzetten(true)}
            data-testid={`knop-wegzetten-${item.id}`}
          >
            <Archive className="h-3 w-3 mr-1" /> Wegzetten
          </Button>
        </div>
      )}
    </div>
  );
}

// Inline verlof beoordelen (§4.3): goedkeuren/afwijzen zonder het paneel te
// verlaten. Na de beoordeling handelt de bron-reconciliatie het item af; we
// invalideren direct zodat het meteen verdwijnt uit de lijst.
function VerlofInlineActies({ verlofId, werkbakItemId, naInline }: { verlofId: number; werkbakItemId: number; naInline: () => void }) {
  const { data: aanvragen } = useListAlleVerlofAanvragen();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const afhandelen = useHandelWerkbakItemAf();
  const aanvraag = (aanvragen ?? []).find((a) => a.id === verlofId);
  const update = useUpdateVerlofAanvraag({
    mutation: {
      onSuccess: async () => {
        // Bron is beoordeeld → werkbak-item afhandelen (herleidbare oorzaak).
        await afhandelen.mutateAsync({ id: werkbakItemId }).catch(() => undefined);
        void queryClient.invalidateQueries({ queryKey: getListAlleVerlofAanvragenQueryKey() });
        naInline();
        toast({ title: "Verlofaanvraag beoordeeld" });
      },
      onError: (err: unknown) => {
        const boodschap = err instanceof Error ? err.message : "Beoordelen mislukt";
        toast({ title: "Beoordelen mislukt", description: boodschap, variant: "destructive" });
      },
    },
  });
  if (!aanvraag) return null;
  const beoordeel = (status: "goedgekeurd" | "afgewezen"): void => {
    update.mutate({
      id: verlofId,
      data: {
        verlofsoort_id: aanvraag.verlofsoort_id,
        start_datum: aanvraag.start_datum,
        eind_datum: aanvraag.eind_datum,
        aantal_uren: aanvraag.aantal_uren,
        status,
      },
    });
  };
  return (
    <>
      <Button
        size="sm"
        className="h-7 text-xs"
        disabled={update.isPending}
        onClick={() => beoordeel("goedgekeurd")}
        data-testid={`knop-verlof-goedkeuren-${werkbakItemId}`}
      >
        <Check className="h-3 w-3 mr-1" /> Goedkeuren
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={update.isPending}
        onClick={() => beoordeel("afgewezen")}
        data-testid={`knop-verlof-afwijzen-${werkbakItemId}`}
      >
        Afwijzen
      </Button>
    </>
  );
}
