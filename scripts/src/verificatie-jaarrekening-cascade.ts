// Verificatie — Jaarrekening-metadatacorrectie cascadeert naar kerncijfers en
// het meerjarenoverzicht (business-scenario uit productie: een 2023-jaarrekening
// die verkeerd geclassificeerd is als enkelvoudig/verkeerd boekjaar moet na
// correctie onder het juiste jaar in het meerjarenoverzicht verschijnen).
//
// Scenario:
//   1. Seed: document met FOUTE metadata (boekjaar 2022, enkelvoudig) + 2 kerncijfers
//      (gedenormaliseerd met dezelfde foute metadata), via de dev-DB.
//   2. PATCH /financieel/jaarrekeningen/:id → boekjaar 2023, geconsolideerd, entiteit.
//      Bewijs: kerncijfers in DB bewegen mee (boekjaar/geconsolideerd/entiteit).
//   3. PATCH dataset_status=approved → kerncijfers approved.
//   4. GET /financieel/meerjarenoverzicht?geconsolideerd=true → boekjaar 2023 zichtbaar
//      met de gecorrigeerde waarden.
//   5. Cleanup (ook bij falen): document verwijderen (cascade) + e2e-accounts archiveren.
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/verificatie-jaarrekening-cascade.ts
import { eq } from "drizzle-orm";
import { authenticator } from "otplib";

import { db, financieleDocumentenTable, financieleKerncijfersTable } from "@workspace/db";

import {
  E2E_WW_ADMIN_EMAIL,
  E2E_WW_ADMIN_TOTP_SECRET,
  E2E_WW_ADMIN_WACHTWOORD,
  archiveerE2eWachtwoordAccounts,
  setupE2eWachtwoordAccounts,
} from "./e2e-wachtwoord-testaccounts";

const DOMEIN = process.env.REPLIT_DEV_DOMAIN;
if (!DOMEIN) {
  console.error("REPLIT_DEV_DOMAIN ontbreekt — kan niet tegen de dev-omgeving testen.");
  process.exit(1);
}
const BASIS = `https://${DOMEIN}/api`;

class Sessie {
  private cookies = new Map<string, string>();

