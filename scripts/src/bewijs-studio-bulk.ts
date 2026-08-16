// Bewijs: Document Studio automatisering
// A: AI genereert zonder referentie-upload (op basis van huisstijl)
// B: bulk "genereer alle ontbrekende modellen" maakt concepten voor alle types
// C: nieuwe documenttypes bestelbon + mandagstaat draaien mee
// D: tweede bulk-run doet niets (bestaande concepten blijven onaangeroerd)
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-studio-bulk.ts
import { authenticator } from "otplib";
import { eq, inArray } from "drizzle-orm";
import { db, werkgeversTable, documentStudioModellenTable } from "@workspace/db";
import {
  setupE2eWachtwoordAccounts,
  E2E_WW_ADMIN_EMAIL,
  E2E_WW_ADMIN_WACHTWOORD,
  E2E_WW_ADMIN_TOTP_SECRET,
} from "./e2e-wachtwoord-testaccounts";

const BASE = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
let cookie = "";
let geslaagd = 0;
let mislukt = 0;

function check(naam: string, ok: boolean, detail?: string) {
  if (ok) { geslaagd++; console.log(`  ✓ ${naam}`); }
  else { mislukt++; console.log(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

async function api(pad: string, init: RequestInit = {}): Promise<Response> {
  const resp = await fetch(`${BASE}${pad}`, {
    ...init,
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), cookie, ...(init.headers ?? {}) },
  });
  const setCookie = resp.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return resp;
}

async function main() {
  await setupE2eWachtwoordAccounts();
  const r1 = await api("/auth/login", { method: "POST", body: JSON.stringify({ email: E2E_WW_ADMIN_EMAIL, wachtwoord: E2E_WW_ADMIN_WACHTWOORD }) });
  if (!r1.ok) throw new Error(`login faalde: ${r1.status}`);
  const r2 = await api("/auth/2fa/verify", { method: "POST", body: JSON.stringify({ code: authenticator.generate(E2E_WW_ADMIN_TOTP_SECRET) }) });
  if (!r2.ok) throw new Error(`2fa faalde: ${r2.status}`);
  console.log("Ingelogd als e2e-hoofdbeheerder\n");

  // Wegwerp-werkgever zonder enige referentie
  const [wg] = await db.insert(werkgeversTable).values({
    naam: `Bewijs Studio BV ${Date.now()}`,
    primaireKleur: "#F23B0D",
    voettekst: "Bewijs Studio BV | brandpreventie",
  }).returning({ id: werkgeversTable.id });

  try {
    // C: nieuwe types zichtbaar via single genereer zonder referentie (bestelbon)
    console.log("A+C: enkel model genereren zonder referentie (bestelbon)");
    const rUpsert = await api("/studio/modellen", { method: "POST", body: JSON.stringify({ werkgever_id: wg.id, document_type: "bestelbon" }) });
    check("upsert bestelbon-model geaccepteerd (nieuw documenttype)", rUpsert.ok, String(rUpsert.status));
    const model = await rUpsert.json() as any;
    const rGen = await api(`/studio/modellen/${model.id}/genereer`, { method: "POST", body: JSON.stringify({}) });
    check("genereer zonder referentiebestand = 200 (geen 400 meer)", rGen.status === 200, String(rGen.status));
    const gegenereerd = await rGen.json() as any;
    check("status = concept", gegenereerd.status === "concept", gegenereerd.status);
    let tpl: any = null;
    try { tpl = JSON.parse(gegenereerd.connect_template_json); } catch { /* check hieronder faalt */ }
    check("template-JSON geldig met kleurschema en secties", Boolean(tpl?.kleurschema?.primair && Array.isArray(tpl?.secties)), gegenereerd.connect_template_json?.slice(0, 80));

    // B: bulk genereer alle overige ontbrekende types
    console.log("\nB: bulk genereren van alle ontbrekende modellen");
    const rBulk = await api(`/studio/werkgevers/${wg.id}/genereer-ontbrekend`, { method: "POST" });
    check("bulk-endpoint = 200", rBulk.status === 200, String(rBulk.status));
    const bulk = await rBulk.json() as any;
    check("bestelbon (al concept) niet opnieuw gegenereerd", !bulk.resultaten.some((r: any) => r.document_type === "bestelbon"));
    check("mandagstaat zit in de bulk-run (nieuw documenttype)", bulk.resultaten.some((r: any) => r.document_type === "mandagstaat"));
    check(`alle ${bulk.totaal_ontbrekend} ontbrekende types geslaagd`, bulk.geslaagd === bulk.totaal_ontbrekend && bulk.mislukt === 0, JSON.stringify({ geslaagd: bulk.geslaagd, mislukt: bulk.mislukt }));
    const rijen = await db.select().from(documentStudioModellenTable).where(eq(documentStudioModellenTable.werkgeverId, wg.id));
    check("11 documenttypes hebben nu een concept in de database", rijen.filter((r) => r.status === "concept").length === 11, String(rijen.filter((r) => r.status === "concept").length));
    check("alle concepten hebben geldige template-JSON", rijen.filter((r) => r.status === "concept").every((r) => { try { JSON.parse(r.connectTemplateJson ?? ""); return true; } catch { return false; } }));

    // D: tweede run raakt niets aan
    console.log("\nD: tweede bulk-run is een no-op");
    const rBulk2 = await api(`/studio/werkgevers/${wg.id}/genereer-ontbrekend`, { method: "POST" });
    const bulk2 = await rBulk2.json() as any;
    check("tweede run: totaal_ontbrekend = 0", bulk2.totaal_ontbrekend === 0, String(bulk2.totaal_ontbrekend));

    // E: race — twee gelijktijdige bulk-runs op een verse werkgever
    console.log("\nE: twee gelijktijdige bulk-runs genereren nooit dubbel");
    const [wg2] = await db.insert(werkgeversTable).values({
      naam: `Bewijs Studio Race BV ${Date.now()}`,
      primaireKleur: "#F23B0D",
    }).returning({ id: werkgeversTable.id });
    try {
      const [ra, rb] = await Promise.all([
        api(`/studio/werkgevers/${wg2.id}/genereer-ontbrekend`, { method: "POST" }),
        api(`/studio/werkgevers/${wg2.id}/genereer-ontbrekend`, { method: "POST" }),
      ]);
      const [ba, bb] = await Promise.all([ra.json() as any, rb.json() as any]);
      check("samen precies 11 types geclaimd (geen dubbele claims)", ba.totaal_ontbrekend + bb.totaal_ontbrekend === 11, JSON.stringify([ba.totaal_ontbrekend, bb.totaal_ontbrekend]));
      const raceRijen = await db.select().from(documentStudioModellenTable).where(eq(documentStudioModellenTable.werkgeverId, wg2.id));
      const perType = new Map<string, number>();
      for (const r of raceRijen) perType.set(r.documentType, (perType.get(r.documentType) ?? 0) + 1);
      check("precies één rij per documenttype", raceRijen.length === 11 && [...perType.values()].every((n) => n === 1), JSON.stringify([...perType.entries()].filter(([, n]) => n !== 1)));
      check("geen rijen blijven hangen in 'genererend'", raceRijen.every((r) => r.status !== "genererend"));
    } finally {
      await db.delete(documentStudioModellenTable).where(eq(documentStudioModellenTable.werkgeverId, wg2.id));
      await db.delete(werkgeversTable).where(eq(werkgeversTable.id, wg2.id));
    }
  } finally {
    // Opruimen
    await db.delete(documentStudioModellenTable).where(eq(documentStudioModellenTable.werkgeverId, wg.id));
    await db.delete(werkgeversTable).where(eq(werkgeversTable.id, wg.id));
  }

  console.log(`\nResultaat: ${geslaagd} geslaagd, ${mislukt} mislukt`);
  if (mislukt > 0) process.exit(1);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
