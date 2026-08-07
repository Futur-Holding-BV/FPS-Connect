// ─── FACTUUR_02: de factuurstroom — van mail tot goedgekeurd of afgewezen ─────
//
// Eén ingang (§2): facturen komen uitsluitend binnen via de factuurmailbox in
// de werk-inbox. Deze service draait automatisch na elke mailbox-sync én
// periodiek op de achtergrond. Het systeem bereidt voor en signaleert — het
// keurt zélf nooit een factuur goed (§5).
//
// Route: mail → systeem leest → afwijzen (gesloten redenlijst) | signaal naar
// Jacqueline | bevestiging inkoper → goedkeuring René → klaar voor betaling.
// Betaling zelf is FACTUUR_03 en zit hier bewust niet in.

import { and, desc, eq, inArray, isNull, isNotNull, lt, ne, sql } from "drizzle-orm";
import {
  db,
  facturenTable,
  factuurSignalenTable,
  factuurTijdlijnTable,
  factuurCorrespondentieTable,
  crmKlantenTable,
  gebruikersTable,
  werkInboxMailboxenTable,
  werkInboxMailsTable,
  werkInboxKoppelingenTable,
  FACTUUR_AFWIJSREDENEN,
  type FactuurAfwijsredenCode,
  type FactuurSignaalType,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { ObjectStorageService } from "../lib/objectStorage";
import { analyseerFactuurVoorStroom, type FactuurStroomVelden } from "../lib/documentIntelligence";
import { haalBijlagen } from "./werkInboxGraph";
import { stuurPushNaarGebruiker } from "../lib/pushService";

const objectStorage = new ObjectStorageService();

// ── Tijdlijn & signalen (gewone taal, §6/§7) ─────────────────────────────────

export async function schrijfTijdlijn(factuurId: number, tekst: string, gebruikerNaam?: string | null): Promise<void> {
  await db.insert(factuurTijdlijnTable).values({ factuurId, tekst, gebruikerNaam: gebruikerNaam ?? null });
}

export async function maakSignaal(input: {
  type: FactuurSignaalType;
  omschrijving: string;
  factuurId?: number | null;
  mailMessageId?: string | null;
  projectkansId?: number | null;
}): Promise<void> {
  // Dubbele open signalen van hetzelfde type voor dezelfde factuur/projectkans/mail voorkomen
  if (input.factuurId || input.projectkansId || input.mailMessageId) {
    const bestaand = await db.select({ id: factuurSignalenTable.id })
      .from(factuurSignalenTable)
      .where(and(
        eq(factuurSignalenTable.type, input.type),
        input.factuurId
          ? eq(factuurSignalenTable.factuurId, input.factuurId)
          : input.projectkansId
            ? eq(factuurSignalenTable.projectkansId, input.projectkansId)
            : eq(factuurSignalenTable.mailMessageId, input.mailMessageId!),
        eq(factuurSignalenTable.status, "open"),
      ))
      .limit(1);
    if (bestaand.length > 0) return;
  }
  // onConflictDoNothing + partiële unieke indexes (apply-additive) maken de
  // dedupe database-atomair: parallelle bewakingsruns geven nooit dubbels.
  await db.insert(factuurSignalenTable).values({
    type: input.type,
    omschrijving: input.omschrijving,
    factuurId: input.factuurId ?? null,
    mailMessageId: input.mailMessageId ?? null,
    projectkansId: input.projectkansId ?? null,
  }).onConflictDoNothing();
}

// ── Tenaamstelling → BV ──────────────────────────────────────────────────────

const BV_NAMEN = ["FPS Bouw BV", "FPS Brandpreventie BV", "FPS Onderhoud BV"] as const;

export function bepaalBv(tenaamstelling: string | null): string | null {
  if (!tenaamstelling) return null;
  const t = tenaamstelling.toLowerCase().replace(/\./g, "");
  if (t.includes("brandpreventie")) return "FPS Brandpreventie BV";
  if (t.includes("onderhoud")) return "FPS Onderhoud BV";
  if (t.includes("bouw")) return "FPS Bouw BV";
  return null;
}

// ── Leverancier koppelen aan CRM (geen losse tekst, §3) ──────────────────────

async function zoekLeverancier(naam: string | null): Promise<{ id: number; naam: string; type: string | null } | null> {
  if (!naam) return null;
  const genorm = naam.trim().toLowerCase().replace(/\s*(b\.?v\.?|v\.?o\.?f\.?|n\.?v\.?)\s*$/i, "").trim();
  if (genorm.length < 3) return null;
  const kandidaten = await db.select({ id: crmKlantenTable.id, naam: crmKlantenTable.naam, type: crmKlantenTable.type })
    .from(crmKlantenTable)
    .where(sql`lower(${crmKlantenTable.naam}) LIKE ${"%" + genorm + "%"} OR ${sql.raw("lower(" + '"crm_klanten"."naam"' + ")")} = ${genorm}`);
  // Alleen bij exact één plausibele match koppelen — nooit gokken
  const exact = kandidaten.filter((k) => k.naam.trim().toLowerCase().replace(/\s*(b\.?v\.?|v\.?o\.?f\.?|n\.?v\.?)\s*$/i, "").trim() === genorm);
  if (exact.length === 1) return exact[0];
  if (kandidaten.length === 1) return kandidaten[0];
  return null;
}

// ── Hoofdbeheerder(s) vinden voor meldingen ──────────────────────────────────

async function hoofdbeheerderIds(): Promise<number[]> {
  const rijen = await db.select({ id: gebruikersTable.id })
    .from(gebruikersTable)
    .where(and(eq(gebruikersTable.rol, "hoofdbeheerder"), eq(gebruikersTable.actief, true)));
  return rijen.map((r) => r.id);
}

// ── Automatische afwijzing (gesloten lijst, §4) ──────────────────────────────

async function wijsAutomatischAf(
  factuurId: number,
  redenCode: FactuurAfwijsredenCode,
  huidigeStatus: string,
  contactEmail: string | null,
  leverancierNaam: string | null,
  factuurnummer: string | null,
): Promise<void> {
  const redenTekst = FACTUUR_AFWIJSREDENEN[redenCode];
  await db.update(facturenTable).set({
    status: "afgekeurd",
    afwijsredenCode: redenCode,
    afgekeurdReden: redenTekst,
    afgekeurdOp: new Date(),
    statusVoorAfwijzing: huidigeStatus,
    bijgewerktOp: new Date(),
  }).where(eq(facturenTable.id, factuurId));

  await schrijfTijdlijn(factuurId, `De factuur is automatisch afgewezen: ${redenTekst.toLowerCase()}. Er staat een conceptmail klaar voor de leverancier.`);

  // Reactiemail als concept — een mens verstuurt (§4)
  const onderwerp = `Uw factuur ${factuurnummer ?? ""} kan zo niet verwerkt worden`.replace(/\s+/g, " ").trim();
  const bericht = maakAfwijsMailTekst(redenCode, leverancierNaam, factuurnummer);
  await db.insert(factuurCorrespondentieTable).values({
    factuurId,
    richting: "uitgaand",
    soort: "afkeur",
    status: "concept",
    ontvangerEmail: contactEmail,
    ontvangerNaam: leverancierNaam,
    onderwerp,
    bericht,
    afkeurCategorie: redenCode,
    aiGegenereerd: true,
  });
}

export function maakAfwijsMailTekst(
  redenCode: FactuurAfwijsredenCode,
  leverancierNaam: string | null,
  factuurnummer: string | null,
): string {
  const aanhef = leverancierNaam ? `Geachte ${leverancierNaam},` : "Geachte relatie,";
  const nr = factuurnummer ? ` met nummer ${factuurnummer}` : "";
  const kern: Record<FactuurAfwijsredenCode, string> = {
    geen_opdracht: `wij kunnen uw factuur${nr} niet koppelen aan een bij ons bekende opdracht of inkoop. Wilt u het opdracht- of bonnummer vermelden en de factuur opnieuw sturen?`,
    bedrag_wijkt_af: `het bedrag op uw factuur${nr} wijkt af van de afgesproken opdracht. Wilt u de factuur controleren en een gecorrigeerde versie of een toelichting sturen?`,
    verkeerde_bv: `uw factuur${nr} is aan de verkeerde vennootschap gericht. Wilt u de factuur opnieuw sturen met de juiste tenaamstelling?`,
    dubbel: `wij hebben uw factuur${nr} al eerder ontvangen. Deze versie wordt daarom niet apart in behandeling genomen.`,
    onvoldoende_specificatie: `uw factuur${nr} is onvoldoende gespecificeerd om te kunnen beoordelen. Wilt u een specificatie (uren, materiaal, periode) nasturen?`,
    niet_geleverd: `wij kunnen de op uw factuur${nr} vermelde levering of werkzaamheden nog niet als geleverd bevestigen. Wilt u contact opnemen met uw contactpersoon bij FPS?`,
    uitzendbureau_zonder_g: `op uw factuur${nr} ontbreekt de verplichte verdeling met het G-rekeningdeel (loondeel). Wilt u een gecorrigeerde factuur sturen met de G-rekeningverdeling erop vermeld?`,
  };
  return `${aanhef}\n\n${kern[redenCode].charAt(0).toUpperCase()}${kern[redenCode].slice(1)}\n\nZodra wij de aangevulde of gecorrigeerde factuur ontvangen, pakken wij de verwerking direct weer op.\n\nMet vriendelijke groet,\nFPS Brandpreventie — administratie`;
}

// ── Kern: één factuurmail verwerken ──────────────────────────────────────────

interface MailRij {
  messageId: string;
  gebruikerId: number;
  mailboxAdres: string;
  onderwerp: string;
  afzenderNaam: string | null;
  afzenderEmail: string;
  conversationId: string | null;
  heeftBijlage: boolean;
}

async function verwerkFactuurmail(mail: MailRij, isPersonlijk: boolean): Promise<void> {
  // §8 — reactie in een bestaand gesprek? Dan hervatten, geen nieuwe factuur.
  if (mail.conversationId) {
    const [bestaande] = await db.select()
      .from(facturenTable)
      .where(eq(facturenTable.conversationId, mail.conversationId))
      .limit(1);
    if (bestaande) {
      await verwerkLeveranciersReactie(bestaande, mail);
      return;
    }
  }

  if (!mail.heeftBijlage) {
    // Factuurmailbox-mail zonder bijlage: nooit stil laten liggen
    await maakSignaal({
      type: "ai_onzeker",
      omschrijving: `Mail van ${mail.afzenderNaam ?? mail.afzenderEmail} ("${mail.onderwerp}") in de factuurmailbox heeft geen bijlage. Iemand moet kijken wat hiermee moet.`,
      mailMessageId: mail.messageId,
    });
    return;
  }

  const bijlagen = await haalBijlagen(mail.gebruikerId, mail.mailboxAdres, mail.messageId, isPersonlijk);
  const kandidaten = bijlagen.filter((b) =>
    b.contentType === "application/pdf" || b.contentType.startsWith("image/") || b.name.toLowerCase().endsWith(".pdf"));

  if (kandidaten.length === 0) {
    await maakSignaal({
      type: "ai_onzeker",
      omschrijving: `Mail van ${mail.afzenderNaam ?? mail.afzenderEmail} ("${mail.onderwerp}") bevat geen leesbare factuurbijlage (PDF of afbeelding).`,
      mailMessageId: mail.messageId,
    });
    return;
  }

  for (const bijlage of kandidaten) {
    await verwerkFactuurBijlage(mail, bijlage);
  }
}

async function verwerkFactuurBijlage(
  mail: MailRij,
  bijlage: { name: string; contentType: string; contentBytes?: string },
): Promise<void> {
  const buffer = Buffer.from(bijlage.contentBytes ?? "", "base64");
  const mime = bijlage.contentType === "application/octet-stream" && bijlage.name.toLowerCase().endsWith(".pdf")
    ? "application/pdf" : bijlage.contentType;

  const analyse = await analyseerFactuurVoorStroom({
    buffer,
    bestandsnaam: bijlage.name,
    mime,
    mailOnderwerp: mail.onderwerp,
    mailAfzender: `${mail.afzenderNaam ?? ""} <${mail.afzenderEmail}>`,
  });

  if (!analyse.ok || !analyse.velden) {
    await maakSignaal({
      type: "ai_onzeker",
      omschrijving: `De bijlage "${bijlage.name}" van ${mail.afzenderNaam ?? mail.afzenderEmail} kon niet gelezen worden (${analyse.fout ?? "onbekende fout"}). Iemand moet deze handmatig beoordelen.`,
      mailMessageId: mail.messageId,
    });
    return;
  }
  if (!analyse.is_factuur) {
    // Geen factuur (bv. algemene voorwaarden als bijlage) — stilzwijgend overslaan is oké
    return;
  }

  const v = analyse.velden;

  // PDF opslaan zodat de factuur altijd terug te vinden is
  let pdfUrl: string | null = null;
  try {
    const veiligeNaam = bijlage.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const subPath = `facturen/mailstroom/${Date.now()}-${veiligeNaam}`;
    await objectStorage.uploadBestand(subPath, buffer, mime);
    pdfUrl = `/api/storage/files?path=${encodeURIComponent(subPath)}`;
  } catch (err) {
    logger.warn({ err }, "factuurstroom: PDF opslaan mislukt");
  }

  const onzeker = [...v.onzekere_velden];

  // Leverancier → CRM (§3)
  const leverancier = await zoekLeverancier(v.leverancier_naam);
  const bv = bepaalBv(v.tenaamstelling);
  if (!bv && v.tenaamstelling) onzeker.push("tenaamstelling_bv");

  // Dubbelcontrole
  let dubbel = false;
  if (v.factuurnummer) {
    const bestaand = await db.select({ id: facturenTable.id }).from(facturenTable)
      .where(and(
        eq(facturenTable.type, "inkoop"),
        eq(facturenTable.factuurnummer, v.factuurnummer),
        leverancier ? eq(facturenTable.leverancierId, leverancier.id) : eq(facturenTable.relatienaam, v.leverancier_naam ?? ""),
      )).limit(1);
    dubbel = bestaand.length > 0;
  }

  // IBAN-wissel-detectie (fraudesignaal, §6.7) t.o.v. eerdere facturen van deze leverancier
  let ibanGewijzigd = false;
  let vorigIban: string | null = null;
  if (v.iban && leverancier) {
    const [vorige] = await db.select({ iban: facturenTable.ibanUitgelezen }).from(facturenTable)
      .where(and(
        eq(facturenTable.leverancierId, leverancier.id),
        isNotNull(facturenTable.ibanUitgelezen),
        ne(facturenTable.ibanUitgelezen, ""),
      ))
      .orderBy(desc(facturenTable.id)).limit(1);
    if (vorige?.iban && vorige.iban.replace(/\s+/g, "").toUpperCase() !== v.iban.toUpperCase()) {
      ibanGewijzigd = true;
      vorigIban = vorige.iban;
    }
  }

  // Uitzendbureau-controle (bouwt op FACTUUR_01: crm_klanten.type)
  const isUitzendbureau = leverancier?.type === "uitzendbureau" || leverancier?.type === "inlener";
  const loondeelOntbreekt = isUitzendbureau && (!v.loondeel_vermeld || v.loondeel_bedrag == null);

  // Factuurrij aanmaken
  const [factuur] = await db.insert(facturenTable).values({
    type: "inkoop",
    bron: "mailbox",
    status: "ai_gelezen",
    aiGelezen: true,
    factuurnummer: v.factuurnummer,
    factuurdatum: v.factuurdatum,
    vervaldatum: v.vervaldatum,
    omschrijving: v.omschrijving,
    relatienaam: leverancier?.naam ?? v.leverancier_naam,
    leverancierId: leverancier?.id ?? null,
    bedragExclBtw: v.bedrag_excl_btw != null ? String(v.bedrag_excl_btw) : null,
    btwBedrag: v.btw_bedrag != null ? String(v.btw_bedrag) : null,
    bedragInclBtw: v.bedrag_incl_btw != null ? String(v.bedrag_incl_btw) : null,
    ibanUitgelezen: v.iban,
    ibanAfwijking: ibanGewijzigd,
    gRekeningVanToepassing: v.loondeel_vermeld,
    gRekeningBedrag: v.loondeel_bedrag != null ? String(v.loondeel_bedrag) : null,
    tenaamstellingBv: bv,
    pdfUrl,
    bestandsnaam: bijlage.name,
    conversationId: mail.conversationId,
    mailMessageId: mail.messageId,
    onzekereVelden: onzeker.length > 0 ? onzeker : null,
    aiVoorstelStroom: { ...v, tenaamstelling_bv: bv, leverancier_id: leverancier?.id ?? null, gelezen_op: new Date().toISOString() },
    opmerkingen: v.verwijzing ? `Verwijzing op factuur: ${v.verwijzing}` : null,
  }).returning();

  // Mail ↔ factuur koppeling in de werk-inbox
  await db.insert(werkInboxKoppelingenTable).values({
    messageId: mail.messageId,
    gebruikerId: mail.gebruikerId,
    entityType: "factuur",
    entityId: factuur.id,
    entityLabel: `Factuur ${v.factuurnummer ?? ""} — ${leverancier?.naam ?? v.leverancier_naam ?? "onbekend"}`.trim(),
  }).onConflictDoNothing();

  await schrijfTijdlijn(factuur.id,
    `De factuur is binnengekomen via de mail van ${mail.afzenderNaam ?? mail.afzenderEmail} en automatisch gelezen. ` +
    `${leverancier ? `Herkend als factuur van ${leverancier.naam}.` : "De leverancier kon nog niet met zekerheid worden herkend."}`);

  // ── Controles → signalen / automatische afwijzing ──────────────────────────
  if (dubbel) {
    await maakSignaal({ type: "mogelijk_dubbel", factuurId: factuur.id,
      omschrijving: `Factuur ${v.factuurnummer} van ${leverancier?.naam ?? v.leverancier_naam ?? "onbekende leverancier"} lijkt al eerder ontvangen te zijn.` });
  }
  if (ibanGewijzigd) {
    await maakSignaal({ type: "rekeningnummer_gewijzigd", factuurId: factuur.id,
      omschrijving: `Het rekeningnummer van ${leverancier?.naam ?? "deze leverancier"} is gewijzigd (was ${vorigIban}, nu ${v.iban}). Dit kan op fraude wijzen en moet altijd gecontroleerd worden.` });
    await schrijfTijdlijn(factuur.id, "Let op: het rekeningnummer wijkt af van eerdere facturen van deze leverancier. Dit wordt gemeld en niet stil afgehandeld.");
  }
  if (!leverancier) {
    await maakSignaal({ type: "onbekende_leverancier", factuurId: factuur.id,
      omschrijving: `De leverancier "${v.leverancier_naam ?? "onbekend"}" is nog niet (eenduidig) bekend in het relatiebestand. Koppel de juiste organisatie voordat de factuur verder kan.` });
  }
  if (onzeker.length > 0) {
    await maakSignaal({ type: "ai_onzeker", factuurId: factuur.id,
      omschrijving: `Bij het lezen van factuur ${v.factuurnummer ?? `van ${v.leverancier_naam ?? "onbekend"}`} is het systeem niet zeker over: ${onzeker.join(", ")}. Iemand moet dit nakijken.` });
  }
  if (isUitzendbureau && v.loondeel_vermeld && v.loondeel_bedrag != null && v.bedrag_incl_btw != null
      && (v.loondeel_bedrag <= 0 || v.loondeel_bedrag >= v.bedrag_incl_btw)) {
    await maakSignaal({ type: "loondeel_onzeker", factuurId: factuur.id,
      omschrijving: `Het loondeel (€ ${v.loondeel_bedrag}) op de uitzendfactuur van ${leverancier?.naam} oogt onwaarschijnlijk ten opzichte van het totaalbedrag (€ ${v.bedrag_incl_btw}).` });
  }

  // §4 automatische afwijzingen
  if (dubbel) {
    await wijsAutomatischAf(factuur.id, "dubbel", "ai_gelezen", mail.afzenderEmail, leverancier?.naam ?? v.leverancier_naam, v.factuurnummer);
    return;
  }
  if (loondeelOntbreekt) {
    await maakSignaal({ type: "loondeel_onzeker", factuurId: factuur.id,
      omschrijving: `Uitzendfactuur van ${leverancier?.naam} zonder G-rekeningverdeling — automatisch afgewezen, conceptmail staat klaar.` });
    await wijsAutomatischAf(factuur.id, "uitzendbureau_zonder_g", "ai_gelezen", mail.afzenderEmail, leverancier?.naam ?? v.leverancier_naam, v.factuurnummer);
    return;
  }

  // ── Routering (§5): inkoper bevestigt, daarna keurt René goed ───────────────
  await routeerNaVerwerking(factuur.id, leverancier?.id ?? null, !leverancier || onzeker.length > 0 || ibanGewijzigd);
}

async function routeerNaVerwerking(factuurId: number, leverancierId: number | null, naarControle: boolean): Promise<void> {
  if (naarControle) {
    // Onduidelijkheid → controle door een mens (Jacqueline-route); geen stilzwijgende aannames
    await db.update(facturenTable).set({ status: "controle_nodig", bijgewerktOp: new Date() }).where(eq(facturenTable.id, factuurId));
    await schrijfTijdlijn(factuurId, "De factuur wacht op controle door de administratie omdat het systeem niet alles met zekerheid kon vaststellen.");
    return;
  }

  // Inkoper zoeken via recente inkooporders bij deze leverancier
  let inkoperId: number | null = null;
  if (leverancierId) {
    try {
      const { inkoopbonnenTable } = await import("@workspace/db");
      const [bon] = await db.select({ goedgekeurdDoorId: inkoopbonnenTable.goedgekeurdDoorId })
        .from(inkoopbonnenTable)
        .where(and(eq(inkoopbonnenTable.leverancierId, leverancierId), isNotNull(inkoopbonnenTable.goedgekeurdDoorId)))
        .orderBy(desc(inkoopbonnenTable.id)).limit(1);
      inkoperId = bon?.goedgekeurdDoorId ?? null;
    } catch { /* inkoopmodule niet beschikbaar → geen inkoper */ }
  }

  if (inkoperId) {
    await db.update(facturenTable).set({ status: "wacht_op_inkoper", inkoperId, bijgewerktOp: new Date() }).where(eq(facturenTable.id, factuurId));
    const [ink] = await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, inkoperId)).limit(1);
    await schrijfTijdlijn(factuurId, `De factuur ligt bij ${ink?.naam ?? "de inkoper"} om te bevestigen dat dit klopt met de bestelling.`);
    await stuurPushNaarGebruiker(inkoperId, "Factuur te bevestigen", "Er staat een inkoopfactuur klaar die op jouw bestelling lijkt aan te sluiten.", { url: `/facturen/${factuurId}` });
  } else {
    await db.update(facturenTable).set({ status: "wacht_op_goedkeuring", bijgewerktOp: new Date() }).where(eq(facturenTable.id, factuurId));
    await schrijfTijdlijn(factuurId, "Er is geen specifieke inkoper gevonden; de factuur ligt ter goedkeuring bij de directie.");
    for (const id of await hoofdbeheerderIds()) {
      await stuurPushNaarGebruiker(id, "Factuur ter goedkeuring", "Er staat een nieuwe inkoopfactuur klaar om goed te keuren.", { url: `/facturen/${factuurId}` });
    }
  }
}

