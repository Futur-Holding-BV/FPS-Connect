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
        betaalbatch_actief: false,
        ai_leren_van_correcties_ingeschakeld: true,
        ai_kostendrempel_eur: null,
        prijsafwijking_marge_pct: 2,
        prijsafspraak_bewaking_dagen: 60,
        offerte_reactie_bewaking_dagen: 7,
        offerte_bekeken_bewaking_dagen: 5,
        opname_calculatie_bewaking_dagen: 14,
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
      betaalbatch_actief: instelling.betaalbatchActief,
      ai_leren_van_correcties_ingeschakeld: instelling.aiLerenVanCorrectiesIngeschakeld,
      ai_kostendrempel_eur: instelling.aiKostendrempelEur != null ? parseFloat(instelling.aiKostendrempelEur) : null,
      ai_maandelijkse_export_dag: instelling.aiMaandelijkseExportDag,
      ai_maandelijkse_export_email: instelling.aiMaandelijkseExportEmail,
      aanvraag_reactietermijn_uren: instelling.aanvraagReactietermijnUren,
      aanvraag_oppak_termijn_uren: instelling.aanvraagOppakTermijnUren,
      prijsafwijking_marge_pct: instelling.prijsafwijkingMargePct,
      prijsafspraak_bewaking_dagen: instelling.prijsafspraakBewakingDagen,
      offerte_reactie_bewaking_dagen: instelling.offerteReactieBewakingDagen,
      offerte_bekeken_bewaking_dagen: instelling.offerteBekekenBewakingDagen,
      opname_calculatie_bewaking_dagen: instelling.opnameCalculatieBewakingDagen,
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
        betaalbatch_actief,
        ai_leren_van_correcties_ingeschakeld,
        ai_kostendrempel_eur,
        ai_maandelijkse_export_dag,
        ai_maandelijkse_export_email,
        aanvraag_reactietermijn_uren,
        aanvraag_oppak_termijn_uren,
        prijsafwijking_marge_pct,
        prijsafspraak_bewaking_dagen,
        offerte_reactie_bewaking_dagen,
        offerte_bekeken_bewaking_dagen,
        opname_calculatie_bewaking_dagen,
      } = req.body as {
          support_email?: string;
          support_telefoon?: string;
          support_website?: string;
          extra_disclaimer?: string;
          opdrachtbevestiging_auto_verzenden?: boolean;
          moments_verjaardag_ingeschakeld?: boolean;
          heatmap_tracking_ingeschakeld?: boolean;
          betaalbatch_actief?: boolean;
          ai_leren_van_correcties_ingeschakeld?: boolean;
          ai_kostendrempel_eur?: number | null;
          ai_maandelijkse_export_dag?: number | null;
          ai_maandelijkse_export_email?: string | null;
          aanvraag_reactietermijn_uren?: number;
          aanvraag_oppak_termijn_uren?: number;
          prijsafwijking_marge_pct?: number;
          prijsafspraak_bewaking_dagen?: number;
          offerte_reactie_bewaking_dagen?: number;
          offerte_bekeken_bewaking_dagen?: number;
          opname_calculatie_bewaking_dagen?: number;
        };
      const gebruikerId = req.session.userId!;

      // ADMINISTRATIE_02 §3 — de akkoord-schakelaar voor de betaalbatch mag
      // alleen door de hoofdbeheerder worden omgezet (uitdrukkelijk akkoord).
      if (typeof betaalbatch_actief === "boolean" && !req.permissies?.isHoofdbeheerder) {
        res.status(403).json({ error: "Alleen de hoofdbeheerder kan de betaalbatch-schakelaar omzetten" });
        return;
      }

      const [bestaand] = await db
        .select({
          id: appInstellingenTable.id,
          aiKostendrempelEur: appInstellingenTable.aiKostendrempelEur,
          aiDrempelMeldingGestuurdMaand: appInstellingenTable.aiDrempelMeldingGestuurdMaand,
        })
        .from(appInstellingenTable)
        .orderBy(appInstellingenTable.id)
        .limit(1);

      // Patch-semantiek: alleen meegestuurde velden bijwerken (lege string = leegmaken),
      // zodat een drempel-only update de supportgegevens niet stilzwijgend wist.
      const payload: Record<string, unknown> = {
        ...(support_email !== undefined ? { supportEmail: support_email || null } : {}),
        ...(support_telefoon !== undefined ? { supportTelefoon: support_telefoon || null } : {}),
        ...(support_website !== undefined ? { supportWebsite: support_website || null } : {}),
        ...(extra_disclaimer !== undefined ? { extraDisclaimer: extra_disclaimer || null } : {}),
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
        // ADMINISTRATIE_02 §3 — akkoord-schakelaar crediteuren-betaalbatch.
        ...(typeof betaalbatch_actief === "boolean"
          ? { betaalbatchActief: betaalbatch_actief }
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
      if (prijsafwijking_marge_pct !== undefined) {
        const marge = Number(prijsafwijking_marge_pct);
        if (!Number.isFinite(marge) || marge < 0 || marge > 100) {
          return void res.status(400).json({ error: "prijsafwijking_marge_pct moet tussen 0 en 100 liggen" });
        }
        payload.prijsafwijkingMargePct = marge;
      }
      if (prijsafspraak_bewaking_dagen !== undefined) {
        const dagen = Math.round(Number(prijsafspraak_bewaking_dagen));
        if (!Number.isFinite(dagen) || dagen < 1 || dagen > 365) {
          return void res.status(400).json({ error: "prijsafspraak_bewaking_dagen moet tussen 1 en 365 liggen" });
        }
        payload.prijsafspraakBewakingDagen = dagen;
      }
      if (offerte_reactie_bewaking_dagen !== undefined) {
        const dagen = Math.round(Number(offerte_reactie_bewaking_dagen));
        if (!Number.isFinite(dagen) || dagen < 1 || dagen > 365) {
          return void res.status(400).json({ error: "offerte_reactie_bewaking_dagen moet tussen 1 en 365 liggen" });
        }
        payload.offerteReactieBewakingDagen = dagen;
      }
      if (offerte_bekeken_bewaking_dagen !== undefined) {
        const dagen = Math.round(Number(offerte_bekeken_bewaking_dagen));
        if (!Number.isFinite(dagen) || dagen < 1 || dagen > 365) {
          return void res.status(400).json({ error: "offerte_bekeken_bewaking_dagen moet tussen 1 en 365 liggen" });
        }
        payload.offerteBekekenBewakingDagen = dagen;
      }
      if (opname_calculatie_bewaking_dagen !== undefined) {
        const dagen = Math.round(Number(opname_calculatie_bewaking_dagen));
        if (!Number.isFinite(dagen) || dagen < 1 || dagen > 365) {
          return void res.status(400).json({ error: "opname_calculatie_bewaking_dagen moet tussen 1 en 365 liggen" });
        }
        payload.opnameCalculatieBewakingDagen = dagen;
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
        betaalbatch_actief: result.betaalbatchActief,
        ai_leren_van_correcties_ingeschakeld: result.aiLerenVanCorrectiesIngeschakeld,
        ai_kostendrempel_eur: result.aiKostendrempelEur != null ? parseFloat(result.aiKostendrempelEur) : null,
        ai_maandelijkse_export_dag: result.aiMaandelijkseExportDag,
        ai_maandelijkse_export_email: result.aiMaandelijkseExportEmail,
        aanvraag_reactietermijn_uren: result.aanvraagReactietermijnUren,
        aanvraag_oppak_termijn_uren: result.aanvraagOppakTermijnUren,
        prijsafwijking_marge_pct: result.prijsafwijkingMargePct,
        prijsafspraak_bewaking_dagen: result.prijsafspraakBewakingDagen,
        offerte_reactie_bewaking_dagen: result.offerteReactieBewakingDagen,
        offerte_bekeken_bewaking_dagen: result.offerteBekekenBewakingDagen,
        opname_calculatie_bewaking_dagen: result.opnameCalculatieBewakingDagen,
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
