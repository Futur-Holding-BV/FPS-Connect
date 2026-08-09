// CALC_INVOER_01 §8 — bewijs: van een geplakt product naar een calculatieregel.
// Van geplakte tekst/schermafdruk/productblad herkent de AI producten en koppelt
// de server ze aan EIGEN artikelen (mod_calc_artikelen) en normtijden
// (mod_calc_normtijden). De uitkomst is een VOORSTEL — niets wordt automatisch
// opgeslagen (§3.4). Prijzen komen nooit van de website (§3.5, §6).
//
// Dit script raakt GEEN api-server-bronbestanden aan: het praat uitsluitend via
// HTTP met de draaiende API en leest/schrijft via @workspace/db.
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-calcinvoer01.ts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, like, inArray } from "drizzle-orm";
import { authenticator } from "otplib";
import {
  db,
  gebruikersTable,
  modCalcHeadersTable,
  modCalcRegelsTable,
  modCalcArtekelenTable,
  modCalcNormtijdenTable,
  modCalcTarievenTable,
  modCalcPlakAnalysesTable,
  aiVeldCorrectiesTable,
} from "@workspace/db";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
// Testgeheimen worden bij elke run vers gegenereerd — geen hard-coded constanten.
// TOTP: een geldig base32-secret; WW: willekeurige entropie plus een vast
// complexiteitssuffix (hoofd-/kleine letter, cijfer, teken) om aan het beleid te voldoen.
const TOTP = authenticator.generateSecret();
const WW = `${randomBytes(12).toString("base64url")}Aa1!`;
const EMAIL = "bewijs-calcinvoer01@fps.local";

// Deployment-grendel: een bewijsscript raakt nooit productie aan.
if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript nooit tegen productie draaien.");
}

// Testmarkeringen zodat opruimen doelgericht en volledig is.
// AFWIJKING VAN DE OPDRACHT (gemeld): de gedeelde DB bevat AL normtijden voor
// een brandmanchet (BA-01 "Brandwerende manchet plaatsen", BA-02). Een manchet
// koppelt daardoor terecht aan artikel én normtijd → uitkomst "volledig", niet
// "alleen_artikel". Dat is GEEN backend-bug maar een botsing met de aanname in
// §8.4 ("bewust geen normtijd"). Om §8.4 zuiver te bewijzen kiezen we een
// product waarvoor de normtijden-bibliotheek écht geen post kent: een
// akoestische plafondtegel (m2). Er is wél een eigen artikel, geen normtijd →
// uitkomst "alleen_artikel", arbeid als ontbrekend gemeld.
const ART_CODES = ["KNF-W111-TEST", "BK100-TEST", "ATEG-600-TEST"];
const ART_MERK = "%[CALCINVOER01-TEST]%"; // in omschrijving van via-voorstel aangelegd artikel
const NORMTIJD_CODES = ["CI01-WAND", "CI01-KLEP"];
const CALC_MERK = "CALCINVOER01-TESTCALCULATIE";
const VELDCORR_FRAGMENT = "calcinvoer01-veldcorrectie-bewijs";

const fout: string[] = [];
function check(ok: boolean, regel: string): void {
  console.log(`${ok ? "✓" : "✗"} ${regel}`);
  if (!ok) {
    fout.push(regel);
    process.exitCode = 1;
  }
}

