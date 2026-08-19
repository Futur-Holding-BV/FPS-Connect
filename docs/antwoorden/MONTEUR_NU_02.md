# MONTEUR_NU_02 — Startpoortcontrole (18 augustus 2026)

> **Historische momentopname.** De toen ontbrekende implementatie is later
> geleverd. De actuele functiesplitsing en bewijsvoering staan in
> `docs/antwoorden/TELEFOON_IEDEREEN_01.md`.

## Uitkomst: GESTOPT vóór het bouwen — startpoort niet gehaald

De opdracht bevat een harde startpoort: deze taak mag pas bouwen nadat de
opdrachtgever (René) **uitdrukkelijk** heeft bevestigd dat een monteur op zijn
eigen telefoon heeft ingelogd en in de monteuromgeving heeft gewerkt, gemeten
aan de acceptatiepunten van MONTEUR_NU_01 (schermafdruk vanaf een echte
telefoon, toegevoegd aan het beginscherm zonder browserbalk, en de
foto-in-vliegtuigstand-meting waarna de wachtrij leegloopt).

## Bevindingen bij de controle

1. **`docs/antwoorden/MONTEUR_NU_01.md` bestaat niet.** De map
   `docs/antwoorden/` bevat 19 antwoorddocumenten, maar geen MONTEUR_NU_01.
2. **Geen metingen.** `docs/metingen/` en de rest van de documentatie bevatten
   geen enkel MONTEUR_NU_01-resultaat of akkoordnotitie.
3. **Geen bericht van René** met de vereiste bevestiging is in het project
   vastgelegd.
4. **MONTEUR_NU_01 is aantoonbaar nog niet gebouwd**: `/app` in
   `artifacts/firevault/src/App.tsx` rendert nog steeds de wachtpagina
   (`AppInstallatiePagina`, "De app komt eraan"), en de git-historie bevat geen
   MONTEUR_NU_01-commit.

## Conclusie

De vereiste bevestiging ontbreekt én de onderliggende taak is nog niet
uitgevoerd. Conform de stopregel in de opdracht ("Ontbreekt de bevestiging:
NIETS bouwen, dit melden en stoppen") is er **niets gebouwd, gemeten of
gewijzigd** voor MONTEUR_NU_02.

## Vervolg

MONTEUR_NU_02 opnieuw inplannen zodra:
1. MONTEUR_NU_01 is opgeleverd (het plan staat klaar in
   `.local/tasks/monteur-nu-01.md`), én
2. René's uitdrukkelijke bevestiging van de telefoonbeproeving is vastgelegd
   in `docs/antwoorden/MONTEUR_NU_01.md` of als bericht in de taak.
