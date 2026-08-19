/**
 * GEBRUIKERS_01 v2 — Functiehuis + bevoegdheidsafwijkingen API
 *
 * Functies zijn globaal (niet BV-gebonden). Profielen zijn de interne rechtenmatrix.
 * Afwijkingen per gebruiker/module overrulen de functie-baseline.
 * Append-only log met niveau, reden, actor en tijd.
 */
import { Router } from "express";
import {
  db,
  functiesTable,
  profielenTable,
  gebruikersTable,
  gebruikerBevoegdheidAfwijkingenTable,
  bevoegdheidAuditLogTable,
} from "@workspace/db";
import { eq, and, ne, inArray, asc, desc } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { MODULE_IDS, MAX_NIVEAU, type Bevoegdheden } from "@workspace/permissies";
import {
  berekenEffectieveBevoegdheden,
  berekenFunctieBaseline,
} from "../lib/effectieve-bevoegdheden";
import { controleerBevoegdhedenVoorActor } from "../lib/functie-rechten-autorisatie";

const router = Router();

const lezen     = requireBevoegdheid("personeel", 1);
const schrijven = requireBevoegdheid("personeel", 2);
const beheer    = requireBevoegdheid("gebruikers", 4);

// ── Helpers ──────────────────────────────────────────────────────────────────
const iso = (d: Date) => d.toISOString();

function valideerBevoegdhedenPayload(
  invoer: unknown,
): { bevoegdheden: Bevoegdheden; fout: string | null } {
  if (invoer == null) return { bevoegdheden: {}, fout: null };
  if (typeof invoer !== "object" || Array.isArray(invoer)) {
    return { bevoegdheden: {}, fout: "bevoegdheden moet een object zijn" };
  }
  const bevoegdheden: Bevoegdheden = {};
  for (const [sleutel, waarde] of Object.entries(invoer as Record<string, unknown>)) {
    if (!MODULE_IDS.includes(sleutel as never)) {
      return { bevoegdheden: {}, fout: `Onbekende module: ${sleutel}` };
    }
    if (
      typeof waarde !== "number" ||
      !Number.isInteger(waarde) ||
      waarde < 0 ||
      waarde > MAX_NIVEAU
    ) {
      return {
        bevoegdheden: {},
        fout: `Ongeldig niveau voor module ${sleutel}: 0–${MAX_NIVEAU} vereist`,
      };
    }
    bevoegdheden[sleutel] = waarde;
  }
  return { bevoegdheden, fout: null };
}

type FunctieRij = typeof functiesTable.$inferSelect;
type ProfielRij = typeof profielenTable.$inferSelect;

/**
 * Detecteer een PostgreSQL unique-violation (SQLSTATE 23505). Bij een race
 * tussen de vooraf-conflictcheck en de INSERT/UPDATE geeft de DB een 23505;
 * die mappen we op 409 in plaats van 500.
 */
function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  if (code === "23505") return true;
  // Sommige drivers nesten de oorspronkelijke fout onder .cause.
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === "object" && (cause as { code?: unknown }).code === "23505") {
    return true;
  }
  return false;
}

function mapFunctieMetRechten(f: FunctieRij, profiel?: ProfielRij | null) {
  return {
    id: f.id,
    naam: f.naam,
    omschrijving: f.omschrijving ?? null,
    taken: f.taken ?? null,
    verantwoordelijkheden: f.verantwoordelijkheden ?? null,
    competenties: f.competenties ?? null,
    opleidingsvereisten: f.opleidingsvereisten ?? null,
    doorgroeipad: f.doorgroeipad ?? null,
    uitvoerend: f.uitvoerend,
    actief: f.actief,
    minimale_bezetting: f.minimaleBezetting ?? null,
    profiel_id: f.profielId ?? null,
    bevoegdheden: profiel ? ((profiel.bevoegdheden as Bevoegdheden) ?? {}) : {},
    aangemaakt_op: iso(f.aangemaaktOp),
    bijgewerkt_op: iso(f.bijgewerktOp),
  };
}

