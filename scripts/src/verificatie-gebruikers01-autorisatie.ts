// Gerichte regressieproef GEBRUIKERS_01 v2:
// een account met alleen personeel:2 mag geen hogere functierechten maken of
// via een HRM-functietoewijzing aan zichzelf koppelen.
import "./lib/prodGuard";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { and, eq } from "drizzle-orm";
import {
  db,
  functiesTable,
  gebruikersTable,
  hrmAiVoorstellenTable,
  medewerkerAanstellingenTable,
  medewerkersTable,
  profielenTable,
} from "@workspace/db";

const DOMEIN = process.env.REPLIT_DEV_DOMAIN;
if (!DOMEIN) throw new Error("REPLIT_DEV_DOMAIN ontbreekt.");
const BASIS = `https://${DOMEIN}/api`;

const EMAIL = "e2e-gebruikers01-beperkt@fps.local";
const WACHTWOORD = "E2eGebruikers01!2026";
const TOTP_SECRET = "MZ2WGZLONBUW4ZDF";
const DOEL_EMAIL = "e2e-gebruikers01-doel@fps.local";
const FUNCTIENAAM = `E2E Escalatie ${Date.now()}`;

class Sessie {
  private cookies = new Map<string, string>();

  async fetch(pad: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    if (init?.body) headers.set("Content-Type", "application/json");
    const cookie = [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookie) headers.set("Cookie", cookie);
    const response = await fetch(`${BASIS}${pad}`, {
      ...init,
      headers,
      redirect: "manual",
    });
    for (const setCookie of response.headers.getSetCookie()) {
      const [paar] = setCookie.split(";");
      const index = paar.indexOf("=");
      if (index <= 0) continue;
      const naam = paar.slice(0, index).trim();
      const waarde = paar.slice(index + 1).trim();
      if (!waarde) this.cookies.delete(naam);
      else this.cookies.set(naam, waarde);
    }
    return response;
  }

  post(pad: string, body: unknown): Promise<Response> {
    return this.fetch(pad, { method: "POST", body: JSON.stringify(body) });
  }

  patch(pad: string, body: unknown): Promise<Response> {
    return this.fetch(pad, { method: "PATCH", body: JSON.stringify(body) });
  }

  delete(pad: string): Promise<Response> {
    return this.fetch(pad, { method: "DELETE" });
  }
}

async function json(response: Response): Promise<any> {
  const tekst = await response.text();
  try {
    return JSON.parse(tekst);
  } catch {
    return tekst;
  }
}

function eis(voorwaarde: boolean, stap: string, detail: string): void {
  if (!voorwaarde) throw new Error(`FAIL — ${stap}: ${detail}`);
}

async function zorgVoorBeperktAccount(): Promise<number> {
  const waarden = {
    naam: "E2E GEBRUIKERS_01 Beperkt",
    rol: "gebruiker" as const,
    wachtwoord: await bcrypt.hash(WACHTWOORD, 10),
    totpSecret: TOTP_SECRET,
    tweeFactorIngeschakeld: true,
    actief: true,
    gearchiveerd: false,
    bevoegdheden: { personeel: 2 },
    initialen: "E2E",
  };
  const [bestaand] = await db
    .select({ id: gebruikersTable.id })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.email, EMAIL));
  if (bestaand) {
    await db.delete(medewerkersTable).where(eq(medewerkersTable.gebruikerId, bestaand.id));
    await db.update(gebruikersTable).set(waarden).where(eq(gebruikersTable.id, bestaand.id));
    return bestaand.id;
  }
  const [nieuw] = await db
    .insert(gebruikersTable)
    .values({ ...waarden, email: EMAIL })
    .returning({ id: gebruikersTable.id });
  return nieuw.id;
}

