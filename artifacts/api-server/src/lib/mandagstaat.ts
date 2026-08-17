// hint: Logic changed on both sides. Requires understanding intent of each change.
// UREN_01 §6c — de mandagstaat (mandagenregister).
//
// Genereert server-side een PDF met per medewerker per dag (ma-zo) de uren, met
// naam, geboortedatum en BSN, en handtekeningvelden voor opdrachtgever en
// onderaannemer (FPS). BEDOELD ALS ENIGE PLEK waar het BSN in de uitvoer van
// Connect verschijnt (§6c.3/§9.15): geen BSN in logs, exports of AI-aanroepen.
//
// Bron: alleen GOEDGEKEURDE uren (§7). Concreet: urenregistraties van de
// opdracht in de ISO-week waarvan de weekstaat van de medewerker de status
// goedgekeurd (of vergrendeld) heeft. Concept/ingediend telt niet mee; is er
// daardoor niets, dan is er geen genereerbare mandagstaat.
import PDFDocument from "pdfkit";
import { db } from "@workspace/db";
import { storageObjectsUrl } from "./storageObjectsUrl";
import {
  urenRegistratiesTable,
  weekStatenTable,
  medewerkersTable,
  werkgeversTable,
  opdrachtenTable,
  gebouwenTable,
  mandagstaatLogsTable,
} from "@workspace/db/schema";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage";
import sharp from "sharp";
import {
  resolveWerkgeverLogoSubPath,
  isSvgSubPath,
  berekenWerkgeverLogoPad,
} from "./werkgever-logo-pad";

// Fallback-kleur wanneer geen werkgever-branding beschikbaar is.
const FALLBACK_KLEUR = "#F23B0D";

const objectStorage = new ObjectStorageService();

// ── Centrale autorisatie (§6c.3/§9.15) ────────────────────────────────────────
// Eén policy die overal geldt: op de GET-route ÉN op elke factuurweg die de PDF
// genereert. Dwingt af:
//   - de opdracht heeft mandagstaat_vereist === true (anders geen mandagstaat);
//   - een klant krijgt dit NOOIT;
//   - personeel niveau ≥ 2 (personeelsgegevens/BSN) ÉN toegang tot de opdracht
//     via het gebouw (magBijGebouw), tenzij hoofdbeheerder.
// Retourneert een gestructureerde uitkomst zodat de aanroeper zelf bepaalt of
// het een 403/422 wordt (route) of een niet-blokkerende waarschuwing (factuur).
export interface MandagstaatToegang {
  toegestaan: boolean;
  // "niet_vereist" → vlag staat uit; "geen_recht" → onvoldoende rechten/klant.
  reden?: "niet_vereist" | "geen_recht";
  boodschap?: string;
}

// Minimale vorm van de permissie-service die we nodig hebben (ontkoppelt de lib
// van express/PermissieService-implementatie).
export interface MandagstaatPermissies {
  isHoofdbeheerder: boolean;
  heeftModuleRecht(module: string, minNiveau: number): boolean;
  magBijGebouw(gebouwId: number | null): boolean;
}

export function magMandagstaatGenereren(
  perm: MandagstaatPermissies,
  opdracht: { mandagstaatVereist: boolean; gebouwId: number | null },
): MandagstaatToegang {
  if (!opdracht.mandagstaatVereist) {
    return { toegestaan: false, reden: "niet_vereist", boodschap: "mandagstaat niet vereist op deze opdracht" };
  }
  if (!perm.heeftModuleRecht("personeel", 2)) {
    return { toegestaan: false, reden: "geen_recht", boodschap: "mandagstaat vereist personeel-beheerrecht (niveau 2)" };
  }
  if (!perm.isHoofdbeheerder && !perm.magBijGebouw(opdracht.gebouwId)) {
    return { toegestaan: false, reden: "geen_recht", boodschap: "geen toegang tot deze opdracht" };
  }
  return { toegestaan: true };
}

// ── ISO-weekhelpers (identiek aan routes/uren.ts) ─────────────────────────────
export function isoWeekNummer(datum: Date): number {
  const d = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()));
  const dag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dag);
  const jaarStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - jaarStart.getTime()) / 86400000 + 1) / 7);
}

