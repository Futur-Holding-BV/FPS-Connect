---
name: Calculatie-AI eigen cijfers
description: Spelregels voor de calculatie-analyse die aan FPS' eigen prijsdata toetst.
---
De senior-calculatoranalyse toetst aan eigen FPS-cijfers (eenheidsprijs-norm, prijshistorie, werkelijk betaald, opslagenpraktijk) via deterministische contextblokken.

**Regels:** mediaan, nooit gemiddelde; onder 5 waarnemingen → blok weglaten mét melding; geen aantoonbare koppeling of ambigue bibliotheekmatch → fail closed en dát melden, nooit gissen; "werkelijk betaald" alleen uit inkoopfacturen met status verwerkt/betaald; de analyseprompt mag geen vaste bedragen of percentages als FPS-norm bevatten.

**Why:** het waardevolle advies zit in de eigen prijshistorie; een verzonnen of vervuilde vergelijking (verkoopfacturen, dubbele bibliotheekregels) is erger dan geen advies.

**How to apply:** nieuwe prijsbronnen als extra blok in de bestaande contextbouwer, nooit een tweede prijzenbibliotheek; matching = normtijd-code eerst, dan genormaliseerde omschrijving+eenheid (meerdere kandidaten = ambigu).
