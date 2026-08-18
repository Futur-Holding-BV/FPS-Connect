// ADMINISTRATIE_01 rekeningschema — bewijsscript.
// Test via HTTP (nooit api-server-source importeren) + @workspace/db voor
// opzet/schoonmaak. Draaien: npx tsx scripts/src/verificatie-grootboekschema.ts
import "./lib/prodGuard";
import { authenticator } from "otplib";
import { eq, like } from "drizzle-orm";
import {
  db, gebouwenTable, facturenTable, factuurRegelsTable,
  grootboekrekeningenTable, accountviewInstellingenTable, werkgeversTable,
} from "@workspace/db";
import {
  setupE2eWebAdminAccount,
  E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET,
} from "./e2e-monteur-testaccount";

const BASIS = process.env.API_BASIS
  ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}/api` : "http://localhost:8080/api");

let geslaagd = 0;
let gefaald = 0;
function check(naam: string, conditie: boolean, detail?: string) {
  if (conditie) { geslaagd++; console.log(`  ✓ ${naam}`); }
  else { gefaald++; console.error(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

type Sessie = { cookie: string };
async function login(email: string, wachtwoord: string, totpSecret: string): Promise<Sessie> {
  const r1 = await fetch(`${BASIS}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord }),
  });
  const cookie = (r1.headers.get("set-cookie") ?? "").split(";")[0]!;
  const j1 = (await r1.json()) as { status?: string };
  if (j1.status === "verify_2fa" || j1.status === "setup_2fa") {
    const code = authenticator.generate(totpSecret);
    const r2 = await fetch(`${BASIS}/auth/2fa/verify`, {
      method: "POST", headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ code }),
    });
    if (!r2.ok) throw new Error(`2fa verify faalde: ${r2.status} ${await r2.text()}`);
    const c2 = r2.headers.get("set-cookie");
    return { cookie: c2 ? c2.split(";")[0]! : cookie };
  }
  if (!r1.ok) throw new Error(`login faalde: ${r1.status} ${JSON.stringify(j1)}`);
  return { cookie };
}

