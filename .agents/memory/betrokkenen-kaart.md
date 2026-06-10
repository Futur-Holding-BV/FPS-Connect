---
name: Betrokken contacten-kaart (projectformulier)
description: Waarom de contactenkaart op partij groepeert en de toonContext-koppeling van PersoonRegel
---

# Betrokken contacten-kaart in het projectformulier

In `gebouw-projectformulier.tsx` toont de "Betrokken contacten"-kaart bewust een
rustige, formulierachtige weergave die **op partij groepeert** (niet op status):
opdrachtgever-rol bovenaan met zijn contactpersonen, daaronder de overige
betrokken partijen (installateur/aannemer/...). Rol + organisatie staan in de
**groepskop** (PartijBlok), niet per regel.

**Why:** de oude status-gegroepeerde lijst (Bevestigd/AI-voorstellen/Ter controle/
Afgewezen als losse blokken) voelde onrustig; de gebruiker wilde een formulier-
achtige indeling per partij.

**How to apply:**
- `PersoonRegel` toont rol/organisatie alléén als `toonContext` aanstaat. Binnen
  een groep (PartijBlok) staat die context al in de kop, dus daar `toonContext`
  weglaten. Render je een kale PersoonRegel **buiten** een groep (zoals de
  inklapbare "Twijfelgevallen ter controle" en "Afgewezen" secties), geef dan
  `toonContext` mee, anders verliest de beheerder de rol/organisatie-context bij
  zijn accept/reject-beslissing.
- Dedup van AI-contacten vs handmatige partijen gaat via `persoonKey` (email,
  anders naam, lowercase). `leesGroepen` (niet-beheerder) bevat nooit
  AI-voorstellen; `beheerGroepen` wel.
- Kleurconventie blijft: geel = AI-voorstel, neutraal = bevestigd/handmatig.
