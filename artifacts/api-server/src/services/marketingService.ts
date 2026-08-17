// MARKETING_01 — gedeelde marketinglogica: doelgroep-leden (met harde
// toestemmingspoort), campagne-terugkoppeling vanuit de mailwachtrij en
// afmelden zonder inloggen.
//
// De toestemmingspoort is bewust een servervoorwaarde in de query zelf:
// wie geen toestemming heeft (of afgemeld/onbestelbaar is) kan in géén
// enkele doelgroep of verzending belanden, ook niet met de hand.
import { db } from "@workspace/db";
import {
  crmKlantenTable,
  crmContactpersonenTable,
  crmCommunicatieTable,
  marketingCampagnesTable,
  marketingCampagneOntvangersTable,
  mailWachtrijTable,
  type DoelgroepCriteria,
} from "@workspace/db";
import { and, eq, ne, isNull, isNotNull, inArray, or, lt, sql, count } from "drizzle-orm";
import { logger } from "../lib/logger";

/** Harde toestemmingspoort — alle doelgroep- en verzendquery's lopen hierdoor. */
export function mailbareContactVoorwaarden() {
  return and(
    isNotNull(crmContactpersonenTable.email),
    ne(crmContactpersonenTable.email, ""),
    eq(crmContactpersonenTable.mailToestemming, true),
    isNull(crmContactpersonenTable.mailAfgemeldOp),
    isNull(crmContactpersonenTable.mailOnbestelbaarOp),
  );
}

function criteriaVoorwaarden(criteria: DoelgroepCriteria) {
  const conds = [];
  if (criteria.branche?.length) conds.push(inArray(crmKlantenTable.branche, criteria.branche));
  if (criteria.stad?.length) conds.push(inArray(crmKlantenTable.stad, criteria.stad));
  if (criteria.relatieStatus?.length) conds.push(inArray(crmKlantenTable.relatieStatus, criteria.relatieStatus));
  if (criteria.klantStatus?.length) conds.push(inArray(crmKlantenTable.status, criteria.klantStatus));
  if (criteria.orgType?.length) conds.push(inArray(crmKlantenTable.type, criteria.orgType));
  if (criteria.laatsteContactVoor) {
    conds.push(
      or(
        isNull(crmContactpersonenTable.laatste_contact_datum),
        lt(crmContactpersonenTable.laatste_contact_datum, criteria.laatsteContactVoor),
      ),
    );
  }
  return conds;
}

export type DoelgroepLid = {
  contactpersoonId: number;
  naam: string;
  email: string;
  klantId: number | null;
  organisatie: string | null;
};

/** Leden altijd live berekend — nooit een opgeslagen lijst. */
export async function berekenDoelgroepLeden(criteria: DoelgroepCriteria): Promise<DoelgroepLid[]> {
  const rijen = await db
    .select({
      contactpersoonId: crmContactpersonenTable.id,
      naam: crmContactpersonenTable.naam,
      email: crmContactpersonenTable.email,
      klantId: crmContactpersonenTable.klantId,
      organisatie: crmKlantenTable.naam,
    })
    .from(crmContactpersonenTable)
    .leftJoin(crmKlantenTable, eq(crmContactpersonenTable.klantId, crmKlantenTable.id))
    .where(and(mailbareContactVoorwaarden(), ...criteriaVoorwaarden(criteria)));
  return rijen.map((r) => ({ ...r, email: r.email! }));
}

export async function telDoelgroepLeden(criteria: DoelgroepCriteria): Promise<number> {
  const [rij] = await db
    .select({ aantal: count() })
    .from(crmContactpersonenTable)
    .leftJoin(crmKlantenTable, eq(crmContactpersonenTable.klantId, crmKlantenTable.id))
    .where(and(mailbareContactVoorwaarden(), ...criteriaVoorwaarden(criteria)));
  return rij?.aantal ?? 0;
}

