-- SIGNALEN_LINKS_01
-- Herstel bestaande open werkbakitems. Nieuwe bewakingsitems worden door
-- syncBron actueel gehouden; overwerkitems zijn gebeurtenisgestuurd en worden
-- daarom hier eenmalig via overwerk_slot -> project -> opdracht gekoppeld.

WITH overwerk_koppelingen AS (
  SELECT
    wi.id AS werkbak_id,
    (
      SELECT o.id
      FROM opdrachten o
      JOIN overwerk_sloten os ON os.project_id = o.project_id
      WHERE os.id = wi.herkomst_id
      ORDER BY (o.status = 'actief') DESC, o.id DESC
      LIMIT 1
    ) AS opdracht_id
  FROM werkbak_items wi
  WHERE wi.status = 'open'
    AND wi.bron = 'overwerk_toestemming'
    AND wi.herkomst_type = 'overwerk_slot'
)
UPDATE werkbak_items wi
SET actie_pad = '/opdrachten/' || k.opdracht_id::text,
    bijgewerkt_op = now()
FROM overwerk_koppelingen k
WHERE wi.id = k.werkbak_id
  AND k.opdracht_id IS NOT NULL;

-- Historische aanvragen zonder opdrachtkoppeling hebben geen concreet dossier
-- waar de gevraagde handeling kan worden uitgevoerd. Sluit alleen die
-- onoplosbare oude items en leg de systeemreden in de omschrijving vast.
UPDATE werkbak_items wi
SET status = 'afgehandeld',
    omschrijving = concat_ws(
      ' ',
      NULLIF(btrim(wi.omschrijving), ''),
      '[Systeem: gesloten omdat het historische overwerkverzoek geen gekoppelde opdracht heeft.]'
    ),
    afgehandeld_op = now(),
    bijgewerkt_op = now()
WHERE wi.status = 'open'
  AND wi.bron = 'overwerk_toestemming'
  AND wi.herkomst_type = 'overwerk_slot'
  AND NOT EXISTS (
    SELECT 1
    FROM overwerk_sloten os
    JOIN opdrachten o ON o.project_id = os.project_id
    WHERE os.id = wi.herkomst_id
  );

UPDATE werkbak_items
SET actie_pad = '/magazijn/artikelen/' || herkomst_id::text,
    bijgewerkt_op = now()
WHERE status = 'open'
  AND bron = 'ai_magazijn_bestelsuggestie'
  AND herkomst_id IS NOT NULL;

UPDATE werkbak_items
SET actie_pad = '/personeel/' || herkomst_id::text,
    bijgewerkt_op = now()
WHERE status = 'open'
  AND bron = 'cruciale_deadline_hrm'
  AND herkomst_id IS NOT NULL;

UPDATE werkbak_items
SET actie_pad = '/opname/' || herkomst_id::text,
    bijgewerkt_op = now()
WHERE status = 'open'
  AND bron = 'opname_zonder_calculatie'
  AND herkomst_id IS NOT NULL;

UPDATE werkbak_items
SET actie_pad = '/modules/calculatie/' || herkomst_id::text,
    bijgewerkt_op = now()
WHERE status = 'open'
  AND bron = 'calculatie_zonder_offerte'
  AND herkomst_type = 'calculatie'
  AND herkomst_id IS NOT NULL;

-- Legacy calculaties kunnen niet aan offertes.calculatie_id worden gekoppeld
-- en hebben geen inhoudelijk juiste detailhandeling. Sluit die oude,
-- onoplosbare signalen in plaats van ze naar een misleidend pad te sturen.
UPDATE werkbak_items
SET status = 'afgehandeld',
    afgehandeld_op = now(),
    bijgewerkt_op = now()
WHERE status = 'open'
  AND bron = 'calculatie_zonder_offerte'
  AND herkomst_type = 'calculatie_legacy';