Wat er nu staat (eerlijk beeld)
Goed gebouwd:
•	Week/2-weken/4-weken/maandweergave per medewerker
•	Dagdelen (ochtend/middag/volledig/tijdsloten)
•	Status-workflow concept→ingepland→bevestigd→uitgevoerd
•	Afwezigheid + bedrijfssluitingen
•	Koppeling aan project/gebouw/opdracht
•	Werkbegroting met resterende uren per opdracht
•	Meerwerk-tabel (rudimentair)
De kern van het probleem: het huidige planning_items schema heeft één FK medewerker_id — één monteur per item. Alles wat de klant vraagt, vereist fundamenteel een andere datastructuur.
________________________________________
Wat mist — gerangschikt op impact
1. Team-inplanning: meerdere monteurs op één project/dag
Huidig: medewerker_id = één persoon per item. Wil je 3 monteurs op één project, dan maak je 3 losse items aan — geen team-context.
Nodig: junction-tabel planning_item_medewerkers (item ↔ medewerker, met functie-rol op die toewijzing). Het planningitem beschrijft het werk; de medewerkers zijn de bezetting.
________________________________________
2. Projectdelen/fasering inplannen
Huidig: er bestaat geen "projectdeel" concept. Je kunt niet "fase 1 verdieping 2–4" apart inplannen met eigen uren-budget en eigen gereedmelding.
Nodig: tabel planning_project_fasen (gekoppeld aan opdracht, met eigen uren-budget, startdatum, einddatum, status). Planningitems koppelen aan een fase, niet alleen aan de opdracht.
________________________________________
3. Capaciteitsoverzicht — gaten zichtbaar maken
Huidig: er is geen capaciteitsgrafiek. Je ziet per medewerker items, maar niet "deze week heeft team X 48 beschikbare uren en 62 ingeplande uren → gat van 14 uur."
Nodig: capaciteitsberekening op basis van contracturen per medewerker (al aanwezig in HRM) minus afwezigheid minus al ingeplande uren. Tonen als een simpele rode/groene balk per week boven het rooster.
________________________________________
4. Functie-gestuurd inplannen
Huidig: je plant op naam. Er is geen "ik heb 2 Timmermannen nodig voor week 32."
Nodig: bij aanmaken van een planningitem: gewenste functies invoeren (bijv. 1× Uitvoerder + 2× Timmerman). Systeem suggereert beschikbare medewerkers met die functie die geen conflict hebben.
________________________________________
5. Budget-bewaking: meer/minder uren dan begroot
Huidig: de werkbegroting heeft hoofd_uren_begroot. Er is een "resterende uren" berekening, maar geen actieve kleurcodering of blokkade als je over budget inplant.
Nodig:
•	Bij elke inplanning: toon begroot vs ingepland in real-time
•	Bij overschrijding: oranje/rode indicator + expliciete bevestiging vereist
•	Meerwerk: aparte uren-categorie die tegen meerwerk_uren_begroot afzet
•	Minderwerk: als ingeplande uren < 80% van begroot → signalering
________________________________________
6. Meerwerk & minderwerk bijhouden
Huidig: planning_meerwerk heeft geen uren/bedrag velden. Het is een label, geen echte boekhouding.
Nodig: meerwerk krijgt eigen uren + omschrijving + goedkeuringsstatus (al dan niet via de governance-engine die al bestaat). Koppeling aan werkorder zodat nacalculatie klopt.
________________________________________
7. Bewoner-coördinatie combineren
Huidig: niets. Planningitems hebben geen bewoner-context.
Nodig: per planningitem: contactpersoon bewoner/VvE (naam + telefoon + e-mail), melding-status ("bewoner geïnformeerd op [datum]"), voorkeurstijden. Optioneel: automatische e-mail/SMS bij inplannen of wijziging.
________________________________________
Architecturele impact samengevat
Wat	Huidige situatie	Benodigde wijziging
Meerdere monteurs per item	Niet mogelijk	Junction-tabel + team-view in UI
Projectdelen	Niet aanwezig	Nieuwe tabel, koppeling aan items
Capaciteitsgaten	Niet zichtbaar	Berekening op contracturen + afwezigheid
Functie-gestuurd	Niet aanwezig	Functie-filter op beschikbaarheid
Budget-bewaking	Passief	Actieve drempel + UI-signalering
Meerwerk uren	Tabel zonder inhoud	Uren + bedrag + goedkeuring
Bewoners	Niet aanwezig	Contactkoppeling per item
________________________________________
Advies: bouwen in twee fasen
Fase 1 — schema-correctie (blockerend voor alles):
•	Junction-tabel planning_item_medewerkers
•	Tabel planning_project_fasen
•	Uren + bedrag toevoegen aan planning_meerwerk
•	Bestaande UI migreren naar team-view
Fase 2 — intelligentie erboven:
•	Capaciteitsgrafiek
•	Functie-suggestie bij inplannen
•	Budget-bewaking real-time
•	Bewoner-coördinatie
•	AI: "beste week voor dit project gezien beschikbaarheid team"
Het is zinvol om dit als één samenhangende taak te plannen — de schema-wijzigingen in Fase 1 zijn additief (geen destructieve migraties) maar de UI verandert substantieel.
________________________________________
Wil je dat ik dit uitwerk als een bouwplan (met DB-schema, API-contract en UI-ontwerp vooraf), of direct starten met Fase 1?

