import {
  db,
  medewerkersTable,
  medewerkerDocumentenTable,
  hrmAiVoorstellenTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { classificeerDocument } from "./documentIntelligence";
import { logger } from "./logger";

type Medewerker = typeof medewerkersTable.$inferSelect;
type Doc = typeof medewerkerDocumentenTable.$inferSelect;

const VELD_NAAR_CAMEL: Partial<Record<string, keyof Medewerker>> = {
  naam: "naam",
  email: "email",
  telefoon: "telefoon",
  mobiel: "mobiel",
  adres: "adres",
  postcode: "postcode",
  woonplaats: "woonplaats",
  geboortedatum: "geboortedatum",
  bsn: "bsn",
  rijbewijs: "rijbewijs",
  rijbewijs_vervaldatum: "rijbewijsVervaldatum",
  vca_vervaldatum: "vcaVervaldatum",
  bhv_vervaldatum: "bhvVervaldatum",
  ehbo_vervaldatum: "ehboVervaldatum",
  in_dienst_sinds: "inDienstSinds",
  noodcontact_naam: "noodcontactNaam",
  noodcontact_telefoon: "noodcontactTelefoon",
};

export interface HrmVeldenExtractie {
  naam?: string;
  email?: string;
  telefoon?: string;
  mobiel?: string;
  adres?: string;
  postcode?: string;
  woonplaats?: string;
  geboortedatum?: string;
  rijbewijs?: string;
  vca_vervaldatum?: string;
  bhv_vervaldatum?: string;
  ehbo_vervaldatum?: string;
  vertrouwen: "laag" | "midden" | "hoog";
  succes: boolean;
  foutmelding?: string;
}

function normaliseerVelden(gevonden: Record<string, string>): HrmVeldenExtractie {
  const g = gevonden;
  return {
    naam: g.naam ?? g.volledige_naam ?? g["naam medewerker"] ?? undefined,
    email: g.email ?? g["e-mail"] ?? g["emailadres"] ?? undefined,
    telefoon: g.telefoon ?? g.telefoonnummer ?? undefined,
    mobiel: g.mobiel ?? g["mobiel nummer"] ?? g["mobiele telefoon"] ?? undefined,
    adres: g.adres ?? g.woonadres ?? g.straat ?? undefined,
    postcode: g.postcode ?? undefined,
    woonplaats: g.woonplaats ?? g.stad ?? g.plaats ?? undefined,
    geboortedatum: g.geboortedatum ?? g["datum van geboorte"] ?? undefined,
    rijbewijs: g.rijbewijs ?? g.rijbewijscategorie ?? g["rijbewijs categorie"] ?? undefined,
    vca_vervaldatum: g.vca_vervaldatum ?? g.vca ?? g["vca geldig tot"] ?? g["vca vervaldatum"] ?? undefined,
    bhv_vervaldatum: g.bhv_vervaldatum ?? g.bhv ?? g["bhv geldig tot"] ?? g["bhv vervaldatum"] ?? undefined,
    ehbo_vervaldatum: g.ehbo_vervaldatum ?? g.ehbo ?? g["ehbo geldig tot"] ?? g["ehbo vervaldatum"] ?? undefined,
    vertrouwen: "midden",
    succes: true,
  };
}

// Whitelist van dossier-documenttypen die de AI-classificatie mag toekennen
// wanneer het document nu als "overig" staat. Fail-closed: onbekende subtypes
// laten het type ongemoeid. "arbeidscontract" is bewust genormaliseerd naar
// "contract" (het canonieke dossiertype in de volledigheidscheck).
const SUBTYPE_NAAR_DOSSIERTYPE: Record<string, string> = {
  cv: "cv",
  arbeidscontract: "contract",
  contract: "contract",
  functiebeschrijving: "functiebeschrijving",
  identiteitsbewijs: "identiteitsbewijs",
  paspoort: "paspoort",
  verblijfsvergunning: "verblijfsvergunning",
  rijbewijs: "rijbewijs",
  vca_certificaat: "vca_certificaat",
  bhv_certificaat: "bhv_certificaat",
  ehbo_certificaat: "ehbo_certificaat",
  diploma: "diploma",
  loonstrook: "loonstrook",
  naw_formulier: "naw_formulier",
  geheimhoudingsverklaring: "geheimhoudingsverklaring",
  aow_verklaring: "aow_verklaring",
};

function heeftBruikbareVelden(v: HrmVeldenExtractie): boolean {
  return !!(v.naam || v.email || v.telefoon || v.mobiel || v.adres || v.geboortedatum || v.rijbewijs);
}

export async function extracteerHrmVeldenUitBuffer(
  buffer: Buffer,
  bestandsnaam: string,
  mime: string,
): Promise<HrmVeldenExtractie> {
  const resultaat = await classificeerDocument({ buffer, bestandsnaam, mime });
  const velden = normaliseerVelden(resultaat.gevonden_gegevens);
  velden.vertrouwen = resultaat.vertrouwen;

  // Documentanalyse is niet beschikbaar wanneer:
  // - het document als "onbekend" geclassificeerd is (OCR/vision werkt niet op dit type), of
  // - vertrouwen "laag" is én er geen bruikbare persoonsgegevens zijn gevonden.
  // Beide gevallen zijn bekende beperkingen van de huidige documentintelligence.
  const subtype = (resultaat as unknown as Record<string, unknown>).subtype as string | undefined;
  const isOnbekend = subtype === "onbekend" || subtype === "Onbekend";
  const geenVelden = !heeftBruikbareVelden(velden);

  if (resultaat.lees_probleem) {
    velden.succes = false;
    velden.foutmelding = `Document kon niet gelezen worden: ${resultaat.lees_probleem}. Voer de gegevens handmatig in.`;
  } else if (isOnbekend || (resultaat.vertrouwen === "laag" && geenVelden)) {
    velden.succes = false;
    velden.foutmelding =
      "Documentanalyse kon geen persoonsgegevens uitlezen. " +
      "Dit kan komen door een niet-ondersteund bestandstype, " +
      "pixelgebaseerde PDF of onvoldoende beeldkwaliteit. " +
      "Voer de gegevens handmatig in.";
  }

  return velden;
}

export async function analyseerEnSlaVoorstellenOp(
  medewerker: Medewerker,
  doc: Doc,
  fileBuffer: Buffer,
): Promise<{ aangemaakt: number; overgeslagen: number; hernoemd: boolean; analyseFout: boolean }> {
  let aangemaakt = 0;
  let overgeslagen = 0;
  let hernoemd = false;
  let analyseFout = false;

  try {
    const resultaat = await classificeerDocument({
      buffer: fileBuffer,
      bestandsnaam: doc.bestandsnaam ?? "document",
      mime: doc.contentType ?? "application/octet-stream",
    });

    // Documenttype automatisch benoemen: staat het document nog als "overig"
    // (of zonder type) en herkent de classificatie een bekend dossiertype,
    // dan zetten we dat type direct — zodat het dossier niet vol "Overig"
    // staat. Een door een mens gekozen specifiek type wordt NOOIT overschreven.
    const huidigType = (doc.type ?? "").trim().toLowerCase();
    const herkendSubtype = (resultaat.subtype ?? resultaat.gevonden_gegevens.document_subtype ?? "")
      .trim()
      .toLowerCase();
    const nieuwType = SUBTYPE_NAAR_DOSSIERTYPE[herkendSubtype];
    if ((huidigType === "" || huidigType === "overig") && nieuwType && !resultaat.lees_probleem) {
      const bijgewerkt = await db
        .update(medewerkerDocumentenTable)
        .set({ type: nieuwType })
        .where(
          and(
            eq(medewerkerDocumentenTable.id, doc.id),
            eq(medewerkerDocumentenTable.type, doc.type ?? "overig"),
          ),
        )
        .returning({ id: medewerkerDocumentenTable.id });
      // Alleen tellen wanneer onze eigen conditionele update daadwerkelijk een
      // rij wijzigde — een tussentijdse handmatige typekeuze wint (guard in WHERE).
      hernoemd = bijgewerkt.length > 0;
      if (hernoemd) {
        logger.info(
          { docId: doc.id, medewerkerId: medewerker.id, van: huidigType || "(leeg)", naar: nieuwType },
          "hrm-ai-analyse: documenttype automatisch benoemd",
        );
      }
    }

    const extractie = normaliseerVelden(resultaat.gevonden_gegevens);
    const baseConf =
      resultaat.vertrouwen === "hoog" ? 0.88 :
      resultaat.vertrouwen === "midden" ? 0.72 : 0.58;

    type VoorstelKlasse = "aanvulling" | "afwijking";
    const voorstellen: Array<{
      veld: string;
      waarde: string;
      confidence: number;
      klasse: VoorstelKlasse;
    }> = [];

    function stelVoor(
      veld: string,
      docWaarde: string | null | undefined,
      huidig: string | null | undefined,
      conf: number,
    ) {
      if (!docWaarde?.trim()) return;
      const d = docWaarde.trim();
      const h = huidig?.trim() ?? "";
      if (!h) {
        voorstellen.push({ veld, waarde: d, confidence: conf, klasse: "aanvulling" });
      } else if (h.toLowerCase() !== d.toLowerCase()) {
        voorstellen.push({ veld, waarde: d, confidence: conf * 0.65, klasse: "afwijking" });
      }
    }

    stelVoor("naam", extractie.naam, medewerker.naam, Math.min(baseConf, 0.70));
    stelVoor("email", extractie.email, medewerker.email, Math.min(baseConf, 0.85));
    stelVoor("telefoon", extractie.telefoon, medewerker.telefoon, Math.min(baseConf, 0.80));
    stelVoor("mobiel", extractie.mobiel, medewerker.mobiel, Math.min(baseConf, 0.80));
    stelVoor("adres", extractie.adres, medewerker.adres, Math.min(baseConf, 0.75));
    stelVoor("postcode", extractie.postcode, medewerker.postcode, Math.min(baseConf, 0.75));
    stelVoor("woonplaats", extractie.woonplaats, medewerker.woonplaats, Math.min(baseConf, 0.75));
    stelVoor("rijbewijs", extractie.rijbewijs, medewerker.rijbewijs, Math.min(baseConf, 0.85));

    if (extractie.geboortedatum && !medewerker.geboortedatum)
      voorstellen.push({ veld: "geboortedatum", waarde: extractie.geboortedatum, confidence: Math.min(baseConf, 0.80), klasse: "aanvulling" });
    if (extractie.vca_vervaldatum && !medewerker.vcaVervaldatum)
      voorstellen.push({ veld: "vca_vervaldatum", waarde: extractie.vca_vervaldatum, confidence: 0.90, klasse: "aanvulling" });
    if (extractie.bhv_vervaldatum && !medewerker.bhvVervaldatum)
      voorstellen.push({ veld: "bhv_vervaldatum", waarde: extractie.bhv_vervaldatum, confidence: 0.90, klasse: "aanvulling" });
    if (extractie.ehbo_vervaldatum && !medewerker.ehboVervaldatum)
      voorstellen.push({ veld: "ehbo_vervaldatum", waarde: extractie.ehbo_vervaldatum, confidence: 0.90, klasse: "aanvulling" });

    const bewijsArray = resultaat.bewijs.map((b) => ({ stap: b.stap, resultaat: b.resultaat, detail: b.detail }));

    for (const v of voorstellen) {
      const [bestaand] = await db
        .select({ id: hrmAiVoorstellenTable.id })
        .from(hrmAiVoorstellenTable)
        .where(
          and(
            eq(hrmAiVoorstellenTable.medewerkerId, medewerker.id),
            eq(hrmAiVoorstellenTable.veld, v.veld),
            eq(hrmAiVoorstellenTable.medewerkerDocumentId, doc.id),
            eq(hrmAiVoorstellenTable.status, "open"),
          ),
        );
      if (bestaand) { overgeslagen++; continue; }

      const camelKey = VELD_NAAR_CAMEL[v.veld];
      const huidigeWaarde = camelKey
        ? (String(medewerker[camelKey] ?? "") || null)
        : null;

      await db.insert(hrmAiVoorstellenTable).values({
        medewerkerId: medewerker.id,
        medewerkerDocumentId: doc.id,
        veld: v.veld,
        huidigeWaarde,
        voorgesteldeWaarde: v.waarde,
        reden: v.klasse === "afwijking"
          ? `Afwijking gedetecteerd: ${doc.bestandsnaam ?? "document"} vermeldt een andere waarde dan het profiel`
          : `Aanvulling gevonden in ${doc.bestandsnaam ?? "document"} (${resultaat.subtype ?? doc.type ?? "onbekend"})`,
        brondocument: doc.bestandsnaam,
        bewijskenmerken: bewijsArray as unknown as Record<string, unknown>,
        confidence: v.confidence,
        vertrouwenScore: v.confidence,
        status: "open",
        impact: v.klasse === "afwijking" ? "hoog" : v.confidence >= 0.85 ? "hoog" : "gemiddeld",
        modelGebruikt: resultaat.ai_model ?? "documentIntelligence",
      });
      aangemaakt++;
    }

    if (voorstellen.length === 0) overgeslagen++;
  } catch (err) {
    analyseFout = true;
    logger.warn(
      { err, docId: doc.id, medewerkerId: medewerker.id },
      "hrm-ai-analyse: document-analyse mislukt",
    );
  }

  return { aangemaakt, overgeslagen, hernoemd, analyseFout };
}
