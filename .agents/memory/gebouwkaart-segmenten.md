---
name: Gebouwkaart segmenten & projectformulier
description: detail.tsx 3-segment tabbladen + bewerkbare/bevestigbare AI-projectsamenvatting met CRM-contactbeheer
---

# Gebouwkaart (gebouwen/detail.tsx)

- De drie segmenten (Project & gegevens / Uitvoering / Beheer) staan in een `Tabs`
  (shadcn). Kop + actieknoppen (Bewerken, Gereedmelden, PDF, Stappenplan) blijven
  ALTIJD boven de `Tabs`. Elke tab houdt zijn eigen `SegmentKop` als context.

# Projectformulier (gebouw-projectformulier.tsx)

- Volledig herbouwd als CRM-klaar formulier. Props: `{ gebouwId, isBeheerder, gebouw }`.
  `gebouw` is de GebouwProp (naam/projectnummer/werknummer/adres/stad/postcode/gebouw_type/datum).
- Secties: Projectidentiteit (read-only grid) → Projectteam (uit toewijzingen) →
  Betrokken contacten (per status) → Opdracht en inhoud (AI+editable).
- Beheerder: textareas + "Opslaan" (geverifieerd=false) / "Opslaan en bevestigen" (geverifieerd=true).
  Niet-beheerder: alleen bevestigde contacten + bevestigde tekstvelden.

# CRM Contactpersonen

- `EmailContactpersoon` uitgebreid (JSONB) met: `functie?`, `status?` ("voorstel"|"bevestigd"|"afgewezen"),
  `relevantie?` ("relevant"|"ter_controle"), `bron_email_id?`, `bron_onderwerp?`.
- Groepen in UI: Bevestigd (groen) → AI-voorstellen relevant (amber) → Ter controle (inklapbaar) → Afgewezen (inklapbaar).
- Accept/afwijzen direct via `bewaarContacten()` — stuurt VOLLEDIGE payload (tekstvelden + contacten samen).
  Reden: PATCH nullt altijd alle niet-verstuurde tekstvelden. Oplossing: altijd combineer huidige `form` state
  + updated contactenlijst in één mutate call.
- Bevestigde contacten kunnen als CRM-partij worden opgeslagen via "Toevoegen als partij"-knop.

# Verificatie-semantiek (backend, routes/emails.ts)

- `geverifieerd`/`gecontroleerdDoor`/`gecontroleerdOp` op gebouwEmailSamenvattingenTable.
- `herberekeningUitvoeren(gebouwId, forceer=false)`: als bestaande rij `geverifieerd`
  is en !forceer → alleen aantalEmails bijwerken, gecontroleerde inhoud BLIJFT staan.
  Bij echte overschrijving wordt verificatie gereset (false/null/null).
- POST /samenvatting roept aan met forceer=true (expliciete "AI-suggesties"/bijwerken).
- PATCH /gebouwen/:id/emails/samenvatting (beheerderPlus): upsert tekstvelden;
  gecontroleerdDoor = naam uit gebruikersTable via req.session.userId; gecontroleerdOp=now
  als geverifieerd.

# DB push gotcha (belangrijk)

**Why:** `pnpm --filter @workspace/db run push` faalt op een PRE-BESTAANDE interactieve
TTY-prompt (drizzle wil `gebruikers` truncaten voor `gebruikers_uitnodiging_token_unique`).
Niet-interactief → "Interactive prompts require a TTY" error. NOOIT truncaten.
**How to apply:** voor puur additieve kolomwijzigingen (ADD COLUMN) de DB direct via SQL
aanpassen (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`) i.p.v. drizzle push; schema in
lib/db bijwerken voor type-correctheid. Verifieer via information_schema.columns.
