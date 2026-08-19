# MONTEUR_NU_01 — Telefoonbewijs na productie-uitrol

**Doel:** Aantonen dat de webuitvoer van de monteuromgeving op
`connect.fps-one.nl/app` correct werkt op een echte telefoon ná de uitrol.

De vier metingen hieronder moeten worden uitgevoerd door de opdrachtgever (René)
**na** de uitrol die de MONTEUR_NU_01-commit bevat. De agent heeft geen
VPS-toegang en kan dit niet zelf meten.

---

## Status

| Meting | Datum | Uitvoerder | Uitkomst |
|--------|-------|------------|---------|
| A — Inloggen monteursaccount | — | — | 🔲 uitstaand |
| B — Toegevoegd aan beginscherm | — | — | 🔲 uitstaand |
| C — Offline foto + wachtrij leeg | — | — | 🔲 uitstaand |
| D — Niet-buitendienstaccount → Connect | — | — | 🔲 uitstaand |

Zodra alle vier ✅ zijn: status bij §5 van `docs/antwoorden/MONTEUR_NU_01.md`
wijzigen naar **VOLLEDIG GEACCEPTEERD**.

---

## Meting A — Inloggen monteursaccount op telefoon

**Wat:** Open `connect.fps-one.nl/app` op een Android- of iOS-telefoon in
de standaardbrowser. Log in met een monteursaccount (rol Monteur of
Onderhoudsmonteur, 2FA actief). Controleer dat het werkscherm (agenda/opdrachten)
zichtbaar is.

**Bewijs:** Schermafdruk van de telefoon, zichtbaar:
- adresbalk met `connect.fps-one.nl/app/…`
- werkscherm na inloggen (lijst of agenda van opdrachten)

Bewijs opslaan als: `docs/metingen/afbeeldingen/MONTEUR_NU_01-A-inloggen.jpg`

**Uitkomst (invullen):**
- Datum:
- Apparaat (bijv. Samsung Galaxy A54, Android 14):
- Browser (bijv. Chrome 127):
- Uitkomst: ✅ / ❌
- Opmerking:

---

## Meting B — Installeren als PWA (zonder browserbalk)

**Wat:** Open `connect.fps-one.nl/app` op dezelfde telefoon. Voeg de pagina toe
aan het beginscherm via "Toevoegen aan beginscherm" (Android Chrome) of
"Toevoegen aan thuisscherm" (iOS Safari). Open de snelkoppeling. Controleer:
- de app opent in standalone-modus (geen browserbalk)
- de naam "FPS Monteur" staat op het beginscherm
- het icoon is het FPS-icoon (niet de generieke browser-fallback)

Verificatie manifest: `connect.fps-one.nl/app/manifest.webmanifest`
verwacht: `"display":"standalone"`, `"start_url":"/app/"`,
`"name":"FPS Monteur"`.

**Bewijs:** Twee schermafdrukken:
1. App op het beginscherm (icoon + naam zichtbaar)
2. App geopend in standalone-modus (geen browserbalk)

Bewijs opslaan als:
- `docs/metingen/afbeeldingen/MONTEUR_NU_01-B-beginscherm.jpg`
- `docs/metingen/afbeeldingen/MONTEUR_NU_01-B-standalone.jpg`

**Uitkomst (invullen):**
- Datum:
- Apparaat:
- Naam op beginscherm:
- Browserbalk zichtbaar na openen: ja / nee
- Uitkomst: ✅ / ❌
- Opmerking:

---

## Meting C — Offline foto + wachtrij leeg (vliegtuigstand)

**Doel:** Aantonen dat de SyncQueue na een offline periode automatisch leegloopt
zodra de verbinding herstelt.

**Stappen:**

1. Log in op `connect.fps-one.nl/app` (of open de PWA van meting B).
2. Open een opname-item of werkdag waarbij een foto gemaakt kan worden.
3. Zet de telefoon in **vliegtuigstand** (alle data uit).
4. Maak een foto (camera-invoer van de browser).
5. Bevestig de opname — de app toont een melding dat de actie in de wachtrij
   staat (of een offline-indicator).
6. Wacht 10 seconden.
7. Zet de telefoon terug **uit de vliegtuigstand**.
8. Wacht maximaal 30 seconden.
9. Controleer dat de wachtrij leeg is: Instellingen → Synchronisatie, of de
   indicator verdwijnt.

**Bewijs:** Twee schermafdrukken of video:
1. App met offline-indicator / wachtrij-melding (vliegtuigstand actief)
2. App na herstel van verbinding, wachtrij leeg / foto gesynchroniseerd

Bewijs opslaan als:
- `docs/metingen/afbeeldingen/MONTEUR_NU_01-C-offline.jpg`
- `docs/metingen/afbeeldingen/MONTEUR_NU_01-C-sync-leeg.jpg`

**Uitkomst (invullen):**
- Datum:
- Wachtrij-indicator zichtbaar in vliegtuigstand: ja / nee
- Wachtrij leeg na herverbinding (seconden):
- Foto beschikbaar in de opname na sync: ja / nee
- Uitkomst: ✅ / ❌
- Opmerking:

---

## Meting D — Niet-buitendienstaccount → gewone Connect

**Wat:** Open `connect.fps-one.nl/app` op de telefoon en log in met een account
dat **geen** buitendienstrol heeft (bijv. beheerder, projectleider, of een
kantoormedewerker zonder functietitel Monteur/Timmerman/Uitvoerder/
Onderhoudsmonteur). Controleer dat de app direct doorstuurt naar de gewone
Connect-omgeving (`connect.fps-one.nl/`, niet `/app/`).

**Bewijs:** Schermafdruk van de adresbalk na redirect:
`connect.fps-one.nl/` (of een subroute van de hoofdapp, zoals `/gebouwen`).

Bewijs opslaan als: `docs/metingen/afbeeldingen/MONTEUR_NU_01-D-redirect.jpg`

**Uitkomst (invullen):**
- Datum:
- Testaccount (rol):
- Redirect-doel (URL):
- Uitkomst: ✅ / ❌
- Opmerking:

---

## Versiecontrole (aanbevolen: vóór de metingen)

Controleer dat de uitgerolde versie de MONTEUR_NU_01-commit bevat:

```
curl https://connect.fps-one.nl/app/versie.json
```

Verwachte uitvoer: `{"commit":"<sha>","tijdstip":"..."}` waarbij `<sha>` overeenkomt
met de MONTEUR_NU_01-commit in de GitHub Actions-run.

Vastgelegde commit:
