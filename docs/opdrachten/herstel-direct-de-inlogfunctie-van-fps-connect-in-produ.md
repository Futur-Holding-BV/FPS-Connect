HERSTEL DIRECT DE INLOGFUNCTIE VAN FPS CONNECT IN PRODUCTIE.

Voor FPS Connect bestaat maar één geldige werkelijkheid:

https://connect.fps-one.nl

Sinds de laatste deployments kan ik niet meer inloggen in Connect. Dit is een kritieke productie-uitval.

Stop alle niet-noodzakelijke deployments en voer geen nieuwe functionele wijzigingen uit totdat inloggen weer werkt.

Onderzoek onmiddellijk:

- welke commit nu live draait op connect.fps-one.nl
- welke commit de laatste aantoonbaar werkende productieversie was
- of frontend en backend dezelfde commit draaien
- of de login-API bereikbaar is
- of de productie-API gezond is
- of de productiedatabase bereikbaar is
- of gebruikersgegevens nog aanwezig zijn
- of wachtwoordhashes of gebruikersrecords zijn gewijzigd
- of sessie- en authenticatiesleutels correct zijn geladen
- of SESSION_SECRET, JWT-secret, cookie-instellingen of andere auth-variabelen ontbreken
- of cookies door secure, sameSite, domain of proxy-instellingen worden geblokkeerd
- of de reverse proxy correcte headers doorgeeft
- of recente database-migrations de login of gebruikersrechten hebben beschadigd
- of de verplichte wachtwoordwijziging gebruikers blokkeert
- of rate limiting of account lockout onterecht actief is
- of de recente HRM-, rechten-, post-merge-, scroll- of Document Intelligence-wijzigingen de authenticatieketen hebben geraakt
- welke fout in browserconsole, netwerkverkeer en productielogs optreedt bij een loginpoging

Gebruik geen reset van alle gebruikers, geen verwijdering van accounts en geen wijziging van bestaande wachtwoorden als algemene oplossing.

Herstel eerst de bestaande authenticatieketen.

Wanneer de huidige productieversie niet snel en veilig kan worden hersteld:

- rol onmiddellijk terug naar de laatste aantoonbaar werkende productiecommit
- herstel frontend, backend en database naar een onderling passende release
- behoud alle bestaande productiegegevens
- voer geen destructieve database rollback uit zonder veilige controle

Controleer rechtstreeks op:

https://connect.fps-one.nl

Test minimaal:

1. De loginpagina opent.
2. Een bestaande beheerder kan inloggen.
3. René Vink kan inloggen.
4. Jacqueline kan inloggen.
5. Ruben kan inloggen.
6. Na inloggen opent het dashboard.
7. Pagina vernieuwen behoudt de sessie.
8. Uitloggen en opnieuw inloggen werkt.
9. Er ontstaat geen verplichte wachtwoordlus.
10. Bestaande gebruikers, rollen en gegevens blijven aanwezig.

Niet afronden met:

- diagnose
- codewijziging
- typecheck
- checkpoint
- Ready for review
- commit
- push
- deployment gestart
- verwachte werking

Voer de herstelactie daadwerkelijk uit in productie.

Meld pas gereed wanneer bestaande gebruikers aantoonbaar weer kunnen inloggen op connect.fps-one.nl.

De gewenste eindmelding is uitsluitend:

Opgelost: inloggen werkt weer op connect.fps-one.nl.

Wanneer herstel wordt geblokkeerd door een concrete externe toegang of ontbrekende secret, meld uitsluitend die exacte blokkade en meld de taak niet als opgelost.