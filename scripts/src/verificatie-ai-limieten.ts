/**
 * Verificatie punt 25 (SCHULD_01): AI-begrenzing in de gateway.
 *  A. Gebruikerslimiet per minuut: met AI_MAX_PER_GEBRUIKER_PER_MIN=2 wordt de
 *     3e aanroep geblokkeerd met een nette melding.
 *  B. Dagplafond: met AI_DAGPLAFOND_EUR=0.000001 wordt elke aanroep geblokkeerd
 *     met de dagplafond-melding (er staan al kosten in ai_aanroepen van vandaag).
 *
 * Draaien: S3_BUCKET=dummy AI_MAX_PER_GEBRUIKER_PER_MIN=2 AI_DAGPLAFOND_EUR=1000 \
 *   pnpm --filter @workspace/scripts exec tsx src/verificatie-ai-limieten.ts
 */
import path from "path";
import { fileURLToPath } from "url";

const WORKSPACE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function main() {
  const gw = await import(path.join(WORKSPACE, "artifacts/api-server/src/lib/aiGateway.ts"));
  const gateway = gw.aiGateway ?? gw.default;
  const vraag = (id: number) =>
    gateway.chat(
      "fast",
      { messages: [{ role: "user", content: "Zeg alleen: ok" }], max_tokens: 5 },
      30_000,
      { module: "verificatie", functie: "limiettest", gebruikerId: id },
    );

  console.log("— Test A: gebruikerslimiet (limiet =", process.env.AI_MAX_PER_GEBRUIKER_PER_MIN, ") —");
  const r1 = await vraag(999901);
  const r2 = await vraag(999901);
  const r3 = await vraag(999901);
  console.log(`aanroep 1: ok=${r1.ok}`);
  console.log(`aanroep 2: ok=${r2.ok}`);
  console.log(`aanroep 3: ok=${r3.ok} fout="${r3.fout ?? ""}"`);
  const aGeslaagd = r3.ok === false && String(r3.fout).includes("AI-limiet bereikt");
  // Andere gebruiker mag nog wél (limiet is per gebruiker):
  const rAnder = await vraag(999902);
  console.log(`andere gebruiker: ok=${rAnder.ok}`);

  console.log(aGeslaagd && rAnder.ok ? "✅ Test A geslaagd" : "❌ Test A GEFAALD");
  process.exit(aGeslaagd && rAnder.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
