// Bewijsscript: verifieert end-to-end (echte login + TOTP) dat de CV-onboardingflow
// via de inbox werkt: upload van een CV → AI classificeert als hr_document/cv →
// POST /inbox/items/:id/cv-analyse geeft een bruikbaar onboardingvoorstel terug.
// Draaien: pnpm --filter @workspace/scripts exec tsx src/verificatie-cv-onboarding.ts [--behoud]
// Met --behoud blijven het inbox-item én het e2e-account actief (voor een
// aansluitende browser-e2e); zonder vlag wordt alles opgeruimd.
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
const BEHOUD = process.argv.includes("--behoud");

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
  postForm(pad: string, form: FormData): Promise<Response> {
    return this.fetch(pad, { method: "POST", body: form });
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
  try {
    return JSON.parse(t) as T;
  } catch {
    return t as unknown as T;
  }
}

function eis(v: boolean, stap: string, detail: string): void {
  if (!v) throw new Error(`FAIL — ${stap}: ${detail}`);
}

const CV_TEKST = `CURRICULUM VITAE

Persoonlijke gegevens
Naam: Erik van der Velde
E-mail: erik.vandervelde.e2e@example.com
Telefoon: 0201234567
Mobiel: 0612345678
Geboortedatum: 12-03-1991
Adres: Dorpsstraat 45
Postcode: 1234 AB
Woonplaats: Amersfoort
Rijbewijs: B

Certificaten
VCA Basis — geldig tot 15-08-2027
BHV — geldig tot 01-02-2027

Werkervaring
2018 - heden: Monteur brandwerende doorvoeringen bij BrandStop BV, Utrecht.
Aanbrengen van brandwerende manchetten, coatings en doorvoeringen in
utiliteitsbouw en zorginstellingen.
2014 - 2018: Allround bouwmedewerker bij Bouwbedrijf Jansen, Amersfoort.

Opleiding
2010 - 2014: MBO Bouwkunde niveau 3, ROC Midden Nederland.

Ik solliciteer naar de functie van monteur brandpreventie.`;

async function main(): Promise<void> {
  console.log(`Verificatie CV-onboardingflow via inbox — doel ${BASIS}${BEHOUD ? " (met --behoud)" : ""}`);

  await setupE2eWebAccount();
  const s = new Sessie();

  const r1 = await s.post("/auth/login", { email: E2E_WEB_EMAIL, wachtwoord: E2E_WEB_WACHTWOORD });
  const b1 = await json(r1);
  eis(r1.status === 200 && b1.status === "verify_2fa", "login", `${r1.status} ${JSON.stringify(b1)}`);
  const code = await genereerVersWebTotp();
  const r2 = await s.post("/auth/2fa/verify", { code });
  const b2 = await json(r2);
  eis(r2.status === 200, "2fa", `${r2.status} ${JSON.stringify(b2)}`);
  console.log(`STAP 1 PASS — ingelogd als ${E2E_WEB_EMAIL} (rol=${b2.rol})`);

  let itemId: number | null = null;
  try {
    const form = new FormData();
    form.append(
      "bestand",
      new File([CV_TEKST], "cv-erik-van-der-velde-e2e.txt", { type: "text/plain" }),
    );
    const r3 = await s.postForm("/inbox/items", form);
    const item = await json<any>(r3);
    eis(r3.status === 201 && typeof item.id === "number", "upload", `${r3.status} ${JSON.stringify(item)}`);
    itemId = item.id;
    eis(
      item.document_categorie === "hr_document",
      "classificatie categorie",
      `verwacht hr_document, kreeg ${item.document_categorie}`,
    );
    eis(
      item.document_subtype === "cv",
      "classificatie subtype",
      `verwacht cv, kreeg ${item.document_subtype}`,
    );
    console.log(`STAP 2 PASS — CV geüpload en geclassificeerd als hr_document/cv (item id=${item.id})`);

    const r4 = await s.post(`/inbox/items/${itemId}/cv-analyse`);
    const voorstel = await json<any>(r4);
    eis(r4.status === 200, "cv-analyse", `${r4.status} ${JSON.stringify(voorstel)}`);
    eis(
      typeof voorstel.naam === "string" && voorstel.naam.toLowerCase().includes("erik"),
      "voorstel naam",
      `naam=${JSON.stringify(voorstel.naam)}`,
    );
    eis(
      voorstel.email === "erik.vandervelde.e2e@example.com",
      "voorstel email",
      `email=${JSON.stringify(voorstel.email)}`,
    );
    const gevuld = ["telefoon", "mobiel", "adres", "postcode", "woonplaats", "rijbewijs"]
      .filter((k) => typeof voorstel[k] === "string" && voorstel[k].length > 0);
    eis(gevuld.length >= 4, "voorstel extra velden", `slechts ${gevuld.length} gevuld: ${gevuld.join(", ")}`);
    console.log(
      `STAP 3 PASS — cv-analyse 200: naam="${voorstel.naam}", email ok, extra velden gevuld: ${gevuld.join(", ")}`,
    );
    console.log(`ITEM_ID=${itemId}`);
  } finally {
    if (!BEHOUD && itemId !== null) {
      const r9 = await s.del(`/inbox/items/${itemId}`);
      eis(r9.status === 204 || r9.status === 200, "opruimen", `${r9.status}`);
      console.log("Opruimen PASS — test-inbox-item verwijderd");
    }
  }

  console.log("ALLE STAPPEN PASS — CV-onboardingflow (upload → classificatie → analyse) werkt end-to-end.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (!BEHOUD) await archiveerE2eWebAccount();
    process.exit(process.exitCode ?? 0);
  });
