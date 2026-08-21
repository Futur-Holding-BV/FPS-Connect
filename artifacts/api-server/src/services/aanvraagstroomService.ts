// ─── AANVRAAG_01: van prijsaanvraag naar projectkans, met conceptantwoord ─────
//
// Hergebruikt het intake-mechanisme uit FACTUUR_02 (claim op de mail, signalen,
// zelfde achtergrondlus). De AI stelt uitsluitend vóór — pas na menselijke
// goedkeuring wordt er een projectkans vastgelegd, en er gaat nooit een mail
// automatisch de deur uit. Er ontstaat hier nooit een project (proces 1).

import { and, eq, ilike, inArray, isNull, isNotNull, or } from "drizzle-orm";
export { selecteerKlantUitKandidaten } from "./aanvraagMatchSelector";
export type { KlantKandidaat, KlantSelectieResultaat } from "./aanvraagMatchSelector";
import {
  db,
  aanvraagVoorstellenTable,
  crmCommercieelTable,
  crmKlantenTable,
  crmContactpersonenTable,
  projectenTable,
  gebouwenTable,
  appInstellingenTable,
  werkInboxMailboxenTable,
  werkInboxMailsTable,
  werkInboxTokensTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { storageObjectsUrl } from "../lib/storageObjectsUrl";
import { ObjectStorageService } from "../lib/objectStorage";
import { analyseerAanvraagVoorStroom, extraheerTekst, type AanvraagStroomVelden } from "../lib/documentIntelligence";
import { haalBijlagen, haalVolledigeMail } from "./werkInboxGraph";
import { maakSignaal } from "./factuurstroomService";
import { aiGateway, heeftGateway } from "../lib/aiGateway";

const objectStorage = new ObjectStorageService();

type MailRij = {
  messageId: string;
  gebruikerId: number;
  mailboxAdres: string;
  onderwerp: string;
  afzenderNaam: string | null;
  afzenderEmail: string;
  ontvangenOp: Date;
  snippet: string | null;
  heeftBijlage: boolean;
  conversationId: string | null;
};

// ── Hulpjes ───────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function emailDomein(adres: string): string | null {
  const m = adres.toLowerCase().match(/@([^@\s>]+)$/);
  return m ? m[1] : null;
}

// Publieke maildomeinen zeggen niets over de organisatie.
const PUBLIEKE_DOMEINEN = new Set(["gmail.com", "hotmail.com", "outlook.com", "live.nl", "ziggo.nl", "kpnmail.nl", "icloud.com", "yahoo.com"]);

// AANVRAAG_01 §3 — kandidaat-object voor CRM-matching
// Types en pure selectiefunctie leven in aanvraagMatchSelector.ts (geen DB-deps → testbaar).
import { selecteerKlantUitKandidaten as _selecteer } from "./aanvraagMatchSelector";
import type { KlantKandidaat, KlantSelectieResultaat } from "./aanvraagMatchSelector";

/** Zoek de klant bij een afzender: bewaart kandidaten als objecten met id, naam, redenen, sterkte.
 *  Alleen bij precies één sterke match wordt de klant gepreselect.
 *  Bij meerdere of uitsluitend zwakke kandidaten: nooit automatisch koppelen.
 *  Kandidaten worden ALTIJD teruggegeven zodat de UI reden/sterkte kan tonen.
 */
