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

import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
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
} from "@workspace/db";
import { logger } from "../lib/logger";
import { maakAccountViewClient, type AccountviewBoeking } from "./accountview-client";
import { checkVereistGoedkeuring, haalOpenAanvraag } from "./goedkeuring-engine";
import { stuurAccountviewBoekingMisluktMail } from "./email";

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
 * bij herexport) de factuur niet al succesvol geboekt is. Een claim die door
 * een crash blijft hangen, vervalt na 10 minuten. Alle verzendpaden (auto,
 * handmatig, batch, herexport) moeten deze claim nemen vóór de externe call.
 */
export async function claimAccountviewVerzending(
  factuurId: number,
  opties?: { herexport?: boolean },
): Promise<boolean> {
  const staleGrens = new Date(Date.now() - 10 * 60 * 1000);
  const vanuitStatussen = opties?.herexport ? ["error", "success"] : ["error"];
  const geclaimd = await db.update(facturenTable)
    .set({ accountviewStatus: "verzenden", bijgewerktOp: new Date() })
    .where(and(
      eq(facturenTable.id, factuurId),
      eq(facturenTable.geblokkeerd, false),
      or(
        isNull(facturenTable.accountviewStatus),
        inArray(facturenTable.accountviewStatus, vanuitStatussen),
        // hangende claim ouder dan 10 minuten mag overgenomen worden
        and(eq(facturenTable.accountviewStatus, "verzenden"), lt(facturenTable.bijgewerktOp, staleGrens)),
      ),
    ))
    .returning({ id: facturenTable.id });
  return geclaimd.length === 1;
}

/**
 * ADMINISTRATIE_01 fase 3 — hercontrole ná de verzend-claim (TOCTOU).
 *
 * De BV op offerte/opdracht en de koppeling-BV blijven muteerbaar tussen de
 * eerste controle en de externe call. Daarom moet élk verzendpad (service,
 * forceer-herexport, batch-export) deze hercontrole draaien direct ná
 * claimAccountviewVerzending en vlak vóór client.verzendBoeking. De
 * AccountView-instellingen worden hier bewust VERS gelezen (niet de eerder
 * opgehaalde rij) en controleerFactuurAdministratieBv leest de BV-keten
 * (offerte → opdracht → gebouw) altijd live uit de database. Bij weigering
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
  factuur: Pick<typeof facturenTable.$inferSelect, "id" | "offerteId" | "opdrachtId" | "gebouwId">,
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
