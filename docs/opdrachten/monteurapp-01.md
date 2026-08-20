# MONTEURAPP_01 — Installeerbare Android-build (APK)

**Opdrachtgever:** René Vink · **Datum:** 8 augustus 2026 · **Uitvoerder:** Replit
**Systeem:** FPS Connect — `artifacts/monteur-app` (repo `vinkrene-jpg/fps-one`, branch `main`)

**Verplicht vooraf lezen:** `replit.md` · `docs/ontwikkelfilosofie.md` · `docs/kwaliteitskader.md` · `docs/PRODUCTION_RUNBOOK.md` · `.agents/memory/MEMORY.md`

---

## 1. Wat het probleem is — en wat het niet is

De biometrische ontgrendeling is **niet stuk**. Ze is compleet gebouwd: `expo-local-authentication` (~17.0.8) en `expo-secure-store` (~15.0.8) staan in de afhankelijkheden, `context/auth.tsx` detecteert hardware, of er iets is ingesteld en welk type, met per platform de juiste benaming. Er is een vergrendelscherm, een onboarding en een instelling.

**Maar `context/auth.tsx` regel 39 zet biometrie uit zodra het platform `web` is** — terecht, want die bibliotheek werkt alleen in een echte app.

**En de app wordt niet als echte app uitgeleverd.** Gemeten: geen `eas.json`, dus geen build geconfigureerd; de monteur-app komt niet voor in `scripts/deploy-production.sh` of docker-compose. René opent hem in een browser en heeft Expo Go niet.

**Deze opdracht repareert dus geen biometrie. Hij levert het voertuig waarin de bestaande biometrie werkt.**

---

## 2. Wat er gebouwd wordt

Een **installeerbare Android-build (APK)** die rechtstreeks op de telefoons van de monteurs wordt gezet. **Bewust geen Play Store en geen App Store** — dat scheelt een Apple Developer-account (€99 per jaar), een Play-account, wachttijd op beoordeling en een reviewproces bij elke wijziging.

**2.1 — `eas.json` met een profiel dat een APK oplevert**, niet een AAB. Een AAB is een storeformaat en kan niet rechtstreeks geïnstalleerd worden.

**2.2 — De app wijst naar productie, niet naar Replit.** `EXPO_PUBLIC_DOMAIN` moet in de build op `connect.fps-one.nl` staan.

Let op: dit is dezelfde variabele die de afgelopen dagen herhaaldelijk als "stale EXPO_PUBLIC_DOMAIN" in commits terugkwam. In een ontwikkelserver valt dat niet op; in een geïnstalleerde app betekent het dat monteurs praten met een omgeving die verdwijnt. **Controleer expliciet welke waarde in de gebouwde APK zit** — niet welke in het script staat.

**2.3 — Versie zichtbaar in de app.** Versienummer en bouwdatum op het informatiescherm, zodat bij een storing binnen vijf seconden vaststaat welke build iemand heeft. Zonder dat is een fout op een telefoon niet te plaatsen.

**2.4 — De ondertekeningssleutel wordt veiliggesteld en vastgelegd.** Raakt die kwijt, dan kan dezelfde app nooit meer bijgewerkt worden en moet iedereen opnieuw installeren. Leg vast waar hij staat en wie erbij kan.

**2.5 — Bijwerken zonder herinstalleren.** Zonder store is er geen automatische update. Richt **EAS Update** in, zodat wijzigingen in de app zelf zonder nieuwe APK op de telefoons landen. Een nieuwe APK blijft alleen nodig bij een wijziging in de native onderdelen.

**2.6 — Uitleveren.** Beschrijf hoe een monteur de app krijgt: waar de APK staat, dat installeren uit onbekende bron één keer toegestaan moet worden, en hoe hij ziet dat hij de juiste versie heeft.

---

## 3. Wat er níét in deze opdracht zit

- **Geen wijziging aan de biometriecode.** Die is af. Blijkt hij na installatie niet te werken, dan is dat een nieuwe bevinding met een eigen oorzaak — niet iets om vooruitlopend te verbouwen.
- **Geen iOS-build.** Dat vereist een Apple Developer-account en een ander distributiepad. **Meld wel expliciet** of er monteurs met een iPhone zijn, want voor hen lost deze opdracht niets op.
- **Geen store-publicatie.**

---

## 4. Acceptatie

1. Er ligt een APK die op een Android-telefoon te installeren is.
2. Na installatie log ik één keer in met de authenticator.
3. Bij de volgende keer openen vraagt de app om vingerafdruk of gezichtsherkenning, en werkt dat.
4. Sluit ik de app en open ik hem opnieuw, dan blijf ik ingelogd zonder opnieuw de authenticator nodig te hebben.
5. In het informatiescherm zie ik versienummer en bouwdatum.
6. De app praat aantoonbaar met `connect.fps-one.nl` — niet met een Replit-domein.
7. Een wijziging in de app landt via EAS Update op mijn telefoon zonder dat ik opnieuw installeer.

**Bewijs bij oplevering:** de APK zelf of een downloadlink, een schermafdruk van het informatiescherm met versie en datum, en het antwoord op welk adres de gebouwde app werkelijk aanroept. Plus commit-SHA, GitHub main-SHA en actieve productie-SHA.

## 5. Wat niet mag

- Geen AAB in plaats van een APK.
- Geen build met een Replit-domein erin.
- De biometriecode niet aanpassen zonder aangetoonde fout ná installatie.
- De ondertekeningssleutel niet in de repository plaatsen.
- Niet melden dat het klaar is op grond van een geslaagde build — af is het pas als er een APK op een telefoon draait en punt 3 is aangetoond.
