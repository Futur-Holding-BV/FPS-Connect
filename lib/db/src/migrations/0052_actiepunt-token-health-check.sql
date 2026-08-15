-- ACTIEPUNT — handmatige GitHub-wijziging: de teruggevallen commit aan
-- .github/workflows/token-health-check.yml is uit de pushwachtrij gehaald
-- (PAT heeft bewust geen workflow-scope). René past de instructieregels
-- met de hand aan op GitHub. Idempotent op titel.
WITH basis AS (
  SELECT COALESCE(MAX(volgorde), 0) AS max_v FROM actiepunten
)
INSERT INTO actiepunten (titel, omschrijving, categorie, status, volgorde, bijgewerkt_op)
SELECT
  'token-health-check.yml met de hand aanpassen op GitHub',
  'De agent kan dit bestand niet pushen (PAT bewust zonder workflow-scope). Pas op GitHub aan: .github/workflows/token-health-check.yml — drie regels.' || E'\n\n'
  || 'REGEL 145 — OUD: 2. Maak een nieuw PAT aan (of verleng het bestaande) met ''Contents: Write'' scope op de fps-one repo' || E'\n'
  || 'NIEUW: 2. Maak een nieuw PAT aan (of verleng het bestaande) met ''Contents: Write'' scope op de Futur-Holding-BV/FPS-Connect repo' || E'\n\n'
  || 'REGEL 148 — OUD: 5. Update GitHub: ga naar github.com/vinkrene-jpg/fps-one > Settings > Secrets and variables > Actions > GITHUB_TOKEN_PUSH (vervang de waarde)' || E'\n'
  || 'NIEUW: 5. Update GitHub: ga naar github.com/Futur-Holding-BV/FPS-Connect > Settings > Secrets and variables > Actions > FPS_PUSH_TOKEN (vervang de waarde)' || E'\n\n'
  || 'REGEL 162 — OUD: 2. Verleng het bestaande token of maak een nieuw PAT aan met ''Contents: Write'' scope op de fps-one repo' || E'\n'
  || 'NIEUW: 2. Verleng het bestaande token of maak een nieuw PAT aan met ''Contents: Write'' scope op de Futur-Holding-BV/FPS-Connect repo' || E'\n\n'
  || 'Eventueel vierde regel (consistentie, regel 165): "4. Update GitHub Actions Secrets: GITHUB_TOKEN_PUSH" — het Actions-secret heet inmiddels FPS_PUSH_TOKEN.',
  'platform', 'open', basis.max_v + 10, NOW()
FROM basis
WHERE NOT EXISTS (
  SELECT 1 FROM actiepunten a
  WHERE a.titel = 'token-health-check.yml met de hand aanpassen op GitHub'
);