// ── §8: leveranciersreactie in bestaand gesprek ──────────────────────────────

async function verwerkLeveranciersReactie(
  factuur: typeof facturenTable.$inferSelect,
  mail: MailRij,
): Promise<void> {
  await db.insert(werkInboxKoppelingenTable).values({
    messageId: mail.messageId,
    gebruikerId: mail.gebruikerId,
    entityType: "factuur",
    entityId: factuur.id,
    entityLabel: `Reactie op factuur ${factuur.factuurnummer ?? factuur.id}`,
  }).onConflictDoNothing();

  await db.insert(factuurCorrespondentieTable).values({
    factuurId: factuur.id,
    richting: "inkomend",
    soort: "overig",
    status: "verzonden",
    ontvangerEmail: mail.afzenderEmail,
    ontvangerNaam: mail.afzenderNaam,
    onderwerp: mail.onderwerp,
    bericht: "(inhoud staat in de werk-inbox)",
    aiGegenereerd: false,
  });

  await schrijfTijdlijn(factuur.id, `${mail.afzenderNaam ?? mail.afzenderEmail} heeft gereageerd per mail ("${mail.onderwerp}").`);

  if (factuur.status === "afgekeurd") {
    // Nagestuurde info → de factuur pakt de draad weer op waar hij was
    const terugNaar = factuur.statusVoorAfwijzing ?? "controle_nodig";
    await db.update(facturenTable).set({ status: "controle_nodig", bijgewerktOp: new Date() }).where(eq(facturenTable.id, factuur.id));
    await schrijfTijdlijn(factuur.id, "Na de reactie van de leverancier is de factuur heropend en wacht hij op controle door de administratie.");
    await maakSignaal({ type: "ai_onzeker", factuurId: factuur.id, mailMessageId: mail.messageId,
      omschrijving: `De leverancier heeft gereageerd op de afgewezen factuur ${factuur.factuurnummer ?? factuur.id} (eerder afgewezen: ${factuur.afwijsredenCode ?? "onbekend"}; stond toen op stap "${terugNaar}"). Beoordeel of de aanvulling voldoende is.` });
  } else {
    await maakSignaal({ type: "ai_onzeker", factuurId: factuur.id, mailMessageId: mail.messageId,
      omschrijving: `Nieuwe mailreactie van ${mail.afzenderNaam ?? mail.afzenderEmail} bij factuur ${factuur.factuurnummer ?? factuur.id}. Kijk of hier actie nodig is.` });
  }
}

