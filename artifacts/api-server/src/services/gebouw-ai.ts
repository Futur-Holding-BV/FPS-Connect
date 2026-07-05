import { logger } from "../lib/logger";
import { aiGateway, heeftGateway, type LogContext } from "../lib/aiGateway";
import {
  GEBOUW_VISION_PROMPT,
  GEBOUW_EXTRACTIE_PROMPT,
  TEKENING_ANALYSE_PROMPT,
  PLATTEGROND_ANALYSE_PROMPT,
} from "../lib/aiPrompts";

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;
const HEEFT_OPENAI = heeftGateway();

const STATIC_SIZE = 640;
const STATIC_SCALE = 2;
const STATIC_ZOOM = 19;

const STREET_SIZE = 640;
const STREET_SCALE = 2;

export interface GebouwSuggestie {
  label: string;
  adres: string | null;
  stad: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface GebouwAnalyse {
  gevonden: boolean;
  meerdere: boolean;
  suggesties: GebouwSuggestie[];
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
    meerdere: false,
    suggesties: [],
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
  adres: string | null;
  postcode: string | null;
  stad: string | null;
}

interface AdresComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

function parseComponents(components: AdresComponent[] | undefined): {
  adres: string | null;
  postcode: string | null;
  stad: string | null;
} {
  const zoek = (type: string) =>
    components?.find((c) => c.types.includes(type)) ?? null;
  const route = zoek("route")?.long_name ?? null;
  const huisnummer = zoek("street_number")?.long_name ?? null;
  const adres = route ? (huisnummer ? `${route} ${huisnummer}` : route) : null;
  const postcodeRuw = zoek("postal_code")?.long_name ?? null;
  const postcode = postcodeRuw ? postcodeRuw.toUpperCase().replace(/\s+/g, " ").trim() : null;
  const stad =
    zoek("locality")?.long_name ??
    zoek("postal_town")?.long_name ??
    zoek("administrative_area_level_2")?.long_name ??
    null;
  return { adres, postcode, stad };
}

type GeocodeUitkomst =
  | { ok: true; resultaten: GeocodeResultaat[] }
  | { ok: false; reden: string };

const MAPS_NIET_GEACTIVEERD =
  "De Google Maps API is niet geactiveerd voor de gebruikte API-sleutel. Activeer 'Geocoding API', 'Maps Static API' en 'Street View Static API' in de Google Cloud Console om automatisch invullen en het gevelbeeld te gebruiken.";

// Maximaal aantal suggesties dat bij onduidelijke invoer wordt teruggegeven.
const MAX_SUGGESTIES = 5;

// Haalt alle geocoding-kandidaten op voor de zoekterm. Resultaten worden ontdubbeld
// op het volledige adres en afgekapt op MAX_SUGGESTIES. Geen reverse-geocode hier:
// dat gebeurt alleen voor het uiteindelijk gekozen (enkelvoudige) resultaat.
async function geocodeAlle(adres: string): Promise<GeocodeUitkomst> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", adres);
  url.searchParams.set("key", GOOGLE_KEY!);
  url.searchParams.set("language", "nl");
  url.searchParams.set("region", "nl");
  // Beperk resultaten tot Nederland. `region` is slechts een zachte voorkeur; zonder deze
  // harde restrictie matcht Google vrije adressen soms over de grens (bv. een gelijknamige
  // straat in België), wat een verkeerd gevelbeeld zou opleveren.
  url.searchParams.set("components", "country:NL");

  let res: Response;
  try {
    res = await fetch(url.toString());
  } catch (err) {
    logger.error({ err }, "Geocoding netwerk-fout");
    return { ok: false, reden: "Het geocoding-verzoek mislukte door een netwerkfout." };
  }
  if (!res.ok) {
    logger.error({ status: res.status }, "Geocoding HTTP-fout");
    if (res.status === 403) return { ok: false, reden: MAPS_NIET_GEACTIVEERD };
    return { ok: false, reden: `Geocoding gaf een serverfout (HTTP ${res.status}).` };
  }
  const data = (await res.json()) as {
    status: string;
    error_message?: string;
    results: Array<{
      formatted_address: string;
      address_components?: AdresComponent[];
      geometry: { location: { lat: number; lng: number } };
    }>;
  };
  if (data.status === "REQUEST_DENIED" || data.status === "OVER_QUERY_LIMIT") {
    logger.error({ status: data.status, error: data.error_message }, "Geocoding geweigerd");
    return { ok: false, reden: MAPS_NIET_GEACTIVEERD };
  }
  if (data.status !== "OK" || data.results.length === 0) {
    logger.warn({ status: data.status }, "Geen geocoding-resultaat");
    return {
      ok: false,
      reden: "Geen adres gevonden voor de opgegeven omschrijving. Vul de velden eventueel handmatig in.",
    };
  }

