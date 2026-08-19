# CI-deploypoort — instructiekaart en bewijs van beproeving

## Wat is de CI-deploypoort?

Elke automatische push naar `main` passeert voortaan een **CI-poort**: de deploy-workflow controleert bij GitHub of de CI (kwaliteitscontrole) op diezelfde commit geslaagd is. Is de CI rood of nog niet klaar, dan stopt de deploy met een duidelijke foutmelding en rolt er niets uit.

Zo kan geen code meer naar productie gaan die de typecheck, de dubbele-routes-controle, de klantloos-controle of de sessieveld-controle niet haalt.

---

## Noodfix: wat doe je als productie plat ligt en CI rood staat?

**Stap 1 — Ga naar GitHub Actions**

Navigeer in je browser naar de GitHub-pagina van het project. Klik bovenin op het tabblad **Actions**.

**Stap 2 — Kies de deploy-workflow**

In de linkerkolom zie je een lijst van workflows. Klik op **"Deploy naar productie"**.

**Stap 3 — Start een handmatige run**

Klik rechtsboven op de knop **"Run workflow"** (grijze dropdown). Er verschijnt een klein formulier.

**Stap 4 — Vul de noodfix-reden in**

In het veld **"noodfix_reden"** typ je een korte maar duidelijke omschrijving van waarom je de CI-poort nu omzeilt, bijvoorbeeld:

> Critieke loginbug in productie — CI rood door flakey migratietest, bug zit niet in deze commit.

**Laat het veld leeg = geen noodfix**, de CI-poort blijft dan gewoon actief.

**Stap 5 — Klik op "Run workflow"**

De deploy start. In de run-log zie je bovenaan een waarschuwingsregel (geel):

```
Warning: NOODFIX ACTIEF — CI-poort en pre-deploy controles bewust omzeild.
  Commit  : <SHA van de commit>
  Tijdstip: <datum en tijd UTC>
  Persoon : <jouw GitHub-gebruikersnaam>
  Reden   : <de tekst die jij invulde>
```

**Stap 6 — Controleer je e-mail**

Binnen enkele seconden ontvang je een e-mail met als onderwerp:

```
FPS Connect: NOODFIX — CI-poort omzeild door <jouw naam>
```

De e-mail bevat de commit-SHA, het tijdstip, jouw naam en de opgegeven reden. Bewaar deze e-mail als documentatie van de ingreep.

**Stap 7 — Controleer productie na de deploy**

Als de run geslaagd is, controleer je:

- `https://connect.fps-one.nl/api/healthz` → moet `{"status":"ok"}` tonen
- `https://connect.fps-one.nl/api/versie` → moet de commit-SHA van de betreffende commit tonen

**Stap 8 — Herstel de CI zo snel mogelijk**

Een noodfix is een uitzondering, geen routine. Zorg dat de CI zo snel mogelijk weer groen is zodat de gewone bescherming terugwerkt.

---

## Wat wordt er vastgelegd?

Elk gebruik van de noodfix wordt op **drie plekken** zichtbaar:

| Plek | Wat staat er |
|------|-------------|
| GitHub Actions run-log | Commit-SHA, tijdstip, GitHub-actor, reden (zichtbaar voor iedereen met toegang tot Actions) |
| E-mail naar René | Zelfde gegevens, onderwerp "NOODFIX — CI-poort omzeild" |
| GitHub Actions-geschiedenis | De handmatige run is zichtbaar in de lijst van workflow-runs met wie hem gestart heeft |

---

## Bewijs van beproeving

### Status: live beproeving geslaagd

Op **19 augustus 2026** is de poort live beproefd met een echte push naar
`main`. De test was een tijdelijke, bewust fout gemaakte unit-testverwachting;
deze is in de daaropvolgende herstelcommit teruggezet.

#### Rode commit — deploy geblokkeerd

