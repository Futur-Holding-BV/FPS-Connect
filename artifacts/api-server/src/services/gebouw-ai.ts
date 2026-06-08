import OpenAI from "openai";
import { logger } from "../lib/logger";

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

const STATIC_SIZE = 640;
const STATIC_SCALE = 2;
const STATIC_ZOOM = 19;

export interface GebouwAnalyse {
  gevonden: boolean;
  adres_gevonden: string | null;
  latitude: number | null;
  longitude: number | null;
  satelliet_url: string | null;
  aantal_verdiepingen: number | null;
  hoogte: number | null;
  breedte: number | null;
  diepte: number | null;
  oppervlakte: number | null;
  gebouw_type: string | null;
  bouwjaar: number | null;
  omschrijving: string | null;
  toelichting: string | null;
  betrouwbaarheid: string | null;
}

function leegResultaat(toelichting: string): GebouwAnalyse {
  return {
    gevonden: false,
    adres_gevonden: null,
    latitude: null,
    longitude: null,
    satelliet_url: null,
    aantal_verdiepingen: null,
    hoogte: null,
    breedte: null,
    diepte: null,
    oppervlakte: null,
    gebouw_type: null,
    bouwjaar: null,
    omschrijving: null,
    toelichting,
    betrouwbaarheid: null,
  };
}

interface GeocodeResultaat {
  lat: number;
  lng: number;
  formatted: string;
}

async function geocode(adres: string): Promise<GeocodeResultaat | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", adres);
  url.searchParams.set("key", GOOGLE_KEY!);
  url.searchParams.set("language", "nl");
  url.searchParams.set("region", "nl");

  const res = await fetch(url.toString());
  if (!res.ok) {
    logger.error({ status: res.status }, "Geocoding HTTP-fout");
    return null;
  }
  const data = (await res.json()) as {
    status: string;
    results: Array<{
      formatted_address: string;
      geometry: { location: { lat: number; lng: number } };
    }>;
  };
  if (data.status !== "OK" || data.results.length === 0) {
    logger.warn({ status: data.status }, "Geen geocoding-resultaat");
    return null;
  }
  const r = data.results[0];
  return {
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    formatted: r.formatted_address,
  };
}

async function haalSatellietBeeld(
  lat: number,
  lng: number,
): Promise<{ dataUrl: string; grondBreedteMeter: number } | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/staticmap");
  url.searchParams.set("center", `${lat},${lng}`);
  url.searchParams.set("zoom", String(STATIC_ZOOM));
  url.searchParams.set("size", `${STATIC_SIZE}x${STATIC_SIZE}`);
  url.searchParams.set("scale", String(STATIC_SCALE));
  url.searchParams.set("maptype", "satellite");
  url.searchParams.set("format", "png");
  url.searchParams.set("key", GOOGLE_KEY!);

  const res = await fetch(url.toString());
  if (!res.ok) {
    logger.error({ status: res.status }, "Static Maps HTTP-fout");
    return null;
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;

  // Meters per pixel op deze breedtegraad en zoom (Web Mercator)
  const metersPerPixel =
    (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, STATIC_ZOOM);
  const grondBreedteMeter = Math.round(metersPerPixel * STATIC_SIZE);

  return { dataUrl, grondBreedteMeter };
}

const SYSTEM_PROMPT = `Je bent een expert bouwkundig analist. Je analyseert een satellietbeeld (bovenaanzicht) van een gebouw en schat de fysieke eigenschappen.
Het gebouw van belang staat in het MIDDEN van het beeld.
Geef uitsluitend geldige JSON terug met deze velden:
- aantal_verdiepingen (geheel getal, schatting o.b.v. gebouwtype/regio): aantal bouwlagen
- hoogte (getal in meters): totale gebouwhoogte
- breedte (getal in meters): grootste horizontale afmeting van de footprint
- diepte (getal in meters): kleinste horizontale afmeting van de footprint
- oppervlakte (getal in m2): grondoppervlak van de footprint
- gebouw_type (tekst): bijv. "woonhuis", "appartementencomplex", "kantoor", "industrieel/bedrijfshal", "winkel", "school", "overig"
- bouwjaar (geheel getal of null): geschat bouwjaar indien herkenbaar, anders null
- omschrijving (korte Nederlandse tekst): 1 zin over het gebouw
- toelichting (korte Nederlandse tekst): hoe je tot de schatting kwam
- betrouwbaarheid (tekst): "laag", "midden" of "hoog"
Gebruik de opgegeven schaal van het beeld om footprint-afmetingen realistisch te schatten. Antwoord in het Nederlands. Alleen JSON, geen extra tekst.`;

