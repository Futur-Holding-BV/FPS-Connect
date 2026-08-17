-- Gerichte arbeidscontract-extractie: contractvoorwaarden die tot nu toe
-- nergens landden, krijgen een vaste plek op het dienstverband zodat de
-- bestaande contractbewaking en het personeelsdossier er op kunnen bouwen.
-- Alle kolommen additief en nullable: bestaande rijen blijven ongewijzigd.
ALTER TABLE arbeidsovereenkomsten
  ADD COLUMN IF NOT EXISTS salaris_eenheid text,
  ADD COLUMN IF NOT EXISTS uren_min_per_week real,
  ADD COLUMN IF NOT EXISTS uren_max_per_week real,
  ADD COLUMN IF NOT EXISTS opzegtermijn text,
  ADD COLUMN IF NOT EXISTS aanzegtermijn text,
  ADD COLUMN IF NOT EXISTS reiskostenvergoeding text,
  ADD COLUMN IF NOT EXISTS concurrentiebeding boolean,
  ADD COLUMN IF NOT EXISTS relatiebeding boolean;
