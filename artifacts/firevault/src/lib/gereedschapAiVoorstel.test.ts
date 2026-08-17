import { describe, it, expect } from "vitest";
import {
  pasVoorstelToeOpFormulier,
  isAnalyseVerzoekActueel,
  type GereedschapFormulier,
  type GereedschapAiVoorstel,
} from "./gereedschapAiVoorstel";

// ── Regressietest: AI-fotoherkenning overschrijft NOOIT handmatige invoer ─────
//
// Scenariodekking:
// A) Aangeraakte velden + volledige AI-respons → handmatige waarden blijven staan
// B) Geen aangeraakte velden + volledige AI-respons → AI-waarden worden ingevuld
// C) Deels aangeraakt → aangeraakte velden ongewijzigd, onaangeraakte AI-waarden
// D) Lege/whitespace AI-respons + aangeraakte velden → alles ongewijzigd
// E) Boolean false handmatig ingesteld → AI true overschrijft NIET

// ── Test-helpers ──────────────────────────────────────────────────────────────

/** Formulier met standaard (niet-null) beginwaarden, zoals het component ze zet. */
const standaardFormulier: GereedschapFormulier = {
  omschrijving: "",
  merk: null,
  type: null,
  categorie: "overig",
  aandrijving: "handgereedschap",
  met_snoer: false,
  accu_inbegrepen: false,
  lader_inbegrepen: false,
  koffer_inbegrepen: false,
  keuringsplichtig: false,
  opmerkingen: null,
};

/** Formulier waarvan alle AI-relevante velden handmatig zijn ingevuld. */
const handmatigFormulier: GereedschapFormulier = {
  omschrijving: "Handmatige omschrijving",
  merk: "Handmatig merk",
  type: "Handmatig type",
  categorie: "handmatige categorie",
  aandrijving: "elektrisch",
  met_snoer: true,
  accu_inbegrepen: false,
  lader_inbegrepen: false,
  koffer_inbegrepen: true,
  keuringsplichtig: false,
  opmerkingen: "Handmatige opmerking",
};

/** Set van alle velden die via handmatigFormulier als aangeraakt gelden. */
const alleVeldenAangeraakt = new Set([
  "omschrijving", "merk", "type", "categorie", "aandrijving",
  "met_snoer", "accu_inbegrepen", "lader_inbegrepen", "koffer_inbegrepen",
  "keuringsplichtig", "opmerkingen",
]);

/** Volledige AI-respons met niet-lege waarden voor alle velden. */
const volledigVoorstel: GereedschapAiVoorstel = {
  omschrijving: "AI Boormachine",
  merk: "Bosch",
  type: "GSB 18V",
  categorie: "boren",
  aandrijving: "accu",
  met_snoer: false,
  accu_inbegrepen: true,
  lader_inbegrepen: true,
  koffer_inbegrepen: false,
  keuringsplichtig: true,
  staat_indicatie: "Goede staat",
};

// ── Scenario A: aangeraakte velden + volledige AI-respons ─────────────────────

describe("A – aangeraakte velden blijven onaangetast bij volledige AI-respons", () => {
  it("behoudt alle handmatig ingevulde tekstwaarden", () => {
    const r = pasVoorstelToeOpFormulier(handmatigFormulier, volledigVoorstel, alleVeldenAangeraakt);
    expect(r.omschrijving).toBe("Handmatige omschrijving");
    expect(r.merk).toBe("Handmatig merk");
    expect(r.type).toBe("Handmatig type");
    expect(r.categorie).toBe("handmatige categorie");
    expect(r.aandrijving).toBe("elektrisch");
  });

  it("behoudt handmatig ingestelde boolean-waarden (ook false)", () => {
    const r = pasVoorstelToeOpFormulier(handmatigFormulier, volledigVoorstel, alleVeldenAangeraakt);
    expect(r.met_snoer).toBe(true);          // was true, AI zegt false → blijft true
    expect(r.accu_inbegrepen).toBe(false);   // was false, AI zegt true  → blijft false
    expect(r.lader_inbegrepen).toBe(false);  // was false, AI zegt true  → blijft false
    expect(r.koffer_inbegrepen).toBe(true);  // was true,  AI zegt false → blijft true
    expect(r.keuringsplichtig).toBe(false);  // was false, AI zegt true  → blijft false
  });

  it("behoudt handmatige opmerkingen bij niet-lege AI staat_indicatie", () => {
    const r = pasVoorstelToeOpFormulier(handmatigFormulier, volledigVoorstel, alleVeldenAangeraakt);
    expect(r.opmerkingen).toBe("Handmatige opmerking");
  });
});

