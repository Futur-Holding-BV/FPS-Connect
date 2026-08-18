// FINANCIEEL_KETEN_01 — bewijsscript voor de ketenreparaties.
// Test via HTTP (nooit api-server-source importeren) + @workspace/db voor
// opzet/schoonmaak. Draaien: npx tsx scripts/src/verificatie-financieel-keten.ts
import "./lib/prodGuard";
import { authenticator } from "otplib";
import { eq, like, and, desc } from "drizzle-orm";
import {
  db, facturenTable, opdrachtenTable, werkbakItemsTable, activiteitenTable,
  marktspiegelOnderzoekenTable,
} from "@workspace/db";
import {
  setupE2eWebAdminAccount,
  E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET,
} from "./e2e-monteur-testaccount";

const BASIS = process.env.API_BASIS
  ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}/api` : "http://localhost:8080/api");

const MARKER = "BEWIJS-FINKETEN";

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
  const tekst = await r.text();
  let json: unknown = null;
  try { json = JSON.parse(tekst); } catch { /* geen json */ }
  return { status: r.status, json, tekst };
}

async function main() {
  await setupE2eWebAdminAccount();
  const admin = await login(E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET);

  const gisteren = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const testIds: number[] = [];

  try {
    // ── Opzet: drie testfacturen die elk één voeder moeten raken ──
    const [fBlok] = await db.insert(facturenTable).values({
      type: "inkoop", status: "controle_nodig", relatienaam: `${MARKER} Geblokkeerd BV`,
      factuurnummer: `${MARKER}-BLOK`, bedragInclBtw: "121.00", geblokkeerd: true,
    }).returning();
    const [fFout] = await db.insert(facturenTable).values({
      type: "inkoop", status: "fout_bij_verzending", relatienaam: `${MARKER} Exportfout BV`,
      factuurnummer: `${MARKER}-FOUT`, bedragInclBtw: "242.00",
    }).returning();
    const [fVerv] = await db.insert(facturenTable).values({
      type: "verkoop", status: "verzonden_naar_accountview", relatienaam: `${MARKER} Klant BV`,
      factuurnummer: `${MARKER}-VERV`, bedragInclBtw: "605.00",
      vervaldatum: gisteren, betaalstatus: "openstaand",
    }).returning();
    testIds.push(fBlok!.id, fFout!.id, fVerv!.id);

    // Stale marktspiegel-onderzoek (1 uur oud, nog "bezig").
    const [markt] = await db.insert(marktspiegelOnderzoekenTable).values({
      onderwerpType: "vrij", vraag: `${MARKER} vastgelopen onderzoek`,
      status: "bezig", aangemaaktOp: new Date(Date.now() - 60 * 60 * 1000),
    }).returning();

    // ── Bewijs 1-3: bewakingsloop voedt de nieuwe bronnen ──
    const draai = await api(admin, "POST", "/werkbak/bewaking/draai");
    check("bewakingsloop draait met nieuwe voeders zonder fout", draai.status === 200, draai.tekst.slice(0, 200));
    const s = (draai.json as { samenvatting: Record<string, { nieuw?: number; fout?: string }> }).samenvatting;
    for (const bron of ["facturen_geblokkeerd", "facturen_exportfout", "verkoopfacturen_vervallen", "ohw_signalen"]) {
      check(`voeder ${bron} zonder fout`, s?.[bron] !== undefined && s[bron]!.fout === undefined, JSON.stringify(s?.[bron]));
    }

    const items = await db.select().from(werkbakItemsTable)
      .where(like(werkbakItemsTable.titel, `%${MARKER}%`));
    const bronnen = new Set(items.map((i) => i.bron));
    check("werkbak-item voor geblokkeerde factuur", bronnen.has("factuur_geblokkeerd"), [...bronnen].join(","));
    check("werkbak-item voor exportfout", bronnen.has("factuur_exportfout"), [...bronnen].join(","));
    check("werkbak-item voor vervallen verkoopfactuur", bronnen.has("verkoopfactuur_vervallen"), [...bronnen].join(","));

    // ── Bewijs 4: reconciliatie — toestand opgelost → item afgehandeld ──
    await db.update(facturenTable).set({ geblokkeerd: false }).where(eq(facturenTable.id, fBlok!.id));
    await api(admin, "POST", "/werkbak/bewaking/draai");
    const [naDraai] = await db.select().from(werkbakItemsTable)
      .where(and(like(werkbakItemsTable.titel, `%${MARKER} Geblokkeerd%`), eq(werkbakItemsTable.bron, "factuur_geblokkeerd")))
      .orderBy(desc(werkbakItemsTable.id)).limit(1);
    check("blokkade opgeheven → werkbak-item automatisch afgehandeld", naDraai?.status !== "open", naDraai?.status);

    // ── Bewijs 5: vastgelopen marktspiegel-onderzoek wordt eerlijk 'fout' ──
    const lijst = await api(admin, "GET", "/marktspiegel");
    const rij = (lijst.json as Array<{ id: number; status: string; fout: string | null }>).find((r) => r.id === markt!.id);
    check("vastgelopen marktspiegel-onderzoek → status fout met reden",
      rij?.status === "fout" && (rij?.fout ?? "").includes("vastgelopen"), JSON.stringify(rij));
    await db.delete(marktspiegelOnderzoekenTable).where(eq(marktspiegelOnderzoekenTable.id, markt!.id));

    // ── Bewijs 6-7: OHW-override eist toelichting en legt het besluit vast ──
    const [opdracht] = await db.select({ id: opdrachtenTable.id }).from(opdrachtenTable).limit(1);
    if (opdracht) {
      const zonder = await api(admin, "PATCH", `/financieel/onderhanden-werk/${opdracht.id}`,
        { waarderingsmethode: "handmatig", handmatig_bedrag: 1234 });
      check("handmatige OHW-waardering zonder toelichting → 422", zonder.status === 422, String(zonder.status));
      const met = await api(admin, "PATCH", `/financieel/onderhanden-werk/${opdracht.id}`,
        { waarderingsmethode: "handmatig", handmatig_bedrag: 1234, opmerkingen: `${MARKER} toelichting` });
      check("met toelichting → geaccepteerd", met.status === 200, `${met.status} ${met.tekst.slice(0, 120)}`);
      const [act] = await db.select().from(activiteitenTable)
        .where(and(eq(activiteitenTable.type, "ohw_override"), like(activiteitenTable.omschrijving, `%${MARKER}%`)))
        .orderBy(desc(activiteitenTable.id)).limit(1);
      check("OHW-besluit vastgelegd in activiteitenlog (wie/wat/toelichting)",
        act !== undefined && (act.gebruikerNaam ?? "") !== "", JSON.stringify(act ?? null).slice(0, 150));
      // terug naar rekenmodel
      await api(admin, "PATCH", `/financieel/onderhanden-werk/${opdracht.id}`, { waarderingsmethode: "percentage_gereed", opmerkingen: `${MARKER} herstel` });
    } else {
      check("OHW-override: geen opdracht in dev-DB om op te testen", false, "geen opdrachten");
    }

    // ── Bewijs 8: factuur verwijderen wordt vastgelegd ──
    const del = await api(admin, "DELETE", `/facturen/${fFout!.id}`);
    check("factuur verwijderen → 204", del.status === 204, String(del.status));
    const [actDel] = await db.select().from(activiteitenTable)
      .where(and(eq(activiteitenTable.type, "factuur_verwijderd"), like(activiteitenTable.omschrijving, `%${MARKER}-FOUT%`)))
      .orderBy(desc(activiteitenTable.id)).limit(1);
    check("verwijderbesluit vastgelegd met factuurnummer en gebruiker",
      actDel !== undefined && (actDel.gebruikerNaam ?? "") !== "", JSON.stringify(actDel ?? null).slice(0, 150));
  } finally {
    // Schoonmaak: testdata + werkbak-items + activiteitregels met MARKER.
    await db.delete(werkbakItemsTable).where(like(werkbakItemsTable.titel, `%${MARKER}%`));
    await db.delete(activiteitenTable).where(like(activiteitenTable.omschrijving, `%${MARKER}%`));
    await db.delete(facturenTable).where(like(facturenTable.factuurnummer, `${MARKER}%`));
    await db.delete(marktspiegelOnderzoekenTable).where(like(marktspiegelOnderzoekenTable.vraag, `%${MARKER}%`));
  }

  console.log(`\nResultaat: ${geslaagd} geslaagd, ${gefaald} gefaald`);
  process.exit(gefaald > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
