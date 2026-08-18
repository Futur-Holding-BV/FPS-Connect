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

### Status: beproeving nog uit te voeren

> ⚠️ **De noodfix-route is nog niet live beproefd.** De workflow-code is gereed en gemerged, maar de beproeving moet plaatsvinden nadat de code actief is op de `main`-branch van de repository (zie follow-up taak #1106). Vul de onderstaande velden in zodra de beproeving is uitgevoerd.

### In te vullen na beproeving

```
Actions-run URL  : https://github.com/<org>/<repo>/actions/runs/<run-id>
Commit-SHA       : <sha>
Tijdstip (UTC)   : <datum tijd>
GitHub-actor     : <gebruikersnaam>
Opgegeven reden  : <tekst die als noodfix_reden is ingevuld>

E-mail ontvangen : ja / nee
E-mail onderwerp : FPS Connect: NOODFIX — CI-poort omzeild door <naam>
E-mail inhoud    : (plak hier de eerste regels van de ontvangen e-mail)
```

### Prod-gezondheid na beproeving

Na de testrun controleren:

- `/api/healthz` → moet `{"status":"ok"}` tonen
- `/api/versie`  → moet de commit-SHA van de beproefde commit tonen

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
De CI-poort wacht maximaal 3 minuten. Als de CI daarna nog niet klaar is, stopt de deploy met een duidelijke melding. De CI haalt normaliter 1–3 minuten, dus dit is zelden een probleem.