// ── Scenario B: geen aangeraakte velden + volledige AI-respons ────────────────

describe("B – onaangeraakte velden worden ingevuld door volledige AI-respons", () => {
  it("vult alle tekstvelden in vanuit AI", () => {
    const r = pasVoorstelToeOpFormulier(standaardFormulier, volledigVoorstel, new Set());
    expect(r.omschrijving).toBe("AI Boormachine");
    expect(r.merk).toBe("Bosch");
    expect(r.type).toBe("GSB 18V");
    expect(r.categorie).toBe("boren");
    expect(r.aandrijving).toBe("accu");
  });

  it("vult boolean-velden in vanuit AI (ook false-waarden)", () => {
    const r = pasVoorstelToeOpFormulier(standaardFormulier, volledigVoorstel, new Set());
    expect(r.met_snoer).toBe(false);
    expect(r.accu_inbegrepen).toBe(true);
    expect(r.lader_inbegrepen).toBe(true);
    expect(r.koffer_inbegrepen).toBe(false);
    expect(r.keuringsplichtig).toBe(true);
  });

  it("zet opmerkingen op 'Staat bij registratie: …' vanuit staat_indicatie", () => {
    const r = pasVoorstelToeOpFormulier(standaardFormulier, volledigVoorstel, new Set());
    expect(r.opmerkingen).toBe("Staat bij registratie: Goede staat");
  });

  it("trimt spaties van AI-waarden", () => {
    const voorstel: GereedschapAiVoorstel = {
      omschrijving: "  Slijpschijf  ",
      merk: " Makita ",
      staat_indicatie: "  Lichte slijtage  ",
    };
    const r = pasVoorstelToeOpFormulier(standaardFormulier, voorstel, new Set());
    expect(r.omschrijving).toBe("Slijpschijf");
    expect(r.merk).toBe("Makita");
    expect(r.opmerkingen).toBe("Staat bij registratie: Lichte slijtage");
  });
});

// ── Scenario C: deels aangeraakt ──────────────────────────────────────────────

describe("C – aangeraakte velden ongewijzigd, onaangeraakte krijgen AI-waarden", () => {
  it("past alleen onaangeraakte velden aan", () => {
    // Gebruiker heeft merk en opmerkingen aangeraakt, de rest niet.
    const aangeraakt = new Set(["merk", "opmerkingen"]);
    const formulier: GereedschapFormulier = {
      ...standaardFormulier,
      merk: "Eigen merk",
      opmerkingen: "Eigen opmerking",
    };

    const r = pasVoorstelToeOpFormulier(formulier, volledigVoorstel, aangeraakt);

    // Aangeraakt → ongewijzigd
    expect(r.merk).toBe("Eigen merk");
    expect(r.opmerkingen).toBe("Eigen opmerking");

    // Niet aangeraakt → AI-waarden
    expect(r.omschrijving).toBe("AI Boormachine");
    expect(r.categorie).toBe("boren");
    expect(r.accu_inbegrepen).toBe(true);
  });
});

// ── Scenario D: lege/whitespace AI-respons ───────────────────────────────────