export async function zoekKlant(
  afzenderEmail: string,
  contactEmail: string | null,
  klantNaamAi: string | null,
): Promise<KlantSelectieResultaat> {
  const alleKandidaten = new Map<number, KlantKandidaat>();

  // 1) Exact match op afzender-email in contactpersonen → sterk
  const exactAfzender = await db.select({ klantId: crmContactpersonenTable.klantId, naam: crmKlantenTable.naam })
    .from(crmContactpersonenTable)
    .innerJoin(crmKlantenTable, eq(crmKlantenTable.id, crmContactpersonenTable.klantId))
    .where(ilike(crmContactpersonenTable.email, afzenderEmail))
    .limit(3);
  for (const r of exactAfzender) {
    if (r.klantId == null) continue;
    const k = alleKandidaten.get(r.klantId) ?? { id: r.klantId, naam: r.naam, redenen: [], sterkte: "sterk" as const };
    k.redenen.push(`exact afzendermail ${afzenderEmail}`);
    k.sterkte = "sterk";
    alleKandidaten.set(r.klantId, k);
  }

  // 2) Exact match op contact_email (AI-geëxtraheerd, kan afwijken van afzender) → sterk
  if (contactEmail && contactEmail.toLowerCase() !== afzenderEmail.toLowerCase()) {
    const exactContact = await db.select({ klantId: crmContactpersonenTable.klantId, naam: crmKlantenTable.naam })
      .from(crmContactpersonenTable)
      .innerJoin(crmKlantenTable, eq(crmKlantenTable.id, crmContactpersonenTable.klantId))
      .where(ilike(crmContactpersonenTable.email, contactEmail))
      .limit(3);
    for (const r of exactContact) {
      if (r.klantId == null) continue;
      const k = alleKandidaten.get(r.klantId) ?? { id: r.klantId, naam: r.naam, redenen: [], sterkte: "sterk" as const };
      k.redenen.push(`exact contactmail ${contactEmail}`);
      k.sterkte = "sterk";
      alleKandidaten.set(r.klantId, k);
    }
  }

  // 3) Zakelijk maildomein / website match → altijd zwak (nooit sterk)
  const domein = emailDomein(afzenderEmail);
  if (domein && !PUBLIEKE_DOMEINEN.has(domein)) {
    const viaDomein = await db.select({ id: crmKlantenTable.id, naam: crmKlantenTable.naam })
      .from(crmKlantenTable)
      .where(or(ilike(crmKlantenTable.email, `%@${domein}`), ilike(crmKlantenTable.website, `%${domein}%`)))
      .limit(5);
    for (const r of viaDomein) {
      const bestaand = alleKandidaten.get(r.id);
      if (!bestaand) {
        alleKandidaten.set(r.id, { id: r.id, naam: r.naam, redenen: [`maildomein ${domein}`], sterkte: "zwak" });
      } else {
        // Reden toevoegen maar sterkte NOOIT verhogen via domein-match alleen
        bestaand.redenen.push(`maildomein ${domein}`);
      }
    }
  }

  // 4) Exacte organisatienaam match (case-insensitive) → D. sterk signaal
  if (klantNaamAi && klantNaamAi.length >= 3) {
    const viaNaam = await db.select({ id: crmKlantenTable.id, naam: crmKlantenTable.naam })
      .from(crmKlantenTable)
      .where(ilike(crmKlantenTable.naam, klantNaamAi))
      .limit(5);
    for (const r of viaNaam) {
      const bestaand = alleKandidaten.get(r.id);
      if (!bestaand) {
        // D. Exact organisatienaam is sterk (net als exact e-mail)
        alleKandidaten.set(r.id, { id: r.id, naam: r.naam, redenen: [`exacte organisatienaam "${klantNaamAi}"`], sterkte: "sterk" });
      } else {
        bestaand.redenen.push(`exacte organisatienaam "${klantNaamAi}"`);
        // Als dit de enige reden was en nu ook organisatienaam klopt → al sterk of zwak blijft
        // (kan via domein zwak zijn; naam-match maakt het sterk)
        bestaand.sterkte = "sterk";
      }
    }
  }

  const kandidaten = [...alleKandidaten.values()];
  return _selecteer(kandidaten);
}

/** Zoek het gebouw op adres — alleen bij precies één match. */
async function zoekGebouw(velden: AanvraagStroomVelden): Promise<{ gebouwId: number | null; gebouwNaam: string | null }> {
  if (!velden.gebouw_adres && !velden.gebouw_naam) return { gebouwId: null, gebouwNaam: null };
  const voorwaarden = [];
  if (velden.gebouw_adres) voorwaarden.push(ilike(gebouwenTable.adres, `%${velden.gebouw_adres}%`));
  if (velden.gebouw_naam) voorwaarden.push(ilike(gebouwenTable.naam, `%${velden.gebouw_naam}%`));
  const rijen = await db.select({ id: gebouwenTable.id, naam: gebouwenTable.naam })
    .from(gebouwenTable)
    .where(or(...voorwaarden))
    .limit(2);
  if (rijen.length === 1) return { gebouwId: rijen[0].id, gebouwNaam: rijen[0].naam };
  return { gebouwId: null, gebouwNaam: null };
}

