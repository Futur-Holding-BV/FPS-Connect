// Bewijs concurrency FINANCIEEL_AI_01 — parallelle genereer-verzoeken en
// realisatie-upserts (taakcontrole raceresistentie).
//
// Test 1: twee gelijktijdige POST /fie/ak-adviezen/genereer met precies 1 plek
//   vrij onder het maximum → nooit >10 open adviezen, geen 500.
// Test 2: twee gelijktijdige POST /fie/realisaties voor hetzelfde
//   boekjaar×werkmaatschappij → precies één rij, geen 500 door unique-violation.
//
// Uitsluitend voor dev; seedt eigen data en ruimt alles op in finally.
// Draaien: S3_BUCKET=dummy pnpm --filter @workspace/scripts exec tsx src/bewijs-concurrency-ak.ts
import "./lib/prodGuard";
import { authenticator } from "otplib";
import {
  db,
  fieAkAdviezenTable,
  fieAkPostenTable,
  fieJaarbegrotingenTable,
  fieJaarrealisatiesTable,
  orgVerzekeringenTable,
} from "@workspace/db";
import { and, eq, inArray, isNull, like } from "drizzle-orm";
import {
  setupE2eWachtwoordAccounts,
  E2E_WW_ADMIN_EMAIL,
  E2E_WW_ADMIN_WACHTWOORD,
  E2E_WW_ADMIN_TOTP_SECRET,
} from "./e2e-wachtwoord-testaccounts";

const DOMEIN = process.env.REPLIT_DEV_DOMAIN;
if (!DOMEIN) {
  console.error("REPLIT_DEV_DOMAIN ontbreekt.");
  process.exit(1);
}
const BASIS = `https://${DOMEIN}/api`;
// Moet gelijk zijn aan MAX_OPEN_ADVIEZEN in
// artifacts/api-server/src/lib/akEigenCijfers.ts (§4.2). Lokaal gedefinieerd
// omdat een cross-project source-import de scripts-typecheck (rootDir) breekt.
const MAX_OPEN_ADVIEZEN = 10;
const MARKER = "BEWIJS_CONC_AK";
const J1 = 2093, J2 = 2094; // ver weg van echte data én van bewijs-financieel-ak (2091/2092)
const REAL_JAAR = 2095;

