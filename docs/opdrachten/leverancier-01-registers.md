# LEVERANCIER_01 — De factuur wijst naar het verkeerde register

**Opdracht voor Replit · 9 augustus 2026 · gemeten op `6011b21` (`main`)**

---

## 1. De bevinding

**Een binnenkomende leveranciersfactuur wordt opgezocht in het klantenregister.**

`factuurstroomService.ts` r.114-116: de functie `zoekLeverancier()` doorzoekt **`crm_klanten`** op naam. Het gevonden id wordt weggeschreven in `facturen.leverancier_id` (r.360). Het commentaar op r.469 bevestigt dat dit bewust zo is: *"leverancierId is een crm_klanten-id, terwijl inkoopbonnen.leverancier_id naar de oude leveranciers-tabel verwijst."*

Dat klopt niet met wat die registers zijn:

| Register | Wat het is | Velden |
|---|---|---|
| `crm_klanten` | commerciële relaties — opdrachtgevers, prospects | naam, kvk, branche, status, relatiestatus, kans, voorkeur-BV |
| `leveranciers` | inkooprelaties | code, adres, contactpersoon, contactmail, telefoon, mobiel |

In de hele CRM-code wordt `crm_klanten.type` **nergens op `"leverancier"` gezet**. Het is dus geen register dat dubbel dienst doet; het is het verkeerde register.

**`facturen.leverancier_id` heeft bovendien géén `references()`** — het is een kaal getal. Daardoor kon dit ontstaan zonder dat de database ertegen protesteerde, en daardoor is er nu ook geen enkele garantie dat het getal ergens naar verwijst.

### 1.1 Wat er in de praktijk misgaat

Een groothandel waar FPS inkoopt is geen opdrachtgever en staat dus niet in `crm_klanten`. Zijn factuur komt binnen, `zoekLeverancier()` vindt niets, `leverancier_id` blijft leeg. Daarmee valt de hele keten erna stil: de bijbehorende inkoopbon wordt niet gevonden, de inkoper niet achterhaald, en de factuur zakt terug naar handmatige controle bij de administratie.

Het bestaande noodverband (r.469-500) probeert dit te repareren door bedrijfsnamen te normaliseren en `crm_klanten.naam` met `leveranciers.naam` te vergelijken. Dat is een omweg om twee dingen te verbinden die niet zo verbonden hadden moeten worden.

### 1.2 Nog een gevolg dat apart genoemd moet worden

`verificatie-mail-naar-factuur.ts` r.162 **maakt bij het verificatiescript een leverancier aan in `crm_klanten`** en verwijdert die achteraf weer. Zolang het bovenstaande niet klopt, vervuilt elke verificatierun het klantenregister — en blijft er bij een afgebroken run een neprelatie achter.

---

## 2. Stap 1 — eerst meten, dan pas bouwen

Voordat er één regel verandert, levert Replit deze telling uit productie, mét de query's erbij:

1. Hoeveel rijen staan er in `leveranciers`, en hoeveel in `crm_klanten`?
2. Hoeveel facturen hebben een gevulde `leverancier_id`, en hoeveel daarvan verwijzen naar een **bestaande** rij in `crm_klanten`? Hoeveel verwijzen nergens naar?
3. Hoeveel van die `crm_klanten`-rijen zijn feitelijk leveranciers (staan ze ook in `leveranciers`, op genormaliseerde naam)?
4. Hoeveel facturen hebben `leverancier_id` leeg terwijl er wél een `relatienaam` staat die in `leveranciers` voorkomt? **Dat getal is de omvang van het probleem** — dat zijn de facturen die nu onnodig handmatig behandeld worden.
5. Staan er rijen in `crm_klanten` met `bron = "import"` of met een naam die alleen als leverancier bekend is?

**Deze meting wordt gerapporteerd vóór de bouw.** Blijkt uit punt 4 dat het om een handvol facturen gaat, dan is dit een kleine ingreep; blijkt het de helft te zijn, dan verklaart het waarom de administratie zoveel handwerk heeft.

