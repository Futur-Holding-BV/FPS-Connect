# WERKBAK_01 — Eén plek waar alles landt wat een handeling vraagt

**Opdrachtgever:** René Vink · **Datum:** 8 augustus 2026 · **Uitvoerder:** Replit
**Systeem:** FPS Connect (`vinkrene-jpg/fps-one`, branch `main`)
**Dit is de plek waar bijna alles uit de andere opdrachten samenkomt.** Bouw hem vóór er nog meer modules signalen gaan produceren.

**Verplicht vooraf lezen:** `replit.md` · `docs/ontwikkelfilosofie.md` · `docs/kwaliteitskader.md` · `docs/PRODUCTION_RUNBOOK.md` · `.agents/memory/MEMORY.md`

---

## 1. Het probleem, gemeten

René: *"Waar laten we dan de naderende termijnen en ook verlofaanvragen, e-mails die antwoord nodig hebben etc. verschijnen? Er is een hoofdstuk goedkeuring maar dat is dan ook passief."*

**Gemeten op 8 augustus 2026: er is geen plek. Er zijn er elf.**

Aparte signaal-, meldingen- en takentabellen: `compliance_signalen` · `crm_taken` · `factuur_signalen` · `gereedschap_meldingen` · `gebruikers_meldingen` · `veiligheid_meldingen` · `wagenpark_meldingen` · `hrm_onboarding_taken` · `uitvoeringsplan_taken` · `contract_signaleringen` · `financiele_contract_signaleringen`.

Daarnaast: goedkeuringsaanvragen (`/goedkeuring/aanvragen`), verlofaanvragen, de documenten-inbox (`routes/inbox.ts`, 1.294 r., met eigen goedkeuren/afwijzen) en de werk-inbox met mail.

**Overkoepelend bestaat er niets** — gecontroleerd, geen enkele treffer.

**En het tweede probleem is even zwaar: niets gaat vanzelf af.** De contractbewaking (`routes/contract-bewaking.ts`) maakt signaleringen aan voor 120, 90, 75, 60 en 30 dagen, plus ketenregel en aanzegtermijn — **maar alleen wanneer iemand die route aanroept.** Er is geen verwijzing naar contractbewaking in de opstartcode of in een geplande taak. De bewaking wacht tot iemand komt kijken. Bij een aanzegtermijn is dat hetzelfde als geen bewaking.

---

## 2. Wat er komt

**Eén werkbak per persoon.** Alles wat van iemand een handeling vraagt, komt daar binnen — ongeacht uit welke module het komt.

**Twee onderdelen:**
1. **Een motor** die periodiek alle bestaande bewakingen laat draaien, zodat signalen uit zichzelf ontstaan.
2. **De werkbak** waarin ze landen, samen met alles wat al bestond.

---

## 3. De motor

**Hergebruik het bestaande patroon.** `lib/avgOpruiming.ts` en `lib/backupService.ts` hebben allebei een `scheduleNext()`-mechanisme dat periodiek draait. Bouw daar één bewakingsloop naast die dagelijks:

- de contractbewaking laat draaien (arbeidsovereenkomsten én financiële contracten);
- de Poortwachter-mijlpalen toetst (uit `HRM_01`);
- verlopende certificaten, keuringen, APK, verzekeringen en leasetermijnen toetst;
- verlofverjaring toetst;
- factuursignalen bijwerkt (te lang blijven liggen, termijn loopt af).

**Idempotent:** twee keer draaien op dezelfde dag levert geen dubbele signalen op. Er bestaat al een aanpak voor dubbele signalen bij de facturen (partiële unieke indexen op open signalen) — hergebruik die.

**Elke draai wordt gelogd**, zodat achteraf vaststaat dát hij gedraaid heeft. Draait hij niet, dan is dát een melding — een stille bewaking die stopt is erger dan geen bewaking.

---

## 4. De werkbak

**4.1 — Eén tabel, veel voeders.** Er komt één werkbaktabel met een vaste vorm: **voor wie · wat · waarom nu · sinds wanneer · gewicht · de handeling · de herkomst** (module + object).

