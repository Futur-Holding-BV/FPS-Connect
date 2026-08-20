// Richt een vast e2e-testaccount in voor de FPS Monteur-app en genereert een
// geldige TOTP-code. Bedoeld om de geautomatiseerde controle van het radiaal
// startmenu (login + waaier + doorlinken) reproduceerbaar te draaien.
//
// Idempotent: bestaand account wordt bijgewerkt (zelfde e-mail/secret).
// CLI draaien: pnpm --filter @workspace/scripts run e2e-monteur-testaccount
// Importeren: setupE2eAccount() + genereerVersTotp() worden hergebruikt door de
// Playwright-spec (scripts/e2e/startmenu.spec.ts).
//
// Het account krijgt verplichte tweestapsverificatie (zoals echte accounts) met
// een vaste TOTP-secret zodat de e2e-test een geldige code kan genereren. De
// bevoegdheden staan op het hoogste niveau voor alle modules zodat elke
// menukeuze (Gebouwen, Personeel, Fabrikanten) ook echt doorlinkt.
import { pathToFileURL } from "node:url";
import crypto from "node:crypto";

import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { authenticator } from "otplib";

import {
  db,
  functiesTable,
  gebruikersTable,
  medewerkerAanstellingenTable,
  medewerkersTable,
  verlofsoortenTable,
} from "@workspace/db";
import { MODULE_IDS } from "@workspace/permissies";

export const E2E_EMAIL = "e2e-menu@fps.local";
export const E2E_WACHTWOORD = "E2eMenuTest!2026";
// Vaste secret: de e2e-test gebruikt dezelfde secret om een live code te maken.
export const E2E_TOTP_SECRET = "PAOSGYZWOEMU2HDD";

// Drie vaste profielen voor de telefoonomgeving-voor-iedereen-proef:
// veldfunctie, kantoor zonder aanvullende rechten en hoofdbeheerder.
export const E2E_TELEFOON_VELD_EMAIL = "e2e-telefoon-veld@fps.local";
export const E2E_TELEFOON_VELD_WACHTWOORD = `E2e!${crypto.randomBytes(18).toString("base64url")}`;
export const E2E_TELEFOON_VELD_TOTP_SECRET = authenticator.generateSecret();

export const E2E_TELEFOON_KANTOOR_EMAIL = "e2e-telefoon-kantoor@fps.local";
export const E2E_TELEFOON_KANTOOR_WACHTWOORD = `E2e!${crypto.randomBytes(18).toString("base64url")}`;
export const E2E_TELEFOON_KANTOOR_TOTP_SECRET = authenticator.generateSecret();

export const E2E_TELEFOON_ADMIN_EMAIL = "e2e-telefoon-admin@fps.local";
export const E2E_TELEFOON_ADMIN_WACHTWOORD = `E2e!${crypto.randomBytes(18).toString("base64url")}`;
export const E2E_TELEFOON_ADMIN_TOTP_SECRET = authenticator.generateSecret();

// Eigen vast account voor de web-e2e-suite (gebouw-detail + offerte-badge).
// Bewust GESCHEIDEN van het monteur-account hierboven: de web- en monteur-suite
// kunnen parallel draaien (o.a. in de validatiepijplijn) en de opruiming in het
// finally-blok van de ene runner mag de lopende tests van de andere nooit raken.
export const E2E_WEB_EMAIL = "e2e-web@fps.local";
export const E2E_WEB_WACHTWOORD = "E2eWebTest!2026";
export const E2E_WEB_TOTP_SECRET = "KJ4WWZLNMNXW4RTF";

// Vast beheerdersaccount voor web-e2e-specs die beheerder-only UI nodig hebben
// (o.a. de knop "Nieuw gebouw" in web-gebouw-aanmaken.spec.ts). Bewust een
// APART account: het gewone web-account houdt rol "gebruiker" zodat de overige
// web-specs het niet-beheerder-perspectief blijven testen.
export const E2E_WEB_ADMIN_EMAIL = "e2e-web-admin@fps.local";
export const E2E_WEB_ADMIN_WACHTWOORD = "E2eWebAdmin!2026";
export const E2E_WEB_ADMIN_TOTP_SECRET = "GJ3XA2LDN5UW45DF";

