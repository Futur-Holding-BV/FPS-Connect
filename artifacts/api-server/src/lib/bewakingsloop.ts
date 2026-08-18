// WERKBAK_01 — de motor: één dagelijkse bewakingsloop die alle bestaande
// bewakingen laat draaien en de werkbak voedt. Hergebruikt het bestaande
// scheduleNext()-patroon (avgOpruiming/backupService); geen tweede planner.
// Idempotent: dedup via partiële unieke index op werkbak_items en de
// bestaande dedup-indexen van de bronmodules. Elke draai wordt gelogd in
// bewaking_draaien; blijft een draai uit, dan is dát een werkbak-item.
import {
  db,
  bewakingDraaienTable,
  contractSignaleringenTable,
  contractBesluitenTable,
  arbeidsovereenkomstenTable,
  financieleContractenTable,
  financieleContractSignaleringenTable,
  poortwachterDossiersTable,
  poortwachterMijlpalenTable,
  medewerkersTable,
  medewerkerOpleidingenTable,
  opleidingenTable,
  voertuigenTable,
  wagenparkSyncLogTable,
  documentenTable,
  documentKoppelingenTable,
  documentsoortenTable,
  factuurSignalenTable,
  facturenTable,
  goedkeuringAanvragenTable,
  verlofAanvragenTable,
  verlofsoortenTable,
  aanvraagVoorstellenTable,
  sepaBestandenTable,
  werkInboxMailsTable,
  werkInboxMailboxenTable,
  gereedschappenTable,
  inspectiesTable,
  gebouwenTable,
  voorzieningenTable,
  opdrachtenTable,
  regieMaterialenTable,
  modCalcHeadersTable,
  modCalcRegelsTable,
  factuurRegelsTable,
  artikelenTable,
  voorraadTable,
  magazijnSnoozesTable,
  functiesTable,
  ziekmeldingenTable,
  gebruikersTable,
  projectBegrotingenTable,
  werkbegrotingRegelsTable,
  inkoopplannenTable,
  inkoopplanRegelsTable,
  prijsafsprakenTable,
  leveranciersTable,
  appInstellingenTable,
  offertesTable,
  offerteTrackingTable,
  opnamesTable,
  calculatiesTable,
  uitrolRapportenTable,
} from "@workspace/db";
import { werkInboxMailboxToegangTable } from "@workspace/db";
import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lte, ne, notInArray, sql } from "drizzle-orm";
import { logger } from "./logger";
import { syncBron, meldWerkbakItem, type WerkbakInvoer } from "./werkbakService";
import { beoordeelVorigeWeek, bouwWeekControleItems, bouwTvtOpnameItems } from "./weekControle";
import { vindGebruikersMetFunctietitel } from "./bouwMeldingen";
import { haalInkoopHistorie, artikelSleutel, MIN_WAARNEMINGEN_INKOOP } from "./inkoopEigenCijfers";
import { berekenEffectieveBevoegdhedenBatch } from "./effectieve-bevoegdheden";
import { voerContractBewakingUit, haalCrucialeDatumItems } from "../routes/contract-bewaking";
import { berekenItems as berekenOhwItems } from "../routes/onderhanden-werk";
import { voerFinancieleContractBewakingUit } from "../routes/financiele-contracten";
import { haalVervalsignalen } from "./verlofVervalService";

const DAG_MS = 86400000;

function dagenTot(datumIso: string): number {
  const nu = new Date(); nu.setHours(0, 0, 0, 0);
  return Math.floor((new Date(datumIso).getTime() - nu.getTime()) / DAG_MS);
}

// ── Voeders ───────────────────────────────────────────────────────────────────
// Elke voeder levert de volledige actuele open-set voor zijn bron; syncBron
// maakt aan wat nieuw is en handelt af wat in de bron is opgelost.

// §5: Contractbesluit → HRM-rol (Doen); verstreken aanzegtermijn ook René.
// Plus contract-signaleringen als Weten voor HRM.
async function voedContracten(): Promise<{ nieuw: number; afgehandeld: number }> {
  await voerContractBewakingUit();
  const signalen = await db
    .select({ s: contractSignaleringenTable, medewerkerNaam: medewerkersTable.naam, eindDatum: arbeidsovereenkomstenTable.eindDatum })
    .from(contractSignaleringenTable)
    .leftJoin(medewerkersTable, eq(contractSignaleringenTable.medewerkerId, medewerkersTable.id))
    .leftJoin(arbeidsovereenkomstenTable, eq(contractSignaleringenTable.contractId, arbeidsovereenkomstenTable.id))
    .where(eq(contractSignaleringenTable.status, "nieuw"));

  // Contracten met al een besluit hoeven geen besluit-item meer.
  const besloten = new Set(
    (await db.select({ contractId: contractBesluitenTable.contractId }).from(contractBesluitenTable))
      .map((b) => b.contractId),
  );

  const items: WerkbakInvoer[] = [];
  for (const { s, medewerkerNaam, eindDatum } of signalen) {
    const naam = medewerkerNaam ?? "onbekende medewerker";
    const verstrekenAanzeg = s.type === "aanzegtermijn" && s.boodschap.includes("verlopen zonder");
    const besluitNodig = ["60_dagen", "30_dagen", "aanzegtermijn", "verlopen"].includes(s.type) && s.contractId != null && !besloten.has(s.contractId);
    if (besluitNodig) {
      items.push({
        soort: "doen",
        bron: "contractbesluit",
        titel: `Contractbesluit nodig voor ${naam}`,
        omschrijving: s.boodschap + (eindDatum ? ` Contract eindigt ${eindDatum}.` : ""),
        vereisteModule: "personeel",
        vereistNiveau: 2,
        alleenHoofdbeheerder: false,
        gewicht: s.type === "aanzegtermijn" || s.type === "verlopen" ? 90 : 70,
        actiePad: "/personeel/contracten",
        herkomstType: "contract_signalering",
        herkomstId: s.id,
        dedupSleutel: `contractbesluit:contract:${s.contractId}`,
      });
      if (verstrekenAanzeg || s.type === "verlopen") {
        // §5: bij verstreken aanzegtermijn ook René (hoofdbeheerder) — daar hangt geld aan.
        items.push({
          soort: "doen",
          bron: "contractbesluit",
          titel: `Aanzegtermijn verstreken: ${naam}`,
          omschrijving: s.boodschap,
          alleenHoofdbeheerder: true,
          gewicht: 95,
          actiePad: "/personeel/contracten",
          herkomstType: "contract_signalering",
          herkomstId: s.id,
          dedupSleutel: `contractbesluit:hb:contract:${s.contractId}`,
        });
      }
    } else if (!["60_dagen", "30_dagen", "aanzegtermijn", "verlopen"].includes(s.type)) {
      items.push({
        soort: "weten",
        bron: "contractbesluit",
        titel: `Contract ${naam}: ${s.boodschap}`,
        omschrijving: eindDatum ? `Contract eindigt ${eindDatum}.` : null,
        vereisteModule: "personeel",
        vereistNiveau: 2,
        gewicht: s.ernst === "kritiek" ? 60 : s.ernst === "waarschuwing" ? 40 : 20,
        actiePad: "/personeel/contracten",
        herkomstType: "contract_signalering",
        herkomstId: s.id,
        dedupSleutel: `contractsignaal:${s.id}`,
      });
    }
  }
  return syncBron("contractbesluit", items);
}

// §5: Abonnement/financieel contract verlengt automatisch → René (Weten).
async function voedFinancieleContracten(): Promise<{ nieuw: number; afgehandeld: number }> {
  await voerFinancieleContractBewakingUit();
  const signalen = await db
    .select({ s: financieleContractSignaleringenTable, naam: financieleContractenTable.naam })
    .from(financieleContractSignaleringenTable)
    .leftJoin(financieleContractenTable, eq(financieleContractSignaleringenTable.contractId, financieleContractenTable.id))
    .where(eq(financieleContractSignaleringenTable.status, "nieuw"));
  const items: WerkbakInvoer[] = signalen.map(({ s, naam }) => ({
    soort: "weten" as const,
    bron: "contract_verlenging",
    titel: `${naam ?? "Financieel contract"}: ${s.boodschap}`,
    omschrijving: s.bedrag != null ? `Bedrag: €${s.bedrag}` : null,
    alleenHoofdbeheerder: true,
    gewicht: (s.bedrag != null ? Math.min(40, Math.round(s.bedrag / 250)) : 0) + (s.ernst === "kritiek" ? 50 : 30),
    actiePad: "/financieel/contracten",
    herkomstType: "financiele_contract_signalering",
    herkomstId: s.id,
    dedupSleutel: `fincontract:${s.dedupeSleutel ?? s.id}`,
  }));
  return syncBron("contract_verlenging", items);
}

// §5 + HRM_01 §2.1: Poortwachter-mijlpalen → HRM (Weten→Doen); buiten termijn ook René.
// Privacy (HRM_01 §4): nooit medische informatie — alleen mijlpaal + naam + datum.
const PWT_LABELS: Record<string, string> = {
  probleemanalyse: "Probleemanalyse (bedrijfsarts)",
  plan_van_aanpak: "Plan van aanpak",
  uwv_melding: "UWV-melding langdurig ziekte",
  eerstejaarsevaluatie: "Eerstejaarsevaluatie",
  arbeidsdeskundig_onderzoek: "Arbeidsdeskundig onderzoek",
  wia_aanvraag: "WIA-aanvraag indienen",
  einde_loondoorbetaling: "Einde loondoorbetaling (104 weken)",
};

async function voedPoortwachter(): Promise<{ nieuw: number; afgehandeld: number }> {
  const mijlpalen = await db
    .select({ m: poortwachterMijlpalenTable, medewerkerNaam: medewerkersTable.naam, medewerkerId: medewerkersTable.id })
    .from(poortwachterMijlpalenTable)
    .innerJoin(poortwachterDossiersTable, eq(poortwachterMijlpalenTable.dossierId, poortwachterDossiersTable.id))
    .innerJoin(medewerkersTable, eq(poortwachterDossiersTable.medewerkerId, medewerkersTable.id))
    .where(isNull(poortwachterMijlpalenTable.afgerondOp));

  const items: WerkbakInvoer[] = [];
  for (const { m, medewerkerNaam, medewerkerId } of mijlpalen) {
    const dagen = dagenTot(m.deadlineDatum);
    const label = PWT_LABELS[m.type] ?? m.type;
    // HRM_01 §2.1: signaal op 21 en 7 dagen vóór; buiten termijn blijft staan
    // tot afgerond. Einde loondoorbetaling eerder (60 dagen).
    const venster = m.type === "einde_loondoorbetaling" ? 60 : 21;
    // RECHTEN_HRM_02 §4 — staat een mijlpaal langer dan 3 dagen klaar zonder
    // vrijgave, dan verschijnt dat als taak bij wie de vrijgavebevoegdheid
    // heeft. Dit staat bewust vóór de venster-check: ook een mijlpaal met een
    // verre deadline mag niet blijven hangen op vrijgave.
    if (m.klaargezetOp) {
      const dagenKlaar = Math.floor((Date.now() - m.klaargezetOp.getTime()) / 86400000);
      if (dagenKlaar > 3) {
        items.push({
          soort: "doen",
          bron: "poortwachter",
          titel: `Poortwachter: ${label} voor ${medewerkerNaam} wacht ${dagenKlaar} dagen op vrijgave`,
          omschrijving: `Klaargezet op ${m.klaargezetOp.toISOString().slice(0, 10)}, deadline ${m.deadlineDatum}. Zonder vrijgave telt de mijlpaal niet als afgerond en loopt de deadline door.`,
          vereisteModule: "hrm_vrijgave",
          vereistNiveau: 3,
          gewicht: dagen < 0 ? 100 : 80,
          actiePad: `/personeel/${medewerkerId}`,
          herkomstType: "poortwachter_mijlpaal",
          herkomstId: m.id,
          dedupSleutel: `poortwachter:vrijgave:${m.id}`,
        });
      }
    }
    if (dagen > venster) continue;
    const buitenTermijn = dagen < 0;
    items.push({
      soort: buitenTermijn ? "doen" : "weten",
      bron: "poortwachter",
      titel: buitenTermijn
        ? `Poortwachter: ${label} voor ${medewerkerNaam} is ${-dagen} dagen over de deadline`
        : `Poortwachter: ${label} voor ${medewerkerNaam} verloopt over ${dagen} dagen`,
      omschrijving: `Deadline ${m.deadlineDatum}. Een gemiste Poortwachter-mijlpaal kan tot 52 weken extra loondoorbetaling kosten.`,
      vereisteModule: "personeel",
      vereistNiveau: 2,
      gewicht: buitenTermijn ? 100 : dagen <= 7 ? 85 : 65,
      actiePad: `/personeel/${medewerkerId}`,
      herkomstType: "poortwachter_mijlpaal",
      herkomstId: m.id,
      dedupSleutel: `poortwachter:${m.id}`,
    });
    if (buitenTermijn) {
      items.push({
        soort: "weten",
        bron: "poortwachter",
        titel: `Poortwachter buiten termijn: ${label} (${medewerkerNaam})`,
        omschrijving: `Deadline was ${m.deadlineDatum} — hier hangt geld aan (UWV-sanctie).`,
        alleenHoofdbeheerder: true,
        gewicht: 100,
        actiePad: `/personeel/${medewerkerId}`,
        herkomstType: "poortwachter_mijlpaal",
        herkomstId: m.id,
        dedupSleutel: `poortwachter:hb:${m.id}`,
      });
    }
  }
  return syncBron("poortwachter", items);
}

