import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMijnVoorkeuren,
  useZetMijnVoorkeur,
  getGetMijnVoorkeurenQueryKey,
} from "@workspace/api-client-react";

/**
 * PANEEL_01 — statebeheer voor "werken in vaste banen".
 *
 * Persistentie loopt uitsluitend via de voorkeuren-API (net als MENU_01),
 * NIET via localStorage. Twee sleutels:
 *   - "paneel.indeling"   → de actieve indeling
 *   - "paneel.indelingen" → benoemde indelingen (max. 5)
 *
 * De twee standaardindelingen ("Calculeren", "Administratie") staan in code,
 * zijn niet verwijderbaar en tellen niet mee in de limiet van 5.
 */

export const SLEUTEL_ACTIEF = "paneel.indeling";
export const SLEUTEL_BENOEMD = "paneel.indelingen";

export const MAX_BENOEMDE_INDELINGEN = 5;
export const MIN_BAAN_PX = 360;
export const STANDAARD_TERUGVAL_PX = 1100;

export interface Baan {
  /** Genormaliseerd pad dat in de baan open staat. */
  pad: string;
}

export interface Indeling {
  banen: Baan[];
  /** Breedtes in procenten (react-resizable-panels layout), zelfde lengte als banen. */
  breedtes: number[];
  aantal: number;
  terugvalBreedte: number;
}

export interface BenoemdeIndeling {
  naam: string;
  indeling: Indeling;
}

function gelijkmatig(aantal: number): number[] {
  return Array.from({ length: aantal }, () => 100 / aantal);
}

function maakIndeling(paden: string[], terugval = STANDAARD_TERUGVAL_PX): Indeling {
  const aantal = paden.length;
  return {
    banen: paden.map((pad) => ({ pad })),
    breedtes: gelijkmatig(aantal),
    aantal,
    terugvalBreedte: terugval,
  };
}

/** Twee onveranderlijke standaardindelingen (§7 van de opdracht). */
export const STANDAARD_INDELINGEN: BenoemdeIndeling[] = [
  {
    naam: "Calculeren",
    indeling: maakIndeling([
      "/modules/calculatie",
      "/workflow",
      "/modules/calculatie",
    ]),
  },
  {
    naam: "Administratie",
    indeling: maakIndeling(["/workflow", "/scab-mail", "/facturen"]),
  },
];

const LEGE_INDELING: Indeling = maakIndeling(["/", "/workflow"]);

interface PaneelContextWaarde {
  gereed: boolean;
  paneelAan: boolean;
  indeling: Indeling;
  benoemde: BenoemdeIndeling[];
  standaard: BenoemdeIndeling[];
  vensterBreedte: number;
  /**
   * Werkelijke breedte van de paneelcontainer (hoofdcontent, ná aftrek van de
   * sidebar). Gemeten met een ResizeObserver; wordt gebruikt om te bepalen
   * hoeveel banen er van MIN_BAAN_PX passen.
   */
  beschikbareBreedte: number;
  zetBeschikbareBreedte: (px: number) => void;
  /** Maximaal aantal banen (2..4) dat past met elk minstens MIN_BAAN_PX. */
  maxBanenDiePassen: number;
  /**
   * True wanneer het huidige aantal banen niet meer past (venster/sidebar) of
   * onder de terugvalbreedte → terugval naar volle breedte (één weergave).
   */
  teSmal: boolean;
  zetPaneelAan: (aan: boolean) => void;
  zetAantalBanen: (aantal: number) => void;
  zetBaanPad: (index: number, pad: string) => void;
  /**
   * Sluit een baan. Bij 2 banen betekent sluiten dat de paneelmodus uitgaat
   * (volle breedte): het overgebleven pad wordt via `opVolleBreedte` als
   * hoofdvensterpad doorgegeven.
   */
  sluitBaan: (index: number, opVolleBreedte?: (pad: string) => void) => void;
  zetBreedtes: (breedtes: number[]) => void;
  zetTerugvalBreedte: (px: number) => void;
  slaIndelingOp: (naam: string) => { ok: boolean; reden?: string };
  laadIndeling: (naam: string) => void;
  verwijderIndeling: (naam: string) => void;
  /**
   * Loopt op bij het laden van een (standaard)indeling. Wordt als key gebruikt
   * zodat de banen — en dus hun memory-routers — hermounten op hun nieuwe
   * startpad. In-baan navigatie hoogt dit bewust NIET op (geen remount-lus).
   */
  generatie: number;
}

const PaneelContext = createContext<PaneelContextWaarde | null>(null);

export const MIN_BANEN = 2;
export const MAX_BANEN = 4;
export const MIN_TERUGVAL_PX = 800;
export const MAX_TERUGVAL_PX = 4000;

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function geldigPad(pad: unknown): pad is string {
  return typeof pad === "string" && pad.length > 0 && pad.startsWith("/");
}