// Vaste accounts voor de uitvoering-rechten-e2e (web-uitvoering-rechten.spec.ts):
// een hoofdbeheerder (alle rechten → eersteTab = stappen) en een gebruiker met
// uitsluitend projecten:1 (geen offertes/bibliotheek → eersteTab = planning).
export const E2E_UITV_ADMIN_EMAIL = "e2e-uitv-admin@fps.local";
export const E2E_UITV_ADMIN_WACHTWOORD = "E2eUitvAdmin!2026";
export const E2E_UITV_ADMIN_TOTP_SECRET = "ORSXG5BNON4XIZLT";

export const E2E_UITV_PROJ_EMAIL = "e2e-uitv-proj@fps.local";
export const E2E_UITV_PROJ_WACHTWOORD = "E2eUitvProj!2026";
export const E2E_UITV_PROJ_TOTP_SECRET = "MVXGG33PEBQW4RTF";

// Vaste accounts voor de bedragen-strip-e2e (web-bedragen-strip.spec.ts):
// een monteur-achtig account met projecten:1 (lezen ZONDER bedragen) en een
// kantooraccount met projecten:2 (lezen MET bedragen). Bewust aparte accounts
// zodat de bevoegdheden exact overeenkomen met de matrix uit BOUW_01 §1.
export const E2E_BEDRAGEN1_EMAIL = "e2e-web-bedragen1@fps.local";
export const E2E_BEDRAGEN1_WACHTWOORD = "E2eBedragen1!2026";
export const E2E_BEDRAGEN1_TOTP_SECRET = "MFRGGZDFMZTWQ2LK";

export const E2E_BEDRAGEN2_EMAIL = "e2e-web-bedragen2@fps.local";
export const E2E_BEDRAGEN2_WACHTWOORD = "E2eBedragen2!2026";
export const E2E_BEDRAGEN2_TOTP_SECRET = "NBSWY3DPO5XXE3DE";

// Vast account voor de uurcodes-zonder-projectenrecht-e2e
// (web-uren-uurcodes-recht.spec.ts): een veldgebruiker ZONDER projectenrecht
// (projecten:0) zodat GET /opdrachten/:id/uurcodes een echte 403 geeft en de
// nette uitleg (data-testid melding-uurcodes-geen-recht) zichtbaar moet worden.
export const E2E_UURCODES_EMAIL = "e2e-web-uurcodes@fps.local";
export const E2E_UURCODES_WACHTWOORD = "E2eUurcodes!2026";
export const E2E_UURCODES_TOTP_SECRET = "MJUXG5DFOJRWK2LK";

// Zelfde scenario voor de monteur-app-suite (monteur-uren-uurcodes-recht.spec.ts).
// Bewust een APART account: de web- en monteur-suite draaien parallel in de
// validatiepijplijn en mogen elkaars accounts nooit archiveren/hergebruiken.
export const E2E_UURCODES_APP_EMAIL = "e2e-app-uurcodes@fps.local";
export const E2E_UURCODES_APP_WACHTWOORD = "E2eUurcodesApp!2026";
export const E2E_UURCODES_APP_TOTP_SECRET = "OBUXG5DFOJRWK4TL";

// Vier accounts voor de marketing-rechten-e2e (web-marketing-rechten.spec.ts).
// Bewust gescheiden van alle andere e2e-accounts: de vier profielen dekken de
// grenzen af tussen crm- en marketing-modules (migratie 0069).
//   CRM-only   : crm:3, marketing:0  → sidebar CRM ✓, Marketing ✗; API 403
//   Mktg-only  : marketing:3, crm:0  → sidebar Marketing ✓, CRM ✗
//   Commercieel: crm:4, marketing:3  → Proef-knop ✓, Verzenden-knop ✗
//   Directie   : crm:4, marketing:4  → Proef-knop ✓, Verzenden-knop ✓
export const E2E_MKTG_CRM_EMAIL = "e2e-mktg-crm@fps.local";
export const E2E_MKTG_CRM_WACHTWOORD = "E2eMktgCrm!2026";
export const E2E_MKTG_CRM_TOTP_SECRET = "NBRWG33EOBTG64TF";

