# Roadmap — Update-voorblad bij login (voorstel, nog geen formeel akkoord)

Ontwerp- en datamodelvoorstel voor een versiebeheer-/changelogfunctie: gebruikers zien bij de eerste login ná een nieuwe release een voorblad met wat er is veranderd. **Nog niet bouwen** — dit document is uitsluitend het ontwerp, in afwachting van formeel akkoord (Ontwikkelstop-principe: per fase pas bouwen ná akkoord). Zie [`README.md`](./README.md) voor het overzicht en [`replit.md`](../../replit.md) voor de Ontwikkelstop-regel.

## Doel

Na een nieuwe release ziet elke gebruiker bij de eerstvolgende login één keer een voorblad met: huidig versienummer, releasedatum, wat is gewijzigd, nieuwe functies, opgeloste bugs en eventuele aandachtspunten. Per gebruiker wordt bijgehouden welke versie al gezien is, zodat het voorblad daarna niet meer verschijnt voor die versie. De beheerder voert de release notes zelf in; er is geen koppeling met git-tags of CI.

## Datamodel (voorstel)

### `release_notes` — door de beheerder beheerde inhoud

| kolom | type | omschrijving |
|---|---|---|
| `id` | serial PK | |
| `versie` | text, uniek | vrij te kiezen versiestring (bv. `2026.07.08` of `V1.4.2`); geen automatische afleiding uit git/CI |
| `releasedatum` | date | |
| `titel` | text, nullable | optionele korte titel boven het voorblad |
| `wat_is_gewijzigd` | text | vrije tekst/bullets |
| `nieuwe_functies` | text, nullable | vrije tekst/bullets |
| `opgeloste_bugs` | text, nullable | vrije tekst/bullets |
| `aandachtspunten` | text, nullable | vrije tekst/bullets — sectie wordt overgeslagen in de popup als leeg |
| `status` | text | `concept` \| `gepubliceerd` (zelfde patroon als de Document Studio-modellen: nieuwe/bewerkte inhoud is altijd concept; alleen expliciet publiceren maakt hem zichtbaar) |
| `gepubliceerd_op` | timestamp, nullable | |
| `aangemaakt_door_id` | integer FK → `gebruikers.id` (`set null`) | |
| `aangemaakt_op` / `bijgewerkt_op` | timestamp | |

Geen partiële unieke index nodig zoals bij Document Studio-modellen: hier moet de vólledige geschiedenis van gepubliceerde releases bewaard blijven (archief van "wat is nieuw"-berichten), niet vervangen worden. "De huidige versie" = de nieuwste rij met `status = 'gepubliceerd'`, gesorteerd op `gepubliceerd_op`.

### `release_notes_gelezen` — per-gebruiker leesstatus

| kolom | type | omschrijving |
|---|---|---|
| `id` | serial PK | |
| `release_notes_id` | integer FK → `release_notes.id` (`cascade`) | |
| `gebruiker_id` | integer FK → `gebruikers.id` (`cascade`) | |
| `gelezen_op` | timestamp, default now | |

Unieke constraint op (`release_notes_id`, `gebruiker_id`) — één rij per gebruiker per versie. De knop "Gelezen" in de popup is tegelijk "niet meer tonen voor deze versie": er is geen aparte checkbox, het indrukken van de knop schrijft deze rij weg. Sluiten zonder op de knop te drukken telt niet als gelezen; de popup verschijnt dan bij de volgende login opnieuw.

## API (contract-first voorstel, nog niet in `openapi.yaml`)

Beheerder (bevoegdheid: bestaande `systeem`-bevoegdheid, schrijfniveau — zelfde gating als Documentopmaak en Rollen & rechten, geen nieuwe bevoegdheid nodig):
- `GET /release-notes` — lijst (concept + gepubliceerd) voor het beheerscherm
- `POST /release-notes` — nieuw concept aanmaken
- `PATCH /release-notes/:id` — concept bewerken (alleen zolang `status = concept`, zelfde regel als Document Studio-concepten)
- `POST /release-notes/:id/publiceren` — concept → gepubliceerd, zet `gepubliceerd_op`
- `DELETE /release-notes/:id` — alleen concepten verwijderbaar

Voor elke ingelogde gebruiker (auth-only, geen aparte bevoegdheid — zelfde niveau als `GET /toewijsbare-gebruikers`):
- `GET /release-notes/ongelezen` — geeft de nieuwste gepubliceerde release terug die de ingelogde gebruiker nog niet heeft bevestigd, of niets als er geen nieuwe is
- `POST /release-notes/:id/gezien` — markeert de release als gelezen voor de ingelogde gebruiker (idempotent bij dubbel indrukken)

## Frontend-flow

- Eén keer per sessie, ná het laden van het portaal (dus ná 2FA, niet als blokkerende auth-stap): `GET /release-notes/ongelezen`.
- Bij een resultaat: modal met versienummer + releasedatum in de kop, secties "Wat is gewijzigd", "Nieuwe functies", "Opgeloste bugs", "Aandachtspunten" (lege secties worden niet getoond), en de knop "Gelezen".
- Faalt de aanroep (netwerk, tijdelijk 500, etc.) dan wordt dit stil genegeerd — fail-open, geen popup, geen blokkade van de rest van de app.
- Beheerscherm `/beheer/release-notes`, gated op de bestaande `systeem`-bevoegdheid: lijst van releases, concept-badge, "Publiceren"-knop, formulier met de velden hierboven, en een voorbeeldweergave van de popup vóór publiceren.

## Waarom dit geen kritieke bugfix kan blokkeren

- Publiceren van release notes staat volledig los van deployen: een hotfix gaat direct live; de beheerder kan er (later, of nooit) release notes bij schrijven.
- Fail-open bij het ophalen: ontbrekende of niet-opgehaalde release notes laten de login en de rest van de app ongemoeid.
- Bewust geen verplichte "gelezen en begrepen"-bevestiging met audittrail — dat zwaardere patroon bestaat al, geparkeerd, voor de Toolbox-leesbevestiging in de monteur-app (zie [`geparkeerd.md`](./geparkeerd.md)); dat dient een ander doel (verplichte instructie) en wordt hier bewust niet hergebruikt. Dit voorblad is informatief, niet verplicht.

## Raakvlakken

- Hergebruikt het bestaande concept/gepubliceerd-patroon van de Document Studio-modelversies (zie [`document-design-system.md`](./document-design-system.md)) qua status-machine, maar zonder de "exact één actief"-beperking.
- Vervangt/gebruikt niet de bestaande lokale (`localStorage`) welkom-onboarding-check (`fps.welkom.afgerond`) — die is client-only en per-apparaat, niet per gebruiker over apparaten heen; deze functie heeft een eigen, server-side per-gebruiker tabel nodig omdat "per gebruiker bijhouden welke versie is gelezen" een harde eis is.
- Gated op de bestaande `systeem`-bevoegdheid; geen wijziging aan de bevoegdheden-matrix nodig.

## Past dit binnen de huidige releasefase?

Nee. Dit is een volledig losstaande, kleine functie zonder afhankelijkheid met de huidige actieve fase (V1.4 Opleverrapportage) of het Document Design System. Conform de instructie van de gebruiker wordt dit **nu niet gebouwd**. Omdat de functie geïsoleerd is (twee nieuwe tabellen, één nieuw beheerscherm, één kleine hook na login) en geen bestaand scherm raakt, is het risico van parallel bouwen laag — maar net als bij de andere fasen in dit document wordt pas gebouwd ná expliciet akkoord van de gebruiker.
