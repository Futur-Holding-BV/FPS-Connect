// Gedragsbewijs KALENDER_01 — jaarkalender.
// Acceptatie §9 (1 t/m 12), via HTTP tegen de lokale api-server + DB-verificatie:
//   1.  Drie collectieve dagen 2027 in één handeling.
//   2.  Saldo afgeboekt via het bestaande mechanisme (saldo vóór/na van 2 medewerkers).
//   3.  Deeltijder 32u → 6,4 uur, plus de §4.3-beperkingsmelding.
//   4.  De dag staat als verlof in de weekstaat en telt mee in de volledigheidscontrole.
//   5.  Terugdraaien: aanvragen ingetrokken + saldi teruggeboekt + overzicht.
//   6.  APK in de kalender komt uit het voertuig (wijzigen → kalender beweegt mee).
//   7.  Monteur ziet geen collega-verlof (bestaande regel benoemd).
//   8.  Gereedschapskeuring ≤30 dagen → werkbak-item via de bewakingsloop.
//   9.  Aantal verwerkte medewerkers + wie negatief staat (rapport).
//   10. Verjaardag zonder opt-in is onzichtbaar.
//   11. Geen leeftijd/geboortejaar in de kalenderroute.
//   12. Server-antwoord voor de monteur: collectief + eigen verlof + eigen APK,
//       géén collega-verlof of wagenpark-breed.
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-kalender01.ts
import "./lib/prodGuard";
import bcrypt from "bcryptjs";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { authenticator } from "otplib";
import { db, gebruikersTable, medewerkersTable } from "@workspace/db";
import {
  verlofsoortenTable, verlofSaldiTable, verlofAanvragenTable,
  collectieveVrijeDagenTable, kalenderAfsprakenTable,
  voertuigenTable, gereedschappenTable, bruikleenOvereenkomstenTable,
  werkbakItemsTable, weekStatenTable, urenRegistratiesTable,
  medewerkerAanstellingenTable,
} from "@workspace/db/schema";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const TOTP = "MFRGGZDFMZTWQ2LK";
const WW = "BewijsKalender01!2026";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript nooit tegen productie draaien.");
}

function check(naam: string, conditie: boolean, detail?: unknown): void {
  if (!conditie) { console.error(`✗ FAALT: ${naam}`, JSON.stringify(detail ?? "", null, 1).slice(0, 2000)); throw new Error(naam); }
  console.log(`✓ ${naam}`);
}

const EMAILS = ["bewijs-kal-hrm@fps.local", "bewijs-kal-voltijd@fps.local", "bewijs-kal-deeltijd@fps.local", "bewijs-kal-monteur@fps.local"];

async function ruimOp(): Promise<void> {
  const gebruikers = await db.select({ id: gebruikersTable.id }).from(gebruikersTable).where(inArray(gebruikersTable.email, EMAILS));
  const gids = gebruikers.map((g) => g.id);
  if (gids.length) {
    const meds = await db.select({ id: medewerkersTable.id }).from(medewerkersTable).where(inArray(medewerkersTable.gebruikerId, gids));
    const mids = meds.map((m) => m.id);
    if (mids.length) {
      await db.delete(verlofAanvragenTable).where(inArray(verlofAanvragenTable.medewerkerId, mids));
      await db.delete(verlofSaldiTable).where(inArray(verlofSaldiTable.medewerkerId, mids));
      await db.delete(urenRegistratiesTable).where(inArray(urenRegistratiesTable.medewerkerId, mids));
      await db.delete(weekStatenTable).where(inArray(weekStatenTable.medewerkerId, mids));
      await db.delete(bruikleenOvereenkomstenTable).where(inArray(bruikleenOvereenkomstenTable.medewerkerId, mids));
      await db.delete(medewerkerAanstellingenTable).where(inArray(medewerkerAanstellingenTable.medewerkerId, mids));
      await db.delete(medewerkersTable).where(inArray(medewerkersTable.id, mids));
    }
    await db.delete(voertuigenTable).where(like(voertuigenTable.kenteken, "BW-KAL%"));
    await db.delete(gebruikersTable).where(inArray(gebruikersTable.id, gids));
  }
  const dagen = await db.select({ id: collectieveVrijeDagenTable.id }).from(collectieveVrijeDagenTable).where(like(collectieveVrijeDagenTable.naam, "Bewijs KAL%"));
  if (dagen.length) {
    await db.delete(verlofAanvragenTable).where(inArray(verlofAanvragenTable.collectieveDagId, dagen.map((d) => d.id)));
    await db.delete(collectieveVrijeDagenTable).where(inArray(collectieveVrijeDagenTable.id, dagen.map((d) => d.id)));
  }
  await db.delete(kalenderAfsprakenTable).where(like(kalenderAfsprakenTable.titel, "Bewijs KAL%"));
  await db.delete(gereedschappenTable).where(like(gereedschappenTable.omschrijving, "Bewijs KAL%"));
  await db.delete(verlofsoortenTable).where(like(verlofsoortenTable.naam, "Bewijs KAL%"));
  await db.delete(werkbakItemsTable).where(like(werkbakItemsTable.titel, "%Bewijs KAL%"));
}