export const E2E_MKTG_ONLY_EMAIL = "e2e-mktg-only@fps.local";
export const E2E_MKTG_ONLY_WACHTWOORD = "E2eMktgOnly!2026";
export const E2E_MKTG_ONLY_TOTP_SECRET = "MNUGK3TFOIQHK4TF";

export const E2E_MKTG_COM_EMAIL = "e2e-mktg-com@fps.local";
export const E2E_MKTG_COM_WACHTWOORD = "E2eMktgCom!2026";
export const E2E_MKTG_COM_TOTP_SECRET = "OBQWK3TFOVRXK3TF";

export const E2E_MKTG_DIR_EMAIL = "e2e-mktg-dir@fps.local";
export const E2E_MKTG_DIR_WACHTWOORD = "E2eMktgDir!2026";
export const E2E_MKTG_DIR_TOTP_SECRET = "NRXXK3TFOBTGK4DJ";

// Twee accounts voor de social-rechten-e2e (web-social-rechten.spec.ts).
// Bewijs: campagnekoppeling in OpstellerDialog vereist marketing:3.
//   Social-only   : social:3, marketing:0 → select-campagne NIET zichtbaar
//   Social+Mktg   : social:3, marketing:3 → select-campagne WEL zichtbaar
export const E2E_SOC_ONLY_EMAIL = "e2e-soc-only@fps.local";
export const E2E_SOC_ONLY_WACHTWOORD = "E2eSocOnly!2026";
export const E2E_SOC_ONLY_TOTP_SECRET = "NRSWK3TFOBTGK4ZZ";

export const E2E_SOC_MKTG_EMAIL = "e2e-soc-mktg@fps.local";
export const E2E_SOC_MKTG_WACHTWOORD = "E2eSocMktg!2026";
export const E2E_SOC_MKTG_TOTP_SECRET = "OBSXK3TFOBTGK4YY";

// Veiligheidsgrendel: e2e-accounts mogen uitsluitend in de dev-omgeving
// worden aangemaakt of geheractiveerd — nooit in een deployment/productie.
function weigerBuitenDev(): void {
  if (process.env.REPLIT_DEPLOYMENT) {
    throw new Error(
      "GEWEIGERD: e2e-testaccounts mogen niet in een deployment (productie) worden aangemaakt.",
    );
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "GEWEIGERD: e2e-testaccounts mogen niet met NODE_ENV=production worden aangemaakt.",
    );
  }
}

// Gedeelde aanmaak-/bijwerklogica voor beide vaste e2e-accounts. Idempotent en
// herbruikbaar vanuit een testrun (Playwright beforeAll) zonder dat het proces
// wordt afgesloten.
async function maakOfUpdateE2eAccount(opties: {
  email: string;
  naam: string;
  wachtwoord: string;
  totpSecret: string;
  rol?: "gebruiker" | "hoofdbeheerder";
  // Optionele expliciete bevoegdheden-matrix. Zonder opgave krijgt het account
  // niveau 4 op alle modules (het historische gedrag van de bestaande accounts).
  bevoegdheden?: Record<string, number>;
  functietitels?: string[];
}): Promise<number> {
  weigerBuitenDev();
  const rol = opties.rol ?? "gebruiker";
  const hash = await bcrypt.hash(opties.wachtwoord, 10);
  const bevoegdheden =
    opties.bevoegdheden ?? Object.fromEntries(MODULE_IDS.map((m) => [m, 4]));

  const [bestaand] = await db
    .select({ id: gebruikersTable.id })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.email, opties.email));

  if (bestaand) {
    await db
      .update(gebruikersTable)
      .set({
        naam: opties.naam,
        rol,
        wachtwoord: hash,
        totpSecret: opties.totpSecret,
        tweeFactorIngeschakeld: true,
        actief: true,
        gearchiveerd: false,
        bevoegdheden,
        ...(opties.functietitels ? { functietitels: opties.functietitels } : {}),
        // NOTITIE_01: initialen vooraf zetten zodat de eenmalige
        // "Je initialen"-dialoog geen e2e-tests blokkeert.
        initialen: "E2E",
      })
      .where(eq(gebruikersTable.id, bestaand.id));
    return bestaand.id;
  }

  const [nieuw] = await db
    .insert(gebruikersTable)
    .values({
      naam: opties.naam,
      email: opties.email,
      rol,
      wachtwoord: hash,
      totpSecret: opties.totpSecret,
      tweeFactorIngeschakeld: true,
      actief: true,
      bevoegdheden,
      functietitels: opties.functietitels ?? [],
      initialen: "E2E",
    })
    .returning({ id: gebruikersTable.id });
  return nieuw.id;
}

