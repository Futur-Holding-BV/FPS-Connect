import OpenAI from "openai";
import { logger } from "../lib/logger";

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

const STATIC_SIZE = 640;
const STATIC_SCALE = 2;
const STATIC_ZOOM = 19;

export interface GebouwAnalyse {
  gevonden: boolean;
  naam: string | null;
  adres: string | null;
  stad: string | null;
  postcode: string | null;
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
  omschrijving: string | null;
  toelichting: string | null;
  betrouwbaarheid: string | null;
}

function leegResultaat(toelichting: string): GebouwAnalyse {
  return {
    gevonden: false,
    naam: null,
    adres: null,
    stad: null,
    postcode: null,
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
    omschrijving: strOfNull(parsed.omschrijving),
    toelichting: strOfNull(parsed.toelichting),
    betrouwbaarheid: strOfNull(parsed.betrouwbaarheid),
  };
}

const EXTRACTIE_PROMPT = `Je helpt bij het invullen van een gebouwregistratie op basis van een vrije omschrijving van de gebruiker.
Haal uit de tekst alle gebouwgegevens die de gebruiker EXPLICIET noemt. Verzin geen feiten; laat onbekende velden op null.
Geef uitsluitend geldige JSON terug met deze velden:
- zoekopdracht (tekst of null): het beste adres/zoekterm om het gebouw op Google Maps te vinden (straat + huisnummer + postcode + plaats voor zover bekend)
- naam (tekst of null): naam van het gebouw indien genoemd
- adres (tekst of null): straat + huisnummer
- stad (tekst of null)
- postcode (tekst of null)
- gebouw_type (tekst of null): bijv. "woonhuis", "appartementencomplex", "kantoor", "industrieel/bedrijfshal", "winkel", "school", "overig"
- aantal_verdiepingen (geheel getal of null)
- hoogte (getal in meters of null)
- breedte (getal in meters of null)
- diepte (getal in meters of null)
- oppervlakte (getal in m2 of null)
- omschrijving (korte Nederlandse tekst of null)
Antwoord in het Nederlands. Alleen JSON, geen extra tekst.`;

interface ExtractieVelden {
  zoekopdracht: string | null;
  naam: string | null;
  adres: string | null;
  stad: string | null;
  postcode: string | null;
  gebouw_type: string | null;
  aantal_verdiepingen: number | null;
  hoogte: number | null;
  breedte: number | null;
  diepte: number | null;
  oppervlakte: number | null;
  omschrijving: string | null;
}

async function extraheerUitTekst(beschrijving: string): Promise<ExtractieVelden | null> {
  const client = new OpenAI({ apiKey: OPENAI_KEY });
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    max_tokens: 600,
    messages: [
      { role: "system", content: EXTRACTIE_PROMPT },
      { role: "user", content: beschrijving },
    ],
  });
  const tekst = completion.choices[0]?.message?.content;
  if (!tekst) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(tekst);
  } catch {
    logger.error({ tekst }, "Kon extractie-JSON niet parsen");
    return null;
  }
  return {
    zoekopdracht: strOfNull(parsed.zoekopdracht),
    naam: strOfNull(parsed.naam),
    adres: strOfNull(parsed.adres),
    stad: strOfNull(parsed.stad),
    postcode: strOfNull(parsed.postcode),
    gebouw_type: strOfNull(parsed.gebouw_type),
    aantal_verdiepingen: intOfNull(parsed.aantal_verdiepingen),
    hoogte: numOfNull(parsed.hoogte),
    breedte: numOfNull(parsed.breedte),
    diepte: numOfNull(parsed.diepte),
    oppervlakte: numOfNull(parsed.oppervlakte),
    omschrijving: strOfNull(parsed.omschrijving),
  };
}

