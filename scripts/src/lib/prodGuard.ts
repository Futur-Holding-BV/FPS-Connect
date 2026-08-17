/**
 * Productie-guard voor bewijs-/verificatiescripts (HERSTEL_MAIL_01 punt 3).
 *
 * Bewijsscripts maken testdata aan (organisaties, contacten, campagnes) en
 * mogen daarom NOOIT tegen de productieomgeving draaien. Alle scripts bepalen
 * hun doel via API_BASIS (fallback: REPLIT_DEV_DOMAIN / localhost); deze guard
 * stopt het proces hard zodra dat doel naar productie wijst.
 *
 * Gebruik: `import "./lib/prodGuard";` als side-effect-import bovenaan het
 * script. Alleen scripts die bewust en uitsluitend LEZEN van productie mogen
 * de guard passeren door PROD_LEZEN_TOEGESTAAN=1 te zetten — dat is een
 * bewuste, per-run afgegeven vrijstelling, nooit een default.
 */

const PROD_KENMERKEN = ["connect.fps-one.nl", "fps-one.nl"];

export function weigerProductie(doelUrl: string | undefined): void {
  if (!doelUrl) return;
  const laag = doelUrl.toLowerCase();
  if (!PROD_KENMERKEN.some((k) => laag.includes(k))) return;
  if (process.env.PROD_LEZEN_TOEGESTAAN === "1") {
    console.warn(
      `⚠ prodGuard: doel is PRODUCTIE (${doelUrl}) — toegestaan via PROD_LEZEN_TOEGESTAAN=1; dit script mag uitsluitend lezen.`,
    );
    return;
  }
  console.error(
    `✖ prodGuard: dit bewijsscript wijst naar PRODUCTIE (${doelUrl}). Bewijsscripts draaien nooit tegen productie; gebruik de dev-omgeving of zet — alleen voor puur lezende scripts — PROD_LEZEN_TOEGESTAAN=1.`,
  );
  process.exit(1);
}

// Side-effect: controleer meteen bij import op basis van álle env-vars die
// scripts als doel gebruiken — ook de database-URL (scripts met directe
// DB-toegang mogen evenmin naar een productiedatabase wijzen).
weigerProductie(process.env.API_BASIS);
weigerProductie(process.env.BEWIJS_API_BASIS);
weigerProductie(process.env.REPLIT_DEV_DOMAIN);
weigerProductie(process.env.DATABASE_URL);
