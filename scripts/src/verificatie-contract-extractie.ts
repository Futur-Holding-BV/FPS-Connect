// Bewijsscript: gerichte arbeidscontract-extractie end-to-end (echte login + TOTP).
//
// Bewijst het volledige businessscenario:
//  1. Gescand/tekst-arbeidscontract in het personeelsdossier →
//     POST /medewerkers/:id/ai-contract-analyse geeft gerichte velden terug,
//     elk mét vindplaats (pagina + citaat); velden zonder vindplaats zijn leeg
//     (fail-closed).
//  2. POST /medewerkers/:id/contract-overnemen (één handeling, expliciet) →
//     arbeidsovereenkomst-rij met contracttype + einddatum, waarna de bestaande
//     contractbewaking direct een verloopsignalering aanmaakt (einddatum <60 dgn).
//  3. Slim upload herkent hetzelfde contract als personeelsdocument en stelt de
//     juiste medewerker + documenttype voor (medewerker_voorstel/document_type_voorstel).
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/verificatie-contract-extractie.ts
import {
  setupE2eWebAccount,
  archiveerE2eWebAccount,
  genereerVersWebTotp,
  E2E_WEB_EMAIL,
  E2E_WEB_WACHTWOORD,
} from "./e2e-monteur-testaccount";
import { db, medewerkersTable, arbeidsovereenkomstenTable, medewerkerDocumentenTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const DOMEIN = process.env.REPLIT_DEV_DOMAIN;
if (!DOMEIN) {
  console.error("REPLIT_DEV_DOMAIN ontbreekt.");
  process.exit(1);
}
const BASIS = `https://${DOMEIN}/api`;

class Sessie {
  private cookies = new Map<string, string>();
  async fetch(pad: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    if (typeof init?.body === "string") headers.set("Content-Type", "application/json");
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
  get(pad: string): Promise<Response> {
    return this.fetch(pad);
  }
}

async function json<T = any>(res: Response): Promise<T> {
  const t = await res.text();
  try {
    return JSON.parse(t) as T;
  } catch {
    return t as unknown as T;
  }
}

function eis(v: boolean, stap: string, detail: string): void {
  if (!v) throw new Error(`FAIL — ${stap}: ${detail}`);
}

// ── Synthetisch arbeidscontract als PDF met tekstlaag (pdfkit) ───────────────

const MEDEWERKER_NAAM = `Casper Contractproef E2E ${Date.now()}`;
const START_DATUM = "2026-03-01";
// Einddatum binnen 60 dagen vanaf vandaag zodat de contractbewaking direct aanslaat.
const EIND_DATUM = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 45);
  return d.toISOString().slice(0, 10);
})();

async function bouwContractPdf(): Promise<Buffer> {
  const mod: any = await import(
    "/home/runner/workspace/artifacts/api-server/node_modules/pdfkit/js/pdfkit.es.js"
  );
  const PDFDocument: any = mod.default ?? mod;
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const klaar = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  doc.fontSize(16).text("ARBEIDSOVEREENKOMST VOOR BEPAALDE TIJD", { align: "center" });
  doc.moveDown();
  doc.fontSize(11).text(
    `De ondergetekenden:\n\n` +
      `1. FPS Onderhoud B.V., gevestigd te Utrecht, hierna te noemen "werkgever",\n` +
      `2. ${MEDEWERKER_NAAM}, wonende te Amersfoort, hierna te noemen "werknemer",\n\n` +
      `komen het volgende overeen:\n\n` +
      `Artikel 1 — Indiensttreding en functie\n` +
      `De werknemer treedt op ${START_DATUM} in dienst van de werkgever in de functie van Servicemonteur Brandpreventie.\n\n` +
      `Artikel 2 — Duur van de overeenkomst\n` +
      `Deze arbeidsovereenkomst wordt aangegaan voor bepaalde tijd en eindigt van rechtswege op ${EIND_DATUM}.\n\n` +
      `Artikel 3 — Proeftijd\n` +
      `Er geldt een proeftijd van 1 maand.\n\n` +
      `Artikel 4 — Arbeidsduur\n` +
      `De arbeidsduur bedraagt 38 uur per week.\n\n` +
      `Artikel 5 — Salaris\n` +
      `Het brutosalaris bedraagt EUR 3450 per maand, exclusief 8% vakantietoeslag.\n\n` +
      `Artikel 6 — CAO\n` +
      `Op deze arbeidsovereenkomst is de CAO Metaal en Techniek van toepassing.\n\n` +
      `Artikel 7 — Opzegging en aanzegging\n` +
      `Voor de werknemer geldt een opzegtermijn van 1 maand; voor de werkgever geldt een opzegtermijn van 2 maanden. ` +
      `De werkgever hanteert een aanzegtermijn van 1 maand voor het einde van de overeenkomst.\n\n` +
      `Artikel 8 — Reiskosten\n` +
      `De werknemer ontvangt een reiskostenvergoeding van EUR 0,23 per kilometer.\n\n` +
      `Artikel 9 — Concurrentie- en relatiebeding\n` +
      `Het is de werknemer niet toegestaan binnen 12 maanden na einde dienstverband werkzaam te zijn bij een directe concurrent (concurrentiebeding). ` +
      `Tevens geldt een relatiebeding van 12 maanden ten aanzien van relaties van de werkgever.`,
  );
  doc.end();
  return klaar;
}