async function ruimOp(): Promise<void> {
  // Volgorde: eerst afhankelijke rijen (regels/plak-analyses), dan header/artikelen/normtijden/gebruiker.
  const calcs = await db
    .select({ id: modCalcHeadersTable.id })
    .from(modCalcHeadersTable)
    .where(eq(modCalcHeadersTable.naam, CALC_MERK));
  const calcIds = calcs.map((c) => c.id);
  if (calcIds.length > 0) {
    await db.delete(modCalcRegelsTable).where(inArray(modCalcRegelsTable.calculatieId, calcIds));
    await db.delete(modCalcPlakAnalysesTable).where(inArray(modCalcPlakAnalysesTable.calculatieId, calcIds));
    await db.delete(modCalcHeadersTable).where(inArray(modCalcHeadersTable.id, calcIds));
  }
  await db.delete(modCalcArtekelenTable).where(inArray(modCalcArtekelenTable.artikelcode, ART_CODES));
  await db.delete(modCalcArtekelenTable).where(like(modCalcArtekelenTable.omschrijving, ART_MERK));
  await db.delete(modCalcNormtijdenTable).where(inArray(modCalcNormtijdenTable.code, NORMTIJD_CODES));
  await db.delete(aiVeldCorrectiesTable).where(eq(aiVeldCorrectiesTable.tekstFragment, VELDCORR_FRAGMENT));
  await db.delete(gebruikersTable).where(like(gebruikersTable.email, EMAIL));
}

// Ruime timeout: elke plak-analyse doet ECHTE AI-aanroepen (10-40s per stuk).
async function plak(
  token: string,
  calcId: number,
  velden: { tekst?: string; lengte?: number; hoogte?: number; bijzonderheden?: string; bestand?: { pad: string; naam: string; mime: string } },
): Promise<any> {
  const form = new FormData();
  if (velden.tekst) form.append("tekst", velden.tekst);
  if (velden.lengte !== undefined) form.append("lengte", String(velden.lengte));
  if (velden.hoogte !== undefined) form.append("hoogte", String(velden.hoogte));
  if (velden.bijzonderheden) form.append("bijzonderheden", velden.bijzonderheden);
  if (velden.bestand) {
    const buf = readFileSync(velden.bestand.pad);
    form.append("bestand", new Blob([buf], { type: velden.bestand.mime }), velden.bestand.naam);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const r = await fetch(`${BASIS}/modules/calculaties/${calcId}/plak-analyse`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: ctrl.signal,
    });
    const tekst = await r.text();
    if (r.status !== 200) throw new Error(`plak-analyse ${r.status}: ${tekst.slice(0, 300)}`);
    return JSON.parse(tekst);
  } finally {
    clearTimeout(timer);
  }
}

async function telRegels(token: string, calcId: number): Promise<number> {
  const r = await fetch(`${BASIS}/modules/calculaties/${calcId}`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status !== 200) throw new Error(`GET calc ${r.status}`);
  const body = (await r.json()) as { regels: unknown[] };
  return body.regels.length;
}

