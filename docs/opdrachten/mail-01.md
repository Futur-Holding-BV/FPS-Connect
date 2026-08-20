# MAIL_01 — De mailomgeving als samenwerkomgeving

**Opdrachtgever:** René Vink · **Datum:** 7 augustus 2026 · **Uitvoerder:** Replit
**Systeem:** FPS Connect (`vinkrene-jpg/fps-one`, branch `main`)
**Gaat vooraf aan:** de verdere uitbouw van `FACTUUR_02` en `AANVRAAG_01` — die veronderstellen beide een mailbox die meer dan één persoon kan bedienen.

**Verplicht vooraf lezen:** `replit.md` · `docs/ontwikkelfilosofie.md` · `docs/kwaliteitskader.md` · `docs/PRODUCTION_RUNBOOK.md` · `.agents/memory/MEMORY.md`

---

## 1. Het probleem, gemeten

René wil als hoofdbeheerder regelen wie welke mailbox mag zien en wat diegene ermee mag doen. Denko regelt het e-mailadres; Connect regelt de toegang en de handelingen.

**Dat kan nu niet, en de reden is structureel.**

`werk_inbox_mailboxen` heeft een verplichte `gebruiker_id`, met een uniciteitsregel op (gebruiker, e-mailadres). **Een mailbox is in Connect het bezit van één gebruiker.** Koppelen René en Jacqueline allebei `info@fpsbouw.nl`, dan zijn dat twee losse rijen, twee losse lijsten, zonder gedeelde toestand. Ook de tokens staan per gebruiker.

Gevolg: geen toewijzing, geen gezamenlijke status, geen zicht op wie waaraan werkt — niet omdat het niet gebouwd is, maar omdat het model het niet toelaat. En René kan niets voor een ander regelen, want koppelen doet iedere gebruiker zelf via zijn eigen aanmelding.

---

## 2. Twee lagen, en waar de grens ligt

**Laag 1 — Exchange: wie mág de mailbox technisch openen.** Dat is Microsoft 365. René heeft daar zelf de rol Exchange Online Recipient Management voor gekregen, dus hij kan het — maar in de Microsoft-beheeromgeving, niet in Connect.

**Connect kan dit niet en moet dit ook niet gaan doen.** De verleende delegated permissies zijn `User.Read`, `Mail.ReadWrite(.Shared)`, `Mail.Send(.Shared)` en `offline_access` — geen enkele directory- of mailboxbeheerrechten. Die grens is bewust getrokken en blijft staan.

**Laag 2 — Connect: wie ziet de mailbox in de werkinbox en wat mag hij ermee.** Dat is volledig aan Connect, en dat is wat deze opdracht bouwt.

**Wat er wél bij hoort:** Connect toont per mailbox of de benodigde Exchange-toegang bestaat. Kent Connect iemand toegang toe die de mailbox in Exchange niet mag openen, dan is dat zichtbaar als afwijking in plaats van als onverklaarbare foutmelding.

---

## 3. Van persoonlijk bezit naar organisatiebezit

**De mailbox wordt een object van de organisatie, niet van een gebruiker.**

- `werk_inbox_mailboxen` verliest `gebruiker_id` als eigenaar; er komt een koppeltabel `werk_inbox_mailbox_toegang` (mailbox, gebruiker, wat hij mag).
- De bestaande koppelingen worden gemigreerd: elke huidige rij wordt een mailbox met één toegangsregel voor die gebruiker. **Niemand verliest toegang bij de migratie.**
- Tokens blijven per gebruiker — dat hóórt zo, want elke gebruiker meldt zich met zijn eigen account aan bij Microsoft.

**Rechten per mailbox, oplopend:**

| Recht | Mag |
|---|---|
| Lezen | berichten zien |
| Behandelen | beantwoorden, notities, koppelen, archiveren, toewijzen |
| Beheren | modus instellen, toegang van anderen regelen |

René krijgt als hoofdbeheerder overal Beheren. Sluit aan op het bestaande bevoegdhedenmodel (`requireBevoegdheid`) — bouw geen apart rechtenstelsel.

---

## 4. De modus per mailbox

Niet per gebruiker instelbaar, maar per mailbox — de aard van de mailbox bepaalt de werkwijze.

| Modus | Voor | Gedrag |
|---|---|---|
| **Verwerken** | `factuur@` en andere functionele mailboxen | de AI doet het werk, mens keurt goed; wachtrij-achtig |
| **Ondersteunen** | persoonlijke mail van René en de werkvoorbereiders | mail komt gewoon binnen, je leest en antwoordt zoals altijd; de AI staat ernáást — relatiecontext, een concept áls je erom vraagt, "dit lijkt een prijsaanvraag, vastleggen?" — en **nooit blokkerend** |
| **Alleen registreren** | archiefdoeleinden | vastleggen en koppelen, geen AI-bemoeienis |

