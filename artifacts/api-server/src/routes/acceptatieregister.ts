// Acceptatieregister (REGISTER_01) — één regel per acceptatiepunt per opdracht.
// Alleen de hoofdbeheerder ziet en beheert het register; opleveringen werken
// de standen bij via scripts (zie scripts/src/oplever-check.ts).
import { Router, type IRouter } from "express";
import {
  ACCEPTATIE_BRONKRACHT,
  ACCEPTATIEREGISTER_HERGRADEER_LOCK,
  ACCEPTATIE_STANDEN,
  acceptatieRegisterTable,
  db,
} from "@workspace/db";
import { asc, eq, sql } from "drizzle-orm";
import { requireRol } from "../middlewares/auth";

const router: IRouter = Router();

// Herkomst van het bewijs, in aflopende bewijskracht.
const BRON_SOORTEN = ["bewijsscript", "code", "meetrapport", "antwoorddocument"] as const;
type BronSoort = (typeof BRON_SOORTEN)[number];

// Ook codebewijs draagt een concrete brondatum: geen enkele bron mag ouder zijn
// dan de laatste relevante codewijziging.
function bewijsActueel(r: typeof acceptatieRegisterTable.$inferSelect): boolean {
  return r.bronDatum.getTime() >= r.laatsteCodeWijzigingOp.getTime();
}

class AcceptatiePatchFout extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function naarDto(r: typeof acceptatieRegisterTable.$inferSelect) {
  return {
    id: r.id,
    opdracht_code: r.opdrachtCode,
    punt_nummer: r.puntNummer,
    omschrijving: r.omschrijving,
    stand: r.stand,
    bewijs_vindplaats: r.bewijsVindplaats,
    bron_bestand: r.bronBestand,
    bron_soort: r.bronSoort,
    bron_datum: r.bronDatum.toISOString(),
    laatste_code_wijziging_op: r.laatsteCodeWijzigingOp.toISOString(),
    relevante_codepaden: r.relevanteCodepaden,
    beoordeeld_op: r.beoordeeldOp.toISOString(),
    bewijs_actueel: bewijsActueel(r),
    toelichting: r.toelichting,
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  };
}

router.get("/acceptatieregister", requireRol("hoofdbeheerder"), async (_req, res): Promise<void> => {
  const rijen = await db
    .select()
    .from(acceptatieRegisterTable)
    .orderBy(asc(acceptatieRegisterTable.opdrachtCode), asc(acceptatieRegisterTable.puntNummer));
  res.json(rijen.map(naarDto));
});