async function main(): Promise<void> {
  await ruimOp();

  // ── Testgebruiker: calculaties niveau 2 (lezen+schrijven). De calculatie
  //    zelf zaaien we via de DB, zodat niveau 3 (aanmaken) niet nodig is. ──
  await db.insert(gebruikersTable).values({
    naam: "Bewijs CALC_INVOER_01",
    email: EMAIL,
    rol: "gebruiker",
    wachtwoord: await bcrypt.hash(WW, 10),
    totpSecret: TOTP,
    tweeFactorIngeschakeld: true,
    actief: true,
    functietitels: ["Calculator"],
    bevoegdheden: { calculaties: 2 },
  } as typeof gebruikersTable.$inferInsert);

  // ── Seed: artikelen, normtijden, testcalculatie ─────────────────────────
  // Twee artikelen mét normtijd, één brandmanchet BEWUST ZONDER normtijd (§8.4).
  await db.insert(modCalcArtekelenTable).values([
    { artikelcode: "KNF-W111-TEST", omschrijving: "Knauf W111 wandsysteem", eenheid: "m2", verkoopprijs: 18.5, inkoopprijs: 0, categorie: "materiaal" },
    { artikelcode: "BK100-TEST", omschrijving: "Brandklep 100mm", eenheid: "st", verkoopprijs: 62, inkoopprijs: 0, categorie: "materiaal" },
    { artikelcode: "ATEG-600-TEST", omschrijving: "Akoestische plafondtegel 600x600", eenheid: "m2", verkoopprijs: 24, inkoopprijs: 0, categorie: "materiaal" },
  ] as (typeof modCalcArtekelenTable.$inferInsert)[]);
  await db.insert(modCalcNormtijdenTable).values([
    { code: "CI01-WAND", omschrijving: "Metal-stud wand plaatsen", eenheid: "m2", urenPerEenheid: 0.35, categorie: "bouwkundig" },
    { code: "CI01-KLEP", omschrijving: "Brandklep monteren", eenheid: "st", urenPerEenheid: 0.5, categorie: "installatietechnisch" },
  ] as (typeof modCalcNormtijdenTable.$inferInsert)[]);
  const [calc] = await db.insert(modCalcHeadersTable).values({
    naam: CALC_MERK,
    status: "concept",
  } as typeof modCalcHeadersTable.$inferInsert).returning();
  const calcId = calc.id;

  // Verkoopprijs-referentie uit DB (bewijs: tarief komt uit de DB, niet verzonnen).
  const [wandArt] = await db.select().from(modCalcArtekelenTable).where(eq(modCalcArtekelenTable.artikelcode, "KNF-W111-TEST"));
  const [wandNorm] = await db.select().from(modCalcNormtijdenTable).where(eq(modCalcNormtijdenTable.code, "CI01-WAND"));

  // ── Login ────────────────────────────────────────────────────────────────
  const login = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, wachtwoord: WW, code: authenticator.generate(TOTP) }),
  });
  if (login.status !== 200) throw new Error(`login faalde: ${login.status} ${await login.text()}`);
  const { token } = (await login.json()) as { token: string };

  // ── Auto-opslag §8.7: tel regels VÓÓR alle plak-analyses ─────────────────
  const regelsVoor = await telRegels(token, calcId);
  check(regelsVoor === 0, `7a. Vóór plak-analyses heeft de calculatie 0 regels → ${regelsVoor}`);

  const wandTekst = "Knauf W111 metal-stud scheidingswand, dubbel beplaat, 60 min brandwerend";
  const klepTekst = "Brandklep 100 mm rond, EI60";
  const tegelTekst = "Akoestische plafondtegel 600x600 mm, minerale wol, wit gecoat oppervlak";
  const onbekendTekst = "Framax paneelklem X99 systeembekisting";

  // Helper: vind het product in de respons dat past bij een aanduiding/soort.
  const vindProduct = (res: any, ...termen: string[]) => {
    return (res.producten as any[]).find((p) => {
      const blob = `${p.herkend?.fabrikant ?? ""} ${p.herkend?.aanduiding ?? ""} ${p.herkend?.soort ?? ""} ${p.herkend?.eigenschappen ?? ""} ${p.artikel?.omschrijving ?? ""}`.toLowerCase();
      return termen.some((t) => blob.includes(t.toLowerCase()));
    });
  };

  // ══ Check 1: geplakte tekst wandsysteem → volledig, m2, 12.5, tarief 18.50, mu 0.35 ══
  console.log("\n[1] Geplakte tekst wandsysteem (lengte 5, hoogte 2.5)…");
  const r1 = await plak(token, calcId, { tekst: wandTekst, lengte: 5, hoogte: 2.5 });
  const p1 = vindProduct(r1, "W111", "Knauf", "wand");
  const c1 = p1?.conceptregel;
  check(!!p1 && p1.uitkomst === "volledig", `1. Wandsysteem uitkomst=volledig → ${p1?.uitkomst}`);
  check(!!c1 && c1.eenheid === "m2", `1. Eenheid m2 → ${c1?.eenheid}`);
  check(!!c1 && Math.abs((c1.hoeveelheid ?? -1) - 12.5) < 0.001, `1. Hoeveelheid 12.5 (=5×2.5) → ${c1?.hoeveelheid}`);
  check(!!c1 && Math.abs((c1.tarief ?? -1) - wandArt.verkoopprijs) < 0.001, `1. Tarief ${wandArt.verkoopprijs} uit DB-artikel → ${c1?.tarief}`);
  check(!!c1 && Math.abs((c1.mu_per_eenheid ?? -1) - wandNorm.urenPerEenheid) < 0.001, `1. mu_per_eenheid ${wandNorm.urenPerEenheid} uit DB-normtijd → ${c1?.mu_per_eenheid}`);
  check(!!c1 && c1.normtijd_id === wandNorm.id, `1. normtijd_id verwijst naar DB-normtijd → ${c1?.normtijd_id}`);

  // ══ Check 2: zelfde inhoud als AFBEELDING (ImageMagick) → zelfde koppeling ══
  console.log("\n[2] Zelfde wandsysteem als schermafdruk (ImageMagick)…");
  const pngPad = "/tmp/knauf.png";
  execFileSync("convert", [
    "-size", "900x300", "xc:white", "-font", "DejaVu-Sans", "-fill", "black", "-pointsize", "28",
    "-annotate", "+30+80", "Knauf W111 metal-stud scheidingswand",
    "-annotate", "+30+140", "dubbel beplaat, 60 min brandwerend",
    "-annotate", "+30+200", "wandsysteem - per m2",
    pngPad,
  ]);
  const r2 = await plak(token, calcId, { lengte: 5, hoogte: 2.5, bestand: { pad: pngPad, naam: "knauf.png", mime: "image/png" } });
  check(r2.invoer_soort === "afbeelding", `2. invoer_soort=afbeelding → ${r2.invoer_soort}`);
  const p2 = vindProduct(r2, "W111", "Knauf", "wand");
  check(!!p2 && p2.uitkomst === "volledig", `2. Schermafdruk-wandsysteem uitkomst=volledig → ${p2?.uitkomst}`);
  check(!!p2 && p2.conceptregel?.eenheid === "m2", `2. Eenheid m2 uit afbeelding → ${p2?.conceptregel?.eenheid}`);

  // ══ Check 3: brandklep per stuk, wand per m2 — beide eenheden ══
  console.log("\n[3] Brandklep (per stuk, aantal 3) naast wand (per m2)…");
  const r3 = await plak(token, calcId, { tekst: klepTekst, bijzonderheden: "aantal 3 stuks" });
  const p3klep = vindProduct(r3, "brandklep", "klep", "BK100");
  check(!!p3klep && p3klep.conceptregel?.eenheid === "st", `3. Brandklep eenheid st → ${p3klep?.conceptregel?.eenheid}`);
  console.log(`   wand-eenheid (check 1): m2 (${c1?.eenheid}) — brandklep-eenheid: st (${p3klep?.conceptregel?.eenheid})`);
  check(c1?.eenheid === "m2" && p3klep?.conceptregel?.eenheid === "st", "3. Beide eenheden getoond: wand=m2, brandklep=st");

  // ══ Check 4: plafondtegel zonder normtijd → alleen_artikel, mu ontbreekt ══
  console.log("\n[4] Product zonder normtijd (akoestische plafondtegel) → geen stille regel…");
  const r4 = await plak(token, calcId, { tekst: tegelTekst, lengte: 4, hoogte: 3 });
  const p4 = vindProduct(r4, "plafondtegel", "akoest", "ATEG");
  check(!!p4 && p4.uitkomst === "alleen_artikel", `4. Plafondtegel uitkomst=alleen_artikel → ${p4?.uitkomst}`);
  check(!!p4 && p4.mu_ontbreekt === true, `4. mu_ontbreekt=true → ${p4?.mu_ontbreekt}`);
  const c4 = p4?.conceptregel;
  check(!!c4 && (c4.mu_per_eenheid === null || c4.mu_per_eenheid === undefined), `4. mu_per_eenheid afwezig/null → ${c4?.mu_per_eenheid}`);
  check(!!c4 && (c4.normtijd_id === null || c4.normtijd_id === undefined), `4. normtijd_id null (nooit verzonnen norm) → ${c4?.normtijd_id}`);
  check(!!p4 && (Array.isArray(p4.normtijd_kandidaten) || typeof p4.vraag === "string"), `4. normtijd_kandidaten/vraag aanwezig → vraag=${JSON.stringify(p4?.vraag)}`);

  // ══ Check 5: onbekend product → ongekoppeld, geen regel, artikel_voorstel zonder prijs ══
  console.log("\n[5] Onbekend product (Framax X99) → ongekoppeld…");
  const r5 = await plak(token, calcId, { tekst: onbekendTekst });
  const p5 = vindProduct(r5, "framax", "X99", "paneelklem", "bekisting");
  check(!!p5 && p5.uitkomst === "ongekoppeld", `5. Onbekend uitkomst=ongekoppeld → ${p5?.uitkomst}`);
  check(!!p5 && p5.conceptregel === null, `5. Geen conceptregel → ${JSON.stringify(p5?.conceptregel)}`);
  check(!!p5 && !!p5.artikel_voorstel, `5. artikel_voorstel aanwezig (herkend + aanbod aanleggen)`);
  const voorstel = p5?.artikel_voorstel ?? {};
  check(!("prijs" in voorstel) && !("verkoopprijs" in voorstel) && !("inkoopprijs" in voorstel), `5. artikel_voorstel ZONDER prijsveld → sleutels: ${Object.keys(voorstel).join(",")}`);

  // ══ Check 6: leg artikel aan via voorstel ZONDER prijs → prijs blijft 0/leeg ══
  console.log("\n[6] Artikel aanleggen via voorstel, zonder prijs…");
  const aanmaak = await fetch(`${BASIS}/modules/calculaties/artikelen`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      leverancier_id: null,
      artikelcode: voorstel.artikelcode ?? "X99",
      omschrijving: `${voorstel.omschrijving ?? "Framax X99"} [CALCINVOER01-TEST]`,
      eenheid: voorstel.eenheid ?? "st",
      categorie: voorstel.categorie ?? "materiaal",
      // GEEN inkoopprijs/verkoopprijs meegegeven — prijs komt nooit van de website (§3.5)
    }),
  });
  check(aanmaak.status === 201, `6. Artikel aangelegd → ${aanmaak.status}`);
  const nieuwArt = (await aanmaak.json()) as any;
  const [gecheckt] = await db.select().from(modCalcArtekelenTable).where(eq(modCalcArtekelenTable.id, nieuwArt.id));
  check(!!gecheckt && gecheckt.inkoopprijs === 0 && gecheckt.verkoopprijs === 0, `6. Aangelegd artikel: inkoop=${gecheckt?.inkoopprijs} verkoop=${gecheckt?.verkoopprijs} (leeg)`);
  check(p5?.artikel_voorstel?.prijs_ontbreekt === true || p5?.prijs_ontbreekt === true, `6. Plak-respons meldde prijs_ontbreekt → voorstel:${p5?.artikel_voorstel?.prijs_ontbreekt} product:${p5?.prijs_ontbreekt}`);

  // ══ Check 7: auto-opslag — nog steeds 0 regels; pas na expliciete POST 1 ══
  console.log("\n[7] Auto-opslag: regels ná alle plak-analyses…");
  const regelsNa = await telRegels(token, calcId);
  check(regelsNa === 0, `7b. Ná ${5} plak-analyses nog steeds 0 regels (niets automatisch opgeslagen) → ${regelsNa}`);
  // Neem het volledig-voorstel (check 1) expliciet over via POST regels.
  const postRegel = await fetch(`${BASIS}/modules/calculaties/${calcId}/regels`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      categorie: c1.categorie,
      omschrijving: c1.omschrijving,
      eenheid: c1.eenheid,
      hoeveelheid: c1.hoeveelheid,
      tarief: c1.tarief,
      mu_per_eenheid: c1.mu_per_eenheid,
      arbeids_tarief: c1.arbeids_tarief ?? 0,
      normtijd_id: c1.normtijd_id,
      hoofdstuk: c1.hoofdstuk,
    }),
  });
  check(postRegel.status === 201, `7. Expliciete POST regels → ${postRegel.status}`);
  const regelsNaPost = await telRegels(token, calcId);
  check(regelsNaPost === 1, `7. Pas na expliciete bevestiging is er 1 regel → ${regelsNaPost}`);

  // ══ Check 8: veld-correctie vastgelegd in ai_veld_correcties ══
  console.log("\n[8] Veld-correctie vastleggen…");
  const corr = await fetch(`${BASIS}/modules/calculaties/veld-correctie`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      veld_naam: "calc_plak.hoeveelheid",
      ai_voorstel: "12.5",
      gekozen: "14",
      tekst_fragment: VELDCORR_FRAGMENT,
    }),
  });
  check(corr.status === 204, `8. POST veld-correctie → ${corr.status}`);
  const corrRijen = await db.select().from(aiVeldCorrectiesTable).where(eq(aiVeldCorrectiesTable.tekstFragment, VELDCORR_FRAGMENT));
  const cr = corrRijen[0];
  check(!!cr && cr.veldNaam === "calc_plak.hoeveelheid" && cr.aiVoorstel === "12.5" && cr.gekozen === "14",
    `8. Rij in ai_veld_correcties: veld=${cr?.veldNaam} ai=${cr?.aiVoorstel} gekozen=${cr?.gekozen}`);

  // ══ Check 9: koppelgraad §8.9 — ≥10 plakhandelingen ══
  // Reeds gedaan: 5 (wand-tekst, wand-afbeelding, brandklep, plafondtegel, onbekend).
  // Vul aan tot ≥10; verdeling ~ 4× wand, 3× brandklep, 2× tegel, 1× onbekend.
  console.log("\n[9] Koppelgraad — aanvullen tot ≥10 plakhandelingen (echte AI, kan even duren)…");
  // reeds: wand=2, klep=1, tegel=1, onbekend=1 → nog: wand×2, klep×2, tegel×1
  const nog: Array<{ soort: string; velden: any }> = [
    { soort: "wand", velden: { tekst: wandTekst, lengte: 4, hoogte: 3 } },
    { soort: "wand", velden: { tekst: wandTekst, lengte: 6, hoogte: 2.6 } },
    { soort: "klep", velden: { tekst: klepTekst, bijzonderheden: "aantal 2" } },
    { soort: "klep", velden: { tekst: klepTekst } },
    { soort: "tegel", velden: { tekst: tegelTekst, lengte: 5, hoogte: 4 } },
  ];
  for (const item of nog) {
    await plak(token, calcId, item.velden);
    console.log(`   extra plak (${item.soort}) gedaan`);
  }

  // Lees alle plak-analyses voor deze calculatie.
  const analyses = await db.select().from(modCalcPlakAnalysesTable).where(eq(modCalcPlakAnalysesTable.calculatieId, calcId));
  const aantalPlak = analyses.length;
  const som = (k: keyof typeof analyses[number]) => analyses.reduce((s, a) => s + (Number(a[k]) || 0), 0);
  const totHerkend = som("herkendAantal");
  const totBeide = som("gekoppeldBeide");
  const totAlleenArt = som("alleenArtikel");
  const totAlleenNorm = som("alleenNormtijd");
  const totOngekoppeld = som("ongekoppeld");
  const koppelgraad = totHerkend > 0 ? Math.round((totBeide / totHerkend) * 1000) / 10 : 0;

  console.log(`   plakhandelingen=${aantalPlak} herkend=${totHerkend} beide=${totBeide} alleen_artikel=${totAlleenArt} alleen_normtijd=${totAlleenNorm} ongekoppeld=${totOngekoppeld} koppelgraad=${koppelgraad}%`);
  check(aantalPlak >= 10, `9. Minimaal 10 plakhandelingen → ${aantalPlak}`);
  check(totBeide + totAlleenArt + totAlleenNorm + totOngekoppeld === totHerkend, `9. Telling sluit: som uitkomsten = herkend (${totHerkend})`);

  // Vaakst-ongekoppeld bepalen uit herkendeProducten van ongekoppelde rijen.
  const ongekoppeldTellingen = new Map<string, number>();
  for (const a of analyses) {
    if ((a.ongekoppeld ?? 0) > 0 && Array.isArray(a.herkendeProducten)) {
      for (const p of a.herkendeProducten as any[]) {
        const naam = [p.fabrikant, p.aanduiding, p.soort].filter(Boolean).join(" ") || "onbekend";
        ongekoppeldTellingen.set(naam, (ongekoppeldTellingen.get(naam) ?? 0) + 1);
      }
    }
  }
  const vaakstOngekoppeld = [...ongekoppeldTellingen.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} (${c}×)`).join(", ") || "geen";

  // ── Meting-document schrijven ────────────────────────────────────────────
  const datum = new Date(process.env.__BEWIJS_DATUM ?? "2026-08-09T00:00:00Z").toISOString().slice(0, 10);
  const doc = `# CALC_INVOER_01 — koppelgraad (nulmeting)

