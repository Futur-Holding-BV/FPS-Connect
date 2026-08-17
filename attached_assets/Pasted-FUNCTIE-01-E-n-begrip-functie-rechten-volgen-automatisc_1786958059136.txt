FUNCTIE_01 — Eén begrip functie, rechten volgen automatisch

AANLEIDING
Het aannemen van een timmerman bij FPS Bouw & Renovatie liep vast: de functie was nergens te kiezen. Gemeten oorzaak: hetzelfde begrip bestaat op drie plekken die niets van elkaar weten. Als profiel in lib/permissies (de rechtenmatrix met veertien presets), als functietitel in een hardgecodeerde lijst in routes/gebruikers.ts, en als functie in de HRM-tabel functies, die per werkmaatschappij handmatig moet worden aangemaakt en niets vooraf gevuld krijgt.

DEEL A — ÉÉN LIJST FUNCTIES
Er komt één bedrijfsbrede lijst functies. Per functie wordt vastgelegd bij welke werkmaatschappijen hij voorkomt — dat mogen er meerdere zijn.

Vaste uitgangssituatie van FPS: Timmerman komt alleen voor bij FPS Bouw & Renovatie; alle overige functies komen voor bij zowel FPS Bouw als FPS Brandpreventie. Richt de lijst zo in.

De huidige opzet waarin functies per werkmaatschappij worden aangemaakt vervalt. Bestaande functies worden samengevoegd zonder dat er gegevens of koppelingen verloren gaan; medewerkers houden hun functie.

De hardgecodeerde lijst functietitels in routes/gebruikers.ts vervalt eveneens. Overal waar een functie gekozen wordt, komt die uit deze ene lijst.

DEEL B — RECHTEN HANGEN AAN DE FUNCTIE
Elke functie krijgt een rechtenprofiel als sjabloon, en de vlag of het een uitvoerende functie is (bepaalt of iemand in de planning verschijnt). Vul dat bij het inrichten in op basis van de bestaande veertien profielen.

Wie een functie krijgt, krijgt de rechten van die functie — automatisch, niet handmatig na te lopen.

Wijzigt het rechtensjabloon van een functie, dan werkt dat door bij iedereen met die functie. Gemeten aandachtspunt: bevoegdheden staan nu per gebruiker vastgelegd en de profielen worden alleen bij het aanmaken toegepast, dus een wijziging raakt bestaande accounts niet. Dat moet veranderen, inclusief het bijwerken van de accounts die er al zijn.

Per persoon kunnen afwijkingen op het functiesjabloon worden gezet. Die zijn zichtbaar als afwijking, met wie ze gaf en wanneer, en ze blijven staan als het sjabloon wijzigt.

DEEL C — ONBOARDEN IN ÉÉN HANDELING
Bij het aannemen kies je persoon, werkmaatschappij en functie. Rechten, planning-zichtbaarheid en toegang volgen daaruit.

Bestaat de functie nog niet, dan maak je hem aan vanuit datzelfde scherm — met een voorstel voor het rechtensjabloon op basis van de gelijknamige bestaande profielen. Geen omweg naar een ander menu.

Aan het eind toont het scherm in gewone taal wat deze persoon straks kan en ziet, zodat controleerbaar is of het klopt vóór de aanstelling rond is.

BEWIJS BIJ OPLEVERING
Een nieuwe medewerker met functie Timmerman bij FPS Bouw & Renovatie kan in één doorloop worden aangenomen, verschijnt in de planning en heeft de rechten van het timmermansprofiel, zonder dat er vooraf iets is klaargezet. Een wijziging aan het rechtensjabloon van een functie is aantoonbaar doorgewerkt bij bestaande medewerkers met die functie, behalve waar een afwijking is vastgelegd.

Toets elke aanname over module en niveau tegen de backendroute en meld afwijkingen — pas niets stilzwijgend aan. Wijk je af van de scope, meld dat vóór je bouwt.

Commit en push naar main als je klaar bent. Meld