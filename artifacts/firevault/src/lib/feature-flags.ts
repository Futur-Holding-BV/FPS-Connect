/**
 * Feature flags — FPS Connect
 *
 * Stuur via omgevingsvariabelen (VITE_FEATURE_*):
 *   VITE_FEATURE_PLANNING=true|false          — default: true  (aan)
 *   VITE_FEATURE_CALCULATIE=true|false        — default: true  (aan)
 *   VITE_FEATURE_WIZARD_ONBOARDING=true|false — default: false (UIT)
 *
 * Gebruik de omgevingsvariabelen om een module per omgeving in- of
 * uit te schakelen zonder code-aanpassing.
 *
 * LET OP: wizardOnboarding gebruikt het opt-in patroon (=== "true")
 * zodat de productie-default gegarandeerd UIT is, ook als de variabele
 * niet is ingesteld.
 */

export const featureFlags = {
  planning: import.meta.env.VITE_FEATURE_PLANNING !== "false",
  calculatie: import.meta.env.VITE_FEATURE_CALCULATIE !== "false",
  wizardOnboarding: import.meta.env.VITE_FEATURE_WIZARD_ONBOARDING === "true",
} as const;
