// Gedeelde CV-extractie voor onboarding-voorstellen.
//
// Wordt gebruikt door POST /medewerkers/ai-cv-analyse (directe upload) en
// POST /inbox/items/:id/cv-analyse (bestand uit object storage). Conform het
// projectprincipe stelt de AI alleen voor; een mens bevestigt en bewaart —
// deze module maakt nooit zelf een medewerker of gebruiker aan.
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
};

export type CvAnalyseUitkomst =
  | { ok: true; resultaat: CvAnalyseVelden }
  | { ok: false; status: 422 | 500 | 503; fout: string };

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

  if (!tekst.trim() || tekst.trim().length < 50) {
    return { ok: false, status: 422, fout: "Te weinig tekst gevonden in het bestand." };
  }

  if (!heeftGateway()) {
    return { ok: false, status: 503, fout: "AI is niet beschikbaar. Vul de velden handmatig in." };
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

  const cvResultaat = await aiGateway.chat("default", {
    messages: [{ role: "user", content: extractiePrompt }],
    max_tokens: 500,
    response_format: { type: "json_object" },
  });
  if (!cvResultaat.ok) {
    return { ok: false, status: 503, fout: "AI-analyse mislukt. Probeer opnieuw." };
  }

  let ruw: Record<string, unknown> = {};
  try {
    ruw = JSON.parse(cvResultaat.inhoud);
  } catch {
    return { ok: false, status: 500, fout: "AI gaf een ongeldig antwoord. Probeer opnieuw." };
  }

  const alsTekst = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    ok: true,
    resultaat: {
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
    },
  };
}
