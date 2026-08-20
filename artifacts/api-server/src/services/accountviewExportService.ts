// ─── AccountView-exportservice ────────────────────────────────────────────────
//
// INKOOP_BOEKING_01: één plek waar een factuur naar AccountView geboekt wordt.
// De bestaande handmatige exportroute (POST /facturen/:id/export-accountview)
// en de nieuwe automatische boeking gebruiken exact dezelfde kern, zodat de
// controles (dubbele export, blokkade, goedkeuringsgate, verplichte velden)
// nooit uit elkaar kunnen lopen.
//
// Automatische boeking is bewust fail-closed:
// - alleen bij status klaar_voor_accountview + geaccordeerd + niet geblokkeerd;
// - de goedkeuringsgate wordt op het moment van boeken opnieuw gecontroleerd;
// - alleen als de beheerder de exportkoppeling heeft aangezet (export_actief);
// - mislukt de boeking, dan gaat er een faalmail met de reden naar de
//   hoofdbeheerder(s) en blijft de handmatige exportknop gewoon werken.

import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { controleerFactuurAdministratieBv } from "./factuurWerkmaatschappij";
import {
  db,
  facturenTable,
  factuurRegelsTable,
  grootboekrekeningenTable,
  btwCodesTable,
  accountviewInstellingenTable,
  accountviewExportLogsTable,
  gebruikersTable,
  factuurSignalenTable,
  factuurTijdlijnTable,
  bankMutatiesTable,
  bankAfletterAuditTable,
  werkgeversTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import {
  ACCOUNT_VIEW_POST_TIMEOUT_MS,
  maakAccountViewClient,
  type AccountviewBoeking,
  type AccountviewBoekingResultaat,
} from "./accountview-client";
import { checkVereistGoedkeuring, haalOpenAanvraag } from "./goedkeuring-engine";
import {
  stuurAccountviewBankmutatieMisluktMail,
  stuurAccountviewBoekingMisluktMail,
} from "./email";

type Factuur = typeof facturenTable.$inferSelect;

/**
 * Rekeningschema-poort (ADMINISTRATIE_01): een factuur kan niet geboekt worden
 * op een grootboekrekening die niet in het schema van die werkmaatschappij
 * staat. De poort dwingt af zodra het schema van de BV gevuld is; zolang er
 * nog geen schema is ingelezen (installatie-overgang) laat hij door — de
 * gebruik-meting op de beheerpagina maakt dat gat zichtbaar.
 * Gecontroleerd worden de effectieve koprekening (factuur of standaard) én
 * alle regelrekeningen van de factuur.
 */
export async function controleerGrootboekSchema(
  werkgeverId: number,
  factuurId: number,
  effectieveKoprekening: string | null | undefined,
): Promise<string | null> {
  const schema = await db
    .select({ nummer: grootboekrekeningenTable.nummer })
    .from(grootboekrekeningenTable)
    .where(and(eq(grootboekrekeningenTable.werkgeverId, werkgeverId), eq(grootboekrekeningenTable.actief, true)));
  if (schema.length === 0) return null; // nog geen schema ingelezen voor deze BV
  const toegestaan = new Set(schema.map((s) => s.nummer));
  const fout: string[] = [];
  const kop = (effectieveKoprekening ?? "").trim();
  if (kop && !toegestaan.has(kop)) fout.push(kop);
  const regels = await db
    .select({ n: factuurRegelsTable.grootboekrekening })
    .from(factuurRegelsTable)
    .where(eq(factuurRegelsTable.factuurId, factuurId));
  for (const r of regels) {
    const n = (r.n ?? "").trim();
    if (n && !toegestaan.has(n) && !fout.includes(n)) fout.push(n);
  }
  if (fout.length === 0) return null;
  return `Grootboekrekening ${fout.join(", ")} staat niet in het rekeningschema van deze werkmaatschappij. Kies een rekening uit het schema, of werk het schema bij via Beheer → Boekhouding.`;
}

/**
 * Btw-schemapoort (ADMINISTRATIE_02 §1): controleer kop- en regel-btw-codes
 * tegen het btw-schema van de werkmaatschappij. Zelfde besluit als het
 * rekeningschema: een leeg schema laat door (anders valt de boekingsstroom
 * stil vóór het schema is ingelezen); een gevuld schema is hard.
 */
export async function controleerBtwSchema(
  werkgeverId: number,
  factuurId: number,
  effectieveKopBtwCode: string | null | undefined,
): Promise<string | null> {
  const schema = await db
    .select({ code: btwCodesTable.code })
    .from(btwCodesTable)
    .where(and(eq(btwCodesTable.werkgeverId, werkgeverId), eq(btwCodesTable.actief, true)));
  if (schema.length === 0) return null; // nog geen btw-schema ingelezen voor deze BV
  const toegestaan = new Set(schema.map((s) => s.code));
  const fout: string[] = [];
  const kop = (effectieveKopBtwCode ?? "").trim();
  if (kop && !toegestaan.has(kop)) fout.push(kop);
  const regels = await db
    .select({ c: factuurRegelsTable.btwCode })
    .from(factuurRegelsTable)
    .where(eq(factuurRegelsTable.factuurId, factuurId));
  for (const r of regels) {
    const c = (r.c ?? "").trim();
    if (c && !toegestaan.has(c) && !fout.includes(c)) fout.push(c);
  }
  if (fout.length === 0) return null;
  return `Btw-code ${fout.join(", ")} staat niet in het btw-schema van deze werkmaatschappij. Kies een code uit het schema, of werk het schema bij via Beheer → Boekhouding.`;
}

/**
 * Gecombineerde schemapoort voor alle exportpaden: rekeningschema + btw-schema.
 * Geeft de eerste fout terug, of null als beide poorten passeren.
 */
export async function controleerBoekingsschema(
  werkgeverId: number,
  factuurId: number,
  effectieveKoprekening: string | null | undefined,
  effectieveKopBtwCode: string | null | undefined,
): Promise<string | null> {
  const gbFout = await controleerGrootboekSchema(werkgeverId, factuurId, effectieveKoprekening);
  if (gbFout) return gbFout;
  return await controleerBtwSchema(werkgeverId, factuurId, effectieveKopBtwCode);
}

// Zelfde afleiding als in routes/facturen.ts — klein en stabiel genoeg om hier
// te herhalen zonder een circulaire import te introduceren.
export function bepaalFactuurDocumentType(f: { type: string; subtype?: string | null }): string {
  if (f.subtype === "creditnota") return "creditnota";
  if (f.subtype === "prijsafwijking") return "prijsafwijking";
  return f.type === "verkoop" ? "verkoop_factuur" : "inkoop_factuur";
}

export interface ExportUitkomst {
  ok: boolean;
  httpStatus: number;              // voorgestelde HTTP-status voor de route
  fout?: string;
  detail?: string;
  fouten?: string[];
  viaGoedkeuring?: boolean;
  geslaagd?: boolean;
  boekingId?: string | null;
  foutmelding?: string | null;
  testmodus?: boolean;
}

/**
 * Atomaire verzend-claim tegen dubbele boekingen. Zet accountviewStatus op
 * "verzenden" — maar alleen als er niet al een verzending loopt en (behalve
 * bij herexport) de factuur niet al succesvol geboekt is. Alle verzendpaden
 * (auto, handmatig, batch, herexport) moeten deze claim nemen vóór de externe
 * call.
 *
 * Stale-reclaim op basis van leeftijd is bewust NIET geïmplementeerd: een
 * externe AccountView-aanroep die langer dan verwacht duurt kan niet veilig
 * worden overgenomen — het log-entry staat dan nog op "bezig" en een tweede
 * aanroep zou alsnog dubbel kunnen boeken. Herstel van een echte crash vereist
 * handmatige interventie of een toekomstige idempotency-token via AccountView.
 */
export async function claimAccountviewVerzending(
  factuurId: number,
  opties?: { herexport?: boolean },
): Promise<boolean> {
  const vanuitStatussen = opties?.herexport ? ["error", "success"] : ["error"];
  const geclaimd = await db
    .update(facturenTable)
    .set({ accountviewStatus: "verzenden", bijgewerktOp: new Date() })
    .where(and(
      eq(facturenTable.id, factuurId),
      eq(facturenTable.geblokkeerd, false),
      or(
        isNull(facturenTable.accountviewStatus),
        inArray(facturenTable.accountviewStatus, vanuitStatussen),
      ),
    ))
    .returning({ id: facturenTable.id });
  return geclaimd.length === 1;
}
/**
 * ADMINISTRATIE_01 fase 3 — hercontrole ná de verzend-claim (TOCTOU).
 *
 * De koppeling-BV blijft muteerbaar tussen de eerste controle en de externe
 * call. De factuur-BV is vanaf fiscale nummering een vaste momentopname; voor
 * concept/legacy blijft de werk-keten de fail-closed fallback. Daarom moet élk verzendpad (service,
 * forceer-herexport, batch-export) deze hercontrole draaien direct ná
 * claimAccountviewVerzending en vlak vóór client.verzendBoeking. De
 * AccountView-instellingen worden hier bewust VERS gelezen (niet de eerder
 * opgehaalde rij) en controleerFactuurAdministratieBv leest de vaste factuur-BV
 * of anders de legacy-keten uit de database. Bij weigering
 * wordt de claim teruggegeven door de factuur op error te zetten, en krijgt
 * de aanroeper de leesbare weigering terug.
 *
 * Bij toestaan levert de hercontrole de VERSE instellingen-rij terug; de
 * aanroeper MOET de AccountView-client en de boekingspayload uitsluitend uit
 * deze gevalideerde snapshot opbouwen (nooit uit de vóór de claim gelezen
 * rij) — anders kan een gelijktijdige, samenhangende wijziging van factuur-BV
 * én koppeling de BV-toets doorstaan maar alsnog met de oude
 * administratiecode/credentials verzenden.
 */
type AccountviewInstellingen = typeof accountviewInstellingenTable.$inferSelect;
export async function hercontroleerBvNaClaim(
  factuur: Pick<typeof facturenTable.$inferSelect, "id" | "type" | "factuurnummer" | "werkgeverId" | "werkgeverVastgelegdOp" | "offerteId" | "opdrachtId" | "gebouwId">,
): Promise<{ bvFout: string; inst: null } | { bvFout: null; inst: AccountviewInstellingen }> {
  const [versInst] = await db.select().from(accountviewInstellingenTable)
    .where(eq(accountviewInstellingenTable.id, 1)).limit(1);
  const bvFout = !versInst
    ? "AccountView is niet (meer) geconfigureerd; de verzending is afgebroken."
    : await controleerFactuurAdministratieBv(factuur, versInst.werkgeverId ?? null);
  if (bvFout) {
    await db.update(facturenTable).set({
      accountviewStatus: "error",
      accountviewFout: bvFout,
      bijgewerktOp: new Date(),
    }).where(eq(facturenTable.id, factuur.id));
    return { bvFout, inst: null };
  }
  return { bvFout: null, inst: versInst! };
}
/**
 * Boekt één factuur naar AccountView. Voert alle bestaande controles uit en
 * geeft een gestructureerde uitkomst terug die de route 1-op-1 kan serveren.
 */
export async function exporteerFactuurNaarAccountView(
  factuurId: number,
  gebruikerId: number | null,
): Promise<ExportUitkomst> {
  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, factuurId)).limit(1);
  if (!factuur) return { ok: false, httpStatus: 404, fout: "Niet gevonden" };

  // Blokkeer dubbele export
  if (factuur.accountviewBoekingId && factuur.accountviewStatus === "success") {
    return {
      ok: false, httpStatus: 409, fout: "Dubbele export geblokkeerd",
      detail: `Deze factuur is al geëxporteerd naar AccountView (boekingId: ${factuur.accountviewBoekingId}).`,
    };
  }
  if (factuur.geblokkeerd) return { ok: false, httpStatus: 409, fout: "Factuur is geblokkeerd" };

  // Governance-gate: als er een actieve goedkeuringsaanvraag loopt of vereist is,
  // geef een expliciete melding zodat de export niet cryptisch faalt.
  {
    const documentType = bepaalFactuurDocumentType(factuur);
    const bedrag = factuur.bedragInclBtw ? parseFloat(factuur.bedragInclBtw) : null;
    const { vereist: govVereist } = await checkVereistGoedkeuring(db, documentType, bedrag, null);
    if (govVereist && !factuur.geaccordeerd) {
      const open = await haalOpenAanvraag(db, documentType, factuurId);
      return {
        ok: false, httpStatus: 422, fout: "Goedkeuring vereist voor AccountView-export",
        detail: open
          ? "Er loopt een openstaande goedkeuringsaanvraag voor deze factuur. Wacht op de uitkomst voor u naar AccountView exporteert."
          : "Deze factuur vereist goedkeuring. Dien de factuur ter goedkeuring in via de knop op de detailpagina.",
        viaGoedkeuring: true,
      };
    }
  }

  // Valideer verplichte velden
  const fouten: string[] = [];
  if (!factuur.factuurnummer) fouten.push("Factuurnummer ontbreekt");
  if (!factuur.factuurdatum) fouten.push("Factuurdatum ontbreekt");
  if (!factuur.relatienaam) fouten.push("Relatienaam ontbreekt");
  if (!factuur.bedragInclBtw) fouten.push("Bedrag incl. BTW ontbreekt");
  if (!factuur.btwCode) fouten.push("BTW-code ontbreekt");
  if (!factuur.geaccordeerd) fouten.push("Factuur is nog niet geaccordeerd");
  if (fouten.length > 0) return { ok: false, httpStatus: 422, fout: "Factuur is niet exportklaar", fouten };

  // Haal AccountView instellingen op
  const [inst] = await db.select().from(accountviewInstellingenTable).where(eq(accountviewInstellingenTable.id, 1)).limit(1);
  if (!inst) return { ok: false, httpStatus: 503, fout: "AccountView is niet geconfigureerd" };

  // ADMINISTRATIE_01 fase 3 (eis 3.6/4.4): harde werkmaatschappij↔administratie-
  // controle vóór élke boeking, fail-closed. Boeken kan alleen als (a) op de
  // koppeling vastligt voor welke BV deze administratie boekt, (b) de BV van
  // de factuur bepaalbaar is (offerte → opdracht → gebouw-default), en (c)
  // beide overeenkomen. Elke andere situatie weigert met een leesbare reden.
  {
    const bvFout = await controleerFactuurAdministratieBv(factuur, inst.werkgeverId ?? null);
    if (bvFout) {
      return { ok: false, httpStatus: 422, fout: "Werkmaatschappij-controle geweigerd", detail: bvFout };
    }
  }

  // Atomaire claim vlak vóór de externe call — voorkomt dat twee gelijktijdige
  // triggers (auto + handmatig, of dubbelklik) dezelfde boeking twee keer verzenden.
  const geclaimdVoorVerzending = await claimAccountviewVerzending(factuurId);
  if (!geclaimdVoorVerzending) {
    return {
      ok: false, httpStatus: 409, fout: "Verzending loopt al of factuur is al geboekt",
      detail: "Er loopt al een verzending naar AccountView voor deze factuur, of hij is intussen al succesvol geboekt.",
    };
  }

  // Crash-herstel: als een vorige poging extern slaagde maar de factuur-status-
  // update daarna crashte, staat de factuur op "error" en komt de claim hier via
  // de error-state terecht. Het geslaagde log-entry is dan al aanwezig. Herstel
  // de staat zonder opnieuw naar AccountView te bellen. Dit pad is uitsluitend
  // bereikbaar via error- of null-claim (nooit via verzenden-overname), zodat
  // geen gelijktijdige externe verzending mogelijk is.
  {
    const [bestaandGeslaagd] = await db
      .select()
      .from(accountviewExportLogsTable)
      .where(and(
        eq(accountviewExportLogsTable.factuurId, factuurId),
        eq(accountviewExportLogsTable.status, "geslaagd"),
      ))
      .orderBy(desc(accountviewExportLogsTable.exportOp))
      .limit(1);
    if (bestaandGeslaagd) {
      // Eerdere poging slaagde extern maar crashte vóór factuur-update. Herstel.
      await db.update(facturenTable).set({
        accountviewBoekingId: bestaandGeslaagd.accountviewBoekingId,
        accountviewExportOp: bestaandGeslaagd.exportOp,
        accountviewStatus: "success",
        accountviewFout: null,
        status: "verwerkt",
        bijgewerktOp: new Date(),
      }).where(eq(facturenTable.id, factuurId));
      logger.info({ factuurId, logId: bestaandGeslaagd.id },
        "stale-claim reconciliatie: geslaagd log gevonden, factuur-status hersteld zonder nieuwe AccountView-aanroep");
      return {
        ok: true, httpStatus: 200, geslaagd: true,
        boekingId: bestaandGeslaagd.accountviewBoekingId,
        foutmelding: null,
        testmodus: inst.testmodus,
        fouten: [],
      };
    }
  }

  // Hercontrole ná de claim (TOCTOU): zie hercontroleerBvNaClaim. Client en
  // payload worden hierna uitsluitend uit de gevalideerde verse snapshot
  // (versInst) opgebouwd — nooit uit de vóór de claim gelezen rij.
  const her = await hercontroleerBvNaClaim(factuur);
  if (her.bvFout !== null) {
    return { ok: false, httpStatus: 422, fout: "Werkmaatschappij-controle geweigerd", detail: her.bvFout };
  }
  const versInst = her.inst;

  // Rekeningschema-poort (ADMINISTRATIE_01): boeken buiten het schema van de
  // gekoppelde BV wordt geweigerd — ná de claim, op de verse snapshot.
  if (versInst.werkgeverId != null) {
    const schemaFout = await controleerBoekingsschema(
      versInst.werkgeverId,
      factuurId,
      factuur.grootboekrekening ?? versInst.grootboekStandaard,
      factuur.btwCode,
    );
    if (schemaFout) {
      // Claim teruggeven volgens het bestaande patroon: status error + reden.
      await db.update(facturenTable).set({
        accountviewStatus: "error",
        accountviewFout: schemaFout,
        bijgewerktOp: new Date(),
      }).where(eq(facturenTable.id, factuurId));
      return { ok: false, httpStatus: 422, fout: "Grootboekrekening niet in rekeningschema", detail: schemaFout };
    }
  }

  const client = maakAccountViewClient(versInst);
  const dagboek = factuur.dagboek ?? (factuur.type === "verkoop" ? versInst.dagboekVerkoop : versInst.dagboekInkoop) ?? "INK";

  const boeking: AccountviewBoeking = {
    dagboek: dagboek ?? "INK",
    administratiecode: versInst.administratiecode ?? "",
    factuurnummer: factuur.factuurnummer!,
    factuurdatum: factuur.factuurdatum!,
    vervaldatum: factuur.vervaldatum ?? factuur.factuurdatum!,
    relatienaam: factuur.relatienaam!,
    relatieCode: factuur.relatieCode ?? undefined,
    omschrijving: factuur.omschrijving ?? `Factuur ${factuur.factuurnummer}`,
    bedragExclBtw: parseFloat(factuur.bedragExclBtw ?? "0"),
    btwBedrag: parseFloat(factuur.btwBedrag ?? "0"),
    bedragInclBtw: parseFloat(factuur.bedragInclBtw ?? "0"),
    btwCode: factuur.btwCode ?? undefined,
    grootboekrekening: factuur.grootboekrekening ?? versInst.grootboekStandaard ?? undefined,
    kostenplaats: factuur.kostenplaats ?? undefined,
    projectCode: factuur.projectCode ?? undefined,
    type: factuur.type === "verkoop" ? "verkoop" : "inkoop",
  };

  // Maak log-entry aan
  const [logEntry] = await db.insert(accountviewExportLogsTable).values({
    factuurId,
    gebruikerId,
    testmodus: versInst.testmodus,
    verzondenPayload: boeking as unknown as Record<string, unknown>,
    status: "bezig",
  }).returning();

  const resultaat = await client.verzendBoeking(boeking);

  await db.update(accountviewExportLogsTable).set({
    accountviewResponse: resultaat.rawResponse as Record<string, unknown> | null,
    httpStatus: resultaat.httpStatus ?? null,
    status: resultaat.geslaagd ? "geslaagd" : "mislukt",
    accountviewBoekingId: resultaat.boekingId ?? null,
    foutmelding: resultaat.foutmelding ?? null,
  }).where(eq(accountviewExportLogsTable.id, logEntry!.id));

  if (resultaat.geslaagd) {
    await db.update(facturenTable).set({
      accountviewBoekingId: resultaat.boekingId ?? null,
      accountviewExportOp: new Date(),
      accountviewStatus: "success",
      accountviewFout: null,
      status: "verwerkt",
      bijgewerktOp: new Date(),
    }).where(eq(facturenTable.id, factuurId));
  } else {
    await db.update(facturenTable).set({
      accountviewStatus: "error",
      accountviewFout: resultaat.foutmelding ?? "Onbekende fout",
      status: "fout_bij_verzending",
      bijgewerktOp: new Date(),
    }).where(eq(facturenTable.id, factuurId));
  }

  return {
    ok: true,
    httpStatus: 200,
    geslaagd: resultaat.geslaagd,
    boekingId: resultaat.boekingId ?? null,
    foutmelding: resultaat.foutmelding ?? null,
    testmodus: versInst.testmodus,
    fouten: resultaat.foutDetails ?? [],
  };
}

