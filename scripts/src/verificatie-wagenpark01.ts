// WAGENPARK_01 — bewijsscript (§8 acceptatie-eisen). Test via HTTP (nooit
// api-server-source importeren) + @workspace/db voor opzet/inspectie/cleanup.
// Draaien: pnpm --filter @workspace/scripts run tsx src/verificatie-wagenpark01.ts
import { authenticator } from "otplib";
import { eq, and, like, desc, isNull, inArray } from "drizzle-orm";
import {
  db, gebruikersTable, voertuigenTable, wagenparkMeldingenTable, wagenparkKostenTable,
  wagenparkSyncLogTable, documentenTable, documentKoppelingenTable, documentsoortenTable,
  werkbakItemsTable,
} from "@workspace/db";
import {
  setupE2eAccount, setupE2eWebAccount, setupE2eWebAdminAccount,
  archiveerE2eAccount, archiveerE2eWebAccount, archiveerE2eWebAdminAccount,
  E2E_EMAIL, E2E_WACHTWOORD, E2E_TOTP_SECRET,
  E2E_WEB_EMAIL, E2E_WEB_WACHTWOORD, E2E_WEB_TOTP_SECRET,
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
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord }),
  });
  const cookie = (r1.headers.get("set-cookie") ?? "").split(";")[0]!;
  const j1 = (await r1.json()) as { status?: string };
  if (j1.status === "verify_2fa" || j1.status === "setup_2fa") {
    const code = authenticator.generate(totpSecret);
    const r2 = await fetch(`${BASIS}/auth/2fa/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
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
  let json: any = null;
  try { json = await r.json(); } catch { /* leeg */ }
  return { status: r.status, json };
}

const MARK = "WAGENPARK01-E2E";

async function cleanup(voertuigIds: number[]) {
  // Testdata opruimen via DB (governance blokkeert kritieke DELETEs via API).
  if (voertuigIds.length > 0) {
    const docs = await db.select({ id: documentKoppelingenTable.documentId })
      .from(documentKoppelingenTable)
      .where(and(eq(documentKoppelingenTable.doelType, "voertuig"), inArray(documentKoppelingenTable.doelId, voertuigIds)));
    const docIds = docs.map((d) => d.id);
    await db.delete(documentKoppelingenTable)
      .where(and(eq(documentKoppelingenTable.doelType, "voertuig"), inArray(documentKoppelingenTable.doelId, voertuigIds)));
    if (docIds.length > 0) await db.delete(documentenTable).where(inArray(documentenTable.id, docIds));
    await db.delete(wagenparkKostenTable).where(inArray(wagenparkKostenTable.voertuigId, voertuigIds));
    await db.delete(wagenparkMeldingenTable).where(inArray(wagenparkMeldingenTable.voertuigId, voertuigIds));
    await db.delete(voertuigenTable).where(inArray(voertuigenTable.id, voertuigIds));
  }
  await db.delete(documentsoortenTable).where(like(documentsoortenTable.naam, `${MARK}%`));
  await db.delete(werkbakItemsTable).where(like(werkbakItemsTable.titel, `%${MARK}%`));
}

async function main() {
  console.log(`Basis: ${BASIS}\n`);
  const voertuigIds: number[] = [];

  try {
    // ── Opzet ──────────────────────────────────────────────────────────────
    const monteurAId = await setupE2eWebAccount();   // monteur A
    const monteurBId = await setupE2eAccount();      // monteur B
    await setupE2eWebAdminAccount();
    // Monteurs mogen géén wagenpark-modulerecht hebben (setup geeft alles 4).
    for (const id of [monteurAId, monteurBId]) {
      const [g] = await db.select({ b: gebruikersTable.bevoegdheden }).from(gebruikersTable).where(eq(gebruikersTable.id, id));
      await db.update(gebruikersTable).set({ bevoegdheden: { ...(g!.b as object), wagenpark: 0 } }).where(eq(gebruikersTable.id, id));
    }

    const admin = await login(E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET);
    const monteurA = await login(E2E_WEB_EMAIL, E2E_WEB_WACHTWOORD, E2E_WEB_TOTP_SECRET);
    const monteurB = await login(E2E_EMAIL, E2E_WACHTWOORD, E2E_TOTP_SECRET);

    // Twee voertuigen: diesel-bus (A, met provider-ID voor sync) en EV (B).
    console.log("Opzet: voertuigen aanmaken");
    const vA = await api(admin, "POST", "/wagenpark/voertuigen", {
      kenteken: "E2E-WP-A", merk: "Volkswagen", type: "Transporter", km_stand: 118500,
      aandrijving: "diesel", onderhouds_interval_km: 30000,
      apk_datum: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10),
      chauffeur_id: monteurAId, provider_voertuig_id: `${MARK}-A`,
      garage_naam: "Garage Jansen", garage_email: "werkplaats@garage-jansen-e2e-onbestaand.nl",
    });
    check("voertuig A aangemaakt (201)", vA.status === 201, JSON.stringify(vA.json));
    const vB = await api(admin, "POST", "/wagenpark/voertuigen", {
      kenteken: "E2E-WP-B", merk: "Ford", type: "E-Transit", km_stand: 21000,
      aandrijving: "elektrisch", chauffeur_id: monteurBId,
    });
    check("voertuig B (EV) aangemaakt (201)", vB.status === 201);
    const idA = vA.json.id as number; const idB = vB.json.id as number;
    voertuigIds.push(idA, idB);

    // ── §8.7 EV: aandrijving + kosten-categorie 'laden' ────────────────────
    console.log("\n§8.7 — EV-ondersteuning");
    check("voertuig B heeft aandrijving=elektrisch", vB.json.aandrijving === "elektrisch");
    const laadKosten = await api(admin, "POST", `/wagenpark/voertuigen/${idB}/kosten`, {
      categorie: "laden", bedrag: 42.5, datum: new Date().toISOString(), omschrijving: `${MARK} laadsessie`,
    });
    check("kosten met categorie 'laden' geaccepteerd (201)", laadKosten.status === 201, JSON.stringify(laadKosten.json));
    const overzicht = await api(admin, "GET", `/wagenpark/voertuigen/${idB}/kosten-overzicht`);
    check("kostenoverzicht per jaar bevat 'laden'", overzicht.status === 200
      && Array.isArray(overzicht.json)
      && overzicht.json.some((j: any) => j.per_categorie?.laden > 0), JSON.stringify(overzicht.json));

    // ── §8.1 Documentsoorten + document koppelen ───────────────────────────
    console.log("\n§8.1 — Eigen documentsoort aanmaken en koppelen");
    const soort = await api(admin, "POST", "/documentsoorten", {
      context: "voertuig", naam: `${MARK} Wintercheck-certificaat`, heeft_vervaldatum: true, waarschuwing_dagen: 45,
    });
    check("documentsoort aangemaakt (201)", soort.status === 201, JSON.stringify(soort.json));
    const dubbel = await api(admin, "POST", "/documentsoorten", {
      context: "voertuig", naam: `${MARK} Wintercheck-certificaat`,
    });
    check("dubbele naam geeft 409", dubbel.status === 409);

    // Upload multipart: vervaldatum bewust binnen de waarschuwingstermijn (30 dgn < 45).
    const geldigTot = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const fd = new FormData();
    fd.append("bestand", new Blob([`%PDF-1.4 ${MARK} testdocument`], { type: "application/pdf" }), "wintercheck.pdf");
    fd.append("documentsoort_id", String(soort.json.id));
    fd.append("geldig_tot", geldigTot);
    const up = await fetch(`${BASIS}/wagenpark/voertuigen/${idA}/documenten`, {
      method: "POST", headers: { cookie: admin.cookie }, body: fd,
    });
    const upJson: any = await up.json().catch(() => null);
    check("voertuigdocument geüpload (201)", up.status === 201, JSON.stringify(upJson));
    const docLijst = await api(admin, "GET", `/wagenpark/voertuigen/${idA}/documenten`);
    check("document zichtbaar op voertuig met soortnaam", docLijst.status === 200
      && docLijst.json.some((d: any) => d.id === upJson?.id && d.documentsoort_naam?.includes("Wintercheck")));
    const zonderDatum = new FormData();
    zonderDatum.append("bestand", new Blob(["x"], { type: "application/pdf" }), "x.pdf");
    zonderDatum.append("documentsoort_id", String(soort.json.id));
    const upFout = await fetch(`${BASIS}/wagenpark/voertuigen/${idA}/documenten`, {
      method: "POST", headers: { cookie: admin.cookie }, body: zonderDatum,
    });
    check("upload zonder verplichte vervaldatum geeft 400", upFout.status === 400);
    const verwijderSoort = await api(admin, "DELETE", `/documentsoorten/${soort.json.id}`);
    check("soort in gebruik verwijderen geeft 409", verwijderSoort.status === 409);

    // ── §8.2 + §8.9 Bewakingsloop: documentsignaal + automatische sync ─────
    console.log("\n§8.2/§8.9 — Bewakingsloop draaien (documentsignaal + auto-sync)");
    const draai = await api(admin, "POST", "/werkbak/bewaking/draai");
    check("bewakingsloop gedraaid", draai.status === 200, JSON.stringify(draai.json).slice(0, 300));
    const [docSignaal] = await db.select().from(werkbakItemsTable)
      .where(eq(werkbakItemsTable.dedupSleutel, `voertuigdoc:${upJson?.id}`));
    check("§8.2 werkbak-signaal voor aflopend document (module wagenpark, niveau 3)",
      !!docSignaal && docSignaal.vereisteModule === "wagenpark" && docSignaal.vereistNiveau === 3,
      JSON.stringify(docSignaal ?? null));
    console.log(`    → signaal landt bij: module '${docSignaal?.vereisteModule}' niveau ${docSignaal?.vereistNiveau} (werkbak)`);
    const [apkSignaal] = await db.select().from(werkbakItemsTable)
      .where(eq(werkbakItemsTable.dedupSleutel, `voertuig:${idA}:apk`));
    check("APK-signaal (20 dgn) aanwezig", !!apkSignaal);
    const [autoSync] = await db.select().from(wagenparkSyncLogTable)
      .where(isNull(wagenparkSyncLogTable.gestartDoorId))
      .orderBy(desc(wagenparkSyncLogTable.gestartOp)).limit(1);
    check("§8.9 automatische sync-log-regel zonder gestart_door_id", !!autoSync
      && Date.now() - autoSync.gestartOp.getTime() < 5 * 60_000, JSON.stringify(autoSync ?? null));

    // ── §8.3/§8.4/§8.5 Mijn auto ───────────────────────────────────────────
    console.log("\n§8.3/§8.4/§8.5 — Mijn auto scoping");
    const mijnA = await api(monteurA, "GET", "/wagenpark/mijn-auto");
    check("monteur A ziet eigen auto (E2E-WP-A)", mijnA.status === 200 && mijnA.json?.voertuig?.kenteken === "E2E-WP-A");
    const mijnB = await api(monteurB, "GET", "/wagenpark/mijn-auto");
    check("monteur B ziet eigen auto (E2E-WP-B, elektrisch)", mijnB.status === 200
      && mijnB.json?.voertuig?.kenteken === "E2E-WP-B" && mijnB.json?.voertuig?.aandrijving === "elektrisch");
    const mijnAdmin = await api(admin, "GET", "/wagenpark/mijn-auto");
    check("§8.4 gebruiker zonder auto krijgt rustige null-respons", mijnAdmin.status === 200 && mijnAdmin.json?.voertuig === null);
    const andermans = await api(monteurA, "GET", `/wagenpark/voertuigen/${idB}`);
    check("§8.5 monteur zonder wagenpark-recht krijgt andermans voertuig niet (403)", andermans.status === 403, `status=${andermans.status}`);

    // ── §8.6 RDW met echt kenteken ─────────────────────────────────────────
    console.log("\n§8.6 — RDW-lookup met echt kenteken");
    let echtKenteken: string | null = null;
    try {
      const r = await fetch("https://opendata.rdw.nl/resource/m9d7-ebf2.json?$limit=1&$where=vervaldatum_apk%20IS%20NOT%20NULL", { signal: AbortSignal.timeout(8000) });
      const rows = (await r.json()) as Array<{ kenteken?: string }>;
      echtKenteken = rows?.[0]?.kenteken ?? null;
    } catch { /* RDW onbereikbaar */ }
    if (echtKenteken) {
      const rdw = await api(admin, "GET", `/wagenpark/rdw/${echtKenteken}`);
      check(`RDW-gegevens gevonden voor ${echtKenteken}`, rdw.status === 200 && rdw.json?.gevonden === true && !!rdw.json?.merk,
        JSON.stringify(rdw.json));
    } else {
      check("RDW extern bereikbaar (voorwaarde)", false, "RDW open data niet bereikbaar vanuit dev — handmatig herchecken");
    }
    const rdwOnzin = await api(admin, "GET", "/wagenpark/rdw/ZZZZ99");
    check("onbekend kenteken faalt niet hard (gevonden=false)", rdwOnzin.status === 200 && rdwOnzin.json?.gevonden === false);

    // ── §8.8 Garagemail: falen = melding blijft open + signaal ────────────
    console.log("\n§8.8 — Garagemail-flow");
    // Melding namens monteur A op voertuig A.
    const melding = await api(monteurA, "POST", "/wagenpark/meldingen", {
      type: "storing", omschrijving: `${MARK} motorlampje brandt`, storing_type: "motor",
    });
    check("monteur A maakt melding (201)", melding.status === 201, JSON.stringify(melding.json).slice(0, 200));
    const meldingId = melding.json?.id;
    if (meldingId) {
      const doorzet = await api(admin, "POST", `/wagenpark/meldingen/${meldingId}/doorzetten-garage`, { notitie: `${MARK}` });
      if (doorzet.status === 503 || doorzet.status === 502) {
        check("mail niet verstuurd → duidelijke fout (502/503), geen stille doorzetting", true);
        const [naFout] = await db.select().from(wagenparkMeldingenTable).where(eq(wagenparkMeldingenTable.id, meldingId));
        check("melding staat NIET op doorgezet_garage", naFout?.status !== "doorgezet_garage", `status=${naFout?.status}`);
        const [signaal] = await db.select().from(werkbakItemsTable)
          .where(eq(werkbakItemsTable.dedupSleutel, `garagemail:${meldingId}`));
        check("werkbak-signaal 'garagemail niet verstuurd' aanwezig", !!signaal && signaal.status === "open");
        console.log("    → mail is in dev niet geconfigureerd; happy path (geldig adres → doorgezet_garage) is een prod-scenario.");
      } else if (doorzet.status === 200) {
        check("mail geconfigureerd: doorzetten geslaagd → status doorgezet_garage", doorzet.json?.status === "doorgezet_garage");
        console.log("    → standaardgarage van het voertuig is als ontvanger gebruikt (geen adres in het verzoek).");
      } else {
        check("doorzetten-garage gaf onverwachte status", false, `status=${doorzet.status} ${JSON.stringify(doorzet.json)}`);
      }
      // Zonder garage-adres én zonder vaste garage → 422.
      const doorzetB = await api(admin, "POST", "/wagenpark/meldingen/999999/doorzetten-garage", {});
      check("onbekende melding geeft 404", doorzetB.status === 404);
    }

    // Doorgezette/eigen meldingen zichtbaar in mijn-auto.
    const mijnA2 = await api(monteurA, "GET", "/wagenpark/mijn-auto");
    check("eigen melding zichtbaar in mijn-auto", mijnA2.json?.meldingen?.some((m: any) => m.omschrijving?.includes(MARK)) === true);

  } finally {
    console.log("\nOpruimen…");
    await cleanup(voertuigIds).catch((e) => console.error("cleanup faalde:", e));
    await archiveerE2eAccount().catch(() => undefined);
    await archiveerE2eWebAccount().catch(() => undefined);
    await archiveerE2eWebAdminAccount().catch(() => undefined);
  }

  console.log(`\nResultaat: ${geslaagd} geslaagd, ${gefaald} gefaald`);
  process.exit(gefaald > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
