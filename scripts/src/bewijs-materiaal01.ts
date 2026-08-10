// Gedragsbewijs MATERIAAL_01 — fase 1 (werkbaksignaal sluiten) + fase 2
// (rechten rechtgezet) + fase 0-endpoint (telling) + herstelronde.
// Patroon zoals scripts/src/bewijs-uren01.ts: HTTP tegen de lokale api-server,
// eigen testgebruikers, DB via @workspace/db, opruimen in finally, ✓/rood.
//
// Acceptatie (§7 MATERIAAL_01):
//   1. Goedkeuren laat het werkbakitem verdwijnen; afwijzen ook; in_behandeling niet.
//   2. Herstelronde sluit bestaande stale items en meldt het aantal.
//   3. projecten:2 kan zowel behandelen als heranalyseren (geen 403).
//   4. Fase 0-telling levert alle T-secties, ook bij lege tabellen (nul is antwoord).
//      + telling is hoofdbeheerder-only (403 voor anderen).
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-materiaal01.ts
import bcrypt from "bcryptjs";
import { eq, inArray } from "drizzle-orm";
import { authenticator } from "otplib";
import { db, gebruikersTable } from "@workspace/db";
import { materiaalAanvragenTable, werkbakItemsTable } from "@workspace/db/schema";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const TOTP = "MFRGGZDFMZTWQ2LK";
const WW = "BewijsMateriaal01!2026";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript nooit tegen productie draaien.");
}

let falen = 0;
function check(naam: string, conditie: boolean, detail?: unknown): void {
  if (!conditie) { console.error(`\x1b[31m✗ FAALT: ${naam}\x1b[0m`, detail ?? ""); falen++; return; }
  console.log(`✓ ${naam}`);
}

const aangemaakt = { gebruikers: [] as number[], aanvragen: [] as number[], werkbak: [] as number[] };

async function maakGebruiker(email: string, naam: string, rol: string, extra: Record<string, unknown> = {}): Promise<number> {
  const [oud] = await db.select({ id: gebruikersTable.id }).from(gebruikersTable).where(eq(gebruikersTable.email, email));
  if (oud) await db.delete(gebruikersTable).where(eq(gebruikersTable.id, oud.id));
  const [g] = await db.insert(gebruikersTable).values({
    naam, email, rol, wachtwoord: await bcrypt.hash(WW, 10),
    totpSecret: TOTP, tweeFactorIngeschakeld: true, actief: true, ...extra,
  } as typeof gebruikersTable.$inferInsert).returning({ id: gebruikersTable.id });
  aangemaakt.gebruikers.push(g.id);
  return g.id;
}

async function login(email: string): Promise<Record<string, string>> {
  const r = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord: WW, code: authenticator.generate(TOTP) }),
  });
  if (r.status !== 200) throw new Error(`login ${email} faalde: ${r.status} ${await r.text()}`);
  const j = await r.json() as { token: string };
  return { Authorization: `Bearer ${j.token}`, "Content-Type": "application/json" };
}

async function maakAanvraagMetSignaal(status = "nieuw"): Promise<{ aanvraagId: number; itemId: number }> {
  const [a] = await db.insert(materiaalAanvragenTable).values({
    soort: "materiaal", reden: "bewijs MATERIAAL_01", status,
    volgensOpdracht: "wijkt_af", bijgewerktOp: new Date(),
  } as typeof materiaalAanvragenTable.$inferInsert).returning({ id: materiaalAanvragenTable.id });
  aangemaakt.aanvragen.push(a.id);
  const [w] = await db.insert(werkbakItemsTable).values({
    soort: "doen", bron: "materiaal_afwijking",
    titel: `Materiaalaanvraag #${a.id}: bewijs`, status: "open",
    herkomstType: "materiaal_aanvraag", herkomstId: a.id,
    dedupSleutel: `bewijs-materiaal-afwijking:${a.id}`,
    vereisteModule: "projecten", vereistNiveau: 3,
  } as typeof werkbakItemsTable.$inferInsert).returning({ id: werkbakItemsTable.id });
  aangemaakt.werkbak.push(w.id);
  return { aanvraagId: a.id, itemId: w.id };
}

async function itemStatus(id: number): Promise<string | null> {
  const [r] = await db.select({ status: werkbakItemsTable.status }).from(werkbakItemsTable).where(eq(werkbakItemsTable.id, id));
  return r?.status ?? null;
}