interface VisionVelden {
  aantal_verdiepingen: number | null;
  hoogte: number | null;
  breedte: number | null;
  diepte: number | null;
  oppervlakte: number | null;
  gebouw_type: string | null;
  bouwjaar: number | null;
  omschrijving: string | null;
  toelichting: string | null;
  betrouwbaarheid: string | null;
}

function numOfNull(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && isFinite(n) ? n : null;
}

function intOfNull(v: unknown): number | null {
  const n = numOfNull(v);
  return n === null ? null : Math.round(n);
}

function strOfNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

async function analyseerBeeld(
  dataUrl: string,
  grondBreedteMeter: number,
  adres: string,
): Promise<VisionVelden | null> {
  const client = new OpenAI({ apiKey: OPENAI_KEY });
  const userTekst = `Adres: ${adres}. Het satellietbeeld is vierkant en beslaat ongeveer ${grondBreedteMeter} bij ${grondBreedteMeter} meter op de grond. Analyseer het gebouw in het midden.`;

  const completion = await client.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    max_tokens: 800,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: userTekst },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
  });

  const tekst = completion.choices[0]?.message?.content;
  if (!tekst) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(tekst);
  } catch {
    logger.error({ tekst }, "Kon AI-JSON niet parsen");
    return null;
  }
  return {
    aantal_verdiepingen: intOfNull(parsed.aantal_verdiepingen),
    hoogte: numOfNull(parsed.hoogte),
    breedte: numOfNull(parsed.breedte),
    diepte: numOfNull(parsed.diepte),
    oppervlakte: numOfNull(parsed.oppervlakte),
    gebouw_type: strOfNull(parsed.gebouw_type),
    bouwjaar: intOfNull(parsed.bouwjaar),
    omschrijving: strOfNull(parsed.omschrijving),
    toelichting: strOfNull(parsed.toelichting),
    betrouwbaarheid: strOfNull(parsed.betrouwbaarheid),
  };
}

export async function analyseerGebouw(volledigAdres: string): Promise<GebouwAnalyse> {
  if (!GOOGLE_KEY) return leegResultaat("Google Maps API-sleutel ontbreekt.");
  if (!OPENAI_KEY) return leegResultaat("OpenAI API-sleutel ontbreekt.");

  const geo = await geocode(volledigAdres);
  if (!geo) {
    return leegResultaat(
      "Adres niet gevonden via Google Maps. Controleer het adres of vul de velden handmatig in.",
    );
  }

  const beeld = await haalSatellietBeeld(geo.lat, geo.lng);
  if (!beeld) {
    return {
      ...leegResultaat("Satellietbeeld kon niet worden opgehaald."),
      gevonden: true,
      adres_gevonden: geo.formatted,
      latitude: geo.lat,
      longitude: geo.lng,
    };
  }

  const velden = await analyseerBeeld(beeld.dataUrl, beeld.grondBreedteMeter, geo.formatted);
  if (!velden) {
    return {
      ...leegResultaat("AI-analyse mislukte. Vul de velden handmatig in."),
      gevonden: true,
      adres_gevonden: geo.formatted,
      latitude: geo.lat,
      longitude: geo.lng,
      satelliet_url: beeld.dataUrl,
    };
  }

  return {
    gevonden: true,
    adres_gevonden: geo.formatted,
    latitude: geo.lat,
    longitude: geo.lng,
    satelliet_url: beeld.dataUrl,
    ...velden,
  };
}