// Vaste naam voor de e2e-verlofsoort. Zorgt dat de verlofformulier-e2e-stap
// (scripts/e2e/startmenu.spec.ts) altijd minstens één keuzeoptie heeft, ook in
// een schone CI-omgeving zonder handmatig geseedde verlofsoorten. Idempotent:
// een bestaande soort met deze naam wordt alleen op "actief" gezet, niet
// gedupliceerd.
const E2E_VERLOFSOORT_NAAM = "E2E Vakantiedagen";
const E2E_UITVOERENDE_FUNCTIE_NAAM = "Monteur";
const E2E_FUNCTIE_WERKMAATSCHAPPIJ = "E2E";

async function zorgVoorE2eVerlofsoort(): Promise<void> {
  weigerBuitenDev();
  const [bestaand] = await db
    .select({ id: verlofsoortenTable.id })
    .from(verlofsoortenTable)
    .where(eq(verlofsoortenTable.naam, E2E_VERLOFSOORT_NAAM));

  if (bestaand) {
    await db
      .update(verlofsoortenTable)
      .set({ actief: true })
      .where(eq(verlofsoortenTable.id, bestaand.id));
    return;
  }

  await db.insert(verlofsoortenTable).values({
    naam: E2E_VERLOFSOORT_NAAM,
    categorie: "wettelijk",
    hoofdcategorie: "vakantie",
    betaald: true,
    collectief: false,
    actief: true,
  });
}

async function zorgVoorE2eUitvoerendeFunctie(): Promise<number> {
  const [bestaand] = await db
    .select({ id: functiesTable.id })
    .from(functiesTable)
    .where(
      and(
        eq(functiesTable.naam, E2E_UITVOERENDE_FUNCTIE_NAAM),
        eq(functiesTable.werkmaatschappij, E2E_FUNCTIE_WERKMAATSCHAPPIJ),
      ),
    );

  if (bestaand) {
    await db
      .update(functiesTable)
      .set({
        actief: true,
        uitvoerend: true,
        profielId: null,
        bijgewerktOp: new Date(),
      })
      .where(eq(functiesTable.id, bestaand.id));
    return bestaand.id;
  }

  const [nieuw] = await db
    .insert(functiesTable)
    .values({
      werkmaatschappij: E2E_FUNCTIE_WERKMAATSCHAPPIJ,
      naam: E2E_UITVOERENDE_FUNCTIE_NAAM,
      omschrijving: "Technische testfunctie voor het uitvoerende telefoonprofiel.",
      uitvoerend: true,
      actief: true,
      profielId: null,
    })
    .returning({ id: functiesTable.id });
  return nieuw.id;
}

async function zorgVoorMedewerker(
  gebruikerId: number,
  naam: string,
  functieId: number | null,
): Promise<number> {
  const [bestaand] = await db
    .select({ id: medewerkersTable.id })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.gebruikerId, gebruikerId));

  if (bestaand) {
    await db
      .update(medewerkersTable)
      .set({
        naam,
        functieId,
        actief: true,
        inDienstSinds: null,
        uitDienstPer: null,
      })
      .where(eq(medewerkersTable.id, bestaand.id));
    await db
      .delete(medewerkerAanstellingenTable)
      .where(eq(medewerkerAanstellingenTable.medewerkerId, bestaand.id));
    return bestaand.id;
  }

  const [nieuw] = await db
    .insert(medewerkersTable)
    .values({ gebruikerId, naam, functieId, actief: true })
    .returning({ id: medewerkersTable.id });
  return nieuw.id;
}

