import type { Moment, MomentContext, MomentType } from "./types";
import { verjaardagMomentType } from "./verjaardag";

// Registreer hier elk nieuw Moment-type; de route en het datacontract hoeven
// dan niet te wijzigen.
const MOMENT_TYPES: MomentType[] = [verjaardagMomentType];

export async function momentenVandaag(ctx: MomentContext): Promise<Moment[]> {
  const resultaten = await Promise.all(MOMENT_TYPES.map((t) => t.vandaag(ctx)));
  return resultaten.flat();
}
