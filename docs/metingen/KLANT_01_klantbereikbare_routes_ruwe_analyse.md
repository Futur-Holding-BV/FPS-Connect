# Klantbereikbare routes (statische analyse)

Totaal routes: 1296 · publiek (vóór requireAuth): 32 · sessieroutes: 1264 · daarvan klantbereikbaar: 229 · geblokkeerd voor klant: 1035

## adviseur.ts (1)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| POST | /adviseur/vraag | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## ai-beslissingen.ts (3)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| POST | /ai/taken/:taaknaam/uitvoeren | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /ai/beslissingen/:token | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /ai/beslissingen/:token/beoordeling | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## ai.ts (1)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| POST | /ai/invullen | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## avg.ts (2)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| POST | /avg/inzageverzoek | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /avg/mijn-verzoeken | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## chat.ts (7)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /chat/gebruikers | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /chat/gesprekken | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /chat/gesprekken | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /chat/gesprekken/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /chat/gesprekken/:id/berichten | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /chat/gesprekken/:id/berichten | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /chat/gesprekken/:id/gelezen | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## classificatie.ts (3)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /voorziening-types | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /labels | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /testrapporten | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## cqo.ts (8)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| POST | /cqo/beoordeling | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /cqo/beoordelingen | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /cqo/beoordelingen/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /cqo/beoordelingen/:id/bevindingen | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /cqo/beoordelingen/:id/verbeterpunten | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /cqo/dashboard | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /cqo/azure-status | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /cqo/score | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## dashboard.ts (4)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /dashboard/stats | dashboardLezen laat klant door |
| GET | /dashboard/recente-activiteit | dashboardLezen laat klant door |
| GET | /dashboard/status-verdeling | dashboardLezen laat klant door |
| GET | /dashboard/vervaldagen | dashboardLezen laat klant door |

## declaraties.ts (7)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /mijn/declaraties | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /declaraties | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /declaraties/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| PATCH | /declaraties/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| DELETE | /declaraties/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /declaraties/:id/indienen | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /declaratiebeleid | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## fabrikanten.ts (1)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /fabrikanten | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## gebouwen.ts (3)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /gebouwen | lezenGebouwenOfKlant laat klant door |
| GET | /gebouwen/:id | lezenGebouwenOfKlant laat klant door |
| GET | /gebouwen/:id/publicatiestatus | lezenGebouwenOfKlant laat klant door |

## gebruikers.ts (1)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /gebruikers/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## gereedschappen.ts (1)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /mijn-gereedschappen | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## golive.ts (10)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /beheer/go-live/dashboard | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /beheer/go-live/fasen | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| PATCH | /beheer/go-live/fasen/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /beheer/go-live/readiness | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /beheer/go-live/adviezen | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /beheer/go-live/adviezen/genereer | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| PATCH | /beheer/go-live/adviezen/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /beheer/go-live/mijn-acties | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /beheer/go-live/testdata | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /beheer/go-live/lessen | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## governance.ts (10)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /governance/dashboard | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /governance/checks | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /governance/wachtrij | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /governance/wachtrij/:id/goedkeuren | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /governance/wachtrij/:id/afwijzen | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /governance/ai-prompt-scans | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /governance/ai-prompt-scans/statistieken | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /governance/ai-wijzigingsvoorstellen | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /governance/ai-wijzigingsvoorstellen/:id/beoordelen | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /governance/statistieken | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## hrm.ts (12)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| PATCH | /verlofaanvragen/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /mijn/verlof-correcties | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /mijn/medewerker | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /mijn/certificaten | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /mijn/opleidingen | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /mijn/verlofsoorten | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /mijn/verlofsaldi | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /mijn/verlofaanvragen | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /mijn/verlofaanvragen | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /mijn/ziekmeldingen | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /mijn/ziekmeldingen | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /zzp-overeenkomsten/ai-vullen | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## import.ts (6)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| POST | /import/preview | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /import/controleren | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /import/uitvoeren | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /import/logs/:id/bestand | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /import/logs/:id/terugdraaien | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /import/template/:type | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## inbox.ts (2)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /inbox/aanvraag-antwoord/:token | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /inbox/aanvraag-antwoord/:token | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## info.ts (1)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /info/instellingen | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## inspecties.ts (3)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /inspecties | lezenInspectiesOfKlant laat klant door |
| GET | /inspecties/:id | lezenInspectiesOfKlant laat klant door |
| GET | /inspecties/:id/bevindingen | lezenInspectiesOfKlant laat klant door |

## kantoor-release.ts (7)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /kantoor-release/actief | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /kantoor-release/releases | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /kantoor-release/releases/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /kantoor-release/releases | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| PATCH | /kantoor-release/releases/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /kantoor-release/releases/:id/vrijgeven | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /kantoor-release/releases/:id/rollback | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## materiaal-aanvragen.ts (1)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| POST | /materiaal-aanvragen | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## meldingen.ts (1)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| POST | /meldingen | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## nieuws.ts (1)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /nieuws | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## opname.ts (15)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /opname | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /opname | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /opname/plattegrond-items | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /opname/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| PATCH | /opname/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| DELETE | /opname/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /opname/:id/definitief | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /opname/:id/spots-aanmaken | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /opname/:id/items | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /opname/:id/items | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /opname/items/:itemId | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| PATCH | /opname/items/:itemId | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| DELETE | /opname/items/:itemId | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /opname/items/:itemId/fotos | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| DELETE | /opname/fotos/:fotoId | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## pbm.ts (1)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /pbm/items/eigen | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## pim.ts (5)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /opdrachten/:id/pim | lezen laat klant door |
| GET | /opdrachten/:id/pim/uitvoering/stappen | lezen laat klant door |
| GET | /opdrachten/:id/pim/uitvoering/huidige-stap | lezen laat klant door |
| GET | /opdrachten/:id/pim/uitvoering/stap/:stapId/foto-analyse/:analyseId | lezen laat klant door |
| GET | /opdrachten/:id/pim/uitvoering/verslag | lezen laat klant door |

