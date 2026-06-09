---
name: Gebouwkaart segmenten & projectformulier
description: detail.tsx 3-segment tabbladen + bewerkbare/bevestigbare AI-projectsamenvatting
---

# Gebouwkaart (gebouwen/detail.tsx)

- De drie segmenten (Project & gegevens / Uitvoering / Beheer) staan in een `Tabs`
  (shadcn). Kop + actieknoppen (Bewerken, Gereedmelden, PDF, Stappenplan) blijven
  ALTIJD boven de `Tabs`. Elke tab houdt zijn eigen `SegmentKop` als context.

# Projectformulier (gebouw-projectformulier.tsx)

- De AI-projectsamenvatting in tab 1 is bewerkbaar én bevestigbaar door beheerder.
  Component `Projectformulier` (vervangt het oude read-only `ProjectSamenvatting`).
- Beheerder: textareas + "Opslaan" (geverifieerd=false) / "Opslaan en bevestigen"
  (geverifieerd=true). Niet-beheerder: alleen-lezen weergave + "Gecontroleerd"-badge.
- `ContactpersoonRij` wordt geëxporteerd uit gebouw-emails.tsx en hergebruikt.

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
