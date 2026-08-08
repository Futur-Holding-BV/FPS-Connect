---
name: Mail-samenwerkomgeving (MAIL_01)
description: Duurzame regels voor de gedeelde werk-inbox — mailbox-eigenaarschap, rechten, modus, presence en pijplijnkoppeling.
---

# Mail-samenwerkomgeving

- **Mailboxen zijn organisatiebezit.** `werk_inbox_mailboxen` heeft géén `gebruiker_id` meer; toegang loopt uitsluitend via `werk_inbox_mailbox_toegang` (recht: lezen < behandelen < beheren, helper `rechtDekt`). Mails zijn uniek per (mailbox_adres, message_id) — nooit meer per gebruiker filteren.
  **Why:** vóór migratie 0009 verdween een mailbox met de eigenaar mee; samenwerking vereist gedeeld bezit.
  **How to apply:** elke nieuwe werk-inbox-query/route via `werkInboxToegang.ts` (fail-closed); hoofdbeheerder-check via DB-rol (sessie heeft geen rol).
- **Modus per mailbox** (`verwerken|ondersteunen|registreren`): automatische pijplijnen (factuur/aanvraag) selecteren op `actief + modus='verwerken' + vlag`; de vlaggen `is_factuurmailbox`/`is_aanvraagmailbox` zijn bewust behouden als verfijning bínnen verwerken. `registreren` ⇒ AI-analyse 422. In `ondersteunen` mag AI nooit zelf handelen.
- **Graph-toegang is persoonlijk:** syncen/lezen/antwoorden gebeurt met het token van de gebruiker zelf, anders dat van de laatste syncer (`graphContext`). Exchange-rechten worden alleen getoond (probe), nooit beheerd door Connect.
- **Detail-route is Graph-tolerant:** meta/status/opmerkingen/presence blijven werken als Microsoft 365 faalt (`inhoud_waarschuwing` i.p.v. 502) — de samenwerkomgeving mag niet omvallen door een Microsoft-storing.
- **Presence** is in-memory (Map per messageId, TTL 20s) in `werkInboxToegang.ts`; frontend stuurt elke 8s een heartbeat (`bekijkt|typt|weg`) via setInterval. Niet persistent, bewust simpel.
- **Interne opmerkingen** zijn gedeeld (per bericht, niet per gebruiker), amber gestyled met "nooit zichtbaar voor de klant", en staan volledig los van de antwoord-composer — tekst mag nooit in het antwoordveld terechtkomen.
- **Achtergrondlus** (factuurstroomService): sync per token-gebruiker met toegang tot een verwerk-mailbox; de pijplijnen zelf zijn mailbox-gedreven en draaien één keer per lus (claim op mailbox+message voorkomt dubbelverwerking).
