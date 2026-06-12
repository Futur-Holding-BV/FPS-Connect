import { db } from "@workspace/db";
import {
  voorzieningTypesTable,
  labelsTable,
  labelApplicatiesTable,
  documentenTable,
  documentToepassingenTable,
  spotAiVoorstellenTable,
} from "@workspace/db";
import { eq, and, inArray, isNotNull } from "drizzle-orm";
import { logger } from "../lib/logger";
import { heeftOpenAi, maakOpenAiClient } from "../lib/openai";
import { ObjectStorageService } from "../lib/objectStorage";
import { stelToepassingenVoor, type ToepassingKandidaat } from "./document-ai";

export interface SpotAiToepassingSuggestie {
  label_id: number;
  naam: string;
  fabrikant: string | null;
  score: number;
  reden: string | null;
}

export interface SpotAiVoorstel {
  wand_of_plafond: string | null;
  type_code: string | null;
  type_naam: string | null;
  observaties: string | null;
  toelichting: string | null;
  betrouwbaarheid: string | null;
  toepassing_suggesties: SpotAiToepassingSuggestie[];
  document_id: number | null;
  document_naam: string | null;
}

function strOfNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function leeg(toelichting: string): SpotAiVoorstel {
  return {
    wand_of_plafond: null,
    type_code: null,
    type_naam: null,
    observaties: null,
    toelichting,
    betrouwbaarheid: "laag",
    toepassing_suggesties: [],
    document_id: null,
    document_naam: null,
  };
}