async function login(): Promise<Sessie> {
  const sessie = new Sessie();
  const wachtwoord = await sessie.post("/auth/login", { email: EMAIL, wachtwoord: WACHTWOORD });
  const wachtwoordBody = await json(wachtwoord);
  eis(
    wachtwoord.status === 200 && wachtwoordBody.status === "verify_2fa",
    "login",
    `${wachtwoord.status} ${JSON.stringify(wachtwoordBody)}`,
  );
  const verificatie = await sessie.post("/auth/2fa/verify", {
    code: authenticator.generate(TOTP_SECRET),
  });
  eis(verificatie.status === 200, "2FA", `${verificatie.status} ${JSON.stringify(await json(verificatie))}`);
  return sessie;
}

async function maakHoogRechtenDoel(functieId: number): Promise<{
  gebruikerId: number;
  medewerkerId: number;
  hoofdWisselAanstellingId: number;
  hogeNevenAanstellingId: number;
}> {
  const [oudAccount] = await db
    .select({ id: gebruikersTable.id })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.email, DOEL_EMAIL));
  if (oudAccount) {
    await db.delete(medewerkersTable).where(eq(medewerkersTable.gebruikerId, oudAccount.id));
    await db.delete(gebruikersTable).where(eq(gebruikersTable.id, oudAccount.id));
  }
  const [account] = await db
    .insert(gebruikersTable)
    .values({
      naam: "E2E GEBRUIKERS_01 Hoog Doel",
      email: DOEL_EMAIL,
      wachtwoord: await bcrypt.hash(`onbekend-${Date.now()}`, 4),
      rol: "gebruiker",
      bevoegdheden: {},
      actief: true,
      gearchiveerd: false,
      initialen: "E2E",
    })
    .returning({ id: gebruikersTable.id });
  const [medewerker] = await db
    .insert(medewerkersTable)
    .values({
      naam: "E2E GEBRUIKERS_01 Hoog Doel",
      gebruikerId: account.id,
      functieId,
      werkmaatschappij: "FPS Brandpreventie",
      actief: true,
      inDienstSinds: "2026-01-01",
    })
    .returning({ id: medewerkersTable.id });
  const [hoofd] = await db
    .insert(medewerkerAanstellingenTable)
    .values({
      medewerkerId: medewerker.id,
      werkmaatschappij: "FPS Brandpreventie",
      functieId,
      isHoofd: true,
    })
    .returning({ id: medewerkerAanstellingenTable.id });
  const [hoofdWissel] = await db
    .insert(medewerkerAanstellingenTable)
    .values({
      medewerkerId: medewerker.id,
      werkmaatschappij: "FPS Brandpreventie",
      functieId: null,
      isHoofd: false,
    })
    .returning({ id: medewerkerAanstellingenTable.id });
  const [hogeNeven] = await db
    .insert(medewerkerAanstellingenTable)
    .values({
      medewerkerId: medewerker.id,
      werkmaatschappij: "FPS Brandpreventie",
      functieId,
      isHoofd: false,
    })
    .returning({ id: medewerkerAanstellingenTable.id });
  eis(!!hoofd, "doelfixture", "hoofdaanstelling kon niet worden aangemaakt");
  return {
    gebruikerId: account.id,
    medewerkerId: medewerker.id,
    hoofdWisselAanstellingId: hoofdWissel.id,
    hogeNevenAanstellingId: hogeNeven.id,
  };
}

async function ruimOp(gebruikerId: number | null): Promise<void> {
  if (gebruikerId != null) {
    await db.delete(medewerkersTable).where(eq(medewerkersTable.gebruikerId, gebruikerId));
    await db
      .update(gebruikersTable)
      .set({ actief: false, gearchiveerd: true })
      .where(eq(gebruikersTable.id, gebruikerId));
  }
  const [doelAccount] = await db
    .select({ id: gebruikersTable.id })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.email, DOEL_EMAIL));
  if (doelAccount) {
    await db.delete(medewerkersTable).where(eq(medewerkersTable.gebruikerId, doelAccount.id));
    await db.delete(gebruikersTable).where(eq(gebruikersTable.id, doelAccount.id));
  }
  const [onverwachteFunctie] = await db
    .select({ id: functiesTable.id, profielId: functiesTable.profielId })
    .from(functiesTable)
    .where(eq(functiesTable.naam, FUNCTIENAAM));
  if (onverwachteFunctie) {
    await db.delete(functiesTable).where(eq(functiesTable.id, onverwachteFunctie.id));
    if (onverwachteFunctie.profielId != null) {
      await db
        .delete(profielenTable)
        .where(
          and(
            eq(profielenTable.id, onverwachteFunctie.profielId),
            eq(profielenTable.naam, FUNCTIENAAM),
          ),
        );
    }
  }
}