/**
 * INKOOP_BOEKING_01 §3 — automatische boeking.
 *
 * Wordt (fire-and-forget, ná de databasecommit) aangeroepen op de plekken waar
 * een factuur op klaar_voor_accountview + geaccordeerd komt. Boekt alleen als
 * er géén openstaande goedkeuring is en de beheerder de exportkoppeling heeft
 * aangezet (export_actief). Mislukt de boeking, dan gaat er een faalmail met
 * de reden naar de hoofdbeheerder(s); handmatig exporteren blijft mogelijk.
 */
export async function probeerAutomatischeBoeking(factuurId: number, aanleiding: string): Promise<void> {
  try {
    const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, factuurId)).limit(1);
    if (!factuur) return;
    if (factuur.status !== "klaar_voor_accountview" || !factuur.geaccordeerd || factuur.geblokkeerd) return;
    if (factuur.accountviewBoekingId && factuur.accountviewStatus === "success") return;

    const [inst] = await db.select().from(accountviewInstellingenTable)
      .where(eq(accountviewInstellingenTable.id, 1)).limit(1);
    if (!inst || !inst.exportActief) {
      logger.info({ factuurId, aanleiding },
        "AccountView auto-boeking overgeslagen: exportkoppeling staat uit (export_actief)");
      return;
    }

    // Openstaande goedkeuring = nooit automatisch boeken (fail-closed).
    const documentType = bepaalFactuurDocumentType(factuur);
    const open = await haalOpenAanvraag(db, documentType, factuurId);
    if (open) {
      logger.info({ factuurId, aanleiding }, "AccountView auto-boeking overgeslagen: openstaande goedkeuringsaanvraag");
      return;
    }

    const uitkomst = await exporteerFactuurNaarAccountView(factuurId, null);
    if (uitkomst.ok && uitkomst.geslaagd) {
      await sluitOntbrekendeBoekgegevensSignaal(factuurId);
      logger.info({ factuurId, aanleiding, boekingId: uitkomst.boekingId, testmodus: uitkomst.testmodus },
        "AccountView auto-boeking geslaagd");
      return;
    }

    // Ontbrekende verplichte boekvelden (btw-code, factuurnummer, …) → géén faalmail,
    // maar een signaal + status terug naar controle_nodig. De achtergrondlus probeert
    // dan niet elk kwartier opnieuw; de auto-boeking triggert vanzelf zodra iemand de
    // ontbrekende gegevens invult en de factuur opnieuw accordeert.
    if (!uitkomst.ok && uitkomst.httpStatus === 422 && uitkomst.fout === "Factuur is niet exportklaar") {
      const ontbreekt = (uitkomst.fouten ?? []).join(", ");
      logger.info({ factuurId, aanleiding, ontbreekt },
        "AccountView auto-boeking uitgesteld: verplichte boekvelden ontbreken — signaal aangemaakt");

      // Gededupliceerd signaal (unieke index op type+factuurId voor open signalen).
      await db.insert(factuurSignalenTable).values({
        type: "ontbrekende_boekgegevens",
        factuurId,
        omschrijving: `Factuur ${factuur.factuurnummer ?? `#${factuurId}`} van ${factuur.relatienaam ?? "onbekend"} ` +
          `kan niet automatisch geboekt worden: ${ontbreekt}. ` +
          `Vul de ontbrekende gegevens in en accordeer opnieuw om alsnog automatisch te boeken.`,
      }).onConflictDoNothing();

      // Status terug naar controle_nodig zodat de achtergrondlus stopt met opnieuw proberen.
      await db.update(facturenTable).set({
        status: "controle_nodig",
        bijgewerktOp: new Date(),
      }).where(eq(facturenTable.id, factuurId));

      await db.insert(factuurTijdlijnTable).values({
        factuurId,
        tekst: `Automatisch boeken uitgesteld: ${ontbreekt}. Vul de ontbrekende boekvelden in en accordeer opnieuw.`,
        gebruikerNaam: null,
      });

      return; // géén faalmail
    }

    // Mislukt (controle-fout of AccountView-fout) → faalmail met reden.
    const reden = uitkomst.ok
      ? (uitkomst.foutmelding ?? "AccountView gaf een onbekende fout terug")
      : [uitkomst.fout, uitkomst.detail, ...(uitkomst.fouten ?? [])].filter(Boolean).join(" — ");
    logger.warn({ factuurId, aanleiding, reden }, "AccountView auto-boeking mislukt");
    await stuurFaalmailNaarHoofdbeheerders(factuur, reden, aanleiding);
  } catch (err) {
    logger.error({ err, factuurId, aanleiding }, "AccountView auto-boeking: onverwachte fout");
    try {
      const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, factuurId)).limit(1);
      if (factuur) {
        await stuurFaalmailNaarHoofdbeheerders(factuur,
          `Onverwachte fout tijdens automatisch boeken: ${err instanceof Error ? err.message : String(err)}`, aanleiding);
      }
    } catch (mailErr) {
      logger.error({ err: mailErr, factuurId }, "AccountView auto-boeking: faalmail versturen mislukt");
    }
  }
}