---

## 3. Wat gebouwd wordt

### 3.1 De factuur wijst naar het leveranciersregister

- `zoekLeverancier()` zoekt voortaan in **`leveranciers`**, niet in `crm_klanten`.
- `facturen.leverancier_id` krijgt een echte **`references()` naar `leveranciers`**, met `on delete set null`.
- Het noodverband op r.469-500 (naam normaliseren om van het ene register naar het andere te komen) **verdwijnt**. `inkoopbonnen.leverancier_id` wijst al naar hetzelfde register, dus de koppeling wordt een directe vergelijking van twee id's.

### 3.2 Migratie van bestaande gegevens

Genummerde migratie die per factuur met een gevulde `leverancier_id`:

- de bijbehorende `crm_klanten`-naam opzoekt;
- daarbij de `leveranciers`-rij zoekt op genormaliseerde naam;
- **gevonden → omzetten** naar het `leveranciers`-id;
- **niet gevonden → leeg laten en vastleggen in een migratierapport.** Er wordt niets gegokt en er worden geen leveranciersrijen automatisch aangemaakt.

Het migratierapport wordt bij de oplevering meegeleverd: hoeveel omgezet, hoeveel leeggelaten, en welke namen niet te plaatsen waren.

### 3.3 Herstel voor wat nu blijft liggen

Facturen waarvan de leverancier niet in `leveranciers` staat, komen op de werkbak met één handeling: **"koppel aan bestaande leverancier"** of **"maak nieuwe leverancier aan"**. Dat tweede volgt de al vastgelegde regel: René besluit of we zaken doen met een partij, Jacqueline legt vast. Een werkvoorbereider mag alleen aanvragen.

### 3.4 Het verificatiescript

`verificatie-mail-naar-factuur.ts` maakt zijn testleverancier voortaan in `leveranciers` aan, niet in `crm_klanten`, en ruimt hem op — ook wanneer de run halverwege afbreekt.

### 3.5 Eén partij die zowel klant als leverancier is

Dat komt voor en is geen fout. Het blijven **twee rijen in twee registers**, want het zijn twee verschillende relaties met verschillende gegevens. Wat erbij komt is een **optionele verwijzing** van een leverancier naar een crm-relatie, zodat zichtbaar is dat het dezelfde partij betreft. Niet verplicht, niet automatisch gevuld.

---

## 4. Verboden

- Geen samenvoeging van `crm_klanten` en `leveranciers`. Het zijn verschillende dingen en dat blijft zo.
- Geen automatisch aanmaken van leveranciersrijen op basis van een factuurnaam.
- `crm_klanten.type` niet gebruiken om er leveranciers in te stoppen.
- Geen naamvergelijking laten staan als terugvaloptie "voor de zekerheid" — dan verdwijnt het probleem uit zicht in plaats van opgelost te worden.
- Niets aan de andere gebruikers van `leveranciers` veranderen (artikelen, magazijn, inkoopbonnen, kb); die wijzen al goed.

---

## 5. Acceptatie

Met vermelding van commit-SHA, GitHub `main`-SHA en productie-SHA:

1. **De meting uit §2 is gerapporteerd**, met de query's en de uitkomsten.
2. Een factuur van een leverancier die **wel** in `leveranciers` staat en **niet** in `crm_klanten`, wordt correct gekoppeld. Toon de factuur en de koppeling. *Dit is het geval dat vandaag stukloopt.*
3. De bijbehorende inkoopbon wordt gevonden zonder naamvergelijking. Toon de gebruikte query.
4. Het migratierapport is bijgevoegd: aantallen omgezet, leeggelaten, en de niet-plaatsbare namen.
5. Een factuur met een onbekende leverancier komt op de werkbak met de twee handelingen, en maakt zelf niets aan.
6. Een verificatierun laat **geen enkele rij** achter in `crm_klanten` — ook niet na een afgebroken run. Toon de telling voor en na.
7. Het klantenregister is niet gekrompen of gegroeid door deze wijziging. Toon het aantal rijen voor en na.
