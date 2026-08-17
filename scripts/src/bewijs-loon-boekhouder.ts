// Bewijs — LOON_01 Schakel 2 + toegangsafbakening boekhouder.
//
// Via echte HTTP-verzoeken (Secure-cookies, dus https op $REPLIT_DEV_DOMAIN):
//   1. Boekhouderaccount met UITSLUITEND het "Externe boekhouder"-profiel
//      (boekhouder_portaal/salarisarchief/salaris_mutaties — geen facturen,
//      projecten of offertes).
//   2. Goedgekeurde declaratie en goedgekeurd verlof verschijnen in het portaal.
//   3. "Markeer als verwerkt" laat de post uit de openstaande lijst verdwijnen;
//      een tweede keer verwerken geeft 409 (nooit dubbel).
//   4. Server-side geweigerd op /api/facturen, /api/offertes en /api/gebouwen.
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-loon-boekhouder.ts
import "./lib/prodGuard";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { authenticator } from "otplib";

import {
  db, gebruikersTable, medewerkersTable, declaratiesTable,
  verlofAanvragenTable, verlofsoortenTable, verlofAanvraagLogTable,
  sepaBestandenTable, werkgeversTable,
} from "@workspace/db";
import { PRESETS } from "@workspace/permissies";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const MARK = "E2E-LOONBOEK";
const EMAIL = "e2e-boekhouder@fps.local";
const WACHTWOORD = "E2eBoekhouder!2026";
const TOTP_SECRET = "MZXW6YTBOI2GK43U";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijs-script draait alleen op dev.");
}

function eis(v: boolean, stap: string, detail: string): void {
  if (!v) throw new Error(`FAIL — ${stap}: ${detail}`);
}

// Simpele cookie-jar over fetch.
const cookies = new Map<string, string>();
async function call(pad: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASIS}/api${pad}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
      Cookie: [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
    },
  });
  for (const sc of res.headers.getSetCookie?.() ?? []) {
    const [pair] = sc.split(";");
    const i = pair.indexOf("=");
    cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  return res;
}

let gebruikerId = 0;
let sepaId = 0;
let werkgeverId = 0;
let medewerkerId = 0;
let declaratieId = 0;
let verlofId = 0;
let verlofsoortId = 0;

async function opruimen(): Promise<void> {
  if (verlofId) {
    await db.delete(verlofAanvraagLogTable).where(eq(verlofAanvraagLogTable.verlofaanvraagId, verlofId));
    await db.delete(verlofAanvragenTable).where(eq(verlofAanvragenTable.id, verlofId));
  }
  if (declaratieId) await db.delete(declaratiesTable).where(eq(declaratiesTable.id, declaratieId));
  if (verlofsoortId) await db.delete(verlofsoortenTable).where(eq(verlofsoortenTable.id, verlofsoortId));
  if (medewerkerId) await db.delete(medewerkersTable).where(eq(medewerkersTable.id, medewerkerId));
  if (sepaId) await db.delete(sepaBestandenTable).where(eq(sepaBestandenTable.id, sepaId));
  if (werkgeverId) await db.delete(werkgeversTable).where(eq(werkgeversTable.id, werkgeverId));
  if (gebruikerId) await db.delete(gebruikersTable).where(eq(gebruikersTable.id, gebruikerId));
}

