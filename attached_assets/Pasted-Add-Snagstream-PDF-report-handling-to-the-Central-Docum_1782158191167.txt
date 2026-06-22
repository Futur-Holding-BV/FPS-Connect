Add Snagstream PDF report handling to the Central Document Intake module.

Snagstream reports:
When a PDF upload is detected as a Snagstream report, the Inbox must classify it as:
Document type: Snagstream oplever-/inspectierapport
Destination: Archief / Snagstream-rapporten

The system must extract or ask for:
- gebouw
- opdrachtgever
- project
- adres
- rapportdatum
- rapporttype
- uitvoerende partij
- status: concept, definitief, vervallen

Storage:
Store Snagstream PDF reports in a dedicated archive structure:
Archief
→ Snagstream-rapporten
→ Opdrachtgever
→ Gebouw
→ Jaar
→ Rapport

Search:
Make Snagstream reports searchable by:
- opdrachtgever
- gebouw
- adres
- project
- rapportdatum
- rapporttype
- bestandsnaam
- inhoud van PDF where text extraction is available

Building page:
On each Gebouw detail page, add a section:
Archiefdocumenten

Show linked Snagstream reports there with:
- report date
- report type
- opdrachtgever
- project
- filename
- uploaded by
- status
- open/download button

CRM/Opdrachtgever page:
On each opdrachtgever relation page, add a section:
Archiefdocumenten

Show all Snagstream reports linked to that opdrachtgever, grouped by building.

Important:
Snagstream reports are historical archive documents.
They must not automatically create new spots, tasks or maintenance items in v1.
AI may suggest follow-up actions, but only after user confirmation.

AI suggestions:
For Snagstream reports, AI may suggest:
- link to existing building
- link to existing opdrachtgever
- create missing building
- create missing opdrachtgever
- mark as historical archive document
- flag possible maintenance relevance

Duplicate detection:
Detect duplicate Snagstream reports using:
- filename
- PDF hash
- report date
- building address
- opdrachtgever
- project name

Permissions:
Snagstream archive documents are visible to authorised internal users.
Customer visibility must be explicitly enabled later and is disabled by default in v1.

After implementation:
Verify upload of a Snagstream PDF.
Verify it is classified correctly.
Verify it can be linked to building and opdrachtgever.
Verify it appears in the building archive.
Verify it appears in the opdrachtgever archive.
Verify search works by building, opdrachtgever and filename.