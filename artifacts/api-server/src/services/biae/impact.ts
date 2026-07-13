// BIAE — Recall & Impact-analyse.
//
// Vóór het archiveren/verwijderen van een entiteit berekent de engine welke
// gekoppelde entiteiten meebewegen of achterblijven, zodat een handler een
// waarschuwing of blokkade kan tonen. Read-only: deze functie muteert nooit.
//
// Bewust defensief: elke deel-query staat in een eigen try/catch zodat een
// onbekende/ontbrekende koppeling de analyse niet laat crashen (stabiliteit).
import {
  db,
  fotosTable,
  documentKoppelingenTable,
  voorzieningLabelsTable,
  voorzieningenTable,
  medewerkersTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "../../lib/logger";

export type ImpactEntiteitType = "voorziening" | "document" | "gebruiker";

export interface ImpactItem {
  type: string;
  label: string;
  aantal: number;
  // "cascade" = beweegt automatisch mee; "blokkeert" = reden om te stoppen;
  // "waarschuwing" = losse koppeling die achterblijft/verweesd raakt.
  effect: "cascade" | "blokkeert" | "waarschuwing";
}

export interface ImpactResultaat {
  entiteitType: ImpactEntiteitType;
  entiteitId: number;
  gevonden: boolean;
  items: ImpactItem[];
  totaalGekoppeld: number;
  heeftBlokkade: boolean;
  samenvatting: string;
}

async function telVeilig(
  fn: () => Promise<number>,
  context: string,
): Promise<number> {
  try {
    return await fn();
  } catch (err) {
    logger.warn({ err, context }, "BIAE impact: deel-telling mislukt");
    return 0;
  }
}

async function analyseVoorziening(id: number): Promise<ImpactResultaat> {
  const items: ImpactItem[] = [];

  const fotos = await telVeilig(async () => {
    const [r] = await db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(fotosTable)
      .where(eq(fotosTable.voorzieningId, id));
    return r?.n ?? 0;
  }, "voorziening.fotos");
  if (fotos > 0) items.push({ type: "foto", label: "Gekoppelde foto's", aantal: fotos, effect: "cascade" });

  const labels = await telVeilig(async () => {
    const [r] = await db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(voorzieningLabelsTable)
      .where(eq(voorzieningLabelsTable.voorzieningId, id));
    return r?.n ?? 0;
  }, "voorziening.labels");
  if (labels > 0) items.push({ type: "label", label: "Gekoppelde toepassingen/labels", aantal: labels, effect: "cascade" });

  const documenten = await telVeilig(async () => {
    const [r] = await db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(documentKoppelingenTable)
      .where(and(eq(documentKoppelingenTable.doelType, "voorziening"), eq(documentKoppelingenTable.doelId, id)));
    return r?.n ?? 0;
  }, "voorziening.documenten");
  if (documenten > 0) items.push({ type: "document", label: "Gekoppelde documenten", aantal: documenten, effect: "waarschuwing" });

  return maakResultaat("voorziening", id, true, items);
}

async function analyseDocument(id: number): Promise<ImpactResultaat> {
  const items: ImpactItem[] = [];

  const koppelingen = await telVeilig(async () => {
    const [r] = await db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(documentKoppelingenTable)
      .where(eq(documentKoppelingenTable.documentId, id));
    return r?.n ?? 0;
  }, "document.koppelingen");
  if (koppelingen > 0)
    items.push({ type: "koppeling", label: "Koppelingen naar gebouwen/klanten/spots", aantal: koppelingen, effect: "waarschuwing" });

  return maakResultaat("document", id, true, items);
}

async function analyseGebruiker(id: number): Promise<ImpactResultaat> {
  const items: ImpactItem[] = [];

  const spotsUitvoering = await telVeilig(async () => {
    const [r] = await db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(voorzieningenTable)
      .where(eq(voorzieningenTable.monteurId, id));
    return r?.n ?? 0;
  }, "gebruiker.spotsUitvoering");
  if (spotsUitvoering > 0)
    items.push({ type: "spot", label: "Spots toegewezen als monteur uitvoering", aantal: spotsUitvoering, effect: "waarschuwing" });

  const medewerker = await telVeilig(async () => {
    const [r] = await db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(medewerkersTable)
      .where(eq(medewerkersTable.gebruikerId, id));
    return r?.n ?? 0;
  }, "gebruiker.medewerker");
  if (medewerker > 0)
    items.push({ type: "medewerker", label: "Gekoppeld HRM-medewerkerdossier", aantal: medewerker, effect: "waarschuwing" });

  return maakResultaat("gebruiker", id, true, items);
}

function maakResultaat(
  entiteitType: ImpactEntiteitType,
  entiteitId: number,
  gevonden: boolean,
  items: ImpactItem[],
): ImpactResultaat {
  const totaal = items.reduce((s, i) => s + i.aantal, 0);
  const heeftBlokkade = items.some((i) => i.effect === "blokkeert");
  const samenvatting = items.length === 0
    ? "Geen gekoppelde entiteiten gevonden."
    : items.map((i) => `${i.aantal}× ${i.label.toLowerCase()}`).join(", ");
  return { entiteitType, entiteitId, gevonden, items, totaalGekoppeld: totaal, heeftBlokkade, samenvatting };
}

// Publieke entry — retourneert een gestructureerde impact-samenvatting voor de
// te archiveren/verwijderen entiteit. Nooit gooien: bij fout een lege analyse.
export async function analyseImpact(
  type: ImpactEntiteitType,
  id: number,
): Promise<ImpactResultaat> {
  try {
    switch (type) {
      case "voorziening":
        return await analyseVoorziening(id);
      case "document":
        return await analyseDocument(id);
      case "gebruiker":
        return await analyseGebruiker(id);
      default:
        return maakResultaat(type, id, false, []);
    }
  } catch (err) {
    logger.error({ err, type, id }, "BIAE impact: analyse mislukt");
    return maakResultaat(type, id, false, []);
  }
}