async function main(): Promise<void> {
  await maakGebruiker("bewijs-mat01-hb@fps.local", "Bewijs Mat01 HB", "hoofdbeheerder");
  await maakGebruiker("bewijs-mat01-wvb@fps.local", "Bewijs Mat01 WVB", "gebruiker", { bevoegdheden: { projecten: 2 } });
  const hb = await login("bewijs-mat01-hb@fps.local");
  const wvb = await login("bewijs-mat01-wvb@fps.local");

  // §7.1 — goedkeuren sluit; afwijzen sluit; in_behandeling niet
  const a1 = await maakAanvraagMetSignaal();
  let r = await fetch(`${BASIS}/materiaal-aanvragen/${a1.aanvraagId}`, { method: "PATCH", headers: wvb, body: JSON.stringify({ status: "in_behandeling" }) });
  check("§7.1 PATCH in_behandeling door projecten:2 slaagt", r.status === 200, r.status);
  check("§7.1 item blijft OPEN bij in_behandeling", (await itemStatus(a1.itemId)) === "open");
  r = await fetch(`${BASIS}/materiaal-aanvragen/${a1.aanvraagId}`, { method: "PATCH", headers: wvb, body: JSON.stringify({ status: "goedgekeurd" }) });
  check("§7.1 PATCH goedgekeurd slaagt", r.status === 200, r.status);
  check("§7.1 item AFGEHANDELD bij goedgekeurd", (await itemStatus(a1.itemId)) === "afgehandeld");

  const a2 = await maakAanvraagMetSignaal();
  r = await fetch(`${BASIS}/materiaal-aanvragen/${a2.aanvraagId}`, { method: "PATCH", headers: wvb, body: JSON.stringify({ status: "afgewezen" }) });
  check("§7.1 PATCH afgewezen slaagt", r.status === 200, r.status);
  check("§7.1 item AFGEHANDELD bij afgewezen", (await itemStatus(a2.itemId)) === "afgehandeld");

  // §7.3 — projecten:2 mag heranalyseren (geen 403; 503 zonder AI-gateway of 200 telt beide als toegang)
  const a3 = await maakAanvraagMetSignaal("goedgekeurd"); // status al afgehandeld → stale item voor herstelronde
  r = await fetch(`${BASIS}/materiaal-aanvragen/${a3.aanvraagId}/heranalyseer`, { method: "POST", headers: wvb });
  check("§7.3 heranalyseer voor projecten:2 geeft geen 403", r.status !== 403, r.status);

  // §7.2 — herstelronde sluit het stale item van a3 (hoofdbeheerder-only)
  r = await fetch(`${BASIS}/metingen/materiaal01/herstel`, { method: "POST", headers: wvb });
  check("herstelronde is hoofdbeheerder-only (403 voor projecten:2)", r.status === 403, r.status);
  r = await fetch(`${BASIS}/metingen/materiaal01/herstel`, { method: "POST", headers: hb });
  check("§7.2 herstelronde slaagt voor hoofdbeheerder", r.status === 200, r.status);
  const herstel = await r.json() as { gesloten: number };
  check("§7.2 herstelronde sluit ≥1 stale item en meldt aantal", herstel.gesloten >= 1, herstel);
  check("§7.2 stale item van a3 is afgehandeld", (await itemStatus(a3.itemId)) === "afgehandeld");
  const r2 = await fetch(`${BASIS}/metingen/materiaal01/herstel`, { method: "POST", headers: hb });
  check("§7.2 herstelronde is idempotent (2e run sluit 0)", ((await r2.json()) as { gesloten: number }).gesloten === 0);

  // §7.4 — fase 0-telling: alle secties aanwezig, nulwaarden toegestaan; alleen hoofdbeheerder
  r = await fetch(`${BASIS}/metingen/materiaal01`, { headers: wvb });
  check("telling is hoofdbeheerder-only (403 voor projecten:2)", r.status === 403, r.status);
  r = await fetch(`${BASIS}/metingen/materiaal01`, { headers: hb });
  check("§7.4 telling slaagt voor hoofdbeheerder", r.status === 200, r.status);
  const m = await r.json() as Record<string, unknown>;
  const secties = ["t1_inkoopbonnen_per_status_maand","t2_magazijn_inkooporders_per_status_maand","t3_inkoopplannen","t4_reserveringen_per_status","t5_materiaal_aanvragen","t6_goedgekeurd_ouderdom","t7_mod_calc_inkoop_items","t8_onderaannemer_orders_per_status","t9_algemene_inkopen_per_soort","t10_aanmakers_per_profiel","herstelronde_openstaand"];
  for (const s of secties) check(`§7.4 telling bevat ${s}`, s in m, Object.keys(m));
  check("§7.4 t5 bevat de bewijsaanvragen", Array.isArray(m["t5_materiaal_aanvragen"]) && (m["t5_materiaal_aanvragen"] as unknown[]).length >= 1);
}

main()
  .then(() => { if (falen > 0) { console.error(`\n${falen} check(s) gefaald`); process.exitCode = 1; } else { console.log("\nAlle checks groen."); } })
  .catch((e) => { console.error("FOUT:", e); process.exitCode = 1; })
  .finally(async () => {
    if (aangemaakt.werkbak.length) await db.delete(werkbakItemsTable).where(inArray(werkbakItemsTable.id, aangemaakt.werkbak));
    if (aangemaakt.aanvragen.length) await db.delete(materiaalAanvragenTable).where(inArray(materiaalAanvragenTable.id, aangemaakt.aanvragen));
    if (aangemaakt.gebruikers.length) await db.delete(gebruikersTable).where(inArray(gebruikersTable.id, aangemaakt.gebruikers));
    process.exit(process.exitCode ?? 0);
  });
