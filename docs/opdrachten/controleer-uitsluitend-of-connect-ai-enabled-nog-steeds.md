CONTROLEER UITSLUITEND OF CONNECT_AI_ENABLED NOG STEEDS "true" IS OP PRODUCTIE. 
GEEN CODEWIJZIGINGEN IN DEZE STAP.

Zie docs/OMGEVINGSBEWUSTZIJN.md.

ACHTERGROND
Eerder (zie docs/changelog.md / changelog_fixed.md) was CONNECT_AI_ENABLED 
structureel false in /opt/fps-one/deploy/.env.production, waardoor de 
echte Document Intelligence-AI nooit draaide en alle classificaties 
op de zwakke bestandsnaam-heuristiek terugvielen. Dit werd toen 
verholpen. Omdat .env.production niet in git staat, kan dit onopgemerkt 
teruggezet zijn (bijv. bij een serverherstel of verkeerd gekopieerd 
.env-bestand).

FASE 1 — DIRECTE CONTROLE OP DE VPS
SSH naar de VPS en voer uit:
  docker exec deploy-api-1 sh -c 'echo [$CONNECT_AI_ENABLED]'
Rapporteer de exacte output.

Controleer ook /opt/fps-one/deploy/.env.production zelf (grep 
CONNECT_AI_ENABLED) — bevestig dat bestand en draaiende container 
overeenkomen (een verouderd .env-bestand kan afwijken van wat de 
container ooit heeft ingeladen).

FASE 2 — AANVULLENDE CONTROLE
Controleer of de OpenAI-API-sleutel op productie nog geldig is 
(niet verlopen/ingetrokken) — een geldige CONNECT_AI_ENABLED=true 
met een ongeldige sleutel geeft hetzelfde symptoom (AI faalt stil, 
valt terug op heuristiek).

FASE 3 — ALLEEN BIJ BEVESTIGDE REGRESSIE
Als CONNECT_AI_ENABLED=false blijkt: zet 'm op true, herstart de 
api-container, en bevestig opnieuw via dezelfde docker exec-check. 
Documenteer in .agents/memory/document-intelligence-engine.md dat 
dit een tweede keer is gebeurd, met datum, zodat een volgende 
regressie sneller herkend wordt.

ACCEPTATIE
- exacte waarde van CONNECT_AI_ENABLED op de draaiende container, 
  gerapporteerd (niet aangenomen);
- geldigheid van de OpenAI-sleutel bevestigd;
- als gecorrigeerd: nieuwe waarde bevestigd via dezelfde methode 
  ná herstart.

LEVER
- letterlijke output van de docker exec-check (vóór en, indien van 
  toepassing, ná correctie);
- status van de OpenAI-sleutel;
- of er een aanpassing is gedaan, en zo ja welke.