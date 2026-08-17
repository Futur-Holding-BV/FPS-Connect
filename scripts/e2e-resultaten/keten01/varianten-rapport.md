# KETEN_01 fase 2 — variantenrapport (2026-08-17T04:59:43.189Z)

| Variant | Uitkomst | Detail |
|---|---|---|
| Offerte-afloop: afgewezen | **doorlopen** | portaal_status=afgewezen, afwijs-event vastgelegd (offerte 133) |
| Offerte-afloop: ingetrokken | **vastgelopen** | locator.waitFor: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for getByRole('button', { name: /^Intrekken$/ }).first() to be visible[22m
 |
| Offerte-afloop: verlopen zonder reactie | **doorlopen** | portaal toont 'Uitnodiging verlopen' bij verstreken token; lijststatus 'vervallen' is afgeleid van de vervaldatum |
| Offerte-afloop: getekend | **vastgelopen** | locator.fill: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for getByLabel(/Volledige naam/i)[22m
 |
| Regressie: Annuleren + heropenen blokkeert lege handtekening | **doorlopen** | Volgende uitgeschakeld op leeg canvas na Annuleren — integriteitsregressie afgedicht |
| Akkoordgrond: vrijgave projectleider | **vastgelopen** | goedkeuringsbeleid grijpt in: opdracht zonder bekend bedrag valt boven de band → 422 GOEDKEURING_VEREIST, eerst formele goedkeuringsaanvraag nodig. De UI toont dit als nette foutmelding; de grond-C-flow zelf werkt maar komt hier niet doorheen zonder ingerichte goedkeuring |
| Akkoordgrond: opdrachtbevestiging zonder document | **doorlopen** | weigering zoals bedoeld (knop uitgeschakeld zonder document); grond B eist een echt document |
| Akkoordgrond: ondertekende offerte | **vastgelopen** | zie "Offerte-afloop: getekend": locator.fill: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for getByLabel(/Volledige naam/i)[22m
 |
| Uren: opdracht zonder akkoord | **doorlopen** | weigering zoals bedoeld: 422 AKKOORD_ONTBREEKT, geen uren-rij (opdracht 212) |
| Uren: zonder opdracht | **doorlopen** | uren zonder opdracht worden geaccepteerd (201, rij 160) — conform beleid 'alleen meten' |
| Terugzetten: akkoord intrekken als hoofdbeheerder | **doorlopen** | akkoord verwijderd op opdracht 213 |
| Terugzetten: als gewone gebruiker | **niet gemeten** | vereist een tweede (niet-hoofdbeheerder) websessie; server-side check bestaat (DELETE /opdrachten/:id/akkoord → 403 voor niet-hoofdbeheerder) maar is hier niet klikkend gemeten |
| Bedrag: boven tien mille langs de bedrijfsleider | **doorlopen** | weigering zoals bedoeld: offerte €12.000 gekoppeld → akkoord-vastleggen geeft 422 GOEDKEURING_VEREIST, geen akkoord ontstaan (opdracht 214). De volledige goedkeuringsronde (tweede beoordelaar) is niet doorlopen (vergt ingericht beleid + tweede account) |
| Akkoord zonder offerte (alleen calculatie) | **vastgelopen** | geen UI-flow gevonden die akkoord op een kale calculatie vastlegt en alsnog een offerte met prijsafspraak laat ontstaan — einddoel niet haalbaar via de UI |
| Materiaal: afwijkend van de opdracht | **niet gemeten** | monteur-intake (mobiel) bepaalt volgens_opdracht; web toont dezelfde behandelflow. Afwijkend-pad vergt mobiele meting (zit niet in deze web-suite) |
| Bestelweg: uit voorraad | **niet gemeten** | inkoopplanning kent prijsbron/status 'Uit voorraad'; volledige voorraad-afboeking vergt gevuld magazijn — apart te meten zodra magazijn in gebruik is |
| Prijscontrole: factuurprijs hoger dan afspraak | **niet gemeten** | vergt een prijsafspraak + factuurregels via de mailbox-intake; binnenkomst is mailbox-only (fase 1, proces 9a) en regels-seed zou de controle zelf simuleren |