/** Meerwerk-detectie: alléén sterk bewijs (letterlijk werknummer) leidt tot een meerwerkvoorstel.
 *  Zelfde klant+gebouw met lopende opdracht = alleen "overwogen" vermelden (nooit stilzwijgend koppelen). */
async function zoekLopendProject(velden: AanvraagStroomVelden, klantId: number | null, gebouwId: number | null): Promise<{
  sterk: { id: number; naam: string; werknummer: string | null } | null;
  overwogen: { id: number; naam: string; werknummer: string | null; reden: string } | null;
}> {
  if (velden.werknummer_verwijzing) {
    const rijen = await db.select({ id: projectenTable.id, naam: projectenTable.naam, werknummer: projectenTable.werknummer })
      .from(projectenTable)
      .where(and(ilike(projectenTable.werknummer, velden.werknummer_verwijzing), eq(projectenTable.status, "actief")))
      .limit(2);
    if (rijen.length === 1) return { sterk: rijen[0], overwogen: null };
  }
  if (klantId && gebouwId) {
    const rijen = await db.select({ id: projectenTable.id, naam: projectenTable.naam, werknummer: projectenTable.werknummer })
      .from(projectenTable)
      .where(and(eq(projectenTable.gebouwId, gebouwId), eq(projectenTable.status, "actief")))
      .limit(2);
    if (rijen.length === 1) {
      return { sterk: null, overwogen: { ...rijen[0], reden: "zelfde klant en gebouw met een lopende opdracht" } };
    }
  }
  return { sterk: null, overwogen: null };
}

// ── Conceptantwoord (§3 stap 3): bevestiging, of bevestiging + concrete vraag ─

async function schrijfConceptAntwoord(input: {
  afzenderNaam: string | null;
  onderwerp: string;
  samenvatting: string | null;
  ontbrekendeStukken: string[];
}): Promise<{ tekst: string; vorm: "bevestiging" | "bevestiging_met_vraag" }> {
  const vorm = input.ontbrekendeStukken.length > 0 ? "bevestiging_met_vraag" as const : "bevestiging" as const;
  const aanhef = input.afzenderNaam ? `Beste ${input.afzenderNaam.split(" ")[0]},` : "Beste relatie,";
  let fallback = `${aanhef}\n\nHartelijk dank voor uw aanvraag${input.onderwerp ? ` ("${input.onderwerp}")` : ""}. Wij hebben deze in goede orde ontvangen en gaan ermee aan de slag. U hoort spoedig van ons.\n\nMet vriendelijke groet,\nFPS`;
  if (vorm === "bevestiging_met_vraag") {
    fallback = `${aanhef}\n\nHartelijk dank voor uw aanvraag${input.onderwerp ? ` ("${input.onderwerp}")` : ""}. Wij hebben deze in goede orde ontvangen.\n\nOm een goede prijsopgave te kunnen maken, ontvangen wij graag nog het volgende:\n${input.ontbrekendeStukken.map((s) => `- ${s}`).join("\n")}\n\nMet vriendelijke groet,\nFPS`;
  }
  if (!heeftGateway()) return { tekst: fallback, vorm };
  const resultaat = await aiGateway.chat(
    "fast",
    {
      max_tokens: 500,
      messages: [
        { role: "system", content: "Je schrijft een korte, professionele Nederlandse e-mail namens FPS (bouw/brandpreventie). Geen onderwerpregel, geen placeholders, geen verzonnen feiten of termijnen. Alleen de maildtekst." },
        { role: "user", content: `Schrijf een ontvangstbevestiging voor deze prijsaanvraag.\nAanhef: ${aanhef}\nAanvraag: ${input.onderwerp}\nSamenvatting: ${input.samenvatting ?? "-"}\n${input.ontbrekendeStukken.length > 0 ? `Vraag daarbij concreet om: ${input.ontbrekendeStukken.join("; ")}. Benoem exact deze punten, verzin er geen bij.` : "Er ontbreekt niets; stel géén aanvullende vragen."}\nOndertekening: "Met vriendelijke groet,\\nFPS"` },
      ],
    },
    undefined,
    { module: "crm", functie: "aanvraagstroom_concept", promptNaam: "aanvraagstroom-concept-antwoord", promptVersie: "1.0.0" },
  );
  return { tekst: resultaat.ok && resultaat.inhoud.trim().length > 40 ? resultaat.inhoud.trim() : fallback, vorm };
}

