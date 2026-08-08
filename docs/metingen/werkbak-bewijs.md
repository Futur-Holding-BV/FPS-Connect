# WERKBAK_01 — gedragsbewijs (GEMETEN)

Datum: 2026-08-08 · Script: `scripts/src/bewijs-werkbak.ts` · Doel: dev-API via publiek domein (echte login met wachtwoord + TOTP).

## Uitvoer (letterlijk)

```
WERKBAK_01 bewijs — 2026-08-08T05:03:08.630Z (na architect-review-fixes)
Login als hoofdbeheerder geslaagd (wachtwoord + TOTP).
Seed klaar: verlofaanvraag, goedkeuringsaanvraag, sepa-bestand, voertuig-APK.
SCENARIO 1 PASS — bronnen: betaalbatch, goedkeuringsaanvraag, verlofaanvraag, verloopdatum; 2 draaien gelogd, geen dubbelen (4 items).
SCENARIO 2 PASS — teller: {"totaal":8,"doen":3,"weten":5}; verlofitem inline-afhandelbaar.
SCENARIO 3 PASS — inline beoordelen → reconciliatie handelt af; afhandelen werkt; wegzetten eist reden (400 zonder).
SCENARIO 4 PASS — gebruiker met alleen gebouwen:1 ziet lijst leeg + teller 0; handmatige draai = 403.
ALLE SCENARIO'S GESLAAGD — WERKBAK_01 gedragsbewijs compleet.
Opgeruimd.
```

## Wat elk scenario bewijst

1. **Motor + idempotentie (GEMETEN):** twee opeenvolgende draaien via
   `POST /werkbak/bewaking/draai`; items uit ≥4 verschillende bronnen
   (verlofaanvraag, goedkeuringsaanvraag, betaalbatch, wagenpark-verloopdatum)
   landen in de werkbak; de tweede draai voegt exact 0 dubbelen toe; beide
   draaien staan met status `klaar` in het logboek (`GET /werkbak/bewaking/draaien`).
2. **Teller + soort (GEMETEN):** `GET /werkbak/aantal` telt totaal/doen/weten;
   het verlofitem is `doen` met `actie_type=verlof_beoordelen` (inline).
3. **Levenscyclus (GEMETEN):** verlof goedkeuren via de bestaande
   beoordelingsroute → volgende draai reconcilieert en handelt het werkbak-item
   af (item weg uit lijst); handmatig afhandelen werkt (200); wegzetten zonder
   reden geeft 400, met reden 200.
4. **Zichtbaarheid (GEMETEN):** vers account rol=gebruiker met alleen
   `gebouwen:1` logt in (wachtwoord+TOTP) en ziet een lege lijst én teller 0,
   terwijl de hoofdbeheerder op dat moment 11 open items ziet; handmatige
   draai is voor deze gebruiker 403.

## Aannames (AANGENOMEN, niet gemeten)

- De dagelijkse 06:30-trigger zelf is niet met een klokverloop gemeten; het
  bewijs draait de identieke `draaiBewakingsloop()` via de handmatige route.
  De planner volgt het bestaande `scheduleNext()`-patroon (zelfde als back-ups
  03:00) en de gezondheidscontrole signaleert het uitblijven (>26 u) als
  Weten-item voor de hoofdbeheerder.
- Mobiel scherm is functioneel gelijk aan web (zelfde endpoints); visueel
  gecontroleerd via typecheck + web-paneel; geen aparte mobiele e2e-run.

## Architect-review en fixes (2026-08-08)

De code-review vond vijf punten; alle opgelost en het bewijs opnieuw groen gedraaid:

1. **Mailbox-lek (hoog):** mail-items waren module-breed (crm:2) zichtbaar, terwijl
   de werk-inbox per mailbox lezen/behandelen/beheren afdwingt. Fix: persoonlijke
   items per gerechtigde gebruiker (behandelen/beheren op de mailbox); mailbox
   zonder behandelaars escaleert naar de hoofdbeheerder.
2. **Gezondheid bij deels falende draai (middel):** een draai met falende voeders
   heet nu `gedeeltelijk` (niet `klaar`) en telt dus niet als gezond voor de
   26-uurscontrole; falende voeders worden bovendien direct als Weten-item voor
   de hoofdbeheerder gemeld (`bewakingsloop:voeders_mislukt`).
3. **Bronnenlijst opgeschoond (middel):** twee bronnen zonder voeder verwijderd
   uit de gesloten lijst (lijst == werkelijkheid).
4. **Concurrency (middel):** `syncBron` (aanmaken + reconciliëren) is nu één
   transactie en de loop heeft een overlap-guard — een tweede draai tijdens een
   lopende draai wordt overgeslagen.
5. **Zichtbaarheid (middel):** hoofdbeheerder ziet nu ook persoonlijk gerichte
   items ("hoofdbeheerder ziet alles" ging vóór de persoonlijke-item-check).
