// Pure (DB-loze) logica voor de automatische herkomst-/presetkoppeling.
//
// Apart van de route gehouden zodat de randgevallen met unittests geborgd zijn:
// een lege/rechtloze matrix mag NIET koppelen, exact één match wel, en meerdere
// identieke profielen mogen NIET koppelen (geen valse koppeling). De route
// (gebruikers.ts) haalt de profielen uit de DB en delegeert de beslissing
// hierheen.
import { heeftEnigeToegang, bevoegdhedenGelijk } from "@workspace/permissies";

export interface HerkomstProfiel {
  id: number;
  bevoegdheden: Record<string, number> | null | undefined;
}

// Detecteer of een bevoegdheden-matrix exact overeenkomt met precies één
// profiel. Retourneert dat profiel-id, of null bij:
//   - een lege (geen-toegang) matrix — voorkomt koppeling van rechtloze accounts;
//   - geen enkele match;
//   - meerdere matches (toevallig identieke profielen) — voorkomt valse koppeling.
export function kiesUniekeHerkomstPreset(
  bevoegdheden: Record<string, number> | null | undefined,
  profielen: HerkomstProfiel[],
): number | null {
  if (!heeftEnigeToegang(bevoegdheden ?? {})) return null;
  const matches = profielen.filter((p) =>
    bevoegdhedenGelijk(p.bevoegdheden ?? {}, bevoegdheden ?? {}),
  );
  return matches.length === 1 ? matches[0]!.id : null;
}

// PATCH-voorwaarde: automatisch (her)koppelen mag alleen wanneer de bevoegdheden
// wijzigen EN er nog geen herkomst is gezet. Een bestaande herkomst blijft dus
// altijd ongemoeid bij een automatische afleiding.
export function magAutomatischKoppelen(
  bevoegdhedenGewijzigd: boolean,
  bestaandeHerkomstProfielId: number | null | undefined,
): boolean {
  return bevoegdhedenGewijzigd && bestaandeHerkomstProfielId == null;
}