De bestaande elf tabellen blijven bestaan en blijven de plek waar de module zijn eigen detail bewaart. **Ze schrijven een verwijzing naar de werkbak; ze bouwen nooit hun eigen lijst.**

**4.2 — Twee soorten, apart zichtbaar:**

| Soort | Wat het is | Voorbeelden |
|---|---|---|
| **Doen** | er wordt een beslissing of handeling van jou gevraagd | verlofaanvraag goedkeuren · factuur goedkeuren · betaalbatch vrijgeven · conceptantwoord versturen · contractbesluit nemen |
| **Weten** | er is iets aan de hand dat aandacht vraagt, zonder dat er nu één knop is | Poortwachter-mijlpaal nadert · rekeningnummer gewijzigd · certificaat verloopt · factuur hangt te lang |

**4.3 — Rangschikking op consequentie, niet op datum.** Wat kost het als ik het vandaag niet doe? Waar geld aan hangt, telt het bedrag. Waar een wettelijke termijn aan hangt, telt hoeveel dagen er nog zijn en wat het kost als hij verstrijkt. De rest daaronder.

**4.4 — Je kunt het ter plekke afhandelen.** Een verlofaanvraag goedkeur je met een knop ín de werkbak. Zonder dat is het een verzameling verwijzingen en gaat niemand hem gebruiken.

Voor wat te veel context vraagt (een factuur beoordelen, een contractbesluit) staat er een knop die je precies op de goede plek brengt — **niet naar het overzicht van die module, maar naar het item zelf.**

**4.5 — Een item verdwijnt pas als het is afgehandeld** of bewust is weggezet met een reden. Nooit vanzelf na een aantal dagen.

**4.6 — Leeg is het doel.** Een werkbak die nooit leeg raakt, wordt genegeerd. Daarom komt er alleen in wat werkelijk een handeling van díé persoon vraagt. Alles wat "handig om te weten" is, hoort in een overzicht en niet hier.

Blijkt de werkbak in de praktijk vol te lopen, dan is dat een bevinding over wat erin gezet wordt — niet iets om met een filter te verbergen.

**4.7 — Waar hij staat.** Op de computer als vast, in- en uitklapbaar paneel aan de rechterzijde, op elke pagina bereikbaar. Op de telefoon als eigen tabblad. **Geen popup** — iets dat opduikt terwijl je met iets anders bezig bent wordt weggeklikt en daarna genegeerd.

**4.8 — Een teller in de navigatie**, zoals die er al is voor open meldingen en ongelezen berichten.

---

## 5. Wat er in gaat — de volledige lijst

Per bron, met wie hem krijgt:

| Bron | Naar wie | Soort |
|---|---|---|
| Goedkeuringsaanvragen (`/goedkeuring/aanvragen`) | volgens de beleidsregels | Doen |
| Verlofaanvragen | leidinggevende / HRM-rol | Doen |
| Factuur ter goedkeuring | volgens de bedragsgrens | Doen |
| Betaalbatch vrijgeven | altijd René | Doen |
| Conceptantwoord op een aanvraag | René of de werkvoorbereider | Doen |
| Mail die antwoord nodig heeft | de eigenaar van die mailbox | Doen |
| Contractbesluit (verlengen / beëindigen) | HRM-rol, bij verstreken aanzegtermijn ook René | Doen |
| Nieuwe leverancier ter beoordeling | René | Doen |
| Poortwachter-mijlpaal nadert of verstreken | HRM-rol, bij verstreken ook René | Weten → Doen |
| Certificaat, keuring, APK, verzekering, lease verloopt | de beheerder van die module | Weten |
| Verlofverjaring | HRM-rol | Weten |
| Factuursignalen (negen types uit `FACTUUR_02`) | Jacqueline, sommige René | Weten |
| Uitgesloten factuur uit een betaalbatch | Jacqueline | Weten |
| Abonnement of financieel contract verlengt automatisch | René | Weten |

**Voeg niets toe zonder dat het in deze tabel staat.** Groeit de lijst, dan groeit dat via een besluit en niet via een module die zichzelf toevoegt.

---

## 6. Acceptatie