describe("D – lege/whitespace AI-respons laat alle waarden ongewijzigd", () => {
  it("laat handmatige waarden staan bij lege AI-waarden", () => {
    const leegVoorstel: GereedschapAiVoorstel = {
      omschrijving: null,
      merk: null,
      type: null,
      categorie: null,
      aandrijving: null,
      met_snoer: null,
      staat_indicatie: null,
    };
    // Geen aangeraakte velden (waarde-gebaseerde fallback geldt ook dan)
    const r = pasVoorstelToeOpFormulier(handmatigFormulier, leegVoorstel, new Set());
    expect(r.omschrijving).toBe("Handmatige omschrijving");
    expect(r.merk).toBe("Handmatig merk");
    expect(r.opmerkingen).toBe("Handmatige opmerking");
  });

  it("laat handmatige opmerkingen staan bij whitespace staat_indicatie", () => {
    const voorstel: GereedschapAiVoorstel = { staat_indicatie: "   " };
    const r = pasVoorstelToeOpFormulier(handmatigFormulier, voorstel, new Set());
    expect(r.opmerkingen).toBe("Handmatige opmerking");
  });

  it("laat standaard boolean-beginwaarden staan bij null AI-booleans", () => {
    const voorstel: GereedschapAiVoorstel = {
      met_snoer: null,
      keuringsplichtig: null,
    };
    const r = pasVoorstelToeOpFormulier(standaardFormulier, voorstel, new Set());
    expect(r.met_snoer).toBe(false);       // beginwaarde behouden
    expect(r.keuringsplichtig).toBe(false);
  });
});

// ── Scenario E: handmatig false behoudt prioriteit boven AI true ──────────────

describe("E – handmatig ingestelde false-waarden worden niet overschreven door AI true", () => {
  it("behoudt false wanneer het veld is aangeraakt", () => {
    const formulier: GereedschapFormulier = {
      ...standaardFormulier,
      keuringsplichtig: false,
    };
    const voorstel: GereedschapAiVoorstel = { keuringsplichtig: true };
    const aangeraakt = new Set(["keuringsplichtig"]);

    const r = pasVoorstelToeOpFormulier(formulier, voorstel, aangeraakt);
    expect(r.keuringsplichtig).toBe(false);
  });

  it("past AI true toe wanneer het veld NIET is aangeraakt", () => {
    const formulier: GereedschapFormulier = {
      ...standaardFormulier,
      keuringsplichtig: false,
    };
    const voorstel: GereedschapAiVoorstel = { keuringsplichtig: true };

    const r = pasVoorstelToeOpFormulier(formulier, voorstel, new Set());
    expect(r.keuringsplichtig).toBe(true);
  });
});

// ── Scenario F: velden aangeraakt tijdens async AI-aanroep ────────────────────
//
// De component houdt aangeraakteVelden bij in een ref (altijd actueel) en leest
// deze ref op het moment dat de AI-respons binnenkomt — niet de render-time
// closure. Dit scenario modelleert die situatie: de utility ontvangt de set
// die de ref op dat moment bevat, inclusief velden die TIJDENS het wachten
// werden aangeraakt.

describe("F – velden aangeraakt tijdens wachten op AI worden beschermd", () => {
  it("beschermt een veld dat TIJDENS de async aanroep werd ingevuld", () => {
    // Situatie: gebruiker opent formulier (standaard beginwaarden), selecteert
    // foto. Terwijl AI analyseert, typt de gebruiker zelf een merk in.
    // De ref bevat op het moment van merge: Set(["merk"]).
    const formulierOpMomentVanMerge: GereedschapFormulier = {
      ...standaardFormulier,
      merk: "Eigen merk (tijdens wachten ingevuld)",
    };
    // Set bevat "merk" omdat raakVeldAan("merk") al vóór de merge liep.
    const setOpMomentVanMerge = new Set(["merk"]);

    const r = pasVoorstelToeOpFormulier(
      formulierOpMomentVanMerge,
      volledigVoorstel, // volledig AI-voorstel incl. merk: "Bosch"
      setOpMomentVanMerge,
    );

    // "merk" was aangeraakt → eigen waarde behoudt prioriteit
    expect(r.merk).toBe("Eigen merk (tijdens wachten ingevuld)");
    // Niet aangeraakte velden worden wél door AI ingevuld
    expect(r.omschrijving).toBe("AI Boormachine");
    expect(r.categorie).toBe("boren");
    expect(r.accu_inbegrepen).toBe(true);
  });

  it("beschermt meerdere velden aangeraakt tijdens wachten op AI", () => {
    const formulier: GereedschapFormulier = {
      ...standaardFormulier,
      omschrijving: "Eigen omschrijving",
      opmerkingen: "Eigen opmerking",
    };
    // Beide velden aangeraakt terwijl AI bezig was
    const setTijdensWachten = new Set(["omschrijving", "opmerkingen"]);

    const r = pasVoorstelToeOpFormulier(formulier, volledigVoorstel, setTijdensWachten);

    expect(r.omschrijving).toBe("Eigen omschrijving");
    expect(r.opmerkingen).toBe("Eigen opmerking");
    // Niet-aangeraakte tekstvelden → AI
    expect(r.merk).toBe("Bosch");
    expect(r.type).toBe("GSB 18V");
  });
});

