import React, { useCallback, useMemo } from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Baan } from "./baan";
import { usePaneel, MIN_BAAN_PX } from "./paneel-context";
import { normaliseerPad } from "@/lib/paneel-geschiktheid";

/**
 * PANEEL_01 — de banen naast elkaar. Vaste banen (react-resizable-panels),
 * geen zwevende vensters. Onder de terugvalbreedte valt het scherm terug op
 * één baan (gewone weergave) — dat wordt in BeheerderLayout afgehandeld.
 */

interface BanenWeergaveProps {
  /** Open een niet-geschikt pad over de volle breedte in het hoofdvenster. */
  onNietGeschikt: (pad: string) => void;
  /**
   * Navigeer het hoofdvenster naar een pad zonder "niet geschikt"-melding —
   * gebruikt wanneer de laatste twee banen naar één (volle breedte) terugvalt.
   */
  onNaarVolleBreedte: (pad: string) => void;
}

export function BanenWeergave({
  onNietGeschikt,
  onNaarVolleBreedte,
}: BanenWeergaveProps) {
  const {
    indeling,
    beschikbareBreedte,
    zetBaanPad,
    sluitBaan,
    zetBreedtes,
    generatie,
  } = usePaneel();

  const banen = indeling.banen;

  // Minimum als percentage van de (werkelijk gemeten) beschikbare breedte,
  // zodat een baan nooit onbruikbaar smal wordt (~360px).
  const minPercent = useMemo(() => {
    const beschikbaar = Math.max(beschikbareBreedte, 1);
    const pct = (MIN_BAAN_PX / beschikbaar) * 100;
    // Nooit meer dan een eerlijk gelijk deel afdwingen.
    const maxHaalbaar = 100 / banen.length;
    return Math.min(pct, maxHaalbaar);
  }, [beschikbareBreedte, banen.length]);

  // Bereken per baan met welke andere banen hij exact hetzelfde object toont.
  const duplicaten = useMemo(() => {
    return banen.map((baan, i) => {
      const mijn = normaliseerPad(baan.pad);
      const anderen: number[] = [];
      banen.forEach((andere, j) => {
        if (j !== i && normaliseerPad(andere.pad) === mijn) anderen.push(j);
      });
      return anderen;
    });
  }, [banen]);

  const onLayout = useCallback(
    (layout: number[]) => {
      zetBreedtes(layout);
    },
    [zetBreedtes],
  );

  // Stabiele key per baan zodat de memory-router blijft leven tijdens slepen,
  // maar herbouwt wanneer het aantal banen wijzigt.
  return (
    <div className="h-full min-h-0">
      <ResizablePanelGroup
        direction="horizontal"
        onLayout={onLayout}
        className="h-full"
        // Herbouw de groep als het aantal banen wijzigt (nieuwe layout).
        key={`banen-${generatie}-${banen.length}`}
      >
        {banen.map((baan, i) => (
          <React.Fragment key={`baan-${generatie}-${i}`}>
            {i > 0 && <ResizableHandle withHandle />}
            <ResizablePanel
              defaultSize={indeling.breedtes[i] ?? 100 / banen.length}
              minSize={minPercent}
              className="min-h-0"
            >
              <Baan
                index={i}
                startPad={baan.pad}
                duplicaatVan={duplicaten[i]}
                onPadWijzig={zetBaanPad}
                onSluit={(idx) => sluitBaan(idx, onNaarVolleBreedte)}
                onNietGeschikt={onNietGeschikt}
              />
            </ResizablePanel>
          </React.Fragment>
        ))}
      </ResizablePanelGroup>
    </div>
  );
}
