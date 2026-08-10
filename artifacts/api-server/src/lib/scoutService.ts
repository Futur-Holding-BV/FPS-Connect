/**
 * Dagelijkse marktscout — Overijssel & Achterhoek
 *
 * Haalt elke ochtend om 07:00 nieuwsfeeds op voor commercieel relevante
 * bouwprojecten, vergunningen en kansen in de regio. OpenAI filtert en
 * classificeert; relevante signalen worden automatisch opgeslagen in
 * crm_marktintelligentie met bron_type='scout'.
 */

import { db } from "@workspace/db";
import { crmMarktintelligentieTable, crmScoutRunsTable } from "@workspace/db";
import { desc, or, ilike, eq } from "drizzle-orm";
import { aiGateway, heeftGateway } from "./aiGateway";
import { logger } from "./logger";

const REGIO = "Overijssel / Achterhoek";

const SCOUT_QUERIES = [
  "bouwproject Overijssel",
  "nieuwbouw Achterhoek",
  "verbouwing Twente",
  "brandveiligheid Overijssel",
  "brandpreventie Overijssel Achterhoek",
  "omgevingsvergunning Overijssel",
  "vastgoed Achterhoek",
  "aanbesteding bouw Overijssel",
];

interface RssArtikel {
  titel: string;
  link: string;
  beschrijving: string;
  pubDatum: string;
}

// ─── RSS-parsing ─────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function extractCdata(raw: string): string {
  const m = raw.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return m ? m[1] : raw;
}

function parseRssItems(xml: string): RssArtikel[] {
  const items: RssArtikel[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml)) !== null) {
    const item = m[1];

    const titelRaw = item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
    const linkRaw = item.match(/<link>([\s\S]*?)<\/link>|<link [^>]*href="([^"]+)"/)?.[1] ?? item.match(/<link [^>]*href="([^"]+)"/)?.[1] ?? "";
    const descRaw = item.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "";
    const pubRaw = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "";

    const titel = stripHtml(extractCdata(titelRaw)).slice(0, 160);
    const beschrijving = stripHtml(extractCdata(descRaw)).slice(0, 400);
    const link = linkRaw.trim().replace(/&amp;/g, "&");

    if (titel.length > 5) {
      items.push({ titel, link, beschrijving, pubDatum: pubRaw.trim() });
    }
  }
  return items;
}

