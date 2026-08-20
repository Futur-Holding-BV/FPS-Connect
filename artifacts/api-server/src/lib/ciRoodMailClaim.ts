import {
  ciRapportenTable,
  ciRoodMailVerzendingenTable,
  db,
  gebruikersTable,
} from "@workspace/db";
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { bepaalCiRoodMailBesluit, type CiRoodMailBesluit } from "./ciRoodBewaking";

const VERZENDCLAIM_DUUR_MS = 20 * 60 * 1000;

export type VoorbereideCiRoodMail = {
  rapportId: number;
  periode: number;
  besluit: CiRoodMailBesluit;
  laatste: {
    commitSha: string;
    gefaaldeTaak: string | null;
    runUrl: string | null;
  };
  verzendingen: Array<{
    id: number;
    ontvangerEmail: string;
    ontvangerNaam: string | null;
  }>;
};

export type GeclaimdeCiRoodMailVerzending = {
  id: number;
  rapportId: number;
  gebruikerId: number;
  claimOp: Date;
  ontvangerEmail: string;
  ontvangerNaam: string | null;
};

type ActueleOntvanger = {
  email: string;
  naam: string | null;
};

/**
 * Maakt voor de huidige 24-uursperiode één duurzame outboxrij per actieve
 * hoofdbeheerder. Een unieke DB-index maakt herhaalde of parallelle loopdraaien
 * idempotent. Groen als nieuwste CI-stand maakt niets aan en verstuurt niets.
 */