/**
 * Sluit het signaal dat de automatische boeking eerder door ontbrekende
 * boekvelden uitstelde. De statuswijziging en de tijdlijnregel gebeuren in
 * één transactie; bij een gelijktijdige tweede trigger sluit alleen de eerste
 * het open signaal en schrijft dus ook alleen die ene de tijdlijnregel.
 */
export async function sluitOntbrekendeBoekgegevensSignaal(factuurId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [afgesloten] = await tx
      .update(factuurSignalenTable)
      .set({
        status: "afgehandeld",
        afgehandeldOp: new Date(),
      })
      .where(and(
        eq(factuurSignalenTable.factuurId, factuurId),
        eq(factuurSignalenTable.type, "ontbrekende_boekgegevens"),
        eq(factuurSignalenTable.status, "open"),
      ))
      .returning({ id: factuurSignalenTable.id });

    if (!afgesloten) return;

    await tx.insert(factuurTijdlijnTable).values({
      factuurId,
      tekst: "Boekvelden waren eerder onvolledig — alsnog automatisch geboekt na aanvulling.",
      gebruikerNaam: null,
    });
  });
}

async function stuurFaalmailNaarHoofdbeheerders(factuur: Factuur, reden: string, aanleiding: string): Promise<void> {
  const ontvangers = await db.select({ email: gebruikersTable.email, naam: gebruikersTable.naam })
    .from(gebruikersTable)
    .where(and(eq(gebruikersTable.rol, "hoofdbeheerder"), eq(gebruikersTable.actief, true)));
  for (const o of ontvangers) {
    if (!o.email) continue;
    try {
      await stuurAccountviewBoekingMisluktMail({
        naarEmail: o.email,
        naarNaam: o.naam,
        factuurId: factuur.id,
        factuurnummer: factuur.factuurnummer,
        relatienaam: factuur.relatienaam,
        bedragInclBtw: factuur.bedragInclBtw,
        reden,
        aanleiding,
      });
    } catch (err) {
      logger.error({ err, factuurId: factuur.id, naar: o.email }, "AccountView-faalmail versturen mislukt");
    }
  }
}

