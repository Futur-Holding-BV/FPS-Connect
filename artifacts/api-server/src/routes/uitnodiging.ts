import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, gebruikersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const TALEN = ["nl", "en", "de", "fr", "ar", "tr"] as const;

// Een account dat al eerder succesvol heeft ingelogd (laatst_online gezet) of
// 2FA al heeft ingeschakeld, is aantoonbaar in gebruik. Een activatielink mag
// zo'n account nooit heropenen — ook niet als uitnodigingStatus om historische
// redenen niet op "geaccepteerd" staat.
const AL_IN_GEBRUIK_MELDING =
  "Dit account is al in gebruik — log gewoon in via de inlogpagina.";

function isAccountAlInGebruik(g: {
  uitnodigingStatus: string;
  laatstOnline: Date | null;
  tweeFactorIngeschakeld: boolean;
}): boolean {
  return (
    g.uitnodigingStatus === "geaccepteerd" ||
    g.laatstOnline !== null ||
    g.tweeFactorIngeschakeld
  );
}

// GET /uitnodiging/:token — token verifiëren en markeren als geopend (publiek)
router.get("/uitnodiging/:token", async (req, res): Promise<void> => {
  try {
    const { token } = req.params;
    const [g] = await db
      .select()
      .from(gebruikersTable)
      .where(eq(gebruikersTable.uitnodigingToken, token));

    if (!g) {
      return void res.status(404).json({ error: "Uitnodiging niet gevonden" });
    }
    if (isAccountAlInGebruik(g)) {
      return void res.status(409).json({ error: AL_IN_GEBRUIK_MELDING });
    }
    if (g.uitnodigingVerlooptOp && g.uitnodigingVerlooptOp < new Date()) {
      return void res.status(410).json({ error: "Uitnodiging verlopen" });
    }

    if (!g.uitnodigingGeopendOp) {
      await db
        .update(gebruikersTable)
        .set({ uitnodigingGeopendOp: new Date() })
        .where(eq(gebruikersTable.id, g.id));
    }

    res.json({ id: g.id, naam: g.naam, email: g.email });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /uitnodiging/:token/activeren — wachtwoord + taal instellen, 2FA-setup starten (publiek)
router.post("/uitnodiging/:token/activeren", async (req, res): Promise<void> => {
  try {
    const { token } = req.params;
    const { wachtwoord, taal } = req.body ?? {};

    if (!wachtwoord || !taal) {
      return void res.status(400).json({ error: "Wachtwoord en taal zijn verplicht" });
    }
    if (String(wachtwoord).length < 8) {
      return void res.status(400).json({ error: "Wachtwoord moet minimaal 8 tekens bevatten" });
    }
    if (!TALEN.includes(taal as (typeof TALEN)[number])) {
      return void res.status(400).json({ error: "Ongeldige taalcode" });
    }

    const [g] = await db
      .select()
      .from(gebruikersTable)
      .where(eq(gebruikersTable.uitnodigingToken, token));

    if (!g) return void res.status(404).json({ error: "Uitnodiging niet gevonden" });
    if (isAccountAlInGebruik(g)) {
      return void res.status(409).json({ error: AL_IN_GEBRUIK_MELDING });
    }
    if (g.uitnodigingVerlooptOp && g.uitnodigingVerlooptOp < new Date()) {
      return void res.status(410).json({ error: "Uitnodiging verlopen" });
    }

    const gehasht = await bcrypt.hash(String(wachtwoord), 10);

    // Het wachtwoord wordt hier NIET direct opgeslagen: dat gebeurt pas ná een
    // geslaagde 2FA-bevestiging in /auth/2fa/activeren. Zo blijft het bestaande
    // wachtwoord intact wanneer iemand de activatie halverwege afbreekt.
    if (!g.uitnodigingGeopendOp) {
      await db
        .update(gebruikersTable)
        .set({ uitnodigingGeopendOp: new Date() })
        .where(eq(gebruikersTable.id, g.id));
    }

    req.session.pendingUserId = g.id;
    req.session.pendingWachtwoordHash = gehasht;
    req.session.pendingTaal = taal;
    req.session.pendingActivatieToken = token;
    delete req.session.userId;
    delete req.session.pendingSecret;

    res.json({ status: "setup_2fa" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
