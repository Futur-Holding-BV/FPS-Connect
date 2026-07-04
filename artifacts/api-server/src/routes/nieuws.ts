import { Router } from "express";
import { XMLParser } from "fast-xml-parser";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();
const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

// ─── Types ────────────────────────────────────────────────────────────────────

type NieuwsItem = {
  titel: string;
  url: string;
  bron: string;
  gepubliceerd: string;
  beschrijving: string | null;
};

// ─── In-memory cache (30 minuten) ─────────────────────────────────────────────

let cache: { items: NieuwsItem[]; geldigTot: number } | null = null;
const CACHE_DUUR_MS = 30 * 60 * 1000;

// ─── RSS-bronnen ──────────────────────────────────────────────────────────────

const RSS_BRONNEN: { url: string; naam: string }[] = [
  { url: "https://feeds.nos.nl/nosnieuwsalgemeen",   naam: "NOS Nieuws" },
  { url: "https://feeds.nos.nl/nosnieuwsbinnenland",  naam: "NOS Binnenland" },
  { url: "https://feeds.nos.nl/nosnieuwsbuitenland",  naam: "NOS Buitenland" },
];

// ─── RSS ophalen en parsen ────────────────────────────────────────────────────

async function fetchBron(bron: { url: string; naam: string }): Promise<NieuwsItem[]> {
  try {
    const resp = await fetch(bron.url, {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "FPSConnect/1.0 (nieuwsticker)" },
    });
    if (!resp.ok) return [];
    const xml = await resp.text();
    const parsed = xmlParser.parse(xml) as {
      rss?: { channel?: { item?: unknown } };
    };
    const channel = parsed?.rss?.channel;
    if (!channel?.item) return [];
    const items = Array.isArray(channel.item) ? channel.item : [channel.item];
    return (items as Record<string, unknown>[]).slice(0, 12).map((item) => ({
      titel: stripHtml(String(item["title"] ?? "")),
      url: String(item["link"] ?? ""),
      bron: bron.naam,
      gepubliceerd: String(item["pubDate"] ?? ""),
      beschrijving: item["description"]
        ? stripHtml(String(item["description"])).slice(0, 220) || null
        : null,
    }));
  } catch {
    return [];
  }
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

async function fetchAllNieuws(): Promise<NieuwsItem[]> {
  const resultaten = await Promise.allSettled(RSS_BRONNEN.map(fetchBron));
  const items: NieuwsItem[] = [];
  for (const r of resultaten) {
    if (r.status === "fulfilled") items.push(...r.value);
  }
  // Sorteer op publicatiedatum (nieuwste eerst), best-effort
  items.sort((a, b) => {
    const ta = a.gepubliceerd ? new Date(a.gepubliceerd).getTime() : 0;
    const tb = b.gepubliceerd ? new Date(b.gepubliceerd).getTime() : 0;
    return tb - ta;
  });
  return items;
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.get("/nieuws", requireAuth, async (req, res): Promise<void> => {
  try {
    if (cache && cache.geldigTot > Date.now()) {
      return void res.json(cache.items);
    }
    const items = await fetchAllNieuws();
    cache = { items, geldigTot: Date.now() + CACHE_DUUR_MS };
    return void res.json(items);
  } catch (err) {
    req.log.warn({ err }, "Nieuws ophalen mislukt");
    return void res.json([]);
  }
});

export default router;
