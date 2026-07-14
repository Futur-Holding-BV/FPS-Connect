// Gedeelde CV-extractie en onboarding-tekstanalyse voor onboarding-voorstellen.
//
// Wordt gebruikt door POST /medewerkers/ai-cv-analyse (directe upload),
// POST /inbox/items/:id/cv-analyse (bestand uit object storage) en
// POST /medewerkers/ai-onboarding-voorstel (geplakte tekst). Conform het
// projectprincipe stelt de AI alleen voor; een mens bevestigt en bewaart —
// deze module maakt nooit zelf een medewerker of gebruiker aan en stelt
// nooit rechten, rollen of bevoegdheden voor.
import { extraheerPdfTekst } from "./pdfTekst";
import { aiGateway, heeftGateway } from "./aiGateway";

export type CvAnalyseVelden = {
  naam: string | null;
  email: string | null;
  telefoon: string | null;
  mobiel: string | null;
  geboortedatum: string | null;
  adres: string | null;
  postcode: string | null;
  woonplaats: string | null;
  rijbewijs: string | null;
  vca_vervaldatum: string | null;
  bhv_vervaldatum: string | null;
  ehbo_vervaldatum: string | null;
  werkervaring_samenvatting: string | null;
  ai_toelichting: string | null;
  // Onboarding-suggesties (alleen gevuld door analyseerOnboardingTekst). Nooit
  // een rechten/bevoegdheden-voorstel — die volgen uit de gekozen functie.
  functie_suggestie: string | null;
  werkmaatschappij: string | null;
  contracturen_per_week: string | null;
  startdatum: string | null;
  dienstverband: string | null;
};

export type CvAnalyseUitkomst =
  | { ok: true; resultaat: CvAnalyseVelden }
  | { ok: false; status: 422 | 500 | 503; fout: string };

const alsTekst = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/** Vraag de AI-gateway om een JSON-object op basis van een prompt. */
async function vraagAiJson(
  prompt: string,
): Promise<
  | { ok: true; ruw: Record<string, unknown> }
  | { ok: false; status: 500 | 503; fout: string }
> {
  if (!heeftGateway()) {
    return { ok: false, status: 503, fout: "AI is niet beschikbaar. Vul de velden handmatig in." };
  }
  const res = await aiGateway.chat("default", {
    messages: [{ role: "user", content: prompt }],
    max_tokens: 600,
    response_format: { type: "json_object" },
  });
  if (!res.ok) {
    return { ok: false, status: 503, fout: "AI-analyse mislukt. Probeer opnieuw." };
  }
  try {
    return { ok: true, ruw: JSON.parse(res.inhoud) as Record<string, unknown> };
  } catch {
    return { ok: false, status: 500, fout: "AI gaf een ongeldig antwoord. Probeer opnieuw." };
  }
}

/** Bouw een volledig CvAnalyseVelden-object met alle onboarding-velden op null. */
function velddenUitCv(ruw: Record<string, unknown>): CvAnalyseVelden {
  return {
    naam: alsTekst(ruw.naam),
    email: alsTekst(ruw.email),
    telefoon: alsTekst(ruw.telefoon),
    mobiel: alsTekst(ruw.mobiel),
    geboortedatum: alsTekst(ruw.geboortedatum),
    adres: alsTekst(ruw.adres),
    postcode: alsTekst(ruw.postcode),
    woonplaats: alsTekst(ruw.woonplaats),
    rijbewijs: alsTekst(ruw.rijbewijs),
    vca_vervaldatum: alsTekst(ruw.vca_vervaldatum),
    bhv_vervaldatum: alsTekst(ruw.bhv_vervaldatum),
    ehbo_vervaldatum: alsTekst(ruw.ehbo_vervaldatum),
    werkervaring_samenvatting: alsTekst(ruw.werkervaring_samenvatting),
    ai_toelichting: alsTekst(ruw.ai_toelichting),
    functie_suggestie: alsTekst(ruw.functie_suggestie),
    werkmaatschappij: alsTekst(ruw.werkmaatschappij),
    contracturen_per_week: alsTekst(ruw.contracturen_per_week),
    startdatum: alsTekst(ruw.startdatum),
    dienstverband: alsTekst(ruw.dienstverband),
  };
}

