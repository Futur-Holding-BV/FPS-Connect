// Verificatie: werktijdvensters + rapport ritten buiten werktijd (task 842).
// Bewijst het businessscenario end-to-end via HTTP tegen de dev api-server.
import { db } from "@workspace/db";
import {
  voertuigenTable, wagenparkRittenTable, wagenparkWerktijdvenstersTable,
  wagenparkAvgLogboekTable, gebruikersTable,
} from "@workspace/db/schema";
import { eq, desc, like } from "drizzle-orm";
import {
  setupE2eWebAdminAccount, E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD,
  genereerVersWebAdminTotp,
} from "./e2e-monteur-testaccount";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
let cookies = "";

async function api(pad: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${BASIS}${pad}`, {
    ...init,
    headers: { "Content-Type": "application/json", cookie: cookies, ...(init.headers ?? {}) },
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) cookies = setCookie.map((c) => c.split(";")[0]).join("; ");
  return res;
}

function check(naam: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "✅" : "❌"} ${naam}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  await setupE2eWebAdminAccount();

  // Login (2-staps met TOTP)
  const l1 = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: E2E_WEB_ADMIN_EMAIL, wachtwoord: E2E_WEB_ADMIN_WACHTWOORD }),
  });
  const l1b = await l1.json() as any;
  check("login stap 1", l1.ok && l1b.status === "verify_2fa", l1b);
  const code = await genereerVersWebAdminTotp();
  const l2 = await api("/auth/2fa/verify", { method: "POST", body: JSON.stringify({ code }) });
  check("2FA-login", l2.ok, l2.status);

  // Testvoertuig + ritten: één binnen venster (di 10:00), één buiten (zo 22:00)
  const [voertuig] = await db.insert(voertuigenTable).values({
    kenteken: "VV-842-T", merk: "Test", type: "Verificatie", bijgewerktOp: new Date(),
  }).returning();
  // di 4 aug 2026 10:00 en zo 2 aug 2026 22:00 lokale tijd (UTC+2 in augustus)
  const binnen = new Date("2026-08-04T08:00:00Z");
  const buiten = new Date("2026-08-02T20:00:00Z");
  // Randgeval: lokale vroege ochtend op de startdag (za 1 aug 00:30 CEST = 31 jul 22:30 UTC)
  // — moet in de periode 2026-08-01..2026-08-08 vallen én buiten venster zijn (zaterdag).
  const vroegeOchtend = new Date("2026-07-31T22:30:00Z");
  await db.insert(wagenparkRittenTable).values([
    { voertuigId: voertuig.id, startDatum: binnen, afstandKm: 12.5 },
    { voertuigId: voertuig.id, startDatum: buiten, afstandKm: 33.4 },
    { voertuigId: voertuig.id, startDatum: vroegeOchtend, afstandKm: 5.1 },
  ]);

  try {
    // 1. Ongeldige invoer geweigerd
    const bad = await api("/wagenpark/werktijdvensters", {
      method: "PUT",
      body: JSON.stringify({ werkdagen: [9], start_tijd: "07:00", eind_tijd: "18:00" }),
    });
    check("ongeldige werkdagen → 400", bad.status === 400);

    // 2. Organisatiestandaard instellen (upsert)
    const put1 = await api("/wagenpark/werktijdvensters", {
      method: "PUT",
      body: JSON.stringify({ voertuig_id: null, werkdagen: [1, 2, 3, 4, 5], start_tijd: "07:00", eind_tijd: "18:00" }),
    });
    check("org-venster opslaan", put1.ok, put1.status);
    const put2 = await api("/wagenpark/werktijdvensters", {
      method: "PUT",
      body: JSON.stringify({ voertuig_id: null, werkdagen: [1, 2, 3, 4, 5], start_tijd: "06:30", eind_tijd: "18:00" }),
    });
    const venster = await put2.json() as any;
    check("org-venster upsert (200, niet dubbel)", put2.status === 200 && venster.start_tijd === "06:30");

    const lijst = await (await api("/wagenpark/werktijdvensters")).json() as any;
    check("lijst bevat 1 org-venster", lijst.filter((w: any) => w.voertuig_id === null).length === 1);

    // 3. Rapport: precies de zondagsrit buiten venster, voertuiggericht
    const rap = await (await api("/wagenpark/rapportage/buiten-werktijd?van=2026-08-01&tot=2026-08-08")).json() as any;
    const rij = rap.voertuigen.find((v: any) => v.voertuig_id === voertuig.id);
    check("rapport geconfigureerd", rap.geconfigureerd === true);
    check("testvoertuig in rapport", !!rij);
    check("2 van 3 ritten buiten venster (zo-avond + za-vroege-ochtend op startdag)",
      rij?.aantal_ritten_totaal === 3 && rij?.aantal_buiten_venster === 2, rij);
    check("km buiten venster = 38.5", rij?.km_buiten_venster === 38.5);

    // Periode-grenzen: dag ná de vroege-ochtendrit als startdatum → rit valt erbuiten
    const rapNa = await (await api("/wagenpark/rapportage/buiten-werktijd?van=2026-08-02&tot=2026-08-08")).json() as any;
    const rijNa = rapNa.voertuigen.find((v: any) => v.voertuig_id === voertuig.id);
    check("startgrens = lokale kalenderdag (za-rit buiten periode vanaf 02-08)",
      rijNa?.aantal_ritten_totaal === 2 && rijNa?.aantal_buiten_venster === 1, rijNa && { t: rijNa.aantal_ritten_totaal, b: rijNa.aantal_buiten_venster });

    // van > tot → 400
    const omgekeerd = await api("/wagenpark/rapportage/buiten-werktijd?van=2026-08-08&tot=2026-08-01");
    check("van > tot → 400", omgekeerd.status === 400);

    // DST-grens: klok verspringt zo 29 mrt 2026 (CET→CEST).
    // Rit za 28 mrt 23:30 lokaal (22:30Z, CET) hoort NIET bij van=2026-03-29;
    // rit zo 29 mrt 03:00 lokaal (01:00Z, CEST) hoort er wél bij (en is buiten venster: zondag).
    await db.insert(wagenparkRittenTable).values([
      { voertuigId: voertuig.id, startDatum: new Date("2026-03-28T22:30:00Z"), afstandKm: 7 },
      { voertuigId: voertuig.id, startDatum: new Date("2026-03-29T01:00:00Z"), afstandKm: 9 },
    ]);
    const rapDst = await (await api("/wagenpark/rapportage/buiten-werktijd?van=2026-03-29&tot=2026-03-29")).json() as any;
    const rijDst = rapDst.voertuigen.find((v: any) => v.voertuig_id === voertuig.id);
    check("DST-grens: alleen de zondagsrit in periode 29-03 (1 totaal, 1 buiten)",
      rijDst?.aantal_ritten_totaal === 1 && rijDst?.aantal_buiten_venster === 1, rijDst && { t: rijDst.aantal_ritten_totaal, b: rijDst.aantal_buiten_venster });
    const rit = rij?.ritten_buiten?.[0];
    const VERBODEN_VELDEN = ["vertrek_adres", "bestemming_adres", "gebruiker_id", "chauffeur_id", "doel", "project_id"];
    check("rit-detail zonder adres/persoon/privé-classificatie",
      !!rit && VERBODEN_VELDEN.every((veld) => !(veld in rit)), rit);

    // 4. AVG-logboekregistratie bij raadpleging
    const [logRij] = await db.select().from(wagenparkAvgLogboekTable)
      .where(like(wagenparkAvgLogboekTable.reden, "%buiten werktijd%"))
      .orderBy(desc(wagenparkAvgLogboekTable.id)).limit(1);
    check("AVG-log bij raadpleging", !!logRij && logRij.actie === "inzage" && logRij.datatype === "ritten",
      logRij ? { actie: logRij.actie, reden: logRij.reden } : null);

    // 5. Voertuigspecifiek venster overschrijft org-standaard
    const putV = await api("/wagenpark/werktijdvensters", {
      method: "PUT",
      body: JSON.stringify({ voertuig_id: voertuig.id, werkdagen: [0, 1, 2, 3, 4, 5, 6], start_tijd: "00:00", eind_tijd: "23:59" }),
    });
    const vensterV = await putV.json() as any;
    check("voertuigvenster opslaan", putV.ok);
    const rap2 = await (await api("/wagenpark/rapportage/buiten-werktijd?van=2026-08-01&tot=2026-08-08")).json() as any;
    const rij2 = rap2.voertuigen.find((v: any) => v.voertuig_id === voertuig.id);
    check("voertuigvenster geldt (0 buiten, bron=voertuig)",
      rij2?.aantal_buiten_venster === 0 && rij2?.venster_bron === "voertuig", rij2 && { b: rij2.aantal_buiten_venster, bron: rij2.venster_bron });

    // 6. Verwijderen
    const del = await api(`/wagenpark/werktijdvensters/${vensterV.id}`, { method: "DELETE" });
    check("voertuigvenster verwijderen → 204", del.status === 204);
  } finally {
    // Opruimen testdata (org-venster laten staan? nee — opruimen, dit is dev-config van de verificatie)
    await db.delete(wagenparkRittenTable).where(eq(wagenparkRittenTable.voertuigId, voertuig.id));
    await db.delete(voertuigenTable).where(eq(voertuigenTable.id, voertuig.id));
    await db.delete(wagenparkWerktijdvenstersTable);
    await db.update(gebruikersTable).set({ gearchiveerd: true })
      .where(eq(gebruikersTable.email, E2E_WEB_ADMIN_EMAIL)).catch?.(() => {});
  }
}

main().then(() => process.exit(process.exitCode ?? 0)).catch((e) => { console.error(e); process.exit(1); });