try {
  // ── Opzet ───────────────────────────────────────────────────────────────────
  const preset = PRESETS.find((p) => p.naam === "Externe boekhouder");
  eis(!!preset, "opzet", "preset 'Externe boekhouder' niet gevonden");
  const bevoegdheden = preset!.bevoegdheden;
  eis(!bevoegdheden["financieel"], "opzet", "preset geeft nog financieel-toegang (facturen)!");
  eis(!bevoegdheden["offertes"] && !bevoegdheden["gebouwen"], "opzet", "preset geeft offertes/gebouwen-toegang");

  const hash = await bcrypt.hash(WACHTWOORD, 10);
  await db.delete(gebruikersTable).where(eq(gebruikersTable.email, EMAIL));
  const [g] = await db.insert(gebruikersTable).values({
    naam: `${MARK} Boekhouder`,
    email: EMAIL,
    rol: "gebruiker",
    wachtwoord: hash,
    totpSecret: TOTP_SECRET,
    tweeFactorIngeschakeld: true,
    actief: true,
    bevoegdheden,
  }).returning({ id: gebruikersTable.id });
  gebruikerId = g.id;

  const [mw] = await db.insert(medewerkersTable).values({
    naam: `${MARK} Medewerker`,
    werkmaatschappij: "FPS Brandpreventie",
  }).returning({ id: medewerkersTable.id });
  medewerkerId = mw.id;

  const [decl] = await db.insert(declaratiesTable).values({
    medewerkerId,
    categorie: "reiskosten",
    omschrijving: `${MARK} kilometers juli`,
    bedragTotaalCents: 12345,
    datum: "2026-07-28",
    status: "goedgekeurd",
    ingediendOp: new Date(),
    beoordeeldOp: new Date(),
  }).returning({ id: declaratiesTable.id });
  declaratieId = decl.id;

  const [soort] = await db.insert(verlofsoortenTable).values({
    naam: `${MARK} Vakantie`, categorie: "wettelijk",
  }).returning({ id: verlofsoortenTable.id });
  verlofsoortId = soort.id;

  const [verlof] = await db.insert(verlofAanvragenTable).values({
    medewerkerId,
    verlofsoortId,
    startDatum: "2026-07-20",
    eindDatum: "2026-07-24",
    aantalUren: 40,
    status: "goedgekeurd",
    beoordeeldOp: new Date(),
  }).returning({ id: verlofAanvragenTable.id });
  verlofId = verlof.id;

  // ── Inloggen (eigen inlog, met 2FA zoals elk echt account) ──────────────────
  const login = await call("/auth/login", { method: "POST", body: JSON.stringify({ email: EMAIL, wachtwoord: WACHTWOORD }) });
  eis(login.ok, "login", `status ${login.status}`);
  const verify = await call("/auth/2fa/verify", { method: "POST", body: JSON.stringify({ code: authenticator.generate(TOTP_SECRET) }) });
  eis(verify.ok, "2fa", `status ${verify.status}`);
  console.log("OK — boekhouder heeft een eigen werkende inlog (wachtwoord + 2FA)");

  // ── Schakel 2: declaraties ──────────────────────────────────────────────────
  const dl1 = await call("/boekhouder/declaraties");
  eis(dl1.ok, "declaraties-lijst", `status ${dl1.status}`);
  const declOpen = (await dl1.json()) as Array<{ id: number; medewerker_naam: string; bedrag_totaal_cents: number }>;
  const mijnDecl = declOpen.find((d) => d.id === declaratieId);
  eis(!!mijnDecl, "declaraties-lijst", "goedgekeurde declaratie niet zichtbaar");
  eis(mijnDecl!.bedrag_totaal_cents === 12345 && mijnDecl!.medewerker_naam.includes(MARK), "declaraties-velden", JSON.stringify(mijnDecl));
  console.log(`OK — goedgekeurde declaratie #${declaratieId} zichtbaar in het portaal (medewerker, bedrag, goedkeuring)`);

  const dv = await call(`/boekhouder/declaraties/${declaratieId}/verwerken`, { method: "POST" });
  eis(dv.ok, "declaratie-verwerken", `status ${dv.status}`);
  const dl2 = await call("/boekhouder/declaraties");
  const nogOpen = ((await dl2.json()) as Array<{ id: number }>).some((d) => d.id === declaratieId);
  eis(!nogOpen, "declaratie-verdwenen", "verwerkte declaratie staat nog in de openstaande lijst");
  const dv2 = await call(`/boekhouder/declaraties/${declaratieId}/verwerken`, { method: "POST" });
  eis(dv2.status === 409, "declaratie-dubbel", `tweede verwerking gaf ${dv2.status}, verwacht 409`);
  console.log("OK — declaratie verwerkt → uit de lijst; dubbel verwerken geblokkeerd (409)");

  // ── Schakel 2: verlof ───────────────────────────────────────────────────────
  const vl1 = await call("/boekhouder/verlof");
  eis(vl1.ok, "verlof-lijst", `status ${vl1.status}`);
  const verlofOpen = (await vl1.json()) as Array<{ id: number; aantal_uren: number; verlofsoort_naam: string }>;
  const mijnVerlof = verlofOpen.find((v) => v.id === verlofId);
  eis(!!mijnVerlof, "verlof-lijst", "goedgekeurd verlof niet zichtbaar");
  eis(mijnVerlof!.aantal_uren === 40 && mijnVerlof!.verlofsoort_naam.includes(MARK), "verlof-velden", JSON.stringify(mijnVerlof));

  const vv = await call(`/boekhouder/verlof/${verlofId}/verwerken`, { method: "POST" });
  eis(vv.ok, "verlof-verwerken", `status ${vv.status}`);
  const vl2 = await call("/boekhouder/verlof");
  const verlofNogOpen = ((await vl2.json()) as Array<{ id: number }>).some((v) => v.id === verlofId);
  eis(!verlofNogOpen, "verlof-verdwenen", "verwerkt verlof staat nog in de openstaande lijst");
  const vv2 = await call(`/boekhouder/verlof/${verlofId}/verwerken`, { method: "POST" });
  eis(vv2.status === 409, "verlof-dubbel", `tweede verwerking gaf ${vv2.status}, verwacht 409`);
  console.log("OK — verlofpost zichtbaar → verwerkt → uit de lijst; dubbel verwerken geblokkeerd (409)");

  // ── Toegangsafbakening: server-side geweigerd buiten het loondomein ─────────
  for (const pad of ["/facturen", "/offertes", "/gebouwen"]) {
    const res = await call(pad);
    eis(res.status === 403, `afbakening ${pad}`, `status ${res.status}, verwacht 403`);
  }
  console.log("OK — boekhouder server-side geweigerd op /facturen, /offertes en /gebouwen (403)");

  // ── Onvolledig mail-bestand: aanvullen verplicht vóór de bank ──────────────
  const [wg] = await db.insert(werkgeversTable).values({ naam: `${MARK} Werkgever BV` })
    .returning({ id: werkgeversTable.id });
  werkgeverId = wg.id;
  const [sepa] = await db.insert(sepaBestandenTable).values({
    bestandsnaam: `${MARK}_sepa.xml`,
    objectPath: "/objects/e2e/nvt.xml",
    status: "ontvangen",
    bron: "mail",
    bronMailMessageId: `${MARK}-mail-1`,
    bronMailboxAdres: "salaris@fps.local",
    onvolledig: true,
    uploaderId: gebruikerId,
  }).returning({ id: sepaBestandenTable.id });
  sepaId = sepa.id;

  const blok = await call(`/sepa-bestanden/${sepaId}`, { method: "PATCH", body: JSON.stringify({ status: "klaar_voor_bank" }) });
  eis(blok.status === 422, "onvolledig-blokkade", `status ${blok.status}, verwacht 422`);
  const vulAan = await call(`/sepa-bestanden/${sepaId}`, { method: "PATCH", body: JSON.stringify({ werkgever_id: werkgeverId, periode_jaar: 2026, periode_maand: 7 }) });
  eis(vulAan.ok, "aanvullen", `status ${vulAan.status}`);
  const naAanvullen = (await vulAan.json()) as { onvolledig: boolean };
  eis(naAanvullen.onvolledig === false, "aanvullen", "onvolledig-markering niet vervallen");
  const naarBank = await call(`/sepa-bestanden/${sepaId}`, { method: "PATCH", body: JSON.stringify({ status: "klaar_voor_bank" }) });
  eis(naarBank.ok, "na-aanvullen", `status ${naarBank.status}`);
  const gekkeStatus = await call(`/sepa-bestanden/${sepaId}`, { method: "PATCH", body: JSON.stringify({ status: "hackerstatus" }) });
  eis(gekkeStatus.status === 422, "statusvalidatie", `status ${gekkeStatus.status}, verwacht 422`);
  console.log("OK — onvolledig bestand geblokkeerd voor de bank (422), na aanvullen wél door; vrije statussen geweigerd");

  // En positief: het salarisarchief mag wél (upload/publiceren-domein).
  const sa = await call("/sepa-bestanden");
  eis(sa.ok, "salarisarchief-toegang", `status ${sa.status}`);
  console.log("OK — salarisarchief (SEPA) wél toegankelijk voor de boekhouder");

  console.log("\nALLE CONTROLES GESLAAGD — LOON_01 Schakel 2 + toegang bewezen.");
} finally {
  await opruimen();
  process.exit(0);
}