// §5: Certificaat/keuring/APK/verzekering/lease verloopt → beheerder module (Weten).
async function voedVerloopdatums(): Promise<{ nieuw: number; afgehandeld: number }> {
  const items: WerkbakInvoer[] = [];

  // Certificaten (HRM_01 §2.3: 60 dagen venster).
  const certs = await db
    .select({ mo: medewerkerOpleidingenTable, opleidingNaam: opleidingenTable.naam, medewerkerNaam: medewerkersTable.naam, medewerkerId: medewerkersTable.id })
    .from(medewerkerOpleidingenTable)
    .leftJoin(opleidingenTable, eq(medewerkerOpleidingenTable.opleidingId, opleidingenTable.id))
    .innerJoin(medewerkersTable, eq(medewerkerOpleidingenTable.medewerkerId, medewerkersTable.id))
    .where(isNotNull(medewerkerOpleidingenTable.verlooptOp));
  for (const { mo, opleidingNaam, medewerkerNaam, medewerkerId } of certs) {
    const dagen = dagenTot(mo.verlooptOp!);
    if (dagen > 60) continue;
    items.push({
      soort: "weten",
      bron: "verloopdatum",
      titel: dagen < 0
        ? `Certificaat verlopen: ${opleidingNaam ?? "certificaat"} van ${medewerkerNaam}`
        : `Certificaat ${opleidingNaam ?? ""} van ${medewerkerNaam} verloopt over ${dagen} dagen`,
      omschrijving: `Vervaldatum ${mo.verlooptOp}. Met een verlopen certificaat mag bepaald werk niet worden uitgevoerd.`,
      vereisteModule: "personeel",
      vereistNiveau: 2,
      gewicht: dagen < 0 ? 80 : dagen <= 14 ? 70 : 45,
      actiePad: `/personeel/${medewerkerId}`,
      herkomstType: "medewerker_opleiding",
      herkomstId: mo.id,
      dedupSleutel: `certificaat:${mo.id}`,
    });
  }

  // Wagenpark: APK, verzekering, lease (30 dagen venster).
  const voertuigen = await db.select().from(voertuigenTable).where(eq(voertuigenTable.gearchiveerd, false));
  for (const v of voertuigen) {
    const checks: Array<{ soort: string; datum: Date | null }> = [
      { soort: "APK", datum: v.apkDatum },
      { soort: "Verzekering", datum: v.verzekeringVervalDat },
      { soort: "Lease", datum: v.leaseEindDatum },
    ];
    for (const c of checks) {
      if (!c.datum) continue;
      const dagen = dagenTot(c.datum.toISOString().slice(0, 10));
      if (dagen > 30) continue;
      items.push({
        soort: "weten",
        bron: "verloopdatum",
        titel: dagen < 0
          ? `${c.soort} van ${v.kenteken ?? "voertuig"} is verlopen`
          : `${c.soort} van ${v.kenteken ?? "voertuig"} verloopt over ${dagen} dagen`,
        omschrijving: `Vervaldatum ${c.datum.toISOString().slice(0, 10)}.`,
        vereisteModule: "wagenpark",
        vereistNiveau: 2,
        gewicht: dagen < 0 ? 75 : dagen <= 7 ? 65 : 40,
        actiePad: `/wagenpark/${v.id}`,
        herkomstType: "voertuig",
        herkomstId: v.id,
        dedupSleutel: `voertuig:${v.id}:${c.soort.toLowerCase()}`,
      });
    }

    // WAGENPARK_01 §4: km-gebonden onderhoud (zelfde drempel als het AI-advies:
    // nog ≤ 2000 km tot de onderhoudsbeurt) en bandenwissel "plannen".
    // Ontvanger: module wagenpark niveau 3 (§5.3-fallback — er is geen vaste
    // wagenparkbeheerder-toewijzing op voertuigniveau).
    if (v.onderhoudsIntervalKm && v.llaatstOnderhoudKm != null) {
      const kmRest = v.llaatstOnderhoudKm + v.onderhoudsIntervalKm - v.kmStand;
      if (kmRest <= 2000) {
        items.push({
          soort: "weten",
          bron: "verloopdatum",
          titel: kmRest <= 0
            ? `Onderhoudsbeurt van ${v.kenteken ?? "voertuig"} is over de km-grens (${Math.abs(kmRest)} km overschreden)`
            : `Onderhoudsbeurt van ${v.kenteken ?? "voertuig"} nadert: nog ${kmRest} km`,
          omschrijving: `Kilometerstand ${v.kmStand}, laatste beurt bij ${v.llaatstOnderhoudKm} km, interval ${v.onderhoudsIntervalKm} km.`,
          vereisteModule: "wagenpark",
          vereistNiveau: 3,
          gewicht: kmRest <= 0 ? 70 : 50,
          actiePad: `/wagenpark/${v.id}`,
          herkomstType: "voertuig",
          herkomstId: v.id,
          dedupSleutel: `voertuig:${v.id}:km_onderhoud`,
        });
      }
    }
    if (v.bandenwisselStatus === "plannen") {
      items.push({
        soort: "weten",
        bron: "verloopdatum",
        titel: `Bandenwissel plannen voor ${v.kenteken ?? "voertuig"}`,
        omschrijving: "De bandenwissel staat op 'plannen'.",
        vereisteModule: "wagenpark",
        vereistNiveau: 3,
        gewicht: 40,
        actiePad: `/wagenpark/${v.id}`,
        herkomstType: "voertuig",
        herkomstId: v.id,
        dedupSleutel: `voertuig:${v.id}:bandenwissel`,
      });
    }
  }

  // WAGENPARK_01 §2: voertuigdocumenten met vervaldatum — venster per
  // documentsoort (waarschuwing_dagen), niet één vaste 30 dagen.
  const docs = await db
    .select({
      docId: documentenTable.id,
      naam: documentenTable.naam,
      geldigTot: documentenTable.geldigTot,
      soortNaam: documentsoortenTable.naam,
      waarschuwingDagen: documentsoortenTable.waarschuwingDagen,
      heeftVervaldatum: documentsoortenTable.heeftVervaldatum,
      voertuigId: documentKoppelingenTable.doelId,
      kenteken: voertuigenTable.kenteken,
    })
    .from(documentenTable)
    .innerJoin(documentsoortenTable, eq(documentenTable.documentsoortId, documentsoortenTable.id))
    .innerJoin(documentKoppelingenTable, and(
      eq(documentKoppelingenTable.documentId, documentenTable.id),
      eq(documentKoppelingenTable.doelType, "voertuig"),
    ))
    .innerJoin(voertuigenTable, and(
      eq(voertuigenTable.id, documentKoppelingenTable.doelId),
      eq(voertuigenTable.gearchiveerd, false),
    ))
    .where(and(
      eq(documentenTable.gearchiveerd, false),
      isNotNull(documentenTable.geldigTot),
    ));
  for (const d of docs) {
    if (!d.heeftVervaldatum || !d.geldigTot) continue;
    const dagen = dagenTot(d.geldigTot);
    if (dagen > (d.waarschuwingDagen ?? 30)) continue;
    items.push({
      soort: "weten",
      bron: "verloopdatum",
      titel: dagen < 0
        ? `${d.soortNaam} van ${d.kenteken ?? "voertuig"} is verlopen`
        : `${d.soortNaam} van ${d.kenteken ?? "voertuig"} verloopt over ${dagen} dagen`,
      omschrijving: `Document '${d.naam}', geldig tot ${d.geldigTot}.`,
      vereisteModule: "wagenpark",
      vereistNiveau: 3,
      gewicht: dagen < 0 ? 75 : dagen <= 7 ? 65 : 40,
      actiePad: `/wagenpark/${d.voertuigId}`,
      herkomstType: "document",
      herkomstId: d.docId,
      dedupSleutel: `voertuigdoc:${d.docId}`,
    });
  }

  // KALENDER_01 §6: gereedschapskeuringen (30 dagen venster, zelfde aanpak).
  const gereedschappen = await db
    .select()
    .from(gereedschappenTable)
    .where(eq(gereedschappenTable.keuringsplichtig, true));
  for (const g of gereedschappen) {
    const datum = g.keuringVervalDatum?.toISOString().slice(0, 10)
      ?? (g.volgendeKeuring ? String(g.volgendeKeuring).slice(0, 10) : null);
    if (!datum || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) continue;
    const dagen = dagenTot(datum);
    if (dagen > 30) continue;
    const naam = g.omschrijving ?? g.volgnummer;
    items.push({
      soort: "weten",
      bron: "verloopdatum",
      titel: dagen < 0
        ? `Keuring van ${naam} is verlopen`
        : `Keuring van ${naam} verloopt over ${dagen} dagen`,
      omschrijving: `Keuringsdatum ${datum}${g.keuringNorm ? ` (${g.keuringNorm})` : ""}.`,
      vereisteModule: "gereedschappen",
      vereistNiveau: 2,
      gewicht: dagen < 0 ? 75 : dagen <= 7 ? 65 : 40,
      actiePad: `/gereedschappen/${g.id}`,
      herkomstType: "gereedschap",
      herkomstId: g.id,
      dedupSleutel: `gereedschap:${g.id}:keuring`,
    });
  }

  // KALENDER_01 §6: geplande (gebouw)inspecties die binnen 30 dagen moeten
  // gebeuren of over hun geplande datum heen zijn.
  const inspecties = await db
    .select({ i: inspectiesTable, gebouwNaam: gebouwenTable.naam })
    .from(inspectiesTable)
    .leftJoin(gebouwenTable, eq(inspectiesTable.gebouwId, gebouwenTable.id))
    .where(and(eq(inspectiesTable.status, "gepland"), isNotNull(inspectiesTable.geplandeDatum)));
  for (const { i, gebouwNaam } of inspecties) {
    if (!i.geplandeDatum || !/^\d{4}-\d{2}-\d{2}/.test(i.geplandeDatum)) continue;
    const dagen = dagenTot(i.geplandeDatum.slice(0, 10));
    if (dagen > 30) continue;
    items.push({
      soort: "weten",
      bron: "verloopdatum",
      titel: dagen < 0
        ? `Geplande inspectie${gebouwNaam ? ` bij ${gebouwNaam}` : ""} is over de datum`
        : `Inspectie${gebouwNaam ? ` bij ${gebouwNaam}` : ""} gepland over ${dagen} dagen`,
      omschrijving: `Geplande datum ${i.geplandeDatum.slice(0, 10)} (${i.type}).`,
      vereisteModule: "gebouwen",
      vereistNiveau: 2,
      gewicht: dagen < 0 ? 70 : dagen <= 7 ? 55 : 35,
      actiePad: i.gebouwId ? `/gebouwen/${i.gebouwId}` : "/gebouwen",
      herkomstType: "inspectie",
      herkomstId: i.id,
      dedupSleutel: `inspectie:${i.id}:gepland`,
    });
  }

  return syncBron("verloopdatum", items);
}

// WAGENPARK_01 §6.3: dagelijkse Traxgo-synchronisatie als onderdeel van de
// bewakingsloop, plus bewaking op het uitblijven ervan (>24u = werkbak-item).
async function voedWagenparkSync(): Promise<{ nieuw: number; afgehandeld: number }> {
  // Alleen syncen als er iets te syncen valt (voertuigen met provider-ID).
  const [koppelbaar] = await db
    .select({ n: sql<number>`count(*)` })
    .from(voertuigenTable)
    .where(and(isNotNull(voertuigenTable.providerVoertuigId), eq(voertuigenTable.gearchiveerd, false)));

  if (Number(koppelbaar?.n ?? 0) > 0) {
    const { voerWagenparkSyncUit } = await import("./wagenparkSync");
    await voerWagenparkSyncUit(null); // null = automatische draai (sync-log zonder gestart_door)
  }

  // Bewaking: laatste geslaagde sync ouder dan 24 uur (of nooit) → signaal.
  const items: WerkbakInvoer[] = [];
  if (Number(koppelbaar?.n ?? 0) > 0) {
    const [laatste] = await db
      .select()
      .from(wagenparkSyncLogTable)
      .where(eq(wagenparkSyncLogTable.status, "voltooid"))
      .orderBy(desc(wagenparkSyncLogTable.gestartOp))
      .limit(1);
    const teOud = !laatste?.voltooIdOp || Date.now() - laatste.voltooIdOp.getTime() > 24 * 3600 * 1000;
    if (teOud) {
      items.push({
        soort: "weten",
        bron: "bewakingsloop",
        titel: "Traxgo-synchronisatie heeft langer dan 24 uur niet gedraaid",
        omschrijving: laatste?.voltooIdOp
          ? `Laatste geslaagde sync: ${laatste.voltooIdOp.toLocaleString("nl-NL")}. Kilometerstanden en ritten lopen achter.`
          : "Er is nog nooit een geslaagde synchronisatie geregistreerd.",
        vereisteModule: "wagenpark",
        vereistNiveau: 3,
        gewicht: 60,
        actiePad: "/wagenpark",
        herkomstType: "wagenpark_sync",
        herkomstId: laatste?.id ?? null,
        dedupSleutel: "wagenpark:sync_uitgebleven",
      });
    } else {
      const { handelBronAf } = await import("./werkbakService");
      await handelBronAf("wagenpark:sync_uitgebleven");
    }
  }
  // syncBron niet gebruiken voor deze ene sleutel binnen de gedeelde bron
  // "bewakingsloop" (reconciliatie zou andermans items sluiten); meld direct.
  let nieuw = 0;
  for (const item of items) {
    if (await meldWerkbakItem(item)) nieuw += 1;
  }
  return { nieuw, afgehandeld: 0 };
}

// §5 + HRM_01 §2.4: verlofverjaring → HRM-rol (Weten), 8 weken vooraf.
async function voedVerlofverjaring(): Promise<{ nieuw: number; afgehandeld: number }> {
  const signalen = await haalVervalsignalen(56);
  const items: WerkbakInvoer[] = signalen.map((s) => ({
    soort: "weten" as const,
    bron: "verlofverjaring",
    titel: `Verlof van ${s.medewerker_naam ?? "medewerker"} vervalt over ${s.dagen_tot_verval} dagen (${Math.round((s.saldo_uren / 8) * 10) / 10} dagen saldo)`,
    omschrijving: `${s.verlofsoort_naam ?? "Verlof"} ${s.jaar}: ${s.saldo_uren} uur vervalt op ${s.vervalt_op}.`,
    vereisteModule: "personeel",
    vereistNiveau: 2,
    gewicht: s.urgentie === "kritiek" ? 60 : s.urgentie === "waarschuwing" ? 45 : 25,
    actiePad: "/personeel/verlof",
    herkomstType: "verlof_saldo",
    herkomstId: s.saldo_id,
    dedupSleutel: `verlofverjaring:${s.saldo_id}`,
  }));
  return syncBron("verlofverjaring", items);
}

// §5: Factuursignalen → Jacqueline (financieel), rekeningnummer gewijzigd ook René (Weten).
// UITROL_BEWAKING_01 — vergelijk de laatst gemelde uitrol (GitHub Actions
// meldt na élke run het verwachte commit via POST /uitrol/rapport) met de
// commit die dit proces daadwerkelijk draait (GIT_COMMIT uit het image).
// Lopen die uiteen, dan komt er één actiepunt bij de hoofdbeheerder mét de
// falende stap. Dedup-sleutel bevat het verwachte commit: zodra een volgende
// uitrol slaagt (versies weer gelijk) reconcilieert syncBron het item
// automatisch dicht. In dev (geen GIT_COMMIT) doet deze voeder niets.
export async function voedUitrolAchterloop(): Promise<{ nieuw: number; afgehandeld: number }> {
  const draaiend = process.env.GIT_COMMIT ?? "";
  const items: WerkbakInvoer[] = [];
  if (draaiend && draaiend !== "onbekend") {
    // Ordening op run_id (GitHub run-id's lopen monotoon op): een vertraagd
    // binnengekomen oude melding kan zo nooit "de laatste" worden. Re-runs
    // delen een run_id; dan wint de nieuwste rij (id).
    const [laatste] = await db
      .select()
      .from(uitrolRapportenTable)
      .orderBy(sql`${uitrolRapportenTable.runId} DESC NULLS LAST`, desc(uitrolRapportenTable.id))
      .limit(1);
    if (laatste && !laatste.commitSha.startsWith(draaiend)) {
      const kort = laatste.commitSha.slice(0, 8);
      const regels = [
        laatste.conclusie === "failure"
          ? `Uitrol mislukt op stap: ${laatste.falendeStap || "onbekend"}`
          : `Laatste uitrolmelding: ${laatste.conclusie} — maar de server draait een andere versie`,
        `Verwacht commit: ${kort} · draaiend: ${draaiend}`,
        laatste.runUrl ? `Actions-run: ${laatste.runUrl}` : null,
      ].filter(Boolean);
      items.push({
        soort: "doen",
        bron: "uitrol_achterloop",
        titel: `Productie loopt achter: commit ${kort} is niet uitgerold`,
        omschrijving: regels.join("\n"),
        alleenHoofdbeheerder: true,
        gewicht: 90,
        actiePad: "/beheer/systeemstatus",
        herkomstType: "uitrol_rapport",
        herkomstId: laatste.id,
        dedupSleutel: `uitrol-achterloop:${kort}`,
      });
    }
  }
  return syncBron("uitrol_achterloop", items);
}

