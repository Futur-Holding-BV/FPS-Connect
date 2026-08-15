import { db, medewerkersTable, gebruikersTable, appInstellingenTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { Moment, MomentContext, MomentType } from "./types";

// geboortedatum is opgeslagen als tekst "YYYY-MM-DD"; we matchen puur op
// maand-dag zodat het geboortejaar nooit de query in hoeft (en dus ook nooit
// per ongeluk in een respons terecht kan komen).
function maandDagVandaag(vandaag: Date): string {
  const maand = String(vandaag.getMonth() + 1).padStart(2, "0");
  const dag = String(vandaag.getDate()).padStart(2, "0");
  return `${maand}-${dag}`;
}

async function isOrganisatiebreedIngeschakeld(): Promise<boolean> {
  const [instelling] = await db
    .select({ momentsVerjaardagIngeschakeld: appInstellingenTable.momentsVerjaardagIngeschakeld })
    .from(appInstellingenTable)
    .orderBy(appInstellingenTable.id)
    .limit(1);
  // Geen rij (nog nooit opgeslagen) => standaardwaarde aan.
  return instelling?.momentsVerjaardagIngeschakeld ?? true;
}

export const verjaardagMomentType: MomentType = {
  key: "verjaardag",
  async vandaag(ctx: MomentContext): Promise<Moment[]> {
    if (!(await isOrganisatiebreedIngeschakeld())) return [];

    const maandDag = maandDagVandaag(ctx.vandaag);

    const rijen = await db
      .select({
        id: medewerkersTable.id,
        naam: medewerkersTable.naam,
        gebruikerId: medewerkersTable.gebruikerId,
        verjaardagZichtbaar: medewerkersTable.verjaardagZichtbaar,
        avatarUrl: gebruikersTable.avatarUrl,
      })
      .from(medewerkersTable)
      .leftJoin(gebruikersTable, eq(medewerkersTable.gebruikerId, gebruikersTable.id))
      .where(
        sql`${medewerkersTable.geboortedatum} is not null and substring(${medewerkersTable.geboortedatum}, 6, 5) = ${maandDag} and ${medewerkersTable.actief} = true`,
      );

    return rijen
      .filter((r) => r.verjaardagZichtbaar || r.gebruikerId === ctx.userId)
      .map((r) => ({
        type: "verjaardag" as const,
        medewerkerId: r.id,
        naam: r.naam,
        fotoUrl: r.avatarUrl ?? null,
        geldtVoorJou: r.gebruikerId === ctx.userId,
      }));
  },
};
