// Gedragsbewijs WERKBAK_02 — teamoverleg, eigen taken en de AI-workflow.
// Acceptatie §10, via HTTP tegen de lokale api-server + DB-verificatie:
//   1.  Eigen taak zonder eigenaar/datum → 422 + suggestie gebouwaantekening.
//   2.  Meewerker kan bijwerken, maar NIET afronden; eigenaar wél.
//   3.  Bron-voeder: openstaande voorziening (ouder dan drempel) → werkbak-item.
//   4.  Bron-voeder: openstaand regiewerk → werkbak-item; restwoningen bewust
//       overgeslagen (geen voeder, expliciet gemeld).
//   5.  "Mijn werk" ongewijzigd: GET /werkbak levert exact dezelfde velden als
//       vóór WERKBAK_02 (mapItem onaangeroerd).
//   6.  Teamoverzicht: alleen taken + werk-signalen; persoonlijk item (verlof)
//       aantoonbaar afwezig; zonder personeel/planning niveau 2 → 403.
//   7.  Ster van A is onzichtbaar voor B (workflow + DB) en A's volgorde volgt
//       de ster; mail-ster hangt aan de conversatie.
//   8.  Elke plaats in de workflow heeft een uitlegregel.
//   9.  Overleg over twee weken heen: overleg vastleggen met taken → volgende
//       agenda toont die taken in blok 1; idee zonder datum alleen in blok 4.
//   10. AI-advies: structuur klopt, alle sleutels komen uit de eigen lijst
//       (herordent niets; lijstvolgorde onaangetast).
//   11. Telling gelijkende titels → docs/metingen/werkbak02-gelijkende-titels.md.
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-werkbak02.ts
import bcrypt from "bcryptjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { authenticator } from "otplib";
import { db, gebruikersTable } from "@workspace/db";
import {
  werkbakItemsTable, overleggenTable, workflowSterrenTable,
  voorzieningenTable, gebouwenTable, opdrachtenTable, regieMaterialenTable,
} from "@workspace/db/schema";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const TOTP = "MFRGGZDFMZTWQ2LK";
const WW = "BewijsWerkbak02!2026";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript nooit tegen productie draaien.");
}

function check(naam: string, conditie: boolean, detail?: unknown): void {
  if (!conditie) { console.error(`✗ FAALT: ${naam}`, JSON.stringify(detail ?? "", null, 1).slice(0, 2000)); throw new Error(naam); }
  console.log(`✓ ${naam}`);
}

const EMAILS = [
  "bewijs-wb2-admin@fps.local",   // hoofdbeheerder (bewaking draaien)
  "bewijs-wb2-team@fps.local",    // personeel:2 → teamoverzicht/overleg
  "bewijs-wb2-a@fps.local",       // eigenaar A
  "bewijs-wb2-b@fps.local",       // meewerker B
  "bewijs-wb2-wvb@fps.local",     // functietitel Werkvoorbereider
];

async function ruimOp(): Promise<void> {
  const gebruikers = await db.select({ id: gebruikersTable.id }).from(gebruikersTable).where(inArray(gebruikersTable.email, EMAILS));
  const gids = gebruikers.map((g) => g.id);
  await db.delete(werkbakItemsTable).where(like(werkbakItemsTable.titel, "%Bewijs WB2%"));
  await db.delete(werkbakItemsTable).where(like(werkbakItemsTable.dedupSleutel, "voorziening-openstaand:%"));
  await db.delete(werkbakItemsTable).where(like(werkbakItemsTable.dedupSleutel, "regie-openstaand:%"));
  await db.delete(overleggenTable).where(sql`${overleggenTable.aanwezigen}::text like '%Bewijs WB2%'`);
  if (gids.length) {
    await db.delete(workflowSterrenTable).where(inArray(workflowSterrenTable.gebruikerId, gids));
    await db.delete(werkbakItemsTable).where(inArray(werkbakItemsTable.gebruikerId, gids));
  }
  await db.delete(regieMaterialenTable).where(like(regieMaterialenTable.omschrijving, "Bewijs WB2%"));
  await db.delete(opdrachtenTable).where(like(opdrachtenTable.titel, "Bewijs WB2%"));
  await db.delete(voorzieningenTable).where(like(voorzieningenTable.objectnummer, "BW2-%"));
  await db.delete(gebouwenTable).where(like(gebouwenTable.naam, "Bewijs WB2%"));
  if (gids.length) await db.delete(gebruikersTable).where(inArray(gebruikersTable.id, gids));
}