async function voedFactuursignalen(): Promise<{ nieuw: number; afgehandeld: number }> {
  const signalen = await db
    .select({ s: factuurSignalenTable, relatienaam: facturenTable.relatienaam, factuurnummer: facturenTable.factuurnummer })
    .from(factuurSignalenTable)
    .leftJoin(facturenTable, eq(factuurSignalenTable.factuurId, facturenTable.id))
    .where(eq(factuurSignalenTable.status, "open"));
  const items: WerkbakInvoer[] = [];
  for (const { s, relatienaam, factuurnummer } of signalen) {
    const context = relatienaam ? ` (${relatienaam}${factuurnummer ? `, ${factuurnummer}` : ""})` : "";
    const naarRene = s.type === "rekeningnummer_gewijzigd";
    const basis = {
      soort: "weten" as const,
      bron: "factuursignaal" as const,
      titel: `${s.omschrijving}${context}`,
      omschrijving: null,
      gewicht: naarRene ? 85 : s.type === "termijn_loopt_af" ? 60 : 45,
      actiePad: s.factuurId ? `/facturen/${s.factuurId}` : "/facturen/stroom",
      herkomstType: "factuur_signaal",
      herkomstId: s.id,
    };
    items.push({ ...basis, vereisteModule: "financieel", vereistNiveau: 2, dedupSleutel: `factuursignaal:${s.id}` });
    if (naarRene) {
      items.push({ ...basis, alleenHoofdbeheerder: true, dedupSleutel: `factuursignaal:hb:${s.id}` });
    }
  }
  return syncBron("factuursignaal", items);
}

// LEVERANCIER_01 §3.3 — inkoopfacturen in de actieve stroom zonder koppeling
// aan het leveranciersregister. Er wordt nooit automatisch een leverancier
// aangemaakt: het item vraagt om een menselijke keuze (koppelen of aanmaken).
async function voedFacturenZonderLeverancier(): Promise<{ nieuw: number; afgehandeld: number }> {
  const facturen = await db
    .select({ id: facturenTable.id, relatienaam: facturenTable.relatienaam, factuurnummer: facturenTable.factuurnummer })
    .from(facturenTable)
    .where(and(
      eq(facturenTable.type, "inkoop"),
      isNull(facturenTable.leverancierId),
      inArray(facturenTable.status, ["ontvangen", "ai_gelezen", "controle_nodig", "te_beoordelen_pl", "wacht_op_inkoper", "wacht_op_goedkeuring", "klaar_voor_betaling", "klaar_voor_boeking"]),
    ));
  const items: WerkbakInvoer[] = facturen.map((f) => ({
    soort: "doen" as const,
    bron: "factuur_zonder_leverancier" as const,
    titel: `Factuur${f.factuurnummer ? ` ${f.factuurnummer}` : ""}${f.relatienaam ? ` van ${f.relatienaam}` : ""} is nog niet gekoppeld aan een leverancier`,
    omschrijving: "Koppel de factuur aan een bestaande leverancier of maak eerst een nieuwe leverancier aan in het leveranciersregister.",
    vereisteModule: "financieel",
    vereistNiveau: 2,
    gewicht: 50,
    actiePad: `/facturen/${f.id}`,
    herkomstType: "factuur",
    herkomstId: f.id,
    dedupSleutel: `factuur_zonder_leverancier:${f.id}`,
  }));
  return syncBron("factuur_zonder_leverancier", items);
}

// ── PRIJS_01 §7 — bewaking van prijsafspraken (jaarprijzen) ──────────────────
// (a) Afspraken die binnen N dagen aflopen (N = app_instellingen.prijsafspraak_
//     bewaking_dagen, standaard 60) → 'doen'-item bij financieel (niveau 2), met
//     verwijzing naar de marktspiegel om tijdig een nieuwe jaarprijs af te spreken.
// (b) Leveranciers waarvan ALLE afspraken zijn verlopen, maar met facturen in de
//     laatste 90 dagen → 'weten'-item: er wordt nog wél ingekocht zonder geldende
//     afspraak.
async function voedPrijsafsprakenVerlopen(): Promise<{ nieuw: number; afgehandeld: number }> {
  const [inst] = await db
    .select({ dagen: appInstellingenTable.prijsafspraakBewakingDagen })
    .from(appInstellingenTable)
    .orderBy(appInstellingenTable.id)
    .limit(1);
  const bewakingDagen = inst?.dagen ?? 60;

  const vandaag = new Date().toISOString().slice(0, 10);
  const grens = new Date();
  grens.setDate(grens.getDate() + bewakingDagen);
  const grensIso = grens.toISOString().slice(0, 10);

  // Niet-teruggedraaide afspraken met leveranciernaam.
  const afspraken = await db
    .select({
      id: prijsafsprakenTable.id,
      leverancierId: prijsafsprakenTable.leverancierId,
      leverancierNaam: leveranciersTable.naam,
      leverancierOmschrijving: prijsafsprakenTable.leverancierOmschrijving,
      leverancierArtikelcode: prijsafsprakenTable.leverancierArtikelcode,
      geldigTot: prijsafsprakenTable.geldigTot,
    })
    .from(prijsafsprakenTable)
    .leftJoin(leveranciersTable, eq(prijsafsprakenTable.leverancierId, leveranciersTable.id))
    .where(isNull(prijsafsprakenTable.teruggedraaidOp));

  const items: WerkbakInvoer[] = [];

  // (a) Aflopende afspraken (nog geldig vandaag, maar geldig_tot binnen N dagen).
  for (const a of afspraken) {
    if (a.geldigTot < vandaag) continue;      // al verlopen — valt onder (b)
    if (a.geldigTot > grensIso) continue;     // nog ruim geldig
    const dagen = dagenTot(a.geldigTot);
    const wat = a.leverancierArtikelcode ?? a.leverancierOmschrijving ?? "artikel";
    items.push({
      soort: "doen",
      bron: "prijsafspraak_verloopt",
      titel: `Jaarprijs ${a.leverancierNaam ?? "leverancier"} (${wat}) loopt ${dagen <= 0 ? "vandaag" : `over ${dagen} dag(en)`} af`,
      omschrijving: `De prijsafspraak is geldig t/m ${a.geldigTot}. Spreek tijdig een nieuwe jaarprijs af; raadpleeg de marktspiegel om de nieuwe prijs te onderbouwen.`,
      vereisteModule: "financieel",
      vereistNiveau: 2,
      gewicht: 50 + Math.max(0, bewakingDagen - Math.max(0, dagen)),
      actiePad: `/beheer/prijsafspraken`,
      herkomstType: "prijsafspraak",
      herkomstId: a.id,
      dedupSleutel: `prijsafspraak_verloopt:${a.id}`,
    });
  }

  // (b) Leveranciers met uitsluitend verlopen afspraken, maar recente facturen.
  const perLeverancier = new Map<number, { naam: string | null; alleVerlopen: boolean; heeftAfspraak: boolean }>();
  for (const a of afspraken) {
    const huidig = perLeverancier.get(a.leverancierId) ?? { naam: a.leverancierNaam, alleVerlopen: true, heeftAfspraak: false };
    huidig.heeftAfspraak = true;
    if (a.geldigTot >= vandaag) huidig.alleVerlopen = false;
    perLeverancier.set(a.leverancierId, huidig);
  }
  const kandidaatLeveranciers = [...perLeverancier.entries()].filter(([, v]) => v.heeftAfspraak && v.alleVerlopen).map(([id, v]) => ({ id, naam: v.naam }));

  if (kandidaatLeveranciers.length > 0) {
    const negentigDagenGeleden = new Date();
    negentigDagenGeleden.setDate(negentigDagenGeleden.getDate() - 90);
    const recenteFacturen = await db
      .select({ leverancierId: facturenTable.leverancierId })
      .from(facturenTable)
      .where(and(
        eq(facturenTable.type, "inkoop"),
        inArray(facturenTable.leverancierId, kandidaatLeveranciers.map((k) => k.id)),
        gte(facturenTable.aangemaaktOp, negentigDagenGeleden),
      ));
    const metRecenteFactuur = new Set(recenteFacturen.map((f) => f.leverancierId).filter((x): x is number => x != null));
    for (const lev of kandidaatLeveranciers) {
      if (!metRecenteFactuur.has(lev.id)) continue;
      items.push({
        soort: "weten",
        bron: "leverancier_afspraak_verlopen",
        titel: `Alle jaarprijzen van ${lev.naam ?? "leverancier"} zijn verlopen`,
        omschrijving: "Er wordt bij deze leverancier nog wél ingekocht (factuur in de laatste 90 dagen), maar er is geen geldende prijsafspraak meer. Overweeg een nieuwe jaarprijs vast te leggen.",
        vereisteModule: "financieel",
        vereistNiveau: 2,
        gewicht: 40,
        actiePad: `/beheer/prijsafspraken?leverancier_id=${lev.id}`,
        herkomstType: "leverancier",
        herkomstId: lev.id,
        dedupSleutel: `leverancier_afspraak_verlopen:${lev.id}`,
      });
    }
  }

  // Twee bronnen samen synchroniseren zou de niet-genoemde bron leegvegen; daarom
  // per bron apart syncen met de bijbehorende deelverzameling.
  const doenItems = items.filter((i) => i.bron === "prijsafspraak_verloopt");
  const wetenItems = items.filter((i) => i.bron === "leverancier_afspraak_verlopen");
  const r1 = await syncBron("prijsafspraak_verloopt", doenItems);
  const r2 = await syncBron("leverancier_afspraak_verlopen", wetenItems);
  return { nieuw: r1.nieuw + r2.nieuw, afgehandeld: r1.afgehandeld + r2.afgehandeld };
}

// §5 Doen-bronnen: goedkeuringsaanvragen, verlofaanvragen, factuur ter
// goedkeuring, betaalbatch, conceptantwoord, mail die antwoord nodig heeft,
// nieuwe leverancier (via factuursignaal onbekende_leverancier hierboven al
// gedekt als weten; het Doen-besluit loopt via de factuurstroom zelf).
async function voedGoedkeuringsaanvragen(): Promise<{ nieuw: number; afgehandeld: number }> {
  const open = await db.select().from(goedkeuringAanvragenTable).where(eq(goedkeuringAanvragenTable.status, "ingediend"));
  const items: WerkbakInvoer[] = open.map((a) => ({
    soort: "doen" as const,
    bron: "goedkeuringsaanvraag",
    titel: `Goedkeuring gevraagd: ${a.omschrijving ?? `${a.documentType} #${a.objectId}`}`,
    omschrijving: a.bedrag != null ? `Bedrag: €${a.bedrag}. Ingediend ${a.ingediendOp?.toLocaleDateString("nl-NL") ?? ""}.` : null,
    vereisteModule: "goedkeuring",
    vereistNiveau: 2,
    gewicht: 70 + (a.bedrag != null ? Math.min(25, Math.round(a.bedrag / 2000)) : 0),
    actiePad: "/beheer/goedkeuringen-dashboard",
    actieType: "goedkeuring_beslissen",
    herkomstType: "goedkeuring_aanvraag",
    herkomstId: a.id,
    dedupSleutel: `goedkeuring:${a.id}`,
  }));
  return syncBron("goedkeuringsaanvraag", items);
}

async function voedVerlofaanvragen(): Promise<{ nieuw: number; afgehandeld: number }> {
  const open = await db
    .select({ a: verlofAanvragenTable, medewerkerNaam: medewerkersTable.naam, soortNaam: verlofsoortenTable.naam })
    .from(verlofAanvragenTable)
    .innerJoin(medewerkersTable, eq(verlofAanvragenTable.medewerkerId, medewerkersTable.id))
    .leftJoin(verlofsoortenTable, eq(verlofAanvragenTable.verlofsoortId, verlofsoortenTable.id))
    .where(eq(verlofAanvragenTable.status, "aangevraagd"));
  const items: WerkbakInvoer[] = open.map(({ a, medewerkerNaam, soortNaam }) => ({
    soort: "doen" as const,
    bron: "verlofaanvraag",
    titel: `Verlofaanvraag van ${medewerkerNaam}: ${soortNaam ?? "verlof"} ${a.startDatum} t/m ${a.eindDatum}`,
    omschrijving: `${a.aantalUren} uur.${a.reden ? ` Reden: ${a.reden}` : ""}`,
    vereisteModule: "personeel",
    vereistNiveau: 2,
    gewicht: 55 + Math.max(0, 20 - Math.max(0, dagenTot(a.startDatum))),
    actiePad: "/personeel/verlof",
    actieType: "verlof_beoordelen",
    herkomstType: "verlofaanvraag",
    herkomstId: a.id,
    dedupSleutel: `verlofaanvraag:${a.id}`,
  }));
  return syncBron("verlofaanvraag", items);
}

async function voedFacturenTerGoedkeuring(): Promise<{ nieuw: number; afgehandeld: number }> {
  const open = await db.select().from(facturenTable).where(eq(facturenTable.status, "wacht_op_goedkeuring"));
  const items: WerkbakInvoer[] = open.map((f) => ({
    soort: "doen" as const,
    bron: "factuur_goedkeuring",
    titel: `Factuur goedkeuren: ${f.relatienaam ?? "onbekend"} ${f.factuurnummer ?? ""} (€${f.bedragInclBtw ?? "?"})`,
    omschrijving: f.omschrijving,
    vereisteModule: "financieel",
    vereistNiveau: 2,
    gewicht: 75 + Math.min(20, Math.round(Number(f.bedragInclBtw ?? 0) / 2500)),
    actiePad: `/facturen/${f.id}`,
    herkomstType: "factuur",
    herkomstId: f.id,
    dedupSleutel: `factuurgoedkeuring:${f.id}`,
  }));
  return syncBron("factuur_goedkeuring", items);
}

// §5: Betaalbatch vrijgeven → altijd René (Doen). SEPA-bestand dat klaar staat
// maar nog niet is gedownload/klaargezet voor de bank.
async function voedBetaalbatches(): Promise<{ nieuw: number; afgehandeld: number }> {
  const open = await db
    .select()
    .from(sepaBestandenTable)
    .where(and(eq(sepaBestandenTable.status, "ontvangen"), eq(sepaBestandenTable.onvolledig, false)));
  const items: WerkbakInvoer[] = open.map((s) => ({
    soort: "doen" as const,
    bron: "betaalbatch",
    titel: `Betaalbatch vrijgeven: ${s.omschrijving ?? s.bestandsnaam} (€${s.totaalbedrag ?? "?"})`,
    omschrijving: `${s.aantalBetalingen ?? "?"} betalingen${s.betaaldatum ? `, gewenste betaaldatum ${s.betaaldatum}` : ""}.`,
    alleenHoofdbeheerder: true,
    gewicht: 90,
    actiePad: "/sepa-bestanden",
    herkomstType: "sepa_bestand",
    herkomstId: s.id,
    dedupSleutel: `betaalbatch:${s.id}`,
  }));
  return syncBron("betaalbatch", items);
}

// §5: Conceptantwoord op een aanvraag → René of de werkvoorbereider (Doen).
async function voedConceptantwoorden(): Promise<{ nieuw: number; afgehandeld: number }> {
  const open = await db
    .select()
    .from(aanvraagVoorstellenTable)
    .where(and(
      eq(aanvraagVoorstellenTable.status, "open"),
      isNotNull(aanvraagVoorstellenTable.conceptAntwoord),
      isNull(aanvraagVoorstellenTable.antwoordVerstuurdOp),
    ));
  const items: WerkbakInvoer[] = open.map((v) => ({
    soort: "doen" as const,
    bron: "conceptantwoord",
    titel: `Conceptantwoord klaar voor: ${v.onderwerp || v.afzenderEmail}`,
    omschrijving: `Aanvraag van ${v.afzenderNaam ?? v.afzenderEmail}, binnengekomen ${v.binnengekomenOp.toLocaleDateString("nl-NL")}.`,
    vereisteModule: "offertes",
    vereistNiveau: 2,
    gewicht: 65,
    actiePad: "/crm/aanvragen",
    herkomstType: "aanvraag_voorstel",
    herkomstId: v.id,
    dedupSleutel: `conceptantwoord:${v.id}`,
  }));
  return syncBron("conceptantwoord", items);
}

