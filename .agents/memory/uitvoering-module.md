---
name: Uitvoering-module (/uitvoering)
description: Opzet van het uitvoeringsscherm — overzicht + detail met hergebruikte opdracht-tabs; rechten en valkuilen.
---
- `/uitvoering` (overzicht) + `/uitvoering/:id` (detail) in firevault; sidebar-item gate op `heeftNiveau("projecten",1)`.
- Backend: `GET /uitvoering/overzicht` (routes/uitvoering.ts) aggregeert opdrachten met `ai_fase in (uitvoering, oplevering)` + status actief; bewust GEEN bedragen → projecten:1 volstaat (projecten-sleutel).
- Onbesliste afwijking = `afwijking_json is not null AND afwijking_json->>'beslissing' is null` op pim_uitvoering_stappen.
- Detailpagina hergebruikt bestaande componenten met `opdrachtId`-prop: PimUitvoeringTab, PimOpleveringTab, UitvoeringsplanningTab, UrenPerUurcodeSectie, MateriaaltabTab, AkkoordKaart.
- **Documenten-koppeltabel kent geen doeltype "opdracht"** (KoppelingDoelType: gebouw/klant/offerte/dossier/voorziening/calculatie) — opdracht-documenten tonen via gebouw + offerte van de opdracht.
- Starttab afleiden uit rechten (alleen-projecten-gebruiker heeft geen offertes:1 en mag niet op lege Stappen-tab landen).
- Bewijs: `scripts/src/verificatie-uitvoering-overzicht.ts`.
