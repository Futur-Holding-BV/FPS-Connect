---
name: Procesbalk-patroon Projectaanpak
description: Vast indelingspatroon voor Projectaanpak-detailpagina's — procesbalk, één vervolgknop, ⋯-menu, kaarten Financieel/AI-hulp.
---
Vast indelingspatroon (aug 2026, eerst op calculatie; ook op opname/offerte-studio/opdracht) voor detailpagina's onder Projectaanpak. Gebruik het bestaande ProcesBalk-component; bouw geen tweede stepper.

Regels bij toepassen op een nieuwe pagina:
- Statussen mappen op processtappen; alias-statussen eerst normaliseren en tussentoestanden (bv. gepauzeerd) als extra badge naast de balk, niet als stap.
- Negatieve afloop (verloren/afgewezen/geannuleerd) is een zichtbare eindtoestand óp de balk — nooit een verborgen status.
- Precies één knop voor de eerstvolgende stap; alle overige documentacties in het ⋯-menu, Verwijderen onderaan achter separator + bevestiging.
- Mutatieknoppen altijd gaten op module-schrijfniveau (2) en verwijderen op niveau (4) — reviewer keurde ongegate knoppen af.
- Kleur alleen via NAV_01-hoofdstuktokens en nooit als enig signaal; balk niet verbergen op smalle schermen (hij wrapt).

**Why:** René wil één herkenbaar procesgevoel over alle Projectaanpak-detailpagina's; losse knoppenrijen groeiden onbeheersbaar.

Screenshot-bewijs met login + licht/donker: forceer `colorScheme` in de Playwright-browsercontext, anders wint de systeemvoorkeur van headless chromium over de app-themavoorkeur.