// §5: Mail die antwoord nodig heeft → wie de mailbox behandelt (Doen).
// Mailboxen zijn organisatiebezit; "eigenaar" = gebruikers met recht behandelen/
// beheren. Zichtbaarheid loopt via mailbox-toegang; we zetten het item op de
// werk-inbox-bevoegdheid en linken naar de mailbox.
async function voedMailAntwoorden(): Promise<{ nieuw: number; afgehandeld: number }> {
  const open = await db
    .select({ m: werkInboxMailsTable, mailboxId: werkInboxMailboxenTable.id })
    .from(werkInboxMailsTable)
    .innerJoin(werkInboxMailboxenTable, eq(werkInboxMailsTable.mailboxAdres, werkInboxMailboxenTable.emailAdres))
    .where(and(
      eq(werkInboxMailsTable.samenwerkStatus, "open"),
      eq(werkInboxMailboxenTable.actief, true),
      eq(werkInboxMailboxenTable.modus, "verwerken"),
    ));
  // Alleen mails die al te lang open staan (2+ dagen) — de werk-inbox zelf is
  // de dagelijkse werklijst; de werkbak signaleert wat blijft liggen (§4.6).
  const grens = Date.now() - 2 * DAG_MS;
  const teLaat = open.filter(({ m }) => m.ontvangenOp.getTime() < grens);
  // Mailboxtoegang is fijnmaziger dan de CRM-module: onderwerp/afzender mogen
  // alleen zichtbaar zijn voor wie de mailbox mag behandelen of beheren.
  // Daarom persoonlijke items per gerechtigde gebruiker — nooit module-breed.
  const mailboxIds = [...new Set(teLaat.map(({ mailboxId }) => mailboxId))];
  const toegang = mailboxIds.length > 0
    ? await db.select().from(werkInboxMailboxToegangTable)
        .where(and(
          inArray(werkInboxMailboxToegangTable.mailboxId, mailboxIds),
          inArray(werkInboxMailboxToegangTable.recht, ["behandelen", "beheren"]),
        ))
    : [];
  const perMailbox = new Map<number, number[]>();
  for (const t of toegang) {
    const lijst = perMailbox.get(t.mailboxId) ?? [];
    lijst.push(t.gebruikerId);
    perMailbox.set(t.mailboxId, lijst);
  }
  const items: WerkbakInvoer[] = teLaat.flatMap(({ m, mailboxId }): WerkbakInvoer[] => {
    const gerechtigden = perMailbox.get(mailboxId) ?? [];
    const basis = {
      soort: "doen" as const,
      bron: "mail_antwoord",
      titel: `Mail wacht op antwoord: ${m.onderwerp || m.afzenderEmail}`,
      omschrijving: `${m.mailboxAdres} — binnengekomen ${m.ontvangenOp.toLocaleDateString("nl-NL")}.`,
      gewicht: 50,
      actiePad: "/werk-inbox",
      herkomstType: "werk_inbox_mail",
      herkomstId: m.id,
    };
    if (gerechtigden.length === 0) {
      // Geen behandelaars op deze mailbox → escaleren naar de hoofdbeheerder,
      // anders blijft de mail onzichtbaar hangen (stilte is geen optie).
      return [{ ...basis, alleenHoofdbeheerder: true, dedupSleutel: `mailantwoord:${m.id}:hb` }];
    }
    return gerechtigden.map((gebruikerId) => ({
      ...basis,
      gebruikerId,
      dedupSleutel: `mailantwoord:${m.id}:${gebruikerId}`,
    }));
  });
  return syncBron("mail_antwoord", items);
}

// ── WERKBAK_02 §3.1 — openstaande voorzieningen (dekt "meterkasten") ─────────
// Spots met een status die aangeeft dat er nog werk aan is, ouder dan de
// drempel (instelbaar via WERKBAK_VOORZIENING_DAGEN, standaard 14 dagen).
// Gebruikte statuswaarden (gemeld aan René, status is een vrije tekstkolom):
// voorbereid · in_uitvoering · wacht_op_akkoord · meerwerk_financieel.
// "concept" telt bewust niet mee (nog geen werkafspraak), afgeronde statussen
// (opgeleverd/goedgekeurd/vervallen/…) evenmin. Ontvanger: uitvoerder en
// werkvoorbereider (functietitels, zelfde adressering als BOUW_01).
const VOORZIENING_OPEN_STATUSSEN = ["voorbereid", "in_uitvoering", "wacht_op_akkoord", "meerwerk_financieel"];

async function voedOpenstaandeVoorzieningen(): Promise<{ nieuw: number; afgehandeld: number }> {
  const drempelDagen = Number(process.env.WERKBAK_VOORZIENING_DAGEN) || 14;
  const drempel = new Date(Date.now() - drempelDagen * 86_400_000);
  const rijen = await db
    .select({
      id: voorzieningenTable.id,
      status: voorzieningenTable.status,
      objectnummer: voorzieningenTable.objectnummer,
      gebouwId: voorzieningenTable.gebouwId,
      gebouwNaam: gebouwenTable.naam,
      bijgewerktOp: voorzieningenTable.bijgewerktOp,
    })
    .from(voorzieningenTable)
    .innerJoin(gebouwenTable, eq(gebouwenTable.id, voorzieningenTable.gebouwId))
    .where(and(
      inArray(voorzieningenTable.status, VOORZIENING_OPEN_STATUSSEN),
      eq(voorzieningenTable.gearchiveerd, false),
      lte(voorzieningenTable.bijgewerktOp, drempel),
    ));
  const [uitvoerderIds, wvbIds] = await Promise.all([
    vindGebruikersMetFunctietitel("Uitvoerder"),
    vindGebruikersMetFunctietitel("Werkvoorbereider"),
  ]);
  const ontvangers = [...new Set([...uitvoerderIds, ...wvbIds])];
  const items: WerkbakInvoer[] = rijen.flatMap((v): WerkbakInvoer[] => {
    const basis = {
      soort: "doen" as const,
      bron: "voorziening_openstaand",
      titel: `Spot ${v.objectnummer ?? `#${v.id}`} (${v.gebouwNaam}) staat al ${drempelDagen}+ dagen op "${v.status}"`,
      omschrijving: `Laatste wijziging ${v.bijgewerktOp.toISOString().slice(0, 10)}. Openstaand werk mag niet stilliggen zonder eigenaar.`,
      gewicht: 30,
      actiePad: `/gebouwen/${v.gebouwId}?spot=${v.id}`,
      herkomstType: "voorziening",
      herkomstId: v.id,
    };
    if (ontvangers.length === 0) {
      // Vangnet: niemand met de functietitel → bevoegdheidsgroep projecten≥3.
      return [{ ...basis, vereisteModule: "projecten", vereistNiveau: 3, dedupSleutel: `voorziening-openstaand:${v.id}:groep` }];
    }
    return ontvangers.map((gebruikerId) => ({ ...basis, gebruikerId, dedupSleutel: `voorziening-openstaand:${v.id}:${gebruikerId}` }));
  });
  return syncBron("voorziening_openstaand", items);
}

// ── WERKBAK_02 §3.2 — openstaand regiewerk ───────────────────────────────────
// Criterium (gemeld aan René): actieve regie-opdracht (opdrachten.type=regie,
// status=actief) met materiaalregels die nog niet gefactureerd zijn (status
// concept of goedgekeurd). Een expliciet klantakkoord-veld bestaat niet in de
// vier regie-tabellen — dat is als afwijking gemeld, niet stilzwijgend
// bijverzonnen. Ontvanger: werkvoorbereider.
async function voedRegieOpenstaand(): Promise<{ nieuw: number; afgehandeld: number }> {
  const rijen = await db
    .select({
      opdrachtId: opdrachtenTable.id,
      titel: opdrachtenTable.titel,
      aantalOpen: sql<number>`count(${regieMaterialenTable.id})::int`,
    })
    .from(opdrachtenTable)
    .innerJoin(regieMaterialenTable, eq(regieMaterialenTable.opdrachtId, opdrachtenTable.id))
    .where(and(
      eq(opdrachtenTable.type, "regie"),
      eq(opdrachtenTable.status, "actief"),
      inArray(regieMaterialenTable.status, ["concept", "goedgekeurd"]),
    ))
    .groupBy(opdrachtenTable.id, opdrachtenTable.titel);
  const wvbIds = await vindGebruikersMetFunctietitel("Werkvoorbereider");
  const items: WerkbakInvoer[] = rijen.flatMap((r): WerkbakInvoer[] => {
    const basis = {
      soort: "doen" as const,
      bron: "regie_openstaand",
      titel: `Regiewerk "${r.titel}" heeft ${r.aantalOpen} niet-gefactureerde regel(s)`,
      omschrijving: "Regiewerk zonder afronding: materiaalregels staan nog op concept of goedgekeurd maar zijn niet gefactureerd.",
      gewicht: 25,
      actiePad: `/opdrachten/${r.opdrachtId}`,
      herkomstType: "opdracht",
      herkomstId: r.opdrachtId,
    };
    if (wvbIds.length === 0) {
      return [{ ...basis, vereisteModule: "projecten", vereistNiveau: 3, dedupSleutel: `regie-openstaand:${r.opdrachtId}:groep` }];
    }
    return wvbIds.map((gebruikerId) => ({ ...basis, gebruikerId, dedupSleutel: `regie-openstaand:${r.opdrachtId}:${gebruikerId}` }));
  });
  return syncBron("regie_openstaand", items);
}

// WERKBAK_02 §3.3 — restwoningen: BEWUST OVERGESLAGEN. Deze bron komt uit
// PLANNER_01 §8 en kan pas gebouwd worden als de planner geïntegreerd is.
// Dit is expliciet gemeld (geen stille weglating).

// ── AI_01 §3 — proactieve AI-signalen als voeders ────────────────────────────
// ONTWERPKEUZE (vastgesteld): de detectie hieronder is DETERMINISTISCH op de
// eigen cijfers — er worden GEEN LLM-aanroepen in de bewakingsloop gedaan
// (kosten + betrouwbaarheid: twee runs op dezelfde data moeten hetzelfde
// signaal geven). Het werkbak-item is een "doen"-taak met concrete handeling in
// de titel en de onderbouwing (waarvan wijkt het af, met hoeveel, hoeveel
// waarnemingen, welke periode) in de omschrijving. Het actiePad verwijst naar
// het scherm waar de bestaande AI-analyse desgewenst opgevraagd kan worden.
// Zwijgen boven gokken: onder de bestaande waarnemingsdrempels
// (calculatie ≥5 via MIN_WAARNEMINGEN, inkoop ≥3 via MIN_WAARNEMINGEN_INKOOP)
// komt er geen item. syncBron reconcilieert: opgelost → item afgehandeld.

const AI_AFWIJKING_DREMPEL_PCT = 30; // AI_01 §3: ondergrens voor "wijkt af".
const AI_CALC_MIN_WAARNEMINGEN = 5;  // spiegelt MIN_WAARNEMINGEN in calculatieEigenCijfers.ts.

function aiNormaliseer(tekst: string): string {
  return tekst.toLowerCase().replace(/\s+/g, " ").trim();
}