export interface BankmutatieExportUitkomst {
  ok: boolean;
  httpStatus: number;
  fout?: string;
  detail?: string;
  geslaagd?: boolean;
  boekingId?: string | null;
  foutmelding?: string | null;
  testmodus?: boolean;
}

// De claim mag pas verlopen lang nadat de lokale AccountView-POST door zijn
// harde timeout is beëindigd. Verval maakt de mutatie uitsluitend 'onzeker';
// een nieuwe poging blijft een expliciete, geaudite keuze na externe controle.
export const BANKEXPORT_CLAIM_TTL_MS = Math.max(
  15 * 60 * 1000,
  ACCOUNT_VIEW_POST_TIMEOUT_MS * 3,
);

type BankmutatieVoorExport = typeof bankMutatiesTable.$inferSelect;

export type BankexportHerstelActie = "bevestig_geboekt" | "opnieuw_proberen";

export async function exporteerBankmutatieNaarAccountView(
  mutatieId: number,
  gebruikerId?: number | null,
): Promise<BankmutatieExportUitkomst> {
  // 1. Lees mutatie op
  const [mutatie] = await db
    .select()
    .from(bankMutatiesTable)
    .where(eq(bankMutatiesTable.id, mutatieId))
    .limit(1);

  if (!mutatie) {
    return { ok: false, httpStatus: 404, fout: "Bankmutatie niet gevonden" };
  }
  if (mutatie.reconciliatieStatus !== "gematcht") {
    return {
      ok: false,
      httpStatus: 422,
      fout: "Bankmutatie is nog niet eenduidig afgeletterd",
      detail: "Alleen een gematchte bankmutatie mag naar AccountView worden doorgegeven.",
    };
  }

  // 2. Idempotent herstel: was er al een geslaagde export voor deze mutatie?
  const [bestaandGeslaagd] = await db
    .select()
    .from(accountviewExportLogsTable)
    .where(
      and(
        eq(accountviewExportLogsTable.bankMutatieId, mutatieId),
        eq(accountviewExportLogsTable.status, "geslaagd"),
      ),
    )
    .orderBy(desc(accountviewExportLogsTable.exportOp))
    .limit(1);

  if (bestaandGeslaagd) {
    // Herstel de status op de mutatie als die nog niet juist staat
    if (mutatie.accountviewStatus !== "geslaagd") {
      await db
        .update(bankMutatiesTable)
        .set({
          accountviewStatus: "geslaagd",
          accountviewId: bestaandGeslaagd.accountviewBoekingId,
          accountviewFout: null,
          accountviewClaimToken: null,
          accountviewClaimOp: null,
          bijgewerktOp: new Date(),
        })
        .where(eq(bankMutatiesTable.id, mutatieId));
    }
    logger.info({ mutatieId, logId: bestaandGeslaagd.id },
      "bankmutatie AccountView-export: idempotent herstel — geslaagd log gevonden");
    return {
      ok: true,
      httpStatus: 200,
      geslaagd: true,
      boekingId: bestaandGeslaagd.accountviewBoekingId,
      foutmelding: null,
    };
  }

  // Een verlopen bezig-claim wordt nooit automatisch opnieuw verzonden: de
  // externe boeking kan al gelukt zijn terwijl Connect vóór statusopslag crashte.
  if (mutatie.accountviewStatus === "bezig") {
    const claimVerlopen =
      mutatie.accountviewClaimOp == null ||
      mutatie.accountviewClaimOp.getTime() < Date.now() - BANKEXPORT_CLAIM_TTL_MS;
    if (claimVerlopen) {
      const fout = "De vorige AccountView-aanroep is onderbroken; controleer in AccountView of de bankmutatie al is geboekt voordat u een herstelkeuze maakt.";
      const claimVoorwaarde = mutatie.accountviewClaimToken == null
        ? isNull(bankMutatiesTable.accountviewClaimToken)
        : eq(bankMutatiesTable.accountviewClaimToken, mutatie.accountviewClaimToken);
      const onzeker = await db.update(bankMutatiesTable)
        .set({
          accountviewStatus: "onzeker",
          accountviewFout: fout,
          accountviewClaimToken: null,
          accountviewClaimOp: null,
          bijgewerktOp: new Date(),
        })
        .where(and(
          eq(bankMutatiesTable.id, mutatieId),
          eq(bankMutatiesTable.accountviewStatus, "bezig"),
          claimVoorwaarde,
        ))
        .returning({ id: bankMutatiesTable.id });
      if (onzeker.length > 0) {
        await db.insert(bankAfletterAuditTable).values({
          mutatieId,
          actie: "accountview_export_onzeker",
          reden: fout,
          gebruikerId: gebruikerId ?? null,
        });
        await stuurBankexportFaalmelding(mutatie, fout);
      }
      return {
        ok: false,
        httpStatus: 409,
        fout: "AccountView-uitkomst is onzeker",
        detail: fout,
      };
    }
    return {
      ok: false,
      httpStatus: 409,
      fout: "Export loopt al",
      detail: "De bankmutatie wordt momenteel naar AccountView verzonden.",
    };
  }
  if (mutatie.accountviewStatus === "onzeker") {
    return {
      ok: false,
      httpStatus: 409,
      fout: "AccountView-uitkomst is onzeker",
      detail: mutatie.accountviewFout ?? "Controleer eerst in AccountView of deze mutatie al is geboekt.",
    };
  }

  // 3. Atomaire claim: zet accountviewStatus op 'bezig'
  const claimToken = randomUUID();
  const claimOp = new Date();
  const geclaimd = await db
    .update(bankMutatiesTable)
    .set({
      accountviewStatus: "bezig",
      accountviewFout: null,
      accountviewClaimToken: claimToken,
      accountviewClaimOp: claimOp,
      bijgewerktOp: claimOp,
    })
    .where(
      and(
        eq(bankMutatiesTable.id, mutatieId),
        or(
          isNull(bankMutatiesTable.accountviewStatus),
          eq(bankMutatiesTable.accountviewStatus, "mislukt"),
        ),
        eq(bankMutatiesTable.reconciliatieStatus, "gematcht"),
      ),
    )
    .returning({ id: bankMutatiesTable.id });

  if (geclaimd.length === 0) {
    return {
      ok: false,
      httpStatus: 409,
      fout: "Export loopt al of is al geslaagd",
      detail: "De bankmutatie wordt al geëxporteerd of is al succesvol geboekt in AccountView.",
    };
  }

  // 4. Werkgever ophalen
  const werkgeverId = mutatie.werkgeverId;
  const [werkgever] = await db
    .select({ naam: werkgeversTable.naam })
    .from(werkgeversTable)
    .where(eq(werkgeversTable.id, werkgeverId))
    .limit(1);

  // 5. AccountView-instellingen VERS ophalen ná claim (TOCTOU-bescherming)
  const [versInst] = await db
    .select()
    .from(accountviewInstellingenTable)
    .where(eq(accountviewInstellingenTable.id, 1))
    .limit(1);

  if (!versInst) {
    await registreerBankexportFout(mutatie, "AccountView is niet geconfigureerd", gebruikerId, claimToken);
    return { ok: false, httpStatus: 503, fout: "AccountView is niet geconfigureerd" };
  }
  if (!versInst.exportActief) {
    const fout = "AccountView-export is niet actief";
    await registreerBankexportFout(mutatie, fout, gebruikerId, claimToken);
    return { ok: false, httpStatus: 422, fout };
  }

  // Werkgever-administratie-controle
  if (versInst.werkgeverId == null || versInst.werkgeverId !== werkgeverId) {
    const fout = `Bankmutatie hoort bij werkgever ${werkgeverId}, maar de AccountView-koppeling boekt voor werkgever ${versInst.werkgeverId}. Export geblokkeerd.`;
    await registreerBankexportFout(mutatie, fout, gebruikerId, claimToken);
    return { ok: false, httpStatus: 422, fout: "Werkmaatschappij-controle geweigerd", detail: fout };
  }

  // 6. Bouw nul-BTW-journaalpost-payload
  const isCredit = mutatie.creditDebit === "CRDT";
  const dagboek = versInst.dagboekBank?.trim();
  if (!dagboek) {
    const fout = "Het AccountView-bankdagboek is niet geconfigureerd";
    await registreerBankexportFout(mutatie, fout, gebruikerId, claimToken);
    return { ok: false, httpStatus: 422, fout };
  }

  const bedragFloat = parseFloat(mutatie.bedrag ?? "0");
  // Gesigneerd: credit is positief, debet negatief (zoals in de DB)
  const gesigneerdBedrag = Math.abs(bedragFloat) * (isCredit ? 1 : -1);

  const omschrijving = [mutatie.remittance, mutatie.bankreferentie]
    .filter(Boolean)
    .join(" — ")
    .slice(0, 200) || `Bankmutatie ${mutatie.bankreferentie}`;

  const boeking: AccountviewBoeking = {
    dagboek,
    administratiecode: versInst.administratiecode ?? "",
    factuurnummer: mutatie.bankreferentie,
    factuurdatum: mutatie.boekdatum,
    vervaldatum: mutatie.boekdatum,
    relatienaam: mutatie.tegenpartijNaam ?? werkgever?.naam ?? "Onbekend",
    omschrijving,
    bedragExclBtw: gesigneerdBedrag,
    btwBedrag: 0,
    bedragInclBtw: gesigneerdBedrag,
    btwCode: "0",
    type: isCredit ? "verkoop" : "inkoop",
  };

  // 7. Log aanmaken
  const [logEntry] = await db
    .insert(accountviewExportLogsTable)
    .values({
      factuurId: null,
      bankMutatieId: mutatieId,
      gebruikerId: gebruikerId ?? null,
      testmodus: versInst.testmodus,
      verzondenPayload: boeking as unknown as Record<string, unknown>,
      status: "bezig",
      actie: "export",
    })
    .returning();

  // 8. Verzenden
  const client = maakAccountViewClient(versInst);
  let resultaat;
  try {
    resultaat = await client.verzendBoeking(boeking);
  } catch (err) {
    resultaat = {
      geslaagd: false,
      foutmelding: err instanceof Error ? err.message : String(err),
      testmodus: versInst.testmodus,
    };
  }

  const onzekereUitkomst = isOnzekereAccountviewUitkomst(resultaat);

  // 9. Log bijwerken
  await db
    .update(accountviewExportLogsTable)
    .set({
      accountviewResponse: resultaat.rawResponse as Record<string, unknown> | null,
      httpStatus: resultaat.httpStatus ?? null,
      status: resultaat.geslaagd ? "geslaagd" : (onzekereUitkomst ? "onzeker" : "mislukt"),
      accountviewBoekingId: resultaat.boekingId ?? null,
      foutmelding: resultaat.foutmelding ?? null,
    })
    .where(eq(accountviewExportLogsTable.id, logEntry!.id));

  // 10. Een transport-/serverfout na de POST kan betekenen dat AccountView de
  // boeking wel ontving maar Connect de bevestiging niet. Nooit automatisch
  // retrybaar maken: eerst expliciet in AccountView controleren.
  if (onzekereUitkomst) {
    const fout = `AccountView gaf geen eenduidige uitkomst na verzending: ${resultaat.foutmelding ?? `HTTP ${resultaat.httpStatus ?? 0}`}`;
    const bijgewerkt = await db.update(bankMutatiesTable)
      .set({
        accountviewStatus: "onzeker",
        accountviewFout: fout.slice(0, 1000),
        accountviewClaimToken: null,
        accountviewClaimOp: null,
        bijgewerktOp: new Date(),
      })
      .where(and(
        eq(bankMutatiesTable.id, mutatieId),
        eq(bankMutatiesTable.accountviewClaimToken, claimToken),
      ))
      .returning({ id: bankMutatiesTable.id });
    if (bijgewerkt.length > 0) {
      await db.insert(bankAfletterAuditTable).values({
        mutatieId,
        actie: "accountview_export_onzeker",
        reden: fout.slice(0, 1000),
        gebruikerId: gebruikerId ?? null,
      });
      await stuurBankexportFaalmelding(mutatie, fout);
    }
    return {
      ok: false,
      httpStatus: 409,
      fout: "AccountView-uitkomst is onzeker",
      detail: fout,
      geslaagd: false,
      boekingId: null,
      foutmelding: resultaat.foutmelding ?? null,
      testmodus: versInst.testmodus,
    };
  }

  // 11. Mutatie-status bijwerken
  if (resultaat.geslaagd) {
    const bijgewerkt = await db
      .update(bankMutatiesTable)
      .set({
        accountviewStatus: "geslaagd",
        accountviewId: resultaat.boekingId ?? null,
        accountviewFout: null,
        accountviewClaimToken: null,
        accountviewClaimOp: null,
        bijgewerktOp: new Date(),
      })
      .where(and(
        eq(bankMutatiesTable.id, mutatieId),
        eq(bankMutatiesTable.accountviewClaimToken, claimToken),
      ))
      .returning({ id: bankMutatiesTable.id });
    if (bijgewerkt.length > 0) {
      await db.insert(bankAfletterAuditTable).values({
        mutatieId,
        actie: "accountview_export",
        reden: `Geslaagd${resultaat.boekingId ? `: ${resultaat.boekingId}` : ""}`,
        gebruikerId: gebruikerId ?? null,
      });
    }
  } else {
    await registreerBankexportFout(mutatie, resultaat.foutmelding ?? "Onbekende fout", gebruikerId, claimToken);
  }

  return {
    ok: resultaat.geslaagd,
    httpStatus: resultaat.geslaagd ? 200 : 502,
    fout: resultaat.geslaagd ? undefined : "AccountView-export mislukt",
    detail: resultaat.geslaagd ? undefined : (resultaat.foutmelding ?? "Onbekende fout"),
    geslaagd: resultaat.geslaagd,
    boekingId: resultaat.boekingId ?? null,
    foutmelding: resultaat.foutmelding ?? null,
    testmodus: versInst.testmodus,
  };
}

