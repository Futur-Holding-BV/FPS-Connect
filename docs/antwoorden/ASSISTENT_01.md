# ASSISTENT_01 — De Connect-assistent: altijd in beeld, contextbewust, gespecialiseerd

Datum: 8 augustus 2026 · basis-commit: cc98e45 (wijzigingen in de commit met deze notitie)

## Wat is er gebouwd

### Fase 1 — Altijd in beeld
- Eén vaste **rechterrand** in de layout (geen zwevend venster) met twee tabbladen: **Werkbak** en **Assistent** (`components/zijrand-paneel.tsx`). De bestaande chatcomponent `ai-chat-panel.tsx` wordt hergebruikt — er is geen tweede chatonderdeel; de oude zwevende `adviseur-chat.tsx` is verwijderd.
- Het paneel blijft gemount bij dichtklappen, dus het gesprek blijft staan. De open/dicht-stand en het gekozen tabblad worden onthouden (localStorage `fps.zijrand.open` / `fps.zijrand.tab`).
- Op telefoon (<640 px) opent de assistent als **eigen scherm** (`/assistent`, ook als nav-item in monteur- en klantportaal) — geen zwevend venster.
- Bewijs: e2e-test `scripts/e2e/web-zijrand-assistent.spec.ts` (groen): knoppen zichtbaar, paneel met beide tabs, contextregel, open/dicht onthouden na herladen.

### Fase 2 — Weten waar je bent
- Elke vraag stuurt mee waar de gebruiker is: `context {scherm, object_type, object_id}` (nieuw veld op `POST /adviseur/vraag`). Eén centrale route→context-afleiding (`lib/assistent-context.tsx`); detailpagina's kunnen een leesbaar etiket zetten (offerte-nummer, gebouwnaam).
- Het paneel toont zichtbaar waarover de assistent praat: **"Je kijkt naar: …"** boven de chat. Bij wissel van object start een nieuw gesprek, zodat antwoorden nooit over het verkeerde object gaan.
- Er is **geen** automatische AI-aanroep bij het openen van een pagina; context gaat pas mee als de gebruiker zelf een vraag stelt.

**Meldpunt 1 — wat doet de bestaande `ai-context` route?**
`GET /beheer/ai-context` (hoofdbeheerder-only) is een diagnosevenster op de **AI Context Service** (`lib/aiContext`): een motor die rond één entiteit (gebouw, spot, offerte, medewerker, document, dossier, onderhoud, klant) een geautoriseerde contextbundel opbouwt — met scoping via de PermissieService (bevoegdhedenmatrix + gebouwtoewijzing, incl. "bekijken als"), een tokenbudget en een expliciete lijst van weggelaten knopen. **Ja, dat was precies de aanzet voor fase 2**: de assistent gebruikt nu dezelfde motor (`bouwContextBundel`) met de effectieve permissies van de vragende gebruiker. Ziet de gebruiker het object niet, dan krijgt de AI er niets van te zien — de afscherming zit in de gegevensopvraging, niet in de prompt.

### Fase 3 — Gespecialiseerd
- **5.1 Connect-kennis in de repo:** `docs/connect-kennis.md` is de onderhouden systeembeschrijving (keten aanvraag→factuur, kernbegrippen, rollenmodel, veelvoorkomende "waarom"-vragen). De adviseur-route leest dit bestand van schijf (cache 5 min) en zet het integraal in de systeemprompt. Wijzigt Connect, dan werk je dít bestand bij — geen verouderende prompt in de code.
- **5.2 Gegevensvragen:** de assistent kan feitelijke vragen beantwoorden via vijf alleen-lezen tools (tel_offertes, tel_facturen, tel_opdrachten, tel_gebouwen, mijn_werkbak). Elke tool controleert **eerst het modulerecht van de vragende gebruiker** en past gebouw-scoping toe; geen recht → expliciete weigering die de AI letterlijk moet doorgeven. Elk resultaat draagt **bron + peildatum**, en de prompt eist herkomst bij elk getal ("volgens de offertes-tabel per 8 augustus"). De assistent wijzigt nooit iets (er bestaan alleen lees-tools). De tool-lus loopt via de bestaande `aiGateway` (kleine uitbreiding: tool-aanroepen worden doorgegeven i.p.v. als "geen inhoud" te falen) — er is geen tweede AI-poort.
- Dagplafond of vraaglimiet bereikt → melding in gewone taal in de chat zelf ("Het dagelijkse AI-budget van FPS Connect is op…").

## Bewijs (dev, 8 aug — `scripts/src/verificatie-assistent01.ts`, alles groen)
Dezelfde vraag ("hoeveel offertes per status en hoeveel inkoopfacturen?") door drie gebruikers:
- **Hoofdbeheerder** → echte aantallen mét herkomst en peildatum.
- **Beperkte gebruiker (alleen offertes: lezen)** → offerte-telling wel, facturen: *"mag ik niet voor jou opvragen — geen leesrecht op financieel"*.
- **Monteur-achtig (gebouwen/voorzieningen)** → weigering voor beide, géén verzonnen cijfers.
Plus: contextvraag op een open gebouw → assistent vat exact dát gebouw samen (naam, adres, status) met bronvermelding.

**Meldpunt 2 — kosten:** zie `docs/metingen/ASSISTENT_01_kosten.md`. Kort: ~€0,006 per aanroep gemeten; een gemiddeld gesprek (5 vragen, soms met tool-vervolgronde) ≈ **€0,05**. Bij dagelijks gebruik door 10 collega's ≈ €0,50 per dag / ~€11 per maand — ruim binnen het dagplafond van €25.

## Bewuste keuzes / restpunten
- De werkbak-tab bestaat alleen in het beheerdersportaal (daar leefde de werkbak al); monteur- en klantportaal hebben alleen de assistent.
- De afbeeldingsknop van het chatpaneel blijft zichtbaar maar de adviseur-route verwerkt nog geen afbeeldingen; een foto meesturen heeft daar nu geen effect.
- De vijf gegevens-tools zijn een startset; nieuwe gegevensvragen = een tool toevoegen in `routes/adviseur.ts` met dezelfde rechtencheck-opbouw.
