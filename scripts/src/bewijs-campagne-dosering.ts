// Gedragsbewijs Task 1024 — gedoseerde campagne-verzender (MARKETING_01 Deel A).
// Acceptatie:
//  1. Beheerder keurt campagne éénmalig goed (POST /verzenden) → wachtrij-items
//     gaan daarna automatisch gespreid de deur uit (geen per-item handeling).
//  2. Tempo instelbaar (PATCH /marketing/verzendtempo, 1–60/min; 422 daarbuiten).
//  3. Concurrency: stoppen mídden in een lopende verzending werkt per direct —
//     na de stop gaat er niets meer uit, resterende items worden afgewezen.
//  4. Dosering: opeenvolgende verzendingen liggen minstens ~60/tempo sec uiteen.
// Patroon: HTTP tegen de lokale api-server, seeds/cleanup via @workspace/db.
// Mails gaan naar @fps.local (testdomein → onderdrukt, nooit echt verzonden).
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-campagne-dosering.ts
import bcrypt from "bcryptjs";
import { and, eq, inArray, like } from "drizzle-orm";
import { authenticator } from "otplib";
import {
  db,
  gebruikersTable,
  crmKlantenTable,
  crmContactpersonenTable,
  mailWachtrijTable,
  appInstellingenTable,
} from "@workspace/db";
import {
  marketingDoelgroepenTable,
  marketingSjablonenTable,
  marketingCampagnesTable,
  marketingCampagneOntvangersTable,
  crmCommunicatieTable,
} from "@workspace/db/schema";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const TOTP = "MFRGGZDFMZTWQ2LK";
const WW = "BewijsDosering!2026";
const BRANCHE = "bewijs-dosering-branche";
const TEMPO = 30; // 30/min → tussenpoos 2s: snel genoeg voor het bewijs, echt gedoseerd

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript nooit tegen productie draaien.");
}

let falen = 0;
function check(naam: string, conditie: boolean, detail?: unknown): void {
  if (!conditie) { console.error(`\x1b[31m✗ FAALT: ${naam}\x1b[0m`, detail ?? ""); falen++; return; }
  console.log(`✓ ${naam}`);
}
const slaap = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function login(email: string): Promise<Record<string, string>> {
  const r = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord: WW, code: authenticator.generate(TOTP) }),
  });
  if (r.status !== 200) throw new Error(`login faalde: ${r.status} ${await r.text()}`);
  const j = await r.json() as { token: string };
  return { Authorization: `Bearer ${j.token}`, "Content-Type": "application/json" };
}

async function ontvangerStanden(campagneId: number) {
  return db
    .select({
      id: marketingCampagneOntvangersTable.id,
      status: marketingCampagneOntvangersTable.status,
      verzondenOp: marketingCampagneOntvangersTable.verzondenOp,
    })
    .from(marketingCampagneOntvangersTable)
    .where(eq(marketingCampagneOntvangersTable.campagneId, campagneId));
}