/**
 * Herstelt uitsluitend een onzekere export na een expliciete controle in
 * AccountView. Er is bewust geen automatische retry: de eerdere externe POST
 * kan al gelukt zijn terwijl alleen de lokale succesopslag wegviel.
 */
export async function herstelOnzekereBankexport(
  mutatieId: number,
  actie: BankexportHerstelActie,
  reden: string,
  gebruikerId: number | null,
  accountviewBoekingId?: string | null,
): Promise<BankmutatieExportUitkomst> {
  const schoneReden = reden.trim();
  if (!schoneReden) {
    return { ok: false, httpStatus: 400, fout: "Een toelichting op de controle in AccountView is verplicht" };
  }
  const boekingId = accountviewBoekingId?.trim() ?? "";
  if (actie === "bevestig_geboekt" && !boekingId) {
    return { ok: false, httpStatus: 400, fout: "Het gecontroleerde AccountView-boekings-ID is verplicht" };
  }

  return db.transaction(async (tx) => {
    const [mutatie] = await tx.select()
      .from(bankMutatiesTable)
      .where(eq(bankMutatiesTable.id, mutatieId))
      .for("update")
      .limit(1);
    if (!mutatie) return { ok: false, httpStatus: 404, fout: "Bankmutatie niet gevonden" };
    if (mutatie.accountviewStatus === "geslaagd") {
      return {
        ok: true,
        httpStatus: 200,
        geslaagd: true,
        boekingId: mutatie.accountviewId,
        foutmelding: null,
      };
    }
    if (mutatie.accountviewStatus !== "onzeker") {
      return {
        ok: false,
        httpStatus: 409,
        fout: "Alleen een onzekere AccountView-export kan handmatig worden hersteld",
      };
    }

    const [laatsteLog] = await tx.select()
      .from(accountviewExportLogsTable)
      .where(eq(accountviewExportLogsTable.bankMutatieId, mutatieId))
      .orderBy(desc(accountviewExportLogsTable.exportOp))
      .limit(1);

    if (actie === "bevestig_geboekt") {
      await tx.update(bankMutatiesTable)
        .set({
          accountviewStatus: "geslaagd",
          accountviewId: boekingId,
          accountviewFout: null,
          accountviewClaimToken: null,
          accountviewClaimOp: null,
          bijgewerktOp: new Date(),
        })
        .where(eq(bankMutatiesTable.id, mutatieId));
      if (laatsteLog) {
        await tx.update(accountviewExportLogsTable)
          .set({
            status: "geslaagd",
            accountviewBoekingId: boekingId,
            foutmelding: `Handmatig bevestigd na controle: ${schoneReden}`.slice(0, 1000),
          })
          .where(eq(accountviewExportLogsTable.id, laatsteLog.id));
      } else {
        await tx.insert(accountviewExportLogsTable).values({
          factuurId: null,
          bankMutatieId: mutatieId,
          gebruikerId,
          testmodus: false,
          actie: "herstel",
          status: "geslaagd",
          accountviewBoekingId: boekingId,
          foutmelding: `Handmatig bevestigd na controle: ${schoneReden}`.slice(0, 1000),
        });
      }
      await tx.insert(bankAfletterAuditTable).values({
        mutatieId,
        actie: "accountview_herstel_bevestigd",
        reden: `${schoneReden} (AccountView-ID: ${boekingId})`.slice(0, 1000),
        gebruikerId,
      });
      return {
        ok: true,
        httpStatus: 200,
        geslaagd: true,
        boekingId,
        foutmelding: null,
      };
    }

    await tx.update(bankMutatiesTable)
      .set({
        accountviewStatus: "mislukt",
        accountviewId: null,
        accountviewFout: `Vrijgegeven voor nieuwe poging na controle: ${schoneReden}`.slice(0, 1000),
        accountviewClaimToken: null,
        accountviewClaimOp: null,
        bijgewerktOp: new Date(),
      })
      .where(eq(bankMutatiesTable.id, mutatieId));
    if (laatsteLog?.status === "bezig") {
      await tx.update(accountviewExportLogsTable)
        .set({
          status: "mislukt",
          foutmelding: `Onzekere uitkomst gecontroleerd; vrijgegeven voor retry: ${schoneReden}`.slice(0, 1000),
        })
        .where(eq(accountviewExportLogsTable.id, laatsteLog.id));
    }
    await tx.insert(bankAfletterAuditTable).values({
      mutatieId,
      actie: "accountview_herstel_retry",
      reden: schoneReden.slice(0, 1000),
      gebruikerId,
    });
    return {
      ok: true,
      httpStatus: 200,
      geslaagd: false,
      boekingId: null,
      foutmelding: "Export is vrijgegeven voor een nieuwe, expliciete poging.",
    };
  });
}