export async function bereidAanhoudendRodeCiMailVoor(
  nu = new Date(),
): Promise<VoorbereideCiRoodMail | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1193, 1)`);

    const volgordeAflopend = [
      sql`${ciRapportenTable.runId} DESC NULLS LAST`,
      sql`${ciRapportenTable.runAttempt} DESC NULLS LAST`,
      desc(ciRapportenTable.id),
    ] as const;
    const [laatste] = await tx
      .select()
      .from(ciRapportenTable)
      .orderBy(...volgordeAflopend)
      .limit(1);
    if (!laatste || laatste.conclusie !== "failure") return null;

    const [laatsteGroen] = await tx
      .select()
      .from(ciRapportenTable)
      .where(eq(ciRapportenTable.conclusie, "success"))
      .orderBy(...volgordeAflopend)
      .limit(1);
    const naLaatsteGroen = laatsteGroen
      ? laatsteGroen.runId !== null
        ? sql`(
            ${ciRapportenTable.runId} > ${laatsteGroen.runId}
            OR (
              ${ciRapportenTable.runId} = ${laatsteGroen.runId}
              AND COALESCE(${ciRapportenTable.runAttempt}, 1) > ${laatsteGroen.runAttempt ?? 1}
            )
          )`
        : gt(ciRapportenTable.id, laatsteGroen.id)
      : undefined;

    const [beginRood] = await tx
      .select()
      .from(ciRapportenTable)
      .where(
        naLaatsteGroen
          ? and(eq(ciRapportenTable.conclusie, "failure"), naLaatsteGroen)
          : eq(ciRapportenTable.conclusie, "failure"),
      )
      .orderBy(
        sql`${ciRapportenTable.runId} ASC NULLS FIRST`,
        sql`${ciRapportenTable.runAttempt} ASC NULLS FIRST`,
        sql`${ciRapportenTable.id} ASC`,
      )
      .limit(1);
    if (!beginRood) return null;

    // De outbox-index verzorgt de dagdeduplicatie; geef de pure beleidsfunctie
    // daarom bewust geen eerdere globale verzendtijd mee.
    const besluit = bepaalCiRoodMailBesluit({
      laatsteConclusie: laatste.conclusie,
      roodSinds: beginRood.gemeldOp,
      laatstGemaildOp: null,
      nu,
    });
    if (!besluit.mailen) return null;
    const periode = Math.floor(besluit.duurUren / 24);

    const beheerders = await tx
      .select({
        id: gebruikersTable.id,
        naam: gebruikersTable.naam,
        email: gebruikersTable.email,
      })
      .from(gebruikersTable)
      .where(
        and(
          eq(gebruikersTable.rol, "hoofdbeheerder"),
          eq(gebruikersTable.actief, true),
          isNotNull(gebruikersTable.email),
        ),
      );
    const ontvangers = beheerders.filter(
      (beheerder): beheerder is typeof beheerder & { email: string } =>
        typeof beheerder.email === "string" && beheerder.email.length > 0,
    );
    if (ontvangers.length === 0) {
      throw new Error("Geen actieve hoofdbeheerder met e-mailadres voor CI-faalmelding");
    }

    await tx
      .insert(ciRoodMailVerzendingenTable)
      .values(
        ontvangers.map((ontvanger) => ({
          ciRapportId: beginRood.id,
          periode,
          gebruikerId: ontvanger.id,
          ontvangerEmail: ontvanger.email,
          ontvangerNaam: ontvanger.naam,
        })),
      )
      .onConflictDoNothing({
        target: [
          ciRoodMailVerzendingenTable.ciRapportId,
          ciRoodMailVerzendingenTable.periode,
          ciRoodMailVerzendingenTable.gebruikerId,
        ],
      });

    const verzendingen = await tx
      .select({
        id: ciRoodMailVerzendingenTable.id,
        ontvangerEmail: ciRoodMailVerzendingenTable.ontvangerEmail,
        ontvangerNaam: ciRoodMailVerzendingenTable.ontvangerNaam,
      })
      .from(ciRoodMailVerzendingenTable)
      .where(
        and(
          eq(ciRoodMailVerzendingenTable.ciRapportId, beginRood.id),
          eq(ciRoodMailVerzendingenTable.periode, periode),
          isNull(ciRoodMailVerzendingenTable.verzondenOp),
        ),
      );

    return {
      rapportId: beginRood.id,
      periode,
      besluit,
      laatste: {
        commitSha: laatste.commitSha,
        gefaaldeTaak: laatste.gefaaldeTaak,
        runUrl: laatste.runUrl,
      },
      verzendingen,
    };
  });
}

/**
 * Claimt precies één ontvanger. De lease is per Graph-call en ruimer dan de
 * transporttimeout. Bij een procescrash ná externe aflevering maar vóór de
 * statusupdate kiezen we bewust voor gegarandeerde retry (at-least-once);
 * zonder idempotency-sleutel van Graph kan strikt exactly-once niet.
 */
export async function claimCiRoodMailVerzending(
  verzendingId: number,
  nu = new Date(),
): Promise<GeclaimdeCiRoodMailVerzending | null> {
  const verlopenVoor = new Date(nu.getTime() - VERZENDCLAIM_DUUR_MS);
  const claimbaar = or(
    inArray(ciRoodMailVerzendingenTable.status, ["wachtend", "mislukt"]),
    and(
      eq(ciRoodMailVerzendingenTable.status, "verzenden"),
      or(
        isNull(ciRoodMailVerzendingenTable.claimOp),
        lte(ciRoodMailVerzendingenTable.claimOp, verlopenVoor),
      ),
    ),
  );
  const actueelBevoegd = sql`EXISTS (
    SELECT 1
    FROM ${gebruikersTable}
    WHERE ${gebruikersTable.id} = ${ciRoodMailVerzendingenTable.gebruikerId}
      AND ${gebruikersTable.actief} = true
      AND ${gebruikersTable.rol} = 'hoofdbeheerder'
      AND length(trim(${gebruikersTable.email})) > 0
  )`;

  return db.transaction(async (tx) => {
    // Maak ingetrokken ontvangers terminal vóór een eventuele retry. Een nog
    // geldige actieve claim wordt niet afgenomen; de eigenaar herbevestigt zelf
    // vlak vóór de Graph-call.
    await tx
      .update(ciRoodMailVerzendingenTable)
      .set({
        status: "overgeslagen",
        claimOp: null,
        laatsteFout: "ontvanger is geen actieve hoofdbeheerder meer",
        verzondenOp: nu,
      })
      .where(
        and(
          eq(ciRoodMailVerzendingenTable.id, verzendingId),
          isNull(ciRoodMailVerzendingenTable.verzondenOp),
          claimbaar,
          sql`NOT (${actueelBevoegd})`,
        ),
      );

    const [rij] = await tx
      .update(ciRoodMailVerzendingenTable)
      .set({
        status: "verzenden",
        claimOp: nu,
        pogingen: sql`${ciRoodMailVerzendingenTable.pogingen} + 1`,
        laatsteFout: null,
      })
      .where(
        and(
          eq(ciRoodMailVerzendingenTable.id, verzendingId),
          isNull(ciRoodMailVerzendingenTable.verzondenOp),
          claimbaar,
          actueelBevoegd,
        ),
      )
      .returning({
        id: ciRoodMailVerzendingenTable.id,
        rapportId: ciRoodMailVerzendingenTable.ciRapportId,
        gebruikerId: ciRoodMailVerzendingenTable.gebruikerId,
        claimOp: ciRoodMailVerzendingenTable.claimOp,
        ontvangerEmail: ciRoodMailVerzendingenTable.ontvangerEmail,
        ontvangerNaam: ciRoodMailVerzendingenTable.ontvangerNaam,
      });
    if (!rij?.claimOp) return null;

    const [actueel] = await tx
      .select({ email: gebruikersTable.email, naam: gebruikersTable.naam })
      .from(gebruikersTable)
      .where(
        and(
          eq(gebruikersTable.id, rij.gebruikerId),
          eq(gebruikersTable.actief, true),
          eq(gebruikersTable.rol, "hoofdbeheerder"),
        ),
      )
      .limit(1);
    if (!actueel?.email?.trim()) {
      await tx
        .update(ciRoodMailVerzendingenTable)
        .set({
          status: "overgeslagen",
          claimOp: null,
          laatsteFout: "ontvanger is geen actieve hoofdbeheerder meer",
          verzondenOp: nu,
        })
        .where(
          and(
            eq(ciRoodMailVerzendingenTable.id, rij.id),
            eq(ciRoodMailVerzendingenTable.claimOp, rij.claimOp),
          ),
        );
      return null;
    }

    const email = actueel.email.trim();
    await tx
      .update(ciRoodMailVerzendingenTable)
      .set({ ontvangerEmail: email, ontvangerNaam: actueel.naam })
      .where(
        and(
          eq(ciRoodMailVerzendingenTable.id, rij.id),
          eq(ciRoodMailVerzendingenTable.claimOp, rij.claimOp),
        ),
      );
    return {
      ...rij,
      claimOp: rij.claimOp,
      ontvangerEmail: email,
      ontvangerNaam: actueel.naam,
    };
  });
}

/**
 * Laatste bevoegdheidscontrole direct vóór de externe Graph-call. Bij
 * intrekking wordt de outboxrij terminal overgeslagen en lekt geen CI-informatie
 * naar een oud adres.
 */
export async function herbevestigCiRoodMailOntvanger(
  claim: GeclaimdeCiRoodMailVerzending,
  nu = new Date(),
): Promise<ActueleOntvanger | null> {
  return db.transaction(async (tx) => {
    const [actueel] = await tx
      .select({ email: gebruikersTable.email, naam: gebruikersTable.naam })
      .from(gebruikersTable)
      .where(
        and(
          eq(gebruikersTable.id, claim.gebruikerId),
          eq(gebruikersTable.actief, true),
          eq(gebruikersTable.rol, "hoofdbeheerder"),
        ),
      )
      .limit(1);
    if (!actueel?.email?.trim()) {
      await tx
        .update(ciRoodMailVerzendingenTable)
        .set({
          status: "overgeslagen",
          claimOp: null,
          laatsteFout: "ontvangerbevoegdheid ingetrokken vóór verzending",
          verzondenOp: nu,
        })
        .where(
          and(
            eq(ciRoodMailVerzendingenTable.id, claim.id),
            eq(ciRoodMailVerzendingenTable.status, "verzenden"),
            eq(ciRoodMailVerzendingenTable.claimOp, claim.claimOp),
          ),
        );
      return null;
    }
    const email = actueel.email.trim();
    await tx
      .update(ciRoodMailVerzendingenTable)
      .set({ ontvangerEmail: email, ontvangerNaam: actueel.naam })
      .where(
        and(
          eq(ciRoodMailVerzendingenTable.id, claim.id),
          eq(ciRoodMailVerzendingenTable.status, "verzenden"),
          eq(ciRoodMailVerzendingenTable.claimOp, claim.claimOp),
        ),
      );
    return { email, naam: actueel.naam };
  });
}

export async function markeerCiRoodMailVerzonden(
  claim: GeclaimdeCiRoodMailVerzending,
  verzondenOp = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const [bijgewerkt] = await tx
      .update(ciRoodMailVerzendingenTable)
      .set({
        status: "verzonden",
        claimOp: null,
        laatsteFout: null,
        verzondenOp,
      })
      .where(
        and(
          eq(ciRoodMailVerzendingenTable.id, claim.id),
          eq(ciRoodMailVerzendingenTable.status, "verzenden"),
          eq(ciRoodMailVerzendingenTable.claimOp, claim.claimOp),
        ),
      )
      .returning({ id: ciRoodMailVerzendingenTable.id });
    if (!bijgewerkt) {
      throw new Error("Rode-CI-mailverzending is verlopen of door een andere draai overgenomen");
    }
    await tx
      .update(ciRapportenTable)
      .set({ aanhoudendRoodMailOp: verzondenOp })
      .where(eq(ciRapportenTable.id, claim.rapportId));
  });
}

export async function markeerCiRoodMailMislukt(
  claim: GeclaimdeCiRoodMailVerzending,
  fout: unknown,
): Promise<void> {
  const melding = fout instanceof Error ? fout.message : String(fout);
  await db
    .update(ciRoodMailVerzendingenTable)
    .set({
      status: "mislukt",
      claimOp: null,
      laatsteFout: melding.slice(0, 1000),
    })
    .where(
      and(
        eq(ciRoodMailVerzendingenTable.id, claim.id),
        eq(ciRoodMailVerzendingenTable.status, "verzenden"),
        eq(ciRoodMailVerzendingenTable.claimOp, claim.claimOp),
      ),
    );
}