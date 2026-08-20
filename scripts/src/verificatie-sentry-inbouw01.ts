/**
 * Statische regressiepoort voor de gedeelde Sentry-privacygrens.
 *
 * Bewaakt dat API, Firevault en FPS Monteur vóór verzending dezelfde
 * allowlist gebruiken en dat urgentie niet in de bronapplicaties wordt
 * bepaald. Externe Sentry-events en futur-control worden apart bewezen.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

async function lees(relatief: string): Promise<string> {
  return readFile(path.join(ROOT, relatief), "utf8");
}

function eis(
  voorwaarde: boolean,
  melding: string,
  fouten: string[],
): void {
  if (!voorwaarde) fouten.push(melding);
}

async function main(): Promise<void> {
  const [
    gedeeld,
    instrument,
    foutafhandelaar,
    health,
    testRoute,
    apiTest,
    web,
    mobiel,
    layout,
    metro,
    appJson,
    mobielPackage,
  ] = await Promise.all([
    lees("lib/foutmonitoring/src/index.ts"),
    lees("artifacts/api-server/src/instrument.ts"),
    lees("artifacts/api-server/src/middlewares/foutafhandelaar.ts"),
    lees("artifacts/api-server/src/routes/health.ts"),
    lees("artifacts/api-server/src/routes/actiepunten.ts"),
    lees("artifacts/api-server/src/__tests__/sentry-scrub.test.ts"),
    lees("artifacts/firevault/src/lib/foutmonitoring.ts"),
    lees("artifacts/monteur-app/lib/foutmonitoring.ts"),
    lees("artifacts/monteur-app/app/_layout.tsx"),
    lees("artifacts/monteur-app/metro.config.js"),
    lees("artifacts/monteur-app/app.json"),
    lees("artifacts/monteur-app/package.json"),
  ]);
  const fouten: string[] = [];

  for (const [naam, bron] of [
    ["API", instrument],
    ["Firevault", web],
    ["FPS Monteur", mobiel],
  ] as const) {
    eis(
      bron.includes("maakVeiligMonitoringEvent"),
      `${naam} gebruikt de gedeelde event-allowlist niet`,
      fouten,
    );
    eis(
      bron.includes("beforeSend"),
      `${naam} heeft geen beforeSend-privacygrens`,
      fouten,
    );
  }

  eis(
    gedeeld.includes("verwijderGevoeligeVelden") &&
      gedeeld.includes("WeakSet<object>"),
    "gedeelde recursieve veldnamenfilter ontbreekt",
    fouten,
  );
  for (const veld of [
    "wachtwoord",
    "token",
    "bsn",
    "adres",
    "klant",
    "naam",
    "email",
  ]) {
    eis(
      gedeeld.includes(`"${veld}"`),
      `gevoelig veld '${veld}' ontbreekt in de centrale filter`,
      fouten,
    );
  }
  eis(
    !gedeeld.includes('"urgentie"') &&
      !foutafhandelaar.includes("urgentie") &&
      !web.includes("urgentie") &&
      !mobiel.includes("urgentie"),
    "een bronapplicatie bepaalt nog urgentie; dit hoort alleen in futur-control",
    fouten,
  );
  eis(
    foutafhandelaar.includes("normaliseerMonitoringPad") &&
      foutafhandelaar.includes("${req.method.toUpperCase()}:${pad}"),
    "API levert geen queryloos methode/pad-label aan",
    fouten,
  );
  eis(
    gedeeld.includes('"routing_bewijs"') &&
      foutafhandelaar.includes("createHmac") &&
      foutafhandelaar.includes("SENTRY_ROUTING_SIGNING_SECRET"),
    "cryptografisch API-herkomstbewijs voor directe routering ontbreekt",
    fouten,
  );

  eis(
    web.includes("beforeBreadcrumb()") &&
      web.includes("maxBreadcrumbs: 0") &&
      web.includes("tracesSampleRate: 0"),
    "Firevault schakelt breadcrumbs/tracing niet volledig uit",
    fouten,
  );
  eis(
    mobiel.includes("beforeBreadcrumb()") &&
      mobiel.includes("maxBreadcrumbs: 0") &&
      mobiel.includes("tracesSampleRate: 0") &&
      mobiel.includes("enableAutoSessionTracking: false"),
    "FPS Monteur schakelt breadcrumbs/tracing/sessietracking niet volledig uit",
    fouten,
  );
  eis(
    layout.includes("startFoutmonitoring") &&
      layout.includes("zetMonitoringGebruiker") &&
      layout.includes("zetMonitoringScherm") &&
      layout.includes("<ErrorBoundary onError="),
    "FPS Monteur mist init, gebruikers-/schermcontext of lokale foutgrenshaak",
    fouten,
  );
  eis(
    metro.includes("getSentryExpoConfig"),
    "FPS Monteur gebruikt niet de Sentry Metro-config",
    fouten,
  );
  eis(
    appJson.includes("@sentry/react-native/expo") &&
      mobielPackage.includes('"@sentry/react-native"'),
    "FPS Monteur mist SDK of Expo-plugin",
    fouten,
  );

  eis(
    health.includes("sentry_dsn_web") &&
      health.includes("sentry_dsn_mobile") &&
      !/sentry_dsn\\s*:/.test(health),
    "publieke monitoring-config mist web/mobiel of lekt de server-DSN",
    fouten,
  );
  const testWaarde = "SENTRY-TEST-WACHTWOORD-NIET-VERZENDEN";
  eis(
    testRoute.includes(testWaarde) &&
      apiTest.includes(testWaarde) &&
      apiTest.includes("not.toContain"),
    "de wachtwoord-negatiefproef is niet aan route én scrubtest gekoppeld",
    fouten,
  );

  if (fouten.length > 0) {
    console.error("SENTRY_INBOUW_01 statische verificatie MISLUKT:");
    for (const fout of fouten) console.error(`- ${fout}`);
    process.exit(1);
  }
  console.log(
    "SENTRY_INBOUW_01 statische verificatie OK: gedeelde privacygrens, minimale context, mobiele SDK en beheercentrumgrens geborgd.",
  );
}

void main();