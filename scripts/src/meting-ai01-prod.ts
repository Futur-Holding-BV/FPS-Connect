// AI_01 Fase 0 — productiemeting van werkelijk AI-gebruik (§2).
//
// Standalone en omgevingsonafhankelijk:
//   - Meet uitsluitend de database die via de omgevingsvariabele DATABASE_URL
//     wordt meegegeven. Geen ontwikkel-standaardwaarden: zonder DATABASE_URL
//     stopt het script met een foutmelding.
//   - De rest van de applicatie hoeft NIET te draaien.
//   - ALLEEN-LEZEN: de sessie wordt op read-only gezet
//     (SET default_transaction_read_only = on) en er worden uitsluitend
//     SELECT-query's uitgevoerd. Het script schrijft geen bestanden en
//     verandert niets in de database; alle uitvoer gaat naar stdout.
//
// Uitvoer: platte tekst met de vier tabellen van de ontwikkelmeting
// (1. aanroepen per module/functie, 2. tokens/kosten, 3. nauwkeurigheid,
//  4. prompts zonder herleidbare aanroep) plus meetdatum en databasenaam.
//
// Draaien (vanaf de repo-root):
//   DATABASE_URL='postgres://...' pnpm --filter @workspace/scripts exec tsx src/meting-ai01-prod.ts
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

if (!process.env.DATABASE_URL) {
  console.error("FOUT: DATABASE_URL is niet gezet. Geef de te meten database expliciet mee, bv.:");
  console.error("  DATABASE_URL='postgres://gebruiker:wachtwoord@host:5432/database' pnpm --filter @workspace/scripts exec tsx src/meting-ai01-prod.ts");
  process.exit(1);
}

type Rij = Record<string, unknown>;
const client = new Client({ connectionString: process.env.DATABASE_URL });
const q = async (s: string): Promise<Rij[]> => (await client.query(s)).rows as Rij[];

function tabel(rijen: Rij[], kolommen: string[]): string {
  if (rijen.length === 0) return "  (geen gegevens)\n";
  const cellen = rijen.map((r) => kolommen.map((k) => String(r[k] ?? "-")));
  const breedtes = kolommen.map((k, i) => Math.max(k.length, ...cellen.map((c) => c[i]!.length)));
  const regel = (c: string[]) => "  " + c.map((v, i) => v.padEnd(breedtes[i]!)).join("  ");
  return [regel(kolommen), regel(breedtes.map((b) => "-".repeat(b))), ...cellen.map(regel)].join("\n") + "\n";
}

function normaliseer(naam: string): string {
  return naam.toLowerCase().replace(/_(base_)?prompt$/, "").replace(/_base$/, "").replace(/[^a-z0-9]+/g, "");
}