/** Sjabloonvelden per ontvanger invullen: {{naam}} en {{organisatie}}. */
export function vulSjabloonVelden(tekst: string, lid: { naam: string; organisatie: string | null }): string {
  return tekst
    .replaceAll("{{naam}}", lid.naam)
    .replaceAll("{{organisatie}}", lid.organisatie ?? "uw organisatie");
}

/**
 * Terugkoppeling vanuit de mailwachtrij: het bericht is écht verzonden.
 * Zet de ontvanger op verzonden, legt een gebeurtenis vast bij de relatie
 * (crm_communicatie) en rondt de campagne af zodra geen ontvanger meer
 * op verzending wacht. Fouten hier mogen de wachtrijverwerking nooit breken.
 */
export async function handelCampagneVerzendingAf(ontvangerId: number, onderwerp: string): Promise<void> {
  try {
    const [ontvanger] = await db
      .update(marketingCampagneOntvangersTable)
      .set({ status: "verzonden", verzondenOp: new Date() })
      .where(
        and(
          eq(marketingCampagneOntvangersTable.id, ontvangerId),
          eq(marketingCampagneOntvangersTable.status, "gepland"),
        ),
      )
      .returning();
    if (!ontvanger) return;
    if (ontvanger.klantId) {
      await db.insert(crmCommunicatieTable).values({
        klantId: ontvanger.klantId,
        contactpersoonId: ontvanger.contactpersoonId,
        type: "campagne_verzonden",
        onderwerp: `Campagnemail verzonden: ${onderwerp}`,
        datum: new Date().toISOString().slice(0, 10),
      });
    }
    // Campagne afronden zodra niets meer op verzending wacht.
    const [rest] = await db
      .select({ aantal: count() })
      .from(marketingCampagneOntvangersTable)
      .where(
        and(
          eq(marketingCampagneOntvangersTable.campagneId, ontvanger.campagneId),
          eq(marketingCampagneOntvangersTable.status, "gepland"),
        ),
      );
    if ((rest?.aantal ?? 0) === 0) {
      await db
        .update(marketingCampagnesTable)
        .set({ status: "verzonden", afgerondOp: new Date(), bijgewerktOp: new Date() })
        .where(
          and(
            eq(marketingCampagnesTable.id, ontvanger.campagneId),
            eq(marketingCampagnesTable.status, "verzendend"),
          ),
        );
    }
  } catch (err) {
    logger.error({ err, ontvangerId }, "Campagne-terugkoppeling na verzending mislukt");
  }
}

/**
 * Afmelden zonder inloggen via de publieke token. Idempotent: een tweede
 * klik op dezelfde link blijft een nette bevestiging geven.
 * Retourneert null bij een onbekende token.
 */
/**
 * Annuleert alle nog wachtende campagnemails van een contactpersoon (over álle
 * campagnes). Aangeroepen bij afmelden én bij het intrekken van toestemming —
 * intrekken moet per direct gelden, niet pas bij de volgende doelgroepberekening.
 */
export async function annuleerWachtendeCampagneMails(
  contactpersoonId: number,
  reden: string,
): Promise<void> {
  const items = await db
    .select({ id: marketingCampagneOntvangersTable.id })
    .from(marketingCampagneOntvangersTable)
    .where(eq(marketingCampagneOntvangersTable.contactpersoonId, contactpersoonId));
  if (items.length === 0) return;
  await db
    .update(mailWachtrijTable)
    .set({ status: "afgewezen", foutdetail: reden, verwerktOp: new Date() })
    .where(
      and(
        inArray(mailWachtrijTable.campagneOntvangerId, items.map((o) => o.id)),
        eq(mailWachtrijTable.status, "wachtend"),
      ),
    );
}

/**
 * Laatste poort vlak vóór daadwerkelijke verzending van een campagnemail
 * vanuit de wachtrij. De doelgroep werd bij het klaarzetten al gefilterd,
 * maar tussen klaarzetten en verzenden kan de situatie veranderd zijn
 * (afmelding, intrekking, bounce, campagne gestopt). Retourneert null als
 * verzenden mag, anders de reden — de aanroeper wijst het item dan af.
 */