/** Analyseer platte CV-tekst en extraheer onboarding-basisvelden (NAW + certificaten). */
export async function analyseerCvTekst(tekst: string): Promise<CvAnalyseUitkomst> {
  if (!tekst.trim() || tekst.trim().length < 50) {
    return { ok: false, status: 422, fout: "Te weinig tekst gevonden in het bestand." };
  }

  const extractiePrompt = `Analyseer het volgende CV en extraheer de gevraagde velden. Antwoord UITSLUITEND met een geldig JSON-object (geen markdown, geen tekst buiten het object).

CV-TEKST:
${tekst.slice(0, 6000)}

Extraheer exact deze velden (gebruik null als iets ontbreekt of onduidelijk is):
{
  "naam": "volledige naam",
  "email": "e-mailadres of null",
  "telefoon": "vast telefoonnummer incl. netnummer of null",
  "mobiel": "mobiel nummer of null",
  "geboortedatum": "YYYY-MM-DD of null",
  "adres": "straatnaam + huisnummer of null",
  "postcode": "Nederlandse postcode (1234 AB formaat) of null",
  "woonplaats": "woonplaats of null",
  "rijbewijs": "rijbewijscategorieën (bijv. B, BE, C) of null",
  "vca_vervaldatum": "VCA vervaldatum YYYY-MM-DD of null",
  "bhv_vervaldatum": "BHV vervaldatum YYYY-MM-DD of null",
  "ehbo_vervaldatum": "EHBO vervaldatum YYYY-MM-DD of null",
  "werkervaring_samenvatting": "max 2 zinnen over werkervaring of null",
  "ai_toelichting": "opmerking over leesbaarheid of null (max 1 zin)"
}`;

  const r = await vraagAiJson(extractiePrompt);
  if (!r.ok) return r;
  return { ok: true, resultaat: velddenUitCv(r.ruw) };
}

/** Extraheer onboarding-velden uit een CV-bestand (PDF of platte tekst). */
export async function analyseerCvBestand(invoer: {
  buffer: Buffer;
  bestandsnaam: string;
  mimetype: string | null;
}): Promise<CvAnalyseUitkomst> {
  let tekst = "";
  const isPdf =
    invoer.mimetype === "application/pdf" ||
    invoer.bestandsnaam.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    try {
      const parsed = await extraheerPdfTekst(invoer.buffer);
      tekst = parsed.tekst ?? "";
    } catch {
      return { ok: false, status: 422, fout: "PDF kon niet worden gelezen. Gebruik een niet-gescand PDF-bestand." };
    }
  } else {
    tekst = invoer.buffer.toString("utf-8");
  }

  return analyseerCvTekst(tekst);
}

/**
 * Analyseer geplakte brontekst (e-mail of arbeidsovereenkomst) en stel
 * onboarding-velden voor, inclusief functie/werkmaatschappij/uren/startdatum
 * die het onboardingformulier verder aansturen (rechten-preview, CAO-voorselectie,
 * verlofopbouw). Stelt nooit rechten of bevoegdheden voor.
 */
export async function analyseerOnboardingTekst(tekst: string): Promise<CvAnalyseUitkomst> {
  if (!tekst.trim() || tekst.trim().length < 30) {
    return {
      ok: false,
      status: 422,
      fout: "Te weinig tekst om een voorstel te doen. Plak een e-mail of arbeidsovereenkomst.",
    };
  }

  const onboardingPrompt = `Je helpt een HR-medewerker bij het onboarden van een nieuwe medewerker. Analyseer de volgende brontekst (bijvoorbeeld een e-mail of arbeidsovereenkomst) en stel onboarding-velden voor. Antwoord UITSLUITEND met een geldig JSON-object (geen markdown, geen tekst buiten het object).

BRONTEKST:
${tekst.slice(0, 6000)}

Werkmaatschappij: kies EXACT een van deze namen of null: "FPS Brandpreventie", "FPS Bouw", "FPS Bouw & Renovatie", "FPS Onderhoud".
Dienstverband: kies een van "vast", "tijdelijk", "oproep", "stage" of null.

Extraheer exact deze velden (gebruik null als iets ontbreekt of onduidelijk is):
{
  "naam": "volledige naam of null",
  "email": "e-mailadres of null",
  "telefoon": "vast telefoonnummer of null",
  "mobiel": "mobiel nummer of null",
  "geboortedatum": "YYYY-MM-DD of null",
  "adres": "straatnaam + huisnummer of null",
  "postcode": "Nederlandse postcode (1234 AB) of null",
  "woonplaats": "woonplaats of null",
  "rijbewijs": "rijbewijscategorieën of null",
  "vca_vervaldatum": "YYYY-MM-DD of null",
  "bhv_vervaldatum": "YYYY-MM-DD of null",
  "ehbo_vervaldatum": "YYYY-MM-DD of null",
  "functie_suggestie": "voorgestelde functienaam (zoals genoemd in de tekst) of null",
  "werkmaatschappij": "exact een van de toegestane namen of null",
  "contracturen_per_week": "aantal uren per week als getal in tekst (bijv. 38) of null",
  "startdatum": "startdatum YYYY-MM-DD of null",
  "dienstverband": "vast, tijdelijk, oproep of stage, of null",
  "werkervaring_samenvatting": "max 2 zinnen of null",
  "ai_toelichting": "1 zin over wat onduidelijk bleef of null"
}

Stel NOOIT rechten, rollen of bevoegdheden voor; die volgen later uit de gekozen functie.`;

  const r = await vraagAiJson(onboardingPrompt);
  if (!r.ok) return r;
  return { ok: true, resultaat: velddenUitCv(r.ruw) };
}
