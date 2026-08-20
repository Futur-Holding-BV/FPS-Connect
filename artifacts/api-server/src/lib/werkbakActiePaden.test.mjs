import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const API_SRC = dirname(dirname(fileURLToPath(import.meta.url)));
const ROUTER_BESTAND = new URL(
  "../../../firevault/src/routes/connect-routes.tsx",
  import.meta.url,
);
const HERSTELMIGRATIE = new URL(
  "../../../../lib/db/src/migrations/0106_werkbak-concrete-actie-paden.sql",
  import.meta.url,
);

async function vindTypeScriptBestanden(map) {
  const resultaat = [];
  for (const entry of await readdir(map, { withFileTypes: true })) {
    const pad = join(map, entry.name);
    if (entry.isDirectory()) {
      resultaat.push(...await vindTypeScriptBestanden(pad));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      resultaat.push(pad);
    }
  }
  return resultaat;
}

function normaliseerActiePad(pad) {
  return pad
    .replace(/\$\{[^}]+\}/g, ":waarde")
    .split(/[?#]/, 1)[0];
}

function routeDektPad(route, actiePad) {
  const routeDelen = route.split("/").filter(Boolean);
  const actieDelen = actiePad.split("/").filter(Boolean);

  for (let i = 0; i < routeDelen.length; i += 1) {
    const routeDeel = routeDelen[i];
    const actieDeel = actieDelen[i];
    if (routeDeel.startsWith(":") && routeDeel.endsWith("*")) return true;
    if (actieDeel == null) return false;
    if (!routeDeel.startsWith(":") && routeDeel !== actieDeel) return false;
  }
  return routeDelen.length === actieDelen.length;
}

function padenUitExpressie(expressie, bestand) {
  if (ts.isStringLiteralLike(expressie)) return [expressie.text];
  if (ts.isTemplateExpression(expressie)) {
    let waarde = expressie.head.text;
    for (const deel of expressie.templateSpans) {
      waarde += "${waarde}";
      waarde += deel.literal.text;
    }
    return [waarde];
  }
  if (ts.isConditionalExpression(expressie)) {
    return [
      ...padenUitExpressie(expressie.whenTrue, bestand),
      ...padenUitExpressie(expressie.whenFalse, bestand),
    ];
  }
  throw new Error(
    `${relative(API_SRC, bestand)} bevat een niet-statisch actiePad; `
    + "gebruik een string, template-string of voorwaardelijke combinatie daarvan",
  );
}

function leesActiePadenUitBron(bron, bestand) {
  const sourceFile = ts.createSourceFile(
    bestand,
    bron,
    ts.ScriptTarget.Latest,
    true,
    bestand.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const resultaten = [];
  function bezoek(node) {
    if (
      ts.isPropertyAssignment(node)
      && (
        (ts.isIdentifier(node.name) && node.name.text === "actiePad")
        || (ts.isStringLiteral(node.name) && node.name.text === "actiePad")
      )
    ) {
      const regel = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      for (const pad of padenUitExpressie(node.initializer, bestand)) {
        resultaten.push({
          pad: normaliseerActiePad(pad),
          vindplaats: `${relative(API_SRC, bestand)}:${regel}`,
        });
      }
    }
    ts.forEachChild(node, bezoek);
  }
  bezoek(sourceFile);
  return resultaten;
}

async function leesWerkbakActiePaden() {
  const resultaten = [];
  for (const bestand of await vindTypeScriptBestanden(API_SRC)) {
    // Dit bestand persisteert alleen het door de voeders aangeleverde pad en
    // introduceert zelf geen navigatiedoel.
    if (bestand.endsWith("/lib/werkbakService.ts")) continue;
    resultaten.push(...leesActiePadenUitBron(await readFile(bestand, "utf8"), bestand));
  }
  return resultaten;
}

function functieBron(bron, functienaam) {
  const start = bron.indexOf(`async function ${functienaam}`);
  assert.notEqual(start, -1, `${functienaam} ontbreekt`);
  const volgende = bron.indexOf("\nasync function ", start + 1);
  return bron.slice(start, volgende === -1 ? undefined : volgende);
}

test("alle werkbak-actie_paden worden door de echte webrouter gedekt", async () => {
  const routerBron = await readFile(ROUTER_BESTAND, "utf8");
  const routerPaden = [...routerBron.matchAll(/\bpath\s*=\s*["']([^"']+)["']/g)]
    .map((match) => match[1]);
  const actiePaden = await leesWerkbakActiePaden();

  assert.ok(actiePaden.length > 0, "geen werkbak-actie_paden in de API-bron gevonden");
  for (const { pad, vindplaats } of actiePaden) {
    assert.ok(
      routerPaden.some((route) => routeDektPad(route, pad)),
      `${vindplaats} verwijst naar ${pad}, maar dat pad bestaat niet in connect-routes.tsx`,
    );
  }
});

test("gerichte werkbakmeldingen openen het concrete dossier", async () => {
  const [urenBron, bewakingsBron] = await Promise.all([
    readFile(join(API_SRC, "routes/uren.ts"), "utf8"),
    readFile(join(API_SRC, "lib/bewakingsloop.ts"), "utf8"),
  ]);

  assert.match(urenBron, /\.where\(eq\(opdrachtenTable\.projectId,\s*projectId\)\)/);
  assert.match(urenBron, /actiePad:\s*`\/opdrachten\/\$\{opdracht\.id\}`/);
  assert.doesNotMatch(urenBron, /actiePad:\s*`\/opdrachten\/\$\{projectId\}`/);
  assert.doesNotMatch(urenBron, /actiePad:\s*["'`]\/projecten["'`]/);
  assert.match(
    functieBron(bewakingsBron, "voedAiMagazijnBestelsuggestie"),
    /actiePad:\s*`\/magazijn\/artikelen\/\$\{a\.id\}`/,
  );
  assert.match(
    functieBron(bewakingsBron, "voedCrucialeDeadlinesHrm"),
    /actiePad:\s*`\/personeel\/\$\{d\.medewerker_id\}`/,
  );
  assert.match(
    functieBron(bewakingsBron, "voedOpnameZonderCalculatie"),
    /actiePad:\s*`\/opname\/\$\{r\.id\}`/,
  );

  const calculatieVoeder = functieBron(bewakingsBron, "voedCalculatieZonderOfferte");
  assert.match(calculatieVoeder, /actiePad:\s*`\/modules\/calculatie\/\$\{r\.id\}`/);
  assert.doesNotMatch(calculatieVoeder, /\bcalculatiesTable\b/);
});

test("bestaande open werkbakitems krijgen de concrete deep-links", async () => {
  const [serviceBron, migratieBron] = await Promise.all([
    readFile(join(API_SRC, "lib/werkbakService.ts"), "utf8"),
    readFile(HERSTELMIGRATIE, "utf8"),
  ]);

  assert.match(serviceBron, /\.update\(werkbakItemsTable\)[\s\S]*?actiePad:\s*item\.actiePad\s*\?\?\s*null/);
  assert.match(migratieBron, /overwerk_toestemming[\s\S]*?'\/opdrachten\/'/);
  assert.match(
    migratieBron,
    /SET status = 'afgehandeld'[\s\S]*?wi\.bron = 'overwerk_toestemming'[\s\S]*?NOT EXISTS/,
  );
  assert.match(migratieBron, /'\/magazijn\/artikelen\/'[\s\S]*?ai_magazijn_bestelsuggestie/);
  assert.match(migratieBron, /'\/personeel\/'[\s\S]*?cruciale_deadline_hrm/);
  assert.match(migratieBron, /'\/opname\/'[\s\S]*?opname_zonder_calculatie/);
  assert.match(migratieBron, /'\/modules\/calculatie\/'[\s\S]*?calculatie_zonder_offerte/);
});