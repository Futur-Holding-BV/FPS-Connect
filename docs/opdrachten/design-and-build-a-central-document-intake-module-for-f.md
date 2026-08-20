Design and build a Central Document Intake module for FPS Connect.

Module name:
Inbox

Alternative label in UI:
Slim Uploadpunt

Purpose:
Create one central place where users can upload any document, photo, invoice, certificate, report, drawing, email attachment or file without first navigating to the correct module.

AI must analyse the uploaded file and suggest:
- what type of document it is
- where it belongs in FPS Connect
- which entity it should be linked to
- which follow-up action is needed
- which user should review or approve it

Main navigation:
Inbox

Core flow:
1. User uploads one or multiple files.
2. File is stored temporarily in Inbox.
3. AI analyses the file.
4. AI proposes document type, destination and linked entity.
5. User confirms, corrects or rejects the proposal.
6. After confirmation the file is moved to the correct module/location.
7. A task or follow-up action is created when needed.
8. Every decision is logged.

Supported uploads:
- PDF
- Word
- Excel
- images
- email attachments
- certificates
- ETA / DoP / product documentation
- invoices
- quotations
- work orders
- drawings
- inspection photos
- delivery notes
- maintenance reports
- HR documents
- vehicle documents
- contracts
- insurance documents

AI classification:
Create document categories:
- Building document
- Project document
- Opname document
- Calculation document
- Quotation document
- Order confirmation
- Execution document
- Completion report
- Maintenance document
- Product certificate
- ETA / DoP / fire classification
- Invoice
- Purchase receipt
- Supplier quotation
- HR document
- Employee certificate
- Vehicle document
- Fleet maintenance invoice
- CRM document
- Contract
- Unknown

Suggested destinations:
- Gebouwen
- Projecten
- Opnames
- Calculaties
- Offertes
- Uitvoering
- Oplevering
- Onderhoud
- Productbibliotheek
- Certificaten / ETA / DoP
- Financieel
- HRM
- Wagenpark
- CRM
- DMS / Algemeen archief

AI must try to detect:
- project name
- building name
- address
- customer
- supplier
- invoice number
- quotation number
- license plate
- employee name
- product name
- certificate number
- fire resistance classification
- date
- amount
- due date
- relation to an existing project/building/contact/vehicle/employee

Inbox screen:
Show upload cards with:
- filename
- upload date
- uploaded by
- detected document type
- confidence score
- suggested destination
- suggested linked entity
- suggested next action
- status: new, analysed, needs review, approved, moved, rejected

Review screen:
For each upload show:
- preview
- extracted text summary
- detected metadata
- AI reasoning summary
- suggested destination
- linked existing records
- possible duplicate warning
- buttons:
  - approve
  - edit suggestion
  - move manually
  - reject
  - create task
  - request missing information

Follow-up actions:
AI may suggest:
- link to existing building
- create new building
- link to project
- create new project
- link to vehicle
- link to employee
- create maintenance task
- create finance review task
- create CRM opportunity
- add certificate to product library
- update APK date
- update insurance record
- add invoice to project costs
- notify responsible person

Important:
AI must never move files automatically without confirmation in v1.
AI suggestions must always be reviewable by a user.
Use confidence levels:
- high: likely correct
- medium: needs review
- low: manual review required

Duplicate detection:
Detect possible duplicates based on:
- filename
- file hash
- invoice number
- quotation number
- project number
- supplier
- amount/date
- certificate number

Permissions:
Use role-based access.
Sensitive documents must be protected:
- HR documents only visible to authorised HR/admin roles
- finance documents only visible to authorised finance/admin roles
- vehicle driver data only visible to authorised roles
- project documents visible to project team
- customer documents visible according to project/customer permissions

Audit log:
Log:
- upload
- AI classification
- user correction
- approval
- move action
- linked entity
- task creation
- file deletion/rejection
- user and timestamp

Integration points:
The Inbox must connect to:
- Buildings
- Projects
- Opnames
- Calculaties
- Offertes
- Uitvoering
- Oplevering
- Onderhoud
- HRM
- Wagenpark
- CRM
- Productbibliotheek
- Financieel
- DMS

Design principles:
- Dutch interface
- simple central upload button
- drag and drop
- batch upload
- clear review queue
- no complex document management screen
- desktop-first
- mobile upload for photos/documents
- calm professional FPS Connect style

Build v1 with mock AI:
Implement the full workflow using deterministic mock classification rules first.
Examples:
- filename contains “factuur” → Financieel
- filename contains “APK” or license plate → Wagenpark
- filename contains “ETA” or “DoP” → Productbibliotheek / Certificaten
- filename contains employee name or “contract” → HRM
- filename contains project/building address → Projecten or Gebouwen
- filename contains “onderhoud” → Onderhoud
- filename contains “offerte” → Offertes or CRM opportunity

Prepare for real AI later:
Create a clean AIClassificationService interface:
- analyseFile()
- extractMetadata()
- suggestDestination()
- suggestLinkedEntity()
- suggestNextAction()
- detectDuplicates()

Do not implement real OCR or external AI yet unless already available.
Prepare the architecture so OCR and AI can be plugged in later.

Dashboard:
Show:
- new uploads
- uploads needing review
- high confidence suggestions
- low confidence uploads
- duplicate warnings
- documents waiting for approval
- tasks created from uploads

After building:
Run typecheck.
Verify all Inbox pages render.
Verify mock uploads can be classified.
Verify user can approve, edit and move documents.
Verify audit log entries are created.
Provide a short status report:
1. Built
2. Mock AI rules
3. Ready for real AI/OCR
4. Permission-sensitive areas
5. Recommended next step