router.patch("/acceptatieregister/:id", requireRol("hoofdbeheerder"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return void res.status(400).json({ error: "Ongeldig id" });

  // Strikte body-validatie: alleen bekende velden, juiste types, en minstens
  // één echte wijziging — een lege PATCH mag bijgewerkt_op niet verversen
  // (dat zou de oplevercontrole "register is bijgewerkt" omzeilbaar maken).
  const body = req.body as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return void res.status(400).json({ error: "Body moet een object zijn" });
  }
  const toegestaan = [
    "stand",
    "bewijs_vindplaats",
    "bron_bestand",
    "bron_soort",
    "bron_datum",
    "laatste_code_wijziging_op",
    "relevante_codepaden",
    "toelichting",
  ] as const;
  const onbekend = Object.keys(body).filter((k) => !(toegestaan as readonly string[]).includes(k));
  if (onbekend.length > 0) {
    return void res.status(400).json({ error: `Onbekende velden: ${onbekend.join(", ")}` });
  }
  if (Object.keys(body).length === 0) {
    return void res.status(400).json({ error: `Geef minstens één veld op (${toegestaan.join(", ")})` });
  }

  const wijziging: Partial<typeof acceptatieRegisterTable.$inferInsert> = { bijgewerktOp: new Date() };
  if ("stand" in body) {
    const stand = body["stand"];
    if (typeof stand !== "string" || !(ACCEPTATIE_STANDEN as readonly string[]).includes(stand)) {
      return void res.status(400).json({ error: `Ongeldige stand — kies uit: ${ACCEPTATIE_STANDEN.join(", ")}` });
    }
    wijziging.stand = stand;
  }
  if ("bewijs_vindplaats" in body) {
    const b = body["bewijs_vindplaats"];
    if (b !== null && typeof b !== "string") return void res.status(400).json({ error: "bewijs_vindplaats moet tekst of null zijn" });
    wijziging.bewijsVindplaats = b ? b.slice(0, 500) : null;
  }
  if ("bron_bestand" in body) {
    const b = body["bron_bestand"];
    if (b !== null && typeof b !== "string") return void res.status(400).json({ error: "bron_bestand moet tekst of null zijn" });
    wijziging.bronBestand = b ? b.slice(0, 500) : null;
  }
  if ("bron_soort" in body) {
    const s = body["bron_soort"];
    if (typeof s !== "string" || !(BRON_SOORTEN as readonly string[]).includes(s)) {
      return void res.status(400).json({ error: `Ongeldige bron_soort — kies uit: ${BRON_SOORTEN.join(", ")}` });
    }
    wijziging.bronSoort = s as BronSoort;
  }
  if ("bron_datum" in body) {
    const d = body["bron_datum"];
    if (typeof d !== "string") return void res.status(400).json({ error: "bron_datum moet een geldige datum-tijd zijn" });
    const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00.000Z` : d);
    if (Number.isNaN(parsed.getTime())) {
      return void res.status(400).json({ error: "bron_datum moet een geldige datum-tijd zijn" });
    }
    wijziging.bronDatum = parsed;
  }
  if ("laatste_code_wijziging_op" in body) {
    const c = body["laatste_code_wijziging_op"];
    if (typeof c !== "string") {
      return void res.status(400).json({ error: "laatste_code_wijziging_op moet een geldige datum-tijd zijn" });
    }
    const parsed = new Date(c);
    if (Number.isNaN(parsed.getTime())) {
      return void res.status(400).json({ error: "laatste_code_wijziging_op is geen geldige datum-tijd" });
    }
    wijziging.laatsteCodeWijzigingOp = parsed;
  }
  if ("relevante_codepaden" in body) {
    const paden = body["relevante_codepaden"];
    if (!Array.isArray(paden) || paden.some((pad) => typeof pad !== "string" || !pad.trim())) {
      return void res.status(400).json({ error: "relevante_codepaden moet een lijst met niet-lege paden zijn" });
    }
    wijziging.relevanteCodepaden = [...new Set(paden.map((pad) => pad.trim()))].slice(0, 100);
  }
  if ("toelichting" in body) {
    const t = body["toelichting"];
    if (t !== null && typeof t !== "string") return void res.status(400).json({ error: "toelichting moet tekst of null zijn" });
    wijziging.toelichting = t ? t.slice(0, 1000) : null;
  }

  try {
    const rij = await db.transaction(async (tx) => {
      // Gewone PATCHes delen dit slot; alleen de eenmalige historische
      // hergrading neemt het exclusief. Zo wacht een mutatie tijdens die run
      // en wordt zij daarna op de nieuwe registerstand toegepast.
      await tx.execute(sql`SELECT pg_advisory_xact_lock_shared(${ACCEPTATIEREGISTER_HERGRADEER_LOCK})`);
      const [huidig] = await tx
        .select()
        .from(acceptatieRegisterTable)
        .where(eq(acceptatieRegisterTable.id, id))
        .for("update");
      if (!huidig) throw new AcceptatiePatchFout(404, "Acceptatiepunt niet gevonden");

      // Effectieve waarden ná deze PATCH (nieuw waar meegestuurd, anders huidig).
      const nieuweStand = wijziging.stand ?? huidig.stand;
      const nieuwBewijs = "bewijs_vindplaats" in body ? wijziging.bewijsVindplaats : huidig.bewijsVindplaats;
      const nieuwBronBestand = "bron_bestand" in body ? wijziging.bronBestand : huidig.bronBestand;
      const nieuwBronSoort = "bron_soort" in body ? wijziging.bronSoort : huidig.bronSoort;
      const nieuwBronDatum = "bron_datum" in body ? wijziging.bronDatum : huidig.bronDatum;
      const nieuwCodeWijziging =
        "laatste_code_wijziging_op" in body ? wijziging.laatsteCodeWijzigingOp : huidig.laatsteCodeWijzigingOp;
      const nieuweCodepaden =
        "relevante_codepaden" in body ? wijziging.relevanteCodepaden : huidig.relevanteCodepaden;

      // Promotie naar "gehaald" vereist een complete, herleidbare bewijsketen.
      // De bronrangorde vergelijkt het actuele bewijs, ongeacht de huidige
      // stand. Daardoor kan een sterker oordeel niet via twee PATCHes worden
      // afgezwakt; een aantoonbaar stale sterk bewijs blokkeert juist niet.
      if (nieuweStand === "gehaald") {
        if ("bron_soort" in body && nieuwBronSoort === "bewijsscript" && huidig.bronSoort !== "bewijsscript") {
          throw new AcceptatiePatchFout(
            400,
            "Bronsoort bewijsscript kan uitsluitend door een volledig groen gekoppeld bewijsscript worden geregistreerd.",
          );
        }
        if (
          bewijsActueel(huidig)
          && nieuwBronSoort
          && ACCEPTATIE_BRONKRACHT[nieuwBronSoort as BronSoort] < ACCEPTATIE_BRONKRACHT[huidig.bronSoort as BronSoort]
        ) {
          throw new AcceptatiePatchFout(
            409,
            "Een actueel sterker bewijs mag niet door een zwakkere bron worden overschreven.",
          );
        }
        if (!nieuwBewijs?.trim()) {
          throw new AcceptatiePatchFout(400, 'Stand "gehaald" vereist een bewijs-vindplaats');
        }
        if (!nieuwBronBestand?.trim()) {
          throw new AcceptatiePatchFout(400, 'Stand "gehaald" vereist een bron_bestand');
        }
        if (!nieuwBronSoort) {
          throw new AcceptatiePatchFout(400, 'Stand "gehaald" vereist een bron_soort');
        }
        if (!nieuwBronDatum) {
          throw new AcceptatiePatchFout(400, 'Stand "gehaald" vereist een bron_datum');
        }
        if (!nieuwCodeWijziging) {
          throw new AcceptatiePatchFout(400, 'Stand "gehaald" vereist laatste_code_wijziging_op');
        }
        if (!nieuweCodepaden || nieuweCodepaden.length === 0) {
          throw new AcceptatiePatchFout(400, 'Stand "gehaald" vereist minstens één relevant codepad');
        }
        if (nieuwBronDatum.getTime() < nieuwCodeWijziging.getTime()) {
          throw new AcceptatiePatchFout(
            409,
            "Bewijs is verouderd: de brondatum ligt vóór de laatste relevante codewijziging. Voer een nieuwe meting uit.",
          );
        }
      }
      wijziging.beoordeeldOp = new Date();

      const [bijgewerkt] = await tx
        .update(acceptatieRegisterTable)
        .set(wijziging)
        .where(eq(acceptatieRegisterTable.id, id))
        .returning();
      if (!bijgewerkt) throw new AcceptatiePatchFout(404, "Acceptatiepunt niet gevonden");
      return bijgewerkt;
    });
    res.json(naarDto(rij));
  } catch (error) {
    if (error instanceof AcceptatiePatchFout) {
      return void res.status(error.status).json({ error: error.message });
    }
    throw error;
  }
});

export default router;
