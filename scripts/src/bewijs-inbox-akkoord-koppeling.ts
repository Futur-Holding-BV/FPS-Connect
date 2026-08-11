// Task 900 — bewijs: een opdrachtbevestiging uit de inbox/Slim Upload is direct
// koppelbaar als grond B-akkoordbewijs, via de echte routes:
//   1. POST /documenten/aanleveren (categorie "opdrachtbevestiging")
//      → documenten-rij met documenttype "opdrachtbevestiging" + bestand
//   2. GET /documenten?documenttype=opdrachtbevestiging → document vindbaar
//      (de bron van de picker in de akkoordkaart)
//   3. POST /opdrachten/:id/akkoord (grond B, document_id uit stap 1) → 201
// Test via HTTP tegen de draaiende api-server (nooit api-server-source importeren).
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-inbox-akkoord-koppeling.ts
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, like, inArray } from "drizzle-orm";
import { authenticator } from "otplib";
import {
  db, gebruikersTable, medewerkersTable, opdrachtenTable,
  documentenTable, offertesTable,
} from "@workspace/db";

const BASIS = process.env.BEWIJS_API_BASIS ?? `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const WW = `${randomBytes(12).toString("base64url")}Aa1!`;
const HB_EMAIL = "bewijs-inbox-akkoord-hb@fps.local";
const MERK = "INBOX-AKKOORD-BEWIJS";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript nooit tegen productie draaien.");
}

const fout: string[] = [];
function check(ok: boolean, regel: string): void {
  console.log(`${ok ? "✓" : "✗"} ${regel}`);
  if (!ok) { fout.push(regel); process.exitCode = 1; }
}

const TOTP = authenticator.generateSecret();

// Minimale geldige eenpagina-PDF (voldoende voor de uploadroute).
const MINI_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj
xref
0 4
0000000000 65535 f
trailer<</Size 4/Root 1 0 R>>
startxref
0
%%EOF`,
  "utf8",
);

async function ruimOp(): Promise<void> {
  const opdr = await db.select({ id: opdrachtenTable.id }).from(opdrachtenTable).where(like(opdrachtenTable.titel, `${MERK}%`));
  if (opdr.length) await db.delete(opdrachtenTable).where(inArray(opdrachtenTable.id, opdr.map((o) => o.id)));
  await db.delete(documentenTable).where(like(documentenTable.naam, `${MERK}%`));
  await db.delete(offertesTable).where(like(offertesTable.titel, `${MERK}%`));
  const gebr = await db.select({ id: gebruikersTable.id }).from(gebruikersTable).where(eq(gebruikersTable.email, HB_EMAIL));
  if (gebr.length) {
    await db.delete(medewerkersTable).where(inArray(medewerkersTable.gebruikerId, gebr.map((g) => g.id)));
    await db.delete(gebruikersTable).where(inArray(gebruikersTable.id, gebr.map((g) => g.id)));
  }
}

async function main(): Promise<void> {
  await ruimOp();

  const [hb] = await db.insert(gebruikersTable).values({
    naam: "Bewijs InboxAkkoord HB", email: HB_EMAIL, rol: "hoofdbeheerder",
    wachtwoord: await bcrypt.hash(WW, 10), totpSecret: TOTP,
    tweeFactorIngeschakeld: true, actief: true,
  } as typeof gebruikersTable.$inferInsert).returning();
  await db.insert(medewerkersTable).values({
    gebruikerId: hb.id, naam: "Bewijs InboxAkkoord HB",
  } as typeof medewerkersTable.$inferInsert);

  // Opdracht mét offerte onder de €10k-band (anders fail-closed GOEDKEURING_VEREIST).
  const [off] = await db.insert(offertesTable).values({
    titel: `${MERK} offerte 700`, bedragInclBtw: 700, bedragExclBtw: 579,
  } as typeof offertesTable.$inferInsert).returning();
  const [opdracht] = await db.insert(opdrachtenTable).values({
    titel: `${MERK} opdracht`, status: "actief", type: "aanneem", offerteId: off.id,
  } as typeof opdrachtenTable.$inferInsert).returning();

  const login = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: HB_EMAIL, wachtwoord: WW, code: authenticator.generate(TOTP) }),
  });
  if (login.status !== 200) throw new Error(`login faalde: ${login.status} ${await login.text()}`);
  const { token } = (await login.json()) as { token: string };
  const auth = { Authorization: `Bearer ${token}` };
  const hdrs = { ...auth, "Content-Type": "application/json" };

  // 1) Slim Upload-pad: aanleveren met categorie "opdrachtbevestiging"
  const form = new FormData();
  form.append("bestand", new Blob([MINI_PDF], { type: "application/pdf" }), `${MERK} bevestiging.pdf`);
  form.append("categorie", "opdrachtbevestiging");
  form.append("toelichting", "bewijs task 900");
  let r = await fetch(`${BASIS}/documenten/aanleveren`, { method: "POST", headers: auth, body: form });
  let j = (await r.json().catch(() => ({}))) as { id?: number; documenttype?: string; pdf_url?: string };
  check(r.status === 200 || r.status === 201,
    `aanleveren met categorie opdrachtbevestiging geaccepteerd (kreeg ${r.status} ${JSON.stringify(j).slice(0, 140)})`);
  check(j.documenttype === "opdrachtbevestiging",
    `aangeleverd document kreeg documenttype "opdrachtbevestiging" (kreeg ${j.documenttype})`);
  const docId = j.id;
  check(typeof docId === "number", `aanleveren geeft document-id terug voor de doorschakeling (kreeg ${docId})`);

  // 2) Picker-bron: lijst gefilterd op documenttype bevat het document
  r = await fetch(`${BASIS}/documenten?documenttype=opdrachtbevestiging`, { headers: hdrs });
  const lijst = (await r.json().catch(() => [])) as Array<{ id: number }>;
  check(r.status === 200 && Array.isArray(lijst) && lijst.some((d) => d.id === docId),
    `GET /documenten?documenttype=opdrachtbevestiging bevat het aangeleverde document (kreeg ${r.status}, ${Array.isArray(lijst) ? lijst.length : "?"} rijen)`);

  // 3) Akkoordpoort: grond B met het zojuist aangeleverde document → 201
  r = await fetch(`${BASIS}/opdrachten/${opdracht.id}/akkoord`, {
    method: "POST", headers: hdrs,
    body: JSON.stringify({ grond: "opdrachtbevestiging", document_id: docId }),
  });
  j = (await r.json().catch(() => ({}))) as { akkoord_grond?: string } & typeof j;
  check(r.status === 201 && (j as { akkoord_grond?: string }).akkoord_grond === "opdrachtbevestiging",
    `grond B-akkoord vastgelegd met het aangeleverde inbox-document (kreeg ${r.status} ${JSON.stringify(j).slice(0, 120)})`);

  // 4) Verifieer de gehele keten: akkoord verwijst naar het document
  r = await fetch(`${BASIS}/opdrachten/${opdracht.id}/akkoord`, { headers: hdrs });
  const ak = (await r.json().catch(() => ({}))) as { akkoord_document_id?: number };
  check(r.status === 200 && ak.akkoord_document_id === docId,
    `akkoord verwijst naar het aangeleverde document (document_id=${ak.akkoord_document_id})`);

  await ruimOp();

  if (fout.length) console.error(`\n✗ ${fout.length} controle(s) gefaald.`);
  else console.log("\n✓ Alle inbox→akkoord-koppelingscontroles geslaagd.");
}

main().catch(async (e) => {
  console.error("FOUT:", e);
  process.exitCode = 1;
  await ruimOp().catch(() => {});
});