async function api(s: Sessie, methode: string, pad: string, body?: unknown) {
  const r = await fetch(`${BASIS}${pad}`, {
    method: methode,
    headers: { "Content-Type": "application/json", cookie: s.cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: unknown = null;
  try { json = await r.json(); } catch { /* leeg */ }
  return { status: r.status, json };
}

const MARKER = "BEWIJS-GBSCHEMA";

async function schoonOp(werkgeverId: number | null) {
  const facturen = await db.select({ id: facturenTable.id }).from(facturenTable)
    .where(like(facturenTable.factuurnummer, `${MARKER}%`));
  for (const f of facturen) {
    await db.delete(factuurRegelsTable).where(eq(factuurRegelsTable.factuurId, f.id));
    await db.delete(facturenTable).where(eq(facturenTable.id, f.id));
  }
  await db.delete(gebouwenTable).where(eq(gebouwenTable.naam, MARKER));
  if (werkgeverId != null) {
    await db.delete(grootboekrekeningenTable).where(eq(grootboekrekeningenTable.werkgeverId, werkgeverId));
  }
}

async function main() {
  console.log("— ADMINISTRATIE_01 rekeningschema bewijsscript —");
  await setupE2eWebAdminAccount();

  // Opzet: kies een werkgever (BV) en bewaar de oorspronkelijke AccountView-
  // instellingen zodat we ze na afloop exact terugzetten.
  const [wg] = await db.select().from(werkgeversTable).limit(1);
  if (!wg) throw new Error("Geen werkgever in dev-database");
  const [instOrigineel] = await db.select().from(accountviewInstellingenTable)
    .where(eq(accountviewInstellingenTable.id, 1)).limit(1);
  if (!instOrigineel) throw new Error("AccountView-instellingen (id=1) ontbreken in dev");

  await schoonOp(wg.id);
  const admin = await login(E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET);

  try {
    // Bewijs 1: lijst inlezen (upsert, nooit deleten).
    const imp1 = await api(admin, "POST", "/grootboekrekeningen/import", {
      werkgever_id: wg.id,
      regels: "4000;Inkoop materialen;kosten\n4100;Uitbesteed werk;kosten\n8000;Omzet montage;opbrengsten",
    });
    const impJ1 = imp1.json as { aantal?: number; toegevoegd?: number };
    check("import lijst → 201, 3 toegevoegd", imp1.status === 201 && impJ1.toegevoegd === 3, JSON.stringify(imp1.json));

    // Bewijs 2: herimport zonder 4100 deactiveert (niet wist).
    const imp2 = await api(admin, "POST", "/grootboekrekeningen/import", {
      werkgever_id: wg.id,
      regels: "4000;Inkoop materialen;kosten\n8000;Omzet montage;opbrengsten",
    });
    const impJ2 = imp2.json as { gedeactiveerd?: number };
    check("herimport deactiveert verdwenen nummer (niet wissen)", imp2.status === 201 && impJ2.gedeactiveerd === 1, JSON.stringify(imp2.json));
    const alle = await db.select().from(grootboekrekeningenTable).where(eq(grootboekrekeningenTable.werkgeverId, wg.id));
    check("4100 bestaat nog met actief=false", alle.some((r) => r.nummer === "4100" && !r.actief));

    // Bewijs 3: keuzelijst-endpoint levert nummer+omschrijving.
    const lijst = await api(admin, "GET", `/grootboekrekeningen?werkgever_id=${wg.id}`);
    const rijen = lijst.json as Array<{ nummer: string; omschrijving: string; actief: boolean }>;
    check("GET /grootboekrekeningen levert schema met omschrijving",
      lijst.status === 200 && rijen.some((r) => r.nummer === "4000" && r.omschrijving === "Inkoop materialen"),
      JSON.stringify(lijst.json).slice(0, 200));

    // Bewijs 4: lege aanlevering → 422.
    const impLeeg = await api(admin, "POST", "/grootboekrekeningen/import", { werkgever_id: wg.id, regels: "  \n " });
    check("lege aanlevering → 422", impLeeg.status === 422, JSON.stringify(impLeeg.json));

    // Bewijs 5: sync-meting meldt eerlijk of AccountView dit toestaat (dev
    // heeft geen echte credentials → beschikbaar=false met reden, geen crash).
    await db.update(accountviewInstellingenTable).set({ werkgeverId: wg.id }).where(eq(accountviewInstellingenTable.id, 1));
    const sync = await api(admin, "POST", "/grootboekrekeningen/sync-accountview");
    const syncJ = sync.json as { beschikbaar?: boolean; reden?: string };
    check("sync-meting antwoordt gestructureerd (meet & meldt)",
      sync.status === 200 && typeof syncJ.beschikbaar === "boolean" && (syncJ.beschikbaar || !!syncJ.reden),
      JSON.stringify(sync.json));

    // Bewijs 6: gebruik-meting telt en wijst typefouten aan.
    const [factuurFout] = await db.insert(facturenTable).values({
      type: "inkoop", factuurnummer: `${MARKER}-1`, factuurdatum: "2026-08-18",
      relatienaam: "Bewijs Leverancier", bedragExclBtw: "100.00", btwBedrag: "21.00",
      bedragInclBtw: "121.00", btwCode: "H", grootboekrekening: "4001", // typefout: niet in schema
      geaccordeerd: true, status: "klaar_voor_accountview",
    }).returning();
    const gebruik = await api(admin, "GET", "/grootboekrekeningen/gebruik");
    const gebJ = gebruik.json as { items?: Array<{ nummer: string; in_schema?: boolean | null }>; niet_in_schema?: string[] };
    check("gebruik-meting wijst 4001 aan als niet-in-schema",
      gebruik.status === 200 && (gebJ.niet_in_schema ?? []).includes("4001"),
      JSON.stringify(gebruik.json).slice(0, 300));

    // Bewijs 7: boekingspoort — export op rekening buiten schema wordt geweigerd.
    // Gebouw met werkgever koppelen zodat de BV-controle slaagt en we bij de
    // schemapoort uitkomen.
    const [gebouw] = await db.insert(gebouwenTable).values({
      naam: MARKER, adres: "Teststraat 1", werkgeverId: wg.id,
    } as typeof gebouwenTable.$inferInsert).returning();
    await db.update(facturenTable).set({ gebouwId: gebouw!.id }).where(eq(facturenTable.id, factuurFout!.id));
    await db.update(accountviewInstellingenTable)
      .set({ testmodus: true, exportActief: false, apiGebruiker: instOrigineel.apiGebruiker ?? "bewijs-test" })
      .where(eq(accountviewInstellingenTable.id, 1));
    const exp1 = await api(admin, "POST", `/facturen/${factuurFout!.id}/export-accountview`);
    const expJ1 = exp1.json as { error?: string; fout?: string; detail?: string };
    const weigering = JSON.stringify(exp1.json);
    check("export op rekening buiten schema → 422 met leesbare reden",
      exp1.status === 422 && weigering.includes("rekeningschema"), `${exp1.status} ${weigering}`);

    // Bewijs 8: zelfde factuur op een schema-rekening boekt wél (testmodus).
    await db.update(facturenTable)
      .set({ grootboekrekening: "4000", accountviewStatus: null, accountviewFout: null })
      .where(eq(facturenTable.id, factuurFout!.id));
    const exp2 = await api(admin, "POST", `/facturen/${factuurFout!.id}/export-accountview`);
    check("export op schema-rekening slaagt (testmodus)", exp2.status === 200, `${exp2.status} ${JSON.stringify(exp2.json).slice(0, 200)}`);

    // Bewijs 9: ook de forceer-herexport (geprivilegieerd pad) passeert de
    // schemapoort — regressietest tegen bypass.
    await db.update(facturenTable)
      .set({ grootboekrekening: "9999" })
      .where(eq(facturenTable.id, factuurFout!.id));
    const forceer = await api(admin, "POST", `/facturen/${factuurFout!.id}/forceer-herexport`);
    check("forceer-herexport buiten schema → 422",
      forceer.status === 422 && JSON.stringify(forceer.json).includes("rekeningschema"),
      `${forceer.status} ${JSON.stringify(forceer.json).slice(0, 200)}`);

    // Bewijs 10: batch-export weigert de buiten-schema factuur per regel.
    await db.update(facturenTable)
      .set({ accountviewStatus: null, accountviewFout: null, accountviewBoekingId: null })
      .where(eq(facturenTable.id, factuurFout!.id));
    const batch = await api(admin, "POST", "/facturen/batch-export", { factuur_ids: [factuurFout!.id] });
    const batchStr = JSON.stringify(batch.json);
    check("batch-export buiten schema → mislukt met schemareden",
      batch.status === 200 ? batchStr.includes("rekeningschema") : batchStr.includes("rekeningschema"),
      `${batch.status} ${batchStr.slice(0, 300)}`);
  } finally {
    // Oorspronkelijke instellingen exact terugzetten + testdata opruimen.
    await db.update(accountviewInstellingenTable).set({
      werkgeverId: instOrigineel.werkgeverId,
      testmodus: instOrigineel.testmodus,
      exportActief: instOrigineel.exportActief,
      apiGebruiker: instOrigineel.apiGebruiker,
    }).where(eq(accountviewInstellingenTable.id, 1));
    await schoonOp(wg.id);
  }

  console.log(`\nResultaat: ${geslaagd} geslaagd, ${gefaald} gefaald`);
  process.exit(gefaald > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
