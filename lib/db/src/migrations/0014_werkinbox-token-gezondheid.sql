-- Taak: "werkende Microsoft-koppeling" mag niet alleen "er staat een token-rij"
-- betekenen. Als de token-refresh faalt (wachtwoordwissel, ingetrokken consent)
-- markeren we dat hier, zodat beheerscherm en syncbewaking de koppeling direct
-- als niet-werkend zien. Wordt gewist zodra een refresh/herkoppeling slaagt.
ALTER TABLE werk_inbox_tokens ADD COLUMN IF NOT EXISTS refresh_mislukt_op timestamp;