// Vast e2e-account voor de monteur-suite (startmenu.spec.ts).
export async function setupE2eAccount(): Promise<number> {
  const id = await maakOfUpdateE2eAccount({
    email: E2E_EMAIL,
    naam: "E2E Test Monteur",
    wachtwoord: E2E_WACHTWOORD,
    totpSecret: E2E_TOTP_SECRET,
    functietitels: ["Monteur"],
  });
  const functieId = await zorgVoorE2eUitvoerendeFunctie();
  await Promise.all([
    zorgVoorMedewerker(id, "E2E Test Monteur", functieId),
    zorgVoorE2eVerlofsoort(),
  ]);
  return id;
}

export async function setupE2eTelefoonProfielen(): Promise<{
  veldId: number;
  kantoorId: number;
  adminId: number;
}> {
  const veldId = await maakOfUpdateE2eAccount({
    email: E2E_TELEFOON_VELD_EMAIL,
    naam: "E2E Telefoon Veld",
    wachtwoord: E2E_TELEFOON_VELD_WACHTWOORD,
    totpSecret: E2E_TELEFOON_VELD_TOTP_SECRET,
    functietitels: ["Monteur"],
  });
  const kantoorId = await maakOfUpdateE2eAccount({
    email: E2E_TELEFOON_KANTOOR_EMAIL,
    naam: "E2E Telefoon Kantoor",
    wachtwoord: E2E_TELEFOON_KANTOOR_WACHTWOORD,
    totpSecret: E2E_TELEFOON_KANTOOR_TOTP_SECRET,
    bevoegdheden: {},
    functietitels: ["Administratief medewerker"],
  });
  const adminId = await maakOfUpdateE2eAccount({
    email: E2E_TELEFOON_ADMIN_EMAIL,
    naam: "E2E Telefoon Hoofdbeheerder",
    wachtwoord: E2E_TELEFOON_ADMIN_WACHTWOORD,
    totpSecret: E2E_TELEFOON_ADMIN_TOTP_SECRET,
    rol: "hoofdbeheerder",
    functietitels: ["Directeur"],
  });
  const uitvoerendeFunctieId = await zorgVoorE2eUitvoerendeFunctie();

  await Promise.all([
    zorgVoorMedewerker(veldId, "E2E Telefoon Veld", uitvoerendeFunctieId),
    zorgVoorMedewerker(kantoorId, "E2E Telefoon Kantoor", null),
    zorgVoorMedewerker(adminId, "E2E Telefoon Hoofdbeheerder", null),
    zorgVoorE2eVerlofsoort(),
  ]);
  return { veldId, kantoorId, adminId };
}

export async function archiveerE2eTelefoonProfielen(): Promise<void> {
  const resultaten = await Promise.allSettled([
    archiveerAccount(E2E_TELEFOON_VELD_EMAIL),
    archiveerAccount(E2E_TELEFOON_KANTOOR_EMAIL),
    archiveerAccount(E2E_TELEFOON_ADMIN_EMAIL),
  ]);
  const fouten = resultaten.filter(
    (resultaat): resultaat is PromiseRejectedResult => resultaat.status === "rejected",
  );
  if (fouten.length > 0) {
    throw new AggregateError(
      fouten.map((fout) => fout.reason),
      `${fouten.length} telefoonprofiel(en) konden niet worden gearchiveerd`,
    );
  }
}

// Vast e2e-account voor de web-suite (web-gebouw-detail + web-offerte-badge).
export async function setupE2eWebAccount(): Promise<number> {
  return maakOfUpdateE2eAccount({
    email: E2E_WEB_EMAIL,
    naam: "E2E Test Web",
    wachtwoord: E2E_WEB_WACHTWOORD,
    totpSecret: E2E_WEB_TOTP_SECRET,
  });
}

