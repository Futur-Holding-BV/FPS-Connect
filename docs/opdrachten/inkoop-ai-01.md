# INKOOP_AI_01 — Inkoop en werkbegroting op eigen cijfers

**Opdrachtgever:** René Vink · **Datum:** 7 augustus 2026 · **Uitvoerder:** Replit
**Systeem:** FPS Connect (`vinkrene-jpg/fps-one`, branch `main`)
**Zelfde principe als `CALCULATIE_AI_01`.** Lees die opdracht eerst; de regels daaruit gelden hier onverkort.

**Verplicht vooraf lezen:** `replit.md` · `docs/ontwikkelfilosofie.md` · `docs/kwaliteitskader.md` · `docs/PRODUCTION_RUNBOOK.md` · `.agents/memory/MEMORY.md`

---

## 1. Wat er al is, en wat eraan mankeert

**Gemeten op 7 augustus 2026.** De structuur is verrassend compleet — de intelligentie erin niet.

`inkoopplan_regels` heeft alle velden die je nodig hebt, en ze verraden dat de opzet al goed doordacht is:

| Veld | Bedoeld als |
|---|---|
| `calc_prijs` | de prijs uit de calculatie |
| `inkoopprijs_verwacht` | **AI-schatting van de marktprijs** |
| `inkoopprijs` | wat er definitief is vastgesteld |
| `aanbevolen_leverancier` | **AI-voorstel** |
| `besparing_per_eenheid` en `besparing` | het verschil met de calculatie |
| `levertijd_weken` | **AI-schatting** |
| `werkbegroting_regel_id` | de koppeling terug naar de werkbegroting |

Daaronder `inkoopbon_regels` met de werkelijk bestelde prijs.

**Maar de AI erachter stelt niets voor.** `INKOOP_PROMPT` is één zin: *"Je bent een ervaren inkoper brandpreventie. Geef altijd valide JSON terug."* Geen instructie, geen aandachtspunten, geen enkele context. Ter vergelijking: de calculatieprompt heeft twaalf uitgewerkte aandachtspunten.

Wat `inkoopprijs_verwacht` en `aanbevolen_leverancier` nu invullen, is dus een gok uit algemene modelkennis — niet uit wat FPS werkelijk betaalt.

**Voor de werkbegroting geldt hetzelfde.** `WERKBEGROTING_CHAT_BASE_PROMPT` bestaat, `werkbegroting_adviezen` bestaat als tabel, maar de begroting wordt niet getoetst aan wat vergelijkbaar werk werkelijk heeft gekost.

---

## 2. Het principe

Identiek aan `CALCULATIE_AI_01`: **de AI adviseert op FPS-cijfers, niet op algemene kennis.** Waar hij toch algemene kennis gebruikt, zegt hij dat erbij.

Sinds `FACTUUR_02` komen leveranciersfacturen gestructureerd binnen. Daarmee is voor het eerst bekend wat er wérkelijk betaald is — en dat is de bron die dit hele stuk pas mogelijk maakt.

---

## 3. Inkoop — wat de AI meekrijgt

### Blok A — Wat FPS zelf betaalde voor dit artikel

Per inkoopplanregel: de **mediaan, laagste en hoogste prijs** die FPS de afgelopen periode werkelijk betaalde voor hetzelfde of een vergelijkbaar artikel, met het aantal waarnemingen en de periode. Bron: inkoopbonregels en de binnengekomen facturen.

Dit vult `inkoopprijs_verwacht` met een gemeten waarde in plaats van een schatting.

**Minder dan drie waarnemingen: geen verwachting invullen.** Dan staat er dat het onbekend is. Een verzonnen marktprijs is erger dan een leeg veld, want er wordt straks een besparing tegen afgezet.

### Blok B — Welke leverancier, op grond waarvan

`aanbevolen_leverancier` wordt gevuld op basis van de eigen historie: wie leverde dit artikel eerder, tegen welke prijs, met welke levertijd. Niet op grond van een naam die het model kent.

Zijn er meerdere leveranciers met historie, dan noemt de AI ze met hun prijs erbij, in plaats van er één te kiezen. **De keuze blijft bij de inkoper.**

### Blok C — Prijsontwikkeling per leverancier

Is de prijs van deze leverancier voor dit artikel gestegen ten opzichte van eerdere leveringen, dan is dat een signaal — met de bedragen en de data erbij.