/**
 * Strikte validatie van een (mogelijk corrupte) indeling uit de voorkeuren.
 * Geeft null terug wanneer de data onbruikbaar is, zodat de aanroeper
 * veilig kan terugvallen op een default.
 */
function valideerIndeling(ruw: unknown): Indeling | null {
  if (!ruw || typeof ruw !== "object") return null;
  const obj = ruw as Partial<Indeling>;

  if (!Array.isArray(obj.banen)) return null;
  const banen = obj.banen
    .filter((b): b is Baan => !!b && typeof b === "object" && geldigPad((b as Baan).pad))
    .map((b) => ({ pad: b.pad }));

  // Aantal moet 2..4 zijn en overeenkomen met het aantal geldige banen.
  if (banen.length < MIN_BANEN || banen.length > MAX_BANEN) return null;
  const aantal = banen.length;

  // Breedtes: numeriek, positief en van de juiste lengte, anders gelijk verdelen.
  let breedtes: number[];
  if (
    Array.isArray(obj.breedtes) &&
    obj.breedtes.length === aantal &&
    obj.breedtes.every((w) => typeof w === "number" && Number.isFinite(w) && w > 0)
  ) {
    breedtes = obj.breedtes;
  } else {
    breedtes = gelijkmatig(aantal);
  }

  const terugvalBreedte =
    typeof obj.terugvalBreedte === "number" && Number.isFinite(obj.terugvalBreedte)
      ? clamp(obj.terugvalBreedte, MIN_TERUGVAL_PX, MAX_TERUGVAL_PX)
      : STANDAARD_TERUGVAL_PX;

  return { banen, breedtes, aantal, terugvalBreedte };
}

function leesActief(bron: Record<string, unknown> | undefined): {
  aan: boolean;
  indeling: Indeling;
} {
  const ruw = bron?.[SLEUTEL_ACTIEF];
  if (ruw && typeof ruw === "object") {
    const indeling = valideerIndeling(ruw);
    if (indeling) {
      const aan = (ruw as { aan?: unknown }).aan === true;
      return { aan, indeling };
    }
  }
  // Corrupte of ontbrekende data → veilige default, paneelmodus uit.
  return { aan: false, indeling: LEGE_INDELING };
}

function leesBenoemd(bron: Record<string, unknown> | undefined): BenoemdeIndeling[] {
  const ruw = bron?.[SLEUTEL_BENOEMD];
  if (!Array.isArray(ruw)) return [];
  const lijst: BenoemdeIndeling[] = [];
  for (const x of ruw) {
    if (!x || typeof x !== "object") continue;
    const naam = (x as BenoemdeIndeling).naam;
    if (typeof naam !== "string" || !naam.trim()) continue;
    const indeling = valideerIndeling((x as BenoemdeIndeling).indeling);
    if (!indeling) continue; // corrupte benoemde indeling → overslaan
    lijst.push({ naam: naam.trim(), indeling });
    if (lijst.length >= MAX_BENOEMDE_INDELINGEN) break;
  }
  return lijst;
}

