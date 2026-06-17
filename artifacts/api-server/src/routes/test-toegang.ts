// TIJDELIJKE TESTTOEGANG — directe-login-links voor de drie testaccounts.
//
// Doel: tijdens een desktoptest kunnen testers via één klikbare link direct
// inloggen, zonder wachtwoord of tweestapsverificatie. Op uitdrukkelijk verzoek
// van de gebruiker; toegang wordt ná de test weer dichtgezet.
//
// VERWIJDEREN NA DE TEST (in één keer terug te draaien):
//   1. dit bestand verwijderen (routes/test-toegang.ts)
//   2. de import + router.use in routes/index.ts verwijderen
//
// Veiligheidsnet: de route is volledig inert in productie (NODE_ENV=production
// geeft 404), werkt alleen voor de drie expliciet toegestane testaccounts en
// gebruikt onraadbare tokens.
import { Router } from "express";
import { db, gebruikersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// Onraadbaar token -> e-mail van het testaccount. Alleen deze drie accounts.
const TEST_TOKENS: Record<string, string> = {
  a766ac1ff19cf94802e2769cc5cb78389fe2: "beheer@fps-test.nl",
  "1f38870a25730b35ec70f7942c685ad496a4": "monteur@fps-test.nl",
  eef793c6061a79b80496d515caf687a17473: "tessa@fps-test.nl",
};

// Alleen een relatief pad binnen de app toestaan (geen open redirect / geen
// protocol-relatieve //host, geen backslash die door clients als slash wordt
// genormaliseerd, geen control-chars). Standaard naar de startpagina.
function veiligVervolgPad(next: unknown): string {
  // eslint-disable-next-line no-control-regex
  const onveilig = /[\\\x00-\x1f\x7f]/;
  if (typeof next === "string" && /^\/(?!\/)/.test(next) && !onveilig.test(next)) {
    return next;
  }
  return "/";
}

// GET /api/auth/test-toegang/:token[?next=/voorzieningen/14]
router.get("/auth/test-toegang/:token", async (req, res) => {
  if (process.env["NODE_ENV"] === "production") {
    res.status(404).send("Niet gevonden");
    return;
  }
  try {
    const email = TEST_TOKENS[req.params.token];
    if (!email) {
      res.status(404).send("Onbekende of verlopen testlink.");
      return;
    }
    const [g] = await db
      .select()
      .from(gebruikersTable)
      .where(eq(gebruikersTable.email, email));
    if (!g || !g.actief) {
      res.status(403).send("Testaccount is niet beschikbaar.");
      return;
    }
    delete req.session.pendingUserId;
    delete req.session.pendingSecret;
    req.session.userId = g.id;
    req.session.rol = g.rol;
    const vervolg = veiligVervolgPad(req.query["next"]);
    req.session.save((err) => {
      if (err) {
        req.log.error(err);
        res.status(500).send("Inloggen mislukt, probeer opnieuw.");
        return;
      }
      res.redirect(vervolg);
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).send("Interne serverfout");
  }
});

export default router;