export function isoJaarWeek(datum: Date): { jaar: number; week: number } {
  const d = new Date(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()));
  const dag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dag);
  return { jaar: d.getUTCFullYear(), week: isoWeekNummer(datum) };
}

export function weekGrenzen(jaar: number, week: number): { van: string; tot: string } {
  const jan4 = new Date(Date.UTC(jaar, 0, 4));
  const dag = jan4.getUTCDay() || 7;
  const maandag = new Date(jan4);
  maandag.setUTCDate(jan4.getUTCDate() - dag + 1 + (week - 1) * 7);
  const zondag = new Date(maandag);
  zondag.setUTCDate(maandag.getUTCDate() + 6);
  return {
    van: maandag.toISOString().slice(0, 10),
    tot: zondag.toISOString().slice(0, 10),
  };
}

// Weekstaat-statussen waaronder uren als "goedgekeurd" gelden (§7): een
// goedgekeurde of door HRM vergrendelde weekstaat. concept/ingediend/afgewezen
// tellen NOOIT mee.
const GOEDGEKEURDE_WEEKSTAAT_STATUS = ["goedgekeurd"];

export interface MandagstaatResultaat {
  ok: boolean;
  reden?: string;               // gevuld als ok=false (bijv. "geen goedgekeurde uren")
  pdf?: Buffer;
  medewerkerAantal: number;
  urenTotaal: number;
}

interface MedewerkerRij {
  medewerkerId: number;         // bewaard zodat werkgever via ID (niet naam) wordt opgezocht
  naam: string;
  geboortedatum: string | null;
  bsn: string | null;
  werkgeverId: number | null;   // voor deterministische branding-selectie
  perDag: number[];             // index 0=ma … 6=zo
  weektotaal: number;
}

// Verzamelt de goedgekeurde uren van een opdracht in een ISO-week, gegroepeerd
// per medewerker per dag. Retourneert null-inhoud wanneer er niets goedgekeurds is.
async function verzamelGoedgekeurdeUren(opdrachtId: number, jaar: number, week: number): Promise<{
  rijen: MedewerkerRij[];
  urenTotaal: number;
}> {
  const { van, tot } = weekGrenzen(jaar, week);

  // Alle uren van de opdracht in het weekbereik.
  const urenRows = await db
    .select({
      medewerkerId: urenRegistratiesTable.medewerkerId,
      datum: urenRegistratiesTable.datum,
      nettoUren: urenRegistratiesTable.nettoUren,
      naam: medewerkersTable.naam,
      geboortedatum: medewerkersTable.geboortedatum,
      bsn: medewerkersTable.bsn,
      werkgeverId: medewerkersTable.werkgeverId,
    })
    .from(urenRegistratiesTable)
    .leftJoin(medewerkersTable, eq(urenRegistratiesTable.medewerkerId, medewerkersTable.id))
    .where(and(
      eq(urenRegistratiesTable.opdrachtId, opdrachtId),
      gte(urenRegistratiesTable.datum, van),
      lte(urenRegistratiesTable.datum, tot),
    ));

  if (urenRows.length === 0) return { rijen: [], urenTotaal: 0 };

  // Bepaal per medewerker of de weekstaat van deze ISO-week goedgekeurd is.
  const medewerkerIds = [...new Set(urenRows.map((u) => u.medewerkerId))];
  const weekStaten = await db
    .select({ medewerkerId: weekStatenTable.medewerkerId, status: weekStatenTable.status, vergrendeld: weekStatenTable.vergrendeld })
    .from(weekStatenTable)
    .where(and(
      inArray(weekStatenTable.medewerkerId, medewerkerIds),
      eq(weekStatenTable.jaar, jaar),
      eq(weekStatenTable.weekNummer, week),
    ));
  const goedgekeurdeMedewerkers = new Set(
    weekStaten
      .filter((w) => GOEDGEKEURDE_WEEKSTAAT_STATUS.includes(w.status) || w.vergrendeld)
      .map((w) => w.medewerkerId),
  );

  const perMedewerker = new Map<number, MedewerkerRij>();
  let urenTotaal = 0;
  for (const u of urenRows) {
    if (!goedgekeurdeMedewerkers.has(u.medewerkerId)) continue; // §7: alleen goedgekeurd
    let rij = perMedewerker.get(u.medewerkerId);
    if (!rij) {
      rij = {
        medewerkerId: u.medewerkerId,
        naam: u.naam ?? `Medewerker #${u.medewerkerId}`,
        geboortedatum: u.geboortedatum ?? null,
        bsn: u.bsn ?? null,
        werkgeverId: u.werkgeverId ?? null,
        perDag: [0, 0, 0, 0, 0, 0, 0],
        weektotaal: 0,
      };
      perMedewerker.set(u.medewerkerId, rij);
    }
    // Dagindex 0=ma … 6=zo t.o.v. maandag van de week.
    const dagIndex = Math.floor((Date.UTC(
      Number(u.datum.slice(0, 4)), Number(u.datum.slice(5, 7)) - 1, Number(u.datum.slice(8, 10)),
    ) - Date.UTC(Number(van.slice(0, 4)), Number(van.slice(5, 7)) - 1, Number(van.slice(8, 10)))) / 86400000);
    if (dagIndex >= 0 && dagIndex <= 6) {
      rij.perDag[dagIndex] = Math.round((rij.perDag[dagIndex] + u.nettoUren) * 100) / 100;
      rij.weektotaal = Math.round((rij.weektotaal + u.nettoUren) * 100) / 100;
      urenTotaal = Math.round((urenTotaal + u.nettoUren) * 100) / 100;
    }
  }

  return { rijen: [...perMedewerker.values()].sort((a, b) => a.naam.localeCompare(b.naam)), urenTotaal };
}