```
Commit-SHA       : c5afe0728710860ba118fcc79c291239fd1815c7
CI-run           : https://github.com/Futur-Holding-BV/FPS-Connect/actions/runs/32218399407
Deploy-run       : https://github.com/Futur-Holding-BV/FPS-Connect/actions/runs/32218399401
CI afgerond      : 2026-08-19 05:13:04 UTC (failure)
Deploy afgerond  : 2026-08-19 05:13:14 UTC (failure)
```

De CI-job faalde in **Contract-bewaking unit-tests** op de bewuste
verwachting `2026-04-31`; de werkelijke uitkomst was `2026-04-30`.
De deploy-job stopte vervolgens met:

```
CI-POORT GEBLOKKEERD: de CI-run op commit c5afe0728710860ba118fcc79c291239fd1815c7 is rood.
Gefaalde CI-jobs: Typecheck & build (failure)
```

De stappen **SSH-sleutel en hostkey instellen**, **Deployscript naar de server
kopiëren**, **Deploy uitvoeren op de VPS** en **Smoketest uitvoeren** zijn in
deze run allemaal overgeslagen. Daarmee is bewezen dat de rode CI-run de
productieserver niet bereikt.

#### Groene herstelcommit — deploy gaat door

```
Commit-SHA       : d0e94072ec653af1385b4d2070689eec3c70bdb6
CI-run           : https://github.com/Futur-Holding-BV/FPS-Connect/actions/runs/32218681980
Deploy-run       : https://github.com/Futur-Holding-BV/FPS-Connect/actions/runs/32218681878
CI afgerond      : 2026-08-19 05:17:30 UTC (success)
Deploy afgerond  : 2026-08-19 05:25:40 UTC (success)
```

In de groene deploy-run waren **CI-poort — controleer CI-status op deze
commit**, **Deploy uitvoeren op de VPS** en **Smoketest uitvoeren** alle drie
succesvol.

#### Prod-gezondheid na de groene deploy

Na de groene run is productie extern gecontroleerd:

- `GET https://connect.fps-one.nl/api/healthz` → `{"status":"ok"}` (HTTP 200)
- `GET https://connect.fps-one.nl/api/versie` → `{"commit":"d0e94072"}`,
  `achterloop:false` (HTTP 200)
- `GET https://connect.fps-one.nl/api/versie/status` → `db=ok`,
  `opslag=ok`, `mail=ok`, `ai=ok` (HTTP 200)

---

## Veelgestelde vragen

**Kan iemand de poort omzeilen zonder noodfix_reden?**
Nee. Een gewone `git push` naar `main` loopt altijd door de CI-poort. Alleen een handmatige workflow_dispatch met een niet-lege noodfix_reden slaat de poort over — en stuurt dan direct een verplichte audit-e-mail naar René. Als die mail niet verstuurd kan worden (ontbrekende mailconfiguratie of Graph-fout), wordt de noodfix-run zelf geblokkeerd.

**Wat als de mailconfiguratie ontbreekt?**
Dan kan de noodfix-route niet gebruikt worden: de workflow stopt vóór de deploy met een duidelijke foutmelding. Zorg dat AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET en RENE_ALERT_EMAIL als GitHub Actions secrets zijn geconfigureerd.

**Wat als ik per ongeluk een noodfix start?**
Je kunt de run annuleren via de "Cancel workflow"-knop in GitHub Actions voordat de deploy de server bereikt. De e-mail is al verstuurd, maar productie is niet aangeraakt (de server wordt pas aangeraakt ná de controles).

**Werkt handmatige dispatch op een andere tak dan main?**
Ja. Handmatige dispatch op een tak (terugvaltest-pad, b.v. om een feature-branch te testen) slaat de CI-poort automatisch over zonder dat je een noodfix_reden hoeft op te geven. Er wordt dan ook geen noodfix-melding gestuurd.

**Wat als de CI nog bezig is op het moment van de push?**
De CI-poort wacht maximaal 20 minuten. Als de CI daarna nog niet klaar is, stopt
de deploy met een duidelijke melding. Dit voorkomt dat een normale CI-run door
de gelijktijdige start van CI en deploy onterecht als ontbrekend of bezig wordt
geblokkeerd.