// ── Ingang: draai de pijplijn voor alle onverwerkte factuurmails ─────────────

export async function verwerkFactuurmails(gebruikerId: number): Promise<{ verwerkt: number }> {
  const factuurmailboxen = await db.select({ adres: werkInboxMailboxenTable.emailAdres })
    .from(werkInboxMailboxenTable)
    .where(and(
      eq(werkInboxMailboxenTable.gebruikerId, gebruikerId),
      eq(werkInboxMailboxenTable.actief, true),
      eq(werkInboxMailboxenTable.isFactuurmailbox, true),
    ));
  if (factuurmailboxen.length === 0) return { verwerkt: 0 };
  const adressen = factuurmailboxen.map((m) => m.adres);

  const mails = await db.select({
    messageId: werkInboxMailsTable.messageId,
    gebruikerId: werkInboxMailsTable.gebruikerId,
    mailboxAdres: werkInboxMailsTable.mailboxAdres,
    onderwerp: werkInboxMailsTable.onderwerp,
    afzenderNaam: werkInboxMailsTable.afzenderNaam,
    afzenderEmail: werkInboxMailsTable.afzenderEmail,
    conversationId: werkInboxMailsTable.conversationId,
    heeftBijlage: werkInboxMailsTable.heeftBijlage,
  })
    .from(werkInboxMailsTable)
    .where(and(
      eq(werkInboxMailsTable.gebruikerId, gebruikerId),
      inArray(werkInboxMailsTable.mailboxAdres, adressen),
      isNull(werkInboxMailsTable.factuurVerwerktOp),
    ))
    .orderBy(werkInboxMailsTable.ontvangenOp)
    .limit(20);

  let verwerkt = 0;
  for (const mail of mails) {
    // Eerst markeren (dedupe bij parallelle syncs), dan verwerken.
    const claim = await db.update(werkInboxMailsTable)
      .set({ factuurVerwerktOp: new Date() })
      .where(and(
        eq(werkInboxMailsTable.gebruikerId, mail.gebruikerId),
        eq(werkInboxMailsTable.messageId, mail.messageId),
        isNull(werkInboxMailsTable.factuurVerwerktOp),
      ))
      .returning({ id: werkInboxMailsTable.id });
    if (claim.length === 0) continue;
    try {
      await verwerkFactuurmail(mail, false);
      verwerkt += 1;
    } catch (err) {
      logger.error({ err, messageId: mail.messageId }, "factuurstroom: verwerking mislukt");
      // Claim teruggeven zodat een volgende run het opnieuw probeert (tijdelijke
      // Graph/AI-fouten mogen een mail nooit permanent onverwerkt laten); het
      // open signaal (gededupliceerd) houdt de mens ondertussen op de hoogte.
      await db.update(werkInboxMailsTable)
        .set({ factuurVerwerktOp: null })
        .where(and(
          eq(werkInboxMailsTable.gebruikerId, mail.gebruikerId),
          eq(werkInboxMailsTable.messageId, mail.messageId),
        ));
      await maakSignaal({
        type: "ai_onzeker",
        mailMessageId: mail.messageId,
        omschrijving: `De verwerking van de mail "${mail.onderwerp}" van ${mail.afzenderEmail} is technisch mislukt. Iemand moet deze handmatig oppakken.`,
      });
    }
  }
  return { verwerkt };
}