// Vast beheerdersaccount voor de web-suite (web-gebouw-aanmaken).
export async function setupE2eWebAdminAccount(): Promise<number> {
  return maakOfUpdateE2eAccount({
    email: E2E_WEB_ADMIN_EMAIL,
    naam: "E2E Test Web Beheerder",
    wachtwoord: E2E_WEB_ADMIN_WACHTWOORD,
    totpSecret: E2E_WEB_ADMIN_TOTP_SECRET,
    rol: "hoofdbeheerder",
  });
}

// Vaste accounts voor de uitvoering-rechten-suite (web-uitvoering-rechten.spec.ts).
// Admin heeft alle bevoegdheden (eersteTab = stappen); proj alleen projecten:1
// (eersteTab = planning, tabs stappen/oplevering/documenten/materiaal verborgen).
export async function setupE2eUitvoeringAccounts(): Promise<{
  adminId: number;
  projId: number;
}> {
  const adminId = await maakOfUpdateE2eAccount({
    email: E2E_UITV_ADMIN_EMAIL,
    naam: "E2E Uitvoering Beheerder",
    wachtwoord: E2E_UITV_ADMIN_WACHTWOORD,
    totpSecret: E2E_UITV_ADMIN_TOTP_SECRET,
    // Geen bevoegdheden opgeven → alle modules op 4 (default in maakOfUpdateE2eAccount).
  });
  const projId = await maakOfUpdateE2eAccount({
    email: E2E_UITV_PROJ_EMAIL,
    naam: "E2E Uitvoering Projecten",
    wachtwoord: E2E_UITV_PROJ_WACHTWOORD,
    totpSecret: E2E_UITV_PROJ_TOTP_SECRET,
    bevoegdheden: { projecten: 1 },
  });
  return { adminId, projId };
}

export async function archiveerE2eUitvoeringAccounts(): Promise<void> {
  await archiveerAccount(E2E_UITV_ADMIN_EMAIL);
  await archiveerAccount(E2E_UITV_PROJ_EMAIL);
}

// Vaste accounts voor de bedragen-strip-suite (web-bedragen-strip.spec.ts).
// projecten:1 = lezen zonder bedragen; projecten:2 = lezen mét bedragen.
export async function setupE2eBedragenAccounts(): Promise<{
  niveau1Id: number;
  niveau2Id: number;
}> {
  const niveau1Id = await maakOfUpdateE2eAccount({
    email: E2E_BEDRAGEN1_EMAIL,
    naam: "E2E Bedragen Niveau1",
    wachtwoord: E2E_BEDRAGEN1_WACHTWOORD,
    totpSecret: E2E_BEDRAGEN1_TOTP_SECRET,
    bevoegdheden: { projecten: 1 },
  });
  const niveau2Id = await maakOfUpdateE2eAccount({
    email: E2E_BEDRAGEN2_EMAIL,
    naam: "E2E Bedragen Niveau2",
    wachtwoord: E2E_BEDRAGEN2_WACHTWOORD,
    totpSecret: E2E_BEDRAGEN2_TOTP_SECRET,
    bevoegdheden: { projecten: 2 },
  });
  return { niveau1Id, niveau2Id };
}

// Vast account voor web-uren-uurcodes-recht.spec.ts: bewust GEEN projecten-
// recht (en verder alleen wat basisinzage) zodat de uurcodelijst per opdracht
// server-side met 403 wordt geweigerd.
export async function setupE2eUurcodesAccount(): Promise<number> {
  return maakOfUpdateE2eAccount({
    email: E2E_UURCODES_EMAIL,
    naam: "E2E Uurcodes Zonder Recht",
    wachtwoord: E2E_UURCODES_WACHTWOORD,
    totpSecret: E2E_UURCODES_TOTP_SECRET,
    bevoegdheden: { planning: 1 },
  });
}

export async function archiveerE2eUurcodesAccount(): Promise<void> {
  await archiveerAccount(E2E_UURCODES_EMAIL);
}

