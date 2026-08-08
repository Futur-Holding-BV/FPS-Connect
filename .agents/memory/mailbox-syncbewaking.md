---
name: Mailbox-syncbewaking & Microsoft-token-gezondheid
description: Wat "werkende Microsoft-koppeling" betekent en hoe stilstand van de mailbox-achtergrondsync gesignaleerd wordt.
---

**Regel 1:** een "werkende Microsoft-koppeling" is een token waarvan de laatste refresh niet met een auth-fout (invalid_grant, 400/401) is geweigerd — nooit alleen "er bestaat een token-rij". Auth-weigering markeert de koppeling direct als stuk; een geslaagde refresh/herkoppeling heelt hem. Tijdelijke fouten (netwerk/5xx) markeren niets.

**Regel 2:** "nooit gesynct" is óók stilstand: voor een actieve verwerk-mailbox telt de stilte vanaf het aanmaakmoment als er nog nooit een succesvolle sync was (token kan geldig zijn terwijl Exchange-toegang ontbreekt).

**Why:** twee opeenvolgende reviews wezen beide gaten aan — een ingetrokken refresh-token bleef "werkend" tellen, en een nieuw geconfigureerde mailbox zonder Exchange-toegang kon onbeperkt ongesynct blijven zonder melding.

**How to apply:** elke telling/weergave van koppelingen én de stilstand-bewaking moeten beide regels volgen (beheerscherm en achtergrondbewaking synchroon houden). Alarm dedupet per mailbox (max 1/24u) en reset zodra de mailbox weer gezond is.
