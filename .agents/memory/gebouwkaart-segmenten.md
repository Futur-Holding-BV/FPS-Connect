---
name: Gebouwkaart segmenten & projectformulier
description: compacte projectdetail-shell met vijf hoofdtabbladen + bewerkbare/bevestigbare AI-projectsamenvatting
---

# Gebouwkaart

De zichtbare hoofdtabbladen zijn uitsluitend Dashboard, Gebouw, Uitvoering, Beheer
en Documenten. Proces- en financiële bestemmingen blijven bestaande, direct
linkbare inhoudssegmenten, maar worden geopend via de Projectdossier-kaarten in
plaats van via een tweede brede tabrij.

**Why:** de projectnaam en status stonden dubbel en de brede tabrij drukte de
inhoud te ver omlaag. De compacte shell moet inhoud op desktop binnen 200 px
laten beginnen, zonder bestaande dossierbestemmingen of diepe links te breken.

**How to apply:** voeg geen nieuwe zichtbare projecttab toe voor calculaties,
offertes, opdrachten, meer-/minderwerk, opnames, facturen of rapporten. Gebruik
een bestaande of nieuwe dossierkaart en behoud het inhoudssegment voor directe
links. Kop en acties blijven boven de tabs; elke hoofdtab houdt eigen context.

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
