import { useCallback, useMemo } from "react";
import { useVoorkeur } from "@/hooks/use-voorkeur";

/**
 * Herbruikbare hook voor het herschikken (drag-and-drop) en onthouden van de
 * volgorde + uitgeklapt/ingeklapt-status van hoofdstukken (uitklapbare
 * groepen) in een sidebar. Werkt met stabiele sleutels die losstaan van de
 * render-/weergavevolgorde, zodat zichtbaarheid (bevoegdheden) hier volledig
 * onafhankelijk van blijft — deze hook bepaalt uitsluitend de vólgorde en
 * open/dicht-status van hoofdstukken die de aanroepende component al toont.
 *
 * Opslag verloopt via `useVoorkeur` (localStorage, per browser) — hetzelfde
 * patroon als andere UI-voorkeuren in de app.
 */
export function useSidebarHoofdstukken(sleutelPrefix: string, standaardVolgorde: string[]) {
  const [opgeslagenVolgorde, setOpgeslagenVolgorde, wisVolgorde] = useVoorkeur<string[]>(
    `${sleutelPrefix}_volgorde`,
    standaardVolgorde,
  );
  const [openStatus, setOpenStatus, wisOpenStatus] = useVoorkeur<Record<string, boolean>>(
    `${sleutelPrefix}_open`,
    {},
  );

  // Voegt nieuwe hoofdstukken (nog niet in de bewaarde volgorde) toe aan het
  // eind, en filtert verwijderde hoofdstukken eruit — zo blijft een bewaarde
  // volgorde altijd geldig, ook als de lijst met hoofdstukken later wijzigt.
  const volgorde = useMemo(() => {
    const bekend = new Set(standaardVolgorde);
    const gefilterd = opgeslagenVolgorde.filter((sleutel) => bekend.has(sleutel));
    const ontbrekend = standaardVolgorde.filter((sleutel) => !gefilterd.includes(sleutel));
    return [...gefilterd, ...ontbrekend];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opgeslagenVolgorde, JSON.stringify(standaardVolgorde)]);

  const isAangepast =
    volgorde.join("|") !== standaardVolgorde.join("|") || Object.keys(openStatus).length > 0;

  const hoofdstukPositie = useCallback(
    (sleutel: string) => {
      const index = volgorde.indexOf(sleutel);
      return index === -1 ? standaardVolgorde.length : index;
    },
    [volgorde, standaardVolgorde.length],
  );

  const verplaatsHoofdstuk = useCallback(
    (vanSleutel: string, naarSleutel: string) => {
      if (vanSleutel === naarSleutel) return;
      setOpgeslagenVolgorde(() => {
        const lijst = [...volgorde];
        const vanIndex = lijst.indexOf(vanSleutel);
        if (vanIndex === -1 || !lijst.includes(naarSleutel)) return lijst;
        lijst.splice(vanIndex, 1);
        const naarIndex = lijst.indexOf(naarSleutel);
        lijst.splice(naarIndex, 0, vanSleutel);
        return lijst;
      });
    },
    [volgorde, setOpgeslagenVolgorde],
  );

  const hoofdstukOpen = useCallback(
    (sleutel: string, standaard = true) => openStatus[sleutel] ?? standaard,
    [openStatus],
  );

  const setHoofdstukOpen = useCallback(
    (sleutel: string, open: boolean) => {
      setOpenStatus((huidig) => ({ ...huidig, [sleutel]: open }));
    },
    [setOpenStatus],
  );

  const herstelStandaard = useCallback(() => {
    wisVolgorde();
    wisOpenStatus();
  }, [wisVolgorde, wisOpenStatus]);

  return {
    volgorde,
    hoofdstukPositie,
    verplaatsHoofdstuk,
    hoofdstukOpen,
    setHoofdstukOpen,
    herstelStandaard,
    isAangepast,
  };
}
