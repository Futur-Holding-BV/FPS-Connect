---
name: Objectopslag-cleanup bij delete-routes
description: Delete-routes voor entiteiten met geüploade bestanden moeten óók de objectopslag opruimen, incl. parent-cascade.
---

Regel: elke DELETE-route voor een entiteit met een `bestand_pad` moet vóór de DB-delete `oss.deleteBestand(pad)` aanroepen (pad eerst valideren tegen de eigen prefix). Geldt ook voor parent-deletes waar een FK-cascade alleen de rijen opruimt — bestanden eerst enumereren en verwijderen.

Bij presigned/direct-to-storage uploads mag een voltooi-endpoint nooit een vrij clientpad accepteren. Gebruik een kortlevende pending-registratie, gebonden aan gebruiker en verwacht bestand. Bewaar een cleanup-retry tot objectdelete aantoonbaar slaagt of het object aantoonbaar al ontbreekt; een storagefout mag de laatste verwijzing niet wissen.

**Why:** review-afwijzingen (verzekeringsdocumenten en Snagstream, aug 2026): bestanden bleven na delete of mislukte direct-upload achter; een vrij clientpad plus best-effort cleanup maakte bovendien verwijdering van andermans object mogelijk.

**How to apply:** gewone entiteitsdelete mag de gebruiker niet blokkeren, maar registreert bij opslagfout een duurzame retry. Pending uploadrijen verdwijnen pas na delete-succes/not-found. Bewijs via het echte opslagpad: GET vóór delete 200, daarna 404; test ook not-found als idempotent succes.
