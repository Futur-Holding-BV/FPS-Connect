# RECHTEN_HRM_02 — twee accounts en één vrijgavestap

*Voor Replit. Opgesteld 17 augustus 2026 op de code van commit `0fc040cf`. De twee accounts moeten er woensdag zijn; de vrijgavestap mag daarna.*

---

## 1. Externe boekhouder mag alles zien van financiën

Het profiel "Externe boekhouder" heeft nu alleen salarisarchief, salarismutaties en het boekhoudersportaal, met in de code de aantekening dat facturen bewust dicht staan. Dat besluit is herzien.

Voeg toe: leesrecht op `financieel` en op `financieel_vertrouwelijk` — niveau 1, zien en niet wijzigen. De bestaande rechten blijven ongewijzigd. Projecten, offertes en opdrachten blijven dicht. Werk de toelichting in de code bij, want die zegt nu het tegenovergestelde.

**Maar niveau 1 is op dit moment geen leesrecht, en dat moet eerst gerepareerd.** Nagemeten in `routes/facturen.ts`: achter `financieel` niveau 1 zitten negen routes die wél wijzigen. Wie leesrecht heeft, kan nu een factuur aanmaken, wijzigen, ter goedkeuring indienen, laten uitlezen door de AI, beoordelen en opmerkingen plaatsen en aanpassen:

| Regel | Route |
|---|---|
| 198 | `POST /facturen/upload-url` |
| 240 | `POST /facturen` |
| 801 | `POST /facturen/:id/bevestig-inkoop` |
| 936 | `PATCH /facturen/:id` |
| 1007 | `POST /facturen/:id/ai-uitlezen` |
| 1110 | `POST /facturen/:id/ter-goedkeuring-indienen` |
| 1847 | `POST /facturen/:id/beoordelen-medewerker` |
| 1928 | `POST /facturen/:id/opmerkingen` |
| 1961 | `PATCH /facturen/:id/opmerkingen/:oid` |

Til die negen naar niveau 2. Dat is geen extra werk maar de voorwaarde: zonder deze stap krijgt de externe boekhouder schrijfrechten op de facturen terwijl er "meekijken" bedoeld is. Het raakt bovendien elk ander profiel dat nu op niveau 1 staat — die konden dit ook al.

De eerste twee vragen aandacht: een factuur aanmaken en een uploadadres opvragen horen bij het aanleveren van inkoopfacturen, en dat doet mogelijk iemand die verder alleen leest. Kom je daar een gebruiker tegen die na de wijziging vastloopt, meld dat dan met naam en profiel in plaats van de route terug te zetten.

## 2. HRM-adviseur mag gebruikers alleen inzien

Het profiel "HRM-adviseur" heeft nu volledig beheer op `gebruikers`. Daarmee kan iemand accounts aanmaken, verwijderen en de rechten van iedereen wijzigen, inclusief die van de eigenaar. Dat is te ruim: het onboarden gebeurt niet vanuit deze rol.

Zet `gebruikers` terug naar niveau 1, inzien. De overige rechten van dit profiel blijven zoals ze zijn.

Dat is hier veilig: nagemeten hangt achter `gebruikers` niveau 1 precies één route, `GET /gebruikers` op regel 269. Al het overige — aanmaken, wijzigen, uitnodigen, wachtwoord opnieuw instellen — staat op niveau 4. Deze wijziging hoeft dus verder niets te repareren.

## 3. Bestaande accounts moeten apart bijgewerkt

Bevoegdheden staan per gebruiker opgeslagen als eigen kolom; de veertien profielen zijn alleen sjablonen die bij het aanmaken worden toegepast. Een profielwijziging verandert dus niets voor iemand die al een account heeft.

Werk na beide wijzigingen de bestaande accounts bij die op deze twee profielen zijn aangemaakt, en zorg dat het aantal bijgewerkte accounts in het opleverbewijs staat.

---

## 4. Klaarzetten en doorzetten worden twee handelingen

**Wat er nu is.** Een Poortwachter-mijlpaal heeft een deadline, een moment van afronden, een notitie en de gebruiker die hem bijwerkte. Eén handeling, één persoon, klaar. Wie personeel mag wijzigen kan elke mijlpaal definitief afronden.

**Wat er moet komen.** Twee stappen achter elkaar, met twee verschillende mensen:

**Klaarzetten.** Wie personeel mag wijzigen kan een mijlpaal invullen met de stukken en de notitie erbij, en klaarzetten voor vrijgave. Vastgelegd wordt wie dat deed en wanneer. De mijlpaal telt op dat moment nog niet als afgerond.

**Doorzetten.** Alleen wie de nieuwe bevoegdheid `hrm_vrijgave` heeft kan een klaargezette mijlpaal vrijgeven. Pas dan geldt hij als afgerond en pas dan telt hij mee in de deadlinebewaking. Ook hier wordt vastgelegd wie en wanneer.

**Terugsturen hoort erbij.** Wie mag vrijgeven, moet ook kunnen terugsturen met een reden. De mijlpaal gaat dan terug naar klaarzetten en degene die hem klaarzette ziet die reden.

Voeg de bevoegdheid `hrm_vrijgave` toe aan de sleutellijst: niveau 1 is zien wat er klaarstaat, niveau 3 is vrijgeven en terugsturen. Geef hem in de profielen alleen aan HRM-adviseur en Directie.

**Waarom een aparte sleutel en niet een hoger niveau.** Rangorde tussen twee mensen is met niveaus niet uit te drukken: elk niveau dat hoog genoeg is om alleen de één binnen te laten, laat ook iedereen daarboven binnen en sluit de ander uit van dingen die ze wél moet kunnen. Een eigen sleutel laat de bestaande rechten van iedereen ongemoeid.

**En de deadlinebewaking moet mee.** Een mijlpaal die klaarstaat maar nog niet is vrijgegeven, is niet afgerond — de deadline loopt door. Staat er iets langer dan drie dagen klaar zonder vrijgave, dan hoort dat automatisch als taak bij degene met de vrijgavebevoegdheid te verschijnen, in dezelfde werkbak waar het overige werk binnenkomt. Geen mail, geen melding in een logboek: een taak die blijft staan tot hij is afgehandeld.

**De bestaande dossiers.** Alles wat nu al afgerond is blijft afgerond; die gaan niet met terugwerkende kracht opnieuw langs een vrijgave.

---

## Wat er opgeleverd moet worden

Per punt: welke routes van niveau veranderd zijn, en hoeveel bestaande accounts zijn bijgewerkt. Van punt 4: een dossier waarin te zien is dat klaarzetten en vrijgeven door twee verschillende mensen gebeurd zijn, inclusief het terugsturen.
