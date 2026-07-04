/**
 * Feature flags — FPS Connect
 *
 * Stuur via omgevingsvariabelen (VITE_FEATURE_*):
 *   VITE_FEATURE_PLANNING=true|false   — default: true  (aan)
 *   VITE_FEATURE_CALCULATIE=true|false — default: true  (aan)
 *
 * Beide modules zijn ingeschakeld. Gebruik de omgevingsvariabelen om
 * een module per omgeving in- of uit te schakelen zonder code-aanpassing.
 */

export const featureFlags = {
  planning: import.meta.env.VITE_FEATURE_PLANNING !== "false",
  calculatie: import.meta.env.VITE_FEATURE_CALCULATIE !== "false",
} as const;