  const gezien = new Set<string>();
  const resultaten: GeocodeResultaat[] = [];
  for (const r of data.results) {
    const sleutel = r.formatted_address.trim().toLowerCase();
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    const comp = parseComponents(r.address_components);
    resultaten.push({
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
      formatted: r.formatted_address,
      adres: comp.adres,
      postcode: comp.postcode,
      stad: comp.stad,
    });
    if (resultaten.length >= MAX_SUGGESTIES) break;
  }

  return { ok: true, resultaten };
}

// Vult een ontbrekende postcode (en eventueel stad/adres) aan via reverse-geocode op
// de coördinaten. POI/locatie-zoekresultaten missen vaak een postcode.
async function verrijkPostcode(geo: GeocodeResultaat): Promise<GeocodeResultaat> {
  if (geo.postcode) return geo;
  const omgekeerd = await reverseGeocode(geo.lat, geo.lng);
  if (!omgekeerd) return geo;
  return {
    ...geo,
    adres: geo.adres ?? omgekeerd.adres,
    postcode: geo.postcode ?? omgekeerd.postcode,
    stad: geo.stad ?? omgekeerd.stad,
  };
}

async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{ adres: string | null; postcode: string | null; stad: string | null } | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${lat},${lng}`);
  url.searchParams.set("key", GOOGLE_KEY!);
  url.searchParams.set("language", "nl");
  url.searchParams.set("region", "nl");
  url.searchParams.set("result_type", "street_address|premise|postal_code");
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status: string;
      results: Array<{ address_components?: AdresComponent[] }>;
    };
    if (data.status !== "OK" || data.results.length === 0) return null;
    // Zoek het eerste resultaat dat een postcode bevat.
    for (const res2 of data.results) {
      const c = parseComponents(res2.address_components);
      if (c.postcode) return c;
    }
    return parseComponents(data.results[0]!.address_components);
  } catch (err) {
    logger.warn({ err }, "Reverse-geocode mislukte");
    return null;
  }
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

// Kompasrichting (graden) van punt 1 naar punt 2 (Web Mercator / great-circle bearing).
function berekenHeading(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

// Geocodeert een vrij adres naar coördinaten en geeft de beste (eerste) treffer terug,
// of null wanneer er geen API-sleutel, geen invoer of geen resultaat is. Wordt gebruikt om
// ontbrekende gebouwcoördinaten op-aanvraag aan te vullen (bv. voor het gevelbeeld op het
// opleverrapport-voorblad), zodat dit ook werkt voor gebouwen die zonder automatisch
// invullen zijn aangemaakt.
export async function geocodeAdresNaarCoord(
  zoekterm: string,
): Promise<{ lat: number; lng: number } | null> {
  if (!GOOGLE_KEY || !zoekterm.trim()) return null;
  const uitkomst = await geocodeAlle(zoekterm.trim());
  if (!uitkomst.ok || uitkomst.resultaten.length === 0) return null;
  const beste = uitkomst.resultaten[0]!;
  return { lat: beste.lat, lng: beste.lng };
}

export async function haalStreetViewBeeld(lat: number, lng: number): Promise<string | null> {
  // Niet elke locatie heeft Street View-dekking; eerst de metadata controleren (gratis call).
  let panoLat: number | null = null;
  let panoLng: number | null = null;
  const metaUrl = new URL("https://maps.googleapis.com/maps/api/streetview/metadata");
  metaUrl.searchParams.set("location", `${lat},${lng}`);
  metaUrl.searchParams.set("source", "outdoor");
  metaUrl.searchParams.set("key", GOOGLE_KEY!);
  try {
    const metaRes = await fetch(metaUrl.toString(), { signal: AbortSignal.timeout(5000) });
    if (!metaRes.ok) return null;
    const meta = (await metaRes.json()) as {
      status: string;
      location?: { lat: number; lng: number };
    };
    if (meta.status !== "OK") {
      logger.info({ status: meta.status }, "Geen Street View-dekking voor locatie");
      return null;
    }
    if (meta.location) {
      panoLat = meta.location.lat;
      panoLng = meta.location.lng;
    }
  } catch (err) {
    logger.warn({ err }, "Street View metadata-fout");
    return null;
  }

  const url = new URL("https://maps.googleapis.com/maps/api/streetview");
  url.searchParams.set("size", `${STREET_SIZE}x${STREET_SIZE}`);
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("scale", String(STREET_SCALE));
  url.searchParams.set("fov", "80");
  url.searchParams.set("pitch", "10");
  url.searchParams.set("source", "outdoor");
  url.searchParams.set("return_error_code", "true");
  url.searchParams.set("key", GOOGLE_KEY!);
  // Richt de camera vanaf het opnamepunt expliciet op het gebouw, zodat de gevel
  // (en dus de verdiepingen) in beeld komt i.p.v. een willekeurige standaardrichting.
  if (panoLat != null && panoLng != null && (panoLat !== lat || panoLng !== lng)) {
    url.searchParams.set("heading", berekenHeading(panoLat, panoLng, lat, lng).toFixed(1));
  }

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(7000) });
    if (!res.ok) {
      logger.warn({ status: res.status }, "Street View Static HTTP-fout");
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch (err) {
    logger.warn({ err }, "Street View Static netwerk-fout");
    return null;
  }
}


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

interface StandaardWaarden {
  aantal_verdiepingen: number;
  hoogte: number;
  breedte: number;
  diepte: number;
  oppervlakte: number;
}

function standaardWaardenOpType(gebouwType: string | null): StandaardWaarden {
  const type = (gebouwType ?? "").toLowerCase();
  if (type.includes("woonhuis") || type.includes("woning") || type.includes("villa")) {
    return { aantal_verdiepingen: 2, hoogte: 7, breedte: 8, diepte: 10, oppervlakte: 80 };
  }
  if (type.includes("appartement") || type.includes("flat")) {
    return { aantal_verdiepingen: 5, hoogte: 15, breedte: 20, diepte: 15, oppervlakte: 300 };
  }
  if (type.includes("kantoor")) {
    return { aantal_verdiepingen: 3, hoogte: 11, breedte: 20, diepte: 15, oppervlakte: 300 };
  }
  if (type.includes("industri") || type.includes("bedrijfshal") || type.includes("loods") || type.includes("magazijn")) {
    return { aantal_verdiepingen: 1, hoogte: 9, breedte: 30, diepte: 25, oppervlakte: 750 };
  }
  if (type.includes("school") || type.includes("onderwijs")) {
    return { aantal_verdiepingen: 2, hoogte: 8, breedte: 30, diepte: 20, oppervlakte: 600 };
  }
  if (type.includes("winkel") || type.includes("retail")) {
    return { aantal_verdiepingen: 1, hoogte: 5, breedte: 15, diepte: 12, oppervlakte: 180 };
  }
  if (type.includes("zorg") || type.includes("ziekenhuis") || type.includes("kliniek")) {
    return { aantal_verdiepingen: 3, hoogte: 12, breedte: 40, diepte: 25, oppervlakte: 1000 };
  }
  // Standaard: middelgroot bedrijfspand
  return { aantal_verdiepingen: 2, hoogte: 7, breedte: 15, diepte: 12, oppervlakte: 180 };
}

async function analyseerBeeld(
  satellietUrl: string | null,
  grondBreedteMeter: number | null,
  adres: string,
  straatbeeldUrl: string | null = null,
): Promise<VisionVelden | null> {
  if (!satellietUrl && !straatbeeldUrl) return null;

  let userTekst: string;
  if (satellietUrl && straatbeeldUrl) {
    userTekst = `Adres: ${adres}. Het EERSTE beeld is een satellietbeeld (bovenaanzicht), vierkant en ongeveer ${grondBreedteMeter} bij ${grondBreedteMeter} meter op de grond — gebruik dit voor de footprint-afmetingen. Het TWEEDE beeld is een Street View-foto (zijaanzicht) van hetzelfde gebouw — gebruik dit om het gebouwtype te bepalen en het aantal bouwlagen te tellen aan de hand van de rijen ramen.`;
  } else if (satellietUrl) {
    userTekst = `Adres: ${adres}. Het satellietbeeld is vierkant en beslaat ongeveer ${grondBreedteMeter} bij ${grondBreedteMeter} meter op de grond. Analyseer het gebouw in het midden.`;
  } else {
    userTekst = `Adres: ${adres}. Het beeld is een Street View-foto (zijaanzicht/straatniveau) van het gebouw op dit adres. Bepaal het gebouwtype en tel het aantal bouwlagen aan de hand van de rijen ramen. Er is geen satellietbeeld beschikbaar, dus geef de footprint-afmetingen (breedte, diepte, oppervlakte) als ruwe schatting en houd de betrouwbaarheid daarvoor laag.`;
  }

  type ContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };

  const content: ContentPart[] = [
    { type: "text", text: userTekst },
  ];
  if (satellietUrl) {
    content.push({ type: "image_url", image_url: { url: satellietUrl } });
  }
  if (straatbeeldUrl) {
    content.push({ type: "image_url", image_url: { url: straatbeeldUrl } });
  }

  const aiResultaat = await aiGateway.chat("vision", {
    response_format: { type: "json_object" },
    max_completion_tokens: 800,
    messages: [
      { role: "system", content: GEBOUW_VISION_PROMPT.tekst },
      { role: "user", content },
    ],
  }, undefined, {
    module: "gebouwen",
    functie: "gebouw-vision",
    promptNaam: GEBOUW_VISION_PROMPT.naam,
    promptVersie: GEBOUW_VISION_PROMPT.versie,
  }); // gebouw-vision is called from analyseerBeeldUitExterneBronnen which is internal, no logCtx needed
  if (!aiResultaat.ok) return null;
  const tekst = aiResultaat.inhoud;
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
  const aiResultaat = await aiGateway.chat("fast", {
    response_format: { type: "json_object" },
    max_completion_tokens: 800,
    messages: [
      { role: "system", content: GEBOUW_EXTRACTIE_PROMPT.tekst },
      { role: "user", content: beschrijving },
    ],
  }, undefined, {
    module: "gebouwen",
    functie: "gebouw-extractie",
    promptNaam: GEBOUW_EXTRACTIE_PROMPT.naam,
    promptVersie: GEBOUW_EXTRACTIE_PROMPT.versie,
  }); // extraheerUitTekst is called from analyseerGebouwVrijeTekst which passes logCtx further up
  if (!aiResultaat.ok) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(aiResultaat.inhoud);
  } catch {
    logger.error({ tekst: aiResultaat.inhoud }, "Kon extractie-JSON niet parsen");
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

export interface TekeningAnalyse {
  tekening_naam: string;
  tekening_type: string;
  bouwlaag_naam: string | null;
  bouwlaag_niveau: number | null;
  bestaande_verdieping_id: number | null;
  toelichting: string | null;
  betrouwbaarheid: string | null;
}

const TEKENING_TYPES = [
  "plattegrond",
  "gevelaanzicht",
  "doorsnede",
  "situatietekening",
  "installatietekening",
  "detailtekening",
  "overig",
];


function valideerType(v: unknown): string {
  const s = strOfNull(v);
  if (s && TEKENING_TYPES.includes(s.toLowerCase())) return s.toLowerCase();
  return "overig";
}

function matchVerdiepingId(
  naam: string | null,
  niveau: number | null,
  bestaande: { id: number; naam: string; niveau: number }[],
): number | null {
  if (niveau != null) {
    const opNiveau = bestaande.find((v) => v.niveau === niveau);
    if (opNiveau) return opNiveau.id;
  }
  if (naam) {
    const n = naam.trim().toLowerCase();
    const opNaam = bestaande.find((v) => v.naam.trim().toLowerCase() === n);
    if (opNaam) return opNaam.id;
  }
  return null;
}

function basisTekeningNaam(bestandsnaam: string): string {
  return (
    bestandsnaam
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || bestandsnaam
  );
}

// Leidt op basis van de bestandsnaam een tekeningnaam en bouwlaag (naam + niveau)
// af. Het matchen met een bestaande bouwlaag gebeurt in code, zodat de AI alleen
// over naamgeving en nummering hoeft te oordelen.
export async function analyseerTekening(
  bestandsnaam: string,
  type: string | null,
  bestaandeVerdiepingen: { id: number; naam: string; niveau: number }[],
  logCtx?: Partial<LogContext>,
): Promise<TekeningAnalyse> {
  const valterug = (toelichting: string): TekeningAnalyse => ({
    tekening_naam: basisTekeningNaam(bestandsnaam),
    tekening_type: type && TEKENING_TYPES.includes(type) ? type : "plattegrond",
    bouwlaag_naam: null,
    bouwlaag_niveau: null,
    bestaande_verdieping_id: null,
    toelichting,
    betrouwbaarheid: "laag",
  });

  if (!HEEFT_OPENAI) {
    return valterug("AI niet beschikbaar; naam afgeleid van de bestandsnaam.");
  }

  const bestaandTekst = bestaandeVerdiepingen.length
    ? bestaandeVerdiepingen
        .map((v) => `- ${v.naam} (niveau ${v.niveau})`)
        .join("\n")
    : "(nog geen bouwlagen)";
  const userTekst = `Bestandsnaam: "${bestandsnaam}".\nReeds gekozen type: ${type || "(geen)"}.\nBestaande bouwlagen in dit gebouw:\n${bestaandTekst}\nKies, indien passend, een bouwlaagnaam en -niveau die aansluiten op de bestaande bouwlagen.`;

  const tekeningResultaat = await aiGateway.chat("fast", {
    response_format: { type: "json_object" },
    max_completion_tokens: 3000,
    messages: [
      { role: "system", content: TEKENING_ANALYSE_PROMPT.tekst },
      { role: "user", content: userTekst },
    ],
  }, undefined, {
    module: "gebouwen",
    functie: "tekening-analyse",
    promptNaam: TEKENING_ANALYSE_PROMPT.naam,
    promptVersie: TEKENING_ANALYSE_PROMPT.versie,
    ...logCtx,
  });
  if (!tekeningResultaat.ok) {
    logger.error({ fout: tekeningResultaat.fout }, "Tekening-analyse mislukte");
    return valterug("AI-analyse mislukte; naam afgeleid van de bestandsnaam.");
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(tekeningResultaat.inhoud);
  } catch {
    return valterug("AI-antwoord kon niet worden verwerkt.");
  }

  const bouwlaagNaam = strOfNull(parsed.bouwlaag_naam);
  const bouwlaagNiveau = intOfNull(parsed.bouwlaag_niveau);

  return {
    tekening_naam: strOfNull(parsed.tekening_naam) ?? basisTekeningNaam(bestandsnaam),
    tekening_type: valideerType(parsed.tekening_type),
    bouwlaag_naam: bouwlaagNaam,
    bouwlaag_niveau: bouwlaagNaam ? bouwlaagNiveau : null,
    bestaande_verdieping_id: matchVerdiepingId(
      bouwlaagNaam,
      bouwlaagNiveau,
      bestaandeVerdiepingen,
    ),
    toelichting: strOfNull(parsed.toelichting),
    betrouwbaarheid: strOfNull(parsed.betrouwbaarheid),
  };
}

export interface PlattegrondAnalyse {
  bouwlaag_naam: string | null;
  bouwlaag_niveau: number | null;
  bestaande_verdieping_id: number | null;
  toelichting: string | null;
  betrouwbaarheid: string | null;
}


// Leest de inhoud van een plattegrond (afbeelding/PDF-render) met vision en
// bepaalt de bijbehorende bouwlaag. Het matchen met een bestaande bouwlaag
// gebeurt in code via matchVerdiepingId.
export async function analyseerPlattegrond(
  afbeeldingDataUrl: string,
  bestaandeVerdiepingen: { id: number; naam: string; niveau: number }[],
  logCtx?: Partial<LogContext>,
): Promise<PlattegrondAnalyse> {
  const valterug = (toelichting: string): PlattegrondAnalyse => ({
    bouwlaag_naam: null,
    bouwlaag_niveau: null,
    bestaande_verdieping_id: null,
    toelichting,
    betrouwbaarheid: "laag",
  });

  if (!HEEFT_OPENAI) {
    return valterug("AI niet beschikbaar; kies de bouwlaag handmatig.");
  }

  const bestaandTekst = bestaandeVerdiepingen.length
    ? bestaandeVerdiepingen.map((v) => `- ${v.naam} (niveau ${v.niveau})`).join("\n")
    : "(nog geen bouwlagen)";
  const userTekst = `Bestaande bouwlagen in dit gebouw:\n${bestaandTekst}\nKies, indien passend, een bouwlaagnaam en -niveau die aansluiten op de bestaande bouwlagen. Lees de tekst in de plattegrond om de bouwlaag te bepalen.`;

  const plattegrondResultaat = await aiGateway.chat("vision", {
    response_format: { type: "json_object" },
    max_completion_tokens: 3000,
    messages: [
      { role: "system", content: PLATTEGROND_ANALYSE_PROMPT.tekst },
      {
        role: "user",
        content: [
          { type: "text", text: userTekst },
          { type: "image_url", image_url: { url: afbeeldingDataUrl } },
        ],
      },
    ],
  }, undefined, {
    module: "gebouwen",
    functie: "plattegrond-analyse",
    promptNaam: PLATTEGROND_ANALYSE_PROMPT.naam,
    promptVersie: PLATTEGROND_ANALYSE_PROMPT.versie,
    ...logCtx,
  });
  if (!plattegrondResultaat.ok) {
    logger.error({ fout: plattegrondResultaat.fout }, "Plattegrond-analyse mislukte");
    return valterug("AI-analyse mislukte; kies de bouwlaag handmatig.");
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(plattegrondResultaat.inhoud);
  } catch {
    return valterug("AI-antwoord kon niet worden verwerkt.");
  }

  const bouwlaagNaam = strOfNull(parsed.bouwlaag_naam);
  const bouwlaagNiveau = intOfNull(parsed.bouwlaag_niveau);

  return {
    bouwlaag_naam: bouwlaagNaam,
    bouwlaag_niveau: bouwlaagNaam ? bouwlaagNiveau : null,
    bestaande_verdieping_id: matchVerdiepingId(
      bouwlaagNaam,
      bouwlaagNiveau,
      bestaandeVerdiepingen,
    ),
    toelichting: strOfNull(parsed.toelichting),
    betrouwbaarheid: strOfNull(parsed.betrouwbaarheid),
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
//
// Robuustheid: de OpenAI-extractiestap en de vision-stap zijn omgeven door
// try/catch zodat een API-fout (quota, ongeldige sleutel, time-out) nooit
// als onbehandelde uitzondering naar de route-handler doorslaat.
// Fallback-volgorde: OpenAI-extractie → als dat mislukt, geocoding op de
// ruwe invoer → als dat ook mislukt, leeg resultaat met duidelijke melding.
export async function analyseerGebouwVrijeTekst(beschrijving: string, logCtx?: Partial<LogContext>): Promise<GebouwAnalyse> {
  if (!HEEFT_OPENAI && !GOOGLE_KEY) {
    return leegResultaat(
      "Zowel de OpenAI API-sleutel als de Google Maps API-sleutel ontbreken. " +
        "Activeer de sleutels in de omgevingsvariabelen of vul de velden handmatig in.",
    );
  }

  const ruwZoek = beschrijving.slice(0, 200).trim();

  // Stap 1+2 parallel: extractie en geocoding van de ruwe invoer gelijktijdig starten.
  // In de meeste gevallen is de zoekterm uit extractie gelijk aan of vergelijkbaar met de
  // ruwe invoer, zodat het parallelle geocoding-resultaat direct hergebruikt kan worden
  // en er geen tweede geocoding-ronde nodig is.
  const [extract, ruwGeoUitkomst] = await Promise.all([
    HEEFT_OPENAI
      ? extraheerUitTekst(beschrijving).catch((err) => {
          logger.warn({ err }, "extraheerUitTekst mislukte; val terug op directe geocoding");
          return null as ExtractieVelden | null;
        })
      : Promise.resolve(null as ExtractieVelden | null),
    GOOGLE_KEY
      ? geocodeAlle(ruwZoek)
      : Promise.resolve(null as GeocodeUitkomst | null),
  ]);

  // Bouw het resultaatobject op met wat de extractie opleverde (kan allemaal null zijn).
  const result: GebouwAnalyse = {
    gevonden: true,
    meerdere: false,
    suggesties: [],
    naam: extract?.naam ?? null,
    adres: extract?.adres ?? null,
    stad: extract?.stad ?? null,
    postcode: extract?.postcode ?? null,
    adres_gevonden: null,
    latitude: null,
    longitude: null,
    satelliet_url: null,
    aantal_verdiepingen: extract?.aantal_verdiepingen ?? null,
    hoogte: extract?.hoogte ?? null,
    breedte: extract?.breedte ?? null,
    diepte: extract?.diepte ?? null,
    oppervlakte: extract?.oppervlakte ?? null,
    gebouw_type: extract?.gebouw_type ?? null,
    omschrijving: extract?.omschrijving ?? null,
    toelichting: null,
    betrouwbaarheid: null,
  };

  // Bepaal de verfijnde zoekterm op basis van extractieresultaat.
  // Voorkeursvolgorde: zoekopdracht uit extractie → opgebouwde adresstring → ruwe invoer.
  const zoek =
    extract?.zoekopdracht ||
    [extract?.adres, extract?.postcode, extract?.stad].filter(Boolean).join(", ") ||
    ruwZoek;

  if (!GOOGLE_KEY) {
    // Geen kaart-API: tevreden met alleen de OpenAI-extractie.
    if (!extract) {
      return leegResultaat(
        "De Google Maps API-sleutel ontbreekt en de omschrijving kon niet worden verwerkt. " +
          "Vul de velden handmatig in.",
      );
    }
    result.toelichting =
      "Google Maps API-sleutel ontbreekt; geen adresopzoek of satellietanalyse mogelijk. " +
      "Alleen de uit uw tekst herkende velden zijn ingevuld.";
    return result;
  }

  // Stap 3: geocoding.
  // Hergebruik het parallelle resultaat als de verfijnde zoekterm niet afwijkt van de ruwe invoer.
  // Anders een nieuwe geocode-aanvraag met de betere zoekterm.
  const zoekWijktAf = zoek.trim().toLowerCase() !== ruwZoek.toLowerCase();
  const geoUitkomst: GeocodeUitkomst = zoekWijktAf || !ruwGeoUitkomst
    ? await geocodeAlle(zoek)
    : ruwGeoUitkomst;
  if (!geoUitkomst.ok) {
    // Geocoding mislukt. Als we via OpenAI al iets hebben gevonden, retourneer dat gedeeltelijk.
    result.toelichting = geoUitkomst.reden;
    if (!extract) {
      // Helemaal niets nuttig gevonden.
      return { ...result, gevonden: false };
    }
    // Gedeeltelijk resultaat: extractievelden zonder locatie.
    return result;
  }

  // Stap 3a: onduidelijke invoer → meerdere locaties. Toon suggesties en sla de
  // (dure) satelliet-/vision-analyse over. De velden blijven leeg zodat oude
  // gegevens niet onterecht blijven staan; de gebruiker kiest eerst de juiste locatie.
  if (geoUitkomst.resultaten.length > 1) {
    return {
      ...leegResultaat(
        "Meerdere mogelijke locaties gevonden. Kies hieronder de juiste locatie om verder in te vullen.",
      ),
      gevonden: true,
      meerdere: true,
      suggesties: geoUitkomst.resultaten.map((r) => ({
        label: r.formatted,
        adres: r.adres,
        stad: r.stad,
        postcode: r.postcode,
        latitude: r.lat,
        longitude: r.lng,
      })),
    };
  }

  // Stap 3b: precies één locatie → verrijk de postcode en ga door met volledige analyse.
  const geo = await verrijkPostcode(geoUitkomst.resultaten[0]!);
  result.adres_gevonden = geo.formatted;
  result.latitude = geo.lat;
  result.longitude = geo.lng;

  const delen = splitsAdres(geo.formatted);
  // Gestructureerde address_components (geo.*) zijn betrouwbaarder dan string-parsing (delen.*).
  result.adres = result.adres ?? geo.adres ?? delen.adres;
  result.stad = result.stad ?? geo.stad ?? delen.stad;
  result.postcode = result.postcode ?? geo.postcode ?? delen.postcode;
  if (!result.naam && (geo.adres ?? delen.adres)) result.naam = geo.adres ?? delen.adres;

  // Stap 4: satellietbeeld (bovenaanzicht) + Street View (zijaanzicht) ophalen en via AI analyseren.
  const [beeld, straatbeeld] = await Promise.all([
    haalSatellietBeeld(geo.lat, geo.lng),
    HEEFT_OPENAI ? haalStreetViewBeeld(geo.lat, geo.lng) : Promise.resolve(null),
  ]);
  if (beeld) {
    result.satelliet_url = beeld.dataUrl;
  }
  // Vision draait zodra er minstens één beeld beschikbaar is (satelliet en/of
  // Street View). Street View alleen is voldoende om gebouwtype en bouwlagen te
  // bepalen, ook wanneer het satellietbeeld ontbreekt (bv. wanneer de Static
  // Maps API niet op de Google-sleutel is geautoriseerd).
  if (HEEFT_OPENAI && (beeld || straatbeeld)) {
    try {
      const velden = await analyseerBeeld(
        beeld?.dataUrl ?? null,
        beeld?.grondBreedteMeter ?? null,
        geo.formatted,
        straatbeeld,
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
    } catch (err) {
      logger.warn({ err }, "analyseerBeeld mislukte; beeldanalyse overgeslagen");
      result.toelichting =
        "Adres gevonden, maar de beeldanalyse mislukte. " +
        "De afmetingen zijn niet automatisch geschat.";
    }
  }

  // Stap 5: Vul ontbrekende afmetingen altijd in met conservatieve standaardwaarden op basis
  // van gebouwtype. Zo zijn de velden nooit leeg na een succesvolle adresopzoek.
  const afmetingsVeldenOntbreken =
    result.gebouw_type === null ||
    result.aantal_verdiepingen === null ||
    result.hoogte === null ||
    result.breedte === null ||
    result.diepte === null ||
    result.oppervlakte === null;

  if (afmetingsVeldenOntbreken) {
    const defaults = standaardWaardenOpType(result.gebouw_type);
    const gebruikteDefaults: string[] = [];

    // Type gebruik nooit leeg laten: val terug op "overig" als het niet bepaald kon worden.
    if (result.gebouw_type === null) {
      result.gebouw_type = "overig";
      gebruikteDefaults.push("type gebruik");
    }
    if (result.aantal_verdiepingen === null) {
      result.aantal_verdiepingen = defaults.aantal_verdiepingen;
      gebruikteDefaults.push("verdiepingen");
    }
    if (result.hoogte === null) {
      result.hoogte = defaults.hoogte;
      gebruikteDefaults.push("hoogte");
    }
    if (result.breedte === null) {
      result.breedte = defaults.breedte;
      gebruikteDefaults.push("breedte");
    }
    if (result.diepte === null) {
      result.diepte = defaults.diepte;
      gebruikteDefaults.push("diepte");
    }
    if (result.oppervlakte === null) {
      result.oppervlakte = defaults.oppervlakte;
      gebruikteDefaults.push("oppervlakte");
    }

    if (gebruikteDefaults.length > 0) {
      const typeLabel = result.gebouw_type ?? "onbekend gebouwtype";
      const bronLabel = result.satelliet_url
        ? "satellietanalyse onvolledig"
        : HEEFT_OPENAI
          ? "geen satellietanalyse beschikbaar"
          : "geen AI-beeldanalyse beschikbaar (OpenAI-sleutel ontbreekt)";
      const fallbackToelichting =
        `Geschatte waarden voor ${gebruikteDefaults.join(", ")} zijn standaardschattingen ` +
        `voor gebouwtype "${typeLabel}" (${bronLabel}). Controleer en corrigeer deze waarden.`;
      result.toelichting = result.toelichting
        ? `${result.toelichting} ${fallbackToelichting}`
        : fallbackToelichting;
      // Zet betrouwbaarheid naar "laag" als er geen betere schatting beschikbaar was.
      if (!result.betrouwbaarheid || result.betrouwbaarheid === "laag") {
        result.betrouwbaarheid = "laag";
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