async function main(): Promise<void> {
  await client.connect();
  // Harde alleen-lezen-garantie voor deze sessie: elke onbedoelde schrijfactie
  // zou hierdoor door PostgreSQL zelf worden geweigerd.
  await client.query("SET default_transaction_read_only = on");

  const dbNaam = String((await q("select current_database() as db"))[0]!["db"]);
  const vandaag = new Date().toISOString().slice(0, 10);

  console.log("AI_01 — meting AI-gebruik (Fase 0, §2)");
  console.log(`Meetdatum: ${vandaag}`);
  console.log(`Database:  ${dbNaam}`);
  console.log("Modus:     alleen-lezen (sessie op read-only, uitsluitend SELECT)\n");

  // ── 1. Per module en functie: aanroepen 30/90 dagen + unieke gebruikers ────
  const perFunctie = await q(`
    select coalesce(module,'(leeg)') as module, coalesce(functie,'(leeg)') as functie,
      count(*) filter (where aangemaakt_op > now()-interval '30 days') as d30,
      count(*) filter (where aangemaakt_op > now()-interval '90 days') as d90,
      count(distinct gebruiker_id) filter (where aangemaakt_op > now()-interval '90 days') as gebruikers
    from ai_aanroepen group by 1,2 order by d90 desc`);
  console.log("1. Aanroepen per module en functie (30/90 dagen, unieke gebruikers)\n");
  console.log(tabel(perFunctie, ["module", "functie", "d30", "d90", "gebruikers"]));

  // ── 2. Tokenverbruik en kosten per functie ─────────────────────────────────
  const kosten = await q(`
    select coalesce(module,'(leeg)') as module, coalesce(functie,'(leeg)') as functie,
      count(*) as aanroepen, coalesce(sum(total_tokens),0) as tokens,
      round(coalesce(sum(geschatte_kosten_eur),0)::numeric, 4) as kosten_eur
    from ai_aanroepen where aangemaakt_op > now()-interval '90 days'
    group by 1,2 order by kosten_eur desc`);
  console.log("2. Tokenverbruik en kosten per functie (90 dagen)\n");
  console.log(tabel(kosten, ["module", "functie", "aanroepen", "tokens", "kosten_eur"]));

  // ── 3. Nauwkeurigheid uit de correctietabellen ─────────────────────────────
  const veld = await q(`
    select veld_naam, count(*) as totaal,
      count(*) filter (where ai_voorstel is not distinct from gekozen) as overgenomen,
      count(*) filter (where ai_voorstel is distinct from gekozen) as gecorrigeerd
    from ai_veld_correcties group by 1 order by totaal desc`);
  const cat = await q(`
    select count(*) as totaal,
      count(*) filter (where ai_voorstel is not distinct from gekozen) as overgenomen,
      count(*) filter (where ai_voorstel is distinct from gekozen) as gecorrigeerd
    from ai_categorie_correcties`);
  const catRij = cat[0] ?? { totaal: 0, overgenomen: 0, gecorrigeerd: 0 };
  console.log("3. Nauwkeurigheid: AI-voorstel overgenomen vs. gecorrigeerd\n");
  console.log("Per veld (ai_veld_correcties):\n");
  console.log(tabel(veld, ["veld_naam", "totaal", "overgenomen", "gecorrigeerd"]));
  console.log(`Categorieniveau (ai_categorie_correcties): totaal ${catRij["totaal"]} / overgenomen ${catRij["overgenomen"]} / gecorrigeerd ${catRij["gecorrigeerd"]}\n`);

  // ── 4. Prompts die nergens in de aanroepen terugkomen ──────────────────────
  // Promptlijst uit de broncode, opgezocht relatief aan dit scriptbestand
  // zodat de meting vanuit elke werkmap werkt.
  const hier = dirname(fileURLToPath(import.meta.url));
  const promptPad = resolve(hier, "../../artifacts/api-server/src/lib/aiPrompts.ts");
  const bronCode = readFileSync(promptPad, "utf8");
  const constanten = [...bronCode.matchAll(/export const ([A-Z0-9_]+)\s*(?::[^=]+)?=/g)].map((m) => m[1]!);
  const geloggd = (await q(`select distinct lower(coalesce(prompt_naam,'')) as p from ai_aanroepen where prompt_naam is not null and prompt_naam <> ''`))
    .map((r) => normaliseer(String(r["p"])));
  const functies = (await q(`select distinct lower(coalesce(functie,'')) as f from ai_aanroepen where functie is not null and functie <> ''`))
    .map((r) => normaliseer(String(r["f"])));
  const bekend = new Set([...geloggd, ...functies]);
  const nulKeer = constanten.filter((c) => {
    const n = normaliseer(c);
    return ![...bekend].some((b) => b.length > 3 && (n.includes(b) || b.includes(n)));
  });
  const zonderNaam = (await q(`
    select count(*) as totaal,
      count(*) filter (where prompt_naam is null or prompt_naam = '') as zonder_promptnaam,
      count(*) filter (where module is null or module in ('', 'onbekend')) as module_onbekend
    from ai_aanroepen`))[0]!;

  console.log("4. Prompts zonder enige herleidbare aanroep\n");
  console.log(`${constanten.length} promptconstanten in aiPrompts.ts; ${nulKeer.length} zonder herleidbare aanroep:`);
  for (const p of nulKeer) console.log(`  - ${p}`);
  console.log("");
  console.log(`Logging-dekking: ${zonderNaam["totaal"]} aanroepen totaal, waarvan ${zonderNaam["zonder_promptnaam"]} zonder promptnaam en ${zonderNaam["module_onbekend"]} met module onbekend/leeg.`);
  console.log("Let op: door dat logginggat betekent 'niet herleidbaar' niet automatisch 'nooit gebruikt'.");

  // ── 5. Attributie van niet-gelabelde aanroepen (tokenraadsel) ──────────────
  // Groepeert alle aanroepen zonder promptnaam of met module onbekend/leeg op
  // model + prompt_hash + periode, met een uitvoervoorbeeld, zodat de bron
  // herleidbaar is. Historische context: vóór commit 34255f8 (10 aug 2026)
  // dwong de gateway geen logcontext af; alles van vóór die datum is per
  // definitie ongelabeld.
  const attributie = await q(`
    select model_naam, coalesce(prompt_hash,'(geen)') as prompt_hash,
      min(aangemaakt_op)::date as vanaf, max(aangemaakt_op)::date as tot,
      count(*) as n, coalesce(sum(total_tokens),0) as tokens,
      round(coalesce(avg(total_tokens),0)) as gem_tokens,
      left(regexp_replace(max(uitvoer_tekst), E'[\\n\\r]+', ' ', 'g'), 90) as uitvoer_voorbeeld
    from ai_aanroepen
    where (prompt_naam is null or prompt_naam = '' or module is null or module in ('', 'onbekend'))
    group by 1,2 order by tokens desc limit 25`);
  console.log("\n5. Attributie van niet-gelabelde aanroepen (op model + prompt-hash)\n");
  console.log(tabel(attributie, ["model_naam", "prompt_hash", "vanaf", "tot", "n", "tokens", "gem_tokens", "uitvoer_voorbeeld"]));
  console.log("Duiding: prompt_hash '(geen)' + JSON met \"signalen\" = de dagelijkse Scout-marktsignalenrun (chat zonder system-rol);");
  console.log("Responses-API-aanroepen loggen momenteel geen prompt_hash en geen tokens.");
}

main()
  .then(async () => { await client.end(); process.exit(0); })
  .catch(async (e) => { console.error(e); await client.end().catch(() => undefined); process.exit(1); });