async function main(): Promise<void> {
  await setupE2eWebAccount();
  const s = new Sessie();

  // STAP 1 — login + 2FA
  const r1 = await s.post("/auth/login", { email: E2E_WEB_EMAIL, wachtwoord: E2E_WEB_WACHTWOORD });
  const b1 = await json(r1);
  eis(r1.status === 200 && b1.status === "verify_2fa", "login", `${r1.status} ${JSON.stringify(b1)}`);
  const code = await genereerVersWebTotp();
  const r2 = await s.post("/auth/2fa/verify", { code });
  eis(r2.status === 200, "2fa", `${r2.status}`);
  console.log(`STAP 1 PASS — ingelogd als ${E2E_WEB_EMAIL}`);

  // Testmedewerker direct via DB (medewerkerprofielen lopen normaliter via
  // onboarding; voor dit bewijs is alleen de rij nodig). Cleanup onderaan.
  const [mw] = await db
    .insert(medewerkersTable)
    .values({ naam: MEDEWERKER_NAAM, werkmaatschappij: "FPS Onderhoud", dienstverband: "tijdelijk" })
    .returning({ id: medewerkersTable.id });
  const medewerkerId = mw.id;

  try {
    const pdf = await bouwContractPdf();
    console.log(`Contract-PDF gebouwd (${pdf.length} bytes), medewerker #${medewerkerId}`);

    // STAP 2 — upload arbeidscontract in personeelsdossier
    const form = new FormData();
    form.append("bestand", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), "arbeidsovereenkomst-e2e.pdf");
    form.append("type", "arbeidscontract");
    const rUp = await s.fetch(`/medewerkers/${medewerkerId}/documenten`, { method: "POST", body: form as any });
    const doc = await json<any>(rUp);
    eis(rUp.status === 201, "document upload", `${rUp.status} ${JSON.stringify(doc)}`);
    console.log(`STAP 2 PASS — contractdocument #${doc.id} geüpload`);

    // STAP 3 — gerichte extractie met vindplaats per veld
    const rAn = await s.post(`/medewerkers/${medewerkerId}/ai-contract-analyse`);
    const an = await json<any>(rAn);
    eis(rAn.status === 200, "ai-contract-analyse", `${rAn.status} ${JSON.stringify(an)}`);
    const velden = an.velden ?? {};
    const checks: Array<[string, (v: any) => boolean]> = [
      ["werknemer_naam", (v) => typeof v === "string" && v.toLowerCase().includes("casper")],
      ["contract_type", (v) => v === "bepaalde_tijd"],
      ["datum_in_dienst", (v) => v === START_DATUM],
      ["einddatum", (v) => v === EIND_DATUM],
      ["salaris", (v) => Number(v) === 3450],
      ["salaris_eenheid", (v) => v === "maand"],
      ["uren_per_week", (v) => Number(v) === 38],
      ["cao", (v) => typeof v === "string" && /metaal/i.test(v)],
      ["aanzegtermijn", (v) => typeof v === "string" && v.length > 0],
      ["opzegtermijn", (v) => typeof v === "string" && v.length > 0],
      ["reiskostenvergoeding", (v) => typeof v === "string" && v.includes("0,23")],
      ["concurrentiebeding", (v) => v === "ja"],
      ["relatiebeding", (v) => v === "ja"],
      ["proeftijd", (v) => typeof v === "string" && /1\s*maand/i.test(v)],
    ];
    const geslaagd: string[] = [];
    const mislukt: string[] = [];
    for (const [naam, test] of checks) {
      const veld = velden[naam] ?? {};
      const ok = test(veld.waarde) && !!veld.vindplaats?.citaat;
      (ok ? geslaagd : mislukt).push(`${naam}=${JSON.stringify(veld.waarde)}${veld.vindplaats ? "" : "(geen vindplaats)"}`);
    }
    // Fail-closed-invariant: GEEN enkel veld mag een waarde zonder vindplaats dragen.
    for (const naam of Object.keys(velden)) {
      const veld = velden[naam];
      eis(!(veld?.waarde != null && !veld?.vindplaats), "fail-closed", `${naam} heeft waarde zonder vindplaats`);
    }
    eis(
      geslaagd.length >= 11,
      "extractievelden",
      `slechts ${geslaagd.length}/${checks.length} correct — mislukt: ${mislukt.join(", ")}`,
    );
    console.log(`STAP 3 PASS — ${geslaagd.length}/${checks.length} velden correct mét vindplaats (fail-closed intact). Mislukt: ${mislukt.join(", ") || "geen"}`);

    // STAP 4 — overnemen in dossier → arbeidsovereenkomst + bewaking
    const payloadVelden: Record<string, unknown> = {};
    for (const [naam, veld] of Object.entries<any>(velden)) payloadVelden[naam] = veld?.waarde ?? null;
    const rOv = await s.post(`/medewerkers/${medewerkerId}/contract-overnemen`, {
      velden: payloadVelden,
      document_id: doc.id,
    });
    const ov = await json<any>(rOv);
    eis(rOv.status === 201, "contract-overnemen", `${rOv.status} ${JSON.stringify(ov)}`);
    eis(ov.eind_datum === EIND_DATUM && ov.bewaking_actief === true, "overname-inhoud", JSON.stringify(ov));

    const rLijst = await s.get(`/contract-bewaking/medewerkers/${medewerkerId}`);
    const lijst = await json<any[]>(rLijst);
    eis(rLijst.status === 200 && lijst.length === 1, "contractlijst", `${rLijst.status} n=${lijst?.length}`);
    const c = lijst[0];
    eis(c.contracttype === "bepaalde_tijd" && c.eind_datum === EIND_DATUM, "contractrij", JSON.stringify(c));
    eis(c.aanzegtermijn != null && c.reiskostenvergoeding != null && c.concurrentiebeding === true, "nieuwe kolommen", JSON.stringify({ aanzeg: c.aanzegtermijn, reis: c.reiskostenvergoeding, conc: c.concurrentiebeding }));
    const rSig = await s.get(`/contract-bewaking/${c.id}/signaleringen`);
    const sigs = await json<any[]>(rSig);
    eis(rSig.status === 200 && Array.isArray(sigs) && sigs.length > 0, "bewakingssignalering", `${rSig.status} n=${Array.isArray(sigs) ? sigs.length : "?"} (einddatum over 45 dgn hoort een verloopsignaal te geven)`);
    console.log(`STAP 4 PASS — contract #${c.id} overgenomen; bewaking gaf ${sigs.length} signalering(en): ${sigs.map((x: any) => x.type).join(", ")}`);

    // STAP 5 — slim upload stelt medewerker + documenttype voor
    const formSlim = new FormData();
    formSlim.append("bestanden", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), "arbeidsovereenkomst-e2e.pdf");
    const rSlim = await s.fetch(`/slim-upload/analyseer`, { method: "POST", body: formSlim as any });
    const slim = await json<any>(rSlim);
    eis(rSlim.status === 200, "slim-upload analyse", `${rSlim.status} ${JSON.stringify(slim)}`);
    const sug = (slim.resultaten ?? slim)[0] ?? slim;
    eis(sug.categorie === "personeelsdocument", "slim-upload categorie", JSON.stringify({ categorie: sug.categorie, subtype: sug.subtype }));
    eis(sug.document_type_voorstel === "arbeidscontract", "documenttype-voorstel", JSON.stringify(sug.document_type_voorstel));
    eis(sug.medewerker_voorstel?.id === medewerkerId, "medewerker-voorstel", JSON.stringify(sug.medewerker_voorstel));
    console.log(`STAP 5 PASS — slim upload stelt medewerker #${sug.medewerker_voorstel.id} (${sug.medewerker_voorstel.naam}) + type "${sug.document_type_voorstel}" voor`);

    console.log("ALLE STAPPEN PASS — gerichte contractextractie, overname mét bewaking en slim-upload-voorstellen werken end-to-end.");
  } finally {
    // Cleanup via DB (governance blokkeert kritieke API-deletes voor e2e).
    await db.delete(arbeidsovereenkomstenTable).where(eq(arbeidsovereenkomstenTable.medewerkerId, medewerkerId));
    await db.delete(medewerkerDocumentenTable).where(eq(medewerkerDocumentenTable.medewerkerId, medewerkerId));
    await db.delete(medewerkersTable).where(eq(medewerkersTable.id, medewerkerId));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await archiveerE2eWebAccount();
    process.exit(process.exitCode ?? 0);
  });