function aiMediaan(waarden: number[]): number {
  const s = [...waarden].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

// Vergelijkbare "stukprijs per eenheid" voor een calc-regel: materiaaltarief +
// arbeid (MU × arbeidstarief). Identiek aan calculatieEigenCijfers.ts.
function aiRegelEenheidsprijs(r: { tarief: number; muPerEenheid: number | null; arbeidsTarief: number | null }): number {
  return Number(r.tarief) + Number(r.muPerEenheid ?? 0) * Number(r.arbeidsTarief ?? 0);
}

function aiRegelsoortSleutel(omschrijving: string, eenheid: string): string {
  return `${aiNormaliseer(omschrijving)}|${aiNormaliseer(eenheid)}`;
}

// Review-bevinding (AUTORISATIELEK): een rechtstreeks geadresseerd werkbak-item
// (gebruikerId) omzeilt de module-check in zichtbaarVoor() — de ontvanger ziet
// het ongeacht bevoegdheid. Deze AI-items bevatten prijzen/afwijkingen, dus elke
// directe ontvanger MOET actueel het benodigde niveau op de relevante module
// hebben. Deze helper filtert een lijst gebruiker-ids op module≥niveau via de
// effectieve bevoegdheden (opgeslagen + functie-profiel). Wie het recht mist,
// valt weg; heeft geen enkele ontvanger het recht, dan gebruikt de voeder het
// bestaande groepsvangnet (dat wél door zichtbaarVoor() wordt gecontroleerd).
async function filterOntvangersOpBevoegdheid(
  gebruikerIds: number[],
  module: string,
  minNiveau: number,
): Promise<number[]> {
  if (gebruikerIds.length === 0) return [];
  const gebruikers = await db
    .select({ id: gebruikersTable.id, rol: gebruikersTable.rol, bevoegdheden: gebruikersTable.bevoegdheden })
    .from(gebruikersTable)
    .where(inArray(gebruikersTable.id, gebruikerIds));
  const effectief = await berekenEffectieveBevoegdhedenBatch(
    gebruikers.map((g) => ({ id: g.id, rol: g.rol, storedBevoegdheden: g.bevoegdheden })),
  );
  return gebruikers
    .filter((g) => ((effectief.get(g.id) ?? {})[module] ?? 0) >= minNiveau)
    .map((g) => g.id);
}

// Korte, stabiele hash zodat de dedupSleutel niet afhangt van speciale tekens
// in een omschrijving (§3: dedupSleutels stabiel per onderwerp).
function aiHash(tekst: string): string {
  let h = 0;
  for (let i = 0; i < tekst.length; i++) {
    h = (Math.imul(31, h) + tekst.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

// ── AI_01 §3.1 — calculatieregel wijkt af van de eigen historische mediaan ────
// Nog niet-definitieve calculaties (status concept/intern_akkoord) waarvan een
// regel ≥30% afwijkt van de eigen mediaan per regelsoort. De mediaan wordt
// bepaald over regels uit ÁNDERE headers (zelfde groepering als
// calculatieEigenCijfers.ts: omschrijving+eenheid genormaliseerd, prijs =
// tarief + MU×arbeidstarief), alleen bij ≥5 waarnemingen (anders zwijgen).
// Ontvanger: header.aangemaaktDoorId; vangnet: bevoegdheidsgroep calculaties≥1
// (de calculatie-routes eisen requireBevoegdheid("calculaties", 1) voor lezen).
const AI_CALC_OPEN_STATUSSEN = ["concept", "intern_akkoord"];

async function voedAiCalculatieAfwijking(): Promise<{ nieuw: number; afgehandeld: number }> {
  const openHeaders = await db
    .select({ id: modCalcHeadersTable.id, naam: modCalcHeadersTable.naam, aangemaaktDoorId: modCalcHeadersTable.aangemaaktDoorId })
    .from(modCalcHeadersTable)
    .where(inArray(modCalcHeadersTable.status, AI_CALC_OPEN_STATUSSEN));
  const openHeaderIds = new Set(openHeaders.map((h) => h.id));
  const headerInfo = new Map(openHeaders.map((h) => [h.id, h] as const));

  const calcIds = openHeaders.map((h) => h.id);
  if (calcIds.length === 0) return syncBron("ai_calculatie_afwijking", []);

  const openRegels = await db
    .select({
      id: modCalcRegelsTable.id,
      calculatieId: modCalcRegelsTable.calculatieId,
      omschrijving: modCalcRegelsTable.omschrijving,
      eenheid: modCalcRegelsTable.eenheid,
      tarief: modCalcRegelsTable.tarief,
      muPerEenheid: modCalcRegelsTable.muPerEenheid,
      arbeidsTarief: modCalcRegelsTable.arbeidsTarief,
    })
    .from(modCalcRegelsTable)
    .where(inArray(modCalcRegelsTable.calculatieId, calcIds));

  // PERFORMANCE: alleen de regelsoorten (genormaliseerde omschrijving+eenheid)
  // die in de open concept/intern_akkoord-headers voorkomen bepalen de
  // vergelijking. Begrens de historische query in SQL tot die paren i.p.v. ALLE
  // mod_calc_regels te lezen. Match op lower(trim(...)) zodat de SQL-normalisatie
  // aiNormaliseer() (toLowerCase + spaties inklappen + trim) benadert; de
  // definitieve groepering gebeurt daarna in JS via aiRegelsoortSleutel.
  const openParen = new Map<string, { omschrijving: string; eenheid: string }>();
  for (const r of openRegels) {
    openParen.set(aiRegelsoortSleutel(r.omschrijving, r.eenheid), { omschrijving: r.omschrijving, eenheid: r.eenheid });
  }
  const paarVoorwaarden = [...openParen.values()].map((p) =>
    sql`(lower(btrim(${modCalcRegelsTable.omschrijving})) = ${aiNormaliseer(p.omschrijving)} AND lower(btrim(${modCalcRegelsTable.eenheid})) = ${aiNormaliseer(p.eenheid)})`,
  );

  // Historische mediaan per regelsoort: alle regels (uit welke header dan ook)
  // die tot een van de open regelsoorten behoren. Per header sluiten we later de
  // eigen regels uit door op headerId te vergelijken.
  const historischeRegels = paarVoorwaarden.length > 0
    ? await db
        .select({
          calculatieId: modCalcRegelsTable.calculatieId,
          omschrijving: modCalcRegelsTable.omschrijving,
          eenheid: modCalcRegelsTable.eenheid,
          tarief: modCalcRegelsTable.tarief,
          muPerEenheid: modCalcRegelsTable.muPerEenheid,
          arbeidsTarief: modCalcRegelsTable.arbeidsTarief,
        })
        .from(modCalcRegelsTable)
        .where(sql.join(paarVoorwaarden, sql` OR `))
    : [];

  // Per regelsoort: alle (headerId, prijs). Mediaan over andere headers =
  // volledige lijst minus de bijdragen van de eigen header.
  const perSoort = new Map<string, Array<{ headerId: number; prijs: number }>>();
  for (const r of historischeRegels) {
    const sleutel = aiRegelsoortSleutel(r.omschrijving, r.eenheid);
    const lijst = perSoort.get(sleutel) ?? [];
    lijst.push({ headerId: r.calculatieId, prijs: aiRegelEenheidsprijs(r) });
    perSoort.set(sleutel, lijst);
  }

  // AUTORISATIELEK-fix: aangemaaktDoorId en functietitel-ontvangers zijn direct
  // geadresseerd → geen module-check in zichtbaarVoor(). Filter beide op
  // calculaties≥1 (het leesniveau dat de calculatie-routes eisen).
  const aangemaaktDoorKandidaten = [...new Set(openHeaders.map((h) => h.aangemaaktDoorId).filter((v): v is number => v != null))];
  const calcTitelKandidaten = await vindGebruikersMetFunctietitel("Calculator");
  const [gerechtigdeAangemaaktDoor, calcGroepIds] = await Promise.all([
    filterOntvangersOpBevoegdheid(aangemaaktDoorKandidaten, "calculaties", 1),
    filterOntvangersOpBevoegdheid(calcTitelKandidaten, "calculaties", 1),
  ]);
  const aangemaaktDoorGerechtigd = new Set(gerechtigdeAangemaaktDoor);

  // Per header: verzamel de afwijkende regelsoorten (één item per header, niet
  // per regel — anders overspoelt één rommelige calculatie de werkbak).
  const afwijkendPerHeader = new Map<number, Array<{ soortLabel: string; prijs: number; mediaan: number; afwPct: number; aantal: number }>>();
  for (const r of openRegels) {
    if (!openHeaderIds.has(r.calculatieId)) continue;
    const sleutel = aiRegelsoortSleutel(r.omschrijving, r.eenheid);
    const alle = perSoort.get(sleutel) ?? [];
    const andere = alle.filter((x) => x.headerId !== r.calculatieId).map((x) => x.prijs);
    if (andere.length < AI_CALC_MIN_WAARNEMINGEN) continue; // zwijgen boven gokken
    const med = aiMediaan(andere);
    if (med <= 0) continue;
    const prijs = aiRegelEenheidsprijs(r);
    const afwPct = ((prijs - med) / med) * 100;
    if (Math.abs(afwPct) < AI_AFWIJKING_DREMPEL_PCT) continue;
    const lijst = afwijkendPerHeader.get(r.calculatieId) ?? [];
    lijst.push({ soortLabel: `${r.omschrijving} (${r.eenheid})`, prijs, mediaan: med, afwPct, aantal: andere.length });
    afwijkendPerHeader.set(r.calculatieId, lijst);
  }

  const items: WerkbakInvoer[] = [];
  for (const [headerId, afwijkingen] of afwijkendPerHeader) {
    const header = headerInfo.get(headerId);
    if (!header) continue;
    // Stabiele dedup: header + hash van de gesorteerde afwijkende regelsoorten,
    // zodat een gecorrigeerde/veranderde afwijking als nieuw onderwerp geldt en
    // een ongewijzigde afwijking geen dagelijks duplicaat oplevert.
    const soortSleutels = afwijkingen.map((a) => aiRegelsoortSleutel(a.soortLabel, "")).sort();
    const regelsoortHash = aiHash(soortSleutels.join("|"));
    const detail = afwijkingen
      .map((a) => `"${a.soortLabel}" ${a.prijs.toFixed(2)}/eenh vs eigen mediaan ${a.mediaan.toFixed(2)} (${a.afwPct >= 0 ? "+" : ""}${a.afwPct.toFixed(0)}%, ${a.aantal} waarnemingen)`)
      .join("; ");
    const basis = {
      soort: "doen" as const,
      bron: "ai_calculatie_afwijking",
      titel: `Controleer calculatie "${header.naam}": ${afwijkingen.length} regel(s) wijken ≥${AI_AFWIJKING_DREMPEL_PCT}% af van je eigen mediaan`,
      omschrijving: `Afwijking t.o.v. de eigen historische mediaan per regelsoort (eerdere calculaties): ${detail}. Open de AI-analyse op de detailpagina voor de onderbouwing.`,
      gewicht: 40,
      actiePad: `/modules/calculatie/${headerId}`,
      herkomstType: "mod_calc_header",
      herkomstId: headerId,
    };
    if (header.aangemaaktDoorId != null && aangemaaktDoorGerechtigd.has(header.aangemaaktDoorId)) {
      items.push({ ...basis, gebruikerId: header.aangemaaktDoorId, dedupSleutel: `ai-calculatie:${headerId}:${regelsoortHash}` });
    } else if (calcGroepIds.length > 0) {
      for (const gebruikerId of calcGroepIds) {
        items.push({ ...basis, gebruikerId, dedupSleutel: `ai-calculatie:${headerId}:${regelsoortHash}:${gebruikerId}` });
      }
    } else {
      items.push({ ...basis, vereisteModule: "calculaties", vereistNiveau: 1, dedupSleutel: `ai-calculatie:${headerId}:${regelsoortHash}:groep` });
    }
  }
  return syncBron("ai_calculatie_afwijking", items);
}

// ── AI_01 §3.2 — inkoopfactuurregel wijkt af van de verwachte prijs ───────────
// Inkoopfactuurregels (facturen type=inkoop, status verwerkt/betaald) van de
// afgelopen 30 dagen waarvan de stukprijs ≥30% afwijkt van de verwachting.
// Prioriteit van de verwachting (bestaande volgorde): jaarprijslijst
// (artikelen.inkoopprijs, exacte naam-match) > eigen inkoophistorie-mediaan
// (haalInkoopHistorie, ≥3 waarnemingen). Geen verwachting → geen item.
// Ontvanger: werkvoorbereider; vangnet: bevoegdheidsgroep projecten≥3.
async function voedAiInkoopAfwijking(): Promise<{ nieuw: number; afgehandeld: number }> {
  const grens = new Date(Date.now() - 30 * DAG_MS);
  const regels = await db
    .select({
      regelId: factuurRegelsTable.id,
      factuurId: factuurRegelsTable.factuurId,
      omschrijving: factuurRegelsTable.omschrijving,
      eenheid: factuurRegelsTable.eenheid,
      stukprijs: factuurRegelsTable.stukprijs,
      relatienaam: facturenTable.relatienaam,
    })
    .from(factuurRegelsTable)
    .innerJoin(facturenTable, eq(factuurRegelsTable.factuurId, facturenTable.id))
    .where(and(
      eq(facturenTable.type, "inkoop"),
      inArray(facturenTable.status, ["verwerkt", "betaald"]),
      isNotNull(factuurRegelsTable.stukprijs),
      isNotNull(factuurRegelsTable.eenheid),
      gte(factuurRegelsTable.aangemaaktOp, grens),
    ));

  // PERFORMANCE: geen factuurregels in het venster → geen jaarprijslijst- of
  // historie-query nodig (haalInkoopHistorie scant twee grote tabellen).
  if (regels.length === 0) return syncBron("ai_inkoop_afwijking", []);

  // Jaarprijslijst: exacte naam-match (genormaliseerd) op actieve artikelen met inkoopprijs.
  const artikelen = await db
    .select({ naam: artikelenTable.naam, inkoopprijs: artikelenTable.inkoopprijs })
    .from(artikelenTable)
    .where(and(eq(artikelenTable.actief, true), isNotNull(artikelenTable.inkoopprijs)));
  const jaarprijsOpNaam = new Map<string, number>();
  for (const a of artikelen) {
    if (a.inkoopprijs == null) continue;
    jaarprijsOpNaam.set(aiNormaliseer(a.naam), Number(a.inkoopprijs));
  }

  // PERFORMANCE: haalInkoopHistorie is de fallback-verwachting; roep hem alleen
  // aan (en dan alleen voor de artikelen ZONDER jaarprijslijst-match). Heeft elke
  // factuurregel al een jaarprijs, dan slaan we de historie-query volledig over.
  const uniekeZonderJaarprijs = new Map<string, { omschrijving: string; eenheid: string }>();
  for (const r of regels) {
    if (r.eenheid == null) continue;
    const jaarprijs = jaarprijsOpNaam.get(aiNormaliseer(r.omschrijving));
    if (jaarprijs != null && jaarprijs > 0) continue; // jaarprijslijst dekt deze al
    uniekeZonderJaarprijs.set(artikelSleutel(r.omschrijving, r.eenheid), { omschrijving: r.omschrijving, eenheid: r.eenheid });
  }
  const historie: Awaited<ReturnType<typeof haalInkoopHistorie>> = uniekeZonderJaarprijs.size > 0
    ? await haalInkoopHistorie([...uniekeZonderJaarprijs.values()])
    : new Map();

  // AUTORISATIELEK-fix: werkvoorbereiders zijn direct geadresseerd → geen
  // module-check. Deze items tonen bedragen, dus filter op projecten≥2 (het
  // niveau waarop bedragen zichtbaar zijn). Zonder gerechtigde ontvanger valt
  // de voeder terug op het groepsvangnet projecten≥3.
  const wvbIds = await filterOntvangersOpBevoegdheid(
    await vindGebruikersMetFunctietitel("Werkvoorbereider"), "projecten", 2,
  );

  const items: WerkbakInvoer[] = [];
  for (const r of regels) {
    if (r.stukprijs == null || r.eenheid == null) continue;
    const prijs = Number(r.stukprijs);
    if (!(prijs > 0)) continue;

    let verwacht: number | null = null;
    let bronTekst = "";
    let aantalTekst = "";
    const jaarprijs = jaarprijsOpNaam.get(aiNormaliseer(r.omschrijving));
    if (jaarprijs != null && jaarprijs > 0) {
      verwacht = jaarprijs;
      bronTekst = "jaarprijslijst (artikelen.inkoopprijs)";
      aantalTekst = "";
    } else {
      const h = historie.get(artikelSleutel(r.omschrijving, r.eenheid));
      if (h && h.mediaan != null && h.mediaan > 0) {
        verwacht = h.mediaan;
        bronTekst = "eigen inkoophistorie-mediaan";
        aantalTekst = ` (${h.aantal} waarnemingen${h.periode ? `, ${h.periode}` : ""}, minimaal ${MIN_WAARNEMINGEN_INKOOP})`;
      }
    }
    if (verwacht == null) continue; // geen verwachting → geen item (zwijgen boven gokken)
    const afwPct = ((prijs - verwacht) / verwacht) * 100;
    if (Math.abs(afwPct) < AI_AFWIJKING_DREMPEL_PCT) continue;

    const basis = {
      soort: "doen" as const,
      bron: "ai_inkoop_afwijking",
      titel: `Beoordeel inkoopregel "${r.omschrijving}"${r.relatienaam ? ` van ${r.relatienaam}` : ""}: € ${prijs.toFixed(2)} wijkt ${afwPct >= 0 ? "+" : ""}${afwPct.toFixed(0)}% af`,
      omschrijving: `Stukprijs € ${prijs.toFixed(2)}/${r.eenheid} vs verwachting € ${verwacht.toFixed(2)} volgens ${bronTekst}${aantalTekst}. Afwijking ${afwPct >= 0 ? "+" : ""}${afwPct.toFixed(0)}% (drempel ${AI_AFWIJKING_DREMPEL_PCT}%). Open de factuur om te controleren.`,
      gewicht: 35,
      actiePad: `/facturen/${r.factuurId}`,
      herkomstType: "factuur_regel",
      herkomstId: r.regelId,
    };
    if (wvbIds.length > 0) {
      for (const gebruikerId of wvbIds) {
        items.push({ ...basis, gebruikerId, dedupSleutel: `ai-inkoop:${r.regelId}:${gebruikerId}` });
      }
    } else {
      items.push({ ...basis, vereisteModule: "projecten", vereistNiveau: 3, dedupSleutel: `ai-inkoop:${r.regelId}:groep` });
    }
  }
  return syncBron("ai_inkoop_afwijking", items);
}

// ── AI_01 §3.3 — magazijn bestelsuggestie ─────────────────────────────────────
// Artikelen onder minimumvoorraad (dezelfde aggregatie als magazijnSignalering.ts:
// som van voorraad per artikel, actieve artikelen met een ingestelde
// minimum_voorraad), met respect voor actieve snoozes uit magazijn_snoozes.
// Item per artikel aan de bevoegdheidsgroep magazijn≥2. actiePad /magazijn.
async function voedAiMagazijnBestelsuggestie(): Promise<{ nieuw: number; afgehandeld: number }> {
  const [voorraad, artikelen, snoozes] = await Promise.all([
    db.select({ artikelId: voorraadTable.artikelId, hoeveelheid: voorraadTable.hoeveelheid }).from(voorraadTable),
    db.select({
      id: artikelenTable.id,
      naam: artikelenTable.naam,
      eenheid: artikelenTable.eenheid,
      minimumVoorraad: artikelenTable.minimumVoorraad,
      gewensteVoorraad: artikelenTable.gewensteVoorraad,
    }).from(artikelenTable).where(eq(artikelenTable.actief, true)),
    db.select({ artikelId: magazijnSnoozesTable.artikelId })
      .from(magazijnSnoozesTable)
      .where(gt(magazijnSnoozesTable.gesnoozedTot, new Date())),
  ]);

  const gesnoozed = new Set(snoozes.map((s) => s.artikelId));
  const voorraadMap = new Map<number, number>();
  for (const v of voorraad) {
    voorraadMap.set(v.artikelId, (voorraadMap.get(v.artikelId) ?? 0) + (v.hoeveelheid ?? 0));
  }

  const items: WerkbakInvoer[] = [];
  for (const a of artikelen) {
    if (a.minimumVoorraad == null) continue;
    if (gesnoozed.has(a.id)) continue;
    const min = Number(a.minimumVoorraad);
    const hoeveelheid = voorraadMap.get(a.id) ?? 0;
    if (hoeveelheid >= min) continue;
    const gewenst = a.gewensteVoorraad != null ? Number(a.gewensteVoorraad) : null;
    items.push({
      soort: "doen",
      bron: "ai_magazijn_bestelsuggestie",
      titel: `Maak een bestelling aan voor ${a.naam}`,
      omschrijving: `Voorraad ${hoeveelheid} ${a.eenheid} ligt onder het minimum van ${min} ${a.eenheid}${gewenst != null ? ` (gewenste voorraad ${gewenst} ${a.eenheid})` : ""}. Bestel bij om onder het minimum uit te komen.`,
      vereisteModule: "magazijn",
      vereistNiveau: 2,
      gewicht: 30,
      actiePad: "/magazijn",
      herkomstType: "artikel",
      herkomstId: a.id,
      dedupSleutel: `ai-magazijn:${a.id}`,
    });
  }
  return syncBron("ai_magazijn_bestelsuggestie", items);
}

// ── AI_01 §3.4 — HRM capaciteitssignaal ───────────────────────────────────────
// Komende 14 dagen, per functie (medewerkers actief): dagen waarop ALLE
// medewerkers met die functie tegelijk afwezig zijn (goedgekeurd verlof of open
// ziekmelding) terwijl de functie ≥1 medewerker heeft. Geanonimiseerd: geen
// namen van zieken/verlofgangers in titel of omschrijving (aantallen mogen).
// Item aan de bevoegdheidsgroep personeel≥2. actiePad /personeel/capaciteitsplanning.
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function voedAiHrmCapaciteit(): Promise<{ nieuw: number; afgehandeld: number }> {
  const vandaag = new Date();
  vandaag.setHours(0, 0, 0, 0);
  const eind = new Date(vandaag.getTime() + 14 * DAG_MS);
  const dagen: string[] = [];
  for (let i = 0; i < 14; i++) dagen.push(ymd(new Date(vandaag.getTime() + i * DAG_MS)));

  const medewerkers = await db
    .select({ id: medewerkersTable.id, functieId: medewerkersTable.functieId, functieNaam: functiesTable.naam })
    .from(medewerkersTable)
    .innerJoin(functiesTable, eq(medewerkersTable.functieId, functiesTable.id))
    .where(and(eq(medewerkersTable.actief, true), eq(functiesTable.actief, true)));

  // Functie → set actieve medewerker-ids.
  const perFunctie = new Map<number, { naam: string; medewerkers: Set<number> }>();
  for (const m of medewerkers) {
    if (m.functieId == null) continue;
    const entry = perFunctie.get(m.functieId) ?? { naam: m.functieNaam, medewerkers: new Set<number>() };
    entry.medewerkers.add(m.id);
    perFunctie.set(m.functieId, entry);
  }
  const alleMwIds = medewerkers.map((m) => m.id);
  if (alleMwIds.length === 0) return syncBron("ai_hrm_capaciteit", []);

  const [verlof, ziek] = await Promise.all([
    db.select({ medewerkerId: verlofAanvragenTable.medewerkerId, start: verlofAanvragenTable.startDatum, eind: verlofAanvragenTable.eindDatum })
      .from(verlofAanvragenTable)
      .where(and(eq(verlofAanvragenTable.status, "goedgekeurd"), inArray(verlofAanvragenTable.medewerkerId, alleMwIds))),
    // Open ziekmelding = geen einddatum, of einddatum op/na vandaag.
    db.select({ medewerkerId: ziekmeldingenTable.medewerkerId, start: ziekmeldingenTable.startDatum, eind: ziekmeldingenTable.eindDatum, status: ziekmeldingenTable.status })
      .from(ziekmeldingenTable)
      .where(and(inArray(ziekmeldingenTable.medewerkerId, alleMwIds), ne(ziekmeldingenTable.status, "hersteld"))),
  ]);

  // Per dag: welke medewerkers afwezig zijn.
  const afwezigPerDag = new Map<string, Set<number>>();
  const markeer = (mwId: number, startStr: string, eindStr: string | null): void => {
    for (const dag of dagen) {
      if (dag < startStr) continue;
      if (eindStr != null && dag > eindStr) continue;
      const set = afwezigPerDag.get(dag) ?? new Set<number>();
      set.add(mwId);
      afwezigPerDag.set(dag, set);
    }
  };
  for (const v of verlof) markeer(v.medewerkerId, v.start, v.eind);
  for (const z of ziek) {
    // Open ziekmelding zonder einddatum geldt de hele venster; met einddatum in
    // het verleden is de medewerker weer beschikbaar.
    if (z.eind != null && z.eind < ymd(vandaag)) continue;
    markeer(z.medewerkerId, z.start, z.eind);
  }

  const items: WerkbakInvoer[] = [];
  for (const [functieId, functie] of perFunctie) {
    if (functie.medewerkers.size === 0) continue;
    for (const dag of dagen) {
      const afwezig = afwezigPerDag.get(dag);
      if (!afwezig) continue;
      const allenAfwezig = [...functie.medewerkers].every((id) => afwezig.has(id));
      if (!allenAfwezig) continue;
      items.push({
        soort: "doen",
        bron: "ai_hrm_capaciteit",
        titel: `Beoordeel de bezetting van functie ${functie.naam} rond ${dag}`,
        omschrijving: `Op ${dag} zijn alle ${functie.medewerkers.size} medewerker(s) met functie ${functie.naam} tegelijk afwezig (goedgekeurd verlof of open ziekmelding). Regel vervanging of herplan het werk.`,
        vereisteModule: "personeel",
        vereistNiveau: 2,
        gewicht: 45,
        actiePad: "/personeel/capaciteitsplanning",
        herkomstType: "functie",
        herkomstId: functieId,
        dedupSleutel: `ai-hrm-capaciteit:${functieId}:${dag}`,
      });
    }
  }
  return syncBron("ai_hrm_capaciteit", items);
}

// ── AI_01 §3.5 — werkvoorbereidingssignaal ────────────────────────────────────
// Actieve opdrachten met een werkbegroting waarvan materiaalregels GEEN
// HRM_01 §2.3: uiterste aanzegdatum (Wet Aanzegging) of ZZP/Wet DBA-deadline
// nadert binnen 30 dagen (of DBA-duurgrens bereikt) → HRM-beheerder (doen).
// Dedup per medewerker + brontype zodat een contract- en ZZP-deadline onafhankelijk
// kunnen worden aangemaakt en afgehandeld. syncBron lost items automatisch op
// zodra de deadline niet meer urgent is (nieuw contract, einde vastgelegd).
async function voedCrucialeDeadlinesHrm(): Promise<{ nieuw: number; afgehandeld: number }> {
  const items: WerkbakInvoer[] = [];
  const deadlines = await haalCrucialeDatumItems();
  for (const d of deadlines) {
    const bronLabel = d.bron === "zzp" ? "ZZP/DBA" : "contract";
    items.push({
      soort: "doen",
      bron: "cruciale_deadlines_hrm",
      titel: `${d.label}: ${d.naam}`,
      omschrijving: d.reden,
      vereisteModule: "personeel",
      vereistNiveau: 2,
      alleenHoofdbeheerder: false,
      gewicht: d.dagen_tot < 0 ? 95 : d.dagen_tot <= 7 ? 85 : 70,
      actiePad: "/personeel/contracten",
      herkomstType: `cruciale_deadline_${d.bron}`,
      herkomstId: d.medewerker_id,
      dedupSleutel: `cruciale-deadline:${bronLabel}:${d.medewerker_id}`,
    });
  }
  return syncBron("cruciale_deadlines_hrm", items);
}

// leverancier én geen inkoopplan-koppeling hebben. Zelfde tabellen als de
// AI-kandidaten in routes/opdrachten.ts: werkbegroting_regels (categorie
// materiaal) tegenover inkoopplan_regels (via werkbegrotingRegelId, met gevulde
// leverancier). Eén item per opdracht. Ontvanger: werkvoorbereider; vangnet
// projecten≥3. actiePad naar de opdrachtpagina.
async function voedAiWerkvoorbereidingSignaal(): Promise<{ nieuw: number; afgehandeld: number }> {
  const rijen = await db
    .select({
      opdrachtId: opdrachtenTable.id,
      opdrachtTitel: opdrachtenTable.titel,
      regelId: werkbegrotingRegelsTable.id,
      leverancier: inkoopplanRegelsTable.leverancier,
    })
    .from(opdrachtenTable)
    .innerJoin(projectBegrotingenTable, eq(projectBegrotingenTable.opdrachtId, opdrachtenTable.id))
    .innerJoin(werkbegrotingRegelsTable, eq(werkbegrotingRegelsTable.begrotingId, projectBegrotingenTable.id))
    .leftJoin(inkoopplanRegelsTable, eq(inkoopplanRegelsTable.werkbegrotingRegelId, werkbegrotingRegelsTable.id))
    .where(and(
      eq(opdrachtenTable.status, "actief"),
      eq(werkbegrotingRegelsTable.categorie, "materiaal"),
    ));

  // Een materiaalregel geldt als "gedekt" zodra er minstens één gekoppelde
  // inkoopplanregel met een gevulde leverancier bestaat. Ongedekt = geen enkele
  // koppeling óf alle koppelingen zonder leverancier.
  const perOpdracht = new Map<number, { titel: string; ongedekteRegels: Set<number> }>();
  const gedektePerRegel = new Map<number, boolean>();
  for (const r of rijen) {
    const heeftLeverancier = r.leverancier != null && r.leverancier.trim() !== "";
    gedektePerRegel.set(r.regelId, (gedektePerRegel.get(r.regelId) ?? false) || heeftLeverancier);
    const entry = perOpdracht.get(r.opdrachtId) ?? { titel: r.opdrachtTitel, ongedekteRegels: new Set<number>() };
    entry.ongedekteRegels.add(r.regelId); // voorlopig; ontdubbelen na de loop
    perOpdracht.set(r.opdrachtId, entry);
  }

  // AUTORISATIELEK-fix: werkvoorbereiders zijn direct geadresseerd → geen
  // module-check. Filter op projecten≥2; zonder gerechtigde ontvanger valt de
  // voeder terug op het groepsvangnet projecten≥3.
  const wvbIds = await filterOntvangersOpBevoegdheid(
    await vindGebruikersMetFunctietitel("Werkvoorbereider"), "projecten", 2,
  );

  const items: WerkbakInvoer[] = [];
  for (const [opdrachtId, opdracht] of perOpdracht) {
    const ongedekt = [...opdracht.ongedekteRegels].filter((regelId) => !gedektePerRegel.get(regelId));
    const n = ongedekt.length;
    if (n === 0) continue;
    const basis = {
      soort: "doen" as const,
      bron: "ai_werkvoorbereiding_signaal",
      titel: `Controleer de werkvoorbereiding van ${opdracht.titel}: ${n} materiaalregel(s) zonder leverancier/inkoopkoppeling`,
      omschrijving: `${n} materiaalregel(s) in de werkbegroting hebben geen leverancier en geen inkoopplan-koppeling. Koppel een leverancier of neem de regels op in een inkoopplan.`,
      gewicht: 35,
      actiePad: `/opdrachten/${opdrachtId}`,
      herkomstType: "opdracht",
      herkomstId: opdrachtId,
    };
    if (wvbIds.length > 0) {
      for (const gebruikerId of wvbIds) {
        items.push({ ...basis, gebruikerId, dedupSleutel: `ai-werkvoorbereiding:${opdrachtId}:${gebruikerId}` });
      }
    } else {
      items.push({ ...basis, vereisteModule: "projecten", vereistNiveau: 3, dedupSleutel: `ai-werkvoorbereiding:${opdrachtId}:groep` });
    }
  }
  return syncBron("ai_werkvoorbereiding_signaal", items);
}

// ── De loop zelf ──────────────────────────────────────────────────────────────

let _loopBezig = false;

// UREN_01 §6: wekelijkse volledigheidscontrole — alleen op maandag over de
// week ervoor. syncBron sluit items vanzelf zodra de medewerker de week
// alsnog compleet maakt (volgende maandag, of dezelfde dag bij een herdraai).
async function voedWeekstaatControle(): Promise<{ nieuw: number; afgehandeld: number }> {
  if (new Date().getDay() !== 1 && process.env.UREN01_WEEKCONTROLE_FORCE !== "1") {
    return { nieuw: 0, afgehandeld: 0 };
  }
  const resultaten = await beoordeelVorigeWeek();
  const items = bouwWeekControleItems(resultaten);
  const a = await syncBron("weekstaat_onvolledig", items.filter((i) => i.bron === "weekstaat_onvolledig"));
  const b = await syncBron("weekstaat_overwerk_overtreding", items.filter((i) => i.bron === "weekstaat_overwerk_overtreding"));
  return { nieuw: a.nieuw + b.nieuw, afgehandeld: a.afgehandeld + b.afgehandeld };
}

// UREN_01 §5: tijd-voor-tijd langer dan een maand open → herinnering (geen
// verval, geen blokkade). syncBron ruimt herinneringen op zodra opgenomen.
async function voedTvtOpname(): Promise<{ nieuw: number; afgehandeld: number }> {
  const plIds = await vindGebruikersMetFunctietitel("Projectleider");
  const items = await bouwTvtOpnameItems(plIds);
  return syncBron("tvt_opname_herinnering", items);
}

// ── BEWAKING_02 — zes voeders op de commerciële keten ────────────────────────
// Fase 0 (docs/metingen/BEWAKING_02_fase0.md, prod 11-08-2026): keten nog
// onbenut, transitielog leeg voor offertes. Verzend-/bekeken-momenten komen
// daarom uit offerte_tracking (events "bezorgd" en "portaal_bekeken") — die
// worden al bij elke verzending/portaalopening geschreven. Drempels staan in
// app_instellingen (BEWAKING_02 §7.4), startstanden conservatief.

const OFFERTE_MODULE = "offertes";

async function haalBewaking02Drempels(): Promise<{ reactie: number; bekeken: number; opname: number }> {
  const [inst] = await db
    .select({
      reactie: appInstellingenTable.offerteReactieBewakingDagen,
      bekeken: appInstellingenTable.offerteBekekenBewakingDagen,
      opname: appInstellingenTable.opnameCalculatieBewakingDagen,
    })
    .from(appInstellingenTable)
    .orderBy(appInstellingenTable.id)
    .limit(1);
  return { reactie: inst?.reactie ?? 7, bekeken: inst?.bekeken ?? 5, opname: inst?.opname ?? 14 };
}

// §7.2 — rangschikken op consequentie: bedrag telt mee in het gewicht.
function gewichtMetBedrag(basis: number, bedragInclBtw: number | null): number {
  return basis + Math.min(40, Math.floor((bedragInclBtw ?? 0) / 2500));
}

function offerteNaam(o: { offertenummer: string | null; titel: string; id: number }): string {
  return o.offertenummer ? `Offerte ${o.offertenummer}` : `Offerte "${o.titel}" (#${o.id})`;
}

// Tracking-moment per offerte voor één eventtype.
// - V1 gebruikt max("bezorgd"): een hérbezorging is een echte nieuwe actie en
//   mag de klok resetten.
// - V2 gebruikt min("portaal_bekeken"): het portaal logt dit event bij élk
//   bezoek; met max zou iedere heropening het signaal eindeloos uitstellen.
//   Het eerste bekeken-moment is het semantisch stabiele startpunt.
async function trackingMomenten(offerteIds: number[], event: string, agg: "min" | "max"): Promise<Map<number, Date>> {
  if (offerteIds.length === 0) return new Map();
  const rijen = await db
    .select({
      offerteId: offerteTrackingTable.offerteId,
      moment: agg === "max"
        ? sql<string>`max(${offerteTrackingTable.aangemaaktOp})`
        : sql<string>`min(${offerteTrackingTable.aangemaaktOp})`,
    })
    .from(offerteTrackingTable)
    .where(and(inArray(offerteTrackingTable.offerteId, offerteIds), eq(offerteTrackingTable.event, event)))
    .groupBy(offerteTrackingTable.offerteId);
  return new Map(rijen.map((r) => [r.offerteId, new Date(r.moment)]));
}

// Ontvanger per offerte: behandelaar, anders aanmaker — gefilterd op bevoegdheid;
// niemand over → groepsvangnet offertes≥3.
async function offerteItems(
  offertes: Array<{ id: number; offertenummer: string | null; titel: string; behandeldDoorId: number | null; aangemaaktDoorId: number | null; bedragInclBtw: number | null }>,
  bouw: (o: { id: number; offertenummer: string | null; titel: string; bedragInclBtw: number | null }) => Omit<WerkbakInvoer, "gebruikerId" | "vereisteModule" | "vereistNiveau" | "dedupSleutel">,
  dedupPrefix: string,
): Promise<WerkbakInvoer[]> {
  const kandidaten = [...new Set(offertes.flatMap((o) => [o.behandeldDoorId, o.aangemaaktDoorId].filter((x): x is number => x != null)))];
  const bevoegd = new Set(await filterOntvangersOpBevoegdheid(kandidaten, OFFERTE_MODULE, 1));
  return offertes.flatMap((o): WerkbakInvoer[] => {
    const basis = bouw(o);
    const ontvanger = [o.behandeldDoorId, o.aangemaaktDoorId].find((x) => x != null && bevoegd.has(x)) ?? null;
    if (ontvanger == null) {
      return [{ ...basis, vereisteModule: OFFERTE_MODULE, vereistNiveau: 3, dedupSleutel: `${dedupPrefix}:${o.id}:groep` }];
    }
    return [{ ...basis, gebruikerId: ontvanger, dedupSleutel: `${dedupPrefix}:${o.id}:${ontvanger}` }];
  });
}

// V1 — verzonden offerte zonder enige reactie na de drempel (doen, opsteller).
async function voedOfferteGeenReactie(): Promise<{ nieuw: number; afgehandeld: number }> {
  const { reactie: drempelDagen } = await haalBewaking02Drempels();
  const grens = new Date(Date.now() - drempelDagen * DAG_MS);
  const offertes = await db
    .select({
      id: offertesTable.id, offertenummer: offertesTable.offertenummer, titel: offertesTable.titel,
      behandeldDoorId: offertesTable.behandeldDoorId, aangemaaktDoorId: offertesTable.aangemaaktDoorId,
      bedragInclBtw: offertesTable.bedragInclBtw, bijgewerktOp: offertesTable.bijgewerktOp,
    })
    .from(offertesTable)
    .where(eq(offertesTable.portaalStatus, "verzonden"));
  const momenten = await trackingMomenten(offertes.map((o) => o.id), "bezorgd", "max");
  // Onzekerheidsbehandeling: de verzendflow schrijft bij élke verzending een
  // "bezorgd"-event, dus alleen historische/handmatige rijen missen tracking.
  // Voor die rijen is bijgewerkt_op het enige beschikbare moment — dat kan het
  // signaal hooguit uitstellen (edit maakt de rij "jong"), nooit onterecht
  // openen: de rij staat aantoonbaar op "verzonden" zonder reactie.
  const oud = offertes.filter((o) => (momenten.get(o.id) ?? o.bijgewerktOp) <= grens);
  const items = await offerteItems(oud, (o) => ({
    soort: "doen",
    bron: "offerte_geen_reactie",
    titel: `${offerteNaam(o)} staat al ${drempelDagen}+ dagen op "verzonden" zonder reactie`,
    omschrijving: `De klant heeft de offerte nog niet geopend of beantwoord. Neem contact op of stuur een herinnering — het signaal gaat nooit automatisch naar de klant.`,
    gewicht: gewichtMetBedrag(40, o.bedragInclBtw),
    actiePad: `/offertes/${o.id}`,
    herkomstType: "offerte",
    herkomstId: o.id,
  }), "offerte-geen-reactie");
  return syncBron("offerte_geen_reactie", items);
}

// V2 — klant opende het portaal maar tekende niet na de drempel (doen, opsteller).
async function voedOfferteBekekenNietGetekend(): Promise<{ nieuw: number; afgehandeld: number }> {
  const { bekeken: drempelDagen } = await haalBewaking02Drempels();
  const grens = new Date(Date.now() - drempelDagen * DAG_MS);
  const offertes = await db
    .select({
      id: offertesTable.id, offertenummer: offertesTable.offertenummer, titel: offertesTable.titel,
      behandeldDoorId: offertesTable.behandeldDoorId, aangemaaktDoorId: offertesTable.aangemaaktDoorId,
      bedragInclBtw: offertesTable.bedragInclBtw, bijgewerktOp: offertesTable.bijgewerktOp,
    })
    .from(offertesTable)
    .where(eq(offertesTable.portaalStatus, "bekeken"));
  // min: het éérste bekeken-moment telt — herhaald portaalbezoek schuift de
  // drempel niet op (zie trackingMomenten). Fallback bijgewerkt_op alleen voor
  // historische rijen zonder tracking (kan uitstellen, nooit onterecht openen).
  const momenten = await trackingMomenten(offertes.map((o) => o.id), "portaal_bekeken", "min");
  const oud = offertes.filter((o) => (momenten.get(o.id) ?? o.bijgewerktOp) <= grens);
  const items = await offerteItems(oud, (o) => ({
    soort: "doen",
    bron: "offerte_bekeken_niet_getekend",
    titel: `${offerteNaam(o)} is door de klant bekeken maar na ${drempelDagen}+ dagen niet getekend`,
    omschrijving: `De klant heeft de offerte geopend en daarna niets gedaan. Dit is hét moment om na te bellen.`,
    gewicht: gewichtMetBedrag(45, o.bedragInclBtw),
    actiePad: `/offertes/${o.id}`,
    herkomstType: "offerte",
    herkomstId: o.id,
  }), "offerte-bekeken-niet-getekend");
  return syncBron("offerte_bekeken_niet_getekend", items);
}

// V3 — geldigheid (datum + geldigheid_dagen) verstreken zonder eindstatus (weten, opsteller).
async function voedOfferteVerlopen(): Promise<{ nieuw: number; afgehandeld: number }> {
  const vandaag = new Date(); vandaag.setHours(0, 0, 0, 0);
  const offertes = await db
    .select({
      id: offertesTable.id, offertenummer: offertesTable.offertenummer, titel: offertesTable.titel,
      behandeldDoorId: offertesTable.behandeldDoorId, aangemaaktDoorId: offertesTable.aangemaaktDoorId,
      bedragInclBtw: offertesTable.bedragInclBtw, datum: offertesTable.datum,
      geldigheidDagen: offertesTable.geldigheidDagen,
    })
    .from(offertesTable)
    .where(and(
      inArray(offertesTable.portaalStatus, ["verzonden", "bekeken"]),
      isNotNull(offertesTable.datum),
    ));
  const verlopen = offertes.filter((o) => {
    if (!o.datum) return false;
    const eind = new Date(o.datum);
    if (Number.isNaN(eind.getTime())) return false;
    eind.setDate(eind.getDate() + (o.geldigheidDagen ?? 30));
    return eind < vandaag;
  });
  const items = await offerteItems(verlopen, (o) => ({
    soort: "weten",
    bron: "offerte_verlopen",
    titel: `${offerteNaam(o)} is verlopen zonder eindstatus`,
    omschrijving: `De geldigheidstermijn is verstreken en de offerte is niet getekend, afgewezen of ingetrokken. Verleng, trek in of schrijf af.`,
    gewicht: gewichtMetBedrag(30, o.bedragInclBtw),
    actiePad: `/offertes/${o.id}`,
    herkomstType: "offerte",
    herkomstId: o.id,
  }), "offerte-verlopen");
  return syncBron("offerte_verlopen", items);
}

// V4 — opname zonder gekoppelde calculatie na de drempel (doen, opnemer).
async function voedOpnameZonderCalculatie(): Promise<{ nieuw: number; afgehandeld: number }> {
  const { opname: drempelDagen } = await haalBewaking02Drempels();
  const grens = new Date(Date.now() - drempelDagen * DAG_MS);
  const rijen = await db
    .select({
      id: opnamesTable.id, naam: opnamesTable.naam, nummer: opnamesTable.nummer,
      aangemaaktDoorId: opnamesTable.aangemaaktDoorId, aangemaaktOp: opnamesTable.aangemaaktOp,
      gebouwId: opnamesTable.gebouwId,
    })
    .from(opnamesTable)
    .where(and(
      // "Opname gedaan" (§6 V4) = definitief; een concept is nog werk in
      // uitvoering en hoort geen actiepunt op te leveren.
      eq(opnamesTable.status, "definitief"),
      lte(opnamesTable.aangemaaktOp, grens),
      sql`NOT EXISTS (SELECT 1 FROM mod_calc_headers h WHERE h.opname_id = ${opnamesTable.id})`,
      sql`NOT EXISTS (SELECT 1 FROM calculaties c WHERE c.opname_id = ${opnamesTable.id})`,
    ));
  const kandidaten = [...new Set(rijen.map((r) => r.aangemaaktDoorId).filter((x): x is number => x != null))];
  const bevoegd = new Set(await filterOntvangersOpBevoegdheid(kandidaten, "projecten", 1));
  const items = rijen.map((r): WerkbakInvoer => {
    const basis = {
      soort: "doen" as const,
      bron: "opname_zonder_calculatie",
      titel: `Opname M${r.nummer} (${r.naam}) heeft na ${drempelDagen}+ dagen nog geen calculatie`,
      omschrijving: `De opname is gedaan maar er is geen calculatie aan gekoppeld — het werk blijft zo commercieel liggen.`,
      gewicht: 35,
      actiePad: r.gebouwId ? `/gebouwen/${r.gebouwId}?tab=opnames` : `/opnames`,
      herkomstType: "opname",
      herkomstId: r.id,
    };
    if (r.aangemaaktDoorId != null && bevoegd.has(r.aangemaaktDoorId)) {
      return { ...basis, gebruikerId: r.aangemaaktDoorId, dedupSleutel: `opname-zonder-calculatie:${r.id}:${r.aangemaaktDoorId}` };
    }
    return { ...basis, vereisteModule: "projecten", vereistNiveau: 3, dedupSleutel: `opname-zonder-calculatie:${r.id}:groep` };
  });
  return syncBron("opname_zonder_calculatie", items);
}

// V5 — definitieve calculatie (niet-concept of verzonden) zonder offerte (weten, opsteller).
// Beide calculatietabellen (fase 0 aanname 2): mod_calc_headers (ENK, waar
// offertes.calculatie_id naar wijst) én legacy calculaties. Een legacy-
// calculatie kán niet aan een offerte gekoppeld worden — het signaal blijft
// dan staan tot de calculatie in de ENK-module is overgezet of teruggezet
// naar concept; precies de aandacht die "weten" vraagt.
async function voedCalculatieZonderOfferte(): Promise<{ nieuw: number; afgehandeld: number }> {
  const [enk, legacy] = await Promise.all([
    db.select({
      id: modCalcHeadersTable.id, naam: modCalcHeadersTable.naam, nummer: modCalcHeadersTable.nummer,
      aangemaaktDoorId: modCalcHeadersTable.aangemaaktDoorId,
    })
      .from(modCalcHeadersTable)
      .where(and(
        sql`(${modCalcHeadersTable.status} <> 'concept' OR ${modCalcHeadersTable.verzondenOp} IS NOT NULL)`,
        sql`NOT EXISTS (SELECT 1 FROM offertes o WHERE o.calculatie_id = ${modCalcHeadersTable.id})`,
      )),
    db.select({
      id: calculatiesTable.id, naam: calculatiesTable.naam, nummer: calculatiesTable.nummer,
      aangemaaktDoorId: calculatiesTable.aangemaaktDoorId,
    })
      .from(calculatiesTable)
      .where(sql`(${calculatiesTable.status} <> 'concept' OR ${calculatiesTable.verzondenOp} IS NOT NULL)`),
  ]);
  const rijen = [
    ...enk.map((r) => ({ ...r, legacy: false })),
    ...legacy.map((r) => ({ ...r, legacy: true })),
  ];
  const kandidaten = [...new Set(rijen.map((r) => r.aangemaaktDoorId).filter((x): x is number => x != null))];
  const bevoegd = new Set(await filterOntvangersOpBevoegdheid(kandidaten, "calculaties", 1));
  const items = rijen.map((r): WerkbakInvoer => {
    const sleutel = r.legacy ? `legacy-${r.id}` : `${r.id}`;
    const basis = {
      soort: "weten" as const,
      bron: "calculatie_zonder_offerte",
      titel: `Calculatie C${r.nummer} (${r.naam}) is definitief maar heeft geen offerte`,
      omschrijving: r.legacy
        ? `Deze calculatie staat nog in de oude module en kan daar niet aan een offerte gekoppeld worden. Zet haar over naar de ENK-calculatiemodule of leg vast waarom niet.`
        : `De calculatie is afgerond zonder dat er een offerte uit is voortgekomen. Maak de offerte of leg vast waarom niet.`,
      gewicht: 30,
      actiePad: `/calculaties/${r.id}`,
      herkomstType: r.legacy ? "calculatie_legacy" : "calculatie",
      herkomstId: r.id,
    };
    if (r.aangemaaktDoorId != null && bevoegd.has(r.aangemaaktDoorId)) {
      return { ...basis, gebruikerId: r.aangemaaktDoorId, dedupSleutel: `calculatie-zonder-offerte:${sleutel}:${r.aangemaaktDoorId}` };
    }
    return { ...basis, vereisteModule: "calculaties", vereistNiveau: 2, dedupSleutel: `calculatie-zonder-offerte:${sleutel}:groep` };
  });
  return syncBron("calculatie_zonder_offerte", items);
}

// V6 — actieve opdracht zonder vastgelegde akkoordgrond (weten, projectleider).
// AKKOORD_01: akkoord_grond bestaat (migratie 0046); de akkoordpoort blokkeert
// uren/inkoop al — dit signaal maakt de openstaande vastlegging zichtbaar.
async function voedOpdrachtZonderAkkoord(): Promise<{ nieuw: number; afgehandeld: number }> {
  const rijen = await db
    .select({
      id: opdrachtenTable.id, titel: opdrachtenTable.titel, werknummer: opdrachtenTable.werknummer,
      offerteBedrag: offertesTable.bedragInclBtw,
    })
    .from(opdrachtenTable)
    .leftJoin(offertesTable, eq(opdrachtenTable.offerteId, offertesTable.id))
    .where(and(eq(opdrachtenTable.status, "actief"), isNull(opdrachtenTable.akkoordGrond)));
  const plIds = await filterOntvangersOpBevoegdheid(await vindGebruikersMetFunctietitel("Projectleider"), "projecten", 2);
  const items = rijen.flatMap((r): WerkbakInvoer[] => {
    const basis = {
      soort: "weten" as const,
      bron: "opdracht_zonder_akkoord",
      titel: `Opdracht ${r.werknummer ?? `#${r.id}`} (${r.titel}) is actief zonder vastgelegd akkoord`,
      omschrijving: `Er is geen akkoordgrond vastgelegd (ondertekening, opdrachtbevestiging of vrijgave). Zonder akkoord blijven uren en inkoop geblokkeerd.`,
      gewicht: gewichtMetBedrag(35, r.offerteBedrag),
      actiePad: `/opdrachten/${r.id}`,
      herkomstType: "opdracht",
      herkomstId: r.id,
    };
    if (plIds.length === 0) {
      return [{ ...basis, vereisteModule: "projecten", vereistNiveau: 3, dedupSleutel: `opdracht-zonder-akkoord:${r.id}:groep` }];
    }
    return plIds.map((gebruikerId) => ({ ...basis, gebruikerId, dedupSleutel: `opdracht-zonder-akkoord:${r.id}:${gebruikerId}` }));
  });
  return syncBron("opdracht_zonder_akkoord", items);
}


// ── FINANCIEEL_KETEN_01 — toestanden die op een mens wachtten zonder dat die
// mens iets te zien kreeg. Vier voeders: geblokkeerd geld, mislukte exports,
// verlopen verkoopfacturen en afgesloten projecten met open OHW.

// Geblokkeerde facturen: geld dat stil staat tot iemand de blokkade opheft of
// de factuur afkeurt. Zonder voeder was dit alleen een filter in het factuurscherm.
async function voedGeblokkeerdeFacturen(): Promise<{ nieuw: number; afgehandeld: number }> {
  const rijen = await db
    .select({ id: facturenTable.id, relatienaam: facturenTable.relatienaam, factuurnummer: facturenTable.factuurnummer, bedrag: facturenTable.bedragInclBtw })
    .from(facturenTable)
    .where(and(
      eq(facturenTable.geblokkeerd, true),
      notInArray(facturenTable.status, ["afgekeurd", "historisch"]),
    ));
  const items: WerkbakInvoer[] = rijen.map((f) => ({
    soort: "doen" as const,
    bron: "factuur_geblokkeerd" as const,
    titel: `Geblokkeerde factuur: ${f.relatienaam ?? "onbekend"} ${f.factuurnummer ?? `#${f.id}`}${f.bedrag ? ` (€${f.bedrag})` : ""}`,
    omschrijving: "Hef de blokkade op of keur de factuur af; de reden staat op de factuurpagina.",
    vereisteModule: "financieel",
    vereistNiveau: 2,
    gewicht: 70,
    actiePad: `/facturen/${f.id}`,
    herkomstType: "factuur",
    herkomstId: f.id,
    dedupSleutel: `factuur_geblokkeerd:${f.id}`,
  }));
  return syncBron("factuur_geblokkeerd", items);
}

// Mislukte AccountView-export: de factuur staat op fout_bij_verzending en wacht
// op herexport of correctie — dat mag niet alleen in het exportlog blijven.
async function voedExportfouten(): Promise<{ nieuw: number; afgehandeld: number }> {
  const rijen = await db
    .select({ id: facturenTable.id, relatienaam: facturenTable.relatienaam, factuurnummer: facturenTable.factuurnummer })
    .from(facturenTable)
    .where(eq(facturenTable.status, "fout_bij_verzending"));
  const items: WerkbakInvoer[] = rijen.map((f) => ({
    soort: "doen" as const,
    bron: "factuur_exportfout" as const,
    titel: `Export naar AccountView mislukt: ${f.relatienaam ?? "onbekend"} ${f.factuurnummer ?? `#${f.id}`}`,
    omschrijving: "Bekijk de foutmelding in het exportlog en herexporteer of corrigeer de boekgegevens.",
    vereisteModule: "financieel",
    vereistNiveau: 2,
    gewicht: 75,
    actiePad: `/facturen/${f.id}`,
    herkomstType: "factuur",
    herkomstId: f.id,
    dedupSleutel: `factuur_exportfout:${f.id}`,
  }));
  return syncBron("factuur_exportfout", items);
}

// Verkoopfacturen over de vervaldatum die niet betaald zijn: dit is de
// liquiditeitskant — inning wacht op een mens (herinnering/incasso op de factuur).
async function voedVervallenVerkoopfacturen(): Promise<{ nieuw: number; afgehandeld: number }> {
  const vandaag = new Date().toISOString().slice(0, 10);
  const rijen = await db
    .select({ id: facturenTable.id, relatienaam: facturenTable.relatienaam, factuurnummer: facturenTable.factuurnummer, vervaldatum: facturenTable.vervaldatum, bedrag: facturenTable.bedragInclBtw })
    .from(facturenTable)
    .where(and(
      eq(facturenTable.type, "verkoop"),
      eq(facturenTable.geblokkeerd, false),
      notInArray(facturenTable.status, ["afgekeurd", "historisch", "concept"]),
      isNotNull(facturenTable.vervaldatum),
      sql`${facturenTable.vervaldatum} < ${vandaag}`,
      sql`(${facturenTable.betaalstatus} IS NULL OR ${facturenTable.betaalstatus} <> 'betaald')`,
    ));
  const items: WerkbakInvoer[] = rijen.map((f) => ({
    soort: "doen" as const,
    bron: "verkoopfactuur_vervallen" as const,
    titel: `Verkoopfactuur over vervaldatum: ${f.relatienaam ?? "onbekend"} ${f.factuurnummer ?? `#${f.id}`}${f.bedrag ? ` (€${f.bedrag})` : ""}`,
    omschrijving: `Vervaldatum was ${f.vervaldatum}. Stuur een herinnering of start incasso vanaf de factuurpagina.`,
    vereisteModule: "financieel",
    vereistNiveau: 2,
    gewicht: 65,
    actiePad: `/facturen/${f.id}`,
    herkomstType: "factuur",
    herkomstId: f.id,
    dedupSleutel: `verkoopfactuur_vervallen:${f.id}`,
  }));
  return syncBron("verkoopfactuur_vervallen", items);
}

// Afgesloten projecten met open OHW: waarde die op de balans blijft hangen
// terwijl het project klaar is — factureren of afwaarderen is een menselijk besluit.
async function voedOhwSignalen(): Promise<{ nieuw: number; afgehandeld: number }> {
  const peildatum = new Date().toISOString().slice(0, 10);
  // Alleen de afgesloten statussen doorrekenen (begrensde set) — nooit de hele
  // opdrachtenportefeuille aggregeren in de sequentiële bewakingsloop.
  const ohwItems = [
    ...(await berekenOhwItems(peildatum, "afgerond")),
    ...(await berekenOhwItems(peildatum, "geannuleerd")),
  ];
  const open = ohwItems.filter((i) => i.signaleringen.includes("Project afgesloten maar OHW nog open"));
  const items: WerkbakInvoer[] = open.map((i) => ({
    soort: "doen" as const,
    bron: "ohw_signaal" as const,
    titel: `Project afgesloten maar OHW nog open: ${i.titel ?? `opdracht #${i.opdracht_id}`} (€${Math.round(i.waarde_ohw)})`,
    omschrijving: "Factureer het restant of pas de OHW-waardering aan (met toelichting) zodat de balans klopt.",
    vereisteModule: "financieel",
    vereistNiveau: 2,
    gewicht: 60,
    actiePad: "/financieel/onderhanden-werk",
    herkomstType: "opdracht",
    herkomstId: i.opdracht_id,
    dedupSleutel: `ohw_signaal:afgesloten:${i.opdracht_id}`,
  }));
  return syncBron("ohw_signaal", items);
}

export async function draaiBewakingsloop(): Promise<Record<string, { nieuw: number; afgehandeld: number } | { fout: string }>> {
  // Overlap-guard: een tweede (handmatige) draai tijdens een lopende draai kan
  // via reconciliatie een halfgesynchroniseerde set als stale afsluiten.
  if (_loopBezig) return { overgeslagen: { fout: "Er draait al een bewakingsloop" } };
  _loopBezig = true;
  try {
  const [draai] = await db.insert(bewakingDraaienTable).values({}).returning();
  const samenvatting: Record<string, { nieuw: number; afgehandeld: number } | { fout: string }> = {};
  const voeders: Array<[string, () => Promise<{ nieuw: number; afgehandeld: number }>]> = [
    ["contracten", voedContracten],
    ["financiele_contracten", voedFinancieleContracten],
    ["poortwachter", voedPoortwachter],
    ["verloopdatums", voedVerloopdatums],
    ["wagenpark_sync", voedWagenparkSync],
    ["verlofverjaring", voedVerlofverjaring],
    ["factuursignalen", voedFactuursignalen],
    ["facturen_zonder_leverancier", voedFacturenZonderLeverancier],
    ["prijsafspraken_verlopen", voedPrijsafsprakenVerlopen],
    ["goedkeuringsaanvragen", voedGoedkeuringsaanvragen],
    ["verlofaanvragen", voedVerlofaanvragen],
    ["facturen_ter_goedkeuring", voedFacturenTerGoedkeuring],
    ["betaalbatches", voedBetaalbatches],
    // FINANCIEEL_KETEN_01 — financiële toestanden die op een mens wachten.
    ["facturen_geblokkeerd", voedGeblokkeerdeFacturen],
    ["facturen_exportfout", voedExportfouten],
    ["verkoopfacturen_vervallen", voedVervallenVerkoopfacturen],
    ["ohw_signalen", voedOhwSignalen],
    ["conceptantwoorden", voedConceptantwoorden],
    ["mail_antwoorden", voedMailAntwoorden],
    ["weekstaat_controle", voedWeekstaatControle],
    ["tvt_opname", voedTvtOpname],
    ["voorzieningen_openstaand", voedOpenstaandeVoorzieningen],
    ["regie_openstaand", voedRegieOpenstaand],
    // AI_01 §3 — proactieve AI-signalen (deterministisch, geen LLM in de loop).
    ["ai_calculatie_afwijking", voedAiCalculatieAfwijking],
    ["ai_inkoop_afwijking", voedAiInkoopAfwijking],
    ["ai_magazijn_bestelsuggestie", voedAiMagazijnBestelsuggestie],
    ["ai_hrm_capaciteit", voedAiHrmCapaciteit],
    ["ai_werkvoorbereiding_signaal", voedAiWerkvoorbereidingSignaal],
    // HRM_01 §2.3: uiterste aanzegdatum + ZZP/DBA-deadline → HRM-beheerder.
    ["cruciale_deadlines_hrm", voedCrucialeDeadlinesHrm],
    // BEWAKING_02 §6 — de commerciële keten.
    ["offerte_geen_reactie", voedOfferteGeenReactie],
    ["offerte_bekeken_niet_getekend", voedOfferteBekekenNietGetekend],
    ["offerte_verlopen", voedOfferteVerlopen],
    ["opname_zonder_calculatie", voedOpnameZonderCalculatie],
    ["calculatie_zonder_offerte", voedCalculatieZonderOfferte],
    ["opdracht_zonder_akkoord", voedOpdrachtZonderAkkoord],
    // UITROL_BEWAKING_01 — productie loopt achter op de laatst gemelde uitrol.
    ["uitrol_achterloop", voedUitrolAchterloop],
  ];
  let fouten = 0;
  for (const [naam, voeder] of voeders) {
    try {
      samenvatting[naam] = await voeder();
    } catch (err) {
      fouten += 1;
      samenvatting[naam] = { fout: err instanceof Error ? err.message : String(err) };
      logger.error({ err, voeder: naam }, "bewakingsloop: voeder mislukt");
    }
  }
  await db.update(bewakingDraaienTable).set({
    klaarOp: new Date(),
    // "klaar" alleen als álle voeders slaagden — een gedeeltelijk falende draai
    // telt niet als gezond (anders kan een kapotte voeder dagenlang stil zijn).
    status: fouten === 0 ? "klaar" : fouten === voeders.length ? "fout" : "gedeeltelijk",
    samenvatting,
    fout: fouten > 0 ? `${fouten} voeder(s) mislukt` : null,
  }).where(eq(bewakingDraaienTable.id, draai!.id));
  // Falende voeders zijn zelf een signaal voor de hoofdbeheerder; herstelt de
  // draai volledig, dan wordt het item door reconciliatie afgehandeld.
  const mislukteVoeders = Object.entries(samenvatting)
    .filter(([, v]) => "fout" in v)
    .map(([naam]) => naam);
  await syncBron("bewakingsloop", mislukteVoeders.length > 0 ? [{
    soort: "weten",
    bron: "bewakingsloop",
    titel: `Bewakingsloop: ${mislukteVoeders.length} voeder(s) mislukt`,
    omschrijving: `Mislukt: ${mislukteVoeders.join(", ")}. Deze bronnen leveren geen signalen tot ze hersteld zijn.`,
    alleenHoofdbeheerder: true,
    gewicht: 95,
    herkomstType: "bewaking_draai",
    herkomstId: draai!.id,
    dedupSleutel: "bewakingsloop:voeders_mislukt",
  }] : []);
  logger.info({ draaiId: draai!.id, fouten }, "bewakingsloop: draai afgerond");
  return samenvatting;
  } finally {
    _loopBezig = false;
  }
}

// Controle op uitblijven: als de laatste geslaagde draai ouder is dan 26 uur,
// is dat zelf een werkbak-item voor René. Wordt bij elke draai én bij opstart
// getoetst — een stille bewaking die stopt is erger dan geen bewaking.
export async function controleerLoopGezondheid(): Promise<void> {
  const [laatste] = await db
    .select()
    .from(bewakingDraaienTable)
    .where(eq(bewakingDraaienTable.status, "klaar"))
    .orderBy(desc(bewakingDraaienTable.klaarOp))
    .limit(1);
  const teOud = !laatste?.klaarOp || Date.now() - laatste.klaarOp.getTime() > 26 * 3600 * 1000;
  if (teOud) {
    await meldWerkbakItem({
      soort: "weten",
      bron: "bewakingsloop",
      titel: "De dagelijkse bewakingsloop heeft niet gedraaid",
      omschrijving: laatste?.klaarOp
        ? `Laatste geslaagde draai: ${laatste.klaarOp.toLocaleString("nl-NL")}. Zonder de loop ontstaan er geen signalen — controleer de server.`
        : "Er is nog nooit een geslaagde draai geregistreerd.",
      alleenHoofdbeheerder: true,
      gewicht: 100,
      herkomstType: "bewaking_draai",
      herkomstId: laatste?.id ?? null,
      dedupSleutel: "bewakingsloop:niet_gedraaid",
    });
  } else {
    // Loop is gezond → een eventueel openstaand niet-gedraaid-item afhandelen
    // (met herleidbare oorzaak: er ís weer gedraaid).
    const { handelBronAf } = await import("./werkbakService");
    await handelBronAf("bewakingsloop:niet_gedraaid");
  }
}

let _gepland = false;

// Dagelijks om 06:30 (vóór werktijd, na de backup van 03:00 en AVG van 02:30).
export function planDagelijkseBewakingsloop(): void {
  if (_gepland) return;
  _gepland = true;

  const scheduleNext = (): void => {
    const nu = new Date();
    const volgende = new Date(nu);
    volgende.setHours(6, 30, 0, 0);
    if (volgende <= nu) volgende.setDate(volgende.getDate() + 1);
    const wachtMs = volgende.getTime() - nu.getTime();
    logger.info({ uren: Math.round(wachtMs / 3600000 * 10) / 10 }, "bewakingsloop: volgende draai gepland (06:30)");
    setTimeout(async () => {
      try {
        await draaiBewakingsloop();
      } catch (err) {
        logger.error({ err }, "bewakingsloop: draai mislukt");
      }
      try {
        await controleerLoopGezondheid();
      } catch (err) {
        logger.error({ err }, "bewakingsloop: gezondheidscontrole mislukt");
      }
      scheduleNext();
    }, wachtMs).unref();
  };

  scheduleNext();

  // Bij opstart: gezondheid toetsen (niet meteen draaien — dat doet de planner).
  setTimeout(() => {
    controleerLoopGezondheid().catch((err) => logger.error({ err }, "bewakingsloop: opstartcontrole mislukt"));
  }, 20 * 1000).unref();
}