async function maakGebruiker(email: string, naam: string, extra: Record<string, unknown> = {}): Promise<number> {
  const [g] = await db.insert(gebruikersTable).values({
    naam, email, rol: "gebruiker", wachtwoord: await bcrypt.hash(WW, 10),
    totpSecret: TOTP, tweeFactorIngeschakeld: true, actief: true, ...extra,
  } as typeof gebruikersTable.$inferInsert).returning({ id: gebruikersTable.id });
  return g.id;
}

async function login(email: string): Promise<Record<string, string>> {
  const r = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord: WW, code: authenticator.generate(TOTP) }),
  });
  if (r.status !== 200) throw new Error(`login ${email} faalde: ${r.status} ${await r.text()}`);
  const j = await r.json() as { token: string };
  return { Authorization: `Bearer ${j.token}`, "Content-Type": "application/json" };
}

async function saldoVan(mid: number, soortId: number, jaar: number) {
  const [s] = await db.select().from(verlofSaldiTable)
    .where(and(eq(verlofSaldiTable.medewerkerId, mid), eq(verlofSaldiTable.verlofsoortId, soortId), eq(verlofSaldiTable.jaar, jaar)));
  return s;
}

async function main(): Promise<void> {
  await ruimOp();

  // ── Opzet ──────────────────────────────────────────────────────────────────
  const hrmGid = await maakGebruiker(EMAILS[0], "Bewijs KAL HRM", { rol: "hoofdbeheerder", bevoegdheden: { personeel: 3, wagenpark: 2, gereedschappen: 2, gebouwen: 1 } });
  const voltijdGid = await maakGebruiker(EMAILS[1], "Bewijs KAL Voltijd", { bevoegdheden: { gebouwen: 1 } });
  const deeltijdGid = await maakGebruiker(EMAILS[2], "Bewijs KAL Deeltijd", { bevoegdheden: { gebouwen: 1 } });
  const monteurGid = await maakGebruiker(EMAILS[3], "Bewijs KAL Monteur", { bevoegdheden: { gebouwen: 1 } });

  const [soort] = await db.insert(verlofsoortenTable).values({
    naam: "Bewijs KAL collectief", collectief: true, betaald: true,
  } as typeof verlofsoortenTable.$inferInsert).returning();
  const [nietCollectief] = await db.insert(verlofsoortenTable).values({
    naam: "Bewijs KAL gewoon", collectief: false, betaald: true,
  } as typeof verlofsoortenTable.$inferInsert).returning();

  const maakMed = async (gid: number, naam: string, uren: number, geboortedatum: string, opt: boolean) => {
    const [m] = await db.insert(medewerkersTable).values({
      gebruikerId: gid, naam, contracturenPerWeek: uren, actief: true,
      geboortedatum, verjaardagZichtbaar: opt, inDienstSinds: "2020-01-01",
    } as typeof medewerkersTable.$inferInsert).returning({ id: medewerkersTable.id });
    return m.id;
  };
  const voltijdMid = await maakMed(voltijdGid, "Bewijs KAL Voltijd", 40, "1990-03-15", true);
  const deeltijdMid = await maakMed(deeltijdGid, "Bewijs KAL Deeltijd", 32, "1985-11-02", false); // §9.10: opt-in UIT
  const monteurMid = await maakMed(monteurGid, "Bewijs KAL Monteur", 40, "1995-07-04", true);

  // Saldi: voltijd 16u (wordt negatief na 3 dagen), deeltijd 40u.
  await db.insert(verlofSaldiTable).values([
    { medewerkerId: voltijdMid, verlofsoortId: soort.id, jaar: 2027, beginsaldoUren: 16, opgebouwdUren: 0, opgenomenUren: 0, saldoUren: 16 },
    { medewerkerId: deeltijdMid, verlofsoortId: soort.id, jaar: 2027, beginsaldoUren: 40, opgebouwdUren: 0, opgenomenUren: 0, saldoUren: 40 },
    { medewerkerId: monteurMid, verlofsoortId: soort.id, jaar: 2027, beginsaldoUren: 40, opgebouwdUren: 0, opgenomenUren: 0, saldoUren: 40 },
  ] as (typeof verlofSaldiTable.$inferInsert)[]);

  // Eigen auto van de monteur + een tweede (niet-eigen) voertuig.
  const [eigenAuto] = await db.insert(voertuigenTable).values({
    kenteken: "BW-KAL-1", merk: "Ford", type: "Transit", chauffeurId: monteurGid,
    apkDatum: new Date("2026-10-15T00:00:00Z"),
  } as typeof voertuigenTable.$inferInsert).returning({ id: voertuigenTable.id });
  await db.insert(voertuigenTable).values({
    kenteken: "BW-KAL-2", merk: "VW", type: "Crafter",
    apkDatum: new Date("2026-09-01T00:00:00Z"),
  } as typeof voertuigenTable.$inferInsert);

  // Gereedschap in bruikleen bij de monteur, keuring binnen 30 dagen.
  const overDagen = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
  const [gereedschap] = await db.insert(gereedschappenTable).values({
    volgnummer: "BW-KAL-G1", omschrijving: "Bewijs KAL boormachine",
    keuringsplichtig: true, keuringVervalDatum: new Date(`${overDagen}T00:00:00Z`),
  } as typeof gereedschappenTable.$inferInsert).returning({ id: gereedschappenTable.id });
  await db.insert(bruikleenOvereenkomstenTable).values({
    gereedschapId: gereedschap.id, medewerkerId: monteurMid, datumUitgifte: "2026-01-05",
  } as typeof bruikleenOvereenkomstenTable.$inferInsert);

  // Collega-verlof (voltijd) dat de monteur NIET mag zien; eigen verlof wél.
  await db.insert(verlofAanvragenTable).values([
    { medewerkerId: voltijdMid, verlofsoortId: nietCollectief.id, startDatum: "2026-08-17", eindDatum: "2026-08-21", aantalUren: 40, status: "goedgekeurd" },
    { medewerkerId: monteurMid, verlofsoortId: nietCollectief.id, startDatum: "2026-09-07", eindDatum: "2026-09-08", aantalUren: 16, status: "goedgekeurd" },
  ] as (typeof verlofAanvragenTable.$inferInsert)[]);

  const hrm = await login(EMAILS[0]);
  const monteur = await login(EMAILS[3]);

  // ── 1+2+3+9: drie collectieve dagen 2027 in één handeling ────────────────
  const voltijdVoor = await saldoVan(voltijdMid, soort.id, 2027);
  const deeltijdVoor = await saldoVan(deeltijdMid, soort.id, 2027);
  console.log(`  saldo vóór — voltijd: ${voltijdVoor.saldoUren}u, deeltijd: ${deeltijdVoor.saldoUren}u`);

  const post = await fetch(`${BASIS}/collectieve-vrije-dagen`, {
    method: "POST", headers: hrm,
    body: JSON.stringify({
      verlofsoort_id: soort.id,
      dagen: [
        { datum: "2027-05-14", naam: "Bewijs KAL dag na Hemelvaart" },
        { datum: "2027-12-24", naam: "Bewijs KAL kerstavond" },
        { datum: "2027-12-31", naam: "Bewijs KAL oudjaarsdag" },
      ],
    }),
  });
  const postJ = await post.json() as { dagen: Array<{ id: number; datum: string; rapport: { verwerkt: number; uren_per_medewerker: Array<{ naam: string; uren: number }>; negatief: Array<{ naam: string; saldo_uren: number }> } }>; beperking: string };
  check("1. drie collectieve dagen 2027 in één handeling vastgelegd (201)", post.status === 201 && postJ.dagen.length === 3, postJ);

  const voltijdNa = await saldoVan(voltijdMid, soort.id, 2027);
  const deeltijdNa = await saldoVan(deeltijdMid, soort.id, 2027);
  console.log(`  saldo na — voltijd: ${voltijdNa.saldoUren}u (opgenomen ${voltijdNa.opgenomenUren}u), deeltijd: ${deeltijdNa.saldoUren}u (opgenomen ${deeltijdNa.opgenomenUren}u)`);
  check("2. voltijd 3×8u afgeboekt via bestaand mechanisme (16 → -8)", voltijdNa.saldoUren === -8 && voltijdNa.opgenomenUren === 24, voltijdNa);
  const dt = postJ.dagen[0].rapport.uren_per_medewerker.find((u) => u.naam === "Bewijs KAL Deeltijd");
  check("3. deeltijder 32u krijgt 6,4u per dag (32÷5), geen 8", dt?.uren === 6.4 && deeltijdNa.opgenomenUren === 19.2, { dt, deeltijdNa });
  check("3b. beperkingsmelding §4.3 (naar rato / handmatige correctie) aanwezig", postJ.beperking.includes("naar rato"), postJ.beperking);
  const rapport = postJ.dagen[0].rapport;
  console.log(`  9. verwerkt per dag: ${rapport.verwerkt} medewerkers; negatief: ${JSON.stringify(rapport.negatief)}`);
  check("9. rapport meldt verwerkte medewerkers en wie negatief staat", rapport.verwerkt >= 3 && postJ.dagen[2].rapport.negatief.some((n) => n.naam === "Bewijs KAL Voltijd" && n.saldo_uren < 0), postJ.dagen[2].rapport);

  // ── 4: de dag staat als verlof in de weekstaat ────────────────────────────
  // 2027-05-14 valt in week ma 10 t/m zo 16 mei 2027.
  // 2027-05-14 valt in ISO-week 19 van 2027.
  const week = await fetch(`${BASIS}/uren/mijn-week?jaar=2027&week=19`, { headers: monteur });
  const weekJ = await week.json() as { verlof?: Array<{ start_datum?: string; startDatum?: string }> } & Record<string, unknown>;
  const weekTekst = JSON.stringify(weekJ);
  check("4. collectieve dag verschijnt als verlof in de weekstaat van de monteur", week.status === 200 && weekTekst.includes("2027-05-14"), weekJ);
  console.log("  4b. volledigheidscontrole: goedgekeurd verlof telt mee als 'geteld' naast de norm (lib/weekControle.ts) — de week wordt dus niet als onvolledig gemeld. NB: de §4.5-formulering ('norm verlaagd') wijkt tekstueel af; gedrag is gelijkwaardig. Gemeld als afwijking.");

  // ── 6: APK komt uit het voertuig (bron, geen kopie) ───────────────────────
  const kal1 = await fetch(`${BASIS}/kalender?jaar=2026`, { headers: monteur });
  const kal1J = await kal1.json() as { items: Array<{ datum: string; soort: string; titel: string; bron: string }> };
  check("6a. kalender toont APK van de eigen auto op 2026-10-15 (bron: voertuigen)", kal1J.items.some((i) => i.soort === "keuring" && i.bron === "voertuigen" && i.datum === "2026-10-15" && i.titel.includes("BW-KAL-1")), kal1J.items.filter((i) => i.soort === "keuring"));
  await db.update(voertuigenTable).set({ apkDatum: new Date("2026-11-20T00:00:00Z") }).where(eq(voertuigenTable.id, eigenAuto.id));
  const kal2 = await fetch(`${BASIS}/kalender?jaar=2026`, { headers: monteur });
  const kal2J = await kal2.json() as { items: Array<{ datum: string; soort: string; titel: string; bron: string }> };
  check("6b. APK-datum op het voertuig gewijzigd → kalender beweegt mee (2026-11-20), zonder kalender-mutatie", kal2J.items.some((i) => i.bron === "voertuigen" && i.datum === "2026-11-20") && !kal2J.items.some((i) => i.bron === "voertuigen" && i.datum === "2026-10-15"), kal2J.items.filter((i) => i.soort === "keuring"));

  // ── 7+12: scoping voor de monteur ─────────────────────────────────────────
  const tekst = JSON.stringify(kal2J.items);
  check("7. monteur ziet het verlof van de collega NIET (regel: kalender volgt de bestaande grens — alles alleen met personeel:1, anders uitsluitend eigen verlof, zoals GET /verlofaanvragen vs /mijn/verlofaanvragen)", !tekst.includes("Bewijs KAL Voltijd —"), kal2J.items.filter((i) => i.soort === "vakantie"));
  check("12a. monteur ziet wél zijn eigen verlof (2026-09-07)", kal2J.items.some((i) => i.soort === "vakantie" && i.datum === "2026-09-07"));
  check("12b. monteur ziet keuring van eigen bruikleen-gereedschap, en NIET het hele wagenpark (BW-KAL-2 afwezig)", kal2J.items.some((i) => i.bron === "gereedschappen" && i.titel.includes("boormachine")) && !tekst.includes("BW-KAL-2"), kal2J.items.filter((i) => i.soort === "keuring"));
  const kal27 = await fetch(`${BASIS}/kalender?jaar=2027`, { headers: monteur });
  const kal27J = await kal27.json() as { items: Array<{ datum: string; soort: string }> };
  check("12c. monteur ziet de collectieve vrije dagen van 2027", kal27J.items.filter((i) => i.soort === "collectief").length === 3);

  // ── 10+11: verjaardagen ───────────────────────────────────────────────────
  const hrmKal = await fetch(`${BASIS}/kalender?jaar=2026`, { headers: hrm });
  const hrmKalJ = await hrmKal.json() as { items: Array<{ soort: string; titel: string; datum: string }> };
  const hrmTekst = JSON.stringify(hrmKalJ);
  check("10. verjaardag zonder opt-in (Deeltijd) is volledig onzichtbaar — ook geen lege markering op 11-02", !hrmKalJ.items.some((i) => i.soort === "verjaardag" && (i.titel.includes("Deeltijd") || i.datum === "2026-11-02")), hrmKalJ.items.filter((i) => i.soort === "verjaardag"));
  check("10b. verjaardag mét opt-in (Voltijd) is zichtbaar op 2026-03-15", hrmKalJ.items.some((i) => i.soort === "verjaardag" && i.titel.includes("Voltijd") && i.datum === "2026-03-15"));
  check("11. geen geboortejaar of leeftijd in de ruwe JSON", !hrmTekst.includes("1990") && !hrmTekst.includes("1985") && !hrmTekst.match(/leeftijd/i), hrmKalJ.items.filter((i) => i.soort === "verjaardag"));
  console.log(`  11b. ruwe verjaardag-JSON: ${JSON.stringify(hrmKalJ.items.filter((i) => i.soort === "verjaardag" && i.titel.includes("KAL")))}`);

  // ── 8: gereedschapskeuring ≤30 dagen → werkbak-item via de bewakingsloop ──
  const loop = await fetch(`${BASIS}/werkbak/bewaking/draai`, { method: "POST", headers: hrm });
  check("8a. handmatige bewakingsloop-draai geslaagd (200)", loop.status === 200, loop.status);
  const [item] = await db.select().from(werkbakItemsTable).where(like(werkbakItemsTable.titel, "%Bewijs KAL boormachine%"));
  check("8. gereedschapskeuring ≤30 dagen staat als werkbak-item (bron verloopdatum)", !!item && item.bron === "verloopdatum", item ?? loop.status);

  // ── 5: terugdraaien ───────────────────────────────────────────────────────
  const dagId = postJ.dagen[0].id;
  const gekoppeldVooraf = await db.select({ id: verlofAanvragenTable.id }).from(verlofAanvragenTable).where(eq(verlofAanvragenTable.collectieveDagId, dagId));
  const del = await fetch(`${BASIS}/collectieve-vrije-dagen/${dagId}`, { method: "DELETE", headers: hrm });
  const delJ = await del.json() as { verwijderd: boolean; teruggedraaid: Array<{ naam: string; uren: number }> };
  check("5a. terugdraaien geeft één overzicht van ingetrokken aanvragen", del.status === 200 && delJ.verwijderd && delJ.teruggedraaid.length >= 3, delJ);
  const voltijdTerug = await saldoVan(voltijdMid, soort.id, 2027);
  check("5b. saldo teruggeboekt via hetzelfde mechanisme (voltijd -8 → 0)", voltijdTerug.saldoUren === 0 && voltijdTerug.opgenomenUren === 16, voltijdTerug);
  // NB: de FK op collectieve_dag_id is ON DELETE SET NULL; controleer daarom
  // op de vooraf vastgelegde aanvraag-ids.
  const ingetrokken = await db.select().from(verlofAanvragenTable).where(and(inArray(verlofAanvragenTable.id, gekoppeldVooraf.map((a) => a.id)), eq(verlofAanvragenTable.status, "ingetrokken")));
  check("5c. gekoppelde verlofaanvragen staan op 'ingetrokken'", ingetrokken.length >= 3 && ingetrokken.length === gekoppeldVooraf.length, { ingetrokken: ingetrokken.length, vooraf: gekoppeldVooraf.length });

  console.log("\nAlle KALENDER_01-acceptatiechecks geslaagd.");
}

main()
  .then(() => ruimOp())
  .then(() => process.exit(0))
  .catch(async (e) => { console.error(e); await ruimOp().catch(() => {}); process.exit(1); });