// ── Eén mail verwerken → AI-voorstel klaarzetten (nooit zelf vastleggen) ─────

async function verwerkAanvraagmail(mail: MailRij, isPersoonlijk: boolean): Promise<void> {
  // Mailtekst ophalen (volledige body; snippet is te kort voor analyse)
  let mailTekst = mail.snippet ?? "";
  const detail = await haalVolledigeMail(mail.gebruikerId, mail.mailboxAdres, mail.messageId, isPersoonlijk);
  if (detail?.body) {
    mailTekst = detail.contentType === "html" ? stripHtml(detail.body) : detail.body;
  }

  // Bijlagen: opslaan + tekst meenemen in de analyse
  const bijlageTeksten: Array<{ naam: string; tekst: string }> = [];
  const opgeslagenBijlagen: Array<{ naam: string; url: string }> = [];
  if (mail.heeftBijlage) {
    const bijlagen = await haalBijlagen(mail.gebruikerId, mail.mailboxAdres, mail.messageId, isPersoonlijk);
    for (const b of bijlagen.slice(0, 10)) {
      const buffer = Buffer.from(b.contentBytes ?? "", "base64");
      try {
        const veiligeNaam = b.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const subPath = `aanvragen/mailstroom/${Date.now()}-${veiligeNaam}`;
        await objectStorage.uploadBestand(subPath, buffer, b.contentType);
        opgeslagenBijlagen.push({ naam: b.name, url: storageObjectsUrl(subPath) });
      } catch (err) {
        logger.warn({ err, naam: b.name }, "aanvraagstroom: bijlage opslaan mislukt");
      }
      const extractie = await extraheerTekst(buffer, b.contentType, b.name);
      const tekst = extractie.tekst?.trim() ?? "";
      if (tekst.length >= 40) bijlageTeksten.push({ naam: b.name, tekst });
    }
  }

  const analyse = await analyseerAanvraagVoorStroom({
    mailOnderwerp: mail.onderwerp,
    mailAfzender: `${mail.afzenderNaam ?? ""} <${mail.afzenderEmail}>`,
    mailTekst,
    bijlageTeksten,
  });
  if (!analyse.ok || !analyse.velden) {
    throw new Error(`aanvraag-analyse mislukt: ${analyse.fout ?? "onbekend"}`);
  }
  if (!analyse.is_aanvraag) return; // geen prijsaanvraag — stil overslaan is oké

  const v = analyse.velden;
  const klant = await zoekKlant(mail.afzenderEmail, v.contact_email, v.klant_naam);
  const gebouw = await zoekGebouw(v);
  const project = await zoekLopendProject(v, klant.klantId, gebouw.gebouwId);

  // Alleen sterk bewijs (werknummer) → meerwerkvoorstel; bij twijfel nieuwe aanvraag (§3).
  const voorstelType = project.sterk ? "meerwerk" : "nieuwe_aanvraag";
  const concept = await schrijfConceptAntwoord({
    afzenderNaam: mail.afzenderNaam,
    onderwerp: mail.onderwerp,
    samenvatting: v.samenvatting,
    ontbrekendeStukken: v.ontbrekende_stukken,
  });

  await db.insert(aanvraagVoorstellenTable).values({
    gebruikerId: mail.gebruikerId,
    mailMessageId: mail.messageId,
    mailboxAdres: mail.mailboxAdres,
    isPersoonlijk,
    afzenderNaam: mail.afzenderNaam,
    afzenderEmail: mail.afzenderEmail,
    onderwerp: mail.onderwerp,
    binnengekomenOp: mail.ontvangenOp,
    voorstelType,
    aiVoorstel: {
      titel: v.titel,
      klant_id: klant.klantId,
      klant_naam: klant.klantNaam ?? v.klant_naam,
      klant_onbekend: klant.klantId == null,
      klant_kandidaten: klant.kandidaten,
      contact_naam: v.contact_naam,
      contact_email: v.contact_email,
      contact_telefoon: v.contact_telefoon,
      gebouw_id: gebouw.gebouwId,
      gebouw_naam: gebouw.gebouwNaam ?? v.gebouw_naam,
      gebouw_adres: v.gebouw_adres,
      gebouw_stad: v.gebouw_stad,
      gebouw_postcode: v.gebouw_postcode,
      werkzaamheden: v.werkzaamheden,
      bv: v.bv,
      meerwerk_project_id: project.sterk?.id ?? null,
      meerwerk_project_naam: project.sterk ? `${project.sterk.naam}${project.sterk.werknummer ? ` (${project.sterk.werknummer})` : ""}` : null,
      overwogen_project_id: project.overwogen?.id ?? null,
      overwogen_project_naam: project.overwogen ? `${project.overwogen.naam}${project.overwogen.werknummer ? ` (${project.overwogen.werknummer})` : ""}` : null,
      overwogen_reden: project.overwogen?.reden ?? null,
      ontbrekende_stukken: v.ontbrekende_stukken,
      samenvatting: v.samenvatting,
      onzekere_velden: v.onzekere_velden,
      bron_bewijs: v.bron_bewijs,
    },
    conceptAntwoord: concept.tekst,
    conceptVorm: concept.vorm,
    bijlagen: opgeslagenBijlagen,
  }).onConflictDoNothing();
}

