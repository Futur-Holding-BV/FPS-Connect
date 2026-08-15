-- KLANTLOOS_01 fase 2 — Connect kent geen externe gebruikers meer.
-- Alle resterende klantaccounts worden GEDEACTIVEERD (niet verwijderd),
-- zodat historie/koppelingen intact blijven maar inloggen onmogelijk is.
-- De rol-kolom blijft staan als historisch gegeven.
UPDATE gebruikers SET actief = false WHERE rol = 'klant' AND actief = true;
