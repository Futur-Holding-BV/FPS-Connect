---
name: Connect-assistent & zijrand
description: Architectuur van de ASSISTENT_01-assistent — zijrand-paneel, paginacontext, gegevens-tools met rechten in de query
---

# Connect-assistent (ASSISTENT_01)

- **Eén chatonderdeel**: `ai-chat-panel.tsx` (presentatie) hergebruikt door `assistent-inhoud.tsx`; zijrand = `zijrand-paneel.tsx` (tabs Werkbak/Assistent, localStorage `fps.zijrand.open`/`fps.zijrand.tab`, paneel blijft gemount bij dicht zodat het gesprek bewaard blijft). Mobiel (<640px) → eigen scherm `/assistent`. Nooit een tweede chatcomponent of zwevende bubble toevoegen.
- **Paginacontext**: centrale route→context-afleiding in `firevault/src/lib/assistent-context.tsx` (provider binnen WouterRouter); detailpagina's zetten etiket via `useZetAssistentLabel`. Context gaat mee in `POST /adviseur/vraag` (`context {scherm, object_type, object_id}`); server bouwt bundel via `bouwContextBundel` + `req.permissies`. **Nooit** AI aanroepen bij pagina-openen.
- **Gegevens-tools**: alleen-lezen tools in `routes/adviseur.ts` (DATA_TOOLS); elke uitvoerder checkt modulerecht/gebouw-scoping vóór de query en retourneert bij geen recht `{geweigerd, reden}` die de AI letterlijk doorgeeft; elk resultaat draagt bron + peildatum. Nieuwe gegevensvraag = tool toevoegen in dit patroon, geen prompt-afscherming.
- **Feitelijke antwoorden**: de server geeft per beurt gesloten bron-id's uit. Een feitelijke modelclaim zonder bekende bron-id wordt nooit getoond; de server bouwt antwoord en klik-veilige citaties alleen uit gevalideerde claims. Een generieke bron achteraf toevoegen is verboden.
- **Historie is ook geautoriseerde data**: gesprekselectie omvat een hash van de actuele module-, object- en gebouwscope. Rechtenwijziging binnen dezelfde rol moet een nieuw leeg gesprek geven; alleen actor+gebruiker+rol is onvoldoende.
- **Bronaudit**: een feitelijk antwoord bewaart atomair de claim→bron-id-koppeling plus alleen de gebruikte, begrensde broninhoud. Alleen labels/citaties bewaren is geen controleerbaar bewijs.
- **Gateway-tooling**: `aiGateway.chat` geeft `toolCalls` terug in het ok-resultaat (chat-completions function calling); tool-lus max 3 rondes in de route. Geen tweede AI-poort bouwen.
- **Connect-kennis**: `docs/connect-kennis.md` = onderhouden systeembeschrijving, integraal in de systeemprompt (5 min cache in adviseur-route). Systeemgedrag gewijzigd → dit bestand bijwerken, geen prompt in code.
- **Limieten**: dagplafond/gebruikerslimiet-fouten van de gateway worden als gewoon chat-antwoord in mensentaal teruggegeven (geen 502/429 naar de UI).

**Why:** afscherming moet in de gegevensvraag én in de toegang tot bewaarde historie zitten; prompt-only afscherming, prompt-only bronplicht en dubbele chat/AI-poorten zijn geen technische beveiligingsgrens en zijn expliciet verboden.
**E2E-valkuil:** Replit dev-banner (#replit-dev-banner) onderschept kliks rechtsboven — in tests eerst wegklikken.