interface WerkgeverBranding {
  naam: string;
  primaireKleur: string;
  logoUrl: string | null;
}

// Werkgever-branding: naam, huisstijlkleur en logo voor de mandagstaat.
//
// Bronprioriteit (stabiel → minder stabiel):
//   1. explicieteWerkgeverId — rechtstreeks van opdracht.gebouw.werkgever_id;
//      dit is de primaire, stabiele bron en verandert niet bij urenverschuivingen.
//   2. Dominant op basis van medewerkers-aantallen (bestaand gedrag) — alleen
//      als fallback wanneer het gebouw geen werkgever heeft of niet bestaat.
//
// Zoekt uitsluitend op werkgever-ID's — nooit op naam.
async function bepaalWerkgeverBranding(
  rijen: MedewerkerRij[],
  explicieteWerkgeverId: number | null = null,
): Promise<WerkgeverBranding> {
  const fallback: WerkgeverBranding = { naam: "FPS", primaireKleur: FALLBACK_KLEUR, logoUrl: null };

  // Bepaal welk werkgever-ID gebruikt wordt voor de PDF-opmaak.
  let werkgeverId: number | null = explicieteWerkgeverId;

  if (werkgeverId == null) {
    // Fallback: werkgever met de meeste medewerkers op de mandagstaat.
    const telPerWerkgever = new Map<number, number>();
    for (const r of rijen) {
      if (r.werkgeverId == null) continue;
      telPerWerkgever.set(r.werkgeverId, (telPerWerkgever.get(r.werkgeverId) ?? 0) + 1);
    }
    if (telPerWerkgever.size === 0) return fallback;
    werkgeverId = [...telPerWerkgever.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  }

  const [werkgever] = await db
    .select({
      naam: werkgeversTable.naam,
      primaireKleur: werkgeversTable.primaireKleur,
      logoUrl: werkgeversTable.logoUrl,
    })
    .from(werkgeversTable)
    .where(eq(werkgeversTable.id, werkgeverId))
    .limit(1);

  if (!werkgever) return fallback;
  return {
    naam: werkgever.naam,
    primaireKleur: werkgever.primaireKleur ?? FALLBACK_KLEUR,
    logoUrl: werkgever.logoUrl ?? null,
  };
}

// ── Logo-buffer download ──────────────────────────────────────────────────────
// Werkgever-logos MOETEN opgeslagen zijn onder het "werkgevers/"-prefix zodat
// server-side downloads nooit documenten met eigen gebouw/document-ACL kunnen
// raken. Uploads buiten dit prefix worden geweigerd. De PATCH /werkgevers/:id
// route migreert /objects/algemeen/<uuid>-paden naar werkgevers/<id>/logo.<ext>
// op het moment van opslaan. Zie lib/werkgever-logo-pad.ts voor de pure helpers.

async function haalLogoBuffer(logoUrl: string): Promise<Buffer | null> {
  try {
    const subPath = resolveWerkgeverLogoSubPath(logoUrl);
    if (subPath === null) return null;
    const buf = await objectStorage.downloadBestandBuffer(subPath);
    // PDFKit 0.19 ondersteunt alleen JPEG en PNG. SVG, WebP en GIF worden
    // via sharp naar PNG omgezet zodat ze correct in de PDF worden ingebed.
    // Bestaande SVG-logo's in de DB worden zo altijd weergegeven; nieuwe
    // SVG-uploads worden al geblokkeerd door POST/PATCH /werkgevers.
    const ext = subPath.toLowerCase().slice(subPath.lastIndexOf("."));
    if (ext === ".svg" || ext === ".webp" || ext === ".gif") {
      return await sharp(buf).png().toBuffer();
    }
    return buf;
  } catch {
    return null;
  }
}

const DAGKOPPEN = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

function tekenPdf(opts: {
  onderaannemer: string;
  primaireKleur: string;
  logoBuffer: Buffer | null;
  opdrachtTitel: string;
  werknummer: string | null;
  opdrachtgever: string | null;
  gebouwNaam: string | null;
  jaar: number;
  week: number;
  rijen: MedewerkerRij[];
  urenTotaal: number;
}): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const merkKleur = opts.primaireKleur || FALLBACK_KLEUR;

    // ── Kop: logo (indien beschikbaar) + werkgever-naam in merkkleur ──
    if (opts.logoBuffer) {
      try {
        doc.image(opts.logoBuffer, doc.page.margins.left, doc.y, { height: 36, fit: [120, 36] });
        doc.moveDown(2.8);
      } catch {
        // Logo kon niet worden gerenderd — sla over en ga door met tekstkop
      }
    }
    doc.fillColor(merkKleur).fontSize(18).font("Helvetica-Bold").text(opts.onderaannemer, { continued: false });
    doc.fillColor("#000000").fontSize(14).font("Helvetica-Bold").text("Mandagenregister", { align: "left" });
    doc.moveDown(0.3);

    doc.fontSize(10).font("Helvetica");
    const werkLabel = [opts.werknummer, opts.opdrachtTitel].filter(Boolean).join(" — ") || opts.opdrachtTitel;
    doc.text(`Werk: ${werkLabel}`);
    if (opts.gebouwNaam) doc.text(`Locatie: ${opts.gebouwNaam}`);
    doc.text(`Opdrachtgever: ${opts.opdrachtgever ?? "—"}`);
    doc.text(`Jaar / week: ${opts.jaar} / week ${opts.week}`);
    doc.moveDown(0.6);

    // ── Tabel ──
    const startX = doc.page.margins.left;
    const naamB = 150, gebB = 70, bsnB = 90, dagB = 42, totB = 50;
    let y = doc.y;

    const kolomX: number[] = [];
    let x = startX;
    kolomX.push(x); x += naamB;
    kolomX.push(x); x += gebB;
    kolomX.push(x); x += bsnB;
    for (let i = 0; i < 7; i++) { kolomX.push(x); x += dagB; }
    kolomX.push(x); // totaal

    function schrijfKopRij() {
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#000000");
      doc.text("Naam", kolomX[0], y, { width: naamB - 2 });
      doc.text("Geboortedatum", kolomX[1], y, { width: gebB - 2 });
      doc.text("BSN", kolomX[2], y, { width: bsnB - 2 });
      for (let i = 0; i < 7; i++) doc.text(DAGKOPPEN[i], kolomX[3 + i], y, { width: dagB - 2, align: "right" });
      doc.text("Totaal", kolomX[10], y, { width: totB - 2, align: "right" });
      y += 14;
      doc.moveTo(startX, y - 2).lineTo(kolomX[10] + totB, y - 2).strokeColor("#cccccc").stroke();
    }

    schrijfKopRij();

    doc.font("Helvetica").fontSize(8);
    for (const r of opts.rijen) {
      if (y > doc.page.height - doc.page.margins.bottom - 120) {
        doc.addPage();
        y = doc.y;
        schrijfKopRij();
        doc.font("Helvetica").fontSize(8);
      }
      doc.fillColor("#000000");
      doc.text(r.naam, kolomX[0], y, { width: naamB - 2 });
      doc.text(r.geboortedatum ?? "—", kolomX[1], y, { width: gebB - 2 });
      doc.text(r.bsn ?? "—", kolomX[2], y, { width: bsnB - 2 });
      for (let i = 0; i < 7; i++) {
        doc.text(r.perDag[i] ? r.perDag[i].toFixed(2).replace(".", ",") : "", kolomX[3 + i], y, { width: dagB - 2, align: "right" });
      }
      doc.text(r.weektotaal.toFixed(2).replace(".", ","), kolomX[10], y, { width: totB - 2, align: "right" });
      y += 14;
    }

    // Totaalregel
    doc.moveTo(startX, y).lineTo(kolomX[10] + totB, y).strokeColor("#999999").stroke();
    y += 4;
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#000000");
    doc.text("Totaal", kolomX[0], y, { width: naamB - 2 });
    doc.text(opts.urenTotaal.toFixed(2).replace(".", ","), kolomX[10], y, { width: totB - 2, align: "right" });
    y += 40;

    // ── Handtekeningvelden ──
    doc.font("Helvetica").fontSize(9).fillColor("#000000");
    const helft = (kolomX[10] + totB - startX) / 2;
    const kolA = startX;
    const kolB = startX + helft + 20;
    doc.text("Opdrachtgever", kolA, y);
    doc.text(`Onderaannemer (${opts.onderaannemer})`, kolB, y);
    y += 40;
    doc.moveTo(kolA, y).lineTo(kolA + helft - 40, y).strokeColor("#000000").stroke();
    doc.moveTo(kolB, y).lineTo(kolB + helft - 40, y).strokeColor("#000000").stroke();
    y += 4;
    doc.fontSize(8).fillColor("#555555");
    doc.text("Naam / datum", kolA, y);
    doc.text("Naam / datum", kolB, y);

    doc.end();
  });
}

