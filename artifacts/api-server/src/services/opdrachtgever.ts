import { db, crmKlantenTable } from "@workspace/db";
import { eq } from "drizzle-orm";

type DbTransactie = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type NieuweOpdrachtgever = {
  naam: string;
  adres: string;
  postcode: string;
  stad: string;
  email?: string | null;
  telefoon?: string | null;
};

export class OpdrachtgeverFout extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function ontbrekendeNaw(klant: {
  naam?: string | null;
  adres?: string | null;
  postcode?: string | null;
  stad?: string | null;
}): string[] {
  return [
    !klant.naam?.trim() ? "naam" : null,
    !klant.adres?.trim() ? "adres" : null,
    !klant.postcode?.trim() ? "postcode" : null,
    !klant.stad?.trim() ? "plaats" : null,
  ].filter((veld): veld is string => veld != null);
}

export async function resolveerOpdrachtgever(
  tx: DbTransactie,
  keuze: {
    klantId?: number | null;
    nieuweKlant?: NieuweOpdrachtgever | null;
  },
) {
  if (keuze.klantId) {
    const [klant] = await tx
      .select()
      .from(crmKlantenTable)
      .where(eq(crmKlantenTable.id, keuze.klantId))
      .limit(1);
    if (!klant) {
      throw new OpdrachtgeverFout(404, "De gekozen relatie bestaat niet.");
    }
    const ontbrekend = ontbrekendeNaw(klant);
    if (ontbrekend.length > 0) {
      throw new OpdrachtgeverFout(
        422,
        `De gekozen CRM-opdrachtgever mist ${ontbrekend.join(", ")}. Vul de relatie eerst aan in CRM.`,
      );
    }
    return klant;
  }

  const nieuw = keuze.nieuweKlant;
  const ontbrekend = ontbrekendeNaw(nieuw ?? {});
  if (!nieuw || ontbrekend.length > 0) {
    throw new OpdrachtgeverFout(
      422,
      `Vul voor een nieuwe opdrachtgever naam, adres, postcode en plaats in (ontbreekt: ${ontbrekend.join(", ")}).`,
    );
  }

  const [klant] = await tx
    .insert(crmKlantenTable)
    .values({
      naam: nieuw.naam.trim(),
      adres: nieuw.adres.trim(),
      postcode: nieuw.postcode.trim(),
      stad: nieuw.stad.trim(),
      email: nieuw.email?.trim() || null,
      telefoon: nieuw.telefoon?.trim() || null,
      status: "prospect",
    })
    .returning();
  return klant;
}