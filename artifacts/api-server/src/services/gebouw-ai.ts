import OpenAI from "openai";
import { logger } from "../lib/logger";

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

const STATIC_SIZE = 640;
const STATIC_SCALE = 2;
const STATIC_ZOOM = 19;

const STREET_SIZE = 640;
const STREET_SCALE = 2;

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
  | { ok: true; resultaat: GeocodeResultaat }
  | { ok: false; reden: string };

const MAPS_NIET_GEACTIVEERD =
  "De Google Maps API is niet geactiveerd voor de gebruikte API-sleutel. Activeer 'Geocoding API' en 'Maps Static API' in de Google Cloud Console om automatisch invullen te gebruiken.";

async function geocode(adres: string): Promise<GeocodeUitkomst> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", adres);
  url.searchParams.set("key", GOOGLE_KEY!);
  url.searchParams.set("language", "nl");
  url.searchParams.set("region", "nl");

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
  const r = data.results[0];
  const comp = parseComponents(r.address_components);
  let gevondenAdres = comp.adres;
  let gevondenPostcode = comp.postcode;
  let gevondenStad = comp.stad;
  // POI/locatie-zoekresultaten missen vaak een postcode; haal die via reverse-geocode op de coördinaten op.
  if (!gevondenPostcode) {
    const omgekeerd = await reverseGeocode(r.geometry.location.lat, r.geometry.location.lng);
    if (omgekeerd) {
      gevondenPostcode = gevondenPostcode ?? omgekeerd.postcode;
      gevondenStad = gevondenStad ?? omgekeerd.stad;
      gevondenAdres = gevondenAdres ?? omgekeerd.adres;
    }
  }
  return {
    ok: true,
    resultaat: {
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
      formatted: r.formatted_address,
      adres: gevondenAdres,
      postcode: gevondenPostcode,
      stad: gevondenStad,
    },
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

async function haalStreetViewBeeld(lat: number, lng: number): Promise<string | null> {
  // Niet elke locatie heeft Street View-dekking; eerst de metadata controleren (gratis call).
  let panoLat: number | null = null;
  let panoLng: number | null = null;
  const metaUrl = new URL("https://maps.googleapis.com/maps/api/streetview/metadata");
  metaUrl.searchParams.set("location", `${lat},${lng}`);
  metaUrl.searchParams.set("source", "outdoor");
  metaUrl.searchParams.set("key", GOOGLE_KEY!);
  try {
    const metaRes = await fetch(metaUrl.toString(), { signal: AbortSignal.timeout(8000) });
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
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
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

const SYSTEM_PROMPT = `Je bent een expert bouwkundig analist. Je analyseert beeldmateriaal van een gebouw en schat de fysieke eigenschappen.
Je krijgt altijd een satellietbeeld (bovenaanzicht); het gebouw van belang staat in het MIDDEN van dat beeld. Soms krijg je daarnaast een tweede beeld: een Street View-foto (zijaanzicht/straatniveau) van hetzelfde gebouw.
Gebruik het satellietbeeld voor de footprint-afmetingen (breedte, diepte, oppervlakte) en de opgegeven schaal.
Gebruik de Street View-foto, indien aanwezig, om het aantal bouwlagen te BEPALEN door de rijen ramen/verdiepingen te tellen; dat is veel betrouwbaarder dan schatten. Ontbreekt de Street View-foto, schat het aantal dan o.b.v. gebouwtype/regio.
Zet betrouwbaarheid op "hoog" wanneer je de verdiepingen op een Street View-foto hebt kunnen tellen.
Geef uitsluitend geldige JSON terug met deze velden:
- aantal_verdiepingen (geheel getal): aantal bouwlagen; tel ze op de Street View-foto indien beschikbaar, schat anders
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
  straatbeeldUrl: string | null = null,
): Promise<VisionVelden | null> {
  const client = new OpenAI({ apiKey: OPENAI_KEY });
  const userTekst = straatbeeldUrl
    ? `Adres: ${adres}. Het EERSTE beeld is een satellietbeeld (bovenaanzicht), vierkant en ongeveer ${grondBreedteMeter} bij ${grondBreedteMeter} meter op de grond — gebruik dit voor de footprint-afmetingen. Het TWEEDE beeld is een Street View-foto (zijaanzicht) van hetzelfde gebouw — gebruik dit om het aantal bouwlagen te tellen aan de hand van de rijen ramen.`
    : `Adres: ${adres}. Het satellietbeeld is vierkant en beslaat ongeveer ${grondBreedteMeter} bij ${grondBreedteMeter} meter op de grond. Analyseer het gebouw in het midden.`;

  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: userTekst },
    { type: "image_url", image_url: { url: dataUrl } },
  ];
  if (straatbeeldUrl) {
    content.push({ type: "image_url", image_url: { url: straatbeeldUrl } });
  }

  const completion = await client.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    max_tokens: 800,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content },
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

const TEKENING_PROMPT = `Je helpt bij het registreren van een bouwtekening. Op basis van de bestandsnaam (en eventueel het reeds gekozen type) bepaal je een nette tekeningnaam en op welke bouwlaag de tekening hoort.
Geef uitsluitend geldige JSON terug met deze velden:
- tekening_naam (tekst): een nette, leesbare naam voor de tekening (verwijder bestandsextensie, koppeltekens en technische codes; gebruik normale Nederlandse hoofdletters).
- tekening_type (tekst): kies exact één uit: plattegrond, gevelaanzicht, doorsnede, situatietekening, installatietekening, detailtekening, overig.
- bouwlaag_naam (tekst of null): de bouwlaag waar de tekening bij hoort. Gebruik Nederlandse standaardnamen: "Kelder", "Begane grond", "1e verdieping", "2e verdieping", "Dak", enz. Null als de tekening niet bij één specifieke bouwlaag hoort (bijv. een situatietekening of gevelaanzicht van het hele gebouw).
- bouwlaag_niveau (geheel getal of null): het niveau van de bouwlaag. Kelder = -1 (lager = -2, -3), begane grond = 0, 1e verdieping = 1, 2e verdieping = 2, dak = hoogste verdieping + 1. Null als bouwlaag_naam null is.
- toelichting (korte Nederlandse tekst): waarom je deze bouwlaag en naam koos.
- betrouwbaarheid (tekst): "laag", "midden" of "hoog".
Verzin geen verdiepingen die niet uit de bestandsnaam blijken. Antwoord in het Nederlands. Alleen JSON, geen extra tekst.`;

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

  if (!OPENAI_KEY) {
    return valterug("AI niet beschikbaar; naam afgeleid van de bestandsnaam.");
  }

  const bestaandTekst = bestaandeVerdiepingen.length
    ? bestaandeVerdiepingen
        .map((v) => `- ${v.naam} (niveau ${v.niveau})`)
        .join("\n")
    : "(nog geen bouwlagen)";
  const userTekst = `Bestandsnaam: "${bestandsnaam}".\nReeds gekozen type: ${type || "(geen)"}.\nBestaande bouwlagen in dit gebouw:\n${bestaandTekst}\nKies, indien passend, een bouwlaagnaam en -niveau die aansluiten op de bestaande bouwlagen.`;

  let parsed: Record<string, unknown>;
  try {
    const client = new OpenAI({ apiKey: OPENAI_KEY });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      max_tokens: 400,
      messages: [
        { role: "system", content: TEKENING_PROMPT },
        { role: "user", content: userTekst },
      ],
    });
    const tekst = completion.choices[0]?.message?.content;
    if (!tekst) return valterug("Geen AI-antwoord ontvangen.");
    parsed = JSON.parse(tekst);
  } catch (err) {
    logger.error({ err }, "Tekening-analyse mislukte");
    return valterug("AI-analyse mislukte; naam afgeleid van de bestandsnaam.");
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

const PLATTEGROND_PROMPT = `Je analyseert een bouwkundige plattegrond van één bouwlaag van een gebouw. Bepaal bij welke bouwlaag deze plattegrond hoort op basis van de inhoud van de tekening: titelblok, stempel, labels of teksten zoals "Begane grond", "Verdieping 1", "1e verdieping", "2e verdieping", "Kelder", "Souterrain", "Dak", "Plattegrond BG", enzovoort.
Geef uitsluitend geldige JSON terug met deze velden:
- bouwlaag_naam (tekst of null): de bouwlaag waar de plattegrond bij hoort. Gebruik Nederlandse standaardnamen: "Kelder", "Begane grond", "1e verdieping", "2e verdieping", "Dak", enz. Null als je het niet uit de tekening kunt afleiden.
- bouwlaag_niveau (geheel getal of null): het niveau. Kelder = -1 (lager = -2, -3), begane grond = 0, 1e verdieping = 1, 2e verdieping = 2, dak = hoogste verdieping + 1. Null als bouwlaag_naam null is.
- toelichting (korte Nederlandse tekst): welke tekst of aanwijzing in de tekening je gebruikte.
- betrouwbaarheid (tekst): "laag", "midden" of "hoog".
Verzin geen bouwlaag die niet uit de tekening blijkt. Antwoord in het Nederlands. Alleen JSON, geen extra tekst.`;

// Leest de inhoud van een plattegrond (afbeelding/PDF-render) met vision en
// bepaalt de bijbehorende bouwlaag. Het matchen met een bestaande bouwlaag
// gebeurt in code via matchVerdiepingId.
export async function analyseerPlattegrond(
  afbeeldingDataUrl: string,
  bestaandeVerdiepingen: { id: number; naam: string; niveau: number }[],
): Promise<PlattegrondAnalyse> {
  const valterug = (toelichting: string): PlattegrondAnalyse => ({
    bouwlaag_naam: null,
    bouwlaag_niveau: null,
    bestaande_verdieping_id: null,
    toelichting,
    betrouwbaarheid: "laag",
  });

  if (!OPENAI_KEY) {
    return valterug("AI niet beschikbaar; kies de bouwlaag handmatig.");
  }

  const bestaandTekst = bestaandeVerdiepingen.length
    ? bestaandeVerdiepingen.map((v) => `- ${v.naam} (niveau ${v.niveau})`).join("\n")
    : "(nog geen bouwlagen)";
  const userTekst = `Bestaande bouwlagen in dit gebouw:\n${bestaandTekst}\nKies, indien passend, een bouwlaagnaam en -niveau die aansluiten op de bestaande bouwlagen. Lees de tekst in de plattegrond om de bouwlaag te bepalen.`;

  let parsed: Record<string, unknown>;
  try {
    const client = new OpenAI({ apiKey: OPENAI_KEY });
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      max_tokens: 400,
      messages: [
        { role: "system", content: PLATTEGROND_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: userTekst },
            { type: "image_url", image_url: { url: afbeeldingDataUrl } },
          ],
        },
      ],
    });
    const tekst = completion.choices[0]?.message?.content;
    if (!tekst) return valterug("Geen AI-antwoord ontvangen.");
    parsed = JSON.parse(tekst);
  } catch (err) {
    logger.error({ err }, "Plattegrond-analyse mislukte");
    return valterug("AI-analyse mislukte; kies de bouwlaag handmatig.");
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
export async function analyseerGebouwVrijeTekst(beschrijving: string): Promise<GebouwAnalyse> {
  if (!OPENAI_KEY && !GOOGLE_KEY) {
    return leegResultaat(
      "Zowel de OpenAI API-sleutel als de Google Maps API-sleutel ontbreken. " +
        "Activeer de sleutels in de omgevingsvariabelen of vul de velden handmatig in.",
    );
  }

  // Stap 1: probeer via OpenAI gestructureerde velden te extraheren uit de vrije tekst.
  // Bij een fout (ongeldige sleutel, quota, time-out) vallen we terug op geocoding van de ruwe invoer.
  let extract: ExtractieVelden | null = null;
  if (OPENAI_KEY) {
    try {
      extract = await extraheerUitTekst(beschrijving);
    } catch (err) {
      logger.warn({ err }, "extraheerUitTekst mislukte; val terug op directe geocoding");
    }
  }

  // Bouw het resultaatobject op met wat de extractie opleverde (kan allemaal null zijn).
  const result: GebouwAnalyse = {
    gevonden: true,
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

  // Stap 2: bepaal de zoekterm voor geocoding.
  // Voorkeursvolgorde: zoekopdracht uit extractie → opgebouwde adresstring → ruwe invoer.
  const zoek =
    extract?.zoekopdracht ||
    [extract?.adres, extract?.postcode, extract?.stad].filter(Boolean).join(", ") ||
    beschrijving.slice(0, 200).trim();

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
  const geoUitkomst = await geocode(zoek);
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

  const geo = geoUitkomst.resultaat;
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
    OPENAI_KEY ? haalStreetViewBeeld(geo.lat, geo.lng) : Promise.resolve(null),
  ]);
  if (beeld) {
    result.satelliet_url = beeld.dataUrl;
    if (OPENAI_KEY) {
      try {
        const velden = await analyseerBeeld(
          beeld.dataUrl,
          beeld.grondBreedteMeter,
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
        logger.warn({ err }, "analyseerBeeld mislukte; satellietanalyse overgeslagen");
        result.toelichting =
          "Adres gevonden, maar de satellietanalyse mislukte. " +
          "De afmetingen zijn niet automatisch geschat.";
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
