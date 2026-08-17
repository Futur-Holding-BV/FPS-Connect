// Smoketest-serviceaccount aanmaken/bijwerken (idempotent) — voor de
// post-deploy smoketest in .github/workflows/deploy.yml.
//
// Draaien op de productieserver (VPS, /opt/fps-one):
//   docker compose -f deploy/docker-compose.production.yml \
//     --env-file deploy/.env.production \
//     run --rm -T -e SMOKETEST_PASSWORD='<wachtwoord>' migrate \
//     pnpm --filter @workspace/db run smoketest-account
//
// Of lokaal/dev: SMOKETEST_PASSWORD='...' pnpm --filter @workspace/db run smoketest-account
//
// Het account:
// - e-mail: smoketest@fps-brandpreventie.nl (echt domein; fps.local wordt
//   door het testadres-filter geblokkeerd — mail wordt sowieso nooit
//   verstuurd omdat dit account nergens mail ontvangt)
// - rol hoofdbeheerder: NIET onderhandelbaar voor de smoketest — de
//   governance-engine merkt DELETE /gebouwen/:id als "kritiek" en laat dat
//   uitsluitend voor hoofdbeheerders door. De bevoegdheden-matrix wordt
//   desondanks minimaal gezet (gebruikers:1, gebouwen:4) als documentatie
//   van wat de smoketest werkelijk nodig heeft.
// - twee_factor_vrijgesteld=true: de smoketest kan geen TOTP-stap doorlopen;
//   de loginroute geeft dit account direct een volledige sessie.
//
// Wachtwoord komt UITSLUITEND uit de omgevingsvariabele SMOKETEST_PASSWORD
// (minimaal 16 tekens) en staat dus nooit in de repo.
import bcrypt from "bcryptjs";
import pg from "pg";

// Vaste identiteit — bewust NIET via env te overschrijven: anders zou een
// configuratiefout een willekeurig bestaand account tot 2FA-vrijgestelde
// hoofdbeheerder kunnen promoveren.
const EMAIL = "smoketest@fps-brandpreventie.nl";
const WACHTWOORD = process.env.SMOKETEST_PASSWORD;

if (!process.env.DATABASE_URL) {
  console.error("[smoketest-account] DATABASE_URL ontbreekt; stoppen.");
  process.exit(1);
}
if (!WACHTWOORD || WACHTWOORD.length < 16) {
  console.error(
    "[smoketest-account] SMOKETEST_PASSWORD ontbreekt of is korter dan 16 tekens; stoppen.",
  );
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const hash = await bcrypt.hash(WACHTWOORD, 10);
  const bevoegdheden = JSON.stringify({ gebruikers: 1, gebouwen: 4 });

  const bestaand = await pool.query("SELECT id FROM gebruikers WHERE email = $1", [EMAIL]);
  let id;
  if (bestaand.rows.length > 0) {
    id = bestaand.rows[0].id;
    await pool.query(
      `UPDATE gebruikers SET
         naam = 'Smoketest (deploy)',
         rol = 'hoofdbeheerder',
         wachtwoord = $2,
         totp_secret = NULL,
         twee_factor_ingeschakeld = false,
         twee_factor_vrijgesteld = true,
         actief = true,
         gearchiveerd = false,
         bevoegdheden = $3::jsonb,
         initialen = 'ST'
       WHERE id = $1`,
      [id, hash, bevoegdheden],
    );
    console.log(`[smoketest-account] Bestaand account bijgewerkt (id ${id}).`);
  } else {
    const res = await pool.query(
      `INSERT INTO gebruikers
         (naam, email, rol, wachtwoord, totp_secret, twee_factor_ingeschakeld,
          twee_factor_vrijgesteld, actief, gearchiveerd, bevoegdheden, initialen,
          uitnodiging_status)
       VALUES ('Smoketest (deploy)', $1, 'hoofdbeheerder', $2, NULL, false,
               true, true, false, $3::jsonb, 'ST', 'geaccepteerd')
       RETURNING id`,
      [EMAIL, hash, bevoegdheden],
    );
    id = res.rows[0].id;
    console.log(`[smoketest-account] Nieuw account aangemaakt (id ${id}).`);
  }
  console.log(`[smoketest-account] E-mail: ${EMAIL}`);
  console.log(
    "[smoketest-account] Zet SMOKETEST_EMAIL en SMOKETEST_PASSWORD als GitHub Actions secrets.",
  );
} finally {
  await pool.end();
}
