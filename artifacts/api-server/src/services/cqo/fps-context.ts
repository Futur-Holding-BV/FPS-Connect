export const FPS_PLATFORM_CONTEXT = `
# FPS Connect — Platformbeschrijving voor kwaliteitsbeoordeling

## Wat is FPS Connect?
FPS Connect is een professioneel Nederlands ERP-platform voor brandpreventiebedrijven. Het platform
beheert de volledige levenscyclus van brandpreventieprojecten: van gebouwregistratie en spotvastlegging
tot inspectie, onderhoud en juridisch correcte opleverrapportages.

Doelgroep: brandpreventiebedrijven met 5-50 medewerkers, 50-500 klantgebouwen en wettelijke
verplichtingen rond inspectie en rapportage. De naam "FPS One" wordt gebruikt richting klanten (portaal).

## Gebruikersrollen
- Hoofdbeheerder: volledige systeemtoegang, beheerpaneel
- Gebruiker/kantoor: operationeel werk, bevoegdheidsmatrix bepaalt exact wat
- Klant (FPS One): beperkt portaal voor eigen gebouwen en rapporten
- Monteur (mobiel): FPS Monteur-app (Expo Go, offline-first, HMAC-authenticatie)

## Modules (status juli 2026)
1. Dashboard — live statistieken: gebouwen, spots, onderhoud, inspecties [ACTIEF]
2. Gebouwenbeheer — registratie, 3D CSS weergave, plattegrond SVG-editor, AI-invullen, foto's, zoek [ACTIEF]
3. Spots (Voorzieningen) — 10+ types (branddeur, doorvoering, brandklep, manchet, coating...), statusflow
   (aangebracht/goed/aanmerking/afgekeurd/hersteld), QR-labels, AI-spotherkenning, clusters, serie plaatsen [ACTIEF]
4. Bibliotheek — labels, toepassingen, fabrikanten, testnormen, AI-bibliotheekvalidatie [ACTIEF]
5. Inspecties — oplevering/periodiek/jaarlijks/herstel inspecties [ACTIEF]
6. Onderhoud — werkorders, prioriteit, deadline, toewijzing, statussturing [ACTIEF]
7. Documenten (DMS) — versiebeheer, polymorfe koppelingen, duplicaatdetectie (sha256+fuzzy),
   goedkeuringsflow, signaleringen, DMS-dashboard, audittrail, downloadlogging [ACTIEF]
8. Dossiers — concept/definitief/gearchiveerd, dossierbevriezing [ACTIEF]
9. Opleverrapportage (V1.4) — in aanbouw; bouwt voort op live-rapportage (print.tsx) [IN AANBOUW]
10. Document Design System — documentmotor, templatefamilies, branding per werkmaatschappij [VISUELE BASIS]
11. Offertes — regels uit spots, sjablonen, offertevoorbereiding [ACTIEF]
12. Opdrachten — offerte→opdracht→werkbegroting→nacalculatie [ACTIEF]
13. Planning — werkorders, dagplanning, inzetbaarheid [ACTIEF]
14. HRM/Personeel — medewerkers, functiehuis, opleidingen/certificaten, bekwaamheidsmatrix,
    verlof (saldo/aanvragen/goedkeuring), onboarding [ACTIEF]
15. Klanten (CRM) — klantbeheer scaffold, beperkt uitgebouwd [SCAFFOLD]
16. Wagenpark — voertuigen, onderhoud, ritten [ACTIEF]
17. Magazijn — artikelen, leveranciers, aanvragen, eenheidsprijzen [ACTIEF]
18. Communicatie — interne chat (5s polling), e-mail parsing (Microsoft Graph) [ACTIEF]
19. FIE (Factuur-Intake Engine) — AccountView koppeling, factuurverwerking [ACTIEF]
20. Gebruikersbeheer — rollen + bevoegdhedenmatrix, 14 presets, bekijk-als impersonatie [ACTIEF]
21. Abonnementen — 3 pakketten (Basis €149, Beheer €349, Volledig €699/maand) [ACTIEF]
22. AI Governance — prompt-classificatie (groen/geel/oranje/rood), alle AI-aanroepen gelogd [ACTIEF]
23. Security Validation — 1250+ geautomatiseerde tests, 12 categorieën, release-gate [ACTIEF]
24. Security Intake Layer — upload-scanning (ClamAV, YARA), malware-quarantaine [ACTIEF]
25. AVG/GDPR — anonimisering, bewaartermijnen, exportfuncties [ACTIEF]
26. Audit Log — volledige audittrail van alle systeemwijzigingen [ACTIEF]
27. Backup & Herstel — dagelijks pg_dump, sha256 verificatie, tweestaps restore [ACTIEF]

## Technische stack
- Backend: Node.js 24, Express 5, TypeScript 5.9, esbuild (CJS bundle)
- Database: PostgreSQL + Drizzle ORM, jsonb voor flexibele data
- Frontend: React + Vite + shadcn/ui + TailwindCSS + wouter routing
- AI: OpenAI (gpt-4o default, gpt-5 vision/reasoning) via Replit proxy
- Authenticatie: express-session + bcryptjs + otplib v12 (TOTP verplicht)
- Contract-first API: OpenAPI spec → Orval codegen → React Query hooks + Zod schemas
- Opslag: Google Cloud Storage (object storage)
- Mobiel: Expo Go (React Native), offline-first AsyncStorage + SyncQueue

## Veiligheidsarchitectuur
- TOTP verplicht bij alle accounts, geen optionele MFA
- Sessiecookie: SameSite=None; Secure + trust proxy (Replit iframe-hosting)
- Alle dataroutes achter requireAuth; alleen /auth/* en /healthz publiek
- Bevoegdhedenmatrix: jsonb-kolom per gebruiker + 14 standaardprofielen (presets)
- AI Governance Engine: ELKE AI-aanroep geclassificeerd vóór uitvoering
- Security Intake Layer: uploads gescand op malware vóór opslag
- Governance blokkadelogica: oranje→wijzigingsvoorstel, rood→altijd geblokkeerd
- Security Validation: 1250+ automatische tests, release geblokkeerd bij score < 95%

## Azure-strategie (niet volledig operationeel)
- Actief: Microsoft Graph API voor e-mail (MAIL_VIA_GRAPH=true, Azure tenant geconfigureerd)
- Niet actief: Azure AD SSO, Teams, SharePoint, Azure Storage, Azure Monitor
- Aanpak: abstractielaag aanwezig, graceful degradation, "Nog niet actief" labels
- Activering later: alleen configuratiewijziging nodig, geen hercode

## Bekende beperkingen & openstaande punten
- Calculatie-module uitgeschakeld in pilotomgeving (VITE_FEATURE_CALCULATIE=false)
- CRM-module: scaffold, niet volledig uitgebouwd
- V1.4 Opleverrapportage: in aanbouw
- Mobiele app: read-mostly, geen volledig offline uitvoeringsflow voor complexe werkstromen
- pre-existing TypeScript-waarschuwingen in 2 bestanden (geen functioneel risico)
- Alle AI is adviserend: AI stelt voor, mens bevestigt — geen autonome AI-beslissingen
- Geen formele load-tests gedocumenteerd
- otplib gefixeerd op v12 (v13 breekt esbuild-bundle)
- Chat: 5-seconden polling (geen WebSockets)
- Geen CDN of edge-caching geconfigureerd
`.trim();
