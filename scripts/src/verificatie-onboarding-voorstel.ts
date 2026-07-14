// Bewijsscript: verifieert end-to-end (echte login + TOTP) dat de nieuwe
// AI-onboardingassistent werkt: geplakte brontekst (e-mail/arbeidsovereenkomst)
// → POST /medewerkers/ai-onboarding-voorstel geeft een bruikbaar voorstel terug
// met de onboarding-sturende velden (functie, werkmaatschappij, uren, startdatum,
// dienstverband). Bewijst tevens dat de functie->rechten-cascade echte data heeft:
// er bestaat minstens een functie met een gekoppeld toegangsprofiel dat
// niet-lege bevoegdheden draagt (fundament voor de rechten-preview).
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/verificatie-onboarding-voorstel.ts
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

// Realistische brontekst: een aanstellingsmail met alle onboarding-sturende gegevens.
const BRON_TEKST = `Beste collega van HR,

Hierbij de gegevens van onze nieuwe medewerker die per 1 september 2026 bij ons start.

Naam: Sander de Boer
E-mailadres: sander.deboer.e2e@example.com
Telefoon: 030 - 123 45 67
Mobiel: 06 12 34 56 78
Geboortedatum: 22 juni 1994
Adres: Kerkstraat 12
Postcode: 3811 AB
Woonplaats: Amersfoort
Rijbewijs: B

Hij komt in dienst bij werkmaatschappij FPS Onderhoud in de functie van onderhoudsmonteur.
Het betreft een vast dienstverband voor 38 uur per week. Startdatum is 1 september 2026.

Met vriendelijke groet,
De afdeling P&O`;

async function main(): Promise<void> {
  console.log(`Verificatie AI-onboardingvoorstel — doel ${BASIS}`);

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

  // STAP 2 — fundament: functie -> toegangsprofiel -> niet-lege bevoegdheden.
  const [rf, rp] = await Promise.all([s.get("/functies"), s.get("/profielen")]);
  const functies = await json<any[]>(rf);
  const profielen = await json<any[]>(rp);
  eis(rf.status === 200 && Array.isArray(functies), "functies ophalen", `${rf.status}`);
  eis(rp.status === 200 && Array.isArray(profielen), "profielen ophalen", `${rp.status}`);
  const profielMet = new Map<number, any>(profielen.map((p) => [p.id, p]));
  const functieMetProfiel = functies.find((f) => {
    if (f.profiel_id == null) return false;
    const prof = profielMet.get(f.profiel_id);
    const bev = prof?.bevoegdheden as Record<string, number> | null | undefined;
    return !!bev && Object.values(bev).some((n) => Number(n) > 0);
  });
  eis(
    !!functieMetProfiel,
    "functie->rechten-cascade",
    "geen enkele functie heeft een gekoppeld profiel met niet-lege bevoegdheden",
  );
  const gekoppeldProfiel = profielMet.get(functieMetProfiel.profiel_id);
  const aantalRechten = Object.values(
    (gekoppeldProfiel.bevoegdheden ?? {}) as Record<string, number>,
  ).filter((n) => Number(n) > 0).length;
  console.log(
    `STAP 2 PASS — functie "${functieMetProfiel.naam}" -> profiel "${gekoppeldProfiel.naam}" met ${aantalRechten} actieve module-rechten (rechten-preview heeft echte data).`,
  );

  // STAP 3 — AI-onboardingvoorstel uit geplakte tekst.
  const r3 = await s.post("/medewerkers/ai-onboarding-voorstel", { tekst: BRON_TEKST });
  const voorstel = await json<any>(r3);
  eis(r3.status === 200, "ai-onboarding-voorstel", `${r3.status} ${JSON.stringify(voorstel)}`);
  eis(
    typeof voorstel.naam === "string" && voorstel.naam.toLowerCase().includes("sander"),
    "voorstel naam",
    `naam=${JSON.stringify(voorstel.naam)}`,
  );
  eis(
    voorstel.email === "sander.deboer.e2e@example.com",
    "voorstel email",
    `email=${JSON.stringify(voorstel.email)}`,
  );
  // Onboarding-sturende velden: minimaal 3 van de 5 moeten correct herkend zijn.
  const sturend: Array<[string, boolean, unknown]> = [
    ["functie_suggestie", typeof voorstel.functie_suggestie === "string" && /monteur/i.test(voorstel.functie_suggestie), voorstel.functie_suggestie],
    ["werkmaatschappij", voorstel.werkmaatschappij === "FPS Onderhoud", voorstel.werkmaatschappij],
    ["contracturen_per_week", String(voorstel.contracturen_per_week ?? "").includes("38"), voorstel.contracturen_per_week],
    ["startdatum", voorstel.startdatum === "2026-09-01", voorstel.startdatum],
    ["dienstverband", voorstel.dienstverband === "vast", voorstel.dienstverband],
  ];
  const goed = sturend.filter(([, ok]) => ok);
  eis(
    goed.length >= 3,
    "voorstel sturende velden",
    `slechts ${goed.length}/5 correct: ${sturend.map(([k, ok, v]) => `${k}=${JSON.stringify(v)}${ok ? "" : "(x)"}`).join(", ")}`,
  );
  console.log(
    `STAP 3 PASS — ai-onboarding-voorstel 200: ${goed.length}/5 sturende velden correct herkend: ${goed.map(([k, , v]) => `${k}=${JSON.stringify(v)}`).join(", ")}`,
  );

  console.log("ALLE STAPPEN PASS — AI-onboardingvoorstel + functie->rechten-cascade werken end-to-end.");
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