// ── Intake: mails van aanvraagmailboxen verwerken (claim + retry, als FACTUUR_02) ─

export async function verwerkAanvraagmails(gebruikerId: number): Promise<{ verwerkt: number }> {
  // MAIL_01: aanvraagmailboxen zijn organisatiebezit; de automatische
  // verwerker draait alleen voor mailboxen in modus 'verwerken' (§4).
  const boxen = await db.select({ emailAdres: werkInboxMailboxenTable.emailAdres })
    .from(werkInboxMailboxenTable)
    .where(and(
      eq(werkInboxMailboxenTable.isAanvraagmailbox, true),
      eq(werkInboxMailboxenTable.modus, "verwerken"),
      eq(werkInboxMailboxenTable.actief, true),
    ));
  const adressen = boxen.map((b) => b.emailAdres);

  // Persoonlijke mailbox als aanvraag-ingang (klanten mailen René rechtstreeks)
  let persoonlijkAdres: string | null = null;
  const [token] = await db.select({ email: werkInboxTokensTable.microsoftEmail, persoonlijk: werkInboxTokensTable.aanvraagIntakePersoonlijk })
    .from(werkInboxTokensTable)
    .where(eq(werkInboxTokensTable.gebruikerId, gebruikerId));
  if (token?.persoonlijk) {
    persoonlijkAdres = token.email;
    if (!adressen.includes(token.email)) adressen.push(token.email);
  }
  if (adressen.length === 0) return { verwerkt: 0 };

  const mails = await db.select({
    messageId: werkInboxMailsTable.messageId,
    gebruikerId: werkInboxMailsTable.gebruikerId,
    mailboxAdres: werkInboxMailsTable.mailboxAdres,
    onderwerp: werkInboxMailsTable.onderwerp,
    afzenderNaam: werkInboxMailsTable.afzenderNaam,
    afzenderEmail: werkInboxMailsTable.afzenderEmail,
    ontvangenOp: werkInboxMailsTable.ontvangenOp,
    snippet: werkInboxMailsTable.snippet,
    heeftBijlage: werkInboxMailsTable.heeftBijlage,
    conversationId: werkInboxMailsTable.conversationId,
  })
    .from(werkInboxMailsTable)
    .where(and(
      inArray(werkInboxMailsTable.mailboxAdres, adressen),
      isNull(werkInboxMailsTable.aanvraagVerwerktOp),
    ))
    .orderBy(werkInboxMailsTable.ontvangenOp)
    .limit(20);

  let verwerkt = 0;
  for (const mail of mails) {
    // Eerst claimen (dedupe bij parallelle syncs), bij fout teruggeven (retry).
    const claim = await db.update(werkInboxMailsTable)
      .set({ aanvraagVerwerktOp: new Date() })
      .where(and(
        eq(werkInboxMailsTable.mailboxAdres, mail.mailboxAdres),
        eq(werkInboxMailsTable.messageId, mail.messageId),
        isNull(werkInboxMailsTable.aanvraagVerwerktOp),
      ))
      .returning({ id: werkInboxMailsTable.id });
    if (claim.length === 0) continue;
    try {
      await verwerkAanvraagmail(mail, persoonlijkAdres != null && mail.mailboxAdres === persoonlijkAdres);
      verwerkt += 1;
    } catch (err) {
      logger.error({ err, messageId: mail.messageId }, "aanvraagstroom: verwerking mislukt");
      await db.update(werkInboxMailsTable)
        .set({ aanvraagVerwerktOp: null })
        .where(and(
          eq(werkInboxMailsTable.mailboxAdres, mail.mailboxAdres),
          eq(werkInboxMailsTable.messageId, mail.messageId),
        ));
      await maakSignaal({
        type: "ai_onzeker",
        mailMessageId: mail.messageId,
        omschrijving: `De aanvraagmail "${mail.onderwerp}" van ${mail.afzenderEmail} kon niet automatisch verwerkt worden. Iemand moet deze handmatig oppakken.`,
      });
    }
  }
  return { verwerkt };
}