async function main(): Promise<void> {
  let gebruikerId: number | null = null;
  try {
    gebruikerId = await zorgVoorBeperktAccount();
    const [hogeFunctie] = (
      await db
        .select({
          id: functiesTable.id,
          naam: functiesTable.naam,
          bevoegdheden: profielenTable.bevoegdheden,
        })
        .from(functiesTable)
        .innerJoin(profielenTable, eq(functiesTable.profielId, profielenTable.id))
        .where(eq(functiesTable.actief, true))
    ).filter((functie) => {
      const bevoegdheden =
        (functie.bevoegdheden as Record<string, number> | null) ?? {};
      return Object.entries(bevoegdheden).some(
        ([module, niveau]) =>
          niveau > (module === "personeel" ? 2 : 0),
      );
    });
    eis(
      !!hogeFunctie,
      "testfunctie",
      "geen actieve functie gevonden die meer rechten geeft dan personeel:2",
    );

    const sessie = await login();

    const maak = await sessie.post("/functies-v2", {
      naam: FUNCTIENAAM,
      bevoegdheden: { personeel: 2, gebruikers: 4 },
    });
    const maakBody = await json(maak);
    eis(
      maak.status === 403 && maakBody.code === "FUNCTIE_RECHTEN_ESCALATIE",
      "hogere functierechten maken",
      `${maak.status} ${JSON.stringify(maakBody)}`,
    );
    console.log("STAP 1 PASS — personeel:2 kan geen functie met gebruikers:4 maken (403).");

    const toewijzen = await sessie.post("/medewerkers", {
      naam: "E2E GEBRUIKERS_01 Beperkt",
      gebruiker_id: gebruikerId,
      functie_id: hogeFunctie.id,
    });
    const toewijzenBody = await json(toewijzen);
    eis(
      toewijzen.status === 403 &&
        toewijzenBody.code === "FUNCTIE_RECHTEN_ESCALATIE",
      "hoge functie aan zichzelf toewijzen",
      `${toewijzen.status} ${JSON.stringify(toewijzenBody)}`,
    );
    const medewerker = await db
      .select({ id: medewerkersTable.id })
      .from(medewerkersTable)
      .where(eq(medewerkersTable.gebruikerId, gebruikerId));
    eis(medewerker.length === 0, "fail-closed", "medewerkerprofiel is ondanks 403 aangemaakt");
    console.log(
      `STAP 2 PASS — zelftoewijzing van '${hogeFunctie.naam}' via HRM wordt 403; geen medewerker aangemaakt.`,
    );

    const doel = await maakHoogRechtenDoel(hogeFunctie.id);
    const verwachte403 = async (
      stap: string,
      response: Response,
    ): Promise<void> => {
      const body = await json(response);
      eis(
        response.status === 403 && body.code === "FUNCTIE_RECHTEN_ESCALATIE",
        stap,
        `${response.status} ${JSON.stringify(body)}`,
      );
    };

    await verwachte403(
      "hoge functie verwijderen",
      await sessie.patch(`/medewerkers/${doel.medewerkerId}`, { functie_id: null }),
    );
    await verwachte403(
      "hoog rechtenprofiel naar ander account verplaatsen",
      await sessie.patch(`/medewerkers/${doel.medewerkerId}`, { gebruiker_id: gebruikerId }),
    );
    await verwachte403(
      "hoog rechtenprofiel deactiveren",
      await sessie.patch(`/medewerkers/${doel.medewerkerId}`, { actief: false }),
    );
    await verwachte403(
      "hoog rechtenprofiel via startdatum intrekken",
      await sessie.patch(`/medewerkers/${doel.medewerkerId}`, {
        in_dienst_sinds: "2099-01-01",
      }),
    );
    const vandaag = new Date().toISOString().slice(0, 10);
    await verwachte403(
      "hoog rechtenprofiel via uitdienst-datum intrekken",
      await sessie.patch(`/medewerkers/${doel.medewerkerId}`, {
        uit_dienst_per: vandaag,
      }),
    );
    await verwachte403(
      "hoog rechtenprofiel via offboarding intrekken",
      await sessie.post(`/medewerkers/${doel.medewerkerId}/offboard`, {
        uit_dienst_per: vandaag,
      }),
    );
    await verwachte403(
      "hoog rechtenprofiel via medewerker verwijderen intrekken",
      await sessie.delete(`/medewerkers/${doel.medewerkerId}`),
    );
    await verwachte403(
      "hoge nevenaanstelling wijzigen",
      await sessie.patch(
        `/medewerkers/${doel.medewerkerId}/aanstellingen/${doel.hogeNevenAanstellingId}`,
        { functie_id: null },
      ),
    );
    await verwachte403(
      "hoge nevenaanstelling verwijderen",
      await sessie.delete(
        `/medewerkers/${doel.medewerkerId}/aanstellingen/${doel.hogeNevenAanstellingId}`,
      ),
    );
    await verwachte403(
      "andere hoofdaanstelling kiezen",
      await sessie.post(
        `/medewerkers/${doel.medewerkerId}/aanstellingen/${doel.hoofdWisselAanstellingId}/hoofd`,
        {},
      ),
    );

    await db
      .update(medewerkersTable)
      .set({ inDienstSinds: "2099-01-01" })
      .where(eq(medewerkersTable.id, doel.medewerkerId));
    const [datumVoorstel] = await db
      .insert(hrmAiVoorstellenTable)
      .values({
        medewerkerId: doel.medewerkerId,
        veld: "in_dienst_sinds",
        huidigeWaarde: "2099-01-01",
        voorgesteldeWaarde: "2026-01-01",
        reden: "E2E autorisatiecontrole",
        status: "open",
        modelGebruikt: "e2e",
      })
      .returning({ id: hrmAiVoorstellenTable.id });
    await verwachte403(
      "hoog rechtenprofiel via AI-voorstel activeren",
      await sessie.patch(`/medewerkers/ai-voorstellen/${datumVoorstel.id}`, {
        status: "goedgekeurd",
        correctie_tekst: "2026-01-01",
      }),
    );

    const [ongewijzigd] = await db
      .select({
        gebruikerId: medewerkersTable.gebruikerId,
        functieId: medewerkersTable.functieId,
        actief: medewerkersTable.actief,
        inDienstSinds: medewerkersTable.inDienstSinds,
        uitDienstPer: medewerkersTable.uitDienstPer,
      })
      .from(medewerkersTable)
      .where(eq(medewerkersTable.id, doel.medewerkerId));
    eis(
      ongewijzigd?.gebruikerId === doel.gebruikerId &&
        ongewijzigd.functieId === hogeFunctie.id &&
        ongewijzigd.actief === true &&
        ongewijzigd.inDienstSinds === "2099-01-01" &&
        ongewijzigd.uitDienstPer == null,
      "geen gedeeltelijke HRM-mutatie",
      JSON.stringify(ongewijzigd),
    );
    const [ongewijzigdVoorstel] = await db
      .select({ status: hrmAiVoorstellenTable.status })
      .from(hrmAiVoorstellenTable)
      .where(eq(hrmAiVoorstellenTable.id, datumVoorstel.id));
    eis(
      ongewijzigdVoorstel?.status === "open",
      "AI-voorstel blijft open na 403",
      JSON.stringify(ongewijzigdVoorstel),
    );
    console.log(
      "STAP 3 PASS — vervangen, verplaatsen, (de)activeren, offboarden, verwijderen, hoofd/nevenaanstellingen en AI-indienstdatum geven 403 zonder gedeeltelijke mutatie.",
    );
    console.log("ALLE STAPPEN PASS — alle functiehuis-escalatieroutes server-side gesloten.");
  } finally {
    await ruimOp(gebruikerId);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});