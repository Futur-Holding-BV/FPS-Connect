# PANEEL_01 Fase 0 — meting: Connect twee keer naast elkaar

**Gemeten op 9 augustus 2026, dev-omgeving, commit na `0dc6e1c`.**
Herhaalbaar via `scripts/src/meting-paneel01.ts` (simuleert twee vensters als twee onafhankelijke HTTP-clients op dezelfde gebruiker) plus codemeting op `firevault` en `api-server`.

## 1. Werkt het, en blijft de sessie in beide vensters geldig?

**Ja.** Gemeten: twee gelijktijdige clients op dezelfde inloggegevens krijgen beide 200 op `/auth/me`, ook door elkaar heen gebruikt; het gebruiken van venster B logt venster A niet uit.

In de browser delen twee vensters van hetzelfde profiel bovendien letterlijk dezelfde sessiecookie — er is dus maar één sessie, geen tweede login nodig. Kanttekening: de login-rate-limiter werkt op IP-niveau; twee vensters zijn daar geen extra risico omdat er niet opnieuw ingelogd wordt.

## 2. Twee vensters op dezelfde calculatie, beide wijzigen — wie wint, en merkt de ander het?

**Laatste schrijver wint, en de ander merkt het pas laat of nooit.** Gemeten op `PATCH /modules/calculaties/:id`:

- **Verschillende velden:** venster A wijzigt de naam, venster B (met een verouderd beeld) wijzigt de klantnaam → beide wijzigingen blijven behouden. De PATCH is veld-gedeeltelijk; niet-meegegeven velden worden niet overschreven. Dat dempt de schade aanzienlijk.
- **Hetzelfde veld:** A zet de naam, daarna zet B (op basis van zijn verouderde beeld) ook de naam → **B wint stilzwijgend**. Geen foutmelding, geen waarschuwing, geen versiecontrole. De server heeft geen optimistic locking (`bijgewerkt_op` wordt wel bijgewerkt maar nergens gecontroleerd; `routes/mod-calculatie.ts`).
- **Merkt de ander het?** Tussen twee losse vensters alleen indirect: react-query staat op de standaardinstellingen (`staleTime` 0, refetch bij vensterfocus), dus wie terugklikt naar het andere venster kríjgt verse data — maar een openstaand formulierveld wordt daarmee niet ververst, en wie niet wisselt ziet niets. Calculatieregels bewerken gebeurt bovendien veld-voor-veld via losse regel-PATCHes, wat het raakvlak klein houdt.

**Dit is precies het voorspelde "echte probleem" — en tegelijk het sterkste argument vóór banen in één venster:** binnen één venster delen alle banen dezelfde react-query-cache, dus twee banen op dezelfde calculatie lopen wél direct gelijk. Het banen-model lost dit dus grotendeels op in plaats van het te verergeren. Het restrisico (twee *losse vensters* of twee *gebruikers* op hetzelfde veld) bestaat vandaag al en valt buiten PANEEL_01; optimistic locking is een eventueel apart besluit.

## 3. Werkt het ook als geïnstalleerde app (PWA, standalone)?

**Ja, met een kanttekening.** De manifest staat op `display: "standalone"`. Chrome/Edge op desktop kunnen van een geïnstalleerde PWA meerdere vensters openen (menu → "Nieuw venster"); de sessiecookie wordt gedeeld, dus beide vensters zijn ingelogd. Maar ook daar geldt: **elk venster heeft zijn eigen react-query-cache**, dus twee PWA-vensters lopen net zo min vanzelf gelijk als twee browservensters. Naast elkaar zetten en rangschikken blijft handwerk van het besturingssysteem.

## Conclusie voor de omvang

Twee losse vensters "werken", maar bieden niet wat gevraagd is: geen gedeelde cache (punt 2), handmatig rangschikken, en geen onthouden indeling. De banen uit §4 zijn dus niet alleen comfort maar lossen het gelijkloop-probleem binnen één venster daadwerkelijk op. Bouwen conform §4.