Dit is dezelfde bewaking als bij de AK-posten in `FINANCIEEL_AI_01`, maar dan op artikelniveau. Een leverancier die elk jaar vier procent verhoogt valt per keer niet op en over drie jaar wel.

### Blok D — Calculatie tegenover inkoop

`besparing` bestaat al als veld. Vul hem met betekenis: ligt de inkoopprijs structureel boven de calculatieprijs voor een bepaald soort werk, dan is dat geen inkoopprobleem maar een **calculatieprobleem** — en dat signaal hoort terug naar de calculatiekant.

**Dit is de belangrijkste terugkoppeling in deze hele opdracht.** Zonder dat blijft dezelfde fout elke calculatie herhaald worden.

### En de offerteaanvraag

`CALCULATIE_INKOOP_MAIL_PROMPT` schrijft al offerteaanvragen aan leveranciers. Geef die de eigen prijshistorie mee, zodat er om een gerichte prijs gevraagd kan worden in plaats van blanco.

---

## 4. Werkbegroting — wat de AI meekrijgt

De werkbegroting wordt automatisch uit de calculatie gemaakt, zonder opslagen en winst. De vraag is niet of hij klopt met de calculatie — dat doet hij per definitie — maar **of de aannames erin realistisch zijn.**

**Blok E — Vergelijkbaar werk, werkelijk besteed.** Per regelsoort: wat kostte dit bij eerdere, afgeronde opdrachten werkelijk? Uren én materiaal. Bron: nacalculatie, inkoopbonnen, geschreven uren.

**Blok F — Normtijden tegenover werkelijkheid.** De eenheidsprijzenbibliotheek bevat een `normtijd` per code. Wijkt de werkelijk bestede tijd bij eerdere opdrachten daar structureel van af, dan klopt de normtijd niet — en die werkt door in élke calculatie.

Dit is een advies met een lange staart: één verkeerde normtijd kost bij elk project geld.

**Blok G — De adviezen landen in de bestaande tabel.** `werkbegroting_adviezen` bestaat al met type, prioriteit, titel, uitleg en status. Gebruik die; bouw geen tweede.

---

## 5. Harde regels

- **Minder dan drie waarnemingen: geen prijsverwachting.** Onbekend is onbekend.
- **Mediaan, nooit gemiddelde.** Eén uitschieter mag het beeld niet bepalen.
- **Elk advies noemt de cijfers en de bron** — bedrag, aantal waarnemingen, periode.
- **Geen leverancierskeuze door de AI.** Hij toont de opties met hun historie; de inkoper kiest.
- **Waar algemene kennis wordt gebruikt in plaats van eigen cijfers, zegt de AI dat erbij.**
- **Geen tweede adviezentabel** naast `werkbegroting_adviezen`, geen tweede prijzenbron naast de eenheidsprijzen en de eigen inkoophistorie.
- **`INKOOP_PROMPT` van één zin naar een uitgewerkte prompt** met aandachtspunten, in de trant van de calculatieprompt. Eén zin is geen instructie.
- Niet melden dat het klaar is op grond van een geslaagde build of typecheck.

---

## 6. Acceptatie

Neem **twee echte inkoopplannen** en **één afgeronde opdracht** met werkbegroting.

1. Bij minstens één inkoopregel staat een verwachte prijs die aantoonbaar uit eigen betalingen komt, met het aantal waarnemingen erbij.
2. Bij een artikel met te weinig historie staat "onbekend" — geen geschat bedrag.
3. Er wordt geen leverancier gekozen; er worden er meerdere getoond met hun prijs en levertijd.
4. Bij minstens één artikel wordt een prijsstijging bij dezelfde leverancier gesignaleerd, met bedragen en data.
5. Waar de inkoopprijs structureel boven de calculatieprijs ligt, verschijnt een signaal richting de calculatiekant.
6. Bij de werkbegroting staat minstens één advies dat de begrote uren of materiaalkosten afzet tegen wat vergelijkbaar werk werkelijk kostte.
7. De adviezen staan in `werkbegroting_adviezen`, niet in een nieuwe tabel.

**Lever een vergelijking op:** hetzelfde inkoopplan met de oude en de nieuwe voorstellen naast elkaar, zodat zichtbaar is wat de eigen cijfers toevoegen.
