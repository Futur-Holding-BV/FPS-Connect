// NP_INKOOP_01 — bewijs-harnas voor de factuurmatch op A-nummers.
// Draait BINNEN het api-server-pakket zodat exact de productiecode
// (koppelAlgemeneInkoop uit factuurstroomService) wordt aangeroepen — geen kopie.
// Aanroepen: pnpm --filter @workspace/api-server exec tsx src/scripts/verificatie-algemene-inkoop-match.ts
import { createRequire } from "node:module";
import { db, facturenTable, factuurSignalenTable, factuurTijdlijnTable, algemeneInkopenTable, gebruikersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import type { FactuurStroomVelden } from "../lib/documentIntelligence";

// objectStorage.ts (transitief geïmporteerd) verwacht een CJS-achtige
// globalThis.require zoals in de esbuild-bundle; onder tsx/ESM shimmen we die.
(globalThis as { require?: NodeJS.Require }).require = createRequire(import.meta.url);
const { koppelAlgemeneInkoop } = await import("../services/factuurstroomService");

function check(naam: string, ok: boolean, detail?: unknown): void {
  console.log(`${ok ? "✅" : "❌"} ${naam}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  if (!ok) process.exitCode = 1;
}

function velden(deels: Partial<FactuurStroomVelden>): FactuurStroomVelden {
  return {
    leverancier_naam: "Verificatie BV", factuurnummer: "VF-1", factuurdatum: "2026-08-09",
    vervaldatum: null, betalingstermijn_dagen: null, bedrag_excl_btw: null, btw_bedrag: null,
    bedrag_incl_btw: null, iban: null, loondeel_bedrag: null, loondeel_vermeld: false,
    tenaamstelling: null, verwijzing: null, omschrijving: null, onzekere_velden: [],
    ...deels,
  };
}

async function maakFactuur(): Promise<number> {
  const [f] = await db.insert(facturenTable).values({
    bron: "handmatig", status: "nieuw", relatienaam: "Verificatie BV",
    factuurnummer: `VERIF-NPINKOOP-${Date.now()}`, bijgewerktOp: new Date(),
  }).returning({ id: facturenTable.id });
  return f!.id;
}

async function main(): Promise<void> {
  const factuurIds: number[] = [];
  const inkoopIds: number[] = [];
  const [iemand] = await db.select({ id: gebruikersTable.id }).from(gebruikersTable).limit(1);
  if (!iemand) throw new Error("geen gebruikers in de database");
  const besteldDoorId = iemand.id;
  try {
    // Twee open op-rekening-inkopen + één direct betaald (mag nooit matchen)
    const [a1] = await db.insert(algemeneInkopenTable).values({
      soort: "op_rekening", status: "besteld", leverancierNaam: "Verificatie BV",
      omschrijving: "verif match", kostensoort: "gereedschap", verwachtBedrag: 100, besteldDoorId,
    }).returning();
    const [a2] = await db.insert(algemeneInkopenTable).values({
      soort: "op_rekening", status: "besteld", leverancierNaam: "Verificatie BV",
      omschrijving: "verif tweede", kostensoort: "software", besteldDoorId,
    }).returning();
    inkoopIds.push(a1!.id, a2!.id);
    const nr1 = `A${String(a1!.nummer).padStart(3, "0")}`;
    const nr2 = `A${String(a2!.nummer).padStart(3, "0")}`;

    // 1. Eén match in de verwijzing → koppelen + kostensoortvoorstel + status
    const f1 = await maakFactuur(); factuurIds.push(f1);
    await db.transaction(async (tx) => {
      await koppelAlgemeneInkoop(f1, velden({ verwijzing: `Referentie ${nr1}`, bedrag_incl_btw: 101 }), null, tx);
    });
    const [na1] = await db.select().from(algemeneInkopenTable).where(eq(algemeneInkopenTable.id, a1!.id));
    const [fac1] = await db.select().from(facturenTable).where(eq(facturenTable.id, f1));
    check(`match op ${nr1}: status factuur_ontvangen + factuur gekoppeld`, na1!.status === "factuur_ontvangen" && na1!.factuurId === f1);
    check("kostensoort als voorstel op factuur (categorie was leeg)", fac1!.categorie === "gereedschap");
    const sig1 = await db.select().from(factuurSignalenTable).where(eq(factuurSignalenTable.factuurId, f1));
    check("bedrag binnen tolerantie (€101 vs €100) → géén signaal", sig1.every((s) => s.type !== "algemene_inkoop_bedrag_afwijkend"));

    // 2. Bedragafwijking → signaal, nooit stil
    await db.update(algemeneInkopenTable).set({ status: "besteld", factuurId: null }).where(eq(algemeneInkopenTable.id, a1!.id));
    const f2 = await maakFactuur(); factuurIds.push(f2);
    await db.transaction(async (tx) => {
      await koppelAlgemeneInkoop(f2, velden({ omschrijving: `Levering volgens ${nr1}`, bedrag_incl_btw: 250 }), null, tx);
    });
    const sig2 = await db.select().from(factuurSignalenTable).where(eq(factuurSignalenTable.factuurId, f2));
    check("bedragafwijking (€250 vs €100) → signaal algemene_inkoop_bedrag_afwijkend", sig2.some((s) => s.type === "algemene_inkoop_bedrag_afwijkend"));

    // 3. Meerdere A-nummers → nooit gokken, tijdlijnmelding, niets gekoppeld
    await db.update(algemeneInkopenTable).set({ status: "besteld", factuurId: null }).where(eq(algemeneInkopenTable.id, a1!.id));
    const f3 = await maakFactuur(); factuurIds.push(f3);
    await db.transaction(async (tx) => {
      await koppelAlgemeneInkoop(f3, velden({ verwijzing: `${nr1} en ${nr2}` }), null, tx);
    });
    const [na1b] = await db.select().from(algemeneInkopenTable).where(eq(algemeneInkopenTable.id, a1!.id));
    const tl3 = await db.select().from(factuurTijdlijnTable).where(eq(factuurTijdlijnTable.factuurId, f3));
    check("meerdere nummers → niets gekoppeld + tijdlijnmelding", na1b!.factuurId === null && tl3.some((t) => t.tekst.includes("meerdere algemene-inkoopnummers")));

    // 4. Geen A-nummer → bestaand gedrag ongewijzigd (geen koppeling, geen tijdlijn)
    const f4 = await maakFactuur(); factuurIds.push(f4);
    await db.transaction(async (tx) => {
      await koppelAlgemeneInkoop(f4, velden({ verwijzing: "Opdracht O405", omschrijving: "regulier projectwerk" }), "Factuur juli", tx);
    });
    const tl4 = await db.select().from(factuurTijdlijnTable).where(eq(factuurTijdlijnTable.factuurId, f4));
    check("geen A-nummer → geen koppeling en geen tijdlijnregels", tl4.length === 0);

    // 5. Mailonderwerp telt mee als zoekbron
    await db.update(algemeneInkopenTable).set({ status: "besteld", factuurId: null }).where(eq(algemeneInkopenTable.id, a1!.id));
    const f5 = await maakFactuur(); factuurIds.push(f5);
    await db.transaction(async (tx) => {
      await koppelAlgemeneInkoop(f5, velden({}), `Factuur inzake ${nr1}`, tx);
    });
    const [na1c] = await db.select().from(algemeneInkopenTable).where(eq(algemeneInkopenTable.id, a1!.id));
    check("match via mailonderwerp", na1c!.factuurId === f5 && na1c!.status === "factuur_ontvangen");
  } finally {
    // Opruimen
    if (factuurIds.length) {
      await db.delete(factuurSignalenTable).where(inArray(factuurSignalenTable.factuurId, factuurIds));
      await db.delete(factuurTijdlijnTable).where(inArray(factuurTijdlijnTable.factuurId, factuurIds));
    }
    if (inkoopIds.length) await db.delete(algemeneInkopenTable).where(inArray(algemeneInkopenTable.id, inkoopIds));
    if (factuurIds.length) await db.delete(facturenTable).where(inArray(facturenTable.id, factuurIds));
  }
  console.log(process.exitCode ? "FAIL" : "OK");
  process.exit(process.exitCode ?? 0);
}

void main();
