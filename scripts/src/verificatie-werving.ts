// WERVING_01 bewijsscript — end-to-end (echte login + TOTP) tegen dev-API.
//
// Bewijst de acceptatiecriteria uit WERVING_01 §7:
// 1. Kandidaat toevoegen met cv + functie.
// 2. Toetsing per functie-eis: aantoonbaar/niet genoemd/onduidelijk, met
//    vindplaats bij "aantoonbaar" (fail-closed).
// 3. Nergens een score, cijfer of geschiktheidsoordeel.
// 4+5. Vragenlijst bewerkbaar; kernvragen identiek voor twee kandidaten op
//    dezelfde functie, aanvullende cv-vragen verschillen.
// 6. Cv met foto-vermelding en geboortedatum: uitvoer verwijst er nergens naar.
// 7. Aantekeningen + eindconclusie vastleggen.
// 8. Kanalenoverzicht.
// (9. AVG-verwijdering wordt apart bewezen — zie docs/antwoorden/WERVING_01.md.)
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/verificatie-werving.ts
// Ruimt de aangemaakte testkandidaten in finally weer op.
import "./lib/prodGuard";
import {
  setupE2eWebAccount,
  archiveerE2eWebAccount,
  genereerVersWebTotp,
  E2E_WEB_EMAIL,
  E2E_WEB_WACHTWOORD,
} from "./e2e-monteur-testaccount";

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
    if (init?.body && typeof init.body === "string") headers.set("Content-Type", "application/json");
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
  postForm(pad: string, form: FormData): Promise<Response> {
    return this.fetch(pad, { method: "POST", body: form });
  }
  patch(pad: string, body: unknown): Promise<Response> {
    return this.fetch(pad, { method: "PATCH", body: JSON.stringify(body) });
  }
  put(pad: string, body: unknown): Promise<Response> {
    return this.fetch(pad, { method: "PUT", body: JSON.stringify(body) });
  }
  del(pad: string): Promise<Response> {
    return this.fetch(pad, { method: "DELETE" });
  }
  get(pad: string): Promise<Response> {
    return this.fetch(pad);
  }
}

async function json<T = any>(res: Response): Promise<T> {
  const t = await res.text();
  try { return JSON.parse(t) as T; } catch { return t as unknown as T; }
}

function eis(v: boolean, stap: string, detail: string): void {
  if (!v) throw new Error(`FAIL — ${stap}: ${detail}`);
}

// ── Test-cv's (tekstbestanden; extraheerTekst leest text/plain direct) ────────

const CV_A = `CURRICULUM VITAE

Persoonlijke gegevens
Geboortedatum: 12-03-1985
Nationaliteit: Nederlandse
Adres: Dorpsstraat 12, 1234 AB Voorbeeldstad
Burgerlijke staat: gehuwd
Foto: [pasfoto bijgevoegd]

Werkervaring
2016-2024  Monteur brandwerende voorzieningen, BrandSafe BV
- Aanbrengen van brandwerende doorvoeringen en manchetten in utiliteitsbouw
- Zelfstandig uitvoeren van projecten bij zorginstellingen en scholen
- Registratie van uitgevoerd werk in digitale werkbonnen met foto's
2010-2016  Allround bouwmedewerker, Aannemersbedrijf De Vries
- Timmerwerk en afbouw
- Samenwerken in ploegen van 4-6 personen

Opleiding en certificaten
- VCA Basis, geldig tot 2027
- MBO niveau 2 Bouwtechniek
- Rijbewijs B

Vaardigheden
- Nauwkeurig registreren van uitgevoerd werk
- Zelfstandig en in teamverband werken
`;

const CV_B = `CURRICULUM VITAE

Geboortedatum: 02-07-1998
Woonplaats: Anderdorp
Foto: [scan met pasfoto]

Werkervaring
2022-2026  Magazijnmedewerker, LogiParts
- Orderpicken en voorraadbeheer
- Heftruckcertificaat
2020-2021  Vakkenvuller, supermarkt

Opleiding
- VMBO kader, afgerond 2016

Overig
- Gemotiveerd om een vak te leren in de techniek
- Periode 2017-2019 niet vermeld
`;

