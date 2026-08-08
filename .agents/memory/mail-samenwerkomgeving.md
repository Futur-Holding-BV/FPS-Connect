---
name: Mail-samenwerkomgeving
description: Duurzame regels voor de gedeelde werk-inbox — mailbox-eigenaarschap, rechten, modus, presence en pijplijnkoppeling.
---

# Mail-samenwerkomgeving

- **Mailboxen zijn organisatiebezit.** Toegang loopt uitsluitend via de toegang-koppeltabel (recht: lezen < behandelen < beheren). Mails, notities en koppelingen zijn uniek/gescoped per (mailbox, bericht) — een Graph message-id is NIET globaal uniek, dus nooit alleen op message_id filteren of joinen.
  **Why:** vroeger verdween een mailbox met de eigenaar mee; samenwerking vereist gedeeld bezit, en message-id-botsingen tussen mailboxen zouden anders gedeelde context lekken.
  **How to apply:** elke nieuwe werk-inbox-query/route via de rechten-service (fail-closed); hoofdbeheerder-check via DB-rol (sessie heeft geen rol).
- **Samenwerkingsmutaties zijn conditioneel:** toewijzen/status accepteren een "verwachte oude stand" en geven 409 bij een tussentijdse wijziging door een collega; UI herlaadt dan. Nooit stille last-write-wins tussen behandelaren.
- **Modus per mailbox** (`verwerken|ondersteunen|registreren`): automatische pijplijnen (factuur/aanvraag) selecteren op `actief + modus='verwerken' + vlag`; de vlaggen `is_factuurmailbox`/`is_aanvraagmailbox` zijn bewust behouden als verfijning bínnen verwerken. `registreren` ⇒ AI-analyse 422. In `ondersteunen` mag AI nooit zelf handelen.
- **Graph-toegang is persoonlijk:** syncen/lezen/antwoorden gebeurt met het token van de gebruiker zelf, anders dat van de laatste syncer (`graphContext`). Exchange-rechten worden alleen getoond (probe), nooit beheerd door Connect.
- **Detail-route is Graph-tolerant:** meta/status/opmerkingen/presence blijven werken als Microsoft 365 faalt (`inhoud_waarschuwing` i.p.v. 502) — de samenwerkomgeving mag niet omvallen door een Microsoft-storing.
- **Presence** is in-memory (Map per messageId, TTL 20s) in `werkInboxToegang.ts`; frontend stuurt elke 8s een heartbeat (`bekijkt|typt|weg`) via setInterval. Niet persistent, bewust simpel.
- **Interne opmerkingen** zijn gedeeld (per bericht, niet per gebruiker), amber gestyled met "nooit zichtbaar voor de klant", en staan volledig los van de antwoord-composer — tekst mag nooit in het antwoordveld terechtkomen.
- **Achtergrondlus** (factuurstroomService): sync per token-gebruiker met toegang tot een verwerk-mailbox; de pijplijnen zelf zijn mailbox-gedreven en draaien één keer per lus (claim op mailbox+message voorkomt dubbelverwerking).