/**
 * Haal de actor op via de session (nooit via request body — dat is spoofbaar).
 * Voor afwijking-mutaties en resets MOET er altijd een echte, bestaande
 * sessie-actor zijn. Ontbreekt de sessie → 401; bestaat de sessie-gebruiker
 * niet (meer) in de DB → 403. Retourneert nooit een null-actor bij ok=true.
 */
type ActorResultaat =
  | { ok: true; actorId: number; actorNaam: string }
  | { ok: false; status: 401 | 403; error: string };

async function resolveVerplichteActor(
  sessionUserId: number | undefined,
): Promise<ActorResultaat> {
  if (!sessionUserId) {
    return { ok: false, status: 401, error: "Niet ingelogd: geen sessie-actor" };
  }
  const [actor] = await db
    .select({ id: gebruikersTable.id, naam: gebruikersTable.naam })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, sessionUserId));
  if (!actor) {
    return { ok: false, status: 403, error: "Sessie-actor bestaat niet (meer)" };
  }
  return { ok: true, actorId: actor.id, actorNaam: actor.naam };
}

// ── GET /functies-v2 ─────────────────────────────────────────────────────────
router.get("/functies-v2", lezen, async (req, res): Promise<void> => {
  try {
    const inclInactief = req.query.inclusief_inactief === "true";
    const functies = await db
      .select()
      .from(functiesTable)
      .where(inclInactief ? undefined : eq(functiesTable.actief, true))
      .orderBy(asc(functiesTable.naam));

    const profielIds = [
      ...new Set(
        functies.map((f) => f.profielId).filter((id): id is number => id != null),
      ),
    ];
    const profielen =
      profielIds.length > 0
        ? await db
            .select()
            .from(profielenTable)
            .where(inArray(profielenTable.id, profielIds))
        : [];
    const profielMap = new Map(profielen.map((p) => [p.id, p]));

    res.json(
      functies.map((f) =>
        mapFunctieMetRechten(f, f.profielId != null ? profielMap.get(f.profielId) : null),
      ),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── GET /functies-v2/:id ──────────────────────────────────────────────────────
router.get("/functies-v2/:id", lezen, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const [f] = await db.select().from(functiesTable).where(eq(functiesTable.id, id));
    if (!f) {
      res.status(404).json({ error: "Functie niet gevonden" });
      return;
    }
    const profiel = f.profielId
      ? (
          await db
            .select()
            .from(profielenTable)
            .where(eq(profielenTable.id, f.profielId))
        )[0]
      : null;
    res.json(mapFunctieMetRechten(f, profiel));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── POST /functies-v2 ─────────────────────────────────────────────────────────
// Aanmaken van functie + gekoppeld profiel in één transactie.
// 409 als er al een functie of profiel met dezelfde naam bestaat.
router.post("/functies-v2", schrijven, async (req, res): Promise<void> => {
  try {
    const {
      naam,
      omschrijving,
      taken,
      verantwoordelijkheden,
      competenties,
      opleidingsvereisten,
      doorgroeipad,
      uitvoerend,
      actief,
      minimale_bezetting,
      bevoegdheden: bevInvoer,
    } = req.body ?? {};

    if (!naam || typeof naam !== "string" || !naam.trim()) {
      res.status(400).json({ error: "naam is verplicht" });
      return;
    }
    const naamTrimmed = String(naam).trim();

    const { bevoegdheden, fout } = valideerBevoegdhedenPayload(bevInvoer);
    if (fout) {
      res.status(400).json({ error: fout });
      return;
    }
    const rechtenControle = controleerBevoegdhedenVoorActor(req.permissies, [bevoegdheden]);
    if (!rechtenControle.ok) {
      res.status(rechtenControle.status).json(rechtenControle.body);
      return;
    }

    // Conflict-check: actieve functie of profiel met zelfde naam
    const [bestaandeFunctie] = await db
      .select({ id: functiesTable.id })
      .from(functiesTable)
      .where(and(eq(functiesTable.naam, naamTrimmed), eq(functiesTable.actief, true)));
    if (bestaandeFunctie) {
      res.status(409).json({ error: `Er bestaat al een actieve functie met de naam '${naamTrimmed}'` });
      return;
    }

    const [bestaandProfiel] = await db
      .select({ id: profielenTable.id })
      .from(profielenTable)
      .where(eq(profielenTable.naam, naamTrimmed));
    if (bestaandProfiel) {
      res.status(409).json({ error: `Er bestaat al een profiel met de naam '${naamTrimmed}'` });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [profiel] = await tx
        .insert(profielenTable)
        .values({ naam: naamTrimmed, bevoegdheden, systeem: false, groep: "Functiehuis" })
        .returning();

      const [functie] = await tx
        .insert(functiesTable)
        .values({
          naam: naamTrimmed,
          werkmaatschappij: "",
          werkgeverId: null,
          omschrijving: omschrijving ?? null,
          taken: taken ?? null,
          verantwoordelijkheden: verantwoordelijkheden ?? null,
          competenties: competenties ?? null,
          opleidingsvereisten: opleidingsvereisten ?? null,
          doorgroeipad: doorgroeipad ?? null,
          uitvoerend: uitvoerend === true,
          actief: actief !== false,
          minimaleBezetting:
            typeof minimale_bezetting === "number" ? minimale_bezetting : null,
          profielId: profiel.id,
        })
        .returning();

      return { functie, profiel };
    });

    res.status(201).json(mapFunctieMetRechten(result.functie, result.profiel));
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Er bestaat al een functie of profiel met deze naam" });
      return;
    }
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── PATCH /functies-v2/:id ────────────────────────────────────────────────────
// Bijwerken van functie + rechten in één transactie.
// - Naam conflict → 409.
// - Naam wijziging → profiel-naam wordt synchroon bijgewerkt.
// - Functie zonder profiel die rechten krijgt → profiel wordt aangemaakt.
router.patch("/functies-v2/:id", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const {
      naam,
      omschrijving,
      taken,
      verantwoordelijkheden,
      competenties,
      opleidingsvereisten,
      doorgroeipad,
      uitvoerend,
      actief,
      minimale_bezetting,
      bevoegdheden: bevInvoer,
    } = req.body ?? {};

    const [bestaand] = await db
      .select()
      .from(functiesTable)
      .where(eq(functiesTable.id, id));
    if (!bestaand) {
      res.status(404).json({ error: "Functie niet gevonden" });
      return;
    }
    if (actief !== undefined && (actief === true) !== bestaand.actief) {
      res.status(409).json({
        error:
          "Activeren of deactiveren is niet beschikbaar via een algemene functiewijziging; dit voorkomt dat toegewezen medewerkers stil rechten verliezen.",
      });
      return;
    }

    let naamTrimmed: string | undefined;
    if (naam !== undefined) {
      naamTrimmed = String(naam).trim();
      if (!naamTrimmed) {
        res.status(400).json({ error: "naam mag niet leeg zijn" });
        return;
      }
      // Conflict: andere actieve functie met zelfde naam
      if (naamTrimmed !== bestaand.naam) {
        const [conflict] = await db
          .select({ id: functiesTable.id })
          .from(functiesTable)
          .where(and(eq(functiesTable.naam, naamTrimmed), eq(functiesTable.actief, true)));
        if (conflict) {
          res.status(409).json({
            error: `Er bestaat al een actieve functie met de naam '${naamTrimmed}'`,
          });
          return;
        }
        // Conflict: een ANDER profiel met dezelfde naam. Bij hernoemen wordt de
        // profiel-naam synchroon bijgewerkt; die naam moet uniek blijven t.o.v.
        // andere profielen. Het eigen profiel van deze functie wordt uitgesloten.
        const [profielConflict] = await db
          .select({ id: profielenTable.id })
          .from(profielenTable)
          .where(
            and(
              eq(profielenTable.naam, naamTrimmed),
              bestaand.profielId != null
                ? ne(profielenTable.id, bestaand.profielId)
                : undefined,
            ),
          );
        if (profielConflict) {
          res.status(409).json({
            error: `Er bestaat al een profiel met de naam '${naamTrimmed}'`,
          });
          return;
        }
      }
    }

    let valideBevoegdheden: Bevoegdheden | undefined;
    if (bevInvoer !== undefined) {
      const { bevoegdheden, fout } = valideerBevoegdhedenPayload(bevInvoer);
      if (fout) {
        res.status(400).json({ error: fout });
        return;
      }
      valideBevoegdheden = bevoegdheden;

      const huidigProfiel = bestaand.profielId == null
        ? null
        : (
            await db
              .select({ bevoegdheden: profielenTable.bevoegdheden })
              .from(profielenTable)
              .where(eq(profielenTable.id, bestaand.profielId))
          )[0] ?? null;
      const rechtenControle = controleerBevoegdhedenVoorActor(req.permissies, [
        (huidigProfiel?.bevoegdheden as Bevoegdheden | null) ?? {},
        valideBevoegdheden,
      ]);
      if (!rechtenControle.ok) {
        res.status(rechtenControle.status).json(rechtenControle.body);
        return;
      }
    }

    const result = await db.transaction(async (tx) => {
      const functieUpdate: Partial<typeof functiesTable.$inferInsert> = {
        bijgewerktOp: new Date(),
      };
      if (naamTrimmed !== undefined) functieUpdate.naam = naamTrimmed;
      if (omschrijving !== undefined) functieUpdate.omschrijving = omschrijving;
      if (taken !== undefined) functieUpdate.taken = taken;
      if (verantwoordelijkheden !== undefined)
        functieUpdate.verantwoordelijkheden = verantwoordelijkheden;
      if (competenties !== undefined) functieUpdate.competenties = competenties;
      if (opleidingsvereisten !== undefined)
        functieUpdate.opleidingsvereisten = opleidingsvereisten;
      if (doorgroeipad !== undefined) functieUpdate.doorgroeipad = doorgroeipad;
      if (uitvoerend !== undefined) functieUpdate.uitvoerend = uitvoerend === true;
      if (minimale_bezetting !== undefined)
        functieUpdate.minimaleBezetting =
          typeof minimale_bezetting === "number" ? minimale_bezetting : null;

      const [functie] = await tx
        .update(functiesTable)
        .set(functieUpdate)
        .where(eq(functiesTable.id, id))
        .returning();

      let profiel: ProfielRij | null = null;

      if (valideBevoegdheden !== undefined) {
        if (functie.profielId != null) {
          // Profiel bestaat: bijwerken
          const profielUpdate: Partial<typeof profielenTable.$inferInsert> = {
            bevoegdheden: valideBevoegdheden,
          };
          // Naam synchroon bijwerken als functienaam is gewijzigd
          if (naamTrimmed !== undefined && naamTrimmed !== bestaand.naam) {
            profielUpdate.naam = naamTrimmed;
          }
          const [bijgewerkt] = await tx
            .update(profielenTable)
            .set(profielUpdate)
            .where(eq(profielenTable.id, functie.profielId))
            .returning();
          profiel = bijgewerkt ?? null;
        } else {
          // Functie had nog geen profiel: aanmaken
          const [nieuwProfiel] = await tx
            .insert(profielenTable)
            .values({
              naam: naamTrimmed ?? functie.naam,
              bevoegdheden: valideBevoegdheden,
              systeem: false,
              groep: "Functiehuis",
            })
            .returning();
          await tx
            .update(functiesTable)
            .set({ profielId: nieuwProfiel.id })
            .where(eq(functiesTable.id, id));
          profiel = nieuwProfiel;
        }
      } else {
        // Geen bevoegdheden-update: naam-sync op profiel indien van toepassing
        if (naamTrimmed !== undefined && naamTrimmed !== bestaand.naam && functie.profielId != null) {
          const [bijgewerkt] = await tx
            .update(profielenTable)
            .set({ naam: naamTrimmed })
            .where(eq(profielenTable.id, functie.profielId))
            .returning();
          profiel = bijgewerkt ?? null;
        } else if (functie.profielId != null) {
          const [huidig] = await tx
            .select()
            .from(profielenTable)
            .where(eq(profielenTable.id, functie.profielId));
          profiel = huidig ?? null;
        }
      }

      return { functie, profiel };
    });

    res.json(mapFunctieMetRechten(result.functie, result.profiel));
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Er bestaat al een functie of profiel met deze naam" });
      return;
    }
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── GET /gebruikers-v2/:id/bevoegdheden ──────────────────────────────────────
router.get("/gebruikers-v2/:id/bevoegdheden", beheer, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const [g] = await db
      .select({ id: gebruikersTable.id, naam: gebruikersTable.naam, rol: gebruikersTable.rol })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, id));
    if (!g) {
      res.status(404).json({ error: "Gebruiker niet gevonden" });
      return;
    }

    const [effectief, baseline, afwijkingen] = await Promise.all([
      berekenEffectieveBevoegdheden(id),
      berekenFunctieBaseline(id),
      db
        .select()
        .from(gebruikerBevoegdheidAfwijkingenTable)
        .where(eq(gebruikerBevoegdheidAfwijkingenTable.gebruikerId, id))
        .orderBy(asc(gebruikerBevoegdheidAfwijkingenTable.moduleId)),
    ]);

    res.json({
      gebruiker_id: id,
      naam: g.naam,
      functie_baseline: baseline,
      afwijkingen: afwijkingen.map((a) => ({
        module_id: a.moduleId,
        niveau: a.niveau,
        reden: a.reden,
        actor_id: a.actorId ?? null,
        actor_naam: a.actorNaam ?? null,
        aangemaakt_op: iso(a.aangemaaktOp),
      })),
      effectieve_bevoegdheden: effectief,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── PUT /gebruikers-v2/:id/afwijkingen ───────────────────────────────────────
// Vervangt de volledige set afwijkingen. actor_id wordt UITSLUITEND uit
// req.session.userId gehaald (request-body actor_id wordt genegeerd).
// Modules die exact gelijk zijn aan de functie-baseline worden geweigerd met
// een 400, zodat de tabel alleen ECHTE afwijkingen bevat.
router.put("/gebruikers-v2/:id/afwijkingen", beheer, async (req, res): Promise<void> => {
  try {
    const gebruikerId = parseInt(String(req.params.id), 10);
    const { afwijkingen: invoer, reden } = req.body ?? {};

    if (!reden || typeof reden !== "string" || !reden.trim()) {
      res.status(400).json({ error: "reden is verplicht" });
      return;
    }

    if (!Array.isArray(invoer)) {
      res.status(400).json({ error: "afwijkingen moet een lijst zijn" });
      return;
    }

    // Duplicate-module check
    const moduleZien = new Set<string>();
    for (const a of invoer) {
      if (!MODULE_IDS.includes(a.module_id as never)) {
        res.status(400).json({ error: `Onbekende module: ${a.module_id}` });
        return;
      }
      if (
        typeof a.niveau !== "number" ||
        !Number.isInteger(a.niveau) ||
        a.niveau < 0 ||
        a.niveau > MAX_NIVEAU
      ) {
        res.status(400).json({ error: `Ongeldig niveau voor module ${a.module_id}` });
        return;
      }
      if (moduleZien.has(a.module_id)) {
        res.status(400).json({ error: `Dubbele module in afwijkingen: ${a.module_id}` });
        return;
      }
      moduleZien.add(a.module_id);
    }

    // Gebruiker bestaat?
    const [doelGebruiker] = await db
      .select({ id: gebruikersTable.id })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, gebruikerId));
    if (!doelGebruiker) {
      res.status(404).json({ error: "Gebruiker niet gevonden" });
      return;
    }

    // Baseline ophalen en modules weigeren die gelijk zijn aan de baseline:
    // die zijn geen echte afwijking en horen niet in de tabel.
    const baselineVoorControle = await berekenFunctieBaseline(gebruikerId);
    const gelijkAanBaseline = (invoer as { module_id: string; niveau: number }[]).filter(
      (a) => (baselineVoorControle[a.module_id] ?? 0) === a.niveau,
    );
    if (gelijkAanBaseline.length > 0) {
      res.status(400).json({
        error:
          "Eén of meer opgegeven modules zijn gelijk aan de functie-baseline en " +
          "zijn dus geen echte afwijking. Laat die modules weg of gebruik reset.",
        modules_gelijk_aan_baseline: gelijkAanBaseline.map((a) => a.module_id),
      });
      return;
    }

    // Actor uitsluitend uit sessie (verplicht en bestaand).
    const actorResultaat = await resolveVerplichteActor(req.session?.userId);
    if (!actorResultaat.ok) {
      res.status(actorResultaat.status).json({ error: actorResultaat.error });
      return;
    }
    const { actorId, actorNaam } = actorResultaat;

    await db.transaction(async (tx) => {
      const huidig = await tx
        .select()
        .from(gebruikerBevoegdheidAfwijkingenTable)
        .where(eq(gebruikerBevoegdheidAfwijkingenTable.gebruikerId, gebruikerId));
      const huidigMap = new Map(huidig.map((h) => [h.moduleId, h.niveau]));

      await tx
        .delete(gebruikerBevoegdheidAfwijkingenTable)
        .where(eq(gebruikerBevoegdheidAfwijkingenTable.gebruikerId, gebruikerId));

      if (invoer.length > 0) {
        await tx.insert(gebruikerBevoegdheidAfwijkingenTable).values(
          invoer.map((a: { module_id: string; niveau: number }) => ({
            gebruikerId,
            moduleId: a.module_id,
            niveau: a.niveau,
            reden: reden.trim(),
            actorId,
            actorNaam,
          })),
        );
      }

      const nieuweMap = new Map(
        (invoer as { module_id: string; niveau: number }[]).map((a) => [a.module_id, a.niveau]),
      );
      const auditRijen: (typeof bevoegdheidAuditLogTable.$inferInsert)[] = [];

      for (const [mod, oudNiveau] of huidigMap) {
        if (!nieuweMap.has(mod)) {
          auditRijen.push({
            gebruikerId,
            moduleId: mod,
            oudNiveau,
            nieuwNiveau: null,
            actie: "afwijking_verwijderd",
            reden: reden.trim(),
            actorId,
            actorNaam,
          });
        }
      }
      for (const a of invoer as { module_id: string; niveau: number }[]) {
        auditRijen.push({
          gebruikerId,
          moduleId: a.module_id,
          oudNiveau: huidigMap.get(a.module_id) ?? null,
          nieuwNiveau: a.niveau,
          actie: "afwijking_gezet",
          reden: reden.trim(),
          actorId,
          actorNaam,
        });
      }

      if (auditRijen.length > 0) {
        await tx.insert(bevoegdheidAuditLogTable).values(auditRijen);
      }
    });

    const [effectief, nieuweAfwijkingen] = await Promise.all([
      berekenEffectieveBevoegdheden(gebruikerId),
      db
        .select()
        .from(gebruikerBevoegdheidAfwijkingenTable)
        .where(eq(gebruikerBevoegdheidAfwijkingenTable.gebruikerId, gebruikerId))
        .orderBy(asc(gebruikerBevoegdheidAfwijkingenTable.moduleId)),
    ]);

    res.json({
      gebruiker_id: gebruikerId,
      afwijkingen: nieuweAfwijkingen.map((a) => ({
        module_id: a.moduleId,
        niveau: a.niveau,
        reden: a.reden,
        actor_id: a.actorId ?? null,
        actor_naam: a.actorNaam ?? null,
        aangemaakt_op: iso(a.aangemaaktOp),
      })),
      effectieve_bevoegdheden: effectief,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── POST /gebruikers-v2/:id/functie-rechten-toepassen ────────────────────────
// Baseline opnieuw toepassen. Bewuste afwijkingen worden NIET stil gewist
// tenzij bewuste_afwijkingen_wissen: true expliciet is meegegeven.
router.post(
  "/gebruikers-v2/:id/functie-rechten-toepassen",
  beheer,
  async (req, res): Promise<void> => {
    try {
      const gebruikerId = parseInt(String(req.params.id), 10);
      const { reden, bewuste_afwijkingen_wissen } = req.body ?? {};

      if (!reden || typeof reden !== "string" || !reden.trim()) {
        res.status(400).json({ error: "reden is verplicht" });
        return;
      }

      // Gebruiker bestaat?
      const [doelGebruiker] = await db
        .select({ id: gebruikersTable.id })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, gebruikerId));
      if (!doelGebruiker) {
        res.status(404).json({ error: "Gebruiker niet gevonden" });
        return;
      }

      const actorResultaat = await resolveVerplichteActor(req.session?.userId);
      if (!actorResultaat.ok) {
        res.status(actorResultaat.status).json({ error: actorResultaat.error });
        return;
      }
      const { actorId, actorNaam } = actorResultaat;
      const baseline = await berekenFunctieBaseline(gebruikerId);

      await db.transaction(async (tx) => {
        const huidig = await tx
          .select()
          .from(gebruikerBevoegdheidAfwijkingenTable)
          .where(eq(gebruikerBevoegdheidAfwijkingenTable.gebruikerId, gebruikerId));

        const auditRijen: (typeof bevoegdheidAuditLogTable.$inferInsert)[] = [];

        if (bewuste_afwijkingen_wissen === true) {
          await tx
            .delete(gebruikerBevoegdheidAfwijkingenTable)
            .where(eq(gebruikerBevoegdheidAfwijkingenTable.gebruikerId, gebruikerId));

          for (const a of huidig) {
            auditRijen.push({
              gebruikerId,
              moduleId: a.moduleId,
              oudNiveau: a.niveau,
              nieuwNiveau: null,
              actie: "reset",
              reden: reden.trim(),
              actorId,
              actorNaam,
            });
          }
        }

        auditRijen.push({
          gebruikerId,
          moduleId: null,
          oudNiveau: null,
          nieuwNiveau: null,
          actie: "functie_toegepast",
          reden: reden.trim(),
          actorId,
          actorNaam,
        });

        if (auditRijen.length > 0) {
          await tx.insert(bevoegdheidAuditLogTable).values(auditRijen);
        }
      });

      const [effectief, afwijkingen] = await Promise.all([
        berekenEffectieveBevoegdheden(gebruikerId),
        db
          .select()
          .from(gebruikerBevoegdheidAfwijkingenTable)
          .where(eq(gebruikerBevoegdheidAfwijkingenTable.gebruikerId, gebruikerId))
          .orderBy(asc(gebruikerBevoegdheidAfwijkingenTable.moduleId)),
      ]);

      res.json({
        gebruiker_id: gebruikerId,
        functie_baseline: baseline,
        bewuste_afwijkingen_gewist: bewuste_afwijkingen_wissen === true,
        afwijkingen: afwijkingen.map((a) => ({
          module_id: a.moduleId,
          niveau: a.niveau,
          reden: a.reden,
          actor_id: a.actorId ?? null,
          actor_naam: a.actorNaam ?? null,
          aangemaakt_op: iso(a.aangemaaktOp),
        })),
        effectieve_bevoegdheden: effectief,
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// ── GET /gebruikers-v2/:id/bevoegdheid-log ───────────────────────────────────
router.get("/gebruikers-v2/:id/bevoegdheid-log", beheer, async (req, res): Promise<void> => {
  try {
    const gebruikerId = parseInt(String(req.params.id), 10);
    const log = await db
      .select()
      .from(bevoegdheidAuditLogTable)
      .where(eq(bevoegdheidAuditLogTable.gebruikerId, gebruikerId))
      .orderBy(desc(bevoegdheidAuditLogTable.tijdstip))
      .limit(200);

    res.json(
      log.map((e) => ({
        id: e.id,
        gebruiker_id: e.gebruikerId,
        module_id: e.moduleId ?? null,
        oud_niveau: e.oudNiveau ?? null,
        nieuw_niveau: e.nieuwNiveau ?? null,
        actie: e.actie,
        reden: e.reden ?? null,
        actor_id: e.actorId ?? null,
        actor_naam: e.actorNaam ?? null,
        tijdstip: iso(e.tijdstip),
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
