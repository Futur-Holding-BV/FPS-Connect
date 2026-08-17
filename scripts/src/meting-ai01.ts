// AI_01 Fase 0 — meting van werkelijk AI-gebruik (§2).
// Leest ai_aanroepen / ai_veld_correcties / ai_categorie_correcties en de
// promptlijst uit aiPrompts.ts, en schrijft docs/metingen/AI_01_gebruik.md.
// Draaien: pnpm --filter @workspace/scripts exec tsx src/meting-ai01.ts
// LET OP: meet de database waar DATABASE_URL naar wijst. Voor productiecijfers
// moet ditzelfde script op de productieomgeving draaien.
import "./lib/prodGuard";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

type Rij = Record<string, unknown>;
const q = async (s: string): Promise<Rij[]> => (await db.execute(sql.raw(s))).rows as Rij[];

function md(rijen: Rij[], kolommen: string[]): string {
  if (rijen.length === 0) return "_geen gegevens_\n";
  const kop = `| ${kolommen.join(" | ")} |\n| ${kolommen.map(() => "---").join(" | ")} |`;
  return `${kop}\n${rijen.map((r) => `| ${kolommen.map((k) => String(r[k] ?? "—")).join(" | ")} |`).join("\n")}\n`;
}

function normaliseer(naam: string): string {
  return naam.toLowerCase().replace(/_(base_)?prompt$/, "").replace(/_base$/, "").replace(/[^a-z0-9]+/g, "");
}

async function main(): Promise<void> {
  const bron = process.env.REPLIT_DEPLOYMENT ? "productie" : "ontwikkelomgeving (Replit dev-database)";
  const vandaag = new Date().toISOString().slice(0, 10);

  // ── 1. Per module en functie: aanroepen 30/90 dagen + unieke gebruikers ────
  const perFunctie = await q(`
    select coalesce(module,'(leeg)') as module, coalesce(functie,'(leeg)') as functie,
      count(*) filter (where aangemaakt_op > now()-interval '30 days') as d30,
      count(*) filter (where aangemaakt_op > now()-interval '90 days') as d90,
      count(distinct gebruiker_id) filter (where aangemaakt_op > now()-interval '90 days') as gebruikers
    from ai_aanroepen group by 1,2 order by d90 desc`);

  // ── 2. Tokenverbruik en kosten per functie ─────────────────────────────────
  const kosten = await q(`
    select coalesce(module,'(leeg)') as module, coalesce(functie,'(leeg)') as functie,
      count(*) as aanroepen, coalesce(sum(total_tokens),0) as tokens,
      round(coalesce(sum(geschatte_kosten_eur),0)::numeric, 4) as kosten_eur
    from ai_aanroepen where aangemaakt_op > now()-interval '90 days'
    group by 1,2 order by kosten_eur desc`);

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

  // ── 4. Prompts die nergens in de aanroepen terugkomen ──────────────────────
  const bronCode = readFileSync("../artifacts/api-server/src/lib/aiPrompts.ts", "utf8");
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
  const zonderNaam = await q(`
    select count(*) as totaal,
      count(*) filter (where prompt_naam is null or prompt_naam = '') as zonder_promptnaam,
      count(*) filter (where module is null or module in ('', 'onbekend')) as module_onbekend
    from ai_aanroepen`);

  const catRij = cat[0] ?? { totaal: 0, overgenomen: 0, gecorrigeerd: 0 };
  const logRij = zonderNaam[0]!;
  const inhoud = `# AI_01 — meting AI-gebruik (Fase 0, §2)

Meetmoment: ${vandaag} · Bron: **${bron}** · Opdracht: AI_01_van_reactief_naar_meedenkend

> **Belangrijkste bevinding vooraf — de meting zelf heeft een gat.** Van de
> ${logRij["totaal"]} geregistreerde aanroepen in deze database hebben er
> **${logRij["zonder_promptnaam"]} geen promptnaam** en staan er
> **${logRij["module_onbekend"]} op module "onbekend"**. §6.4 ("elke aanroep wordt
> gelogd met promptnaam en -versie") wordt dus nog niet nageleefd: de gateway
> kán het loggen, maar de meeste aanroepende plekken geven de logcontext niet
> mee. Zolang dat zo is, is elke gebruiks- en nul-keer-meting een ondergrens.
>
> **Tweede kanttekening:** dit script meet de database waar het op draait.
> Deze cijfers komen uit de ${bron}. De productiedatabase op de VPS is voor de
> agent niet rechtstreeks bereikbaar (geen SSH sinds 8 aug 2026); voor échte
> gebruikscijfers moet ditzelfde script op productie draaien.

## 1. Aanroepen per module en functie (30/90 dagen, unieke gebruikers)

${md(perFunctie, ["module", "functie", "d30", "d90", "gebruikers"])}

## 2. Tokenverbruik en kosten per functie (90 dagen)

${md(kosten, ["module", "functie", "aanroepen", "tokens", "kosten_eur"])}

De drie duurste functies staan bovenaan; vergelijk met tabel 1 of ze ook het
meest gebruikt worden.

## 3. Nauwkeurigheid: AI-voorstel overgenomen vs. gecorrigeerd

### Per veld (ai_veld_correcties)

${md(veld, ["veld_naam", "totaal", "overgenomen", "gecorrigeerd"])}

### Categorieniveau (ai_categorie_correcties)

Totaal: ${catRij["totaal"]} · overgenomen: ${catRij["overgenomen"]} · gecorrigeerd: ${catRij["gecorrigeerd"]}

${Number(catRij["totaal"]) === 0 && veld.length === 0 ? "**Beide correctietabellen zijn leeg in deze omgeving.** De leerlus van §4.2 heeft hier dus nog geen voedingsbodem; de tabellen worden wél gevuld door de bestaande vastlegging zodra gebruikers voorstellen aanpassen." : ""}

## 4. Prompts zonder enige geregistreerde aanroep

${constanten.length} promptconstanten in \`aiPrompts.ts\`; hieronder de ${nulKeer.length} waarvoor
geen enkele aanroep herleidbaar is (op naam- of functie-overeenkomst). Door het
logginggat hierboven betekent "niet herleidbaar" niet automatisch "nooit
gebruikt" — het betekent dat het gebruik **niet meetbaar** is.

${nulKeer.map((p) => `- \`${p}\``).join("\n")}

**Afspraak (§2):** dit zijn kandidaten om te verdwijnen; er wordt níets
verwijderd zonder besluit van René.

## Conclusies voor de rest van AI_01

1. Eerst het logginggat dichten (elke gateway-aanroep verplicht met module,
   functie en promptnaam) — anders blijft elke volgende meting blind.
2. Geen bestaande functie uitbreiden op grond van deze cijfers totdat de
   meting op productie is gedraaid.
3. De correctietabellen zijn de beoogde leerbron van §4.2 maar zijn hier leeg;
   de leerlus moet dus met de tien-waarnemingen-rem gebouwd worden en zal pas
   op productie effect krijgen.
`;

  mkdirSync("../docs/metingen", { recursive: true });
  writeFileSync("../docs/metingen/AI_01_gebruik.md", inhoud);
  console.log(`docs/metingen/AI_01_gebruik.md geschreven (${constanten.length} prompts, ${nulKeer.length} zonder herleidbare aanroep).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