// Een geüploade spot-foto (objectPath of storage-URL) omzetten naar een data-URL
// zodat het visionmodel de afbeelding inline kan meekrijgen.
async function objectPathNaarDataUrl(objectPath: string): Promise<string | null> {
  try {
    const svc = new ObjectStorageService();
    const genormaliseerd = svc.normalizeObjectEntityPath(objectPath);
    const file = await svc.getObjectEntityFile(genormaliseerd);
    const [buffer] = await file.download();
    let contentType = "image/jpeg";
    try {
      const [md] = await file.getMetadata();
      if (md.contentType && String(md.contentType).startsWith("image/")) {
        contentType = String(md.contentType);
      }
    } catch {
      // Metadata is optioneel; bij twijfel vallen we terug op image/jpeg.
    }
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch (err) {
    logger.error({ err, objectPath }, "Kon spot-foto niet ophalen voor AI-analyse");
    return null;
  }
}

const SYSTEM_PROMPT = `Je bent een expert in passieve brandwering die afgewerkte doorvoeringen en brandwerende voorzieningen op foto's herkent.
Je krijgt mogelijk een foto VÓÓR de afwerking (de situatie/sparing) en altijd een foto NÁ de afwerking (de uitgevoerde afwerking). Analyseer primair de foto ná en gebruik de foto vóór als context.
Bepaal op basis van wat ZICHTBAAR is:
- de oriëntatie: betreft het een wand of een plafond/vloer;
- welke applicatie (situatie) het beste past, gekozen uit de meegeleverde catalogus;
- welk product/fabrikant zichtbaar is (teksten, kleuren, manchetten, kit, coating, stenen, platen, labels).
Belangrijke regels:
- Verzin niets. Laat een veld op null als je het niet met redelijke zekerheid uit de foto kunt afleiden.
- Bepaal NOOIT de brandwerendheid, de WBDBO-waarde of de scheidende-constructie-classificatie (s.g.-constructie). Dat doet een mens.
- Kies de applicatie-code EXACT uit de meegeleverde lijst; verzin geen nieuwe code.
Geef uitsluitend geldige JSON terug met deze velden:
- wand_of_plafond (tekst of null): exact "wand" of "plafond".
- applicatie_code (tekst of null): exact één code uit de catalogus.
- applicatie_naam (tekst of null): de bijbehorende naam uit de catalogus.
- fabrikant (tekst of null): zichtbare fabrikant/merk.
- product (tekst of null): zichtbaar product of systeem.
- en_norm (tekst of null): alleen als letterlijk zichtbaar op de foto.
- observaties (korte Nederlandse tekst of null): wat je op de foto ziet dat tot dit voorstel leidt.
- toelichting (korte Nederlandse tekst of null): korte onderbouwing.
- betrouwbaarheid (tekst): "laag", "midden" of "hoog".
Antwoord in het Nederlands. Alleen JSON, geen extra tekst.`;

// Bevestigde leerset-correcties als richtlijntekst: gebouwspecifieke voorbeelden
// voor dit gebouw plus generieke voorbeelden globaal. Geen trainingsproces; de
// voorbeelden sturen het visionmodel zachtjes bij (few-shot in de prompt).
async function bouwLeersetTekst(gebouwId: number): Promise<string> {
  const rows = await db
    .select()
    .from(spotAiVoorstellenTable)
    .where(isNotNull(spotAiVoorstellenTable.herkomst));
  const relevant = rows.filter(
    (r) =>
      r.herkomst === "generiek" ||
      (r.herkomst === "gebouwspecifiek" && r.gebouwId === gebouwId),
  );
  if (relevant.length === 0) return "";

  const labelIds = Array.from(
    new Set(relevant.flatMap((r) => r.gekozen?.label_ids ?? [])),
  );
  const labelNaam = new Map<number, string>();
  if (labelIds.length > 0) {
    const ls = await db
      .select({ id: labelsTable.id, naam: labelsTable.naam })
      .from(labelsTable)
      .where(inArray(labelsTable.id, labelIds));
    for (const l of ls) labelNaam.set(l.id, l.naam);
  }

  const regels = relevant.slice(0, 15).map((r) => {
    const g = r.gekozen;
    const toepassingen =
      (g?.label_ids ?? [])
        .map((id) => labelNaam.get(id))
        .filter(Boolean)
        .join(", ") || "(geen)";
    const scope = r.herkomst === "gebouwspecifiek" ? "dit gebouw" : "algemeen";
    return `- (${scope}) applicatie ${g?.type_code ?? "?"}, ${g?.wand_of_plafond ?? "?"}, toepassing(en): ${toepassingen}`;
  });

  return `Eerder door een beheerder bevestigde keuzes (gebruik als richtlijn, niet bindend):\n${regels.join("\n")}`;
}

async function kandidatenVoorApplicatie(
  typeCode: string | null,
): Promise<{ kandidaten: ToepassingKandidaat[]; vanApplicatie: boolean }> {
  const naarKandidaat = (l: typeof labelsTable.$inferSelect): ToepassingKandidaat => ({
    id: l.id,
    naam: l.naam,
    fabrikant: l.fabrikant,
    testnorm: l.testnorm,
  });

  if (typeCode) {
    const koppel = await db
      .select({ labelId: labelApplicatiesTable.labelId })
      .from(labelApplicatiesTable)
      .where(eq(labelApplicatiesTable.typeCode, typeCode));
    const ids = koppel.map((k) => k.labelId);
    if (ids.length > 0) {
      const rows = await db
        .select()
        .from(labelsTable)
        .where(and(inArray(labelsTable.id, ids), eq(labelsTable.gearchiveerd, false)));
      if (rows.length > 0) return { kandidaten: rows.map(naarKandidaat), vanApplicatie: true };
    }
  }

  // Fallback: alle niet-gearchiveerde toepassingen (geen of lege applicatie-koppeling).
  const alle = await db
    .select()
    .from(labelsTable)
    .where(eq(labelsTable.gearchiveerd, false));
  return { kandidaten: alle.map(naarKandidaat), vanApplicatie: false };
}

// Het meest relevante actuele document bij een toepassing: ETA en
// classificatierapport krijgen voorrang, daarna de hoogste revisie.
async function documentVoorLabel(
  labelId: number,
): Promise<{ id: number; naam: string } | null> {
  const docs = await db
    .select()
    .from(documentenTable)
    .innerJoin(
      documentToepassingenTable,
      eq(documentToepassingenTable.documentId, documentenTable.id),
    )
    .where(
      and(
        eq(documentToepassingenTable.labelId, labelId),
        eq(documentenTable.status, "actueel"),
        eq(documentenTable.gearchiveerd, false),
      ),
    );
  if (docs.length === 0) return null;

  const prio = ["eta", "classificatierapport", "testrapport", "productcertificaat", "dop", "verwerkingsvoorschrift"];
  const prioVan = (t: string) => {
    const i = prio.indexOf(t);
    return i === -1 ? prio.length : i;
  };
  const rijen = docs.map((r) => r.documenten);
  rijen.sort((a, b) => {
    const pa = prioVan(a.documenttype);
    const pb = prioVan(b.documenttype);
    if (pa !== pb) return pa - pb;
    return b.revisieNummer - a.revisieNummer;
  });
  const gekozen = rijen[0];
  return { id: gekozen.id, naam: gekozen.naam };
}

export async function analyseerSpot(opts: {
  gebouwId: number;
  fotoVoorObjectPath: string | null;
  fotoNaObjectPath: string;
}): Promise<SpotAiVoorstel> {
  if (!heeftOpenAi()) {
    return leeg("AI is niet beschikbaar. Vul de velden handmatig in.");
  }

  const naUrl = await objectPathNaarDataUrl(opts.fotoNaObjectPath);
  if (!naUrl) {
    return leeg("De foto ná de afwerking kon niet worden geladen. Vul de velden handmatig in.");
  }
  const voorUrl = opts.fotoVoorObjectPath
    ? await objectPathNaarDataUrl(opts.fotoVoorObjectPath)
    : null;

  const applicaties = await db
    .select()
    .from(voorzieningTypesTable)
    .where(eq(voorzieningTypesTable.actief, true));
  const catalogusTekst =
    applicaties.length > 0
      ? applicaties.map((a) => `- ${a.code}: ${a.naam} (${a.categorie})`).join("\n")
      : "(geen applicaties in de catalogus)";

  const leersetTekst = await bouwLeersetTekst(opts.gebouwId);

  const userInhoud: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [
    {
      type: "text",
      text:
        `Catalogus met beschikbare applicaties (kies de code exact hieruit):\n${catalogusTekst}` +
        (leersetTekst ? `\n\n${leersetTekst}` : ""),
    },
  ];
  if (voorUrl) {
    userInhoud.push({ type: "text", text: "Foto VÓÓR de afwerking (context):" });
    userInhoud.push({ type: "image_url", image_url: { url: voorUrl } });
  }
  userInhoud.push({ type: "text", text: "Foto NÁ de afwerking (analyseer deze):" });
  userInhoud.push({ type: "image_url", image_url: { url: naUrl } });

  let parsed: Record<string, unknown>;
  try {
    const client = maakOpenAiClient();
    const completion = await client.chat.completions.create({
      model: "gpt-5",
      response_format: { type: "json_object" },
      max_completion_tokens: 4000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userInhoud },
      ],
    });
    const antwoord = completion.choices[0]?.message?.content;
    if (!antwoord) {
      return leeg("De AI gaf geen bruikbaar antwoord. Vul de velden handmatig in.");
    }
    parsed = JSON.parse(antwoord);
  } catch (err) {
    logger.error({ err }, "Spot AI-analyse mislukte");
    return leeg("De AI-analyse kon niet worden uitgevoerd. Vul de velden handmatig in.");
  }

  const ruwWandPlafond = strOfNull(parsed.wand_of_plafond)?.toLowerCase() ?? null;
  const wand_of_plafond =
    ruwWandPlafond === "wand" || ruwWandPlafond === "plafond" ? ruwWandPlafond : null;

  const ruwCode = strOfNull(parsed.applicatie_code);
  const catalogusMatch = ruwCode
    ? applicaties.find((a) => a.code === ruwCode)
    : undefined;
  const type_code = catalogusMatch?.code ?? null;
  const type_naam = catalogusMatch?.naam ?? strOfNull(parsed.applicatie_naam);

  const fabrikant = strOfNull(parsed.fabrikant);
  const product = strOfNull(parsed.product);
  const enNorm = strOfNull(parsed.en_norm);

  const { kandidaten, vanApplicatie } = await kandidatenVoorApplicatie(type_code);
  const fabrikantPerLabel = new Map<number, string | null>(
    kandidaten.map((k) => [k.id, k.fabrikant]),
  );
  const ruweSuggesties = stelToepassingenVoor(
    { fabrikant, product, en_norm: enNorm, naam: product },
    kandidaten,
  );
  let toepassing_suggesties: SpotAiToepassingSuggestie[] = ruweSuggesties.map((s) => ({
    label_id: s.label_id,
    naam: s.naam,
    fabrikant: fabrikantPerLabel.get(s.label_id) ?? null,
    score: s.score,
    reden: s.reden,
  }));

  // Geen product/fabrikant herkend, maar de applicatie heeft wél gekoppelde
  // toepassingen: bied die als opties aan (lage zekerheid, score 0) zodat de
  // monteur kan kiezen. Bij de globale fallback doen we dit bewust niet om geen
  // hele toepassingenlijst te dumpen.
  if (toepassing_suggesties.length === 0 && vanApplicatie && type_code) {
    toepassing_suggesties = kandidaten.slice(0, 5).map((k) => ({
      label_id: k.id,
      naam: k.naam,
      fabrikant: k.fabrikant,
      score: 0,
      reden: `Gekoppeld aan applicatie ${type_code}`,
    }));
  }

  let document_id: number | null = null;
  let document_naam: string | null = null;
  if (toepassing_suggesties.length > 0) {
    const doc = await documentVoorLabel(toepassing_suggesties[0].label_id);
    if (doc) {
      document_id = doc.id;
      document_naam = doc.naam;
    }
  }

  return {
    wand_of_plafond,
    type_code,
    type_naam,
    observaties: strOfNull(parsed.observaties),
    toelichting: strOfNull(parsed.toelichting),
    betrouwbaarheid: strOfNull(parsed.betrouwbaarheid) ?? "midden",
    toepassing_suggesties,
    document_id,
    document_naam,
  };
}
