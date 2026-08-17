// Task #758 — bewijs: aanvraag-mails blijven nooit stilzwijgend in de inbox hangen.
//
// Bewijst via de draaiende API (geen bronimports uit api-server):
//  1. POST /inbox/offerte-aanvraag retourneert het inbox-item met status "verwerkt";
//  2. het item is ook persistent "verwerkt" (GET /inbox/items/:id);
//  3. GET /inbox/stats telt het item mee in het veld "verwerkt".
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-inbox-aanvraag-verwerkt.ts
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, inArray, like } from "drizzle-orm";
import { authenticator } from "otplib";
import {
  db,
  gebruikersTable,
  inboxItemsTable,
  inboxAuditLogTable,
  aanvraagPlanningenTable,
  offertesTable,
  werkgeversTable,
} from "@workspace/db";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const TOTP = authenticator.generateSecret();
const WW = `${randomBytes(12).toString("base64url")}Aa1!`;
const EMAIL = "bewijs-inbox-verwerkt@fps.local";
const MAIL_NAAM = "BEWIJS758-aanvraag.eml";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript nooit tegen productie draaien.");
}

const fout: string[] = [];
function check(ok: boolean, regel: string): void {
  console.log(`${ok ? "✓" : "✗"} ${regel}`);
  if (!ok) {
    fout.push(regel);
    process.exitCode = 1;
  }
}

async function api(
  method: string,
  pad: string,
  opties: { token?: string; json?: unknown; form?: FormData } = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {};
  if (opties.token) headers.Authorization = `Bearer ${opties.token}`;
  let body: FormData | string | undefined = opties.form;
  if (opties.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opties.json);
  }
  const r = await fetch(`${BASIS}${pad}`, { method, headers, body });
  const tekst = await r.text();
  let parsed: any = null;
  try { parsed = tekst ? JSON.parse(tekst) : null; } catch { /* leeg */ }
  return { status: r.status, body: parsed };
}

async function ruimOp(): Promise<void> {
  const items = await db.select({ id: inboxItemsTable.id, offerteId: inboxItemsTable.gekoppeldeEntiteitId })
    .from(inboxItemsTable).where(eq(inboxItemsTable.bestandsnaam, MAIL_NAAM));
  const itemIds = items.map((i) => i.id);
  if (itemIds.length > 0) {
    await db.delete(aanvraagPlanningenTable).where(inArray(aanvraagPlanningenTable.inboxItemId, itemIds));
    await db.delete(inboxAuditLogTable).where(inArray(inboxAuditLogTable.inboxItemId, itemIds));
    await db.delete(inboxItemsTable).where(inArray(inboxItemsTable.id, itemIds));
  }
  const offerteIds = items.map((i) => i.offerteId).filter((v): v is number => v !== null);
  if (offerteIds.length > 0) {
    await db.delete(offertesTable).where(inArray(offertesTable.id, offerteIds));
  }
  await db.delete(offertesTable).where(like(offertesTable.titel, "BEWIJS758%"));
  await db.delete(gebruikersTable).where(eq(gebruikersTable.email, EMAIL));
}

async function main(): Promise<void> {
  await ruimOp();

  // Testgebruiker met crm-schrijfrecht (vereist door de route).
  await db.insert(gebruikersTable).values({
    naam: "Bewijs 758",
    email: EMAIL,
    rol: "hoofdbeheerder",
    wachtwoord: await bcrypt.hash(WW, 10),
    totpSecret: TOTP,
    tweeFactorIngeschakeld: true,
    actief: true,
    bevoegdheden: { crm: 2 },
  } as typeof gebruikersTable.$inferInsert);

  const login = await api("POST", "/auth/mobile/login", {
    json: { email: EMAIL, wachtwoord: WW, code: authenticator.generate(TOTP) },
  });
  if (login.status !== 200) throw new Error(`login faalde: ${login.status}`);
  const token = login.body.token as string;

  const [werkgever] = await db.select({ id: werkgeversTable.id }).from(werkgeversTable).limit(1);
  if (!werkgever) throw new Error("Geen werkmaatschappij in de database.");

  // Kale .eml zonder bruikbaar adres → geen gebouw/bevestigingsmail, wel offerte + inbox-item.
  const eml = [
    "From: BEWIJS758 <aanvraag@voorbeeld-test.nl>",
    "Subject: BEWIJS758 offerteaanvraag brandwerende doorvoeren",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Graag een offerte voor het brandwerend afdichten van doorvoeren.",
  ].join("\r\n");
  const form = new FormData();
  form.append("email", new Blob([eml], { type: "message/rfc822" }), MAIL_NAAM);
  form.append("werkmaatschappij_id", String(werkgever.id));

  const resp = await api("POST", "/inbox/offerte-aanvraag", { token, form });
  check(resp.status === 201, `POST /inbox/offerte-aanvraag → 201 (kreeg ${resp.status})`);
  const item = resp.body?.inbox_item;
  check(!!item?.id, "response bevat inbox_item");
  check(item?.status === "verwerkt", `response inbox_item.status == "verwerkt" (kreeg "${item?.status}")`);

  // Persistentie via GET /inbox/items/:id
  const detail = await api("GET", `/inbox/items/${item.id}`, { token });
  check(detail.status === 200 && detail.body?.status === "verwerkt",
    `GET /inbox/items/${item?.id} → status persistent "verwerkt" (kreeg "${detail.body?.status}")`);

  // Stats tellen het item mee onder "verwerkt"
  const stats = await api("GET", "/inbox/stats", { token });
  check(stats.status === 200 && typeof stats.body?.verwerkt === "number" && stats.body.verwerkt >= 1,
    `GET /inbox/stats bevat verwerkt >= 1 (kreeg ${stats.body?.verwerkt})`);

  await ruimOp();

  if (fout.length > 0) {
    console.error(`\n✗ ${fout.length} check(s) gefaald.`);
  } else {
    console.log("\n✓ Alle checks geslaagd — aanvraag-mails krijgen aantoonbaar status 'verwerkt'.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