export async function controleerCampagneItemVerzendbaar(
  ontvangerId: number,
): Promise<string | null> {
  const [rij] = await db
    .select({
      ontvangerStatus: marketingCampagneOntvangersTable.status,
      campagneStatus: marketingCampagnesTable.status,
      email: crmContactpersonenTable.email,
      toestemming: crmContactpersonenTable.mailToestemming,
      afgemeldOp: crmContactpersonenTable.mailAfgemeldOp,
      onbestelbaarOp: crmContactpersonenTable.mailOnbestelbaarOp,
    })
    .from(marketingCampagneOntvangersTable)
    .innerJoin(
      marketingCampagnesTable,
      eq(marketingCampagnesTable.id, marketingCampagneOntvangersTable.campagneId),
    )
    .leftJoin(
      crmContactpersonenTable,
      eq(crmContactpersonenTable.id, marketingCampagneOntvangersTable.contactpersoonId),
    )
    .where(eq(marketingCampagneOntvangersTable.id, ontvangerId))
    .limit(1);
  if (!rij) return "campagne-ontvanger bestaat niet meer";
  if (rij.campagneStatus !== "verzendend") return `campagne is ${rij.campagneStatus}`;
  if (rij.ontvangerStatus !== "gepland") return `ontvanger is ${rij.ontvangerStatus}`;
  if (!rij.email) return "contactpersoon heeft geen e-mailadres meer";
  if (rij.afgemeldOp) return "contactpersoon is afgemeld";
  if (rij.onbestelbaarOp) return "e-mailadres is onbestelbaar";
  if (!rij.toestemming) return "toestemming is ingetrokken";
  return null;
}

/** Markeert een ontvanger als overgeslagen (bv. na een geblokkeerde verzending). */
export async function markeerOntvangerOvergeslagen(ontvangerId: number): Promise<void> {
  await db
    .update(marketingCampagneOntvangersTable)
    .set({ status: "overgeslagen" })
    .where(
      and(
        eq(marketingCampagneOntvangersTable.id, ontvangerId),
        eq(marketingCampagneOntvangersTable.status, "gepland"),
      ),
    );
}

export async function verwerkAfmelding(token: string): Promise<{ reedsAfgemeld: boolean } | null> {
  const [ontvanger] = await db
    .select()
    .from(marketingCampagneOntvangersTable)
    .where(eq(marketingCampagneOntvangersTable.afmeldToken, token))
    .limit(1);
  if (!ontvanger) return null;

  const [contact] = await db
    .select({ mailAfgemeldOp: crmContactpersonenTable.mailAfgemeldOp })
    .from(crmContactpersonenTable)
    .where(eq(crmContactpersonenTable.id, ontvanger.contactpersoonId))
    .limit(1);
  if (contact?.mailAfgemeldOp) return { reedsAfgemeld: true };

  const nu = new Date();
  await db
    .update(crmContactpersonenTable)
    .set({ mailToestemming: false, mailAfgemeldOp: nu, bijgewerktOp: nu })
    .where(eq(crmContactpersonenTable.id, ontvanger.contactpersoonId));
  await db
    .update(marketingCampagneOntvangersTable)
    .set({ status: "afgemeld", afgemeldOp: nu })
    .where(
      and(
        eq(marketingCampagneOntvangersTable.id, ontvanger.id),
        sql`${marketingCampagneOntvangersTable.status} <> 'afgemeld'`,
      ),
    );
  // Een nog niet verzonden campagnemail voor deze contactpersoon (over álle
  // campagnes) direct uit de wachtrij halen — afmelden is per direct.
  await annuleerWachtendeCampagneMails(ontvanger.contactpersoonId, "contactpersoon afgemeld");
  if (ontvanger.klantId) {
    await db.insert(crmCommunicatieTable).values({
      klantId: ontvanger.klantId,
      contactpersoonId: ontvanger.contactpersoonId,
      type: "campagne_afgemeld",
      onderwerp: "Afgemeld voor commerciële mail (via afmeldlink)",
      datum: nu.toISOString().slice(0, 10),
    });
  }
  return { reedsAfgemeld: false };
}
