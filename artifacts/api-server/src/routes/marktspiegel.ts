// ── PRIJS_01 §8 — De marktspiegel (HTTP-routes) ──────────────────────────────
//
// Module/niveau-keuze (§10 — expliciet gemeld):
//   - De marktspiegel spiegelt inkoopprijzen en financiële contracten aan de
//     markt; dat is financieel-werk. Daarom hangt hij aan de module 'financieel'.
//   - GET (lijst + detail) = niveau 1 (lezen). POST (een onderzoek starten) =
//     niveau 2 (bewerken). Dit is bewust hetzelfde niveau als het bekijken/
//     starten van de financiële contractbewaking.
//
// NOOIT doorlopend (§8.2, §9): een onderzoek draait uitsluitend op aanvraag via
// deze POST. De §7-werkbakitems verwijzen er alleen tekstueel naartoe.
//
// Let op de wildcard-volgorde: de statische routes (/marktspiegel[/…]) staan
// vóór eventuele generieke :id-catchers elders; hier geen conflict, maar de
// vaste paden staan bewust bovenaan.
import { Router } from "express";
import { db, marktspiegelOnderzoekenTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import {
  startMarktspiegelAsync,
  prijsafspraakBestaat,
  financieelContractBestaat,
} from "../services/marktspiegel";
import { heeftGateway } from "../lib/aiGateway";

const router = Router();

const lezen = requireBevoegdheid("financieel", 1);
const starten = requireBevoegdheid("financieel", 2);

type Onderzoek = typeof marktspiegelOnderzoekenTable.$inferSelect;

function mapOnderzoek(r: Onderzoek) {
  return {
    id: r.id,
    onderwerp_type: r.onderwerpType,
    onderwerp_id: r.onderwerpId,
    vraag: r.vraag,
    status: r.status,
    resultaat: r.resultaat ?? null,
    fout: r.fout,
    aangevraagd_door: r.aangevraagdDoor,
    aanleiding: r.aanleiding,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    klaar_op: r.klaarOp ? r.klaarOp.toISOString() : null,
  };
}

// ── GET /marktspiegel ────────────────────────────────────────────────────────
// Lijst van onderzoeken, recent eerst.
router.get("/marktspiegel", lezen, async (req, res): Promise<void> => {
  try {
    const rijen = await db
      .select()
      .from(marktspiegelOnderzoekenTable)
      .orderBy(desc(marktspiegelOnderzoekenTable.aangemaaktOp))
      .limit(200);
    res.json(rijen.map(mapOnderzoek));
  } catch (err) {
    req.log.error({ err }, "marktspiegel-onderzoeken ophalen mislukt");
    res.status(500).json({ error: "Fout bij ophalen marktspiegel-onderzoeken" });
  }
});

// ── GET /marktspiegel/:id ────────────────────────────────────────────────────
router.get("/marktspiegel/:id", lezen, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params["id"]), 10);
    if (!Number.isInteger(id) || id <= 0) {
      return void res.status(400).json({ error: "Ongeldig id" });
    }
    const [rij] = await db
      .select()
      .from(marktspiegelOnderzoekenTable)
      .where(eq(marktspiegelOnderzoekenTable.id, id))
      .limit(1);
    if (!rij) return void res.status(404).json({ error: "Onderzoek niet gevonden" });
    res.json(mapOnderzoek(rij));
  } catch (err) {
    req.log.error({ err }, "marktspiegel-onderzoek ophalen mislukt");
    res.status(500).json({ error: "Fout bij ophalen marktspiegel-onderzoek" });
  }
});

// ── POST /marktspiegel ───────────────────────────────────────────────────────
// Maakt een onderzoek aan en start het asynchroon. Alleen op aanvraag.
router.post("/marktspiegel", starten, async (req, res): Promise<void> => {
  try {
    if (!heeftGateway()) {
      return void res.status(503).json({ error: "AI niet geconfigureerd — de marktspiegel is niet beschikbaar" });
    }
    const b = req.body as Record<string, unknown>;
    const onderwerpType = typeof b.onderwerp_type === "string" ? b.onderwerp_type.trim() : "";
    const aanleidingRuw = typeof b.aanleiding === "string" ? b.aanleiding.trim() : "handmatig";
    const aanleiding = ["afloop", "prijsverhoging", "handmatig"].includes(aanleidingRuw) ? aanleidingRuw : "handmatig";

    if (!["prijsafspraak", "financieel_contract", "vrij"].includes(onderwerpType)) {
      return void res.status(422).json({ error: "onderwerp_type moet 'prijsafspraak', 'financieel_contract' of 'vrij' zijn" });
    }

    let onderwerpId: number | null = null;
    let vraag = "";

    if (onderwerpType === "vrij") {
      vraag = typeof b.vraag === "string" ? b.vraag.trim() : "";
      if (!vraag) return void res.status(422).json({ error: "Bij een vrije vraag is 'vraag' verplicht" });
    } else {
      const idRuw = Number(b.onderwerp_id);
      if (!Number.isInteger(idRuw) || idRuw <= 0) {
        return void res.status(422).json({ error: "onderwerp_id is verplicht bij dit onderwerp_type" });
      }
      onderwerpId = idRuw;
      if (onderwerpType === "prijsafspraak") {
        if (!(await prijsafspraakBestaat(onderwerpId))) {
          return void res.status(422).json({ error: "Onbekende prijsafspraak" });
        }
        vraag = `Marktspiegel voor prijsafspraak #${onderwerpId}`;
      } else {
        if (!(await financieelContractBestaat(onderwerpId))) {
          return void res.status(422).json({ error: "Onbekend financieel contract" });
        }
        vraag = `Marktspiegel voor financieel contract #${onderwerpId}`;
      }
    }

    const [rij] = await db
      .insert(marktspiegelOnderzoekenTable)
      .values({
        onderwerpType,
        onderwerpId,
        vraag,
        status: "bezig",
        aangevraagdDoor: req.session?.userId ?? null,
        aanleiding,
      })
      .returning();
    if (!rij) return void res.status(500).json({ error: "Onderzoek kon niet worden aangemaakt" });

    // Fire-and-forget: de AI-run draait op de achtergrond; de client polt op status.
    startMarktspiegelAsync(rij.id);

    res.status(201).json(mapOnderzoek(rij));
  } catch (err) {
    req.log.error({ err }, "marktspiegel-onderzoek starten mislukt");
    res.status(500).json({ error: "Fout bij starten marktspiegel-onderzoek" });
  }
});

export default router;