async function stuurBankexportFaalmelding(
  mutatie: BankmutatieVoorExport,
  fout: string,
): Promise<void> {
  const beheerders = await db
    .select({ id: gebruikersTable.id, naam: gebruikersTable.naam, email: gebruikersTable.email })
    .from(gebruikersTable)
    .where(and(eq(gebruikersTable.rol, "hoofdbeheerder"), eq(gebruikersTable.actief, true)));
  for (const beheerder of beheerders) {
    if (!beheerder.email) continue;
    try {
      await stuurAccountviewBankmutatieMisluktMail({
        naarEmail: beheerder.email,
        naarNaam: beheerder.naam,
        mutatieId: mutatie.id,
        bankreferentie: mutatie.bankreferentie,
        tegenpartijNaam: mutatie.tegenpartijNaam,
        bedrag: mutatie.bedrag,
        reden: fout,
        deduplicatieSleutel: `accountview-bankmutatie:${mutatie.id}:${fout.slice(0, 80)}:${beheerder.id}`,
      });
    } catch (err) {
      logger.warn({ err, mutatieId: mutatie.id, beheerderId: beheerder.id }, "bankmutatie AccountView-faalmail kon niet worden ingepland");
    }
  }
}

export function isOnzekereAccountviewUitkomst(
  resultaat: Pick<AccountviewBoekingResultaat, "geslaagd" | "httpStatus" | "testmodus">,
): boolean {
  if (resultaat.geslaagd || resultaat.testmodus) return false;
  const status = resultaat.httpStatus ?? 0;
  return status === 0 || status === 408 || status >= 500;
}

