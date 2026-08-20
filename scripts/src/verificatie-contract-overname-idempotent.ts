// Bewijst dat AI-contractovername een bestaand onboardingcontract bijwerkt en
// bij herhalen of dubbelklikken geen tweede arbeidsovereenkomst aanmaakt.
//
// Draaien:
// pnpm --filter @workspace/scripts exec tsx src/verificatie-contract-overname-idempotent.ts
import "./lib/prodGuard";
import {
  setupE2eWebAccount,
  archiveerE2eWebAccount,
  genereerVersWebTotp,
  E2E_WEB_EMAIL,
  E2E_WEB_WACHTWOORD,
} from "./e2e-monteur-testaccount";
import {
  db,
  medewerkersTable,
  arbeidsovereenkomstenTable,
  medewerkerDocumentenTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const DOMEIN = process.env.REPLIT_DEV_DOMAIN;
if (!DOMEIN) throw new Error("REPLIT_DEV_DOMAIN ontbreekt.");
const BASIS = `https://${DOMEIN}/api`;

class Sessie {
  private cookies = new Map<string, string>();

  async fetch(pad: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    if (typeof init?.body === "string") headers.set("Content-Type", "application/json");
    const cookie = [...this.cookies.entries()].map(([naam, waarde]) => `${naam}=${waarde}`).join("; ");
    if (cookie) headers.set("Cookie", cookie);

    const res = await fetch(`${BASIS}${pad}`, { ...init, headers, redirect: "manual" });
    for (const setCookie of res.headers.getSetCookie()) {
      const [paar] = setCookie.split(";");
      const scheiding = paar.indexOf("=");
      if (scheiding <= 0) continue;
      const naam = paar.slice(0, scheiding).trim();
      const waarde = paar.slice(scheiding + 1).trim();
      if (waarde === "" || /expires=Thu, 01 Jan 1970/i.test(setCookie)) this.cookies.delete(naam);
      else this.cookies.set(naam, waarde);
    }
    return res;
  }

  post(pad: string, body: unknown): Promise<Response> {
    return this.fetch(pad, { method: "POST", body: JSON.stringify(body) });
  }
}

async function leesJson<T>(res: Response): Promise<T> {
  const tekst = await res.text();
  try {
    return JSON.parse(tekst) as T;
  } catch {
    throw new Error(`Geen JSON ontvangen (${res.status}): ${tekst}`);
  }
}

function eis(voorwaarde: boolean, omschrijving: string): void {
  if (!voorwaarde) throw new Error(`FAIL — ${omschrijving}`);
}

async function main(): Promise<void> {
  await setupE2eWebAccount();
  const sessie = new Sessie();

  const login = await sessie.post("/auth/login", {
    email: E2E_WEB_EMAIL,
    wachtwoord: E2E_WEB_WACHTWOORD,
  });
  const loginBody = await leesJson<{ status?: string }>(login);
  eis(login.status === 200 && loginBody.status === "verify_2fa", `login: ${login.status}`);

  const code = await genereerVersWebTotp();
  const tweeFactor = await sessie.post("/auth/2fa/verify", { code });
  eis(tweeFactor.status === 200, `2FA: ${tweeFactor.status}`);

  const uniekeNaam = `Contractovername proef ${Date.now()}`;
  const [medewerker] = await db
    .insert(medewerkersTable)
    .values({
      naam: uniekeNaam,
      werkmaatschappij: "FPS Onderhoud",
      dienstverband: "vast",
      inDienstSinds: "2026-01-01",
    })
    .returning({ id: medewerkersTable.id });
  let conflictMedewerkerId: number | null = null;

  try {
    const [basiscontract] = await db
      .insert(arbeidsovereenkomstenTable)
      .values({
        medewerkerId: medewerker.id,
        contracttype: "oproep",
        startDatum: "2026-01-01",
        eindDatum: "2026-12-31",
        cao: "Bestaande CAO",
        aanzegtermijn: "Bestaande aanzegtermijn",
        status: "concept",
        notities: "Aangemaakt via onboarding.",
      })
      .returning({ id: arbeidsovereenkomstenTable.id });

    const [document] = await db
      .insert(medewerkerDocumentenTable)
      .values({
        medewerkerId: medewerker.id,
        type: "contract",
        bestandsnaam: "synthetisch-arbeidscontract.pdf",
        objectPath: `/objects/verificatie-contract-overname/${medewerker.id}.pdf`,
        contentType: "application/pdf",
      })
      .returning({ id: medewerkerDocumentenTable.id });

    const velden = {
      contract_type: "oproep",
      // Bewust anders dan de onboardingdatum: de beperkte onboarding-fallback
      // moet nog steeds dezelfde contractrij verrijken.
      datum_in_dienst: "2026-02-01",
      einddatum: null,
      cao: null,
      aanzegtermijn: null,
      proeftijd: "1 maand",
      salaris: "3450",
      salaris_eenheid: "maand",
      uren_per_week: "38",
      opzegtermijn: "1 maand voor werknemer; 2 maanden voor werkgever",
      reiskostenvergoeding: "€ 0,23 per kilometer",
      concurrentiebeding: "ja",
      relatiebeding: "ja",
    };

    const resultaten = await Promise.all([
      sessie.post(`/medewerkers/${medewerker.id}/contract-overnemen`, {
        velden,
        document_id: document.id,
      }),
      sessie.post(`/medewerkers/${medewerker.id}/contract-overnemen`, {
        velden,
        document_id: document.id,
      }),
    ]);
    const antwoorden = await Promise.all(
      resultaten.map((res) =>
        leesJson<{ id?: number; bijgewerkt?: boolean; error?: string }>(res),
      ),
    );

    for (const [index, res] of resultaten.entries()) {
      eis(
        res.status === 200 &&
          antwoorden[index].bijgewerkt === true &&
          antwoorden[index].id === basiscontract.id,
        `gelijktijdige overname ${index + 1}: ${res.status} ${JSON.stringify(antwoorden[index])}`,
      );
    }

    let contracten = await db
      .select()
      .from(arbeidsovereenkomstenTable)
      .where(eq(arbeidsovereenkomstenTable.medewerkerId, medewerker.id));
    eis(contracten.length === 1, `na dubbelklik bestaan ${contracten.length} contracten`);
    eis(contracten[0].id === basiscontract.id, "het onboardingcontract is niet hergebruikt");
    eis(contracten[0].startDatum === "2026-02-01", "de bevestigde startdatum is niet bijgewerkt");
    eis(contracten[0].salarisBruto === 3450, "het salaris is niet overgenomen");
    eis(contracten[0].proeftijdDagen === 30, "de proeftijd is niet overgenomen");
    eis(contracten[0].opzegtermijn?.includes("1 maand") === true, "de opzegtermijn is niet overgenomen");
    eis(contracten[0].ingebrachtDocumentId === document.id, "het brondocument is niet gekoppeld");
    eis(contracten[0].eindDatum === "2026-12-31", "een lege AI-einddatum heeft de bestaande einddatum gewist");
    eis(contracten[0].cao === "Bestaande CAO", "een leeg AI-veld heeft de bestaande CAO gewist");
    eis(
      contracten[0].aanzegtermijn === "Bestaande aanzegtermijn",
      "een leeg AI-veld heeft de bestaande aanzegtermijn gewist",
    );
    eis(contracten[0].status === "actief", "het expliciet overgenomen conceptcontract is niet geactiveerd");

    const herhaling = await sessie.post(`/medewerkers/${medewerker.id}/contract-overnemen`, {
      velden: { ...velden, salaris: "3550" },
      document_id: document.id,
    });
    const herhalingBody = await leesJson<{ id?: number; bijgewerkt?: boolean; error?: string }>(herhaling);
    eis(
      herhaling.status === 200 &&
        herhalingBody.bijgewerkt === true &&
        herhalingBody.id === basiscontract.id,
      `herhaalde overname: ${herhaling.status} ${JSON.stringify(herhalingBody)}`,
    );

    contracten = await db
      .select()
      .from(arbeidsovereenkomstenTable)
      .where(eq(arbeidsovereenkomstenTable.medewerkerId, medewerker.id));
    eis(contracten.length === 1, `na herhalen bestaan ${contracten.length} contracten`);
    eis(contracten[0].salarisBruto === 3550, "de herhaalde overname werkte het bestaande contract niet bij");

    // Een contract dat op dezelfde datum al aan een ánder document gekoppeld
    // is, is geen veilige kandidaat. De route moet 409 geven en niets wijzigen.
    const [conflictMedewerker] = await db
      .insert(medewerkersTable)
      .values({
        naam: `Contractovername conflictproef ${Date.now()}`,
        werkmaatschappij: "FPS Onderhoud",
        dienstverband: "vast",
        inDienstSinds: "2026-04-01",
      })
      .returning({ id: medewerkersTable.id });
    conflictMedewerkerId = conflictMedewerker.id;

    const [oudDocument, nieuwDocument] = await db
      .insert(medewerkerDocumentenTable)
      .values([
        {
          medewerkerId: conflictMedewerker.id,
          type: "contract",
          bestandsnaam: "bestaand-contract.pdf",
          objectPath: `/objects/verificatie-contract-overname/${conflictMedewerker.id}-oud.pdf`,
          contentType: "application/pdf",
        },
        {
          medewerkerId: conflictMedewerker.id,
          type: "contract",
          bestandsnaam: "nieuw-contract.pdf",
          objectPath: `/objects/verificatie-contract-overname/${conflictMedewerker.id}-nieuw.pdf`,
          contentType: "application/pdf",
        },
      ])
      .returning({ id: medewerkerDocumentenTable.id });

    const [gekoppeldContract] = await db
      .insert(arbeidsovereenkomstenTable)
      .values({
        medewerkerId: conflictMedewerker.id,
        contracttype: "onbepaalde_tijd",
        startDatum: "2026-04-01",
        salarisBruto: 3200,
        ingebrachtDocumentId: oudDocument.id,
        status: "actief",
      })
      .returning({ id: arbeidsovereenkomstenTable.id });

    const conflict = await sessie.post(`/medewerkers/${conflictMedewerker.id}/contract-overnemen`, {
      velden: {
        contract_type: "onbepaalde_tijd",
        datum_in_dienst: "2026-04-01",
        salaris: "4100",
      },
      document_id: nieuwDocument.id,
    });
    const conflictBody = await leesJson<{ error?: string }>(conflict);
    eis(conflict.status === 409, `ander brondocument gaf geen 409: ${conflict.status} ${JSON.stringify(conflictBody)}`);

    const conflictContracten = await db
      .select()
      .from(arbeidsovereenkomstenTable)
      .where(eq(arbeidsovereenkomstenTable.medewerkerId, conflictMedewerker.id));
    eis(conflictContracten.length === 1, "conflictcontrole wijzigde het aantal contracten");
    eis(conflictContracten[0].id === gekoppeldContract.id, "conflictcontrole verving het bestaande contract");
    eis(conflictContracten[0].ingebrachtDocumentId === oudDocument.id, "conflictcontrole verving het brondocument");
    eis(conflictContracten[0].salarisBruto === 3200, "conflictcontrole overschreef bestaande voorwaarden");

    const documentloosConflict = await sessie.post(`/medewerkers/${conflictMedewerker.id}/contract-overnemen`, {
      velden: {
        contract_type: "onbepaalde_tijd",
        datum_in_dienst: "2026-04-01",
        salaris: "4100",
      },
    });
    const documentloosConflictBody = await leesJson<{ error?: string }>(documentloosConflict);
    eis(
      documentloosConflict.status === 409,
      `documentloze overname op gekoppeld contract gaf geen 409: ${documentloosConflict.status} ${JSON.stringify(documentloosConflictBody)}`,
    );

    const documentloosConflictContracten = await db
      .select()
      .from(arbeidsovereenkomstenTable)
      .where(eq(arbeidsovereenkomstenTable.medewerkerId, conflictMedewerker.id));
    eis(documentloosConflictContracten.length === 1, "documentloze conflictcontrole wijzigde het aantal contracten");
    eis(
      documentloosConflictContracten[0].ingebrachtDocumentId === oudDocument.id,
      "documentloze conflictcontrole verving het brondocument",
    );
    eis(
      documentloosConflictContracten[0].salarisBruto === 3200,
      "documentloze conflictcontrole overschreef bestaande voorwaarden",
    );

    console.log(
      "PASS — onboardingcontract atomair verrijkt; lege AI-velden bewaard; concept geactiveerd; dubbelklik/herhalen bleven op één contract; gekoppeld of documentloos brondocument gaf 409.",
    );
  } finally {
    if (conflictMedewerkerId != null) {
      await db.delete(medewerkersTable).where(eq(medewerkersTable.id, conflictMedewerkerId));
    }
    await db.delete(medewerkersTable).where(eq(medewerkersTable.id, medewerker.id));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await archiveerE2eWebAccount();
    process.exit(process.exitCode ?? 0);
  });