function splitsAdres(formatted: string): {
  adres: string | null;
  postcode: string | null;
  stad: string | null;
} {
  const delen = formatted
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  if (delen.length && /nederland|netherlands/i.test(delen[delen.length - 1]!)) delen.pop();
  const adres = delen[0] ?? null;
  let postcode: string | null = null;
  let stad: string | null = null;
  if (delen.length >= 2) {
    const laatste = delen[delen.length - 1]!;
    const m = laatste.match(/^(\d{4}\s?[A-Za-z]{2})\s+(.+)$/);
    if (m) {
      postcode = m[1]!.toUpperCase();
      stad = m[2]!;
    } else {
      stad = laatste;
    }
  }
  return { adres, postcode, stad };
}

// Vrije-tekst-analyse: de gebruiker beschrijft het gebouw in eigen woorden;
// de AI leidt de afzonderlijke velden af en verrijkt deze met geocoding en
// satellietanalyse waar mogelijk. Door de gebruiker genoemde waarden hebben
// altijd voorrang op de AI-schatting.
export async function analyseerGebouwVrijeTekst(beschrijving: string): Promise<GebouwAnalyse> {
  if (!OPENAI_KEY) return leegResultaat("OpenAI API-sleutel ontbreekt.");

  const extract = await extraheerUitTekst(beschrijving);
  if (!extract) {
    return leegResultaat(
      "De omschrijving kon niet worden verwerkt. Probeer het opnieuw of vul de velden handmatig in.",
    );
  }

  const result: GebouwAnalyse = {
    gevonden: true,
    naam: extract.naam,
    adres: extract.adres,
    stad: extract.stad,
    postcode: extract.postcode,
    adres_gevonden: null,
    latitude: null,
    longitude: null,
    satelliet_url: null,
    aantal_verdiepingen: extract.aantal_verdiepingen,
    hoogte: extract.hoogte,
    breedte: extract.breedte,
    diepte: extract.diepte,
    oppervlakte: extract.oppervlakte,
    gebouw_type: extract.gebouw_type,
    omschrijving: extract.omschrijving,
    toelichting: null,
    betrouwbaarheid: null,
  };

  const zoek =
    extract.zoekopdracht ||
    [extract.adres, extract.postcode, extract.stad].filter(Boolean).join(", ");

  if (GOOGLE_KEY && zoek) {
    const geo = await geocode(zoek);
    if (geo) {
      result.adres_gevonden = geo.formatted;
      result.latitude = geo.lat;
      result.longitude = geo.lng;

      const delen = splitsAdres(geo.formatted);
      result.adres = result.adres ?? delen.adres;
      result.stad = result.stad ?? delen.stad;
      result.postcode = result.postcode ?? delen.postcode;
      if (!result.naam && delen.adres) result.naam = delen.adres;

      const beeld = await haalSatellietBeeld(geo.lat, geo.lng);
      if (beeld) {
        result.satelliet_url = beeld.dataUrl;
        const velden = await analyseerBeeld(
          beeld.dataUrl,
          beeld.grondBreedteMeter,
          geo.formatted,
        );
        if (velden) {
          result.aantal_verdiepingen = result.aantal_verdiepingen ?? velden.aantal_verdiepingen;
          result.hoogte = result.hoogte ?? velden.hoogte;
          result.breedte = result.breedte ?? velden.breedte;
          result.diepte = result.diepte ?? velden.diepte;
          result.oppervlakte = result.oppervlakte ?? velden.oppervlakte;
          result.gebouw_type = result.gebouw_type ?? velden.gebouw_type;
          result.omschrijving = result.omschrijving ?? velden.omschrijving;
          result.toelichting = velden.toelichting;
          result.betrouwbaarheid = velden.betrouwbaarheid;
        }
      }
    }
  }

  if (!result.toelichting) {
    result.toelichting = result.adres_gevonden
      ? "Ingevuld op basis van uw omschrijving en het satellietbeeld."
      : "Ingevuld op basis van uw omschrijving. Geen adres gevonden voor een satellietanalyse.";
  }

  return result;
}
