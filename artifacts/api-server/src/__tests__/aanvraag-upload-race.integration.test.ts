import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq, like, sql } from "drizzle-orm";
import { statusVoorAanvraagUploadConflict } from "../services/aanvraagUploadIdempotentie";

const echteDatabaseUrl = process.env["AANVRAAG_TEST_DATABASE_URL"];
if (!echteDatabaseUrl) {
  throw new Error("AANVRAAG_TEST_DATABASE_URL ontbreekt voor de aanvraag-upload-raceproef.");
}
process.env.DATABASE_URL = echteDatabaseUrl;

const {
  aanvraagVoorstellenTable,
  db,
  gebruikersTable,
  inboxItemsTable,
  pool,
} = await import("@workspace/db");

describe("aanvraag-upload — gelijktijdige idempotentie in PostgreSQL", () => {
  it("bewaart bij twee gelijke gelijktijdige uploads exact één voorstel en één inboxitem", async () => {
    const [gebruiker] = await db
      .select({ id: gebruikersTable.id })
      .from(gebruikersTable)
      .limit(1);
    expect(gebruiker?.id).toBeTypeOf("number");

    const marker = `race-${randomUUID()}`;
    const mailMessageId = `upload:${marker}`;
    const bestandsnaamPrefix = `aanvraag-upload-race-${marker}`;

    const probeerIntake = async (volgnummer: number) => db.transaction(async (tx) => {
      const [inboxItem] = await tx
        .insert(inboxItemsTable)
        .values({
          bestandsnaam: `${bestandsnaamPrefix}-${volgnummer}.eml`,
          bestandspad: `/objects/algemeen/inbox/emails/${bestandsnaamPrefix}-${volgnummer}.eml`,
          mimetype: "message/rfc822",
          geuploadDoor: gebruiker!.id,
          status: "nieuw",
          documentCategorie: "offerte_aanvraag",
          bestemming: "CRM",
        })
        .returning({ id: inboxItemsTable.id });

      // Beide transacties moeten hun inboxitem kunnen schrijven vóór ze om
      // dezelfde unieke voorstelidentiteit strijden.
      await new Promise((resolve) => setTimeout(resolve, 75));

      const [voorstel] = await tx
        .insert(aanvraagVoorstellenTable)
        .values({
          gebruikerId: gebruiker!.id,
          mailMessageId,
          mailboxAdres: "Racebewijs",
          afzenderEmail: "racebewijs@example.invalid",
          onderwerp: "Gelijktijdige aanvraag-upload",
          binnengekomenOp: new Date(),
          voorstelType: "nieuwe_aanvraag",
          status: "open",
          inboxItemId: inboxItem.id,
        })
        .returning({ id: aanvraagVoorstellenTable.id });

      return { inboxItemId: inboxItem.id, voorstelId: voorstel.id };
    });

    try {
      const uitkomsten = await Promise.allSettled([
        probeerIntake(1),
        probeerIntake(2),
      ]);
      const geslaagd = uitkomsten.filter((uitkomst) => uitkomst.status === "fulfilled");
      const geweigerd = uitkomsten.filter((uitkomst) => uitkomst.status === "rejected");

      expect(geslaagd).toHaveLength(1);
      expect(geweigerd).toHaveLength(1);
      if (geweigerd[0]?.status === "rejected") {
        expect(statusVoorAanvraagUploadConflict(geweigerd[0].reason)).toBe(409);
      }

      const [voorstelTelling] = await db
        .select({ aantal: sql<number>`count(*)::int` })
        .from(aanvraagVoorstellenTable)
        .where(eq(aanvraagVoorstellenTable.mailMessageId, mailMessageId));
      const [inboxTelling] = await db
        .select({ aantal: sql<number>`count(*)::int` })
        .from(inboxItemsTable)
        .where(like(inboxItemsTable.bestandsnaam, `${bestandsnaamPrefix}%`));

      expect(voorstelTelling?.aantal).toBe(1);
      expect(inboxTelling?.aantal).toBe(1);
    } finally {
      await db
        .delete(aanvraagVoorstellenTable)
        .where(eq(aanvraagVoorstellenTable.mailMessageId, mailMessageId));
      await db
        .delete(inboxItemsTable)
        .where(like(inboxItemsTable.bestandsnaam, `${bestandsnaamPrefix}%`));
    }
  }, 20_000);
});

afterAll(async () => {
  await pool.end();
});