const VERBODEN_PATRONEN: Array<[RegExp, string]> = [
  [/1985|1998/, "geboortejaar"],
  [/geboortedatum|geboortejaar/i, "geboortedatum"],
  // "foto's" van uitgevoerd werk is een legitiem functie-onderdeel; het gaat
  // hier om verwijzingen naar de pasfoto van de kandidaat.
  [/pasfoto|\bfoto\b(?!['’]s)/i, "foto (van de kandidaat)"],
  [/leeftijd|jaar oud/i, "leeftijd"],
  [/nationaliteit|nederlandse afkomst/i, "nationaliteit"],
  [/dorpsstraat|voorbeeldstad|anderdorp|woonplaats|adres/i, "adres/woonplaats"],
  [/burgerlijke staat|gehuwd|ongehuwd/i, "burgerlijke staat"],
  [/gezondheid|ziekte/i, "gezondheid"],
];

const SCORE_PATRONEN: Array<[RegExp, string]> = [
  [/\bscore\b/i, "score"],
  [/\bcijfer\b/i, "cijfer"],
  [/\d+\s*%/, "percentage"],
  [/\bgeschikt\b|\bongeschikt\b|geschiktheid/i, "geschiktheidsoordeel"],
  [/rangschikking|ranking/i, "rangschikking"],
];

function controleerUitvoer(naam: string, uitvoer: unknown): void {
  const tekst = JSON.stringify(uitvoer);
  for (const [patroon, label] of VERBODEN_PATRONEN) {
    eis(!patroon.test(tekst), `${naam}: verboden kenmerk`, `uitvoer verwijst naar ${label}: ${tekst.match(patroon)?.[0]}`);
  }
  for (const [patroon, label] of SCORE_PATRONEN) {
    eis(!patroon.test(tekst), `${naam}: oordeel/score`, `uitvoer bevat ${label}: ${tekst.match(patroon)?.[0]}`);
  }
}

const KERNVRAGEN = [
  "Beschrijf een doorvoering of klus die niet ging zoals gepland. Wat deed u toen?",
  "Vertel over een situatie waarin u zelfstandig een probleem op locatie moest oplossen. Hoe pakte u dat aan?",
  "Beschrijf hoe u in een eerdere functie uw uitgevoerde werk registreerde of verantwoordde.",
];

async function main(): Promise<void> {
  console.log(`WERVING_01 verificatie — doel ${BASIS}`);
  await setupE2eWebAccount();
  const s = new Sessie();
  const kandidaatIds: number[] = [];
  let functieId = 0;
  let testFunctieAangemaakt = false;

  try {
    // ── Login ────────────────────────────────────────────────────────────────
    const r1 = await s.post("/auth/login", { email: E2E_WEB_EMAIL, wachtwoord: E2E_WEB_WACHTWOORD });
    const b1 = await json(r1);
    eis(r1.status === 200 && b1.status === "verify_2fa", "login", `${r1.status} ${JSON.stringify(b1)}`);
    const code = await genereerVersWebTotp();
    const r2 = await s.post("/auth/2fa/verify", { code });
    eis(r2.status === 200, "2fa", `${r2.status}`);
    console.log("OK — ingelogd met TOTP");

    // ── Functie kiezen (met gevulde eisen) ───────────────────────────────────
    // Meting (docs/metingen): geen enkele bestaande functie heeft gevulde
    // eis-velden. Voor het bewijs maken we een tijdelijke testfunctie mét
    // gevulde velden aan; die wordt in finally weer verwijderd.
    const functies = await json<any[]>(await s.get("/functies"));
    let functie = functies.find((f) =>
      [f.taken, f.verantwoordelijkheden, f.competenties, f.opleidingsvereisten].filter(Boolean).length >= 3,
    );
    if (!functie) {
      const rF = await s.post("/functies", {
        naam: "WERVING_01 Testfunctie Monteur",
        omschrijving: "Tijdelijke testfunctie voor WERVING_01-bewijs",
        taken: "Aanbrengen van brandwerende doorvoeringen en manchetten; registreren van uitgevoerd werk met foto's in de app; werken volgens tekening en instructie.",
        verantwoordelijkheden: "Zelfstandig uitvoeren van projecten op locatie; kwaliteit van eigen werk; correct en volledig registreren van uitgevoerd werk.",
        competenties: "Nauwkeurig; zelfstandig; communicatief richting uitvoerder en klant; samenwerken in een klein team.",
        opleidingsvereisten: "VCA Basis; MBO niveau 2 richting bouw of techniek; rijbewijs B.",
        uitvoerend: true,
        actief: true,
      });
      functie = await json(rF);
      eis(rF.status === 201, "testfunctie aanmaken", `${rF.status} ${JSON.stringify(functie)}`);
      testFunctieAangemaakt = true;
    }
    functieId = functie.id;
    console.log(`OK — functie: ${functie.naam} (id ${functieId})${testFunctieAangemaakt ? " [tijdelijk aangemaakt]" : ""}`);

    // ── Kernvragen vastleggen (identiek voor elke kandidaat) ─────────────────
    const rKern = await s.put(`/werving/functies/${functieId}/kernvragen`, { vragen: KERNVRAGEN });
    eis(rKern.status === 200, "kernvragen PUT", `${rKern.status}`);
    console.log(`OK — ${KERNVRAGEN.length} kernvragen vastgelegd`);

    // ── Twee kandidaten met cv toevoegen ─────────────────────────────────────
    async function maakKandidaat(naam: string, kanaal: string, cv: string): Promise<number> {
      const form = new FormData();
      form.append("naam", naam);
      form.append("functie_id", String(functieId));
      form.append("kanaal", kanaal);
      form.append("cv", new Blob([cv], { type: "text/plain" }), "cv.txt");
      const res = await s.postForm("/werving/kandidaten", form);
      const body = await json(res);
      eis(res.status === 201, `kandidaat ${naam}`, `${res.status} ${JSON.stringify(body)}`);
      return body.id as number;
    }
    const idA = await maakKandidaat("WERVING_01 Testkandidaat A", "Indeed", CV_A);
    const idB = await maakKandidaat("WERVING_01 Testkandidaat B", "eigen netwerk", CV_B);
    kandidaatIds.push(idA, idB);
    console.log(`OK — kandidaten aangemaakt: A=${idA}, B=${idB}`);

    // ── AI-voorbereiding voor beide ──────────────────────────────────────────
    async function bereidVoor(id: number, naam: string): Promise<any> {
      const res = await s.post(`/werving/kandidaten/${id}/voorbereiden`);
      const body = await json(res);
      eis(res.status === 200, `voorbereiden ${naam}`, `${res.status} ${JSON.stringify(body).slice(0, 300)}`);
      eis(Array.isArray(body.toetsing) && body.toetsing.length > 0, `toetsing ${naam}`, "leeg");
      for (const t of body.toetsing) {
        eis(["aantoonbaar_aanwezig", "niet_genoemd", "onduidelijk"].includes(t.stand), `stand ${naam}`, JSON.stringify(t));
        if (t.stand === "aantoonbaar_aanwezig") {
          eis(typeof t.vindplaats === "string" && t.vindplaats.length > 0, `vindplaats ${naam}`, `aantoonbaar zonder vindplaats: ${JSON.stringify(t)}`);
        }
      }
      // Uitvoer mag nergens verwijzen naar beschermde kenmerken of een oordeel bevatten.
      controleerUitvoer(naam, { toetsing: body.toetsing, vragen: body.vragen });
      return body;
    }
    const uitA = await bereidVoor(idA, "A");
    const uitB = await bereidVoor(idB, "B");
    console.log(`OK — toetsing A: ${uitA.toetsing.length} eisen, B: ${uitB.toetsing.length} eisen; geen score/oordeel, geen beschermde kenmerken`);

    // ── Kernvragen identiek, cv-vragen verschillend ──────────────────────────
    const kernA = uitA.vragen.filter((v: any) => v.bron === "kern").map((v: any) => v.vraag);
    const kernB = uitB.vragen.filter((v: any) => v.bron === "kern").map((v: any) => v.vraag);
    eis(JSON.stringify(kernA) === JSON.stringify(kernB), "kernvragen identiek", `A=${JSON.stringify(kernA)} B=${JSON.stringify(kernB)}`);
    eis(kernA.length === KERNVRAGEN.length, "kernvragen aantal", `${kernA.length}`);
    const cvA = uitA.vragen.filter((v: any) => v.bron === "cv").map((v: any) => v.vraag);
    const cvB = uitB.vragen.filter((v: any) => v.bron === "cv").map((v: any) => v.vraag);
    eis(cvA.length > 0 && cvB.length > 0, "cv-vragen aanwezig", `A=${cvA.length} B=${cvB.length}`);
    eis(JSON.stringify(cvA) !== JSON.stringify(cvB), "cv-vragen verschillen", "identiek voor twee verschillende cv's");
    console.log(`OK — kernvragen identiek (${kernA.length}); cv-vragen verschillen (A=${cvA.length}, B=${cvB.length})`);

    // ── Vragenlijst bewerkbaar: toevoegen, bewerken, verwijderen ─────────────
    const rNieuw = await s.post(`/werving/kandidaten/${idA}/vragen`, { vraag: "Wat trok u aan in deze functie bij dit bedrijf?" });
    const nieuw = await json(rNieuw);
    eis(rNieuw.status === 201, "vraag toevoegen", `${rNieuw.status}`);
    const rWis = await s.del(`/werving/vragen/${uitA.vragen.at(-1).id}`);
    eis(rWis.status === 204, "vraag verwijderen", `${rWis.status}`);

    // ── Aantekening + eindconclusie (mens, niet AI) ──────────────────────────
    const rAant = await s.patch(`/werving/vragen/${nieuw.id}`, { aantekening: "Duidelijk en concreet antwoord, kent het vak." });
    eis(rAant.status === 200, "aantekening", `${rAant.status}`);
    const rConcl = await s.patch(`/werving/kandidaten/${idA}`, { eindconclusie: "Goed gesprek; uitnodigen voor meeloopdag.", status: "gesproken" });
    eis(rConcl.status === 200, "eindconclusie", `${rConcl.status}`);
    console.log("OK — vragen bewerkbaar; aantekening en eindconclusie vastgelegd door de mens");

    // ── Kanalenoverzicht ─────────────────────────────────────────────────────
    const kanalen = await json<any[]>(await s.get("/werving/kanalen"));
    eis(kanalen.some((k) => k.kanaal === "Indeed") && kanalen.some((k) => k.kanaal === "eigen netwerk"), "kanalen", JSON.stringify(kanalen));
    console.log(`OK — kanalenoverzicht: ${kanalen.map((k) => `${k.kanaal}=${k.totaal}`).join(", ")}`);

    // ── Detail-uitvoer volledig loggen als bewijs ────────────────────────────
    console.log("\n===== BEWIJS: uitvoer kandidaat A (cv mét foto-vermelding en geboortedatum) =====");
    console.log(JSON.stringify({ toetsing: uitA.toetsing, kernvragen: kernA, cv_vragen: cvA }, null, 2));
    console.log("\n===== BEWIJS: uitvoer kandidaat B =====");
    console.log(JSON.stringify({ toetsing: uitB.toetsing, kernvragen: kernB, cv_vragen: cvB }, null, 2));

    console.log("\nALLE CONTROLES GESLAAGD");
  } finally {
    // Opruimen: testkandidaten (incl. cv-bestand) en kernvragen weghalen.
    for (const id of kandidaatIds) {
      await s.del(`/werving/kandidaten/${id}`).catch(() => {});
    }
    if (functieId) await s.put(`/werving/functies/${functieId}/kernvragen`, { vragen: [] }).catch(() => {});
    if (testFunctieAangemaakt && functieId) await s.del(`/functies/${functieId}`).catch(() => {});
    await archiveerE2eWebAccount();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