// App-variant (monteur-suite) van het uurcodes-zonder-recht-account.
export async function setupE2eUurcodesAppAccount(): Promise<number> {
  const gebruikerId = await maakOfUpdateE2eAccount({
    email: E2E_UURCODES_APP_EMAIL,
    naam: "E2E App Uurcodes Zonder Recht",
    wachtwoord: E2E_UURCODES_APP_WACHTWOORD,
    totpSecret: E2E_UURCODES_APP_TOTP_SECRET,
    bevoegdheden: { planning: 1 },
  });
  const functieId = await zorgVoorE2eUitvoerendeFunctie();
  await zorgVoorMedewerker(
    gebruikerId,
    "E2E App Uurcodes Zonder Recht",
    functieId,
  );
  return gebruikerId;
}

export async function archiveerE2eUurcodesAppAccount(): Promise<void> {
  await archiveerAccount(E2E_UURCODES_APP_EMAIL);
}

/** Richt de vier marketing-rechtentestaccounts in (idempotent). */
export async function setupE2eMarketingRechtenAccounts(): Promise<void> {
  await maakOfUpdateE2eAccount({
    email: E2E_MKTG_CRM_EMAIL,
    wachtwoord: E2E_MKTG_CRM_WACHTWOORD,
    totpSecret: E2E_MKTG_CRM_TOTP_SECRET,
    naam: "E2E Mktg CRM-only",
    rol: "gebruiker",
    bevoegdheden: { crm: 3 },
  });
  await maakOfUpdateE2eAccount({
    email: E2E_MKTG_ONLY_EMAIL,
    wachtwoord: E2E_MKTG_ONLY_WACHTWOORD,
    totpSecret: E2E_MKTG_ONLY_TOTP_SECRET,
    naam: "E2E Mktg Marketing-only",
    rol: "gebruiker",
    bevoegdheden: { marketing: 3 },
  });
  await maakOfUpdateE2eAccount({
    email: E2E_MKTG_COM_EMAIL,
    wachtwoord: E2E_MKTG_COM_WACHTWOORD,
    totpSecret: E2E_MKTG_COM_TOTP_SECRET,
    naam: "E2E Mktg Commercieel",
    rol: "gebruiker",
    bevoegdheden: { crm: 4, marketing: 3 },
  });
  await maakOfUpdateE2eAccount({
    email: E2E_MKTG_DIR_EMAIL,
    wachtwoord: E2E_MKTG_DIR_WACHTWOORD,
    totpSecret: E2E_MKTG_DIR_TOTP_SECRET,
    naam: "E2E Mktg Directie",
    rol: "gebruiker",
    bevoegdheden: { crm: 4, marketing: 4 },
  });
}

/** Archiveert de vier marketing-rechtentestaccounts. */
export async function archiveerE2eMarketingRechtenAccounts(): Promise<void> {
  await archiveerAccount(E2E_MKTG_CRM_EMAIL);
  await archiveerAccount(E2E_MKTG_ONLY_EMAIL);
  await archiveerAccount(E2E_MKTG_COM_EMAIL);
  await archiveerAccount(E2E_MKTG_DIR_EMAIL);
}

/** Richt de twee social-rechten-testaccounts in (idempotent). */
export async function setupE2eSocialRechtenAccounts(): Promise<void> {
  await maakOfUpdateE2eAccount({
    email: E2E_SOC_ONLY_EMAIL,
    wachtwoord: E2E_SOC_ONLY_WACHTWOORD,
    totpSecret: E2E_SOC_ONLY_TOTP_SECRET,
    naam: "E2E Social-only",
    rol: "gebruiker",
    bevoegdheden: { social: 3 },
  });
  await maakOfUpdateE2eAccount({
    email: E2E_SOC_MKTG_EMAIL,
    wachtwoord: E2E_SOC_MKTG_WACHTWOORD,
    totpSecret: E2E_SOC_MKTG_TOTP_SECRET,
    naam: "E2E Social+Marketing",
    rol: "gebruiker",
    bevoegdheden: { social: 3, marketing: 3 },
  });
}

