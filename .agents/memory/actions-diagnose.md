---
name: GitHub Actions diagnose zonder loglezen
description: Hoe faalruns diagnosticeren als job-logs 403 geven via de connector
---
Job-logs downloaden via de GitHub-connector geeft 403 (redirect naar signed URL wordt geblokkeerd). Diagnose in plaats daarvan via:
1. `/actions/runs/:id/jobs` — per-step conclusion toont wáár het faalt.
2. `/commits/:sha/check-runs` → `/check-runs/:id/annotations` — bevat de foutregels.
**Let op:** "Set up job: failure" met 429 op action-download = GitHub-infra; gewoon `rerun-failed-jobs` (kan zelf ook 503 geven — retry).
**SMOKETEST_EMAIL/SMOKETEST_PASSWORD ontbraken als GitHub-secrets** (aug 2026) — deploy-smoketest skipt dan stil; scripts die ze eisen falen. Repo-beheerder moet ze aanmaken; check eerst /actions/secrets.
