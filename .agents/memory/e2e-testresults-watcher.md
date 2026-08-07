---
name: Metro crasht op verwijderde test-results map
description: Expo/Metro watcher crasht (ENOENT watch) als scripts/test-results wordt verwijderd; map permanent houden.
---
De expo dev-server (Metro/Node watcher) watcht ook `scripts/test-results`. Als Playwright-cleanup die map verwijdert terwijl expo draait, crasht expo met `ENOENT: no such file or directory, watch '.../scripts/test-results'` (exit 7) en faalt de e2e-menu run met ERR_HTTP_RESPONSE_CODE_FAILURE op het Expo-domein.

**Why:** trof e2e-validatie; leek op app/tunnelfout maar was een watcher-crash.
**How to apply:** houd `scripts/test-results/.gitkeep` in stand; bij "Exit status 7" van expo in e2e-logs eerst op deze ENOENT grep-en vóór code te verdenken.