async function registreerBankexportFout(
  mutatie: BankmutatieVoorExport,
  fout: string,
  gebruikerId?: number | null,
  claimToken?: string,
): Promise<void> {
  const voorwaarden = [eq(bankMutatiesTable.id, mutatie.id)];
  if (claimToken) voorwaarden.push(eq(bankMutatiesTable.accountviewClaimToken, claimToken));
  const bijgewerkt = await db.update(bankMutatiesTable)
    .set({
      accountviewStatus: "mislukt",
      accountviewFout: fout,
      accountviewClaimToken: null,
      accountviewClaimOp: null,
      bijgewerktOp: new Date(),
    })
    .where(and(...voorwaarden))
    .returning({ id: bankMutatiesTable.id });
  if (bijgewerkt.length === 0) {
    logger.warn(
      { mutatieId: mutatie.id },
      "bankmutatie AccountView-fout kwam terug voor een niet-meer-eigen claim; status en meldingen niet overschreven",
    );
    return;
  }
  await db.insert(bankAfletterAuditTable).values({
    mutatieId: mutatie.id,
    actie: "accountview_export",
    reden: `Mislukt: ${fout}`.slice(0, 1000),
    gebruikerId: gebruikerId ?? null,
  });
  await stuurBankexportFaalmelding(mutatie, fout);
}
