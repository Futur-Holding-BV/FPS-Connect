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
} from "@workspace/db";
import { werkInboxMailboxToegangTable } from "@workspace/db";
import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { logger } from "./logger";
import { syncBron, meldWerkbakItem, type WerkbakInvoer } from "./werkbakService";
import { voerContractBewakingUit } from "../routes/contract-bewaking";
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

// ── De loop zelf ──────────────────────────────────────────────────────────────

let _loopBezig = false;

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
    ["goedkeuringsaanvragen", voedGoedkeuringsaanvragen],
    ["verlofaanvragen", voedVerlofaanvragen],
    ["facturen_ter_goedkeuring", voedFacturenTerGoedkeuring],
    ["betaalbatches", voedBetaalbatches],
    ["conceptantwoorden", voedConceptantwoorden],
    ["mail_antwoorden", voedMailAntwoorden],
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