// Publieke API: genereer de mandagstaat-PDF voor één opdracht + ISO-week.
// Bij ok=false is er geen genereerbare mandagstaat (geen goedgekeurde uren);
// de aanroeper beslist over 422 (route) of waarschuwing (factuur).
export async function genereerMandagstaat(opdrachtId: number, jaar: number, week: number): Promise<MandagstaatResultaat> {
  const [opdracht] = await db
    .select({
      titel: opdrachtenTable.titel,
      werknummer: opdrachtenTable.werknummer,
      opdrachtgever: opdrachtenTable.opdrachtgever,
      gebouwId: opdrachtenTable.gebouwId,
    })
    .from(opdrachtenTable)
    .where(eq(opdrachtenTable.id, opdrachtId))
    .limit(1);
  if (!opdracht) return { ok: false, reden: "opdracht niet gevonden", medewerkerAantal: 0, urenTotaal: 0 };

  const { rijen, urenTotaal } = await verzamelGoedgekeurdeUren(opdrachtId, jaar, week);
  if (rijen.length === 0) {
    return { ok: false, reden: "geen goedgekeurde uren", medewerkerAantal: 0, urenTotaal: 0 };
  }

  let gebouwNaam: string | null = null;
  let gebouwWerkgeverId: number | null = null;
  if (opdracht.gebouwId) {
    const [g] = await db
      .select({ naam: gebouwenTable.naam, werkgeverId: gebouwenTable.werkgeverId })
      .from(gebouwenTable)
      .where(eq(gebouwenTable.id, opdracht.gebouwId))
      .limit(1);
    gebouwNaam = g?.naam ?? null;
    // Stabiele bron: werkgever via het gekoppelde gebouw, ongeacht urenverdeling.
    gebouwWerkgeverId = g?.werkgeverId ?? null;
  }

  const branding = await bepaalWerkgeverBranding(rijen, gebouwWerkgeverId);
  const logoBuffer = branding.logoUrl ? await haalLogoBuffer(branding.logoUrl) : null;

  const pdf = await tekenPdf({
    onderaannemer: branding.naam,
    primaireKleur: branding.primaireKleur,
    logoBuffer,
    opdrachtTitel: opdracht.titel,
    werknummer: opdracht.werknummer ?? null,
    opdrachtgever: opdracht.opdrachtgever ?? null,
    gebouwNaam,
    jaar,
    week,
    rijen,
    urenTotaal,
  });

  return { ok: true, pdf, medewerkerAantal: rijen.length, urenTotaal };
}

