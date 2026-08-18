---
name: Calculatie-rekenkern (CALC_KERN_01)
description: Eén gedeelde rekenkern voor alle calculatiebedragen; geldvelden exact numeric(12,2); regels voor nieuwe reken- of schrijfpaden.
---
# Calculatie-rekenkern

- `@workspace/calculatie` (lib/calculatie) is dé enige plek waar calculatiebedragen worden berekend — server (mod-calculatie.ts wrapper `berekenTotalen`, geeft ook `kern` terug), client (detail.tsx/print.tsx/import.tsx) en offerte-aanmaak gebruiken 'm allemaal. Nooit een nieuwe bedrag-`reduce` of formuleketen toevoegen; altijd de kern aanroepen.
- Kern rekent in hele centen (integers); `naarCenten` is de enige afrondplek en rondt halve centen weg van nul, óók negatief — percentage-afronding gebruikt dezelfde tekensymmetrische regel. Subtotalen = som van per-regel afgeronde bedragen (natelbaar vanaf getoonde regelbedragen).
- **De kern negeert een opgeslagen `totaal`-veld**: alles komt uit hoeveelheid×tarief (+arbeid/OA). Regels die alleen een bedrag dragen (bv. ENK-correctieregel) moeten dat bedrag dus in `tarief` zetten (hoeveelheid 1). `mapRegel` retourneert het kern-berekende totaal, niet de kolom.
- Geldvelden zijn sinds migratie 0077 exact `numeric(12,2)` (drizzle `mode:"number"`); hoeveelheid/normtijd/mu blijven `real`. Nieuwe geldkolommen in de calculatiemodule altijd numeric(12,2).
- **Why:** float-rekenwerk + verspreide formulevarianten gaven onnatelbare/afwijkende totalen tussen detail, print en offerte.
- Natellingen Cityflat (€16.330,60) en De Grundel (€294.452,65) staan als skip-tests in lib/calculatie/src/kern.test.ts tot de beheerder de volledige regelbestanden aanlevert.
