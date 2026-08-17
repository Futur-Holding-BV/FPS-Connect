MARKETING_01 — Marketing en commercie-coaching in FPS Connect

AANLEIDING
Tessa werkt op commercie. Marketing bestaat in Connect niet: er is geen campagne, nieuwsbrief, mailinglijst, doelgroep, webformulier of landingspagina, gemeten op commit 3c30cb1a. Bovendien heeft zij geen ervaring met commercie en marketing, dus het systeem moet haar niet alleen gereedschap geven maar ook leren hoe ze het gebruikt.

FASE 0 — NULMETING (eerst opleveren, dan pas bouwen)
Meet en rapporteer, zonder iets te wijzigen:
- welke velden crm_klanten, crm_contactpersonen en crm_communicatie hebben, en of ergens een toestemming of afmelding voor commerciële mail is vastgelegd
- hoe mail-wachtrij.ts en services/email.ts verzenden: per bericht, met welke afzender, en welke beveiliging tegen bounces er al in zit
- welke sjabloon- en huisstijlmiddelen bestaan (organisatie/documentopmaak, DocumentStudio) en of die voor mail herbruikbaar zijn
- hoe routes/adviseur.ts zijn paginacontext opbouwt en welke tools hij mag aanroepen
Meld afwijkingen tussen deze meting en de aanname hierboven vóór je verder gaat.

DEEL A — MARKETING
1. Doelgroepen. Een doelgroep is een bewaarde selectie op organisaties en contactpersonen (branche, plaats, relatietype, laatste contact, klant of prospect). Opslaan, hergebruiken, en altijd tonen hoeveel mensen erin vallen op dit moment.
2. Toestemming en afmelden. Elk contactpersoon krijgt vastgelegd of hij commerciële mail mag ontvangen, wanneer en waarop dat berust. Elke verzonden campagnemail bevat een werkende afmeldlink; afmelden werkt zonder inloggen en is direct zichtbaar bij de relatie. Wie geen toestemming heeft, valt automatisch uit elke doelgroep — dat mag niet met de hand te omzeilen zijn.
3. Campagnes. Een campagne heeft een naam, doel, doelgroep, sjabloon, verzendmoment en status (concept, gepland, verzonden, gestopt). Verzenden loopt over de bestaande mailwachtrij, gespreid in de tijd, niet als één stoot.
4. Sjablonen in de huisstijl, met velden die per ontvanger worden ingevuld (naam, organisatie). Altijd eerst een proefverzending naar jezelf voordat een campagne de deur uit kan.
5. Opvolgreeksen. Een reeks van twee of drie berichten met tussenpozen, die stopt zodra iemand reageert of afmeldt.
6. Registratie bij de relatie. Verzonden, geopend, geklikt, afgemeld en gebounced komen als gebeurtenis bij het contactpersoon in crm_communicatie te staan, zodat de commercieel medewerker de historie bij de relatie ziet en niet in een apart campagnescherm.
7. Leadinvoer vanaf de website. Een webformulier dat rechtstreeks een CRM-aanvraag aanmaakt, met herkomst erbij, zodat zichtbaar is welke campagne welke aanvraag opleverde.
8. Resultaat meetbaar maken. Koppel de verkoopkans aan de offerte waar hij uit voortkomt — die verwijzing ontbreekt nu, waardoor gewonnen en verloren met de hand wordt ingetypt en conversie niet te meten is. Zonder die koppeling is elk marketingcijfer een schatting.
9. Eén overzicht voor commercie: wat loopt er, wat leverde het op, en wat vraagt vandaag actie.

DEEL B — COACHING
De coaching komt in de bestaande assistent, niet in een nieuw chatvenster, en loopt over de bestaande AI-poort.
10. De assistent krijgt commercie- en marketingkennis mee: wat een pijplijnfase betekent, wanneer je opvolgt, hoe je een eerste contact legt, wat een goed onderwerp in een mail doet, wat je juist niet doet. In mensentaal, geen vakjargon zonder uitleg.
11. Uitleg op de plek zelf. Bij elk begrip op de CRM- en marketingschermen (fase, kanspercentage, waarde, herkomst) is met één tik te zien wat het betekent en wat je ermee doet.
12. Een dagstart voor commercie: wie is lang niet benaderd, welke kans staat stil, welke aanvraag wacht op antwoord. Concreet, met een voorstel wat te doen, niet alleen een lijst.
13. Meekijken op wat zij schrijft. Bij een mail of campagnetekst mag de assistent verbeteren en uitleggen waaróm, met de tekst van haar als uitgangspunt. Hij verzendt nooit zelf en verstuurt niets zonder haar akkoord.
14. Leren in kleine stappen: korte lessen van een paar minuten die aansluiten op wat ze op dat moment doet, niet een cursus vooraf. Wat af is blijft terugleesbaar.
15. De coach zegt het eerlijk als hij iets niet weet of als de cijfers te dun zijn voor een uitspraak.

RECHTEN
Het profiel Commercieel krijgt toegang tot marketing op hetzelfde niveau als CRM. Verzenden van een campagne is een aparte bevoegdheid: proefverzending en opstellen mag iedereen met marketingrecht, de echte verzending naar een doelgroep vraagt een hoger niveau. Meld welk niveau je voorstelt en waarom, wijzig niets zonder akkoord van René.

BEWIJS BIJ OPLEVERING
- een contactpersoon zonder toestemming zit aantoonbaar in geen enkele doelgroep, ook niet als je hem met de hand toevoegt
- een afmelding werkt zonder inloggen en is meteen zichtbaar bij de relatie
- een campagne kan niet verzonden worden zonder voorafgaande proefverzending
- een verzonden bericht staat als gebeurtenis bij het contactpersoon
- een aanvraag via het webformulier is in het CRM te herleiden tot de campagne
- de assistent geeft op een CRM-scherm een antwoord dat over dat scherm gaat

Toets elke aanname over module en niveau tegen de backendroute en meld afwijkingen — pas niets stilzwijgend aan. Wijk je af van de scope, meld dat vóór je bouwt.

Commit en push naar main als je klaar bent. Meld daarna de commit-SHA die je gepusht hebt.