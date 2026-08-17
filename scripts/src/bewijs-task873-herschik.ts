// Task #873 — bewijs: calculatieregels herschikken binnen een hoofdstuk zonder
// dat de ouder-kindrelatie breekt. Test via HTTP tegen de draaiende api-server.
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-task873-herschik.ts
import "./lib/prodGuard";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, inArray, like } from "drizzle-orm";
import { authenticator } from "otplib";
import { db, gebruikersTable, modCalcHeadersTable, modCalcRegelsTable } from "@workspace/db";

// Overschrijfbaar door de validatie-runner (bewijs-herschik-run.ts) die een
// eigen api-server op een aparte poort start, los van de gedeelde 8080.
const BASIS = process.env.BEWIJS_API_BASIS ?? `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const TOTP = authenticator.generateSecret();
const WW = `${randomBytes(12).toString("base64url")}Aa1!`;
const EMAIL = "bewijs-task873@fps.local";
const CALC_MERK = "TASK873-HERSCHIK-TEST";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript nooit tegen productie draaien.");
}

const fout: string[] = [];
function check(ok: boolean, regel: string): void {
  console.log(`${ok ? "✓" : "✗"} ${regel}`);
  if (!ok) { fout.push(regel); process.exitCode = 1; }
}

async function ruimOp(): Promise<void> {
  const calcs = await db.select({ id: modCalcHeadersTable.id }).from(modCalcHeadersTable).where(eq(modCalcHeadersTable.naam, CALC_MERK));
  const ids = calcs.map((c) => c.id);
  if (ids.length) {
    await db.delete(modCalcRegelsTable).where(inArray(modCalcRegelsTable.calculatieId, ids));
    await db.delete(modCalcHeadersTable).where(inArray(modCalcHeadersTable.id, ids));
  }
  await db.delete(gebruikersTable).where(like(gebruikersTable.email, EMAIL));
}

type ApiRegel = { id: number; omschrijving: string; volgorde: number; ouder_regel_id: number | null; hoofdstuk: string | null };

async function main(): Promise<void> {
  await ruimOp();

  await db.insert(gebruikersTable).values({
    naam: "Bewijs Task873", email: EMAIL, rol: "gebruiker",
    wachtwoord: await bcrypt.hash(WW, 10), totpSecret: TOTP,
    tweeFactorIngeschakeld: true, actief: true,
    functietitels: ["Calculator"], bevoegdheden: { calculaties: 2 },
  } as typeof gebruikersTable.$inferInsert);

  const [calc] = await db.insert(modCalcHeadersTable).values({ naam: CALC_MERK, status: "concept" } as typeof modCalcHeadersTable.$inferInsert).returning();
  const calcId = calc.id;

  // Seed: hoofdstuk "Wanden": A (met kinderen A1, A2), B, C; hoofdstuk "Kleppen": D.
  const basis = { calculatieId: calcId, categorie: "arbeid", eenheid: "st", hoeveelheid: 1, tarief: 0, totaal: 0, hoofdstuk: "Wanden" };
  const [ra] = await db.insert(modCalcRegelsTable).values({ ...basis, omschrijving: "A", volgorde: 1, soort: "regel" } as any).returning();
  const [ra1] = await db.insert(modCalcRegelsTable).values({ ...basis, omschrijving: "A1", volgorde: 2, soort: "materiaal", ouderRegelId: ra.id } as any).returning();
  const [ra2] = await db.insert(modCalcRegelsTable).values({ ...basis, omschrijving: "A2", volgorde: 3, soort: "materiaal", ouderRegelId: ra.id } as any).returning();
  const [rb] = await db.insert(modCalcRegelsTable).values({ ...basis, omschrijving: "B", volgorde: 4, soort: "regel" } as any).returning();
  const [rc] = await db.insert(modCalcRegelsTable).values({ ...basis, omschrijving: "C", volgorde: 5, soort: "regel" } as any).returning();
  const [rd] = await db.insert(modCalcRegelsTable).values({ ...basis, omschrijving: "D", volgorde: 6, soort: "regel", hoofdstuk: "Kleppen" } as any).returning();

  const login = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, wachtwoord: WW, code: authenticator.generate(TOTP) }),
  });
  if (login.status !== 200) throw new Error(`login faalde: ${login.status} ${await login.text()}`);
  const { token } = (await login.json()) as { token: string };
  const hdrs = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const herschik = async (regelId: number, richting: string) => {
    const r = await fetch(`${BASIS}/modules/calculaties/${calcId}/regels/${regelId}/herschik`, {
      method: "POST", headers: hdrs, body: JSON.stringify({ richting }),
    });
    return { status: r.status, body: await r.json().catch(() => null) as { verplaatst?: boolean } | null };
  };
  const haalRegels = async (): Promise<ApiRegel[]> => {
    const r = await fetch(`${BASIS}/modules/calculaties/${calcId}/regels`, { headers: hdrs });
    if (r.status !== 200) throw new Error(`GET regels ${r.status}`);
    return (await r.json()) as ApiRegel[];
  };
  const volgordeNamen = (rs: ApiRegel[]) => [...rs].sort((a, b) => a.volgorde - b.volgorde || a.id - b.id).map((r) => r.omschrijving).join(",");

  // 1. B omhoog → B komt vóór blok A; kinderen A1/A2 blijven direct na A.
  let res = await herschik(rb.id, "omhoog");
  check(res.status === 200 && res.body?.verplaatst === true, `1. B omhoog → 200 verplaatst=true (${res.status}, ${JSON.stringify(res.body)})`);
  let rs = await haalRegels();
  check(volgordeNamen(rs) === "B,A,A1,A2,C,D", `1. Volgorde B,A,A1,A2,C,D → ${volgordeNamen(rs)}`);
  const ouders = new Map(rs.map((r) => [r.omschrijving, r.ouder_regel_id]));
  check(ouders.get("A1") === ra.id && ouders.get("A2") === ra.id, "1. A1/A2 houden A als ouder");

  // 2. A omlaag → blok A (incl. kinderen) achter C.
  res = await herschik(ra.id, "omlaag");
  rs = await haalRegels();
  check(res.body?.verplaatst === true && volgordeNamen(rs) === "B,C,A,A1,A2,D", `2. A omlaag → B,C,A,A1,A2,D → ${volgordeNamen(rs)}`);

  // 3. Kind A2 omhoog → wisselt met A1, blijft onder A.
  res = await herschik(ra2.id, "omhoog");
  rs = await haalRegels();
  check(res.body?.verplaatst === true && volgordeNamen(rs) === "B,C,A,A2,A1,D", `3. A2 omhoog binnen ouder → B,C,A,A2,A1,D → ${volgordeNamen(rs)}`);
  check(rs.find((r) => r.id === ra2.id)?.ouder_regel_id === ra.id, "3. A2 houdt A als ouder");

  // 4. Randgeval: B omhoog (staat al bovenaan) → verplaatst=false, volgorde ongewijzigd.
  res = await herschik(rb.id, "omhoog");
  rs = await haalRegels();
  check(res.status === 200 && res.body?.verplaatst === false && volgordeNamen(rs) === "B,C,A,A2,A1,D", `4. Rand: verplaatst=false, volgorde stabiel → ${volgordeNamen(rs)}`);

  // 5. Hoofdstukgrens: D (Kleppen) omhoog → kan niet over hoofdstuk heen.
  res = await herschik(rd.id, "omhoog");
  rs = await haalRegels();
  check(res.body?.verplaatst === false, `5. D blijft binnen eigen hoofdstuk (verplaatst=false) → ${JSON.stringify(res.body)}`);
  check(rs.find((r) => r.id === rd.id)?.hoofdstuk === "Kleppen", "5. D nog steeds in Kleppen");

  // 6. Ongeldige richting → 400; onbekende regel → 404.
  res = await herschik(rb.id, "zijwaarts");
  check(res.status === 400, `6a. Ongeldige richting → 400 (${res.status})`);
  res = await herschik(99999999, "omhoog");
  check(res.status === 404, `6b. Onbekende regel → 404 (${res.status})`);

  // 7. Volgordes uniek en oplopend na hertelling.
  const vols = rs.map((r) => r.volgorde);
  check(new Set(vols).size === vols.length, `7. Volgordes uniek na hertelling → ${vols.sort((a, b) => a - b).join(",")}`);

  // 9. Groepsgrens ouder-kind (server-side afgedwongen):
  // 9a. POST met ouder in een ander hoofdstuk → 400.
  let post = await fetch(`${BASIS}/modules/calculaties/${calcId}/regels`, {
    method: "POST", headers: hdrs,
    body: JSON.stringify({ categorie: "materiaal", omschrijving: "X-kind", eenheid: "st", hoeveelheid: 1, tarief: 0, soort: "materiaal", hoofdstuk: "Kleppen", ouder_regel_id: ra.id }),
  });
  check(post.status === 400, `9a. POST kind in ander hoofdstuk dan ouder → 400 (${post.status})`);
  // 9b. PATCH die een kind naar een ander hoofdstuk zou trekken → 400.
  let patch = await fetch(`${BASIS}/modules/calculaties/${calcId}/regels/${ra1.id}`, {
    method: "PATCH", headers: hdrs, body: JSON.stringify({ hoofdstuk: "Kleppen" }),
  });
  check(patch.status === 400, `9b. PATCH kind naar ander hoofdstuk dan ouder → 400 (${patch.status})`);
  // 9c. PATCH met ouder buiten de calculatie → 400.
  patch = await fetch(`${BASIS}/modules/calculaties/${calcId}/regels/${ra1.id}`, {
    method: "PATCH", headers: hdrs, body: JSON.stringify({ ouder_regel_id: 99999999 }),
  });
  check(patch.status === 400, `9c. PATCH ouder buiten calculatie → 400 (${patch.status})`);

  // 10. Legacy cross-groep kind (direct in DB gezaaid, ouder A in "Wanden",
  //     kind E in "Kleppen"): E verhuist NIET mee met A en blijft in zijn eigen
  //     hoofdstuk-groep herschikbaar.
  const [re] = await db.insert(modCalcRegelsTable).values({ ...basis, omschrijving: "E", volgorde: 99, soort: "materiaal", ouderRegelId: ra.id, hoofdstuk: "Kleppen" } as any).returning();
  res = await herschik(ra.id, "omhoog"); // A terug omhoog binnen Wanden
  rs = await haalRegels();
  const eNaHerschik = rs.find((r) => r.id === re.id)!;
  const volgordePlekken = new Map([...rs].sort((a, b) => a.volgorde - b.volgorde || a.id - b.id).map((r, i) => [r.id, i]));
  check(res.body?.verplaatst === true, "10a. A herschikken lukt ook met legacy cross-groep kind aanwezig");
  check(eNaHerschik.hoofdstuk === "Kleppen", `10b. Cross-groep kind E blijft in eigen hoofdstuk → ${eNaHerschik.hoofdstuk}`);
  check(volgordePlekken.get(re.id)! > volgordePlekken.get(rd.id)!, "10c. E staat in de Kleppen-groep (na D), niet midden in Wanden-blok van A");
  res = await herschik(re.id, "omhoog"); // E herschikt binnen eigen groep (Kleppen), wisselt met D
  rs = await haalRegels();
  const plek2 = new Map([...rs].sort((a, b) => a.volgorde - b.volgorde || a.id - b.id).map((r, i) => [r.id, i]));
  check(res.body?.verplaatst === true && plek2.get(re.id)! < plek2.get(rd.id)!, "10d. Cross-groep kind E herschikt binnen zijn eigen groep (vóór D)");
  const vols10 = rs.map((r) => r.volgorde);
  check(new Set(vols10).size === vols10.length, `10e. Volgordes uniek mét legacy kind → ${[...vols10].sort((a, b) => a - b).join(",")}`);
  await db.delete(modCalcRegelsTable).where(eq(modCalcRegelsTable.id, re.id));

  // 8. Concurrency: gelijktijdige herschik-verzoeken op dezelfde calculatie
  //    worden geserialiseerd (advisory lock in de transactie): eindstand blijft
  //    één consistente permutatie met unieke, aaneengesloten volgordes.
  for (let ronde = 0; ronde < 3; ronde++) {
    await Promise.all([
      herschik(rc.id, "omhoog"),
      herschik(ra.id, "omlaag"),
      herschik(ra2.id, "omlaag"),
      herschik(rb.id, "omlaag"),
    ]);
  }
  rs = await haalRegels();
  const vols8 = rs.map((r) => r.volgorde).sort((a, b) => a - b);
  check(new Set(vols8).size === vols8.length, `8a. Concurrency: volgordes uniek → ${vols8.join(",")}`);
  check(vols8.every((v, i) => v === i + 1), `8b. Concurrency: volgordes aaneengesloten 1..${vols8.length} → ${vols8.join(",")}`);
  const naA = rs.filter((r) => r.ouder_regel_id === ra.id).map((r) => r.volgorde).sort((a, b) => a - b);
  const volA = rs.find((r) => r.id === ra.id)!.volgorde;
  check(naA.length === 2 && naA[0] === volA + 1 && naA[1] === volA + 2, `8c. Concurrency: kinderen direct na ouder A (A=${volA}, kinderen=${naA.join(",")})`);
  check(rs.filter((r) => r.ouder_regel_id === ra.id).length === 2, "8d. Concurrency: ouder-kindrelatie intact");

  await ruimOp();
  console.log(fout.length ? `\n✗ ${fout.length} check(s) gefaald` : "\n✓ Alle checks geslaagd");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
