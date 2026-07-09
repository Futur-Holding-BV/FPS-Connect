---
name: GitHub push-synchronisatie
description: Hoe origin/main veilig te synchroniseren als push faalt op verlopen token en GitHub achterloopt/divergeert.
---
# GitHub push-synchronisatie

- "Invalid username or token" op `git push origin` = verlopen token; haal een vers token via de Replit GitHub-integratie (`listConnections('github')` → `settings.access_token`) en gebruik een GIT_ASKPASS-helper (username `x-access-token`). Token nooit printen; helperbestand na afloop verwijderen.
- **Why:** het opgeslagen credential in de remote-URL/credential-store veroudert; de integratie levert altijd een geldig kortlopend token.
- Bij divergentie tussen origin/main en lokaal: check eerst of de origin-only commits *tree-identiek* zijn aan lokale commits (`git rev-parse <sha>^{tree}` vergelijken met `git log --format='%h %T'`). GitHub-zijde merges van eerdere task-pushes hebben vaak identieke bomen → gewone merge is veilig (leeg diff), nooit force-push nodig.
- **How to apply:** vóór push altijd `git fetch` + tree-vergelijking; valideer lokaal eerst de exacte CI-stappen (typecheck, api-server build, firevault build met NODE_ENV=production PORT=3000 BASE_PATH=/); volg daarna de Actions-run via de GitHub API met hetzelfde token.