// ── Periodieke bewaking (§6.2/5/6): hangen, termijnen, uitgaand onbetaald ────

export async function draaiFactuurstroomBewaking(): Promise<void> {
  const nu = Date.now();
  const dagen = (n: number): Date => new Date(nu - n * 24 * 60 * 60 * 1000);

  // Hangt te lang bij inkoper of goedkeuring (>3 dagen niets gebeurd)
  const hangend = await db.select().from(facturenTable).where(and(
    eq(facturenTable.type, "inkoop"),
    inArray(facturenTable.status, ["wacht_op_inkoper", "wacht_op_goedkeuring", "controle_nodig"]),
    lt(facturenTable.bijgewerktOp, dagen(3)),
  ));
  for (const f of hangend) {
    const waar = f.status === "wacht_op_inkoper" ? "bij de inkoper" : f.status === "wacht_op_goedkeuring" ? "bij de goedkeuring" : "bij de controle";
    await maakSignaal({ type: "hangt_te_lang", factuurId: f.id,
      omschrijving: `Factuur ${f.factuurnummer ?? f.id} van ${f.relatienaam ?? "onbekend"} ligt al langer dan drie dagen stil ${waar}.` });
  }

  // Betaaltermijn loopt af terwijl de factuur nog niet klaar voor betaling is
  const vandaag = new Date();
  const overVijfDagen = new Date(nu + 5 * 24 * 60 * 60 * 1000);
  const openInkoop = await db.select().from(facturenTable).where(and(
    eq(facturenTable.type, "inkoop"),
    inArray(facturenTable.status, ["ontvangen", "ai_gelezen", "controle_nodig", "wacht_op_inkoper", "wacht_op_goedkeuring"]),
    isNotNull(facturenTable.vervaldatum),
  ));
  for (const f of openInkoop) {
    const verval = f.vervaldatum ? new Date(f.vervaldatum) : null;
    if (verval && !Number.isNaN(verval.getTime()) && verval <= overVijfDagen) {
      const verlopen = verval < vandaag;
      await maakSignaal({ type: "termijn_loopt_af", factuurId: f.id,
        omschrijving: `De betaaltermijn van factuur ${f.factuurnummer ?? f.id} van ${f.relatienaam ?? "onbekend"} ${verlopen ? "is verstreken" : "loopt binnen vijf dagen af"}, terwijl hij nog niet klaar voor betaling is.` });
    }
  }

  // Uitgaande (verkoop)facturen die na de vervaldatum nog niet betaald zijn
  const uitgaand = await db.select().from(facturenTable).where(and(
    eq(facturenTable.type, "verkoop"),
    isNotNull(facturenTable.vervaldatum),
  ));
  for (const f of uitgaand) {
    const verval = f.vervaldatum ? new Date(f.vervaldatum) : null;
    if (verval && !Number.isNaN(verval.getTime()) && verval < vandaag && f.betaalstatus !== "betaald") {
      await maakSignaal({ type: "uitgaand_onbetaald", factuurId: f.id,
        omschrijving: `Onze uitgaande factuur ${f.factuurnummer ?? f.id} aan ${f.relatienaam ?? "onbekend"} is over de vervaldatum en nog niet (volledig) betaald.` });
    }
  }
}