Dit is een **gecontroleerde nulmeting** uit het bewijsscript
\`scripts/src/bewijs-calcinvoer01.ts\` (§8.9). Het is nadrukkelijk **niet** de
echte proefperiode-meting: de invoer is een vast, gecontroleerd testscenario met
een kleine testbibliotheek. De echte meting over een proefperiode met de eigen
artikelen- en normtijdenbibliotheek volgt uit taak §4 van de opdracht.

| Datum | Plakhandelingen | Herkende producten | Koppelgraad (artikel+normtijd) | Vaakst ongekoppeld |
|---|---|---|---|---|
| ${datum} | ${aantalPlak} | ${totHerkend} | ${koppelgraad}% (${totBeide}/${totHerkend}) | ${vaakstOngekoppeld} |

## Verdeling over de vier koppeluitkomsten (§3.3)

| Uitkomst | Aantal |
|---|---|
| Artikel én normtijd | ${totBeide} |
| Alleen artikel (arbeid ontbreekt) | ${totAlleenArt} |
| Alleen normtijd (materiaal ontbreekt) | ${totAlleenNorm} |
| Geen van beide (ongekoppeld) | ${totOngekoppeld} |

## Duiding

Blijkt de koppelgraad in de echte proefperiode laag, dan is de oplossing niet
betere herkenning maar een **vollere artikelen- en normtijdenbibliotheek**
(§4, \`ENK_IMPORT_01\`). In deze nulmeting is de bibliotheek bewust klein en
bevat zij één product (brandmanchet) met artikel maar zonder normtijd, plus een
bewust onbekend product — daarom is de koppelgraad hier lager dan bij een
gevulde bibliotheek te verwachten valt.
`;
  // CWD is de scripts-package bij `pnpm --filter`; het meting-doc hoort in de
  // repo-root (../docs/metingen), gelijk aan meting-ai01.ts / bewijs-werkbak02.ts.
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync("../docs/metingen", { recursive: true });
  writeFileSync("../docs/metingen/CALC_INVOER_01_koppelgraad.md", doc);
  check(true, "9. docs/metingen/CALC_INVOER_01_koppelgraad.md geschreven");

  // ── Opruimen ───────────────────────────────────────────────────────────
  await ruimOp();

  console.log(process.exitCode ? `\nFAAL — ${fout.length} check(s) rood:\n- ${fout.join("\n- ")}` : "\nCALC_INVOER_01 §8 groen: geplakt product → gekoppeld voorstel, niets stil opgeslagen, geen websiteprijs.");
}

main().then(() => process.exit(process.exitCode ?? 0)).catch((e) => { console.error(e); process.exit(1); });
