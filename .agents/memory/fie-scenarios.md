---
name: FIE wat-als-scenario's
description: Scenario-begrotingen (status 'scenario') moeten overal uit live gedrag gefilterd worden
---

**Regel:** wat-als-scenario's zijn rijen in `fie_jaarbegrotingen` met status `scenario` en gekopieerde AK-posten. Elke nieuwe lezer van die tabel (of join via AK-posten) voor live gedrag moet scenario's expliciet uitsluiten.

**Why:** zonder filter tellen scenario-kopieën dubbel mee in AK-sommen en kunnen ze als fallback-begroting de calculatiecontext vervuilen — precies wat de opdracht verbiedt ("scenario raakt nooit de echte begroting of prognose").

**How to apply:** filter `ne(status, 'scenario')` bij lijst-/fallback-/aggregatiequeries; statusovergang van scenario naar iets anders is route-side geblokkeerd (geen DB-constraint, dus nieuwe schrijfroutes moeten dit zelf bewaken). Doorrekening hergebruikt de bestaande FIE-motor — nooit een tweede rekenmodel bouwen.
