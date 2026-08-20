Herstel de huidige productie-deploy volledig.

De GitHub Action faalt tijdens de Docker-build bij:

pnpm --filter @workspace/firevault run build

De zichtbare fout eindigt met:

ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL
@workspace/firevault@0.0.0 build: vite build --config vite.config.ts
failed to solve: process "/bin/sh -c pnpm --filter @workspace/firevault run build" did not complete successfully
exit code: 1

Werk door tot de fout daadwerkelijk is opgelost. Stop niet na alleen analyse.

Voer het volgende uit:

1. Draai exact dit commando in de huidige repository:
   pnpm --filter @workspace/firevault run build

2. Zoek de eerste echte foutmelding boven de stacktrace. Richt je niet alleen op de laatste exit-code.

3. Herstel de onderliggende oorzaak. Controleer in ieder geval:
   - ontbrekende of verkeerd gespelde imports;
   - bestanden die lokaal bestaan maar niet in Git staan;
   - hoofdletterverschillen in bestandsnamen;
   - TypeScript-fouten;
   - onjuiste exports;
   - ontbrekende dependencies;
   - aliases in vite.config.ts en tsconfig;
   - environment variables die tijdens build vereist zijn;
   - browsercode die Node-only modules importeert.

4. Draai daarna opnieuw:
   pnpm --filter @workspace/firevault run build

5. Blijf fouten oplossen totdat de build succesvol eindigt.

6. Draai vervolgens:
   - pnpm typecheck, of de juiste workspace-typecheck;
   - relevante tests;
   - de volledige Docker-build die de deployworkflow gebruikt.

7. Controleer ook of alle benodigde bestanden daadwerkelijk door Git worden gevolgd en op origin/main staan.

8. Maak de minimale structurele fix. Verwijder geen functionaliteit om de build kunstmatig groen te maken.

9. Commit de wijzigingen en push ze naar de huidige GitHub-branch zodat de deployworkflow opnieuw kan starten.

10. Geef aan het einde één compact eindrapport met:
    - de eerste echte buildfout;
    - de oorzaak;
    - gewijzigde bestanden;
    - test- en buildresultaten;
    - commit-hash;
    - bevestiging dat de push naar GitHub is uitgevoerd.

Belangrijk:
- Werk door tot de build groen is.
- Maak geen losse vervolgopdrachten.
- Push de gerepareerde commit daadwerkelijk naar GitHub