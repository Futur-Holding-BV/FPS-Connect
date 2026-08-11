---
name: AKKOORD_01 akkoordpoort
description: Opdracht pas werkbaar met vastgelegd akkoord; poort onder uren en inkoop.
---
Eén poortfunctie `heeftAkkoord()` (lib/akkoordPoort.ts) — nooit een tweede eigen controle bouwen (afwijzingsgrond in de opdrachttekst).

**Regels:**
- Drie gronden: ondertekening (auto bij maak-opdracht vanaf ondertekende offerte), opdrachtbevestiging (B), vrijgave_pl (C).
- Fail-closed op twee lagen: `heeftAkkoord` valideert grond + grondspecifiek bewijs (B→document_id, C→herkomst), én DB-CHECK `opdrachten_akkoord_geldig` (migratie 0047).
- Grond B-bewijs: document moet documenttype `opdrachtbevestiging` zijn, niet gearchiveerd, mét bestand — willekeurig document opent de poort niet (reviewpunt).
- €10k-band via goedkeuringsmotor (beleidsregel `opdracht_akkoord`, gezaaid in 0047); **onbekend bedrag (geen offerte) valt fail-closed bóven de band** — bewijs-/testopdrachten dus altijd een offerte met bedrag koppelen.
- Binnen transacties altijd `heeftAkkoord(id, tx)` — buiten de tx toetsen laat een race met gelijktijdig intrekken toe (reviewpunt).
- Intrekken = hoofdbeheerder + reden; uren zonder opdracht blijven bewust toegestaan (§3.2 alleen meten, endpoint /metingen/akkoord01).

**Why:** architect-review wees uit dat een poort die alleen op "grond niet null" toetst met ongeldig/legacy DB-bewijs te openen is.