1. Ik zie op één plek alles wat op mij wacht, uit alle modules samen.
2. Wat een handeling vraagt staat gescheiden van wat aandacht vraagt.
3. Ik kan een verlofaanvraag goedkeuren zonder de werkbak te verlaten.
4. Bij iets dat meer context vraagt kom ik met één klik op het item zelf, niet op een moduleoverzicht.
5. Een item verdwijnt pas als ik het heb afgehandeld of bewust heb weggezet met een reden.
6. Een naderende aanzegtermijn verschijnt zonder dat iemand een pagina heeft geopend.
7. De bewakingsloop draait dagelijks, is gelogd, en levert bij twee keer draaien geen dubbele items op.
8. Draait de loop niet, dan krijg ik daar een melding van.
9. Jacqueline ziet haar werkbak, ik de mijne — niemand ziet items die niet van hem zijn.
10. In de navigatie staat een teller.

**Bewijs bij oplevering:** een schermafdruk van de werkbak met items uit minstens vier verschillende bronnen, één item dat ter plekke is afgehandeld en verdwijnt, en het log van twee opeenvolgende bewakingsdraaien die aantoont dat er geen dubbelen ontstaan.

## 7. Wat niet mag

- Geen twaalfde meldingenstroom — de bestaande tabellen blijven, maar voeden de werkbak.
- Geen module die zichzelf aan de werkbak toevoegt buiten de lijst uit §5 om.
- Geen item dat vanzelf verdwijnt.
- Geen popup.
- Geen tweede planner naast het bestaande `scheduleNext()`-patroon.
- Geen item zichtbaar voor iemand die er geen bevoegdheid voor heeft.
- Niet melden dat het klaar is op grond van een geslaagde build of typecheck.

---

## Antwoorden en bevindingen in de repo

Antwoorden op vragen uit deze opdracht komen **niet alleen in de chat** maar worden vastgelegd in de repo:

- **vragen en bevindingen** → `docs/antwoorden/WERKBAK_01.md`
- **metingen en inventarisaties** → `docs/metingen/WERKBAK_01_<onderwerp>.md`

Elk antwoord vermeldt: datum · commit-SHA waarop gemeten is · de vraag · het antwoord · en expliciet wat **gemeten** is en wat **aangenomen**. Is er een besluit van René nodig, schrijf dat als zodanig op — niet zelf invullen en doorbouwen.

**Eén punt om expliciet te melden:** `routes/inbox.ts` (1.294 r.) is een documenten-inbox met een eigen goedkeuren en afwijzen, en zelfs een `cv-analyse`-route. Bepaal of die inbox een voeder van de werkbak wordt of dat hij ermee samenvalt — en meld dat als bevinding vóórdat er iets wordt samengevoegd.

---

## Aanvulling René (8 augustus 2026) — vier bronnen erbij in §5

De gesloten lijst in §5 wordt uitgebreid met vier bronnen, alle gerouteerd naar de rol **Ondersteuning** (nieuw preset, zie aanvulling RECHTEN_01):

| Bron | Naar wie | Soort |
|---|---|---|
| Toolbox van de maand klaarzetten en afronding bewaken (`toolbox_maand_opdrachten`, `toolbox_maand_status`) | Ondersteuning | Doen |
| Gereedschapskeuring die verloopt (`gereedschappen.keuring_verval_datum`, `volgende_keuring`) | Ondersteuning | Weten |
| Uitleen en retour van gereedschap (`bruikleen_overeenkomsten`) | Ondersteuning | Doen |
| Document of handboek dat verouderd is | Ondersteuning | Doen |

Deze rol handelt die items **zelf** af en sluit ze zelf. Geen goedkeuringsstap.

**GRENS — hoort er expliciet bij:** regelen is van deze rol, beslissen niet. Een keuring inplannen, uitleen registreren, een document vervangen, een toolbox klaarzetten: dat sluit zij zelf af. Maar zodra een gereedschap moet worden **afgekeurd, vervangen of afgeschreven** gaat er geld om of valt er iets uit de roulatie — dat item gaat naar René. Zelfde patroon als de bedragsgrens bij facturen.

Melding modulevraag (veiligheidshandboek/personeelsgids): zie `docs/antwoorden/WERKBAK_01.md`.