export function PaneelProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isSuccess } = useGetMijnVoorkeuren();
  const { mutate: zetVoorkeur } = useZetMijnVoorkeur();

  const [gereed, setGereed] = useState(false);
  const [paneelAan, setPaneelAan] = useState(false);
  const [indeling, setIndeling] = useState<Indeling>(LEGE_INDELING);
  const [benoemde, setBenoemde] = useState<BenoemdeIndeling[]>([]);
  const [generatie, setGeneratie] = useState(0);
  const [vensterBreedte, setVensterBreedte] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1920,
  );
  // Werkelijke paneelcontainer-breedte (ná sidebar). Initieel gelijk aan het
  // venster; wordt door BeheerderLayout via ResizeObserver bijgesteld.
  const [beschikbareBreedte, setBeschikbareBreedteState] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1920,
  );

  // Éénmalig herstellen bij binnenkomen van de servervoorkeuren.
  const hersteld = useRef(false);
  useEffect(() => {
    if (!isSuccess || hersteld.current) return;
    hersteld.current = true;
    const bron = (data ?? {}) as Record<string, unknown>;
    const actief = leesActief(bron);
    setPaneelAan(actief.aan);
    setIndeling(actief.indeling);
    setBenoemde(leesBenoemd(bron));
    setGereed(true);
  }, [isSuccess, data]);

  // Vensterbreedte volgen voor de terugval-drempel.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const meet = () => setVensterBreedte(window.innerWidth);
    window.addEventListener("resize", meet);
    return () => window.removeEventListener("resize", meet);
  }, []);

  const zetBeschikbareBreedte = useCallback((px: number) => {
    setBeschikbareBreedteState((huidig) => (Math.abs(huidig - px) < 1 ? huidig : px));
  }, []);

  // Ruwe schatting van de ruimte die naast de banen opgaat aan sleep-handles.
  const HANDLE_MARGE_PX = 12;

  // Hoeveel banen (2..4) passen er met elk minstens MIN_BAAN_PX?
  const maxBanenDiePassen = useMemo(() => {
    const bruikbaar = Math.max(beschikbareBreedte, 1);
    let max = 1;
    for (let n = MIN_BANEN; n <= MAX_BANEN; n++) {
      const nodig = n * MIN_BAAN_PX + (n - 1) * HANDLE_MARGE_PX;
      if (nodig <= bruikbaar) max = n;
    }
    return max;
  }, [beschikbareBreedte]);

  // Terugval naar volle breedte wanneer: het venster onder de terugvalbreedte
  // ligt, óf het actieve aantal banen niet meer past in de container.
  const teSmal =
    vensterBreedte < indeling.terugvalBreedte ||
    indeling.banen.length > maxBanenDiePassen;

  // Debounce het opslaan van de actieve indeling (o.a. breedtesleep).
  const opslaanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bewaarActief = useCallback(
    (aan: boolean, ind: Indeling, direct = false) => {
      const doeHet = () => {
        zetVoorkeur(
          { sleutel: SLEUTEL_ACTIEF, data: { waarde: { aan, ...ind } } },
          {
            onSuccess: () => {
              void queryClient.invalidateQueries({
                queryKey: getGetMijnVoorkeurenQueryKey(),
              });
            },
          },
        );
      };
      if (opslaanTimer.current) clearTimeout(opslaanTimer.current);
      if (direct) {
        doeHet();
        return;
      }
      opslaanTimer.current = setTimeout(doeHet, 600);
    },
    [zetVoorkeur, queryClient],
  );

  const bewaarBenoemd = useCallback(
    (lijst: BenoemdeIndeling[]) => {
      zetVoorkeur(
        { sleutel: SLEUTEL_BENOEMD, data: { waarde: lijst } },
        {
          onSuccess: () => {
            void queryClient.invalidateQueries({
              queryKey: getGetMijnVoorkeurenQueryKey(),
            });
          },
        },
      );
    },
    [zetVoorkeur, queryClient],
  );

  const zetPaneelAan = useCallback(
    (aan: boolean) => {
      setPaneelAan(aan);
      setIndeling((huidig) => {
        bewaarActief(aan, huidig, true);
        return huidig;
      });
    },
    [bewaarActief],
  );

  const zetAantalBanen = useCallback(
    (aantal: number) => {
      setIndeling((huidig) => {
        let banen = huidig.banen.slice(0, aantal);
        while (banen.length < aantal) {
          banen = [...banen, { pad: "/" }];
        }
        const volgend: Indeling = {
          ...huidig,
          banen,
          aantal,
          breedtes: gelijkmatig(aantal),
        };
        bewaarActief(true, volgend, true);
        return volgend;
      });
    },
    [bewaarActief],
  );

  const zetBaanPad = useCallback(
    (index: number, pad: string) => {
      setIndeling((huidig) => {
        if (index < 0 || index >= huidig.banen.length) return huidig;
        const banen = huidig.banen.map((b, i) =>
          i === index ? { ...b, pad } : b,
        );
        const volgend: Indeling = { ...huidig, banen };
        bewaarActief(true, volgend, true);
        return volgend;
      });
    },
    [bewaarActief],
  );

  const sluitBaan = useCallback(
    (index: number, opVolleBreedte?: (pad: string) => void) => {
      setIndeling((huidig) => {
        if (index < 0 || index >= huidig.banen.length) return huidig;
        // Bij 2 banen: sluiten → paneelmodus uit, overgebleven pad naar het
        // hoofdvenster (volle breedte). We houden dan minimaal MIN_BANEN banen
        // in de bewaarde indeling zodat heropenen weer met 2 banen begint.
        if (huidig.banen.length <= MIN_BANEN) {
          const overgeblevenIndex = index === 0 ? 1 : 0;
          const overgeblevenPad = huidig.banen[overgeblevenIndex]?.pad ?? "/";
          setPaneelAan(false);
          bewaarActief(false, huidig, true);
          if (opVolleBreedte) opVolleBreedte(overgeblevenPad);
          return huidig;
        }
        const banen = huidig.banen.filter((_, i) => i !== index);
        const volgend: Indeling = {
          ...huidig,
          banen,
          aantal: banen.length,
          breedtes: gelijkmatig(banen.length),
        };
        bewaarActief(true, volgend, true);
        return volgend;
      });
    },
    [bewaarActief],
  );

  const zetBreedtes = useCallback(
    (breedtes: number[]) => {
      setIndeling((huidig) => {
        if (breedtes.length !== huidig.banen.length) return huidig;
        const volgend: Indeling = { ...huidig, breedtes };
        bewaarActief(paneelAan, volgend, false);
        return volgend;
      });
    },
    [bewaarActief, paneelAan],
  );

  const zetTerugvalBreedte = useCallback(
    (px: number) => {
      setIndeling((huidig) => {
        const volgend: Indeling = { ...huidig, terugvalBreedte: px };
        bewaarActief(paneelAan, volgend, true);
        return volgend;
      });
    },
    [bewaarActief, paneelAan],
  );

  const slaIndelingOp = useCallback(
    (naam: string): { ok: boolean; reden?: string } => {
      const schoon = naam.trim();
      if (!schoon) return { ok: false, reden: "Geef de indeling een naam." };
      const isStandaard = STANDAARD_INDELINGEN.some(
        (s) => s.naam.toLowerCase() === schoon.toLowerCase(),
      );
      if (isStandaard) {
        return {
          ok: false,
          reden: "Deze naam is voorbehouden aan een standaardindeling.",
        };
      }
      const bestaatAl = benoemde.some(
        (b) => b.naam.toLowerCase() === schoon.toLowerCase(),
      );
      if (!bestaatAl && benoemde.length >= MAX_BENOEMDE_INDELINGEN) {
        return {
          ok: false,
          reden: `Je kunt maximaal ${MAX_BENOEMDE_INDELINGEN} eigen indelingen bewaren. Verwijder er eerst één.`,
        };
      }
      const nieuw: BenoemdeIndeling = { naam: schoon, indeling };
      const lijst = bestaatAl
        ? benoemde.map((b) =>
            b.naam.toLowerCase() === schoon.toLowerCase() ? nieuw : b,
          )
        : [...benoemde, nieuw];
      setBenoemde(lijst);
      bewaarBenoemd(lijst);
      return { ok: true };
    },
    [benoemde, indeling, bewaarBenoemd],
  );

  const laadIndeling = useCallback(
    (naam: string) => {
      const bron =
        STANDAARD_INDELINGEN.find((s) => s.naam === naam) ??
        benoemde.find((b) => b.naam === naam);
      if (!bron) return;
      // Diepe kopie zodat verder bewerken de bewaarde indeling niet muteert.
      const kopie: Indeling = {
        banen: bron.indeling.banen.map((b) => ({ pad: b.pad })),
        breedtes: bron.indeling.breedtes.slice(),
        aantal: bron.indeling.aantal,
        terugvalBreedte: bron.indeling.terugvalBreedte,
      };
      setIndeling(kopie);
      setPaneelAan(true);
      // Hermount de banen zodat hun memory-routers op het nieuwe startpad beginnen.
      setGeneratie((g) => g + 1);
      bewaarActief(true, kopie, true);
    },
    [benoemde, bewaarActief],
  );

  const verwijderIndeling = useCallback(
    (naam: string) => {
      const lijst = benoemde.filter((b) => b.naam !== naam);
      setBenoemde(lijst);
      bewaarBenoemd(lijst);
    },
    [benoemde, bewaarBenoemd],
  );

  const waarde = useMemo<PaneelContextWaarde>(
    () => ({
      gereed,
      paneelAan,
      indeling,
      benoemde,
      standaard: STANDAARD_INDELINGEN,
      vensterBreedte,
      beschikbareBreedte,
      zetBeschikbareBreedte,
      maxBanenDiePassen,
      teSmal,
      zetPaneelAan,
      zetAantalBanen,
      zetBaanPad,
      sluitBaan,
      zetBreedtes,
      zetTerugvalBreedte,
      slaIndelingOp,
      laadIndeling,
      verwijderIndeling,
      generatie,
    }),
    [
      gereed,
      paneelAan,
      indeling,
      benoemde,
      vensterBreedte,
      beschikbareBreedte,
      zetBeschikbareBreedte,
      maxBanenDiePassen,
      teSmal,
      zetPaneelAan,
      zetAantalBanen,
      zetBaanPad,
      sluitBaan,
      zetBreedtes,
      zetTerugvalBreedte,
      slaIndelingOp,
      laadIndeling,
      verwijderIndeling,
      generatie,
    ],
  );

  return (
    <PaneelContext.Provider value={waarde}>{children}</PaneelContext.Provider>
  );
}

export function usePaneel(): PaneelContextWaarde {
  const ctx = useContext(PaneelContext);
  if (!ctx) {
    throw new Error("usePaneel moet binnen een PaneelProvider gebruikt worden");
  }
  return ctx;
}
