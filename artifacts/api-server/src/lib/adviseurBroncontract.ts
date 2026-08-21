import type { Citatie } from "./adviseurPersistentie";
import { normaliseerCitaties } from "./adviseurPersistentie";

export interface AdviseurBron {
  id: string;
  citatie: Citatie;
  inhoud: string;
}

export interface AdviseurClaimBewijs {
  tekst: string;
  bronIds: string[];
}

export type GevalideerdModelAntwoord =
  | {
      uitkomst: "beantwoord";
      antwoord: string;
      bronIds: string[];
      citaties: Citatie[];
      claims: AdviseurClaimBewijs[];
    }
  | {
      uitkomst: "geen_data" | "geen_toegang";
      antwoord: "";
      bronIds: [];
      citaties: [];
    }
  | {
      uitkomst: "verduidelijking";
      antwoord: string;
      bronIds: [];
      citaties: [];
    };

export type BroncontractResultaat =
  | { ok: true; waarde: GevalideerdModelAntwoord }
  | { ok: false; reden: string };

function schoonBronId(waarde: unknown): string | null {
  if (typeof waarde !== "string") return null;
  const id = waarde.trim();
  return /^[A-Z][A-Z0-9_]{0,39}$/.test(id) ? id : null;
}

/**
 * Alleen deze broncatalogus mag het model als onderbouwing gebruiken. De
 * bron-id wordt door de server uitgegeven en is niet door de client te kiezen.
 */
export function bouwBronCatalogus(bronnen: AdviseurBron[]): string {
  if (bronnen.length === 0) return "(geen geautoriseerde bronnen beschikbaar)";
  return bronnen.map((bron) => [
    `BRON-ID: ${bron.id}`,
    `LABEL: ${bron.citatie.label}`,
    `HERKOMST: ${bron.citatie.bron}`,
    `INHOUD: ${bron.inhoud.slice(0, 20_000)}`,
  ].join("\n")).join("\n\n---\n\n");
}

const MAX_BRON_INHOUD = 20_000;
export const MAX_BEWIJS_BRONNEN = 12;

/**
 * Audit uitsluitend het bewijs dat het antwoord echt gebruikte. De inhoud is
 * op dezelfde lengte begrensd als wat de modelcatalogus bevat.
 */
export function bouwGebruiktBronbewijs(
  bronnen: AdviseurBron[],
  bronIds: string[],
): Array<{ id: string; inhoud: string; citatie: Citatie }> {
  const perId = new Map(bronnen.map((bron) => [bron.id, bron]));
  return [...new Set(bronIds)].map((id) => {
    const bron = perId.get(id);
    if (!bron) throw new Error(`Onbekende gebruikte bron: ${id}`);
    return {
      id,
      inhoud: bron.inhoud.slice(0, MAX_BRON_INHOUD),
      citatie: bron.citatie,
    };
  });
}

/**
 * Fail-closed claimcontract. Bij een feitelijk antwoord bestaat de uiteindelijke
 * tekst uitsluitend uit claims die elk minimaal één bekende serverbron noemen.
 * Vrije tekst buiten claims wordt nooit aan de gebruiker teruggegeven.
 */
export function valideerModelAntwoord(
  rauw: string,
  beschikbareBronnen: AdviseurBron[],
): BroncontractResultaat {
  let waarde: unknown;
  try {
    waarde = JSON.parse(rauw.trim());
  } catch {
    return { ok: false, reden: "modeluitvoer is geen geldige JSON" };
  }
  if (!waarde || typeof waarde !== "object" || Array.isArray(waarde)) {
    return { ok: false, reden: "modeluitvoer is geen object" };
  }

  const object = waarde as Record<string, unknown>;
  const uitkomst = object.uitkomst;
  if (!["beantwoord", "geen_data", "geen_toegang", "verduidelijking"].includes(String(uitkomst))) {
    return { ok: false, reden: "onbekende uitkomst in broncontract" };
  }

  if (uitkomst === "geen_data" || uitkomst === "geen_toegang") {
    return {
      ok: true,
      waarde: { uitkomst, antwoord: "", bronIds: [], citaties: [] },
    };
  }

  if (uitkomst === "verduidelijking") {
    const antwoord = typeof object.antwoord === "string" ? object.antwoord.trim() : "";
    if (!antwoord || antwoord.length > 700 || !antwoord.endsWith("?")) {
      return { ok: false, reden: "verduidelijking is geen korte vraag" };
    }
    return {
      ok: true,
      waarde: { uitkomst: "verduidelijking", antwoord, bronIds: [], citaties: [] },
    };
  }

  if (!Array.isArray(object.claims) || object.claims.length === 0 || object.claims.length > 20) {
    return { ok: false, reden: "feitelijk antwoord mist begrensde claims" };
  }

  const bronPerId = new Map(beschikbareBronnen.map((bron) => [bron.id, bron]));
  const gebruikteBronIds: string[] = [];
  const claimTeksten: string[] = [];
  const claimBronnen: string[][] = [];

  for (const claimRuw of object.claims) {
    if (!claimRuw || typeof claimRuw !== "object" || Array.isArray(claimRuw)) {
      return { ok: false, reden: "ongeldige claim" };
    }
    const claim = claimRuw as Record<string, unknown>;
    const tekst = typeof claim.tekst === "string" ? claim.tekst.trim() : "";
    if (!tekst || tekst.length > 1_500) {
      return { ok: false, reden: "claimtekst ontbreekt of is te lang" };
    }
    if (!Array.isArray(claim.bron_ids) || claim.bron_ids.length === 0 || claim.bron_ids.length > 8) {
      return { ok: false, reden: "claim mist bron-id" };
    }

    const claimBronIds = claim.bron_ids.map(schoonBronId);
    if (claimBronIds.some((id) => id == null)) {
      return { ok: false, reden: "claim bevat een ongeldig bron-id" };
    }
    for (const id of claimBronIds as string[]) {
      if (!bronPerId.has(id)) {
        return { ok: false, reden: `claim verwijst naar onbekende bron ${id}` };
      }
      if (!gebruikteBronIds.includes(id)) gebruikteBronIds.push(id);
    }
    claimTeksten.push(tekst);
    claimBronnen.push(claimBronIds as string[]);
  }

  const citaties = normaliseerCitaties(
    gebruikteBronIds.map((id) => bronPerId.get(id)!.citatie),
  );
  if (gebruikteBronIds.length > MAX_BEWIJS_BRONNEN) {
    return { ok: false, reden: "te veel verschillende bewijsbronnen" };
  }
  if (citaties.length === 0) {
    return { ok: false, reden: "claims leverden geen geldige citatie op" };
  }
  const bronNummer = new Map(
    gebruikteBronIds.map((id, index) => [id, index + 1]),
  );
  const antwoordMetBronnummers = claimTeksten.map((tekst, index) => {
    const nummers = claimBronnen[index]!
      .map((id) => bronNummer.get(id))
      .filter((nummer): nummer is number => nummer != null);
    return `${tekst} [${nummers.join(", ")}]`;
  }).join("\n\n");

  return {
    ok: true,
    waarde: {
      uitkomst: "beantwoord",
      antwoord: antwoordMetBronnummers,
      bronIds: gebruikteBronIds,
      citaties,
      claims: claimTeksten.map((tekst, index) => ({
        tekst,
        bronIds: [...new Set(claimBronnen[index]!)],
      })),
    },
  };
}