// §6c.3: elke generatie vastleggen — wie/wanneer/welk werk. GEEN BSN in de log.
export async function logMandagstaatGeneratie(opts: {
  opdrachtId: number;
  jaar: number;
  week: number;
  gebruikerId: number | null;
  medewerkerAantal: number;
  urenTotaal: number;
}): Promise<void> {
  await db.insert(mandagstaatLogsTable).values({
    opdrachtId: opts.opdrachtId,
    jaar: opts.jaar,
    weekNummer: opts.week,
    gegenereerdDoorId: opts.gebruikerId,
    medewerkerAantal: opts.medewerkerAantal,
    urenTotaal: opts.urenTotaal.toFixed(2),
  });
}

// Bepaalt welke ISO-weken GOEDGEKEURDE uren van een opdracht hebben binnen een
// datumbereik (factuurperiode). Zelfde filter als de generator: alleen weken
// waarvan de weekstaat van de medewerker goedgekeurd (of vergrendeld) is —
// concept/ingediend telt NOOIT mee. Wanneer geen bereik: de laatst goedgekeurde
// week. Gebruikt door de factuurkoppeling (§6c.2).
export async function weekenVoorFactuur(opdrachtId: number, van: string | null, tot: string | null): Promise<Array<{ jaar: number; week: number }>> {
  const filters = [eq(urenRegistratiesTable.opdrachtId, opdrachtId)];
  if (van) filters.push(gte(urenRegistratiesTable.datum, van));
  if (tot) filters.push(lte(urenRegistratiesTable.datum, tot));

  const rows = await db
    .select({ datum: urenRegistratiesTable.datum, medewerkerId: urenRegistratiesTable.medewerkerId })
    .from(urenRegistratiesTable)
    .where(and(...filters));
  if (rows.length === 0) return [];

  // Kandidaatweken uit de uren.
  const kandidaten = new Map<string, { jaar: number; week: number; medewerkerIds: Set<number> }>();
  for (const r of rows) {
    const d = new Date(r.datum + "T00:00:00Z");
    const { jaar, week } = isoJaarWeek(d);
    const sleutel = `${jaar}-${week}`;
    let entry = kandidaten.get(sleutel);
    if (!entry) { entry = { jaar, week, medewerkerIds: new Set() }; kandidaten.set(sleutel, entry); }
    entry.medewerkerIds.add(r.medewerkerId);
  }

  // Behoud alleen weken waar minstens één medewerker een goedgekeurde/vergrendelde
  // weekstaat heeft (dezelfde definitie als verzamelGoedgekeurdeUren).
  const alleMedewerkers = [...new Set(rows.map((r) => r.medewerkerId))];
  const jaren = [...new Set([...kandidaten.values()].map((k) => k.jaar))];
  const weekNummers = [...new Set([...kandidaten.values()].map((k) => k.week))];
  const weekStaten = await db
    .select({ medewerkerId: weekStatenTable.medewerkerId, jaar: weekStatenTable.jaar, weekNummer: weekStatenTable.weekNummer, status: weekStatenTable.status, vergrendeld: weekStatenTable.vergrendeld })
    .from(weekStatenTable)
    .where(and(
      inArray(weekStatenTable.medewerkerId, alleMedewerkers),
      inArray(weekStatenTable.jaar, jaren),
      inArray(weekStatenTable.weekNummer, weekNummers),
    ));
  const goedgekeurd = new Set(
    weekStaten
      .filter((w) => GOEDGEKEURDE_WEEKSTAAT_STATUS.includes(w.status) || w.vergrendeld)
      .map((w) => `${w.jaar}-${w.weekNummer}-${w.medewerkerId}`),
  );

  const lijst = [...kandidaten.values()]
    .filter((k) => [...k.medewerkerIds].some((mid) => goedgekeurd.has(`${k.jaar}-${k.week}-${mid}`)))
    .map((k) => ({ jaar: k.jaar, week: k.week }))
    .sort((a, b) => a.jaar - b.jaar || a.week - b.week);

  // Zonder periode: alleen de laatste goedgekeurde week (pragmatisch, §6c.2).
  if (!van && !tot && lijst.length > 0) return [lijst[lijst.length - 1]];
  return lijst;
}