// ── Reactietijdbewaking (§4): instelbare grenzen, gebeurtenissen via maakSignaal ─

export async function draaiAanvraagBewaking(): Promise<void> {
  const [instellingen] = await db.select({
    reactieUren: appInstellingenTable.aanvraagReactietermijnUren,
    oppakUren: appInstellingenTable.aanvraagOppakTermijnUren,
  }).from(appInstellingenTable).limit(1);
  const reactieUren = instellingen?.reactieUren ?? 24;
  const oppakUren = instellingen?.oppakUren ?? 72;
  const nu = Date.now();

  // 1) Antwoord nog niet verstuurd binnen de reactietermijn
  const zonderAntwoord = await db.select().from(aanvraagVoorstellenTable)
    .where(and(isNull(aanvraagVoorstellenTable.antwoordVerstuurdOp), eq(aanvraagVoorstellenTable.status, "open")));
  for (const v of zonderAntwoord) {
    const uren = (nu - v.binnengekomenOp.getTime()) / 3_600_000;
    if (uren > reactieUren) {
      await maakSignaal({
        type: "aanvraag_antwoord_te_laat",
        mailMessageId: v.mailMessageId,
        omschrijving: `De aanvraag "${v.onderwerp}" van ${v.afzenderEmail} wacht al ${Math.floor(uren)} uur op een antwoord (grens: ${reactieUren} uur).`,
      });
    }
  }

  // 2) Geaccepteerde aanvragen die inhoudelijk niet verder komen dan fase 'signaal'
  const kansen = await db.select({
    id: crmCommercieelTable.id,
    titel: crmCommercieelTable.titel,
    binnengekomenOp: crmCommercieelTable.binnengekomenOp,
  })
    .from(crmCommercieelTable)
    .where(and(eq(crmCommercieelTable.fase, "signaal"), isNotNull(crmCommercieelTable.binnengekomenOp)));
  for (const k of kansen) {
    if (!k.binnengekomenOp) continue;
    const uren = (nu - k.binnengekomenOp.getTime()) / 3_600_000;
    if (uren > oppakUren) {
      await maakSignaal({
        type: "aanvraag_niet_opgepakt",
        projectkansId: k.id,
        omschrijving: `De aanvraag "${k.titel}" is na ${Math.floor(uren / 24)} dag(en) nog niet inhoudelijk opgepakt (staat nog in fase Signaal; grens: ${oppakUren} uur).`,
      });
    }
  }
}

