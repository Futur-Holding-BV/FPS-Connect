export const HERVATBARE_ONBOARDING_STATUSSEN = [
  "concept",
  "in_voorbereiding",
  "wacht_op_documenten",
  "wacht_op_beoordeling",
  "klaar_voor_indiensttreding",
  "onboarding_bezig",
] as const;

const HERVATBARE_ONBOARDING_STATUSSET = new Set<string>(HERVATBARE_ONBOARDING_STATUSSEN);

export function isHervatbareOnboardingStatus(status: string | null | undefined): boolean {
  return typeof status === "string" && HERVATBARE_ONBOARDING_STATUSSET.has(status);
}