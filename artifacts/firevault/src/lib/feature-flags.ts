/**
 * Feature flags — FPS Connect
 *
 * Stuur via omgevingsvariabelen (VITE_FEATURE_*):
 *   VITE_FEATURE_PLANNING=true|false   — default: true  (aan voor pilot)
 *   VITE_FEATURE_CALCULATIE=true|false — default: false (uit voor pilot)
 *
 * Pilot-regel: Calculatie is standaard uitgeschakeld. Planning V1 is
 * standaard ingeschakeld als ondersteunende module. Beide kunnen per
 * omgeving worden in-/uitgeschakeld zonder code-aanpassing.
 */

export const featureFlags = {
  planning: import.meta.env.VITE_FEATURE_PLANNING !== "false",
  calculatie: import.meta.env.VITE_FEATURE_CALCULATIE === "true",
} as const;