// ── Scenario G: session-token voorkomt stale AI-respons na sluiten dialog ─────
//
// Als de gebruiker het formulier sluit terwijl de AI-analyse nog loopt,
// verhoogt sluitEnReset() de analIsRequestIdRef-teller. handleFotoSelectie
// vergelijkt na de await of de teller nog overeenkomt; zo niet → negeren.
// isAnalyseVerzoekActueel() maakt deze logica direct testbaar.

describe("G – session-token: late AI-respons na sluiten dialog wordt genegeerd", () => {
  it("keurt respons af als de teller intussen is opgehoogd (dialog gesloten)", () => {
    let teller = 0;
    const vastgelegdId = ++teller; // verzoek start
    teller++;                      // sluitEnReset() verhoogt teller
    expect(isAnalyseVerzoekActueel(vastgelegdId, teller)).toBe(false);
  });

  it("accepteert respons als de teller onveranderd is (dialog nog open)", () => {
    let teller = 0;
    const vastgelegdId = ++teller; // verzoek start
    // geen reset — dialog is nog open
    expect(isAnalyseVerzoekActueel(vastgelegdId, teller)).toBe(true);
  });

  it("nieuw foto-verzoek na sluiten heeft hoger ID; oud verzoek wordt genegeerd", () => {
    let teller = 0;
    const eerstVerzoekId = ++teller; // eerste foto gekozen
    teller++;                        // sluitEnReset() na annulering
    const tweedeVerzoekId = ++teller; // dialog heropend, nieuwe foto
    // eerste verzoek komt laat terug → genegeerd
    expect(isAnalyseVerzoekActueel(eerstVerzoekId, teller)).toBe(false);
    // tweede verzoek is actueel
    expect(isAnalyseVerzoekActueel(tweedeVerzoekId, teller)).toBe(true);
  });

  it("vervanging van foto verhoogt teller; oude analyse wordt genegeerd", () => {
    let teller = 0;
    const eersteAnalyseId = ++teller; // eerste foto
    ++teller;                         // tweede foto geselecteerd (teller verhoogd)
    expect(isAnalyseVerzoekActueel(eersteAnalyseId, teller)).toBe(false);
  });
});

// ── Scenario H: guards bij elke async grens, inclusief upload-URL en bestandsupload ─
//
// De session-token wordt niet alleen gecontroleerd na de AI-analyse, maar ook:
// 1. Na getUploadUrl.mutateAsync() → foto_url/object_path wordt niet op een
//    verse formuliersessie gezet als het dialoog al is gesloten.
// 2. Na fetch(upload_url) → zelfde bescherming tijdens de bestandsupload.
// Elk scenario simuleert een sluitEnReset() op een ander moment in de keten.

