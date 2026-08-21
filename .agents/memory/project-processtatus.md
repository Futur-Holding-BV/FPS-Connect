---
name: Servergestuurde projectprocesstatus
description: Beslisregels voor de ene projectfasewaarheid en fail-closed publicatie naar FPS One.
---

Projectfasen hebben één servergestuurde volgorde: Concept → Intern akkoord → Offerte → Opdracht → Uitvoering → Oplevering. Frontends tonen deze uitkomst en leiden geen eigen fase af uit deelgegevens.

Externe zichtbaarheid is een lokale, eenrichtingsgerichte publicatie-intentie. Publicatie vereist de volledige bewijsketen en exact één actueel, definitief en bevroren opleverrapport; ontbrekend of tegenstrijdig bewijs blokkeert. Intrekken verwijdert nooit brongegevens.

**Why:** Lokale faseafleidingen konden elkaar tegenspreken. Losse publicatiechecks konden onvolledige of ambigue ketens toelaten en willekeurig één rapport kiezen.

**How to apply:** Laat preview en mutatie dezelfde serverregels gebruiken, hercontroleer bij schrijven in een serieel geïsoleerde transactie, pas gebouwscope toe op alle lees- en schrijfroutes en voeg nieuwe procesweergaven alleen als presenter van de serverstatus toe.