De bestaande vlaggen `is_factuurmailbox` en `is_aanvraagmailbox` gaan op in dit modusveld, of blijven ernaast bestaan als verfijning binnen *Verwerken*. Kies één van beide en documenteer het — niet allebei half.

**In de modus *Ondersteunen* geldt: de AI onderbreekt nooit.** René reageert impulsief op mail en dat is bij een prijsaanvraag de commerciële prestatie, geen probleem dat opgelost moet worden. Voorstellen staan naast het bericht, niet ervoor.

---

## 5. Samenwerken in een gedeelde mailbox

Dit is wat er nu volledig ontbreekt en wat een gedeelde mailbox pas bruikbaar maakt.

**5.1 Toewijzen.** Een bericht kan aan één persoon worden toegewezen. Toegewezen berichten zijn filterbaar ("van mij"). Niet toegewezen is niet van niemand — het staat op de gezamenlijke stapel.

**5.2 Zien dat iemand anders bezig is.** Opent iemand een bericht in een gedeelde mailbox, dan zien anderen dat. Begint iemand een antwoord te typen, dan zien anderen dát ook. Dit is de reden dat gedeelde-inboxproducten bestaan: twee mensen die dezelfde klant tegenstrijdig antwoorden is de fout die je wilt voorkomen.

**5.3 Interne opmerkingen.** Bij een bericht kun je een opmerking plaatsen die **nooit** naar buiten gaat, met vermelding van een collega. Visueel onmiskenbaar onderscheiden van het antwoord aan de klant — kleur, plaatsing en label. Een interne opmerking die per ongeluk naar een klant gaat is het duurste dat dit onderdeel kan opleveren.

**5.4 Gezamenlijke status.** Open · toegewezen · wacht op antwoord · afgehandeld. Voor iedereen dezelfde status — dat is het verschil met de huidige situatie waarin ieder zijn eigen lijstje heeft.

**5.5 Reactietijd per mailbox.** Hoe lang duurt het gemiddeld voordat er geantwoord wordt, en wat ligt er te lang. Dit is standaardfunctionaliteit bij gedeelde inboxen en sluit aan op de bewaking uit `AANVRAAG_01`.

---

## 6. Het beheerscherm van René

Eén scherm waarop hij per mailbox regelt:

- welk adres het is en welk label het krijgt;
- in welke **modus** hij draait;
- **wie er toegang heeft en met welk recht**;
- of de benodigde Exchange-toegang bestaat (tonen, niet beheren);
- en of de mailbox actief is.

Een mailbox toevoegen doet hij hier; de gebruiker die hem gaat gebruiken meldt zich daarna zelf aan bij Microsoft — dat kan Connect niet voor hem doen en moet het ook niet.

---

## 7. Acceptatie

1. Ik voeg als hoofdbeheerder een mailbox toe en bepaal wie hem ziet en wat diegene mag.
2. Iemand die geen toegang heeft, ziet de mailbox niet — ook niet via een adres in de browser.
3. Ik stel per mailbox de modus in, en in *Ondersteunen* onderbreekt de AI nergens.
4. In een gedeelde mailbox zie ik dat een collega een bericht open heeft of aan het beantwoorden is.
5. Ik kan een bericht aan iemand toewijzen en die persoon ziet dat.
6. Een interne opmerking is onmiskenbaar anders dan een antwoord aan de klant en gaat er nooit naartoe.
7. De status van een bericht is voor iedereen in die mailbox hetzelfde.
8. Bij de migratie is niemand toegang kwijtgeraakt.
9. Ontbreekt de Exchange-toegang, dan staat dat als melding — niet als onverklaarbare fout.

**Bewijs bij oplevering:** twee gebruikers tegelijk in dezelfde mailbox, met een schermafdruk of video waarin de een ziet dat de ander het bericht open heeft. Plus de migratietelling: aantal mailboxen vóór en ná, en aantal toegangsregels.

## 8. Wat niet mag

- Connect regelt **geen** Exchange-rechten. Tonen mag, beheren niet.
- Geen apart rechtenstelsel naast `requireBevoegdheid`.
- Geen migratie waarbij iemand toegang verliest.
- Geen AI die onderbreekt in de modus *Ondersteunen*.
- Geen interne opmerking die in het antwoordveld terecht kan komen.
- Niet melden dat het klaar is op grond van een geslaagde build of typecheck.
