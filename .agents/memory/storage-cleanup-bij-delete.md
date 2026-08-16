---
name: Objectopslag-cleanup bij delete-routes
description: Delete-routes voor entiteiten met geüploade bestanden moeten óók de objectopslag opruimen, incl. parent-cascade.
---

Regel: elke DELETE-route voor een entiteit met een `bestand_pad` moet vóór de DB-delete `oss.deleteBestand(pad)` aanroepen (pad eerst valideren tegen de eigen prefix). Geldt ook voor parent-deletes waar een FK-cascade alleen de rijen opruimt — bestanden eerst enumereren en verwijderen.

**Why:** review-afwijzing (verzekeringsdocumenten, aug 2026): gevoelige polisbestanden bleven permanent in opslag achter terwijl de gebruiker een geslaagde verwijdering zag. Bedrijfsdocumenten-route deed het al goed (voorbeeldpatroon in organisatie.ts).

**How to apply:** opslagfout = warn-log + rij toch verwijderen (best effort, blokkeert de gebruiker niet). Bewijs: download-na-delete 404 test alleen de DB-rij; een directe opslagcheck is sterker.
