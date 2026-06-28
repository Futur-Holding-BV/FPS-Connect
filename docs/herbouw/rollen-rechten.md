# Rollen en bevoegdheden

FPS Connect gebruikt een **matrix-gebaseerd bevoegdhedensysteem**.
Rollen zijn geen vaste enum-waarden maar worden afgeleid uit bevoegdheidsprofielen.

---

## Architectuur

```
gebruikers
  └── herkomst_profiel_id → bevoegdheids_profielen
                              └── bevoegdheden (jsonb)
                                    └── { module: string, niveau: 0|1|2|3 }
```

### Niveaus

| Niveau | Betekenis |
|---|---|
| 0 | Geen toegang |
| 1 | Lezen |
| 2 | Schrijven |
| 3 | Beheren (inclusief verwijderen en configureren) |

### Ingebouwde profielen (presets)

| Preset | Doelgroep |
|---|---|
| Hoofdbeheerder | Volledige systeemtoegang |
| Beheerder | Operationeel beheer |
| Projectleider | Projecten + rapportage |
| Uitvoerder | Uitvoering in het veld |
| Onderhoudsmonteur | Onderhoudswerkzaamheden |
| Controleur | Inspecties en controle |
| Administratie | Financieel en HR |
| Directie | Dashboards + rapportage |
| Externe inhuur | Beperkte veldtoegang |
| Boekhouder extern | Alleen loon/financieel |
| Klant | Klantportaal (FPS One) |

---

## Modules (bevoegdheidssleutels)

| Sleutel | Module |
|---|---|
| `gebouwen` | Projecten en gebouwen |
| `voorzieningen` | Spots en voorzieningen |
| `bibliotheek` | Productenbibliotheek |
| `gebruikers` | Gebruikersbeheer |
| `systeem` | Systeembeheer |
| `personeel` | HRM / Personeel |
| `gereedschappen` | Gereedschapsbeheer |
| `dossiers` | Dossiermodule |
| `offertes` | Offertes |
| `crm` | CRM / Klanten |
| `onderhoud` | Onderhoud |
| `toolbox` | Toolbox Center |
| `financieel` | Financiële module |
| `salarisarchief` | Salarisarchief |
| `salaris_mutaties` | SCAB / Salarismutaties |
| `scab_mail` | SCAB-mailverwerking |
| `boekhouder_portaal` | Boekhouderportaal |
| `wagenpark` | Wagenparkbeheer |

---

## Verse installatie — profielen laden

Na een verse installatie zijn er geen profielen.
Laad de standaard presets:

```bash
curl -X POST https://connect.fps-brandpreventie.nl/api/profielen/synchroniseer-standaard \
  -H "Cookie: <beheerder-sessiecookie>"
```

Of in de app: **Beheer → Rollen & Rechten → Standaard profielen synchroniseren**.

---

## Gebruiker aanmaken

```bash
# Via de API (als hoofdbeheerder):
curl -X POST https://connect.fps-brandpreventie.nl/api/gebruikers \
  -H "Cookie: <sessiecookie>" \
  -H "Content-Type: application/json" \
  -d '{
    "naam": "Jan Jansen",
    "email": "jan@fps-brandpreventie.nl",
    "wachtwoord": "TijdelijkWachtwoord!",
    "rol": "gebruiker",
    "herkomstProfielId": 2
  }'
```

Of in de app: **Beheer → Gebruikers → Nieuw**.

---

## TOTP (tweestapsverificatie)

TOTP is **verplicht** voor alle gebruikers. De QR-code wordt getoond bij
eerste login. Gebruiker scant met Google Authenticator, Microsoft Authenticator
of 1Password.

Bij verlies van authenticator-apparaat:
1. Hoofdbeheerder reset het TOTP-geheim via **Beheer → Gebruikers → [gebruiker] → TOTP resetten**
2. Gebruiker koppelt nieuw apparaat bij volgende login

---

## Klantportaal (FPS One)

Klantgebruikers hebben rol `klant` en een beperkt bevoegdheidsprofiel.
Ze krijgen alleen toegang tot hun eigen gebouwen via het FPS One-portaal.

Klantaccounts aanmaken: **Beheer → Gebruikers → Nieuw → Rol: Klant**.
