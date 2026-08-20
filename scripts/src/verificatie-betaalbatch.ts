// ADMINISTRATIE_02 §3 — crediteuren-betaalbatch (SEPA pain.001), bewijsscript.
// Test via HTTP (nooit api-server-source importeren) + @workspace/db voor
// opzet/schoonmaak. Draaien: npx tsx scripts/src/verificatie-betaalbatch.ts
import "./lib/prodGuard";
import { authenticator } from "otplib";
import { eq, like, inArray } from "drizzle-orm";
import {
  db, facturenTable, leveranciersTable, opdrachtenTable, werkgeversTable,
  werkgeverBankrekeningenTable, betaalbatchesTable, betaalbatchRegelsTable,
  appInstellingenTable,
} from "@workspace/db";
import {
  setupE2eWebAdminAccount,
  E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET,
} from "./e2e-monteur-testaccount";
import { registreerGroenBewijs } from "./lib/acceptatieregisterBewijs";

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
  const tekst = await r.text();
  let json: unknown = null;
  try { json = JSON.parse(tekst); } catch { /* geen json (bv. XML) */ }
  return { status: r.status, json, tekst };
}

const MARKER = "BEWIJS-BETAALBATCH";
const IBAN_GELDIG = "NL91ABNA0417164300";

async function main() {
  await setupE2eWebAdminAccount();
  const admin = await login(E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET);

  // Onthoud de huidige stand van de schakelaar om die netjes terug te zetten.
  const [instVoor] = await db.select({ id: appInstellingenTable.id, actief: appInstellingenTable.betaalbatchActief })
    .from(appInstellingenTable).limit(1);
  const schakelaarVoor = instVoor?.actief ?? false;

  let wgId: number | null = null;
  let levId: number | null = null;
  const factuurIds: number[] = [];
  let opdrachtId: number | null = null;

  try {
    // Bewijs 1: schakelaar UIT → 423 (akkoord-poort René).
    if (instVoor) await db.update(appInstellingenTable).set({ betaalbatchActief: false }).where(eq(appInstellingenTable.id, instVoor.id));
    const dicht = await api(admin, "GET", "/betaalbatches/betaalbare-facturen?werkgever_id=1");
    check("schakelaar uit → 423 met leesbare reden", dicht.status === 423 && dicht.tekst.includes("akkoord"), `${dicht.status} ${dicht.tekst.slice(0, 150)}`);
    const dichtPost = await api(admin, "POST", "/betaalbatches", { werkgever_id: 1, uitvoerdatum: "2026-08-20", factuur_ids: [1] });
    check("schakelaar uit → ook aanmaken geweigerd (423)", dichtPost.status === 423, String(dichtPost.status));
    const dichtLijst = await api(admin, "GET", "/betaalbatches");
    const dichtAnnuleer = await api(admin, "POST", "/betaalbatches/999999/annuleren");
    check("schakelaar uit → ook lijst en annuleren geweigerd (423)",
      dichtLijst.status === 423 && dichtAnnuleer.status === 423, `lijst=${dichtLijst.status} annuleren=${dichtAnnuleer.status}`);

    // Schakelaar AAN (zoals René na akkoord zou doen).
    if (instVoor) await db.update(appInstellingenTable).set({ betaalbatchActief: true }).where(eq(appInstellingenTable.id, instVoor.id));

    // Opzet: werkgever + crediteuren-rekening + leverancier + opdracht + facturen.
    const [wg] = await db.insert(werkgeversTable).values({ naam: MARKER } as typeof werkgeversTable.$inferInsert).returning();
    wgId = wg!.id;
    await db.insert(werkgeverBankrekeningenTable).values({
      werkgeverId: wgId, iban: "NL69INGB0123456789", tenaamstelling: `${MARKER} BV`, doelen: ["crediteuren"],
    });
    const [lev] = await db.insert(leveranciersTable).values({
      naam: `${MARKER} Leverancier`, iban: IBAN_GELDIG,
    } as typeof leveranciersTable.$inferInsert).returning();
    levId = lev!.id;
    const [opdracht] = await db.insert(opdrachtenTable).values({
      titel: MARKER, status: "concept", werkmaatschappijId: wgId,
    } as typeof opdrachtenTable.$inferInsert).returning();
    opdrachtId = opdracht!.id;

    const maakFactuur = async (nr: string, extra: Partial<typeof facturenTable.$inferInsert>) => {
      const [f] = await db.insert(facturenTable).values({
        type: "inkoop", status: "klaar_voor_accountview", bron: "handmatig",
        factuurnummer: `${MARKER}-${nr}`, relatienaam: `${MARKER} Leverancier`,
        bedragInclBtw: "121.00", bedragExclBtw: "100.00",
        leverancierId: levId, opdrachtId,
        geaccordeerd: true, accountviewBoekingId: `AV-${MARKER}-${nr}`,
        vervaldatum: "2026-09-01",
        ...extra,
      } as typeof facturenTable.$inferInsert).returning();
      factuurIds.push(f!.id);
      return f!;
    };
    const f1 = await maakFactuur("001", {});
    const f2 = await maakFactuur("002", { bedragInclBtw: "250.50" });
    const fNiet = await maakFactuur("003", { geaccordeerd: false });
    const fG = await maakFactuur("004", { gRekeningVanToepassing: true, gRekeningBedrag: "30.00" });

    // Bewijs 2: selectielijst — betaalbaar vs. redenen (fail-closed).
    const lijst = await api(admin, "GET", `/betaalbatches/betaalbare-facturen?werkgever_id=${wgId}`);
    const items = (lijst.json as { items?: Array<{ factuur_id: number; betaalbaar: boolean; reden: string | null }> })?.items ?? [];
    const byId = new Map(items.map((i) => [i.factuur_id, i]));
    check("geaccordeerde+geboekte facturen zijn betaalbaar",
      byId.get(f1.id)?.betaalbaar === true && byId.get(f2.id)?.betaalbaar === true, JSON.stringify([byId.get(f1.id), byId.get(f2.id)]));
    check("niet-geaccordeerde factuur valt eruit met reden",
      byId.get(fNiet.id)?.betaalbaar === false && (byId.get(fNiet.id)?.reden ?? "").includes("geaccordeerd"), JSON.stringify(byId.get(fNiet.id)));
    check("G-rekeningfactuur valt eruit (handwerk)",
      byId.get(fG.id)?.betaalbaar === false && (byId.get(fG.id)?.reden ?? "").includes("G-rekening"), JSON.stringify(byId.get(fG.id)));

    // Bewijs 3: batch aanmaken met een niet-betaalbare factuur → 422 (fail-closed).
    const fout = await api(admin, "POST", "/betaalbatches", { werkgever_id: wgId, uitvoerdatum: "2026-08-20", factuur_ids: [f1.id, fNiet.id] });
    check("batch met niet-betaalbare factuur → 422 met reden", fout.status === 422 && fout.tekst.includes("geaccordeerd"), `${fout.status} ${fout.tekst.slice(0, 200)}`);

    // Bewijs 4: geldige batch aanmaken.
    const aanmaak = await api(admin, "POST", "/betaalbatches", { werkgever_id: wgId, uitvoerdatum: "2026-08-20", factuur_ids: [f1.id, f2.id] });
    const aanmaakJ = aanmaak.json as { id?: number; totaal_bedrag?: number; aantal_betalingen?: number };
    check("batch aangemaakt: 2 betalingen, totaal 371.50",
      aanmaak.status === 201 && aanmaakJ.aantal_betalingen === 2 && Math.abs((aanmaakJ.totaal_bedrag ?? 0) - 371.5) < 0.005, JSON.stringify(aanmaak.json));
    const batchId = aanmaakJ.id!;

    // Bewijs 5: dezelfde factuur nogmaals batchen → geweigerd.
    const dubbel = await api(admin, "POST", "/betaalbatches", { werkgever_id: wgId, uitvoerdatum: "2026-08-21", factuur_ids: [f1.id] });
    check("factuur die al in een batch zit → geweigerd", dubbel.status === 422 || dubbel.status === 409, `${dubbel.status} ${dubbel.tekst.slice(0, 150)}`);

    // Bewijs 6: pain.001-bestand — structuur, IBAN's, totalen.
    const xml = await api(admin, "GET", `/betaalbatches/${batchId}/pain001`);
    check("pain.001 bevat schema, debiteur- en crediteur-IBAN en controlesom",
      xml.status === 200
      && xml.tekst.includes("pain.001.001.03")
      && xml.tekst.includes("NL69INGB0123456789")
      && xml.tekst.includes(IBAN_GELDIG)
      && xml.tekst.includes("<CtrlSum>371.50</CtrlSum>")
      && xml.tekst.includes("<NbOfTxs>2</NbOfTxs>")
      && xml.tekst.includes("<ReqdExctnDt>2026-08-20</ReqdExctnDt>"),
      xml.tekst.slice(0, 300));
    const [naDownload] = await db.select({ status: betaalbatchesTable.status }).from(betaalbatchesTable).where(eq(betaalbatchesTable.id, batchId));
    check("download zet batch op bestand_aangemaakt", naDownload?.status === "bestand_aangemaakt", naDownload?.status);

    // Bewijs 7: bevestigen zet de facturen op betaald.
    const bevestig = await api(admin, "POST", `/betaalbatches/${batchId}/bevestigen`);
    const betaald = await db.select({ id: facturenTable.id, betaalstatus: facturenTable.betaalstatus, betaaldatum: facturenTable.betaaldatum })
      .from(facturenTable).where(inArray(facturenTable.id, [f1.id, f2.id]));
    check("bevestigen → facturen op betaald met uitvoerdatum als betaaldatum",
      bevestig.status === 200 && betaald.every((f) => f.betaalstatus === "betaald" && f.betaaldatum === "2026-08-20"), JSON.stringify(betaald));

    // Bewijs 8: bevestigde batch kan niet meer worden geannuleerd.
    const annuleer = await api(admin, "POST", `/betaalbatches/${batchId}/annuleren`);
    check("bevestigde batch annuleren → 422", annuleer.status === 422, String(annuleer.status));
  } finally {
    // Schoonmaak (MARKER-gedreven) + schakelaar terugzetten.
    try {
      if (factuurIds.length > 0) {
        await db.delete(betaalbatchRegelsTable).where(inArray(betaalbatchRegelsTable.factuurId, factuurIds));
      }
      if (wgId != null) await db.delete(betaalbatchesTable).where(eq(betaalbatchesTable.werkgeverId, wgId));
      await db.delete(facturenTable).where(like(facturenTable.factuurnummer, `${MARKER}%`));
      if (opdrachtId != null) await db.delete(opdrachtenTable).where(eq(opdrachtenTable.id, opdrachtId));
      if (levId != null) await db.delete(leveranciersTable).where(eq(leveranciersTable.id, levId));
      if (wgId != null) {
        await db.delete(werkgeverBankrekeningenTable).where(eq(werkgeverBankrekeningenTable.werkgeverId, wgId));
        await db.delete(werkgeversTable).where(eq(werkgeversTable.id, wgId));
      }
      if (instVoor) await db.update(appInstellingenTable).set({ betaalbatchActief: schakelaarVoor }).where(eq(appInstellingenTable.id, instVoor.id));
    } catch (err) {
      console.error("Schoonmaak faalde:", err);
    }
  }

  if (gefaald === 0) {
    const bijgewerkt = await registreerGroenBewijs({
      opdrachtCode: "FACTUUR_03",
      puntNummers: [1],
      scriptPad: "scripts/src/verificatie-betaalbatch.ts",
      bronBestand: "FACTUUR_03_betaling_1786157194600.md",
      relevanteCodepaden: [
        "artifacts/api-server/src/routes/betaalbatch.ts",
        "lib/db/src/schema/facturen.ts",
      ],
      volledigGeslaagd: true,
      toelichting: "Groene HTTP-run bewijst de selectielijst vóór bestandsaanmaak, inclusief betaalbaar- en uitsluitredenen.",
    });
    console.log(`  ✓ ${bijgewerkt} gekoppeld registerpunt automatisch op gehaald gezet`);
  }
  console.log(`\nResultaat: ${geslaagd} geslaagd, ${gefaald} gefaald`);
  process.exit(gefaald > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