let geslaagd = 0;
let mislukt = 0;
function check(naam: string, conditie: boolean, detail?: string): void {
  if (conditie) { geslaagd++; console.log(`  ✓ ${naam}`); }
  else { mislukt++; console.error(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

class Sessie {
  private cookies = new Map<string, string>();
  async fetch(pad: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    if (init?.body) headers.set("Content-Type", "application/json");
    const cookie = [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookie) headers.set("Cookie", cookie);
    const res = await fetch(`${BASIS}${pad}`, { ...init, headers, redirect: "manual" });
    for (const sc of res.headers.getSetCookie()) {
      const [paar] = sc.split(";");
      const idx = paar!.indexOf("=");
      if (idx > 0) {
        const naam = paar!.slice(0, idx).trim();
        const waarde = paar!.slice(idx + 1).trim();
        if (waarde === "" || /expires=Thu, 01 Jan 1970/i.test(sc)) this.cookies.delete(naam);
        else this.cookies.set(naam, waarde);
      }
    }
    return res;
  }
  post(pad: string, body?: unknown): Promise<Response> {
    return this.fetch(pad, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
  }
}

async function json<T = any>(res: Response): Promise<T> {
  const t = await res.text();
  try { return JSON.parse(t) as T; } catch { return t as unknown as T; }
}

async function versTotp(secret: string, minResterendeSec = 10): Promise<string> {
  const resterend = authenticator.timeRemaining();
  if (resterend < minResterendeSec) await new Promise((r) => setTimeout(r, (resterend + 1) * 1000));
  return authenticator.generate(secret);
}

async function telOpen(): Promise<number> {
  const rijen = await db.select({ id: fieAkAdviezenTable.id }).from(fieAkAdviezenTable)
    .where(eq(fieAkAdviezenTable.status, "open"));
  return rijen.length;
}

async function main(): Promise<void> {
  // Rate-limiter wissen + admin-login (wachtwoord + TOTP)
  await fetch(`${BASIS}/auth/e2e-rate-reset`, { method: "POST" }).catch(() => {});
  await setupE2eWachtwoordAccounts();
  const admin = new Sessie();
  const r1 = await admin.post("/auth/login", { email: E2E_WW_ADMIN_EMAIL, wachtwoord: E2E_WW_ADMIN_WACHTWOORD });
  const b1 = await json(r1);
  if (r1.status !== 200 || b1.status !== "verify_2fa") {
    console.error(`FAIL login: ${r1.status} ${JSON.stringify(b1)}`);
    process.exit(1);
  }
  const r2 = await admin.post("/auth/2fa/verify", { code: await versTotp(E2E_WW_ADMIN_TOTP_SECRET) });
  if (r2.status !== 200) { console.error(`FAIL 2fa: ${r2.status}`); process.exit(1); }
  console.log("Admin ingelogd (wachtwoord + TOTP).");

  const begrotingIds: number[] = [];
  const polisIds: number[] = [];
  const gemaakteAdviesIds: number[] = [];
  const tijdelijkWeggezetIds: number[] = [];
  try {
    // ── Seed: twee boekjaren met signaalwaardige posten + polis, zodat de
    // genereer-endpoint verse kandidaten heeft (dedup-sleutels bevatten MARKER).
    await db.insert(fieJaarrealisatiesTable).values([
      { boekjaar: J1, werkgeverId: null, omzetGefactureerd: 2_000_000, ohwMutatie: 500_000, bron: "jaarrekening", opmerkingen: MARKER },
      { boekjaar: J2, werkgeverId: null, omzetGefactureerd: 2_000_000, ohwMutatie: -200_000, bron: "jaarrekening", opmerkingen: MARKER },
    ]);
    for (const jaar of [J1, J2]) {
      const [b] = await db.insert(fieJaarbegrotingenTable).values({
        boekjaar: jaar, status: "gesloten", omzetDoel: 2_000_000, opmerkingen: MARKER,
      }).returning();
      begrotingIds.push(b!.id);
    }
    await db.insert(fieAkPostenTable).values([
      { begrotingId: begrotingIds[0]!, categorie: "verzekeringen", omschrijving: `${MARKER} AVB-verzekering`, bedragJaarbasis: 8_400 },
      { begrotingId: begrotingIds[1]!, categorie: "verzekeringen", omschrijving: `${MARKER} AVB-verzekering`, bedragJaarbasis: 12_900 },
      { begrotingId: begrotingIds[0]!, categorie: "personeel_indirect", omschrijving: `${MARKER} Indirecte loonkosten`, bedragJaarbasis: 180_000 },
      { begrotingId: begrotingIds[1]!, categorie: "personeel_indirect", omschrijving: `${MARKER} Indirecte loonkosten`, bedragJaarbasis: 240_000 },
    ]);
    const [polis] = await db.insert(orgVerzekeringenTable).values({
      type: "AVB", maatschappij: `${MARKER} Maatschappij`, polisnummer: `${MARKER}-1`,
      premie: "1075", premieFrequentie: "maandelijks", status: "actief",
    }).returning();
    polisIds.push(polis!.id);

    // ── Test 1: parallelle genereer-verzoeken met precies 1 plek vrij ────────
    console.log("Test 1: twee gelijktijdige POST /fie/ak-adviezen/genereer");
    // Precondition afdwingen: exact MAX-1 open adviezen. Te veel? Dan tijdelijk
    // bestaande open adviezen wegzetten (en in finally herstellen). Te weinig?
    // Aanvullen met MARKER-vulling.
    const openVoor = await db.select({ id: fieAkAdviezenTable.id }).from(fieAkAdviezenTable)
      .where(eq(fieAkAdviezenTable.status, "open"));
    const teveel = openVoor.length - (MAX_OPEN_ADVIEZEN - 1);
    if (teveel > 0) {
      const ids = openVoor.slice(0, teveel).map((r) => r.id);
      tijdelijkWeggezetIds.push(...ids);
      await db.update(fieAkAdviezenTable)
        .set({ status: "weggezet", afhandelReden: `${MARKER} tijdelijk voor concurrency-test` })
        .where(inArray(fieAkAdviezenTable.id, ids));
    } else if (teveel < 0) {
      await db.insert(fieAkAdviezenTable).values(Array.from({ length: -teveel }, (_, i) => ({
        categorie: "overig", titel: `${MARKER} vulling ${i}`, advies: "vulling", bedrag: 1,
        dedupSleutel: `${MARKER}|vul|${i}`, status: "open",
      })));
    }
    const openStart = await telOpen();
    console.log(`  open vóór parallel genereren: ${openStart} (max ${MAX_OPEN_ADVIEZEN})`);
    check(`precondition: exact ${MAX_OPEN_ADVIEZEN - 1} open adviezen (precies 1 plek vrij)`,
      openStart === MAX_OPEN_ADVIEZEN - 1, `kreeg ${openStart}`);
    if (openStart !== MAX_OPEN_ADVIEZEN - 1) {
      throw new Error("Precondition niet haalbaar — race-scenario kan niet worden getest.");
    }

    const [gA, gB] = await Promise.all([
      admin.post("/fie/ak-adviezen/genereer", {}),
      admin.post("/fie/ak-adviezen/genereer", {}),
    ]);
    const [bA, bB] = await Promise.all([json(gA), json(gB)]);
    for (const rij of [...(bA.aangemaakt ?? []), ...(bB.aangemaakt ?? [])]) {
      if (typeof rij?.id === "number") gemaakteAdviesIds.push(rij.id);
    }
    check("geen 500 op parallelle genereer-verzoeken", gA.status === 200 && gB.status === 200,
      `statussen ${gA.status}/${gB.status}`);
    const openNa = await telOpen();
    check(`nooit meer dan ${MAX_OPEN_ADVIEZEN} open adviezen na parallel genereren`,
      openNa <= MAX_OPEN_ADVIEZEN, `kreeg ${openNa}`);
    const samenAangemaakt = (bA.aangemaakt?.length ?? 0) + (bB.aangemaakt?.length ?? 0);
    check("samen niet méér aangemaakt dan er ruimte was",
      samenAangemaakt <= Math.max(0, MAX_OPEN_ADVIEZEN - openStart),
      `ruimte ${Math.max(0, MAX_OPEN_ADVIEZEN - openStart)}, aangemaakt ${samenAangemaakt}`);
    // Geen dubbele open dedup-sleutels (advisory lock + partiële unieke index)
    const alleOpen = await db.select().from(fieAkAdviezenTable)
      .where(eq(fieAkAdviezenTable.status, "open"));
    const sleutels = alleOpen.map((a) => a.dedupSleutel);
    check("geen dubbele open dedup-sleutel", new Set(sleutels).size === sleutels.length);

    // ── Test 2: parallelle upserts op hetzelfde boekjaar×werkmaatschappij ────
    console.log("Test 2: twee gelijktijdige POST /fie/realisaties (zelfde sleutel)");
    const payload = {
      boekjaar: REAL_JAAR, werkgever_id: null,
      omzet_gefactureerd: 1_000_000, ohw_mutatie: 0, bron: "jaarrekening", opmerkingen: MARKER,
    };
    const [uA, uB] = await Promise.all([
      admin.post("/fie/realisaties", payload),
      admin.post("/fie/realisaties", { ...payload, omzet_gefactureerd: 1_100_000 }),
    ]);
    check("geen 500 door unique-violation bij parallelle upsert",
      [uA.status, uB.status].every((s) => s === 200 || s === 201),
      `statussen ${uA.status}/${uB.status}`);
    const rijen = await db.select().from(fieJaarrealisatiesTable)
      .where(and(eq(fieJaarrealisatiesTable.boekjaar, REAL_JAAR), isNull(fieJaarrealisatiesTable.werkgeverId)));
    check("precies één realisatie-rij voor boekjaar×werkmaatschappij", rijen.length === 1,
      `kreeg ${rijen.length} rijen`);

    // Herhaal parallel nog een keer tegen de nu-bestaande rij (update-pad).
    const [uC, uD] = await Promise.all([
      admin.post("/fie/realisaties", { ...payload, omzet_gefactureerd: 1_200_000 }),
      admin.post("/fie/realisaties", { ...payload, omzet_gefactureerd: 1_300_000 }),
    ]);
    check("parallelle her-upsert blijft foutloos (beide 200)",
      uC.status === 200 && uD.status === 200, `statussen ${uC.status}/${uD.status}`);
    const rijenNa = await db.select().from(fieJaarrealisatiesTable)
      .where(and(eq(fieJaarrealisatiesTable.boekjaar, REAL_JAAR), isNull(fieJaarrealisatiesTable.werkgeverId)));
    check("nog steeds precies één rij na her-upsert", rijenNa.length === 1, `kreeg ${rijenNa.length}`);
  } finally {
    // Cleanup — ook bij falen.
    if (gemaakteAdviesIds.length > 0) {
      await db.delete(fieAkAdviezenTable).where(inArray(fieAkAdviezenTable.id, gemaakteAdviesIds));
    }
    await db.delete(fieAkAdviezenTable).where(like(fieAkAdviezenTable.dedupSleutel, `${MARKER}|%`));
    if (tijdelijkWeggezetIds.length > 0) {
      await db.update(fieAkAdviezenTable).set({ status: "open", afhandelReden: null })
        .where(inArray(fieAkAdviezenTable.id, tijdelijkWeggezetIds));
    }
    if (begrotingIds.length > 0) await db.delete(fieJaarbegrotingenTable).where(inArray(fieJaarbegrotingenTable.id, begrotingIds)); // cascade wist AK-posten
    await db.delete(fieJaarrealisatiesTable).where(eq(fieJaarrealisatiesTable.opmerkingen, MARKER));
    await db.delete(fieJaarrealisatiesTable).where(eq(fieJaarrealisatiesTable.boekjaar, REAL_JAAR));
    if (polisIds.length > 0) await db.delete(orgVerzekeringenTable).where(inArray(orgVerzekeringenTable.id, polisIds));
  }
  console.log(`\nResultaat: ${geslaagd} geslaagd, ${mislukt} mislukt`);
  process.exit(mislukt > 0 ? 1 : 0);
}

void main().catch((err) => { console.error(err); process.exit(1); });
