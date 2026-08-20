---
name: Bankafschriftimport
description: Fail-closed regels voor CAMT-inname, mailboxclaims, betaalbatchbewijs en AccountView-crashherstel.
---

CAMT.053 is de leidende bankbron; upload en Microsoft-postvak moeten dezelfde
import- en aflettermotor blijven gebruiken. MT940 is alleen een expliciet
gelabelde legacy-terugval. Een onbekend of dubbelzinnig IBAN, een onbetrouwbare
bankreferentie of een saldoaansluitingsfout weigert het hele bestand.

**Why:** Geldstatussen mogen niet ontstaan uit een gedeeltelijk verwerkt
bestand of uit een gegokte identiteit. Twee innameroutes met verschillende
regels zouden bovendien verschillende financiële uitkomsten kunnen geven.

**How to apply:** Nieuwe innamekanalen roepen de centrale motor aan en voegen
geen eigen parsing, matching of deduplicatie toe. Alleen één exacte kandidaat
met volledig passend bedrag mag automatisch worden afgeletterd.

Bankafschriftinname is EUR-only totdat een afzonderlijk, auditeerbaar
valutaconversie-ontwerp bestaat. Rekening-, balans-, entry- en
transactiedetailvaluta moeten expliciet EUR zijn; financiële bedragen moeten een
volledig decimaal met maximaal twee decimalen zijn en CAMT-richting moet exact
`CRDT` of `DBIT` zijn.

**Why:** Een bedrag van USD 100 numeriek als 10.000 eurocent behandelen kan een
€100-factuur of betaalbatch ten onrechte sluiten. Tolerante parsers zoals
`parseFloat` accepteren bovendien numerieke voorvoegsels in ongeldige invoer.

**How to apply:** Weiger het hele bestand vóór opslag of matching bij iedere
niet-EUR of ontbrekende valuta, onvolledig bedrag of onbekende richting. Voeg
geen impliciete FX-conversie of standaard-creditrichting toe. Als CAMT
transactiedetails bevat, moet één detail exact gelijk zijn aan het `Ntry`-bedrag
of moet de som van meerdere details daar exact op aansluiten. Bereken alle
statement- en importaggregaten met `BigInt`; individueel veilige `number`-centen
kunnen bij grote, elkaar opheffende reeksen alsnog stil afronden.

Mailboxclaims zijn leasegebonden; alleen de houder van het actuele claimtoken
mag een bijlage afronden, verwijderen of permanent laten mislukken. De centrale
importmotor muteert mailboxclaims niet zelf.

**Why:** Een oude worker kan na lease-overname alsnog terugkomen. Zonder
tokeneigendom kan die de claim van de nieuwe worker overschrijven en een mail
ten onrechte als verwerkt markeren.

**How to apply:** Houd claim/finalisatie in de mailboxlaag en neem het actuele
token op in iedere mutatievoorwaarde.

Een handmatig bevestigde betaalbatch blijft `bevestigd` zolang er geen compleet
afschriftbewijs is. Als een later afschrift alle batchregels exact bewijst,
wordt de batch pas dan `uitgevoerd` en krijgt hij het importbewijs.

**Why:** Handmatige bevestiging en objectief bankbewijs zijn verschillende
toestanden, maar een oudere handmatige toestand mag later wel door werkelijk
bankbewijs worden opgewaardeerd.

**How to apply:** Zet `uitgevoerd` uitsluitend transactioneel vanuit complete
gematchte batchregels; nooit vanuit de handmatige bevestigingsactie zelf.

Een AccountView-POST zonder eenduidige uitkomst (geen HTTP-respons, 408 of 5xx)
wordt `onzeker` en nooit automatisch opnieuw verstuurd. Bevestigen van een
bestaande boeking of vrijgeven voor één nieuwe poging vereist expliciete
menselijke controle en audit.

**Why:** AccountView kan de boeking al hebben opgeslagen terwijl Connect de
respons mist. Een gewone retry kan dan dubbel boeken.

**How to apply:** Alleen aantoonbaar negatieve validatiereacties zijn
retrybaar `mislukt`; onzekere uitkomsten gaan door de herstelworkflow en
late callbacks schrijven alleen audit/meldingen als hun claimtoken nog geldig
is.