async function main(): Promise<void> {
  // ── Opruimen van eerdere runs + seeds ─────────────────────────────────────
  await db.delete(gebruikersTable).where(like(gebruikersTable.email, "bewijs-dosering-%@fps.local"));
  const oudeKlanten = await db.select({ id: crmKlantenTable.id }).from(crmKlantenTable).where(eq(crmKlantenTable.branche, BRANCHE));
  if (oudeKlanten.length) await db.delete(crmKlantenTable).where(inArray(crmKlantenTable.id, oudeKlanten.map((k) => k.id)));
  await db.delete(marketingDoelgroepenTable).where(like(marketingDoelgroepenTable.naam, "Bewijs dosering%"));
  await db.delete(marketingSjablonenTable).where(like(marketingSjablonenTable.naam, "Bewijs dosering%"));
  await db.delete(marketingCampagnesTable).where(like(marketingCampagnesTable.naam, "Bewijs dosering%"));
  await db.delete(mailWachtrijTable).where(like(mailWachtrijTable.naarEmail, "bewijs-dosering-%"));

  const [vorige] = await db.select({ tempo: appInstellingenTable.campagneVerzendtempoPerMinuut }).from(appInstellingenTable).orderBy(appInstellingenTable.id).limit(1);
  const tempoVoorRun = vorige?.tempo ?? 6;

  const hash = await bcrypt.hash(WW, 10);
  const maakGebruiker = (naam: string, email: string, rol: string, bevoegdheden: Record<string, number>) =>
    db.insert(gebruikersTable).values({
      naam, email, rol, wachtwoord: hash, totpSecret: TOTP, tweeFactorIngeschakeld: true, actief: true, bevoegdheden,
    } as typeof gebruikersTable.$inferInsert).returning({ id: gebruikersTable.id });
  const [hb] = await maakGebruiker("Bewijs Dosering HB", "bewijs-dosering-hb@fps.local", "hoofdbeheerder", { marketing: 4, crm: 4 });
  await maakGebruiker("Bewijs Dosering Lezer", "bewijs-dosering-lezer@fps.local", "gebruiker", { marketing: 3 });
  await maakGebruiker("Bewijs Dosering Schrijver", "bewijs-dosering-schrijver@fps.local", "gebruiker", { marketing: 4 });
  await maakGebruiker("Bewijs Dosering Buitenstaander", "bewijs-dosering-buiten@fps.local", "gebruiker", {});

  const [klant] = await db.insert(crmKlantenTable).values({
    naam: "Bewijs Dosering BV", branche: BRANCHE, status: "prospect",
  }).returning({ id: crmKlantenTable.id });
  const nu = new Date();
  for (let i = 1; i <= 6; i++) {
    await db.insert(crmContactpersonenTable).values({
      klantId: klant.id, naam: `Contact ${i}`, email: `bewijs-dosering-${i}@fps.local`,
      mailToestemming: true, mailToestemmingOp: nu, mailToestemmingBron: "bewijsscript",
    });
  }

  let campagneId = 0;
  try {
    const headers = await login("bewijs-dosering-hb@fps.local");
    const post = async (pad: string, body?: unknown) => {
      const r = await fetch(`${BASIS}${pad}`, { method: "POST", headers, body: body ? JSON.stringify(body) : undefined });
      return { status: r.status, json: await r.json().catch(() => ({})) as Record<string, unknown> };
    };
    const patch = async (pad: string, body: unknown) => {
      const r = await fetch(`${BASIS}${pad}`, { method: "PATCH", headers, body: JSON.stringify(body) });
      return { status: r.status, json: await r.json().catch(() => ({})) as Record<string, unknown> };
    };

    // ── 2. Tempo instelbaar, met validatie ────────────────────────────────
    const ongeldig = await patch("/marketing/verzendtempo", { tempo_per_minuut: 0 });
    check("tempo 0 wordt geweigerd (422)", ongeldig.status === 422, ongeldig);
    const tempoZet = await patch("/marketing/verzendtempo", { tempo_per_minuut: TEMPO });
    check(`tempo instelbaar op ${TEMPO}/min`, tempoZet.status === 200 && tempoZet.json["tempo_per_minuut"] === TEMPO, tempoZet);
    const tempoLees = await fetch(`${BASIS}/marketing/verzendtempo`, { headers });
    check("tempo terug te lezen", tempoLees.status === 200 && ((await tempoLees.json()) as { tempo_per_minuut: number }).tempo_per_minuut === TEMPO);

    // ── Rechtenmatrix (niet-beheerders, marketing-module 3/4) ─────────────
    const lezerH = await login("bewijs-dosering-lezer@fps.local");
    const schrijverH = await login("bewijs-dosering-schrijver@fps.local");
    const buitenH = await login("bewijs-dosering-buiten@fps.local");
    const lezerGet = await fetch(`${BASIS}/marketing/verzendtempo`, { headers: lezerH });
    check("marketing 3 mag tempo lezen", lezerGet.status === 200);
    const lezerPatch = await fetch(`${BASIS}/marketing/verzendtempo`, { method: "PATCH", headers: lezerH, body: JSON.stringify({ tempo_per_minuut: 10 }) });
    check("marketing 3 mag tempo NIET wijzigen (403)", lezerPatch.status === 403, lezerPatch.status);
    const schrijverPatch = await fetch(`${BASIS}/marketing/verzendtempo`, { method: "PATCH", headers: schrijverH, body: JSON.stringify({ tempo_per_minuut: TEMPO }) });
    check("marketing 4 mag tempo wijzigen", schrijverPatch.status === 200, schrijverPatch.status);
    const buitenGet = await fetch(`${BASIS}/marketing/verzendtempo`, { headers: buitenH });
    check("zonder marketingrecht geen toegang (403)", buitenGet.status === 403, buitenGet.status);

    // ── Campagne opbouwen en éénmalig goedkeuren ──────────────────────────
    const dg = await post("/marketing/doelgroepen", { naam: "Bewijs dosering doelgroep", criteria: { branche: [BRANCHE] } });
    const sj = await post("/marketing/sjablonen", { naam: "Bewijs dosering sjabloon", onderwerp: "Bewijs dosering {{naam}}", inhoud: "Beste {{naam}}, dit is een doseringsbewijs." });
    const cp = await post("/marketing/campagnes", { naam: "Bewijs dosering campagne", doelgroep_id: dg.json["id"], sjabloon_id: sj.json["id"] });
    campagneId = Number(cp.json["id"]);
    check("campagne aangemaakt", campagneId > 0, cp);
    const proef = await post(`/marketing/campagnes/${campagneId}/proef`);
    check("proefverzending geslaagd", proef.status === 200, proef);
    const start = await post(`/marketing/campagnes/${campagneId}/verzenden`);
    check("éénmalige goedkeuring plaatst 6 ontvangers in de wachtrij", start.status === 200 && start.json["ingepland"] === 6, start.json);

    // ── Doseringsomweg dicht: handmatig versturen van een campagne-item ──
    // Zelfs een hoofdbeheerder mag een campagnemail niet met de hand uit de
    // wachtrij duwen — dat zou het tempo omzeilen (spam-stoot).
    const ontvIds = (await ontvangerStanden(campagneId)).map((s) => s.id);
    const [campagneItem] = await db.select({ id: mailWachtrijTable.id }).from(mailWachtrijTable)
      .where(and(inArray(mailWachtrijTable.campagneOntvangerId, ontvIds), eq(mailWachtrijTable.status, "wachtend"))).limit(1);
    const handmatig = await fetch(`${BASIS}/mail-wachtrij/${campagneItem!.id}/verstuur`, { method: "POST", headers });
    check("handmatig versturen van campagne-item geblokkeerd (422)", handmatig.status === 422, handmatig.status);

    // ── 1+3. Automatisch gespreid versturen; stoppen mídden in de run ─────
    // Geen enkele per-item handeling hierna: alles wat verzonden raakt, deed
    // de gedoseerde verzender. Zodra 2 items verzonden zijn → stoppen.
    let stopMoment: number | null = null;
    let verzondenBijStop = 0;
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const standen = await ontvangerStanden(campagneId);
      const verzonden = standen.filter((s) => s.status === "verzonden").length;
      if (stopMoment === null && verzonden >= 2) {
        const stop = await post(`/marketing/campagnes/${campagneId}/stoppen`, { reden: "bewijs: stop tijdens verzenden" });
        check("stoppen tijdens lopende verzending geaccepteerd", stop.status === 200, stop);
        stopMoment = Date.now();
        verzondenBijStop = verzonden;
      }
      if (stopMoment !== null && Date.now() - stopMoment > 8_000) break;
      await slaap(400);
    }
    check("verzender kwam op gang (≥2 automatisch verzonden vóór stop)", stopMoment !== null, "geen 2 verzendingen binnen 60s");

    const eind = await ontvangerStanden(campagneId);
    const eindVerzonden = eind.filter((s) => s.status === "verzonden");
    // Eén item kan op het stopmoment al atomair geclaimd zijn; meer dan één
    // extra verzending ná de stop is een doseringslek.
    check(
      `na stop niets meer de deur uit (verzonden ${eindVerzonden.length}, bij stop ${verzondenBijStop}, max +1 in-flight)`,
      eindVerzonden.length <= verzondenBijStop + 1,
      eind,
    );
    check("resterende ontvangers overgeslagen", eind.every((s) => s.status === "verzonden" || s.status === "overgeslagen"), eind);
    const wachtend = await db.select({ id: mailWachtrijTable.id }).from(mailWachtrijTable)
      .where(and(inArray(mailWachtrijTable.campagneOntvangerId, eind.map((s) => s.id)), eq(mailWachtrijTable.status, "wachtend")));
    check("geen wachtende wachtrij-items meer voor de campagne", wachtend.length === 0, wachtend);
    const [c] = await db.select({ status: marketingCampagnesTable.status }).from(marketingCampagnesTable).where(eq(marketingCampagnesTable.id, campagneId));
    check("campagne staat op gestopt", c?.status === "gestopt", c);

    // ── 4. Dosering: tussenpozen ≥ ~60/tempo sec ──────────────────────────
    const momenten = eindVerzonden.map((s) => s.verzondenOp!.getTime()).sort((a, b) => a - b);
    const gaten = momenten.slice(1).map((t, i) => t - momenten[i]!);
    const minGat = Math.min(...gaten);
    check(
      `verzendingen gespreid (kleinste tussenpoos ${minGat}ms ≥ 1500ms bij tempo ${TEMPO}/min)`,
      gaten.length >= 1 && minGat >= 1500,
      { momenten, gaten },
    );

    // ── Afronding wanneer álle resterende ontvangers geblokkeerd raken ────
    // Campagne 2: goedkeuren en dan direct alle toestemmingen intrekken (in
    // de DB, zodat de items in de wachtrij blijven en pas op de consent-poort
    // stranden). De campagne moet dan alsnog netjes afgerond raken en mag
    // niet eeuwig op "verzendend" blijven staan.
    const cp2 = await post("/marketing/campagnes", { naam: "Bewijs dosering blokkade", doelgroep_id: dg.json["id"], sjabloon_id: sj.json["id"] });
    const campagne2Id = Number(cp2.json["id"]);
    const proef2 = await post(`/marketing/campagnes/${campagne2Id}/proef`);
    check("proef campagne 2 geslaagd", proef2.status === 200, proef2);
    const start2 = await post(`/marketing/campagnes/${campagne2Id}/verzenden`);
    check("campagne 2 goedgekeurd", start2.status === 200, start2.json);
    await db.update(crmContactpersonenTable).set({ mailToestemming: false }).where(eq(crmContactpersonenTable.klantId, klant.id));
    const deadline2 = Date.now() + 45_000;
    let c2status = "";
    while (Date.now() < deadline2) {
      const [c2] = await db.select({ status: marketingCampagnesTable.status }).from(marketingCampagnesTable).where(eq(marketingCampagnesTable.id, campagne2Id));
      c2status = c2?.status ?? "";
      if (c2status !== "verzendend") break;
      await slaap(500);
    }
    const ontv2 = await ontvangerStanden(campagne2Id);
    check("alle ontvangers van campagne 2 geblokkeerd → overgeslagen (geen mail verzonden)", ontv2.length > 0 && ontv2.every((s) => s.status === "overgeslagen"), ontv2);
    check(`campagne 2 blijft niet op "verzendend" hangen (nu: ${c2status})`, c2status === "verzonden", c2status);

    // ── Afronding wanneer álle ontvangers bij klaarzetten samenvallen ─────
    // Campagne 3: eerst per contact een wachtend wachtrij-item met identiek
    // adres+onderwerp klaarleggen; de dedupe van de wachtrij slokt dan élk
    // campagne-item op → alle ontvangers "overgeslagen" bij klaarzetten en
    // de campagne moet direct afronden i.p.v. op "verzendend" te blijven.
    await db.update(crmContactpersonenTable).set({ mailToestemming: true }).where(eq(crmContactpersonenTable.klantId, klant.id));
    const cp3 = await post("/marketing/campagnes", { naam: "Bewijs dosering dedupe", doelgroep_id: dg.json["id"], sjabloon_id: sj.json["id"] });
    const campagne3Id = Number(cp3.json["id"]);
    const contacten = await db.select({ naam: crmContactpersonenTable.naam, email: crmContactpersonenTable.email })
      .from(crmContactpersonenTable).where(eq(crmContactpersonenTable.klantId, klant.id));
    for (const ct of contacten) {
      await db.insert(mailWachtrijTable).values({
        naarEmail: ct.email!, naarNaam: ct.naam, onderwerp: `Bewijs dosering ${ct.naam}`,
        html: "<p>dedupe-blokkade</p>", soort: "campagne", status: "wachtend",
      } as typeof mailWachtrijTable.$inferInsert);
    }
    const proef3 = await post(`/marketing/campagnes/${campagne3Id}/proef`);
    check("proef campagne 3 geslaagd", proef3.status === 200, proef3);
    const start3 = await post(`/marketing/campagnes/${campagne3Id}/verzenden`);
    check("campagne 3: alle ontvangers samengevallen (0 ingepland)", start3.status === 200 && start3.json["ingepland"] === 0 && Number(start3.json["overgeslagen"]) > 0, start3.json);
    const [c3] = await db.select({ status: marketingCampagnesTable.status }).from(marketingCampagnesTable).where(eq(marketingCampagnesTable.id, campagne3Id));
    check(`campagne 3 rondt direct af bij volledige dedupe (nu: ${c3?.status})`, c3?.status === "verzonden", c3);

    // ── Afronding wanneer álle ontvangers zich vóór verzending afmelden ───
    // Campagne 4: goedkeuren en dan per contactpersoon de toestemming via de
    // API intrekken (het echte annuleringspad). Wachtrij-items vervallen, de
    // ontvangers worden terminal (afgemeld) en de campagne moet direct
    // afronden — zonder dat er iets verzonden is.
    await db.update(crmContactpersonenTable).set({ mailToestemming: true }).where(eq(crmContactpersonenTable.klantId, klant.id));
    // De synthetische dedupe-blokkades van campagne 3 opruimen, anders vallen
    // ook campagne 4-items daarmee samen.
    await db.delete(mailWachtrijTable).where(and(like(mailWachtrijTable.naarEmail, "bewijs-dosering-%"), eq(mailWachtrijTable.status, "wachtend")));
    const cp4 = await post("/marketing/campagnes", { naam: "Bewijs dosering intrekking", doelgroep_id: dg.json["id"], sjabloon_id: sj.json["id"] });
    const campagne4Id = Number(cp4.json["id"]);
    const proef4 = await post(`/marketing/campagnes/${campagne4Id}/proef`);
    check("proef campagne 4 geslaagd", proef4.status === 200, proef4);
    // Verzender even pauzeren via een lage kans op claims: direct na goedkeuren
    // meteen intrekken — de eerste tussenpoos (2s bij tempo 30) geeft ruimte.
    const start4 = await post(`/marketing/campagnes/${campagne4Id}/verzenden`);
    check("campagne 4 goedgekeurd", start4.status === 200 && Number(start4.json["ingepland"]) > 0, start4.json);
    const contactIds = await db.select({ id: crmContactpersonenTable.id }).from(crmContactpersonenTable).where(eq(crmContactpersonenTable.klantId, klant.id));
    for (const ct of contactIds) {
      const r = await fetch(`${BASIS}/marketing/contactpersonen/${ct.id}/toestemming`, {
        method: "PATCH", headers, body: JSON.stringify({ toestemming: false }),
      });
      if (r.status !== 200) check("toestemming intrekken via API geslaagd", false, { id: ct.id, status: r.status });
    }
    const deadline4 = Date.now() + 30_000;
    let c4status = "";
    while (Date.now() < deadline4) {
      const [c4] = await db.select({ status: marketingCampagnesTable.status }).from(marketingCampagnesTable).where(eq(marketingCampagnesTable.id, campagne4Id));
      c4status = c4?.status ?? "";
      if (c4status !== "verzendend") break;
      await slaap(500);
    }
    const ontv4 = await ontvangerStanden(campagne4Id);
    // De verzender kan vóór de intrekking al enkele items hebben verstuurd;
    // de rest moet terminal (afgemeld) zijn en de campagne afgerond.
    check("campagne 4: geen ontvanger blijft op gepland na intrekking", ontv4.length > 0 && ontv4.every((s) => s.status !== "gepland"), ontv4);
    check(`campagne 4 rondt af na volledige intrekking (nu: ${c4status})`, c4status === "verzonden", c4status);

    // ── Afronding bij een echte verzendfout (MailFout) ────────────────────
    // Campagne 5: één ontvanger met een syntactisch ongeldig adres op een
    // niet-testdomein — Microsoft Graph weigert de verzending (4xx), waardoor
    // verstuurMailWachtrijItem een MailFout gooit zonder dat er echt iets de
    // deur uit kan. Het wachtrij-item wordt "mislukt", de ontvanger moet
    // terminal (overgeslagen) worden en de campagne moet alsnog afronden.
    await db.update(crmContactpersonenTable).set({ mailToestemming: false }).where(eq(crmContactpersonenTable.klantId, klant.id));
    await db.insert(crmContactpersonenTable).values({
      klantId: klant.id, naam: "Contact Fout", email: "bewijs-dosering-fout@ongeldig..dubbelepunt.nl",
      mailToestemming: true, mailToestemmingOp: new Date(), mailToestemmingBron: "bewijsscript",
    });
    const cp5 = await post("/marketing/campagnes", { naam: "Bewijs dosering mailfout", doelgroep_id: dg.json["id"], sjabloon_id: sj.json["id"] });
    const campagne5Id = Number(cp5.json["id"]);
    const proef5 = await post(`/marketing/campagnes/${campagne5Id}/proef`);
    check("proef campagne 5 geslaagd", proef5.status === 200, proef5);
    const start5 = await post(`/marketing/campagnes/${campagne5Id}/verzenden`);
    check("campagne 5 goedgekeurd (1 ingepland)", start5.status === 200 && start5.json["ingepland"] === 1, start5.json);
    const deadline5 = Date.now() + 45_000;
    let c5status = "";
    while (Date.now() < deadline5) {
      const [c5] = await db.select({ status: marketingCampagnesTable.status }).from(marketingCampagnesTable).where(eq(marketingCampagnesTable.id, campagne5Id));
      c5status = c5?.status ?? "";
      if (c5status !== "verzendend") break;
      await slaap(500);
    }
    const ontv5 = await ontvangerStanden(campagne5Id);
    const [item5] = await db.select({ status: mailWachtrijTable.status }).from(mailWachtrijTable)
      .where(inArray(mailWachtrijTable.campagneOntvangerId, ontv5.map((o) => o.id))).limit(1);
    check("campagne 5: wachtrij-item mislukt na MailFout", item5?.status === "mislukt", item5);
    check("campagne 5: ontvanger terminal (overgeslagen) na MailFout", ontv5.length === 1 && ontv5[0]!.status === "overgeslagen", ontv5);
    check(`campagne 5 rondt af na mailfout (nu: ${c5status})`, c5status === "verzonden", c5status);

    // ── Tussenstatus "voorbereiden" schermt de verzender af ───────────────
    // Simuleert de wachtrij-opbouwrace: een campagne met één gepland item die
    // (net als tijdens POST /verzenden) nog op "voorbereiden" staat, mag door
    // de gedoseerde verzender NIET worden opgepakt en mag niet afronden.
    // Zodra ze "verzendend" wordt (de atomaire activering aan het eind van de
    // opbouw), gaat het item alsnog de deur uit.
    await db.update(crmContactpersonenTable).set({ mailToestemming: false }).where(eq(crmContactpersonenTable.klantId, klant.id));
    await db.update(crmContactpersonenTable).set({ mailToestemming: true })
      .where(and(eq(crmContactpersonenTable.klantId, klant.id), eq(crmContactpersonenTable.naam, "Contact 1")));
    await db.delete(mailWachtrijTable).where(and(like(mailWachtrijTable.naarEmail, "bewijs-dosering-%"), eq(mailWachtrijTable.status, "wachtend")));
    const cp6 = await post("/marketing/campagnes", { naam: "Bewijs dosering voorbereiden", doelgroep_id: dg.json["id"], sjabloon_id: sj.json["id"] });
    const campagne6Id = Number(cp6.json["id"]);
    const proef6 = await post(`/marketing/campagnes/${campagne6Id}/proef`);
    check("proef campagne 6 geslaagd", proef6.status === 200, proef6);
    const start6 = await post(`/marketing/campagnes/${campagne6Id}/verzenden`);
    check("campagne 6 goedgekeurd (1 ingepland)", start6.status === 200 && start6.json["ingepland"] === 1, start6.json);
    // Terug naar "voorbereiden" alsof de opbouw nog loopt.
    await db.update(marketingCampagnesTable).set({ status: "voorbereiden" }).where(eq(marketingCampagnesTable.id, campagne6Id));
    await slaap(9_000); // ruim langer dan de idle-wacht (5s) én de tussenpoos (2s bij tempo 30)
    const [c6tijdens] = await db.select({ status: marketingCampagnesTable.status }).from(marketingCampagnesTable).where(eq(marketingCampagnesTable.id, campagne6Id));
    const ontv6tijdens = await ontvangerStanden(campagne6Id);
    check("verzender pakt niets op tijdens voorbereiden (ontvanger blijft gepland)", ontv6tijdens.every((s) => s.status === "gepland"), ontv6tijdens);
    check(`campagne blijft op voorbereiden, wordt niet vroegtijdig afgerond (nu: ${c6tijdens?.status})`, c6tijdens?.status === "voorbereiden", c6tijdens);
    // Activering (zoals aan het eind van de opbouw) → item gaat alsnog uit.
    await db.update(marketingCampagnesTable).set({ status: "verzendend" }).where(eq(marketingCampagnesTable.id, campagne6Id));
    const deadline6 = Date.now() + 30_000;
    let c6status = "";
    while (Date.now() < deadline6) {
      const [c6] = await db.select({ status: marketingCampagnesTable.status }).from(marketingCampagnesTable).where(eq(marketingCampagnesTable.id, campagne6Id));
      c6status = c6?.status ?? "";
      if (c6status === "verzonden") break;
      await slaap(500);
    }
    const ontv6 = await ontvangerStanden(campagne6Id);
    check("na activering wordt het item alsnog verzonden en rondt de campagne af", c6status === "verzonden" && ontv6.every((s) => s.status === "verzonden"), { c6status, ontv6 });

    // ── Stoppen tijdens de wachtrij-opbouw laat niets hangen ──────────────
    // Campagne 7: grote doelgroep zodat de opbouw meetbaar duurt; /stoppen
    // wordt gelijktijdig afgevuurd. Ongeacht wie wint: er mag géén wachtend
    // wachtrij-item en géén geplande ontvanger achterblijven.
    await db.update(crmContactpersonenTable).set({ mailToestemming: true, mailToestemmingOp: new Date(), mailToestemmingBron: "bewijsscript" })
      .where(eq(crmContactpersonenTable.klantId, klant.id));
    for (let i = 0; i < 250; i++) {
      await db.insert(crmContactpersonenTable).values({
        klantId: klant.id, naam: `Bulk ${i}`, email: `bewijs-dosering-bulk-${i}@fps.local`,
        mailToestemming: true, mailToestemmingOp: new Date(), mailToestemmingBron: "bewijsscript",
      });
    }
    const cp7 = await post("/marketing/campagnes", { naam: "Bewijs dosering stop-tijdens-opbouw", doelgroep_id: dg.json["id"], sjabloon_id: sj.json["id"] });
    const campagne7Id = Number(cp7.json["id"]);
    const proef7 = await post(`/marketing/campagnes/${campagne7Id}/proef`);
    check("proef campagne 7 geslaagd", proef7.status === 200, proef7);
    const verzendBelofte = post(`/marketing/campagnes/${campagne7Id}/verzenden`);
    await slaap(150); // opbouw is dan bezig
    let stop7 = { status: 0, json: {} as Record<string, unknown> };
    for (let i = 0; i < 40 && stop7.status !== 200; i++) {
      stop7 = await post(`/marketing/campagnes/${campagne7Id}/stoppen`, { reden: "bewijs stop tijdens opbouw" });
      if (stop7.status !== 200) await slaap(100);
    }
    const verzend7 = await verzendBelofte;
    check("stoppen tijdens opbouw geaccepteerd", stop7.status === 200, stop7);
    check("verzend-endpoint eindigt netjes ondanks stop", verzend7.status === 200, verzend7);
    await slaap(1_000); // eventuele opruiming na mislukte activering laten landen
    const ontv7 = await ontvangerStanden(campagne7Id);
    const wachtend7 = await db.select({ id: mailWachtrijTable.id }).from(mailWachtrijTable)
      .where(and(inArray(mailWachtrijTable.campagneOntvangerId, ontv7.length > 0 ? ontv7.map((o) => o.id) : [-1]), eq(mailWachtrijTable.status, "wachtend")));
    const [c7] = await db.select({ status: marketingCampagnesTable.status }).from(marketingCampagnesTable).where(eq(marketingCampagnesTable.id, campagne7Id));
    check("geen wachtend wachtrij-item blijft achter na stop tijdens opbouw", wachtend7.length === 0, wachtend7.length);
    check("geen geplande ontvanger blijft achter na stop tijdens opbouw", ontv7.every((o) => o.status !== "gepland"), ontv7.filter((o) => o.status === "gepland").length);
    check(`campagne 7 staat op gestopt (nu: ${c7?.status})`, c7?.status === "gestopt", c7);

    // ── Handmatig afwijzen van het laatste campagne-item rondt de campagne af ──
    // Campagne 8: één ontvanger; het enige wachtrij-item wordt via de
    // beheerdersroute POST /mail-wachtrij/:id/afwijzen afgewezen. De ontvanger
    // moet terminal (overgeslagen) worden en de campagne "verzonden".
    await db.update(crmContactpersonenTable).set({ mailToestemming: false }).where(eq(crmContactpersonenTable.klantId, klant.id));
    await db.update(crmContactpersonenTable).set({ mailToestemming: true })
      .where(and(eq(crmContactpersonenTable.klantId, klant.id), eq(crmContactpersonenTable.naam, "Contact 2")));
    await db.delete(mailWachtrijTable).where(and(like(mailWachtrijTable.naarEmail, "bewijs-dosering-%"), eq(mailWachtrijTable.status, "wachtend")));
    const cp8 = await post("/marketing/campagnes", { naam: "Bewijs dosering afwijzen", doelgroep_id: dg.json["id"], sjabloon_id: sj.json["id"] });
    const campagne8Id = Number(cp8.json["id"]);
    const proef8 = await post(`/marketing/campagnes/${campagne8Id}/proef`);
    check("proef campagne 8 geslaagd", proef8.status === 200, proef8);
    // Verzendtempo omlaag zodat het item ruim wachtend blijft tot de afwijzing.
    await patch("/marketing/verzendtempo", { tempo_per_minuut: 1 });
    const start8 = await post(`/marketing/campagnes/${campagne8Id}/verzenden`);
    check("campagne 8 goedgekeurd (1 ingepland)", start8.status === 200 && start8.json["ingepland"] === 1, start8.json);
    const ontv8voor = await ontvangerStanden(campagne8Id);
    const [item8] = await db.select({ id: mailWachtrijTable.id, status: mailWachtrijTable.status }).from(mailWachtrijTable)
      .where(inArray(mailWachtrijTable.campagneOntvangerId, ontv8voor.map((o) => o.id)));
    check("campagne 8: item staat wachtend vóór afwijzing", item8?.status === "wachtend", item8);
    const afwijs8 = await post(`/mail-wachtrij/${item8!.id}/afwijzen`);
    check("laatste campagne-item handmatig afgewezen (200)", afwijs8.status === 200, afwijs8);
    const ontv8 = await ontvangerStanden(campagne8Id);
    const [c8] = await db.select({ status: marketingCampagnesTable.status }).from(marketingCampagnesTable).where(eq(marketingCampagnesTable.id, campagne8Id));
    check("campagne 8: ontvanger terminal (overgeslagen) na afwijzing", ontv8.length === 1 && ontv8[0]!.status === "overgeslagen", ontv8);
    check(`campagne 8 rondt af na afwijzen laatste item (nu: ${c8?.status})`, c8?.status === "verzonden", c8);
    await patch("/marketing/verzendtempo", { tempo_per_minuut: TEMPO });

    // ── Herstel na crash laat een campagne niet permanent hangen ─────────
    // Campagne 9: het enige item wordt kunstmatig "verzenden" met een oude
    // timestamp (alsof de server midden in de verzending herstartte). De
    // herstelroutine moet het item op mislukt zetten, de ontvanger terminal
    // maken en de campagne afronden.
    await db.delete(mailWachtrijTable).where(and(like(mailWachtrijTable.naarEmail, "bewijs-dosering-%"), eq(mailWachtrijTable.status, "wachtend")));
    const cp9 = await post("/marketing/campagnes", { naam: "Bewijs dosering crash-herstel", doelgroep_id: dg.json["id"], sjabloon_id: sj.json["id"] });
    const campagne9Id = Number(cp9.json["id"]);
    const proef9 = await post(`/marketing/campagnes/${campagne9Id}/proef`);
    check("proef campagne 9 geslaagd", proef9.status === 200, proef9);
    await patch("/marketing/verzendtempo", { tempo_per_minuut: 1 });
    const start9 = await post(`/marketing/campagnes/${campagne9Id}/verzenden`);
    check("campagne 9 goedgekeurd (1 ingepland)", start9.status === 200 && start9.json["ingepland"] === 1, start9.json);
    const ontv9voor = await ontvangerStanden(campagne9Id);
    const oud = new Date(Date.now() - 30 * 60 * 1000);
    await db.update(mailWachtrijTable)
      .set({ status: "verzenden", verwerktOp: oud })
      .where(inArray(mailWachtrijTable.campagneOntvangerId, ontv9voor.map((o) => o.id)));
    const herstel9 = await post("/mail-wachtrij/herstel-vastgelopen");
    check("herstelroutine draait (200) en herstelt het item", herstel9.status === 200 && Number(herstel9.json["aantalHersteld"]) >= 1, herstel9);
    const ontv9 = await ontvangerStanden(campagne9Id);
    const [c9] = await db.select({ status: marketingCampagnesTable.status }).from(marketingCampagnesTable).where(eq(marketingCampagnesTable.id, campagne9Id));
    check("campagne 9: ontvanger terminal na crash-herstel", ontv9.length === 1 && ontv9[0]!.status === "overgeslagen", ontv9);
    check(`campagne 9 rondt af na crash-herstel (nu: ${c9?.status})`, c9?.status === "verzonden", c9);
    await patch("/marketing/verzendtempo", { tempo_per_minuut: TEMPO });
  } finally {
    // ── Opruimen + tempo terugzetten ──────────────────────────────────────
    if (campagneId) {
      const ontv = await db.select({ id: marketingCampagneOntvangersTable.id }).from(marketingCampagneOntvangersTable).where(eq(marketingCampagneOntvangersTable.campagneId, campagneId));
      if (ontv.length) await db.delete(mailWachtrijTable).where(inArray(mailWachtrijTable.campagneOntvangerId, ontv.map((o) => o.id)));
      await db.delete(marketingCampagnesTable).where(eq(marketingCampagnesTable.id, campagneId));
    }
    await db.delete(crmCommunicatieTable).where(eq(crmCommunicatieTable.klantId, (await db.select({ id: crmKlantenTable.id }).from(crmKlantenTable).where(eq(crmKlantenTable.branche, BRANCHE)))[0]?.id ?? -1));
    const klanten = await db.select({ id: crmKlantenTable.id }).from(crmKlantenTable).where(eq(crmKlantenTable.branche, BRANCHE));
    if (klanten.length) await db.delete(crmKlantenTable).where(inArray(crmKlantenTable.id, klanten.map((k) => k.id)));
    await db.delete(marketingDoelgroepenTable).where(like(marketingDoelgroepenTable.naam, "Bewijs dosering%"));
    await db.delete(marketingSjablonenTable).where(like(marketingSjablonenTable.naam, "Bewijs dosering%"));
    await db.delete(mailWachtrijTable).where(like(mailWachtrijTable.naarEmail, "bewijs-dosering-%"));
    await db.delete(gebruikersTable).where(eq(gebruikersTable.email, "bewijs-dosering-hb@fps.local"));
    await db.update(appInstellingenTable).set({ campagneVerzendtempoPerMinuut: tempoVoorRun });
  }

  if (falen > 0) { console.error(`\n${falen} controle(s) gefaald.`); process.exit(1); }
  console.log("\nAlle controles geslaagd — gedoseerde verzender bewezen.");
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