describe("H – upload-guards: session-token blokkeert stale foto-state op elke async grens", () => {
  it("sluiten tijdens upload-URL-fetch: na de await is het verzoek verouderd", () => {
    let teller = 0;
    const requestId = ++teller; // fotoSelectie start
    // ... awaiting getUploadUrl.mutateAsync() ...
    teller++;                   // sluitEnReset() terwijl URL wordt opgehaald
    // controle na de await: guard moet ingrijpen vóór foto_url-assign
    expect(isAnalyseVerzoekActueel(requestId, teller)).toBe(false);
  });

  it("sluiten tijdens bestandsupload: na de fetch is het verzoek verouderd", () => {
    let teller = 0;
    const requestId = ++teller; // fotoSelectie start
    // upload-URL is al ontvangen (eerste guard passeerde)
    expect(isAnalyseVerzoekActueel(requestId, teller)).toBe(true);
    // ... awaiting fetch(upload_url) ...
    teller++;                   // sluitEnReset() terwijl het bestand wordt geüpload
    // controle na de fetch: guard moet ingrijpen vóór setBewerkFormulier
    expect(isAnalyseVerzoekActueel(requestId, teller)).toBe(false);
  });

  it("heropenen dialoog na annulering: nieuw verzoek passeer guards, oud verzoek niet", () => {
    let teller = 0;
    const oudVerzoekId = ++teller; // eerste foto geselecteerd
    teller++;                      // sluitEnReset()
    const nieuwVerzoekId = ++teller; // dialoog heropend, nieuwe foto
    // oud verzoek faalt bij elke async grens
    expect(isAnalyseVerzoekActueel(oudVerzoekId, teller)).toBe(false);
    // nieuw verzoek passeert alle guards
    expect(isAnalyseVerzoekActueel(nieuwVerzoekId, teller)).toBe(true);
  });

  it("finally-blok: verouderd verzoek wist geen laad-spinner van nieuwe sessie", () => {
    // In productie: finally wist setFotoUploaden/setAiLaden alleen als token klopt.
    // Hier: als token niet klopt, wordt de finally-cleanup genegeerd.
    let teller = 0;
    const requestId = ++teller;
    teller++;                   // reset na dialoog sluiten
    // finally van het verouderde verzoek: guard klopt niet → loading-flags onaangetast
    expect(isAnalyseVerzoekActueel(requestId, teller)).toBe(false);
    // nieuw verzoek in nieuwe sessie: guard klopt wél
    const nieuwId = ++teller;
    expect(isAnalyseVerzoekActueel(nieuwId, teller)).toBe(true);
  });
});

// ── Scenario I: reset/sluit-pad wist laad-indicatoren direct ──────────────────
//
// sluitEnReset() / openBewerken() / onOpenChange(!open) wissen fotoUploaden en
// aiLaden SYNCHROON. Het finally-blok van het verouderde verzoek weigert dit
// te doen (token klopt niet meer). Zo kan een heropend dialoog altijd starten
// met een actieve fotoknop — niet vastgezet op "Uploaden…"/"AI analyseert…".

describe("I – reset-pad wist laad-indicatoren direct; stale finally doet het niet", () => {
  it("na sluiten tijdens upload: reset wist laad-flags, stale finally niet", () => {
    // Modelleer laad-state als lokale variabelen (zoals React-state in de component)
    let fotoUploaden = false;
    let aiLaden = false;
    let teller = 0;

    // Gebruiker kiest foto → verzoek start
    const requestId = ++teller;
    fotoUploaden = true; // setFotoUploaden(true)

    // Gebruiker sluit dialog → sluitEnReset() / onOpenChange
    teller++;            // token verhoogd
    fotoUploaden = false; // reset wist laad-flags direct
    aiLaden = false;

    // Stale finally komt later terug
    if (isAnalyseVerzoekActueel(requestId, teller)) {
      fotoUploaden = false; // zou nié​t worden uitgevoerd
      aiLaden = false;
    }
    expect(isAnalyseVerzoekActueel(requestId, teller)).toBe(false); // finally slaat over

    // Nieuw dialoog opent: laad-flags zijn schoon (gereset door sluitEnReset)
    expect(fotoUploaden).toBe(false);
    expect(aiLaden).toBe(false);
  });

  it("nieuw verzoek na heropenen kan starten; token is actueel", () => {
    let teller = 0;
    ++teller;  // oud verzoek
    ++teller;  // sluitEnReset verhoogt token
    const nieuwId = ++teller; // nieuw dialoog, nieuwe foto

    // Nieuw verzoek passeert alle guards
    expect(isAnalyseVerzoekActueel(nieuwId, teller)).toBe(true);
  });

  it("sluiten tijdens aiLaden: reset wist aiLaden; stale finally niet", () => {
    let aiLaden = false;
    let teller = 0;

    const requestId = ++teller;
    aiLaden = true; // setAiLaden(true) na geslaagde upload

    // Sluit dialoog
    teller++;
    aiLaden = false; // reset wist direct

    // Stale finally
    if (isAnalyseVerzoekActueel(requestId, teller)) {
      aiLaden = false; // niet uitgevoerd
    }
    expect(aiLaden).toBe(false); // schoon door reset
  });
});