## projecten.ts (4)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /projecten | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /projecten/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| PATCH | /projecten/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| DELETE | /projecten/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## rapporten.ts (3)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /gebouwen/:id/rapporten | lezenRapportenOfKlant laat klant door |
| GET | /gebouwen/:id/rapporten/:rapportId | lezenRapportenOfKlant laat klant door |
| POST | /gebouwen/:id/rapporten/:rapportId/klant-reactie | lezenRapportenOfKlant laat klant door |

## salarisarchief.ts (3)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /mijn/salarisdocumenten | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /mijn/salarisdocumenten/:id/download-url | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /mijn/salarisdocumenten/:id/download | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## security-quarantine.ts (4)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| POST | /security/quarantaine/:id/weigeren | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /security/statistieken | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /security/quarantaine-opslag | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| DELETE | /security/quarantaine-opslag/:bestandsnaam | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## security-validation.ts (9)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /security-validation/bibliotheek | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /security-validation/scan | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /security-validation/scans | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /security-validation/scans/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /security-validation/scans/:id/resultaten | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /security-validation/dashboard | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /security-validation/releases | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /security-validation/releases/:id/beoordelen | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /security-validation/score | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## slim-upload.ts (3)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| POST | /slim-upload/analyseer | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /slim-upload/log | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /slim-upload/log | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## storage.ts (4)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| POST | /storage/uploads/request-url | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /storage/public-objects/*filePath | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /storage/objects/*path | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /storage/thumbnails/*path | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## systeem.ts (4)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| POST | /helpdesk | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /feedback | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /muis-gebeurtenissen | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /module-beoordelingen | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## uitvoerder.ts (4)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| POST | /uitvoerder/sessies | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /uitvoerder/sessies/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /uitvoerder/sessies/:id/berichten | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /uitvoerder/sessies/:id/bevestig | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## uren.ts (16)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /uren | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /uren/mijn-week | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /uren/tijd-voor-tijd-aanvraag | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /uren | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /uren/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| PATCH | /uren/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| DELETE | /uren/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /weekstaten | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /weekstaten | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /weekstaten/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| PATCH | /weekstaten/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /weekstaten/:id/indienen | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /weekstaten/:id/goedkeuren | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /weekstaten/:id/afwijzen | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /weekstaten/:id/vergrendelen | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /weekstaten/:id/ontgrendelen | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## wagenpark-meldingen.ts (4)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| POST | /meldingen | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /kwartaalcontrole/foto-check | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /kwartaalcontrole/mijn | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /push-tokens | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## werk-inbox.ts (35)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /werk-inbox/oauth/start | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /werk-inbox/oauth/callback | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /werk-inbox/oauth/status | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| DELETE | /werk-inbox/oauth/ontkoppel | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /werk-inbox/mailboxen | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /werk-inbox/sync-bewaking/run | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /werk-inbox/mailboxen | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| PATCH | /werk-inbox/mailboxen/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| DELETE | /werk-inbox/mailboxen/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /werk-inbox/mailboxen/:id/toegang | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /werk-inbox/mailboxen/:id/toegang | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| DELETE | /werk-inbox/mailboxen/:id/toegang/:gebruikerId | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /werk-inbox/mailboxen/:id/exchange-status | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /werk-inbox/mailboxen/:id/reactietijd | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /werk-inbox/sync | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /werk-inbox/mails | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /werk-inbox/mails/:messageId | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /werk-inbox/mails/:messageId/aanwezigheid | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| PATCH | /werk-inbox/mails/:messageId/toewijzen | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| PATCH | /werk-inbox/mails/:messageId/status | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| PATCH | /werk-inbox/mails/:messageId/gelezen | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| PATCH | /werk-inbox/mails/:messageId/verwerkt | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /werk-inbox/mails/:messageId/notities | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| PATCH | /werk-inbox/notities/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| DELETE | /werk-inbox/notities/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /werk-inbox/mails/:messageId/koppelingen | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| DELETE | /werk-inbox/koppelingen/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| PATCH | /werk-inbox/mails/:messageId/afgehandeld | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| PATCH | /werk-inbox/mails/:messageId/actie-vereist | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /werk-inbox/relatie/:emailAdres | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /werk-inbox/mails/:messageId/verplaats | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /werk-inbox/mails/:messageId/archiveer | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /werk-inbox/mails/:messageId/beantwoord | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /werk-inbox/mails/nieuw | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /werk-inbox/mails/:messageId/analyseer | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## werkbak.ts (6)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /werkbak | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /werkbak/aantal | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /werkbak/:id/afhandelen | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /werkbak/:id/wegzetten | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /werkbak/bewaking/draai | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /werkbak/bewaking/draaien | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## werkdag.ts (3)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /modules/werkdag/vandaag | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /modules/werkdag/items/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| PATCH | /modules/werkdag/items/:id/status | alleen requireAuth (globaal) — geen rechtencheck gevonden |

## workflow.ts (10)
| Methode | Pad | Waarom bereikbaar |
|---|---|---|
| GET | /workflow-definities | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /workflow-definities | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| GET | /workflow-definities/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| PATCH | /workflow-definities/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /workflow-lanes | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| PATCH | /workflow-lanes/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| DELETE | /workflow-lanes/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| POST | /workflow-cards | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| PATCH | /workflow-cards/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |
| DELETE | /workflow-cards/:id | alleen requireAuth (globaal) — geen rechtencheck gevonden |