/** Archiveert de twee social-rechten-testaccounts. */
export async function archiveerE2eSocialRechtenAccounts(): Promise<void> {
  await archiveerAccount(E2E_SOC_ONLY_EMAIL);
  await archiveerAccount(E2E_SOC_MKTG_EMAIL);
}

// Archiveert en deactiveert een vast e2e-account ná een testrun, zodat het
// niet zichtbaar blijft in Gebruikersbeheer en niet kan inloggen buiten een
// test om. De eerstvolgende testrun zet het via de setup-functie (idempotent)
// weer op actief.
async function archiveerAccount(email: string): Promise<void> {
  await db
    .update(gebruikersTable)
    .set({ actief: false, gearchiveerd: true })
    .where(eq(gebruikersTable.email, email));
}

export async function archiveerE2eAccount(): Promise<void> {
  await archiveerAccount(E2E_EMAIL);
}

export async function archiveerE2eWebAccount(): Promise<void> {
  await archiveerAccount(E2E_WEB_EMAIL);
}

export async function archiveerE2eWebAdminAccount(): Promise<void> {
  await archiveerAccount(E2E_WEB_ADMIN_EMAIL);
}

export async function archiveerE2eBedragenAccounts(): Promise<void> {
  await archiveerAccount(E2E_BEDRAGEN1_EMAIL);
  await archiveerAccount(E2E_BEDRAGEN2_EMAIL);
}

// Wacht tot het huidige TOTP-venster voldoende resttijd heeft en geeft dan een
// verse code terug. Voorkomt dat een code verloopt tijdens een trage koude load.
// minResterendeSec=20: bij een cold-start Expo-load is 8 sec te krap; met 20 sec
// buffer is de code zeker nog geldig als het inlogverzoek de server bereikt.
export async function genereerVersTotp(minResterendeSec = 20): Promise<string> {
  return genereerVersTotpVoor(E2E_TOTP_SECRET, minResterendeSec);
}

export async function genereerVersTotpVoor(
  secret: string,
  minResterendeSec = 20,
): Promise<string> {
  const resterend = authenticator.timeRemaining();
  if (resterend < minResterendeSec) {
    await new Promise((r) => setTimeout(r, (resterend + 1) * 1000));
  }
  return authenticator.generate(secret);
}

// Zelfde als genereerVersTotp maar voor het web-account.
export async function genereerVersWebTotp(minResterendeSec = 20): Promise<string> {
  const resterend = authenticator.timeRemaining();
  if (resterend < minResterendeSec) {
    await new Promise((r) => setTimeout(r, (resterend + 1) * 1000));
  }
  return authenticator.generate(E2E_WEB_TOTP_SECRET);
}

// Zelfde als genereerVersTotp maar voor het web-beheerdersaccount.
export async function genereerVersWebAdminTotp(minResterendeSec = 20): Promise<string> {
  const resterend = authenticator.timeRemaining();
  if (resterend < minResterendeSec) {
    await new Promise((r) => setTimeout(r, (resterend + 1) * 1000));
  }
  return authenticator.generate(E2E_WEB_ADMIN_TOTP_SECRET);
}

// Wacht tot het volgende 30s-venster begint. Gebruikt tussen mislukte
// loginpogingen zodat een nieuwe (andere) code wordt gegenereerd.
export async function wachtOpNieuwTotpVenster(): Promise<void> {
  await new Promise((r) => setTimeout(r, (authenticator.timeRemaining() + 1) * 1000));
}

async function main() {
  const id = await setupE2eAccount();
  console.log(`Account gereed: ${E2E_EMAIL} (id ${id})`);
  console.log("");
  console.log("Inloggegevens voor de e2e-test:");
  console.log(`  E-mail:     ${E2E_EMAIL}`);
  console.log(`  Wachtwoord: ${E2E_WACHTWOORD}`);
  console.log(`  TOTP nu:    ${authenticator.generate(E2E_TOTP_SECRET)}`);
}

// Alleen als CLI-script uitvoeren wanneer dit bestand direct wordt aangeroepen,
// zodat importeren (door de Playwright-spec) geen account aanmaakt of het proces
// afsluit.
const isDirect =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirect) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