  async fetch(pad: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    if (init?.body) headers.set("Content-Type", "application/json");
    const cookie = [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookie) headers.set("Cookie", cookie);
    const res = await fetch(`${BASIS}${pad}`, { ...init, headers, redirect: "manual" });
    for (const sc of res.headers.getSetCookie()) {
      const [paar] = sc.split(";");
      const idx = paar.indexOf("=");
      if (idx > 0) {
        const naam = paar.slice(0, idx).trim();
        const waarde = paar.slice(idx + 1).trim();
        if (waarde === "" || /expires=Thu, 01 Jan 1970/i.test(sc)) this.cookies.delete(naam);
        else this.cookies.set(naam, waarde);
      }
    }
    return res;
  }
  post(pad: string, body?: unknown): Promise<Response> {
    return this.fetch(pad, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
  }
  patch(pad: string, body: unknown): Promise<Response> {
    return this.fetch(pad, { method: "PATCH", body: JSON.stringify(body) });
  }
  get(pad: string): Promise<Response> {
    return this.fetch(pad);
  }
}

function faal(stap: string, detail: string): never {
  throw new Error(`FAIL — ${stap}: ${detail}`);
}
function eis(voorwaarde: boolean, stap: string, detail: string): void {
  if (!voorwaarde) faal(stap, detail);
}
async function json<T = any>(res: Response): Promise<T> {
  const tekst = await res.text();
  try {
    return JSON.parse(tekst) as T;
  } catch {
    return tekst as unknown as T;
  }
}
async function versTotp(secret: string, minResterendeSec = 10): Promise<string> {
  const resterend = authenticator.timeRemaining();
  if (resterend < minResterendeSec) {
    await new Promise((r) => setTimeout(r, (resterend + 1) * 1000));
  }
  return authenticator.generate(secret);
}

const ENTITEIT_FOUT = "E2E Cascade Entiteit (fout)";
const ENTITEIT_GOED = "E2E Cascade FPS Brandpreventie";

async function main(): Promise<void> {
  let docId: number | null = null;
  try {
    console.log(`Verificatie jaarrekening-cascade — ${new Date().toISOString()} — doel: ${BASIS}`);

    // Voorbereiding: admin-sessie via wachtwoord + TOTP
    const { adminId } = await setupE2eWachtwoordAccounts();
    const admin = new Sessie();
    {
      const r1 = await admin.post("/auth/login", { email: E2E_WW_ADMIN_EMAIL, wachtwoord: E2E_WW_ADMIN_WACHTWOORD });
      const b1 = await json(r1);
      eis(r1.status === 200 && b1.status === "verify_2fa", "login", `gaf ${r1.status} ${JSON.stringify(b1)}`);
      const code = await versTotp(E2E_WW_ADMIN_TOTP_SECRET);
      const r2 = await admin.post("/auth/2fa/verify", { code });
      const b2 = await json(r2);
      eis(r2.status === 200 && b2.rol === "hoofdbeheerder", "2fa", `gaf ${r2.status} ${JSON.stringify(b2)}`);
      console.log(`Stap 0: admin (id ${adminId}) ingelogd als hoofdbeheerder`);
    }

    // Stap 1: seed document met FOUTE metadata + kerncijfers
    {
      const [doc] = await db
        .insert(financieleDocumentenTable)
        .values({
          bestandsnaam: "E2E FPS 2023 Geconsolideeerd-def.pdf",
          titel: "E2E Cascade Testjaarrekening",
          bestandspad: "/e2e/niet-bestaand.pdf",
          mimetype: "application/pdf",
          entiteit: ENTITEIT_FOUT,
          boekjaar: 2022,
          subtype: "enkelvoudig",
          opslaglocatie: "Financieel → Jaarrekeningen → 2022",
          extractieStatus: "voltooid",
          datasetStatus: "proposed",
        })
        .returning();
      docId = doc.id;
      await db.insert(financieleKerncijfersTable).values([
        {
          documentId: docId,
          entiteit: ENTITEIT_FOUT,
          boekjaar: 2022,
          geconsolideerd: false,
          sleutel: "omzet",
          label: "Netto-omzet",
          waarde: "1500000",
          eenheid: "euro",
          status: "proposed",
        },
        {
          documentId: docId,
          entiteit: ENTITEIT_FOUT,
          boekjaar: 2022,
          geconsolideerd: false,
          sleutel: "resultaat_na_belasting",
          label: "Resultaat na belasting",
          waarde: "250000",
          eenheid: "euro",
          status: "proposed",
        },
      ]);
      console.log(`Stap 1: document ${docId} geseed met foute metadata (2022/enkelvoudig) + 2 kerncijfers`);
    }

    // Stap 2: metadata corrigeren via de API → cascade naar kerncijfers
    {
      const r = await admin.patch(`/financieel/jaarrekeningen/${docId}`, {
        boekjaar: 2023,
        subtype: "geconsolideerd",
        entiteit: ENTITEIT_GOED,
      });
      const b = await json(r);
      eis(r.status === 200, "patch-metadata", `gaf ${r.status} ${JSON.stringify(b)}`);
      eis(b.boekjaar === 2023 && b.subtype === "geconsolideerd", "patch-metadata", `document niet bijgewerkt: ${JSON.stringify(b)}`);
      const cijfers = await db
        .select()
        .from(financieleKerncijfersTable)
        .where(eq(financieleKerncijfersTable.documentId, docId!));
      eis(cijfers.length === 2, "cascade-db", `verwacht 2 kerncijfers, kreeg ${cijfers.length}`);
      for (const c of cijfers) {
        eis(
          c.boekjaar === 2023 && c.geconsolideerd === true && c.entiteit === ENTITEIT_GOED,
          "cascade-db",
          `kerncijfer ${c.sleutel} niet meebewogen: boekjaar=${c.boekjaar}, geconsolideerd=${c.geconsolideerd}, entiteit=${c.entiteit}`,
        );
      }
      console.log("Stap 2: PATCH metadata → 200; DB-bewijs: beide kerncijfers nu boekjaar=2023, geconsolideerd=true, entiteit gecorrigeerd");
    }

    // Stap 3: dataset goedkeuren
    {
      const r = await admin.patch(`/financieel/jaarrekeningen/${docId}`, { dataset_status: "approved" });
      const b = await json(r);
      eis(r.status === 200 && b.dataset_status === "approved", "goedkeuren", `gaf ${r.status} ${JSON.stringify(b)}`);
      console.log("Stap 3: dataset goedgekeurd (kerncijfers → approved)");
    }

    // Stap 4: meerjarenoverzicht toont 2023 met de gecorrigeerde cijfers
    {
      const r = await admin.get(`/financieel/meerjarenoverzicht?geconsolideerd=true&entiteit=${encodeURIComponent(ENTITEIT_GOED)}`);
      const b = await json(r);
      eis(r.status === 200, "meerjarenoverzicht", `gaf ${r.status} ${JSON.stringify(b)}`);
      const boekjaren: number[] = b.boekjaren ?? [];
      eis(boekjaren.includes(2023), "meerjarenoverzicht", `boekjaar 2023 ontbreekt: ${JSON.stringify(boekjaren)}`);
      const omzetRij = (b.rijen ?? []).find((rij: any) => rij.sleutel === "omzet");
      eis(!!omzetRij, "meerjarenoverzicht", "omzet-rij ontbreekt");
      eis(
        Number(omzetRij.waarden?.["2023"]) === 1500000,
        "meerjarenoverzicht",
        `omzet 2023 verwacht 1500000, kreeg ${JSON.stringify(omzetRij.waarden)}`,
      );
      console.log("Stap 4: meerjarenoverzicht (geconsolideerd) toont boekjaar 2023 met omzet 1.500.000 — cascade end-to-end bewezen");
    }

    console.log("RESULTAAT: PASS — metadatacorrectie plaatst de jaarrekening en haar cijfers onder het juiste jaar in het meerjarenoverzicht.");
  } finally {
    if (docId != null) {
      await db.delete(financieleDocumentenTable).where(eq(financieleDocumentenTable.id, docId));
      console.log(`Cleanup: testdocument ${docId} verwijderd (kerncijfers via cascade)`);
    }
    await archiveerE2eWachtwoordAccounts();
    console.log("Cleanup: e2e-accounts gearchiveerd");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