async function haalRssOp(query: string): Promise<RssArtikel[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=nl&gl=NL&ceid=NL:nl`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!resp.ok) return [];
    const xml = await resp.text();
    return parseRssItems(xml);
  } catch {
    return [];
  }
}

// ─── AI-filter & classificatie ───────────────────────────────────────────────

interface AiSignaal {
  type: string;
  titel: string;
  inhoud: string;
  bron: string;
  bron_url: string;
  regio: string;
  datum: string;
}

async function filterEnClassificeer(artikelen: RssArtikel[]): Promise<AiSignaal[]> {
  if (!heeftGateway() || artikelen.length === 0) return [];
  const vandaag = new Date().toISOString().slice(0, 10);

  const artikelTekst = artikelen
    .slice(0, 60)
    .map((a, i) => `[${i + 1}] TITEL: ${a.titel}\nBRON_URL: ${a.link}\nSAMENVATTING: ${a.beschrijving}\nDATUM: ${a.pubDatum}`)
    .join("\n\n---\n\n");

  const prompt = `Je bent marktintelligentie-assistent voor FPS Brandpreventie, een Nederlands bedrijf gespecialiseerd in brandveiligheid en brandpreventieve voorzieningen (branddeuren, doorvoeringen, brandkleppen, coating, manchetten) in Overijssel en Achterhoek. Vandaag is het ${vandaag}.

Hieronder staan recente nieuwsartikelen. Selecteer ALLEEN artikelen die relevant zijn als commerciële kans of marktinformatie voor FPS. Denk aan: nieuwbouwprojecten, renovatieprojecten, utiliteitsgebouwen (kantoren, scholen, zorggebouwen, industrie), aanbestedingen voor brandpreventie of bouw, vergunningsmeldingen voor grote bouwprojecten, regionaal vastgoednieuws in Overijssel of Achterhoek.

NEGEER: algemeen landelijk nieuws, politiek, sport, entertainment, kleinschalige particuliere verbouwingen.

Retourneer ALLEEN valide JSON zonder extra toelichting:
{"signalen": [{"type": "kans|nieuws|aanbesteding|overig", "titel": "pakkende titel max 80 tekens", "inhoud": "korte uitleg waarom relevant voor FPS, max 200 tekens", "bron": "naam van het nieuwsmedium", "bron_url": "https://...", "regio": "Overijssel of Achterhoek of specifieke stad", "datum": "YYYY-MM-DD"}, ...]}

Artikelen:
${artikelTekst}`;

  try {
    const scoutResultaat = await aiGateway.chat("default", {
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
      max_tokens: 3000,
    }, undefined, {
      module: "scout",
      functie: "filterEnClassificeer",
      promptNaam: "scout-marktsignalen",
      promptVersie: "1.0.0",
    });
    const tekst = scoutResultaat.ok ? scoutResultaat.inhoud : "{}";
    const parsed = JSON.parse(tekst) as { signalen?: AiSignaal[] };
    return (parsed.signalen ?? []).slice(0, 20);
  } catch (err) {
    logger.warn({ err }, "scoutService: AI-filtering mislukt");
    return [];
  }
}

// ─── Deduplicatie ─────────────────────────────────────────────────────────────

async function isNieuw(signaal: AiSignaal): Promise<boolean> {
  if (!signaal.bron_url && !signaal.titel) return false;
  const bestaand = await db
    .select({ id: crmMarktintelligentieTable.id })
    .from(crmMarktintelligentieTable)
    .where(
      or(
        signaal.bron_url ? ilike(crmMarktintelligentieTable.bronUrl, signaal.bron_url) : undefined,
        ilike(crmMarktintelligentieTable.titel, signaal.titel),
      ),
    )
    .limit(1);
  return bestaand.length === 0;
}

// ─── Hoofdfunctie ─────────────────────────────────────────────────────────────

export async function voerScoutUit(): Promise<{ gevonden: number; opgeslagen: number }> {
  logger.info("scoutService: dagelijkse scout gestart");

  const [run] = await db
    .insert(crmScoutRunsTable)
    .values({ status: "bezig" })
    .returning();

  try {
    const alleArtikelen: RssArtikel[] = [];
    const resultaten = await Promise.all(SCOUT_QUERIES.map(haalRssOp));
    for (const r of resultaten) alleArtikelen.push(...r);

    const uniekOpLink = new Map<string, RssArtikel>();
    for (const a of alleArtikelen) {
      const key = a.link || a.titel;
      if (key && !uniekOpLink.has(key)) uniekOpLink.set(key, a);
    }
    const dedupArtikelen = [...uniekOpLink.values()];

    logger.info({ gevonden: dedupArtikelen.length }, "scoutService: RSS artikelen opgehaald");

    const signalen = await filterEnClassificeer(dedupArtikelen);
    let opgeslagen = 0;

    for (const s of signalen) {
      if (await isNieuw(s)) {
        let datum = s.datum && /^\d{4}-\d{2}-\d{2}$/.test(s.datum) ? s.datum : new Date().toISOString().slice(0, 10);
        await db.insert(crmMarktintelligentieTable).values({
          type: ["kans", "nieuws", "aanbesteding", "overig"].includes(s.type) ? s.type : "nieuws",
          bronType: "scout",
          titel: s.titel?.slice(0, 200) || "Onbekend",
          inhoud: s.inhoud?.slice(0, 500) || null,
          bron: s.bron?.slice(0, 100) || "Dagelijkse scout",
          bronUrl: s.bron_url?.slice(0, 500) || null,
          regio: s.regio?.slice(0, 100) || REGIO,
          datum,
          aangemaaktDoor: null,
        });
        opgeslagen++;
      }
    }

    await db
      .update(crmScoutRunsTable)
      .set({ status: "voltooid", afgerondOp: new Date(), gevonden: dedupArtikelen.length, opgeslagen })
      .where(eq(crmScoutRunsTable.id, run.id));

    logger.info({ opgeslagen }, "scoutService: scout voltooid");
    return { gevonden: dedupArtikelen.length, opgeslagen };
  } catch (err) {
    logger.error({ err }, "scoutService: scout mislukt");
    await db
      .update(crmScoutRunsTable)
      .set({ status: "fout", afgerondOp: new Date(), foutmelding: String(err) })
      .where(eq(crmScoutRunsTable.id, run.id));
    return { gevonden: 0, opgeslagen: 0 };
  }
}

export async function getScoutStatus() {
  const runs = await db
    .select()
    .from(crmScoutRunsTable)
    .orderBy(desc(crmScoutRunsTable.gestartOp))
    .limit(1);

  const volgende = berekenVolgendeScout();

  return {
    volgende_run_op: volgende.toISOString(),
    laatste_run: runs[0]
      ? {
          id: runs[0].id,
          gestart_op: runs[0].gestartOp.toISOString(),
          afgerond_op: runs[0].afgerondOp?.toISOString() ?? null,
          status: runs[0].status,
          gevonden: runs[0].gevonden,
          opgeslagen: runs[0].opgeslagen,
          foutmelding: runs[0].foutmelding ?? null,
        }
      : null,
    regio: REGIO,
    actief: true,
  };
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

let _volgendScoutHandle: ReturnType<typeof setTimeout> | null = null;

function berekenVolgendeScout(): Date {
  const now = new Date();
  const volgende = new Date(now);
  volgende.setHours(7, 0, 0, 0);
  if (volgende <= now) volgende.setDate(volgende.getDate() + 1);
  return volgende;
}

export function planDagelijkseScout(): void {
  if (_volgendScoutHandle) clearTimeout(_volgendScoutHandle);
  const volgende = berekenVolgendeScout();
  const vertragingMs = volgende.getTime() - Date.now();

  logger.info(
    { volgende: volgende.toISOString(), vertragingMs },
    "scoutService: dagelijkse scout ingepland",
  );

  _volgendScoutHandle = setTimeout(async () => {
    await voerScoutUit().catch((err) => logger.error({ err }, "scoutService: fout in dagelijkse run"));
    planDagelijkseScout();
  }, vertragingMs);
}