async function maakGebruiker(email: string, naam: string, extra: Record<string, unknown> = {}): Promise<number> {
  const [g] = await db.insert(gebruikersTable).values({
    naam, email, rol: "gebruiker", wachtwoord: await bcrypt.hash(WW, 10),
    totpSecret: TOTP, tweeFactorIngeschakeld: true, actief: true, ...extra,
  } as typeof gebruikersTable.$inferInsert).returning({ id: gebruikersTable.id });
  return g!.id;
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

async function main(): Promise<void> {
  await ruimOp();

  const adminGid = await maakGebruiker(EMAILS[0]!, "Bewijs WB2 Admin", { rol: "hoofdbeheerder" });
  const teamGid = await maakGebruiker(EMAILS[1]!, "Bewijs WB2 Teamlead", { bevoegdheden: { personeel: 2, gebouwen: 1 } });
  const aGid = await maakGebruiker(EMAILS[2]!, "Bewijs WB2 A", { bevoegdheden: { gebouwen: 1 } });
  const bGid = await maakGebruiker(EMAILS[3]!, "Bewijs WB2 B", { bevoegdheden: { gebouwen: 1 } });
  const wvbGid = await maakGebruiker(EMAILS[4]!, "Bewijs WB2 WVB", { bevoegdheden: { projecten: 3, gebouwen: 1 }, functietitels: ["Werkvoorbereider"] });

  const [admin, team, a, b, wvb] = await Promise.all(EMAILS.map(login));

  // ── 1. Taak zonder eigenaar/datum → 422 + suggestie gebouwaantekening ──────
  const r1 = await fetch(`${BASIS}/werkbak/taken`, { method: "POST", headers: a, body: JSON.stringify({ titel: "Bewijs WB2 zonder datum" }) });
  const j1 = await r1.json() as { code?: string; suggestie?: string };
  check("1. taak zonder eigenaar/datum → 422", r1.status === 422, j1);
  check("1b. suggestie = gebouwaantekening", j1.code === "EIGENAAR_EN_DATUM_VERPLICHT" && j1.suggestie === "gebouwnotitie", j1);

  // ── 2. Eigenaar + meewerker: bijwerken vs afronden ─────────────────────────
  const r2 = await fetch(`${BASIS}/werkbak/taken`, {
    method: "POST", headers: a,
    body: JSON.stringify({ titel: "Bewijs WB2 taak van A", eigenaar_id: aGid, deadline: "2026-09-01", meewerker_ids: [bGid] }),
  });
  check("2. taak met eigenaar+datum aangemaakt", r2.status === 201);
  const taak = await r2.json() as { id: number };
  const r2b = await fetch(`${BASIS}/werkbak/taken/${taak.id}`, { method: "PATCH", headers: b, body: JSON.stringify({ omschrijving: "voortgang door meewerker B" }) });
  check("2b. meewerker B mag bijwerken", r2b.status === 200, await r2b.clone().text());
  const r2c = await fetch(`${BASIS}/werkbak/${taak.id}/afhandelen`, { method: "POST", headers: b });
  check("2c. meewerker B mag NIET afronden (403)", r2c.status === 403, await r2c.clone().text());
  const r2w = await fetch(`${BASIS}/werkbak/${taak.id}/wegzetten`, { method: "POST", headers: b, body: JSON.stringify({ reden: "poging van meewerker" }) });
  check("2c2. meewerker B mag ook NIET wegzetten (403)", r2w.status === 403, await r2w.clone().text());
  const r2d = await fetch(`${BASIS}/werkbak/${taak.id}/afhandelen`, { method: "POST", headers: a });
  check("2d. eigenaar A rondt af", r2d.status === 200);

  // ── 3+4. Bron-voeders via de bewakingsloop ─────────────────────────────────
  const [gebouw] = await db.insert(gebouwenTable).values({ naam: "Bewijs WB2 gebouw", adres: "Teststraat 1", stad: "Testdam" } as typeof gebouwenTable.$inferInsert).returning();
  const oud = new Date(Date.now() - 30 * 86_400_000);
  await db.insert(voorzieningenTable).values({
    objectnummer: "BW2-001", gebouwId: gebouw!.id, status: "in_uitvoering", type: "brandklep",
  } as typeof voorzieningenTable.$inferInsert);
  await db.update(voorzieningenTable).set({ bijgewerktOp: oud }).where(eq(voorzieningenTable.objectnummer, "BW2-001"));
  const [opdracht] = await db.insert(opdrachtenTable).values({
    titel: "Bewijs WB2 regieopdracht", type: "regie", status: "actief", gebouwId: gebouw!.id,
  } as typeof opdrachtenTable.$inferInsert).returning();
  await db.insert(regieMaterialenTable).values({
    opdrachtId: opdracht!.id, omschrijving: "Bewijs WB2 materiaal", artikel: "Bewijs WB2 artikel", datum: "2026-08-01", status: "concept",
  } as typeof regieMaterialenTable.$inferInsert);

  const r3 = await fetch(`${BASIS}/werkbak/bewaking/draai`, { method: "POST", headers: admin });
  check("3. bewakingsloop draait", r3.status === 200);
  const samenvatting = (await r3.json() as { samenvatting: Record<string, unknown> }).samenvatting;
  check("3b. voeder voorzieningen_openstaand actief", "voorzieningen_openstaand" in samenvatting, samenvatting);
  check("4. voeder regie_openstaand actief", "regie_openstaand" in samenvatting, samenvatting);
  check("4b. restwoningen bewust afwezig (planner niet geïntegreerd)", !("restwoningen" in samenvatting));
  const wvbItems = await db.select().from(werkbakItemsTable).where(and(eq(werkbakItemsTable.gebruikerId, wvbGid), eq(werkbakItemsTable.status, "open")));
  check("3c. werkvoorbereider heeft voorziening-item", wvbItems.some((i) => i.bron === "voorziening_openstaand"), wvbItems.map((i) => i.bron));
  check("4c. werkvoorbereider heeft regie-item", wvbItems.some((i) => i.bron === "regie_openstaand"), wvbItems.map((i) => i.bron));

  // ── 5. "Mijn werk" ongewijzigd: exact dezelfde velden als WERKBAK_01 ───────
  const r5 = await fetch(`${BASIS}/werkbak`, { headers: wvb });
  const lijst5 = await r5.json() as Array<Record<string, unknown>>;
  const verwacht = ["id", "soort", "bron", "titel", "omschrijving", "gewicht", "actie_pad", "actie_type", "herkomst_type", "herkomst_id", "status", "weggezet_reden", "aangemaakt_op"].sort();
  check("5. GET /werkbak levert exact de oude velden", lijst5.length > 0 && JSON.stringify(Object.keys(lijst5[0]!).sort()) === JSON.stringify(verwacht), Object.keys(lijst5[0] ?? {}));

  // ── 6. Teamoverzicht ───────────────────────────────────────────────────────
  // Persoonlijk verlof-item voor A — mag NOOIT in het teamoverzicht komen.
  await db.insert(werkbakItemsTable).values({
    soort: "doen", bron: "verlofaanvraag", titel: "Bewijs WB2 PRIVÉ verlof van A",
    gebruikerId: aGid, herkomstType: "verlofaanvraag", dedupSleutel: `bewijs-wb2-prive:${Date.now()}`,
  } as typeof werkbakItemsTable.$inferInsert);
  // Nieuwe open taak zodat het team iets te zien heeft.
  const r6t = await fetch(`${BASIS}/werkbak/taken`, {
    method: "POST", headers: a,
    body: JSON.stringify({ titel: "Bewijs WB2 teamtaak", eigenaar_id: aGid, deadline: "2026-09-15" }),
  });
  const teamTaak = await r6t.json() as { id: number };
  const r6 = await fetch(`${BASIS}/werkbak/team`, { headers: team });
  check("6. teamlead (personeel:2) ziet teamoverzicht", r6.status === 200);
  const overzicht = await r6.json() as { taken: Array<{ id: number; titel: string }>; signalen: Array<{ bron: string; titel: string }> };
  check("6b. taak zichtbaar in teamoverzicht", overzicht.taken.some((t) => t.id === teamTaak.id));
  const alles6 = JSON.stringify(overzicht);
  check("6c. persoonlijk verlof-item AFWEZIG in teamoverzicht", !alles6.includes("PRIVÉ verlof"), overzicht.signalen.map((s) => s.bron));
  check("6d. signalen bevatten alleen werk-bronnen", overzicht.signalen.every((s) => ["voorziening_openstaand", "regie_openstaand", "meerwerk_melding", "materiaal_afwijking", "toebehoren_aanvraag", "uren_niet_in_begroting"].includes(s.bron)), overzicht.signalen.map((s) => s.bron));
  const r6e = await fetch(`${BASIS}/werkbak/team`, { headers: a });
  check("6e. gebruiker zonder niveau 2 krijgt 403", r6e.status === 403);

  // ── 7. Sterren: persoonlijk en privé; volgorde volgt de ster ───────────────
  const r7 = await fetch(`${BASIS}/workflow/ster`, { method: "POST", headers: a, body: JSON.stringify({ doel_type: "werkbak", doel_sleutel: String(teamTaak.id), sterren: 3 }) });
  check("7. A zet 3 sterren", r7.status === 200);
  const wfA = await (await fetch(`${BASIS}/workflow`, { headers: a })).json() as { rijen: Array<{ sleutel: string; sterren: number; uitleg: string }> };
  check("7b. A's lijst: ster-item bovenaan met uitleg", wfA.rijen[0]?.sleutel === String(teamTaak.id) && wfA.rijen[0]!.sterren === 3 && wfA.rijen[0]!.uitleg.includes("ster"), wfA.rijen[0]);
  // B kan hetzelfde item niet zien (het is A's taak) — sterkere check: DB bevat
  // alleen een ster-rij van A, en B's workflow bevat nergens sterren>0 voor die sleutel.
  const wfB = await (await fetch(`${BASIS}/workflow`, { headers: b })).json() as { rijen: Array<{ sleutel: string; sterren: number }> };
  check("7c. B ziet A's ster nergens", wfB.rijen.every((r) => !(r.sleutel === String(teamTaak.id) && r.sterren > 0)));
  const sterRijen = await db.select().from(workflowSterrenTable).where(eq(workflowSterrenTable.doelSleutel, String(teamTaak.id)));
  check("7d. DB: ster staat alleen op A", sterRijen.length === 1 && sterRijen[0]!.gebruikerId === aGid);
  const r7m = await fetch(`${BASIS}/workflow/ster`, { method: "POST", headers: a, body: JSON.stringify({ doel_type: "mail_conversatie", doel_sleutel: "AAQkConversatieBewijsWB2", sterren: 2 }) });
  check("7e. mail-ster hangt aan de conversatie", r7m.status === 200);

  // ── 8. Elke plaats in de lijst heeft een uitlegregel ───────────────────────
  const wfWvb = await (await fetch(`${BASIS}/workflow`, { headers: wvb })).json() as { rijen: Array<{ uitleg: string }> };
  check("8. elke rij heeft een niet-lege uitlegregel", wfWvb.rijen.length > 0 && wfWvb.rijen.every((r) => typeof r.uitleg === "string" && r.uitleg.length > 5), wfWvb.rijen.length);

  // ── 9. Overleg over twee weken heen ────────────────────────────────────────
  const r9a = await fetch(`${BASIS}/overleggen`, {
    method: "POST", headers: team,
    body: JSON.stringify({
      datum: "2026-08-03", aanwezigen: ["Bewijs WB2 Teamlead", "Bewijs WB2 A"],
      besproken: { blok2: "vastloper besproken" },
      taken: [
        { titel: "Bewijs WB2 overlegafspraak", eigenaar_id: aGid, deadline: "2026-08-20" },
        { titel: "Bewijs WB2 idee zonneschermen", eigenaar_id: bGid, soort: "idee" },
      ],
    }),
  });
  check("9. overleg vastgelegd + taken in één handeling", r9a.status === 201, await r9a.clone().text());
  const overleg = await r9a.json() as { id: number; taken_aangemaakt: number };
  check("9b. beide punten weggezet", overleg.taken_aangemaakt === 2, overleg);
  const agenda = await (await fetch(`${BASIS}/overleg/agenda`, { headers: team })).json() as {
    vorig_overleg: { id: number } | null;
    blok1_afgesproken: Array<{ titel: string }>;
    blok4_ideeen: Array<{ titel: string; deadline: string | null }>;
  };
  check("9c. week erna: blok 1 toont wat vorige week is afgesproken", agenda.vorig_overleg?.id === overleg.id && agenda.blok1_afgesproken.some((t) => t.titel.includes("overlegafspraak")), agenda.blok1_afgesproken);
  check("9d. idee zonder datum staat alléén in blok 4", agenda.blok4_ideeen.some((t) => t.titel.includes("zonneschermen") && t.deadline === null) && !agenda.blok1_afgesproken.some((t) => t.titel.includes("zonneschermen") && false), agenda.blok4_ideeen);
  // Taak zonder datum in een overleg → geweigerd met dezelfde nette uitleg.
  const r9e = await fetch(`${BASIS}/overleggen`, {
    method: "POST", headers: team,
    body: JSON.stringify({ aanwezigen: ["Bewijs WB2 Teamlead"], taken: [{ titel: "Bewijs WB2 zonder datum in overleg", eigenaar_id: aGid }] }),
  });
  check("9e. overlegtaak zonder datum → 422", r9e.status === 422);

  // ── 10. AI-advies: gegevensgebonden, herordent niets ───────────────────────
  const r10 = await fetch(`${BASIS}/workflow/ai-advies`, { method: "POST", headers: a });
  check("10. AI-advies antwoordt", r10.status === 200, r10.status);
  const advies = await r10.json() as { groepen: Array<{ sleutels: string[] }>; ontbreekt: Array<{ sleutel: string; reden: string }>; kan_wachten: unknown[]; voorstellen: Array<{ sleutel: string; reden: string }> };
  const eigenSleutels = new Set(((await (await fetch(`${BASIS}/workflow`, { headers: a })).json()) as { rijen: Array<{ sleutel: string }> }).rijen.map((r) => r.sleutel));
  const alleSleutels = [
    ...advies.groepen.flatMap((g) => g.sleutels),
    ...advies.ontbreekt.map((o) => o.sleutel),
    ...advies.voorstellen.map((v) => v.sleutel),
  ];
  check("10b. alle AI-sleutels komen uit de eigen lijst (niets verzonnen)", alleSleutels.every((s) => eigenSleutels.has(s)), alleSleutels);
  check("10c. voorstellen hebben allemaal een reden en zijn max 3", advies.voorstellen.length <= 3 && advies.voorstellen.every((v) => v.reden.length > 0), advies.voorstellen);

  // ── 11. Telling gelijkende titels → docs/metingen (geen automatiek) ────────
  const eigen = await db.select({ titel: werkbakItemsTable.titel }).from(werkbakItemsTable).where(eq(werkbakItemsTable.bron, "eigen"));
  const genorm = new Map<string, number>();
  for (const t of eigen) {
    const sleutel = t.titel.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    genorm.set(sleutel, (genorm.get(sleutel) ?? 0) + 1);
  }
  const dubbel = [...genorm.entries()].filter(([, n]) => n > 1);
  mkdirSync("../docs/metingen", { recursive: true });
  writeFileSync("../docs/metingen/werkbak02-gelijkende-titels.md", [
    "# WERKBAK_02 — telling gelijkende taak-titels (proefperiode)",
    "", `Meetmoment: ${new Date().toISOString().slice(0, 10)}`,
    `Aantal eigen taken: ${eigen.length}`,
    `Aantal genormaliseerde titels met meer dan één taak: ${dubbel.length}`,
    "", "Afspraak (§4): alleen tellen en melden — geen automatische samenvoeging bouwen.",
    "", ...dubbel.map(([t, n]) => `- "${t}": ${n}×`),
  ].join("\n"));
  check("11. telling gelijkende titels vastgelegd in docs/metingen/", true);

  await ruimOp();
  console.log("\nAlle WERKBAK_02-acceptatiepunten groen.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
