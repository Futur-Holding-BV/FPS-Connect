import { Router } from "express";
import { db, appInstellingenTable, gebruikersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";

const router = Router();

// GET /info/instellingen
router.get("/info/instellingen", async (req, res): Promise<void> => {
  try {
    const [instelling] = await db
      .select()
      .from(appInstellingenTable)
      .orderBy(appInstellingenTable.id)
      .limit(1);

    if (!instelling) {
      return void res.json({
        id: 0,
        support_email: null,
        support_telefoon: null,
        support_website: null,
        extra_disclaimer: null,
        opdrachtbevestiging_auto_verzenden: false,
        moments_verjaardag_ingeschakeld: true,
        heatmap_tracking_ingeschakeld: false,
        ai_leren_van_correcties_ingeschakeld: true,
        ai_kostendrempel_eur: null,
        bijgewerkt_op: new Date().toISOString(),
        bijgewerkt_door_id: null,
        bijgewerkt_door_naam: null,
      });
    }

    let bijgewerktDoorNaam: string | null = null;
    if (instelling.bijgewerktDoorId) {
      const [gebruiker] = await db
        .select({ naam: gebruikersTable.naam })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, instelling.bijgewerktDoorId));
      bijgewerktDoorNaam = gebruiker?.naam ?? null;
    }

    res.json({
      id: instelling.id,
      support_email: instelling.supportEmail,
      support_telefoon: instelling.supportTelefoon,
      support_website: instelling.supportWebsite,
      extra_disclaimer: instelling.extraDisclaimer,
      opdrachtbevestiging_auto_verzenden: instelling.opdrachtbevestigingAutoVerzenden,
      moments_verjaardag_ingeschakeld: instelling.momentsVerjaardagIngeschakeld,
      heatmap_tracking_ingeschakeld: instelling.heatmapTrackingIngeschakeld,
      ai_leren_van_correcties_ingeschakeld: instelling.aiLerenVanCorrectiesIngeschakeld,
      ai_kostendrempel_eur: instelling.aiKostendrempelEur != null ? parseFloat(instelling.aiKostendrempelEur) : null,
      ai_maandelijkse_export_dag: instelling.aiMaandelijkseExportDag,
      ai_maandelijkse_export_email: instelling.aiMaandelijkseExportEmail,
      aanvraag_reactietermijn_uren: instelling.aanvraagReactietermijnUren,
      aanvraag_oppak_termijn_uren: instelling.aanvraagOppakTermijnUren,
      bijgewerkt_op: instelling.bijgewerktOp.toISOString(),
      bijgewerkt_door_id: instelling.bijgewerktDoorId,
      bijgewerkt_door_naam: bijgewerktDoorNaam,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PUT /info/instellingen — systeem-bevoegdheid (niveau 1) of hoofdbeheerder
router.put(
  "/info/instellingen",
  requireBevoegdheid("systeem", 1),
  async (req, res): Promise<void> => {
    try {
      const {
        support_email,
        support_telefoon,
        support_website,
        extra_disclaimer,
        opdrachtbevestiging_auto_verzenden,
        moments_verjaardag_ingeschakeld,
        heatmap_tracking_ingeschakeld,
        ai_leren_van_correcties_ingeschakeld,
        ai_kostendrempel_eur,
        ai_maandelijkse_export_dag,
        ai_maandelijkse_export_email,
        aanvraag_reactietermijn_uren,
        aanvraag_oppak_termijn_uren,
      } = req.body as {
          support_email?: string;
          support_telefoon?: string;
          support_website?: string;
          extra_disclaimer?: string;
          opdrachtbevestiging_auto_verzenden?: boolean;
          moments_verjaardag_ingeschakeld?: boolean;
          heatmap_tracking_ingeschakeld?: boolean;
          ai_leren_van_correcties_ingeschakeld?: boolean;
          ai_kostendrempel_eur?: number | null;
          ai_maandelijkse_export_dag?: number | null;
          ai_maandelijkse_export_email?: string | null;
          aanvraag_reactietermijn_uren?: number;
          aanvraag_oppak_termijn_uren?: number;
        };
      const gebruikerId = req.session.userId!;

      const [bestaand] = await db
        .select({
          id: appInstellingenTable.id,
          aiKostendrempelEur: appInstellingenTable.aiKostendrempelEur,
          aiDrempelMeldingGestuurdMaand: appInstellingenTable.aiDrempelMeldingGestuurdMaand,
        })
        .from(appInstellingenTable)
        .orderBy(appInstellingenTable.id)
        .limit(1);

      const payload: Record<string, unknown> = {
        supportEmail: support_email ?? null,
        supportTelefoon: support_telefoon ?? null,
        supportWebsite: support_website ?? null,
        extraDisclaimer: extra_disclaimer ?? null,
        bijgewerktOp: new Date(),
        bijgewerktDoorId: gebruikerId,
        ...(typeof opdrachtbevestiging_auto_verzenden === "boolean"
          ? { opdrachtbevestigingAutoVerzenden: opdrachtbevestiging_auto_verzenden }
          : {}),
        ...(typeof moments_verjaardag_ingeschakeld === "boolean"
          ? { momentsVerjaardagIngeschakeld: moments_verjaardag_ingeschakeld }
          : {}),
        ...(typeof heatmap_tracking_ingeschakeld === "boolean"
          ? { heatmapTrackingIngeschakeld: heatmap_tracking_ingeschakeld }
          : {}),
        ...(typeof ai_leren_van_correcties_ingeschakeld === "boolean"
          ? { aiLerenVanCorrectiesIngeschakeld: ai_leren_van_correcties_ingeschakeld }
          : {}),
      };

      if (ai_kostendrempel_eur !== undefined) {
        const nieuweDrempel = ai_kostendrempel_eur != null ? String(ai_kostendrempel_eur) : null;
        payload.aiKostendrempelEur = nieuweDrempel;

        // Taak #212: Als de drempel wordt verlaagd of nieuw gezet, wissen we de melding-markering
        if (nieuweDrempel) {
          const nieuw = parseFloat(nieuweDrempel);
          if (bestaand?.aiKostendrempelEur) {
            const oud = parseFloat(bestaand.aiKostendrempelEur);
            if (nieuw < oud) {
              payload.aiDrempelMeldingGestuurdMaand = null;
            }
          } else {
            payload.aiDrempelMeldingGestuurdMaand = null;
          }
        }
      }

      if (ai_maandelijkse_export_dag !== undefined) {
        payload.aiMaandelijkseExportDag = ai_maandelijkse_export_dag;
      }
      if (ai_maandelijkse_export_email !== undefined) {
        payload.aiMaandelijkseExportEmail = ai_maandelijkse_export_email;
      }
      if (aanvraag_reactietermijn_uren !== undefined) {
        const uren = Math.round(Number(aanvraag_reactietermijn_uren));
        if (!Number.isFinite(uren) || uren < 1 || uren > 720) {
          return void res.status(400).json({ error: "aanvraag_reactietermijn_uren moet tussen 1 en 720 liggen" });
        }
        payload.aanvraagReactietermijnUren = uren;
      }
      if (aanvraag_oppak_termijn_uren !== undefined) {
        const uren = Math.round(Number(aanvraag_oppak_termijn_uren));
        if (!Number.isFinite(uren) || uren < 1 || uren > 720) {
          return void res.status(400).json({ error: "aanvraag_oppak_termijn_uren moet tussen 1 en 720 liggen" });
        }
        payload.aanvraagOppakTermijnUren = uren;
      }

      let result;
      if (bestaand) {
        const [updated] = await db
          .update(appInstellingenTable)
          .set(payload)
          .where(eq(appInstellingenTable.id, bestaand.id))
          .returning();
        result = updated;
      } else {
        const [inserted] = await db
          .insert(appInstellingenTable)
          .values(payload)
          .returning();
        result = inserted;
      }

      res.json({
        id: result.id,
        support_email: result.supportEmail,
        support_telefoon: result.supportTelefoon,
        support_website: result.supportWebsite,
        extra_disclaimer: result.extraDisclaimer,
        opdrachtbevestiging_auto_verzenden: result.opdrachtbevestigingAutoVerzenden,
        moments_verjaardag_ingeschakeld: result.momentsVerjaardagIngeschakeld,
        heatmap_tracking_ingeschakeld: result.heatmapTrackingIngeschakeld,
        ai_leren_van_correcties_ingeschakeld: result.aiLerenVanCorrectiesIngeschakeld,
        ai_kostendrempel_eur: result.aiKostendrempelEur != null ? parseFloat(result.aiKostendrempelEur) : null,
        ai_maandelijkse_export_dag: result.aiMaandelijkseExportDag,
        ai_maandelijkse_export_email: result.aiMaandelijkseExportEmail,
        aanvraag_reactietermijn_uren: result.aanvraagReactietermijnUren,
        aanvraag_oppak_termijn_uren: result.aanvraagOppakTermijnUren,
        bijgewerkt_op: result.bijgewerktOp.toISOString(),
        bijgewerkt_door_id: result.bijgewerktDoorId,
        bijgewerkt_door_naam: null,
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

export default router;