// ── Object storage voor de factuurbijlage (§6c.2) ─────────────────────────────
// Slaat een gegenereerde mandagstaat-PDF op naast de factuur, zodat aantoonbaar
// is dat hij "met de factuur meegaat". Retourneert een storage-URL (zelfde vorm
// als factuur-PDF's: /api/storage/objects/<subPath>).
export async function slaMandagstaatOp(opts: {
  factuurId: number;
  opdrachtId: number;
  jaar: number;
  week: number;
  pdf: Buffer;
}): Promise<string> {
  const subPath = `facturen/${opts.factuurId}/mandagstaten/mandagstaat-opdracht${opts.opdrachtId}-${opts.jaar}-week${opts.week}.pdf`;
  await objectStorage.uploadBestand(subPath, opts.pdf, "application/pdf");
  return storageObjectsUrl(subPath);
}

// ── Factuurkoppeling (§6c.2/§9.16) — hoge-orde helper ─────────────────────────
// Genereert en bewaart de mandagsta(a)t(en) voor een verkoopfactuur die op een
// mandagstaat-vereiste opdracht hangt, mits de acterende gebruiker de rechten
// heeft. Nooit blokkerend: zonder rechten of zonder goedgekeurde uren komt er
// alleen een waarschuwing terug.
export interface FactuurMandagstaatResultaat {
  paden: string[];            // storage-URL's van de opgeslagen PDF's
  waarschuwing: string | null;
}