// ── Achtergrondlus: automatisch syncen + verwerken (§1/§10.1) ────────────────

const BEWAKING_INTERVAL_MS = 15 * 60 * 1000;
let bewakingGestart = false;

export function startFactuurstroomAchtergrond(): void {
  if (bewakingGestart) return;
  bewakingGestart = true;

  const lus = async (): Promise<void> => {
    try {
      // Sync + pijplijn voor alle gebruikers met een factuurmailbox
      const eigenaren = await db.selectDistinct({ gebruikerId: werkInboxMailboxenTable.gebruikerId })
        .from(werkInboxMailboxenTable)
        .where(and(eq(werkInboxMailboxenTable.isFactuurmailbox, true), eq(werkInboxMailboxenTable.actief, true)));
      for (const e of eigenaren) {
        try {
          const { syncMailboxen } = await import("./werkInboxGraph");
          await syncMailboxen(e.gebruikerId);
          await verwerkFactuurmails(e.gebruikerId);
        } catch (err) {
          logger.warn({ err, gebruikerId: e.gebruikerId }, "factuurstroom: achtergrond-sync mislukt");
        }
      }
      // AANVRAAG_01: zelfde lus — aanvraagmailboxen verwerken + reactietijdbewaking (geen tweede mechanisme).
      const { verwerkAanvraagmails, draaiAanvraagBewaking } = await import("./aanvraagstroomService");
      const aanvraagEigenaren = await db.selectDistinct({ gebruikerId: werkInboxMailboxenTable.gebruikerId })
        .from(werkInboxMailboxenTable)
        .where(and(eq(werkInboxMailboxenTable.isAanvraagmailbox, true), eq(werkInboxMailboxenTable.actief, true)));
      for (const e of aanvraagEigenaren) {
        try {
          await verwerkAanvraagmails(e.gebruikerId);
        } catch (err) {
          logger.warn({ err, gebruikerId: e.gebruikerId }, "aanvraagstroom: achtergrond-verwerking mislukt");
        }
      }
      await draaiFactuurstroomBewaking();
      await draaiAanvraagBewaking();
    } catch (err) {
      logger.error({ err }, "factuurstroom: achtergrondlus fout");
    } finally {
      setTimeout(() => { void lus(); }, BEWAKING_INTERVAL_MS);
    }
  };
  // Eerste run kort na opstart
  setTimeout(() => { void lus(); }, 30 * 1000);
  logger.info("factuurstroom: achtergrondbewaking gestart (elke 15 min)");
}
