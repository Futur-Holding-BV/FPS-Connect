-- opnames.nummer staat als .unique() in het drizzle-schema maar de constraint
-- ontbrak in de database (bron van de interactieve drizzle-push prompt die de
-- post-merge van taak #890 liet vastlopen). Additief en veilig: nummer komt
-- uit sequence seq_nummer_m, dus geen duplicaten mogelijk/aanwezig.
ALTER TABLE opnames ADD CONSTRAINT opnames_nummer_unique UNIQUE (nummer);