export async function verwerkMandagstaatVoorFactuur(opts: {
  factuurId: number;
  opdracht: { id: number; mandagstaatVereist: boolean; gebouwId: number | null; werknummer: string | null };
  perm: MandagstaatPermissies;
  gebruikerId: number | null;
  van?: string | null;
  tot?: string | null;
}): Promise<FactuurMandagstaatResultaat> {
  const { factuurId, opdracht, perm, gebruikerId } = opts;

  // Vlag uit → helemaal geen mandagstaat aan de orde.
  if (!opdracht.mandagstaatVereist) return { paden: [], waarschuwing: null };

  // Centrale policy. Zonder recht: GEEN bijlage, wél een niet-blokkerende waarschuwing.
  const toegang = magMandagstaatGenereren(perm, opdracht);
  if (!toegang.toegestaan) {
    return {
      paden: [],
      waarschuwing: "Deze opdracht vereist een mandagstaat, maar deze is niet bijgevoegd (geen personeelsrecht). De factuur is niet geblokkeerd.",
    };
  }

  const weken = await weekenVoorFactuur(opdracht.id, opts.van ?? null, opts.tot ?? null);
  if (weken.length === 0) {
    return {
      paden: [],
      waarschuwing: "Deze opdracht vereist een mandagstaat, maar er zijn geen goedgekeurde uren om er een te genereren. De factuur is niet geblokkeerd.",
    };
  }

  const paden: string[] = [];
  const ontbrekend: string[] = [];
  for (const w of weken) {
    const res = await genereerMandagstaat(opdracht.id, w.jaar, w.week);
    if (res.ok && res.pdf) {
      const url = await slaMandagstaatOp({ factuurId, opdrachtId: opdracht.id, jaar: w.jaar, week: w.week, pdf: res.pdf });
      paden.push(url);
      await logMandagstaatGeneratie({
        opdrachtId: opdracht.id, jaar: w.jaar, week: w.week,
        gebruikerId, medewerkerAantal: res.medewerkerAantal, urenTotaal: res.urenTotaal,
      });
    } else {
      ontbrekend.push(`${w.jaar} week ${w.week}`);
    }
  }

  const waarschuwing = paden.length === 0
    ? "Deze opdracht vereist een mandagstaat, maar er zijn geen goedgekeurde uren om er een te genereren. De factuur is niet geblokkeerd."
    : ontbrekend.length > 0
      ? `Voor ${ontbrekend.join(", ")} kon geen mandagstaat gegenereerd worden (geen goedgekeurde uren).`
      : null;
  return { paden, waarschuwing };
}
