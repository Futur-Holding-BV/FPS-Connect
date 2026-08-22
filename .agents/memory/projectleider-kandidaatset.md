---
name: Projectleider-kandidaatset serialisatie
description: Waarom projectleiderresolutie en alle HR-bronmutaties dezelfde transactionele advisory lock moeten nemen.
---

Rijlocks op de kandidaten die een query al vond zijn niet genoeg voor functiegestuurde toewijzing. Resolutie én iedere mutatie die de kandidaatpredicate kan veranderen moeten dezelfde transactionele advisory lock nemen.

**Why:** Een gelijktijdige activatie, nieuwe medewerker, nieuwe aanstelling of functieactivatie is een predicate-phantom: de nieuwe kandidaat bestond niet in de gelezen set en kan dus niet met `FOR UPDATE` op die set worden tegengehouden.

**How to apply:** Neem de gedeelde lock vóór kandidaatqueries en houd hem vast tot project-, audit- en Werkbakmutaties committen. Borg aan de HR-kant ook directe/bulk-DB-mutaties, bij voorkeur met statement-triggers.