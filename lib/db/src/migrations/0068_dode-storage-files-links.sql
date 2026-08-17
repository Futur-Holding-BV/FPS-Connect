-- DEFECT: links met /api/storage/files?path=... wijzen naar een route die
-- nooit heeft bestaan (routes/storage.ts kent alleen public-objects, objects
-- en thumbnails). Opgeslagen links omzetten naar de bestaande, beveiligde
-- route /api/storage/objects/<subPath> (zelfde toegangscontrole als MERK_01).
-- De subpaden zijn server-side gegenereerd met veilige tekens; alleen %2F
-- (ge-encodede slash) komt in de ge-encodede padwaarden voor. De vervanging
-- gebeurt uitsluitend op URL-velden, nooit op andere metadata (bestandsnamen
-- e.d. blijven byte-identiek).

-- Facturen (dagelijks gebruikt): pdf_url van de factuurstroom.
UPDATE facturen
   SET pdf_url = replace(replace(pdf_url, '/api/storage/files?path=', '/api/storage/objects/'), '%2F', '/')
 WHERE pdf_url LIKE '/api/storage/files?path=%';

-- Werkgeverslogo (raakt calculatieprint + merkenkast).
UPDATE werkgevers
   SET logo_url = replace(replace(logo_url, '/api/storage/files?path=', '/api/storage/objects/'), '%2F', '/')
 WHERE logo_url LIKE '/api/storage/files?path=%';

-- Aanvraagstroom: bijlagen-jsonb [{naam,url}] — alleen het url-veld per element.
UPDATE aanvraag_voorstellen av
   SET bijlagen = (
     SELECT jsonb_agg(
       CASE WHEN elem->>'url' LIKE '/api/storage/files?path=%'
            THEN jsonb_set(elem, '{url}',
                   to_jsonb(replace(replace(elem->>'url', '/api/storage/files?path=', '/api/storage/objects/'), '%2F', '/')))
            ELSE elem END)
     FROM jsonb_array_elements(av.bijlagen) elem)
 WHERE jsonb_typeof(av.bijlagen) = 'array'
   AND EXISTS (
     SELECT 1 FROM jsonb_array_elements(av.bijlagen) e
      WHERE e->>'url' LIKE '/api/storage/files?path=%');

-- Offerte-secties: fotos-jsonb — alleen url- en thumbnail_url-velden per element.
UPDATE offerte_secties os
   SET fotos = (
     SELECT jsonb_agg(
       jsonb_set(
         CASE WHEN elem->>'url' LIKE '/api/storage/files?path=%'
              THEN jsonb_set(elem, '{url}',
                     to_jsonb(replace(replace(elem->>'url', '/api/storage/files?path=', '/api/storage/objects/'), '%2F', '/')))
              ELSE elem END,
         '{thumbnail_url}',
         CASE WHEN elem->>'thumbnail_url' LIKE '/api/storage/files?path=%'
              THEN to_jsonb(replace(replace(elem->>'thumbnail_url', '/api/storage/files?path=', '/api/storage/objects/'), '%2F', '/'))
              ELSE COALESCE(elem->'thumbnail_url', 'null'::jsonb) END,
         true))
     FROM jsonb_array_elements(os.fotos) elem)
 WHERE jsonb_typeof(os.fotos) = 'array'
   AND EXISTS (
     SELECT 1 FROM jsonb_array_elements(os.fotos) e
      WHERE e->>'url' LIKE '/api/storage/files?path=%'
         OR e->>'thumbnail_url' LIKE '/api/storage/files?path=%');
